# Agent Implementation Guide: Type System Hardening and API Ergonomics

This guide outlines the next phase of work for the `gen2` domain compiler, following the successful completion of the Reactivity/Atom Hardening roadmap.

The goal of this phase is to solidify the foundational type system, address known technical debt, and improve the ergonomics of the API before moving on to larger feature additions (like cross-boundary transports or advanced hydration).

These steps directly address the gaps identified in `atom_plan_state_review.md` and `atom_plan.md`.

## Primary Goal

Harden the type system and core builder APIs. The most important work is:
- Converting `Operation` to a discriminated union for safer exhaustiveness checking.
- Fixing type bypasses in UI namespace merging.
- Improving the memory and allocation profile of the query builder and binders.
- Expanding type inference across the `gen.*` surface to eliminate `unknown` widening.
- Adding a fluent, staged DSL for action building.

## Recommended Milestone Order

Work in this order. Do not skip ahead. Make sure `vp check` and `vp test` pass after every milestone.

1. **OP1: Discriminated Operation Union**
2. **UI1: Typed UI Namespace Merging**
3. **QB1: Mutable Query Builder**
4. **BND1: Prototype-Based Binders**
5. **FIX1: Core Mutation and Allocation Fixes**
6. **INF1: Type Inference Hardening**
7. **DSL1: Staged Action DSL**
8. **REQ1: Requirement Bubbling Type Model**

---

## Milestone OP1: Discriminated Operation Union

### Problem
`Operation` in `src/types/operation.ts` is currently a single interface with optional fields per kind. This weakens type safety and requires manual field checking in switch statements rather than letting TypeScript narrow the union automatically.

### Target Design
Convert `Operation` into a discriminated union of `UnaryOperation`, `BinaryOperation`, `ComparisonOperation`, `NaryOperation`, `AggregateOperation`, `ReducerOperation`, `PredicateOperation`, and `EffectOperation`.

### Implementation Steps
1. Define individual interfaces for each operation kind in `src/types/operation.ts` extending a base shape or just sharing a `kind` tag.
2. Export `Operation` as the union of these interfaces.
3. Update operation builders (`unaryOp`, `binaryOp`, etc.) to return the specific narrow types.
4. Update `AST` evaluator, SQL translation, and other consumers to leverage the discriminated union.

### Acceptance Criteria
- `vp check` passes.
- Switch statements over `operation.kind` successfully narrow the type without needing optional chaining for required fields.
- 100% of existing tests pass.

---

## Milestone UI1: Typed UI Namespace Merging

### Problem
`createUiNamespace` in `src/gen/ui-backends.ts` uses `as unknown as UiNamespace<C>` to bypass the type checker when merging base UI helpers with backend-specific extensions (like JSX or TUI).

### Target Design
Extract backend-specific namespace merging into strongly typed helper functions that return precise intersection types (`BaseUiNamespace & JsxUiNamespaceExtensions`, etc.).

### Implementation Steps
1. Inspect `src/gen/types.ts` and `src/gen/ui-backends.ts`.
2. Ensure the generic constraints on `createUiNamespace` can infer the correct backend extensions.
3. Remove `as unknown as` casts in `createUiNamespace`.

### Acceptance Criteria
- `vp check` passes.
- No `as unknown as` casts exist in `createUiNamespace`.
- UI backend typings correctly flow to `gen.ui`.

---

## Milestone QB1: Mutable Query Builder

### Problem
The `QueryBuilder` in `src/query/query.ts` currently allocates a new object on every fluent call (`{ ...state, predicate }`), which leads to O(n²) allocation in chain length.

### Target Design
Refactor the query builder to accumulate state internally and only freeze/emit the `QueryExpression` when `.build()` is called, while preserving generic `Source/Result` parameters for type safety.

### Implementation Steps
1. Refactor `fromEntity` and the returned builder in `src/query/query.ts` to use a mutable internal state object.
2. Make fluent methods (`where`, `select`, `join`, etc.) mutate the internal state and return `this`.
3. Make `build()` freeze the state and return the final `QueryExpression`.

### Acceptance Criteria
- `vp check` and `vp test` pass.
- Query building allocates significantly fewer objects per chain.
- Inference for `Source` and `Result` types is preserved perfectly.

---

## Milestone BND1: Prototype-Based Binders

### Problem
`bindFromEntity` in `src/gen/binders.ts` reconstructs closures (e.g., overriding `.build()`) on every call, causing unnecessary allocations and overhead.

### Target Design
Move builder methods to a class or prototype so that the instance only carries `ctx` and state, rather than allocating closures for every method.

### Implementation Steps
1. Refactor `bindFromEntity` to instantiate a class or prototype-based builder that receives `ctx` upon creation.
2. The custom `build` override that pushes to `ctx.queries` should be a standard method on this class/prototype.

### Acceptance Criteria
- `vp check` and `vp test` pass.
- `bindFromEntity` no longer allocates inline closures for its overrides.

---

## Milestone FIX1: Core Mutation and Allocation Fixes

### Problem
Several small debt items cause unnecessary allocations or unintended mutations.

### Target Design
Fix the minor issues listed in the backlog.

### Implementation Steps
1. Make `View.slots` readonly in `src/ui/ui.ts`.
2. Extract `neverSemanticType` to a module-level singleton in `src/storage/storage.ts` to avoid allocating it per call.
3. Add a runtime validation hook or explicit trust boundary docs to `safeHtml` in `src/ui/ui.ts`.
4. Fix storage mutations on inputs (`store.tables.push`, `table.columns.push`) in `src/gen/binders.ts` by freezing arrays or returning new ones where appropriate.
5. Fix target input mutation via cast in `src/core/target.ts`.
6. Fix config mutation via cast in `src/core/context.ts` or `src/gen/binders.ts`.

### Acceptance Criteria
- `vp check` and `vp test` pass.

---

## Milestone INF1: Type Inference Hardening

### Problem
Various public `gen.*` constructors widen to `unknown` or lose precision when handling tuples, field arrays, or errors.

### Target Design
Ensure that inputs flow exactly to outputs without widening to `unknown` and that phantom slots are preserved.

### Implementation Steps
1. Add `const` type parameters to tuple/object-literal-heavy APIs where useful.
2. Preserve exact field maps from `gen.entity(...)` through `Entity.fields` and `InferEntity`.
3. Preserve tuple literals for arrays of fields, errors, routes, plugins, resources, and form fields where they drive inference.
4. Add phantom slots for `_errors`, `_requires`, `_effects`, and `_capabilities` where missing.
5. Remove or isolate `as unknown as` casts from public type paths.

### Acceptance Criteria
- `vp check` passes.
- Type tests in `.test-d.ts` files prove that tuples and field maps remain strict.

---

## Milestone DSL1: Staged Action DSL

### Problem
`gen.func.buildActionInsert(entity, [[field, expr], ...])` is verbose and not fluent.

### Target Design
Introduce a staged fluent builder for actions.

### Example
```ts
gen.action
  .insert(User)
  .values({
    [User.fields.email]: param("email"),
    [User.fields.name]: param("name"),
  })
  .build();
```

### Implementation Steps
1. Add a `gen.action` namespace.
2. Implement staged builders for `insert`, `update`, and `delete`.
3. Add an `invalidate` builder stage to integrate with the new `InvalidateOperation`.
4. Add a `sequence` builder for composing multiple operations.
5. Update `action-dsl.test.ts` to test the new fluent API.

### Acceptance Criteria
- Fluent API produces the exact same `ActionExpr` as the old utility functions.
- `vp check` and `vp test` pass.

---

## Milestone REQ1: Requirement Bubbling Type Model

### Problem
Requirements and effects exist on functions, but composing functions into resources, forms, and routes does not currently merge their phantom requirement/effect slots.

### Target Design
Build a type-level model that aggregates requirements and effects during composition.

### Implementation Steps
1. Add `InferRequirements<T>` and `InferEffects<T>` helpers.
2. Ensure `gen.reactivity.resource`, `gen.reactivity.all`, and `gen.reactivity.chain` merge requirements and effects from their inner query functions.
3. Ensure forms inherit action requirements plus form runtime requirements.
4. Ensure routes inherit loader/action/component requirements.

### Acceptance Criteria
- Phantom type intersections accumulate requirements and effects correctly.
- `vp check` passes.
- New type tests in `tests/function-infer.test-d.ts` and `tests/reactivity.test-d.ts` prove the bubbling.

---

## Phase 2: Target Generation Foundation

> Following the type system hardening, the IR must be enriched to support executable, production-ready target generation. Current generators (Effect Atom, TanStack Query) are illustrative placeholders because the IR lacks symbol metadata, call plans, and target input boundaries.

## Recommended Milestone Order (Phase 2)

1. **SYM1: Symbol and Import Metadata**
2. **CALL1: Execution Call Plans**
3. **RES1: Expanded Resource Model**
4. **TINP1: Target Input Records**

---

## Milestone SYM1: Symbol and Import Metadata

### Problem
Target generators currently emit strings like `getUser()` or `userResource` and assume they magically exist in scope. The IR lacks module boundaries, file paths, and import metadata to generate valid `import { getUser } from "./api"` statements.

### Target Design
Add symbol metadata to Gen constructs (functions, entities, resources) so targets know how to import them.

### Implementation Steps
1. Add a `SymbolMetadata` interface (e.g., `module_path`, `export_name`, `is_default`).
2. Add `symbol?: SymbolMetadata` to `StaticNode`, `Function`, `ReactiveResource`, and `ReactiveMutation`.
3. Update `GenContext` or `deriveReactiveGraph` to flow this metadata into `ReactiveGraphNode`.
4. Update target generators to use this metadata, warning when it is missing instead of generating invalid references.

### Acceptance Criteria
- Generators can emit valid `import` statements for bounded nodes.
- Nodes lacking symbol metadata produce clear `missing-symbol-metadata` diagnostics.

---

## Milestone CALL1: Execution Call Plans

### Problem
Generators emit `Atom.make((get) => query(get))` or `mutationFn: (input) => action(input)`, assuming a 1:1 signature match. Complex actions/queries with service dependencies or destructured arguments cannot be generated safely without an explicit call mapping.

### Target Design
Formalize `CallPlan` to map the portable IR's inputs and outputs to a concrete TypeScript execution signature.

### Implementation Steps
1. Expand the `CallPlan` interface in `src/core/node.ts` to include argument mapping (e.g., how to pass context, how to map `In` to `args`).
2. Update `ActionFunction`, `QueryFunction`, and target generators to consume `CallPlan`.
3. If a call plan is missing or unsupported by the target, emit a diagnostic.

### Acceptance Criteria
- Target generation uses `CallPlan` to correctly format function invocations.

---

## Milestone RES1: Expanded Resource Model

### Problem
Effect Atom relies heavily on specific primitives like `Atom.pull` (for promises), `Atom.searchParam`, and `Atom.kvs` (for local storage). Currently, `gen2` only has the generic `ReactiveResource`.

### Target Design
Expand the reactivity IR to explicitly model pull, infinite, and client-backed store resources.

### Implementation Steps
1. Introduce new resource IR kinds: `PullResource`, `InfiniteResource`, `StreamResource`.
2. Add client-store bindings for resources (URL search params, local storage).
3. Update `ReactiveGraph` derivation to recognize the new resource types.
4. Update Effect Atom target to generate `Atom.pull`, `Atom.searchParam`, and `Atom.kvs` where appropriate.

### Acceptance Criteria
- New resource types are available in `gen.reactivity.*`.
- Target generator emits the correct `Atom.*` primitive based on the resource type.

---

## Milestone TINP1: Target Input Records

### Problem
Target generators currently accept a raw `ReactiveGraph`. A graph alone isn't enough to generate complete, executable TypeScript projects.

### Target Design
Define a `TargetInputRecord` that bundles the reactive graph, the import/symbol registry, and target-specific execution configurations.

### Implementation Steps
1. Create `TargetInputRecord` interface combining `ReactiveGraph`, `SymbolRegistry`, and target configuration.
2. Update `src/core/target.ts` and the lifecycle runner to pass `TargetInputRecord` to targets instead of raw ASTs/graphs.
3. Update `effect-atom` and `tanstack-query` generators to consume the new input format.

### Acceptance Criteria
- Targets receive a unified input record containing all necessary generation context.
- Generators can emit well-formed TypeScript files with correct imports and typed boundaries.