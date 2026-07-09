import { expectTypeOf, test } from "vite-plus/test";
import { pipe, flow, identity } from "../../src/fx/pipe.ts";

test("pipe preserves literal types through the chain", () => {
  const result = pipe(
    "hello" as const,
    (s) => s.length,
    (n) => n > 3,
  );
  expectTypeOf(result).toEqualTypeOf<boolean>();
});

test("pipe does not widen object types", () => {
  const result = pipe({ name: "User" as const, count: 5 }, (o) => o.name);
  expectTypeOf(result).toEqualTypeOf<"User">();
});

test("flow composes correctly", () => {
  const transform = flow(
    (s: string) => s.length,
    (n: number) => n > 0,
  );
  expectTypeOf(transform).toEqualTypeOf<(s: string) => boolean>();
});

test("identity preserves type", () => {
  expectTypeOf(identity(42 as const)).toEqualTypeOf<42>();
  expectTypeOf(identity("hello" as const)).toEqualTypeOf<"hello">();
});
