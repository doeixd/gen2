/* @__NO_SIDE_EFFECTS__ */
/**
 * Auth dialect — R8 dialect for policies, claims, and access surfaces.
 *
 * Auth builds on claims, rules, context, provider, operation, and placement
 * dialects. Policies target entities. Claims are nodes/predicates. Auth
 * conditions lower to claim/rule/expr graph IR.
 *
 * See docs/revision/revised_phases.md §R8.
 */

import { defineDialect, dialectId } from "../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../kernel/ods.ts";
import { defineTrait } from "../kernel/symbol.ts";
import type { Policy } from "../authz/authz.ts";
import { CLAIM_NODE_KIND } from "./core/claim.ts";
import { ENTITY_NODE_KIND } from "./domain/entity-field-relation.ts";
import { RULE_NODE_KIND, PREDICATE_NODE_KIND } from "./core/expr-rule.ts";
import { ACTION_NODE_KIND, QUERY_NODE_KIND } from "./callable.ts";

// === Auth traits ============================================================

export const authTraits = {
  /** Policy can be translated to SQL for database-level enforcement. */
  SQL_LOWERABLE: defineTrait<true>("trait.auth.sqlLowerable", "SQL-lowerable policy", "node"),
  /** Policy can be evaluated on the client (non-authoritative hint). */
  CLIENT_EVALUABLE: defineTrait<true>(
    "trait.auth.clientEvaluable",
    "Client-evaluable policy",
    "node",
  ),
  /** Policy requires server-side enforcement. */
  SERVER_ENFORCED: defineTrait<true>("trait.auth.serverEnforced", "Server-enforced policy", "node"),
  /** Policy is public / requires no authentication. */
  PUBLIC: defineTrait<true>("trait.auth.public", "Public access", "node"),
  /** Policy requires authentication. */
  AUTHENTICATED: defineTrait<true>("trait.auth.authenticated", "Requires authentication", "node"),
  /** Policy is based on a role claim. */
  ROLE_BASED: defineTrait<true>("trait.auth.roleBased", "Role-based policy", "node"),
  /** Policy is based on ownership. */
  OWNERSHIP_BASED: defineTrait<true>("trait.auth.ownershipBased", "Ownership-based policy", "node"),
} as const;

// === Node kinds =============================================================

/**
 * Typed payload on a policy node. Carries enough information to walk
 * back to the policy's target entity and predicate rule by *name*,
 * without needing a side-channel JS-object reference (no
 * bridge-policy metadata). Track R §R2's RLS pass reads this payload
 * directly.
 */
export type PolicyNodeCustom = {
  /** Rich policy object for graph-native passes that still need typed access-surface details. */
  readonly policy?: Policy;
  /** Name of the entity the policy targets. */
  readonly target_entity_name: string;
  /** Name of the rule used as the policy predicate, when one is set. */
  readonly predicate_rule_name?: string;
};

export const POLICY_NODE_KIND = defineNodeKind({
  id: "node.kind.policy",
  dialect: "dialect.auth",
  traits: Object.values(authTraits),
  custom: undefined as unknown as PolicyNodeCustom,
  metadata: { title: "Policy" },
});

export const ACCESS_SURFACE_NODE_KIND = defineNodeKind({
  id: "node.kind.accessSurface",
  dialect: "dialect.auth",
  traits: [],
  metadata: { title: "Access surface" },
});

// === Edge kinds =============================================================

/** Policy targets entity edge: policy → entity it applies to. */
export const POLICY_TARGETS_ENTITY_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.policyTargetsEntity",
  dialect: "dialect.auth",
  endpoints: [
    defineEndpointRole("policy", { targetKinds: [POLICY_NODE_KIND] }),
    defineEndpointRole("entity", { targetKinds: [ENTITY_NODE_KIND] }),
  ],
  metadata: { title: "Policy targets entity" },
});

/** Policy uses rule edge: policy → rule it uses for authorization. */
export const POLICY_USES_RULE_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.policyUsesRule",
  dialect: "dialect.auth",
  endpoints: [
    defineEndpointRole("policy", { targetKinds: [POLICY_NODE_KIND] }),
    defineEndpointRole("rule", { targetKinds: [RULE_NODE_KIND, PREDICATE_NODE_KIND] }),
  ],
  metadata: { title: "Policy uses rule" },
});

/** Policy requires claim edge: policy → claim it requires. */
export const POLICY_REQUIRES_CLAIM_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.policyRequiresClaim",
  dialect: "dialect.auth",
  endpoints: [
    defineEndpointRole("policy", { targetKinds: [POLICY_NODE_KIND] }),
    defineEndpointRole("claim", { targetKinds: [CLAIM_NODE_KIND] }),
  ],
  metadata: { title: "Policy requires claim" },
});

/** Guards action edge: policy/rule → action it guards. */
export const GUARDS_ACTION_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.guardsAction",
  dialect: "dialect.auth",
  endpoints: [
    defineEndpointRole("guard", {
      targetKinds: [POLICY_NODE_KIND, RULE_NODE_KIND, PREDICATE_NODE_KIND],
    }),
    defineEndpointRole("action", { targetKinds: [ACTION_NODE_KIND, QUERY_NODE_KIND] }),
  ],
  metadata: { title: "Guards action" },
});

/** Exposes client hint edge: policy → client hint it exposes. */
export const EXPOSES_CLIENT_HINT_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.exposesClientHint",
  dialect: "dialect.auth",
  endpoints: [
    defineEndpointRole("policy", { targetKinds: [POLICY_NODE_KIND] }),
    defineEndpointRole("hint", {}),
  ],
  metadata: { title: "Exposes client hint" },
});

/** Requires server enforcement edge: policy → server enforcement requirement. */
export const REQUIRES_SERVER_ENFORCEMENT_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.requiresServerEnforcement",
  dialect: "dialect.auth",
  endpoints: [
    defineEndpointRole("policy", { targetKinds: [POLICY_NODE_KIND] }),
    defineEndpointRole("enforcement", {}),
  ],
  metadata: { title: "Requires server enforcement" },
});

// === Dialect definition =====================================================

export const AuthDialect = defineDialect({
  id: dialectId("dialect.auth"),
  namespace: "auth",
  label: "Auth",
  nodeKinds: [POLICY_NODE_KIND, ACCESS_SURFACE_NODE_KIND],
  edgeKinds: [
    POLICY_TARGETS_ENTITY_EDGE_KIND,
    POLICY_USES_RULE_EDGE_KIND,
    POLICY_REQUIRES_CLAIM_EDGE_KIND,
    GUARDS_ACTION_EDGE_KIND,
    EXPOSES_CLIENT_HINT_EDGE_KIND,
    REQUIRES_SERVER_ENFORCEMENT_EDGE_KIND,
  ],
  traits: Object.values(authTraits),
  passes: [],
  lowerings: [],
  metadata: {
    title: "Auth Dialect",
    description: "Policies, claims, access surfaces, and authorization edges.",
  },
});
