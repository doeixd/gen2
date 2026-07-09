/* @__NO_SIDE_EFFECTS__ */
/**
 * Boundary-dialect passes (Track E §2 port).
 *
 * `legalize.boundary` validates boundary plan legality (transports,
 * idempotency, serialization). The checker (`checkBoundaryPlans`)
 * reads `ctx.boundary_plans` and graph-native action/query lists;
 * this module wires it into the canonical pass registry so the legacy
 * bridge entry can retire.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkBoundaryPlans } from "./boundary.ts";

const BOUNDARY_PASS_NAME = "legalize.boundary";

/** Register the boundary-plan legalization pass on `ctx.passRegistry`. */
export const registerBoundaryPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(BOUNDARY_PASS_NAME)) return;
  ctx.passRegistry.register({ name: BOUNDARY_PASS_NAME, phase: "legalize" }, (): PassResult => {
    const diagnostics = checkBoundaryPlans(ctx);
    return {
      success: !diagnostics.some((d) => d.severity === "error"),
      diagnostics: diagnostics.map((d) =>
        defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
      ),
    };
  });
};
