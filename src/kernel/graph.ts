/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel graph - registry of all kernel objects.
 *
 * The central registry for kernel objects. Models the revised core Graph primitive.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { KernelTrait } from "./trait.ts";
import type { KernelType } from "./type.ts";
import type { KernelExpr } from "./expr.ts";
import type { KernelTransform } from "./transform.ts";
import type { KernelNode } from "./node.ts";
import type { KernelEdge } from "./edge.ts";

/** Kernel graph - the registry of all kernel objects. */
export interface KernelGraph {
  readonly id: KernelId<"graph">;
  readonly metadata?: KernelMetadata;

  readonly types: ReadonlyMap<string, KernelType>;
  readonly transforms: ReadonlyMap<string, KernelTransform>;
  readonly exprs: ReadonlyMap<string, KernelExpr>;
  readonly traits: ReadonlyMap<string, KernelTrait>;
  readonly nodes: ReadonlyMap<string, KernelNode>;
  readonly edges: ReadonlyMap<string, KernelEdge>;
}

/** Create a new kernel graph. */
export const createKernelGraph = (metadata?: KernelMetadata): KernelGraph => ({
  id: "graph:default" as KernelId<"graph">,
  metadata,
  types: new Map(),
  transforms: new Map(),
  exprs: new Map(),
  traits: new Map(),
  nodes: new Map(),
  edges: new Map(),
});

/** Register a type in the graph. */
export const registerType = <T>(graph: KernelGraph, type: KernelType<T>): KernelGraph => ({
  ...graph,
  types: new Map(graph.types).set(type.id, type),
});

/** Register a transform in the graph. */
export const registerTransform = <From, To>(
  graph: KernelGraph,
  transform: KernelTransform<From, To>,
): KernelGraph => ({
  ...graph,
  transforms: new Map(graph.transforms).set(transform.id, transform),
});

/** Register an expression in the graph. */
export const registerExpr = <T>(
  graph: KernelGraph,
  expr: KernelExpr<T>,
): KernelGraph => ({
  ...graph,
  exprs: new Map(graph.exprs).set(expr.id, expr),
});

/** Register a trait in the graph. */
export const registerTrait = (
  graph: KernelGraph,
  trait: KernelTrait,
): KernelGraph => ({
  ...graph,
  traits: new Map(graph.traits).set(trait.id, trait),
});

/** Register a node in the graph. */
export const registerNode = <In, Out>(
  graph: KernelGraph,
  node: KernelNode<In, Out>,
): KernelGraph => ({
  ...graph,
  nodes: new Map(graph.nodes).set(node.id, node),
});

/** Register an edge in the graph. */
export const registerEdge = (
  graph: KernelGraph,
  edge: KernelEdge,
): KernelGraph => ({
  ...graph,
  edges: new Map(graph.edges).set(edge.id, edge),
});

/** Query: get all nodes with a specific trait. */
export const nodesWithTrait = (
  graph: KernelGraph,
  trait: string,
): readonly KernelNode[] =>
  Array.from(graph.nodes.values()).filter((node) =>
    node.traits.some((t) => t === trait)
  );

/** Query: get all edges of a specific kind. */
export const edgesOfKind = (
  graph: KernelGraph,
  kind: string,
): readonly KernelEdge[] =>
  Array.from(graph.edges.values()).filter((edge) => edge.kind === kind);

/** Query: get edges from a specific node. */
export const edgesFrom = (
  graph: KernelGraph,
  nodeId: string,
): readonly KernelEdge[] =>
  Array.from(graph.edges.values()).filter((edge) =>
    edge.endpoints.some((e) =>
      typeof e.target === "object" && "id" in e.target && e.target.id === nodeId
    )
  );

/** Query: get edges to a specific node. */
export const edgesTo = (
  graph: KernelGraph,
  targetId: string,
): readonly KernelEdge[] =>
  Array.from(graph.edges.values()).filter((edge) =>
    edge.endpoints.some((e) =>
      typeof e.target === "object" && "id" in e.target && e.target.id === targetId
    )
  );

/** Query: get all edges connecting two nodes. */
export const edgesBetween = (
  graph: KernelGraph,
  fromId: string,
  toId: string,
): readonly KernelEdge[] =>
  Array.from(graph.edges.values()).filter((edge) => {
    const from = edge.endpoints.find((e) => e.role === "from" || e.role === "source" || e.role === "owner" || e.role === "writer" || e.role === "reader");
    const to = edge.endpoints.find((e) => e.role === "to" || e.role === "target" || e.role === "owned" || e.role === "field");
    return (
      (from?.target && typeof from.target === "object" && "id" in from.target && from.target.id === fromId) &&
      (to?.target && typeof to.target === "object" && "id" in to.target && to.target.id === toId)
    );
  });

/** Query: get neighborhood of a node (edges within N hops). */
export const neighborhood = (
  graph: KernelGraph,
  nodeId: string,
  options?: { depth?: number; kinds?: readonly string[] },
): { nodes: readonly KernelNode[]; edges: readonly KernelEdge[] } => {
  const depth = options?.depth ?? 2;
  const visited = new Set<string>();
  const resultNodes: KernelNode[] = [];
  const resultEdges: KernelEdge[] = [];

  const traverse = (currentId: string, currentDepth: number) => {
    if (currentDepth > depth || visited.has(currentId)) return;
    visited.add(currentId);

    const outgoing = edgesFrom(graph, currentId);
    const incoming = edgesTo(graph, currentId);

    for (const e of outgoing) {
      if (!options?.kinds || options.kinds.includes(e.kind)) {
        resultEdges.push(e);
        const target = e.endpoints.find((ep) => ep.role !== "owner" && ep.role !== "source" && ep.role !== "from" && ep.role !== "writer" && ep.role !== "reader");
        if (target?.target && typeof target.target === "object" && "id" in target.target) {
          const targetId = target.target.id;
          if (targetId) {
            const node = graph.nodes.get(targetId);
            if (node && !visited.has(targetId)) {
              resultNodes.push(node);
            }
          }
        }
      }
    }

    for (const e of incoming) {
      if (!options?.kinds || options.kinds.includes(e.kind)) {
        resultEdges.push(e);
        const source = e.endpoints.find((ep) => ep.role === "owner" || ep.role === "source" || ep.role === "from" || ep.role === "writer" || ep.role === "reader");
        if (source?.target && typeof source.target === "object" && "id" in source.target) {
          const targetId = source.target.id;
          if (targetId) {
            const node = graph.nodes.get(targetId);
            if (node && !visited.has(targetId)) {
              resultNodes.push(node);
            }
          }
        }
      }
    }

    if (currentDepth < depth) {
      for (const n of resultNodes) {
        traverse(n.id, currentDepth + 1);
      }
    }
  };

  traverse(nodeId, 0);
  return { nodes: resultNodes, edges: resultEdges };
};

/** Export graph to JSON for debugging/visualization. */
export const graphToJson = (graph: KernelGraph): object => ({
  id: graph.id,
  metadata: graph.metadata,
  nodeCount: graph.nodes.size,
  edgeCount: graph.edges.size,
  typeCount: graph.types.size,
  nodes: Array.from(graph.nodes.values()).map((n) => ({
    id: n.id,
    kind: n.kind,
    name: n.name,
    traits: n.traits,
  })),
  edges: Array.from(graph.edges.values()).map((e) => ({
    id: e.id,
    kind: e.kind,
    endpoints: e.endpoints.map((ep) => ({ role: ep.role, target: ep.target })),
  })),
});