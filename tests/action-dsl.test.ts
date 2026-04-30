/**
 * Tests for the action DSL, covering insert, update, delete, and sequence
 * action expressions along with action function registration.
 */
import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";

test("buildActionInsert builds an insert ActionExpr", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });

  const expr = gen.func.buildActionInsert(User, [
    [
      User.fields.email,
      gen.expr.literal(gen.types.email(), { kind: "string", string_value: "a@b.com" }),
    ],
  ]);

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

test("buildActionUpdate builds an update ActionExpr with condition", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), age: gen.types.int() });

  const expr = gen.func.buildActionUpdate(User, [
    [User.fields.age, gen.expr.literal(gen.types.int(), { kind: "integer", integer_value: 30 })],
  ]);

  expect(expr.kind.kind).toBe("update");
  expect(expr.phase).toBe("mutation");
  expect(expr.operations[0]!.kind).toBe("update_op");
});

test("buildActionDelete builds a delete ActionExpr", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const expr = gen.func.buildActionDelete(User);

  expect(expr.kind.kind).toBe("delete");
  expect(expr.phase).toBe("mutation");
  expect(expr.operations[0]!.kind).toBe("delete_op");
});

test("buildActionSequence composes multiple actions including invalidation", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
  const UserKey = gen.key.entity(User);

  const insert = gen.func.buildActionInsert(User, [
    [
      User.fields.email,
      gen.expr.literal(gen.types.email(), { kind: "string", string_value: "a@b.com" }),
    ],
  ]);
  const update = gen.func.buildActionUpdate(User, [
    [
      User.fields.email,
      gen.expr.literal(gen.types.email(), { kind: "string", string_value: "c@d.com" }),
    ],
  ]);
  const invalidate = gen.func.buildActionInvalidate(User, [
    gen.key.patternExpr(UserKey, [gen.key.any(UserKey)]),
  ]);

  const seq = gen.func.buildActionSequence(User, [insert, update, invalidate]);

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
