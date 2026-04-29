/**
 * Lifecycle phases and runner. The runner orchestrates check and generate
 * passes: collect refs → resolve plugin deps → check target compatibility →
 * run module-level checks → run codegen hooks → finalize artifacts.
 *
 * See spec/lifecycle.allium.
 */

import {
  type Artifact,
  checkConfig,
  checkContractsAndActors,
  collectAllArtifacts,
  collectAllDiagnostics,
  type Diagnostic,
  diagnostic,
  type GenContext,
  hasErrors,
  validatePluginInvariants,
} from "../core/index.ts";
import { checkEntityInvariants, checkRefsExist, type Field } from "../entity/index.ts";
import { checkEvents } from "../events/index.ts";
import {
  checkActionWrites,
  checkFunctions,
  checkFunctionRuntimes,
  checkQueryFunctionRuntimes,
  type FunctionCatalog,
} from "../function/index.ts";
import { checkApi } from "../api/index.ts";
import { checkQueries, checkQueryRuntimes } from "../query/index.ts";
import { checkRelations, checkRelationEntities } from "../relation/index.ts";
import {
  checkMappings,
  checkReversibleMappings,
  checkStorageInvariants,
} from "../storage/index.ts";
import { checkUi } from "../ui/index.ts";
import { checkEditors } from "../editor/index.ts";
import { checkCrud } from "../crud/index.ts";
import { checkList } from "../list/index.ts";
import { checkAuthz, checkMutationAccessPlans } from "../authz/index.ts";
import { checkOptimisticPlans, checkReactivity, checkRuleReactivity } from "../reactivity/index.ts";
import { checkAppRoute } from "../router/index.ts";
import { checkServices } from "../services/index.ts";
import { checkRules } from "../rules/index.ts";
import { checkReactions } from "../reaction/index.ts";
import type { FallbackPolicy, PlanExpr } from "../expression/index.ts";
import type { Mutator } from "../api/index.ts";
import type { QueryExpression } from "../query/index.ts";
import type { Store } from "../storage/index.ts";
import type { Runtime } from "../types/index.ts";

/** Represents the execution status of a lifecycle phase. */
export type PhaseStatus = "pending" | "running" | "completed" | "failed";

/**
 * A named phase in the generation lifecycle with an execution order.
 *
 * @example
 * ```ts
 * const phase: LifecyclePhase = {
 *   name: "collect_refs",
 *   order: 0,
 *   status: "pending",
 * };
 * ```
 */
export interface LifecyclePhase {
  readonly name: string;
  readonly order: number;
  status: PhaseStatus;
}

/**
 * A rule binding a lifecycle phase to an action and target kind.
 *
 * @example
 * ```ts
 * const rule: LifecycleRule = {
 *   phase: { name: "run_checks", order: 3, status: "pending" },
 *   action: "validate",
 *   target_kind: "entity",
 * };
 * ```
 */
export interface LifecycleRule {
  readonly phase: LifecyclePhase;
  readonly action: string;
  readonly target_kind: string;
}

// --- Cross-store planner --------------------------------------------------

/**
 * Strategy for composing cross-store queries or writes.
 */
export type CompositionStrategyKind =
  | "server_composition"
  | "materialized_view"
  | "streaming_join"
  | "event_sourced";

/**
 * Cross-store composition configuration with optional coordinator and timeout.
 *
 * @example
 * ```ts
 * const strategy: CompositionStrategy = {
 *   kind: "server_composition",
 *   coordinator: "node",
 *   timeout: "30s",
 * };
 * ```
 */
export interface CompositionStrategy {
  readonly kind: CompositionStrategyKind;
  readonly coordinator?: Runtime;
  readonly timeout?: string;
}

/**
 * Assigns a subset of fields and a local query to a specific store and runtime.
 *
 * @example
 * ```ts
 * const assignment: StoreAssignment = {
 *   store: myStore,
 *   fields: [idField, nameField],
 *   local_query: myQuery,
 *   runtime: "node",
 * };
 * ```
 */
export interface StoreAssignment {
  readonly store: Store;
  readonly fields: readonly Field[];
  readonly local_query: QueryExpression;
  readonly runtime: Runtime;
}

/**
 * A planner that decomposes a query across multiple stores with a composition strategy.
 *
 * @example
 * ```ts
 * const planner: CrossStorePlanner = {
 *   name: "userSearch",
 *   query: searchQuery,
 *   store_assignments: [assignmentA, assignmentB],
 *   composition_strategy: { kind: "streaming_join" },
 *   fallback_policy: { effectful_ok: false },
 * };
 * ```
 */
export interface CrossStorePlanner {
  readonly name: string;
  readonly query: QueryExpression;
  readonly store_assignments: readonly StoreAssignment[];
  readonly composition_strategy: CompositionStrategy;
  readonly fallback_policy: FallbackPolicy;
}

// --- Standard phases ------------------------------------------------------

/**
 * Returns the default lifecycle phases in order.
 *
 * @returns An array of standard LifecyclePhase records.
 * @example
 * ```ts
 * const phases = standardPhases();
 * // phases[0].name === "collect_refs"
 * ```
 */
export const standardPhases = (): LifecyclePhase[] => [
  { name: "collect_refs", order: 0, status: "pending" },
  { name: "resolve_plugins", order: 1, status: "pending" },
  { name: "check_targets", order: 2, status: "pending" },
  { name: "run_checks", order: 3, status: "pending" },
  { name: "generate", order: 4, status: "pending" },
];

// --- Module check registry -------------------------------------------------
// Other modules register their checkers here. The runner invokes each in turn.

/**
 * Signature for a module-level diagnostic checker registered with the lifecycle.
 *
 * @param ctx - The generation context containing entities, stores, and other definitions.
 * @returns An array of diagnostics produced by the checker.
 * @example
 * ```ts
 * const checker: ModuleChecker = (ctx) => {
 *   return ctx.entities.length === 0
 *     ? [diagnostic({ severity: "error", code: "empty", message: "No entities" })]
 *     : [];
 * };
 * ```
 */
export type ModuleChecker = (ctx: GenContext) => readonly Diagnostic[];

// NOTE: moduleCheckers and builtInModuleCheckersRegistered moved to GenContext
// to avoid global singleton state and enable concurrent contexts.

const unsupportedAsyncHookDiagnostic = (kind: "check" | "codegen", name: string): Diagnostic =>
  diagnostic({
    severity: "error",
    code: `lifecycle:async-${kind}-hook-unsupported`,
    message: `Async ${kind} hook ${name} is not supported by the synchronous lifecycle runner`,
  });

/**
 * Registers a module-level checker to be invoked during the check phase.
 *
 * @param fn - A function that takes a GenContext and returns diagnostics.
 * @example
 * ```ts
 * registerModuleChecker((ctx) => {
 *   return ctx.stores.length === 0
 *     ? [diagnostic({ severity: "warning", code: "no-stores", message: "No stores defined" })]
 *     : [];
 * });
 * ```
 */
export const registerModuleChecker = (ctx: GenContext, fn: ModuleChecker): void => {
  ctx.moduleCheckers.push(fn);
};

/**
 * Clears all registered module-level checkers.
 *
 * @example
 * ```ts
 * clearModuleCheckers();
 * ```
 */
export const clearModuleCheckers = (ctx: GenContext): void => {
  ctx.moduleCheckers.length = 0;
  ctx.builtInModuleCheckersRegistered = false;
};

const buildFunctionCatalog = (ctx: GenContext): FunctionCatalog => ({
  static: ctx.static_functions,
  expr: ctx.expr_functions,
  predicate: ctx.predicate_functions,
  query: ctx.query_functions,
  action: ctx.action_functions,
  patch: ctx.patch_functions,
  plan: ctx.plan_functions,
});

/**
 * Registers the built-in module checkers for entities, stores, functions, queries, and more.
 *
 * Subsequent calls are no-ops after the first invocation.
 *
 * @example
 * ```ts
 * registerBuiltInModuleCheckers();
 * ```
 */
export const registerBuiltInModuleCheckers = (ctx: GenContext): void => {
  if (ctx.builtInModuleCheckersRegistered) return;

  registerModuleChecker(ctx, (ctx) => checkEntityInvariants(ctx.entities));
  registerModuleChecker(ctx, (ctx) => checkRefsExist(ctx.refs, ctx.entities));
  registerModuleChecker(ctx, (ctx) => checkContractsAndActors(ctx.contracts, ctx.actors));
  registerModuleChecker(ctx, (ctx) => checkConfig(ctx.config));
  registerModuleChecker(ctx, (ctx) => checkStorageInvariants(ctx.stores));
  registerModuleChecker(ctx, (ctx) => checkMappings(ctx.mappings));
  registerModuleChecker(ctx, (ctx) => checkReversibleMappings(ctx.mappings));
  registerModuleChecker(ctx, (ctx) => checkRelations(ctx.relations));
  registerModuleChecker(ctx, (ctx) => checkRelationEntities(ctx.relation_entities, ctx.entities));
  registerModuleChecker(ctx, (ctx) => checkQueries(ctx.queries));
  registerModuleChecker(ctx, (ctx) => checkQueryRuntimes(ctx.queries));
  registerModuleChecker(ctx, (ctx) => checkFunctions(buildFunctionCatalog(ctx)));
  registerModuleChecker(ctx, (ctx) => checkFunctionRuntimes(buildFunctionCatalog(ctx)));
  registerModuleChecker(ctx, (ctx) => checkQueryFunctionRuntimes(buildFunctionCatalog(ctx)));
  registerModuleChecker(ctx, (ctx) => checkActionWrites(buildFunctionCatalog(ctx)));
  registerModuleChecker(ctx, (ctx) => checkApi(ctx.routes, ctx.mutators));
  registerModuleChecker(ctx, (ctx) =>
    checkAuthz({
      policies: ctx.policies,
      translations: [],
      exposures: [],
      getters: ctx.getters,
      mutators: ctx.mutators,
      entities: ctx.entities,
    }),
  );
  registerModuleChecker(ctx, (ctx) => checkMutationAccessPlans(ctx));
  registerModuleChecker(ctx, (ctx) =>
    checkEvents({
      events: ctx.events,
      emissions: ctx.event_emissions,
      reducers: ctx.reducers,
      subscriptions: ctx.subscriptions,
    }),
  );
  registerModuleChecker(ctx, (ctx) =>
    checkReactivity({
      key_families: ctx.key_families,
      reactive_resources: ctx.reactive_resources,
      reactive_mutations: ctx.reactive_mutations,
    }),
  );
  registerModuleChecker(ctx, (ctx) =>
    checkOptimisticPlans({
      reactive_mutations: ctx.reactive_mutations,
    }),
  );
  registerModuleChecker(ctx, (ctx) => checkRuleReactivity(ctx));
  registerModuleChecker(ctx, (ctx) => ctx.app_routes.flatMap((route) => checkAppRoute(route)));
  registerModuleChecker(ctx, (ctx) => checkServices(ctx));
  registerModuleChecker(ctx, (ctx) => checkRules(ctx.rules));
  registerModuleChecker(ctx, (ctx) => checkReactions(ctx.reactions));
  registerModuleChecker(ctx, (ctx) =>
    checkUi({
      views: ctx.views,
      forms: ctx.forms,
      styles: ctx.styles,
      behaviors: ctx.behaviors,
      themes: ctx.themes,
      components: ctx.components,
      platforms: ctx.platforms,
    }),
  );
  registerModuleChecker(ctx, (ctx) =>
    checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    }),
  );
  registerModuleChecker(ctx, (ctx) =>
    checkCrud(ctx.cruds, ctx.entities, ctx.query_functions, ctx.action_functions, ctx.mappings),
  );
  registerModuleChecker(ctx, (ctx) =>
    checkList(ctx.lists, ctx.entities, ctx.query_functions, ctx.action_functions),
  );
  registerModuleChecker(ctx, (ctx) => checkCrossStorePlanners(ctx.cross_store_planners));
  registerModuleChecker(ctx, (ctx) =>
    checkCrossStoreReadComposition(ctx.queries, ctx.cross_store_planners),
  );
  registerModuleChecker(ctx, (ctx) => checkCrossStoreWriteCoordinator(ctx.mutators));
  registerModuleChecker(ctx, (ctx) => checkPlanFallback(ctx.plan_functions.map((f) => f.body)));

  ctx.builtInModuleCheckersRegistered = true;
};

// --- Cross-store rules ----------------------------------------------------

/**
 * Validates cross-store planners: more than one store, distinct stores,
 * and coverage of projected fields.
 *
 * @param planners - Cross-store planners to validate.
 * @returns Diagnostics for any violated planner rules.
 * @example
 * ```ts
 * const diagnostics = checkCrossStorePlanners(ctx.cross_store_planners);
 * ```
 */
export const checkCrossStorePlanners = (
  planners: readonly CrossStorePlanner[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const csp of planners) {
    if (csp.store_assignments.length <= 1) {
      out.push(
        diagnostic({
          severity: "error",
          code: "lifecycle:planner-too-few-stores",
          message: `CrossStorePlanner ${csp.name} requires more than one store assignment`,
        }),
      );
      continue;
    }
    // Distinct stores
    const seen = new Set<string>();
    for (const sa of csp.store_assignments) {
      if (seen.has(sa.store.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "lifecycle:planner-duplicate-store",
            message: `CrossStorePlanner ${csp.name} has duplicate assignment to store ${sa.store.name}`,
          }),
        );
      }
      seen.add(sa.store.name);
    }
    // Assignments cover projection fields when projection is set.
    if (csp.query.projection) {
      for (const pf of csp.query.projection.fields) {
        const found = csp.store_assignments.some((sa) => sa.fields.includes(pf.field));
        if (!found) {
          out.push(
            diagnostic({
              severity: "error",
              code: "lifecycle:planner-missing-field",
              message: `CrossStorePlanner ${csp.name} does not cover projected field ${pf.field.name}`,
            }),
          );
        }
      }
    }
  }
  return out;
};

/**
 * Ensures every cross-store query has a corresponding planner.
 *
 * @param queries - Queries to validate.
 * @param planners - Available cross-store planners.
 * @returns Diagnostics for unplanned cross-store reads.
 * @example
 * ```ts
 * const diagnostics = checkCrossStoreReadComposition(ctx.queries, ctx.cross_store_planners);
 * ```
 */
export const checkCrossStoreReadComposition = (
  queries: readonly QueryExpression[],
  planners: readonly CrossStorePlanner[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const q of queries) {
    if (q.target_stores.length <= 1) continue;
    const planned = planners.some((p) => p.query === q);
    if (!planned) {
      out.push(
        diagnostic({
          severity: "error",
          code: "lifecycle:cross-store-read-unplanned",
          message: "Cross-store query requires explicit composition plan",
        }),
      );
    }
  }
  return out;
};

/**
 * Warns when a transactional mutator writes to multiple stores without a coordinator.
 *
 * @param mutators - Mutators to validate.
 * @returns Diagnostics for unsupported cross-store transactional writes.
 * @example
 * ```ts
 * const diagnostics = checkCrossStoreWriteCoordinator(ctx.mutators);
 * ```
 */
export const checkCrossStoreWriteCoordinator = (
  mutators: readonly Mutator[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const m of mutators) {
    if (m.written_stores.length > 1 && m.consistency === "transactional") {
      out.push(
        diagnostic({
          severity: "error",
          code: "lifecycle:cross-store-write-no-coordinator",
          message: `Cross-store transactional write ${m.name} requires coordinator; use saga or eventual consistency`,
        }),
      );
    }
  }
  return out;
};

/**
 * Validates plan fallback policies: warns when effectful operations silently fallback.
 *
 * @param plans - Plan expressions to validate.
 * @returns Diagnostics for suspicious fallback configurations.
 * @example
 * ```ts
 * const diagnostics = checkPlanFallback(ctx.plan_functions.map((f) => f.body));
 * ```
 */
export const checkPlanFallback = (plans: readonly PlanExpr[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const plan of plans) {
    if (!plan.fallback) continue;
    if (
      !plan.fallback_policy.effectful_ok &&
      (plan.primary.effects.length > 0 || plan.fallback.primary.effects.length > 0)
    ) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "runtime:silent-effectful-fallback",
          message: "Effectful operations should not silently fallback",
        }),
      );
    }
  }
  return out;
};

// --- Runner ---------------------------------------------------------------

/**
 * Aggregated result of a lifecycle run including diagnostics, artifacts, and status.
 *
 * @example
 * ```ts
 * const result: RunResult = {
 *   diagnostics: [],
 *   artifacts: [],
 *   status: "ok",
 * };
 * ```
 */
export interface RunResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: readonly Artifact[];
  readonly status: "ok" | "has_errors" | "has_warnings";
}

/**
 * Run the standard check pass: validates plugins, runs each registered module
 * checker, aggregates diagnostics. Does NOT call codegen.
 *
 * @param ctx - The GenContext to check.
 * @returns A RunResult with aggregated diagnostics and status.
 * @example
 * ```ts
 * const result = check(ctx);
 * if (result.status === "has_errors") {
 *   console.error(result.diagnostics);
 * }
 * ```
 */
export const check = (ctx: GenContext): RunResult => {
  ctx.status = "checking";
  const phases = standardPhases();

  // collect_refs / resolve_plugins phases are mostly bookkeeping; the kernel
  // already populated ctx.refs and ctx.plugins. We re-validate plugin invariants
  // here in case a caller mutated ctx after createGen().
  phases[0]!.status = "completed";
  phases[1]!.status = "running";
  for (const d of validatePluginInvariants(ctx)) {
    ctx.diagnostics.push(d);
  }
  phases[1]!.status = "completed";

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
  for (const checker of ctx.moduleCheckers) {
    for (const d of checker(ctx)) {
      ctx.diagnostics.push(d);
    }
  }
  phases[3]!.status = "completed";

  ctx.status = hasErrors(ctx.diagnostics) ? "failed" : "ready";
  const all = collectAllDiagnostics(ctx);
  return {
    diagnostics: all,
    artifacts: [],
    status: hasErrors(all) ? "has_errors" : all.length > 0 ? "has_warnings" : "ok",
  };
};

/**
 * Run check + generate. If check fails with errors, generation is skipped.
 *
 * @param ctx - The GenContext to generate from.
 * @returns A RunResult with diagnostics, artifacts, and status.
 * @example
 * ```ts
 * const result = generate(ctx);
 * console.log(result.artifacts.length);
 * ```
 */
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

    // Look up the plugin's contributed generate function via the registered
    // codegen hooks, if any.
    const plugin = ctx.plugins.find((p) => p.id === t.plugin_id);
    if (!plugin) continue;
    const contributions = ctx.contributions.get(plugin.id);
    if (!contributions) continue;

    const targetContrib = contributions.targets.find((tc) => tc.name === t.name);
    if (!targetContrib?.generate) continue;

    let artifacts: Artifact[] = [];
    const diagnostics: Diagnostic[] = [];
    for (const input of t.inputs) {
      try {
        const result = targetContrib.generate(input);
        artifacts.push(...result);

        for (const hook of contributions.codegen_hooks) {
          if (hook.target_kind !== input.kind) continue;
          const hookResult = hook.generate_fn(input);
          if (hookResult instanceof Promise) {
            diagnostics.push(unsupportedAsyncHookDiagnostic("codegen", hook.name));
            continue;
          }
          artifacts.push(...hookResult);
        }
      } catch (err) {
        diagnostics.push(
          diagnostic({
            severity: "error",
            code: "lifecycle:generate-error",
            message: `Generation failed for target ${t.name}: ${(err as Error).message}`,
          }),
        );
      }
    }

    for (const transform of contributions.artifact_transforms) {
      artifacts = artifacts.map((artifact) => transform.transform_fn(artifact));
    }

    t.generate_result = {
      artifacts,
      diagnostics,
      status: hasErrors(diagnostics) ? "failed" : "success",
    };
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
