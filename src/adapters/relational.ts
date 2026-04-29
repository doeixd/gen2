/* @__NO_SIDE_EFFECTS__ */
/**
 * Relational schema adapter — emits SQL DDL (CREATE TABLE statements) per store.
 * Dialect-aware for postgres, sqlite, and mysql; falls back to ANSI-ish SQL.
 *
 * Usage:
 * ```ts
 * import { createGen, lifecycle } from "gen2";
 * import { defineRelationalAdapter } from "gen2/adapters/relational";
 *
 * const { ctx, gen } = createGen({ plugins: [defineRelationalAdapter()] });
 * const store = gen.store({ name: "main", dialect: "postgres" });
 * gen.table(store, "users", [...]);
 * gen.adapters.relational.fromStore(store);
 * const result = lifecycle.generate(ctx);
 * // result.artifacts[0].path === "sql/main.sql"
 * ```
 */

import {
  acceptTargetInput,
  definePlugin,
  type Helper,
  makeArtifact,
  makeTargetInput,
  type Plugin,
  type GenContext,
  type Artifact,
  type TargetInput,
  type Target,
} from "../core/index.ts";
import type { Store, Table, Column, StoreDialect } from "../storage/index.ts";

const TARGET_NAME = "relational:store";
const INPUT_KIND = "store";

export interface RelationalAdapterOptions {
  readonly outDir?: string;
}

export interface RelationalAdapterNamespace {
  /** Schedule a single store's tables for SQL DDL emission. */
  readonly fromStore: (store: Store) => void;
  /** Schedule every relational store registered in the project. */
  readonly fromAllStores: () => void;
}

const quoteIdent = (name: string, dialect: StoreDialect): string => {
  if (dialect === "mysql") return `\`${name}\``;
  return `"${name}"`;
};

/**
 * Escapes a SQL literal value for use in DDL DEFAULT clauses.
 * This prevents SQL injection when column default values contain malicious input.
 */
const escapeSqlLiteral = (value: string, dialect: StoreDialect): string => {
  if (dialect === "mysql") {
    return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  }
  // postgres and sqlite both use doubled single quotes for escaping
  return `'${value.replace(/'/g, "''")}'`;
};

const physicalType = (col: Column, dialect: StoreDialect): string => {
  if (col.physical_type) return col.physical_type;
  const kind = col.semantic_type.kind;
  switch (kind) {
    case "string":
    case "email":
    case "url":
    case "phone":
    case "enum":
      return dialect === "postgres" ? "text" : "varchar(255)";
    case "uuid":
      return dialect === "postgres" ? "uuid" : "varchar(36)";
    case "numeric":
      return col.semantic_type.ts_type_name === "bigint" ? "bigint" : "integer";
    case "boolean":
      return dialect === "sqlite" ? "integer" : "boolean";
    case "datetime":
    case "timestamp":
      return dialect === "postgres" ? "timestamptz" : "timestamp";
    case "date":
      return "date";
    case "bytes":
      return dialect === "postgres" ? "bytea" : "blob";
    case "json":
    case "struct":
    case "tagged":
    case "map":
      return dialect === "postgres" ? "jsonb" : "text";
    default:
      return "text";
  }
};

const renderColumn = (col: Column, dialect: StoreDialect): string => {
  const parts = [quoteIdent(col.name, dialect), physicalType(col, dialect)];
  if (!col.nullable) parts.push("NOT NULL");
  if (col.default_value) parts.push(`DEFAULT ${escapeSqlLiteral(col.default_value, dialect)}`);
  return `  ${parts.join(" ")}`;
};

const renderTable = (table: Table, dialect: StoreDialect): string => {
  const colLines = table.columns.map((c) => renderColumn(c, dialect));
  return `CREATE TABLE ${quoteIdent(table.name, dialect)} (\n${colLines.join(",\n")}\n);`;
};

const renderStore = (store: Store): string => {
  const header = `-- Schema for store: ${store.name} (dialect: ${store.dialect})`;
  if (store.tables.length === 0) {
    return `${header}\n-- No tables defined.\n`;
  }
  const body = store.tables.map((t) => renderTable(t, store.dialect)).join("\n\n");
  return `${header}\n\n${body}\n`;
};

const findTarget = (ctx: GenContext): Target | undefined =>
  ctx.targets.find((t) => t.name === TARGET_NAME);

const inputAlreadyAttached = (target: Target, store: Store): boolean =>
  target.inputs.some(
    (i) => i.kind === INPUT_KIND && (i.value as { store?: Store })?.store === store,
  );

export const defineRelationalAdapter = (
  options: RelationalAdapterOptions = {},
): Plugin<{ adapters: { relational: RelationalAdapterNamespace } }> => {
  const outDir = (options.outDir ?? "sql").replace(/\/+$/, "");

  const relationalHelper: Helper = {
    name: "relational",
    namespace: "adapters",
    materialize: ({ ctx }): RelationalAdapterNamespace => {
      const attach = (store: Store): void => {
        const c = ctx as GenContext;
        const target = findTarget(c);
        if (!target || inputAlreadyAttached(target, store)) return;
        acceptTargetInput(
          target,
          makeTargetInput({ name: store.name, kind: INPUT_KIND, value: { store } }),
        );
      };
      return {
        fromStore: attach,
        fromAllStores: () => {
          for (const store of (ctx as GenContext).stores) attach(store);
        },
      };
    },
  };

  return definePlugin({
    id: "gen/adapter-relational",
    namespace: "adapter-relational",
    setup: () => ({
      helpers: [relationalHelper],
      targets: [
        {
          name: TARGET_NAME,
          accepts_inputs: [INPUT_KIND],
          generate: (input): readonly Artifact[] => {
            const i = input as TargetInput;
            const store = (i.value as { store?: Store })?.store;
            if (!store) return [];
            return [
              makeArtifact({
                path: `${outDir}/${store.name}.sql`,
                content: renderStore(store),
                kind: "schema",
                language: "sql",
              }),
            ];
          },
        },
      ],
    }),
  });
};
