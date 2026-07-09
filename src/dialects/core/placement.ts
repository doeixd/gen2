/* @__NO_SIDE_EFFECTS__ */
/**
 * Placement dialect — core dialect for storage locations and placement facts.
 *
 * Models where data lives (server request context, client localStorage,
 * shared cookie, etc.) with semantic capabilities so the lifecycle can
 * emit diagnostics for unsafe placements.
 *
 * See docs/revision/revised_phases.md §R2.
 */

import { defineDialect, dialectId } from "../../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../../kernel/ods.ts";
import { defineTrait } from "../../kernel/symbol.ts";

export type StorageLocationNodeCustom = {
  readonly location_kind: string;
  readonly ttl_ms?: number;
  readonly capabilities: {
    readonly persistent: boolean;
    readonly sensitive_safe: boolean;
    readonly client_readable: boolean;
    readonly client_writable: boolean;
    readonly server_readable: boolean;
    readonly server_writable: boolean;
  };
};

export type PlacementEdgeCustom = {
  readonly role?: "placement" | "storage" | "source";
  readonly location_kind?: string;
};

// === Traits =================================================================

export const placementTraits = {
  PERSISTENT: defineTrait<true>("trait.placement.persistent", "Persistent location", "node"),
  EPHEMERAL: defineTrait<true>("trait.placement.ephemeral", "Ephemeral location", "node"),
  SENSITIVE_SAFE: defineTrait<true>(
    "trait.placement.sensitiveSafe",
    "Sensitive-safe location",
    "node",
  ),
  CLIENT_READABLE: defineTrait<true>(
    "trait.placement.clientReadable",
    "Client-readable location",
    "node",
  ),
  CLIENT_WRITABLE: defineTrait<true>(
    "trait.placement.clientWritable",
    "Client-writable location",
    "node",
  ),
  SERVER_READABLE: defineTrait<true>(
    "trait.placement.serverReadable",
    "Server-readable location",
    "node",
  ),
  SERVER_WRITABLE: defineTrait<true>(
    "trait.placement.serverWritable",
    "Server-writable location",
    "node",
  ),
} as const;

// === Node kinds =============================================================

export const STORAGE_LOCATION_NODE_KIND = defineNodeKind({
  id: "node.kind.storageLocation",
  dialect: "dialect.core.placement",
  traits: Object.values(placementTraits),
  custom: undefined as unknown as StorageLocationNodeCustom,
  metadata: { title: "Storage location" },
});

// === Edge kinds =============================================================

export const PLACED_IN_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.placedIn",
  dialect: "dialect.core.placement",
  endpoints: [
    defineEndpointRole("placed", {}),
    defineEndpointRole("location", { targetKinds: [STORAGE_LOCATION_NODE_KIND] }),
  ],
  custom: undefined as unknown as PlacementEdgeCustom,
  metadata: { title: "Placed in" },
});

export const SOURCED_FROM_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.sourcedFrom",
  dialect: "dialect.core.placement",
  endpoints: [
    defineEndpointRole("consumer", {}),
    defineEndpointRole("source", { targetKinds: [STORAGE_LOCATION_NODE_KIND] }),
  ],
  custom: undefined as unknown as PlacementEdgeCustom,
  metadata: { title: "Sourced from" },
});

export const CROSSES_BOUNDARY_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.crossesBoundary",
  dialect: "dialect.core.placement",
  endpoints: [defineEndpointRole("from", {}), defineEndpointRole("to", {})],
  metadata: { title: "Crosses boundary" },
});

export const HYDRATES_THROUGH_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.hydratesThrough",
  dialect: "dialect.core.placement",
  endpoints: [
    defineEndpointRole("hydrated", {}),
    defineEndpointRole("via", { targetKinds: [STORAGE_LOCATION_NODE_KIND] }),
  ],
  metadata: { title: "Hydrates through" },
});

// === Dialect definition =====================================================

export const PlacementDialect = defineDialect({
  id: dialectId("dialect.core.placement"),
  namespace: "core.placement",
  label: "Core Placement",
  nodeKinds: [STORAGE_LOCATION_NODE_KIND],
  edgeKinds: [
    PLACED_IN_EDGE_KIND,
    SOURCED_FROM_EDGE_KIND,
    CROSSES_BOUNDARY_EDGE_KIND,
    HYDRATES_THROUGH_EDGE_KIND,
  ],
  traits: Object.values(placementTraits),
  passes: [],
  lowerings: [],
  metadata: {
    title: "Core Placement Dialect",
    description: "Storage locations and placement facts for data lifecycle safety.",
  },
});
