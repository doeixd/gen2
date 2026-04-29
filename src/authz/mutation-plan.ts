/* @__NO_SIDE_EFFECTS__ */
/**
 * Mutation access plan generation.
 *
 * Derives what authorization checks are required before/after an action
 * executes, based on its write-set and the access-surface bindings registered
 * in the context.
 *
 * Part of AUTHZ2+. See AUTHZ2_PLAN.md.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { GenContext } from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";
import type { ActionFunction } from "../function/index.ts";
import type { Expr } from "../expression/index.ts";
import type { Relation } from "../relation/index.ts";
import type { Policy } from "./authz.ts";
import type { AccessSurfaceBinding, DenyBehavior } from "./surface.ts";

// --- Types ------------------------------------------------------------------

export interface FieldWriteCheck {
  readonly field: Field;
  readonly policy: Policy;
  readonly deny: DenyBehavior;
}

export interface RelationWriteCheck {
  readonly relation: Relation;
  readonly policy: Policy;
  readonly deny: DenyBehavior;
}

export interface TransitionCheck {
  readonly field: Field;
  readonly from: readonly unknown[];
  readonly to: readonly unknown[];
  readonly policy: Policy;
}

export interface WriteSetEntry {
  readonly entity: Entity;
  readonly field: Field;
  readonly oldValue?: Expr;
  readonly newValue?: Expr;
}

export interface MutationAccessPlan<In = unknown, Out = unknown> {
  readonly kind: "mutation_access_plan";
  readonly action: ActionFunction<In, Out>;
  readonly actor?: Entity;
  readonly writes: readonly WriteSetEntry[];
  readonly requiredPolicies: readonly Policy[];
  readonly beforeState: readonly Entity[];
  readonly afterState: readonly Entity[];
  readonly fieldWriteChecks: readonly FieldWriteCheck[];
  readonly relationChecks: readonly RelationWriteCheck[];
  readonly transitionChecks: readonly TransitionCheck[];
  readonly diagnostics: readonly Diagnostic[];
}

// --- Helpers ----------------------------------------------------------------

const findFieldWriteBinding = (
  policies: readonly Policy[],
  entity: Entity,
  field: Field,
): AccessSurfaceBinding | undefined => {
  for (const policy of policies) {
    for (const binding of policy.access_surface_bindings ?? []) {
      if (
        binding.surface.kind === "field.write" &&
        binding.surface.entity === entity &&
        binding.surface.field === field
      ) {
        return binding;
      }
    }
  }
  return undefined;
};

const findEntitySurfaceBinding = (
  policies: readonly Policy[],
  entity: Entity,
  kind: "entity.create" | "entity.update" | "entity.delete",
): AccessSurfaceBinding | undefined => {
  for (const policy of policies) {
    for (const binding of policy.access_surface_bindings ?? []) {
      if (binding.surface.kind === kind && binding.surface.entity === entity) {
        return binding;
      }
    }
  }
  return undefined;
};

// --- Derivation -------------------------------------------------------------

/**
 * Derives a {@link MutationAccessPlan} for an action by inspecting its
 * write-set and matching it against access-surface bindings.
 *
 * @param action - The action function to analyze.
 * @param policies - All registered policies (scanned for relevant bindings).
 * @returns A mutation access plan with checks and diagnostics.
 */
export const deriveMutationAccessPlan = <In = unknown, Out = unknown>(
  action: ActionFunction<In, Out>,
  policies: readonly Policy[],
): MutationAccessPlan<In, Out> => {
  const writes: WriteSetEntry[] = [];
  const beforeState: Entity[] = [];
  const afterState: Entity[] = [];
  const deletedEntities = new Set<Entity>();
  const fieldWriteChecks: FieldWriteCheck[] = [];
  const diagnostics: Diagnostic[] = [];
  const requiredPoliciesSet = new Set<Policy>();

  for (const op of action.body.operations) {
    if (op.kind === "insert_op") {
      afterState.push(op.target);

      const entityBinding = findEntitySurfaceBinding(policies, op.target, "entity.create");
      if (entityBinding) {
        requiredPoliciesSet.add(entityBinding.policy);
      }

      for (const [field, newValue] of op.values) {
        writes.push({ entity: op.target, field, newValue });
        const binding = findFieldWriteBinding(policies, op.target, field);
        if (binding) {
          fieldWriteChecks.push({ field, policy: binding.policy, deny: binding.deny });
          requiredPoliciesSet.add(binding.policy);
          diagnostics.push(
            diagnostic({
              severity: "warning",
              code: "authz:write-policy-needs-before-state",
              message: `Insert action ${action.name} writes field ${field.name} with a field.write policy but has no beforeState`,
            }),
          );
        }
      }
    } else if (op.kind === "update_op") {
      beforeState.push(op.target);
      afterState.push(op.target);

      const entityBinding = findEntitySurfaceBinding(policies, op.target, "entity.update");
      if (entityBinding) {
        requiredPoliciesSet.add(entityBinding.policy);
      }

      for (const [field, newValue] of op.values) {
        writes.push({ entity: op.target, field, newValue });
        const binding = findFieldWriteBinding(policies, op.target, field);
        if (binding) {
          fieldWriteChecks.push({ field, policy: binding.policy, deny: binding.deny });
          requiredPoliciesSet.add(binding.policy);
        }
      }
    } else if (op.kind === "delete_op") {
      beforeState.push(op.target);
      deletedEntities.add(op.target);

      const entityBinding = findEntitySurfaceBinding(policies, op.target, "entity.delete");
      if (entityBinding) {
        requiredPoliciesSet.add(entityBinding.policy);
      }
    }
  }

  return {
    kind: "mutation_access_plan",
    action,
    writes,
    requiredPolicies: [...requiredPoliciesSet],
    beforeState: [...new Set(beforeState)],
    afterState: [...new Set(afterState)].filter((e) => !deletedEntities.has(e)),
    fieldWriteChecks,
    relationChecks: [],
    transitionChecks: [],
    diagnostics,
  };
};

// --- Checker ----------------------------------------------------------------

/**
 * Runs mutation-access plan derivation for every action in the context and
 * collects diagnostics.
 *
 * @param ctx - The Gen context containing actions and policies.
 * @returns Diagnostics for unsafe or missing access checks.
 */
export const checkMutationAccessPlans = (ctx: GenContext): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const action of ctx.action_functions) {
    const plan = deriveMutationAccessPlan(action, ctx.policies);
    out.push(...plan.diagnostics);
  }
  return out;
};
