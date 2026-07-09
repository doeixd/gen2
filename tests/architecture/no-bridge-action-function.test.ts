import { describe, it, expect } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Track R `_bridgeActionFunction` retirement — full.
 *
 * `actionFunctionToKernelNode` now emits a typed `ActionNodeCustom`
 * payload (`{ action: ActionFunction }`) on `ACTION` nodes instead of
 * an opaque `_bridgeActionFunction` slot (PLAN.md §0.5 #8 / §R2
 * retirement template). `ActionFunction` is a pure-data interface, so
 * the typed payload is structurally equivalent to a bespoke projection
 * but type-checked at compile time.
 */
describe("`_bridgeActionFunction` retirement", () => {
  it("function/kernel.ts neither stamps nor reads `_bridgeActionFunction`", () => {
    const content = readFileSync(resolve(__dirname, "../../src/function/kernel.ts"), "utf-8");
    expect(content).not.toMatch(/_bridgeActionFunction/);
  });

  it("reactivity/reactivity.ts does not read `_bridgeActionFunction`", () => {
    const content = readFileSync(resolve(__dirname, "../../src/reactivity/reactivity.ts"), "utf-8");
    expect(content).not.toMatch(/_bridgeActionFunction/);
  });

  it("reactivity/rule-derived.ts does not read `_bridgeActionFunction`", () => {
    const content = readFileSync(
      resolve(__dirname, "../../src/reactivity/rule-derived.ts"),
      "utf-8",
    );
    expect(content).not.toMatch(/_bridgeActionFunction/);
  });

  it("core/refs.ts does not recover refs from `_bridgeActionFunction`", () => {
    const content = readFileSync(resolve(__dirname, "../../src/core/refs.ts"), "utf-8");
    expect(content).not.toMatch(/_bridgeActionFunction/);
  });

  it("function/kernel.ts exports a typed `ActionNodeCustom` payload", () => {
    const content = readFileSync(resolve(__dirname, "../../src/function/kernel.ts"), "utf-8");
    expect(content).toMatch(/export type ActionNodeCustom/);
  });
});
