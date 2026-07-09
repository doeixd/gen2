/* @__NO_SIDE_EFFECTS__ */
/**
 * Track R §R3 — Rule lowerability matrix.
 *
 * `lowerability(rule)` returns a typed map of "where can this rule
 * actually run, and if not, why not?" — the AI-consumable contract
 * surface from PLAN.md §R3.
 *
 * Today the matrix has seven cells:
 *
 *   - `serverGuard`  : universal fallback; always supported.
 *   - `sql`          : SQL predicate / RLS — needs SQL-translatable body.
 *   - `client`       : UI disabled-state hint — needs client-safe reads.
 *   - `form`         : form validation — needs single-entity rule body.
 *   - `ivm`          : incremental view maintenance — needs monotonic body.
 *   - `ui`           : UI hint surface — depends on `client`.
 *   - `optimistic`   : exact optimistic patch — needs simple-equality
 *                      monotonic body.
 *
 * Each cell is one of `{ supported: true }` or
 * `{ supported: false, reason, remediation? }`.
 *
 * Because the existing placement analyzer (`analyzeRulePlacement`)
 * requires a `targetEntity`, the matrix infers it from the rule's
 * dependency footprint when not given. Rules that touch zero or many
 * entities downgrade some surfaces to "unsupported / multi-entity".
 *
 * This is the foundation of the "11 derivations" story (PLAN.md §0.2 /
 * Track R §R2). When a rule can't lower somewhere, the AI agent gets a
 * typed remediation it can act on.
 */

import type { Entity } from "../entity/index.ts";
import type { Rule, RuleExpr } from "./rules.ts";
import { extractRuleDependencies } from "./rules.ts";
import { analyzeRulePlacement } from "./placement.ts";
import type { SqlDialectCapabilities } from "./sql-translator.ts";

// --- Public types ----------------------------------------------------------

/** A single lowering surface. Cells are either supported or have a reason. */
export type RuleLowerabilityCell =
  | { readonly supported: true; readonly reason?: string }
  | { readonly supported: false; readonly reason: string; readonly remediation?: string };

/** The seven-cell lowerability matrix per PLAN.md §R3. */
export interface RuleLowerability {
  readonly rule: Rule;
  /** Always supported — the universal enforcement fallback. */
  readonly serverGuard: RuleLowerabilityCell;
  /** SQL predicate / RLS lowering. */
  readonly sql: RuleLowerabilityCell;
  /** Client-safe disabled-state evaluation. */
  readonly client: RuleLowerabilityCell;
  /** Form-validation lowering. */
  readonly form: RuleLowerabilityCell;
  /** Incremental view maintenance. */
  readonly ivm: RuleLowerabilityCell;
  /** UI-hint surface. Mirrors `client`. */
  readonly ui: RuleLowerabilityCell;
  /** Optimistic-update enablement (exact patch precision). */
  readonly optimistic: RuleLowerabilityCell;
}

/** Options passed to `lowerability(rule, options?)`. */
export interface LowerabilityOptions {
  /**
   * Target entity used by SQL / RLS / form analysis. Inferred from the
   * rule's dependencies when omitted (a rule that reads fields from
   * exactly one entity uses that as its target).
   */
  readonly targetEntity?: Entity;
  /** Optional dialect capability set for SQL translation. */
  readonly capabilities?: SqlDialectCapabilities;
}

// --- Internal helpers ------------------------------------------------------

/**
 * A rule body is monotonic for IVM iff it uses only conjunction +
 * eq/compare. Disjunction, negation, and exists break monotonicity.
 * Mirrors `src/reactivity/rule-derived.ts:isMonotonicRule`.
 */
const isMonotonicBody = (expr: RuleExpr): boolean => {
  switch (expr.kind) {
    case "rule.eq":
    case "rule.compare":
      return true;
    case "rule.and":
      return expr.terms.every(isMonotonicBody);
    case "rule.or":
    case "rule.not":
    case "rule.exists":
      return false;
    default:
      return true;
  }
};

/**
 * A rule is "simple equality" iff the body is a single
 * `field == literal`-shaped predicate (or AND of them). Used by the
 * optimistic-patch surface — non-trivial bodies require post-fetch
 * validation rather than a local patch.
 */
const isSimpleEqualityBody = (expr: RuleExpr): boolean => {
  switch (expr.kind) {
    case "rule.eq":
      return true;
    case "rule.and":
      return expr.terms.every(isSimpleEqualityBody);
    default:
      return false;
  }
};

const inferTargetEntity = (rule: Rule, override?: Entity): Entity | undefined => {
  if (override) return override;
  const deps = extractRuleDependencies(rule);
  if (deps.entities.length === 1) return deps.entities[0];
  return undefined;
};

const supported = (reason?: string): RuleLowerabilityCell =>
  reason ? { supported: true, reason } : { supported: true };

const unsupported = (reason: string, remediation?: string): RuleLowerabilityCell => ({
  supported: false,
  reason,
  remediation,
});

// --- Per-surface analyzers -------------------------------------------------

const analyzeSql = (
  rule: Rule,
  target: Entity | undefined,
  capabilities: SqlDialectCapabilities | undefined,
): RuleLowerabilityCell => {
  if (!target) {
    return unsupported(
      "rule reads zero or multiple entities; no single SQL target",
      "narrow the rule to one entity, or use server enforcement",
    );
  }
  const analysis = analyzeRulePlacement(rule, target, capabilities);
  const sqlOption = analysis.placements.find((p) => p.placement === "database_predicate");
  if (sqlOption?.supported) return supported();
  const fallback = sqlOption?.fallback;
  return unsupported(
    sqlOption?.diagnostics[0]?.message ?? "rule body is not SQL-translatable",
    fallback?.kind === "server_check"
      ? "fall back to server enforcement"
      : "rewrite the rule with operations that have SQL lowerings (eq, compare, and, or, not over fields and literals)",
  );
};

const analyzeClient = (rule: Rule, target: Entity | undefined): RuleLowerabilityCell => {
  if (!target) {
    return unsupported(
      "rule reads zero or multiple entities; no single client view",
      "use a typed projection that includes the fields the rule reads",
    );
  }
  const analysis = analyzeRulePlacement(rule, target);
  const clientOption = analysis.placements.find((p) => p.placement === "client_hint");
  if (clientOption?.supported) return supported();
  return unsupported(
    clientOption?.diagnostics[0]?.message ?? "rule body cannot be evaluated client-side",
    "use a `gen.projection` to expose the fields safely, or keep enforcement server-side",
  );
};

const analyzeForm = (rule: Rule, target: Entity | undefined): RuleLowerabilityCell => {
  if (!target) {
    return unsupported(
      "rule reads zero or multiple entities; cannot bind to a single form",
      "split into per-entity rules",
    );
  }
  const deps = extractRuleDependencies(rule);
  if (deps.fields.length === 0) {
    return unsupported("rule has no field reads; nothing to validate against form input");
  }
  return supported();
};

const analyzeIvm = (rule: Rule, target: Entity | undefined): RuleLowerabilityCell => {
  if (!isMonotonicBody(rule.body)) {
    return unsupported(
      "rule body is non-monotonic (uses or/not/exists); IVM cannot maintain it incrementally",
      "rewrite as a positive conjunction, or accept broad invalidation",
    );
  }
  if (!target) {
    return unsupported(
      "IVM needs a single materialized target entity",
      "narrow the rule to one entity",
    );
  }
  // The existing placement analyzer always reports `materialized_ivm:
  // supported: false` because the runtime feature is deferred — but
  // the rule itself is *eligible* once the body is monotonic and the
  // target is single. We expose eligibility here; an actual lowering
  // pass (Track R §R9) will turn this into a real plan node.
  return supported();
};

const analyzeOptimistic = (rule: Rule, target: Entity | undefined): RuleLowerabilityCell => {
  if (!isMonotonicBody(rule.body)) {
    return unsupported(
      "rule body is non-monotonic; optimistic patches cannot be derived locally",
      "rewrite as a positive conjunction or use refetch invalidation",
    );
  }
  if (!isSimpleEqualityBody(rule.body)) {
    return unsupported(
      "rule body is not a pure field-equality predicate; cannot derive an exact patch",
      "for exact optimistic patches, restrict to `field == literal` conjunctions",
    );
  }
  if (!target) {
    return unsupported(
      "optimistic patches need a single target entity",
      "narrow the rule to one entity",
    );
  }
  return supported();
};

// --- Public entry ----------------------------------------------------------

/**
 * Compute the lowerability matrix for a rule.
 *
 * @example
 * ```ts
 * const m = lowerability(canManageIncident);
 * if (!m.client.supported) console.log(m.client.reason, m.client.remediation);
 * ```
 */
export const lowerability = (rule: Rule, options?: LowerabilityOptions): RuleLowerability => {
  const target = inferTargetEntity(rule, options?.targetEntity);
  const capabilities = options?.capabilities;

  const sql = analyzeSql(rule, target, capabilities);
  const client = analyzeClient(rule, target);
  const form = analyzeForm(rule, target);
  const ivm = analyzeIvm(rule, target);
  const optimistic = analyzeOptimistic(rule, target);

  // UI mirrors client — UI hints are surface for client evaluation.
  const ui: RuleLowerabilityCell = client.supported
    ? supported()
    : unsupported("UI hint depends on client lowering", client.remediation);

  return {
    rule,
    serverGuard: supported(),
    sql,
    client,
    form,
    ivm,
    ui,
    optimistic,
  };
};

/**
 * Render a lowerability matrix to a printable string. Useful in
 * `app.explain` traces and PR comments.
 */
export const formatLowerability = (matrix: RuleLowerability): string => {
  const surfaces: ReadonlyArray<readonly [keyof RuleLowerability, string]> = [
    ["serverGuard", "Server guard"],
    ["sql", "SQL / RLS"],
    ["client", "Client evaluation"],
    ["form", "Form validation"],
    ["ivm", "IVM"],
    ["ui", "UI hint"],
    ["optimistic", "Optimistic patch"],
  ];
  const lines = [`Lowerability of rule "${matrix.rule.name}":`];
  for (const [key, label] of surfaces) {
    const cell = matrix[key] as RuleLowerabilityCell;
    if (cell.supported) {
      lines.push(`  ✓ ${label}`);
    } else {
      lines.push(`  ✗ ${label}: ${cell.reason}`);
      if (cell.remediation) {
        lines.push(`     remediation: ${cell.remediation}`);
      }
    }
  }
  return lines.join("\n");
};
