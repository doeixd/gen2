/* @__NO_SIDE_EFFECTS__ */
/**
 * Rule dialect passes (Track E port, PLAN.md §3).
 *
 * Two graph-native passes ported here:
 *   - `derive.rule.reads`           — extracts rule read edges from the graph.
 *   - `canonicalize.derivedRuleViews` — verifies derived-rule view shape.
 *
 * Track R will add the eleven derivation passes from PLAN.md §0.2 to
 * this same module (`derive.rule.serverGuard`,
 * `legalize.rule.toRlsPolicy`, `legalize.rule.toSqlPredicate`, …).
 *
 * Same pattern as `src/requirements/passes.ts`.
 */

import type { GenContext } from "../core/index.ts";
import { BUILT_IN_PASSES, type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkRulesOnGraph, checkDerivedRuleViewsOnGraph } from "./checks-kernel.ts";

const RULE_READS_PASS_NAME = BUILT_IN_PASSES.DERIVE.RULE_READS;
const DERIVED_RULE_VIEWS_PASS_NAME = "canonicalize.derivedRuleViews";

/** Register the graph-native rule-reads pass on `ctx.passRegistry`. */
export const registerRulePasses = (ctx: GenContext): void => {
  if (!ctx.passRegistry.has(RULE_READS_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: RULE_READS_PASS_NAME, phase: "derive" },
      (graph): PassResult => {
        const diagnostics = checkRulesOnGraph(graph);
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }

  if (!ctx.passRegistry.has(DERIVED_RULE_VIEWS_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: DERIVED_RULE_VIEWS_PASS_NAME, phase: "canonicalize" },
      (graph): PassResult => {
        const diagnostics = checkDerivedRuleViewsOnGraph(graph);
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }
};
