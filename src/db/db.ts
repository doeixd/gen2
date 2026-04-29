/* @__NO_SIDE_EFFECTS__ */
/**
 * Database plugin helpers and factory.
 *
 * Provides the {@link defineDbPlugin} function and {@link db} shorthand for
 * registering stores, tables, columns, and schemas via the plugin system.
 */
import { definePlugin, type Plugin, type Helper } from "../core/index.ts";
import type {
  Collection,
  Column,
  Keyspace,
  Store,
  StoreDialect,
  StoreSchema,
  Table,
} from "../storage/index.ts";
import type { Gen, GenConfig, NamespaceFactory } from "../gen.ts";
import type { GenContext } from "../core/index.ts";
import {
  buildSurface,
  type DocumentDialect,
  type KvDialect,
  type RelationalDialect,
  type SurfaceForDialect,
} from "./dialects.ts";

/**
 * Input configuration for a single database store.
 *
 * @example
 * ```ts
 * const storeInput: DbStoreInput = {
 *   dialect: "postgresql",
 *   version: "15",
 *   capabilities: ["jsonb"],
 * };
 * ```
 */
export interface DbStoreInput {
  readonly dialect: StoreDialect;
  readonly version?: string;
  readonly capabilities?: readonly string[];
}

/**
 * Input configuration for the database plugin.
 *
 * Defines the set of named stores and an optional default store.
 *
 * @example
 * ```ts
 * const pluginInput: DbPluginInput = {
 *   stores: {
 *     primary: { dialect: "postgresql" },
 *     cache: { dialect: "redis" },
 *   },
 *   default: "primary",
 * };
 * ```
 */
export interface DbPluginInput {
  readonly stores: Readonly<Record<string, DbStoreInput>>;
  readonly default?: string;
}

export interface StoreSurface {
  readonly store: Store;
  table: (name: string, columns: readonly Omit<Column, "owning_table">[]) => Table;
  column: (table: Table, input: Omit<Column, "owning_table">) => Column;
  schema: (input: {
    tables?: readonly Table[];
    collections?: readonly Collection[];
    keyspaces?: readonly Keyspace[];
  }) => StoreSchema;
  /**
   * Dialect-specific surface. The shape is determined by the store's declared
   * dialect — relational stores expose `relational`, document stores expose
   * `document`, key/value stores expose `kv`. Accessing the wrong one yields
   * a static type error.
   */
  readonly relational: SurfaceForDialect<RelationalDialect>;
  readonly document: SurfaceForDialect<DocumentDialect>;
  readonly kv: SurfaceForDialect<KvDialect>;
}

type SurfaceForStore<S extends DbStoreInput> = StoreSurface & {
  readonly relational: S["dialect"] extends RelationalDialect
    ? SurfaceForDialect<S["dialect"]>
    : never;
  readonly document: S["dialect"] extends DocumentDialect ? SurfaceForDialect<S["dialect"]> : never;
  readonly kv: S["dialect"] extends KvDialect ? SurfaceForDialect<S["dialect"]> : never;
};

type NamedStoreSurfaces<TStores extends Readonly<Record<string, DbStoreInput>>> = {
  readonly [K in keyof TStores]: SurfaceForStore<TStores[K]>;
};

type DefaultStoreAliases<TInput extends DbPluginInput> = TInput extends {
  default: infer _D extends keyof TInput["stores"];
}
  ? {
      readonly store: StoreSurface["store"];
      readonly table: StoreSurface["table"];
      readonly column: StoreSurface["column"];
      readonly schema: StoreSurface["schema"];
    }
  : {};

export type DbNamespace<TInput extends DbPluginInput = DbPluginInput> = NamedStoreSurfaces<
  TInput["stores"]
> &
  DefaultStoreAliases<TInput>;

export const createDbNamespace = <const TInput extends DbPluginInput>(
  ctx: GenContext,
  gen: Gen,
  input: TInput,
): DbNamespace<TInput> => {
  const namedStores = Object.fromEntries(
    Object.entries(input.stores).map(([name, config]) => {
      const existing = ctx.stores.find((store) => store.name === name);
      const store =
        existing ??
        gen.store({
          name,
          dialect: config.dialect,
          version: config.version,
          capabilities: config.capabilities,
        });
      const dialectSurface = buildSurface(config.dialect, store, {
        table: (s, tableName, columns) => gen.table(s, tableName, columns),
        schema: (s, schemaInput) => gen.schema(s, schemaInput),
      });
      const isRelational = !["mongo", "redis"].includes(String(config.dialect));
      const isDocument = config.dialect === "mongo";
      const isKv = config.dialect === "redis";
      const surface: StoreSurface = {
        store,
        table: (tableName, columns) => gen.table(store, tableName, columns),
        column: (table, column) => gen.column(table, column),
        schema: (schemaInput) => gen.schema(store, schemaInput),
        relational: (isRelational ? dialectSurface : undefined) as StoreSurface["relational"],
        document: (isDocument ? dialectSurface : undefined) as StoreSurface["document"],
        kv: (isKv ? dialectSurface : undefined) as StoreSurface["kv"],
      };
      return [name, surface];
    }),
  );

  const namespace: Record<string, unknown> = { ...namedStores };
  if (input.default) {
    const defaultStore = namedStores[input.default] as StoreSurface | undefined;
    if (defaultStore) {
      namespace.store = defaultStore.store;
      namespace.table = defaultStore.table;
      namespace.column = defaultStore.column;
      namespace.schema = defaultStore.schema;
    }
  }

  return namespace as DbNamespace<TInput>;
};

export const createDbNamespaceFactory: NamespaceFactory<
  DbNamespace<DbPluginInput>,
  DbPluginInput,
  GenConfig,
  Gen
> = createDbNamespace;

const makeDbHelpers = (input: DbPluginInput): readonly Helper[] => {
  let namespaceCache: Record<string, unknown> | null = null;

  const ensureNamespace = (args: { ctx: object; gen: object }): Record<string, unknown> => {
    if (namespaceCache) return namespaceCache;

    namespaceCache = createDbNamespace(args.ctx as GenContext, args.gen as Gen, input) as Record<
      string,
      unknown
    >;

    return namespaceCache;
  };

  const helpers: Helper[] = Object.keys(input.stores).map((name) => ({
    name,
    namespace: "db",
    materialize: (args) => ensureNamespace(args)[name],
  }));

  if (input.default) {
    helpers.push(
      {
        name: "store",
        namespace: "db",
        materialize: (args) => ensureNamespace(args).store,
      },
      {
        name: "table",
        namespace: "db",
        materialize: (args) => ensureNamespace(args).table,
      },
      {
        name: "column",
        namespace: "db",
        materialize: (args) => ensureNamespace(args).column,
      },
      {
        name: "schema",
        namespace: "db",
        materialize: (args) => ensureNamespace(args).schema,
      },
    );
  }

  return helpers;
};

/**
 * Creates a database plugin from the given store definitions.
 *
 * @param input - Configuration describing the stores to register.
 * @returns A {@link Plugin} that contributes helpers for each store.
 * @example
 * ```ts
 * const plugin = defineDbPlugin({
 *   stores: {
 *     main: { dialect: "postgresql" },
 *   },
 *   default: "main",
 * });
 * ```
 */
export const defineDbPlugin = <const TInput extends DbPluginInput>(
  input: TInput,
): Plugin<{ db: DbNamespace<TInput> }> =>
  definePlugin<{ db: DbNamespace<TInput> }>({
    id: "gen/db",
    namespace: "db-plugin",
    setup: () => ({
      stores: Object.keys(input.stores),
      helpers: makeDbHelpers(input),
    }),
  });

/**
 * Shorthand for {@link defineDbPlugin}. Creates a database plugin from the given input.
 *
 * @example
 * ```ts
 * const plugin = db({
 *   stores: { main: { dialect: "sqlite" } },
 * });
 * ```
 */
export const db = defineDbPlugin;
