/* @__NO_SIDE_EFFECTS__ */
/**
 * Expression/Rule dialect — R4 dialect for expressions, predicates, and rules.
 *
 * Expressions reference OperationDef nodes. Rules are pure predicate nodes.
 * Rule dependencies derive read edges. Opaque JS is explicit through traits.
 * SQL/client/server lowerability is trait/protocol-based.
 *
 * Note: `ExprUsesOperationEdgeKind` is defined in TypeOperationDialect (R3).
 *
 * See docs/revision/revised_phases.md §R4.
 */

import { defineDialect, dialectId } from "../../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../../kernel/ods.ts";
import { defineTrait } from "../../kernel/symbol.ts";
import { FIELD_NODE_KIND } from "../domain/entity-field-relation.ts";
import { VARIABLE_DECL_NODE_KIND } from "./type-operation.ts";

// === Expression traits ======================================================

export const exprTraits = {
  /** Expression has no side effects. */
  PURE: defineTrait<true>("trait.expr.pure", "Pure expression", "node"),
  /** Expression contains opaque JS that cannot be analyzed or lowered. */
  OPAQUE_JS: defineTrait<true>("trait.expr.opaqueJs", "Opaque JS expression", "node"),
  /** Expression can be serialized and interpreted across targets. */
  PORTABLE: defineTrait<true>("trait.expr.portable", "Portable expression", "node"),
  /** Expression can be lowered to SQL. */
  SQL_LOWERABLE: defineTrait<true>("trait.expr.sqlLowerable", "SQL-lowerable expression", "node"),
  /** Expression is safe to evaluate on the client. */
  CLIENT_SAFE: defineTrait<true>("trait.expr.clientSafe", "Client-safe expression", "node"),
  /** Expression must evaluate on the server. */
  SERVER_ONLY: defineTrait<true>("trait.expr.serverOnly", "Server-only expression", "node"),
} as const;

// === Rule traits ============================================================

export const ruleTraits = {
  /** Rule body is a pure predicate with no side effects. */
  PURE: defineTrait<true>("trait.rule.pure", "Pure rule", "node"),
  /** Rule is a candidate for policy translation (SQL, server check, client metadata). */
  POLICY_CANDIDATE: defineTrait<true>("trait.rule.policyCandidate", "Policy candidate", "node"),
  /** Rule can be evaluated entirely on the client. */
  CLIENT_EVALUABLE: defineTrait<true>(
    "trait.rule.clientEvaluable",
    "Client-evaluable rule",
    "node",
  ),
  /** Rule requires server-side evaluation. */
  SERVER_EVALUABLE: defineTrait<true>(
    "trait.rule.serverEvaluable",
    "Server-evaluable rule",
    "node",
  ),
} as const;

// === Node kinds =============================================================

export const EXPRESSION_NODE_KIND = defineNodeKind({
  id: "node.kind.expression",
  dialect: "dialect.core.exprRule",
  traits: Object.values(exprTraits),
  metadata: { title: "Expression" },
});

export const PREDICATE_NODE_KIND = defineNodeKind({
  id: "node.kind.predicate",
  dialect: "dialect.core.exprRule",
  traits: [...Object.values(exprTraits), ...Object.values(ruleTraits)],
  metadata: { title: "Predicate" },
});

export const RULE_NODE_KIND = defineNodeKind({
  id: "node.kind.rule",
  dialect: "dialect.core.exprRule",
  traits: Object.values(ruleTraits),
  metadata: { title: "Rule" },
});

// === Edge kinds =============================================================

/** Rule reads edge: rule → entity/field/resource it reads. */
export const RULE_READS_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.ruleReads",
  dialect: "dialect.core.exprRule",
  endpoints: [
    defineEndpointRole("rule", { targetKinds: [RULE_NODE_KIND, PREDICATE_NODE_KIND] }),
    defineEndpointRole("read", {}),
  ],
  metadata: { title: "Rule reads" },
});

/** Rule has body edge: rule → predicate/expression body. */
export const RULE_HAS_BODY_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.ruleHasBody",
  dialect: "dialect.core.exprRule",
  endpoints: [
    defineEndpointRole("rule", { targetKinds: [RULE_NODE_KIND, PREDICATE_NODE_KIND] }),
    defineEndpointRole("body", {}),
  ],
  metadata: { title: "Rule has body" },
});

/** Rule guards edge: rule/policy → resource it guards. */
export const RULE_GUARDS_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.ruleGuards",
  dialect: "dialect.core.exprRule",
  endpoints: [
    defineEndpointRole("guard", { targetKinds: [RULE_NODE_KIND, PREDICATE_NODE_KIND] }),
    defineEndpointRole("guarded", {}),
  ],
  metadata: { title: "Rule guards" },
});

/** Rule declares variable edge: rule → variable declaration. */
export const RULE_DECLARES_VAR_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.ruleDeclaresVar",
  dialect: "dialect.core.exprRule",
  endpoints: [
    defineEndpointRole("rule", { targetKinds: [RULE_NODE_KIND, PREDICATE_NODE_KIND] }),
    defineEndpointRole("var", { targetKinds: [VARIABLE_DECL_NODE_KIND] }),
  ],
  metadata: { title: "Rule declares variable" },
});

/** Expression references variable: expr → var decl. */
export const EXPR_READS_VAR_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.exprReadsVar",
  dialect: "dialect.core.exprRule",
  endpoints: [
    defineEndpointRole("expr", { targetKinds: [EXPRESSION_NODE_KIND, PREDICATE_NODE_KIND] }),
    defineEndpointRole("var", { targetKinds: [VARIABLE_DECL_NODE_KIND] }),
  ],
  metadata: { title: "Expression reads variable" },
});

/** Expression reads field edge: expression → field it reads. */
export const EXPRESSION_READS_FIELD_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.expressionReadsField",
  dialect: "dialect.core.exprRule",
  endpoints: [
    defineEndpointRole("expr", { targetKinds: [EXPRESSION_NODE_KIND, PREDICATE_NODE_KIND] }),
    defineEndpointRole("field", { targetKinds: [FIELD_NODE_KIND] }),
  ],
  metadata: { title: "Expression reads field" },
});

// === Dialect definition =====================================================

export const ExprRuleDialect = defineDialect({
  id: dialectId("dialect.core.exprRule"),
  namespace: "core.exprRule",
  label: "Core Expression/Rule",
  nodeKinds: [EXPRESSION_NODE_KIND, PREDICATE_NODE_KIND, RULE_NODE_KIND],
  edgeKinds: [
    RULE_READS_EDGE_KIND,
    RULE_HAS_BODY_EDGE_KIND,
    RULE_GUARDS_EDGE_KIND,
    RULE_DECLARES_VAR_EDGE_KIND,
    EXPR_READS_VAR_EDGE_KIND,
    EXPRESSION_READS_FIELD_EDGE_KIND,
  ],
  traits: [...Object.values(exprTraits), ...Object.values(ruleTraits)],
  passes: [],
  lowerings: [],
  metadata: {
    title: "Core Expression/Rule Dialect",
    description: "Expressions, predicates, and rules with placement and lowerability traits.",
  },
});
