/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel bridge helpers — in-place attachment for dual-write paths.
 *
 * The kernel's `register*` helpers in `graph.ts` are functional (copy-on-
 * write), which is appropriate for pass pipelines that snapshot the graph.
 * During the rebase bridge phase, builders need to dual-write into the
 * existing `ctx.graph` after every `gen.entity(...)` / `gen.relation(...)`
 * call without copying the whole node/edge map each time.
 *
 * These `attach*` helpers mutate the underlying `Map`s in place. They cast
 * away the `ReadonlyMap` view because the actual containers from
 * `createKernelGraph()` are `Map`s — the read-only typing exists to
 * discourage casual mutation, not to enforce it.
 *
 * **Deprecated for new use.** PLAN.md §7 quick win #3 fences these to a
 * small allow-list (enforced by `tests/architecture/bridge-mutations.test.ts`).
 * New code must use the immutable `register*` API in `kernel/graph.ts`,
 * or — once it lands in Track A — the scoped `kernel.graph.build((w) => …)`
 * writer.
 *
 * Once Track E (pass pipelines) and Track F (target legalization) land
 * and the kernel graph is built once per pipeline run rather than
 * dual-written, these helpers will be removed.
 *
 * See `docs/revised-kernel.md` and `docs/revised2/PLAN.md`.
 */

import type { KernelEdge } from "./edge.ts";
import type { KernelExpr } from "./expr.ts";
import { indexEdge, indexNode, unindexEdge, unindexNode } from "./graph.ts";
import type { KernelGraph } from "./graph.ts";
import type { KernelNode } from "./node.ts";
import type { AnyGraphStep } from "./step.ts";

const asMutable = <K, V>(map: ReadonlyMap<K, V>): Map<K, V> => map as Map<K, V>;

/**
 * Attach a node to the graph in place.
 *
 * @deprecated Bridge-only. New code must use `registerNode` from
 *   `kernel/graph.ts`. See PLAN.md §7 quick win #3.
 */
export const attachNode = (graph: KernelGraph, node: KernelNode): void => {
  const nodes = asMutable(graph.nodes);
  const previous = nodes.get(node.id);
  if (previous) unindexNode(graph.index, previous);
  nodes.set(node.id, node);
  indexNode(graph.index, node);
};

/**
 * Attach an edge to the graph in place.
 *
 * @deprecated Bridge-only. New code must use `registerEdge` from
 *   `kernel/graph.ts`. See PLAN.md §7 quick win #3.
 */
export const attachEdge = (graph: KernelGraph, edge: KernelEdge): void => {
  const edges = asMutable(graph.edges);
  const previous = edges.get(edge.id);
  if (previous) unindexEdge(graph.index, previous);
  edges.set(edge.id, edge);
  indexEdge(graph.index, edge);
};

/**
 * Attach an expression to the graph in place.
 *
 * @deprecated Bridge-only. New code must use `registerExpr` from
 *   `kernel/graph.ts`. See PLAN.md §7 quick win #3.
 */
export const attachExpr = (graph: KernelGraph, expr: KernelExpr): void => {
  asMutable(graph.exprs).set(expr.id, expr);
};

/**
 * Apply an immutable graph step back into the mutable bridge graph.
 *
 * @deprecated Bridge-only. New code must use `kernel.graph.pipe(step)`
 *   for the immutable result.
 */
export const attachGraphStep = (graph: KernelGraph, step: AnyGraphStep): void => {
  const next = step.apply(graph);
  Object.assign(graph, next);
};

/**
 * Attach many nodes to the graph in place.
 *
 * @deprecated Bridge-only. New code must use successive `registerNode`
 *   calls or the (forthcoming) `kernel.graph.build((w) => …)` writer.
 */
export const attachNodes = (graph: KernelGraph, nodes: readonly KernelNode[]): void => {
  const m = asMutable(graph.nodes);
  for (const node of nodes) {
    const previous = m.get(node.id);
    if (previous) unindexNode(graph.index, previous);
    m.set(node.id, node);
    indexNode(graph.index, node);
  }
};

/**
 * Attach many edges to the graph in place.
 *
 * @deprecated Bridge-only. New code must use successive `registerEdge`
 *   calls or the (forthcoming) `kernel.graph.build((w) => …)` writer.
 */
export const attachEdges = (graph: KernelGraph, edges: readonly KernelEdge[]): void => {
  const m = asMutable(graph.edges);
  for (const edge of edges) {
    const previous = m.get(edge.id);
    if (previous) unindexEdge(graph.index, previous);
    m.set(edge.id, edge);
    indexEdge(graph.index, edge);
  }
};
