/* @__NO_SIDE_EFFECTS__ */
/**
 * List-dialect passes (Track E §2 port).
 *
 * `legalize.list` validates list legality (entity wiring, query/action
 * resolution). The checker (`checkList`) takes its inputs directly;
 * this module wires it into the canonical pass registry so the legacy
 * bridge entry can retire.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { getActionFunctionsFromGraph, getQueryFunctionsFromGraph } from "../function/kernel.ts";
import { checkList } from "./list.ts";

const LIST_PASS_NAME = "legalize.list";

/** Register the list legalization pass on `ctx.passRegistry`. */
export const registerListPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(LIST_PASS_NAME)) return;
  ctx.passRegistry.register({ name: LIST_PASS_NAME, phase: "legalize" }, (graph): PassResult => {
    const diagnostics = checkList(
      ctx.lists,
      ctx.entities,
      getQueryFunctionsFromGraph(graph),
      getActionFunctionsFromGraph(graph),
    );
    return {
      success: !diagnostics.some((d) => d.severity === "error"),
      diagnostics: diagnostics.map((d) =>
        defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
      ),
    };
  });
};
