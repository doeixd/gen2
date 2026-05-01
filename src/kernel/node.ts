/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel node - semantic graph objects.
 *
 * A semantic object in the application graph.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { TraitDef } from "./trait.ts";
import type { KernelType } from "./type.ts";
import type { KernelExpr } from "./expr.ts";
import type { KernelObjectRef } from "./id.ts";

/** Node kind - simple typed identifier. */
export interface NodeKind {
  readonly id: string;
  readonly label: string;
}

/** Kernel node - a semantic object in the graph. */
export interface KernelNode<
  Kind extends NodeKind = NodeKind,
  In = unknown,
  Out = unknown
> {
  readonly kind: Kind;
  readonly id: KernelId<"node">;
  readonly name?: string;
  readonly input?: KernelType<In>;
  readonly output?: KernelType<Out>;
  readonly body?: KernelExpr | KernelObjectRef;
  readonly traits: readonly TraitDef[];
  readonly metadata?: KernelMetadata;
}

/** Create a kernel node. */
export const defineNode = <Kind extends NodeKind, In, Out>(
  kind: Kind,
  id: string,
  input?: {
    readonly name?: string;
    readonly input?: KernelType<In>;
    readonly output?: KernelType<Out>;
    readonly body?: KernelExpr | KernelObjectRef;
    readonly traits?: readonly TraitDef[];
    readonly metadata?: KernelMetadata;
  },
): KernelNode<Kind, In, Out> => ({
  kind,
  id: id as KernelId<"node">,
  name: input?.name,
  input: input?.input,
  output: input?.output,
  body: input?.body,
  traits: input?.traits ?? [],
  metadata: input?.metadata,
});