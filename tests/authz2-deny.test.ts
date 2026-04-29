import { expect, test } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import { applyDenyToQuery, applyDenyToAction, applyDenyToFormField } from "../src/authz/deny.ts";
import {
  entityRead,
  fieldRead,
  fieldWrite,
  uiHint,
  defineAccessSurfaceBinding,
} from "../src/authz/surface.ts";
import { definePolicy } from "../src/authz/authz.ts";
import { buildActionInsert } from "../src/function/function.ts";
import { literal } from "../src/expression/builders.ts";
import { rule } from "../src/rules/rules.ts";
import { string as stringType, uuid as uuidType } from "../src/types/semantic.ts";

test("applyDenyToQuery omits field from projection", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const query = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: stringType(),
    projection: gen.query.buildProjection([
      gen.query.buildProjectedField(User.fields.id),
      gen.query.buildProjectedField(User.fields.name),
    ]),
  });
  const policy = definePolicy({ name: "userPolicy", target_entity: User, actions: [] });
  const binding = defineAccessSurfaceBinding({
    surface: fieldRead(User, User.fields.name),
    policy,
    deny: "omit",
  });
  const denied = applyDenyToQuery(query, binding);
  expect(denied.projection!.fields).toHaveLength(1);
  expect(denied.projection!.fields[0]!.field).toBe(User.fields.id);
});

test("applyDenyToQuery redacts field with placeholder expression", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const query = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: stringType(),
    projection: gen.query.buildProjection([gen.query.buildProjectedField(User.fields.name)]),
  });
  const policy = definePolicy({ name: "userPolicy", target_entity: User, actions: [] });
  const binding = defineAccessSurfaceBinding({
    surface: fieldRead(User, User.fields.name),
    policy,
    deny: "redact",
  });
  const denied = applyDenyToQuery(query, binding);
  expect(denied.projection!.fields[0]!.expression).toBeDefined();
});

test("applyDenyToQuery adds requirement for entity.read not_found", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const query = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: stringType(),
  });
  const policy = definePolicy({ name: "userPolicy", target_entity: User, actions: [] });
  const binding = defineAccessSurfaceBinding({
    surface: entityRead(User),
    policy,
    deny: "not_found",
  });
  const denied = applyDenyToQuery(query, binding);
  expect(denied.requirements.some((r) => r.kind === "authz:entity-read-not-found")).toBe(true);
});

test("applyDenyToAction adds forbidden requirement", () => {
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
  const policy = definePolicy({ name: "userPolicy", target_entity: User, actions: [] });
  const binding = defineAccessSurfaceBinding({
    surface: fieldWrite(User, User.fields.name),
    policy,
    deny: "forbidden",
  });
  const denied = applyDenyToAction(action, binding);
  expect(denied.requirements.some((r) => r.kind === "authz:field.write:forbidden")).toBe(true);
});

test("applyDenyToFormField sets editableWhen to negated rule for readonly", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: uuidType(), name: stringType() }, { store_name: "users" });
  const r = rule.define({
    name: "canEdit",
    when: rule.eq(
      rule.field(User, User.fields.name, User.fields.name.semantic_type),
      rule.literal("admin", stringType()),
    ),
  });
  const policy = definePolicy({
    name: "userPolicy",
    target_entity: User,
    predicate: r,
    actions: [],
  });
  const field = gen.forms.field(User.fields.name);
  const component = { name: "test" } as unknown as import("../src/ui/index.ts").Component;
  const binding = defineAccessSurfaceBinding({
    surface: uiHint(component),
    policy,
    deny: "readonly",
  });
  const denied = applyDenyToFormField(field, binding);
  expect(denied.editableWhen).toBeDefined();
  expect(denied.editableWhen!.name).toBe("canEdit_negated");
  expect(denied.editableWhen!.body.kind).toBe("rule.not");
});
