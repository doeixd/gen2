# Core Primitives And Composition Model

Gen2 is a typed semantic IR SDK for full-stack applications. Its core idea is that application meaning should be described once as static, inspectable TypeScript values, then checked, derived, generated, visualized, and evolved from that graph.

The foundation is small and composable:

```txt
SemanticType
Trait
Field
Entity
Operation
Law
Expr / Predicate
Function
Rule
Key / Reactivity
StaticNode / Trait
```

Most higher-level concepts in the library, including auth, routing, forms, hydration, providers, state resources, workflows, boundaries, generated tests, generated docs, and target artifacts, should be interpretations or derivations of those primitives. They should not become independent sources of truth.

## The Foundation

The deepest foundation is not a database table, API route, hook, or UI component. The deepest foundation is typed semantic data.

Four primitive families carry most of the architecture:

1. `SemanticType` describes what a value means.
2. `Trait` describes reusable semantic modifiers and compositional capabilities.
3. `StaticNode` describes what a semantic object is and what node traits it exposes.
4. `Operation` and `Law` describe what a computation can do and which algebraic properties make it safe to transform.

Together they let Gen2 preserve type safety and semantic meaning through the whole graph.

```txt
SemanticType gives values meaning.
Trait gives values and nodes reusable behavior.
Node gives semantic objects open composition.
Law gives operations safe algebraic behavior.
```

Everything else builds on top of that.

## Semantic Types

`SemanticType<T>` is the root of domain type safety.

It is more than a TypeScript type alias. It is an object that carries:

```txt
TypeScript phantom type
semantic kind
storage representation
wire representation
serializer/deserializer information
runtime validation
traits
server/client safety metadata
merge strategy metadata
```

Examples:

```txt
string
uuid
email
money
datetime
enum
object
array
tagged
custom domain type
```

The purpose is to preserve meaning that plain TypeScript would erase. A value may be represented as `string`, but Gen2 can still know whether it is an email, URL, UUID, role, status, secret token, or safe public label.

That meaning drives downstream behavior:

```txt
email -> validation, email input, column mapping
money -> storage representation, formatting, aggregation policy
uuid -> serializer/deserializer, key identity
enum/status -> transitions, badges, exhaustive tests
server-only -> hydration and client exposure diagnostics
merge-aware type -> optimistic/offline/conflict planning
```

Semantic types are also how user-facing builders preserve inference. A field built from `SemanticType<string>` becomes `Field<string>`. An object type built from semantic fields infers the object shape. A function input built from a semantic object carries that input type into query/action/resource/mutation APIs.

## Traits

Traits are reusable semantic modifiers and capability markers.

There are two related trait layers in the current library:

```txt
Semantic type traits
  Trait attached to SemanticType<T> or Field<T>

Node traits
  TraitKind / TraitRef attached to StaticNode and node-like IR
```

They solve different problems but share the same purpose: attach inspectable meaning without inventing a new hardcoded IR branch for every feature.

### Semantic Type Traits

Semantic type traits live in the type system layer. A `Trait` can describe validation, storage behavior, privacy, UI behavior, or queryability for a semantic value.

A semantic trait carries:

```txt
name
optional applies_to constraint
optional validation expression
optional storage expression
error message
queryable flag
```

Traits are attached with `withTrait(type, trait)`, which preserves the original TypeScript type parameter:

```txt
SemanticType<T> + Trait
  -> SemanticType<T>
```

That preservation matters. Adding a trait should make a value more meaningful, not less typed.

Examples:

```txt
email + unique -> still SemanticType<string>, now queryable/unique
string + nonEmpty -> still SemanticType<string>, now validated
money + positive -> still SemanticType<bigint>, now constrained
markdown + sanitized -> still SemanticType<string>, now safer for UI
secret token + serverOnly -> still SemanticType<string>, now placement-sensitive
```

Semantic traits can drive:

```txt
validation generation
form control selection
query helper availability
storage transformation
client/server exposure checks
docs and examples
test obligations
target capability diagnostics
```

This makes traits part of the type-safety story. The TypeScript type stays stable, while the semantic object gains extra rules that lifecycle checks and targets can inspect.

### Node Traits

Node traits live in the graph composition layer. A `StaticNode` advertises capabilities through trait names instead of requiring every consumer to know every concrete kind.

Built-in node traits include:

```txt
static
named
typed
callable
readable
writable
requires
reactive
keyed
policy_protected
resource_like
migration_step
target_interpretable
plan
server_placeable
```

Node traits answer questions like:

```txt
Can this object be called?
Can it read data?
Can it write data?
Does it have effects?
Does it require providers/services/context?
Can it participate in reactivity?
Does it have a key identity?
Can a target interpret it directly?
Can it be composed in a plan?
```

This is what lets generic passes work over future objects.

Examples:

```txt
QueryFunction as node -> callable + readable + typed
ActionFunction as node -> callable + writable + effectful + typed
ReactiveResource as node -> readable + reactive + keyed + resource_like
Workflow as node -> callable + effectful + requires + plan
Plugin report node -> readable + target_interpretable
```

Node traits are also how plugins remain type-safe and extensible. A plugin can contribute a custom node kind with declared traits and lowering rules. Core graph derivation and plan composition can then use trait checks rather than string-matching the plugin's private kind.

### Traits And Expressions

Traits can carry static expressions. Semantic traits may include validation or storage expressions. Those expressions have a value type, phase, requirements, effects, and an opaque-JS marker.

This connects traits to the expression IR:

```txt
Trait.validate_expression
  -> typed expression describing valid values

Trait.storage_expression
  -> typed expression describing storage transformation
```

The long-term direction should be that trait expressions lower into the same canonical `Expr`/`Predicate` system used by functions and rules. That would let the compiler reuse dependency extraction, target capability checks, SQL generation, client/server placement checks, and generated tests.

### Traits And Safety

Traits should be treated as semantic claims that need checking.

Useful checks include:

```txt
trait applies only to compatible semantic type
trait validation expression returns boolean or expected value type
trait storage expression preserves or explicitly changes representation
trait does not introduce forbidden effects in schema/client phases
trait marked queryable can actually be supported by target
node claiming callable has input/output or a call plan
node claiming effectful declares effects
node claiming keyed has key metadata
node claiming target_interpretable has target support or lowering
```

Traits therefore sit between plain metadata and full IR. They are lightweight enough to compose broadly, but structured enough to support diagnostics and target generation.

## Fields And Entities

Entities are identity-bearing domain records. Fields are named semantic values owned by an entity.

```txt
SemanticType<T>
  -> Field<T>
  -> Entity
```

An entity is not only a schema shape. It gives the compiler a stable domain object that other systems can reference.

Fields carry:

```txt
name
owning entity
semantic type
nullability
optionality
read-only/default metadata
traits
stable refs
rename lineage
```

This lets other primitives avoid stringly typed references. A query can reference a field object. A rule can depend on a field object. A mutation can write a field object. Reactivity can derive that an action touching `Project.status` may affect rules that read `Project.status`.

Entities and fields are the domain graph. Semantic types are the meaning attached to that graph.

## Operations And Laws

`Operation` describes a reusable typed computation capability.

Current operation variants include:

```txt
unary
binary
comparison
aggregate
reducer
predicate
```

Operations carry:

```txt
input/output semantic types
required capabilities
algebraic laws
effects
target/runtime implementations
```

Laws are critical because they tell the compiler when transformations are safe.

Examples:

```txt
associative
commutative
idempotent
identity
inverse
distributive
```

Those laws matter for more than math. They are the proof metadata used by higher-level planning:

```txt
associative -> safe reducer folding
commutative -> safe parallel merge/replay
idempotent -> safe retry/deduplication
inverse -> safe optimistic rollback
identity -> safe empty/default aggregate
monotonic-style behavior -> safer IVM and incremental maintenance
```

This makes laws part of the type-safety story. They are not TypeScript type checks alone; they are semantic safety claims attached to typed operations. A target or checker can reject a plan if the necessary law is missing.

## Expressions And Predicates

Expressions are typed static computation trees.

```txt
Operation + SemanticType + refs
  -> Expr<T>
```

Predicates are boolean-valued expressions used for filtering, conditions, and rules.

Expressions carry:

```txt
value semantic type
phase
requirements
effects
AST
refs
opaque JS marker
```

The important property is inspectability. If logic is represented as an expression tree instead of an opaque callback, the compiler can analyze it.

That enables:

```txt
SQL generation
dependency extraction
auth placement
reactivity derivation
validation
test generation
target capability checks
```

Expressions are the bridge from typed domain values to executable behavior.

## Functions

Functions are named typed semantic behaviors.

The core function families are:

```txt
StaticFunction
ExprFunction
PredicateFunction
QueryFunction
ActionFunction
PatchFunction
PlanFunction
```

Queries are canonical reads. Actions are canonical writes/effects.

```txt
SemanticType + Expr / QueryExpression / ActionExpr
  -> Function
```

Functions carry:

```txt
input type
output type
body IR
requirements
capabilities
laws
auth metadata
reactivity metadata
call plan
target runtimes
```

This is one of the most important architectural boundaries: reads and writes should live in functions, then other systems should interpret them.

```txt
query function -> SQL, API endpoint, route loader, query hook, cache resource, docs, tests
action function -> mutation endpoint, DB write, invalidation plan, optimistic patch, outbox, audit event
```

The same function can feed many targets because the function body is static semantic IR.

## Rules

Rules are named, typed, inspectable predicates.

```txt
Entity + Field + Relation + Predicate-like RuleExpr
  -> Rule
```

Rules answer business questions:

```txt
canViewProject(actor, project)
canEditInvoice(actor, invoice)
isOrderShippable(order)
isProjectOverdue(project)
isFieldEditable(actor, resource, field)
```

Rules are powerful because they are pure and inspectable. A rule is not just a boolean helper. It exposes its dependency surface.

The compiler can ask:

```txt
Which entities does this rule depend on?
Which fields does this rule read?
Which relations does this rule traverse?
Can this rule become SQL?
Can it be placed in the database, server, or client?
Which mutations may invalidate it?
Can it be incrementally maintained?
Which tests or docs does it imply?
```

Rules can drive:

```txt
auth policies
RLS policies
query predicates
UI visibility/editability
reactive invalidation
incremental view maintenance
generated tests
generated access docs
diagnostics
```

Rules should stay pure. Effects belong in functions, reactions, workflows, or operations that explicitly declare effects.

## Keys And Reactivity

Reactivity is based on typed keys and key families.

```txt
KeyFamily<Payload>
KeyExpression<Input, Payload>
ReactiveKey
ReactiveKeyPattern
```

Keys are the stable identities of cached or reactive data. They are target-agnostic. A key family can become a TanStack Query key, Effect Atom family, Svelte store identity, Vue composable key, or custom cache key.

Reactive resources and mutations build on functions and keys:

```txt
QueryFunction + KeyExpression
  -> ReactiveResource

ActionFunction + KeyPatternExpression
  -> ReactiveMutation
```

Manual reactivity is still first-class. Not every dependency can be inferred, especially when external systems are opaque. The important rule is that manual keys should be typed IR, not raw target-specific strings.

Rule-derived reactivity sits above this:

```txt
Action write set + Rule dependencies + Query keys
  -> invalidation / patch / IVM plans
```

This is where rules become especially valuable. If the compiler knows which fields a rule reads and which fields an action writes, it can derive affected keys, broad invalidation, matched invalidation, patchable plans, or conservative degradation.

## Nodes And Node Traits

`StaticNode` is the open application-level extension protocol.

Closed expression unions are useful because targets need exhaustiveness. But application-level concepts need extensibility. Nodes provide that.

A static node carries:

```txt
kind
name/ref/id
traits
input/output semantic types
requirements
effects
metadata
symbol information
phantom type slots
```

Node traits describe what the node can participate in:

```txt
static
named
typed
callable
readable
writable
effectful
requires
reactive
keyed
policy_protected
resource_like
migration_step
plan
target_interpretable
server_placeable
```

This lets plugins and future standard packages add new semantic objects without adding a new hardcoded branch everywhere.

Examples:

```txt
workflow node -> callable + effectful + requires + plan
state resource node -> readable + writable + keyed + reactive
custom plugin node -> typed + readable + target_interpretable
provider node -> requires + target_interpretable
```

Nodes are not a replacement for semantic types, semantic traits, entities, expressions, functions, or rules. They are the extensibility layer that lets new objects join the same graph. Node traits are the mechanism that lets generic compiler passes ask capability questions without knowing every concrete kind.

## How Type Safety Flows

Type safety flows by carrying phantom TypeScript types through semantic IR objects.

```txt
SemanticType<T>
  + Trait
  -> Field<T>
  + Field traits
  -> Expr<T>
  -> Function<In, Out>
  -> StaticNode<In, Out, Traits>
  -> Resource<In, Value>
  -> KeyExpression<In, Payload>
  -> Provider<Value>
  -> StateResource<Value, Key>
```

The runtime object carries enough static information for TypeScript to infer the next object.

For example:

```txt
gen.types.object({ id: gen.types.uuid() })
  -> SemanticType<{ id: string }>

gen.types.withTrait(gen.types.email(), unique)
  -> SemanticType<string> with additional semantic checks

gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() })
  -> Entity with Field<string> values

gen.func.query({ input_type, returns, body })
  -> QueryFunction<Input, Output>

gen.reactivity.resource({ query })
  -> ReactiveResource<Input, Output>
```

This works because the objects compose. The compiler does not need to guess the type from strings. It receives typed values that carry their own semantic metadata.

That is the heart of the design:

```txt
Small type-safe primitives compose into larger type-safe IR objects.
Large IR objects remain inspectable because they retain references to the smaller primitives.
```

## Composition Model

The composition model can be summarized as layers.

```txt
Layer 1: Meaning
  SemanticType, Trait, Representation

Layer 2: Domain Shape
  Field, Entity, Relation

Layer 3: Computation
  Operation, Law, Capability, Effect, Expr, Predicate

Layer 4: Behavior
  Function, QueryFunction, ActionFunction, PatchFunction, Rule

Layer 5: Reactivity And State
  KeyFamily, KeyExpression, ReactiveResource, ReactiveMutation, StateResource

Layer 6: Planning
  ProviderPlan, HydrationPlan, FallbackPlan, OptimisticPlan, MergePlan, WorkflowPlan

Layer 7: Interpretation
  Targets, generated artifacts, docs, tests, devtools
```

Higher layers should point back to lower layers. A hydration plan should know which provider, state resource, semantic type, and serializer it used. A boundary plan should know which function, requirements, auth rule, and serialization contract it crosses. A generated test obligation should know which policy, action, rule, or hydration safety property caused it.

## What Should Be Derived

The desired direction is that users define the durable semantic facts, and the compiler derives the rest.

Users define:

```txt
types
traits
entities
relations
expressions
queries
actions
rules
keys when inference is not enough
providers when values cross runtime boundaries
```

The compiler derives:

```txt
validation
storage mappings
API surfaces
query hooks/resources
mutation invalidation
route loaders
hydration payloads
auth placement
RLS policies
optimistic safety
offline safety
workflow requirements
boundary transport plans
tests
docs
devtools graphs
```

Manual declarations are still valid, but they should be semantic declarations, not target glue. For example, manual invalidation should use key IR. Manual provider setup should use provider IR. Manual merge behavior should use merge strategy IR. Manual rule logic should use rule/expression IR.

## Rules Are Likely Underutilized

Rules are one of the most valuable primitives because they expose business logic dependencies.

Current rules already support:

```txt
dependency extraction
SQL/RLS translation
placement analysis
reactive invalidation derivation
IVM classification
editability derivation
```

They could become even more central as the semantic business-logic layer.

Good candidates for rule-driven derivation:

```txt
field visibility
field editability
record-level access
state transitions
route guards
form enablement
workflow branch guards
mutation preconditions
generated policy tests
generated access matrices
reactive dependency graphs
derived views
incremental maintenance
```

The key constraint is purity. Rules should not send emails, write databases, call APIs, enqueue jobs, or mutate state. They should describe facts and predicates. Effectful consequences belong in actions, reactions, workflows, offline commands, or scheduled jobs.

## Avoiding Parallel Sources Of Truth

As the library grows, the main architectural risk is adding new high-level models that duplicate the foundations.

Prefer:

```txt
forms derived from entity fields, semantic types, and rules
auth derived from policies over rules
reactivity derived from function write sets, keys, and rule dependencies
hydration derived from providers, state resources, semantic types, and serializers
workflows composed from callable/effectful nodes and functions
targets consuming typed IR plans
```

Avoid:

```txt
form-only validation logic
auth-only predicate callbacks
cache-only raw string keys
target-only provider wiring
workflow-only opaque steps
generator-only business logic
```

The source of truth should stay semantic.

## Short Mental Model

Use this as the compact mental model:

```txt
SemanticType is meaning.
Trait is reusable semantic behavior and capability.
Entity is domain shape.
Operation is typed computation.
Law is safety metadata for transformations.
Expr is inspectable logic.
Function is canonical behavior.
Rule is pure business truth.
Key is reactive identity.
Node is open composition.
Target is interpretation.
```

If a feature can be expressed with those primitives, it probably should be. If it cannot, the right next step is usually to extend the primitive graph with typed IR, traits, diagnostics, and laws rather than hiding behavior in runtime callbacks or target-specific glue.
