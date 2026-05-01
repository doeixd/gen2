/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel expression - typed computation AST.
 *
 * Typed, inspectable computation AST for logic that can be analyzed.
 * Models the revised core Expr primitive.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { TraitRef } from "./trait.ts";
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
  readonly traits: readonly TraitRef[];
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
    readonly traits?: readonly TraitRef[];
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
  traits: input?.traits ?? [],
  metadata: input?.metadata,
});

/** Expression builders for common operations. */
export const expr = {
  literal: <T>(value: T, type: KernelType<T>): KernelExpr<T> =>
    defineExpr<T>("literal", type, { traits: ["expr.pure"] }),

  ref: <T>(name: string, type: KernelType<T>): KernelExpr<T> =>
    defineExpr<T>("ref", type, { traits: ["expr.pure"] }),

  get: <T>(record: KernelExpr, field: string, type: KernelType<T>): KernelExpr<T> =>
    defineExpr<T>("get", type, {
      args: [{ name: field, value: record }],
      traits: ["expr.pure"],
    }),

  not: (expr: KernelExpr): KernelExpr<boolean> =>
    defineExpr<boolean>("not", { kind: "boolean" } as KernelType<boolean>, {
      args: [{ name: "arg", value: expr }],
      traits: ["expr.pure"],
    }),

  and: (left: KernelExpr, right: KernelExpr): KernelExpr<boolean> =>
    defineExpr<boolean>("and", { kind: "boolean" } as KernelType<boolean>, {
      args: [
        { name: "left", value: left },
        { name: "right", value: right },
      ],
      traits: ["expr.pure"],
    }),

  or: (left: KernelExpr, right: KernelExpr): KernelExpr<boolean> =>
    defineExpr<boolean>("or", { kind: "boolean" } as KernelType<boolean>, {
      args: [
        { name: "left", value: left },
        { name: "right", value: right },
      ],
      traits: ["expr.pure"],
    }),

  eq: <T>(left: KernelExpr<T>, right: KernelExpr<T>): KernelExpr<boolean> =>
    defineExpr<boolean>("eq", { kind: "boolean" } as KernelType<boolean>, {
      args: [
        { name: "left", value: left },
        { name: "right", value: right },
      ],
      traits: ["expr.pure", "expr.sqlLowerable"],
    }),

  neq: <T>(left: KernelExpr<T>, right: KernelExpr<T>): KernelExpr<boolean> =>
    defineExpr<boolean>("neq", { kind: "boolean" } as KernelType<boolean>, {
      args: [
        { name: "left", value: left },
        { name: "right", value: right },
      ],
      traits: ["expr.pure", "expr.sqlLowerable"],
    }),

  gt: (left: KernelExpr<number>, right: KernelExpr<number>): KernelExpr<boolean> =>
    defineExpr<boolean>("gt", { kind: "boolean" } as KernelType<boolean>, {
      args: [
        { name: "left", value: left },
        { name: "right", value: right },
      ],
      traits: ["expr.pure", "expr.sqlLowerable"],
    }),

  lt: (left: KernelExpr<number>, right: KernelExpr<number>): KernelExpr<boolean> =>
    defineExpr<boolean>("lt", { kind: "boolean" } as KernelType<boolean>, {
      args: [
        { name: "left", value: left },
        { name: "right", value: right },
      ],
      traits: ["expr.pure", "expr.sqlLowerable"],
    }),

  call: <T>(func: string, args: readonly ExprArg[], type: KernelType<T>): KernelExpr<T> =>
    defineExpr<T>("call", type, {
      args: args,
      traits: [],
    }),

  fn: <T>(
    name: string,
    args: readonly ExprArg[],
    body: KernelExpr<T>,
    type: KernelType<T>,
  ): KernelExpr<T> =>
    defineExpr<T>("fn", type, {
      args: [...args, { name: "body", value: body }],
      traits: ["expr.pure"],
    }),
};