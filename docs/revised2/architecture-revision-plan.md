# Architecture Revision Plan — Inferred Reactivity + Causal Verification

> Updated against `feat/typed-edge-construction` after the typed graph/compiler work landed.
>
> This document describes the **next architectural work from the repo as it exists now**.
> It does not re-plan Pattern/Morphism/Patch/Pipeline infrastructure that already ships.

## 0. Current checkpoint

The branch already has the compiler spine:

```text
Authoring APIs
    ↓
semantic graph
    ↓
GraphPattern / GraphMatch
    ↓
GraphMorphism / GraphDerivation
    ↓
GraphPatch + Diagnostic + Explanation + Artifact
    ↓
Pipeline / preview
    ↓
target lowering and emission
```

It also already proves an important vertical slice:

```text
action writes field
    ↓
rule reads field
    ↓
policy/query depends on rule
    ↓
compiler derives INVALIDATES_KEY
    ↓
preview exposes patch + diagnostic + explanation
    ↓
Effect-Atom JSX target emits invalidation
```

and, from the same graph:

```text
entity + rule
    ↓
Postgres table + RLS policy
    ↓
assembled schema.sql
```

The architecture is therefore no longer the question.

The next thesis is stronger:

> **If Dirived knows the complete semantic schema, the relationships between values, what every computation reads, and exactly how every operation changes state, ordinary reactivity should be inferred completely.**

Manual invalidation should be an escape hatch for missing semantics, not the normal authoring model.

The remaining work is to make the graph the application's **schema of change**.

---

# 1. Core design principle: reactivity is a theorem of the graph

Do not design a public API where application authors routinely write:

```ts
app.invalidates(UpdateUser, UserList)
app.dependsOn(UserList, User)
```

when those facts already follow from the semantic graph.

Authors should state the facts that define the application:

```text
what values exist
how values relate
what expressions/rules/queries read
what operations write
what exact transformation an operation performs
what derived values depend on
```

Dirived should derive:

```text
what can become stale
what must be recomputed
which runtime resources must be notified
which target-specific keys must be invalidated
```

The governing rule is:

> **Within the closed portion of the application represented by the semantic graph, manual reactive wiring indicates missing semantic information.**

This should become an architectural invariant and a documentation principle.

---

# 2. Closed-world completeness must be explicit

The "reactivity is fully inferred" claim depends on Dirived knowing the relevant world.

The compiler should therefore distinguish:

```text
known semantics
opaque semantics
external dependencies
runtime-resolved identity
```

Do not silently treat opaque code as dependency-free.

## 2.1 Opaque code

If a callback cannot be inspected, it must declare its semantic footprint:

```text
reads
writes
effects
external inputs
possible outputs
```

The rule remains:

> **Opaque code is allowed. Unknown impact is not.**

Opaque declarations carry lower assurance/provenance than compiler-derived facts.

## 2.2 External state is still data

Time, random values, HTTP APIs, filesystems, environment state, queues, another database,
feature flags, device state, etc. should be represented as semantic dependencies when they
can influence a result.

For example:

```text
CurrentTime
    READ_BY
ExpiringSessionRule
```

means time progression can invalidate the rule even though no local database field changed.

## 2.3 Runtime identity is not missing semantics

The compiler can know statically:

```text
User.name change invalidates UserProfile(userId)
```

while the concrete `userId = 42` is resolved at runtime.

Static graph nodes represent **families of change/dependency**. Runtime execution instantiates
those families with keys/scopes/payloads.

Do not confuse runtime parameterization with an incomplete dependency graph.

---

# 3. Finish the single-source-of-truth migration

The most important unfinished architectural work is still semantic canonicalization.

```text
Authoring facade
      ↓
semantic graph facts
      ↓
derivation / verification / legalization
      ↓
target graph facts
      ↓
artifacts
```

Adopt this invariant:

> **If a semantic fact exists as graph nodes/edges, another object may expose it as a typed view, but must not independently own a second writable copy.**

## 3.1 Operation model

`src/kernel/operations.ts` still exposes `OpSignature` while the Type/Operation dialect has
first-class operation nodes and edges:

```text
OPERATION_DEF
HAS_INPUT_TYPE
HAS_OUTPUT_TYPE
TYPE_SUPPORTS_OPERATION
OPERATION_READS
OPERATION_WRITES
OPERATION_PRODUCES_PATCH
ACTION_APPLIES_OPERATION
```

Move toward:

```text
OpSignature = typed authoring/view witness for operation graph facts
```

or immediate lowering from `OpSignature` construction into canonical graph facts.

Do not maintain a permanent operation model plus a graph copy.

## 3.2 Reads/writes/reactivity

Legacy action/query/resource properties such as:

```text
reads
writes
invalidates
reactivity
effects
requirements
```

should increasingly become graph-backed projections.

Existing convenience authoring can remain, but downstream derivation should read canonical
edges.

## 3.3 Artifact obligations remain separate

`src/obligations/` currently describes generated test/docs/devtool obligations. Preserve
that concept.

Do not use it as the representation of runtime causal guarantees. Artifact obligations and
causal guarantees are related but semantically different.

---

# 4. Small kernel hardening

Do not perform another kernel rewrite. Fix concrete seams that matter for chained inference.

## 4.1 Sequential phase execution

`runPassPipeline()` correctly threads `modifiedGraph` through successive passes.
`PassRegistry.runPhase()` currently runs every pass against the same input graph.

Make default phase execution sequential:

```text
G0 --P1--> G1 --P2--> G2 --P3--> G3
```

Parallel execution may be added later only for passes explicitly proven independent.

## 4.2 Preserve typed stage outputs

Continue hardening pipeline generics so callers retain specific unions of:

```text
patch kinds
artifact kinds
diagnostic codes
surface witnesses
morphism outputs
```

rather than broad `GraphPatch[]`, `Artifact[]`, and `string[]` at public boundaries.

## 4.3 Keep semantic IDs witness-first

Every new change/dependency API uses existing typed kind/ref/ID witnesses. Strings remain
serialization identities, not ordinary application-facing references.

---

# 5. Normalize reads, writes, and derivations into a queryable dependency model

Before adding more reactive APIs, make the compiler able to ask these questions uniformly:

```text
What does node X read?
What can operation A write?
What is derived from field F?
Which predicates depend on F?
Which queries depend on those predicates?
Which resources/views depend on those queries?
```

Do not necessarily replace domain-specific edge kinds immediately. Build typed graph views
or patterns that normalize them.

Conceptually:

```text
Reads(X)       -> semantic subjects read by X
Writes(A)      -> semantic subjects potentially changed by A
Derives(Y)     -> semantic subjects Y derives from
Dependents(X)  -> reverse dependency closure
```

The existing rule invalidation pass is the first proof of this model. Generalize that
reasoning rather than creating a separate reactive graph.

---

# 6. Derive change semantics from Type + Operation

The Type/Operation dialect should become the foundation for precise state change.

The important structure is:

```text
Type
  │ supports
  ▼
Operation
  │ has exact semantics
  ▼
Change / Delta
```

and:

```text
Field
  │ has type
  ▼
Type
```

therefore:

```text
Field admits the lawful operations supported by its semantic type
```

## 6.1 Derived field operation witnesses

For example:

```ts
const User = entity("User", {
  name: string(),
  active: boolean(),
  loginCount: counter(),
});
```

can expose/derive witnesses such as:

```ts
User.ops.name.set
User.ops.active.set
User.ops.active.toggle
User.ops.loginCount.set
User.ops.loginCount.increment
User.ops.loginCount.decrement
```

The public spelling may evolve. The invariant is that they are stable typed semantic
witnesses backed by graph facts.

## 6.2 Infer operations from semantic capability, not representation

Do not infer `increment` merely because a value lowers to SQL `integer`.

Examples:

```text
boolean
  set
  toggle

counter
  set
  increment
  decrement

email
  set

money
  set by default
  credit/debit only when explicitly modeled
```

## 6.3 Operations should expose exact state transformations

Where possible, an operation should tell the compiler more than "writes field F".

For example:

```text
Set<T>(new)
  old = x
  new = new
  delta = Replace(x, new)

Increment(n)
  old = x
  new = x + n
  delta = +n

SetAdd(v)
  delta = Add(v)
```

This is what allows reactivity to move from conservative entity invalidation toward exact
change propagation.

## 6.4 Precision is monotonic

Represent the compiler's knowledge at increasing precision:

```text
Operation WRITES Entity
      ↓
Operation WRITES Field
      ↓
Operation APPLIES Field.operation
      ↓
Operation PRODUCES exact Delta<Field>
```

Every stage should improve or preserve precision, never silently discard it.

Attach provenance/confidence to derived facts:

```text
exact
matched
conservative
opaque-declared
unknown
```

---

# 7. Infer semantic invalidation automatically

`INVALIDATES` should normally be **derived**, not authored.

Suppose the graph contains:

```text
AcknowledgeIncident
    WRITES Incident.status

CanViewIncident
    READS Incident.status

ListOpenIncidents
    USES CanViewIncident
```

Dirived should derive:

```text
AcknowledgeIncident
    PRODUCES ΔIncident.status

ΔIncident.status
    INVALIDATES CanViewIncident

CanViewIncident
    INVALIDATES ListOpenIncidents
```

or an equivalent normalized dependency representation.

The transitive dependency closure is compiler output.

## 7.1 Basic rule

At the coarse level:

```text
Writes(A) ∩ Reads(B) ≠ ∅
```

implies B may become stale after A.

Then recursively propagate staleness through derived values, predicates, queries, resources,
views, and other semantic computations.

## 7.2 Do not confuse invalidation with value change

Define precisely:

```text
A INVALIDATES B
```

as:

> After A, B can no longer be assumed fresh without further reasoning/recomputation.

It does **not** mean B's semantic value definitely changed.

Example:

```text
count: 2 → 4
parity = count % 2
```

`Parity` is invalidated by the count change, but recomputation can discover the value is
still `0`.

This distinction must remain visible in the IR:

```text
INVALIDATED
RECOMPUTED
CHANGED
```

are different events/facts.

## 7.3 Manual invalidation is an escape hatch

Keep an explicit form for:

```ts
app.reactivity.invalidates(A, B, { reason: ... })
```

only for cases where semantics are intentionally outside the inspectable model.

Require provenance/reason and surface it in diagnostics/explanations:

```text
manual-invalidates
reason: "third-party SDK mutates hidden native cache"
```

A manual invalidation with no opaque/external justification should ideally trigger a hint:

```text
reactivity:manual-edge-may-be-derivable
```

---

# 8. Infer target-specific reactivity from semantic invalidation

The current `INVALIDATES_KEY` edge remains useful, but it should increasingly be a lowering
of more general semantic dependency facts.

Preferred chain:

```text
AcknowledgeIncident
    WRITES
Incident.status

      ↓ derive

AcknowledgeIncident
    PRODUCES
ΔIncident.status

      ↓ dependency closure

AcknowledgeIncident
    INVALIDATES
ListOpenIncidents

      ↓ reactivity target planning

AcknowledgeIncident
    INVALIDATES_KEY
Incident:entity

      ↓ Effect-Atom JSX

invalidates: incidentKey.key
```

Another target can lower the same semantic graph differently:

```text
TanStack Query       -> invalidateQueries(...)
Effect-Atom JSX      -> invalidates: key
small reactive core -> source.invalidate()
server cache         -> evict/mark stale
materialized view    -> incremental maintenance/recompute
event stream         -> emit change event
```

The semantic graph does not care which mechanism is chosen.

A new target should not require changing domain authoring.

---

# 9. Add delta-aware and value-sensitive propagation

Once operations produce structured deltas, go beyond "may be stale."

The ideal pipeline is:

```text
schema knowledge
    ↓
dependency inference
    ↓
field-level invalidation
    ↓
exact operation semantics
    ↓
delta inference
    ↓
delta propagation through derivations
    ↓
no-op detection / incremental maintenance
```

## 9.1 Derivative/incremental interfaces

Allow an operation or derivation to expose how input deltas transform into output deltas:

```text
ΔA -> ΔB
```

This can be authored once for reusable semantic operations and inherited wherever those
operations appear.

For example:

```text
Count.increment(+2)
    ↓
ΔCount = +2
    ↓
Parity derivative/recompute
    ↓
ΔParity = no-change
```

The runtime can stop propagation there.

## 9.2 Do not require delta sophistication for correctness

Delta support is an optimization/precision layer.

Fallback remains:

```text
known dependency -> invalidate -> recompute
```

Correctness must not depend on every derivation having an incremental implementation.

## 9.3 Reuse existing reactivity/IVM traits

The current reactivity dialect already contains concepts such as:

```text
PRODUCES_DELTA
IVM
MAINTAINS_VIEW
PATCHABLE
INCREMENTALIZABLE
```

Extend and connect these rather than inventing a parallel incremental-computation subsystem.

---

# 10. Separate inferred reactivity from authored causal obligations

This is the most important correction to the previous plan.

There are **two different things**:

### A. Derived causal/dependency facts

These follow from application semantics:

```text
A writes F
B reads F
therefore A may invalidate B
```

The author should not declare these manually.

### B. Domain causal guarantees

These are requirements that do not necessarily follow from read/write structure:

```text
PlaceOrder MUST_CAUSE SendReceipt
PlaceOrder MUST_CAUSE ReserveInventory
UserDeleted MUST_CAUSE AuditRetentionRecord
PaymentCaptured MUST_CAUSE LedgerEntry
```

These are genuine domain semantics and may need explicit declaration.

Do not build a large public "causal schema" API for ordinary reactivity. Build causal
contracts for **non-derivable guarantees**.

## 10.1 Minimal causal vocabulary

Start with:

```text
MAY_CAUSE   — optional domain effect/capability when useful
MUST_CAUSE  — required semantic consequence
ENABLES     — state/predicate admits operation
```

`INVALIDATES` is primarily compiler-derived.

`PRODUCES_DELTA` is primarily derived from operation semantics.

## 10.2 Witness-first causal contracts

Use typed operation/action/event witnesses directly:

```ts
app.causal.requires(
  PlaceOrder,
  ReserveInventory,
  ({ cartId }) => ({ cartId }),
)
```

The payload projection is type checked.

No magic strings after witness declaration.

## 10.3 Parameterized causality

Contracts are about related runtime instances:

```text
UserChanged(user=42)
    MUST_CAUSE
PermissionsRecomputed(user=42)
```

The static graph represents the family; runtime execution supplies the scope/key values.

---

# 11. Verify causal guarantees with inspectable effect/program IR

Ordinary reactive invalidation does not need authors to write effect contracts because the
compiler derives it.

Explicit `MUST_CAUSE` guarantees do need implementation verification.

A generator/Effect-style authoring surface can be ergonomic:

```ts
app.implement(PlaceOrder, function* (input) {
  const order = yield* Orders.insert(...)
  yield* ReserveInventory({ cartId: input.cartId })
  yield* SendReceipt({ orderId: order.id })
  return order
})
```

But lower it into inspectable Plan IR.

## 11.1 Minimal Plan IR

```text
Request(OperationWitness, payload)
Sequence([...])
Branch(predicate, then, else)
Parallel([...])
Return(value)
```

Add loops, `Try`, compensation, cancellation, etc. only when required by real target
semantics.

## 11.2 Compute MayEffects and MustEffects

For program `P`:

```text
MayEffects(P)
MustEffects(P)
```

For a branch:

```text
May  = union(branch effects)
Must = intersection(branch effects)
```

Verify:

```text
MayEffects(implementation)
    ⊆
AllowedEffects(operation)

RequiredDomainEffects(operation)
    ⊆
MustEffects(implementation)
```

This is where a missing domain consequence becomes a real type/effect error.

## 11.3 Do not require this machinery for compiler-generated reactive effects

If Dirived itself lowers inferred `INVALIDATES` facts to target-specific invalidation code,
that implementation is generated from compiler facts and already has by-construction
provenance.

The strongest verification problem applies to hand-authored/opaque behavior and explicit
domain causal guarantees.

---

# 12. Runtime verification only at distributed boundaries

Some `MUST_CAUSE` contracts span execution systems:

```text
request
  → outbox
  → queue
  → worker
  → remote state
```

Static proof can often establish durable handoff but not eventual completion.

Support execution semantics such as:

```text
synchronous
same_transaction
eventual
within(duration)
```

Generated boundary adapters can propagate a causal trace/scope ID.

A runtime verifier can compare observed execution against the static contract:

```text
PlaceOrder(order=123)
    ↓
InventoryReserved(order=123)
    ↓
ReceiptSent(order=123)
```

This is target/runtime instrumentation, not canonical domain storage.

Before making strong distributed guarantees, model retry, idempotency, duplicates, timeout,
cancellation, compensation, and durable handoff.

---

# 13. Preview/explain should make inferred reactivity legible

Do not merely generate correct invalidation. Make the derivation understandable.

`app.explain(...)` should answer:

```text
Why does acknowledgeIncident invalidate listOpenIncidents?

1. acknowledgeIncident writes Incident.status
2. canViewIncident reads Incident.status
3. listOpenIncidents uses canViewIncident
4. therefore listOpenIncidents may be stale after acknowledgeIncident
5. the Effect-Atom target represents listOpenIncidents with Incident:entity
6. therefore the emitted mutation invalidates incidentKey
```

For delta-aware cases:

```text
Why was UserAgeQuery not invalidated?

UpdateUserName applies User.name.set.
Its exact delta changes only User.name.
UserAgeQuery reads User.age.
No dependency path intersects the changed region.
```

For explicit causal guarantees:

```text
Why is PlaceOrder implementation invalid?

PlaceOrder MUST_CAUSE ReserveInventory.
One reachable successful branch returns without ReserveInventory.
```

These explanations are part of the product, not debugging garnish.

---

# 14. Updated execution order

## Phase 0 — sync reality and harden chaining

- Update stale `PLAN.md` / `CURRENT.md` statements about already-landed Pattern/Morphism work.
- Make `runPhase()` thread graph changes sequentially.
- Keep OpsDesk and all existing target golden tests green.

## Phase 1 — canonical semantic facts

- Finish graph-backed operation/action/query projections.
- Make Type/Operation graph facts authoritative.
- Add architecture tests preventing new duplicate writable semantic models.

## Phase 2 — normalized dependency queries

- Generalize graph queries for reads, writes, derivations, reverse dependents.
- Port existing reactive derivations to those queries where useful.
- Preserve typed provenance and precision.

## Phase 3 — type-derived operation/change semantics

- Define lawful type-supported operations through `TYPE_SUPPORTS_OPERATION`.
- Expose field-specific typed operation witnesses.
- Attach exact write/patch/delta semantics to reusable operations.
- Derive coarse deltas from existing writes when exact operation information is absent.

## Phase 4 — generic inferred reactivity

- Add semantic `INVALIDATES` as derived graph fact.
- Compute dependency closure across fields → expressions/rules → queries → resources/views.
- Derive existing `INVALIDATES_KEY` from the generic semantic relation.
- Make manual invalidation an explicit low-assurance escape hatch.

## Phase 5 — precision improvements

- Key/scope-aware runtime instantiation.
- Field/predicate/value-sensitive invalidation.
- Delta propagation.
- No-op detection.
- Incremental/IVM lowering where supported.

## Phase 6 — target convergence

Make at least two substantially different reactive targets consume the same semantic
invalidation graph:

```text
Effect-Atom JSX
TanStack Query or the tiny invalidation runtime
```

No target-specific change to domain authoring is allowed.

## Phase 7 — explicit domain causal guarantees

- Add witness-first `MUST_CAUSE` / optional `MAY_CAUSE` contracts.
- Add typed payload/scope projections.
- Keep these separate from automatically inferred reactivity.

## Phase 8 — implementation effect verification

- Add minimal Plan IR.
- Add Effect-like / `yield*` authoring if ergonomic.
- Compute `MayEffects` / `MustEffects`.
- Verify explicit domain causal guarantees.

## Phase 9 — distributed assurance

- Transactional/eventual semantics.
- Durable handoff modeling.
- Runtime causal traces.
- Retry/idempotency/timeout/compensation semantics.

## Phase 10 — compiler/product hardening

- Typed pipeline result unions.
- Better semantic diff.
- Rich causal/reactive explanations.
- Repair suggestions.
- GraphView/memoization/shaking when profiling justifies them.

---

# 15. The next actual milestone

Extend the existing OpsDesk golden slice. Do not create another showcase app.

The same authoring definition should prove this chain **without manually declaring reactive
invalidation**:

```text
acknowledgeIncident
    ↓ WRITES
Incident.status
    ↓ operation/change semantics
ΔIncident.status
    ↓ dependency closure
canViewIncident stale
    ↓
listOpenIncidents stale
    ↓ target planning
Incident:entity KeyFamily stale
    ↓ target lowering
Effect-Atom invalidation emitted
```

Required assertions:

1. `acknowledgeIncident`'s write is a canonical graph fact.
2. The compiler derives a change/delta fact for `Incident.status`.
3. The compiler derives the rule/query dependency chain.
4. Generic semantic invalidation is derived automatically.
5. `INVALIDATES_KEY` is derived from semantic invalidation + target/key facts.
6. Effect-Atom output remains byte-for-byte correct where expected.
7. `app.explain(...)` shows the complete inference chain.
8. Postgres table/RLS output remains unchanged.
9. No application-authored `invalidates` declaration is needed for this chain.

Then add a **separate** explicit domain guarantee to the same fixture, for example:

```text
AcknowledgeIncident MUST_CAUSE AuditEntry
```

and verify it with an inspectable implementation.

That pairing proves the important distinction:

```text
reactivity
  = inferred from the complete semantic graph

domain causal obligation
  = explicitly declared only when it is additional semantic intent
```

---

# 16. Final intended model

The architecture should converge on:

```text
                    SEMANTIC TYPES
                         │
                  admit operations
                         ▼
                     OPERATIONS
                         │
                exact state transforms
                         ▼
                       DELTAS
                         │
                         │ intersect dependency reads
                         ▼
                 DEPENDENCY CLOSURE
                         │
                         ▼
               INFERRED INVALIDATION
                         │
             ┌───────────┼────────────┐
             ▼           ▼            ▼
        query keys   reactive core    IVM/views
             │           │            │
             └───────────┼────────────┘
                         ▼
                    TARGET LOWERING

Separately:

                DOMAIN CAUSAL INTENT
                         │
                    MUST_CAUSE
                         │
                         ▼
                IMPLEMENTATION PLAN
                         │
                 May/Must effect check
                         │
                         ▼
               runtime assurance where
                  static proof stops
```

The key design principle is now:

> **Dirived users describe the world and the lawful ways it can change. The compiler derives reactivity. Users declare causal edges only when they express additional domain intent that cannot be inferred from data dependency semantics.**

If the application is fully represented, Dirived should know what can become stale because
it already knows what changed and everything that depends on it.
