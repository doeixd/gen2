import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import { ruleToRlsPolicy, ruleToSqlPredicate } from "../src/rules/index.ts";

test("ruleToSqlPredicate lowers equality for a dialect name", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { name: gen.types.string() }, { store_name: "users" });
  const rule = gen.rule.define({
    name: "isAlice",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.name, gen.types.string()),
      gen.rule.literal("Alice", gen.types.string()),
    ),
  });

  const result = ruleToSqlPredicate(rule, User, "postgres");

  expect(result.translatable).toBe(true);
  expect(result.sql).toBe("(users.name = 'Alice')");
});

test("ruleToSqlPredicate reports unsupported EXISTS for non-relational dialect", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() }, { store_name: "users" });
  const Post = gen.entity("Post", { user_id: gen.types.uuid() }, { store_name: "posts" });
  const rel = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.user_id,
    to_field: User.fields.id,
  });
  const rule = gen.rule.define({
    name: "hasPost",
    when: gen.rule.exists(
      rel,
      gen.rule.eq(
        gen.rule.field(Post, Post.fields.user_id, gen.types.uuid()),
        gen.rule.var("actor_id", gen.types.uuid()),
      ),
    ),
  });

  const result = ruleToSqlPredicate(rule, User, "mongo");

  expect(result.translatable).toBe(false);
  expect(result.diagnostics.some((d) => d.code === "rules:not-sql-translatable")).toBe(true);
});

test("ruleToRlsPolicy emits CREATE POLICY SQL", () => {
  const { gen } = createGen();
  const Post = gen.entity("Post", { owner_id: gen.types.uuid() }, { store_name: "posts" });
  const rule = gen.rule.define({
    name: "isOwner",
    when: gen.rule.eq(
      gen.rule.field(Post, Post.fields.owner_id, gen.types.uuid()),
      gen.rule.var("actor_id", gen.types.uuid()),
    ),
  });

  const result = ruleToRlsPolicy(rule, Post, "postgres");

  expect(result.translatable).toBe(true);
  expect(result.policyName).toBe("isOwner_policy");
  expect(result.sql).toBe(
    'CREATE POLICY "isOwner_policy" ON "posts" USING ((row.owner_id = :actor_id));',
  );
});

test("gen.rule.rlsPolicy exposes RLS generation", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { active: gen.types.boolean() }, { store_name: "users" });
  const rule = gen.rule.define({
    name: "isActive",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.active, gen.types.boolean()),
      gen.rule.literal(true, gen.types.boolean()),
    ),
  });

  const result = gen.rule.rlsPolicy(rule, User, "postgres");

  expect(result.translatable).toBe(true);
  expect(result.sql).toContain('CREATE POLICY "isActive_policy"');
});

test("ruleToRlsPolicy reports missing store", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { active: gen.types.boolean() });
  const rule = gen.rule.define({
    name: "isActive",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.active, gen.types.boolean()),
      gen.rule.literal(true, gen.types.boolean()),
    ),
  });

  const result = ruleToRlsPolicy(rule, User, "postgres");

  expect(result.translatable).toBe(false);
  expect(result.diagnostics.some((d) => d.code === "rules:not-rls-translatable")).toBe(true);
});
