/* @__NO_SIDE_EFFECTS__ */
/**
 * Track R — `legalize.schema.assemblePostgresSchema` (graph-native).
 *
 * Assembles one deployable Postgres schema artifact (`sql/schema.sql`)
 * from the graph-native IR produced by the other postgres passes:
 *
 *   1. `PostgresTableNode` / `PostgresColumnNode` (from
 *      `legalize.entity.toPostgresTable`, `postgres-table-pass.ts`) ->
 *      `CREATE TABLE` statements.
 *   2. Tables that have at least one RLS policy targeting them (derived
 *      by re-running `RLS_POLICY_MORPHISM` against the graph — pure,
 *      side-effect free) -> `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
 *   3. The same RLS policy bodies -> `CREATE POLICY` statements.
 *
 * Statement order is fixed: all CREATE TABLEs, then all ENABLE ROW LEVEL
 * SECURITY statements, then all CREATE POLICY statements — a valid
 * dependency order for `psql -f`.
 *
 * This pass does NOT re-emit the individual `pg.rls-policy` artifacts;
 * those remain owned by `legalize.rule.toRlsPolicy`
 * (`src/rules/rls-pass.ts`) and are pinned by the opsdesk slice's R-2
 * test. It only *reads* the same morphism's output to source policy SQL
 * and table targeting, keeping the two artifacts consistent without
 * duplicating the rule-body-to-SQL lowering logic.
 */

import { type PassResult, type KernelGraph } from "../kernel/index.ts";
import { defineArtifact, ARTIFACT_KINDS, type Artifact } from "../kernel/artifact.ts";
import type { KernelId } from "../kernel/id.ts";
import type { GenContext } from "../core/index.ts";
import {
  getPostgresColumns,
  type PostgresColumnPayload,
  POSTGRES_TABLE_NODE_KIND,
  postgresTablePayload,
  type PostgresTableNode,
  type PostgresTablePayload,
} from "../dialects/postgres.ts";
import { ENTITY_NODE_KIND } from "../dialects/domain/entity-field-relation.ts";
import { RLS_POLICY_MORPHISM } from "./rls-pass.ts";

const PASS_NAME = "legalize.schema.assemblePostgresSchema";
const PASS_NODE_ID = `pass:${PASS_NAME}` as KernelId<"pass">;

const quoteIdent = (id: string): string => `"${id.replace(/"/g, '""')}"`;

const escapeSqlLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const renderColumn = (col: PostgresColumnPayload): string => {
  const parts = [quoteIdent(col.columnName), col.physicalType];
  if (!col.nullable) parts.push("NOT NULL");
  if (col.defaultValue) parts.push(`DEFAULT ${escapeSqlLiteral(col.defaultValue)}`);
  return `  ${parts.join(" ")}`;
};

const renderCreateTable = (
  table: PostgresTablePayload,
  columns: readonly PostgresColumnPayload[],
): string => {
  const colLines = columns.map(renderColumn);
  return `CREATE TABLE ${quoteIdent(table.tableName)} (\n${colLines.join(",\n")}\n);`;
};

const renderEnableRls = (tableName: string): string =>
  `ALTER TABLE ${quoteIdent(tableName)} ENABLE ROW LEVEL SECURITY;`;

/** Find the target table name (entity `store_name`) for a `pg.rls-policy` artifact. */
const tableNameForPolicyArtifact = (graph: KernelGraph, artifact: Artifact): string | undefined => {
  const entitySource = artifact.generatedFrom.find((s) => s.kind === "entity");
  if (!entitySource) return undefined;
  const entityNode = graph.nodes.get(entitySource.id);
  if (!entityNode || entityNode.kind.id !== ENTITY_NODE_KIND.id) return undefined;
  const custom = entityNode.metadata?.custom as { readonly store_name?: string } | undefined;
  return custom?.store_name;
};

const isPostgresTableNode = (node: { readonly kind: { readonly id: string } }): boolean =>
  node.kind.id === POSTGRES_TABLE_NODE_KIND.id;

/**
 * Assemble the full deployable schema: tables in declaration order, then
 * ENABLE RLS for tables with at least one policy, then the policies
 * themselves. Returns `undefined` when there is nothing to assemble
 * (no postgres tables in the graph).
 */
const buildSchemaArtifact = (graph: KernelGraph): Artifact | undefined => {
  const tableNodes = Array.from(graph.nodes.values()).filter((node): node is PostgresTableNode =>
    isPostgresTableNode(node),
  );
  if (tableNodes.length === 0) return undefined;

  const tables = tableNodes.map(postgresTablePayload);

  const createTableStatements = tables.map((table) =>
    renderCreateTable(table, getPostgresColumns(graph, table)),
  );

  const rlsResult = RLS_POLICY_MORPHISM.run(graph);
  const policyArtifacts = rlsResult.artifacts.filter(
    (a) => a.kind === ARTIFACT_KINDS.PG_RLS_POLICY,
  );

  const tablesWithPolicies = new Set<string>();
  const policyStatements: string[] = [];
  for (const policyArtifact of policyArtifacts) {
    const tableName = tableNameForPolicyArtifact(graph, policyArtifact);
    if (tableName) tablesWithPolicies.add(tableName);
    if (typeof policyArtifact.content === "string") {
      policyStatements.push(policyArtifact.content);
    }
  }

  const enableRlsStatements = tables
    .map((t) => t.tableName)
    .filter((name) => tablesWithPolicies.has(name))
    .map(renderEnableRls);

  const sql = [
    ...createTableStatements,
    ...(enableRlsStatements.length > 0 ? enableRlsStatements : []),
    ...(policyStatements.length > 0 ? policyStatements : []),
  ].join("\n\n");

  const generatedFrom = [
    ...tableNodes.map((n) => ({ id: n.id as KernelId, kind: "postgres.table", context: n.name })),
    ...policyArtifacts.flatMap((a) => a.generatedFrom),
  ];

  return defineArtifact("artifact:pg-schema:assembled", {
    target: "postgres",
    kind: ARTIFACT_KINDS.PG_MIGRATION,
    path: "sql/schema.sql",
    content: `${sql}\n`,
    generatedFrom,
    generatedBy: PASS_NODE_ID,
  });
};

/** Register the assembled-Postgres-schema pass. */
export const registerPostgresSchemaAssemblyPass = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(PASS_NAME)) return;

  ctx.passRegistry.register({ name: PASS_NAME, phase: "legalize" }, (graph): PassResult => {
    const artifact = buildSchemaArtifact(graph);
    return {
      success: true,
      diagnostics: [],
      artifacts: artifact ? [artifact] : [],
    };
  });
};

export const POSTGRES_SCHEMA_ASSEMBLY_PASS = PASS_NAME;
