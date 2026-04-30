/**
 * Integration tests for Milestone 7 and 8 completeness.
 */

import { test, expect } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import { defineNode, lowerNode, checkNodes } from "../src/core/node-lowering.ts";
import { defineNodeKind, defineLowering, definePlugin } from "../src/core/plugin.ts";
import type { StaticNode } from "../src/core/node.ts";

test("plugin can define workflow node kind and lower it to an action sequence", () => {
  const workflowPlugin = definePlugin({
    id: "workflow-plugin",
    namespace: "wf",
    setup: () => ({
      node_kinds: [
        defineNodeKind({
          kind: "workflow",
          traits: ["callable", "effectful", "plan"],
        }),
      ],
      lowerings: [
        defineLowering({
          from_kind: "workflow",
          to_kind: "action_function",
          lower: (node: StaticNode) => {
            // Lower a workflow to two action functions
            return [
              defineNode({
                kind: "action_function",
                name: `${node.name}_step1`,
                traits: ["callable", "writable", "effectful"],
              }),
              defineNode({
                kind: "action_function",
                name: `${node.name}_step2`,
                traits: ["callable", "writable", "effectful"],
              }),
            ];
          },
        }),
      ],
    }),
  });

  const { ctx, gen } = createGen({ plugins: [workflowPlugin] });

  // Define a custom workflow node via gen.node.define
  const workflow = gen.node.define({
    kind: "workflow",
    name: "approveOrder",
    traits: ["callable", "effectful", "plan"],
  });

  expect(ctx.nodes).toContain(workflow);

  // Lower the workflow toward a target
  const lowered = lowerNode(ctx, workflow, "artifact");
  expect(Array.isArray(lowered)).toBe(true);
  if (Array.isArray(lowered)) {
    expect(lowered).toHaveLength(2);
    expect(lowered[0].name).toBe("approveOrder_step1");
    expect(lowered[1].name).toBe("approveOrder_step2");
    expect(lowered[0].kind).toBe("action_function");
    expect(lowered[1].kind).toBe("action_function");
  }
});

test("workflow without lowering produces no-target-interpretation diagnostic", () => {
  const workflowPlugin = definePlugin({
    id: "workflow-plugin-no-lower",
    namespace: "wf",
    setup: () => ({
      node_kinds: [
        defineNodeKind({
          kind: "workflow",
          traits: ["callable", "effectful", "plan"],
        }),
      ],
      // No lowerings and no interpreters
    }),
  });

  const { ctx, gen } = createGen({ plugins: [workflowPlugin] });

  const workflow = gen.node.define({
    kind: "workflow",
    name: "shipOrder",
    traits: ["callable", "effectful", "plan"],
  });

  const lowered = lowerNode(ctx, workflow, "artifact");
  expect(lowered).toBeUndefined();
  expect(ctx.diagnostics.some((d) => d.code === "node:no-target-interpretation")).toBe(true);
});

test("plugin auto-registers trait metadata via contributions", () => {
  const plugin = definePlugin({
    id: "meta-plugin",
    namespace: "mp",
    setup: () => ({
      node_kinds: [
        defineNodeKind({
          kind: "custom_node",
          traits: ["myPlugin:custom"],
        }),
      ],
      trait_metadata: {
        "myPlugin:custom": { description: "A custom trait", version: "1.0.0" },
      },
    }),
  });

  const { ctx } = createGen({ plugins: [plugin] });

  // Trait metadata should be auto-registered from plugin contributions
  expect(ctx.trait_metadata.has("myPlugin:custom")).toBe(true);
  expect(ctx.trait_metadata.get("myPlugin:custom")?.description).toBe("A custom trait");

  // Registering a node with the custom trait should not produce unknown-trait diagnostics
  const node = defineNode({ kind: "custom_node", name: "custom", traits: ["myPlugin:custom"] });
  ctx.nodes.push(node);
  const diags = checkNodes(ctx);
  expect(diags.some((d) => d.code === "trait:unknown")).toBe(false);
});

test("checkNodes emits unknown-trait when metadata is not registered", () => {
  const plugin = definePlugin({
    id: "meta-plugin-missing",
    namespace: "mp",
    setup: () => ({
      node_kinds: [
        defineNodeKind({
          kind: "custom_node",
          traits: ["myPlugin:custom"],
        }),
      ],
      // trait_metadata is intentionally omitted
    }),
  });

  const { ctx } = createGen({ plugins: [plugin] });

  const node = defineNode({ kind: "custom_node", name: "custom", traits: ["myPlugin:custom"] });
  ctx.nodes.push(node);
  const diags = checkNodes(ctx);
  expect(diags.some((d) => d.code === "trait:unknown")).toBe(true);
});

test("gen.node.define auto-registers node in ctx.nodes", () => {
  const { gen, ctx } = createGen();

  const node = gen.node.define({
    kind: "test_node",
    name: "myNode",
    traits: ["callable"],
  });

  expect(ctx.nodes).toContain(node);
  expect(node.name).toBe("myNode");
  expect(node.kind).toBe("test_node");
});

test("custom callable+readable node works as route loader via gen.node.define", () => {
  const { gen, ctx } = createGen();
  const _User = gen.entity("User", { id: gen.types.uuid() });
  void _User;

  const customLoader = gen.node.define({
    kind: "custom_loader",
    name: "customUserLoader",
    traits: ["callable", "readable", "server_placeable"],
  });

  gen.router.route({
    path: "/users/:id",
    path_params: { id: gen.types.uuid() },
    loaders: [customLoader as any],
  });

  const graph = gen.reactivity.graph(ctx);

  expect(graph.nodes.some((n) => n.kind === "app_route" && n.name === "/users/:id")).toBe(true);
  expect(
    graph.nodes.some((n) => n.kind === "query_function" && n.name === "customUserLoader"),
  ).toBe(true);
  expect(
    graph.edges.some(
      (e) =>
        e.from === "app_route:/users/:id" &&
        e.to === "node:customUserLoader" &&
        e.kind === "route_loads",
    ),
  ).toBe(true);
});
