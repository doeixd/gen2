# Effect-like API Wrapper (`src/fx/`)

## Goal

Add an Effect-inspired API surface over the existing `gen.*` builders. No new dependencies — pure TypeScript with `pipe`, curried `make()`, and Layer-like context composition. The wrapper delegates to the existing `defineEntity`, `defineRelation`, etc. under the hood.

## Scope

Core domain only: **Entity, Relation, Storage, Query, Function/Action, CRUD**, plus a **GenContext** composition layer.

---

## Module Layout

```
src/fx/
  pipe.ts          — pipe(), flow(), identity()
  types.ts         — Types namespace (re-export semantic types as curried factories)
  entity.ts        — Entity.make(), Entity.with*() transformers
  relation.ts      — Relation.make(), Relation.oneToMany(), etc.
  storage.ts       — Store.make(), Table.make(), Mapping.make(), Column.make()
  query.ts         — Query.from() (wraps existing fluent builder)
  fn.ts            — Fn.static(), Fn.action(), Fn.query(), Fn.predicate()
  crud.ts          — Crud.derive()
  context.ts       — GenContext.make(), GenContext.add(), GenContext.build()
  index.ts         — Barrel re-exports
tests/fx/
  fx-pipe.test.ts
  fx-pipe.test-d.ts         — type-level regression
  fx-entity.test.ts
  fx-entity.test-d.ts       — type-level regression
  fx-relation.test.ts
  fx-relation.test-d.ts
  fx-storage.test.ts
  fx-storage.test-d.ts
  fx-query.test.ts
  fx-fn.test.ts
  fx-crud.test.ts
  fx-context.test.ts
  fx-context.test-d.ts
```

---

## TypeScript Design Principles

Every API in this module follows the patterns from `docs/typescript_inference_cheatsheet.txt`. This section maps those patterns to the fx module explicitly so implementers know which generic relationships to preserve.

### Principle 1: Generic Preservation Through Pipe

Pipe transformers are the most common place where generics get accidentally erased. Every `Entity.with*()` function must be generic over the entity it receives:

```ts
// WRONG — erases Name and Fields generics
function withStore(store: string): (entity: Entity) => Entity;

// CORRECT — preserves the full entity witness
function withStore<S extends string>(
  store: S,
): <E extends Entity>(entity: E) => E & { readonly store_name: S };
```

The rule: **if the inner value is generic, the pipe step must be generic too.** (Cheatsheet: "Generic Requirements Bubble Up" §2.)

### Principle 2: Identity-Preserving vs Type-Changing Transforms

Pipe transformers fall into two categories with different type contracts:

| Category                | Type contract                                                            | Examples                              |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------- |
| **Identity-preserving** | `<E extends Entity>(e: E) => E`                                          | `withStore`, `withId`, `withMetadata` |
| **Type-changing**       | `<E extends Entity>(e: E) => Entity<E["name"], E["fields"] & NewFields>` | `withField`                           |

Identity-preserving transforms return the same entity type. Type-changing transforms evolve the `Fields` generic. Mixing them up causes either lost precision (identity transform typed as type-changing) or compile errors (type-changing typed as identity).

### Principle 3: NoInfer on Secondary Arguments

When a pipe transformer takes both the piped entity and a secondary argument, the secondary argument must not widen the entity's type:

```ts
function withField<E extends Entity, N extends string, T extends FieldShapeInput>(
  name: N,
  type: NoInfer<T>,
): (entity: E) => Entity<E["name"], E["fields"] & Record<N, InferFieldFromInput<T, E, N>>>;
```

Without `NoInfer`, TypeScript may infer `T` from both the `type` argument and the entity's existing fields, causing widening. (Cheatsheet §14: "NoInfer Inference Anchor.")

### Principle 4: Const Generics for Literal Preservation

Every factory that accepts a name, key, or string literal must use `const` generics:

```ts
Entity.make<const Name extends string>(name: Name)
Store.make<const N extends string>(input: { name: N; ... })
```

This preserves `"User"` as `"User"`, not `string`. (Cheatsheet §13: "Const Generic Capture.")

### Principle 5: Field Ownership Enforcement

When an API accepts a `Field` argument alongside an `Entity` argument, the field must be constrained to `FieldOf<E>`:

```ts
Relation.oneToMany<
  E1 extends Entity,
  E2 extends Entity,
>(
  from: E1,
  to: E2,
  foreignKey: FieldOf<E2>,   // must belong to E2
  primaryKey: FieldOf<E1>,   // must belong to E1
): Relation<...>
```

This rejects `Relation.oneToMany(User, Post, User.fields.id, Post.fields.id)` at compile time. (Cheatsheet §6: "Typed Reference Object.")

### Principle 6: Type-State Builder for GenContext

`GenContext.make()` uses the Type-State Builder pattern (Cheatsheet §16). Each `.entity()` call accumulates the entity into a growing record type:

```ts
interface GenContextBuilder<TEntities extends Record<string, Entity>> {
  entity<const N extends string, E extends Entity<N, any>>(
    entity: E,
  ): GenContextBuilder<TEntities & Record<N, E>>;
}
```

This means after `.entity(User).entity(Post)`, the builder knows it holds exactly `{ User: typeof User; Post: typeof Post }`. Downstream methods like `.relation()` can then constrain their arguments to entities from this accumulated set.

### Principle 7: Factory-Contained Casts

All `as` casts live inside the `make()` factories. User code never writes `as`. The factories accept typed inputs and produce typed outputs; the internal cast is the only place where the library asserts what it cannot prove. (Cheatsheet Addendum: "Internal Casts as a Safety Boundary.")

### Principle 8: Inference Checklist for Every Public Function

Before shipping any public function in `src/fx/`, verify:

1. Does it preserve generic relationships from its inputs to its outputs? If yes, add generics.
2. Does a secondary argument risk widening the primary type? If yes, add `NoInfer`.
3. Does it accept a string literal? If yes, use `const` generic.
4. Does it accept a `Field` alongside an `Entity`? If yes, constrain to `FieldOf<E>`.
5. Is the user forced to write an explicit generic? If yes, move inference to a value boundary.
6. Does a pipe step erase generics? If yes, make it generic over the entity.

---

## 1. `pipe()` — Composition Primitive

**File:** `src/fx/pipe.ts`

A zero-dependency `pipe` and `flow` implementation.

### Type Signatures

```ts
export function pipe<A>(a: A): A;
export function pipe<A, B>(a: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D;
// ... up to 12 overloads

export function flow<A, B>(ab: (a: A) => B): (a: A) => B;
export function flow<A, B, C>(ab: (a: A) => B, bc: (b: B) => C): (a: A) => C;
// ... up to 12 overloads

export const identity: <A>(a: A) => A;
```

### Type Safety Notes

- Each overload preserves the full generic chain: `A → B → C → D`. No widening at any step.
- `pipe` uses the **Tuple-Preserved Wrapper** pattern (Cheatsheet §17): each step's output type feeds the next step's input type.
- `flow` returns a composed function whose input is `A` and output is the final step's return type.

### Type-Level Regression Tests (`tests/fx/fx-pipe.test-d.ts`)

```ts
// pipe preserves literal types through the chain
const result = pipe(
  "hello" as const,
  (s) => s.length,
  (n) => n > 3,
);
//    ^? boolean

// pipe does not widen object types
const obj = pipe({ name: "User" as const, count: 5 }, (o) => o.name);
//    ^? "User"

// flow composes correctly
const transform = flow(
  (s: string) => s.length,
  (n: number) => n > 0,
);
//    ^? (s: string) => boolean
```

---

## 2. `Types` — Semantic Type Factories

**File:** `src/fx/types.ts`

### Type Signatures

Each factory uses `const` generics where applicable and preserves phantom type parameters:

```ts
export const Types = {
  string: (): SemanticType<string> => stringType(),
  int: (): SemanticType<number> => intType(),
  bigint: (): SemanticType<bigint> => bigintType(),
  boolean: (): SemanticType<boolean> => booleanType(),
  uuid: (): SemanticType<string> => uuidType(),
  email: (): SemanticType<string> => emailType(),
  url: (): SemanticType<string> => urlType(),
  phone: (): SemanticType<string> => phoneType(),
  datetime: (): SemanticType<string> => datetimeType(),
  date: (): SemanticType<string> => dateType(),
  money: (): SemanticType<number> => moneyType(),
  decimal: (): SemanticType<number> => decimalType(),
  json: (): SemanticType<unknown> => jsonType(),
  bytes: (): SemanticType<Uint8Array> => bytesType(),

  enumOf: <const V extends readonly string[]>(...values: V): SemanticType<V[number]> =>
    enumOf(...values),

  array: <T>(inner: SemanticType<T>): SemanticType<readonly T[]> => arrayOf(inner),

  nullable: <T>(inner: SemanticType<T>): SemanticType<T | null> => nullableType(inner),

  brand: <T, const B extends string>(
    inner: SemanticType<T>,
    brand: B,
  ): SemanticType<T & Brand<B>> => brandType(inner, brand),

  literal: <const V extends string | number | boolean>(value: V): SemanticType<V> =>
    literalType(value),

  struct: <const F extends Record<string, SemanticType<any>>>(
    fields: F,
  ): SemanticType<{ [K in keyof F]: F[K] extends SemanticType<infer T> ? T : never }> =>
    structType(fields),
} as const;
```

### Type Safety Notes

- `enumOf("active", "pending")` returns `SemanticType<"active" | "pending">`, not `SemanticType<string>`. The `const V` generic preserves the literal union.
- `struct({ name: Types.string() })` returns `SemanticType<{ name: string }>`. The mapped type extracts each field's phantom `T`.
- `brand(Types.string(), "UserId")` returns `SemanticType<string & Brand<"UserId">>`. The brand is a phantom type, not a runtime change.

---

## 3. `Entity` — Curried Factory + Pipe Transformers

**File:** `src/fx/entity.ts`

### Primary API

```ts
// Curried: name first, fields second
const User = Entity.make("User")({
  id: Types.uuid(),
  email: Types.email(),
  name: Types.string(),
});
// User: Entity<"User", { id: Field<string, ...>; email: Field<string, ...>; name: Field<string, ...> }>

// Direct: name + fields in one call
const User = Entity.make("User", {
  id: Types.uuid(),
  email: Types.email(),
});
```

### Type Signatures

```ts
export const Entity = {
  make: Object.assign(
    // Curried form: Entity.make("User")({ id: Types.uuid() })
    <const Name extends string>(name: Name) =>
      <const F extends FieldsRecord>(
        fields: F,
        options?: EntityDefinitionOptions,
      ): EntityFromInput<Name, F> =>
        defineEntity(name, fields, options),

    // Direct form: Entity.make("User", { id: Types.uuid() })
    {
      <const Name extends string, const F extends FieldsRecord>(
        name: Name,
        fields: F,
        options?: EntityDefinitionOptions,
      ): EntityFromInput<Name, F> {
        return defineEntity(name, fields, options)
      },
    },
  ),
}
```

The return type `EntityFromInput<Name, F>` is defined in `src/entity/entity.ts:283` and expands to `Entity<Name, EntityFieldsFromInput<Name, F>>`. This preserves:

- The literal entity name (`"User"`, not `string`)
- Each field's semantic type (`Field<string>`, `Field<number>`, etc.)
- Each field's owner back-reference (`Entity<"User", ...>`)
- Each field's literal name (`"id"`, `"email"`, etc.)

### Pipe Transformers — Identity-Preserving

These return the same entity type. They attach metadata without changing the field set:

```ts
// Preserves E exactly — just sets store_name
Entity.withStore = <const S extends string>(
  store: S,
): <E extends Entity>(entity: E) => E & { readonly store_name: S }

// Preserves E exactly — just sets id
Entity.withId = (id: EntityId): <E extends Entity>(entity: E) => E & { readonly id: EntityId }

// Preserves E exactly — appends metadata
Entity.withMetadata = <const M extends readonly MetadataEntry[]>(
  ...entries: M
): <E extends Entity>(entity: E) => E & { readonly metadata: readonly [...E["metadata"], ...M] }

// Preserves E exactly — adds a transition graph
Entity.withTransition = (
  graph: TransitionGraph,
): <E extends Entity>(entity: E) => E & {
  readonly transitions: readonly [...E["transitions"], typeof graph]
}
```

**Why `E & { readonly store_name: S }` instead of just `E`?** Because `Entity.store_name` is typed as `string | undefined`. By intersecting with `{ readonly store_name: S }`, we narrow it to the literal. This preserves the store name through the pipe chain so downstream APIs (like `Mapping.make`) can see it.

### Pipe Transformers — Type-Changing

These evolve the `Fields` generic:

```ts
// Adds a new field to the entity's Fields record
Entity.withField = <
  const N extends string,
  const T extends FieldShapeInput,
>(
  name: N,
  type: NoInfer<T>,
): <E extends Entity>(
  entity: E,
) => Entity<
  E["name"],
  E["fields"] & Record<N, InferFieldFromInput<T, E, N>>
>
```

**Why `NoInfer<T>`?** Without it, TypeScript may try to infer `T` from both the `type` argument and the entity's existing field types, causing widening or spurious errors. The `type` argument is the sole source of truth for the new field's type. (Cheatsheet §14.)

### Field Accessors

```ts
Entity.fields = <E extends Entity>(entity: E): E["fields"] => entity.fields;
Entity.field = <E extends Entity, K extends keyof E["fields"] & string>(
  entity: E,
  name: K,
): E["fields"][K] => entity.fields[name];
Entity.name = <E extends Entity>(entity: E): E["name"] => entity.name;
Entity.ref = <E extends Entity>(entity: E): E["ref"] => entity.ref;
```

**Why generic over `E` instead of accepting `Entity`?** Because `Entity.fields` is typed as `Record<string, Field>`. By accepting `E extends Entity`, we get `E["fields"]` which preserves the exact field record type. This is the **Factory-Built Entity Witness** pattern (Cheatsheet §2).

### Type-Level Regression Tests (`tests/fx/fx-entity.test-d.ts`)

```ts
// Entity.make preserves literal name
const User = Entity.make("User")({ id: Types.uuid() });
type UserName = typeof User.name;
//   ^? "User"

// Entity.make preserves field types
type UserIdField = typeof User.fields.id;
//   ^? Field<string, Entity<"User", ...>, "id">

// pipe with identity-preserving transform preserves entity type
const UserWithStore = pipe(User, Entity.withStore("users"));
type StoreName = typeof UserWithStore.store_name;
//   ^? "users"
type FieldsAfterStore = typeof UserWithStore.fields;
//   ^? { readonly id: Field<string, ...> }  (unchanged)

// pipe with type-changing transform evolves fields
const UserWithEmail = pipe(User, Entity.withField("email", Types.email()));
type EmailField = typeof UserWithEmail.fields.email;
//   ^? Field<string, Entity<"User", ...>, "email">
type IdStillThere = typeof UserWithEmail.fields.id;
//   ^? Field<string, Entity<"User", ...>, "id">

// withField rejects duplicate field names (type error expected)
// @ts-expect-error — "id" already exists
pipe(User, Entity.withField("id", Types.string()));

// Entity.field preserves field type
const idField = Entity.field(User, "id");
type IdFieldType = typeof idField;
//   ^? Field<string, Entity<"User", ...>, "id">

// Entity.field rejects unknown field names
// @ts-expect-error — "nonexistent" is not a field of User
Entity.field(User, "nonexistent");
```

---

## 4. `Relation` — Cardinality Helpers

**File:** `src/fx/relation.ts`

### Type Signatures

Each cardinality helper preserves both entity generics and enforces field ownership:

```ts
Relation.oneToMany = <
  E1 extends Entity,
  E2 extends Entity,
>(
  from: E1,
  to: E2,
  foreignKey: FieldOf<E2>,
  primaryKey: FieldOf<E1>,
  options?: RelationOptions,
): Relation<E1, E2, "one_to_many">

Relation.oneToOne = <
  E1 extends Entity,
  E2 extends Entity,
>(
  from: E1,
  to: E2,
  foreignKey: FieldOf<E2>,
  primaryKey: FieldOf<E1>,
  options?: RelationOptions,
): Relation<E1, E2, "one_to_one">

Relation.manyToOne = <
  E1 extends Entity,
  E2 extends Entity,
>(
  from: E1,
  to: E2,
  foreignKey: FieldOf<E1>,
  primaryKey: FieldOf<E2>,
  options?: RelationOptions,
): Relation<E1, E2, "many_to_one">

Relation.manyToMany = <
  E1 extends Entity,
  E2 extends Entity,
  Link extends Entity,
>(
  left: E1,
  right: E2,
  leftFk: FieldOf<Link>,
  rightFk: FieldOf<Link>,
  linkEntity: Link,
  options?: RelationOptions,
): Relation<E1, E2, "many_to_many", Link>
```

**Field ownership enforcement:** `FieldOf<E2>` is a union of all fields belonging to `E2`. Passing `User.fields.id` where `FieldOf<Post>` is expected is a compile error. This is the **Typed Reference Object** pattern (Cheatsheet §6).

### Pipe Transformers (Identity-Preserving)

```ts
Relation.withIntegrity = <const M extends IntegrityKind>(
  mode: M,
): <R extends Relation>(relation: R) => R & { readonly integrity: { readonly kind: M } }

Relation.withOnDelete = <const A extends ReferentialAction>(
  action: A,
): <R extends Relation>(relation: R) => R & {
  readonly foreign_key: R["foreign_key"] & { readonly on_delete: A }
}

Relation.withId = (id: RelationId): <R extends Relation>(relation: R) =>
  R & { readonly id: RelationId }
```

### Type-Level Regression Tests (`tests/fx/fx-relation.test-d.ts`)

```ts
const User = Entity.make("User")({ id: Types.uuid() });
const Post = Entity.make("Post")({ id: Types.uuid(), authorId: Types.uuid() });

// Correct: foreignKey belongs to Post, primaryKey belongs to User
const ok = Relation.oneToMany(User, Post, Post.fields.authorId, User.fields.id);

// @ts-expect-error — User.fields.id does not belong to Post
Relation.oneToMany(User, Post, User.fields.id, User.fields.id);

// @ts-expect-error — Post.fields.authorId does not belong to User
Relation.oneToMany(User, Post, Post.fields.authorId, Post.fields.authorId);

// pipe preserves relation type
const withCascade = pipe(ok, Relation.withOnDelete("cascade"));
type DeleteAction = typeof withCascade.foreign_key.on_delete;
//   ^? "cascade"
```

---

## 5. `Store` / `Table` / `Mapping` — Storage Layer

**File:** `src/fx/storage.ts`

### Type Signatures

```ts
Store.make = <
  const N extends string,
  const D extends StoreDialect,
>(input: {
  name: N
  dialect: D
  version?: string
  capabilities?: readonly string[]
}): Store & { readonly name: N; readonly dialect: D }

Table.make = <
  S extends Store,
  const N extends string,
  const C extends Record<string, Column<any>>,
>(
  store: S,
  name: N,
  columns: C,
): Table & { readonly name: N; readonly store: S; readonly columns: C }

Column.make = <T>(type: SemanticType<T>, options?: ColumnOptions): Column<T>

// Typed column factories
Column.uuid = (options?: ColumnOptions): Column<string>
Column.string = (options?: ColumnOptions): Column<string>
Column.int = (options?: ColumnOptions): Column<number>
Column.boolean = (options?: ColumnOptions): Column<boolean>
Column.datetime = (options?: ColumnOptions): Column<string>
```

### Mapping — Field-Key Enforcement

`Mapping.make` is the most type-sensitive API in the storage layer. It must enforce that the mapping keys are a subset of the entity's field names:

```ts
Mapping.make = <
  E extends Entity,
  const M extends { [K in keyof E["fields"]]?: FieldMappingSpec },
>(
  entity: E,
  fieldMappings: M,
): Mapping<E>
```

**Why `[K in keyof E["fields"]]?`** This constrains the mapping keys to actual field names on the entity. `Mapping.make(User, { id: ..., nonexistent: ... })` is a compile error because `"nonexistent"` is not in `keyof User["fields"]`.

Each `FieldMappingSpec` carries the column type so it can be checked against the field's semantic type:

```ts
type FieldMappingSpec = {
  read_source?: MappingSource<any>
  write_target?: MappingTarget<any>
  read_only?: boolean
}

MapField.column = <T>(column: Column<T>): FieldMappingSpec & {
  readonly read_source: ColumnSource<T>
  readonly write_target: ColumnTarget<T>
}
```

### Type-Level Regression Tests (`tests/fx/fx-storage.test-d.ts`)

```ts
const User = Entity.make("User")({
  id: Types.uuid(),
  email: Types.email(),
});

const UsersTable = Table.make(MainStore, "users", {
  id: Column.uuid({ primary: true }),
  email: Column.string(),
});

// Correct: keys match entity fields
const ok = Mapping.make(User, {
  id: MapField.column(UsersTable.columns.id),
  email: MapField.column(UsersTable.columns.email),
});

// @ts-expect-error — "nonexistent" is not a field of User
Mapping.make(User, {
  id: MapField.column(UsersTable.columns.id),
  nonexistent: MapField.column(UsersTable.columns.email),
});
```

---

## 6. `Query` — Wraps Existing Fluent Builder

**File:** `src/fx/query.ts`

### Type Signatures

```ts
Query.from = <E extends Entity>(
  entity: E,
): QueryBuilder<E, E["fields"]>
```

This delegates to the existing `fromEntity()` fluent builder. The wrapper preserves the entity generic so that `.select()`, `.where()`, and `.orderBy()` continue to enforce `FieldOf<E>`.

### Pipe Helpers

For users who prefer `pipe()` over method chaining:

```ts
Query.withPredicate = <E extends Entity>(
  predicate: TypedExpression<boolean>,
): <Q extends QueryBuilder<E, any>>(qb: Q) => Q

Query.withSelection = <
  E extends Entity,
  const Fields extends readonly FieldOf<E>[],
>(
  fields: Fields,
): <Q extends QueryBuilder<E, any>>(qb: Q) => QueryBuilder<E, Fields>

Query.withOrder = <E extends Entity>(
  field: FieldOf<E>,
  direction?: "asc" | "desc",
): <Q extends QueryBuilder<E, any>>(qb: Q) => Q
```

### Type Safety Notes

- `Query.from(User)` returns `QueryBuilder<Entity<"User", ...>, ...>`. The entity generic flows through `.where()`, `.select()`, etc.
- `.select([User.fields.id, User.fields.email])` narrows the result type to only those fields.
- `.where()` accepts `FieldOf<E>` arguments, rejecting fields from other entities.

---

## 7. `Fn` — Function Constructors

**File:** `src/fx/fn.ts`

### Type Signatures

Each constructor preserves the function name as a literal and the input/output types:

```ts
Fn.static = <
  const N extends string,
  O extends SemanticType<any>,
>(input: {
  name: N
  output: O
  value: O extends SemanticType<infer T> ? T : never
}): StaticFunction<N, O>

Fn.query = <
  const N extends string,
  const I extends Record<string, SemanticType<any>>,
  O extends Entity | SemanticType<any>,
>(input: {
  name: N
  input: I
  output: O
  body: QueryExpression<any>
}): QueryFunction<N, I, O>

Fn.action = <
  const N extends string,
  const I extends Record<string, SemanticType<any>>,
  O extends Entity | SemanticType<any>,
>(input: {
  name: N
  input: I
  output: O
  body: ActionExpr
}): ActionFunction<N, I, O>

Fn.predicate = <
  const N extends string,
  E extends Entity,
>(input: {
  name: N
  input: E
  body: RuleExpr
}): PredicateFunction<N, E>

Fn.expr = <
  const N extends string,
  E extends Entity,
  O extends SemanticType<any>,
>(input: {
  name: N
  input: E
  output: O
  body: TypedExpression<any>
}): ExprFunction<N, E, O>
```

### Pipe Transformers (Identity-Preserving)

```ts
Fn.withAuth = <P extends Policy<any>>(
  policy: P,
): <F extends AnyFunction>(fn: F) => F & { readonly auth: P }

Fn.withConsistency = <const M extends ConsistencyMode>(
  mode: M,
): <F extends AnyFunction>(fn: F) => F & { readonly consistency: M }

Fn.withInvalidates = <E extends Entity>(
  entity: E,
): <F extends AnyFunction>(fn: F) => F & {
  readonly invalidates: readonly [...F["invalidates"], E]
}
```

---

## 8. `Crud` — Derivation

**File:** `src/fx/crud.ts`

### Type Signatures

```ts
Crud.derive = <E extends Entity>(
  entity: E,
  options?: CrudOptions<E>,
): Crud<E>
```

`Crud<E>` carries the entity generic so that the returned query/action functions know their target entity:

```ts
type Crud<E extends Entity> = {
  readonly entity: E
  readonly getById: QueryFunction<..., E>
  readonly list: QueryFunction<..., E>
  readonly count: QueryFunction<..., SemanticType<number>>
  readonly create: ActionFunction<..., E>
  readonly update: ActionFunction<..., E>
  readonly delete: ActionFunction<..., E>
}
```

`CrudOptions<E>` constrains `include`/`exclude` to actual field names:

```ts
type CrudOptions<E extends Entity> = {
  readonly include?: readonly (keyof E["fields"] & string)[];
  readonly exclude?: readonly (keyof E["fields"] & string)[];
  readonly projections?: {
    readonly list?: readonly FieldOf<E>[];
    readonly detail?: readonly FieldOf<E>[];
  };
};
```

### Pipe Transformers

```ts
Crud.withAccess = <P extends Policy<any>>(
  policy: P,
): <C extends Crud<any>>(crud: C) => C & { readonly access: P }
```

---

## 9. `GenContext` — Type-State Builder Composition

**File:** `src/fx/context.ts`

### Type Signatures

The builder uses the **Type-State Builder** pattern (Cheatsheet §16). Each `.entity()` call accumulates the entity into a growing record type. Each `.relation()` call is constrained to entities from the accumulated set.

```ts
interface GenContextBuilder<
  TEntities extends Record<string, Entity> = {},
  TRelations extends readonly Relation[] = [],
  TStores extends readonly Store[] = [],
  TFunctions extends readonly AnyFunction[] = [],
> {
  // Entity accumulation
  entity<E extends Entity>(
    entity: E,
  ): GenContextBuilder<
    TEntities & Record<E["name"], E>,
    TRelations,
    TStores,
    TFunctions
  >

  // Relation — constrained to entities in TEntities
  relation<R extends Relation>(
    relation: R,
  ): GenContextBuilder<
    TEntities,
    [...TRelations, R],
    TStores,
    TFunctions
  >

  // Store accumulation
  store<S extends Store>(
    store: S,
  ): GenContextBuilder<TEntities, TRelations, [...TStores, S], TFunctions>

  // Table — constrained to stores in TStores
  table(store: Store, name: string, columns: Record<string, Column<any>>): this

  // Mapping — constrained to entities in TEntities
  mapping<E extends Entity>(
    entity: E,
    mappings: { [K in keyof E["fields"]]?: FieldMappingSpec },
  ): this

  // Function accumulation
  fn<F extends AnyFunction>(
    fn: F,
  ): GenContextBuilder<TEntities, TRelations, TStores, [...TFunctions, F]>

  // CRUD derivation — constrained to entities in TEntities
  crud<E extends Entity>(entity: E, options?: CrudOptions<E>): this

  // Build
  build(): CreateGenResult<any, any>
}

GenContext.make = (): GenContextBuilder => { ... }
```

### Type Safety Notes

- After `.entity(User).entity(Post)`, the builder's `TEntities` is `{ User: typeof User; Post: typeof Post }`.
- `.crud(entity)` accepts any `Entity`, but the builder tracks which entities have CRUD derived.
- `.build()` produces a `CreateGenResult` with the accumulated context.

### Declarative Composition (Alternative)

For users who prefer a single config object:

```ts
GenContext.from = <
  const E extends Record<string, Entity>,
>(input: {
  entities: E
  relations?: readonly Relation[]
  stores?: readonly Store[]
  functions?: readonly AnyFunction[]
}): CreateGenResult<any, any>
```

The `const E` generic preserves the exact entity map so downstream code can reference entities by name.

### Type-Level Regression Tests (`tests/fx/fx-context.test-d.ts`)

```ts
const User = Entity.make("User")({ id: Types.uuid(), email: Types.email() });
const Post = Entity.make("Post")({ id: Types.uuid(), authorId: Types.uuid() });

// Builder accumulates entity types
const builder = GenContext.make().entity(User).entity(Post);

// After building, the context knows about User and Post
const app = builder.build();

// Declarative form preserves entity map
const app2 = GenContext.from({
  entities: { User, Post },
});
```

---

## 10. Full Example with Type Annotations

```ts
import {
  pipe,
  Entity,
  Relation,
  Store,
  Table,
  Column,
  Mapping,
  MapField,
  Query,
  Fn,
  Crud,
  GenContext,
  Types,
} from "gen2/fx";

const t = Types;

// --- Entities ---
// User: Entity<"User", { id: Field<string>; email: Field<string>; name: Field<string>; status: Field<string> }>
const User = pipe(
  Entity.make("User")({
    id: t.uuid(),
    email: t.email(),
    name: t.string(),
    status: { type: t.string(), default: { kind: "literal", value: "active" } },
  }),
  Entity.withStore("users"),
  Entity.withId(core.entityId({ name: "User" })),
);

// Post: Entity<"Post", { id: Field<string>; authorId: Field<string>; title: Field<string>; ... }>
const Post = pipe(
  Entity.make("Post")({
    id: t.uuid(),
    authorId: t.uuid(),
    title: t.string(),
    body: t.string(),
    publishedAt: { type: t.datetime(), nullable: true },
  }),
  Entity.withStore("posts"),
);

// --- Relations ---
// UserPosts: Relation<Entity<"User",...>, Entity<"Post",...>, "one_to_many">
// Compile error if foreignKey doesn't belong to Post or primaryKey doesn't belong to User
const UserPosts = pipe(
  Relation.oneToMany(User, Post, Post.fields.authorId, User.fields.id),
  Relation.withOnDelete("cascade"),
);

// --- Storage ---
const MainStore = Store.make({ name: "main", dialect: "postgres" });

const UsersTable = Table.make(MainStore, "users", {
  id: Column.uuid({ primary: true }),
  email: Column.string({ unique: true }),
  name: Column.string(),
  status: Column.string(),
});

// Mapping keys constrained to keyof User["fields"]: "id" | "email" | "name" | "status"
const UserMapping = Mapping.make(User, {
  id: MapField.column(UsersTable.columns.id),
  email: MapField.column(UsersTable.columns.email),
  name: MapField.column(UsersTable.columns.name),
  status: MapField.column(UsersTable.columns.status),
});

// --- Queries ---
// activeUsers: QueryExpression<{ id: string; email: string; name: string }>
const activeUsers = Query.from(User)
  .where(eq(field(User.fields.status), lit("active")))
  .select([User.fields.id, User.fields.email, User.fields.name])
  .orderBy(User.fields.name)
  .build();

// --- Functions ---
const listActiveUsers = Fn.query({
  name: "listActiveUsers",
  input: {},
  output: User,
  body: activeUsers,
});

// --- CRUD ---
const userCrud = Crud.derive(User);

// --- Compose ---
// GenContext.make() returns a Type-State Builder that accumulates entity types
const app = GenContext.make()
  .entity(User) // TEntities = { User: typeof User }
  .entity(Post) // TEntities = { User: typeof User; Post: typeof Post }
  .relation(UserPosts)
  .store(MainStore)
  .table(UsersTable)
  .mapping(UserMapping)
  .fn(listActiveUsers)
  .crud(userCrud)
  .build();

lifecycle.check(app.ctx);
```

---

## Implementation Phases

### Phase 1: Foundation (pipe + types + entity)

1. Create `src/fx/pipe.ts` with `pipe()`, `flow()`, `identity()` — 12 overloads each
2. Create `src/fx/types.ts` re-exporting semantic types with `const` generics
3. Create `src/fx/entity.ts` with `Entity.make()` (curried + direct) and pipe transformers
4. Write `tests/fx/fx-pipe.test.ts` (runtime) and `tests/fx/fx-pipe.test-d.ts` (type-level)
5. Write `tests/fx/fx-entity.test.ts` (runtime) and `tests/fx/fx-entity.test-d.ts` (type-level)
6. Verify: `vp check && vp test`

### Phase 2: Relations + Storage

7. Create `src/fx/relation.ts` with cardinality helpers and `FieldOf<E>` enforcement
8. Create `src/fx/storage.ts` with Store, Table, Column, Mapping, MapField
9. Write runtime + type-level tests for both
10. Verify: `vp check && vp test`

### Phase 3: Query + Functions + CRUD

11. Create `src/fx/query.ts` wrapping existing fluent builder
12. Create `src/fx/fn.ts` with function constructors
13. Create `src/fx/crud.ts` with `Crud.derive()`
14. Write tests for each
15. Verify: `vp check && vp test`

### Phase 4: Context Composition

16. Create `src/fx/context.ts` with Type-State Builder
17. Wire entity/relation/storage/function/crud registration
18. Write `tests/fx/fx-context.test.ts` + `tests/fx/fx-context.test-d.ts`
19. Verify: `vp check && vp test`

### Phase 5: Export + Documentation

20. Create `src/fx/index.ts` barrel export
21. Add `"./fx": "./dist/fx/index.mjs"` to `package.json` exports
22. Final: `vp check && vp test`

---

## Type Safety Audit Checklist

Before merging each phase, verify:

### Pipe Transformers

- [ ] Identity-preserving transforms use `<E extends Entity>(e: E) => E & ...`
- [ ] Type-changing transforms evolve the `Fields` generic explicitly
- [ ] No pipe step uses `Entity` (unparameterized) as input or output type
- [ ] `NoInfer` is applied to secondary arguments that should not widen the primary type

### Factories

- [ ] All name parameters use `const N extends string`
- [ ] All field records use `const F extends FieldsRecord`
- [ ] Return types use `EntityFromInput<Name, F>`, not `Entity`
- [ ] Internal casts are confined to factory functions, never at call sites

### Field Ownership

- [ ] Relation helpers constrain fields to `FieldOf<E>` for the correct entity
- [ ] Mapping keys are constrained to `keyof E["fields"]`
- [ ] CRUD options constrain `include`/`exclude` to `keyof E["fields"] & string`

### GenContext Builder

- [ ] `.entity()` accumulates into `TEntities & Record<E["name"], E>`
- [ ] `.relation()` accepts relations whose entities are in `TEntities`
- [ ] `.build()` produces a result that carries the accumulated types

### Type-Level Tests

- [ ] Every domain has a `.test-d.ts` file with `@ts-expect-error` assertions
- [ ] Literal name preservation is tested (`typeof User.name` is `"User"`, not `string`)
- [ ] Field ownership violations are tested (wrong-entity field → type error)
- [ ] Pipe chain type preservation is tested (store name survives through pipe)

---

## Design Decisions

| Decision                                   | Rationale                                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| No `effect` dependency                     | Keeps the library lightweight; the style is the value, not the runtime                                               |
| Delegates to existing builders             | Zero duplication; `Entity.make()` calls `defineEntity()` internally                                                  |
| Pipe transformers are pure functions       | `(entity: E) => E & ...` — no mutation, composable, type-preserving                                                  |
| `GenContext` uses Type-State Builder       | Accumulates entity types through the chain; constrains downstream calls                                              |
| Types as a namespace object                | Mirrors `gen.types` but standalone; no context needed                                                                |
| Curried `make()` is the primary form       | `Entity.make("User")({ ... })` — name binds first, fields second; matches `defineEntityUsingSemanticTypes` precedent |
| `NoInfer` on secondary pipe args           | Prevents TypeScript from widening the entity type based on secondary arguments                                       |
| `FieldOf<E>` on relation/storage APIs      | Enforces field ownership at compile time; rejects cross-entity field references                                      |
| Type-level regression tests (`.test-d.ts`) | Catches generic erasure, widening, and ownership violations at CI time                                               |

---

## What This Does NOT Do

- Does not replace the existing `gen.*` API — it wraps it
- Does not add runtime effects, async, or error handling — it is a construction-time API
- Does not introduce new IR or graph nodes — all output is identical to the existing builders
- Does not require migration — users opt in per-module
- Does not use `any` or `as` at the public API boundary — all casts are internal to factories
