/**
 * Equivalence test — legacy `checkAuthz` vs new graph-native
 * `checkAuthzOnGraph`. Across a representative set of fixtures
 * (clean + every error/warning path), the two functions must produce the
 * same set of diagnostics: same code, same severity. Message text is
 * allowed to vary; in practice we copied it verbatim.
 *
 * If this test fails: either the kernel pass is missing a rule or the
 * dual-write isn't populating the graph correctly. Both are blockers
 * for the lifecycle swap.
 */

import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import { checkAuthz, checkAuthzOnGraph } from "../src/authz/index.ts";

interface DiagFingerprint {
  readonly code: string;
  readonly severity: string;
}

const fingerprints = (
  diagnostics: readonly { readonly code: string; readonly severity: string }[],
): DiagFingerprint[] =>
  [...diagnostics]
    .map((d) => ({ code: d.code, severity: d.severity }))
    .sort((a, b) =>
      a.code === b.code ? a.severity.localeCompare(b.severity) : a.code.localeCompare(b.code),
    );

const assertEquivalent = (
  legacy: readonly { readonly code: string; readonly severity: string }[],
  kernel: readonly { readonly code: string; readonly severity: string }[],
): void => {
  expect(fingerprints(kernel)).toEqual(fingerprints(legacy));
};

test("equivalence: empty context — both produce zero diagnostics", () => {
  const { ctx } = createGen();
  const input = {
    policies: ctx.policies,
    translations: [],
    exposures: [],
    getters: ctx.getters,
    mutators: ctx.mutators,
    entities: ctx.entities,
  };
  assertEquivalent(checkAuthz(input), checkAuthzOnGraph({ graph: ctx.graph, ...input }));
});

test("equivalence: single clean policy — no diagnostics", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.authz.policy({
    name: "userPolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
  });
  const input = {
    policies: ctx.policies,
    translations: [],
    exposures: [],
    getters: ctx.getters,
    mutators: ctx.mutators,
    entities: ctx.entities,
  };
  assertEquivalent(checkAuthz(input), checkAuthzOnGraph({ graph: ctx.graph, ...input }));
});

test("equivalence: policy with rule predicate and variable bindings — no diagnostics", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const isSelf = gen.rule.define({
    name: "isSelf",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("actor", gen.types.uuid()),
      gen.rule.field(User, User.fields.id!, gen.types.uuid()),
    ),
  });
  gen.authz.policy({
    name: "userPolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
    predicate: isSelf,
    variable_bindings: { actor: "actor", resource: "user" },
  });
  const input = {
    policies: ctx.policies,
    translations: [],
    exposures: [],
    getters: ctx.getters,
    mutators: ctx.mutators,
    entities: ctx.entities,
  };
  assertEquivalent(checkAuthz(input), checkAuthzOnGraph({ graph: ctx.graph, ...input }));
});

test("equivalence: policy-variable-binding-missing warning", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const isSelf = gen.rule.define({
    name: "isSelf",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("actor", gen.types.uuid()),
      gen.rule.field(User, User.fields.id!, gen.types.uuid()),
    ),
  });
  gen.authz.policy({
    name: "userPolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
    predicate: isSelf,
  });
  const input = {
    policies: ctx.policies,
    translations: [],
    exposures: [],
    getters: ctx.getters,
    mutators: ctx.mutators,
    entities: ctx.entities,
  };
  const legacy = checkAuthz(input);
  const kernel = checkAuthzOnGraph({ graph: ctx.graph, ...input });
  assertEquivalent(legacy, kernel);
  expect(kernel.some((d) => d.code === "authz:policy-variable-binding-missing")).toBe(true);
});

test("equivalence: owner-field-wrong-entity error", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { id: gen.types.uuid(), author_id: gen.types.uuid() });
  gen.authz.dynamicPolicy({
    name: "postPolicy",
    target_entity: Post,
    actions: [
      {
        action_name: "read",
        condition: { kind: "AllowOwner", owner_field: User.fields.id! },
      },
    ],
  });
  const input = {
    policies: ctx.policies,
    translations: [],
    exposures: [],
    getters: ctx.getters,
    mutators: ctx.mutators,
    entities: ctx.entities,
  };
  const legacy = checkAuthz(input);
  const kernel = checkAuthzOnGraph({ graph: ctx.graph, ...input });
  assertEquivalent(legacy, kernel);
  expect(kernel.some((d) => d.code === "authz:owner-field-wrong-entity")).toBe(true);
});

test("equivalence: multiple policies in one context", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { id: gen.types.uuid(), author_id: gen.types.uuid() });
  gen.authz.policy({
    name: "userPolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
  });
  gen.authz.policy({
    name: "postPolicy",
    target_entity: Post,
    actions: [{ action_name: "read", condition: gen.authz.allowPublic() }],
  });
  const input = {
    policies: ctx.policies,
    translations: [],
    exposures: [],
    getters: ctx.getters,
    mutators: ctx.mutators,
    entities: ctx.entities,
  };
  assertEquivalent(checkAuthz(input), checkAuthzOnGraph({ graph: ctx.graph, ...input }));
});
