/**
 * Lifecycle entry point — public surface.
 *
 * Track E (PLAN.md §3) split this file into four focused modules:
 *
 *   - `runner.ts`              — orchestration: check(), generate(), phases.
 *   - `legacy-check-bridge.ts` — the ~60 `BuiltInCheckPassSpec`s that
 *                                wrap legacy GenContext array checkers.
 *   - `target-bridge.ts`       — bridge lower/emit passes for legacy targets.
 *   - `cross-store-legacy.ts`  — cross-store planner / fallback rules.
 *
 * Each module retires individually as Track E ports the checks/passes
 * to dialect-owned passes. This file remains as the public surface so
 * existing imports (`from "../lifecycle/lifecycle.ts"`) keep working.
 *
 * See PLAN.md §3 Track E and CURRENT.md.
 */

// --- Runner (orchestration) ----------------------------------------------

export type { LifecyclePhase, LifecycleRule, PhaseStatus, RunResult } from "./runner.ts";
export { check, generate, standardPhases } from "./runner.ts";

// --- Legacy check bridge --------------------------------------------------

export type { BuiltInCheckPassSpec, ModuleChecker } from "./legacy-check-bridge.ts";
export {
  builtInCheckPasses,
  builtInCheckPipeline,
  checkContextAndStorage,
  clearModuleCheckers,
  ctxCheckerToPass,
  registerBuiltInModuleCheckers,
  registerBuiltInPasses,
  registerModuleChecker,
  unsupportedAsyncHookDiagnostic,
} from "./legacy-check-bridge.ts";
export { checkTargetCapabilities } from "../core/target-capabilities.ts";

// --- Target bridge --------------------------------------------------------

export {
  isTargetInputLegalized,
  markTargetInputLegalized,
  registerBridgeEmitPass,
  registerBridgeLowerPass,
  registerTargetPipeline,
  targetPipelineForTarget,
  targetPipelineName,
} from "./target-bridge.ts";

// --- Cross-store legacy ---------------------------------------------------

export type {
  CompositionStrategy,
  CompositionStrategyKind,
  CrossStorePlanner,
  StoreAssignment,
} from "./cross-store-legacy.ts";
export {
  checkCrossStorePlanners,
  checkCrossStoreReadComposition,
  checkCrossStoreWriteCoordinator,
  checkPlanFallback,
} from "./cross-store-legacy.ts";
export {
  crossStorePlannerToGraphFragment,
  crossStorePlannerToKernelNode,
  getCrossStorePlannersFromGraph,
} from "./cross-store-kernel.ts";
export { registerCrossStorePasses } from "./cross-store-passes.ts";
