/* @__NO_SIDE_EFFECTS__ */
/**
 * Editor-dialect passes (Track E §2 port).
 *
 * `legalize.editors` validates editor legality (target action/query
 * resolution, schema legality). The checker (`checkEditors`) takes an
 * options object built from ctx fields and graph-native action/query
 * lookups; this module wires it into the canonical pass registry so
 * the legacy bridge entry can retire.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { getActionFunctionsFromGraph, getQueryFunctionsFromGraph } from "../function/kernel.ts";
import { checkEditors } from "./editor.ts";

const EDITORS_PASS_NAME = "legalize.editors";

/** Register the editors legalization pass on `ctx.passRegistry`. */
export const registerEditorPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(EDITORS_PASS_NAME)) return;
  ctx.passRegistry.register({ name: EDITORS_PASS_NAME, phase: "legalize" }, (graph): PassResult => {
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: getQueryFunctionsFromGraph(graph),
      actions: getActionFunctionsFromGraph(graph),
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });
    return {
      success: !diagnostics.some((d) => d.severity === "error"),
      diagnostics: diagnostics.map((d) =>
        defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
      ),
    };
  });
};
