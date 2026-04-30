# Agent Implementation Guide: Reactivity/Atom Hardening

This guide is a handoff plan for an AI coding agent that may not understand the larger project well. Follow it literally. The goal is to improve the current implementation using `atom_plan_state_review.md` as the source of truth, without expanding scope into new targets or unrelated features.

It also incorporates the original design pressure from `spec/atom.txt`: Effect Atom is an inspiration and target, not the core model; reactivity should usually be derived from static Gen IR; manual keys are typed refinements for opaque dependencies; and generated features should be capability-aware and diagnosable.

## Primary Goal

Harden the reactivity/atom foundation so it becomes a trustworthy semantic IR layer rather than a prototype. The most important work is representation correctness:

- Key families must carry inspectable runtime payload schemas, not only phantom TypeScript payloads.
- Key and invalidation expressions must distinguish constant declarations from future expression-backed plans.
- Action invalidation metadata must be ready to depend on action input and result.
- Reactive graph edges must preserve enough semantic payload to support correct diagnostics and later target generation.
- Resource states and lifecycle diagnostics must match the plan’s semantics.
- Conservative dependency derivation must begin from query/action/mapping/relation metadata so manual invalidation does not become the default burden.
- Semantic key hierarchy, batching, and tracking-scope concepts must be represented before targets can be trusted.

Do not add new runtime targets. Do not make Effect Atom or TanStack Query more ambitious. Treat target generation as experimental until the core IR is stronger.

## Design Principles From `spec/atom.txt`

Use these as guardrails while implementing:

- **Atoms are one target.** Do not add `Atom.make` or Effect-specific concepts to core IR. Map generic Gen concepts to Effect Atom later.
- **Static IR first.** Query keys, invalidation, derived resources, optimistic patches, scopes, routes, and services must be static records or typed AST/functions.
- **Derived first, manual second.** The compiler should derive conservative read/write/invalidation edges from queries, actions, mappings, relations, rules, projections, events, and laws. Manual keys refine or cover opaque external dependencies.
- **Manual keys stay typed.** No raw string invalidation keys except through explicit custom key constructors.
- **Semantic keys are an address space.** Exact, any, match, hierarchy, and batching semantics matter.
- **Tracking scopes are semantic.** Components, route loaders, resources, forms, effects, and actions should eventually record semantic reads.
- **Resource state is Result-like.** Use target-independent states that map to Effect Atom `Result`, TanStack results, stores, signals, and resources.
- **Services/layers are generic.** Effect Layers are one target for a generic service/module/requirement graph.
- **Progressive enhancement is correctness.** Fallbacks and unsupported capabilities should be represented and diagnosed, not hidden in generated code.

## Read First

Read these files before editing:

- `AGENTS.md`
- `atom_plan.md`
- `atom_plan_state_review.md`
- `src/reactivity/reactivity.ts`
- `src/function/function.ts`
- `src/gen/namespaces.ts`
- `src/gen/types.ts`
- `src/gen/binders.ts`
- `src/core/context.ts`
- `src/lifecycle/lifecycle.ts`
- `src/crud/crud.ts`
- `src/query/query.ts`
- `src/storage/storage.ts`
- `src/relation/relation.ts`
- `tests/reactivity.test.ts`
- `tests/reactivity.test-d.ts`
- `tests/router.test.ts`
- `tests/rules-reactivity.test.ts`

Use `vp check` and `vp test` for verification. Do not use package-manager commands directly.

## Non-Negotiable Constraints

- Keep public APIs inferable without explicit generic arguments for common cases.
- Preserve existing API compatibility unless a milestone explicitly says to make a breaking change.
- Do not remove `gen.key.family<{ ... }>(name)` immediately; add the better schema-driven form alongside it first.
- Do not deepen target generators beyond adapting them to changed graph/edge shapes.
- Do not use arbitrary JS closures in portable definitions.
- Do not use `as any` or `as unknown` in tests or public examples.
- Internal casts are allowed only when TypeScript cannot express the relationship; add a short comment explaining the limitation.
- Add diagnostics for degraded or imprecise behavior instead of silently broadening.
- Prefer discriminated unions over “one interface with many optional fields.”
- Keep changes minimal and milestone-scoped.

## Agent Workflow

Use this workflow for every milestone:

1. Read the files listed for that milestone before editing.
2. Add or update the narrowest tests that describe the intended behavior.
3. Make the smallest implementation change that satisfies those tests.
4. Run `vp check` and `vp test` unless the milestone is docs-only.
5. If tests fail because old expectations conflict with this guide, update the tests only when the new behavior is explicitly documented here.
6. Stop at the milestone boundary. Do not opportunistically implement later milestones.

If the worktree is dirty, do not revert unrelated changes. Touch only the files needed for the milestone.

## Recommended Milestone Order

Work in this order. Do not skip ahead unless all acceptance criteria for earlier milestones are met.

1. K1: Runtime Key Family Schema
2. K2: Key Pattern Validation and Diagnostics
3. K3: Semantic Key Hierarchy, Registry, and Batching
4. E1: Constant vs Expression Key Plans
5. A1: Action Input/Result-Aware Invalidation Types
6. G1: Typed Reactive Graph Edges
7. DERI1: Conservative Derived Dependency Pass
8. SCOPE1: Tracking Scope Metadata
9. R1: Resource State and Resource Diagnostics
10. IA1: Static Invalidation Action Node
11. C1: CRUD Key Alignment
12. RR1: Rule-Derived Reactivity Safety
13. T0: Target Adapter Stabilization
14. PE1: Capability/Fallback Metadata Seed
15. D1: Documentation and Plan Synchronization

Each milestone should land with tests. If a milestone becomes too large, split it but keep the same acceptance criteria.

The TypeScript snippets below are intended target shapes, not mandatory copy-paste patches. Before implementing a snippet, inspect the existing module conventions and choose the smallest compatible shape that preserves the same semantics.

## Milestone K1: Runtime Key Family Schema

### Problem

`KeyFamily<Payload>` currently carries payload type information only as a phantom type. Runtime checks and generators cannot inspect the payload shape, so diagnostics such as `reactivity:key-payload-mismatch` cannot be implemented correctly.

### Target Design

Add an inspectable payload schema to key families.

Recommended shape:

```ts
export type KeyFamilyHierarchy = "entity" | "collection" | "field" | "relation" | "view" | "custom";

export interface KeyFamily<Payload extends KeyPayload = KeyPayload> {
  readonly kind: "key_family";
  readonly id?: KeyFamilyId;
  readonly ref: KeyFamilyRef<Payload>;
  readonly name: string;
  readonly input_type?: SemanticType<Payload>;
  readonly hierarchy: KeyFamilyHierarchy;
  readonly description?: string;
  readonly _payload?: Payload;
}
```

Support both forms initially:

```ts
gen.key.family("User", { input: gen.types.object({ id: gen.types.uuid() }) });
gen.key.family<{ readonly id: string }>("User");
```

The schema-driven form should be preferred in tests and examples. The generic-only form remains for compatibility and produces less runtime validation.

### Files To Touch

- `src/reactivity/reactivity.ts`
- `src/gen/types.ts`
- `src/gen/namespaces.ts`
- `src/gen/binders.ts`
- `src/crud/crud.ts` if CRUD key constructors need options
- `tests/reactivity.test.ts`
- `tests/reactivity.test-d.ts`

### Implementation Steps

1. Import `SemanticType` into `src/reactivity/reactivity.ts` as a type-only import.
2. Add `KeyFamilyHierarchy`.
3. Extend `KeyFamily` with `input_type?: SemanticType<Payload>` and `hierarchy`.
4. Update `defineKeyFamily` to accept options:
   ```ts
   {
     id?: KeyFamilyId;
     description?: string;
     input?: SemanticType<Payload>;
     hierarchy?: KeyFamilyHierarchy;
   }
   ```
5. Default `hierarchy` to `"custom"`.
6. Update `entityKeyFamily` to use `hierarchy: "entity"`.
7. Update `collectionKeyFamily` to use `hierarchy: "collection"`.
8. If entity id field conventions are not explicit, do not invent a fragile id detector. Keep current payload type but add a comment or diagnostic plan explaining it is a temporary convention.
9. Preserve all current call sites.
10. Add runtime tests proving schema-driven key families store `input_type` and hierarchy.
11. Add type tests proving `gen.key.family("User", { input: objectType })` infers payload from `input`.

### Acceptance Criteria

- Existing generic key family tests still pass.
- New schema-driven key family tests pass.
- `KeyFamily` records are inspectable at runtime for schema and hierarchy.
- No public call site requires explicit generic arguments when an input schema is provided.
- `vp check` passes.
- `vp test` passes.

### Diagnostics Added Or Enabled Later

This milestone prepares diagnostics. Full validation happens in K2.

- `reactivity:key-family-missing-input-type` warning for generic-only families when used in contexts requiring runtime validation.

## Milestone K2: Key Pattern Validation and Diagnostics

### Problem

`checkReactivity` cannot currently validate key payload mismatches or `.match()` unknown fields because key family payload shape is phantom-only.

### Target Design

Use `KeyFamily.input_type` when present to validate exact key payloads and match payloads. If no input schema is available, emit a warning only when validation is required.

### Files To Touch

- `src/reactivity/reactivity.ts`
- `src/lifecycle/lifecycle.ts` if reactivity check registration needs updating
- `src/core/diagnostics.ts` if diagnostic code unions exist there
- `tests/reactivity.test.ts`

### Implementation Steps

1. Inspect `SemanticType` shape in `src/types/semantic.ts` before writing validation.
2. Add a small helper in `reactivity.ts`:
   ```ts
   const keyPayloadFields = (family: KeyFamily): readonly string[] | undefined => ...
   ```
3. Support at least object/struct semantic types if they exist. If shape extraction is not possible for every semantic type, return `undefined` and emit a conservative diagnostic.
4. Update `checkReactivity` input to include queries/actions if needed, or add a separate `checkFunctionReactivity` if that fits existing lifecycle better.
5. Validate `ReactiveKey.payload` where keys are stored. If current context does not store concrete keys, validate patterns at minimum.
6. Validate `ReactiveKeyPattern.match` object keys against the family input fields.
7. Validate `KeyExpression.payload` if present.
8. Validate `KeyPatternExpression.patterns` if those are reachable from action/query metadata.
9. Add tests for unknown match field with schema-driven family.
10. Add tests for no diagnostic when family has no `input_type` and the payload cannot be checked, unless the family is used in a strict context.

### Acceptance Criteria

- Unknown `.match()` fields produce `reactivity:key-match-unknown-field` when `input_type` is available.
- Exact key payloads with unknown fields produce `reactivity:key-payload-mismatch` when `input_type` is available.
- Missing runtime schemas produce a clear warning only where runtime validation is expected.
- No false positives for generic-only compatibility key families in existing tests.
- `vp check` and `vp test` pass.

### Diagnostics

Implement or refine:

- `reactivity:key-payload-mismatch`
- `reactivity:key-match-unknown-field`
- `reactivity:key-family-missing-input-type`

Diagnostic messages should include:

- key family name
- offending payload field
- list of known fields when available
- whether validation was skipped because no `input_type` exists

## Milestone K3: Semantic Key Hierarchy, Registry, and Batching

### Problem

`spec/atom.txt` treats key families as semantic address spaces, inspired by `Atom.family` and reactivity keys. The current implementation has families and patterns but lacks explicit hierarchy, registry ergonomics, parent/child invalidation semantics, and batching/coalescing metadata.

### Target Design

Do not make key families depend on Effect Atom. Instead, model generic semantics:

```ts
export interface KeyInvalidationSemantics {
  readonly propagates_to_parents: boolean;
  readonly propagates_to_children: boolean;
  readonly batch: "microtask" | "transaction" | "target_decides";
}

export interface ReactiveRegistry<
  Families extends Record<string, KeyFamily> = Record<string, KeyFamily>,
> {
  readonly kind: "reactive_registry";
  readonly name: string;
  readonly families: Families;
  readonly _families?: Families;
}
```

Keep registry as a static grouping record. Do not implement callable key-family methods unless the type work is small and safe.

### Files To Touch

- `src/reactivity/reactivity.ts`
- `src/gen/namespaces.ts`
- `src/gen/types.ts`
- `src/core/context.ts` if registries should be discoverable
- `tests/reactivity.test.ts`
- `tests/reactivity.test-d.ts`

### Implementation Steps

1. Ensure K1 has added `hierarchy` to `KeyFamily`.
2. Add optional `semantics?: KeyInvalidationSemantics` to `KeyFamily` or derive default semantics from hierarchy.
3. Add `defineReactiveRegistry(name, families)` or `defineReactiveRegistry(families)`.
4. Expose `gen.reactivity.registry(...)`.
5. If added to `GenContext`, add `reactive_registries` and a binder.
6. Add inference helpers:
   ```ts
   InferReactiveRegistryFamilies<R>;
   InferRegistryFamily<R, K>;
   ```
7. Add tests proving registry preserves exact family payload types.
8. Add tests for default hierarchy semantics on entity/collection/custom keys.
9. Do not implement target batching behavior; just represent it as static metadata.

### Acceptance Criteria

- Key families carry hierarchy and invalidation semantics.
- A registry can group key families without losing payload inference.
- Runtime records remain static and serializable.
- Existing `gen.key.*` call sites still work.
- `vp check` and `vp test` pass.

### Diagnostics

- `reactivity:duplicate-registry-key`
- `reactivity:key-hierarchy-unsupported`
- `reactivity:key-batching-unsupported`

Only emit target capability diagnostics if a target actually consumes these semantics.

## Milestone E1: Constant vs Expression Key Plans

### Problem

`KeyExpression` and `KeyPatternExpression` currently sound like expression ASTs but are really constant wrappers around a family, payload, or static pattern list. This makes future input/result-derived invalidation confusing and encourages targets to over-trust shallow records.

### Target Design

Introduce discriminated unions that preserve the current behavior as constant plans and leave room for true expression-backed plans.

Recommended names:

```ts
export interface ConstantKeyExpression<Input = unknown, Payload extends KeyPayload = KeyPayload> {
  readonly kind: "constant_key_expression";
  readonly family: KeyFamily<Payload>;
  readonly payload?: Payload;
  readonly _input?: Input;
  readonly _payload?: Payload;
}

export interface StaticKeyExpression<Input = unknown, Payload extends KeyPayload = KeyPayload> {
  readonly kind: "static_key_expression";
  readonly family: KeyFamily<Payload>;
  readonly body: Expr;
  readonly _input?: Input;
  readonly _payload?: Payload;
}

export type KeyExpression<Input = unknown, Payload extends KeyPayload = KeyPayload> =
  | ConstantKeyExpression<Input, Payload>
  | StaticKeyExpression<Input, Payload>;
```

For patterns:

```ts
export interface ConstantKeyPatternExpression<
  Input = unknown,
  Payload extends KeyPayload = KeyPayload,
> {
  readonly kind: "constant_key_pattern_expression";
  readonly family: KeyFamily<Payload>;
  readonly patterns: readonly ReactiveKeyPattern<Payload>[];
  readonly _input?: Input;
  readonly _payload?: Payload;
}

export interface StaticKeyPatternExpression<
  Input = unknown,
  Payload extends KeyPayload = KeyPayload,
> {
  readonly kind: "static_key_pattern_expression";
  readonly family: KeyFamily<Payload>;
  readonly body: Expr;
  readonly _input?: Input;
  readonly _payload?: Payload;
}

export type KeyPatternExpression<Input = unknown, Payload extends KeyPayload = KeyPayload> =
  | ConstantKeyPatternExpression<Input, Payload>
  | StaticKeyPatternExpression<Input, Payload>;
```

If importing `Expr` creates cycles or widening, defer `Static*` body implementation but still reserve discriminants.

### Files To Touch

- `src/reactivity/reactivity.ts`
- `src/function/function.ts`
- `src/gen/types.ts`
- `tests/reactivity.test.ts`
- `tests/reactivity.test-d.ts`

### Implementation Steps

1. Add new constant interfaces and union aliases.
2. Change `keyExpr` to return `ConstantKeyExpression` with `kind: "constant_key_expression"`.
3. Change `keyPatternExpr` to return `ConstantKeyPatternExpression` with `kind: "constant_key_pattern_expression"`.
4. Update type guards and normalizers in `defineQueryFunction` and `defineActionFunction` to accept old and new shapes if needed.
5. If backward compatibility for runtime `kind: "key_expression"` matters in existing tests, either update tests intentionally or support both shapes through a normalizer. Since this library is pre-release, prefer clean discriminants if tests can be updated safely.
6. Update graph derivation to switch on the new discriminants.
7. Add tests that prove constant expressions are static records and not raw expressions.

### Acceptance Criteria

- Current public `gen.key.expr(...)` and `gen.key.patternExpr(...)` still work.
- Runtime records use clear constant discriminants.
- Type aliases remain exported as `KeyExpression` and `KeyPatternExpression`.
- Future static expression-backed forms can be added without changing public query/action metadata shape.
- `vp check` and `vp test` pass.

### Diagnostics

No new diagnostics required, but existing diagnostics should mention “constant key pattern” rather than “expression” when appropriate.

## Milestone A1: Action Input/Result-Aware Invalidation Types

### Problem

Action invalidation metadata cannot model plans based on mutation result, even though the atom plan expects `({ result }) => [...]` semantics later.

### Target Design

Make action reactivity metadata explicitly parameterized by input and output context, without requiring true expression execution yet.

Recommended type:

```ts
export interface MutationKeyContext<In = unknown, Out = unknown> {
  readonly input: In;
  readonly result: Out;
}

export interface ActionReactivity<In = unknown, Out = unknown> {
  readonly invalidates: readonly KeyPatternExpression<MutationKeyContext<In, Out>, KeyPayload>[];
}
```

If TypeScript makes heterogeneous key payloads difficult, use a helper type alias and tests to preserve enough specificity without overcomplicating the public API.

### Files To Touch

- `src/function/function.ts`
- `src/reactivity/reactivity.ts`
- `src/gen/types.ts`
- `tests/function-infer.test-d.ts`
- `tests/reactivity.test-d.ts`
- `tests/reactivity.test.ts`

### Implementation Steps

1. Define `MutationKeyContext<In, Out>` in `function.ts` or `reactivity.ts`. Prefer `reactivity.ts` only if it does not create a cycle.
2. Update `ActionReactivity` to include `Out`.
3. Update `ActionFunction<In, Out>` to use `ActionReactivity<In, Out>`.
4. Update `defineActionFunction` input type accordingly.
5. Update `lowerLegacyInvalidations` to return pattern expressions typed to `MutationKeyContext<In, Out>` or a compatible input context.
6. Add inference tests proving an action’s invalidation plan carries `{ input, result }` as its input phantom.
7. Do not implement callback-based invalidation yet. This milestone is type/IR readiness only.

### Acceptance Criteria

- Existing action reactivity call sites still compile.
- The action output type is available in invalidation metadata phantom types.
- Legacy query invalidation lowering still works.
- No new target behavior is added.
- `vp check` and `vp test` pass.

### Diagnostics

Refine existing diagnostic:

- `function:legacy-invalidation-without-query-key`

Add if needed:

- `reactivity:invalidates-context-unsupported` for future expression-backed plans that require result context but target/lifecycle cannot inspect them.

Do not emit this diagnostic until there is a real unsupported case.

## Milestone G1: Typed Reactive Graph Edges

### Problem

`ReactiveGraphEdge` is one flat shape with `from`, `to`, and `kind`. It loses key payload/pattern semantics and overloads `binds` for many unrelated relationships. Targets and graph queries then rely on string IDs and prefix checks.

### Target Design

Convert graph edges to a discriminated union. Preserve `from` and `to` for easy snapshots, but attach semantic payloads where needed.

Recommended shape:

```ts
export type ReactiveGraphEdge =
  | ReadsKeyEdge
  | WritesEntityEdge
  | InvalidatesKeyEdge
  | WrapsFunctionEdge
  | RouteLoadsEdge
  | FormSubmitsEdge
  | EmitsEventEdge
  | SubscribesEventEdge;

export interface ReadsKeyEdge {
  readonly kind: "reads_key";
  readonly from: string;
  readonly to: string;
  readonly key: KeyExpression;
}

export interface InvalidatesKeyEdge {
  readonly kind: "invalidates_key";
  readonly from: string;
  readonly to: string;
  readonly pattern: ReactiveKeyPattern;
  readonly expression?: KeyPatternExpression;
}
```

Keep compatibility helpers if needed:

```ts
export type ReactiveGraphEdgeKind = ReactiveGraphEdge["kind"];
```

Do not keep the old names if they obscure semantics, unless changing all tests at once is too risky. If compatibility is needed, add functions that map new edges into a compact legacy summary for snapshots.

### Files To Touch

- `src/reactivity/reactivity.ts`
- `src/reactivity/targets/effect-atom.ts`
- `src/reactivity/targets/tanstack-query.ts`
- `tests/reactivity.test.ts`
- `tests/router.test.ts`
- `tests/milestone-7-8-integration.test.ts` if graph snapshots are affected

### Implementation Steps

1. Define discriminated edge interfaces.
2. Replace edge creation in `deriveReactiveGraph`:
   - query -> key family becomes `reads_key`
   - action -> entity becomes `writes_entity`
   - action/mutation -> key family becomes `invalidates_key`
   - resource -> query becomes `wraps_query`
   - mutation -> action becomes `wraps_action`
   - route -> loader becomes `route_loads`
   - route -> action becomes `route_submits` or `route_action`
   - form -> action becomes `form_submits`
   - action -> event becomes `emits_event`
   - subscription -> event becomes `subscribes_event`
3. Update sorting to work with new edge kinds.
4. Update graph query helpers to use new edge kinds and payload fields.
5. Avoid string-prefix logic where semantic node kind is available.
6. Update target generators only enough to compile and preserve previous rough behavior.
7. Add graph tests proving invalidation pattern payload is preserved in graph edges.
8. Add tests proving affected-resource queries still work.

### Acceptance Criteria

- Graph edges preserve key expression and invalidation pattern semantics.
- A graph artifact remains deterministic.
- Existing graph query helpers work with the new edge union.
- Target generators compile after edge changes.
- `vp check` and `vp test` pass.

### Diagnostics

Add graph derivation diagnostics if the architecture supports it. If `deriveReactiveGraph` cannot return diagnostics, add a separate checker.

Required diagnostics:

- `reactivity:invalidation-broadened`
- `reactivity:graph-edge-payload-missing`
- `reactivity:unkeyed-query-read`

Messages should explain which query/action/resource caused the lossy graph edge.

## Milestone DERI1: Conservative Derived Dependency Pass

### Problem

`spec/atom.txt` says reactivity should be primarily derived from static IR, with manual keys as refinements. Current graph derivation mostly reflects explicitly declared key metadata and simple action write edges. This risks making users manually maintain every invalidation key.

### Target Design

Add a small conservative dependency pass after G1 typed edges exist. Start narrow and correct. Do not attempt full predicate-aware affected-set derivation.

Minimum derived facts:

- Query body source entity -> query reads entity.
- Query projections/selects -> query reads fields when statically available.
- Action write operations -> action writes entity and fields.
- Action insert/update/delete -> broad invalidation candidates for entity collection/detail families when those families exist.
- Relation fields -> writes to foreign-key fields may affect relation keys broadly.
- Mapping/projected fields -> if dependency extraction exists, expand read dependencies through mappings.
- Manual reactivity metadata -> add explicit refinement edges alongside derived edges.

Represent derivation confidence:

```ts
export type DerivationConfidence = "declared" | "derived" | "conservative";
export type DerivationPrecision = "exact" | "matched" | "broad" | "unknown";
```

Attach these to relevant graph edges or a parallel plan record.

### Files To Touch

- `src/reactivity/reactivity.ts`
- `src/query/query.ts` if query dependency helpers belong there
- `src/function/function.ts` if action write-set helpers should be exported
- `src/storage/storage.ts` if mapping dependency helpers already exist or are easy to add
- `src/relation/relation.ts` if relation dependency helpers are needed
- `tests/reactivity.test.ts`
- `tests/rules-reactivity.test.ts`
- `tests/crud.test.ts`

### Implementation Steps

1. Add pure helper functions instead of embedding all logic in `deriveReactiveGraph`:
   ```ts
   deriveQueryReadDependencies(query): readonly ReadDependency[];
   deriveActionWriteDependencies(action): readonly WriteDependency[];
   deriveConservativeInvalidations(ctx, action): readonly DerivedInvalidation[];
   ```
2. Keep helper output as static records with discriminants.
3. Add graph edges for derived query reads and action writes.
4. Add broad invalidation edges only when a matching key family is discoverable in `ctx.key_families`.
5. If exact payload is unknown, use `.any()` and mark precision `"broad"`.
6. Emit or collect diagnostics for broadening.
7. Do not derive exact list key invalidation based on old/new values yet.
8. Add tests for insert/update/delete producing broad entity/collection invalidation when keys exist.
9. Add tests proving manual invalidation remains present and is distinguishable from derived invalidation.

### Acceptance Criteria

- A simple CRUD domain produces derived read/write edges without manually declared keys for every edge.
- Derived invalidation is conservative and marked as such.
- Manual keys remain first-class refinements.
- No exact/matched invalidation is claimed unless payload is actually known.
- `vp check` and `vp test` pass.

### Diagnostics

- `reactivity:derived-invalidation-broad`
- `reactivity:derived-dependency-incomplete`
- `reactivity:manual-invalidation-external-boundary`
- `reactivity:old-value-preread-needed`

Use warnings for conservative broadening and info for intentionally manual external invalidation.

## Milestone SCOPE1: Tracking Scope Metadata

### Problem

`spec/atom.txt` emphasizes semantic tracking scopes: renders, memos, loaders, resources, effects, actions, forms, and routes should record what they read. The current graph links routes/forms/resources through explicit bindings but does not model semantic scopes or untracked reads.

### Target Design

Add static metadata types first. Do not implement framework runtime tracking yet.

Recommended shape:

```ts
export type TrackingScopeKind =
  | "render"
  | "memo"
  | "loader"
  | "resource"
  | "effect"
  | "action"
  | "form"
  | "route";

export interface TrackingScope {
  readonly kind: "tracking_scope";
  readonly name: string;
  readonly scope_kind: TrackingScopeKind;
  readonly reads: readonly (KeyExpression | ReactiveResource | QueryFunction)[];
  readonly owner?: string;
}
```

### Files To Touch

- `src/reactivity/reactivity.ts`
- `src/core/context.ts`
- `src/gen/namespaces.ts`
- `src/gen/types.ts`
- `src/gen/binders.ts`
- `tests/reactivity.test.ts`
- `tests/router.test.ts`

### Implementation Steps

1. Define `TrackingScope` and `TrackingScopeKind`.
2. Add `defineTrackingScope`.
3. Expose `gen.reactivity.scope(...)` or `gen.reactivity.trackingScope(...)`.
4. Optionally add `ctx.tracking_scopes` if first-class discoverability is straightforward.
5. Add graph nodes/edges for tracking scopes:
   - scope reads key
   - scope reads query/resource
   - route/form/component owns scope if owner is known
6. Add diagnostics for scopes with no reads only if that indicates a likely mistake.
7. Do not implement runtime auto-tracking.

### Acceptance Criteria

- Tracking scopes can be represented as static records.
- Graph derivation can include scope read edges.
- Route/resource/form tests can assert semantic dependencies through scopes.
- `vp check` and `vp test` pass.

### Diagnostics

- `reactivity:tracking-scope-empty`
- `reactivity:untracked-resource-read`

Only emit `untracked-resource-read` when there is an actual known read outside a scope. Do not invent noisy diagnostics.

## Milestone R1: Resource State and Resource Diagnostics

### Problem

`ResourceState` does not match the plan and resource creation allows unkeyed resources without an explicit diagnostic or fallback story.

### Target Design

Align resource states with the plan:

```ts
export type ResourceState<Value = unknown, Err = ErrorType> =
  | { readonly status: "initial"; readonly stale: false }
  | { readonly status: "loading"; readonly stale: boolean }
  | { readonly status: "success"; readonly value: Value; readonly stale: boolean }
  | { readonly status: "refreshing"; readonly value: Value; readonly stale: true }
  | { readonly status: "failure"; readonly error: Err; readonly stale: boolean }
  | { readonly status: "defect"; readonly defect: unknown; readonly stale: boolean };
```

Add diagnostics for resource/key mismatches.

### Files To Touch

- `src/reactivity/reactivity.ts`
- `tests/reactivity.test-d.ts`
- `tests/reactivity.test.ts`
- lifecycle checker registration if needed

### Implementation Steps

1. Replace `ResourceState` interface with a discriminated union.
2. Update inference helper `InferResourceState`.
3. Update type tests currently using `status: "success"` to include required fields.
4. Add negative type tests for invalid state variants.
5. Update `checkReactivity` to inspect resources:
   - If resource query has no `reactivity.key`, emit warning `reactivity:resource-query-unkeyed` unless resource refresh plan explicitly makes it manual-only.
   - If resource has `refreshOnInvalidate` but query is unkeyed, emit error or warning depending on existing lifecycle severity style. Prefer warning initially.
6. Add runtime tests for diagnostics.

### Acceptance Criteria

- Resource states represent `initial`, `loading`, `success`, `refreshing`, `failure`, and `defect`.
- Invalid state shapes fail in type tests.
- Resource over an unkeyed query with invalidate refresh emits `reactivity:resource-query-unkeyed`.
- Manual-only unkeyed resources are allowed or produce only an info diagnostic, depending on chosen design.
- `vp check` and `vp test` pass.

### Diagnostics

- `reactivity:resource-query-unkeyed`
- `reactivity:resource-refresh-unkeyed-query`

## Milestone IA1: Static Invalidation Action Node

### Problem

`spec/atom.txt` calls out explicit invalidation inside action bodies. This should be an analyzable action node, not a target runtime call or opaque JS.

### Target Design

Add a static `ActionExpr` variant that represents invalidating key patterns. It should compose through `buildActionSequence` and appear in the reactive graph.

Recommended shape:

```ts
export interface InvalidateOperation {
  readonly kind: "invalidate_op";
  readonly patterns: readonly KeyPatternExpression[];
}
```

Depending on current `ActionExpr` structure, either add this to `operations` as a separate operation union or add a parallel `reactivity_operations` field. Prefer a discriminated union if feasible.

### Files To Touch

- `src/function/function.ts`
- `src/reactivity/reactivity.ts`
- `src/gen/namespaces.ts`
- `src/gen/types.ts`
- `tests/reactivity.test.ts`
- `tests/function.test.ts`

### Implementation Steps

1. Inspect current `ActionExpr` and `WriteOperation` types.
2. Add an invalidation operation without breaking existing write operation loops. If existing loops assume every operation has `target`, update them with exhaustive switches.
3. Add `buildActionInvalidate(patterns)` or expose `gen.reactivity.invalidate(patterns)` returning an `ActionExpr`/operation as appropriate.
4. Update `buildActionSequence` to preserve invalidation operations.
5. Update graph derivation to create invalidation edges from action-body invalidation nodes.
6. Add diagnostics for raw/non-static invalidation patterns.
7. Add tests for sequence: update entity + invalidate keys.

### Acceptance Criteria

- Explicit invalidation can appear in action bodies as static IR.
- Invalidation action nodes compose through sequences.
- Graph derivation sees invalidation action nodes.
- Existing action write diagnostics still work for insert/update/delete.
- `vp check` and `vp test` pass.

### Diagnostics

- `reactivity:invalidate-action-raw-key`
- `reactivity:invalidate-action-non-static`
- Existing `reactivity:invalidates-output-invalid`

## Milestone C1: CRUD Key Alignment

### Problem

CRUD derives default keys, but key payloads and names may be too conventional and duplicate-prone. Entity keys currently assume `{ id: string }`.

### Target Design

Make CRUD key derivation explicit, inspectable, and compatible with K1 schemas.

### Files To Touch

- `src/crud/crud.ts`
- `src/gen/binders.ts`
- `src/reactivity/reactivity.ts`
- `tests/crud.test.ts`
- `tests/crud1.test.ts`
- `tests/reactivity.test.ts`

### Implementation Steps

1. Inspect current `deriveCrud` options before editing.
2. Ensure CRUD-created key families have `input_type` where possible.
3. If entity id field inference exists, use it. If not, expose an option like `idField` or `getByIdKey` remains the recommended override.
4. Avoid creating duplicate key families when supplied by options.
5. Add tests for custom key families passed into CRUD.
6. Add diagnostics or test coverage for duplicate default key family names if `deriveCrud` is called twice for the same entity.

### Acceptance Criteria

- CRUD-generated queries still have reactivity keys.
- CRUD-generated mutations still invalidate appropriate list/detail families.
- CRUD key families include hierarchy and input schema where available.
- Duplicate key family diagnostics are tested.
- `vp check` and `vp test` pass.

### Diagnostics

- Existing `reactivity:duplicate-key-family`
- Consider `crud:key-family-duplicate-default` only if the generic duplicate diagnostic is not actionable enough.

## Milestone RR1: Rule-Derived Reactivity Safety

### Problem

Rule-derived reactivity classifies precision levels that are not fully supported by key payload or affected-set derivation. `patchable` may overpromise.

### Target Design

Keep Level 1 broad invalidation as the only authoritative derived behavior. Represent higher precision as advisory only until exact key payload and affected set derivation exist.

### Files To Touch

- `src/reactivity/rule-derived.ts`
- `tests/rules-reactivity.test.ts`
- `tests/rules-reactivity-depth.test.ts`

### Implementation Steps

1. Inspect existing rule reactivity tests to understand expected precision.
2. Rename or document precision classification fields if needed:
   - `precision` can remain as proposed precision.
   - Add `appliedPrecision` if necessary to show actual invalidation precision.
3. Ensure invalidation output remains broad unless exact/matched key patterns are genuinely produced.
4. If `patchable` is detected, emit advisory diagnostic only; do not imply target can apply patch automatically.
5. Revisit `dependency-not-extractable` for `exists`. Emit it only for dependencies that truly cannot be extracted, or change wording to “complex dependency may reduce precision.”
6. Add tests proving broad invalidation is selected for rule overlap.

### Acceptance Criteria

- Rule-derived invalidation does not overclaim exact/matched/patchable behavior.
- Diagnostics clearly distinguish proposed precision from applied precision.
- Existing rule-reactivity tests still pass or are intentionally updated to safer semantics.
- `vp check` and `vp test` pass.

### Diagnostics

- `rules-reactivity:broad-invalidation-selected`
- `rules-reactivity:affected-set-unknown`
- `rules-reactivity:patchable-advisory-only`
- `rules-reactivity:complex-dependency-reduces-precision`

## Milestone T0: Target Adapter Stabilization

### Problem

Target generators are currently placeholder-level and depend on graph node names/string IDs. After G1, they must adapt to typed edges but should not become more ambitious.

### Target Design

Keep targets compiling and honest. They may generate simple placeholder/snapshot artifacts, but they must diagnose unsupported semantics instead of pretending to generate production-ready code.

### Files To Touch

- `src/reactivity/targets/effect-atom.ts`
- `src/reactivity/targets/tanstack-query.ts`
- `tests/reactivity.test.ts` or target-specific tests if present

### Implementation Steps

1. Update target code to use new edge discriminants from G1.
2. Remove brittle string-prefix assumptions where possible.
3. Add diagnostics when required call metadata is missing:
   - no import/symbol metadata
   - no executable target plan
   - resource has no key expression
   - mutation invalidation is not constant/broad enough for the target
4. Preserve generated artifact paths.
5. Do not add new target APIs.
6. Do not claim generated code is production-ready in comments.

### Acceptance Criteria

- Both target plugins compile.
- Both target generators emit clear diagnostics for unsupported production code generation details.
- Existing target-related tests pass after snapshot updates.
- `vp check` and `vp test` pass.

### Diagnostics

- `effect-atom:missing-symbol-metadata`
- `effect-atom:unsupported-key-expression`
- `tanstack-query:missing-symbol-metadata`
- `tanstack-query:unsupported-key-expression`
- Existing `*:unsupported-feature` diagnostics remain.

## Milestone PE1: Capability/Fallback Metadata Seed

### Problem

`spec/atom.txt` treats progressive enhancement and graceful degradation as part of correctness. The current target/resource graph has little explicit baseline/enhanced/fallback/unsupported metadata.

### Target Design

Do not build a full enhancement package yet. Add shared seed types that future forms/resources/routes/targets can use.

Recommended shape:

```ts
export type CapabilityTier =
  | "static"
  | "server_form"
  | "enhanced_client"
  | "reactive"
  | "optimistic_offline"
  | "realtime";

export interface EnhancementPlan {
  readonly kind: "enhancement_plan";
  readonly baseline: CapabilityTier;
  readonly preferred: CapabilityTier;
  readonly fallbacks: readonly CapabilityTier[];
  readonly required_capabilities: readonly Capability[];
}
```

If similar types already exist in core/rules placement, reuse them instead of duplicating.

### Files To Touch

- `src/core/target.ts`
- `src/core/diagnostics.ts`
- `src/types/operation.ts` or another shared types module if capabilities live there
- `src/reactivity/reactivity.ts` only if resources need optional enhancement metadata
- `tests/reactivity.test.ts` only for resource metadata if added

### Implementation Steps

1. Search for existing `FallbackPlan`, `Capability`, `Requirement`, and placement types.
2. Reuse existing types where possible.
3. Add only minimal shared type definitions if there is no suitable home.
4. Optionally allow `ReactiveResource` to carry `enhancement?: EnhancementPlan`.
5. Add diagnostics helper or code literals for unsupported enhancement tiers.
6. Do not implement target selection logic beyond simple diagnostics if a target cannot support a declared tier.

### Acceptance Criteria

- There is one shared vocabulary for capability/fallback/enhancement metadata.
- Reactivity resources can reference enhancement metadata if implemented.
- No target silently ignores unsupported declared tiers if checked.
- `vp check` and `vp test` pass if code changed.

### Diagnostics

- `enhancement:capability-missing`
- `enhancement:fallback-selected`
- `enhancement:no-supported-plan`

Keep this milestone small. It is a seed for future progressive enhancement, not a full implementation.

## Milestone D1: Documentation and Plan Synchronization

### Problem

`atom_plan.md` has stale “not built” sections, and `spec/atom.txt` contains design details that are easy to miss if agents only read the shorter plan. Future agents may waste time, implement duplicates, or over-focus on Effect Atom as if it were the core abstraction.

### Target Design

Update planning docs to reflect actual implementation state, preserve `spec/atom.txt`'s derived-first design intent, and mark hardening work clearly.

### Files To Touch

- `atom_plan.md`
- `atom_plan_state_review.md` if new conclusions differ
- This guide if implementation choices diverge materially
- `spec/atom.txt` only if the user explicitly asks to edit the source notes; otherwise treat it as historical/source design material

### Implementation Steps

1. Update the stale `Current State` and `What Is Spec'd But Not Built` sections in `atom_plan.md`.
2. Do not delete historical rationale. Mark stale sections as superseded if deletion would be too disruptive.
3. Add a short “Current hardening priority” section pointing to this guide.
4. Summarize the `spec/atom.txt` principles that matter most: atoms as target, derived-first reactivity, typed manual keys, key hierarchy/batching, tracking scopes, Result-like resource state, services as generic graph, and progressive enhancement.
5. Keep documentation concise. The implementation should remain the source of truth.

### Acceptance Criteria

- `atom_plan.md` no longer says `src/reactivity/`, `gen.key.*`, `gen.reactivity.*`, typed routes, rules, services, and hydration are entirely absent.
- The docs clearly state that the current reactivity implementation is a first slice requiring hardening.
- The docs clearly state that normal invalidation should be derived where possible and manual keys are refinements for opaque boundaries.
- The docs do not imply Gen core should depend on Effect Atom or Effect-TS.
- `vp check` and `vp test` are not required for docs-only changes, but run them if code changed in the same milestone.

## Lifecycle Checker Requirements

Make sure built-in lifecycle checks include reactivity diagnostics. Inspect `src/lifecycle/lifecycle.ts` before changing anything.

Required checker coverage by the end:

- Duplicate key family names.
- Resource wrapping a non-query or invalid query-like node.
- Mutation wrapping a non-action or invalid action-like node.
- Resource with `refreshOnInvalidate` but no query key.
- Match payload fields unknown to key family schema.
- Exact key payload fields unknown to key family schema when exact keys are reachable.
- Legacy query invalidation that cannot lower to a key.
- Broad invalidation selected by rule-derived reactivity.
- Target unsupported feature or missing symbol metadata.
- Derived dependency broadening from query/action/mapping/relation analysis.
- Tracking scope with known untracked resource reads, when detectable.
- Unsupported key hierarchy propagation or batching semantics in a target.
- Unsupported enhancement tier or fallback selected.

## Required Test Plan

Add or update tests in small increments.

Runtime tests:

- `tests/reactivity.test.ts`
  - schema-driven key family stores `input_type`
  - hierarchy is set for custom/entity/collection families
  - unknown match field emits diagnostic
  - unkeyed resource with invalidate refresh emits diagnostic
  - graph edge payload preserves key pattern
  - affected resource queries still work
  - registry preserves families and hierarchy metadata
  - derived dependency pass produces broad invalidation from action writes
  - tracking scope read edges appear in graph
  - invalidation action node appears in graph
- `tests/crud.test.ts` or `tests/crud1.test.ts`
  - CRUD keys preserve hierarchy/schema where possible
  - CRUD mutations still invalidate list/detail keys
- `tests/router.test.ts`
  - route graph behavior still works after edge changes
- `tests/rules-reactivity.test.ts`
  - broad invalidation remains authoritative
  - patchable/matched precision is advisory if not applied

Type tests:

- `tests/reactivity.test-d.ts`
  - schema-driven family infers payload
  - generic-only family still works
  - invalid payload still fails
  - `ResourceState` invalid variants fail
  - action invalidation metadata carries mutation context phantom
  - heterogeneous key families do not collapse to unsafe `any`
  - registry family lookup preserves payload type
  - tracking scopes accept only static key/resource/query reads
- `tests/function-infer.test-d.ts`
  - `ActionFunction<In, Out>` preserves output through reactivity metadata

Verification commands:

```sh
vp check
vp test
```

If a command fails, fix the cause. Do not hide failures by weakening tests unless a test expectation is intentionally changed to match the new documented semantics.

## Diagnostic Catalog To Implement Or Preserve

Reactivity diagnostics:

- `reactivity:duplicate-key-family`
- `reactivity:key-payload-mismatch`
- `reactivity:key-match-unknown-field`
- `reactivity:key-family-missing-input-type`
- `reactivity:query-key-output-invalid`
- `reactivity:invalidates-output-invalid`
- `reactivity:raw-key-not-portable`
- `reactivity:resource-source-not-query`
- `reactivity:mutation-source-not-action`
- `reactivity:resource-query-unkeyed`
- `reactivity:resource-refresh-unkeyed-query`
- `reactivity:invalidation-broadened`
- `reactivity:derived-invalidation-broad`
- `reactivity:derived-dependency-incomplete`
- `reactivity:manual-invalidation-external-boundary`
- `reactivity:old-value-preread-needed`
- `reactivity:graph-edge-payload-missing`
- `reactivity:unkeyed-query-read`
- `reactivity:tracking-scope-empty`
- `reactivity:untracked-resource-read`
- `reactivity:invalidate-action-raw-key`
- `reactivity:invalidate-action-non-static`
- `reactivity:duplicate-registry-key`
- `reactivity:key-hierarchy-unsupported`
- `reactivity:key-batching-unsupported`
- `reactivity:optimistic-unreconcilable`

Function diagnostics:

- `function:legacy-invalidation-without-query-key`

Rule reactivity diagnostics:

- `rules-reactivity:mutation-writes-rule-dependency`
- `rules-reactivity:broad-invalidation-selected`
- `rules-reactivity:affected-set-unknown`
- `rules-reactivity:patchable-advisory-only`
- `rules-reactivity:complex-dependency-reduces-precision`
- `rules-reactivity:cross-store-rule-dependency`
- `rules-reactivity:time-dependent-rule`
- `rules-reactivity:ivm-delta-unsupported`

Target diagnostics:

- `effect-atom:unsupported-feature`
- `effect-atom:missing-query`
- `effect-atom:missing-action`
- `effect-atom:missing-symbol-metadata`
- `effect-atom:unsupported-key-expression`
- `tanstack-query:unsupported-feature`
- `tanstack-query:missing-query`
- `tanstack-query:missing-action`
- `tanstack-query:missing-symbol-metadata`
- `tanstack-query:unsupported-key-expression`

Enhancement diagnostics:

- `enhancement:capability-missing`
- `enhancement:fallback-selected`
- `enhancement:no-supported-plan`

Use literal diagnostic codes, not arbitrary strings hidden in helpers. If the project has a central diagnostic code union, update it.

## Suggested Implementation Details

### Key Schema Inference

Prefer this API:

```ts
const UserKey = gen.key.family("User", {
  input: gen.types.object({ id: gen.types.uuid() }),
});
```

Expected inference:

```ts
type UserKeyPayload = InferKeyFamilyInput<typeof UserKey>;
// { readonly id: string } or equivalent UUID TypeScript representation
```

If `gen.types.object` currently returns mutable object properties or non-readonly fields, do not over-fix the entire type system in this milestone. Preserve the existing semantic type conventions.

### Heterogeneous Invalidation

This should be accepted:

```ts
const UserKey = gen.key.family("User", { input: gen.types.object({ id: gen.types.uuid() }) });
const OrgKey = gen.key.family("Org", { input: gen.types.object({ slug: gen.types.string() }) });

gen.func.action({
  name: "updateMembership",
  input_type: MembershipInput,
  returns: MembershipOutput,
  body,
  reactivity: {
    invalidates: [gen.key.any(UserKey), gen.key.match(OrgKey, { slug: "core" })],
  },
});
```

Do not force both patterns into one fake payload type.

### Graph Edge Example

A query reading a key should produce an edge that retains the key expression:

```ts
{
  kind: "reads_key",
  from: "function.getUser",
  to: "key.User",
  key: query.reactivity.key,
}
```

A mutation invalidating a key should preserve the pattern:

```ts
{
  kind: "invalidates_key",
  from: "mutation.updateUserMutation",
  to: "key.User",
  pattern: gen.key.any(UserKey),
}
```

Snapshot tests should check this payload exists.

### Derived-First Reactivity Example

The agent should preserve this mental model:

```ts
const createUser = gen.func.action({
  name: "createUser",
  body: gen.func.buildActionInsert(User, [[User.fields.email, emailExpr]]),
  returns: User,
  input_type: CreateUserInput,
});
```

Even without manual invalidation, the compiler should eventually derive:

```txt
createUser writes User
createUser invalidates User.collection broadly
createUser may create User.entity(result.id) if result id is known
```

If the exact result id is not represented as a static expression yet, emit broad invalidation and a diagnostic rather than pretending exact invalidation is known.

Manual invalidation should look like an additive refinement:

```ts
reactivity: {
  infer: true,
  alsoInvalidates: [gen.key.any(dashboardStatsKey)],
}
```

Do not make users manually encode every normal entity/list invalidation forever.

## Things To Avoid

- Do not implement callback syntax like `gen.key.expr(({ id }) => ...)` unless you implement it as static AST, not opaque JS.
- Do not add new framework targets.
- Do not make rule-derived reactivity more precise than the key system can prove.
- Do not make manual invalidation the only path for ordinary entity/list/query refresh.
- Do not silently accept raw string keys.
- Do not delete legacy `invalidates: QueryFunction[]` yet.
- Do not make target output look production-ready if it is missing imports/call plans.
- Do not broaden types to `any` to make tests pass.
- Do not use global mutable registries outside `GenContext`.
- Do not implement runtime auto-tracking before static tracking scope metadata exists.
- Do not add pull/stream/offline/client-store resources before base key/resource/graph semantics are solid.

## Final Definition Of Done

The complete hardening project is done when:

- Key families have inspectable runtime schema/hierarchy metadata.
- Schema-driven key family constructors infer payload types without explicit generics.
- Key payload and match diagnostics work when schema metadata exists.
- Key hierarchy, registry grouping, and batching semantics are represented as static metadata.
- Constant key plans are clearly named and leave room for expression-backed plans.
- Action invalidation metadata has access to action input and output types.
- Reactive graph edges are discriminated unions with semantic payloads.
- A conservative derived dependency pass emits read/write/broad invalidation edges from static query/action metadata.
- Tracking scopes can represent semantic reads for routes/resources/forms/components.
- Resource state matches the atom plan.
- Explicit invalidation can appear as a static action node.
- Resources over unkeyed queries produce diagnostics when invalidation refresh is requested.
- CRUD keys and invalidations still work after key schema changes.
- Rule-derived reactivity is conservative and honest about precision.
- Effect Atom and TanStack targets compile but clearly diagnose unsupported production-generation details.
- Capability/fallback/enhancement metadata has a shared seed vocabulary or an explicit decision to defer it.
- `atom_plan.md` is updated so it does not contradict the implementation.
- `vp check` passes.
- `vp test` passes.

## If You Get Stuck

If TypeScript inference becomes too complex, stop and choose the smaller correct step:

- Preserve old public API.
- Add the runtime field or discriminant first.
- Add one focused test.
- Avoid adding helper abstractions until there are two real call sites.
- Prefer an explicit diagnostic over an over-precise type that requires casts.

The most important outcome is a truthful, inspectable IR. Syntax sugar and target code can wait.
