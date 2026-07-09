import { expect, test } from "vite-plus/test";
import { pipe, flow, identity } from "../../src/fx/pipe.ts";

test("pipe returns the value when no functions given", () => {
  expect(pipe(42)).toBe(42);
});

test("pipe applies a single function", () => {
  expect(pipe(2, (n) => n * 3)).toBe(6);
});

test("pipe chains multiple functions", () => {
  const result = pipe(
    "hello",
    (s) => s.length,
    (n) => n > 3,
  );
  expect(result).toBe(true);
});

test("pipe chains 5 functions", () => {
  const result = pipe(
    1,
    (n) => n + 1,
    (n) => n * 2,
    (n) => n + 10,
    (n) => `${n}`,
    (s) => s.length,
  );
  expect(result).toBe(2);
});

test("flow composes functions left to right", () => {
  const transform = flow(
    (s: string) => s.length,
    (n: number) => n > 0,
  );
  expect(transform("hi")).toBe(true);
  expect(transform("")).toBe(false);
});

test("identity returns its argument", () => {
  expect(identity(42)).toBe(42);
  expect(identity("hello")).toBe("hello");
  const obj = { a: 1 };
  expect(identity(obj)).toBe(obj);
});
