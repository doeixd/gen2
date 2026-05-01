# Phase 6 Agent Implementation Guide: Lifecycle Registry, Target Framework, and UI Primitive Unification

This guide is a handoff plan for an AI coding agent executing Phase 6 of the `gen2` roadmap. Phase 6 is an architectural unification phase focused on removing duplicated infrastructure across lifecycle checkers, target fixtures, and UI derivations. It builds directly on Phase 5's primitive unification work.

Phase 5 unified:

- Events + Reactions → `Dispatch`
- Function types → `Callable`
- Workflow steps → `ComposablePlan` views
- StateResource + OfflineQueuePlan → `StoredValue`
- MergeStrategy + MonoidOp → `Combiner`

Phase 6 completes the unification by addressing the remaining duplicated infrastructure:

- 30+ standalone lifecycle checkers → `Checker` registry protocol
- 6+ standalone target fixtures → `ArtifactEmitter` framework
- 4+ standalone UI derivations (Form, Editor, List, Crud) → `EntityView`

## Primary Goal

Phase 6 makes lifecycle, targets, and UI derivations plugin-extensible and internally unified.

The core outcome is that:

1. Any module can register a `Checker<T>` for its primitive type, and the lifecycle runner topologically sorts and executes them.
2. Any module can register an `ArtifactEmitter<Input, Artifact>` for its target, and the generation pipeline runs them in dependency order.
3. Forms, editors, lists, and CRUD are derivations of `EntityView`, not independent context arrays.

## What Phase 6 Is Not

Phase 6 is not a new feature expansion phase. It does not add new semantic primitives, new target languages, or new UI frameworks. It is an internal consolidation phase that makes the existing architecture more maintainable and plugin-friendly.

Phase 6 does not break public APIs. All existing `gen.*` constructors, `check*` functions, and target fixtures remain available as wrappers or aliases over the unified infrastructure.

**Critical rule:** Do not delete old context arrays (`forms`, `editors`, `lists`, `cruds`, `events`, `reactions`, `state_resources`, `offline_queues`) from `GenContext`. Populate both old and new arrays during registration so existing tests and consumers continue to work.

## Recommended Milestone Order

1. **TYPE1: Checker Registry Protocol**
2. **TYPE2: ArtifactEmitter Target Framework**
3. **TYPE3: EntityView Unification (Forms, Editors, Lists, CRUD)**
4. **TYPE4: Plugin Registration APIs for Checkers and Emitters**
5. **TYPE5: Graph Integration and Performance**
6. **TYPE6: Documentation and Backward Compatibility**

**Dependency chain:** TYPE1 → TYPE2 → TYPE3 → TYPE4 → TYPE5. Do not skip ahead. EntityView unification (TYPE3) depends on both the checker protocol (TYPE1) and the emitter framework (TYPE2) because EntityViews must register their own checkers and emitters. Plugin registration (TYPE4) depends on TYPE1 and TYPE2 because it exposes the registries. Graph integration (TYPE5) depends on all prior milestones.

---

## Milestone TYPE1: Checker Registry Protocol

### Problem

`src/lifecycle/lifecycle.ts` currently registers ~30 standalone checker functions inside `registerBuiltInModuleCheckers`:

```ts
// src/lifecycle/lifecycle.ts, lines 282-385
registerModuleChecker(ctx, (ctx) => checkEntityInvariants(ctx.entities));
registerModuleChecker(ctx, (ctx) => checkRefsExist(ctx.refs, ctx.entities));
registerModuleChecker(ctx, (ctx) => checkContractsAndActors(ctx.contracts, ctx.actors));
// ... 28 more
```

Each checker is an ad-hoc function pushed onto `ctx.moduleCheckers: ((ctx: GenContext) => readonly Diagnostic[])[]`. The lifecycle runner iterates this array in insertion order (lines 805-809).

Adding a new primitive requires:

1. Writing a new `checkX` function.
2. Manually registering it in `registerBuiltInModuleCheckers`.
3. Ensuring it runs after its dependencies by ordering the registration calls correctly.
4. There is no way for a plugin to register a checker.

### Target Design

Define a `Checker<T>` protocol with a standardized interface, dependency graph, and execution order. Checkers register by name. The lifecycle runner topologically sorts them by declared dependencies before execution.

The existing `check*` functions (`checkEntityInvariants`, `checkRefsExist`, `checkFunctions`, etc.) are pure functions that take arrays and return diagnostics. They do NOT change. Only the registration and execution layers change.

### Core Types

Create `src/lifecycle/checker.ts`:

```ts
export interface Checker<T> {
  readonly name: string;
  readonly input_selector: (ctx: GenContext) => readonly T[];
  readonly check: (items: readonly T[], ctx: GenContext) => readonly Diagnostic[];
  readonly dependencies: readonly string[];
  readonly priority: number;
}

export interface CheckerRegistry {
  readonly checkers: ReadonlyMap<string, Checker<unknown>>;
  readonly register: <T>(checker: Checker<T>) => void;
  readonly run: (ctx: GenContext) => readonly Diagnostic[];
}

export const createCheckerRegistry = (): CheckerRegistry => {
  const checkers = new Map<string, Checker<unknown>>();

  return {
    get checkers() {
      return new Map(checkers);
    },
    register: <T>(checker: Checker<T>) => {
      if (checkers.has(checker.name)) {
        throw new Error(`Checker "${checker.name}" is already registered`);
      }
      checkers.set(checker.name, checker as Checker<unknown>);
    },
    run: (ctx: GenContext) => {
      const sorted = topologicalSort(Array.from(checkers.values()));
      const out: Diagnostic[] = [];
      for (const checker of sorted) {
        const items = checker.input_selector(ctx);
        out.push(...checker.check(items, ctx));
      }
      return out;
    },
  };
};
```

### Implementation Steps

1. Create `src/lifecycle/checker.ts` with the types and `createCheckerRegistry()` above.
2. Implement topological sort in `src/lifecycle/checker.ts`. If a dependency is missing, emit a diagnostic and skip the checker. If a cycle is detected, emit a diagnostic and break the cycle arbitrarily.
3. Add `checker_registry: CheckerRegistry` to `GenContext` in `src/core/context.ts`.
4. Update `createGen` in `src/core/context.ts` to create the registry:
   ```ts
   checker_registry: createCheckerRegistry(),
   ```
5. Define built-in checkers in `src/lifecycle/lifecycle.ts` as `Checker` objects. Place them after the existing `check*` functions but before `registerBuiltInModuleCheckers`:

   ```ts
   const entityChecker: Checker<Entity> = {
     name: "entity",
     input_selector: (ctx) => ctx.entities,
     check: (entities, _ctx) => checkEntityInvariants(entities),
     dependencies: [],
     priority: 0,
   };

   const functionsChecker: Checker<FunctionCatalog> = {
     name: "function",
     input_selector: (ctx) => buildFunctionCatalog(ctx),
     check: (catalog, _ctx) => checkFunctions(catalog),
     dependencies: ["entity"],
     priority: 10,
   };
   // ... define one Checker per existing check* registration
   ```

6. Rewrite `registerBuiltInModuleCheckers` to register through the registry:
   ```ts
   export const registerBuiltInModuleCheckers = (ctx: GenContext): void => {
     if (ctx.builtInModuleCheckersRegistered) return;
     ctx.checker_registry.register(entityChecker);
     ctx.checker_registry.register(refsChecker);
     ctx.checker_registry.register(functionsChecker);
     // ... all ~30 checkers
     ctx.builtInModuleCheckersRegistered = true;
   };
   ```
7. Update the lifecycle runner (the loop at lines 805-809) to use `ctx.checker_registry.run(ctx)` instead of iterating `ctx.moduleCheckers`.
8. Keep `ctx.moduleCheckers` populated for backward compatibility: after registering built-in checkers, also push a wrapper function onto `ctx.moduleCheckers` that calls `ctx.checker_registry.run(ctx)`.
9. Add tests in a new file `tests/checker-registry.test.ts`:
   - Prove checkers run in dependency order.
   - Prove cyclic dependencies produce a `checker:circular-dependency` diagnostic.
   - Prove missing dependencies produce a `checker:missing-dependency` diagnostic.
   - Prove existing lifecycle tests still produce identical diagnostics.

### Diagnostics

```txt
checker:circular-dependency
checker:missing-dependency
checker:duplicate-name
checker:execution-failed
```

### Acceptance Criteria

1. `src/lifecycle/checker.ts` exists with `Checker`, `CheckerRegistry`, `createCheckerRegistry`, and topological sort.
2. `GenContext` has `checker_registry: CheckerRegistry`.
3. All ~30 existing checkers are defined as `Checker` objects and registered in `registerBuiltInModuleCheckers`.
4. The lifecycle runner uses `ctx.checker_registry.run(ctx)`.
5. Existing diagnostic output is unchanged.
6. Cyclic and missing dependencies produce diagnostics.
7. `vp check` and `vp test` pass.

---

## Milestone TYPE2: ArtifactEmitter Target Framework

### Problem

`src/targets/client.ts`, `src/targets/server.ts`, `src/targets/docs.ts`, `src/targets/tests.ts`, `src/targets/devtools.ts`, and `src/targets/matrix.ts` all follow the same ad-hoc pattern:

```ts
// Example from src/targets/client.ts
export interface ClientProviderArtifact {
  readonly kind: "client_provider_artifact";
  readonly target: "client";
  readonly provider_bindings: readonly ClientProviderBinding[];
  // ...
}

export const lowerClientProviders = (ctx: GenContext): ClientProviderArtifact => { ... };
```

Each target:

- Invents its own artifact type.
- Has no shared registry.
- Has no dependency tracking.
- Has no caching. Each target re-derives intermediate graphs.

### Target Design

Define an `ArtifactEmitter<Input, Artifact>` protocol with a target registry, dependency graph, and caching layer. Emitters register by name. The generation pipeline topologically sorts them, caches intermediate results, and runs them in dependency order.

The existing target fixture functions (`lowerClientProviders`, `lowerServerProviders`, `generateTestSuites`, etc.) are pure functions that take `GenContext` and return artifacts. They do NOT change. Only the registration and execution layers change.

### Core Types

Create `src/targets/emitter.ts`:

```ts
export interface Artifact {
  readonly kind: string;
  readonly target: string;
  readonly source_refs: readonly Ref[];
  readonly content: unknown;
}

export interface ArtifactEmitter<Input, Out extends Artifact> {
  readonly name: string;
  readonly target: string;
  readonly dependencies: readonly string[];
  readonly derive_input?: (ctx: GenContext) => Input;
  readonly emit: (ctx: GenContext, input: Input) => readonly Out[];
}

export interface EmitterRegistry {
  readonly emitters: ReadonlyMap<string, ArtifactEmitter<unknown, Artifact>>;
  readonly register: <Input, Out extends Artifact>(emitter: ArtifactEmitter<Input, Out>) => void;
  readonly run: (ctx: GenContext, target_filter?: readonly string[]) => readonly Artifact[];
}
```

### Implementation Steps

1. Create `src/targets/emitter.ts` with the types above.
2. Implement `createEmitterRegistry()` in `src/targets/emitter.ts`:
   - Topological sorting by `dependencies`.
   - Caching: cache artifacts per-emitter per-context-generation. Use a cache keyed by `(emitter_name, ctx_generation_id)` where `ctx_generation_id` is a monotonic counter incremented whenever a primitive is registered.
   - Target filtering: `run(ctx, ["client", "server"])` runs only emitters whose `target` is in the filter.
3. Define built-in emitters in `src/targets/index.ts` or a new `src/targets/built-in-emitters.ts`:
   ```ts
   const clientProviderEmitter: ArtifactEmitter<void, ClientProviderArtifact> = {
     name: "client_providers",
     target: "client",
     dependencies: ["requirements"],
     emit: (ctx) => [lowerClientProviders(ctx)],
   };
   ```
4. Add `emitter_registry: EmitterRegistry` to `GenContext` in `src/core/context.ts`.
5. Update `createGen` to create the registry.
6. Update the generation pipeline in `src/core/context.ts` or `src/gen.ts` to call `ctx.emitter_registry.run(ctx)`.
7. Add `ctx.generation_id: number` to `GenContext`. Increment it whenever any `registerX` function is called (e.g., `registerEntity`, `registerActionFunction`). This is the cache invalidation mechanism.
8. Add tests in a new file `tests/emitter-registry.test.ts`:
   - Prove emitters run in dependency order.
   - Prove target filtering works.
   - Prove caching works (second run with same generation_id returns cached artifacts).
   - Prove cache invalidation works (after registering a new primitive, generation_id increments and cache is cleared).
   - Prove existing target fixture tests still produce identical artifacts.

### Diagnostics

```txt
emitter:circular-dependency
emitter:missing-dependency
emitter:duplicate-name
emitter:target-unsupported
```

### Acceptance Criteria

1. `src/targets/emitter.ts` exists with `Artifact`, `ArtifactEmitter`, `EmitterRegistry`, and `createEmitterRegistry`.
2. `GenContext` has `emitter_registry: EmitterRegistry` and `generation_id: number`.
3. All existing target fixtures are wrapped as `ArtifactEmitter` objects and registered.
4. The generation pipeline uses `ctx.emitter_registry.run(ctx)`.
5. Existing artifact output is unchanged.
6. Target filtering and caching work correctly.
7. `vp check` and `vp test` pass.

---

## Milestone TYPE3: EntityView Unification (Forms, Editors, Lists, CRUD)

### Problem

`src/forms/forms.ts`, `src/editor/editor.ts`, `src/list/list.ts`, and `src/crud/crud.ts` all derive UI from entities and actions but maintain separate context arrays and separate checker functions:

```ts
// src/core/context.ts
readonly forms: Form[];
readonly editors: Editor[];
readonly lists: List<unknown>[];
readonly cruds: Crud<unknown>[];
```

Each has its own constructor, checker, and target fixture path. But conceptually they are all views over an entity with associated queries and actions.

### Target Design

Introduce `EntityView` as the unified primitive. Keep `Form`, `Editor`, `List`, and `Crud` as backward-compatible type aliases or views. Populate both old and new context arrays during registration.

**Do not remove `forms`, `editors`, `lists`, or `cruds` from `GenContext`.** The old arrays stay populated for backward compatibility. New code uses `entity_views`.

### Core Types

Create `src/ui/entity-view.ts`:

```ts
export type EntityViewMode = "form" | "editor" | "list" | "crud" | "detail" | "card";

export interface EntityView<Out = unknown> {
  readonly kind: "entity_view";
  readonly name: string;
  readonly entity: Entity;
  readonly mode: EntityViewMode;
  readonly query?: QueryFunction<unknown, Out>;
  readonly actions: readonly ActionFunction[];
  readonly view: View;
  readonly validation?: readonly ValidationRule[];
  readonly pagination?: PaginationConfig;
  readonly filters?: readonly FilterConfig[];
}
```

### Implementation Steps

1. Create `src/ui/entity-view.ts` with the types above.
2. Implement `defineEntityView` in `src/ui/entity-view.ts`.
3. Implement derivation functions (sugar, not new primitives) in `src/ui/entity-view.ts`:

   ```ts
   export const deriveForm = (entity: Entity, action: ActionFunction, view: View): EntityView =>
     defineEntityView({ entity, mode: "form", actions: [action], view });

   export const deriveEditor = (entity: Entity, crud: Crud, view: View): EntityView =>
     defineEntityView({
       entity,
       mode: "editor",
       actions: [crud.create, crud.update, crud.delete],
       view,
     });

   export const deriveList = (entity: Entity, query: QueryFunction, view: View): EntityView =>
     defineEntityView({ entity, mode: "list", query, view });

   export const deriveCrudView = (entity: Entity, crud: Crud, view: View): EntityView =>
     defineEntityView({
       entity,
       mode: "crud",
       query: crud.list,
       actions: [crud.create, crud.update, crud.delete],
       view,
     });
   ```

4. Add `entity_views: EntityView[]` to `GenContext` in `src/core/context.ts`.
5. Update existing registration functions to populate BOTH arrays:
   - When `gen.forms.defineForm` is called, push to both `ctx.forms` AND `ctx.entity_views`.
   - When `gen.editors.defineEditor` is called, push to both `ctx.editors` AND `ctx.entity_views`.
   - Same for `gen.lists.defineList` and `gen.crud.deriveCrud`.
6. Implement `checkEntityViews` in `src/ui/entity-view.ts` or `src/lifecycle/lifecycle.ts`. This replaces `checkForms`, `checkEditors`, `checkLists`, and `checkCrud`.
7. Register `checkEntityViews` through the TYPE1 checker registry:
   ```ts
   const entityViewChecker: Checker<EntityView> = {
     name: "entity_view",
     input_selector: (ctx) => ctx.entity_views,
     check: (views, ctx) => checkEntityViews(views, ctx),
     dependencies: ["entity", "function"],
     priority: 50,
   };
   ```
8. Keep the old checkers (`checkForms`, `checkEditors`, `checkLists`, `checkCrud`) registered for backward compatibility, but have them delegate to `checkEntityViews` or operate on the old arrays. The simplest approach: keep them as-is for now, but add `checkEntityViews` as an additional checker.
9. Update `deriveObligationGraph` in `src/obligations/obligations.ts` to consume `ctx.entity_views` instead of separate arrays. Map:
   - `mode: "form"` → `entity_view_validation_test`
   - `mode: "editor"` → `entity_view_editor_test`
   - `mode: "list"` → `entity_view_list_test`
   - `mode: "crud"` → `entity_view_crud_test`
10. Add tests in `tests/entity-view.test.ts`:
    - Prove `deriveForm` produces an `EntityView` with `mode: "form"`.
    - Prove `deriveEditor` produces an `EntityView` with `mode: "editor"`.
    - Prove registering a form populates both `ctx.forms` and `ctx.entity_views`.
    - Prove `checkEntityViews` covers validation, missing actions, and missing queries.
    - Prove existing `tests/forms.test.ts`, `tests/editor.test.ts`, etc. pass unchanged.

### Diagnostics

```txt
entity_view:missing-entity
entity_view:missing-query-for-list
entity_view:missing-action-for-form
entity_view:unsupported-mode
entity_view:duplicate-name
entity_view:validation-mismatch
```

### Acceptance Criteria

1. `src/ui/entity-view.ts` exists with `EntityView`, `EntityViewMode`, `defineEntityView`, and derivation functions.
2. `GenContext` has `entity_views: EntityView[]`.
3. Registration functions populate both old arrays (`forms`, `editors`, `lists`, `cruds`) and `entity_views`.
4. `checkEntityViews` exists and is registered in the checker registry.
5. Obligation generation consumes `entity_views`.
6. Existing UI tests pass unchanged.
7. `vp check` and `vp test` pass.

---

## Milestone TYPE4: Plugin Registration APIs for Checkers and Emitters

### Problem

Even after TYPE1 and TYPE2, plugins cannot register their own checkers or emitters. The `PluginContributions` interface in `src/core/plugin.ts` has fields for helpers, targets, runtimes, stores, and operations, but no standardized way to register a checker or emitter.

### Target Design

Extend `PluginContributions` to include `checkers` and `emitters`. The `PluginContext` passed to `setup()` exposes `registerChecker` and `registerEmitter`. When `createGen` builds the context, it automatically registers all plugin checkers and emitters.

### Implementation Steps

1. Read `src/core/plugin.ts` to understand the current `PluginContributions` and `PluginContext` shapes.
2. Extend `PluginContributions` in `src/core/plugin.ts`:
   ```ts
   interface PluginContributions {
     // existing fields: helpers, targets, runtimes, stores, operations, ...
     readonly checkers?: readonly Checker<unknown>[];
     readonly emitters?: readonly ArtifactEmitter<unknown, Artifact>[];
   }
   ```
3. Extend `PluginContext` in `src/core/plugin.ts`:
   ```ts
   interface PluginContext {
     // existing fields...
     readonly registerChecker: <T>(checker: Checker<T>) => void;
     readonly registerEmitter: <Input, Out extends Artifact>(
       emitter: ArtifactEmitter<Input, Out>,
     ) => void;
   }
   ```
4. Update `createGen` in `src/core/context.ts` to:
   - Create `checker_registry` and `emitter_registry` before running plugins.
   - Register built-in checkers and emitters.
   - For each plugin, call `setup()` with a `PluginContext` whose `registerChecker` delegates to `ctx.checker_registry.register` and `registerEmitter` delegates to `ctx.emitter_registry.register`.
   - After all plugins have set up, the registries are finalized.
5. Add a test plugin in `tests/plugin-registration.test.ts`:
   ```ts
   const testPlugin: Plugin = {
     id: "test-plugin",
     namespace: "test",
     setup: (pluginCtx) => {
       pluginCtx.registerChecker({
         name: "test_primitive",
         input_selector: (ctx) => ctx.entities, // example
         check: (items) => [],
         dependencies: ["entity"],
         priority: 100,
       });
       pluginCtx.registerEmitter({
         name: "test_target",
         target: "test",
         dependencies: [],
         emit: (ctx) => [{ kind: "test_artifact", target: "test", source_refs: [], content: "" }],
       });
     },
   };
   ```
6. Add tests proving:
   - A plugin-registered checker runs alongside built-in checkers.
   - A plugin-registered emitter runs alongside built-in emitters.
   - Plugin checkers respect dependencies on built-in checkers.
   - Duplicate plugin checker/emitter names produce diagnostics.

### Diagnostics

```txt
plugin:checker-duplicate-name
plugin:emitter-duplicate-name
plugin:checker-dependency-missing
plugin:emitter-dependency-missing
```

### Acceptance Criteria

1. `PluginContributions` includes `checkers` and `emitters`.
2. `PluginContext` exposes `registerChecker` and `registerEmitter`.
3. Plugin-registered checkers run in lifecycle checks.
4. Plugin-registered emitters run in generation.
5. Dependencies between plugin and built-in checkers/emitters are respected.
6. `vp check` and `vp test` pass.

---

## Milestone TYPE5: Graph Integration and Performance

### Problem

After TYPE1–TYPE4, the infrastructure is unified. But graph derivation in `src/reactivity/reactivity.ts`, `src/obligations/obligations.ts`, and `src/services/services.ts` still traverses old context arrays (`ctx.events`, `ctx.reactions`, `ctx.forms`, `ctx.editors`, etc.) as separate collections.

Additionally, target generation currently re-derives intermediate graphs on every run. `deriveObligationGraph`, `deriveReactiveGraph`, and `deriveModuleGraph` are called by multiple emitters with no caching.

### Target Design

1. Update graph derivation to traverse unified primitives.
2. Add derivation caching to `GenContext` using `generation_id` from TYPE2.

### Implementation Steps

1. Update `deriveReactiveGraph` in `src/reactivity/reactivity.ts`:
   - Traverse `ctx.dispatches` instead of `ctx.events` + `ctx.reactions`.
   - Use `produces` / `consumes` edges instead of `emits_event` / `subscribes_event`.
   - Keep `emits_event` / `subscribes_event` edges as aliases for backward compatibility if needed.
2. Update `deriveObligationGraph` in `src/obligations/obligations.ts`:
   - Traverse `ctx.dispatches` for reaction/event obligations.
   - Traverse `ctx.entity_views` for form/editor/list/crud obligations.
   - Traverse `ctx.stored_values` for state/offline obligations.
3. Update `deriveModuleGraph` in `src/services/services.ts`:
   - Traverse unified collections where applicable.
4. Add cache fields to `GenContext` in `src/core/context.ts`:
   ```ts
   _cache: {
     generation_id: number;
     reactive_graph?: Graph;
     obligation_graph?: ObligationGraph;
     module_graph?: ModuleGraph;
     requirement_plan?: RequirementSatisfactionPlan;
   };
   ```
5. Implement cache helpers in `src/core/context.ts`:
   ```ts
   export const getCachedReactiveGraph = (ctx: GenContext): Graph => {
     if (ctx._cache.generation_id === ctx.generation_id && ctx._cache.reactive_graph) {
       return ctx._cache.reactive_graph;
     }
     const graph = deriveReactiveGraph(ctx);
     ctx._cache.generation_id = ctx.generation_id;
     ctx._cache.reactive_graph = graph;
     return graph;
   };
   ```
6. Update emitters to use cached getters instead of calling `deriveX` directly.
7. Add tests in `tests/graph-integration.test.ts`:
   - Prove graph derivation from unified collections produces the same result as from old arrays.
   - Prove caching works (second call returns same object reference).
   - Prove cache invalidation works (after registration, new object reference).

### Diagnostics

```txt
graph:unified-collection-missing
graph:cache-invalidation-failed
graph:derivation-mismatch
```

### Acceptance Criteria

1. Graph derivation traverses unified collections (`dispatches`, `entity_views`, `stored_values`).
2. Intermediate graphs are cached and reused.
3. Cache invalidation works when `generation_id` changes.
4. Existing graph tests pass unchanged.
5. `vp check` and `vp test` pass.

---

## Milestone TYPE6: Documentation and Backward Compatibility

### Problem

Phase 5 and Phase 6 introduce many new primitives and unify old ones. The documentation needs to reflect the new architecture. Additionally, backward compatibility must be explicitly documented so consumers know which APIs are stable and which are transitional.

### Target Design

1. Update `docs/core-primitives.md` to reflect Phase 5 and Phase 6 architecture.
2. Create `docs/plugin-guide.md` documenting how to register checkers and emitters.
3. Add backward compatibility notes to all unified APIs.

### Implementation Steps

1. Update `docs/core-primitives.md`:
   - Add `StoredValue`, `Combiner`, `EntityView`, `Checker`, `ArtifactEmitter` to the foundation list.
   - Add architecture layers for UI (Layer 7) and Lifecycle/Interpretation (Layer 8).
   - Add "Phase 6 Infrastructure" section explaining all five new primitives.
   - Update mental model and compiler-derived list.
2. Create `docs/plugin-guide.md` with:
   - How to write a plugin.
   - How to register a checker with dependencies.
   - How to register an emitter with dependencies.
   - How to extend `GenContext` with custom arrays.
   - Example plugin code.
3. Create `docs/backward-compat.md` documenting:
   - Old context arrays (`forms`, `editors`, `lists`, `cruds`, `events`, `reactions`, `state_resources`, `offline_queues`) are deprecated but still populated.
   - Old checkers (`checkForms`, `checkEditors`, etc.) still run but may be consolidated in the future.
   - Migration path: use `entity_views` instead of `forms`/`editors`/`lists`/`cruds`.
4. Add `@deprecated` JSDoc tags to old context arrays and old constructors in the source code.
5. Add tests in `tests/backward-compat.test.ts` proving:
   - Old APIs still work.
   - Old context arrays are populated when new APIs are used.
   - Old checkers still produce diagnostics.

### Acceptance Criteria

1. `docs/core-primitives.md` reflects Phase 5 and Phase 6 architecture.
2. `docs/plugin-guide.md` exists with checker/emitter registration examples.
3. `docs/backward-compat.md` exists with deprecation and migration notes.
4. `@deprecated` JSDoc tags are added to old APIs.
5. `vp check` and `vp test` pass.

---

## Cross-Cutting Type Safety Rules

Phase 6 should enforce these rules across all milestones:

1. Public APIs remain unchanged. All unifications are internal.
2. Backward-compatible arrays and wrappers preserve existing code. Do not delete old context arrays.
3. Plugin registration APIs must be typed and inference-safe.
4. Dependency graphs (checkers and emitters) must be acyclic or produce diagnostics.
5. Caching must not leak stale artifacts across generation runs.
6. Unified primitives must preserve all metadata from the pre-unification types.
7. Existing tests must pass without modification (unless the test was testing an internal detail that no longer exists).

## Common Pitfalls

**Pitfall 1: Removing old context arrays.**
`GenContext` is an interface. Old arrays (`forms`, `editors`, `lists`, `cruds`, `events`, `reactions`, `state_resources`, `offline_queues`) must remain in the interface. Populate both old and new arrays during registration. Do not delete old arrays.

**Pitfall 2: Modifying existing `check*` functions.**
The existing `checkEntityInvariants`, `checkFunctions`, `checkEvents`, etc. are pure functions. Do not modify them. Only the registration and execution layers change.

**Pitfall 3: Modifying existing target fixture functions.**
`lowerClientProviders`, `generateTestSuites`, etc. are pure functions. Do not modify them. Only wrap them in `ArtifactEmitter` objects.

**Pitfall 4: Breaking topological sort.**
If two checkers have the same dependencies and priority, their order is undefined but safe. If a checker has a missing dependency, emit a diagnostic and skip it — do not crash.

**Pitfall 5: Cache invalidation bugs.**
`generation_id` must be incremented in EVERY registration function (`registerEntity`, `registerActionFunction`, `registerDispatch`, etc.). If you forget one, the cache will return stale artifacts.

**Pitfall 6: Circular dependencies.**
If checkers A and B depend on each other, the topological sort must detect the cycle, emit a `checker:circular-dependency` diagnostic, and break the cycle arbitrarily. Do not infinite loop.

## Required Test Style

Every milestone must include:

```txt
positive inference test
  proves normal user code infers without explicit generic arguments

negative compatibility test
  proves invalid composition fails by type test or diagnostic

runtime shape test
  proves the produced IR contains expected metadata

lifecycle diagnostic test
  proves unsafe semantic cases are reported through checks

plugin registration test
  proves a plugin can register and its checker/emitter runs
```

## Safe Implementation Order Inside A Milestone

Use this exact order unless the milestone says otherwise:

1. Read the existing module and tests.
2. Add or update types with no runtime behavior change.
3. Add the required production constructor/helper.
4. Add runtime diagnostics or registry integration.
5. Add tests for inference, shape, and diagnostics.
6. Run `vp check` and `vp test`.
7. Update target fixtures or downstream derivations after tests cover the core IR and diagnostics.

## Error Policy

Use this policy unless a milestone specifies otherwise:

1. **Hard error:** The compiler would generate type-invalid or unsafe runtime behavior.
2. **Warning:** The compiler can generate correct but degraded behavior.
3. **Info:** The compiler made a conservative but expected choice.
4. **Degraded:** A preferred typed composition cannot be proven, but an explicit safe fallback is selected.

## What To Keep

Phase 6 should protect the good parts of the current architecture:

1. Keep `SemanticType<T>` as the root type-safety primitive.
2. Keep direct object-value composition.
3. Keep `createGen` as a lightweight namespace/context factory.
4. Keep `GenContext` as a runtime graph.
5. Keep plugins additive.
6. Keep lifecycle diagnostics as the semantic safety layer.
7. Keep targets as interpretations of IR.
8. Keep public constructors ergonomic and inference-friendly.

## Final Phase 6 Completion Criteria

Phase 6 is complete when all of the following are true:

1. Checker registry protocol exists with topological sorting and plugin registration.
2. ArtifactEmitter framework exists with dependency sorting, caching, and plugin registration.
3. Forms, editors, lists, and CRUD unify into `EntityView` with both old and new context arrays populated.
4. Plugin registration APIs for checkers and emitters are typed and inference-safe.
5. Graph derivation traverses unified collections and uses cached intermediate results.
6. Documentation reflects Phase 5 and Phase 6 architecture.
7. Backward compatibility is documented and tested.
8. Existing tests pass without modification.
9. `vp check` and `vp test` pass after every completed milestone.

## Phase 6 Summary

Phase 6 removes the remaining duplicated infrastructure across lifecycle checkers, target fixtures, and UI derivations. The intended result is:

```txt
Typed primitives compose into larger typed IR.
Larger typed IR adapts into open trait-bearing nodes.
Nodes compose safely through plans and workflows.
Lifecycle checkers run in dependency order across all primitives.
Target emitters run in dependency order with caching.
UI derivations are views over entities, not independent primitives.
Plugins extend checkers, emitters, and nodes without core changes.
Diagnostics explain what TypeScript cannot prove.
Targets interpret the same graph without private knowledge.
```

This phase is successful when the architecture feels unified: one way to check, one way to emit, one way to view.
