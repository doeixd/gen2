import { describe, it, expect } from "vite-plus/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC_ROOT = resolve(__dirname, "../../src");

/**
 * Walk every `.ts` file under `src/` once and collect any `_bridge*`
 * literals. Returns a sorted array of distinct keys.
 */
const collectBridgeKeys = (): string[] => {
  const found = new Set<string>();
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        visit(full);
      } else if (stat.isFile() && full.endsWith(".ts")) {
        const text = readFileSync(full, "utf-8");
        for (const m of text.matchAll(/_bridge\w+/g)) found.add(m[0]);
      }
    }
  };
  visit(SRC_ROOT);
  return [...found].sort();
};

/**
 * Track R `_bridge*` retirement sweep — full.
 *
 * As of the 2026-05-11 sweep, every `_bridge*` JS-object side channel
 * has been retired in favor of typed `*NodeCustom` / `*EdgeCustom`
 * payloads, or in the case of `_bridgeRef` a typed `ref` slot under
 * `metadata.custom` (PLAN.md §0.5 #8 retirement). This test caps the
 * surface — any future regression that re-introduces a `_bridge*`
 * stamp will fail here.
 */
describe("`_bridge*` surface sweep", () => {
  it("no `_bridge*` keys remain in src/", () => {
    expect(collectBridgeKeys()).toEqual([]);
  });
});
