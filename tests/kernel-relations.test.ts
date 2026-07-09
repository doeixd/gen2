import { expect, test } from "vite-plus/test";
import { kernel } from "../src/index.ts";
import {
  ENTITY_NODE_KIND,
  FIELD_NODE_KIND,
  DOMAIN_RELATION_EDGE_KIND,
} from "../src/dialects/domain/entity-field-relation.ts";

test("hasOne produces a 1..1 relation witness", () => {
  const rel = kernel.hasOne(ENTITY_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND });

  expect(rel.kind).toBe("relation");
  expect(rel.target).toBe(ENTITY_NODE_KIND);
  expect(rel.via).toBe(DOMAIN_RELATION_EDGE_KIND);
  expect(rel.cardinality).toEqual({ min: 1, max: 1 });
  expect(rel.required).toBe(true);
});

test("hasOne(...).optional() widens to 0..1", () => {
  const rel = kernel.hasOne(ENTITY_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND }).optional();

  expect(rel.cardinality).toEqual({ min: 0, max: 1 });
  expect(rel.required).toBe(false);
});

test("hasZeroOrOne is explicit 0..1", () => {
  const rel = kernel.hasZeroOrOne(FIELD_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND });
  expect(rel.cardinality).toEqual({ min: 0, max: 1 });
  expect(rel.required).toBe(false);
});

test("hasMany with default options is 0..N", () => {
  const rel = kernel.hasMany(FIELD_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND });
  expect(rel.cardinality).toEqual({ min: 0, max: null });
  expect(rel.required).toBe(false);
});

test("hasMany with min: 1 is required and 1..N", () => {
  const rel = kernel.hasMany(FIELD_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND, min: 1 });
  expect(rel.cardinality).toEqual({ min: 1, max: null });
  expect(rel.required).toBe(true);
});

test("hasMany(...).order attaches an order hint", () => {
  const fieldRef = { id: "field.settledAt" } as const;
  const rel = kernel
    .hasMany(FIELD_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND })
    .order(fieldRef, "desc");

  expect(rel.order).toEqual({ by: fieldRef, direction: "desc" });
});

test("hasRange preserves min and max bounds", () => {
  const rel = kernel.hasRange(FIELD_NODE_KIND, {
    via: DOMAIN_RELATION_EDGE_KIND,
    min: 2,
    max: 5,
  });
  expect(rel.cardinality).toEqual({ min: 2, max: 5 });
  expect(rel.required).toBe(true);
});

test("belongsTo carries flavor for storage lowerings", () => {
  const rel = kernel.belongsTo(ENTITY_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND });
  expect(rel.flavor).toBe("belongsTo");
  expect(rel.cardinality).toEqual({ min: 1, max: 1 });
  expect(rel.required).toBe(true);
});

test("belongsTo(...).optional() yields 0..1", () => {
  const rel = kernel.belongsTo(ENTITY_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND }).optional();
  expect(rel.cardinality).toEqual({ min: 0, max: 1 });
  expect(rel.required).toBe(false);
});

test("endpoint key flows through the witness", () => {
  const rel = kernel.hasOne(ENTITY_NODE_KIND, {
    via: DOMAIN_RELATION_EDGE_KIND,
    endpoint: "to",
  });
  expect(rel.endpoint).toBe("to");
});

test("defineNodeKind(...).relations({...}) attaches the schema as relationSchema", () => {
  const TestNodeKind = kernel.defineNodeKind({ id: "node.kind.test.relAttach" });
  const customerRel = kernel.hasOne(ENTITY_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND });
  const linesRel = kernel.hasMany(FIELD_NODE_KIND, { via: DOMAIN_RELATION_EDGE_KIND, min: 1 });

  const augmented = TestNodeKind.relations({ customer: customerRel, lines: linesRel });

  expect(augmented.id).toBe("node.kind.test.relAttach");
  expect(augmented.relationSchema.customer).toBe(customerRel);
  expect(augmented.relationSchema.lines).toBe(linesRel);
});

test("defineNodeKind without .relations() does not carry relationSchema", () => {
  const TestNodeKind = kernel.defineNodeKind({ id: "node.kind.test.bareRel" });

  expect(typeof TestNodeKind.relations).toBe("function");
  expect((TestNodeKind as { relationSchema?: unknown }).relationSchema).toBeUndefined();
});
