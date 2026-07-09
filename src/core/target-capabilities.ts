/* @__NO_SIDE_EFFECTS__ */
/**
 * Target-capability legalization check.
 *
 * Validates that registered targets can satisfy resource/mutation
 * enhancement plans and Phase 4 feature usage (derived resources,
 * scoped resources, schedules, workflows, boundary plans, offline
 * commands). Emits warnings when a preferred capability tier is
 * unsupported by any target or when a fallback will be selected.
 *
 * Relocated from `src/lifecycle/legacy-check-bridge.ts` as part of the
 * Track E §2 port for `legalize.targetCompatibility`. Reads top-level
 * ctx arrays directly; broader graph-IR for targets/resources is
 * follow-up work.
 */

import type { GenContext } from "./context.ts";
import { type Diagnostic, diagnostic } from "./diagnostics.ts";

/**
 * Validates that target capabilities can satisfy resource/mutation enhancement plans.
 *
 * Emits diagnostics when a preferred capability tier is unsupported by any target
 * or when a fallback is selected.
 */
export const checkTargetCapabilities = (ctx: GenContext): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  const targetTiers = new Set<string>();
  for (const target of ctx.targets) {
    for (const tier of target.capabilities?.tiers ?? []) {
      targetTiers.add(tier);
    }
  }

  for (const resource of ctx.reactive_resources) {
    if (!resource.enhancement) continue;
    const preferred = resource.enhancement.preferred;
    if (!targetTiers.has(preferred)) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "target:capability-missing",
          message: `Resource "${resource.name}" prefers capability tier "${preferred}" but no target supports it`,
          suggestion: "Add a target that supports this tier or adjust the enhancement plan.",
        }),
      );
    }
    for (const fallback of resource.enhancement.fallbacks) {
      if (targetTiers.has(fallback)) {
        out.push(
          diagnostic({
            severity: "info",
            code: "target:fallback-selected",
            message: `Resource "${resource.name}" will fall back to tier "${fallback}"`,
          }),
        );
        break;
      }
    }
  }

  for (const mutation of ctx.reactive_mutations) {
    if (!mutation.action.optimistic) continue;
    if (!targetTiers.has("optimistic_offline") && !targetTiers.has("reactive")) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "target:capability-missing",
          message: `Mutation "${mutation.name}" uses optimistic updates but no target supports "optimistic_offline" or "reactive"`,
          suggestion: "Add a reactive target or remove optimistic updates.",
        }),
      );
    }
  }

  const phase4Features: { collection: readonly unknown[]; name: string; tier: string }[] = [
    { collection: ctx.derived_resources, name: "derived resources", tier: "derived_reactivity" },
    { collection: ctx.scoped_resources, name: "scoped resources", tier: "scoped_lifecycle" },
    { collection: ctx.schedules, name: "schedules", tier: "cron_scheduling" },
    { collection: ctx.workflows, name: "workflows", tier: "workflow_engine" },
    { collection: ctx.boundary_plans, name: "boundary plans", tier: "cross_boundary" },
    { collection: ctx.offline_commands, name: "offline commands", tier: "optimistic_offline" },
  ];

  for (const feature of phase4Features) {
    if (feature.collection.length > 0 && !targetTiers.has(feature.tier)) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "target:phase4-capability-missing",
          message: `Application uses ${feature.name} but no target supports "${feature.tier}"`,
          suggestion: `Add a target that supports ${feature.tier} or remove ${feature.name}.`,
        }),
      );
    }
  }

  return out;
};
