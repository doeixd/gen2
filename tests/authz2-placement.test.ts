import { expect, test } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import { classifyPlacement, checkPlacement } from "../src/authz/placement.ts";
import { entityRead, queryFilter } from "../src/authz/surface.ts";
import { definePolicy, allowRole } from "../src/authz/authz.ts";
import { rule } from "../src/rules/rules.ts";
import {
  string as stringType,
  uuid as uuidType,
  arrayOf,
  boolean as booleanType,
} from "../src/types/semantic.ts";

test("classifyPlacement sql_where for eq on target entity field", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const r = rule.define({
    name: "isActive",
    when: rule.eq(
      rule.field(User, User.fields.name, User.fields.name.semantic_type),
      rule.literal("active", stringType()),
    ),
  });
  const policy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    predicate: r,
    actions: [],
  });
  const placement = classifyPlacement(entityRead(User), policy);
  expect(placement.kind).toBe("sql_where");
  expect(placement.authoritative).toBe(true);
  expect(placement.exact).toBe(true);
});

test("classifyPlacement sql_where for exists same store", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const Post = gen.entity("Post", { id: uuidType(), title: stringType() }, { store_name: "users" });
  const userPosts = gen.relation({
    name: "userPosts",
    kind: "one_to_many",
    from_entity: User,
    from_field: User.fields.id,
    to_entity: Post,
    to_field: Post.fields.id,
  });
  const r = rule.define({
    name: "hasPosts",
    when: rule.exists(userPosts, rule.literal(true, booleanType())),
  });
  const policy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    predicate: r,
    actions: [],
  });
  const placement = classifyPlacement(entityRead(User), policy);
  expect(placement.kind).toBe("sql_where");
  expect(placement.authoritative).toBe(true);
  expect(placement.exact).toBe(true);
});

test("classifyPlacement server_post_filter for exists cross store", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const Comment = gen.entity(
    "Comment",
    { id: uuidType(), text: stringType() },
    { store_name: "comments" },
  );
  const userComments = gen.relation({
    name: "userComments",
    kind: "one_to_many",
    from_entity: User,
    from_field: User.fields.id,
    to_entity: Comment,
    to_field: Comment.fields.id,
  });
  const r = rule.define({
    name: "hasComments",
    when: rule.exists(userComments, rule.literal(true, booleanType())),
  });
  const policy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    predicate: r,
    actions: [],
  });
  const placement = classifyPlacement(entityRead(User), policy);
  expect(placement.kind).toBe("server_post_filter");
  expect(placement.authoritative).toBe(true);
  expect(placement.exact).toBe(false);
});

test("classifyPlacement rls for AllowRole on entity with store", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const policy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: allowRole("admin") }],
  });
  const placement = classifyPlacement(entityRead(User), policy);
  expect(placement.kind).toBe("rls");
  expect(placement.authoritative).toBe(true);
  expect(placement.exact).toBe(true);
});

test("classifyPlacement rls for rule referencing other entity", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const Post = gen.entity("Post", { id: uuidType(), user_id: uuidType() }, { store_name: "posts" });
  const r = rule.define({
    name: "hasPost",
    when: rule.eq(
      rule.field(Post, Post.fields.user_id, Post.fields.user_id.semantic_type),
      rule.literal("x", uuidType()),
    ),
  });
  const policy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    predicate: r,
    actions: [],
  });
  const placement = classifyPlacement(entityRead(User), policy);
  expect(placement.kind).toBe("rls");
  expect(placement.authoritative).toBe(true);
  expect(placement.exact).toBe(true);
});

test("checkPlacement warns on list query with server_post_filter", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const Comment = gen.entity(
    "Comment",
    { id: uuidType(), text: stringType() },
    { store_name: "comments" },
  );
  const userComments = gen.relation({
    name: "userComments",
    kind: "one_to_many",
    from_entity: User,
    from_field: User.fields.id,
    to_entity: Comment,
    to_field: Comment.fields.id,
  });
  const r = rule.define({
    name: "hasComments",
    when: rule.exists(userComments, rule.literal(true, booleanType())),
  });
  const listQuery = gen.func.query({
    name: "listUsers",
    input_type: stringType(),
    returns: arrayOf(stringType()),
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: arrayOf(stringType()),
    }),
  });
  const policy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    predicate: r,
    actions: [],
    surfaces: [{ surface: queryFilter(listQuery) }],
  });
  const diags = checkPlacement({ policies: [policy] });
  expect(diags.some((d) => d.code === "authz:unsafe-list-post-filter")).toBe(true);
});

test("checkPlacement errors on list query with none placement", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const listQuery = gen.func.query({
    name: "listUsers",
    input_type: stringType(),
    returns: arrayOf(stringType()),
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: arrayOf(stringType()),
    }),
  });
  const policy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    actions: [],
    surfaces: [{ surface: queryFilter(listQuery) }],
  });
  const diags = checkPlacement({ policies: [policy] });
  expect(diags.some((d) => d.code === "authz:list-policy-not-placeable")).toBe(true);
});

test("checkPlacement silent for non-list query with server_post_filter", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const Comment = gen.entity(
    "Comment",
    { id: uuidType(), text: stringType() },
    { store_name: "comments" },
  );
  const userComments = gen.relation({
    name: "userComments",
    kind: "one_to_many",
    from_entity: User,
    from_field: User.fields.id,
    to_entity: Comment,
    to_field: Comment.fields.id,
  });
  const r = rule.define({
    name: "hasComments",
    when: rule.exists(userComments, rule.literal(true, booleanType())),
  });
  const singleQuery = gen.func.query({
    name: "getUser",
    input_type: stringType(),
    returns: stringType(),
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: stringType(),
    }),
  });
  const policy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    predicate: r,
    actions: [],
    surfaces: [{ surface: queryFilter(singleQuery) }],
  });
  const diags = checkPlacement({ policies: [policy] });
  expect(diags.length).toBe(0);
});
