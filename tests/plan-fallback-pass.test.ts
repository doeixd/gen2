import { expect, test } from "vite-plus/test";
import { createGen, lifecycle, kernel } from "../src/index.ts";
import { getPlanFunctionsFromGraph, planFunctionToGraphFragment } from "../src/function/kernel.ts";

const makeFallbackPlan = () => {
  const { ctx, gen } = createGen();
  const intType = gen.types.int();
  const plan = gen.func.plan({
    name: "fallbackPlan",
    input_type: intType,
    output_type: intType,
    body: {
      kind: { kind: "fallback" as const },
      phase: "query" as const,
      primary: {
        ...gen.expr.literal(intType, { kind: "integer", integer_value: 1 }),
        effects: [{ kind: "db_read" }],
      },
      fallback: {
        kind: { kind: "fallback" as const },
        phase: "query" as const,
        primary: gen.expr.literal(intType, { kind: "integer", integer_value: 2 }),
        fallback_policy: {
          kind: "allow" as const,
          pure_only: false,
          deterministic_only: false,
          effectful_ok: false,
        },
        runtime_assignments: [],
      },
      fallback_policy: {
        kind: "allow" as const,
        pure_only: false,
        deterministic_only: false,
        effectful_ok: false,
      },
      runtime_assignments: [],
    },
    fallback_policy: {
      kind: "allow" as const,
      pure_only: false,
      deterministic_only: false,
      effectful_ok: false,
    },
  });

  return { ctx, plan };
};

test("plan function graph reader recovers typed plan payloads", () => {
  const { plan } = makeFallbackPlan();
  const graph = kernel.graph.pipe(planFunctionToGraphFragment(plan));

  expect(getPlanFunctionsFromGraph(graph)).toEqual([plan]);
});

test("legalize.planFallback reports graph-backed silent effectful fallbacks", () => {
  const { ctx } = makeFallbackPlan();

  const result = lifecycle.check(ctx);

  expect(result.diagnostics.some((d) => d.code === "runtime:silent-effectful-fallback")).toBe(true);
});
