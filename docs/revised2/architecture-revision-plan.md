# Architecture Revision Plan — Current-State Revision

> Updated against `feat/typed-edge-construction` after the typed graph/compiler work landed.
>
> This document is intentionally narrower than the master `PLAN.md`. It describes the
> **next architectural work from the repo as it exists now**, not the work that was
> necessary to get here.

## 0. Current checkpoint

The previous version of this plan was written as though the general compiler architecture
still needed to be built. That is no longer true.

The feature branch already has the important spine:

```text
Authoring APIs
    ↓
canonical-ish semantic graph
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

It also already has a real end-to-end proof slice:

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
Effect-Atom JSX target emits reactive invalidation

and, from the same application graph:

entity/rule
    ↓
Postgres table + RLS policy
    ↓
assembled schema.sql
```

So the next milestone is **not** "prove the graph compiler architecture is real." It is
already real.

The next milestone is:

> **Make change, causality, and reactive obligations first-class semantic facts that the
> existing graph compiler can derive, explain, check, and lower.**

That is the bridge between the current repo and the "hidden type system of reactive code"
idea.

---

## 1. What is no longer roadmap work

Do not re-plan or rebuild the following as new architecture:

- `GraphPattern` / `GraphMatch`
- `GraphPatch`
- `GraphMorphism`
- derivation passes
- diagnostics / repairs / explanations
- `Surface`
- `Dialect`
- typed edge-kind witnesses and endpoint roles
- branded graph IDs / refs
- typed pipeline witnesses
- pipeline preview
- rule-derived reactive invalidation
- Postgres table/RLS lowering
- Effect-Atom JSX reactive target emission
- the OpsDesk golden vertical slice

These should be **hardened and generalized**, not replaced.

Likewise, do not create a parallel "change compiler" beside the graph compiler. Change and
causal facts must use the same Node / Edge / Pattern / Morphism / Patch machinery that the
rest of Dirived uses.

---

## 2. Architectural invariant: one semantic source of truth

The most important unfinished architectural job is still canonicalization.

The intended architecture is:

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

A facade may have a rich TypeScript witness for ergonomics and inference, but it must not
remain an independently authoritative semantic model.

Adopt this as an explicit project invariant:

> **If a semantic fact is represented by graph nodes or edges, another object may expose it
> as a typed view, but must not independently own a second writable copy of that fact.**

### Immediate canonicalization targets

1. **Operation signatures.** `src/kernel/operations.ts` still has `OpSignature`, while the
   Type/Operation dialect has `OPERATION_DEF_NODE_KIND`, input/output edges, traits, and
   operation relations. `opToKernelNode` / `opToKernelEdges` is currently an adapter seam.

   Move toward one of these two acceptable end states:

   ```text
   OpSignature = authoring witness over an OperationDef graph node
   ```

   or:

   ```text
   OpSignature authoring → graph fact creation immediately
   downstream code reads only the graph
   ```

   Do not maintain a long-lived operation model plus a graph copy.

2. **Action/query/reactivity projections.** Where legacy objects expose `effects`,
   `requirements`, `invalidates`, `reactivity`, or written/read fields, make those values
   projections of graph facts wherever practical.

3. **Artifact obligations.** The existing `src/obligations/` system concerns test/docs/devtool
   artifact obligations. Preserve it, but do not reuse it as the representation of causal
   runtime obligations. They are different concepts.

### Gate

The OpsDesk fixture should remain behaviorally identical while an increasing percentage of
its downstream passes can be implemented using only graph facts and typed witnesses.

---

## 3. Small kernel hardening before more semantics

Do not pause the project for another kernel rewrite, but fix the concrete seams that make
causal reasoning unreliable.

### 3.1 Pass execution semantics

`runPassPipeline()` is sequential and threads `modifiedGraph` into the next pass.
`PassRegistry.runPhase()` currently invokes every pass against the same incoming graph and
combines results afterward.

That difference is dangerous once same-phase derivations depend on one another.

Make the default phase semantics sequential:

```text
G0 --P1--> G1 --P2--> G2 --P3--> G3
```

If parallel/independent execution is later valuable, make it explicit rather than the
implicit default.

### 3.2 Preserve witnesses through stage results

Continue the already-started generic hardening so:

```ts
Pipeline<...>
```

preserves the specific unions of:

```text
patch kinds
artifact kinds
diagnostic codes
surfaces
morphism outputs
```

instead of collapsing them to `GraphPatch[]`, `Artifact[]`, and strings at the public
boundary.

This matters for causal tooling because the compiler should be able to tell a caller, in
its TypeScript type, which semantic consequences a pipeline can derive or emit.

### 3.3 Do not add new magic-string seams

The current branch has invested heavily in typed witnesses, kind-bound IDs, refs, and
endpoint inference. Every new causal API should use those witnesses directly.

A relation may serialize to a string ID. Normal authoring code should never refer to that
ID as a magic string.

---

## 4. Add a general causal vocabulary — additively

The current reactivity dialect has useful concrete facts such as:

```text
INVALIDATES_KEY
DERIVES_KEY
PATCHES_RESOURCE
PRODUCES_DELTA
MAINTAINS_VIEW
```

Keep them.

But `INVALIDATES_KEY` is narrower than the application-wide causal schema described by the
reactive-type argument. A database write can invalidate a semantic query before any
particular target decides to represent that query with a key.

Add a **small open causal vocabulary** above target/runtime-specific relations.

Conceptually:

```text
A --invalidates--> B
A --mayCause-----> B
A --mustCause----> B
P --enables------> A
P --disables-----> A
A --establishes--> P
A --produces-----> ΔX
```

Do not force every dependency into a single undifferentiated `A → B` edge. The relation
kind is part of the semantics.

### Suggested initial relation families

Start with only the ones needed by real examples:

```text
INVALIDATES
MAY_CAUSE
MUST_CAUSE
ENABLES
PRODUCES_DELTA
```

`READS` and `WRITES` already exist in several domain-specific forms. Prefer deriving a
uniform causal view over those existing typed edges rather than immediately replacing all
of them with generic edges.

### Layering rule

A target-specific edge should be derivable from semantic facts when possible:

```text
AcknowledgeIncident
    WRITES
Incident.status

        ↓ derive

AcknowledgeIncident
    PRODUCES_DELTA
ΔIncident.status

        ↓ derive

AcknowledgeIncident
    INVALIDATES
ListOpenIncidents

        ↓ reactivity lowering

AcknowledgeIncident
    INVALIDATES_KEY
Incident:entity

        ↓ Effect-Atom JSX emission

invalidates: incidentKey.key
```

This preserves the existing working target while moving the semantic truth upward.

---

## 5. Derive change witnesses from the existing Type/Operation graph

The Type/Operation dialect already contains the right foundation:

```text
Type
Type --supportsOperation--> OperationDef
OperationDef --hasInputType--> Type
OperationDef --hasOutputType--> Type
OperationDef --producesPatch--> ...
OperationDef --inverse--> OperationDef
Action --appliesOperation--> OperationDef
```

Use that instead of inventing a second change hierarchy.

### Goal

From a semantic entity definition such as:

```ts
const User = entity("User", {
  name: string(),
  active: boolean(),
});
```

the compiler should be able to expose or derive stable operation/change witnesses such as:

```ts
User.ops.name.set
User.ops.active.set
User.ops.active.toggle
```

The precise public spelling can evolve. The important thing is that these are **real typed
witnesses backed by graph facts**, not convenience strings.

### Conservative derivation

Derive lawful operations from semantic type capabilities, not physical representation.

For example:

```text
boolean
  set
  toggle

counter/int with counter semantics
  set
  increment
  decrement

email
  set

money
  set by default
```

Do not infer `increment` merely because `Money` happens to lower to an integer column.

### Coarse-to-precise change facts

If an action only declares:

```text
Action WRITES Field
```

then the compiler can still derive a coarse change witness:

```text
Action PRODUCES ΔField
```

If the action is expressed using a known operation witness, it can derive a more precise
change:

```text
Action APPLIES Field.increment
Action PRODUCES ΔField(+n)
```

Precision should improve monotonically as more semantics become known.

---

## 6. Make causal contracts first-class

This is the main new piece.

The graph currently does a good job describing consequences that are derivable from known
facts. It should also be able to express consequences that are **required by the semantic
contract**.

Distinguish:

```text
A MAY_CAUSE B
```

from:

```text
A MUST_CAUSE B
```

This is the difference between an effect set and an obligation.

### Use witnesses, not names

The API should compose existing operation/action/resource witnesses directly.

Conceptually:

```ts
const AppCausality = causal(
  UpdateUser,
  PermissionsInvalidated,
  MemberListInvalidated,
)
  .requires(
    UpdateUser,
    PermissionsInvalidated,
    ({ userId }) => ({ userId }),
  )
  .requires(
    PermissionsInvalidated,
    MemberListInvalidated,
    ({ userId }) => ({ userId }),
  );
```

The mapper is type-checked from the source witness payload to the target witness payload.
No relation after declaration uses a magic string.

The graph representation should still be ordinary typed edges/predicates; the fluent API
is only an authoring surface.

### Parameterized causality

Causal contracts must refer to related instances, not only operation kinds:

```text
UserChanged(user=42)
    MUST_CAUSE
PermissionsInvalidated(user=42)
```

The payload mapping/projection is therefore part of the edge contract.

Do not model this as "every UserChanged invalidates every Permissions cache."

### Alternatives and conjunctions

The eventual algebra should be able to express at least:

```text
A must cause B
A must cause B AND C
A must cause B OR C
A must cause B IF P
```

Do not implement the full algebra before the simple `A MUST_CAUSE B` slice works.

### Naming

Avoid conflating these with the existing generated-artifact `SemanticObligation` system.
Prefer vocabulary such as:

```text
CausalContract
CausalRequirement
MustCause
Guarantee
```

unless/until the two systems are deliberately unified under a more general concept.

---

## 7. Verify implementations with an inspectable program/effect IR

A declaration that `A MUST_CAUSE B` is only valuable if the implementation can be checked.

Do not expect TypeScript's ordinary control-flow type checker to prove arbitrary async
liveness. Put the proof boundary where Dirived is already strongest: **inspectable IR**.

### Authoring surface

A generator / Effect-like implementation syntax can be ergonomic:

```ts
app.implement(IssueInvoice, function* (input) {
  const invoice = yield* Invoice.update(...);
  yield* Audit.record(...);
  yield* InvoiceIssued.emit(...);
  return invoice;
});
```

But `yield*` is not the semantic foundation. Lower it to a small program IR.

### Minimal program IR

Start with:

```text
Request(OperationWitness, Payload)
Sequence([...])
Branch(predicate, then, else)
Parallel([...])
Return(value)
```

Add `Try`, loops, cancellation, compensation, etc. only when a real target requires them.

### Compute two effect sets

For every inspectable program `P` derive:

```text
MayEffects(P)
MustEffects(P)
```

Examples:

```text
Sequence:
  May  = union(children)
  Must = union(children that necessarily execute)

Branch:
  May  = union(branch effects)
  Must = intersection(branch effects)
```

Then verify:

```text
MayEffects(implementation)
    ⊆
AllowedEffects(operation)

RequiredEffects(operation)
    ⊆
MustEffects(implementation)
```

The first rejects undeclared effects.
The second rejects implementations that can complete without satisfying a declared causal
requirement.

### Opaque implementation rule

Opaque JS remains legal, but follows this rule:

> **Opaque code is allowed. Unknown impact is not.**

An opaque implementation must declare an effect/causal footprint. Such declarations carry
lower assurance than a compiler-derived proof and should be visible in explanations.

---

## 8. Add runtime verification only where static verification stops

Some causal requirements cannot be discharged entirely in one process.

Examples:

```text
HTTP request
  → outbox write
  → queue
  → worker
  → cache invalidation
  → client refresh
```

For these, extend causal contracts with execution semantics:

```text
synchronous
transactional
eventual
within(duration)
```

Example:

```text
UserChanged
    --mustCause,eventual<5s>-->
MemberListFresh
```

### Runtime model

Generated adapters can propagate a causal/trace identifier across boundaries. A verifier
can then compare observed traces against declared contracts.

Conceptually:

```text
trace 8274

UserChanged(user=42)
    ↓
PermissionsInvalidated(user=42)
    ↓
MemberListInvalidated(team=7)
    ↓
MemberListRecomputed(team=7)
```

This should be a lowering/runtime facility, not canonical semantic truth. OpenTelemetry or
another tracing implementation may be a target; the graph should not depend on it.

### Failure semantics

Before claiming distributed causal verification is complete, model:

- retry
- idempotency
- duplicate delivery
- cancellation
- timeout
- compensation
- durable handoff

A successful durable enqueue may discharge one synchronous obligation while creating a new
eventual obligation for a downstream consumer.

---

## 9. Make targets consume the causal graph; do not let them become sources of truth

The Effect-Atom JSX target is already the first proof.

Expand by making several targets consume the **same** causal facts:

```text
semantic INVALIDATES / MUST_CAUSE
       ↓
       ├─ Effect-Atom JSX invalidation
       ├─ TanStack Query invalidation
       ├─ small generic reactive runtime
       ├─ server cache eviction
       ├─ event/queue emission
       └─ materialized-view maintenance
```

This is the test of whether the abstraction is at the right level.

If adding a target requires changing the domain authoring API, the semantic layer is still
leaking target concerns.

### Preserve precision-loss diagnostics

The current Effect-Atom target already reports when it must emit conservative family-root
invalidation. Keep this pattern.

Target legalization should say not merely "supported / unsupported," but also:

```text
exact
matched
conservative
unknown
```

with provenance explaining why precision was lost.

---

## 10. Harden `preview → verify → emit`; do not rebuild it

The previous plan said to make this workflow real. It is already partially real.

The work now is to make it the primary typed product surface:

```ts
const preview = app.preview(pipeline);

preview.semanticDiff;
preview.patches;
preview.diagnostics;
preview.repairs;
preview.explanations;
preview.artifacts;

app.verify(preview);
app.emit(preview);
```

### Add causal explanations

`app.explain(...)` should eventually answer questions like:

```text
Why does AcknowledgeIncident invalidate Incident:entity?

Because:
  AcknowledgeIncident WRITES Incident.status
  ListOpenIncidents USES canViewIncident
  canViewIncident READS Incident.status
  therefore AcknowledgeIncident INVALIDATES ListOpenIncidents
  EffectAtomJsx lowers ListOpenIncidents to Incident:entity key family
```

And:

```text
Why is this implementation invalid?

UpdateUser MUST_CAUSE PermissionsInvalidated
but one reachable return path has:

MustEffects(path) = { DatabaseWrite }

Missing:
  PermissionsInvalidated
```

That is the reactive "type error" from the essay made concrete.

---

## 11. Performance and scheduling come after semantic correctness

GraphView/memoization/shaking still matter, but they are no longer prerequisites for proving
the architecture.

Once causal derivations create larger graph workloads:

1. wire pass `reads` / `writes` / trait requirements into scheduling;
2. memoize pattern/morphism results by semantic inputs;
3. add graph shaking from explicit entrypoints;
4. incrementally invalidate compiler derivations using the same dependency ideas the
   application compiler models.

There is a pleasing eventual symmetry here:

```text
Dirived reasons about incremental application change
while Dirived itself incrementally recompiles semantic change
```

But do not let compiler-performance work delay the causal semantics slice.

---

## 12. Updated execution order

### Phase 0 — synchronize reality

- Update `PLAN.md` / `CURRENT.md` claims that still describe Pattern/Morphism/Surface work as
  unimplemented.
- Fix `runPhase()` sequential graph threading.
- Keep all existing golden tests green.

### Phase 1 — finish semantic canonicalization

- Turn remaining operation/action/reactivity duplicate fields into graph-backed projections.
- Make the Type/Operation graph the canonical operation semantic model.
- Add architecture tests preventing new parallel semantic sources of truth.

### Phase 2 — causal/change vocabulary

- Add generic causal relation witnesses.
- Derive coarse `ΔField` facts from writes.
- Derive generic semantic invalidation before key-specific invalidation.
- Preserve provenance and precision.

### Phase 3 — type-derived operation algebra

- Drive field operation witnesses from `TYPE_SUPPORTS_OPERATION` and semantic traits.
- Expose typed derived witnesses (`set`, `toggle`, `increment`, etc.) where lawful.
- Connect action bodies to precise `APPLIES_OPERATION` / `PRODUCES_DELTA` facts.

### Phase 4 — causal contracts

- Add witness-based `MAY_CAUSE` / `MUST_CAUSE` authoring.
- Add typed payload projections between source and target operations.
- Support the simple `A MUST_CAUSE B` case end-to-end first.

### Phase 5 — inspectable implementation plans

- Add minimal Plan IR.
- Lower Effect-like/generator authoring to Plan.
- Compute `MayEffects` and `MustEffects`.
- Verify allowed and required causal effects.

### Phase 6 — distributed/runtime assurance

- Add synchronous/transactional/eventual contract modes.
- Add causal IDs to generated boundary adapters.
- Verify eventual obligations in tests/dev runtime.
- Model retry/idempotency/durable handoff.

### Phase 7 — target expansion

- Rebase existing Effect-Atom lowering on the generic causal layer.
- Add another contrasting target (TanStack Query or the tiny reactive runtime).
- Ensure both consume the same semantic facts without domain API changes.

### Phase 8 — product hardening

- Typed pipeline outputs.
- Semantic diff.
- Better causal `explain`.
- Repair suggestions for missing causal edges/effects.
- GraphView/memoization/shaking when profiling justifies it.

---

## 13. The next actual milestone

Do **not** create a new Invoice proof app. Extend the existing OpsDesk golden slice.

Make this chain explicit and locked by tests:

```text
acknowledgeIncident
    ↓ WRITES
Incident.status
    ↓ derives
ΔIncident.status
    ↓ INVALIDATES
listOpenIncidents
    ↓ derives/lower
Incident:entity KeyFamily
    ↓ INVALIDATES_KEY
Effect-Atom mutation invalidation
```

Then add one causal requirement:

```text
AcknowledgeIncident
    MUST_CAUSE
IncidentListFresh
```

and one inspectable implementation that satisfies it.

The golden slice should prove all of these from one application definition:

1. typed field/write facts;
2. derived change witness;
3. generic causal invalidation;
4. existing key invalidation;
5. target emission;
6. causal explanation;
7. required-effect verification;
8. unchanged Postgres schema/RLS lowering.

That is the new thesis test.

The architecture is no longer being tested by whether Dirived can build a compiler graph.
It can.

It is being tested by whether the same graph can become the application's **schema of
change** — rich enough to derive consequences, distinguish allowed from required effects,
and reject implementations whose causal behavior violates the declared semantics.
