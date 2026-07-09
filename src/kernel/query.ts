/* @__NO_SIDE_EFFECTS__ */
/**
 * Typed graph inspection facade.
 *
 * Runtime graph storage stays simple. This facade binds a graph value once and
 * lets query methods infer from typed node/edge-kind witnesses.
 */

import type { KernelObjectRef } from "./id.ts";
import type { AnyEdgeKindDef, EdgeFromKind, EndpointOutputsFor } from "./edge.ts";
import { readEdgeEndpoints } from "./edge.ts";
import type { KernelGraph } from "./graph.ts";
import { edgesOfKindAtEndpoint, edgesOfKindDef, nodesOfKindDef, nodesWithTrait } from "./graph.ts";
import type { NodeKindFromDef, NodeMetadataFor, KernelNode } from "./node.ts";
import type { NodeKindDef } from "./ods.ts";
import type { TraitDef } from "./trait.ts";

type GraphRefInput = KernelObjectRef | { readonly id: string } | string;

const refIdOf = (ref: GraphRefInput): string | undefined => {
  if (typeof ref === "string") return ref;
  if ("id" in ref && typeof ref.id === "string" && ref.id.length > 0) return ref.id;
  if ("name" in ref && typeof ref.name === "string" && ref.name.length > 0) return ref.name;
  return undefined;
};

const endpointRoleId = <
  const Kind extends AnyEdgeKindDef,
  const Role extends keyof EndpointOutputsFor<Kind> & string,
>(
  kind: Kind,
  role: Role,
): string | undefined => kind.endpoints.find((endpoint) => endpoint.name === role)?.id;

type EndpointTargetOf<
  Kind extends AnyEdgeKindDef,
  Role extends keyof EndpointOutputsFor<Kind> & string,
> = EndpointOutputsFor<Kind>[Role] extends { readonly target: infer Target } ? Target : never;

export interface NodeQuery<Node extends KernelNode> {
  withTrait(trait: TraitDef): NodeQuery<Node>;
  where(predicate: (node: Node) => boolean): NodeQuery<Node>;
  map<Result>(mapper: (node: Node) => Result): readonly Result[];
  toArray(): readonly Node[];
}

export interface EdgeQuery<
  Kind extends AnyEdgeKindDef,
  Edge extends EdgeFromKind<Kind> = EdgeFromKind<Kind>,
> {
  whereEndpoint<const Role extends keyof EndpointOutputsFor<Kind> & string>(
    role: Role,
    ref: GraphRefInput,
  ): EdgeQuery<Kind, Edge>;
  targets<const Role extends keyof EndpointOutputsFor<Kind> & string>(
    role: Role,
  ): readonly EndpointTargetOf<Kind, Role>[];
  endpoints(): readonly EndpointOutputsFor<Kind>[];
  where(predicate: (edge: Edge) => boolean): EdgeQuery<Kind, Edge>;
  map<Result>(mapper: (edge: Edge) => Result): readonly Result[];
  toArray(): readonly Edge[];
}

export interface GraphInspector {
  readonly nodes: {
    ofKind<const Kind extends NodeKindDef>(
      kind: Kind,
    ): NodeQuery<KernelNode<NodeKindFromDef<Kind>, unknown, unknown, NodeMetadataFor<Kind>>>;
  };
  readonly edges: {
    ofKind<const Kind extends AnyEdgeKindDef>(kind: Kind): EdgeQuery<Kind>;
  };
}

const createNodeQuery = <Node extends KernelNode>(
  graph: KernelGraph,
  nodes: readonly Node[],
): NodeQuery<Node> => ({
  withTrait(trait) {
    const traitNodes = new Set(nodesWithTrait(graph, trait).map((node) => node.id));
    return createNodeQuery(
      graph,
      nodes.filter((node) => traitNodes.has(node.id)),
    );
  },

  where(predicate) {
    return createNodeQuery(graph, nodes.filter(predicate));
  },

  map(mapper) {
    return nodes.map(mapper);
  },

  toArray() {
    return nodes;
  },
});

const createEdgeQuery = <const Kind extends AnyEdgeKindDef>(
  graph: KernelGraph,
  kind: Kind,
  edges: readonly EdgeFromKind<Kind>[],
): EdgeQuery<Kind> => ({
  whereEndpoint(role, ref) {
    const roleId = endpointRoleId(kind, role);
    const refId = refIdOf(ref);
    if (!roleId || !refId) return createEdgeQuery(graph, kind, []);
    const matches = new Set(
      edgesOfKindAtEndpoint(graph, { id: kind.id, label: kind.id }, roleId, refId).map(
        (edge) => edge.id,
      ),
    );
    return createEdgeQuery(
      graph,
      kind,
      edges.filter((edge) => matches.has(edge.id)),
    );
  },

  targets(role) {
    return edges
      .map((edge) => readEdgeEndpoints(kind, edge)[role])
      .filter((endpoint): endpoint is EndpointOutputsFor<Kind>[typeof role] => endpoint != null)
      .map(
        (endpoint) => (endpoint as { readonly target: EndpointTargetOf<Kind, typeof role> }).target,
      );
  },

  endpoints() {
    return edges.map((edge) => readEdgeEndpoints(kind, edge));
  },

  where(predicate) {
    return createEdgeQuery(graph, kind, edges.filter(predicate));
  },

  map(mapper) {
    return edges.map(mapper);
  },

  toArray() {
    return edges;
  },
});

/** Bind a runtime graph to a typed inspection facade. */
export const inspectGraph = (graph: KernelGraph): GraphInspector => ({
  nodes: {
    ofKind(kind) {
      return createNodeQuery(graph, nodesOfKindDef(graph, kind));
    },
  },

  edges: {
    ofKind(kind) {
      return createEdgeQuery(
        graph,
        kind,
        edgesOfKindDef(graph, kind) as readonly EdgeFromKind<typeof kind>[],
      );
    },
  },
});

/** @deprecated Use inspectGraph for compiler graph traversal. */
export const queryGraph = inspectGraph;
