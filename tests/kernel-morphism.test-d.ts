/**
 * Type-level tests for `defineMorphism(...)` (PLAN Track A §1a, §2).
 *
 * Covers the generic preservation on `GraphMorphism.to` so callers can
 * read `morphism.to.nodes` / `.edges` / `.artifacts` as typed unions
 * instead of opaque `string[]`.
 */
import { describe, expectTypeOf, test } from "vite-plus/test";
import { kernel } from "../src/index.ts";

const SourceKind = kernel.defineNodeKind({ id: "node.kind.test.morphism-td.source" });
const TargetKind = kernel.defineNodeKind({ id: "node.kind.test.morphism-td.target" });

const LinkEdge = kernel.defineEdgeKind({
  id: "edge.kind.test.morphism-td.link",
  endpoints: [
    kernel.defineEndpointRole("source", { targetKinds: [SourceKind] }),
    kernel.defineEndpointRole("target", { targetKinds: [TargetKind] }),
  ],
});

const DerivedEdge = kernel.defineEdgeKind({
  id: "edge.kind.test.morphism-td.derived",
  endpoints: [
    kernel.defineEndpointRole("from", { targetKinds: [SourceKind] }),
    kernel.defineEndpointRole("to", { targetKinds: [TargetKind] }),
  ],
});

const LINK_PATTERN = kernel.defineGraphPattern({
  nodes: { source: SourceKind, target: TargetKind },
  edges: {
    link: { kind: LinkEdge, endpoints: { source: "source", target: "target" } },
  },
});

describe("kernel.defineMorphism — typed `to` vocabulary", () => {
  test("morphism preserves declared edge-kind union in `to.edges`", () => {
    const m = kernel.defineMorphism({
      name: "td.morphism.edges",
      phase: "derivation",
      from: LINK_PATTERN,
      to: { edges: [DerivedEdge] },
      map: () => [],
    });

    // The morphism's `to.edges` tuple preserves the DerivedEdge witness.
    expectTypeOf(m.to.edges).toEqualTypeOf<readonly [typeof DerivedEdge] | undefined>();
  });

  test("morphism preserves declared artifact-kind literals in `to.artifacts`", () => {
    const m = kernel.defineMorphism({
      name: "td.morphism.artifacts",
      phase: "lowering",
      from: LINK_PATTERN,
      to: { artifacts: ["pg.rls-policy", "tsx.component"] as const },
      map: () => [],
    });

    // The morphism's `to.artifacts` tuple preserves the literal artifact-kind union.
    expectTypeOf(m.to.artifacts).toEqualTypeOf<
      readonly ["pg.rls-policy", "tsx.component"] | undefined
    >();
  });

  test("morphism preserves declared node-kind union in `to.nodes`", () => {
    const m = kernel.defineMorphism({
      name: "td.morphism.nodes",
      phase: "derivation",
      from: LINK_PATTERN,
      to: { nodes: [TargetKind] },
      map: () => [],
    });

    expectTypeOf(m.to.nodes).toEqualTypeOf<readonly [typeof TargetKind] | undefined>();
  });
});
