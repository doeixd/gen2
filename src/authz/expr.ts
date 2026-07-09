/* @__NO_SIDE_EFFECTS__ */
/**
 * AuthCondition → RuleExpr lowering.
 *
 * Converts legacy authorization conditions into `RuleExpr<boolean>` so that
 * auth logic can be analyzed through the same expression machinery as rules.
 *
 * Alignment with `docs/revision/rules.md.txt` §5:
 *   - `allowOwner(field)`  -> `eq(var("actor"), field(entity, owner_field))`
 *   - `allowRelation(...)` -> `exists(relation, eq(...))`
 *   - `or(left, right)`    -> `or(lower(left), lower(right))`
 *
 * Some conditions (`AllowAuthenticated`, `AllowPublic`) are runtime/middleware
 * checks with no pure boolean equivalent; they return `undefined`.
 *
 * `AllowRole` currently lacks the actor entity reference needed to resolve the
 * role field. It returns `undefined` until the auth builder is extended with
 * actor type information.
 *
 * This is bridge-phase infrastructure: it establishes the lowering pattern
 * while remaining honest about missing context.
 */

import type { AuthCondition, Policy } from "./authz.ts";
import type { RuleExpr } from "../rules/rules.ts";
import { ruleEq, ruleOr, ruleExists, ruleVar, ruleField, ruleLiteral } from "../rules/rules.ts";
import type { Entity, Field } from "../entity/index.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const findFieldByName = (entity: Entity, name: string): Field | undefined =>
  entity.fieldList.find((f) => f.name === name);

// ---------------------------------------------------------------------------
// Lowering
// ---------------------------------------------------------------------------

/**
 * Lower an `AuthCondition` to a `RuleExpr<boolean>`.
 *
 * @returns A `RuleExpr` when the condition can be expressed as a pure boolean
 *   expression, or `undefined` when it requires runtime/middleware context
 *   (`AllowAuthenticated`, `AllowPublic`) or lacks typed information
 *   (`AllowRole` without an actor entity).
 */
export const authConditionToRuleExpr = (
  condition: AuthCondition,
  policy: Policy<any>,
): RuleExpr<boolean> | undefined => {
  const actorVarName = policy.variable_bindings?.actor ?? "actor";

  switch (condition.kind) {
    case "AllowAuthenticated":
    case "AllowPublic": {
      // These are enforced by auth middleware, not by a pure boolean expression.
      return undefined;
    }

    case "AllowRole": {
      // AllowRole needs the actor entity to know which field holds the role.
      // The current AuthCondition only carries the role string, not the actor
      // entity or role field. We try to find a "role" field on the target
      // entity as a fallback, but this is a heuristic.
      const roleField = findFieldByName(policy.target_entity, "role");
      if (!roleField) return undefined;
      return ruleEq(
        ruleField(
          ruleVar(actorVarName, roleField.semantic_type),
          roleField,
          roleField.semantic_type,
        ),
        ruleLiteral(condition.role, roleField.semantic_type),
      );
    }

    case "AllowOwner": {
      const idField = findFieldByName(policy.target_entity, "id");
      if (!idField) return undefined;
      return ruleEq(
        ruleVar(actorVarName, idField.semantic_type),
        ruleField(policy.target_entity, condition.owner_field, condition.owner_field.semantic_type),
      );
    }

    case "AllowRelation": {
      const relation = condition.target_relation;
      const fromIdField = findFieldByName(relation.from_entity, "id");
      if (!fromIdField) return undefined;

      // Heuristic: check actor.id == relation.from_entity.id
      // The exact shape depends on variable bindings and relation endpoints.
      const whereExpr = ruleEq(
        ruleVar(actorVarName, fromIdField.semantic_type),
        ruleField(relation.from_entity, fromIdField, fromIdField.semantic_type),
      );
      return ruleExists(relation, whereExpr);
    }

    case "OrCondition": {
      const left = authConditionToRuleExpr(condition.left, policy);
      const right = authConditionToRuleExpr(condition.right, policy);
      if (!left && !right) return undefined;
      if (!left) return right;
      if (!right) return left;
      return ruleOr(left, right);
    }
  }
};
