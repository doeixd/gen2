/**
 * Golden lifecycle snapshots — pin current observable behavior before the
 * kernel rebase migrates checkers/emitters off the legacy `GenContext` arrays.
 *
 * Why: PRs in the rebase do dual-write (legacy + kernel graph) and pass
 * migration. The test contract is "lifecycle output stays byte-identical."
 * These snapshots make any unintended drift fail loudly.
 *
 * What is snapshotted: a deterministic projection of `lifecycle.check` /
 * `lifecycle.generate` results — diagnostic codes (sorted, with severity),
 * counts of major ctx collections, and the names+kinds of generated artifacts
 * for the target-emission scenario.
 *
 * What is NOT snapshotted: full diagnostic messages (locale-sensitive),
 * artifact bodies (size churn), and any non-deterministic IDs.
 *
 * If a snapshot diff appears: confirm the change is intentional (e.g. a
 * checker improvement), update the snapshot with `vp test -u`, and document
 * the behavior change in the PR description.
 */

import { expect, test } from "vite-plus/test";
import { createGen, lifecycle } from "../../src/index.ts";
import { getRefsFromGraph } from "../../src/core/refs.ts";

interface LifecycleSummary {
  readonly status: string;
  readonly diagnostics: readonly { readonly severity: string; readonly code: string }[];
  readonly counts: Record<string, number>;
}

type CheckResult = ReturnType<typeof lifecycle.check>;

const summarize = (
  ctx: ReturnType<typeof createGen>["ctx"],
  result: CheckResult,
  countKeys: readonly (keyof typeof ctx)[],
): LifecycleSummary => {
  const counts: Record<string, number> = {};
  for (const key of countKeys) {
    const value = ctx[key];
    counts[key as string] = Array.isArray(value) ? value.length : 0;
  }
  const diagnostics = [...result.diagnostics]
    .map((d) => ({ severity: d.severity, code: d.code }))
    .sort((a, b) =>
      a.code === b.code ? a.severity.localeCompare(b.severity) : a.code.localeCompare(b.code),
    );
  return { status: result.status, diagnostics, counts };
};

// --- 1. Empty context -----------------------------------------------------

test("golden: empty context — check is ok with no diagnostics", () => {
  const { ctx } = createGen();
  const result = lifecycle.check(ctx);
  const summary = summarize(ctx, result, ["entities", "relations", "policies"]);
  expect(summary).toMatchInlineSnapshot(`
  	{
  	  "counts": {
  	    "entities": 0,
  	    "policies": 0,
  	    "relations": 0,
  	  },
  	  "diagnostics": [],
  	  "status": "ok",
  	}
  `);
});

// --- 2. Entity + field ----------------------------------------------------

test("golden: entity with fields — registers and checks clean", () => {
  const { ctx, gen } = createGen();
  gen.entity("User", {
    id: gen.types.uuid(),
    email: gen.types.email(),
    name: gen.types.string(),
  });
  const result = lifecycle.check(ctx);
  const summary = summarize(ctx, result, ["entities"]);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  (summary.counts as Record<string, number>).refs = getRefsFromGraph(ctx.graph).length;
  expect(summary).toMatchInlineSnapshot(`
  	{
  	  "counts": {
  	    "entities": 1,
  	    "refs": 4,
  	  },
  	  "diagnostics": [
  	    {
  	      "code": "ref:missing-stable-id",
  	      "severity": "warning",
  	    },
  	  ],
  	  "status": "has_warnings",
  	}
  `);
});

// --- 3. Relation 1:1 ------------------------------------------------------

test("golden: 1:1 relation — clean check", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Profile = gen.entity("Profile", {
    id: gen.types.uuid(),
    user_id: gen.types.uuid(),
  });
  gen.relation({
    name: "profile",
    kind: "one_to_one",
    from_entity: User,
    to_entity: Profile,
    from_field: User.fields.id,
    to_field: Profile.fields.user_id,
  });
  const result = lifecycle.check(ctx);
  const summary = summarize(ctx, result, ["entities", "relations"]);
  expect(summary).toMatchInlineSnapshot(`
  	{
  	  "counts": {
  	    "entities": 2,
  	    "relations": 1,
  	  },
  	  "diagnostics": [
  	    {
  	      "code": "ref:missing-stable-id",
  	      "severity": "warning",
  	    },
  	    {
  	      "code": "ref:missing-stable-id",
  	      "severity": "warning",
  	    },
  	  ],
  	  "status": "has_warnings",
  	}
  `);
});

// --- 4. Relation 1:N ------------------------------------------------------

test("golden: 1:N relation — clean check", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", {
    id: gen.types.uuid(),
    author_id: gen.types.uuid(),
  });
  gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id,
    to_field: User.fields.id,
  });
  const result = lifecycle.check(ctx);
  const summary = summarize(ctx, result, ["entities", "relations"]);
  expect(summary).toMatchInlineSnapshot(`
  	{
  	  "counts": {
  	    "entities": 2,
  	    "relations": 1,
  	  },
  	  "diagnostics": [
  	    {
  	      "code": "ref:missing-stable-id",
  	      "severity": "warning",
  	    },
  	    {
  	      "code": "ref:missing-stable-id",
  	      "severity": "warning",
  	    },
  	  ],
  	  "status": "has_warnings",
  	}
  `);
});

// --- 5. Relation N:M missing link entity (error fixture) ------------------

test("golden: N:M relation without link entity — m2m-missing-link diagnostic", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Group = gen.entity("Group", { id: gen.types.uuid() });
  gen.relation({
    name: "membership",
    kind: "many_to_many",
    from_entity: User,
    to_entity: Group,
    from_field: User.fields.id,
    to_field: Group.fields.id,
  });
  const result = lifecycle.check(ctx);
  const summary = summarize(ctx, result, ["entities", "relations"]);

  // Pin the headline diagnostic explicitly so a regression that drops
  // m2m-missing-link cannot be hidden by an accidental snapshot update.
  expect(summary.status).toBe("has_errors");
  expect(summary.diagnostics.some((d) => d.code === "relations:m2m-missing-link")).toBe(true);

  expect(summary).toMatchInlineSnapshot(`
  	{
  	  "counts": {
  	    "entities": 2,
  	    "relations": 1,
  	  },
  	  "diagnostics": [
  	    {
  	      "code": "ref:missing-stable-id",
  	      "severity": "warning",
  	    },
  	    {
  	      "code": "ref:missing-stable-id",
  	      "severity": "warning",
  	    },
  	    {
  	      "code": "relations:m2m-missing-link",
  	      "severity": "error",
  	    },
  	  ],
  	  "status": "has_errors",
  	}
  `);
});

// --- 6. Rule + policy + entity --------------------------------------------

test("golden: rule + authz policy on entity — clean check", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.rule.define({
    name: "isSelf",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("actor", gen.types.uuid()),
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
    ),
  });
  gen.authz.policy({
    name: "userPolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
  });
  const result = lifecycle.check(ctx);
  const summary = summarize(ctx, result, ["entities", "policies"]);
  expect(summary).toMatchInlineSnapshot(`
  	{
  	  "counts": {
  	    "entities": 1,
  	    "policies": 1,
  	  },
  	  "diagnostics": [
  	    {
  	      "code": "obligation:required-pending",
  	      "severity": "info",
  	    },
  	    {
  	      "code": "obligation:unhandled",
  	      "severity": "warning",
  	    },
  	    {
  	      "code": "ref:missing-stable-id",
  	      "severity": "warning",
  	    },
  	    {
  	      "code": "rules-reactivity:ivm-delta-supported",
  	      "severity": "info",
  	    },
  	  ],
  	  "status": "has_warnings",
  	}
  `);
});

// --- 7. Query function on entity ------------------------------------------

test("golden: query function reads entity — clean check", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });
  const result = lifecycle.check(ctx);
  const summary = summarize(ctx, result, ["entities", "queries"]);
  expect(summary).toMatchInlineSnapshot(`
  	{
  	  "counts": {
  	    "entities": 1,
  	    "queries": 1,
  	  },
  	  "diagnostics": [
  	    {
  	      "code": "boundary:transport-auth-missing",
  	      "severity": "hint",
  	    },
  	    {
  	      "code": "ref:missing-stable-id",
  	      "severity": "warning",
  	    },
  	  ],
  	  "status": "has_warnings",
  	}
  `);
});

// --- 8. Cross-store FK rejection (error fixture) --------------------------

test("golden: cross-store FK is rejected", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() }, { store_name: "primary" });
  const Event = gen.entity(
    "Event",
    { id: gen.types.uuid(), user_id: gen.types.uuid() },
    { store_name: "analytics" },
  );
  gen.relation({
    name: "owner",
    kind: "many_to_one",
    from_entity: Event,
    to_entity: User,
    from_field: Event.fields.user_id,
    to_field: User.fields.id,
    integrity: { kind: "database_foreign_key" },
  });
  const result = lifecycle.check(ctx);
  const summary = summarize(ctx, result, ["entities", "relations", "stores"]);

  expect(summary.status).toBe("has_errors");
  expect(summary.diagnostics.some((d) => d.code === "relations:cross-store-fk")).toBe(true);

  expect(summary).toMatchInlineSnapshot(`
  	{
  	  "counts": {
  	    "entities": 2,
  	    "relations": 1,
  	    "stores": 0,
  	  },
  	  "diagnostics": [
  	    {
  	      "code": "ref:missing-stable-id",
  	      "severity": "warning",
  	    },
  	    {
  	      "code": "ref:missing-stable-id",
  	      "severity": "warning",
  	    },
  	    {
  	      "code": "relations:cross-store-fk",
  	      "severity": "error",
  	    },
  	  ],
  	  "status": "has_errors",
  	}
  `);
});
