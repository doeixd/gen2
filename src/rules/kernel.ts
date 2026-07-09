/* @__NO_SIDE_EFFECTS__ */
/**
 * Adapter: Rule → kernel graph IR.
 *
 * Pure conversion from the legacy `Rule` domain object to a kernel
 * `Node(kind: RULE)` plus edges.
 *
 * Aligned with `docs/revision/rules.md.txt`:
 *   - Rule node carries traits: RulePure, RulePredicate.
 *   - RuleHasBody edge connects rule to its boolean expression body.
 *   - RuleReadsField / RuleReadsEntity edges expose dependency surface.
 *
 * The rule body itself is not yet lowered to `KernelExpr` (R4); until
 * then, the body is opaque from the kernel's perspective and the
 * dependency edges are produced by the existing `extractRuleDependencies`
 * helper. The HAS_BODY edge records provenance so future passes know
 * where the rule's logic lives.
 *
 * No `ctx.graph` mutation — registration happens in the binder dual-write.
 *
 * See `docs/revised-kernel.md`, `docs/revision/revised_phases.md` §R4,
 * and `docs/revision/rules.md.txt`.
 */

import type { DerivedRuleView, Rule, RuleDependencies, RuleVarDecl } from "./rules.ts";
import type { Entity, Field } from "../entity/index.ts";
import {
  type KernelEdge,
  type KernelGraph,
  type KernelNode,
  type KernelRef,
  type EdgeKind,
  type EndpointRole,
  type GraphFragment,
  defineEdge,
  defineNode,
  defineTrait,
  graphEdge,
  graphExpr,
  graphFragment,
  graphNode,
  kernelId,
  nodeKinds,
} from "../kernel/index.ts";
import {
  RULE_DECLARES_VAR_EDGE_KIND,
  RULE_HAS_BODY_EDGE_KIND,
  RULE_READS_EDGE_KIND,
} from "../dialects/core/expr-rule.ts";
import { lowerRuleExpr } from "./expr-kernel.ts";

/**
 * Typed payload on a `RULE_READS` edge. Carries the structural
 * `Field` / `Entity` shape the rule is reading so
 * `extractRuleDependenciesFromGraph` can rebuild `RuleDependencies`
 * without a `_bridge*` JS-object side channel (PLAN.md §0.5 #8).
 *
 * `Field` and `Entity` are pure-data interfaces (readonly structural
 * fields), so carrying them under a typed key is structurally
 * equivalent to defining a separate projection — but type-checked
 * at compile time.
 */
export type RuleReadsEdgeCustom = {
  readonly field?: Field;
  readonly entity?: Entity;
};

const edgeKindFromDef = (def: {
  readonly id: string;
  readonly metadata?: { readonly title?: unknown };
}): EdgeKind => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

const endpointRoleFromDef = (def: {
  readonly id: string;
  readonly name: string;
}): EndpointRole => ({
  id: def.id,
  label: def.name,
});

const ruleReadsKind = edgeKindFromDef(RULE_READS_EDGE_KIND);
const ruleHasBodyKind = edgeKindFromDef(RULE_HAS_BODY_EDGE_KIND);
const ruleDeclaresVarKind = edgeKindFromDef(RULE_DECLARES_VAR_EDGE_KIND);
const ruleReadsRuleRole = endpointRoleFromDef(RULE_READS_EDGE_KIND.endpoints[0]!);
const ruleReadsReadRole = endpointRoleFromDef(RULE_READS_EDGE_KIND.endpoints[1]!);
const ruleHasBodyRuleRole = endpointRoleFromDef(RULE_HAS_BODY_EDGE_KIND.endpoints[0]!);
const ruleHasBodyBodyRole = endpointRoleFromDef(RULE_HAS_BODY_EDGE_KIND.endpoints[1]!);
const ruleDeclaresVarRuleRole = endpointRoleFromDef(RULE_DECLARES_VAR_EDGE_KIND.endpoints[0]!);
const ruleDeclaresVarVarRole = endpointRoleFromDef(RULE_DECLARES_VAR_EDGE_KIND.endpoints[1]!);

// ---------------------------------------------------------------------------
// Rule traits — checked semantic claims per rules.md.txt §4
// ---------------------------------------------------------------------------

/** RulePure: the rule body is a pure expression (no effects, no writes). */
export const RulePure = defineTrait("trait.rule.pure", "Rule pure", "node");

/** RulePredicate: the rule is a boolean predicate. */
export const RulePredicate = defineTrait("trait.rule.predicate", "Rule predicate", "node");

/** RuleViewPredicate: the rule view is a boolean predicate. */
export const RuleViewPredicate = defineTrait(
  "trait.ruleView.predicate",
  "Rule-view predicate",
  "node",
);

// ---------------------------------------------------------------------------
// Node builder
// ---------------------------------------------------------------------------

const ruleNodeId = (rule: Rule): string => `node:rule:${rule.name}`;

const ruleNodeRef = (rule: Rule): KernelRef<"node"> => ({
  kind: "node",
  id: kernelId<"node">(ruleNodeId(rule)),
});

const readsEdgeId = (rule: Rule, targetId: string): string =>
  `edge:reads:${rule.name}->${targetId}`;

const varDeclNodeId = (ruleName: string, varName: string): string =>
  `node:var:${ruleName}:${varName}`;

const varDeclNodeRef = (ruleName: string, varName: string): KernelRef<"node"> => ({
  kind: "node",
  id: kernelId<"node">(varDeclNodeId(ruleName, varName)),
});

/** Build a `Node(kind: VAR_DECL)` for a rule variable. */
export const varDeclToKernelNode = (ruleName: string, vd: RuleVarDecl): KernelNode => {
  return defineNode(nodeKinds.VAR_DECL, varDeclNodeId(ruleName, vd.name), {
    name: vd.name,
    metadata: {
      title: vd.name,
      description: `Variable ${vd.name} : ${vd.semanticType.name}`,
      custom: {
        semantic_type_name: vd.semanticType.name,
        semantic_type_kind: vd.semanticType.kind,
      },
    },
  });
};

/** Build the kernel `Node(kind: RULE)` for a rule. */
export const ruleToKernelNode = (rule: Rule): KernelNode => {
  return defineNode(nodeKinds.RULE, ruleNodeId(rule), {
    name: rule.name,
    traits: [RulePure, RulePredicate],
    metadata: {
      title: rule.name,
      description: `Rule with vars: ${rule.vars.map((v) => v.name).join(", ")}`,
    },
  });
};

// ---------------------------------------------------------------------------
// Edge builders
// ---------------------------------------------------------------------------

/**
 * Build edges that describe a rule's relationships:
 *   - HAS_BODY: rule -> body expression
 *   - HAS_VAR: rule -> var-decl (one per declared variable)
 *   - READS: rule -> field (one per referenced field)
 *   - READS: rule -> entity (one per referenced entity)
 *
 * @param bodyExprId - Optional id of the lowered `KernelExpr` for this rule's
 *   body. When provided, `HAS_BODY` targets the real expression; otherwise it
 *   falls back to a synthetic ref.
 */
export const ruleToKernelEdges = (
  rule: Rule,
  deps: RuleDependencies,
  bodyExprId?: string,
): readonly KernelEdge[] => {
  const edges: KernelEdge[] = [];
  const reader = ruleNodeRef(rule);

  // RuleHasBody — points to the rule's boolean expression body.
  edges.push(
    defineEdge(
      ruleHasBodyKind,
      `edge:hasBody:${rule.name}`,
      [
        { role: ruleHasBodyRuleRole, target: reader, cardinality: "one" },
        {
          role: ruleHasBodyBodyRole,
          target: {
            kind: "expr",
            id: kernelId<"expr">(bodyExprId ?? `expr:rule:${rule.name}`),
          },
          cardinality: "one",
        },
      ],
      { metadata: { title: `${rule.name} body` } },
    ),
  );

  // HAS_VAR edges — one per declared variable.
  for (const v of rule.vars) {
    edges.push(
      defineEdge(
        ruleDeclaresVarKind,
        `edge:hasVar:${rule.name}->${v.name}`,
        [
          { role: ruleDeclaresVarRuleRole, target: reader, cardinality: "one" },
          {
            role: ruleDeclaresVarVarRole,
            target: varDeclNodeRef(rule.name, v.name),
            cardinality: "one",
          },
        ],
        { metadata: { title: `${rule.name} declares var ${v.name}` } },
      ),
    );
  }

  // RuleReadsField edges
  for (const field of deps.fields) {
    edges.push(
      defineEdge(
        ruleReadsKind,
        readsEdgeId(rule, field.id ?? `${field.owning_entity.name}.${field.name}`),
        [
          { role: ruleReadsRuleRole, target: reader, cardinality: "one" },
          { role: ruleReadsReadRole, target: field.ref, cardinality: "one" },
        ],
        {
          metadata: {
            title: `${rule.name} reads ${field.name}`,
            custom: { field } satisfies RuleReadsEdgeCustom,
          },
        },
      ),
    );
  }

  // RuleReadsEntity edges
  for (const entity of deps.entities) {
    edges.push(
      defineEdge(
        ruleReadsKind,
        readsEdgeId(rule, entity.id ?? entity.name),
        [
          { role: ruleReadsRuleRole, target: reader, cardinality: "one" },
          { role: ruleReadsReadRole, target: entity.ref, cardinality: "one" },
        ],
        {
          metadata: {
            title: `${rule.name} reads entity ${entity.name}`,
            custom: { entity } satisfies RuleReadsEdgeCustom,
          },
        },
      ),
    );
  }

  return edges;
};

/** Build a composable graph fragment for a rule, its body expression, and dependency edges. */
export const ruleToGraphFragment = (rule: Rule, deps: RuleDependencies): GraphFragment => {
  const lowered = lowerRuleExpr(rule.body, `expr:rule:${rule.name}`);
  return graphFragment(
    graphExpr(lowered.expr),
    ...rule.vars.map((v) => graphNode(varDeclToKernelNode(rule.name, v))),
    graphNode(ruleToKernelNode(rule)),
    ...ruleToKernelEdges(rule, deps, lowered.expr.id).map((edge) => graphEdge(edge)),
    ...lowered.edges.map((edge) => graphEdge(edge)),
  );
};

// ---------------------------------------------------------------------------
// Graph-native dependency extraction — walks edges instead of AST
// ---------------------------------------------------------------------------

/**
 * Extract rule dependencies by walking READS edges from the rule node.
 *
 * This is the graph-native replacement for `extractRuleDependencies(rule)`.
 * It reads the dependency surface that was materialized during dual-write
 * rather than re-traversing the AST.
 */
export const extractRuleDependenciesFromGraph = (
  graph: KernelGraph,
  ruleNodeId: string,
): RuleDependencies => {
  const entities: import("../entity/index.ts").Entity[] = [];
  const fields: import("../entity/index.ts").Field[] = [];
  const relations: import("../relation/index.ts").Relation[] = [];
  const variables: string[] = [];

  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== RULE_READS_EDGE_KIND.id) continue;
    const sourceEp = edge.endpoints.find(
      (ep) => ep.role.id === RULE_READS_EDGE_KIND.endpoints[0]!.id,
    );
    if (!sourceEp || sourceEp.target.kind !== "node" || sourceEp.target.id !== ruleNodeId) {
      continue;
    }

    const targetEp = edge.endpoints.find(
      (ep) => ep.role.id === RULE_READS_EDGE_KIND.endpoints[1]!.id,
    );
    if (!targetEp) continue;

    const target = targetEp.target;
    if (target.kind === "node" && target.id) {
      const targetNode = graph.nodes.get(target.id);
      if (targetNode?.kind.id === nodeKinds.VAR_DECL.id) {
        if (targetNode.name && !variables.includes(targetNode.name)) {
          variables.push(targetNode.name);
        }
      }
    }
    // Typed RULE_READS edge payload — carries the structural Field/Entity
    // the rule reads. Replaces the legacy `_bridge*` JS-object side channel
    // (PLAN.md §0.5 #8).
    const custom = edge.metadata?.custom as RuleReadsEdgeCustom | undefined;
    if (custom?.field && !fields.includes(custom.field)) fields.push(custom.field);
    if (custom?.entity && !entities.includes(custom.entity)) entities.push(custom.entity);
  }

  // Also collect variables from HAS_VAR edges.
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== RULE_DECLARES_VAR_EDGE_KIND.id) continue;
    const sourceEp = edge.endpoints.find(
      (ep) => ep.role.id === RULE_DECLARES_VAR_EDGE_KIND.endpoints[0]!.id,
    );
    if (!sourceEp || sourceEp.target.kind !== "node" || sourceEp.target.id !== ruleNodeId) {
      continue;
    }
    const targetEp = edge.endpoints.find(
      (ep) => ep.role.id === RULE_DECLARES_VAR_EDGE_KIND.endpoints[1]!.id,
    );
    if (!targetEp || targetEp.target.kind !== "node" || !targetEp.target.id) continue;
    const targetNode = graph.nodes.get(targetEp.target.id);
    if (targetNode?.name && !variables.includes(targetNode.name)) {
      variables.push(targetNode.name);
    }
  }

  return { entities, fields, relations, variables };
};

// ---------------------------------------------------------------------------
// Derived rule view bridge
// ---------------------------------------------------------------------------

const ruleViewNodeId = (view: DerivedRuleView): string => `node:ruleView:${view.name}`;

const ruleViewNodeRef = (view: DerivedRuleView): KernelRef<"node"> => ({
  kind: "node",
  id: kernelId<"node">(ruleViewNodeId(view)),
});

/** Build a `Node(kind: RULE_VIEW)` for a derived rule view. */
export const derivedRuleViewToKernelNode = (view: DerivedRuleView): KernelNode =>
  defineNode(nodeKinds.RULE_VIEW, ruleViewNodeId(view), {
    name: view.name,
    traits: [RulePure, RuleViewPredicate],
    metadata: {
      title: view.name,
      description: `Rule view with vars: ${view.input_vars.map((v) => v.name).join(", ")}`,
      custom: {
        projection_vars: view.projection.map((v) => v.name),
      },
    },
  });

/** Build edges for a derived rule view: HAS_BODY, HAS_VAR, READS. */
export const derivedRuleViewToKernelEdges = (
  view: DerivedRuleView,
  deps: RuleDependencies,
  bodyExprId?: string,
): readonly KernelEdge[] => {
  const edges: KernelEdge[] = [];
  const reader = ruleViewNodeRef(view);

  edges.push(
    defineEdge(
      ruleHasBodyKind,
      `edge:hasBody:${view.name}`,
      [
        { role: ruleHasBodyRuleRole, target: reader, cardinality: "one" },
        {
          role: ruleHasBodyBodyRole,
          target: {
            kind: "expr",
            id: kernelId<"expr">(bodyExprId ?? `expr:ruleView:${view.name}`),
          },
          cardinality: "one",
        },
      ],
      { metadata: { title: `${view.name} body` } },
    ),
  );

  for (const v of view.input_vars) {
    edges.push(
      defineEdge(
        ruleDeclaresVarKind,
        `edge:hasVar:${view.name}->${v.name}`,
        [
          { role: ruleDeclaresVarRuleRole, target: reader, cardinality: "one" },
          {
            role: ruleDeclaresVarVarRole,
            target: varDeclNodeRef(view.name, v.name),
            cardinality: "one",
          },
        ],
        { metadata: { title: `${view.name} declares var ${v.name}` } },
      ),
    );
  }

  for (const field of deps.fields) {
    edges.push(
      defineEdge(
        ruleReadsKind,
        `edge:reads:${view.name}->${field.id ?? `${field.owning_entity.name}.${field.name}`}`,
        [
          { role: ruleReadsRuleRole, target: reader, cardinality: "one" },
          { role: ruleReadsReadRole, target: field.ref, cardinality: "one" },
        ],
        {
          metadata: {
            title: `${view.name} reads ${field.name}`,
            custom: { field } satisfies RuleReadsEdgeCustom,
          },
        },
      ),
    );
  }

  for (const entity of deps.entities) {
    edges.push(
      defineEdge(
        ruleReadsKind,
        `edge:reads:${view.name}->${entity.id ?? entity.name}`,
        [
          { role: ruleReadsRuleRole, target: reader, cardinality: "one" },
          { role: ruleReadsReadRole, target: entity.ref, cardinality: "one" },
        ],
        {
          metadata: {
            title: `${view.name} reads entity ${entity.name}`,
            custom: { entity } satisfies RuleReadsEdgeCustom,
          },
        },
      ),
    );
  }

  return edges;
};

export const derivedRuleViewToGraphFragment = (
  view: DerivedRuleView,
  deps: RuleDependencies,
): GraphFragment => {
  const lowered = lowerRuleExpr(view.body, `expr:ruleView:${view.name}`);
  return graphFragment(
    graphExpr(lowered.expr),
    graphFragment(
      ...view.input_vars.map((v) => graphNode(varDeclToKernelNode(view.name, v))),
      graphNode(derivedRuleViewToKernelNode(view)),
      ...derivedRuleViewToKernelEdges(view, deps, lowered.expr.id).map((edge) => graphEdge(edge)),
      ...lowered.edges.map((edge) => graphEdge(edge)),
    ),
  );
};
