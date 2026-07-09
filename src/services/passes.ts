/* @__NO_SIDE_EFFECTS__ */
/**
 * Services-dialect passes (Track E §2 port).
 *
 * `derive.services` validates that every bubbled service requirement
 * has a matching registered service. The checker (`checkServices`) reads
 * `ctx.services`, `ctx.reactive_resources`, `ctx.reactive_mutations`,
 * `ctx.app_routes`, and `ctx.forms`; this module wires it into the
 * canonical pass registry so the legacy bridge entry can retire.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkServices } from "./services.ts";

const SERVICES_PASS_NAME = "derive.services";

/** Register the services derivation pass on `ctx.passRegistry`. */
export const registerServicesPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(SERVICES_PASS_NAME)) return;
  ctx.passRegistry.register({ name: SERVICES_PASS_NAME, phase: "derive" }, (): PassResult => {
    const diagnostics = checkServices(ctx);
    return {
      success: !diagnostics.some((d) => d.severity === "error"),
      diagnostics: diagnostics.map((d) =>
        defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
      ),
    };
  });
};
