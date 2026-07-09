/* @__NO_SIDE_EFFECTS__ */
/**
 * Adapter: Reaction → kernel graph IR.
 *
 * Bridges Reaction into a kernel REACTION node via a typed
 * `ReactionNodeCustom` payload (PLAN.md §0.5 #8 — no `_bridge*`
 * JS-object side channel).
 *
 * See docs/revised-kernel.md and docs/revision/revised_phases.md §R13 Group B.
 */

import type { Reaction } from "./reaction.ts";
import { defineNode, graphFragment, graphNode, nodeKinds } from "../kernel/index.ts";
import type { AnyGraphStep, KernelNode } from "../kernel/index.ts";

/** Typed payload on a REACTION node. */
export type ReactionNodeCustom = { readonly reaction: Reaction };

/** Build a kernel `Node(kind: REACTION)` for a reaction. */
export const reactionToKernelNode = (reaction: Reaction): KernelNode =>
  defineNode(nodeKinds.REACTION, `reaction:${reaction.name}`, {
    name: reaction.name,
    metadata: {
      title: reaction.name,
      custom: { reaction } satisfies ReactionNodeCustom,
    },
  });

export const reactionToGraphFragment = (reaction: Reaction): AnyGraphStep =>
  graphFragment(graphNode(reactionToKernelNode(reaction)));

// === Graph-native extraction helpers =========================================

/** Extract all Reaction instances from the graph. */
export const getReactionsFromGraph = (graph: {
  nodes: ReadonlyMap<string, KernelNode>;
}): Reaction[] => {
  const reactions: Reaction[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== nodeKinds.REACTION) continue;
    const custom = node.metadata?.custom as ReactionNodeCustom | undefined;
    if (custom?.reaction) reactions.push(custom.reaction);
  }
  return reactions;
};
