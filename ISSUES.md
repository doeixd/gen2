# gen2 Improvement Backlog

This file tracks concrete improvement opportunities identified during codebase audit. Items are ordered by priority (critical → low) and grouped by theme.

---

## Critical

### 1. SQL injection in relational adapter DDL generation

**File:** `src/adapters/relational.ts:89`
**Issue:** `col.default_value` is interpolated directly into DDL without escaping.

```ts
if (col.default_value) parts.push(`DEFAULT ${col.default_value}`);
```

**Impact:** A value like `"; DROP TABLE users; --` gets emitted verbatim into generated SQL.
**Fix:** Add a dialect-aware `escapeSqlLiteral` helper and wrap `default_value`.
**Effort:** Small

---

### 2. Global mutable state in lifecycle module

**File:** `src/lifecycle/lifecycle.ts:195-196`
**Issue:**

```ts
const moduleCheckers: ModuleChecker[] = [];
let builtInModuleCheckersRegistered = false;
```

**Impact:** Global singleton state leaks between tests and prevents concurrent Gen contexts.
**Fix:** Move `moduleCheckers` and the registration flag onto `GenContext`.
**Effort:** Medium

---

### 3. Type-system bypass in createUiNamespace

**File:** `src/gen.ts:1669,1676,1683,1686`
**Issue:** Four `as unknown as UiNamespace<C>` casts completely bypass TypeScript.

```ts
return {
  ...baseNamespace,
  ...jsxUiNamespaceFactory.create(ctx, baseNamespace),
} as unknown as UiNamespace<C>;
```

**Impact:** Every UI backend call flows through `unknown`. Backend-specific overloads exist but the implementation body discards them.
**Fix:** Extract backend-specific namespace merging into typed helper functions that return the precise intersection type.
**Effort:** Medium

---

### 4. Post-hoc mutation of entity fields

**File:** `src/entity/entity.ts:255,279,284`
**Issue:**

```ts
fields: {} as Record<string, Field>,
// ... later:
(f as Writable<Field>).owning_entity = entity;
return entity as Entity & { readonly fields: { readonly [K in keyof F]: ... } };
```

**Impact:** Dangerous casts (`Writable<Field>`, stub object) and runtime mutation of supposedly-readonly objects.
**Fix:** Redesign `defineEntity` to accept a fields factory callback `fields: (self: Entity) => F` so back-references are set during construction without post-hoc mutation.
**Effort:** Medium

---

## High

### 5. Query builder type erasure in select

**File:** `src/query/query.ts:586,590`
**Issue:**

```ts
return self as unknown as QueryBuilder<Source, Ts[]>;
```

**Impact:** Fluent `select` and `selectProjection` erase type safety. The result type is inferred from `fields[0]?.semantic_type`, which is wrong for heterogeneous selections.
**Fix:** Make `QueryBuilder` properly generic through the fluent chain. Consider an `InferRow<Fields>` helper for multi-field selects.
**Effort:** Medium

---

### 6. Duplicate fromEntity helpers with unsafe casts

**Files:** `src/expression/expr.ts:18-37`, `src/function/function.ts:43-62`
**Issue:** Both files have nearly identical `fromEntity` functions using `as object` / `as Entity` / `as SemanticType<Ts>`.
**Impact:** Duplicated unsafe logic.
**Fix:** Extract into `src/core/entity-to-semantic.ts` with a proper `isEntity` type predicate.
**Effort:** Small

---

### 7. God module: gen.ts is 2000+ lines

**File:** `src/gen.ts`
**Issue:** Couples every subsystem: namespace factories, binders, type definitions, UI backend registry, config shapes.
**Impact:** Merge conflicts, poor tree-shaking, hard to navigate.
**Fix:** Split into `src/gen/types.ts`, `src/gen/binders.ts`, `src/gen/namespaces.ts`, `src/gen/ui-backends.ts`, `src/gen/index.ts`.
**Effort:** Large

---

## Medium

### 8. Inconsistent naming conventions

**Files:** Across codebase
**Issue:** Mixed vocabulary:

- `defineX`: `defineEntity`, `defineStyle`
- `createX`: `createGen`, `createQueryNamespace`
- `makeX`: `makeField`
- No prefix: `actionInsert`, `projectedField`, `columnSource`
  **Fix:** Standardize to `defineX` for registered domain objects, `buildX` for transient DSL helpers.
  | Current | Proposed |
  |---|---|
  | `actionInsert` | `buildActionInsert` |
  | `projectedField` | `buildProjectedField` |
  | `columnSource` | `buildColumnSource` |
  | `queryHandler` | `buildQueryHandler` |
  **Effort:** Medium

---

### 9. Plugin hooks use unknown parameters

**File:** `src/core/plugin.ts:47,54,108,110`
**Issue:**

```ts
check_fn: (...args: unknown[]) => readonly Diagnostic[] | Promise<...>
generate?: (input: unknown) => readonly Artifact[]
```

**Impact:** Plugin authors get zero IntelliSense.
**Fix:** Replace with a structured `TargetInput` parameter containing `target`, `ctx`, `gen`.
**Effort:** Medium

---

### 10. Route handler type mismatch

**File:** `src/api/api.ts:51-68`
**Issue:** `Route` stores `handler: RouteHandlerInput` (loose interface) instead of the strict `RouteHandler` discriminated union.
**Impact:** `{ kind: "query", action_func: ... }` passes TypeScript but fails at runtime.
**Fix:** Make `Route['handler']` use the `RouteHandler` union and update `defineRoute`.
**Effort:** Small

---

### 11. Missing compile-time type assertion tests

**File:** `tests/` directory
**Issue:** 297 runtime tests but zero `*.test-d.ts` files asserting that types _fail_ when they should.
**Impact:** Inference regressions go undetected.
**Fix:** Add `tests/types.test-d.ts` using `expectTypeOf` from `vitest` for negative type tests.
**Effort:** Medium

---

### 12. Adapter relational default_value SQL injection

**File:** `src/adapters/relational.ts:89`
**Issue:** (Same as #1 — tracked separately for fix verification.)

---

## Low

### 13. safeHtml lacks runtime validation

**File:** `src/ui/ui.ts:571`
**Issue:** `safeHtml` is a pure branding cast with no sanitization.
**Impact:** Explicit trust boundary, but undocumented.
**Fix:** Add optional runtime sanitizer hook or document as explicit trust boundary.
**Effort:** Small

---

### 14. View.slots is mutable

**File:** `src/ui/ui.ts:186`
**Issue:** `slots: Slot<E>[]` while every other `View` property is `readonly`.
**Impact:** External code can push/pop slots after construction, bypassing `checkUi` invariants.
**Fix:** Change to `readonly slots: readonly Slot<E>[];`.
**Effort:** Small

---

### 15. Storage mutation on inputs

**File:** `src/storage/storage.ts:382,404`
**Issue:** `store.tables.push(table);` and `table.columns.push(c);` mutate input objects.
**Impact:** Spooky action at a distance if the same store/table reference is reused.
**Fix:** Return new arrays instead of pushing, or freeze after construction.
**Effort:** Small

---

### 16. Target input mutation via cast

**File:** `src/core/target.ts:70-73`
**Issue:** Mutates a readonly-typed array via cast:

```ts
(target.inputs as TargetInput[]).push(input);
```

**Fix:** Change `Target['inputs']` to mutable during construction, or return a new Target.
**Effort:** Small

---

### 17. Config mutation via cast

**File:** `src/gen.ts:563,576`
**Issue:**

```ts
(ctx.config.entries as core.ConfigEntry[]).push(entry);
(ctx.config as { entries: readonly core.ConfigEntry[] }).entries = config.entries;
```

**Fix:** Use a mutable builder type during construction, freeze after `createGen`.
**Effort:** Small

---

### 18. Query builder O(n²) allocations

**File:** `src/query/query.ts:551-616`
**Issue:** Every fluent call (`where`, `select`, `orderBy`) allocates a new state object via `{ ...state, predicate }`.
**Impact:** O(n²) in number of chained calls.
**Fix:** Mutable builder that accumulates state and freezes in `.build()`.
**Effort:** Medium

---

### 19. bindFromEntity reconstructs builder interface on every call

**File:** `src/gen.ts:282-321`
**Issue:** `bindFromEntity` reconstructs the entire `QueryBuilder` interface object with 8 closures on every call.
**Impact:** Unnecessary closure allocations.
**Fix:** Move builder methods to a prototype/class so they are shared across instances.
**Effort:** Medium

---

### 20. neverSemanticType allocates per call

**File:** `src/storage/storage.ts:619-648`
**Issue:** `neverSemanticType()` allocates a new object on every call.
**Fix:** Extract to module-level singleton.
**Effort:** Small
