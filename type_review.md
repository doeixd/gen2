# Type System Review — gen2 Domain Compiler

> Scope: type safety, compile-time inference, developer experience (DX), and flexibility.
> Date: 2026-04-28
> Coverage: `src/types/`, `src/entity/`, `src/expression/`, `src/query/`, `src/function/`, `src/api/`, `src/authz/`, `src/ui/`, `src/events/`, `src/core/`, `src/gen.ts`

---

## Executive Summary

The current type system is **structurally sound** but **not type-safe at the value level**. Interfaces are well-shaped for runtime checking and codegen, but TypeScript cannot reason about:

1. What TypeScript type a `SemanticType` corresponds to.
2. What type an `Expr` or `Predicate` evaluates to.
3. Whether an `Operation` has the correct fields for its `kind`.
4. Whether a `RouteHandler` has exactly one of its optional funcs set.
5. What fields an `Entity` actually has (beyond name-level inference).

The result is a library that **describes** types very well at runtime but **cannot guarantee** them at compile time. This review documents where safety is lost, where inference breaks down, and what patterns would recover both without hurting flexibility.

---

## 1. SemanticType — The Root of the Problem

### Current Design

```ts
export interface SemanticType {
  readonly name: string;
  readonly kind: SemanticKind; // string discriminant
  readonly ts_type_name: string; // e.g. "string", "number", "Date"
  readonly storage_repr: Representation;
  // ...
}
```

`ts_type_name` is a **string**, not a type parameter. This means:

- `gen.int()` returns `SemanticType`, but the compiler does not know it represents `number`.
- `gen.enumOf("Role", ["user", "admin"])` builds `ts_type_name: '"user" | "admin"'`, but this is just a string literal at the type level.
- There is **no `InferSemanticType<T>`** helper to extract the TS type from a `SemanticType` value.

### Impact

Every downstream type (`Field`, `Expr`, `QueryExpression`, `FunctionCatalog`) carries `SemanticType` but cannot propagate type information. `Expr.value_type` is `SemanticType`, so an expression tree is opaque to the compiler.

### Recommendation

Add a **phantom type parameter** to `SemanticType`:

```ts
export interface SemanticType<Ts = unknown> {
  readonly _ts?: Ts; // phantom; never used at runtime
  readonly name: string;
  readonly kind: SemanticKind;
  readonly ts_type_name: string;
  readonly storage_repr: Representation;
}

export const string = (): SemanticType<string> => ...
export const int = (): SemanticType<number> => ...
export const enumOf = <const V extends readonly string[]>(
  name: string,
  values: V
): SemanticType<V[number]> => ...
```

This is fully backward-compatible (default `Ts = unknown`) and unlocks generic `Expr<Ts>`, `Field<Ts>`, and `InferEntity<E>`.

---

## 2. Expr — Untyped Expression Trees

### Current Design

```ts
export interface Expr {
  readonly value_type: SemanticType; // not generic
  readonly ast: ExprAstNode;
  readonly phase: ExprPhase;
  // ...
}
```

### Problems

1. `buildExpr({ value_type: gen.int(), ... })` returns `Expr`, but the type system does not track that this expression evaluates to `number`.
2. `applyUnary(op, operand)` returns `Expr` with `value_type = op.output_type`, but `op.output_type` is `SemanticType`, so the result is still opaque.
3. `fieldRef(field)` correctly uses `field.semantic_type`, but again no generic propagation.
4. `semanticLiteral(gen.int(), { kind: "integer", integer_value: 1 })` is not checked for literal/value_type consistency.

### Recommendation

Make `Expr` generic:

```ts
export interface Expr<Ts = unknown> {
  readonly value_type: SemanticType<Ts>;
  readonly ast: ExprAstNode;
  readonly phase: ExprPhase;
  // ...
}

export const buildExpr = <Ts>(input: {
  value_type: SemanticType<Ts>;
  phase: ExprPhase;
  ast: ExprAstNode;
  // ...
}): Expr<Ts> => ...

export const applyUnary = <Ts>(
  op: Operation & { output_type: SemanticType<Ts> },
  operand: Expr<unknown>,
): Expr<Ts> => ...
```

This allows:

- `const ageExpr: Expr<number> = gen.expr.literal(gen.int(), { kind: "integer", integer_value: 5 })`
- Type-safe query builders that track the result type through `select()`.

---

## 3. Predicate — Separate but Not Typed

### Current Design

```ts
export interface Predicate {
  readonly input_type: SemanticType;
  readonly value_type: SemanticType; // should be boolean
  // ...
}
```

`value_type` is `SemanticType`, not `SemanticType<boolean>`. There is no compile-time guarantee that a Predicate is actually boolean.

### Recommendation

```ts
export interface Predicate<Input = unknown> {
  readonly input_type: SemanticType<Input>;
  readonly value_type: SemanticType<boolean>;
  // ...
}
```

This makes `Predicate` a subtype of `Expr<boolean>` conceptually (though they may remain separate interfaces for semantic clarity).

---

## 4. Operation — Weakly Discriminated Union

### Current Design

```ts
export interface Operation {
  readonly name: string;
  readonly kind: OperationKind;
  readonly input_type?: SemanticType;
  readonly left_type?: SemanticType;
  readonly right_type?: SemanticType;
  readonly operand_type?: SemanticType;
  readonly output_type: SemanticType;
  // ...
}
```

All type fields are optional. A `binary` operation may forget `left_type` and the compiler won't complain. A `comparison` operation may have `output_type` set to `gen.int()` and the compiler won't catch it.

### Recommendation

Use a **discriminated union** instead of a single interface with optional fields:

```ts
export type Operation =
  | { kind: "unary"; name: string; input_type: SemanticType; output_type: SemanticType; ... }
  | { kind: "binary"; name: string; left_type: SemanticType; right_type: SemanticType; output_type: SemanticType; ... }
  | { kind: "comparison"; name: string; operand_type: SemanticType; output_type: SemanticType<boolean>; ... }
  | { kind: "aggregate"; name: string; input_type: SemanticType; output_type: SemanticType; requires_numeric: boolean; ... }
  // ...
```

This eliminates `checkOperationKindFields` (or reduces it to runtime validation only) and gives users autocomplete + exhaustiveness checking.

---

## 5. Entity — Good Field Names, Lost Types

### Current Design

```ts
export const defineEntity = <F extends FieldsRecord>(
  name: string,
  fields: F,
): Entity & { readonly fields: { readonly [K in keyof F]: Field } }
```

This preserves **field names** but not **field types**:

```ts
const User = gen.entity("User", { id: gen.uuid(), age: gen.int() });
// User.fields.id is Field, not Field<string>
// User.fields.age is Field, not Field<number>
```

### Recommendation

Infer `SemanticType<Ts>` from the `FieldShapeInput`:

```ts
type InferFieldShape<T> =
  T extends SemanticType<infer Ts> ? Field<Ts>
  : T extends { type: SemanticType<infer Ts> } ? Field<Ts>
  : never;

export const defineEntity = <F extends FieldsRecord>(
  name: string,
  fields: F,
): Entity & { readonly fields: { readonly [K in keyof F]: InferFieldShape<F[K]> } }
```

This makes `User.fields.id` a `Field<string>` and `User.fields.age` a `Field<number>`.

Then add:

```ts
export type InferEntity<E extends Entity> = {
  [K in keyof E["fields"]]: E["fields"][K] extends Field<infer Ts> ? Ts : never;
};
```

This satisfies `spec.md` §9.6 and §10.4.

---

## 6. QueryBuilder — Fluent but Type-Blind

### Current Design

```ts
export interface QueryBuilder {
  where(predicate: Predicate): QueryBuilder;
  select(fields: readonly Field[]): QueryBuilder;
  build(): QueryExpression;
}
```

`QueryExpression.result_type` is `SemanticType`, not inferred from the projection.

### Recommendation

Track the result type through the builder chain:

```ts
export interface QueryBuilder<Result = unknown> {
  where(predicate: Predicate): QueryBuilder<Result>;
  select<Ts>(fields: readonly Field<Ts>[]): QueryBuilder<Ts[]>;
  build(): QueryExpression<Result>;
}
```

This is challenging because `select` changes the result type based on the fields array. A practical compromise:

```ts
export interface QueryBuilder<Source = unknown, Result = Source> {
  where(predicate: Predicate<Source>): QueryBuilder<Source, Result>;
  select<Ts>(
    fields: readonly Field<Ts>[],
  ): QueryBuilder<Source, { [K in keyof typeof fields]: Ts }>;
  build(): QueryExpression<Result>;
}
```

Or accept that `QueryExpression` remains runtime-typed and add a separate `TypedQueryBuilder<E extends Entity>` that knows the entity's field types.

---

## 7. RouteHandler — Optional Fields Allow Invalid States

### Current Design

```ts
export interface RouteHandler {
  readonly kind: "query" | "action" | "static";
  readonly query_func?: QueryFunction;
  readonly action_func?: ActionFunction;
  readonly static_func?: StaticFunction;
}
```

TypeScript allows:

```ts
const bad: RouteHandler = { kind: "query", action_func: someAction };
```

The `checkApi` runtime checker catches this, but the type system doesn't.

### Recommendation

```ts
export type RouteHandler =
  | { kind: "query"; query_func: QueryFunction }
  | { kind: "action"; action_func: ActionFunction }
  | { kind: "static"; static_func: StaticFunction };
```

This makes invalid states unrepresentable. `queryHandler(f)`, `actionHandler(f)`, `staticHandler(f)` already return the correct shapes; only the interface needs to change.

---

## 8. AuthCondition — Same Optional-Field Problem

### Current Design

```ts
export interface AuthCondition {
  readonly kind: AuthConditionKind;
  readonly role?: string;
  readonly owner_field?: Field;
  readonly target_relation?: Relation;
  // ...
}
```

`allowRole("admin")` must set `role`, but `allowOwner(field)` must set `owner_field`. The type system does not enforce this.

### Recommendation

```ts
export type AuthCondition =
  | { kind: "AllowAuthenticated" }
  | { kind: "AllowPublic" }
  | { kind: "AllowRole"; role: string }
  | { kind: "AllowOwner"; owner_field: Field }
  | { kind: "AllowRelation"; target_relation: Relation; relation_field?: Field }
  | { kind: "OrCondition"; left: AuthCondition; right: AuthCondition };
```

This makes `authz.checkAuthz` simpler (fewer null checks) and gives users better autocomplete.

---

## 9. Function Catalog — Parallel Arrays Instead of Unified Map

### Current Design

```ts
export interface FunctionCatalog {
  static: readonly StaticFunction[];
  expr: readonly ExprFunction[];
  predicate: readonly PredicateFunction[];
  query: readonly QueryFunction[];
  action: readonly ActionFunction[];
  patch: readonly PatchFunction[];
  plan: readonly PlanFunction[];
}
```

Global name uniqueness is enforced by `checkFunctions`, not by the type system.

### Recommendation

Consider a unified function type:

```ts
export type AnyFunction =
  | { kind: "static"; fn: StaticFunction }
  | { kind: "expr"; fn: ExprFunction };
// ...

export interface FunctionCatalog {
  readonly all: readonly AnyFunction[];
}
```

Or keep the parallel arrays but add a branded name type to prevent accidental collision at the call site:

```ts
export type FunctionName<K extends string> = string & { _kind: K };
```

---

## 10. Ref — Untyped Value Type

### Current Design

```ts
export interface Ref {
  readonly kind: RefKind;
  readonly owner: RefOwner;
  readonly name: string;
  readonly value_type: string; // just a name!
  // ...
}
```

`value_type: "string"` carries no type information. A `FieldRef` cannot tell the compiler what type the field holds.

### Recommendation

```ts
export interface Ref<Ts = unknown> {
  readonly kind: RefKind;
  readonly owner: RefOwner;
  readonly name: string;
  readonly value_type: SemanticType<Ts>;
  // ...
}
```

Then `Field.ref` becomes `Ref<FieldTs>`, and expression builders can use it for type inference.

---

## 11. PluginContext & Helper — Too Loose

### Current Design

```ts
export interface Helper {
  readonly name: string;
  readonly namespace: string;
  readonly value?: unknown;
  readonly materialize?: (input: { ctx: object; gen: object }) => unknown;
  available_in?: object | null;
}
```

`object` and `unknown` are used extensively. Plugin helpers cannot be typed when merged into `gen`.

### Impact

`mergePluginHelpers` does:

```ts
const extensibleGen = gen as Gen & Record<string, unknown>;
extensibleGen[namespace] = materializedHelpers;
```

This is a type-system escape hatch. Plugin-contributed helpers have no IntelliSense unless manually added to the `Gen` interface.

### Recommendation

Make `Gen` extensible via declaration merging or a generic plugin slot:

```ts
export interface GenPluginExtensions {
  // plugins augment this interface
}

export interface Gen extends GenPluginExtensions {
  // core fields
}
```

A plugin package would ship:

```ts
declare module "gen2" {
  interface GenPluginExtensions {
    react: { form: ...; component: ... };
  }
}
```

This is the standard TypeScript pattern for extensible APIs (used by Express, Fastify, etc.).

---

## 12. GenContext — Monolithic, Not Extensible

### Current Design

`GenContext` lists 40+ properties explicitly. Adding a new domain concept (e.g., `subscriptions`, `cross_store_planners`) requires editing `src/core/context.ts`.

### Recommendation

Consider a **registry pattern** with typed slots:

```ts
export interface GenContext {
  // ...core stuff...
  readonly registries: {
    entities: Registry<Entity>;
    functions: Registry<AnyFunction>;
    queries: Registry<QueryExpression>;
    // plugins register new registries
  };
}
```

Or use a `Map<string, unknown[]>` for plugin-contributed collections, with typed accessors:

```ts
export const getRegistry = <T>(ctx: GenContext, kind: string): T[] =>
  (ctx as any)[`${kind}s`] ?? [];
```

The current design is fine for a fixed set of concepts, but spec.md mentions many more (pages, layouts, search, jobs, file uploads). The context will grow unwieldy.

---

## 13. CapabilityKind, EffectKind — String Unions with Escape Hatch

### Current Design

```ts
export type CapabilityKind =
  | "pure"
  | "deterministic"
  | ...
  | "ttl"
  | (string & { _capabilityKind?: never });
```

This allows any string (via the intersection) while providing autocomplete. It is **not** a closed union.

### Trade-off

This is intentional: plugins may contribute custom capabilities. But it means `runtime.capabilities.includes(effect.kind)` is `string.includes(string)`, with no compile-time guarantee that the capability is meaningful.

### Recommendation

Keep the open union, but consider **branding** plugin-contributed capabilities:

```ts
export type PluginCapability<
  PluginId extends string,
  Name extends string,
> = `${PluginId}:${Name}` & { _capabilityKind: never };
```

This makes custom capabilities self-documenting (`"drizzle:jsonb"`) while preserving the open extension model.

---

## 14. Representation — Good, but Not Linked to SemanticType

### Current Design

`Representation` is precise (byte width, signedness, endianness, etc.), but `SemanticType.storage_repr` is just `Representation`. There is no compile-time relationship between `gen.uuid()` (semantic) and `repr.fixedBytes(16)` (storage).

### Recommendation

Link them via the phantom type:

```ts
export interface SemanticType<Ts = unknown> {
  readonly _ts?: Ts;
  readonly storage_repr: Representation<Ts>; // phantom link
  // ...
}
```

Or add a type-level map:

```ts
export type SemanticToRepr<T extends SemanticType> =
  T extends SemanticType<string>
    ? TextRepresentation
    : T extends SemanticType<number>
      ? NumericRepresentation
      : Representation;
```

This is advanced TypeScript; start with phantom types and build up.

---

## 15. Missing Type Helpers (spec.md gaps)

The following helpers from `spec.md` do not exist:

| Helper                | Status  | Impact                                            |
| --------------------- | ------- | ------------------------------------------------- |
| `InferEntity<E>`      | Missing | Cannot derive TS interface from entity definition |
| `InferField<F>`       | Missing | Cannot derive TS type from field ref              |
| `InferFormValues<F>`  | Missing | Cannot type generated form state                  |
| `InferQueryResult<Q>` | Missing | Cannot type query results                         |
| `InferType<T>`        | Missing | Cannot derive TS type from `SemanticType`         |

### Recommendation

Add these once `SemanticType<Ts>`, `Field<Ts>`, and `Expr<Ts>` are generic:

```ts
export type InferEntity<E extends Entity> = {
  [K in keyof E["fields"]]: E["fields"][K] extends Field<infer Ts> ? Ts : never;
};

export type InferField<F extends Field> = F extends Field<infer Ts> ? Ts : never;

export type InferQueryResult<Q extends QueryExpression> =
  Q extends QueryExpression<infer Ts> ? Ts : never;
```

---

## 16. DX Smells

### 16.1 `as never` in Tests

Tests frequently use `as never` to bypass type checking:

```ts
const pred = expression.buildPredicate({
  input_type: User as never, // SemanticType expected, Entity given
  // ...
});
```

This indicates the API is too rigid or the types are mismatched. `buildPredicate` should accept `Entity` as `input_type` (treating it as the entity's implicit struct type) or `input_type` should be more permissive.

### 16.2 `import("../entity/index.ts").Field` in Function Types

```ts
export interface ActionExpr {
  readonly target_entity: import("../entity/index.ts").Entity;
  // ...
}
```

Inline `import()` types are harder to read and can cause circular dependency issues. Use explicit top-level imports or a shared `types.ts` barrel.

### 16.3 `object` and `unknown` in Plugin APIs

```ts
export interface Helper {
  readonly value?: unknown;
  readonly materialize?: (input: { ctx: object; gen: object }) => unknown;
}
```

Plugin authors get no type safety or autocomplete. See §11 for the declaration-merging fix.

### 16.4 `FieldShapeInput` Discriminates at Runtime, Not Compile Time

```ts
export type FieldShapeInput =
  | SemanticType
  | { type: SemanticType; nullable?: boolean; optional?: boolean; ... };
```

Users can write `gen.entity("User", { id: gen.uuid() })` or `gen.entity("User", { id: { type: gen.uuid(), nullable: true } })`. The compiler does not distinguish these at the entity type level.

This is fine for DX but means `InferFieldShape` (§5) must handle both cases.

---

## 17. Positive Patterns to Preserve

| Pattern                                                                      | Why It Works                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `defineEntity<F>` returning `Entity & { fields: { [K in keyof F]: Field } }` | Preserves field names for autocomplete                           |
| `enumOf` building `ts_type_name` as a string union                           | Runtime-friendly; can become generic with phantom types          |
| `FunctionCatalog` with parallel arrays                                       | Simple to check and iterate; can be wrapped by a typed registry  |
| `check*()` pure functions returning `Diagnostic[]`                           | Testable, composable, target-agnostic                            |
| `Ref` protocol with `kind + owner + name`                                    | Stable identity without object reference equality                |
| `bindEntity(ctx)` etc. in `gen.ts`                                           | Side effects are centralized; eager diagnostics are a good DX    |
| `Operation` unified interface                                                | Reduces type explosion; discriminated union would improve safety |

---

## 18. Migration Path

Making the type system generic is a **large refactor**. Here is a safe sequencing:

### Phase 1: Phantom Types (non-breaking)

1. Add `Ts = unknown` to `SemanticType<Ts>`.
2. Update `string()`, `int()`, `uuid()`, etc. to return `SemanticType<string>`, `SemanticType<number>`, etc.
3. Add `InferEntity<E>`, `InferField<F>` type helpers.
4. Verify all existing tests pass (generics with defaults are backward-compatible).

### Phase 2: Generic Expr/Field (non-breaking)

1. Add `Ts = unknown` to `Expr<Ts>`, `Field<Ts>`, `Predicate<Input, Output>`.
2. Update `buildExpr`, `fieldRef`, `semanticLiteral` to propagate generics.
3. Update `defineEntity` to infer `Field<Ts>` from `FieldShapeInput`.

### Phase 3: Discriminated Unions (breaking for internal interfaces)

1. Convert `Operation` to a discriminated union.
2. Convert `RouteHandler` to a discriminated union.
3. Convert `AuthCondition` to a discriminated union.
4. Update builders and tests.

### Phase 4: Plugin Typing (additive)

1. Introduce `GenPluginExtensions` interface.
2. Document how plugin packages augment it.
3. Migrate `mergePluginHelpers` to use the typed interface.

---

## 19. Quick Wins (Can Do Today)

1. **Fix `RouteHandler`** → discriminated union (small breaking change, huge safety gain).
2. **Fix `AuthCondition`** → discriminated union (same).
3. **Add `InferEntity<E>`** → pure type helper, no runtime change.
4. **Add `InferField<F>`** → pure type helper.
5. **Type `Ref` with phantom `Ts`** → backward-compatible, unlocks expression typing.
6. **Remove `as never` from tests** → fix the underlying API mismatches.
7. **Replace inline `import()` types** → explicit imports for readability.

---

## 20. Open Questions

1. **Should `SemanticType` carry a runtime type validator?** e.g., `validate: (x: unknown) => x is Ts`. This would bridge compile-time and runtime safety.
2. **Should `Expr` support effect/requirement tracking at the type level?** e.g., `Expr<number, Requires<"join">, Effects<"db_read">>`. This gets very complex very fast.
3. **How do we type plugin-contributed targets?** A Drizzle target accepts different inputs than a Prisma target. Should `Target` be generic?
4. **Should `GenContext` be a class with typed getters?** This would allow `ctx.entities<User>("User")` to return `User[]` with inference.

---

_End of review._
