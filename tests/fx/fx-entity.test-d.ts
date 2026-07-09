import { expectTypeOf, test } from "vite-plus/test";
import { Entity } from "../../src/fx/entity.ts";
import { Types } from "../../src/fx/types.ts";
import { pipe } from "../../src/fx/pipe.ts";

test("Entity.make preserves literal name", () => {
  const User = Entity.make("User")({ id: Types.uuid() });
  expectTypeOf(User.name).toEqualTypeOf<"User">();
});

test("Entity.make preserves field types", () => {
  const User = Entity.make("User")({
    id: Types.uuid(),
    email: Types.email(),
  });
  expectTypeOf(User.fields.id.semantic_type.name).toEqualTypeOf<string>();
  expectTypeOf(User.fields.email.semantic_type.name).toEqualTypeOf<string>();
});

test("pipe with identity-preserving transform preserves entity type", () => {
  const User = pipe(Entity.make("User")({ id: Types.uuid() }), Entity.withStore("users"));
  expectTypeOf(User.name).toEqualTypeOf<"User">();
  expectTypeOf(User.store_name).toEqualTypeOf<"users">();
});

test("Entity.field preserves field type", () => {
  const User = Entity.make("User")({ id: Types.uuid(), name: Types.string() });
  const idField = Entity.field(User, "id");
  expectTypeOf(idField.name).toEqualTypeOf<"id">();
});
