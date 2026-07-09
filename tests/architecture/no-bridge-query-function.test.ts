import { describe, it, expect } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QUERY_READS_EDGE_KIND } from "../../src/dialects/callable.ts";

/**
 * Track R `_bridgeQueryFunction` retirement — full.
 *
 * `queryFunctionToKernelNode` now emits a typed `QueryNodeCustom`
 * payload (`{ query: QueryFunction }`) on `QUERY` nodes (PLAN.md
 * §0.5 #8 / §R2 retirement template). `QueryFunction` is a pure-data
 * interface, so the typed payload is structurally equivalent to a
 * bespoke projection but type-checked at compile time.
 */
describe("`_bridgeQueryFunction` retirement", () => {
  it("function/kernel.ts neither stamps nor reads `_bridgeQueryFunction`", () => {
    const content = readFileSync(resolve(__dirname, "../../src/function/kernel.ts"), "utf-8");
    expect(content).not.toMatch(/_bridgeQueryFunction/);
  });

  it("reactivity/rule-derived.ts does not read `_bridgeQueryFunction`", () => {
    const content = readFileSync(
      resolve(__dirname, "../../src/reactivity/rule-derived.ts"),
      "utf-8",
    );
    expect(content).not.toMatch(/_bridgeQueryFunction/);
  });

  it("core/refs.ts does not recover refs from `_bridgeQueryFunction`", () => {
    const content = readFileSync(resolve(__dirname, "../../src/core/refs.ts"), "utf-8");
    expect(content).not.toMatch(/_bridgeQueryFunction/);
  });

  it("function/kernel.ts exports a typed `QueryNodeCustom` payload", () => {
    const content = readFileSync(resolve(__dirname, "../../src/function/kernel.ts"), "utf-8");
    expect(content).toMatch(/export type QueryNodeCustom/);
  });

  it("QUERY_READS_EDGE_KIND is still used for graph-native read-field extraction", () => {
    expect(QUERY_READS_EDGE_KIND.id).toBe("edge.kind.queryReads");
  });
});
