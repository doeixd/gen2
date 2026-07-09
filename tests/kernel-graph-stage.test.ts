import { expect, test } from "vite-plus/test";
import {
  applyGraphPatches,
  createKernelGraph,
  defineEdge,
  defineEdgeKind,
  defineEndpointRole,
  defineNode,
  endpointRoles,
  graphDerivation,
  graphPatch,
  registerNode,
  summarizeStageResult,
} from "../src/kernel/index.ts";

test("GraphPatch verifies and applies immutable graph updates", () => {
  const source = defineNode({ id: "node.kind.test", label: "Test" }, "node:source");
  const target = defineNode({ id: "node.kind.test", label: "Test" }, "node:target");
  const edge = defineEdge({ id: "edge.kind.test", label: "Test edge" }, "edge:test", [
    {
      role: endpointRoles.SOURCE,
      target: { kind: "node", id: source.id, name: source.name },
      cardinality: "one",
    },
    {
      role: endpointRoles.TARGET,
      target: { kind: "node", id: target.id, name: target.name },
      cardinality: "one",
    },
  ]);

  const graph = registerNode(registerNode(createKernelGraph(), source), target);
  const result = applyGraphPatches(graph, [
    graphPatch.addEdge(edge, { source: "derivation", name: "derive.test" }),
  ]);

  expect(result.diagnostics).toHaveLength(0);
  expect(result.graph).not.toBe(graph);
  expect(result.graph.edges.get(edge.id)).toBe(edge);
});

test("GraphPatch can build and apply an edge from an edge-kind witness", () => {
  const source = defineNode({ id: "node.kind.test", label: "Test" }, "node:source");
  const target = defineNode({ id: "node.kind.test", label: "Test" }, "node:target");
  const owns = defineEdgeKind({
    id: "edge.kind.testOwns",
    endpoints: [defineEndpointRole("owner", {}), defineEndpointRole("owned", {})],
    custom: undefined as unknown as { readonly reason: "test" },
  });

  const patch = graphPatch.addEdge.unsafe(
    owns,
    "edge:testOwns",
    {
      owner: { kind: "node", id: source.id, name: source.name },
      owned: { kind: "node", id: target.id, name: target.name },
    },
    {
      metadata: { custom: { reason: "test" } },
      patchProvenance: { source: "derivation", name: "derive.test" },
    },
  );
  const graph = registerNode(registerNode(createKernelGraph(), source), target);
  const result = applyGraphPatches(graph, [patch]);

  expect(result.diagnostics).toHaveLength(0);
  expect(result.graph.edges.get("edge:testOwns")?.kind.id).toBe("edge.kind.testOwns");
  expect(result.graph.edges.get("edge:testOwns")?.metadata?.custom).toEqual({ reason: "test" });
});

test("GraphDerivation returns a stage result with patches, diagnostics, and explanations", () => {
  const node = defineNode({ id: "node.kind.test", label: "Test" }, "node:derived");
  const derivation = graphDerivation("derive.test.node")
    .read("node.kind.source")
    .emit("node.kind.test")
    .because("source facts derive a test node")
    .run(() => ({
      patches: [graphPatch.addNode(node, { source: "derivation", name: "derive.test.node" })],
      explanations: [{ message: "derived a test node", facts: ["node.kind.source"] }],
    }));

  const result = derivation.run(createKernelGraph());

  expect(derivation.reads).toEqual(["node.kind.source"]);
  expect(derivation.emits).toEqual(["node.kind.test"]);
  expect(result.patches).toHaveLength(1);
  expect(result.diagnostics).toHaveLength(0);
  expect(result.explanations[0]?.message).toBe("derived a test node");
  expect(result.graph.nodes.get(node.id)).toBe(node);
});

test("summarizeStageResult exposes structured patch and explanation previews", () => {
  const node = defineNode({ id: "node.kind.test", label: "Test" }, "node:derived", {
    name: "Derived",
  });
  const derivation = graphDerivation("derive.test.node")
    .emit("node.kind.test")
    .run(() => ({
      patches: [graphPatch.addNode(node, { source: "derivation", name: "derive.test.node" })],
      explanations: [{ message: "derived a test node" }],
    }));

  const summary = summarizeStageResult(derivation.run(createKernelGraph()));

  expect(summary.patchCount).toBe(1);
  expect(summary.patches[0]).toMatchObject({
    op: "addNode",
    id: "node:derived",
    kind: "node.kind.test",
    target: "Derived",
    provenance: "derive.test.node",
  });
  expect(summary.explanationCount).toBe(1);
});
