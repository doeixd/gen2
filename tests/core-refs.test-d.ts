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
});
