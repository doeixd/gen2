/* @__NO_SIDE_EFFECTS__ */
/**
 * Access matrix derivation.
 *
 * Produces a human-readable table of who can do what to which entities,
 * surfaces, and fields based on the access-surface bindings registered in the
 * context.
 *
 * Part of AUTHZ2+. See AUTHZ2_PLAN.md.
 */

import type { Policy } from "./authz.ts";
import type { AccessMatrix, AccessMatrixEntry } from "./surface.ts";

/**
 * Derives an {@link AccessMatrix} from the policies in a Gen context.
 *
 * Walks every policy and its `access_surface_bindings`, producing a flat,
 * sorted list of matrix entries.
 *
 * @param input - Object containing the policies to inspect.
 * @returns An AccessMatrix record.
 */
export const deriveAccessMatrix = (input: { policies: readonly Policy[] }): AccessMatrix => {
  const entries: AccessMatrixEntry[] = [];

  for (const policy of input.policies) {
    for (const binding of policy.access_surface_bindings ?? []) {
      entries.push({
        entity: policy.target_entity,
        surface: binding.surface.kind,
        policyName: policy.name,
        placement: binding.placement?.kind,
        deny: binding.deny,
      });
    }
  }

  entries.sort((a, b) => {
    const entityCmp = a.entity.name.localeCompare(b.entity.name);
    if (entityCmp !== 0) return entityCmp;
    return a.surface.localeCompare(b.surface);
  });

  return { kind: "access_matrix", entries };
};
