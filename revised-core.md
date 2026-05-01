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
type GenType<
  Decoded = unknown,
  Encoded = Decoded,
  DecodeR = never,
  EncodeR = never
> = {
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
type Transform<
  From = unknown,
  To = unknown,
  DecodeR = never,
  EncodeR = never
> = {
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
const isAdmin = expr.eq(
  expr.get(expr.ref("actor"), "role"),
  expr.literal("admin")
);
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
  readonly target:
    | Id<"type">
    | Id<"expr">
    | Id<"transform">
    | Id<"node">
    | Id<"relationship">;

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
graph.nodesWithTrait("node.callable")
graph.relationshipsOfKind("writes")
graph.relationshipsFrom(actionId)
graph.relationshipsTo(fieldId)
graph.neighborhood(ruleId, { depth: 2 })
graph.traceArtifact(artifactId)
graph.dependencyClosure(boundaryId)
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
const Email = gen.type.fromEffectSchema(
  Schema.String.check(Schema.isPattern(/.+@.+/))
).withTrait("type.email");
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
class Database extends Context.Service<Database, {
  readonly query: (sql: string) => Effect.Effect<Rows>
}>()("Database") {}
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
asNode(entity)
asExpr(rule)
asEdge(fieldOwnership)
toEffect(action)
toEffectSchema(type)
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
  email: type.email()
});

const Organization = domain.entity("Organization", {
  id: type.uuid(),
  name: type.string()
});

const Membership = graph.relationship({
  kind: "memberOf",
  endpoints: [
    { role: "member", target: User },
    { role: "organization", target: Organization },
    { role: "role", target: RoleType }
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
    description: "User login email"
  }
});

const User = g.node({
  kind: "entity",
  name: "User",
  output: g.type.object({
    id: g.type.uuid(),
    email: Email
  }),
  traits: ["node.entity", "node.identityBearing"]
});

const isAdmin = g.node({
  kind: "rule",
  name: "isAdmin",
  output: g.type.boolean(),
  body: g.expr.eq(
    g.expr.get(g.expr.ref("actor"), "role"),
    g.expr.literal("admin")
  ),
  traits: ["node.rule", "expr.pure"]
});

g.relationship({
  kind: "guards",
  endpoints: [
    { role: "guard", target: isAdmin },
    { role: "guarded", target: deleteUser }
  ],
  traits: ["relationship.authorization"]
});
```

## 10.2 Standard-library API

The user-facing API should be much nicer:

```ts
const User = gen.entity("User", {
  id: gen.type.uuid(),
  email: gen.type.email(),
  role: gen.type.enum("Role", ["admin", "user"]),
  archivedAt: gen.type.datetime().optional()
});

const isAdmin = gen.rule("isAdmin", ({ actor }) =>
  actor.role.eq("admin")
);

const deleteUser = gen.action("deleteUser", {
  input: User.id,
  returns: User,
  auth: isAdmin,
  body: ({ input }) => User.deleteWhere(User.id.eq(input))
});

const userList = gen.view.list(User, {
  actions: [deleteUser]
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

[1]: https://effect.website/blog/releases/effect/40-beta/ "Effect v4 Beta | Effect Documentation"
[2]: https://raw.githubusercontent.com/Effect-TS/effect-smol/main/packages/effect/SCHEMA.md "raw.githubusercontent.com"
[3]: https://github.com/Effect-TS/effect-smol/blob/main/migration/services.md "effect-smol/migration/services.md at main · Effect-TS/effect-smol · GitHub"
