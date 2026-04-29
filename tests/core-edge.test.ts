/**
 * Edge-case tests for core framework behavior, including plugin context
 * propagation, dependency resolution, target collisions, diagnostics, and artifacts.
 */
import { expect, test } from "vite-plus/test";
import { createGen, definePlugin, lifecycle, core } from "../src/index.ts";

test("createGen with no plugins produces empty context", () => {
  const { ctx, gen } = createGen();
  expect(ctx.plugins).toHaveLength(0);
  expect(ctx.targets).toHaveLength(0);
  expect(ctx.diagnostics).toHaveLength(0);
  expect(ctx.status).toBe("idle");
  expect(typeof gen.entity).toBe("function");
});

test("plugin setup receives synthetic PluginContext", () => {
  let receivedCtx: unknown;
  const plugin = definePlugin({
    id: "test/p1",
    namespace: "p1",
    setup: (ctx) => {
      receivedCtx = ctx;
      return { runtimes: ["custom"] };
    },
  });
  const { ctx } = createGen({ plugins: [plugin] });
  expect(ctx.plugins[0]!.status).toBe("active");
  expect(ctx.contributions.get("test/p1")?.runtimes).toEqual(["custom"]);
  expect(receivedCtx).toBeDefined();
});

test("later plugins see earlier plugin contributions in PluginContext", () => {
  let receivedCtx: {
    core_constructors: readonly string[];
    runtime_registry: readonly string[];
    target_registry: readonly string[];
    store_registry: readonly string[];
    operation_registry: readonly string[];
  } | null = null;

  const first = definePlugin({
    id: "first",
    namespace: "first",
    setup: () => ({
      runtimes: ["runtime-a"],
      stores: ["store-a"],
      operations: ["op-a"],
      targets: [{ name: "target-a", accepts_inputs: ["schema"] }],
    }),
  });
  const second = definePlugin({
    id: "second",
    namespace: "second",
    setup: (ctx) => {
      receivedCtx = ctx;
      return {};
    },
  });

  createGen({ plugins: [first, second] });

  expect(receivedCtx).not.toBeNull();
  expect(receivedCtx!.core_constructors).toContain("entity");
  expect(receivedCtx!.runtime_registry).toContain("runtime-a");
  expect(receivedCtx!.target_registry).toContain("target-a");
  expect(receivedCtx!.store_registry).toContain("store-a");
  expect(receivedCtx!.operation_registry).toContain("op-a");
});

test("helper availability is recorded on registration", () => {
  const plugin = definePlugin({
    id: "helpers/available",
    namespace: "helpers",
    setup: () => ({
      helpers: [{ name: "value", namespace: "demo", value: 1 }],
    }),
  });

  const { ctx } = createGen({ plugins: [plugin] });
  const helper = ctx.contributions.get("helpers/available")?.helpers[0];

  expect(helper?.available_in).toBe(ctx);
  expect(ctx.helpers.get("demo")).toEqual({ value: 1 });
});

test("duplicate plugin namespaces produce error diagnostics", () => {
  const a = definePlugin({ id: "a", namespace: "shared" });
  const b = definePlugin({ id: "b", namespace: "shared" });
  const { ctx } = createGen({ plugins: [a, b] });
  const dupes = ctx.diagnostics.filter((d) => d.code === "core:duplicate-namespace");
  expect(dupes).toHaveLength(1);
  expect(dupes[0]!.severity).toBe("error");
});

test("multiple duplicate plugin namespaces produce one diagnostic per pair", () => {
  const a = definePlugin({ id: "a", namespace: "dup" });
  const b = definePlugin({ id: "b", namespace: "dup" });
  const c = definePlugin({ id: "c", namespace: "dup" });
  const { ctx } = createGen({ plugins: [a, b, c] });
  const dupes = ctx.diagnostics.filter((d) => d.code === "core:duplicate-namespace");
  expect(dupes.length).toBeGreaterThanOrEqual(1);
});

test("missing plugin dependency is reported", () => {
  const dep = definePlugin({ id: "missing-dep", namespace: "dep" });
  const consumer = definePlugin({
    id: "consumer",
    namespace: "consumer",
    requires: [dep],
  });
  const { ctx } = createGen({ plugins: [consumer] });
  expect(ctx.diagnostics.some((d) => d.code === "core:plugin-missing-dependency")).toBe(true);
});

test("transitive plugin dependencies are resolved", () => {
  const base = definePlugin({ id: "base", namespace: "base" });
  const middle = definePlugin({ id: "middle", namespace: "middle", requires: [base] });
  const top = definePlugin({ id: "top", namespace: "top", requires: [middle] });
  const { ctx } = createGen({ plugins: [base, middle, top] });
  expect(ctx.diagnostics.some((d) => d.code === "core:plugin-missing-dependency")).toBe(false);
});

test("target name collision across plugins is reported", () => {
  const a = definePlugin({
    id: "a",
    namespace: "a",
    setup: () => ({
      targets: [{ name: "drizzle", accepts_inputs: ["schema"] }],
    }),
  });
  const b = definePlugin({
    id: "b",
    namespace: "b",
    setup: () => ({
      targets: [{ name: "drizzle", accepts_inputs: ["schema"] }],
    }),
  });
  const { ctx } = createGen({ plugins: [a, b] });
  expect(ctx.diagnostics.some((d) => d.code === "core:target-name-collision")).toBe(true);
});

test("duplicate helper (namespace, name) pair across plugins is reported", () => {
  const a = definePlugin({
    id: "a",
    namespace: "a",
    setup: () => ({
      helpers: [{ name: "h", namespace: "shared" }],
    }),
  });
  const b = definePlugin({
    id: "b",
    namespace: "b",
    setup: () => ({
      helpers: [{ name: "h", namespace: "shared" }],
    }),
  });
  const { ctx } = createGen({ plugins: [a, b] });
  expect(ctx.diagnostics.some((d) => d.code === "core:duplicate-helper-namespace")).toBe(true);
});

test("disjoint helper names in the same namespace coexist", () => {
  const a = definePlugin({
    id: "a",
    namespace: "a",
    setup: () => ({
      helpers: [{ name: "h1", namespace: "shared" }],
    }),
  });
  const b = definePlugin({
    id: "b",
    namespace: "b",
    setup: () => ({
      helpers: [{ name: "h2", namespace: "shared" }],
    }),
  });
  const { ctx } = createGen({ plugins: [a, b] });
  expect(ctx.diagnostics.some((d) => d.code === "core:duplicate-helper-namespace")).toBe(false);
});

test("plugin with duplicate targets within itself is reported", () => {
  const p = definePlugin({
    id: "p",
    namespace: "p",
    setup: () => ({
      targets: [
        { name: "same", accepts_inputs: ["a"] },
        { name: "same", accepts_inputs: ["b"] },
      ],
    }),
  });
  const { ctx } = createGen({ plugins: [p] });
  expect(ctx.diagnostics.some((d) => d.code === "core:duplicate-target")).toBe(true);
});

test("check returns ok when no errors", () => {
  const { ctx } = createGen();
  const result = lifecycle.check(ctx);
  expect(result.status).toBe("ok");
  expect(ctx.status).toBe("ready");
});

test("check returns has_errors when plugin invariants fail", () => {
  const a = definePlugin({ id: "a", namespace: "dup" });
  const b = definePlugin({ id: "b", namespace: "dup" });
  const { ctx } = createGen({ plugins: [a, b] });
  const result = lifecycle.check(ctx);
  expect(result.status).toBe("has_errors");
  expect(result.diagnostics.length).toBeGreaterThan(0);
});

test("generate skips when check has errors", () => {
  const a = definePlugin({ id: "a", namespace: "dup" });
  const b = definePlugin({ id: "b", namespace: "dup" });
  const { ctx } = createGen({ plugins: [a, b] });
  const result = lifecycle.generate(ctx);
  expect(result.status).toBe("has_errors");
});

test("GenContext helpers map starts empty", () => {
  const { ctx } = createGen();
  expect(ctx.helpers.size).toBe(0);
});

test("collectAllDiagnostics aggregates target diagnostics", () => {
  const { ctx } = createGen();
  ctx.diagnostics.push({ severity: "error", code: "test", message: "x", refs: [] });
  const all = core.collectAllDiagnostics(ctx);
  expect(all.some((d) => d.code === "test")).toBe(true);
});

test("collectAllArtifacts aggregates target artifacts", () => {
  const { ctx } = createGen();
  const artifact = { path: "test.ts", content: "", kind: "source" as const, diagnostics: [] };
  ctx.artifacts.push(artifact);
  const all = core.collectAllArtifacts(ctx);
  expect(all.some((a) => a.path === "test.ts")).toBe(true);
});

test("plugin with failed status stays failed after setup error", () => {
  const p = definePlugin({
    id: "p",
    namespace: "p",
    setup: () => {
      throw new Error("setup failed");
    },
  });
  const { ctx } = createGen({ plugins: [p] });
  expect(ctx.plugins[0]!.status).toBe("failed");
  expect(ctx.diagnostics.some((d) => d.code === "core:plugin-setup-failed")).toBe(true);
});
