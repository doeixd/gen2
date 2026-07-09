/* @__NO_SIDE_EFFECTS__ */
/**
 * Events dialect pass (Track E port, PLAN.md §3).
 *
 * `derive.events` validates Event / EventEmission / Reducer /
 * Subscription invariants. The check itself reads only kernel-graph
 * extraction helpers (`getEventsFromGraph`, etc.), all of which now
 * read typed `*NodeCustom` / `*EdgeCustom` payloads (Track R bridge
 * retirement). No `passCtx.options.genContext` reads.
 *
 * Pattern mirrors `src/requirements/passes.ts` and
 * `src/relation/passes.ts`.
 */

import type { GenContext } from "../core/index.ts";
import type { KernelEdge, KernelGraph, KernelNode } from "../kernel/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkEvents } from "./events.ts";
import {
  getEventsFromGraph,
  getEventEmissionsFromGraph,
  getReducersFromGraph,
  getSubscriptionsFromGraph,
} from "./kernel.ts";

const EVENTS_PASS_NAME = "derive.events";

/** Register the graph-native events pass on `ctx.passRegistry`. */
export const registerEventsPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(EVENTS_PASS_NAME)) return;

  ctx.passRegistry.register(
    { name: EVENTS_PASS_NAME, phase: "derive" },
    (graph: KernelGraph): PassResult => {
      const nodeGraph = graph as unknown as { nodes: ReadonlyMap<string, KernelNode> };
      const edgeGraph = graph as unknown as { edges: ReadonlyMap<string, KernelEdge> };
      const diagnostics = checkEvents({
        events: getEventsFromGraph(nodeGraph),
        emissions: getEventEmissionsFromGraph(edgeGraph),
        reducers: getReducersFromGraph(nodeGraph),
        subscriptions: getSubscriptionsFromGraph(nodeGraph),
      });
      return {
        success: !diagnostics.some((d) => d.severity === "error"),
        diagnostics: diagnostics.map((d) =>
          defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
        ),
      };
    },
  );
};
