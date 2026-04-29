/* @__NO_SIDE_EFFECTS__ */
/**
 * Expr — the staged typed expression IR. An Expr binds an AST to a value type,
 * a phase (schema/query/mutation/client/server), and accumulated requirements
 * and effects. The `refs` field is the flattened list of all refs in the AST so
 * rules can do ref-level checks without recursing.
 *
 * See spec/expression.allium :: entity Expr, entity Predicate.
 */

import { entityToSemanticType, type Ref } from "../core/index.ts";
import type { Entity } from "../entity/index.ts";
import type { Effect, Requirement, SemanticType } from "../types/index.ts";
import { collectRefs, containsOpaqueJs, type ExprAstNode } from "./ast.ts";

/** Execution phase of an expression (schema, query, mutation, client, server). */
export type ExprPhase = "schema" | "query" | "mutation" | "client" | "server";

/**
 * Discriminated kind tag for an Expr.
 *
 * @example
 * ```ts
 * const tag: ExprKindTag = "op_call";
 * ```
 */
export type ExprKindTag =
  | "literal"
  | "field_ref"
  | "op_call"
  | "param_ref"
  | "conditional"
  | "let_binding"
  | "collection_expr"
  | "query_expr";

/** Kind wrapper for an Expr. */
export interface ExprKind {
  /** Concrete kind tag discriminating the expression shape. */
  readonly kind: ExprKindTag;
}

/**
 * Staged typed expression IR binding an AST to its type, phase, requirements, effects, and refs.
 *
 * @example
 * ```ts
 * const expr: Expr<number> = buildExpr({
 *   value_type: intType,
 *   phase: "query",
 *   ast: literalNode({ kind: "integer", integer_value: 42 }),
 * });
 * ```
 */
export interface Expr<
  Ts = unknown,
  Req extends readonly Requirement[] = readonly Requirement[],
  Eff extends readonly Effect[] = readonly Effect[],
> {
  /** Phantom type parameter linking this expression to its evaluated TypeScript type. */
  readonly _ts?: Ts;
  /** Phantom type parameter tracking accumulated requirements. */
  readonly _requires?: Req;
  /** Phantom type parameter tracking accumulated effects. */
  readonly _effects?: Eff;
  /** Discriminated kind wrapper. */
  readonly kind: ExprKind;
  /** Semantic type governing the expression's runtime value. */
  readonly value_type: SemanticType<Ts>;
  /** Capabilities or prerequisites the expression asserts. */
  readonly requirements: readonly Requirement[];
  /** Side effects the expression may produce. */
  readonly effects: readonly Effect[];
  /** The underlying static AST. */
  readonly ast: ExprAstNode;
  /** Execution phase where this expression is evaluated. */
  readonly phase: ExprPhase;
  /** Whether the AST contains any opaque JS implementations. */
  readonly contains_opaque_js: boolean;
  /** Flattened list of every {@link Ref} appearing in the AST. */
  readonly refs: readonly Ref[];
}

/**
 * Discriminated kind tag for a Predicate.
 *
 * @example
 * ```ts
 * const tag: PredicateKindTag = "comparison";
 * ```
 */
export type PredicateKindTag =
  | "comparison"
  | "membership"
  | "boolean_logic"
  | "null_check"
  | "exists"
  | "forall";

/** Kind wrapper for a Predicate. */
export interface PredicateKind {
  /** Concrete kind tag discriminating the predicate shape. */
  readonly kind: PredicateKindTag;
}

/**
 * A boolean-typed expression used for filtering and conditions.
 *
 * @example
 * ```ts
 * const pred: Predicate<User, boolean> = buildPredicate({
 *   input_type: User,
 *   value_type: booleanType,
 *   ast: comparisonAst,
 * });
 * ```
 */
export interface Predicate<Input = unknown, Output = boolean> {
  /** Phantom type parameters linking this predicate to its input and output types. */
  readonly _input?: Input;
  readonly _output?: Output;
  /** Discriminated kind wrapper. */
  readonly kind: PredicateKind;
  /** Semantic type of the predicate's input (often an Entity). */
  readonly input_type: SemanticType;
  /** Semantic type of the predicate's result (usually boolean). */
  readonly value_type: SemanticType<Output>;
  /** Capabilities or prerequisites the predicate asserts. */
  readonly requirements: readonly Requirement[];
  /** Side effects the predicate may produce. */
  readonly effects: readonly Effect[];
  /** The underlying static AST. */
  readonly ast: ExprAstNode;
  /** Flattened list of every {@link Ref} appearing in the AST. */
  readonly refs: readonly Ref[];
}

// --- Constructors ----------------------------------------------------------

/**
 * Constructs an Expr from an AST and metadata.
 *
 * @param input - Expression properties including value type, phase, AST, kind, requirements, and effects.
 * @returns A fully populated Expr.
 *
 * @example
 * ```ts
 * const expr = buildExpr({
 *   value_type: stringType,
 *   phase: "schema",
 *   ast: literalNode({ kind: "string", string_value: "hello" }),
 * });
 * ```
 */
export const buildExpr = <Ts = unknown>(input: {
  value_type: SemanticType<Ts>;
  phase: ExprPhase;
  ast: ExprAstNode;
  kind?: ExprKindTag;
  requirements?: readonly Requirement[];
  effects?: readonly Effect[];
}): Expr<Ts> => ({
  kind: { kind: input.kind ?? (input.ast.kind.kind as ExprKindTag) },
  value_type: input.value_type,
  requirements: input.requirements ?? [],
  effects: input.effects ?? [],
  ast: input.ast,
  phase: input.phase,
  contains_opaque_js: containsOpaqueJs(input.ast),
  refs: collectRefs(input.ast),
});

/**
 * Constructs a Predicate from an AST and metadata.
 *
 * @param input - Predicate properties including input type, value type, AST, kind, requirements, and effects.
 * @returns A fully populated Predicate.
 *
 * @example
 * ```ts
 * const pred = buildPredicate({
 *   input_type: User,
 *   value_type: booleanType,
 *   ast: comparisonAst,
 *   kind: "comparison",
 * });
 * ```
 */
export const buildPredicate = <Input = unknown, Output = boolean>(input: {
  input_type: SemanticType | Entity;
  value_type: SemanticType<Output>;
  ast: ExprAstNode;
  kind?: PredicateKindTag;
  requirements?: readonly Requirement[];
  effects?: readonly Effect[];
}): Predicate<Input, Output> => ({
  kind: { kind: input.kind ?? "comparison" },
  input_type: entityToSemanticType(input.input_type),
  value_type: input.value_type,
  requirements: input.requirements ?? [],
  effects: input.effects ?? [],
  ast: input.ast,
  refs: collectRefs(input.ast),
});
