/**
 * Tests for the action DSL, covering insert, update, delete, and sequence
 * action expressions along with action function registration.
 */
import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";

test("action builder DSL builds an insert ActionExpr", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });

  const expr = gen.action
    .insert(User)
    .values([
      [
        User.fields.email,
        gen.expr.literal(gen.types.email(), { kind: "string", string_value: "a@b.com" }),
      ],
    ])
    .build();

  expect(expr.kind.kind).toBe("insert");
  expect(expr.phase).toBe("mutation");
  expect(expr.target_entity).toBe(User);
  expect(expr.operations).toHaveLength(1);
  expect(expr.operations[0]!.kind).toBe("insert_op");
  expect(
    (expr.operations[0] as import("../src/function/index.ts").WriteOperation)!.values.get(
      User.fields.email,
    ),
  ).toBeDefined();
});

test("action builder DSL builds an update ActionExpr with condition", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), age: gen.types.int() });

  const expr = gen.action
    .update(User)
    .values([
      [User.fields.age, gen.expr.literal(gen.types.int(), { kind: "integer", integer_value: 30 })],
    ])
    .where(
      gen.expr.predicate({
        input_type: User,
        value_type: gen.types.boolean(),
        ast: {
          kind: { kind: "literal" },
          children: [],
          literal: { kind: "boolean", boolean_value: true },
        },
        kind: "comparison",
      }),
    )
    .build();

  expect(expr.kind.kind).toBe("update");
  expect(expr.phase).toBe("mutation");
  expect(expr.operations[0]!.kind).toBe("update_op");
});

test("action builder DSL builds a delete ActionExpr", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const expr = gen.action
    .delete(User)
    .where(
      gen.expr.predicate({
        input_type: User,
        value_type: gen.types.boolean(),
        ast: {
          kind: { kind: "literal" },
          children: [],
          literal: { kind: "boolean", boolean_value: true },
        },
        kind: "comparison",
      }),
    )
    .build();

  expect(expr.kind.kind).toBe("delete");
  expect(expr.phase).toBe("mutation");
  expect(expr.operations[0]!.kind).toBe("delete_op");
});

test("action builder DSL composes multiple actions including invalidation", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
  const UserKey = gen.key.entity(User);

  const insert = gen.action
    .insert(User)
    .values([
      [
        User.fields.email,
        gen.expr.literal(gen.types.email(), { kind: "string", string_value: "a@b.com" }),
      ],
    ])
    .build();

  const update = gen.action
    .update(User)
    .values([
      [
        User.fields.email,
        gen.expr.literal(gen.types.email(), { kind: "string", string_value: "c@d.com" }),
      ],
    ])
    .build();

  const invalidate = gen.action
    .invalidate(User)
    .patterns([gen.key.patternExpr(UserKey, [gen.key.any(UserKey)])])
    .build();

  const seq = gen.action.sequence(User, [insert, update, invalidate]).build();

  expect(seq.kind.kind).toBe("sequence");
  expect(seq.operations).toHaveLength(3);
  expect(seq.operations[0]!.kind).toBe("insert_op");
  expect(seq.operations[1]!.kind).toBe("update_op");
  expect(seq.operations[2]!.kind).toBe("invalidate_op");
});

test("action functions accept ActionExpr bodies built with DSL", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });

  const action = gen.func.action({
    name: "createUser",
    input_type: gen.types.object({ email: gen.types.email() }),
    input_fields: [User.fields.email],
    returns: gen.types.uuid(),
    body: gen.func.buildActionInsert(User, [
      [
        User.fields.email,
        gen.expr.literal(gen.types.email(), { kind: "string", string_value: "a@b.com" }),
      ],
    ]),
  });

  expect(action.name).toBe("createUser");
  expect(action.body.kind.kind).toBe("insert");
  expect(ctx.action_functions).toContain(action);
});
