/**
 * Tests for lifecycle phases, context checking, plugin target hooks, cross-store
 * planner validation, write coordinator checks, and code generation.
 */
import { expect, test } from "vite-plus/test";
import { createGen, db, definePlugin, lifecycle, core } from "../src/index.ts";

test("standardPhases returns ordered lifecycle phases", () => {
  const phases = lifecycle.standardPhases();
  expect(phases).toHaveLength(5);
  expect(phases[0]!.name).toBe("collect_refs");
  expect(phases[4]!.name).toBe("generate");
});

test("check transitions context to ready when no errors", () => {
  const { ctx } = createGen();
  const result = lifecycle.check(ctx);
  expect(ctx.status).toBe("ready");
  expect(result.status).toBe("ok");
});

test("check validates registered entities in the context graph", () => {
  const { ctx, gen } = createGen();
  gen.entity("User", { id: gen.types.uuid() });
  gen.entity("User", { id: gen.types.uuid() });

  const result = lifecycle.check(ctx);

  expect(result.status).toBe("has_errors");
  expect(result.diagnostics.some((d) => d.code === "entity:duplicate-name")).toBe(true);
});

test("check validates registered stores in the context graph", () => {
  const { ctx, gen } = createGen();
  gen.store({ name: "cache", dialect: "totally-custom" });

  const result = lifecycle.check(ctx);

  expect(result.diagnostics.some((d) => d.code === "storage:unknown-dialect")).toBe(true);
});

test("check validates registered contracts, config entries, and actors", () => {
  const { ctx, gen } = createGen();
  gen.contract("Codec", [
    { name: "encode", input_type: "A", output_type: "B" },
    { name: "encode", input_type: "A", output_type: "B" },
  ]);
  gen.config.entry("DATABASE_URL", "url");
  gen.config.entry("DATABASE_URL", "url");
  gen.actor("User", "email", "Org");

  const result = lifecycle.check(ctx);

  expect(result.status).toBe("has_errors");
  expect(result.diagnostics.some((d) => d.code === "core:duplicate-contract-operation")).toBe(true);
  expect(result.diagnostics.some((d) => d.code === "core:duplicate-config-entry")).toBe(true);
  expect(result.diagnostics.some((d) => d.code === "core:actor-missing-context-type")).toBe(true);
});

test("check reports plugin invariant errors", () => {
  const a = definePlugin({ id: "a", namespace: "shared" });
  const b = definePlugin({ id: "b", namespace: "shared" });
  const { ctx } = createGen({ plugins: [a, b] });
  const result = lifecycle.check(ctx);
  expect(result.status).toBe("has_errors");
  expect(result.diagnostics.some((d) => d.code === "core:duplicate-namespace")).toBe(true);
});

test("generate skips codegen when check has errors", () => {
  const a = definePlugin({ id: "a", namespace: "shared" });
  const b = definePlugin({ id: "b", namespace: "shared" });
  const { ctx } = createGen({ plugins: [a, b] });
  const result = lifecycle.generate(ctx);
  expect(result.status).toBe("has_errors");
});

test("checkCrossStorePlanners requires more than one store", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const store = gen.store({ name: "s1", dialect: "postgres" });
  const planner = {
    name: "p1",
    query: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
    store_assignments: [
      {
        store,
        fields: [User.fields.id],
        local_query: gen.query.build({
          source: { kind: "entity_source", entity: User },
          result_type: gen.types.uuid(),
        }),
        runtime: gen.runtime({ name: "node" }),
      },
    ],
    composition_strategy: { kind: "server_composition" as const },
    fallback_policy: {
      kind: "allow" as const,
      pure_only: false,
      deterministic_only: false,
      effectful_ok: false,
    },
  };
  const diags = lifecycle.checkCrossStorePlanners([planner]);
  expect(diags.some((d) => d.code === "lifecycle:planner-too-few-stores")).toBe(true);
});

test("checkCrossStoreReadComposition requires explicit planner for cross-store queries", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const s1 = gen.store({ name: "s1", dialect: "postgres" });
  const s2 = gen.store({ name: "s2", dialect: "postgres" });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
    target_stores: [s1, s2],
  });
  const diags = lifecycle.checkCrossStoreReadComposition([q], []);
  expect(diags.some((d) => d.code === "lifecycle:cross-store-read-unplanned")).toBe(true);
});

test("checkCrossStoreWriteCoordinator rejects transactional multi-store writes", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const s1 = gen.store({ name: "s1", dialect: "postgres" });
  const s2 = gen.store({ name: "s2", dialect: "postgres" });
  const mapping = gen.mapping(User, []);
  const mutator = {
    name: "createUser",
    target_entity: User,
    input_fields: [User.fields.id],
    mapping,
    returns: { mapping, fields: [] },
    consistency: "transactional" as const,
    written_stores: [s1, s2],
    after: [],
    errors: [],
    invalidates: [],
    auth: undefined,
    optimistic: undefined,
  };
  const diags = lifecycle.checkCrossStoreWriteCoordinator([mutator]);
  expect(diags.some((d) => d.code === "lifecycle:cross-store-write-no-coordinator")).toBe(true);
});

test("query.from(...).build() registers built queries on the context", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const q = gen.query.from(User).select([User.fields.id]).build();

  expect(ctx.queries).toContain(q);
});

test("check reports targets whose owning plugin is missing", () => {
  const { ctx } = createGen();
  ctx.targets.push(
    core.makeTarget({
      name: "orphan",
      plugin_id: "missing/plugin",
      accepts_inputs: ["schema"],
    }),
  );

  const result = lifecycle.check(ctx);

  expect(result.status).toBe("has_errors");
  expect(result.diagnostics.some((d) => d.code === "core:target-plugin-missing")).toBe(true);
});

test("check executes plugin-contributed target checks", () => {
  const plugin = definePlugin({
    id: "plugin/checked",
    namespace: "checked",
    setup: () => ({
      targets: [
        {
          name: "checked-target",
          accepts_inputs: ["schema"],
          check: (input) =>
            input && typeof input === "object" && "name" in input
              ? [
                  {
                    severity: "warning" as const,
                    code: "plugin:target-check-fired",
                    message: `checked ${(input as { name: string }).name}`,
                    refs: [],
                  },
                ]
              : [],
        },
      ],
      checks: [
        {
          name: "schema-check",
          target_kind: "schema",
          check_fn: () => [
            {
              severity: "warning" as const,
              code: "plugin:hook-check-fired",
              message: "hook ran",
              refs: [],
            },
          ],
        },
      ],
    }),
  });

  const { ctx } = createGen({ plugins: [plugin] });
  const target = ctx.targets[0]!;
  core.acceptTargetInput(target, core.makeTargetInput({ name: "AppSchema", kind: "schema" }));

  const result = lifecycle.check(ctx);

  expect(result.status).toBe("has_warnings");
  expect(result.diagnostics.some((d) => d.code === "plugin:target-check-fired")).toBe(true);
  expect(result.diagnostics.some((d) => d.code === "plugin:hook-check-fired")).toBe(true);
  expect(ctx.targets[0]!.check_result?.status).toBe("has_warnings");
});

test("generate applies plugin codegen hooks and artifact transforms", () => {
  const plugin = definePlugin({
    id: "plugin/generated",
    namespace: "generated",
    setup: () => ({
      targets: [
        {
          name: "generated-target",
          accepts_inputs: ["schema"],
          generate: (input) => [
            {
              path: `${(input as { name: string }).name}.ts`,
              content: "base",
              kind: "source" as const,
              diagnostics: [],
            },
          ],
        },
      ],
      codegen_hooks: [
        {
          name: "extra-artifact",
          target_kind: "schema",
          generate_fn: (input) => [
            {
              path: `${(input as { name: string }).name}.extra.ts`,
              content: "extra",
              kind: "source" as const,
              diagnostics: [],
            },
          ],
        },
      ],
      artifact_transforms: [
        {
          name: "append-transform",
          transform_fn: (artifact) => ({ ...artifact, content: `${artifact.content}!` }),
        },
      ],
    }),
  });

  const { ctx } = createGen({ plugins: [plugin] });
  const target = ctx.targets[0]!;
  core.acceptTargetInput(target, core.makeTargetInput({ name: "AppSchema", kind: "schema" }));

  const result = lifecycle.generate(ctx);

  expect(result.status).toBe("ok");
  expect(result.artifacts).toHaveLength(2);
  expect(result.artifacts.map((a) => a.path).sort()).toEqual([
    "AppSchema.extra.ts",
    "AppSchema.ts",
  ]);
  expect(result.artifacts.every((a) => a.content.endsWith("!"))).toBe(true);
});

test("schema target inputs can be attached to targets through core helpers", () => {
  const plugin = definePlugin({
    id: "plugin/schema-target",
    namespace: "schema-target",
    setup: () => ({
      targets: [
        {
          name: "schema-target",
          accepts_inputs: ["schema"],
          check: (input) =>
            (input as { value?: { store?: { name?: string } } }).value?.store?.name === "primary"
              ? []
              : [
                  {
                    severity: "error" as const,
                    code: "plugin:missing-schema-payload",
                    message: "schema payload missing",
                    refs: [],
                  },
                ],
        },
      ],
    }),
  });

  const { ctx, gen } = createGen({
    plugins: [plugin, db({ stores: { primary: { dialect: "postgres" } }, default: "primary" })],
  });
  const pluginGen = gen as typeof gen & {
    db: {
      schema: (input: { tables?: readonly [] }) => import("../src/storage/index.ts").StoreSchema;
    };
  };
  const schema = pluginGen.db.schema({ tables: [] });
  const input = gen.schemaInput(schema);

  core.acceptTargetInput(ctx.targets[0]!, input);

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "plugin:missing-schema-payload")).toBe(false);
});
