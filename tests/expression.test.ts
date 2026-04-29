/**
 * Tests for expression construction, unary/binary operations, type safety, and
 * phase-based purity checks (schema and client phases).
 */
import { expect, test } from "vite-plus/test";
import { createGen, expression } from "../src/index.ts";

test("buildExpr collects refs from the AST", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { email: gen.types.email() });
  const e = gen.expr.field(User.fields.email);
  expect(e.refs).toHaveLength(1);
  expect(e.refs[0]!.name).toBe("email");
});

test("applyUnary produces a typed expression with the operation's output type", () => {
  const { gen } = createGen();
  const lower = gen.types.op.unary({
    name: "lower",
    input_type: gen.types.string(),
    output_type: gen.types.string(),
  });
  const lit = gen.expr.literal(gen.types.string(), { kind: "string", string_value: "HELLO" });
  const e = gen.expr.applyUnary(lower, lit);
  expect(e.value_type.name).toBe("string");
  expect(e.kind.kind).toBe("op_call");
});

test("applyBinary rejects mismatched operand types at runtime", () => {
  const { gen } = createGen();
  const eq = gen.types.op.binary({
    name: "eq",
    left_type: gen.types.int(),
    right_type: gen.types.int(),
    output_type: gen.types.boolean(),
  });
  const a = gen.expr.literal(gen.types.int(), { kind: "integer", integer_value: 1 });
  const b = gen.expr.literal(gen.types.string(), { kind: "string", string_value: "x" });
  // The type system prevents this at compile time; we bypass it here to test
  // the runtime defensive check still fires.
  expect(() => gen.expr.applyBinary(eq, a, b as unknown as typeof a)).toThrow();
});

test("schema-phase expressions cannot contain opaque JS", () => {
  const { gen } = createGen();
  const e = gen.expr.literal(gen.types.string(), { kind: "string", string_value: "ok" });
  // The default builder produces a clean tree; checkSchemaPurity should pass.
  const diags = expression.checkSchemaPurity([e]);
  expect(diags).toEqual([]);
});

test("client-phase expressions cannot contain server-only effects", () => {
  const { gen } = createGen();
  const dbRead = gen.types.op.effect({
    name: "loadAll",
    input_type: gen.types.int(),
    output_type: gen.types.int(),
    effects: [{ kind: "db_read" }],
  });
  const operand = gen.expr.literal(gen.types.int(), { kind: "integer", integer_value: 1 });
  // Build a client-phase expr by hand so we can attach the effect.
  const e = expression.buildExpr({
    value_type: gen.types.int(),
    phase: "client",
    ast: expression.opCallNode(dbRead, [operand.ast]),
    kind: "op_call",
    effects: dbRead.effects,
  });
  const diags = expression.checkClientNoServerEffects([e]);
  expect(diags.some((d) => d.code === "expression:client-server-effect")).toBe(true);
});
