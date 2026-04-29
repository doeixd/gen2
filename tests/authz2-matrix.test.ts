import { expect, test } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import { deriveAccessMatrix } from "../src/authz/matrix.ts";
import { fieldRead, entityUpdate } from "../src/authz/surface.ts";
import { definePolicy } from "../src/authz/authz.ts";
import { string as stringType, uuid as uuidType } from "../src/types/semantic.ts";

test("deriveAccessMatrix produces sorted entries", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const Post = gen.entity("Post", { id: uuidType(), title: stringType() }, { store_name: "users" });

  const userPolicy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    actions: [],
    surfaces: [{ surface: fieldRead(User, User.fields.name) }],
  });
  const postPolicy = definePolicy({
    name: "postPolicy",
    target_entity: Post,
    actions: [],
    surfaces: [{ surface: entityUpdate(Post) }],
  });

  const matrix = deriveAccessMatrix({ policies: [userPolicy, postPolicy] });
  expect(matrix.kind).toBe("access_matrix");
  expect(matrix.entries).toHaveLength(2);
  expect(matrix.entries[0]!.entity).toBe(Post);
  expect(matrix.entries[0]!.surface).toBe("entity.update");
  expect(matrix.entries[1]!.entity).toBe(User);
  expect(matrix.entries[1]!.surface).toBe("field.read");
});

test("deriveAccessMatrix is empty when no bindings exist", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const policy = definePolicy({ name: "userPolicy", target_entity: User, actions: [] });
  const matrix = deriveAccessMatrix({ policies: [policy] });
  expect(matrix.entries).toHaveLength(0);
});
