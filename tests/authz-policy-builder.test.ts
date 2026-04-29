import { expect, test } from "vite-plus/test";
import { createGen, lifecycle } from "../src/index.ts";

test("policy builder creates policy with surfaces", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const rule = gen.rule.define({
    name: "isOwner",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.var("actor", gen.types.uuid()),
    ),
  });

  const policy = gen.authz.policy((p) =>
    p
      .name("ownerOnly")
      .for(User)
      .rule(rule)
      .variables({ actor: "actor", resource: "user" })
      .surface(gen.authz.surface.entityRead(User), "not_found")
      .surface(gen.authz.surface.entityUpdate(User), "forbidden")
      .build(),
  );

  expect(policy.name).toBe("ownerOnly");
  expect(policy.target_entity).toBe(User);
  expect(policy.predicate).toBe(rule);
  expect(policy.variable_bindings).toEqual({ actor: "actor", resource: "user" });
  expect(policy.access_surface_bindings).toHaveLength(2);
  expect(ctx.policies).toContain(policy);
});

test("policy builder defaults deny behavior when not specified", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const policy = gen.authz.policy((p) =>
    p.name("defaultDeny").for(User).surface(gen.authz.surface.entityRead(User)).build(),
  );

  const binding = policy.access_surface_bindings![0]!;
  expect(binding.deny).toBe("not_found"); // default for entity.read
});

test("policy builder throws without name", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  expect(() => gen.authz.policy((p) => p.for(User).build())).toThrow(
    "policy builder: .name() must be called before .build()",
  );
});

test("policy builder throws without for", () => {
  const { gen } = createGen();

  expect(() => gen.authz.policy((p) => p.name("noEntity").build())).toThrow(
    "policy builder: .for() must be called before .build()",
  );
});

test("policy builder supports rule-backed policy with lifecycle checks", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const rule = gen.rule.define({
    name: "isOwner",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  gen.authz.policy((p) =>
    p.name("ownerOnly").for(User).rule(rule).surface(gen.authz.surface.entityRead(User)).build(),
  );

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "authz:policy-variable-binding-missing")).toBe(
    true,
  );
});

test("policy builder integrates with lifecycle for missing server enforcement", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const view = gen.ui.view("UserCardView", [], "div");
  const component = gen.ui.component("UserCard", "UserCardProps", [], [], [], view);

  gen.authz.policy((p) =>
    p.name("hintOnly").for(User).surface(gen.authz.surface.uiHint(component)).build(),
  );

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "authz:missing-server-enforcement")).toBe(true);
});

test("policy builder preserves backward compatibility with object form", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const policy = gen.authz.policy({
    name: "legacy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
  });

  expect(policy.name).toBe("legacy");
  expect(policy.target_entity).toBe(User);
  expect(ctx.policies).toContain(policy);
});

test("policy builder surfaces are entity-scoped", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  // This test verifies at compile time that surfaces targeting the policy entity work.
  // A surface for a different entity on a User policy would be a type error.
  const policy = gen.authz.policy((p) =>
    p
      .name("userPolicy")
      .for(User)
      .surface(gen.authz.surface.entityRead(User))
      .surface(gen.authz.surface.fieldRead(User, User.fields.id))
      .surface(gen.authz.surface.fieldWrite(User, User.fields.id))
      .build(),
  );

  expect(policy.access_surface_bindings).toHaveLength(3);
});
