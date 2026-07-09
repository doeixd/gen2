/**
 * Tests for relation entities and relation references, including auto-populated
 * refs, name collision detection with ordinary entities, and type inference helpers.
 */
import { expect, test } from "vite-plus/test";
import { core, createGen, dialects, kernel } from "../src/index.ts";
import { getRefsFromGraph } from "../src/core/refs.ts";
import type { InferRelationFrom, InferRelationTo } from "../src/relation/index.ts";

test("relations have auto-populated refs", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), org_id: gen.types.uuid() });
  const Org = gen.entity("Org", { id: gen.types.uuid() });

  const rel = gen.relation({
    name: "user_org",
    kind: "many_to_one",
    from_entity: User,
    to_entity: Org,
    from_field: User.fields.org_id,
    to_field: Org.fields.id,
  });

  expect(rel.ref.kind).toBe("RelationRef");
  expect(rel.ref.owner.kind).toBe("Relation");
  expect(rel.ref.owner.name).toBe("user_org");
  expect(getRefsFromGraph(ctx.graph)).toContain(rel.ref);
});

test("relations preserve explicit stable IDs", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), org_id: gen.types.uuid() });
  const Org = gen.entity("Org", { id: gen.types.uuid() });

  const rel = gen.relation({
    id: core.relationId({ from: "User", to: "Org" }),
    name: "user_org",
    kind: "many_to_one",
    from_entity: User,
    to_entity: Org,
    from_field: User.fields.org_id,
    to_field: Org.fields.id,
  });

  expect(rel.id).toBe("relation.user.org");
  expect(rel.ref.id).toBe(rel.id);
  expect(core.refIdentity(rel.ref)).toBe("relation.user.org");
  expect(getRefsFromGraph(ctx.graph)).toContain(rel.ref);
});

test("relations expose composable domain graph fragments", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), org_id: gen.types.uuid() });
  const Org = gen.entity("Org", { id: gen.types.uuid() });
  const rel = gen.relation({
    name: "user_org",
    kind: "many_to_one",
    from_entity: User,
    to_entity: Org,
    from_field: User.fields.org_id,
    to_field: Org.fields.id,
  });

  const graph = kernel.graph.pipe(User.fragment, Org.fragment, rel.fragment);

  expect(kernel.nodesOfKindDef(graph, dialects.ENTITY_NODE_KIND)).toHaveLength(2);
  expect(kernel.edgesOfKindDef(graph, dialects.DOMAIN_RELATION_EDGE_KIND)).toHaveLength(1);
});

test("relation shorthand constructors register refs", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), org_id: gen.types.uuid() });
  const Org = gen.entity("Org", { id: gen.types.uuid() });

  const rel = gen.rel.manyToOne(User, Org, User.fields.org_id, Org.fields.id, {
    id: core.relationId({ from: "User", to: "Org", name: "short" }),
  });

  expect(rel.ref.id).toBe("relation.user.org.short");
  expect(ctx.relations).toContain(rel);
  expect(getRefsFromGraph(ctx.graph)).toContain(rel.ref);
});

test("defineRelationEntity creates a RelationEntity with ref", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Role = gen.entity("Role", { id: gen.types.uuid() });

  const re = gen.relationEntity(
    "UserRole",
    [
      { name: "user", target_entity: User, cardinality: "one" },
      { name: "role", target_entity: Role, cardinality: "one" },
    ],
    [User.fields.id, Role.fields.id],
    { id: core.namedRelationIdFor({ name: "user_role" }) },
  );

  expect(re.id).toBe("relation.user_role");
  expect(re.name).toBe("UserRole");
  expect(re.roles).toHaveLength(2);
  expect(re.ref.kind).toBe("RelationRef");
  expect(ctx.relation_entities).toContain(re);
  expect(getRefsFromGraph(ctx.graph)).toContain(re.ref);
});

test("checkRelationEntities detects name collision with ordinary entity", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Role = gen.entity("Role", { id: gen.types.uuid() });

  gen.relationEntity(
    "User",
    [
      { name: "user", target_entity: User, cardinality: "one" },
      { name: "role", target_entity: Role, cardinality: "one" },
    ],
    [User.fields.id, Role.fields.id],
  );

  const result = gen.lifecycle.check(ctx);
  expect(
    result.diagnostics.some((d) => d.code === "relations:relation-entity-name-collision"),
  ).toBe(true);
});

test("InferRelationFrom and InferRelationTo extract types", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), org_id: gen.types.uuid() });
  const Org = gen.entity("Org", { id: gen.types.uuid() });

  const rel = gen.rel.manyToOne(User, Org, User.fields.org_id, Org.fields.id);

  type From = InferRelationFrom<typeof rel>;
  type To = InferRelationTo<typeof rel>;

  const assertFrom = (_: From) => {};
  assertFrom("");

  const assertTo = (_: To) => {};
  assertTo("");

  expect(true).toBe(true);
});
