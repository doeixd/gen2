/**
 * Track R §R2 — `legalize.rule.toRlsPolicy` (graph-native).
 *
 * Verifies the pass walks the graph alone (typed `PolicyNodeCustom`
 * payload + edges + `kernelExprToSql`) and emits a `pg.rls-policy`
 * artifact for each translatable policy/rule/entity triple. No
 * `_bridge*` JS-object lookups, no `passCtx.options.genContext` reads.
 */

import { expect, test } from "vite-plus/test";
import { check } from "../src/lifecycle/lifecycle.ts";
import { createGen } from "../src/index.ts";
import { string as stringType, uuid as uuidType } from "../src/types/semantic.ts";
import { allowAuthenticated } from "../src/authz/authz.ts";
import { ruleEq, ruleField, ruleVar } from "../src/rules/rules.ts";

const buildScenario = () => {
  const { ctx, gen } = createGen();

  const Post = gen.entity(
    "Post",
    { id: gen.types.uuid(), owner_id: gen.types.uuid() },
    { store_name: "posts" },
  );

  const isOwner = gen.rule.define({
    name: "isOwner",
    vars: [ruleVar("actor_id", uuidType())],
    when: ruleEq(
      ruleField(Post, Post.fields.owner_id, uuidType()),
      ruleVar("actor_id", uuidType()),
    ),
  });

  const policy = gen.authz.policy({
    name: "postOwnership",
    target_entity: Post,
    actions: [{ action_name: "read", condition: allowAuthenticated() }],
    predicate: isOwner,
  });

  return { ctx, gen, Post, isOwner, policy };
};

test("RLS pass emits a postgres rls-policy artifact for a translatable rule", () => {
  const { ctx } = buildScenario();
  check(ctx);

  const rls = ctx.artifacts.filter((a) => a.language === "postgres");
  expect(rls.length).toBeGreaterThan(0);

  const policy = rls[0]!;
  expect(policy.path).toBe("policies/isOwner_policy.sql");
  expect(policy.content).toContain("CREATE POLICY");
  expect(policy.content).toContain('"isOwner_policy"');
  expect(policy.content).toContain('"posts"');
  // Field reference with `tableAlias: "row"` and bind parameter form.
  expect(policy.content).toContain("row.owner_id");
  expect(policy.content).toContain(":actor_id");
});

test("RLS pass produces an info diagnostic for entities without store_name", () => {
  const { ctx, gen } = createGen();
  const Comment = gen.entity("Comment", {
    id: gen.types.uuid(),
    body: gen.types.string(),
  });
  const allowAll = gen.rule.define({
    name: "allowAll",
    vars: [],
    when: ruleEq(
      ruleField(Comment, Comment.fields.body, stringType()),
      gen.rule.literal("ok", stringType()),
    ),
  });
  gen.authz.policy({
    name: "commentPolicy",
    target_entity: Comment,
    actions: [{ action_name: "read", condition: allowAuthenticated() }],
    predicate: allowAll,
  });

  const result = check(ctx);

  const rlsArtifacts = ctx.artifacts.filter((a) => a.language === "postgres");
  expect(rlsArtifacts.length).toBe(0);

  const rlsDiag = result.diagnostics.find((d) => d.code === "rule:rls-not-translatable");
  expect(rlsDiag).toBeDefined();
  expect(rlsDiag?.severity).toBe("info");
});

test("RLS pass leaves the run successful — RLS failure is non-fatal", () => {
  const { ctx } = buildScenario();
  const result = check(ctx);
  expect(result.status).not.toBe("has_errors");
});

test("RLS pass does not depend on any _bridge* metadata", () => {
  // Concrete enforcement of PLAN.md §0.5 #8: read the source and
  // assert it doesn't reach for `_bridgePolicy`, `_bridgeEntity`,
  // `_bridgeRule`, `_bridgeActionFunction`, etc.
  // (Read-only test — no `as any` casts.)
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const pass = fs.readFileSync(path.resolve(__dirname, "../src/rules/rls-pass.ts"), "utf8");
  // The file may *describe* `_bridge*` in comments, but should not
  // *read* `metadata.custom._bridgeRule`, etc. — strip JS comments
  // before checking.
  const stripped = pass
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, (_m, p: string) => p);
  // The full `_bridge*` family is now retired (PLAN.md §0.5 #8 — see
  // `tests/architecture/bridge-surface-sweep.test.ts`). Keep an
  // explicit assertion here as a localized stop-the-bleed.
  for (const key of [
    "_bridgePolicy",
    "_bridgeRule",
    "_bridgeActionFunction",
    "_bridgeQueryFunction",
    "_bridgeEntity",
    "_bridgeKeyFamily",
    "_bridgeRef",
  ]) {
    expect(stripped).not.toContain(key);
  }
});
