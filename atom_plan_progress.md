# Atom Plan Progress

Progress log for implementation work from `atom_plan.md`.

## Current Status

- **R1** static key model: implemented.
- **R2** query/action reactivity metadata: implemented.
- **R3** reactive resource and mutation IR: implemented.
- **R4** reactive graph derivation: implemented including form, event, and subscription node kinds.
- **SF1** single-flight plans: implemented.
- **T1** first reactive target: implemented for `effect-atom`.
- **T2** second reactive target: implemented for `tanstack-query`.
- Reactivity diagnostics: initial slice wired into lifecycle.
- **ROUTE1** typed app routes: implemented.
- **HYDRATE1** hydration snapshot plans: implemented.
- **SVC1** service refs and requirement bubbling: implemented.
- **RULE1** typed rule AST and dependency extraction: implemented.
- **AUTHZ1** rule predicates in policies: implemented.
- **AUTHZ2+** access surfaces, mutation access plans, access matrix, placement analysis: implemented.
- **CRUD1** mapping-aware writability and reactivity keys: implemented.
- **REACT1** typed reactions: implemented.
- **R-REACT** Levels 1–4 (conservative, key-aware, predicate-aware, IVM stub) + diagnostics: implemented.
- UI editability integration (`editableWhen` on `FormField`): implemented.
- Standalone `rule` namespace import (`import { rule } from "gen2"`): implemented.

## Validation

- `vp test`: **49 files, 517 tests passing**.
- `vp check`: formatting passes. Remaining 7 errors + 3 warnings are **pre-existing** in `tests/include-infer.test-d.ts` and `tests/plugin-composition.test-d.ts`.

## Implemented

### R1 Static Key Model And `gen.key.*`

- Added `src/reactivity/` public module.
- Added static records: `KeyFamily`, `ReactiveKey`, `ReactiveKeyPattern`.
- Added key helpers: `defineKeyFamily`, `key`, `anyKey`, `matchKey`, `entityKeyFamily`, `collectionKeyFamily`, `customKeyFamily`.
- Added inference helpers: `InferKeyPayload`, `InferKeyFamilyInput`.
- Added `GenContext.key_families` for discoverability.
- Added `gen.key.family`, `gen.key.entity`, `gen.key.collection`, `gen.key.custom`, `gen.key.key`, `gen.key.any`, `gen.key.match`.
- Exported `reactivity` from the package root.
- Added runtime and type tests in `tests/reactivity.test.ts` and `tests/reactivity.test-d.ts`.

### R2 Query And Action Reactivity Metadata

- Added `QueryReactivity` and `ActionReactivity`.
- Added optional `reactivity.key` to `QueryFunction`.
- Added optional `reactivity.invalidates` to `ActionFunction`.
- Preserved legacy `invalidates: QueryFunction[]` on actions.
- Implemented `lowerLegacyInvalidations` in `src/function/function.ts` — lowers legacy query refs to `anyKey(family)` when the query declares `reactivity.key`.
- Added warning diagnostic `function:legacy-invalidation-without-query-key` when a legacy invalidation cannot be lowered.
- Added targeted helpers: `InferQueryInput`, `InferQueryOutput`, `InferQueryErrors`, `InferActionInput`, `InferActionOutput`, `InferActionErrors`.
- Added tests for query key metadata, invalidation lowering, missing-key diagnostics, and helper inference.

### R3 Reactive Resource And Mutation IR

- Added `ResourceState`, `RefreshPlan`, `InvalidationPlan`, `ReactiveResource`, and `ReactiveMutation`.
- Added helpers: `refreshManual`, `refreshOnMount`, `refreshOnInvalidate`, `refreshInterval`, `invalidates`, `defineReactiveResource`, `defineReactiveMutation`.
- Added inference helpers: `InferResourceInput`, `InferResourceValue`, `InferResourceState`, `InferMutationInput`, `InferMutationOutput`, `InferMutationErrors`.
- Added `GenContext.reactive_resources` and `GenContext.reactive_mutations`.
- Added `gen.reactivity.resource`, `gen.reactivity.mutation`, `gen.reactivity.invalidates`, and `gen.reactivity.refresh.*`.
- Kept reactive resources separate from API `Resource` by using `reactive_resources` / `reactive_mutations` in context.
- Added runtime and type tests for reactive resources and mutations.

### R4 Reactive Graph Derivation

- Added `ReactiveGraph`, `ReactiveGraphNode`, and `ReactiveGraphEdge`.
- Added node kinds: `entity`, `key_family`, `query_function`, `action_function`, `resource`, `mutation`, `route`, `app_route`, `form`, `event`, `subscription`.
- Added edge kinds: `reads`, `writes`, `invalidates`, `binds`, `emits`, `subscribes`.
- Added `deriveReactiveGraph(ctx)`.
- Added `gen.reactivity.graph(ctx)`.
- Derived key family nodes from `ctx.key_families` and from reactivity metadata references.
- Derived query nodes and `query -> key` read edges from `QueryFunction.reactivity.key`.
- Derived action nodes and `action -> key` invalidation edges from `ActionFunction.reactivity.invalidates`.
- Derived entity nodes and `action -> entity` write edges from action write operations.
- Derived resource nodes and `resource -> query` binding edges from `ctx.reactive_resources`.
- Derived mutation nodes, `mutation -> action` binding edges, and `mutation -> key` invalidation edges from `ctx.reactive_mutations`.
- Derived route nodes and route-to-query/action binding edges from `ctx.routes`.
- Derived app route nodes and edges from `ctx.app_routes`.
- Derived form nodes and `form -> action` `binds` edges from `ctx.forms`.
- Derived event nodes and `action -> event` `emits` edges from `ctx.events` / `ctx.event_emissions`.
- Derived subscription nodes and `subscription -> event` `subscribes` edges from `ctx.subscriptions`.
- Added `affectedResourcesForMutation`, `affectedRoutesForMutation`, `affectedKeysForMutation`, `staleQueriesForKeys`, `affectedFormsForMutation`, `affectedSubscriptionsForMutation`.
- Added `entitiesWrittenByAction`, `entitiesWrittenByMutation`, `actionsWritingEntity`, `mutationsWritingEntity`.
- Added `reactiveGraphArtifact(graph, path)` for deterministic JSON graph artifact output.
- Wired all helpers into `gen.reactivity.*`.
- Added deterministic graph derivation and impact-query tests in `tests/reactivity.test.ts`.

### SF1 SingleFlight Plans

- Added `LoaderBundle`, `MutationRefreshPlan`, and `SingleFlightPlan` IR types.
- Added `deriveSingleFlightPlan(ctx, graph)` that bundles each mutation with affected routes and resources.
- Added `gen.reactivity.singleFlight(ctx, graph)`.
- Added SingleFlight plan derivation test in `tests/reactivity.test.ts`.

### T1 Effect-Atom Target

- Added `src/reactivity/targets/effect-atom.ts` with `generateEffectAtomArtifacts(graph)`.
- Generates placeholder `Atom.make` resources and `Atom.writable` mutations with refresh calls.
- Emits `effect-atom:unsupported-feature`, `effect-atom:missing-query`, `effect-atom:missing-action` diagnostics.
- Added `createEffectAtomTargetPlugin()` that contributes an `effect-atom` target accepting `reactive_graph` inputs.
- Added target generation test in `tests/reactivity.test.ts`.

### T2 TanStack Query Target

- Added `src/reactivity/targets/tanstack-query.ts` with `generateTanstackQueryArtifacts(graph)`.
- Resources lower to `queryOptions({ queryKey, queryFn })` with `queryKey` derived from the bound key family (falls back to the query function name when no key is declared).
- Mutations lower to factories taking a `QueryClient` that call the bound action and `queryClient.invalidateQueries({ queryKey })` for each invalidated key family.
- Emits `tanstack-query:unsupported-feature`, `tanstack-query:missing-query`, and `tanstack-query:missing-action` diagnostics.
- Added `createTanstackQueryTargetPlugin()` that contributes a `tanstack-query` target accepting `reactive_graph` inputs.
- Added a target generation test in `tests/reactivity.test.ts`.

### Reactivity Diagnostics Slice

- Added `checkReactivity({ key_families, reactive_resources, reactive_mutations })` in `src/reactivity/reactivity.ts`.
- Emits diagnostic codes from spec section 0.7: `reactivity:duplicate-key-family`, `reactivity:resource-source-not-query`, `reactivity:mutation-source-not-action`, plus `reactivity:duplicate-resource-name` and `reactivity:duplicate-mutation-name`.
- Registered as a built-in module checker in `registerBuiltInModuleCheckers` so reactivity invariants are validated alongside entities, events, and UI.
- Added runtime tests for each diagnostic code in `tests/reactivity.test.ts`.

### ROUTE1 Typed App Routes

- `AppRoute` IR with typed `path_params`, `query_params`, `hash_params` schemas (`SemanticType`) — separate from `src/api/Route` which stays HTTP-only.
- `defineAppRoute({ path, params, loaders, action, error })` registers into `ctx.app_routes` via `gen.router.route`.
- `checkAppRoute` validates path template parameters against `path_params` schema; emits `router:path-param-missing-schema` (error) and `router:path-param-unused-schema` (warning).
- `deriveReactiveGraph` now walks `ctx.app_routes` and derives `app_route` nodes with `binds` edges to query/resource loaders and action/mutation actions.
- `affectedRoutesForMutation` includes `app_route` nodes so SF1 and stale-query analysis cover app routes.
- Added typed navigation helper `gen.router.link(route, params)` that fills path parameters into a concrete path.
- Registered app route checker in `registerBuiltInModuleCheckers`.
- Exported `router` namespace from package root.
- Added runtime tests in `tests/router.test.ts`.

### HYDRATE1 Hydration Snapshots

- `HydrationSnapshot` IR: `{ kind: "hydration_snapshot", route_path, keys, loaders }`.
- `deriveHydrationPlan(ctx, route)` extracts reactive keys from query/resource loaders on an app route.
- `hydrationSnapshotArtifact(snapshot, path?)` produces a JSON artifact with a sanitized file path.
- Wired into `gen.hydration.plan(route)` and `gen.hydration.artifact(plan)` via `HydrationNamespace`.
- Added runtime tests in `tests/hydration.test.ts`.

### SVC1 Services

- `MethodRef<In, Out>` and `ServiceRef<Methods>` IR records. Stored in `ctx.services`.
- `gen.services.define({ name, methods })` registers a `ServiceRef`.
- `gen.services.method({ name, input_type, output_type })` defines a typed method reference.
- Added `requirements: readonly Requirement[]` to `QueryFunction` and `ActionFunction` interfaces and their constructors.
- `deriveModuleGraph(ctx)` bubbles requirements through resources, mutations, app routes, and forms; reports unresolved required services per node.
- Diagnostic `services:missing-provider` when a derived requirement has no matching `ServiceRef`.
- Registered `checkServices` as a built-in module checker.
- Exported `services` namespace from package root.
- Added runtime tests in `tests/services.test.ts`.

### RULE1 Typed Rule AST And Dependency Extraction

- `Rule<Name, Vars>` IR with `kind: "rule"`, typed `vars`, and boolean `body`.
- `RuleExpr` discriminated union: `RuleLiteralExpr`, `RuleVarExpr`, `RuleFieldExpr`, `RuleEqExpr`, `RuleCompareExpr`, `RuleAndExpr`, `RuleOrExpr`, `RuleNotExpr`, `RuleExistsExpr`.
- `RuleDependencies` with `entities`, `fields`, `relations`, `variables`.
- Constructors: `gen.rule.define`, `gen.rule.literal`, `gen.rule.var`, `gen.rule.field`, `gen.rule.eq`, `gen.rule.compare`, `gen.rule.and`, `gen.rule.or`, `gen.rule.not`, `gen.rule.exists`.
- `extractRuleDependencies(rule)` walks the AST and collects dependencies without executing runtime code.
- `checkRules(rules)` diagnostics: `rules:duplicate-rule-name`, `rules:unknown-variable`, `rules:non-boolean-body`, `rules:unsafe-negation`.
- Registered `checkRules` as a built-in module checker.
- Exported `rules` namespace and standalone `rule` object from package root.
- Added runtime tests in `tests/rules.test.ts`.

### AUTHZ1 Rule Predicates In Policies

- Added optional `predicate?: Rule` field to `Policy` interface.
- Updated `definePolicy` to accept optional `predicate` input.
- Updated `checkAuthz` to accept `entities` parameter and validate rule-backed policy dependencies via `extractRuleDependencies`.
- Diagnostic `authz:rule-dependencies-missing` when a policy's rule predicate depends on an entity not present in the passed `entities` list.
- `lifecycle.check` now passes `ctx.entities` to `checkAuthz`.
- Tests in `tests/authz-rules.test.ts`.

### AUTHZ2+ Access Surfaces, Mutation Plans, Matrix, And Placement

- Added `src/authz/surface.ts` with 14 typed access surface kinds (`entity.read`, `entity.create`, `entity.update`, `entity.delete`, `field.read`, `field.write`, `relation.read`, `relation.link`, `relation.unlink`, `action.execute`, `query.filter`, `route.enter`, `form.submit`, `ui.hint`).
- Added `AccessSurfaceBinding<S>`, `DenyBehavior`, `Placement`, `PlacementKind`, `AccessMatrix`, `AccessMatrixEntry`.
- Narrow constructors: `entityRead`, `entityCreate`, `entityUpdate`, `entityDelete`, `fieldRead`, `fieldWrite`, `relationRead`, `relationLink`, `relationUnlink`, `actionExecute`, `queryFilter`, `routeEnter`, `formSubmit`, `uiHint`.
- `deriveDefaultDeny(surface)` returns surface-appropriate deny behavior.
- `gen.authz.surface.*` wired into namespace.
- Added `src/authz/mutation-plan.ts` with `MutationAccessPlan<In, Out>`, `deriveMutationAccessPlan(action, policies)`, and `checkMutationAccessPlans(ctx)`.
- Added `src/authz/matrix.ts` with `deriveAccessMatrix`.
- Added `src/authz/placement.ts` with `classifyPlacement(surface, policy)` and `checkPlacement({ policies })`.
- Placement diagnostics: `authz:unsafe-list-post-filter`, `authz:list-policy-not-placeable`, `authz:write-policy-needs-before-state`.
- `checkAuthz` calls `checkPlacement`; `lifecycle.check` calls `checkMutationAccessPlans`.
- Tests in `tests/authz2-*.test.ts` (7 test files).

### REACT1 Reactions

- `Reaction<Name, In, Out>` IR with `kind: "reaction"`, `when: Rule`, `run: ActionFunction`, `mode: ReactionMode`, `idempotency?: IdempotencyPlan`, `delivery?: DeliveryPlan`.
- Reaction modes: `on_true`, `on_transition_true`, `on_insert_match`, `on_update_match`, `on_delete_match`, `maintain`.
- `gen.reaction.define(...)` constructor. Stores reaction in `ctx.reactions`.
- `checkReactions` diagnostics: `reaction:duplicate-name`, `reaction:condition-not-boolean`, `reaction:run-not-action`, `reaction:missing-idempotency-key` (warning), `reaction:side-effect-without-delivery-plan` (warning).
- Registered `checkReactions` as a built-in module checker.
- Exported `reaction` namespace from package root.
- Added runtime tests in `tests/reaction.test.ts`.

### R-REACT Rule-Derived Reactivity (Levels 1–4)

- `DerivedInvalidationPlan` with `precision: "broad" | "matched" | "exact" | "patchable"` and `confidence: "conservative" | "proven"`.
- `RuleKeyDependency` and `IvmMaintenancePlan` (stub with `deltaMode: "unsupported"`).
- `deriveRuleInvalidationPlans(ctx)` analyzes action write-sets and rule read-sets.
- Level 2 (`matched`) when mutation has a limiting condition.
- Level 3 (`patchable`) when a simple equality rule reads exactly one field and the mutation writes only that field.
- Level 4 (`ivm`) stub: `deriveIvmPlans(ctx)` marks rules with negation/disjunction as unsupported.
- `checkRuleReactivity(ctx)` lifecycle checker emits:
  - `rules-reactivity:mutation-writes-rule-dependency` (info)
  - `rules-reactivity:broad-invalidation-selected` (warning)
  - `rules-reactivity:cross-store-rule-dependency` (warning)
  - `rules-reactivity:time-dependent-rule` (warning)
  - `rules-reactivity:dependency-not-extractable` (info)
  - `rules-reactivity:affected-set-unknown` (warning)
  - `rules-reactivity:ivm-delta-unsupported` (warning)
- Registered as a built-in module checker.
- Tests in `tests/rules-reactivity.test.ts` and `tests/rules-reactivity-depth.test.ts`.

### UI Editability Integration

- Added `editableWhen?: Rule` to `FormField` interface.
- `defineFormField` accepts optional `editableWhen` parameter.
- `gen.forms.field(source_field, widget?, label?, editableWhen?)` passes it through.
- Added `deriveEditableFieldsForRule(rule)` and `deriveEditabilityRulesForField(field, rules)`.
- Wired into `gen.reactivity.editableFields` and `gen.reactivity.editabilityRules`.

### CRUD1 Mapping-Aware Writability And Reactivity Keys

- Added `deriveWritableInput(entity, mapping?)` that filters out non-writable, hidden, server-only, and read-only fields.
- `pickWritableFields` now respects `options.mapping` when provided.
- `DeriveCrudOptions` accepts optional `mapping`, `getByIdKey`, `listKey`, and `invalidates`.
- `bindDeriveCrud` automatically creates and registers entity/collection key families for `getById` and `list` queries when not explicitly provided.
- Generated CRUD `getById` / `list` queries receive `reactivity.key` (entity / collection key families).
- `checkCrud` updated to accept `mappings` parameter and validates mapping-aware constraints:
  - `crud:hidden-field-exposed`
  - `crud:server-only-field-exposed`
  - `crud:field-not-writable`
- `lifecycle.check` passes `ctx.mappings` to `checkCrud`.
- Tests in `tests/crud1.test.ts`.

## Still Needs Doing

### Missing Reactivity Primitives

- `ResourceAll` and `ResourceChain` composition are **not implemented**.
- `KeyExpression<Input, Key>` and `KeyPatternExpression<Input, Pattern>` wrapper types are **not implemented** — the current API accepts `KeyFamily | ReactiveKey` directly in `QueryReactivity.key`.
- `OptimisticPlan` IR with explicit apply, rollback, reconcile, fallback, and diagnostics is **not implemented**.
- Remaining 0.7 diagnostics needing AST inspection:
  - `reactivity:key-payload-mismatch`
  - `reactivity:key-match-unknown-field`
  - `reactivity:query-key-output-invalid`
  - `reactivity:invalidates-output-invalid`
  - `reactivity:raw-key-not-portable`

### Graph Derivation Gaps

- Graph derivation for `ui_component`, `store`, and `runtime_boundary` node kinds is **not implemented** (only `form`, `event`, `subscription` were added).
- `gen.reactivity.target.effectAtom()` / `gen.reactivity.target.tanstackQuery()` ergonomic plugin-factory wrappers are **not implemented**.
- Third reactive target (TBD) is **not implemented**.

### Routing Gaps

- Route error boundaries typed against declared function errors are **not implemented**.
- Exhaustive error boundary checking is **not implemented**.

### Rules And Authz Gaps

- Rule evaluation planner classifications (database predicate, RLS, server pre-query, server integrated query, server post-filter, client hint, materialized/IVM, external) are **not implemented in the rules module** — only `authz/placement.ts` has placement analysis for access surfaces.
- SQL predicate translation for rules is **not implemented**.
- RLS placement for rules is **not implemented**.
- Client-hint modes (exact, sound-allow, sound-deny, best-effort, disabled) are **not implemented**.
- Field-level auth transition policies (`before -> after`) are partially stubbed in mutation-plan but not fully wired.

### Services Gaps

- Scoped cleanup, finalizers, and target-specific provider codegen are **not implemented**.
- `Module` and `Layer` IR are **not implemented**.

### Reactions Gaps

- Full reaction compiler, outbox/job queue codegen, IVM maintenance plan generation are **deferred**.
- Diagnostics `reaction:input-selection-mismatch`, `reaction:transition-boundary-unknown`, `reaction:unsafe-inline-effect`, `reaction:target-unsupported-delivery`, `reaction:unbounded-trigger-scan` are **not implemented**.

### R-REACT Deferred Depth

- `external-service-rule` diagnostic (needs service-call-backed mapping detection).
- `opaque-rule-not-reactive` diagnostic (needs opaque JS function detection in rules).
- Full IVM delta computation for monotonic rules.
- Runtime key-value matching for Level 2 exact invalidation.
- Before/after state comparison for Level 3 true patchability.

### Phase 0 — Type System Hardening (Completed)

- **Operation discriminated union**: Already implemented; plan entry was stale.
- **`as unknown as` elimination**: Removed all broad casts from `src/gen/`. `GenPluginExtensions` now extends `Record<string, unknown>`. Added `isMaterializable` type guard. Narrowed remaining UI namespace cast.
- **Query builder performance**: Replaced O(n²) spreads with direct field mutation via internal `QueryBuilderState`. Preserved `QueryBuilder<Source, Result>` generics.
- **`bindFromEntity` closure reduction**: Replaced 9-closure wrapper with `Object.assign(builder, { build: ... })`.
- **Small fixes**:
  - `View.slots` made `readonly`.
  - `neverSemanticType` extracted to module-level singleton.
  - `defineTable` no longer mutates input `store.tables`; `defineColumn` no longer pushes to `table.columns`.
  - `acceptTargetInput` returns new target instead of casting to mutate.
  - `Target.inputs` made mutable to avoid cast; `makeTarget` parameter updated.
  - `GenContext.config` made assignable; `bindConfigEntry`/`bindConfig` reassign immutably.
- **Authz cast fix**: `definePolicy` uses narrower cast for `access_surface_bindings` assignment.

### CRUD Depth — Count + Exists

- Added `count` and `exists` optional queries to `Crud<Out>` interface.
- `deriveCrud` now generates:
  - `count`: aggregate query (`COUNT(idField)`) returning `number`
  - `exists`: query with id predicate returning `boolean`
- Both functions participate in the same lifecycle/reactivity graph as other CRUD operations.

### CRUD Deferred

- Advanced operations: `getMany`, `findOne`, `findMany`, `patch`, `upsert`.
- CRUD forms/routes/clients codegen.
- Soft-delete, versioning, relation includes, optimistic patches.
- Auto-generated CRUD invalidation that narrows beyond `collection.any()` + `entity.detail(id)`.

### Type-Safety Backlog

- Negative type tests for invalid key payloads, `.match()` with unknown fields, route param mismatches, and form field/action input mismatches should be expanded.

## Newly Identified Backlog (from in-depth review)

### Reactivity Primitives

- **`KeyExpression` / `KeyPatternExpression` wrappers** (§0.13.1): The spec requires these wrappers so the compiler can enforce input/output type matching and emit key-level diagnostics. Currently absent.
- **`ResourceAll` and `ResourceChain`** (§0.13.2): Parallel and dependent resource composition. Needed for `useQueries`-style generation and atom chains.
- **`OptimisticPlan` IR** (§0.13.3): Explicit apply/rollback/reconcile/fallback for optimistic mutations. Currently stubbed via `PatchFunction` only.
- **Harden reactive graph guards** (§0.13.4): `isQueryFunction` and `isActionFunction` guards are too loose (only check `name` and `body`). Should use discriminant checks.

### Architecture And Quality

- **Extract rule placement from authz into rules module** (§0.13.5): `classifyPlacement` for `RuleExpr` should live in `src/rules/`, not `src/authz/`. Keeps rules pure and reusable by query planners.
- **Compile-time negative tests for key payloads** (§0.13.6): Add `.test-d.ts` files covering invalid key payloads, unknown `.match()` fields, invalid resource mutation inputs, missing route params, and bad form field bindings.
- **Document design intent in complex modules** (§0.13.7): Add "why" comments to `rule-derived.ts` precision levels, `mutation-plan.ts` before/after states, and `placement.ts` preference ordering.
- **Unified reactivity registry** (§0.13.8): Merge `key_families`, `reactive_resources`, `reactive_mutations` into a single `ReactivityRegistry` with cross-reference invariants.

## Sequencing Heuristic

Pick from the genuine backlog top-down by user-visible value:

1. **Optimistic plans and rollback** — unlocks safer generated mutations.
2. **`ResourceAll` / `ResourceChain`** — unlocks composed loader patterns.
3. **`KeyExpression` / `KeyPatternExpression` wrappers** — aligns public API with the spec contract.
4. **Harden reactive graph guards** — low-effort safety win.
5. **Remaining reactivity diagnostics** — hardens the invariant checker.
6. **Rule evaluation planner in rules module** — enables rule placement without authz dependency.
7. **Compile-time negative tests** — prevents phantom-type regressions.
8. **Document design intent** — improves onboarding and maintenance.
9. **Unified reactivity registry** — refactor, best done after reactivity API stabilizes.
10. **CRUD forms/routes/clients** — largest user-facing integration point.
