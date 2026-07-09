/* @__NO_SIDE_EFFECTS__ */
/**
 * Offline-dialect passes (Track E §2 port).
 *
 * `legalize.offline` validates offline command envelopes and queue
 * plans: idempotency keys, conflict policies, serializability, replay
 * requirements, and queue sensitivity / encryption defaults. The checker
 * itself (`checkOfflinePlans`) takes arrays directly; this module wires
 * it into the canonical pass registry so the legacy bridge entry can
 * retire.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkOfflinePlans } from "./offline.ts";

const OFFLINE_PASS_NAME = "legalize.offline";

/** Register the offline-plan legalization pass on `ctx.passRegistry`. */
export const registerOfflinePasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(OFFLINE_PASS_NAME)) return;
  ctx.passRegistry.register({ name: OFFLINE_PASS_NAME, phase: "legalize" }, (): PassResult => {
    const diagnostics = checkOfflinePlans(ctx.offline_commands, ctx.offline_queues);
    return {
      success: !diagnostics.some((d) => d.severity === "error"),
      diagnostics: diagnostics.map((d) =>
        defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
      ),
    };
  });
};
