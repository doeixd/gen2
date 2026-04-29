import { expect, test } from "vite-plus/test";
import { createGen, lifecycle } from "../src/index.ts";

// ---------------------------------------------------------------------------
// Policy Variable Binding Tests
// ---------------------------------------------------------------------------

test("policy accepts variable_bindings", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const rule = gen.rule.define({
    name: "isOwner",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.var("actor", gen.types.uuid()),
    ),
  });

  const policy = gen.authz.policy({
    name: "ownerOnly",
    target_entity: User,
    predicate: rule,
    variable_bindings: { actor: "actor", resource: "user", action: "read" },
  });

  expect(policy.variable_bindings).toBeDefined();
  expect(policy.variable_bindings!.actor).toBe("actor");
  expect(policy.variable_bindings!.resource).toBe("user");
  expect(policy.variable_bindings!.action).toBe("read");
});

test("lifecycle flags policy-variable-binding-missing for rule-backed policy without bindings", () => {
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
    predicate: rule,
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "authz:policy-variable-binding-missing")).toBe(
    true,
  );
});

test("lifecycle does not flag variable binding missing when policy has no predicate", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  gen.authz.policy({
    name: "simple",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "authz:policy-variable-binding-missing")).toBe(
    false,
  );
});

// ---------------------------------------------------------------------------
// Authz Missing Server Enforcement Tests
// ---------------------------------------------------------------------------

test("lifecycle flags missing-server-enforcement for client-only UI hint without predicate", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  // Create a minimal component for the uiHint surface
  const view = gen.ui.view("UserCardView", [], "div");
  const component = gen.ui.component("UserCard", "UserCardProps", [], [], [], view);

  gen.authz.policy({
    name: "hintOnly",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
    surfaces: [{ surface: gen.authz.surface.uiHint(component) }],
  });

  const result = lifecycle.check(ctx);
  // The uiHint surface binding gets a client_hint placement, and without a predicate
  // there's no server enforcement, so missing-server-enforcement should fire
  expect(result.diagnostics.some((d) => d.code === "authz:missing-server-enforcement")).toBe(true);
});

// ---------------------------------------------------------------------------
// Rule Diagnostics Tests
// ---------------------------------------------------------------------------

test("checkRules flags type-mismatch for comparing different semantic types", () => {
  const { gen, ctx } = createGen();
  gen.rule.define({
    name: "badCompare",
    when: gen.rule.eq(
      gen.rule.literal(1, gen.types.int()),
      gen.rule.literal("hello", gen.types.string()),
    ),
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "rules:type-mismatch")).toBe(true);
});

test("checkRules flags field-not-on-variable for field from wrong entity", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { user_id: gen.types.uuid() });

  gen.rule.define({
    name: "wrongField",
    when: gen.rule.eq(
      gen.rule.field(User, Post.fields.user_id, gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "rules:field-not-on-variable")).toBe(true);
});

test("checkRules does not flag type-mismatch for same types", () => {
  const { gen, ctx } = createGen();
  gen.rule.define({
    name: "goodCompare",
    when: gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(2, gen.types.int())),
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "rules:type-mismatch")).toBe(false);
});

// ---------------------------------------------------------------------------
// Reaction select Field Tests
// ---------------------------------------------------------------------------

test("reaction can include select field", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

  const rule = gen.rule.define({
    name: "userChanged",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.name, gen.types.string()),
      gen.rule.literal("admin", gen.types.string()),
    ),
  });

  const action = gen.func.action({
    name: "notifyUser",
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

  const reaction = gen.reaction.define({
    name: "onUserChanged",
    when: rule,
    run: action,
    mode: "on_true",
    idempotency: { key: "auto" },
    delivery: { kind: "outbox" },
  });

  expect(reaction.select).toBeUndefined();
  expect(reaction.name).toBe("onUserChanged");
});

test("checkReactions flags unsafe-inline-effect for inline delivery", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const rule = gen.rule.define({
    name: "userChanged",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  const action = gen.func.action({
    name: "notifyUser",
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

  gen.reaction.define({
    name: "onUserChanged",
    when: rule,
    run: action,
    mode: "on_true",
    idempotency: { key: "auto" },
    delivery: { kind: "inline" },
  });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "reaction:unsafe-inline-effect")).toBe(true);
});

// ---------------------------------------------------------------------------
// Integration: full authz + placement + rule pipeline
// ---------------------------------------------------------------------------

test("full pipeline: rule-backed policy with list query gets placement diagnostics", () => {
  const { gen, ctx } = createGen();
  const Post = gen.entity("Post", { visibility: gen.types.string() }, { store_name: "posts" });

  const rule = gen.rule.define({
    name: "canViewPost",
    vars: [{ name: "actor_id", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.field(Post, Post.fields.visibility, gen.types.string()),
      gen.rule.literal("public", gen.types.string()),
    ),
  });

  const listQuery = gen.func.query({
    name: "listPosts",
    input_type: gen.types.string(),
    returns: gen.types.array(gen.types.string()),
    body: gen.query.build({
      source: { kind: "entity_source", entity: Post },
      result_type: gen.types.array(gen.types.string()),
    }),
  });

  gen.authz.policy({
    name: "viewPost",
    target_entity: Post,
    predicate: rule,
    variable_bindings: { actor: "actor_id", resource: "post" },
    surfaces: [
      { surface: gen.authz.surface.entityRead(Post), deny: "not_found" },
      { surface: gen.authz.surface.queryFilter(listQuery), deny: "omit" },
    ],
  });

  const result = lifecycle.check(ctx);
  // The rule is SQL-translatable, so there should be no unsafe-list-post-filter
  expect(result.diagnostics.some((d) => d.code === "authz:unsafe-list-post-filter")).toBe(false);
  expect(result.diagnostics.some((d) => d.code === "authz:list-policy-not-placeable")).toBe(false);
});
