# Merge Implementation Plan

This plan grounds `merge.md` in the current `gen2` codebase. The proposal's direction is right: merge behavior should be typed, inspectable metadata on semantic types, fields, and operations. The important correction is that this repository already has the pieces merge should plug into. We should evolve `src/types/semantic.ts`, `src/entity/entity.ts`, `src/types/operation.ts`, `src/function/function.ts`, `src/reactivity/reactivity.ts`, and `src/events/events.ts` instead of creating a separate typeclass runtime or CRDT subsystem.

## Current State

Existing modules already cover most prerequisites:

- `src/types/semantic.ts`: `SemanticType<Ts>` is the natural default merge attachment point. It already carries phantom `_ts`, traits, storage/wire representations, serializer flags, enum values, aggregation placement, validators, custom constructors, factories, and `extend`.
- `src/entity/entity.ts`: `Field<Ts>` is the natural context-specific override point. Fields already carry `semantic_type`, ownership, stable refs, read-only flags, traits, defaults, stable IDs, rename history, external names, and entity transitions.
- `src/types/operation.ts`: operations already carry `capabilities`, `laws`, `effects`, and implementations. Existing `LawKind` covers associative, commutative, idempotent, identity, inverse, and distributive. Existing `CapabilityKind` covers pure, deterministic, reversible, partial, total, transactional, idempotent effect, and related runtime capabilities.
- `src/function/function.ts`: `ActionFunction`, `PatchFunction`, `ActionExpr`, `WriteOperation`, `PatchExpr`, and `PatchItemExpr` already model writes and optimistic patches. Merge should improve patch composition, inversion, and reconciliation rather than introduce a parallel write model.
- `src/reactivity/reactivity.ts`: `ReactiveMutation`, `OptimisticPlan`, `deriveDefaultOptimisticPlan`, `checkOptimisticPlans`, key families, invalidation plans, reactive graph analysis, and single-flight plans already model the consumer side for optimistic updates and cache reconciliation.
- `src/reactivity/rule-derived.ts`: rule-derived invalidation and IVM planning already inspect action write sets and field dependencies. Merge metadata should improve whether a field can be patched, folded, or must invalidate broadly.
- `src/events/events.ts`: events and reducers already exist. `MonoidOp` currently duplicates some law metadata with booleans; it should eventually bridge to `MergeStrategy` or `Operation` law metadata.
- `src/crud/crud.ts`: CRUD derivation creates standard create/update/delete actions and query invalidation. Field merge strategies should influence generated update semantics and diagnostics.
- `src/authz/mutation-plan.ts`: mutation access planning already analyzes action write sets. Merge checks should use this where merge behavior implies direct writes are forbidden or constrained.
- `src/core/migration_lineage.ts` and `versioning-plan.md`: stable IDs, structural diffing, migration planning, backfills, and optimistic locking are relevant for schema evolution and data backfill merge behavior.
- `src/editor/editor.ts`: `version_field` already supports optimistic locking. Merge planning should coordinate with version fields instead of replacing them.
- `src/gen/types.ts`, `src/gen/namespaces.ts`, and `src/gen/binders.ts`: namespace exposure should preserve generics with `typeof` constructor signatures, and context-bound constructors should register only top-level reusable strategies if we add a `ctx.merge_strategies` collection.

Name collision to avoid:

- `src/gen/builder.ts` already has `mergeGen` for merging namespace views of `CreateGenResult`. That is unrelated to semantic data merge behavior. New APIs should use `gen.merge.*` for user-facing merge strategies, but internal helpers should avoid generic names like `mergeGen` or `mergeContext` where confusion is likely.

## Design Direction

Implement a small typed merge/algebra IR first. Do not build a general typeclass system, theorem prover, distributed CRDT engine, or runtime merge executor in the MVP.

Core idea:

- `SemanticType<T>` can declare a default `MergeStrategy<T, Delta>`.
- `Field<T>` can override the semantic type's default strategy for entity-specific meaning.
- `Entity` merge planning composes field strategies into a field-wise plan.
- `ActionFunction`, `PatchFunction`, `ReactiveMutation`, reducers, IVM plans, migrations, and generated targets consume the metadata.
- Laws and capabilities determine whether batching, retry, optimistic rollback, event folding, and cache patching are safe.
- Opaque custom merge functions are allowed but diagnosed as non-portable for targets that require static lowering.

Preferred public API shape:

```ts
const Tags = gen.types.withMerge(gen.types.array(gen.types.string()), gen.merge.setUnion());

const UpdatedAt = gen.types.withMerge(gen.types.datetime(), gen.merge.max());

const Project = gen.entity("Project", {
  tags: { type: Tags },
  title: {
    type: gen.types.string(),
    merge: gen.merge.manualConflict({ reason: "Titles require explicit resolution" }),
  },
});
```

This plan uses `withMerge(type, strategy)` rather than `type.withMerge(...)` because the current semantic type constructors return plain immutable records, not fluent classes. A fluent method can be revisited later, but helper functions match the current codebase.

## Core IR Additions

Add these primitives in a new module such as `src/merge/merge.ts`, then export from `src/merge/index.ts` and the root barrel.

```ts
export type MergeOperationKind =
  | "replace"
  | "last_write_wins"
  | "first_write_wins"
  | "max"
  | "min"
  | "sum_delta"
  | "append"
  | "prepend"
  | "set_union"
  | "set_intersection"
  | "add_remove_set"
  | "field_wise"
  | "by_id_collection"
  | "state_machine"
  | "manual_conflict"
  | "reject_conflict"
  | "custom_expr"
  | "opaque_runtime";

export type ConflictBehavior = "never" | "may_conflict" | "always_conflict";

export interface MergeStrategy<
  T = never,
  Delta = T,
  Op extends MergeOperationKind = MergeOperationKind,
  Conflict extends ConflictBehavior = ConflictBehavior,
> {
  readonly kind: "merge_strategy";
  readonly name: string;
  readonly operation: MergeOperation<T, Delta, Op>;
  readonly value_type?: SemanticType<T>;
  readonly delta_type?: SemanticType<Delta>;
  readonly laws: readonly Law[];
  readonly capabilities: readonly Capability[];
  readonly requirements: readonly Requirement[];
  readonly effects: readonly Effect[];
  readonly conflict_behavior: Conflict;
  readonly _ts?: T;
  readonly _delta?: Delta;
  readonly _op?: Op;
  readonly _conflict?: Conflict;
}
```

Use a mostly closed discriminated `MergeOperation<T, Delta, Op>` union. Keep plugin escape hatches through branded operation kinds or `opaque_runtime`, but keep built-ins static and inspectable.

Initial operation branches:

- `replace`: deterministic overwrite. Not safe for concurrent edits without ordering.
- `last_write_wins`: requires a clock field or clock expression. Diagnosed if no clock is available when used for offline sync.
- `first_write_wins`: useful for immutable initialization.
- `max` / `min`: order-based merge for timestamps, versions, priorities, and monotonic markers.
- `sum_delta`: delta-based numeric folding for counters and aggregates. Prefer this over blind balance merge for money.
- `append` / `prepend`: ordered collection operations, non-commutative.
- `set_union` / `set_intersection`: collection operations with clear laws.
- `add_remove_set`: collection operation with tombstone semantics; include element identity metadata.
- `field_wise`: entity/object strategy composed from field strategies.
- `by_id_collection`: stable-ID collection merge using a field/ref as identity.
- `state_machine`: transition-checked enum merge using existing `TransitionGraph` where possible.
- `manual_conflict`: does not produce a merged value; requires generated conflict UI or server resolution.
- `reject_conflict`: forbids direct merge, useful for balances and permission-sensitive fields.
- `custom_expr`: inspectable `ExprFunction`-backed strategy.
- `opaque_runtime`: runtime-only function, always target-degraded unless a target explicitly supports it.

## Integration With Existing Systems

### Semantic Types

Add optional merge metadata to `SemanticType<Ts>`:

```ts
readonly merge_strategy?: MergeStrategy<Ts, unknown>;
```

Add helper constructors in `src/types/semantic.ts` or `src/merge/merge.ts`:

```ts
export const withMerge = <T>(
  type: SemanticType<T>,
  strategy: CompatibleMergeStrategy<T>,
): SemanticType<T> => ({ ...type, merge_strategy: bindMergeStrategy(type, strategy) });
```

Considerations:

- Preserve existing plain object style and immutability.
- `baseSemantic`, `brand`, `nullable`, `arrayOf`, `factory`, and `extend` need explicit behavior for preserving or clearing merge metadata.
- `brand` should preserve merge metadata by default because it preserves the same representation and TS type.
- `nullable` should not blindly preserve a non-null merge unless the strategy declares nullable support or a wrapper strategy is added.
- `arrayOf` should not invent collection merge semantics by default. Require explicit `gen.merge.*` strategy.
- `custom` and `factory` should accept optional `merge_strategy` so domain types can carry merge behavior at construction time.

### Fields

Add optional merge override to `Field<Ts>` and `FieldShapeInput`:

```ts
readonly merge_strategy?: MergeStrategy<Ts, unknown>;
```

Field-level strategy resolution should be:

1. `field.merge_strategy`
2. `field.semantic_type.merge_strategy`
3. no strategy, with diagnostics only in contexts that require merge behavior

Do not require every field to have a merge strategy globally. A field only needs merge metadata when used for optimistic reconciliation, offline sync, event folding, generated conflict resolution, patch composition, IVM, direct generated updates, or target-specific merge lowering.

### Entities

Add pure helpers that derive entity merge plans without mutating entities:

```ts
export interface EntityMergePlan<E extends Entity = Entity> {
  readonly kind: "entity_merge_plan";
  readonly entity: E;
  readonly fields: readonly FieldMergePlan[];
  readonly conflicts: "collect" | "fail_fast";
  readonly diagnostics: readonly Diagnostic[];
}
```

Recommended helpers:

- `deriveFieldMergeStrategy(field)` returns the field override, semantic default, or `undefined`.
- `deriveEntityMergePlan(entity, options?)` returns field-wise strategy information and diagnostics.
- `fieldWise(entity, { fields, conflicts })` builds a `MergeStrategy<InferEntity<E>>` for full object/entity merging.

Use existing `Field.ref` and `Entity.ref` in diagnostics.

### Operations, Laws, And Capabilities

Reuse `Law` and `Capability` from `src/types/operation.ts` rather than defining merge-specific booleans.

Add law kinds only if necessary:

- `monotonic`
- `deterministic`
- `absorptive`

Consider whether `deterministic`, `partial`, `total`, and `reversible` should remain capabilities rather than laws. The current code treats them as capabilities, so the MVP should use existing `CapabilityKind` instead of moving them.

Built-in strategy constructors should populate laws and capabilities consistently:

- `setUnion`: associative, commutative, idempotent, deterministic, total.
- `max` / `min`: associative, commutative, idempotent, deterministic, total, requires orderable.
- `sumDelta`: associative and usually commutative, deterministic, total; not idempotent unless delta IDs are tracked.
- `append` / `prepend`: associative, deterministic, total; not commutative.
- `lastWriteWins`: deterministic only with a deterministic clock and tie-breaker; generally total but not commutative unless timestamp ordering is modeled carefully.
- `manualConflict`: deterministic, partial, always conflict.
- `rejectConflict`: deterministic, partial or always conflict depending on branch.
- `opaqueRuntime`: no portability assumptions unless explicitly declared.

### Functions, Patches, And Actions

Do not replace `ActionFunction` or `PatchFunction`. Extend how they are checked and derived.

Relevant current shapes:

- `WriteOperation.values: ReadonlyMap<Field, Expr>` tells which fields are written.
- `PatchItemExpr.values: ReadonlyMap<Field, Expr>` tells which fields are patched optimistically.
- `PatchExpr.rollback_strategy` is currently `"inverse" | "custom"`.
- `ActionFunction.optimistic?: PatchFunction` already links actions to optimistic patches.

Add analysis helpers:

- `fieldsWrittenByAction(action)` or reuse existing graph helpers where possible.
- `checkActionMergeSemantics(action)` diagnoses direct writes to fields whose strategy rejects direct merge.
- `checkPatchMergeSemantics(patch)` diagnoses optimistic patches that require inverse/delta support but lack it.
- `derivePatchCompositionPlan(patch, entityPlan)` explains whether a patch can compose, invert, or must invalidate.

Potential later extension to `PatchExpr`:

```ts
readonly merge_mode?: "replace" | "merge" | "delta";
readonly merge_strategy?: MergeStrategy<unknown, unknown>;
```

Keep this out of the first slice unless tests prove it is needed. The first slice can inspect patch item fields and their strategies without changing patch shape.

### Reactivity And Optimistic Plans

The current `deriveDefaultOptimisticPlan` degrades because it cannot derive inverse rollback values. Merge metadata should make that diagnosis more precise.

Initial changes:

- `deriveDefaultOptimisticPlan` should call merge helpers for update operations.
- If all updated fields have inverse-capable delta strategies, rollback can be considered safer.
- If a field has `manualConflict`, `rejectConflict`, or opaque merge, emit a merge-specific diagnostic in the optimistic plan.
- If a patch is non-invertible, keep the existing fallback shape but include more actionable diagnostics.

Diagnostics should flow through existing `OptimisticPlan.diagnostics` and `checkOptimisticPlans`.

Do not add a second optimistic update model. `ReactiveMutation.optimistic` remains canonical.

### Events And Reducers

`events.MonoidOp` currently duplicates algebraic law metadata as booleans. Do not remove it in the MVP, but add a bridge:

- `monoidFromMerge(strategy)` for compatible total associative strategies.
- `mergeFromReducerOp(op)` only if enough type information exists.
- `checkReducerMergeSemantics(reducer)` should warn if a reducer target field has a conflicting merge strategy.

Longer term, `Reducer.combine` can become `Operation | MergeStrategy | MonoidOp`, but that is a breaking API and should happen only after migration tests exist.

### CRUD

CRUD update actions should not blindly imply safe field replacement in contexts that need conflict handling.

Initial behavior:

- `deriveCrud` continues generating current actions.
- Add diagnostics when generated update actions write fields whose merge strategy is `rejectConflict`, `manualConflict`, `state_machine`, or opaque without an explicit policy.
- For `state_machine`, prefer using existing `Entity.transitions` and `TransitionGraph` before adding a duplicate transition system.
- Field access options and authz surfaces remain separate. Merge controls how data evolves; authz controls who may write it.

### Authz

Merge metadata should not become authorization.

Integration points:

- Use `deriveMutationAccessPlan(action, ctx.policies)` when reporting generated merge/write warnings for actions.
- If merge rejects direct writes, emit a merge diagnostic even if authz allows field write.
- If authz rejects a write, do not attempt to infer merge behavior for that path as if it were reachable.

### Migrations And Backfills

Versioning and migration planning should consume merge metadata later, not in the MVP.

Useful future integrations:

- Backfill plans for field type changes can use `diff`/`applyDelta` metadata if available.
- Snapshot merge can use stable entity and field IDs from `src/core/migration_lineage.ts`.
- `version_field` in editors and schema versioning in `versioning-plan.md` should coordinate with `lastWriteWins`, `max`, and compare-and-swap style strategies.

## Namespace Changes

Add a new `merge` namespace to `Gen`.

Suggested type in `src/gen/types.ts`:

```ts
export interface MergeNamespace<C extends GenConfig = GenConfig> {
  readonly _config?: C;
  replace: typeof mergeMod.replace;
  lastWriteWins: typeof mergeMod.lastWriteWins;
  firstWriteWins: typeof mergeMod.firstWriteWins;
  max: typeof mergeMod.max;
  min: typeof mergeMod.min;
  sumDelta: typeof mergeMod.sumDelta;
  append: typeof mergeMod.append;
  prepend: typeof mergeMod.prepend;
  setUnion: typeof mergeMod.setUnion;
  setIntersection: typeof mergeMod.setIntersection;
  addRemoveSet: typeof mergeMod.addRemoveSet;
  byIdCollection: typeof mergeMod.byIdCollection;
  fieldWise: typeof mergeMod.fieldWise;
  stateMachine: typeof mergeMod.stateMachine;
  manualConflict: typeof mergeMod.manualConflict;
  rejectConflict: typeof mergeMod.rejectConflict;
  customExpr: typeof mergeMod.customExpr;
  opaqueRuntime: typeof mergeMod.opaqueRuntime;
  deriveField: typeof mergeMod.deriveFieldMergeStrategy;
  deriveEntity: typeof mergeMod.deriveEntityMergePlan;
  check: typeof mergeMod.checkMergeSemantics;
}
```

Also expose `withMerge` on `gen.types` unless the API is clearer as `gen.merge.withType`. Recommended MVP:

- `gen.types.withMerge(type, strategy)` for semantic type defaults.
- Field override via `gen.entity("X", { field: { type, merge: strategy } })`.
- `gen.merge.*` for strategies and analysis helpers.

Binder considerations:

- Built-in strategy constructors should be pure and not register in context.
- A named reusable custom strategy may optionally be registered later if we add `ctx.merge_strategies`.
- Do not add a context collection until a lifecycle checker or target generator needs to enumerate standalone strategies.

## Diagnostics Plan

Add diagnostics in `merge:*` with literal-union code types if the set grows.

High-value diagnostics:

- `merge:strategy-missing`: a context requires merge behavior but no field or semantic strategy exists.
- `merge:field-merge-missing`: an entity field lacks merge behavior during field-wise entity planning.
- `merge:field-strategy-type-mismatch`: field strategy value type does not match field semantic type.
- `merge:delta-type-mismatch`: delta strategy input/output does not match the field or patch expression.
- `merge:law-required-for-retry`: retry/reorder/batch planning requires a law the strategy does not declare.
- `merge:non-idempotent-retried-effect`: duplicate delivery is possible but the merge is not idempotent.
- `merge:non-commutative-parallel-merge`: parallel merge attempted with a non-commutative strategy.
- `merge:non-invertible-optimistic-rollback`: optimistic rollback requested but no inverse/delta inversion is available.
- `merge:conflict-policy-missing`: strategy may conflict but no conflict handling behavior is declared.
- `merge:custom-merge-not-portable`: custom expression/runtime merge cannot lower to the requested target.
- `merge:opaque-merge-in-generated-target`: target requires inspectable merge behavior but strategy is opaque.
- `merge:state-transition-invalid`: `state_machine` strategy references invalid enum states or transitions.
- `merge:direct-merge-forbidden`: a field rejects direct merge/write and must be updated through another action or ledger/event path.
- `merge:clock-missing`: LWW strategy requires a clock but none was provided.
- `merge:clock-field-wrong-entity`: LWW clock field does not belong to the merged entity.
- `merge:by-id-field-missing`: collection merge requires a stable identity field but none was provided.

Use `refs` on diagnostics whenever a `Field.ref`, `Entity.ref`, or `FunctionRef` exists.

## TypeScript Inference Notes

Rules from `AGENTS.md` apply strongly here.

- `MergeStrategy<T, Delta>` must carry phantom `_ts?: T` and `_delta?: Delta`.
- Constructors infer `T` from referenced `SemanticType<T>`, `Field<T>`, `Entity`, or `ExprFunction` values.
- Constructors return narrow strategy types, not a broad `MergeStrategy` union, where useful for conflict behavior and operation kind inference.
- Namespace types should use `typeof mergeMod.constructor` signatures to preserve generics.
- Avoid explicit type arguments in public examples and tests.
- Tests and examples must not use `as`, `as unknown`, `as any`, or `as import(...)`.
- Internal casts are acceptable only to work around TypeScript limitations, and should include a short comment.

### Generic Shape

Merge strategy types should encode three things independently:

- The value type being merged, `T`.
- The delta type, `Delta`, when the strategy is delta-based.
- Static capability metadata that can be inspected at type level where useful, such as conflict behavior or operation kind.

Recommended base shape:

```ts
export interface MergeStrategy<
  T = never,
  Delta = T,
  Op extends MergeOperationKind = MergeOperationKind,
  Conflict extends ConflictBehavior = ConflictBehavior,
> {
  readonly kind: "merge_strategy";
  readonly name: string;
  readonly operation: MergeOperation<T, Delta, Op>;
  readonly value_type?: SemanticType<T>;
  readonly delta_type?: SemanticType<Delta>;
  readonly laws: readonly Law[];
  readonly capabilities: readonly Capability[];
  readonly requirements: readonly Requirement[];
  readonly effects: readonly Effect[];
  readonly conflict_behavior: Conflict;
  readonly _ts?: T;
  readonly _delta?: Delta;
  readonly _op?: Op;
  readonly _conflict?: Conflict;
}
```

The extra `Op` and `Conflict` type parameters are optional but useful. They let constructors return types such as `MergeStrategy<T, T, "set_union", "never">` or `MergeStrategy<T, T, "manual_conflict", "always_conflict">`, which can help downstream helpers reject unsafe plans at compile time before diagnostics run.

Avoid `unknown` as the default for `T` if a more precise value can be inferred. `never` is a better default for generic strategy factories that require a later `SemanticType<T>` or `Field<T>` to bind the value type, because accidental use of an unbound strategy is easier to detect.

### Constructor Inference Patterns

Constructors fall into two categories.

Type-bound constructors infer immediately from a runtime type reference:

```ts
export const maxFor = <T>(
  value_type: SemanticType<T>,
): MaxMergeStrategy<T> => ({ ... });

const UpdatedAt = gen.types.withMerge(
  gen.types.datetime(),
  gen.merge.maxFor(gen.types.datetime()),
);
```

Polymorphic constructors infer later from `withMerge` or field assignment:

```ts
export const max = (): PolymorphicMergeStrategy<"max", "never"> => ({ ... });

const UpdatedAt = gen.types.withMerge(gen.types.datetime(), gen.merge.max());
// UpdatedAt: SemanticType<Date>
```

The second form is more ergonomic but harder to type safely. Use a separate internal type for unbound strategies rather than making `gen.merge.max()` return `MergeStrategy<unknown>`.

Recommended pattern:

```ts
export interface UnboundMergeStrategy<
  Op extends MergeOperationKind,
  Conflict extends ConflictBehavior,
  Delta = never,
> {
  readonly kind: "merge_strategy.unbound";
  readonly name: string;
  readonly operation_kind: Op;
  readonly laws: readonly Law[];
  readonly capabilities: readonly Capability[];
  readonly conflict_behavior: Conflict;
  readonly _delta?: Delta;
  readonly _op?: Op;
  readonly _conflict?: Conflict;
}

export type MergeStrategyInput<T> =
  | MergeStrategy<T, unknown>
  | UnboundMergeStrategy<MergeOperationKind, ConflictBehavior>;
```

Then `withMerge` can bind an unbound strategy to a semantic type:

```ts
export const withMerge = <T, S extends MergeStrategyInput<T>>(
  type: SemanticType<T>,
  strategy: S,
): SemanticType<T> => ({ ...type, merge_strategy: bindMergeStrategy(type, strategy) });
```

This avoids losing type safety while keeping the authoring API concise.

### Strategy Compatibility

Field and semantic type APIs should reject strategies whose value type is known and incompatible.

Use a compatibility helper rather than an unconstrained `MergeStrategy` in public inputs:

```ts
export type CompatibleMergeStrategy<T> =
  | MergeStrategy<T, unknown>
  | UnboundMergeStrategy<MergeOperationKind, ConflictBehavior>;

export const withMerge = <T>(
  type: SemanticType<T>,
  strategy: CompatibleMergeStrategy<T>,
): SemanticType<T> => ({ ...type, merge_strategy: bindMergeStrategy(type, strategy) });
```

Field input should preserve the same constraint:

```ts
export type FieldShapeInput<Ts = unknown> =
  | SemanticType<Ts>
  | {
      type: SemanticType<Ts>;
      merge?: CompatibleMergeStrategy<Ts>;
      merge_strategy?: CompatibleMergeStrategy<Ts>;
      // existing field options
    };
```

If `FieldShapeInput` stays non-generic for compatibility, introduce an internal conditional helper used by `InferFieldFromInput<T>` so typed object inputs still preserve the relationship between `type` and `merge`.

### Entity Field Inference

Entity construction is the most important autocomplete surface. The merge addition must not degrade this:

```ts
const Project = gen.entity("Project", {
  title: {
    type: gen.types.string(),
    merge: gen.merge.manualConflict({ reason: "Resolve title conflicts explicitly" }),
  },
  viewCount: {
    type: gen.types.int(),
    merge: gen.merge.sumDelta({ identity: 0 }),
  },
});

Project.fields.title; // Field<string>
Project.fields.viewCount; // Field<number>
```

The added `merge` property must not cause the object literal to widen into `Field<unknown>`. If it does, the field input type is wrong.

Expected invalid examples:

```ts
gen.entity("Bad", {
  count: {
    type: gen.types.int(),
    // @ts-expect-error string-only merge strategy cannot attach to number field
    merge: gen.merge.customExpr(stringMergeExpr),
  },
});
```

Avoid making `FieldShapeInput` accept `merge?: MergeStrategy` without a generic parameter. That would let any strategy attach to any field and push all errors to runtime diagnostics.

### Entity-Level Generics

Entity merge helpers should infer the entity shape from `Entity` fields:

```ts
export const fieldWise = <E extends Entity>(
  entity: E,
  input?: {
    readonly fields?: Partial<{
      readonly [K in keyof E["fields"]]: CompatibleMergeStrategy<InferField<E["fields"][K]>>;
    }>;
    readonly conflicts?: "collect" | "fail_fast";
  },
): FieldWiseMergeStrategy<InferEntity<E>> => ({ ... });
```

This gives autocomplete for valid field names and rejects invalid field names:

```ts
gen.merge.fieldWise(Project, {
  fields: {
    title: gen.merge.lastWriteWins({ clock: Project.fields.updatedAt }),
    // @ts-expect-error not a Project field
    missing: gen.merge.replace(),
  },
});
```

Do not use `Record<string, MergeStrategy>` for entity field overrides. It loses autocomplete and allows invalid field names.

### Clock And State Machine Typing

`lastWriteWins` should prefer a typed clock field:

```ts
export type ClockValue = Date | number | bigint | string;

export const lastWriteWins = <Clock extends ClockValue>(input: {
  readonly clock: Field<Clock> | Expr<Clock>;
  readonly tie_breaker?: Field<string> | Expr<string>;
}): UnboundMergeStrategy<"last_write_wins", "never"> => ({ ... });
```

Entity-local clock ownership must be validated at runtime because generic field ownership is structural. The type can ensure the clock value is orderable, while diagnostics ensure the clock belongs to the right entity.

`stateMachine` should infer from enum semantic values where possible:

```ts
export const stateMachine = <const States extends readonly string[]>(input: {
  readonly states: States;
  readonly transitions: Partial<Record<States[number], readonly States[number][]>>;
}): MergeStrategy<States[number], States[number], "state_machine", "may_conflict"> => ({ ... });
```

For field-driven state machines, prefer existing `TransitionGraph`:

```ts
export const stateMachineForField = <F extends Field<string>>(input: {
  readonly field: F;
  readonly graph?: TransitionGraph;
}): CompatibleMergeStrategy<InferField<F>> => ({ ... });
```

The runtime checker should still verify that transition states are included in `field.semantic_type.enum_values`.

### Delta Typing

Delta-based strategies must preserve both value and delta types.

```ts
export interface DeltaMergeStrategy<T, Delta, Op extends MergeOperationKind>
  extends MergeStrategy<T, Delta, Op, ConflictBehavior> {
  readonly delta_type: SemanticType<Delta>;
}

export const sumDelta = <T extends number | bigint = number>(input?: {
  readonly identity?: T;
  readonly delta_type?: SemanticType<T>;
}): DeltaMergeStrategy<T, T, "sum_delta"> => ({ ... });
```

For money-like values, avoid pretending all numeric-looking types support `sumDelta`. A `SemanticType<bigint>` named `money` should not automatically accept counter semantics. Users should explicitly choose a ledger/delta strategy.

Patch helpers should inspect `InferMergeDelta<S>` instead of assuming the delta is the value type.

### Conflict-Aware Types

Conflict behavior should be available in the type where practical:

```ts
export type CanConflict<S> =
  S extends MergeStrategy<unknown, unknown, MergeOperationKind, infer C>
    ? C extends "never"
      ? false
      : true
    : boolean;

export type TotalMergeStrategy<T> = MergeStrategy<T, unknown, MergeOperationKind, "never">;
```

This allows helpers that require total merges:

```ts
export const monoidFromMerge = <T, S extends TotalMergeStrategy<T>>(
  strategy: S,
): MonoidOp => ({ ... });
```

Do not rely exclusively on type-level conflict behavior. Opaque/custom strategies may need runtime diagnostics because their behavior can depend on target support or declared metadata.

### Namespace Preservation

When adding `gen.merge`, expose real constructor signatures:

```ts
export interface MergeNamespace<C extends GenConfig = GenConfig> {
  readonly _config?: C;
  setUnion: typeof mergeMod.setUnion;
  fieldWise: typeof mergeMod.fieldWise;
  stateMachine: typeof mergeMod.stateMachine;
}
```

Avoid wrappers like this:

```ts
// Bad: erases generic inference and narrow return types.
setUnion: () => mergeMod.setUnion(),
```

If a context-bound wrapper is needed later, cast it back to `typeof constructor` and add a comment explaining the inference-preserving cast.

### Type Tests

Add dedicated type tests as each phase lands:

- `tests/merge-strategy-infer.test-d.ts`
- `tests/merge-semantic-infer.test-d.ts`
- `tests/merge-field-infer.test-d.ts`
- `tests/merge-entity-infer.test-d.ts`
- `tests/merge-delta-infer.test-d.ts`
- `tests/merge-reactivity-infer.test-d.ts` once optimistic integration exists.

Type tests should verify:

- `gen.merge.setUnion()` can bind to `SemanticType<string[]>` without explicit type arguments.
- `gen.types.withMerge(gen.types.datetime(), gen.merge.max())` returns `SemanticType<Date>`.
- Field merge overrides preserve `Field<T>` inference in `gen.entity`.
- Incompatible field/strategy combinations fail with `@ts-expect-error`.
- `gen.merge.fieldWise(Entity, { fields })` autocompletes valid field names and rejects invalid field names.
- Field-wise strategy values are checked against each field's `Field<T>` type.
- `sumDelta` preserves value and delta inference.
- `manualConflict` and `rejectConflict` expose conflict behavior in the returned type.
- `monoidFromMerge` accepts total associative strategies and rejects conflict-only strategies.
- Namespace access through `gen.merge.*` preserves the same inference as importing constructors directly.

Type tests must not use casts. If a test needs a cast, fix the public API or constructor types.

### Common Failure Modes To Avoid

- Returning `MergeStrategy<unknown>` from polymorphic built-ins. This silently accepts incompatible fields.
- Typing field input as `merge?: MergeStrategy`. This loses the relationship between `type` and `merge`.
- Using `Record<string, MergeStrategy>` for entity field plans. This loses field-name autocomplete.
- Re-declaring namespace method signatures manually. This drifts from implementation and often erases generics.
- Encoding law metadata only as booleans on merge strategies. Reuse `Law` and `Capability` so the rest of the compiler can consume the same metadata.
- Making `customExpr` accept any `StaticFunction`. Prefer `ExprFunction` for inspectable target lowering; use `opaqueRuntime` for runtime-only behavior.
- Preserving merge metadata through `nullable` without a clear nullable strategy. Null merge behavior is not automatically the same as non-null merge behavior.
- Treating TypeScript compatibility as a replacement for diagnostics. Types catch authoring errors; diagnostics still check registration, entity ownership, target support, and semantic validity.

Useful helpers:

```ts
export type InferMergeValue<S> = S extends MergeStrategy<infer T, unknown> ? T : never;
export type InferMergeDelta<S> = S extends MergeStrategy<unknown, infer D> ? D : never;
export type FieldMergeStrategy<F extends Field> =
  F extends Field<infer T> ? MergeStrategy<T, unknown> : never;
```

Constructor examples:

```ts
export const max = <T>(options?: {
  readonly value_type?: SemanticType<T>;
}): MaxMergeStrategy<T> => ({ ... });

export const byIdCollection = <E extends Entity, Id extends Field>(input: {
  readonly entity: E;
  readonly id: Id;
  readonly item?: MergeStrategy<InferEntity<E>>;
}): ByIdCollectionMergeStrategy<InferEntity<E>> => ({ ... });
```

Field override typing should reject incompatible strategies:

```ts
const Project = gen.entity("Project", {
  title: {
    type: gen.types.string(),
    merge: gen.merge.lastWriteWins({ clock: ProjectClock }),
  },
  count: {
    type: gen.types.int(),
    // @ts-expect-error string merge strategy cannot be used for number field
    merge: gen.merge.customExpr(stringMergeFn),
  },
});
```

The `ProjectClock` example above cannot literally reference `Project` while defining `Project`. For entity-local clock fields, provide a second-phase helper or allow a string only if it is checked and diagnosed. Recommended MVP: accept `Field<Date>` for clocks and document that self-referential entity clock wiring uses `gen.merge.fieldWise(Project, ...)` or `gen.merge.deriveEntity(Project)` after entity creation.

## Implementation Guidance For Future Agents

This section is intentionally explicit. Follow it when implementing the plan so the result stays aligned with the existing codebase rather than drifting into a parallel abstraction.

### Non-Negotiable Rules

- Do not implement a runtime CRDT engine in the MVP.
- Do not implement a general `typeclass` namespace in the MVP.
- Do not replace `ActionFunction`, `PatchFunction`, `ReactiveMutation`, `Reducer`, `MonoidOp`, or `TransitionGraph`.
- Do not require every field in every entity to declare a merge strategy.
- Do not make merge strategy checks run globally as errors unless the field/action/target is actually in a merge-sensitive context.
- Do not use `any` in public type signatures. If an internal implementation needs a cast to preserve inference, explain it in a short comment.
- Do not add string field paths where a `Field<T>` or `Entity` reference exists.
- Do not put JSON Render, UI conflict components, offline queue runtime code, or target-specific lowering into `src/merge`.
- Do not store executable runtime functions inside merge strategies except under an explicit `opaque_runtime` branch.
- Do not make `gen.merge.max()` return `MergeStrategy<unknown>`. Use an unbound strategy shape or a type-bound constructor.
- Do not type entity field overrides as `Record<string, MergeStrategy>`. Use mapped types over `keyof E["fields"]`.

### Recommended File Responsibilities

Keep responsibilities narrow:

- `src/merge/merge.ts`: merge IR types, built-in strategy constructors, strategy binding helpers, strategy compatibility helpers, entity/field merge plan derivation, and merge diagnostics.
- `src/merge/index.ts`: re-export only the public merge API.
- `src/types/semantic.ts`: add `merge_strategy` to `SemanticType<Ts>`, add `withMerge`, and preserve/clear merge metadata in type constructors deliberately.
- `src/entity/entity.ts`: add field-level merge input and stored `merge_strategy`; keep field inference intact.
- `src/gen/types.ts`: add `MergeNamespace`, expose `gen.merge`, and expose `gen.types.withMerge`.
- `src/gen/namespaces.ts`: create `createMergeNamespace`; wire constructors directly using `typeof` signatures.
- `src/gen/builder.ts` or `src/gen/create*` files: add the namespace to the created `gen` object only where namespaces are assembled.
- `src/reactivity/reactivity.ts`: only consume merge helpers for optimistic plan diagnostics; do not define merge IR here.
- `src/events/events.ts`: only add bridge helpers/diagnostics; do not move reducer concepts into merge yet.
- `src/crud/crud.ts`: only add diagnostics or metadata consumption; do not change the generated CRUD API shape unless a phase explicitly says to.
- `src/lifecycle/lifecycle.ts`: register merge checks only after the checks are context-sensitive enough to avoid noisy global warnings.

If a change seems to require touching many unrelated modules, stop and reassess. The MVP should be small and mostly additive.

### Exact Phase 1 Shape

Phase 1 should compile even if no semantic type or field can attach merge metadata yet.

Minimum useful contents of `src/merge/merge.ts`:

- `MergeOperationKind`
- `ConflictBehavior`
- `MergeOperation<T, Delta, Op>` discriminated union
- `MergeStrategy<T, Delta, Op, Conflict>`
- `UnboundMergeStrategy<Op, Conflict, Delta>`
- `CompatibleMergeStrategy<T>`
- built-in constructors listed in Phase 1
- `bindMergeStrategy(type, strategy)` for turning unbound strategies into typed strategies
- `hasMergeLaw(strategy, kind)`
- `hasMergeCapability(strategy, kind)`

Do not add `GenContext.merge_strategies` in Phase 1. There is no need to register pure built-ins.

### Exact Phase 2 Shape

Phase 2 should be the first phase where entity and semantic type APIs change.

Implementation checklist:

- Add `import type { MergeStrategy, CompatibleMergeStrategy } from "../merge/index.ts"` where needed, using type-only imports to avoid cycles.
- Add `merge_strategy?: MergeStrategy<Ts, unknown>` to `SemanticType<Ts>`.
- Add `withMerge<T>(type, strategy)` and export it through `gen.types.withMerge`.
- Add `merge?: CompatibleMergeStrategy<Ts>` and `merge_strategy?: CompatibleMergeStrategy<Ts>` to field object input.
- Store only one property on `Field<Ts>`: `merge_strategy?: MergeStrategy<Ts, unknown>`.
- If both `merge` and `merge_strategy` are provided, emit or document a diagnostic preference. Recommendation: prefer `merge_strategy` and add a warning later; do not silently merge two strategies.
- In `makeField`, bind unbound strategy with the field's semantic type before storing it.
- Keep `InferFieldFromInput<T>` returning the same `Field<T>` types it returns today.

Expected `makeField` behavior:

```ts
const mergeInput = opts.merge_strategy ?? opts.merge;
const merge_strategy =
  mergeInput === undefined ? undefined : bindMergeStrategy(semantic_type, mergeInput);
```

If importing `bindMergeStrategy` into `entity.ts` causes a cycle, move only the type-level compatibility into `entity.ts` and bind in a small utility module with no dependency on entities. Do not solve cycles by using `any`.

### Exact Phase 3 Shape

Entity merge planning should be pure analysis. It should not mutate `Entity`, `Field`, or `GenContext`.

Recommended records:

```ts
export interface FieldMergePlan<F extends Field = Field> {
  readonly kind: "field_merge_plan";
  readonly field: F;
  readonly strategy?: MergeStrategy<InferField<F>, unknown>;
  readonly source: "field" | "semantic_type" | "missing";
  readonly diagnostics: readonly Diagnostic[];
}
```

`deriveFieldMergeStrategy(field)` should return source information, not just the strategy. This matters for diagnostics and generated explanations.

`deriveEntityMergePlan(entity)` should iterate `entity.fieldList`, not `Object.keys(entity.fields)`, because field order is already canonical in the current codebase.

### Diagnostics Severity Defaults

Use conservative severities:

- Missing merge strategy outside a merge-sensitive context: no diagnostic.
- Missing merge strategy while deriving an explicit entity merge plan: warning.
- Missing merge strategy for a target that must generate offline/conflict behavior: error in the target checker, not necessarily core.
- Opaque runtime strategy in core analysis: warning.
- Opaque runtime strategy in a static target generator: error or target-specific warning depending on target policy.
- Type/value mismatch detectable at runtime: error.
- State-machine transition that references unknown enum value: error.
- Non-invertible optimistic rollback: warning unless the user explicitly requested guaranteed rollback.

### Runtime Checks Versus Type Checks

Use TypeScript for authoring-time compatibility only. Use diagnostics for graph-level facts:

- TypeScript can check that `Field<number>` does not receive a known `MergeStrategy<string>`.
- TypeScript cannot reliably check that a clock field belongs to the same entity as the merged field.
- TypeScript cannot verify that a `TransitionGraph` only references enum values once data is assembled dynamically.
- TypeScript cannot know whether an opaque runtime merge is supported by a specific target.
- TypeScript cannot know if a strategy has been registered in a context unless the API requires registration.

When in doubt, keep the type helpful but add a diagnostic for graph-level validation.

### Import And Cycle Guidance

Avoid circular dependencies:

- `src/merge/merge.ts` may import types from `semantic`, `entity`, `operation`, `function`, `reactivity`, and `events` as type-only imports where possible.
- `src/types/semantic.ts` should import only merge types and small pure helpers. If importing runtime helper functions creates cycles, move helper functions into a no-cycle module such as `src/merge/bind.ts` that depends only on `semantic` and `operation`.
- `src/entity/entity.ts` should avoid importing large merge consumers like reactivity or events.
- `src/reactivity/reactivity.ts` may import merge analysis helpers after merge core exists, but merge core must not import reactivity runtime helpers except as type-only references.

Do not fix cycles by lazy `require`, dynamic import, or widening types to `unknown`/`any`.

### Validation Commands

After implementation phases that touch TypeScript files, run:

- `vp check`
- `vp test`

If only Markdown changed, tests are optional. If public type inference changed, `vp check` is required because type tests are the main safety net.

### Minimal First PR Target

The smallest valuable implementation PR is:

- Add `src/merge/merge.ts` and `src/merge/index.ts`.
- Add `gen.merge` namespace with pure built-ins.
- Add type tests proving strategy inference.
- Do not yet touch `SemanticType` or `Field`.

The second PR should attach strategies to `SemanticType` and `Field`. Keeping these separate makes failures easier to diagnose.

### Examples That Should Work Eventually

These are implementation targets, not necessarily Phase 1 tests:

```ts
const Tags = gen.types.withMerge(gen.types.array(gen.types.string()), gen.merge.setUnion());

const Project = gen.entity("Project", {
  id: { type: gen.types.uuid(), read_only: true },
  title: {
    type: gen.types.string(),
    merge: gen.merge.manualConflict({ reason: "Title edits need review" }),
  },
  tags: { type: Tags },
  updatedAt: {
    type: gen.types.datetime(),
    merge: gen.merge.max(),
  },
});

const plan = gen.merge.deriveEntity(Project);
```

```ts
gen.merge.fieldWise(Project, {
  fields: {
    title: gen.merge.lastWriteWins({ clock: Project.fields.updatedAt }),
    tags: gen.merge.setUnion(),
    updatedAt: gen.merge.max(),
  },
});
```

Examples that should fail type checking:

```ts
gen.merge.fieldWise(Project, {
  fields: {
    // @ts-expect-error unknown field
    doesNotExist: gen.merge.replace(),
  },
});

gen.entity("Bad", {
  count: {
    type: gen.types.int(),
    // @ts-expect-error incompatible strategy value type
    merge: gen.merge.stateMachine({ states: ["draft", "done"], transitions: {} }),
  },
});
```

### Documentation Comments

Public constructors should have short JSDoc comments. Keep them factual:

- what strategy branch they create,
- what value/delta type they infer,
- which laws/capabilities are declared by default,
- when diagnostics may be emitted.

Avoid long conceptual essays in source comments. The plan document can carry the larger rationale.

## Implementation Sequence

Each phase should land as a small, checkable slice.

### Phase 1: Merge Strategy IR And Built-Ins

Goal:

- Add target-neutral merge strategy records and built-in constructors without changing existing behavior.

Files:

- `src/merge/merge.ts`
- `src/merge/index.ts`
- `src/index.ts`
- `src/types/operation.ts` only if adding law kinds is unavoidable

Work:

- Add `MergeStrategy`, `MergeOperation`, `ConflictBehavior`, and narrow built-in strategy interfaces.
- Add built-ins: `replace`, `lastWriteWins`, `max`, `min`, `sumDelta`, `setUnion`, `fieldWise`, `manualConflict`, `rejectConflict`, `customExpr`, `opaqueRuntime`.
- Populate `laws`, `capabilities`, `requirements`, `effects`, and `conflict_behavior` consistently.
- Add pure law/capability helper predicates like `hasLaw(strategy, "associative")` and `hasCapability(strategy, "reversible")` if needed by diagnostics.

Tests:

- Runtime tests for constructor shapes and default laws/capabilities.
- Type tests for strategy value/delta inference.
- No casts in tests.

Acceptance criteria:

- `gen.merge.setUnion()` and similar constructors return narrow, inspectable strategy records.
- Built-ins expose enough static metadata for retry, reordering, optimistic rollback, and target lowerability checks.
- No existing APIs or tests break.

### Phase 2: Attach Merge To SemanticType And Field

Goal:

- Let semantic types define default merge behavior and fields override it.

Files:

- `src/types/semantic.ts`
- `src/entity/entity.ts`
- `src/gen/types.ts`
- `src/gen/namespaces.ts`

Work:

- Add `merge_strategy?: MergeStrategy<Ts, unknown>` to `SemanticType<Ts>`.
- Add `withMerge(type, strategy)` helper and expose as `gen.types.withMerge`.
- Add optional `merge` / `merge_strategy` to `FieldShapeInput` and `Field<Ts>`.
- Ensure `makeField` copies the merge override.
- Define preservation behavior for `brand`, `nullable`, `extend`, `custom`, and `factory`.

Tests:

- Type tests prove field strategy value types match field semantic types.
- Runtime tests prove semantic default and field override are preserved.
- Existing entity and semantic tests continue to pass.

Acceptance criteria:

- A user can attach merge behavior to a semantic type without explicit type arguments.
- A user can override merge behavior for a field in `gen.entity`.
- Field and semantic type inference remain intact.
- No public tests require casts.

### Phase 3: Entity Merge Planning And Diagnostics

Goal:

- Compose field strategies into entity-level merge plans and diagnose missing or unsafe strategies.

Files:

- `src/merge/merge.ts`
- `src/entity/entity.ts` only if additional transition helpers are needed
- `src/lifecycle/lifecycle.ts` if registering a built-in checker

Work:

- Add `deriveFieldMergeStrategy(field)`.
- Add `deriveEntityMergePlan(entity, options?)`.
- Add `checkMergeSemantics(ctx)` or narrower check functions that can be registered in lifecycle.
- Validate `state_machine` strategies against `SemanticType.enum_values` and existing `TransitionGraph`.
- Validate LWW clock field ownership where a field is provided.
- Validate by-ID collection identity field metadata.

Tests:

- Missing field strategy diagnostics.
- Field override wins over semantic default.
- State machine diagnostics for invalid enum states.
- Clock ownership diagnostics.

Acceptance criteria:

- Entity merge plans explain every field's resolved strategy or missing strategy.
- Diagnostics cite entity/field refs.
- Lifecycle checks can surface merge issues without requiring merge strategies for fields that are never used in merge-sensitive contexts.

### Phase 4: Optimistic Patch And Reactive Mutation Integration

Goal:

- Use merge metadata to improve optimistic plan safety and diagnostics.

Files:

- `src/reactivity/reactivity.ts`
- `src/function/function.ts` only if patch shape must be extended
- `src/reactivity/rule-derived.ts` if IVM/patchability diagnostics need merge info

Work:

- Add helper checks for `PatchExpr` fields and resolved merge strategies.
- Enrich `deriveDefaultOptimisticPlan` diagnostics for update operations.
- Diagnose non-invertible rollback when update fields lack inverse/delta support.
- Diagnose manual/reject/opaque strategies in optimistic plans.
- Preserve existing fallback behavior when safe rollback cannot be proven.

Tests:

- Optimistic update over invertible strategy has fewer or clearer warnings.
- Optimistic update over reject/manual strategy emits merge diagnostics.
- Existing reactivity graph and single-flight tests continue to pass.

Acceptance criteria:

- `ReactiveMutation.optimistic` remains the canonical optimistic path.
- Merge metadata improves diagnostics without creating a second patch model.
- Existing `checkOptimisticPlans` reports merge diagnostics from optimistic plans.

### Phase 5: Events, Reducers, CRUD, And Authz Consumers

Goal:

- Make existing higher-level systems consume merge metadata where it affects generated behavior.

Files:

- `src/events/events.ts`
- `src/crud/crud.ts`
- `src/authz/mutation-plan.ts` only if helper output needs merge context

Work:

- Add `monoidFromMerge(strategy)` for total associative strategies.
- Add reducer diagnostics when target field merge semantics conflict with reducer combine semantics.
- Add CRUD diagnostics for generated update actions that write reject/manual/state-machine fields without explicit handling.
- Use authz mutation access planning in diagnostics where helpful, but keep authz and merge semantics separate.

Tests:

- Reducer using non-associative or incompatible merge gets diagnostics.
- CRUD update over reject-direct-merge field gets diagnostics.
- Authz policies do not suppress merge diagnostics unless the write path is unreachable by design.

Acceptance criteria:

- Event reducers can reuse merge metadata for common aggregate semantics.
- CRUD derivation remains source-compatible but reports unsafe direct update semantics.
- Merge diagnostics are actionable and do not duplicate authz diagnostics.

### Phase 6: Target And Migration Hooks

Goal:

- Prepare merge metadata for target generation, offline sync, migration backfills, and generated conflict UIs without implementing all of them in core.

Files:

- target/plugin modules as they emerge
- `src/core/migration_lineage.ts` only if merge-aware migration planning lands
- `versioning-plan.md` can be updated once migration execution exists

Work:

- Define target lowerability checks for strategy branches.
- Emit `merge:custom-merge-not-portable` and `merge:opaque-merge-in-generated-target` where targets require static lowering.
- Add migration/backfill integration only after migration plan generation exists.

Acceptance criteria:

- Targets can inspect merge strategies without calling runtime code.
- Opaque/custom strategies are allowed but clearly degraded.
- Migration/backfill integration remains a consumer of merge metadata, not part of the core MVP.

## Open Questions

1. Should strategy defaults live directly on `SemanticType`, or should they be stored as trait metadata?
   Recommendation: add `merge_strategy` directly to `SemanticType` because merge is a core semantic behavior used by many systems, not just plugin metadata.

2. Should field input use `merge` or `merge_strategy`?
   Recommendation: accept `merge` in public `FieldShapeInput` for ergonomics, store as `merge_strategy` internally for consistency.

3. Should `LawKind` add `monotonic` and `deterministic`?
   Recommendation: start with existing laws and capabilities. Add `monotonic` only when IVM/CRDT planning needs it.

4. Should reducers switch from `MonoidOp` to `MergeStrategy` immediately?
   Recommendation: no. Add bridge helpers first, then migrate after compatibility and type tests exist.

5. Should `custom_expr` require `ExprFunction` instead of `StaticFunction`?
   Recommendation: prefer `ExprFunction` for portability. Use `opaque_runtime` for runtime-only functions.

6. Should all fields require merge strategies?
   Recommendation: no. Only merge-sensitive consumers should require or diagnose missing strategies.

## Success Criteria

Merge support is useful when:

1. Users can declare default merge behavior on semantic types and override it on fields with full inference.
2. Entity merge plans explain how each field will merge or why it cannot merge automatically.
3. Optimistic plan diagnostics become more precise for invertible, non-invertible, manual, and rejected merges.
4. Event reducers and CRUD updates can consume merge metadata without new parallel action/reducer models.
5. Targets can statically detect which strategies are portable and which require runtime/custom conflict handling.
6. All new public examples and type tests work without explicit type arguments or casts.
