# Gen2

**Gen2 is a typed semantic graph compiler for full-stack applications.**

Instead of scattering application meaning across database schemas, API routes, React components, validators, query keys, auth callbacks, state managers, and generated code, Gen2 lets you define semantic facts once and derive the rest through compiler passes.

Gen2 is not primarily a framework. It is a compiler architecture for application semantics.

```txt
Define meaning once.
Represent it as a typed graph.
Verify it.
Derive relationships.
Lower to targets.
Emit code, schemas, policies, UI, tests, and docs.
```

## Why Gen2 exists

Modern applications repeat the same facts everywhere.

A field is required in the form, validated on the server, represented in the database, encoded over the wire, documented in OpenAPI, displayed in the UI, included in cache keys, referenced by authorization rules, and invalidated by mutations.

A business rule is checked in a button, a server action, an API route, a database policy, a query predicate, and a test.

A mutation writes a field, invalidates a resource, updates optimistic state, emits an event, writes to an outbox, and triggers downstream effects.

Most stacks make those relationships implicit. Gen2 makes them explicit.

## Core idea

Gen2 represents your application as a graph of semantic objects.

```txt
Node
  A semantic object: entity, field, rule, query, action, view, provider, event, queue, component, operation.

Edge
  A semantic relationship: owns, reads, writes, guards, mapsTo, emits, invalidates, lowersTo, generatedFrom.

Type
  A semantic value shape, including domain representation, encoded representation, traits, and transformations.

Expr
  A typed, inspectable expression tree built from operation uses.

Operation
  A node that defines what can happen to values: equals, filter, setField, append, enqueue, transition, reduce.

Trait
  A typed semantic claim: pure, SQL-lowerable, idempotent, patchable, interactive, sensitive-safe.

Protocol
  A typed behavior surface that passes can call: Callable, Readable, Writable, Patchable, Stream, Queue, Renderable.

Pass
  A compiler step: verify, derive, canonicalize, legalize, lower, emit.
```

Everything else is built on top.

Entities, actions, queries, rules, events, queues, views, resources, forms, streams, providers, boundaries, and UI components are not hardcoded primitives. They are **dialect nodes and edges** over the same kernel.

## Design goals

### 1. No magic strings

Internal semantics are typed symbols and refs, not unstructured strings.

```ts
// Good
traits: [NodeCallable, NodeReadable];
kind: QueryNodeKind;
edge.kind === WritesEdgeKind;

// Avoid
traits: ["callable", "readable"];
kind: "query";
edge.kind === "writes";
```

Strings still exist where they are external names: route paths, database names, CSS class names, display labels, filenames, operation IDs, and JSON pointer targets emitted at boundaries. But inside Gen2, semantic identity is typed.

### 2. Full inference where it matters

Runtime graph objects are the source of truth. TypeScript phantom generics mirror enough of the graph to infer inputs, outputs, errors, requirements, effects, traits, refs, and laws.

```ts
type Node<Kind, In, Out, Err, Req, Eff, Traits>
type Expr<Out, Req, Eff, Traits, Refs>
type Type<Decoded, Encoded, DecodeR, EncodeR, Traits>
type Edge<Kind, Endpoints, Payload, Traits>
```

Inference bubbles up:

```txt
operation requirements -> expression requirements -> rule requirements -> query/action requirements -> boundary/provider requirements
```

Context flows down:

```txt
entity scope -> field refs
rule scope -> typed variables
query scope -> readable operations
action scope -> writable operations
target scope -> lowerable operations only
```

### 3. Rules are first-class business logic

Rules are pure boolean expressions with business meaning.

They can drive:

```txt
authorization
RLS policies
query predicates
UI visibility/editability
validation
reactivity
incremental view maintenance
tests
documentation
```

A rule is not a separate AST. It is a pure predicate over the universal expression system.

### 4. Operations carry laws

Gen2 tracks not just _that_ something writes, but _what operation_ happened and what properties that operation has.

```txt
set field
append item
remove item
increment
transition status
enqueue message
emit event
reduce stream
merge patch
```

Operations may carry laws and traits:

```txt
pure
deterministic
idempotent
patchable
reversible
associative
commutative
has identity
monotonic
retry-safe
client-safe
SQL-lowerable
```

This makes optimistic updates, offline replay, automatic CRUD, queue safety, and incremental view maintenance possible.

### 5. Manual and derived graph facts coexist

Gen2 derives what it can, but does not pretend everything can be inferred.

You can manually declare stable keys, cache invalidation, external dependencies, queue policies, delivery semantics, and target-specific facts.

Every fact carries provenance:

```txt
explicit
derived
conservative
target-generated
opaque
```

Manual facts are not second-class. They are typed graph facts.

### 6. Targets are lowerings, not sources of truth

Gen2 can emit many targets from the same semantic graph:

```txt
Postgres DDL / RLS / triggers
HTTP / RPC routes
OpenAPI
React / Solid / React Native / TUI
JSON-render UI specs
Effect runtime programs
TanStack Query hooks
Effect Atom resources
queue workers
outbox tables
docs
tests
devtools graphs
```

Targets consume legalized target dialect IR. They do not own application semantics.

---

# A tiny example

```ts
import { gen } from "gen2";

const User = gen.entity("User", {
  id: gen.type.uuid(),
  email: gen.type.email(),
  role: gen.type.enum("Role", ["admin", "user"]),
  archivedAt: gen.type.datetime().optional(),
});
```

This creates graph facts:

```txt
Node(Entity): User
Node(Field): User.id
Node(Field): User.email
Node(Field): User.role
Node(Field): User.archivedAt

Edge(OwnsField): User -> User.id
Edge(OwnsField): User -> User.email
Edge(OwnsField): User -> User.role
Edge(OwnsField): User -> User.archivedAt

Type: uuid
Type: email
Type: enum Role
Type: optional datetime
```

The public API is simple. The compiler receives a typed graph.

---

# Add a rule

```ts
const isAdmin = gen.rule("isAdmin", {
  vars: {
    actor: User,
  },
  when: ({ actor }) => actor.role.eq("admin"),
});
```

A rule is a pure predicate expression.

The compiler derives:

```txt
Rule isAdmin has body Expr<boolean>
Expr uses operation Eq
Rule reads User.role
Rule is pure
Rule is SQL-lowerable if the target supports enum equality
Rule is client-safe if User.role is allowed on the client
```

The same rule can later power server guards, database policies, and UI disabled states.

---

# Add an action

```ts
const archiveUser = gen.action("archiveUser", {
  input: User.fields.id.type,
  output: User,
  auth: isAdmin,
  body: ({ input, now }) =>
    User.update(input, {
      archivedAt: now(),
    }),
});
```

The action is a callable node. Its body applies an operation.

The graph records:

```txt
Node(Action): archiveUser
Edge(GuardedBy): archiveUser -> isAdmin
Edge(AppliesOperation): archiveUser -> SetField
Edge(Writes): archiveUser -> User.archivedAt
Edge(Requires): archiveUser -> Clock
```

If `SetField` is patchable and reversible, Gen2 can derive optimistic update and rollback behavior.

---

# Add a query

```ts
const listActiveUsers = gen.query("listActiveUsers", {
  input: gen.type.object({}),
  output: gen.type.list(User),
  key: gen.key.family("users.active"),
  body: () => User.where((u) => u.archivedAt.isNull()),
});
```

The compiler derives:

```txt
Query reads User.archivedAt
Query has stable key users.active
Query returns List<User>
Query predicate is SQL-lowerable
```

Now `archiveUser` writes a field that `listActiveUsers` reads. Gen2 can derive invalidation.

```txt
archiveUser writes User.archivedAt
listActiveUsers reads User.archivedAt
listActiveUsers has key users.active
=> archiveUser invalidates users.active
```

If the operation semantics are rich enough, Gen2 may derive a patch instead of a refetch:

```txt
archivedAt changes from null to datetime
predicate archivedAt IS NULL becomes false
=> remove user from active users list
```

---

# Manual reactivity still exists

Gen2 does not remove stable keys or manual invalidation. It makes them typed.

```ts
const UserListKey = gen.key.family("users.list", {
  params: {
    tenantId: gen.type.uuid(),
  },
});

archiveUser.invalidates(UserListKey.any());
```

Manual invalidation becomes an explicit edge:

```txt
Edge(InvalidatesKey)
  from: archiveUser
  to: UserListKey.any
  provenance: explicit
```

Derived invalidation and manual invalidation share the same graph.

---

# UI from the same graph

```ts
const UserListView = gen.ui.view("UserList", {
  data: listActiveUsers,
  slots: {
    row: gen.ui.slot([UiContainer]),
    archiveButton: gen.ui.slot([UiInteractive]),
  },
});

const archiveBehavior = gen.ui.behavior("ArchiveUserBehavior", {
  target: UiInteractive,
  run: archiveUser,
});

const UserListComponent = gen.ui
  .component("UserListComponent", {
    view: UserListView,
  })
  .pipe(
    gen.ui.attachBehavior(archiveBehavior, {
      target: UserListView.slots.archiveButton,
    }),
  );
```

The UI dialect uses the same graph model:

```txt
View exposes Slot
Behavior attaches to Slot
Behavior runs Action
Action is guarded by Rule
Rule may be client-safe or server-only
Action invalidates Key
```

A React target may emit a component and hook. A JSON-render target may emit a catalog and spec. A TUI target may emit terminal UI. All consume the same UI graph.

---

# Rules drive UI state

```ts
const canArchiveUser = gen.rule("canArchiveUser", {
  vars: {
    actor: User,
    user: User,
  },
  when: ({ actor, user }) => actor.role.eq("admin").and(user.archivedAt.isNull()),
});

UserListView.slots.archiveButton.enabledWhen(canArchiveUser);
archiveUser.guard(canArchiveUser);
```

One rule can generate:

```txt
client disabled state, if client-safe
server guard, always
database predicate, if SQL-lowerable
tests and docs
```

If the rule is pure but not SQL-lowerable, Gen2 can gracefully fall back to server runtime checks and emit a diagnostic.

---

# Dispatch, effects, events, and queues

Rules stay pure. Dispatch owns effects.

```ts
const UserArchived = gen.event("UserArchived", {
  userId: User.fields.id.type,
  email: User.fields.email.type,
});

archiveUser.emits(UserArchived, ({ result }) => ({
  userId: result.id,
  email: result.email,
}));

const sendArchiveEmail = gen.action("sendArchiveEmail", {
  input: UserArchived.payload,
  effects: [gen.effect.email.send()],
  body: ({ input, email }) =>
    email.send({
      to: input.email,
      subject: "Your account was archived",
    }),
});

gen.dispatch("sendEmailWhenUserArchived", {
  trigger: UserArchived,
  run: sendArchiveEmail,
  delivery: gen.delivery.outbox({
    guarantee: "at_least_once",
    retry: gen.retry.exponential({ maxRetries: 5 }),
  }),
  idempotency: gen.idempotency.eventId(),
});
```

This creates:

```txt
Event node
Action emits event
Dispatch triggered by event
Dispatch runs action
Action has email effect
Dispatch delivered by outbox
Dispatch uses idempotency plan
Outbox stored in storage container
```

Gen2 can verify:

```txt
side-effecting dispatch has delivery plan
at-least-once delivery has idempotency
outbox storage is persistent
sensitive payloads are encrypted
handler input matches event payload
```

---

# Offline queues

```ts
const OfflineCommands = gen.queue("OfflineCommands", {
  message: gen.message.command(archiveUser),
  storage: gen.storage.client.indexedDb("offline_commands"),
  durable: true,
  encrypted: true,
  drain: gen.queue.drain.whenOnline(),
  idempotency: gen.idempotency.inputHash(),
  conflict: gen.conflict.queue(),
});

archiveUser.queueWhenOffline(OfflineCommands);
```

The compiler knows:

```txt
action input must be serializable
queue storage must be safe for sensitivity
queued command must have idempotency
replay requirements must be satisfiable at drain time
```

---

# Streams

```ts
const UserEvents = gen.stream("UserEvents", {
  emits: UserArchived,
  source: gen.source.outbox(UserArchived),
  traits: [StreamOrdered, StreamReplayable],
});

const ArchivedUserCount = UserEvents.filter((e) => e.type.eq(UserArchived))
  .map((e) => e.payload.userId)
  .count();
```

Streams are not arrays. They are many values over time.

A stream carries:

```txt
emitted value type
error type
requirements
effects
scope
backpressure/replay traits
```

A stream target may lower this to Effect Stream, AsyncIterable, SSE, WebSocket, queue consumer, database subscription, or client resource.

---

# Operations and laws

Operations are nodes.

```ts
const AddNumber = gen.operation("AddNumber", {
  args: [gen.type.number(), gen.type.number()],
  output: gen.type.number(),
  traits: [
    OperationPure,
    OperationDeterministic,
    LawAssociative,
    LawCommutative,
    LawIdentity.with({ identity: gen.expr.literal(0) }),
  ],
});
```

Laws are traits. Some laws are markers. Some carry witnesses.

```ts
const Increment = gen.operation("Increment", {
  args: [Counter, gen.type.number()],
  output: CounterPatch,
  traits: [
    OperationPatchable,
    OperationReversible.with({ inverse: Decrement.ref }),
    LawCommutative,
  ],
});
```

This powers:

```txt
optimistic updates
rollback
offline replay
merge strategies
reducers
incremental view maintenance
safe retries
```

---

# Boundaries and providers

```ts
const AuthSession = gen.context("AuthSession", {
  type: gen.type.object({
    userId: User.fields.id.type,
    role: User.fields.role.type,
  }),
  sensitivity: "auth",
});

const AuthSessionProvider = gen.provider("AuthSessionProvider", {
  provides: AuthSession,
  source: gen.provider.cookie("session"),
  placement: gen.placement.serverSession(),
  lifetime: "request",
});

const ArchiveBoundary = gen.boundary("ArchiveUserBoundary", {
  payload: archiveUser,
  from: gen.env.client(),
  to: gen.env.server(),
  transport: gen.transport.rpc(),
});
```

Gen2 verifies:

```txt
boundary payload is serializable
client/server crossing is legal
required providers exist
sensitive context does not cross unsafely
provider lifetime satisfies consumer lifetime
```

Effect target can lower providers to `Context.Service` and `Layer`. Other targets can lower them to dependency injection, request locals, framework loaders, or explicit parameters.

---

# Dialects

Gen2 is organized into dialects.

A dialect contributes semantic vocabulary:

```txt
node kinds
edge kinds
type kinds
operation definitions
traits
protocols
verifiers
derivation passes
lowerings
emitters
builders
```

Built-in dialect families include:

```txt
core
  refs, placement, context, requirements, providers, ownership, claims, capabilities, provenance

domain
  entities, fields, domain relations, identity, aggregates

operation
  operations, laws, patches, reducers, transitions, combiners

expression
  literals, refs, field access, operation calls, logic, refinements, quantifiers

rule
  pure predicates with business meaning

callable
  expression functions, queries, actions, patches, plans

reactivity
  keys, resources, mutations, tracking scopes, invalidation, optimistic plans

dispatch
  triggers, dispatches, delivery, idempotency, outbox

event
  events, emissions, subscriptions, reducers

queue
  queues, mailboxes, messages, envelopes, retry, dead-lettering

stream
  streams, sources, sinks, backpressure, windows

storage
  storage containers, fields, indexes, mappings

boundary
  client/server/database/worker crossings, transports, serialization

ui
  views, slots, components, behaviors, styles, design systems, widgets, forms

workflow
  regions, plans, steps, orchestration
```

You can add your own dialects.

---

# Compiler pipeline

Gen2 compiles by running passes over the graph.

```txt
verify
  Check local and global invariants.

derive
  Add inferred edges: reads, writes, guards, invalidates, requires, lowersTo.

canonicalize
  Normalize equivalent graph forms.

legalize
  Convert high-level dialects into target dialects.

lower
  Produce target-specific intermediate forms.

emit
  Generate artifacts.
```

Example Postgres pipeline:

```txt
verify graph
canonicalize domain/rules/actions
legalize entity -> storage container
legalize rule -> SQL predicate
legalize policy -> RLS policy
legalize operation -> SQL mutation
emit DDL, indexes, RLS, triggers
```

Example React pipeline:

```txt
verify graph
legalize query -> resource hook
legalize action -> mutation hook
legalize rule -> client UI hint if safe
legalize UI view -> component model
emit components, hooks, key helpers
```

Example JSON-render pipeline:

```txt
verify UI graph
emit component catalog
emit view specs
emit state/action bindings from typed refs
```

---

# Why this is powerful

## One rule, many uses

```txt
isAdmin
  -> server guard
  -> RLS predicate
  -> UI disabled state
  -> query filter
  -> test case
  -> documentation
```

## One mutation, many consequences

```txt
archiveUser
  -> server action
  -> SQL update
  -> invalidates active users
  -> optimistic patch
  -> rollback plan
  -> emits UserArchived
  -> writes outbox
  -> updates docs/tests/devtools
```

## One UI graph, many renderers

```txt
ui.view + slots + behavior + style
  -> React
  -> Solid
  -> React Native
  -> TUI
  -> JSON-render
  -> AI-safe UI spec
```

## One operation model, many optimizations

```txt
associative + identity
  -> reducer
  -> IVM
  -> stream aggregation

reversible + patchable
  -> optimistic update
  -> rollback
  -> offline replay

idempotent + retry-safe
  -> queue retry
  -> outbox delivery
```

---

# Answering criticism

## “Isn’t this too abstract?”

The kernel is abstract so user APIs can be simple.

Most users write:

```ts
gen.entity(...)
gen.rule(...)
gen.query(...)
gen.action(...)
gen.ui.view(...)
```

Plugin and target authors work with nodes, edges, dialects, and passes.

The abstraction exists to remove duplicated application logic, not to make users write compiler IR by hand.

## “Why not just use a framework?”

Frameworks usually own runtime structure: routes, components, server functions, loaders, hooks.

Gen2 owns semantic structure.

It can emit to frameworks, but it does not make your business logic disappear into framework-specific APIs.

## “Why not just use Effect?”

Effect is excellent for runtime effects, services, streams, layers, schemas, and error handling.

Gen2 is a compiler IR.

Gen2 can interoperate deeply with Effect:

```txt
Type <-> Effect Schema
Provider -> Effect Layer
Requirement -> Effect Context.Service
Stream -> Effect Stream
Action -> Effect program
```

But Gen2 keeps expressions, rules, graph facts, target lowerings, UI, storage, and artifact generation independent of any single runtime.

## “Why not just use a schema library?”

Schemas describe values. Gen2 also describes operations, rules, actions, resources, queues, UI, dispatches, providers, storage, boundaries, and emitted artifacts.

Schemas are part of the graph. They are not the whole graph.

## “Can TypeScript actually prove all this?”

No. And Gen2 does not pretend it can.

Gen2 uses three layers:

```txt
TypeScript inference
  Catches local composition mistakes.

Graph verification passes
  Catch global invariants.

Target legalization
  Catches unsupported lowerings.
```

Some laws are claims, some are tested, some are proven, some are target-certified. Gen2 tracks assurance levels instead of pretending every property is statically proven.

## “What about opaque code?”

Opaque code is allowed, but explicit.

```ts
gen.expr.opaque(...)
gen.action.opaque(...)
```

Opaque code loses capabilities:

```txt
not SQL-lowerable
not statically dependency-complete unless dependencies are declared
may force broad invalidation
may require server-only placement
may block IVM
```

This preserves escape hatches without silently breaking derivation.

## “Do manual keys and manual reactivity go away?”

No.

Stable keys remain essential. External systems, opaque logic, hand-tuned cache hierarchies, and domain-specific invalidation often require explicit declarations.

The difference is that manual reactivity becomes typed graph facts, not a separate ad hoc system.

## “Is this a UI framework?”

No. The UI dialect is a semantic UI compiler layer.

It can target React, Solid, React Native, JSON-render, terminal UIs, or something custom.

Views, slots, styles, behaviors, and state bindings are graph facts. Renderers are targets.

## “Will this generate too much code?”

Gen2 has graph shaking.

Targets start from roots:

```txt
boundaries
UI entrypoints
exported functions
queue workers
explicit forceEmit nodes
```

Only reachable graph artifacts are emitted.

## “What about performance?”

The graph enables more precise generation:

```txt
exact invalidation instead of broad refetch
patches instead of reloads
IVM instead of recomputation
batch/chunk stream processing
dead-code elimination
stable artifact caching
```

The compiler may be more sophisticated, but the emitted runtime can be smaller and more precise.

---

# Status of the architecture

The revised Gen2 architecture is based on:

```txt
small kernel
symbol-first refs
universal graph
operation-backed expressions
pure rules
callable functions
manual + derived reactivity
node/edge UI dialect
Effect-compatible adapters
MLIR-style dialects and passes
```

The goal is not to create the largest possible abstraction.

The goal is to make application semantics explicit enough that tools, compilers, agents, and humans can safely build on them.

---

# Summary

Gen2 is a semantic graph compiler for applications.

It lets you define:

```txt
what data exists
what operations can happen
what rules are true
what functions can be called
what effects can occur
what state/resources/queues/streams exist
what UI can render
what boundaries can be crossed
what targets can be emitted
```

Then it derives:

```txt
validation
authorization
RLS
queries
actions
forms
components
cache keys
invalidation
optimistic updates
offline replay
queues/outbox
streams
IVM
schemas
docs
tests
artifacts
```

The core promise:

> Define semantics once. Compile everything else from the graph.
> Rewrote the README into an ideal-design version with:

- typed dialect modules instead of loose registries
- `kernel.graph.pipe(...)`, builder, fragment, pass, and emit examples
- target-safe traits and typed artifact kinds
- inferred scopes and callback contexts
- typed operations, laws, expressions, rules, queries, actions, events, queues, streams, providers, boundaries, and UI
- explicit “TypeScript local safety + graph verification + target legalization” framing

I used the uploaded Gen2 README as the source material and reworked it around the ideal API design we discussed.
