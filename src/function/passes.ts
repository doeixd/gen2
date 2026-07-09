import type { GenContext } from "../core/index.ts";
import { BUILT_IN_PASSES, type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkPlanFallback } from "../lifecycle/cross-store-legacy.ts";
import { checkActionMergeSemantics } from "../merge/index.ts";
import {
  checkFunctionRuntimes,
  checkQueryFunctionRuntimes,
  type FunctionCatalog,
} from "./function.ts";
import { checkActionWritesOnGraph, checkFunctionsOnGraph } from "./checks-kernel.ts";
import {
  getActionFunctionsFromGraph,
  getFunctionCatalogFromGraph,
  getPlanFunctionsFromGraph,
} from "./kernel.ts";

const ACTION_MERGE_PASS_NAME = "canonicalize.actionMerge";
const PLAN_FALLBACK_PASS_NAME = "legalize.planFallback";
const FUNCTION_RUNTIMES_PASS_NAME = "derive.function.runtimes";
const QUERY_FUNCTION_RUNTIMES_PASS_NAME = "derive.queryFunction.runtimes";

const diagnosticsToPassResult = (
  diagnostics: ReturnType<typeof checkPlanFallback>,
): PassResult => ({
  success: !diagnostics.some((d) => d.severity === "error"),
  diagnostics: diagnostics.map((d) =>
    defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
  ),
});

const graphFunctionCatalog = (graph: Parameters<typeof getFunctionCatalogFromGraph>[0]) =>
  getFunctionCatalogFromGraph(graph) satisfies FunctionCatalog;

export const registerFunctionPasses = (ctx: GenContext): void => {
  if (!ctx.passRegistry.has(BUILT_IN_PASSES.DERIVE.QUERY_READS)) {
    ctx.passRegistry.register(
      { name: BUILT_IN_PASSES.DERIVE.QUERY_READS, phase: "derive" },
      (graph) => diagnosticsToPassResult(checkFunctionsOnGraph(graph, graphFunctionCatalog(graph))),
    );
  }

  if (!ctx.passRegistry.has(FUNCTION_RUNTIMES_PASS_NAME)) {
    ctx.passRegistry.register({ name: FUNCTION_RUNTIMES_PASS_NAME, phase: "derive" }, (graph) =>
      diagnosticsToPassResult(checkFunctionRuntimes(graphFunctionCatalog(graph))),
    );
  }

  if (!ctx.passRegistry.has(QUERY_FUNCTION_RUNTIMES_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: QUERY_FUNCTION_RUNTIMES_PASS_NAME, phase: "derive" },
      (graph) => diagnosticsToPassResult(checkQueryFunctionRuntimes(graphFunctionCatalog(graph))),
    );
  }

  if (!ctx.passRegistry.has(BUILT_IN_PASSES.DERIVE.ACTION_WRITES)) {
    ctx.passRegistry.register(
      { name: BUILT_IN_PASSES.DERIVE.ACTION_WRITES, phase: "derive" },
      (graph) =>
        diagnosticsToPassResult(checkActionWritesOnGraph(graph, graphFunctionCatalog(graph))),
    );
  }

  if (!ctx.passRegistry.has(ACTION_MERGE_PASS_NAME)) {
    ctx.passRegistry.register({ name: ACTION_MERGE_PASS_NAME, phase: "canonicalize" }, (graph) =>
      diagnosticsToPassResult(
        getActionFunctionsFromGraph(graph).flatMap((action) => checkActionMergeSemantics(action)),
      ),
    );
  }

  if (!ctx.passRegistry.has(PLAN_FALLBACK_PASS_NAME)) {
    ctx.passRegistry.register({ name: PLAN_FALLBACK_PASS_NAME, phase: "legalize" }, (graph) =>
      diagnosticsToPassResult(
        checkPlanFallback(getPlanFunctionsFromGraph(graph).map((fn) => fn.body)),
      ),
    );
  }
};
