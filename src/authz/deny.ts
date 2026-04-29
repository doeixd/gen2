/* @__NO_SIDE_EFFECTS__ */
/**
 * Deny-behavior enforcement helpers.
 *
 * Transform queries, actions, and form fields according to the deny behavior
 * specified in an access-surface binding.
 *
 * Part of AUTHZ2+. See AUTHZ2_PLAN.md.
 */

import type { QueryExpression } from "../query/index.ts";
import type { ActionFunction } from "../function/index.ts";
import type { FormField } from "../ui/index.ts";
import { literal } from "../expression/builders.ts";
import { ruleNot } from "../rules/rules.ts";
import type { AccessSurfaceBinding } from "./surface.ts";

// --- Query ------------------------------------------------------------------

/**
 * Applies a deny behavior to a query expression.
 *
 * - `field.read` + `omit` → removes the field from the projection.
 * - `field.read` + `redact` → replaces the field with a placeholder expression.
 * - `entity.read` + `not_found` → adds an authz requirement (predicate lowering
 *   is deferred until SQL generation).
 *
 * @param query - The query to transform.
 * @param binding - The access-surface binding carrying the deny behavior.
 * @returns A new query expression with the deny behavior applied.
 */
export const applyDenyToQuery = <Result = unknown>(
  query: QueryExpression<Result>,
  binding: AccessSurfaceBinding,
): QueryExpression<Result> => {
  if (binding.surface.kind === "field.read" && binding.deny === "omit") {
    if (!query.projection) return query;
    const targetField = binding.surface.field;
    return {
      ...query,
      projection: {
        ...query.projection,
        fields: query.projection.fields.filter((pf) => pf.field !== targetField),
      },
    };
  }

  if (binding.surface.kind === "field.read" && binding.deny === "redact") {
    if (!query.projection) return query;
    const targetField = binding.surface.field;
    return {
      ...query,
      projection: {
        ...query.projection,
        fields: query.projection.fields.map((pf) =>
          pf.field === targetField
            ? { ...pf, expression: literal({ kind: "string", string_value: "[REDACTED]" }) }
            : pf,
        ),
      },
    };
  }

  if (binding.surface.kind === "entity.read" && binding.deny === "not_found") {
    return {
      ...query,
      requirements: [...query.requirements, { kind: "authz:entity-read-not-found" }],
    };
  }

  return query;
};

// --- Action -----------------------------------------------------------------

/**
 * Applies a deny behavior to an action function.
 *
 * - `field.write` + `forbidden` → adds an authz requirement.
 * - `entity.create/update/delete` + `forbidden` → adds an authz requirement.
 *
 * @param action - The action to transform.
 * @param binding - The access-surface binding carrying the deny behavior.
 * @returns A new action function with the deny behavior applied.
 */
export const applyDenyToAction = (
  action: ActionFunction,
  binding: AccessSurfaceBinding,
): ActionFunction => {
  if (binding.deny === "forbidden") {
    const kind = binding.surface.kind;
    if (
      kind === "field.write" ||
      kind === "entity.create" ||
      kind === "entity.update" ||
      kind === "entity.delete" ||
      kind === "action.execute"
    ) {
      return {
        ...action,
        requirements: [...action.requirements, { kind: `authz:${kind}:forbidden` }],
      };
    }
  }
  return action;
};

// --- Form field -------------------------------------------------------------

/**
 * Applies a deny behavior to a form field.
 *
 * - `ui.hint` + `readonly` → sets `editableWhen` to the negation of the policy
 *   predicate (if present), making the field non-editable.
 *
 * @param field - The form field to transform.
 * @param binding - The access-surface binding carrying the deny behavior.
 * @returns A new form field with the deny behavior applied.
 */
export const applyDenyToFormField = (
  field: FormField,
  binding: AccessSurfaceBinding,
): FormField => {
  if (binding.surface.kind === "ui.hint" && binding.deny === "readonly") {
    const negated = binding.policy.predicate
      ? {
          ...binding.policy.predicate,
          name: `${binding.policy.predicate.name}_negated`,
          body: ruleNot(binding.policy.predicate.body),
        }
      : undefined;
    return {
      ...field,
      editableWhen: negated,
    };
  }
  return field;
};
