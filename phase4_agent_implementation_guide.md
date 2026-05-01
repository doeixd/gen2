# Phase 4 Agent Implementation Guide: Provider Graph, State, Hydration, and Agent-Aware Outputs

This guide is a detailed handoff plan for an AI coding agent executing Phase 4 of the `gen2` domain compiler roadmap. Phase 4 builds on Phase 3's trait/lowering, context, storage, fallback, IVM, reactions, hydration, and SingleFlight work.

Treat this as an implementation plan for the remaining original vision from `docs/stuff.txt` and `spec/atom.txt`: the compiler should understand not only what the app does, but also where values come from, where they may live, how long they live, whether they may cross boundaries, how reactive state changes over time, whether optimistic/offline behavior is safe, and which tests/docs/devtools artifacts are obligated by the semantic graph.

## Primary Goal

Phase 4 makes dependency satisfaction, state placement, hydration safety, and agent-facing derivations first-class compiler concepts.

The core addition is the planning layer described in `docs/stuff.txt`:

```txt
Requirement:
  a need

Provider:
  a way to satisfy a need

StorageLocation:
  where values live

Key:
  how values/resources are addressed

StateResource:
  typed value in a storage location

Registry:
  discoverable catalog of definitions

Graph:
  dependency/placement relationships

Target:
  generated runtime interpretation
```

Phase 4 should not replace Phase 3 primitives. It should connect them into a coherent provider and placement planner.

## Atom Vision Delta

`spec/atom.txt` is clear that Effect Atom itself should not become the core abstraction. The reusable ideas are more general:

1. **Reactive resources are target-agnostic.** Atoms, TanStack Query hooks, Svelte stores, Vue composables, Solid resources, and custom caches are target interpretations of static resources.
2. **Reactive keys are typed static values.** `Atom.family` maps to stable `KeyFamily<Input>` and key expression IR.
3. **Manual invalidation is an honest boundary.** The compiler should infer invalidation where possible, but manual keys remain first-class for opaque external dependencies.
4. **Result state is semantic.** Loading, refreshing, failure, defect, and success states should be represented before target generation.
5. **Scoped lifecycle matters.** Effect Atom scopes/finalizers map to general scoped resources, lifecycle requirements, cleanup plans, and UI behavior resources.
6. **Reactive runtime is semantic.** `Atom.runtime` maps to `ReactiveRuntime`, service layers, providers, and target-specific runtime wiring.
7. **Pull/stream/infinite resources are first-class.** Pagination, streaming, and pull resources are not special hooks; they are static function/resource IR.
8. **Merge behavior is semantic metadata.** Optimistic apply, rollback, reconciliation, offline queues, patch composition, reducers, and IVM need typed merge/conflict metadata on semantic types, fields, and operations.
9. **Optimistic UI is patch semantics.** Optimistic apply, rollback, reconciliation, temp IDs, and offline queues must be static and diagnosable.
10. **Scheduled and long-running work is semantic IR.** Cron jobs and workflows should be typed, inspectable nodes that compose actions, queries, requirements, effects, retries, idempotency, invalidation, and target capability planning.
11. **Cross-boundary communication is generated from function graphs.** RPC, HTTP, WebSocket, OpenAPI, Effect RPC, queue messages, and offline commands are target interpretations of static functions/actions and transport plans.
12. **Rules can make derived dependencies visible.** Datomic-style rules should be a constrained standard package for derived facts, views, dependencies, IVM, authorization predicates, and reactivity derivation.

Phase 4 should close these expressiveness gaps enough that a future target can generate Effect Atom, TanStack Query, RPC, docs, tests, and devtools from the same IR without framework-specific source definitions.

## Current Assumptions

Before implementing Phase 4, verify the repository state. This guide assumes Phase 3 has delivered or stabilized the following:

1. Application-level nodes use `StaticNode`, traits, and lowering as the extension protocol.
2. Context references and storage locations exist as typed IR.
3. Lifecycle checks can diagnose missing context providers and unsafe storage locations.
4. Enhancement and fallback planning are explicit.
5. Rule-derived reactivity has patch plan IR for simple supported cases.
6. Reactions can lower into descriptive scheduling/outbox IR.
7. Hydration and SingleFlight have typed IR consumed by production-quality target integrations.

If any assumption is false, either complete that Phase 3 milestone first or adjust this plan with a compatibility note.

## Current Library State For Agents

This section reflects the current codebase state when this guide was updated. Re-check these files before implementation because other agents may have changed them.

### Present Seeds

1. `src/context/context.ts` defines `ContextDef<T>`, `ContextProvision<T>`, and `ContextRequirement<T>`.
2. `src/storage/locations.ts` defines `StorageLocation`, `StorageLocationKind`, `StorageCapabilities`, and predefined server/client/shared storage locations.
3. `src/core/context.ts` already has `contexts`, `context_provisions`, `context_requirements`, `storage_locations`, and `composable_plans` collections on `GenContext`.
4. `src/gen/namespaces.ts` exposes `gen.context.define`, `gen.context.provide`, `gen.context.require`, and `gen.storageLocation.*` helpers.
5. `src/plan/plan.ts` defines early `sequence_plan`, `parallel_plan`, and `fallback_plan` nodes plus a composability validator.
6. `src/reactivity/reactivity.ts` already has `ReactiveResource`, `ReactiveMutation`, `PullResource`, `InfiniteResource`, `StreamResource`, `ResourceState`, key families, key expressions, key pattern expressions, registries, tracking scopes, `SingleFlightPlan`, and an early `OptimisticPlan`.
7. `src/hydration/hydration.ts` has a descriptive `HydrationSnapshot` for app-route loaders and keys.
8. `src/rules/rules.ts` has named predicates, rule expressions, dependency extraction, SQL translation support, and placement analysis hooks.
9. `src/lifecycle/lifecycle.ts` registers many module checkers and is the correct place to wire new Phase 4 checkers through `registerModuleChecker`.

### Important Gaps

1. Context provisions are not provider IR. `ContextProvision` only says a context comes from a storage location; it does not model provider source, lifetime, scope, nested requirements, or target placement.
2. Storage capabilities are booleans, not the full sensitivity/lifetime/serialization model. Do not overfit new safety checks to these booleans alone.
3. `ctx.context_requirements` is only a manually registered collection. Requirements are not yet extracted from functions, routes, components, resources, reactions, or custom nodes.
4. No requirement satisfaction planner exists. There is no `RequirementSatisfactionPlan`, `RequirementBinding`, missing-provider diagnostic, ambiguous-provider diagnostic, or provider-cycle diagnostic.
5. No lifecycle checker currently validates context/provider/storage placement. The existence of `contexts` and `storage_locations` in `GenContext` does not mean they are checked.
6. No general `StateResource` exists. `ResourceBinding` is not a substitute; it only attaches simple backend bindings to query-backed resources.
7. Hydration is loader/key-only. It does not include context payloads, state payloads, provider bindings, safe projections, serializers, or sensitivity diagnostics.
8. Plan composition is not registered into `ctx.composable_plans` through the namespace and does not bubble requirements/effects.
9. Optimistic plans exist but lack temp ID strategy, old-value/pre-read planning, operation-law checks, safety classification, and target patch capability checks.
10. No merge strategy IR exists. Semantic types and fields cannot yet declare how values combine, conflict, invert, fold, or reconcile.
11. No offline command/queue IR exists.
12. Rules are predicate-focused, not Datalog-style derived views. There are no fact patterns, stratification checks, aggregate grouping checks, or recursion/fixpoint capability checks.
13. No schedule/cron/workflow IR exists for scheduled actions or workflow plans.
14. No boundary/transport graph exists for HTTP/RPC/WebSocket/queue/offline/hydration crossings.
15. No semantic obligation graph exists for generated tests/docs/devtools.

### Current-State Milestone Assessment

1. **REQ1**: partial implementation. Context requirement/provision exists, but RequirementRef and Provider IR are missing.
2. **REQ2**: missing. Storage locations exist, but provider sources/scopes/lifetimes do not.
3. **REQ3**: missing. No planner.
4. **PLACE1**: mostly missing. Basic storage capability helpers exist, but no sensitivity/lifetime diagnostics.
5. **STATE1**: missing. No `StateResource`.
6. **STATE2**: missing. No state graph nodes/edges.
7. **HYD1**: partial implementation. Hydration snapshots exist but are not provider-aware.
8. **HYD2**: missing. No safe projection or serialization contract layer.
9. **REACT1**: partial implementation. Key expressions and invalidations exist, but derived resources and opaque-reactivity diagnostics are missing.
10. **REACT2**: missing. No reactive runtime/scoped finalizer IR.
11. **MERGE1**: missing. No typed merge strategies or type/field merge metadata.
12. **MERGE2**: missing. No merge-aware patch, reducer, optimistic, or entity planning.
13. **OPT1**: partial implementation. Early optimistic plan exists; full safety/rollback/reconcile semantics are missing.
14. **OFF1**: missing.
15. **RULE1**: partial implementation. Predicate rules exist; constrained Datalog-like views are missing.
16. **PLAN1**: partial implementation. Sequence/parallel/fallback exists; richer combinators are missing.
17. **PLAN2**: missing. No requirement/effect bubbling.
18. **ORCH1**: missing. No schedule/cron job IR.
19. **ORCH2**: missing. No workflow plan IR.
20. **BOUND1**: missing.
21. **OBL1**: missing.
22. **OBL2**: missing.
23. **TARGET1**: missing for Phase 4 provider/state/hydration lowering.
24. **TARGET2**: missing.

## Agent Implementation Notes

### First Slice Recommendation

Start Phase 4 with the smallest useful provider-planning slice:

1. Add `src/requirements/requirements.ts` or a similarly focused module. Do not overload `src/context/context.ts` with the whole provider model.
2. Define `RequirementRef`, `Provider`, `ProviderSource`, `ProviderLifetime`, `RequirementBinding`, and `RequirementSatisfactionPlan`.
3. Add `requirements` and `providers` collections to `GenContext` only if no existing collection can represent them cleanly. Prefer explicit collections over hiding providers inside `context_provisions`.
4. Add raw constructors first, then binders, then namespace exposure.
5. Add `deriveRequirementSatisfactionPlan(ctx)` before adding target code.
6. Add lifecycle diagnostics for missing provider, ambiguous provider, and provider cycle.
7. Run `vp check` and `vp test` before touching hydration, state, or targets.

### Do Not Duplicate Existing Seeds

1. Do not create a second storage-location model. Extend `src/storage/locations.ts` or add companion types that reference `StorageLocation`.
2. Do not create a second key model. Use existing `KeyFamily`, `KeyExpression`, and `ReactiveKeyPattern`.
3. Do not create a second resource model for query-backed resources. Add `StateResource` only for non-query typed state.
4. Do not create a second plan namespace. Extend `src/plan/plan.ts` and `gen.plan`.
5. Do not create framework-specific provider concepts in core. React Context, Effect Layer, atom runtime, and query client are target interpretations.

### Preferred File Placement

Use focused modules so future agents can find things:

1. Requirement/provider IR: `src/requirements/requirements.ts`, with `src/requirements/index.ts`.
2. Provider lifecycle/checking: either same module or `src/requirements/checks.ts` if it grows.
3. State resources: `src/state/state.ts`, with `src/state/index.ts`, unless maintainers prefer folding into `src/reactivity`.
4. Hydration projections: `src/hydration/hydration.ts` until it becomes large, then split to `src/hydration/projection.ts`.
5. Boundary transport: `src/boundary/boundary.ts` or `src/transport/transport.ts`.
6. Semantic obligations: `src/obligations/obligations.ts`.

### Type Design Requirements

1. Every first-class typed IR value needs a phantom type slot, usually `_value?: T`, `_input?: In`, `_output?: Out`, `_payload?: Payload`, or `_ts?: Ts`.
2. Constructors must return narrow branch types, not broad unions.
3. Prefer discriminated unions for variant-heavy IR.
4. Use literal unions for diagnostic codes, provider source kinds, lifetimes, sensitivity, transport kinds, and safety classifications.
5. Namespace object methods must use `typeof actualFunction` signatures where possible so generics are preserved.
6. Tests and end-user examples must not require casts.

### Checker Integration Pattern

Follow the existing lifecycle pattern:

1. Implement a pure checker or planner function in the feature module.
2. Return `readonly Diagnostic[]` or a plan containing diagnostics.
3. Register it in `registerBuiltInModuleCheckers(ctx)` with `registerModuleChecker(ctx, (ctx) => checkX(ctx))`.
4. Keep diagnostics stable and literal-coded.
5. Prefer adding tests for the checker directly and through lifecycle if both paths exist.

### Testing Guidance

Add tests in the smallest meaningful increments:

1. Type inference tests for public constructors and namespace methods.
2. Runtime/unit tests for planner output shape.
3. Lifecycle tests for diagnostics.
4. Target conformance tests only after IR and diagnostics are stable.
5. Avoid broad snapshot tests until the IR shape has stabilized.

### Naming Guidance

Use consistent names from this guide:

1. `RequirementRef`, not `DependencyRef`, for abstract needs.
2. `Provider`, not `Resolver`, for ways to satisfy requirements.
3. `ProviderSource`, not `ProviderKind`, for where a value comes from.
4. `ProviderLifetime`, not `Scope`, for temporal validity. Use `ProviderScope` for dimensions such as tenant/actor/route.
5. `StateResource`, not `ClientState`, because state may be server, client, shared, or hydrated.
6. `BoundaryCallPlan`, not `RpcPlan`, because HTTP/RPC/WebSocket/queue/offline are all interpretations.

## Critical Rules for the Agent

1. Do not create a vague universal abstraction such as `ContextStoreThing`. Keep Requirement, Provider, StorageLocation, StateResource, Key, and Target distinct.
2. Keep public constructors narrow and inference-friendly. End users should not need explicit type arguments for normal context, provider, or state definitions.
3. Do not add `as unknown as`, `as any`, or `as never` in tests, examples, or public API paths.
4. Do not treat runtime framework choices as source of truth. React Context, Effect Layers, query caches, URL state, and request context are target interpretations of semantic IR.
5. Prefer diagnostics over silent fallback. If a value cannot be provided, hydrated, serialized, persisted, logged, or exposed safely, emit an actionable diagnostic.
6. Keep every milestone independently checkable with `vp check` and `vp test`.
7. Do not modify production generators before the corresponding IR contract and lifecycle diagnostics have tests.
8. Preserve target agnosticism. A React interpretation must not leak into the core provider/state model.

## Recommended Milestone Order

1. **REQ1: Requirement References and Provider IR**
2. **REQ2: Provider Sources, Scopes, and Lifetimes**
3. **REQ3: Requirement Satisfaction Planner**
4. **PLACE1: Sensitivity, Boundary, and Lifetime Diagnostics**
5. **STATE1: General StateResource IR**
6. **STATE2: State Keys, Storage Bindings, and Reactive Edges**
7. **HYD1: Provider-Aware Hydration Planning**
8. **HYD2: Safe Projection and Serialization Contracts**
9. **REACT1: Static Reactive Expressions and Derived Resources**
10. **REACT2: Reactive Runtime, Scoped Resources, and Lifecycle Cleanup**
11. **MERGE1: Typed Merge Strategy and Conflict Metadata**
12. **MERGE2: Merge-Aware Patch, Reducer, and Entity Planning**
13. **OPT1: Optimistic Patch, Rollback, and Reconciliation IR**
14. **OFF1: Offline Commands, Queues, and Replay Semantics**
15. **RULE1: Constrained Rule/View Dependency Package**
16. **PLAN1: Generic Trait-Based Plan Composition**
17. **PLAN2: Requirement and Effect Bubbling Through Plans**
18. **ORCH1: Schedule and Cron Job IR**
19. **ORCH2: Basic Workflow Plan IR**
20. **BOUND1: Boundary, Transport, and Runtime Placement Graph**
21. **OBL1: Semantic Obligation Graph for Tests and Docs**
22. **OBL2: Test/Docs/Devtools Target Fixtures**
23. **TARGET1: Provider Lowering Fixture Targets**
24. **TARGET2: Production Target Integration Plan**

---

## Milestone REQ1: Requirement References and Provider IR

### Problem

The current IR can describe functions, resources, services, context, and storage, but it lacks one canonical model for how abstract needs are satisfied. Without that, targets cannot reliably generate DI wiring, app shells, mocks, route providers, or hydration boundaries.

### Target Design

Add first-class `RequirementRef` and `Provider` IR. A requirement is an abstract need. A provider supplies that need from a static source. Providers are discoverable, typed, and checkable.

### Implementation Steps

1. Inspect existing `Requirement`, `ServiceRef`, `ContextRef`, and context/storage modules before editing.
2. Define `RequirementRef<Name, Value>` or equivalent with:
   - `kind: "requirement_ref"`
   - `name`
   - `value_type: SemanticType<Value>` or a reference to an existing typed context/service
   - optional sensitivity metadata
   - optional default placement constraints
   - phantom `_value?: Value`
3. Define `Provider<Name, Value>` with:
   - `kind: "provider"`
   - `name`
   - `provides`
   - `source`
   - `placement`
   - optional `storage`
   - optional `lifetime`
   - optional `scope`
   - optional nested `requires`
   - phantom `_value?: Value`
4. Model `provides` so a provider can satisfy a `RequirementRef`, `ContextRef`, or `ServiceRef` without erasing the provided value type.
5. Add raw constructors before namespace exposure.
6. Add a binder that registers providers into `GenContext`.
7. Add `ctx.providers` and `ctx.requirements` only if the existing context cannot represent them cleanly.
8. Add `gen.requirement.define` and `gen.provider.define` only after type inference is verified.

### Acceptance Criteria

1. A test can define `CurrentActor` as a typed requirement/context and a provider for it without explicit generic arguments.
2. Provider value types are inferred from the provided requirement/context/service.
3. Providers are registered in `GenContext` and visible to lifecycle checks.
4. No tests need casts.
5. `vp check` and `vp test` pass.

---

## Milestone REQ2: Provider Sources, Scopes, and Lifetimes

### Problem

A provider is only useful if the compiler knows where its value comes from and how long it is valid. The original vision calls out cookies, headers, route params, env vars, service constructors, hydration snapshots, client storage, and reactive resources as distinct provider sources.

### Target Design

Provider source, scope, and lifetime are typed discriminated unions. They are static descriptions, not opaque callbacks, wherever portability matters.

### Implementation Steps

1. Define `ProviderSource<Value>` as a discriminated union. Include the required source kinds:
   - `static_value`
   - `env_var`
   - `request_header`
   - `cookie`
   - `route_param`
   - `query_param`
   - `hydration_snapshot`
   - `client_storage`
   - `reactive_resource`
   - `service_constructor`
2. For sources that need static typing, carry a `SemanticType<Value>` or infer it from the referenced context/resource/service.
3. Define `ProviderLifetime` as a literal union:
   - `global`
   - `app`
   - `request`
   - `session`
   - `tenant`
   - `route`
   - `component`
   - `workflow_run`
   - `job_run`
   - `transaction`
   - `test`
4. Define `ProviderScope` as a typed record with optional dimensions such as tenant, actor, route, component, and transaction.
5. Add constructors for common provider sources with narrow return types.
6. Do not add async runtime callbacks as the primary portable source representation. If escape hatches are needed, mark them as target-specific or opaque and emit limited portability diagnostics.

### Acceptance Criteria

1. Provider sources are discriminated unions, not untyped strings.
2. Lifetimes are typed literal unions.
3. Tests cover cookie, route param, env var, client storage, and reactive resource providers.
4. Opaque provider sources are visibly marked as less portable.
5. `vp check` and `vp test` pass.

---

## Milestone REQ3: Requirement Satisfaction Planner

### Problem

The compiler needs to solve the requirement graph: every node declares needs, every provider supplies values, and targets need to know whether the graph is satisfiable for a placement.

### Target Design

Add a planner that derives a `RequirementSatisfactionPlan` from `GenContext`. It should collect requirements from functions, resources, routes, components, reactions, custom nodes, and provider dependencies, then match them against providers.

### Implementation Steps

1. Define `RequirementSatisfactionPlan` with:
   - `kind: "requirement_satisfaction_plan"`
   - `requirements`
   - `providers`
   - `bindings`
   - `missing`
   - `ambiguous`
   - `diagnostics`
2. Define `RequirementBinding` with:
   - `requirement`
   - `provider`
   - `consumer`
   - `placement`
   - `confidence: "exact" | "compatible" | "fallback"`
3. Add requirement extraction helpers for built-in nodes first:
   - query functions
   - action functions
   - reactive resources
   - routes/app routes
   - UI components/forms/views where requirements exist
   - reactions
   - custom `ctx.nodes` with `requires` trait/metadata
4. Implement matching by stable identity first, then compatible semantic type if explicitly allowed.
5. Detect missing providers.
6. Detect ambiguous providers for the same requirement and placement.
7. Detect provider dependency cycles.
8. Register lifecycle diagnostics through the existing module checker pattern.

### Acceptance Criteria

1. A route requiring `CurrentActor` binds to a cookie/session provider.
2. A component requiring `Theme` binds to a client provider.
3. Missing providers produce `requirement:missing-provider`.
4. Ambiguous providers produce `requirement:ambiguous-provider`.
5. Provider cycles produce `requirement:provider-cycle`.
6. `vp check` and `vp test` pass.

---

## Milestone PLACE1: Sensitivity, Boundary, and Lifetime Diagnostics

### Problem

The original vision requires the compiler to prevent mistakes such as leaking secrets to clients, hydrating non-serializable services, persisting request-only data globally, or logging regulated values.

### Target Design

Add explicit sensitivity, boundary, serialization, persistence, and lifetime diagnostics over the requirement/provider/storage graph.

### Implementation Steps

1. Define `Sensitivity` as a literal union:
   - `public`
   - `user`
   - `tenant`
   - `auth`
   - `secret`
   - `server_only`
   - `regulated`
2. Define boundary capability predicates over storage locations and provider sources:
   - client-readable
   - server-only
   - persistent
   - serializable
   - encrypted
   - loggable
   - devtools-visible
3. Add diagnostic rules:
   - `placement:secret-client-readable`
   - `placement:server-only-client-provider`
   - `placement:nonserializable-hydration`
   - `placement:lifetime-escape`
   - `placement:request-value-global-cache`
   - `placement:regulated-devtools-exposure`
4. Implement a lifetime ordering or compatibility matrix. For example, `request` must not escape to `global`; `transaction` must not escape to `session`; `component` should not satisfy `app` unless explicitly promoted.
5. Add tests for each diagnostic class.

### Acceptance Criteria

1. Sensitive/auth/secret context cannot be placed in unsafe client storage without diagnostics.
2. Request lifetime values cannot be captured by app/global providers.
3. Non-serializable providers cannot be included in hydration snapshots.
4. Diagnostics include the requirement, provider, storage location, and suggested fix.
5. `vp check` and `vp test` pass.

---

## Milestone STATE1: General StateResource IR

### Problem

Not all application state is query data. The original vision includes URL search params, preferences, form drafts, wizard progress, offline queues, pending mutations, route params, and expanded UI state as typed, addressable resources.

### Target Design

Add `StateResource<T, K>` as a first-class typed IR for client/server state that may be keyed, stored, hydrated, observed, and provided.

### Implementation Steps

1. Define `StateResource<Value, KeyPayload>` with:
   - `kind: "state_resource"`
   - `name`
   - `value_type`
   - optional `key_family`
   - `storage`
   - optional `default`
   - `readable_by`
   - `writable_by`
   - optional `reactivity`
   - optional `sensitivity`
   - optional `lifetime`
   - phantom `_value?: Value`
   - phantom `_key?: KeyPayload`
2. Add storage bindings for common state locations:
   - client memory
   - URL search params
   - localStorage
   - sessionStorage
   - query cache
   - atom store
   - server request context
   - shared hydration snapshot
3. Add `gen.state.define` only after raw constructors and binders preserve inference.
4. Make state resources optionally provide requirements/contexts.
5. Add tests for theme state, route filter state, draft form state, and pending mutation/offline queue state.

### Acceptance Criteria

1. `gen.state.define` infers value type from `SemanticType` without explicit generics.
2. State resources can be keyed and stored in typed storage locations.
3. State resources can satisfy requirements through provider bindings.
4. Unsafe state placement emits diagnostics from `PLACE1`.
5. `vp check` and `vp test` pass.

---

## Milestone STATE2: State Keys, Storage Bindings, and Reactive Edges

### Problem

State resources need to participate in the same key/reactivity graph as queries and resources. Otherwise UI state and server data remain separate systems.

### Target Design

State resources are keyed, observable, writable, and connected to graph edges. Route loaders, forms, components, and mutations can read/write state resources and invalidate or refresh dependents.

### Implementation Steps

1. Extend reactive graph derivation to include `StateResource` nodes.
2. Add graph edges:
   - state resource reads key
   - component/form/route reads state
   - action/mutation writes state
   - state hydrates into client boundary
   - provider supplies requirement from state
3. Add storage binding checks:
   - URL search param state must be serializable.
   - localStorage/sessionStorage state must be serializable and client-readable safe.
   - query cache state must have a key family.
   - server request context state must not be read directly by client components unless hydrated safely.
4. Add tests for route filter URL state and form draft local state.
5. Ensure existing reactive graph snapshots remain stable except for intentional new nodes when state resources are registered.

### Acceptance Criteria

1. State resources appear in the reactive graph.
2. Reads/writes/hydration/provider edges are represented.
3. Storage binding diagnostics catch non-serializable or unsafe state.
4. Existing query/action/resource graph behavior is preserved.
5. `vp check` and `vp test` pass.

---

## Milestone HYD1: Provider-Aware Hydration Planning

### Problem

Hydration snapshots currently describe route loader needs, but the original vision requires hydration to include safe context, state, and provider values across the server-client boundary.

### Target Design

Hydration planning consumes routes, resources, state resources, providers, storage locations, sensitivity metadata, and the requirement satisfaction plan.

### Implementation Steps

1. Extend `HydrationSnapshot` or add `HydrationPlan` with:
   - route path or boundary id
   - loader payloads
   - state payloads
   - context payloads
   - provider bindings used for hydration
   - sensitivity classification
   - serialization status
   - diagnostics
2. Derive hydration needs from:
   - route loaders
   - app route providers
   - state resources marked `hydrated`
   - client requirements satisfied by server providers
3. Integrate with `RequirementSatisfactionPlan` so hydration is not guessed independently.
4. Add diagnostics for values that are required client-side but cannot be hydrated safely.
5. Add tests for safe actor snapshot, tenant route param, theme preference, and forbidden secret hydration.

### Acceptance Criteria

1. Hydration plans include provider/context/state payloads, not just loader names.
2. Client-required values supplied server-side are either safely hydrated or diagnosed.
3. Secret/server-only values are excluded with diagnostics.
4. `vp check` and `vp test` pass.

---

## Milestone HYD2: Safe Projection and Serialization Contracts

### Problem

Some values cannot cross the boundary directly but can cross as safe projections. For example, an auth session secret cannot hydrate, but a public actor snapshot can.

### Target Design

Add explicit projection and serialization contracts for hydration and client exposure.

### Implementation Steps

1. Define `SafeProjection<Source, Projected>` with:
   - source context/provider/state
   - projected semantic type
   - projection expression or static mapping
   - sensitivity downgrade metadata
   - required validation/serialization contract
2. Define `SerializationContract<T>` with:
   - semantic type
   - serializer reference if needed
   - validation mode
   - redaction policy
3. Allow providers to declare `client_projection` or equivalent.
4. Update hydration planning to use safe projections before emitting hard diagnostics.
5. Add tests for:
   - auth session -> actor snapshot
   - feature flag provider -> client-safe flag map
   - server-only database service rejected
   - non-serializable custom service rejected

### Acceptance Criteria

1. Sensitive server values can hydrate only through explicit safe projections.
2. Projection output type is inferred and validated.
3. Serialization contracts are visible in hydration IR.
4. Unsafe projection attempts produce diagnostics.
5. `vp check` and `vp test` pass.

---

## Milestone REACT1: Static Reactive Expressions and Derived Resources

### Problem

`spec/atom.txt` emphasizes that all reactive behavior that should be generated, analyzed, invalidated, tested, or ported must be represented as static functions/actions/expressions. Existing keys and resources are strong foundations, but the complete IR needs query keys, invalidation plans, refresh plans, derived resources, and explicit invalidation action nodes to be uniformly static and inspectable.

### Target Design

Reactive keys, key families, invalidation plans, refresh plans, and derived resources are static IR. Generated atoms/hooks/stores are target interpretations.

### Implementation Steps

1. Audit existing `KeyFamily`, `KeyExpression`, `KeyPatternExpression`, `ReactiveResource`, `ReactiveMutation`, and invalidation operations.
2. Ensure query/resource keys can be represented as static expressions from input to key.
3. Ensure action/mutation invalidations can be represented as static expressions over input/result to key patterns.
4. Ensure explicit invalidation inside action bodies is represented as an action operation, not an opaque runtime callback.
5. Add a `DerivedResource` or equivalent IR for static derived resources/selectors/computed values with:
   - `kind: "derived_resource"`
   - dependencies as key expressions or resource refs
   - static expression body
   - output semantic type
   - resource state semantics
6. Add diagnostics when reactive behavior is opaque but claimed to be portable.
7. Add tests for explicit key expression, inferred invalidation plus manual invalidation, action-body invalidation, and derived resource dependency extraction.

### Acceptance Criteria

1. Query/resource keys are static typed expressions.
2. Mutation invalidation plans are static typed expressions or static action operations.
3. Manual invalidation exists as a typed escape hatch, not raw strings.
4. Derived resources expose their dependencies to the reactive graph.
5. Opaque reactive callbacks produce portability diagnostics.
6. `vp check` and `vp test` pass.

---

## Milestone REACT2: Reactive Runtime, Scoped Resources, and Lifecycle Cleanup

### Problem

Effect Atom demonstrates runtime/layer-backed reactive values and scoped cleanup/finalizers. The IR needs equivalent target-agnostic concepts so generated code can safely subscribe, mount, refresh, dispose, and clean up resources across React, Effect Atom, Vue, Svelte, Solid, native, or worker targets.

### Target Design

Add `ReactiveRuntime`, `ServiceLayer`, `ScopedResource`, `Finalizer`, and `LifecycleRequirement` IR. These describe runtime requirements and cleanup semantics without naming one runtime library as the source of truth.

### Implementation Steps

1. Define `ReactiveRuntime` with:
   - `kind: "reactive_runtime"`
   - name
   - placement
   - services/providers required
   - supported resource kinds
   - scheduler/batching capabilities
2. Define `ServiceLayer` or reuse provider/service IR if Phase 4 providers already cover it.
3. Define `ScopedResource` with:
   - source resource/function
   - lifecycle owner
   - finalizers
   - refresh policy
   - disposal policy
4. Define `Finalizer` as static cleanup IR where possible. Opaque cleanup functions must be marked target-specific.
5. Add lifecycle checks:
   - scoped resource must have a valid owner
   - finalizer must be supported by target/runtime
   - long-lived runtime must not capture short-lived providers
   - stream/subscription resource must define disposal semantics
6. Add tests for UI behavior resource cleanup, stream subscription cleanup, and runtime service layer requirements.

### Acceptance Criteria

1. Reactive resources can declare their runtime/service layer requirements.
2. Scoped resources and finalizers are represented as IR.
3. Stream/subscription resources without cleanup produce diagnostics.
4. Runtime/provider lifetime mismatches produce diagnostics.
5. `vp check` and `vp test` pass.

---

## Milestone MERGE1: Typed Merge Strategy and Conflict Metadata

### Problem

Optimistic updates, offline replay, conflict resolution, event folding, retries, IVM, patch composition, backfills, and cache reconciliation all need to know how values combine. Today semantic types and fields do not carry merge behavior, so the compiler cannot distinguish safe union, max timestamp, reversible counter delta, manual conflict, or forbidden merge.

### Target Design

Add production typed merge/algebra IR. Merge behavior is inspectable metadata attached to semantic types and optionally overridden by fields. Do not build a general typeclass system, theorem prover, CRDT engine, collaborative editing runtime, or distributed merge executor in this milestone.

### Implementation Steps

1. Add `src/merge/merge.ts` and `src/merge/index.ts`.
2. Define `MergeOperationKind` as a literal union with required built-ins:
   - `replace`
   - `last_write_wins`
   - `first_write_wins`
   - `max`
   - `min`
   - `sum_delta`
   - `append`
   - `prepend`
   - `set_union`
   - `set_intersection`
   - `add_remove_set`
   - `field_wise`
   - `by_id_collection`
   - `state_machine`
   - `manual_conflict`
   - `reject_conflict`
   - `custom_expr`
   - `opaque_runtime`
3. Define `ConflictBehavior` as `never | may_conflict | always_conflict`.
4. Define `MergeStrategy<T, Delta, Op, Conflict>` with:
   - `kind: "merge_strategy"`
   - name
   - operation
   - optional `value_type`
   - optional `delta_type`
   - laws from `src/types/operation.ts`
   - capabilities from `src/types/operation.ts`
   - requirements/effects
   - conflict behavior
   - phantom `_ts`, `_delta`, `_op`, `_conflict`
5. Add unbound strategy support if needed for ergonomic calls like `gen.merge.max()` that are bound through `withMerge`.
6. Add built-in constructors with narrow return types:
   - `replace`
   - `lastWriteWins`
   - `firstWriteWins`
   - `max`
   - `min`
   - `sumDelta`
   - `append`
   - `prepend`
   - `setUnion`
   - `setIntersection`
   - `addRemoveSet`
   - `byIdCollection`
   - `fieldWise`
   - `stateMachine`
   - `manualConflict`
   - `rejectConflict`
   - `customExpr`
   - `opaqueRuntime`
7. Add optional `merge_strategy?: MergeStrategy<Ts, unknown>` to `SemanticType<Ts>`.
8. Add `withMerge(type, strategy)` while preserving plain immutable semantic type records.
9. Add optional field-level merge override to `Field<Ts>` and entity field input shapes.
10. Preserve type inference for entity field construction; adding `merge` must not widen fields to `Field<unknown>`.
11. Expose `gen.merge.*` and `gen.types.withMerge` using namespace signatures that preserve generics.

### Acceptance Criteria

1. Semantic types can declare default merge behavior with `gen.types.withMerge`.
2. Entity fields can override merge behavior without losing field type inference.
3. Built-in merge strategies carry law/capability metadata.
4. Incompatible known strategy/type combinations are rejected by types where possible and diagnosed otherwise.
5. Opaque runtime merge strategies are explicitly marked non-portable.
6. `vp check` and `vp test` pass.

---

## Milestone MERGE2: Merge-Aware Patch, Reducer, and Entity Planning

### Problem

Merge metadata only becomes useful when compiler passes consume it. Entity plans, patches, optimistic plans, reducers, CRUD updates, IVM, and generated targets need to know whether a value can be replaced, merged, folded, inverted, reconciled, or must become a conflict.

### Target Design

Add pure planning/checking helpers that consume merge metadata without replacing existing action, patch, reducer, or optimistic APIs.

### Implementation Steps

1. Add `deriveFieldMergeStrategy(field)` with resolution order:
   - field override
   - semantic type default
   - no strategy
2. Add `deriveEntityMergePlan(entity, options?)` returning:
   - `kind: "entity_merge_plan"`
   - entity
   - field plans
   - conflict mode
   - diagnostics
3. Add `fieldWise(entity, options?)` to build entity/object field-wise merge strategies with typed field-name autocomplete.
4. Add `checkActionMergeSemantics(action)` for direct writes to fields with `rejectConflict`, `manualConflict`, `state_machine`, or opaque merge requirements.
5. Add `checkPatchMergeSemantics(patch)` for optimistic patches that require inverse/delta support but lack it.
6. Add `derivePatchCompositionPlan(patch, entityPlan)` to classify whether a patch can compose, invert, reconcile, or must degrade to invalidation/refetch.
7. Bridge compatible merge strategies to existing event reducer/monoid concepts without removing existing `MonoidOp`.
8. Update optimistic-plan derivation to include merge-specific diagnostics when fields cannot safely roll back or reconcile.
9. Add CRUD diagnostics when generated update actions write fields whose merge strategy forbids blind replacement.
10. Keep authz separate. Merge controls how data evolves; authz controls who may write it.

### Acceptance Criteria

1. Entity merge plans can be derived from semantic type and field metadata.
2. Patch/optimistic planning can explain when rollback is safe, degraded, or impossible.
3. Reducer/event folding can identify compatible associative/idempotent merge strategies.
4. CRUD update generation can surface merge-related warnings without changing current generated action shapes.
5. Merge diagnostics flow through existing lifecycle/optimistic diagnostics where relevant.
6. `vp check` and `vp test` pass.

---

## Milestone OPT1: Optimistic Patch, Rollback, and Reconciliation IR

### Problem

The atom vision treats optimistic UI as static patch semantics, not hand-written target hooks. Current optimistic planning needs to be strong enough to model apply, rollback, reconcile, temp IDs, operation laws, and degradation.

### Target Design

Optimistic behavior is explicit IR attached to actions/mutations/resources. Targets can generate TanStack `onMutate/onError/onSuccess`, Effect Atom mutation patches, Apollo cache updates, Svelte/Vue/Solid store patches, or offline queue patches from the same plan.

### Implementation Steps

1. Review existing optimistic plan and patch IR before editing.
2. Define or extend `OptimisticPlan` with:
   - apply patch
   - rollback patch or inverse strategy
   - reconcile expression
   - temp ID strategy
   - affected keys/resources
   - safety classification
   - fallback behavior
3. Add operation law metadata where needed:
   - associative
   - commutative
   - identity
   - inverse
   - idempotent
   - monotonic
4. Add diagnostics when optimistic derivation is unsafe:
   - no rollback plan
   - temp ID not reconciled
   - operation has no inverse
   - old value required but unavailable
   - target cannot patch affected resource
5. Add tests for create temp ID reconciliation, update rollback to previous value, delete restore, aggregate count increment/decrement, and unsafe optimistic degradation.

### Acceptance Criteria

1. Optimistic apply/rollback/reconcile are explicit typed IR.
2. Plans can degrade to refetch/pending state when patching is unsafe.
3. Operation laws gate derived optimistic behavior.
4. Missing rollback/reconcile semantics produce diagnostics.
5. `vp check` and `vp test` pass.

---

## Milestone OFF1: Offline Commands, Queues, and Replay Semantics

### Problem

`spec/atom.txt` identifies offline command envelopes and offline queue patches as generated interpretations of static action/mutation graphs. The IR needs to express whether a mutation can be queued, replayed, deduplicated, reconciled, and conflict-checked.

### Target Design

Add offline execution IR for queueable actions and mutations. Offline behavior must be explicit, idempotent or deduplicated, serializable, and reconciled after replay.

### Implementation Steps

1. Define `OfflineCommandEnvelope<In>` with:
   - action/mutation ref
   - input semantic type
   - serialized payload contract
   - idempotency key
   - ordering key
   - conflict policy
   - retry policy
   - replay requirements
2. Define `OfflineQueuePlan` with:
   - storage location
   - queue key family
   - persistence capability
   - encryption requirement if sensitive
   - drain/replay trigger
3. Connect offline plans to optimistic plans and provider/storage sensitivity checks.
4. Add diagnostics for:
   - non-serializable command payload
   - missing idempotency key
   - unsafe sensitive queue persistence
   - missing conflict policy
   - replay requires unavailable provider
5. Add tests for queueable create, non-queueable secret action, replay with idempotency, and conflict-policy diagnostics.

### Acceptance Criteria

1. Queueable mutations have typed offline command envelopes.
2. Offline queues declare storage, sensitivity, idempotency, retry, and conflict behavior.
3. Unsafe offline persistence is diagnosed.
4. Offline plans integrate with optimistic and hydration/provider checks.
5. `vp check` and `vp test` pass.

---

## Milestone RULE1: Constrained Rule/View Dependency Package

### Problem

`spec/atom.txt` argues that Datomic-style rules should exist as a constrained standard package. Current rules cover predicates, but the ultimate IR needs typed facts, logic variables, derived views, dependency extraction, stratification checks, aggregate grouping, and IVM metadata so higher-level dependencies are expressible without raw manual invalidation.

### Target Design

Add or extend a standard rule package for typed Datalog-like rules and views. It should be powerful enough to derive reactivity and IVM dependencies, but constrained enough to remain analyzable and targetable.

### Implementation Steps

1. Review existing `src/rules` before adding new rule forms.
2. Define a safe subset:
   - typed predicates
   - fact patterns
   - logic variables
   - positive rules
   - safe variable binding
   - stratified negation only
   - controlled recursion
   - aggregates with explicit grouping
   - no arbitrary JS
3. Add `DerivedRuleView` or equivalent with:
   - input variables
   - output/projection type
   - body rule expression
   - dependency metadata
   - maintenance classification
4. Add checks for unsafe rules:
   - unbound output variable
   - unsafe negation
   - unstratified recursion
   - aggregate without grouping key
   - rule depends on opaque effect
   - target cannot support recursion/fixpoint
5. Connect rule/view dependencies to reactivity graph and IVM planning.
6. Add tests for derived relation, aggregate view, authorization rule, unsafe negation, recursion diagnostics, and derived invalidation from rule dependencies.

### Acceptance Criteria

1. Rules can express typed derived dependencies without manual raw keys.
2. Derived rule views expose dependency metadata to reactivity/IVM.
3. Unsafe Datalog-like constructs produce precise diagnostics.
4. Rules remain static and analyzable.
5. `vp check` and `vp test` pass.

---

## Milestone PLAN1: Generic Trait-Based Plan Composition

### Problem

The original vision requires workflows, reactions, import jobs, approval flows, and custom plugin nodes to compose without every package inventing its own sequence/parallel API.

### Target Design

Add generic plan composition primitives over callable/effectful/readable/writable traits. Plans preserve input, output, error, requirement, and effect type information.

### Implementation Steps

1. Review Phase 3 trait and lowering contracts before adding plan APIs.
2. Add `src/plan/plan.ts` or extend an existing plan module if one exists.
3. Define plan node variants:
   - `sequence_plan`
   - `parallel_plan`
   - `map_plan`
   - `chain_plan`
   - `retry_plan`
   - `fallback_plan`
   - `placement_plan`
4. Ensure each plan is a `StaticNode` or lowerable node with traits such as `plan`, `callable`, `effectful`, and `requires` where appropriate.
5. Add `gen.plan.sequence`, `gen.plan.parallel`, `gen.plan.retry`, `gen.plan.withFallback`, and `gen.plan.withPlacement`.
6. Keep the first type inference pass conservative. Do not sacrifice end-user ergonomics for perfect higher-kinded typing.
7. Add tests for sequence and parallel composition with query/action/service method nodes.

### Acceptance Criteria

1. `gen.plan.sequence([a, b])` preserves output type of the last step where possible.
2. `gen.plan.parallel({ user, projects })` infers object output shape.
3. Requirements and effects are collected or available for collection in the resulting plan IR.
4. Plan nodes can lower or be interpreted through the trait/lowering system.
5. `vp check` and `vp test` pass.

---

## Milestone PLAN2: Requirement and Effect Bubbling Through Plans

### Problem

Plan composition is only valuable if requirements and effects bubble through the graph. A workflow requiring Database, EmailService, and AuditLog should expose that combined requirement set.

### Target Design

Add derivation and diagnostics for plan requirement/effect aggregation. The requirement satisfaction planner should treat composed plans like any other consumer.

### Implementation Steps

1. Define `derivePlanRequirements(plan)` and `derivePlanEffects(plan)` helpers.
2. Support at least sequence, parallel, retry, fallback, and placement plan variants.
3. Add graph edges from plan nodes to child nodes.
4. Feed plan-derived requirements into `RequirementSatisfactionPlan`.
5. Add diagnostics for fallback plans where primary and fallback have incompatible outputs or unsafe effects.
6. Add tests for workflow-like sequences and parallel dashboard loading.

### Acceptance Criteria

1. Requirements from all child nodes bubble to the composed plan.
2. Effects from all child nodes bubble to the composed plan.
3. Requirement satisfaction checks see plan-derived requirements.
4. Incompatible fallback plans produce diagnostics.
5. `vp check` and `vp test` pass.

---

## Milestone ORCH1: Schedule and Cron Job IR

### Problem

Scheduled work currently lives outside the semantic graph: cron configs, worker scripts, queue consumers, serverless schedules, database schedulers, and manual runbooks. The compiler cannot answer what jobs exist, what they read/write, what services they require, whether they are idempotent, which keys they invalidate, or which targets can run them.

### Target Design

Add first-class schedule and cron job IR. A schedule describes when work starts. A cron job binds a schedule to a typed callable/action/workflow with execution policy, identity, requirements, effects, and target capability metadata.

### Implementation Steps

1. Add `src/orchestration/orchestration.ts`, or split focused modules when module boundaries become clearer.
2. Define `Schedule<Name>` with:
   - `kind: "schedule"`
   - stable id/ref if available
   - name
   - schedule expression
   - timezone
   - calendar policy
   - jitter policy
   - misfire policy
   - enabled flag or expression
3. Define `ScheduleExpression` as a discriminated union:
   - cron expression
   - interval
   - daily
   - weekly
   - monthly
   - calendar
   - one-off
   - custom/opaque expression marked non-portable
4. Define `ScheduledFireContext` with scheduled time, fired time, schedule name, attempt, and optional window start/end.
5. Define `CronJob<In, Out, Err, Req, Eff>` as a static node with:
   - schedule
   - input mapping from `ScheduledFireContext` to callable input
   - run target as `ActionFunction` or generic callable node
   - execution policy
   - placement/fallback
   - execution identity
6. Define `CronExecutionPolicy` with concurrency, retry, timeout, idempotency, misfire, catchup, delivery, and observability.
7. Add public helpers:
   - `gen.schedule.cron`
   - `gen.schedule.interval`
   - `gen.schedule.daily`
   - `gen.schedule.weekly`
   - `gen.cron.define`
8. Add requirement/effect bubbling from the run target.
9. Add graph nodes/edges for schedule triggers, cron runs, requirements, effects, invalidations, and emitted events.
10. Add lifecycle diagnostics for invalid cron expressions, missing idempotency, missing overlap/concurrency policy, missing execution identity for protected writes, unbounded scans, target timeout issues, and raw runtime callbacks.
11. Add tests for one scheduled action, one idempotency diagnostic, one protected write identity diagnostic, and one target capability diagnostic.

### Acceptance Criteria

1. Schedules and cron jobs are typed static IR, not opaque runtime callbacks.
2. Cron jobs can invoke an existing action or callable node.
3. Requirements/effects from the run target bubble to the cron job.
4. Cron jobs participate in graph derivation.
5. Unsafe scheduled work produces actionable diagnostics.
6. `vp check` and `vp test` pass.

---

## Milestone ORCH2: Basic Workflow Plan IR

### Problem

Longer-running app behavior such as onboarding, billing, imports, approval flows, backfills, and reaction delivery needs typed multi-step orchestration. This should not become a separate runtime-only workflow engine. It should compose existing actions, queries, rules, events, invalidations, requirements, and effects.

### Target Design

Add production workflow IR as a callable/effectful plan node. Workflows use generic plan composition where possible and expose requirements/effects/errors to the rest of the compiler.

### Implementation Steps

1. Define `Workflow<In, Out, Err, Req, Eff>` as a static node with:
   - `kind: "workflow"`
   - name
   - input semantic type
   - output semantic type
   - typed errors
   - workflow plan
   - execution policy
   - requirements/effects
2. Define production `WorkflowPlan` branches:
   - call
   - query
   - action
   - sequence
   - parallel
   - branch
   - wait
   - wait for event
   - child workflow
   - checkpoint
   - cancellation
   - compensation/saga
   - retry
   - emit event
   - invalidate keys
3. Expose `gen.workflow.define` and complete `gen.workflow.*` constructors for every supported workflow plan branch.
4. Prefer implementing `gen.workflow.sequence/parallel/retry` as facades over `gen.plan.*` where possible.
5. Add requirement/effect/error bubbling through workflow plans.
6. Add graph nodes/edges for workflow calls, queries, actions, waits, emissions, invalidations, requirements, effects, child workflow starts, compensation, cancellation, and checkpoints.
7. Add target capability diagnostics for unsupported parallelism, retry, long-running execution, durable waits, compensation, cancellation, child workflows, and checkpointing.
8. Add diagnostics for opaque steps, input/output mismatch, non-boolean branch predicate, retry of non-idempotent external effect, unhandled errors, missing compensation where declared required, and missing event correlation.
9. Add tests for sequence, parallel, branch, retry, wait, wait-for-event, compensation, cancellation, child workflow, checkpointing, and invalidation graph edges.

### Acceptance Criteria

1. Workflows are typed callable/effectful IR nodes.
2. Workflow steps are static and inspectable.
3. Requirements/effects/errors bubble through workflow composition.
4. Workflows can be used as cron job run targets or reaction run targets where types line up.
5. Unsupported durable semantics produce diagnostics or explicit fallback plans.
6. `vp check` and `vp test` pass.

---

## Milestone BOUND1: Boundary, Transport, and Runtime Placement Graph

### Problem

`spec/atom.txt` describes cross-boundary communication as a generated interpretation of static functions: server route handlers, client SDK methods, RPC procedures, WebSocket mutations, typed HTTP endpoints, OpenAPI operations, Effect RPC groups, offline command envelopes, and queue messages. Phase 3/4 hydration and providers cover part of this, but the ultimate IR needs a unified boundary graph.

### Target Design

Add a boundary/transport graph that describes where functions/resources/actions run, which transports connect them, what serialization/auth/reactivity semantics cross the boundary, and which runtime placements are legal.

### Implementation Steps

1. Define `RuntimeBoundary` as a discriminated union or typed node for:
   - browser/client
   - server
   - database
   - worker
   - edge
   - native
   - TUI
   - queue
   - external service
2. Define `TransportPlan` branches for:
   - HTTP endpoint
   - RPC procedure
   - WebSocket message
   - server action/form post
   - queue message
   - offline command
   - hydration payload
3. Define `BoundaryCallPlan` with:
   - callable source
   - client/server placement
   - input/output/error serialization contracts
   - auth requirements
   - provider requirements
   - reactivity invalidations/refresh payloads
   - optimistic/offline behavior if present
4. Add placement checks:
   - server-only provider cannot be required by client boundary without transport/projection
   - edge runtime cannot use unsupported storage/service
   - WebSocket transport requires stream/subscription-compatible resource
   - queue transport requires serializable/idempotent payload
5. Add target conformance tests for HTTP, RPC, WebSocket/stream, queue, and offline command boundary plans.

### Acceptance Criteria

1. Static functions/actions can produce boundary call plans without target-specific source code.
2. Boundary plans include serialization, auth, provider, reactivity, optimistic, and offline metadata.
3. Runtime placement incompatibilities produce diagnostics.
4. Production-quality targets can consume boundary plans for HTTP/RPC and queue/offline output.
5. `vp check` and `vp test` pass.

---

## Milestone OBL1: Semantic Obligation Graph for Tests and Docs

### Problem

The original vision says the compiler should know which tests, docs, access matrices, and devtools views are needed. Current IR can describe app semantics, but it does not explicitly model derivation obligations.

### Target Design

Add an `ObligationGraph` that records generated-output obligations implied by semantic definitions and changes.

### Implementation Steps

1. Define `SemanticObligation` as a discriminated union. Initial obligations:
   - `policy_test`
   - `access_matrix_doc`
   - `mutation_invalidation_test`
   - `provider_mock_test`
   - `hydration_safety_test`
   - `form_validation_test`
   - `enum_exhaustiveness_test`
   - `reaction_delivery_test`
   - `target_capability_doc`
2. Define `ObligationGraph` with:
   - obligations
   - source nodes
   - affected artifacts
   - priority/severity
   - diagnostics
3. Derive obligations from:
   - policies and access surfaces
   - action functions and invalidation plans
   - providers and requirements
   - hydration plans
   - forms and validation rules
   - enums/status fields
   - reactions/outbox plans
   - target fallback diagnostics
4. Add tests that create a small CRUD/auth/action app and verify expected obligations.

### Acceptance Criteria

1. Policies produce policy test and access matrix doc obligations.
2. Actions with invalidation produce mutation invalidation test obligations.
3. Requirements/providers produce provider mock test obligations.
4. Hydration-sensitive values produce hydration safety test obligations.
5. `vp check` and `vp test` pass.

---

## Milestone OBL2: Test/Docs/Devtools Target Fixtures

### Problem

Obligations are useful only if targets can consume them. The first implementation should prove the IR can generate useful test/docs/devtools artifacts without tying the core to one test framework.

### Target Design

Add production-quality target integrations that consume `ObligationGraph`, provider plans, hydration plans, and reactive graph data to emit structured artifacts.

### Implementation Steps

1. Add a docs target that emits JSON or Markdown for access matrices and provider graphs.
2. Add a tests target that emits structured JSON or TypeScript artifacts for required tests.
3. Add a devtools artifact target that emits graph data including requirements, providers, storage, hydration, and reactive edges.
4. Avoid committing to Vitest-specific generated test code unless the project already has a target abstraction for that.
5. Add snapshot/structural tests for target output.

### Acceptance Criteria

1. Obligation graph can produce docs artifacts.
2. Obligation graph can produce test artifacts.
3. Devtools artifacts include provider/state/hydration graph edges.
4. Artifacts are target-input based and do not reach into private module internals.
5. `vp check` and `vp test` pass.

---

## Milestone TARGET1: Provider Lowering Fixture Targets

### Problem

Provider planning must prove it can lower into concrete runtime strategies without hardcoding a stack into core.

### Target Design

Add production-quality provider lowering targets for at least one server interpretation and one client interpretation.

### Implementation Steps

1. Add a server target that lowers providers to request context, cookie/session reads, env reads, and service construction code/artifacts.
2. Add a client target that lowers providers/state to context hooks, query cache bindings, URL state, and local storage code/artifacts.
3. Output must be executable or directly consumable by downstream generators; no placeholder descriptions.
4. Include hydration plan consumption so server-provided safe values can become client provider inputs.
5. Add tests showing the same semantic provider graph lowering differently for server and client targets.

### Acceptance Criteria

1. Server target consumes `RequirementSatisfactionPlan` and provider IR.
2. Client target consumes provider, state, and hydration IR.
3. Unsafe provider placements are rejected before target generation.
4. The same IR can lower into different runtime interpretations.
5. `vp check` and `vp test` pass.

---

## Milestone TARGET2: Production Target Integration Plan

### Problem

Production target integration must happen intentionally. Otherwise provider/state/hydration semantics will be bolted onto generators inconsistently.

### Target Design

Create a documented integration plan and migrate one production target at a time.

### Implementation Steps

1. Audit existing production or semi-production targets:
   - Effect Atom
   - TanStack Query
   - standard-schema
   - relational/storage targets
   - router/API targets if present
2. For each target, document which Phase 4 IR it can consume:
   - requirements/providers
   - state resources
   - hydration projections
   - SingleFlight plans
   - obligations
3. Pick the lowest-risk target for the first real integration.
4. Add capability metadata for that target.
5. Add generator tests that compare previous behavior and new provider/state/hydration behavior.
6. Do not migrate multiple targets in one milestone unless each has independent tests.

### Acceptance Criteria

1. There is a written target integration matrix.
2. At least one production target consumes Phase 4 IR without using private internals.
3. Existing target behavior is preserved unless intentionally migrated.
4. Unsupported Phase 4 features produce target capability diagnostics.
5. `vp check` and `vp test` pass.

---

## Cross-Cutting Diagnostics

Phase 4 should prefer branded/literal diagnostic codes. Required diagnostic code families include:

```txt
requirement:missing-provider
requirement:ambiguous-provider
requirement:provider-cycle
requirement:provider-placement-incompatible
requirement:runtime-provider-missing
placement:secret-client-readable
placement:server-only-client-provider
placement:nonserializable-hydration
placement:lifetime-escape
placement:request-value-global-cache
placement:regulated-devtools-exposure
state:storage-not-serializable
state:query-cache-missing-key
state:unsafe-persistence
reactivity:opaque-portable-callback
reactivity:key-expression-type-mismatch
reactivity:manual-key-raw-string
reactivity:derived-resource-missing-dependency
reactivity:invalidation-expression-invalid
reactivity:stream-missing-cleanup
runtime:scoped-resource-without-owner
runtime:finalizer-target-unsupported
runtime:lifetime-captures-shorter-provider
merge:strategy-missing
merge:field-merge-missing
merge:field-strategy-type-mismatch
merge:delta-type-mismatch
merge:law-required-for-retry
merge:non-idempotent-retried-effect
merge:non-commutative-parallel-merge
merge:non-invertible-optimistic-rollback
merge:conflict-policy-missing
merge:custom-merge-not-portable
merge:opaque-merge-in-generated-target
merge:state-transition-invalid
merge:direct-merge-forbidden
merge:clock-missing
merge:clock-field-wrong-entity
merge:by-id-field-missing
optimistic:rollback-missing
optimistic:reconcile-missing-temp-id
optimistic:operation-not-reversible
optimistic:old-value-required
optimistic:target-cannot-patch
offline:payload-not-serializable
offline:idempotency-key-missing
offline:unsafe-sensitive-persistence
offline:conflict-policy-missing
offline:replay-provider-unavailable
hydration:missing-safe-projection
hydration:unsafe-projection
hydration:serializer-missing
rules:unbound-output-variable
rules:unsafe-negation
rules:unstratified-recursion
rules:aggregate-missing-grouping-key
rules:opaque-effect-dependency
rules:target-recursion-unsupported
plan:incompatible-fallback-output
plan:unsafe-fallback-effects
schedule:invalid-cron-expression
schedule:timezone-required
schedule:unsupported-timezone
schedule:misfire-policy-unsupported
schedule:catchup-unbounded
cron:run-not-callable
cron:input-selection-mismatch
cron:missing-idempotency
cron:overlap-policy-missing
cron:target-timeout-too-short
cron:identity-missing
cron:protected-write-without-policy
cron:unbounded-scan
cron:raw-runtime-callback
workflow:step-not-static
workflow:input-output-mismatch
workflow:branch-not-boolean
workflow:parallel-effects-conflict
workflow:durable-wait-unsupported
workflow:event-correlation-missing
workflow:retry-non-idempotent-effect
workflow:compensation-missing
workflow:compensation-input-mismatch
workflow:unhandled-error
workflow:requirements-unsatisfied
workflow:target-capability-missing
workflow:opaque-step-not-portable
workflow:long-running-without-checkpoint
workflow:unsafe-inline-side-effect
workflow:cancellation-unsupported
boundary:placement-incompatible
boundary:serializer-missing
boundary:transport-auth-missing
boundary:websocket-resource-not-streamable
boundary:queue-payload-not-idempotent
boundary:edge-capability-missing
obligation:unhandled
target:phase4-capability-missing
```

Every diagnostic should include:

1. the affected node or requirement name;
2. the provider/storage/target involved, if any;
3. why the compiler cannot prove safety;
4. the safety classification: `error`, `warning`, `info`, or `degraded`;
5. whether generation may continue safely;
6. the selected fallback, if one exists;
7. a suggested fix.

## Error Policy

Phase 4 must distinguish hard errors from safe degradation. Use this policy unless a more specific milestone overrides it:

1. **Hard error:** The compiler would generate unsafe or type-invalid runtime behavior. Examples: secret sent to client, missing required provider with no fallback, non-serializable boundary payload, unsafe rule negation used for auth, queueable mutation without idempotency.
2. **Warning:** The compiler can generate correct but degraded behavior. Examples: broad invalidation instead of precise patch, refetch fallback instead of optimistic patch, server-only execution instead of edge execution.
3. **Info:** The compiler made a conservative choice that is safe and expected. Examples: manual key used for opaque external dependency, target chose server form fallback intentionally.
4. **Degraded:** The preferred plan is unsupported, but an explicit fallback plan is selected and safe. Diagnostics should name both the rejected preferred plan and the selected fallback.

Every checker should prefer actionable diagnostics over generic failure. A good diagnostic answers:

1. What semantic object caused the issue?
2. Which target, placement, provider, key, rule, or transport is involved?
3. What proof is missing?
4. What fallback was selected, if any?
5. What should the user add or change?

## Ultimate IR Readiness Checklist

Phase 4 should move the library toward the ultimate IR described by `docs/stuff.txt` and `spec/atom.txt`. The IR is not ready for the full vision until all of these are expressible as typed static data:

1. Query keys as expressions from input to typed key.
2. Mutation invalidations as expressions from input/result to typed key patterns.
3. Derived resources as static expressions over resource/key dependencies.
4. Resource states including initial/loading/refreshing/success/failure/defect.
5. Scoped resource lifecycle, owner, cleanup, and finalizer plans.
6. Reactive runtimes and service layers as provider/runtime IR.
7. Pull, stream, and infinite resources with pagination/resume semantics.
8. Merge strategies on semantic types and fields for conflict, delta, rollback, retry, folding, and IVM safety.
9. Optimistic apply/rollback/reconcile plans with operation-law and merge-strategy safety checks.
10. Offline command envelopes with idempotency, conflict, retry, persistence, and replay semantics.
11. Requirement/provider/storage/lifetime/sensitivity planning.
12. Provider-aware hydration with safe projection and serialization contracts.
13. Schedule and cron job IR with execution policy, idempotency, concurrency, identity, and graph edges.
14. Basic workflow plan IR over static calls, queries, actions, branches, retries, events, and invalidations.
15. Boundary call plans for HTTP, RPC, WebSocket, form post, queues, offline commands, and hydration.
16. Constrained rule/view dependencies with stratification, grouping, recursion, and IVM classification.
17. Reactive graph edges for reads, writes, invalidates, derives, patches, reconciles, rolls back, emits, subscribes, requires, hydrates, schedules, runs, and transports.
18. Semantic obligations for tests, docs, visualizers, access matrices, hydration safety, rollback, cron safety, workflow retry, and provider mocks.

## Final Phase 4 Completion Criteria

Phase 4 is complete when all of the following are true:

1. Requirements, providers, provider sources, scopes, lifetimes, and sensitivity are typed first-class IR.
2. The lifecycle can derive and check a requirement satisfaction plan.
3. Unsafe provider placement, hydration, persistence, logging/devtools exposure, and lifetime escapes produce diagnostics.
4. State resources can represent non-query application state with keys, storage, reactivity, and provider bindings.
5. Hydration planning is provider-aware and supports explicit safe projections.
6. Static reactive expressions represent query keys, invalidations, derived resources, and explicit invalidation operations.
7. Reactive runtimes, scoped resources, finalizers, and lifecycle cleanup are typed IR.
8. Merge strategies and entity merge plans are typed, inspectable, and consumed by patch/optimistic/reducer planning.
9. Optimistic and offline behavior is expressible, safe by construction, and diagnosable when degraded.
10. Constrained rules/views can expose higher-level derived dependencies for reactivity and IVM.
11. Generic plan composition works over trait-bearing nodes and bubbles requirements/effects.
12. Schedule/cron and production workflow IR can represent scheduled/background work without opaque runtime callbacks.
13. Boundary and transport plans can express HTTP, RPC, WebSocket, queue, offline, cron, workflow, and hydration crossings.
14. The compiler derives semantic obligations for tests, docs, and devtools from the graph.
15. Production-quality targets prove provider/state/hydration/reactivity/orchestration/boundary/obligation IR can be consumed without hardcoding one framework.
16. Production target integrations are implemented for the Phase 4 IR surfaces selected by the target integration matrix.
17. `vp check` and `vp test` pass after every completed milestone.

## Production Completeness Rules

Phase 4 is a production-readiness phase. Do not land stubs, placeholder target output, or deliberately incomplete IR branches. If a feature is in a Phase 4 milestone, it must be implemented as a complete, checkable, documented IR surface with diagnostics and target integration strategy.

1. Provider/state/hydration/reactivity/orchestration/boundary/obligation IR must be usable by real targets, not only JSON demonstrations.
2. Type inference must work for normal public APIs without explicit type arguments or casts.
3. Diagnostics must identify unsafe generation paths before artifacts are emitted.
4. Target integrations may be incremental by target, but each integrated target must be production-quality for the Phase 4 capabilities it claims.
5. Unsupported target capabilities must produce explicit diagnostics and fallback plans, not silent omission.
6. Workflow support includes durable waits, event waits, child workflows, checkpointing, cancellation, and compensation/sagas as IR. A target may reject unsupported durable execution features, but the IR and diagnostics must be complete.
7. Rules support must be constrained and analyzable, but not partial. If recursion, negation, or aggregates are exposed, safety checks must be implemented with diagnostics.
8. Merge support must be honest. Built-in strategies need law/capability metadata, opaque strategies must be marked non-portable, and unsafe optimistic/offline use must be diagnosed.
9. Offline support must model command envelopes, serialization, idempotency, conflict policy, retry, persistence, and replay requirements.
10. Devtools/docs/test obligations must be generated from the same semantic graph, not maintained as a separate manual system.

Phase 4 is complete only when these production completeness rules are satisfied for every completed milestone.
