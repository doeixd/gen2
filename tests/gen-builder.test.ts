import { expect, test } from "vite-plus/test";
import {
  createGen,
  extendGen,
  omitGen,
  pickGen,
  overrideGen,
  mergeGen,
  genBuilder,
} from "../src/index.ts";

test("extendGen adds keys while preserving existing ones", () => {
  const base = createGen();
  const extended = extendGen(base, {
    customHelper: (x: number) => x * 2,
    customObject: { name: "test" },
  });

  // Existing keys are still accessible
  expect(typeof extended.gen.entity).toBe("function");
  expect(typeof extended.gen.types.string).toBe("function");

  // New keys are present and typed
  expect(extended.gen.customHelper(5)).toBe(10);
  expect(extended.gen.customObject.name).toBe("test");

  // Context is shared
  expect(extended.ctx).toBe(base.ctx);
});

test("omitGen removes keys and preserves the rest", () => {
  const base = createGen();
  const restricted = omitGen(base, ["admin", "list"] as const);

  // Omitted keys are gone at runtime
  expect("admin" in restricted.gen).toBe(false);
  expect("list" in restricted.gen).toBe(false);

  // Other keys remain accessible at runtime
  expect(typeof restricted.gen.entity).toBe("function");
  expect("query" in restricted.gen).toBe(true);

  // Context is shared
  expect(restricted.ctx).toBe(base.ctx);
});

test("pickGen keeps only selected keys", () => {
  const base = createGen();
  const coreOnly = pickGen(base, ["entity", "types", "query"] as const);

  // Selected keys are present
  expect(typeof coreOnly.gen.entity).toBe("function");
  expect(typeof coreOnly.gen.types.string).toBe("function");
  expect(typeof coreOnly.gen.query.build).toBe("function");

  // Other keys are gone
  expect("admin" in coreOnly.gen).toBe(false);
  expect("list" in coreOnly.gen).toBe(false);

  // Context is shared
  expect(coreOnly.ctx).toBe(base.ctx);
});

test("overrideGen replaces existing keys", () => {
  const base = createGen();
  const extended = extendGen(base, { myHelper: (): string => "original" });
  const overridden = overrideGen(extended, {
    myHelper: () => "overridden",
  });

  // Overridden key returns the new value
  expect(overridden.gen.myHelper()).toBe("overridden");

  // Other keys are untouched at runtime
  expect("entity" in overridden.gen).toBe(true);
  expect("types" in overridden.gen).toBe(true);

  // Context is shared
  expect(overridden.ctx).toBe(base.ctx);
});

test("mergeGen combines two results", () => {
  const base = createGen();
  const extended = extendGen(base, { helperA: () => 1 });
  const merged = mergeGen(base, extended);

  // Keys from both sides are present
  expect(typeof merged.gen.entity).toBe("function");
  expect(merged.gen.helperA()).toBe(1);

  // Uses a.ctx
  expect(merged.ctx).toBe(base.ctx);
});

test("genBuilder extend chains new helpers", () => {
  const base = createGen();
  const result = genBuilder(base)
    .extend({ helperA: () => 1 })
    .extend({ helperB: (s: string) => s.toUpperCase() })
    .build();

  expect(result.gen.helperA()).toBe(1);
  expect(result.gen.helperB("hello")).toBe("HELLO");
  expect(typeof result.gen.entity).toBe("function");
  expect(result.ctx).toBe(base.ctx);
});

test("genBuilder omit removes keys", () => {
  const base = createGen();
  const result = genBuilder(base)
    .omit(["admin", "list"] as const)
    .build();

  expect("admin" in result.gen).toBe(false);
  expect("list" in result.gen).toBe(false);
  expect(typeof result.gen.entity).toBe("function");
  expect(result.ctx).toBe(base.ctx);
});

test("genBuilder pick creates focused view", () => {
  const base = createGen();
  const result = genBuilder(base)
    .pick(["entity", "types"] as const)
    .build();

  expect(typeof result.gen.entity).toBe("function");
  expect(typeof result.gen.types.string).toBe("function");
  expect("query" in result.gen).toBe(false);
});

test("genBuilder override replaces keys", () => {
  const base = createGen();
  const result = genBuilder(base)
    .extend({ myHelper: (): string => "original" })
    .override({
      myHelper: () => "overridden",
    })
    .build();

  expect(result.gen.myHelper()).toBe("overridden");
});

test("genBuilder merge combines another result", () => {
  const base = createGen();
  const other = extendGen(base, { otherHelper: () => 42 });
  const result = genBuilder(base).merge(other).build();

  expect(typeof result.gen.entity).toBe("function");
  expect(result.gen.otherHelper()).toBe(42);
});

test("chained builder preserves type inference across steps", () => {
  const base = createGen();
  const builder = genBuilder(base)
    .extend({ a: () => 1 })
    .extend({ b: () => "two" });

  // After extending, both helpers should be available on the builder's result type
  const result = builder.build();
  expect(result.gen.a()).toBe(1);
  expect(result.gen.b()).toBe("two");
});

test("original result is untouched by all transformations", () => {
  const base = createGen();
  const extended = extendGen(base, { newKey: true });
  omitGen(base, ["admin"] as const);
  overrideGen(extended, { newKey: false });

  // Original gen is unchanged
  expect("newKey" in base.gen).toBe(false);
  expect("admin" in base.gen).toBe(true);
  expect(typeof base.gen.entity).toBe("function");
});

test("genBuilder build returns a fresh wrapper", () => {
  const base = createGen();
  const builder = genBuilder(base);
  const result = builder.build();

  // Wrapper is fresh
  expect(result).not.toBe(base);
  // Context is shared
  expect(result.ctx).toBe(base.ctx);
  // gen object is shared (builder never mutates)
  expect(result.gen).toBe(base.gen);
});
