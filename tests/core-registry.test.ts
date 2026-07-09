import { expect, test } from "vite-plus/test";
import { core, createGen } from "../src/index.ts";
import { getRefsFromGraph, lookupRefByIdOnGraph } from "../src/core/refs.ts";

test("getRefsFromGraph collects refs from graph nodes", () => {
  const { ctx, gen } = createGen();
  const Project = gen.entity(
    "Project",
    {
      id: { type: gen.types.uuid(), id: core.fieldId({ entity: "Project", name: "id" }) },
    },
    { id: core.entityId({ name: "Project" }) },
  );

  const refs = getRefsFromGraph(ctx.graph);
  expect(refs).toContain(Project.ref);
  expect(refs).toContain(Project.fields.id.ref);
});

test("lookupRefByIdOnGraph finds refs by stable ID", () => {
  const { ctx, gen } = createGen();
  const Project = gen.entity(
    "Project",
    { id: { type: gen.types.uuid(), id: core.fieldId({ entity: "Project", name: "id" }) } },
    { id: core.entityId({ name: "Project" }) },
  );

  expect(lookupRefByIdOnGraph(ctx.graph, core.entityId({ name: "Project" }))).toBe(Project.ref);
  expect(lookupRefByIdOnGraph(ctx.graph, "field.project.id")).toBe(Project.fields.id.ref);
});
