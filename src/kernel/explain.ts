/* @__NO_SIDE_EFFECTS__ */
/**
 * Graph derivation explanation — `app.explain(...)` foundation.
 *
 * Quick Win #11 (PLAN.md §7) and Track N (PLAN.md §0.5 #5: explain is
 * product, not polish).
 *
 * Why this matters: Gen2 derives a lot. Without `explain`, derived
 * behavior feels like magic. With it, the compiler is auditable —
 * users can ask "why is this server-only?", "why did this query
 * invalidate?", "why is this UI hint disabled?" and get a precise
 * answer rooted in graph facts.
 *
 * This file ships a minimal traversal that:
 *   - takes a `KernelGraph` and a subject (node id or ref),
 *   - walks edges incident to the subject (via the graph index),
 *   - returns a structured `Explanation` plus a printable string.
 *
 * Future work (Track N-rest):
 *   - per-derivation explainers ("why does this rule reach this
 *     query?", "why did this lower to broad invalidation?"),
 *   - integration with `app.preview`, `app.diff`, `app.traceArtifact`,
 *   - rule lowerability matrix (Track R §R3),
 *   - human-readable line wrapping and edge-kind narratives.
 */

import type { KernelGraph } from "./graph.ts";
import { edgesFrom } from "./graph.ts";
import type { KernelNode } from "./node.ts";
import type { KernelEdge } from "./edge.ts";

/** A single step in a derivation chain. */
export interface ExplanationStep {
  readonly depth: number;
  readonly nodeId: string;
  readonly nodeKind?: string;
  readonly nodeName?: string;
  readonly viaEdgeId?: string;
  readonly viaEdgeKind?: string;
  /** Free-text narrative summary of this step (one short sentence). */
  readonly narrative: string;
}

/** Result of `explain(...)`. */
export interface Explanation {
  readonly subjectId: string;
  readonly subjectKind?: string;
  readonly subjectName?: string;
  readonly steps: readonly ExplanationStep[];
  /**
   * One-string rendering of the derivation chain, suitable for
   * `console.log` and PR comments.
   */
  readonly trace: string;
}

const subjectId = (subject: string | { readonly id: string }): string =>
  typeof subject === "string" ? subject : subject.id;

const nodeOf = (graph: KernelGraph, id: string): KernelNode | undefined => graph.nodes.get(id);

const otherEndpointId = (edge: KernelEdge, fromId: string): string | undefined => {
  for (const ep of edge.endpoints) {
    const t = ep.target as { id?: string; name?: string } | undefined;
    const tid = t?.id ?? t?.name;
    if (tid && tid !== fromId) return tid;
  }
  return undefined;
};

const formatStep = (step: ExplanationStep): string => {
  const indent = "  ".repeat(step.depth);
  const header = `${indent}${step.depth === 0 ? "■" : "↳"} ${step.narrative}`;
  return header;
};

/**
 * Walk the graph from `subject` outward up to `maxDepth` and produce
 * a derivation trace.
 *
 * Default behaviour is breadth-first up to depth 2 — enough to show
 * "X writes Field; Field is read by Y; Y has key K" chains without
 * exploding on dense graphs.
 */
export const explain = (
  graph: KernelGraph,
  subject: string | { readonly id: string },
  options?: { readonly maxDepth?: number },
): Explanation => {
  const maxDepth = options?.maxDepth ?? 2;
  const startId = subjectId(subject);
  const startNode = nodeOf(graph, startId);

  const steps: ExplanationStep[] = [];
  const seen = new Set<string>([startId]);

  steps.push({
    depth: 0,
    nodeId: startId,
    nodeKind: startNode?.kind.id,
    nodeName: startNode?.name,
    narrative: startNode?.name ? `${startNode.name} (${startNode.kind.id})` : `Subject ${startId}`,
  });

  const frontier: { id: string; depth: number }[] = [{ id: startId, depth: 0 }];

  while (frontier.length > 0) {
    const current = frontier.shift()!;
    if (current.depth >= maxDepth) continue;

    for (const edge of edgesFrom(graph, current.id)) {
      const otherId = otherEndpointId(edge, current.id);
      if (!otherId || seen.has(otherId)) continue;
      seen.add(otherId);

      const otherNode = nodeOf(graph, otherId);
      const fromNarrative = nodeOf(graph, current.id)?.name ?? current.id;
      const toNarrative = otherNode?.name ?? otherId;
      const edgeLabel = edge.kind.id;

      steps.push({
        depth: current.depth + 1,
        nodeId: otherId,
        nodeKind: otherNode?.kind.id,
        nodeName: otherNode?.name,
        viaEdgeId: edge.id,
        viaEdgeKind: edge.kind.id,
        narrative: `${fromNarrative} —[${edgeLabel}]→ ${toNarrative}`,
      });

      frontier.push({ id: otherId, depth: current.depth + 1 });
    }
  }

  const trace = steps.map(formatStep).join("\n");

  return {
    subjectId: startId,
    subjectKind: startNode?.kind.id,
    subjectName: startNode?.name,
    steps,
    trace,
  };
};

/**
 * Convenience: explain and write the trace to a string. Equivalent to
 * `explain(graph, subject).trace`.
 */
export const explainTrace = (
  graph: KernelGraph,
  subject: string | { readonly id: string },
  options?: { readonly maxDepth?: number },
): string => explain(graph, subject, options).trace;
