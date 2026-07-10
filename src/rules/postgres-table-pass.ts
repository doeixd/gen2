/* @__NO_SIDE_EFFECTS__ */
/**
 * Track R — `legalize.entity.toPostgresTable` (graph-native).
 *
 * Derives Postgres target IR (`PostgresTableNode` / `PostgresColumnNode`
 * from `src/dialects/postgres.ts`) from `ENTITY_NODE_KIND` nodes and
 * their owned `FIELD_NODE_KIND` fields.
 *
 * Closes the gap between the domain layer (entities/fields, dialect-owned
 * by `EntityFieldRelationDialect`) and the Postgres target dialect, which
 * previously only received table/column IR from the hand-authored
 * `Store`/`Table` model (`src/adapters/relational.ts`). This pass instead
 * reads the typed `EntityNodeCustom` payload (`store_name` + the full
 * `Entity` JS object) directly off the entity node — no `_bridge*` side
 * channel, no `passCtx.options.genContext` reads.
 *
 * Entities without a `store_name` are skipped with an info diagnostic
 * (not an error) — they simply have no physical table.
 *
 * The table name and the payload's `storeName` are both set to the
 * entity's `store_name`: unlike the hand-authored relational adapter
 * (where one `Store` may own many `Table`s), an entity-derived table is
 * always a single logical unit, so store and table coincide.
 */

import {
  type PassResult,
  type KernelGraph,
  type KernelNode,
  registerNode,
  registerEdge,
} from "../kernel/index.ts";
import { defineDiagnostic, type Diagnostic } from "../kernel/diagnostic.ts";
import type { GenContext } from "../core/index.ts";
import {
  ENTITY_NODE_KIND,
  type EntityNodeCustom,
} from "../dialects/domain/entity-field-relation.ts";
import {
  definePostgresColumnNode,
  definePostgresTableColumnEdge,
  definePostgresTableNode,
  type PostgresColumnPayload,
  type PostgresTablePayload,
} from "../dialects/postgres.ts";
import type { Field } from "../entity/entity.ts";
import type { SemanticType } from "../types/semantic.ts";

export const POSTGRES_TABLE_LOWERING_PASS_NAME = "legalize.entity.toPostgresTable";

/**
 * Maps a field's `SemanticType.kind` to a Postgres physical column type.
 * Mirrors `src/adapters/relational.ts`'s `physicalType` mapping (kept
 * postgres-only here since this pass is postgres-target-specific).
 */
export const semanticTypeToPostgresColumnType = (semanticType: SemanticType): string => {
  switch (semanticType.kind) {
    case "string":
    case "email":
    case "url":
    case "phone":
    case "enum":
      return "text";
    case "uuid":
      return "uuid";
    case "numeric":
      return semanticType.ts_type_name === "bigint" ? "bigint" : "integer";
    case "boolean":
      return "boolean";
    case "datetime":
    case "timestamp":
      return "timestamptz";
    case "date":
      return "date";
    case "bytes":
      return "bytea";
    case "money":
      return "bigint";
    case "json":
    case "struct":
    case "tagged":
    case "map":
      return "jsonb";
    default:
      return "text";
  }
};

const fieldDefaultLiteral = (field: Field): string | undefined =>
  field.default_value?.kind === "literal" ? field.default_value.value : undefined;

export interface PostgresTableLoweringResult {
  readonly graph: KernelGraph;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Derives postgres table/column IR for a single entity node. Pure/graph-
 * threaded: returns the (possibly unchanged) graph plus diagnostics.
 */
const lowerEntityNode = (
  graph: KernelGraph,
  entityNode: KernelNode,
): PostgresTableLoweringResult => {
  const entityName = entityNode.name ?? entityNode.id;
  const custom = entityNode.metadata?.custom as (EntityNodeCustom & object) | undefined;
  const storeName = custom?.store_name;
  if (!storeName) {
    return {
      graph,
      diagnostics: [
        defineDiagnostic(
          "entity:no-store-name",
          "info",
          `Entity "${entityName}" has no store_name; skipping Postgres table lowering.`,
        ),
      ],
    };
  }

  const entity = custom?.entity;
  if (!entity) {
    return {
      graph,
      diagnostics: [
        defineDiagnostic(
          "entity:no-entity-payload",
          "info",
          `Entity "${entityName}" has a store_name but no entity payload; skipping Postgres table lowering.`,
        ),
      ],
    };
  }

  const tablePayload: PostgresTablePayload = {
    storeName,
    dialect: "postgres",
    tableName: storeName,
  };

  let nextGraph = registerNode(graph, definePostgresTableNode(tablePayload));

  for (const field of entity.fieldList) {
    const columnPayload: PostgresColumnPayload = {
      storeName,
      tableName: storeName,
      columnName: field.name,
      physicalType: semanticTypeToPostgresColumnType(field.semantic_type),
      nullable: field.nullable,
      defaultValue: fieldDefaultLiteral(field),
    };
    nextGraph = registerNode(nextGraph, definePostgresColumnNode(columnPayload));
    nextGraph = registerEdge(nextGraph, definePostgresTableColumnEdge(tablePayload, columnPayload));
  }

  return { graph: nextGraph, diagnostics: [] };
};

/** Register the entity -> Postgres table lowering pass. */
export const registerPostgresTableLoweringPass = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(POSTGRES_TABLE_LOWERING_PASS_NAME)) return;

  ctx.passRegistry.register(
    { name: POSTGRES_TABLE_LOWERING_PASS_NAME, phase: "legalize" },
    (graph): PassResult => {
      let currentGraph = graph;
      const diagnostics: Diagnostic[] = [];

      for (const node of graph.nodes.values()) {
        if (node.kind.id !== ENTITY_NODE_KIND.id) continue;
        const result = lowerEntityNode(currentGraph, node);
        currentGraph = result.graph;
        diagnostics.push(...result.diagnostics);
      }

      return {
        success: true,
        diagnostics,
        modifiedGraph: currentGraph,
      };
    },
  );
};
