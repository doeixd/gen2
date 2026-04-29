/* @__NO_SIDE_EFFECTS__ */
/**
 * Storage IR. Stores, tables, columns, collections, keyspaces, indexes, and
 * the mapping that ties Field ↔ Column together. The mapping captures both the
 * read source (where to read this field from) and the write target (where to
 * write it back); they may differ for derived fields.
 *
 * See spec/storage.allium :: entity Store, entity Table, entity Column,
 * entity Mapping, entity FieldMapping, value MappingSource, value MappingTarget.
 */

import { type Diagnostic, diagnostic, type TargetInput, makeTargetInput } from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";
import type { SemanticType } from "../types/index.ts";

/**
 * Supported storage dialect identifier.
 *
 * @example
 * ```ts
 * const dialect: StoreDialect = "postgres";
 * ```
 */
export type StoreDialect =
  | "postgres"
  | "sqlite"
  | "mongo"
  | "redis"
  | "clickhouse"
  | (string & { _storeDialect?: never });

/**
 * A physical storage system containing tables, collections, and keyspaces.
 */
export interface Store {
  /** Human-readable name of the store. */
  readonly name: string;
  /** Storage dialect used by this store. */
  readonly dialect: StoreDialect;
  /** Schema or API version string. */
  readonly version: string;
  /** Capability flags advertised by the store. */
  readonly capabilities: readonly string[];
  /** Relational tables contained in the store. */
  readonly tables: Table[];
  /** Document collections contained in the store. */
  readonly collections: Collection[];
  /** Key-value keyspaces contained in the store. */
  readonly keyspaces: Keyspace[];
}

/**
 * A relational table within a Store.
 */
export interface Table {
  /** Name of the table. */
  readonly name: string;
  /** Store that owns this table. */
  readonly store: Store;
  /** Columns defined on the table. */
  readonly columns: Column[];
  /** Indexes defined on the table. */
  readonly indexes: Index[];
}

/**
 * A column within a Table with physical and semantic types.
 *
 * The phantom type parameter `T` mirrors the semantic type's TypeScript value
 * so that `buildColumnSource(emailCol)` and `Field<string>` can be checked for
 * compatibility statically.
 */
export interface Column<T = unknown> {
  /** Phantom type parameter linking this column to its TypeScript equivalent. */
  readonly _ts?: T;
  /** Name of the column. */
  readonly name: string;
  /** Table that owns this column. */
  readonly owning_table: Table;
  /** Native physical type name (e.g., "varchar", "int8"). */
  readonly physical_type: string;
  /** Semantic type used for code generation and validation. */
  readonly semantic_type: SemanticType<T>;
  /** Whether the column allows NULL values. */
  readonly nullable: boolean;
  /** Optional SQL default value expression. */
  readonly default_value?: string;
}

/**
 * A document collection within a Store.
 */
export interface Collection {
  /** Name of the collection. */
  readonly name: string;
  /** Store that owns this collection. */
  readonly store: Store;
  /** Fields defined on the document collection. */
  readonly fields: DocumentField[];
}

/**
 * A field within a document Collection.
 */
export interface DocumentField {
  /** Name of the field. */
  readonly name: string;
  /** Collection that owns this field. */
  readonly owning_collection: Collection;
  /** Native physical type name. */
  readonly physical_type: string;
  /** Semantic type used for code generation and validation. */
  readonly semantic_type: SemanticType;
}

/**
 * A key-value keyspace within a Store.
 */
export interface Keyspace {
  /** Name of the keyspace. */
  readonly name: string;
  /** Store that owns this keyspace. */
  readonly store: Store;
  /** Physical type of keys. */
  readonly key_type: string;
  /** Physical type of values. */
  readonly value_type: string;
}

/**
 * A database index on one or more columns.
 */
export interface Index {
  /** Name of the index. */
  readonly name: string;
  /** Table that owns this index. */
  readonly owning_table: Table;
  /** Columns included in the index. */
  readonly columns: readonly Column[];
  /** Whether the index enforces uniqueness. */
  readonly unique: boolean;
}

/**
 * Categorizes the kind of mapping source.
 *
 * - `column`     — direct read from a physical column
 * - `expression` — SQL/dialect expression evaluated at read time
 * - `query`      — value sourced from a subquery / query-backed field
 * - `aggregate`  — value computed via an aggregation expression
 * - `service`    — value fetched from an external service call
 * - `hidden`     — field is intentionally not readable
 * - `read_only`  — field has no write target by design
 */
export type MappingSourceKind =
  | "column"
  | "expression"
  | "query"
  | "aggregate"
  | "service"
  | "hidden"
  | "read_only";

/** Describes a value pulled from a service call rather than a column. */
export interface ServiceCallDescriptor {
  /** Name of the service endpoint or namespace. */
  readonly name: string;
  /** Method or operation invoked on the service. */
  readonly method: string;
  /** Optional argument descriptors (e.g. field paths supplied as inputs). */
  readonly args?: readonly string[];
}

/** Describes an aggregation expression contributing to a mapping source. */
export interface AggregateDescriptor {
  /** Aggregate function name (sum, count, avg, ...). */
  readonly fn: string;
  /** Inner expression aggregated over. */
  readonly expression: string;
  /** Optional GROUP BY clauses or partition keys. */
  readonly group_by?: readonly string[];
}

/**
 * Describes where to read a field's value from.
 *
 * The phantom type parameter `T` flows from the source's `semantic_type` so
 * that `fieldMapping({ field: User.fields.email, read_source: ... })` can
 * statically reject sources that disagree with the field's value type.
 */
export interface MappingSource<T = unknown> {
  /** Phantom type parameter linking this source to its TypeScript equivalent. */
  readonly _ts?: T;
  /** Discriminator indicating the source kind. */
  readonly kind: MappingSourceKind;
  /** Semantic type of the value produced by this source. */
  readonly semantic_type: SemanticType<T>;
  /** Physical column when kind is "column". */
  readonly column?: Column<T>;
  /** SQL expression when kind is "expression". */
  readonly expression?: string;
  /** Columns this source depends on. */
  readonly dependencies?: readonly Column[];
  /** Other entity fields this source depends on (cross-entity derivations). */
  readonly field_dependencies?: readonly Field[];
  /** Subquery string when kind is "query". */
  readonly query?: string;
  /** Aggregation descriptor when kind is "aggregate". */
  readonly aggregate?: AggregateDescriptor;
  /** Service call descriptor when kind is "service". */
  readonly service?: ServiceCallDescriptor;
}

/**
 * Categorizes the kind of mapping target.
 *
 * - `column`     — direct write to a physical column
 * - `expression` — write through a dialect-specific expression
 * - `computed`   — value derived from other fields, no direct write target
 * - `service`    — write delegated to an external service call
 */
export type MappingTargetKind = "column" | "expression" | "computed" | "service";

/**
 * Describes where to write a field's value to.
 *
 * The phantom type parameter `T` mirrors the field's TypeScript value so the
 * write side of a mapping is type-checked against the source side at the call
 * site rather than waiting for `checkMappings`.
 */
export interface MappingTarget<T = unknown> {
  /** Phantom type parameter linking this target to its TypeScript equivalent. */
  readonly _ts?: T;
  /** Discriminator indicating the target kind. */
  readonly kind: MappingTargetKind;
  /** Physical column when kind is "column". */
  readonly column?: Column<T>;
  /** SQL expression when kind is "expression". */
  readonly expression?: string;
  /** Expression used to derive the value for computed targets. */
  readonly derived_expression?: string;
  /** Columns this target depends on. */
  readonly dependencies?: readonly Column[];
  /** Other entity fields this target depends on. */
  readonly field_dependencies?: readonly Field[];
  /** Service call descriptor when kind is "service". */
  readonly service?: ServiceCallDescriptor;
}

/**
 * Describes a reversible transformation between stored representation and
 * semantic value. `forward` runs at read time, `reverse` at write time.
 *
 * If `reverse` is omitted, the mapping is non-invertible and may only be used
 * for read paths. The phantom type parameter `T` ties the transform to a
 * specific value type so that attaching a `Date ↔ string` transform to a
 * `number` field is rejected statically.
 */
export interface ReversibleTransform<T = unknown> {
  /** Phantom type parameter linking this transform to its TypeScript equivalent. */
  readonly _ts?: T;
  /** Expression evaluated at read time: stored value → semantic value. */
  readonly forward: string;
  /** Expression evaluated at write time: semantic value → stored value. */
  readonly reverse?: string;
  /** True when both directions are defined and round-trip safely. */
  readonly bidirectional: boolean;
}

/**
 * Links a Field to its read source and write target, with compatibility flags.
 *
 * The phantom type parameter `T` carries the field's TypeScript value through
 * source, target, and transform so that all three statically agree.
 */
export interface FieldMapping<T = unknown> {
  /** Phantom type parameter linking this mapping to its TypeScript equivalent. */
  readonly _ts?: T;
  /** The entity field being mapped. */
  readonly field: Field<T>;
  /** Source to read the field value from. */
  readonly read_source?: MappingSource<T>;
  /** Target to write the field value to. */
  readonly write_target?: MappingTarget<T>;
  /** Whether the field type is compatible with the mapping source. */
  readonly type_compatible: boolean;
  /** Whether the field is read-only. */
  readonly read_only: boolean;
  /** Optional reversible transform tying read and write paths together. */
  readonly transform?: ReversibleTransform<T>;
}

/**
 * Aggregated field mappings for a target entity.
 */
export interface Mapping {
  /** The entity whose fields are mapped. */
  readonly target_entity: Entity;
  /** Individual field mappings. */
  readonly field_mappings: readonly FieldMapping[];
}

/**
 * A subset of fields selected from a Mapping.
 */
export interface Projection {
  /** The source mapping. */
  readonly mapping: Mapping;
  /** Fields included in the projection. */
  readonly fields: readonly Field[];
}

/**
 * A store-scoped schema artifact grouping physical structures for a target.
 */
export interface StoreSchema {
  /** Store that this schema belongs to. */
  readonly store: Store;
  /** Tables in the schema. */
  readonly tables: readonly Table[];
  /** Collections in the schema. */
  readonly collections: readonly Collection[];
  /** Keyspaces in the schema. */
  readonly keyspaces: readonly Keyspace[];
}

// --- Constructors ----------------------------------------------------------

/**
 * Creates a Store record.
 *
 * @param input - Store properties including name, dialect, version, and capabilities.
 * @returns A Store record.
 * @example
 * ```ts
 * const store = defineStore({ name: "MainDB", dialect: "postgres" });
 * ```
 */
export const defineStore = (input: {
  name: string;
  dialect: StoreDialect;
  version?: string;
  capabilities?: readonly string[];
}): Store => ({
  name: input.name,
  dialect: input.dialect,
  version: input.version ?? "0",
  capabilities: input.capabilities ?? [],
  tables: [],
  collections: [],
  keyspaces: [],
});

/**
 * Creates a Table, attaches columns, and registers it on the Store.
 *
 * @param store - The parent Store.
 * @param name - Table name.
 * @param columns - Column definitions (without owning_table back-reference).
 * @returns The created Table.
 * @example
 * ```ts
 * const table = defineTable(store, "users", [
 *   { name: "id", physical_type: "uuid", semantic_type: gen.types.uuid, nullable: false },
 * ]);
 * ```
 */
export const defineTable = (
  store: Store,
  name: string,
  columns: readonly Omit<Column, "owning_table">[],
): Table => {
  const table: Table = {
    name,
    store,
    columns: [],
    indexes: [],
  };
  const ownedColumns = columns.map((c) => ({ ...c, owning_table: table })) as Column[];
  (table as { columns: Column[] }).columns = ownedColumns;
  return table;
};

/**
 * Creates a Column and appends it to the given Table.
 *
 * @param table - The parent Table.
 * @param input - Column properties (without owning_table back-reference).
 * @returns The created Column.
 * @example
 * ```ts
 * const col = defineColumn(table, {
 *   name: "email",
 *   physical_type: "varchar",
 *   semantic_type: gen.types.string,
 *   nullable: false,
 * });
 * ```
 */
export const defineColumn = <T = unknown>(
  table: Table,
  input: Omit<Column<T>, "owning_table">,
): Column<T> => ({ ...input, owning_table: table });

const inferTypeCompat = (field: Field, source?: MappingSource): boolean =>
  source ? field.semantic_type.name === source.semantic_type.name : true;

/**
 * Creates a FieldMapping with inferred type compatibility.
 *
 * @param input - Mapping properties including field, read source, write target, and read-only flag.
 * @returns A FieldMapping record.
 * @example
 * ```ts
 * const fm = fieldMapping({
 *   field: User.fields.email,
 *   read_source: { kind: "column", column: emailCol, semantic_type: gen.types.string },
 * });
 * ```
 */
export const fieldMapping = <T = unknown>(input: {
  field: Field<T>;
  read_source?: MappingSource<T>;
  write_target?: MappingTarget<T>;
  read_only?: boolean;
}): FieldMapping<T> => ({
  field: input.field,
  read_source: input.read_source,
  write_target: input.write_target,
  type_compatible: inferTypeCompat(input.field, input.read_source),
  read_only: input.read_only ?? false,
});

/**
 * Creates a Mapping for a target entity.
 *
 * @param target_entity - The entity being mapped.
 * @param field_mappings - List of field mappings.
 * @returns A Mapping record.
 * @example
 * ```ts
 * const mapping = defineMapping(User, [emailMapping, idMapping]);
 * ```
 */
export const defineMapping = (
  target_entity: Entity,
  field_mappings: readonly FieldMapping[],
): Mapping => ({ target_entity, field_mappings });

/**
 * Creates a Projection by selecting a subset of fields from a Mapping.
 *
 * @param mapping - The source mapping.
 * @param fields - The projected fields.
 * @returns A Projection record.
 */
export const defineProjection = (mapping: Mapping, fields: readonly Field[]): Projection => ({
  mapping,
  fields,
});

/**
 * Creates a store-scoped schema record.
 *
 * @param store - The owning store.
 * @param input - Schema members for that store.
 * @returns A StoreSchema record.
 */
export const defineSchema = (
  store: Store,
  input: {
    tables?: readonly Table[];
    collections?: readonly Collection[];
    keyspaces?: readonly Keyspace[];
  },
): StoreSchema => ({
  store,
  tables: input.tables ?? [],
  collections: input.collections ?? [],
  keyspaces: input.keyspaces ?? [],
});

/**
 * Creates a target input record for a store schema artifact.
 *
 * @param schema - The schema to expose as a generation input.
 * @param name - Optional target input name.
 * @returns A TargetInput of kind `schema`.
 */
export const schemaTargetInput = (
  schema: StoreSchema,
  name = `${schema.store.name}Schema`,
): TargetInput =>
  makeTargetInput({
    name,
    kind: "schema",
    value: schema,
  });

// --- Invariants and rules --------------------------------------------------

const KNOWN_DIALECTS = new Set<string>(["postgres", "sqlite", "mongo", "redis", "clickhouse"]);

/**
 * Validates storage invariants: unique column names within tables and known dialects.
 *
 * @param stores - Stores to validate.
 * @param pluginContributedDialects - Additional dialects contributed by plugins.
 * @returns Diagnostics for any violated invariants.
 */
export const checkStorageInvariants = (
  stores: readonly Store[],
  pluginContributedDialects: readonly string[] = [],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const knownAndContributed = new Set<string>([...KNOWN_DIALECTS, ...pluginContributedDialects]);

  // ColumnNamesUniqueWithinTable
  for (const s of stores) {
    for (const t of s.tables) {
      const seen = new Set<string>();
      for (const c of t.columns) {
        if (seen.has(c.name)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "storage:duplicate-column",
              message: `Table ${t.name} has duplicate column ${c.name}`,
            }),
          );
        }
        seen.add(c.name);
      }
    }
  }

  // UnknownStoreDialect (warning)
  for (const s of stores) {
    if (!knownAndContributed.has(s.dialect)) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "storage:unknown-dialect",
          message: `Store ${s.name} uses dialect ${s.dialect} not provided by core or any registered plugin`,
        }),
      );
    }
  }

  return out;
};

/**
 * Validates field mappings: type compatibility and read-only field constraints.
 *
 * @param mappings - Mappings to validate.
 * @returns Diagnostics for any violated mapping rules.
 */
export const checkMappings = (mappings: readonly Mapping[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // MappingTypeMismatch rule
  for (const m of mappings) {
    for (const fm of m.field_mappings) {
      if (fm.read_source && !fm.type_compatible) {
        out.push(
          diagnostic({
            severity: "error",
            code: "mapping:incompatible-field-column",
            message: `Field ${fm.field.name} and mapping source have incompatible types`,
            refs: [fm.field.ref],
          }),
        );
      }
      // ReadOnlyFieldMappedWritable rule
      if (fm.read_only && fm.write_target) {
        out.push(
          diagnostic({
            severity: "error",
            code: "mapping:readonly-field-writable",
            message: `Read-only field ${fm.field.name} has a write mapping`,
            refs: [fm.field.ref],
          }),
        );
      }
    }
  }

  return out;
};

// --- Mapping builders ------------------------------------------------------

/**
 * Creates a FieldMapping for a single field with read and/or write targets.
 *
 * @param field - The entity field being mapped.
 * @param options - Optional read source, write target, and read_only flag.
 * @returns A FieldMapping record.
 */
export const mapField = <T = unknown>(
  field: Field<T>,
  options: {
    read?: MappingSource<T>;
    write?: MappingTarget<T>;
    read_only?: boolean;
  } = {},
): FieldMapping<T> =>
  fieldMapping<T>({
    field,
    read_source: options.read,
    write_target: options.write,
    read_only: options.read_only ?? false,
  });

const NEVER_SEMANTIC_TYPE: SemanticType = {
  name: "never",
  kind: "json",
  ts_type_name: "never",
  storage_repr: { name: "never", kind: { kind: "document" }, fixed: false, metadata: [] },
  has_serializer: false,
  has_deserializer: false,
  server_only: false,
  traits: [],
};

const neverSemanticType = (): SemanticType => NEVER_SEMANTIC_TYPE;

/**
 * Creates a read-only MappingSource whose semantic type is `never`.
 *
 * @returns A MappingSource marked as `read_only`.
 */
export const readOnlySource = (): MappingSource => ({
  kind: "read_only",
  semantic_type: neverSemanticType(),
});

/**
 * Creates a hidden MappingSource whose semantic type is `never`.
 *
 * @returns A MappingSource marked as `hidden`.
 */
export const hiddenSource = (): MappingSource => ({
  kind: "hidden",
  semantic_type: neverSemanticType(),
});

// --- Rich source builders --------------------------------------------------

/** Creates a MappingSource backed by a physical column. The source carries the column's value type. */
export const buildColumnSource = <T>(column: Column<T>): MappingSource<T> => ({
  kind: "column",
  semantic_type: column.semantic_type,
  column,
  dependencies: [column],
});

/** Creates a MappingSource computed from a SQL/dialect expression. */
export const buildExpressionSource = <T = unknown>(input: {
  semantic_type: SemanticType<T>;
  expression: string;
  dependencies?: readonly Column[];
  field_dependencies?: readonly Field[];
}): MappingSource<T> => ({
  kind: "expression",
  semantic_type: input.semantic_type,
  expression: input.expression,
  dependencies: input.dependencies,
  field_dependencies: input.field_dependencies,
});

/** Creates a MappingSource sourced from a subquery / query-backed field. */
export const buildQueryBackedSource = <T = unknown>(input: {
  semantic_type: SemanticType<T>;
  query: string;
  dependencies?: readonly Column[];
  field_dependencies?: readonly Field[];
}): MappingSource<T> => ({
  kind: "query",
  semantic_type: input.semantic_type,
  query: input.query,
  dependencies: input.dependencies,
  field_dependencies: input.field_dependencies,
});

/** Creates a MappingSource backed by an aggregation expression. */
export const buildAggregateSource = <T = unknown>(input: {
  semantic_type: SemanticType<T>;
  fn: string;
  expression: string;
  group_by?: readonly string[];
  dependencies?: readonly Column[];
  field_dependencies?: readonly Field[];
}): MappingSource<T> => ({
  kind: "aggregate",
  semantic_type: input.semantic_type,
  aggregate: { fn: input.fn, expression: input.expression, group_by: input.group_by },
  dependencies: input.dependencies,
  field_dependencies: input.field_dependencies,
});

/** Creates a MappingSource fetched via an external service call. */
export const buildServiceCallSource = <T = unknown>(input: {
  semantic_type: SemanticType<T>;
  service: string;
  method: string;
  args?: readonly string[];
  field_dependencies?: readonly Field[];
}): MappingSource<T> => ({
  kind: "service",
  semantic_type: input.semantic_type,
  service: { name: input.service, method: input.method, args: input.args },
  field_dependencies: input.field_dependencies,
});

// --- Rich target builders --------------------------------------------------

/** Creates a MappingTarget that writes directly to a physical column. */
export const buildColumnTarget = <T>(column: Column<T>): MappingTarget<T> => ({
  kind: "column",
  column,
  dependencies: [column],
});

/** Creates a MappingTarget that writes through a SQL/dialect expression. */
export const buildExpressionTarget = <T = unknown>(input: {
  expression: string;
  dependencies?: readonly Column[];
  field_dependencies?: readonly Field[];
}): MappingTarget<T> => ({
  kind: "expression",
  expression: input.expression,
  dependencies: input.dependencies,
  field_dependencies: input.field_dependencies,
});

/** Creates a MappingTarget for a derived/computed value with no direct write. */
export const buildComputedTarget = <T = unknown>(input: {
  derived_expression: string;
  dependencies?: readonly Column[];
  field_dependencies?: readonly Field[];
}): MappingTarget<T> => ({
  kind: "computed",
  derived_expression: input.derived_expression,
  dependencies: input.dependencies,
  field_dependencies: input.field_dependencies,
});

/** Creates a MappingTarget that writes through an external service call. */
export const buildServiceCallTarget = <T = unknown>(input: {
  service: string;
  method: string;
  args?: readonly string[];
  field_dependencies?: readonly Field[];
}): MappingTarget<T> => ({
  kind: "service",
  service: { name: input.service, method: input.method, args: input.args },
  field_dependencies: input.field_dependencies,
});

// --- Reversible transform helpers ------------------------------------------

/** Creates a one-directional transform usable on read paths only. */
export const oneWayTransform = <T = unknown>(forward: string): ReversibleTransform<T> => ({
  forward,
  bidirectional: false,
});

/** Creates a bidirectional, round-trip-safe transform. */
export const bidirectionalTransform = <T = unknown>(input: {
  forward: string;
  reverse: string;
}): ReversibleTransform<T> => ({
  forward: input.forward,
  reverse: input.reverse,
  bidirectional: true,
});

// --- High-level mapping builders -------------------------------------------

/**
 * A mapping spec entry: a field belonging to entity `E` paired with a read
 * source whose value type matches the field's. The shape is stated loosely
 * here — strict per-row enforcement happens via {@link EnforceReadFieldSpec}
 * inside the high-level builders so that arrays don't widen to a permissive
 * union.
 */
export interface ReadFieldSpec<E extends Entity = Entity> {
  readonly field: E["fields"][keyof E["fields"]];
  readonly source: MappingSource;
}

/** A mapping spec entry: a field of `E` paired with a typed write target. */
export interface WriteFieldSpec<E extends Entity = Entity> {
  readonly field: E["fields"][keyof E["fields"]];
  readonly target: MappingTarget;
}

/** A mapping spec entry covering both read and write paths for a single field of `E`. */
export interface MixedFieldSpec<E extends Entity = Entity> {
  readonly field: E["fields"][keyof E["fields"]];
  readonly source?: MappingSource;
  readonly target?: MappingTarget;
  readonly transform?: ReversibleTransform;
  readonly read_only?: boolean;
}

/** Spec for a single reversibly-mapped field of `E`. */
export interface ReversibleFieldSpec<E extends Entity = Entity> {
  readonly field: E["fields"][keyof E["fields"]];
  readonly source: MappingSource;
  readonly target: MappingTarget;
  readonly transform: ReversibleTransform;
}

/**
 * Per-row enforcement helper: for a candidate spec `S`, check that the field's
 * value type and the source's value type unify. When they do not, the helper
 * resolves to a `{ source: never }` shape so the literal fails to assign.
 *
 * Used in builder signatures via `readonly [K in keyof Specs]: EnforceReadFieldSpec<Specs[K]>`,
 * which forces TypeScript to re-check each array element instead of widening
 * the array's element type to a permissive union.
 */
export type EnforceReadFieldSpec<S> = S extends {
  readonly field: Field<infer FT>;
  readonly source: MappingSource<infer ST>;
}
  ? [FT] extends [ST]
    ? [ST] extends [FT]
      ? S
      : { readonly field: Field<FT>; readonly source: MappingSource<FT> }
    : { readonly field: Field<FT>; readonly source: MappingSource<FT> }
  : S;

/** Per-row enforcement for write specs. */
export type EnforceWriteFieldSpec<S> = S extends {
  readonly field: Field<infer FT>;
  readonly target: MappingTarget<infer TT>;
}
  ? [FT] extends [TT]
    ? [TT] extends [FT]
      ? S
      : { readonly field: Field<FT>; readonly target: MappingTarget<FT> }
    : { readonly field: Field<FT>; readonly target: MappingTarget<FT> }
  : S;

/** Internal: assert that two types unify in both directions. */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Per-row enforcement for mixed specs. Checks each present property
 * (source, target, transform) against the field's value type independently so
 * that omitting any one of them does not bypass the check on the others.
 */
export type EnforceMixedFieldSpec<S> = S extends { readonly field: Field<infer FT> }
  ? CheckMixedSource<S, FT>
  : S;

type CheckMixedSource<S, FT> = S extends { readonly source: MappingSource<infer ST> }
  ? Equal<ST, FT> extends true
    ? CheckMixedTarget<S, FT>
    : never
  : CheckMixedTarget<S, FT>;

type CheckMixedTarget<S, FT> = S extends { readonly target: MappingTarget<infer TT> }
  ? Equal<TT, FT> extends true
    ? CheckMixedTransform<S, FT>
    : never
  : CheckMixedTransform<S, FT>;

type CheckMixedTransform<S, FT> = S extends {
  readonly transform: ReversibleTransform<infer XT>;
}
  ? Equal<XT, FT> extends true
    ? S
    : never
  : S;

/** Per-row enforcement for reversible specs. */
export type EnforceReversibleFieldSpec<S> = S extends {
  readonly field: Field<infer FT>;
  readonly source: MappingSource<infer ST>;
  readonly target: MappingTarget<infer TT>;
  readonly transform: ReversibleTransform<infer XT>;
}
  ? [ST] extends [FT]
    ? [TT] extends [FT]
      ? [XT] extends [FT]
        ? S
        : never
      : never
    : never
  : S;

/**
 * Build a read-only mapping for an entity. Every field has a read source but no
 * write target; `read_only` is implied. Field/source value-types are enforced
 * at every row by `EnforceReadFieldSpec`, so a `Field<string>` paired with a
 * `MappingSource<number>` fails to type-check at the call site.
 */
export const readMapping = <E extends Entity, Specs extends readonly ReadFieldSpec<E>[]>(
  target_entity: E,
  fields: Specs & {
    readonly [K in keyof Specs]: EnforceReadFieldSpec<Specs[K]>;
  },
): Mapping =>
  defineMapping(
    target_entity,
    (fields as readonly ReadFieldSpec<E>[]).map((f) =>
      fieldMapping({ field: f.field, read_source: f.source, read_only: true }),
    ),
  );

/**
 * Build a write-only mapping for an entity. Every field has a write target but
 * no read source — useful for command-only adapters.
 */
export const writeMapping = <E extends Entity, Specs extends readonly WriteFieldSpec<E>[]>(
  target_entity: E,
  fields: Specs & {
    readonly [K in keyof Specs]: EnforceWriteFieldSpec<Specs[K]>;
  },
): Mapping =>
  defineMapping(
    target_entity,
    (fields as readonly WriteFieldSpec<E>[]).map((f) =>
      fieldMapping({ field: f.field, write_target: f.target }),
    ),
  );

/**
 * Build a mapping that combines read and write paths per field. Fields may be
 * read-only, write-only, or both; reversible transforms can be attached.
 */
export const mixedMapping = <E extends Entity, Specs extends readonly MixedFieldSpec<E>[]>(
  target_entity: E,
  fields: Specs & {
    readonly [K in keyof Specs]: EnforceMixedFieldSpec<Specs[K]>;
  },
): Mapping =>
  defineMapping(
    target_entity,
    (fields as readonly MixedFieldSpec<E>[]).map((f) => {
      const fm = fieldMapping({
        field: f.field,
        read_source: f.source,
        write_target: f.target,
        read_only: f.read_only ?? false,
      });
      return f.transform ? { ...fm, transform: f.transform } : fm;
    }),
  );

/**
 * Build a mapping where every field uses a reversible transform between its
 * read source and write target. Use `checkReversibleMappings` to validate
 * `bidirectional` invariants at lifecycle time.
 */
export const reversibleMapping = <
  E extends Entity,
  Specs extends readonly ReversibleFieldSpec<E>[],
>(
  target_entity: E,
  fields: Specs & {
    readonly [K in keyof Specs]: EnforceReversibleFieldSpec<Specs[K]>;
  },
): Mapping =>
  defineMapping(
    target_entity,
    (fields as readonly ReversibleFieldSpec<E>[]).map((f) => ({
      ...fieldMapping({ field: f.field, read_source: f.source, write_target: f.target }),
      transform: f.transform,
    })),
  );

// --- Dependency tracking ---------------------------------------------------

/**
 * Collect every column referenced by the source or target of a single mapping.
 * Useful for migration analysis and invalidation tracking.
 */
export const mappingColumnDependencies = (mapping: Mapping): readonly Column[] => {
  const seen = new Set<Column>();
  for (const fm of mapping.field_mappings) {
    for (const c of fm.read_source?.dependencies ?? []) seen.add(c);
    for (const c of fm.write_target?.dependencies ?? []) seen.add(c);
    if (fm.read_source?.column) seen.add(fm.read_source.column);
    if (fm.write_target?.column) seen.add(fm.write_target.column);
  }
  return [...seen];
};

/** Collect every entity field referenced as a derivation dependency. */
export const mappingFieldDependencies = (mapping: Mapping): readonly Field[] => {
  const seen = new Set<Field>();
  for (const fm of mapping.field_mappings) {
    for (const f of fm.read_source?.field_dependencies ?? []) seen.add(f);
    for (const f of fm.write_target?.field_dependencies ?? []) seen.add(f);
  }
  return [...seen];
};

/**
 * Validate reversible-mapping invariants:
 * - any transform marked `bidirectional` must define `reverse`
 * - reversible mappings should have both read and write paths defined
 */
export const checkReversibleMappings = (mappings: readonly Mapping[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const m of mappings) {
    for (const fm of m.field_mappings) {
      const t = fm.transform;
      if (!t) continue;
      if (t.bidirectional && t.reverse == null) {
        out.push(
          diagnostic({
            severity: "error",
            code: "mapping:bidirectional-missing-reverse",
            message: `Field ${fm.field.name} declares a bidirectional transform without a reverse expression`,
            refs: [fm.field.ref],
          }),
        );
      }
      if (t.bidirectional && (!fm.read_source || !fm.write_target)) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "mapping:bidirectional-incomplete-paths",
            message: `Field ${fm.field.name} has a bidirectional transform but lacks ${
              !fm.read_source ? "a read source" : "a write target"
            }`,
            refs: [fm.field.ref],
          }),
        );
      }
    }
  }
  return out;
};

// --- Namespace builder ------------------------------------------------------

/** Configuration options for the storage namespace. Plugins extend via declaration merging. */
export interface StorageConfig {
  /** Target storage dialect. */
  readonly dialect?: StoreDialect;
}

/** The user-facing storage namespace shape. */
export interface StorageNamespace<D extends StoreDialect = StoreDialect> {
  readonly _config?: StorageConfig & { dialect: D };
  readonly store: typeof defineStore;
  readonly table: typeof defineTable;
  readonly column: typeof defineColumn;
  readonly mapping: typeof defineMapping;
  readonly projection: typeof defineProjection;
  readonly schema: typeof defineSchema;
  readonly schemaInput: typeof schemaTargetInput;
  readonly fieldMapping: typeof fieldMapping;
  readonly mapField: typeof mapField;
  readonly readOnlySource: typeof readOnlySource;
  readonly hiddenSource: typeof hiddenSource;
  // Rich source builders
  readonly buildColumnSource: typeof buildColumnSource;
  readonly buildExpressionSource: typeof buildExpressionSource;
  readonly buildQueryBackedSource: typeof buildQueryBackedSource;
  readonly buildAggregateSource: typeof buildAggregateSource;
  readonly buildServiceCallSource: typeof buildServiceCallSource;
  readonly buildColumnTarget: typeof buildColumnTarget;
  readonly buildExpressionTarget: typeof buildExpressionTarget;
  readonly buildComputedTarget: typeof buildComputedTarget;
  readonly buildServiceCallTarget: typeof buildServiceCallTarget;
  // Reversible transforms
  readonly oneWayTransform: typeof oneWayTransform;
  readonly bidirectionalTransform: typeof bidirectionalTransform;
  // High-level mapping builders
  readonly readMapping: typeof readMapping;
  readonly writeMapping: typeof writeMapping;
  readonly mixedMapping: typeof mixedMapping;
  readonly reversibleMapping: typeof reversibleMapping;
}

/**
 * Builds a typed storage namespace with optional dialect-specific configuration.
 *
 * @param config - Storage backend configuration.
 * @returns A StorageNamespace bound to the given dialect.
 */
export const createStorageNamespace = <D extends StoreDialect = StoreDialect>(
  config?: StorageConfig & { dialect?: D },
): StorageNamespace<D> => ({
  _config: config as StorageConfig & { dialect: D },
  store: defineStore,
  table: defineTable,
  column: defineColumn,
  mapping: defineMapping,
  projection: defineProjection,
  schema: defineSchema,
  schemaInput: schemaTargetInput,
  fieldMapping,
  mapField,
  readOnlySource,
  hiddenSource,
  buildColumnSource,
  buildExpressionSource,
  buildQueryBackedSource,
  buildAggregateSource,
  buildServiceCallSource,
  buildColumnTarget,
  buildExpressionTarget,
  buildComputedTarget,
  buildServiceCallTarget,
  oneWayTransform,
  bidirectionalTransform,
  readMapping,
  writeMapping,
  mixedMapping,
  reversibleMapping,
});
