/**
 * Runtime tests for `defineMorphism(...)` (PLAN Track A §2).
 */
import { expect, test } from "vite-plus/test";
import { kernel } from "../src/index.ts";

const SourceKind = kernel.defineNodeKind({ id: "node.kind.test.morphism.source" });
const TargetKind = kernel.defineNodeKind({ id: "node.kind.test.morphism.target" });

const LinkEdge = kernel.defineEdgeKind({
  id: "edge.kind.test.morphism.link",
  endpoints: [
    kernel.defineEndpointRole("source", { targetKinds: [SourceKind] }),
    kernel.defineEndpointRole("target", { targetKinds: [TargetKind] }),
  ],
});

const DerivedEdge = kernel.defineEdgeKind({
  id: "edge.kind.test.morphism.derived",
  endpoints: [
    kernel.defineEndpointRole("from", { targetKinds: [SourceKind] }),
    kernel.defineEndpointRole("to", { targetKinds: [TargetKind] }),
  ],
});

const LINK_PATTERN = kernel.defineGraphPattern({
  nodes: {
    source: SourceKind,
    target: TargetKind,
  },
  edges: {
    link: {
      kind: LinkEdge,
      endpoints: { source: "source", target: "target" },
    },
  },
});

const buildLinkedGraph = () => {
  const src = kernel.defineNodeFromKind(SourceKind, "node:src:a", { name: "a" });
  const tgt = kernel.defineNodeFromKind(TargetKind, "node:tgt:b", { name: "b" });
  const link = kernel.defineEdgeFromKind(LinkEdge, "edge:link:a-b", {
    source: kernel.refOf(src),
    target: kernel.refOf(tgt),
  });
  const graph = kernel.createGraphBuilder().node(src).node(tgt).edge(link).done();
  return { graph, src, tgt };
};

test("defineMorphism builds a morphism with kind/name/phase metadata", () => {
  const m = kernel.defineMorphism({
    name: "test.morphism.derived-link",
    phase: "derivation",
    from: LINK_PATTERN,
    to: { edges: [DerivedEdge] },
    map: () => [],
  });

  expect(m.kind).toBe("graph.morphism");
  expect(m.name).toBe("test.morphism.derived-link");
  expect(m.phase).toBe("derivation");
  expect(m.to.edges).toEqual([DerivedEdge]);
});

test("morphism.run walks pattern matches and emits derived edges", () => {
  const { graph, src, tgt } = buildLinkedGraph();

  const m = kernel.defineMorphism({
    name: "test.morphism.derive",
    phase: "derivation",
    from: LINK_PATTERN,
    to: { edges: [DerivedEdge] },
    map: (match) => {
      const edge = kernel.defineEdgeFromKind(
        DerivedEdge,
        `edge:derived:${match.bindings.source.id}:${match.bindings.target.id}`,
        {
          from: kernel.refOf(match.bindings.source),
          to: kernel.refOf(match.bindings.target),
        },
      );
      return [
        kernel.graphPatch.addEdge.unsafe(
          DerivedEdge,
          edge.id,
          edge.endpoints[0]!.target.id
            ? {
                from: kernel.refOf(match.bindings.source),
                to: kernel.refOf(match.bindings.target),
              }
            : { from: kernel.refOf(src), to: kernel.refOf(tgt) },
        ),
      ];
    },
  });

  const result = m.run(graph);
  expect(result.patches).toHaveLength(1);
});

test("morphism.matches returns typed bindings", () => {
  const { graph } = buildLinkedGraph();

  const m = kernel.defineMorphism({
    name: "test.morphism.match-inspect",
    phase: "derivation",
    from: LINK_PATTERN,
    to: {},
    map: () => [],
  });

  const matches = m.matches(graph);
  expect(matches).toHaveLength(1);
  expect(matches[0]!.bindings.source.kind.id).toBe(SourceKind.id);
  expect(matches[0]!.bindings.target.kind.id).toBe(TargetKind.id);
});

test("morphism.toDerivation compiles to a GraphDerivation with reads/emits", () => {
  const m = kernel.defineMorphism({
    name: "test.morphism.toDerivation",
    phase: "derivation",
    from: LINK_PATTERN,
    to: { nodes: [SourceKind], edges: [DerivedEdge] },
    diagnostics: ["test:morphism-info"],
    explanation: "Materialize derived links",
    map: () => [],
  });

  const derivation = m.toDerivation();
  expect(derivation.name).toBe("test.morphism.toDerivation");
  expect(derivation.reads).toContain(SourceKind.id);
  expect(derivation.emits).toContain(DerivedEdge.id);
  expect(derivation.diagnostics).toContain("test:morphism-info");
  expect(derivation.explanation).toBe("Materialize derived links");
});

test("morphism helpers.patch.addEdge produces patches against declared `to` vocabulary", () => {
  const { graph } = buildLinkedGraph();
  const testFactory = kernel.id.createFactory("test.morphism");

  const m = kernel.defineMorphism({
    name: "test.morphism.helpersPatchAddEdge",
    phase: "derivation",
    from: LINK_PATTERN,
    to: { edges: [DerivedEdge] },
    map: (match, helpers) => {
      const id = testFactory.edge(DerivedEdge, match.bindings.source.id, match.bindings.target.id);
      return [
        helpers.patch.addEdge(DerivedEdge, id, {
          from: kernel.refOf(match.bindings.source),
          to: kernel.refOf(match.bindings.target),
        }),
      ];
    },
  });

  const result = m.run(graph);
  expect(result.patches).toHaveLength(1);
  expect((result.patches[0] as { op: string }).op).toBe("addEdge");
});

test("morphism emits artifacts via map output", () => {
  const { graph } = buildLinkedGraph();

  const m = kernel.defineMorphism({
    name: "test.morphism.emitArtifact",
    phase: "emission",
    from: LINK_PATTERN,
    to: { artifacts: ["test:morphism-artifact"] },
    map: (match) => ({
      artifacts: [
        kernel.defineArtifact(`artifact:test:${match.bindings.source.id}`, {
          target: "docs",
          kind: kernel.ARTIFACT_KINDS.PG_RLS_POLICY,
          path: `out/${match.bindings.source.id}.txt`,
          content: `linked: ${match.bindings.source.id} -> ${match.bindings.target.id}`,
          generatedBy: "pass:test.morphism.emitArtifact" as kernel.KernelId<"pass">,
        }),
      ],
    }),
  });

  const result = m.run(graph);
  expect(result.artifacts).toHaveLength(1);
  expect(result.artifacts[0]!.path).toBe("out/node:src:a.txt");
});

test("morphism `mapAll` aggregates over all matches in a single call", () => {
  const src1 = kernel.defineNodeFromKind(SourceKind, "node:src:agg:1");
  const src2 = kernel.defineNodeFromKind(SourceKind, "node:src:agg:2");
  const tgt = kernel.defineNodeFromKind(TargetKind, "node:tgt:agg");
  const l1 = kernel.defineEdgeFromKind(LinkEdge, "edge:agg:1", {
    source: kernel.refOf(src1),
    target: kernel.refOf(tgt),
  });
  const l2 = kernel.defineEdgeFromKind(LinkEdge, "edge:agg:2", {
    source: kernel.refOf(src2),
    target: kernel.refOf(tgt),
  });
  const graph = kernel
    .createGraphBuilder()
    .node(src1)
    .node(src2)
    .node(tgt)
    .edge(l1)
    .edge(l2)
    .done();

  const m = kernel.defineMorphism({
    name: "test.morphism.mapAll",
    phase: "derivation",
    from: LINK_PATTERN,
    to: {},
    mapAll: (matches) => ({
      explanations: [
        {
          message: `aggregated ${matches.length} matches; targets=${[
            ...new Set(matches.map((m) => m.bindings.target.id)),
          ].join(",")}`,
        },
      ],
    }),
  });

  const result = m.run(graph);
  expect(result.explanations).toHaveLength(1);
  expect(result.explanations[0]!.message).toContain("aggregated 2 matches");
});

test("morphism rejects map + mapAll together; rejects neither", () => {
  expect(() =>
    kernel.defineMorphism({
      name: "test.morphism.bothMap",
      phase: "derivation",
      from: LINK_PATTERN,
      to: {},
      map: () => [],
      mapAll: () => [],
    }),
  ).toThrow(/specify either/);

  expect(() =>
    kernel.defineMorphism({
      name: "test.morphism.noMap",
      phase: "derivation",
      from: LINK_PATTERN,
      to: {},
    }),
  ).toThrow(/must be provided/);
});

test("morphism aggregates patches/diagnostics/explanations across matches", () => {
  const src1 = kernel.defineNodeFromKind(SourceKind, "node:src:1");
  const src2 = kernel.defineNodeFromKind(SourceKind, "node:src:2");
  const tgt = kernel.defineNodeFromKind(TargetKind, "node:tgt:1");
  const l1 = kernel.defineEdgeFromKind(LinkEdge, "edge:l1", {
    source: kernel.refOf(src1),
    target: kernel.refOf(tgt),
  });
  const l2 = kernel.defineEdgeFromKind(LinkEdge, "edge:l2", {
    source: kernel.refOf(src2),
    target: kernel.refOf(tgt),
  });
  const graph = kernel
    .createGraphBuilder()
    .node(src1)
    .node(src2)
    .node(tgt)
    .edge(l1)
    .edge(l2)
    .done();

  const m = kernel.defineMorphism({
    name: "test.morphism.aggregate",
    phase: "derivation",
    from: LINK_PATTERN,
    to: {},
    map: (match) => ({
      patches: [],
      explanations: [{ message: `link ${match.bindings.source.id}` }],
    }),
  });

  const result = m.run(graph);
  expect(result.explanations).toHaveLength(2);
});

test("topologicalSortMorphisms respects declared dependsOn order", () => {
  const a = kernel.defineMorphism({
    name: "topo.a",
    phase: "derivation",
    from: LINK_PATTERN,
    to: {},
    map: () => [],
  });
  const b = kernel.defineMorphism({
    name: "topo.b",
    phase: "derivation",
    from: LINK_PATTERN,
    to: {},
    map: () => [],
    dependsOn: ["topo.a"],
  });
  const c = kernel.defineMorphism({
    name: "topo.c",
    phase: "derivation",
    from: LINK_PATTERN,
    to: {},
    map: () => [],
    dependsOn: ["topo.b"],
  });

  // Declaration order [c, a, b] should sort to [a, b, c].
  const { order, diagnostics } = kernel.topologicalSortMorphisms([c, a, b]);
  expect(order.map((m) => m.name)).toEqual(["topo.a", "topo.b", "topo.c"]);
  expect(diagnostics).toEqual([]);
});

test("topologicalSortMorphisms emits morphism:unknown-dependency for missing deps", () => {
  const m = kernel.defineMorphism({
    name: "topo.missing-dep",
    phase: "derivation",
    from: LINK_PATTERN,
    to: {},
    map: () => [],
    dependsOn: ["topo.does-not-exist"],
  });
  const { order, diagnostics } = kernel.topologicalSortMorphisms([m]);
  expect(order).toHaveLength(1);
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]!.code).toBe("morphism:unknown-dependency");
  expect(diagnostics[0]!.severity).toBe("warning");
});

test("topologicalSortMorphisms emits morphism:cyclic-dependency for cycles", () => {
  const a = kernel.defineMorphism({
    name: "topo.cycle.a",
    phase: "derivation",
    from: LINK_PATTERN,
    to: {},
    map: () => [],
    dependsOn: ["topo.cycle.b"],
  });
  const b = kernel.defineMorphism({
    name: "topo.cycle.b",
    phase: "derivation",
    from: LINK_PATTERN,
    to: {},
    map: () => [],
    dependsOn: ["topo.cycle.a"],
  });

  const { order, diagnostics } = kernel.topologicalSortMorphisms([a, b]);
  // Cycle members appended at the end so the result is still iterable.
  expect(order).toHaveLength(2);
  expect(diagnostics.some((d) => d.code === "morphism:cyclic-dependency")).toBe(true);
  expect(diagnostics.find((d) => d.code === "morphism:cyclic-dependency")?.severity).toBe("error");
});
