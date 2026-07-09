import { expect, test } from "vite-plus/test";
import { createGen, kernel } from "../src/index.ts";
import { registerCorePasses } from "../src/core/passes.ts";
import { attachEdge, attachNode } from "../src/kernel/bridge.ts";
import { defineEdge, defineNode, endpointRoles } from "../src/kernel/index.ts";

test("verify-dialects.nodeKinds checks node kind ownership from graph IR", () => {
  const { ctx } = createGen();

  attachNode(
    ctx.graph,
    defineNode({ id: "node.kind.pluginMissing", label: "Missing plugin kind" }, "missing-node"),
  );

  registerCorePasses(ctx);
  const result = ctx.passRegistry.run(
    kernel.BUILT_IN_PASSES.VERIFY_DIALECTS.NODE_KINDS,
    ctx.graph,
    {},
  );

  expect(result.diagnostics?.some((d) => d.code === "dialect:unknown-node-kind")).toBe(true);
});

test("verify-dialects.edgeKinds checks edge kind ownership from graph IR", () => {
  const { ctx } = createGen();

  attachNode(ctx.graph, defineNode(kernel.nodeKinds.STATIC, "source-node"));
  attachEdge(
    ctx.graph,
    defineEdge({ id: "edge.kind.pluginMissing", label: "Missing plugin edge" }, "missing-edge", [
      {
        role: endpointRoles.SOURCE,
        target: { kind: "node", id: "source-node" },
        cardinality: "one",
      },
    ]),
  );

  registerCorePasses(ctx);
  const result = ctx.passRegistry.run(
    kernel.BUILT_IN_PASSES.VERIFY_DIALECTS.EDGE_KINDS,
    ctx.graph,
    {},
  );

  expect(result.diagnostics?.some((d) => d.code === "dialect:unknown-edge-kind")).toBe(true);
});
