/* @__NO_SIDE_EFFECTS__ */
/**
 * Reaction dialect pass (Track E port, PLAN.md §3).
 *
 * `derive.reactions` validates Reaction invariants. The check reads
 * REACTION nodes via `getReactionsFromGraph`, which now reads the
 * typed `ReactionNodeCustom` payload (Track R bridge retirement).
 *
 * Pattern mirrors `src/events/passes.ts` and `src/relation/passes.ts`.
 */

import type { GenContext } from "../core/index.ts";
import type { KernelGraph, KernelNode } from "../kernel/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkReactions } from "./reaction.ts";
import { getReactionsFromGraph } from "./kernel.ts";

const REACTIONS_PASS_NAME = "derive.reactions";

/** Register the graph-native reactions pass on `ctx.passRegistry`. */
export const registerReactionPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(REACTIONS_PASS_NAME)) return;

  ctx.passRegistry.register(
    { name: REACTIONS_PASS_NAME, phase: "derive" },
    (graph: KernelGraph): PassResult => {
      const nodeGraph = graph as unknown as { nodes: ReadonlyMap<string, KernelNode> };
      const diagnostics = checkReactions(getReactionsFromGraph(nodeGraph));
      return {
        success: !diagnostics.some((d) => d.severity === "error"),
        diagnostics: diagnostics.map((d) =>
          defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
        ),
      };
    },
  );
};
