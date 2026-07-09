import { expect, test } from "vite-plus/test";
import {
  attachEdge,
  attachNode,
  buildGraph,
  createKernelGraph,
  createGraphBuilder,
  defineEdge,
  defineEdgeFromKind,
  defineEdgeKind,
  defineNode,
  defineNodeFromKind,
  defineNodeKind,
  defineEndpointRole,
  edgesOfKind,
  edgesOfKindAtEndpoint,
  edgesFrom,
  graphEdge,
  graphFragment,
  graphNode,
  graph,
  kernelRef,
  nodesOfKind,
  nodesWithTrait,
  nodeRef,
  PassRegistry,
  inspectGraph,
  pipeGraph,
  registerEdge,
  registerNode,
  traits,
} from "../src/kernel/index.ts";
import type { EdgeKind, EndpointRole, NodeKind } from "../src/kernel/index.ts";

const SourceKind = { id: "node.kind.test.source", label: "Source" } satisfies NodeKind;
const TargetKind = { id: "node.kind.test.target", label: "Target" } satisfies NodeKind;
const OtherKind = { id: "node.kind.test.other", label: "Other" } satisfies NodeKind;

const LinksKind = { id: "edge.kind.test.links", label: "Links" } satisfies EdgeKind;
const OtherEdgeKind = { id: "edge.kind.test.other", label: "Other edge" } satisfies EdgeKind;

const SourceRole = { id: "edge.role.source", label: "Source" } satisfies EndpointRole;
const TargetRole = { id: "edge.role.target", label: "Target" } satisfies EndpointRole;

const sourceRef = kernelRef("node", "node:test:source");
const targetRef = kernelRef("node", "node:test:target");
const QuerySourceNodeKind = defineNodeKind({ id: "node.kind.test.querySource" });
const QueryTargetNodeKind = defineNodeKind({ id: "node.kind.test.queryTarget" });
const QueryLinksEdgeKind = defineEdgeKind({
  id: "edge.kind.test.queryLinks",
  endpoints: {
    source: defineEndpointRole("source", { targetKinds: [QuerySourceNodeKind] }),
    target: defineEndpointRole("target", { targetKinds: [QueryTargetNodeKind] }),
  },
});

test("functional graph registration maintains node and edge indexes", () => {
  const source = defineNode(SourceKind, sourceRef.id, {
    traits: [traits.NODE.STATIC],
  });
  const target = defineNode(TargetKind, targetRef.id);
  const edge = defineEdge(LinksKind, "edge:test:links", [
    { role: SourceRole, target: sourceRef },
    { role: TargetRole, target: targetRef },
  ]);

  const graph = registerEdge(registerNode(registerNode(createKernelGraph(), source), target), edge);

  expect(nodesOfKind(graph, SourceKind)).toEqual([source]);
  expect(nodesWithTrait(graph, traits.NODE.STATIC)).toEqual([source]);
  expect(edgesOfKind(graph, LinksKind)).toEqual([edge]);
  expect(edgesFrom(graph, sourceRef.id)).toEqual([edge]);
  expect(edgesOfKindAtEndpoint(graph, LinksKind, TargetRole.id, targetRef.id)).toEqual([edge]);
});

test("graph builder produces an indexed runtime graph", () => {
  const source = defineNode(SourceKind, sourceRef.id);
  const target = defineNode(TargetKind, targetRef.id);
  const edge = defineEdge(LinksKind, "edge:test:builder", [
    { role: SourceRole, target: sourceRef },
    { role: TargetRole, target: targetRef },
  ]);

  const graph = createGraphBuilder().node(source).node(target).edge(edge).done();

  expect(nodesOfKind(graph, SourceKind)).toEqual([source]);
  expect(edgesOfKindAtEndpoint(graph, LinksKind, SourceRole.id, sourceRef.id)).toEqual([edge]);
});

test("graph writer build scope produces an indexed runtime graph", () => {
  const source = defineNode(SourceKind, sourceRef.id);
  const target = defineNode(TargetKind, targetRef.id);
  const edge = defineEdge(LinksKind, "edge:test:writer", [
    { role: SourceRole, target: sourceRef },
    { role: TargetRole, target: targetRef },
  ]);

  const graph = buildGraph((w) => {
    w.nodes([source, target]);
    w.edge(edge);
  });

  expect(nodesOfKind(graph, SourceKind)).toEqual([source]);
  expect(edgesOfKindAtEndpoint(graph, LinksKind, TargetRole.id, targetRef.id)).toEqual([edge]);
});

test("graph steps compose immutable fragments into an indexed runtime graph", () => {
  const source = defineNode(SourceKind, sourceRef.id);
  const target = defineNode(TargetKind, targetRef.id);
  const edge = defineEdge(LinksKind, "edge:test:step", [
    { role: SourceRole, target: sourceRef },
    { role: TargetRole, target: targetRef },
  ]);

  const runtimeGraph = pipeGraph(
    graphFragment(graphNode(source), graphNode(target)),
    graphEdge(edge),
  );

  expect(nodesOfKind(runtimeGraph, SourceKind)).toEqual([source]);
  expect(edgesOfKindAtEndpoint(runtimeGraph, LinksKind, SourceRole.id, sourceRef.id)).toEqual([
    edge,
  ]);
});

test("kernel graph namespace facade pipes graph steps", () => {
  const source = defineNode(SourceKind, sourceRef.id);
  const target = defineNode(TargetKind, targetRef.id);
  const edge = defineEdge(LinksKind, "edge:test:graph-namespace", [
    { role: SourceRole, target: sourceRef },
    { role: TargetRole, target: targetRef },
  ]);

  const runtimeGraph = graph.pipe(
    graph.fragment(graph.node(source), graph.node(target)),
    graph.edge(edge),
  );

  expect(nodesOfKind(runtimeGraph, TargetKind)).toEqual([target]);
  expect(edgesOfKindAtEndpoint(runtimeGraph, LinksKind, TargetRole.id, targetRef.id)).toEqual([
    edge,
  ]);
});

test("kernel graph namespace facade runs pass steps", () => {
  const registry = new PassRegistry();
  const source = defineNode(SourceKind, sourceRef.id);
  const target = defineNode(TargetKind, targetRef.id);
  registry.register({ name: "derive.test-target", phase: "derive" }, (graphInput) => ({
    success: true,
    modifiedGraph: registerNode(graphInput, target),
  }));

  const runtimeGraph = graph.pipe(
    graph.node(source),
    graph.pass("derive.test-target", { registry }),
  );

  expect(nodesOfKind(runtimeGraph, SourceKind)).toEqual([source]);
  expect(nodesOfKind(runtimeGraph, TargetKind)).toEqual([target]);
});

test("typed graph query facade filters through indexed endpoint lookups", () => {
  const typedSourceRef = nodeRef.unsafe(QuerySourceNodeKind, sourceRef.id);
  const typedTargetRef = nodeRef.unsafe(QueryTargetNodeKind, targetRef.id);
  const source = defineNodeFromKind(QuerySourceNodeKind, sourceRef.id);
  const target = defineNodeFromKind(QueryTargetNodeKind, targetRef.id);
  const edge = defineEdgeFromKind(QueryLinksEdgeKind, "edge:test:query", {
    source: typedSourceRef,
    target: typedTargetRef,
  });
  const other = defineEdgeFromKind(QueryLinksEdgeKind, "edge:test:other-query", {
    source: nodeRef.unsafe(QuerySourceNodeKind, targetRef.id),
    target: nodeRef.unsafe(QueryTargetNodeKind, sourceRef.id),
  });
  const graph = createGraphBuilder().node(source).node(target).edge(edge).edge(other).done();
  const inspector = inspectGraph(graph);

  expect(inspector.nodes.ofKind(QuerySourceNodeKind).toArray()).toEqual([source]);
  expect(
    inspector.edges
      .ofKind(QueryLinksEdgeKind)
      .whereEndpoint("source", typedSourceRef)
      .targets("target"),
  ).toEqual([targetRef]);
});

test("bridge graph attachment keeps indexes in sync when replacing objects", () => {
  const graph = createKernelGraph();
  const originalNode = defineNode(SourceKind, sourceRef.id);
  const replacementNode = defineNode(OtherKind, sourceRef.id);
  const originalEdge = defineEdge(LinksKind, "edge:test:replace", [
    { role: SourceRole, target: sourceRef },
  ]);
  const replacementEdge = defineEdge(OtherEdgeKind, "edge:test:replace", [
    { role: TargetRole, target: targetRef },
  ]);

  attachNode(graph, originalNode);
  attachEdge(graph, originalEdge);
  attachNode(graph, replacementNode);
  attachEdge(graph, replacementEdge);

  expect(nodesOfKind(graph, SourceKind)).toEqual([]);
  expect(nodesOfKind(graph, OtherKind)).toEqual([replacementNode]);
  expect(edgesOfKind(graph, LinksKind)).toEqual([]);
  expect(edgesOfKind(graph, OtherEdgeKind)).toEqual([replacementEdge]);
  expect(edgesFrom(graph, sourceRef.id)).toEqual([]);
  expect(edgesFrom(graph, targetRef.id)).toEqual([replacementEdge]);
});
