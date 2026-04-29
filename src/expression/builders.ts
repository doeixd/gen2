/* @__NO_SIDE_EFFECTS__ */
/**
 * User-facing expression builders. These mirror gen.expr / gen.types.op.* in spec.md.
 * They check the operation's kind/types against the operands at construction
 * time and refuse mismatched applications by throwing — the lifecycle's
 * invariant runner produces equivalent diagnostics during a check pass.
 */

import { makeRef } from "../core/index.ts";
import type { Field } from "../entity/index.ts";
import {
  baseSemantic,
  repr,
  type AggregateOperation,
  type BinaryOperation,
  type ComparisonOperation,
  type SemanticType,
  type UnaryOperation,
} from "../types/index.ts";
import type { ExprAstNode, LiteralValue } from "./ast.ts";
import { fieldRefNode, literalNode, opCallNode, paramRefNode } from "./ast.ts";
import { buildExpr, type Expr, type ExprPhase } from "./expr.ts";

/**
 * Maps a literal value to its implied semantic type.
 *
 * @param value - The literal value.
 * @returns The semantic type corresponding to the literal's kind.
 */
const literalSemanticType = (value: LiteralValue): SemanticType => {
  switch (value.kind) {
    case "string":
      return baseSemantic<string>({
        name: "string",
        kind: "string",
        ts_type_name: "string",
        storage_repr: repr.text(),
      });
    case "integer":
      return baseSemantic<number>({
        name: "int",
        kind: "numeric",
        ts_type_name: "number",
        storage_repr: repr.i32(),
      });
    case "decimal":
      return baseSemantic<string>({
        name: "decimal",
        kind: "numeric",
        ts_type_name: "string",
        storage_repr: repr.text(),
      });
    case "boolean":
      return baseSemantic<boolean>({
        name: "boolean",
        kind: "boolean",
        ts_type_name: "boolean",
        storage_repr: repr.bool(),
      });
    case "timestamp":
      return baseSemantic<Date>({
        name: "timestamp",
        kind: "timestamp",
        ts_type_name: "Date",
        storage_repr: repr.i64(),
      });
    case "date":
      return baseSemantic<string>({
        name: "date",
        kind: "date",
        ts_type_name: "string",
        storage_repr: { ...repr.text(), name: "date_text" },
      });
    case "json":
      return baseSemantic<unknown>({
        name: "json",
        kind: "json",
        ts_type_name: "unknown",
        storage_repr: repr.text(),
      });
    case "bytes":
      return baseSemantic<Uint8Array>({
        name: "bytes",
        kind: "bytes",
        ts_type_name: "Uint8Array",
        storage_repr: repr.bytes(),
      });
    case "null_value":
      return baseSemantic<null>({
        name: "null",
        kind: "json",
        ts_type_name: "null",
        storage_repr: repr.text(),
      });
  }
};

/**
 * Creates an untyped literal Expr. Callers should prefer {@link semanticLiteral} for proper typing.
 *
 * @param value - The literal value.
 * @param phase - Expression phase (defaults to "schema").
 * @returns A literal Expr.
 *
 * @example
 * ```ts
 * const expr = literal({ kind: "string", string_value: "hello" }, "query");
 * ```
 */
export const literal = (value: LiteralValue, phase: ExprPhase = "schema"): Expr => {
  // The literal's value_type is implied by its kind. Callers that need a more
  // specific semantic type can re-wrap with buildExpr.
  // We can't infer SemanticType from the literal alone here, so callers should
  // use semanticLiteral() below for proper typing.
  const ast = literalNode(value);
  return buildExpr({
    value_type: literalSemanticType(value),
    phase,
    ast,
    kind: "literal",
  });
};

/**
 * Creates a typed literal Expr with an explicit semantic type.
 *
 * @param value_type - The semantic type of the literal.
 * @param value - The literal value.
 * @param phase - Expression phase (defaults to "schema").
 * @returns A typed literal Expr.
 *
 * @example
 * ```ts
 * const expr = semanticLiteral(stringType, { kind: "string", string_value: "hello" });
 * ```
 */
export const semanticLiteral = <Ts>(
  value_type: SemanticType<Ts>,
  value: LiteralValue,
  phase: ExprPhase = "schema",
): Expr<Ts> =>
  buildExpr<Ts>({
    value_type,
    phase,
    ast: literalNode(value),
    kind: "literal",
  });

/**
 * Creates a field-reference Expr pointing to the given Field.
 *
 * @param field - The Field to reference.
 * @param phase - Expression phase (defaults to "query").
 * @returns A field-reference Expr.
 *
 * @example
 * ```ts
 * const expr = fieldRef(User.fields.id, "query");
 * ```
 */
export const fieldRef = <Ts>(field: Field<Ts>, phase: ExprPhase = "query"): Expr<Ts> =>
  buildExpr<Ts>({
    value_type: field.semantic_type,
    phase,
    ast: fieldRefNode(field.ref),
    kind: "field_ref",
  });

/**
 * ApplyUnary: invoke a unary op on a single operand. Operand value_type must
 * match the operation's input_type (UnaryOpInputTypeMatches invariant).
 *
 * @param op - The unary operation to apply.
 * @param operand - The operand expression.
 * @param phase - Optional explicit phase (defaults to operand's phase).
 * @returns A new Expr representing the unary operation call.
 *
 * @example
 * ```ts
 * const negated = applyUnary(negateOp, valueExpr);
 * ```
 */
export const applyUnary = <In, Out>(
  op: UnaryOperation<In, Out>,
  operand: Expr<In>,
  phase?: ExprPhase,
): Expr<Out> => {
  if (op.input_type.name !== operand.value_type.name) {
    throw new Error(
      `Unary op ${op.name} expects ${op.input_type.name} but got ${operand.value_type.name}`,
    );
  }
  return buildExpr<Out>({
    value_type: op.output_type,
    phase: phase ?? operand.phase,
    ast: opCallNode(op, [operand.ast]),
    kind: "op_call",
    effects: op.effects,
  });
};

/**
 * ApplyBinary: invoke a binary op on left/right. Both operand types must match
 * (BinaryOpOperandsMatch invariant).
 *
 * @param op - The binary operation to apply.
 * @param left - The left operand expression.
 * @param right - The right operand expression.
 * @param phase - Optional explicit phase.
 * @returns A new Expr representing the binary operation call.
 *
 * @example
 * ```ts
 * const sum = applyBinary(addOp, leftExpr, rightExpr);
 * ```
 */
export const applyBinary = <L, R, Out>(
  op: BinaryOperation<L, R, Out>,
  left: Expr<L>,
  right: Expr<R>,
  phase?: ExprPhase,
): Expr<Out> => {
  if (op.left_type.name !== left.value_type.name) {
    throw new Error(
      `Binary op ${op.name} expects left=${op.left_type.name} but got ${left.value_type.name}`,
    );
  }
  if (op.right_type.name !== right.value_type.name) {
    throw new Error(
      `Binary op ${op.name} expects right=${op.right_type.name} but got ${right.value_type.name}`,
    );
  }
  return buildExpr<Out>({
    value_type: op.output_type,
    phase: phase ?? (left.phase === right.phase ? left.phase : "server"),
    ast: opCallNode(op, [left.ast, right.ast]),
    kind: "op_call",
    effects: op.effects,
  });
};

/**
 * ApplyComparison: both operands must share operand_type (ComparisonOpSameType).
 * The output type is boolean (PredicateOperationOutputBoolean invariant).
 *
 * @param op - The comparison operation to apply.
 * @param left - The left operand expression.
 * @param right - The right operand expression.
 * @param phase - Optional explicit phase (defaults to "query").
 * @returns A new Expr representing the comparison.
 *
 * @example
 * ```ts
 * const gt = applyComparison(greaterThanOp, aExpr, bExpr);
 * ```
 */
export const applyComparison = <Operand, Out>(
  op: ComparisonOperation<Operand, Out>,
  left: Expr<Operand>,
  right: Expr<Operand>,
  phase?: ExprPhase,
): Expr<Out> => {
  if (op.operand_type.name !== left.value_type.name) {
    throw new Error(
      `Comparison ${op.name} expects ${op.operand_type.name} but got left=${left.value_type.name}`,
    );
  }
  if (op.operand_type.name !== right.value_type.name) {
    throw new Error(
      `Comparison ${op.name} expects ${op.operand_type.name} but got right=${right.value_type.name}`,
    );
  }
  return buildExpr<Out>({
    value_type: op.output_type,
    phase: phase ?? "query",
    ast: opCallNode(op, [left.ast, right.ast]),
    kind: "op_call",
  });
};

/**
 * ApplyAggregate: when requires_numeric, the operand must be numeric
 * (AggregateOpNumericWhenRequired invariant).
 *
 * @param op - The aggregate operation to apply.
 * @param operand - The operand expression.
 * @param phase - Optional explicit phase (defaults to "query").
 * @returns A new Expr representing the aggregation.
 *
 * @example
 * ```ts
 * const total = applyAggregate(sumOp, amountExpr);
 * ```
 */
export const applyAggregate = <In, Out>(
  op: AggregateOperation<In, Out>,
  operand: Expr<In>,
  phase?: ExprPhase,
): Expr<Out> => {
  if (op.requires_numeric && operand.value_type.kind !== "numeric") {
    throw new Error(
      `Aggregate ${op.name} requires numeric input but got ${operand.value_type.kind}`,
    );
  }
  return buildExpr<Out>({
    value_type: op.output_type,
    phase: phase ?? "query",
    ast: opCallNode(op, [operand.ast]),
    kind: "op_call",
  });
};

/**
 * Construct a literal AST node — useful when assembling raw ASTs.
 *
 * @param value - The literal value.
 * @returns A literal AST node.
 *
 * @example
 * ```ts
 * const node = lit({ kind: "boolean", boolean_value: true });
 * ```
 */
export const lit = (value: LiteralValue): ExprAstNode => literalNode(value);

// --- Staged expression builders --------------------------------------------

/**
 * Creates a placeholder Expr for use inside expression callbacks. The returned
 * expression is a `param_ref` AST node whose value_type matches the given type.
 *
 * @param value_type - The semantic type of the placeholder.
 * @param name - Optional parameter name for debugging.
 * @param phase - The expression phase.
 * @returns A placeholder Expr.
 *
 * @example
 * ```ts
 * const placeholder = paramPlaceholder(stringType, "searchTerm", "query");
 * ```
 */
export const paramPlaceholder = <Ts>(
  value_type: SemanticType<Ts>,
  name = "param",
  phase: ExprPhase = "schema",
): Expr<Ts> =>
  buildExpr<Ts>({
    value_type,
    phase,
    ast: paramRefNode(
      makeRef({
        kind: "ParamRef",
        owner: { kind: "Function", name },
        name,
        value_type: value_type.name,
      }),
    ),
    kind: "param_ref",
  });

/**
 * Staged expression builder. The callback receives a typed placeholder and
 * returns an expression tree. The callback runs once at definition time.
 *
 * @param value_type - The semantic type of the input placeholder.
 * @param builder - Callback that receives the placeholder and produces an Expr.
 * @returns The Expr produced by the callback.
 *
 * @example
 * ```ts
 * const expr = exprBuilder(stringType, (p) => applyBinary(concatOp, p, literal(...)));
 * ```
 */
export const exprBuilder = <Ts>(
  value_type: SemanticType<Ts>,
  builder: (placeholder: Expr<Ts>) => Expr<Ts>,
): Expr<Ts> => {
  const placeholder = paramPlaceholder(value_type, "input");
  return builder(placeholder);
};

/**
 * Staged expression builder with named inputs. Each field in `inputs` becomes
 * a typed placeholder passed to the callback.
 *
 * @param inputs - Record of input names to semantic types.
 * @param builder - Callback that receives named placeholders and produces an Expr.
 * @returns The Expr produced by the callback.
 *
 * @example
 * ```ts
 * const expr = exprInputs(
 *   { a: intType, b: intType },
 *   ({ a, b }) => applyBinary(addOp, a, b),
 * );
 * ```
 */
export const exprInputs = <T extends Record<string, SemanticType>>(
  inputs: T,
  builder: (placeholders: {
    [K in keyof T]: T[K] extends SemanticType<infer Ts> ? Expr<Ts> : Expr;
  }) => Expr,
): Expr => {
  const placeholders: Record<string, Expr> = {};
  for (const [name, type] of Object.entries(inputs)) {
    placeholders[name] = paramPlaceholder(type, name);
  }
  return builder(
    placeholders as { [K in keyof T]: T[K] extends SemanticType<infer Ts> ? Expr<Ts> : Expr },
  );
};
