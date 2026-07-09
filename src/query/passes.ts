import type { GenContext } from "../core/index.ts";
import type { PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkQueries, checkQueryRuntimes } from "./query.ts";
import { getQueriesFromGraph } from "./kernel.ts";

const QUERY_SHAPE_PASS_NAME = "derive.query.shape";
const QUERY_RUNTIMES_PASS_NAME = "derive.query.runtimes";

const toPassResult = (diagnostics: ReturnType<typeof checkQueries>): PassResult => ({
  success: !diagnostics.some((d) => d.severity === "error"),
  diagnostics: diagnostics.map((d) =>
    defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
  ),
});

export const registerQueryPasses = (ctx: GenContext): void => {
  if (!ctx.passRegistry.has(QUERY_SHAPE_PASS_NAME)) {
    ctx.passRegistry.register({ name: QUERY_SHAPE_PASS_NAME, phase: "derive" }, (graph) =>
      toPassResult(checkQueries(getQueriesFromGraph(graph))),
    );
  }

  if (!ctx.passRegistry.has(QUERY_RUNTIMES_PASS_NAME)) {
    ctx.passRegistry.register({ name: QUERY_RUNTIMES_PASS_NAME, phase: "derive" }, (graph) =>
      toPassResult(checkQueryRuntimes(getQueriesFromGraph(graph))),
    );
  }
};
