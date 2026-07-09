import { expect, test } from "vite-plus/test";
import { createGen, expression, kernel, query } from "../src/index.ts";
import { getQueriesFromGraph, queryToGraphFragment } from "../src/query/kernel.ts";
import { check } from "../src/lifecycle/lifecycle.ts";

test("query graph reader recovers typed query payloads", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const q = query.buildQuery({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
  });

  const graph = kernel.graph.pipe(queryToGraphFragment(q));

  expect(getQueriesFromGraph(graph)).toEqual([q]);
});

test("derive.query.shape runs graph-native diagnostics", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { title: gen.types.string() });
  const pred = expression.buildPredicate({
    input_type: User,
    value_type: gen.types.boolean(),
    ast: expression.fieldRefNode(Post.fields.title.ref),
  });

  gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.boolean(),
    predicate: pred,
  });
  const result = check(ctx);

  expect(result.diagnostics.some((d) => d.code === "query:wrong-entity-field")).toBe(true);
});

test("derive.query.runtimes runs graph-native diagnostics", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const runtime = gen.runtime({ name: "pure", capabilities: ["pure"] });

  gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
    effects: [{ kind: "db_read" }],
    target_runtimes: [runtime],
  });
  const result = check(ctx);

  expect(result.diagnostics.some((d) => d.code === "query:unsupported-operation")).toBe(true);
});
