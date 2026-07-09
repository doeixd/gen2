/**
 * Legacy check bridge — entry-point shim (Track E, PLAN.md §3).
 *
 * The `BuiltInCheckPassSpec[]` array originally hosted ~60 legacy
 * `GenContext`-array checkers wrapped via `ctxCheckerToPass`. As of
 * 2026-05-18 every spec has been ported to a domain-owned
 * `src/<domain>/passes.ts` registrar; the array is now empty. This
 * module survives as the canonical "register all built-in passes"
 * entry point (`registerBuiltInPasses`) that bundles the dialect
 * registrars in deterministic order. The
 * `ctxCheckerToPass` / `BuiltInCheckPassSpec` shapes remain available
 * for adapters that still need to convert a ctx-array checker to a
 * pass (notably `src/lifecycle/target-bridge.ts` reuses the
 * `passCtx.options.genContext` plumbing for emit/lower stages).
 *
 * This file is on the architecture-test allow-list at
 * `tests/architecture/pass-ctx-genctx.test.ts`.
 */

import {
  // checkContractsAndActors registered as a dialect pass via `src/core/passes.ts`.
  // checkMagicStrings registered as a graph-native pass via `src/core/passes.ts` (Track E §2 port).
  type Diagnostic,
  diagnostic,
  type GenContext,
} from "../core/index.ts";
// checkRefsExist is registered as a graph-native pass via `src/entity/passes.ts`.
// checkEvents is registered as a dialect pass via `src/events/passes.ts` (Track E §2 port).
// Function checks are registered as graph-native passes via `src/function/passes.ts`.
// checkApi is registered as a graph-native pass via `src/api/passes.ts`.
// checkQueries and checkQueryRuntimes are registered as graph-native passes via `src/query/passes.ts`.
// checkRelationsOnGraph + checkRelationEntities are registered as
// dialect passes via `src/relation/passes.ts` (Track E §2 port).
// Storage / UI / editors / CRUD / list / scopedResources / services /
// obligations / stateResources / target-capability checks are registered
// as passes via their domain-owned `passes.ts` modules (Track E §2 ports).
import { registerCorePasses } from "../core/passes.ts";
import { registerEntityPasses } from "../entity/passes.ts";
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
import { isSensitivePlacementUnsafe } from "../storage/locations.ts";
import { BUILT_IN_PASSES, type PassContext, type PassResult } from "../kernel/index.ts";
import { defineDiagnostic as kernelDiagnostic } from "../kernel/diagnostic.ts";

/**
 * Signature for a module-level diagnostic checker registered with the lifecycle.
 */
export type ModuleChecker = (ctx: GenContext) => readonly Diagnostic[];

/** Diagnostic for an unsupported async hook discovered at run time. */
export const unsupportedAsyncHookDiagnostic = (
  kind: "check" | "codegen",
  name: string,
): Diagnostic =>
  diagnostic({
    severity: "error",
    code: `lifecycle:async-${kind}-hook-unsupported`,
    message: `Async ${kind} hook ${name} is not supported by the synchronous lifecycle runner`,
  });

/** Helper to adapt a GenContext checker into a pass runner. */
export const ctxCheckerToPass = (
  fn: (ctx: GenContext) => readonly Diagnostic[],
): ((graph: unknown, passCtx: PassContext) => PassResult) => {
  return (_graph, passCtx) => {
    const genCtx = passCtx.options?.genContext as GenContext | undefined;
    if (!genCtx) {
      return {
        success: false,
        diagnostics: [kernelDiagnostic("pass:missing-context", "error", "Pass missing genContext")],
      };
    }
    const diagnostics = fn(genCtx);
    return {
      success: !diagnostics.some((d) => d.severity === "error"),
      diagnostics: diagnostics.map((d) =>
        kernelDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
      ),
    };
  };
};

/**
 * Registers a module-level checker to be invoked during the check phase.
 */
export const registerModuleChecker = (ctx: GenContext, fn: ModuleChecker): void => {
  const name = `legacy.moduleChecker.${ctx.passRegistry.list().length}`;
  ctx.passRegistry.register({ name, phase: "verify-symbols" }, ctxCheckerToPass(fn));
};

/** Clears all registered module-level checkers. */
export const clearModuleCheckers = (ctx: GenContext): void => {
  ctx.passRegistry.clear();
};

export type BuiltInCheckPassSpec = {
  readonly name: string;
  readonly phase: "verify-symbols" | "verify-dialects" | "derive" | "canonicalize" | "legalize";
  readonly check: ModuleChecker;
};

/**
 * Validates context provisions and storage locations for unsafe placements.
 *
 * - Sensitive contexts stored in client-readable locations
 * - Required contexts with no matching provision
 * - Duplicate context definitions
 */
export const checkContextAndStorage = (ctx: GenContext): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const seenContexts = new Set<string>();

  for (const context of ctx.contexts) {
    if (seenContexts.has(context.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "lifecycle:duplicate-context",
          message: `Context "${context.name}" is defined more than once`,
        }),
      );
    }
    seenContexts.add(context.name);
  }

  for (const provision of ctx.context_provisions) {
    if (isSensitivePlacementUnsafe(provision.from)) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "context:unsafe-storage-location",
          message: `Context "${provision.context.name}" is stored in "${provision.from.name}" which is not marked sensitive-safe`,
          suggestion: "Use a server-side storage location for sensitive contexts.",
        }),
      );
    }
  }

  const provisionedNames = new Set(ctx.context_provisions.map((p) => p.context.name));
  for (const requirement of ctx.context_requirements) {
    if (!requirement.optional && !provisionedNames.has(requirement.context.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "context:missing-provider",
          message: `Required context "${requirement.context.name}" has no matching provision`,
          suggestion: "Add a context provision or mark the requirement as optional.",
        }),
      );
    }
  }

  return out;
};

// checkTargetCapabilities has moved to src/core/target-capabilities.ts and
// is registered by src/core/passes.ts (Track E §2 port).

/**
 * The list of built-in check passes, each wrapping a legacy
 * `GenContext`-array checker. Track E ports each spec to a
 * dialect-owned pass; specs are deleted (not edited) on port.
 */
export const builtInCheckPasses = (): readonly BuiltInCheckPassSpec[] => [
  // `verify-symbols.entity` is registered by `src/entity/passes.ts`.
  // Duplicate entity names are recorded at bind time before graph node
  // dedupe can hide them; the pass checks remaining entity invariants from graph IR.
  // `verify-symbols.ref` is registered by `src/entity/passes.ts` (Track E §2 port).
  // `verify-symbols.function` is now registered by `src/core/passes.ts` (Track E §2 port).
  // `verify-dialects.nodeKinds` is registered by `src/core/passes.ts` (Track E §2 port).
  // `verify-dialects.config` is registered by `src/core/passes.ts` (Track E §2 port).
  // `verify-dialects.edgeKinds` is registered by `src/core/passes.ts` (Track E §2 port).
  // `verify-dialects.storageInvariants` / `.traits` / `.reversibleMappings`
  // are registered by `src/storage/passes.ts` (Track E §2 port).
  // `derive.relation.entityFieldRelationships` and `derive.relation.entities`
  // are now registered by `src/relation/passes.ts` (Track E §2 port).
  // `derive.query.shape` and `derive.query.runtimes` are registered by `src/query/passes.ts`.
  // Function derive passes are registered by `src/function/passes.ts` (Track E §2 port).
  // `derive.api` is registered by `src/api/passes.ts` (Track E §2 port).
  // `derive.auth.guards` is registered by `src/authz/passes.ts` (Track E §2 port).
  // `derive.authz.mutationAccess` is registered by `src/authz/passes.ts` (Track E §2 port).
  // `derive.events` is now registered by `src/events/passes.ts` (Track E §2 port).
  // `derive.reactivity.invalidates` and `derive.reactivity.optimisticPlans`
  // are registered by `src/reactivity/passes.ts` (Track E §2 port).
  // `derive.rule.reactivity` is registered by `src/reactivity/passes.ts` (Track E §2 port).
  // `derive.appRoutes` is registered by `src/router/passes.ts` (Track E §2 port).
  // `derive.services` is registered by `src/services/passes.ts` (Track E §2 port).
  // `derive.rule.reads` ported in Track E — see `src/rules/passes.ts`.
  // `derive.reactions` is now registered by `src/reaction/passes.ts` (Track E §2 port).
  // `verify-symbols.nodes` is registered by `src/core/passes.ts` (Track E §2 port).
  // `verify-symbols.magicStrings` is registered by `src/core/passes.ts` (Track E §2 port).
  // `legalize.ui` is registered by `src/ui/passes.ts` (Track E §2 port).
  // `legalize.editors` is registered by `src/editor/passes.ts` (Track E §2 port).
  // `legalize.crud` is registered by `src/crud/passes.ts` (Track E §2 port).
  // `legalize.list` is registered by `src/list/passes.ts` (Track E §2 port).
  // `legalize.crossStore.planners` is registered by `src/lifecycle/cross-store-passes.ts`.
  // `legalize.crossStore.reads` is registered by `src/lifecycle/cross-store-passes.ts`.
  // `legalize.crossStore.writes` is registered by `src/lifecycle/cross-store-passes.ts`.
  // `legalize.planFallback` is registered by `src/function/passes.ts`.
  // `legalize.contextStorage` ported in Track E to a graph-native pass —
  // see `src/context/passes.ts`.
  // `legalize.requirements` ported in Track E to a graph-native pass —
  // see `src/requirements/passes.ts`. Registration is wired through
  // `runner.ts` `registerDialectPasses`.
  // `legalize.stateResources` is registered by `src/state/passes.ts` (Track E §2 port).
  // `legalize.scopedResources` is registered by `src/reactivity/passes.ts` (Track E §2 port).
  // `legalize.targetCompatibility` is registered by `src/core/passes.ts` (Track E §2 port).
  // `legalize.cron` is registered by `src/orchestration/passes.ts` (Track E §2 port).
  // `legalize.workflows` is registered by `src/workflow/passes.ts` (Track E §2 port).
  // `legalize.boundary` is registered by `src/boundary/passes.ts` (Track E §2 port).
  // `legalize.obligations` is registered by `src/obligations/passes.ts` (Track E §2 port).
  // `canonicalize.derivedRuleViews` ported in Track E — see `src/rules/passes.ts`.
  // `canonicalize.actionMerge` is registered by `src/function/passes.ts`.
  // `canonicalize.planMerge` is registered by `src/merge/passes.ts` (Track E §2 port).
  // `legalize.offline` is registered by `src/offline/passes.ts` (Track E §2 port).
  // Canonicalize expression/predicate and legalize placement no-op passes are
  // registered directly by `src/core/passes.ts`.
];

export const builtInCheckPipeline = (): readonly string[] => [
  BUILT_IN_PASSES.VERIFY_SYMBOLS.ENTITY,
  ...builtInCheckPasses().map((pass) => pass.name),
];

/**
 * Registers built-in checks as kernel passes in the context's PassRegistry.
 * This is the authoritative R10 check path; there is no parallel checker array.
 */
export const registerBuiltInPasses = (ctx: GenContext): void => {
  registerCorePasses(ctx);
  registerEntityPasses(ctx);
  // Track E §2 ports: each domain owns its own passes module. Calling
  // them from here keeps `registerBuiltInPasses` the canonical "register
  // all" entry point (used by `createGen`) without leaking ordering
  // concerns to callers.
  registerStoragePasses(ctx);
  registerServicesPasses(ctx);
  registerUiPasses(ctx);
  registerEditorPasses(ctx);
  registerCrudPasses(ctx);
  registerListPasses(ctx);
  registerStatePasses(ctx);
  registerObligationsPasses(ctx);
  registerMergePasses(ctx);
  registerOrchestrationPasses(ctx);
  registerWorkflowPasses(ctx);
  registerBoundaryPasses(ctx);
  registerOfflinePasses(ctx);
  for (const spec of builtInCheckPasses()) {
    if (!ctx.passRegistry.has(spec.name)) {
      ctx.passRegistry.register(
        { name: spec.name, phase: spec.phase },
        ctxCheckerToPass(spec.check),
      );
    }
  }
};

/** Backwards-compatible alias retained for callers; delegates to `registerBuiltInPasses`. */
export const registerBuiltInModuleCheckers = (ctx: GenContext): void => {
  registerBuiltInPasses(ctx);
};
