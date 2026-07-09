/**
 * Bridge smoke tests — `ctx.graph` exists and is on the critical path of
 * `createGen()`. This is PR 2 of the kernel rebase: the kernel substrate is
 * available to consumers and ready for dual-writes from later PRs.
 *
 * See `docs/revised-kernel.md` for the bridge plan.
 */

import { expect, test } from "vite-plus/test";
import { createGen, kernel } from "../src/index.ts";
import {
  HAS_INPUT_TYPE_EDGE_KIND,
  HAS_OUTPUT_TYPE_EDGE_KIND,
} from "../src/dialects/core/type-operation.ts";

test("kernel bridge: ctx.graph is initialized with built-in operation nodes + type edges", () => {
  const { ctx } = createGen();

  expect(ctx.graph).toBeDefined();
  // Built-in operations are registered as nodes at context creation (R3/R4).
  const opNodes = [...ctx.graph.nodes.values()].filter(
    (n) => n.kind.id === kernel.nodeKinds.OPERATION_DEF.id,
  );
  expect(opNodes.length).toBeGreaterThan(0);
  // Each operation emits HAS_INPUT_TYPE edges per arg + one HAS_OUTPUT_TYPE edge.
  const opTypeEdges = [...ctx.graph.edges.values()].filter(
    (e) => e.kind.id === HAS_INPUT_TYPE_EDGE_KIND.id || e.kind.id === HAS_OUTPUT_TYPE_EDGE_KIND.id,
  );
  expect(opTypeEdges.length).toBeGreaterThan(0);
  expect(opTypeEdges.some((e) => e.kind === kernel.edgeKinds.HAS_INPUT_TYPE)).toBe(false);
  expect(opTypeEdges.some((e) => e.kind === kernel.edgeKinds.HAS_OUTPUT_TYPE)).toBe(false);
  expect(
    opTypeEdges.some((e) => e.endpoints.some((ep) => ep.role.id === "endpoint.role:operation")),
  ).toBe(true);
  expect(ctx.graph.types.size).toBe(0);
  expect(ctx.graph.transforms.size).toBe(0);
  expect(ctx.graph.exprs.size).toBe(0);
  expect(ctx.graph.traits.size).toBe(0);
});

test("kernel bridge: KernelGraph type and helpers reachable through public surface", () => {
  // The library re-exports the kernel namespace from src/index.ts, so
  // consumers can construct and inspect graphs without reaching into internals.
  expect(typeof kernel.createKernelGraph).toBe("function");

  const graph = kernel.createKernelGraph();
  expect(graph.nodes.size).toBe(0);
});

test("kernel bridge: createGen produces a fresh graph per context", () => {
  const a = createGen();
  const b = createGen();

  // Distinct contexts — mutating one (when registration helpers do that in
  // later PRs) must not leak into the other.
  expect(a.ctx.graph).not.toBe(b.ctx.graph);
});
