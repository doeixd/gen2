import { describe, expectTypeOf, test } from "vite-plus/test";
import { kernel } from "../src/index.ts";
import {
  ENTITY_NODE_KIND,
  FIELD_NODE_KIND,
  DOMAIN_RELATION_EDGE_KIND,
} from "../src/dialects/domain/entity-field-relation.ts";

describe("kernel relation witnesses", () => {
  test("hasOne preserves target, via, and cardinality witnesses", () => {
    const rel = kernel.hasOne(ENTITY_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND });

    expectTypeOf(rel.target).toEqualTypeOf<typeof ENTITY_NODE_KIND>();
    expectTypeOf(rel.via).toEqualTypeOf<typeof DOMAIN_RELATION_EDGE_KIND>();
    expectTypeOf(rel.cardinality.min).toEqualTypeOf<1>();
    expectTypeOf(rel.cardinality.max).toEqualTypeOf<1>();
    expectTypeOf(rel.required).toEqualTypeOf<true>();
  });

  test("hasOne(...).optional() widens to 0..1 and marks required false", () => {
    const rel = kernel.hasOne(ENTITY_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND }).optional();

    expectTypeOf(rel.cardinality.min).toEqualTypeOf<0>();
    expectTypeOf(rel.cardinality.max).toEqualTypeOf<1>();
    expectTypeOf(rel.required).toEqualTypeOf<false>();
  });

  test("hasZeroOrOne preserves 0..1 cardinality", () => {
    const rel = kernel.hasZeroOrOne(ENTITY_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND });

    expectTypeOf(rel.cardinality.min).toEqualTypeOf<0>();
    expectTypeOf(rel.cardinality.max).toEqualTypeOf<1>();
    expectTypeOf(rel.required).toEqualTypeOf<false>();
  });

  test("hasMany with default min infers 0..N and required false", () => {
    const rel = kernel.hasMany(FIELD_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND });

    expectTypeOf(rel.cardinality.min).toEqualTypeOf<0>();
    expectTypeOf(rel.cardinality.max).toEqualTypeOf<null>();
    expectTypeOf(rel.required).toEqualTypeOf<false>();
  });

  test("hasMany with min: 1 infers required true", () => {
    const rel = kernel.hasMany(FIELD_NODE_KIND, {
      via: DOMAIN_RELATION_EDGE_KIND,
      min: 1,
    });

    expectTypeOf(rel.cardinality.min).toEqualTypeOf<1>();
    expectTypeOf(rel.required).toEqualTypeOf<true>();
  });

  test("hasMany(...).order(field, direction) preserves the relation witness shape", () => {
    const fieldRef = { id: "field.settledAt" } as const;
    const rel = kernel
      .hasMany(FIELD_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND })
      .order(fieldRef, "desc");

    // Cardinality/target/via inference survives `.order(...)`.
    expectTypeOf(rel.target).toEqualTypeOf<typeof FIELD_NODE_KIND>();
    expectTypeOf(rel.via).toEqualTypeOf<typeof DOMAIN_RELATION_EDGE_KIND>();
    expectTypeOf(rel.cardinality.min).toEqualTypeOf<0>();
    // Order literals are now preserved through `.order(...)`.
    expectTypeOf(rel.order.by.id).toEqualTypeOf<"field.settledAt">();
    expectTypeOf(rel.order.direction).toEqualTypeOf<"desc">();
  });

  test("hasRange enforces both bounds in cardinality", () => {
    const rel = kernel.hasRange(FIELD_NODE_KIND, {
      via: DOMAIN_RELATION_EDGE_KIND,
      min: 2,
      max: 5,
    });

    expectTypeOf(rel.cardinality.min).toEqualTypeOf<2>();
    expectTypeOf(rel.cardinality.max).toEqualTypeOf<5>();
    expectTypeOf(rel.required).toEqualTypeOf<true>();
  });

  test("belongsTo carries flavor tag for storage lowerings", () => {
    const rel = kernel.belongsTo(ENTITY_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND });

    expectTypeOf(rel.flavor).toEqualTypeOf<"belongsTo">();
    expectTypeOf(rel.cardinality.min).toEqualTypeOf<1>();
    expectTypeOf(rel.cardinality.max).toEqualTypeOf<1>();
    expectTypeOf(rel.required).toEqualTypeOf<true>();
  });

  test("endpoint key narrows when provided", () => {
    const rel = kernel.hasOne(ENTITY_NODE_KIND, {
      via: DOMAIN_RELATION_EDGE_KIND,
      endpoint: "to",
    });

    expectTypeOf(rel.endpoint).toEqualTypeOf<"to" | undefined>();
  });

  test("RelationTarget / RelationVia helpers extract witnesses", () => {
    const rel = kernel.hasOne(ENTITY_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND });

    expectTypeOf<kernel.RelationTarget<typeof rel>>().toEqualTypeOf<typeof ENTITY_NODE_KIND>();
    expectTypeOf<kernel.RelationVia<typeof rel>>().toEqualTypeOf<
      typeof DOMAIN_RELATION_EDGE_KIND
    >();
  });

  test("defineNodeKind(...).relations({...}) preserves the schema in the node kind", () => {
    const TestNodeKind = kernel.defineNodeKind({ id: "node.kind.test.withRelations" });
    const augmented = TestNodeKind.relations({
      target: kernel.hasOne(ENTITY_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND }),
      children: kernel.hasMany(FIELD_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND, min: 1 }),
    });

    // Base node kind id and shape are preserved.
    expectTypeOf(augmented.id).toMatchTypeOf<string>();
    // Relations schema is carried in the type via `.relationSchema`.
    expectTypeOf(augmented.relationSchema.target.target).toEqualTypeOf<typeof ENTITY_NODE_KIND>();
    expectTypeOf(augmented.relationSchema.target.cardinality.min).toEqualTypeOf<1>();
    expectTypeOf(augmented.relationSchema.children.target).toEqualTypeOf<typeof FIELD_NODE_KIND>();
    expectTypeOf(augmented.relationSchema.children.cardinality.min).toEqualTypeOf<1>();
    expectTypeOf(augmented.relationSchema.children.required).toEqualTypeOf<true>();
  });

  test("defineNodeKind exposes .relations(...) as a function on the bare builder", () => {
    const TestNodeKind = kernel.defineNodeKind({ id: "node.kind.test.bare" });

    expectTypeOf(TestNodeKind.relations).toBeFunction();
  });

  test(".relations({...}) rejects non-relation schema entries", () => {
    const TestNodeKind = kernel.defineNodeKind({ id: "node.kind.test.invalidSchema" });

    TestNodeKind.relations({
      ok: kernel.hasOne(ENTITY_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND }),
    });

    TestNodeKind.relations({
      // @ts-expect-error schema entries must be RelationWitness-shaped
      notARelation: { foo: "bar" },
    });
  });
});
