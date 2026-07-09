/* @__NO_SIDE_EFFECTS__ */
/**
 * Ownership dialect — core dialect for ownership and containment edges.
 *
 * Ownership is not one primitive. It is a family of edge kinds and analyses:
 * entity owns fields, store owns tables, component owns styles, tenant owns
 * entities, etc.
 *
 * See docs/revision/revised_phases.md §R2.
 */

import { defineDialect, dialectId } from "../../kernel/dialect.ts";
import { defineEdgeKind, defineEndpointRole } from "../../kernel/ods.ts";
import { defineTrait } from "../../kernel/symbol.ts";

// === Traits =================================================================

export const ownershipTraits = {
  /** The owner is responsible for the lifecycle of the owned object. */
  LIFECYCLE_OWNER: defineTrait<true>("trait.ownership.lifecycleOwner", "Lifecycle owner", "edge"),
  /** The ownership is exclusive; no other owner may claim the same object. */
  EXCLUSIVE: defineTrait<true>("trait.ownership.exclusive", "Exclusive ownership", "edge"),
  /** The owned object is generated from the owner (derived table, view, etc). */
  GENERATED: defineTrait<true>("trait.ownership.generated", "Generated from owner", "edge"),
  /** The ownership crosses a storage or trust boundary. */
  CROSS_BOUNDARY: defineTrait<true>(
    "trait.ownership.crossBoundary",
    "Cross-boundary ownership",
    "edge",
  ),
} as const;

// === Edge kinds =============================================================

/** Generic owns edge: owner → owned. */
export const OWNS_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.owns",
  dialect: "dialect.core.ownership",
  endpoints: [defineEndpointRole("owner", {}), defineEndpointRole("owned", {})],
  traits: [ownershipTraits.LIFECYCLE_OWNER, ownershipTraits.EXCLUSIVE],
  metadata: { title: "Owns" },
});

/** Contains edge: container → contained (weaker than owns; no lifecycle). */
export const CONTAINS_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.contains",
  dialect: "dialect.core.ownership",
  endpoints: [defineEndpointRole("container", {}), defineEndpointRole("contained", {})],
  metadata: { title: "Contains" },
});

/** Generated-from edge: derived → source it was generated from. */
export const GENERATED_FROM_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.generatedFrom",
  dialect: "dialect.core.ownership",
  endpoints: [defineEndpointRole("derived", {}), defineEndpointRole("source", {})],
  traits: [ownershipTraits.GENERATED],
  metadata: { title: "Generated from" },
});

/** Responsible-for edge: actor/tenant/organization → resource it governs. */
export const RESPONSIBLE_FOR_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.responsibleFor",
  dialect: "dialect.core.ownership",
  endpoints: [defineEndpointRole("responsible", {}), defineEndpointRole("resource", {})],
  traits: [ownershipTraits.LIFECYCLE_OWNER],
  metadata: { title: "Responsible for" },
});

// === Dialect definition =====================================================

export const OwnershipDialect = defineDialect({
  id: dialectId("dialect.core.ownership"),
  namespace: "core.ownership",
  label: "Core Ownership",
  nodeKinds: [],
  edgeKinds: [
    OWNS_EDGE_KIND,
    CONTAINS_EDGE_KIND,
    GENERATED_FROM_EDGE_KIND,
    RESPONSIBLE_FOR_EDGE_KIND,
  ],
  traits: Object.values(ownershipTraits),
  passes: [],
  lowerings: [],
  metadata: {
    title: "Core Ownership Dialect",
    description: "Ownership, containment, and responsibility edges.",
  },
});
