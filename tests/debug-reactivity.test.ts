import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";

test("gen.reactivity.graph exists", () => {
  const { gen } = createGen();
  console.log("gen.reactivity keys:", Object.keys(gen.reactivity));
  console.log("gen.reactivity.graph:", typeof gen.reactivity.graph);
  expect(typeof gen.reactivity.graph).toBe("function");
});
