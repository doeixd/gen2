import { describe, it, expect } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Track R `_bridgeKeyFamily` retirement — full.
 *
 * `keyFamilyToKernelNode` now emits a typed `KeyFamilyNodeCustom`
 * payload instead of a `_bridgeKeyFamily` JS-object side channel
 * (PLAN.md §0.5 #8 / §R2 retirement template). Reconstructing a
 * `KeyFamily` from the typed payload + node fields is the only
 * canonical recovery path.
 */
describe("`_bridgeKeyFamily` retirement", () => {
  it("reactivity/kernel.ts does not stamp or read `_bridgeKeyFamily`", () => {
    const content = readFileSync(resolve(__dirname, "../../src/reactivity/kernel.ts"), "utf-8");
    expect(content).not.toMatch(/_bridgeKeyFamily/);
  });

  it("core/refs.ts does not recover refs from `_bridgeKeyFamily`", () => {
    const content = readFileSync(resolve(__dirname, "../../src/core/refs.ts"), "utf-8");
    expect(content).not.toMatch(/_bridgeKeyFamily/);
  });
});
