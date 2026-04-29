/* @__NO_SIDE_EFFECTS__ */
/**
 * Static typed AST. Every expression in the library — schema validators, query
 * predicates, default value expressions, mutation bodies, projections — is one
 * of these trees. ASTs are values, not closures, so they can be inspected,
 * rewritten, and compiled to multiple targets (SQL, TS, WASM, validators).
 *
 * See spec/expression.allium :: entity ExprAstNode, entity OperationRef,
 * value LiteralValue, value AstNodeKind.
 */

import type { Ref } from "../core/index.ts";
import type { Operation } from "../types/index.ts";
import type { Expr } from "./expr.ts";

/**
 * Discriminated kind tag for an AST node.
 *
 * @example
 * ```ts
 * const tag: AstNodeKindTag = "op_call";
 * ```
 */
export type AstNodeKindTag =
  | "literal"
  | "field_ref"
  | "param_ref"
  | "op_call"
  | "conditional"
  | "let_binding"
  | "collection_expr";

/** Kind wrapper for an AST node. */
export interface AstNodeKind {
  /** Concrete kind tag discriminating the node shape. */
  readonly kind: AstNodeKindTag;
}

/**
 * Discriminated kind tag for a literal value.
 *
 * @example
 * ```ts
 * const tag: LiteralKindTag = "integer";
 * ```
 */
export type LiteralKindTag =
  | "string"
  | "integer"
  | "decimal"
  | "boolean"
  | "timestamp"
  | "date"
  | "json"
  | "bytes"
  | "null_value";

/**
 * A literal scalar value appearing in an AST.
 *
 * @example
 * ```ts
 * const lit: LiteralValue = { kind: "string", string_value: "hello" };
 * ```
 */
export interface LiteralValue {
  /** Concrete kind tag indicating the scalar type. */
  readonly kind: LiteralKindTag;
  /** String payload when `kind` is `"string"`. */
  readonly string_value?: string;
  /** Integer payload when `kind` is `"integer"`. */
  readonly integer_value?: number | bigint;
  /** Decimal payload when `kind` is `"decimal"` (stored as string to preserve precision). */
  readonly decimal_value?: string;
  /** Boolean payload when `kind` is `"boolean"`. */
  readonly boolean_value?: boolean;
}

/**
 * References an Operation with a map of named argument expressions.
 *
 * @example
 * ```ts
 * const opRef: OperationRef = {
 *   operation: addOp,
 *   args: new Map([["rhs", rhsExpr]]),
 * };
 * ```
 */
export interface OperationRef {
  /** The operation being invoked. */
  readonly operation: Operation;
  /** Named argument expressions keyed by parameter name. */
  readonly args: ReadonlyMap<string, Expr>;
}

/**
 * A single node in the static typed expression AST.
 *
 * @example
 * ```ts
 * const node: ExprAstNode = opCallNode(addOp, [left.ast, right.ast]);
 * ```
 */
export interface ExprAstNode {
  /** Discriminated kind wrapper. */
  readonly kind: AstNodeKind;
  /** Child nodes (operands, branches, collection elements). */
  readonly children: readonly ExprAstNode[];
  /** Field or parameter reference when `kind` is `"field_ref"` or `"param_ref"`. */
  readonly ref?: Ref;
  /** Literal value when `kind` is `"literal"`. */
  readonly literal?: LiteralValue;
  /** Operation reference when `kind` is `"op_call"`. */
  readonly op?: OperationRef;
}

// --- Constructors ----------------------------------------------------------

/**
 * Creates a literal AST node.
 *
 * @param value - The literal value.
 * @returns An AST node representing the literal.
 *
 * @example
 * ```ts
 * const node = literalNode({ kind: "integer", integer_value: 42 });
 * ```
 */
export const literalNode = (value: LiteralValue): ExprAstNode => ({
  kind: { kind: "literal" },
  children: [],
  literal: value,
});

/**
 * Creates a field-reference AST node.
 *
 * @param ref - The Ref pointing to the field.
 * @returns An AST node referencing the field.
 *
 * @example
 * ```ts
 * const node = fieldRefNode(User.fields.id.ref);
 * ```
 */
export const fieldRefNode = (ref: Ref): ExprAstNode => ({
  kind: { kind: "field_ref" },
  children: [],
  ref,
});

/**
 * Creates a parameter-reference AST node.
 *
 * @param ref - The Ref pointing to the parameter.
 * @returns An AST node referencing the parameter.
 *
 * @example
 * ```ts
 * const node = paramRefNode(paramRef);
 * ```
 */
export const paramRefNode = (ref: Ref): ExprAstNode => ({
  kind: { kind: "param_ref" },
  children: [],
  ref,
});

/**
 * Creates an operation-call AST node.
 *
 * @param operation - The Operation being invoked.
 * @param children - Child AST nodes (operands).
 * @param args - Named argument expressions (defaults to empty map).
 * @returns An AST node representing the operation call.
 *
 * @example
 * ```ts
 * const node = opCallNode(addOp, [left.ast, right.ast]);
 * ```
 */
export const opCallNode = (
  operation: Operation,
  children: readonly ExprAstNode[],
  args: ReadonlyMap<string, Expr> = new Map(),
): ExprAstNode => ({
  kind: { kind: "op_call" },
  children,
  op: { operation, args },
});

// --- AST traversal helpers -------------------------------------------------

/**
 * Collects every Ref in the AST subtree. Used to populate Expr.refs and
 * Predicate.refs without recursive traversal at every site.
 *
 * @param ast - The AST root to traverse.
 * @returns All Refs found in the subtree.
 *
 * @example
 * ```ts
 * const refs = collectRefs(expressionAst);
 * ```
 */
export const collectRefs = (ast: ExprAstNode): readonly Ref[] => {
  const out: Ref[] = [];
  const visit = (n: ExprAstNode): void => {
    if (n.ref) out.push(n.ref);
    for (const child of n.children) visit(child);
  };
  visit(ast);
  return out;
};

/**
 * True if the AST contains any opaque JS implementation references.
 *
 * @param ast - The AST root to inspect.
 * @returns True if any node references an opaque JS implementation.
 *
 * @example
 * ```ts
 * const hasOpaque = containsOpaqueJs(expressionAst);
 * ```
 */
export const containsOpaqueJs = (ast: ExprAstNode): boolean => {
  if (ast.op) {
    for (const impl of ast.op.operation.implementations) {
      if (impl.body.kind === "opaque_js") return true;
    }
  }
  return ast.children.some(containsOpaqueJs);
};
