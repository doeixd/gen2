/* @__NO_SIDE_EFFECTS__ */
/**
 * Requirement dialect passes (Track E port, PLAN.md §3).
 *
 * The first lifecycle check ported away from `ctxCheckerToPass` and
 * the legacy `passCtx.options.genContext` bridge. `checkRequirementsOnGraph`
 * was already graph-native — Track E exposes that fact by registering
 * a graph-native pass runner that reads `graph` directly, bypassing
 * the GenContext bridge entirely.
 *
 * Pattern for future ports:
 *   1. Define a `*OnGraph(graph)` checker in the dialect's module.
 *   2. Register the kernel pass here with a runner that takes
 *      `(graph, _passCtx)` — never reads `_passCtx.options.genContext`.
 *   3. Delete the matching spec from
 *      `src/lifecycle/legacy-check-bridge.ts`.
 *   4. Wire the registration call into `runner.ts`.
 */

import type { GenContext } from "../core/index.ts";
import { BUILT_IN_PASSES, type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkRequirementsOnGraph } from "./kernel.ts";

const REQUIREMENTS_PASS_NAME = "legalize.requirements";

/**
 * Register the graph-native requirements pass on `ctx.passRegistry`.
 *
 * Idempotent — re-registering is a no-op. Called from the lifecycle
 * runner; eventually the requirement dialect will own this directly
 * once dialect-pass plumbing lands.
 */
export const registerRequirementsPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(REQUIREMENTS_PASS_NAME)) return;

  ctx.passRegistry.register(
    { name: REQUIREMENTS_PASS_NAME, phase: "legalize" },
    (graph, _passCtx): PassResult => {
      const diagnostics = checkRequirementsOnGraph(graph);
      return {
        success: !diagnostics.some((d) => d.severity === "error"),
        diagnostics: diagnostics.map((d) =>
          defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
        ),
      };
    },
  );
};

/** Re-export the pass name so the runner / pipeline registry can reference it. */
export const REQUIREMENTS_PASS = REQUIREMENTS_PASS_NAME;

/** Built-in pass-name constant referenced by other lifecycle code. */
export { BUILT_IN_PASSES };
