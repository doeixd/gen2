/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel graph - registry of all kernel objects using typed symbol definitions.
 *
 * The central registry for kernel objects. Models the revised core Graph primitive
 * with no-magic-string philosophy.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { TraitDef } from "./trait.ts";
import type { KernelType } from "./type.ts";
import type { KernelExpr } from "./expr.ts";
import type { KernelTransform } from "./transform.ts";
import type { KernelNode, NodeKind, NodeKindFromDef, NodeMetadataFor } from "./node.ts";
import type {
  KernelEdge,
  EdgeKind,
  EdgeKindFromDef,
  EdgeMetadataFor,
  KernelEdgeEndpoint,
  AnyEdgeKindDef,
} from "./edge.ts";
import type { NodeKindDef } from "./ods.ts";

/** Indexes maintained alongside graph storage for hot traversal paths. */
export interface GraphIndex {
  readonly nodesByKind: ReadonlyMap<string, ReadonlySet<string>>;
  readonly nodesByTrait: ReadonlyMap<string, ReadonlySet<string>>;
  readonly edgesByKind: ReadonlyMap<string, ReadonlySet<string>>;
  readonly incidentEdgesByRef: ReadonlyMap<string, ReadonlySet<string>>;
  readonly edgesByKindAndEndpoint: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Kernel graph - the registry of all kernel objects. */
export interface KernelGraph {
  readonly id: KernelId<"graph">;
  readonly metadata?: KernelMetadata;

  readonly types: ReadonlyMap<string, KernelType>;
  readonly transforms: ReadonlyMap<string, KernelTransform>;
  readonly exprs: ReadonlyMap<string, KernelExpr>;
  readonly traits: ReadonlyMap<string, TraitDef>;
  readonly nodes: ReadonlyMap<string, KernelNode>;
  readonly edges: ReadonlyMap<string, KernelEdge>;
  readonly index: GraphIndex;
}

/** Create an empty graph index. */
export const createGraphIndex = (): GraphIndex => ({
  nodesByKind: new Map(),
  nodesByTrait: new Map(),
  edgesByKind: new Map(),
  incidentEdgesByRef: new Map(),
  edgesByKindAndEndpoint: new Map(),
});

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
  index: createGraphIndex(),
});

const copyIndexMap = (map: ReadonlyMap<string, ReadonlySet<string>>): Map<string, Set<string>> => {
  const next = new Map<string, Set<string>>();
  for (const [key, values] of map) next.set(key, new Set(values));
  return next;
};

const cloneGraphIndex = (index: GraphIndex): GraphIndex => ({
  nodesByKind: copyIndexMap(index.nodesByKind),
  nodesByTrait: copyIndexMap(index.nodesByTrait),
  edgesByKind: copyIndexMap(index.edgesByKind),
  incidentEdgesByRef: copyIndexMap(index.incidentEdgesByRef),
  edgesByKindAndEndpoint: copyIndexMap(index.edgesByKindAndEndpoint),
});

const mutableSetFor = (map: ReadonlyMap<string, ReadonlySet<string>>, key: string): Set<string> => {
  const mutable = map as Map<string, Set<string>>;
  const existing = mutable.get(key);
  if (existing) return existing;
  const created = new Set<string>();
  mutable.set(key, created);
  return created;
};

const deleteFromIndexSet = (
  map: ReadonlyMap<string, ReadonlySet<string>>,
  key: string,
  value: string,
): void => {
  const mutable = map as Map<string, Set<string>>;
  const values = mutable.get(key);
  if (!values) return;
  values.delete(value);
  if (values.size === 0) mutable.delete(key);
};

const targetRefId = (target: KernelEdgeEndpoint["target"]): string | undefined => {
  if (typeof target !== "object" || target === null) return undefined;
  if ("id" in target && typeof target.id === "string" && target.id.length > 0) return target.id;
  if ("name" in target && typeof target.name === "string" && target.name.length > 0) {
    return target.name;
  }
  return undefined;
};

const endpointIndexKey = (kindId: string, roleId: string, refId: string): string =>
  `${kindId}\u0000${roleId}\u0000${refId}`;

/** Add a node to an existing graph index. */
export const indexNode = (index: GraphIndex, node: KernelNode): void => {
  mutableSetFor(index.nodesByKind, node.kind.id).add(node.id);
  for (const trait of node.traits) mutableSetFor(index.nodesByTrait, trait.id).add(node.id);
};

/** Remove a node from an existing graph index. */
export const unindexNode = (index: GraphIndex, node: KernelNode): void => {
  deleteFromIndexSet(index.nodesByKind, node.kind.id, node.id);
  for (const trait of node.traits) deleteFromIndexSet(index.nodesByTrait, trait.id, node.id);
};

/** Add an edge to an existing graph index. */
export const indexEdge = (index: GraphIndex, edge: KernelEdge): void => {
  mutableSetFor(index.edgesByKind, edge.kind.id).add(edge.id);
  for (const endpoint of edge.endpoints) {
    const refId = targetRefId(endpoint.target);
    if (!refId) continue;
    mutableSetFor(index.incidentEdgesByRef, refId).add(edge.id);
    mutableSetFor(
      index.edgesByKindAndEndpoint,
      endpointIndexKey(edge.kind.id, endpoint.role.id, refId),
    ).add(edge.id);
  }
};

/** Remove an edge from an existing graph index. */
export const unindexEdge = (index: GraphIndex, edge: KernelEdge): void => {
  deleteFromIndexSet(index.edgesByKind, edge.kind.id, edge.id);
  for (const endpoint of edge.endpoints) {
    const refId = targetRefId(endpoint.target);
    if (!refId) continue;
    deleteFromIndexSet(index.incidentEdgesByRef, refId, edge.id);
    deleteFromIndexSet(
      index.edgesByKindAndEndpoint,
      endpointIndexKey(edge.kind.id, endpoint.role.id, refId),
      edge.id,
    );
  }
};

const idsFromIndex = (
  map: ReadonlyMap<string, ReadonlySet<string>>,
  key: string,
): readonly string[] => Array.from(map.get(key) ?? []);

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
export const registerExpr = <T>(graph: KernelGraph, expr: KernelExpr<T>): KernelGraph => ({
  ...graph,
  exprs: new Map(graph.exprs).set(expr.id, expr),
});

/** Register a trait in the graph. */
export const registerTrait = (graph: KernelGraph, trait: TraitDef): KernelGraph => ({
  ...graph,
  traits: new Map(graph.traits).set(trait.id, trait),
});

/** Register a node in the graph. */
export const registerNode = <Kind extends NodeKind, In, Out>(
  graph: KernelGraph,
  node: KernelNode<Kind, In, Out>,
): KernelGraph => {
  const nodes = new Map(graph.nodes).set(node.id, node);
  const index = cloneGraphIndex(graph.index);
  const previous = graph.nodes.get(node.id);
  if (previous) unindexNode(index, previous);
  indexNode(index, node);
  return { ...graph, nodes, index };
};

/** Register an edge in the graph. */
export const registerEdge = <Kind extends EdgeKind>(
  graph: KernelGraph,
  edge: KernelEdge<Kind>,
): KernelGraph => {
  const edges = new Map(graph.edges).set(edge.id, edge);
  const index = cloneGraphIndex(graph.index);
  const previous = graph.edges.get(edge.id);
  if (previous) unindexEdge(index, previous);
  indexEdge(index, edge);
  return { ...graph, edges, index };
};

/** Query: get all nodes of a specific kind (symbol-first). */
export const nodesOfKind = <Kind extends NodeKind>(
  graph: KernelGraph,
  kind: Kind,
): readonly KernelNode<Kind>[] =>
  idsFromIndex(graph.index.nodesByKind, kind.id)
    .map((id) => graph.nodes.get(id))
    .filter((node): node is KernelNode<Kind> => node?.kind.id === kind.id);

/** Query: get all nodes of a specific ODS node-kind witness. */
export const nodesOfKindDef = <const Kind extends NodeKindDef>(
  graph: KernelGraph,
  kind: Kind,
): readonly KernelNode<NodeKindFromDef<Kind>, unknown, unknown, NodeMetadataFor<Kind>>[] =>
  idsFromIndex(graph.index.nodesByKind, kind.id)
    .map((id) => graph.nodes.get(id))
    .filter(
      (node): node is KernelNode<NodeKindFromDef<Kind>, unknown, unknown, NodeMetadataFor<Kind>> =>
        node?.kind.id === kind.id,
    );

/** Query: get all nodes with a specific trait. */
export const nodesWithTrait = (graph: KernelGraph, trait: TraitDef): readonly KernelNode[] =>
  idsFromIndex(graph.index.nodesByTrait, trait.id)
    .map((id) => graph.nodes.get(id))
    .filter((node): node is KernelNode => node !== undefined);

/** Query: get all edges of a specific kind (typed). */
export const edgesOfKind = <Kind extends EdgeKind>(
  graph: KernelGraph,
  kind: Kind,
): readonly KernelEdge[] =>
  idsFromIndex(graph.index.edgesByKind, kind.id)
    .map((id) => graph.edges.get(id))
    .filter((edge): edge is KernelEdge => edge?.kind.id === kind.id);

/** Query: get all edges of a specific ODS edge-kind witness. */
export const edgesOfKindDef = <const Kind extends AnyEdgeKindDef>(
  graph: KernelGraph,
  kind: Kind,
): readonly KernelEdge<
  EdgeKindFromDef<Kind>,
  readonly KernelEdgeEndpoint[],
  EdgeMetadataFor<Kind>
>[] =>
  idsFromIndex(graph.index.edgesByKind, kind.id)
    .map((id) => graph.edges.get(id))
    .filter(
      (
        edge,
      ): edge is KernelEdge<
        EdgeKindFromDef<Kind>,
        readonly KernelEdgeEndpoint[],
        EdgeMetadataFor<Kind>
      > => edge?.kind.id === kind.id,
    );

/** Query: get edges from a specific node. */
export const edgesFrom = (graph: KernelGraph, nodeId: string): readonly KernelEdge[] =>
  idsFromIndex(graph.index.incidentEdgesByRef, nodeId)
    .map((id) => graph.edges.get(id))
    .filter((edge): edge is KernelEdge => edge !== undefined);

/** Query: get edges to a specific node. */
export const edgesTo = (graph: KernelGraph, targetId: string): readonly KernelEdge[] =>
  idsFromIndex(graph.index.incidentEdgesByRef, targetId)
    .map((id) => graph.edges.get(id))
    .filter((edge): edge is KernelEdge => edge !== undefined);

/** Query: get edges of a kind touching a specific endpoint role/ref pair. */
export const edgesOfKindAtEndpoint = <Kind extends EdgeKind>(
  graph: KernelGraph,
  kind: Kind,
  roleId: string,
  refId: string,
): readonly KernelEdge<Kind>[] =>
  idsFromIndex(graph.index.edgesByKindAndEndpoint, endpointIndexKey(kind.id, roleId, refId))
    .map((id) => graph.edges.get(id))
    .filter((edge): edge is KernelEdge<Kind> => edge?.kind.id === kind.id);

/** Query: get all edges connecting two nodes. */
export const edgesBetween = (
  graph: KernelGraph,
  fromId: string,
  toId: string,
): readonly KernelEdge[] =>
  Array.from(graph.edges.values()).filter((edge) => {
    const from = edge.endpoints.find(
      (ep) =>
        ep.role.id.startsWith("edge.role.owner") ||
        ep.role.id.startsWith("edge.role.source") ||
        ep.role.id.startsWith("edge.role.from") ||
        ep.role.id.startsWith("edge.role.writer") ||
        ep.role.id.startsWith("edge.role.reader"),
    );
    const to = edge.endpoints.find(
      (ep) =>
        ep.role.id.startsWith("edge.role.to") ||
        ep.role.id.startsWith("edge.role.target") ||
        ep.role.id.startsWith("edge.role.owned") ||
        ep.role.id.startsWith("edge.role.field"),
    );
    return (
      from?.target &&
      typeof from.target === "object" &&
      "id" in from.target &&
      from.target.id === fromId &&
      to?.target &&
      typeof to.target === "object" &&
      "id" in to.target &&
      to.target.id === toId
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
      if (!options?.kinds || options.kinds.includes(e.kind.id)) {
        resultEdges.push(e);
        const target = e.endpoints.find(
          (ep) =>
            !ep.role.id.startsWith("edge.role.owner") &&
            !ep.role.id.startsWith("edge.role.source") &&
            !ep.role.id.startsWith("edge.role.from") &&
            !ep.role.id.startsWith("edge.role.writer") &&
            !ep.role.id.startsWith("edge.role.reader"),
        );
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
      if (!options?.kinds || options.kinds.includes(e.kind.id)) {
        resultEdges.push(e);
        const source = e.endpoints.find(
          (ep) =>
            ep.role.id.startsWith("edge.role.owner") ||
            ep.role.id.startsWith("edge.role.source") ||
            ep.role.id.startsWith("edge.role.from") ||
            ep.role.id.startsWith("edge.role.writer") ||
            ep.role.id.startsWith("edge.role.reader"),
        );
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
    kind: n.kind.id,
    name: n.name,
    traits: n.traits.map((t) => t.id),
  })),
  edges: Array.from(graph.edges.values()).map((e) => ({
    id: e.id,
    kind: e.kind.id,
    endpoints: e.endpoints.map((ep) => ({ role: ep.role.id, target: ep.target })),
  })),
});
