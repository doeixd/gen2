/* @__NO_SIDE_EFFECTS__ */
/**
 * Merge-dialect passes (Track E §2 port).
 *
 * `canonicalize.planMerge` validates composable plan merge semantics:
 * retry plans flag idempotency requirements, parallel plans with DB
 * writes warn about non-commutative merges. The checker
 * (`checkPlanMergeSemantics`) reads `ctx.composable_plans` only; this
 * module wires it into the canonical pass registry so the legacy bridge
 * entry can retire.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkPlanMergeSemantics } from "./merge.ts";

const PLAN_MERGE_PASS_NAME = "canonicalize.planMerge";

/** Register the plan-merge canonicalization pass on `ctx.passRegistry`. */
export const registerMergePasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(PLAN_MERGE_PASS_NAME)) return;
  ctx.passRegistry.register(
    { name: PLAN_MERGE_PASS_NAME, phase: "canonicalize" },
    (): PassResult => {
      const diagnostics = checkPlanMergeSemantics(ctx);
      return {
        success: !diagnostics.some((d) => d.severity === "error"),
        diagnostics: diagnostics.map((d) =>
          defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
        ),
      };
    },
  );
};
