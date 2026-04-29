/* @__NO_SIDE_EFFECTS__ */
/**
 * Runtime Rule Evaluator.
 *
 * A simple server-side interpreter that evaluates Rule AST nodes against a
 * variable bindings map. Useful for tests, item-level checks, and fallback
 * execution.
 *
 * See rules_implementation_guide.md §17.
 */

import type { Rule, RuleExpr } from "./rules.ts";

// --- Evaluation Result ------------------------------------------------------

export interface EvaluationResult {
  readonly value: boolean;
  readonly diagnostics: readonly string[];
}

// --- Context ----------------------------------------------------------------

interface EvalContext {
  readonly bindings: Record<string, unknown>;
  readonly diagnostics: string[];
}

const makeEvalContext = (bindings: Record<string, unknown>): EvalContext => ({
  bindings,
  diagnostics: [],
});

// --- Helpers ----------------------------------------------------------------

const evalError = (ctx: EvalContext, message: string): boolean => {
  ctx.diagnostics.push(message);
  return false;
};

const getVar = (ctx: EvalContext, name: string): unknown => ctx.bindings[name];

const coerceToComparable = (value: unknown): string | number | boolean | Date | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  if (value instanceof Date) return value;
  return JSON.stringify(value);
};

const compareValues = (a: unknown, b: unknown): number => {
  const ca = coerceToComparable(a);
  const cb = coerceToComparable(b);
  if (ca === null && cb === null) return 0;
  if (ca === null) return -1;
  if (cb === null) return 1;
  if (typeof ca === "number" && typeof cb === "number") return ca - cb;
  if (ca instanceof Date && cb instanceof Date) return ca.getTime() - cb.getTime();
  const sa = String(ca);
  const sb = String(cb);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
};

// --- Expression Evaluation --------------------------------------------------

const evaluateExpr = (ctx: EvalContext, expr: RuleExpr): unknown => {
  switch (expr.kind) {
    case "rule.literal": {
      return expr.value;
    }

    case "rule.var": {
      const val = getVar(ctx, expr.name);
      if (val === undefined) {
        return evalError(ctx, `Variable "${expr.name}" is not bound`);
      }
      return val;
    }

    case "rule.field": {
      const src = expr.source;
      if ("kind" in src && src.kind === "rule.var") {
        const entity = getVar(ctx, src.name);
        if (entity == null || typeof entity !== "object") {
          return evalError(ctx, `Variable "${src.name}" is not bound to an object`);
        }
        const fieldName = expr.field.name;
        return (entity as Record<string, unknown>)[fieldName];
      }
      // Direct entity field reference — not evaluable at runtime without a row instance
      return evalError(ctx, `Direct entity field references require a runtime row instance`);
    }

    case "rule.eq": {
      const left = evaluateExpr(ctx, expr.left);
      const right = evaluateExpr(ctx, expr.right);
      return left === right;
    }

    case "rule.compare": {
      const left = evaluateExpr(ctx, expr.left);
      const right = evaluateExpr(ctx, expr.right);
      const cmp = compareValues(left, right);
      switch (expr.op) {
        case "lt":
          return cmp < 0;
        case "lte":
          return cmp <= 0;
        case "gt":
          return cmp > 0;
        case "gte":
          return cmp >= 0;
      }
    }

    case "rule.and": {
      for (const term of expr.terms) {
        const val = evaluateExpr(ctx, term);
        if (val !== true) return false;
      }
      return true;
    }

    case "rule.or": {
      for (const term of expr.terms) {
        const val = evaluateExpr(ctx, term);
        if (val === true) return true;
      }
      return false;
    }

    case "rule.not": {
      const val = evaluateExpr(ctx, expr.term);
      return val !== true;
    }

    case "rule.exists": {
      // Exists requires a relation query context that the runtime evaluator
      // does not have. For MVP, we return false with a diagnostic.
      return evalError(ctx, "Runtime evaluator does not support exists subqueries");
    }

    default:
      return evalError(ctx, `Unsupported rule expression kind: ${(expr as { kind: string }).kind}`);
  }
};

// --- Public API -------------------------------------------------------------

/**
 * Evaluates a rule against a variable bindings map.
 *
 * @param rule - The rule to evaluate.
 * @param bindings - Map of variable names to runtime values.
 * @returns An EvaluationResult with the boolean result and any diagnostics.
 *
 * @example
 * ```ts
 * const result = evaluateRule(canEditProject, {
 *   actor: { id: "user-1", role: "admin" },
 *   project: { id: "proj-1", ownerId: "user-1", status: "draft" },
 * });
 * console.log(result.value); // true
 * ```
 */
export const evaluateRule = (rule: Rule, bindings: Record<string, unknown>): EvaluationResult => {
  const ctx = makeEvalContext(bindings);
  const raw = evaluateExpr(ctx, rule.body);
  const value = raw === true;
  return { value, diagnostics: ctx.diagnostics };
};
