import { expect, test } from "vite-plus/test";
import { createGen, kernel } from "../src/index.ts";
import { registerEntityPasses } from "../src/entity/passes.ts";
import { fieldToKernelNode } from "../src/entity/kernel.ts";
import { graphNode } from "../src/kernel/index.ts";
import { attachGraphStep } from "../src/kernel/bridge.ts";

test("bindEntity records duplicate names before graph dedupe", () => {
  const { ctx, gen } = createGen();

  gen.entity("Duplicate", { id: gen.types.uuid() });
  gen.entity("Duplicate", { id: gen.types.uuid() });

  expect(ctx.diagnostics.some((d) => d.code === "entity:duplicate-name")).toBe(true);
});

test("verify-symbols.entity checks entity invariants from graph IR", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  (User as unknown as { transitions: unknown[] }).transitions = [
    {
      target_field: User.fields.id,
      transitions: [{ from_state: "pending", to_state: "done" }],
      terminal_states: [],
    },
  ];

  registerEntityPasses(ctx);
  const result = ctx.passRegistry.run(kernel.BUILT_IN_PASSES.VERIFY_SYMBOLS.ENTITY, ctx.graph, {});

  expect(result.diagnostics?.some((d) => d.code === "entity:transition-on-non-enum")).toBe(true);
});

test("verify-symbols.ref checks refs and entities from graph IR", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const staleField = {
    ...User.fields.id,
    name: "ghost",
    ref: {
      ...User.fields.id.ref,
      name: "ghost",
    },
  };

  attachGraphStep(ctx.graph, graphNode(fieldToKernelNode(staleField)));

  registerEntityPasses(ctx);
  const result = ctx.passRegistry.run(kernel.BUILT_IN_PASSES.VERIFY_SYMBOLS.REF, ctx.graph, {});

  expect(result.diagnostics?.some((d) => d.code === "entity:nonexistent-field")).toBe(true);
});
