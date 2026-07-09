/* @__NO_SIDE_EFFECTS__ */
/**
 * Adapter: KeyFamily → kernel graph IR.
 *
 * Pure conversion from the legacy `KeyFamily` domain object to a kernel
 * `Node(kind: KEY_FAMILY)` carrying a typed `KeyFamilyNodeCustom`
 * payload. No bridge-key-family JS-object side channel (PLAN.md
 * §0.5 #8 — port-or-delete).
 *
 * No `ctx.graph` mutation — registration happens in the binder dual-write.
 */

import type {
  AnyResource,
  KeyFamily,
  KeyFamilyHierarchy,
  KeyInvalidationSemantics,
  KeyPayload,
  ReactiveMutation,
} from "./reactivity.ts";
import type { KeyFamilyId, KeyFamilyRef } from "../core/refs.ts";
import type { SemanticType } from "../types/index.ts";
import type { AnyGraphStep, KernelGraph } from "../kernel/index.ts";
import { defineNode, graphFragment, graphNode, nodeKinds } from "../kernel/index.ts";
import {
  REACTIVE_MUTATION_NODE_KIND,
  REACTIVE_RESOURCE_NODE_KIND,
} from "../dialects/reactivity.ts";

/**
 * Typed payload on a `Node(kind: KEY_FAMILY)`. Carries the structural
 * fields needed to reconstruct a `KeyFamily` without a `_bridge*`
 * JS-object recovery (PLAN.md §R2 template).
 */
export type KeyFamilyNodeCustom<Payload extends KeyPayload = KeyPayload> = {
  readonly key_family_id?: KeyFamilyId;
  readonly ref: KeyFamilyRef<Payload>;
  readonly hierarchy: KeyFamilyHierarchy;
  readonly semantics?: KeyInvalidationSemantics;
  readonly input_type?: SemanticType<Payload>;
  readonly description?: string;
};

export type ReactiveResourceNodeCustom = {
  readonly resource: AnyResource;
};

export type ReactiveMutationNodeCustom = {
  readonly mutation: ReactiveMutation;
};

const nodeKindFromDef = (def: {
  readonly id: string;
  readonly metadata?: { readonly title?: unknown };
}) => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

/** Build a `Node(kind: KEY_FAMILY)` for a key family. */
export const keyFamilyToKernelNode = (family: KeyFamily) => {
  const custom: KeyFamilyNodeCustom = {
    key_family_id: family.id,
    ref: family.ref,
    hierarchy: family.hierarchy,
    semantics: family.semantics,
    input_type: family.input_type,
    description: family.description,
  };
  return defineNode(nodeKinds.KEY_FAMILY, family.ref.id ?? `node:keyFamily:${family.name}`, {
    name: family.name,
    metadata: {
      title: family.name,
      description: family.description ?? `Key family (${family.hierarchy})`,
      custom,
    },
  });
};

/** Build a composable graph fragment for a key family. */
export const keyFamilyToGraphFragment = (family: KeyFamily): AnyGraphStep =>
  graphFragment(graphNode(keyFamilyToKernelNode(family)));

export const reactiveResourceToKernelNode = (resource: AnyResource) =>
  defineNode(
    nodeKindFromDef(REACTIVE_RESOURCE_NODE_KIND),
    `node:reactiveResource:${resource.name}`,
    {
      name: resource.name,
      metadata: {
        title: resource.name,
        custom: { resource } satisfies ReactiveResourceNodeCustom,
      },
    },
  );

export const reactiveResourceToGraphFragment = (resource: AnyResource): AnyGraphStep =>
  graphFragment(graphNode(reactiveResourceToKernelNode(resource)));

export const reactiveMutationToKernelNode = (mutation: ReactiveMutation) =>
  defineNode(
    nodeKindFromDef(REACTIVE_MUTATION_NODE_KIND),
    `node:reactiveMutation:${mutation.name}`,
    {
      name: mutation.name,
      metadata: {
        title: mutation.name,
        custom: { mutation } satisfies ReactiveMutationNodeCustom,
      },
    },
  );

export const reactiveMutationToGraphFragment = (mutation: ReactiveMutation): AnyGraphStep =>
  graphFragment(graphNode(reactiveMutationToKernelNode(mutation)));

const reconstructKeyFamily = (node: {
  name?: string;
  metadata?: { description?: string; custom?: Record<string, unknown> };
}): KeyFamily | undefined => {
  const custom = node.metadata?.custom as KeyFamilyNodeCustom | undefined;
  if (!custom || !custom.ref || !custom.hierarchy) return undefined;
  const name = node.name ?? custom.ref.name;
  if (!name) return undefined;
  return {
    kind: "key_family",
    id: custom.key_family_id,
    ref: custom.ref,
    name,
    input_type: custom.input_type,
    hierarchy: custom.hierarchy,
    semantics: custom.semantics,
    description: custom.description,
  };
};

/** Extract all key families from KEY_FAMILY nodes in the graph. */
export const getKeyFamiliesFromGraph = (graph: KernelGraph): KeyFamily[] => {
  const families: KeyFamily[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== nodeKinds.KEY_FAMILY) continue;
    const family = reconstructKeyFamily(node);
    if (family) families.push(family);
  }
  return families;
};

export const getReactiveResourcesFromGraph = (graph: KernelGraph): AnyResource[] => {
  const resources: AnyResource[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== REACTIVE_RESOURCE_NODE_KIND.id) continue;
    const custom = node.metadata?.custom as ReactiveResourceNodeCustom | undefined;
    if (custom?.resource) resources.push(custom.resource);
  }
  return resources;
};

export const getReactiveMutationsFromGraph = (graph: KernelGraph): ReactiveMutation[] => {
  const mutations: ReactiveMutation[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== REACTIVE_MUTATION_NODE_KIND.id) continue;
    const custom = node.metadata?.custom as ReactiveMutationNodeCustom | undefined;
    if (custom?.mutation) mutations.push(custom.mutation);
  }
  return mutations;
};

/** Find a key family by name from KEY_FAMILY nodes in the graph. */
export const findKeyFamilyByNameOnGraph = (
  graph: KernelGraph,
  name: string,
): KeyFamily | undefined => {
  for (const node of graph.nodes.values()) {
    if (node.kind !== nodeKinds.KEY_FAMILY) continue;
    if (node.name !== name) continue;
    const family = reconstructKeyFamily(node);
    if (family) return family;
  }
  return undefined;
};
