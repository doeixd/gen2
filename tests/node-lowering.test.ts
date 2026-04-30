/**
 * Tests for the node lowering pipeline (registerNode, defineNode, lowerNode, checkNodes).
 */

import { test, expect } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import { defineNode, registerNode, lowerNode, checkNodes } from "../src/core/node-lowering.ts";
import { defineNodeKind, defineLowering, definePlugin } from "../src/core/plugin.ts";
import type { StaticNode } from "../src/core/node.ts";

test("registerNode adds node to ctx.nodes", () => {
  const { ctx } = createGen();
  const node = defineNode({ kind: "test", name: "myNode", traits: [] });
  registerNode(ctx, node);
  expect(ctx.nodes).toHaveLength(1);
  expect(ctx.nodes[0].name).toBe("myNode");
});

test("registerNode detects duplicate IDs", () => {
  const { ctx } = createGen();
  const node1 = defineNode({ kind: "test", id: "n1", name: "first", traits: [] });
  const node2 = defineNode({ kind: "test", id: "n1", name: "second", traits: [] });
  registerNode(ctx, node1);
  registerNode(ctx, node2);
  expect(ctx.nodes).toHaveLength(1);
  expect(ctx.diagnostics.some((d) => d.code === "node:duplicate-id")).toBe(true);
});

test("checkNodes flags unknown kind", () => {
  const { ctx } = createGen();
  const node = defineNode({ kind: "unknown-kind-xyz", name: "bad", traits: [] });
  registerNode(ctx, node);
  const diags = checkNodes(ctx);
  expect(diags.some((d) => d.code === "node:unknown-kind")).toBe(true);
});

test("checkNodes flags missing traits", () => {
  const plugin = definePlugin({
    id: "trait-plugin",
    namespace: "tp",
    setup: () => ({
      node_kinds: [
        defineNodeKind({
          kind: "workflow",
          traits: ["callable", "effectful"],
        }),
      ],
    }),
  });
  const { ctx } = createGen({ plugins: [plugin] });
  const node = defineNode({ kind: "workflow", name: "incomplete", traits: ["callable"] });
  registerNode(ctx, node);
  const diags = checkNodes(ctx);
  expect(diags.some((d) => d.code === "node:missing-trait")).toBe(true);
});

test("lowerNode returns undefined when direct interpretation exists", () => {
  const plugin = definePlugin({
    id: "interp-plugin",
    namespace: "ip",
    setup: () => ({
      node_kinds: [
        defineNodeKind({
          kind: "custom",
          traits: [],
          interpret: {
            artifact: (_node: StaticNode) => [],
          },
        }),
      ],
    }),
  });
  const { ctx } = createGen({ plugins: [plugin] });
  const node = defineNode({ kind: "custom", name: "interp", traits: [] });
  const result = lowerNode(ctx, node, "artifact");
  expect(result).toBeUndefined();
});

test("lowerNode applies lowering chain", () => {
  const plugin = definePlugin({
    id: "lower-plugin",
    namespace: "lp",
    setup: () => ({
      node_kinds: [
        defineNodeKind({ kind: "custom", traits: [] }),
        defineNodeKind({ kind: "entity", traits: [] }),
      ],
      lowerings: [
        defineLowering({
          from_kind: "custom",
          to_kind: "entity",
          lower: (node: StaticNode) =>
            defineNode({ kind: "entity", name: `${node.name}_lowered`, traits: [] }),
        }),
      ],
    }),
  });
  const { ctx } = createGen({ plugins: [plugin] });
  const node = defineNode({ kind: "custom", name: "orig", traits: [] });
  const result = lowerNode(ctx, node, "artifact");
  expect(result).toBeDefined();
  if (result !== undefined && !Array.isArray(result)) {
    const single = result as import("../src/core/node.ts").StaticNode;
    expect(single.kind).toBe("entity");
    expect(single.name).toBe("orig_lowered");
  }
});

test("lowerNode detects cycles", () => {
  const plugin = definePlugin({
    id: "cycle-plugin",
    namespace: "cp",
    setup: () => ({
      node_kinds: [defineNodeKind({ kind: "a", traits: [] })],
      lowerings: [
        defineLowering({
          from_kind: "a",
          to_kind: "a",
          lower: (node: StaticNode) => node,
        }),
      ],
    }),
  });
  const { ctx } = createGen({ plugins: [plugin] });
  const node = defineNode({ kind: "a", name: "cycle", traits: [] });
  lowerNode(ctx, node, "artifact");
  expect(ctx.diagnostics.some((d) => d.code === "node:lowering-cycle")).toBe(true);
});

test("lowerNode emits diagnostic for plugin-defined kind with no interpretation or lowering", () => {
  const plugin = definePlugin({
    id: "orphan-plugin",
    namespace: "op",
    setup: () => ({
      node_kinds: [defineNodeKind({ kind: "orphan", traits: [] })],
    }),
  });
  const { ctx } = createGen({ plugins: [plugin] });
  const node = defineNode({ kind: "orphan", name: "orphan", traits: [] });
  lowerNode(ctx, node, "artifact");
  expect(ctx.diagnostics.some((d) => d.code === "node:no-target-interpretation")).toBe(true);
});

test("lowerNode is silent for unregistered built-in kinds", () => {
  const { ctx } = createGen();
  const node = defineNode({ kind: "action_function", name: "builtIn", traits: [] });
  lowerNode(ctx, node, "artifact");
  expect(ctx.diagnostics.some((d) => d.code === "node:no-target-interpretation")).toBe(false);
});

test("lowerNode emits diagnostic for invalid lowering (undefined result)", () => {
  const plugin = definePlugin({
    id: "bad-lower-plugin",
    namespace: "bp",
    setup: () => ({
      node_kinds: [defineNodeKind({ kind: "x", traits: [] })],
      lowerings: [
        defineLowering({
          from_kind: "x",
          to_kind: "y",
          lower: () => undefined as unknown as StaticNode,
        }),
      ],
    }),
  });
  const { ctx } = createGen({ plugins: [plugin] });
  const node = defineNode({ kind: "x", name: "bad", traits: [] });
  lowerNode(ctx, node, "artifact");
  expect(ctx.diagnostics.some((d) => d.code === "node:invalid-lowering")).toBe(true);
});

test("lowerNode flattens array results from lowering", () => {
  const plugin = definePlugin({
    id: "multi-lower-plugin",
    namespace: "mp",
    setup: () => ({
      node_kinds: [
        defineNodeKind({ kind: "multi", traits: [] }),
        defineNodeKind({ kind: "entity", traits: [] }),
      ],
      lowerings: [
        defineLowering({
          from_kind: "multi",
          to_kind: "entity",
          lower: (node: StaticNode) => [
            defineNode({ kind: "entity", name: `${node.name}_1`, traits: [] }),
            defineNode({ kind: "entity", name: `${node.name}_2`, traits: [] }),
          ],
        }),
      ],
    }),
  });
  const { ctx } = createGen({ plugins: [plugin] });
  const node = defineNode({ kind: "multi", name: "split", traits: [] });
  const result = lowerNode(ctx, node, "artifact");
  expect(Array.isArray(result)).toBe(true);
  if (Array.isArray(result)) {
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("split_1");
    expect(result[1].name).toBe("split_2");
  }
});
