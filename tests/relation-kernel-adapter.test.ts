/**
 * Adapter tests — Relation → kernel IR.
 *
 * Snapshot the edge shape (kind, endpoint roles, cardinalities, traits)
 * for each RelationKind. These pin what dual-write registers in PR 4 and
 * what the rebuilt relation checker reads in PR 5.
 */

import { expect, test } from "vite-plus/test";
import { createGen, kernel } from "../src/index.ts";
import { entityNodeRef, relationToKernelEdge, relationTraits } from "../src/relation/kernel.ts";
import { DOMAIN_RELATION_EDGE_KIND } from "../src/dialects/domain/entity-field-relation.ts";

const buildEntities = () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", {
    id: gen.types.uuid(),
    author_id: gen.types.uuid(),
  });
  const Profile = gen.entity("Profile", {
    id: gen.types.uuid(),
    user_id: gen.types.uuid(),
  });
  const Group = gen.entity("Group", { id: gen.types.uuid() });
  const Manager = gen.entity("Manager", {
    id: gen.types.uuid(),
    parent_id: gen.types.uuid(),
  });
  return { gen, User, Post, Profile, Group, Manager };
};

test("relationToKernelEdge: 1:1 — cardinalities one/one and ONE_TO_ONE trait", () => {
  const { gen, User, Profile } = buildEntities();
  const r = gen.relation({
    name: "profile",
    kind: "one_to_one",
    from_entity: User,
    to_entity: Profile,
    from_field: User.fields.id!,
    to_field: Profile.fields.user_id!,
  });

  const edge = relationToKernelEdge(r);

  expect(edge.kind.id).toBe(DOMAIN_RELATION_EDGE_KIND.id);
  expect(edge.kind).not.toBe(kernel.edgeKinds.DOMAIN_RELATION);
  expect(edge.endpoints).toHaveLength(4);
  expect(edge.endpoints[0]!.role.id).toBe(DOMAIN_RELATION_EDGE_KIND.endpoints[0]!.id);
  expect(edge.endpoints[0]!.target).toEqual(entityNodeRef(User));
  expect(edge.endpoints[0]!.cardinality).toBe("one");
  expect(edge.endpoints[1]!.role.id).toBe(DOMAIN_RELATION_EDGE_KIND.endpoints[1]!.id);
  expect(edge.endpoints[1]!.target).toEqual(entityNodeRef(Profile));
  expect(edge.endpoints[1]!.cardinality).toBe("one");
  expect(edge.endpoints[2]!.role.id).toBe(DOMAIN_RELATION_EDGE_KIND.endpoints[2]!.id);
  expect(edge.endpoints[3]!.role.id).toBe(DOMAIN_RELATION_EDGE_KIND.endpoints[3]!.id);
  expect(edge.traits).toContain(relationTraits.ONE_TO_ONE);
});

test("relationToKernelEdge: 1:N (many_to_one) — from-side many, to-side one", () => {
  const { gen, User, Post } = buildEntities();
  const r = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id!,
    to_field: User.fields.id!,
  });

  const edge = relationToKernelEdge(r);

  // many_to_one: from is "many" (many Posts), to is "one" (one User).
  expect(edge.endpoints[0]!.cardinality).toBe("many");
  expect(edge.endpoints[1]!.cardinality).toBe("one");
  expect(edge.traits).toContain(relationTraits.MANY_TO_ONE);
});

test("relationToKernelEdge: 1:N (one_to_many) — from-side one, to-side many", () => {
  const { gen, User, Post } = buildEntities();
  const r = gen.relation({
    name: "posts",
    kind: "one_to_many",
    from_entity: User,
    to_entity: Post,
    from_field: User.fields.id!,
    to_field: Post.fields.author_id!,
  });

  const edge = relationToKernelEdge(r);

  expect(edge.endpoints[0]!.cardinality).toBe("one");
  expect(edge.endpoints[1]!.cardinality).toBe("many");
  expect(edge.traits).toContain(relationTraits.ONE_TO_MANY);
});

test("relationToKernelEdge: N:M — both endpoints many", () => {
  const { gen, User, Group } = buildEntities();
  const r = gen.relation({
    name: "membership",
    kind: "many_to_many",
    from_entity: User,
    to_entity: Group,
    from_field: User.fields.id!,
    to_field: Group.fields.id!,
  });

  const edge = relationToKernelEdge(r);

  expect(edge.endpoints[0]!.cardinality).toBe("many");
  expect(edge.endpoints[1]!.cardinality).toBe("many");
  expect(edge.traits).toContain(relationTraits.MANY_TO_MANY);
});

test("relationToKernelEdge: self-referential — endpoints both target the same entity", () => {
  const { gen, Manager } = buildEntities();
  const r = gen.relation({
    name: "reportsTo",
    kind: "many_to_one",
    from_entity: Manager,
    to_entity: Manager,
    from_field: Manager.fields.parent_id!,
    to_field: Manager.fields.id!,
  });

  const edge = relationToKernelEdge(r);

  expect(edge.endpoints[0]!.target).toEqual(entityNodeRef(Manager));
  expect(edge.endpoints[1]!.target).toEqual(entityNodeRef(Manager));
});

test("relationToKernelEdge: integrity mode lifts to a typed trait", () => {
  const { gen, User, Post } = buildEntities();
  const r = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id!,
    to_field: User.fields.id!,
    integrity: { kind: "database_foreign_key" },
  });

  const edge = relationToKernelEdge(r);

  expect(edge.traits).toContain(relationTraits.INTEGRITY_DB_FK);
});

test("relationToKernelEdge is pure — does not mutate an unrelated ctx.graph", () => {
  // Build the relation in one ctx, then assert calling the adapter does
  // not touch a separate, unrelated ctx's graph.
  const { gen, User, Post } = buildEntities();
  const r = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id!,
    to_field: User.fields.id!,
  });

  const { ctx: unrelated } = createGen();
  const before = unrelated.graph.edges.size;
  relationToKernelEdge(r);
  expect(unrelated.graph.edges.size).toBe(before);
});
