/**
 * Tests for API handler construction and route/mutator invariant checks,
 * including handler kind mismatches, cross-store transactional mutators,
 * read-only field exposure, and server-only field constraints.
 */
import { expect, test } from "vite-plus/test";
import { createGen, api } from "../src/index.ts";

test("buildQueryHandler produces a discriminated handler", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const qf = {
    name: "getUser",
    input_type: gen.types.uuid(),
    input_fields: [User.fields.id],
    returns: gen.types.uuid(),
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
    errors: [],
    requirements: [],
    target_runtimes: [],
  };
  const h = gen.api.buildQueryHandler(qf);
  expect(h.kind).toBe("query");
  expect(h.query_func).toBe(qf);
});

test("checkApi flags handler kind mismatch", () => {
  createGen();
  const route = {
    method: { kind: "GET" as const },
    path: { segments: [{ kind: "literal" as const, value: "/users" }], template: "/users" },
    handler: {
      kind: "query" as const,
      action_func: undefined,
      static_func: undefined,
    },
    parameters: [],
  };
  const diags = api.checkApi([route], []);
  expect(diags.some((d) => d.code === "api:handler-kind-mismatch")).toBe(true);
});

test("checkApi flags cross-store transactional mutator", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const store1 = gen.store({ name: "s1", dialect: "postgres" });
  const store2 = gen.store({ name: "s2", dialect: "postgres" });
  const mapping = gen.mapping(User, []);
  const mutator = {
    name: "createUser",
    target_entity: User,
    input_fields: [User.fields.id],
    mapping,
    returns: { mapping, fields: [] },
    consistency: "transactional" as const,
    written_stores: [store1, store2],
    after: [],
    errors: [],
    invalidates: [],
    auth: undefined,
    optimistic: undefined,
  };
  const diags = api.checkApi([], [mutator]);
  expect(diags.some((d) => d.code === "api:cross-store-transaction")).toBe(true);
});

test("checkApi flags read-only field in mutator input", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: { type: gen.types.uuid(), read_only: true } });
  const mapping = gen.mapping(User, []);
  const mutator = {
    name: "bad",
    target_entity: User,
    input_fields: [User.fields.id],
    mapping,
    returns: { mapping, fields: [] },
    consistency: "best_effort" as const,
    written_stores: [],
    after: [],
    errors: [],
    invalidates: [],
    auth: undefined,
    optimistic: undefined,
  };
  const diags = api.checkApi([], [mutator]);
  expect(diags.some((d) => d.code === "api:readonly-field-in-mutator-input")).toBe(true);
});

test("checkApi flags server-only field exposed to client route", () => {
  const { gen } = createGen();
  const route = {
    method: { kind: "GET" as const },
    path: { segments: [{ kind: "literal" as const, value: "/users" }], template: "/users" },
    handler: { kind: "static" as const, static_func: undefined },
    target: "client",
    parameters: [
      {
        name: "secret",
        param_type: gen.types.uuid(),
        kind: "query" as const,
      },
    ],
  };
  const diags = api.checkApi([route], []);
  // uuid is not server_only by default, so this should not fire.
  expect(diags.some((d) => d.code === "api:server-only-field-exposed")).toBe(false);
});
