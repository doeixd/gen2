# Phase 7 Agent Implementation Guide: Boundary Unification, Dependency Resolution, and Storage Abstraction

This guide is a handoff plan for an AI coding agent executing Phase 7 of the `gen2` roadmap.

Phase 5 focused on unifying computation (`Callable`, `Dispatch`, `StoredValue`).
Phase 6 focused on unifying the compiler machinery (`CheckerRegistry`, `EmitterFramework`, `EntityView`).

Phase 7 focuses on **unifying the edges of the system**: how data crosses the network, how dependencies are injected, and how physical storage is mapped. By unifying these remaining primitives, the IR will become strictly orthogonal, removing the last parallel sources of truth.

## Primary Goal

Phase 7 makes network boundaries, dependency injection, and physical storage uniformly composable, completing the unification of the primitive graph.

The core outcomes are:

1. **Network Boundaries:** `Route`, `AppRoute`, `Getter`, `Mutator`, and `BoundaryCallPlan` are unified into a single `Boundary` primitive representing any cross-environment transition.
2. **Dependency Resolution:** `ContextDef`, `ServiceRef`, `RequirementRef`, and `ContextRequirement` are unified into a strict `Requirement` & `Provider` protocol.
3. **Physical Storage:** `Table`, `Collection`, and `Keyspace` are unified into a `StorageContainer` protocol, simplifying the mapping layer.
4. **UI Styling:** `Style`, `Theme`, and `Behavior` are unified under a `DesignSystem` primitive.

## Recommended Milestone Order

1. **UNIFY1: Network Boundary Unification (`Boundary`)**
2. **UNIFY2: Dependency Resolution Protocol (`Requirement` & `Provider`)**
3. **UNIFY3: Physical Storage Unification (`StorageContainer`)**
4. **UNIFY4: UI Token and Behavior Unification (`DesignSystem`)**
5. **UNIFY5: Dead Code Elimination and Artifact Shaking**

**Dependency chain:** UNIFY1 and UNIFY2 are critical for simplifying how full-stack targets are generated. UNIFY3 simplifies database generation. UNIFY4 cleans up the frontend. Do not skip ahead.

---

## Milestone UNIFY1: Network Boundary Unification (`Boundary`)

### Problem

Currently, `gen2` has overlapping primitives for crossing network boundaries:

- `Route` (HTTP semantic)
- `AppRoute` (frontend router semantic)
- `Getter` / `Mutator` (RPC/SDK semantic)
- `BoundaryCallPlan` (internal plan semantic)

If an `ActionFunction` is executed from the client, the compiler currently has to track it through multiple separate arrays to determine if it needs an RPC route, a REST endpoint, or a server action.

### Target Design

Extract a unified `Boundary<Transport>` primitive. A Boundary represents the transition of a `Callable` or `Dispatch` across an environment (e.g., Client → Server, Edge → Server).

Routes, Getters, and Mutators become views over a `Boundary`.

```ts
interface Boundary<TTransport = unknown> {
  readonly kind: "boundary";
  readonly name: string;
  readonly payload: Callable | Dispatch;
  readonly from_env: "client" | "edge" | "server";
  readonly to_env: "server" | "worker" | "database";
  readonly transport: TTransport; // e.g. HTTP REST, RPC, WebSockets
}
```

### Implementation Steps

1. Create `src/boundary/boundary.ts`.
2. Define the `Boundary` IR.
3. Rewrite `gen.api.route`, `gen.api.getter`, and `gen.router.appRoute` to internally construct `Boundary` nodes.
4. Replace `ctx.routes`, `ctx.app_routes`, `ctx.getters`, and `ctx.mutators` with `ctx.boundaries`. Provide backward-compatible getters on `GenContext` (like in Phase 5).
5. Update `deriveReactiveGraph` to emit `crosses_boundary` edges.
6. Write tests proving a single `Boundary` can lower to either a REST route or an RPC getter depending on the emitter.

### Diagnostics

```txt
boundary:unsupported-transport
boundary:invalid-environment-crossing
boundary:payload-not-serializable
```

### Acceptance Criteria

1. `Boundary` primitive exists and adapters are implemented for routes and getters.
2. `GenContext` tracks `ctx.boundaries`.
3. Graph derivation uses the unified boundary representation.
4. Existing route tests pass unchanged.

---

## Milestone UNIFY2: Dependency Resolution Protocol (`Requirement` & `Provider`)

### Problem

The context layer has multiple ways of asking for dependencies:

- `ContextDef` and `ContextRequirement` (for contextual state like `AuthSession`)
- `ServiceRef` (for singletons like `StripeClient`)
- `RequirementRef` (abstract capabilities)

The `providers` array tries to satisfy these, but the disjointed requirement types make the `ProviderPlan` overly complex.

### Target Design

Unify all dependencies into a single `Requirement<T>` primitive, and all satisfactions into a `Provider<T>` primitive.

```ts
interface Requirement<T = unknown> {
  readonly kind: "requirement";
  readonly name: string;
  readonly value_type: SemanticType<T>;
  readonly lifetime: "singleton" | "request" | "transient";
}

interface Provider<T = unknown> {
  readonly kind: "provider";
  readonly requirement: Requirement<T>;
  readonly factory: Callable<any, T>;
}
```

### Implementation Steps

1. Create `src/requirements/protocol.ts`.
2. Convert `ContextDef`, `ServiceRef`, and `RequirementRef` into aliases for `Requirement`.
3. Update `Callable` and `Dispatch` so their phantom `_requires` array uses `Requirement`.
4. Update `deriveRequirementPlan` to solve the dependency graph universally, treating contextual state and external services identically.
5. Emit diagnostics for circular dependencies or unsatisfied requirements.

### Diagnostics

```txt
requirement:unsatisfied
requirement:circular-dependency
provider:lifetime-mismatch
```

### Acceptance Criteria

1. `Requirement` and `Provider` uniformly handle all dependency injection.
2. `ContextDef` and `ServiceRef` constructors return `Requirement` objects.
3. The topological planner correctly sequences provider initialization.

---

## Milestone UNIFY3: Physical Storage Unification (`StorageContainer`)

### Problem

`Table`, `Collection`, and `Keyspace` are separate structures in `src/storage/storage.ts`. This forces mapping and projection logic to use heavily discriminated unions (`if (kind === "column") ... else if (kind === "document_field")`).

### Target Design

Introduce a unified `StorageContainer` and `StorageField` protocol.

```ts
interface StorageContainer {
  readonly kind: "storage_container";
  readonly name: string;
  readonly storage_model: "relational" | "document" | "kv";
  readonly fields: readonly StorageField[];
  readonly indexes: readonly Index[];
}
```

Tables, Collections, and Keyspaces become views over `StorageContainer`. This allows `FieldMapping` to treat all physical persistence identically until target generation.

### Implementation Steps

1. Refactor `src/storage/storage.ts` to introduce `StorageContainer` and `StorageField`.
2. Rewrite `Table`, `Collection`, and `Keyspace` as aliases/adapters over `StorageContainer`.
3. Simplify `MappingSource` and `MappingTarget`: instead of `column` vs `document_field`, they just reference a `StorageField`.
4. Verify that schema derivation tests pass seamlessly.

### Diagnostics

```txt
storage:unsupported-model-mapping
storage:field-physical-type-mismatch
```

### Acceptance Criteria

1. `StorageContainer` unifies physical models.
2. Mappings reference `StorageField` generically.
3. Database target emitters from Phase 6 correctly interpret `storage_model`.

---

## Milestone UNIFY4: UI Token and Behavior Unification (`DesignSystem`)

### Problem

`Theme` (colors/fonts), `Style` (CSS mappings), and `Behavior` (JS event handlers) are tracked separately in `GenContext`. A UI Target Emitter has to manually stitch together which themes apply to which styles for which components.

### Target Design

Unify them under a `DesignSystem` primitive that acts as a graph of visual obligations.

```ts
interface DesignSystem {
  readonly kind: "design_system";
  readonly name: string;
  readonly tokens: readonly ThemeToken[];
  readonly styles: readonly Style[];
  readonly behaviors: readonly Behavior[];
  readonly components: readonly Component[];
}
```

### Implementation Steps

1. Create `src/ui/design-system.ts`.
2. Introduce the `DesignSystem` primitive.
3. Replace the flat `themes`, `styles`, and `behaviors` arrays in `GenContext` with a unified `design_systems` array.
4. Update `EntityView` (Phase 6) to declare which `DesignSystem` it adheres to.

### Diagnostics

```txt
ui:missing-design-system
ui:unresolved-theme-token
```

### Acceptance Criteria

1. `DesignSystem` correctly encapsulates visual primitives.
2. `EntityView` nodes map cleanly to a design system.
3. UI Target Emitters consume a single cohesive graph of styles.

---

## Milestone UNIFY5: Dead Code Elimination and Artifact Shaking

### Problem

As the IR graph grows and is unified, the compiler stores a massive amount of data. If an entity is defined but never queried, or a `Dispatch` is defined but never routed, the target emitters might generate dead code (e.g., unused SQL tables, unused API routes).

### Target Design

Implement a "Graph Shaker" inside the `EmitterFramework` (from Phase 6). It will prune the `ReactiveGraph` starting from the application's root entrypoints (`Boundary` nodes, UI components) to determine which IR nodes are actually reachable.

### Implementation Steps

1. Update `src/core/context.ts` or `src/targets/emitter.ts`.
2. Introduce a `pruneGraph(ctx: GenContext): GenContext` step that strips out unreferenced nodes before handing the context to the `ArtifactEmitter`s.
3. Add an escape hatch (`force_emit: true`) for nodes that must be emitted regardless of reachability (e.g., for library building).
4. Add tests proving that unreferenced entities do not produce SQL artifacts.

### Diagnostics

```txt
shaker:unreachable-node-pruned
```

### Acceptance Criteria

1. Unreferenced IR nodes do not yield generated artifacts.
2. Shaking is deterministic.
3. `vp check` and `vp test` pass with no memory leaks or undefined references in target outputs.

---

## Final Phase 7 Completion Criteria

Phase 7 is complete when all of the following are true:

1. `Boundary` unifies network edges.
2. `Requirement` and `Provider` unify dependency injection.
3. `StorageContainer` unifies physical database schemas.
4. `DesignSystem` unifies UI tokens, styles, and behaviors.
5. Graph Pruning ensures generated targets only contain reachable code.
6. The old primitive arrays are deprecated but fully backward compatible.
7. `vp check` and `vp test` pass without regressions.
