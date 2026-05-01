/* @__NO_SIDE_EFFECTS__ */
/**
 * Structured Rule Placement Analysis.
 *
 * Returns a ranked list of placement options for a rule, not just a single
 * Placement object. Each option carries safety level, requirements, fallback
 * plans, and per-option diagnostics.
 *
 * See rules_implementation_guide.md §10.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Entity } from "../entity/index.ts";
import type { Rule, RuleExpr } from "./rules.ts";
import { translateRuleToSql, type SqlDialectCapabilities } from "./sql-translator.ts";

// --- Placement Options ------------------------------------------------------

export type RulePlacementKind =
  | "database_predicate"
  | "rls"
  | "server_pre_query"
  | "server_integrated_query"
  | "server_post_filter"
  | "client_hint"
  | "materialized_ivm"
  | "external_evaluator";

export type RulePlacementSafety = "authoritative" | "non_authoritative_hint" | "unsafe";

export interface RulePlacementOption {
  readonly placement: RulePlacementKind;
  readonly supported: boolean;
  readonly safety: RulePlacementSafety;
  readonly requirements: readonly string[];
  readonly fallback?: FallbackPlan;
  readonly diagnostics: readonly Diagnostic[];
}

export type FallbackPlanKind =
  | "server_check"
  | "reject"
  | "degrade_to_hint"
  | "degrade_to_server_form"
  | "degrade_to_refetch"
  | "degrade_to_inline";

export interface FallbackPlan {
  readonly kind: FallbackPlanKind;
  readonly reason: string;
  /** Optional degraded execution mode when the primary plan is unsupported. */
  readonly degrade_to?: "server_form" | "refetch" | "inline" | "hint";
}

export interface RulePlacementAnalysis {
  readonly rule: Rule;
  readonly placements: readonly RulePlacementOption[];
  readonly selected?: RulePlacementOption;
  readonly diagnostics: readonly Diagnostic[];
}

export interface RulePlacement {
  readonly kind: "rule_placement";
  readonly rule: Rule;
  readonly target_entity: Entity;
  readonly selected?: RulePlacementKind;
  readonly options: readonly RulePlacementOption[];
  readonly diagnostics: readonly Diagnostic[];
}

// --- Helpers ----------------------------------------------------------------

const hasExistsExpr = (expr: RuleExpr): boolean => {
  switch (expr.kind) {
    case "rule.exists":
      return true;
    case "rule.and":
    case "rule.or":
      return expr.terms.some(hasExistsExpr);
    case "rule.not":
      return hasExistsExpr(expr.term);
    case "rule.eq":
    case "rule.compare":
      return hasExistsExpr(expr.left) || hasExistsExpr(expr.right);
    default:
      return false;
  }
};

const hasUnsafeNegation = (expr: RuleExpr): boolean => {
  switch (expr.kind) {
    case "rule.not": {
      if (expr.term.kind === "rule.exists") return true;
      if (expr.term.kind === "rule.and" || expr.term.kind === "rule.or") return true;
      if (expr.term.kind === "rule.eq" || expr.term.kind === "rule.compare") return false;
      if (expr.term.kind === "rule.not") return hasUnsafeNegation(expr.term);
      return true;
    }
    case "rule.and":
    case "rule.or":
      return expr.terms.some(hasUnsafeNegation);
    case "rule.exists":
      return hasUnsafeNegation(expr.where);
    case "rule.eq":
    case "rule.compare":
      return hasUnsafeNegation(expr.left) || hasUnsafeNegation(expr.right);
    default:
      return false;
  }
};

const allExistsSameStore = (expr: RuleExpr, targetEntity: Entity): boolean => {
  switch (expr.kind) {
    case "rule.exists": {
      const targetStore = targetEntity.store_name;
      if (!targetStore) return false;
      const fromStore = expr.relation.from_entity.store_name;
      const toStore = expr.relation.to_entity.store_name;
      return fromStore === targetStore && toStore === targetStore;
    }
    case "rule.and":
    case "rule.or":
      return expr.terms.every((t) => allExistsSameStore(t, targetEntity));
    case "rule.not":
      return allExistsSameStore(expr.term, targetEntity);
    case "rule.eq":
    case "rule.compare":
      return (
        allExistsSameStore(expr.left, targetEntity) && allExistsSameStore(expr.right, targetEntity)
      );
    default:
      return true;
  }
};

const hasVariableRef = (expr: RuleExpr): boolean => {
  switch (expr.kind) {
    case "rule.var":
      return true;
    case "rule.field": {
      if ("kind" in expr.source && expr.source.kind === "rule.var") return true;
      return false;
    }
    case "rule.and":
    case "rule.or":
      return expr.terms.some(hasVariableRef);
    case "rule.not":
      return hasVariableRef(expr.term);
    case "rule.eq":
    case "rule.compare":
      return hasVariableRef(expr.left) || hasVariableRef(expr.right);
    default:
      return false;
  }
};

/** Returns true if every direct entity field reference belongs to the target entity. */
const allFieldsOnTargetEntity = (expr: RuleExpr, targetEntity: Entity): boolean => {
  switch (expr.kind) {
    case "rule.field": {
      const src = expr.source;
      if ("kind" in src && src.kind === "rule.var") return true;
      // The source entity must BE the target entity for the predicate to filter target rows
      return src === targetEntity;
    }
    case "rule.eq":
    case "rule.compare":
      return (
        allFieldsOnTargetEntity(expr.left, targetEntity) &&
        allFieldsOnTargetEntity(expr.right, targetEntity)
      );
    case "rule.and":
    case "rule.or":
      return expr.terms.every((t) => allFieldsOnTargetEntity(t, targetEntity));
    case "rule.not":
      return allFieldsOnTargetEntity(expr.term, targetEntity);
    case "rule.exists":
      return allFieldsOnTargetEntity(expr.where, targetEntity);
    default:
      return true;
  }
};

// --- Analysis ---------------------------------------------------------------

/**
 * Analyzes all possible placements for a rule targeting a specific entity.
 *
 * @param rule - The rule to analyze.
 * @param targetEntity - The entity the rule is being applied to.
 * @param capabilities - Optional SQL dialect capabilities.
 * @returns A RulePlacementAnalysis with ranked options and diagnostics.
 */
export const analyzeRulePlacement = (
  rule: Rule,
  targetEntity: Entity,
  capabilities?: SqlDialectCapabilities,
): RulePlacementAnalysis => {
  const placements: RulePlacementOption[] = [];
  const topLevelDiagnostics: Diagnostic[] = [];

  const body = rule.body;
  const entityHasStore = targetEntity.store_name != null && targetEntity.store_name !== "";

  // 1. database_predicate — try SQL translation
  {
    const sqlResult = translateRuleToSql(rule, targetEntity, capabilities);
    const diags = [...sqlResult.diagnostics];
    const fieldsOnTarget = allFieldsOnTargetEntity(body, targetEntity);
    const existsSameStore = allExistsSameStore(body, targetEntity);
    const supported = sqlResult.translatable && entityHasStore && fieldsOnTarget && existsSameStore;

    if (!entityHasStore) {
      diags.push(
        diagnostic({
          severity: "warning",
          code: "rules:not-sql-translatable",
          message: `Entity ${targetEntity.name} has no store_name; cannot place rule as database predicate`,
        }),
      );
    }
    if (!fieldsOnTarget) {
      diags.push(
        diagnostic({
          severity: "info",
          code: "rules:not-sql-translatable",
          message: `Rule ${rule.name} references fields from other entities; database_predicate requires all fields to belong to ${targetEntity.name}`,
        }),
      );
    }
    if (!existsSameStore) {
      diags.push(
        diagnostic({
          severity: "info",
          code: "rules:cross-store-unsupported",
          message: `Rule ${rule.name} contains cross-store exists; cannot place as database predicate`,
        }),
      );
    }

    placements.push({
      placement: "database_predicate",
      supported,
      safety: supported ? "authoritative" : "unsafe",
      requirements: supported ? ["SQL-compatible store", "table mapping"] : [],
      fallback: supported
        ? undefined
        : {
            kind: "server_check",
            reason:
              "SQL translation failed, entity has no store, or rule references other entities/cross-store relations",
          },
      diagnostics: diags,
    });
  }

  // 2. rls — only if simple and entity has store
  {
    const supported = entityHasStore && !hasExistsExpr(body) && !hasUnsafeNegation(body);
    placements.push({
      placement: "rls",
      supported,
      safety: supported ? "authoritative" : "unsafe",
      requirements: supported ? ["Row-level security enabled", "same-store entity"] : [],
      fallback: supported
        ? undefined
        : {
            kind: "server_check",
            reason: "RLS requires simple predicates without exists or unsafe negation",
          },
      diagnostics: supported
        ? []
        : [
            diagnostic({
              severity: "warning",
              code: "rules:not-rls-translatable",
              message: `Rule ${rule.name} cannot be translated to RLS policy due to exists or unsafe negation`,
            }),
          ],
    });
  }

  // 3. server_integrated_query — exists same-store (only when database_predicate isn't possible)
  {
    const hasEx = hasExistsExpr(body);
    const sameStore = allExistsSameStore(body, targetEntity);
    // Supported when same-store exists can be folded into the server query planner.
    const supported = entityHasStore && hasEx && sameStore;

    placements.push({
      placement: "server_integrated_query",
      supported,
      safety: supported ? "authoritative" : "unsafe",
      requirements: supported ? ["Query planner supports integrated filtering"] : [],
      fallback: supported
        ? undefined
        : {
            kind: "server_check",
            reason:
              hasEx && !sameStore
                ? "Cross-store exists requires server composition"
                : "Entity has no store",
          },
      diagnostics: [],
    });
  }

  // 4. server_pre_query — simple item checks
  {
    const supported = !hasExistsExpr(body);
    placements.push({
      placement: "server_pre_query",
      supported,
      safety: supported ? "authoritative" : "unsafe",
      requirements: supported ? ["Server runtime evaluator"] : [],
      fallback: supported
        ? undefined
        : { kind: "reject", reason: "server_pre_query cannot evaluate exists subqueries" },
      diagnostics: [],
    });
  }

  // 5. server_post_filter — explicitly unsafe for lists
  {
    const supported = true; // technically possible but unsafe for lists
    placements.push({
      placement: "server_post_filter",
      supported,
      safety: "unsafe",
      requirements: [],
      fallback: undefined,
      diagnostics: [
        diagnostic({
          severity: "warning",
          code: "authz:unsafe-list-post-filter",
          message: `Rule ${rule.name} placed as server_post_filter would break pagination and may expose timing or count side channels. Add a SQL-translatable predicate or explicitly mark the query as bounded.`,
          suggestion:
            "Rewrite the rule to avoid exists or unsafe negation, or use server_pre_query for item-level checks.",
        }),
      ],
    });
  }

  // 6. client_hint — non-authoritative
  {
    const hasVars = hasVariableRef(body);
    const supported = hasVars; // needs variables to produce meaningful hints
    placements.push({
      placement: "client_hint",
      supported,
      safety: "non_authoritative_hint",
      requirements: supported
        ? ["Client-side rule evaluator", "non-authoritative UI metadata"]
        : [],
      fallback: undefined,
      diagnostics: supported
        ? [
            diagnostic({
              severity: "info",
              code: "rules:client-hint-non-authoritative",
              message: `Client hint for rule ${rule.name} is non-authoritative. Server enforcement is still required.`,
            }),
          ]
        : [
            diagnostic({
              severity: "warning",
              code: "rules:client-hint-not-exact",
              message: `Rule ${rule.name} has no variable references; client hint would be trivial or misleading`,
            }),
          ],
    });
  }

  // 7. materialized_ivm — deferred
  placements.push({
    placement: "materialized_ivm",
    supported: false,
    safety: "unsafe",
    requirements: [],
    fallback: { kind: "reject", reason: "Materialized view placement is not yet supported" },
    diagnostics: [
      diagnostic({
        severity: "info",
        code: "rules:not-sql-translatable",
        message: `Materialized IVM placement for rule ${rule.name} is not supported in this version`,
      }),
    ],
  });

  // 8. external_evaluator — deferred
  placements.push({
    placement: "external_evaluator",
    supported: false,
    safety: "unsafe",
    requirements: [],
    fallback: { kind: "reject", reason: "External evaluator placement is not yet supported" },
    diagnostics: [
      diagnostic({
        severity: "info",
        code: "rules:not-sql-translatable",
        message: `External evaluator for rule ${rule.name} is not supported in this version`,
      }),
    ],
  });

  // Select the first supported authoritative placement as the default
  const preferredOrder: RulePlacementKind[] = [
    "database_predicate",
    "rls",
    "server_integrated_query",
    "server_pre_query",
  ];
  const selected =
    placements.find((p) => p.supported && preferredOrder.includes(p.placement)) ?? undefined;

  // If no authoritative placement is supported, emit a top-level diagnostic
  if (!selected) {
    topLevelDiagnostics.push(
      diagnostic({
        severity: "error",
        code: "rules:not-sql-translatable",
        message: `Rule ${rule.name} has no safe database or server-integrated placement for entity ${targetEntity.name}. List queries protected by this rule cannot be safely executed.`,
        suggestion:
          "Rewrite the rule to use only SQL-translatable constructs (eq, compare, and, or, simple not) on fields of the target entity.",
      }),
    );
  }

  return {
    rule,
    placements,
    selected,
    diagnostics: topLevelDiagnostics,
  };
};

export const classifyRulePlacement = (
  rule: Rule,
  targetEntity: Entity,
  capabilities?: SqlDialectCapabilities,
): RulePlacement => {
  const analysis = analyzeRulePlacement(rule, targetEntity, capabilities);
  return {
    kind: "rule_placement",
    rule,
    target_entity: targetEntity,
    selected: analysis.selected?.placement,
    options: analysis.placements,
    diagnostics: analysis.diagnostics,
  };
};
