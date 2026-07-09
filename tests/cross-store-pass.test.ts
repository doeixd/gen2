import { expect, test } from "vite-plus/test";
import { createGen, lifecycle, kernel } from "../src/index.ts";
import type { CrossStorePlanner } from "../src/lifecycle/index.ts";
import { attachGraphStep } from "../src/kernel/bridge.ts";

const makeCrossStoreFixture = () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  const primary = gen.store({ name: "primary", dialect: "postgres" });
  const analytics = gen.store({ name: "analytics", dialect: "postgres" });
  const runtime = gen.runtime({ name: "server", capabilities: [] });
  const query = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
    projection: {
      fields: [{ field: User.fields.id }],
      aggregates: [],
    },
    target_stores: [primary, analytics],
  });
  const planner = {
    name: "userCrossStore",
    query,
    store_assignments: [
      { store: primary, fields: [User.fields.id], local_query: query, runtime },
      { store: analytics, fields: [], local_query: query, runtime },
    ],
    composition_strategy: { kind: "server_composition" as const, coordinator: runtime },
    fallback_policy: {
      kind: "allow" as const,
      pure_only: false,
      deterministic_only: false,
      effectful_ok: false,
    },
  } satisfies CrossStorePlanner;

  return { ctx, query, planner };
};

test("cross-store planner graph reader recovers typed planner payloads", () => {
  const { planner } = makeCrossStoreFixture();
  const graph = kernel.graph.pipe(lifecycle.crossStorePlannerToGraphFragment(planner));

  expect(lifecycle.getCrossStorePlannersFromGraph(graph)).toEqual([planner]);
});

test("legalize.crossStore.reads reports graph-backed cross-store queries without planners", () => {
  const { ctx } = makeCrossStoreFixture();

  const result = lifecycle.check(ctx);

  expect(result.status).toBe("has_errors");
  expect(result.diagnostics.some((d) => d.code === "lifecycle:cross-store-read-unplanned")).toBe(
    true,
  );
});

test("legalize.crossStore.reads accepts graph-backed cross-store planners", () => {
  const { ctx, planner } = makeCrossStoreFixture();
  attachGraphStep(ctx.graph, lifecycle.crossStorePlannerToGraphFragment(planner));

  const result = lifecycle.check(ctx);

  expect(result.diagnostics.some((d) => d.code === "lifecycle:cross-store-read-unplanned")).toBe(
    false,
  );
});

test("legalize.crossStore.planners validates graph-backed planner payloads", () => {
  const { ctx, planner } = makeCrossStoreFixture();
  attachGraphStep(
    ctx.graph,
    lifecycle.crossStorePlannerToGraphFragment({
      ...planner,
      name: "underPlanned",
      store_assignments: [planner.store_assignments[0]!],
    }),
  );

  const result = lifecycle.check(ctx);

  expect(result.diagnostics.some((d) => d.code === "lifecycle:planner-too-few-stores")).toBe(true);
});

test("legalize.crossStore.writes reports graph-backed transactional multi-store mutators", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const primary = gen.store({ name: "primary", dialect: "postgres" });
  const analytics = gen.store({ name: "analytics", dialect: "postgres" });
  const mapping = gen.mapping(User, []);

  gen.api.mutator({
    name: "createUser",
    target_entity: User,
    input_fields: [User.fields.id],
    mapping,
    returns: { mapping, fields: [] },
    consistency: "transactional",
    written_stores: [primary, analytics],
  });

  const result = lifecycle.check(ctx);

  expect(
    result.diagnostics.some((d) => d.code === "lifecycle:cross-store-write-no-coordinator"),
  ).toBe(true);
});
