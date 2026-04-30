/* @__NO_SIDE_EFFECTS__ */
/**
 * Placement analysis for access surfaces.
 *
 * Determines where an authorization rule can be evaluated and emits
 * diagnostics when placement is unsafe (e.g. post-filter on list queries).
 *
 * Part of AUTHZ2+. See AUTHZ2_PLAN.md.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Entity } from "../entity/index.ts";
import { analyzeRulePlacement } from "../rules/index.ts";
import type { AuthConditionInput, Policy } from "./authz.ts";
import type { AccessSurface, Placement } from "./surface.ts";

const isRlsCondition = (condition: AuthConditionInput): boolean => {
  return (
    condition.kind === "AllowRole" ||
    condition.kind === "AllowAuthenticated" ||
    condition.kind === "AllowOwner"
  );
};

const isSameStoreRelation = (condition: AuthConditionInput, targetEntity: Entity): boolean => {
  if (condition.kind !== "AllowRelation" || !condition.target_relation) return false;
  const fromStore = condition.target_relation.from_entity.store_name;
  const toStore = condition.target_relation.to_entity.store_name;
  const targetStore = targetEntity.store_name;
  return fromStore === targetStore && toStore === targetStore;
};

// --- classifyPlacement ------------------------------------------------------

/**
 * Derives the optimal placement for a policy on a given access surface.
 *
 * @param surface - The access surface to classify.
 * @param policy - The policy governing the surface.
 * @returns A Placement describing where enforcement can happen.
 */
export const classifyPlacement = (surface: AccessSurface, policy: Policy): Placement => {
  // Prefer rule-backed predicate (AUTHZ2+)
  if (policy.predicate) {
    // Use structured rule placement analysis for more precise classification
    const analysis = analyzeRulePlacement(policy.predicate, policy.target_entity);
    const selected =
      analysis.selected ?? analysis.placements.find((p) => p.placement === "server_post_filter");
    if (selected) {
      switch (selected.placement) {
        case "database_predicate":
          return { kind: "sql_where", authoritative: true, exact: true };
        case "rls":
          return { kind: "rls", authoritative: true, exact: true };
        case "server_integrated_query":
          return { kind: "server_integrated_query", authoritative: true, exact: true };
        case "server_pre_query":
          return { kind: "server_pre_query", authoritative: true, exact: true };
        case "server_post_filter":
          return { kind: "server_post_filter", authoritative: true, exact: false };
        case "client_hint":
          return { kind: "client_hint", authoritative: false, exact: false };
        case "materialized_ivm":
        case "external_evaluator":
          return { kind: "external", authoritative: false, exact: false };
      }
    }
    return { kind: "none", authoritative: false, exact: false };
  }

  // Fall back to legacy AuthCondition
  const condition = policy.actions[0]?.condition;
  if (condition) {
    if (isRlsCondition(condition) && policy.target_entity.store_name) {
      return { kind: "rls", authoritative: true, exact: true };
    }
    if (condition.kind === "AllowRelation") {
      if (isSameStoreRelation(condition, policy.target_entity)) {
        return { kind: "server_integrated_query", authoritative: true, exact: true };
      }
      return { kind: "server_post_filter", authoritative: true, exact: false };
    }
    return { kind: "server_pre_query", authoritative: true, exact: true };
  }

  return { kind: "none", authoritative: false, exact: false };
};

// --- checkPlacement ---------------------------------------------------------

/**
 * Validates placement for all access-surface bindings across policies.
 *
 * Emits diagnostics when list queries would require unsafe post-filtering
 * or when a policy cannot be placed at all.
 *
 * @param input - Policies to inspect.
 * @returns Diagnostics for unsafe or missing placements.
 */
export const checkPlacement = (input: { policies: readonly Policy[] }): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  for (const policy of input.policies) {
    for (const binding of policy.access_surface_bindings ?? []) {
      const placement = binding.placement ?? classifyPlacement(binding.surface, policy);

      if (binding.surface.kind === "query.filter") {
        const query = binding.surface.query;
        const isList = query.returns.kind === "array";
        if (isList) {
          if (placement.kind === "server_post_filter") {
            out.push(
              diagnostic({
                severity: "warning",
                code: "authz:unsafe-list-post-filter",
                message: `Policy ${policy.name} for list query ${query.name} falls back to server post-filter`,
              }),
            );
          }
          if (placement.kind === "none" || placement.kind === "external") {
            out.push(
              diagnostic({
                severity: "error",
                code: "authz:list-policy-not-placeable",
                message: `Policy ${policy.name} for list query ${query.name} cannot be placed in query predicate`,
              }),
            );
          }
        }
      }
    }
  }

  return out;
};
