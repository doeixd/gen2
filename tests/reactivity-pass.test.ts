import { expect, test } from "vite-plus/test";
import { createGen, lifecycle, kernel } from "../src/index.ts";
import {
  getReactiveMutationsFromGraph,
  getReactiveResourcesFromGraph,
  reactiveMutationToGraphFragment,
  reactiveResourceToGraphFragment,
} from "../src/reactivity/kernel.ts";
import type { PatchExpr } from "../src/function/index.ts";

const makeQueryResourceFixture = () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const query = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });
  const resource = gen.reactivity.resource({
    name: "userResource",
    query,
    refresh: [gen.reactivity.refresh.onInvalidate()],
  });

  return { ctx, gen, User, query, resource };
};

test("reactive resource graph reader recovers typed resource payloads", () => {
  const { resource } = makeQueryResourceFixture();
  const graph = kernel.graph.pipe(reactiveResourceToGraphFragment(resource));

  expect(getReactiveResourcesFromGraph(graph)).toEqual([resource]);
});

test("derive.reactivity.invalidates reports graph-backed unkeyed invalidate resources", () => {
  const { ctx } = makeQueryResourceFixture();

  const result = lifecycle.check(ctx);

  expect(result.diagnostics.some((d) => d.code === "reactivity:resource-query-unkeyed")).toBe(true);
});

test("derive.reactivity.optimisticPlans reports graph-backed empty optimistic apply patches", () => {
  const { ctx, gen, User, query } = makeQueryResourceFixture();
  const action = gen.func.action({
    name: "createUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionInsert(User, [
      [
        User.fields.id,
        gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "temp" }),
      ],
    ]),
  });
  const apply: PatchExpr = {
    kind: { kind: "optimistic_insert" },
    phase: "client",
    target_query: query.body,
    patch_items: [],
    rollback_strategy: "inverse",
  };
  const mutation = gen.reactivity.mutation({
    name: "createUserMutation",
    action,
    optimistic: gen.reactivity.optimistic({
      apply,
      rollback: gen.func.buildPatchDelete(query.body),
      fallback: { kind: "reject", reason: "test" },
    }),
  });

  expect(
    getReactiveMutationsFromGraph(kernel.graph.pipe(reactiveMutationToGraphFragment(mutation))),
  ).toEqual([mutation]);
  const result = lifecycle.check(ctx);

  expect(result.diagnostics.some((d) => d.code === "reactivity:optimistic-empty-apply")).toBe(true);
});
