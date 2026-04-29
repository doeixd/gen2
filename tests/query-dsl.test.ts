/**
 * Tests for the query DSL, including query-backed fields, query plans, query
 * planners, and cross-store query construction.
 */
import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";

test("queryBackedField creates a QueryBackedField", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.email(),
  });

  const qbf = gen.query.queryBackedField(User.fields.email, q, User);

  expect(qbf.field).toBe(User.fields.email);
  expect(qbf.query).toBe(q);
  expect(qbf.entity).toBe(User);
});

test("createQueryPlan builds a QueryPlan with defaults", () => {
  const { gen } = createGen();
  gen.entity("User", { id: gen.types.uuid() });
  const plan = gen.query.createQueryPlan([], {
    cross_store_reads: true,
  });

  expect(plan.assignments).toHaveLength(0);
  expect(plan.cross_store_reads).toBe(true);
  expect(plan.joins_required).toBe(false);
  expect(plan.fallback_policy.kind).toBe("deny");
});

test("createQueryPlanner pairs a query with a plan", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
  });
  const plan = gen.query.createQueryPlan([]);

  const planner = gen.query.createQueryPlanner("userPlanner", q, plan);

  expect(planner.name).toBe("userPlanner");
  expect(planner.query).toBe(q);
  expect(planner.plan).toBe(plan);
});

test("crossStoreQuery creates a CrossStoreQuery", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
  });

  const csq = gen.query.crossStoreQuery(q, [], "materialized_view");

  expect(csq.query).toBe(q);
  expect(csq.store_plans).toHaveLength(0);
  expect(csq.composition_strategy).toBe("materialized_view");
});
