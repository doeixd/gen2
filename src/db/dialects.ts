/* @__NO_SIDE_EFFECTS__ */
/**
 * Dialect-aware surface helpers for the DB plugin. Each storage dialect
 * exposes only the helpers that its physical model supports — relational
 * dialects get tables/columns/indexes, document dialects get
 * collections/fields, key/value dialects get keyspaces. The dialect → surface
 * mapping is type-driven, so `gen.db.cache.relational.table(...)` is rejected
 * statically when `cache` is declared as a redis store.
 */

import type {
  Collection,
  Column,
  DocumentField,
  Index,
  Keyspace,
  Store,
  StoreDialect,
  StoreSchema,
  Table,
} from "../storage/index.ts";
import type { SemanticType } from "../types/index.ts";

// --- Dialect classification -----------------------------------------------

export type RelationalDialect = "postgres" | "sqlite" | "mysql" | "clickhouse";
export type DocumentDialect = "mongo";
export type KvDialect = "redis";

/** The kind of physical surface a dialect exposes. */
export type DialectKind<D extends StoreDialect> = D extends RelationalDialect
  ? "relational"
  : D extends DocumentDialect
    ? "document"
    : D extends KvDialect
      ? "kv"
      : "relational";

// --- Typed column descriptors ---------------------------------------------

/**
 * Input for defining a relational column. The phantom `T` flows through
 * `semantic_type: SemanticType<T>` so the resulting `Column<T>` carries the
 * field's value type.
 */
export interface ColumnInput<T = unknown> {
  readonly physical_type: string;
  readonly semantic_type: SemanticType<T>;
  readonly nullable: boolean;
  readonly default_value?: string;
}

/** A table definition keyed by column name; values are typed `ColumnInput`. */
export type ColumnsRecord = Readonly<Record<string, ColumnInput>>;

/**
 * Project a `ColumnsRecord` into a record of `Column<T>` instances, preserving
 * each column's value type. Used as the `cols` accessor on typed tables so
 * `users.cols.id` is `Column<string>` when `id` is a `uuid()` semantic type.
 */
export type TypedColumns<C extends ColumnsRecord> = {
  readonly [K in keyof C]: C[K] extends ColumnInput<infer T> ? Column<T> : Column;
};

/**
 * A `Table` augmented with a typed column accessor. The base `columns: Column[]`
 * array is preserved for compatibility; `cols` is the typed object form.
 */
export type TypedTable<C extends ColumnsRecord = ColumnsRecord> = Table & {
  readonly cols: TypedColumns<C>;
};

// --- Document descriptors -------------------------------------------------

export interface DocumentFieldInput<T = unknown> {
  readonly physical_type: string;
  readonly semantic_type: SemanticType<T>;
}

export type DocumentFieldsRecord = Readonly<Record<string, DocumentFieldInput>>;

export type TypedDocumentFields<F extends DocumentFieldsRecord> = {
  readonly [K in keyof F]: DocumentField;
};

export type TypedCollection<F extends DocumentFieldsRecord = DocumentFieldsRecord> = Collection & {
  readonly fields_by_name: TypedDocumentFields<F>;
};

// --- Keyspace descriptor --------------------------------------------------

export interface KeyspaceInput {
  readonly key_type: string;
  readonly value_type: string;
}

// --- Per-dialect surfaces -------------------------------------------------

/** Helpers available on a relational store. */
export interface RelationalStoreSurface {
  readonly store: Store;
  readonly table: <C extends ColumnsRecord>(name: string, columns: C) => TypedTable<C>;
  readonly index: (
    table: Table,
    name: string,
    columns: readonly Column[],
    options?: { unique?: boolean },
  ) => Index;
  readonly schema: (input: { tables?: readonly Table[] }) => StoreSchema;
}

/** Helpers available on a document store. */
export interface DocumentStoreSurface {
  readonly store: Store;
  readonly collection: <F extends DocumentFieldsRecord>(
    name: string,
    fields: F,
  ) => TypedCollection<F>;
  readonly schema: (input: { collections?: readonly Collection[] }) => StoreSchema;
}

/** Helpers available on a key/value store. */
export interface KvStoreSurface {
  readonly store: Store;
  readonly keyspace: (name: string, input: KeyspaceInput) => Keyspace;
  readonly schema: (input: { keyspaces?: readonly Keyspace[] }) => StoreSchema;
}

/** Map a dialect to its surface type. */
export type SurfaceForDialect<D extends StoreDialect> =
  DialectKind<D> extends "relational"
    ? RelationalStoreSurface
    : DialectKind<D> extends "document"
      ? DocumentStoreSurface
      : DialectKind<D> extends "kv"
        ? KvStoreSurface
        : RelationalStoreSurface;

// --- Builders -------------------------------------------------------------

/**
 * Build a relational surface for a store. Tables created here carry a typed
 * `cols` accessor: `users.cols.id` resolves to `Column<string>` when `id` was
 * declared with `semantic_type: uuid()`.
 */
export const buildRelationalSurface = (
  store: Store,
  primitives: {
    table: (s: Store, name: string, cols: readonly Omit<Column, "owning_table">[]) => Table;
    schema: (
      s: Store,
      input: {
        tables?: readonly Table[];
        collections?: readonly Collection[];
        keyspaces?: readonly Keyspace[];
      },
    ) => StoreSchema;
  },
): RelationalStoreSurface => ({
  store,
  table: <C extends ColumnsRecord>(name: string, columnInputs: C): TypedTable<C> => {
    const columnList = Object.entries(columnInputs).map(([colName, input]) => ({
      name: colName,
      physical_type: input.physical_type,
      semantic_type: input.semantic_type,
      nullable: input.nullable,
      default_value: input.default_value,
    })) as readonly Omit<Column, "owning_table">[];
    const t = primitives.table(store, name, columnList);
    const cols = Object.fromEntries(
      t.columns.map((c) => [c.name, c]),
    ) as unknown as TypedColumns<C>;
    return Object.assign(t, { cols });
  },
  index: (table, name, columns, options = {}) => {
    const idx: Index = { name, owning_table: table, columns, unique: options.unique ?? false };
    table.indexes.push(idx);
    return idx;
  },
  schema: (input) => primitives.schema(store, { tables: input.tables }),
});

/**
 * Build a document surface for a store. Collections carry a typed
 * `fields_by_name` accessor.
 */
export const buildDocumentSurface = (
  store: Store,
  primitives: {
    schema: (
      s: Store,
      input: {
        tables?: readonly Table[];
        collections?: readonly Collection[];
        keyspaces?: readonly Keyspace[];
      },
    ) => StoreSchema;
  },
): DocumentStoreSurface => ({
  store,
  collection: <F extends DocumentFieldsRecord>(name: string, fields: F): TypedCollection<F> => {
    const collection: Collection = { name, store, fields: [] };
    for (const [fieldName, input] of Object.entries(fields)) {
      collection.fields.push({
        name: fieldName,
        owning_collection: collection,
        physical_type: input.physical_type,
        semantic_type: input.semantic_type,
      });
    }
    store.collections.push(collection);
    const fields_by_name = Object.fromEntries(
      collection.fields.map((f) => [f.name, f]),
    ) as unknown as TypedDocumentFields<F>;
    return Object.assign(collection, { fields_by_name });
  },
  schema: (input) => primitives.schema(store, { collections: input.collections }),
});

/** Build a key/value surface for a store. */
export const buildKvSurface = (
  store: Store,
  primitives: {
    schema: (
      s: Store,
      input: {
        tables?: readonly Table[];
        collections?: readonly Collection[];
        keyspaces?: readonly Keyspace[];
      },
    ) => StoreSchema;
  },
): KvStoreSurface => ({
  store,
  keyspace: (name, input) => {
    const ks: Keyspace = {
      name,
      store,
      key_type: input.key_type,
      value_type: input.value_type,
    };
    store.keyspaces.push(ks);
    return ks;
  },
  schema: (input) => primitives.schema(store, { keyspaces: input.keyspaces }),
});

/** Pick the correct surface builder for a dialect at runtime. */
export const buildSurface = (
  dialect: StoreDialect,
  store: Store,
  primitives: Parameters<typeof buildRelationalSurface>[1],
): RelationalStoreSurface | DocumentStoreSurface | KvStoreSurface => {
  if (dialect === "mongo") return buildDocumentSurface(store, primitives);
  if (dialect === "redis") return buildKvSurface(store, primitives);
  return buildRelationalSurface(store, primitives);
};
