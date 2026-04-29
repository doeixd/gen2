import { expect, test } from "vite-plus/test";
import { createGen, rules, lifecycle } from "../src/index.ts";

test("gen.rule.define registers rules in context", () => {
  const { gen, ctx } = createGen();
  const rule = gen.rule.define({
    name: "canEdit",
    when: gen.rule.eq(
      gen.rule.literal(true, gen.types.boolean()),
      gen.rule.literal(true, gen.types.boolean()),
    ),
  });

  expect(rule.kind).toBe("rule");
  expect(rule.name).toBe("canEdit");
  expect(ctx.rules).toEqual([rule]);
});

test("extractRuleDependencies finds variables", () => {
  const { gen } = createGen();
  const rule = gen.rule.define({
    name: "owns",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("actor", gen.types.uuid()),
      gen.rule.literal("x", gen.types.string()),
    ),
  });

  const deps = rules.extractRuleDependencies(rule);
  expect(deps.variables).toContain("actor");
});

test("extractRuleDependencies finds entities and fields", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const rule = gen.rule.define({
    name: "isAdmin",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  const deps = rules.extractRuleDependencies(rule);
  expect(deps.entities).toContain(User);
  expect(deps.fields).toContain(User.fields.id);
});

test("extractRuleDependencies finds relations in exists", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { user_id: gen.types.uuid() });
  const rel = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.user_id,
    to_field: User.fields.id,
  });

  const rule = gen.rule.define({
    name: "hasPosts",
    when: gen.rule.exists(
      rel,
      gen.rule.eq(
        gen.rule.field(Post, Post.fields.user_id, gen.types.uuid()),
        gen.rule.literal("x", gen.types.uuid()),
      ),
    ),
  });

  const deps = rules.extractRuleDependencies(rule);
  expect(deps.relations).toContain(rel);
  expect(deps.entities).toContain(User);
  expect(deps.entities).toContain(Post);
});

test("checkRules flags duplicate names", () => {
  const { gen, ctx } = createGen();
  gen.rule.define({
    name: "dup",
    when: gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(1, gen.types.int())),
  });
  gen.rule.define({
    name: "dup",
    when: gen.rule.eq(gen.rule.literal(2, gen.types.int()), gen.rule.literal(2, gen.types.int())),
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "rules:duplicate-rule-name")).toBe(true);
});

test("checkRules flags unknown variables", () => {
  const { gen, ctx } = createGen();
  gen.rule.define({
    name: "bad",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("unknown", gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "rules:unknown-variable")).toBe(true);
});

test("checkRules flags non-boolean body", () => {
  const { gen, ctx } = createGen();
  gen.rule.define({
    name: "bad",
    when: gen.rule.literal(42, gen.types.int()) as any,
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "rules:non-boolean-body")).toBe(true);
});

test("checkRules flags unsafe negation over exists", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { user_id: gen.types.uuid() });
  const rel = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.user_id,
    to_field: User.fields.id,
  });

  gen.rule.define({
    name: "noPosts",
    when: gen.rule.not(
      gen.rule.exists(
        rel,
        gen.rule.eq(
          gen.rule.field(Post, Post.fields.user_id, gen.types.uuid()),
          gen.rule.literal("x", gen.types.uuid()),
        ),
      ),
    ),
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "rules:unsafe-negation")).toBe(true);
});

test("checkRules allows safe negation over eq", () => {
  const { gen, ctx } = createGen();
  gen.rule.define({
    name: "isActive",
    when: gen.rule.not(
      gen.rule.eq(
        gen.rule.literal("archived", gen.types.string()),
        gen.rule.literal("archived", gen.types.string()),
      ),
    ),
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "rules:unsafe-negation")).toBe(false);
});

test("rule.and and rule.or compose boolean expressions", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const rule = gen.rule.define({
    name: "complex",
    when: gen.rule.and(
      gen.rule.eq(
        gen.rule.field(User, User.fields.id, gen.types.uuid()),
        gen.rule.literal("a", gen.types.uuid()),
      ),
      gen.rule.or(
        gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(1, gen.types.int())),
        gen.rule.compare(
          "gt",
          gen.rule.literal(2, gen.types.int()),
          gen.rule.literal(1, gen.types.int()),
        ),
      ),
    ),
  });

  const deps = rules.extractRuleDependencies(rule);
  expect(deps.entities).toContain(User);
  expect(deps.fields).toContain(User.fields.id);
});

test("lifecycle.check integrates rule diagnostics", () => {
  const { gen, ctx } = createGen();
  gen.rule.define({
    name: "dup",
    when: gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(1, gen.types.int())),
  });
  gen.rule.define({
    name: "dup",
    when: gen.rule.eq(gen.rule.literal(2, gen.types.int()), gen.rule.literal(2, gen.types.int())),
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "rules:duplicate-rule-name")).toBe(true);
});
