/* @__NO_SIDE_EFFECTS__ */
/**
 * Type-state graph builder.
 *
 * This is a typed authoring facade over the simple runtime KernelGraph. The
 * graph remains broad and serializable; the builder carries precise node and
 * edge witnesses through chained calls for local TypeScript inference.
 */

import type { KernelMetadata } from "./metadata.ts";
import type { KernelEdge } from "./edge.ts";
import type { KernelExpr } from "./expr.ts";
import type { KernelGraph } from "./graph.ts";
import { createKernelGraph, registerEdge, registerNode } from "./graph.ts";
import type { KernelNode } from "./node.ts";
import { attachEdge, attachEdges, attachExpr, attachNode, attachNodes } from "./bridge.ts";

export interface GraphBuilderState {
  readonly nodes: readonly KernelNode[];
  readonly edges: readonly KernelEdge[];
}

export type EmptyGraphBuilderState = {
  readonly nodes: readonly [];
  readonly edges: readonly [];
};

export type AddGraphBuilderNode<State extends GraphBuilderState, Node extends KernelNode> = {
  readonly nodes: readonly [...State["nodes"], Node];
  readonly edges: State["edges"];
};

export type AddGraphBuilderEdge<State extends GraphBuilderState, Edge extends KernelEdge> = {
  readonly nodes: State["nodes"];
  readonly edges: readonly [...State["edges"], Edge];
};

export interface GraphBuilder<State extends GraphBuilderState = EmptyGraphBuilderState> {
  readonly _state?: State;

  node<const Node extends KernelNode>(node: Node): GraphBuilder<AddGraphBuilderNode<State, Node>>;

  edge<const Edge extends KernelEdge>(edge: Edge): GraphBuilder<AddGraphBuilderEdge<State, Edge>>;

  done(): KernelGraph;
}

export type GraphBuilderStateOf<Builder> =
  Builder extends GraphBuilder<infer State> ? State : never;

export interface GraphWriter {
  node<const Node extends KernelNode>(node: Node): Node;
  nodes<const Nodes extends readonly KernelNode[]>(nodes: Nodes): Nodes;
  edge<const Edge extends KernelEdge>(edge: Edge): Edge;
  edges<const Edges extends readonly KernelEdge[]>(edges: Edges): Edges;
  expr<const Expr extends KernelExpr>(expr: Expr): Expr;
}

const graphBuilderFrom = <State extends GraphBuilderState>(
  graph: KernelGraph,
): GraphBuilder<State> => ({
  node<const Node extends KernelNode>(node: Node): GraphBuilder<AddGraphBuilderNode<State, Node>> {
    return graphBuilderFrom<AddGraphBuilderNode<State, Node>>(registerNode(graph, node));
  },

  edge<const Edge extends KernelEdge>(edge: Edge): GraphBuilder<AddGraphBuilderEdge<State, Edge>> {
    return graphBuilderFrom<AddGraphBuilderEdge<State, Edge>>(registerEdge(graph, edge));
  },

  done(): KernelGraph {
    return graph;
  },
});

/** Create a type-state builder over a fresh runtime graph. */
export const createGraphBuilder = (metadata?: KernelMetadata): GraphBuilder =>
  graphBuilderFrom<EmptyGraphBuilderState>(createKernelGraph(metadata));

const createGraphWriter = (graph: KernelGraph): GraphWriter => ({
  node(node) {
    attachNode(graph, node);
    return node;
  },

  nodes(nodes) {
    attachNodes(graph, nodes);
    return nodes;
  },

  edge(edge) {
    attachEdge(graph, edge);
    return edge;
  },

  edges(edges) {
    attachEdges(graph, edges);
    return edges;
  },

  expr(expr) {
    attachExpr(graph, expr);
    return expr;
  },
});

/** Build a graph with scoped internal mutation and indexed writes. */
export const buildGraph = (
  build: (writer: GraphWriter) => void,
  input?: {
    readonly metadata?: KernelMetadata;
    readonly graph?: KernelGraph;
  },
): KernelGraph => {
  const graph = input?.graph ?? createKernelGraph(input?.metadata);
  build(createGraphWriter(graph));
  return graph;
};
