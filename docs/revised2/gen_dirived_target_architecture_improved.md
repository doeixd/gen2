# Gen2 / Dirived Target Architecture

> A durable architecture blueprint for the Dirived AI App Builder and the Gen2 compiler.
>
> This document supersedes the older “Ultimate Final Design” wording. The architecture is intended to be stable; implementation status and phase numbers should live in a separate roadmap document.

---

## 0. One-Sentence Thesis

**Gen2 is a typed semantic graph compiler: define application semantics once as graph facts, then derive verified implementation artifacts through passes.**

The graph is the source of truth. TypeScript is the authoring and static-witness layer. Passes are the semantic verification and derivation layer. Targets consume legalized target IR and emit artifacts.

```txt
Typed authoring API
  -> RuntimeGraph
  -> GraphIndex / GraphView
  -> Pass pipeline
  -> Legalized target dialect IR
  -> Artifacts
```

---

## 1. Executive Summary

Dirived is an AI app builder powered by Gen2. Its goal is not to ask an AI to hand-write unrelated database schemas, React components, API routes, cache invalidation logic, queue workers, deployment resources, and tests.

Instead, the AI or developer captures the app’s semantics once:

```txt
types
entities
fields
relations
operations
pure rules
actions
queries
views
events
resources
invariants
deployment requirements
```

Gen2 stores those semantics in a typed graph. From that graph, compiler passes derive:

```txt
database schemas
RLS policies
authorization checks
API routes
React/Solid components
JSON-render specs
state/resource hooks
cache invalidation
optimistic patches
rollback plans
offline queues
workers/outbox delivery
infrastructure resources
OpenAPI schemas
docs
tests
diagnostics and repair hints
```

The core idea is:

```txt
One semantic fact should be represented once.
Every target-specific artifact should be derivable from graph facts.
```

This makes the generated system explainable, diffable, verifiable, and repairable by both humans and AI agents.

---

## 2. Architectural Goals

Gen2 should optimize for the following qualities.

### 2.1 Semantic Single Source of Truth

Application meaning should not be duplicated across subsystems.

Bad:

```txt
User.email appears independently in DB schema, form validation, React props, API schema, and cache keys.
```

Good:

```txt
Field(User.email) is one graph node.
Edges and passes derive DB column, UI field, API schema, validation, docs, and tests.
```

### 2.2 Type-Safe Authoring

Developers and AI agents should author through typed witnesses, not magic strings.

```ts
edge(app.edges.writes, {
  action: ref(archiveUser),
  field: ref(User.fields.archivedAt),
});
```

The typed API should reject invalid local constructions:

```ts
edge(app.edges.writes, {
  action: ref(User.fields.email), // wrong endpoint target
  field: ref(archiveUser), // wrong endpoint target
});
```

### 2.3 Simple Runtime IR

The underlying runtime graph should remain simple, serializable, inspectable, and target-neutral.

TypeScript inference belongs at construction/query boundaries. It should not make the runtime graph generic-heavy or unserializable.

### 2.4 Graph Verification, Not Type-Level Overreach

TypeScript should prevent bad local construction. Graph passes should verify global semantics.

```txt
TypeScript checks:
  endpoint shape
  operation args
  field types
  scope names
  slot capabilities where statically available

Passes check:
  provider satisfaction
  target lowerability
  client/server leakage
  SQL compatibility
  idempotency requirements
  graph reachability
  invariant preservation
  artifact provenance
```

### 2.5 AI Repairability

Diagnostics should be structured, typed, and actionable. A diagnostic is not just a string; it is a repair protocol between compiler, developer, and AI agent.

### 2.6 Target Independence

Source dialect IR is logical. Target dialect IR is physical/legalized. Emitters consume target IR only.

```txt
domain.entity
  -> storage.record
  -> postgres.table
  -> sql artifact

ui.view
  -> ui.view_model
  -> react.component
  -> tsx artifact

queue
  -> durable_queue_plan
  -> alchemy.resource
  -> TypeScript IaC artifact
```

---

## 3. Non-Goals

These are explicit anti-goals.

```txt
Do not make Gen2 a runtime framework first.
Do not preserve old GenContext semantic arrays as final architecture.
Do not use metadata to control compiler behavior.
Do not allow target emitters to consume source dialect IR directly.
Do not use raw strings for internal semantic identity.
Do not make TypeScript the only verifier.
Do not make every high-level concept a hard kernel primitive.
Do not make the runtime graph depend on TypeScript-only types.
```

If true formal verification is needed, Gen2 should emit proof/solver targets such as SMT, Alloy, TLA+, Lean skeletons, or property-test suites.

---

## 4. Core Layering

Gen2 has four major layers.

```txt
1. Typed Authoring Layer
   Ergonomic TypeScript APIs, witnesses, builders, .class forms, graph steps.

2. Runtime Graph IR
   Simple graph data: nodes, edges, types, traits, refs, locations, artifacts.

3. Compiler Layer
   Indexes, views, passes, diagnostics, verification, derivation, legalization.

4. Target Layer
   Target dialects, lowerings, emitters, artifacts, source maps.
```

### 4.1 TypeScript Graph Witness

With faster TypeScript compilers, Gen2 can afford a richer TypeScript-facing graph witness layer.

```txt
RuntimeGraph
  serialized, indexed, target-neutral source of truth

GraphWitness<T>
  erased TypeScript type view of graph facts for local static checking

GraphIndex
  runtime traversal acceleration

GraphView
  pass-local or dialect-local materialized views
```

The witness layer should improve authoring feedback, but it must not replace runtime graph verification.

Example:

```ts
const graph = kernel.graph.pipe(User, canArchiveUser, archiveUser);

type AppGraph = GraphWitnessOf<typeof graph>;
```

The witness can know `archiveUser` writes `User.fields.archivedAt`, but global target safety still belongs to passes.

---

## 5. The Hard Kernel

The hard kernel is intentionally small.

Gen2’s semantic ontology is only:

```txt
Node
Edge
Trait
```

Everything meaningful in an application is represented with those three concepts. A `Type` is a node. An `Expr` is a node. An `Action` is a node. A `FieldHasType` fact is an edge. A `serverOnly` or `patchable` claim is a trait.

The kernel still needs infrastructure around that ontology: identity, references, symbols, graph storage, provenance, pass execution, and diagnostic emission. Those are compiler mechanisms, not application semantics.

So the model is layered:

```txt
Layer 0 — Kernel infrastructure
  Id
  Ref
  SymbolDef
  Graph
  Location
  Metadata
  Pass runtime
  Diagnostic runtime

Layer 1 — Semantic graph ontology
  Node
  Edge
  Trait

Layer 2 — Standard dialects
  Type
  Expr
  Transform
  Operation
  Rule
  Entity
  Action
  Query
  UI
  Dispatch
  Dataflow
  Artifact
  Invariant
```

The practical rule:

```txt
The runtime graph stays simple.
The typed authoring layer stays rich.
Everything semantic lowers to nodes, edges, and traits.
Everything domain-specific lives in dialects.
```

---

### 5.1 Kernel Infrastructure vs. Semantic Ontology

The kernel contains both compiler infrastructure and graph ontology. These should not be confused.

| Concept              | Layer          | Purpose                                     | Design Notes                                                                                                                                     |
| -------------------- | -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Id` / `Ref`         | Infrastructure | Stable identity and typed semantic pointers | Survive renames; used by edges, diagnostics, artifacts, agents, migrations, and source maps.                                                     |
| `SymbolDef`          | Infrastructure | Typed semantic vocabulary definitions       | Replaces raw strings for node kinds, edge kinds, endpoint roles, traits, protocols, pass kinds, and artifact kinds.                              |
| `Graph`              | Infrastructure | Runtime semantic fact store                 | The source of truth. Stores nodes, edges, trait applications, diagnostics, artifacts, and indexes/views.                                         |
| `Location`           | Infrastructure | Source/provenance location                  | Source file span, prompt span, generated region, graph location, artifact range, runtime/deployment location.                                    |
| `Metadata`           | Infrastructure | Passive JSON annotation                     | Descriptions, labels, docs, display hints. Never compiler behavior.                                                                              |
| `Pass runtime`       | Infrastructure | Executes compiler transformations           | Runs verify, derive, canonicalize, legalize, lower, and emit passes. Pass definitions may be graph-visible, but execution is infrastructure.     |
| `Diagnostic runtime` | Infrastructure | Emits typed findings                        | Provides the channel for errors, warnings, hints, remediation, locations, and AI repair signals.                                                 |
| `Node`               | Ontology       | Semantic object                             | Entity, field, action, rule, view, provider, artifact, queue, diagnostic definition, invariant, pass definition.                                 |
| `Edge`               | Ontology       | Semantic relationship                       | Typed endpoints, endpoint roles, direction, metadata, provenance. Represents facts such as owns-field, reads, writes, invalidates, triggered-by. |
| `Trait`              | Ontology       | Checked semantic claim                      | Pure, server-only, patchable, SQL-lowerable, entrypoint, idempotent, associative, durable, replayable.                                           |

---

### 5.2 Standard Dialects

Types, expressions, transforms, operations, diagnostics, artifacts, and invariants are important enough to ship with Gen2, but they are not separate sources of truth. They are **standard dialects over the graph ontology**.

| Standard dialect concept | Represented as                   | Purpose                         | Design Notes                                                                                               |
| ------------------------ | -------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Type`                   | Nodes + edges + traits           | Semantic value shape            | Carries decoded/encoded shape, decode requirements, encode requirements, traits, and transforms.           |
| `Transform`              | Nodes + edges + traits           | Typed conversion                | Codec/wire/storage transforms with laws, diagnostics, and expression-backed encode/decode bodies.          |
| `Expr`                   | Nodes + edges + traits           | Inspectable computation         | Operation-backed expression tree for validation, predicates, rules, projections, patches, and lowerings.   |
| `Operation`              | Nodes + edges + traits/protocols | Semantic operation definition   | Inputs, outputs, laws, patch/inverse/delta/lowering protocols, operation uses.                             |
| `Rule`                   | Nodes + edges + traits           | Named boolean expression        | Pure business predicate used by auth, UI state, reactivity, RLS, validation, docs, and tests.              |
| `Entity`                 | Nodes + edges + traits           | Domain object                   | Owns fields, relations, invariants, policies, storage mappings, views.                                     |
| `Action`                 | Nodes + edges + traits/protocols | Callable write/effect boundary  | Applies operations, writes fields, emits events, invalidates keys, uses guards, may have optimistic plans. |
| `Query`                  | Nodes + edges + traits/protocols | Callable read boundary          | Reads fields/rules/resources, returns typed values, owns stable keys, lowers to target query forms.        |
| `UI`                     | Nodes + edges + traits           | Semantic interface model        | Views, slots, components, styles, behaviors, forms, design systems, JSON-render specs.                     |
| `Dispatch`               | Nodes + edges + traits/protocols | Trigger-to-handler execution    | Events, reactions, subscriptions, reducers, delivery plans, idempotency, outbox.                           |
| `Dataflow`               | Nodes + edges + traits/protocols | Multi-value and async semantics | Collections, streams, queues, mailboxes, resources, result states, backpressure, replay.                   |
| `Artifact`               | Nodes + edges + traits           | Emitted target output           | Files, JSON specs, SQL, TSX, IaC, docs, tests, source maps, generated-from provenance.                     |
| `Invariant`              | Nodes + edges + traits           | Must-hold contract              | Predicate, subject, enforcement surfaces, diagnostics, target lowerings, runtime violation shape.          |

These dialects should expose excellent builder APIs, but their output is still graph facts.

Example:

```ts
const User = domain.entity("User")({
  fields: {
    id: field(t.uuid),
    email: field(t.email),
  },
});
```

lowers to graph facts like:

```txt
Node(Entity): User
Node(Field): User.id
Node(Field): User.email
Edge(OwnsField): User -> User.id
Edge(OwnsField): User -> User.email
Edge(FieldHasType): User.id -> uuid
Edge(FieldHasType): User.email -> email
```

---

### 5.3 Protocols

A trait is a claim.

A protocol is a structured contract that passes can use.

```txt
Trait:
  This operation is patchable.

Protocol:
  Here is how to produce, apply, and invert its patch.
```

Protocols should remain distinct from traits in the implementation, even though protocol definitions may be represented as graph-visible symbols.

Examples:

```txt
CallableProtocol
  input type
  output type
  error type
  requirements

ReadableProtocol
  read dependencies
  key derivation
  query body

WritableProtocol
  write dependencies
  applied operations
  effects

PatchProtocol
  produce patch
  invert patch
  apply patch

LoweringProtocol
  lower to a target dialect
```

Design rule:

```txt
Use traits for semantic claims.
Use protocols for pass-facing behavior.
Use edges for concrete relationships.
```

---

### 5.4 Kernel Rule

If a concept can be represented as a node, edge, trait, protocol, type dialect object, expression dialect object, transform dialect object, pass definition, diagnostic definition, or artifact node, it should not become a new hard kernel primitive.

These are dialect concepts, not hard kernel primitives:

```txt
Entity
Field
Relation
Action
Query
Rule
Policy
Claim
Provider
Context
View
Component
Slot
Behavior
Style
Queue
Stream
Mailbox
Event
Reaction
Dispatch
StateMachine
Invariant
Workflow
Resource
Mutation
Outbox
StorageTable
Route
DeploymentResource
```

The hard kernel must not grow every time Gen2 learns a new application concept. New concepts should enter through dialects.

---

### 5.5 Authoring APIs Are Not Kernel Primitives

A public constructor is not a kernel primitive.

These are ergonomic facades:

```txt
object form
builder form
curried form
callback ctx form
.class form
pipe / graph-step form
```

They all normalize to one canonical graph representation.

For example, all of these should produce the same semantic action definition:

```ts
app.action("archiveUser")({
  input: { actor: User, user: User },
  guard: canArchiveUser,
  writes: [User.fields.archivedAt],
});
```

```ts
app.action("archiveUser")((ctx, action) =>
  action.input({ actor: User, user: User }).guard(canArchiveUser).writes(User.fields.archivedAt),
);
```

```ts
class ArchiveUser extends app.action.class("archiveUser", {
  input: { actor: User, user: User },
  guard: canArchiveUser,
  writes: [User.fields.archivedAt],
}) {}
```

All lower to:

```txt
Node(Action): archiveUser
Edge(ActionInput): archiveUser -> input type
Edge(GuardedBy): archiveUser -> canArchiveUser
Edge(Writes): archiveUser -> User.archivedAt
```

The API can be rich. The IR must stay simple.

---

### 5.6 TypeScript Witness Layer

Gen2 should use TypeScript aggressively at construction and query boundaries, but not make the runtime graph a giant type-level object.

The design has two parallel outputs:

```txt
RuntimeGraph
  Simple, serializable graph data.

GraphWitness
  Erased TypeScript type view used for editor feedback and local static checking.
```

TypeScript should catch local construction mistakes:

```txt
wrong edge endpoint
wrong operation argument
wrong trait target
wrong artifact metadata
wrong UI slot capability
unknown scope binding
invalid action input
```

Graph passes should catch global semantic problems:

```txt
missing provider
client/server leakage
non-lowerable rule
unsafe retry without idempotency
invariant not enforced
target capability mismatch
migration conflict
unhandled diagnostic/failure surface
```

Formal verification, if needed, should be a target or pass family:

```txt
Graph -> SMT / Alloy / TLA+ / Lean / property tests
```

TypeScript is a powerful static witness layer. It is not the whole proof system.

---

### 5.7 Non-Goals for the Hard Kernel

Do not add hard kernel primitives for domain-specific concepts.

Do not make the runtime graph generic-heavy.

Do not encode whole-application correctness purely in TypeScript types.

Do not use metadata to control compiler behavior.

Do not use raw strings for internal semantic identity.

Do not make target emitters consume high-level source dialect IR directly.

Do not create separate registries for things that can live in the graph.

Do not implement multiple constructor forms as separate semantic systems.

The hard kernel should remain boring, stable, and small. Its job is to make every dialect composable, inspectable, traversable, diagnosable, and lowerable.

---

## 6. Refs, Symbols, Traits, and Protocols

### 6.1 Refs

Refs are stable semantic pointers.

```ts
ref(User);
ref(User.fields.email);
ref(archiveUser);
ref(canArchiveUser);
```

Refs are used by:

```txt
edges
diagnostics
source maps
artifacts
AI edits
graph diffs
migrations
runtime decode/refinement
```

Names may change; stable IDs should not.

### 6.2 Symbols

Internal semantics use typed symbols, not raw strings.

```ts
graph.edges.ofKind(app.edges.writes);
```

Dynamic string APIs are allowed only at decode/refinement boundaries:

```ts
graph.edges.ofKindId("app.edge.writes");
```

### 6.3 Traits

Traits are semantic claims.

Examples:

```txt
ExprPure
ExprSqlLowerable
OperationPatchable
OperationInvertible
RuleClientSafe
QueueDurable
UiInteractive
EntrypointTrait
```

Traits may declare:

```txt
target kinds
payload schema
implied traits
conflicting traits
required traits
```

### 6.4 Protocols

Traits say what is true. Protocols expose how passes can use it.

```txt
Trait:
  OperationPatchable

Protocol:
  PatchProtocol
    producePatch(operationUse)
    invertPatch(patch)
    applyPatch(resource)
```

This distinction keeps generic passes from relying on ad hoc metadata.

---

## 7. Graph Model

### 7.1 Graph Facts

A graph fact is usually one of:

```txt
Node
Edge
Trait application
Protocol implementation
Type definition
Expression
Transform
Diagnostic finding
Artifact provenance
```

Examples:

```txt
Node(Entity): User
Node(Field): User.email
Edge(OwnsField): User -> User.email
Edge(FieldHasType): User.email -> Email
Trait(FieldUnique): User.email
```

```txt
Node(Action): archiveUser
Edge(ActionWrites): archiveUser -> User.archivedAt
Edge(ActionGuardedBy): archiveUser -> canArchiveUser
Edge(ActionEmits): archiveUser -> UserArchived
```

### 7.2 Hyperedges with Named Endpoints

Edges are first-class objects with typed named endpoints.

```ts
edge(app.edges.writes, {
  action: ref(archiveUser),
  field: ref(User.fields.archivedAt),
});
```

Endpoint definitions carry:

```txt
name
target kind
role/direction
metadata schema
cardinality if needed
```

Do not infer direction from endpoint names. Direction belongs in the endpoint definition.

### 7.3 Logical vs Physical IR

Source dialect IR should remain logical until legalization/lowering.

```txt
Logical:
  User entity owns email field

Physical:
  postgres table users has column email
```

Targets must consume physical/legalized target dialect IR.

---

## 8. Graph Performance Architecture

A graph compiler will run many passes repeatedly. Traversal cannot be scan-first.

### 8.1 Three-Layer Graph

```txt
GraphStore
  canonical immutable-ish storage

GraphIndex
  incrementally maintained indexes for hot traversal

GraphView
  pass-local or dialect-local materialized views
```

### 8.2 Required Indexes

Minimum hot indexes:

```txt
nodesByKind
nodesByTrait
nodesByProtocol
edgesByKind
edgesByTrait
incidentEdgesByRef
outgoingByRef
incomingByRef
outgoingByKind
incomingByKind
edgesByKindAndEndpoint
traitClosureByObject
```

`edgesByKindAndEndpoint` is critical for hyperedge traversal:

```txt
edge kind -> endpoint role -> target ref -> edge ids
```

### 8.3 Traversal API

Public traversal should be witness-first and compile to index probes.

```ts
graph.nodes.ofKind(domain.nodes.entity);

graph.edges.ofKind(app.edges.writes).whereEndpoint("action", archiveUser.ref).targets("field");

graph.from(archiveUser).via(app.edges.writes).targets("field");
```

Compiler passes should prefer role-aware traversal over generic neighborhood walking.

### 8.4 Graph Views

Dialect views provide optimized semantic query surfaces.

```ts
const domain = graph.view(domainView);

domain.entities();
domain.fieldsOf(User);
domain.typeOfField(User.fields.email);
```

Passes should declare the views they read.

```ts
const deriveInvalidation = definePass({
  reads: {
    edges: [callable.edges.queryReads, callable.edges.actionWrites],
    views: [reactivityViews.readWriteIndex],
  },
  writes: {
    edges: [reactivity.edges.invalidatesKey],
  },
  run(ctx) {
    const rw = ctx.view(reactivityViews.readWriteIndex);
  },
});
```

### 8.5 Mutation Strategy

Public graph composition should look immutable. Internally, bulk writers may mutate and update indexes.

```ts
const graph = kernel.graph.build((w) => {
  w.add(User);
  w.add(archiveUser);
  w.edge(app.edges.writes, {
    action: archiveUser,
    field: User.fields.archivedAt,
  });
});
```

The writer updates canonical storage and indexes, then freezes a snapshot.

---

## 9. Dialect Architecture

Dialects are typed vocabulary modules. They contribute node kinds, edge kinds, traits, protocols, passes, lowerings, artifact kinds, and authoring builders.

### 9.1 Major Dialects

| Dialect      | Responsibility                                                                       |
| ------------ | ------------------------------------------------------------------------------------ |
| `core`       | Placement, context, provider/requirement, ownership, claims, capability, provenance. |
| `domain`     | Entities, fields, relations, aggregate structure.                                    |
| `operation`  | Operation definitions, laws, patch/inverse/delta/lowering protocols.                 |
| `expr`       | Operation-backed expression trees.                                                   |
| `rule`       | Named pure boolean expressions with business meaning.                                |
| `callable`   | Queries, actions, workflows, patches, plans.                                         |
| `dispatch`   | Events, triggers, handlers, delivery, idempotency, outbox.                           |
| `effect`     | Effect footprints and runtime capability requirements.                               |
| `reactivity` | Keys, resources, mutations, invalidations, tracking scopes.                          |
| `dataflow`   | Collections, streams, queues, mailboxes, async/resource states.                      |
| `ui`         | Views, slots, components, behaviors, styles, design systems.                         |
| `storage`    | Records, tables, columns, indexes, storage mappings.                                 |
| `variant`    | Enums, tagged unions, variants, state machines.                                      |
| `diagnostic` | Diagnostic definitions, findings, emitted-by/points-to relationships.                |
| `invariant`  | Invariant families, instances, enforcement/lowering strategies.                      |

`operation`, `expr`, and `rule` may live under one source package if convenient, but they should remain conceptually distinct.

### 9.2 Dialect Imports

Dialects may import symbols from other dialects explicitly.

```ts
const app = defineDialect("app")((d) => {
  const field = d.import(domain.nodes.field);

  const writes = d.edgeKind("writes", {
    endpoints: {
      action: d.endpoint("action").target(app.nodes.action).source(),
      field: d.endpoint("field").target(field).target(),
    },
  });

  return { imports: [domain], edges: { writes } };
});
```

### 9.3 Kernel Registration

A kernel captures registered dialects.

```ts
const kernel = createKernel({
  dialects: { core, domain, app, ui, postgres },
});
```

Graph steps requiring unregistered dialects should fail statically where possible and diagnostically at runtime when dynamic/plugin data is involved.

---

## 10. Authoring API

### 10.1 One Canonical Shape

Object, builder, curried, callback, `.class`, and pipe forms are facades. They must normalize to one canonical definition and one graph-fragment lowering.

```txt
many authoring shapes
  -> one typed witness
  -> one graph fragment
  -> one runtime IR shape
```

### 10.2 Constructor Facades

| Constructor kind     | Object | Builder | Curried | Callback ctx |   `.class` |   Pipe/fragment |
| -------------------- | -----: | ------: | ------: | -----------: | ---------: | --------------: |
| `defineDialect`      |    yes |     yes |     yes |          yes |      maybe | registry/direct |
| `defineType`         |    yes |     yes |   maybe |       rarely |         no |           maybe |
| `defineTrait`        |    yes |   maybe |      no |           no |         no |           maybe |
| `defineLaw`          |    yes |   maybe |      no |           no |         no |     via `claim` |
| `defineOperation`    |    yes |     yes |     yes |        maybe |      maybe |             yes |
| `defineEntity`       |    yes |     yes |     yes |          yes | strong yes |             yes |
| `defineRule`         |    yes |     yes |     yes |          yes |      maybe |             yes |
| `defineAction`       |    yes |     yes |     yes |          yes |      maybe |             yes |
| `defineQuery`        |    yes |     yes |     yes |          yes |      maybe |             yes |
| `defineEvent`        |    yes |     yes |     yes |        maybe |       good |             yes |
| `defineDispatch`     |    yes |     yes |     yes |          yes |      maybe |             yes |
| `defineView`         |    yes |     yes |     yes |          yes |       good |             yes |
| `defineArtifactKind` |    yes |     yes |     yes |          yes |      maybe |              no |
| `emit`               |    yes |   maybe |      no |        maybe |         no |             yes |
| `edge`               |    yes |      no |      no |           no |         no |             yes |
| `pass`               | object |      no |   maybe |          yes |      maybe |             yes |

### 10.3 Entity `.class` Form

Entity classes are a primary ergonomic form because the object literal is a clean inference site and the class becomes the exported witness.

```ts
class User extends domain.entity.class("User", {
  fields: {
    id: field(t.uuid).primary(),
    email: field(t.email).unique(),
    archivedAt: field(t.optional(t.datetime)),
  },
}) {}
```

`User` should expose:

```txt
User.ref
User.type
User.fields.id
User.fields.email
User.fragment
```

Use class inheritance carefully. TypeScript class inheritance should not silently imply semantic inheritance unless explicitly modeled as graph facts.

### 10.4 Callback Builder Form

Callback builders are preferred for rules, actions, and queries because they provide a typed contextual world.

```ts
const archiveUser = app.action("archiveUser")((ctx, action) =>
  action
    .input({ actor: User, user: User })
    .guard(canArchiveUser)
    .writes(User.fields.archivedAt, {
      operation: "set",
      reversible: true,
    })
    .body((body) =>
      body.pipe(op.set(ctx.input.user.archivedAt, expr.now()), op.emit(UserArchived)),
    ),
);
```

### 10.5 Pipe Form

Everything composable should be a graph step or fragment.

```ts
const graph = kernel.graph.pipe(
  User,
  canArchiveUser,
  archiveUser,
  UserListView,
  pass(app.passes.checkGuards),
  pass(app.passes.deriveOptimisticUpdates),
);
```

### 10.6 TypeScript Budget

Use TypeScript aggressively for local construction correctness, but keep public types readable.

Guidelines:

```txt
Use const generics for literal preservation.
Use Compute<T> at public boundaries.
Use NoInfer<T> to prevent accidental back-inference.
Keep RuntimeGraph broad and simple.
Avoid proving global graph properties in TypeScript types.
Use generated .d.ts witnesses when useful.
```

---

## 11. Type, Transform, Operation, Expr, and Rule

### 11.1 Type Model

Types should preserve decoded and encoded value information.

```ts
const t = defineTypeSystem("core.types")({
  string: scalar("string").decoded<string>(),
  uuid: scalar("uuid").decoded<Uuid>(),
  email: scalar("email").decoded<Email>().encoded<string>(),
  datetime: scalar("datetime").decoded<Date>().encoded<string>(),
});
```

Conceptual shape:

```txt
GType<Decoded, Encoded, DecodeR, EncodeR, Traits>
```

This supports:

```txt
wire encoding
storage encoding
Effect Schema interop
OpenAPI/JSON schema generation
runtime validation
client/server boundary checks
```

### 11.2 Transforms

Transforms are typed conversions between representations.

```ts
const EmailCodec = transform.codec("EmailCodec")({
  decoded: t.email,
  encoded: t.string,
  encode: expr.fn((email) => email.toString()),
  decode: expr.fn((raw) => email.parse(raw)),
  laws: [laws.roundTrip],
});
```

Transforms should have stable IDs, typed errors, traits/laws, source locations, and target lowerings. Avoid `Date.now()` IDs or string code bodies as semantics.

### 11.3 Operations

Operations are nodes. Operation facts are edges. Laws are traits. Protocols expose behavior.

```ts
const SetField = operation.define("SetField")({
  args: [operation.fieldArg(), operation.valueArg()] as const,
  output: t.unit,
  traits: [operation.traits.deterministic, operation.traits.patchable],
  protocols: [PatchProtocol, PredicateAffectProtocol],
});
```

Important operation edges:

```txt
OperationAcceptsType
OperationReturnsType
TypeSupportsOperation
OperationReads
OperationWrites
OperationProducesPatch
OperationInverse
OperationLowersTo
ActionAppliesOperation
ExprUsesOperation
```

### 11.4 Laws

Laws are typed traits, sometimes with witnesses.

```txt
LawAssociative
LawCommutative
LawIdempotent
LawIdentity { identity: Expr }
LawInverse { inverse: OperationRef }
LawMonotonic
LawRollbackSafe
```

A law claim is not the same as a proof. The system should track assurance:

```txt
asserted
tested
proved
trusted-target
```

### 11.5 Expressions

Expressions are typed, inspectable operation-use trees.

```ts
expr.call(Eq, user.role, expr.literal(Role.Admin));
```

Expressions derive traits and dependencies from their operations and refs.

```txt
ExprPure
ExprDeterministic
ExprSqlLowerable
ExprClientSafe
ExprReadsField
ExprRequiresProvider
```

Opaque expressions must declare their blast radius.

```ts
expr.opaque("serverRiskCheck", {
  output: t.boolean,
  placement: placement.serverOnly,
  refs: [User.fields.id],
  conservativeReads: [User],
});
```

### 11.6 Rules

Rules are named pure boolean expressions with business meaning.

```ts
const canArchiveUser = app.rule("canArchiveUser")((ctx, rule) =>
  rule
    .vars({ actor: User, user: User })
    .when(({ actor, user }) =>
      expr.and(expr.eq(actor.role, "admin"), expr.isNull(user.archivedAt)),
    ),
);
```

Rules drive:

```txt
authz
server guards
SQL/RLS predicates
UI disabled/hidden state
form validation
reactivity dependencies
IVM
sync planning
docs/tests
```

Rules must remain pure. Effects belong to actions/dispatch, not rules.

---

## 12. Domain and Callable Dialects

### 12.1 Domain

Domain concepts:

```txt
Entity
Field
Relation
Aggregate
```

Facts:

```txt
Entity owns Field
Field has Type
Relation connects endpoint entities
Field/Relation has integrity traits
```

Relations may be edges or relation nodes depending on whether they need identity/payload.

### 12.2 Callable

Callable nodes are codegen-facing runtime boundaries.

```txt
ExprFunction
Rule
Query
Action
Mutation
PatchFunction
PlanFunction
Workflow
```

Important split:

```txt
Expr
  pure inspectable logic

Query
  callable read boundary

Action
  callable write/effect boundary

Mutation
  reactive wrapper around Action
```

A target emitter should mostly consume callable nodes plus their graph facts.

```txt
Query -> loader/RPC/resource hook/SQL select
Action -> server action/API route/mutation endpoint/queue job
Rule -> guard/RLS/UI hint
Mutation -> client mutation wrapper + optimistic behavior
```

---

## 13. Dispatch, Effects, Events, Queues

### 13.1 Effects

An effect is an execution footprint/capability requirement.

```txt
db.write
email.send
queue.enqueue
network.request
state.write
cookie.write
analytics.track
```

Effects are facts about execution, not execution plans.

### 13.2 Events

An event is a typed semantic fact that happened.

```ts
const UserArchived = app.event("UserArchived")({
  payload: t.object({ userId: User.fields.id.type }),
});
```

Event emission is graph-native:

```txt
Action emits Event
Event has PayloadType
Event serializedAs MessageEnvelope
```

### 13.3 Dispatch

Dispatch is the canonical trigger-to-handler plan.

```txt
Trigger -> select/project -> Handler -> Delivery -> Idempotency -> Outbox/Queue
```

Reactions, subscriptions, reducers, timer jobs, webhook handlers, and queue consumers are public facades over dispatch graph patterns.

```ts
const sendEmailWhenArchived = app.dispatch("sendEmailWhenArchived")({
  trigger: UserArchived,
  run: sendArchiveEmail,
  delivery: delivery.outbox({ guarantee: "at_least_once" }),
  idempotency: idempotency.eventId(),
});
```

### 13.4 Delivery and Idempotency

Keep two concepts distinct:

```txt
LawIdempotent
  semantic property of an operation/action

IdempotencyPlan
  runtime delivery safety mechanism
```

Passes verify:

```txt
at-least-once delivery requires idempotency
side-effecting dispatch needs safe delivery
outbox storage must be persistent
effect must be supported by placement
handler input must match trigger payload
```

---

## 14. Reactivity, Sync, and Optimistic Updates

Gen2 owns sync semantics. Runtime adapters execute sync machinery.

```txt
Gen2 owns:
  what changed
  what queries are affected
  whether patch/rollback is safe
  what conflict policy applies
  what data is client-safe

Adapters own:
  local DB
  transport
  retry
  persistence
  streaming implementation
```

### 14.1 Read/Write Derivation

Core facts:

```txt
Query reads Field
Action writes Field
Action applies Operation
Query has KeyFamily
Operation has patch/inverse laws
Rule predicate reads Field
```

From these, Gen2 derives:

```txt
cache invalidation
optimistic patch
rollback plan
resource refresh
live query subscription
IVM plan
```

### 14.2 Manual Reactivity Remains

Manual keys and edges remain essential for opaque/external systems.

```txt
explicit
  user-declared dependency

derived
  compiler-proved dependency

conservative
  safe fallback approximation

target
  target-required dependency
```

All should be graph facts with provenance.

### 14.3 Runtime Adapters

Gen2 may lower to:

```txt
TanStack Query
TanStack DB
PowerSync
Electric
Effect Atom
custom Gen2 runtime
```

Those are implementation targets, not sources of truth.

---

## 15. Dataflow and Async Dialect Family

Gen2 needs a shared vocabulary for cardinality, time, delivery, lifecycle, and materialization.

### 15.1 Type Families

```txt
Single<T>
Optional<T>
Result<T, E>
Exit<T, E, Defect>
ResourceState<T, E, Defect>
List<T>
Set<T>
Map<K, V>
Page<T, Cursor>
Stream<T, E, R, Eff>
Queue<T>
Mailbox<T, Address>
Topic<T>
```

### 15.2 ResourceState

Recommended normalized shape:

```txt
initial
loading
success
failure
defect
```

with flags:

```txt
stale
refreshing
optimistic
```

### 15.3 Streams

A stream is a node with temporal semantics. Publish/subscribe are edges.

```txt
Stream = node
PublishesTo = edge
SubscribesTo = edge
```

Streams carry:

```txt
value type
error type
requirements
effects
scope/lifetime
hot/cold
ordering
replay/checkpoint
backpressure
placement
materialization
```

### 15.4 Queues and Mailboxes

A queue is a durable or ephemeral stream with delivery semantics.

```txt
Queue<T>
  Stream<T>
  + persistence
  + ack/nack
  + retry
  + ordering
  + idempotency
  + dead-letter
  + drain trigger
```

A mailbox is a queue with owner/address semantics.

---

## 16. UI Dialect

UI is a semantic dialect, not a React framework.

### 16.1 Canonical UI Graph

```txt
View
Slot
Element
CatalogComponent
Component
Behavior
Style
DesignSystem
Token
Widget
Form
StateBinding
```

Edges:

```txt
ViewExposesSlot
ViewContainsElement
ElementUsesCatalogComponent
ComponentReturnsView
ComponentAcceptsProps
SlotHasCapability
BehaviorRequiresSlotCapability
BehaviorAttachesToSlot
BehaviorHandlesEvent
BehaviorRunsAction
StyleAttachesToSlot
SlotBindsState
FormSubmitsAction
FieldRendersAsWidget
ViewUsesDesignSystem
```

### 16.2 AF-UI as Authoring Pattern

AF-UI is the strict authoring style:

```txt
inside-out composition
slots
behaviors
styles
capabilities as traits
requirement bubbling
```

Use typed slot refs, not slot-name strings, in typed APIs.

```ts
ui.attachBehavior(closeBehavior, {
  closeTrigger: ModalView.slots.closeBtn,
});
```

### 16.3 JSON-Render as Target/Import Format

JSON-Render emits:

```txt
Catalog
  available components, props schemas, slots, events, capabilities

Spec
  view tree, state bindings, action bindings, style token refs
```

AI UI loop:

```txt
1. Emit catalog.
2. AI generates JSON spec.
3. Import spec into UI graph.
4. Run verification passes.
5. Emit runtime UI only if legal.
```

This prevents hallucinated React props and unsafe behavior attachment.

---

## 17. Diagnostics and Invariants

Diagnostics are first-class. Invariants use diagnostics, but diagnostics are not owned only by invariants.

### 17.1 Diagnostic Model

```txt
DiagnosticDefinition
  reusable typed diagnostic schema

DiagnosticFinding
  concrete compiler/runtime occurrence

DiagnosticEmitter
  pass, invariant, lowering, target, runtime check, AI import, test
```

A finding should carry:

```txt
code
severity
blocking behavior
params
primary location
related locations
audience-specific messages
metadata
remediation
possible fixes
trace/provenance
```

### 17.2 Invariant Model

```txt
Rule
  boolean meaning

Invariant
  must-hold contract + enforcement + diagnostics

InvariantFamily
  reusable generic invariant constructor

InvariantInstance
  concrete application

Violation
  diagnostic/failure occurrence
```

Example families:

```txt
RequiredField
UniqueField
TransitionAllowed
AtLeastOnceRequiresIdempotency
ClientBoundaryNoSensitiveFields
QueueRequiresDurableStorage
```

### 17.3 AI Repair

Diagnostics should include machine-readable remediation.

```txt
Diagnostic:
  DISPATCH_AT_LEAST_ONCE_REQUIRES_IDEMPOTENCY

Possible fix:
  add idempotency.eventId()
```

This is how compiler diagnostics become AI repair instructions.

---

## 18. Storage, Deployment, and Target IR

### 18.1 Storage

Domain IR lowers into storage IR before target-specific emit.

```txt
Entity -> StorageRecord
Field -> StorageColumn
Relation -> ForeignKey / JoinTable
Rule -> StoragePredicate
Policy -> RLS policy candidate
```

### 18.2 Deployment as Graph Facts

Infrastructure requirements are graph facts.

```txt
Action has Effect(email.send)
Queue requires durable storage
Stream requires replayable storage
Dispatch requires outbox
Provider requires secret
```

The Alchemy target lowers these facts into TypeScript IaC.

### 18.3 Target Capabilities

Targets expose capability nodes/traits.

```txt
CapabilitySql
CapabilityRls
CapabilityTransactions
CapabilityJsonb
CapabilityReactComponents
CapabilityEffectRuntime
CapabilityDurableQueue
CapabilitySecrets
```

Legalization checks source requirements against target capabilities.

---

## 19. Pass Pipelines

Passes replace checkers, derivers, lowerers, and emitters.

### 19.1 Standard Phases

```txt
verify-symbols
verify-dialects
verify-graph
derive
canonicalize
legalize
lower
emit
```

### 19.2 Common Pipelines

```txt
gen2-check
gen2-postgres
gen2-effect
gen2-react
gen2-solid
gen2-json-render
gen2-openapi
gen2-alchemy
gen2-docs
gen2-tests
gen2-devtools
```

### 19.3 Pass Contract

Passes should declare:

```txt
id
phase
dialect
reads
writes
required traits/protocols
required views
invalidates views
produced diagnostics
```

Pass outputs must be graph facts, diagnostics, or artifacts.

### 19.4 Memoization

Use semantic hashing and delta-aware invalidation.

```txt
pass cache key = pass id + target + semantic hash of read subgraph
```

---

## 20. Textual IR, Diffing, and Migrations

### 20.1 Textual IR

Gen2 should provide a stable textual IR for humans and AI agents.

Goals:

```txt
readable
diffable
round-trippable enough for tests
location-aware
stable ordering
```

### 20.2 Graph Diffs

Migrations should be derived from semantic graph diffs.

```txt
Graph(vOld) -> Graph(vNew)
  -> storage diff
  -> migration plan
  -> target-specific migration artifacts
```

Diffs should compare semantic refs, not unstable names.

### 20.3 Artifact Provenance

Artifacts must trace back to graph facts.

```txt
Artifact -> generatedFrom -> View/Action/Rule/Entity
Artifact -> generatedBy -> Pass
Artifact source map -> graph refs + source locations
```

---

## 21. Formal Verification Story

TypeScript does not provide full formal verification. It provides static construction checking.

Gen2’s verification stack should be layered:

```txt
TypeScript authoring checks
  local construction correctness

Graph verification passes
  global semantic correctness

Target legalization
  target-specific validity

Runtime validation
  dynamic/imported data safety

Optional proof/solver targets
  stronger formal claims
```

Potential proof targets:

```txt
SMT/Z3
Alloy
TLA+
Lean theorem skeletons
property-based tests
model-checking finite state machines
```

Use TypeScript as a powerful witness layer, not as the only proof engine.

---

## 22. Dynamic and Plugin Boundaries

Typed APIs accept witnesses. Dynamic APIs accept strings and decode/refine into witnesses.

```ts
const loaded = kernel.decodeGraph(json);

if (loaded.ok) {
  const maybeWrites = loaded.graph.edge(edgeId).as(app.edges.writes);
}
```

Plugin-loaded graphs must be verified before use.

Plugins may contribute:

```txt
dialects
node kinds
edge kinds
traits
protocols
type kinds
expr kinds
operation families
passes
lowerings
target emitters
builder namespaces
```

Plugins must not mutate global registries outside the provided plugin context.

---

## 23. Implementation Guidance

### 23.1 Migration Boundary

Legacy arrays may exist only as migration shims or computed views.

They must not be:

```txt
source of truth
written by new APIs
read by new target emitters
used by new passes
```

### 23.2 Recommended Implementation Order

```txt
1. Indexed graph store and witness-first traversal.
2. Graph writer/build/pipe APIs.
3. Typed dialect definitions and registry.
4. Operation/expr/rule core.
5. Domain entities/fields/relations.
6. Callable queries/actions/mutations.
7. Pass pipeline infrastructure.
8. Diagnostics/invariants.
9. Reactivity/sync derivation.
10. Dispatch/effect/events/queues.
11. UI dialect and JSON-render target.
12. Storage/legalization/target IR.
13. Target emitters over legalized IR.
14. Textual IR, graph diff, migrations.
15. Delete legacy arrays.
```

### 23.3 Architecture Tests

Required tests or static checks:

```txt
No new top-level semantic arrays on GenContext.
No internal graph query API requires raw string kind/trait names.
No target emitter consumes source dialect IR directly.
All emitted artifacts have provenance.
All target output comes from target/legalized IR.
Operations used by optimistic/IVM are operation-definition nodes.
Laws used by planning are trait applications with assurance payloads where needed.
No casts in tests to hide inference failures.
```

---

## 24. Agent Directives

Agents working on Gen2 must follow these mandates.

1. **Graph is source of truth.** Do not add new semantic storage outside `ctx.graph`.
2. **Witnesses over strings.** Use typed symbols internally.
3. **Passes over checkers.** New verification/derivation/emission logic is a pass.
4. **Legalized IR before emit.** Targets must not bypass legalization.
5. **Metadata is passive.** Behavior belongs in traits, protocols, edges, or passes.
6. **Runtime IR stays simple.** Keep heavy TypeScript types in authoring/query layers.
7. **Diagnostics are structured.** Add codes, locations, remediation, and related refs.
8. **Use graph indexes/views.** Avoid full scans in hot paths.
9. **Preserve provenance.** Generated artifacts and diagnostics must point back to graph/source locations.
10. **Validate continuously.** Run `vp check` and `vp test` after changes.

---

## 25. Design Decision Checklist

When adding a new concept, ask:

```txt
Is this a hard kernel primitive?
  Usually no.

Can it be a node kind, edge kind, trait, protocol, type, expr, transform, pass, diagnostic, or artifact?
  Usually yes.

Does it need runtime identity?
  Make it a node.

Is it a relationship?
  Make it an edge with typed endpoints.

Is it a semantic claim?
  Make it a trait.

Does a pass need behavior/accessors?
  Make it a protocol.

Is it value shape?
  Make it a type.

Is it pure computation?
  Make it an expression/operation.

Is it a compiler check/derive/lowering/emission?
  Make it a pass.

Is it a user/developer/AI-facing problem or hint?
  Make it a diagnostic.

Is it target output?
  Make it an artifact with provenance.
```

---

## 26. Success Definition

Gen2 is successful when:

```txt
A user defines domain facts once through ergonomic typed builders.
Builders emit typed graph IR.
The graph contains nodes, edges, types, expressions, operations, traits, protocols, locations, diagnostics, and artifacts.
Graph traversal is index-backed and role-aware.
Passes derive auth, CRUD, UI, sync, optimistic updates, IVM, deployment, tests, docs, and target IR.
Targets consume legalized target dialect IR only.
Artifacts carry source maps to graph facts.
Agents can inspect, diff, explain, modify, and repair the graph.
No magic strings are needed for internal semantic identity.
TypeScript catches local construction errors.
Graph passes catch global semantic errors.
Runtime diagnostics explain what TypeScript cannot prove.
```

Compact mental model:

```txt
Types define value domains.
Operations define what can happen to those domains.
Expressions apply operations.
Rules name important pure boolean expressions.
Traits define semantic claims and laws.
Protocols define what passes can ask objects to reveal or do.
Nodes define semantic objects.
Edges define semantic facts between objects.
Dialects package related graph vocabulary.
Passes verify, derive, canonicalize, legalize, lower, and emit.
Targets interpret legalized IR.
Diagnostics power human and AI repair.
Artifacts are the emitted consequence of graph facts.
```

---

## Appendix A — Example End-to-End Shape

```ts
const kernel = createKernel({
  dialects: { domain, app, ui, postgres, react },
});

class User extends domain.entity.class("User", {
  fields: {
    id: field(t.uuid).primary(),
    email: field(t.email).unique(),
    role: field(t.enum("Role", ["admin", "user"] as const)),
    archivedAt: field(t.optional(t.datetime)),
  },
}) {}

const canArchiveUser = app.rule("canArchiveUser")((ctx, rule) =>
  rule
    .vars({ actor: User, user: User })
    .when(({ actor, user }) =>
      expr.and(expr.eq(actor.role, "admin"), expr.isNull(user.archivedAt)),
    ),
);

const UserArchived = app.event("UserArchived")({
  payload: t.object({ userId: User.fields.id.type }),
});

const archiveUser = app.action("archiveUser")((ctx, action) =>
  action
    .input({ actor: User, user: User })
    .guard(canArchiveUser)
    .writes(User.fields.archivedAt, {
      operation: "set",
      reversible: true,
    })
    .emits(UserArchived),
);

const UserListView = ui.view("UserList")((view) =>
  view
    .data(app.query("listActiveUsers")(/* ... */))
    .slot("archiveButton", [ui.traits.interactive])
    .enabledWhen(canArchiveUser),
);

const graph = kernel.graph.pipe(
  User,
  canArchiveUser,
  UserArchived,
  archiveUser,
  UserListView,
  pass(app.passes.verify),
  pass(app.passes.deriveInvalidation),
  pass(postgres.passes.lower),
  pass(react.passes.emit),
);
```

The resulting graph can derive:

```txt
User table and columns
unique index on email
RLS/server guard from canArchiveUser
archiveUser mutation endpoint
UserArchived event schema
query invalidation and optimistic patch
button enabled/disabled state
React component
Postgres migration
OpenAPI schema
docs/tests
deployment requirements
```
