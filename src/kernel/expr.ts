/* @__NO_SIDE_EFFECTS__ */
/** Kernel expression - typed computation AST. */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { KernelType } from "./type.ts";

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
export interface KernelExpr<T = unknown> {
  readonly id: KernelId<"expr">;
  readonly op: ExprOp;
  readonly type: KernelType;
  readonly args: readonly ExprArg[];
  readonly phase?: ExprPhase;
  readonly requirements?: readonly string[];
  readonly effects?: readonly string[];
  readonly metadata?: KernelMetadata;
}

/** Create a kernel expression. */
export const defineExpr = <T>(
  op: ExprOp,
  type: KernelType,
  input?: {
    readonly args?: readonly ExprArg[];
    readonly phase?: ExprPhase;
    readonly requirements?: readonly string[];
    readonly effects?: readonly string[];
    readonly metadata?: KernelMetadata;
  },
): KernelExpr<T> => ({
  id: `expr:${op}` as KernelId<"expr">,
  op,
  type,
  args: input?.args ?? [],
  phase: input?.phase,
  requirements: input?.requirements,
  effects: input?.effects,
  metadata: input?.metadata,
});