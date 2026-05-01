# Phase 5.5 Agent Implementation Guide: Context, State, and Scope Ergonomics

This guide is a handoff plan for an AI coding agent executing Phase 5.5 of the `gen2` roadmap. Phase 5.5 focuses on removing boilerplate and unifying boundary concepts in the Dependency Injection (DI) and state management systems, without destroying the intentional separation of concerns.

## The "Why" of the Current Separation

Before unifying, we must understand why things are separated:
1. **State vs. Provider:** A `StateResource` defines the *canonical* shape, location, and storage mechanism of state (e.g., a global memory cache). A `Provider` defines the *delivery mechanism* for a requirement. A provider can narrow a state's lifetime (e.g., exposing an `app`-lifetime state only for a `request`) or add an additional caching layer (`placement`). Unifying them entirely would remove the ability to proxy or narrow state dynamically.
2. **ProviderScope vs. TrackingScope:** `ProviderScope` is about *identity* (e.g., "this database connection is scoped to `tenant: 'acme'`"). `TrackingScope` is about *reactivity* (e.g., "re-render this UI component"). Unifying them would confuse DI container bounds with reactive invalidation bounds.

## Primary Goal

Phase 5.5 introduces targeted ergonomics and unifies overlapping concepts (like Boundary Identity) to get the benefits of deduplication while preserving full type safety and inference.

## Recommended Milestone Order

1. **TYPE1: Simplify Requirement Targets (Remove `RequirementRef`)**
2. **TYPE2: Unified Boundary Identity (Unify `route`/`component` strings)**
3. **TYPE3: Auto-Providers and Default Sources**

---

## Milestone TYPE1: Simplify Requirement Targets

### Problem
`RequirementTarget` is a union of `RequirementRef | ContextDef | ServiceRef`. Both `ContextDef` and `RequirementRef` act as typed tokens for dependency injection. This forces the user to choose between "defining a context" and "defining a requirement", which are conceptually the same thing.

### Target Design
Eliminate `RequirementRef`. `ContextDef` is perfectly capable of representing any requirement (ambient or raw).

### Implementation Steps
1. Deprecate and remove `RequirementRef` and `defineRequirement` from `src/requirements/requirements.ts`.
2. Update `RequirementTarget` to be `ContextDef<Value> | ServiceRef<any>`.
3. Add `sensitivity` to `ContextDef` so it can carry the security metadata that `RequirementRef` previously held.
4. Update all internal code and tests that used `RequirementRef` to use `ContextDef`.

---

## Milestone TYPE2: Unified Boundary Identity

### Problem
`ProviderScope` defines component/route bounds via ad-hoc strings:
```ts
export interface ProviderScope {
  readonly route?: string;
  readonly component?: string;
  // ...
}
```
`TrackingScope` defines component/route bounds via `scope_kind` and `owner`:
```ts
export interface TrackingScope {
  readonly scope_kind: "render" | "route" | ...;
  readonly name: string;
}
```
Both refer to the *same* application boundaries (a UI component or a Route), but they use different shapes. This means the compiler cannot prove that a `Provider` scoped to the `UserProfile` component has the same lifetime as the `TrackingScope` of the `UserProfile` component.

### Target Design
Integrate with and expand the existing `RuntimeBoundary` primitive (from `src/boundary/boundary.ts`) to serve as the unified boundary for logical scopes as well as physical placement.

### Implementation Steps
1. Expand the existing `RuntimeBoundary` union in `src/boundary/boundary.ts` (or rename it to a more general `Boundary`) to include logical/lifecycle bounds:
```ts
export type Boundary = 
  | RuntimeBoundary // existing physical bounds (browser, server, etc.)
  | { readonly kind: "component_boundary"; readonly name: string }
  | { readonly kind: "route_boundary"; readonly name: string }
  | { readonly kind: "tenant_boundary"; readonly name: string }
  | { readonly kind: "transaction_boundary"; readonly name: string };
```
2. Update `ProviderScope` to reference this unified `Boundary` instead of ad-hoc strings.
3. Update `TrackingScope` to reference a `Boundary` as its owner instead of an ad-hoc `owner` string.
4. This ensures that the DI planner and the Reactivity graph use the exact same identity keys to match lifetimes, and aligns them with the rest of the boundary graph.

---

## Milestone TYPE3: Auto-Providers and Default Sources

### Problem
Wiring a state resource to a context requires 3 declarations:
1. `defineContext`
2. `defineStateResource`
3. `defineProvider` (to link them)
This boilerplate is unnecessary for 90% of cases where the context exactly matches the state.

### Target Design
Allow `ContextDef` to declare a `default_source`, and `StateResource` to declare `provides_context`. The context compilation phase should implicitly generate the `Provider` wiring.

### Implementation Steps
1. Add `default_source?: ProviderSource<T>` to `ContextDef`.
2. Add `provides_context?: ContextDef<Value>` to `StateResource`.
3. During context graph generation (`createGen` or plan compilation), automatically synthesize a `Provider` for any `ContextDef` with a `default_source`, and any `StateResource` with a `provides_context`.
4. The synthesized provider inherits the `lifetime`, `sensitivity`, and `storage` of the state, ensuring type safety and correct lifecycle diagnostics without user boilerplate.
