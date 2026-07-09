/* @__NO_SIDE_EFFECTS__ */
/**
 * Entity and Field. Entities are identity-bearing domain records (User, Post, ...).
 * Each Field carries a SemanticType and ergonomic flags (nullable, optional, read_only).
 *
 * `gen.entity()` materializes an Entity plus FieldRefs, which are Refs of kind
 * "FieldRef" with owner = { kind: "Entity", name }. Other modules consume these
 * refs instead of stringly-typed field paths.
 *
 * See spec/entity.allium :: entity Entity, entity Field, entity DefaultValue.
 */

import {
  type Diagnostic,
  diagnostic,
  type EntityId,
  type EntityRef,
  type FieldId,
  type FieldRef,
  makeRef,
  type MetadataEntry,
  type Ref,
} from "../core/index.ts";
import type { AnyGraphStep } from "../kernel/index.ts";
import type { SemanticType, Trait, TypedExpression } from "../types/index.ts";
import { entityToGraphFragment } from "./kernel.ts";

/** Mutable builder variant of Entity used only during construction. */
type MutableEntity = {
  -readonly [K in keyof Entity]: K extends "fieldList"
    ? Field[]
    : K extends "fields"
      ? Record<string, Field>
      : Entity[K];
};

/**
 * Describes how a field's default value is sourced (literal, expression, or auto).
 *
 * @example
 * ```ts
 * const autoDefault: DefaultValue = { kind: "auto" };
 * const literalDefault: DefaultValue = { kind: "literal", value: "now()" };
 * ```
 */
export interface DefaultValue {
  /** Source category for the default value. */
  readonly kind: "literal" | "expression" | "auto";
  /** Raw literal value when `kind` is `"literal"`. */
  readonly value?: string;
  /** Typed expression when `kind` is `"expression"`. */
  readonly expression?: TypedExpression;
}

/**
 * Condition under which a field is considered present based on another field's values.
 *
 * @example
 * ```ts
 * const condition: FieldPresenceCondition = {
 *   field: statusField,
 *   allowed_values: ["active", "pending"],
 * };
 * ```
 */
export interface FieldPresenceCondition {
  /** The field whose value determines presence. */
  readonly field: Field;
  /** Set of values that cause the dependent field to be considered present. */
  readonly allowed_values: readonly string[];
}

/** Extract the TypeScript type from a Field. */
export type InferField<F extends Field> = F extends Field<infer Ts, any, any> ? Ts : never;

/** Extract the owner entity witness from a Field. */
export type InferFieldOwner<F extends Field> =
  F extends Field<any, infer Owner, any> ? Owner : never;

/** Extract the literal field name from a Field. */
export type InferFieldName<F extends Field> = F extends Field<any, any, infer Name> ? Name : never;

/**
 * Extract the TypeScript interface shape from an Entity.
 *
 * @example
 * ```ts
 * type UserShape = InferEntity<typeof User>;
 * // => { id: number; name: string; ... }
 * ```
 */
export type InferEntity<E extends Entity> = {
  [K in keyof E["fields"]]: E["fields"][K] extends Field<infer Ts, any, any> ? Ts : never;
};

/**
 * Infer Field<Ts> from a FieldShapeInput at the type level.
 *
 * @example
 * ```ts
 * type F1 = InferFieldFromInput<SemanticType<string>>; // Field<string>
 * type F2 = InferFieldFromInput<{ type: SemanticType<number> }>; // Field<number>
 * ```
 */
export type InferFieldFromInput<
  T,
  Owner extends Entity<any, any> = Entity,
  Name extends string = string,
> =
  T extends SemanticType<infer Ts>
    ? Field<Ts, Owner, Name>
    : T extends { type: SemanticType<infer Ts> }
      ? Field<Ts, Owner, Name>
      : Field<unknown, Owner, Name>;

/**
 * A named attribute of an Entity with type, constraints, and a typed Ref.
 *
 * @example
 * ```ts
 * const idField: Field<number> = {
 *   name: "id",
 *   owning_entity: User,
 *   semantic_type: intType,
 *   nullable: false,
 *   optional: false,
 *   read_only: true,
 *   traits: [],
 *   ref: idRef,
 * };
 * ```
 */
export interface Field<
  Ts = unknown,
  Owner extends Entity<any, any> = any,
  Name extends string = string,
> {
  /** Phantom type parameter linking this field to its TypeScript equivalent. */
  readonly _ts?: Ts;
  /** Human-readable name of the field (e.g., `"email"`). */
  readonly name: Name;
  /** Stable persisted identity for this field, when explicitly declared. */
  readonly id?: FieldId;
  /** The {@link Entity} that owns this field. */
  readonly owning_entity: Owner;
  /** Semantic type governing runtime behaviour and storage representation. */
  readonly semantic_type: SemanticType<Ts>;
  /** Whether the field may contain `null`. */
  readonly nullable: boolean;
  /** Whether the field may be omitted during creation. */
  readonly optional: boolean;
  /** Default value specification, if any. */
  readonly default_value?: DefaultValue;
  /** Whether the field is immutable after creation. */
  readonly read_only: boolean;
  /** Additional behavioural traits (e.g., searchable, sortable). */
  readonly traits: readonly Trait[];
  /** Presence condition that controls when this field is visible/required. */
  readonly present_when?: FieldPresenceCondition;
  /** Previous field names that share this field's stable identity. */
  readonly renamed_from: readonly string[];
  /** Target-specific physical/external name, distinct from semantic identity. */
  readonly external_name?: string;
  /** Auto-populated FieldRef for typed citation in expressions and queries. */
  readonly ref: FieldRef<Owner, Name, Ts>;
}

/**
 * A single allowed state transition within a transition graph.
 *
 * @example
 * ```ts
 * const draftToPublished: StateTransition = {
 *   from_state: "draft",
 *   to_state: "published",
 * };
 * ```
 */
export interface StateTransition {
  /** Source state name. */
  readonly from_state: string;
  /** Destination state name. */
  readonly to_state: string;
}

/**
 * Defines allowed state transitions and terminal states for an enum field.
 *
 * @example
 * ```ts
 * const postStatusTransitions: TransitionGraph = {
 *   target_field: statusField,
 *   transitions: [draftToPublished, publishedToArchived],
 *   terminal_states: ["archived"],
 * };
 * ```
 */
export interface TransitionGraph {
  /** The enum field whose values are being constrained. */
  readonly target_field: Field;
  /** All valid directed transitions between states. */
  readonly transitions: readonly StateTransition[];
  /** States that may not transition further. */
  readonly terminal_states: readonly string[];
}

/**
 * An identity-bearing domain record composed of Fields, metadata, and optional state transitions.
 *
 * @example
 * ```ts
 * const User = defineEntity("User", {
 *   id: intType,
 *   name: { type: stringType, nullable: false },
 * });
 * ```
 */
export interface Entity<
  Name extends string = string,
  Fields = Readonly<Record<string, Field<any, any, any>>>,
> {
  /** Stable persisted identity for this entity, when explicitly declared. */
  readonly id?: EntityId;
  /** Domain name of the entity (e.g., `"User"`, `"BlogPost"`). */
  readonly name: Name;
  /** Auto-populated EntityRef for typed citation and registry lookup. */
  readonly ref: EntityRef<Entity<Name, Fields>>;
  /**
   * Field lookup by name. Matches spec.md's `User.fields.id` user-facing API.
   * Treated as immutable after construction.
   */
  readonly fields: Fields;
  /** Field iteration order. Same Field instances as `fields`, in declaration order. */
  readonly fieldList: readonly Field<any, any, any>[];
  /** Optional backing store / table name override. */
  readonly store_name?: string;
  /** Arbitrary metadata entries attached at definition time. */
  readonly metadata: readonly MetadataEntry[];
  /** State-machine transition graphs governing enum fields. */
  readonly transitions: readonly TransitionGraph[];
  /** Composable graph fragment for the entity node, field nodes, and ownership/type edges. */
  readonly fragment?: AnyGraphStep;
}

// ---------------------------------------------------------------------------
// gen.entity() — the user-facing constructor.
// ---------------------------------------------------------------------------

/**
 * Input shape for defining a field, either a raw SemanticType or a detailed configuration object.
 *
 * @example
 * ```ts
 * const raw: FieldShapeInput = stringType;
 * const detailed: FieldShapeInput = { type: stringType, nullable: true, optional: true };
 * ```
 */
export type FieldShapeInput =
  | SemanticType
  | {
      type: SemanticType;
      nullable?: boolean;
      optional?: boolean;
      read_only?: boolean;
      default?: DefaultValue;
      traits?: readonly Trait[];
      id?: FieldId;
      renamedFrom?: readonly string[];
      external_name?: string;
    };

/** Record of field names to their input shapes. */
export type FieldsRecord = Readonly<Record<string, FieldShapeInput>>;

export type EntityFieldsFromInput<Name extends string, F extends FieldsRecord> = {
  readonly [K in keyof F]: InferFieldFromInput<
    F[K],
    Entity<Name, EntityFieldsFromInput<Name, F>>,
    K & string
  >;
};

export type EntityFromInput<Name extends string, F extends FieldsRecord> = Entity<
  Name,
  EntityFieldsFromInput<Name, F>
>;

export type FieldOf<E extends Entity> =
  E["fields"][keyof E["fields"]] extends Field<any, any, any>
    ? E["fields"][keyof E["fields"]]
    : Field;

export interface EntityDefinitionOptions {
  readonly id?: EntityId;
  readonly store_name?: string;
  readonly metadata?: readonly MetadataEntry[];
}

export type SemanticTypeEntityFactory<Types> = {
  <const Name extends string, const F extends FieldsRecord>(
    name: Name,
    fields: F,
    options?: EntityDefinitionOptions,
  ): EntityFromInput<Name, F>;
  <const Name extends string, const F extends FieldsRecord>(
    name: Name,
    fields: (types: Types) => F,
    options?: EntityDefinitionOptions,
  ): EntityFromInput<Name, F>;
  <const Name extends string>(
    name: Name,
  ): <const F extends FieldsRecord>(
    fields: F | ((types: Types) => F),
    options?: EntityDefinitionOptions,
  ) => EntityFromInput<Name, F>;
};

export type EntityClass<E extends Entity> = (abstract new () => E) & {
  readonly entity: E;
  readonly id: E["id"];
  readonly name: E["name"];
  readonly ref: E["ref"];
  readonly fields: E["fields"];
  readonly fieldList: E["fieldList"];
  readonly store_name: E["store_name"];
  readonly metadata: E["metadata"];
  readonly transitions: E["transitions"];
  readonly fragment: E["fragment"];
  readonly $infer: { readonly value: InferEntity<E> };
};

/**
 * Materializes an Entity. Fields are constructed with a back-reference to the
 * entity (via `owning_entity`), and a Ref of kind "FieldRef" is attached so
 * downstream consumers can use typed citations.
 *
 * @param name - The entity name.
 * @param fields - Record of field names to their shape inputs.
 * @param options - Optional store name and metadata.
 * @returns The constructed Entity with typed fields.
 *
 * @example
 * ```ts
 * const User = defineEntity("User", {
 *   id: intType,
 *   name: { type: stringType, nullable: false },
 * }, { store_name: "users" });
 * ```
 */
const defineEntityImpl = <const Name extends string, const F extends FieldsRecord>(
  name: Name,
  fields: F,
  options: EntityDefinitionOptions = {},
): EntityFromInput<Name, F> & { readonly fragment: AnyGraphStep } => {
  // Use a mutable builder so fields can reference the entity from the start
  // without post-hoc mutation.
  const entity: MutableEntity = {
    id: options.id,
    name,
    ref: makeRef<Entity>({
      kind: "EntityRef",
      id: options.id,
      owner: { kind: "Entity", name },
      name,
      value_type: "entity",
    }) as EntityRef<Entity>,
    fields: {},
    fieldList: [],
    store_name: options.store_name,
    metadata: options.metadata ?? [],
    transitions: [],
    get fragment() {
      return entityToGraphFragment(this as Entity);
    },
  };

  const fieldByName: Record<string, Field> = {};
  const fieldList: Field[] = [];
  for (const [fname, shape] of Object.entries(fields)) {
    const f = makeField(entity as Entity, fname, shape as FieldShapeInput);
    fieldByName[fname] = f;
    fieldList.push(f);
  }

  // Freeze the builder into the final shape.
  entity.fields = fieldByName;
  entity.fieldList = fieldList;

  // Cast: we know fieldByName matches the keys of F by construction.
  return entity as unknown as EntityFromInput<Name, F> & { readonly fragment: AnyGraphStep };
};

const entityClass = <const Name extends string, const F extends FieldsRecord>(
  name: Name,
  input: { readonly fields: F } & EntityDefinitionOptions,
): EntityClass<EntityFromInput<Name, F> & { readonly fragment: AnyGraphStep }> => {
  const entity = defineEntityImpl(name, input.fields, input);
  abstract class EntityFacade {}
  Object.defineProperties(EntityFacade, {
    entity: { value: entity },
    id: { value: entity.id },
    name: { value: entity.name },
    ref: { value: entity.ref },
    fields: { value: entity.fields },
    fieldList: { value: entity.fieldList },
    store_name: { value: entity.store_name },
    metadata: { value: entity.metadata },
    transitions: { value: entity.transitions },
    fragment: { get: () => entity.fragment },
    $infer: { value: undefined },
  });
  return EntityFacade as EntityClass<
    EntityFromInput<Name, F> & { readonly fragment: AnyGraphStep }
  >;
};

export const defineEntity = Object.assign(defineEntityImpl, {
  class: entityClass,
});

/**
 * Creates an entity factory scoped to a semantic type registry.
 *
 * This keeps field declarations close to the type vocabulary without losing
 * literal entity or field names.
 *
 * @example
 * ```ts
 * const entity = defineEntityUsingSemanticTypes(gen.types);
 * const User = entity("User", ({ uuid, string }) => ({
 *   id: uuid(),
 *   email: string(),
 * }));
 * ```
 */
export const defineEntityUsingSemanticTypes = <const Types>(
  types: Types,
): SemanticTypeEntityFactory<Types> => {
  const factory = <const Name extends string, const F extends FieldsRecord>(
    name: Name,
    fields?: F | ((types: Types) => F),
    options?: EntityDefinitionOptions,
  ) => {
    if (fields === undefined) {
      return (curriedFields: F | ((types: Types) => F), curriedOptions?: EntityDefinitionOptions) =>
        defineEntity(
          name,
          typeof curriedFields === "function" ? curriedFields(types) : curriedFields,
          curriedOptions,
        );
    }

    return defineEntity(name, typeof fields === "function" ? fields(types) : fields, options);
  };

  return factory as SemanticTypeEntityFactory<Types>;
};

function makeField<
  Ts = unknown,
  Owner extends Entity<any, any> = Entity,
  const Name extends string = string,
>(
  entity: Owner,
  name: Name,
  shape:
    | SemanticType<Ts>
    | {
        type: SemanticType<Ts>;
        nullable?: boolean;
        optional?: boolean;
        read_only?: boolean;
        default?: DefaultValue;
        traits?: readonly Trait[];
        id?: FieldId;
        renamedFrom?: readonly string[];
        external_name?: string;
      },
): Field<Ts, Owner, Name> {
  const shapeObj = shape as object;
  const opts =
    "type" in shapeObj
      ? (shape as {
          type: SemanticType<Ts>;
          nullable?: boolean;
          optional?: boolean;
          read_only?: boolean;
          default?: DefaultValue;
          traits?: readonly Trait[];
          id?: FieldId;
          renamedFrom?: readonly string[];
          external_name?: string;
        })
      : { type: shape as SemanticType<Ts> };
  const semantic_type = opts.type;
  const f: Field<Ts, Owner, Name> = {
    name,
    id: opts.id,
    owning_entity: entity,
    semantic_type,
    nullable: opts.nullable ?? false,
    optional: opts.optional ?? false,
    default_value: opts.default,
    read_only: opts.read_only ?? false,
    traits: opts.traits ?? [],
    renamed_from: opts.renamedFrom ?? [],
    external_name: opts.external_name,
    ref: makeRef<Ts>({
      kind: "FieldRef",
      id: opts.id,
      owner: { kind: "Entity", name: entity.name },
      name,
      value_type: semantic_type.name,
    }) as FieldRef<Owner, Name, Ts>,
  };
  return f;
}

// ---------------------------------------------------------------------------
// Helper entities used only as inputs to specific rules. These are NOT user-
// facing; they're materialized by other modules (api, mutator) when a create/
// update operation is being constructed.
// ---------------------------------------------------------------------------

/**
 * Helper entity describing a create operation for invariant checking.
 *
 * @example
 * ```ts
 * const createOp: CreateOperation = {
 *   name: "createUser",
 *   target_entity: User,
 *   input_fields: [User.fields.name, User.fields.email],
 * };
 * ```
 */
export interface CreateOperation {
  /** Operation identifier. */
  readonly name: string;
  /** The entity being created. */
  readonly target_entity: Entity;
  /** Fields supplied as input to the create operation. */
  readonly input_fields: readonly Field[];
}

/**
 * Helper entity describing an update operation for invariant checking.
 *
 * @example
 * ```ts
 * const updateOp: UpdateOperation = {
 *   name: "updateUser",
 *   target_entity: User,
 *   input_fields: [User.fields.name],
 * };
 * ```
 */
export interface UpdateOperation {
  /** Operation identifier. */
  readonly name: string;
  /** The entity being updated. */
  readonly target_entity: Entity;
  /** Fields supplied as input to the update operation. */
  readonly input_fields: readonly Field[];
}

/**
 * Helper entity for the FieldFromWrongEntity rule. Renamed from FieldMapping
 * to avoid collision with storage/FieldMapping. Created when something attempts
 * to bind a field to a target entity (e.g., a relation or projection) so the
 * rule can verify ownership.
 *
 * @example
 * ```ts
 * const check: FieldOwnershipCheck = {
 *   target_entity: Post,
 *   field: User.fields.id,
 * };
 * ```
 */
export interface FieldOwnershipCheck {
  /** The entity the field is expected to belong to. */
  readonly target_entity: Entity;
  /** The field whose ownership is being verified. */
  readonly field: Field;
}

// ---------------------------------------------------------------------------
// Invariants and rules (pure functions returning diagnostics).
// ---------------------------------------------------------------------------

/**
 * Checks entity-level invariants: unique entity names, unique field names within each entity,
 * and valid state transitions.
 *
 * @param entities - List of entities to validate.
 * @returns Diagnostics for any violated invariants.
 *
 * @example
 * ```ts
 * const diagnostics = checkEntityInvariants([User, Post]);
 * ```
 */
export const checkEntityInvariants = (entities: readonly Entity[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // EntityNameUnique
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      if (entities[i]!.name === entities[j]!.name) {
        out.push(
          diagnostic({
            severity: "error",
            code: "entity:duplicate-name",
            message: `Two entities share the name ${entities[i]!.name}`,
          }),
        );
      }
    }
  }

  // FieldNamesUniqueWithinEntity
  for (const e of entities) {
    const seen = new Set<string>();
    for (const f of e.fieldList) {
      if (seen.has(f.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "entity:duplicate-field",
            message: `Entity ${e.name} has duplicate field ${f.name}`,
            refs: [f.ref],
          }),
        );
      }
      seen.add(f.name);
    }
  }

  // TransitionGraphOnEnumField
  for (const e of entities) {
    for (const tg of e.transitions) {
      if (tg.target_field.semantic_type.kind !== "enum") {
        out.push(
          diagnostic({
            severity: "error",
            code: "entity:transition-on-non-enum",
            message: `Transition graph on field ${tg.target_field.name} which is not an enum`,
            refs: [tg.target_field.ref],
          }),
        );
        continue;
      }
      const enumValues = tg.target_field.semantic_type.enum_values ?? [];

      // TransitionStatesValid
      for (const t of tg.transitions) {
        if (!enumValues.includes(t.from_state)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "entity:invalid-transition-state",
              message: `Transition references invalid from_state ${t.from_state}`,
            }),
          );
        }
        if (!enumValues.includes(t.to_state)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "entity:invalid-transition-state",
              message: `Transition references invalid to_state ${t.to_state}`,
            }),
          );
        }
      }
      // TerminalStatesReachable
      for (const ts of tg.terminal_states) {
        if (!enumValues.includes(ts)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "entity:invalid-terminal-state",
              message: `Terminal state ${ts} not in enum values for ${tg.target_field.name}`,
            }),
          );
        }
      }

      // SelfTransition
      for (const t of tg.transitions) {
        if (t.from_state === t.to_state) {
          out.push(
            diagnostic({
              severity: "warning",
              code: "entity:self-transition",
              message: `Self-transition on state ${t.from_state} in ${tg.target_field.name}`,
            }),
          );
        }
      }

      // TerminalStateOutgoing
      for (const ts of tg.terminal_states) {
        if (tg.transitions.some((t) => t.from_state === ts)) {
          out.push(
            diagnostic({
              severity: "warning",
              code: "entity:terminal-state-outgoing",
              message: `Terminal state ${ts} has outgoing transitions in ${tg.target_field.name}`,
            }),
          );
        }
      }
    }
  }

  return out;
};

/**
 * NonexistentFieldRef rule: a Ref of kind FieldRef must resolve to an existing
 * (entity, field) pair.
 *
 * @param refs - Refs to validate.
 * @param entities - Available entities for resolution.
 * @returns Diagnostics for any nonexistent field references.
 *
 * @example
 * ```ts
 * const diagnostics = checkRefsExist([someRef], [User, Post]);
 * ```
 */
export const checkRefsExist = (
  refs: readonly Ref[],
  entities: readonly Entity[],
): readonly Diagnostic[] => {
  const byEntity = new Map<string, Set<string>>();
  for (const e of entities) {
    byEntity.set(e.name, new Set(e.fieldList.map((f) => f.name)));
  }
  const out: Diagnostic[] = [];
  for (const r of refs) {
    if (r.kind !== "FieldRef") continue;
    const fieldNames = byEntity.get(r.owner.name);
    if (!fieldNames || !fieldNames.has(r.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "entity:nonexistent-field",
          message: `Field reference ${r.owner.name}.${r.name} does not exist`,
          refs: [r],
        }),
      );
    }
  }
  return out;
};

/**
 * FieldFromWrongEntity rule: a FieldOwnershipCheck must have a field whose
 * owning_entity matches its target_entity.
 *
 * @param checks - Ownership checks to validate.
 * @returns Diagnostics for any mismatched field ownership.
 *
 * @example
 * ```ts
 * const diagnostics = checkFieldOwnership([{ target_entity: Post, field: User.fields.id }]);
 * ```
 */
export const checkFieldOwnership = (
  checks: readonly FieldOwnershipCheck[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const c of checks) {
    if (c.field.owning_entity.name !== c.target_entity.name) {
      out.push(
        diagnostic({
          severity: "error",
          code: "entity:wrong-entity-field",
          message: `Field ${c.field.name} belongs to entity ${c.field.owning_entity.name} but mapping targets ${c.target_entity.name}`,
          refs: [c.field.ref],
        }),
      );
    }
  }
  return out;
};

/**
 * ReadOnlyFieldInCreateInput / ReadOnlyFieldInUpdateInput.
 * Read-only fields cannot appear in mutator inputs.
 *
 * @param ops - Operations to validate.
 * @param context - Whether the operation is a create or update.
 * @returns Diagnostics for any read-only fields found in inputs.
 *
 * @example
 * ```ts
 * const diagnostics = checkReadOnlyInInput([createOp], "create");
 * ```
 */
export const checkReadOnlyInInput = (
  ops: readonly { name: string; input_fields: readonly Field[] }[],
  context: "create" | "update",
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const op of ops) {
    for (const f of op.input_fields) {
      if (f.read_only) {
        out.push(
          diagnostic({
            severity: "error",
            code: `entity:readonly-field-in-${context}`,
            message: `Read-only field ${f.name} cannot appear in ${context} input`,
            refs: [f.ref],
          }),
        );
      }
    }
  }
  return out;
};
