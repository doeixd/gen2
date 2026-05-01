/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel edge - semantic connections.
 *
 * A semantic connection between graph objects - first-class.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { TraitDef } from "./trait.ts";
import type { KernelObjectRef } from "./id.ts";

/** Edge cardinality. */
export type EdgeCardinality = "one" | "optional" | "many";

/** Endpoint role - typed role identifier. */
export interface EndpointRole {
  readonly id: string;
  readonly label: string;
}

/** An endpoint in an edge. */
export interface KernelEdgeEndpoint {
  readonly role: EndpointRole;
  readonly target: KernelObjectRef;
  readonly cardinality?: EdgeCardinality;
}

/** Edge kind - simple typed identifier. */
export interface EdgeKind {
  readonly id: string;
  readonly label: string;
}

/** Provenance - how an edge was derived. */
export type KernelProvenance =
  | { kind: "explicit"; source?: string }
  | { kind: "inferred"; pass: string; confidence: "exact" | "conservative" }
  | { kind: "lowered"; from: KernelId; pass: string };

/** Kernel edge - a semantic connection between objects. */
export interface KernelEdge<
  Kind extends EdgeKind = EdgeKind
> {
  readonly kind: Kind;
  readonly id: KernelId<"edge">;
  readonly endpoints: readonly KernelEdgeEndpoint[];
  readonly payloadType?: KernelObjectRef;
  readonly constraints?: readonly KernelObjectRef[];
  readonly traits: readonly TraitDef[];
  readonly metadata?: KernelMetadata;
  readonly provenance?: KernelProvenance;
}

/** Create a kernel edge. */
export const defineEdge = <Kind extends EdgeKind>(
  kind: Kind,
  id: string,
  endpoints: readonly KernelEdgeEndpoint[],
  input?: {
    readonly payloadType?: KernelObjectRef;
    readonly constraints?: readonly KernelObjectRef[];
    readonly traits?: readonly TraitDef[];
    readonly metadata?: KernelMetadata;
    readonly provenance?: KernelProvenance;
  },
): KernelEdge<Kind> => ({
  kind,
  id: id as KernelId<"edge">,
  endpoints,
  payloadType: input?.payloadType,
  constraints: input?.constraints,
  traits: input?.traits ?? [],
  metadata: input?.metadata,
  provenance: input?.provenance,
});