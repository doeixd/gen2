/* @__NO_SIDE_EFFECTS__ */
/**
 * Lightweight AST node used to embed static operation implementations in types.
 *
 * Distinct from `expression/ExprAstNode` (which carries full type/operation metadata)
 * because `types/` cannot import `expression/` without creating a circular dependency.
 *
 * See spec/types.allium :: entity ImplementationAst.
 */

import type { Ref } from "../core/index.ts";

/**
 * A minimal AST node for static operation implementations.
 *
 * Used by {@link ImplementationBody} when `kind` is `"static_ast"`.
 */
export interface ImplementationAst {
  /** Node kind (e.g. "call", "literal", "ref"). */
  readonly kind: string;
  /** Child AST nodes. */
  readonly children: readonly ImplementationAst[];
  /** Optional reference to a named definition. */
  readonly ref?: Ref;
  /** Optional literal value serialized as a string. */
  readonly literal?: string;
}
