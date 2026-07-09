import { expect, test } from "vite-plus/test";
import { core, kernel } from "../../src/index.ts";
import type { AnyGraphStep } from "../../src/kernel/index.ts";
import { defineEntity, defineEntityUsingSemanticTypes } from "../../src/entity/index.ts";
import { string, uuid } from "../../src/types/index.ts";

const entityOptions = { id: core.entityId({ name: "Project" }) };
const fieldShapes = {
  id: { type: uuid(), id: core.fieldId({ entity: "Project", name: "id" }) },
  name: { type: string(), id: core.fieldId({ entity: "Project", name: "name" }) },
};

const serializeFragment = (fragment: AnyGraphStep): string => {
  const graph = kernel.graph.pipe(fragment);
  const nodes = [...graph.nodes.values()]
    .map((node) => ({
      id: node.id,
      kind: node.kind.id,
      name: node.name,
      traits: node.traits.map((trait) => trait.id).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...graph.edges.values()]
    .map((edge) => ({
      id: edge.id,
      kind: edge.kind.id,
      endpoints: edge.endpoints.map((endpoint) => ({
        role: endpoint.role.id,
        target: endpoint.target.id,
      })),
      traits: edge.traits.map((trait) => trait.id).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ nodes, edges }, null, 2);
};

test("entity object, callback, curried, and class facades produce byte-identical graph fragments", () => {
  const byObject = defineEntity("Project", fieldShapes, entityOptions);
  const usingTypes = defineEntityUsingSemanticTypes({ uuid, string });
  const byCallback = usingTypes(
    "Project",
    ({ uuid, string }) => ({
      id: { type: uuid(), id: core.fieldId({ entity: "Project", name: "id" }) },
      name: { type: string(), id: core.fieldId({ entity: "Project", name: "name" }) },
    }),
    entityOptions,
  );
  const byCurriedCallback = usingTypes("Project")(
    ({ uuid, string }) => ({
      id: { type: uuid(), id: core.fieldId({ entity: "Project", name: "id" }) },
      name: { type: string(), id: core.fieldId({ entity: "Project", name: "name" }) },
    }),
    entityOptions,
  );
  class ProjectClass extends defineEntity.class("Project", {
    fields: fieldShapes,
    ...entityOptions,
  }) {}

  expect(serializeFragment(byCallback.fragment!)).toBe(serializeFragment(byObject.fragment!));
  expect(serializeFragment(byCurriedCallback.fragment!)).toBe(
    serializeFragment(byObject.fragment!),
  );
  expect(serializeFragment(ProjectClass.fragment)).toBe(serializeFragment(byObject.fragment));
});
