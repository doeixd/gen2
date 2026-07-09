/* @__NO_SIDE_EFFECTS__ */
/**
 * Obligations-dialect passes (Track E §2 port).
 *
 * `legalize.obligations` validates the obligation graph (required
 * obligations pending, unhandled obligations without consumers). The
 * checker (`checkObligations`) reads from `ctx` and derives the
 * obligation graph; this module wires it into the canonical pass
 * registry so the legacy bridge entry can retire.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkObligations } from "./obligations.ts";

const OBLIGATIONS_PASS_NAME = "legalize.obligations";

/** Register the obligation legalization pass on `ctx.passRegistry`. */
export const registerObligationsPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(OBLIGATIONS_PASS_NAME)) return;
  ctx.passRegistry.register({ name: OBLIGATIONS_PASS_NAME, phase: "legalize" }, (): PassResult => {
    const diagnostics = checkObligations(ctx);
    return {
      success: !diagnostics.some((d) => d.severity === "error"),
      diagnostics: diagnostics.map((d) =>
        defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
      ),
    };
  });
};
