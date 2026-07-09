/* @__NO_SIDE_EFFECTS__ */
/**
 * State-dialect passes (Track E §2 port).
 *
 * `legalize.stateResources` validates state-resource legality. The
 * checker (`checkStateResources`) reads from `ctx`; this module wires
 * it into the canonical pass registry so the legacy bridge entry can
 * retire.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkStateResources } from "./state.ts";

const STATE_RESOURCES_PASS_NAME = "legalize.stateResources";

/** Register the state-resource legalization pass on `ctx.passRegistry`. */
export const registerStatePasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(STATE_RESOURCES_PASS_NAME)) return;
  ctx.passRegistry.register(
    { name: STATE_RESOURCES_PASS_NAME, phase: "legalize" },
    (): PassResult => {
      const diagnostics = checkStateResources(ctx);
      return {
        success: !diagnostics.some((d) => d.severity === "error"),
        diagnostics: diagnostics.map((d) =>
          defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
        ),
      };
    },
  );
};
