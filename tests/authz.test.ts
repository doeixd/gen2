/**
 * Tests for authorization policy creation and validation, including owner fields,
 * cross-store relation policies, getter mismatches, and safe exposure checks.
 */
import { expect, test } from "vite-plus/test";
import { createGen, authz } from "../src/index.ts";

test("definePolicy wires rules back to the policy", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const p = gen.authz.policy({
    name: "userPolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
  });
  expect(p.actions[0]!.policy).toBe(p);
});

test("checkAuthz flags owner field from wrong entity", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { title: gen.types.string() });
  const p = gen.authz.policy({
    name: "bad",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowOwner(Post.fields.title) }],
  });
  const diags = authz.checkAuthz({ policies: [p], translations: [], exposures: [] });
  expect(diags.some((d) => d.code === "authz:owner-field-wrong-entity")).toBe(true);
});

test("checkAuthz flags policy-entity mismatch on getter", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const mapping = gen.mapping(User, []);
  const getter = {
    name: "getUser",
    target_entity: User,
    by_field: User.fields.id,
    projection: { mapping, fields: [] },
    auth: { action: "read", policy_name: "missing" },
    errors: [],
  };
  const diags = authz.checkAuthz({
    policies: [],
    translations: [],
    exposures: [],
    getters: [getter],
  });
  expect(diags.some((d) => d.code === "authz:policy-entity-mismatch")).toBe(true);
});

test("checkAuthz warns on unenforceable cross-store relation policy", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() }, { store_name: "primary" });
  const Post = gen.entity("Post", { user_id: gen.types.uuid() }, { store_name: "analytics" });
  const r = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.user_id,
    to_field: User.fields.id,
  });
  const p = gen.authz.policy({
    name: "cross",
    target_entity: Post,
    actions: [{ action_name: "read", condition: gen.authz.allowRelation(r) }],
  });
  const diags = authz.checkAuthz({ policies: [p], translations: [], exposures: [] });
  expect(diags.some((d) => d.code === "authz:unenforceable-policy")).toBe(true);
});

test("checkAuthz flags unsafe client exposure", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const p = gen.authz.policy({
    name: "expose",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
  });
  const exposure = {
    policy: p,
    exposed_actions: ["read"],
    server_only_fields_hidden: false,
    safe_to_expose: false,
  };
  const diags = authz.checkAuthz({ policies: [p], translations: [], exposures: [exposure] });
  expect(diags.some((d) => d.code === "authz:unsafe-client-exposure")).toBe(true);
});
