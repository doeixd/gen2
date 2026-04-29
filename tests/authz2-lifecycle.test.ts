import { expect, test } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import { buildActionInsert } from "../src/function/function.ts";
import { literal } from "../src/expression/builders.ts";
import { fieldWrite } from "../src/authz/surface.ts";
import { string as stringType, uuid as uuidType } from "../src/types/semantic.ts";

test("gen.authz.plan derives mutation access plan using context policies", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  gen.authz.policy({
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

  const plan = gen.authz.plan(action);
  expect(plan.kind).toBe("mutation_access_plan");
  expect(plan.fieldWriteChecks).toHaveLength(1);
  expect(plan.fieldWriteChecks[0]!.field).toBe(User.fields.name);
});
