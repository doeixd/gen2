import { describe, expectTypeOf, test } from "vite-plus/test";
import { core, types } from "../src/index.ts";

describe("node protocol inference", () => {
  test("StaticNode exposes generic input and output phantoms", () => {
    type Node = core.StaticNode<"demo.callable", string, number, never, "db", "email">;

    expectTypeOf<core.InferNodeInput<Node>>().toEqualTypeOf<string>();
    expectTypeOf<core.InferNodeOutput<Node>>().toEqualTypeOf<number>();
    expectTypeOf<core.InferNodeRequirements<Node>>().toEqualTypeOf<"db">();
    expectTypeOf<core.InferNodeEffects<Node>>().toEqualTypeOf<"email">();
  });

  test("callPlan preserves input and output types", () => {
    const plan = core.callPlan({ input: types.string(), output: types.int() });

    expectTypeOf(plan).toMatchTypeOf<core.CallPlan<string, number>>();
  });

  test("plugin traits are accepted as trait kinds", () => {
    type PluginTrait = core.PluginTraitKind<"demo", "workflow">;
    type Node = core.StaticNode<
      "demo.workflow",
      unknown,
      unknown,
      never,
      never,
      never,
      readonly [PluginTrait]
    >;

    expectTypeOf<core.InferNodeTraits<Node>>().toEqualTypeOf<readonly [PluginTrait]>();
  });
});
