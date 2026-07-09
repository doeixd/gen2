/* @__NO_SIDE_EFFECTS__ */
/**
 * Adapter: StorageLocation → kernel graph IR.
 */

import type { StorageLocation } from "./locations.ts";
import { defineNodeFromKind } from "../kernel/node.ts";
import { STORAGE_LOCATION_NODE_KIND, placementTraits } from "../dialects/core/placement.ts";
import type { TraitDef } from "../kernel/trait.ts";
import { graphFragment, graphNode, type AnyGraphStep } from "../kernel/index.ts";

export const storageLocationNodeId = (location: StorageLocation): string =>
  `node:storageLocation:${location.location_kind}`;

const locationTraits = (location: StorageLocation): readonly TraitDef[] => {
  const traits: TraitDef[] = [];
  if (location.capabilities.persistent) traits.push(placementTraits.PERSISTENT);
  else traits.push(placementTraits.EPHEMERAL);
  if (location.capabilities.sensitive_safe) traits.push(placementTraits.SENSITIVE_SAFE);
  if (location.capabilities.client_readable) traits.push(placementTraits.CLIENT_READABLE);
  if (location.capabilities.client_writable) traits.push(placementTraits.CLIENT_WRITABLE);
  if (location.capabilities.server_readable) traits.push(placementTraits.SERVER_READABLE);
  if (location.capabilities.server_writable) traits.push(placementTraits.SERVER_WRITABLE);
  return traits;
};

export const storageLocationToKernelNode = (location: StorageLocation) =>
  defineNodeFromKind(STORAGE_LOCATION_NODE_KIND, storageLocationNodeId(location), {
    name: location.name,
    traits: locationTraits(location),
    metadata: {
      custom: {
        location_kind: location.location_kind,
        ttl_ms: location.ttl_ms,
        capabilities: location.capabilities,
      },
    },
  });

/** Build a composable graph fragment for a storage location. */
export const storageLocationToGraphFragment = (location: StorageLocation): AnyGraphStep =>
  graphFragment(graphNode(storageLocationToKernelNode(location)));
