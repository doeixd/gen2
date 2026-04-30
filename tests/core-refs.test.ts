import { expect, test } from "vite-plus/test";
import { core } from "../src/index.ts";

test("stable ID constructors create branded runtime strings", () => {
  const entity = core.entityId("entity.project");
  const field = core.fieldId("field.project.status");

  expect(entity).toBe("entity.project");
  expect(field).toBe("field.project.status");
});

test("makeRef preserves stable IDs", () => {
  const id = core.fieldId("field.project.status");
  const ref = core.makeRef<string>({
    kind: "FieldRef",
    id,
    owner: { kind: "Entity", name: "Project" },
    name: "status",
    value_type: "string",
  });

  expect(core.refId(ref)).toBe(id);
  expect(core.refIdentity(ref)).toBe(id);
});

test("refEquals prefers stable IDs when both refs have IDs", () => {
  const id = core.fieldId("field.project.status");
  const beforeRename = core.makeRef<string>({
    kind: "FieldRef",
    id,
    owner: { kind: "Entity", name: "Project" },
    name: "status",
    value_type: "string",
  });
  const afterRename = core.makeRef<string>({
    kind: "FieldRef",
    id,
    owner: { kind: "Entity", name: "Project" },
    name: "state",
    value_type: "string",
  });

  expect(core.refEquals(beforeRename, afterRename)).toBe(true);
});

test("refEquals falls back to legacy identity without stable IDs", () => {
  const a = core.makeRef<string>({
    kind: "FieldRef",
    owner: { kind: "Entity", name: "Project" },
    name: "status",
    value_type: "string",
  });
  const b = core.makeRef<string>({
    kind: "FieldRef",
    owner: { kind: "Entity", name: "Project" },
    name: "status",
    value_type: "string",
  });
  const c = core.makeRef<string>({
    kind: "FieldRef",
    owner: { kind: "Entity", name: "Project" },
    name: "state",
    value_type: "string",
  });

  expect(core.refEquals(a, b)).toBe(true);
  expect(core.refEquals(a, c)).toBe(false);
});
