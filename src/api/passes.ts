import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkApi } from "./api.ts";
import { getMutatorsFromGraph, getRoutesFromGraph } from "./kernel.ts";

const API_PASS_NAME = "derive.api";

export const registerApiPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(API_PASS_NAME)) return;

  ctx.passRegistry.register({ name: API_PASS_NAME, phase: "derive" }, (graph): PassResult => {
    const diagnostics = checkApi(getRoutesFromGraph(graph), getMutatorsFromGraph(graph));
    return {
      success: !diagnostics.some((d) => d.severity === "error"),
      diagnostics: diagnostics.map((d) =>
        defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
      ),
    };
  });
};
