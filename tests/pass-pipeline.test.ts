/**
 * R10 pass pipeline tests.
 *
 * Verifies PassPhase expansion, PassRegistry, pipeline definitions,
 * and lifecycle.check integration.
 */

import { expect, expectTypeOf, test } from "vite-plus/test";
import { createGen, definePlugin } from "../src/index.ts";
import { acceptTargetInput, makeTarget, makeTargetInput } from "../src/core/target.ts";
import { TARGET_LEGALIZES_INPUT_EDGE_KIND } from "../src/dialects/target.ts";
import { attachEdge, attachNode } from "../src/kernel/bridge.ts";
import {
  defineEdge,
  defineNode,
  endpointRoles,
  graphPatch,
  definePipeline,
  previewPassPipeline,
  runPassPipeline,
  runNamedPipeline,
  PIPELINES,
  BUILT_IN_PASSES,
  type PassPhase,
  PassRegistry,
  PipelineRegistry,
} from "../src/kernel/index.ts";
import {
  registerBuiltInPasses,
  check,
  generate,
  targetPipelineForTarget,
} from "../src/lifecycle/lifecycle.ts";

test("PassPhase includes all R10 phases", () => {
  const phases: PassPhase[] = [
    "verify-symbols",
    "verify-dialects",
    "derive",
    "canonicalize",
    "legalize",
    "lower",
    "emit",
  ];
  // If any phase is missing from the type, this line will error.
  expect(phases.length).toBe(7);
});

test("GenContext has a PassRegistry", () => {
  const { ctx } = createGen();
  expect(ctx.passRegistry).toBeInstanceOf(PassRegistry);
});

test("GenContext has a PipelineRegistry with built-in pipelines", () => {
  const { ctx } = createGen();
  expect(ctx.pipelineRegistry).toBeInstanceOf(PipelineRegistry);
  expect(ctx.pipelineRegistry.has(PIPELINES.CHECK.name)).toBe(true);
  expect(ctx.pipelineRegistry.has(PIPELINES.POSTGRES.name)).toBe(true);
});

test("registerBuiltInPasses populates the registry", () => {
  const { ctx } = createGen();
  registerBuiltInPasses(ctx);

  expect(ctx.passRegistry.has(PIPELINES.CHECK.passes[0]!)).toBe(true);
  expect(ctx.passRegistry.has(PIPELINES.CHECK.passes[15]!)).toBe(true);
  expect(ctx.passRegistry.list().length).toBeGreaterThanOrEqual(16);
});

test("runPassPipeline runs registered passes and reports success", () => {
  const registry = new PassRegistry();
  registry.register({ name: "test.verify", phase: "verify-symbols" }, () => ({ success: true }));
  registry.register({ name: "test.derive", phase: "derive" }, () => ({ success: true }));

  const result = runPassPipeline(["test.verify", "test.derive"], {} as any, registry);
  expect(result.success).toBe(true);
  expect(result.diagnostics).toHaveLength(0);
});

test("definePipeline preserves literal name and pass tuple", () => {
  const pipeline = definePipeline("custom.typed", ["test.verify", "test.derive"] as const);

  expect(pipeline.name).toBe("custom.typed");
  expect(pipeline.passes).toEqual(["test.verify", "test.derive"]);
  expectTypeOf(pipeline.name).toEqualTypeOf<"custom.typed">();
  expectTypeOf(pipeline.passes).toEqualTypeOf<readonly ["test.verify", "test.derive"]>();
  expectTypeOf(pipeline.$infer?.name).toEqualTypeOf<"custom.typed" | undefined>();
  expectTypeOf(pipeline.$infer?.passes).toEqualTypeOf<
    readonly ["test.verify", "test.derive"] | undefined
  >();
});

test("runPassPipeline and previewPassPipeline accept typed pipeline witnesses", () => {
  const registry = new PassRegistry();
  registry.register({ name: "test.verify", phase: "verify-symbols" }, () => ({ success: true }));
  registry.register({ name: "test.derive", phase: "derive" }, () => ({ success: true }));
  const pipeline = definePipeline("custom.typed", ["test.verify", "test.derive"] as const);

  const result = runPassPipeline(pipeline, {} as any, registry);
  const preview = previewPassPipeline(pipeline, {} as any, registry);

  expect(result.success).toBe(true);
  expect(preview.result.success).toBe(true);
});

test("gen.preview.pipeline accepts typed pipeline witnesses", () => {
  const { ctx, gen } = createGen();
  ctx.passRegistry.register({ name: "test.preview.typed", phase: "derive" }, () => ({
    success: true,
    explanations: [{ message: "typed preview" }],
  }));
  const pipeline = definePipeline("custom.preview", ["test.preview.typed"] as const);

  const preview = gen.preview.pipeline(pipeline);

  expect(preview.result.success).toBe(true);
  expect(preview.summary.explanations[0]?.message).toBe("typed preview");
});

test("previewPassPipeline returns raw result plus structured stage summary", () => {
  const registry = new PassRegistry();
  const node = defineNode({ id: "node.kind.preview", label: "Preview" }, "node:preview");
  registry.register({ name: "test.preview", phase: "derive" }, (graph) => ({
    success: true,
    modifiedGraph: graph,
    patches: [graphPatch.addNode(node, { source: "derivation", name: "test.preview" })],
    explanations: [{ message: "previewed test node" }],
  }));

  const preview = previewPassPipeline(["test.preview"], {} as any, registry);

  expect(preview.result.success).toBe(true);
  expect(preview.summary.patchCount).toBe(1);
  expect(preview.summary.patches[0]).toMatchObject({
    op: "addNode",
    kind: "node.kind.preview",
    provenance: "test.preview",
  });
  expect(preview.summary.explanations[0]?.message).toBe("previewed test node");
});

test("runPassPipeline reports failure on missing pass", () => {
  const registry = new PassRegistry();
  const result = runPassPipeline(["missing.pass"], {} as any, registry);
  expect(result.success).toBe(false);
  expect(result.diagnostics?.[0]?.code).toBe("pass:not-found");
});

test("runNamedPipeline resolves pipelines from registry", () => {
  const passRegistry = new PassRegistry();
  const pipelineRegistry = new PipelineRegistry([{ name: "custom", passes: ["custom.pass"] }]);
  passRegistry.register({ name: "custom.pass", phase: "emit" }, () => ({ success: true }));

  const result = runNamedPipeline("custom", {} as any, passRegistry, { pipelineRegistry });

  expect(result.success).toBe(true);
});

test("runNamedPipeline reports missing named pipeline", () => {
  const result = runNamedPipeline("missing", {} as any, new PassRegistry(), {
    pipelineRegistry: new PipelineRegistry(),
  });

  expect(result.success).toBe(false);
  expect(result.diagnostics?.[0]?.code).toBe("pipeline:not-found");
});

test("PIPELINES.CHECK contains 16 passes", () => {
  expect(PIPELINES.CHECK.passes.length).toBe(16);
  expect(PIPELINES.CHECK.name).toBe("gen2-check");
});

test("PIPELINES.POSTGRES extends check with lower and emit", () => {
  expect(PIPELINES.POSTGRES.name).toBe("gen2-postgres");
  expect(PIPELINES.POSTGRES.passes).toContain(BUILT_IN_PASSES.LOWER.ENTITY_TO_TABLE);
  expect(PIPELINES.POSTGRES.passes).toContain(BUILT_IN_PASSES.EMIT.SQL);
});

test("targetPipelineForTarget runs bridge lower before bridge emit", () => {
  const target = makeTarget({
    name: "custom-target",
    plugin_id: "plugin/custom",
    accepts_inputs: ["schema"],
  });

  expect(targetPipelineForTarget(target)).toEqual({
    name: "gen2-target:custom-target",
    passes: ["lower.bridge.custom-target", "emit.bridge.custom-target"],
  });
});

test("lifecycle.generate records target legalization in the graph", () => {
  const plugin = definePlugin({
    id: "plugin/legalized",
    namespace: "legalized",
    setup: () => ({
      targets: [
        {
          name: "legalized-target",
          accepts_inputs: ["schema"],
          generate: () => [
            {
              path: "out.ts",
              content: "export {};",
              kind: "source" as const,
              diagnostics: [],
            },
          ],
        },
      ],
    }),
  });
  const { ctx } = createGen({
    plugins: [plugin],
  });
  const target = ctx.targets[0]!;
  acceptTargetInput(target, makeTargetInput({ name: "AppSchema", kind: "schema" }));

  const result = generate(ctx);

  expect(result.status).toBe("ok");
  expect(result.artifacts).toHaveLength(1);
  expect(
    Array.from(ctx.graph.edges.values()).some(
      (edge) => edge.kind.id === TARGET_LEGALIZES_INPUT_EDGE_KIND.id,
    ),
  ).toBe(true);
  expect(ctx.passRegistry.has("lower.bridge.legalized-target")).toBe(true);
  expect(ctx.passRegistry.has("emit.bridge.legalized-target")).toBe(true);
  expect(ctx.pipelineRegistry.has("gen2-target:legalized-target")).toBe(true);
});

test("lifecycle.check runs pass pipeline without duplicate diagnostics", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.relation({
    name: "UserPosts",
    from_entity: User,
    to_entity: User,
    kind: "one_to_many",
    from_field: User.fields.id,
    to_field: User.fields.id,
  });

  // check() runs both pass pipeline and module checkers with deduplication.
  const result = check(ctx);

  // Diagnostics should be present but not duplicated.
  const crossStoreCodes = result.diagnostics.filter((d) => d.code === "relations:cross-store-fk");
  expect(crossStoreCodes.length).toBeLessThanOrEqual(1);
});

test("lifecycle.check warns when graph kinds are not owned by a dialect", () => {
  const { ctx } = createGen();
  attachNode(
    ctx.graph,
    defineNode({ id: "node.kind.pluginMissing", label: "Missing plugin kind" }, "missing-node"),
  );
  attachEdge(
    ctx.graph,
    defineEdge({ id: "edge.kind.pluginMissing", label: "Missing plugin edge" }, "missing-edge", [
      {
        role: endpointRoles.SOURCE,
        target: { kind: "node", id: "missing-node" },
        cardinality: "one",
      },
    ]),
  );

  const result = check(ctx);

  expect(result.diagnostics.some((d) => d.code === "dialect:unknown-node-kind")).toBe(true);
  expect(result.diagnostics.some((d) => d.code === "dialect:unknown-edge-kind")).toBe(true);
});
