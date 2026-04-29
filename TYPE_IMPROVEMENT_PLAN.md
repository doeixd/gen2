# Type Safety / DX Improvement Plan

> Derived from `type_review.md`. This plan turns the review findings into an actionable, phased roadmap.
> Goal: make the gen2 domain compiler type-safe at the value level while preserving flexibility and backward compatibility where possible.

---

## Phase 0 — Foundation (do first; everything else builds on this)

### 0.1 Add phantom type parameter to `SemanticType`

- File: `src/types/semantic.ts`
- Change: `interface SemanticType` → `interface SemanticType<Ts = unknown>` with optional `_ts?: Ts` phantom
- Update constructors: `string()` → `SemanticType<string>`, `int()` → `SemanticType<number>`, `uuid()` → `SemanticType<string>`, `float()` → `SemanticType<number>`, `boolean()` → `SemanticType<boolean>`, `date()` → `SemanticType<Date>`, `timestamp()` → `SemanticType<Date>`, `text()` → `SemanticType<string>`, `bytes()` → `SemanticType<Uint8Array>`, `json()` → `SemanticType<unknown>`, `arrayOf(t)` → `SemanticType<Ts[]>`, `enumOf(name, values)` → `SemanticType<V[number]>`
- Add `InferType<T>` helper: extracts `Ts` from `SemanticType<Ts>`
- Validation: `vp check` && `vp test` (backward-compatible because default is `unknown`)

### 0.2 Add phantom type parameter to `Field`

- File: `src/entity/field.ts`
- Change: `interface Field` → `interface Field<Ts = unknown>` with `semantic_type: SemanticType<Ts>`
- Update `defineField` to propagate generic from its `type` parameter
- Update `FieldShapeInput` so `type: SemanticType<Ts>` yields `Field<Ts>`
- Add `InferField<F>` helper
- Validation: `vp check` && `vp test`

### 0.3 Add phantom type parameter to `Ref`

- File: `src/core/refs.ts`
- Change: `interface Ref` → `interface Ref<Ts = unknown>` with `value_type: SemanticType<Ts>` (or keep `value_type: string` for backward compat but add `_ts?: Ts`)
- Since `value_type` is currently `string` (the type name), we have two options:
  - Option A (breaking): change `value_type` to `SemanticType<Ts>` — affects many call sites
  - Option B (non-breaking): keep `value_type: string`, add `_ts?: Ts`, and use a separate mapping
- **Decision**: Option B for now. Add `_ts?: Ts` phantom only. Refactor `value_type` in Phase 3 if needed.
- Update `Field.ref` to return `Ref<FieldTs>` once `Field` is generic
- Validation: `vp check` && `vp test`

---

## Phase 1 — Quick Wins (high impact, low risk)

### 1.1 Convert `RouteHandler` to discriminated union

- File: `src/api/api.ts`
- Change:
  ```ts
  export type RouteHandler =
    | { kind: "query"; query_func: QueryFunction }
    | { kind: "action"; action_func: ActionFunction }
    | { kind: "static"; static_func: StaticFunction };
  ```
- Update builders `queryHandler(f)`, `actionHandler(f)`, `staticHandler(f)` to return the specific arm
- Update `checkApi` — remove null-safe checks for optional fields; add exhaustiveness switch
- Update any tests that rely on the old interface shape
- **Breaking?** Yes for direct `RouteHandler` object literals. Builders cover 99% of usage.
- Validation: `vp check` && `vp test`

### 1.2 Convert `AuthCondition` to discriminated union

- File: `src/authz/authz.ts`
- Change: same pattern as `RouteHandler` — one arm per `AuthConditionKind`
- Update builders (`allowRole`, `allowOwner`, `allowRelation`, `allowOr`, `allowAuthenticated`, `allowPublic`) to return specific arms
- Update `checkAuthz` — simplify null checks; add exhaustiveness switch
- Update tests
- **Breaking?** Yes for direct `AuthCondition` object literals. Builders cover 99% of usage.
- Validation: `vp check` && `vp test`

### 1.3 Add `InferEntity<E>` type helper

- File: `src/entity/entity.ts` or new `src/types/inference.ts`
- Depends on: Phase 0.1 and 0.2 (generic `Field<Ts>`)
- Code:
  ```ts
  export type InferEntity<E extends Entity> = {
    [K in keyof E["fields"]]: E["fields"][K] extends Field<infer Ts> ? Ts : never;
  };
  ```
- Export from `src/gen.ts` as `gen.InferEntity` or from a dedicated inference module
- Validation: compile-time only; add a type-level test in `tests/types.test.ts`

### 1.4 Add `InferField<F>` type helper

- File: same as above
- Code:
  ```ts
  export type InferField<F extends Field> = F extends Field<infer Ts> ? Ts : never;
  ```
- Validation: compile-time only

### 1.5 Add `InferQueryResult<Q>` type helper

- File: `src/query/query.ts` or `src/types/inference.ts`
- Depends on: Phase 2.1 (generic `QueryExpression<Result>`)
- Code:
  ```ts
  export type InferQueryResult<Q extends QueryExpression> =
    Q extends QueryExpression<infer Ts> ? Ts : never;
  ```
- Validation: compile-time only

### 1.6 Fix `as never` casts in tests

- Files: `tests/expression.test.ts`, `tests/query.test.ts`, `tests/authz.test.ts`, etc.
- Root cause: APIs expect `SemanticType` but tests pass `Entity` or other objects
- Fix options:
  - Make APIs accept `Entity` where `SemanticType` is expected (treat entity as its implicit struct type)
  - Or create helper `entityAsType(entity)` that returns a `SemanticType` representing the entity
  - Or fix tests to pass actual `SemanticType` values
- **Decision**: prefer fixing the APIs to accept `Entity | SemanticType` where it makes sense (e.g., `buildPredicate` `input_type`)
- Validation: `vp test`

### 1.7 Replace inline `import()` types with explicit imports

- Files: `src/function/function.ts`, `src/api/api.ts`, `src/authz/authz.ts`, etc.
- Change: `import("../entity/index.ts").Entity` → top-level `import { Entity } from "../entity/index.ts"`
- Move shared types to a `src/types/shared.ts` barrel if circular deps are a concern
- Validation: `vp check` && `vp test`

---

## Phase 2 — Generic Expression & Query System

### 2.1 Add phantom type parameter to `Expr`

- File: `src/expression/expr.ts`
- Change: `interface Expr` → `interface Expr<Ts = unknown>` with `value_type: SemanticType<Ts>`
- Update all expression builders:
  - `buildExpr<Ts>(input)` returns `Expr<Ts>`
  - `fieldRef<Ts>(field: Field<Ts>)` returns `Expr<Ts>`
  - `semanticLiteral<Ts>(type, value)` returns `Expr<Ts>`
  - `applyUnary<Ts>(op, operand)` returns `Expr<Ts>`
  - `applyBinary<Ts>(op, left, right)` returns `Expr<Ts>`
  - `applyComparison(op, left, right)` returns `Expr<boolean>`
  - `applyNary<Ts>(op, operands)` returns `Expr<Ts>`
  - `applyAggregate<Ts>(op, operand)` returns `Expr<Ts>`
- Update `ExprAstNode` variants to carry type info where helpful (e.g., `LiteralValue<Ts>`)
- **Breaking?** No — default `unknown` preserves all existing code.
- Validation: `vp check` && `vp test`

### 2.2 Add generic `Predicate<Input, Output>`

- File: `src/expression/predicate.ts`
- Change: `interface Predicate` → `interface Predicate<Input = unknown, Output = boolean>`
- `input_type: SemanticType<Input>`
- `value_type: SemanticType<Output>` (default `boolean`)
- Update `buildPredicate`, `applyPredicate`, `negate`, etc. to propagate generics
- Make `Predicate` conceptually a subtype of `Expr<boolean>` where appropriate
- Validation: `vp check` && `vp test`

### 2.3 Add generic `QueryExpression<Result>`

- File: `src/query/query.ts`
- Change: `interface QueryExpression` → `interface QueryExpression<Result = unknown>`
- `result_type: SemanticType<Result>`
- Update `buildQuery`, `select`, `where`, etc. to propagate `Result`
- Validation: `vp check` && `vp test`

### 2.4 Make `QueryBuilder` track result type

- File: `src/query/query.ts`
- Change: `interface QueryBuilder` → `interface QueryBuilder<Source = unknown, Result = Source>`
- `where(predicate: Predicate<Source>)` preserves `Result`
- `select<Ts>(fields: readonly Field<Ts>[])` changes `Result` to a tuple/array type
- `build()` returns `QueryExpression<Result>`
- **Practical compromise**: since `select` with heterogeneous field types is hard to type perfectly, accept `Result = Record<string, unknown>` for mixed selections, or use a variadic tuple approach if TypeScript version supports it
- Validation: `vp check` && `vp test`

### 2.5 Make `defineEntity` infer `Field<Ts>` from field inputs

- File: `src/entity/entity.ts`
- Depends on: Phase 0.2
- Change `FieldsRecord` type and `defineEntity` return type so each field in the record gets its `Ts` inferred:
  ```ts
  type InferFieldFromInput<T> =
    T extends SemanticType<infer Ts>
      ? Field<Ts>
      : T extends { type: SemanticType<infer Ts> }
        ? Field<Ts>
        : Field<unknown>;
  ```
- Validation: add type-level test asserting `User.fields.id extends Field<string>`

---

## Phase 3 — Discriminated Unions for Core Types

### 3.1 Convert `Operation` to discriminated union

- File: `src/types/operation.ts`
- Change from single interface with optional fields to:
  ```ts
  export type Operation =
    | UnaryOperation
    | BinaryOperation
    | ComparisonOperation
    | NaryOperation
    | AggregateOperation
    | CastOperation
    | CoalesceOperation
    | CaseOperation;
  ```
- Each sub-type has required fields for its kind
- Update `defineOperation` to return the correct sub-type based on `kind`
- Update `checkOperationKindFields` — either remove (compiler handles it) or reduce to runtime assertion
- Update expression builders that consume `Operation` to use the union
- Update tests
- **Breaking?** Yes for direct `Operation` object literals and for code that accesses optional fields without narrowing. Builders are the primary API, so impact is moderate.
- Validation: `vp check` && `vp test`

### 3.2 Convert `Capability` and `Effect` to branded string unions

- File: `src/types/operation.ts`
- Keep the open extension model but make plugin capabilities self-documenting:

  ```ts
  export type CapabilityKind =
    | "pure"
    | "deterministic"
    | "idempotent"
    | "readonly"
    | "side_effect"
    | "ttl"
    | BrandCapability<string, string>;

  export type BrandCapability<P extends string, N extends string> = `${P}:${N}` & {
    _capabilityKind?: never;
  };
  ```

- Same for `EffectKind`
- Validation: `vp check` && `vp test`

---

## Phase 4 — Plugin & Context Extensibility

### 4.1 Introduce `GenPluginExtensions` interface

- File: `src/gen.ts`
- Add:

  ```ts
  export interface GenPluginExtensions {
    // intentionally empty — plugins augment via declaration merging
  }

  export interface Gen extends GenPluginExtensions {
    // core fields...
  }
  ```

- Update `mergePluginHelpers` to avoid `as Gen & Record<string, unknown>`
- Document how plugins augment the interface
- Validation: `vp check` && `vp test`

### 4.2 Introduce `PluginContextExtensions`

- File: `src/core/plugin.ts`
- Same pattern as `GenPluginExtensions`
- Allow plugins to type their contributed helpers and context data
- Validation: `vp check` && `vp test`

### 4.3 Typed registry accessors for `GenContext`

- File: `src/core/context.ts`
- Add helper functions:

  ```ts
  export const getEntities = <E extends Entity = Entity>(ctx: GenContext): readonly E[] =>
    ctx.entities as readonly E[];

  export const getFunctions = <F extends AnyFunction = AnyFunction>(
    ctx: GenContext,
  ): readonly F[] => ctx.functions as readonly F[];
  ```

- Or introduce a `Registry<T>` abstraction if the context grows much larger
- Validation: `vp check` && `vp test`

---

## Phase 5 — Deep DX Improvements

### 5.1 Runtime type validators on `SemanticType`

- Optional `validate?: (value: unknown) => value is Ts` on `SemanticType`
- Would bridge compile-time and runtime safety
- Used by expression literal builders to check literal/value_type consistency
- **Decision**: defer to post-1.0; adds runtime overhead and complexity

### 5.2 Effect/requirement tracking on `Expr`

- `Expr<Ts, Requires = never, Effects = never>`
- Would let the type system reject expressions that use unsupported capabilities in certain contexts
- **Decision**: defer; high complexity, niche benefit

### 5.3 Branded function names in `FunctionCatalog`

- `type FunctionName<K extends string> = string & { _functionKind: K }`
- Prevents accidental name collisions between e.g. a `query` and an `action`
- **Decision**: nice-to-have; can be added without breaking changes via overloads

---

## Test Strategy

Every phase must:

1. Pass `vp check` (format, lint, type-check)
2. Pass `vp test` (all existing tests)
3. Add type-level tests where appropriate:
   - `tests/types.test.ts` using `Expect<T extends U>` / `ExpectExtends<T, U>` helpers
   - Assert that `InferEntity<typeof User>["id"]` is `string`
   - Assert that `Expr<number>["value_type"]` is `SemanticType<number>`
   - Assert that `RouteHandler` discriminated union narrows correctly

Example type test helper:

```ts
type Expect<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type _Test1 = Expect<Equal<InferEntity<typeof User>["id"], string>>;
type _Test2 = Expect<Equal<InferField<typeof User.fields.age>, number>>;
```

---

## Breaking Change Summary

| Phase                         | Breaking? | Impact                               |
| ----------------------------- | --------- | ------------------------------------ |
| 0.1 Phantom `SemanticType`    | No        | Default `unknown`                    |
| 0.2 Phantom `Field`           | No        | Default `unknown`                    |
| 0.3 Phantom `Ref`             | No        | Default `unknown`                    |
| 1.1 `RouteHandler` union      | **Yes**   | Direct object literals               |
| 1.2 `AuthCondition` union     | **Yes**   | Direct object literals               |
| 1.3–1.5 Inference helpers     | No        | Pure types                           |
| 1.6 Fix `as never`            | No        | Test-only cleanup                    |
| 1.7 Replace inline imports    | No        | Refactor                             |
| 2.1 Generic `Expr`            | No        | Default `unknown`                    |
| 2.2 Generic `Predicate`       | No        | Default `unknown`                    |
| 2.3 Generic `QueryExpression` | No        | Default `unknown`                    |
| 2.4 Generic `QueryBuilder`    | No        | Default `unknown`                    |
| 2.5 Entity field inference    | No        | Improves inference only              |
| 3.1 `Operation` union         | **Yes**   | Direct object literals, field access |
| 3.2 Branded capabilities      | No        | Widens type                          |
| 4.1–4.3 Plugin extensions     | No        | Additive                             |
| 5.x Advanced features         | No        | Additive or deferred                 |

**Mitigation**: all breaking changes affect direct interface object literals. The builder functions (`queryHandler`, `allowRole`, `defineOperation`, etc.) already return the correct shapes and will be updated to match the new types. Users using builders are unaffected.

---

## Priority Order

1. **Phase 0.1** (phantom `SemanticType`) — unlocks everything else
2. **Phase 0.2** (phantom `Field`) — unlocks entity inference
3. **Phase 1.1** + **1.2** (`RouteHandler` + `AuthCondition` unions) — biggest safety wins for lowest effort
4. **Phase 1.3** + **1.4** + **1.5** (inference helpers) — pure DX improvement, zero risk
5. **Phase 1.6** + **1.7** (test/API cleanup) — hygiene
6. **Phase 2.1** + **2.2** (generic `Expr`/`Predicate`) — expression trees become type-safe
7. **Phase 2.3** + **2.4** (generic `QueryExpression`/`QueryBuilder`) — queries become type-safe
8. **Phase 2.5** (entity field inference) — `InferEntity` works end-to-end
9. **Phase 3.1** (`Operation` union) — closes the last major gap in core types
10. **Phase 3.2** (branded capabilities) — plugin flexibility with safety
11. **Phase 4.x** (plugin/context extensibility) — scales the architecture
12. **Phase 5.x** (advanced features) — post-1.0 research

---

_Plan created from `type_review.md`._
