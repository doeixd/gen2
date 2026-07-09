/* @__NO_SIDE_EFFECTS__ */
/**
 * Workflow-dialect passes (Track E §2 port).
 *
 * `legalize.workflows` validates workflow legality (step targets,
 * transition coverage, error handling). The checker (`checkWorkflows`)
 * reads `ctx.workflows` only; this module wires it into the canonical
 * pass registry so the legacy bridge entry can retire.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkWorkflows } from "./workflow.ts";

const WORKFLOW_PASS_NAME = "legalize.workflows";

/** Register the workflow legalization pass on `ctx.passRegistry`. */
export const registerWorkflowPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(WORKFLOW_PASS_NAME)) return;
  ctx.passRegistry.register({ name: WORKFLOW_PASS_NAME, phase: "legalize" }, (): PassResult => {
    const diagnostics = checkWorkflows(ctx);
    return {
      success: !diagnostics.some((d) => d.severity === "error"),
      diagnostics: diagnostics.map((d) =>
        defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
      ),
    };
  });
};
