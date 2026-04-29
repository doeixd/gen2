/* @__NO_SIDE_EFFECTS__ */
/**
 * CRUD auto-derivation. Given an Entity, `deriveCrud` produces five standard
 * functions — getById, list, create, update, delete — as real typed
 * `QueryFunction` and `ActionFunction` instances. These participate in the
 * normal lifecycle checks, reactivity derivation, and code generation just
 * like hand-authored functions.
 *
 * `Crud<Out>` carries the projection / return type through the bundle so that
 * downstream consumers (forms, editors, reactivity targets) know the shape of
 * the data without re-inferring it from the entity.
 *
 * See spec/atom.txt (lines 3460-4445) for the full design rationale.
 */

import { type Diagnostic, diagnostic, entityToSemanticType } from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";
import { buildExpr, buildPredicate, fieldRef, paramPlaceholder } from "../expression/index.ts";
import { opCallNode } from "../expression/ast.ts";
import {
  buildQuery,
  buildAggregateProjection,
  buildQueryProjection,
  type QueryExpression,
} from "../query/index.ts";
import {
  buildActionDelete,
  buildActionInsert,
  buildActionUpdate,
  defineActionFunction,
  defineQueryFunction,
  type ActionFunction,
  type QueryFunction,
} from "../function/index.ts";
import { boolean, int, object } from "../types/semantic.ts";
import { aggregateOp, comparisonOp } from "../types/operation.ts";
import type { SemanticType } from "../types/index.ts";
import type { Mapping } from "../storage/index.ts";
import type { KeyFamily, ReactiveKeyPattern } from "../reactivity/index.ts";
import type { Policy } from "../authz/index.ts";
import {
  defineAccessSurfaceBinding,
  entityRead,
  entityCreate,
  entityUpdate,
  entityDelete,
  fieldRead,
  fieldWrite,
} from "../authz/index.ts";
import type { AccessSurfaceBinding } from "../authz/index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A bundle of auto-derived CRUD functions for a single entity.
 *
 * @typeParam Out - The projection / return type shared by all five functions.
 *
 * @example
 * ```ts
 * const userCrud = deriveCrud(User);
 * userCrud.getById // QueryFunction<unknown, Out>
 * userCrud.create  // ActionFunction<unknown, Out>
 * ```
 */
export interface Crud<Out = unknown> {
  /** The entity these CRUD functions operate on. */
  readonly entity: Entity;
  /** Retrieve a single record by its identifier. */
  readonly getById: QueryFunction<unknown, Out>;
  /** List all records (no filtering by default). */
  readonly list: QueryFunction<unknown, Out>;
  /** Count records matching a predicate. */
  readonly count?: QueryFunction<unknown, number>;
  /** Check if any record exists matching a predicate. */
  readonly exists?: QueryFunction<unknown, boolean>;
  /** Insert a new record. */
  readonly create: ActionFunction<unknown, Out>;
  /** Update an existing record by identifier. */
  readonly update: ActionFunction<unknown, Out>;
  /** Remove a record by identifier. */
  readonly delete: ActionFunction<unknown, Out>;
}

/**
 * Options controlling how `deriveCrud` builds the five standard functions.
 *
 * @typeParam Out - The projection / return type for list and detail queries.
 */
export interface DeriveCrudOptions<Out = unknown, E extends Entity = Entity> {
  /** Explicit identifier field (defaults to `entity.fields.id` if present). */
  readonly idField?: Field;
  /** Which fields to include in create/update inputs (defaults to all non-read-only). */
  readonly include?: readonly Field[];
  /** Which fields to exclude from create/update inputs (applied after `include`). */
  readonly exclude?: readonly Field[];
  /** Return type/shape for `list` (defaults to the entity itself). */
  readonly listProjection?: Entity | SemanticType<Out>;
  /** Return type/shape for `getById`, `create`, `update` (defaults to entity). */
  readonly detailProjection?: Entity | SemanticType<Out>;
  /** Optional mapping to derive writable inputs from (respects hidden/server-only/read-only mapping constraints). */
  readonly mapping?: Mapping;
  /** Optional key family for `getById` reactivity. */
  readonly getByIdKey?: KeyFamily;
  /** Optional key family for `list` reactivity. */
  readonly listKey?: KeyFamily;
  /** Optional invalidation patterns for create/update/delete actions. */
  readonly invalidates?: readonly ReactiveKeyPattern[];
  /** Optional access surface bindings for entity-level and field-level surfaces. */
  readonly access?: CrudAccessOptions<E>;
}

/** Per-operation and per-field access policies for CRUD auto-derivation. */
export interface CrudAccessOptions<E extends Entity = Entity> {
  readonly read?: Policy<E>;
  readonly create?: Policy<E>;
  readonly update?: Policy<E>;
  readonly delete?: Policy<E>;
  readonly fields?: {
    readonly [K in keyof E["fields"]]?: { read?: Policy<E>; write?: Policy<E> };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Picks the identifier field for CRUD operations.
 * Prefers `options.idField`, then `entity.fields.id`, then the first field.
 */
const pickIdField = <Out = unknown>(entity: Entity, options?: DeriveCrudOptions<Out>): Field => {
  if (options?.idField) return options.idField;
  const id = entity.fields["id"];
  if (id) return id;
  return entity.fieldList[0]!;
};

/**
 * Derives writable input fields from an entity and optional mapping.
 * Filters out non-writable, hidden, server-only, and read-only fields.
 *
 * @param entity - The target entity.
 * @param mapping - Optional mapping to respect write constraints from.
 * @returns Fields that are safe to include in create/update inputs.
 */
export const deriveWritableInput = (entity: Entity, mapping?: Mapping): Field[] => {
  if (!mapping) {
    return entity.fieldList.filter((f) => !f.read_only && !f.semantic_type.server_only);
  }
  const fieldMap = new Map(mapping.field_mappings.map((fm) => [fm.field.name, fm]));
  return entity.fieldList.filter((f) => {
    const fm = fieldMap.get(f.name);
    if (!fm) return false; // unmapped fields are not writable
    if (fm.read_only) return false;
    if (fm.read_source?.kind === "hidden") return false;
    if (f.semantic_type.server_only) return false;
    return true;
  });
};

/**
 * Fields eligible for create/update input: non-read-only, not auto-generated,
 * respecting `include` / `exclude` overrides and optional mapping constraints.
 */
const pickWritableFields = <Out = unknown>(
  entity: Entity,
  options?: DeriveCrudOptions<Out>,
): Field[] => {
  const base = options?.mapping
    ? deriveWritableInput(entity, options.mapping)
    : options?.include
      ? [...options.include]
      : entity.fieldList.filter((f) => !f.read_only);
  const excludeNames = new Set(options?.exclude?.map((f) => f.name) ?? []);
  return base.filter((f) => !excludeNames.has(f.name));
};

/**
 * Builds a typed `eq(field, input.<name>)` predicate for use in query/action
 * conditions.
 */
const buildEqPredicate = (
  entity: Entity,
  field: Field,
): import("../expression/index.ts").Predicate => {
  const eqOp = comparisonOp({
    name: "eq",
    operand_type: field.semantic_type,
    output_type: boolean(),
  });
  const left = fieldRef(field, "query");
  const right = paramPlaceholder(field.semantic_type, field.name, "query");
  const cmpExpr = buildExpr({
    value_type: boolean(),
    phase: "query",
    ast: opCallNode(eqOp, [left.ast, right.ast]),
    kind: "op_call",
  });
  return buildPredicate({
    input_type: entity,
    value_type: boolean(),
    ast: cmpExpr.ast,
    kind: "comparison",
  });
};

/**
 * Builds a struct SemanticType from a list of fields.
 */
const buildInputType = (fields: Field[]): SemanticType =>
  object(Object.fromEntries(fields.map((f) => [f.name, f.semantic_type])));

/**
 * Expands a {@link CrudAccessOptions} record into typed access-surface bindings
 * for an entity. Uses default deny behaviors per surface.
 *
 * @param access - The CRUD access options.
 * @param entity - The target entity.
 * @returns An array of access-surface bindings.
 */
export const expandAccessToSurfaces = <E extends Entity = Entity>(
  access: CrudAccessOptions<E>,
  entity: E,
): AccessSurfaceBinding[] => {
  const bindings: AccessSurfaceBinding[] = [];
  if (access.read) {
    bindings.push(defineAccessSurfaceBinding({ surface: entityRead(entity), policy: access.read }));
  }
  if (access.create) {
    bindings.push(
      defineAccessSurfaceBinding({ surface: entityCreate(entity), policy: access.create }),
    );
  }
  if (access.update) {
    bindings.push(
      defineAccessSurfaceBinding({ surface: entityUpdate(entity), policy: access.update }),
    );
  }
  if (access.delete) {
    bindings.push(
      defineAccessSurfaceBinding({ surface: entityDelete(entity), policy: access.delete }),
    );
  }
  for (const [fieldName, fieldAccess] of Object.entries(access.fields ?? {})) {
    if (!fieldAccess) continue;
    const field = entity.fields[fieldName];
    if (!field) continue;
    if (fieldAccess.read) {
      bindings.push(
        defineAccessSurfaceBinding({ surface: fieldRead(entity, field), policy: fieldAccess.read }),
      );
    }
    if (fieldAccess.write) {
      bindings.push(
        defineAccessSurfaceBinding({
          surface: fieldWrite(entity, field),
          policy: fieldAccess.write,
        }),
      );
    }
  }
  return bindings;
};

// ---------------------------------------------------------------------------
// Derive
// ---------------------------------------------------------------------------

/**
 * Auto-derives the five standard CRUD functions for an entity.
 *
 * @typeParam Out - The projection / return type shared by all five functions.
 * @param entity - The target entity.
 * @param options - Optional overrides for id field, inclusions, exclusions, and projections.
 * @returns A {@link Crud} bundle containing typed `QueryFunction` and `ActionFunction` records.
 *
 * @example
 * ```ts
 * const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
 * const userCrud = deriveCrud(User);
 * // userCrud.getById, userCrud.list, userCrud.create, userCrud.update, userCrud.delete
 * ```
 */
export const deriveCrud = <Out = unknown, E extends Entity = Entity>(
  entity: E,
  options?: DeriveCrudOptions<Out, E>,
): Crud<Out> => {
  const idField = pickIdField(entity, options);
  const writable = pickWritableFields(entity, options);
  const detailProjection = options?.detailProjection ?? entity;
  const listProjection = options?.listProjection ?? entity;

  // --- getById ---
  const getByIdInput = object({ [idField.name]: idField.semantic_type });
  const getByIdQuery: QueryExpression = buildQuery({
    source: { kind: "entity_source", entity },
    result_type: entityToSemanticType(listProjection),
    predicate: buildEqPredicate(entity, idField),
  });
  const getById = defineQueryFunction<unknown, Out>({
    name: `${entity.name}.getById`,
    input_type: getByIdInput,
    input_fields: [idField],
    returns: detailProjection,
    body: getByIdQuery,
    reactivity: options?.getByIdKey ? { key: options.getByIdKey as KeyFamily } : undefined,
  });

  // --- list ---
  const listQuery: QueryExpression = buildQuery({
    source: { kind: "entity_source", entity },
    result_type: entityToSemanticType(listProjection),
  });
  const list = defineQueryFunction<unknown, Out>({
    name: `${entity.name}.list`,
    input_type: entity,
    returns: listProjection,
    body: listQuery,
    reactivity: options?.listKey ? { key: options.listKey as KeyFamily } : undefined,
  });

  // --- count ---
  const countOp = aggregateOp({
    name: "count",
    input_type: idField.semantic_type,
    output_type: int(),
  });
  const countQuery: QueryExpression = buildQuery({
    source: { kind: "entity_source", entity },
    result_type: int(),
    projection: buildQueryProjection([], [buildAggregateProjection(countOp, idField, "count")]),
  });
  const count = defineQueryFunction<unknown, number>({
    name: `${entity.name}.count`,
    input_type: entity,
    returns: int(),
    body: countQuery,
  });

  // --- exists ---
  const existsQuery: QueryExpression = buildQuery({
    source: { kind: "entity_source", entity },
    result_type: boolean(),
    predicate: buildEqPredicate(entity, idField),
    projection: buildQueryProjection([{ field: idField, alias: "id" }]),
  });
  const exists = defineQueryFunction<unknown, boolean>({
    name: `${entity.name}.exists`,
    input_type: getByIdInput,
    input_fields: [idField],
    returns: boolean(),
    body: existsQuery,
  });

  // --- create ---
  const createInputType = buildInputType(writable);
  const createFieldMappings: readonly [Field, import("../expression/index.ts").Expr][] =
    writable.map((f) => [f, paramPlaceholder(f.semantic_type, f.name, "mutation")]);
  const create = defineActionFunction<unknown, Out>({
    name: `${entity.name}.create`,
    input_type: createInputType,
    input_fields: writable,
    returns: detailProjection,
    body: buildActionInsert(entity, createFieldMappings),
    reactivity: options?.invalidates
      ? { invalidates: options.invalidates as ReactiveKeyPattern[] }
      : undefined,
  });

  // --- update ---
  const updateFields = writable.filter((f) => f !== idField);
  const updateInputFields = [idField, ...updateFields];
  const updateInputType = buildInputType(updateInputFields);
  const updateFieldMappings: readonly [Field, import("../expression/index.ts").Expr][] =
    updateFields.map((f) => [f, paramPlaceholder(f.semantic_type, f.name, "mutation")]);
  const update = defineActionFunction<unknown, Out>({
    name: `${entity.name}.update`,
    input_type: updateInputType,
    input_fields: updateInputFields,
    returns: detailProjection,
    body: buildActionUpdate(entity, updateFieldMappings, buildEqPredicate(entity, idField)),
    reactivity: options?.invalidates
      ? { invalidates: options.invalidates as ReactiveKeyPattern[] }
      : undefined,
  });

  // --- delete ---
  const deleteInputType = object({ [idField.name]: idField.semantic_type });
  const deleteFn = defineActionFunction<unknown, Out>({
    name: `${entity.name}.delete`,
    input_type: deleteInputType,
    input_fields: [idField],
    returns: detailProjection,
    body: buildActionDelete(entity, buildEqPredicate(entity, idField)),
    reactivity: options?.invalidates
      ? { invalidates: options.invalidates as ReactiveKeyPattern[] }
      : undefined,
  });

  return {
    entity,
    getById,
    list,
    count,
    exists,
    create,
    update,
    delete: deleteFn,
  };
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Checks CRUD bundles for consistency: entity registration, id field presence,
 * and function naming collisions.
 *
 * @param cruds - CRUD bundles to validate.
 * @param entities - All registered entities (for membership checks).
 * @param query_functions - All registered query functions (for collision checks).
 * @param action_functions - All registered action functions (for collision checks).
 * @returns Diagnostics for any violated CRUD rules.
 */
export const checkCrud = (
  cruds: readonly Crud<unknown>[],
  entities: readonly Entity[],
  query_functions: readonly QueryFunction[],
  action_functions: readonly ActionFunction[],
  mappings?: readonly Mapping[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const entityNames = new Set(entities.map((e) => e.name));
  const mappingByEntity = new Map((mappings ?? []).map((m) => [m.target_entity.name, m]));

  // Count occurrences of each query/action name to detect collisions.
  const queryNameCounts = new Map<string, number>();
  for (const q of query_functions) {
    queryNameCounts.set(q.name, (queryNameCounts.get(q.name) ?? 0) + 1);
  }
  const actionNameCounts = new Map<string, number>();
  for (const a of action_functions) {
    actionNameCounts.set(a.name, (actionNameCounts.get(a.name) ?? 0) + 1);
  }

  for (const crud of cruds) {
    // Entity must be registered
    if (!entityNames.has(crud.entity.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "crud:entity-unregistered",
          message: `CRUD for unregistered entity: ${crud.entity.name}`,
        }),
      );
    }

    // Id field must belong to the entity
    const entityFieldNames = new Set(crud.entity.fieldList.map((f) => f.name));
    const idField = crud.getById.input_fields[0];
    if (idField && !entityFieldNames.has(idField.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "crud:id-field-not-in-entity",
          message: `CRUD id field ${idField.name} is not a field of ${crud.entity.name}`,
          refs: [idField.ref],
        }),
      );
    }

    // Function name collisions
    for (const fn of [crud.getById, crud.list]) {
      if ((queryNameCounts.get(fn.name) ?? 0) > 1) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "crud:query-name-collision",
            message: `CRUD query name collision: ${fn.name}`,
          }),
        );
      }
    }

    for (const fn of [crud.create, crud.update, crud.delete]) {
      if ((actionNameCounts.get(fn.name) ?? 0) > 1) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "crud:action-name-collision",
            message: `CRUD action name collision: ${fn.name}`,
          }),
        );
      }
    }

    // create/update input fields must be writable (not read-only, not server-only)
    for (const fn of [crud.create, crud.update]) {
      for (const f of fn.input_fields) {
        if (f.read_only) {
          out.push(
            diagnostic({
              severity: "error",
              code: "crud:read-only-input-field",
              message: `CRUD ${fn.name} includes read-only field ${f.name}`,
              refs: [f.ref],
            }),
          );
        }
        if (f.semantic_type.server_only) {
          out.push(
            diagnostic({
              severity: "error",
              code: "crud:server-only-field-exposed",
              message: `CRUD ${fn.name} exposes server-only field ${f.name}`,
              refs: [f.ref],
            }),
          );
        }
      }
    }

    // Mapping-aware diagnostics
    const mapping = mappingByEntity.get(crud.entity.name);
    if (mapping) {
      const fieldMap = new Map(mapping.field_mappings.map((fm) => [fm.field.name, fm]));
      for (const fn of [crud.create, crud.update]) {
        for (const f of fn.input_fields) {
          const fm = fieldMap.get(f.name);
          if (!fm) continue;

          if (fm.read_source?.kind === "hidden") {
            out.push(
              diagnostic({
                severity: "error",
                code: "crud:hidden-field-exposed",
                message: `CRUD ${fn.name} exposes hidden field ${f.name}`,
                refs: [f.ref],
              }),
            );
          }
          if (fm.read_source?.kind === "read_only") {
            out.push(
              diagnostic({
                severity: "error",
                code: "crud:field-not-writable",
                message: `CRUD ${fn.name} includes field ${f.name} with read-only mapping source`,
                refs: [f.ref],
              }),
            );
          }
        }
      }
    }
  }

  return out;
};
