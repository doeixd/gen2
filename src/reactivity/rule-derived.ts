/* @__NO_SIDE_EFFECTS__ */
/**
 * Rule-derived reactivity — Levels 1–4 invalidation, IVM, and diagnostics.
 *
 * See atom_plan.md § Rule-Derived Reactivity.
 */

import { type Diagnostic, diagnostic, type GenContext } from "../core/index.ts";
import type { Field, Entity } from "../entity/index.ts";
import type { ActionFunction } from "../function/index.ts";
import type { Rule, RuleExpr } from "../rules/index.ts";
import { extractRuleDependencies } from "../rules/index.ts";
import type { ReactiveKeyPattern } from "./reactivity.ts";
import { anyKey } from "./reactivity.ts";

// --- Write-set extraction --------------------------------------------------

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

// --- Overlap detection -----------------------------------------------------

const writeSetOverlapsRule = <Name extends string, Vars = unknown>(
  writeSet: WriteSet,
  rule: Rule<Name, Vars>,
): boolean => {
  const deps = extractRuleDependencies(rule);
  for (const e of writeSet.entities) {
    if (deps.entities.includes(e)) return true;
  }
  for (const f of writeSet.fields) {
    if (deps.fields.includes(f)) return true;
  }
  return false;
};

// --- Rule structure analysis -----------------------------------------------

const isSimpleEqualityRule = <Name extends string, Vars = unknown>(
  rule: Rule<Name, Vars>,
): boolean => {
  const { body } = rule;
  return body.kind === "rule.eq";
};

const ruleHasExists = (expr: RuleExpr): boolean => {
  if (expr.kind === "rule.exists") return true;
  if (expr.kind === "rule.and" || expr.kind === "rule.or") {
    return expr.terms.some((t) => ruleHasExists(t));
  }
  if (expr.kind === "rule.not") {
    return ruleHasExists(expr.term);
  }
  return false;
};

// --- Cross-store detection -------------------------------------------------

const storesForRuleDeps = <Name extends string, Vars = unknown>(
  rule: Rule<Name, Vars>,
): Set<string> => {
  const deps = extractRuleDependencies(rule);
  const stores = new Set<string>();
  for (const e of deps.entities) {
    if (e.store_name) stores.add(e.store_name);
  }
  return stores;
};

// --- Time-dependent detection ----------------------------------------------

const isTemporalType = (typeName: string): boolean =>
  typeName === "datetime" || typeName === "timestamp" || typeName === "date";

const ruleIsTimeDependent = <Name extends string, Vars = unknown>(
  rule: Rule<Name, Vars>,
): boolean => {
  for (const v of rule.vars) {
    if (isTemporalType(v.semanticType.kind)) return true;
  }
  const deps = extractRuleDependencies(rule);
  for (const f of deps.fields) {
    if (isTemporalType(f.semantic_type.kind)) return true;
  }
  return false;
};

// --- Precision determination -----------------------------------------------

export type InvalidationPrecision = "broad" | "matched" | "exact" | "patchable";
export type InvalidationConfidence = "conservative" | "proven";

const deriveInvalidationPrecision = <Name extends string, Vars = unknown>(
  writeSet: WriteSet,
  rule: Rule<Name, Vars>,
): { precision: InvalidationPrecision; confidence: InvalidationConfidence } => {
  // Level 4 — patchable: simple equality rule, mutation only touches that field
  if (isSimpleEqualityRule(rule)) {
    const deps = extractRuleDependencies(rule);
    const ruleFields = deps.fields;
    if (ruleFields.length === 1) {
      const onlyField = ruleFields[0]!;
      if (writeSet.fields.length === 1 && writeSet.fields[0] === onlyField) {
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
  readonly rule: Rule;
  readonly keyFamily: import("./reactivity.ts").KeyFamily;
  readonly fields: readonly Field[];
}

export interface DerivedInvalidationPlan {
  readonly kind: "derived_invalidation_plan";
  readonly mutation: ActionFunction;
  readonly affectedRules: readonly Rule[];
  readonly invalidates: readonly ReactiveKeyPattern[];
  readonly precision: InvalidationPrecision;
  readonly appliedPrecision: InvalidationPrecision;
  readonly confidence: InvalidationConfidence;
}

export interface IvmMaintenancePlan {
  readonly kind: "ivm_maintenance_plan";
  readonly rule: Rule;
  readonly maintainedRelation: string;
  readonly deltaMode: "insert" | "delete" | "update" | "unsupported";
}

export interface RulePatchPlan {
  readonly kind: "rule_patch_plan";
  readonly rule: Rule;
  readonly mutation: ActionFunction;
  readonly keyFamily?: import("./reactivity.ts").KeyFamily;
  readonly operation: "insert" | "update" | "delete" | "key_patch";
  readonly provenance: "proven" | "conservative";
  readonly field?: Field;
}

// --- Derivation ------------------------------------------------------------

export const deriveRuleInvalidationPlans = (ctx: GenContext): DerivedInvalidationPlan[] => {
  const plans: DerivedInvalidationPlan[] = [];

  for (const action of ctx.action_functions) {
    const writeSet = extractWriteSet(action);
    const affectedRules: Rule[] = [];
    const invalidates: ReactiveKeyPattern[] = [];
    const seenFamilies = new Set<string>();
    let overallPrecision: InvalidationPrecision = "broad";
    let overallConfidence: InvalidationConfidence = "conservative";

    for (const rule of ctx.rules) {
      if (!writeSetOverlapsRule(writeSet, rule)) continue;
      affectedRules.push(rule);

      const { precision, confidence } = deriveInvalidationPrecision(writeSet, rule);
      if (precision === "patchable") {
        overallPrecision = "patchable";
        overallConfidence = confidence;
      } else if (precision === "matched" && overallPrecision === "broad") {
        overallPrecision = "matched";
        overallConfidence = confidence;
      }

      for (const policy of ctx.policies) {
        if (policy.predicate !== rule) continue;

        for (const query of ctx.query_functions) {
          if (!query.auth || query.auth.policy_name !== policy.name) continue;
          const declaredKey = query.reactivity?.key;
          if (!declaredKey) continue;
          const family = declaredKey.family;
          if (seenFamilies.has(family.name)) continue;
          seenFamilies.add(family.name);
          invalidates.push(anyKey(family));
        }
      }
    }

    if (affectedRules.length > 0) {
      plans.push({
        kind: "derived_invalidation_plan",
        mutation: action,
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

// --- Monotonicity analysis -------------------------------------------------

const isMonotonicRule = (expr: RuleExpr): boolean => {
  switch (expr.kind) {
    case "rule.eq":
    case "rule.compare":
      return true;
    case "rule.and":
      return expr.terms.every(isMonotonicRule);
    case "rule.or":
      return false; // Disjunction breaks monotonicity for IVM
    case "rule.not":
      return false; // Negation breaks monotonicity for IVM
    case "rule.exists":
      return false; // Exists breaks monotonicity for IVM
    default:
      return true;
  }
};

// --- IVM -------------------------------------------------------------------

export const deriveIvmPlans = (ctx: GenContext): readonly IvmMaintenancePlan[] => {
  const plans: IvmMaintenancePlan[] = [];
  for (const rule of ctx.rules) {
    if (!isMonotonicRule(rule.body)) {
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

// --- Checker ---------------------------------------------------------------

export const checkRuleReactivity = (ctx: GenContext): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const plans = deriveRuleInvalidationPlans(ctx);

  for (const plan of plans) {
    for (const rule of plan.affectedRules) {
      out.push(
        diagnostic({
          severity: "info",
          code: "rules-reactivity:mutation-writes-rule-dependency",
          message: `Mutation "${plan.mutation.name}" writes fields/entities read by rule "${rule.name}"`,
        }),
      );
    }

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
  for (const rule of ctx.rules) {
    const stores = storesForRuleDeps(rule);
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
  for (const rule of ctx.rules) {
    if (ruleIsTimeDependent(rule)) {
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
  for (const rule of ctx.rules) {
    if (ruleHasExists(rule.body)) {
      out.push(
        diagnostic({
          severity: "info",
          code: "rules-reactivity:complex-dependency-reduces-precision",
          message: `Rule "${rule.name}" contains 'exists' which may hide dependencies from static analysis, reducing invalidation precision`,
        }),
      );
    }
  }

  // Affected-set-unknown for unscoped mutations
  for (const action of ctx.action_functions) {
    const writeSet = extractWriteSet(action);
    if (!writeSet.hasCondition) {
      for (const rule of ctx.rules) {
        if (writeSetOverlapsRule(writeSet, rule)) {
          out.push(
            diagnostic({
              severity: "warning",
              code: "rules-reactivity:affected-set-unknown",
              message: `Mutation "${action.name}" has no limiting condition; affected set for rule "${rule.name}" is unknown`,
            }),
          );
        }
      }
    }
  }

  // IVM delta support
  const ivmPlans = deriveIvmPlans(ctx);
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

// --- Patch plan derivation --------------------------------------------------

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
    readonly rule: Rule;
    readonly mutation: ActionFunction;
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
      const deps = extractRuleDependencies(rule);
      if (deps.fields.length !== 1) continue;
      const field = deps.fields[0];
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
        const entity = deps.entities[0];
        if (entity) {
          const family = ctx.key_families.find((kf) => kf.name === entity.name);
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

  for (const action of ctx.action_functions) {
    const writeSet = extractWriteSet(action);
    if (writeSet.fields.length !== 1) continue;
    const field = writeSet.fields[0];
    if (!field) continue;

    for (const rule of ctx.rules) {
      if (!isSimpleEqualityRule(rule)) continue;
      const deps = extractRuleDependencies(rule);
      if (deps.fields.length === 1 && deps.fields[0] === field) {
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
