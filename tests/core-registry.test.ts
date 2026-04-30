import { expect, test } from "vite-plus/test";
import { core, createGen } from "../src/index.ts";

test("getRef finds registered refs by stable ID", () => {
  const { ctx, gen } = createGen();
  const Project = gen.entity(
    "Project",
    {
      id: { type: gen.types.uuid(), id: core.fieldId("field.project.id") },
    },
    { id: core.entityId("entity.project") },
  );

  const renamedEntityRef = core.makeRef({
    kind: "EntityRef",
    id: core.entityId("entity.project"),
    owner: { kind: "Entity", name: "ProjectRenamed" },
    name: "ProjectRenamed",
    value_type: "entity",
  });

  expect(core.getRef(ctx, renamedEntityRef)).toBe(Project.ref);
  expect(core.getRef(ctx, Project.fields.id.ref)).toBe(Project.fields.id.ref);
});

test("lookupById is the explicit string lookup boundary", () => {
  const { ctx, gen } = createGen();
  const Project = gen.entity(
    "Project",
    { id: { type: gen.types.uuid(), id: core.fieldId("field.project.id") } },
    { id: core.entityId("entity.project") },
  );

  expect(core.lookupById(ctx, core.entityId("entity.project"))).toBe(Project.ref);
  expect(core.lookupById(ctx, "field.project.id")).toBe(Project.fields.id.ref);
});

test("checkRegisteredRefs reports unregistered refs once per identity", () => {
  const { ctx, gen } = createGen();
  gen.entity("Project", { id: gen.types.uuid() });
  const stale = core.makeRef({
    kind: "FieldRef",
    id: core.fieldId("field.project.missing"),
    owner: { kind: "Entity", name: "Project" },
    name: "missing",
    value_type: "string",
  });

  const diagnostics = core.checkRegisteredRefs(ctx, [stale, stale]);

  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]!.code).toBe("ref:unregistered-ref");
  expect(diagnostics[0]!.refs).toEqual([stale]);
});

test("checkRegisteredRefs accepts legacy registered refs", () => {
  const { ctx, gen } = createGen();
  const Project = gen.entity("Project", { id: gen.types.uuid() });

  expect(core.checkRegisteredRefs(ctx, [Project.ref, Project.fields.id.ref])).toHaveLength(0);
});
