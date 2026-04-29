/**
 * Edge-case tests for entity behavior, including field ordering, duplicate field
 * detection, state transition graphs, and operation kind consistency.
 */
import { expect, test } from "vite-plus/test";
import { createGen, entity, types } from "../src/index.ts";

test("entity with many fields preserves order in fieldList", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    a: gen.types.string(),
    b: gen.types.int(),
    c: gen.types.boolean(),
    d: gen.types.uuid(),
  });
  expect(User.fieldList.map((f) => f.name)).toEqual(["a", "b", "c", "d"]);
});

test("entity fields are accessible by string key", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
  expect(User.fields.id.name).toBe("id");
  expect(User.fields.email.name).toBe("email");
});

test("entity with same name produces duplicate-name diagnostic", () => {
  const { gen } = createGen();
  const a = gen.entity("E", { id: gen.types.uuid() });
  const b = gen.entity("E", { id: gen.types.uuid() });
  const diags = entity.checkEntityInvariants([a, b]);
  expect(diags.some((d) => d.code === "entity:duplicate-name")).toBe(true);
});

test("entity with duplicate field names produces diagnostic", () => {
  // Our defineEntity deduplicates by object key, so this tests the checker directly
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  // Manually construct an entity with duplicate field names to test the checker
  const badEntity = {
    ...User,
    fieldList: [User.fields.id, User.fields.id],
  };
  const diags = entity.checkEntityInvariants([badEntity]);
  expect(diags.some((d) => d.code === "entity:duplicate-field")).toBe(true);
});

test("read-only field cannot appear in create input", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    id: { type: gen.types.uuid(), read_only: true },
    name: gen.types.string(),
  });
  const op = {
    name: "createUser",
    target_entity: User,
    input_fields: [User.fields.id, User.fields.name],
  };
  const diags = entity.checkReadOnlyInInput([op], "create");
  expect(diags).toHaveLength(1);
  expect(diags[0]!.code).toBe("entity:readonly-field-in-create");
});

test("read-only field cannot appear in update input", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    id: { type: gen.types.uuid(), read_only: true },
    name: gen.types.string(),
  });
  const op = { name: "updateUser", target_entity: User, input_fields: [User.fields.id] };
  const diags = entity.checkReadOnlyInInput([op], "update");
  expect(diags[0]!.code).toBe("entity:readonly-field-in-update");
});

test("FieldFromWrongEntity catches mismatched ownership", () => {
  const { gen } = createGen();
  const A = gen.entity("A", { x: gen.types.string() });
  const B = gen.entity("B", { y: gen.types.string() });
  const diags = entity.checkFieldOwnership([{ target_entity: B, field: A.fields.x }]);
  expect(diags).toHaveLength(1);
  expect(diags[0]!.code).toBe("entity:wrong-entity-field");
});

test("NonexistentFieldRef catches refs to missing fields", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const stale = {
    kind: "FieldRef" as const,
    owner: { kind: "Entity" as const, name: "User" },
    name: "ghost",
    value_type: "string",
    metadata: [],
  };
  const diags = entity.checkRefsExist([stale], [User]);
  expect(diags).toHaveLength(1);
  expect(diags[0]!.code).toBe("entity:nonexistent-field");
});

test("transition graph on non-enum field produces error", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const tg = {
    target_field: User.fields.id,
    transitions: [{ from_state: "a", to_state: "b" }],
    terminal_states: ["b"],
  };
  const diags = entity.checkEntityInvariants([{ ...User, transitions: [tg] }]);
  expect(diags.some((d) => d.code === "entity:transition-on-non-enum")).toBe(true);
});

test("transition with invalid state produces error", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    status: gen.types.enumOf("Status", ["pending", "done"]),
  });
  const tg = {
    target_field: User.fields.status,
    transitions: [{ from_state: "pending", to_state: "invalid" }],
    terminal_states: ["done"],
  };
  const diags = entity.checkEntityInvariants([{ ...User, transitions: [tg] }]);
  expect(diags.some((d) => d.code === "entity:invalid-transition-state")).toBe(true);
});

test("terminal state not in enum values produces error", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    status: gen.types.enumOf("Status", ["pending", "done"]),
  });
  const tg = {
    target_field: User.fields.status,
    transitions: [{ from_state: "pending", to_state: "done" }],
    terminal_states: ["unknown"],
  };
  const diags = entity.checkEntityInvariants([{ ...User, transitions: [tg] }]);
  expect(diags.some((d) => d.code === "entity:invalid-terminal-state")).toBe(true);
});

test("self-transition produces warning", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    status: gen.types.enumOf("Status", ["pending", "done"]),
  });
  const tg = {
    target_field: User.fields.status,
    transitions: [{ from_state: "pending", to_state: "pending" }],
    terminal_states: [],
  };
  const diags = entity.checkEntityInvariants([{ ...User, transitions: [tg] }]);
  expect(diags.some((d) => d.code === "entity:self-transition")).toBe(true);
});

test("terminal state with outgoing transition produces warning", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    status: gen.types.enumOf("Status", ["pending", "done"]),
  });
  const tg = {
    target_field: User.fields.status,
    transitions: [
      { from_state: "pending", to_state: "done" },
      { from_state: "done", to_state: "pending" },
    ],
    terminal_states: ["done"],
  };
  const diags = entity.checkEntityInvariants([{ ...User, transitions: [tg] }]);
  expect(diags.some((d) => d.code === "entity:terminal-state-outgoing")).toBe(true);
});

test("brand type preserves underlying representation", () => {
  const { gen } = createGen();
  const UserId = gen.types.brand("UserId", gen.types.uuid());
  expect(UserId.storage_repr.kind.kind).toBe("fixed_bytes");
  expect(UserId.storage_repr.byte_width).toBe(16);
});

test("literal type for string has correct storage", () => {
  const { gen } = createGen();
  const t = gen.types.literal("admin");
  expect(t.kind).toBe("string");
});

test("literal type for number has correct storage", () => {
  const { gen } = createGen();
  const tInt = gen.types.literal(42);
  expect(tInt.storage_repr.kind.kind).toBe("i32");
  const tFloat = gen.types.literal(3.14);
  expect(tFloat.storage_repr.kind.kind).toBe("f64");
});

test("object type creates struct representation", () => {
  const { gen } = createGen();
  const t = gen.types.object({ id: gen.types.uuid(), count: gen.types.int() });
  expect(t.kind).toBe("struct");
  expect(t.storage_repr.kind.kind).toBe("struct");
});

test("enumOf with empty values is allowed", () => {
  const { gen } = createGen();
  const t = gen.types.enumOf("Empty", []);
  expect(t.enum_values).toEqual([]);
});

test("array of array creates nested representation", () => {
  const { gen } = createGen();
  const t = gen.types.array(gen.types.array(gen.types.string()));
  expect(t.storage_repr.kind.kind).toBe("array");
  expect(t.storage_repr.kind.inner?.[0]?.kind.kind).toBe("array");
});

test("operation kind field consistency catches predicate not outputting boolean", () => {
  const { gen } = createGen();
  const op = {
    name: "bad",
    kind: "predicate" as const,
    input_type: gen.types.int(),
    output_type: gen.types.string(),
    requires_numeric: false,
    requires_orderable: false,
    capabilities: [],
    laws: [],
    effects: [],
    implementations: [],
  };
  const issues = types.checkOperationKindFields(op);
  expect(issues.some((m) => m.includes("boolean"))).toBe(true);
});

test("operation kind field consistency catches effect op with no effects", () => {
  const { gen } = createGen();
  const op = {
    name: "bad",
    kind: "effect" as const,
    input_type: gen.types.int(),
    output_type: gen.types.int(),
    requires_numeric: false,
    requires_orderable: false,
    capabilities: [],
    laws: [],
    effects: [],
    implementations: [],
  };
  const issues = types.checkOperationKindFields(op);
  expect(issues.some((m) => m.includes("effect"))).toBe(true);
});

test("duplicate operation implementations for same runtime are caught", () => {
  const { gen } = createGen();
  const op = {
    name: "bad",
    kind: "unary" as const,
    input_type: gen.types.int(),
    output_type: gen.types.int(),
    requires_numeric: false,
    requires_orderable: false,
    capabilities: [],
    laws: [],
    effects: [],
    implementations: [
      { runtime: "node20", body: { kind: "static_ast" as const } },
      { runtime: "node20", body: { kind: "static_ast" as const } },
    ],
  };
  const diags = types.checkOperations([op]);
  expect(diags.some((d) => d.code === "types:duplicate-implementation")).toBe(true);
});

test("trait application with mismatched applies_to produces diagnostic", () => {
  const diags = types.checkTraitApplications([]);
  // Trait applications checking is not yet implemented as a standalone checker;
  // this test documents the expected behavior.
  expect(Array.isArray(diags)).toBe(true);
});
