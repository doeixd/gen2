import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import { getGettersFromGraph } from "../src/api/kernel.ts";
import { check } from "../src/lifecycle/lifecycle.ts";

test("getter graph reader recovers typed getter payloads", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const mapping = gen.mapping(User, []);
  const getter = gen.api.getter({
    name: "getUser",
    target_entity: User,
    by_field: User.fields.id,
    projection: { mapping, fields: [] },
  });

  expect(getGettersFromGraph(ctx.graph)).toEqual([getter]);
});

test("derive.auth.guards runs graph-native getter policy diagnostics", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const mapping = gen.mapping(User, []);

  gen.api.getter({
    name: "getUser",
    target_entity: User,
    by_field: User.fields.id,
    projection: { mapping, fields: [] },
    auth: { action: "read", policy_name: "missing" },
  });

  const result = check(ctx);

  expect(result.diagnostics.some((d) => d.code === "authz:policy-entity-mismatch")).toBe(true);
});

test("derive.auth.guards runs graph-native mutator policy diagnostics", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const mapping = gen.mapping(User, []);

  gen.api.mutator({
    name: "createUser",
    target_entity: User,
    input_fields: [User.fields.id],
    mapping,
    returns: { mapping, fields: [] },
    auth: { action: "create", policy_name: "missing" },
  });

  const result = check(ctx);

  expect(result.diagnostics.some((d) => d.code === "authz:policy-entity-mismatch")).toBe(true);
});
