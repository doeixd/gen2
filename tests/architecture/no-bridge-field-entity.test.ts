import { describe, it, expect } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Track R `_bridgeField` / `_bridgeEntity` retirement — full.
 *
 * Replaced with the typed `RuleReadsEdgeCustom` payload on `RULE_READS`
 * edges (PLAN.md §0.5 #8 / §R2 retirement template). `Field` /
 * `Entity` are pure-data interfaces, so the structural recovery is
 * type-safe at compile time and no longer goes through an opaque
 * `_bridge*` JS-object slot.
 */
describe("`_bridgeField` / `_bridgeEntity` retirement", () => {
  it("rules/kernel.ts neither stamps nor reads `_bridgeField`", () => {
    const content = readFileSync(resolve(__dirname, "../../src/rules/kernel.ts"), "utf-8");
    expect(content).not.toMatch(/_bridgeField/);
  });

  it("rules/kernel.ts neither stamps nor reads `_bridgeEntity`", () => {
    const content = readFileSync(resolve(__dirname, "../../src/rules/kernel.ts"), "utf-8");
    expect(content).not.toMatch(/_bridgeEntity/);
  });

  it("rules/kernel.ts exports a typed `RuleReadsEdgeCustom` payload", () => {
    const content = readFileSync(resolve(__dirname, "../../src/rules/kernel.ts"), "utf-8");
    expect(content).toMatch(/export type RuleReadsEdgeCustom/);
  });
});
