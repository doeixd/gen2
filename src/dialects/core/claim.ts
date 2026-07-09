/* @__NO_SIDE_EFFECTS__ */
/**
 * Claim dialect — core substrate for asserted semantic facts.
 *
 * Auth, policy, provider, and placement dialects can build on claims, but the
 * base claim shape belongs in core so non-auth systems can also attach
 * evidence and authority to graph facts.
 *
 * See docs/revision/revised_phases.md §R2.
 */

import { defineDialect, dialectId } from "../../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../../kernel/ods.ts";
import { defineTrait } from "../../kernel/symbol.ts";
import { PREDICATE_NODE_KIND, RULE_NODE_KIND, EXPRESSION_NODE_KIND } from "./expr-rule.ts";

export const claimTraits = {
  AUTHORITATIVE: defineTrait<true>("trait.claim.authoritative", "Authoritative claim", "node"),
  CLIENT_SAFE: defineTrait<true>("trait.claim.clientSafe", "Client-safe claim", "node"),
  SERVER_ONLY: defineTrait<true>("trait.claim.serverOnly", "Server-only claim", "node"),
  DERIVED: defineTrait<true>("trait.claim.derived", "Derived claim", "node"),
} as const;

export const CLAIM_NODE_KIND = defineNodeKind({
  id: "node.kind.claim",
  dialect: "dialect.core.claim",
  traits: Object.values(claimTraits),
  metadata: { title: "Claim" },
});

export const CLAIM_SUBJECT_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.claimSubject",
  dialect: "dialect.core.claim",
  endpoints: [
    defineEndpointRole("claim", { targetKinds: [CLAIM_NODE_KIND] }),
    defineEndpointRole("subject", {}),
  ],
  metadata: { title: "Claim subject" },
});

export const CLAIM_PREDICATE_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.claimPredicate",
  dialect: "dialect.core.claim",
  endpoints: [
    defineEndpointRole("claim", { targetKinds: [CLAIM_NODE_KIND] }),
    defineEndpointRole("predicate", {
      targetKinds: [PREDICATE_NODE_KIND, RULE_NODE_KIND, EXPRESSION_NODE_KIND],
    }),
  ],
  metadata: { title: "Claim predicate" },
});

export const CLAIM_SOURCE_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.claimSource",
  dialect: "dialect.core.claim",
  endpoints: [
    defineEndpointRole("claim", { targetKinds: [CLAIM_NODE_KIND] }),
    defineEndpointRole("source", {}),
  ],
  metadata: { title: "Claim source" },
});

export const CLAIM_EVIDENCE_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.claimEvidence",
  dialect: "dialect.core.claim",
  endpoints: [
    defineEndpointRole("claim", { targetKinds: [CLAIM_NODE_KIND] }),
    defineEndpointRole("evidence", {}),
  ],
  metadata: { title: "Claim evidence" },
});

export const ClaimDialect = defineDialect({
  id: dialectId("dialect.core.claim"),
  namespace: "core.claim",
  label: "Core Claim",
  nodeKinds: [CLAIM_NODE_KIND],
  edgeKinds: [
    CLAIM_SUBJECT_EDGE_KIND,
    CLAIM_PREDICATE_EDGE_KIND,
    CLAIM_SOURCE_EDGE_KIND,
    CLAIM_EVIDENCE_EDGE_KIND,
  ],
  traits: Object.values(claimTraits),
  passes: [],
  lowerings: [],
  metadata: {
    title: "Core Claim Dialect",
    description: "Typed asserted facts with subjects, predicates, sources, and evidence.",
  },
});
