/* @__NO_SIDE_EFFECTS__ */
/**
 * Rule-derived reactivity — Levels 1–4 invalidation, IVM, and diagnostics.
 *
 * Graph-native derivation (R7): invalidation derives from WRITES/READS edge
 * overlap rather than ad-hoc AST walking.
 *
 * See atom_plan.md § Rule-Derived Reactivity,
 * docs/revision/revised_phases.md §R7.
 */

import { type Diagnostic, diagnostic, type GenContext } from "../core/index.ts";
import type { Field, Entity } from "../entity/index.ts";
import type { ActionFunction } from "../function/index.ts";
import type { Rule } from "../rules/index.ts";
import { extractRuleDependencies, extractRuleDependenciesFromGraph } from "../rules/index.ts";
import type { KernelExpr, KernelGraph } from "../kernel/index.ts";
import { defineGraphPattern, edgeKinds, endpointRoles, nodeKinds } from "../kernel/index.ts";
import { GUARDS_ACTION_EDGE_KIND, POLICY_USES_RULE_EDGE_KIND } from "../dialects/auth.ts";
import {
  RULE_DECLARES_VAR_EDGE_KIND,
  RULE_HAS_BODY_EDGE_KIND,
  RULE_NODE_KIND,
  RULE_READS_EDGE_KIND,
} from "../dialects/core/expr-rule.ts";
import {
  ACTION_NODE_KIND,
  ACTION_WRITES_FIELD_EDGE_KIND,
  QUERY_READS_EDGE_KIND,
} from "../dialects/callable.ts";
import { FIELD_NODE_KIND } from "../dialects/domain/entity-field-relation.ts";
import type { ReactiveKeyPattern } from "./reactivity.ts";
import { anyKey, defineKeyFamily } from "./reactivity.ts";
import { findKeyFamilyByNameOnGraph } from "./kernel.ts";

const policyUsesPolicyRoleId = POLICY_USES_RULE_EDGE_KIND.endpoints[0]!.id;
const policyUsesRuleRoleId = POLICY_USES_RULE_EDGE_KIND.endpoints[1]!.id;

// --- Bridge helpers --------------------------------------------------------

export interface GraphActionSummary {
  readonly kind: "action";
  readonly nodeId: string;
  readonly name: string;
  readonly writeFields: Set<string>;
  readonly hasCondition: boolean;
}

export interface GraphQuerySummary {
  readonly kind: "query";
  readonly nodeId: string;
  readonly name: string;
  readonly readFields: Set<string>;
  readonly keyFamily?: { name: string; kind: string };
}

export interface GraphRuleSummary {
  readonly kind: "rule";
  readonly name: string;
  readonly nodeId: string;
  readonly entities: readonly Entity[];
  readonly fields: readonly Field[];
  readonly variables: readonly string[];
  readonly body?: KernelExpr;
}

const operationIdOf = (expr: KernelExpr): string | undefined =>
  (expr as KernelExpr & { readonly operation?: { readonly id?: string } }).operation?.id;

const resolveExpr = (graph: KernelGraph, expr: KernelExpr): KernelExpr =>
  graph.exprs.get(expr.id) ?? expr;

const walkExpr = (
  graph: KernelGraph,
  expr: KernelExpr,
  visit: (expr: KernelExpr) => void,
): void => {
  const resolved = resolveExpr(graph, expr);
  visit(resolved);
  for (const arg of resolved.args) {
    walkExpr(graph, arg.value, visit);
  }
};

const ruleBodyExpr = (graph: KernelGraph, ruleNodeId: string): KernelExpr | undefined => {
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== RULE_HAS_BODY_EDGE_KIND.id) continue;
    const ruleEp = edge.endpoints.find(
      (ep) => ep.role.id === RULE_HAS_BODY_EDGE_KIND.endpoints[0]!.id,
    );
    if (!ruleEp || ruleEp.target.kind !== "node" || ruleEp.target.id !== ruleNodeId) continue;
    const bodyEp = edge.endpoints.find(
      (ep) => ep.role.id === RULE_HAS_BODY_EDGE_KIND.endpoints[1]!.id,
    );
    if (!bodyEp || bodyEp.target.kind !== "expr" || !bodyEp.target.id) continue;
    return graph.exprs.get(bodyEp.target.id);
  }
  return undefined;
};

const declaredVarKinds = (graph: KernelGraph, ruleNodeId: string): readonly string[] => {
  const kinds: string[] = [];
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== RULE_DECLARES_VAR_EDGE_KIND.id) continue;
    const ruleEp = edge.endpoints.find(
      (ep) => ep.role.id === RULE_DECLARES_VAR_EDGE_KIND.endpoints[0]!.id,
    );
    if (!ruleEp || ruleEp.target.kind !== "node" || ruleEp.target.id !== ruleNodeId) continue;
    const varEp = edge.endpoints.find(
      (ep) => ep.role.id === RULE_DECLARES_VAR_EDGE_KIND.endpoints[1]!.id,
    );
    if (!varEp || varEp.target.kind !== "node" || !varEp.target.id) continue;
    const kind = graph.nodes.get(varEp.target.id)?.metadata?.custom?.semantic_type_kind;
    if (typeof kind === "string") kinds.push(kind);
  }
  return kinds;
};

const summarizeRuleNode = (
  graph: KernelGraph,
  node: { readonly id: string; readonly name?: string },
): GraphRuleSummary | undefined => {
  if (!node.name) return undefined;
  const deps = extractRuleDependenciesFromGraph(graph, node.id);
  return {
    kind: "rule",
    name: node.name,
    nodeId: node.id,
    entities: deps.entities,
    fields: deps.fields,
    variables: deps.variables,
    body: ruleBodyExpr(graph, node.id),
  };
};

/**
 * Find all query functions guarded by policies that require the given rule.
 *
 * Walks the graph:
 *   rule ← REQUIRES — policy ← GUARDS — query
 */
const findQueriesForRuleOnGraph = (graph: KernelGraph, ruleNodeId: string): GraphQuerySummary[] => {
  const queries: GraphQuerySummary[] = [];
  const seen = new Set<string>();

  // Find policies that REQUIRES this rule.
  const policyNodeIds = new Set<string>();
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== edgeKinds.REQUIRES.id && edge.kind.id !== POLICY_USES_RULE_EDGE_KIND.id) {
      continue;
    }
    const targetEp = edge.endpoints.find(
      (ep) => ep.role.id === endpointRoles.TARGET.id || ep.role.id === policyUsesRuleRoleId,
    );
    if (!targetEp || targetEp.target.kind !== "node" || targetEp.target.id !== ruleNodeId) {
      continue;
    }
    const sourceEp = edge.endpoints.find(
      (ep) => ep.role.id === endpointRoles.SOURCE.id || ep.role.id === policyUsesPolicyRoleId,
    );
    if (sourceEp && sourceEp.target.kind === "node" && sourceEp.target.id) {
      policyNodeIds.add(sourceEp.target.id);
    }
  }

  // Find queries that GUARDS those policies.
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== GUARDS_ACTION_EDGE_KIND.id) continue;
    const targetEp = edge.endpoints.find(
      (ep) => ep.role.id === GUARDS_ACTION_EDGE_KIND.endpoints[1]!.id,
    );
    if (
      !targetEp ||
      targetEp.target.kind !== "node" ||
      !targetEp.target.id ||
      !policyNodeIds.has(targetEp.target.id)
    ) {
      continue;
    }
    const sourceEp = edge.endpoints.find(
      (ep) => ep.role.id === GUARDS_ACTION_EDGE_KIND.endpoints[0]!.id,
    );
    if (!sourceEp || sourceEp.target.kind !== "node" || !sourceEp.target.id) continue;
    const queryNode = graph.nodes.get(sourceEp.target.id);
    if (!queryNode) continue;

    // Graph-native query summary
    const queryName = queryNode.name ?? queryNode.id;
    const readFields = queryReadFieldsFromGraph(graph, queryNode.id);
    // Read keyFamily from the typed `QueryNodeCustom.query` payload
    // (PLAN.md §0.5 #8 — no `_bridge*` slot).
    const queryCustom = queryNode.metadata?.custom as
      | { readonly query?: { reactivity?: { key?: { family?: { name: string; kind?: string } } } } }
      | undefined;
    const queryFamily = queryCustom?.query?.reactivity?.key?.family;
    const keyFamily = queryFamily
      ? { name: queryFamily.name, kind: queryFamily.kind ?? "key_family" }
      : undefined;

    if (!seen.has(queryName)) {
      seen.add(queryName);
      queries.push({
        kind: "query",
        nodeId: queryNode.id,
        name: queryName,
        readFields,
        keyFamily,
      });
    }
  }

  return queries;
};

// --- Write-set extraction (kept for action object access) ------------------

interface WriteSet {
  readonly entities: readonly Entity[];
  readonly fields: readonly Field[];
  readonly hasCondition: boolean;
}

const extractWriteSet = (action: ActionFunction): WriteSet => {
  const entities = new Set<Entity>();
  const fields = new Set<Field>();
  let hasCondition = false;
  for (const op of action.body.operations) {
    if (op.kind === "invalidate_op") continue;
    entities.add(op.target);
    for (const field of op.values.keys()) {
      fields.add(field);
    }
    if (op.condition) {
      hasCondition = true;
    }
  }
  return { entities: [...entities], fields: [...fields], hasCondition };
};

// --- Graph-native overlap detection ----------------------------------------

/**
 * Returns true if any of the action's WRITES edges flag a `has_condition`
 * in their typed payload (`ActionWritesFieldCustom`).
 */
const actionHasConditionFromGraph = (graph: KernelGraph, actionNodeId: string): boolean => {
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== ACTION_WRITES_FIELD_EDGE_KIND.id) continue;
    const sourceEp = edge.endpoints.find(
      (ep) => ep.role.id === ACTION_WRITES_FIELD_EDGE_KIND.endpoints[0]!.id,
    );
    if (!sourceEp || sourceEp.target.kind !== "node" || sourceEp.target.id !== actionNodeId) {
      continue;
    }
    const custom = edge.metadata?.custom as { has_condition?: boolean } | undefined;
    if (custom?.has_condition) return true;
  }
  return false;
};

/**
 * Return the set of field IDs written by an action, derived from WRITES edges
 * in the graph.
 */
const actionWriteFieldsFromGraph = (graph: KernelGraph, actionNodeId: string): Set<string> => {
  const written = new Set<string>();
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== ACTION_WRITES_FIELD_EDGE_KIND.id) continue;
    const sourceEp = edge.endpoints.find(
      (ep) => ep.role.id === ACTION_WRITES_FIELD_EDGE_KIND.endpoints[0]!.id,
    );
    if (!sourceEp || sourceEp.target.kind !== "node" || sourceEp.target.id !== actionNodeId) {
      continue;
    }
    const targetEp = edge.endpoints.find(
      (ep) => ep.role.id === ACTION_WRITES_FIELD_EDGE_KIND.endpoints[1]!.id,
    );
    if (!targetEp) continue;
    const fieldId = targetEp.target.id ?? targetEp.target.name;
    if (fieldId) written.add(fieldId);
  }
  return written;
};

/**
 * Return the set of field IDs read by a query, derived from QUERY_READS edges
 * in the graph.
 */
const queryReadFieldsFromGraph = (graph: KernelGraph, queryNodeId: string): Set<string> => {
  const read = new Set<string>();
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== QUERY_READS_EDGE_KIND.id) continue;
    const sourceEp = edge.endpoints.find(
      (ep) => ep.role.id === QUERY_READS_EDGE_KIND.endpoints[0]!.id,
    );
    if (!sourceEp || sourceEp.target.kind !== "node" || sourceEp.target.id !== queryNodeId) {
      continue;
    }
    const targetEp = edge.endpoints.find(
      (ep) => ep.role.id === QUERY_READS_EDGE_KIND.endpoints[1]!.id,
    );
    if (!targetEp) continue;
    const fieldId = targetEp.target.id ?? targetEp.target.name;
    if (fieldId) read.add(fieldId);
  }
  return read;
};

// --- Rule structure analysis ----------------------------------------------

const isSimpleEqualityRule = (rule: GraphRuleSummary): boolean =>
  rule.body ? operationIdOf(rule.body) === "op.eq" : false;

const ruleHasExists = (graph: KernelGraph, rule: GraphRuleSummary): boolean => {
  if (!rule.body) return false;
  let hasExists = false;
  walkExpr(graph, rule.body, (expr) => {
    if (operationIdOf(expr) === "op.exists") hasExists = true;
  });
  return hasExists;
};

// --- Cross-store detection (graph-native) ----------------------------------

const storesForRuleDepsFromGraph = (graph: KernelGraph, ruleNodeId: string): Set<string> => {
  const deps = extractRuleDependenciesFromGraph(graph, ruleNodeId);
  const stores = new Set<string>();
  for (const e of deps.entities) {
    if (e.store_name) stores.add(e.store_name);
  }
  return stores;
};

// --- Time-dependent detection (graph-native + bridge) ----------------------

const isTemporalType = (typeName: string): boolean =>
  typeName === "datetime" || typeName === "timestamp" || typeName === "date";

const ruleIsTimeDependentFromGraph = (graph: KernelGraph, rule: GraphRuleSummary): boolean => {
  for (const kind of declaredVarKinds(graph, rule.nodeId)) {
    if (isTemporalType(kind)) return true;
  }
  for (const f of rule.fields) {
    if (isTemporalType(f.semantic_type.kind)) return true;
  }
  return false;
};

// --- Precision determination -----------------------------------------------

export type InvalidationPrecision = "broad" | "matched" | "exact" | "patchable";
export type InvalidationConfidence = "conservative" | "proven";

/**
 * Identity key for a Field as it appears as an edge endpoint target:
 * `target.id ?? target.name`. `FieldRef.id` is the stable id when
 * declared; `FieldRef.name` is just the field name. Mirrors the
 * extraction logic in `actionWriteFieldsFromGraph` /
 * `ruleReadFieldsFromGraph` so cross-comparisons line up.
 */
const fieldKey = (field: Field): string => field.id ?? field.name;

const deriveInvalidationPrecision = (
  writeSet: { readonly fields: readonly string[]; readonly hasCondition: boolean },
  rule: GraphRuleSummary,
): { precision: InvalidationPrecision; confidence: InvalidationConfidence } => {
  // Level 4 — patchable: simple equality rule, mutation only touches that field
  if (isSimpleEqualityRule(rule)) {
    if (rule.fields.length === 1) {
      const onlyFieldKey = fieldKey(rule.fields[0]!);
      if (writeSet.fields.length === 1 && writeSet.fields[0] === onlyFieldKey) {
        return { precision: "patchable", confidence: "proven" };
      }
    }
  }

  // Level 2 — matched: mutation has a condition (scoped), not a full-table write
  if (writeSet.hasCondition) {
    return { precision: "matched", confidence: "conservative" };
  }

  // Level 1 — broad
  return { precision: "broad", confidence: "conservative" };
};

// --- IR Types --------------------------------------------------------------

export interface RuleKeyDependency {
  readonly kind: "rule_key_dependency";
  readonly rule: GraphRuleSummary;
  readonly keyFamily: import("./reactivity.ts").KeyFamily;
  readonly fields: readonly Field[];
}

export interface DerivedInvalidationPlan {
  readonly kind: "derived_invalidation_plan";
  readonly mutation: ActionFunction | GraphActionSummary;
  readonly affectedRules: readonly GraphRuleSummary[];
  readonly invalidates: readonly ReactiveKeyPattern[];
  readonly precision: InvalidationPrecision;
  readonly appliedPrecision: InvalidationPrecision;
  readonly confidence: InvalidationConfidence;
}

export interface IvmMaintenancePlan {
  readonly kind: "ivm_maintenance_plan";
  readonly rule: GraphRuleSummary;
  readonly maintainedRelation: string;
  readonly deltaMode: "insert" | "delete" | "update" | "unsupported";
}

export interface RulePatchPlan {
  readonly kind: "rule_patch_plan";
  readonly rule: GraphRuleSummary | Rule;
  readonly mutation: ActionFunction | GraphActionSummary;
  readonly keyFamily?: import("./reactivity.ts").KeyFamily;
  readonly operation: "insert" | "update" | "delete" | "key_patch";
  readonly provenance: "proven" | "conservative";
  readonly field?: Field;
}

// --- Derivation (graph-native rule iteration) ------------------------------

/**
 * Source-shape pattern for rule-driven invalidation.
 *
 * Matches the canonical chain
 *
 *   Action ──[writes]──> Field <──[reads]── Rule
 *
 * Each match binds one (action, field, rule) triple. Grouping matches by
 * `action` and de-duping by `rule` gives the (action, rule) pairs whose
 * write/read sets overlap on at least one field — i.e. the candidate set
 * `deriveRuleInvalidationPlansFromGraph` used to compute via nested
 * `actionOverlapsRuleOnGraph` checks.
 *
 * PLAN §5 (Next Up): symmetric to `RLS_POLICY_PATTERN` — declaring source
 * shapes as data, with the kernel's pattern matcher handling lookup.
 */
export const RULE_INVALIDATION_SOURCE_PATTERN = defineGraphPattern({
  nodes: {
    action: ACTION_NODE_KIND,
    field: FIELD_NODE_KIND,
    rule: RULE_NODE_KIND,
  },
  edges: {
    actionWritesField: {
      kind: ACTION_WRITES_FIELD_EDGE_KIND,
      endpoints: { action: "action", field: "field" },
    },
    ruleReadsField: {
      kind: RULE_READS_EDGE_KIND,
      endpoints: { rule: "rule", read: "field" },
    },
  },
});

/**
 * Derive rule-driven invalidation plans by walking the graph alone.
 *
 * Track R §R6 — the showcase derivation. Source matching of
 * (action, rule) pairs flows through `RULE_INVALIDATION_SOURCE_PATTERN`;
 * precision, confidence, and key-family bookkeeping run per-action.
 */
export const deriveRuleInvalidationPlansFromGraph = (
  graph: KernelGraph,
): DerivedInvalidationPlan[] => {
  // Group pattern matches by action id; collect distinct rule ids per action.
  const candidatesByAction = new Map<string, Set<string>>();
  for (const match of RULE_INVALIDATION_SOURCE_PATTERN.materialize(graph)) {
    const actionId = match.bindings.action.id;
    const ruleId = match.bindings.rule.id;
    let rules = candidatesByAction.get(actionId);
    if (!rules) {
      rules = new Set<string>();
      candidatesByAction.set(actionId, rules);
    }
    rules.add(ruleId);
  }

  const plans: DerivedInvalidationPlan[] = [];

  for (const [actionNodeId, ruleNodeIds] of candidatesByAction) {
    const actionNode = graph.nodes.get(actionNodeId);
    if (!actionNode || actionNode.kind.id !== nodeKinds.ACTION.id) continue;

    const actionName = actionNode.name ?? actionNode.id;
    const writeFields = actionWriteFieldsFromGraph(graph, actionNode.id);
    const hasCondition = actionHasConditionFromGraph(graph, actionNode.id);
    const writeSet = { fields: [...writeFields], hasCondition };

    const affectedRules: GraphRuleSummary[] = [];
    const invalidates: ReactiveKeyPattern[] = [];
    const seenFamilies = new Set<string>();
    let overallPrecision: InvalidationPrecision = "broad";
    let overallConfidence: InvalidationConfidence = "conservative";

    for (const ruleNodeId of ruleNodeIds) {
      const ruleNode = graph.nodes.get(ruleNodeId);
      if (!ruleNode || ruleNode.kind.id !== nodeKinds.RULE.id) continue;
      const rule = summarizeRuleNode(graph, ruleNode);
      if (!rule) continue;
      affectedRules.push(rule);

      const { precision, confidence } = deriveInvalidationPrecision(writeSet, rule);
      if (precision === "patchable") {
        overallPrecision = "patchable";
        overallConfidence = confidence;
      } else if (precision === "matched" && overallPrecision === "broad") {
        overallPrecision = "matched";
        overallConfidence = confidence;
      }

      for (const query of findQueriesForRuleOnGraph(graph, ruleNodeId)) {
        const declaredKey = query.keyFamily;
        if (!declaredKey) continue;
        if (seenFamilies.has(declaredKey.name)) continue;
        seenFamilies.add(declaredKey.name);
        const family =
          findKeyFamilyByNameOnGraph(graph, declaredKey.name) ?? defineKeyFamily(declaredKey.name);
        invalidates.push(anyKey(family));
      }
    }

    if (affectedRules.length > 0) {
      const graphAction: GraphActionSummary = {
        kind: "action",
        nodeId: actionNode.id,
        name: actionName,
        writeFields,
        hasCondition,
      };
      plans.push({
        kind: "derived_invalidation_plan",
        mutation: graphAction,
        affectedRules,
        invalidates,
        precision: overallPrecision,
        appliedPrecision: overallPrecision === "patchable" ? "patchable" : "broad",
        confidence: overallConfidence,
      });
    }
  }

  return plans;
};

/** GenContext-shaped wrapper for callers still threading a full ctx. */
export const deriveRuleInvalidationPlans = (ctx: GenContext): DerivedInvalidationPlan[] =>
  deriveRuleInvalidationPlansFromGraph(ctx.graph);

// --- Monotonicity analysis (bridge metadata) -------------------------------

const isMonotonicRule = (graph: KernelGraph, rule: GraphRuleSummary): boolean => {
  if (!rule.body) return true;
  let monotonic = true;
  walkExpr(graph, rule.body, (expr) => {
    const opId = operationIdOf(expr);
    if (opId === "op.or" || opId === "op.not" || opId === "op.exists") {
      monotonic = false;
    }
  });
  return monotonic;
};

// --- IVM (graph-native rule iteration) -------------------------------------

export const deriveIvmPlansFromGraph = (graph: KernelGraph): readonly IvmMaintenancePlan[] => {
  const plans: IvmMaintenancePlan[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== nodeKinds.RULE.id) continue;
    const rule = summarizeRuleNode(graph, node);
    if (!rule) continue;

    if (!isMonotonicRule(graph, rule)) {
      plans.push({
        kind: "ivm_maintenance_plan",
        rule,
        maintainedRelation: `ivm_${rule.name}`,
        deltaMode: "unsupported",
      });
    } else {
      // Monotonic rule: all deltas are supported
      plans.push({
        kind: "ivm_maintenance_plan",
        rule,
        maintainedRelation: `ivm_${rule.name}`,
        deltaMode: "insert", // Primary delta mode for monotonic rules
      });
    }
  }
  return plans;
};

export const deriveIvmPlans = (ctx: GenContext): readonly IvmMaintenancePlan[] =>
  deriveIvmPlansFromGraph(ctx.graph);

// --- Checker (graph-native rule iteration) ---------------------------------

export const checkRuleReactivityOnGraph = (graph: KernelGraph): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const plans = deriveRuleInvalidationPlansFromGraph(graph);

  for (const plan of plans) {
    if (plan.precision === "broad" && plan.invalidates.length > 0) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "rules-reactivity:broad-invalidation-selected",
          message: `Mutation "${plan.mutation.name}" uses conservative broad invalidation for ${plan.invalidates.length} key family(s)`,
        }),
      );
    }

    if (plan.precision === "patchable" && plan.appliedPrecision !== "patchable") {
      out.push(
        diagnostic({
          severity: "warning",
          code: "rules-reactivity:patchable-not-applied",
          message: `Mutation "${plan.mutation.name}" could use patchable invalidation, but it was not applied`,
          suggestion: "Enable patchable invalidation in the target configuration.",
        }),
      );
    }
  }

  // Cross-store rule dependency
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== nodeKinds.RULE.id) continue;
    const rule = summarizeRuleNode(graph, node);
    if (!rule) continue;
    const stores = storesForRuleDepsFromGraph(graph, rule.nodeId);
    if (stores.size > 1) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "rules-reactivity:cross-store-rule-dependency",
          message: `Rule "${rule.name}" reads entities from ${stores.size} different stores, which may limit SQL placement`,
        }),
      );
    }
  }

  // Time-dependent rules
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== nodeKinds.RULE.id) continue;
    const rule = summarizeRuleNode(graph, node);
    if (!rule) continue;
    if (ruleIsTimeDependentFromGraph(graph, rule)) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "rules-reactivity:time-dependent-rule",
          message: `Rule "${rule.name}" depends on temporal fields/variables, making it sensitive to evaluation time`,
        }),
      );
    }
  }

  // Complex dependency reduces precision (exists is complex)
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== nodeKinds.RULE.id) continue;
    const rule = summarizeRuleNode(graph, node);
    if (!rule) continue;
    if (ruleHasExists(graph, rule)) {
      out.push(
        diagnostic({
          severity: "info",
          code: "rules-reactivity:complex-dependency-reduces-precision",
          message: `Rule "${rule.name}" contains 'exists' which may hide dependencies from static analysis, reducing invalidation precision`,
        }),
      );
    }
  }

  // IVM delta support
  const ivmPlans = deriveIvmPlansFromGraph(graph);
  for (const plan of ivmPlans) {
    if (plan.deltaMode === "unsupported") {
      out.push(
        diagnostic({
          severity: "warning",
          code: "rules-reactivity:ivm-delta-unsupported",
          message: `Rule "${plan.rule.name}" contains negation, disjunction, or exists; IVM delta maintenance is not supported`,
          suggestion: "Rewrite the rule to use only conjunction and equality/comparison for IVM.",
        }),
      );
    } else {
      out.push(
        diagnostic({
          severity: "info",
          code: "rules-reactivity:ivm-delta-supported",
          message: `Rule "${plan.rule.name}" is monotonic; IVM delta maintenance is supported (${plan.deltaMode} mode)`,
        }),
      );
    }
  }

  return out;
};

export const checkRuleReactivity = (ctx: GenContext): readonly Diagnostic[] =>
  checkRuleReactivityOnGraph(ctx.graph);

// --- Patch plan derivation (graph-native rule iteration) --------------------

/**
 * Derives explicit patch plans for rule-derived invalidations.
 *
 * Only simple equality rules on a single field produce patchable plans.
 * Everything else falls back to broad invalidation.
 */
export const deriveRulePatchPlans = (ctx: GenContext): readonly RulePatchPlan[] => {
  const plans: RulePatchPlan[] = [];
  const invalidationPlans = deriveRuleInvalidationPlans(ctx);
  const seen = new Set<string>();

  const addPlan = (input: {
    readonly rule: GraphRuleSummary | Rule;
    readonly mutation: ActionFunction | GraphActionSummary;
    readonly field: Field;
    readonly keyFamily?: import("./reactivity.ts").KeyFamily;
    readonly provenance: "proven" | "conservative";
  }): void => {
    const key = `${input.mutation.name}:${input.rule.name}:${input.field.name}:${input.keyFamily?.name ?? "none"}`;
    if (seen.has(key)) return;
    seen.add(key);
    plans.push({
      kind: "rule_patch_plan",
      rule: input.rule,
      mutation: input.mutation,
      keyFamily: input.keyFamily,
      operation: "key_patch",
      provenance: input.provenance,
      field: input.field,
    });
  };

  for (const invPlan of invalidationPlans) {
    if (invPlan.precision !== "patchable") continue;

    for (const rule of invPlan.affectedRules) {
      if (rule.fields.length !== 1) continue;
      const field = rule.fields[0];
      if (!field) continue;

      if (invPlan.invalidates.length > 0) {
        for (const pattern of invPlan.invalidates) {
          addPlan({
            rule,
            mutation: invPlan.mutation,
            keyFamily: pattern.family,
            provenance: invPlan.confidence === "proven" ? "proven" : "conservative",
            field,
          });
        }
      } else {
        // Derive key family from the rule's entity when no policy-query chain exists
        const entity = rule.entities[0];
        if (entity) {
          const family = findKeyFamilyByNameOnGraph(ctx.graph, entity.name);
          if (family) {
            addPlan({
              rule,
              mutation: invPlan.mutation,
              keyFamily: family,
              provenance: invPlan.confidence === "proven" ? "proven" : "conservative",
              field,
            });
          }
        }
      }
    }
  }

  for (const actionNode of ctx.graph.nodes.values()) {
    if (actionNode.kind.id !== nodeKinds.ACTION.id) continue;
    const actionCustom = actionNode.metadata?.custom as
      | { readonly action?: ActionFunction }
      | undefined;
    const action = actionCustom?.action;
    if (!action) continue;
    const writeSet = extractWriteSet(action);
    if (writeSet.fields.length !== 1) continue;
    const field = writeSet.fields[0];
    if (!field) continue;

    for (const node of ctx.graph.nodes.values()) {
      if (node.kind.id !== nodeKinds.RULE.id) continue;
      const rule = summarizeRuleNode(ctx.graph, node);
      if (!rule) continue;
      if (!isSimpleEqualityRule(rule)) continue;
      if (rule.fields.length === 1 && rule.fields[0] === field) {
        addPlan({ rule, mutation: action, field, provenance: "proven" });
      }
    }
  }

  return plans;
};

// --- UI Editability Integration --------------------------------------------

/** Derives which fields of an entity may have editability affected by a rule. */
export const deriveEditableFieldsForRule = <Name extends string, Vars = unknown>(
  rule: Rule<Name, Vars>,
): readonly Field[] => {
  const deps = extractRuleDependencies(rule);
  return deps.fields;
};

/** Derives which rules affect the editability of a given field. */
export const deriveEditabilityRulesForField = (
  field: Field,
  rules: readonly Rule[],
): readonly Rule[] => {
  return rules.filter((rule) => {
    const deps = extractRuleDependencies(rule);
    return deps.fields.includes(field);
  });
};
