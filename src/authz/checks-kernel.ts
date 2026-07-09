/* @__NO_SIDE_EFFECTS__ */
/**
 * Graph-native authz checker — kernel-pass migration for authorization.
 *
 * Behaviour: identical to the legacy `checkAuthz(input)`. The difference is
 * in *how* it iterates policies: through `graph.nodes` filtered by
 * `nodeKinds.POLICY`, then correlating back to the legacy `Policy` object via
 * policy name.
 *
 * Cross-module checks (getter/mutator policy matching) still consume legacy
 * arrays during the bridge phase. Once getters and mutators are graph-native,
 * those checks can be rewritten to traverse edges.
 *
 * See `docs/revised-kernel.md` and `docs/revision/revised_phases.md` §R8.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { KernelGraph } from "../kernel/index.ts";
import type { Entity } from "../entity/index.ts";
import { getEntitiesFromGraph } from "../entity/kernel.ts";
import type { Getter, Mutator } from "../api/index.ts";
import { getGettersFromGraph, getMutatorsFromGraph } from "../api/kernel.ts";
import { extractRuleDependenciesFromGraph } from "../rules/index.ts";
import type { Policy, PolicyTranslation, ClientPolicyExposure } from "./authz.ts";
import { checkPlacement } from "./placement.ts";
import { getPoliciesFromGraph } from "./kernel.ts";

/**
 * Run the authz-check pass over a kernel graph. Diagnostics are equivalent
 * to those produced by the legacy `checkAuthz(input)`.
 */
export const checkAuthzOnGraph = (input: {
  graph: KernelGraph;
  policies?: readonly Policy[];
  translations: readonly PolicyTranslation[];
  exposures: readonly ClientPolicyExposure[];
  getters?: readonly Getter[];
  mutators?: readonly Mutator[];
  entities?: readonly Entity[];
}): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const graphPolicies = getPoliciesFromGraph(input.graph);
  const policiesToCheck = graphPolicies.length > 0 ? graphPolicies : (input.policies ?? []);
  const gettersToCheck = input.getters ?? getGettersFromGraph(input.graph);
  const mutatorsToCheck = input.mutators ?? getMutatorsFromGraph(input.graph);
  const entitiesToCheck = input.entities ?? getEntitiesFromGraph(input.graph);

  // PolicyActionsMatchEntity (each rule's policy points back)
  for (const p of policiesToCheck) {
    for (const a of p.actions) {
      if (a.policy !== p) {
        out.push(
          diagnostic({
            severity: "error",
            code: "authz:rule-policy-mismatch",
            message: `Rule for action ${a.action_name} in policy ${p.name} has wrong back-pointer`,
          }),
        );
      }
    }
  }

  // OwnerFieldBelongsToEntity
  for (const p of policiesToCheck) {
    for (const a of p.actions) {
      if (a.condition.kind === "AllowOwner" && a.condition.owner_field) {
        if (a.condition.owner_field.owning_entity !== p.target_entity) {
          out.push(
            diagnostic({
              severity: "error",
              code: "authz:owner-field-wrong-entity",
              message: `Policy ${p.name}: AllowOwner field ${a.condition.owner_field.name} belongs to a different entity`,
            }),
          );
        }
      }
      if (a.condition.kind === "AllowRelation" && a.condition.target_relation) {
        if (a.condition.target_relation.from_entity !== p.target_entity) {
          out.push(
            diagnostic({
              severity: "error",
              code: "authz:relation-wrong-entity",
              message: `Policy ${p.name}: AllowRelation does not start at policy target entity`,
            }),
          );
        }
      }
    }
  }

  // PolicyAppliedToGetter / PolicyAppliedToMutator
  for (const g of gettersToCheck) {
    if (!g.auth) continue;
    const ok = policiesToCheck.some(
      (p) => p.name === g.auth!.policy_name && p.target_entity === g.target_entity,
    );
    if (!ok) {
      out.push(
        diagnostic({
          severity: "error",
          code: "authz:policy-entity-mismatch",
          message: `Policy ${g.auth.policy_name} does not match getter entity`,
        }),
      );
    }
  }
  for (const m of mutatorsToCheck) {
    if (!m.auth) continue;
    const ok = policiesToCheck.some(
      (p) => p.name === m.auth!.policy_name && p.target_entity === m.target_entity,
    );
    if (!ok) {
      out.push(
        diagnostic({
          severity: "error",
          code: "authz:policy-entity-mismatch",
          message: `Policy ${m.auth.policy_name} does not match mutator entity`,
        }),
      );
    }
  }

  // UnenforceablePolicy (cross-store relation)
  for (const p of policiesToCheck) {
    for (const a of p.actions) {
      if (a.condition.kind === "AllowRelation" && a.condition.target_relation) {
        const fromStore = p.target_entity.store_name;
        const toStore = a.condition.target_relation.to_entity.store_name;
        if (fromStore && toStore && fromStore !== toStore) {
          out.push(
            diagnostic({
              severity: "warning",
              code: "authz:unenforceable-policy",
              message: `Relation-aware policy may not be translatable to SQL for cross-store relation`,
            }),
          );
        }
      }
    }
  }

  // PolicyTranslationTargetValid + PolicyNotTranslatableToSQL
  for (const pt of input.translations) {
    if (pt.target.kind === "sql_predicate") {
      if (pt.translatable && pt.policy.target_entity.store_name == null) {
        out.push(
          diagnostic({
            severity: "error",
            code: "authz:sql-translation-no-store",
            message: `Policy ${pt.policy.name} marked translatable to SQL but its entity has no store`,
          }),
        );
      }
      if (!pt.translatable) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "authz:sql-translation-failed",
            message: `Policy ${pt.policy.name} cannot be translated to SQL predicate`,
          }),
        );
      }
    }
  }

  // ServerOnlyFieldExposedInClientPolicy
  for (const cpe of input.exposures) {
    for (const action of cpe.exposed_actions) {
      for (const policy_rule of cpe.policy.actions) {
        if (
          policy_rule.action_name === action &&
          policy_rule.condition.kind === "AllowOwner" &&
          policy_rule.condition.owner_field &&
          policy_rule.condition.owner_field.semantic_type.server_only
        ) {
          out.push(
            diagnostic({
              severity: "error",
              code: "authz:server-only-in-client-policy",
              message: `Server-only owner field exposed in client policy metadata for action ${action}`,
            }),
          );
        }
      }
    }
  }

  // UnsafeClientPolicyExposure + ClientExposureSafe invariant
  for (const cpe of input.exposures) {
    if (!cpe.safe_to_expose && !cpe.server_only_fields_hidden) {
      out.push(
        diagnostic({
          severity: "error",
          code: "authz:unsafe-client-exposure",
          message: `Policy ${cpe.policy.name} exposes unsafe metadata to client`,
        }),
      );
    }
    if (cpe.safe_to_expose && !cpe.server_only_fields_hidden) {
      out.push(
        diagnostic({
          severity: "error",
          code: "authz:safe-but-not-hidden",
          message: `Policy ${cpe.policy.name} marked safe_to_expose but server-only fields aren't hidden`,
        }),
      );
    }
  }

  // RuleDependencyExists — graph-native: walk READS edges from the rule node.
  const knownEntities = new Set(entitiesToCheck);
  for (const p of policiesToCheck) {
    if (!p.predicate) continue;
    const ruleNodeId = `node:rule:${p.predicate.name}`;
    const deps = extractRuleDependenciesFromGraph(input.graph, ruleNodeId);
    for (const e of deps.entities) {
      if (!knownEntities.has(e)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "authz:rule-dependencies-missing",
            message: `Policy ${p.name} rule "${p.predicate.name}" depends on entity "${e.name}" which is not registered`,
          }),
        );
      }
    }
  }

  // PolicyVariableBindingMissing
  for (const p of policiesToCheck) {
    if (!p.predicate) continue;
    if (!p.variable_bindings) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "authz:policy-variable-binding-missing",
          message: `Policy ${p.name} uses a rule predicate but does not declare variable_bindings (actor, resource, action). Add explicit bindings for clarity and tooling.`,
          suggestion: `Add variable_bindings: { actor: "actor", resource: "${p.target_entity.name.toLowerCase()}" } to policy ${p.name}`,
        }),
      );
    }
  }

  // MissingServerEnforcement / AuthoritativeClientPolicy
  for (const p of policiesToCheck) {
    for (const binding of p.access_surface_bindings ?? []) {
      if (binding.surface.kind === "ui.hint") {
        const isClientOnly =
          binding.placement?.kind === "client_hint" || (!binding.placement && p.predicate == null);
        if (isClientOnly && p.predicate == null) {
          out.push(
            diagnostic({
              severity: "error",
              code: "authz:missing-server-enforcement",
              message: `Policy ${p.name} for UI hint surface has no server-side enforcement. Client hints are not authoritative.`,
            }),
          );
        }
      }
    }
  }

  // Placement analysis for access-surface bindings
  out.push(...checkPlacement({ policies: policiesToCheck }));

  return out;
};

/** Pass definition for the authz checker. */
export const authzCheckPass = {
  name: "authz.check",
  phase: "check" as const,
  description:
    "Validates policy nodes against entity ownership, relation enforceability, and exposure safety.",
  reads: ["node:policy", "node:entity", "node:rule"],
};
