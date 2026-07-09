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
  type Plugin,
  type GenContext,
  type Artifact,
  type Target,
  diagnostic,
  type Diagnostic,
  defineTargetInputKind,
  targetInputsOfKind,
} from "../core/index.ts";
import { attachEdge, attachNode } from "../kernel/index.ts";
import {
  definePostgresColumnNode,
  definePostgresTableColumnEdge,
  definePostgresTableNode,
  getPostgresColumns,
  getPostgresTables,
  type PostgresColumnPayload,
  type PostgresTablePayload,
} from "../dialects/postgres.ts";
import type { Store, Column, StoreDialect } from "../storage/index.ts";

const TARGET_NAME = "relational:store";
const PIPELINE_NAME = "gen2-postgres";
const LOWER_PASS_NAME = "lower.entity.toTable";
const EMIT_PASS_NAME = "emit.sql";
const STORE_INPUT = defineTargetInputKind<"store", Store>("store");

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

const renderColumnIr = (col: PostgresColumnPayload, dialect: StoreDialect): string => {
  const parts = [quoteIdent(col.columnName, dialect), col.physicalType];
  if (!col.nullable) parts.push("NOT NULL");
  if (col.defaultValue) parts.push(`DEFAULT ${escapeSqlLiteral(col.defaultValue, dialect)}`);
  return `  ${parts.join(" ")}`;
};

const renderTableIr = (
  table: PostgresTablePayload,
  columns: readonly PostgresColumnPayload[],
): string => {
  const colLines = columns.map((c) => renderColumnIr(c, table.dialect));
  return `CREATE TABLE ${quoteIdent(table.tableName, table.dialect)} (\n${colLines.join(",\n")}\n);`;
};

const renderStoreIr = (
  input: {
    readonly storeName: string;
    readonly dialect: string;
    readonly tables: readonly PostgresTablePayload[];
  },
  columnsForTable: (table: PostgresTablePayload) => readonly PostgresColumnPayload[],
): string => {
  const header = `-- Schema for store: ${input.storeName} (dialect: ${input.dialect})`;
  if (input.tables.length === 0) {
    return `${header}\n-- No tables defined.\n`;
  }
  const body = input.tables.map((t) => renderTableIr(t, columnsForTable(t))).join("\n\n");
  return `${header}\n\n${body}\n`;
};

const lowerStoreToPostgresIr = (ctx: GenContext, store: Store): void => {
  for (const table of store.tables) {
    const tablePayload: PostgresTablePayload = {
      storeName: store.name,
      dialect: store.dialect,
      tableName: table.name,
    };
    attachNode(ctx.graph, definePostgresTableNode(tablePayload));

    for (const column of table.columns) {
      const columnPayload: PostgresColumnPayload = {
        storeName: store.name,
        tableName: table.name,
        columnName: column.name,
        physicalType: physicalType(column, store.dialect),
        nullable: column.nullable,
        defaultValue: column.default_value,
      };
      attachNode(ctx.graph, definePostgresColumnNode(columnPayload));
      attachEdge(ctx.graph, definePostgresTableColumnEdge(tablePayload, columnPayload));
    }
  }
};

const renderPostgresIrStore = (ctx: GenContext, store: Store): string => {
  const tables = getPostgresTables(ctx.graph, store.name);
  if (tables.length === 0 && store.tables.length > 0) {
    throw new Error(`Postgres target IR missing for store ${store.name}`);
  }
  return renderStoreIr({ storeName: store.name, dialect: store.dialect, tables }, (table) =>
    getPostgresColumns(ctx.graph, table),
  );
};

const findTarget = (ctx: GenContext): Target | undefined =>
  ctx.targets.find((t) => t.name === TARGET_NAME);

const inputAlreadyAttached = (target: Target, store: Store): boolean =>
  targetInputsOfKind(target.inputs, STORE_INPUT).some((input) => input.value === store);

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
        acceptTargetInput(target, STORE_INPUT.make({ name: store.name, value: store }));
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
          accepts_inputs: STORE_INPUT.accepts_inputs,
          pipeline: PIPELINE_NAME,
        },
      ],
      passes: [
        {
          pass: { name: LOWER_PASS_NAME, phase: "lower" },
          runner: (_graph, passCtx) => {
            const ctx = passCtx.options?.genContext as GenContext | undefined;
            const target = passCtx.options?.target as Target | undefined;
            if (!ctx || !target) return { success: false };
            for (const input of targetInputsOfKind(target.inputs, STORE_INPUT)) {
              lowerStoreToPostgresIr(ctx, input.value);
            }
            return { success: true };
          },
        },
        {
          pass: { name: EMIT_PASS_NAME, phase: "emit" },
          runner: (_graph, passCtx) => {
            const ctx = passCtx.options?.genContext as GenContext | undefined;
            const target = passCtx.options?.target as Target | undefined;
            if (!ctx || !target) return { success: false };
            const artifacts: Artifact[] = [];
            const diagnostics: Diagnostic[] = [];
            for (const input of targetInputsOfKind(target.inputs, STORE_INPUT)) {
              const store = input.value;
              try {
                artifacts.push(
                  makeArtifact({
                    path: `${outDir}/${store.name}.sql`,
                    content: renderPostgresIrStore(ctx, store),
                    kind: "schema",
                    language: "sql",
                  }),
                );
              } catch (error) {
                diagnostics.push(
                  diagnostic({
                    severity: "error",
                    code: "postgres:missing-legalized-ir",
                    message: error instanceof Error ? error.message : String(error),
                  }),
                );
              }
            }
            target.generate_result = {
              artifacts,
              diagnostics,
              status: diagnostics.some((d) => d.severity === "error") ? "failed" : "success",
            };
            return {
              success: !diagnostics.some((d) => d.severity === "error"),
              diagnostics,
            };
          },
        },
      ],
    }),
  });
};
