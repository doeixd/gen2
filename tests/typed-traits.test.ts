/**
 * Runtime tests for typed trait references (TraitRef, createTrait, trait metadata).
 */

import { test, expect } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import {
  createTrait,
  traits,
  hasTrait,
  hasTraits,
  missingTraits,
  BUILT_IN_TRAITS,
} from "../src/core/node.ts";
import { defineNode, registerNode } from "../src/core/node-lowering.ts";
import { registerTraitMetadata, getTraitMetadata } from "../src/core/context.ts";
import { defineNodeKind, definePlugin } from "../src/core/plugin.ts";

test("createTrait produces branded string refs", () => {
  const readable = createTrait("readable");
  expect(typeof readable).toBe("string");
  expect(readable).toBe("readable");
});

test("hasTrait accepts both strings and TraitRef values", () => {
  const node = defineNode({ kind: "test", name: "t", traits: ["callable", "readable"] });

  // String literal trait
  expect(hasTrait(node, "callable")).toBe(true);
  expect(hasTrait(node, "writable")).toBe(false);

  // TraitRef value
  expect(hasTrait(node, traits.callable)).toBe(true);
  expect(hasTrait(node, traits.writable)).toBe(false);
});

test("hasTraits and missingTraits work with TraitRef arrays", () => {
  const node = defineNode({ kind: "test", name: "t", traits: ["callable", "readable"] });

  expect(hasTraits(node, [traits.callable, traits.readable])).toBe(true);
  expect(hasTraits(node, [traits.callable, traits.writable])).toBe(false);

  const missing = missingTraits(node, [traits.callable, traits.writable, "reactive"]);
  expect(missing).toContain("writable");
  expect(missing).toContain("reactive");
  expect(missing).not.toContain("callable");
});

test("BUILT_IN_TRAITS contains all built-in trait names", () => {
  expect(BUILT_IN_TRAITS.has("callable")).toBe(true);
  expect(BUILT_IN_TRAITS.has("readable")).toBe(true);
  expect(BUILT_IN_TRAITS.has("writable")).toBe(true);
  expect(BUILT_IN_TRAITS.has("nonexistent")).toBe(false);
});

test("registerTraitMetadata and getTraitMetadata round-trip", () => {
  const { ctx } = createGen();
  const customTrait = createTrait("myPlugin:custom");

  expect(getTraitMetadata(ctx, customTrait)).toBeUndefined();

  registerTraitMetadata(ctx, customTrait, {
    description: "A custom trait",
    version: "1.0.0",
    deprecated: false,
  });

  const metadata = getTraitMetadata(ctx, customTrait);
  expect(metadata).toBeDefined();
  expect(metadata?.description).toBe("A custom trait");
  expect(metadata?.version).toBe("1.0.0");
});

test("plugin can register custom trait and use it in defineNodeKind", () => {
  const customTrait = createTrait("myPlugin:custom", { description: "Custom capability" });

  const plugin = definePlugin({
    id: "trait-plugin",
    namespace: "tp",
    setup: () => ({
      node_kinds: [
        defineNodeKind({
          kind: "custom_node",
          traits: [customTrait],
        }),
      ],
    }),
  });

  const { ctx } = createGen({ plugins: [plugin] });

  // Register metadata for the custom trait
  registerTraitMetadata(ctx, customTrait, { description: "Custom capability" });

  const node = defineNode({ kind: "custom_node", name: "custom", traits: [customTrait] });
  registerNode(ctx, node);

  // The node should pass checks without unknown-trait diagnostics
  const diags = ctx.moduleCheckers.flatMap((checker) => checker(ctx));
  expect(diags.some((d) => d.code === "trait:unknown")).toBe(false);
});

test("checkNodes emits trait:unknown for unregistered custom traits", () => {
  const plugin = definePlugin({
    id: "trait-plugin",
    namespace: "tp",
    setup: () => ({
      node_kinds: [
        defineNodeKind({
          kind: "custom_node",
          traits: ["myPlugin:required"],
        }),
      ],
    }),
  });

  const { ctx } = createGen({ plugins: [plugin] });

  const node = defineNode({ kind: "custom_node", name: "bad", traits: ["myPlugin:required"] });
  registerNode(ctx, node);

  // Run module checkers
  const diags = ctx.moduleCheckers.flatMap((checker) => checker(ctx));
  expect(diags.some((d) => d.code === "trait:unknown")).toBe(true);
});
