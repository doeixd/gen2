/**
 * Adapter tests — Entity / Field → kernel IR.
 *
 * Pure-function snapshots of the conversion output. These pin the
 * shape (kinds, endpoint roles, ids, ref targets) so PR 4 (dual-write)
 * cannot accidentally change what gets registered into ctx.graph.
 */

import { expect, test } from "vite-plus/test";
import { createGen, kernel } from "../src/index.ts";
import {
  ENTITY_NODE_KIND,
  ENTITY_NODE_KIND_WITH_RELATIONS,
  ENTITY_OWNS_FIELD_EDGE_KIND,
  FIELD_HAS_TYPE_EDGE_KIND,
  FIELD_NODE_KIND,
  FIELD_NODE_KIND_WITH_RELATIONS,
} from "../src/dialects/domain/entity-field-relation.ts";
import {
  entityToKernelNode,
  entityToFieldNodes,
  entityToFieldEdges,
  fieldToKernelNode,
} from "../src/entity/kernel.ts";

test("entityToKernelNode produces an entity node with ENTITY kind and the entity name", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });

  const node = entityToKernelNode(User);

  expect(node.kind).toBe(kernel.nodeKinds.ENTITY);
  expect(node.name).toBe("User");
  expect(node.id).toBe("node:entity:User");
});

test("entityToFieldNodes produces one FIELD node per declared field, in declaration order", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    email: gen.types.email(),
    name: gen.types.string(),
  });

  const nodes = entityToFieldNodes(User);

  expect(nodes.map((n) => n.name)).toEqual(["id", "email", "name"]);
  for (const node of nodes) {
    expect(node.kind).toBe(kernel.nodeKinds.FIELD);
  }
  expect(nodes[0]!.id).toBe("node:field:User.id");
});

test("entityToFieldEdges emits Owns + HasType edges with correct endpoints per field", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });

  const edges = entityToFieldEdges(User);

  // 2 fields x 2 edges = 4 edges, alternating OwnsField / FieldHasType.
  expect(edges).toHaveLength(4);

  const owns = edges.filter((e) => e.kind.id === ENTITY_OWNS_FIELD_EDGE_KIND.id);
  const hasType = edges.filter((e) => e.kind.id === FIELD_HAS_TYPE_EDGE_KIND.id);
  expect(owns).toHaveLength(2);
  expect(hasType).toHaveLength(2);

  expect(edges.some((e) => e.kind === kernel.edgeKinds.OWNS)).toBe(false);
  expect(edges.some((e) => e.kind === kernel.edgeKinds.HAS_TYPE)).toBe(false);

  // First OwnsField edge: User --ownsField--> User.id
  const ownsId = owns[0]!;
  expect(ownsId.endpoints[0]!.role.id).toBe(ENTITY_OWNS_FIELD_EDGE_KIND.endpoints[0]!.id);
  expect(ownsId.endpoints[0]!.target).toBe(User.ref);
  expect(ownsId.endpoints[0]!.cardinality).toBe("one");
  expect(ownsId.endpoints[1]!.role.id).toBe(ENTITY_OWNS_FIELD_EDGE_KIND.endpoints[1]!.id);
  expect(ownsId.endpoints[1]!.target).toBe(User.fieldList[0]!.ref);
  expect(ownsId.endpoints[1]!.cardinality).toBe("one");

  // First FieldHasType edge: User.id field --fieldHasType--> KernelRef<"type">{ name: "uuid" }
  const hasTypeId = hasType[0]!;
  expect(hasTypeId.endpoints[0]!.role.id).toBe(FIELD_HAS_TYPE_EDGE_KIND.endpoints[0]!.id);
  expect(hasTypeId.endpoints[0]!.target).toBe(User.fieldList[0]!.ref);
  expect(hasTypeId.endpoints[1]!.role.id).toBe(FIELD_HAS_TYPE_EDGE_KIND.endpoints[1]!.id);
  expect((hasTypeId.endpoints[1]!.target as { kind: string; name: string }).kind).toBe("type");
});

test("fieldToKernelNode mirrors the field name and uses FIELD kind", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const node = fieldToKernelNode(User.fields.id!);

  expect(node.kind).toBe(kernel.nodeKinds.FIELD);
  expect(node.name).toBe("id");
});

test("ENTITY_NODE_KIND_WITH_RELATIONS exposes `fields: hasMany(Field)` schema", () => {
  // The dialect-owned relation schema lives on a side constant
  // (`*_WITH_RELATIONS`) so the bare `ENTITY_NODE_KIND` / `FIELD_NODE_KIND`
  // exports keep their endpoint-constrained generics intact for refs and
  // typed edge construction.
  expect(ENTITY_NODE_KIND_WITH_RELATIONS.relationSchema).toBeDefined();
  expect(ENTITY_NODE_KIND_WITH_RELATIONS.relationSchema.fields.target.id).toBe(FIELD_NODE_KIND.id);
  expect(ENTITY_NODE_KIND_WITH_RELATIONS.relationSchema.fields.via.id).toBe(
    ENTITY_OWNS_FIELD_EDGE_KIND.id,
  );
  expect(ENTITY_NODE_KIND_WITH_RELATIONS.relationSchema.fields.cardinality.min).toBe(0);
  expect(ENTITY_NODE_KIND_WITH_RELATIONS.relationSchema.fields.cardinality.max).toBeNull();

  expect(FIELD_NODE_KIND_WITH_RELATIONS.relationSchema).toBeDefined();
  expect(FIELD_NODE_KIND_WITH_RELATIONS.relationSchema.entity.target.id).toBe(ENTITY_NODE_KIND.id);
  expect(FIELD_NODE_KIND_WITH_RELATIONS.relationSchema.entity.via.id).toBe(
    ENTITY_OWNS_FIELD_EDGE_KIND.id,
  );
  expect(FIELD_NODE_KIND_WITH_RELATIONS.relationSchema.entity.cardinality.min).toBe(1);
  expect(FIELD_NODE_KIND_WITH_RELATIONS.relationSchema.entity.cardinality.max).toBe(1);
});

test("kernel.related walks ownsField edges to field refs (via *_WITH_RELATIONS)", () => {
  // End-to-end: build a small entity graph through `gen.entity(...)`
  // (which dual-writes into `ctx.graph` via the entity adapter) and walk
  // it through the dialect-owned relation schema. The accessor tolerates
  // legacy entity/field refs (lookup falls back to name when the edge
  // endpoint id is the domain id, not the kernel node id).
  const { gen, ctx } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    email: gen.types.email(),
    name: gen.types.string(),
  });

  const entityNode = entityToKernelNode(User);
  // The bound `gen.entity` dual-writes into ctx.graph; look the actual
  // registered entity node up so kernel.related walks the real edges.
  const registered = ctx.graph.nodes.get(entityNode.id);
  expect(registered).toBeDefined();

  const accessors = kernel.related(ctx.graph, registered!, ENTITY_NODE_KIND_WITH_RELATIONS);
  const fields = accessors.fields();
  expect(Array.isArray(fields)).toBe(true);
  expect(fields).toHaveLength(3);
  // Field refs should resolve back to the registered field nodes by name.
  expect(new Set(fields.map((f) => f.name))).toEqual(new Set(["id", "email", "name"]));
});

test("conversion functions are pure — calling them does not touch any graph", () => {
  // Construct the entity outside the bound builder so the dual-write path
  // in bindEntity (PR 4) is bypassed. Calling the adapter functions directly
  // must not mutate the unrelated context's graph.
  const { ctx } = createGen();
  const observerEntities = ctx.entities.length;
  const observerNodes = ctx.graph.nodes.size;
  const observerEdges = ctx.graph.edges.size;

  // The adapters take any Entity; we use the bound `gen.entity` here only
  // to get a valid Entity instance, then construct a *separate* fresh ctx
  // and assert the adapters don't touch it.
  const { gen: builder } = createGen();
  const User = builder.entity("User", { id: builder.types.uuid() });

  entityToKernelNode(User);
  entityToFieldNodes(User);
  entityToFieldEdges(User);

  expect(ctx.entities.length).toBe(observerEntities);
  expect(ctx.graph.nodes.size).toBe(observerNodes);
  expect(ctx.graph.edges.size).toBe(observerEdges);
});
