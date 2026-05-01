/* @__NO_SIDE_EFFECTS__ */
/**
 * Trait-aware plan combinators for open composition.
 *
 * Provides `gen.plan.sequence` and `gen.plan.parallel` that operate on
 * trait-fulfilling nodes rather than concrete kinds, enabling plugin-defined
 * workflows, services, and reports to participate in the reactive graph.
 */

import type { StaticNode, LowerableNode } from "../core/node.ts";
import type { Requirement, Effect } from "../types/index.ts";
import type { Diagnostic } from "../core/index.ts";
import { diagnostic } from "../core/index.ts";

// --- Plan IR ---------------------------------------------------------------

export type PlanCompositionKind =
  | "sequence"
  | "parallel"
  | "fallback"
  | "map"
  | "chain"
  | "retry"
  | "placement";

export interface SequencePlan<Steps extends readonly StaticNode[] = readonly StaticNode[]> {
  readonly kind: "sequence_plan";
  readonly steps: Steps;
  readonly _steps?: Steps;
}

export interface ParallelPlan<Branches extends readonly StaticNode[] = readonly StaticNode[]> {
  readonly kind: "parallel_plan";
  readonly branches: Branches;
  readonly _branches?: Branches;
}

export interface FallbackPlanNode<
  Primary extends StaticNode = StaticNode,
  Alternative extends StaticNode = StaticNode,
> {
  readonly kind: "fallback_plan";
  readonly primary: Primary;
  readonly alternative: Alternative;
  readonly reason: string;
  readonly _primary?: Primary;
  readonly _alternative?: Alternative;
}

export interface MapPlan<
  Source extends StaticNode = StaticNode,
  Mapper extends StaticNode = StaticNode,
> {
  readonly kind: "map_plan";
  readonly source: Source;
  readonly mapper: Mapper;
  readonly _source?: Source;
  readonly _mapper?: Mapper;
}

export interface ChainPlan<
  First extends StaticNode = StaticNode,
  Second extends StaticNode = StaticNode,
> {
  readonly kind: "chain_plan";
  readonly first: First;
  readonly second: Second;
  readonly _first?: First;
  readonly _second?: Second;
}

export interface RetryPlan<Target extends StaticNode = StaticNode> {
  readonly kind: "retry_plan";
  readonly target: Target;
  readonly max_attempts: number;
  readonly backoff: "none" | "fixed" | "exponential";
  readonly _target?: Target;
}

export interface PlacementPlan<Target extends StaticNode = StaticNode> {
  readonly kind: "placement_plan";
  readonly target: Target;
  readonly runtime: string;
  readonly store?: string;
  readonly _target?: Target;
}

export type ComposablePlan =
  | SequencePlan
  | ParallelPlan
  | FallbackPlanNode
  | MapPlan
  | ChainPlan
  | RetryPlan
  | PlacementPlan;

// --- Trait-aware combinators -----------------------------------------------

/** Check whether a node can be composed (has callable or effectful traits). */
export const isComposableNode = (node: StaticNode): boolean =>
  node.traits.includes("callable") ||
  node.traits.includes("effectful") ||
  node.traits.includes("plan");

/** Return the lowered nodes if the node implements LowerableNode. */
export const resolveLoweredNodes = (node: StaticNode & Partial<LowerableNode>): StaticNode[] => {
  if (node.lowersTo !== undefined && node.lowersTo.length > 0) {
    return [...node.lowersTo];
  }
  return [node];
};

/**
 * Compose nodes in strict sequential order.
 *
 * Each step must be callable or effectful (or lowerable to such).
 * Returns a SequencePlan that target generators can interpret.
 */
export const sequencePlan = <const Steps extends readonly StaticNode[]>(
  steps: Steps,
): SequencePlan<Steps> => ({
  kind: "sequence_plan",
  steps,
});

/**
 * Compose nodes in parallel.
 *
 * All branches execute concurrently. Each branch must be callable or effectful
 * (or lowerable to such).
 */
export const parallelPlan = <const Branches extends readonly StaticNode[]>(
  branches: Branches,
): ParallelPlan<Branches> => ({
  kind: "parallel_plan",
  branches,
});

/**
 * Create a fallback plan: try primary, and if it fails or is unsupported,
 * degrade to alternative.
 */
export const fallbackPlanNode = <Primary extends StaticNode, Alternative extends StaticNode>(
  primary: Primary,
  alternative: Alternative,
  reason: string,
): FallbackPlanNode<Primary, Alternative> => ({
  kind: "fallback_plan",
  primary,
  alternative,
  reason,
});

export const mapPlan = <Source extends StaticNode, Mapper extends StaticNode>(
  source: Source,
  mapper: Mapper,
): MapPlan<Source, Mapper> => ({
  kind: "map_plan",
  source,
  mapper,
});

export const chainPlan = <First extends StaticNode, Second extends StaticNode>(
  first: First,
  second: Second,
): ChainPlan<First, Second> => ({
  kind: "chain_plan",
  first,
  second,
});

export const retryPlan = <Target extends StaticNode>(
  target: Target,
  max_attempts: number,
  backoff: "none" | "fixed" | "exponential",
): RetryPlan<Target> => ({
  kind: "retry_plan",
  target,
  max_attempts,
  backoff,
});

export const placementPlan = <Target extends StaticNode>(
  target: Target,
  runtime: string,
  store?: string,
): PlacementPlan<Target> => ({
  kind: "placement_plan",
  target,
  runtime,
  store,
});

// --- Trait extraction helpers ----------------------------------------------

export type InferPlanSteps<P> = P extends SequencePlan<infer Steps> ? Steps : never;
export type InferPlanBranches<P> = P extends ParallelPlan<infer Branches> ? Branches : never;

/** Validate that every member of a plan array is composable. */
export const validatePlanComposition = (
  nodes: readonly StaticNode[],
  label: string,
): readonly string[] => {
  const errors: string[] = [];
  for (const node of nodes) {
    if (!isComposableNode(node)) {
      errors.push(
        `${label} contains non-composable node "${node.name ?? node.kind}" (missing callable/effectful/plan traits)`,
      );
    }
  }
  return errors;
};

// --- Requirement and effect bubbling ---------------------------------------

const collectRequirements = (node: StaticNode): readonly Requirement[] => node.requirements ?? [];
const collectEffects = (node: StaticNode): readonly Effect[] => node.effects ?? [];

const childNodesOfPlan = (plan: ComposablePlan): readonly StaticNode[] => {
  switch (plan.kind) {
    case "sequence_plan":
      return plan.steps;
    case "parallel_plan":
      return plan.branches;
    case "fallback_plan":
      return [plan.primary, plan.alternative];
    case "map_plan":
      return [plan.source, plan.mapper];
    case "chain_plan":
      return [plan.first, plan.second];
    case "retry_plan":
      return [plan.target];
    case "placement_plan":
      return [plan.target];
  }
};

export const derivePlanRequirements = (plan: ComposablePlan): readonly Requirement[] => {
  const out: Requirement[] = [];
  const seen = new Set<string>();
  for (const child of childNodesOfPlan(plan)) {
    for (const req of collectRequirements(child)) {
      const key = `${req.kind}:${req.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(req);
    }
  }
  return out;
};

export const derivePlanEffects = (plan: ComposablePlan): readonly Effect[] => {
  const out: Effect[] = [];
  const seen = new Set<string>();
  for (const child of childNodesOfPlan(plan)) {
    for (const eff of collectEffects(child)) {
      const key = `${eff.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(eff);
    }
  }
  return out;
};

export const checkPlanFallbackCompatibility = (plan: ComposablePlan): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  if (plan.kind !== "fallback_plan") return diagnostics;

  const primaryOut = plan.primary.output ?? plan.primary.input;
  const alternativeOut = plan.alternative.output ?? plan.alternative.input;
  if (primaryOut && alternativeOut && primaryOut !== alternativeOut) {
    diagnostics.push(
      diagnostic({
        severity: "warning",
        code: "plan:fallback-output-mismatch",
        message: `Fallback plan primary and alternative have different output types`,
        suggestion: "Ensure fallback alternatives produce compatible outputs.",
      }),
    );
  }

  const primaryEffects = collectEffects(plan.primary);
  const alternativeEffects = collectEffects(plan.alternative);
  const primaryHasDbWrite = primaryEffects.some((e) => e.kind === "db_write");
  const alternativeHasDbWrite = alternativeEffects.some((e) => e.kind === "db_write");
  if (primaryHasDbWrite && alternativeHasDbWrite) {
    diagnostics.push(
      diagnostic({
        severity: "warning",
        code: "plan:fallback-unsafe-effects",
        message: `Fallback plan primary and alternative both have database write effects`,
        suggestion: "Consider whether both paths should mutate state, or make one read-only.",
      }),
    );
  }

  return diagnostics;
};
