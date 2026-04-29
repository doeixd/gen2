# Gen2 Atom Plan — Continuation

> A continuation of `atom_plan.md` and `atom_plan_progress.md`. This plan picks up after the completed foundation (R1–R4, T1–T2, SF1, ROUTE1, HYDRATE1, SVC1, RULE1, AUTHZ1–2+, REACT1, R-REACT L1–4, CRUD1) and sequences the remaining backlog into concrete, verifiable milestones.
>
> **Last updated**: 2026-04-29

---

## Guiding Principles (unchanged from atom_plan.md §0)

1. **Data-first, static IR**: No opaque JS closures in portable definitions.
2. **Type inference is a feature**: Phantom types are the product, not optional.
3. **Composability over configuration**: Pipeable APIs and layered interpretation beat giant configs.
4. **Source of truth**: `gen.func.query` and `gen.func.action` remain canonical.
5. **Target agnostic**: Effect-TS, React, Vue, Svelte, Solid are targets, not dependencies.
6. **Derived over manual**: Infer invalidation, optimistic patches, and IVM deltas where possible.
7. **Progressive enhancement**: Every generated feature declares baseline, enhanced, fallback, and unsupported behavior.
8. **Capability-driven**: Targets declare capabilities; generators pick the best plan; diagnostics report degradation.

---

## Dependency Order Summary

```txt
Reactivity foundation (complete)
  R1 keys -> R2 metadata -> R3 resources/mutations -> R4 graph -> T1/T2 targets -> SF1

Next wave (this plan):
  Primitives -> Composition -> Optimism -> Guards -> Diagnostics
    -> Rule planner extraction -> SQL/RLS translation -> Client hints
    -> Services scoped cleanup -> Module/Layer IR
    -> CRUD depth (forms/routes/clients)
    -> Reactions compiler deferred until rule planner stable
```

---

## Milestones

### P1 — Reactivity Primitives Hardening

Close the gaps in the core reactive IR so the public API matches the spec contract and the checker can emit all required diagnostics.

**Scope**:

- Add `KeyExpression<Input, Key>` and `KeyPatternExpression<Input, Pattern>` wrapper types.
- Refactor `QueryReactivity.key` and `ActionReactivity.invalidates` to accept the wrappers instead of raw `KeyFamily | ReactiveKey`.
- Implement remaining `reactivity:*` diagnostics:
  - `reactivity:key-payload-mismatch`
  - `reactivity:key-match-unknown-field`
  - `reactivity:query-key-output-invalid`
  - `reactivity:invalidates-output-invalid`
  - `reactivity:raw-key-not-portable`
- Harden reactive graph guards: `isQueryFunction`, `isActionFunction`, `isReactiveResource`, `isReactiveMutation` must use discriminant checks (e.g., `kind === "query_function"`) instead of loose `name` + `body` checks.
- Add compile-time negative tests (`.test-d.ts`) for invalid key payloads, unknown `.match()` fields, and invalid resource/mutation inputs.

**Done when**:

- `vp check` passes with no new errors.
- `vp test` passes; new runtime tests cover each diagnostic code.
- New `.test-d.ts` files contain `@ts-expect-error` cases that fail if the type guard is removed.
- Public reactivity APIs accept `KeyExpression` / `KeyPatternExpression` only.

---

### P2 — Resource Composition (`ResourceAll` / `ResourceChain`)

Unlock parallel and dependent loader patterns for generated targets.

**Scope**:

- Add `ResourceAll` IR with `branches: Record<string, ReactiveResource>` and `mode: "parallel" | "target_decides"`.
- Add `ResourceChain` IR with `source: ReactiveResource` and `derive_next: StaticFunction`.
- Add constructors: `gen.reactivity.all({ ... })`, `gen.reactivity.chain(source, derive)`.
- Ensure `all` preserves per-branch dependencies, errors, and key references.
- Ensure `chain` creates a graph sequencing edge from source result to derived resource input.
- Derive `resource_all` and `resource_chain` nodes in `ReactiveGraph` with appropriate edges.
- Add inference helpers: `InferResourceAllBranches<R>`, `InferResourceChainOutput<R>`.
- Add type tests proving parallel branches retain independent error types.
- Add target codegen stubs for Effect Atom (`Atom.all`) and TanStack Query (`useQueries`).

**Done when**:

- `gen.reactivity.all` and `gen.reactivity.chain` are discoverable static records.
- Graph derivation includes `resource_all` and `resource_chain` nodes.
- Type tests prove branch independence and dependent sequencing.
- `vp check` and `vp test` pass.

---

### P3 — Optimistic Mutation Plans (`OptimisticPlan`)

Make optimistic updates safe, explicit, and diagnosable.

**Scope**:

- Add `OptimisticPlan<Input, Output>` IR with:
  - `apply: PatchExpr` — optimistic patch to affected keys
  - `rollback: PatchExpr` — patch to undo if mutation fails
  - `reconcile: PatchExpr?` — patch to merge server result
  - `fallback: FallbackPlan` — behavior when optimistic path is unsupported
  - `diagnostics: Diagnostic[]`
- Add `gen.reactivity.optimistic({ apply, rollback, reconcile?, fallback? })`.
- Attach `optimistic?: OptimisticPlan` to `ReactiveMutation`.
- Derive default optimistic plans from simple CRUD actions (e.g., `updateProject` -> patch `project.detail` key) when safe.
- Emit diagnostic `reactivity:optimistic-unreconcilable` when rollback/reconcile cannot be derived.
- Add lifecycle checker `checkOptimisticPlans(ctx)`.
- Add runtime and type tests.

**Done when**:

- `ReactiveMutation` optionally carries an explicit `OptimisticPlan`.
- Derived optimistic plans exist for basic CRUD update/delete actions.
- Diagnostics catch unreconcilable optimistic mutations.
- `vp check` and `vp test` pass.

---

### P4 — Rule Evaluation Planner Extraction

Move rule placement logic out of authz so rules can be reused by query planners and CRUD generators.

**Scope**:

- Extract `classifyPlacement` from `src/authz/placement.ts` into `src/rules/placement.ts`.
- Make it operate on `RuleExpr` directly, producing `Placement` for:
  - `database_predicate`
  - `rls`
  - `server_pre_query`
  - `server_integrated_query`
  - `server_post_filter`
  - `client_hint`
  - `materialized_ivm`
  - `external_evaluator`
- Keep authz-specific policy surface placement in `src/authz/placement.ts` as a thin wrapper that calls the rule planner.
- Add `RulePlacement` IR record.
- Add diagnostics:
  - `rules:not-sql-translatable`
  - `rules:not-rls-translatable`
- Add tests in `tests/rules-placement.test.ts`.

**Done when**:

- `src/rules/placement.ts` exists and is imported by `src/authz/placement.ts`.
- Rule placement does not depend on authz policy types.
- `vp check` and `vp test` pass.

---

### P5 — SQL Predicate Translation And RLS Placement

Enable rules to lower to SQL WHERE and RLS policies.

**Scope**:

- Add `src/rules/sql.ts` with `ruleToSqlPredicate(rule, dialect)`.
- Support translations for: `eq`, `compare`, `and`, `or`, `not`, `exists`.
- Emit `rules:aggregate-not-maintainable` for unsupported aggregates.
- Add `src/rules/rls.ts` with `ruleToRlsPolicy(rule, dialect)`.
- Add dialect-aware helper typing in `src/db/` (leverage existing `gen.db.*` plugin surface).
- Add capability diagnostics when a target dialect does not support a translated construct.
- Add compile-time tests verifying generated SQL/RLS strings for sample rules.

**Done when**:

- Sample rules produce valid SQL WHERE clauses.
- RLS policies are generated for supported rule shapes.
- Diagnostics catch unsupported constructs.
- `vp check` and `vp test` pass.

---

### P6 — Client Hint Modes

Make client-side authorization hints explicit and safe.

**Scope**:

- Add `ClientHintMode` union: `exact` | `sound_allow` | `sound_deny` | `best_effort` | `disabled`.
- Attach `client_hint_mode?: ClientHintMode` to `Policy` and `AccessSurfaceBinding`.
- Update `deriveDefaultDeny` to respect hint mode.
- Emit `authz:authoritative-client-policy` if a client hint is used as authoritative enforcement.
- Update `checkAuthz` to validate hint mode consistency across surfaces.
- Add runtime tests for each hint mode.

**Done when**:

- Policies declare client hint modes explicitly.
- Diagnostics catch authoritative client policy mistakes.
- `vp check` and `vp test` pass.

---

### P7 — Services Scoped Cleanup And Module/Layer IR

Complete the service model with scopes, finalizers, and modular composition.

**Scope**:

- Add `Scope` IR: `singleton` | `request` | `session` | `custom`.
- Add `Finalizer` IR with `acquire` and `release` action references.
- Add `Module` IR with `provided_services`, `required_services`, `imports`, `exports`.
- Add `Layer` IR for target-specific provider composition (Effect Layer, React Provider, etc.).
- Update `ServiceRef` to include `scope` and `finalizer?`.
- Update `deriveModuleGraph` to handle `Module` nodes and validate cyclic imports.
- Add diagnostics:
  - `services:invalid-scope`
  - `services:finalizer-missing`
  - `services:cyclic-module-import`
- Add target codegen stubs for Effect Layer and React Provider.
- Add runtime tests.

**Done when**:

- Services declare scopes and optional finalizers.
- Module graph detects cycles and missing providers.
- `vp check` and `vp test` pass.

---

### P8 — Graph Derivation Completeness

Fill in the missing node kinds so the reactive graph is comprehensive.

**Scope**:

- Derive `ui_component` nodes from `ctx.ui_components` (or `ctx.components`).
- Derive `store` nodes from `ctx.stores` / storage mappings.
- Derive `runtime_boundary` nodes from target artifacts and requirements.
- Add `reads` edges from components to resources and forms.
- Add `requires` edges from runtime boundaries to services.
- Add ergonomic wrappers: `gen.reactivity.target.effectAtom()` and `gen.reactivity.target.tanstackQuery()` that invoke the respective target plugins.
- Add a third reactive target stub (e.g., `solid-query` or `vue-query`) to prove the plugin contract is target-agnostic.

**Done when**:

- The reactive graph contains all node kinds listed in the spec.
- Ergonomic target wrappers exist.
- At least three target stubs are present.
- `vp check` and `vp test` pass.

---

### P9 — Route Error Boundaries And Exhaustive Checking

Close the routing gaps identified in ROUTE1.

**Scope**:

- Add `error_boundaries: Record<ErrorKind, ActionFunction | ReactiveMutation>` to `AppRoute`.
- Type `error_boundaries` against declared loader/action errors.
- Implement `checkRouteErrorBoundaries` with exhaustiveness verification.
- Emit `router:error-boundary-non-exhaustive` when a declared error lacks a boundary handler.
- Add runtime tests for typed error boundaries and exhaustiveness diagnostics.

**Done when**:

- Route error boundaries are typed and checked.
- Diagnostics catch non-exhaustive error handling.
- `vp check` and `vp test` pass.

---

### P10 — CRUD Depth (Forms, Routes, Clients)

The largest user-facing integration point: generate working UI and transport layers from CRUD definitions.

**Scope**:

- Implement advanced CRUD operations:
  - `getMany`, `findOne`, `findMany`, `patch`, `upsert`
- Add CRUD form generation:
  - `gen.crud.form(entity, crud)` derives `Form` from writable fields and policies.
  - Respect `editableWhen` rules per field.
- Add CRUD route generation:
  - `gen.crud.routes(entity, crud)` derives `AppRoute` records for list, detail, create, edit.
  - Wire loaders to `getById` / `list` queries.
  - Wire actions to `create` / `update` / `delete` mutations.
- Add CRUD client generation:
  - `gen.crud.client(entity, crud)` derives fetch/http client calls for each query/action.
- Add soft-delete, versioning, relation includes as static options in `DeriveCrudOptions`.
- Derive narrowed invalidation plans (beyond `collection.any()`) using rule-derived reactivity.
- Add diagnostics:
  - `crud:relation-include-unsupported`
  - `crud:optimistic-unsafe`
  - `crud:version-field-missing`
- Add runtime and type tests.

**Done when**:

- A single `deriveCrud` call can produce forms, routes, and clients.
- Generated routes have typed loaders and actions.
- Diagnostics catch unsafe optimistic or missing version fields.
- `vp check` and `vp test` pass.

---

### P11 — Reactions Compiler And Delivery Plans

Unblock background reactions, outbox patterns, and IVM maintenance.

**Scope**:

- Add `ReactionCompiler` that lowers `Reaction` records into target-specific job/outbox schemas.
- Add `DeliveryPlan` IR: `immediate`, `queued`, `scheduled`, `outbox`.
- Add `IdempotencyPlan` IR with key extraction expressions.
- Implement remaining reaction diagnostics:
  - `reaction:input-selection-mismatch`
  - `reaction:transition-boundary-unknown`
  - `reaction:unsafe-inline-effect`
  - `reaction:target-unsupported-delivery`
  - `reaction:unbounded-trigger-scan`
- Add target codegen for Effect Queue / outbox table schemas.
- Defer full IVM maintenance plan generation until rule placement (P4/P5) is stable.

**Done when**:

- Reactions carry explicit delivery and idempotency plans.
- Diagnostics catch unsafe or unsupported reaction configurations.
- `vp check` and `vp test` pass.

---

### P12 — Unified Reactivity Registry

Refactor reactivity discoverability into a single registry once the API surface is stable.

**Scope**:

- Merge `ctx.key_families`, `ctx.reactive_resources`, `ctx.reactive_mutations` into `ctx.reactivity_registry`.
- Registry maintains cross-reference invariants (e.g., every resource references a valid query function; every mutation references a valid action function).
- Update `deriveReactiveGraph` to read from the registry.
- Update all target generators to read from the registry.
- Add lifecycle checker `checkReactivityRegistry`.
- This is a pure refactor; no public API changes except potentially cleaner `gen.reactivity.*` internals.

**Done when**:

- All reactivity objects live in one registry.
- Cross-reference invariants are enforced at check time.
- `vp check` and `vp test` pass with zero regressions.

---

### P13 — Documentation And Design Intent

Improve maintainability by documenting non-obvious design choices.

**Scope**:

- Add "why" comments to:
  - `src/reactivity/rule-derived.ts` — precision levels and confidence semantics.
  - `src/authz/mutation-plan.ts` — before/after state handling.
  - `src/authz/placement.ts` — preference ordering and fallback logic.
  - `src/rules/placement.ts` — extracted rule planner rationale.
- Document the `FallbackPlan` contract usage in each module that employs it.
- Add README sections for reactivity, routing, and rules modules.

**Done when**:

- Every precision level, placement decision, and fallback branch has an explanatory comment.
- Module READMEs exist for reactivity, router, rules, authz, and services.

---

## Sequencing

```txt
P1  Primitives Hardening
P2  Resource Composition
P3  Optimistic Plans
P4  Rule Planner Extraction
P5  SQL/RLS Translation
P6  Client Hint Modes
P7  Services Scoped Cleanup
P8  Graph Completeness
P9  Route Error Boundaries
P10 CRUD Depth (forms/routes/clients)
P11 Reactions Compiler
P12 Unified Registry  (refactor after P1–P3 stable)
P13 Documentation       (parallel with implementation)
```

**Rationale**:

- P1 hardens the base before building on it.
- P2 and P3 unlock user-visible composition and safer mutations.
- P4–P6 unblock rule-driven CRUD and authz correctness.
- P7 completes the service model needed by CRUD clients.
- P8–P9 fill graph and routing gaps.
- P10 is the biggest integration payoff and depends on P4–P7.
- P11 depends on stable rule placement and graph derivation.
- P12 is a refactor best done when the reactivity API is stable.
- P13 runs continuously but gets a dedicated final pass.

---

## Immediate Next Steps (start here)

1. **Implement `KeyExpression` and `KeyPatternExpression` wrappers** (P1).
2. **Harden reactive graph guards** (P1) — low-effort, high safety.
3. **Add remaining reactivity diagnostics** (P1) — completes the invariant checker.
4. **Add compile-time negative tests** for keys and resources (P1) — prevents regressions.

These four items are small, well-scoped, and unblock everything that follows.
