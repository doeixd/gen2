

You can use “pseudo typeclasses” plus custom semantic types to define **merge behavior as typed, inspectable metadata**. That would let the compiler know how values of a given type should combine during:

```txt id="i5g6l4"
optimistic updates
offline sync
conflict resolution
event folding
workflow retries
IVM/materialized view maintenance
patch composition
collaborative editing
distributed writes
backfills
cache reconciliation
```

The important idea:

```txt id="05p09l"
Merge behavior should belong to semantic types and operations,
not be hidden in arbitrary runtime functions.
```

## What “merge behavior” means

Different types need different merge semantics.

Examples:

```txt id="c1p7rs"
number counter:
  add deltas

money balance:
  add signed ledger entries, but do not blindly merge balances

string title:
  last-write-wins, manual conflict, or CRDT text merge

set of tags:
  union / add-remove set

list of comments:
  append by stable ID

status enum:
  state-machine transition, not arbitrary overwrite

permissions:
  union? intersection? explicit precedence?

profile object:
  field-wise merge

document body:
  CRDT or operational transform

inventory quantity:
  maybe decrement/increment with invariant checks

updatedAt:
  max timestamp

version:
  increment / compare-and-swap
```

So yes, you want type-directed merge behavior.

## Good conceptual model

Add a reusable concept:

```txt id="ul82yp"
MergeStrategy<T>
```

or more generally:

```txt id="8zco4l"
Algebra<T>
```

Because merge is one operation among several related laws.

Something like:

```ts id="nzy0zl"
interface MergeStrategy<T, Delta = T> {
  readonly kind: "merge_strategy";
  readonly name: string;

  readonly valueType: SemanticType<T>;
  readonly deltaType?: SemanticType<Delta>;

  readonly merge: ExprFunction<
    { base?: T; left: T; right: T; context?: MergeContext },
    T
  >;

  readonly diff?: ExprFunction<{ before: T; after: T }, Delta>;
  readonly applyDelta?: ExprFunction<{ value: T; delta: Delta }, T>;

  readonly laws: readonly Law[];
  readonly conflicts?: ConflictPolicy<T>;
  readonly invariants?: readonly Predicate<T, boolean>[];

  readonly requirements?: readonly Requirement[];
  readonly effects?: readonly Effect[];
}
```

But you may not want `merge` as a raw `ExprFunction` for everything. For common strategies, use static built-ins.

## Built-in merge strategies

Start with a closed set of common strategies:

```txt id="ok6yy2"
replace
lastWriteWins
firstWriteWins
max
min
sum
product
append
prepend
setUnion
setIntersection
setDifference
addRemoveSet
fieldWise
byIdCollection
stateMachine
manualConflict
rejectConflict
custom
```

Example:

```ts id="3mqap2"
const TagSet = gen.types.set(gen.types.string()).withMerge(
  gen.merge.setUnion()
);

const UpdatedAt = gen.types.datetime().withMerge(
  gen.merge.max()
);

const ViewCount = gen.types.number().withMerge(
  gen.merge.sumDeltas()
);

const Title = gen.types.string().withMerge(
  gen.merge.lastWriteWins({
    clock: "updatedAt",
  })
);
```

This makes merge semantics available to optimistic updates, offline queues, and generated tests.

## Typeclass-style design

The pseudo-typeclass approach might look like this:

```ts id="8mmg2w"
const Mergeable = gen.typeclass.define("Mergeable", {
  typeParams: ["T"],
  methods: {
    merge: gen.func.type({
      input: gen.types.object({
        base: gen.types.optional(gen.types.typeParam("T")),
        left: gen.types.typeParam("T"),
        right: gen.types.typeParam("T"),
      }),
      returns: gen.types.typeParam("T"),
    }),
  },
  laws: [
    gen.law.associative(),
    gen.law.identity(),
  ],
});
```

Then attach instances:

```ts id="arfycj"
const tagSetMerge = gen.typeclass.instance(Mergeable, {
  for: TagSet,
  methods: {
    merge: gen.merge.setUnion(),
  },
  laws: [
    gen.law.associative(),
    gen.law.commutative(),
    gen.law.idempotent(),
  ],
});
```

Then the compiler can ask:

```txt id="br4g3j"
Does this type have a Mergeable instance?
Is the merge associative?
Is it commutative?
Is it idempotent?
Is it reversible?
Can it be represented as a delta?
Can it be used for optimistic rollback?
Can it be used for IVM?
```

That is a very powerful design.

## But keep it practical

I would not expose “typeclass” jargon to normal users unless the project already uses that language.

Public API could be:

```ts id="b4l3fj"
gen.types.number().mergeWith(gen.merge.sum())
gen.types.array(Comment).mergeWith(gen.merge.byId(Comment.fields.id))
gen.types.enum(["draft", "active", "archived"]).mergeWith(
  gen.merge.stateMachine(ProjectStatusMachine)
)
```

Internally, that can register a `Mergeable` instance.

## Attach merge to semantic types

Semantic types are the right place for default merge behavior.

Example:

```ts id="kp1d4p"
const Tags = gen.types.array(gen.types.string(), {
  semantics: "tag_list",
  merge: gen.merge.setUnion(),
});

const ProjectStatus = gen.types.enum(["draft", "active", "archived"], {
  merge: gen.merge.stateMachine({
    draft: ["active", "archived"],
    active: ["archived"],
    archived: [],
  }),
});
```

Then fields inherit it:

```ts id="6wlg7m"
const Project = gen.entity("Project", {
  fields: {
    tags: gen.field(Tags),
    status: gen.field(ProjectStatus),
  },
});
```

Now generated update logic knows:

```txt id="6n9xb6"
Project.tags can merge by union.
Project.status must follow transition rules.
```

## Field-level override

Sometimes the same semantic type needs different merge behavior in different contexts.

So allow field-level override:

```ts id="fn7a2k"
const Project = gen.entity("Project", {
  fields: {
    tags: gen.field(gen.types.array(gen.types.string()), {
      merge: gen.merge.setUnion(),
    }),

    displayName: gen.field(gen.types.string(), {
      merge: gen.merge.lastWriteWins({ clock: "updatedAt" }),
    }),

    balance: gen.field(Money, {
      merge: gen.merge.rejectConflict({
        reason: "Balances must be updated through ledger entries",
      }),
    }),
  },
});
```

This is important because `number` can mean counter, price, balance, priority, ordering, or score. Same primitive type, different merge semantics.

## Entity-level merge

For objects/entities, use field-wise merge by default, but only when fields have merge strategies.

```ts id="5gttqc"
const ProjectMerge = gen.merge.entity(Project, {
  fields: {
    title: gen.merge.lastWriteWins({ clock: Project.fields.updatedAt }),
    tags: gen.merge.setUnion(),
    status: gen.merge.stateMachine(ProjectStatusTransitions),
    updatedAt: gen.merge.max(),
  },
  conflicts: "collect",
});
```

This can produce:

```txt id="c14eku"
merged value
conflicts
applied field strategies
diagnostics
```

Maybe output type:

```ts id="f9fgka"
type MergeResult<T> =
  | { kind: "merged"; value: T }
  | { kind: "conflict"; conflicts: Conflict[]; partial?: T };
```

For type safety, the merge strategy should expose whether it can conflict.

## Patch and delta integration

Merge behavior becomes much more useful if connected to patches/deltas.

Types should optionally define:

```txt id="wmaomr"
diff
applyDelta
composeDelta
invertDelta
mergeDelta
```

Example:

```ts id="68h2q9"
interface DeltaAlgebra<T, Delta> {
  readonly valueType: SemanticType<T>;
  readonly deltaType: SemanticType<Delta>;

  readonly diff: ExprFunction<{ before: T; after: T }, Delta>;
  readonly apply: ExprFunction<{ value: T; delta: Delta }, T>;
  readonly compose?: ExprFunction<{ first: Delta; second: Delta }, Delta>;
  readonly invert?: ExprFunction<{ delta: Delta }, Delta>;
  readonly laws: readonly Law[];
}
```

This directly helps:

```txt id="wmgk29"
optimistic rollback
offline command replay
event sourcing
IVM delta planning
collaborative editing
cache patching
```

## Laws matter a lot

Merge strategies need law metadata.

Examples:

```txt id="n29f7h"
associative:
  (a ⋄ b) ⋄ c = a ⋄ (b ⋄ c)

commutative:
  a ⋄ b = b ⋄ a

idempotent:
  a ⋄ a = a

identity:
  empty ⋄ a = a

inverse:
  can undo

monotonic:
  value only grows in lattice/order

total:
  merge always produces a value

partial:
  merge may conflict

deterministic:
  same inputs produce same output
```

Why they matter:

```txt id="v91bni"
associative + commutative:
  safe to reorder batched updates

idempotent:
  safe to retry duplicate delivery

inverse:
  safe optimistic rollback

monotonic:
  good for CRDT/IVM/materialization

partial:
  needs conflict handling UI or server resolution
```

So a merge strategy should not just say “here’s a function.” It should say what algebraic properties it has.

## Example: offline update

Suppose a user edits a project offline:

```txt id="61tu7q"
local:
  tags += ["urgent"]
  title = "New title"
```

Meanwhile server changes:

```txt id="n9etfj"
remote:
  tags += ["client"]
  title = "Other title"
```

Merge behavior:

```txt id="8gxhco"
tags:
  setUnion => ["urgent", "client"]

title:
  lastWriteWins or conflict

updatedAt:
  max timestamp
```

Because this is in IR, the offline sync generator can produce a reconciliation plan and know when to show conflict UI.

## Example: event folding

For event-sourced projections:

```ts id="5n0hci"
const CommentCount = gen.types.number().withMerge(
  gen.merge.sumDeltas({
    identity: 0,
    delta: gen.types.number(),
  })
);
```

Then events:

```txt id="gule2q"
CommentAdded => +1
CommentDeleted => -1
```

Projection maintenance can fold deltas.

The laws tell the compiler whether batching/reordering is safe.

## Example: IVM

For materialized views, aggregate fields need merge behavior.

```ts id="qa5hc7"
const ProjectStats = gen.entity("ProjectStats", {
  fields: {
    projectId: gen.field.uuid(),
    openTaskCount: gen.field.number({
      merge: gen.merge.sumDeltas(),
      laws: [gen.law.associative(), gen.law.commutative()],
    }),
    lastActivityAt: gen.field.datetime({
      merge: gen.merge.max(),
    }),
  },
});
```

Then IVM can maintain:

```txt id="m2lbtb"
TaskCreated => openTaskCount + 1
TaskClosed => openTaskCount - 1
CommentAdded => lastActivityAt = max(lastActivityAt, comment.createdAt)
```

## Example: mutation control

A field merge strategy can also constrain writes.

For balance:

```ts id="dh9mlw"
const AccountBalance = gen.field(Money, {
  merge: gen.merge.rejectDirectMerge({
    use: "LedgerEntry",
  }),
});
```

Then generated CRUD update can reject:

```txt id="jnexwx"
PATCH /account { balance: 1000 }
```

and require:

```txt id="i3k1su"
create LedgerEntry
```

This is very valuable.

## IR shape

Maybe:

```ts id="5ki5w4"
interface TypeclassInstance<T = unknown> {
  readonly kind: "typeclass_instance";
  readonly typeclass: TypeclassRef;
  readonly forType: SemanticType<T>;
  readonly methods: Record<string, StaticFunction | ExprFunction | BuiltinOperation>;
  readonly laws: readonly Law[];
  readonly diagnostics?: readonly Diagnostic[];
}
```

Then merge is a specific typeclass:

```ts id="x669f2"
interface MergeableInstance<T, Delta = T>
  extends TypeclassInstance<T> {
  readonly typeclass: "Mergeable";
  readonly strategy: MergeStrategy<T, Delta>;
}
```

But a simpler public shape:

```ts id="gsj0fv"
interface MergeStrategy<T, Delta = T> {
  readonly kind: "merge_strategy";
  readonly name: string;
  readonly valueType: SemanticType<T>;
  readonly deltaType?: SemanticType<Delta>;
  readonly operation: MergeOperation<T, Delta>;
  readonly laws: readonly Law[];
  readonly conflictPolicy?: ConflictPolicy<T>;
}
```

And `MergeOperation` should be mostly closed/discriminated:

```ts id="hgd5xg"
type MergeOperation<T, Delta> =
  | { kind: "replace" }
  | { kind: "last_write_wins"; clock: Field | Expr }
  | { kind: "max" }
  | { kind: "min" }
  | { kind: "sum" }
  | { kind: "set_union" }
  | { kind: "add_remove_set" }
  | { kind: "by_id_collection"; id: Field }
  | { kind: "field_wise"; fields: Record<string, MergeStrategy<any>> }
  | { kind: "state_machine"; machine: StateMachine }
  | { kind: "manual_conflict" }
  | { kind: "custom_expr"; expr: ExprFunction }
  | { kind: "opaque_runtime"; reviewRequired: true };
```

## How custom types participate

Custom semantic type:

```ts id="f3jl0p"
const Money = gen.types.custom("Money", {
  representation: gen.types.object({
    amount: gen.types.decimal(),
    currency: gen.types.string(),
  }),

  merge: gen.merge.custom({
    name: "moneyLedgerMerge",
    delta: gen.types.object({
      amount: gen.types.decimal(),
      currency: gen.types.string(),
      ledgerEntryId: gen.types.uuid(),
    }),
    operation: gen.merge.rejectValueMerge({
      message: "Money balances must merge through ledger deltas",
    }),
  }),
});
```

Or for a CRDT-ish type:

```ts id="2nlslu"
const GrowOnlyCounter = gen.types.custom("GCounter", {
  representation: gen.types.record(gen.types.string(), gen.types.number()),
  merge: gen.merge.fieldWiseMax(),
  laws: [
    gen.law.associative(),
    gen.law.commutative(),
    gen.law.idempotent(),
    gen.law.monotonic(),
  ],
});
```

## Diagnostics

You would want diagnostics like:

```txt id="c7lkpo"
merge:strategy-missing
merge:law-required-for-retry
merge:non-idempotent-retried-effect
merge:conflict-policy-missing
merge:field-merge-missing
merge:delta-type-mismatch
merge:custom-merge-not-portable
merge:opaque-merge-in-generated-target
merge:state-transition-invalid
merge:direct-merge-forbidden
merge:non-commutative-parallel-merge
merge:non-invertible-optimistic-rollback
```

## Where this plugs in

This merge system would integrate with many parts of the library:

```txt id="m4txjf"
SemanticType:
  default merge behavior

Field:
  field-specific override

Entity:
  field-wise merge plan

ActionFunction:
  write/patch merge semantics

PatchFunction:
  compose/invert/apply deltas

Offline queue:
  reconcile local/remote changes

Reactivity:
  patch caches instead of invalidate

IVM:
  maintain aggregate/materialized values

Workflow:
  retry/compensate/batch safely

Events:
  fold event streams

Migrations:
  merge/backfill evolving data shapes

CRUD:
  generate safe update semantics

Auth:
  prevent forbidden merge/write paths
```

## Strong recommendation

Do this, but keep the MVP small.

Start with:

```txt id="4j7hyn"
1. MergeStrategy IR
2. Attach merge strategy to SemanticType and Field
3. Built-ins: replace, lastWriteWins, max, min, sumDeltas, setUnion, fieldWise, manualConflict
4. Law metadata
5. Entity field-wise merge
6. Diagnostics for missing/unsafe merge in offline/optimistic contexts
```

Do not start by building full CRDTs or a generic theorem-proving typeclass system.

## Bottom line

Yes: pseudo typeclasses + custom semantic types are an ideal way to define merge behavior.

The best version is:

```txt id="p8xp72"
Semantic types define default merge algebra.
Fields can override it.
Entities compose field merges.
Actions/patches/offline/IVM/workflows consume merge metadata.
Laws tell the compiler what optimizations and retries are safe.
Opaque custom merges are allowed but lose portability and trigger diagnostics.
```

This would make the library much more powerful because it lets the compiler understand not just **what data is**, but **how data evolves safely under concurrency, retries, offline edits, and derived views**.
