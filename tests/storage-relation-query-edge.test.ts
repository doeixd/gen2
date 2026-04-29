/**
 * Edge-case tests for storage, relations, and queries, covering duplicate columns,
 * unknown dialects, mapping mismatches, join conditions, and runtime checks.
 */
import { expect, test } from "vite-plus/test";
import { createGen, storage, relation, query, expression } from "../src/index.ts";

test("storage checkStorageInvariants flags duplicate columns", () => {
  const { gen } = createGen();
  const s = gen.store({ name: "s", dialect: "postgres" });
  gen.table(s, "t", [
    { name: "id", physical_type: "uuid", semantic_type: gen.types.uuid(), nullable: false },
    { name: "id", physical_type: "text", semantic_type: gen.types.string(), nullable: false },
  ]);
  const diags = storage.checkStorageInvariants([s]);
  expect(diags.some((d) => d.code === "storage:duplicate-column")).toBe(true);
});

test("storage checkStorageInvariants warns on unknown dialect without plugin contribution", () => {
  const { gen } = createGen();
  const s = gen.store({ name: "s", dialect: "cassandra" });
  const diags = storage.checkStorageInvariants([s]);
  expect(diags.some((d) => d.code === "storage:unknown-dialect")).toBe(true);
});

test("storage checkStorageInvariants accepts plugin-contributed dialect", () => {
  const { gen } = createGen();
  const s = gen.store({ name: "s", dialect: "cassandra" });
  const diags = storage.checkStorageInvariants([s], ["cassandra"]);
  expect(diags.some((d) => d.code === "storage:unknown-dialect")).toBe(false);
});

test("mapping type mismatch produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const m = gen.mapping(User, [
    gen.mapField(User.fields.id, { read: { kind: "column", semantic_type: gen.types.string() } }),
  ]);
  const diags = storage.checkMappings([m]);
  expect(diags.some((d) => d.code === "mapping:incompatible-field-column")).toBe(true);
});

test("read-only field with write mapping produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const m = gen.mapping(User, [
    gen.mapField(User.fields.id, {
      read: { kind: "column", semantic_type: gen.types.uuid() },
      write: { kind: "column" },
      read_only: true,
    }),
  ]);
  const diags = storage.checkMappings([m]);
  expect(diags.some((d) => d.code === "mapping:readonly-field-writable")).toBe(true);
});

test("mapping type compatible when types match", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const m = gen.mapping(User, [
    gen.mapField(User.fields.id, { read: { kind: "column", semantic_type: gen.types.uuid() } }),
  ]);
  const diags = storage.checkMappings([m]);
  expect(diags.some((d) => d.code === "mapping:incompatible-field-column")).toBe(false);
});

test("relation field type mismatch produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { author_id: gen.types.string() });
  const r = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id,
    to_field: User.fields.id,
  });
  const diags = relation.checkRelations([r]);
  expect(diags.some((d) => d.code === "relations:field-type-mismatch")).toBe(true);
});

test("many-to-many without link entity produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Group = gen.entity("Group", { id: gen.types.uuid() });
  const r = gen.relation({
    name: "membership",
    kind: "many_to_many",
    from_entity: User,
    to_entity: Group,
    from_field: User.fields.id,
    to_field: Group.fields.id,
  });
  const diags = relation.checkRelations([r]);
  expect(diags.some((d) => d.code === "relations:m2m-missing-link")).toBe(true);
});

test("non-many-to-many with link entity produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Group = gen.entity("Group", { id: gen.types.uuid() });
  const r = gen.relation({
    name: "membership",
    kind: "one_to_many",
    from_entity: User,
    to_entity: Group,
    from_field: User.fields.id,
    to_field: Group.fields.id,
    link_entity: User,
  });
  const diags = relation.checkRelations([r]);
  expect(diags.some((d) => d.code === "relations:non-m2m-link")).toBe(true);
});

test("cross-store database FK produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() }, { store_name: "primary" });
  const Event = gen.entity("Event", { user_id: gen.types.uuid() }, { store_name: "analytics" });
  const r = gen.relation({
    name: "owner",
    kind: "many_to_one",
    from_entity: Event,
    to_entity: User,
    from_field: Event.fields.user_id,
    to_field: User.fields.id,
    integrity: { kind: "database_foreign_key" },
  });
  const diags = relation.checkRelations([r]);
  expect(diags.some((d) => d.code === "relations:cross-store-fk")).toBe(true);
});

test("setNull on non-nullable field produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { author_id: { type: gen.types.uuid(), nullable: false } });
  const r = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id,
    to_field: User.fields.id,
    foreign_key: { on_delete: "set_null", on_update: "no_action", indexed: true },
  });
  const diags = relation.checkRelations([r]);
  expect(diags.some((d) => d.code === "relations:set-null-non-nullable")).toBe(true);
});

test("setDefault without default value produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { author_id: gen.types.uuid() });
  const r = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id,
    to_field: User.fields.id,
    foreign_key: { on_delete: "set_default", on_update: "no_action", indexed: true },
  });
  const diags = relation.checkRelations([r]);
  expect(diags.some((d) => d.code === "relations:set-default-no-default")).toBe(true);
});

test("inverse mismatch produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { author_id: gen.types.uuid() });
  const r1 = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id,
    to_field: User.fields.id,
  });
  const r3 = gen.relation({
    name: "other",
    kind: "one_to_many",
    from_entity: User,
    to_entity: Post,
    from_field: User.fields.id,
    to_field: Post.fields.author_id,
    inverse: r1, // r1 does not point back to r3
  });
  const diags = relation.checkRelations([r3]);
  expect(diags.some((d) => d.code === "relations:inverse-mismatch")).toBe(true);
});

test("self-referencing relation is valid when types match", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), manager_id: gen.types.uuid() });
  const r = gen.relation({
    name: "manager",
    kind: "many_to_one",
    from_entity: User,
    to_entity: User,
    from_field: User.fields.manager_id,
    to_field: User.fields.id,
  });
  const diags = relation.checkRelations([r]);
  expect(diags.some((d) => d.code === "relations:field-type-mismatch")).toBe(false);
});

test("query aggregate over non-numeric field produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.int(),
    projection: {
      fields: [],
      aggregates: [
        {
          aggregate_op: gen.types.op.aggregate({
            name: "sum",
            input_type: gen.types.string(),
            output_type: gen.types.int(),
            requires_numeric: true,
          }),
          field: User.fields.name,
          alias: "total",
        },
      ],
    },
  });
  const diags = query.checkQueries([q]);
  expect(diags.some((d) => d.code === "query:ambiguous-aggregate")).toBe(true);
});

test("query with non-aggregate op in aggregate projection produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.int(),
    projection: {
      fields: [],
      aggregates: [
        {
          aggregate_op: gen.types.op.unary({
            name: "lower",
            input_type: gen.types.string(),
            output_type: gen.types.string(),
          }),
          field: User.fields.id,
          alias: "x",
        },
      ],
    },
  });
  const diags = query.checkQueries([q]);
  expect(diags.some((d) => d.code === "query:non-aggregate-op")).toBe(true);
});

test("query with field from wrong entity in projection produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { title: gen.types.string() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.string(),
    projection: {
      fields: [{ field: Post.fields.title }],
      aggregates: [],
    },
  });
  const diags = query.checkQueries([q]);
  expect(diags.some((d) => d.code === "query:nonexistent-field")).toBe(true);
});

test("query with wrong-entity field in predicate produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { title: gen.types.string() });
  const pred = expression.buildPredicate({
    input_type: User,
    value_type: gen.types.boolean(),
    ast: expression.fieldRefNode(Post.fields.title.ref),
  });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.boolean(),
    predicate: pred,
  });
  const diags = query.checkQueries([q]);
  expect(diags.some((d) => d.code === "query:wrong-entity-field")).toBe(true);
});

test("query join condition not referencing joined entity produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { title: gen.types.string() });
  const pred = expression.buildPredicate({
    input_type: User,
    value_type: gen.types.boolean(),
    ast: expression.fieldRefNode(User.fields.id.ref),
  });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.boolean(),
    joins: [
      {
        kind: "inner",
        target: { kind: "entity_source", entity: Post },
        condition: pred,
      },
    ],
  });
  const diags = query.checkQueries([q]);
  expect(diags.some((d) => d.code === "query:join-condition-invalid")).toBe(true);
});

test("query join with valid condition referencing joined entity passes", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { authorId: gen.types.uuid() });
  const pred = expression.buildPredicate({
    input_type: User,
    value_type: gen.types.boolean(),
    ast: expression.opCallNode(
      gen.types.op.comparison({
        name: "eq",
        operand_type: gen.types.uuid(),
        output_type: gen.types.boolean(),
      }),
      [
        expression.fieldRefNode(User.fields.id.ref),
        expression.fieldRefNode(Post.fields.authorId.ref),
      ],
    ),
  });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.boolean(),
    joins: [
      {
        kind: "inner",
        target: { kind: "entity_source", entity: Post },
        condition: pred,
      },
    ],
  });
  const diags = query.checkQueries([q]);
  expect(diags.some((d) => d.code === "query:join-condition-invalid")).toBe(false);
});

test("query with unsupported join condition kind produces warning", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { authorId: gen.types.uuid() });
  const pred = expression.buildPredicate({
    input_type: User,
    value_type: gen.types.boolean(),
    kind: "exists",
    ast: expression.fieldRefNode(User.fields.id.ref),
  });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.boolean(),
    joins: [
      {
        kind: "inner",
        target: { kind: "entity_source", entity: Post },
        condition: pred,
      },
    ],
  });
  const diags = query.checkQueries([q]);
  expect(diags.some((d) => d.code === "query:join-non-predicate")).toBe(true);
});

test("fluent query builder chains correctly", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    email: gen.types.email(),
    age: gen.types.int(),
  });
  const q = gen.query
    .from(User)
    .select([User.fields.id, User.fields.email])
    .orderBy(User.fields.age, "desc")
    .build();
  expect(q.source.entity).toBe(User);
  expect(q.projection?.fields).toHaveLength(2);
  expect(q.order_by).toHaveLength(1);
  expect(q.order_by[0]!.direction).toBe("desc");
});

test("fluent query builder with join produces correct query", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { authorId: gen.types.uuid() });
  const pred = expression.buildPredicate({
    input_type: User,
    value_type: gen.types.boolean(),
    ast: expression.opCallNode(
      gen.types.op.comparison({
        name: "eq",
        operand_type: gen.types.uuid(),
        output_type: gen.types.boolean(),
      }),
      [
        expression.fieldRefNode(User.fields.id.ref),
        expression.fieldRefNode(Post.fields.authorId.ref),
      ],
    ),
  });
  const q = gen.query
    .from(User)
    .join("inner", { kind: "entity_source", entity: Post }, pred)
    .build();
  expect(q.joins).toHaveLength(1);
  expect(q.joins[0]!.kind).toBe("inner");
});

test("query runtime effects check flags unsupported effects", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const runtime = gen.runtime({ name: "pure", capabilities: ["pure"] });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
    effects: [{ kind: "db_read" }],
    target_runtimes: [runtime],
  });
  const diags = query.checkQueryRuntimes([q]);
  expect(diags.some((d) => d.code === "query:unsupported-operation")).toBe(true);
});
