/* @__NO_SIDE_EFFECTS__ */
/**
 * Traits are reusable validation/storage/behavior/privacy/UI modifiers attached
 * to semantic types. A trait may declare which target type it applies to and
 * optional validation/storage expressions.
 *
 * See spec/types.allium :: entity Trait, entity TraitApplication, rule InvalidTraitApplication.
 */

import type { Diagnostic, Ref } from "../core/index.ts";
import type { Effect, Requirement } from "./operation.ts";
import type { SemanticType } from "./semantic.ts";

/**
 * A lightweight expression descriptor used inside types/. Mirrors expression/Expr
 * shape; carries an optional name lookup for resolution against expression/Exprs
 * at compile time.
 */
export interface TypedExpression {
  /** Execution target kind (schema, query, mutation, client, server). */
  readonly kind: "schema" | "query" | "mutation" | "client" | "server";
  /** Semantic type of the expression result. */
  readonly value_type: SemanticType;
  /** Whether the expression contains opaque JavaScript that cannot be statically analyzed. */
  readonly contains_opaque_js: boolean;
  /** Requirements the expression imposes on the runtime. */
  readonly requirements: readonly Requirement[];
  /** Side effects the expression may produce. */
  readonly effects: readonly Effect[];
  /** Optional named reference for cross-module resolution. */
  readonly expr_name?: string;
}

/**
 * A reusable modifier attached to semantic types for validation, storage, behavior, privacy, or UI.
 */
export interface Trait {
  /** Trait name, often used as an annotation in generated code. */
  readonly name: string;
  /** If set, restricts the trait to semantic types with this exact `name`. */
  readonly applies_to?: string;
  /** Optional validation expression evaluated at runtime or compile time. */
  readonly validate_expression?: TypedExpression;
  /** Custom error message shown when validation fails. */
  readonly error_message?: string;
  /** Optional storage expression that may rewrite how the value is persisted. */
  readonly storage_expression?: TypedExpression;
  /** Whether the trait makes the field queryable in generated APIs. */
  readonly queryable: boolean;
}

/**
 * Links a Trait to a specific target Ref and semantic type.
 */
export interface TraitApplication {
  /** The trait being applied. */
  readonly trait: Trait;
  /** Target reference (e.g. a column or field). */
  readonly target: Ref;
  /** Semantic type of the target at the point of application. */
  readonly target_type: SemanticType;
}

/**
 * Creates a Trait record.
 *
 * @param input - Trait properties.
 * @returns A Trait record.
 *
 * @example
 * ```ts
 * const unique = gen.types.defineTrait({
 *   name: "unique",
 *   queryable: true,
 * });
 * ```
 */
export const defineTrait = (input: {
  name: string;
  applies_to?: string;
  validate_expression?: TypedExpression;
  error_message?: string;
  storage_expression?: TypedExpression;
  queryable?: boolean;
}): Trait => ({
  name: input.name,
  applies_to: input.applies_to,
  validate_expression: input.validate_expression,
  error_message: input.error_message,
  storage_expression: input.storage_expression,
  queryable: input.queryable ?? false,
});

/**
 * Validates trait applications against their target types.
 * Currently a stub returning no diagnostics; full checking is planned.
 *
 * @param applications - Trait applications to validate.
 * @returns Diagnostics for any invalid trait applications.
 */
export const checkTraitApplications = (
  _applications: readonly TraitApplication[],
): readonly Diagnostic[] => [];
