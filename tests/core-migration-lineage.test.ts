import { expect, test } from "vite-plus/test";
import { core, createGen, reactivity } from "../src/index.ts";

test("rename via renamedFrom is reported as a rename, not drop+add", () => {
  const beforeGen = createGen();
  const before = beforeGen.gen.entity(
    "Project",
    {
      id: { type: beforeGen.gen.types.uuid(), id: core.fieldId("field.project.id") },
      name: { type: beforeGen.gen.types.string(), id: core.fieldId("field.project.name") },
    },
    { id: core.entityId("entity.project") },
  );

  const afterGen = createGen();
  const after = afterGen.gen.entity(
    "Project",
    {
      id: { type: afterGen.gen.types.uuid(), id: core.fieldId("field.project.id") },
      title: {
        type: afterGen.gen.types.string(),
        id: core.fieldId("field.project.name"),
        renamedFrom: ["name"],
      },
    },
    { id: core.entityId("entity.project") },
  );

  const lineage = core.deriveMigrationLineage([before], [after]);

  const projectChange = lineage.entities.find((e) => e.id === "entity.project");
  expect(projectChange?.kind).toBe("unchanged");

  const renameChange = lineage.fields.find((f) => f.id === "field.project.name");
  expect(renameChange?.kind).toBe("renamed");
  expect(renameChange?.previous_name).toBe("name");
  expect(renameChange?.current_name).toBe("title");

  expect(lineage.fields.some((f) => f.kind === "added" && f.current_name === "title")).toBe(false);
  expect(lineage.fields.some((f) => f.kind === "removed" && f.previous_name === "name")).toBe(
    false,
  );
});

test("dropping and adding unrelated fields shows up as drop+add", () => {
  const beforeGen = createGen();
  const before = beforeGen.gen.entity(
    "Project",
    {
      id: { type: beforeGen.gen.types.uuid(), id: core.fieldId("field.project.id") },
      legacy: { type: beforeGen.gen.types.string(), id: core.fieldId("field.project.legacy") },
    },
    { id: core.entityId("entity.project") },
  );

  const afterGen = createGen();
  const after = afterGen.gen.entity(
    "Project",
    {
      id: { type: afterGen.gen.types.uuid(), id: core.fieldId("field.project.id") },
      summary: { type: afterGen.gen.types.string(), id: core.fieldId("field.project.summary") },
    },
    { id: core.entityId("entity.project") },
  );

  const lineage = core.deriveMigrationLineage([before], [after]);

  expect(lineage.fields.some((f) => f.kind === "removed" && f.previous_name === "legacy")).toBe(
    true,
  );
  expect(lineage.fields.some((f) => f.kind === "added" && f.current_name === "summary")).toBe(true);
});

test("entity rename via shared stable ID is preserved", () => {
  const beforeGen = createGen();
  const before = beforeGen.gen.entity(
    "OldProject",
    { id: { type: beforeGen.gen.types.uuid(), id: core.fieldId("field.project.id") } },
    { id: core.entityId("entity.project") },
  );

  const afterGen = createGen();
  const after = afterGen.gen.entity(
    "Project",
    { id: { type: afterGen.gen.types.uuid(), id: core.fieldId("field.project.id") } },
    { id: core.entityId("entity.project") },
  );

  const lineage = core.deriveMigrationLineage([before], [after]);
  const change = lineage.entities.find((e) => e.id === "entity.project");

  expect(change?.kind).toBe("renamed");
  expect(change?.previous_name).toBe("OldProject");
  expect(change?.current_name).toBe("Project");
});

test("reactive graph node IDs are stable across entity rename when stable IDs are present", () => {
  const buildContext = (entityName: string) => {
    const { ctx, gen } = createGen();
    const Project = gen.entity(
      entityName,
      { id: { type: gen.types.uuid(), id: core.fieldId("field.project.id") } },
      { id: core.entityId("entity.project") },
    );
    const family = gen.key.entity(Project);
    return { ctx, family };
  };

  const before = buildContext("OldProject");
  const after = buildContext("Project");

  const beforeGraph = reactivity.deriveReactiveGraph(before.ctx);
  const afterGraph = reactivity.deriveReactiveGraph(after.ctx);

  const beforeKeyNode = beforeGraph.nodes.find((n) => n.kind === "key_family");
  const afterKeyNode = afterGraph.nodes.find((n) => n.kind === "key_family");

  expect(beforeKeyNode?.id).toBeDefined();
  expect(beforeKeyNode?.id).toBe(afterKeyNode?.id);
  expect(beforeKeyNode?.name).not.toBe(afterKeyNode?.name);
});
