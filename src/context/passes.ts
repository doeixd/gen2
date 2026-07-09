/* @__NO_SIDE_EFFECTS__ */
/**
 * Context dialect passes (Track E port, PLAN.md §3).
 *
 * Second lifecycle check ported from `ctxCheckerToPass` to a
 * dialect-owned graph-native pass. Same pattern as
 * `src/requirements/passes.ts` — see that file's docstring.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkContextAndStorageOnGraph } from "./kernel.ts";

const CONTEXT_STORAGE_PASS_NAME = "legalize.contextStorage";

/** Register the graph-native context/storage pass on `ctx.passRegistry`. */
export const registerContextPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(CONTEXT_STORAGE_PASS_NAME)) return;

  ctx.passRegistry.register(
    { name: CONTEXT_STORAGE_PASS_NAME, phase: "legalize" },
    (graph, _ctx): PassResult => {
      const diagnostics = checkContextAndStorageOnGraph(graph);
      return {
        success: !diagnostics.some((d) => d.severity === "error"),
        diagnostics: diagnostics.map((d) =>
          defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
        ),
      };
    },
  );
};
