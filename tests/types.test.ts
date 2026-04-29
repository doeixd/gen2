/**
 * Tests for type inference across semantic types, fields, entities, expressions,
 * queries, route handlers, auth conditions, operations, forms, and branded capabilities.
 */
import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import type { SemanticType } from "../src/types/index.ts";
import type { Field, InferEntity, InferField } from "../src/entity/index.ts";
import type { Expr } from "../src/expression/index.ts";
import type { QueryExpression } from "../src/query/index.ts";
import type { RouteHandler } from "../src/api/index.ts";
import type { AuthCondition } from "../src/authz/index.ts";

// --- Type-level test helpers ------------------------------------------------

/** Assert that a type evaluates to `true` at compile time. */
export type Expect<T extends true> = T;

/** Structural equality check for two types. */
export type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// --- SemanticType inference -------------------------------------------------

/** Compile-time test: InferType<string> should be string. */
export type _TestInferType = Expect<
  Equal<import("../src/types/index.ts").InferType<SemanticType<string>>, string>
>;
/** Compile-time test: InferType<number> should be number. */
export type _TestInferNumber = Expect<
  Equal<import("../src/types/index.ts").InferType<SemanticType<number>>, number>
>;
/** Compile-time test: InferType<boolean> should be boolean. */
export type _TestInferBoolean = Expect<
  Equal<import("../src/types/index.ts").InferType<SemanticType<boolean>>, boolean>
>;

// --- Field inference ---------------------------------------------------------

/** Compile-time test: InferField<Field<string>> should be string. */
export type _TestInferField = Expect<Equal<InferField<Field<string>>, string>>;
/** Compile-time test: InferField<Field<number>> should be number. */
export type _TestInferFieldNumber = Expect<Equal<InferField<Field<number>>, number>>;

// --- Entity inference --------------------------------------------------------

test("InferEntity extracts TypeScript types from entity fields", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    age: gen.types.int(),
    active: gen.types.boolean(),
  });

  // Use InferEntity so the import is counted
  const assertUser = (_: InferEntity<typeof User>) => {};
  assertUser({ id: "", age: 0, active: false });

  // Runtime sanity checks
  expect(User.fields.id.semantic_type.ts_type_name).toBe("string");
  expect(User.fields.age.semantic_type.ts_type_name).toBe("number");
  expect(User.fields.active.semantic_type.ts_type_name).toBe("boolean");
});

// --- Expr inference ----------------------------------------------------------

test("Expr<Ts> carries its value type through the type system", () => {
  const { gen } = createGen();
  const strExpr: Expr<string> = gen.expr.literal(gen.types.string(), {
    kind: "string",
    string_value: "hello",
  });
  expect(strExpr.value_type.ts_type_name).toBe("string");

  const numExpr: Expr<number> = gen.expr.literal(gen.types.int(), {
    kind: "integer",
    integer_value: 42,
  });
  expect(numExpr.value_type.ts_type_name).toBe("number");
});

// --- QueryExpression inference -----------------------------------------------

test("QueryExpression<Result> carries its result type", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), age: gen.types.int() });

  const q: QueryExpression<string> = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.string(),
  });

  expect(q.result_type.ts_type_name).toBe("string");
});

// --- RouteHandler discriminated union ----------------------------------------

test("RouteHandler discriminated union narrows correctly", () => {
  const { gen } = createGen();
  const qf = gen.func.query({
    name: "getUser",
    input_type: gen.types.string(),
    returns: gen.types.string(),
    body: gen.query.build({
      source: { kind: "entity_source", entity: gen.entity("User", { id: gen.types.uuid() }) },
      result_type: gen.types.string(),
    }),
  });

  const handler: RouteHandler = gen.api.buildQueryHandler(qf);
  expect(handler.kind).toBe("query");

  // TypeScript narrowing: accessing query_func is safe after kind check
  if (handler.kind === "query") {
    expect(handler.query_func).toBe(qf);
  }
});

// --- AuthCondition discriminated union ---------------------------------------

test("AuthCondition discriminated union narrows correctly", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const cond: AuthCondition = gen.authz.allowOwner(User.fields.id);
  expect(cond.kind).toBe("AllowOwner");

  if (cond.kind === "AllowOwner") {
    expect(cond.owner_field).toBe(User.fields.id);
  }

  const roleCond: AuthCondition = gen.authz.allowRole("admin");
  expect(roleCond.kind).toBe("AllowRole");
  if (roleCond.kind === "AllowRole") {
    expect(roleCond.role).toBe("admin");
  }
});

// --- Operation constructor type specificity ----------------------------------

test("operation constructors preserve input/output type specificity", () => {
  const { gen } = createGen();
  const op = gen.types.op.unary({
    name: "toUpper",
    input_type: gen.types.string(),
    output_type: gen.types.string(),
  });

  // The operation's output_type should be SemanticType<string>
  expect(op.output_type.ts_type_name).toBe("string");
  expect(op.input_type!.ts_type_name).toBe("string");
});

// --- FieldShapeInput inference -----------------------------------------------

test("defineEntity infers Field<Ts> from both raw SemanticType and shaped input", () => {
  const { gen } = createGen();
  const Product = gen.entity("Product", {
    id: gen.types.uuid(),
    price: { type: gen.types.int(), nullable: true },
  });

  const assertProduct = (_: InferEntity<typeof Product>) => {};
  assertProduct({ id: "", price: 0 });

  expect(Product.fields.id.semantic_type.ts_type_name).toBe("string");
  expect(Product.fields.price.semantic_type.ts_type_name).toBe("number");
  expect(Product.fields.price.nullable).toBe(true);
});

// --- BrandCapability and BrandEffect -----------------------------------------

test("branded capabilities and effects are type-safe", () => {
  // Custom plugin capability
  type CustomCap = import("../src/types/index.ts").BrandCapability<"drizzle", "jsonb">;
  const customCap: CustomCap = "drizzle:jsonb" as CustomCap;
  expect(customCap).toBe("drizzle:jsonb");

  // Custom plugin effect
  type CustomEffect = import("../src/types/index.ts").BrandEffect<"stripe", "payment">;
  const customEffect: CustomEffect = "stripe:payment" as CustomEffect;
  expect(customEffect).toBe("stripe:payment");
});

// --- Generic operation inference in builders ---------------------------------

test("applyUnary infers output type from generic UnaryOperation", () => {
  const { gen } = createGen();
  const lower = gen.types.op.unary({
    name: "lower",
    input_type: gen.types.string(),
    output_type: gen.types.string(),
  });
  const lit = gen.expr.literal(gen.types.string(), { kind: "string", string_value: "HELLO" });

  // Ts is inferred as string from the operation's output_type — no explicit generic needed
  const e = gen.expr.applyUnary(lower, lit);
  expect(e.value_type.ts_type_name).toBe("string");
});

test("applyBinary infers output type and enforces operand types", () => {
  const { gen } = createGen();
  const add = gen.types.op.binary({
    name: "add",
    left_type: gen.types.int(),
    right_type: gen.types.int(),
    output_type: gen.types.int(),
  });
  const a = gen.expr.literal(gen.types.int(), { kind: "integer", integer_value: 1 });
  const b = gen.expr.literal(gen.types.int(), { kind: "integer", integer_value: 2 });

  // Out inferred as number; left/right must be Expr<number>
  const e = gen.expr.applyBinary(add, a, b);
  expect(e.value_type.ts_type_name).toBe("number");
});

// --- custom ------------------------------------------------------------------

test("custom builds fully typed custom semantic types", () => {
  const { gen } = createGen();
  const Percentage = gen.types.custom<number>({
    name: "Percentage",
    kind: "numeric",
    ts_type_name: "number",
    storage_repr: gen.types.repr.f64(),
    validate: (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 100,
  });

  expect(Percentage.name).toBe("Percentage");
  expect(Percentage.kind).toBe("numeric");
  expect(Percentage.validate?.(50)).toBe(true);
  expect(Percentage.validate?.(150)).toBe(false);
});

// --- factory -----------------------------------------------------------------

test("factory produces reusable typed constructors", () => {
  const { gen } = createGen();
  const createNumeric = gen.types.factory<number>({
    kind: "numeric",
    ts_type_name: "number",
    storage_repr: gen.types.repr.i32(),
    validate: (v: unknown): v is number => typeof v === "number" && Number.isInteger(v),
  });

  const smallInt = createNumeric("smallint");
  const bigInt = createNumeric("bigint", {
    storage_repr: gen.types.repr.i64(),
  });

  expect(smallInt.name).toBe("smallint");
  expect(bigInt.name).toBe("bigint");
  expect(smallInt.validate?.(42)).toBe(true);
  expect(bigInt.validate?.(3.14)).toBe(false);
});

// --- extend ------------------------------------------------------------------

test("extend derives a new type from an existing one", () => {
  const { gen } = createGen();
  const ShortString = gen.types.extend(gen.types.string(), {
    name: "ShortString",
    validate: (v: unknown): v is string => typeof v === "string" && v.length <= 255,
  });

  expect(ShortString.name).toBe("ShortString");
  expect(ShortString.validate?.("hello")).toBe(true);
  expect(ShortString.validate?.("x".repeat(300))).toBe(false);
});

// --- nullable ----------------------------------------------------------------

test("nullable wraps a type as null-able", () => {
  const { gen } = createGen();
  const MaybeString = gen.types.nullable(gen.types.string());

  expect(MaybeString.name).toBe("string | null");
  expect(MaybeString.ts_type_name).toBe("string | null");
  expect(MaybeString.validate?.("hello")).toBe(true);
  expect(MaybeString.validate?.(null)).toBe(true);
  expect(MaybeString.validate?.(42)).toBe(false);
});

// --- Function inference helpers --------------------------------------------

import type {
  InferFunctionInput,
  InferFunctionOutput,
  InferFunctionErrors,
} from "../src/function/index.ts";

test("InferFunctionInput and InferFunctionOutput extract types from functions", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), age: gen.types.int() });

  const getUser = gen.func.query({
    name: "getUser",
    input_type: gen.types.string(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.string(),
    }),
  });

  type GetUserIn = InferFunctionInput<typeof getUser>;
  type GetUserOut = InferFunctionOutput<typeof getUser>;

  const assertIn = (_: GetUserIn) => {};
  assertIn("hello");

  const assertOut = (_: GetUserOut) => {};
  assertOut({ id: "", age: 0 });

  expect(true).toBe(true);
});

// --- Query inference --------------------------------------------------------

import type { InferQueryResult } from "../src/query/index.ts";

test("InferQueryResult extracts the result type from a QueryExpression", () => {
  const { gen } = createGen();

  const q = gen.query.build({
    source: { kind: "entity_source", entity: gen.entity("User", { id: gen.types.uuid() }) },
    result_type: gen.types.int(),
  });

  type QResult = InferQueryResult<typeof q>;
  const assertResult = (_: QResult) => {};
  assertResult(42);

  expect(q.result_type.ts_type_name).toBe("number");
});

// --- Form inference ---------------------------------------------------------

import type { InferFormValues, InferFormResult, InferFormErrors } from "../src/forms/index.ts";

test("InferFormValues, InferFormResult, and InferFormErrors extract form types", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });

  const createUser = gen.func.action({
    name: "createUser",
    input_type: gen.types.object({ email: gen.types.email() }),
    input_fields: [User.fields.email],
    returns: gen.types.uuid(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
  });

  const form = gen.forms.build("CreateUserForm", createUser, gen.types.uuid());

  type FV = InferFormValues<typeof form>;
  type FR = InferFormResult<typeof form>;
  type FE = InferFormErrors<typeof form>;

  const assertValues = (_: FV) => {};
  assertValues({ email: "" });

  const assertResult = (_: FR) => {};
  assertResult("");

  const assertErrors = (_: FE) => {};
  assertErrors("any_error_code");

  expect(form.name).toBe("CreateUserForm");
});

test("InferFunctionErrors extracts error types from functions with errors", () => {
  const { gen } = createGen();

  const fnWithErrors = gen.func.query({
    name: "getThing",
    input_type: gen.types.string(),
    returns: gen.types.string(),
    body: gen.query.build({
      source: { kind: "entity_source", entity: gen.entity("Thing", { id: gen.types.uuid() }) },
      result_type: gen.types.string(),
    }),
    errors: [
      { code: "NOT_FOUND", kind: "not_found" },
      { code: "FORBIDDEN", kind: "forbidden" },
    ],
  });

  type FNErrors = InferFunctionErrors<typeof fnWithErrors>;
  const assertError = (_: FNErrors) => {};
  assertError({ code: "NOT_FOUND", kind: "not_found" });

  expect(fnWithErrors.errors).toHaveLength(2);
});
