/**
 * R11 — Plugin/dialect API tests.
 *
 * Verifies that plugins can contribute dialects, passes, node kinds, edge
 * kinds, and traits, and that duplicate symbols produce diagnostics.
 */

import { expect, test } from "vite-plus/test";
import { createGen, definePlugin } from "../src/index.ts";
import { defineLowering as definePluginLowering } from "../src/core/plugin.ts";
import {
  defineDialect,
  dialectId,
  defineNodeKind,
  defineEdgeKind,
  defineEndpointRole,
  defineTrait,
  definePass,
} from "../src/kernel/index.ts";
import { check } from "../src/lifecycle/lifecycle.ts";

test("plugin can contribute a dialect with node kind, edge kind, and trait", () => {
  const customNodeKind = defineNodeKind({
    id: "node.kind.customWidget",
    dialect: "dialect.plugin.custom",
    traits: [],
    metadata: { title: "Custom widget" },
  });
  const customEdgeKind = defineEdgeKind({
    id: "edge.kind.customEmbeds",
    dialect: "dialect.plugin.custom",
    endpoints: [
      defineEndpointRole("parent", { targetKinds: [customNodeKind] }),
      defineEndpointRole("child", { targetKinds: [customNodeKind] }),
    ],
    metadata: { title: "Custom embeds" },
  });
  const customTrait = defineTrait<true>("trait.custom.stylable", "Stylable", "node");

  const customDialect = defineDialect({
    id: dialectId("dialect.plugin.custom"),
    label: "Custom",
    nodeKinds: [customNodeKind],
    edgeKinds: [customEdgeKind],
    traits: [customTrait],
    metadata: { title: "Custom Plugin Dialect" },
  });

  const plugin = definePlugin({
    id: "custom-ui-plugin",
    namespace: "customUi",
    setup: () => ({
      dialects: [customDialect],
      passes: [],
    }),
  });

  const { ctx } = createGen({ plugins: [plugin] });

  expect(ctx.dialectRegistry.getById(customDialect.dialectId)).toBe(customDialect);
  expect(ctx.dialectRegistry.getDialectForNodeKind(customNodeKind.id)).toBe(customDialect);
  expect(ctx.dialectRegistry.getDialectForEdgeKind(customEdgeKind.id)).toBe(customDialect);
  expect(ctx.dialectRegistry.getDialectForTrait(customTrait.id)).toBe(customDialect);
});

test("plugin can contribute a pass", () => {
  const customPass = definePass("plugin.custom.verify", "verify-symbols");

  const plugin = definePlugin({
    id: "custom-pass-plugin",
    namespace: "customPass",
    setup: () => ({
      passes: [customPass],
      dialects: [],
    }),
  });

  const { ctx } = createGen({ plugins: [plugin] });

  expect(ctx.passRegistry.has("plugin.custom.verify")).toBe(true);
});

test("plugin can contribute an executable pass runner", () => {
  const customPass = definePass("plugin.custom.executable", "verify-symbols");

  const plugin = definePlugin({
    id: "custom-executable-pass-plugin",
    namespace: "customExecutablePass",
    setup: () => ({
      passes: [
        {
          pass: customPass,
          runner: () => ({
            success: false,
            diagnostics: [
              {
                code: "plugin:custom-pass-ran",
                severity: "error",
                message: "Custom plugin pass ran",
                refs: [],
              },
            ],
          }),
        },
      ],
      dialects: [],
    }),
  });

  const { ctx } = createGen({ plugins: [plugin] });
  const result = check(ctx);

  expect(result.status).toBe("has_errors");
  expect(result.diagnostics.some((d) => d.code === "plugin:custom-pass-ran")).toBe(true);
});

test("duplicate plugin pass name produces diagnostic", () => {
  const passA = definePass("plugin.custom.duplicate", "verify-symbols");
  const passB = definePass("plugin.custom.duplicate", "verify-symbols");

  const pluginA = definePlugin({
    id: "pass-plugin-a",
    namespace: "passA",
    setup: () => ({ passes: [passA], dialects: [] }),
  });
  const pluginB = definePlugin({
    id: "pass-plugin-b",
    namespace: "passB",
    setup: () => ({ passes: [passB], dialects: [] }),
  });

  const { ctx } = createGen({ plugins: [pluginA, pluginB] });

  expect(ctx.diagnostics.some((d) => d.code === "plugin:duplicate-pass")).toBe(true);
});

test("plugin can contribute a named pipeline", () => {
  const customPass = definePass("plugin.pipeline.emit", "emit");

  const plugin = definePlugin({
    id: "pipeline-plugin",
    namespace: "pipelinePlugin",
    setup: () => ({
      passes: [{ pass: customPass, runner: () => ({ success: true }) }],
      pipelines: [{ name: "plugin.pipeline", passes: [customPass.name] }],
      dialects: [],
    }),
  });

  const { ctx } = createGen({ plugins: [plugin] });

  expect(ctx.pipelineRegistry.get("plugin.pipeline")?.passes).toEqual([customPass.name]);
});

test("duplicate plugin pipeline name produces diagnostic", () => {
  const pluginA = definePlugin({
    id: "pipeline-plugin-a",
    namespace: "pipelineA",
    setup: () => ({ pipelines: [{ name: "plugin.duplicate-pipeline", passes: [] }] }),
  });
  const pluginB = definePlugin({
    id: "pipeline-plugin-b",
    namespace: "pipelineB",
    setup: () => ({ pipelines: [{ name: "plugin.duplicate-pipeline", passes: [] }] }),
  });

  const { ctx } = createGen({ plugins: [pluginA, pluginB] });

  expect(ctx.diagnostics.some((d) => d.code === "plugin:duplicate-pipeline")).toBe(true);
});

test("plugin lowerings are registered in the kernel lowering registry", () => {
  const lowering = definePluginLowering({
    from_kind: "customWidget",
    to_kind: "entity",
    lower: (node) => node,
  });
  const plugin = definePlugin({
    id: "lowering-plugin",
    namespace: "loweringPlugin",
    setup: () => ({ lowerings: [lowering] }),
  });

  const { ctx } = createGen({ plugins: [plugin] });
  const registered = ctx.loweringRegistry.findFrom("customWidget");

  expect(registered).toHaveLength(1);
  expect(registered[0]!.to).toEqual(["entity"]);
});

test("duplicate dialect id produces diagnostic", () => {
  const sharedId = dialectId("dialect.plugin.shared");

  const dialectA = defineDialect({
    id: sharedId,
    label: "A",
    nodeKinds: [],
    edgeKinds: [],
    traits: [],
  });

  const dialectB = defineDialect({
    id: sharedId,
    label: "B",
    nodeKinds: [],
    edgeKinds: [],
    traits: [],
  });

  const pluginA = definePlugin({
    id: "plugin-a",
    namespace: "pluginA",
    setup: () => ({ dialects: [dialectA], passes: [] }),
  });

  const pluginB = definePlugin({
    id: "plugin-b",
    namespace: "pluginB",
    setup: () => ({ dialects: [dialectB], passes: [] }),
  });

  const { ctx } = createGen({ plugins: [pluginA, pluginB] });

  expect(ctx.diagnostics.some((d) => d.code === "plugin:duplicate-dialect-symbol")).toBe(true);
  // dialectA should be registered; dialectB should be rejected.
  expect(ctx.dialectRegistry.getById(sharedId)?.label).toBe("A");
});

test("duplicate node kind id across plugins produces diagnostic", () => {
  const sharedNodeKind = defineNodeKind({
    id: "node.kind.shared",
    dialect: "dialect.plugin.a",
    traits: [],
    metadata: { title: "Shared" },
  });

  const dialectA = defineDialect({
    id: dialectId("dialect.plugin.a"),
    label: "A",
    nodeKinds: [sharedNodeKind],
    edgeKinds: [],
    traits: [],
  });

  const dialectB = defineDialect({
    id: dialectId("dialect.plugin.b"),
    label: "B",
    nodeKinds: [sharedNodeKind],
    edgeKinds: [],
    traits: [],
  });

  const pluginA = definePlugin({
    id: "plugin-a",
    namespace: "pluginA",
    setup: () => ({ dialects: [dialectA], passes: [] }),
  });

  const pluginB = definePlugin({
    id: "plugin-b",
    namespace: "pluginB",
    setup: () => ({ dialects: [dialectB], passes: [] }),
  });

  const { ctx } = createGen({ plugins: [pluginA, pluginB] });

  expect(ctx.diagnostics.some((d) => d.code === "plugin:duplicate-dialect-symbol")).toBe(true);
  expect(ctx.dialectRegistry.getDialectForNodeKind("node.kind.shared")?.label).toBe("A");
});

test("duplicate trait id across plugins produces diagnostic", () => {
  const sharedTrait = defineTrait<true>("trait.shared", "Shared", "node");

  const dialectA = defineDialect({
    id: dialectId("dialect.plugin.a"),
    label: "A",
    nodeKinds: [],
    edgeKinds: [],
    traits: [sharedTrait],
  });

  const dialectB = defineDialect({
    id: dialectId("dialect.plugin.b"),
    label: "B",
    nodeKinds: [],
    edgeKinds: [],
    traits: [sharedTrait],
  });

  const pluginA = definePlugin({
    id: "plugin-a",
    namespace: "pluginA",
    setup: () => ({ dialects: [dialectA], passes: [] }),
  });

  const pluginB = definePlugin({
    id: "plugin-b",
    namespace: "pluginB",
    setup: () => ({ dialects: [dialectB], passes: [] }),
  });

  const { ctx } = createGen({ plugins: [pluginA, pluginB] });

  expect(ctx.diagnostics.some((d) => d.code === "plugin:duplicate-dialect-symbol")).toBe(true);
  expect(ctx.dialectRegistry.getDialectForTrait("trait.shared")?.label).toBe("A");
});

test("lifecycle.check resolves plugin dialect trait correctly", () => {
  const customTrait = defineTrait<true>("trait.custom.animatable", "Animatable", "node");
  const customNodeKind = defineNodeKind({
    id: "node.kind.animation",
    dialect: "dialect.plugin.anim",
    traits: [customTrait],
    metadata: { title: "Animation" },
  });

  const animDialect = defineDialect({
    id: dialectId("dialect.plugin.anim"),
    label: "Animation",
    nodeKinds: [customNodeKind],
    edgeKinds: [],
    traits: [customTrait],
  });

  const plugin = definePlugin({
    id: "anim-plugin",
    namespace: "anim",
    setup: () => ({ dialects: [animDialect], passes: [] }),
  });

  const { ctx } = createGen({ plugins: [plugin] });

  // Verify the dialect is registered before check.
  expect(ctx.dialectRegistry.getDialectForTrait(customTrait.id)).toBe(animDialect);

  // Run lifecycle check — should not crash on plugin dialects.
  const result = check(ctx);
  expect(result.status).not.toBe("has_errors");
});
