/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel edge - semantic connections.
 *
 * A semantic connection between graph objects.
 * Models the revised core Edge primitive - the biggest revision from the original.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { TraitRef } from "./trait.ts";
import type { KernelObjectRef } from "./id.ts";

/** Edge cardinality. */
export type EdgeCardinality = "one" | "optional" | "many";

/** An endpoint in an edge. */
export interface KernelEdgeEndpoint {
  readonly role: string;
  readonly target: KernelObjectRef;
  readonly cardinality?: EdgeCardinality;
}

/** Provenance - how an edge was derived. */
export type KernelProvenance =
  | { kind: "explicit"; source?: string }
  | { kind: "inferred"; pass: string; confidence: "exact" | "conservative" }
  | { kind: "lowered"; from: KernelId; pass: string };

/** Edge kinds - the semantic connections the kernel supports. */
export type EdgeKind =
  | "owns"
  | "contains"
  | "references"
  | "reads"
  | "writes"
  | "derives"
  | "requires"
  | "provides"
  | "invalidates"
  | "patches"
  | "emits"
  | "handles"
  | "triggers"
  | "guards"
  | "displays"
  | "edits"
  | "submits"
  | "stores"
  | "mapsTo"
  | "hasType"
  | "crossesBoundary"
  | "lowersTo"
  | "generatedFrom"
  | "dependsOn";

/** Kernel edge - a semantic connection between objects. */
export interface KernelEdge {
  readonly id: KernelId<"edge">;
  readonly kind: EdgeKind;
  readonly endpoints: readonly KernelEdgeEndpoint[];
  readonly payloadType?: KernelObjectRef;
  readonly constraints?: readonly KernelObjectRef[];
  readonly traits: readonly TraitRef[];
  readonly metadata?: KernelMetadata;
  readonly provenance?: KernelProvenance;
}

/** Create a kernel edge. */
export const defineEdge = <const K extends EdgeKind>(
  kind: K,
  endpoints: readonly KernelEdgeEndpoint[],
  input?: {
    readonly payloadType?: KernelObjectRef;
    readonly constraints?: readonly KernelObjectRef[];
    readonly traits?: readonly TraitRef[];
    readonly metadata?: KernelMetadata;
    readonly provenance?: KernelProvenance;
  },
): KernelEdge => ({
  id: `edge:${kind}` as KernelId<"edge">,
  kind,
  endpoints,
  payloadType: input?.payloadType,
  constraints: input?.constraints,
  traits: input?.traits ?? [],
  metadata: input?.metadata,
  provenance: input?.provenance,
});

/** Common edge builders - representing domain, authz, reactivity, and storage topologies. */
export const edge = {
  /** Entity owns field. */
  owns: (entity: KernelObjectRef, field: KernelObjectRef): KernelEdge =>
    defineEdge("owns", [
      { role: "owner", target: entity, cardinality: "one" },
      { role: "owned", target: field, cardinality: "one" },
    ], { traits: ["edge.owns", "edge.stores"] }),

  /** Field has type. */
  hasType: (field: KernelObjectRef, type: KernelObjectRef): KernelEdge =>
    defineEdge("hasType", [
      { role: "field", target: field, cardinality: "one" },
      { role: "type", target: type, cardinality: "one" },
    ], { traits: ["edge.hasType"] }),

  /** Rule reads field. */
  reads: (reader: KernelObjectRef, field: KernelObjectRef): KernelEdge =>
    defineEdge("reads", [
      { role: "reader", target: reader, cardinality: "one" },
      { role: "field", target: field, cardinality: "optional" },
    ], { traits: ["edge.reads"] }),

  /** Action writes field. */
  writes: (writer: KernelObjectRef, field: KernelObjectRef): KernelEdge =>
    defineEdge("writes", [
      { role: "writer", target: writer, cardinality: "one" },
      { role: "field", target: field, cardinality: "optional" },
    ], { traits: ["edge.writes"] }),

  /** Rule guards action/view/policy. */
  guards: (guard: KernelObjectRef, guarded: KernelObjectRef): KernelEdge =>
    defineEdge("guards", [
      { role: "guard", target: guard, cardinality: "one" },
      { role: "guarded", target: guarded, cardinality: "one" },
    ], { traits: ["edge.guards"] }),

  /** Action requires provider/context. */
  requires: (consumer: KernelObjectRef, required: KernelObjectRef): KernelEdge =>
    defineEdge("requires", [
      { role: "consumer", target: consumer, cardinality: "one" },
      { role: "required", target: required, cardinality: "optional" },
    ], { traits: ["edge.requires"] }),

  /** Query derives key. */
  derives: (deriver: KernelObjectRef, derived: KernelObjectRef): KernelEdge =>
    defineEdge("derives", [
      { role: "source", target: deriver, cardinality: "one" },
      { role: "derived", target: derived, cardinality: "optional" },
    ], { traits: ["edge.derives"] }),

  /** Action invalidates key/resource. */
  invalidates: (invalidator: KernelObjectRef, target: KernelObjectRef): KernelEdge =>
    defineEdge("invalidates", [
      { role: "invalidator", target: invalidator, cardinality: "one" },
      { role: "target", target: target, cardinality: "many" },
    ], { traits: ["edge.invalidates"] }),

  /** Field maps to storage column. */
  mapsTo: (field: KernelObjectRef, storage: KernelObjectRef): KernelEdge =>
    defineEdge("mapsTo", [
      { role: "field", target: field, cardinality: "one" },
      { role: "storage", target: storage, cardinality: "one" },
    ], { traits: ["edge.mapsTo", "edge.stores"] }),

  /** Entity stored in storage container. */
  stores: (entity: KernelObjectRef, container: KernelObjectRef): KernelEdge =>
    defineEdge("stores", [
      { role: "entity", target: entity, cardinality: "one" },
      { role: "container", target: container, cardinality: "one" },
    ], { traits: ["edge.stores"] }),

  /** View displays field. */
  displays: (view: KernelObjectRef, field: KernelObjectRef): KernelEdge =>
    defineEdge("displays", [
      { role: "view", target: view, cardinality: "one" },
      { role: "field", target: field, cardinality: "optional" },
    ], { traits: ["edge.displays"] }),

  /** View edits field. */
  edits: (view: KernelObjectRef, field: KernelObjectRef): KernelEdge =>
    defineEdge("edits", [
      { role: "view", target: view, cardinality: "one" },
      { role: "field", target: field, cardinality: "optional" },
    ], { traits: ["edge.edits"] }),

  /** View submits action. */
  submits: (view: KernelObjectRef, action: KernelObjectRef): KernelEdge =>
    defineEdge("submits", [
      { role: "view", target: view, cardinality: "one" },
      { role: "action", target: action, cardinality: "many" },
    ], { traits: ["edge.submits"] }),

  /** View enabled when rule passes. */
  enabledWhen: (view: KernelObjectRef, rule: KernelObjectRef): KernelEdge =>
    defineEdge("guards", [
      { role: "view", target: view, cardinality: "one" },
      { role: "rule", target: rule, cardinality: "one" },
    ], { traits: ["edge.guards"] }),

  /** Node crosses boundary. */
  crossesBoundary: (node: KernelObjectRef, boundary: KernelObjectRef): KernelEdge =>
    defineEdge("crossesBoundary", [
      { role: "node", target: node, cardinality: "one" },
      { role: "boundary", target: boundary, cardinality: "one" },
    ], { traits: ["edge.crossesBoundary"] }),

  /** Artifact generated from node/edge. */
  generatedFrom: (artifact: KernelObjectRef, source: KernelObjectRef): KernelEdge =>
    defineEdge("generatedFrom", [
      { role: "artifact", target: artifact, cardinality: "one" },
      { role: "source", target: source, cardinality: "many" },
    ], { traits: ["edge.generatedFrom"] }),
};