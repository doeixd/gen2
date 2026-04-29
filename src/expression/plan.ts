/* @__NO_SIDE_EFFECTS__ */
/**
 * PlanExpr — runtime-aware execution plan. Splits an expression across runtimes
 * and stores with explicit fallback policy. The MissingOperationImplementation
 * rule fires when an assignment targets a runtime that the operation doesn't
 * have an implementation for.
 *
 * See spec/expression.allium :: entity PlanExpr, entity RuntimeAssignment,
 * value FallbackPolicy.
 */

import type { Field } from "../entity/index.ts";
import type { Runtime } from "../types/index.ts";
import type { Expr, ExprPhase } from "./expr.ts";

/**
 * Discriminated kind tag for a PlanExpr.
 *
 * @example
 * ```ts
 * const tag: PlanExprKindTag = "runtime_split";
 * ```
 */
export type PlanExprKindTag = "runtime_split" | "store_split" | "fallback";

/** Kind wrapper for a PlanExpr. */
export interface PlanExprKind {
  /** Concrete kind tag discriminating the plan shape. */
  readonly kind: PlanExprKindTag;
}

/**
 * Policy controlling whether and how a plan may fall back to alternative execution.
 *
 * @example
 * ```ts
 * const policy: FallbackPolicy = {
 *   kind: "allow",
 *   pure_only: true,
 *   deterministic_only: false,
 *   effectful_ok: false,
 * };
 * ```
 */
export interface FallbackPolicy {
  /** Whether fallback is `"allow"`ed or `"deny"`ied. */
  readonly kind: "allow" | "deny";
  /** When true, only pure (side-effect-free) expressions may fall back. */
  readonly pure_only: boolean;
  /** When true, only deterministic expressions may fall back. */
  readonly deterministic_only: boolean;
  /** When true, effectful expressions are permitted to fall back. */
  readonly effectful_ok: boolean;
}

/**
 * Binds a field, runtime, store, and operation into a single execution assignment.
 *
 * @example
 * ```ts
 * const assignment: RuntimeAssignment = {
 *   field: User.fields.id,
 *   assigned_runtime: nodeRuntime,
 *   assigned_store: { name: "primary" },
 *   operation: expr,
 * };
 * ```
 */
export interface RuntimeAssignment {
  /** The field being produced or updated by this assignment. */
  readonly field: Field;
  /** The runtime responsible for evaluating the operation. */
  readonly assigned_runtime: Runtime;
  /** Optional store qualifier (e.g., primary, replica). */
  readonly assigned_store?: { name: string };
  /** The expression whose result is assigned. */
  readonly operation: Expr;
}

/**
 * Runtime-aware execution plan with primary expression, fallback, and assignments.
 *
 * @example
 * ```ts
 * const plan: PlanExpr = {
 *   kind: { kind: "runtime_split" },
 *   phase: "query",
 *   primary: primaryExpr,
 *   fallback: fallbackPlan,
 *   fallback_policy: allowFallback({ pure_only: true }),
 *   runtime_assignments: [assignment],
 * };
 * ```
 */
export interface PlanExpr {
  /** Discriminated kind wrapper. */
  readonly kind: PlanExprKind;
  /** Execution phase for the plan. */
  readonly phase: ExprPhase;
  /** The main expression to evaluate. */
  readonly primary: Expr;
  /** Optional nested plan used when the primary cannot be executed. */
  readonly fallback?: PlanExpr;
  /** Constraints governing whether fallback is permitted. */
  readonly fallback_policy: FallbackPolicy;
  /** Concrete assignments mapping operations to runtimes/stores. */
  readonly runtime_assignments: readonly RuntimeAssignment[];
}

/**
 * Creates a fallback policy that allows fallback under specified constraints.
 *
 * @param input - Constraints including pure_only, deterministic_only, and effectful_ok.
 * @returns An allowing FallbackPolicy.
 *
 * @example
 * ```ts
 * const policy = allowFallback({ pure_only: true, effectful_ok: false });
 * ```
 */
export const allowFallback = (input: {
  pure_only?: boolean;
  deterministic_only?: boolean;
  effectful_ok?: boolean;
}): FallbackPolicy => ({
  kind: "allow",
  pure_only: input.pure_only ?? false,
  deterministic_only: input.deterministic_only ?? false,
  effectful_ok: input.effectful_ok ?? false,
});

/**
 * Creates a fallback policy that denies all fallbacks.
 *
 * @returns A denying FallbackPolicy.
 *
 * @example
 * ```ts
 * const policy = denyFallback();
 * ```
 */
export const denyFallback = (): FallbackPolicy => ({
  kind: "deny",
  pure_only: false,
  deterministic_only: false,
  effectful_ok: false,
});
