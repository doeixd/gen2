/* @__NO_SIDE_EFFECTS__ */
/**
 * Diagnostic-producing checks that run during the lifecycle's check phase.
 * These mirror the rules in spec/expression.allium and are pure functions that
 * take the relevant entities and emit Diagnostics.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Operation, Runtime } from "../types/index.ts";
import type { Expr } from "./expr.ts";
import type { PlanExpr } from "./plan.ts";

/**
 * SchemaExpressionNoOpaqueJs: schema-phase expressions cannot contain opaque JS.
 *
 * @param exprs - Expressions to validate.
 * @returns Diagnostics for any opaque JS found in schema-phase expressions.
 *
 * @example
 * ```ts
 * const diagnostics = checkSchemaPurity([schemaExpr]);
 * ```
 */
export const checkSchemaPurity = (exprs: readonly Expr[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const e of exprs) {
    if (e.phase === "schema" && e.contains_opaque_js) {
      out.push(
        diagnostic({
          severity: "error",
          code: "expression:opaque-js-in-schema",
          message: "Schema expression contains opaque JavaScript; use static AST nodes only",
        }),
      );
    }
  }
  return out;
};

const SERVER_ONLY_EFFECTS = new Set([
  "db_read",
  "db_write",
  "fs_read",
  "fs_write",
  "payment",
  "queue",
]);

/**
 * ClientExpressionNoServerEffects.
 *
 * @param exprs - Expressions to validate.
 * @returns Diagnostics for any server-only effects in client-phase expressions.
 *
 * @example
 * ```ts
 * const diagnostics = checkClientNoServerEffects([clientExpr]);
 * ```
 */
export const checkClientNoServerEffects = (exprs: readonly Expr[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const e of exprs) {
    if (e.phase !== "client") continue;
    for (const effect of e.effects) {
      if (SERVER_ONLY_EFFECTS.has(effect.kind)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "expression:client-server-effect",
            message: `Client expression contains server-only effect ${effect.kind}`,
          }),
        );
        break;
      }
    }
  }
  return out;
};

const STRING_OPS = new Set(["lower", "upper", "trim", "length", "concat", "contains", "replace"]);
const NUMERIC_OPS = new Set(["add", "sub", "mul", "div", "mod", "abs", "round", "floor", "ceil"]);

/**
 * StringOperationOnNonString rule.
 *
 * @param exprs - Expressions to validate.
 * @returns Diagnostics for any string operations applied to non-string literals.
 *
 * @example
 * ```ts
 * const diagnostics = checkStringOps([expr]);
 * ```
 */
export const checkStringOps = (exprs: readonly Expr[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const e of exprs) {
    if (e.kind.kind !== "op_call" || !e.ast.op) continue;
    const opName = e.ast.op.operation.name;
    if (!STRING_OPS.has(opName)) continue;
    for (const child of e.ast.children) {
      // child is an ExprAstNode; we need its value_type. The current AST model
      // doesn't carry value_type on AST nodes, so we approximate via the parent's
      // expectations (UnaryOpInputTypeMatches and friends already enforce this).
      // Here we walk into the child's literal/ref to detect mismatches. Without
      // a typed child Expr, callers should use the typed builders which already
      // throw on mismatch. We still emit a diagnostic if a literal child has a
      // non-string kind.
      if (child.literal && child.literal.kind !== "string") {
        out.push(
          diagnostic({
            severity: "error",
            code: "expression:string-op-on-non-string",
            message: `String operation ${opName} applied to ${child.literal.kind}`,
          }),
        );
      }
    }
  }
  return out;
};

/**
 * NumericOperationOnNonNumeric rule.
 *
 * @param exprs - Expressions to validate.
 * @returns Diagnostics for any numeric operations applied to non-numeric literals.
 *
 * @example
 * ```ts
 * const diagnostics = checkNumericOps([expr]);
 * ```
 */
export const checkNumericOps = (exprs: readonly Expr[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const e of exprs) {
    if (e.kind.kind !== "op_call" || !e.ast.op) continue;
    const opName = e.ast.op.operation.name;
    if (!NUMERIC_OPS.has(opName)) continue;
    for (const child of e.ast.children) {
      if (child.literal && child.literal.kind !== "integer" && child.literal.kind !== "decimal") {
        out.push(
          diagnostic({
            severity: "error",
            code: "expression:numeric-op-on-non-numeric",
            message: `Numeric operation ${opName} applied to ${child.literal.kind}`,
          }),
        );
      }
    }
  }
  return out;
};

/**
 * AggregationOverAmbiguousType rule.
 *
 * @param exprs - Expressions to validate.
 * @returns Diagnostics for any aggregation over types without defined aggregation representation.
 *
 * @example
 * ```ts
 * const diagnostics = checkAggregationAmbiguous([aggExpr]);
 * ```
 */
export const checkAggregationAmbiguous = (exprs: readonly Expr[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const e of exprs) {
    if (e.kind.kind !== "op_call" || !e.ast.op) continue;
    if (e.ast.op.operation.kind !== "aggregate") continue;
    if (e.ast.children.length !== 1) continue;
    // We need the child's value_type, which our AST doesn't carry. The typed
    // builder applyAggregate already verified the operand at construction time.
    // Here we look at the operation's input_type for ambiguity instead.
    const inputRepr = e.ast.op.operation.input_type?.storage_repr;
    if (inputRepr && !inputRepr.aggregate) {
      out.push(
        diagnostic({
          severity: "error",
          code: "expression:ambiguous-aggregation",
          message: `Aggregation ${e.ast.op.operation.name} over type without defined aggregation representation`,
        }),
      );
    }
  }
  return out;
};

/**
 * MissingOperationImplementationForAssignedRuntime: when a PlanExpr explicitly
 * places an operation on a runtime, the operation must have an implementation
 * for that runtime.
 *
 * @param plans - Plan expressions to validate.
 * @returns Diagnostics for missing operation implementations.
 *
 * @example
 * ```ts
 * const diagnostics = checkPlanImplementations([planExpr]);
 * ```
 */
export const checkPlanImplementations = (plans: readonly PlanExpr[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const plan of plans) {
    for (const a of plan.runtime_assignments) {
      const op = a.operation.ast.op;
      if (!op) continue;
      const found = op.operation.implementations.some(
        (impl) => impl.runtime === a.assigned_runtime.name,
      );
      if (!found) {
        out.push(
          diagnostic({
            severity: "error",
            code: "expression:missing-operation-implementation",
            message: `Operation ${op.operation.name} has no implementation for runtime ${a.assigned_runtime.name}`,
          }),
        );
      }
    }
  }
  return out;
};

/**
 * PlanExprHasAssignments invariant.
 *
 * @param plans - Plan expressions to validate.
 * @returns Diagnostics for any plan without runtime assignments.
 *
 * @example
 * ```ts
 * const diagnostics = checkPlanHasAssignments([planExpr]);
 * ```
 */
export const checkPlanHasAssignments = (plans: readonly PlanExpr[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const plan of plans) {
    if (plan.runtime_assignments.length === 0) {
      out.push(
        diagnostic({
          severity: "error",
          code: "expression:empty-plan",
          message: "PlanExpr has no runtime assignments",
        }),
      );
    }
  }
  return out;
};

/**
 * UnsupportedRuntimeEffect (generic): an effect on an Expr placed on a runtime
 * must appear in that runtime's capabilities.
 *
 * @param expr - The expression to validate.
 * @param runtimes - Runtimes to check against.
 * @returns Diagnostics for any unsupported effects.
 *
 * @example
 * ```ts
 * const diagnostics = checkRuntimeEffects(expr, [nodeRuntime, edgeRuntime]);
 * ```
 */
export const checkRuntimeEffects = (
  expr: Expr,
  runtimes: readonly Runtime[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const runtime of runtimes) {
    for (const effect of expr.effects) {
      if (!runtime.capabilities.includes(effect.kind)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "runtime:unsupported-operation",
            message: `Effect ${effect.kind} not supported by runtime ${runtime.name}`,
          }),
        );
      }
    }
  }
  return out;
};

/**
 * Operation kind/field consistency from spec/types.allium :: invariant
 * OperationKindFieldsConsistent. Pulled here because operations are typically
 * registered alongside expressions.
 *
 * @param operations - Operations to validate.
 * @returns Diagnostics for duplicate implementations per runtime.
 *
 * @example
 * ```ts
 * const diagnostics = checkOperations([addOp, subtractOp]);
 * ```
 */
export const checkOperations = (operations: readonly Operation[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const op of operations) {
    const seenRuntimes = new Set<string>();
    for (const impl of op.implementations) {
      if (seenRuntimes.has(impl.runtime)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "types:duplicate-implementation",
            message: `Operation ${op.name} has multiple implementations for runtime ${impl.runtime}`,
          }),
        );
      }
      seenRuntimes.add(impl.runtime);
    }
  }
  return out;
};
