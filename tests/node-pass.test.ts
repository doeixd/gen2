import { expect, test } from "vite-plus/test";
import { createGen, definePlugin } from "../src/index.ts";
import { check } from "../src/lifecycle/lifecycle.ts";
import { defineNode, registerNode } from "../src/core/node-lowering.ts";
import { defineNodeKind } from "../src/core/plugin.ts";

test("verify-symbols.nodes reports unknown static node kind through graph-native pass", () => {
  const { ctx, gen } = createGen();

  gen.node.define({ kind: "unknown-kind", name: "bad", traits: [] });
  const result = check(ctx);

  expect(result.diagnostics.some((d) => d.code === "node:unknown-kind")).toBe(true);
});

test("verify-symbols.nodes uses plugin node kinds and trait metadata without genContext bridge", () => {
  const plugin = definePlugin({
    id: "node-pass-plugin",
    namespace: "npp",
    setup: () => ({
      node_kinds: [
        defineNodeKind({
          kind: "custom_node",
          traits: ["callable", "nodePass:custom"],
        }),
      ],
      trait_metadata: {
        "nodePass:custom": { description: "Custom node-pass trait" },
      },
    }),
  });
  const { ctx } = createGen({ plugins: [plugin] });
  const node = defineNode({
    kind: "custom_node",
    name: "custom",
    traits: ["callable", "nodePass:custom"],
  });

  registerNode(ctx, node);
  const result = check(ctx);

  expect(result.diagnostics.some((d) => d.code === "node:missing-trait")).toBe(false);
  expect(result.diagnostics.some((d) => d.code === "trait:unknown")).toBe(false);
});
