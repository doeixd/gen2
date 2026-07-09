/**
 * Auth condition → RuleExpr lowering tests.
 *
 * Validates that `authConditionToRuleExpr` produces the expected `RuleExpr`
 * shapes for conditions that can be lowered, and returns `undefined` for
 * runtime-only conditions.
 */

import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import { authConditionToRuleExpr } from "../src/authz/index.ts";

test("AllowOwner lowers to eq(var(actor), field(entity, owner_field))", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const policy = gen.authz.policy({
    name: "userPolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowOwner(User.fields.id!) }],
  });

  const expr = authConditionToRuleExpr(policy.actions[0]!.condition as any, policy);
  expect(expr).toBeDefined();
  expect(expr!.kind).toBe("rule.eq");
  const eqExpr = expr as any;
  expect(eqExpr.left.kind).toBe("rule.var");
  expect(eqExpr.right.kind).toBe("rule.field");
});

test("AllowRole lowers when target entity has a role field", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), role: gen.types.string() });
  const policy = gen.authz.policy({
    name: "rolePolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowRole("admin") }],
  });

  const expr = authConditionToRuleExpr(policy.actions[0]!.condition as any, policy);
  expect(expr).toBeDefined();
  expect(expr!.kind).toBe("rule.eq");
});

test("AllowRole returns undefined when target entity has no role field", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const policy = gen.authz.policy({
    name: "rolePolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowRole("admin") }],
  });

  const expr = authConditionToRuleExpr(policy.actions[0]!.condition as any, policy);
  expect(expr).toBeUndefined();
});

test("OrCondition lowers recursively when both sides are lowerable", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), role: gen.types.string() });
  const policy = gen.authz.policy({
    name: "orPolicy",
    target_entity: User,
    actions: [
      {
        action_name: "read",
        condition: gen.authz.or(
          gen.authz.allowOwner(User.fields.id!),
          gen.authz.allowRole("admin"),
        ),
      },
    ],
  });

  const expr = authConditionToRuleExpr(policy.actions[0]!.condition as any, policy);
  expect(expr).toBeDefined();
  expect(expr!.kind).toBe("rule.or");
});

test("OrCondition returns single side when other is unlowerable", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const policy = gen.authz.policy({
    name: "orPolicy",
    target_entity: User,
    actions: [
      {
        action_name: "read",
        condition: gen.authz.or(
          gen.authz.allowOwner(User.fields.id!),
          gen.authz.allowAuthenticated(),
        ),
      },
    ],
  });

  const expr = authConditionToRuleExpr(policy.actions[0]!.condition as any, policy);
  expect(expr).toBeDefined();
  expect(expr!.kind).toBe("rule.eq");
});

test("AllowAuthenticated returns undefined", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const policy = gen.authz.policy({
    name: "authPolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
  });

  const expr = authConditionToRuleExpr(policy.actions[0]!.condition as any, policy);
  expect(expr).toBeUndefined();
});

test("AllowRelation lowers to exists when relation has id field", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { id: gen.types.uuid(), author_id: gen.types.uuid() });
  const relation = gen.relation({
    name: "authored",
    kind: "one_to_many",
    from_entity: User,
    to_entity: Post,
    from_field: User.fields.id!,
    to_field: Post.fields.author_id!,
  });
  const policy = gen.authz.policy({
    name: "relPolicy",
    target_entity: Post,
    actions: [{ action_name: "read", condition: gen.authz.allowRelation(relation) }],
  });

  const expr = authConditionToRuleExpr(policy.actions[0]!.condition as any, policy);
  expect(expr).toBeDefined();
  expect(expr!.kind).toBe("rule.exists");
});
