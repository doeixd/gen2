# Revised Phases: Rebasing Gen2 on the New Typed Semantic Kernel

> Status: replacement sequencing source of truth for the Gen2 rebase.
>
> This document supersedes the older Phase 5 / Phase 6 implementation plans and updates `revised_phases(2).md` to reflect the newer design decisions:
>
> - typed dialect modules
> - typed witnesses over simple runtime IR
> - graph steps/fragments
> - object / builder / curried / callback / `.class` constructor facades
> - first-class diagnostics and invariants
> - operation-backed expressions and rules
> - graph-native callables, dispatch/effects, sync/dataflow, UI, and target dialects

---

# Executive summary

Gen2 should move forward by rebasing the library on a typed semantic graph kernel.

The old phase plans were directionally right about type-safe composition, operation/law awareness, checker/emitter unification, dispatch, stored values, combiners, entity views, target infrastructure, and graph integration. The new design is stronger and more coherent:

```txt
The runtime IR stays simple and serializable.
The authoring API becomes typed, ergonomic, and inference-driven.
Every semantic concept lowers into one graph.
Dialect modules define typed vocabulary.
Graph steps/fragments compose semantic facts.
Passes verify, derive, canonicalize, legalize, lower, and emit.
Targets consume legalized target dialect IR.
Diagnostics and invariants become first-class semantic objects.
```

The hard kernel is intentionally small:

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

Everything else is a dialect or a graph pattern over these primitives:

```txt
Entity
Field
Relation
Rule
Query
Action
Event
Dispatch
Effect
Resource
Stream
Queue
Mailbox
View
Component
Policy
Invariant
Target
```

Operations are not a separate primitive family. An operation definition is a node. Its inputs, outputs, patches, inverses, lowerings, and uses are edges. Its properties and laws are traits. Generic behavior is exposed through protocols.

---

# Core architectural stance

## 1. Runtime IR and typed authoring API are separate layers

The runtime graph should remain broad, inspectable, and serializable.

```ts
type RuntimeNode = {
  id: string;
  kind: string;
  traits: readonly string[];
  metadata?: unknown;
};

type RuntimeEdge = {
  id: string;
  kind: string;
  endpoints: readonly RuntimeEndpoint[];
  metadata?: unknown;
};
```

The typed authoring API wraps this with witnesses:

```txt
DialectWitness
NodeKindWitness
EdgeKindWitness
EndpointWitness
TypeWitness
TraitWitness
OperationWitness
ArtifactKindWitness
PassWitness
```

Do not make runtime graph objects generic-heavy. Put TypeScript inference at construction/query boundaries.

## 2. One canonical internal shape per concept

Object, builder, curried, callback, `.class`, and pipe forms are authoring facades.

They must all normalize to one canonical semantic definition and one graph-fragment lowering.

Example:

```ts
app.action("archiveUser")({...});
app.action("archiveUser")((ctx, action) => ...);
app.action().name("archiveUser").input(...).done();

class ArchiveUser extends app.action.class("archiveUser", {...}) {}
```

All of these should produce the same `ActionDef` and the same graph facts.

## 3. Typed APIs accept witnesses; dynamic APIs accept strings

Typed path:

```ts
graph.edges.ofKind(app.edges.writes);
edge(app.edges.writes, {
  action: ref(archiveUser),
  field: ref(User.fields.archivedAt),
});
```

Dynamic path:

```ts
graph.edges.ofKindId("app.edge.writes");
graph.edge(edgeId).as(app.edges.writes);
```

Do not mix them. If an API accepts strings, name it as dynamic, unchecked, or decode/refinement-oriented.

## 4. Metadata is passive

Metadata may annotate, explain, preserve source information, or carry target-specific non-semantic payloads.

Metadata must not control compiler behavior.

Compiler behavior should come from:

```txt
nodes
edges
typed traits
protocol implementations
passes
target capabilities
diagnostics
```

## 5. TypeScript proves local composition; passes prove graph-wide invariants

Do not try to make TypeScript prove everything.

Layer safety as follows:

```txt
TypeScript inference
  catches local endpoint, field, payload, trait, scope, and constructor mistakes.

Graph verification passes
  catch global semantic invariants.

Target legalization passes
  catch unsupported target lowerings.

Runtime decoding
  validates dynamic/plugin/imported data.

Diagnostics
  explain what failed and how it might be repaired.
```

---

# Public constructor facade policy

Major semantic constructors should support multiple forms where useful.

## Standard constructor forms

For named concepts:

```ts
defineX();
// builder

defineX("Name");
// curried named binder

defineX.with<AppCtx>()("Name");
// context-bound named binder

dialect.x("Name");
// dialect-bound named binder

dialect.x("Name")({...});
// object form

dialect.x("Name")((ctx, builder) => ...);
// callback-with-context form

class X extends dialect.x.class("Name", {...}) {}
// class facade

kernel.graph.pipe(xDef);
// graph fragment / graph step
```

## Recommended matrix

| Constructor kind     | Object |       Builder | Curried | Callback ctx |     `.class` |         Pipe/fragment |
| -------------------- | -----: | ------------: | ------: | -----------: | -----------: | --------------------: |
| `defineDialect`      |    yes |           yes |     yes |          yes |        maybe |    no/direct registry |
| `defineType`         |    yes |           yes |   maybe |       rarely |           no |  maybe as `type(...)` |
| `defineTrait`        |    yes |         maybe |      no |           no |           no | maybe as `trait(...)` |
| `defineLaw`          |    yes |         maybe |      no |           no |           no |      via `claim(...)` |
| `defineOperation`    |    yes |           yes |     yes |        maybe |        maybe |                   yes |
| `defineEntity`       |    yes |           yes |     yes |          yes | yes / strong |                   yes |
| `defineRule`         |    yes |           yes |     yes |          yes |        maybe |                   yes |
| `defineAction`       |    yes |           yes |     yes |          yes |        maybe |                   yes |
| `defineQuery`        |    yes |           yes |     yes |          yes |        maybe |                   yes |
| `defineEvent`        |    yes |           yes |     yes |        maybe |   yes / good |                   yes |
| `defineDispatch`     |    yes |           yes |     yes |          yes |        maybe |                   yes |
| `defineView`         |    yes |           yes |     yes |          yes |   yes / good |                   yes |
| `defineArtifactKind` |    yes |           yes |     yes |          yes |        maybe |                    no |
| `emit`               |    yes | builder maybe |      no |        maybe |           no |                   yes |
| `edge`               |    yes |            no |      no |           no |           no |                   yes |
| `pass`               | object |            no |   maybe |          yes |        maybe |                   yes |

Document the primary forms, not every possible form equally.

Recommended primary style:

```ts
class User extends domain.entity.class("User", {
  fields: {
    id: field(t.uuid).primary(),
    email: field(t.email).unique(),
    archivedAt: field(t.optional(t.datetime)),
  },
}) {}

const archiveUser = app.action("archiveUser")((ctx, action) =>
  action.input({ actor: User, user: User }).guard(canArchiveUser).writes(User.fields.archivedAt, {
    operation: "set",
    reversible: true,
  }),
);

const graph = kernel.graph.pipe(User, canArchiveUser, archiveUser, pass(app.passes.checkGuards));
```

---

# Migration stance

This is a rebase, not a permanent backward-compatible overlay.

Temporary shims may exist on the migration branch, but the final architecture must not preserve the old parallel registry model.

Final-state prohibitions:

```txt
No permanent top-level semantic arrays on GenContext.
No raw string trait/kind/edge/protocol checks for internal semantics.
No module-level checker registry separate from Pass pipelines.
No target emitter consuming old high-level module IR directly.
No metadata used to control compiler behavior.
No separate Operation/Law/Checker/Emitter primitive families competing with Node/Edge/Trait/Pass.
No decorator-only or runtime-reflection-only primary APIs.
No behavior/codegen semantics hidden inside string bodies.
```

Public builders may remain ergonomic, but they must compile into graph IR:

```txt
gen.entity(...)
gen.rule(...)
gen.action(...)
gen.query(...)
gen.relation(...)
gen.view(...)
gen.provider(...)
gen.invariant(...)
gen.dispatch(...)
```

These are dialect frontends, not independent sources of truth.

---

# How to interpret the older phases

## Phase 5: what survives

Keep the intent:

```txt
value-first inference
phantom type slots for input/output/requirements/effects/traits
trait checking
canonical objects composing through a generic graph model
plan compatibility
requirement/effect bubbling
rule-to-predicate/expression lowering
law-aware composition gates
optional typed registry
cast reduction and inference audit
dispatch unification
callable unification
workflow/plan composition
stored value unification
combiner unification
execution footprint unification
```

Replace the mechanism:

```txt
Old:
  Adapters project existing canonical objects into StaticNode.
  GenContext keeps old arrays.
  Checkers continue over old module collections.
  Traits/laws/capabilities remain distinct structures with loose relationships.

New:
  Canonical objects are graph nodes/edges from the start.
  GenContext owns a Graph, not many semantic arrays.
  Checkers become Passes owned by Dialects.
  Traits/laws/capabilities are typed symbols and trait applications.
  Protocols expose generic behavior to passes.
  Operations are operation-definition nodes.
```

## Phase 6: what survives

Keep the intent:

```txt
lifecycle checks need dependency ordering
emitters need dependency ordering and caching
forms/editors/lists/CRUD should unify
plugins should register semantic extensions
intermediate graphs should be cached and reused
documentation needs to reflect the actual architecture
```

Replace the mechanism:

```txt
Old:
  Checker<T> registry
  ArtifactEmitter<Input, Artifact> registry
  EntityView added beside old forms/editors/lists/cruds arrays
  old arrays remain populated for backward compatibility

New:
  Pass pipelines replace checker/emitter registries.
  Emitters are emit-phase passes.
  EntityView is a UI dialect node kind.
  Old arrays may exist only during migration branch.
  Plugins register Dialects, Passes, Symbols, Traits, Protocols, NodeKinds, EdgeKinds, Lowerings, and Targets.
```

---

# Revised phase plan

## R0 — Architecture freeze, migration branch, and guardrails

Create a long-lived migration branch:

```txt
refactor/revised-kernel-rebase
```

During this branch:

```txt
No new feature work against the old GenContext array model.
No new raw string trait/kind APIs.
No new module checker registration outside Passes.
No target codegen that bypasses target legalization.
No new public primitive family unless it can be expressed as Node, Edge, Type, Expr, Transform, Trait, Protocol, Diagnostic, Artifact, or Pass.
```

Required setup:

1. Add `docs/revised-kernel.md`.
2. Add golden tests for existing important behavior:
   - entity
   - relation
   - type
   - operation
   - rule
   - query
   - action
   - auth policy
   - reactivity
   - storage location
   - provider satisfaction
   - UI derivation
   - target output
3. Add compile-time type tests.
4. Add architecture grep/lint rules for forbidden patterns.
5. Continue using `vp check` and `vp test` as validation commands.

Exit criteria:

```txt
Migration branch exists.
Old phase plans are marked historical/superseded.
Golden behavior tests exist before deep rewrites begin.
Architecture guardrails are documented.
```

---

## R1 — Hard kernel runtime IR and typed witness layer

Build the new kernel in isolation.

Files:

```txt
src/kernel/id.ts
src/kernel/ref.ts
src/kernel/symbol.ts
src/kernel/location.ts
src/kernel/metadata.ts
src/kernel/trait.ts
src/kernel/protocol.ts
src/kernel/type.ts
src/kernel/expr.ts
src/kernel/transform.ts
src/kernel/node.ts
src/kernel/edge.ts
src/kernel/graph.ts
src/kernel/dialect.ts
src/kernel/pass.ts
src/kernel/diagnostic.ts
src/kernel/artifact.ts
src/kernel/index.ts
```

Important rules:

```txt
Internal semantics use typed symbol definitions, not raw strings.
Every IR object can carry traits.
Every durable IR object can carry refs and locations.
Traits are semantic claims.
Protocols are behavior/accessor contracts for generic passes.
Metadata is passive only.
Runtime IR stays serializable and broad.
Typed witnesses live at construction/query boundaries.
```

Core symbol definitions:

```txt
DialectDef
NodeKindDef
EdgeKindDef
EndpointRoleDef
TraitDef
ProtocolDef
CapabilityDef
PassKindDef
TypeKindDef
ExprKindDef
DiagnosticDef
ArtifactKindDef
```

The first graph APIs should be witness-first:

```ts
graph.nodes.ofKind(domain.nodes.entity);
graph.nodes.withTrait(core.traits.callable);
graph.edges.ofKind(app.edges.writes);
graph.edges.from(ref(action), app.edges.appliesOperation);
graph.edges.to(ref(field), app.edges.writes);
graph.supportsProtocol(node, app.protocols.writable);
```

String-first variants are debug/dynamic/refinement APIs only:

```ts
graph.nodes.ofKindId("domain.node.entity");
graph.edge(edgeId).as(app.edges.writes);
```

Exit criteria:

```txt
Kernel builds without depending on old entity/relation/function/ui/auth modules.
Graph can register types, exprs, nodes, edges, traits, protocols, dialects, passes, diagnostics, artifacts.
No magic-string API is required for internal semantic graph queries.
```

---

## R2 — Graph composition API: steps, fragments, pipe, builder, writer

Add graph composition before migrating high-level concepts.

Core protocol:

```ts
export interface GraphStep<TKernel = unknown, TIn = unknown, TOut = TIn> {
  readonly kind: "graph.step";
  readonly requires?: readonly unknown[];
  apply(graph: TypedGraph<TKernel, TIn>): TypedGraph<TKernel, TOut>;
}

export type GraphFragment<TKernel, TIn, TOut> = GraphStep<TKernel, TIn, TOut>;
```

Public APIs:

```ts
kernel.graph.pipe(...steps);
kernel.graph.builder();
kernel.graph.build((w) => {
  w.add(User);
  w.edge(app.edges.writes, {
    action: ref(archiveUser),
    field: ref(User.fields.archivedAt),
  });
});
```

Rules:

```txt
Everything high-level can be a GraphStep or GraphFragment.
Public graph composition is immutable/copy-on-write by default.
Internal writer APIs may mutate for performance, but mutation must not leak.
Bridge helpers that cast ReadonlyMap to Map become private implementation details.
```

Exit criteria:

```txt
GraphStep and GraphFragment exist.
kernel.graph.pipe works for graph fragments, passes, edges, emits, and high-level definitions.
kernel.graph.builder and kernel.graph.build exist.
Bridge mutation has a public replacement path through GraphWriter.
```

---

## R3 — Typed dialect modules and registries

Create dialect modules that own vocabulary.

Target style:

```ts
const domain = defineDialect("domain")((d) => {
  const entity = d.nodeKind("entity");
  const field = d.nodeKind("field");

  const ownsField = d.edgeKind("ownsField", {
    endpoints: {
      entity: d.endpoint("entity").target(entity).source(),
      field: d.endpoint("field").target(field).target(),
    },
  });

  return {
    nodes: { entity, field },
    edges: { ownsField },
  };
});
```

Dialect imports are explicit:

```ts
const app = defineDialect("app")((d) => {
  const field = d.import(domain.nodes.field);

  const action = d.nodeKind("action");
  const writes = d.edgeKind("writes", {
    endpoints: {
      action: d.endpoint("action").target(action).source(),
      field: d.endpoint("field").target(field).target(),
    },
    metadata: schema<{
      operation: "set" | "increment" | "append" | "delete";
      reversible?: boolean;
    }>(),
  });

  return {
    imports: [domain],
    nodes: { action },
    edges: { writes },
  };
});
```

Kernel captures registered dialects:

```ts
const kernel = createKernel({
  dialects: { core, domain, app, expr, ui, postgres },
});
```

Typed registry:

```ts
registry.get("app"); // typeof app
registry.ownerOf(app.edges.writes); // typeof app
registry.getById("app"); // dynamic
```

Exit criteria:

```txt
defineDialect("id")((d) => ...) works.
Dialect records expose typed nodes, edges, traits, passes, lowerings, artifacts.
Kernel type carries dialect record.
Graph steps declare dialect requirements where practical.
```

---

## R4 — Typed refs, graph queries, and dynamic boundaries

Add typed refs as the internal semantic identity mechanism.

```ts
type Ref<TKind, TValue = unknown> = {
  id: KernelId;
  kind: TKind;
  value?: TValue;
};
```

Typed ref usage:

```ts
edge(app.edges.writes, {
  action: ref(archiveUser),
  field: ref(User.fields.archivedAt),
});
```

Dynamic boundary:

```ts
const loaded = kernel.decodeGraph(json);

if (loaded.ok) {
  const maybeWrites = loaded.value.edge(edgeId).as(app.edges.writes);
  if (maybeWrites.ok) {
    maybeWrites.value.endpoints.action;
  }
}
```

Graph queries should infer endpoint and metadata shape:

```ts
const writes = graph.edges.ofKind(app.edges.writes);

writes.first().endpoints.action;
writes.first().endpoints.field;
writes.first().metadata.operation;
```

Exit criteria:

```txt
Typed refs exist.
Typed graph queries infer node metadata, edge endpoints, edge metadata, and target kind.
Dynamic import/decode APIs refine from strings/JSON into typed witnesses.
```

---

## R5 — Types, transforms, operations, and laws

This is the most important semantic phase.

The revised type and operation model must make it possible to ask:

```txt
What operations can happen to this type?
What properties do those operations have?
Which operation did this action apply?
What fields/types did it read or write?
Can the operation be patched, inverted, replayed, merged, lowered, or incrementally maintained?
```

## Type model

Evolve semantic types toward:

```txt
GType<Decoded, Encoded, DecodeR, EncodeR, Traits>
```

Public type system:

```ts
const t = defineTypeSystem("core.types")({
  string: scalar("string").decoded<string>(),
  number: scalar("number").decoded<number>(),
  boolean: scalar("boolean").decoded<boolean>(),
  uuid: scalar("uuid").decoded<Uuid>(),
  email: scalar("email").decoded<Email>(),
  datetime: scalar("datetime").decoded<Date>(),
});

const UserType = t.object("User", {
  id: t.uuid,
  email: t.email,
  archivedAt: t.optional(t.datetime),
});
```

Combinators:

```txt
optional
array/list
set
map
record
enum
literal
union
taggedUnion
brand
opaque
refine
pick
omit
```

## Transform / codec model

Transforms should use stable IDs and typed input/output.

Bad final state:

```txt
id: transform:${Date.now()}
encode/decode as opaque strings only
```

Target:

```ts
const EmailCodec = transform.codec("EmailCodec")({
  decoded: t.email,
  encoded: t.string,
  encode: expr.fn((email) => email.toString()),
  decode: expr.fn((value) => email.parse(value)),
  laws: [laws.roundTrip(), laws.deterministic],
});
```

Transforms can be operation-backed, expression-backed, or target-backed, but they must be graph-visible.

## Operation model

Operation definitions are nodes:

```txt
OperationDefNodeKind
```

Operation relationships are edges:

```txt
OperationAcceptsTypeEdgeKind
OperationReturnsTypeEdgeKind
TypeSupportsOperationEdgeKind
OperationReadsEdgeKind
OperationWritesEdgeKind
OperationProducesPatchEdgeKind
OperationInverseEdgeKind
OperationLowersToEdgeKind
ActionAppliesOperationEdgeKind
ExprUsesOperationEdgeKind
```

Operation properties are traits:

```txt
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
OperationRetrySafe
OperationOfflineReplaySafe
```

Laws are typed traits on operation nodes, transforms, expressions, and sometimes edges:

```txt
LawAssociative
LawCommutative
LawIdempotent
LawIdentity
LawInverse
LawDistributive
LawMonotonic
LawOrderPreserving
LawConfluent
LawRollbackSafe
```

Some laws are marker traits. Others require witnesses:

```txt
LawInverse -> inverse operation ref
LawIdentity -> identity expression ref
LawAssociative -> assurance metadata / property test / proof artifact
```

Protocol rule:

```txt
Trait:
  this operation is patchable.

Protocol:
  here is how to produce/apply/invert the patch.
```

Protocols:

```txt
OperationProtocol
PatchProtocol
DeltaProtocol
ReducerProtocol
PredicateAffectProtocol
LoweringProtocol
```

Exit criteria:

```txt
Types preserve decoded inference.
Transforms/codecs are stable typed graph witnesses.
Operations are graph nodes.
Operation facts are graph edges.
Laws are typed traits with optional witnesses.
Operation uses in expressions/actions reference operation nodes.
CRUD, optimistic, offline, merge, and IVM planning can query operation facts from the graph.
```

---

## R6 — Diagnostics and invariants

Diagnostics are first-class semantic objects, not strings attached to checks.

Distinguish:

```txt
DiagnosticDefinition
  reusable typed schema for a possible diagnostic

DiagnosticFinding
  concrete emitted occurrence

InvariantFamily
  reusable generic invariant template

InvariantInstance
  concrete invariant attached to graph facts

InvariantViolation
  finding produced by invariant failure
```

Diagnostics can come from:

```txt
type checking
graph verification
dialect verification
target legalization
security analysis
deployment planning
AI prompt interpretation
code generation
runtime validation
test generation
sync planning
migration analysis
```

Diagnostic shape:

```ts
const RuleNotSqlLowerable = diagnostic.define("RULE_NOT_SQL_LOWERABLE", {
  severity: "error",
  params: {
    rule: param.node(app.nodes.rule),
    target: param.target(),
    reason: param.enum([
      "opaque_expr",
      "unsupported_operation",
      "unsupported_type",
      "server_only_provider",
    ]),
  },
  messages: {
    user: ({ rule }) => `The rule "${rule.name}" cannot be used as a database policy.`,
    developer: ({ rule, reason }) => `Rule ${rule.ref} is not SQL-lowerable: ${reason}.`,
  },
  remediation: ({ reason }) => {
    switch (reason) {
      case "opaque_expr":
        return "Replace opaque logic with typed Gen2 expression operations.";
      case "unsupported_operation":
        return "Add a SQL lowering or use a server-side guard.";
    }
  },
});
```

Invariant shape:

```ts
const ActiveUserHasEmail = invariant.define("ActiveUserHasEmail", {
  subject: User,
  predicate: ({ user }) => user.archivedAt.isNull().implies(user.email.isSome()),
  diagnostic: {
    code: "ACTIVE_USER_EMAIL_REQUIRED",
    messages: {
      user: "Active users must have an email address.",
      developer: "User.email must be present when User.archivedAt is null.",
    },
    path: User.fields.email,
    severity: "error",
  },
  lowerTo: [
    lower.serverValidation(),
    lower.formValidation.ifClientSafe(),
    lower.databaseCheck.ifSqlLowerable(),
    lower.tests(),
    lower.docs(),
  ],
});
```

Invariant families:

```ts
const RequiredField = invariant.family("RequiredField", {
  params: {
    entity: param.entity(),
    field: param.fieldOf("entity"),
  },
  predicate: ({ subject, field }) => subject.field(field).isPresent(),
  diagnostic: ({ entity, field }) => ({
    code: `${entity.name}_${field.name}_REQUIRED`,
    user: `${field.label} is required.`,
    developer: `${entity.name}.${field.name} must be present.`,
  }),
});
```

Exit criteria:

```txt
Passes emit typed diagnostics, not raw strings.
Diagnostics carry graph/source/emitted/runtime locations.
Invariants are graph-visible contracts with typed diagnostics.
Invariant families support reusable generic constraints.
Diagnostics support remediation metadata for AI repair.
```

---

## R7 — Expression, scope, and rule dialects

Migrate expression and rule logic to the operation-aware graph model.

Goals:

```txt
Expr operation calls reference OperationDef nodes.
Rules are named pure boolean expressions with business meaning.
Rule dependencies derive read edges.
Scopes are typed binding contexts, not string lookups only.
Opaque JS is explicit through traits and diagnostics.
SQL/client/server lowerability is trait/protocol-based.
```

Key node/edge kinds:

```txt
ExpressionNodeKind
ExprFunctionNodeKind
PredicateNodeKind
RuleNodeKind
LexicalScopeNodeKind
ExecutionScopeNodeKind
ScopeBindingNodeKind

ExprUsesOperationEdgeKind
ExprReadsFieldEdgeKind
ExprReadsContextEdgeKind
ExprUsesBindingEdgeKind
RuleHasBodyEdgeKind
RuleReadsEdgeKind
RuleGuardsEdgeKind
```

Important traits:

```txt
ExprPure
ExprOpaque
ExprPortable
ExprSqlLowerable
ExprClientSafe
ExprServerOnly
ExprPredicate

RulePure
RulePredicate
RulePolicyCandidate
RuleClientSafe
RuleServerOnly
RuleSqlLowerable
RuleIncrementalizable
```

Scope API target:

```ts
const archiveUser = app.action("archiveUser")((ctx, action) =>
  action
    .input({ actor: User, user: User })
    .context({ now: t.datetime })
    .body((body) => body.pipe(op.set(ctx.input.user.archivedAt, ctx.context.now))),
);
```

Old `RuleExpr` does not survive as a separate conceptual system. If the public API remains, it lowers into canonical `Expr`.

Exit criteria:

```txt
Existing rule behavior is expressible through operation-aware Expr/Predicate IR.
Rule dependencies are edges.
Scopes produce typed callback contexts.
Invalid scope access fails at compile time where possible.
Rules can be checked for placement/lowerability through traits and protocols.
```

---

## R8 — Domain dialect: entities, fields, relations, and `.class`

Entities, fields, and domain relations become a dialect over the kernel.

Node kinds:

```txt
EntityNodeKind
FieldNodeKind
DomainRelationNodeKind, only if relation needs identity/payload
```

Edge kinds:

```txt
OwnsFieldEdgeKind
FieldHasTypeEdgeKind
DomainRelationEdgeKind
ReferencesEdgeKind
RelationEndpointEdgeKind
```

Cardinality, integrity, foreign-key behavior, and deletion behavior should be typed traits/edge payloads.

Examples:

```txt
CardinalityOneToMany
CardinalityManyToOne
IntegrityDatabaseForeignKey
IntegrityApplicationChecked
ReferentialCascade
ReferentialRestrict
RelationRequired
```

The preferred entity authoring form is `.class`:

```ts
class User extends domain.entity.class("User", {
  fields: {
    id: field(t.uuid).primary(),
    email: field(t.email).unique(),
    role: field(t.enum("Role", ["admin", "user"] as const)),
    archivedAt: field(t.optional(t.datetime)),
  },
}) {}
```

`User` should expose:

```ts
User.ref;
User.type;
User.fields.id;
User.fields.email;
User.fragment;
```

It should be usable directly:

```ts
kernel.graph.pipe(User);
```

Relation frontend:

```ts
const OrgUsers = domain.relation("OrgUsers")({
  from: Organization,
  to: User,
  cardinality: "one-to-many",
  onDelete: "restrict",
});
```

Exit criteria:

```txt
Entities and fields are graph nodes.
Field ownership is an edge.
Field type is an edge.
Domain relation is an edge or relation node + endpoint edges.
Entity .class form works and preserves inference.
Existing relation invariants are rewritten as dialect verification passes.
```

---

## R9 — Callable, action, query, mutation, plan, dispatch, workflow

Migrate behavior objects into callable graph IR.

Node kinds:

```txt
FunctionNodeKind
ExprFunctionNodeKind
PredicateFunctionNodeKind
QueryNodeKind
ActionNodeKind
PatchNodeKind
PlanNodeKind
MutationNodeKind
DispatchNodeKind
WorkflowNodeKind
```

Protocols:

```txt
CallableProtocol
ReadableProtocol
WritableProtocol
EffectProtocol
PatchProtocol
PlanProtocol
DispatchProtocol
WorkflowProtocol
```

Edges:

```txt
FunctionHasInputTypeEdgeKind
FunctionHasOutputTypeEdgeKind
FunctionHasBodyEdgeKind
FunctionRequiresEdgeKind
FunctionHasEffectEdgeKind
QueryReadsEdgeKind
QueryHasKeyEdgeKind
ActionAppliesOperationEdgeKind
ActionWritesEdgeKind
ActionEmitsEventEdgeKind
ActionInvalidatesKeyEdgeKind
ActionHasOptimisticPatchEdgeKind
MutationWrapsActionEdgeKind
DispatchTriggersEdgeKind
DispatchHandlesEdgeKind
WorkflowContainsStepEdgeKind
PlanChainsToEdgeKind
PlanFallbackEdgeKind
```

Key distinctions:

```txt
Expr
  pure logic

ExprFunction
  callable pure expression

Rule
  named boolean ExprFunction

Query
  callable read boundary

Action
  callable write/effect boundary

Mutation
  reactive wrapper around Action

PatchFunction
  optimistic/rollback/reconcile function

PlanFunction
  execution plan
```

Exit criteria:

```txt
Query/action/mutation/plan/workflow/dispatch are graph nodes.
Read/write/apply/guard relationships are graph edges.
Requirements/effects bubble at type level and runtime graph level.
Mutation is a reactive wrapper over Action, not a duplicate action primitive.
```

---

## R10 — Effects, events, reactions, delivery, idempotency, outbox

Do not create one monolithic effectful primitive.

Use these concepts:

```txt
EffectDef
  execution footprint / capability requirement

Event
  typed trigger payload / semantic fact

Dispatch
  trigger -> select/project -> handler -> delivery plan

Reaction
  dispatch triggered by rule becoming true

Subscription
  dispatch triggered by event/stream/topic

Reducer
  dispatch handler that folds values using operation laws

DeliveryPlan
  inline / outbox / queue / webhook / target decides

IdempotencyPlan
  dedupe/retry safety

OutboxPlan
  reliable persistence/delivery
```

Node kinds:

```txt
EffectDefNodeKind
CapabilityNodeKind
EventNodeKind
DispatchNodeKind
DeliveryPlanNodeKind
IdempotencyPlanNodeKind
OutboxPlanNodeKind
ReducerNodeKind
```

Edges:

```txt
NodeHasEffectEdgeKind
EffectRequiresCapabilityEdgeKind
ActionEmitsEventEdgeKind
EventHasPayloadTypeEdgeKind
DispatchTriggeredByEdgeKind
DispatchSelectsWithEdgeKind
DispatchRunsHandlerEdgeKind
DispatchDeliveredByEdgeKind
DispatchUsesIdempotencyEdgeKind
DispatchWritesOutboxEdgeKind
ReducerUsesOperationEdgeKind
ReducerWritesTargetEdgeKind
```

Hard invariant:

```txt
Rules are pure.
Dispatch owns trigger-to-handler effectful execution.
Effects describe execution footprints.
Delivery/idempotency/outbox describe runtime safety.
```

Diagnostics:

```txt
dispatch:missing-trigger
dispatch:missing-handler
dispatch:missing-idempotency
dispatch:side-effect-without-delivery
dispatch:inline-side-effect-unsafe
dispatch:at-least-once-requires-idempotency
effect:unsupported-by-runtime
event:payload-type-mismatch
reducer:non-associative
```

Exit criteria:

```txt
Events, reactions, subscriptions, reducers, delivery, idempotency, and outbox are graph-native dialect concepts.
Effect footprints are facts, not execution plans.
Rule-triggered and event-triggered behavior share Dispatch.
At-least-once/retry/outbox safety is verified by passes.
```

---

## R11 — Dataflow/async dialect family: resources, collections, streams, queues, mailboxes, variants

Add higher-level dataflow dialects without bloating the hard kernel.

Dialect family:

```txt
dialect.collection
  List, Set, Map, Page, collection operations

dialect.async
  Result, Exit, ResourceState, AsyncGroup, CancellationScope

dialect.stream
  Stream, Source, Sink, Subscription, Topic, Backpressure, Checkpoint

dialect.queue
  Queue, Mailbox, Message, Envelope, Retry, DLQ, Drain

dialect.resource
  StateResource, ReactiveResource, Hydration, TrackingScope

dialect.variant
  Enum, LiteralUnion, TaggedUnion, Variant, StateMachine, transition operations
```

Shape vocabulary:

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
TaggedUnion<Tag, Variants>
```

Resource state:

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

Stream model:

```txt
Stream = node
Publisher/Subscriber = edges
```

Queue model:

```txt
Queue = durable or ephemeral stream with delivery semantics
Mailbox = Queue + owner/address semantics
```

Event/message separation:

```txt
Event
  semantic fact that happened

Message
  transport/delivery envelope

Queue
  durable/ephemeral storage for messages

Dispatch
  trigger-to-handler wiring
```

Exit criteria:

```txt
Collections, resources, streams, queues, mailboxes, messages, and variants are represented as dialect graph concepts.
Streams carry type, error, requirements, effects, scope, ordering, replay, backpressure, and placement metadata through traits/edges.
Queues model persistence, ordering, retry, idempotency, DLQ, encryption, drain trigger, and storage placement.
State machines/variants expose transition operations and exhaustive checks.
```

---

## R12 — Reactivity, sync, optimistic, offline, IVM

Reactivity should derive from operation, read, write, key, rule, stream, and resource edges.

Core facts consumed:

```txt
Query reads field/type/rule.
Action applies operation.
Operation writes field/type.
Operation produces patch.
Operation has inverse.
Operation has delta protocol.
Reducer/combiner operation has laws.
Key derives from query/input/entity.
Stream emits event/value.
Resource materializes stream/query.
```

Node kinds:

```txt
KeyFamilyNodeKind
ReactiveResourceNodeKind
ReactiveMutationNodeKind
OptimisticPlanNodeKind
OfflineQueueNodeKind
MaterializedViewNodeKind
IvmPlanNodeKind
SyncPlanNodeKind
ConflictPolicyNodeKind
```

Edges:

```txt
DerivesKeyEdgeKind
ReadsKeyEdgeKind
InvalidatesKeyEdgeKind
PatchesResourceEdgeKind
ProducesDeltaEdgeKind
MaintainsViewEdgeKind
UsesCombinerEdgeKind
SyncsScopeEdgeKind
ResourceSubscribesToStreamEdgeKind
```

Manual reactivity remains essential.

Manual facts should use the same graph:

```ts
edge(
  reactivity.edges.invalidatesKey,
  {
    action: ref(archiveUser),
    key: ref(UserListKey.any()),
  },
  {
    provenance: explicit("manual invalidation"),
    precision: "broad",
  },
);
```

Derivation confidence:

```txt
explicit
derived
conservative
target
opaque
```

Derivation precision:

```txt
exact
matched
broad
unknown
```

Sync stance:

```txt
Gen2 owns sync semantics and planning.
Runtime adapters execute the plan.
TanStack DB / PowerSync / Electric / custom Gen2 runtime are targets.
```

Exit criteria:

```txt
Optimistic planning derives from operation patchability/invertibility/client-safety.
Offline planning derives from idempotency/retry/replay traits and queue plans.
IVM planning derives from read/write/delta/reducer/predicate-affect protocols.
Sync plans can lower to runtime adapters.
Fallbacks are explicit and diagnostic-producing.
```

---

## R13 — Auth, policy, claims, placement

Auth builds on claims, rules, context, provider, operation, and placement dialects.

Node kinds:

```txt
PolicyNodeKind
AccessSurfaceNodeKind
ClaimNodeKind
```

Edges:

```txt
PolicyTargetsEntityEdgeKind
PolicyUsesRuleEdgeKind
PolicyRequiresClaimEdgeKind
GuardsActionEdgeKind
ExposesClientHintEdgeKind
RequiresServerEnforcementEdgeKind
```

Existing auth conditions lower as follows:

```txt
AllowAuthenticated -> claim over AuthSession context
AllowPublic -> no claim / public trait
AllowRole -> role claim predicate
AllowOwner -> ownership edge + predicate
AllowRelation -> domain relation traversal predicate
OrCondition -> boolean operation expression
```

Placement checks determine whether a policy/rule/claim can be exposed to the client.

Rules:

```txt
Client hints are non-authoritative.
Server enforcement is authoritative.
Server-only data cannot be used in client rules unless projected through safe fields.
```

Exit criteria:

```txt
Policies are graph nodes.
Claims are nodes/predicates.
Auth conditions lower to claim/rule/expr graph IR.
Client hints are explicit non-authoritative edges.
Server enforcement is explicit and checked.
```

---

## R14 — UI dialect, AF-UI authoring, JSON-Render target/import

UI is a dialect, not a frontend framework.

Canonical framing:

```txt
dialect.ui
  canonical graph vocabulary

AF-UI
  authoring style: slots, capabilities, behaviors, styles, inside-out composition

JSON-Render
  serialization/target/import format: catalog + spec

React/Solid/RN/TUI
  target emitters over the same UI graph
```

Node kinds:

```txt
CatalogComponentNodeKind
ComponentNodeKind
ViewNodeKind
ElementNodeKind
SlotNodeKind
BehaviorNodeKind
StyleNodeKind
DesignSystemNodeKind
TokenNodeKind
WidgetNodeKind
FormNodeKind
StateBindingNodeKind
EntityViewNodeKind
```

Edges:

```txt
ViewExposesSlotEdgeKind
ViewContainsElementEdgeKind
ElementUsesCatalogComponentEdgeKind
ComponentReturnsViewEdgeKind
ComponentAcceptsPropsEdgeKind
SlotHasCapabilityEdgeKind
BehaviorRequiresSlotCapabilityEdgeKind
BehaviorAttachesToSlotEdgeKind
BehaviorHandlesEventEdgeKind
BehaviorRunsActionEdgeKind
StyleAttachesToSlotEdgeKind
SlotBindsStateEdgeKind
FormSubmitsActionEdgeKind
FieldRendersAsWidgetEdgeKind
ViewUsesDesignSystemEdgeKind
ViewEnabledWhenRuleEdgeKind
ViewHiddenWhenRuleEdgeKind
```

Traits:

```txt
UiInteractive
UiContainer
UiText
UiInput
UiCollection
UiRenderable
UiSerializable
UiClientSafe
UiServerDriven
UiAiGeneratable
```

Important corrections:

```txt
Use typed SlotRefs, not slot-name strings, in typed APIs.
Capabilities are traits.
Behavior bodies point to Action/Dispatch/Expr refs, not opaque strings.
JSON-Render is a target/import format, not canonical IR.
Props are allowed as typed data inputs; they are not the semantic integration mechanism.
```

Preferred API:

```ts
const ModalView = ui.view("ModalView")({
  slots: {
    backdrop: ui.slot([ui.traits.interactive]),
    content: ui.slot([ui.traits.container]),
    closeBtn: ui.slot([ui.traits.interactive]),
  },
});

const Modal = ui
  .component("Modal")({
    view: ModalView,
  })
  .pipe(
    ui.attachBehavior(closeModalBehavior, {
      closeTrigger: ModalView.slots.closeBtn,
      backdropTrigger: ModalView.slots.backdrop,
    }),
    ui.attachStyle(modalStyle, {
      content: ModalView.slots.content,
    }),
  );
```

JSON target emits:

```txt
Catalog
  components, prop schemas, slots, events, capabilities, allowed actions/state bindings

Spec
  view tree, props, state bindings, action bindings, style token refs
```

AI UI loop:

```txt
1. Emit UI catalog.
2. AI generates JSON spec.
3. Import JSON spec into UI graph.
4. Run UI verification passes.
5. Emit runtime UI only after verification.
```

Exit criteria:

```txt
Form/editor/list/CRUD are views over EntityView/UI graph IR.
CRUD generation uses operation/type/policy/storage facts.
UI enablement/visibility comes from rule/policy edges.
AF-UI style authoring works over typed slots.
JSON-Render emitter/importer works through typed graph decode/verify.
No permanent ctx.forms/editors/lists/cruds arrays remain.
```

---

## R15 — Pass pipelines, canonicalization, legalization

Replace lifecycle checkers and emitters with pass pipelines.

Pass phases:

```txt
verify-symbols
verify-dialects
derive
canonicalize
legalize
lower
emit
```

Required pipelines:

```txt
gen2-check
gen2-postgres
gen2-effect
gen2-react
gen2-solid
gen2-react-native
gen2-json-render
gen2-openapi
gen2-docs
gen2-tests
gen2-devtools
```

Old mapping:

```txt
Checker<T> -> verify/derive Pass
ArtifactEmitter -> emit Pass
Emitter dependencies -> pass dependencies
Checker dependencies -> pass dependencies
Emitter cache -> pass result cache
```

Target emitters must consume legalized target dialect IR.

Example:

```txt
domain.entity -> storage.record -> postgres.table -> sql artifact
rule/predicate -> sql.predicate -> postgres.rls_policy -> sql artifact
action -> server.mutation -> effect/http target IR -> artifact
entity view -> ui.view_model -> react.component -> tsx artifact
ui.view -> json_render.spec -> json artifact
```

Exit criteria:

```txt
lifecycle.check runs pass pipeline.
lifecycle.generate runs check + target pipeline.
No moduleCheckers array remains.
Emitters are passes.
Targets reject non-legalized input with typed diagnostics.
```

---

## R16 — Plugin/dialect API and target interop

Plugins register dialect contributions, not ad hoc helper blobs only.

Plugin contributions:

```txt
DialectDef
NodeKindDef
EdgeKindDef
EndpointRoleDef
TraitDef
ProtocolDef
TypeKindDef
ExprKindDef
DiagnosticDef
ArtifactKindDef
OperationDef nodes or operation families
Passes
Lowerings
Target capabilities
Builder namespaces
```

Rules:

```txt
Plugins may add dialects.
Plugins may add passes.
Plugins may add public builders.
Plugins may not mutate global registries outside PluginContext.
Plugins must use typed symbols and refs.
Duplicate symbols produce diagnostics.
```

Effect interop is first-class but not core-owned:

```txt
GType <-> Effect Schema adapter
Requirement/Provider/Service -> Effect Context.Service / Layer
Action/Workflow -> Effect runtime program
Errors/Cause/Exit -> optional target mapping
Stream -> Effect Stream adapter
```

Postgres target maps:

```txt
storage.record -> table
field -> column
domain relation -> foreign key / join table
rule expr -> sql predicate
policy -> RLS policy
operation lowering -> SQL expression/update/trigger
outbox/queue -> outbox table / worker plan
```

React/Solid target maps:

```txt
EntityView -> component model
Action -> mutation hook / server function
Query -> resource/query hook
Rule -> disabled/hidden state where client-safe
ReactiveResource -> hook/resource state
```

Target capability nodes should carry traits:

```txt
CapabilitySql
CapabilityRls
CapabilityTransactions
CapabilityJsonb
CapabilityReactComponents
CapabilityJsonRender
CapabilityEffectRuntime
CapabilityStreams
CapabilityOutbox
```

Exit criteria:

```txt
A plugin can define a node kind, edge kind, trait, protocol, diagnostic, verifier pass, lowering pass, and target emission pass.
Plugin contributions are type-safe and graph-visible.
Targets declare capabilities as typed traits.
Lowering passes check required operation/type/rule/effect traits and target capabilities.
Effect interop is an adapter/dialect, not a hard kernel dependency.
```

---

## R17 — Delete legacy architecture

This is the final hard cut.

Delete or convert:

```txt
ctx.entities
ctx.relations
ctx.graphs, if it means old relation graphs rather than kernel Graph
ctx.queries
ctx.static_functions
ctx.query_functions
ctx.action_functions
ctx.patch_functions
ctx.plan_functions
ctx.resources
ctx.routes
ctx.policies
ctx.events
ctx.reducers
ctx.subscriptions
ctx.forms
ctx.views, if old UI model is not graph-backed
ctx.components/styles/behaviors/themes/platforms/renderers, unless graph-backed
ctx.trait_applications, unless graph-backed
ctx.key_families
ctx.reactive_resources
ctx.reactive_mutations
ctx.rules
ctx.reactions
ctx.contexts/context_provisions/context_requirements, unless graph-backed views
ctx.requirements/providers, unless graph-backed views
ctx.state_resources
ctx.storage_locations
ctx.workflows
ctx.boundary_plans
ctx.obligation_graphs
ctx.offline_commands/offline_queues
ctx.moduleCheckers
```

This does not mean deleting public builders. It means deleting permanent non-graph semantic storage.

Final `GenContext` should look like:

```txt
Graph
plugins
config
status
diagnostics
artifacts
helpers
pass registry / pipeline registry
```

Exit criteria:

```txt
All semantic state lives in Graph.
Old arrays are gone or are computed views only.
All checks are passes.
All target output comes from target dialect IR.
Architecture grep tests pass.
vp check passes.
vp test passes.
```

---

## R18 — Documentation and agent workflow

Update documentation around the new mental model.

Required docs:

```txt
docs/revised-kernel.md
docs/dialects.md
docs/constructor-facades.md
docs/graph-composition.md
docs/types-transforms-operations-laws.md
docs/expressions-and-rules.md
docs/diagnostics-and-invariants.md
docs/callables-actions-queries.md
docs/dispatch-events-effects.md
docs/dataflow-async-streams-queues.md
docs/reactivity-sync-offline-ivm.md
docs/ui-dialect-and-json-render.md
docs/pass-pipelines.md
docs/effect-interop.md
docs/plugin-authoring.md
docs/target-authoring.md
docs/migration-from-old-phases.md
```

Update `AGENTS.md`:

```txt
Agents must inspect Graph/Dialect/Pass definitions before changing semantics.
Agents must not add old GenContext arrays.
Agents must not add magic-string internal semantics.
Agents must use typed witnesses/refs in new APIs.
Agents must use vp check and vp test.
Agents should add graph diagnostics and source locations for generated behavior.
Agents should add compile-time type tests for authoring API changes.
Agents should not implement object/builder/callback/class forms as separate semantic systems.
```

Exit criteria:

```txt
Docs explain the new kernel, dialects, graph composition, constructor forms, operations, traits, protocols, diagnostics, passes, and migration rules.
Old phase docs are marked historical.
Agent instructions point to revised_phases.md and revised-kernel docs.
```

---

# Mapping old milestones to revised phases

| Old milestone                             | Revised destination                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Phase 5 TYPE1 Namespace integrity         | Keep; public builder/runtime shape tests during R7/R17.                                             |
| Phase 5 TYPE2 Trait architecture          | Keep; typed `TraitDef` + trait applications in R1/R5.                                               |
| Phase 5 TYPE3 Canonical node adapter      | Superseded; objects are nodes directly. Temporary adapters only during branch migration.            |
| Phase 5 TYPE4 Function/resource adapters  | Superseded by callable/reactivity/resource dialect node kinds.                                      |
| Phase 5 TYPE5 Plan chain compatibility    | Keep; implemented through PlanProtocol, type helpers, and pass verification in R9.                  |
| Phase 5 TYPE6 Requirement/effect bubbling | Keep; implemented across Node/Expr/Operation/Plan/Behavior types and graph passes in R7/R9/R10/R15. |
| Phase 5 TYPE7 Rule predicate lowering     | Keep; rebase on operation-aware Expr/Predicate IR in R7.                                            |
| Phase 5 TYPE8 Law-aware gates             | Keep; laws become typed traits on operation nodes/transforms/edges in R5/R12.                       |
| Phase 5 TYPE9 Optional typed registry     | Keep; optional typed registry over Graph handles, not old GenContext arrays.                        |
| Phase 5 TYPE10 Cast reduction             | Keep; public builder inference audit after R8/R17.                                                  |
| Phase 5 TYPE11 Target fixtures            | Replace with target dialect regression suites in R15/R16.                                           |
| Phase 5 TYPE12 Dispatch unification       | Keep; `DispatchNodeKind` + trigger/handler/delivery edges in R10.                                   |
| Phase 5 TYPE13 Callable base interface    | Rename/rebase as `CallableProtocol` in R9.                                                          |
| Phase 5 TYPE14 Workflow steps             | Keep; workflow nodes with plan edges or regions in R9.                                              |
| Phase 5 TYPE15 StoredValue                | Keep; node kind in placement/resource dialect in R11/R12.                                           |
| Phase 5 TYPE16 Combiner                   | Keep; operation-definition node with reducer/combiner traits/laws in R5/R10/R12.                    |
| Phase 5 TYPE17 Execution footprint        | Keep; effect/capability traits and operation/effect edges in R5/R10.                                |
| Phase 6 TYPE1 Checker registry            | Superseded by Pass pipelines in R15.                                                                |
| Phase 6 TYPE2 ArtifactEmitter framework   | Superseded by emit-phase Passes in R15/R16.                                                         |
| Phase 6 TYPE3 EntityView                  | Keep; UI dialect node in R14.                                                                       |
| Phase 6 TYPE4 Plugin checker/emitter APIs | Superseded by Dialect/Pass/Target plugin registration in R16.                                       |
| Phase 6 TYPE5 Graph integration/caching   | Keep; Graph is hard kernel and pass cache is built into R1/R15.                                     |
| Phase 6 TYPE6 Backward compatibility docs | Rewrite as migration docs; old arrays are not final-state compatibility.                            |

---

# Revised non-goals

Do not do these:

```txt
Do not preserve the old GenContext array architecture in final state.
Do not model Operation as a standalone primitive outside Node/Edge.
Do not model Law as a standalone primitive outside Trait.
Do not make Protocols into TypeScript interfaces in public docs; call them Protocols.
Do not make Effect a hard dependency of the kernel.
Do not make target emitters consume source dialect IR directly.
Do not use metadata as behavior.
Do not keep checker/emitter registries as separate concepts from Passes.
Do not use raw strings for internal semantic identity.
Do not make decorators the primary API.
Do not infer semantic inheritance from TypeScript class inheritance unless explicitly declared.
Do not model behavior bodies as opaque strings when Action/Dispatch/Expr refs are available.
Do not treat JSON-Render, React, or DOM as canonical UI IR.
Do not make queues, streams, resources, or events hard kernel primitives.
```

---

# Required architecture tests

Add tests or static checks for these constraints:

```txt
No internal graph query API accepts a raw string kind/trait/edge name.
No new top-level semantic arrays are added to GenContext.
No target emitter imports old domain/callable/auth/ui modules directly for emission.
All target emission passes consume legalized target dialect objects.
All node/edge/trait/protocol/diagnostic definitions have typed stable IDs.
All generated artifacts have provenance/source locations.
Operations used by optimistic/IVM/CRUD tests are operation-definition nodes.
Laws used by planning are traits with assurance/witness payloads where needed.
All major authoring forms normalize to one canonical definition shape.
.class entity API preserves field and decoded type inference.
Dynamic/imported JSON graphs must pass decode/refine before using typed APIs.
Behavior attachment uses typed SlotRefs in typed APIs.
Passes emit typed diagnostics, not raw strings.
```

---

# Success definition

The rebased Gen2 is successful when:

```txt
A user defines domain facts once through ergonomic builders.
Builders emit typed graph IR.
Major constructors support object, builder, curried, callback, .class where appropriate, and pipe/fragment composition.
The graph contains nodes, edges, types, expressions, operations, traits, protocols, diagnostics, artifacts, and locations.
Passes derive rules, CRUD, optimistic plans, invalidation, sync plans, IVM, target IR, tests, docs, and artifacts from the graph.
Targets consume legalized target dialects.
Agents can inspect, explain, modify, and diff semantic graph facts.
No magic strings are needed for internal semantic identity.
TypeScript inference bubbles requirements/effects/traits upward and flows context downward.
Runtime diagnostics explain what TypeScript cannot prove.
Dynamic/plugin/imported graphs are decoded and refined before typed usage.
```

Compact mental model:

```txt
Types define value domains.
Operations define what can happen to those domains.
Expressions apply operations to values.
Rules name pure boolean expressions.
Traits define semantic claims and laws.
Protocols define what passes can ask objects to reveal or do.
Nodes define semantic objects.
Edges define semantic facts between objects.
Dialects package related graph concepts.
Graph steps/fragments compose definitions and facts.
Diagnostics explain failures, warnings, hints, and repair options.
Invariants define must-hold contracts with typed violations.
Passes verify, derive, canonicalize, legalize, lower, and emit.
Targets are interpretations of legalized IR.
```

---

# North-star example

This example should compile cleanly by the end of the migration:

```ts
const domain = defineDialect("domain")((d) => {
  const entity = d.nodeKind("entity");
  const field = d.nodeKind("field");

  const ownsField = d.edgeKind("ownsField", {
    endpoints: {
      entity: d.endpoint("entity").target(entity).source(),
      field: d.endpoint("field").target(field).target(),
    },
  });

  return { nodes: { entity, field }, edges: { ownsField } };
});

const app = defineDialect("app")((d) => {
  const action = d.nodeKind("action");
  const rule = d.nodeKind("rule");
  const field = d.import(domain.nodes.field);

  const writes = d.edgeKind("writes", {
    endpoints: {
      action: d.endpoint("action").target(action).source(),
      field: d.endpoint("field").target(field).target(),
    },
    metadata: schema<{
      operation: "set" | "increment" | "append" | "delete";
      reversible?: boolean;
    }>(),
  });

  return {
    imports: [domain],
    nodes: { action, rule },
    edges: { writes },
  };
});

const kernel = createKernel({ dialects: { domain, app } });

class User extends domain.entity.class("User", {
  fields: {
    id: field(t.uuid).primary(),
    email: field(t.email).unique(),
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

const archiveUser = app.action("archiveUser")((ctx, action) =>
  action.input({ actor: User, user: User }).guard(canArchiveUser).writes(User.fields.archivedAt, {
    operation: "set",
    reversible: true,
  }),
);

const graph = kernel.graph.pipe(
  User,
  canArchiveUser,
  archiveUser,
  pass(app.passes.checkGuards),
  pass(app.passes.deriveOptimisticUpdates),
);
```
