/**
 * Quick Win #7 (PLAN.md §7) — Policy constructor facade equivalence.
 *
 * `definePolicy(input)` and `definePolicy((b) => b.name(...).for(...).build())`
 * must lower to the same graph fragment. Track K's facade matrix
 * (PLAN.md §2.5) treats this as a hard requirement.
 */

import { expect, test } from "vite-plus/test";
import { definePolicy } from "../../src/authz/index.ts";
import { defineEntity } from "../../src/entity/index.ts";
import { uuid } from "../../src/types/index.ts";
import { core, kernel } from "../../src/index.ts";
import type { AnyGraphStep } from "../../src/kernel/index.ts";

const Project = defineEntity(
  "Project",
  {
    id: { type: uuid(), id: core.fieldId({ entity: "Project", name: "id" }) },
  },
  { id: core.entityId({ name: "Project" }) },
);

const serializeFragment = (fragment: AnyGraphStep): string => {
  const graph = kernel.graph.pipe(fragment);
  const nodes = [...graph.nodes.values()]
    .map((node) => ({
      id: node.id,
      kind: node.kind.id,
      name: node.name,
      traits: node.traits.map((t) => t.id).sort((a, b) => a.localeCompare(b)),
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
      traits: edge.traits.map((t) => t.id).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ nodes, edges }, null, 2);
};

test("policy object, builder, curried, and class facades produce byte-identical graph fragments", () => {
  const byObject = definePolicy({
    name: "ProjectAccess",
    target_entity: Project,
  });

  const byBuilder = definePolicy((b) => b.name("ProjectAccess").for(Project).build());
  const byCurried = definePolicy("ProjectAccess")({ target_entity: Project });
  class PolicyClass extends definePolicy.class({
    name: "ProjectAccess",
    target_entity: Project,
  }) {}

  expect(byBuilder.name).toBe(byObject.name);
  expect(byBuilder.target_entity).toBe(byObject.target_entity);
  expect(serializeFragment(byBuilder.fragment)).toBe(serializeFragment(byObject.fragment));
  expect(serializeFragment(byCurried.fragment)).toBe(serializeFragment(byObject.fragment));
  expect(serializeFragment(PolicyClass.fragment)).toBe(serializeFragment(byObject.fragment));
});
