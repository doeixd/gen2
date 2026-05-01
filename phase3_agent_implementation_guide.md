# Phase 3 Agent Implementation Guide: IR Architecture and Semantic Expansion

This guide is a handoff plan for an AI coding agent that is executing Phase 3 of the `gen2` domain compiler roadmap. Follow it literally. 

## Primary Goal

The goal of Phase 3 is to elevate the Intermediate Representation (IR) from a closed, function-heavy state into a truly extensible, target-agnostic compiler. This means expanding the IR to natively understand Application Context (DI), Progressive Enhancement, Advanced Rule Inference (IVM), and Cross-Boundary Transports (SingleFlight).

**CRITICAL RULES FOR THE AGENT:**
1. **Never use `as unknown as`, `as any`, or `as never`** in type paths or public APIs. The type system must be sound.
2. **Never allocate objects inside fluent builders.** Use mutable internal state (`this.state`) and freeze it on `.build()`.
3. **Do not mutate the GenContext incorrectly.** If you must add to an array, and the array is frozen/readonly, replace the array safely.
4. **`vp check` and `vp test` MUST pass** after every milestone. Do not skip ahead if tests are failing.

---

## Recommended Milestone Order

1. **ARCH1: Open Trait-Based Composition**
2. **DI1: Typed Context and Storage Locations**
3. **PE2: Progressive Enhancement and Fallbacks**
4. **IVM1: Rule-Derived Incremental View Maintenance**
5. **RX1: Reactions and Outbox Planning**
6. **XFER1: Cross-Boundary Transports and SingleFlight**

---

## Milestone ARCH1: Open Trait-Based Composition

### Problem
The current IR relies heavily on closed node kinds (e.g., `QueryFunction`, `ActionFunction`). Application-level concepts (Workflows, Services, Reports) should be open for extension by plugins without breaking the graph compiler.

### Target Design
Formalize a trait-based protocol where custom plugin nodes can participate in the graph. Introduce generic composition primitives (`gen.plan.sequence`, `gen.plan.parallel`) that operate on traits rather than concrete kinds.

### Implementation Steps
1. Formalize the `StaticNode` trait interfaces (`CallableNode`, `ReadableNode`, `EffectfulNode`, etc.) in `src/core/node.ts` to ensure plugin-defined nodes can implement them cleanly without requiring a `kind` of `"query_function"`.
2. Introduce a `LowerableNode` interface (`lowersTo?: () => readonly StaticNode[]`) in `src/core/node.ts`.
3. Update `checkReactivity` and `deriveReactiveGraph` to inspect traits and `lowersTo` rather than just string-matching node kinds.
4. Build trait-aware plan combinators (`gen.plan.sequence`, `gen.plan.parallel`) in a new `src/plan/plan.ts` module, and expose them via `gen.plan`.

### Acceptance Criteria
- Plugins can define custom nodes that seamlessly participate in routing, reactivity, and target generation via traits or lowering.
- `vp check` and `vp test` pass.

---

## Milestone DI1: Typed Context and Storage Locations

### Problem
Client state and context injection (DI) are currently handled haphazardly. The compiler lacks a unified model for where data lives and how dependencies are satisfied.

### Target Design
Make "Storage Locations" and "Context Requirements" first-class typed IR. 

### Implementation Steps
1. Create `src/context/context.ts` and `src/storage/locations.ts`.
2. Define `StorageLocation` IR kinds (`server.requestContext`, `client.localStorage`, `client.queryCache`, `shared.cookie`) with semantic capabilities (`persistent`, `sensitive-safe`, `client-readable`).
3. Add `gen.context.define` to represent typed environmental or session state (e.g., `AuthSession`, `TenantContext`).
4. Allow routes, components, and workflows to declare `requires: [AuthSession]` and `provides: [{ context: AuthSession, from: client.localStorage }]`.
5. Enhance `src/lifecycle/lifecycle.ts` to emit diagnostics for unsafe placements (e.g., storing a sensitive secret in `client.localStorage` or failing to provide a required context).

### Acceptance Criteria
- Storage locations and contexts are fully typed and validated during the lifecycle `check` phase.
- `vp check` and `vp test` pass.

---

## Milestone PE2: Progressive Enhancement and Fallbacks

### Problem
Targets currently generate a single blessed path. Real apps need progressive enhancement (e.g., try Optimistic UI, fallback to standard fetch, fallback to server-rendered form).

### Target Design
Build out the `EnhancementPlan` seed (from PE1) into a full fallback planning system for actions, routes, and resources.

### Implementation Steps
1. Expand `FallbackPlan` in `src/rules/placement.ts` to represent degraded execution modes (e.g., `degrade_to_server_form`, `degrade_to_refetch`).
2. Update target generators (like `effect-atom`) to wrap generated hooks/atoms in progressive enhancement boundaries.
3. Validate in `lifecycle.ts` that required capabilities for the primary plan are actually supported by the target runtime, emitting a fallback diagnostic if they are not.

### Acceptance Criteria
- Target generation emits explicit fallback logic.
- Diagnostics correctly warn when a target forces a fallback plan.
- `vp check` and `vp test` pass.

---

## Milestone IVM1: Rule-Derived Incremental View Maintenance

### Problem
Rule-derived reactivity currently relies on Level 1 "broad" invalidation. We correctly identify overlap, but we don't execute true Incremental View Maintenance (IVM).

### Target Design
Elevate rule dependency extraction to derive exact patches and materialized view maintenance queries.

### Implementation Steps
1. Enhance `src/reactivity/rule-derived.ts`.
2. Map relational queries and rules into delta-queries (insert/update/delete -> exact key additions/removals).
3. Update `checkRuleReactivity` to determine if a rule is purely monotonic and safe for IVM.
4. Generate exact invalidation plans (`precision: "patchable"`) where supported.

### Acceptance Criteria
- Simple equality and foreign-key rules derive exact cache patches (`patchable`) instead of `broad` collection invalidation.
- `vp check` and `vp test` pass.

---

## Milestone RX1: Reactions and Outbox Planning

### Problem
Reactions ("when project becomes overdue, send notification") are defined but lack execution safety guarantees (idempotency, outbox).

### Target Design
Formalize the translation of a `Reaction` into an `EventSubscription`, an `ActionFunction`, and an `OutboxPlan`.

### Implementation Steps
1. Add `OutboxPlan` and `DeliveryGuarantee` metadata to `Reaction` in `src/reaction/reaction.ts`.
2. Generate required schemas for an outbox table/queue storage.
3. Add a lowering hook to translate reactions into transactional sequences that write to the outbox and schedule the effect.

### Acceptance Criteria
- Reactions correctly lower into transactional effect-scheduling IR.
- `vp check` and `vp test` pass.

---

## Milestone XFER1: Cross-Boundary Transports and SingleFlight

### Problem
Routes and client/server boundaries currently rely on implicit HTTP calls. `SingleFlight` is stubbed but not fully utilized for bundling loader data and mutation invalidations across the network.

### Target Design
Formalize the network boundary with explicit RPC, WebSocket, or HTTP transports, and bundle state synchronization.

### Implementation Steps
1. Build out `@gen/singleflight` logic in `src/reactivity/reactivity.ts` to bundle route loader queries and client-state resources into single requests.
2. Allow `CallPlan` to map mutation responses to the updated payloads of loaders marked as stale, preventing double-round-trips.
3. Formalize `HydrationSnapshot` in `src/hydration/hydration.ts` to securely serialize and dehydrate context/resources across the server-client gap.

### Acceptance Criteria
- Server targets can generate bundled SingleFlight endpoints.
- Client targets can generate bundled RPC/HTTP fetchers that automatically populate the reactivity cache.
- `vp check` and `vp test` pass.