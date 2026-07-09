import { describe, expectTypeOf, test } from "vite-plus/test";
import { core } from "../src/index.ts";

describe("stable ID branding", () => {
  test("ID constructors return namespace-specific brands", () => {
    const entity = core.entityId("entity.project");
    const field = core.fieldId("field.project.status");

    expectTypeOf(entity).toMatchTypeOf<core.EntityId>();
    expectTypeOf(field).toMatchTypeOf<core.FieldId>();
    expectTypeOf(entity).not.toMatchTypeOf<core.FieldId>();
    expectTypeOf(field).not.toMatchTypeOf<core.EntityId>();
  });

  test("typed field refs preserve entity name and value type phantoms", () => {
    type Project = { readonly name: "Project" };
    type StatusRef = core.FieldRef<Project, "status", string>;

    expectTypeOf<StatusRef>().toMatchTypeOf<core.Ref<string>>();
    expectTypeOf<StatusRef["kind"]>().toEqualTypeOf<"FieldRef">();
    expectTypeOf<StatusRef["id"]>().toMatchTypeOf<core.FieldId | undefined>();
  });

  test("structured object overloads return correct brands", () => {
    const entity = core.entityId({ name: "Project" });
    const field = core.fieldId({ entity: "Project", name: "status" });
    const relation = core.relationId({ from: "User", to: "Org" });

    expectTypeOf(entity).toMatchTypeOf<core.EntityId>();
    expectTypeOf(field).toMatchTypeOf<core.FieldId>();
    expectTypeOf(relation).toMatchTypeOf<core.RelationId>();
  });

  test("_for helpers return correct brands from duck-typed objects", () => {
    const entity = { name: "Project" };
    const field = { name: "status", owning_entity: entity };

    expectTypeOf(core.entityIdFor(entity)).toMatchTypeOf<core.EntityId>();
    expectTypeOf(core.fieldIdFor(field)).toMatchTypeOf<core.FieldId>();
  });
});
