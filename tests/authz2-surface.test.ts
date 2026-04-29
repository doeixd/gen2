import { expect, test } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import {
  entityRead,
  entityCreate,
  entityUpdate,
  entityDelete,
  fieldRead,
  fieldWrite,
  defineAccessSurfaceBinding,
  deriveDefaultDeny,
} from "../src/authz/surface.ts";
import { definePolicy } from "../src/authz/authz.ts";
import { string as stringType, uuid as uuidType } from "../src/types/semantic.ts";

test("access surface constructors produce correct kind", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() });

  expect(entityRead(User).kind).toBe("entity.read");
  expect(entityCreate(User).kind).toBe("entity.create");
  expect(entityUpdate(User).kind).toBe("entity.update");
  expect(entityDelete(User).kind).toBe("entity.delete");
  expect(fieldRead(User, User.fields.name).kind).toBe("field.read");
  expect(fieldWrite(User, User.fields.name).kind).toBe("field.write");
});

test("default deny per surface", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() });

  expect(deriveDefaultDeny(entityRead(User))).toBe("not_found");
  expect(deriveDefaultDeny(entityCreate(User))).toBe("forbidden");
  expect(deriveDefaultDeny(entityUpdate(User))).toBe("forbidden");
  expect(deriveDefaultDeny(entityDelete(User))).toBe("forbidden");
  expect(deriveDefaultDeny(fieldRead(User, User.fields.name))).toBe("omit");
  expect(deriveDefaultDeny(fieldWrite(User, User.fields.name))).toBe("forbidden");
});

test("defineAccessSurfaceBinding uses default deny when not provided", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() });
  const policy = definePolicy({ name: "userPolicy", target_entity: User, actions: [] });
  const surface = entityRead(User);

  const binding = defineAccessSurfaceBinding({ surface, policy });
  expect(binding.kind).toBe("access_surface_binding");
  expect(binding.surface).toBe(surface);
  expect(binding.policy).toBe(policy);
  expect(binding.deny).toBe("not_found");
});

test("defineAccessSurfaceBinding accepts explicit deny", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() });
  const policy = definePolicy({ name: "userPolicy", target_entity: User, actions: [] });
  const surface = entityRead(User);

  const binding = defineAccessSurfaceBinding({ surface, policy, deny: "forbidden" });
  expect(binding.deny).toBe("forbidden");
});

test("gen.authz.surface.* constructors are available", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() });

  const s1 = gen.authz.surface.entityRead(User);
  expect(s1.kind).toBe("entity.read");
  expect(s1.entity).toBe(User);

  const s2 = gen.authz.surface.fieldWrite(User, User.fields.name);
  expect(s2.kind).toBe("field.write");
  expect(s2.field).toBe(User.fields.name);
});

test("gen.authz.surface.binding creates binding with default deny", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() });
  const policy = gen.authz.policy({ name: "userPolicy", target_entity: User, actions: [] });

  const binding = gen.authz.surface.binding({
    surface: gen.authz.surface.entityRead(User),
    policy,
  });

  expect(binding.deny).toBe("not_found");
});

test("gen.authz.surface.defaultDeny returns correct behavior", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() });

  expect(gen.authz.surface.defaultDeny(gen.authz.surface.entityRead(User))).toBe("not_found");
  expect(gen.authz.surface.defaultDeny(gen.authz.surface.fieldRead(User, User.fields.name))).toBe(
    "omit",
  );
  const component = {
    name: "test",
    props_type: "any",
    requirements: [],
    errors: [],
    bindings: [],
    view: { name: "testView", kind: "view", slots: [] },
  } as unknown as import("../src/ui/index.ts").Component;
  expect(gen.authz.surface.defaultDeny(gen.authz.surface.uiHint(component))).toBe("readonly");
});

test("policy can carry access_surface_bindings", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() });

  const binding = gen.authz.surface.binding({
    surface: gen.authz.surface.entityRead(User),
    policy: gen.authz.policy({ name: "userPolicy", target_entity: User, actions: [] }),
  });

  const policy = gen.authz.policy({
    name: "userPolicy2",
    target_entity: User,
    actions: [],
    access_surface_bindings: [binding],
  });

  expect(policy.access_surface_bindings).toHaveLength(1);
  expect(policy.access_surface_bindings![0]!.surface.kind).toBe("entity.read");
});
