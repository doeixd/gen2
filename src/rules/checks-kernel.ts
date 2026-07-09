/* @__NO_SIDE_EFFECTS__ */
/**
 * Graph-native rule checker — kernel-pass migration for rules.
 *
 * Fully graph-native iteration: walks `graph.nodes` filtered by
 * `nodeKinds.RULE`, resolves the lowered `KernelExpr` body through
 * `RULE_HAS_BODY`, and emits diagnostics without recovering the legacy
 * `Rule` object from bridge metadata.
 *
 * See `docs/revised-kernel.md` and `docs/revision/revised_phases.md` §R4.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { KernelExpr, KernelGraph, KernelNode } from "../kernel/index.ts";
import { nodeKinds } from "../kernel/index.ts";
import { RulePure, RulePredicate, RuleViewPredicate } from "./kernel.ts";
import {
  EXPRESSION_READS_FIELD_EDGE_KIND,
  RULE_DECLARES_VAR_EDGE_KIND,
  RULE_HAS_BODY_EDGE_KIND,
} from "../dialects/core/expr-rule.ts";
import { ENTITY_OWNS_FIELD_EDGE_KIND } from "../dialects/domain/entity-field-relation.ts";

const operationIdOf = (expr: KernelExpr): string | undefined =>
  (expr as KernelExpr & { readonly operation?: { readonly id?: string } }).operation?.id;

const literalValue = (expr: KernelExpr): unknown => expr.metadata?.custom?.value;

const refTarget = (
  expr: KernelExpr,
): { readonly kind: "var" | "entity" | "unknown"; readonly name: string } => {
  if (expr.op !== "ref") return { kind: "unknown", name: "" };
  const arg = expr.args[0];
  if (!arg) return { kind: "unknown", name: "" };
  const name = literalValue(arg.value);
  if (typeof name !== "string") return { kind: "unknown", name: "" };
  if (arg.name === "name") return { kind: "var", name };
  if (arg.name === "entity") return { kind: "entity", name };
  return { kind: "unknown", name };
};

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

const declaredVarNodes = (graph: KernelGraph, ruleNodeId: string): readonly KernelNode[] => {
  const nodes: KernelNode[] = [];
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
    const node = graph.nodes.get(varEp.target.id);
    if (node) nodes.push(node);
  }
  return nodes;
};

const projectionVars = (node: KernelNode): readonly string[] => {
  const vars = node.metadata?.custom?.projection_vars;
  return Array.isArray(vars) ? vars.filter((v): v is string => typeof v === "string") : [];
};

const collectUsedVars = (graph: KernelGraph, body: KernelExpr): Set<string> => {
  const used = new Set<string>();
  walkExpr(graph, body, (expr) => {
    const ref = refTarget(expr);
    if (ref.kind === "var") used.add(ref.name);
  });
  return used;
};

const isBooleanKernelExpr = (expr: KernelExpr): boolean => expr.type.kind.id === "type.boolean";

const ruleExprKindOf = (expr: KernelExpr): string | undefined => {
  const kind = expr.metadata?.custom?.rule_expr_kind;
  return typeof kind === "string" ? kind : undefined;
};

const isUnsafeNegation = (graph: KernelGraph, body: KernelExpr): boolean => {
  let unsafe = false;
  walkExpr(graph, body, (expr) => {
    if (unsafe || operationIdOf(expr) !== "op.not") return;
    const term = expr.args[0]?.value;
    if (!term) {
      unsafe = true;
      return;
    }
    const resolvedTerm = resolveExpr(graph, term);
    const termKind = ruleExprKindOf(resolvedTerm);
    if (termKind === "rule.exists" || termKind === "rule.and" || termKind === "rule.or") {
      unsafe = true;
      return;
    }
    const opId = operationIdOf(resolvedTerm);
    if (
      opId === "op.eq" ||
      opId === "op.lt" ||
      opId === "op.lte" ||
      opId === "op.gt" ||
      opId === "op.gte"
    ) {
      return;
    }
    unsafe = true;
  });
  return unsafe;
};

const collectTypeMismatchDiagnostics = (
  graph: KernelGraph,
  body: KernelExpr,
  ruleName: string,
  out: Diagnostic[],
): void => {
  walkExpr(graph, body, (expr) => {
    const opId = operationIdOf(expr);
    if (
      opId !== "op.eq" &&
      opId !== "op.lt" &&
      opId !== "op.lte" &&
      opId !== "op.gt" &&
      opId !== "op.gte"
    ) {
      return;
    }
    const left = expr.args[0]?.value;
    const right = expr.args[1]?.value;
    if (!left || !right) return;
    const leftType = resolveExpr(graph, left).type.kind.label;
    const rightType = resolveExpr(graph, right).type.kind.label;
    if (leftType && rightType && leftType !== rightType) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "rules:type-mismatch",
          message: `Rule "${ruleName}" compares incompatible types: ${leftType} and ${rightType}`,
          suggestion: "Ensure both operands have the same semantic type.",
        }),
      );
    }
  });
};

const entityNodeIdByName = (graph: KernelGraph, entityName: string): string | undefined => {
  for (const node of graph.nodes.values()) {
    if (node.kind.id === nodeKinds.ENTITY.id && node.name === entityName) return node.id;
  }
  return undefined;
};

const ownerEntityNameForField = (graph: KernelGraph, fieldNodeId: string): string | undefined => {
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== ENTITY_OWNS_FIELD_EDGE_KIND.id) continue;
    const fieldEp = edge.endpoints.find(
      (ep) => ep.role.id === ENTITY_OWNS_FIELD_EDGE_KIND.endpoints[1]!.id,
    );
    if (!fieldEp) continue;
    const fieldTarget = fieldEp.target as {
      readonly kind: string;
      readonly id?: string;
      readonly owner?: { readonly name: string };
      readonly name?: string;
    };
    const targetFieldId =
      fieldTarget.kind === "node"
        ? fieldTarget.id
        : fieldTarget.kind === "FieldRef" && fieldTarget.owner && fieldTarget.name
          ? `node:field:${fieldTarget.id ?? `${fieldTarget.owner.name}.${fieldTarget.name}`}`
          : undefined;
    if (targetFieldId !== fieldNodeId) continue;

    const entityEp = edge.endpoints.find(
      (ep) => ep.role.id === ENTITY_OWNS_FIELD_EDGE_KIND.endpoints[0]!.id,
    );
    if (!entityEp) continue;
    const entityTarget = entityEp.target as {
      readonly kind: string;
      readonly id?: string;
      readonly name?: string;
    };
    if (entityTarget.kind === "node" && entityTarget.id) {
      return graph.nodes.get(entityTarget.id)?.name;
    }
    if (entityTarget.kind === "EntityRef") {
      return entityTarget.name;
    }
  }
  return undefined;
};

const fieldNodeIdReadByExpr = (graph: KernelGraph, exprId: string): string | undefined => {
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== EXPRESSION_READS_FIELD_EDGE_KIND.id) continue;
    const exprEp = edge.endpoints.find(
      (ep) => ep.role.id === EXPRESSION_READS_FIELD_EDGE_KIND.endpoints[0]!.id,
    );
    if (!exprEp || exprEp.target.kind !== "expr" || exprEp.target.id !== exprId) continue;
    const fieldEp = edge.endpoints.find(
      (ep) => ep.role.id === EXPRESSION_READS_FIELD_EDGE_KIND.endpoints[1]!.id,
    );
    if (!fieldEp || fieldEp.target.kind !== "node") continue;
    if (fieldEp.target.id) return fieldEp.target.id;
    if (!fieldEp.target.name) return undefined;
    for (const node of graph.nodes.values()) {
      if (node.kind.id === nodeKinds.FIELD.id && node.name === fieldEp.target.name) {
        return node.id;
      }
    }
  }
  return undefined;
};

const collectFieldOwnershipDiagnostics = (
  graph: KernelGraph,
  body: KernelExpr,
  ruleName: string,
  out: Diagnostic[],
): void => {
  walkExpr(graph, body, (expr) => {
    if (expr.op !== "get") return;
    const source = expr.args.find((arg) => arg.name === "source")?.value;
    if (!source) return;
    const sourceRef = refTarget(resolveExpr(graph, source));
    if (sourceRef.kind !== "entity") return;
    const sourceEntityNodeId = entityNodeIdByName(graph, sourceRef.name);
    const fieldNodeId = fieldNodeIdReadByExpr(graph, expr.id);
    if (!sourceEntityNodeId || !fieldNodeId) return;
    const ownerName = ownerEntityNameForField(graph, fieldNodeId);
    if (ownerName && ownerName !== sourceRef.name) {
      const fieldName = graph.nodes.get(fieldNodeId)?.name ?? fieldNodeId;
      out.push(
        diagnostic({
          severity: "error",
          code: "rules:field-not-on-variable",
          message: `Rule "${ruleName}" references field "${fieldName}" on entity "${sourceRef.name}" but the field belongs to "${ownerName}"`,
        }),
      );
    }
  });
};

/**
 * Run the rule-check pass over a kernel graph. Diagnostics are equivalent
 * to those produced by the legacy `checkRules(rules)`.
 *
 * Duplicate-name detection has moved to the builder (throws at definition time).
 * All checks here are fully graph-native.
 */
export const checkRulesOnGraph = (graph: KernelGraph): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // Walk every rule node in the graph.
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== nodeKinds.RULE.id) continue;
    const ruleName = node.name;
    if (!ruleName) continue;

    // Trait validation — aligned with docs/revision/rules.md.txt §4
    const traitIds = new Set(node.traits.map((t) => t.id));
    if (!traitIds.has(RulePure.id)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "rules:missing-pure-trait",
          message: `Rule "${ruleName}" node is missing the RulePure trait`,
        }),
      );
    }
    if (!traitIds.has(RulePredicate.id)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "rules:missing-predicate-trait",
          message: `Rule "${ruleName}" node is missing the RulePredicate trait`,
        }),
      );
    }

    const body = ruleBodyExpr(graph, node.id);
    if (!body) continue;

    // NonBooleanBody
    if (!isBooleanKernelExpr(body)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "rules:non-boolean-body",
          message: `Rule "${ruleName}" body must be a boolean expression`,
        }),
      );
    }

    // UnknownVariable
    const declaredVars = new Set(
      declaredVarNodes(graph, node.id)
        .map((v) => v.name)
        .filter(Boolean),
    );
    const usedVars = collectUsedVars(graph, body);
    for (const v of usedVars) {
      if (!declaredVars.has(v)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "rules:unknown-variable",
            message: `Rule "${ruleName}" uses undeclared variable "${v}"`,
          }),
        );
      }
    }

    // UnsafeNegation
    if (isUnsafeNegation(graph, body)) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "rules:unsafe-negation",
          message: `Rule "${ruleName}" contains negation that may not be safely translatable to SQL`,
        }),
      );
    }

    // TypeMismatch
    collectTypeMismatchDiagnostics(graph, body, ruleName, out);

    // FieldOwnership
    collectFieldOwnershipDiagnostics(graph, body, ruleName, out);

    // UnboundOutputVariable — informational. The slice's predicates
    // routinely declare type-only vars (e.g. `session_org`) that aren't
    // referenced in every body; surfacing this as a warning produces
    // noise without flagging anything dangerous. Real misuse (projecting
    // an unbound var from a derived rule view) is still an error via
    // `rules:view-unbound-output-variable`.
    for (const v of declaredVarNodes(graph, node.id)) {
      if (v.name && !usedVars.has(v.name)) {
        out.push(
          diagnostic({
            severity: "info",
            code: "rules:unbound-output-variable",
            message: `Rule "${ruleName}" declares variable "${v.name}" but never uses it`,
            suggestion: "Remove the unused variable or reference it in the rule body.",
          }),
        );
      }
    }
  }

  return out;
};

/** Pass definition for the rule checker. */
export const ruleCheckPass = {
  name: "rule.check",
  phase: "check" as const,
  description: "Validates rule nodes against boolean body, variables, types, and ownership.",
  reads: ["node:rule"],
};

/**
 * Graph-native derived rule view checker.
 *
 * Walks `graph.nodes` filtered by `nodeKinds.RULE_VIEW`, resolves the
 * lowered `KernelExpr` body through `RULE_HAS_BODY`, and emits
 * diagnostics without recovering the legacy `DerivedRuleView` object.
 */
export const checkDerivedRuleViewsOnGraph = (graph: KernelGraph): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  for (const node of graph.nodes.values()) {
    if (node.kind.id !== nodeKinds.RULE_VIEW.id) continue;
    const viewName = node.name;
    if (!viewName) continue;

    // Trait validation
    const traitIds = new Set(node.traits.map((t) => t.id));
    if (!traitIds.has(RulePure.id)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "rules:view-missing-pure-trait",
          message: `Derived view "${viewName}" node is missing the RulePure trait`,
        }),
      );
    }
    if (!traitIds.has(RuleViewPredicate.id)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "rules:view-missing-predicate-trait",
          message: `Derived view "${viewName}" node is missing the RuleViewPredicate trait`,
        }),
      );
    }

    const body = ruleBodyExpr(graph, node.id);
    if (!body) continue;

    // NonBooleanBody
    if (!isBooleanKernelExpr(body)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "rules:view-non-boolean-body",
          message: `Derived view "${viewName}" body must be a boolean expression`,
        }),
      );
    }

    // UnboundOutputVariable
    const declaredVars = new Set(
      declaredVarNodes(graph, node.id)
        .map((v) => v.name)
        .filter(Boolean),
    );
    const projectedVars = new Set(projectionVars(node));
    const usedVars = collectUsedVars(graph, body);
    for (const v of projectedVars) {
      if (!declaredVars.has(v) && !usedVars.has(v)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "rules:view-unbound-output-variable",
            message: `Derived view "${viewName}" projects unbound variable "${v}"`,
            suggestion: "Bind the variable in the view body or declare it as an input.",
          }),
        );
      }
    }

    // UnsafeNegation
    if (isUnsafeNegation(graph, body)) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "rules:view-unsafe-negation",
          message: `Derived view "${viewName}" contains negation that may not be safely translatable to SQL`,
        }),
      );
    }

    // TypeMismatch
    collectTypeMismatchDiagnostics(graph, body, viewName, out);

    // FieldOwnership
    collectFieldOwnershipDiagnostics(graph, body, viewName, out);
  }

  return out;
};

/** Pass definition for the derived rule view checker. */
export const derivedRuleViewCheckPass = {
  name: "ruleView.check",
  phase: "check" as const,
  description:
    "Validates derived rule view nodes against boolean body, variables, types, and ownership.",
  reads: ["node:ruleView"],
};
