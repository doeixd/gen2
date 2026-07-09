/* @__NO_SIDE_EFFECTS__ */
/**
 * Orchestration-dialect passes (Track E §2 port).
 *
 * `legalize.cron` validates cron job legality: opaque schedule
 * expressions warn, DB-writing jobs without idempotency error, unsafe
 * concurrency warns, server-only work without execution identity
 * errors. The checker (`checkCronJobs`) reads `ctx.cron_jobs` only;
 * this module wires it into the canonical pass registry so the legacy
 * bridge entry can retire.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkCronJobs } from "./orchestration.ts";

const CRON_PASS_NAME = "legalize.cron";

/** Register the cron-job legalization pass on `ctx.passRegistry`. */
export const registerOrchestrationPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(CRON_PASS_NAME)) return;
  ctx.passRegistry.register({ name: CRON_PASS_NAME, phase: "legalize" }, (): PassResult => {
    const diagnostics = checkCronJobs(ctx);
    return {
      success: !diagnostics.some((d) => d.severity === "error"),
      diagnostics: diagnostics.map((d) =>
        defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
      ),
    };
  });
};
