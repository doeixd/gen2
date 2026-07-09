/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel expression - typed computation AST.
 *
 * Expressions are typed operation trees that can be analyzed,
 * transformed, and lowered to various targets.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { KernelType } from "./type.ts";
import type { TraitDef } from "./trait.ts";
import type { ArgsOf, OpSignature } from "./operations.ts";

/** Expression operation kinds. */
export type ExprOp =
  | "literal"
  | "ref"
  | "get"
  | "not"
  | "and"
  | "or"
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "add"
  | "sub"
  | "mul"
  | "div"
  | "mod"
  | "concat"
  | "includes"
  | "startsWith"
  | "endsWith"
  | "matches"
  | "toUpper"
  | "toLower"
  | "trim"
  | "coalesce"
  | "case"
  | "cast"
  | "call"
  | "fn"
  | "record"
  | "array"
  | "tuple";

/** Phase discriminator for expressions. */
export type ExprPhase = "static" | "query" | "validation" | "authorization" | "hydration";

/** Argument to an expression. */
export interface ExprArg {
  readonly name?: string;
  readonly value: KernelExpr;
}

/** Kernel expression - typed computation AST. */
export interface KernelExpr<Out = unknown> {
  readonly id: KernelId<"expr">;
  readonly op: ExprOp;
  readonly type: KernelType<Out>;
  readonly args: readonly ExprArg[];
  readonly phase?: ExprPhase;
  readonly requirements?: readonly string[];
  readonly effects?: readonly string[];
  readonly metadata?: KernelMetadata;
}

/** Decoded value type carried by a `KernelType`. */
type DecodedOf<T> = T extends KernelType<infer D> ? D : unknown;

/** Operation-call expression - typed operation application. */
export interface OperationCallExpr<Op extends OpSignature = OpSignature> extends KernelExpr<
  DecodedOf<Op["output"]>
> {
  readonly op: "call";
  readonly operation: Op;
  readonly args: readonly {
    readonly name?: string;
    readonly value: KernelExpr;
  }[];
}

type ExprArgsFor<Args extends readonly KernelType[]> = Args extends readonly []
  ? readonly []
  : Args extends readonly [
        infer Head extends KernelType,
        ...infer Tail extends readonly KernelType[],
      ]
    ? readonly [KernelExpr<DecodedOf<Head>>, ...ExprArgsFor<Tail>]
    : readonly KernelExpr[];

export type OperationExprArgsFor<Op extends OpSignature> = ExprArgsFor<ArgsOf<Op>>;

/** Create an operation-call expression. */
export const opCall = <const Op extends OpSignature>(
  operation: Op,
  args: readonly KernelExpr[],
  id?: string,
): OperationCallExpr<Op> => ({
  id: (id ?? `expr:call:${operation.id}`) as KernelId<"expr">,
  op: "call",
  type: operation.output as KernelType<DecodedOf<Op["output"]>>,
  operation,
  args: args.map((value) => ({ value })),
  metadata: undefined,
});

/** Create an operation-call expression when argument expression types are known. */
export const opCallTyped = <const Op extends OpSignature>(
  operation: Op,
  args: OperationExprArgsFor<Op>,
  id?: string,
): OperationCallExpr<Op> => opCall(operation, args as unknown as readonly KernelExpr[], id);

/** Expression traits derived from operation analysis. */
export const EXPR_TRAITS = {
  PURE: { id: "trait.expr.pure" as KernelId<"trait">, label: "Pure expression", target: "expr" },
  DETERMINISTIC: {
    id: "trait.expr.deterministic" as KernelId<"trait">,
    label: "Deterministic",
    target: "expr",
  },
  SQL_LOWERABLE: {
    id: "trait.expr.sqlLowerable" as KernelId<"trait">,
    label: "SQL-lowerable",
    target: "expr",
  },
  CLIENT_EVALUABLE: {
    id: "trait.expr.clientEvaluable" as KernelId<"trait">,
    label: "Client-evaluable",
    target: "expr",
  },
  SERVER_ONLY: {
    id: "trait.expr.serverOnly" as KernelId<"trait">,
    label: "Server-only",
    target: "expr",
  },
  PREDICATE: {
    id: "trait.expr.predicate" as KernelId<"trait">,
    label: "Predicate",
    target: "expr",
  },
  AGGREGATE: {
    id: "trait.expr.aggregate" as KernelId<"trait">,
    label: "Aggregate",
    target: "expr",
  },
} as const;

/** Derive traits from an expression's operation and arguments. */
export const deriveExprTraits = (expr: KernelExpr): readonly TraitDef[] => {
  const derived: TraitDef[] = [];

  // Always pure unless it calls something with effects
  derived.push(EXPR_TRAITS.PURE);

  // Deterministic if all args are deterministic
  const allDeterministic = expr.args.every((arg) => arg.value.metadata?.custom === undefined);
  if (allDeterministic) {
    derived.push(EXPR_TRAITS.DETERMINISTIC);
  }

  // Predicate if output is boolean
  if (expr.type.kind.id === "type.boolean") {
    derived.push(EXPR_TRAITS.PREDICATE);
  }

  return derived;
};

/** Create a kernel expression. */
export const defineExpr = <Out>(
  op: ExprOp,
  type: KernelType<Out>,
  input?: {
    readonly id?: string;
    readonly args?: readonly ExprArg[];
    readonly phase?: ExprPhase;
    readonly requirements?: readonly string[];
    readonly effects?: readonly string[];
    readonly metadata?: KernelMetadata;
  },
): KernelExpr<Out> => ({
  id: (input?.id ?? `expr:${op}`) as KernelId<"expr">,
  op,
  type,
  args: input?.args ?? [],
  phase: input?.phase,
  requirements: input?.requirements,
  effects: input?.effects,
  metadata: input?.metadata,
});
