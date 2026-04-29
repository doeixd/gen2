import { expect, test } from "vite-plus/test";
import { createGen, authz, lifecycle } from "../src/index.ts";

test("policy can reference a rule predicate", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const rule = gen.rule.define({
    name: "isOwner",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  const policy = gen.authz.policy({
    name: "ownerOnly",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
    predicate: rule,
  });

  expect(policy.predicate).toBe(rule);
  expect(policy.predicate?.name).toBe("isOwner");
});

test("checkAuthz passes when rule dependencies are registered entities", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const rule = gen.rule.define({
    name: "isOwner",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  gen.authz.policy({
    name: "ownerOnly",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
    predicate: rule,
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "authz:rule-dependencies-missing")).toBe(false);
});

test("checkAuthz flags missing rule dependency entity", () => {
  const { gen } = createGen();

  // We can't easily create a rule with an unregistered entity through gen.rule.define
  // because gen.entity registers entities. So we'll test with a registered entity
  // and then manually remove it from the check context.

  const User = gen.entity("User", { id: gen.types.uuid() });
  const rule = gen.rule.define({
    name: "isOwner",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  const policy = gen.authz.policy({
    name: "ownerOnly",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
    predicate: rule,
  });

  // Direct check with empty entities should flag the missing dependency
  const diags = authz.checkAuthz({
    policies: [policy],
    translations: [],
    exposures: [],
    entities: [],
  });

  expect(diags.some((d) => d.code === "authz:rule-dependencies-missing")).toBe(true);
});

test("checkAuthz flags rule dependency on entity not in context", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { user_id: gen.types.uuid() });

  const rule = gen.rule.define({
    name: "crossEntity",
    when: gen.rule.eq(
      gen.rule.field(Post, Post.fields.user_id, gen.types.uuid()),
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
    ),
  });

  const policy = gen.authz.policy({
    name: "crossPolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
    predicate: rule,
  });

  // Check with only User entity registered — Post should be flagged as missing
  const diags = authz.checkAuthz({
    policies: [policy],
    translations: [],
    exposures: [],
    entities: [User],
  });

  expect(diags.some((d) => d.code === "authz:rule-dependencies-missing")).toBe(true);
});

test("lifecycle check integrates authz rule dependency validation", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const rule = gen.rule.define({
    name: "isOwner",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  gen.authz.policy({
    name: "ownerOnly",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
    predicate: rule,
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "authz:rule-dependencies-missing")).toBe(false);
});

test("policy without predicate passes rule dependency check", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  gen.authz.policy({
    name: "simple",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "authz:rule-dependencies-missing")).toBe(false);
});
