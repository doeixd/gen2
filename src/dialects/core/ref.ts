/* @__NO_SIDE_EFFECTS__ */
/**
 * Ref dialect — core dialect for typed stable identities and citations.
 *
 * Every domain object that other parts of the spec want to point at — fields,
 * relations, slots, columns, services, etc. — is referred to by a Ref rather
 * than by string. The Ref dialect provides the node kinds, edge kinds, and
 * traits that make this explicit in the graph.
 *
 * See docs/revision/revised_phases.md §R2.
 */

import { defineDialect, dialectId } from "../../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../../kernel/ods.ts";
import { defineTrait } from "../../kernel/symbol.ts";

// === Traits specific to the Ref dialect =====================================

export const refTraits = {
  /** The node carries a stable, persisted identity that survives renames. */
  STABLE_ID: defineTrait<true>("trait.ref.stableId", "Has stable ID", "node"),
  /** The node is a typed citation pointing at another semantic object. */
  CITATION: defineTrait<true>("trait.ref.citation", "Citation", "node"),
  /** The node's identity is auto-derived from its owner and name. */
  DERIVED_ID: defineTrait<true>("trait.ref.derivedId", "Derived ID", "node"),
} as const;

// === Node kinds =============================================================

/** A Ref node — represents a typed stable identity in the graph. */
export const REF_NODE_KIND = defineNodeKind({
  id: "node.kind.ref",
  dialect: "dialect.core.ref",
  traits: [refTraits.STABLE_ID, refTraits.CITATION],
  metadata: { title: "Ref node" },
});

// === Edge kinds =============================================================

/** A references edge — connects a ref node to its owner. */
export const REFERENCES_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.references",
  dialect: "dialect.core.ref",
  endpoints: [
    defineEndpointRole("referrer", { targetKinds: [REF_NODE_KIND] }),
    defineEndpointRole("target", {}),
  ],
  metadata: { title: "References" },
});

/** An owns edge — connects an owner to its owned ref. */
export const OWNS_REF_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.ownsRef",
  dialect: "dialect.core.ref",
  endpoints: [
    defineEndpointRole("owner", {}),
    defineEndpointRole("owned", { targetKinds: [REF_NODE_KIND] }),
  ],
  metadata: { title: "Owns ref" },
});

// === Dialect definition =====================================================

export const RefDialect = defineDialect({
  id: dialectId("dialect.core.ref"),
  namespace: "core.ref",
  label: "Core Ref",
  nodeKinds: [REF_NODE_KIND],
  edgeKinds: [REFERENCES_EDGE_KIND, OWNS_REF_EDGE_KIND],
  traits: Object.values(refTraits),
  passes: [],
  lowerings: [],
  metadata: {
    title: "Core Ref Dialect",
    description: "Typed stable identities and citations for all semantic objects.",
  },
});
