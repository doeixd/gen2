# Gen2 Revised Core Design Doc

## 1. Executive summary

Gen2 should be reframed as a **semantic graph compiler** rather than a full-stack framework with many first-class domain concepts.

The original Gen2 vision is still right: application behavior should be defined once as typed, inspectable data and then used to derive storage, APIs, auth, UI, reactivity, tests, docs, and target artifacts. The current docs already describe Gen2 as a programmable domain compiler where domain, actions, rules, boundaries, UI, and storage are represented as typed, inspectable TypeScript values rather than scattered implementation fragments.

The improvement is to shrink the true kernel.

Instead of making `Entity`, `Rule`, `Action`, `Dispatch`, `StoredValue`, `EntityView`, `Checker`, and `ArtifactEmitter` all core primitives, Gen2 should reduce to a smaller substrate:

```txt
Id
Type
Expr
Transform
Trait
Metadata
Node
Edge
Graph
Pass
```

Everything else becomes a **standard-library abstraction** built from those primitives.

The most important revision from our discussion is that **Edge** should be first-class. A Gen2 graph is not just nodes plus loose edges. It is a graph of typed semantic objects connected by typed semantic relationships. Edges should have their own identity, traits, metadata, constraints, source refs, and derivation history.

That shift lets Gen2 express multiple topologies without adding new primitive families for every feature:

```txt
domain topology
storage topology
authorization topology
reactivity topology
UI topology
runtime-boundary topology
artifact topology
provider/dependency topology
```

Effect v4 / `effect-smol` should strongly influence the design, especially around schemas, transformations, services, and explicit protocols. But Gen2’s core IR should remain independent: Effect should be a first-class adapter and target, not the substrate itself. Effect v4 is still beta, and its own docs say v3 remains the production recommendation while v4 evolves. ([Effect][1])

---

## 2. Design thesis

Gen2’s core thesis should be:

> Define semantic facts once as a typed graph. Derive implementation artifacts by running passes over that graph.

The current architecture already points this way. The core primitives document says Gen2’s deepest foundation is typed semantic data, not a database table, API route, hook, or UI component. It identifies semantic types, traits, nodes, operations, and laws as the architectural families that preserve type safety and meaning through the graph.

The revised thesis is narrower:

> Gen2 core should only model things the compiler cannot recover from lower-level graph structure.

By that rule:

```txt
Core:
  Id
  Type
  Expr
  Transform
  Trait
  Metadata
  Node
  Edge
  Graph
  Pass

Standard library:
  Entity
  Field
  Relation
  Rule
  Query
  Action
  Dispatch
  StoredValue
  EntityView
  Boundary
  Provider
  Key
  ReactiveResource
  StorageContainer
  DesignSystem
  ArtifactEmitter
  Checker
```

This reduces conceptual load while increasing extensibility.

---

## 3. Goals

### 3.1 Keep the kernel tiny

The kernel should be small enough that a contributor can understand it in one sitting.

The standard library may be rich. The kernel should not be.

### 3.2 Preserve inspectability

Every meaningful application fact should be inspectable:

```txt
What does this action write?
Which rule does this UI state depend on?
Which fields does this RLS policy read?
Which generated route came from this callable?
Which relationship caused this cache invalidation?
```

This is why `Expr` and `Edge` remain core.

### 3.3 Avoid parallel sources of truth

Validation, auth, cache invalidation, storage mapping, UI editability, and generated tests should point back to the same semantic graph.

The existing docs already warn against form-only validation, auth-only callbacks, raw cache keys, target-only provider wiring, and generator-only business logic.

### 3.4 Support multiple target ecosystems

The same semantic graph should be able to target:

```txt
Postgres
SQLite
HTTP/RPC
SolidStart
React
Effect
TanStack Query
OpenAPI
JSON Schema
docs/devtools
```

Targets should consume public IR, not private internals.

### 3.5 Make Effect interop excellent

Effect v4’s schema, transformation, service, and package-consolidation direction lines up well with Gen2. Effect v4 emphasizes smaller bundles, package consolidation, and a unified ecosystem versioning model. ([Effect][1])

Gen2 should exploit that without depending on Effect in the core package.

---

## 4. Non-goals

### 4.1 Gen2 core is not a runtime framework

The core should not execute application logic. It should represent and transform semantic facts.

Runtime execution belongs to emitters/adapters:

```txt
@gen2/effect
@gen2/solid
@gen2/react
@gen2/node
@gen2/postgres
```

### 4.2 Gen2 `Expr` is not Effect

Effect is excellent for runtime effects, dependency injection, concurrency, resource management, and typed errors. But Gen2 expressions must be serializable, inspectable, SQL-lowerable, dependency-extractable, and source-mappable.

So:

```txt
Gen2 Expr = static compiler AST
Effect.Effect = possible emitted runtime implementation
```

### 4.3 Metadata is not a replacement for traits

Metadata is passive. Traits are checked semantic claims.

This distinction is critical.

```txt
Metadata:
  title
  description
  examples
  docs
  display labels

Trait:
  unique
  serverOnly
  queryable
  indexed
  callable
  writable
  effectful
  relation:foreignKey
  ui:hidden
```

---

# 5. Revised core primitives

## 5.1 `Id`

`Id` is stable compiler identity.

Every durable object should have an identity:

```txt
TypeId
ExprId
TransformId
TraitId
NodeId
EdgeId
PassId
ArtifactId
```

A minimal shape:

```ts
type Id<Kind extends string = string> = {
  readonly kind: Kind;
  readonly value: string;
  readonly name?: string;
  readonly module?: string;
};
```

Do not expose this publicly as `Ref` if targeting Effect users, because Effect `Ref` means runtime mutable state. Public names like `SymbolRef`, `NodeId`, or `SemanticRef` are less confusing.

## 5.2 `Metadata`

`Metadata` is passive annotation.

It should be JSON-ish, serializable where possible, and safe to emit into docs, devtools, generated schemas, and diagnostics.

```ts
type Metadata = {
  readonly title?: string;
  readonly description?: string;
  readonly documentation?: string;
  readonly examples?: readonly unknown[];
  readonly deprecated?: boolean | string;
  readonly tags?: readonly string[];
  readonly source?: SourceSpan;
  readonly custom?: Record<string, unknown>;
};
```

Effect Schema’s annotation model is a useful precedent. Effect v4 SchemaRepresentation preserves documentation-style annotations such as `title` and `description`, but filters complex values like functions and instances. ([GitHub][2])

Gen2 should follow the same discipline: metadata should not secretly contain executable business logic.

## 5.3 `Trait`

A `Trait` is a checked semantic claim.

Traits may apply to types, expressions, nodes, relationships, transforms, fields, artifacts, or passes.

```ts
type Trait = {
  readonly id: Id<"trait">;
  readonly name: string;

  readonly appliesTo: readonly TraitTargetKind[];

  readonly implies?: readonly Id<"trait">[];
  readonly conflictsWith?: readonly Id<"trait">[];

  readonly validateApplication?: Id<"expr">;
  readonly requiredCapabilities?: readonly CapabilityRef[];
  readonly requiredLaws?: readonly LawRef[];

  readonly metadata?: Metadata;
};
```

Examples:

```txt
type.email
type.uuid
type.serverOnly
type.secret
type.unique
type.queryable

node.callable
node.readable
node.writable
node.effectful
node.provider
node.boundary
node.ui
node.targetInterpretable

relationship.owns
relationship.reads
relationship.writes
relationship.derives
relationship.invalidates
relationship.lowersTo
relationship.requires
relationship.crossesBoundary
```

The existing docs already say traits should not be free-form metadata: they declare where they can apply, what they imply, what they conflict with, what expressions they carry, and what target capacities or laws they require.

That should become the central trait rule.

## 5.4 `Type`

`Type` represents semantic value shape.

Revised Gen2 `Type` should be inspired by Effect Schema:

```txt
Type<Decoded, Encoded, DecodeRequirements, EncodeRequirements>
```

Effect Schema is explicitly designed to define data shapes, validate unknown input, transform values between formats, and derive tooling like JSON Schema, test data generators, equivalence checks, and more from a single definition. ([GitHub][2])

A minimal Gen2 type:

```ts
type GenType<Decoded = unknown, Encoded = Decoded, DecodeR = never, EncodeR = never> = {
  readonly id: Id<"type">;
  readonly kind: TypeKind;

  readonly decoded?: Phantom<Decoded>;
  readonly encoded?: Phantom<Encoded>;
  readonly decodeRequirements?: Phantom<DecodeR>;
  readonly encodeRequirements?: Phantom<EncodeR>;

  readonly representation?: TypeRepresentation;
  readonly schemaAdapter?: EffectSchemaAdapter<Decoded, Encoded, DecodeR, EncodeR>;

  readonly traits: readonly Id<"trait">[];
  readonly metadata?: Metadata;
};
```

Common type kinds:

```txt
unknown
never
string
number
bigint
boolean
uuid
email
datetime
duration
enum
literal
object
array
tuple
record
union
taggedUnion
custom
opaque
```

The original Gen2 docs describe `SemanticType<T>` as carrying phantom TypeScript type, semantic kind, storage representation, wire representation, serializer/deserializer information, validation, traits, server/client safety metadata, and merge strategy metadata.

The revised `Type` keeps that idea but generalizes it with decoded/encoded representations.

## 5.5 `Transform`

`Transform` is a typed conversion between representations.

This should be first-class.

Effect v4 Schema treats transformations as standalone reusable objects that can be composed with schemas, rather than only inline schema details. ([GitHub][2])

Gen2 needs the same concept for:

```txt
wire decoding
wire encoding
storage mapping
form parsing
hydration
URL params
JSON serialization
domain constructors
opaque/branded values
```

Minimal shape:

```ts
type Transform<From = unknown, To = unknown, DecodeR = never, EncodeR = never> = {
  readonly id: Id<"transform">;

  readonly from: Id<"type">;
  readonly to: Id<"type">;

  readonly decode?: Id<"expr"> | RuntimeAdapterRef;
  readonly encode?: Id<"expr"> | RuntimeAdapterRef;

  readonly decodeRequirements?: Phantom<DecodeR>;
  readonly encodeRequirements?: Phantom<EncodeR>;

  readonly traits: readonly Id<"trait">[];
  readonly metadata?: Metadata;
};
```

Important distinction:

```txt
Portable transform:
  represented as Expr; can be lowered to SQL/JS/tests/docs.

Opaque transform:
  represented as runtime adapter; target-specific; diagnostics explain limitations.
```

Effect v4 SchemaRepresentation is a useful warning: schema representation can round-trip structural schema data, but it cannot safely serialize arbitrary user-code transformations or custom predicates. ([GitHub][2])

Gen2 should make this explicit rather than hiding it.

## 5.6 `Expr`

`Expr` is a typed, inspectable computation AST.

It should model logic that the compiler can analyze:

```txt
validation
predicates
rules
query filters
auth policies
UI conditions
storage expressions
derived values
computed fields
state transitions
invalidation conditions
```

Minimal shape:

```ts
type Expr<T = unknown> = {
  readonly id: Id<"expr">;
  readonly op: ExprOp;

  readonly type: Id<"type">;
  readonly args: readonly ExprArg[];

  readonly phase?: Phase;
  readonly requirements?: readonly RequirementRef[];
  readonly effects?: readonly EffectFootprint[];

  readonly traits: readonly Id<"trait">[];
  readonly metadata?: Metadata;
};
```

Example:

```ts
const isAdmin = expr.eq(expr.get(expr.ref("actor"), "role"), expr.literal("admin"));
```

The existing docs describe expressions as typed static computation trees carrying value type, phase, requirements, effects, AST, refs, and opaque-JS markers. They enable SQL generation, dependency extraction, auth placement, reactivity derivation, validation, test generation, and target capacity checks.

That should remain core.

## 5.7 `Node`

`Node` is a semantic object in the application graph.

A node is not necessarily executable. It is any named semantic thing:

```txt
entity
field
rule
query
action
view
provider
storage container
boundary
artifact
workflow
event
route
component
policy
```

Minimal shape:

```ts
type Node<In = unknown, Out = unknown> = {
  readonly id: Id<"node">;
  readonly kind: string;
  readonly name?: string;

  readonly input?: Id<"type">;
  readonly output?: Id<"type">;

  readonly body?: Id<"expr"> | Id<"node"> | PlanRef | RuntimeAdapterRef;

  readonly traits: readonly Id<"trait">[];
  readonly requirements?: readonly RequirementRef[];
  readonly effects?: readonly EffectFootprint[];

  readonly metadata?: Metadata;
};
```

The current docs already treat `StaticNode` as the open extension protocol: plugins and standard packages can add new semantic objects without adding a hardcoded branch everywhere, and node traits let generic compiler passes ask capability questions without knowing every concrete kind.

The revised design makes that idea more central.

## 5.8 `Edge`

`Edge` is the semantic connection between graph objects.

This is the biggest revision.

A plain edge is too weak. Gen2 needs semantic relationships that can be typed, traited, validated, queried, derived, and emitted.

Minimal shape:

```ts
type Edge = {
  readonly id: Id<"relationship">;
  readonly kind: string;

  readonly endpoints: readonly EdgeEndpoint[];

  readonly payload?: Id<"type">;
  readonly constraints?: readonly Id<"expr">[];

  readonly traits: readonly Id<"trait">[];
  readonly metadata?: Metadata;

  readonly provenance?: Provenance;
};
```

Endpoint shape:

```ts
type EdgeEndpoint = {
  readonly role: string;
  readonly target: Id<"type"> | Id<"expr"> | Id<"transform"> | Id<"node"> | Id<"relationship">;

  readonly cardinality?: "one" | "optional" | "many";
};
```

This supports binary relationships:

```txt
User owns User.email
Action writes User.archivedAt
Rule reads User.role
View submits Action
```

And n-ary relationships:

```txt
User is member of Organization with Role
Action writes Field under Policy
Dispatch connects Trigger, Handler, DeliveryPlan, IdempotencyKey
Field maps to Column in StorageContainer through Transform
```

Edge kinds:

```txt
owns
contains
references
reads
writes
derives
requires
provides
invalidates
patches
emits
handles
triggers
guards
displays
edits
submits
stores
mapsTo
crossesBoundary
lowersTo
generatedFrom
dependsOn
```

Edge traits:

```txt
structural
causal
reactive
authorization
storage
ui
runtime
compileTime
derived
explicit
inferred
conservative
exact
bidirectional
optional
manyToMany
foreignKey
materialized
serverOnly
private
```

Why this matters:

```txt
Node says what a thing is.
Edge says how things mean together.
Trait says what semantic claim applies.
Metadata says how to present or trace it.
```

Without first-class relationships, every subsystem invents its own ad hoc edge list.

## 5.9 `Graph`

`Graph` is the registry of semantic objects and relationships.

```ts
type Graph = {
  readonly types: ReadonlyMap<string, GenType>;
  readonly transforms: ReadonlyMap<string, Transform>;
  readonly exprs: ReadonlyMap<string, Expr>;
  readonly traits: ReadonlyMap<string, Trait>;
  readonly nodes: ReadonlyMap<string, Node>;
  readonly relationships: ReadonlyMap<string, Edge>;

  readonly metadata?: Metadata;
};
```

Graph queries should be core APIs:

```ts
graph.nodesWithTrait("node.callable");
graph.relationshipsOfKind("writes");
graph.relationshipsFrom(actionId);
graph.relationshipsTo(fieldId);
graph.neighborhood(ruleId, { depth: 2 });
graph.traceArtifact(artifactId);
graph.dependencyClosure(boundaryId);
```

## 5.10 `Pass`

`Pass` is a compiler transformation over the graph.

Instead of separate primitive concepts for checkers, derivers, lowerers, emitters, and artifact generators, model them all as passes.

```ts
type Pass = {
  readonly id: Id<"pass">;
  readonly name: string;
  readonly phase: "check" | "derive" | "lower" | "emit";

  readonly reads?: PassQuery;
  readonly writes?: PassWriteSpec;
  readonly requiresTraits?: readonly Id<"trait">[];

  run(graph: Graph, ctx: PassContext): PassResult;
};
```

Then:

```txt
Checker = Pass<"check">
Deriver = Pass<"derive">
Lowerer = Pass<"lower">
Emitter = Pass<"emit">
```

The current README already describes Gen2 as a compiler pipeline with primitive registration, checker registry, graph pruning, and artifact emitters.

The revised design keeps that pipeline but unifies it under one protocol.

---

# 6. What moves out of core

## 6.1 Entity

`Entity` becomes a standard-library node pattern:

```txt
Node(kind: "entity")
  output: object Type
  traits:
    node.domain
    node.record
    node.identityBearing
```

Fields are either:

1. type-level object slots, plus relationships to nodes, or
2. explicit field nodes for richer metadata, migrations, rename lineage, and relationships.

Recommended:

```txt
Field = Node(kind: "field")
Edge(entity, field, kind: "owns")
Edge(field, type, kind: "hasType")
```

## 6.2 Rule

`Rule` becomes:

```txt
Node(kind: "rule")
  output: boolean Type
  body: Expr<boolean>
  traits:
    node.rule
    expr.pure
    node.policyCandidate
```

Edges:

```txt
Rule reads Field
Rule traverses Edge
Rule guards Action
Rule derives UI visibility
Rule lowersTo RLS policy
```

Rules are still vital, but not kernel primitives. The original docs emphasize that rules expose dependency surfaces and can drive auth policies, RLS, query predicates, UI visibility/editability, reactivity, IVM, generated tests, and docs.

That remains true. They are just built from `Node + Expr + Edge`.

## 6.3 Query and Action

Both become callable nodes.

```txt
Query:
  Node(kind: "query")
  traits:
    callable
    readable
    pure or effectful-read
  relationships:
    reads Field
    derives Key
    guardedBy Rule

Action:
  Node(kind: "action")
  traits:
    callable
    writable
    effectful
  relationships:
    writes Field
    emits Event
    invalidates Key
    guardedBy Rule
```

## 6.4 Dispatch

`Dispatch` becomes either:

1. a node with relationships to trigger and handler, or
2. a relationship with multiple endpoints.

Recommended:

```txt
Dispatch = Node(kind: "dispatch")
```

Because dispatch often has its own configuration:

```txt
delivery mode
outbox strategy
idempotency key
retry policy
transaction boundary
observability
```

Edges:

```txt
Dispatch hasTrigger Trigger
Dispatch hasHandler Action
Dispatch usesDeliveryPlan Node
Dispatch requires IdempotencyKey
```

## 6.5 EntityView

`EntityView` becomes:

```txt
Node(kind: "view")
  traits:
    ui
    derived
```

Edges:

```txt
View displays Field
View edits Field
View submits Action
View enabledWhen Rule
View hiddenWhen Rule
View usesDesignSystem DesignSystem
```

## 6.6 StorageContainer

`StorageContainer` becomes:

```txt
Node(kind: "storage")
```

Edges:

```txt
Entity storedIn StorageContainer
Field mapsTo Column
Field encodedBy Transform
Rule lowersTo RLSPolicy
```

## 6.7 Provider / Requirement

These become standard-library nodes and relationships, strongly inspired by Effect v4 services.

Effect v4 replaces prior service-definition APIs such as `Context.Tag`, `Context.GenericTag`, `Effect.Tag`, and `Effect.Service` with `Context.Service`, and describes the underlying runtime data structure as a typed map from service identifiers to implementations. ([GitHub][3])

Gen2 should model:

```txt
Requirement = relationship from Node to Service node
Provider = Node that provides Service node
```

Effect adapter lowers:

```txt
Gen2 Service node -> Context.Service
Gen2 Provider node -> Layer
Gen2 Requirement relationship -> Effect requirements
```

---

# 7. Effect v4 / effect-smol interop strategy

## 7.1 Positioning

Gen2 should be:

```txt
Effect-shaped, not Effect-owned.
```

Package split:

```txt
@gen2/core
  No Effect dependency.
  Static semantic graph IR.

@gen2/stdlib
  Entity, Rule, Query, Action, View, Storage, Dispatch.

@gen2/effect
  Effect Schema adapters.
  Effect Context.Service adapters.
  Effect Layer emitters.
  Effect runtime codegen.

@gen2/postgres
  SQL, DDL, RLS, migrations.

@gen2/react or @gen2/solid
  UI target emitters.
```

## 7.2 Type interop

Use Effect Schema as the best-supported schema backend:

```ts
const Email = gen.type
  .fromEffectSchema(Schema.String.check(Schema.isPattern(/.+@.+/)))
  .withTrait("type.email");
```

But keep canonical Gen2 type information separate:

```txt
Effect Schema:
  runtime validation
  encoded/decoded representation
  schema tooling

Gen2 Type:
  semantic identity
  target mapping
  traits
  graph relationships
  source refs
  storage/wire intent
```

## 7.3 SchemaRepresentation interop

Effect v4’s `SchemaRepresentation` can convert a schema to a portable data structure and back, store schemas on disk, send schemas over the network, rebuild runtime schemas, convert to JSON Schema, and generate TypeScript code. ([GitHub][2])

Gen2 should use this where possible for type representation.

But Gen2 must not rely on it for all logic, because SchemaRepresentation intentionally cannot round-trip transformations or arbitrary custom predicates. ([GitHub][2])

Therefore:

```txt
Portable type shape:
  Effect SchemaRepresentation-compatible.

Portable logic:
  Gen2 Expr.

Opaque runtime logic:
  RuntimeAdapterRef with diagnostics.
```

## 7.4 Transformation interop

Gen2 `Transform` should lower to Effect Schema transformations when possible.

Effect v4’s schema docs describe transformations as reusable objects that can be composed with schemas. ([GitHub][2])

Mapping:

```txt
Gen2 Transform with Expr decode/encode:
  can lower to generated JS or Effect SchemaTransformation if compatible.

Gen2 Transform with RuntimeAdapterRef:
  can lower to hand-written runtime code but may not be SQL/JSON-schema portable.

Effect SchemaTransformation:
  can be imported into Gen2 as opaque or partially inspectable transform.
```

## 7.5 Service interop

Gen2 should map service nodes to Effect v4 `Context.Service`.

```ts
const Database = gen.service("Database", {
  query: gen.fn(...)
});
```

Effect emitter:

```ts
class Database extends Context.Service<
  Database,
  {
    readonly query: (sql: string) => Effect.Effect<Rows>;
  }
>()("Database") {}
```

Gen2 relationships:

```txt
Action requires Database
Provider provides Database
Boundary requires AuthSession
```

Effect runtime:

```txt
Action node -> Effect<Out, Err, Requirements>
Provider node -> Layer<RequirementsOut, Error, RequirementsIn>
```

## 7.6 Avoid structural magic

Effect v4’s migration away from some overly-broad structural behaviors is a warning for Gen2.

Gen2 should avoid letting everything become everything:

```txt
Entity is not an Expr.
Rule is not boolean.
Action is not a JS function.
Provider is not a service implementation.
Edge is not just tuple data.
```

Use explicit adapters:

```ts
asNode(entity);
asExpr(rule);
asEdge(fieldOwnership);
toEffect(action);
toEffectSchema(type);
```

This keeps errors local and avoids surprising inference failures.

---

# 8. Edge-centered topology model

First-class relationships let Gen2 represent different graph topologies without hardcoding separate systems.

## 8.1 Domain topology

```txt
Entity owns Field
Field hasType Type
Entity references Entity
Entity hasMany Entity
Entity belongsTo Entity
Edge hasCardinality one/many/optional
Edge carries join payload Type
```

Example:

```ts
const User = domain.entity("User", {
  id: type.uuid(),
  email: type.email(),
});

const Organization = domain.entity("Organization", {
  id: type.uuid(),
  name: type.string(),
});

const Membership = graph.relationship({
  kind: "memberOf",
  endpoints: [
    { role: "member", target: User },
    { role: "organization", target: Organization },
    { role: "role", target: RoleType },
  ],
  traits: ["relationship.domain", "relationship.manyToMany"],
});
```

## 8.2 Rule dependency topology

```txt
Rule reads Field
Rule traverses Edge
Rule dependsOn Rule
Rule guards Action
Rule lowersTo RLSPolicy
```

This makes it possible to answer:

```txt
Which mutations may invalidate this rule?
Can this rule lower to SQL?
Which fields must be hydrated for client-side evaluation?
```

## 8.3 Reactivity topology

```txt
Query reads Field
Query derives Key
Action writes Field
Action invalidates Key
Action patches Query
Rule reads Field
View dependsOn Query
```

Derived pass:

```txt
Action writes Project.status
Rule reads Project.status
Query uses Rule
View depends on Query
=> mutation invalidates or patches View's query key
```

## 8.4 Storage topology

```txt
Entity storedIn Table
Field mapsTo Column
Field encodedBy Transform
Rule lowersTo RLSPolicy
Index covers Field
Edge lowersTo ForeignKey
```

This makes target-specific features like GIN indexes clean:

```txt
Field has trait postgres.ginIndex
Emitter finds trait and maps to index artifact
```

The current docs already use the custom GIN index example as proof that traits plus emitters are the extension mechanism.

## 8.5 UI topology

```txt
View displays Field
View edits Field
View submits Action
View enabledWhen Rule
View hiddenWhen Rule
Field renderedAs Component
View uses DesignSystem
```

The existing README’s `deleteUser` example says the compiler can derive disabled UI states from the same rule used for authorization.

In the revised model, this is a relationship trace:

```txt
deleteUser guardedBy isAdmin
userListForm submits deleteUser
submitButton enabledWhen isAdmin
isAdmin lowersTo server guard
isAdmin lowersTo RLS policy
```

## 8.6 Runtime-boundary topology

```txt
ClientNode crosses Boundary
Boundary transports Callable
Callable requires Provider
Boundary serializes Type using Transform
Boundary enforces Rule
```

## 8.7 Artifact topology

```txt
Artifact generatedFrom Node
Artifact generatedFrom Edge
Artifact generatedBy Pass
Artifact lowersTo Target
Artifact sourceMappedTo Expr
```

This is the basis for DevTools:

```txt
Generated button disabled?
  trace to View submits Action
  trace to Action guardedBy Rule
  trace to Rule reads User.role
```

---

# 9. Compiler phases

## 9.1 Registration

User code registers graph objects:

```txt
types
traits
transforms
expressions
nodes
relationships
passes
```

Registration should be cheap and mostly structural.

## 9.2 Check

Check passes validate local and global consistency.

Examples:

```txt
trait applies to compatible target
trait conflicts are not violated
relationship endpoint roles are valid
relationship cardinality is supported by target
node claiming callable has input/output/call body
node claiming writable declares write relationships or opaque effect
expr output type matches expected type
transform source/target types align
client graph does not depend on server-only type
rule intended for SQL is SQL-lowerable
action optimistic plan has inverse/idempotency law
```

## 9.3 Derive

Derive passes add inferred relationships and nodes.

Examples:

```txt
infer Rule reads Field from Expr refs
infer Action writes Field from action body
infer Query reads Field
infer View enabledWhen Rule
infer Action invalidates Query keys
infer Entity storedIn default table
infer Field mapsTo default column
infer OpenAPI route from Boundary
```

Derived relationships must record provenance:

```ts
type Provenance =
  | { kind: "explicit"; source: SourceSpan }
  | { kind: "inferred"; pass: Id<"pass">; confidence: "exact" | "conservative" }
  | { kind: "lowered"; from: Id<any>; pass: Id<"pass"> };
```

## 9.4 Lower

Lowering maps semantic concepts to target-intermediate nodes.

Examples:

```txt
Entity -> SQL table model
Rule -> SQL predicate model
Action -> HTTP handler model
View -> component model
Type -> JSON Schema model
Provider -> Effect Layer model
```

## 9.5 Emit

Emit passes produce artifacts:

```txt
.sql
.ts
.tsx
.json
.openapi.json
devtools graph
test files
docs
```

## 9.6 Prune

Pruning should work over relationships:

```txt
start from boundaries
follow required relationships
keep reachable semantic graph
drop unused implementation graph
```

The existing README describes graph pruning / artifact shaking from app boundaries as part of the compiler pipeline.

---

# 10. Public API sketch

## 10.1 Kernel API

```ts
const g = createGraph();

const Email = g.type({
  kind: "string",
  traits: ["type.email", "type.nonEmpty"],
  metadata: {
    title: "Email",
    description: "User login email",
  },
});

const User = g.node({
  kind: "entity",
  name: "User",
  output: g.type.object({
    id: g.type.uuid(),
    email: Email,
  }),
  traits: ["node.entity", "node.identityBearing"],
});

const isAdmin = g.node({
  kind: "rule",
  name: "isAdmin",
  output: g.type.boolean(),
  body: g.expr.eq(g.expr.get(g.expr.ref("actor"), "role"), g.expr.literal("admin")),
  traits: ["node.rule", "expr.pure"],
});

g.relationship({
  kind: "guards",
  endpoints: [
    { role: "guard", target: isAdmin },
    { role: "guarded", target: deleteUser },
  ],
  traits: ["relationship.authorization"],
});
```

## 10.2 Standard-library API

The user-facing API should be much nicer:

```ts
const User = gen.entity("User", {
  id: gen.type.uuid(),
  email: gen.type.email(),
  role: gen.type.enum("Role", ["admin", "user"]),
  archivedAt: gen.type.datetime().optional(),
});

const isAdmin = gen.rule("isAdmin", ({ actor }) => actor.role.eq("admin"));

const deleteUser = gen.action("deleteUser", {
  input: User.id,
  returns: User,
  auth: isAdmin,
  body: ({ input }) => User.deleteWhere(User.id.eq(input)),
});

const userList = gen.view.list(User, {
  actions: [deleteUser],
});
```

This emits the same core graph.

---

# 11. Standard library layers

## 11.1 `@gen2/domain`

Provides:

```txt
entity
field
domain relationship
identity
state transition
aggregate
value object
```

Built on:

```txt
Node
Type
Edge
Trait
Expr
```

## 11.2 `@gen2/logic`

Provides:

```txt
rule
predicate
policy
precondition
postcondition
law
operation
combiner
```

Built on:

```txt
Expr
Trait
Node
Edge
```

## 11.3 `@gen2/callable`

Provides:

```txt
query
action
workflow
plan
effect footprint
requirements
```

Built on:

```txt
Node
Type
Expr
Edge
Trait
Transform
```

## 11.4 `@gen2/reactivity`

Provides:

```txt
key
resource
mutation
invalidation
patch
subscription
```

Built on:

```txt
Edge topology:
  reads
  writes
  derives
  invalidates
  patches
```

## 11.5 `@gen2/storage`

Provides:

```txt
table
column
index
migration
RLS
IVM
storage mapping
```

Built on:

```txt
Type
Transform
Edge
Trait
Pass
```

## 11.6 `@gen2/ui`

Provides:

```txt
view
form
list
editor
crud
component slot
design token
visibility
editability
```

Built on:

```txt
Node
Edge
Rule
Type metadata
```

## 11.7 `@gen2/effect`

Provides:

```txt
fromEffectSchema
toEffectSchema
toSchemaRepresentation
fromSchemaRepresentation
toContextService
toLayer
toEffectRuntime
```

---

# 12. Diagnostics model

Diagnostics should point to graph facts, not just files.

```ts
type Diagnostic = {
  readonly code: string;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;

  readonly subject:
    | Id<"type">
    | Id<"expr">
    | Id<"node">
    | Id<"relationship">
    | Id<"trait">
    | Id<"transform">;

  readonly related?: readonly DiagnosticRelated[];
  readonly source?: SourceSpan;
  readonly suggestedFixes?: readonly Fix[];
};
```

Examples:

```txt
trait:invalid-target
relationship:missing-endpoint
relationship:cardinality-not-supported
expr:opaque-not-sql-lowerable
node:callable-missing-input
node:effectful-missing-effects
transform:opaque-crosses-boundary
rule:client-uses-server-only-field
action:optimistic-rollback-not-provable
storage:relation-needs-join-table
```

Diagnostics should use relationship traces:

```txt
Button.disabled was derived from:
  View submits deleteUser
  deleteUser guardedBy isAdmin
  isAdmin reads User.role
```

---

# 13. Artifact/source map model

Every emitted artifact should maintain backpointers to graph objects.

```ts
type Artifact = {
  readonly id: Id<"artifact">;
  readonly target: string;
  readonly kind: string;
  readonly path?: string;
  readonly content: string | Uint8Array | JsonValue;

  readonly generatedFrom: readonly (
    | Id<"node">
    | Id<"relationship">
    | Id<"expr">
    | Id<"type">
    | Id<"trait">
  )[];

  readonly generatedBy: Id<"pass">;
  readonly sourceMap?: SemanticSourceMap;
};
```

This supports:

```txt
debugging generated UI
auditing RLS
explaining invalidation
test generation
docs
migration review
devtools visualization
```

---

# 14. Revised primitive classification

## True core

```txt
Id
Type
Expr
Transform
Trait
Metadata
Node
Edge
Graph
Pass
```

## Core-adjacent but not primitive

```txt
Law
Capability
Requirement
EffectFootprint
SourceSpan
Artifact
Diagnostic
```

These are supporting records used by traits, nodes, relationships, and passes. They do not need top-level primitive status.

## Standard library

```txt
Entity
Field
DomainRelation
Rule
Operation
Function
Query
Action
Workflow
Dispatch
StoredValue
Combiner
Key
ReactiveResource
ReactiveMutation
Boundary
StorageContainer
EntityView
DesignSystem
Provider
Checker
ArtifactEmitter
```

---

# 15. MVP plan

## Phase 0: Kernel

Build only:

```txt
Id
Metadata
Trait
Type
Expr
Transform
Node
Edge
Graph
Pass
Diagnostic
Artifact
```

Deliverables:

```txt
graph registry
trait checker
relationship checker
expr type checker
pass runner
JSON export/import
devtools graph dump
```

No Postgres. No UI. No Effect runtime yet.

## Phase 1: Domain + rule stdlib

Build:

```txt
entity
field
relationship kinds:
  owns
  hasType
  reads
  writes
  guards
rule
action
query
```

Deliverable demo:

```txt
User entity
isAdmin rule
deleteUser action
derived read/write/guard relationships
diagnostics
graph visualization
```

## Phase 2: Postgres target

Build:

```txt
entity -> table
field -> column
relationship references -> foreign key
rule -> SQL predicate where possible
rule guarded action -> RLS/server guard
trait postgres.index -> index
```

Deliverable demo:

```txt
Gen2 graph -> SQL DDL + RLS
```

## Phase 3: Effect target

Build:

```txt
Type -> Effect Schema
Transform -> SchemaTransformation where possible
Provider -> Context.Service / Layer
Action -> Effect runtime function
Diagnostics -> Effect-friendly errors
```

Deliverable demo:

```txt
Gen2 action emitted as Effect program with typed requirements
```

## Phase 4: UI target

Build:

```txt
EntityView stdlib
View displays/edits/submits relationships
Rule-derived disabled states
Form validation from Type/Traits
```

Deliverable demo:

```txt
deleteUser form button disabled if !isAdmin
same rule lowers to server guard and RLS
```

## Phase 5: Reactivity

Build:

```txt
Key
Query derives Key
Action writes Field
Rule reads Field
Derive invalidation relationships
Emit TanStack Query or Effect Atom integration
```

Deliverable demo:

```txt
mutation invalidates exact query keys when provable,
falls back conservatively when opaque
```

---

# 16. Major implications

## 16.1 Gen2 becomes easier to explain

Old explanation:

```txt
Gen2 has Entity, SemanticType, Rule, Callable, Dispatch, Boundary,
StorageContainer, EntityView, DesignSystem, Requirement, Provider...
```

New explanation:

```txt
Gen2 is a typed semantic graph compiler.

The core has:
  typed values,
  typed expressions,
  semantic nodes,
  semantic relationships,
  traits,
  compiler passes.

Everything else is a library built on that graph.
```

## 16.2 Edges become the source of derivation

Instead of each subsystem owning private dependency logic, relationships become shared:

```txt
auth uses guards/reads
reactivity uses reads/writes/invalidates
storage uses stores/mapsTo/references
UI uses displays/edits/submits/enabledWhen
artifacts use generatedFrom/lowersTo
```

## 16.3 The compiler gets better debugging

Because relationships have provenance:

```txt
explicit
inferred exact
inferred conservative
lowered
generated
```

Gen2 can explain why it emitted something.

## 16.4 Effect interop becomes principled

Effect is not bolted on. It maps to clear concepts:

```txt
Gen2 Type        <-> Effect Schema
Gen2 Transform   <-> SchemaTransformation / Codec
Gen2 Service     <-> Context.Service
Gen2 Provider    <-> Layer
Gen2 Action      -> Effect<Out, Err, Requirements>
Gen2 Metadata    <-> Schema annotations where safe
```

## 16.5 The public API can remain ergonomic

Users do not need to manually create nodes and relationships all day.

They use:

```ts
gen.entity(...)
gen.rule(...)
gen.action(...)
gen.view(...)
```

The stdlib emits the graph.

The kernel stays small.

---

# 17. Key design rules

## Rule 1: No new primitive unless graph composition cannot express it

Before adding a primitive, ask:

```txt
Can this be a Node?
Can this be a Edge?
Can this be a Trait?
Can this be Metadata?
Can this be an Expr?
Can this be a Transform?
```

Only add core concepts when the answer is no.

## Rule 2: Traits are checked claims, not comments

A trait must declare:

```txt
where it applies
what it implies
what it conflicts with
what it requires
how it is checked
how targets may interpret it
```

## Rule 3: Edges carry semantics

Do not hide semantic links in arbitrary node fields.

Prefer:

```txt
Edge(action, field, "writes")
```

over:

```ts
action.writeSet = [...]
```

The former is globally queryable.

## Rule 4: Opaque code must be explicit

Opaque JS is allowed, but it should degrade capabilities and emit diagnostics.

```txt
opaque predicate:
  can run on server
  cannot lower to SQL
  cannot derive exact field dependencies
  may force conservative invalidation
```

## Rule 5: Effect is a first-class adapter, not the kernel

Effect v4 is promising, but it is still beta and evolving. Gen2 should learn from it and target it deeply, without making the semantic graph depend on it. ([Effect][1])

---

# 18. Final recommended architecture

```txt
@gen2/core
  Id
  Metadata
  Trait
  Type
  Expr
  Transform
  Node
  Edge
  Graph
  Pass
  Diagnostic
  Artifact

@gen2/stdlib
  Entity
  Field
  Rule
  Query
  Action
  Dispatch
  Boundary
  Storage
  View
  Provider
  Key
  Workflow

@gen2/effect
  Effect Schema interop
  SchemaRepresentation interop
  Context.Service interop
  Layer emission
  Effect runtime emission

@gen2/postgres
  DDL
  RLS
  migrations
  indexes
  triggers
  IVM

@gen2/ui-*
  React/Solid/etc. component generation

@gen2/devtools
  graph visualization
  artifact tracing
  diagnostics explorer
```

The final mental model:

```txt
Type gives values meaning.
Expr gives logic inspectable shape.
Transform gives representations typed movement.
Node gives semantic objects identity.
Edge gives topology meaning.
Trait gives checked semantic claims.
Metadata gives human/tool annotations.
Graph gives global context.
Pass gives evolution, derivation, lowering, and emission.
```

That is the revised Gen2 core.

[18.Appendix: Staged Migration Plan]

Yes. I would **not** refactor this as a big rewrite. The repo already has most of the ingredients. The right move is to introduce the revised core as an **underlay**, then gradually make the current modules compile down into it.

The current project has a very broad public surface: the package root exports `core`, `types`, `entity`, `expression`, `storage`, `relation`, `query`, `function`, `api`, `ui`, `authz`, `events`, `lifecycle`, `crud`, `reactivity`, `router`, `hydration`, `services`, `rules`, `reaction`, `plan`, `context`, `requirements`, and `state`. The current `GenContext` mirrors that breadth by storing separate arrays for almost every concept: entities, relations, queries, functions, routes, policies, events, views, services, rules, reactions, providers, workflows, boundary plans, offline queues, and more.

That tells me the first refactor goal should be:

> Stop adding more top-level registries. Add one semantic graph registry underneath them.

## The refactor target

I would introduce:

```txt
src/kernel/
  id.ts
  metadata.ts
  trait.ts
  type.ts
  expr.ts
  transform.ts
  node.ts
  edge.ts
  graph.ts
  pass.ts
  diagnostic.ts
  artifact.ts
  index.ts
```

Then gradually make the current modules emit kernel objects.

The destination architecture:

```txt
Existing public API
  gen.entity(...)
  gen.rule(...)
  gen.func.action(...)
  gen.relation(...)
  gen.ui...
        |
        v
Stdlib adapters
  entity -> kernel node + edges
  rule -> kernel node + expr
  action -> kernel node + read/write/guard edges
  relation -> kernel edge
        |
        v
Kernel graph
  Id
  Type
  Expr
  Transform
  Trait
  Metadata
  Node
  Edge
  Graph
  Pass
```

Do **not** delete the current modules early. Keep them as compatibility/stdlib layers.

## What you already have

You already have a good `Id/Ref` base. `src/core/refs.ts` defines stable IDs for entities, fields, relations, functions, rules, policies, key families, contexts, services, providers, routes, workflows, and migrations, plus typed `Ref` variants and identity helpers. That should become the foundation for kernel identity rather than being replaced.

You also already have `StaticNode` in `src/core/node.ts`, with traits, input/output semantic types, errors, requirements, effects, metadata, symbol info, call plans, and type inference helpers. This is very close to the revised `Node` primitive.

You already have `SemanticType` in `src/types/semantic.ts`, carrying kind, TypeScript type name, storage representation, optional wire representation, serializer/deserializer flags, server-only marking, traits, enum values, validation, and merge strategy. That maps cleanly to revised `Type`.

You already have `Expr` in `src/expression/expr.ts`, binding an AST to a value type, phase, requirements, effects, opacity marker, and flattened refs. That maps cleanly to revised `Expr`.

The biggest missing primitive is **Edge**. Today, `src/relation/relation.ts` models domain entity relations specifically: one-to-one, one-to-many, many-to-one, many-to-many, integrity modes, foreign keys, deletion behavior, and link entities. That should become a **stdlib domain edge** built on a more general kernel `Edge`.

## The main problem to fix

The current architecture has two parallel structures:

```txt
1. Rich module-specific arrays on GenContext
2. Partial generic core: refs, nodes, traits, diagnostics, artifacts
```

The refactor should unify them under:

```ts
interface KernelGraph {
  ids: ...
  types: ...
  exprs: ...
  transforms: ...
  traits: ...
  nodes: ...
  edges: ...
}
```

Then the current `GenContext` becomes:

```ts
interface GenContext {
  graph: KernelGraph;

  // temporary compatibility views:
  entities: Entity[];
  relations: Relation[];
  query_functions: QueryFunction[];
  action_functions: ActionFunction[];
  ...
}
```

That lets you migrate module by module without breaking the public API.

## Phase 1: add the kernel underlay

Create `src/kernel/*` and re-export it from `src/core/index.ts`.

Start small:

```ts
// src/kernel/id.ts
export type KernelId<Kind extends string = string> = string & {
  readonly __kernelId?: Kind;
};

export interface KernelRef<Kind extends string = string, Ts = unknown> {
  readonly kind: Kind;
  readonly id?: KernelId<Kind>;
  readonly name?: string;
  readonly _ts?: Ts;
}
```

But don't throw away existing `Ref`. Instead bridge it:

```ts
export type KernelObjectRef = Ref | KernelRef;

export const refToKernelRef = (ref: Ref): KernelRef => ({
  kind: ref.kind,
  id: ref.id as KernelId,
  name: ref.name,
});
```

Then add:

```ts
interface KernelMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly docs?: string;
  readonly examples?: readonly unknown[];
  readonly source?: SourceSpan;
  readonly custom?: Record<string, unknown>;
}

interface KernelTrait {
  readonly id: KernelId<"trait">;
  readonly name: string;
  readonly appliesTo: readonly KernelTargetKind[];
  readonly implies?: readonly KernelId<"trait">[];
  readonly conflictsWith?: readonly KernelId<"trait">[];
  readonly metadata?: KernelMetadata;
}
```

This is a better version of current traits. Right now type traits are relatively narrow: name, optional `applies_to`, validation expression, storage expression, error message, and queryable flag. Node traits are separately represented as strings / trait refs. The refactor should unify those under one trait object while preserving compatibility helpers.

## Phase 2: introduce `Edge`

Add:

```ts
export interface KernelEdgeEndpoint {
  readonly role: string;
  readonly target: KernelObjectRef;
  readonly cardinality?: "one" | "optional" | "many";
}

export interface KernelEdge {
  readonly id?: KernelId<"edge">;
  readonly kind: string;
  readonly endpoints: readonly KernelEdgeEndpoint[];
  readonly payloadType?: KernelObjectRef;
  readonly traits: readonly KernelTraitRef[];
  readonly metadata?: KernelMetadata;
  readonly provenance?: KernelProvenance;
}
```

This becomes the generic substrate for:

```txt
owns
hasType
reads
writes
guards
requires
provides
derives
invalidates
patches
submits
displays
edits
stores
mapsTo
crossesBoundary
lowersTo
generatedFrom
```

Then make current `Relation` also emit a kernel edge:

```ts
export const relationToKernelEdge = (relation: Relation): KernelEdge => ({
  kind: "domain.relation",
  endpoints: [
    { role: "from_entity", target: relation.from_entity.ref, cardinality: "one" },
    { role: "to_entity", target: relation.to_entity.ref, cardinality: "one" },
    { role: "from_field", target: relation.from_field.ref, cardinality: "one" },
    { role: "to_field", target: relation.to_field.ref, cardinality: "one" },
  ],
  traits: [`relation.${relation.kind}`, `integrity.${relation.integrity.kind}`],
  metadata: {
    title: relation.name,
  },
});
```

Current `Relation` remains the ergonomic domain API. Kernel `Edge` becomes the general graph primitive.

## Phase 3: add `graph` to `GenContext`

Change `createGen()` to initialize a graph:

```ts
const ctx: GenContext = {
  graph: createKernelGraph(),
  entities: [],
  relations: [],
  ...
}
```

For now, do dual writes:

```ts
ctx.entities.push(entity);
ctx.graph.nodes.push(entityToKernelNode(entity));
ctx.graph.edges.push(...entityToKernelEdges(entity));
```

This dual-write period is important. It gives you a migration path without breaking all checkers.

## Phase 4: convert modules into graph emitters

Do this one module at a time.

Recommended order:

```txt
1. entity
2. relation
3. expression
4. rules
5. function/action/query
6. authz
7. reactivity
8. ui
9. storage
10. lifecycle
```

Why this order: entity/relation/expression give you the graph substrate; rules/functions/authz/reactivity become much easier once read/write/guard edges exist.

Example mappings:

```txt
Entity
  -> Node(kind: "entity")
  -> Edge(kind: "owns", entity -> field)
  -> Edge(kind: "hasType", field -> type)

Rule
  -> Node(kind: "rule", body: Expr<boolean>)
  -> Edge(kind: "reads", rule -> field)
  -> Edge(kind: "guards", rule -> action/policy/view)

Action
  -> Node(kind: "action")
  -> Edge(kind: "writes", action -> field)
  -> Edge(kind: "requires", action -> provider/context)
  -> Edge(kind: "guardedBy", action -> rule)

Query
  -> Node(kind: "query")
  -> Edge(kind: "reads", query -> field)
  -> Edge(kind: "derives", query -> key)

View
  -> Node(kind: "view")
  -> Edge(kind: "displays", view -> field)
  -> Edge(kind: "submits", view -> action)
  -> Edge(kind: "enabledWhen", view/control -> rule)
```

## Phase 5: replace lifecycle checker registration with passes

Current lifecycle manually registers many module checkers: entities, refs, contracts, config, storage, mappings, relations, queries, functions, API, authz, events, reactivity, rules, reactions, nodes, UI, CRUD, lists, context/storage, requirements, workflows, boundary plans, obligations, merge, offline, and more.

Keep that behavior, but wrap it in a unified pass protocol:

```ts
interface KernelPass {
  readonly name: string;
  readonly phase: "check" | "derive" | "lower" | "emit";
  readonly run: (ctx: GenContext) => readonly Diagnostic[] | PassResult;
}
```

Then existing checkers become:

```ts
registerPass(ctx, {
  name: "relation.check",
  phase: "check",
  run: (ctx) => checkRelations(ctx.relations),
});
```

Later, make them graph-native:

```ts
registerPass(ctx, {
  name: "edge.domain.check",
  phase: "check",
  run: (ctx) => checkDomainEdges(ctx.graph),
});
```

This lets you migrate checkers incrementally.

## Phase 6: make derivation explicit

Once `Edge` exists, add derive passes:

```txt
derive.entity.fieldEdges
derive.rule.reads
derive.action.writes
derive.query.reads
derive.auth.guards
derive.reactivity.invalidates
derive.storage.mapsTo
derive.artifact.generatedFrom
```

This is where Gen2 starts becoming much cleaner.

Instead of each module holding private dependency logic, the graph becomes queryable:

```ts
graph.edges({
  kind: "writes",
  from: action.ref,
});

graph.edges({
  kind: "reads",
  to: field.ref,
});
```

Then reactivity can become graph logic:

```txt
action writes field
rule reads field
query uses rule
resource derives key
=> mutation invalidates key
```

## Phase 7: add Effect interop as an adapter, not a dependency

Your package currently has `@effect-atom/atom` as a dev dependency, but not Effect itself. That's good. Keep `@gen2/core` independent.

Add a future package/module:

```txt
src/adapters/effect/
  schema.ts
  context.ts
  layer.ts
  runtime.ts
```

Mapping:

```txt
Kernel Type       <-> Effect Schema
Kernel Transform  <-> Effect Schema transformation / codec
Kernel Provider   <-> Effect Layer
Kernel Requirement/Service <-> Effect Context.Service
Kernel Action     -> Effect runtime program
```

But do not make `Expr` an Effect program. Keep `Expr` static and portable.

## The first concrete PR I'd make

PR 1 should be boring and non-breaking:

```txt
Title:
  Add kernel graph primitives

Files:
  src/kernel/id.ts
  src/kernel/metadata.ts
  src/kernel/trait.ts
  src/kernel/type.ts
  src/kernel/expr.ts
  src/kernel/transform.ts
  src/kernel/node.ts
  src/kernel/edge.ts
  src/kernel/graph.ts
  src/kernel/pass.ts
  src/kernel/index.ts

Also:
  export * as kernel from "./kernel/index.ts" in src/index.ts
  export * from "../kernel/index.ts" or selected exports in src/core/index.ts
```

No existing code should be rewritten in PR 1.

PR 1 acceptance criteria:

```txt
vp check passes
vp test passes
kernel graph can register nodes
kernel graph can register edges
edge endpoints can target existing Ref objects
existing public API unchanged
```

## PR 2

Add adapters, still non-breaking:

```txt
src/entity/kernel.ts
src/relation/kernel.ts
src/rules/kernel.ts
src/function/kernel.ts
```

Example:

```ts
export const entityToKernelNode = (entity: Entity): KernelNode => ...
export const relationToKernelEdge = (relation: Relation): KernelEdge => ...
```

Acceptance criteria:

```txt
Existing entity/relation builders still work.
A test can build User/Post/author relation and inspect graph nodes/edges.
No lifecycle behavior changes yet.
```

## PR 3

Add `ctx.graph` and dual-write selected modules:

```txt
createGen initializes graph
bindEntity writes entity + kernel node
bindRelation writes relation + kernel edge
```

Acceptance criteria:

```txt
Existing tests pass.
New graph tests pass.
No checker migration yet.
```

## PR 4

Convert relation checking to graph-aware checking.

Current relation checks are a good first target because relations are already semantically rich and self-contained: type matching, cross-store FK errors, nullable requirements for `set_null`, default requirements for `set_default`, many-to-many link entity requirements, and inverse consistency.

Start by making relation checks compare old and new behavior.

```ts
const oldDiagnostics = checkRelations(ctx.relations);
const newDiagnostics = checkDomainEdges(ctx.graph);
expectEquivalentDiagnostics(oldDiagnostics, newDiagnostics);
```

Then migrate lifecycle to the new checker once equivalent.

## What not to do

Do not start by renaming everything.

Do not delete `Entity`, `Relation`, `Rule`, `ActionFunction`, or `QueryFunction`.

Do not try to make the public API match the new kernel immediately.

Do not collapse all modules into `kernel`.

Do not move Effect into core.

The public API should stay ergonomic:

```ts
gen.entity(...)
gen.rule(...)
gen.func.action(...)
gen.relation(...)
```

The implementation should become graph-backed.

## The guiding migration rule

For every existing concept, ask:

```txt
Is this a semantic object?
  -> Kernel Node

Is this a semantic connection?
  -> Kernel Edge

Is this inspectable logic?
  -> Kernel Expr

Is this a value shape?
  -> Kernel Type

Is this a representation conversion?
  -> Kernel Transform

Is this a checked semantic claim?
  -> Kernel Trait

Is this passive descriptive data?
  -> Kernel Metadata
```

That gives you a path out of the current large registry model without breaking the library.

## My recommendation

Start with a branch like:

```txt
refactor/kernel-graph-underlay
```

Then implement only PR 1 and PR 2 before touching lifecycle. The current codebase is already close enough that you do not need a conceptual rewrite; you need a **semantic graph underlay** and then a staged migration of each module onto it.

[1]: https://effect.website/blog/releases/effect/40-beta/ "Effect v4 Beta | Effect Documentation"
[2]: https://raw.githubusercontent.com/Effect-TS/effect-smol/main/packages/effect/SCHEMA.md "raw.githubusercontent.com"
[3]: https://github.com/Effect-TS/effect-smol/blob/main/migration/services.md "effect-smol/migration/services.md at main · Effect-TS/effect-smol · GitHub"

Yes. My main suggestion is: **design the new kernel around two synchronized layers**:

```txt id="hiiq3x"
Runtime IR values
  inspectable, serializable-ish, pass-friendly, no magic strings

Type-level mirrors
  phantom generics that carry inference, capabilities, requirements, effects, laws, and traits
```

The project is already pointed in this direction. `StaticNode` already carries traits, input/output semantic types, requirements, effects, symbol metadata, and phantom `_input`, `_output`, `_requires`, `_effects`, and `_traits` slots. `Expr` already carries type, phase, requirements, effects, AST, opacity, and refs. `SemanticType` already carries TS type, semantic kind, storage/wire representation, serializer/deserializer flags, server-only marking, traits, validation, and merge strategy.

So this is not a new idea bolted on. It is a consolidation of what the codebase is already becoming.

## 1. Make the kernel symbol-first, not string-first

Given the library’s philosophy, I would avoid APIs like:

```ts id="y8l6wy"
Node<"query", In, Out, Has<"node.callable">>
Edge<"writes", ...>
Has<"law.idempotent">
```

Use typed symbol definitions instead:

```ts id="l8slxn"
Node<typeof QueryNodeKind, In, Out, Has<typeof NodeCallable>>
Edge<typeof WritesEdgeKind, ...>
Has<typeof LawIdempotent>
```

That fits the existing `checkMagicStrings` direction: the repo already has a diagnostic that warns when raw strings are used where typed refs or stable IDs are expected, while still allowing strings for external names like DB names, URL templates, env vars, filenames, operation IDs, and CSS classes.

So introduce a shared symbol system:

```ts id="r80lr4"
defineNodeKind(...)
defineEdgeKind(...)
defineEndpointRole(...)
defineTrait(...)
defineLaw(...)
defineCapability(...)
```

Then all graph APIs should take definitions, not strings:

```ts id="d79t2s"
graph.nodesWithTrait(NodeCallable);
graph.edgesOfKind(WritesEdgeKind);
graph.edgesFrom(action.ref, WritesEdgeKind);
graph.hasTrait(expr, SqlLowerable);
```

This gives you rename safety, autocomplete, stable identity, and agent-friendly refactorability.

## 2. Use a `GType<Decoded, Encoded, DecodeR, EncodeR, Traits>` shape

Effect v4 makes this more obvious. Its Schema system supports validation, TypeScript inference, transformation, serialization/deserialization, and schema composition. ([Effect][1]) Effect v4 also emphasizes services/dependency tracking in the type system. ([Effect][2])

So I would evolve `SemanticType<T>` toward:

```ts id="qyavmo"
interface GType<
  Decoded,
  Encoded = Decoded,
  DecodeR = never,
  EncodeR = never,
  Traits extends TraitSet = EmptyTraits,
> {
  readonly kind: TypeKindDef;
  readonly id?: TypeId;

  readonly decoded?: Phantom<Decoded>;
  readonly encoded?: Phantom<Encoded>;
  readonly decodeRequirements?: Phantom<DecodeR>;
  readonly encodeRequirements?: Phantom<EncodeR>;
  readonly traits: readonly TraitDef[];

  readonly storage?: Representation;
  readonly wire?: Representation;
  readonly metadata?: Metadata;

  readonly effectSchema?: EffectSchemaAdapter<Decoded, Encoded, DecodeR, EncodeR>;

  readonly _traits?: Traits;
}
```

This gives you:

```txt id="h6dw8v"
Decoded
  the domain value

Encoded
  wire/storage representation

DecodeR
  services needed to decode/hydrate

EncodeR
  services needed to encode/store

Traits
  semantic capabilities/laws/metadata at type level
```

This also keeps Effect as an adapter, not the substrate. Effect v4 is currently beta, with the docs highlighting performance, bundle-size, and DX improvements, but also making clear it is a major breaking-change release. ([Effect][3])

## 3. Keep “value first, types mirror” as the core inference rule

The runtime object should always be the source of truth:

```ts id="jggwp6"
const Email = defineType({
  kind: StringTypeKind,
  traits: [EmailTrait, QueryableTrait],
});
```

The type-level mirror should be inferred from that value:

```ts id="lj6xf4"
type Email = InferDecoded<typeof Email>; // string
type EmailTraits = InferTraits<typeof Email>;
```

Avoid APIs where users must manually pass the same fact twice:

```ts id="u3lxkh"
// Avoid
defineType<string, string, Has<typeof EmailTrait>>({
  traits: [EmailTrait],
});
```

Prefer:

```ts id="hplggc"
const Email = string().pipe(withTrait(EmailTrait)).pipe(withTrait(QueryableTrait));
```

The builder should compute the type.

## 4. Bubble up everything that matters

Every composable object should infer and bubble up:

```txt id="x26lfr"
Input
Output
Error
Requirements
Effects
Traits
Refs
Read set
Write set
Laws
Capabilities needed
Opacity
Placement constraints
```

For example:

```ts id="qknj49"
type Node<
  Kind,
  In,
  Out,
  Err,
  Req,
  Eff,
  Traits
>
```

For `Expr`:

```ts id="k143p7"
type Expr<
  Out,
  Req = never,
  Eff = never,
  Traits = EmptyTraits,
  Refs = never
>
```

For `Transform`:

```ts id="mzldie"
type Transform<
  From,
  To,
  DecodeR = never,
  EncodeR = never,
  Err = never,
  Traits = EmptyTraits
>
```

For `Edge`:

```ts id="3msnia"
type Edge<
  Kind,
  Endpoints,
  Payload = never,
  Traits = EmptyTraits
>
```

Then composition works by unioning or intersecting the right dimensions:

```txt id="h7qi6j"
sequence requirements = ReqA | ReqB
sequence effects = EffA | EffB
sequence errors = ErrA | ErrB
parallel output = { a: OutA; b: OutB }
chain input/output = OutA must flow into InB
traits = TraitsA & TraitsB, or derived traits when proven
```

This is the “bubble up” half.

## 5. Use flow-down contextual builders

Bubble-up inference is not enough. You also want **context flowing down** so users do not have to annotate everything.

Example:

```ts id="z0xick"
const User = gen.entity("User", {
  id: gen.type.uuid(),
  role: gen.type.enum(Role),
});

const isAdmin = gen.rule(User, (u) => u.role.eq(Role.Admin));
```

Inside the callback, `u.role` should already know:

```txt id="snk2gv"
field ref
field type
enum values
entity context
allowed expression phase
available operations
```

This is “use flows down.”

I would formalize this with scopes:

```ts id="pnbk7t"
withEntityScope(User, (scope) => ...)
withActionScope(actionInput, (scope) => ...)
withQueryScope(queryInput, (scope) => ...)
withTargetScope(PostgresTarget, (scope) => ...)
```

Each scope narrows available builders. For example, SQL-lowerable rules should only expose SQL-lowerable expression constructors unless the user explicitly escapes into opaque JS.

## 6. Make illegal composition unrepresentable where practical

For chain composition:

```ts id="cu7tkw"
chain<A extends Node, B extends Node>(
  a: A,
  b: B & Accepts<OutputOf<A>>
): PlanNode<InOf<A>, OutOf<B>, ReqOf<A> | ReqOf<B>, EffOf<A> | EffOf<B>>
```

For parallel composition:

```ts id="j8nx02"
parallel({
  user: getUser,
  projects: listProjects,
});
```

Should infer:

```ts id="y340vw"
Out = {
  user: User;
  projects: readonly Project[];
}

Req = ReqOf<typeof getUser> | ReqOf<typeof listProjects>
Eff = EffOf<typeof getUser> | EffOf<typeof listProjects>
```

For action write safety:

```ts id="1lyyb5"
write(field, value);
```

should require:

```txt id="jov3uz"
value type assignable to field type
field not read-only
phase allows mutation
target/runtime supports write
policy or explicit unsafe escape exists
```

Do as much in TypeScript as possible, then use lifecycle diagnostics for the rest.

## 7. Prefer trait-gated protocols over structural mixins

Avoid:

```ts id="8fqybt"
type Callable = { callPlan: CallPlan };
type Query = Node & Callable & Readable;
```

That makes traits structural and accidental.

Prefer:

```ts id="s0gze9"
type Query = Node<
  typeof QueryNodeKind,
  In,
  Out,
  Err,
  Req,
  Eff,
  Traits<Has<typeof NodeCallable>, Has<typeof NodeReadable>>
>;
```

Then runtime trait claims stay inspectable:

```ts id="euo35v"
traits: [NodeCallable, NodeReadable];
```

And type-level capability checks stay precise:

```ts id="8fkliu"
function deriveQueryHook<N extends HasTrait<typeof NodeReadable>>(node: N) {}
```

## 8. Make edges carry inference, not just metadata

Edges should infer from their endpoint roles.

Example:

```ts id="r6ptjl"
const WritesEdgeKind = defineEdgeKind({
  id: edgeKindId("edge.writes"),
  endpoints: {
    writer: endpointRole<NodeWith<typeof NodeWritable>>(),
    target: endpointRole<FieldNode>(),
  },
});
```

Then:

```ts id="k65bqm"
defineEdge(WritesEdgeKind, {
  writer: deleteUser,
  target: User.fields.archivedAt,
});
```

should infer:

```txt id="c9ilno"
writer node
target field
written entity
written type
effect footprint
write relationship
reactivity consequences
```

This lets reactivity, auth, storage, and devtools all consume the same fact.

## 9. Model laws as trait applications with witnesses

Yes, laws should be traits, but some laws need payloads.

Marker law:

```ts id="nb5d4h"
applyTrait(expr, LawPure);
applyTrait(action, LawIdempotent);
```

Witnessed law:

```ts id="d8nr4d"
applyTrait(transform, LawReversible, {
  inverse: inverseTransform,
});

applyTrait(combiner, LawIdentity, {
  identity: expr.literal(0),
});

applyTrait(operation, LawAssociative, {
  proof: "declared",
});
```

Type-level:

```ts id="89h1rj"
Has<typeof LawReversible, { inverse: TransformRef<any, any> }>;
Has<typeof LawIdentity, { identity: ExprRef<any> }>;
```

This matters for optimistic updates, retries, offline replay, reducers, and IVM. A pass should be able to ask not only “is this reversible?” but “what is the inverse?”

## 10. Add “opaque boundary” as a first-class trait, not a boolean afterthought

Current expressions already track `contains_opaque_js`. I’d turn that into a trait/capability model:

```txt id="ossbje"
ExprOpaqueJs
ExprPortable
ExprSqlLowerable
ExprClientSafe
ExprServerOnly
```

Then target passes can say:

```txt id="ezseew"
RLS emitter requires ExprSqlLowerable + LawPure
Client hint emitter requires ExprClientSafe
Static dependency extraction requires !ExprOpaqueJs or explicit conservative refs
```

Opaque code should be allowed, but it should force explicit degradation.

## 11. Split metadata from semantic claims more aggressively

Existing `StaticNode` metadata is a list of namespace/key/value strings. I’d keep metadata passive and typed where possible:

```ts id="iuox93"
metadata: {
  title,
  description,
  examples,
  docs,
  source,
}
```

Anything that changes compiler behavior should be a trait, edge, type, transform, or pass input — not metadata.

Bad:

```ts id="3qkbvj"
metadata: [{ namespace: "postgres", key: "gin_index", value: "true" }];
```

Good:

```ts id="a69zyk"
applyTrait(Article.fields.content, PostgresGinIndex);
```

## 12. Introduce typed registries for full inference

A big issue in libraries like this is that once you register a thing into `ctx`, TypeScript often loses knowledge of it.

So add an optional typed registry layer:

```ts id="pdx70n"
const app = gen
  .define("User", entity(...))
  .define("Post", entity(...))
  .define("deleteUser", action(...));
```

Where:

```ts id="wbb85h"
type App = Registry<{
  User: typeof User;
  Post: typeof Post;
  deleteUser: typeof deleteUser;
}>;
```

Then:

```ts id="yg6g1g"
app.get(User);
app.get(DeleteUser);
app.nodesWithTrait(NodeCallable);
```

The runtime `GenContext` remains canonical, but the typed registry preserves autocomplete and literal names during construction.

This is especially helpful for agents: they can navigate typed definitions instead of raw files and strings. `AGENTS.md` already instructs agents to read the core primitive docs before changing core IR/rules/reactivity/providers/target derivation and to run `vp check` and `vp test`. A typed registry gives agents a safer edit surface.

## 13. Use “capability flow” for targets

Targets should be nodes with capability traits:

```ts id="aixw1o"
const PostgresTarget = defineTarget({
  traits: [CapabilitySql, CapabilityRls, CapabilityTransactions, CapabilityTriggers],
});
```

Emitters then become trait/capability constrained passes:

```ts id="4dfo6d"
const emitRls = definePass({
  requiresTarget: [CapabilityRls],
  requiresInput: [NodePolicyProtected, ExprSqlLowerable],
});
```

This is cleaner than scattered target-specific checks.

## 14. Use staged builders to keep inference fast

Because the project uses a very new TypeScript stack (`typescript` native preview 7.0 dev, package versioned as `^6.0.2` in `package.json`), you can use advanced inference patterns, but you should still avoid pathological recursive types.

I’d design builders in stages:

```ts id="b8df7u"
defineNodeKind(...)
defineTrait(...)
defineType(...)
defineNode(...)
defineEdge(...)
```

Avoid one mega generic that infers the whole app at once.

Good:

```ts id="x0sl7i"
const User = entity(...)
const isAdmin = rule(User, ...)
const deleteUser = action(...)

const graph = graphBuilder()
  .add(User)
  .add(isAdmin)
  .add(deleteUser);
```

Risky:

```ts id="ioet1j"
const app = defineApp({
  entities: {...},
  rules: {...},
  actions: {...},
  views: {...},
  targets: {...}
});
```

The latter gives beautiful whole-app inference until it melts the language server.

## 15. Make “full inference” opt-in at boundaries

Support two modes:

```txt id="yc2jrn"
Local inference
  default, fast, works module-by-module

Full registry inference
  opt-in, gives whole-app autocomplete and cross-reference typing
```

Example:

```ts id="qae3dh"
const { gen, ctx } = createGen(); // local inference

const app = createTypedRegistry().add(User).add(Project).add(deleteUser); // full inference
```

This lets product users stay fast and platform users opt into more power.

## 16. Encode variance deliberately

Types like `Node<In, Out>` need variance discipline:

```txt id="wgwjxk"
In should be contravariant-ish
Out should be covariant
Req/Eff usually union upward
Traits usually intersection/additive
```

TypeScript does not make variance easy, so use helper aliases instead of exposing raw assignability everywhere:

```ts id="8zjiaq"
AcceptsInput<N, Input>;
ProducesOutput<N, Output>;
HasRequirement<N, Req>;
HasEffect<N, Eff>;
HasTrait<N, Trait>;
```

That avoids subtle “it structurally matches but semantically should not” bugs.

## 17. Keep extension open with typed modules

Plugins should contribute typed symbols, not string namespaces only.

```ts id="pqcsa1"
const SearchPlugin = definePlugin({
  id: pluginId("plugin.search"),
  symbols: {
    traits: [SearchIndexed],
    edgeKinds: [IndexedByEdgeKind],
    nodeKinds: [SearchIndexNodeKind],
    capabilities: [CapabilitySearch],
  },
  passes: [deriveSearchIndexes, emitSearchConfig],
});
```

This is much safer than:

```ts id="v8klbb"
trait("search:indexed");
```

The current plugin/helper system already materializes helpers into the `gen` namespace. The new kernel should let plugins materialize typed symbol values too.

## 18. Design for agents explicitly

For AI agents, the kernel should expose:

```txt id="r1lg0t"
graph queries
semantic diffs
diagnostic traces
artifact source maps
typed symbol registry
migration-safe stable IDs
```

Agent-friendly APIs:

```ts id="9q2q7e"
graph.explain(deleteUser);
graph.trace(User.fields.role);
graph.findEdges({ kind: WritesEdgeKind, target: User.fields.status });
graph.diff(oldGraph, newGraph);
graph.requiredUpdatesFor(change);
```

This matches Gen2’s deeper value: agents should modify semantic intent, not chase scattered files.

## My final suggested generic shapes

```ts id="ev89nl"
type GType<
  Decoded,
  Encoded = Decoded,
  DecodeR = never,
  EncodeR = never,
  Traits extends TraitSet = EmptyTraits
> = ...

type GExpr<
  Out,
  Req = never,
  Eff = never,
  Traits extends TraitSet = EmptyTraits,
  Refs = never
> = ...

type GTransform<
  From,
  To,
  DecodeR = never,
  EncodeR = never,
  Err = never,
  Traits extends TraitSet = EmptyTraits
> = ...

type GNode<
  Kind extends NodeKindDef,
  In = unknown,
  Out = unknown,
  Err = never,
  Req = never,
  Eff = never,
  Traits extends TraitSet = EmptyTraits
> = ...

type GEdge<
  Kind extends EdgeKindDef,
  Endpoints extends EndpointMap,
  Payload = never,
  Traits extends TraitSet = EmptyTraits
> = ...

type GPass<
  Phase extends PassPhase,
  Reads,
  Writes,
  ReqCapabilities = never
> = ...
```

And core helpers:

```ts id="mxv921"
InferType<T>;
InferEncoded<T>;
InferInput<N>;
InferOutput<N>;
InferError<N>;
InferRequirements<X>;
InferEffects<X>;
InferTraits<X>;
InferRefs<X>;
HasTrait<X, T>;
AddTrait<X, T>;
MergeRequirements<A, B>;
MergeEffects<A, B>;
Chain<A, B>;
Parallel<Record>;
```

## Bottom line

The kernel should be:

```txt id="ptn62j"
symbol-first
trait-gated
edge-centric
value-first
phantom-typed
locally inferred by default
fully inferred by typed registry when wanted
Effect-compatible at the type/schema/service boundary
Effect-independent at the IR/expression/graph boundary
```

The most important type-system idea is this:

> Runtime IR values are the canonical semantic graph. TypeScript phantom generics mirror enough of that graph to make composition safe, infer outputs, bubble up requirements/effects/laws, and flow context down into builders.

[1]: https://effect-ts-effect-smol-1.mintlify.app/data/schema?utm_source=chatgpt.com "Schema - Effect"
[2]: https://effect-ts-effect-smol-1.mintlify.app/concepts/services?utm_source=chatgpt.com "Services - Effect"
[3]: https://effect-ts-effect-smol-1.mintlify.app/?utm_source=chatgpt.com "Effect v4 - Effect"

Yes. The better analogy is not plain LLVM IR, but **MLIR**.

LLVM teaches “build a compiler pipeline.” MLIR teaches “build a compiler pipeline for many semantic levels at once.” Gen2 is much closer to MLIR than to low-level LLVM IR.

The useful lesson:

```txt id="kuwvu3"
Do not have one giant universal IR.
Have a small kernel + extensible dialects + typed operations + verifiers + lowering passes.
```

That maps almost perfectly to Gen2.

## 1. Gen2 “stdlib modules” should become dialects

MLIR organizes related operations into **dialects**; dialects group operations, types, and attributes for a logical domain. The MLIR docs list many dialects such as `func`, `arith`, `tensor`, `scf`, `gpu`, `llvm`, and others. ([MLIR][1])

For Gen2, the equivalent is:

```txt id="j2lr5a"
domain dialect
  entity, field, domain relation

expr dialect
  literal, field ref, comparison, boolean logic

callable dialect
  query, action, workflow

auth dialect
  policy, guard, principal, permission

storage dialect
  table, column, index, mapping, migration

reactivity dialect
  key, resource, mutation, invalidation

ui dialect
  view, form, field display, submit action

effect dialect
  service, provider, layer, requirement

target dialects
  postgres, sqlite, react, solid, effect, openapi
```

This gives you extensibility without polluting the kernel.

So instead of every primitive living in `core`, define:

```ts id="0m81vy"
defineDialect({
  id: dialectId("dialect.domain"),
  nodeKinds: [EntityNodeKind, FieldNodeKind],
  edgeKinds: [OwnsFieldEdgeKind, DomainRelationEdgeKind],
  traits: [IdentityBearing, RequiredField],
  passes: [checkEntities, deriveFieldEdges],
});
```

This is very close to your plugin philosophy, but more typed and structured.

## 2. Use ODS-like definitions for node kinds and edge kinds

MLIR’s Operation Definition Specification exists partly to avoid “stringly typed IR”: the docs explicitly call out repetitive string comparisons, generic/error-prone accessors like `getOperand(3)`, and missing or duplicated verification as problems that table-driven operation definitions solve. ([MLIR][2])

That is directly relevant to your magic-string concern.

For Gen2, create an ODS-like system:

```ts id="0t2o40"
export const WritesEdgeKind = defineEdgeKind({
  id: edgeKindId("edge.writes"),
  endpoints: {
    writer: endpointRole({
      target: NodeTarget,
      requiresTraits: [NodeWritable],
    }),
    written: endpointRole({
      target: NodeTarget,
      requiresTraits: [FieldNode],
    }),
  },
  traits: [EdgeCausal, EdgeEffectful],
  verifier: verifyWritesEdge,
});
```

Then users never write:

```ts id="a3kekw"
edge.kind === "writes";
edge.endpoints[1];
```

They write:

```ts id="x0xop1"
edge.kind === WritesEdgeKind;
edge.get(WritesEdgeKind.endpoints.written);
```

This is a big lesson from MLIR: **define operations/edges declaratively, then generate typed builders, accessors, verifiers, printers, and docs.**

## 3. Separate generic kernel from dialect-specific semantics

LLVM IR is intentionally low-level. MLIR adds higher-level dialects because lowering everything too early loses information.

Gen2 should do the same.

Do not lower this too early:

```txt id="lacq2g"
User entity
isAdmin rule
deleteUser action
UserList view
```

into:

```txt id="lx3dvo"
SQL table
HTTP route
React component
TanStack mutation
```

Keep high-level dialect nodes as long as possible:

```txt id="uoopuq"
domain.entity
logic.rule
callable.action
ui.view
```

Then lower progressively:

```txt id="rbmbvk"
domain.entity
  -> storage.record
  -> postgres.table
  -> sql.ddl artifact

logic.rule
  -> logic.predicate
  -> sql.predicate
  -> postgres.rls artifact

ui.view
  -> ui.form model
  -> react.component model
  -> tsx artifact
```

MLIR’s Toy tutorial is structured around this exact idea: start with a high-level language-specific dialect, apply high-level transformations, then partially lower to lower-level dialects, and eventually lower to LLVM/codegen. ([MLIR][3])

For Gen2, that means: **do not jump directly from entity/action/rule to files.** Lower through intermediate dialects.

## 4. Make verifiers first-class

Every dialect should ship verifiers.

Examples:

```txt id="9wcgca"
domain verifier
  entity fields have stable refs
  field names are unique
  identity fields are present

edge verifier
  writes edge source is writable
  writes edge target is a field
  guards edge source is boolean rule

auth verifier
  client-exposed rule is client-safe
  SQL policy rule is SQL-lowerable

storage verifier
  foreign key edge endpoints have compatible types
  relation cardinality is legal
  index trait target is storable

effect verifier
  provider satisfies requirement
  service dependencies are acyclic
```

This is very MLIR-like: operations/dialects define local invariants, then passes can assume verified IR.

Your current lifecycle already has many module checkers registered manually. The LLVM/MLIR lesson is to attach verification closer to the dialect/op definitions, then run verification after each important pass.

## 5. Add canonicalization passes

MLIR has a standard `-canonicalize` pass and many transformation passes such as CSE, inlining, dead value removal, topological sort, and graph viewing. ([MLIR][4])

Gen2 should have canonicalization passes too.

Examples:

```txt id="nknujo"
canonicalize duplicate equivalent types
canonicalize duplicate edges
canonicalize equivalent rules
canonicalize relation edges into one normalized direction
canonicalize action write sets
canonicalize generated key patterns
canonicalize trait implications
canonicalize derived metadata
```

Example:

```txt id="xyffcx"
Edge(kind: guardedBy, action -> rule)
Edge(kind: guards, rule -> action)

=> canonical form:
Edge(kind: guards, guard: rule, guarded: action)
```

This will matter a lot for agents. Agents may add equivalent but not identical graph facts. Canonicalization makes semantic diffs sane.

## 6. Add “legalization” instead of ad hoc target checks

MLIR has conversion/lowering passes with input invariants and output IR contracts. The MLIR pass docs describe passes with explicit input invariants and output IR expectations, for example conversion from `func` to `llvm` dialect has constraints on tensor/vector/block structure and fails if required unsupported operations remain. ([MLIR][4])

Gen2 should do the same.

Instead of an emitter saying:

```txt id="cmyd9d"
Can I emit this rule to Postgres? Maybe.
```

Have a legalization pass:

```txt id="hl090k"
legalize logic.rule to postgres.rls
```

It either produces:

```txt id="i920ur"
postgres.rls_policy node
sql.predicate expr
```

or diagnostics:

```txt id="h0pnd6"
Cannot legalize rule to Postgres RLS:
  rule contains opaque JS
  rule reads client-only context
  rule traverses external relation
```

Then emitters only emit legal target dialect IR.

That is a major design improvement.

## 7. Adopt “traits + interfaces” like MLIR

MLIR uses traits and interfaces to express generic capabilities. Its ODS docs describe traits as specifying properties/constraints of operations, such as side effects or shape relationships. ([MLIR][2])

Gen2 should mirror this:

```txt id="sv0odn"
Trait
  marker or semantic law

Interface
  required methods/accessors/derivations for generic passes
```

Example distinction:

```txt id="j3jgj1"
Trait:
  NodeCallable
  NodeReadable
  LawIdempotent
  ExprSqlLowerable

Interface:
  CallableInterface
    getInputType()
    getOutputType()
    getCallPlan()

  ReadableInterface
    getReadEdges()

  WritableInterface
    getWriteEdges()

  LowerableToSqlInterface
    lowerToSql(ctx)
```

This avoids making traits carry too much behavior.

So:

```ts id="2zppgf"
defineNodeKind({
  id: QueryNodeKind,
  traits: [NodeCallable, NodeReadable],
  interfaces: [CallableInterface, ReadableInterface],
});
```

Generic passes should depend on interfaces when they need behavior, traits when they need claims.

## 8. Use SSA-ish values for expressions and plans

LLVM’s core strength is SSA: values are defined once and used many times. Gen2 does not need full low-level SSA everywhere, but `Expr` and `Plan` would benefit from SSA-like structure.

Current `Expr` already has an AST and refs. For more complex workflows/plans, consider:

```txt id="xw08cv"
Value
Block
Region
Operation
```

In Gen2 terms:

```txt id="jnk09p"
ExprOp produces Value
Node can own Region
Workflow contains Blocks
Plan connects Values
```

This would help with:

```txt id="9pg5mb"
workflow composition
action bodies
query projections
branching
effect sequencing
dependency extraction
dead value removal
```

Don’t overdo this at the start. But leave room for it.

## 9. Add “regions” for nested semantics

MLIR operations can contain regions/blocks, which lets high-level operations own nested IR.

Gen2 analogues:

```txt id="9yjddq"
workflow node owns region of steps
transaction node owns region of writes
view node owns region of controls
policy node owns region of rules
boundary node owns client/server regions
```

This is better than stuffing everything into arbitrary metadata arrays.

Example:

```ts id="k94ekx"
const transaction = defineNode({
  kind: TransactionNodeKind,
  regions: {
    body: [write(User.fields.archivedAt, now()), emit(UserDeletedEvent)],
  },
});
```

A target can lower the region to SQL transaction, Effect transaction, or server action.

## 10. Use pass pipelines with explicit IR levels

Define pipelines like:

```txt id="k56mr7"
gen2-check:
  verify symbols
  verify dialect invariants
  derive refs
  derive read/write edges
  verify graph

gen2-lower-postgres:
  canonicalize
  legalize domain -> storage
  legalize logic -> sql
  legalize auth -> postgres.rls
  verify postgres dialect
  emit sql

gen2-lower-react:
  canonicalize
  legalize ui -> component model
  legalize callable -> client boundary
  legalize reactivity -> query hooks
  verify react dialect
  emit tsx
```

This is more robust than one giant `lifecycle.generate`.

The current lifecycle has fixed phases `collect_refs`, `resolve_plugins`, `check_targets`, `run_checks`, and `generate`. Keep the public lifecycle, but internally make it a named pass pipeline.

## 11. Preserve source locations aggressively

LLVM/MLIR care about debug locations. Gen2 should care about semantic source maps.

Every kernel object should have provenance:

```txt id="dg20wy"
explicit user source
derived by pass
lowered from object
generated from object
imported from plugin
inferred conservatively
```

For agents and devtools, this is essential:

```txt id="jfwbbj"
Why is this button disabled?
  generated component prop
  lowered from ui.enabledWhen edge
  derived from action guardedBy rule
  rule reads User.role
  source: app/user.ts:42
```

## 12. Add textual IR, but make it typed/symbolic

LLVM has textual IR. MLIR has readable textual IR. Gen2 should have a debug IR dump.

Not as a user-authoring format initially, but for tests, diffs, and agents:

```txt id="j77u79"
node %User : domain.entity
node %deleteUser : callable.action
edge %e1 = guards(%isAdmin -> %deleteUser)
edge %e2 = writes(%deleteUser -> %User.archivedAt)
trait %deleteUser : node.callable, node.writable
```

Because you dislike magic strings, this textual form should print stable symbol names but parse back to typed definitions through the symbol registry.

This will make snapshot tests much better.

## 13. Learn from LLVM’s “IR is not the public API”

LLVM IR is a compiler IR. Frontends generate it; users generally write higher-level languages.

Same for Gen2:

```txt id="auqg1m"
Kernel IR is not the primary user API.
gen.entity / gen.rule / gen.action are the frontend.
Kernel graph is the compiler IR.
Targets lower and emit.
```

So don’t force users to write:

```ts id="8qntk8"
defineNode(...)
defineEdge(...)
```

unless they are plugin authors. Product users should mostly use the stdlib frontend.

## 14. Learn from MLIR’s extensibility, but avoid its complexity

Do borrow:

```txt id="h0uz2l"
dialects
operation definitions
traits
interfaces
verifiers
canonicalization
lowering
legalization
pass pipelines
source locations
textual IR
```

Do not borrow too early:

```txt id="z8xuq6"
full SSA everywhere
complex region semantics everywhere
compiler-builder boilerplate
TableGen-style separate DSL
C++-level complexity
```

For Gen2, implement the spirit in TypeScript:

```txt id="acww3j"
typed symbol definitions
typed object builders
generated accessors via TS helpers
runtime verifiers
pass pipelines
graph dumps
```

## Practical revised kernel after LLVM/MLIR lessons

I’d now say:

```txt id="6uf2dt"
Kernel:
  Id
  SymbolDef
  Metadata
  Type
  Expr
  Transform
  Trait
  Interface
  Node
  Edge
  Region
  Graph
  Pass
  Diagnostic
  Artifact
```

But staged:

```txt id="vvoayl"
Phase 1:
  Id, SymbolDef, Metadata, Trait, Type, Expr, Node, Edge, Graph, Pass

Phase 2:
  Interface, Transform, Diagnostic improvements, textual IR

Phase 3:
  Region, legalization, target dialects
```

## The biggest specific lesson for Gen2

The strongest MLIR lesson is:

> Extensibility should be declarative and verified.

So for Gen2, every new kind should be declared like:

```ts id="jywqxj"
const ActionNodeKind = defineNodeKind({
  id: nodeKindId("node.kind.action"),
  dialect: CallableDialect,
  traits: [NodeCallable, NodeWritable, NodeEffectful],
  interfaces: [CallableInterface, WritableInterface],
  inputs: {
    input: TypeSlot,
  },
  outputs: {
    output: TypeSlot,
  },
  verifier: verifyActionNode,
  canonicalizers: [canonicalizeActionWrites],
});
```

Every edge kind:

```ts id="grywob"
const GuardsEdgeKind = defineEdgeKind({
  id: edgeKindId("edge.kind.guards"),
  dialect: AuthDialect,
  endpoints: {
    guard: endpointRole({ target: NodeTarget, requires: [RuleNodeTrait] }),
    guarded: endpointRole({ target: NodeTarget }),
  },
  verifier: verifyGuardEdge,
});
```

Every lowering:

```ts id="gwyvxh"
defineLowering({
  from: LogicRuleNodeKind,
  to: SqlPredicateNodeKind,
  requires: [ExprSqlLowerable, LawPure],
  run: lowerRuleToSql,
});
```

That would make Gen2 feel like a real semantic compiler rather than a big bag of constructors.

## Bottom line

LLVM/MLIR suggests this direction:

```txt id="xlabb7"
Gen2 core should be MLIR-like:

small kernel
typed symbols
dialects
node/edge definitions
traits
interfaces
verifiers
canonicalization
legalization
lowering pipelines
target dialects
source maps
debug textual IR
```

The key shift is to stop thinking of Gen2 as “a framework that generates code” and start treating it as:

> a multi-level semantic compiler where domain/app concepts are high-level dialects that progressively lower into target dialects.

[1]: https://mlir.llvm.org/docs/Dialects/?utm_source=chatgpt.com "Dialects - MLIR"
[2]: https://mlir.llvm.org/docs/DefiningDialects/Operations/?utm_source=chatgpt.com "Operation Definition Specification (ODS) - MLIR"
[3]: https://mlir.llvm.org/docs/Tutorials/Toy/?utm_source=chatgpt.com "Toy Tutorial - MLIR"
[4]: https://mlir.llvm.org/docs/Passes/?utm_source=chatgpt.com "Passes - MLIR"

Here’s what the revised kernel could look like if we combine everything we discussed: Effect-inspired type flow, no magic strings, MLIR-style dialects, typed node/edge definitions, traits/laws/capabilities as first-class symbols, and passes over a semantic graph.

The key idea:

```txt id="vcq1qq"
Gen2 Kernel = typed semantic graph IR

MLIR-like structure:
  Dialects define node kinds, edge kinds, traits, interfaces, verifiers, canonicalizers, lowerings.

Effect-like typing:
  Types carry Decoded / Encoded / DecodeR / EncodeR.
  Nodes and Exprs bubble requirements/effects/errors upward.
  Builders flow expected context downward.

Gen2 philosophy:
  No magic strings for internal semantics.
  Runtime values are inspectable.
  Type-level mirrors preserve inference.
```

MLIR is useful because it explicitly supports extensible dialects with their own attributes, operations, and types, and it uses interfaces so transformations can operate generically without hardcoding every concrete operation or dialect. ([MLIR][1]) MLIR traits are also directly relevant: they express reusable properties and constraints on IR objects, such as side-effect behavior or type relationships. ([MLIR][2])

## 1. Kernel package shape

I’d structure the new kernel like this:

```txt id="2ztspn"
src/kernel/
  id.ts
  symbol.ts
  metadata.ts
  trait.ts
  interface.ts
  type.ts
  expr.ts
  transform.ts
  node.ts
  edge.ts
  region.ts
  graph.ts
  dialect.ts
  pass.ts
  diagnostic.ts
  artifact.ts
  index.ts
```

But introduce it in stages.

Phase 1 kernel:

```txt id="7mh11e"
Id
SymbolDef
Metadata
Trait
Type
Expr
Transform
Node
Edge
Graph
Pass
Diagnostic
```

Phase 2:

```txt id="jurrt2"
Interface
Dialect
Region
Canonicalizer
Lowering
Textual IR
```

This fits the current repo because you already have many pieces: `StaticNode` has traits, input/output semantic types, requirements, effects, metadata, symbol info, and phantom inference slots. `Expr` already has value type, phase, requirements, effects, AST, opacity, and refs. `SemanticType` already carries semantic kind, TS type name, storage/wire representation, serializer flags, server-only info, traits, validation, and merge strategy.

## 2. Typed symbols instead of magic strings

The kernel should not use plain strings for internal semantics.

Bad:

```ts id="kq46wb"
traits: ["node.callable", "node.readable"];
kind: "query";
edge.kind === "writes";
```

Good:

```ts id="f2ojby"
traits: [NodeCallable, NodeReadable];
kind: QueryNodeKind;
edge.kind === WritesEdgeKind;
```

The repo already has a magic-string checker that warns when typed refs or stable IDs should be used instead of raw string references, while still allowing strings for external/display names like DB names, URL templates, env vars, target filenames, operation IDs, and CSS classes.

So add a shared symbol base:

```ts id="tq431a"
export interface SymbolDef<Domain extends string, Id, Payload = unknown> {
  readonly domain: Domain;
  readonly id: Id;
  readonly label?: string;
  readonly metadata?: Metadata;
  readonly _payload?: Payload;
}
```

Then:

```ts id="89ttof"
export type NodeKindDef<Payload = unknown> = SymbolDef<"node.kind", NodeKindId, Payload>;

export type EdgeKindDef<Payload = unknown> = SymbolDef<"edge.kind", EdgeKindId, Payload>;

export type TraitDef<Target = unknown, Payload = true> = SymbolDef<
  "trait",
  TraitId,
  { target: Target; payload: Payload }
>;

export type InterfaceDef<Payload = unknown> = SymbolDef<"interface", InterfaceId, Payload>;

export type DialectDef<Payload = unknown> = SymbolDef<"dialect", DialectId, Payload>;

export type CapabilityDef<Payload = true> = SymbolDef<"capability", CapabilityId, Payload>;
```

Now extension authors define semantic symbols once:

```ts id="u4d7hk"
export const CallableDialect = defineDialect({
  id: dialectId("dialect.callable"),
  label: "Callable",
});

export const QueryNodeKind = defineNodeKind({
  id: nodeKindId("node.kind.query"),
  dialect: CallableDialect,
  label: "Query",
});

export const NodeCallable = defineTrait({
  id: traitId("trait.node.callable"),
  target: NodeTarget,
  label: "Callable node",
});
```

The ID string is a branded stable ID at definition time. It should not be passed around as an untyped internal reference.

## 3. Trait sets: runtime data + phantom type mirror

Every IR object should have runtime traits for compiler passes and phantom traits for TypeScript.

```ts id="uwgm1i"
declare const traitSetBrand: unique symbol;

export type TraitSet = {
  readonly [traitSetBrand]?: never;
};

export type EmptyTraits = TraitSet;

export type Has<T extends TraitDef<any, any>, Payload = TraitPayload<T>> = TraitSet & {
  readonly [K in TraitKey<T>]: Payload;
};

export type Traits<
  A extends TraitSet = EmptyTraits,
  B extends TraitSet = EmptyTraits,
  C extends TraitSet = EmptyTraits,
  D extends TraitSet = EmptyTraits,
> = A & B & C & D;
```

Then nodes look like:

```ts id="kkmbs1"
export interface Node<
  Kind extends NodeKindDef = NodeKindDef,
  In = unknown,
  Out = unknown,
  Err = never,
  Req = never,
  Eff = never,
  TTraits extends TraitSet = EmptyTraits,
> {
  readonly kind: Kind;
  readonly id?: NodeId;
  readonly ref?: Ref;

  readonly input?: GType<In>;
  readonly output?: GType<Out>;

  readonly traits: readonly TraitDef<NodeTarget, any>[];
  readonly metadata?: Metadata;

  readonly errors?: readonly ErrorDef[];
  readonly requirements?: readonly RequirementDef[];
  readonly effects?: readonly EffectDef[];

  readonly _kind?: Kind;
  readonly _input?: In;
  readonly _output?: Out;
  readonly _error?: Err;
  readonly _requirements?: Req;
  readonly _effects?: Eff;
  readonly _traits?: TTraits;
}
```

A query type becomes:

```ts id="xvynug"
export type QueryNode<In, Out, Req = never> = Node<
  typeof QueryNodeKind,
  In,
  Out,
  never,
  Req,
  never,
  Traits<Has<typeof NodeCallable, { input: In; output: Out }>, Has<typeof NodeReadable>>
>;
```

This is the right balance:

```txt id="9wka5m"
Runtime:
  node.traits is inspectable by the compiler.

TypeScript:
  _traits lets builders and passes require capabilities.
```

Do **not** use `Node & Callable & Readable` as the core model. That turns traits into structural mixins and makes accidental conformance too easy.

## 4. Effect-inspired `GType`

The type primitive should evolve from `SemanticType<T>` toward an Effect-like decoded/encoded model.

```ts id="igh8as"
export interface GType<
  Decoded,
  Encoded = Decoded,
  DecodeR = never,
  EncodeR = never,
  TTraits extends TraitSet = EmptyTraits,
> {
  readonly kind: TypeKindDef;
  readonly id?: TypeId;
  readonly ref?: Ref;

  readonly decoded?: Phantom<Decoded>;
  readonly encoded?: Phantom<Encoded>;
  readonly decodeRequirements?: Phantom<DecodeR>;
  readonly encodeRequirements?: Phantom<EncodeR>;

  readonly storage?: Representation;
  readonly wire?: Representation;

  readonly traits: readonly TraitDef<TypeTarget, any>[];
  readonly metadata?: Metadata;

  readonly effectSchema?: EffectSchemaAdapter<Decoded, Encoded, DecodeR, EncodeR>;

  readonly _decoded?: Decoded;
  readonly _encoded?: Encoded;
  readonly _decodeR?: DecodeR;
  readonly _encodeR?: EncodeR;
  readonly _traits?: TTraits;
}
```

Examples:

```ts id="vzugc0"
export const Email = stringType().pipe(withTrait(TypeEmail)).pipe(withTrait(TypeQueryable));

type EmailDecoded = InferDecoded<typeof Email>; // string
type EmailTraits = InferTraits<typeof Email>;
```

Effect interop should be an adapter:

```ts id="4d2n4m"
const UserType = gen.effect.fromSchema(UserSchema);
const schema = gen.effect.toSchema(UserType);
```

But `GType` remains Gen2-owned because it needs storage, wire, traits, graph refs, target hints, and source provenance beyond what schema libraries provide.

## 5. Expressions with requirement/effect/trait bubbling

Current `Expr` is already close. The revised shape should be:

```ts id="ohrnxf"
export interface GExpr<
  Out,
  Req = never,
  Eff = never,
  TTraits extends TraitSet = EmptyTraits,
  Refs = never,
> {
  readonly kind: ExprKindDef;
  readonly id?: ExprId;

  readonly valueType: GType<Out>;
  readonly ast: ExprAstNode;

  readonly phase: ExprPhaseDef;
  readonly traits: readonly TraitDef<ExprTarget, any>[];

  readonly requirements?: readonly RequirementDef[];
  readonly effects?: readonly EffectDef[];
  readonly refs?: readonly Ref[];

  readonly metadata?: Metadata;

  readonly _out?: Out;
  readonly _requirements?: Req;
  readonly _effects?: Eff;
  readonly _traits?: TTraits;
  readonly _refs?: Refs;
}
```

Examples:

```ts id="jdr4hg"
type SqlPredicate = GExpr<
  boolean,
  never,
  never,
  Traits<Has<typeof ExprPure>, Has<typeof ExprSqlLowerable>>
>;
```

Opaque code becomes a trait, not just a boolean:

```ts id="wsdx3s"
Has<typeof ExprOpaqueJs>;
Has<typeof ExprPortable>;
Has<typeof ExprClientSafe>;
Has<typeof ExprServerOnly>;
```

A Postgres RLS lowering can then require:

```txt id="ww98s3"
ExprPure
ExprSqlLowerable
not ExprOpaqueJs
target has CapabilityPostgresRls
```

MLIR-style passes often have explicit contracts and conversions, with canonicalization, CSE, symbol DCE, topological sort, graph viewing, and many lowering passes listed as named passes. ([MLIR][3]) Gen2 should follow this pattern: expressions do not directly emit target code; they legalize into target dialect expressions first.

## 6. Edge definitions with typed endpoint roles

Edges should be first-class and typed, not just `{ from, to, kind: string }`.

```ts id="46jx82"
export interface EndpointRoleDef<
  Name extends string,
  Target,
  RequiredTraits extends readonly TraitDef[] = readonly [],
> {
  readonly id: EndpointRoleId;
  readonly label?: string;
  readonly target: Target;
  readonly requiredTraits?: RequiredTraits;
  readonly _name?: Name;
}

export interface EdgeKindDef<
  Endpoints extends EndpointSpec = EndpointSpec,
  Payload = never,
> extends SymbolDef<
  "edge.kind",
  EdgeKindId,
  {
    endpoints: Endpoints;
    payload: Payload;
  }
> {
  readonly dialect: DialectDef;
}
```

Define a writes edge:

```ts id="c2izzq"
export const WriterRole = defineEndpointRole({
  id: endpointRoleId("edge.role.writer"),
  target: NodeTarget,
  requiredTraits: [NodeWritable],
});

export const WrittenFieldRole = defineEndpointRole({
  id: endpointRoleId("edge.role.writtenField"),
  target: NodeTarget,
  requiredTraits: [FieldNodeTrait],
});

export const WritesEdgeKind = defineEdgeKind({
  id: edgeKindId("edge.kind.writes"),
  dialect: CallableDialect,
  endpoints: {
    writer: WriterRole,
    written: WrittenFieldRole,
  },
});
```

Then:

```ts id="3wkubf"
export interface Edge<
  Kind extends EdgeKindDef = EdgeKindDef,
  Endpoints extends EndpointValues<Kind> = EndpointValues<Kind>,
  Payload = InferEdgePayload<Kind>,
  TTraits extends TraitSet = EmptyTraits,
> {
  readonly kind: Kind;
  readonly id?: EdgeId;
  readonly endpoints: Endpoints;
  readonly payload?: Payload;

  readonly traits: readonly TraitDef<EdgeTarget, any>[];
  readonly metadata?: Metadata;
  readonly provenance?: Provenance;

  readonly _kind?: Kind;
  readonly _endpoints?: Endpoints;
  readonly _payload?: Payload;
  readonly _traits?: TTraits;
}
```

Usage:

```ts id="f4wtnr"
defineEdge(WritesEdgeKind, {
  writer: deleteUser,
  written: User.fields.archivedAt,
});
```

Now the compiler can infer:

```txt id="pigrhj"
deleteUser is writable
User.fields.archivedAt is a field
the edge is a write dependency
reactivity can consume it
auth can inspect it
devtools can trace it
```

## 7. Laws as trait definitions with witnesses

Laws should be traits, but not always marker traits.

Marker law:

```ts id="s2ysrv"
export const LawPure = defineLaw({
  id: lawId("law.pure"),
  appliesTo: [ExprTarget, NodeTarget],
});
```

Witnessed law:

```ts id="i97tur"
export const LawReversible = defineLaw<{
  inverse: TransformRef<any, any>;
}>({
  id: lawId("law.reversible"),
  appliesTo: [TransformTarget, NodeTarget, EdgeTarget],
});

export const LawIdentity = defineLaw<{
  identity: ExprRef<any>;
}>({
  id: lawId("law.identity"),
  appliesTo: [ExprTarget, TransformTarget, NodeTarget],
});
```

Apply:

```ts id="j7f830"
applyTrait(softDeleteTransform, LawReversible, {
  inverse: restoreTransform.ref,
});
```

This gives passes enough information to actually use the law. For example, optimistic rollback should not ask only “is reversible?” It should ask “what is the inverse?”

## 8. Interfaces: traits are claims, interfaces are behavior

Borrow MLIR’s traits/interfaces split.

MLIR interfaces exist so transformations can work generically over IR without hardcoding each operation or dialect. ([MLIR][1]) For Gen2:

```ts id="cgcifc"
export const CallableInterface = defineInterface({
  id: interfaceId("interface.callable"),
  methods: {
    inputType: true,
    outputType: true,
    callPlan: true,
  },
});

export const ReadableInterface = defineInterface({
  id: interfaceId("interface.readable"),
  methods: {
    readEdges: true,
  },
});

export const WritableInterface = defineInterface({
  id: interfaceId("interface.writable"),
  methods: {
    writeEdges: true,
  },
});
```

Node kind definition:

```ts id="74svye"
export const ActionNodeKind = defineNodeKind({
  id: nodeKindId("node.kind.action"),
  dialect: CallableDialect,
  traits: [NodeCallable, NodeWritable, NodeEffectful],
  interfaces: [CallableInterface, WritableInterface],
  verify: verifyActionNode,
});
```

Generic passes should use:

```txt id="dfdmpj"
Traits when they need semantic claims.
Interfaces when they need behavior/accessors.
```

Example:

```ts id="t3oyyp"
function deriveInvalidations<N extends Implements<typeof WritableInterface>>(
  graph: Graph,
  node: N,
) {
  const writes = graph.interface(node, WritableInterface).writeEdges();
}
```

This prevents traits from becoming a dumping ground for behavior.

## 9. Dialects

A dialect groups symbols, verifiers, canonicalizers, lowerings, and passes.

```ts id="at0fk3"
export interface Dialect {
  readonly id: DialectId;
  readonly label: string;

  readonly nodeKinds: readonly NodeKindDef[];
  readonly edgeKinds: readonly EdgeKindDef[];
  readonly typeKinds: readonly TypeKindDef[];
  readonly traits: readonly TraitDef[];
  readonly interfaces: readonly InterfaceDef[];

  readonly verify?: readonly Verifier[];
  readonly canonicalize?: readonly Canonicalizer[];
  readonly lowerings?: readonly Lowering[];
  readonly passes?: readonly Pass[];
}
```

Example:

```ts id="dnegny"
export const DomainDialect = defineDialect({
  id: dialectId("dialect.domain"),
  label: "Domain",
  nodeKinds: [EntityNodeKind, FieldNodeKind],
  edgeKinds: [OwnsFieldEdgeKind, DomainRelationEdgeKind],
  traits: [IdentityBearing, RequiredField],
  verify: [verifyEntities, verifyFieldOwnership],
});
```

This maps the current module structure into a compiler shape:

```txt id="vtslm4"
entity module      -> domain dialect
relation module    -> domain edge kinds
expression module  -> expr dialect
function module    -> callable dialect
authz module       -> auth dialect
storage module     -> storage dialect
reactivity module  -> reactivity dialect
ui module          -> ui dialect
effect adapter     -> effect dialect / target dialect
postgres adapter   -> postgres dialect / target dialect
```

Your current lifecycle manually registers lots of module checks. Dialects would let those checks live with the node/edge/type definitions they validate.

## 10. Graph

The graph stores typed objects and indexes them.

```ts id="w8l2dl"
export interface Graph {
  readonly dialects: Registry<Dialect>;
  readonly types: Registry<GType<any, any, any, any, any>>;
  readonly exprs: Registry<GExpr<any, any, any, any, any>>;
  readonly transforms: Registry<GTransform<any, any, any, any, any, any>>;
  readonly nodes: Registry<Node<any, any, any, any, any, any, any>>;
  readonly edges: Registry<Edge<any, any, any, any>>;
  readonly traitApplications: Registry<TraitApplication<any, any>>;

  nodesWithTrait<T extends TraitDef>(trait: T): readonly HasTraitNode<T>[];
  edgesOfKind<K extends EdgeKindDef>(kind: K): readonly Edge<K>[];
  edgesFrom<K extends EdgeKindDef>(source: Ref, kind?: K): readonly Edge<K>[];
  edgesTo<K extends EdgeKindDef>(target: Ref, kind?: K): readonly Edge<K>[];

  implements<I extends InterfaceDef>(node: Node, iface: I): boolean;
}
```

No magic-string query APIs:

```ts id="m99e3i"
graph.nodesWithTrait(NodeCallable);
graph.edgesOfKind(WritesEdgeKind);
graph.edgesTo(User.fields.role.ref, ReadsEdgeKind);
```

## 11. Regions

Regions should be optional in the first version, but they are useful for workflows, transactions, boundaries, and UI subtrees.

```ts id="htdovj"
export interface Region<
  Args extends readonly GType[] = readonly GType[],
  Results extends readonly GType[] = readonly GType[],
> {
  readonly id?: RegionId;
  readonly args: Args;
  readonly body: readonly RegionOp[];
  readonly results: Results;
  readonly metadata?: Metadata;
}
```

Examples:

```txt id="3e8o6d"
workflow node owns a region of steps
transaction node owns a region of writes
view node owns a region of controls
boundary node owns client/server regions
```

Do not make every node region-based immediately. Add it when action bodies/workflows become too complex for simple expressions/plans.

## 12. Passes, lowerings, and legalization

Passes should have contracts:

```ts id="u60cfe"
export interface Pass<Phase extends PassPhase = PassPhase> {
  readonly id: PassId;
  readonly phase: Phase;
  readonly label: string;

  readonly requiresDialects?: readonly DialectDef[];
  readonly requiresTraits?: readonly TraitDef[];
  readonly producesDialects?: readonly DialectDef[];

  run(graph: Graph, ctx: PassContext): PassResult;
}
```

Lowering:

```ts id="mcuoxs"
export interface Lowering<
  From extends NodeKindDef | EdgeKindDef | TypeKindDef,
  To extends NodeKindDef | EdgeKindDef | TypeKindDef,
> {
  readonly id: LoweringId;
  readonly from: From;
  readonly to: To;
  readonly requiresTraits?: readonly TraitDef[];
  readonly requiresCapabilities?: readonly CapabilityDef[];

  lower(input: LoweringInput<From>, ctx: LoweringContext): LoweringResult<To>;
}
```

Example:

```ts id="0p81ja"
export const LowerRuleToSqlPredicate = defineLowering({
  id: loweringId("lower.logic.rule.to.sql.predicate"),
  from: RuleNodeKind,
  to: SqlPredicateNodeKind,
  requiresTraits: [ExprPure, ExprSqlLowerable],
  requiresCapabilities: [CapabilitySql],
  lower: lowerRuleToSqlPredicate,
});
```

Pipeline:

```ts id="to2n23"
const postgresPipeline = definePipeline({
  id: pipelineId("pipeline.postgres"),
  passes: [
    VerifySymbols,
    VerifyDialects,
    DeriveReadWriteEdges,
    CanonicalizeGraph,
    LegalizeDomainToStorage,
    LegalizeRulesToSql,
    LegalizePoliciesToPostgresRls,
    VerifyPostgresDialect,
    EmitPostgresArtifacts,
  ],
});
```

This is the MLIR lesson applied directly: emitters should not accept arbitrary high-level app IR. They should accept already-legalized target dialect IR.

## 13. Canonicalizers

Canonicalization should be first-class.

```ts id="02is9o"
export interface Canonicalizer<TKind> {
  readonly id: CanonicalizerId;
  readonly appliesTo: TKind;
  run(object: ObjectOf<TKind>, graph: Graph): CanonicalizeResult;
}
```

Examples:

```txt id="7z0b0c"
dedupe equivalent edges
normalize inverse edge forms
expand trait implications
normalize relation direction
normalize read/write sets
collapse duplicate generated artifacts
rewrite deprecated node kinds
```

This matters for agents. Agents may add semantically equivalent graph facts in slightly different forms. Canonicalization keeps diffs and diagnostics sane.

## 14. Type inference flow

The key type operators:

```ts id="uf4mk6"
type InferDecoded<T> = T extends GType<infer D, any, any, any, any> ? D : never;
type InferEncoded<T> = T extends GType<any, infer E, any, any, any> ? E : never;

type InferInput<N> = N extends Node<any, infer In, any, any, any, any, any> ? In : never;
type InferOutput<N> = N extends Node<any, any, infer Out, any, any, any, any> ? Out : never;
type InferError<N> = N extends Node<any, any, any, infer Err, any, any, any> ? Err : never;
type InferRequirements<N> = N extends Node<any, any, any, any, infer Req, any, any> ? Req : never;
type InferEffects<N> = N extends Node<any, any, any, any, any, infer Eff, any> ? Eff : never;
type InferTraits<X> = X extends { readonly _traits?: infer T } ? T : EmptyTraits;
```

Composition:

```ts id="3fr27s"
type Chain<A, B> =
  InferOutput<A> extends InferInput<B>
    ? Node<
        typeof PlanChainNodeKind,
        InferInput<A>,
        InferOutput<B>,
        InferError<A> | InferError<B>,
        InferRequirements<A> | InferRequirements<B>,
        InferEffects<A> | InferEffects<B>,
        InferTraits<A> & InferTraits<B>
      >
    : never;
```

Parallel:

```ts id="wkqty4"
type Parallel<Steps extends Record<string, Node>> = Node<
  typeof PlanParallelNodeKind,
  unknown,
  { [K in keyof Steps]: InferOutput<Steps[K]> },
  InferErrorsOf<Steps>,
  InferRequirementsOf<Steps>,
  InferEffectsOf<Steps>,
  InferTraitsOf<Steps>
>;
```

This gives the “bubble up” behavior:

```txt id="og3y65"
requirements bubble up
effects bubble up
errors bubble up
traits bubble up
outputs compose
inputs flow down
```

## 15. Flow-down builders

Builders should use context to flow types downward.

Entity scope:

```ts id="hb36oa"
const isAdmin = gen.rule(User, (u) => u.field(User.fields.role).eq(Role.Admin));
```

Action scope:

```ts id="wo8dvr"
const deleteUser = gen.action({
  input: User.fields.id.type,
  returns: User.type,
  body: ({ input, write, ref }) => write(User.fields.archivedAt, expr.now()),
});
```

The builder knows:

```txt id="lmggvb"
current phase
allowed operations
available refs
expected output type
target portability mode
context requirements
```

SQL-portable rule scope should expose only SQL-portable operations unless explicitly escaped.

```ts id="6nxvgn"
gen.rule.sql(User, (u) => u.role.eq(Role.Admin));

// opaque escape is explicit
gen.rule.server(User, (u) => expr.opaque(ServerOnlyPredicate, [u.id]));
```

That keeps full inference while making portability constraints visible.

## 16. Example end-to-end

### Define dialect symbols

```ts id="ez9j4v"
export const DomainDialect = defineDialect({
  id: dialectId("dialect.domain"),
  label: "Domain",
});

export const EntityNodeKind = defineNodeKind({
  id: nodeKindId("node.kind.domain.entity"),
  dialect: DomainDialect,
});

export const FieldNodeKind = defineNodeKind({
  id: nodeKindId("node.kind.domain.field"),
  dialect: DomainDialect,
});

export const OwnsFieldEdgeKind = defineEdgeKind({
  id: edgeKindId("edge.kind.domain.ownsField"),
  dialect: DomainDialect,
  endpoints: {
    owner: EntityEndpointRole,
    field: FieldEndpointRole,
  },
});
```

### Define an entity through stdlib

```ts id="ddpk53"
const User = gen.entity("User", {
  id: gen.type.uuid(),
  email: gen.type.email(),
  role: gen.type.enum(Role),
});
```

The stdlib emits:

```txt id="80c93h"
Node(EntityNodeKind) for User
Node(FieldNodeKind) for User.id
Node(FieldNodeKind) for User.email
Node(FieldNodeKind) for User.role

Edge(OwnsFieldEdgeKind): User -> User.id
Edge(OwnsFieldEdgeKind): User -> User.email
Edge(OwnsFieldEdgeKind): User -> User.role

Type nodes / refs for uuid, email, enum
Traits on email type: TypeEmail, TypeQueryable
```

### Define a rule

```ts id="f67kyf"
const isAdmin = gen.rule("isAdmin", ({ actor }) => actor.role.eq(Role.Admin));
```

Emits:

```txt id="0z2moo"
Node(RuleNodeKind): isAdmin
Expr comparison: actor.role == Role.Admin
Edge(ReadsEdgeKind): isAdmin -> User.role
Trait: ExprPure
Trait: ExprSqlLowerable, if proven
```

### Define an action

```ts id="n0mgfd"
const deleteUser = gen.action("deleteUser", {
  input: User.fields.id.type,
  auth: isAdmin,
  body: ({ input }) =>
    User.update(input, {
      archivedAt: expr.now(),
    }),
});
```

Emits:

```txt id="hx8vcb"
Node(ActionNodeKind): deleteUser
Trait NodeCallable
Trait NodeWritable
Trait NodeEffectful

Edge(GuardsEdgeKind): isAdmin -> deleteUser
Edge(WritesEdgeKind): deleteUser -> User.archivedAt
Edge(RequiresEdgeKind): deleteUser -> ClockService
```

### Lower to Postgres

Pipeline:

```txt id="2uzzay"
RuleNodeKind -> SqlPredicateNodeKind
ActionNodeKind -> ServerMutationNodeKind
EntityNodeKind -> TableNodeKind
GuardsEdgeKind + SqlPredicate -> RlsPolicyNodeKind
```

Emit:

```txt id="66c3jq"
CREATE TABLE users ...
CREATE POLICY ...
server action wrapper ...
```

## 17. How this fits the current repo

This can be incremental.

Current state:

```txt id="88kkmx"
core/refs.ts
  already has typed refs and stable IDs

core/node.ts
  already has StaticNode, traits, input/output, requirements/effects, metadata, phantom slots

types/semantic.ts
  already has SemanticType

expression/expr.ts
  already has Expr

relation/relation.ts
  currently has domain-specific Relation

lifecycle/lifecycle.ts
  currently has manual checker registration
```

Refactor path:

```txt id="w3u12f"
1. Add kernel symbols and typed trait definitions.
2. Add Edge as the generic relationship primitive.
3. Add Graph under GenContext.
4. Dual-write existing Entity/Relation/Rule/Action into Graph.
5. Wrap current checkers as Passes.
6. Move checker ownership into dialect definitions.
7. Add canonicalizers and lowerings.
8. Add target dialects.
```

Do not delete the public modules early. Treat them as frontends/dialects over the new kernel.

## 18. Final mental model

```txt id="m4q76b"
Id
  stable identity

SymbolDef
  typed semantic symbol; no magic strings

Type
  decoded/encoded value meaning

Expr
  inspectable logic

Transform
  typed representation conversion

Trait
  semantic claim, including laws and capabilities

Interface
  generic behavior contract for passes

Node
  semantic object

Edge
  semantic connection

Region
  nested IR body when needed

Dialect
  package of node kinds, edge kinds, traits, interfaces, verifiers, lowerings

Graph
  registry + indexes + provenance

Pass
  verify, derive, canonicalize, legalize, lower, emit
```

The result is:

> Gen2 becomes a TypeScript MLIR for application semantics, with Effect-inspired type/schema/service inference and a no-magic-string, symbol-first API.

[1]: https://mlir.llvm.org/docs/Interfaces/?utm_source=chatgpt.com "Interfaces - MLIR"
[2]: https://mlir.llvm.org/docs/Traits/?utm_source=chatgpt.com "Traits - MLIR"
[3]: https://mlir.llvm.org/docs/Passes/?utm_source=chatgpt.com "Passes - MLIR"

Yes — you already have many of these concepts in Gen2. The refactor should **not invent them from scratch**. It should re-express them using the new kernel model:

```txt id="pos8kd"
Refs
  true kernel

Storage locations / placement
  core dialect built on Node + Trait + Capability + Edge

Context / requirements / providers
  core dialect built on Node + Edge + Type + Effect-style requirements

Claims / auth / policy
  auth dialect built on Context + Rule + Edge + Expr

Ownership
  not one concept; mostly typed Edge kinds
```

The distinction I’d make is:

```txt id="wd7bne"
Kernel primitive:
  the compiler cannot function without it.

Core dialect:
  not a primitive, but shipped with core because many other dialects depend on it.
```

So the hard kernel stays small:

```txt id="7xxqzo"
Id / Ref
SymbolDef
Type
Expr
Transform
Trait
Interface
Node
Edge
Graph
Pass
Diagnostic
Artifact
```

Then the **core dialects** are:

```txt id="21zudp"
ref dialect
placement dialect
context dialect
requirement/provider dialect
ownership dialect
claim/auth-substrate dialect
```

## What already exists

You already have a strong `Ref` system. `refs.ts` describes refs as the typed citation primitive for anything other parts of the spec need to point at, and it already has stable IDs for entities, fields, relations, functions, rules, policies, key families, contexts, services, providers, routes, workflows, and migrations.

You already have typed storage locations. `StorageLocation` models where data lives, such as request context, server session store, client localStorage, query cache, cookies, database, cache, and queue. Each location has capabilities like persistence, sensitive-safety, client/server readability, and client/server writability.

You already have context IR. `ContextDef`, `ContextProvision`, and `ContextRequirement` represent typed environmental/session state, where it is provided from, and which parts of the app require it.

You already have a substantial requirement/provider system. Providers have sources like env vars, headers, cookies, route params, query params, hydration snapshots, client storage, state resources, reactive resources, service constructors, and opaque runtime values. They also carry placement, lifetime, scope, sensitivity, dependencies, and client projections.

You also already have auth/policy concepts, including conditions like authenticated, public, role, owner, relation, and OR conditions; policies target entities and can carry rule predicates and access surface bindings.

So the refactor is mostly about **unifying representation**, not discovering new concepts.

---

# 1. Reframe these as dialects

I would define these shipped dialects:

```txt id="0mq0ry"
core.ref
core.placement
core.context
core.requirement
core.ownership
auth.claim
auth.policy
```

They are not separate registries forever. They lower into the same graph:

```txt id="q0zgyp"
StorageLocation -> Node
ContextDef      -> Node
Provider        -> Node
Requirement     -> Node or Type-refined symbol
ContextProvision -> Edge
ContextRequirement -> Edge
Ownership       -> Edge
Claim           -> Node or Expr
Policy          -> Node
```

## Placement dialect

Current:

```ts id="ir5e4v"
StorageLocation {
  location_kind
  name
  capabilities
  ttl_ms
}
```

Revised graph model:

```ts id="zs0ohz"
const ServerRequestContext = defineNode({
  kind: StorageLocationNodeKind,
  traits: [
    LocationServerReadable,
    LocationServerWritable,
    LocationSensitiveSafe,
    LocationEphemeral,
  ],
  metadata: {
    label: "Server Request Context",
  },
});
```

Or more compactly, still using the stdlib API:

```ts id="z6qm8n"
const loc = gen.location.serverRequestContext();
```

But internally it emits:

```txt id="xxhy31"
Node(StorageLocationNodeKind)
Trait(LocationSensitiveSafe)
Trait(LocationServerReadable)
Trait(LocationServerWritable)
Trait(LocationEphemeral)
```

Capabilities like `client_readable` and `sensitive_safe` should become typed capability/trait values, not booleans alone.

```ts id="70gnv3"
LocationClientReadable;
LocationClientWritable;
LocationServerReadable;
LocationServerWritable;
LocationPersistent;
LocationSensitiveSafe;
```

Then the unsafe placement rule becomes graph logic:

```txt id="vkbdzz"
Provider provides sensitive value
Provider placedIn client-readable location
Location lacks sensitive-safe trait
=> diagnostic
```

That is cleaner than every subsystem learning storage-location internals.

---

# 2. Context / Requirement / Provider should become Effect-shaped

The current context system is already close to Effect concepts: typed context definitions, provisions, and requirements.

I would model it like this:

```txt id="jaqi74"
ContextDef
  Node(kind: ContextNodeKind)
  output: Type<T>

Requirement
  Node(kind: RequirementNodeKind)
  output: Type<T>
  traits: sensitivity, optional/required

Provider
  Node(kind: ProviderNodeKind)
  output: Type<T>
  traits: lifetime, sensitivity, placement

Edges:
  requires(consumer -> requirement/context/service)
  provides(provider -> requirement/context/service)
  placedIn(provider -> storageLocation)
  sourcedFrom(provider -> providerSource)
  dependsOn(provider -> requirement)
```

The Effect analogy:

```txt id="i3x9u0"
ContextDef / Requirement
  roughly Effect Context.Service / Context.Reference

Provider
  roughly Effect Layer

requires/provides edges
  typed service dependency graph
```

But keep it Gen2-owned, because you need placement, safety, hydration, client projection, target lowering, diagnostics, and graph provenance.

A revised provider could infer:

```ts id="do4dgb"
type ProviderNode<
  Provides,
  Requires = never,
  Lifetime = unknown,
  Sensitivity = unknown,
  Traits = EmptyTraits
>
```

And its edges would bubble up:

```txt id="nk0yk7"
Provider requires Database
Provider provides AuthSession
AuthSession is sensitive
Provider placedIn ServerSessionStore
```

Then a boundary/hydration pass can ask:

```txt id="slp5iw"
Can this context cross to client?
Is there a safe projection?
Is the provider lifetime compatible with the consumer?
Are all requirements satisfied?
Is there a provider cycle?
```

Your existing `deriveRequirementSatisfactionPlan` already does much of this procedurally: it collects requirements, matches providers, detects missing/ambiguous providers, checks placement, checks cycles, and validates lifetime/sensitivity issues. The revised kernel should move those facts into typed edges so any pass can query them.

---

# 3. Ownership should be edge kinds, not one primitive

“Ownership” appears in multiple forms:

```txt id="0xd3av"
Entity owns Field
Dialect owns NodeKind
Provider owns Lifetime?
User owns Project
Rule owns Expr
Artifact generatedFrom Node
View owns Controls
Storage table owns Columns
```

These should not all be the same hardcoded thing.

Use typed edge kinds:

```ts id="no75tn"
OwnsFieldEdgeKind;
OwnsRegionEdgeKind;
GeneratedFromEdgeKind;
BelongsToTenantEdgeKind;
DomainOwnerEdgeKind;
StorageContainsColumnEdgeKind;
```

All can share traits:

```ts id="w6s14x"
EdgeOwnership;
EdgeStructural;
EdgeCausal;
EdgeRuntime;
EdgeCompileTime;
```

Example:

```ts id="te6fy8"
defineEdge(OwnsFieldEdgeKind, {
  owner: UserEntityNode,
  field: UserEmailFieldNode,
});
```

For auth ownership:

```ts id="pk8yb2"
defineEdge(DomainOwnerEdgeKind, {
  owner: ActorNode,
  resource: ProjectNode,
  via: Project.fields.ownerId,
});
```

Then `AllowOwner` becomes a stdlib shorthand that creates a rule/claim using that edge.

---

# 4. Claims should be first-class, but probably in an auth dialect

“Claim” can mean several things:

```txt id="za1v5p"
actor has role admin
actor belongs to tenant T
actor owns resource R
request is authenticated
session has permission P
JWT contains claim email_verified=true
policy allows action
```

I would model claims as **typed facts**:

```ts id="nfxqxs"
ClaimNodeKind;
ClaimType;
ClaimIssuer;
ClaimSubject;
ClaimPredicateExpr;
```

A claim is usually:

```txt id="frenql"
subject + predicate + evidence/provenance + sensitivity + placement
```

Graph representation:

```txt id="reg0cb"
Node(ClaimNodeKind): ActorHasRoleAdmin
Edge(claimSubject): Claim -> Actor
Edge(claimPredicate): Claim -> Expr
Edge(claimDerivedFrom): Claim -> Context/AuthSession/JWT
Trait(ClaimClientSafe?) maybe no
Trait(ClaimAuthoritative?) maybe yes
```

Then auth policies consume claims:

```txt id="4o3rkk"
Policy requires Claim
Rule reads Claim
Action guardedBy Policy
Client hint derivedFrom Policy but not authoritative
```

Your current `AuthCondition` has `AllowAuthenticated`, `AllowPublic`, `AllowRole`, `AllowOwner`, `AllowRelation`, and `OrCondition`. Those are good public helpers, but internally they should become claim/rule/edge graphs.

Example:

```ts id="uzfw15"
allowRole(AdminRole);
```

emits something like:

```txt id="lry8xn"
Claim actor.role == AdminRole
Rule canExecute = claim holds
Edge guards(rule -> action)
```

This gets rid of role strings over time.

Roles should become typed symbols or enum values, not plain strings:

```ts id="5izdmv"
const AdminRole = defineClaimValue({
  id: claimValueId("role.admin"),
  type: RoleClaimType,
});
```

---

# 5. Refs are truly core

Unlike storage/context/claims, refs should be hard kernel.

Why? Because everything else needs stable identity.

You already have:

```txt id="a4x8fx"
EntityId
FieldId
RelationId
FunctionId
RuleId
PolicyId
KeyFamilyId
ContextId
ServiceId
ProviderId
RouteId
WorkflowId
MigrationId
```

and typed refs like `EntityRef`, `FieldRef`, `RelationRef`, `FunctionRef`, `RuleRef`, `PolicyRef`, and more.

In the revised kernel, keep this idea but generalize:

```ts id="9xde5z"
Ref<TargetKind, Value>;
StableId<TargetKind>;
SymbolRef<SymbolKind>;
NodeRef<Kind, Out>;
EdgeRef<Kind, Endpoints>;
TypeRef<Decoded, Encoded>;
ExprRef<Out>;
```

Every node/edge/type/expr/trait/symbol should be ref-addressable.

This is essential for:

```txt id="gcakg2"
no magic strings
rename lineage
source maps
diagnostics
graph diffs
agent edits
artifact tracing
incremental compilation
```

---

# 6. Where does all this sit in the revised kernel?

I’d split into three layers.

## Hard kernel

```txt id="bayytq"
Id / Ref
SymbolDef
Metadata
Trait
Interface
Type
Expr
Transform
Node
Edge
Graph
Pass
Diagnostic
Artifact
```

## Core dialects shipped with kernel

```txt id="brqt7p"
core.placement
  storage location, placement, safety capabilities

core.context
  context values, ambient state, request/session/tenant info

core.requirement
  requirements, providers, service dependencies, satisfaction planning

core.ownership
  structural ownership edge kinds

core.provenance
  explicit/inferred/lowered/generated source info

core.capability
  target/runtime/location capabilities
```

## Higher stdlib dialects

```txt id="l8w569"
domain
auth
storage
reactivity
ui
workflow
effect
postgres
react
solid
openapi
```

This keeps the kernel small but avoids treating context/placement as random app-level plugins.

---

# 7. Traits vs interfaces

This is the key conceptual distinction:

```txt id="ogv3dy"
Trait = a semantic claim.

Interface = a behavior contract / accessor protocol.
```

## Trait

A trait says something **is true** about an object.

Examples:

```txt id="4xg7b5"
NodeCallable
NodeReadable
NodeWritable
ExprPure
ExprSqlLowerable
LawIdempotent
LocationClientReadable
LocationSensitiveSafe
ProviderRequestScoped
ClaimAuthoritative
EdgeCausal
EdgeStructural
```

Traits are data. They are inspectable. They can be checked, implied, conflicted, lowered, and emitted.

```ts id="o7psyj"
hasTrait(node, NodeCallable);
hasTrait(expr, ExprSqlLowerable);
hasTrait(location, LocationSensitiveSafe);
```

Traits should not generally contain methods.

## Interface

An interface says: “generic passes may ask this object for specific behavior.”

Examples:

```txt id="zrdqir"
CallableInterface
  getInputType()
  getOutputType()
  getCallPlan()

ReadableInterface
  getReadEdges()

WritableInterface
  getWriteEdges()

ProviderInterface
  getProvidedTarget()
  getRequiredTargets()
  getPlacement()

LowerableToSqlInterface
  lowerToSql(ctx)

StorageLocationInterface
  getCapabilities()
```

The object may have the `NodeCallable` trait, but the `CallableInterface` tells the compiler how to interact with it generically.

### Why not only traits?

Because this gets awkward:

```ts id="vuwtif"
if (hasTrait(node, NodeCallable)) {
  // Okay, but where do I get input/output/call plan?
}
```

You could stuff everything into trait payloads, but then traits become giant behavior objects.

Better:

```ts id="e9du1y"
if (implementsInterface(node, CallableInterface)) {
  const callable = graph.as(node, CallableInterface);
  const input = callable.getInputType();
  const output = callable.getOutputType();
  const callPlan = callable.getCallPlan();
}
```

## Why not only interfaces?

Because many facts do not need behavior.

```txt id="qpxazr"
ExprPure
LawIdempotent
LocationSensitiveSafe
EdgeInferred
ClaimAuthoritative
```

These are semantic claims. You want them as inspectable data, not method contracts.

## Simple analogy

```txt id="2pxf59"
Trait:
  This thing is readable.

Interface:
  Here is how to enumerate what it reads.
```

Another:

```txt id="41yw39"
Trait:
  This expression is SQL-lowerable.

Interface:
  Here is the lowering method or lowering strategy.
```

Another:

```txt id="2u4pwi"
Trait:
  This provider is request-scoped.

Interface:
  Here is how to get its provided requirement, dependencies, source, and placement.
```

## Practical rule

Use a trait when a pass asks a yes/no or payload question:

```txt id="j99jc3"
Is this pure?
Is this client-readable?
Is this sensitive-safe?
Is this idempotent?
What is the inverse witness?
```

Use an interface when a pass needs structured behavior:

```txt id="facfm6"
Give me all writes.
Give me the provider dependencies.
Give me the call plan.
Lower this object to SQL.
Return the storage capability vector.
```

---

# 8. How this revises the primitive proposal

I’d revise the kernel/dialect design like this:

```txt id="dzqt31"
Hard kernel:
  Id / Ref
  SymbolDef
  Metadata
  Trait
  Interface
  Type
  Expr
  Transform
  Node
  Edge
  Graph
  Pass
  Diagnostic
  Artifact

Core dialects:
  Placement
  Context
  Requirement / Provider
  Ownership
  Claims substrate
  Capability
  Provenance
```

Storage locations, context, providers, and claims do **not** need to be hard primitives. But they should be **core dialects**, because they are foundational across targets.

This lets you keep the small kernel while still admitting that almost every serious app needs:

```txt id="7exv9f"
where values live
who owns/claims what
what context exists
what providers satisfy requirements
what can cross boundaries safely
what refs identify things
```

That is the right compromise.
Yes — I agree that **“Interface” is confusing**, especially in a TypeScript library where `interface` already means “structural object type.” I would avoid using it as a public Gen2 concept.

The concept we were trying to name is:

```txt
A typed behavior/accessor contract that generic passes can call without knowing the concrete node/edge kind.
```

## Better names than “Interface”

My top recommendation is **Protocol**.

```txt
Trait     = semantic claim
Protocol  = callable behavior contract for passes
```

That distinction reads well:

```ts
hasTrait(node, NodeWritable);

supportsProtocol(node, WritableProtocol);
graph.protocol(node, WritableProtocol).writeEdges();
```

Other good options:

```txt
Protocol
  Best overall. Conveys behavior contract without TypeScript confusion.

Facet
  Good if you want “one view of an object.” Example: WritableFacet, CallableFacet.

View
  Nice conceptually, but probably overloaded with UI views.

Capability
  Tempting, but I would not use it because “capability” should mean target/runtime ability.

Contract
  Strong, but you already have contracts in the repo and it may sound too user-facing/legal.

Role
  Good for “this object plays the callable role,” but may collide with auth roles.

Adapter
  Good implementation term, less good semantic term.

Lens
  Good for accessors, but too FP-specific and less obvious.

Handle
  Too runtime-ish.

Protocol is the cleanest.
```

So I’d rename:

```txt
CallableInterface  -> CallableProtocol
ReadableInterface  -> ReadableProtocol
WritableInterface  -> WritableProtocol
ProviderInterface  -> ProviderProtocol
StorageLocationInterface -> StorageLocationProtocol
SqlLoweringInterface -> SqlLoweringProtocol
```

## Revised terminology

Use:

```txt
Trait
  A semantic claim attached to an IR object.

Protocol
  A typed behavior/accessor surface implemented by a node/edge/type/expr kind.

Capability
  Something a target/runtime/location can support.

Law
  A trait that states a behavioral guarantee.

Dialect
  A package of node kinds, edge kinds, traits, protocols, verifiers, and lowerings.
```

Example:

```ts
const NodeWritable = defineTrait({
  id: traitId("trait.node.writable"),
  target: NodeTarget,
});

const WritableProtocol = defineProtocol({
  id: protocolId("protocol.writable"),
  methods: {
    writeEdges: true,
  },
});
```

Then:

```ts
const ActionNodeKind = defineNodeKind({
  id: nodeKindId("node.kind.action"),
  dialect: CallableDialect,
  traits: [NodeCallable, NodeWritable, NodeEffectful],
  protocols: [CallableProtocol, WritableProtocol],
});
```

The rule:

```txt
Trait answers: “what is true about this thing?”
Protocol answers: “what can generic compiler passes ask this thing to do or reveal?”
```

So:

```txt
NodeWritable trait
  This node semantically writes.

WritableProtocol
  A pass can ask this node for its write edges.

ExprSqlLowerable trait
  This expression is safe/valid to lower to SQL.

SqlLoweringProtocol
  A pass can request the SQL-lowered representation.
```

That is much clearer than “interface.”

---

# How MLIR handles ownership, memory, locations, etc.

MLIR handles these as **dialect-level and type-level semantics**, not as one universal “ownership primitive.”

That is the lesson for Gen2.

## 1. Locations are universal metadata

MLIR treats source locations as core IR metadata. The Builtin dialect includes location attributes like `FileLineColRange`, `NameLoc`, `FusedLoc`, `CallSiteLoc`, `OpaqueLoc`, and `UnknownLoc`. The docs explicitly say source location information is integral and always present in the IR; unknown locations must be explicit. ([MLIR][1])

Gen2 should copy this strongly.

Every kernel object should have:

```ts
loc?: Location
```

Where:

```ts
type Location =
  | { kind: "file"; file: string; line: number; column?: number; end?: ... }
  | { kind: "name"; name: string; child?: Location }
  | { kind: "fused"; locations: readonly Location[]; metadata?: Metadata }
  | { kind: "callsite"; callee: Location; caller: Location }
  | { kind: "generated"; by: PassRef; from: readonly ObjectRef[] }
  | { kind: "unknown" };
```

This is better than burying source information in generic metadata.

Gen2 use cases:

```txt
diagnostics
artifact source maps
agent edits
semantic diffs
generated code explanations
“why did this button disable?”
“where did this RLS policy come from?”
```

## 2. Memory is modeled by dialects and types

MLIR has a `memref` dialect for memory-reference types and memory operations like `memref.alloc`, `memref.dealloc`, `memref.copy`, `memref.realloc`, and `memref.memory_space_cast`. The `memref.dealloc` docs specify that deallocation frees memory originally created by `alloc`, and should not be called on aliasing views. ([MLIR][2])

It also models memory spaces. `memref.memory_space_cast` casts between memory spaces while preserving shape, element type, rank, and layout; the result aliases the same underlying memory. ([MLIR][2])

Gen2 analogue:

```txt
MLIR memref dialect
  memory allocation / deallocation / memory spaces

Gen2 placement dialect
  storage location / hydration location / context location / cache location
```

So Gen2 should not make “storage location” a hard primitive. It should be a **core dialect**:

```txt
placement dialect:
  StorageLocationNodeKind
  PlacedInEdgeKind
  SourcedFromEdgeKind
  CrossesBoundaryEdgeKind
  LocationClientReadable trait
  LocationServerReadable trait
  LocationSensitiveSafe trait
  LocationPersistent trait
  LocationEphemeral trait
```

Your current `StorageLocation` already has the right semantics: persistence, sensitive safety, client/server readability, and client/server writability. The refactor should turn those booleans into typed traits/capabilities so passes can query them generically.

## 3. Ownership is not just “a field”; it is analysis + IR

MLIR’s ownership-based buffer deallocation is a useful model. It tracks ownership of buffers as SSA `i1` values representing “responsibility to deallocate,” conceptually similar to `std::unique_ptr`. Ownership has a lattice with states like uninitialized, unique, and unknown; the pass uses liveness and interfaces such as `FunctionOpInterface`, `CallOpInterface`, `MemoryEffectOpInterface`, and region-branch interfaces. ([MLIR][3])

The Gen2 lesson:

```txt
Ownership should often be derived, not manually stored.
```

For Gen2, “ownership” appears in multiple domains:

```txt
Entity owns Field
Tenant owns Project
Actor owns Resource
Provider owns/satisfies Requirement
Location owns/stores Value
Generated artifact comes from Node
Action owns effect responsibility
```

Do not model this as one universal `owner` property.

Use typed edges:

```txt
OwnsFieldEdgeKind
DomainOwnerEdgeKind
ProvidesEdgeKind
PlacedInEdgeKind
GeneratedFromEdgeKind
ResponsibleForEdgeKind
```

And then analyses derive ownership-like facts:

```txt
Provider owns responsibility to supply AuthSession.
Action owns responsibility to enforce Policy.
Storage location owns persistence of Context.
Tenant owns visibility boundary for Project.
```

This mirrors MLIR: ownership becomes a graph/liveness/placement analysis over IR, not just a boolean.

## 4. Data layout is a scoped query system

MLIR’s data layout system lets the compiler answer questions about how values are stored, like size, alignment, pointer/index bit width, endianness, default/global memory spaces, and stack alignment. It is designed for MLIR’s open type and operation system using attribute, type, operation, and dialect interfaces. ([MLIR][4])

Gen2 analogue:

```txt
Storage/layout facts should be scoped and queryable.
```

For example:

```txt
In Postgres target:
  string -> text
  uuid -> uuid
  datetime -> timestamptz or bigint depending config

In SQLite target:
  uuid -> text/blob
  datetime -> integer/text

In client wire target:
  Date -> ISO string
  bigint -> string
```

So instead of putting all storage mapping directly on `Type`, use a layout/representation query:

```ts
graph.layout(PostgresLayout).storageType(EmailType);
graph.layout(JsonWireLayout).encodedType(DateTimeType);
graph.layout(ClientHydrationLayout).canExpose(AuthSessionType);
```

This is where a **Protocol** helps:

```ts
StorageLayoutProtocol
  storageRepresentation(type, target)
  alignment? maybe not needed for app Gen2
  wireRepresentation(type, boundary)
  canStore(type, location)
```

You probably do not need MLIR’s byte-level alignment sophistication for app semantics, but the architectural idea is excellent: **layout is contextual**.

## 5. Side effects are modeled through effects/protocols

MLIR commonly uses side-effect modeling via interfaces. The ownership-based deallocation pass uses `MemoryEffectOpInterface` among other interfaces to reason about memory behavior. ([MLIR][3])

Gen2 should do the same, renamed as protocols:

```txt
EffectProtocol
  read effects
  write effects
  external service effects
  storage effects
  network effects
  queue effects

ReadableProtocol
  readEdges()

WritableProtocol
  writeEdges()

ProviderProtocol
  provides()
  requires()
  placement()
```

Traits say what is true:

```txt
NodeEffectful
NodeReadable
NodeWritable
EdgeCausal
LawIdempotent
LawRetrySafe
```

Protocols reveal how to analyze it.

---

# What this means for the revised Gen2 core

I’d adjust the model to:

```txt
Hard kernel:
  Id / Ref
  SymbolDef
  Location
  Metadata
  Trait
  Protocol
  Type
  Expr
  Transform
  Node
  Edge
  Graph
  Pass
  Diagnostic
  Artifact

Core dialects:
  placement
  context
  requirement/provider
  ownership
  claim/auth substrate
  capability
  provenance
```

Note the addition of **Location** as hard kernel. MLIR makes locations universally available, and Gen2 should too.

## Why Location deserves hard-kernel status

Because every object needs provenance:

```txt
Type
Expr
Transform
Trait application
Node
Edge
Pass result
Artifact
Diagnostic
```

It should not be “just metadata.” Diagnostics and source maps depend on it.

## Why StorageLocation does not need hard-kernel status

Storage locations are crucial, but they are domain semantics, not universal compiler mechanics.

They belong in `core.placement` dialect:

```ts
const ServerRequestContext = defineStorageLocation({
  id: storageLocationId("location.server.requestContext"),
  traits: [
    LocationServerReadable,
    LocationServerWritable,
    LocationSensitiveSafe,
    LocationEphemeral,
  ],
});
```

## Why Context/Provider does not need hard-kernel status

They are foundational but still a dialect:

```ts
const AuthSession = defineContext({
  id: contextId("context.authSession"),
  type: AuthSessionType,
  sensitivity: SensitivityAuth,
});

const AuthSessionProvider = defineProvider({
  provides: AuthSession,
  source: CookieSession,
  placement: ServerSessionStore,
});
```

Internally:

```txt
Node(ContextNodeKind): AuthSession
Node(ProviderNodeKind): AuthSessionProvider
Edge(Provides): Provider -> Context
Edge(SourcedFrom): Provider -> Cookie
Edge(PlacedIn): Provider -> ServerSessionStore
Trait(SensitivityAuth)
```

## Why Claims are a dialect

Claims are auth-specific typed facts. They are very important but should not be hard-kernel:

```txt
Claim actor.role == admin
Claim actor.tenantId == resource.tenantId
Claim request.isAuthenticated
Claim user owns project
```

They belong in `auth.claim` or `core.claim` depending how foundational you want them.

I’d probably make a **claim substrate** core dialect and policy-specific behavior auth dialect:

```txt
core.claim:
  ClaimNodeKind
  ClaimSubjectEdgeKind
  ClaimPredicateEdgeKind
  ClaimSourceEdgeKind
  ClaimAuthoritative trait

auth.policy:
  PolicyNodeKind
  GuardsEdgeKind
  AccessSurfaceEdgeKind
  ClientHintEdgeKind
```

---

# Concrete revised terms

Use these names:

```txt
Trait
  semantic claim

Protocol
  behavior/accessor contract

Capability
  support provided by target/runtime/location

Law
  trait carrying behavioral guarantee

Location
  source/provenance/debug location

Placement
  where data/runtime value lives

StorageLocation
  node in placement dialect

Context
  typed ambient value

Requirement
  typed need

Provider
  typed supplier

Claim
  typed asserted fact

Ownership
  family of edge kinds + analyses
```

## Example

```ts
const LocationSensitiveSafe = defineTrait({
  id: traitId("trait.location.sensitiveSafe"),
  target: NodeTarget,
});

const StorageLocationProtocol = defineProtocol({
  id: protocolId("protocol.storageLocation"),
  methods: {
    capabilities: true,
  },
});

const ServerSessionStore = defineNode({
  kind: StorageLocationNodeKind,
  traits: [
    LocationPersistent,
    LocationSensitiveSafe,
    LocationServerReadable,
    LocationServerWritable,
  ],
  protocols: [StorageLocationProtocol],
});
```

Provider:

```ts
const AuthSessionProvider = defineNode({
  kind: ProviderNodeKind,
  output: AuthSessionType,
  traits: [ProviderSessionScoped, SensitivityAuth],
});

defineEdge(ProvidesEdgeKind, {
  provider: AuthSessionProvider,
  provided: AuthSessionContext,
});

defineEdge(PlacedInEdgeKind, {
  value: AuthSessionProvider,
  location: ServerSessionStore,
});
```

Checker:

```ts
const checkSensitivePlacement = definePass({
  phase: "verify",
  run(graph) {
    for (const edge of graph.edgesOfKind(PlacedInEdgeKind)) {
      const value = edge.endpoints.value;
      const location = edge.endpoints.location;

      if (
        hasTrait(value, SensitivitySecret) &&
        !hasTrait(location, LocationSensitiveSafe)
      ) {
        report(...)
      }
    }
  },
});
```

No strings. No special-purpose arrays. Same graph.

---

# Final answer

Rename **Interface** to **Protocol**.

Then the conceptual model is:

```txt
Trait:
  “This thing has property X.”

Protocol:
  “Passes can ask this thing for behavior Y.”

Capability:
  “This target/runtime/location supports feature Z.”
```

MLIR’s lesson is that locations, memory, ownership, and layout are not one-off fields. They are modeled through universal source locations, dialects, typed operations/types, effects, ownership analyses, and layout query systems. Gen2 should mirror that at the app-semantic level:

```txt
Location:
  hard kernel

Storage locations / placement:
  core placement dialect

Context / requirements / providers:
  core context/provider dialect, Effect-shaped

Ownership:
  typed edge kinds plus analyses

Claims:
  claim/auth dialect

Refs:
  hard kernel
```

That gives you a small kernel without losing the foundational concepts Gen2 already has.

[1]: https://mlir.llvm.org/docs/Dialects/Builtin/?utm_source=chatgpt.com "Builtin Dialect - MLIR"
[2]: https://mlir.llvm.org/docs/Dialects/MemRef/?utm_source=chatgpt.com "'memref' Dialect - MLIR"
[3]: https://mlir.llvm.org/docs/OwnershipBasedBufferDeallocation/?utm_source=chatgpt.com "Ownership-based Buffer Deallocation - MLIR"
[4]: https://mlir.llvm.org/docs/DataLayout/?utm_source=chatgpt.com "Data Layout Modeling - MLIR"

Yes. If the goal is **no partial measures**, I would not “add graph underlay and slowly coexist forever.” I would do a **hard internal cutover** on a long-lived migration branch, keep the public API only where it is worth preserving, and delete the old registries/checker model before merging.

The current architecture is broad: `src/index.ts` exports many parallel modules, and `GenContext` stores separate arrays for entities, stores, relations, queries, functions, policies, events, views, services, rules, providers, workflows, offline queues, and more. The transition plan should collapse all of that into one graph-backed compiler kernel.

# Gen2 Kernel Transition Plan

## Migration rule

> After the migration, every semantic concept must be represented as `Node`, `Edge`, `Type`, `Expr`, `Transform`, `Trait`, `Protocol`, or `Pass` in the new graph. No permanent parallel registries.

Temporary compatibility shims are allowed **inside the migration branch**, but not in the final merged architecture.

---

# Target architecture

```txt
src/kernel/
  id.ts
  ref.ts
  symbol.ts
  location.ts
  metadata.ts
  trait.ts
  protocol.ts
  type.ts
  expr.ts
  transform.ts
  node.ts
  edge.ts
  graph.ts
  dialect.ts
  pass.ts
  diagnostic.ts
  artifact.ts
  index.ts

src/dialects/
  core/
    ref/
    placement/
    context/
    requirement/
    provider/
    ownership/
    claim/
    provenance/
  domain/
  expression/
  callable/
  auth/
  storage/
  reactivity/
  ui/
  workflow/
  effect/
  targets/
    postgres/
    react/
    solid/
    openapi/

src/gen/
  public builder API backed by dialect frontends

src/lifecycle/
  pass pipeline runner only
```

The hard kernel:

```txt
Id / Ref
SymbolDef
Location
Metadata
Trait
Protocol
Type
Expr
Transform
Node
Edge
Graph
Dialect
Pass
Diagnostic
Artifact
```

Everything else is a dialect.

---

# Phase 0 — freeze architecture and create migration branch

Create:

```txt
branch: refactor/new-kernel-cutover
```

Rules for the branch:

```txt
No new feature work unless it lands on the new kernel.
No new GenContext top-level arrays.
No new string-based trait/kind APIs.
No new lifecycle module checker unless expressed as a Pass.
No target emitter should consume old module-specific IR directly.
```

Before changing code, add golden tests around current behavior:

```txt
entity definition
relation definition
rule definition
query/action definition
auth policy
reactivity invalidation
provider/requirement satisfaction
storage location safety
lifecycle check result
artifact generation
```

The point is not to preserve internals. It is to preserve user-facing behavior where desired.

Also update `AGENTS.md` or add a migration note saying all core work must run `vp check` and `vp test`; the existing agent instructions already require reading core primitive docs and running those commands.

---

# Phase 1 — build the new kernel in isolation

Add `src/kernel/*`.

Do **not** wire old modules yet.

Core definitions:

```ts
defineSymbol(...)
defineTrait(...)
defineProtocol(...)
defineNodeKind(...)
defineEdgeKind(...)
defineEndpointRole(...)
defineDialect(...)
definePass(...)
defineGraph(...)
```

The kernel must support:

```txt
typed refs / stable IDs
typed symbols instead of magic strings
traits on every IR object
protocols for pass-accessible behavior
nodes
edges
types with Decoded / Encoded / DecodeR / EncodeR
expressions with requirements/effects/traits/refs
transforms
locations / provenance
graph query APIs
pass pipeline execution
diagnostics attached to refs/locations
```

Acceptance criteria:

```txt
No dependency on entity/relation/query/ui/auth modules.
Kernel tests pass.
Graph can register nodes, edges, traits, protocols, dialects, and passes.
Graph APIs accept typed symbols, not strings.
```

---

# Phase 2 — define core dialects

Create the dialects that everything else needs.

## `core.ref`

Wrap the existing ref/stable ID idea. The current `refs.ts` is already a strong base: it has stable IDs and typed refs for entities, fields, relations, functions, rules, policies, key families, contexts, services, providers, routes, workflows, and migrations.

Keep the idea, but move it into kernel/core dialect terms.

## `core.placement`

Re-express `StorageLocation` as graph nodes and traits.

Current storage locations already model persistence, sensitive safety, client/server readability, and client/server writability. Convert those booleans into typed traits/capabilities:

```txt
LocationPersistent
LocationEphemeral
LocationSensitiveSafe
LocationClientReadable
LocationClientWritable
LocationServerReadable
LocationServerWritable
```

## `core.context`

Convert:

```txt
ContextDef
ContextProvision
ContextRequirement
```

into:

```txt
Node(ContextNodeKind)
Edge(ProvidesContext)
Edge(RequiresContext)
Edge(PlacedIn)
```

The current context module already models typed context definitions, provisions, and requirements.

## `core.requirement` / `core.provider`

Convert providers/requirements into nodes and edges.

Current providers already track source, placement, storage, lifetime, scope, sensitivity, dependencies, and safe client projection. These become:

```txt
Node(RequirementNodeKind)
Node(ProviderNodeKind)
Edge(Provides)
Edge(Requires)
Edge(PlacedIn)
Edge(SourcedFrom)
Trait(SensitivityAuth)
Trait(LifetimeRequest)
Trait(LifetimeSession)
```

## `core.ownership`

Define ownership as edge kinds, not a field:

```txt
Owns
OwnsField
Contains
GeneratedFrom
ResponsibleFor
BelongsToTenant
```

## `core.claim`

Define claim substrate:

```txt
ClaimNodeKind
ClaimSubjectEdgeKind
ClaimPredicateEdgeKind
ClaimSourceEdgeKind
ClaimAuthoritative
ClaimClientSafe
```

Auth policy can build on this later.

Acceptance criteria:

```txt
All core dialect symbols are typed definitions.
No raw string trait/kind checks.
Storage/context/provider safety can be expressed as graph passes.
```

---

# Phase 3 — replace `GenContext` with graph-first context

Current `GenContext` has dozens of semantic arrays. Replace it with:

```ts
interface GenContext {
  graph: Graph;
  plugins: Plugin[];
  config: Config;
  status: ContextStatus;
  diagnostics: Diagnostic[];
  artifacts: Artifact[];
  helpers: Map<string, Record<string, unknown>>;
}
```

Do **not** keep permanent arrays like:

```txt
entities
relations
query_functions
action_functions
policies
views
providers
rules
reactions
```

During the migration branch, temporary accessors may exist:

```ts
ctxView.entities();
ctxView.actionFunctions();
ctxView.providers();
```

But these must query the graph. They must not be authoritative storage.

Acceptance criteria:

```txt
No module writes directly to ctx.entities / ctx.relations / ctx.rules.
All semantic registration goes through graph.addNode / graph.addEdge / graph.addType / graph.addExpr.
Old arrays removed before merge.
```

---

# Phase 4 — migrate public builders to dialect frontends

Keep ergonomic APIs where they are good:

```ts
gen.entity(...)
gen.relation(...)
gen.rule(...)
gen.func.query(...)
gen.func.action(...)
gen.authz.policy(...)
gen.context.define(...)
gen.provider.define(...)
```

But every builder must emit graph IR.

Example:

```ts
gen.entity("User", {
  id: gen.type.uuid(),
  email: gen.type.email(),
});
```

emits:

```txt
Node(EntityNodeKind): User
Node(FieldNodeKind): User.id
Node(FieldNodeKind): User.email
Edge(OwnsField): User -> User.id
Edge(OwnsField): User -> User.email
Edge(HasType): User.id -> UuidType
Edge(HasType): User.email -> EmailType
```

Current `Relation` becomes a domain edge, not a primitive. The existing relation module currently models entity relations, cardinality, integrity modes, foreign keys, deletion behavior, and link entities. In the new model:

```txt
gen.relation(...)
  -> Edge(DomainRelation)
  -> traits for cardinality/integrity/FK behavior
  -> optional link entity node
```

Acceptance criteria:

```txt
All public builders emit graph nodes/edges/types/exprs.
No public builder stores semantic objects outside graph.
Old object shapes are either removed or become thin handles around graph refs.
```

---

# Phase 5 — migrate traits, laws, and capabilities

Current traits are split: node traits are string-ish trait kinds, while type traits are separate objects with validation/storage behavior. Collapse them into one typed trait system.

Replace:

```ts
traits: ["callable", "readable"];
```

with:

```ts
traits: [NodeCallable, NodeReadable];
```

Add law traits:

```txt
LawPure
LawDeterministic
LawIdempotent
LawReversible
LawAssociative
LawCommutative
LawRetrySafe
LawRollbackSafe
```

Add capability traits:

```txt
CapabilitySql
CapabilityRls
CapabilityTransactions
CapabilityReactComponents
CapabilityEffectRuntime
```

Trait applications may carry witnesses:

```ts
applyTrait(transform, LawReversible, {
  inverse: inverseTransform.ref,
});
```

Acceptance criteria:

```txt
No internal raw string trait comparisons.
Magic-string checker updated to flag legacy trait/kind strings.
Traits attach to Type, Expr, Transform, Node, Edge, Pass, Artifact.
Laws are traits.
Capabilities are traits on target/runtime/location nodes.
```

---

# Phase 6 — introduce Protocols and migrate generic behavior

Rename the confusing “Interface” concept to **Protocol**.

```txt
Trait:
  semantic claim

Protocol:
  pass-accessible behavior/accessor contract
```

Examples:

```txt
CallableProtocol
  inputType()
  outputType()
  callPlan()

ReadableProtocol
  readEdges()

WritableProtocol
  writeEdges()

ProviderProtocol
  provides()
  requires()
  placement()

StorageLocationProtocol
  capabilities()

SqlLoweringProtocol
  lowerToSql()
```

Do not overload traits with behavior. A trait says “this thing is writable.” A protocol tells a generic pass how to get the write edges.

Acceptance criteria:

```txt
Generic passes use protocols, not module-specific type checks.
Node/edge kinds declare supported protocols.
Protocol implementations are registered by dialects.
```

---

# Phase 7 — replace lifecycle with pass pipelines

Current lifecycle manually registers many module checkers. Replace that with dialect-owned passes.

New phases:

```txt
verify-symbols
verify-dialects
derive
canonicalize
legalize
lower
emit
```

Example pipelines:

```txt
gen2-check
  verify symbols
  verify dialect invariants
  derive field/read/write/guard edges
  canonicalize graph
  verify graph

gen2-postgres
  verify
  canonicalize
  legalize domain -> storage
  legalize rules -> sql
  legalize auth -> postgres.rls
  emit sql artifacts

gen2-react
  verify
  canonicalize
  legalize ui -> component model
  legalize reactivity -> query hooks
  emit tsx artifacts
```

Acceptance criteria:

```txt
lifecycle.check(ctx) runs a pass pipeline.
lifecycle.generate(ctx) runs check + target pipeline.
Old moduleCheckers removed.
Checkers live in dialect definitions.
```

---

# Phase 8 — migrate each old module into dialects

Do this as hard replacements, not dual systems.

## `types`

Current `SemanticType<T>` becomes `GType<Decoded, Encoded, DecodeR, EncodeR, Traits>`. Keep helper names like `gen.types.email()` if desired, but they return kernel `Type` handles.

## `expression`

Current `Expr` becomes kernel `Expr`. Preserve AST builders but emit typed symbol-backed expr kinds.

## `entity`

Becomes domain dialect frontend.

## `relation`

Becomes domain edge frontend.

## `function`

Becomes callable dialect:

```txt
QueryNodeKind
ActionNodeKind
PatchNodeKind
PlanNodeKind
CallableProtocol
ReadableProtocol
WritableProtocol
```

## `authz`

Current auth policy conditions become claims/rules/edges. Existing policy code already includes authenticated/public/role/owner/relation/or conditions and rule-backed policies. Convert those into:

```txt
Claim nodes
Rule exprs
Policy nodes
Guard edges
Access-surface edges
Placement traits
```

## `reactivity`

Consumes read/write/derive/invalidate edges from graph.

## `storage`

Consumes domain/type/placement edges and lowers to storage dialect.

## `ui`

Consumes view/form/action/rule edges and lowers to UI dialect.

Acceptance criteria:

```txt
Each old module either becomes a dialect or is deleted.
No module owns an independent semantic registry.
```

---

# Phase 9 — legalization and target dialects

No emitter should emit directly from high-level domain/app IR.

Instead:

```txt
domain.entity -> storage.record -> postgres.table -> sql artifact
logic.rule -> sql.predicate -> postgres.rls_policy -> sql artifact
ui.view -> ui.component_model -> react.component -> tsx artifact
callable.action -> server.mutation -> route/rpc artifact
```

Add target dialects:

```txt
postgres
sqlite
react
solid
effect
openapi
```

Effect target:

```txt
GType <-> Effect Schema adapter
Requirement/Provider -> Effect Context.Service / Layer
Action -> Effect runtime program
```

But do not make Effect the kernel.

Acceptance criteria:

```txt
Emitters only accept legalized target dialect IR.
Unsupported lowering produces diagnostics, not partial generated code.
```

---

# Phase 10 — delete old architecture

Before merge, delete or fully convert:

```txt
ctx.entities
ctx.relations
ctx.query_functions
ctx.action_functions
ctx.policies
ctx.rules
ctx.providers
ctx.views
ctx.reactive_resources
ctx.moduleCheckers
string trait kinds
string node kinds
string edge kinds
direct module check registry
target emitters consuming old IR
```

Keep only:

```txt
Graph
Dialects
Pass pipelines
Public builders
Target emitters
```

Acceptance criteria:

```txt
grep confirms old registries are gone.
All semantic objects are graph-backed.
All checks are passes.
All codegen consumes target dialect IR.
vp check passes.
vp test passes.
Golden behavior tests pass or intentionally updated.
```

---

# Phase 11 — update docs and agent workflow

Update:

```txt
README.md
docs/core-primitives.md
AGENTS.md
migration guide
plugin author guide
target author guide
```

Docs must explain:

```txt
Kernel primitives
Dialects
Traits vs Protocols
Types with Decoded/Encoded/Requirements
Edges
Pass pipelines
Legalization
No magic strings
How to write a plugin
How to write a target
How agents should inspect/modify graph IR
```

`AGENTS.md` already says agents should read core primitive docs before core IR/rules/reactivity/provider/target work and run `vp check` and `vp test`. Update it so agents use graph queries and semantic diffs rather than editing old registries.

---

# Suggested execution order

```txt
1. Kernel
2. Core dialects
3. Graph-first GenContext
4. Domain/types/expression dialects
5. Callable/rule/auth dialects
6. Placement/context/provider dialects
7. Reactivity/storage/ui dialects
8. Lifecycle pass pipelines
9. Target legalization
10. Delete old registries
11. Docs + migration guide
```

---

# Non-negotiable architecture checks

Add CI checks or tests that fail if someone reintroduces old patterns.

```txt
No raw string trait/kind comparisons.
No new top-level GenContext semantic arrays.
No module-level checker registry outside pass pipeline.
No target emitter consuming high-level source dialect directly.
No public internal-ref API accepting unbranded strings.
No metadata used to control compiler behavior.
```

Metadata is descriptive. Traits, edges, types, transforms, and passes control semantics.

---

# Final shape

After the migration, Gen2 should be:

```txt
A typed semantic graph compiler.

Public API:
  gen.entity(...)
  gen.rule(...)
  gen.action(...)
  gen.view(...)

Internal IR:
  Graph of typed Nodes, Edges, Types, Exprs, Transforms, Traits, Protocols

Organization:
  Dialects

Execution:
  Pass pipelines

Targets:
  Legalized target dialects

Safety:
  No magic strings
  Stable refs
  Typed symbols
  Full provenance
  Diagnostics from graph traces
```

That is the full transition: not a graph underlay, not a second system, but a replacement compiler kernel.

Absolutely. This should change the kernel plan.

I’d promote **Operation** back into the revised kernel, but in a more MLIR/Effect-inspired way than the current `Operation` model.

You already have an operation system today: `src/types/operation.ts` defines unified operations for unary, binary, comparison, aggregate, reducer, predicate, and effect operations; each operation carries type fields, capabilities, laws, effects, and runtime implementations. That is exactly the right instinct. The revised kernel should make this concept more central, more typed, and more graph-connected.

The revised hard kernel should be:

```txt id="f8zwdn"
Id / Ref
SymbolDef
Location
Metadata
Trait
Protocol
Type
Operation
Expr
Transform
Node
Edge
Graph
Dialect
Pass
Diagnostic
Artifact
```

## The key distinction: operation definition vs operation use

You need two levels:

```txt id="ofz4t4"
OperationDef
  The reusable semantic operation:
  add, equals, setField, append, deleteRow, sendEmail, sum, transitionStatus.

OperationUse
  A specific application of that operation:
  User.status = "archived"
  sum(Invoice.total)
  deleteUser(userId)
```

In Gen2 terms:

```txt id="s14tls"
OperationDef
  defines what can happen to what types.

Expr / Node / Edge
  records that it did happen in a specific app graph.
```

So `Operation` should not just be buried inside `ExprAstNode`. It should be a first-class thing the graph can query.

## Why this matters

Features like these depend on operation semantics:

```txt id="n1m8cw"
auto CRUD
optimistic updates
rollback
offline replay
IVM
materialized views
cache invalidation
safe retries
merge/conflict resolution
audit logs
authorization placement
SQL lowering
client/server placement
```

For example, optimistic update is not just “this action writes a field.”

It needs to know:

```txt id="az39fk"
What operation happened?
Is it deterministic?
Is it reversible?
What is the inverse?
Is it commutative?
Is it idempotent?
Does it preserve ordering?
Can it be represented as a patch?
Can the patch be applied locally?
Can the patch be merged with another patch?
What type does it operate on?
What locations/targets can implement it?
```

That is operation metadata, laws, traits, and edges.

## Revised `OperationDef`

I’d model operation definitions like this:

```ts id="iw1cgy"
export interface OperationDef<
  Kind extends OperationKindDef = OperationKindDef,
  Args extends readonly GType[] = readonly GType[],
  Out extends GType = GType,
  Err = never,
  Req = never,
  Eff = never,
  TTraits extends TraitSet = EmptyTraits,
> {
  readonly kind: Kind;
  readonly id: OperationId;
  readonly name?: DisplayName;

  readonly args: Args;
  readonly output: Out;

  readonly traits: readonly TraitDef<OperationTarget, any>[];
  readonly protocols?: readonly ProtocolDef[];

  readonly requirements?: readonly RequirementDef[];
  readonly effects?: readonly EffectDef[];

  readonly implementations?: readonly OperationImplementation[];

  readonly metadata?: Metadata;
  readonly loc?: Location;

  readonly _args?: Args;
  readonly _output?: Out;
  readonly _error?: Err;
  readonly _requirements?: Req;
  readonly _effects?: Eff;
  readonly _traits?: TTraits;
}
```

Where operation kinds are typed symbols, not strings:

```ts id="og2ow5"
UnaryOperationKind;
BinaryOperationKind;
ComparisonOperationKind;
AggregateOperationKind;
ReducerOperationKind;
PredicateOperationKind;
EffectOperationKind;
MutationOperationKind;
PatchOperationKind;
TransitionOperationKind;
```

The current code has these as string union kinds. In the new kernel they should be typed symbols.

## Operation traits

Operation traits should include both ordinary semantic traits and laws:

```txt id="zcgkdc"
OperationPure
OperationDeterministic
OperationTotal
OperationPartial
OperationEffectful
OperationClientSafe
OperationServerOnly
OperationSqlLowerable
OperationPatchable
OperationInvertible
OperationIncrementalizable

LawAssociative
LawCommutative
LawIdempotent
LawIdentity
LawInverse
LawDistributive
LawMonotonic
LawOrderPreserving
LawConfluent
LawRetrySafe
LawRollbackSafe
```

Some laws need witnesses:

```ts id="bzn5aj"
applyTrait(appendItem, LawInverse, {
  inverse: removeItem.ref,
});

applyTrait(sumReducer, LawIdentity, {
  identity: expr.literal(0),
});

applyTrait(setField, OperationPatchable, {
  patchType: FieldPatchType,
});
```

This is essential. A compiler cannot safely generate rollback just because something is labeled `"inverse"`; it needs the inverse operation or patch witness.

## Type-operation edges

This is the big missing piece.

To track “what operations happen to what types,” add explicit edges:

```txt id="zq119e"
Type supports Operation
Operation accepts Type
Operation returns Type
Operation reads Field
Operation writes Field
Operation transforms Type A -> Type B
Operation produces PatchType
Operation hasInverse Operation
Operation lowersTo TargetOperation
Operation invalidates Key
Operation derives View
```

Typed edge kinds:

```ts id="mphjge"
SupportsOperationEdgeKind;
OperationAcceptsTypeEdgeKind;
OperationReturnsTypeEdgeKind;
OperationReadsEdgeKind;
OperationWritesEdgeKind;
OperationProducesPatchEdgeKind;
OperationInverseEdgeKind;
OperationLowersToEdgeKind;
OperationInvalidatesEdgeKind;
```

Example:

```txt id="q5wv13"
Type(User.status) supports SetField
SetField writes User.status
SetField produces FieldPatch<User.status>
SetField inverse RestoreFieldValue
SetField is deterministic
SetField is patchable
SetField is client-safe if field is client-safe
```

Now CRUD, optimistic updates, and IVM can all ask the graph:

```ts id="z2yvdh"
graph.operationsForType(User.fields.status.type);
graph.edgesOfKind(OperationWritesEdgeKind);
graph.operationsWithTrait(OperationPatchable);
graph.operationInverse(setArchived);
```

## Typeclasses / operation families

You should avoid registering every operation manually for every type.

Instead, add operation families / typeclass-like traits:

```txt id="lu7zqy"
TypeComparable
TypeOrderable
TypeNumeric
TypeAdditive
TypeMultiplicative
TypeMonoid
TypeGroup
TypeLattice
TypePatchable
TypeMergeable
TypeSerializable
TypeQueryable
TypeIndexable
```

Then operations declare constraints:

```ts id="cxy1gi"
const Equals = defineOperationFamily({
  id: operationId("op.equals"),
  args: [T, T],
  output: BooleanType,
  requiresTypeTraits: [TypeComparable],
  traits: [OperationPure, OperationDeterministic, ExprSqlLowerable],
});
```

For a type:

```ts id="ko1w52"
const Email = stringType()
  .pipe(withTrait(TypeComparable))
  .pipe(withTrait(TypeQueryable))
  .pipe(withTrait(TypeSerializable));
```

Then `Email == Email` is legal because `Email` satisfies `TypeComparable`.

This is how you keep inference composable.

## Operation application

An expression operation call should point to an `OperationDef`.

```ts id="yucp6s"
export interface OperationUse<Op extends OperationDef, Args extends readonly ExprRef[]> {
  readonly operation: Op;
  readonly args: Args;
  readonly output: InferOperationOutput<Op, Args>;
  readonly traits: InferOperationUseTraits<Op, Args>;
  readonly requirements: InferOperationRequirements<Op, Args>;
  readonly effects: InferOperationEffects<Op, Args>;
}
```

Then an expression is not:

```ts id="gz20t8"
{ kind: "op_call", op: "eq" }
```

It is:

```ts id="44nnsx"
{
  kind: OperationCallExprKind,
  operation: Equals,
  args: [User.fields.role, AdminRole],
}
```

No magic strings. Full traceability.

## Mutation operations

For CRUD and optimistic updates, generic “operation” is not enough. You need a specialized mutation operation model.

```ts id="e1phq7"
export interface MutationOperationDef<
  Target,
  Input,
  Output,
  Patch,
  Req = never,
  Eff = never,
  Traits extends TraitSet = EmptyTraits,
> extends OperationDef<
  typeof MutationOperationKind,
  readonly [GType<Input>],
  GType<Output>,
  never,
  Req,
  Eff,
  Traits
> {
  readonly target: Ref<Target>;
  readonly patchType?: GType<Patch>;
}
```

Common mutation operation families:

```txt id="jvajib"
createRecord
updateField
updateRecord
deleteRecord
softDelete
restore
appendItem
removeItem
increment
decrement
transitionState
linkRelation
unlinkRelation
```

Each one can carry properties:

```txt id="or0ywf"
patchable
invertible
idempotent
commutative
requiresBeforeState
requiresAfterState
requiresTransaction
safeForOptimisticApply
safeForOfflineReplay
```

Example:

```ts id="r152eg"
const SetField = defineMutationOperation({
  id: operationId("op.field.set"),
  target: FieldTarget,
  input: FieldSetInputType,
  output: FieldPatchType,
  traits: [OperationDeterministic, OperationPatchable, OperationInvertible],
  laws: [LawLastWriteWins],
});
```

## CRUD as operation generation

CRUD should become a generator of operation definitions and operation uses.

For entity `Project`, CRUD expands into operations:

```txt id="9aa3od"
Project.create
Project.update
Project.delete
Project.softDelete
Project.restore
Project.setStatus
Project.linkOwner
Project.unlinkOwner
```

Each operation has:

```txt id="cgor7z"
input type
output type
write set
patch type
inverse if available
required laws
auth requirements
target lowerings
reactivity behavior
```

Then CRUD is not magic. It is a dialect frontend that emits operation definitions, action nodes, edges, and policies.

## Optimistic updates

Optimistic update generation should require operation properties.

For an action:

```txt id="prbxxe"
Action uses Operation Project.setStatus
Operation writes Project.status
Operation produces FieldPatch<Project.status>
Operation has inverse patch if before-state available
Operation deterministic
Operation client-safe
```

Then optimistic strategy can be selected:

```txt id="iv8c39"
Best:
  apply local patch + rollback inverse

Fallback:
  apply local pending marker + refetch affected keys

Fallback:
  disable submit until server response
```

The pass should be graph-driven:

```ts id="y25z0y"
if (
  hasTrait(op, OperationPatchable) &&
  hasTrait(op, OperationInvertible) &&
  hasTrait(op, OperationClientSafe)
) {
  emitOptimisticPatchPlan(op);
} else if (hasTrait(op, OperationPatchable)) {
  emitOptimisticApplyThenRefetch(op);
} else {
  emitPendingOnlyPlan(op);
}
```

This is exactly the kind of explicit fallback philosophy Gen2 wants.

## Auto IVM

For IVM, you need more than read/write sets. You need incremental semantics.

Operations should expose delta behavior:

```txt id="8m8c2s"
Operation produces delta
Operation can update aggregate
Operation is monotonic
Operation preserves ordering
Operation affects predicate truth
Operation affects join membership
Operation has incremental maintenance rule
```

Add operation protocols:

```txt id="c93exi"
DeltaProtocol
  deltaType()
  deriveDelta(use)

PatchProtocol
  patchType()
  applyPatch()
  invertPatch()

ReducerProtocol
  identity()
  combine()
  laws()

PredicateAffectProtocol
  affectedBy(writeOp, predicate)

MaterializationProtocol
  maintain(view, delta)
```

This is where **Protocol** differs from Trait:

```txt id="8k2j9o"
Trait:
  Operation is monotonic.

Protocol:
  Given this operation and this materialized view, produce the incremental maintenance plan.
```

Example:

```txt id="137y64"
sum(Invoice.total)
Operation Invoice.total.increment(delta)
Reducer sum has:
  identity = 0
  associative
  commutative
  incremental rule: sum += delta
=> auto IVM can maintain sum without refetch
```

For list filters:

```txt id="pzw20k"
Query: Project where status == "active"
Operation: set Project.status from active -> archived
PredicateAffectProtocol says:
  old row leaves result set
=> emit remove-from-list patch
```

Without operation semantics, you only know “status changed,” so you have to invalidate broadly.

## Operation properties belong in graph, not metadata

Do not put this in metadata:

```ts id="9q2ip9"
metadata: { optimistic: true, reversible: true }
```

Use traits/laws/protocols/edges:

```txt id="wn0jto"
Trait(OperationPatchable)
Trait(OperationInvertible)
Trait(LawIdempotent)
Edge(OperationInverse -> inverse operation)
Edge(OperationProducesPatch -> patch type)
Protocol(PatchProtocol)
```

Metadata is for labels, descriptions, docs, examples.

## Revised kernel object map

Now the minimal kernel has:

```txt id="s5725b"
Type
  value domain and representation

Operation
  what can happen to values/types

Expr
  pure/static use of operations

Transform
  special operation for representation conversion

Node
  semantic object/action/query/view/provider/etc.

Edge
  semantic relationship among objects

Trait
  semantic claim, including laws and capabilities

Protocol
  behavior/accessor surface for passes

Pass
  derives/checks/lowers/emits graph
```

`Transform` may actually become a specialized operation:

```txt id="tjvziq"
Transform = OperationDef with:
  one input type
  one output type
  encode/decode direction
  representation semantics
```

But I would keep `Transform` as a named kernel object because it is important enough for schema/wire/storage.

## Practical types

A compact operation type:

```ts id="oa72a5"
export interface GOperation<
  Kind extends OperationKindDef,
  Args extends readonly GType[],
  Out extends GType,
  Err = never,
  Req = never,
  Eff = never,
  Traits extends TraitSet = EmptyTraits,
> {
  readonly kind: Kind;
  readonly id: OperationId;
  readonly args: Args;
  readonly output: Out;

  readonly traits: readonly TraitDef[];
  readonly protocols: readonly ProtocolDef[];

  readonly effects: readonly EffectDef[];
  readonly requirements: readonly RequirementDef[];
  readonly implementations: readonly OperationImplementation[];

  readonly loc?: Location;
  readonly metadata?: Metadata;

  readonly _args?: Args;
  readonly _output?: Out;
  readonly _error?: Err;
  readonly _requirements?: Req;
  readonly _effects?: Eff;
  readonly _traits?: Traits;
}
```

Helpers:

```ts id="d3bc9g"
type InferOperationArgs<Op> =
  Op extends GOperation<any, infer A, any, any, any, any, any> ? A : never;
type InferOperationOutput<Op> =
  Op extends GOperation<any, any, infer O, any, any, any, any> ? O : never;
type InferOperationEffects<Op> =
  Op extends GOperation<any, any, any, any, any, infer E, any> ? E : never;
type InferOperationTraits<Op> =
  Op extends GOperation<any, any, any, any, any, any, infer T> ? T : never;
```

Operation family with constraints:

```ts id="t1zl1k"
export interface OperationFamily<
  Params extends readonly TypeParamDef[],
  Args,
  Out,
  Constraints extends readonly TraitDef[],
> {
  readonly id: OperationFamilyId;
  readonly params: Params;
  readonly args: Args;
  readonly output: Out;
  readonly requiresTypeTraits: Constraints;
}
```

Usage:

```ts id="93l428"
const Eq = defineOperationFamily({
  id: operationFamilyId("op.eq"),
  params: [T],
  args: [T, T],
  output: BooleanType,
  requiresTypeTraits: [TypeComparable],
  traits: [OperationPure, OperationDeterministic],
});
```

## What the graph can answer

Once operation definitions and operation-use edges exist, Gen2 can answer:

```txt id="h0k3bz"
Which operations can apply to this type?
Which operations write this field?
Which actions use non-idempotent operations?
Which operations can be optimistic?
Which operations can be replayed offline?
Which operations affect this predicate?
Which operations can incrementally maintain this view?
Which operations require before-state?
Which operations lower to SQL?
Which operations are client-safe?
Which operation produced this patch?
Which inverse operation rolls this back?
```

That is the basis for auto IVM, optimistic update, and CRUD.

## How this changes the transition plan

Add a dedicated phase before CRUD/reactivity/storage migration:

```txt id="4ry5d3"
Phase X: Operation kernel

1. Move current src/types/operation.ts concepts into kernel OperationDef.
2. Replace string operation kinds with typed OperationKindDef symbols.
3. Replace capabilities/laws/effects string unions with typed traits/effects.
4. Add operation-family constraints over type traits.
5. Add operation-use representation in Expr.
6. Add operation graph edges:
   supportsOperation
   operationAcceptsType
   operationReturnsType
   operationReads
   operationWrites
   operationProducesPatch
   operationInverse
   operationLowersTo
7. Rewrite CRUD/action/reactivity passes to consume operation semantics.
```

## Bottom line

Yes — to make automatic IVM, optimistic updates, and CRUD truly possible, **operations must be first-class kernel objects**.

The best revised model is:

```txt id="8n6b44"
Types describe value domains.
Operations describe what can happen to those domains.
Operation traits/laws describe safety and algebra.
Operation protocols expose behavior for passes.
Operation edges connect operations to types, fields, patches, inverses, and target lowerings.
Exprs and Nodes record operation uses.
Passes derive CRUD, optimistic plans, invalidation, and IVM from those facts.
```

This is the semantic layer Gen2 needs.

I’d avoid saying operations “inherit from” nodes/edges. I’d say:

> **Operation definitions are Nodes. Operation applications are Exprs/Nodes connected by Edges.**

So the kernel does **not** need a separate top-level object family that competes with `Node` and `Edge`.

Revised answer:

```txt
Node
  semantic object with identity

Edge
  semantic relationship / fact between objects

OperationDef
  a Node that defines an operation

OperationUse
  a use of an OperationDef inside an Expr, Action, Plan, Transform, or Edge payload

Operation edges
  edges connecting operations to types, fields, patches, inverses, lowerings, etc.
```

## Why `OperationDef` should be a Node

An operation definition has identity, traits, laws, protocols, metadata, implementations, target lowerings, and diagnostics. That is exactly what `Node` is for.

```ts
type OperationDefNode<
  Args extends readonly GType[],
  Out extends GType,
  Traits extends TraitSet,
> = Node<typeof OperationDefNodeKind, { args: Args }, Out, never, never, never, Traits>;
```

Then operation properties are just traits/protocols on the node:

```ts
const SetField = defineNode({
  kind: OperationDefNodeKind,
  traits: [OperationDeterministic, OperationPatchable, OperationInvertible, LawIdempotent],
  protocols: [OperationProtocol, PatchProtocol],
});
```

And the operation’s type relationships are edges:

```txt
SetField accepts FieldValueType
SetField returns FieldPatchType
SetField writes Field
SetField produces PatchType
SetField inverseOf RestoreField
SetField lowersTo PostgresUpdate
```

That gives you graph queryability without inventing a parallel operation registry.

## But `OperationUse` is contextual

A use of an operation can appear in different places.

### 1. Pure expression use

```ts
user.role.eq(Role.Admin);
```

This should be an `Expr` that references an `OperationDef`:

```ts
Expr(OperationCallExprKind, {
  operation: EqualsOperation,
  args: [user.role, Role.Admin],
});
```

And the graph can derive:

```txt
Expr usesOperation Equals
Expr reads User.role
Expr returns boolean
Expr has traits from EqualsOperation
```

### 2. Mutation/action use

```ts
User.update(id, { archivedAt: now() });
```

This should usually be represented by an action node plus operation-use edges:

```txt
Node(Action): deleteUser
Edge(appliesOperation): deleteUser -> SetField
Edge(writes): deleteUser -> User.archivedAt
Edge(producesPatch): deleteUser -> ArchivedAtPatch
```

The operation definition says what `SetField` means. The action node says this specific app action uses it.

### 3. Transform use

A transform is basically a specialized operation:

```txt
Date <-> ISO string
UUID <-> bytes
Domain value <-> storage representation
```

I’d keep `Transform` as a first-class ergonomic kernel object, but internally it can be:

```txt
TransformNode = OperationDefNode + TransformProtocol
```

So transforms are operation nodes with special protocols.

### 4. Edge-level operation

Sometimes an edge should carry the operation that justifies it.

Example:

```txt
Edge(writes)
  writer: deleteUser
  target: User.archivedAt
  operation: SetField
```

So an edge does not “inherit from” operation. It references an operation as part of its semantic payload.

## The best model

```txt
OperationDef = Node
OperationUse = Expr or Node-local fact
Operation relationships = Edges
Operation laws/properties = Traits
Operation behavior for passes = Protocols
```

So the revised kernel does **not** need this:

```txt
Node
Edge
Operation
```

as three unrelated primitive families.

It should be:

```txt
Node
  includes operation definition nodes

Edge
  connects operation nodes to types, fields, patches, inverses, lowerings, uses

Expr
  can contain operation calls

Trait
  describes operation properties/laws

Protocol
  lets passes ask operation nodes for behavior
```

## Concrete shape

```ts
export const OperationDefNodeKind = defineNodeKind({
  id: nodeKindId("node.kind.operation.def"),
  dialect: OperationDialect,
  traits: [NodeNamed],
  protocols: [OperationProtocol],
});

export const AcceptsTypeEdgeKind = defineEdgeKind({
  id: edgeKindId("edge.kind.operation.acceptsType"),
  dialect: OperationDialect,
  endpoints: {
    operation: OperationEndpointRole,
    type: TypeEndpointRole,
  },
});

export const ReturnsTypeEdgeKind = defineEdgeKind({
  id: edgeKindId("edge.kind.operation.returnsType"),
  dialect: OperationDialect,
  endpoints: {
    operation: OperationEndpointRole,
    type: TypeEndpointRole,
  },
});

export const ProducesPatchEdgeKind = defineEdgeKind({
  id: edgeKindId("edge.kind.operation.producesPatch"),
  dialect: OperationDialect,
  endpoints: {
    operation: OperationEndpointRole,
    patchType: TypeEndpointRole,
  },
});

export const InverseOperationEdgeKind = defineEdgeKind({
  id: edgeKindId("edge.kind.operation.inverse"),
  dialect: OperationDialect,
  endpoints: {
    operation: OperationEndpointRole,
    inverse: OperationEndpointRole,
  },
});
```

Then:

```ts
const SetField = defineOperation({
  id: operationId("operation.field.set"),
  args: [FieldRefType, UnknownValueType],
  output: FieldPatchType,
  traits: [OperationDeterministic, OperationPatchable, OperationInvertible],
});
```

Internally emits:

```txt
Node(OperationDef): SetField
Edge(acceptsType): SetField -> FieldRefType
Edge(acceptsType): SetField -> UnknownValueType
Edge(returnsType): SetField -> FieldPatchType
Trait(OperationPatchable)
Trait(OperationInvertible)
```

## Why not make `Operation` extend `Edge`?

Because an operation is not inherently a relationship.

`equals`, `sum`, `setField`, `appendItem`, `softDelete`, and `sendEmail` are reusable semantic capabilities. They can be applied many times. That makes them nodes.

The relationships around them are edges:

```txt
Operation accepts Type
Operation writes Field
Operation has inverse Operation
Action applies Operation
Expr uses Operation
Operation lowers to TargetOperation
```

## Why not make `Operation` just a trait?

Because operations have too much structure:

```txt
argument types
output type
effects
requirements
implementations
laws
inverse
patch type
lowerings
supported targets
```

A trait can say:

```txt
OperationPatchable
LawIdempotent
OperationSqlLowerable
```

But the operation itself needs identity and relationships.

## Final recommendation

Use this hierarchy conceptually:

```txt
Node
  OperationDefNode
  ActionNode
  QueryNode
  EntityNode
  FieldNode
  ProviderNode
  ViewNode

Edge
  UsesOperationEdge
  AppliesOperationEdge
  AcceptsTypeEdge
  ReturnsTypeEdge
  WritesEdge
  ReadsEdge
  ProducesPatchEdge
  InverseOperationEdge
  LowersToEdge

Expr
  OperationCallExpr
```

So yes, operations should be built on the node/edge system — but not by classical inheritance everywhere.

The cleanest statement:

> **An operation definition is a node. Its applicability, effects, laws, inverses, patches, and lowerings are edges and traits. A specific operation use appears inside an expression or node and is connected back to the operation definition.**

Yes — that is the clean model.

```txt
OperationDef = Node
Operation properties/laws = Traits on that node
Operation relationships = Edges
Operation usage = Expr or Action/Plan node referencing the OperationDef
```

So laws are not a separate primitive family. They are **typed traits**, usually on operation-definition nodes, sometimes on transforms, exprs, or edges.

## Example

```ts
const SetField = defineOperation({
  id: operationId("operation.field.set"),
  args: [FieldRefType, UnknownValueType],
  output: FieldPatchType,

  traits: [OperationDeterministic, OperationPatchable, OperationClientSafe, LawIdempotent],

  protocols: [OperationProtocol, PatchProtocol],
});
```

If a law needs evidence, the trait application carries a payload:

```ts
applyTrait(SetField, LawInverse, {
  inverse: RestoreField.ref,
});

applyTrait(SumReducer, LawIdentity, {
  identity: expr.literal(0),
});

applyTrait(SumReducer, LawAssociative, {
  assurance: "tested",
  testArtifact: SumAssociativityTest.ref,
});
```

That gives you:

```txt
LawIdempotent
  marker trait

LawInverse
  trait with inverse operation witness

LawIdentity
  trait with identity expression witness

LawAssociative
  trait with assurance/proof/test metadata
```

## Why this composes

Because every fact lives in the same graph.

```txt
SetField is OperationDef node
SetField has OperationPatchable trait
SetField has LawInverse trait
SetField inverseOf RestoreField edge
SetField produces FieldPatch edge
deleteUser applies SetField edge
deleteUser writes User.archivedAt edge
User.archivedAt has DateTime type
DateTime has Serializable type trait
```

Then a pass can compose those facts:

```txt
Action applies operation
Operation writes field
Field belongs to entity
Operation produces patch
Operation has inverse
Operation is client-safe
=> generate optimistic update + rollback
```

For IVM:

```txt
Query reads field
Action applies operation
Operation writes same field
Operation has delta protocol
Reducer has associative + identity laws
=> generate incremental maintenance plan
```

For CRUD:

```txt
Entity owns fields
Fields have types
Types support operations
Operations have laws/properties
Policies guard operations
Storage target supports lowerings
=> derive CRUD actions, forms, validation, RLS, optimistic plans
```

## Type safety

You get type safety from three layers working together:

```txt
1. Typed symbols
   No magic strings for operation kind, law, trait, edge kind, or endpoint role.

2. Phantom generics
   Node, Type, Expr, Edge, and OperationDef carry inferred input/output/effect/trait types.

3. Verifier passes
   Runtime graph verification catches cross-module/global invariants TypeScript cannot prove.
```

So a type-level operation can be shaped like:

```ts
type OperationDefNode<
  Args extends readonly GType[],
  Out extends GType,
  Traits extends TraitSet = EmptyTraits,
> = Node<
  typeof OperationDefNodeKind,
  { args: Args },
  InferDecoded<Out>,
  never,
  InferRequirementsOf<Args>,
  InferEffectsOf<Args>,
  Traits
>;
```

And laws are typed:

```ts
type HasLawInverse<Inverse extends OperationRef> = Has<typeof LawInverse, { inverse: Inverse }>;

type HasLawIdentity<I extends ExprRef> = Has<typeof LawIdentity, { identity: I }>;
```

Then APIs can require them:

```ts
function deriveOptimisticRollback<
  Op extends OperationDefNode<
    any,
    any,
    Traits<Has<typeof OperationPatchable>, Has<typeof LawInverse, any>>
  >,
>(op: Op) {
  // safe to derive rollback
}
```

Or:

```ts
function deriveIncrementalReducer<
  Op extends OperationDefNode<
    any,
    any,
    Traits<Has<typeof LawAssociative>, Has<typeof LawIdentity, any>>
  >,
>(op: Op) {
  // safe to maintain incrementally
}
```

## Builds, but with one caveat

It builds if you keep the kernel disciplined:

```txt
Core primitive:
  Node, Edge, Type, Expr, Trait, Protocol, Graph, Pass

Operation:
  stdlib/core dialect node kind, not a new primitive

Law:
  trait namespace, not a new primitive

Capability:
  trait namespace, usually on target/runtime/location nodes

Behavior:
  Protocol, not trait payload unless it is a small witness
```

The caveat: TypeScript cannot prove every global graph invariant. For example:

```txt
Does this inverse operation really undo that operation?
Does this operation actually preserve a predicate?
Does this SQL lowering exactly match the semantic operation?
```

So you need assurance levels:

```ts
applyTrait(SumReducer, LawAssociative, {
  assurance: "claim" | "tested" | "proven",
});
```

And passes should be explicit about what assurance they require:

```txt
dev optimistic update:
  claim may be okay

production offline replay:
  tested/proven required

financial ledger IVM:
  proven or target-certified required
```

## Final model

```txt
Types define value domains.

Operation nodes define what can happen to those domains.

Traits on operation nodes define properties:
  pure
  deterministic
  patchable
  reversible
  associative
  commutative
  idempotent
  monotonic
  client-safe
  SQL-lowerable

Edges connect operation nodes to:
  accepted types
  returned types
  written fields
  read fields
  patch types
  inverse operations
  target lowerings
  actions that apply them

Protocols expose behavior:
  patch protocol
  delta protocol
  lowering protocol
  reducer protocol

Passes compose all of that into:
  CRUD
  optimistic updates
  rollback
  offline replay
  IVM
  cache invalidation
  RLS
  UI state
```

So yes: **laws are traits, operations are nodes, operation relationships are edges, and the whole system composes through typed symbols + phantom inference + graph verification.**
This is **very good** — and in some ways stronger than the previous `revised_phases.md`.

The biggest improvement is that this doc separates two ideas that were still slightly blended before:

```txt
Kernel = tiny compiler substrate
Stdlib/dialects = rich app concepts
```

That is the right direction. The line “Gen2 core should only model things the compiler cannot recover from lower-level graph structure” is exactly the right design rule.

## My read

This document turns Gen2/dIRived from:

```txt
a full-stack framework with many primitive concepts
```

into:

```txt
a typed semantic graph compiler with an app-building standard library
```

That is a much cleaner foundation.

The strongest part is making **Edge** first-class. That is probably the key architectural correction.

A lot of systems get this wrong: they model entities, actions, rules, views, providers, etc., but relationships live as private arrays or object fields. Your doc correctly says relationships themselves need identity, traits, metadata, constraints, source refs, and derivation history.

That unlocks the whole project:

```txt
Action writes Field
Rule reads Field
View submits Action
Query derives Key
Artifact generatedFrom Edge
Provider satisfies Requirement
Boundary transports Callable
```

Once edges are first-class, derivation becomes graph traversal instead of custom subsystem logic.

## The best decision in the doc

I really like this split:

```txt
Core:
  Id
  Type
  Expr
  Transform
  Trait
  Metadata
  Node
  Edge
  Graph
  Pass

Standard library:
  Entity
  Field
  Relation
  Rule
  Query
  Action
  Dispatch
  StoredValue
  EntityView
  Boundary
  Provider
  Key
  ReactiveResource
  StorageContainer
  DesignSystem
  ArtifactEmitter
  Checker
```

This makes the system easier to explain and easier to extend. It also prevents “primitive inflation,” where every new feature demands a new top-level compiler concept.

The resulting mental model is strong:

```txt
Type gives values meaning.
Expr gives logic inspectable shape.
Transform gives representations typed movement.
Node gives semantic objects identity.
Edge gives topology meaning.
Trait gives checked semantic claims.
Metadata gives human/tool annotations.
Graph gives global context.
Pass gives evolution, derivation, lowering, and emission.
```

That is README-worthy.

## My biggest concern

There is a slight contradiction in the doc around **strings vs typed symbols**.

Early sections say internal semantics should avoid magic strings. But the sketch APIs still show things like:

```ts
graph.nodesWithTrait("node.callable");
graph.relationshipsOfKind("writes");
```

and:

```ts
type Node = {
  kind: string;
};
```

I would fix this before implementation.

Use strings only for external names/debugging. Internally, use typed symbol definitions:

```ts
const CallableTrait = defineTrait("node.callable");
const WritesEdgeKind = defineEdgeKind("writes");
const EntityNodeKind = defineNodeKind("entity");

graph.nodesWithTrait(CallableTrait);
graph.edgesOfKind(WritesEdgeKind);
graph.nodesOfKind(EntityNodeKind);
```

This matters because dIRived’s whole promise depends on durable semantic identity. Raw string kinds will eventually leak into plugins, targets, diagnostics, and agent edits.

## I would keep `SymbolDef` conceptually

The new doc shrinks the core to:

```txt
Id
Type
Expr
Transform
Trait
Metadata
Node
Edge
Graph
Pass
```

That is elegant, but I think you still need something like:

```txt
SymbolDef
```

Maybe it does not need to be a public primitive, but internally you need typed definitions for:

```txt
NodeKindDef
EdgeKindDef
TraitDef
TypeKindDef
ExprKindDef
PassKindDef
EndpointRoleDef
```

Otherwise `kind: string` and `traits: Id<"trait">[]` become too loose.

So I would say:

```txt
Public mental model:
  Id, Type, Expr, Transform, Trait, Metadata, Node, Edge, Graph, Pass

Internal kernel machinery:
  SymbolDef / KindDef / RoleDef
```

That keeps the explanation small without weakening type safety.

## Diagnostics should not be too “core-adjacent”

The doc classifies `Diagnostic` and `Artifact` as core-adjacent rather than primitive, but the MVP kernel still includes them. That tension is worth resolving.

I agree that `Diagnostic` is not an app semantic primitive like `Node` or `Edge`. But for this project, diagnostics are too important to treat casually.

Diagnostics are the interface between:

```txt
compiler
AI repair loop
developer
end user
runtime validation
deployment system
generated app
```

So I would make diagnostics a kernel-supported system, even if not one of the “semantic graph atoms.”

Something like:

```txt
Semantic core atoms:
  Id, Type, Expr, Transform, Trait, Metadata, Node, Edge, Graph, Pass

Compiler support systems:
  Diagnostic, Artifact, SourceMap, Location, Provenance
```

That gives diagnostics enough weight without claiming they are the same kind of thing as nodes/edges.

## Protocols are missing

The previous plan had `Protocol` as a hard kernel concept. This new doc drops it from the true core.

I think that is risky.

You need the distinction:

```txt
Trait:
  This operation is patchable.

Protocol:
  Here is how a pass asks it to produce/apply/invert a patch.
```

Traits alone are not enough for generic passes. A pass needs behavior surfaces:

```txt
CallableProtocol
ReadableProtocol
WritableProtocol
PatchProtocol
LoweringProtocol
PredicateAffectProtocol
ReducerProtocol
RenderableProtocol
```

Without protocols, you either put behavior into metadata, node fields, ad hoc target code, or giant switch statements.

So I would add `Protocol` back, at least internally:

```txt
True core:
  Id
  SymbolDef
  Type
  Expr
  Transform
  Trait
  Protocol
  Metadata
  Node
  Edge
  Graph
  Pass
```

Or, if you want to keep the public list small:

```txt
Protocol is part of the pass/dialect API, not the user-facing mental model.
```

But I would not remove it from the architecture.

## Location and provenance need first-class treatment

The doc includes metadata source spans and edge provenance, which is good. But for an AI app builder, location/provenance are not optional niceties.

You need to trace:

```txt
user prompt span
builder call site
graph node
graph edge
derived pass
lowered target node
emitted file section
runtime diagnostic
```

That is how you explain generated code and repair it safely.

So I would avoid hiding source/location inside generic metadata only. Metadata is passive; location/provenance are compiler-operational.

I would make these support types explicit:

```txt
Location
Provenance
SemanticSourceMap
DiagnosticTrace
ArtifactTrace
```

## The Effect stance is right

The doc’s phrase “Effect-shaped, not Effect-owned” is exactly right.

Effect can heavily influence:

```txt
Schema
Transform
Context.Service
Layer
Effect runtime programs
typed errors
requirements
```

But Gen2/dIRived’s IR should stay independent. The doc correctly says `Gen2 Expr = static compiler AST` and `Effect.Effect = possible emitted runtime implementation`.

That distinction is crucial. If expressions become Effect programs, you lose portability, SQL lowering, static dependency extraction, source mapping, and target-agnostic generation.

## The migration appendix is more practical than the hard rebase plan

I actually prefer this doc’s staged migration strategy over a big-bang rebase.

The underlay approach is safer:

```txt
Existing public API
  gen.entity(...)
  gen.rule(...)
  gen.action(...)
      ↓
Stdlib adapters
      ↓
Kernel graph
```

Then dual-write during migration:

```txt
ctx.entities.push(entity)
ctx.graph.nodes.add(entityToKernelNode(entity))
ctx.graph.edges.add(entityToKernelEdges(entity))
```

That is pragmatic. It lets you keep value while gradually moving the source of truth into the graph.

My only warning: dual-write must be temporary. Add architecture tests so old arrays cannot keep growing forever.

## What I would change before treating this as final

I would revise the core list to something like:

```txt
Semantic kernel:
  Id / SemanticRef
  SymbolDef
  Type
  Expr
  Transform
  Trait
  Protocol
  Metadata
  Node
  Edge
  Graph
  Pass

Compiler support:
  Location
  Provenance
  Diagnostic
  Artifact
  SemanticSourceMap
```

Then keep the public explanation short:

```txt
The core is types, expressions, transforms, nodes, edges, traits, and passes over a graph.
```

That gives you both clarity and enough machinery.

## My verdict

This is the best version of the architecture so far.

It makes three things clear:

1. **Everything meaningful is graph-backed.**
2. **Edges are as important as nodes.**
3. **App concepts are stdlib/dialect abstractions, not kernel primitives.**

That is the right foundation for an AI app generator.

The main fixes I would make are:

```txt
Replace string-first kinds/traits with typed symbol definitions.
Promote Protocol back into the architecture.
Treat Diagnostic, Location, Provenance, and Artifact as serious compiler systems.
Keep the staged underlay migration, but enforce a final no-dual-source-of-truth rule.
```

With those adjustments, this is a strong enough design doc to guide implementation.
