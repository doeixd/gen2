/**
 * Tests for fluent builder APIs across types, expressions, functions, queries,
 * API resources, mappings, graphs, contracts, actors, and configuration.
 */
import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import { buildStaticHandler } from "../src/api/index.ts";

test("gen.brand creates a branded type", () => {
  const { gen } = createGen();
  const UserId = gen.types.brand("UserId", gen.types.uuid());
  expect(UserId.name).toBe("UserId");
  expect(UserId.storage_repr.kind.kind).toBe("fixed_bytes");
});

test("gen.literal creates a literal type", () => {
  const { gen } = createGen();
  const t = gen.types.literal("admin");
  expect(t.name).toBe('"admin"');
  expect(t.kind).toBe("string");
});

test("gen.object creates an object type", () => {
  const { gen } = createGen();
  const t = gen.types.object({ id: gen.types.uuid(), name: gen.types.string() });
  expect(t.kind).toBe("struct");
  expect(t.ts_type_name).toContain("id: string");
});

test("gen.types.cap.* constructors create capabilities", () => {
  const { gen } = createGen();
  expect(gen.types.cap.pure().kind).toBe("pure");
  expect(gen.types.cap.deterministic().kind).toBe("deterministic");
  expect(gen.types.cap.async().kind).toBe("async");
  expect(gen.types.cap.serverOnly().kind).toBe("server_only");
});

test("gen.types.effect.* constructors create effects", () => {
  const { gen } = createGen();
  expect(gen.types.effect.network().kind).toBe("network");
  expect(gen.types.effect.dbWrite().kind).toBe("db_write");
  expect(gen.types.effect.email().kind).toBe("email");
});

test("gen.types.law.* constructors create laws", () => {
  const { gen } = createGen();
  expect(gen.types.law.associative().kind).toBe("associative");
  expect(gen.types.law.idempotent().assurance).toBe("claim");
});

test("gen.expr.builder creates staged expressions", () => {
  const { gen } = createGen();
  const e = gen.expr.builder(gen.types.string(), (s) =>
    gen.expr.applyUnary(
      gen.types.op.unary({
        name: "lower",
        input_type: gen.types.string(),
        output_type: gen.types.string(),
      }),
      s,
    ),
  );
  expect(e.value_type.name).toBe("string");
  expect(e.kind.kind).toBe("op_call");
});

test("gen.expr.inputs creates multi-input staged expressions", () => {
  const { gen } = createGen();
  const e = gen.expr.inputs({ a: gen.types.int(), b: gen.types.int() }, ({ a, b }) =>
    gen.expr.applyBinary(
      gen.types.op.binary({
        name: "add",
        left_type: gen.types.int(),
        right_type: gen.types.int(),
        output_type: gen.types.int(),
      }),
      a,
      b,
    ),
  );
  expect(e.value_type.name).toBe("int");
});

test("gen.func.expr creates an ExprFunction", () => {
  const { gen } = createGen();
  const f = gen.func.expr({
    name: "double",
    input_type: gen.types.int(),
    output_type: gen.types.int(),
    body: gen.expr.builder(gen.types.int(), (v) =>
      gen.expr.applyBinary(
        gen.types.op.binary({
          name: "mul",
          left_type: gen.types.int(),
          right_type: gen.types.int(),
          output_type: gen.types.int(),
        }),
        v,
        gen.expr.literal(gen.types.int(), { kind: "integer", integer_value: 2 }),
      ),
    ),
  });
  expect(f.name).toBe("double");
  expect(f.body.value_type.name).toBe("int");
});

test("gen.func.query creates a QueryFunction", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
  const q = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: gen.types.uuid(),
    body: gen.query.from(User).select([User.fields.id]).build(),
  });
  expect(q.name).toBe("getUser");
  expect(q.body.source.entity).toBe(User);
});

test("gen.func.action creates an ActionFunction", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const action = gen.func.action({
    name: "createUser",
    input_type: gen.types.uuid(),
    returns: gen.types.uuid(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
  });
  expect(action.name).toBe("createUser");
  expect(action.consistency).toBe("transactional");
});

test("gen.func.patch creates a PatchFunction", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const patch = gen.func.patch({
    name: "optimisticCreate",
    input_type: gen.types.uuid(),
    returns: gen.types.uuid(),
    body: {
      kind: { kind: "optimistic_insert" as const },
      phase: "mutation" as const,
      target_query: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.uuid(),
      }),
      patch_items: [],
      reconcile_field: User.fields.id,
      rollback_strategy: "inverse" as const,
    },
    reconcile_field: User.fields.id,
  });
  expect(patch.name).toBe("optimisticCreate");
  expect(patch.reconcile_field).toBe(User.fields.id);
});

test("gen.query.from builds a fluent query", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
  const q = gen.query.from(User).select([User.fields.id, User.fields.email]).build();
  expect(q.source.entity).toBe(User);
  expect(q.projection?.fields).toHaveLength(2);
});

test("gen.api.route creates a Route", () => {
  const { gen } = createGen();
  const route = gen.api.route({
    method: { kind: "GET" as const },
    path: { segments: [{ kind: "literal" as const, value: "/users" }], template: "/users" },
    handler: buildStaticHandler({
      name: "x",
      input_type: gen.types.string(),
      input_fields: [],
      output_type: gen.types.string(),
      body: { kind: "static", output_type: gen.types.string(), requirements: [], effects: [] },
      requirements: [],
      effects: [],
      capabilities: [],
      laws: [],
      target_runtimes: [],
    }),
  });
  expect(route.method.kind).toBe("GET");
  expect(route.path.template).toBe("/users");
});

test("gen.api.getter creates a Getter", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const mapping = gen.mapping(User, []);
  const getter = gen.api.getter({
    name: "getUser",
    target_entity: User,
    by_field: User.fields.id,
    projection: { mapping, fields: [] },
  });
  expect(getter.name).toBe("getUser");
  expect(getter.by_field).toBe(User.fields.id);
});

test("gen.api.mutator creates a Mutator", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const mutator = gen.api.mutator({
    name: "createUser",
    target_entity: User,
    input_fields: [User.fields.id],
    mapping: gen.mapping(User, []),
    returns: { mapping: gen.mapping(User, []), fields: [] },
  });
  expect(mutator.name).toBe("createUser");
  expect(mutator.consistency).toBe("transactional");
});

test("gen.mapField creates a FieldMapping", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const fm = gen.mapField(User.fields.id, {
    read: { kind: "column", semantic_type: gen.types.uuid() },
  });
  expect(fm.field).toBe(User.fields.id);
  expect(fm.type_compatible).toBe(true);
});

test("gen.graph creates a Graph", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { authorId: gen.types.uuid() });
  const r = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.authorId,
    to_field: User.fields.id,
  });
  const g = gen.graph("BlogGraph", [User, Post], [r]);
  expect(g.name).toBe("BlogGraph");
  expect(g.relations).toHaveLength(1);
});

test("gen.contract creates a Contract", () => {
  const { gen } = createGen();
  const c = gen.contract("Codec", [
    { name: "encode", input_type: "unknown", output_type: "string" },
  ]);
  expect(c.name).toBe("Codec");
  expect(c.operations).toHaveLength(1);
});

test("gen.actor creates an Actor", () => {
  const { gen } = createGen();
  const a = gen.actor("User", "email", "Workspace", "Workspace");
  expect(a.name).toBe("User");
  expect(a.identified_by).toBe("email");
  expect(a.within).toBe("Workspace");
});

test("gen.config.entry creates a ConfigEntry", () => {
  const { gen } = createGen();
  const entry = gen.config.entry("max_login_attempts", "Integer", "5");
  expect(entry.name).toBe("max_login_attempts");
  expect(entry.default_value).toBe("5");
});

test("gen.env.schema creates an EnvSchema", () => {
  const { gen } = createGen();
  const env = gen.env.schema({
    DATABASE_URL: gen.env.url("DATABASE_URL"),
    SESSION_SECRET: gen.env.string("SESSION_SECRET", { secret: true }),
  });
  expect(env.variables).toHaveLength(2);
  expect(env.variables[0]!.kind).toBe("url");
  expect(env.variables[1]!.secret).toBe(true);
});
