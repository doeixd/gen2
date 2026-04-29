import * as reactivityMod from "./src/reactivity/index.ts";

console.log("deriveReactiveGraph:", typeof reactivityMod.deriveReactiveGraph);
console.log("deriveSingleFlightPlan:", typeof reactivityMod.deriveSingleFlightPlan);
console.log(
  "Keys:",
  Object.keys(reactivityMod).filter((k) => k.includes("derive") || k.includes("graph")),
);
