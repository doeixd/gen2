/* @__NO_SIDE_EFFECTS__ */
/**
 * Postgres target dialect — R12 target IR for SQL table/column emission.
 */

import { defineDialect, dialectId } from "../kernel/dialect.ts";
import { defineEdgeKind, defineEndpointRole, defineNodeKind } from "../kernel/ods.ts";
import {
  defineEdge,
  defineNode,
  defineType,
  endpointRoles,
  type KernelEdge,
  type KernelGraph,
  type KernelNode,
  typeKinds,
} from "../kernel/index.ts";
import type { StoreDialect } from "../storage/index.ts";

export const POSTGRES_TABLE_NODE_KIND = defineNodeKind({
  id: "node.kind.postgres.table",
  dialect: "dialect.postgres",
  traits: [],
  metadata: { title: "Postgres table" },
});

export const POSTGRES_COLUMN_NODE_KIND = defineNodeKind({
  id: "node.kind.postgres.column",
  dialect: "dialect.postgres",
  traits: [],
  metadata: { title: "Postgres column" },
});

export const POSTGRES_TABLE_OWNS_COLUMN_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.postgres.tableOwnsColumn",
  dialect: "dialect.postgres",
  endpoints: [
    defineEndpointRole("table", { targetKinds: [POSTGRES_TABLE_NODE_KIND] }),
    defineEndpointRole("column", { targetKinds: [POSTGRES_COLUMN_NODE_KIND] }),
  ],
  metadata: { title: "Postgres table owns column" },
});

export interface PostgresTablePayload {
  readonly storeName: string;
  readonly dialect: StoreDialect;
  readonly tableName: string;
}

export interface PostgresColumnPayload {
  readonly storeName: string;
  readonly tableName: string;
  readonly columnName: string;
  readonly physicalType: string;
  readonly nullable: boolean;
  readonly defaultValue?: string;
}

export type PostgresTableNode = KernelNode<
  { readonly id: typeof POSTGRES_TABLE_NODE_KIND.id; readonly label: "Postgres table" },
  never,
  PostgresTablePayload
>;

export type PostgresColumnNode = KernelNode<
  { readonly id: typeof POSTGRES_COLUMN_NODE_KIND.id; readonly label: "Postgres column" },
  never,
  PostgresColumnPayload
>;

const postgresTableKind = { id: POSTGRES_TABLE_NODE_KIND.id, label: "Postgres table" } as const;
const postgresColumnKind = { id: POSTGRES_COLUMN_NODE_KIND.id, label: "Postgres column" } as const;
const postgresTableOwnsColumnKind = {
  id: POSTGRES_TABLE_OWNS_COLUMN_EDGE_KIND.id,
  label: "Postgres table owns column",
} as const;

export const postgresTableNodeId = (input: {
  readonly storeName: string;
  readonly tableName: string;
}): string => `postgres:table:${input.storeName}:${input.tableName}`;

export const postgresColumnNodeId = (input: {
  readonly storeName: string;
  readonly tableName: string;
  readonly columnName: string;
}): string => `postgres:column:${input.storeName}:${input.tableName}:${input.columnName}`;

export const definePostgresTableNode = (payload: PostgresTablePayload): PostgresTableNode =>
  defineNode(postgresTableKind, postgresTableNodeId(payload), {
    name: payload.tableName,
    output: defineType(
      typeKinds.CUSTOM,
      `postgres:type:table:${payload.storeName}:${payload.tableName}`,
    ),
    body: { kind: "postgres.table", name: payload.tableName, _ts: payload },
  }) as PostgresTableNode;

export const definePostgresColumnNode = (payload: PostgresColumnPayload): PostgresColumnNode =>
  defineNode(postgresColumnKind, postgresColumnNodeId(payload), {
    name: payload.columnName,
    output: defineType(
      typeKinds.CUSTOM,
      `postgres:type:column:${payload.storeName}:${payload.tableName}:${payload.columnName}`,
    ),
    body: { kind: "postgres.column", name: payload.columnName, _ts: payload },
  }) as PostgresColumnNode;

export const definePostgresTableColumnEdge = (
  table: PostgresTablePayload,
  column: PostgresColumnPayload,
): KernelEdge =>
  defineEdge(
    postgresTableOwnsColumnKind,
    `postgres:edge:table-column:${column.storeName}:${column.tableName}:${column.columnName}`,
    [
      {
        role: endpointRoles.OWNER,
        target: {
          kind: "postgres.table",
          id: postgresTableNodeId(table),
          name: table.tableName,
          _ts: table,
        },
        cardinality: "one",
      },
      {
        role: endpointRoles.OWNED,
        target: {
          kind: "postgres.column",
          id: postgresColumnNodeId(column),
          name: column.columnName,
          _ts: column,
        },
        cardinality: "one",
      },
    ],
  );

const isPostgresTableNode = (node: KernelNode): node is PostgresTableNode =>
  node.kind.id === POSTGRES_TABLE_NODE_KIND.id;

const isPostgresColumnNode = (node: KernelNode): node is PostgresColumnNode =>
  node.kind.id === POSTGRES_COLUMN_NODE_KIND.id;

export const postgresTablePayload = (node: PostgresTableNode): PostgresTablePayload =>
  (node.body as { readonly _ts: PostgresTablePayload })._ts;

export const postgresColumnPayload = (node: PostgresColumnNode): PostgresColumnPayload =>
  (node.body as { readonly _ts: PostgresColumnPayload })._ts;

export const getPostgresTables = (
  graph: KernelGraph,
  storeName: string,
): readonly PostgresTablePayload[] =>
  Array.from(graph.nodes.values())
    .filter(isPostgresTableNode)
    .map(postgresTablePayload)
    .filter((table) => table.storeName === storeName);

export const getPostgresColumns = (
  graph: KernelGraph,
  input: { readonly storeName: string; readonly tableName: string },
): readonly PostgresColumnPayload[] =>
  Array.from(graph.nodes.values())
    .filter(isPostgresColumnNode)
    .map(postgresColumnPayload)
    .filter(
      (column) => column.storeName === input.storeName && column.tableName === input.tableName,
    );

export const PostgresDialect = defineDialect({
  id: dialectId("dialect.postgres"),
  namespace: "postgres",
  label: "Postgres",
  nodeKinds: [POSTGRES_TABLE_NODE_KIND, POSTGRES_COLUMN_NODE_KIND],
  edgeKinds: [POSTGRES_TABLE_OWNS_COLUMN_EDGE_KIND],
  traits: [],
  passes: [],
  lowerings: [],
  metadata: {
    title: "Postgres Dialect",
    description: "Legalized Postgres target IR for SQL artifacts.",
  },
});
