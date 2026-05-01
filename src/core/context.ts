/* @__NO_SIDE_EFFECTS__ */
/**
 * GenContext is the root container for a generation run. `createGen()` builds one
 * from a list of plugins, runs each plugin's `setup()` to gather contributions,
 * and returns the context object plus a typed `gen` namespace that downstream
 * modules attach helpers to.
 *
 * See spec/core.allium :: entity GenContext, surface PluginAPI.
 */

import type { Artifact, GenerateResult } from "./artifacts.ts";
import type { Config, DefaultInstance } from "./config.ts";
import type { Actor, Contract } from "./contract.ts";
import { type Diagnostic, diagnostic } from "./diagnostics.ts";
import {
  type Helper,
  type Plugin,
  type PluginContext,
  type PluginContributions,
  type TargetContribution,
} from "./plugin.ts";
import { refEquals, refIdentity, type Ref, type StableId } from "./refs.ts";
import { makeTarget, type Target } from "./target.ts";
import type { Entity } from "../entity/index.ts";
import type { QueryExpression } from "../query/index.ts";
import type {
  ActionFunction,
  ExprFunction,
  PatchFunction,
  PredicateFunction,
  QueryFunction,
  PlanFunction,
  StaticFunction,
} from "../function/index.ts";
import type { Getter, Mutator, Resource, Route } from "../api/index.ts";
import type { Policy } from "../authz/index.ts";
import type { Editor } from "../editor/index.ts";
import type { Crud } from "../crud/index.ts";
import type { List } from "../list/index.ts";
import type { Event, EventEmission, Reducer, Subscription } from "../events/index.ts";
import type { Graph, Relation, RelationEntity } from "../relation/index.ts";
import type {
  Behavior,
  Component,
  Form,
  Platform,
  Renderer,
  Style,
  Theme,
  View,
} from "../ui/index.ts";
import type { Mapping, Projection, Store, StoreSchema, Table, Column } from "../storage/index.ts";
import type { Runtime, Serializer, TraitApplication } from "../types/index.ts";
import type { CrossStorePlanner } from "../lifecycle/index.ts";
import type {
  AnyResource,
  DerivedResource,
  KeyFamily,
  LifecycleRequirement,
  ReactiveMutation,
  ReactiveRegistry,
  ReactiveResource,
  ReactiveRuntime,
  ResourceAll,
  ResourceChain,
  ScopedResource,
  ServiceLayer,
} from "../reactivity/index.ts";
import type { AppRoute } from "../router/index.ts";
import type { ServiceRef } from "../services/index.ts";
import type { Rule, DerivedRuleView } from "../rules/index.ts";
import type { Reaction } from "../reaction/index.ts";
import type { TraitMetadata, StaticNode } from "./node.ts";
import type { ContextDef, ContextProvision, ContextRequirement } from "../context/index.ts";
import type { StorageLocation } from "../storage/locations.ts";
import type { ComposablePlan } from "../plan/index.ts";
import type { Schedule, CronJob } from "../orchestration/index.ts";
import type { Provider, RequirementRef } from "../requirements/index.ts";
import type { Workflow } from "../workflow/index.ts";
import type { BoundaryCallPlan } from "../boundary/index.ts";
import type { ObligationGraph } from "../obligations/index.ts";
import type { OfflineCommandEnvelope, OfflineQueuePlan } from "../offline/index.ts";
import type { StateResource } from "../state/index.ts";

/** Lifecycle status of a GenContext. */
export type ContextStatus = "idle" | "checking" | "generating" | "ready" | "failed";

/** Root container for a generation run, aggregating plugins, targets, refs, diagnostics, artifacts, contracts, actors, config, defaults, status, helpers, and contributions. */
export interface GenContext {
  readonly plugins: Plugin[];
  readonly targets: Target[];
  readonly refs: Ref[];
  readonly diagnostics: Diagnostic[];
  readonly artifacts: Artifact[];
  readonly entities: Entity[];
  readonly stores: Store[];
  readonly tables: Table[];
  readonly columns: Column[];
  readonly mappings: Mapping[];
  readonly projections: Projection[];
  readonly schemas: StoreSchema[];
  readonly relations: Relation[];
  readonly relation_entities: RelationEntity[];
  readonly graphs: Graph[];
  readonly queries: QueryExpression[];
  readonly static_functions: StaticFunction[];
  readonly expr_functions: ExprFunction[];
  readonly predicate_functions: PredicateFunction[];
  readonly query_functions: QueryFunction[];
  readonly action_functions: ActionFunction[];
  readonly patch_functions: PatchFunction[];
  readonly plan_functions: PlanFunction[];
  readonly resources: Resource[];
  readonly routes: Route[];
  readonly app_routes: AppRoute[];
  readonly getters: Getter[];
  readonly mutators: Mutator[];
  readonly policies: Policy[];
  readonly events: Event[];
  readonly event_emissions: EventEmission[];
  readonly reducers: Reducer[];
  readonly subscriptions: Subscription[];
  readonly forms: Form[];
  readonly views: View[];
  readonly components: Component[];
  readonly styles: Style[];
  readonly behaviors: Behavior[];
  readonly themes: Theme[];
  readonly platforms: Platform[];
  readonly renderers: Renderer[];
  readonly runtimes: Runtime[];
  readonly serializers: Serializer[];
  readonly trait_applications: TraitApplication[];
  readonly cross_store_planners: CrossStorePlanner[];
  readonly contracts: Contract[];
  readonly actors: Actor[];
  config: Config;
  readonly defaults: DefaultInstance[];
  readonly editors: Editor[];
  readonly cruds: Crud<unknown>[];
  readonly lists: List<unknown>[];
  readonly key_families: KeyFamily[];
  readonly reactive_resources: AnyResource[];
  readonly reactive_mutations: ReactiveMutation[];
  readonly resource_alls: ResourceAll<Record<string, ReactiveResource<any, any, any>>>[];
  readonly resource_chains: ResourceChain<any, any, any, any, any, any>[];
  readonly derived_resources: DerivedResource[];
  readonly scoped_resources: ScopedResource[];
  readonly reactive_runtimes: ReactiveRuntime[];
  readonly service_layers: ServiceLayer[];
  readonly lifecycle_requirements: LifecycleRequirement[];
  readonly reactive_registries: ReactiveRegistry[];
  readonly tracking_scopes: import("../reactivity/index.ts").TrackingScope[];
  readonly services: ServiceRef[];
  readonly rules: Rule[];
  readonly derived_rule_views: DerivedRuleView[];
  readonly reactions: Reaction[];
  /** Plugin-defined and custom application-level static nodes. */
  readonly nodes: StaticNode[];
  /** Typed context definitions (e.g. AuthSession, TenantContext). */
  readonly contexts: ContextDef[];
  /** Context provisions: which context is provided from which storage location. */
  readonly context_provisions: ContextProvision[];
  /** Context requirements declared by routes, components, workflows. */
  readonly context_requirements: ContextRequirement[];
  /** Abstract requirements that can be satisfied by providers. */
  readonly requirements: RequirementRef[];
  /** Provider IR describing how requirements, contexts, and services are satisfied. */
  readonly providers: Provider[];
  /** Non-query state resources such as URL state, preferences, drafts, and queues. */
  readonly state_resources: StateResource[];
  /** Storage locations used by the application. */
  readonly storage_locations: StorageLocation[];
  /** Composable plans (sequence, parallel, fallback). */
  readonly composable_plans: ComposablePlan[];
  /** Typed schedule definitions. */
  readonly schedules: Schedule[];
  /** Cron jobs binding schedules to callable run targets. */
  readonly cron_jobs: CronJob[];
  /** Typed workflow definitions. */
  readonly workflows: Workflow[];
  /** Cross-boundary call plans. */
  readonly boundary_plans: BoundaryCallPlan[];
  /** Semantic obligation graphs for tests/docs/devtools. */
  readonly obligation_graphs: ObligationGraph[];
  /** Offline command envelopes for queueable actions. */
  readonly offline_commands: OfflineCommandEnvelope[];
  /** Offline queue plans for replay semantics. */
  readonly offline_queues: OfflineQueuePlan[];
  status: ContextStatus;
  /** Plugin-contributed helper namespaces, indexed by namespace name. */
  readonly helpers: Map<string, Record<string, unknown>>;
  /** Cached PluginContributions, indexed by plugin id. */
  readonly contributions: Map<string, PluginContributions>;
  /** Trait metadata registry, indexed by trait name. */
  readonly trait_metadata: Map<string, TraitMetadata>;
  /** Module-level checkers invoked during the check phase. */
  readonly moduleCheckers: ((ctx: GenContext) => readonly Diagnostic[])[];
  /** Whether built-in module checkers have already been registered. */
  builtInModuleCheckersRegistered: boolean;
}

/** Input object for `createGen()`. */
export interface CreateGenInput {
  plugins?: readonly Plugin[];
}

/**
 * Build a fresh GenContext, run plugin setups, and return the context. The
 * returned object is mutated by later phases (collect_refs, run_checks, generate).
 *
 * The kernel does NOT itself enforce plugin namespace uniqueness here — it
 * records diagnostics and lets the lifecycle's plugin-validation phase decide
 * whether to fail the run.
 *
 * @param input - Optional input containing plugins to register.
 * @returns A new GenContext with plugins initialized and contributions materialized.
 */
export const createGen = (input: CreateGenInput = {}): GenContext => {
  const ctx: GenContext = {
    plugins: [],
    targets: [],
    refs: [],
    diagnostics: [],
    artifacts: [],
    entities: [],
    stores: [],
    tables: [],
    columns: [],
    mappings: [],
    projections: [],
    schemas: [],
    relations: [],
    relation_entities: [],
    graphs: [],
    queries: [],
    static_functions: [],
    expr_functions: [],
    predicate_functions: [],
    query_functions: [],
    action_functions: [],
    patch_functions: [],
    plan_functions: [],
    resources: [],
    routes: [],
    app_routes: [],
    getters: [],
    mutators: [],
    policies: [],
    events: [],
    event_emissions: [],
    reducers: [],
    subscriptions: [],
    forms: [],
    views: [],
    components: [],
    styles: [],
    behaviors: [],
    themes: [],
    platforms: [],
    renderers: [],
    runtimes: [],
    serializers: [],
    trait_applications: [],
    cross_store_planners: [],
    contracts: [],
    actors: [],
    config: { entries: [] },
    defaults: [],
    editors: [],
    cruds: [],
    lists: [],
    key_families: [],
    reactive_resources: [],
    reactive_mutations: [],
    resource_alls: [],
    resource_chains: [],
    derived_resources: [],
    scoped_resources: [],
    reactive_runtimes: [],
    service_layers: [],
    lifecycle_requirements: [],
    reactive_registries: [],
    tracking_scopes: [],
    services: [],
    rules: [],
    derived_rule_views: [],
    reactions: [],
    nodes: [],
    contexts: [],
    context_provisions: [],
    context_requirements: [],
    requirements: [],
    providers: [],
    state_resources: [],
    storage_locations: [],
    composable_plans: [],
    schedules: [],
    cron_jobs: [],
    workflows: [],
    boundary_plans: [],
    obligation_graphs: [],
    offline_commands: [],
    offline_queues: [],
    status: "idle",
    helpers: new Map(),
    contributions: new Map(),
    trait_metadata: new Map(),
    moduleCheckers: [],
    builtInModuleCheckersRegistered: false,
  };

  const plugins = input.plugins ?? [];
  for (const plugin of plugins) {
    registerPlugin(ctx, plugin);
  }

  // Validate plugin invariants synchronously so a bad config fails fast.
  for (const d of validatePluginInvariants(ctx)) {
    ctx.diagnostics.push(d);
  }

  return ctx;
};

const registerPlugin = (ctx: GenContext, plugin: Plugin): void => {
  // RegisterPlugin precondition: namespace must be unique. Record diagnostic
  // instead of throwing so multiple conflicts can be surfaced together.
  if (ctx.plugins.some((p) => p.namespace === plugin.namespace)) {
    ctx.diagnostics.push(
      diagnostic({
        severity: "error",
        code: "core:duplicate-namespace",
        message: `Duplicate plugin namespace: ${plugin.namespace}`,
      }),
    );
    return;
  }

  ctx.plugins.push(plugin);
  plugin.status = "registered";

  // Run the plugin's setup function with a synthetic PluginContext.
  const pluginCtx: PluginContext = makePluginContext(ctx);
  let contributions: PluginContributions;
  if (plugin.setup) {
    try {
      contributions = plugin.setup.run(pluginCtx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ctx.diagnostics.push(
        diagnostic({
          severity: "error",
          code: "core:plugin-setup-failed",
          message: `Plugin ${plugin.id} setup failed: ${msg}`,
        }),
      );
      plugin.status = "failed";
      return;
    }
  } else {
    contributions = plugin.contributions;
  }
  ctx.contributions.set(plugin.id, contributions);

  // Auto-register trait metadata contributed by the plugin.
  if (contributions.trait_metadata) {
    for (const [trait, metadata] of Object.entries(contributions.trait_metadata)) {
      ctx.trait_metadata.set(trait, metadata);
    }
  }

  (plugin.helpers as Helper[]).push(...contributions.helpers);

  // Materialize the plugin's contributed targets into kernel Target records.
  for (const tc of contributions.targets) {
    ctx.targets.push(materializeTarget(plugin, tc));
  }

  // Index helpers by namespace.
  for (const helper of contributions.helpers) {
    if (!ctx.helpers.has(helper.namespace)) {
      ctx.helpers.set(helper.namespace, {});
    }
    helper.available_in = ctx;
    const namespace = ctx.helpers.get(helper.namespace)!;
    namespace[helper.name] = helper.materialize ? helper : (helper.value ?? helper);
  }

  plugin.status = "active";
};

const materializeTarget = (plugin: Plugin, tc: TargetContribution): Target =>
  makeTarget({
    name: tc.name,
    plugin_id: plugin.id,
    accepts_inputs: tc.accepts_inputs,
  });

const makePluginContext = (ctx: GenContext): PluginContext => ({
  core_constructors: [
    "entity",
    "store",
    "table",
    "column",
    "mapping",
    "projection",
    "relation",
    "graph",
    "runtime",
    "query.build",
    "query.from",
    "func.expr",
    "func.query",
    "func.action",
    "func.patch",
    "api.resource",
    "api.route",
    "api.getter",
    "api.mutator",
    "authz.policy",
    "events.event",
    "events.emit",
    "definePlugin",
  ],
  registered_refs: ctx.refs,
  registered_metadata: [...ctx.contributions.values()].flatMap(
    (contrib) => contrib.metadata_namespaces,
  ),
  runtime_registry: [
    ...new Set([
      ...ctx.runtimes.map((runtime) => runtime.name),
      ...[...ctx.contributions.values()].flatMap((contrib) => contrib.runtimes),
    ]),
  ],
  target_registry: ctx.targets.map((t) => t.name),
  store_registry: [
    ...new Set([
      ...ctx.stores.map((store) => store.name),
      ...[...ctx.contributions.values()].flatMap((contrib) => contrib.stores),
    ]),
  ],
  operation_registry: [
    ...new Set([...ctx.contributions.values()].flatMap((contrib) => contrib.operations)),
  ],
  diagnostic_factory: (d) => diagnostic(d),
  artifact_factory: ({ path, content }) => ({
    path,
    content,
    kind: "source" as const,
    diagnostics: [],
  }),
  requirement_helpers: [],
});

/**
 * Implements core.allium invariants:
 * - NoDuplicateNamespaces (already enforced at register time, but re-checked)
 * - AllDependenciesSatisfied (every required_plugin must be registered)
 * - PluginContributionsUnique (target names unique within a plugin)
 * - TargetNamesUniqueAcrossPlugins (target names unique across plugins)
 * - DuplicatePluginHelperNamespace (helpers must have unique namespaces)
 *
 * @param ctx - The GenContext to validate.
 * @returns A list of diagnostics for any violated invariants.
 */
export const validatePluginInvariants = (ctx: GenContext): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // AllDependenciesSatisfied
  for (const p of ctx.plugins) {
    for (const dep of p.required_plugins) {
      if (!ctx.plugins.some((q) => q.id === dep.id)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "core:plugin-missing-dependency",
            message: `Plugin ${p.id} requires missing plugin ${dep.id}`,
          }),
        );
      }
    }
  }

  // PluginContributionsUnique
  for (const p of ctx.plugins) {
    const seen = new Set<string>();
    for (const t of ctx.contributions.get(p.id)?.targets ?? []) {
      if (seen.has(t.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "core:duplicate-target",
            message: `Plugin ${p.id} contributes duplicate target ${t.name}`,
          }),
        );
      }
      seen.add(t.name);
    }
  }

  // TargetNamesUniqueAcrossPlugins
  const allTargets = new Map<string, string>(); // target name → plugin id
  for (const p of ctx.plugins) {
    for (const t of ctx.contributions.get(p.id)?.targets ?? []) {
      const owner = allTargets.get(t.name);
      if (owner !== undefined && owner !== p.id) {
        out.push(
          diagnostic({
            severity: "error",
            code: "core:target-name-collision",
            message: `Target ${t.name} contributed by both ${owner} and ${p.id}`,
          }),
        );
      } else {
        allTargets.set(t.name, p.id);
      }
    }
  }

  // DuplicatePluginHelperNamespace fires only when two plugins claim the same
  // (namespace, name) pair — i.e. they would resolve to the same `gen.<ns>.<name>`
  // key. Sharing a namespace with disjoint names is permitted so that nested
  // namespaces like `gen.adapters.*` can host helpers from multiple plugins.
  const sorted = [...ctx.plugins].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const p = sorted[i]!;
      const q = sorted[j]!;
      const pHelpers = ctx.contributions.get(p.id)?.helpers ?? [];
      const qHelpers = ctx.contributions.get(q.id)?.helpers ?? [];
      for (const h of pHelpers) {
        if (qHelpers.some((gh) => gh.namespace === h.namespace && gh.name === h.name)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "core:duplicate-helper-namespace",
              message: `Duplicate helper ${h.namespace}.${h.name} between plugins ${p.id} and ${q.id}`,
            }),
          );
        }
      }
    }
  }

  return out;
};

/**
 * Typed accessor for entities in a GenContext.
 *
 * @param ctx - The GenContext to query.
 * @returns All registered entities.
 */
export const getEntities = (ctx: GenContext): readonly Entity[] => ctx.entities;

/**
 * Typed accessor for queries in a GenContext.
 *
 * @param ctx - The GenContext to query.
 * @returns All registered queries.
 */
export const getQueries = (ctx: GenContext): readonly QueryExpression[] => ctx.queries;

/**
 * Typed accessor for functions in a GenContext.
 *
 * @param ctx - The GenContext to query.
 * @returns All registered static functions.
 */
export const getStaticFunctions = (ctx: GenContext): readonly StaticFunction[] =>
  ctx.static_functions;

/** Finds a registered ref by typed ref identity. */
export const getRef = <R extends Ref>(ctx: GenContext, ref: R): R | undefined =>
  ctx.refs.find((registered): registered is R => refEquals(registered, ref));

/** True when a ref is present in the context registry. */
export const hasRef = (ctx: GenContext, ref: Ref): boolean => getRef(ctx, ref) !== undefined;

/** Explicit stable-ID lookup boundary for tooling, imports, and persisted IR. */
export const lookupById = (ctx: GenContext, id: StableId<string> | string): Ref | undefined =>
  ctx.refs.find((ref) => ref.id === id);

/** Validates that every referenced ref is registered in the context. */
export const checkRegisteredRefs = (
  ctx: GenContext,
  refs: readonly Ref[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const seenMissing = new Set<string>();

  for (const ref of refs) {
    if (hasRef(ctx, ref)) continue;

    const identity = refIdentity(ref);
    if (seenMissing.has(identity)) continue;
    seenMissing.add(identity);

    out.push(
      diagnostic({
        severity: "error",
        code: "ref:unregistered-ref",
        message: `Reference ${identity} is not registered in this context`,
        refs: [ref],
      }),
    );
  }

  return out;
};

/** Register metadata for a typed trait. Overwrites existing metadata. */
export const registerTraitMetadata = (
  ctx: GenContext,
  trait: string,
  metadata: TraitMetadata,
): void => {
  ctx.trait_metadata.set(trait, metadata);
};

/** Look up metadata for a trait, if registered. */
export const getTraitMetadata = (ctx: GenContext, trait: string): TraitMetadata | undefined =>
  ctx.trait_metadata.get(trait);

/**
 * Convenience accessor that aggregates GenerateResult diagnostics with context-level ones.
 *
 * @param ctx - The GenContext to collect from.
 * @returns All diagnostics across the context and its targets.
 */
export const collectAllDiagnostics = (ctx: GenContext): readonly Diagnostic[] => {
  const out = [...ctx.diagnostics];
  for (const t of ctx.targets) {
    if (t.check_result) out.push(...t.check_result.diagnostics);
    if (t.generate_result) out.push(...t.generate_result.diagnostics);
  }
  return out;
};

/**
 * Collects all artifacts from the context and its targets.
 *
 * @param ctx - The GenContext to collect from.
 * @returns All artifacts across the context and its targets.
 */
export const collectAllArtifacts = (ctx: GenContext): readonly Artifact[] => {
  const out: Artifact[] = [...ctx.artifacts];
  for (const t of ctx.targets) {
    if (t.generate_result) out.push(...t.generate_result.artifacts);
  }
  return out;
};

export type { GenerateResult };
