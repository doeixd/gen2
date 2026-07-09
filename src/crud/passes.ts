/* @__NO_SIDE_EFFECTS__ */
/**
 * CRUD-dialect passes (Track E §2 port).
 *
 * `legalize.crud` validates CRUD legality (entity wiring, query/action
 * resolution, mapping coverage). The checker (`checkCrud`) takes its
 * inputs directly; this module wires it into the canonical pass
 * registry so the legacy bridge entry can retire.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { getActionFunctionsFromGraph, getQueryFunctionsFromGraph } from "../function/kernel.ts";
import { checkCrud } from "./crud.ts";

const CRUD_PASS_NAME = "legalize.crud";

/** Register the CRUD legalization pass on `ctx.passRegistry`. */
export const registerCrudPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(CRUD_PASS_NAME)) return;
  ctx.passRegistry.register({ name: CRUD_PASS_NAME, phase: "legalize" }, (graph): PassResult => {
    const diagnostics = checkCrud(
      ctx.cruds,
      ctx.entities,
      getQueryFunctionsFromGraph(graph),
      getActionFunctionsFromGraph(graph),
      ctx.mappings,
    );
    return {
      success: !diagnostics.some((d) => d.severity === "error"),
      diagnostics: diagnostics.map((d) =>
        defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
      ),
    };
  });
};
