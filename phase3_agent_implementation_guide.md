# Phase 3 Agent Implementation Guide: IR Architecture and Semantic Expansion

This guide is a handoff plan for an AI coding agent that is executing Phase 3 of the `gen2` domain compiler roadmap. Treat it as a consolidation plan, not a greenfield implementation plan. Several Phase 3 primitives already exist in the repository and should be tightened, connected, and tested rather than duplicated.

## Primary Goal

The goal of Phase 3 is to elevate the Intermediate Representation (IR) from a closed, function-heavy state into a truly extensible, target-agnostic compiler. Expression-level IR should remain closed where targets need exhaustiveness, but application-level concepts should be open through traits, lowering, placement analysis, typed context, progressive enhancement, IVM, reactions, hydration, and SingleFlight.

## Current State Snapshot

Before implementing, inspect the current source. At the time this guide was revised, the repository already contained these Phase 3 seeds:

1. `src/core/node.ts` has `StaticNode`, built-in traits, `LowerableNode`, trait helpers, `CallPlan`, and node inference helpers.
2. `src/core/node-lowering.ts` has node registration, lowering traversal, and node diagnostics.
3. `src/core/target.ts` has `EnhancementPlan`, `CapabilityTier`, `SymbolRegistry`, and `TargetInputRecord`.
4. `src/rules/placement.ts` has `FallbackPlan` and rule placement analysis.
5. `src/reactivity/rule-derived.ts` has derived invalidation plans with `broad`, `matched`, `exact`, and `patchable` precision.
6. `src/reaction/reaction.ts` has reactions, idempotency metadata, and delivery metadata.
7. `src/reactivity/reactivity.ts` has `deriveReactiveGraph`, `checkReactivity`, and `deriveSingleFlightPlan`.
8. `src/hydration/hydration.ts` has descriptive hydration snapshots.

If any of these have changed, update the milestone tasks to match the code rather than blindly adding parallel abstractions.

## Critical Rules for the Agent

1. Do not add `as unknown as`, `as any`, or `as never` in public API paths, tests, examples, or end-user-facing code. Internal casts are allowed only when they preserve inference or work around a TypeScript limitation, and they need a short explanatory comment.
2. Existing builder casts are technical debt. If a milestone touches a builder that uses broad casts, prefer improving its typing rather than copying the pattern.
3. Do not allocate new immutable objects on every fluent builder call unless the existing builder pattern in that module already requires it. Prefer mutable internal builder state and freeze/copy on `.build()`.
4. Do not mutate `GenContext` incorrectly. If an array may be readonly or frozen, replace it safely instead of pushing.
5. Keep each milestone small enough that `vp check` and `vp test` can pass before moving on.
6. Preserve narrow return types, entity-scoped generics, and namespace generic preservation.
7. Do not treat target generation as required until the relevant IR contract and lifecycle diagnostics are tested.

## Recommended Milestone Order

1. **ARCH1a: Stabilize Trait and Lowering Contracts**
2. **ARCH1b: Make Graph Derivation Trait-Aware**
3. **DI1a: Typed Context and Storage Location IR**
4. **DI1b: Context Provider Lifecycle Diagnostics**
5. **PE2a: Unified Enhancement and Fallback Planning**
6. **PE2b: Target Capability Diagnostics**
7. **IVM1a: Patch Plan IR for Rule-Derived Reactivity**
8. **IVM1b: Simple Patchable Rule Cases**
9. **RX1a: Reaction Outbox Lowering IR**
10. **RX1b: Reaction Safety Diagnostics**
11. **XFER1a: Transport, Hydration, and SingleFlight IR**
12. **XFER1b: Target Fixture Generation for Bundled Fetches**

---

## Milestone ARCH1a: Stabilize Trait and Lowering Contracts

### Problem

The repo already has an open node protocol, but it needs to be treated as the canonical extension surface. Future work should not add separate ad hoc plugin node paths.

### Target Design

`StaticNode`, traits, and lowering contributions form the single application-level extension protocol. Plugin-defined nodes can advertise capabilities through traits and lower to canonical IR when a target cannot interpret them directly.

### Implementation Steps

1. Review `src/core/node.ts`, `src/core/node-lowering.ts`, and `src/core/plugin.ts` before editing.
2. Ensure `LowerableNode` shape matches the actual lowering pipeline. If lowering is contribution-based, do not also require every node to carry a `lowersTo` function unless there is a concrete use.
3. Add or update tests showing a plugin-defined node kind registering required traits, lowering to a canonical node, and producing diagnostics for missing traits or unsupported target interpretation.
4. Expose only the minimum stable public helpers needed for plugin authors.

### Acceptance Criteria

1. A test plugin can register a custom node kind and validate trait requirements.
2. A custom node can lower to canonical IR through the existing lowering pipeline.
3. Unsupported custom nodes produce a precise diagnostic.
4. `vp check` and `vp test` pass.

---

## Milestone ARCH1b: Make Graph Derivation Trait-Aware

### Problem

`deriveReactiveGraph` and related checks still primarily inspect known collections such as query functions, action functions, resources, and routes. Open nodes need a defined way to participate without hardcoding every future kind.

### Target Design

Graph derivation should continue to handle canonical IR explicitly, but it should also inspect registered `ctx.nodes` through traits and lowerings where safe.

### Implementation Steps

1. Identify the smallest useful trait-driven graph behavior, such as `readable` nodes with declared key reads or `effectful` nodes with invalidation metadata.
2. Add graph nodes for relevant `ctx.nodes` without changing existing canonical graph output.
3. Use lowering only where it is deterministic and does not mutate context during graph derivation.
4. Add focused tests for one readable custom node and one effectful custom node.

### Acceptance Criteria

1. Canonical graph output remains stable for existing tests.
2. Custom trait-bearing nodes can appear in the reactive graph.
3. Trait-aware behavior is documented in tests and does not require string-matching plugin-specific kinds.
4. `vp check` and `vp test` pass.

---

## Milestone DI1a: Typed Context and Storage Location IR

### Problem

Client state, request context, session data, cookies, and DI requirements need a unified typed model. Without it, hydration, auth, placement, and generated clients will keep inventing local mechanisms.

### Target Design

Add first-class typed IR for context values and storage locations. Context values describe what a route/component/workflow requires; storage locations describe where the value can live and which capabilities or safety constraints apply.

### Implementation Steps

1. Add focused modules only if no suitable existing module can be extended. Prefer `src/context/context.ts` for context refs and `src/storage/locations.ts` for storage locations.
2. Define `ContextRef<Name, Ts>` with a phantom type and a narrow constructor such as `defineContext`.
3. Define `StorageLocation` as a discriminated union for at least `server.requestContext`, `client.localStorage`, `client.queryCache`, and `shared.cookie`.
4. Model storage capabilities with literal unions, not free strings. Include capabilities such as `persistent`, `sensitive_safe`, and `client_readable`.
5. Add `gen.context.define` only after the raw constructor and binder preserve inference.

### Acceptance Criteria

1. `gen.context.define("AuthSession", semantic.object(...))` infers the context value type without explicit type parameters.
2. Storage locations are narrow discriminated union branches.
3. Tests reject or diagnose invalid capability combinations without casts in test code.
4. `vp check` and `vp test` pass.

---

## Milestone DI1b: Context Provider Lifecycle Diagnostics

### Problem

Defining contexts and storage locations is not enough. The lifecycle checker must diagnose missing providers and unsafe placements.

### Target Design

Routes, components, workflows, and custom nodes can declare context requirements and providers. Lifecycle checks verify that requirements are satisfiable and that sensitive values are not placed into unsafe client-readable storage.

### Implementation Steps

1. Add minimal `requires` and `provides` metadata to the smallest existing surfaces needed for tests. Do not retrofit every API in one pass.
2. Register a module checker through `registerModuleChecker` following existing lifecycle patterns.
3. Emit branded/literal diagnostic codes such as `context:missing-provider` and `context:unsafe-storage-location`.
4. Add tests for one satisfied requirement, one missing provider, and one unsafe storage location.

### Acceptance Criteria

1. Missing context providers are diagnosed during `check`.
2. Sensitive context stored in unsafe client-readable locations is diagnosed.
3. Existing lifecycle checks continue to pass.
4. `vp check` and `vp test` pass.

---

## Milestone PE2a: Unified Enhancement and Fallback Planning

### Problem

`EnhancementPlan` and `FallbackPlan` both exist, but they are not yet a coherent planning model. Targets need one way to reason about preferred capability tiers, required capabilities, and degradation paths.

### Target Design

Unify enhancement and fallback semantics without breaking existing call sites. The IR should represent a baseline path, preferred path, required capabilities, and explicit degraded modes.

### Implementation Steps

1. Review `src/core/target.ts`, `src/rules/placement.ts`, and reactivity resources/mutations before editing.
2. Extend existing types rather than adding a second fallback abstraction.
3. Add degraded execution modes only as literal union branches with clear semantics, such as `degrade_to_server_form`, `degrade_to_refetch`, or `degrade_to_server_check`.
4. Add tests that construct enhancement/fallback plans directly and through one existing resource or mutation API.

### Acceptance Criteria

1. Existing `EnhancementPlan` and `FallbackPlan` users still compile or are intentionally migrated.
2. Fallback modes are explicit and typed.
3. No target generator changes are required for this milestone.
4. `vp check` and `vp test` pass.

---

## Milestone PE2b: Target Capability Diagnostics

### Problem

Target generation should not silently omit unsupported runtime behavior. Before changing generators, lifecycle checks should report when a target cannot satisfy a preferred plan and must use a fallback.

### Target Design

Targets advertise capabilities. Plans declare required and preferred capabilities. Lifecycle diagnostics explain unsupported preferred paths and selected fallbacks.

### Implementation Steps

1. Add target capability metadata only where it is needed for the first tests.
2. Add a lifecycle checker that compares plan requirements against target capabilities.
3. Emit diagnostics such as `target:fallback-selected` and `target:capability-missing`.
4. Add tests using a minimal fake target rather than modifying a production generator first.

### Acceptance Criteria

1. Unsupported preferred capabilities produce an actionable diagnostic.
2. A valid fallback prevents the condition from becoming a hard error unless no safe fallback exists.
3. Production generators are unchanged unless required by failing tests.
4. `vp check` and `vp test` pass.

---

## Milestone IVM1a: Patch Plan IR for Rule-Derived Reactivity

### Problem

The code can label a rule invalidation as `patchable`, but it does not yet describe the patch operation precisely enough for targets to generate safe incremental updates.

### Target Design

Introduce explicit patch plan IR for rule-derived invalidations. This IR should say what key family or materialized view is affected, which operation is possible, and why the plan is proven or conservative.

### Implementation Steps

1. Extend `src/reactivity/rule-derived.ts` with a narrow `RulePatchPlan` or equivalent field on `DerivedInvalidationPlan`.
2. Preserve the existing precision fields for compatibility unless a focused migration removes them cleanly.
3. Represent unsupported IVM explicitly with diagnostics or `deltaMode: "unsupported"` rather than omission.
4. Add tests around IR shape only; do not generate target runtime patches yet.

### Acceptance Criteria

1. Patchable plans contain enough typed information for a future target to apply an insert, update, delete, or key-level patch.
2. Unsupported cases remain visible and diagnostic-friendly.
3. Existing broad invalidation behavior is preserved as the safe fallback.
4. `vp check` and `vp test` pass.

---

## Milestone IVM1b: Simple Patchable Rule Cases

### Problem

True IVM is large. The first executable slice should only cover simple, provable cases.

### Target Design

Simple equality and foreign-key rules can derive exact patch plans. Negation, disjunction, temporal rules, cross-store rules, and complex exists forms remain conservative or unsupported.

### Implementation Steps

1. Implement patch derivation for simple equality on one field and simple foreign-key membership.
2. Add monotonicity checks only for the supported subset.
3. Keep non-monotonic or ambiguous cases on broad/matched invalidation with diagnostics.
4. Add tests for supported equality, supported foreign key, negation unsupported, disjunction unsupported, and cross-store fallback.

### Acceptance Criteria

1. Simple equality and foreign-key rules produce `patchable` plans with patch details.
2. Unsafe rules do not claim patchability.
3. Diagnostics explain why unsupported rules degrade.
4. `vp check` and `vp test` pass.

---

## Milestone RX1a: Reaction Outbox Lowering IR

### Problem

Reactions have idempotency and delivery metadata, but there is no canonical IR describing how a reaction lowers into transactional effect scheduling.

### Target Design

Define outbox lowering IR that represents event observation, idempotency key selection, transactional outbox write, and eventual effect execution.

### Implementation Steps

1. Extend `src/reaction/reaction.ts` or add a small companion module for `OutboxPlan` and reaction lowering results.
2. Do not simply add metadata fields that duplicate existing `DeliveryPlan`; connect `DeliveryPlan` to lowering semantics.
3. Lower reactions into descriptive IR first. Do not generate database schemas or queues in this milestone unless needed by tests.
4. Add tests for inline delivery, outbox delivery, custom idempotency, and missing idempotency where required.

### Acceptance Criteria

1. A reaction with outbox delivery lowers into typed outbox scheduling IR.
2. The lowering preserves the reaction's action input/output types.
3. Inline delivery remains representable and distinct from outbox delivery.
4. `vp check` and `vp test` pass.

---

## Milestone RX1b: Reaction Safety Diagnostics

### Problem

Effectful reactions can duplicate work or execute unsafely if delivery/idempotency semantics are missing or inconsistent.

### Target Design

Lifecycle checks diagnose unsafe reaction configurations and recommend outbox/idempotency settings where needed.

### Implementation Steps

1. Extend the existing reaction checker instead of creating a separate parallel checker.
2. Add diagnostics for outbox delivery without idempotency, non-idempotent external effects, and unsupported maintain-mode lowerings.
3. Keep rules pure; do not embed side effects in rule predicates.
4. Add tests covering safe and unsafe configurations.

### Acceptance Criteria

1. Unsafe reaction delivery plans produce diagnostics.
2. Safe inline and outbox plans pass checks.
3. No test requires manual mutation or casts to attach reaction metadata.
4. `vp check` and `vp test` pass.

---

## Milestone XFER1a: Transport, Hydration, and SingleFlight IR

### Problem

SingleFlight and hydration snapshots exist, but cross-boundary transport is still implicit. The compiler needs explicit IR for server/client data movement before target generation can be robust.

### Target Design

Represent transport choices, hydration payloads, resource snapshots, and mutation refresh bundles as typed IR. SingleFlight should bundle route loaders and stale resources using existing reactive graph information.

### Implementation Steps

1. Review `deriveSingleFlightPlan` and `deriveHydrationPlan` before editing.
2. Add explicit transport descriptors for at least HTTP RPC, form post, and WebSocket only if they are needed by tests.
3. Extend `HydrationSnapshot` with security-relevant metadata, such as whether a context/resource is client-serializable.
4. Extend `SingleFlightPlan` only enough to describe loader payloads and mutation refresh payloads.
5. Add tests using existing routes/resources/mutations.

### Acceptance Criteria

1. Hydration snapshots distinguish serializable and non-serializable/sensitive data.
2. SingleFlight plans describe which loaders/resources are bundled for a mutation.
3. Transport choices are explicit typed IR, not implicit strings in generators.
4. `vp check` and `vp test` pass.

---

## Milestone XFER1b: Target Fixture Generation for Bundled Fetches

### Problem

After the IR is stable, at least one target fixture should prove that bundled fetch planning is usable by generation code.

### Target Design

Use a small target fixture or existing lightweight generator to emit representative bundled fetch artifacts from `SingleFlightPlan` and `HydrationSnapshot`.

### Implementation Steps

1. Prefer a fixture generator over modifying production `effect-atom` or `tanstack-query` output first.
2. Generate enough TypeScript or JSON to prove imports, payload shape, and cache population boundaries.
3. Add snapshot or structural tests for generated artifacts.
4. Only after fixture tests pass, consider updating production targets in a separate milestone.

### Acceptance Criteria

1. A target fixture consumes SingleFlight and hydration IR without accessing private implementation details.
2. Generated artifacts include typed boundary payloads and cache/hydration population points.
3. Existing target outputs are not regressed.
4. `vp check` and `vp test` pass.

---

## Final Phase 3 Completion Criteria

Phase 3 is complete when all of the following are true:

1. Application-level extension uses the canonical trait and lowering protocol.
2. Custom plugin nodes can participate in graph derivation through traits or lowering.
3. Context requirements and storage locations are typed and lifecycle-checked.
4. Enhancement and fallback planning is explicit and target capability diagnostics are actionable.
5. Rule-derived reactivity can produce safe patchable plans for the supported simple subset and visible degradation for unsupported cases.
6. Reactions lower into explicit scheduling/outbox IR with safety diagnostics.
7. Hydration, transport, and SingleFlight plans are typed and can be consumed by at least one target fixture.
8. `vp check` and `vp test` pass after every completed milestone.
