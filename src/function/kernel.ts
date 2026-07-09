/* @__NO_SIDE_EFFECTS__ */
/**
 * Adapter: All function kinds → kernel graph IR.
 *
 * Pure conversion from legacy function domain objects to kernel nodes.
 * Supports: StaticFunction, ExprFunction, PredicateFunction,
 * QueryFunction, ActionFunction, PatchFunction, PlanFunction.
 *
 * Edges added:
 *   - HAS_BODY: function → body expression / predicate / query / action / patch / plan
 *   - HAS_INPUT_TYPE: function → input type (synthesized ref)
 *   - HAS_OUTPUT_TYPE: function → output/returns type (synthesized ref)
 *   - GUARDS: action → auth policy rule (if present)
 *   - ACTION_INVALIDATES: action → invalidated query
 *   - ACTION_HAS_OPTIMISTIC_PATCH: action → optimistic patch function
 *
 * Additional edges (READS, WRITES, REQUIRES, etc.) will be derived in R4
 * when expression analysis can extract them from bodies.
 *
 * No `ctx.graph` mutation — registration happens in the binder dual-write.
 *
 * See `docs/revised-kernel.md`, `docs/revision/revised_phases.md` §R6,
 * and `docs/revision/funcs.txt`.
 */

import type {
  StaticFunction,
  ExprFunction,
  PredicateFunction,
  QueryFunction,
  ActionFunction,
  PatchFunction,
  PlanFunction,
  FunctionCatalog,
} from "./function.ts";
import {
  type KernelEdge,
  type KernelNode,
  type KernelNodeRef,
  type KernelRef,
  type AnyGraphStep,
  defineEdge,
  defineEdgeFromKind,
  defineNode,
  edgeKinds,
  endpointRoles,
  graphEdge,
  graphFragment,
  graphNode,
  kernelId,
  nodeKinds,
  nodeRef,
} from "../kernel/index.ts";
import {
  ACTION_WRITES_FIELD_EDGE_KIND,
  PLAN_NODE_KIND,
  type ActionWritesFieldCustom,
} from "../dialects/callable.ts";
import { FIELD_NODE_KIND } from "../dialects/domain/entity-field-relation.ts";
import {
  EXPR_FUNCTION_NODE_KIND,
  PATCH_NODE_KIND,
  PREDICATE_FUNCTION_NODE_KIND,
  STATIC_FUNCTION_NODE_KIND,
} from "../dialects/callable.ts";
import { GUARDS_ACTION_EDGE_KIND, POLICY_NODE_KIND } from "../dialects/auth.ts";

// ---------------------------------------------------------------------------
// Node builders
// ---------------------------------------------------------------------------

const staticNodeId = (fn: StaticFunction): string => `node:static:${fn.name}`;
const exprNodeId = (fn: ExprFunction): string => `node:expr:${fn.name}`;
const predicateNodeId = (fn: PredicateFunction): string => `node:predicate:${fn.name}`;
const queryNodeId = (fn: QueryFunction): string => `node:query:${fn.name}`;
const actionNodeId = (fn: ActionFunction): string => `node:action:${fn.name}`;
const patchNodeId = (fn: PatchFunction): string => `node:patch:${fn.name}`;
const planNodeId = (fn: PlanFunction): string => `node:plan:${fn.name}`;

const nodeKindFromDef = (def: {
  readonly id: string;
  readonly metadata?: { readonly title?: unknown };
}) => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

export type StaticNodeCustom = {
  readonly staticFunction: StaticFunction;
};

export const staticFunctionToKernelNode = (fn: StaticFunction): KernelNode =>
  defineNode(nodeKindFromDef(STATIC_FUNCTION_NODE_KIND), staticNodeId(fn), {
    name: fn.name,
    metadata: {
      title: fn.name,
      custom: { staticFunction: fn, ref: fn.ref } satisfies StaticNodeCustom & {
        readonly ref: StaticFunction["ref"];
      },
    },
  });

export type ExprFunctionNodeCustom = {
  readonly exprFunction: ExprFunction;
};

export const exprFunctionToKernelNode = (fn: ExprFunction): KernelNode =>
  defineNode(nodeKindFromDef(EXPR_FUNCTION_NODE_KIND), exprNodeId(fn), {
    name: fn.name,
    metadata: {
      title: fn.name,
      custom: { exprFunction: fn, ref: fn.ref } satisfies ExprFunctionNodeCustom & {
        readonly ref: ExprFunction["ref"];
      },
    },
  });

export type PredicateFunctionNodeCustom = {
  readonly predicateFunction: PredicateFunction;
};

export const predicateFunctionToKernelNode = (fn: PredicateFunction): KernelNode =>
  defineNode(nodeKindFromDef(PREDICATE_FUNCTION_NODE_KIND), predicateNodeId(fn), {
    name: fn.name,
    metadata: {
      title: fn.name,
      custom: { predicateFunction: fn, ref: fn.ref } satisfies PredicateFunctionNodeCustom & {
        readonly ref: PredicateFunction["ref"];
      },
    },
  });

/**
 * Typed payload on a `QUERY` node. Carries the full structural
 * `QueryFunction` shape so downstream consumers
 * (`getQueryFunctionsFromGraph`, R-8 rule-invalidation, boundary
 * builder, …) can read it without a `_bridge*` JS-object side
 * channel (PLAN.md §0.5 #8). `QueryFunction` is a pure-data
 * interface, so the typed payload is structurally equivalent to a
 * bespoke projection — but type-checked at compile time.
 */
export type QueryNodeCustom = {
  readonly query: QueryFunction;
};

export const queryFunctionToKernelNode = (fn: QueryFunction): KernelNode =>
  defineNode(nodeKinds.QUERY, queryNodeId(fn), {
    name: fn.name,
    metadata: {
      title: fn.name,
      custom: { query: fn, ref: fn.ref } satisfies QueryNodeCustom & {
        readonly ref: QueryFunction["ref"];
      },
    },
  });

/**
 * Typed payload on an `ACTION` node. Carries the full structural
 * `ActionFunction` shape so downstream consumers
 * (`getActionFunctionsFromGraph`, R-8 rule-invalidation, mutation
 * planner, boundary builder, …) can read it without a `_bridge*`
 * JS-object side channel (PLAN.md §0.5 #8). `ActionFunction` is a
 * pure-data interface, so the typed payload is structurally
 * equivalent to a bespoke projection — but type-checked at compile
 * time.
 */
export type ActionNodeCustom = {
  readonly action: ActionFunction;
};

export const actionFunctionToKernelNode = (fn: ActionFunction): KernelNode =>
  defineNode(nodeKinds.ACTION, actionNodeId(fn), {
    name: fn.name,
    metadata: {
      title: fn.name,
      custom: { action: fn, ref: fn.ref } satisfies ActionNodeCustom & {
        readonly ref: ActionFunction["ref"];
      },
    },
  });

export type PatchNodeCustom = {
  readonly patch: PatchFunction;
};

export const patchFunctionToKernelNode = (fn: PatchFunction): KernelNode =>
  defineNode(nodeKindFromDef(PATCH_NODE_KIND), patchNodeId(fn), {
    name: fn.name,
    metadata: {
      title: fn.name,
      custom: { patch: fn, ref: fn.ref } satisfies PatchNodeCustom & {
        readonly ref: PatchFunction["ref"];
      },
    },
  });

export type PlanNodeCustom = {
  readonly plan: PlanFunction;
};

export const planFunctionToKernelNode = (fn: PlanFunction): KernelNode =>
  defineNode(nodeKindFromDef(PLAN_NODE_KIND), planNodeId(fn), {
    name: fn.name,
    metadata: {
      title: fn.name,
      custom: { plan: fn, ref: fn.ref } satisfies PlanNodeCustom & {
        readonly ref: PlanFunction["ref"];
      },
    },
  });

// ---------------------------------------------------------------------------
// Edge builders
// ---------------------------------------------------------------------------

const fnNodeRef = <const Kind extends KernelNode["kind"]>(
  kind: Kind,
  name: string,
): KernelNodeRef<Kind> =>
  ({
    kind: "node",
    nodeKind: kind,
    id: kernelId<"node">(kind.id.replace("node.kind.", "node:") + ":" + name),
    name,
  }) as KernelNodeRef<Kind>;

const typeRef = (name: string): KernelRef<"type"> => ({
  kind: "type",
  name,
});

/** Build HAS_INPUT_TYPE and HAS_OUTPUT_TYPE edges for any function. */
const functionTypeEdges = (
  fn: {
    readonly name: string;
    readonly input_type?: { readonly name: string };
    readonly output_type?: { readonly name: string };
    readonly returns?: { readonly name: string };
  },
  kind: KernelNode["kind"],
): readonly KernelEdge[] => {
  const edges: KernelEdge[] = [];
  const src = fnNodeRef(kind, fn.name);
  const inputType = fn.input_type;
  const outputType = fn.output_type ?? fn.returns;

  if (inputType) {
    edges.push(
      defineEdge(edgeKinds.HAS_INPUT_TYPE, `edge:hasInputType:${fn.name}`, [
        { role: endpointRoles.SOURCE, target: src, cardinality: "one" },
        { role: endpointRoles.TARGET, target: typeRef(inputType.name), cardinality: "one" },
      ]),
    );
  }
  if (outputType) {
    edges.push(
      defineEdge(edgeKinds.HAS_OUTPUT_TYPE, `edge:hasOutputType:${fn.name}`, [
        { role: endpointRoles.SOURCE, target: src, cardinality: "one" },
        { role: endpointRoles.TARGET, target: typeRef(outputType.name), cardinality: "one" },
      ]),
    );
  }
  return edges;
};

/** Build edges for a query function: type + auth guard edges. */
export const queryFunctionToKernelEdges = (fn: QueryFunction): readonly KernelEdge[] => {
  const edges: KernelEdge[] = [...functionTypeEdges(fn, nodeKinds.QUERY)];
  const src = fnNodeRef(nodeKinds.QUERY, fn.name);

  if (fn.auth?.policy_name) {
    edges.push(
      defineEdgeFromKind(
        GUARDS_ACTION_EDGE_KIND,
        `edge:guardsAction:${fn.name}->${fn.auth.policy_name}`,
        {
          guard: nodeRef.unsafe(POLICY_NODE_KIND, `node:policy:${fn.auth.policy_name}`),
          action: src,
        },
      ),
    );
  }

  return edges;
};

/** Build edges for an action function: type + invalidation + optimistic patch edges. */
export const actionFunctionToKernelEdges = (fn: ActionFunction): readonly KernelEdge[] => {
  const edges: KernelEdge[] = [...functionTypeEdges(fn, nodeKinds.ACTION)];
  const src = fnNodeRef(nodeKinds.ACTION, fn.name);

  // Auth guard edge
  if (fn.auth?.policy_name) {
    edges.push(
      defineEdgeFromKind(
        GUARDS_ACTION_EDGE_KIND,
        `edge:guardsAction:${fn.name}->${fn.auth.policy_name}`,
        {
          guard: nodeRef.unsafe(POLICY_NODE_KIND, `node:policy:${fn.auth.policy_name}`),
          action: src,
        },
      ),
    );
  }

  // Invalidation edges
  for (const q of fn.invalidates) {
    edges.push(
      defineEdge(edgeKinds.ACTION_INVALIDATES, `edge:actionInvalidates:${fn.name}->${q.name}`, [
        { role: endpointRoles.SOURCE, target: src, cardinality: "one" },
        {
          role: endpointRoles.TARGET,
          target: fnNodeRef(nodeKinds.QUERY, q.name),
          cardinality: "one",
        },
      ]),
    );
  }

  // Optimistic patch edge
  if (fn.optimistic) {
    edges.push(
      defineEdge(
        edgeKinds.ACTION_HAS_OPTIMISTIC_PATCH,
        `edge:actionHasOptimisticPatch:${fn.name}->${fn.optimistic.name}`,
        [
          { role: endpointRoles.SOURCE, target: src, cardinality: "one" },
          {
            role: endpointRoles.TARGET,
            target: fnNodeRef(nodeKindFromDef(PATCH_NODE_KIND), fn.optimistic.name),
            cardinality: "one",
          },
        ],
      ),
    );
  }

  return edges;
};

/** Build WRITES edges from an action's body operations (R7 bridge). */
export const actionFunctionToWriteEdges = (fn: ActionFunction): readonly KernelEdge[] => {
  const edges: KernelEdge[] = [];
  const src = fnNodeRef(nodeKinds.ACTION, fn.name);

  for (const op of fn.body.operations) {
    if (op.kind === "invalidate_op") continue;
    // insert_op / update_op / delete_op all write fields via `values`.
    for (const field of op.values.keys()) {
      const operation =
        op.kind === "insert_op" ? "insert" : op.kind === "update_op" ? "update" : "delete";
      edges.push(
        defineEdgeFromKind(
          ACTION_WRITES_FIELD_EDGE_KIND,
          `edge:actionWritesField:${fn.name}->${field.id ?? field.name}`,
          {
            action: src,
            field: nodeRef.unsafe(
              FIELD_NODE_KIND,
              `node:field:${field.id ?? `${op.target.name}.${field.name}`}`,
            ),
          },
          {
            metadata: {
              title: `${fn.name} writes ${field.name}`,
              custom: {
                operation,
                field_name: field.name,
                entity_name: op.target.name,
                has_condition: "condition" in op && op.condition !== undefined,
              } satisfies ActionWritesFieldCustom,
            },
          },
        ),
      );
    }
  }

  return edges;
};

/** Build edges for a patch function: type edges only. */
export const patchFunctionToKernelEdges = (fn: PatchFunction): readonly KernelEdge[] =>
  functionTypeEdges(fn, nodeKindFromDef(PATCH_NODE_KIND));

/** Build edges for a plan function: type edges only. */
export const planFunctionToKernelEdges = (fn: PlanFunction): readonly KernelEdge[] =>
  functionTypeEdges(fn, nodeKindFromDef(PLAN_NODE_KIND));

/** Build edges for a static function: type edges only. */
export const staticFunctionToKernelEdges = (fn: StaticFunction): readonly KernelEdge[] =>
  functionTypeEdges(fn, nodeKindFromDef(STATIC_FUNCTION_NODE_KIND));

/** Build edges for an expr function: type edges only. */
export const exprFunctionToKernelEdges = (fn: ExprFunction): readonly KernelEdge[] =>
  functionTypeEdges(fn, nodeKindFromDef(EXPR_FUNCTION_NODE_KIND));

/** Build edges for a predicate function: type edges only. */
export const predicateFunctionToKernelEdges = (fn: PredicateFunction): readonly KernelEdge[] =>
  functionTypeEdges(fn, nodeKindFromDef(PREDICATE_FUNCTION_NODE_KIND));

const functionNodeAndTypeEdgesToGraphFragment = (
  node: KernelNode,
  edges: readonly KernelEdge[],
): AnyGraphStep => graphFragment(graphNode(node), ...edges.map((edge) => graphEdge(edge)));

export const staticFunctionToGraphFragment = (fn: StaticFunction): AnyGraphStep =>
  functionNodeAndTypeEdgesToGraphFragment(
    staticFunctionToKernelNode(fn),
    staticFunctionToKernelEdges(fn),
  );

export const exprFunctionToGraphFragment = (fn: ExprFunction): AnyGraphStep =>
  functionNodeAndTypeEdgesToGraphFragment(
    exprFunctionToKernelNode(fn),
    exprFunctionToKernelEdges(fn),
  );

export const predicateFunctionToGraphFragment = (fn: PredicateFunction): AnyGraphStep =>
  functionNodeAndTypeEdgesToGraphFragment(
    predicateFunctionToKernelNode(fn),
    predicateFunctionToKernelEdges(fn),
  );

export const queryFunctionToGraphFragment = (fn: QueryFunction): AnyGraphStep =>
  graphFragment(
    graphNode(queryFunctionToKernelNode(fn)),
    ...queryFunctionToKernelEdges(fn).map((edge) => graphEdge(edge)),
  );

export const actionFunctionToGraphFragment = (fn: ActionFunction): AnyGraphStep =>
  graphFragment(
    graphNode(actionFunctionToKernelNode(fn)),
    ...actionFunctionToKernelEdges(fn).map((edge) => graphEdge(edge)),
    ...actionFunctionToWriteEdges(fn).map((edge) => graphEdge(edge)),
  );

export const patchFunctionToGraphFragment = (fn: PatchFunction): AnyGraphStep =>
  functionNodeAndTypeEdgesToGraphFragment(
    patchFunctionToKernelNode(fn),
    patchFunctionToKernelEdges(fn),
  );

export const planFunctionToGraphFragment = (fn: PlanFunction): AnyGraphStep =>
  functionNodeAndTypeEdgesToGraphFragment(
    planFunctionToKernelNode(fn),
    planFunctionToKernelEdges(fn),
  );

// ---------------------------------------------------------------------------
// Graph extraction helpers
// ---------------------------------------------------------------------------

/**
 * Recover an `ActionFunction` from an ACTION node's typed
 * `ActionNodeCustom` payload (PLAN.md §0.5 #8 — no `_bridge*` slot).
 */
const getActionFromNode = (node: {
  metadata?: { custom?: Record<string, unknown> };
}): ActionFunction | undefined => {
  const custom = node.metadata?.custom as ActionNodeCustom | undefined;
  return custom?.action;
};

const getStaticFromNode = (node: {
  metadata?: { custom?: Record<string, unknown> };
}): StaticFunction | undefined => {
  const custom = node.metadata?.custom as StaticNodeCustom | undefined;
  return custom?.staticFunction;
};

const getExprFromNode = (node: {
  metadata?: { custom?: Record<string, unknown> };
}): ExprFunction | undefined => {
  const custom = node.metadata?.custom as ExprFunctionNodeCustom | undefined;
  return custom?.exprFunction;
};

const getPredicateFromNode = (node: {
  metadata?: { custom?: Record<string, unknown> };
}): PredicateFunction | undefined => {
  const custom = node.metadata?.custom as PredicateFunctionNodeCustom | undefined;
  return custom?.predicateFunction;
};

/**
 * Recover a `QueryFunction` from a QUERY node's typed
 * `QueryNodeCustom` payload (PLAN.md §0.5 #8 — no `_bridge*` slot).
 */
const getQueryFromNode = (node: {
  metadata?: { custom?: Record<string, unknown> };
}): QueryFunction | undefined => {
  const custom = node.metadata?.custom as QueryNodeCustom | undefined;
  return custom?.query;
};

const getPlanFromNode = (node: {
  metadata?: { custom?: Record<string, unknown> };
}): PlanFunction | undefined => {
  const custom = node.metadata?.custom as PlanNodeCustom | undefined;
  return custom?.plan;
};

const getPatchFromNode = (node: {
  metadata?: { custom?: Record<string, unknown> };
}): PatchFunction | undefined => {
  const custom = node.metadata?.custom as PatchNodeCustom | undefined;
  return custom?.patch;
};

/** Extract all static functions from STATIC nodes in the graph. */
export const getStaticFunctionsFromGraph = (
  graph: import("../kernel/index.ts").KernelGraph,
): StaticFunction[] => {
  const functions: StaticFunction[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== STATIC_FUNCTION_NODE_KIND.id) continue;
    const fn = getStaticFromNode(node);
    if (fn) functions.push(fn);
  }
  return functions;
};

/** Extract all expression functions from EXPR_FUNCTION nodes in the graph. */
export const getExprFunctionsFromGraph = (
  graph: import("../kernel/index.ts").KernelGraph,
): ExprFunction[] => {
  const functions: ExprFunction[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== EXPR_FUNCTION_NODE_KIND.id) continue;
    const fn = getExprFromNode(node);
    if (fn) functions.push(fn);
  }
  return functions;
};

/** Extract all predicate functions from PREDICATE_FUNCTION nodes in the graph. */
export const getPredicateFunctionsFromGraph = (
  graph: import("../kernel/index.ts").KernelGraph,
): PredicateFunction[] => {
  const functions: PredicateFunction[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== PREDICATE_FUNCTION_NODE_KIND.id) continue;
    const fn = getPredicateFromNode(node);
    if (fn) functions.push(fn);
  }
  return functions;
};

/** Extract all action functions from ACTION nodes in the graph. */
export const getActionFunctionsFromGraph = (
  graph: import("../kernel/index.ts").KernelGraph,
): ActionFunction[] => {
  const actions: ActionFunction[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== nodeKinds.ACTION) continue;
    const action = getActionFromNode(node);
    if (action) actions.push(action);
  }
  return actions;
};

/** Extract all query functions from QUERY nodes in the graph. */
export const getQueryFunctionsFromGraph = (
  graph: import("../kernel/index.ts").KernelGraph,
): QueryFunction[] => {
  const queries: QueryFunction[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== nodeKinds.QUERY) continue;
    const query = getQueryFromNode(node);
    if (query) queries.push(query);
  }
  return queries;
};

/** Extract all plan functions from PLAN nodes in the graph. */
export const getPlanFunctionsFromGraph = (
  graph: import("../kernel/index.ts").KernelGraph,
): PlanFunction[] => {
  const plans: PlanFunction[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== PLAN_NODE_KIND.id) continue;
    const plan = getPlanFromNode(node);
    if (plan) plans.push(plan);
  }
  return plans;
};

/** Extract all patch functions from PATCH nodes in the graph. */
export const getPatchFunctionsFromGraph = (
  graph: import("../kernel/index.ts").KernelGraph,
): PatchFunction[] => {
  const patches: PatchFunction[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== PATCH_NODE_KIND.id) continue;
    const patch = getPatchFromNode(node);
    if (patch) patches.push(patch);
  }
  return patches;
};

export const getFunctionCatalogFromGraph = (
  graph: import("../kernel/index.ts").KernelGraph,
): FunctionCatalog => ({
  static: getStaticFunctionsFromGraph(graph),
  expr: getExprFunctionsFromGraph(graph),
  predicate: getPredicateFunctionsFromGraph(graph),
  query: getQueryFunctionsFromGraph(graph),
  action: getActionFunctionsFromGraph(graph),
  patch: getPatchFunctionsFromGraph(graph),
  plan: getPlanFunctionsFromGraph(graph),
});

/** Find an action function by name from ACTION nodes in the graph. */
export const findActionFunctionByNameOnGraph = (
  graph: import("../kernel/index.ts").KernelGraph,
  name: string,
): ActionFunction | undefined => {
  for (const node of graph.nodes.values()) {
    if (node.kind !== nodeKinds.ACTION) continue;
    if (node.name !== name) continue;
    return getActionFromNode(node);
  }
  return undefined;
};

/** Find a query function by name from QUERY nodes in the graph. */
export const findQueryFunctionByNameOnGraph = (
  graph: import("../kernel/index.ts").KernelGraph,
  name: string,
): QueryFunction | undefined => {
  for (const node of graph.nodes.values()) {
    if (node.kind !== nodeKinds.QUERY) continue;
    if (node.name !== name) continue;
    return getQueryFromNode(node);
  }
  return undefined;
};
