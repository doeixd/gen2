import { expect, test } from "vite-plus/test";
import { api, createGen, kernel } from "../src/index.ts";
import {
  getMutatorsFromGraph,
  getRoutesFromGraph,
  mutatorToGraphFragment,
  routeToGraphFragment,
} from "../src/api/kernel.ts";
import { check } from "../src/lifecycle/lifecycle.ts";

test("API route and mutator graph readers recover typed payloads", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const route = api.defineRoute({
    method: { kind: "GET" },
    path: { segments: [{ kind: "literal", value: "/users" }], template: "/users" },
    handler: { kind: "static", static_func: undefined },
  });
  const mapping = gen.mapping(User, []);
  const mutator = api.defineMutator({
    name: "createUser",
    target_entity: User,
    input_fields: [User.fields.id],
    mapping,
    returns: { mapping, fields: [] },
  });

  const graph = kernel.graph.pipe(routeToGraphFragment(route), mutatorToGraphFragment(mutator));

  expect(getRoutesFromGraph(graph)).toEqual([route]);
  expect(getMutatorsFromGraph(graph)).toEqual([mutator]);
});

test("derive.api runs graph-native route diagnostics", () => {
  const { ctx, gen } = createGen();

  gen.api.route({
    method: { kind: "GET" },
    path: { segments: [{ kind: "literal", value: "/users" }], template: "/users" },
    handler: { kind: "query", action_func: undefined, static_func: undefined },
  });
  const result = check(ctx);

  expect(result.diagnostics.some((d) => d.code === "api:handler-kind-mismatch")).toBe(true);
});

test("derive.api runs graph-native mutator diagnostics", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const store1 = gen.store({ name: "s1", dialect: "postgres" });
  const store2 = gen.store({ name: "s2", dialect: "postgres" });
  const mapping = gen.mapping(User, []);

  gen.api.mutator({
    name: "createUser",
    target_entity: User,
    input_fields: [User.fields.id],
    mapping,
    returns: { mapping, fields: [] },
    written_stores: [store1, store2],
  });
  const result = check(ctx);

  expect(result.diagnostics.some((d) => d.code === "api:cross-store-transaction")).toBe(true);
});
