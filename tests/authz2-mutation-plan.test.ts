import { expect, test } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import { deriveMutationAccessPlan } from "../src/authz/mutation-plan.ts";
import { entityDelete, fieldWrite } from "../src/authz/surface.ts";
import { definePolicy } from "../src/authz/authz.ts";
import {
  buildActionInsert,
  buildActionUpdate,
  buildActionDelete,
} from "../src/function/function.ts";
import { literal } from "../src/expression/builders.ts";
import { string as stringType, uuid as uuidType } from "../src/types/semantic.ts";

test("insert action with no field.write bindings yields empty checks", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const action = gen.func.action({
    name: "createUser",
    input_type: stringType(),
    returns: User,
    body: buildActionInsert(User, [
      [User.fields.name, literal({ kind: "string", string_value: "alice" })],
    ]),
  });
  const plan = deriveMutationAccessPlan(action, []);
  expect(plan.kind).toBe("mutation_access_plan");
  expect(plan.writes).toHaveLength(1);
  expect(plan.fieldWriteChecks).toHaveLength(0);
  expect(plan.diagnostics).toHaveLength(0);
  expect(plan.afterState).toContain(User);
});

test("insert action with field.write binding emits warning and check", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const policy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    actions: [],
    surfaces: [{ surface: fieldWrite(User, User.fields.name) }],
  });

  const action = gen.func.action({
    name: "createUser",
    input_type: stringType(),
    returns: User,
    body: buildActionInsert(User, [
      [User.fields.name, literal({ kind: "string", string_value: "alice" })],
    ]),
  });
  const plan = deriveMutationAccessPlan(action, [policy]);
  expect(plan.fieldWriteChecks).toHaveLength(1);
  expect(plan.fieldWriteChecks[0]!.field).toBe(User.fields.name);
  expect(plan.diagnostics.some((d) => d.code === "authz:write-policy-needs-before-state")).toBe(
    true,
  );
});

test("update action with field.write binding has check but no warning", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const policy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    actions: [],
    surfaces: [{ surface: fieldWrite(User, User.fields.name) }],
  });

  const action = gen.func.action({
    name: "updateUser",
    input_type: stringType(),
    returns: User,
    body: buildActionUpdate(User, [
      [User.fields.name, literal({ kind: "string", string_value: "alice" })],
    ]),
  });
  const plan = deriveMutationAccessPlan(action, [policy]);
  expect(plan.fieldWriteChecks).toHaveLength(1);
  expect(plan.diagnostics).toHaveLength(0);
  expect(plan.beforeState).toContain(User);
  expect(plan.afterState).toContain(User);
});

test("delete action with entity.delete binding populates requiredPolicies and beforeState", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const policy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    actions: [],
    surfaces: [{ surface: entityDelete(User) }],
  });

  const action = gen.func.action({
    name: "deleteUser",
    input_type: stringType(),
    returns: User,
    body: buildActionDelete(User),
  });
  const plan = deriveMutationAccessPlan(action, [policy]);
  expect(plan.requiredPolicies).toContain(policy);
  expect(plan.beforeState).toContain(User);
  expect(plan.afterState).toHaveLength(0);
});

test("mixed operations produce correct before and after states", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const Post = gen.entity("Post", { id: uuidType(), title: stringType() }, { store_name: "users" });

  const action = gen.func.action({
    name: "mixedAction",
    input_type: stringType(),
    returns: stringType(),
    body: {
      kind: { kind: "sequence" },
      phase: "mutation",
      target_entity: User,
      operations: [
        {
          kind: "insert_op",
          target: User,
          values: new Map([[User.fields.name, literal({ kind: "string", string_value: "alice" })]]),
        },
        {
          kind: "update_op",
          target: Post,
          values: new Map([[Post.fields.title, literal({ kind: "string", string_value: "hi" })]]),
        },
        {
          kind: "delete_op",
          target: User,
          values: new Map(),
        },
      ],
      effects: [],
      requirements: [],
    },
  });
  const plan = deriveMutationAccessPlan(action, []);
  expect(plan.beforeState).toContain(Post);
  expect(plan.beforeState).toContain(User);
  expect(plan.afterState).toContain(Post); // update keeps it
  expect(plan.afterState).not.toContain(User); // delete removes it (insert then delete)
});
