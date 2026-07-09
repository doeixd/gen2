import { describe, expectTypeOf, test } from "vite-plus/test";
import { kernel } from "../src/index.ts";

describe("kernel graph pattern witnesses", () => {
  test("pattern bindings preserve node and edge witnesses", () => {
    const sourceNode = kernel.defineNodeKind({
      id: "node.kind.patternSource",
      traits: [],
      metadata: { title: "Pattern source" },
    });
    const targetNode = kernel.defineNodeKind({
      id: "node.kind.patternTarget",
      traits: [],
      metadata: { title: "Pattern target" },
    });
    const sourceRole = kernel.defineEndpointRole("source", { targetKinds: [sourceNode] });
    const targetRole = kernel.defineEndpointRole("target", { targetKinds: [targetNode] });
    const edgeKind = kernel.defineEdgeKind({
      id: "edge.kind.patternLinks",
      endpoints: { source: sourceRole, target: targetRole },
    });
    const pattern = kernel.defineGraphPattern({
      nodes: {
        source: sourceNode,
        target: targetNode,
      },
      edges: {
        link: {
          kind: edgeKind,
          endpoints: { source: "source", target: "target" },
        },
      },
    });
    type Match = NonNullable<ReturnType<typeof pattern.first>>;
    type Bindings = Match["bindings"];

    expectTypeOf<Bindings["source"]>().toMatchTypeOf<kernel.KernelNode>();
    expectTypeOf<Bindings["target"]>().toMatchTypeOf<kernel.KernelNode>();
    expectTypeOf<Bindings["link"]["kind"]["id"]>().toMatchTypeOf<
      kernel.KernelId<"edge.kind"> & "edge.kind.patternLinks"
    >();
  });
});
