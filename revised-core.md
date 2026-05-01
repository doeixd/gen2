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

[18.Appendix: Staged Migration Plan]

Yes. I would **not** refactor this as a big rewrite. The repo already has most of the ingredients. The right move is to introduce the revised core as an **underlay**, then gradually make the current modules compile down into it.

The current project has a very broad public surface: the package root exports `core`, `types`, `entity`, `expression`, `storage`, `relation`, `query`, `function`, `api`, `ui`, `authz`, `events`, `lifecycle`, `crud`, `reactivity`, `router`, `hydration`, `services`, `rules`, `reaction`, `plan`, `context`, `requirements`, and `state`.  The current `GenContext` mirrors that breadth by storing separate arrays for almost every concept: entities, relations, queries, functions, routes, policies, events, views, services, rules, reactions, providers, workflows, boundary plans, offline queues, and more.

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

You already have a good `Id/Ref` base. `src/core/refs.ts` defines stable IDs for entities, fields, relations, functions, rules, policies, key families, contexts, services, providers, routes, workflows, and migrations, plus typed `Ref` variants and identity helpers.  That should become the foundation for kernel identity rather than being replaced.

You also already have `StaticNode` in `src/core/node.ts`, with traits, input/output semantic types, errors, requirements, effects, metadata, symbol info, call plans, and type inference helpers.  This is very close to the revised `Node` primitive.

You already have `SemanticType` in `src/types/semantic.ts`, carrying kind, TypeScript type name, storage representation, optional wire representation, serializer/deserializer flags, server-only marking, traits, enum values, validation, and merge strategy.  That maps cleanly to revised `Type`.

You already have `Expr` in `src/expression/expr.ts`, binding an AST to a value type, phase, requirements, effects, opacity marker, and flattened refs.  That maps cleanly to revised `Expr`.

The biggest missing primitive is **Edge**. Today, `src/relation/relation.ts` models domain entity relations specifically: one-to-one, one-to-many, many-to-one, many-to-many, integrity modes, foreign keys, deletion behavior, and link entities.  That should become a **stdlib domain edge** built on a more general kernel `Edge`.

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

This is a better version of current traits. Right now type traits are relatively narrow: name, optional `applies_to`, validation expression, storage expression, error message, and queryable flag.  Node traits are separately represented as strings / trait refs.  The refactor should unify those under one trait object while preserving compatibility helpers.

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
  traits: [
    `relation.${relation.kind}`,
    `integrity.${relation.integrity.kind}`,
  ],
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

Your package currently has `@effect-atom/atom` as a dev dependency, but not Effect itself.  That's good. Keep `@gen2/core` independent.

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

The project is already pointed in this direction. `StaticNode` already carries traits, input/output semantic types, requirements, effects, symbol metadata, and phantom `_input`, `_output`, `_requires`, `_effects`, and `_traits` slots.  `Expr` already carries type, phase, requirements, effects, AST, opacity, and refs.  `SemanticType` already carries TS type, semantic kind, storage/wire representation, serializer/deserializer flags, server-only marking, traits, validation, and merge strategy. 

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
graph.nodesWithTrait(NodeCallable)
graph.edgesOfKind(WritesEdgeKind)
graph.edgesFrom(action.ref, WritesEdgeKind)
graph.hasTrait(expr, SqlLowerable)
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
  Traits extends TraitSet = EmptyTraits
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

  readonly effectSchema?: EffectSchemaAdapter<
    Decoded,
    Encoded,
    DecodeR,
    EncodeR
  >;

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
const Email = string()
  .pipe(withTrait(EmailTrait))
  .pipe(withTrait(QueryableTrait));
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

const isAdmin = gen.rule(User, (u) =>
  u.role.eq(Role.Admin)
);
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
  projects: listProjects
})
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
write(field, value)
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
  Traits<
    Has<typeof NodeCallable>,
    Has<typeof NodeReadable>
  >
>;
```

Then runtime trait claims stay inspectable:

```ts id="euo35v"
traits: [NodeCallable, NodeReadable]
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
Has<typeof LawReversible, { inverse: TransformRef<any, any> }>
Has<typeof LawIdentity, { identity: ExprRef<any> }>
```

This matters for optimistic updates, retries, offline replay, reducers, and IVM. A pass should be able to ask not only “is this reversible?” but “what is the inverse?”

## 10. Add “opaque boundary” as a first-class trait, not a boolean afterthought

Current expressions already track `contains_opaque_js`.  I’d turn that into a trait/capability model:

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

Existing `StaticNode` metadata is a list of namespace/key/value strings.  I’d keep metadata passive and typed where possible:

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
metadata: [{ namespace: "postgres", key: "gin_index", value: "true" }]
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
}>
```

Then:

```ts id="yg6g1g"
app.get(User)
app.get(DeleteUser)
app.nodesWithTrait(NodeCallable)
```

The runtime `GenContext` remains canonical, but the typed registry preserves autocomplete and literal names during construction.

This is especially helpful for agents: they can navigate typed definitions instead of raw files and strings. `AGENTS.md` already instructs agents to read the core primitive docs before changing core IR/rules/reactivity/providers/target derivation and to run `vp check` and `vp test`.  A typed registry gives agents a safer edit surface.

## 13. Use “capability flow” for targets

Targets should be nodes with capability traits:

```ts id="aixw1o"
const PostgresTarget = defineTarget({
  traits: [
    CapabilitySql,
    CapabilityRls,
    CapabilityTransactions,
    CapabilityTriggers,
  ],
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

const app = createTypedRegistry()
  .add(User)
  .add(Project)
  .add(deleteUser); // full inference
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
AcceptsInput<N, Input>
ProducesOutput<N, Output>
HasRequirement<N, Req>
HasEffect<N, Eff>
HasTrait<N, Trait>
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
trait("search:indexed")
```

The current plugin/helper system already materializes helpers into the `gen` namespace.  The new kernel should let plugins materialize typed symbol values too.

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
graph.explain(deleteUser)
graph.trace(User.fields.role)
graph.findEdges({ kind: WritesEdgeKind, target: User.fields.status })
graph.diff(oldGraph, newGraph)
graph.requiredUpdatesFor(change)
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
InferType<T>
InferEncoded<T>
InferInput<N>
InferOutput<N>
InferError<N>
InferRequirements<X>
InferEffects<X>
InferTraits<X>
InferRefs<X>
HasTrait<X, T>
AddTrait<X, T>
MergeRequirements<A, B>
MergeEffects<A, B>
Chain<A, B>
Parallel<Record>
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
