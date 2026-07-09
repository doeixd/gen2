# R13 — Remaining GenContext Array Deletion Plan

> Status: sequencing source of truth for deleting all top-level semantic arrays from `GenContext`.
>
> Supersedes: ad-hoc array removal. Every deletion must follow the dual-write → migrate readers → delete pattern established in PRs 2–4 of the kernel rebase.
>
> Context: see `docs/revised-kernel.md`, `docs/revision/revised_phases.md` §R13.

## What is already done

The following fields have been fully migrated to `ctx.graph` and deleted from `GenContext`:

```txt
rules            -> RULE nodes + READS/HAS_VAR/HAS_BODY edges
derived_rule_views -> RULE_VIEW nodes + HAS_VAR/HAS_BODY/READS edges
key_families     -> KEY_FAMILY nodes + bridge metadata
action_functions -> ACTION nodes + WRITES/GUARDS/HAS_INPUT_TYPE/HAS_OUTPUT_TYPE edges
query_functions  -> QUERY nodes + GUARDS/HAS_INPUT_TYPE/HAS_OUTPUT_TYPE edges
```

All corresponding checkers, reactivity derivations, boundary planners, obligation graph builders, magic-string checks, debug adapters, and lifecycle registrations have been ported to graph-native iteration.

Architecture lint in `tests/architecture/genctx-fields.test.ts` enforces that no new arrays are added.

## Guiding principles

1. **Dual-write, then migrate, then delete.** Every builder that currently pushes to a legacy array must also attach the equivalent kernel node/edge before any reader is ported.
2. **No new top-level semantic arrays.** This is enforced by CI.
3. **No raw-string internal semantics.** All new node kinds, edge kinds, and traits must use `defineSymbol` / `defineTrait` / `defineNodeKind` / `defineEdgeKind` from `src/kernel/symbol.ts`.
4. **Graph-native readers before array deletion.** A field may only be removed from `GenContext` when zero `src/` files reference it.
5. **Tests follow the same pattern.** Test assertions that checked `ctx.<array>` must switch to `get<X>FromGraph(ctx.graph)` or graph node presence checks.
6. **Preserve byte-equivalent lifecycle output.** Golden tests in `tests/golden/` are the guard. Any change to diagnostic counts or artifact output must be explained and snapshot-updated deliberately.

## Grouping the remaining arrays

The remaining fields fall into natural dependency groups. Groups with fewer internal dependencies should be deleted first so that larger groups (UI, storage) can depend on them without re-introducing arrays.

### Group A — Refs and low-level primitives (no internal dependencies)

```txt
refs               -> ref registry is already graph-backed; this is a computed view
nodes              -> StaticNode array; should become graph nodes directly
```

**Why first:** `refs` and `nodes` are used by almost every other module. Once they are graph-native, other modules can look up stable identities through the graph instead of arrays.

**Migration steps:**

- `src/core/refs.ts`: `registerRefs()` already attaches refs to a side map. Evaluate whether refs should be nodes in the graph (`REF` node kind) or remain a fast lookup map. If they become nodes, add `REF` node kind and `refToKernelNode()`.
- `src/core/context.ts`: `nodes` (StaticNode) should attach as generic `STATIC` nodes or a new `CUSTOM` node kind.
- Update `tests/architecture/genctx-fields.test.ts` baseline after deletion.

**Exit criteria:**

```txt
Zero src/ readers of ctx.refs or ctx.nodes.
Ref identity lookups available via graph.nodes.get(ref.id) or equivalent.
```

---

### Group B — Events, reducers, subscriptions, reactions

```txt
events             -> EVENT nodes + EMITS edges
event_emissions    -> emission records attached to event nodes or edges
reducers           -> REDUCER nodes + REDUCES edges
subscriptions      -> SUBSCRIPTION nodes + SUBSCRIBES_TO edges
reactions          -> REACTION nodes + TRIGGERS edges
```

**Why early:** These are small, well-isolated modules with few cross-cutting readers.

**Migration steps:**

- Add `EVENT`, `REDUCER`, `SUBSCRIPTION`, `REACTION` node kinds to `src/kernel/kind.ts`.
- Add bridge builders in `src/events/kernel.ts`, `src/reaction/kernel.ts`.
- Port checkers in `src/events/checks.ts`, `src/reaction/checks.ts` to graph-native passes.
- Port `src/lifecycle/lifecycle.ts` registrations.
- Update golden tests if diagnostic codes change.

**Exit criteria:**

```txt
event/reaction/reducer/subscription checkers iterate graph nodes.
Lifecycle registrations use graph-native passes.
Tests assert graph presence, not array membership.
```

---

### Group C — Contracts, actors, contexts, requirements, providers

```txt
contracts          -> CONTRACT nodes + BINDS_TO edges
actors             -> ACTOR nodes + PLAYS_ROLE edges
contexts           -> CONTEXT nodes
context_provisions -> PROVISION edges (context -> storage location)
context_requirements -> REQUIREMENT edges (route/component -> context)
requirements       -> REQUIREMENT_REF nodes + SATISFIED_BY edges
providers          -> PROVIDER nodes + SATISFIES edges
services           -> SERVICE nodes
service_layers     -> SERVICE_LAYER nodes + COMPOSES edges
```

**Migration steps:**

- Add node kinds and edge kinds in `src/kernel/kind.ts`.
- Add bridge builders in `src/core/contract.ts`, `src/context/kernel.ts`, `src/requirements/kernel.ts`, `src/services/kernel.ts`.
- Port `checkContractsAndActors`, `checkServices`, `checkContextAndStorage`, `checkRequirements` in `src/lifecycle/lifecycle.ts`.
- Port `src/core/magic_strings.ts` checks that iterate contracts/actors.

**Exit criteria:**

```txt
Auth/contract/actor/context/provider/service checkers are graph-native.
Magic-string checks walk graph nodes.
No src/ code references ctx.contracts, ctx.actors, ctx.contexts, ctx.requirements, ctx.providers, ctx.services, ctx.service_layers.
```

---

### Group D — Storage and mapping (entities, stores, tables, columns, mappings, projections, schemas)

```txt
entities           -> ENTITY nodes + OWNS/FIELD edges (already bridged; readers remain)
stores             -> STORE nodes
tables             -> TABLE nodes + STORES edges
columns            -> COLUMN nodes + CONTAINS edges
mappings           -> MAPPING nodes + MAPS_TO edges
projections        -> PROJECTION nodes + DERIVES edges
schemas            -> SCHEMA nodes + CONTAINS edges
```

**Why after Group C:** Storage checkers (`checkStores`, `checkMappings`, `checkEntityInvariants`) depend on entity and field nodes that are already in the graph. The main work is porting readers.

**Migration steps:**

- `src/entity/kernel.ts` already bridges entities and fields. Expand it to bridge stores, tables, columns, mappings, projections, schemas.
- Port `src/storage/checks.ts`, `src/entity/checks.ts` to graph-native iteration where they still use arrays.
- Port `src/lifecycle/lifecycle.ts` storage checkers.
- Note: `ctx.entities` is heavily referenced. This will be the largest single deletion.

**Exit criteria:**

```txt
Entity/storage/mapping checkers iterate graph nodes.
No src/ code references ctx.entities, ctx.stores, ctx.tables, ctx.columns, ctx.mappings, ctx.projections, ctx.schemas.
```

---

### Group E — Relations and graphs

```txt
relations          -> RELATION nodes + RELATES edges (already bridged; readers remain)
relation_entities  -> RELATION_ENTITY nodes + RELATES edges
graphs             -> GRAPH_DEF nodes + CONTAINS edges
```

**Migration steps:**

- `src/relation/kernel.ts` already bridges relations. Expand to bridge relation_entities and graphs.
- Port `src/relation/checks.ts`, `src/lifecycle/lifecycle.ts` relation checks.
- Update `tests/relation.test.ts` to check graph instead of arrays.

**Exit criteria:**

```txt
Relation checkers iterate graph nodes.
No src/ code references ctx.relations, ctx.relation_entities, ctx.graphs.
```

---

### Group F — Functions (static, expr, predicate, patch, plan)

```txt
static_functions   -> STATIC nodes
expr_functions     -> EXPR_FUNCTION nodes
predicate_functions -> PREDICATE_FUNCTION nodes
patch_functions    -> PATCH_FUNCTION nodes
plan_functions     -> PLAN_FUNCTION nodes
```

**Migration steps:**

- `src/function/kernel.ts` already has node builders for all five. Add bridge metadata (`_bridgeStaticFunction`, etc.) and graph extraction helpers (`getStaticFunctionsFromGraph`, etc.).
- Port `src/function/checks.ts` to graph-native iteration.
- Port `src/lifecycle/lifecycle.ts` `buildFunctionCatalog` and function checkers.
- Port `src/adapters/debug.ts` counts.

**Exit criteria:**

```txt
Function checkers iterate graph nodes.
Debug counts use graph node counts.
No src/ code references ctx.static_functions, ctx.expr_functions, ctx.predicate_functions, ctx.patch_functions, ctx.plan_functions.
```

---

### Group G — Resources, routes, getters, mutators, app_routes

```txt
resources          -> RESOURCE nodes
routes             -> ROUTE nodes
app_routes         -> APP_ROUTE nodes
getters            -> GETTER nodes
mutators           -> MUTATOR nodes
```

**Migration steps:**

- Add `RESOURCE`, `ROUTE`, `APP_ROUTE`, `GETTER`, `MUTATOR` node kinds.
- Add bridge builders in `src/api/kernel.ts`, `src/router/kernel.ts`.
- Port `src/api/checks.ts`, `src/router/checks.ts`.
- Port `src/lifecycle/lifecycle.ts` route/app_route checks.
- Port `src/adapters/debug.ts` counts.

**Exit criteria:**

```txt
API/router checkers iterate graph nodes.
No src/ code references ctx.resources, ctx.routes, ctx.app_routes, ctx.getters, ctx.mutators.
```

---

### Group H — Auth and policies

```txt
policies           -> POLICY nodes + REQUIRES/TARGETS edges (already bridged; readers remain)
```

**Migration steps:**

- `src/authz/kernel.ts` already bridges policies. Most readers are in `src/authz/checks-kernel.ts` and `src/reactivity/rule-derived.ts`.
- Port any remaining `ctx.policies` readers in `src/authz/mutation-plan.ts`, `src/obligations/obligations.ts`, `src/boundary/boundary.ts`.
- Port `src/lifecycle/lifecycle.ts` auth checker registration.

**Exit criteria:**

```txt
All auth/policy checkers and planners iterate graph nodes.
No src/ code references ctx.policies.
```

---

### Group I — Reactivity (resources, mutations, registries, scopes)

```txt
reactive_resources     -> REACTIVE_RESOURCE nodes
reactive_mutations     -> REACTIVE_MUTATION nodes
resource_alls          -> RESOURCE_ALL nodes + BRANCH edges
resource_chains        -> RESOURCE_CHAIN nodes + COMPOSES edges
derived_resources      -> DERIVED_RESOURCE nodes + DERIVES edges
scoped_resources       -> SCOPED_RESOURCE nodes + SCOPES edges
reactive_runtimes      -> REACTIVE_RUNTIME nodes + USES edges
reactive_registries    -> REACTIVE_REGISTRY nodes + CONTAINS edges
tracking_scopes        -> TRACKING_SCOPE nodes + READS edges
```

**Migration steps:**

- Add node kinds and edge kinds in `src/kernel/kind.ts`.
- Add bridge builders in `src/reactivity/kernel.ts`.
- Port `src/reactivity/reactivity.ts` readers (deriveReactiveGraph, checkReactivity, etc.).
- Port `src/reactivity/targets/*.ts` readers.
- Port `src/lifecycle/lifecycle.ts` reactivity checker.

**Exit criteria:**

```txt
All reactivity derivation and target emitters use graph nodes.
No src/ code references ctx.reactive_resources, ctx.reactive_mutations, ctx.resource_alls, ctx.resource_chains, ctx.derived_resources, ctx.scoped_resources, ctx.reactive_runtimes, ctx.reactive_registries, ctx.tracking_scopes.
```

---

### Group J — UI (forms, views, components, styles, behaviors, themes, platforms, renderers, editors, lists, cruds)

```txt
forms              -> FORM nodes + DISPLAYS/EDITS/SUBMITS edges
views              -> VIEW nodes + DISPLAYS edges
components         -> COMPONENT nodes + RENDERS edges
styles             -> STYLE nodes + APPLIES_TO edges
behaviors          -> BEHAVIOR nodes + ATTACHES_TO edges
themes             -> THEME nodes + INCLUDES edges
platforms          -> PLATFORM nodes + TARGETS edges
renderers          -> RENDERER nodes + RENDERS edges
editors            -> EDITOR nodes + EDITS edges
lists              -> LIST nodes + DISPLAYS edges
cruds              -> CRUD_VIEW nodes + CONTAINS edges
```

**Why last:** UI is the largest surface area. Many UI checkers and derivations depend on entities, fields, rules, queries, actions, and policies. All of those must be graph-native first.

**Migration steps:**

- Add UI node kinds and edge kinds in `src/kernel/kind.ts`.
- Add bridge builders in `src/ui/kernel.ts`, `src/editor/kernel.ts`, `src/list/kernel.ts`.
- Port `src/ui/checks.ts`, `src/editor/checks.ts`, `src/list/checks.ts`.
- Port `src/lifecycle/lifecycle.ts` UI checkers.
- Port `src/adapters/debug.ts` counts.

**Exit criteria:**

```txt
UI checkers iterate graph nodes.
No src/ code references ctx.forms, ctx.views, ctx.components, ctx.styles, ctx.behaviors, ctx.themes, ctx.platforms, ctx.renderers, ctx.editors, ctx.lists, ctx.cruds.
```

---

### Group K — Orchestration and boundary (schedules, cron_jobs, workflows, boundary_plans, obligation_graphs, offline_commands, offline_queues)

```txt
schedules          -> SCHEDULE nodes
cron_jobs          -> CRON_JOB nodes + TRIGGERS edges
workflows          -> WORKFLOW nodes + CONTAINS edges
boundary_plans     -> BOUNDARY_PLAN nodes + CROSSES_BOUNDARY edges
obligation_graphs  -> OBLIGATION_GRAPH nodes + CONTAINS edges
offline_commands   -> OFFLINE_COMMAND nodes
offline_queues     -> OFFLINE_QUEUE nodes + STORES edges
```

**Migration steps:**

- Add node kinds and edge kinds.
- Add bridge builders in `src/orchestration/kernel.ts`, `src/boundary/kernel.ts`, `src/obligations/kernel.ts`, `src/offline/kernel.ts`.
- Port checkers in respective modules.
- Port `src/lifecycle/lifecycle.ts` registrations.

**Exit criteria:**

```txt
Orchestration/boundary/offline checkers iterate graph nodes.
No src/ code references ctx.schedules, ctx.cron_jobs, ctx.workflows, ctx.boundary_plans, ctx.obligation_graphs, ctx.offline_commands, ctx.offline_queues.
```

---

### Group L — Cross-store and lifecycle

```txt
cross_store_planners -> CROSS_STORE_PLANNER nodes
lifecycle_requirements -> LIFECYCLE_REQUIREMENT nodes
```

**Migration steps:**

- Add node kinds.
- Add bridge builders in `src/lifecycle/kernel.ts`.
- Port `checkCrossStorePlanners`, `checkCrossStoreReadComposition`, `checkCrossStoreWriteCoordinator`.

**Exit criteria:**

```txt
Cross-store checkers iterate graph nodes.
No src/ code references ctx.cross_store_planners or ctx.lifecycle_requirements.
```

---

### Group M — Config, defaults, trait_applications, state_resources, storage_locations, composable_plans

```txt
config             -> stays as-is (not a semantic array; mutable config bag)
defaults           -> DEFAULT_INSTANCE nodes + APPLIES_TO edges
trait_applications -> TRAIT_APPLICATION nodes + APPLIES_TO edges
state_resources    -> STATE_RESOURCE nodes + STORES edges
storage_locations  -> STORAGE_LOCATION nodes + PLACES edges
composable_plans   -> COMPOSABLE_PLAN nodes + CONTAINS/SEQUENCES edges
```

**Migration steps:**

- `config` is not a semantic array; it stays.
- Add node kinds for defaults, trait_applications, state_resources, storage_locations, composable_plans.
- Port `src/core/config.ts`, `src/state/checks.ts`, `src/storage/locations.ts`, `src/plan/checks.ts`.
- Port `src/lifecycle/lifecycle.ts` registrations.

**Exit criteria:**

```txt
No src/ code references ctx.defaults, ctx.trait_applications, ctx.state_resources, ctx.storage_locations, ctx.composable_plans.
```

---

## Suggested deletion order

```txt
Group A  (refs, nodes)           -> unblocks identity lookups for everything else
Group B  (events, reactions)     -> small, isolated
Group C  (contracts, actors, contexts, requirements, providers, services)
Group F  (static, expr, predicate, patch, plan functions)
Group H  (policies)              -> already bridged; mainly reader porting
Group D  (entities, stores, tables, columns, mappings, projections, schemas)
Group E  (relations, graphs)
Group G  (resources, routes, getters, mutators, app_routes)
Group K  (schedules, cron_jobs, workflows, boundary_plans, obligations, offline)
Group L  (cross_store_planners, lifecycle_requirements)
Group M  (defaults, trait_applications, state_resources, storage_locations, composable_plans)
Group I  (reactive_resources, reactive_mutations, resource_alls, resource_chains, derived_resources, scoped_resources, reactive_runtimes, reactive_registries, tracking_scopes)
Group J  (forms, views, components, styles, behaviors, themes, platforms, renderers, editors, lists, cruds)
```

UI (Group J) is intentionally last because it depends on nearly every other group.

## Per-deletion checklist

For every field removal, the PR must:

1. [ ] Add kernel node kind(s) and edge kind(s) if not already present.
2. [ ] Add bridge builder(s) in the relevant module's `kernel.ts`.
3. [ ] Dual-write in builder/binder (attach node + edges to `ctx.graph`).
4. [ ] Port all `src/` readers to graph-native iteration or extraction helpers.
5. [ ] Port `src/lifecycle/lifecycle.ts` checker registrations.
6. [ ] Update `tests/architecture/genctx-fields.test.ts` baseline.
7. [ ] Update test assertions that checked the array.
8. [ ] Run `vp test` — all pass.
9. [ ] Run `vp check` — zero errors.
10. [ ] Update `docs/revised-kernel.md` or this plan if the migration pattern changes.

## Final GenContext shape (R13 complete)

When all groups are done, `GenContext` should look like:

```ts
export interface GenContext {
  readonly plugins: Plugin[];
  readonly targets: Target[];
  readonly diagnostics: Diagnostic[];
  readonly artifacts: Artifact[];
  readonly config: Config;
  readonly status: ContextStatus;
  readonly helpers: Map<string, Record<string, unknown>>;
  readonly contributions: Map<string, PluginContributions>;
  readonly trait_metadata: Map<string, TraitMetadata>;
  readonly moduleCheckers: ((ctx: GenContext) => readonly Diagnostic[])[];
  // to be removed in R10 when Pass pipelines land
  builtInModuleCheckersRegistered: boolean;
  /** The single source of truth for all semantic state. */
  readonly graph: KernelGraph;
}
```

`plugins`, `targets`, `diagnostics`, `artifacts`, `config`, `status`, `helpers`, `contributions`, `trait_metadata`, and `moduleCheckers` are not semantic domain arrays — they are infrastructure, mutable state, or registry bookkeeping. `moduleCheckers` will be deleted in R10 when the pass pipeline replaces it.

## Exit criteria for R13

```txt
All semantic state lives in ctx.graph.
Zero top-level semantic arrays remain on GenContext.
All checkers iterate graph nodes/edges.
All target emitters consume legalized target dialect IR derived from the graph.
Architecture lint test (genctx-fields.test.ts) passes with the minimal baseline.
vp check passes.
vp test passes.
```
