/**
 * Edge-case tests spanning functions, API routes, and authorization, focusing on
 * diagnostics produced by cross-cutting invariants.
 */
import { expect, test } from "vite-plus/test";
import { createGen, fn, api, authz, types } from "../src/index.ts";

test("function catalog global name uniqueness across kinds", () => {
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

test("function catalog catches duplicate name within same kind", () => {
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
    body: { kind: "literal", output_type: gen.types.string(), requirements: [], effects: [] },
    requirements: [],
    effects: [],
    capabilities: [],
    laws: [],
    target_runtimes: [],
  };
  const cat2 = { ...cat, static: [f1, f2] as fn.StaticFunction[] };
  const diags = fn.checkFunctions(cat2);
  expect(diags.some((d) => d.code === "function:duplicate-name")).toBe(true);
});

test("static function body output mismatch produces diagnostic", () => {
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

test("action function with undeclared body effect produces diagnostic", () => {
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
    optimistic: undefined,
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

test("patch function without reconcile field produces diagnostic", () => {
  const { gen } = createGen();
  const cat = fn.emptyFunctionCatalog();
  const patch = {
    name: "opt",
    input_type: gen.types.int(),
    returns: gen.types.int(),
    body: {
      kind: { kind: "optimistic_insert" as const },
      phase: "mutation" as const,
      target_query: gen.query.build({
        source: { kind: "entity_source", entity: gen.entity("E", { id: gen.types.uuid() }) },
        result_type: gen.types.int(),
      }),
      patch_items: [],
      reconcile_field: undefined,
      rollback_strategy: "inverse" as const,
    },
  };
  const cat2 = { ...cat, patch: [patch] };
  const diags = fn.checkFunctions(cat2);
  expect(diags.some((d) => d.code === "function:unreconcilable-patch")).toBe(true);
});

test("optimistic patch without reconcile field on action produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const cat = fn.emptyFunctionCatalog();
  const patch = {
    name: "opt",
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

test("action writing read-only field produces diagnostic", () => {
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

test("plan function with pure_only fallback but effectful primary produces diagnostic", () => {
  const { gen } = createGen();
  const cat = fn.emptyFunctionCatalog();
  const plan = {
    name: "badPlan",
    input_type: gen.types.int(),
    output_type: gen.types.int(),
    body: {
      kind: { kind: "runtime_split" as const },
      phase: "query" as const,
      primary: {
        kind: { kind: "op_call" as const },
        value_type: gen.types.int(),
        phase: "query" as const,
        ast: { kind: { kind: "literal" as const }, children: [] },
        effects: [{ kind: "db_read" }],
        requirements: [],
        contains_opaque_js: false,
        refs: [],
      },
      fallback_policy: {
        kind: "allow" as const,
        pure_only: true,
        deterministic_only: false,
        effectful_ok: false,
      },
      runtime_assignments: [],
    },
    fallback_policy: {
      kind: "allow" as const,
      pure_only: true,
      deterministic_only: false,
      effectful_ok: false,
    },
  };
  const cat2 = { ...cat, plan: [plan] };
  const diags = fn.checkFunctions(cat2);
  expect(diags.some((d) => d.code === "function:plan-pure-only-violated")).toBe(true);
});

test("query function runtime unsupported operation produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const runtime = gen.runtime({ name: "minimal", capabilities: ["pure"] });
  const cat = fn.emptyFunctionCatalog();
  const qf = {
    name: "getUser",
    input_type: gen.types.uuid(),
    input_fields: [],
    returns: gen.types.uuid(),
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
      requirements: [{ kind: "joins" }],
    }),
    errors: [],
    requirements: [],
    target_runtimes: [runtime],
  };
  const cat2 = { ...cat, query: [qf] };
  const diags = fn.checkQueryFunctionRuntimes(cat2);
  expect(diags.some((d) => d.code === "function:unsupported-query-operation")).toBe(true);
});

test("api route handler with no func set produces diagnostic", () => {
  const route = {
    method: { kind: "GET" as const },
    path: { segments: [{ kind: "literal" as const, value: "/" }], template: "/" },
    handler: {
      kind: "query" as const,
      query_func: undefined,
      action_func: undefined,
      static_func: undefined,
    },
    parameters: [],
  };
  const diags = api.checkApi([route], []);
  expect(diags.some((d) => d.code === "api:handler-kind-mismatch")).toBe(true);
});

test("api route handler with multiple funcs set produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const qf = {
    name: "getUser",
    input_type: gen.types.uuid(),
    input_fields: [],
    returns: gen.types.uuid(),
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
    errors: [],
    requirements: [],
    target_runtimes: [],
  };
  const route = {
    method: { kind: "GET" as const },
    path: { segments: [{ kind: "literal" as const, value: "/" }], template: "/" },
    handler: {
      kind: "query" as const,
      query_func: qf,
      action_func: qf,
      static_func: undefined,
    },
    parameters: [],
  };
  const diags = api.checkApi([route], []);
  expect(diags.some((d) => d.code === "api:handler-kind-mismatch")).toBe(true);
});

test("api mutator input not in mapping target entity produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { title: gen.types.string() });
  const mutator = {
    name: "bad",
    target_entity: User,
    input_fields: [Post.fields.title],
    mapping: gen.mapping(User, []),
    returns: { mapping: gen.mapping(User, []), fields: [] },
    consistency: "best_effort" as const,
    written_stores: [],
    after: [],
    errors: [],
    invalidates: [],
    auth: undefined,
    optimistic: undefined,
  };
  const diags = api.checkApi([], [mutator]);
  expect(diags.some((d) => d.code === "api:mutator-input-not-mapped")).toBe(true);
});

test("api route with server-only param to client target produces diagnostic", () => {
  const { gen } = createGen();
  const route = {
    method: { kind: "GET" as const },
    path: { segments: [{ kind: "literal" as const, value: "/" }], template: "/" },
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
  // uuid is not server_only by default, so no diagnostic expected.
  const diags = api.checkApi([route], []);
  expect(diags.some((d) => d.code === "api:server-only-field-exposed")).toBe(false);
});

test("api route with mongo document storage to sql target produces diagnostic", () => {
  const { gen } = createGen();
  const param_type: types.SemanticType = {
    ...gen.types.uuid(),
    storage_repr: { name: "doc", kind: { kind: "document" }, fixed: false, metadata: [] },
  };
  const route = {
    method: { kind: "GET" as const },
    path: { segments: [{ kind: "literal" as const, value: "/" }], template: "/" },
    handler: { kind: "static" as const, static_func: undefined },
    target: "drizzle",
    parameters: [
      {
        name: "data",
        param_type,
        kind: "query" as const,
      },
    ],
  };
  const diags = api.checkApi([route], []);
  expect(diags.some((d) => d.code === "api:mongo-to-sql-target")).toBe(true);
});

test("authz owner field from wrong entity produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { title: gen.types.string() });
  const p = gen.authz.policy({
    name: "bad",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowOwner(Post.fields.title) }],
  });
  const diags = authz.checkAuthz({ policies: [p], translations: [], exposures: [] });
  expect(diags.some((d) => d.code === "authz:owner-field-wrong-entity")).toBe(true);
});

test("authz relation policy on cross-store produces warning", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() }, { store_name: "primary" });
  const Post = gen.entity("Post", { user_id: gen.types.uuid() }, { store_name: "analytics" });
  const r = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.user_id,
    to_field: User.fields.id,
  });
  const p = gen.authz.policy({
    name: "cross",
    target_entity: Post,
    actions: [{ action_name: "read", condition: gen.authz.allowRelation(r) }],
  });
  const diags = authz.checkAuthz({ policies: [p], translations: [], exposures: [] });
  expect(diags.some((d) => d.code === "authz:unenforceable-policy")).toBe(true);
});

test("authz safe exposure without hidden server fields produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const p = gen.authz.policy({
    name: "expose",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
  });
  const exposure = {
    policy: p,
    exposed_actions: ["read"],
    server_only_fields_hidden: false,
    safe_to_expose: true,
  };
  const diags = authz.checkAuthz({ policies: [p], translations: [], exposures: [exposure] });
  expect(diags.some((d) => d.code === "authz:safe-but-not-hidden")).toBe(true);
});

test("authz policy translation without store produces error", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const p = gen.authz.policy({
    name: "p",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
  });
  const pt = {
    policy: p,
    target: { kind: "sql_predicate" as const },
    translatable: true,
  };
  const diags = authz.checkAuthz({ policies: [p], translations: [pt], exposures: [] });
  expect(diags.some((d) => d.code === "authz:sql-translation-no-store")).toBe(true);
});
