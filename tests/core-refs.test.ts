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

test("structured entityId builds correct stable ID", () => {
  expect(core.entityId({ name: "Project" })).toBe("entity.project");
});

test("structured fieldId builds correct stable ID", () => {
  expect(core.fieldId({ entity: "Project", name: "status" })).toBe("field.project.status");
});

test("structured relationId builds correct stable IDs", () => {
  expect(core.relationId({ from: "User", to: "Org" })).toBe("relation.user.org");
  expect(core.relationId({ from: "User", to: "Org", name: "short" })).toBe(
    "relation.user.org.short",
  );
  expect(core.relationId({ name: "user_role" })).toBe("relation.user_role");
});

test("entityIdFor derives ID from object name", () => {
  const entity = { name: "Project" };
  expect(core.entityIdFor(entity)).toBe("entity.project");
});

test("fieldIdFor derives ID from field and owning entity", () => {
  const field = { name: "status", owning_entity: { name: "Project" } };
  expect(core.fieldIdFor(field)).toBe("field.project.status");
});

test("relationIdFor derives ID from relation endpoints", () => {
  const relation = {
    name: "user_org",
    from_entity: { name: "User" },
    to_entity: { name: "Org" },
  };
  expect(core.relationIdFor(relation)).toBe("relation.user.org.user_org");
});

test("namedRelationIdFor derives ID from name", () => {
  expect(core.namedRelationIdFor({ name: "user_role" })).toBe("relation.user_role");
});

test("methodId supports optional service prefix", () => {
  expect(core.methodId({ service: "Email", name: "send" })).toBe("method.email.send");
  expect(core.methodId({ name: "send" })).toBe("method.send");
});
