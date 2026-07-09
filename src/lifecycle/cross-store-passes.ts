import type { GenContext } from "../core/index.ts";
import type { PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { getMutatorsFromGraph } from "../api/kernel.ts";
import { getQueriesFromGraph } from "../query/kernel.ts";
import {
  checkCrossStorePlanners,
  checkCrossStoreReadComposition,
  checkCrossStoreWriteCoordinator,
} from "./cross-store-legacy.ts";
import { getCrossStorePlannersFromGraph } from "./cross-store-kernel.ts";

const CROSS_STORE_PLANNERS_PASS_NAME = "legalize.crossStore.planners";
const CROSS_STORE_READS_PASS_NAME = "legalize.crossStore.reads";
const CROSS_STORE_WRITES_PASS_NAME = "legalize.crossStore.writes";

const toPassResult = (diagnostics: ReturnType<typeof checkCrossStorePlanners>): PassResult => ({
  success: !diagnostics.some((d) => d.severity === "error"),
  diagnostics: diagnostics.map((d) =>
    defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
  ),
});

export const registerCrossStorePasses = (ctx: GenContext): void => {
  if (!ctx.passRegistry.has(CROSS_STORE_PLANNERS_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: CROSS_STORE_PLANNERS_PASS_NAME, phase: "legalize" },
      (graph) => toPassResult(checkCrossStorePlanners(getCrossStorePlannersFromGraph(graph))),
    );
  }
  if (!ctx.passRegistry.has(CROSS_STORE_READS_PASS_NAME)) {
    ctx.passRegistry.register({ name: CROSS_STORE_READS_PASS_NAME, phase: "legalize" }, (graph) =>
      toPassResult(
        checkCrossStoreReadComposition(
          getQueriesFromGraph(graph),
          getCrossStorePlannersFromGraph(graph),
        ),
      ),
    );
  }
  if (!ctx.passRegistry.has(CROSS_STORE_WRITES_PASS_NAME)) {
    ctx.passRegistry.register({ name: CROSS_STORE_WRITES_PASS_NAME, phase: "legalize" }, (graph) =>
      toPassResult(checkCrossStoreWriteCoordinator(getMutatorsFromGraph(graph))),
    );
  }
};
