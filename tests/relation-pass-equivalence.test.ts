/**
 * Equivalence test — legacy `checkRelations` vs new graph-native
 * `checkRelationsOnGraph`. Across a representative set of fixtures
 * (clean + every error path), the two functions must produce the same
 * set of diagnostics: same code, same severity. Message text is allowed
 * to vary; in practice we copied it verbatim.
 *
 * If this test fails: either the kernel pass is missing a rule or the
 * dual-write isn't populating the graph correctly. Both are blockers
 * for the lifecycle swap in the same PR.
 */

import { expect, test } from "vite-plus/test";
import { createGen, relation } from "../src/index.ts";
import { checkRelationsOnGraph } from "../src/relation/checks-kernel.ts";

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
  const legacy = relation.checkRelations(ctx.relations);
  const kernel = checkRelationsOnGraph(ctx.graph);
  assertEquivalent(legacy, kernel);
  expect(kernel).toHaveLength(0);
});

test("equivalence: clean 1:1 relation — no diagnostics from either", () => {
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
    from_field: User.fields.id!,
    to_field: Profile.fields.user_id!,
  });
  assertEquivalent(relation.checkRelations(ctx.relations), checkRelationsOnGraph(ctx.graph));
});

test("equivalence: m2m without link_entity — both emit relations:m2m-missing-link", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Group = gen.entity("Group", { id: gen.types.uuid() });
  gen.relation({
    name: "membership",
    kind: "many_to_many",
    from_entity: User,
    to_entity: Group,
    from_field: User.fields.id!,
    to_field: Group.fields.id!,
  });

  const legacy = relation.checkRelations(ctx.relations);
  const kernel = checkRelationsOnGraph(ctx.graph);
  assertEquivalent(legacy, kernel);
  expect(kernel.some((d) => d.code === "relations:m2m-missing-link")).toBe(true);
});

test("equivalence: cross-store database FK — both emit relations:cross-store-fk", () => {
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
    from_field: Event.fields.user_id!,
    to_field: User.fields.id!,
    integrity: { kind: "database_foreign_key" },
  });
  assertEquivalent(relation.checkRelations(ctx.relations), checkRelationsOnGraph(ctx.graph));
});

test("equivalence: setNull on non-nullable field — both emit relations:set-null-non-nullable", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", {
    id: gen.types.uuid(),
    author_id: { type: gen.types.uuid(), nullable: false },
  });
  gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id!,
    to_field: User.fields.id!,
    foreign_key: { on_delete: "set_null", on_update: "no_action", indexed: true },
  });
  assertEquivalent(relation.checkRelations(ctx.relations), checkRelationsOnGraph(ctx.graph));
});

test("equivalence: multiple relations in one context", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", {
    id: gen.types.uuid(),
    author_id: gen.types.uuid(),
  });
  const Tag = gen.entity("Tag", { id: gen.types.uuid() });
  gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id!,
    to_field: User.fields.id!,
  });
  // m2m without link — expect a diagnostic.
  gen.relation({
    name: "tagging",
    kind: "many_to_many",
    from_entity: Post,
    to_entity: Tag,
    from_field: Post.fields.id!,
    to_field: Tag.fields.id!,
  });
  assertEquivalent(relation.checkRelations(ctx.relations), checkRelationsOnGraph(ctx.graph));
});
