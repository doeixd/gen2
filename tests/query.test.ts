/**
 * Tests for query construction and invariant checks, including aggregates,
 * projections, predicates, and join conditions.
 */
import { expect, test } from "vite-plus/test";
import { createGen, query, expression } from "../src/index.ts";

test("buildQuery constructs a query expression", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.email(),
  });
  expect(q.source.entity).toBe(User);
  expect(q.kind.kind).toBe("select");
});

test("checkQueries flags aggregate over non-numeric field", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.int(),
    projection: {
      fields: [],
      aggregates: [
        {
          aggregate_op: gen.types.op.aggregate({
            name: "sum",
            input_type: gen.types.string(),
            output_type: gen.types.int(),
            requires_numeric: true,
          }),
          field: User.fields.name,
          alias: "total",
        },
      ],
    },
  });
  const diags = query.checkQueries([q]);
  expect(diags.some((d) => d.code === "query:ambiguous-aggregate")).toBe(true);
});

test("checkQueries flags nonexistent field in projection", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { title: gen.types.string() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.string(),
    projection: {
      fields: [{ field: Post.fields.title }],
      aggregates: [],
    },
  });
  const diags = query.checkQueries([q]);
  expect(diags.some((d) => d.code === "query:nonexistent-field")).toBe(true);
});

test("checkQueries flags wrong-entity field in predicate", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { title: gen.types.string() });
  const pred = expression.buildPredicate({
    input_type: User,
    value_type: gen.types.boolean(),
    ast: expression.fieldRefNode(Post.fields.title.ref),
  });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.boolean(),
    predicate: pred,
  });
  const diags = query.checkQueries([q]);
  expect(diags.some((d) => d.code === "query:wrong-entity-field")).toBe(true);
});

test("checkQueries flags invalid join condition", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { title: gen.types.string() });
  const pred = expression.buildPredicate({
    input_type: User,
    value_type: gen.types.boolean(),
    ast: expression.fieldRefNode(User.fields.id.ref),
  });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.boolean(),
    joins: [
      {
        kind: "inner",
        target: { kind: "entity_source", entity: Post },
        condition: pred,
      },
    ],
  });
  const diags = query.checkQueries([q]);
  expect(diags.some((d) => d.code === "query:join-condition-invalid")).toBe(true);
});
