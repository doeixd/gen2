import { expect, test } from "vite-plus/test";
import { createGen, lifecycle, rules } from "../src/index.ts";

test("rule builder creates rule with name and when", () => {
  const { gen, ctx } = createGen();
  const rule = gen.rule.define((r) =>
    r
      .name("canEdit")
      .when(() =>
        gen.rule.eq(
          gen.rule.literal(true, gen.types.boolean()),
          gen.rule.literal(true, gen.types.boolean()),
        ),
      ),
  );

  expect(rule.kind).toBe("rule");
  expect(rule.name).toBe("canEdit");
  expect(ctx.rules).toEqual([rule]);
});

test("rule builder provides typed var context", () => {
  const { gen } = createGen();
  const rule = gen.rule.define((r) =>
    r
      .name("owns")
      .vars({ actor: gen.types.uuid() })
      .when(({ var: v }) => gen.rule.eq(v.actor, gen.rule.literal("x", gen.types.uuid()))),
  );

  const deps = rules.extractRuleDependencies(rule);
  expect(deps.variables).toContain("actor");
});

test("rule builder accumulates multiple vars", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const rule = gen.rule.define((r) =>
    r
      .name("isOwner")
      .vars({ actor_id: gen.types.uuid(), resource_id: gen.types.uuid() })
      .when(({ var: v }) =>
        gen.rule.eq(gen.rule.field(User, User.fields.id, gen.types.uuid()), v.actor_id),
      ),
  );

  expect(rule.vars).toHaveLength(2);
  expect(rule.vars.map((v) => v.name)).toContain("actor_id");
  expect(rule.vars.map((v) => v.name)).toContain("resource_id");
});

test("rule builder vars are typed in context", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  // This test primarily verifies at compile time that v.actor_id is a RuleVarExpr<string>
  // and can be used in gen.rule.eq alongside field references.
  const rule = gen.rule.define((r) =>
    r
      .name("typedVars")
      .vars({ actor_id: gen.types.uuid() })
      .when(({ var: v }) =>
        gen.rule.and(
          gen.rule.eq(gen.rule.field(User, User.fields.id, gen.types.uuid()), v.actor_id),
          gen.rule.eq(v.actor_id, gen.rule.literal("test", gen.types.uuid())),
        ),
      ),
  );

  expect(rule.name).toBe("typedVars");
  expect(rule.vars).toHaveLength(1);
});

test("rule builder integrates with lifecycle checks", () => {
  const { gen, ctx } = createGen();
  gen.rule.define((r) =>
    r
      .name("dup")
      .when(() =>
        gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(1, gen.types.int())),
      ),
  );
  gen.rule.define((r) =>
    r
      .name("dup")
      .when(() =>
        gen.rule.eq(gen.rule.literal(2, gen.types.int()), gen.rule.literal(2, gen.types.int())),
      ),
  );

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "rules:duplicate-rule-name")).toBe(true);
});

test("rule builder flags unknown variables through lifecycle", () => {
  const { gen, ctx } = createGen();
  gen.rule.define((r) =>
    r
      .name("bad")
      .vars({ actor: gen.types.uuid() })
      .when(({ var: v }) =>
        // Intentionally using a variable not declared in .vars()
        gen.rule.eq(v.actor, gen.rule.var("unknown", gen.types.uuid())),
      ),
  );

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "rules:unknown-variable")).toBe(true);
});

test("rule builder supports exists and field references", () => {
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

  const rule = gen.rule.define((r) =>
    r
      .name("hasPosts")
      .when(() =>
        gen.rule.exists(
          rel,
          gen.rule.eq(
            gen.rule.field(Post, Post.fields.user_id, gen.types.uuid()),
            gen.rule.literal("x", gen.types.uuid()),
          ),
        ),
      ),
  );

  const deps = rules.extractRuleDependencies(rule);
  expect(deps.relations).toContain(rel);
  expect(deps.entities).toContain(User);
  expect(deps.entities).toContain(Post);
});

test("rule builder throws when .when() is called before .name()", () => {
  const { gen } = createGen();
  expect(() =>
    gen.rule.define((r) => r.when(() => gen.rule.literal(true, gen.types.boolean()) as any)),
  ).toThrow("rule.define builder: .name() must be called before .when()");
});

test("rule builder preserves backward compatibility with object form", () => {
  const { gen, ctx } = createGen();
  const rule = gen.rule.define({
    name: "legacy",
    when: gen.rule.eq(
      gen.rule.literal(true, gen.types.boolean()),
      gen.rule.literal(true, gen.types.boolean()),
    ),
  });

  expect(rule.kind).toBe("rule");
  expect(rule.name).toBe("legacy");
  expect(ctx.rules).toEqual([rule]);
});
