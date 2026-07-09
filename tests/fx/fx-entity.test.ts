import { expect, test } from "vite-plus/test";
import { Entity } from "../../src/fx/entity.ts";
import { Types } from "../../src/fx/types.ts";
import { pipe } from "../../src/fx/pipe.ts";
import { core } from "../../src/index.ts";

test("Entity.make curried form creates an entity", () => {
  const User = Entity.make("User")({
    id: Types.uuid(),
    email: Types.email(),
    name: Types.string(),
  });
  expect(User.name).toBe("User");
  expect(User.fields.id.semantic_type.name).toBe("uuid");
  expect(User.fields.email.semantic_type.name).toBe("email");
  expect(User.fields.name.semantic_type.name).toBe("string");
});

test("Entity.make direct form creates an entity", () => {
  const User = Entity.make("User", {
    id: Types.uuid(),
    email: Types.email(),
  });
  expect(User.name).toBe("User");
  expect(User.fields.id.semantic_type.name).toBe("uuid");
  expect(User.fields.email.semantic_type.name).toBe("email");
});

test("Entity.withStore sets store_name via pipe", () => {
  const User = pipe(Entity.make("User")({ id: Types.uuid() }), Entity.withStore("users"));
  expect(User.name).toBe("User");
  expect(User.store_name).toBe("users");
});

test("Entity.withId sets stable ID via pipe", () => {
  const User = pipe(
    Entity.make("User")({ id: Types.uuid() }),
    Entity.withId(core.entityId({ name: "User" })),
  );
  expect(User.id).toBe("entity.user");
});

test("Entity.withMetadata appends metadata via pipe", () => {
  const User = pipe(
    Entity.make("User")({ id: Types.uuid() }),
    Entity.withMetadata({ namespace: "gen", key: "auditable", value: "true" }),
  );
  expect(User.metadata).toEqual([{ namespace: "gen", key: "auditable", value: "true" }]);
});

test("Entity.fields returns the fields record", () => {
  const User = Entity.make("User")({ id: Types.uuid(), name: Types.string() });
  const fields = Entity.fields(User);
  expect(Object.keys(fields)).toEqual(["id", "name"]);
});

test("Entity.field returns a specific field", () => {
  const User = Entity.make("User")({ id: Types.uuid(), name: Types.string() });
  const idField = Entity.field(User, "id");
  expect(idField.semantic_type.name).toBe("uuid");
});

test("Entity.name returns the entity name", () => {
  const User = Entity.make("User")({ id: Types.uuid() });
  expect(Entity.name(User)).toBe("User");
});

test("Entity.ref returns the entity ref", () => {
  const User = Entity.make("User")({ id: Types.uuid() });
  expect(Entity.ref(User).kind).toBe("EntityRef");
});

test("pipe chains multiple transforms", () => {
  const User = pipe(
    Entity.make("User")({
      id: Types.uuid(),
      email: Types.email(),
    }),
    Entity.withStore("users"),
    Entity.withId(core.entityId({ name: "User" })),
    Entity.withMetadata({ namespace: "gen", key: "auditable", value: "true" }),
  );
  expect(User.name).toBe("User");
  expect(User.store_name).toBe("users");
  expect(User.id).toBe("entity.user");
  expect(User.metadata).toEqual([{ namespace: "gen", key: "auditable", value: "true" }]);
});
