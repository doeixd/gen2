/* @__NO_SIDE_EFFECTS__ */
/**
 * Callable dialect — R6 dialect for query, action, patch, plan, dispatch, workflow.
 *
 * Migrate behavior objects into callable/operation graph IR.
 * Requirements and effects bubble at type level and runtime graph level.
 *
 * Note: `edge.kind.actionAppliesOperation` is defined in TypeOperationDialect (R3).
 *
 * See docs/revision/revised_phases.md §R6.
 */

import { defineDialect, dialectId } from "../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../kernel/ods.ts";
import { defineTrait } from "../kernel/symbol.ts";

// === Callable traits ========================================================

export const callableTraits = {
  CALLABLE: defineTrait<{ readonly input: unknown; readonly output: unknown }>(
    "trait.callable.callable",
    "Callable",
    "node",
  ),
  READABLE: defineTrait<true>("trait.callable.readable", "Readable", "node"),
  WRITABLE: defineTrait<true>("trait.callable.writable", "Writable", "node"),
  EFFECTFUL: defineTrait<unknown>("trait.callable.effectful", "Effectful", "node"),
  PLAN: defineTrait<true>("trait.callable.plan", "Plan", "node"),
  DISPATCH: defineTrait<true>("trait.callable.dispatch", "Dispatch", "node"),
  WORKFLOW: defineTrait<true>("trait.callable.workflow", "Workflow", "node"),
  REQUIRES: defineTrait<readonly string[]>("trait.callable.requires", "Requires", "node"),
  BATCHABLE: defineTrait<true>("trait.callable.batchable", "Batchable", "node"),
  STREAMING: defineTrait<true>("trait.callable.streaming", "Streaming", "node"),
} as const;

// === Node kinds =============================================================

export const QUERY_NODE_KIND = defineNodeKind({
  id: "node.kind.query",
  dialect: "dialect.callable",
  traits: [callableTraits.CALLABLE, callableTraits.READABLE],
  metadata: { title: "Query" },
});

export const STATIC_FUNCTION_NODE_KIND = defineNodeKind({
  id: "node.kind.static",
  dialect: "dialect.callable",
  traits: [callableTraits.CALLABLE],
  metadata: { title: "Static function" },
});

export const EXPR_FUNCTION_NODE_KIND = defineNodeKind({
  id: "node.kind.exprFunction",
  dialect: "dialect.callable",
  traits: [callableTraits.CALLABLE],
  metadata: { title: "Expression function" },
});

export const PREDICATE_FUNCTION_NODE_KIND = defineNodeKind({
  id: "node.kind.predicateFunction",
  dialect: "dialect.callable",
  traits: [callableTraits.CALLABLE, callableTraits.READABLE],
  metadata: { title: "Predicate function" },
});

export const QUERY_EXPRESSION_NODE_KIND = defineNodeKind({
  id: "node.kind.queryExpression",
  dialect: "dialect.callable",
  traits: [callableTraits.READABLE],
  metadata: { title: "Query expression" },
});

export const ACTION_NODE_KIND = defineNodeKind({
  id: "node.kind.action",
  dialect: "dialect.callable",
  traits: [callableTraits.CALLABLE, callableTraits.WRITABLE, callableTraits.EFFECTFUL],
  metadata: { title: "Action" },
});

export const PATCH_NODE_KIND = defineNodeKind({
  id: "node.kind.patch",
  dialect: "dialect.callable",
  traits: [callableTraits.CALLABLE, callableTraits.WRITABLE],
  metadata: { title: "Patch" },
});

export const PLAN_NODE_KIND = defineNodeKind({
  id: "node.kind.plan",
  dialect: "dialect.callable",
  traits: [callableTraits.PLAN, callableTraits.CALLABLE],
  metadata: { title: "Plan" },
});

export const CROSS_STORE_PLANNER_NODE_KIND = defineNodeKind({
  id: "node.kind.crossStorePlanner",
  dialect: "dialect.callable",
  traits: [callableTraits.PLAN],
  metadata: { title: "Cross-store planner" },
});

export const DISPATCH_NODE_KIND = defineNodeKind({
  id: "node.kind.dispatch",
  dialect: "dialect.callable",
  traits: [callableTraits.DISPATCH, callableTraits.CALLABLE],
  metadata: { title: "Dispatch" },
});

export const WORKFLOW_NODE_KIND = defineNodeKind({
  id: "node.kind.workflow",
  dialect: "dialect.callable",
  traits: [callableTraits.WORKFLOW, callableTraits.CALLABLE],
  metadata: { title: "Workflow" },
});

export const API_ROUTE_NODE_KIND = defineNodeKind({
  id: "node.kind.apiRoute",
  dialect: "dialect.callable",
  traits: [],
  metadata: { title: "API route" },
});

export const GETTER_NODE_KIND = defineNodeKind({
  id: "node.kind.getter",
  dialect: "dialect.callable",
  traits: [callableTraits.READABLE],
  metadata: { title: "Getter" },
});

export const MUTATOR_NODE_KIND = defineNodeKind({
  id: "node.kind.mutator",
  dialect: "dialect.callable",
  traits: [callableTraits.WRITABLE],
  metadata: { title: "Mutator" },
});

// === Edge kinds =============================================================

/** Query reads edge: query → entity/field/rule it reads. */
export const QUERY_READS_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.queryReads",
  dialect: "dialect.callable",
  endpoints: [
    defineEndpointRole("query", { targetKinds: [QUERY_NODE_KIND] }),
    defineEndpointRole("read", {}),
  ],
  metadata: { title: "Query reads" },
});

/** Action writes edge: action → entity/field it writes. */
export const ACTION_WRITES_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.actionWrites",
  dialect: "dialect.callable",
  endpoints: [
    defineEndpointRole("action", { targetKinds: [ACTION_NODE_KIND] }),
    defineEndpointRole("write", {}),
  ],
  metadata: { title: "Action writes" },
});

/** Action writes field edge: action → specific field it writes (field-level precision). */
export type ActionWritesFieldCustom = {
  readonly operation: "insert" | "update" | "delete";
  readonly field_name: string;
  /**
   * Stable field identity, mirroring `field.id ?? field.name` (the same
   * convention used by `fieldKey` in `src/reactivity/rule-derived.ts` for
   * rule-read fields). Lets write-set/read-set comparisons line up without
   * depending on the kernel node-ref id format.
   */
  readonly field_key: string;
  readonly entity_name: string;
  readonly has_condition: boolean;
  readonly value_expr_id?: string;
};

export const ACTION_WRITES_FIELD_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.actionWritesField",
  dialect: "dialect.callable",
  endpoints: [
    defineEndpointRole("action", { targetKinds: [ACTION_NODE_KIND] }),
    // Unrestricted, like `RULE_READS_EDGE_KIND`'s "read" role and
    // `QUERY_READS_EDGE_KIND`'s "read" role: the target is a `FieldRef`
    // (the field's own typed ref), not a synthesized FIELD_NODE_KIND node
    // ref, so read-set/write-set field identity lines up across dialects.
    defineEndpointRole("field", {}),
  ],
  custom: undefined as unknown as ActionWritesFieldCustom,
  metadata: { title: "Action writes field" },
});

/** Dispatch triggers edge: dispatch → callable it triggers. */
export const DISPATCH_TRIGGERS_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.dispatchTriggers",
  dialect: "dialect.callable",
  endpoints: [
    defineEndpointRole("dispatch", { targetKinds: [DISPATCH_NODE_KIND] }),
    defineEndpointRole("triggered", {
      targetKinds: [QUERY_NODE_KIND, ACTION_NODE_KIND, WORKFLOW_NODE_KIND],
    }),
  ],
  metadata: { title: "Dispatch triggers" },
});

/** Dispatch handles edge: dispatch → event/error it handles. */
export const DISPATCH_HANDLES_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.dispatchHandles",
  dialect: "dialect.callable",
  endpoints: [
    defineEndpointRole("dispatch", { targetKinds: [DISPATCH_NODE_KIND] }),
    defineEndpointRole("handled", {}),
  ],
  metadata: { title: "Dispatch handles" },
});

/** Workflow contains step edge: workflow → step node. */
export const WORKFLOW_CONTAINS_STEP_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.workflowContainsStep",
  dialect: "dialect.callable",
  endpoints: [
    defineEndpointRole("workflow", { targetKinds: [WORKFLOW_NODE_KIND] }),
    defineEndpointRole("step", {}),
  ],
  metadata: { title: "Workflow contains step" },
});

/** Plan chains to edge: plan → next plan in sequence. */
export const PLAN_CHAINS_TO_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.planChainsTo",
  dialect: "dialect.callable",
  endpoints: [
    defineEndpointRole("plan", { targetKinds: [PLAN_NODE_KIND] }),
    defineEndpointRole("next", {
      targetKinds: [PLAN_NODE_KIND, QUERY_NODE_KIND, ACTION_NODE_KIND],
    }),
  ],
  metadata: { title: "Plan chains to" },
});

/** Plan fallback edge: plan → fallback plan on failure. */
export const PLAN_FALLBACK_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.planFallback",
  dialect: "dialect.callable",
  endpoints: [
    defineEndpointRole("primary", { targetKinds: [PLAN_NODE_KIND] }),
    defineEndpointRole("fallback", {
      targetKinds: [PLAN_NODE_KIND, QUERY_NODE_KIND, ACTION_NODE_KIND],
    }),
  ],
  metadata: { title: "Plan fallback" },
});

// === Dialect definition =====================================================

export const CallableDialect = defineDialect({
  id: dialectId("dialect.callable"),
  namespace: "callable",
  label: "Callable",
  nodeKinds: [
    STATIC_FUNCTION_NODE_KIND,
    EXPR_FUNCTION_NODE_KIND,
    PREDICATE_FUNCTION_NODE_KIND,
    QUERY_NODE_KIND,
    QUERY_EXPRESSION_NODE_KIND,
    ACTION_NODE_KIND,
    PATCH_NODE_KIND,
    PLAN_NODE_KIND,
    CROSS_STORE_PLANNER_NODE_KIND,
    DISPATCH_NODE_KIND,
    WORKFLOW_NODE_KIND,
    API_ROUTE_NODE_KIND,
    GETTER_NODE_KIND,
    MUTATOR_NODE_KIND,
  ],
  edgeKinds: [
    QUERY_READS_EDGE_KIND,
    ACTION_WRITES_EDGE_KIND,
    ACTION_WRITES_FIELD_EDGE_KIND,
    DISPATCH_TRIGGERS_EDGE_KIND,
    DISPATCH_HANDLES_EDGE_KIND,
    WORKFLOW_CONTAINS_STEP_EDGE_KIND,
    PLAN_CHAINS_TO_EDGE_KIND,
    PLAN_FALLBACK_EDGE_KIND,
  ],
  traits: Object.values(callableTraits),
  passes: [],
  lowerings: [],
  metadata: {
    title: "Callable Dialect",
    description:
      "Query, action, patch, plan, dispatch, and workflow node kinds with read/write/apply edges.",
  },
});
