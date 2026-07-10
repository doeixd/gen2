/**
 * Lifecycle runner (Track E, PLAN.md §3).
 *
 * The orchestration layer of the lifecycle: phases, `check(ctx)`,
 * `generate(ctx)`. This file is the *only* part of the lifecycle that
 * is intended to survive Track E intact — the legacy check-bridge
 * (`legacy-check-bridge.ts`), target-bridge (`target-bridge.ts`), and
 * cross-store-legacy (`cross-store-legacy.ts`) modules retire as
 * dialect-owned passes replace them.
 *
 * The pipeline:
 *   collect_refs → resolve_plugins → check_targets → run_checks → generate
 */

import {
  type Artifact,
  collectAllArtifacts,
  collectAllDiagnostics,
  type Diagnostic,
  diagnostic,
  type GenContext,
  hasErrors,
  validatePluginInvariants,
} from "../core/index.ts";
import { runPassPipeline, runNamedPipeline, type PassContext } from "../kernel/index.ts";

import {
  builtInCheckPipeline,
  registerBuiltInPasses,
  unsupportedAsyncHookDiagnostic,
} from "./legacy-check-bridge.ts";
import {
  markTargetInputLegalized,
  registerBridgeEmitPass,
  registerBridgeLowerPass,
  registerTargetPipeline,
} from "./target-bridge.ts";
import { registerRequirementsPasses } from "../requirements/passes.ts";
import { registerContextPasses } from "../context/passes.ts";
import { registerRulePasses } from "../rules/passes.ts";
import { registerReactivityPasses } from "../reactivity/passes.ts";
import { registerRlsPolicyPass } from "../rules/rls-pass.ts";
import { registerPostgresTableLoweringPass } from "../rules/postgres-table-pass.ts";
import { registerPostgresSchemaAssemblyPass } from "../rules/postgres-schema-pass.ts";
import { registerAccessMatrixPass } from "../rules/access-matrix-pass.ts";
import { registerTestMatrixPass } from "../rules/test-matrix-pass.ts";
import { registerAuditExplanationPass } from "../rules/audit-explanation-pass.ts";
import { registerRelationPasses } from "../relation/passes.ts";
import { registerEventsPasses } from "../events/passes.ts";
import { registerReactionPasses } from "../reaction/passes.ts";
import { registerCorePasses } from "../core/passes.ts";
import { registerApiPasses } from "../api/passes.ts";
import { registerAuthzPasses } from "../authz/passes.ts";
import { registerRouterPasses } from "../router/passes.ts";
import { registerQueryPasses } from "../query/passes.ts";
import { registerFunctionPasses } from "../function/passes.ts";
import { registerOfflinePasses } from "../offline/passes.ts";
import { registerMergePasses } from "../merge/passes.ts";
import { registerOrchestrationPasses } from "../orchestration/passes.ts";
import { registerWorkflowPasses } from "../workflow/passes.ts";
import { registerBoundaryPasses } from "../boundary/passes.ts";
import { registerStoragePasses } from "../storage/passes.ts";
import { registerServicesPasses } from "../services/passes.ts";
import { registerUiPasses } from "../ui/passes.ts";
import { registerEditorPasses } from "../editor/passes.ts";
import { registerCrudPasses } from "../crud/passes.ts";
import { registerListPasses } from "../list/passes.ts";
import { registerStatePasses } from "../state/passes.ts";
import { registerObligationsPasses } from "../obligations/passes.ts";
import { registerCrossStorePasses } from "./cross-store-passes.ts";

/**
 * Dialect-owned pass registrations (Track E port).
 *
 * Each entry is a function that registers passes that have been ported
 * out of `legacy-check-bridge.ts`. As Track E progresses, this list
 * grows and the legacy bridge's `builtInCheckPasses()` shrinks.
 */
const dialectPassRegistrations: ReadonlyArray<(ctx: GenContext) => void> = [
  registerRequirementsPasses,
  registerContextPasses,
  registerRulePasses,
  registerReactivityPasses,
  registerRlsPolicyPass,
  registerPostgresTableLoweringPass,
  registerPostgresSchemaAssemblyPass,
  registerAccessMatrixPass,
  registerTestMatrixPass,
  registerAuditExplanationPass,
  registerRelationPasses,
  registerEventsPasses,
  registerReactionPasses,
  registerCorePasses,
  registerApiPasses,
  registerAuthzPasses,
  registerRouterPasses,
  registerQueryPasses,
  registerFunctionPasses,
  registerOfflinePasses,
  registerMergePasses,
  registerOrchestrationPasses,
  registerWorkflowPasses,
  registerBoundaryPasses,
  registerStoragePasses,
  registerServicesPasses,
  registerUiPasses,
  registerEditorPasses,
  registerCrudPasses,
  registerListPasses,
  registerStatePasses,
  registerObligationsPasses,
  registerCrossStorePasses,
];

const registerDialectPasses = (ctx: GenContext): void => {
  for (const register of dialectPassRegistrations) register(ctx);
};

// --- Phases ---------------------------------------------------------------

/** Represents the execution status of a lifecycle phase. */
export type PhaseStatus = "pending" | "running" | "completed" | "failed";

/** A named phase in the generation lifecycle with an execution order. */
export interface LifecyclePhase {
  readonly name: string;
  readonly order: number;
  status: PhaseStatus;
}

/** A rule binding a lifecycle phase to an action and target kind. */
export interface LifecycleRule {
  readonly phase: LifecyclePhase;
  readonly action: string;
  readonly target_kind: string;
}

/** Returns the default lifecycle phases in order. */
export const standardPhases = (): LifecyclePhase[] => [
  { name: "collect_refs", order: 0, status: "pending" },
  { name: "resolve_plugins", order: 1, status: "pending" },
  { name: "check_targets", order: 2, status: "pending" },
  { name: "run_checks", order: 3, status: "pending" },
  { name: "generate", order: 4, status: "pending" },
];

/**
 * Compute the ordered pass-pipeline for the check phase: built-in passes
 * first, then plugin/legacy passes that aren't lower/emit.
 */
const checkPipeline = (ctx: GenContext): readonly string[] => {
  const builtIns = builtInCheckPipeline();
  const builtInSet = new Set(builtIns);
  const pluginAndLegacyPasses = ctx.passRegistry
    .list()
    .filter((pass) => !builtInSet.has(pass.name))
    .filter((pass) => pass.phase !== "lower" && pass.phase !== "emit")
    .map((pass) => pass.name);
  return [...builtIns, ...pluginAndLegacyPasses];
};

// --- Run results -----------------------------------------------------------

/** Aggregated result of a lifecycle run. */
export interface RunResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: readonly Artifact[];
  readonly status: "ok" | "has_errors" | "has_warnings";
}

// --- check(ctx) ------------------------------------------------------------

/**
 * Run the standard check pass: validates plugins, runs each registered
 * built-in / plugin / legacy check pass, aggregates diagnostics. Does
 * NOT call codegen.
 */
export const check = (ctx: GenContext): RunResult => {
  ctx.status = "checking";
  registerBuiltInPasses(ctx);
  registerDialectPasses(ctx);
  const phases = standardPhases();

  // collect_refs / resolve_plugins phases are bookkeeping; the kernel
  // already populated ctx.graph and ctx.plugins. Re-validate plugin
  // invariants here in case a caller mutated ctx after createGen().
  phases[0]!.status = "completed";
  phases[1]!.status = "running";
  for (const d of validatePluginInvariants(ctx)) {
    ctx.diagnostics.push(d);
  }
  phases[1]!.status = "completed";

  // R10 pass pipeline (verify → derive → canonicalize → legalize)
  const passCtx: PassContext = { options: { genContext: ctx, continueOnError: true } };
  const pipelineResult = runPassPipeline(checkPipeline(ctx), ctx.graph, ctx.passRegistry, passCtx);

  // Persist any graph modifications from derive/canonicalize/legalize
  // passes back onto the GenContext so later phases (target-bridge,
  // generate, post-check inspection) see the derived edges.
  // Track R §R6 added the first pass that emits derived edges
  // (`derive.rule.invalidationDependencies`); without this assignment
  // the modified graph would be silently discarded.
  if (pipelineResult.modifiedGraph) {
    (ctx as { graph: typeof ctx.graph }).graph = pipelineResult.modifiedGraph;
  }

  // Persist any artifacts emitted by passes back onto the GenContext.
  // Track R §R2 added the first pass that emits real artifacts
  // (`legalize.rule.toRlsPolicy`); without this loop the artifact
  // list would be silently discarded.
  //
  // The kernel and core `Artifact` shapes differ; convert here.
  // PLAN.md §G4 / Track D-prefix calls out unifying these — until
  // that lands, the runner is the translation seam.
  if (pipelineResult.artifacts) {
    for (const kernelArtifact of pipelineResult.artifacts) {
      const path = kernelArtifact.path ?? `artifacts/${kernelArtifact.id}`;
      const content =
        typeof kernelArtifact.content === "string"
          ? kernelArtifact.content
          : kernelArtifact.content == null
            ? ""
            : JSON.stringify(kernelArtifact.content);
      ctx.artifacts.push({
        path,
        content,
        kind: "source",
        language: kernelArtifact.target,
        diagnostics: [],
      });
    }
  }

  // Convert kernel diagnostics to core. Phase 2 of the Diagnostic
  // shape unification (PLAN.md Track D-prefix): preserve every field
  // the core shape now carries (subject, subjectKind, source, related)
  // rather than dropping them at the seam.
  for (const pd of pipelineResult.diagnostics ?? []) {
    ctx.diagnostics.push(
      diagnostic({
        severity: pd.severity,
        code: pd.code,
        message: pd.message,
        subject: pd.subject as string | undefined,
        subjectKind: pd.subjectKind,
        related: pd.related?.map((r) => ({
          id: r.id as string,
          kind: r.kind,
          context: r.context,
        })),
        source: pd.source,
      }),
    );
  }

  // check_targets / run_checks
  phases[2]!.status = "running";
  for (const t of ctx.targets) {
    const targetDiagnostics: Diagnostic[] = [];
    const plugin = ctx.plugins.find((p) => p.id === t.plugin_id);
    if (!plugin) {
      const d = diagnostic({
        severity: "error",
        code: "core:target-plugin-missing",
        message: `Target ${t.name} references missing plugin ${t.plugin_id}`,
      });
      ctx.diagnostics.push(d);
      targetDiagnostics.push(d);
      t.check_result = { status: "has_errors", diagnostics: targetDiagnostics };
      continue;
    }

    const contributions = ctx.contributions.get(plugin.id);
    const targetContrib = contributions?.targets.find((tc) => tc.name === t.name);

    for (const input of t.inputs) {
      const beforeInputDiagnostics = targetDiagnostics.length;
      if (!t.accepts_inputs.includes(input.kind)) {
        const d = diagnostic({
          severity: "error",
          code: "lifecycle:target-incompatible-input",
          message: `Target ${t.name} does not accept input kind ${input.kind}`,
        });
        ctx.diagnostics.push(d);
        targetDiagnostics.push(d);
      }

      for (const hook of contributions?.checks ?? []) {
        if (hook.target_kind !== input.kind) continue;
        const result = hook.check_fn(input);
        if (result instanceof Promise) {
          const d = unsupportedAsyncHookDiagnostic("check", hook.name);
          ctx.diagnostics.push(d);
          targetDiagnostics.push(d);
          continue;
        }
        for (const d of result) {
          ctx.diagnostics.push(d);
          targetDiagnostics.push(d);
        }
      }

      if (targetContrib?.check) {
        for (const d of targetContrib.check(input)) {
          ctx.diagnostics.push(d);
          targetDiagnostics.push(d);
        }
      }

      const inputDiagnostics = targetDiagnostics.slice(beforeInputDiagnostics);
      if (!hasErrors(inputDiagnostics)) {
        markTargetInputLegalized(ctx, t, input);
      }
    }

    t.check_result = {
      status: hasErrors(targetDiagnostics)
        ? "has_errors"
        : targetDiagnostics.length > 0
          ? "has_warnings"
          : "ok",
      diagnostics: targetDiagnostics,
    };
  }
  phases[2]!.status = "completed";

  phases[3]!.status = "running";
  phases[3]!.status = "completed";

  ctx.status = hasErrors(ctx.diagnostics) ? "failed" : "ready";
  const all = collectAllDiagnostics(ctx);
  // Surface artifacts emitted during check (e.g. Track R §R2's RLS pass)
  // in the RunResult, mirroring `generate()`. They have already been
  // accumulated onto `ctx.artifacts` by the pipeline-result loop above.
  const allArtifacts = collectAllArtifacts(ctx);
  return {
    diagnostics: all,
    artifacts: allArtifacts,
    status: hasErrors(all) ? "has_errors" : all.length > 0 ? "has_warnings" : "ok",
  };
};

// --- generate(ctx) --------------------------------------------------------

/** Run check + generate. If check fails with errors, generation is skipped. */
export const generate = (ctx: GenContext): RunResult => {
  const checked = check(ctx);
  if (checked.status === "has_errors") return checked;

  ctx.status = "generating";
  const phases = standardPhases();
  phases[4]!.status = "running";

  for (const t of ctx.targets) {
    if (t.check_result == null) {
      t.check_result = { status: "ok", diagnostics: [] };
    }
    if (t.check_result.status !== "ok") continue;

    if (!t.pipeline) {
      registerBridgeLowerPass(ctx, t.name);
      registerBridgeEmitPass(ctx, t.name);
    }
    runNamedPipeline(registerTargetPipeline(ctx, t), ctx.graph, ctx.passRegistry, {
      pipelineRegistry: ctx.pipelineRegistry,
      options: { genContext: ctx, target: t },
    });
  }

  phases[4]!.status = "completed";

  const allDiagnostics = collectAllDiagnostics(ctx);
  const allArtifacts = collectAllArtifacts(ctx);
  ctx.status = hasErrors(allDiagnostics) ? "failed" : "ready";

  return {
    diagnostics: allDiagnostics,
    artifacts: allArtifacts,
    status: hasErrors(allDiagnostics)
      ? "has_errors"
      : allDiagnostics.length > 0
        ? "has_warnings"
        : "ok",
  };
};
