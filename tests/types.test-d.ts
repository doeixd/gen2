/**
 * Compile-time type assertion tests.
 *
 * These tests verify that the generic type system propagates types correctly
 * through the public API surface. TypeScript compilation is the test.
 */

import { describe, test, expectTypeOf } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import type { SemanticType } from "../src/types/semantic.ts";
import type { Field } from "../src/entity/entity.ts";
import type { Expr } from "../src/expression/expr.ts";
import type { QueryBuilder } from "../src/query/query.ts";
import type { ActionFunction } from "../src/function/function.ts";

describe("semantic type inference", () => {
  test("gen.types.string() returns SemanticType<string>", () => {
    const { gen } = createGen();
    const t = gen.types.string();
    expectTypeOf(t).toMatchTypeOf<SemanticType<string>>();
  });

  test("gen.types.int() returns SemanticType<number>", () => {
    const { gen } = createGen();
    const t = gen.types.int();
    expectTypeOf(t).toMatchTypeOf<SemanticType<number>>();
  });
});

describe("entity field inference", () => {
  test("entity fields preserve semantic types", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      age: gen.types.int(),
    });

    expectTypeOf(User.fields.id).toMatchTypeOf<Field<string>>();
    expectTypeOf(User.fields.name).toMatchTypeOf<Field<string>>();
    expectTypeOf(User.fields.age).toMatchTypeOf<Field<number>>();
  });
});

describe("expression type inference", () => {
  test("field ref expressions preserve type", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { name: gen.types.string() });
    const ref = gen.expr.field(User.fields.name);
    expectTypeOf(ref).toMatchTypeOf<Expr<string>>();
  });
});

describe("query builder type changes", () => {
  test("select changes the result type", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
    const builder = gen.query.from(User);

    const selected = builder.select([User.fields.id]);
    expectTypeOf(selected).toMatchTypeOf<QueryBuilder<unknown, string[]>>();
  });
});

describe("function type inference", () => {
  test("action function preserves input/output types", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    const createUser = gen.func.action({
      name: "createUser",
      input_type: User,
      returns: User,
      body: gen.func.buildActionInsert(User, []),
    });

    expectTypeOf(createUser).toMatchTypeOf<ActionFunction<unknown, unknown>>();
  });
});

describe("UI backend-specific namespace extensions", () => {
  test("jsx backend adds jsxElement helper", () => {
    const { gen } = createGen();
    expectTypeOf(gen.ui.jsxElement).toBeFunction();
  });

  test("jsxElement returns backend-tagged handle", () => {
    const { gen } = createGen();
    const el = gen.ui.jsxElement("div");
    expectTypeOf(el).toMatchTypeOf<{ readonly backend: "jsx"; readonly tag: string }>();
  });
});

describe("custom type utilities", () => {
  test("nullable wraps the inner type", () => {
    const { gen } = createGen();
    const t = gen.types.nullable(gen.types.string());
    expectTypeOf(t).toMatchTypeOf<SemanticType<string | null>>();
  });
});
