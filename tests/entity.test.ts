/**
 * Tests for entity creation, field reference wiring, duplicate name detection,
 * read-only field constraints, and field ownership validation.
 */
import { expect, test } from "vite-plus/test";
import { core, createGen, entity } from "../src/index.ts";

test("gen.entity creates fields with FieldRefs", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    email: gen.types.email(),
    displayName: gen.types.string(),
  });
  expect(User.name).toBe("User");
  expect(User.ref.kind).toBe("EntityRef");
  expect(User.ref.owner.name).toBe("User");
  expect(User.fields.id.ref.kind).toBe("FieldRef");
  expect(User.fields.id.ref.owner.name).toBe("User");
  expect(User.fields.email.semantic_type.name).toBe("email");
});

test("gen.entity preserves explicit stable entity and field IDs", () => {
  const { ctx, gen } = createGen();
  const Project = gen.entity(
    "Project",
    {
      id: { type: gen.types.uuid(), id: core.fieldId("field.project.id") },
      status: {
        type: gen.types.string(),
        id: core.fieldId("field.project.status"),
        renamedFrom: ["state"],
        external_name: "project_status",
      },
    },
    { id: core.entityId("entity.project") },
  );

  expect(Project.id).toBe("entity.project");
  expect(Project.ref.id).toBe(Project.id);
  expect(Project.fields.status.id).toBe("field.project.status");
  expect(Project.fields.status.ref.id).toBe(Project.fields.status.id);
  expect(Project.fields.status.renamed_from).toEqual(["state"]);
  expect(Project.fields.status.external_name).toBe("project_status");
  expect(ctx.refs).toContain(Project.ref);
  expect(ctx.refs).toContain(Project.fields.status.ref);
});

test("EntityNameUnique flags duplicate entity names", () => {
  const { gen } = createGen();
  const a = gen.entity("E", { id: gen.types.uuid() });
  const b = gen.entity("E", { id: gen.types.uuid() });
  const diags = entity.checkEntityInvariants([a, b]);
  expect(diags.some((d) => d.code === "entity:duplicate-name")).toBe(true);
});

test("ReadOnlyFieldInCreateInput fires on read-only fields", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    id: { type: gen.types.uuid(), read_only: true },
    name: gen.types.string(),
  });
  const op = {
    name: "createUser",
    target_entity: User,
    input_fields: [User.fields.id],
  };
  const diags = entity.checkReadOnlyInInput([op], "create");
  expect(diags).toHaveLength(1);
  expect(diags[0]!.code).toBe("entity:readonly-field-in-create");
});

test("FieldFromWrongEntity catches mismatched ownership", () => {
  const { gen } = createGen();
  const A = gen.entity("A", { x: gen.types.string() });
  const B = gen.entity("B", { y: gen.types.string() });
  const diags = entity.checkFieldOwnership([{ target_entity: B, field: A.fields.x }]);
  expect(diags).toHaveLength(1);
  expect(diags[0]!.code).toBe("entity:wrong-entity-field");
});

test("NonexistentFieldRef catches refs to missing fields", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const stale = {
    kind: "FieldRef" as const,
    owner: { kind: "Entity" as const, name: "User" },
    name: "ghost",
    value_type: "string",
    metadata: [],
  };
  const diags = entity.checkRefsExist([stale], [User]);
  expect(diags).toHaveLength(1);
  expect(diags[0]!.code).toBe("entity:nonexistent-field");
});
