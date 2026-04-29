import { expect, test } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import { string as stringType, uuid as uuidType } from "../src/types/semantic.ts";

test("gen.crud.derive registers access surface bindings from access option", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });

  const readPolicy = gen.authz.policy({ name: "canReadUser", target_entity: User, actions: [] });
  const writePolicy = gen.authz.policy({ name: "canWriteName", target_entity: User, actions: [] });

  gen.crud.derive(User, {
    access: {
      read: readPolicy,
      fields: {
        name: { write: writePolicy },
      },
    },
  });

  expect(readPolicy.access_surface_bindings).toHaveLength(1);
  expect(readPolicy.access_surface_bindings![0]!.surface.kind).toBe("entity.read");

  expect(writePolicy.access_surface_bindings).toHaveLength(1);
  expect(writePolicy.access_surface_bindings![0]!.surface.kind).toBe("field.write");
});

test("gen.crud.derive with access derives CRUD functions normally", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const policy = gen.authz.policy({ name: "canReadUser", target_entity: User, actions: [] });

  const crud = gen.crud.derive(User, {
    access: {
      read: policy,
    },
  });

  expect(crud.getById).toBeDefined();
  expect(crud.list).toBeDefined();
  expect(crud.create).toBeDefined();
  expect(crud.update).toBeDefined();
  expect(crud.delete).toBeDefined();
});
