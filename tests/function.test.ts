/**
 * Tests for function catalog invariants and static checks, including name
 * uniqueness, body-output type matching, undeclared effects, and action write
 * restrictions.
 */
import { expect, test } from "vite-plus/test";
import { core, createGen, fn } from "../src/index.ts";

test("emptyFunctionCatalog starts empty", () => {
  const cat = fn.emptyFunctionCatalog();
  expect(cat.static).toHaveLength(0);
  expect(cat.action).toHaveLength(0);
});

test("query functions can declare reactivity keys", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const UserKey = gen.key.family<{ readonly id: string }>("User");
  const query = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
    reactivity: { key: UserKey },
  });

  expect(query.reactivity?.key).toEqual({
    kind: "constant_key_expression",
    family: UserKey,
    payload: undefined,
  });
});

test("function constructors attach refs, stable IDs, traits, and call plans", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const query = gen.func.query({
    id: core.functionId("function.getUser"),
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });

  expect(query.id).toBe("function.getUser");
  expect(query.ref?.kind).toBe("FunctionRef");
  expect(query.ref?.id).toBe(query.id);
  expect(query.traits).toContain("callable");
  expect(query.traits).toContain("readable");
  expect(query.callPlan?.target).toBe(query.ref);
  expect(ctx.refs).toContain(query.ref);
});

test("legacy query invalidations lower to key patterns", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const UserKey = gen.key.family<{ readonly id: string }>("User");
  const query = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
    reactivity: { key: UserKey },
  });
  const action = gen.func.action({
    name: "updateUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: fn.buildActionUpdate(User, new Map()),
    invalidates: [query],
  });

  expect(action.reactivity?.invalidates).toEqual([
    {
      kind: "constant_key_pattern_expression",
      family: UserKey,
      patterns: [gen.key.any(UserKey)],
    },
  ]);
});

test("legacy invalidation without query key produces warning", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const query = gen.func.query({
    name: "getUserWithoutKey",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });
  const action = gen.func.action({
    name: "updateUserWithoutKey",
    input_type: gen.types.uuid(),
    returns: User,
    body: fn.buildActionUpdate(User, new Map()),
    invalidates: [query],
  });

  const diags = fn.checkFunctions({
    ...fn.emptyFunctionCatalog(),
    query: [query],
    action: [action],
  });
  expect(diags.some((d) => d.code === "function:legacy-invalidation-without-query-key")).toBe(true);
});

test("checkFunctions enforces global name uniqueness", () => {
  const { gen } = createGen();
  const cat = fn.emptyFunctionCatalog();
  const f1 = {
    name: "foo",
    input_type: gen.types.int(),
    input_fields: [],
    output_type: gen.types.int(),
    body: { kind: "literal", output_type: gen.types.int(), requirements: [], effects: [] },
    requirements: [],
    effects: [],
    capabilities: [],
    laws: [],
    target_runtimes: [],
  };
  const f2 = {
    name: "foo",
    input_type: gen.types.string(),
    output_type: gen.types.string(),
    body: gen.expr.literal(gen.types.string(), { kind: "string", string_value: "x" }),
    requirements: [],
    effects: [],
    capabilities: [],
    laws: [],
    target_runtimes: [],
  };
  const cat2 = { ...cat, static: [f1], expr: [f2] };
  const diags = fn.checkFunctions(cat2);
  expect(diags.some((d) => d.code === "function:duplicate-name")).toBe(true);
});

test("checkFunctions catches body-output mismatch for static functions", () => {
  const { gen } = createGen();
  const cat = fn.emptyFunctionCatalog();
  const f = {
    name: "bad",
    input_type: gen.types.int(),
    input_fields: [],
    output_type: gen.types.int(),
    body: { kind: "literal", output_type: gen.types.string(), requirements: [], effects: [] },
    requirements: [],
    effects: [],
    capabilities: [],
    laws: [],
    target_runtimes: [],
  };
  const cat2 = { ...cat, static: [f] };
  const diags = fn.checkFunctions(cat2);
  expect(diags.some((d) => d.code === "expression:function-output-mismatch")).toBe(true);
});

test("checkFunctions catches undeclared action effects", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const cat = fn.emptyFunctionCatalog();
  const action = {
    name: "createUser",
    input_type: gen.types.int(),
    input_fields: [],
    returns: gen.types.int(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [{ kind: "db_write" as const }],
      requirements: [],
    },
    auth: undefined,
    errors: [],
    invalidates: [],
    consistency: "transactional" as const,
    written_stores: [],
    effects: [] as { kind: string }[],
    requirements: [],
    target_runtimes: [],
  };
  const cat2 = { ...cat, action: [action] };
  const diags = fn.checkFunctions(cat2);
  expect(diags.some((d) => d.code === "function:undeclared-action-effect")).toBe(true);
});

test("checkFunctions catches unreconcilable optimistic patch", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const cat = fn.emptyFunctionCatalog();
  const patch = {
    name: "optCreateUser",
    input_type: gen.types.int(),
    returns: gen.types.int(),
    body: {
      kind: { kind: "optimistic_insert" as const },
      phase: "mutation" as const,
      target_query: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.int(),
      }),
      patch_items: [],
      reconcile_field: undefined,
      rollback_strategy: "inverse" as const,
    },
  };
  const action = {
    name: "createUser",
    input_type: gen.types.int(),
    input_fields: [],
    returns: gen.types.int(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
    auth: undefined,
    errors: [],
    invalidates: [],
    optimistic: patch,
    consistency: "transactional" as const,
    written_stores: [],
    effects: [] as { kind: string }[],
    requirements: [],
    target_runtimes: [],
  };
  const cat2 = { ...cat, action: [action], patch: [patch] };
  const diags = fn.checkFunctions(cat2);
  expect(diags.some((d) => d.code === "function:unreconcilable-patch")).toBe(true);
});

test("checkActionWrites rejects writing read-only fields", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: { type: gen.types.uuid(), read_only: true } });
  const cat = fn.emptyFunctionCatalog();
  const action = {
    name: "bad",
    input_type: gen.types.int(),
    input_fields: [],
    returns: gen.types.int(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [
        {
          kind: "insert_op" as const,
          target: User,
          values: new Map([
            [
              User.fields.id,
              gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "x" }),
            ],
          ]),
        },
      ],
      effects: [],
      requirements: [],
    },
    auth: undefined,
    errors: [],
    invalidates: [],
    consistency: "transactional" as const,
    written_stores: [],
    effects: [] as { kind: string }[],
    requirements: [],
    target_runtimes: [],
  };
  const cat2 = { ...cat, action: [action] };
  const diags = fn.checkActionWrites(cat2);
  expect(diags.some((d) => d.code === "function:non-writable-field")).toBe(true);
});
