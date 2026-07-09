import type { Expr, Predicate } from "../expression/index.ts";
import type { Field } from "../entity/index.ts";
import { QUERY_EXPRESSION_NODE_KIND } from "../dialects/callable.ts";
import {
  defineNode,
  graphFragment,
  graphNode,
  type AnyGraphStep,
  type KernelNode,
} from "../kernel/index.ts";
import type { QueryExpression, QuerySource } from "./query.ts";

export type QueryExpressionNodeCustom = {
  readonly query: QueryExpression;
};

const nodeKindFromDef = (def: {
  readonly id: string;
  readonly metadata?: { readonly title?: unknown };
}) => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

const fieldKey = (field: Field): string => `${field.owning_entity.name}.${field.name}`;

const exprKey = (expr: Expr | Predicate | undefined): string => {
  if (!expr) return "";
  const refs =
    "refs" in expr ? expr.refs.map((ref) => `${ref.owner.name}.${ref.name}`).join(",") : "";
  return `${expr.kind.kind}:${refs}`;
};

const sourceKey = (source: QuerySource): string => {
  switch (source.kind) {
    case "entity_source":
      return `entity:${source.entity?.name ?? ""}`;
    case "relation_source":
      return `relation:${source.relation?.name ?? ""}`;
    case "subquery_source":
      return `subquery:${source.subquery ? queryFingerprint(source.subquery) : ""}`;
    case "expression_source":
      return `expression:${exprKey(source.source_expression)}`;
  }
};

const hash = (input: string): string => {
  let value = 2166136261;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16);
};

const queryFingerprint = (query: QueryExpression): string =>
  [
    query.kind.kind,
    sourceKey(query.source),
    `predicate:${exprKey(query.predicate)}`,
    `fields:${query.projection?.fields.map((field) => fieldKey(field.field)).join(",") ?? ""}`,
    `aggregates:${
      query.projection?.aggregates
        .map((aggregate) => `${aggregate.aggregate_op.name}:${fieldKey(aggregate.field)}`)
        .join(",") ?? ""
    }`,
    `joins:${query.joins
      .map((join) => `${join.kind}:${sourceKey(join.target)}:${exprKey(join.condition)}`)
      .join(",")}`,
    `order:${query.order_by
      .map((order) => `${fieldKey(order.field)}:${order.direction}:${exprKey(order.expression)}`)
      .join(",")}`,
    `group:${query.group_by.map(fieldKey).join(",")}`,
    `limit:${exprKey(query.limit)}`,
    `offset:${exprKey(query.offset)}`,
    `result:${query.result_type.name}`,
    `runtimes:${query.target_runtimes.map((runtime) => runtime.name).join(",")}`,
    `stores:${query.target_stores.map((store) => store.name).join(",")}`,
    `effects:${query.effects.map((effect) => effect.kind).join(",")}`,
  ].join("|");

const queryNodeId = (query: QueryExpression): string =>
  `node:queryExpression:${hash(queryFingerprint(query))}`;

export const queryToKernelNode = (query: QueryExpression): KernelNode =>
  defineNode(nodeKindFromDef(QUERY_EXPRESSION_NODE_KIND), queryNodeId(query), {
    name: query.source.entity?.name
      ? `${query.kind.kind}:${query.source.entity.name}`
      : query.kind.kind,
    metadata: {
      title: query.source.entity
        ? `${query.kind.kind} from ${query.source.entity.name}`
        : query.kind.kind,
      custom: { query } satisfies QueryExpressionNodeCustom,
    },
  });

export const queryToGraphFragment = (query: QueryExpression): AnyGraphStep =>
  graphFragment(graphNode(queryToKernelNode(query)));

export const getQueriesFromGraph = (graph: {
  nodes: ReadonlyMap<string, KernelNode>;
}): QueryExpression[] => {
  const queries: QueryExpression[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== QUERY_EXPRESSION_NODE_KIND.id) continue;
    const custom = node.metadata?.custom as QueryExpressionNodeCustom | undefined;
    if (custom?.query) queries.push(custom.query);
  }
  return queries;
};
