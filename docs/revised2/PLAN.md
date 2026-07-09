# Gen2 Improvement PLAN

> Source synthesis: every doc in `docs/revised2/`. This is the prescriptive plan
> for moving Gen2 from "kernel-rebase mid-flight" to the design these docs
> describe. It supersedes none of the existing R0–R17 phase docs; it
> _organizes_ them around the highest-leverage work and calls out gaps.
>
> **Implementation progress is tracked in [`CURRENT.md`](./CURRENT.md)**
> alongside this file — that document is the live status board (current
> task, next task, blockers, completed items, golden-snapshot state).
>
> Design sharpening from the sibling project `~/effect-atom-jsx` is in
> [`effect-atom-jsx-lessons.md`](./effect-atom-jsx-lessons.md) — witness
> tiering as the universal API pattern, tsc-as-legalization-gate,
> `Result<A,E>` as the emitted rendering contract, layer-swap test seams,
> per-atom typed hydration, and the case for effect-atom-jsx as the first
> UI target dialect.

---

## 0. The ultimate goal (one paragraph)

Gen2 / Dirived is a **typed semantic graph compiler for full-stack
applications**. Define application semantics — entities, types, rules,
operations, actions, queries, UI, sync, dispatch, deployment — once, as a
typed graph. Derive every implementation artifact (DB schema, RLS, server
handlers, React/Solid components, JSON-render specs, OpenAPI, queues,
outbox, optimistic patches, IVM plans, tests, docs, migrations, IaC) by
running passes over that graph. The product win is **derivations are
explainable, diffable, repairable, and target-portable** in a way that
scattered codegen never can be. Three altitudes share one canonical graph:
beginners use `gen.kit.saas(...)`; power users compose typed modules with
full inference; AI agents edit _graph facts_, run verify passes, get typed
diagnostics with graph-patch repairs, see a semantic diff, and emit
artifacts only after legalization succeeds. The shape we are building toward
is **Rails at the surface, MLIR in the middle, TypeScript-native in the
editor**.

### 0.1. The composition chain

The library builds from **composable, extensible primitives**, in this
specific order:

```
Nodes        — the universal substrate (everything is a typed graph node)
   ↓
Types        — semantic value shapes (with representation, codec)
   ↓
Operations   — typed computations over types (with effects, lowerings)
   ↓
Expressions  — typed compositions of operation calls
   ↓
Functions    — named, callable expressions (queries, actions, expr functions)
   ↓
Predicates   — typed boolean claims attached to graph subjects
   ↑           ↑                 ↑                  ↑
   │       Traits            Laws               Rules
   │       (markers          (algebraic         (entity-bound
   │       on any            claims on           business
   │       subject)          operations)         predicates)
   │
   refinements feed back into Types
   (Incident.where(canArchive), Op.where(Associative), Field.where(ClientSafe))
```

Every layer is **inspectable, lowerable, and graph-native**. Each layer
exists _primarily so the layer above it can do what it needs to do_. Types
exist so operations can be typed. Operations exist so expressions can carry
behavior. Expressions exist so functions are inspectable. Functions exist
so predicates can name reusable boolean claims over the graph.

**Traits, laws, and rules should normalize to one primitive —
`PredicateDef` — wearing three names.** This is the target IR, not a
public inheritance model. Authoring APIs stay flavor-specific because
their inference and ergonomics differ; the kernel gets one canonical
predicate shape after normalization. Structurally they all become:

```
Predicate {
  subject:   graph node (anything | operation | entity | field | ...)
  vars:      typed bindings (empty for traits, universally-quantified
             for laws, entity-scoped for rules)
  body:      Expr<boolean>
  assurance: asserted | tested | derived | by_construction | proved
  flavor:    trait | law | rule | ...
}
```

The authoring surface keeps them named so the user's intent is legible:

- **Trait** — marker or simple-body predicate attached to any subject.
  `gen.trait("ClientSafe")` decorates types/fields/projections/providers.
- **Law** — universally-quantified algebraic predicate attached to an
  operation. `Laws.associative(...)` says `forall x y z. f(f(x,y),z) =
f(x,f(y,z))`. Carries assurance levels.
- **Rule** — entity-scoped predicate with named vars and business
  meaning. `gen.rule.for(Invoice, ({field, actor}) => ...)`.

All bodied forms normalize to the same `PredicateDef` node. Marker
traits and marker capabilities remain typed edge applications, not
empty predicates. The same pass family consumes canonical predicates:
the lowerability matrix, refinement (`Subject.where(pred)`),
`app.explain(pred)`, and the derivation table indexed by subject kind.
The compounding effect is _stronger_ once they share IR: refinements
work everywhere (`Operation.where(Associative)`,
`Field.where(ClientSafe)`, `Entity.where(canArchive)`); explain works on
any predicate; laws-drive-lowering (§B3a) and rules-fan-out (§0.2)
become the same table, indexed by subject kind.

**Current implementation checkpoint.** The repo currently has a concrete
`Rule` / `RuleExpr` AST (`src/rules/rules.ts`) and a separate generic
`Predicate` expression type (`src/expression/expr.ts`). Rules lower to
`node.kind.rule` with `trait.rule.predicate`, while
`node.kind.predicate` already exists in the Expr/Rule dialect and most
rule edges accept either kind. The targeted improvement is therefore
not `Rule extends Predicate`; it is a real `lower.rule.toPredicate`
normalization pass that creates canonical predicate facts from the
current rule facade, then migrates downstream passes to read
`PredicateDef` instead of flavor-specific rule shapes.

See §B (predicate IR + authoring surfaces) and Track P (Predicates — the
keystone derivation work).

### 0.1.5. Predicates are like Datomic rules

For readers familiar with Datomic / Datalog: Gen2 predicates (traits,
laws, rules — see §0.1) are **named, declarative, composable boolean
claims over a typed graph** — directly analogous to Datomic rules. The
graph plays the role of the EAV/triple store; entity field references
are the equivalent of `[?e :attr ?v]` patterns; predicate composition
(`expr.and`, `expr.or`, `expr.exists`, `expr.forall`, transitive closure
over relations) is the equivalent of Datalog rule bodies. Rules are the
user-visible flavor of this — entity-scoped predicates authored as
business logic — and the rest of this section is written rule-first
because that is the demo case; the analogy applies to laws and traits
through the same IR.

Three properties carry over from Datomic:

1. **Rules are first-class queryable values**, not callbacks. They have
   stable IDs, can be inspected, diffed, lowered to multiple targets,
   and reused across queries / actions / UI / RLS.
2. **Composition is by reference.** `canManageIncident` calls
   `canViewIncident`; the body of a rule is a typed expression tree that
   references other rules, not a copied predicate.
3. **The same rule answers many questions.** "Can this user view this
   incident?" is the same expression whether it's enforcing RLS, filtering
   a query, disabling a button, or generating an access-matrix doc.

Where Gen2 differs from Datomic: rules don't run inside a Datalog query
engine. They lower to _target-native code_ — SQL, JS, Effect programs,
React conditions — driven by trait/law analysis. The Datalog-like model
is the _authoring surface_; lowering is the _execution surface_.

Keep the vocabulary lanes explicit:

```txt
Facts      = typed graph nodes, edges, expressions, traits, payloads
Rules      = business predicates over domain/runtime values
Patterns   = matchers over Gen2 graph facts
Queries    = runtime data retrieval plans over storage values
Invariants = global requirements checked over pattern matches
Diagnostics = findings when an invariant cannot be proven
Repairs    = candidate GraphPatch values
```

Rules may appear inside runtime queries, but patterns are how the
compiler discovers that relationship. For example:

```txt
ListInvoices usesRule CanViewInvoice
CanViewInvoice readsField Invoice.ownerId
UpdateInvoiceOwner writesField Invoice.ownerId
```

A pattern matches those graph facts; a derivation emits invalidation
facts; an invariant verifies that `CanViewInvoice` is lowerable to every
surface required by `ListInvoices`. This is the bridge between
Datomic-like facts, business rules, database queries, and compiler
diagnostics.

### 0.1.6. Queries + actions + boundaries + typed schema = GraphQL, lifted

For readers familiar with GraphQL: Gen2's query/action/boundary/typed-schema
layer is **GraphQL lifted into a compiler IR**. The shapes line up almost
one-to-one:

| GraphQL                                 | Gen2                                                         |
| --------------------------------------- | ------------------------------------------------------------ |
| Schema (typed fields + relations)       | `Entity` + `Field` + `Relation` graph + `Type` dialect       |
| Query                                   | `app.query("name")((ctx, q) => …)` — typed callable read     |
| Mutation                                | `app.action("name")((ctx, a) => …)` — typed callable write   |
| Subscription                            | `ReactiveResource` / `Stream` + dispatch                     |
| Resolver                                | Action/query body lowered per target                         |
| Selection set                           | `Projection` — typed safe field subset                       |
| Operation (Query/Mutation/Subscription) | `BoundaryCall` — typed crossing of `from`/`to` boundaries    |
| Field-level auth directives             | Rules + Policies attached to Field/Entity/Query              |
| Federation / schema stitching           | `app.module(...)` with imports/exports + composability tests |
| Persisted queries                       | Query node has stable `KeyFamily` + cacheable lowering       |
| Introspection                           | Textual IR + `app.explain` + capability reports              |
| DataLoader / N+1 resolution             | Query planner pass with batched lowering                     |
| `@deprecated`, `@requires`, `@external` | Trait applications on graph nodes                            |
| SDL                                     | Textual IR (Track N) — same role, different format           |

What carries over directly:

1. **Schema as the contract.** Both systems treat the typed schema as the
   source of truth for clients, auth, validation, and codegen.
2. **Operations are first-class.** Both treat queries and mutations as
   named, typed, inspectable units, not anonymous functions.
3. **Selection sets are typed.** Gen2's projections fill the role of
   GraphQL's selection sets — the user picks fields; the compiler narrows
   the result type and checks placement safety.
4. **Auth is part of the type system.** GraphQL puts directives on
   fields; Gen2 puts rules/policies on entities/fields/queries/actions.
   Either way, authorization travels with the schema.

Where Gen2 differs from GraphQL — and these are the wins:

1. **GraphQL is a transport + runtime; Gen2 is a compiler that emits to
   many transports.** A GraphQL server runs queries through resolvers
   over HTTP. Gen2 lowers the _same_ query/action/boundary graph to:
   - HTTP / RPC routes (the GraphQL story)
   - Server actions (Next/Remix/SolidStart-style)
   - tRPC procedures
   - Server-Sent Events / WebSocket subscriptions
   - Outbox + queue + worker (for async actions)
   - Direct database calls (no API layer needed for SSR)
   - **A real GraphQL schema + resolvers** as one target, not the only one.
2. **Schema carries operations and laws.** A GraphQL field is a name,
   type, and resolver. A Gen2 field is a name, type, _operation algebra_,
   _laws_, _traits_, _codecs_, _merge strategy_. That extra information
   is what lets Gen2 derive optimistic updates, IVM, sync plans, and
   target-aware lowerings — things a vanilla GraphQL schema cannot.
3. **Resolvers are derived, not written.** GraphQL resolvers are
   user-authored code; Gen2 query/action bodies are _typed expressions_
   that lower to target-native code. No N+1 problem because the query
   planner sees the full read graph.
4. **The boundary is explicit.** GraphQL implicitly assumes one
   client/server boundary over HTTP. Gen2's `BoundaryCall` is a graph
   node with `from`, `to`, `transport`, `serialization`, `auth`,
   `invalidates`, `optimistic`, `offline` — and supports multi-hop
   chains (`browser → server → outbox → queue → worker → external API`).
5. **Subscriptions are derived from reactivity.** A Gen2 subscription
   is an emergent property of `ReactiveResource` + invalidation edges —
   the user does not author a separate `Subscription` resolver.
6. **GraphQL is a target.** `targets.graphql` lowers the same graph
   to a `.graphql` schema + resolver bindings. So is OpenAPI. So is
   tRPC. The user picks transports without rewriting the API.

Three properties to preserve from the GraphQL ecosystem:

- **Tooling rapport.** The GraphQL community has built strong tooling
  around schema introspection, codegen, and IDE support. Gen2 should
  emit a real GraphQL schema as a first-class target so existing tools
  (Apollo Studio, GraphiQL, generated clients) work out of the box for
  teams that want them.
- **Selection-set discipline.** GraphQL's "ask only for the fields you
  need" pattern translates directly to Gen2 projections. Lead the docs
  with projections, not whole-entity reads, just like good GraphQL APIs
  do.
- **Schema-first auth.** Auth on the schema, not in resolvers. Rules and
  policies are graph edges on fields/entities/queries — visible in the
  schema, not buried in handler code.

### 0.1.7. Behavior is structural — the graph models everything up to execution

A common reflex is to think of a typed graph IR as "good for shape but
weak on behavior." The opposite is true here. **Behavior is modeled
structurally** and travels through the same primitives as everything
else:

- **Operations** carry typed signatures: input types, output type,
  `requirements`, `effects`. That is a behavioral contract, not just a
  name.
- **Expressions** are typed trees of operation calls — composed
  behavior, derivable from structure.
- **Types** carry **traits/laws**: commutativity, associativity,
  idempotence, monotonicity, determinism. That is algebraic behavior
  attached to graph nodes, machine-checkable by passes.
- **Rules** are typed expressions over typed entities — the keystone
  case of behavior captured in expression form.

Concretely, a CRDT merge isn't an opaque runtime concern. It is an
operation `merge: (T, T) → T` on a type carrying the
`commutative + associative + idempotent` traits. A sync engine isn't a
black box. It is a dialect of operations whose `effects` assert
"converges under network reordering." The eleven rule derivations
(§0.2) work _because_ operations + types + traits already express
enough about behavior that lowerings can pick the right artifact
without re-deriving the semantics.

The boundary the graph stops at is not "behavior" — it is **execution**:

| Side              | Lives in           | Examples                                                                                                                  |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Specification** | the graph IR       | type signatures, effects, requirements, laws, expression composition, rule fan-out, dialect lowerings, derived invariants |
| **Execution**     | a runtime / target | Postgres query planner, Jazz sync engine, the JS runtime, CRDT replicas, queue brokers                                    |

This is the same gap TypeScript has with the JS runtime, or SQL DDL
has with a query planner. Specification _proves_ and _emits_; runtime
_executes_. Gen2 sits on the specification side, and that side is
expressive enough to derive the artifacts that drive any runtime we
target. We don't reimplement Postgres — we emit `CREATE POLICY`. We
don't reimplement a sync engine — we emit operations that converge
under its laws.

**Practical consequence: anything that can be specified can be a
dialect, and any dialect composes with every existing derivation.**

- Add a Jazz sync dialect → R-2 emits Jazz row policies, R-9 emits
  Jazz reactive queries, R-11 emits Jazz optimistic mutations, all
  from the rules already in the graph.
- Add a Kafka topic dialect → reactivity (R-8) automatically picks up
  invalidation as topic events.
- Add an analytics-event dialect → audit (R-10) automatically derives
  the event schema from the rule reads.

This is why Gen2 is broader in expressive surface than any specific
local-first / sync / ORM runtime: those products fix one
specification-to-execution mapping. Gen2 keeps the specification
target-agnostic and lets new dialects join without disturbing the
existing eleven derivations. Every architectural decision in this
document — operations as graph nodes (G2), traits/laws on types (G2 /
Track B), expression-tree IR with `kernelExprToSql` semantics
(§3 / Track P §P2), dialect-owned passes (Track E) — is in service
of preserving this property.

**Concrete invariant for every track in this PLAN:** if a feature
cannot be expressed as a typed graph element (node, edge, expression,
trait, pass, lowering, artifact), it doesn't belong in the kernel —
it belongs in a runtime we target. Conversely, if a behavior is
specifiable structurally, it _must_ live in the graph; pushing it into
a `_bridge*` JS-object side channel forfeits the compounding effect.

### 0.1.8. Graph derivation, piping, and patching are first-class

The graph is not just storage for pass results. **Graph transformation
itself is part of the public compiler model.** Passes should not be
opaque functions that happen to return a modified graph; they should be
typed, inspectable derivations that declare:

- the graph facts they read;
- the node/edge/expression patterns they match;
- the typed graph patches they may emit;
- the diagnostics they may emit and the graph/artifact subjects those
  diagnostics can point at;
- the laws/provenance/explanation attached to each emitted fact;
- the semantic diff between input graph and output graph.

The target shape is closer to Datomic's facts + transactions + rules +
history than to "run arbitrary code over an object." We do not need to
copy Datomic's query language literally, but we should preserve the
power: durable facts, typed transactions, replayable patches,
inspectable derivations, and explainable history.

Concretely, a derivation should be definable as data plus typed code:

```ts
const deriveInvalidates = graph
  .derivation("derive.rule.invalidationDependencies")
  .read(ACTION_WRITES_FIELD_EDGE_KIND)
  .read(RULE_READS_EDGE_KIND)
  .read(POLICY_USES_RULE_EDGE_KIND)
  .emit(INVALIDATES_KEY_EDGE_KIND)
  .because("An action writes a field read by a rule guarding a keyed query")
  .run(({ action, rule, key }) =>
    graph.patch.addEdge(INVALIDATES_KEY_EDGE_KIND, {
      mutator: action,
      key,
      provenance: { kind: "derived", rule },
    }),
  );
```

That API sketch is illustrative, not final. The invariant is final:
**derivations produce typed graph patches, not ad-hoc mutation.** The
patch is a first-class artifact that can be verified, previewed,
applied, reverted, explained, serialized, tested, and cached.

Derive, legalize, lower, and emit should share the same pipeline model.
The phase names describe intent, not separate mechanisms:

- **derive** enriches the same dialect graph from existing facts;
- **legalize** proves or repairs graph facts until a target can consume
  them;
- **lower** derives target-dialect graph facts from source-dialect facts;
- **emit** consumes legalized target graph facts and produces external
  artifacts.

This means lowerings are not a separate side-channel concept. A lowering
is a cross-dialect `GraphDerivation`: it reads source dialect facts and
emits target dialect patches. For example, `lower.entity.toPostgres`
reads domain entity/field facts and emits `postgres.table` /
`postgres.column` facts.

Emit can also participate in the graph pipeline. An emit stage takes a
graph as input and returns a graph as output so it can be piped, traced,
cached, and explained like every other stage. The difference is that it
may also produce external artifacts as an explicit effect: files,
schemas, handlers, docs, migration text, IaC plans, generated tests, and
similar outputs. The artifact boundary should be visible in the stage
declaration (`reads`, `emitsArtifacts`, `writesArtifacts`, provenance),
not hidden inside an opaque target function.

Diagnostics also belong in the pipeline model. They are first-class stage
outputs, but they are **not graph mutations by default**. A diagnostic
describes a problem, uncertainty, partial support, failed proof, missing
capability, or legalization blocker about graph facts, patches, pipeline
stages, or emitted artifacts. If the diagnostic can be repaired, it
attaches one or more candidate `GraphPatch` values; applying a repair is
a normal patch step, not hidden diagnostic behavior.

The canonical stage result shape is therefore:

```ts
type GraphStageResult = {
  graph: KernelGraph;
  patches: GraphPatch[];
  diagnostics: DiagnosticFinding[];
  artifacts: Artifact[];
  explanations: Explanation[];
};
```

The clean invariant is:

> Graph is semantic state. `GraphPatch` changes graph state. Diagnostics
> describe graph, pipeline, patch, and artifact state. Repairs are
> patches attached to diagnostics. Artifacts are declared external
> outputs.

The compiler feedback loop should be explicit:

```txt
typed graph facts
  -> invariant instance
  -> diagnostic finding
  -> candidate graph-patch repairs
  -> preview / explain / apply
```

That loop is the product surface for humans and AI agents. A diagnostic
that cannot name the invariant it came from is just a message. A repair
that cannot be previewed as a patch is just advice.

Target shapes:

```ts
type InvariantFamily<Params, Subject> = {
  id: InvariantId;
  title: string;
  params: PayloadSchema<Params>;
  subject: SubjectKind<Subject>;
  diagnose(instance: InvariantInstance<Params, Subject>): DiagnosticFinding[];
};

type DiagnosticDef<Params> = {
  type: DiagnosticTypeRef;
  title: string;
  code: DiagnosticCode;
  severity: Severity;
  messages: {
    user: (p: Params) => string;
    developer: (p: Params) => string;
    agent: (p: Params) => string;
  };
  repair?: (p: Params, ctx: RepairContext) => readonly GraphPatch[];
};

type DiagnosticFinding<Params = unknown> = Diagnostic & {
  definition: DiagnosticDef<Params>;
  invariant?: InvariantInstance<unknown, unknown>;
  params: Params;
};
```

This is an evolution of the current code, not a parallel replacement.
`src/core/diagnostics.ts` already defines the canonical `Diagnostic`
shape (`code`, `message`, `id`, `subject`, `related`, `source`,
`suggestedFixes`, `repairs`, `context`), and
`src/kernel/diagnostic.ts` re-exports it. `DiagnosticDef` is the typed
family layer above that shape.

`DiagnosticFinding` uses the same shared problem envelope as runtime
error instances:

```txt
type      stable documentation/type ref for the diagnostic definition
title     stable short title
code      stable machine code
detail    occurrence-specific explanation
instance  stable ref for this finding / invariant instance
```

The shared envelope is intentional, but the definitions stay separate:

```txt
ErrorDef / ErrorInstance
  runtime/domain value returned by an operation

DiagnosticDef / DiagnosticFinding
  compiler feedback about graph facts, proof obligations, candidate
  patches, or artifacts
```

Example:

```txt
InvariantFamily: CompatibleOperands
Instance: rule canViewInvoice compares User.email with User.id
Diagnostic: rules:type-mismatch
Params: { left: Email, right: UserId, operation: "eq" }
Repairs:
  - use a field with a compatible semantic type
  - insert an explicit conversion/wire boundary
  - change the operation to one declared compatible for these types
```

Diagnostics may be materialized into the graph only when explicitly
requested by an explain/devtool/audit mode. In that mode they are
observability facts about a compiler run, not canonical application
semantics.

This upgrades several existing tracks:

- Track A is not only GraphView/memoization; it also owns typed graph
  query/pattern, patch application, and stage-result primitives.
- Track D's diagnostics become typed stage outputs; diagnostic repairs
  return the same `GraphPatch` shape as derivations.
- Track N's preview/diff/explain surfaces inspect patches, diagnostics,
  artifacts, and derivation declarations together.
- Track M's evolution dialect represents migrations as graph patches,
  not a separate migration format.
- Track F's lowerings and emitters become pipeline stages: lowerings
  emit target graph patches, and emitters consume target graph facts
  while producing declared artifacts.

**Design constraint:** if a pass cannot explain its output as a typed
patch from declared input facts, it is still bridge-era code. Some
target emitters may remain opaque at the execution boundary, but
semantic derivations inside the compiler should be patch-first. If an
emit stage produces artifacts without declaring the graph facts and
artifact kinds it consumes/produces, it is target-era bridge code.

**Execution constraint:** do not broaden this design across many targets
before proving one complete vertical slice. The graph-stage API is the
spine. The first proof should be:

1. define `GraphPatch`;
2. define `GraphDerivation`;
3. define `GraphStageResult`;
4. define `InvariantFamily`, `InvariantInstance`, `DiagnosticDef`, and
   `DiagnosticFinding`;
5. port one existing checker (`rules:type-mismatch` is the recommended
   first candidate) to emit a structured finding from an invariant
   instance;
6. attach one real candidate repair `GraphPatch`;
7. port `derive.rule.invalidationDependencies` to the new shape;
8. make preview/diff/explain show that derivation, diagnostic, repair,
   and resulting semantic diff;
9. lower or emit one real target artifact through the same stage result.

This is the guardrail against "everything is possible" becoming
"everything is half-modeled." New broad target work should wait until
this slice proves the mental model end-to-end.

#### 0.1a. Ultimate DX ladder: typed graph programs, not pass strings

The end-user DX should not ask authors to think in raw pass names,
bridge arrays, or opaque target emitters. The compiler-level surface can
expose primitives like `GraphPatch`, `GraphDerivation`, and
`GraphStageResult`, but the product-level surface should feel like a
typed semantic program whose graph history is inspectable:

```ts
const app = gen.app("OpsDesk", (g) => {
  const Project = g.entity("Project", (t) => ({
    id: t.uuid(),
    status: t.string(),
  }));

  const canViewProject = g.rule.for(Project, ({ field }) =>
    field(Project.fields.status).eq("active"),
  );

  g.policy(Project).allow("read").when(canViewProject);

  g.query("listProjects").from(Project).key(Project).guard("read");

  g.action("archiveProject").update(Project).set(Project.fields.status, "archived");
});

const preview = app.preview();
preview.patches();
preview.artifacts();
preview.explain("archiveProject");
```

That DX comes from five layers landing in order:

1. **Typed vocabulary witnesses.** Node kinds, edge kinds, traits,
   passes, pipelines, lowerings, emitters, artifacts, IDs, diagnostics,
   and repair options should all have typed witness objects. Normal
   authoring passes witnesses, not strings. Strings remain for
   serialization, display, external protocol names, and dynamic parse
   boundaries.
2. **Typed graph patches.** Every authoring mutation, derivation,
   importer, migration, AI edit, diagnostic repair, lowering, and
   artifact-emitting stage should produce the same patch/stage result
   model. If a derivation emits `INVALIDATES_KEY`, the result type
   should preserve that patch union so callers and repairs can inspect
   it without casts.
3. **Pipelines as typed programs.** A pipeline is an inspectable witness,
   not just `string[]`:
   ```ts
   const ReactivityPipeline = definePipeline("reactivity", [
     DeriveRuleReads,
     DeriveActionWrites,
     DeriveInvalidationDependencies,
     EmitTanstackQuery,
   ]);
   ```
   The pipeline witness preserves its literal name, pass tuple, declared
   reads, emitted facts, diagnostics, repair patch unions, explanations,
   and artifact kinds. `gen.preview.pipeline(ReactivityPipeline)` is the
   bridge from current kernel preview to final app preview.
4. **App-level preview/explain/diff.** Once typed pipelines exist,
   public DX moves up a level:
   `app.preview()`, `app.preview(Project)`,
   `app.explain(archiveProject)`,
   `app.explainWhy(archiveProject).invalidates(projectKey)`, and
   `app.diff(before, after)`. These are thin compositions over typed
   pipelines and graph provenance, not a second execution model.
5. **Dialect-owned plugins.** A dialect is the primary typed module
   witness. Each domain/target package owns its graph vocabulary,
   patterns, projections, morphisms, pipelines, diagnostics, repairs,
   capabilities, laws, emitters, artifact declarations, and performance
   boundaries:
   ```ts
   const AuthDialect = defineDialect({
     namespace: "auth",
     dependsOn: [RuleDialect, CallableDialect],
     nodes: { policy: PolicyNodeKind, claim: ClaimNodeKind },
     edges: { policyTargetsEntity: PolicyTargetsEntityEdgeKind },
     morphisms: { deriveGuards: DeriveAuthGuards },
     pipelines: { preview: AuthPreviewPipeline },
     capabilities: [CanExplainAuth],
     laws: [AuthGuardsPreserveServerAuthority],
     lowerings: [PolicyToRls],
   });
   ```
   Dialect registration populates the static meta graph. Pipeline
   execution populates the run meta graph. This lets the system answer
   what a dialect adds, what it depends on, what capabilities/laws it
   claims, what it can emit, and why any derived fact or artifact exists.

The practical sequence is therefore:

1. replace raw pass strings in new APIs with typed pass witnesses;
2. add `definePipeline(...)` with literal tuple inference;
3. let `previewPassPipeline` / `gen.preview.pipeline` accept typed
   pipeline witnesses as well as raw pass names during migration;
4. make derivations declare `reads`, `emits`, `diagnostics`,
   `artifacts`, and `because` in a type-preserving way;
5. enrich `StageResultSummary` with provenance enough for readable
   explanations;
6. add `app.preview(...)` as a thin product API over typed pipelines;
7. add `app.explain(subject)` once provenance can show an honest chain;
8. migrate dialect registration so dialects register typed
   patterns/morphisms/pipelines/capabilities/laws/lowerings directly.

Guiding principle:

> Users declare semantic facts and typed derivations. The compiler turns
> those into an inspectable graph history, not a black-box build.

#### 0.1b. Modeling rule: facts, patterns, morphisms, projections, metadata

The extensibility model is deliberately broad: if users can define their
own type-safe nodes and edges, and can define type-safe projections over
the graph, they can model almost any domain without escaping the kernel.
The boundary stays understandable only if each layer has a clear job:

```txt
Node / edge          = durable semantic fact
Marker               = edge-shaped attachment of a classification kind
                       (trait, capability, assurance) to a subject
Predicate            = bodied boolean claim attached to a graph subject
GraphPattern         = typed source shape over graph facts
GraphMatch           = typed binding of a pattern to one graph instance
GraphProjection      = graph / match -> value
GraphMorphism        = source graph shape -> target graph shape
Derivation           = morphism within the semantic graph
Lowering             = morphism into a target dialect graph
Import               = morphism from external/source dialect into semantics
Emit                 = morphism to an artifact graph plus artifact effect
Patch                = graph transaction
Metadata             = typed payload attached to one fact
Artifact             = external output
Diagnostic           = observation, problem, or repair option
MetaGraph            = graph of dialects, patterns, morphisms, pipelines,
                       diagnostics, patches, artifacts, and provenance
```

> **`Trait` is not a third primitive in this list.** It is an
> authoring family that produces either a marker (when atomic) or a
> predicate (when body-bearing via `.when(...)`). The same is true of
> `Capability` and `Assurance`. The legacy phrasing
> "`Node / edge / trait = durable semantic fact`" was ambiguous —
> markers are edges, bodies are predicates, and the authoring family
> wraps both. See §B3c for the full split.

Use a **typed node** for a durable thing with identity: entity, field,
rule, action, policy, query, route, component, store, provider, table,
migration, deployment resource, capability, or target artifact summary.

Use a **typed edge** for a durable relationship or fact between things:
field belongs to entity, action writes field, rule reads field, policy
guards action, route renders component, query uses key, table stores
entity, migration changes table, resource requires capability.

Use a **typed pattern** for a reusable source graph shape: action writes
field, rule reads the same field, policy uses that rule, query has a key.
Patterns are the missing low-level primitive below projections,
derivations, diagnostics, lowerings, and emitters. They preserve named
bindings, endpoint targets, node/edge witnesses, and typed
`metadata.custom` payloads for the match callback.

Use a **typed projection** for a computed read model over a graph or
match: all actions that affect a query, all client-safe fields for a
route, all target artifacts reachable from an entrypoint, the effective
auth surface, the deployment dependency plan, or the GraphQL/OpenAPI view
of a service surface. Projections may be complex and cached; they do not
automatically mutate the graph.

Use a **typed morphism** when a source graph shape maps to a target graph
shape. A derivation is a morphism inside the semantic graph; a lowering
is a morphism from semantic dialects to target dialects; an importer is a
morphism from an external/source dialect into semantic graph facts; a
migration is a morphism/diff between graph versions; an emitter is a
morphism into an artifact graph plus an external artifact effect.
Morphism registration should also add meta-graph facts describing what
it reads, emits, diagnoses, repairs, and produces.

Use a **typed derivation** when a projection/morphism result should
become durable, cached, explainable, diffable, lowerable, or consumable
by later stages. The derivation declares its input facts, output facts,
diagnostics, artifacts, and explanation, then returns typed `GraphPatch`
values:

```ts
const DeriveInvalidatesKey = defineDerivation({
  name: "derive.rule.invalidationDependencies",
  reads: [ActionWritesField, RuleReadsField, QueryUsesKey],
  emits: [InvalidatesKey],
  because: "actions that write fields read by guarded keyed queries invalidate those keys",
});
```

A lower-level morphism should look like a typed mapping from a pattern to
target facts, with no user-written casts or explicit type arguments:

```ts
const EntityToTable = defineMorphism({
  name: "lower.entity.toPostgresTable",
  from: pattern().node("entity", EntityNode).edge("owns", EntityOwnsField).node("field", FieldNode),
  to: {
    nodes: [PgTableNode, PgColumnNode],
    edges: [PgTableHasColumn],
  },
  map: ({ match, patch }) => [
    patch.addNode(PgTableNode, { name: match.entity.name }),
    patch.addNode(PgColumnNode, { name: match.field.name }),
    patch.addEdge(PgTableHasColumn, {
      table: ref.pgTable(match.entity),
      column: ref.pgColumn(match.field),
    }),
  ],
});
```

The same model describes rule invalidation:

```ts
const RuleInvalidation = defineMorphism({
  name: "derive.rule.invalidationDependencies",
  from: RuleInvalidationPattern,
  to: { edges: [InvalidatesKey] },
  map: ({ match, patch }) =>
    patch.addEdge(InvalidatesKey, {
      mutator: match.action,
      key: match.key,
    }),
});
```

The **meta graph** is how the system inspects its own graph programs.
Registering the examples above should create meta facts like:
`Morphism(lower.entity.toPostgresTable)`,
`ReadsNodeKind(EntityNode)`, `ReadsEdgeKind(EntityOwnsField)`,
`EmitsNodeKind(PgTableNode)`, `EmitsEdgeKind(PgTableHasColumn)`,
`BelongsToDialect(PostgresDialect)`, and
`PartOfPipeline(PostgresPipeline)`. `app.preview`, `app.explain`,
capability reports, devtools, cache invalidation, plugin inspection, and
artifact tracing should query this meta graph instead of reverse
engineering pass code.

Use **typed metadata** only when the data qualifies one fact and should
not become independently addressable graph structure. Good metadata:
display labels, source locations, provenance, confidence, explanation
text, cache keys, hashes, and dialect-owned payloads that belong to that
node/edge. Bad metadata: hidden semantic relationships, IDs of related
nodes, target-lowering inputs, behavior-changing facts, or anything
another pass must structurally query.

Rule of thumb:

> If another pass needs to find it, join on it, explain it, diff it,
> repair it, target-lower it, or attach diagnostics to it, make it a
> typed node, edge, trait, projection, or derivation output. Do not hide
> it in metadata.

This is the answer to "can the graph model anything?" Yes, if the graph
offers typed node/edge extension, typed patterns/matches, typed
projections, typed morphisms, typed patches, a queryable meta graph, and
typed metadata payloads. The design risk is not lack of expressiveness;
it is letting metadata become an untyped semantic side channel or letting
graph programs become opaque callbacks. Keep semantic facts structural,
metadata attached, and graph programs registered as typed witnesses.

Type inference and DX rules for this layer:

- factory-built witnesses first; infer from values, not explicit type
  parameters;
- public kind definitions must never require
  `undefined as unknown as T`. Node, edge, diagnostic, artifact, and
  metadata payloads are declared with schema/payload witnesses, or with a
  fluent `.custom<T>()` type-only helper when no runtime parser is
  needed. Cast-based phantom values are internal implementation only;
- use `const` generics to preserve literal names, binding keys, pass
  names, and artifact kinds;
- pattern binding names become typed callback properties
  (`match.entity`, `match.field`), not string lookups;
- morphism `from` / `to` declarations determine the allowed patch
  builders in `map`;
- expose `$infer` surfaces on patterns, matches, morphisms, projections,
  pipelines, diagnostics, and artifacts;
- raw strings and `unknown` parsing are dynamic boundaries that produce
  diagnostics/candidate patches before becoming trusted witnesses;
- user-authored examples should require no `as`, no explicit type
  arguments, and no manual narrowing in normal flows.

Preferred payload-witness form:

```ts
const InvoiceNode = defineNodeKind({
  id: "billing.node.invoice",
  name: "Invoice",
  custom: payload.struct({
    status: payload.literal("draft", "issued", "paid"),
  }),
});
```

Type-only fallback:

```ts
const InvoiceNode = defineNodeKind({
  id: "billing.node.invoice",
  name: "Invoice",
}).custom<{
  readonly status: "draft" | "issued" | "paid";
}>();
```

Performance rule for this layer:

> Graph programs are declarative enough to be indexed, cached,
> invalidated, and scheduled incrementally. Any pattern/morphism that can
> only run by scanning the whole graph is bridge-era until explicitly
> justified for small graphs or debug tooling.

Performance consequences:

- pattern/morphism declarations must expose read/write dependency keys;
- matches should stream by default and materialize only when requested;
- derived facts need stable IDs, source fact hashes, and producer
  provenance for diffing and invalidation;
- the meta graph is layered into static declarations, run summaries, and
  optional audit/devtool traces;
- artifact emission is content-addressed and source-hash aware;
- type-level performance is part of DX: preserve inference, flatten
  public types, and keep editor feedback useful instead of noisy.

### 0.2. Predicates are the keystone (and rules are the demo case)

**Predicates are the load-bearing top of the composition stack.** A
single predicate — most visibly a rule like `canArchiveUser` — should
drive every one of these derivations:

```
1.  server guard           (always enforced)
2.  RLS / database policy  (when SQL-lowerable)
3.  query predicate        (filter at the source)
4.  UI disabled state      (when client-safe)
5.  form validation        (when applicable to input)
6.  test cases             (truth table over var bindings)
7.  documentation          (access matrix)
8.  reactivity dependency  (predicate reads → action writes → invalidation)
9.  IVM plan               (when monotonic)
10. audit explanation      ("why was this denied?")
11. optimistic enablement  (when can the client preview the result?)
```

Eleven downstream artifacts from one expression. **No other primitive has
that fan-out.** A type fans out to schema/codec/UI; an action fans out to
handler/RLS/mutation; but a predicate is the single object whose
projections touch every layer of the application simultaneously. That is
the core compounding effect of the compiler.

The eleven derivations above are written for the rule case because that
is the highest-fanout subject kind and the most legible demo. The same
table, indexed by subject kind, applies to laws and traits — though with
fewer surfaces firing per predicate because their subjects (operations,
types/fields/projections) participate in fewer layers than entities:

| Subject of predicate     | Typical fan-out                                                |
| ------------------------ | -------------------------------------------------------------- |
| Entity (rule)            | up to 11 (server guard, RLS, SQL, UI, form, test, doc, IVM, …) |
| Operation (law)          | target lowering choice (parallel SQL, IVM, optimistic, retry)  |
| Type/Field (trait)       | placement, codec choice, client/server boundary, redaction     |
| Projection/Query (trait) | streaming/pagination, cache key, UI list shape                 |
| Action (trait)           | dispatch plan, outbox eligibility, optimistic capability       |

Rules win the headline because entities are the busiest subject. The
underlying machinery is the same predicate IR and the same lowerability
matrix. Refinements (`Subject.where(predicate)`) cross all three:
`Op.where(Associative)`, `Field.where(ClientSafe)`,
`Entity.where(canArchive)` are the same construction.

Predicate capability is _downstream_ of operation/type/expression
fidelity:

- If operations lose their algebraic laws → predicates can't drive
  optimistic plans or parallel lowering.
- If types lose `clientSafe` → predicates can't drive UI hints safely.
- If expressions lose `sqlLowerable` → predicates can't lower to RLS.
- If refs into entity fields lose target type → predicates can't be guards.

**Track P below owns this end-to-end story.** Tracks B (operations +
predicate IR), C (witnesses), D (diagnostics), E (passes), G (UI) are
sequenced specifically to make Track P land cleanly. If predicates don't
fan out to the derivations their subject kind enables, the compounding
effect is gone and the library is just codegen.

**Fan-out discipline.** Do not implement the eleven surfaces as eleven
parallel experiments. Predicate work must proceed through vertical
slices:

```txt
predicate fact
  -> invariant checks
  -> lowerability matrix
  -> one target derivation
  -> diagnostics with repair patches
  -> explain / preview / artifact trace
```

The first rule slice should be:

```txt
rule predicate
  -> server guard surface
  -> SQL/RLS lowerability
  -> RLS artifact when legal
  -> structured diagnostic when not legal
  -> access-matrix doc
  -> explain trace from artifact back to predicate
```

Only after that loop works should UI hints, form validation, IVM,
optimistic enablement, and broad reactivity precision expand. The goal
is compounding leverage, not a checklist of disconnected emitters.

---

## 0.5. Scope decisions (hold these lines)

These are decisions, not open questions. Every track must respect them.

1. **Compiler first; AI builder second.** "Gen2" is the compiler IR; the
   "Dirived" AI surface is a thin veneer over textual IR + graph patches +
   structured diagnostics + import/export. If Tracks D/N/M land cleanly,
   the AI features fall out almost for free. The reverse — AI demo over a
   half-built compiler — has been tried elsewhere and rots fast.
2. **Targets emit; Gen2 owns semantics.** Gen2 lowers to existing runtimes
   (Effect, TanStack Query, PowerSync, your code) by default. A thin
   Gen2-native runtime exists only for sync/IVM cases where lowering to an
   existing runtime drops too much information. Every dialect must respect
   this boundary; no dialect grows runtime concerns by default.
3. **Hard kernel stays small.** ~16 primitives. Everything else — Entity,
   Action, Rule, Query, Resource, Stream, Queue, View, Mutation, Event,
   Dispatch, Effect, Plan, Workflow — is a dialect over the kernel. New
   primitive proposals must justify why they cannot be expressed as
   Node/Edge/Type/Expr/Trait/Protocol/Diagnostic/Artifact/Pass.

   **Behavior is structural** (see §0.1.7): operations carry typed
   signatures + effects + requirements; types carry traits/laws
   (commutativity, idempotence, monotonicity, determinism); expressions
   compose typed operation calls. The graph specifies behavior up to
   the execution boundary — runtimes execute, the graph proves and
   emits. If a feature can be specified structurally, it _must_ live
   in the graph; if it cannot, it belongs in a runtime we target, not
   in the kernel. New dialects compose with every existing derivation
   automatically — that compounding is the whole point.

4. **Stdlib partitioning is cosmetic.** Bias toward **fewer, larger
   dialects with sub-namespaces** (`dialect.dataflow.{collection, stream,
queue, resource, variant}`) over dialect proliferation. The
   kernel-vs-stdlib boundary matters; the stdlib-internal partitioning is
   negotiable. The plan lists ~20 dialects for clarity; ship them as 6–8
   dialect packages.
5. **Explain is the product, not the polish.** The reason Gen2 wins over
   scattered codegen is that derivations are auditable. `app.explain(...)`,
   `app.preview(...)`, textual IR, and `app.diff(...)` are not Track-N
   nice-to-haves; they are first-day product surface. Track N items must
   land in parallel with Tracks B/D, not after H.
6. **TypeScript editor output is part of the API.** With ~16 dialects ×
   multiple builder forms × generic accumulators, editor feedback can
   become noisy without active management. `Compute<T>`, branded helpers, and
   `.test-d.ts` assertions should keep public types readable, stable, and
   useful.
7. **Stable IDs are required, not configurable, in production.** Without
   `identity.stableIds: "required"`, every rename becomes drop-and-recreate,
   every snapshot becomes lossy, every AI edit risks data loss. Treat the
   non-required mode as a prototype affordance only.

   Stable IDs should be produced through namespace-bound branded ID
   factories, not user-written casts or string templates:

   ```ts
   const reactivityId = id.createFactory("reactivity");

   const keyFamilyId = reactivityId.node(KEY_FAMILY_NODE_KIND, "OpenIncidents");
   const invalidatesId = reactivityId.edge(
     INVALIDATES_KEY_EDGE_KIND,
     actionNode.ref,
     keyFamily.ref,
   );
   const passId = reactivityId.pass("derive.rule.invalidationDependencies");
   ```

   `id.createFactory(namespace)` captures the namespace as a `const`
   generic. `node(kindWitness, name)` captures the node-kind witness;
   `edge(kindWitness, ...parts)` captures the edge-kind witness; `pass`,
   `expr`, `type`, `artifact`, `morphism`, `pattern`, `pipeline`,
   `surface` (§B3b), `subjectKind` (§B3 / §B3c), `flavor` (§B3c),
   `assurance` (§B3c), `capability` (§B3c), and similar constructors
   brand their respective ID families. The internal implementation may
   cast, but the public API must manufacture IDs from values so normal
   callers never write `as KernelId<...>` or pass raw strings into
   typed slots.

   Dynamic/imported/plugin IDs enter through explicit parsers:

   ```ts
   id.parse.node(KEY_FAMILY_NODE_KIND, raw);
   id.parse.edge(INVALIDATES_KEY_EDGE_KIND, raw);
   ```

   Parsers return diagnostics or candidate graph patches when the raw ID
   does not match the expected namespace/kind shape. Raw strings are a
   serialization boundary, not an internal API shape.

8. **This is a pre-release library. Big breaking changes are explicitly
   allowed.** Backwards-compat shims, gradual migrations, and bridge
   metadata are _not_ required. When a piece of legacy is in the way of
   the correct implementation, **delete it**. When a typed lowering
   helper requires JS objects from `ctx.X[]`, **rewrite the helper to
   take graph nodes/edges**. When a checker still scans
   `passCtx.options.genContext`, **port the check to a graph-native
   pass and delete the spec**, don't wrap it. The two architecture
   tests (`bridge-mutations.test.ts`, `pass-ctx-genctx.test.ts`) exist
   to _cap_ the bridge surface, not to grow it.

   **No new `_bridge*` metadata.** The `_bridgeAction`, `_bridgeRule`,
   `_bridgeQueryFunction`, `_bridgeKeyFamily`, `_bridgeReaction`,
   `_bridgeEntity`, `_bridgePolicy` JS-object side-channels stamped onto
   kernel node `metadata.custom` are transitional shims from the
   pre-Track-R era. **The list does not grow.** New dialect work owns
   its full graph IR — typed payloads on nodes/edges, computed by
   reading graph structure, not by reaching for a JS object cached on
   metadata.

   **No new `ctxCheckerToPass` wraps.** Each remaining legacy check
   spec gets ported to a dialect-owned graph-native pass _or deleted_.
   Wrapping more legacy checks under the bridge is forbidden; that
   path was for the initial split (Track E §1).

   **Compatibility aliases are a smell, not a feature.** The
   `registerBuiltInModuleCheckers`, `clearModuleCheckers`,
   `registerModuleChecker` exports retained for "backwards
   compatibility" should be deleted as their consumers migrate.
   Pre-release means we can break the API surface; the consumers we'd
   break are our own tests and they get rewritten in the same PR.

---

## 1. Where we are vs. where we need to be

### Current state (May 2026, branch `refactor/revised-kernel-rebase`)

Verified by reading `src/` directly — the prior version of this section had
several stale claims. Status as of this revision:

**Done or substantially in place**

- **Hard kernel** in `src/kernel/` covers id, ref, symbol, trait, type, expr,
  edge, node, graph, pass, transform, diagnostic, artifact, ods, dialect,
  scope, law, lower, query, step, builder, bridge, verifier, kind, operations,
  ops-node.
- **`GraphIndex` is implemented** (`src/kernel/graph.ts`). It carries
  `nodesByKind`, `nodesByTrait`, `edgesByKind`, `incidentEdgesByRef`,
  `edgesByKindAndEndpoint`. `indexNode`/`indexEdge`/`unindexNode`/
  `unindexEdge` maintain it incrementally inside `registerNode`/`registerEdge`.
  `nodesOfKind`, `nodesOfKindDef`, `nodesWithTrait`, `edgesOfKind`,
  `edgesOfKindDef`, `edgesFrom`, `edgesTo`, `edgesOfKindAtEndpoint` all use
  index probes — _not_ `Array.from(...).filter(...)`. **The earlier "G1: no
  graph indexes" claim was wrong.**
- **Dialect infrastructure** is live: `defineDialect`, `DialectRegistry`
  with `getDialectForNodeKind`/`getDialectForEdgeKind`/`getDialectForTrait`,
  conflict detection. Active dialects: `dialects/core/{claim, context,
expr-rule, ownership, placement, provider, ref, requirement,
type-operation}`, `dialects/domain/entity-field-relation`,
  `dialects/{auth, callable, reactivity, ui, postgres, target}`.
- **R2 closed for context/requirement/provider/placement/claim** —
  graph-native readers and dual-write bridges; lifecycle checks run
  graph-native through `checkRequirementsOnGraph`, `checkContextAndStorageOnGraph`.
- **`OPERATION_DEF_NODE_KIND` exists** in `dialects/core/type-operation.ts`.
  `opToKernelNode`/`opToKernelEdges` (in `kernel/ops-node.ts`) lower
  `OpSignature` → graph node + `HAS_INPUT_TYPE` / `HAS_OUTPUT_TYPE` edges.
  `defineOp` preserves typed args/output/laws/traits via const generics.
- **Pass pipeline scaffolding**: `PassPhase` already matches the new design
  (`verify-symbols | verify-dialects | derive | canonicalize | legalize |
lower | emit`). `PassRegistry`, `PipelineRegistry`, `BUILT_IN_PASSES`
  constants exist. `KernelPass` declares `reads`/`writes`/`requiresTraits`.
- **Diagnostic primitive**: `Diagnostic` (rich shape) in `kernel/diagnostic.ts`
  with subject/related/source/suggestedFixes. `DIAGNOSTIC_CODES` enumerates
  ~60 stable codes.

**Half-built / forked**

- **Two diagnostic shapes coexist**: `Diagnostic` (rich, in
  `kernel/diagnostic.ts`) vs `PassDiagnostic` (slim,
  `code/severity/message/subject/suggestedFix: string`, in `kernel/pass.ts`).
  Passes return the slim one. `DiagnosticFix` carries source-text edits, not
  graph-patch repairs. No `DiagnosticDef`/`DiagnosticFinding`/`InvariantFamily`
  distinction; no `repair(...)` graph-patch generator.
- **Two artifact shapes coexist**: rich `Artifact` (in `kernel/artifact.ts`)
  vs slim `KernelArtifact` (in `kernel/pass.ts`).
- **Two law shapes coexist**: `LawDef` with `LawWitness` (none/identity/
  inverse/proof/custom) in `kernel/law.ts` _and_ `traits.LAW.*` in
  `kernel/trait.ts`. They are not unified, and neither carries
  `assurance: asserted | derived | tested | by_construction | …`.
- **`transform.ts` still uses `Date.now()` for IDs** and string
  `encode`/`decode` bodies (`kernel/transform.ts:33`). No expr-backed
  transforms, no codec form, no round-trip law witness — exactly the smell
  `more_suggestions.txt` flagged.
- **R13 rolled back**: ~70 legacy `GenContext` arrays are _frozen_ by an
  architecture test (`tests/architecture/genctx-fields.test.ts`); deletion
  paused until dialect passes own each family.
- **Bridge mutation helpers** (`attachNode`, `attachEdge`, `asMutable`
  casting `ReadonlyMap` → `Map`) are still imported by 7 source files:
  `adapters/relational.ts`, `core/{context,contract-kernel,node-lowering}.ts`,
  `kernel/{bridge,builder}.ts`, `lifecycle/lifecycle.ts`. Outside
  `kernel/bridge.ts` and `kernel/builder.ts` they should be a
  `kernel.graph.build((w) => …)` writer instead.
- **`_bridge*` metadata is transitional, not architectural.** Legacy
  binders stamp typed JS objects (`_bridgeRule`, `_bridgeActionFunction`,
  `_bridgeQueryFunction`, `_bridgeKeyFamily`, `_bridgeReaction`,
  `_bridgeEntity`, `_bridgePolicy`) onto kernel node `metadata.custom`
  so dialect-owned passes can recover them without touching `ctx`. ~35
  read sites today; load-bearing for Track P §P6 (predicate-derived
  invalidation) and §P2 (RLS pass) until those passes either walk the
  graph fully or read typed payloads on dialect-owned node kinds. Per
  §0.5 #8, **the list does not grow** — and existing entries retire as
  Track P / Track E lands graph-native dialect IR.
- **Lifecycle is the migration bottleneck**. `lifecycle.ts` is 1,379 lines.
  `builtInCheckPasses()` returns ~60 pass specs that all read legacy
  `ctx.entities`, `ctx.queries`, `ctx.relations`, `ctx.routes`, `ctx.policies`,
  `ctx.reactive_resources`, etc. Each is wrapped via `ctxCheckerToPass`,
  which threads `passCtx.options.genContext as GenContext` — exactly the
  bridge smell that should not survive the rebase. There is no
  `dialect-owned` registration of these passes.

**Not yet started**

- **No `dialect.evolution`**, `dialect.error`, `dialect.observability`,
  `dialect.privacy`, `dialect.fixture`, `dialect.package`, `dialect.merge`,
  `dialect.boundary`, `dialect.queue`, `dialect.stream`, `dialect.dispatch`.
- **No constructor matrix.** Entities, rules, actions, queries, events,
  views, dispatches all expose a single builder shape; no `.class`, no
  curried-name binders, no callback-with-context form, no kit-bound binders.
- **No DX surface**: no `app.preview`, `app.explain`, `app.expand`,
  `app.traceArtifact`, `appGraph.inspect`, `appGraph.diff`,
  `appGraph.capabilities.report`. Keyword grep confirms.
- **No application kits or recipes**: `gen.kit.saas`, `gen.quick.saas`,
  `gen.recipes.*`, `app.module(...)` do not exist.
- **No textual IR**: keyword grep for `textual`, `toMlir`, `toTextualIr`
  finds nothing.
- **TypeScript inference still leaks** through `KernelGraph` (no
  `KernelGraph<TState>` generic), through dialect-registry lookups
  (`getDialectForNodeKind` returns broad `Dialect | undefined`), and
  through register functions (`registerNode`/`registerEdge` return
  un-narrowed `KernelGraph`).
- **GraphView and pass memoization**: not present. `GraphIndex` exists, but
  the layered "GraphStore + GraphIndex + GraphView" architecture stops at
  index. Passes declare `reads`/`writes` but the runner does not consume
  them for caching.
- **Graph shaking** (`prune.reachableArtifacts` from EntrypointTrait): not
  present.

### Target architecture (the "north star" all docs converge on)

```
Authoring API (typed, ergonomic, multi-facade)
        |
        v
Runtime IR (small, serializable: Node, Edge, Type, Expr, Trait, Artifact, Diagnostic)
        |
        v
GraphStore + GraphIndex + GraphView (incremental, indexed, cached)
        |
        v
Pass pipeline (verify -> derive -> canonicalize -> legalize -> lower -> emit)
        |
        v
Legalized target dialect IR -> Targets -> Artifacts
```

Hard kernel = ~16 primitives. Everything else is a **dialect**.
TypeScript proves local composition; passes prove global invariants;
target legalization proves lowerability; runtime decoding validates dynamic
input.

---

## 2. Highest-leverage gaps (in priority order)

These are the deltas between the current code and the design in
`ultimate_final_design.md`, `gen_3_revised_readme.md`,
`revised_phases_new_design.md`, and `gen_dirived_target_architecture_improved.md`.

### G1. GraphView, pass memoization, graph shaking still missing

`GraphIndex` is in place; basic graph-emit passes already work end-to-end
(Track P §P6 ships `derive.rule.invalidationDependencies` against
`registerEdge`). What's left is the **next layer** above the index:

- **`GraphView`**: pass-local materialized views over the indexed graph
  with delta-aware invalidation. Today, dialect passes that need cross-cut
  questions ("what rules read this field?", "what queries are guarded by
  this policy?") rebuild the answer every run. Track P §P6's pass walks
  every node twice per derivation; with three passes ported and ten more
  to go, this starts mattering soon.
- **Pass memoization**: passes already declare `reads`/`writes`, but the
  runner does not key results on a semantic hash of the consumed subgraph.
- **Graph shaking** (`prune.reachableArtifacts` from `EntrypointTrait` /
  public boundaries / UI entrypoints / queue workers): not implemented.
  `EntrypointTrait` exists (Quick Win #6); the prune pass does not.
- **Async pass support**: `lifecycle.ts` rejects async hooks with a
  diagnostic. Real importers, deployment probes, and remote capability
  discovery need it eventually.

**Bug found and fixed during Track P §P6**: the lifecycle runner's
`runPassPipeline` returned a `modifiedGraph` slot but the runner was
discarding it — every pass that emitted derived edges would silently
have its work dropped. Fixed; `ctx.graph` now reflects pass-emitted
edges. Was a latent blocker for every later Track P derivation pass.

### G2. Operations partly graph-native; laws and transforms are forked

`OPERATION_DEF_NODE_KIND` and `opToKernelNode` exist, but:

- There is no separate `dialect.operation` owning the operation vocabulary,
  protocols (`PatchProtocol`, `DeltaProtocol`, `ReducerProtocol`), or laws.
- Laws are split between `kernel/law.ts` (`LawDef` + `LawWitness`) and
  `kernel/trait.ts` (`traits.LAW.*`). One design must win, with assurance
  payloads (`asserted | derived | tested | checked_by_target |
proved_by_solver | by_construction | trusted_target`).
- `kernel/transform.ts` still has `id: \`transform:\${Date.now()}\``and
string`encode`/`decode`bodies — exactly the anti-pattern flagged in`more_suggestions.txt` §2. No codec form, no round-trip law witness.
- The operation builder has only `defineOp(...)` — no `.binary`,
  `.predicate`, `.aggregate`, `.effect`, `.family`, `.opaque`, no callback
  form, no fluent builder.
- Sync, IVM, optimistic updates, offline replay, CRUD derivation, and merge
  planning still cannot ask "what operation did this action apply, and what
  laws does it carry?" through a single graph query.

### G3. TypeScript inference erases at boundaries

`registerNode`/`registerEdge` return broad `KernelGraph` (no `<TState>`
accumulator). `DialectRegistry.getDialectForNodeKind` returns
`Dialect | undefined` — the literal dialect type is gone. `defineEdgeFromKind`
preserves typed witnesses _at construction_, but they collapse on graph
write. No `Compute<T>` simplification at public boundaries. No
`$infer.input/output/error/value/row/values/state` standard surface, no
`InferEntity<>`/`InferInput<>`/`GraphWitnessOf<>` aliases.

### G4. Diagnostics are partly unified but not yet invariant/repair native

The old `Diagnostic` / `PassDiagnostic` fork has mostly collapsed into
one canonical shape (`src/core/diagnostics.ts`, re-exported from
`kernel/diagnostic.ts`). Passes can return rich diagnostics with
deterministic IDs, subject/source/related fields, suggested fixes, and
graph repair slots.

The remaining gap is not "make diagnostics rich"; it is to make them
**semantic and repairable**. Today most checkers still construct ad-hoc
diagnostics directly:

- no `DiagnosticDef` typed schema with params and audience-specific
  messages;
- no `InvariantFamily` / `InvariantInstance` distinction;
- no standard `repair(...)` helper returning candidate `GraphPatch`
  values;
- no `applyFixes({ codes, mode: "candidate" | "apply" })` surface;
- no common proof/failure record tying a diagnostic back to the invariant
  that produced it;
- no standard remediation taxonomy for AI repair loops.

`Artifact` has been improved similarly, but artifact diagnostics still
need the same invariant/repair linkage.

### G5. Targets bypass legalization for runtime/state inputs

Less severe than the previous version of this plan claimed — `src/targets/*`
does **not** read `ctx.entities` / `ctx.queries` / `ctx.actions` directly.
But:

- `src/targets/client.ts` reads `ctx.providers` and `ctx.state_resources`
  directly (lines 37, 65) — provider/state-resource lowerings are not
  legalized.
- `src/adapters/relational.ts` uses `attachNode`/`attachEdge` to push
  postgres `Table`/`Column` nodes directly into the graph instead of going
  through a `legalize.postgres` pass.
- No target dialect IR (`postgres.table`, `react.component_model`,
  `json_render.spec`) exists as a legalized intermediate.

### G15. Lifecycle bridge dominates; no dialect-owned pass registration

This is now the largest single gap. `lifecycle.ts` (1,379 lines) hosts
~60 built-in pass specs that all read `ctx.entities`, `ctx.queries`,
`ctx.routes`, `ctx.policies`, `ctx.reactive_resources`, etc. Each spec is
wrapped through `ctxCheckerToPass`, which forwards
`passCtx.options.genContext as GenContext`. Until dialect-owned passes
read graph views directly, the lifecycle file _is_ the legacy architecture.

The `bridge lower` and `bridge emit` passes also live here and call
`targetContrib.generate(input)` against legacy IR, not legalized target IR.

### G6. UI dialect lacks the AF-UI/JSON-Render split

`src/ui/` and `src/dialects/ui.ts` have view/component nodes, but no
catalog/spec import boundary, no slot-capability typing on behaviors, no
JSON-render emitter. The "AI generates JSON spec, Gen2 verifies, then emits"
loop does not exist yet.

### G7. Higher-level dataflow dialects are absent

No `collection`, `stream`, `queue`, `mailbox`, `variant`, `resource` dialects
as described in `multi-value.txt`. Offline queues and reactive resources
exist as legacy `GenContext` arrays only.

### G8. Authoring facade matrix is uneven

The recommended "object / builder / curried / callback / `.class` / pipe"
facades do not all normalize to one canonical definition. Entity has a
`.class` form; rule/action/query mostly have one form each. No single
fragment-pipe path — `kernel.graph.pipe(User, archiveUser, …)` does not work
end-to-end.

### G9. Legacy `GenContext` arrays still hold semantic state

`refs`, `nodes`, `events`, `reactions` are deleted; the rest are frozen but
present. Until R13 resumes, two parallel sources of truth exist.

### G10. Type-stack layering is collapsed

`semantic.ts` packs name, kind, decoded TS type, storage repr, wire repr,
serializer, server-only flag, traits, enum values, validators, merge strategy
into one runtime object. Final design needs a clean stack:
**Representation → SemanticType → Serializer/Transform → Operation → Expr →
Trait → Law → Implementation**, each as graph-visible nodes/edges/traits.
`server_only` on a type is too coarse — it should be a trait on
field/projection/provider/usage. Branded types (`UserId`) need to be a
first-class graph relation (`TypeBrands`), not a synthesized struct.

The public type surface is also uneven. Built-ins like `gen.types.email()`
infer well, but custom types rely on `custom<T>({ ts_type_name: "..." })`,
which lets the caller accidentally lie about the decoded type. Brands preserve
runtime shape but not strong nominal separation. Function/action/query APIs can
infer from semantic types, but compatibility rules are scattered instead of
living in one graph-visible assignability/lowerability model. Dialects often
need to switch on `name` / `kind` instead of consuming explicit type,
representation, codec, and brand facts.

### G11. No application kits / recipes / modules

The library currently forces users to wire entities, rules, queries, actions,
events, dispatch, reactivity, UI, storage, deployment by hand. There is no
`gen.kit.saas(...)`, no `app.feature(...)`, no `gen.recipes.stateTransitionAction(...)`,
no `app.module("incident", { imports, exports, config })`. Without progressive
disclosure, the library will feel intimidating in the first 15 minutes and
unusable for AI agents that need natural edit boundaries.

### G12. No "show me what I built" DX surface

The compiler will derive a lot. Users will constantly ask _why_ something is
server-only, _why_ this query is invalidated, _why_ this widget was chosen.
There is no `app.preview(x)`, `app.explain(edge, subject)`, `app.expand(recipe)`,
`app.traceArtifact(path)`, `appGraph.inspect()`, `app.diff(prev, current)`,
`appGraph.capabilities.report(...)`. Without these, Gen2 feels like magic
instead of a compiler.

### G13. Missing product-grade dialects

The architecture has no first-class home for:

- **Evolution** (schema versioning, snapshots, migration plans, rename intent,
  compatibility surfaces) — currently a CLI afterthought; should be a dialect.
- **Error** (`ExpectedError`, `Defect`, `RecoverableError`, `ValidationError`,
  `AuthorizationError`, `ConflictError`, `TransportError`, retry policy,
  error surface mapping).
- **Observability** (Metric, TraceSpan, LogEvent, AuditEvent, RuntimeProbe,
  HealthCheck, Slo, Alert, TelemetrySink).
- **Privacy** (PII/PHI/PCI tags, retention, eraseable, consent, redaction,
  audit-required, devtools visibility).
- **Fixture** (typed test fixtures with scenario graphs).
- **Package** (module exports, semantic versioning, compatibility window,
  breakingChanges detection, marketplace contracts).
- **Importers** (JSON-render spec, OpenAPI, Postgres schema, Prisma schema,
  previous Gen2 graph) as peers to emitters.

### G14. No textual IR for AI / review / docs

Graph JSON is fine for tools, but humans and AI agents need an MLIR-style
readable form (`entity Incident { field id: uuid primary; ... }
action acknowledgeIncident { writes Incident.status, ...; }`). This belongs
as a first-class artifact, not a debugging afterthought — it's how reviews,
semantic diffs, AI edits, docs, and migration explanations work.

---

## 2.5. The constructor facade matrix

From `revised_phases_new_design.md` §"Recommended matrix" and the
parallel matrix in `gen_3_transition_agent_instructions.md`. Every
authoring constructor must support the forms marked "yes", and **all of
them must normalize to one canonical definition shape and one
graph-fragment lowering**. Treat this as the public-API contract.

| Constructor                                  | Object |       Builder | Curried | Callback ctx |   `.class` |              Pipe / fragment |
| -------------------------------------------- | -----: | ------------: | ------: | -----------: | ---------: | ---------------------------: |
| `defineDialect`                              |    yes |           yes |     yes |          yes |      maybe |         no / direct registry |
| `defineType`                                 |    yes |           yes |   maybe |       rarely |         no |         maybe as `type(...)` |
| **`definePredicate`** (kernel; bodied only)  |    yes |         maybe |      no |           no |         no |         via flavor factories |
| `defineTrait` / `gen.trait` (→ edge or pred) |    yes |         maybe |      no |        maybe |         no |        maybe as `trait(...)` |
| `defineLaw` / `Laws.*` (→ predicate)         |    yes |            no |     yes |           no |         no |             via `claim(...)` |
| `defineRule` / `gen.rule.for` (→ predicate)  |    yes |           yes |     yes |          yes |      maybe |                          yes |
| `defineCapability` (§B3c; → edge or pred)    |    yes |            no |     yes |        maybe |         no |        via `capability(...)` |
| `defineAssuranceKind` (§B3c; → edge kind)    |    yes |            no |     yes |           no |         no |         via `assurance(...)` |
| `defineLoweringSurface` (§B3b)               |    yes | yes (curried) |     yes |           no |         no | `surface(...)` on a morphism |
| `defineOperation`                            |    yes |           yes |     yes |        maybe |      maybe |                          yes |
| `defineEntity`                               |    yes |           yes |     yes |          yes | **strong** |                          yes |
| `defineAction`                               |    yes |           yes |     yes |          yes |      maybe |                          yes |
| `defineQuery`                                |    yes |           yes |     yes |          yes |      maybe |                          yes |
| `defineEvent`                                |    yes |           yes |     yes |        maybe |   **good** |                          yes |
| `defineDispatch`                             |    yes |           yes |     yes |          yes |      maybe |                          yes |
| `defineView`                                 |    yes |           yes |     yes |          yes |   **good** |                          yes |
| `defineArtifactKind`                         |    yes |           yes |     yes |          yes |      maybe |                           no |
| `emit`                                       |    yes | builder maybe |      no |        maybe |         no |                          yes |
| `edge`                                       |    yes |            no |      no |           no |         no |                          yes |
| `pass`                                       | object |            no |   maybe |          yes |      maybe |                          yes |

**Predicate factory rule (§B3 / Track P).** `definePredicate` is the
kernel-level canonical constructor; the existing `defineTrait`,
`defineLaw`, `defineRule` constructors are preserved as **authoring
surfaces over the same IR**, with `gen.trait`, `Laws.*`, `gen.rule.for`
as the more ergonomic forms. All bodied authoring paths
(`defineTrait(...).when` / `defineLaw` / `defineRule` /
`definePredicate`) **normalize to the same `PredicateDef` graph
fragment** with the matching `flavor` payload. The unification is a
kernel-internal collapse, not a public-API rewrite — existing user code
that calls `defineRule(...)` keeps working unchanged.

**Do not model this as TypeScript inheritance.** A rule is not a subclass
of a predicate. A rule is an entity-scoped authoring facade whose body is
a boolean expression and whose emitted graph view includes a canonical
`PredicateDef` with `flavor: PredicateFlavor.rule`. This keeps the rule
builder free to expose entity-specific helpers (`field`, `actor`,
scoped vars, ownership inference) without forcing every predicate flavor
to inherit those affordances.

Implementation migration contract:

1. Keep the current `Rule` / `RuleExpr` public facade intact.
2. Implement `lower.rule.toPredicate` as a real pass, not a noop:
   - for every `node.kind.rule`, create or update a canonical
     `node.kind.predicate`;
   - copy or point to the same lowered boolean body expression;
   - preserve declared vars, reads, subject, assurance, provenance, and
     `flavor: rule`;
   - emit an explicit `RuleNormalizesToPredicate` edge or equivalent
     provenance edge so explanation can walk from facade to canonical IR.
3. Migrate lowerability, RLS, access-matrix, audit-explanation,
   reactivity, UI, and test-matrix passes to read canonical predicates
   first, with a temporary rule-reader fallback.
4. Retire the fallback only after graph equivalence tests prove the
   canonical predicate path produces the same artifacts and diagnostics.

A facade test in `tests/facades/predicate.test.ts` asserts
byte-identical fragments across the equivalent forms:

```ts
// trait-flavor (all equivalent at the IR level)
defineTrait({ name: "ClientSafe" })
gen.trait("ClientSafe")
gen.trait("ClientSafe").when(() => expr.true())
definePredicate({ flavor: "trait", subject: anySubject, vars: [], body: expr.true() })

// law-flavor (all equivalent at the IR level)
defineLaw({ name: "associative", subject: AddMoney, ... })
Laws.associative(AddMoney, { assurance: "by_construction" })
Laws.forall(AddMoney, (x, y, z) => expr.eq(...))
definePredicate({ flavor: "law", subject: AddMoney, vars: [...], body: ... })

// rule-flavor (all equivalent at the IR level)
defineRule({ name: "canArchive", subject: Incident, ... })
gen.rule.for(Incident, ({field}) => field(...).eq(...))
gen.rule("canArchive")((ctx, r) => r.vars(...).when(...))
definePredicate({ flavor: "rule", subject: Incident, vars: [...], body: ... })
```

The named factories are **separate authoring surfaces with shared IR**:
their TypeScript inference, callback shape, and `$infer` output differ
to match the subject kind, but the kernel node they produce is the same
shape. The legacy `defineTrait` / `defineLaw` / `defineRule` paths must
preserve **every existing inference property** they have today — the
collapse to `Predicate` happens at the node-emission boundary, after
type inference has already narrowed.

Predicate factories must preserve:

- exact subject-kind witness (entity ref / operation ref / typed
  subject) in `$infer.subject`;
- exact `vars` tuple (empty / universal / entity-scoped) in
  `$infer.vars`;
- exact `body` expression type in `$infer.body`;
- exact `assurance` literal in `$infer.assurance`;
- literal `flavor` (`"trait"` | `"law"` | `"rule"`) in `$infer.flavor`;
- **all the witness fields the legacy constructors already exposed**
  (`Trait.ref`, `Law.applies`, `Rule.fragment`, etc.) — the unification
  must not regress editor DX or callsite inference.

`definePredicate` is the low-level escape hatch for dynamic ingestion
(importers, plugin predicates, AI-emitted candidate predicates). It
takes raw `subject | vars | body | assurance | flavor` and returns a
candidate `Predicate` with diagnostics if the subject kind, var
quantification, or body type is wrong. Normal authoring should not need
it.

**Documentation rule**: do not document every form equally. Lead with the
primary style for each constructor:

```
Primary:
  dialect.concept("Name")((ctx, builder) => …)            // for behaviors
  dialect.entity.class("Name", { … })                     // for entities
  dialect.event.class("Name", { … })                      // for events
  dialect.view.class("Name", { … })                       // for views

Simple:
  dialect.concept("Name")({ … })

Advanced:
  dialect.concept().name("Name"). … .done()

Low-level:
  defineConcept.with<Ctx>()(...)
```

**Class semantics rule** (from `gen_3_transition_agent_instructions.md`):

- Prefer `class("Name", spec)` over decorators.
- The object literal must be passed into a generic factory _before_ the
  class is created — not collected via runtime instance scanning.
- TypeScript class inheritance must not imply semantic inheritance unless
  explicitly declared.

**Anti-patterns** (also from the transition guide):

1. Do not implement object/builder/callback/class forms as separate
   semantic systems.
2. Do not rely on decorators as the primary API.
3. Do not infer edge direction from role-name prefixes.
4. Do not store domain objects in `metadata.custom` as the primary
   dependency mechanism.
5. Do not use string IDs in typed APIs when a witness/ref is available.

**Metadata taxonomy.** Metadata is useful, but unconstrained
`metadata.custom` is how bridge state comes back under a new name. Split
metadata into explicit channels:

```ts
type KernelMetadata<Custom, Provenance = unknown> = {
  display?: DisplayMetadata; // title, docs, examples, tags, deprecation
  provenance?: Provenance; // derived by, source facts, confidence, run id
  custom?: Custom; // dialect-owned typed payload only
};
```

Rules:

- `display` is passive documentation and never drives semantic checks.
- `provenance` explains where a fact came from and can be shown by
  preview/explain/audit tooling.
- `custom` is dialect-owned typed payload. Its type comes from the
  node/edge kind witness.
- Cross-dialect semantic facts are nodes/edges, not custom metadata.
- Domain objects are not stored in metadata as a primary dependency
  mechanism.
- If a pass needs to read a value across dialect boundaries, that value
  should graduate to a node/edge/expr/trait or a typed derivation input.

This taxonomy should replace "bag of metadata" APIs over time. Existing
`metadata.title` / `metadata.custom` fields can migrate incrementally, but
new architecture should follow the split.

**Core vs advanced tag policy.** The matrix lists six forms per
constructor; that is a lot of API surface to maintain, document, and
infer through. Tag each "yes" cell as either:

- **core** — must work, must infer cleanly, must have golden tests, must
  preserve the expected editor-facing type facts, and must be in the
  published docs.
- **advanced** — best-effort, may have inference compromises, may be
  documented only in reference material, may be marked `@experimental`.

Suggested core/advanced split for the highest-traffic constructors:

```
defineEntity:        core = .class, callback ctx, pipe       advanced = builder, curried
defineRule / gen.rule.for:
                     core = callback ctx, object, pipe       advanced = builder, curried, .class
defineLaw  / Laws.*: core = curried (e.g. Laws.associative(Op))    advanced = builder, callback
defineTrait / gen.trait:
                     core = object marker, when-callback     advanced = builder, pipe
defineCapability:    core = curried (e.g. defineCapability(Dialect, {...}))    advanced = object
defineAssurance:     core = object with strongerThan witnesses                   advanced = curried
defineLoweringSurface: core = curried builder (forward type inference)
                                                             advanced = object form
defineAction:        core = callback ctx, object, pipe       advanced = builder, curried, .class
defineQuery:         core = callback ctx, object, pipe       advanced = builder, curried, .class
defineOperation:     core = object, curried, kind-specific   advanced = fluent, callback, family, opaque
defineView:          core = .class, object, pipe             advanced = builder, callback, curried
defineEvent:         core = .class, object, pipe             advanced = builder, callback, curried
definePredicate:     core = object (escape hatch only)       advanced = none (use flavor factories)
```

This matrix is enforced by Track K (facade normalization). The current
codebase implements roughly the leftmost column (object form) and nothing
else — closing the **core** subset is the difference between "compiler IR
you can hand-author" and "library a real developer or AI agent enjoys
using". Advanced forms ship over time as the API stabilizes.

---

## 3. Plan: prioritized work tracks

The tracks are ordered so that each one unblocks the next. They roughly map
to the phase plan in `revised_phases_new_design.md`, but reordered to attack
the highest-leverage gaps first.

### Track A — Performance substrate: next layer (GraphView + memoization + shaking)

Maps to **R1 follow-up** in `revised_phases_new_design.md` and `perf.txt`.

`GraphIndex` is already in place (`src/kernel/graph.ts`). The remaining
work is the layers on top:

0. **Typed `GraphPatch` and `GraphDerivation` primitives**:
   - `GraphPatch` is a discriminated union of typed graph updates:
     `addNode`, `addEdge`, `addExpr`, `annotate`, `replaceMetadata`,
     `retract`, and later `rename`.
   - Patch variants must preserve the witness that created them. An
     `addEdge(INVALIDATES_KEY_EDGE_KIND, ...)` patch should infer the
     exact edge kind, endpoint names, endpoint target types, metadata
     custom payload, and emitted patch union. Do not degrade patch
     internals to `KernelEdge` + `string` when a kind witness is
     available.
   - Every patch carries provenance: pass/derivation name, matched
     input facts, confidence, and optional explanation text.
   - `graph.patch.verify(graph, patch)` checks kind ownership,
     endpoint roles, payload type, ref existence, and dialect law
     constraints before application.
   - `graph.patch.apply(graph, patch)` is the durable mutation primitive
     used by new semantic derivation passes.
   - `graph.patch.diff(before, after)` produces the same patch shape so
     user edits, AI edits, imports, and derivations share one change
     model.
   - Patch builders are witness-first:
     ```ts
     graph.patch.addEdge(INVALIDATES_KEY_EDGE_KIND, {
       mutator: actionNode,
       key: keyFamilyNode,
       metadata: { custom: { confidence: "proven" } },
     });
     ```
     This form checks endpoint names, endpoint target kinds, cardinality,
     metadata payload, and patch kind. `graphPatch.addEdge(defineEdge(...))`
     remains an internal/dynamic escape hatch, not the preferred authoring
     API.
1. **Typed graph patterns / queries**:
   - A `GraphPattern` is the lower-level primitive underneath
     projections, derivations, diagnostics, lowerings, emitters, and
     pipelines.
   - A graph program declares the node/edge kinds, traits, expressions,
     metadata payloads, and endpoint roles it consumes.
   - The match callback receives narrowed typed witnesses and payloads,
     not `KernelNode` / `KernelEdge` blobs.
   - Pattern helpers should be witness-first:
     `edge(ACTION_WRITES_FIELD_EDGE_KIND)`,
     `node(ACTION_NODE_KIND)`, `expr(EXPR_KIND)`. Matched facts expose
     named endpoints and typed `metadata.custom` without casts.
   - Binding names use `const` generics and become typed properties on
     `GraphMatch`: `match.action`, `match.field`, `match.rule`, not
     dictionary lookups or manual narrowing.
   - Patterns are inspectable: `reads`, `dependsOn`, cardinality, joins,
     filters, and `explain` are available without running the graph
     program.
   - Patterns compile to indexed `GraphIndex` / `GraphView` lookups, not
     whole-graph scans by default. A pattern that can only run by
     iterating every node/edge is bridge-era unless it is explicitly
     marked as a small-graph/debug-only scan.
   - Pattern declarations must expose dependency keys for caching and
     invalidation: node kinds read, edge kinds read, traits read,
     expression operations read, metadata payloads read, and any
     predicate dependency that affects match results.
   - Match execution supports explicit modes:
     `stream`, `first`, `count`, and `materialize`. Streaming is the
     default for large result sets; materialization/caching is opt-in and
     tied to invalidation keys.
   - Pattern definitions expose `$infer.bindings`, `$infer.reads`,
     `$infer.match`, and `$infer.provenance`.
   - Avoid handing callbacks a wide `KernelGraph` by default. Prefer a
     typed context `{ match, patch, view }`; expose raw `graph` only as an
     explicit escape hatch.
2. **Typed `GraphMorphism` builder**:
   - A `GraphMorphism` is a named, typed, inspectable mapping from a
     source graph shape to a target graph shape.
   - Derivation, lowering, importing, migration planning, and emission
     are specializations of morphism:
     - derivation: semantic graph -> semantic graph patches;
     - lowering: semantic dialect graph -> target dialect graph patches;
     - import: external/source graph -> semantic graph patches;
     - migration: old/new graph diff -> migration graph patches;
     - emit: semantic/target graph -> artifact graph plus external
       artifact effects.
   - The morphism declaration owns `from` pattern(s), `to` graph facts,
     diagnostics, artifacts, repairs, and explanation.
   - The morphism declaration must expose dependency keys and write keys:
     source fact kinds, target fact kinds, metadata payloads, emitted
     artifact kinds, diagnostics, and repair patch kinds.
   - The `map` callback receives typed `GraphMatch` bindings and a patch
     builder narrowed to the declared `to` vocabulary. It should not need
     explicit type arguments or user-written casts.
   - Morphism output must be stable and diffable. Re-running a morphism
     should avoid re-emitting identical facts by using deterministic
     patch IDs / derived fact IDs and semantic hashes of source facts.
   - Derived nodes/edges carry enough provenance to be invalidated:
     producing morphism, source fact IDs, semantic hash, confidence, and
     stale/valid status when applicable.
   - Every morphism exposes `$infer.from`, `$infer.match`, `$infer.to`,
     `$infer.patches`, `$infer.diagnostics`, `$infer.artifacts`,
     `$infer.surface`, and `$infer.explanations`.
   - **Optional `surface` declaration** — see §B3b. When present, the
     morphism advertises a typed public contract that
     `app.predicate.lowerability(...)` / `app.capabilities.report(...)`
     / `app.explain(...)` query. A morphism without a `surface` is
     internal (composable in pipelines, not advertised). A morphism
     with a `surface` is public; its `surface.consumes` constraints
     must be a subset of the morphism's `from` pattern, and its
     `surface.yields` must be a subset of the morphism's `to` facts —
     the type system enforces this so a surface contract cannot lie
     about what the implementation provides.
   - Registering a morphism should materialize meta-graph facts for what
     it reads/emits, which dialect owns it, which pipeline contains it,
     which artifacts it can produce, which diagnostics/repairs it
     may emit, **and which `Surface` (if any) it fulfills**.
   - `defineDerivation(...)` remains as an ergonomic specialization over
     `defineMorphism(...)`, not a separate execution model.
     `defineLoweringSurface(...)`, `defineDerivationSurface(...)`,
     `defineEmitSurface(...)` are the contract-side factories that
     produce `Surface` witnesses attached to morphisms.
3. **`GraphDerivation` builder**:
   - A `GraphDerivation` is a named, typed, inspectable morphism from
     graph facts to graph patches.
   - The builder must be generic and witness-preserving. `read(...)`,
     `emit(...)`, `diagnose(...)`, `artifact(...)`, and `run(...)`
     accumulate literal tuple types instead of collapsing to
     `readonly string[]`.
   - Every derivation exposes a standard `$infer` surface:
     `$infer.reads`, `$infer.emits`, `$infer.patches`,
     `$infer.diagnostics`, `$infer.artifacts`, `$infer.explanations`.
   - Derive, legalize, and lower phases are all `GraphDerivation`
     specializations; lowering is cross-dialect graph derivation.
   - `KernelPass` becomes orchestration over one or more derivations;
     the pass runner accumulates patches, diagnostics, artifacts, and
     explanations.
   - `derive.rule.invalidationDependencies` already ships (§P6) and
     emits real graph edges, but it predates `GraphPattern` /
     `GraphDerivation`. **The next migration target is the rule→RLS
     lowering** (§P2 rule 2, `legalize.predicate.toRlsPolicy`): port it
     to `GraphPattern` + `GraphDerivation` + a typed `LoweringSurface`,
     prove the model end-to-end, then **back-port the invalidation
     pass** to the same shape so both passes share one execution model.
4. **Meta graph for graph-program introspection**:
   - The meta graph is a graph of dialects, node/edge kinds, patterns,
     morphisms, projections, passes, pipelines, diagnostics, repairs,
     patches, artifacts, and provenance.
   - It answers: what produces this fact kind, what depends on this
     field/kind, what pipelines are invalidated by this change, why did
     this artifact change, what dialect owns this morphism, and which
     target facts can this source graph lower into?
   - `app.preview`, `app.explain`, `traceArtifact`, capability reports,
     devtools, plugin inspection, and pass memoization should consume
     meta-graph facts rather than inspecting implementation code.
   - Meta graph facts are observability/program facts; they should not be
     confused with application semantic facts unless explicitly imported
     into an audit/devtool view.
   - The meta graph is layered for performance:
     - static meta graph: dialects, kinds, patterns, morphism
       declarations, pipelines, artifact kinds;
     - run meta graph: pass/morphism runs, produced patches,
       diagnostics, artifacts, timings, cache hits;
     - optional audit/devtool graph: detailed match traces and
       provenance chains.
   - Do not store every match trace in the canonical graph by default.
     Detailed traces are opt-in debug/audit data with explicit retention.
5. **Unified graph stage result**:
   - Every graph pipeline stage returns `GraphStageResult`: graph,
     patches, diagnostics, artifacts, and explanations.
   - `GraphStageResult` should become generic:
     `GraphStageResult<Patches, Diagnostics, Artifacts, Explanations>`.
     A derivation that only emits `INVALIDATES_KEY` patches should expose
     exactly that patch union to callers and diagnostic repairs.
   - Diagnostics are first-class outputs with graph/artifact locations,
     provenance, stable IDs, cache keys, and optional repair patches.
   - Diagnostic repairs should be generic over their patch options:
     `DiagnosticRepair<Patches extends readonly GraphPatch[]>`.
   - Diagnostics do not mutate canonical graph state unless an explicit
     explain/devtool/audit materialization stage converts them into
     observability facts.
   - The runner persists graph/artifact effects consistently and exposes
     the full result to preview/diff/explain before commit.
6. **Typed pipeline witnesses**:
   - Add `definePipeline(name, passes)` as the typed program boundary
     above individual passes/derivations.
   - The witness preserves its literal pipeline name and pass tuple.
     It exposes `$infer.passes`, `$infer.reads`, `$infer.emits`,
     `$infer.patches`, `$infer.diagnostics`, `$infer.artifacts`, and
     `$infer.explanations`.
   - `KernelPass` and `GraphDerivation` witnesses should be accepted
     directly by pipeline definitions; raw pass-name strings are a
     migration/dynamic-ingestion form only.
   - `runPassPipeline`, `previewPassPipeline`, and
     `gen.preview.pipeline` should accept both raw names and typed
     pipeline witnesses while existing registrations migrate.
   - Add `.test-d.ts` coverage proving literal pipeline names, pass
     tuples, emitted artifact kinds, diagnostic repair patch unions, and
     produced patch kinds infer without casts.
7. **Graph pipeline stages for emit**:
   - An emit stage has the same pipeline shape as other stages:
     `Graph -> Graph`, plus declared artifact effects.
   - Emit stages declare `reads`, `requires`, `emitsArtifacts`, and
     provenance so previews can explain why an artifact changed.
   - The returned graph may include artifact summary nodes, emitted-file
     refs, hashes, diagnostics, or provenance edges, but target files are
     still external artifacts, not canonical semantic graph facts.
   - Artifact emission is content-addressed: emitted artifacts have
     stable IDs, content hashes, source fact hashes, and producer
     morphism/pipeline provenance so unchanged output can be skipped and
     preview/diff/explain stays cheap.
8. **Node/edge extension witnesses**:
   - `defineNodeKind` and `defineEdgeKind` are the extension boundary for
     graph vocabulary. They should return factory-built typed witnesses,
     not plain descriptors.
   - Custom payloads are declared with payload/schema witnesses:
     ```ts
     const InvoiceNode = defineNodeKind({
       id: "billing.node.invoice",
       name: "Invoice",
       custom: payload.struct({
         status: payload.literal("draft", "issued", "paid"),
       }),
     });
     ```
     If no runtime parser is needed, use the fluent type-only helper:
     ```ts
     const InvoiceNode = defineNodeKind({
       id: "billing.node.invoice",
       name: "Invoice",
     }).custom<{ readonly status: "draft" | "issued" | "paid" }>();
     ```
     Public APIs must not ask users to write
     `undefined as unknown as T`; that phantom-value cast is allowed only
     inside implementation helpers.
   - Kind witnesses expose `$infer`:
     ```ts
     type Endpoints = typeof INVALIDATES_KEY_EDGE_KIND.$infer.endpoints;
     type Custom = typeof INVALIDATES_KEY_EDGE_KIND.$infer.custom;
     ```
   - Endpoint roles are named properties where possible, not tuple
     positions or role-name prefixes.
   - Extensions should add vocabulary by exporting witnesses from a
     dialect namespace, not by passing raw kind strings around.
9. **Typed dialect namespaces**:
   - A dialect is the primary typed module witness for extension. It
     owns vocabulary, graph programs, capabilities, laws, artifacts, and
     performance boundaries.
   - Dialect declarations should use object-literal namespaces, not
     public arrays, so keys stay friendly and inferable:

     ```ts
     const PostgresDialect = defineDialect({
       namespace: "postgres",
       dependsOn: [DomainDialect, PredicateDialect, AuthDialect],
       nodes: {
         table: defineNodeKind(...),
         column: defineNodeKind(...),
         sqlPredicate: defineNodeKind(...),
         rlsPolicy: defineNodeKind(...),
       },
       edges: {
         tableHasColumn: defineEdgeKind(...),
       },
       morphisms: {
         entityToTable: EntityToTable,                       // internal
         predicateToSqlPredicate: PredicateToSqlPredicate,   // public (surface)
         policyToRls: PolicyToRls,                           // public (surface)
       },
       pipelines: {
         emitSchema: definePipeline("postgres.emitSchema", [
           EntityToTable,
           PolicyToRls,
           EmitSqlSchema,
         ]),
       },
       capabilities: [CanEmitSql, SupportsTransactionalDdl],
       laws: [EmitterDeterministic, LoweringPreservesAuth],
     });
     PostgresDialect.nodes.table;
     PostgresDialect.edges.tableHasColumn;
     PostgresDialect.morphisms.entityToTable;
     PostgresDialect.pipelines.emitSchema;
     PostgresDialect.surfaces.sqlPredicate;        // ← typed surface access
     PostgresDialect.surfaces.rlsPolicy;
     PostgresDialect.id.node(PostgresDialect.nodes.table, "users");
                                                    // ← branded node-instance ID
     PostgresDialect.id.nodeRef(PostgresDialect.nodes.table, "users");
                                                    // ← typed node ref (id + kind witness + dialect brand)
     PostgresDialect.id.edgeRef(PostgresDialect.edges.tableHasColumn, tableRef, columnRef);
     PostgresDialect.emitters.emitSchemaSql;        // ← derived from morphisms with phase: emit
     PostgresDialect.$infer.nodes;
     PostgresDialect.$infer.morphisms;
     PostgresDialect.$infer.surfaces;               // ← typed surface union
     PostgresDialect.$infer.emitters;               // ← typed emit-phase union
     ```

     `PostgresDialect.surfaces` is **derived from
     `morphisms[*].surface`** — it is not a separately declared field
     on `defineDialect`. Same for `emitters` (derived from morphisms
     whose `phase` is `MorphismPhase.emit`). The dialect builder walks
     its registered morphisms, collects those that carry a `surface`
     aspect or an emit phase, and exposes them under typed accessors.
     This keeps the surface/emit contract and its implementation in one
     place (the morphism).

     `PostgresDialect.id` is the **dialect-owned ID factory**, exposing
     paired ID and ref constructors for every shape. Equivalent to
     manually calling `id.createFactory("postgres")` but bound to the
     dialect so authors don't write the namespace twice, and so refs
     are branded with the dialect identity. The same shape works on
     plain ID factories too — `cId = id.createFactory("c")` exposes
     `cId.node(...)`, `cId.nodeRef(...)`, `cId.edge(...)`,
     `cId.edgeRef(...)`. There is no separate `factory.ref.*`
     namespace; ref construction lives on the same factory.

     ```ts
     // Branded against PostgresDialect — cannot accidentally pass a
     // PostgresDialect ref where a SqliteDialect ref is required.
     const tableRef = PostgresDialect.id.nodeRef(PostgresDialect.nodes.table, "users");

     // Dynamic ingestion uses the standalone parse namespace:
     const parsed = ref.parse.node(PostgresDialect.nodes.table, rawId);
     ```

     Cross-dialect identity mixups become type-level errors. Dynamic
     plugin dialects expose the same shape — `dynamicDialect.id.*`
     works once the dialect is loaded; before registration, calling it
     surfaces a typed diagnostic instead of silently constructing a
     stale ref.

   - Every child witness is branded with the dialect namespace so
     `postgres.table` cannot be confused with `sqlite.table`.
   - `dependsOn` is typed and value-based. A morphism's `from` patterns
     must be owned by the dialect itself or by declared dependencies; its
     `to` facts must be owned by the dialect or explicit target
     dependencies.
   - Patch builders inside dialect morphisms are narrowed by the declared
     `to` vocabulary unless the morphism explicitly declares
     cross-dialect outputs.
   - Capabilities and laws are typed facts, not booleans:
     `CanEmitSql`, `SupportsTransactionalDdl`, `EmitterDeterministic`,
     `LoweringPreservesAuth`. They should be queryable through the meta
     graph and usable by planners/diagnostics.
   - Dialect registration populates the static meta graph with owned
     kinds, patterns, morphisms, pipelines, capabilities, laws, and
     artifact kinds. Expensive morphism implementations can be loaded
     lazily when selected by a pipeline.
   - Cache keys should include dialect version/hash, dependency dialect
     versions, morphism ID, read fact hash, and configuration hash.
   - Dynamic/runtime-loaded dialects enter through explicit
     `parseDialect(...)` / `DynamicDialect` boundaries that return
     diagnostics or a narrowed trusted witness. Do not weaken normal
     authoring types for dynamic plugins.
   - Avoid generic explosion: public dialect types should expose
     flattened `$infer` surfaces and branded opaque helpers rather than
     recursively carrying the full dialect object everywhere. Provide
     `AnyDialect` / `DynamicDialect` escape hatches for huge plugin
     graphs, and add type-level performance tests around public dialect
     witnesses.
   - Plugin APIs should accept dialect witnesses and preserve the dialect
     generic. Runtime registry lookup may erase types internally, but the
     public extension surface should stay typed.

10. **`GraphView`**: a lightweight materialized-view abstraction over the
    indexed graph. Pass authors should be able to ask
    ```ts
    ctx.view(reactivity.views.readWriteIndex).actionsWritingFields();
    ```
    instead of recomputing the index from scratch. Views must support
    delta-aware invalidation: when a node/edge is added/removed, only
    views whose `reads` overlap re-materialize.
11. **Pass memoization**: `KernelPass` already declares
    `reads`/`writes`/`requiresTraits`. Wire the runner to cache results
    keyed by the semantic hash of the consumed subgraph
    (`reads × graph slice`). Re-run only when the slice changes. The new
    pattern/morphism dependency keys become the scheduler's unit of
    invalidation. Projection caches should distinguish per-run cache,
    persistent cache, devtool/audit trace cache, and invalidated cache.
    Pipeline scheduling should become incremental: a graph patch
    schedules only morphisms/pipelines whose declared read keys overlap
    the changed fact kinds or provenance dependencies.
12. **Graph shaking** (`prune.reachableArtifacts`): walk from nodes marked
    with `EntrypointTrait` (public boundaries, UI entrypoints, exported
    functions, queue workers, explicit `forceEmit`) and drop unreachable
    nodes/edges/artifacts before emit. Add an `EntrypointTrait` symbol if
    it is missing; today the kernel does not define one.
13. **Async pass support**: extend the runner with `runPipelineAsync`.
    Keep `runPipelineSync` for deterministic local passes. Use the async
    path for importers, deployment probes, and remote capability
    discovery.
14. **Index coverage check**: add a debug assert that every
    `kernel.graph.{registerNode,registerEdge}` call updates `index` with
    matching keys. This guards against future regressions where someone
    writes through `attachNode` and bypasses indexing.

**Exit:** graph transformation is patch-first and inspectable; GraphView
and memoization let chained passes scale; graph shaking makes emit output
match what is actually reachable; the runner supports async hooks behind
a clear boundary.

---

### Track B — Type stack + operations + laws as graph nodes (semantic core)

Maps to **R5** in `revised_phases_new_design.md` plus the type-stack
recommendations in `more_suggestions.txt` §1–6. This is the single most
load-bearing phase.

**B0a. Typed relation accessors on node kinds.** Before the type stack
or predicate IR, the schema-side vocabulary needs one missing piece: a
way to declare "this node kind has these named, typed,
cardinality-aware relations to those node kinds." The pieces already
exist (`defineEdgeKind` with typed endpoints, `Cardinality.*`
witnesses, the domain dialect's `Relation` for entity-entity links),
but they're not composed into a general node-side schema.

`defineNodeKind(...).relations({...})` is the missing layer — a **typed
view over existing edge kinds**, not a new IR primitive. The graph
storage stays edge-shaped; the authoring surface gets a typed accessor
schema.

```ts
const InvoiceNode = defineNodeKind({
  id: billingId.nodeKind("invoice"),
  custom: payload.struct({ status: payload.literal("draft", "issued", "paid") }),
}).relations({
  customer: hasOne(CustomerNode, { via: InvoicePaidByCustomerEdge }),
  lines: hasMany(InvoiceLineNode, { via: InvoiceHasLineEdge, min: 1 }),
  payments: hasMany(PaymentNode, { via: PaymentSettlesInvoiceEdge }).order(
    PaymentNode.fields.settledAt,
    "desc",
  ),
  parent: belongsTo(InvoiceNode, { via: InvoiceParentEdge }).optional(),
  derivedFrom: hasZeroOrOne(QuoteNode, { via: InvoiceDerivedFromQuoteEdge }),
});
```

**Factory family.** Curried so target node kind narrows the option
shape:

```ts
hasOne(Target, opts?)            // exactly 1; .optional() → 0..1
hasZeroOrOne(Target, opts?)      // 0..1 explicit
hasMany(Target, opts?)           // 0..N; { min: 1 } → 1..N
hasRange(Target, { min, max })   // exact range
belongsTo(Target, opts?)         // exactly 1 (FK semantics; alias of hasOne with hints)
```

Each factory returns a `RelationWitness<...>` that preserves source
kind, target kind, cardinality, `via` edge kind, endpoint role, order,
uniqueness, and required-ness in `$infer`. Endpoints can be selected
via callback (better autocomplete) or literal key:

```ts
hasOne(CustomerNode, { via: InvoicePaidByCustomerEdge, endpoint: "customer" });
hasOne(CustomerNode, { via: InvoicePaidByCustomerEdge, endpoint: (e) => e.customer });
```

When the `via` edge has unambiguous endpoints (one node-kind per side,
matching source/target), the `endpoint` argument can be omitted; the
kernel resolves it. Ambiguous edges (e.g. `InvoiceParentEdge` connecting
Invoice→Invoice) require an explicit endpoint selector.

**Auto-derived inverse accessors.** Declaring `Invoice.relations.lines`
auto-registers the inverse on the target node kind. `InvoiceLineNode`
gains `.related.invoice` (typed `KernelNodeRef<Invoice>`) without an
explicit declaration. The inverse cardinality is the dual:
`hasMany` ↔ `belongsTo`, `hasOne` ↔ `hasMany`, etc. The owning side is
the side that _declares_ — `Invoice.relations.lines: hasMany(Line)`
declares Invoice as the owner. Authors can override the inverse
cardinality on the target node if it differs from the dual, but the
default is what most schemas want.

**Type-safe runtime accessors.** Given a `KernelNode<InvoiceNode>`
instance, the runtime exposes the relation schema:

```ts
invoiceNode.related.customer(); // KernelNodeRef<Customer>     (exactly 1)
invoiceNode.related.lines(); // KernelNodeRef<InvoiceLine>[] (1+)
invoiceNode.related.payments(); // KernelNodeRef<Payment>[]    (0+; ordered by settledAt desc)
invoiceNode.related.parent(); // KernelNodeRef<Invoice> | undefined
```

Cardinality bounds flow into the return type — `lines()` returns
`[Line, ...Line[]]` (non-empty tuple) when `min: 1`. The runtime
accessor walks the edge index — no whole-graph scans — and caches per
node where memoization is wired.

**What this buys.**

1. **Free verifiers.** The kernel auto-checks "every Invoice has 1+
   lines" without each dialect writing the verifier. Diagnostics
   reference the relation witness by id, with a structured remediation
   (the missing relation kind).
2. **Pattern shortcuts.** `pattern.from(Invoice).relation("lines")` is
   typed; the match binding is `KernelNodeRef<InvoiceLine>[]`. The
   pattern declarations from §1 become more terse and more readable.
3. **Surface inputs become precise.** `defineLoweringSurface.consumes({
subjects: [Invoice], relations: [Invoice.relations.customer] })`
   lets a surface require a specific relation be present before it
   fires. Type system enforces.
4. **Refinement composition.** `Invoice.where(inv =>
inv.related.lines().every(l => l.field.status.eq("settled")))` —
   relations participate in refinement bodies as typed sources.
5. **Storage lowering becomes deterministic.** Postgres emitters read
   `belongsTo` relations and emit foreign keys; `hasMany` becomes the
   inverse index. JSON-render emitters read relation cardinality to
   pick array vs scalar shape.
6. **Incremental invalidation precision.** A mutation that writes
   `Invoice.lines` invalidates exactly the resources whose patterns
   include `Invoice.relations.lines`. Cardinality bounds give the
   precision the §P6 invalidation derivation needs.
7. **Self-documenting.** `app.explain(InvoiceNode)` walks `.relations`
   and prints the schema. `appGraph.inspect()` surfaces relation
   cardinality on the entity graph view.

**Relationship to the existing domain `Relation` primitive.** The
domain dialect's `Relation` (one*to_one / one_to_many / many_to_many,
integrity modes, FK behavior, cascade rules) **stays**. It is a
\_specialization* of node relations for entity-entity links — it carries
extra payload (integrity, deletion behavior) that doesn't make sense
for generic node-kind relations. The new general `.relations(...)` slot
sits below the domain `Relation`: domain `Relation` can be expressed in
terms of `.relations({ ... })` plus the integrity/FK payload, but
doesn't have to be rewritten in v1. They coexist; the general slot is
_more general_, the domain `Relation` is _more specific_.

**Type-level guarantees.** Relation witnesses must preserve:

- exact source node-kind witness in `$infer.source`;
- exact target node-kind witness in `$infer.target`;
- exact cardinality witness in `$infer.cardinality`;
- exact `via` edge-kind witness in `$infer.via`;
- selected endpoint role (callback or literal key) in `$infer.endpoint`;
- `required: boolean` literal in `$infer.required`;
- order/uniqueness witnesses when set;
- back-reference to the source `NodeKindDef` so cross-relation
  dependencies are typed.

These are what the runtime accessors, verifiers, surfaces, refinement
bodies, and pattern shortcuts read.

**Authoring back-compat.** Existing dialects whose node kinds don't
declare `.relations({...})` keep working — relations is an additive,
optional declaration. Verifiers don't fire when no relation schema is
present. Authors can adopt the schema incrementally; the slice fixture
(Track Z) is the first place to land it for the OpsDesk node kinds.

**B1. Layered type stack.** Split the current monolithic `SemanticType` into
explicit graph-visible layers:

```
Representation  -> physical/wire layout (i64, fixed_bytes(16), text, struct)
SemanticType    -> domain meaning + decoded TS type
Serializer      -> conversion between semantic / storage / wire forms
Transform       -> typed semantic conversions (codecs, brands, refinements)
Operation       -> typed computation over semantic types
Expr            -> operation application tree
Trait           -> semantic claim attached to a graph object
Law             -> behavioral claim about an operation
Implementation  -> target-specific realization
```

Concrete moves:

- Lift `representation.ts` into a dialect (`dialect.type/representation`); keep
  the layer separate from semantic types. Edges:
  `TypeHasStorageRepresentation`, `TypeHasWireRepresentation`.
- Convert `SemanticType.server_only`, `has_serializer`, `merge_strategy`,
  `traits[]`, `validate` into graph facts (trait applications on
  field/projection/provider, edges to Serializer/MergeStrategy/Validator
  nodes). A _type_ is rarely inherently server-only; _fields_, _projections_,
  and _providers_ are.
- Promote branded types to a real `TypeBrands` edge instead of a synthesized
  struct (`UserId -> uuid -> fixed_bytes(16)`).
- Replace `entityToSemanticType()` with explicit witness fields:
  `User.entity`, `User.type`, `User.inputType`, `User.projection(...)`. No
  silent struct synthesis at runtime.
- Redesign `transform.ts` (`src/kernel/transform.ts`): stable IDs (no
  `Date.now()`), expression-backed `encode`/`decode`, codec form
  (`transform.codec(...)`), round-trip law witness, errors, requirements,
  graph representation.

**B1 design target.** Keep the ergonomic `gen.types.*` helpers, but make every
helper normalize through one canonical typed witness builder. The witness should
remain usable anywhere today's `SemanticType<T>` is accepted, and it should also
carry graph facts through `.fragment`.

```ts
const Email = gen.types
  .define("Email")
  .decoded<string>()
  .kind("email")
  .storage(gen.types.repr.text())
  .validator(isEmail)
  .done();

const UserId = gen.types
  .define("UserId")
  .decoded<string>()
  .brands(gen.types.uuid())
  .storage(gen.types.repr.fixedBytes(16))
  .wire(gen.types.string())
  .codec(uuidStringCodec)
  .law((self) => gen.laws.roundTrips(self.codec))
  .done();
```

Rules for this surface:

- The builder manufactures the type parameter; users should not have to pass
  explicit generic arguments on the common path.
- `custom<T>({ ts_type_name })` becomes a compatibility facade over the builder.
  New code should prefer `define(...).decoded(...).validator(...).done()` or an
  equivalent inference-preserving object form.
- Brands are first-class graph edges (`TypeBrands`) and may carry a nominal
  phantom marker so `UserId` and `OrderId` do not silently collapse to
  interchangeable `string` values in typed authoring APIs.
- Validators, codecs, merge strategies, privacy, placement, and UI hints are
  graph facts attached to the type or to a usage site; they are not opaque fields
  on the semantic type object.
- Expected domain failures are semantic values. Add first-class helpers for
  error cases and result values:

```ts
const MoneyErrors = gen.errors.catalog(moneyId.errorCatalog("money"), {
  divideByZero: gen.errors.case(moneyId.error("divideByZero"), {
    type: moneyId.errorType("divide-by-zero"),
    code: moneyId.errorCode("divide_by_zero"),
    title: "Cannot divide by zero",
    detail: ({ right }) => `Expected non-zero denominator, got ${right}.`,
    fields: {
      right: gen.types.money(),
    },
    messages: {
      user: () => "Enter an amount other than zero.",
      developer: ({ right }) => `DivideMoney failed because right was ${right}.`,
      agent: ({ right }) => ({
        reason: "Denominator was zero.",
        evidence: { right },
        suggestions: [
          "Use NonZeroMoney when zero should be impossible.",
          "Handle MoneyErrors.divideByZero when zero is expected.",
        ],
      }),
    },
    remediation: [
      gen.errors.remediation.changeInput("right"),
      gen.errors.remediation.useOperation("money.divide.safe"),
    ],
  }),
});

const DivideMoneyResult = gen.types.result({
  ok: gen.types.money(),
  error: MoneyErrors,
});
```

These helpers normalize to tagged semantic types, not to opaque metadata:

```txt
Result<Ok, Err> =
  | { tag: "ok"; value: Ok }
  | { tag: "err"; error: ErrorInstance<Err> }
```

Error variants are named graph facts with the same shared problem
envelope diagnostics use, plus typed payload fields:

```txt
type      stable documentation/type URI or typed error ref
title     stable human title
code      stable machine code, derived from the error witness
detail    occurrence-specific explanation
instance  occurrence/ref id for this error event
```

They may also carry audience-specific messages, retry/remediation hints,
and target mappings (OpenAPI response, Effect error, HTTP status, form
error, telemetry label).
`Types.result(...)` preserves `Ok` and `Err` in `$infer` so operation
outputs, expression matching, action errors, tests, and generated clients
can narrow without casts.

The definition/instance split mirrors diagnostics:

```txt
ErrorDef       reusable domain/runtime error family
ErrorInstance  concrete value returned through Result.err
DiagnosticDef  reusable compiler diagnostic family
DiagnosticFinding concrete compiler finding
```

Both instances share `type/title/code/detail/instance`, and both
definitions may expose `messages.user`, `messages.developer`, and
`messages.agent`. The difference is what those messages are about:

```txt
Error messages       explain a runtime/domain failure returned by an operation.
Diagnostic messages  explain a compiler/proof/lowering finding.
```

Result errors may carry domain remediation hints such as "change this
input", "retry later", "ask for a different currency", or "use the safe
operation". Only diagnostics carry compiler-only fields like `severity`,
invariant evidence, graph/source locations, suggested code fixes, and
graph-patch repairs.

- Type registries should be the normal domain vocabulary boundary:

```ts
const Types = gen.types.registry({
  UserId,
  Email,
  Money: gen.types.money(),
});

const entity = gen.entity.using(Types);

const User = entity("User", (t) => ({
  id: t.UserId(),
  email: t.Email(),
}));
```

**B1 inference and compatibility target.** Semantic types should be typed
witnesses that compose through functions, expressions, entities, rules, and
dialects without casts:

```ts
const CreateUserInput = gen.types.object({
  email: Types.Email(),
});

const createUser = gen.func.action({
  name: "createUser",
  input_type: CreateUserInput,
  returns: User,
});

type In = InferFunctionInput<typeof createUser>;
// { email: string }

type Out = InferFunctionOutput<typeof createUser>;
// InferEntity<typeof User>
```

Compatibility should be explicit graph data, not duplicated local checks:

```txt
Email assignable to string only through declared display/wire boundaries
UserId brands uuid but is not freely interchangeable with OrderId
Money comparable with Money
Money add Money -> Money
Money add int -> diagnostic unless a conversion operation is declared
Status comparable with Status
Status comparable with string only through explicit cast/wire boundary
```

Dialects consume those facts. A target lowering should read
`TypeHasStorageRepresentation`, `TypeHasWireRepresentation`,
`TypeBrands`, `TypeHasCodec`, and assignability/lowerability edges instead of
switching on raw type names. Failed mapping is a typed diagnostic with a repair
hint, not a fallback to `unknown` or `string`.

**B1a. Cardinality / iterability / order as graph facts.** These are not
ad-hoc query options or UI hints. They are semantic facts that cut across
types, operations, expressions, rules, projections, and target lowering.

Type-level vocabulary should include typed witnesses:

```ts
Cardinality.zero();
Cardinality.one();
Cardinality.zeroOrOne();
Cardinality.many();
Cardinality.range({ min: 0, max: 20 });

Iterable.sync();
Iterable.async();
Iterable.pageable();
Iterable.stream();

Order.none();
Order.by(Invoice.fields.createdAt, "desc");
Order.stable();
Order.total();
Order.partial();

Uniqueness.by(Invoice.fields.id);
Finite.yes();
Sorted.by(Invoice.fields.createdAt, "desc");
Keyed.by(Invoice.fields.id);
```

Graph facts:

```txt
TypeHasCardinality
TypeIsIterable
TypeHasOrder
TypeHasUniqueness
TypeIsFinite
TypeIsSorted
TypeIsKeyed
ExprHasCardinality
ExprHasElementType
ExprHasOrder
ProjectionHasCardinality
ProjectionHasOrder
QueryHasCardinality
QueryHasOrder
QueryIsIterable
```

Design rule:

> Cardinality/order/iterability are graph-visible traits and law
> payloads. Types declare possible shape. Operations declare
> transformations. Expressions infer actual result facts. Rules use them
> for quantifier legality and simplification. Projections expose them for
> pagination, streaming, UI, schemas, and target lowering.

TypeScript DX:

- use factory-built witnesses (`Cardinality.range(...)`,
  `Order.by(field, "desc")`), not string tags;
- preserve exact bounds/order keys in `$infer`;
- use `NoInfer` where secondary arguments like defaults or limits should
  be checked against the source collection rather than widening it;
- keep editor-facing public types readable: `0..20`, `createdAt desc`,
  `pageable`, not a giant recursive collection proof type.

**B2. Operations as nodes.** Promote `OperationDef` to a node kind owned by a
new `dialect.operation`. Keep operation definitions serializable.

- Edge kinds: `OperationAcceptsType`, `OperationReturnsType`,
  `OperationReturnsError`, `OperationRequiresPrecondition`,
  `OperationLowersTo`, `OperationProducesPatch`, `OperationInverse`,
  `ActionAppliesOperation`, `ExprUsesOperation`.
- Preserve the distinction between four failure channels:

| Channel                 | Meaning                                                      | Type shape / graph fact                                     |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Refined input           | Failure is impossible for valid callers                      | `right: Money.where(NonZero)` plus precondition proof       |
| Result output           | Failure is an expected domain value                          | `output: Types.result({ ok, error })`                       |
| Operation error channel | Boundary/runtime failure that caller must handle separately  | `OperationReturnsError` / function `.errors([...])`         |
| Compiler diagnostic     | The graph is incomplete, contradictory, or cannot be lowered | `DiagnosticFinding` from invariant/pass, maybe with repairs |

Hidden partial operations are illegal in the final design. An operation
marked `partial`, or whose implementation calls a known partial op, must have
at least one of:

1. a precondition proving the partial case impossible;
2. a `Result`/`Option`-shaped output that encodes the case as a value;
3. an explicit operation error channel with target mappings.

Otherwise the invariant `NoHiddenPartialOperation` emits a diagnostic with
repairs: add a precondition/refinement, wrap the output in `Types.result`, or
declare a boundary error.

- Replace `ImplementationAst` with a tagged union:
  `{ kind: "expr"; expr: ExprRef } | { kind: "target_ir"; … } | { kind: "opaque"; symbol; blastRadius }`.

**B3. `Predicate` is the unified IR for traits, laws, and rules.**
Traits, laws, and rules are authoring surfaces over one IR node kind.
The kernel ships one `Predicate` primitive; the existing constructors
(`defineTrait`, `defineLaw`, `defineRule`) plus the ergonomic factories
(`gen.trait(...)`, `Laws.*(...)`, `gen.rule.for(...)`) all lower to it,
with different conventions for `subject`, `vars`, `body`, and
`assurance` per flavor. **The unification is additive — every existing
authoring constructor keeps its current TypeScript inference,
typed witnesses, generic accumulators, callback shapes, and `$infer`
surface.** See §0.1 for the conceptual framing, §B8 for the migration
contract, and Track P for the end-to-end derivation story.

```
Predicate<TSubject, TVars, TBody, TAssurance, TFlavor> {
  subject:   TSubject  extends GraphWitness        // typed subject witness
  vars:      TVars     extends VarBindings         // [] | universal | entity-scoped
  body:      TBody     extends Expr<boolean>       // ALWAYS a real body
  assurance: TAssurance extends AssuranceWitness   // branded witness (§B3c)
  flavor:    TFlavor    extends PredicateFlavor    // branded witness (§B3c)
}
```

**Predicates always have a real body.** There is no marker / empty-body
case at the predicate level. Marker-shaped claims — "Field has trait
ClientSafe", "Dialect has capability CanEmitSql", "Predicate has
assurance Tested" — are **edge applications** to kind nodes (§B3c),
not predicates with empty bodies. The kernel's existing
`defineEdgeKind` machinery handles them with full type safety; the
Predicate IR only enters when there's an actual boolean expression to
evaluate.

**No magic strings.** Every slot is a branded witness produced by a
factory, not a string literal. The kernel exposes namespace-bound
registries:

```ts
const predicateId = id.createFactory("predicate");

// Branded flavor witnesses (not the string "trait" / "law" / "rule").
const PredicateFlavor = {
  trait: predicateId.flavor("trait"),
  law: predicateId.flavor("law"),
  rule: predicateId.flavor("rule"),
} as const;

// Branded subject-kind witnesses (not the string "entity" / "operation").
const SubjectKind = {
  type: predicateId.subjectKind("type"),
  field: predicateId.subjectKind("field"),
  operation: predicateId.subjectKind("operation"),
  entity: predicateId.subjectKind("entity"),
  projection: predicateId.subjectKind("projection"),
  query: predicateId.subjectKind("query"),
  action: predicateId.subjectKind("action"),
  dialect: predicateId.subjectKind("dialect"), // see §B3c
  predicate: predicateId.subjectKind("predicate"), // see §B3c
} as const;
```

Both registries are **open** — dialects can extend them
(`SubjectKind.route`, `SubjectKind.deployment`, …) by calling
`predicateId.subjectKind(...)` with a unique namespace. Internal storage
uses a `GraphRef` for serialization; the public API exposes the
branded witness. Comparison is by witness identity, not string match;
unknown subject kinds (from unregistered dialects) surface as typed
diagnostics rather than silent fallback.

Subject is a **typed witness**, not a runtime-erased `GraphRef`. The
generic parameter narrows the refinement constructor
(`Subject.where(pred)` only accepts predicates whose subject witness
matches the subject's witness type), the lowerability projection
(§P3 filters by `pred.$infer.subject` kind), and the explanation
output.

**Flavor is load-bearing, not just a hint.** The three flavors
correspond to structurally different `vars`/`body`/`subject-kind`
profiles, and downstream passes do dispatch on flavor when the
authoring surface is relevant to error messages, editor hints, or
remediation phrasing. Specifically:

- `flavor: PredicateFlavor.trait` → `vars: []`, `body: Expr<boolean>`
  (e.g. `gen.trait("PiiEraseable").when(...)`), subject is any kind.
  **Marker traits (no body) are not predicates — they are edge
  applications to a trait kind node.** See §B3c.
- `flavor: PredicateFlavor.law` → `vars` is a universally-quantified
  tuple over the operation's input types, body is `Expr<boolean>`,
  subject is an operation.
- `flavor: PredicateFlavor.rule` → `vars` is an entity-scoped binding
  tuple, body is `Expr<boolean>`, subject is an entity (or relation).

Dialects can register additional flavors via
`predicateId.flavor("dialect.flavor.foo")` — these are passed through
the same pipeline; only the authoring surface and error phrasing
differ. The three above are what the standard dialects ship.

The kernel does not need to read `flavor` to do its job (the
`vars`/`subject` shape is sufficient), but preserving it through
`$infer` keeps authoring-time error messages legible and gives the
explain surface a stable label.

**Assurance witnesses are an open registry of edge-kind nodes**, not a
closed enum. The seven witnesses that ship with the standard dialects
(`Asserted | Tested | Derived | CheckedByTarget | ProvedBySolver |
ByConstruction | TrustedTarget`) are nodes in the kernel's assurance
vocabulary; predicates attach to one via a typed
`PredicateHasAssurance` edge. The `strongerThan` partial order is a
relation among assurance kind nodes (also edges), not a comparator on
predicates. A formal-verification dialect can register additional
witnesses:

```ts
const CoqProof = defineAssuranceKind({
  id: assuranceId.kind("coq_proof"),
  strongerThan: [ProvedBySolver],
});
const LeanProof = defineAssuranceKind({
  id: assuranceId.kind("lean_proof"),
  strongerThan: [ProvedBySolver],
});
```

The planner reads the partial order when picking aggressive vs
conservative lowerings. Comparison is witness identity, not string
matching; unknown assurance levels surface as typed diagnostics rather
than silent fallback.

Authoring surfaces (the existing constructors are preserved alongside
the ergonomic factories; **each factory produces either an `Edge` or a
`Predicate` depending on whether a body is supplied** — uniform
authoring witness either way, distinct IR per case):

- **Traits** — produce edges in the marker case, predicates with
  `.when(...)`. Authoring forms: `defineTrait({ id, appliesTo })` for
  the explicit-object form (marker); `gen.trait("ClientSafe")` for the
  ergonomic marker (marker → edge kind + attachment helper);
  `gen.trait("PiiEraseable").when((field) =>
field.classify.erase.exists())` for the body form (→ predicate
  referencing the trait kind). Trait targets must be witness-based, not
  strings: `applies_to: string` becomes `appliesTo: TraitTargetConstraint`
  with options like `type.kind("email")`, `domain.nodes.field`,
  `target.hasTrait(traits.clientRenderable)`.
- **Laws** — always produce predicates (laws are always
  universally-quantified algebraic bodies). Authoring forms:
  `defineLaw({ id, subject, body, assurance })` for the explicit form;
  the namespaced factory family `Laws.associative(...)`,
  `Laws.commutative(...)`, `Laws.idempotent(...)`,
  `Laws.identity(...)`, `Laws.inverse(...)`, `Laws.rollbackSafe(...)`,
  etc. for ergonomic use. Common bundles (`Laws.commutativeMonoid`,
  `Laws.deterministic`) expand to typed tuples of laws.
- **Rules** — always produce predicates (rules are always bodied).
  Authoring forms: `defineRule({ id, subject, vars, body })` for the
  explicit form; `gen.rule.for(Entity, ({field, actor, ...}) =>
Expr<bool>)` for the inline scoped-callback form;
  `gen.rule("name")((ctx, r) => r.vars(...).when(...))` for the
  callback-with-context form. All produce identical IR.
- **Capabilities** (§B3c) — produce edge attachments in the marker
  case, predicates with `.when(...)`. `defineCapability(Dialect, { id })`
  is a marker; `.when(...)` upgrades to a guarded capability predicate.
- **Assurances** (§B3c) — always produce edge-kind nodes (assurances
  are markers with a `strongerThan` partial order among kinds).
  `defineAssuranceKind({ id, strongerThan })` registers the kind;
  predicates attach an assurance via `.withAssurance(kind)`.

**Uniform witness across IR shapes.** Every factory returns the same
public witness shape regardless of whether it produces an `Edge` or a
`Predicate`:

```ts
witness.id; // branded ID
witness.ref; // graph ref to the kind/predicate
witness.attachTo(s); // attach (edge) or evaluate (predicate) against subject s
witness.refine(s); // produce a RefinedType (works for both)
witness.$infer; // typed inference surface
```

This is what lets authoring code, refinements, and consumer passes
walk both shapes uniformly without branching on the underlying IR.

Common requirements across all factories:

- **Assurance** is attached to _predicates_ (not edges) via the
  `PredicateHasAssurance` edge to an assurance kind node. The standard
  kinds are `Asserted | Tested | Derived | CheckedByTarget |
ProvedBySolver | ByConstruction | TrustedTarget`. User-authored rules
  default to `Asserted` (server-evaluated) but can claim stronger
  assurance when SMT-checked or property-tested.
- **Factories preserve exact predicate kind, payload, and assurance in
  `$infer`**:

  ```ts
  const identity = Laws.identity("0.00", { assurance: "tested" });
  type Kind = typeof identity.$infer.kind; // "law.identity"
  type Value = typeof identity.$infer.value; // "0.00"
  type Assurance = typeof identity.$infer.assurance; // "tested"

  const clientSafe = gen.trait("ClientSafe");
  type ClientSafeKind = typeof clientSafe.$infer.kind; // "trait.ClientSafe"

  const canArchive = gen.rule.for(Incident, ({ field }) =>
    field(Incident.fields.status).eq("closed"),
  );
  type RuleVars = typeof canArchive.$infer.vars;
  type RuleBody = typeof canArchive.$infer.body;
  ```

- **Common bundles are typed witnesses**:
  ```ts
  laws: Laws.all(
    Laws.commutativeMonoid("0.00", { assurance: "by_construction" }),
    Laws.deterministic({ assurance: "by_construction" }),
  );
  ```
  Bundles expand to exact tuples rather than erasing to `Predicate[]`.

**B3a. Predicates drive target-aware lowering** _(this is the keystone
reason predicates matter, with laws as the most concrete example)_.
Predicates are not metadata; they are the input to a planner that picks
_different code paths_ per target based on which predicates hold. This
is the largest leverage point in the entire compiler. The table below
is written law-first because operation-subject predicates produce the
most legible lowering decisions, but the same machinery routes traits
(placement, codec, redaction) and rules (the eleven derivations in
§0.2):

| Laws present                           | Target lowering                                        |
| -------------------------------------- | ------------------------------------------------------ |
| `Associative + Commutative + Identity` | parallel reduce; tree-aggregate; PG `SUM`              |
| `Associative` only                     | serial fold; SQL window function                       |
| `Idempotent + Deterministic`           | safe to retry; cache result; at-least-once delivery OK |
| not `Idempotent`                       | exactly-once delivery required; outbox needed          |
| `Patchable + Invertible`               | exact optimistic patch + rollback                      |
| `Patchable` only                       | optimistic patch + refetch on failure                  |
| neither                                | broad invalidation only                                |
| `Monotonic`                            | IVM-eligible; incremental view maintenance             |
| `LowerableToSql`                       | inline into query predicate; RLS                       |
| `LowerableToClient`                    | client-side check / UI hint                            |
| `Reversible`                           | backward migration is auto-derivable                   |
| `OrderPreserving`                      | streaming sort; window operator                        |
| `PreservesCardinality`                 | output count equals input count                        |
| `CardinalityLeInput`                   | filter/take/distinct lowerings                         |
| `ImposesOrder`                         | `ORDER BY`, stable list rendering, cursor pagination   |
| `PreservesUniqueness`                  | set semantics; duplicate-safe merge                    |
| `RequiresFiniteInput`                  | legalize reduce/sort/grouping                          |

Each cell of this table is a real compiler decision. The same operation
in the same expression can lower to a parallel SQL aggregate on Postgres,
a streaming reducer on a worker, an optimistic local patch on the client,
or a rollback-on-failure mutation — _driven entirely by which law traits
are present_.

This is why **assurance levels matter as much as the laws themselves**:
a `Laws.associative({ assurance: "asserted" })` claim is OK to use
optimistically but must come with a generated property test;
`by_construction` skips the test; `proved_by_solver` is the strongest.
The planner takes assurance into account when choosing aggressive vs
conservative lowerings.

A new pass — `legalize.operation.targetLowering` — owns this decision.
It produces a `LoweringPlan` node per `(operation × target)` pair with
the chosen path and the laws that justified it. The plan is queryable
via `app.explain(operation.lowering, { target })`.

> **The table above is illustrative, not closed.** Each row is a
> `LoweringSurface` shipped by a built-in dialect (Postgres, React,
> Effect, …). New dialects extend the matrix by registering surfaces;
> no kernel edit is needed. See §B3b.

**B3b. `Surface` — the extensibility primitive for derivations,
lowerings, and emit.** The §B3a table, the §0.2 eleven-derivation
table, and the artifact-emission table all share the same problem in
the wrong direction: they look like closed sets of keys. The fix is
**typed, dialect-owned, queryable surfaces**.

A `Surface` is the **public contract of a morphism**: "for inputs
matching X, this dialect can produce Y, with result shape Z." It is
distinct from:

- **Capabilities** — too coarse: dialect-level boolean claims.
- **Morphisms** — too fine: the actual transformation code.
- **Patterns** — what the morphism consumes; not what it offers.
- **Pipelines** — composition order; orthogonal to "what's available."

Surface is the **introspection-side counterpart to the morphism's
implementation side**, and the unit `app.predicate.lowerability`,
`app.explain`, `app.capabilities.report`, and devtools query.

Phases mirror the existing pass phases:

```
DerivationSurface  semantic graph -> semantic graph patches
LegalizationSurface raw target candidate -> legalized target patches
LoweringSurface    semantic graph    -> target dialect patches
EmitSurface        target dialect    -> external artifact
```

**Form: surface is a declared aspect of a morphism**, not a separate
top-level primitive. One source of truth; can't drift out of sync with
implementation; auto-inherits phase/dialect/reads/emits.

```ts
const PredicateToSqlPredicate = defineMorphism({
  name: postgresId.morphism("lower.predicateToSqlPredicate"),
  phase: MorphismPhase.lower,                       // branded witness
  from: PatternPredicateOnEntityWithSqlLowerable,
  to: { nodes: [PostgresDialect.nodes.sqlPredicate] },

  // Public contract — what the lowerability matrix queries.
  // (Object form shown for compactness; the curried form in §B3b.1
  // is the recommended core API and infers forward types better.)
  surface: defineLoweringSurface({
    id: postgresId.surface("sqlPredicate"),         // branded ID
    consumes: {
      subjects: [SubjectKind.entity, SubjectKind.field],  // branded witnesses
      requires: [SqlLowerable],                            // predicate-witness traits
      forbids:  [ServerOnly],
    },
    yields: PostgresDialect.nodes.sqlPredicate,
    resultShape: payload.struct({
      supported: payload.boolean(),
      reason: payload.optional(payload.string()),
      remediation: payload.optional(RemediationWitness),
      provenance: payload.optional(ProvenanceWitness),
    }),
  }),

  map: ({ match, patch }) => ...,
});
```

A morphism without a surface is **internal** (used in pipelines, not
advertised). A morphism with one is **public** (queryable through the
meta graph). The same morphism can carry one surface only — if multiple
public contracts apply, split the morphism or compose surfaces.

`defineLoweringSurface`, `defineDerivationSurface`, and
`defineEmitSurface` are thin specializations of one
`defineSurface(...)` factory. They differ only in the default phase tag
and the allowed `consumes`/`yields` vocabulary. A facade test asserts
all three normalize to the same `Surface` IR shape.

**Type-level guarantees for surfaces.** Surface witnesses must
preserve:

- exact `id` literal in `$infer.id`;
- exact `consumes.subjectKinds` tuple in `$infer.consumes.subjectKinds`;
- exact `consumes.requires` predicate-witness tuple in
  `$infer.consumes.requires`;
- exact `resultShape` payload type in `$infer.resultShape`;
- back-reference to the morphism witness in `$infer.fulfilledBy`;
- dialect namespace in `$infer.dialect`.

These are what the typed lowerability projection (§P3) reads.

**Surface registry & meta graph.** Registering a dialect populates
meta-graph facts:

```
MetaFact: Dialect(postgres) owns Surface(postgres.surface.sqlPredicate)
MetaFact: Surface(postgres.surface.sqlPredicate) fulfilledBy
          Morphism(postgres.lower.predicateToSqlPredicate)
MetaFact: Surface(postgres.surface.sqlPredicate) consumes
          SubjectKind(entity), SubjectKind(field)
MetaFact: Surface(postgres.surface.sqlPredicate) requires
          PredicateWitness(SqlLowerable)
MetaFact: Surface(postgres.surface.sqlPredicate) yields
          NodeKind(postgres.sqlPredicate)
```

`app.predicate.lowerability(pred)` is a **typed projection** over those
meta facts: filter surfaces whose `subjectKinds` includes `pred.subject`'s
kind and whose `requires` predicates are present on `pred` (or
derivable); narrow the result type to a `Pick<AllSurfaces, MatchingIds>`.

**Standard surfaces ship with built-in dialects.** The §0.2 eleven
derivations become eleven surfaces registered by the
predicate/auth/reactivity/postgres/react dialects. The §B3a lowering
table becomes the surfaces registered by the target dialects. The
artifact emission tables become emit surfaces. Adding a new dialect
(GraphQL, Effect-Atom, ConnectRPC, blockchain) registers new surfaces
without touching the kernel, the predicate IR, or the existing dialects.

**Capability negotiation.** When a target stack is selected
(`targets.negotiate({ desired, targets })`), the negotiator walks
surface declarations rather than reading per-dialect ad-hoc capability
strings. A desired surface that has no registered fulfillment becomes a
typed diagnostic with a list of dialects that could provide it.

**Exit:** the lowerability/derivation/emit matrices are open-extension
typed projections, not closed unions; new dialects extend the surface
of `app.predicate.lowerability` and friends without kernel edits; the
meta graph answers "who can lower this predicate to what?" by walking
registered surfaces, and `app.explain(pred)` includes the surface
provenance for every emitted artifact.

**B3b.1. Surface declarations use branded witnesses + curried
builders.** The §B3b example used object-form for clarity, but the
public API is curried so that forward type inference flows from one
step to the next. `yields` and `resultShape` reference the morphism's
target vocabulary; declaring `consumes` first lets TS narrow the
allowed values for the rest. IDs come from the dialect's ID factory,
not magic strings.

```ts
const postgresId = id.createFactory("postgres");

const PredicateToSqlPredicate = defineMorphism({
  name: postgresId.morphism("lower.predicateToSqlPredicate"),
  phase: MorphismPhase.lower,                 // branded, not "lower"
  from: PredicateOnEntityPattern,
  to: { nodes: [PostgresDialect.nodes.sqlPredicate] },

  surface: defineLoweringSurface
    .id(postgresId.surface("sqlPredicate"))   // branded surface ID
    .consumes({
      subjects: [SubjectKind.entity, SubjectKind.field],  // branded witnesses
      requires: [SqlLowerable],                            // predicate witnesses
      forbids:  [ServerOnly],
    })
    // ↑ after .consumes, the builder knows subject and requirement shapes;
    //   .yields and .resultShape narrow against that context.
    .yields(PostgresDialect.nodes.sqlPredicate)
    .resultShape((p) => p.struct({
      supported: p.boolean(),
      reason:    p.optional(p.string()),
      remediation: p.optional(RemediationWitness),
      provenance:  p.optional(ProvenanceWitness),
    }))
    .done(),

  map: ({ match, patch }) => ...,
});
```

The curried form keeps each step's parameters narrowed by the prior
step. An object-form alias remains for non-forward-flow cases:

```ts
defineLoweringSurface({
  id: postgresId.surface("sqlPredicate"),
  consumes: { subjects: [SubjectKind.entity], requires: [SqlLowerable] },
  yields: PostgresDialect.nodes.sqlPredicate,
  resultShape: SqlPredicateLowerabilityShape,
});
```

The two forms produce byte-identical surface witnesses (facade test
in `tests/facades/surface.test.ts`).

**B3c. Markers are edges; bodies are predicates.** The kernel already
has type-safe edges (`defineEdgeKind`, typed endpoints, typed payload,
dialect-owned vocabulary). Most "decoration" claims — _X has property
Y_ — are atomic relations between two graph nodes. **They are edges,
not predicates.** Only the bodied cases (where a boolean expression
does the work) need the Predicate IR.

The cleaner decomposition:

```
Edge        atomic typed relation between graph nodes
            ├─ Effect application       (Action ──[writes]──> Field)
            ├─ Requirement application  (Action ──[requires]──> Provider)
            ├─ Obligation application   (Rule ──[owes]──> ArtifactKind)
            ├─ Trait application        (Field ──[has-trait]──> ClientSafeKind)
            ├─ Capability application   (Dialect ──[has-capability]──> CanEmitSqlKind)
            └─ Assurance application    (Predicate ──[has-assurance]──> TestedKind)

Predicate   bodied typed claim — body does the work
            ├─ Law                      (subject: Operation; body: algebraic identity)
            ├─ Rule                     (subject: Entity; body: business predicate)
            ├─ Trait with .when(...)    (subject: any; body: condition)
            └─ Capability with body     (subject: Dialect; body: feature gate)

Diagnostic  typed observation + provenance + repair (distinct)
Pattern     typed query returning bindings        (distinct)
Node        typed graph thing with identity
```

The substrate is the existing kernel — no new top-level primitive.
"Labeled relation" is conceptual vocabulary for the _Edge family_; the
kernel calls it `Edge`.

_Trait kinds are edge kinds._ `defineTrait("ClientSafe")` produces a
trait kind (an edge kind in the kernel's vocabulary registry plus a
small attachment helper). `field.hasTrait(ClientSafe)` writes the
attachment edge. No predicate IR is involved for the marker case.

```ts
// Trait kind = edge kind in the dialect's vocabulary.
const ClientSafe = defineTrait({
  id: typeId.trait("ClientSafe"),
  appliesTo: TraitTarget.anyOf(type.kind("email"), domain.nodes.field),
});

// Attachment is an edge application.
User.fields.email.hasTrait(ClientSafe);

// Body-bearing form upgrades to a Predicate.
const PiiEraseable = defineTrait({
  id: typeId.trait("PiiEraseable"),
  appliesTo: domain.nodes.field,
}).when((field) => field.classify.erase.exists()); // ← .when => Predicate
```

`defineTrait` is one factory with two output shapes:

- **Marker form** (no `.when`) — produces an `Edge` attachment to a
  trait kind node. Type witness: `TraitKindWitness<...>`.
- **Body form** (`.when(...)`) — produces a `Predicate` with the trait
  kind referenced. Type witness: `Predicate<Subject, [], Body,
Assurance, PredicateFlavor.trait>`.

Both forms expose the same public witness shape (`.id`, `.appliesTo`,
`.ref`, `.attachTo(subject)`, `.refine(subject)`) so authoring code
doesn't branch on the IR shape.

_Capabilities follow the same rule._ `defineCapability(Dialect)` with
no body produces a capability kind plus an attachment edge from the
dialect. `defineCapability(Dialect).when(...)` produces a
Predicate with `subject: Dialect`.

```ts
// Marker capability — edge from dialect to capability kind.
const CanEmitSql = defineCapability(PostgresDialect, {
  id: postgresId.capability("CanEmitSql"),
});

// Guarded capability — predicate with body.
const SupportsTransactionalDdl = defineCapability(PostgresDialect, {
  id: postgresId.capability("SupportsTransactionalDdl"),
}).when((d) => d.version().gte("16")); // ← .when => Predicate
```

Capability negotiation (`targets.negotiate(...)`) walks both shapes
uniformly: marker capabilities are edge presence checks; guarded
capabilities are predicate evaluations.

_Assurances are edge kinds, always._ Assurances don't carry bodies in
practice — they're epistemic labels attached to predicates with a
`strongerThan` partial order among the labels.

```ts
// Assurance kinds form a partial order via strongerThan edges
// among assurance-kind nodes.
const Asserted        = defineAssuranceKind({ id: assuranceId.kind("asserted") });
const Tested          = defineAssuranceKind({
  id: assuranceId.kind("tested"),
  strongerThan: [Asserted],
});
const ProvedBySolver  = defineAssuranceKind({
  id: assuranceId.kind("proved_by_solver"),
  strongerThan: [Tested],
});

// A predicate carries an assurance via an attachment edge:
//   Predicate ──[has-assurance]──> AssuranceKind
const canArchive = gen.rule.for(Incident, ({field}) => ...);
canArchive.withAssurance(Tested);  // writes the edge
```

The `strongerThan` partial order is itself a relation among assurance
kind nodes — also edges. No predicate machinery; just typed graph
vocabulary.

Dialect-registered assurance witnesses (`CoqProof`, `LeanProof`) are
new kind nodes; their position in the order is set by `strongerThan`
edges. Comparison (`strongerThan(ProvedBySolver, Tested)`) walks the
edge graph, not strings.

_Effects, requirements, obligations are edges._ They were edges
already; the unification doesn't change them. An optional thin
authoring helper layer can normalize the dialect-side vocabulary
(`defineEffect`, `defineRequirement`, `defineObligation` producing
typed `EdgeKind`s with conventional labels), but it's sugar over
`defineEdgeKind` — no new IR.

_Patterns are related but not unified._ A pattern returns
`bindings[]`, not `boolean`. Predicates can use patterns via
quantifiers (`expr.exists(pattern, callback)`); the two share index
machinery but the return type differs.

**One IR per phenomenon, one authoring family.** After §B3c the public
mental model is:

```
Edge       atomic typed relations (covers all marker/application cases)
Predicate  bodied typed claims    (covers all body-bearing cases)
```

The five named factories (`defineTrait`, `defineLaw`, `defineRule`,
`defineCapability`, plus `defineAssuranceKind`) each produce either an
`Edge` or a `Predicate` depending on whether a body is supplied.
`defineLaw` and `defineRule` always produce predicates (laws and rules
are always bodied). `defineTrait` and `defineCapability` produce edges
in the marker case, predicates with `.when(...)`. `defineAssuranceKind`
always produces edge-kind nodes (assurances are always markers in
practice). Every authoring witness exposes a uniform shape
(`.id`, `.ref`, `.attachTo(...)`, `.refine(...)`) regardless of the
underlying IR — consumers can walk either shape through
`app.predicate.lowerability(...)`, `app.explain(...)`, and the meta
graph without branching on representation.

**B4. Operation builder matrix.** All these forms must normalize to one
canonical `OperationDef` and one graph-fragment lowering
(`more_suggestions.txt` §"Recommended operation builder matrix"):

```
gen.operation.define({ … })                      // object form
gen.operation.define("Name")({ … })              // curried name
gen.operation.binary("Name", { … })              // kind-specific
gen.operation.predicate("Name", { … })           //   "
gen.operation.aggregate("Name", { … })           //   "
gen.operation.effect("Name", { … })              //   "
gen.operation.family("numeric", { typeParam: "T", constraint }) // type families
gen.operation.opaque("Name", { reads, lowerability, … })        // escape hatch
```

Operation families are important: `NumericOps.for(Quantity)` instantiates
`add`, `subtract`, `greaterThan`, etc. for a constrained type parameter.

**B5. Operation-aware Expr API.** `expr.call(AddNumber, ...)` is the
canonical way to build expressions; the unchecked variant becomes
`expr.callUnchecked(...)`.

Collection operations must declare law payloads for cardinality,
iterability, and order. Authoring uses the **builder-callback form**
(see §B5a) so `self` is in scope when laws reference it — the object
form is a temporal-deadzone trap (`Block-scoped variable used before
its declaration`) and is rejected at the API surface:

```ts
const Filter = defineOperation(collectionId.op("filter"))
  .input({ source: Types.collection(T), predicate: Predicate(T) })
  .output({ filtered: Types.collection(T) })
  .laws((self) =>
    Laws.all(
      Laws.preservesOrder(self),
      Laws.cardinalityLeInput(self, { of: "source" }),
      Laws.preservesElementType(self),
    ),
  );

const Take = defineOperation(collectionId.op("take"))
  .input({ source: Types.collection(T), n: Types.u32() })
  .output({ taken: Types.collection(T) })
  .laws((self) =>
    Laws.all(
      Laws.preservesOrder(self),
      Laws.cardinalityRangeFromLimit(self, { from: "n" }),
      Laws.requiresFiniteOrPageableInput(self, { of: "source" }),
    ),
  );
```

Expected operation facts:

```txt
map      -> preserves cardinality; preserves order when source order is meaningful
filter   -> cardinality <= input; preserves order
sort     -> preserves cardinality; imposes order
groupBy  -> cardinality <= input; produces keyed collection
distinct -> cardinality <= input; ensures uniqueness
take(n)  -> cardinality <= n; preserves order
flatMap  -> cardinality unknown/many unless mapper declares bounds
first    -> many -> zero_or_one; requires order or marks arbitrary choice
reduce   -> many -> one if nonempty or identity exists; otherwise zero_or_one
exists   -> iterable/queryable -> boolean
forall   -> iterable/queryable -> boolean
```

**B5a. Operation authoring uses a builder with a self-binding law
callback.** The historical object form is unsafe by construction:

```ts
// REJECTED at the API surface — temporal deadzone.
const AddMoney = defineOperation({
  id: moneyId.op("add"),
  input: [Types.money, Types.money],
  output: Types.money,
  laws: [
    Laws.associative(AddMoney).withAssurance(ByConstruction),
    //                ^^^^^^^^ ReferenceError / TS2448:
    //                Block-scoped variable 'AddMoney' used before its declaration
  ],
});
```

The same `AddMoney` symbol cannot be in scope inside the initializer
that produces it. Two-phase mutating workarounds (`AddMoney.addLaws([
...])`) sacrifice immutability and create a window where the witness
is observable without its laws — which the law-driven planner can
read during racy boot sequences. Both shapes are wrong for different
reasons.

The required authoring shape is a **builder with a self-binding
callback for laws**:

```ts
defineOperation(<id>)
  .input(<keyed input record>)
  .output(<keyed output record>)
  .errors(<typed error variant tuple>) // boundary/runtime channel, not domain Result
  .laws((self) => readonly Predicate[] | LawBundle)
  // optional — same callback shape:
  .requires((p) => Expr<boolean>)
  .ensures((p, r) => Expr<boolean>)
  .invariant((p) => Expr<boolean>)
  .lowersTo([Op, Op, ...])
```

Each step returns a typed witness that narrows the next step's input.
By the time `.laws(...)` runs, the operation node has its `id`,
`input`, `output`, and any preconditions/postconditions attached —
`self` is the fully-formed witness, no temporal hazard. The same
property holds for `.requires` / `.ensures` / `.invariant` (their
callbacks take a `ParamScope`, not `self`, but they observe
fully-constructed signatures).

**Type-level guarantees.** The builder must preserve:

- exact `id` literal in `$infer.id`;
- exact input record literal in `$infer.input` (per §B7b keyed I/O);
- exact output record literal in `$infer.output`;
- exact domain result variants when an output is `Types.result(...)`
  (`$infer.output.result.ok`, `$infer.output.result.error`);
- exact operation error tuple in `$infer.errors` for boundary/runtime
  failures declared with `.errors(...)`;
- `self` parameter in `.laws(...)` typed as
  `OperationWitness<ID, In, Out>` with `$infer` populated, so
  wrong-arity bundles like `Laws.associative` over a non-binary op
  fail at the callback boundary;
- exact law tuple type in `$infer.laws` after the callback returns;
- exact precondition / postcondition / invariant tuples in their
  respective `$infer` slots.

**Result and error builder DX.** Expected domain failures should usually
live in the output record:

```ts
const MoneyErrors = gen.errors.catalog(moneyId.errorCatalog("money"), {
  divideByZero: gen.errors.case(moneyId.error("divideByZero"), {
    type: moneyId.errorType("divide-by-zero"),
    code: moneyId.errorCode("divide_by_zero"),
    title: "Cannot divide by zero",
    fields: { right: Types.money() },
  }),
  precisionLoss: gen.errors.case(moneyId.error("precisionLoss"), {
    type: moneyId.errorType("precision-loss"),
    code: moneyId.errorCode("precision_loss"),
    title: "Precision would be lost",
    fields: { maxScale: Types.int() },
  }),
});

const DivideMoney = defineOperation(moneyId.op("divide"))
  .input({ left: Types.money(), right: Types.money() })
  .output({
    result: Types.result({
      ok: Types.money(),
      error: MoneyErrors,
    }),
  });
```

Boundary/runtime failures use `.errors(...)`:

```ts
const ChargeCard = defineOperation(paymentsId.op("chargeCard"))
  .input({ card: Types.ref(Card), amount: Types.money() })
  .output({ receipt: Types.ref(Receipt) })
  .errors([Errors.paymentDeclined(), Errors.gatewayUnavailable()])
  .effects([Effects.network(), Effects.payment()]);
```

This gives authors a clear rule:

```txt
Can the caller handle it as normal domain control flow? Put it in Result.
Should valid callers prove it impossible? Use refinement/precondition.
Is it a boundary/runtime failure? Use .errors(...).
Is it a compiler/proof/lowering problem? Emit a diagnostic.
```

**Object form is not a back-compat target.** Existing `defineOp(...)`
and inline `OPERATIONS` in `kernel/operations.ts` use the legacy
shape; the §B5a builder is the only public authoring path going
forward. The migration sweep covered by §B7d (rolled into §B7b's
keyed-I/O conversion) replaces every internal `defineOp(...)` with
the builder form. Authoring tests assert that the object form fails
at the type level — a new `.test-d.ts` regression case for the
temporal-deadzone scenario.

**Reasoning.** The builder is not stylistic preference — it is the
only shape that combines:

1. immutability (no `addLaws` mutation window);
2. self-reference safety (no temporal deadzone);
3. forward type inference (each step narrows the next);
4. compatibility with §B7b keyed I/O, §B7e preconditions, and
   §B7a identity laws (all of which take `self` or `p`/`r` callbacks
   that depend on fully-typed prior steps).

**B6. Typed first-order logic for expressions and rules.** Rules must be
expressive enough to model real authorization, validation, query
predicates, invariants, and target lowerings. Add first-class,
graph-native logical constructors:

- `expr.exists(EntityOrRelation, callback)`;
- `expr.forall(EntityOrRelation, callback)`;
- `expr.implies(antecedent, consequent)`;
- `expr.iff(left, right)`;
- `expr.not(term)`;
- `expr.and(...terms)`;
- `expr.or(...terms)`;
- typed comparisons and membership (`eq`, `lt`, `lte`, `gt`, `gte`,
  `in`, `oneOf`) where semantic types are compatible.

Quantifiers introduce scoped typed witnesses. `exists(Payment, (p) => …)`
binds `p` to a witness that only exposes `Payment` fields; nested
quantifiers preserve lexical scope and stable graph refs. The callback
must return `Expr<boolean>` / `RuleExpr<boolean>`. `implies`, `iff`,
`and`, `or`, and `not` accept only boolean expressions. Equality and
comparisons require compatible semantic types.

Quantifier legality and simplification use cardinality/iterability facts.
The source of `exists` / `forall` must be iterable, queryable, pageable,
or otherwise target-lowerable. Canonicalization can simplify:

```txt
exists(empty, P)       => false
forall(empty, P)       => true
exists(exactly_one, P) => P(item)
forall(exactly_one, P) => P(item)
exists(zero_or_one, P) => nullable check + predicate
```

Targets that cannot preserve required order/cardinality/iterability
guarantees must emit legalization diagnostics rather than silently
lowering.

The graph IR should include explicit quantifier and connective nodes:

```txt
ExprExists  -> binds variable, source entity/relation, predicate body
ExprForAll  -> binds variable, source entity/relation, predicate body
ExprImplies -> antecedent boolean expr, consequent boolean expr
ExprIff     -> left boolean expr, right boolean expr
```

Canonicalization is graph-morphism based, not hidden helper behavior:

```txt
forall(x, P(x)) => not exists(x, not P(x))
implies(a, b)   => or(not a, b)
iff(a, b)       => and(implies(a, b), implies(b, a))
```

Target lowerings must either prove support or emit diagnostics with
repair/lowering alternatives. SQL targets can lower common
`exists` / `not exists` and implication rewrites; unsupported higher-order
or relation-recursive quantification remains graph IR and fails
legalization for targets that cannot represent it.

Rule-scoped APIs should mirror expression APIs:

```ts
const canApproveInvoice = gen.rule.for(Invoice, (r) =>
  r.implies(
    r.field(Invoice.fields.status).eq("pending"),
    r.exists(Payment, (payment) =>
      r.and(
        payment.field(Payment.fields.invoiceId).eq(r.field(Invoice.fields.id)),
        payment.field(Payment.fields.status).eq("settled"),
      ),
    ),
  ),
);
```

Type-level regressions must prove wrong-owner quantified fields,
non-boolean quantifier bodies, non-boolean implication terms, and
incompatible equality/comparison operands are rejected without casts.

**B7. Migrate built-in operations** (`src/expression/builders.ts`,
`src/operation/*`) onto this model. Today `defineOp` and `OPERATIONS`
exist in `kernel/operations.ts`, but `kernel/ops-node.ts` only emits
input/output type edges — not law/effect/implementation/protocol edges.
Extend `opToKernelEdges` to emit the full operation fact set.

**B7a. Identity / ownership law family.** The current `traits.LAW.*`
vocabulary (`src/kernel/trait.ts:205`) describes what an operation
_does to its inputs_ (`Associative`, `Idempotent`, `Deterministic`,
`Reversible`, `Monotonic`, `ParallelSafe`, `RollbackSafe`,
`Identity`, `Inverse`). It does **not** describe what an operation
_owns_ — and that gap shows up specifically for operations that take
a ref and return a ref. `(c: Ref<Customer>) → Ref<Customer>` could
return the same identity, a different existing one, or a fresh one;
the signature alone cannot tell them apart. For actions on entities
the existing `ActionWritesField` / `ActionReadsField` edges cover
field-granular mutation tracking; for pure operations over semantic
values the question doesn't apply (values are immutable in the IR).
The ref-in / ref-out case is the missing slice.

Add to `traits.LAW.*` (additive vocabulary; operations are nodes,
laws are typed traits — no kernel-IR change):

```ts
RETURNS_SAME_IDENTITY: defineTrait<{ assurance: Assurance; of: string }>(
  "trait.law.returnsSameIdentity",
  "Returns same identity",
  "node",
);
RETURNS_FRESH_IDENTITY: defineTrait<{ assurance: Assurance; of: string }>(
  "trait.law.returnsFreshIdentity",
  "Returns fresh identity",
  "node",
);
CONSUMES_INPUT: defineTrait<{ assurance: Assurance; of: string }>(
  "trait.law.consumesInput",
  "Consumes input (linear)",
  "node",
);
BORROWS_INPUT: defineTrait<{ assurance: Assurance; of: string }>(
  "trait.law.borrowsInput",
  "Borrows input (read-only)",
  "node",
);
ALIASES: defineTrait<{ assurance: Assurance; outputs: readonly string[]; from: string }>(
  "trait.law.aliases",
  "Output aliases named inputs",
  "node",
);
```

The `of: string` payload names the input/output **key** the law
refers to — keys come from the operation's keyed I/O record (§B7b)
and are required by the §B5a builder. There is no positional
fallback: positional ops are converted by the §B7d migration sweep
before identity laws can be attached. `ALIASES` carries the set of
output keys that share identity with a named input, e.g.
`{ outputs: ["head"], from: "source" }`.

Ergonomic factories under the existing `Laws.*` family:

```ts
Laws.returnsSameIdentity(Op, { of: 0 });
Laws.returnsFreshIdentity(Op);
Laws.consumesInput(Op, { of: 0 });
Laws.borrowsInput(Op, { of: 0 });
Laws.aliases(Op, { outputs: [0], from: 0 });
```

Each is a thin wrapper that emits a typed predicate (per §B3
unification) referencing the new law trait. Authoring DX matches the
existing ergonomic factories; `withAssurance(...)` works the same.

What this unlocks at the lowering planner (§B3a extension):

| Law present              | Lowering / planning consequence                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `RETURNS_SAME_IDENTITY`  | Postgres `UPDATE` (not `INSERT`); cache patch in place; React `useMemo` keyed by stable id |
| `RETURNS_FRESH_IDENTITY` | Postgres `INSERT`; cache gets a new key; client refetch by new id                          |
| `BORROWS_INPUT`          | Safe to call concurrently with reads of input; no write barrier needed                     |
| `CONSUMES_INPUT`         | Planner / type system rejects double-use; outbox marks input retired                       |
| `ALIASES`                | Reactivity invalidates aliased outputs together; cache key derives from input              |

**Verifier responsibilities.** A new dialect-owned pass walks the
operation graph and:

1. Rejects ops whose body returns a ref id incompatible with the
   declared identity law (`RETURNS_SAME_IDENTITY` claimed but body
   allocates fresh).
2. Tracks linear use of `CONSUMES_INPUT` refs across an expression
   tree; flags double-use with a typed diagnostic and an automatic
   repair patch (split into two derived refs, or move the second use
   before the consume).
3. Cross-checks `BORROWS_INPUT` against any `ActionWritesField` edges
   on the same ref's entity within the surrounding action's effect
   scope; concurrent borrow + write is a typed legalization error.

**Backwards compat.** Existing operations that don't declare any
identity/ownership law default to `RETURNS_FRESH_IDENTITY` for
ref-returning ops (the conservative assumption the planner uses
today implicitly) and "no claim" for value-returning ops. Authors
opt in; nothing breaks.

**Status:** not implemented. Tracked here so the doc'd vocabulary in
`GETTING_STARTED.md` §7.1 has a single source of truth and lands
when the law family ships.

**B7b. Keyed input/output as the canonical authoring form for
ref-typed operations.** §B7a defines the law vocabulary; this item
defines the **authoring surface** that auto-derives those laws from
the operation's I/O type instead of asking authors to write
numeric-index `{ of: number }` annotations. The IR shape stays identical;
the surface gets cleaner and harder to drift.

**Authoring shape.** Today `OpSignature.args` is
`readonly KernelType[]` (positional). Promote a parallel keyed form:

```ts
export interface KeyedOpSignature<
  Id extends string = string,
  In extends Record<string, KernelType> = Record<string, KernelType>,
  Out extends Record<string, KernelType> = Record<string, KernelType>,
  Traits extends readonly TraitDef[] = readonly TraitDef[],
> {
  readonly id: KernelId<"op"> & Id;
  readonly name: string;
  readonly category: OpCategory;
  readonly input: In;
  readonly output: Out;
  readonly traits?: Traits;
}
```

Existing positional ops continue to work. New ref-typed ops use the
keyed form by convention; the §B7d migration sweep converts
positional ref-returning ops automatically.

**Inference rule (per output key) — auto-derives §B7a laws.**

| Output key shape                            | Auto-derived law                                         |
| ------------------------------------------- | -------------------------------------------------------- |
| Same name on input + output, both ref-typed | `RETURNS_SAME_IDENTITY` with `of: <key>`                 |
| Output key absent from input                | `RETURNS_FRESH_IDENTITY` for that key                    |
| Branded `Fresh<RefT>`                       | `RETURNS_FRESH_IDENTITY` (overrides shared-key implicit) |
| Branded `AliasOf<"sourceKey", RefT>`        | `ALIASES` with `outputs: [<key>], from: "sourceKey"`     |
| Value-typed key (semantic value, not ref)   | No identity claim emitted                                |

The pass that emits operation graph facts (`opToKernelEdges` per
§B7) reads the input/output record types via `$infer` and emits the
law trait edges automatically. Authors only write explicit
`Laws.consumesInput` / `Laws.borrowsInput` / `Laws.aliases` for
behavior the type can't express.

**Brand witnesses.** Add to `kernel/refs.ts` (or a new
`kernel/ref-brands.ts`):

```ts
const refBrand = id.createFactory("ref.brand");

export const Fresh = defineRefBrand({
  id: refBrand.kind("fresh"),
  meaning: "output ref is freshly allocated",
});

export const AliasOf = <const SourceKey extends string>(source: SourceKey) =>
  defineRefBrand({
    id: refBrand.kind("aliasOf"),
    payload: { source },
    meaning: "output ref aliases the named input key",
  });
```

Brand witnesses preserve the underlying ref type — `Fresh<Ref<T>>`
is assignable to `Ref<T>` at the value level — so call-site code
doesn't need to know about brands. The brand only matters to the
identity-law inference pass.

**Call sites get keyed too.** `expr.call(Op, { invoice, actor })`
replaces `expr.call(Op, [invoice, actor])` for keyed ops. The keyed
call form gives:

- TS narrows missing keys at the call (positional ops can't catch
  "argument 2 was supposed to be `actor`");
- argument-order changes don't break call sites;
- `expr.call` can preserve the input record type in `$infer.input`
  so downstream passes (placement, lowering) see the same identity
  flow the operation declared.

**Verifier responsibilities — extends §B7a's verifier.**

1. The §B7a checks (identity-claim consistency, linear-use tracking,
   borrow-vs-write cross-check) carry over unchanged — they read the
   law trait edges, which were either hand-written or auto-derived.
2. **New check**: an output key that is both (a) a shared key with an
   input and (b) marked `RETURNS_FRESH_IDENTITY` via an explicit law
   is a typed diagnostic ("conflicting identity claims — use a
   different output key, or apply the `Fresh<>` brand").
3. **New check**: an `AliasOf<"sourceKey">` brand whose source key
   isn't in the input is a typed diagnostic with a remediation
   listing the available input keys.
4. **New check**: shared-key but value-typed (e.g. `input: { sum:
Money } output: { sum: Money }`) is fine — no identity claim
   emitted — but a hint suggests renaming the output key to make
   intent unambiguous, since "structural same name" reads as
   identity flow to humans.

**Migration sweep.**

A one-shot pass over `kernel/operations.ts` and any dialect-owned
operation registries:

1. For each ref-returning op with positional inputs: synthesize keyed
   names from the existing `name` field, the operation's
   documentation, or fall back to `arg0` / `arg1` / `result`.
2. Emit a candidate patch converting the signature to keyed form,
   with the inferred identity claims attached.
3. Show before/after in `app.preview()`. Author reviews and accepts
   the patch (or hand-edits the keys).

Positional and keyed ops coexist after the sweep; the keyed form is
the documented default for new ref-typed ops, the positional form
remains for value-typed ops where identity flow doesn't matter.

**Type-level guarantees.** The keyed signature must preserve in
`$infer`:

- exact input record literal in `$infer.input`;
- exact output record literal in `$infer.output`;
- branded ref witnesses (`Fresh<>`, `AliasOf<>`) preserved through
  the record type (not erased to plain `Ref<>`);
- derived law-trait tuple in `$infer.derivedLaws` — the laws the
  inference pass will emit, queryable at compile time so authors can
  verify "yes, my type does carry the claim I expected."

**Status:** not implemented. Sequenced after §B7a (need the law
vocabulary first) and before any work that consumes ownership facts
in lowering planners (e.g. Postgres `UPDATE`-vs-`INSERT` selection,
optimistic-patch precision, IVM identity tracking). Tracked so
`GETTING_STARTED.md` §7.2 has a single source of truth.

**B7c. Reserved.** Future ownership work — concurrent borrow scopes,
escape analysis, region-typed effects — would land here.

**B7d. Migration of existing positional ops to keyed form.**
Captured under §B7b's migration sweep above; called out as its own
sub-item so it shows up on track-completion checklists.

**B7e. Operation-scoped predicates: preconditions, postconditions,
invariants.** §B7a + §B7b give operations typed identity flow. This
item gives them typed **boolean obligations** over their arguments
— preconditions, postconditions, invariants — using the existing
unified `Predicate` IR (§B3) with no new IR shape, just two new
flavors and an authoring builder that binds `vars` to the keyed
input scope from §B7b.

**Three shapes, all the same `Predicate` underneath.**

| Shape                   | Subject   | Vars                 | Body holds        | Existing? |
| ----------------------- | --------- | -------------------- | ----------------- | --------- |
| Per-argument refinement | Type      | (none)               | At construction   | Yes (§10) |
| Precondition            | Operation | Input record scope   | Before op runs    | New       |
| Postcondition           | Operation | Input + output scope | After op runs     | New       |
| Invariant               | Operation | Input record scope   | Throughout op run | New       |

Per-argument refinement is the existing `Subject.where(predicate)`
surface — no work needed. The new flavors slot into
`PredicateFlavor.*`:

```ts
const PredicateFlavor = {
  trait: predicateId.flavor("trait"),
  law: predicateId.flavor("law"),
  rule: predicateId.flavor("rule"),
  precondition: predicateId.flavor("precondition"), // new
  postcondition: predicateId.flavor("postcondition"), // new
  invariant: predicateId.flavor("invariant"), // new
} as const;
```

`PredicateFlavor` is open per §B3 — adding flavors is additive
vocabulary. Subject is `SubjectKind.operation` (already present).
`vars` is bound from the operation's keyed input record (§B7b);
`postcondition` adds the keyed output as a second scope.

**Authoring builder — extends `defineOperation` returned witness.**

```ts
interface OpBuilder<Op extends KeyedOpSignature> {
  requires(body: (p: ParamScope<Op["input"]>) => Expr<boolean>): OpBuilder<Op>;
  ensures(
    body: (p: ParamScope<Op["input"]>, r: ParamScope<Op["output"]>) => Expr<boolean>,
  ): OpBuilder<Op>;
  invariant(body: (p: ParamScope<Op["input"]>) => Expr<boolean>): OpBuilder<Op>;
  // ...existing methods
}
```

Each method returns a typed witness (a `Predicate` per §B3) and
attaches it to the operation node via a typed edge:

```
Operation ──[has-precondition]──> Predicate
Operation ──[has-postcondition]──> Predicate
Operation ──[has-invariant]──> Predicate
```

These are typed edges — same pattern as `Predicate ──[has-assurance]──>
AssuranceKind`. Authoring is fluent; storage is structural.

Multiple `.requires(...)` calls compose into a conjunction at the
predicate level (one predicate per call), not the body level — this
preserves provenance and lets each one carry its own assurance.
`Predicate.and(p1, p2, ...)` exists for the rare cases where authors
want a single combined predicate.

**`ParamScope<In>` typing.** A typed view over a keyed record where
each key exposes the typed expression API for its slot:

```ts
type ParamScope<In extends Record<string, KernelType>> = {
  readonly [K in keyof In]: ExprBound<In[K]>;
};
```

`ExprBound<T>` is the same surface used in rule bodies (`.field(...)`,
`.eq(...)`, `.lt(...)`, quantifiers, etc.) — no new expression
vocabulary, only new binding source. For ref types, `.field(...)`
narrows by the entity's field set; for value types, comparisons and
arithmetic narrow by the type's operation algebra.

**Lowering surfaces — new §B3b registrations.**

Each new flavor registers surfaces against existing target dialects.
The §B3a planner reads them via `app.predicate.lowerability(pred)`
exactly like rule predicates today.

| Flavor          | New surfaces                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `precondition`  | `auth.surface.serverGuard.precondition` (assert before call, typed throw on violation); `react.surface.formValidation.precondition` (lower to client-side validation when ClientLowerable); `postgres.surface.checkConstraint` (when the args back a table); `test.surface.fixtureFilter` (generators only emit satisfying inputs); `react.surface.optimisticGating` (hide action button if precondition fails on visible data); `openapi.surface.requestPrecondition` (docs) |
| `postcondition` | `auth.surface.serverAssertion.postcondition` (dev/test, throw if violated); `test.surface.oracle` (post-call test check); `reactivity.surface.postconditionDelta` (IVM uses postcondition to derive what changed); `audit.surface.explanation` (audit trail explains expected effect)                                                                                                                                                                                         |
| `invariant`     | `auth.surface.transactionGuard` (assert at transaction boundaries); `postgres.surface.trigger` (lower to a SQL trigger when applicable); `test.surface.property` (property-based test from invariant body)                                                                                                                                                                                                                                                                    |

Standard dialects ship the surfaces above; third-party dialects
register additional ones through the same §B3b factory.

**Verifier responsibilities.**

1. **Param-scope key validity.** The callback's parameter access
   (`p.from`, `p.amount`) is checked against the operation's keyed
   input. Unknown keys are typed errors at the callback boundary —
   no runtime "undefined" surfacing. For postconditions, the result
   scope `r` is checked against keyed output.
2. **Type compatibility.** Field access, comparison, and quantifier
   bodies are typechecked against the slot types — `p.amount.gte(...)`
   only accepts a `Money` operand when `amount` is `Money`.
3. **Caller obligation discharge.** When an operation is called
   inside a query/action body, a pass walks the call site and
   discharges each precondition against (a) refinement types on the
   passed args, (b) rules already known to hold on the surrounding
   entity, (c) explicit guards immediately preceding the call. Any
   precondition not discharged becomes a typed obligation diagnostic
   with structured remediation listing the three discharge paths.
4. **Postcondition consistency with identity laws.** A postcondition
   that references `r.<key>` whose §B7a/§B7b inference says
   `RETURNS_FRESH_IDENTITY` is still valid (the field access reads
   the fresh entity's state); but a postcondition asserting
   `r.<key> === p.<key>` while §B7a says the keys are different
   identity is a typed legalization error.
5. **Refinement composition.** `Op.where(Predicate.requires(...))`
   produces a `RefinedOperation` whose precondition set is the union
   of the base op's preconditions and the refinement's. The planner
   picks the strongest discharged set when choosing lowerings.

**Refinement parity with `Subject.where(...)`.**
`AddMoney.where(Predicate.requires((p) => p.a.gte(p.b)))` is the
canonical refinement form; the `.requires(...)` / `.ensures(...)`
methods on the builder are sugar that produces and attaches the
predicate in one step. Authors pick whichever reads better at the
call site; both produce identical IR.

**Integration with §B7b keyed I/O.** Preconditions and
postconditions assume keyed input/output. For positional ops they
fall back to numeric param keys (`p[0]`, `p[1]`) with a hint
suggesting migration. The §B7d migration sweep covers this — once
ref-returning ops are converted, the precondition surface becomes
the documented form for all new ref-typed ops.

**Type-level guarantees.** Operation witnesses must preserve in
`$infer`:

- exact precondition predicate tuple in `$infer.preconditions`;
- exact postcondition predicate tuple in `$infer.postconditions`;
- exact invariant predicate tuple in `$infer.invariants`;
- typed obligations the call site must discharge in
  `$infer.obligations` (open-set; populated by the call-site
  discharge pass).

**Status:** not implemented. Sequenced after §B7b (need keyed I/O
for the `ParamScope` type to work cleanly). Tracked so
`GETTING_STARTED.md` §7.3 has a single source of truth and lands
when the operation-scoped predicate surface ships.

**B7f. Partiality, `Result`, and typed matching.** Operation-scoped
predicates say when a call is legal. Result types say what happens when
failure is legal domain output. Both are needed.

Add a small, explicit result/match DX layer:

```ts
const MoneyErrors = gen.errors.catalog(moneyId.errorCatalog("money"), {
  divideByZero: gen.errors.case(moneyId.error("divideByZero"), {
    type: moneyId.errorType("divide-by-zero"),
    code: moneyId.errorCode("divide_by_zero"),
    title: "Cannot divide by zero",
    fields: { right: Types.money() },
    messages: {
      user: () => "Enter an amount other than zero.",
      developer: ({ right }) => `DivideMoney failed because right was ${right}.`,
      agent: ({ right }) => ({
        reason: "Denominator was zero.",
        evidence: { right },
        suggestions: [
          "Use NonZeroMoney when zero should be impossible.",
          "Handle MoneyErrors.divideByZero when zero is expected.",
        ],
      }),
    },
    remediation: [
      gen.errors.remediation.changeInput("right"),
      gen.errors.remediation.useOperation("money.divide.safe"),
    ],
  }),
});

const DivideMoney = defineOperation(moneyId.op("divide"))
  .input({ left: Types.money(), right: Types.money() })
  .output({
    result: Types.result({
      ok: Types.money(),
      error: MoneyErrors,
    }),
  })
  .impl(({ left, right }) =>
    expr.if(
      expr.eq(right, Types.money().literal("0.00")),
      expr.err(MoneyErrors.divideByZero({ right })),
      expr.ok(expr.divide(left, right)),
    ),
  )
  .laws((self) => Laws.all(Laws.deterministic(self), Laws.total(self)));

const displayAmount = expr.match(divide.result, {
  ok: ({ value }) => formatMoney(value),
  err: ({ error }) =>
    expr.match(error, {
      [MoneyErrors.divideByZero]: ({ detail }) => detail,
    }),
});
```

The type rules:

- `Types.result({ ok, error })` lowers to a tagged union with graph-visible
  variants and stable problem-shaped error instances.
- `expr.ok(value)` must match the declared ok type.
- `expr.err(errorWitness(payload))` must match one declared error variant.
- `expr.match(result, handlers)` is exhaustive over `ok | err`.
- Matching an error union is exhaustive over every error case unless the
  author supplies an explicit `_` fallback.
- A handler narrows the value/error payload type without casts.
- Handler keys are typed error witnesses; strings are accepted only at
  error-catalog definition boundaries.
- Error definitions may expose audience-specific messages. The matched
  error instance carries `messages.user`, `messages.developer`, and
  `messages.agent` when declared, plus domain remediation hints. These
  are runtime-domain hints, not compiler graph repairs.

The verification rule:

```txt
NoHiddenPartialOperation:
  if operation has Partial capability
  or implementation calls a known partial operation
  then operation must have one of:
    precondition/refinement proving partial case impossible
    Result/Option output encoding the case as a value
    explicit .errors(...) channel with target mapping
```

Failure emits `operation:hidden-partial` with candidate repairs:

1. add a `.requires(...)` precondition;
2. refine the offending input type (`NonZeroMoney`);
3. wrap the output in `Types.result(...)`;
4. declare `.errors([...])` and map the error at boundaries.

Do not use algebraic laws to hide partiality. A law like
`Laws.total(self)` is valid only after the verifier can prove one of the
three legal encodings above. For `divide`, `associative`,
`commutative`, and `identity("0")` are not legal claims; the checker
should emit law-specific diagnostics with fixes suggesting either
`AddMoney`-style laws or domain-specific divide laws.

**B7g. Compile-time trait and predicate constraints on edge endpoints.**
The kernel already enforces `EndpointTarget.targetKinds` at the
TypeScript level (see `EndpointInputForRole<Role>` in
`src/kernel/edge.ts:142–156` — `KernelNodeRef<AllowedNodeKindForRole<Role>>`
narrows the accepted ref to the declared node kinds). What it does
**not** enforce statically are `EndpointTarget.requiresTraits` and
`EndpointTarget.excludesTraits` — those fire only at the verifier
(`graph.patch.verify`). With §10's refined types and §B7e's
operation-scoped predicates already in design, the natural next step
is to lift trait constraints (and full predicate-body constraints)
into the type system so wrong-trait endpoint attachments fail at
authoring time, not at apply time.

**Phantom trait-set on `KernelNodeRef`.** Today
`KernelNodeRef<NodeKind>` has one type parameter. Add a second:

```ts
export type KernelNodeRef<
  NK extends NodeKind = NodeKind,
  Traits extends TraitSet = TraitSet, // new — phantom claim about which traits the node carries
> = ...;
```

`TraitSet` is an opaque, branded set type built from trait witnesses;
it composes via intersection (`A & B`) so a ref upgraded with two
refinements carries both claims at the type level. The phantom slot
is never read at runtime — it exists only so endpoint constraints
can demand specific traits in their input position.

**Refinement upgrades the trait set.** `Subject.where(...)` already
exists for predicate refinement. Make it produce a ref whose `Traits`
slot includes the predicate's witness:

```ts
const issuedInvoice: KernelNodeRef<InvoiceNode, Has<Issued>> = invoiceRef.where(Issued);

const issuedAndUnpaid: KernelNodeRef<InvoiceNode, Has<Issued> & Has<NotPaid>> =
  issuedInvoice.where(NotPaid);
```

For marker traits the upgrade is direct (the trait witness goes into
the set). For body-bearing predicates the same shape applies — the
predicate witness is the set member, and the body must be discharged
either by the runtime check at `where(...)` time or by an obligation
that propagates to the surrounding scope.

**Endpoint constraint extension.** `EndpointInputForRole<Role>`
extends to also require the trait constraints declared on the
endpoint:

```ts
export type EndpointInputForRole<Role extends EndpointRoleDef> =
  IsConstrainedRole<Role> extends true
    ?
        | KernelNodeRef<
            AllowedNodeKindForRole<Role>,
            // require all traits in requiresTraits, exclude all in excludesTraits
            Has<Role["target"]["requiresTraits"][number]> &
              Without<Role["target"]["excludesTraits"][number]>
          >
        | { readonly target: KernelNodeRef<...>; readonly cardinality?: EdgeCardinality }
    : ...;
```

So:

```ts
// TS error today, runtime error.
// TS error after §B7g, no runtime hit.
kernel.edge(PaymentSettlesInvoice).from({
  invoice: draftInvoice, // ← KernelNodeRef<Invoice, Has<Draft>> not assignable to
  //   KernelNodeRef<Invoice, Has<Issued>>. Did you mean
  //   `draftInvoice.where(Issued)` after issuing it?
  payment: settledPayment,
});
```

**Refined-type endpoints — `targetKinds` accepts `RefinedType`.**
Today `targetKinds: readonly NodeKindDef[]`. After §B7g:

```ts
endpoints: {
  invoice: defineEndpointRole("invoice", {
    targetKinds: [Invoice.where(canBeSettled)],   // RefinedNodeKindDef
  }),
}
```

The endpoint constraint becomes a full predicate body, not just a
trait marker — "this endpoint accepts an Invoice for which
`canBeSettled` holds." The verifier already has the predicate-
evaluation machinery from rules; this is the same evaluation lifted
to a type-system input position. The trait-only form remains as a
shorthand for the marker-trait case.

**"Any ref" widener for dynamic input.** Importers, plugin dialects,
AI-edit patches, and parsed graph snapshots produce refs whose
trait set isn't known at the type level. Add an explicit widener:

```ts
ref.untyped(rawId); // KernelNodeRef<NodeKind, UnknownTraits>
ref.parse.node(NodeKind, rawId); // returns Result with diagnostics
ref.unsafe.node(NodeKind, rawId).asTrusted(); // tests/importers only
```

`UnknownTraits` is **not** assignable to a `Has<...>`-constrained
endpoint without an intervening `where(...)` (which forces a
runtime check) or an explicit `.assertTraits(...)` (which is the
escape hatch for "I know what I'm doing"). This keeps the trust
boundary explicit.

**Pattern matches and graph queries propagate the trait set.**
Bindings in `graph.match(pattern)` callbacks today are
`KernelNodeRef<NodeKind>`. After §B7g they're `KernelNodeRef<NodeKind,
Traits>` where `Traits` reflects what the pattern's edge constraints
can prove. A pattern that walks `PaymentSettlesInvoice` knows its
`payment` binding carries `Has<Settled> & Without<Refunded>` — and
that flows into any subsequent endpoint construction in the morphism
body without requiring a re-check.

**Verifier responsibilities** (the runtime verifier stays — it is the
trust boundary for refs that bypass the type system):

1. The existing `requiresTraits` / `excludesTraits` checks remain at
   `graph.patch.verify` time, unchanged. They are now backstop, not
   primary enforcement.
2. **New check**: a refinement claim attached via `.where(predicate)`
   whose body is not derivable from the surrounding context must
   either (a) carry an `assurance` witness asserting it, (b) be
   discharged by a runtime check at `where(...)` time, or (c)
   propagate as an obligation. Unaccompanied claims are a typed
   diagnostic.
3. **New check**: `Without<...>` on a ref that the graph reports
   _does_ carry the excluded trait is a hard verifier error, not a
   soft warning — this is a type/runtime split that should never
   happen if §B7g's `where(...)` discipline is enforced.

**Lowering surfaces — new §B3b registrations.**

| Surface                                 | Behavior                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `kernel.surface.endpointTraitCheck`     | The TS-level check above. Static; no runtime cost.                                                    |
| `kernel.surface.endpointPredicateCheck` | Full predicate-body evaluation for refined-type endpoints. Lowers via the existing predicate planner. |
| `auth.surface.refinementObligation`     | When a `where(...)` claim isn't statically discharged, lower as an authorization obligation.          |

**Type-level guarantees.** After §B7g:

- `KernelNodeRef<NK, T>` carries an exact, queryable trait set in
  `$infer.traits`;
- `EndpointInputForRole<Role>` enforces the role's trait constraints
  as a TS-level requirement;
- pattern bindings preserve trait sets through joins (`same(...)`
  unifies trait sets across the unified endpoints);
- refinement composition is a lattice — chained `.where(p1).where(p2)`
  is `KernelNodeRef<NK, Has<P1> & Has<P2>>`;
- the architecture test from §0.5 #7 extends to forbid raw
  `KernelNodeRef<NK>` (untyped traits) construction outside the
  explicit widener APIs.

**Backwards compat.** Existing `KernelNodeRef<NK>` usage continues
to compile — the second parameter defaults to `UnknownTraits`, which
is assignable everywhere a trait constraint isn't declared. The
narrowing only kicks in at endpoint roles that declare
`requiresTraits` / `excludesTraits`. Authors opt in by adding the
constraints; nothing breaks otherwise.

**Migration sweep.**

1. Add the `Traits` parameter to `KernelNodeRef` with a permissive
   default. Verify the entire codebase still compiles.
2. Implement `Subject.where(...)` producing the upgraded ref type.
   Update `RefinedType` to carry the trait set through.
3. Extend `EndpointInputForRole<Role>` to require the declared
   trait constraints. Run `vp check` — every site that used to pass
   verification at runtime now either compiles cleanly (because the
   ref already carries the trait through `where(...)`) or surfaces a
   TS error at the call site.
4. Provide an automated codemod that wraps offending refs with
   `.where(requiredTrait)` and emits a runtime check + a typed
   diagnostic if the assertion is wrong.
5. Add an `assertTraits(...)` escape hatch for the small set of
   sites that genuinely cannot prove the claim statically.

**Status:** not implemented. Sequenced after §B7e (the predicate
surface needs to exist before refined-type endpoints can lower
predicate bodies). Tracked so `GETTING_STARTED.md` §4.1 has a single
source of truth and lands when the trait-set phantom and refined-
endpoint constraints ship together.

**B8. Collapse the trait/law/rule forks into one `Predicate` node
kind — at the IR layer only.** Today three primitives coexist:

- `TraitDef` (`kernel/trait.ts`) — marker semantic claims.
- `LawDef` + `LawWitness` (`kernel/law.ts`) — operation algebra.
- Rule nodes inside the callable/rule dialect — entity-bound boolean
  expressions.

The collapse is **additive, not subtractive**: introduce `Predicate`
with the four-field shape from §B3 (`subject | vars | body | assurance
| flavor`) and migrate the three legacy primitives to lower to it. The
existing public constructors (`defineTrait`, `defineLaw`, `defineRule`,
plus the ergonomic `gen.trait`, `Laws.*`, `gen.rule.for`) **stay** as
authoring surfaces; their TypeScript inference, callback shapes,
editor-facing type facts, and `$infer` surface are preserved. The unification happens at
the node-emission boundary, after the type system has done its work.

The good DX we have today — typed witnesses, factory inference,
const-generic name preservation, `$infer.kind` / `$infer.payload` /
`$infer.assurance` on `Laws.*`, scoped quantified witnesses in rule
bodies, typed trait-target constraints, branded ID factories — must
survive byte-for-byte through the collapse. A type-level regression test
suite (§C #14) catches inference regressions before they ship.

Concretely:

- Promote `TraitDef<Payload>` to internally store as `Predicate` with
  `flavor: "trait"`, `subject: <attached subject ref>`, `vars: []`, and
  a body that is `expr.true()` for markers or a real `Expr<boolean>`
  for body-bearing traits. `defineTrait(...)` returns the same public
  shape it does today — internally, its result wraps a `Predicate`.
- Promote `LawDef + LawWitness` to internally store as `Predicate` with
  `flavor: "law"`, `subject: <operation ref>`, `vars: <universally-
quantified bindings>`, and a body that asserts the algebraic identity
  (`expr.eq(...)`, `expr.implies(...)`, etc.). Witness payloads
  (`identity`, `inverse`, `proof`) become typed body shapes plus
  optional `proof`-typed metadata. `Laws.associative(Op)` /
  `defineLaw(...)` return the same public shape; under the hood, both
  point at one `Predicate` node.
- Promote rule nodes to internally store as `Predicate` with
  `flavor: "rule"`, `subject: <entity ref>`, `vars: <entity-scoped
bindings>`, and a body that is the user-authored boolean expression.
  The Track P §P1 authoring surface (`defineRule(...)`,
  `gen.rule.for(Entity, ...)`) is the user-facing factory.

After the collapse, **assurance is a payload on every predicate**, and
there is exactly one **kernel reading API**: `predicate.subject`,
`predicate.vars`, `predicate.body`, `predicate.assurance`,
`predicate.flavor`. The legacy reading APIs (`trait.appliesTo`,
`law.subject`, `rule.body`, `rule.vars`, …) remain as thin shims over
the unified shape; consumers can opt into the predicate-flat API or
keep the flavor-specific accessors, whichever is clearer at the call
site.

Every downstream pass — refinement (`Subject.where(pred)`),
`app.explain(pred)`, the lowerability matrix, derived invalidation, the
target-lowering planner from §B3a — reads `Predicate` and dispatches on
`subject` kind (and on `flavor` when the authoring surface is relevant
to error messages). No code needs to know which factory produced the
predicate. New code should target the predicate API; existing code can
migrate at its own pace.

The migration order is in Track P §P0 (IR landing) and §P1 (authoring
surfaces). The kernel collapse must land before the rest of Track P
fires so the eleven derivations consume one shape; the public-API
preservation rule means user code does not break in the same window.

**B9. Fix `kernel/transform.ts`.** Replace `id: \`transform:\${Date.now()}\``with stable IDs (rename-safe, deterministic). Replace string`decode`/
`encode`bodies with`ExprRef`. Add `transform.codec(...)`form,
round-trip law witness, errors, requirements. Make transforms first-class
graph nodes with`TypeHasCodec` edges.

**Trait targets must be witness-based**, not strings. `applies_to: string`
becomes `appliesTo: TraitTargetConstraint` with options like
`type.kind("email")`, `domain.nodes.field`, `target.hasTrait(traits.clientRenderable)`.

**Exit:** "what operation did this action apply?" is a single edge query.
Sync, IVM, optimistic, CRUD, and merge passes read predicate assurance
through one `Predicate` reading API — they do not care whether the
predicate was authored as a trait, a law, or a rule. The type stack is
layered: representation, semantic, serializer, operation, expr,
predicate, implementation are all separately addressable graph facts
(`trait` / `law` / `rule` are flavors of `predicate`, not separate
kinds). Transforms have stable IDs and expr-backed bodies.

---

### Track C — Type inference + witness surface

Maps to **R1/R2/R4** follow-up plus the entire `typescript_suggestions.txt`
and the `$infer` recommendations in `more_suggestions.txt` §4 and
`gen_2_new_design_readme.md` §"TypeScript witness layer".

1.  **`KernelGraph<TState>`** generic over registered contents
    (`typescript_suggestions.txt` §1).
2.  `defineEdgeFromKind` / `defineNodeFromKind` preserve named endpoint
    shape and metadata schema in their return type.
    2a. **Curried edge construction builder.** Keep
    `defineEdgeFromKind(kind, id, endpoints, input)` as the low-level
    primitive, but make the preferred public authoring path bind the
    edge-kind witness first:

    ```ts
    const edge = kernel
      .edge(ACTION_WRITES_FIELD_EDGE_KIND)
      .from({ action: actionRef, field: fieldRef })
      .id(callableId.edge(ACTION_WRITES_FIELD_EDGE_KIND, actionRef, fieldRef))
      .metadata({
        custom: {
          operation: "update",
          field_name: "status",
          entity_name: "Project",
          has_condition: false,
        },
      })
      .done();
    ```

    Binding `Kind` up front improves autocomplete and lets endpoint
    keys, endpoint target-kind constraints, metadata payload type,
    provenance shape, and branded edge ID requirements all infer from
    one typed witness. The primary `.id(...)` path accepts only
    namespace/kind-branded `KernelId<"edge">` values; dynamic input uses
    `.parseId(...)` / `.unsafeId(...)` or `ref.parse.edge(...)` /
    `ref.unsafe.edge(...)`. Add a shorthand factory form:
    `kernel.edge(kind).autoId(factory, ...parts)` so users do not hand-
    assemble edge IDs in normal authoring.

    Optional callback form is allowed for complex endpoint sets when it
    materially improves autocomplete:

    ```ts
    kernel.edge(DOMAIN_RELATION_EDGE_KIND).from((e) => ({
      from: e.node(ENTITY_NODE_KIND, User),
      to: e.node(ENTITY_NODE_KIND, Project),
      fromField: e.node(FIELD_NODE_KIND, User.fields.id),
      toField: e.node(FIELD_NODE_KIND, Project.fields.ownerId),
    }));
    ```

    `defineEdgeKind(...)` may later expose `.edge(...)` as sugar, but it
    should delegate to the same `kernel.edge(kind)` implementation so
    there is one inference path and one runtime edge constructor.

3.  **Typed dialect registry**: `registry.get("app")` returns the literal
    dialect; `registry.ownerOf(app.edges.writes)` returns the owner dialect.
    Dialect registry inference must preserve the dialect namespace,
    dependency tuple, owned node/edge/trait witnesses, patterns,
    morphisms, pipelines, capabilities, laws, artifact kinds, and
    version/hash metadata through a flattened `$infer` surface.
    `dependsOn: [DomainDialect, RuleDialect]` should infer which source
    facts a dialect may legally read, while `to` declarations infer which
    target facts its morphisms may emit.
4.  **`Compute<T>`** at public boundaries where it improves editor DX.
5.  **Refs preserve target kind**: `RefOf<typeof User>` stays an entity ref,
    not a `KernelObjectRef`.
6.  **Namespace-bound branded ID factories.** Replace ad-hoc ID string
    construction with `id.createFactory(namespace)`:
    ```ts
    const callableId = id.createFactory("callable");
    const actionId = callableId.node(ACTION_NODE_KIND, "updateProjectStatus");
    const writesId = callableId.edge(ACTION_WRITES_FIELD_EDGE_KIND, actionId, fieldRef);
    ```
    Each constructor preserves namespace, ID kind, kind witness, and stable
    name/parts in the branded type. Use factory-contained casts internally;
    users pass values and receive branded IDs. Dynamic input uses
    `id.parse.*` and produces diagnostics/candidate patches before becoming
    trusted graph state.

6a. **ID factories carry paired ID and ref constructors.** A ref carries
the ID plus its node-kind witness, optional stable name, and (for
plugin/import flows) its dialect. Rather than splitting ref construction
into a separate top-level `ref.*` namespace that takes the factory as a
parameter, **the ID factory itself exposes both shapes**:

````ts
const callableId = id.createFactory("callable");

// Construct a branded ID:
const actionId  = callableId.node(ACTION_NODE_KIND, "updateProjectStatus");

// Construct a typed ref (id + kind witness + namespace brand) at the same call site:
const actionRef = callableId.nodeRef(ACTION_NODE_KIND, "updateProjectStatus");
const writesRef = callableId.edgeRef(ACTION_WRITES_FIELD_EDGE_KIND, actionRef, fieldRef);

    // Dynamic ingestion lives on a standalone namespace because it does not
    // own a typed factory — `ref.parse.*` returns a Result with diagnostics:
    const parsed = ref.parse.node(ACTION_NODE_KIND, rawId);
    const unsafe = ref.unsafe.node(ACTION_NODE_KIND, rawId);  // assertion form
    ```
    The current `nodeRef(kind, id: string, name?: string)` erases the
    brand on its `id` parameter and uses positional `name`. Tighten the
    shape:
    ```ts
    export const nodeRef = <
      const Kind extends NodeKindDef,
      const Id extends KernelId<"node">,
      const Name extends string | undefined = undefined,
    >(
      kind: Kind,
      id: Id,                                    // branded, not raw string
      input?: { readonly name?: Name },          // options object
    ): KernelNodeRef<NodeKindFromDef<Kind>, Id, Name> => ...
    ```
    `nodeRef.parse(kind, raw, opts?)` and `nodeRef.unsafe(kind, raw,
    opts?)` are the dynamic-ingestion companions. Normal authoring
    passes a branded `KernelId<"node">` produced by an `id.createFactory`
    call; raw strings only enter through `.parse` or `.unsafe`, which
    produce diagnostics or assertion failures.

    **Refs aren't existence proofs.** A ref is a typed pointer with
    namespace + kind + stable name; it doesn't prove the target exists
    in the live graph. Forward references are supported during patch
    construction: a patch can add Node A and then add Edge B→A in the
    same transaction; A's ref is valid for use inside the patch before
    the graph commits. Verification at commit reconciles refs against
    actual graph state and emits `ref:dangling` diagnostics for refs
    whose target was never created.

7.  **Standard witness surface** on every major definition. Every entity,
    action, query, resource, mutation, form, list, event, boundary call must
    expose a consistent shape:
    ```
    X.ref           // typed graph ref
    X.type          // semantic value type
    X.fields        // for entities/projections
    X.input/.output/.errors/.events/.requirements/.writes  // for callables
    X.fragment      // graph fragment for kernel.graph.pipe(X)
    X.$infer.input  // TypeScript witness
    X.$infer.output
    X.$infer.error
    X.$infer.value / .row / .values / .state  // shape-appropriate variant
    ```
    Aliases `InferEntity<E>`, `InferInput<A>`, `InferOutput<A>`,
    `GraphWitnessOf<G>` provide the same information for type-only contexts.
8.  **Named object projection is the default everywhere.** Query `.select({...})`
    preserves named keys; array `.select([...])` exists but is the
    lower-level path. This matters for OpenAPI, JSON-render, React props,
    docs, forms, lists, fixtures, and AI editing.
    8a. **Projection cardinality/order/iterability inference.** Query,
    projection, and collection-expression builders must preserve output
    facts: - element type; - cardinality bounds; - finite/pageable/streamable iterability; - ordering key/direction/stability; - uniqueness/keying.

        Example target:

        ```ts
        const latest = gen.query("latestInvoices")
          .from(Invoice)
          .where(...)
          .orderBy(Invoice.fields.createdAt, "desc")
          .limit(20);

        latest.$infer.element;      // Invoice
        latest.$infer.cardinality;  // 0..20
        latest.$infer.order;        // createdAt desc
        latest.$infer.iterable;     // pageable/async depending target
        ```

        These facts lower to SQL `ORDER BY/LIMIT`, OpenAPI `maxItems`, UI list
        layout, cursor pagination, streaming responses, cache keys, and
        diagnostics when a target cannot preserve the guarantee.

9.  **Stable-ID strictness levels.** Add
    `gen.config({ identity: { stableIds: "warn" | "required",
renameHints: "required_for_ambiguous_changes" } })`. Diagnostics:
    `ref:missing-stable-id`, `ref:rename-without-stable-id`,
    `ref:duplicate-stable-id`, `ref:unstable-name-derived-id`. Required at
    production strictness because evolution and migrations depend on it
    (see §0.5 #7). The "warn" level should land in Quick Wins (§7); the
    "required" level lands once Track M's evolution dialect arrives.
10. **Compile-time tests** (`expectTypeOf`, `tsd`) that **must compile**
    and **must fail**, per the transition agent's acceptance criteria.
11. **Editor-DX regression coverage**. With ~16 dialects × multiple
    builder forms × generic accumulators, public types get noisy without
    active management. Add `.test-d.ts` / `expectTypeOf` assertions for
    the standard examples (entity field access, action input/output, edge
    endpoint inference) that check editor-facing types expose useful named facts:
    literal names, endpoint keys, payload types, `$infer` surfaces, and
    no required call-site casts. Use `Compute<T>` and branded helpers
    where they make public types readable.
12. **Graph-stage inference contract.** Track A's new graph-stage
    primitives must satisfy Track C's inference bar:
    - `GraphPattern` preserves literal binding names, consumed
      node/edge/trait/expr witnesses, endpoint targets, and typed
      metadata payloads.
    - `GraphMatch` exposes named callback properties derived from the
      pattern (`match.entity`, `match.field`) rather than string-indexed
      dictionaries.
    - `GraphMorphism` carries source-pattern, target-vocabulary,
      patch-union, diagnostic, artifact, explanation, and repair
      witnesses from declaration to `map` callback to stage result.
    - `Dialect` carries namespace, dependency tuple, owned vocabulary,
      patterns, projections, morphisms, pipelines, capabilities, laws,
      artifact kinds, versions, and performance keys without recursively
      exposing noisy implementation details in public editor feedback.
    - `GraphPatch` variants preserve node/edge/expr kind witnesses and
      payload metadata types.
    - `GraphDerivation` preserves literal read/emit/diagnostic/artifact
      tuples through the builder chain.
    - `GraphStageResult` is generic over patch, diagnostic, artifact, and
      explanation unions.
    - `MetaGraph` facts preserve the typed identity of dialects,
      patterns, morphisms, passes, pipelines, diagnostics, artifacts, and
      produced patch kinds so preview/explain does not fall back to raw
      strings.
    - Diagnostic repairs preserve the exact patch union they can apply.
    - Lowerings carry source-dialect and target-dialect witnesses so emit
      stages cannot accidentally consume high-level IR.
13. **Typed dynamic boundary.** Normal authoring APIs stay strict and
    infer without casts. Imported/plugin/runtime facts enter through
    explicit dynamic constructors (`defineDynamic*`, importers,
    decoded graph facts) that produce diagnostics or candidate patches
    before becoming typed graph facts. Do not weaken the typed authoring
    surface to accommodate dynamic ingestion.
14. **Type-level regression matrix for graph stages.** Add `.test-d.ts`
    coverage for: - wrong endpoint role rejected; - wrong endpoint target kind rejected; - wrong node/edge kind rejected; - wrong metadata custom payload rejected; - public payload definitions use schema/payload witnesses or
    `.custom<T>()`, never `undefined as unknown as T`; - metadata taxonomy respected (`display` cannot satisfy semantic
    reads; `custom` payload follows the kind witness); - namespace-bound ID factories infer ID kind, namespace, and
    node/edge kind witness; - wrong branded ID family rejected (`edge` ID where `node` ID is
    required, wrong namespace, wrong kind witness); - plugin node/edge kinds inferred through dialect namespace; - dialect child witnesses branded with namespace; - dialect dependencies constrain morphism `from` / `to` facts; - dialect capabilities/laws inferred as typed facts, not booleans; - **Edge vs predicate dispatch** (§B3c): `defineTrait` /
    `defineCapability` without `.when(...)` infer as `EdgeKindWitness`
    producing edge attachments; `.when(...)` upgrades the witness to
    `Predicate<Subject, [], Body, Assurance, PredicateFlavor.trait>`.
    The public witness shape (`.id`, `.ref`, `.attachTo(s)`,
    `.refine(s)`, `.$infer`) is uniform across both IR outputs so
    consumer code doesn't branch on representation; - **`Predicate` factory inference** (`defineLaw`, `defineRule`,
    `Laws.*`, `gen.rule.for`, and the `.when(...)` form of
    `defineTrait` / `defineCapability`) preserves exact `subject`
    witness (typed, not erased `GraphRef`), `vars` tuple, `body`
    expression type, `assurance` witness, and `flavor` literal in
    `$infer`; predicate bodies are always real expressions — there is
    no marker-body case at the predicate level; - **Assurance attachment**: assurances are edge attachments to
    assurance kind nodes (`defineAssuranceKind`), not predicates.
    `.withAssurance(kind)` on a predicate writes the
    `PredicateHasAssurance` edge with `$infer.assurance` narrowed to
    the kind witness; `strongerThan` is a partial order among kinds,
    walked via the edge graph; - `definePredicate` escape hatch rejects mismatched
    subject/vars/body combinations with diagnostics, and returns
    candidate predicates rather than weakening normal-authoring
    types; - **`nodeRef` and `ref.*` namespace** (§C #6a):
    `nodeRef(kind, brandedId, { name })` requires a `KernelId<"node">`
    and rejects raw strings; `nodeRef.parse` returns
    `Result<Ref, Diagnostic[]>`; `nodeRef.unsafe` is assertion-only
    and absent from public docs. `ref.node`/`ref.edge` preserve
    namespace, kind witness, and stable name through `$infer`. Cross-
    namespace mixups fail at the type level; - **Curried edge builder**:
    `kernel.edge(kind).from(endpoints).id(edgeId).metadata(...).done()`
    preserves `Kind`, named endpoint keys, target node-kind constraints,
    custom metadata payloads, provenance payloads, and branded edge ID
    namespace/kind witnesses. Wrong endpoint roles, wrong endpoint
    node kinds, raw-string IDs on the primary path, and edge IDs branded
    for another edge kind fail at the type level. `autoId(factory,
    ...parts)` infers the same `NamespacedKernelId<"edge", Namespace,
    Kind, Name>` shape as `id.createFactory(namespace).edge(...)`;
    `.parseId` / `.unsafeId` are the only raw-string boundary forms; -
    **Dialect-owned ID/ref factories**: `Dialect.id.node(...)` and
    `Dialect.id.nodeRef(...)` are auto-wired from the dialect's
    namespace. Branded with the dialect namespace literal; cross-
    dialect mixups fail at the type level. Plugin/dynamic dialects
    expose the same shape, with pre-registration calls producing
    typed diagnostics; - **Relation accessors** (§B0a): `defineNodeKind(...).relations({...})`
    preserves source kind, target kind, cardinality witness, `via`
    edge kind, endpoint selector, order/uniqueness, and required-
    ness in `$infer`. Runtime accessors (`node.related.lines()`)
    return cardinality-bounded types — `min: 1` produces a non-empty
    tuple. Inverse accessors auto-derive on the target node kind
    with the dual cardinality; explicit override is allowed when the
    inverse differs; - **Forward refs in patches**: a patch may construct a ref to a
    node it is about to add and then use that ref in a subsequent
    edge add within the same patch. Verification at commit reconciles
    refs; unreconciled refs emit `ref:dangling` diagnostics. Both
    forward and live refs share the `KernelNodeRef<Kind>` type;
    provenance tracks origin without weakening the public type; - **Surface extensibility (§B3b)**: `app.predicate.lowerability(pred)`
    returns a typed projection `LowerabilityOf<typeof pred>` over all
    registered `LoweringSurface` declarations whose
    `consumes.subjectKinds` includes `pred.$infer.subject` kind and
    whose `consumes.requires` predicates match — the result shape is
    open-set and grows as new dialects register surfaces; - **Surface filtering overloads**: `.lowerability(pred, { dialect:
D })` narrows to one dialect's surfaces;
    `.lowerability(pred).at(surfaceWitness)` returns the exact
    `surface.$infer.resultShape`; `.lowerability(pred, { phase })`
    filters to one phase. Passing a surface witness whose subject
    kind doesn't match the predicate is a type-level error; - **Surface vs morphism**: a morphism with a `surface` field is
    publicly queryable; one without is internal. The `surface.
consumes` must be a subtype of the morphism's `from` pattern;
    `surface.yields` must be a subtype of `to` facts. Type system
    enforces. - **Assurance comparison**: `assuranceAtLeast(a, b)` is partial-
    order, not string comparison. Unknown assurance witnesses (from
    unregistered dialects) produce typed diagnostics, not silent
    fallback; - **Refinement composition**: `S.where(p1).where(p2)` infers
    `RefinedType<S, And<P1, P2>>` with merged vars and weakest
    assurance. `Predicate.or/not/implies/iff` produce typed
    composite predicates whose `$infer.composition` tag is preserved; - **Policy witnesses**: `defineAuthPolicy(Subject, { action:
predicate, ... })` infers `Policy.$infer.actions` as a literal
    action-name union and `Policy.predicates[action]` as the typed
    predicate witness. Wrong-subject predicates are rejected at the
    type level; - `Subject.where(predicate)` refinements infer the refined type
    across all flavors: `Entity.where(rule)`, `Op.where(law)`,
    `Field.where(trait)`. Subject kind must match predicate subject
    kind at the type level; - `Laws.*` factory family preserves exact law kind, payload,
    assurance, and bundle-expanded tuple types (now also expressed
    as `Predicate` with `flavor: "law"`); - first-order expression and predicate-body constructors preserve
    scoped quantified witnesses and reject wrong-owner fields,
    non-boolean quantifier bodies, non-boolean implication terms,
    and incompatible comparison operands; - cardinality/order/iterability witnesses preserve exact bounds,
    field keys, directions, uniqueness keys, and iterable mode through
    type/operation/expression/query/projection builders; - pattern binding names inferred as named match properties; - morphism `from` / `to` witnesses narrow allowed patch builders; - meta-graph facts preserve producer/consumer witnesses; - query `.limit(20)` infers cardinality max `20`; - `.orderBy(Entity.fields.createdAt, "desc")` infers the exact field
    witness and direction; - `first()` over unordered collections emits a diagnostic or marks
    arbitrary choice rather than pretending order exists; - `exists` / `forall` reject non-iterable sources; - emitted patch kind inferred; - diagnostic repair patch union inferred; - lowering target dialect inferred; - emitter rejects non-target-dialect facts; - no explicit generic arguments or casts needed in normal use.
15. **Project-carried graph witnesses.** Longer term, add a
    `GraphWitness<TDialects, TFacts>` or `KernelGraph<TState>` surface so
    refs, patches, dialect facts, and derivations can be scoped to one
    project/module graph. This prevents accidentally mixing refs or facts
    from unrelated apps while still letting dynamic importers produce
    candidate patches.

**Exit:** no `as` casts in normal authoring; `archiveUser.writes`
exposes the literal field, literal operation tag, named endpoints, and
the full `$infer` surface; rename-without-stable-id surfaces a
diagnostic; graph-stage primitives preserve witnesses through
derivation, repair, lowering, and emit surfaces while public editor
feedback stays readable.

---

### Track D — Diagnostics, invariants, and AI-repair patches

Maps to **R6** plus all of `invariant.txt`, `more_suggestions.txt` §14
(patchable diagnostics), and `gen_2_new_design_readme.md` §"Diagnostics
with repairs". Required by the AI-repair pitch.

**The invariant ↔ verifier ↔ diagnostic ↔ finding lifecycle**
(from `invariant.txt`). These are four distinct objects; the plan and
implementation must keep them separate:

| Object              | What it is                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `InvariantFamily`   | Reusable typed template (e.g. `RequiredField`, `AtLeastOnceRequiresIdempotency`) parameterized by graph facts |
| `InvariantInstance` | Concrete invariant attached to specific graph facts (`RequiredField(User.email)`)                             |
| `Verifier`          | A _Pass_ that evaluates one or more invariants (or other contracts) and emits findings                        |
| `DiagnosticDef`     | Reusable typed schema for a possible diagnostic — independent of any invariant                                |
| `DiagnosticFinding` | Concrete emitted occurrence of a diagnostic, with locations and provenance                                    |

Diagnostics are **not** strings attached to invariants; they are typed
semantic objects that exist independently and can be emitted by _many_
sources, not just invariants. Per `invariant.txt`, diagnostic emitters
include:

````

type checking
graph verification (pass)
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

````

This is why `DiagnosticDef` is its own primitive in the kernel rather
than a property of invariants. An invariant _uses_ a diagnostic; so
does a target legalizer; so does a runtime check; so does an AI repair
pass. Same `DiagnosticDef`, different emitters.

**D0. Consolidate the diagnostic fork.** Today `Diagnostic`
(`kernel/diagnostic.ts`) and `PassDiagnostic` (`kernel/pass.ts`) are
separate shapes; passes return the slim one. Same for `Artifact` vs
`KernelArtifact`. Pick the rich shape, delete the slim one, migrate
~60 pass specs in `lifecycle.ts`. After consolidation:

1. `DiagnosticDef` — typed schema with params, severities, audience-specific
   messages (`user` / `developer`), structured `remediation` and `repair`
   (graph patch generator):
   ```ts
   diagnostic.define("dispatch.at_least_once.requires_idempotency", {
     severity: "error",
     remediation: { kind: "add_edge", suggestion: "..." },
     repair: ({ dispatchNode }) =>
       gen.patch.addEdge(app.dispatch.edges.usesIdempotency, {
         dispatch: dispatchNode,
         idempotency: idempotency.inputHash(),
       }),
   });
````

2. `DiagnosticFinding` — emitted occurrence with locations (graph, source,
   emitted, runtime) and provenance.
   A finding is a pipeline result, not a graph mutation. It may point to
   graph facts, candidate patches, pipeline stages, emitted artifacts, or
   source spans. It may become a graph fact only through an explicit
   explain/devtool/audit materialization stage.
3. `InvariantFamily` and `InvariantInstance` — reusable templates
   (`RequiredField`, `AtLeastOnceRequiresIdempotency`) and concrete
   attachments to graph facts.
4. Replace string `errors[]` arrays in checkers with `DiagnosticFinding[]`.
   The existing `DIAGNOSTIC_CODES` enum (~60 codes) is a good starting
   point — graduate each into a `DiagnosticDef`.
5. **Diagnostic IDs must be stable**. `defineDiagnostic` currently uses
   `Date.now()` (`kernel/diagnostic.ts:161`). Replace with deterministic
   IDs derived from the diagnostic code + finding context.
6. Add `checked.applyFixes({ codes, mode: "candidate" })` that runs
   diagnostic-attached repair generators. The AI loop becomes:
   `prompt → candidate graph patch → verify → diagnostics with repairs →
semantic diff → user review → emit artifacts`.
7. **Pipeline diagnostic options**: `failOn: "error"`,
   `includeRemediation: true`, `includeCandidateFixes: true`. Every advanced
   API should _define its failure modes first_ — `dispatch.outbox(...)` ships
   with built-in diagnostics for the eight ways it can fail.

**D8. Graph patches as a first-class primitive, not an afterthought.**
Patchable diagnostics are necessary but not sufficient. The full AI loop
is: prompt → candidate graph patch → verify → diagnostics with repairs →
semantic diff → user review → emit. Promote graph patches to a real
primitive shared by Track D (diagnostic repairs), Track M's evolution
dialect (migration steps as patches), and Track N's importers (imported
JSON-render specs land as candidate patches).

```
gen.patch.addNode(kind, payload)
gen.patch.addEdge(kind, endpoints, metadata?)
gen.patch.removeEdge(edgeRef)
gen.patch.replaceMetadata(ref, metadata)
gen.patch.compose(...patches)
gen.patch.verify(graph, patch) -> Diagnostic[]
gen.patch.apply(graph, patch, mode: "candidate" | "commit")
gen.patch.diff(before, after) -> SemanticDiff
```

Patches carry provenance (`source: diagnostic | importer | recipe |
manual | ai`), require verification before commit, and are the unit of
change in the AI loop.

Diagnostic repairs are patch options attached to findings:

```
diagnostic.finding({
  code: "target.postgres.predicate_not_sql_lowerable",
  subject: rule.ref,
  repairOptions: [
    gen.patch.attachTrait(rule.ref, ServerOnly),        // marker trait -> edge
    gen.patch.replaceExpr(rule.body, sqlLowerableAlternative),
    gen.patch.attachAssurance(rule, Tested),            // edge to assurance kind
    gen.patch.addPredicate(...),                        // bodied case
  ],
})
```

`gen.patch.attachTrait` / `attachCapability` / `attachAssurance` write
edge attachments to kind nodes; `gen.patch.addPredicate` /
`gen.patch.addRule` / `gen.patch.addLaw` author bodied predicates. The
patch verifier reads `Edge` and `Predicate` uniformly and presents a
human-readable label based on the flavor witness or the edge kind's
display name.

The finding itself does not alter the graph. The user, AI agent, or
policy engine chooses a repair option, then the normal patch verifier
checks it before application.

**Exit:** one diagnostic shape; every pass returns typed `DiagnosticFinding`s;
AI agents can apply candidate graph patches; diagnostic codes are the
contract surface for external tooling; graph patches are first-class
primitives shared by diagnostics, evolution, and importers. Diagnostics
are first-class pipeline outputs with optional repair patches, not
implicit graph mutations.

---

### Track E — Pass pipelines replace lifecycle bridge

Maps to **R15**. This is the largest single rewrite.

**Status: §1 done, §2 in progress (5 of ~60 specs ported).**

`lifecycle.ts` started at 1,371 lines hosting ~60 `BuiltInCheckPassSpec`s
wrapped through `ctxCheckerToPass`. The plan splits this work as
`more_suggestions.txt` §3 recommends.

1. **Split `lifecycle.ts`** — **DONE** (PLAN target: under 200 lines; hit
   65). Decomposed into:
   - `src/lifecycle/runner.ts` (251) — orchestration: `check`, `generate`,
     phases, dialect-pass registration plumbing.
   - `src/lifecycle/legacy-check-bridge.ts` (623) — `ctxCheckerToPass`
     and the legacy pass list. Marked deprecated; on the architecture
     allow-list for `passCtx.options.genContext` reads.
   - `src/lifecycle/target-bridge.ts` (260) — `registerBridgeLowerPass` /
     `registerBridgeEmitPass`. Allow-listed bridge file.
   - `src/lifecycle/cross-store-legacy.ts` (168) — cross-store rules
     until they move into `dialects/query/passes/legalize-cross-store-read.ts`.
   - `src/lifecycle/lifecycle.ts` (65) — re-export wrapper for stable
     public surface.
2. **Port checks to dialect-owned passes**, in this order:
   1. domain / relation — _next_
   2. query
   3. rule — **partial** (`derive.rule.reads` and
      `canonicalize.derivedRuleViews` ported to `src/rules/passes.ts`;
      Track P derivations layer on top)
   4. callable / action / query reads / writes
   5. reactivity — **partial** (`derive.rule.invalidationDependencies`
      ported to `src/reactivity/passes.ts` as part of Track P §P6)
   6. auth / policy
   7. state / resource
   8. dispatch / reaction / event
   9. ui
   10. obligations / tests / docs
   11. target legalization

   **Ports landed (5)**: `legalize.requirements` (`src/requirements/passes.ts`),
   `legalize.contextStorage` (`src/context/passes.ts`), `derive.rule.reads`,
   `canonicalize.derivedRuleViews`,
   `derive.rule.invalidationDependencies`.

   **Pattern (now established and load-tested by Track P §P6):**
   - `src/<dialect>/passes.ts` exports `register*Passes(ctx)`.
   - `runner.ts:registerDialectPasses` calls it during `check(ctx)`.
   - The pass runner takes `(graph, _passCtx)` — never reads
     `passCtx.options.genContext`. Returns `modifiedGraph` if it
     emits new edges (via `registerEdge`, not `attachEdge`).

   **Port policy (per §0.5 #8 — "no new bridge"):** for each remaining
   spec, the migration is **port-or-delete**, not "wrap in
   `ctxCheckerToPass` and ship." The two outcomes:
   - **Port**: write a graph-native pass in `src/<dialect>/passes.ts`,
     register it from `runner.ts`, delete the spec from
     `legacy-check-bridge.ts`, delete the now-orphaned
     `ctx.X[]`-reading checker function.
   - **Delete**: if the spec checks something better expressed by a
     diagnostic that already fires elsewhere (e.g.
     `rules-reactivity:mutation-writes-rule-dependency` is subsumed by
     `derive.rule.invalidationDependencies`), delete the spec and the
     check. Pre-release lets us drop checks rather than port them when
     they're noise.

   **No more `_bridge*` metadata stamping.** When a graph-native pass
   needs typed-object access today, it has three legitimate paths:
   1. Walk the graph and read typed payloads from dialect-owned node
      kinds (the eventual end state).
   2. Use a typed lowering helper that takes graph nodes/edges as
      input (not a JS Entity/Rule/Policy).
   3. (Last resort, only if the helper hasn't been ported) Read
      existing `_bridge*` metadata. **Do not stamp new bridge keys**
      onto node kinds that don't already carry them — port the
      lowering helper to be graph-native instead.

3. **Pass dependency declarations** (`reads`/`writes`/`requiresTraits` are
   already on `KernelPass`) drive topological scheduling and Track A
   memoization. Not yet wired.
4. **Architecture test**: **DONE**.
   `tests/architecture/pass-ctx-genctx.test.ts` blocks new
   `passCtx.options.genContext` reads outside the bridge files.
5. **Delete the legacy `moduleCheckers` registry** — pending; only
   meaningful once all ~60 specs are ported. `legacy-check-bridge.ts`
   is at 48 specs (was 60).
6. Replace `standardPhases()` with `standardPassPhases()` — pending.

**Findings during the work** (in CURRENT.md detail):

- The runner discarded `pipelineResult.modifiedGraph`; fixed.
- `lowerRuleExpr` used a module-global counter; fixed (per-call
  `LoweringContext`).
- Two unowned edge kinds (`edge.kind.guards`, `edge.kind.writes`)
  surface as `dialect:unknown-edge-kind` warnings on the slice — real
  Track E porting targets.
- Slice diagnostic snapshot is noisier than necessary; ~4 codes are
  redundant now that R-8's pass exists.

**Exit:** `lifecycle.check` is a pure pipeline runner; no separate checker
registry; `lifecycle.ts` shrinks to under 200 lines; no pass reads
`passCtx.options.genContext`.

---

### Track F — Targets consume legalized target dialect IR only

Maps to **R15/R16**.

Target legalization, lowering, and emitting are all graph pipeline stages.
Lowering stages are `GraphDerivation`s that emit target-dialect patches;
emit stages consume those target-dialect graph facts, return the graph for
pipeline continuity, and produce declared artifact effects. The existing
`LoweringRegistry` should either converge with `GraphDerivation` or become
a phase-specific wrapper over the same primitive.

Lowerings must be generic over source and target dialect witnesses. A
Postgres lowering should state, at the type level, that it reads domain /
rule facts and emits `dialect.postgres` facts. A Postgres emitter should
then reject high-level entity/rule facts and accept only legalized
Postgres graph facts. This is the type-level form of the Track F "no
high-level IR in emitters" runtime guardrail.

1. Define target dialects: `dialect.postgres`, `dialect.react`,
   `dialect.solid`, `dialect.effect`, `dialect.json-render`,
   `dialect.openapi`, `dialect.alchemy`, `dialect.tests`, `dialect.docs`,
   **`dialect.graphql`**, **`dialect.trpc`**.
2. Per-target **legalization passes**:
   - `legalize.postgres`: domain.entity → storage.record → postgres.table;
     rule → sql.predicate → postgres.rls_policy; action.operation → SQL
     mutation; queue → outbox table.
   - `legalize.react`: ui.view → ui.view_model → react.component; query →
     resource hook; action → mutation hook; rule → disabled state if
     client-safe.
   - `legalize.json-render`: ui.view → catalog + spec.
   - `legalize.alchemy`: deployment requirement edges → IaC resource graph.
   - **`legalize.graphql`**: query → GraphQL `Query` field; action →
     `Mutation` field; reactive resource → `Subscription`; entity → object
     type; projection → selection-set narrowing; rule → field-level auth
     directive (when client-safe and lowerable); module → federated
     subgraph.
   - **`legalize.openapi`**: query/action → operation; entity → component
     schema; projection → response schema; rule → auth metadata; module →
     tag grouping.
   - **`legalize.trpc`**: query → `t.procedure.query`; action →
     `t.procedure.mutation`; subscription → `t.procedure.subscription`.
3. **API-surface lowering is uniform** (§0.1.6). The same query/action/
   boundary graph emits Postgres handlers, Effect server programs, React
   hooks, GraphQL schemas, OpenAPI documents, tRPC routers, JSON-render
   specs — driven by which targets are registered and what laws/traits
   the schema carries. Adding a new API surface (e.g. JSON:API, ConnectRPC)
   is a new lowering, not a schema rewrite.
4. **Reject non-legalized input** at emit time with typed diagnostics.
5. Migrate every emitter in `src/targets/*` and `src/adapters/*` to consume
   legalized target IR. Delete code paths that read entities/queries/actions
   directly.

**Exit:** the "no high-level IR in emitters" guardrail is enforced by both
a lint test and the runtime; the same query/action/boundary graph emits
GraphQL, OpenAPI, tRPC, server actions, REST, and SSE/WebSocket
subscriptions through their respective lowerings.

---

### Track G — UI dialect: AF-UI authoring + JSON-Render + forms/lists/projections

Maps to **R14** plus `ui.txt`, `more_suggestions.txt` §"forms.ts",
§"list.ts", and the projection model in
`gen_2_new_design_readme.md` §"Define queries and resources".

1. Strict separation:
   - **`dialect.ui`** = canonical graph vocabulary
     (View, Slot, Component, Element, Behavior, Style, DesignSystem, Token).
   - **AF-UI** = authoring style (slots, capabilities, behaviors).
   - **JSON-Render** = serialization target/import.
   - **React/Solid/RN/TUI** = lowering targets over the same UI graph.
2. Slot capabilities as typed traits (`UiInteractive`, `UiContainer`,
   `UiText`, `UiInput`, `UiCollection`).
3. Behavior attachment uses **typed `SlotRef`s**, not slot-name strings.
4. JSON-Render emitter (catalog + spec).
5. JSON-Render importer with verification passes
   (`verify.knownCatalogComponents`, `verify.slotCapabilityCompatibility`,
   `verify.actionInputCompatibility`, `verify.stateBindingCompatibility`,
   `verify.noServerOnlyData`).
6. **Forms as UI graph fragments**, not a parallel subsystem. `forms.ts`
   becomes `dialect.ui.form` over the same UI graph:
   ```
   Node(Form), Node(FormField), Node(Widget), Node(ValidationRule)
   Edge(FormSubmitsAction), Edge(FormFieldBindsInput),
   Edge(FormFieldUsesWidget), Edge(WidgetRequiresCapability)
   ```
   `app.form.fromAction(...)` derives form fields from the action contract;
   widget fallback (`textInput` when target lacks support) becomes a
   _legalization_ decision with a diagnostic, not a builder-level eager
   rewrite.
7. **Lists as UI recipes**, not a separate top-level subsystem. `list.ts`
   becomes `app.ui.list(...)` lowering to view/column/pagination/row-action
   graph facts. Keep TanStack-specific features as target legalization
   hints, not core fields.
8. **Projections as a first-class safety feature**. `app.projection(...)`
   produces a typed graph fact:
   ```
   ClientIncidentCard projects a safe subset of Incident,
   with placement: ClientBoundary, sensitivity: user.
   ```
   Server-only fields cannot be referenced from client UI without a
   projection. Resources, lists, and forms accept projections as first-class
   inputs; client/server leakage becomes a graph diagnostic.
9. The AI UI loop end-to-end:
   `emit catalog -> AI produces spec -> import -> verify -> emit runtime`.
10. **Inside-out composition** (`ui.txt`). AF-UI's distinguishing pattern
    is that _Views expose Slots; Behaviors and Styles attach to Slots
    from outside_. The graph encodes this directly:
    `Edge(ViewExposesSlot)`, `Edge(BehaviorAttachesToSlot)`,
    `Edge(StyleAttachesToSlot)`. A behavior's required capabilities must
    be a subset of the slot's declared capabilities, checked by
    `verify.ui.slotCapabilityCompatibility`. This is what makes UI
    composition _typed_ rather than name-matched.
11. **Requirement bubbling** through the UI graph: a view containing an
    element that uses a behavior that runs an action that requires
    `AuthSession` _transitively requires_ `AuthSession`. The UI graph
    must surface this on the view node so target lowerings can wire
    providers correctly. New pass:
    `derive.ui.transitiveRequirements`.
12. **State bindings via typed refs**. `slot.bindsState(StateResource)`
    is a typed edge that points at a `StateResource` node (Track H);
    the _same_ binding lowers to a React `useAtom`, an Effect Atom
    subscription, or a JSON-render `{ "$bindState": "/path" }` pointer.
    No string paths in typed APIs.
13. **One UI graph, many renderers** — the same `dialect.ui` graph
    facts lower to React, Solid, React Native, TUI, or JSON-render.
    Each renderer is a target lowering (Track F); none is canonical.

**Exit:** an AI agent can edit the UI by editing graph facts only; no
hallucinated React code path. Forms and lists are derivable from the
action/query/projection graph. Slot capabilities, behavior attachments,
and style attachments are typed graph edges; the same UI graph emits
React, Solid, JSON-render, and others through their respective
lowerings.

---

### Track H — Dataflow + merge + boundary + reactivity dialects

Maps to **R11/R12** plus `multi-value.txt`, `more_suggestions.txt`
§"merge.ts" and §"boundary.ts", and the reactivity rebase notes.

**H1. Dataflow dialects** (separate, on top of the kernel):

- `dialect.collection` — List, Set, Map, Page + collection operations.
- `dialect.async` — Result, Exit, ResourceState, AsyncGroup,
  CancellationScope.
- `dialect.stream` — Stream, Source, Sink, Subscription, Topic,
  Backpressure, Checkpoint.
- `dialect.queue` — Queue, Mailbox, Message, Envelope, Retry, DLQ, Drain.
- `dialect.resource` — StateResource, ReactiveResource, Hydration,
  TrackingScope.
- `dialect.variant` — Enum, LiteralUnion, TaggedUnion, StateMachine,
  transition operations.

**H2. `dialect.merge` is its own first-class dialect** (not a sync
subfeature). It powers sync, offline replay, optimistic rollback, parallel
workflows, retry plans, event replay, queue dedup, state resources,
CRDT-style collaboration, database migrations, field-level conflict UI.
Hierarchy: type-level default → field-level override → entity-level
conflict policy → action-level conflict behavior → plan-level retry/replay
→ target-level capability support. Operations: `replace`, `last_write_wins`,
`max`, `sum_delta`, `set_union`, `add_remove_set`, `field_wise`,
`by_id_collection`, `state_machine`, `manual_conflict`, `reject_conflict`,
`custom_expr`, `opaque_runtime`. Boolean law fields (`associative`,
`commutative`, etc.) become law traits with assurance levels (Track B).

**H3. `dialect.boundary` is also first-class** (not just client/server).
Real apps have multi-hop boundary chains:
`browser → server action → outbox → queue → worker → external API`.

- Use `from`/`to` or `path: [B1, B2, B3]` instead of `client_boundary` /
  `server_boundary`.
- `Node(BoundaryCallPlan)`, `Node(Transport)`, `Node(SerializationContract)`,
  `Node(HydrationPlan)`, `Node(OfflineCommandPlan)`.
- Edges: `CallableRunsInBoundary`, `CallCrossesBoundary`,
  `BoundaryCallUsesTransport`, `BoundaryCallRequiresAuth`,
  `BoundaryCallCarriesInvalidationPayload`,
  `BoundaryCallUsesOptimisticPlan`, `BoundaryCallUsesOfflinePlan`.
- Diagnostics with remediation: `boundary.queue.requires_idempotency`,
  `boundary.serverOnly.not_client_callable`, `boundary.edge_runtime.effect_unsupported`.

**H3a. Boundary is the GraphQL-style API surface, lifted** (§0.1.6).
The combination of `Query` + `Action` + `BoundaryCall` + typed
`Entity`/`Field`/`Type` schema + `Projection` is **the entire
GraphQL/tRPC/OpenAPI authoring surface**, but lifted to a compiler IR
that can lower to all of them simultaneously. The same authored graph
emits:

- A GraphQL schema + resolvers (Track F `legalize.graphql`).
- An OpenAPI document + route handlers (Track F `legalize.openapi`).
- A tRPC router (Track F `legalize.trpc`).
- Server actions (Next/Remix/SolidStart-style).
- WebSocket / SSE subscription bindings.
- Direct in-process calls for SSR.

User-facing rule: never write the API layer twice. Define the schema +
queries + actions + boundaries once, choose transports per deployment.

**H3b. Subscriptions are derived, not declared.** GraphQL forces users
to write `Subscription` resolvers separately. In Gen2, a subscription is
an emergent property of `ReactiveResource` (Track H) + `Action invalidates
Resource` edges (Track P) + the boundary's transport choice (`websocket`
or `sse`). The lowering passes (`legalize.graphql.toSubscription`,
`legalize.boundary.toWebSocket`) read the same reactivity graph and emit
target-native subscription bindings. No separate authoring step.

**H4. Merge ↔ boundary connect.** Passes can combine: an action with
`offline` transport that writes a `state_machine` field with no conflict
policy ⇒ `offline.command.requires_merge_policy` diagnostic.

**H5. Reactivity rebase**: stop maintaining a separate `ReactiveGraph`.
`KeyFamily`, `ReactiveResource`, `ReactiveMutation`, `OptimisticPlan`,
`TrackingScope`, `ResourceAll`, `ResourceChain`, `DerivedResource`,
`StreamResource` all become nodes/edges in the kernel graph.
`rule-derived.ts` invalidation derivation switches from global edge scans to
graph views (Track A) — `rw.actionsWritingFields()`,
`policies.queriesGuardedByRules(rules)`, `keys.keysForQueries(queries)`.

**H5a. Reactivity has three tiers** (`sync.txt`,
`gen_2_new_design_readme.md` §"Manual reactivity still exists",
`reactions.txt`). The plan must keep these distinct:

1. **Manual reactivity** — explicit `gen.key.family(...)` declarations,
   explicit `action.invalidates(KeyFamily.any())` edges. The user
   declares stable cache keys and which mutations invalidate them. This
   tier never goes away; it is essential for external systems, opaque
   logic, hand-tuned cache hierarchies, and domain-specific invalidation.
2. **Derived reactivity from entity/relation/field reads+writes** — given
   `Entity` / `Field` / `Relation` and an action's writes, plus a query's
   reads, the compiler **derives** invalidation entirely without manual
   declarations. The user only writes manual keys when they need explicit
   precision; otherwise the entity-relation graph is a _free reactivity
   source_. Manual and derived facts share the same edge kind
   (`InvalidatesKey`) with `provenance: explicit | derived | conservative`.
3. **Rule-based reactivity (reactions)** — Track I's `Dispatch`
   triggered by a rule transitioning from false to true. Distinct from
   Track P's "predicate reads → action writes → invalidation" derivation:
   rule-based reactivity is _event-driven side effects_ when a predicate
   becomes true; rule-derived invalidation is _cache invalidation_ from
   the same predicate's reads. Both share the rule node; they are
   different downstream uses.

The user-visible distinction:

```
manual:   archiveUser.invalidates(UserListKey.any())          // explicit
derived:  // nothing to write — compiler sees the field overlap
reaction: gen.dispatch.reaction({ when: incidentBecomesSev1, run: notify })
```

Each tier produces graph facts in the same dialect; passes consume them
uniformly.

**H5b. Reactivity lowers to multiple runtime targets** _(this is why
graph-native reactivity matters — it isn't TanStack Query and isn't
Effect Atom and isn't PowerSync; it's the **compiler IR** that lowers
to all of them)_:

| Target                                 | What the same reactivity graph emits                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **TanStack Query**                     | `queryKey` arrays, `useQuery` hooks, `useMutation` hooks with `invalidateQueries` calls, optimistic update closures |
| **Effect Atom**                        | reactive atoms with dependency tracking, `Atom.subscribe` bindings, atom invalidation on mutation                   |
| **TanStack DB / PowerSync / Electric** | sync engine bindings, conflict resolution policies, offline replay queue                                            |
| **SolidJS signals**                    | `createSignal`/`createMemo`/`createResource` graph + dependency tracking                                            |
| **Custom Gen2 runtime**                | full reactive runtime with explicit invalidation, optimistic patching, IVM                                          |
| **JSON-render**                        | `{ "$bindResource": "OpenIncidents" }` pointers + hydration plan                                                    |

The lowering pass per target reads the _same_ graph facts (KeyFamily,
QueryReadsField, ActionInvalidatesKey, OptimisticPlan, RefreshPolicy,
TrackingScope) and emits target-native code. Adding a new reactive
runtime is a new lowering, not a new authoring concept. **This is the
sync-semantics-vs-sync-machinery split from `sync.txt` made concrete.**

A new dedicated pass family in `dialects/reactivity/passes/lower/`:

```
legalize.reactivity.toTanStackQuery
legalize.reactivity.toEffectAtom
legalize.reactivity.toTanStackDb
legalize.reactivity.toSolidSignals
legalize.reactivity.toJsonRender
legalize.reactivity.toGen2Runtime
```

Each emits target IR consumed by the matching emit pass. Capability
reports (Track N) classify each (resource × target) pair as supported /
degraded / unsupported with reasons.

Migrate the legacy `state_resources`, `offline_queues`, `subscriptions`,
`reactions`, `reactive_resources`, `reactive_mutations` arrays into these
dialects (Track J).

**Exit:** offline replay, merge safety, conflict policy, multi-hop boundary
plans, and stream backpressure are graph-derivable; the three-tier
reactivity model (manual + derived + rule-based) is unified in graph
edges with `provenance` distinguishing them; the same reactivity graph
lowers cleanly to TanStack Query, Effect Atom, TanStack DB / PowerSync,
SolidJS signals, JSON-render, and a Gen2-native runtime; legacy
reactivity arrays can be deleted.

---

### Track I — Effects, events, dispatch, idempotency, outbox

Maps to **R10**. Sourced from `reactions.txt`.

Hard invariant: **rules stay pure; dispatch owns effects.**

1. Node kinds: `Effect`, `Capability`, `Event`, `Dispatch`,
   `DeliveryPlan`, `IdempotencyPlan`, `OutboxPlan`, `Reducer`.
2. Edges: `NodeHasEffect`, `EffectRequiresCapability`, `ActionEmitsEvent`,
   `DispatchTriggeredBy`, `DispatchRunsHandler`, `DispatchDeliveredBy`,
   `DispatchUsesIdempotency`, `DispatchWritesOutbox`,
   `ReducerUsesOperation`.
3. Verification passes for the diagnostics listed in `revised_phases_new_design.md`
   §R10 (`dispatch:at-least-once-requires-idempotency`,
   `dispatch:side-effect-without-delivery`, etc.).

**Exit:** events, reactions, subscriptions, reducers, and outbox plans
share a single `Dispatch` model.

---

### Track J — Resume R13: delete legacy `GenContext` arrays

Only safe **after** Tracks E, F, H, I land for each family.

Order (matches `r13-remaining-arrays.md`):

1. Group C: `requirements`, `providers`, `contexts`, `context_provisions`,
   `context_requirements`, `storage_locations` — already largely graph-backed
   from R2 work; flip readers, then delete.
2. Group D: `events`, `event_emissions`, `reducers`, `subscriptions`,
   `reactions` (most already deleted) — finish bridge removal once Track I
   lands.
3. Group E: `state_resources`, `offline_queues`, `offline_commands` — after
   Track H.
4. Group F: `policies`, `rules`, `claims` — after Track E + auth dialect work.
5. Group G: `forms`, `views`, `components`, `styles`, `behaviors`, `themes`,
   `lists`, `cruds`, `editors` — after Track G.
6. Group H: `actions`, `queries`, `mutations`, `patches`, `plans`,
   `workflows`, `static_functions`, `query_functions`, `action_functions`,
   `patch_functions`, `plan_functions`, `routes`, `boundary_plans`,
   `obligation_graphs` — after Tracks E and F land all readers.

**Exit:** `GenContext` carries only `graph`, `plugins`, `config`, `status`,
`diagnostics`, `artifacts`, `helpers`, `pass registry`.

---

### Track K — Authoring facade normalization (constructor matrix)

Maps to **R7–R9** §"public constructor facade policy". The matrix is
spelled out in §2.5 above; this track is the implementation work to make
it real.

Every major constructor must support multiple forms that **all normalize to
one canonical definition shape** with shared graph-fragment lowering:

```ts
defineX()                                  // builder
defineX("Name")                            // curried named binder
defineX("Name")({ … })                     // object form
defineX("Name")((ctx, b) => …)             // callback-with-context form
class X extends defineX.class("Name", { … }) {}  // .class facade (where useful)
kernel.graph.pipe(xDef)                    // graph fragment
```

Implementation order (matches the matrix priorities in §2.5):

1. **Entity (`.class` primary)** — `domain.entity.class("User", { fields: { … } })`.
   The literal `User` class must expose `User.ref`, `User.type`,
   `User.fields.email`, `User.fragment`, `User.$infer.value`, and be
   directly usable in `kernel.graph.pipe(User)`. Spec is passed to a
   generic factory _before_ the class is constructed; no runtime instance
   scanning, no decorators.
2. **Rule, action, query** — primary form is callback-with-context:
   `app.rule("name")((ctx, rule) => rule.vars(...).when(...))`. Plus object
   form. No `.class` (weaker fit per the matrix).
3. **Event, view** — `.class` is a "good" fit; ship both `.class` and
   callback forms.
4. **Operation, dispatch** — full matrix including type-family form (Track
   B §B4). Operations need `.binary`, `.predicate`, `.aggregate`, `.effect`,
   `.family`, `.opaque`.
5. **Type, trait, law** — primary is object form; builder secondary.
6. **`emit`, `edge`, `pass`** — restricted matrix per §2.5 (no `.class`,
   limited builder).

**Each form must lower to the same internal `XDef`**. A failing test in
`tests/facades/` should construct the same definition four ways and
assert byte-identical graph fragments.

**Public namespace policy**: do not expose every form equally. Lead docs
with the primary form for each constructor (see "Documentation rule" in
§2.5).

**Exit:** the "north star example" at the bottom of
`revised_phases_new_design.md` compiles cleanly with no casts; the
recommended-style snippet (entity `.class` + `app.action(...)` callback +
`kernel.graph.pipe(...)`) is the canonical README example.

---

### Track L — Documentation (doc-parallel, not doc-after)

Maps to **R18**, but with a sequencing change. Documentation written
_after_ every track lands describes what was built, not what should have
been built. Most successful compilers iterate doc-first or doc-parallel.

**Policy**: write the _target_ README section for each major API before
the API ships. Specifically:

- Track B's operation builder ships with its README section drafted first.
- Track G's UI dialect ships with the AF-UI / JSON-Render guide drafted
  first.
- Track O's kits ship with `gen.kit.saas` user guide drafted first.

If the doc cannot be written cleanly, the API shape is wrong; iterate the
shape before writing code.

**Lead the README with rules.** The current OpsDesk-style example leads
with entities and actions — that's reasonable framing but understates the
compounding effect. The new top-of-README example is **rules-first**:

```
"Here is one rule.
 Watch what Gen2 generates from it."

const canManageIncident = app.rule("canManageIncident")((ctx, rule) =>
  rule
    .vars({ session: AuthSession, incident: Incident })
    .when(({ session, incident }) =>
      expr.and(
        expr.eq(session.organizationId, incident.organizationId),
        expr.oneOf(session.role, ["owner", "admin", "responder"]),
      ),
    ),
);

// Gen2 derives, from this single expression:
//
//   server guard      ✓        RLS policy        ✓
//   SQL predicate     ✓        UI disabled state ✓
//   form validation   ✓        access matrix     ✓
//   reactivity edges  ✓        IVM plan          ✓
//   test truth table  ✓        audit explanation ✓
//   optimistic update ✓
//
// Type, action, and query come *after* — supporting the rule.
```

This framing communicates the thesis in 30 seconds. It is the demo
that sells the library.

Once Tracks A–F have landed, rewrite the docs the agent guidance points to:
`docs/revised-kernel.md`, `docs/dialects.md`,
`docs/constructor-facades.md`, `docs/graph-composition.md`,
`docs/types-transforms-operations-laws.md`,
`docs/expressions-and-rules.md`, `docs/diagnostics-and-invariants.md`,
`docs/callables-actions-queries.md`, `docs/dispatch-events-effects.md`,
`docs/dataflow-async-streams-queues.md`,
`docs/reactivity-sync-offline-ivm.md`,
`docs/ui-dialect-and-json-render.md`, `docs/pass-pipelines.md`,
`docs/effect-interop.md`, `docs/plugin-authoring.md`,
`docs/target-authoring.md`, `docs/migration-from-old-phases.md`.

Mark old phase guides historical; update `AGENTS.md` to point at the new docs.

---

### Track M — Product-grade standard dialects

Sourced from `more_suggestions.txt` §19 ("Possible missing dialects") and
`gen_2_new_design_readme.md` §"Versioning and migrations" /
§"Obligations" / §"Define placement and providers". These are not in the
hard kernel, but ship with Gen2 as standard dialects.

**M1. `dialect.evolution`** — schema versioning, snapshots, migration plans.

- Nodes: `SchemaManifest`, `GraphSnapshot`, `GraphVersion`,
  `MigrationPlan`, `MigrationStep`, `MigrationHook`, `MigrationState`,
  `BreakingChange`, `CompatibilityReport`, `BackfillPlan`, `RenameHint`.
- Edges: `VersionFollowsVersion`, `SnapshotCapturesGraph`,
  `MigrationFromSnapshot`, `MigrationHasStep`, `StepAffectsField`,
  `StepRequiresBackfill`, `StepEmitsArtifact`.
- **Rename intent** in the authoring API: `field(...).renamedFrom("summary")`
  or `gen.evolution.renameField({ from: "Incident.summary", to: ... })`.
- **Compatibility surfaces, not just SemVer**: per-target SemVer
  (database / server API / client SDK / OpenAPI / JSON-render / event
  payloads / queue messages / deployment resources). Output:
  `database: patch; openapi: major; typescript: major; jsonRender: minor`.
- **Snapshot privacy**: profile with `redaction: "strict"`,
  `exclude: ["secrets", "runtimeConfig", "closures"]`, and verification
  passes (`snapshot.verify.noSecrets`, `snapshot.verify.allRefsStable`).
- **`gen.evolution.preview(prev, next).print()`** — dev-mode unsafe
  migration preview classifying changes as Safe / Needs attention / Blocked.
- **Data-shape transforms** for backfills reuse Track B's
  Transform/Expr/Operation dialects.

**M2. `dialect.error`** — typed failure model.

- `ExpectedError`, `Defect`, `RecoverableError`, `ValidationError`,
  `AuthorizationError`, `ConflictError`, `TransportError`,
  `ProviderUnavailable`, `RetryPolicy`, `ErrorSurface`, `ErrorMapping`.
- `app.error("IncidentConflictError", { kind: "conflict", recoverable: true,
userVisible: true, remediation: "manual_resolution" })`.
- Action `.errors([…])` and `.onError(error, { surface, retry })` wire
  errors to UI surfaces, OpenAPI, Effect runtime mapping, test obligations.

**M3. `dialect.observability`**

- `Metric`, `TraceSpan`, `LogEvent`, `AuditEvent`, `RuntimeProbe`,
  `HealthCheck`, `Slo`, `Alert`, `TelemetrySink`.
- `app.observability.metric(...)` derived from event sources;
  `app.observability.healthCheck(...)` over queues/resources.

**M4. `dialect.privacy`** — beyond simple sensitivity tags.

- `User.fields.email.classify({ privacy: "pii", retention: "while_account_active",
erase: "on_user_delete", logs: "redact", devtools: "masked" })`.
- Classifications: PII, PHI, PCI, GDPR-eraseable, retention period,
  consent required, audit required, export allowed, redaction policy,
  devtools visibility, logs allowed/forbidden.
- Verification passes: PII not logged raw, regulated fields not
  client-readable, eraseable data has deletion path, audit-required
  actions emit audit facts.

**M5. `dialect.fixture`** — graph-aware test fixtures and scenarios.

- `app.fixtures("IncidentFixtures", { entities, scenarios: { sev1OpenIncident,
viewerCannotAcknowledge: { expected: app.expect.forbidden(...) } } })`.
- Tests, docs, and examples share the same fixture graph.

**M6. `dialect.package`** — module exports + semantic versioning.

- `app.package("incident-workflows", { version: "2.1.0",
compatibility: { graph: "^1.0", postgres: ">=16" },
breakingChanges: app.package.detectBreakingChanges() })`.
- Composability tests: `app.moduleTest(IncidentModule,
{ with: [...], targets: [...] }).expectNoErrors()` — checks all imports
  satisfied, no symbol collisions, no duplicate providers, no incompatible
  traits, no unsupported target requirements, no client/server leaks.

**M7. `dialect.obligation`** (already partially exists in `obligations.ts` —
finish the migration).

- Node(Obligation), edges to source / artifact-kind / consumer pass /
  satisfying artifact / blocking diagnostic.
- Priorities: required / recommended / optional.
- Derive passes: `policyTests`, `mutationInvalidationTest`,
  `optimisticRollbackTest`, `accessMatrixDoc`, `reactivityTests`,
  `hydrationTests`, `dispatchDeliveryTests`, `workflowTests`,
  `migrationTest`, `compatibilityDoc`, `rollbackRunbook`.

**Exit:** evolution, error, observability, privacy, fixture, package,
obligation are first-class dialects with passes and target lowerings.

---

### Track N — Explain / preview / textual IR (this is the product, not polish)

Sourced from `more_suggestions.txt` §6, §7, §10, §11, §13, §14, §17, §"AI
loop" plus `gen_2_new_design_readme.md` §"Preview, expand, explain". See
§0.5 #5 — these are not nice-to-haves.

**Why this moves up.** The reason Gen2 wins over scattered codegen is
that derivations are auditable. If a skeptical developer's first-day
experience is `app.explain(...)` returning a clean derivation chain, they
understand the value proposition immediately. If their first-day
experience is a black-box "trust me, the invalidation is correct", they
bounce. Land §1–4 below in parallel with Tracks B and D, not after H.

1. **`app.preview(x)`** — show what graph facts a definition (entity, view,
   action, recipe, module) would emit, plus what the compiler would derive
   from them (resources, mutations, boundary calls, test obligations,
   diagnostics). Preview should show the full `GraphStageResult`: candidate
   patches, diagnostics, artifacts, explanations, and the resulting graph.
2. **`app.expand(recipe)`** — make recipe expansion a visible artifact,
   not opaque. `IncidentLifecycle.expand({ format: "graph" | "typescript" |
"explain" })` returns the underlying graph fragment / TS witness / plain
   English explanation. Critical for AI agents that need to understand
   generated structure before editing it.
3. **`app.explain(edge, subject)`** — _every_ derived fact must be
   explainable. Example output: "acknowledgeIncident invalidates
   OpenIncidentsKey because: (1) writes Incident.status; (2) listOpenIncidents
   reads Incident.status; (3) listOpenIncidents derives OpenIncidentsKey;
   (4) operation TransitionIncidentStatus may affect predicate; (5) exact
   patch was not proven for all sort positions; (6) fallback is broad
   invalidation."
4. **`app.traceArtifact("generated/web/IncidentList.tsx")`** — go from
   emitted file back to the graph nodes/edges/passes that produced it.
5. **`appGraph.inspect()`** — visual / debuggable graph inspector with
   views: Entity graph, Read/Write graph, Rule dependency, Action/Event/Dispatch,
   Provider/Requirement, UI slot/behavior, Target lowering, Diagnostic
   provenance, Artifact provenance.
   Diagnostic provenance includes why the finding was emitted, which graph
   facts / patches / artifacts it points at, and which repair patches are
   available.
6. **`appGraph.diff(previousGraph, nextGraph)`** — first-class semantic
   diff. Output: "Added Entity IncidentUpdate; Changed Rule canResolveIncident;
   Added Dispatch notifyOnIncidentDeclared". Powers migrations, AI review,
   deployment change sets.
7. **`appGraph.capabilities.report({ targets: [...] })`** — capability
   reports + `targets.negotiate({ desired, targets })` for capability
   negotiation. Walks registered `Surface` declarations (§B3b) rather
   than reading ad-hoc per-dialect capability strings. Output classifies
   each artifact: supported / partial / unsupported with reasons,
   sourced from the surface's typed `resultShape` and the
   morphism's actual fulfillment status. A desired surface with no
   registered fulfillment produces a typed diagnostic listing dialects
   that could provide it.
8. **`gen.import.*`** — importers as peers to emitters:
   `gen.import.jsonRenderSpec`, `gen.import.openApi`,
   `gen.import.postgresSchema`, `gen.import.prismaSchema`,
   `gen.import.previousGraph`. Each produces candidate graph facts plus
   diagnostics; `appGraph.pipe(imported.acceptedFacts)` merges them in.
9. **Textual IR as a first-class artifact** (MLIR-style):
   ```
   entity Incident {
     field id: uuid primary
     field title: string required
     field status: IncidentStatus merge state_machine
   }
   action acknowledgeIncident {
     input incidentId: uuid
     requires AuthSession, RequestClock
     guard canAcknowledgeIncident
     writes Incident.status, Incident.acknowledgedAt
     emits IncidentAcknowledged
   }
   ```
   Powers reviews, AI edits, semantic diffs, docs, migration explanations.
10. **Generated `.d.ts` graph witness** as a core target artifact:
    `targets.typescript.artifacts.graphWitness({ path: "generated/opsdesk.graph.d.ts" })`.
    Lets app code import a lightweight type-level view without importing the
    whole compiler graph.

**Exit:** every derived fact is explainable; every artifact is traceable;
recipes can be expanded; the AI loop has structured input/output surfaces.

---

### Track O — Application kits, recipes, modules (progressive disclosure)

Sourced from `more_suggestions.txt` §"What worries me", §1–3, §15, §16, §19,
§20 plus `gen_2_new_design_readme.md` §"Compose modules" /
§"OpsDesk" / §"Define placement and providers".

The library has too much surface area for users to meet at once. The product
lives or dies on **progressive disclosure** with three altitudes.

**O1. `gen.kit.saas(...)` — opinionated application kits.**

```ts
const app = gen.kit.saas("OpsDesk", {
  tenantModel: "organization",
  auth: "session-cookie",
  database: targets.postgres,
  server: targets.effect,
  web: targets.react,
  deployment: targets.alchemy,
  defaults: {
    timestamps: true,
    audit: true,
    optimisticMutations: true,
    offlineCommands: true,
    jsonRender: true,
    generatedTests: true,
    generatedDocs: true,
    graphWitness: true,
  },
});
```

Plus `gen.quick.saas(...)` for the "minimal mode" entry point.

**O2. `gen.recipes.*` — graph recipes for common SaaS patterns.**

- `recipes.stateTransitionAction({ entity, field, from, to, guard, audit, event, optimistic })`
- `recipes.notificationPipeline({ trigger, queue, deliveryPlan })`
- `recipes.tenantPolicy({ tenant, entity, rules, enforce })`
- `recipes.crud(Entity)`, `recipes.auditLog`,
  `recipes.optimisticMutation`, `recipes.offlineCommand`.

Every recipe must be **expandable** (Track N §2) — opaque recipes are
forbidden.

**O2a. Recipes are graph authors, not shortcuts around the graph.**
This is a load-bearing product claim, not a slogan. The same-graph-IR
guarantee — every fact a recipe emits is a fact a power user could
have written by hand — creates a hard inspection obligation. The
following four surfaces must work identically across all three
altitudes (`gen.kit.saas` / `gen.app(...)` / raw IR):

```ts
app.recipe.expand().printFacts();
app.explain(Customer);
app.preview();
app.showSourceFacts("generated/postgres/schema.sql");
```

Each must walk back to **original graph facts**, never to "opaque —
recipe boundary." If any of the four returns an opaque envelope, the
recipe is broken — not the inspection API. This rules out:

1. **Opaque codegen inside recipes.** A recipe may not emit a string
   blob that becomes an artifact directly; it must emit graph
   facts that the standard emit pipeline lowers.
2. **Hidden state inside recipe values.** A recipe's return value is
   the graph-fact tuple it produced, not a closure over private
   state. Recipes are functions from config to fact tuples.
3. **Different explanation paths for recipe-emitted facts.** A fact
   produced by `recipes.crud(Invoice)` and the same fact written by
   hand in `gen.app(...)` must explain identically — the provenance
   edge points back to the recipe call site, but the rest of the
   explanation chain is identical.
4. **Type-system holes at the recipe boundary.** A recipe's
   parameters are typed; its emitted facts preserve those types in
   `$infer`; the recipe's return value is a typed witness over the
   facts it emitted, not `unknown` or `any`.

**Test obligations** (Track N coverage — every recipe must pass):

- `recipe.expand(config).facts` round-trips through `app.preview()`
  with byte-identical output to the hand-authored equivalent;
- `app.explain(<entity>)` produces the same fact chain whether the
  entity came from a recipe or hand-authored code;
- `app.showSourceFacts(<artifact>)` returns the recipe's emitted
  facts (with provenance back to the recipe call), not an opaque
  "produced by recipes.crud" stub;
- the recipe surface lints itself: a recipe that fails to satisfy
  the four inspection methods above fails its own test.

**Recipe boundary in the meta graph.** Recipes register as a typed
fact in the meta graph: `Recipe(<id>) producedFacts [<fact ids>]`
with provenance back to the recipe call site (file + line). This is
how `app.explain(<entity>)` knows to attribute facts to recipes
without losing the chain — the recipe is a _layer_ of provenance,
not a wall.

**Reasoning.** Altitude 1 is the entry point for most users. If
recipes are toys — opaque, un-debuggable, second-class citizens of
the inspection surface — the "three altitudes lower to the same IR"
story collapses to "two altitudes plus a magic mode." That is a
worse product than not shipping recipes at all, because it breaks
trust in the rest of the inspection promise.

**O3. `app.module("name", { imports, exports, config })` — first-class
feature modules** as graph fragments with contracts. Without module
contracts, large apps become "one giant graph blob"; modules give natural
edit boundaries for AI, package reuse, semantic versioning, error messages,
graph shaking, and generated docs.

**O4. Strict mode levels** for progressive enforcement:

```ts
gen.config({
  strictness: {
    mode: "production", // prototype | developer | production | regulated
    graph: "strict",
    typing: "strict",
    target: "strict",
    privacy: "strict",
    obligations: "error",
    opaqueCode: "deny_without_declared_blast_radius",
  },
});
```

This is the path from AI prototype to regulated SaaS.

**O5. Escape hatch protocol** — opaque code is allowed; _unknown impact_ is
not. Every `expr.opaque(...)` / `action.opaque(...)` / `gen.operation.opaque(...)`
must declare reads, writes, effects, placement, lowerability, reactivity
precision, fallback behavior, and test obligations.

**O6. Bidirectional deployment.** `deploy.stack("production", { capabilities: [...] })`
not only emits IaC but constrains legal graph plans — "SMS effect requires
sms provider; production target does not support it" becomes a diagnostic.

**O7. `.requires(...)` inference.** Action body referencing `auth`, `clock`,
`db` infers `ActionRequires AuthSession`, `ActionRequires RequestClock`.
Explicit `.requires(X)` still works for clarity. Diagnostic if body uses an
undeclared requirement. Lifetime-scope safety: TS warning when a
`request`-lifetime requirement is referenced from a global provider.

**Exit:** a developer can ship a working SaaS app in 20 lines via
`gen.quick.saas(...)`; a power user composes modules; a compiler/plugin
author wires dialects; an AI agent edits typed graph facts. All four
altitudes share one canonical graph.

---

### Track P — Predicates as the keystone derivation (critical path)

Sourced from `rules.md.txt`, the eleven derivations in §0.2, the
refinement examples in `more_suggestions.txt` §"Example: types, laws,
manual reactivity, rules, refinements, and IVM", and the rule sections
of `gen_2_new_design_readme.md` and `gen_3_revised_readme.md`. Builds on
the `Predicate` IR introduced in §B3.

**This is not "the rule dialect"** — there's already a callable/rule node
kind, and §B3 unifies traits/laws/rules into one `Predicate` node kind.
This track is the cross-cutting story that makes predicates deliver on
their fan-out promise. It coordinates work in Tracks B (operations +
predicate IR), C (witness inference), D (diagnostics + lowerability
matrix), E (dialect-owned passes), G (UI hints), H (predicate-derived
reactivity).

Rules are the demo case throughout this track because entities are the
busiest subject kind — a single rule should fan out to all eleven
derivations in §0.2 — but every pass and API named below also runs on
laws (operation-subject predicates) and traits (any-subject predicates).
The eleven-derivation table is "what rules unlock"; the §B3a lowering
table is "what laws unlock"; placement/codec/redaction is "what traits
unlock". Same IR, same machinery, different fan-out per subject kind.

If Track P does not land cleanly, Gen2 is "compiler IR" but not "the
compounding-effect compiler". Track P _is_ the thesis test.

**P0. `Predicate` IR landing — additive, back-compat preserving.**
Before any derivation pass fires, collapse the three forks (§B8) at the
kernel layer while keeping every existing authoring constructor working:

- Treat the existing `node.kind.predicate` as the canonical destination
  and add the missing `subject | vars | body | assurance | flavor`
  payload/edge vocabulary (§B3).
- Implement `lower.rule.toPredicate` for the current `Rule` /
  `RuleExpr` facade. It should create a canonical predicate node from a
  rule node, preserve the rule body expression, and retain provenance
  back to the public rule witness. This is the first vertical slice for
  the canonical predicate IR because rules already have concrete
  graph-native passes.
- Add the unified reading API: `predicate.subject`, `predicate.body`,
  `predicate.assurance`, `predicate.flavor`. Downstream passes can
  migrate to this API at their own pace; the legacy
  `trait.appliesTo` / `law.subject` / `rule.body` accessors remain as
  thin shims over the unified shape.
- Add one refinement constructor: `Subject.where(predicate)` produces a
  `RefinedType` regardless of flavor. The legacy `Entity.where(rule)`
  is the same call.
- Add one lowerability surface: `app.predicate.lowerability(pred)` (P3).
  `app.rule.lowerability(rule)` survives as a back-compat alias.
- Add one explanation surface: `app.explain(pred)` works for traits,
  laws, and rules with no per-flavor branches.

**The existing public constructors stay**: `defineTrait`, `defineLaw`,
`defineRule` keep their full TypeScript inference, callback shapes,
editor-facing type facts, and `$infer` surface. Internally, each now wraps a
`Predicate` node with the matching flavor. `TraitDef` and `LawDef`
become thin facades over `Predicate`, not deleted types. The rule node
kind in the callable/rule dialect migrates to `Predicate` with
`flavor: "rule"` — but `gen.rule.for(...)`, `gen.rule("...")((ctx, r)
=> ...)`, and `defineRule({...})` all keep producing the same typed
witnesses they do today.

The migration touches kernel internals and consumer passes; it must not
regress:

- type-level inference on `Laws.associative(AddMoney)` (kind, payload,
  assurance);
- scoped quantified witnesses inside `gen.rule.for(Entity, (r) => ...)`
  bodies;
- typed trait-target constraints on `defineTrait({ appliesTo: ... })`;
- branded ID factories (§0.5 #7 / §C #6);
- editor-DX type regressions (§C #11) on the slice fixture.

Architecture test fails on any **new** pass that reads a flavor-specific
shape outside the three authoring factories; existing flavor-specific
readers stay until they are migrated and the shims retire.

**P1. Predicate authoring surfaces.** Three factories, one IR. The
primary form for each is documented below. All three normalize to a
`Predicate` graph fragment.

_Rule form_ (primary; entity-bound, callback-with-context):

```ts
const canManageIncident = app.rule("canManageIncident")((ctx, rule) =>
  rule
    .vars({ session: AuthSession, incident: Incident })
    .when(({ session, incident }) =>
      expr.and(
        expr.eq(session.organizationId, incident.organizationId),
        expr.or(
          expr.eq(session.role, "owner"),
          expr.eq(session.role, "admin"),
          expr.eq(session.role, "responder"),
        ),
      ),
    ),
);
```

Full inference of:

- var types (so `incident.organizationId` is typed in the body)
- body type must be `Expr<boolean>`
- reads (which fields/contexts the rule reads)
- requirements (transitive from `vars` and `expr.*` calls)
- effects (must be empty — predicates are pure; otherwise diagnostic)
- traits (`pure`, `predicate`, plus derived `sqlLowerable`, `clientSafe`,
  `serverOnly`, `monotonic`) — these flow back into Predicate metadata.

Rules expose the standard `$infer` surface: `canManageIncident.$infer.vars`,
`canManageIncident.$infer.body`, `canManageIncident.fragment`,
`canManageIncident.ref`.

_Law form_ (operation-bound, universally-quantified):

```ts
const AddMoneyAssociative = Laws.associative(AddMoney, {
  assurance: "by_construction",
});
const AddMoneyIdentity = Laws.identity(AddMoney, "0.00", {
  assurance: "tested",
});
```

`Laws.*` factories carry the operation as `subject`, the universal
quantifier as `vars`, the algebraic identity as `body`, and an explicit
`assurance` payload (§B3).

_Trait form_ (any subject, often marker):

```ts
const ClientSafe = gen.trait("ClientSafe"); // marker
const PiiEraseable = gen.trait("PiiEraseable").when((field) => field.classify.erase.exists()); // body
```

Traits attach to any subject (`type`, `field`, `projection`, `provider`,
`view`, etc.). Marker traits have `body: expr.true()`; body-bearing
traits carry a real `Expr<boolean>`.

All three factories preserve named bindings, return typed witnesses, and
require no casts in normal authoring (§C).

**P2. The derivation matrix, indexed by subject kind.** Each pass below
is a named, dialect-owned, graph-native pass with typed diagnostics; each
can be queried, explained, and rolled back. The **rule case** is the
flagship (eleven derivations from §0.2); **law** and **trait** cases run
in parallel through the same pass family with smaller per-subject
fan-outs.

_Rule subject (Entity) — the eleven derivations:_

| #   | Pass                                        | When                                |
| --- | ------------------------------------------- | ----------------------------------- |
| 1   | `derive.predicate.serverGuard`              | always                              |
| 2   | `legalize.predicate.toRlsPolicy` (Postgres) | trait `sqlLowerable` ✓              |
| 3   | `legalize.predicate.toSqlPredicate`         | trait `sqlLowerable` ✓              |
| 4   | `legalize.predicate.toClientHint`           | trait `clientSafe` ✓                |
| 5   | `legalize.predicate.toFormValidation`       | input shape matches predicate vars  |
| 6   | `derive.predicate.toTestMatrix`             | always (truth table over vars)      |
| 7   | `derive.predicate.toAccessMatrixDoc`        | always                              |
| 8   | `derive.predicate.invalidationDependencies` | predicate reads ∩ action writes ≠ ∅ |
| 9   | `derive.predicate.toIvmPlan`                | trait `monotonic` ✓                 |
| 10  | `derive.predicate.toAuditExplanation`       | always (provenance for denials)     |
| 11  | `derive.predicate.toOptimisticEnablement`   | predicate + action laws permit it   |

_Law subject (Operation) — target-aware lowering:_

The same predicate passes consume operation-subject predicates and feed
the `legalize.operation.targetLowering` planner from §B3a. A law's body
(`forall x y z. f(f(x,y),z) = f(x,f(y,z))`) is read by the planner to
decide parallel reduce vs serial fold vs IVM vs optimistic patch.
`derive.predicate.toTestMatrix` generates property-test obligations from
the universal quantifier when assurance is `asserted` or `tested`.
`derive.predicate.toAuditExplanation` produces the law-justified
explanation in `app.explain(operation.lowering, { target })`.

_Trait subject (Type / Field / Projection / Action / Provider) —
placement and capability:_

- `ClientSafe` on a field unlocks `legalize.predicate.toClientHint` for
  any rule that reads it.
- `ServerOnly` blocks `legalize.predicate.toClientHint` with a typed
  diagnostic + repair suggestion.
- `Patchable` / `Invertible` on an action contribute to the optimistic
  planner.
- Privacy traits (`Pii`, `Phi`, `Pci`) feed `verify.privacy.*` passes
  and codec/redaction decisions.
- `Monotonic` on a projection unlocks IVM regardless of whether a rule
  is involved.

Each pass that _can't_ fire emits a diagnostic explaining why (with a
remediation hint), so the user-visible behavior is "this predicate
lowers to {N of M} surfaces, here's what would unlock the others", where
M is the maximum possible for the subject kind.

**P3. The lowerability matrix as a typed projection over registered
surfaces.** `app.predicate.lowerability(pred)` does **not** return a
hardcoded shape. It returns a typed projection over all registered
`LoweringSurface` and `DerivationSurface` declarations (§B3b) filtered
by `pred.subject` kind and required-predicate match.

Type-level shape:

```ts
type LowerabilityOf<P extends Predicate<any, any, any, any, any>> = {
  readonly [S in RegisteredSurfaces as SurfaceMatchesPredicate<S, P> extends true
    ? S["$infer"]["id"]
    : never]: S["$infer"]["resultShape"];
};

const lowerability = app.predicate.lowerability(canManageIncident);
// Inferred shape — open-set, narrowed by which surfaces match this
// predicate's subject kind and required traits:
// {
//   "auth.surface.serverGuard":                { supported, ... },
//   "postgres.surface.rlsPolicy":              { supported, reason?, ... },
//   "postgres.surface.sqlPredicate":           { supported, ... },
//   "react.surface.clientHint":                { supported: false, reason, remediation, ... },
//   "react.surface.formValidation":            { supported, ... },
//   "reactivity.surface.invalidation":         { supported, precision, ... },
//   "reactivity.surface.ivmPlan":              { supported, ... },
//   "audit.surface.explanation":               { supported, ... },
//   "optimism.surface.enablement":             { supported, precision, ... },
//   ...whichever surfaces a third-party dialect registered
// }
```

Each surface owns its own `resultShape` (declared on the surface, §B3b).
The `{ supported, reason?, remediation? }` shape is a convention, not a
kernel-imposed contract. A surface that needs a richer answer
(precision tiers, capability levels, alternative plans) declares its
own typed result.

The same API works on operation-subject and trait-subject predicates;
the projection automatically narrows to the surfaces whose
`consumes.subjectKinds` includes the predicate's subject kind:

```ts
app.predicate.lowerability(AddMoneyAssociative);
// Inferred shape narrowed to operation-subject surfaces:
// {
//   "postgres.surface.parallelReduce": { supported, assurance, ... },
//   "postgres.surface.sqlAggregate":   { supported, reason, ... },
//   "ivm.surface.eligible":            { supported, ... },
//   "optimism.surface.retryStrategy":  { strategy, ... },
// }

app.predicate.lowerability(ClientSafe.appliedTo(User.fields.email));
// Inferred shape narrowed to field-subject surfaces:
// {
//   "placement.surface.field":         { client, server, ... },
//   "codec.surface.field":             { wire, client, ... },
//   "privacy.surface.redaction":       { ... },
// }
```

**Filtering and overloads.** Three call shapes, all type-narrowed.
Filters take branded witnesses, not magic strings.

```ts
// 1. All matching surfaces.
app.predicate.lowerability(pred);
//    : LowerabilityOf<typeof pred>

// 2. Filter to one dialect — only that dialect's surfaces.
//    Accepts the dialect witness directly.
app.predicate.lowerability(pred, { dialect: PostgresDialect });
//    : LowerabilityOf<typeof pred> filtered to surfaces where
//      $infer.dialect extends typeof PostgresDialect

// 3. Drill into one specific surface — exact result shape.
//    Accepts the surface witness directly.
app.predicate.lowerability(pred).at(PostgresDialect.surfaces.sqlPredicate);
//    : typeof PostgresDialect.surfaces.sqlPredicate.$infer.resultShape

// 4. Filter to surfaces in a specific phase — branded phase witness.
app.predicate.lowerability(pred, { phase: MorphismPhase.lower });
//    : LowerabilityOf<typeof pred> filtered to LoweringSurfaces only
```

`at(surface)` is a typed lookup — passing a surface witness from a
dialect that does not match the predicate's subject kind is a
type-level error, not a runtime undefined.

**Critical for AI repair.** When a predicate can't lower somewhere, the
AI agent gets a typed remediation through the surface's `resultShape`
(use a projection, switch to server-only, weaken the predicate, declare
an additional law, etc.). The remediation is a candidate `GraphPatch`
(§D8), not a free-text string.

**Back-compat.**

- `app.rule.lowerability(rule)` survives as a back-compat alias that
  forwards to `app.predicate.lowerability(rule)` and narrows the result
  to the historically-named eleven surfaces. New code uses
  `app.predicate.lowerability`.
- The "eleven derivations" of §0.2 are the eleven surfaces registered
  by the standard predicate/auth/reactivity/postgres/react dialects.
  They are not special-cased in the kernel.

**Extensibility.** A new dialect (GraphQL, Effect-Atom, ConnectRPC,
blockchain, telemetry) registers surfaces in its `defineDialect(...)`
call. `app.predicate.lowerability(...)` automatically picks them up
without any kernel edit, PLAN edit, or back-compat shim. The
type-level projection includes the new surface IDs in `$infer` as soon
as the dialect is registered.

**P4. Refinements — predicates feed back into types.** The composition
chain becomes cyclic in a useful way: `Predicates → Types`. The
construction is `Subject.where(predicate)` regardless of flavor.

```ts
// rule refinement (entity)
const ArchivableUser = User.where(canArchiveUser);
// type: RefinedType<User, canArchiveUser>

// trait refinement (field)
const ClientEmail = User.fields.email.where(ClientSafe);

// law refinement (operation)
const AssociativeAdd = AddMoney.where(Laws.associative);

const archiveUser = app.action("archiveUser")((ctx, action) =>
  action
    .input({ user: ArchivableUser }) // narrowed at the type level
    .body(({ input }) => {
      User.update(input.user.id, { archivedAt: ctx.now });
    }),
);
```

Refined types flow into:

- Action inputs (narrowed scope; the body sees a narrower entity).
- Query outputs (`Query<RefinedType<X, R>>` — result type is narrower).
- Form fields (only refinement-satisfying values are valid input).
- Test fixtures (generators produce values that satisfy the refinement).
- Operation selection (an aggregation planner only picks
  `Op.where(Laws.associative)` for parallel reduce).
- Placement decisions (`Field.where(ClientSafe)` allows client lowering).

Refinements make predicates **constructive, not just consultative**. This
is the layer that makes `rules.md.txt` correct that "rules are the logic
core of the kernel" — and it generalizes the same property to traits and
laws.

**P4a. Refinement composition forms a lattice.** Chained
`Subject.where(...)` calls are conjunction by default — both predicates
must hold. The composed body is `expr.and(p1.body, p2.body)`; the
composed vars are the merged binding set; the composed assurance is
the **weakest** (most conservative) of the parts; the composed flavor
is the most general (`trait < law < rule`).

```ts
const Active = Invoice.where(isActive); // RefinedType<Invoice, isActive>
const ActiveOpen = Active.where(isOpen); // RefinedType<Invoice, isActive ∧ isOpen>
const ActiveOpenMine = ActiveOpen.where(ownedByActor); // …
```

Type-level shape:

```ts
type RefinedType<S, P> = S & { readonly __refinedBy: P };

declare function where<S, P extends Predicate<S, ...>>(
  subject: S,
  pred: P,
): RefinedType<S, P>;

declare function where<S, P1, P2 extends Predicate<RefinedType<S, P1>, ...>>(
  subject: RefinedType<S, P1>,
  pred: P2,
): RefinedType<S, And<P1, P2>>;
```

Conjunction (`And`) is the default composition operator. Other
composition operators are explicit, named, and use predicate-level
helpers — not method chaining:

```ts
Predicate.or(canView, isAdmin); // disjunction
Predicate.not(isLocked); // negation
Predicate.implies(isPending, hasApprover);
Predicate.iff(isVerified, hasEmail);
```

These return new `Predicate` values that carry the composition tag in
`$infer.composition` so passes can choose canonical forms
(`canonicalize.predicate.toNnf`, `canonicalize.predicate.toCnf`).

**Algebraic refinement on operations.** The same machinery applies to
operation subjects: `Op.where(Associative).where(Commutative)` is the
constructive form of "commutative semigroup over Op." The planner reads
the refined witness directly when selecting parallel-reduce lowerings;
no separate `requires: [Associative, Commutative]` declaration is
needed at the lowering surface — the refinement _is_ the requirement.

**Trait refinement on fields.** `Field.where(ClientSafe)` produces a
narrowed field witness whose placement is provably `{ client, server
}`. The codec planner reads the refined witness to pick the wire form.
`Field.where(ClientSafe).where(Encrypted)` composes — the resulting
witness is placement-safe AND on-wire-encrypted.

**Refinement is graph-visible.** A `RefinedType` materializes as a
`RefinementNode` in the kernel graph with edges
`RefinesSubject(node, subject)` and `AppliesPredicate(node, predicate,
...)`. Passes inspecting a refined subject see the refinement chain
explicitly; `app.explain(refined)` walks the chain.

**P4b. Policies are typed predicate bundles, not predicates.** Several
sections reference policies (`IncidentPolicy.read = canViewIncident`,
"Policy guards action"). Policies are a **distinct primitive** in the
auth dialect, not a flavor of predicate. A policy is a typed bundle of
predicate references keyed by action:

```ts
const IncidentPolicy = defineAuthPolicy(Incident, {
  read: canViewIncident,
  update: canManageIncident,
  delete: canArchiveIncident,
});

type Action = keyof typeof IncidentPolicy.$infer.actions;
// "read" | "update" | "delete"

IncidentPolicy.predicates.read; // typed Predicate witness
IncidentPolicy.subject; // Incident witness
IncidentPolicy.$infer; // full inference surface
```

Policies are graph-native:

- Node kind: `auth.policy` (owned by `AuthDialect`).
- Edges: `PolicyGuardsSubject(policy, subject)`,
  `PolicyAction(policy, actionName, predicate)`,
  `PolicyAppliedTo(policy, query|action)`.
- A policy can be queried for the predicate guarding any action;
  passes treat each `(policy, action)` pair as a derivation source.

Why policies aren't predicates:

- A policy doesn't itself evaluate to a boolean — it has no body. It's
  a mapping from action names to the predicates that guard them.
- Policies compose differently. Multiple policies on one subject form
  an AND across actions, but each action keeps its own predicate;
  `Policy.merge(A, B)` is not `expr.and(A.body, B.body)`.
- Policies attach to entities and queries through their own edge kinds
  (`PolicyGuardsSubject`, `QueryGuardedBy`); they do not refine the
  subject type.

The unified predicate model still wins: every value behind a policy
slot is a `Predicate`. The eleven derivations fire on the predicate;
the policy just routes actions to predicates. `app.explain(action ->
policy -> predicate -> derivation)` walks both layers.

Policy-level surfaces (`legalize.policy.toRls`,
`legalize.policy.toGuardChain`) are `LoweringSurface`s on the
`AuthDialect`'s `policy → ...` morphisms — same model as everything
else.

**P5. Standard operation library expansion.** A predicate body is only as
expressive as the operations available. Today `kernel/operations.ts` has
logic/comparison/arithmetic. That is insufficient for real predicates.
Add to the standard library (Track B owns the work; Track P owns the
prioritization):

- **Optionality**: `isNull`, `isSome`, `unwrapOr`, `mapSome`.
- **Comparison**: `gt`, `lt`, `gte`, `lte`, `between`, `inRange`.
- **Set / collection**: `includes`, `oneOf`, `subsetOf`, `intersects`,
  `length`, `every`, `some`.
- **Date**: `before`, `after`, `addDays`, `addHours`, `now`,
  `daysBetween`, `isWithinLast`.
- **String**: `startsWith`, `endsWith`, `matches`, `length`,
  `containsIgnoreCase`.
- **Entity-relation**: `belongsTo`, `ownedBy`, `relatedVia`,
  `tenantMatches`.
- **Tagged-union narrowing**: `is`, `isOneOf`, `tag`.

Each operation must declare laws and lowerings (SQL, JS, JSON-render
where applicable). This is the operation algebra predicates need.

**P6. Predicate-derived invalidation as a _named feature_** — **DONE**
(rule-flavor pass shipped; generalizes naturally to the broader predicate
family). The chain

```
Action writes Incident.status
Rule canManageIncident reads Incident.status
Policy IncidentPolicy uses canManageIncident
Query listOpenIncidents guarded by IncidentPolicy
Resource OpenIncidentsResource wraps listOpenIncidents
⇒ Action invalidates Resource (with precision: matched/exact/broad)
```

is the **showcase derivation** of the entire library. As of this
checkpoint:

- ✅ First-class pass: `derive.rule.invalidationDependencies` lives in
  `src/reactivity/passes.ts`. Graph-native, registered via
  `registerDialectPasses` in `lifecycle/runner.ts`.
- ✅ Materializes results as `INVALIDATES_KEY_EDGE_KIND` edges with
  `provenance: "derived"`, `precision`, `confidence`, and
  `affectedRules` metadata.
- ✅ `app.explain(...)` surfaces it automatically — derived edges are
  real graph edges incident to the action node.
- ✅ Covered by `tests/reactivity-rule-invalidation-pass.test.ts`
  (3 tests) and the slice fixture's R-8 assertion (was `test.todo`,
  now active).
- ⏳ Opening example in the README — pending Track L docs work.
- ⏳ AI-edit demo — pending Track N (importers + diff).

**Bug fixed during this work**: lifecycle runner discarded
`pipelineResult.modifiedGraph`. Without that fix, no derive pass that
emits edges could persist them. This was a latent blocker for every
later Track P derivation — a foundational fix.

**Debt surfaced (per §0.5 #8 — pre-release reframe)**: the pass
currently reads `_bridgeActionFunction`, `_bridgeRule`,
`_bridgeQueryFunction` from node metadata (set by legacy builders).
~35 read sites across the codebase. **This is debt, not architecture.**
The retirement plan:

1. **Track P §P0 / §P1 / §P5** lands the dialect-owned action/predicate/
   query graph IR — typed payloads on node kinds, computed edges, no
   side-channel JS objects.
2. The lowering helpers
   (`deriveRuleInvalidationPlansFromGraph`, `ruleToRlsPolicy`,
   `extractWriteSet`, etc.) get rewritten to read from graph nodes/
   edges directly, not `_bridge*` JS objects.
3. The `_bridge*` keys are deleted from `policyToKernelNode`,
   `entityToKernelNode`, `ruleToKernelNode`, `actionToKernelNode`,
   `queryFunctionToKernelNode`, etc. in the same PR that ships the
   replacement.
4. R-8's pass and the §P2 RLS pass rewrite against the new graph IR;
   their tests stay green because the graph-native paths cover the
   same chain.

Per §0.5 #8: **no new bridge keys** in the meantime. If a future
dialect pass needs typed-object access, the right move is to land the
graph-native path first, not stamp another `_bridge*` slot.

**P6a. Reactivity is also derivable from the entity/relation graph
_without_ a rule predicate** (Track H §H5a, tier 2). Even before any
rule fires,
the compiler can derive cache invalidation from raw entity/field/relation
facts:

```
Action writes Incident.status
Query listOpenIncidents reads Incident.status
⇒ Action invalidates Query result (no rule involvement required)

Action writes Incident.assignedTeamId      (FK to Team)
Relation IncidentBelongsToTeam exists
Query listTeamWorkload aggregates by Team
⇒ Action invalidates listTeamWorkload (derived through the relation)
```

The entity-relation graph is a **free reactivity source**. Users only
write manual cache keys when they need explicit precision, opaque
external dependencies, or hand-tuned cache hierarchies. The compiler's
default behavior is: scan entity/field/relation graph + action writes

- query reads → emit `InvalidatesKey` edges with `provenance: derived`,
  `precision: exact|matched|broad`.

When a rule predicate is involved (P6 above), the chain is just longer
— but the derivation mechanism is the same pass family. Three tiers,
one pipeline:

```
manual:    user writes archiveUser.invalidates(UserListKey.any())
derived:   compiler walks Field reads × writes via index
predicate: compiler walks Predicate.body reads × Field writes × Policy guards
```

Each emits the same `InvalidatesKey` edge kind with different provenance.
Targets (TanStack Query / Effect Atom / etc.) lower them uniformly.

**P7. Predicate diagnostics with patchable repairs.** Every predicate
diagnostic should carry a candidate graph patch. Rule-flavor examples
(the most common case, the AI agent's hot path):

- `predicate.not_sql_lowerable` → patch: change to server-only
  enforcement.
- `predicate.client_unsafe.reads_server_only` → patch: use a safe
  projection.
- `predicate.effect_in_pure_body` → patch: move effect to a dispatch.
- `predicate.dependency_extraction_conservative` → patch: add explicit
  `.reads([...])` declaration.
- `predicate.not_incrementalizable` → patch: weaken to monotonic body.

Law-flavor examples:

- `predicate.law.assurance_unverified` → patch: add a property test or
  upgrade to `proved_by_solver`.
- `predicate.law.lowering_conflict` → patch: declare the missing law or
  weaken the lowering claim.

Trait-flavor examples:

- `predicate.trait.target_mismatch` → patch: change `appliesTo`
  constraint.
- `predicate.trait.placement_conflict` → patch: introduce a projection
  to satisfy `ClientSafe`.

These are exactly the diagnostics an AI agent should be able to
auto-repair.

**Exit:** Each of `canManageIncident` and `canViewIncident` from the
slice fixture lowers cleanly to all eleven rule-flavor derivations (or
emits a named diagnostic for surfaces it can't reach). The lowerability
matrix is queryable for traits, laws, and rules with shape narrowed by
subject kind. Refined types compile end-to-end across all three flavors.
The predicate-derived invalidation chain is an explainable,
golden-tested derivation. The standard operation library covers the
dozen-plus operation families real predicates need. The `Predicate`
node kind is the kernel storage shape; `TraitDef`, `LawDef`, and the
legacy rule node become thin facades over it. **Every existing
authoring constructor — `defineTrait`, `defineLaw`, `defineRule`,
`gen.trait`, `Laws.*`, `gen.rule.for` — keeps full inference and
editor-DX parity with today.**

---

## 3.5. The vertical slice (do this in parallel with everything)

The plan is comprehensive and risks 18 months of horizontal refactoring
with nothing shippable. To prevent that, **pick one end-to-end slice and
keep it green from day one**. Use it as the regression suite for every
track.

### The chosen slice: rule-first OpsDesk

From the OpsDesk example. **Rules are co-stars** with the action — the
slice's job is to prove the eleven rule derivations land cleanly, and to
prove the chain `Rule → Action → Query → Resource → UI` works end-to-end.

```
domain.entity Incident
  + IncidentStatus state machine
  + AuthSession requirement + provider

rules (the keystone — must lower to the eleven derivations)
  canViewIncident    : session.orgId == incident.orgId
  canManageIncident  : canViewIncident AND role ∈ {owner, admin, responder}

policy IncidentPolicy
  read   = canViewIncident
  update = canManageIncident

action acknowledgeIncident
  guard canManageIncident
  writes Incident.status, Incident.acknowledgedAt
  emits IncidentAcknowledged

query listOpenIncidents
  reads Incident.*
  guarded by IncidentPolicy.read
  has key OpenIncidentsKey

resource OpenIncidentsResource wraps listOpenIncidents
mutation AcknowledgeIncidentMutation wraps acknowledgeIncident

refined type ManageableIncident = Incident.where(canManageIncident)
```

The slice succeeds when this graph compiles cleanly through the new
architecture and emits, end-to-end:

**Eleven rule-flavor predicate derivations** (Track P §P2 — these are
the keystone gates; rules are the demo subject kind because they fire
all eleven surfaces):

R-1. Server guard for `canManageIncident` runs in
`acknowledgeIncident`.
R-2. Postgres RLS policy emitted for `IncidentPolicy.read` from
`canViewIncident`.
R-3. SQL predicate inlined into `listOpenIncidents` query lowering.
R-4. React UI hint: `acknowledge` button disabled when
`canManageIncident` returns false (client-safe via projection).
R-5. Form validation: declare-incident form fields refuse values that
violate `canViewIncident` on related entities.
R-6. Generated test matrix: truth table over
`{owner, admin, responder, viewer} × {sameOrg, otherOrg}` for
both rules.
R-7. Generated access-matrix doc.
R-8. Derived invalidation: `acknowledgeIncident` writes
`Incident.status` → `canManageIncident` reads `Incident.status` →
`listOpenIncidents` guarded by it → exact patch where possible.
R-9. IVM plan for `listOpenIncidents` (rule is monotonic in
`Incident.status`'s state-machine ordering).
R-10. Audit explanation for any denied call: the derivation chain
printed as a human-readable trace.
R-11. Optimistic enablement: client previews acknowledged state because
both rule and action laws permit it.

**Surrounding derivations** (Track F/G/M):

12. Postgres table + foreign-key constraints + indexes.
13. Effect server handler with provider injection.
14. React mutation hook + resource hook.
15. OpenAPI route.
16. Refined-type `ManageableIncident` flows into action input, narrowing
    body scope.
17. Textual IR snapshot.
18. `app.explain(invalidatesKey, { action, key })` returns the full
    derivation chain.
19. `app.rule.lowerability(canManageIncident)` returns the matrix.
20. `app.diff(prev, next)` produces a clean semantic diff when the rule
    changes.

### The 30-line "hello, gen2"

The vertical slice above is the regression target. The **first
impression** target is a separate, smaller piece: a 30-line `gen.kit.saas`
example that emits a working Postgres table + React form + one test.
Treat it as a binding contract: any abstraction that breaks the 30-line
version pays for itself elsewhere or doesn't ship.

### Discipline rules

- Every track lands behind a vertical-slice green gate. If a Track-G UI
  change breaks the slice's React emission, the change rolls back.
- New abstractions must demonstrate the slice still emits the same
  artifacts (golden snapshot equality), or document why the diff is
  intended.
- Track Z (below) tracks the slice itself.

### Track Q — Formal verification dialects (certified codegen)

Sourced from §B3's open assurance registry (`Asserted | Tested |
Derived | CheckedByTarget | ProvedBySolver | ByConstruction |
TrustedTarget`), §B3a's lowering planner that reads assurance to
pick aggressive lowerings, §B6's typed first-order logic vocabulary,
and `GETTING_STARTED.md` §22 (the synthesis of why portability and
verifiability share one mechanism).

The Predicate IR (§B3) is structurally a typed FOL fragment with
witness identity, branded subjects, typed quantifier scopes, and
operation-aware comparison. That is the input shape SMT solvers,
proof assistants, and refinement-type checkers want. **Track Q
ships the verifier dialects that consume it.** Each is a normal
dialect — node kinds for proof artifacts, morphisms from
`Predicate` nodes to solver-specific encodings, emitters that
produce the proof scripts, and assurance-edge promotion when the
solver succeeds.

**Q1. `VerifierDialect` interface — shared shape across solvers.**
Define the contract every verification dialect implements:

```ts
interface VerifierDialect extends Dialect {
  readonly verifies: ReadonlyArray<PredicateFlavor>; // which flavors it can attempt
  readonly produces: AssuranceKind; // what assurance it grants on success

  readonly morphisms: {
    readonly encode: Morphism<Predicate, SolverScript>;
    readonly run: Morphism<SolverScript, ProofResult>;
    readonly attest: Morphism<ProofResult, PredicateAssuranceEdge>;
  };
}
```

The `attest` morphism attaches a typed edge from the predicate to
the assurance kind, with provenance pointing at the proof artifact:

```
Predicate ──[has-assurance { proofArtifact }]──> ProvedBySolver
```

Verifier dialects compose — multiple solvers can attest the same
predicate; the assurance partial order picks the strongest.

**Q2. `Z3VerifierDialect` — first concrete solver.** SMT-LIB2 is the
broadest decidable fragment most predicates fall into. Q2 ships a
Z3 dialect because it covers the largest surface for the least
work:

- Algebraic laws (`Laws.associative`, `Laws.commutative`,
  `Laws.identity`) over decidable theories (linear arithmetic,
  bit-vectors, uninterpreted functions).
- Quantifier-free preconditions and postconditions over numeric and
  enum semantic types.
- Bounded existential and universal quantifiers when the source's
  cardinality bound is known.
- Refinement-type discharge for `Subject.where(predicate)` when the
  predicate body is in the decidable fragment.

Out of scope for Q2: unbounded recursion, higher-order quantifiers,
custom theories. Those land in Q3 / Q4 with proof-assistant
dialects.

**Q3. `Why3VerifierDialect` — Hoare-logic VC generation for
operations.** Pre/postconditions plus operation bodies map directly
onto Why3's verification-condition generation. The dialect:

- Encodes operation input/output records as Why3 logical variables.
- Encodes the operation body (when expressible) as a Why3 program.
- Encodes preconditions as `requires` clauses.
- Encodes postconditions as `ensures` clauses.
- Runs Why3's VC generator and dispatches the resulting goals to
  one or more SMT backends.
- Attests success per goal; partial discharge surfaces as a typed
  diagnostic listing the unproven obligations.

**Q4. `CoqVerifierDialect` / `LeanVerifierDialect` — proof
assistants for what the SMT-only dialects can't reach.** Manual
proofs of:

- Algebraic structures requiring induction;
- Recursive predicates;
- Higher-order quantifiers;
- Cross-operation invariants.

Authors write the proof in Coq/Lean against an auto-generated
specification file derived from the predicate IR; the dialect
tracks proof status and re-checks on source-fact change. Stale
proofs (source hash drifted) auto-downgrade their assurance edge.

**Q5. Linear-type discharge for §B7a identity/ownership laws.**
A specialized verifier — not a general SMT — that walks operation
graphs and discharges `RETURNS_SAME_IDENTITY`,
`RETURNS_FRESH_IDENTITY`, `CONSUMES_INPUT`, `BORROWS_INPUT`, and
`ALIASES` claims by static analysis of the operation body and
keyed I/O signature (§B7b). When the keyed-I/O inference rule is
honored throughout, most claims discharge by inspection; the
verifier emits the proof artifact and the assurance edge.

**Q6. Lowering-correctness laws — _certified codegen_.** A
morphism that lowers semantic facts to a target dialect can carry
a `Predicate` whose subject is the morphism itself and whose body
asserts the target preserves a source-level claim. The body
callback receives a typed scope drawn from the morphism's `from`
and `to` declarations:

```ts
type LoweringScope<M extends Morphism> = {
  // Typed view over the morphism's matched source pattern bindings.
  readonly source: PatternBindingsOf<M["from"]>;
  // Typed view over the patches the morphism's `map` produces, addressable
  // by the node/edge kinds declared in `to`.
  readonly emitted: EmittedFactsOf<M["to"]>;
  // Quantifier helpers scoped to the source/target dialect vocabularies.
  readonly forall: <T>(
    source: SourceWitness<T>,
    body: (binding: T) => Expr<boolean>,
  ) => Expr<boolean>;
  readonly exists: <T>(
    source: SourceWitness<T>,
    body: (binding: T) => Expr<boolean>,
  ) => Expr<boolean>;
};

const PostgresLoweringPreservesAuth = defineLaw({
  id: postgresId.law("policyToRls.preservesAuth"),
  subject: PostgresDialect.morphisms.policyToRls,
  body: ({ source, emitted, forall }) =>
    forall(Actor, (actor) =>
      expr.iff(
        source.policy.allowsRead(actor),
        emitted.rlsPolicy.admitsRow(actor, source.policy.entity),
      ),
    ),
}).withAssurance(ProvedBySolver);
```

Both `source` and `emitted` are typed witnesses, not opaque
records. `source.policy` is narrowed to the policy node-kind that
the morphism's `from` pattern binds; `emitted.rlsPolicy` is
narrowed to the RLS-policy node-kind declared in `to.nodes`. The
verifier dialect (Q1's `encode` morphism) walks these typed
references when generating the SMT-LIB2 encoding — there is no
string parsing, no reflection. Equality between source-level claims
and target-level claims is by typed expression equivalence, not by
text comparison.

`SourceWitness<T>` is the domain over which the quantifier ranges
— typically a node kind from the source or target dialect, or a
semantic-type witness. Cardinality bounds on the source flow into
the verifier's quantifier instantiation strategy.

Q6 wires the verifier dialects so they can attempt these
morphism-subjected laws. When discharged, the artifact carries a
transitive proof: the source-level access rule is enforced by the
emitted RLS policy, and the planner can drop redundant
server-side checks (§B3a aggressive lowering).

This is the load-bearing distinction. Most verification systems
prove things about _specifications_; the artifact you ship is a
hand-written translation. Gen2's morphisms _are_ the translation,
and laws on morphisms make the translation itself a verified
artifact.

**Q7. Proof artifact node kinds.** Each verifier dialect owns its
proof artifact node kind:

```
z3.proof.smtScript                 — generated SMT-LIB2 + run log
z3.proof.unsatCertificate          — minimal unsat core when supported
why3.proof.session                 — Why3 session file + dispatched goals
coq.proof.script                   — author-written .v file + check status
lean.proof.script                  — author-written .lean file + check status
linear.proof.report                — static-analysis report for Q5 claims
```

These nodes are graph facts like everything else — they appear in
`app.preview()`, are content-addressed for cache invalidation, and
have provenance back to the predicates they discharge.

**Q8. Assurance promotion + planner integration.** With verifier
dialects in the pipeline, the §B3a lowering planner reads the
strengthened assurance off predicates and picks lowerings
accordingly:

| Assurance on a precondition | Lowering choice                                     |
| --------------------------- | --------------------------------------------------- |
| `Asserted`                  | Server runtime check + diagnostic if violated       |
| `Tested`                    | Same as Asserted; tests confirm behavior on samples |
| `ProvedBySolver`            | Drop the runtime check; trust the proof             |
| `ByConstruction`            | Drop the check; the constructor enforces the claim  |

Same table extends to laws, postconditions, and identity claims.
The planner exposes `app.assurance.report({ predicate })` showing
the discharge chain.

**Q9. Proof maintenance — staleness detection.** A proof is valid
_for a specific source-fact hash_. When source facts change, every
downstream proof artifact's `validFor` hash drifts. The pipeline
auto-downgrades the assurance edge:

```
Predicate.body changed
  → SourceHashOf(Predicate) updated
    → ProofArtifact.validFor !== SourceHashOf(Predicate)
      → has-assurance edge downgrades from ProvedBySolver to Asserted
        → planner re-emits runtime checks on next pipeline run
        → diagnostic surfaces: "proof is stale, re-run verifier"
```

No silently-stale "verified" claims. Stale proofs are diagnostics,
not silent trust leaks.

**Q10. Verifier dialect surfaces in the meta graph.** Each
verifier dialect registers `defineVerifierSurface(...)` declarations
that `app.predicate.lowerability(pred)` reads — same shape as §B3b's
`defineLoweringSurface`. So users discover which solvers can attempt
which predicates without poking at internals:

```ts
app.predicate.lowerability(canArchiveInvoice).at(Z3VerifierDialect.surfaces.attempt);
// : { supported: true, fragment: "linear-arithmetic", expectedTime: "<10ms" }
```

**Type-level guarantees.** Verifier dialects must preserve:

- exact predicate-witness reference in the proof artifact node's
  `$infer.discharges`;
- exact source-hash literal in `$infer.validFor`;
- exact granted assurance kind in `$infer.grants`;
- exact solver-fragment classification in
  `$infer.fragment` (`smt.linear-arithmetic` |
  `smt.bit-vector` | `coq.inductive` | `lean.dependent` | …) so
  surfaces can route by capability.

**Migration / rollout.**

1. Land Q1 (verifier dialect interface) — ~1 week, mostly type
   definitions and the assurance-promotion morphism.
2. Land Q2 (Z3 dialect) on the §B3 algebraic laws — covers
   commutative-monoid bundles, deterministic claims, and most
   cardinality bounds. Concrete value visible immediately.
3. Land Q5 (linear discharge for §B7a/§B7b) — fast, doesn't need
   external solvers, covers a meaningful fraction of identity
   claims by static analysis.
4. Land Q3 (Why3) for pre/postconditions on operations — unlocks
   the bulk of §B7e value.
5. Land Q4 (Coq/Lean) for the residual complex cases. Optional
   for most users.
6. Land Q6 (lowering-correctness laws) once Q2 + Q3 are stable —
   this is the differentiator; ship it loud.

**Status:** not implemented. Sequenced after §B3 (predicate IR
must exist), §B6 (FOL vocabulary), §B7a + §B7b + §B7e (the laws
and predicates the verifiers consume). Track Q is the synthesis
that turns "structured semantic claims" into "shipped proofs."

### Track Z — Vertical slice owner

Not numbered as a normal track because it is a _cross-cutting test fixture_,
but it has dedicated ownership.

1. Build the slice using whatever shape today's code allows. Lock the
   emitted artifacts as golden snapshots.
2. As each track lands, port the slice to use the new APIs. The golden
   snapshots must remain byte-identical (or the diff must be reviewed
   and re-locked).
3. The slice graph fragment ships as `tests/golden/opsdesk-slice/` and
   the textual IR as `tests/golden/opsdesk-slice/expected.gen2`.

**Exit:** the slice compiles cleanly through the post-rebase pipeline and
its 10 listed artifacts match locked snapshots. The 30-line "hello, gen2"
ships in `examples/hello-gen2/`.

---

## 4. Execution sequencing

Updated to reflect what is already in place and to put **Track P
(Predicates) on the critical path** — Track P is the thesis test. Every
other track is sequenced specifically to make Track P land cleanly.
`GraphIndex` (the bulk of old Track A) is done; the remaining order is:

```
0.  §7 Quick Wins                       — land before any large refactor
0.5 Track Z (rule-first slice fixture)  — green-gate every later landing

1.  Track D-prefix (consolidate diagnostic/artifact forks)
                                        — clears noise from every other track
2.  Track E (pass pipelines, lifecycle split)
                                        — biggest single legacy block; unblocks F/G/H/I/J/P
3.  Track C (TS inference + witnesses + editor DX)
                                        — required for usable Track B+/P APIs
4.  Track B (type stack + operations + Predicate IR + transform stable IDs)
                                        — semantic core; Track P depends on this
5.  Track P-early (Predicate IR landing + rule authoring surface + std op library)
                                        — P0, P1, P5; lands as soon as B is usable
6.  Track D (full diagnostic schema + repair patches + graph-patch primitive)
                                        — required for AI loop and P7
7.  Track N-early (textual IR + app.explain stub + lowerability matrix)
                                        — see §0.5 #5; runs in parallel with B/D/P
8.  Track A (GraphView + memoization + shaking)
                                        — once chained passes exist, they need this
9.  Track F (target legalization)       — required for P2/P3 (predicate → RLS / SQL predicate)
10. Track P-mid (the derivation matrix — P2)
                                        — needs F (SQL targets), D (diagnostics)
11. Track P-late (refinements — P4)     — needs B + C; cyclic Type ↔ Predicate binding
12. Track I (dispatch/effects/outbox)   — closes effect invariants
13. Track H (merge/boundary/dataflow)   — enables sync/offline/IVM/streams
14. Track G (UI/forms/lists/projection) — depends on F + traits + diagnostics + P4
15. Track M (product-grade dialects)    — evolution/error/observability/privacy/fixture/package/obligation
16. Track N-rest (preview/inspect/diff/capabilities/importers)
                                        — fills out the DX surface
17. Track J (delete legacy arrays)      — only after readers are migrated
18. Track K (facade normalization)      — runs in parallel from step 3 onward
19. Track O (kits/recipes/modules)      — needs M+N for expand/preview/explain
20. Track L (docs)                      — doc-parallel: target README per API
                                          ships *before* the API
```

**Track P splits into three** to track its critical-path placement:

- **P-early** (step 5): `Predicate` IR landing (P0) + authoring
  surfaces — rule callback-with-context, `Laws.*`, `gen.trait` — (P1) +
  standard operation library expansion (P5). Lands as soon as Track B's
  operation builders and Predicate node kind are usable; unblocks every
  later predicate-related derivation.
- **P-mid** (step 10): the derivation matrix (P2) — rule-flavor
  eleven-derivation table is the headline; law-flavor target lowering
  (§B3a) and trait-flavor placement/redaction run in parallel through
  the same pass family — plus the lowerability matrix (P3). Requires
  Track F's target legalization for passes 2 and 3 (RLS, SQL predicate)
  and Track D's repair patches for P7.
- **P-late** (step 11): refinements (P4) — `Subject.where(predicate)`
  across rule/law/trait flavors. Needs Track B's typed-witness surface
  and Track C's `KernelGraph<TState>` accumulator to flow refined types
  through action inputs and query outputs cleanly.

**Track N-early** (step 7) is a deliberate split from the rest of Track
N. Per §0.5 #5, explain/textual-IR is product, not polish. It also
co-stars with Track P: the lowerability matrix (P3) and the eleven-pass
explanations (P2 rule-flavor) _are_ the highest-value `explain` outputs.

What can run in parallel today:

- **Quick Wins §7 #1–12** — all twelve items are independent and small.
- **Track D-prefix** (delete `PassDiagnostic`/`KernelArtifact`).
- **Track C** §1–5 (`KernelGraph<TState>`, dialect-registry inference,
  `Compute<T>`, witness surface).
- **Track K core forms** — `.class` on entity + callback form on
  rule/action/query can land before E completes.
- **Track B §B9** — `kernel/transform.ts` stable IDs is a 50-line fix.
- **Track Z** — the rule-first slice fixture should be locked before
  any of the above ships.

**Critical path**: Quick Wins → Track Z fixture → D-prefix → E → C → B →
P-early → D → N-early → A → F → **P-mid** → **P-late**. Tracks G and H
need F and B in place. Track M can start in parallel with H. Track O is
last because kits compose everything below them.

**Slice green-gate**: every track landing must keep the Track Z slice
golden snapshots intact (or document and re-lock the diff). The eleven
rule-flavor predicate derivations are the strictest gate — any track
that breaks one of the eleven without an intentional, reviewed re-lock
rolls back.

---

## 5. Definition of done

Borrowed from the "Success definition" at the bottom of
`revised_phases_new_design.md`, the "Acceptance criteria" in
`gen_3_transition_agent_instructions.md`, and the OpsDesk example in
`gen_2_new_design_readme.md`.

The rebase is complete when:

1. The "north star" snippet at the bottom of
   `revised_phases_new_design.md` compiles and runs with no casts.
2. `GenContext` carries only graph, plugins, config, status, diagnostics,
   artifacts, helpers, pass-registry.
3. No internal API takes a raw string for kind/trait/edge/protocol identity.
4. Every emitter consumes legalized target dialect IR.
5. Every checker is a `Pass` owned by a dialect.
6. Every diagnostic is a typed `DiagnosticFinding` with locations, audience
   messages, structured remediation, and an optional graph-patch `repair`.
7. `graph.edges.ofKind(...)`, `nodes.withTrait(...)`, and "what writes this
   field" run in O(1) via `GraphIndex`.
8. Operations are graph nodes; laws are typed traits with assurance levels.
9. The type stack is layered: Representation, SemanticType, Serializer,
   Transform, Operation, Expr, Trait, Law, Implementation are each
   separately addressable graph facts.
10. The OpsDesk-scale example in `gen_2_new_design_readme.md` compiles
    end-to-end through `gen.graph.pipe(...).run(...).emit([...])`.
11. The AI UI loop (catalog → spec → import → verify → emit) works for at
    least one non-trivial view.
12. Every entity/action/query/resource/mutation/form/list exposes the
    standard `$infer` witness surface and `.fragment` for graph composition.
13. Every recipe has a working `expand()`; every derived edge has a working
    `explain()`; every artifact has a working `traceArtifact()`;
    `appGraph.diff(prev, next)` produces a semantic change list.
14. `gen.kit.saas(...)` and `gen.quick.saas(...)` produce a working SaaS app
    in under 30 lines that emits database / server / web / tests / docs
    artifacts from one pipeline run.
15. `gen.evolution.preview(prev, next).print()` classifies changes as
    Safe / Needs attention / Blocked, and rename intent + stable IDs prevent
    destructive drop/add diffs.
16. `gen.import.openApi(...)`, `gen.import.jsonRenderSpec(...)`, and
    `gen.import.previousGraph(...)` round-trip cleanly through verify
    passes.
17. Textual IR is emitted as a first-class artifact and consumed by
    diff/review tooling.
18. **The `Predicate` IR has landed (P0)**: one `Predicate` node kind
    with `subject | vars | body | assurance | flavor` is the kernel
    storage shape. `defineTrait`, `defineLaw`, `defineRule`,
    `gen.trait`, `Laws.*`, and `gen.rule.for` all survive as authoring
    surfaces — none of their typed witnesses, callback shapes,
    editor-facing type facts, or `$infer` surfaces regressed. `TraitDef` and `LawDef`
    become thin facades over `Predicate`. Consumer passes can use the
    unified `predicate.subject/body/...` reading API or the legacy
    flavor-specific accessors; new passes prefer the unified API.
19. **Rule-flavor predicates deliver on the eleven derivations**
    (Track P §P2). For both `canManageIncident` and `canViewIncident` in
    the slice fixture: server guard ✓, RLS policy ✓, SQL predicate ✓,
    client UI hint ✓ (or typed diagnostic explaining why not), form
    validation ✓ (where applicable), test matrix ✓, access-matrix doc ✓,
    derived invalidation ✓, IVM plan ✓ (when monotonic), audit
    explanation ✓, optimistic enablement ✓. Law predicates feed the
    §B3a target-lowering planner; marker trait edges feed placement,
    codec, and redaction passes; bodied trait predicates (`.when(...)`)
    go through the same Track P pipeline as rules.
20. **`app.predicate.lowerability(pred)`** returns a typed projection
    over registered surfaces (§P3 / §B3b), narrowed by the predicate's
    subject witness and required traits. Result shape is open-set —
    new dialects register surfaces and they appear automatically in
    `$infer`. `app.rule.lowerability` survives as a back-compat alias
    that narrows to the standard rule-flavor surfaces.
21. **Refinements work end-to-end across flavors**: `Subject.where(pred)`
    produces a `RefinedType` for `Entity.where(rule)`, `Op.where(law)`,
    and `Field.where(trait)` that flows into action inputs (narrowing
    the body scope), query outputs (narrowing the result), forms (only
    valid inputs accepted), operation selection (planner picks
    refinement-satisfying ops), and test fixtures (generators produce
    refinement-satisfying values).
    21a. **The predicate-derived invalidation chain** (§P6:
    `Action writes Field → Predicate.body reads Field → Policy uses
Predicate → Query guarded by Policy → Resource wraps Query → Action
invalidates Resource`) is a named, golden-tested derivation, the
    opening example in the README, and the canonical demo for
    `app.explain(...)` and the AI-edit loop. Rules are the demo
    subject; the same chain runs for any predicate flavor whose body
    reads fields the action writes.
22. **`Surface` extensibility is real** (§B3b). The lowerability matrix
    `app.predicate.lowerability(pred)` is a typed projection over
    registered surfaces, not a hardcoded shape. A new third-party
    dialect can register a `LoweringSurface` and it shows up in
    `$infer` immediately — no kernel edit, no PLAN edit, no fixed-key
    schema. The eleven derivations of §0.2 are the eleven surfaces
    shipped by the standard dialects, not special-cased.
23. **`Predicate` is generic over subject witness, vars, body,
    assurance, and flavor — and predicates always have a real body.**
    `Subject.where(pred)` only type-checks when the predicate's subject
    witness matches. `pred.$infer.subject` narrows
    `app.predicate.lowerability` result shapes. Marker claims (most
    traits, marker capabilities, assurances) are **edge attachments to
    kind nodes**, not predicates — they reuse the existing
    `defineEdgeKind` machinery rather than carrying empty bodies
    through the predicate pipeline.
24. **Assurance kinds are an open registry of typed edge-kind nodes**,
    not a closed enum. `defineAssuranceKind({ id, strongerThan })`
    adds a kind node and registers its position in the partial order
    via edges among kind nodes. Comparison walks the edge graph, not
    strings. A formal-verification dialect can add `CoqProof` /
    `LeanProof` without kernel edits.
25. **Refinements compose into a lattice** (§P4a). Chained
    `Subject.where(p1).where(p2)` is `RefinedType<S, And<P1, P2>>` with
    `body = expr.and(p1.body, p2.body)` and assurance = weakest. Other
    compositions are explicit: `Predicate.or`, `Predicate.not`,
    `Predicate.implies`, `Predicate.iff`. Refinements materialize as
    `RefinementNode`s in the graph; `app.explain(refined)` walks the
    chain.
26. **Policies are graph-native typed predicate bundles** (§P4b), not
    a flavor of predicate. `defineAuthPolicy(Subject, { action:
predicate, ... })` produces a typed witness; the eleven derivations
    fire on the wrapped predicates while the policy routes actions to
    predicates.
27. **Markers are edges; bodies are predicates** (§B3c). Marker traits,
    marker capabilities, and assurance kinds are typed edge-kind nodes
    in the existing kernel; their applications are edges with typed
    payloads. Bodied claims — laws, rules, body-bearing traits,
    guarded capabilities — go through the `Predicate` IR. One
    authoring family (`defineTrait` / `defineLaw` / `defineRule` /
    `defineCapability` / `defineAssuranceKind`, plus ergonomic forms)
    produces either an `Edge` or a `Predicate` depending on whether
    `.when(...)` is supplied; every factory exposes a uniform witness
    shape (`.id`, `.ref`, `.attachTo(...)`, `.refine(...)`,
    `.$infer`). `app.predicate.lowerability(...)` and the meta graph
    walk both shapes uniformly through that witness.
    `targets.negotiate(...)` walks marker capabilities as edge presence
    checks and guarded capabilities as predicate evaluations.
28. **No magic strings in internal APIs**. Predicate flavor, subject
    kind, surface ID, morphism phase, assurance level, and capability
    name all come from branded witness factories
    (`PredicateFlavor.trait`, `SubjectKind.entity`,
    `postgresId.surface("sqlPredicate")`, `MorphismPhase.lower`,
    `ProvedBySolver`, …). Internal storage may use strings for
    serialization; the public API exposes branded witnesses. The
    architecture test from §0.5 #7 extends to flavor / subject-kind /
    surface-ID / assurance / phase witnesses — any raw-string usage in
    new code fails the build.
29. **Curried builders preserve forward type inference** where step 2
    needs step 1's types. `defineLoweringSurface.id(...).consumes(...)
.yields(...).resultShape(...).done()` narrows each step against
    the prior; the object-form alias survives as a back-compat path
    that produces byte-identical surface witnesses.
30. **`nodeRef` is fully branded; ID factories carry paired ID and ref
    constructors** (§C #6a / Quick Win #12). Authoring uses
    `factory.node(kind, name)` for IDs and `factory.nodeRef(kind, name)`
    for refs at the same call site — raw strings only enter through
    `ref.parse.node(...)` / `ref.unsafe.node(...)`. Refs carry
    namespace + kind witness + stable name; the type system catches
    cross-namespace and cross-kind mixups. Forward refs in patches are
    supported; commit reconciliation emits `ref:dangling` for unmet
    refs.
31. **Dialects own their ID/ref factories**. `Dialect.id.node(...)` /
    `Dialect.id.nodeRef(...)` are auto-wired from the dialect's
    namespace literal. ID factories carry paired ID and ref
    constructors at every shape (node, edge, morphism, surface,
    pipeline) so authors call ID and ref construction at the same
    site without a separate top-level `ref.*` import.
    Cross-dialect identity mixups fail at the type level.
    Plugin/dynamic dialects expose the same shape with parse-
    diagnostics for pre-registration calls.
32. **Curried edge construction is the default DX.**
    `defineEdgeFromKind(...)` remains the low-level primitive, but
    docs and examples use `kernel.edge(kind).from(...).id(...).done()`.
    The builder binds the edge-kind witness first so endpoint keys,
    target node-kind constraints, metadata custom payloads, provenance
    payloads, and branded edge ID type all infer from `kind`. Raw edge
    IDs are accepted only through `.parseId(...)` / `.unsafeId(...)`;
    namespace factories and `autoId(factory, ...parts)` are the normal
    authoring path.
33. **Node kinds declare typed relation schema** (§B0a).
    `defineNodeKind(...).relations({ lines: hasMany(LineNode, { via:
HasLineEdge, min: 1 }) })` is the canonical authoring form for the
    standard dialects' primary node kinds. Verifiers ("every Invoice
    has 1+ lines"), pattern shortcuts (`pattern.from(Invoice)
.relation("lines")`), surface inputs (`consumes.relations`), and
    refinement bodies all read the relation schema directly. Inverse
    accessors auto-derive on target node kinds with dual cardinality.
34. `vp check` and `vp test` pass on every track landing.

---

## 6. Guardrails (already in `AGENTS.md`, restated)

- No new top-level semantic arrays on `GenContext`.
- No raw-string trait/kind/edge/capability identity in internal code.
- No new module-level checker registration outside the pass pipeline.
- Targets must consume legalized target dialect IR.
- Authoring facades must normalize to one canonical definition (see §2.5).
- TypeScript inference belongs at construction and query boundaries; the
  runtime IR stays simple and serializable.

These guardrails apply to every track in this plan.

---

## 7. Quick wins (do these first)

Small, mechanical, low-risk changes that remove smells the docs flagged
loudly. None depends on the larger track work; each can ship in a single
PR.

1. **`kernel/transform.ts:33`** — replace
   `id: \`transform:\${Date.now()}\``with a deterministic ID. Same for`kernel/diagnostic.ts:161` (`id: \`diag:\${code}:\${Date.now()}\``).
Date-based IDs forbid graph diff, snapshot replay, and rename
detection — exactly what `more_suggestions.txt`§2 and`versioning-plan.md`
   warn against.
2. **Delete `PassDiagnostic` and `KernelArtifact`**; have the pass runner
   produce the rich `Diagnostic` and `Artifact` types. Migrate the
   ~60 pass specs in `lifecycle.ts` to return `Diagnostic[]`.
3. **Fence `attachNode`/`attachEdge`** behind a `kernel.graph.build((w) =>
…)` writer. Today they are imported by 7 files; mark them
   `@deprecated` and add an architecture test that fails on new usage
   outside `kernel/{bridge,builder}.ts`.
4. **Add an architecture test** that fails when a new pass reads
   `passCtx.options.genContext` outside `src/lifecycle/*bridge*` files.
   Track E's exit criterion depends on this.
5. **Sketch the `Predicate` node kind and `Surface` aspect** (Track P
   §P0 / §B3 / §B3b / §B8). Add a `kernel/predicate.ts` with the
   generic five-field shape (`subject | vars | body | assurance |
flavor`) and a stub `definePredicate(...)`. Add a
   `kernel/surface.ts` with `Surface`, `defineLoweringSurface`,
   `defineDerivationSurface`, `defineEmitSurface`, and a typed
   `surface` aspect on morphism declarations. Existing `LawDef`,
   `TraitDef`, and the rule node kind stay in place; route new dialect
   work through `Predicate` and declare surfaces on the new lowering
   morphisms. This is the architectural beachhead for the full
   trait/law/rule unification _and_ the open-extension lowerability
   matrix — small in code, large in implication. The "pick one law
   system" decision is no longer "law vs trait" but "introduce
   `Predicate` as the kernel shape and migrate consumers behind the
   existing constructors." Existing `defineTrait` / `defineLaw` /
   `defineRule` call sites keep working unchanged; their results
   internally point at the new `Predicate` shape once the migration
   lands. The first registered surface should be one of the eleven
   rule-flavor derivations (e.g. `derive.predicate.invalidationDependencies`
   — already shipping per §P6 — gets a `DerivationSurface`
   declaration).
6. **Add `EntrypointTrait`** to the kernel trait registry — graph shaking
   (Track A) needs it as a starting symbol. One line of code, unblocks a
   later track.
7. **Add `tests/facades/`** with one test per major constructor that
   builds the same definition four ways (object / curried / callback /
   `.class`) and asserts byte-identical graph fragments. The current
   codebase passes zero of these; they become Track K's regression net.
8. **Build the vertical slice fixture (`tests/golden/opsdesk-slice/`).**
   Takes today's API; locks the emitted artifacts as golden snapshots. As
   each track lands, the slice is ported to the new APIs and the
   snapshots must remain byte-identical. This is the single biggest
   safety net for the rest of the rebase. See §3.5.
9. **Stable IDs at "warn" level today.** Add the
   `gen.config({ identity: { stableIds: "warn" } })` switch and the four
   diagnostic codes (`ref:missing-stable-id`,
   `ref:rename-without-stable-id`, `ref:duplicate-stable-id`,
   `ref:unstable-name-derived-id`). The "required" level lands with
   Track M; the "warn" level should land _now_ so usage data accumulates
   before required mode ships.
10. **Dialect-level golden tests** (`tests/golden/<dialect>/`). Adopt the
    MLIR pattern: every dialect ships small graph fragments and their
    expected lowered IR. Catches dialect-internal regressions that
    end-to-end artifact tests miss. Start with the three dialects most
    likely to break next (`callable`, `reactivity`, `auth`).
11. **`app.explain` stub.** Even a basic implementation that walks the
    derivation chain and prints "X invalidates Y because: …" delivers
    enormous DX value relative to its cost. Ship it as soon as there is
    one derivation pass to explain. See §0.5 #5 — explain is product.
12. **Tighten `nodeRef` shape and add `ref.*` namespace** (§C #6a). The
    current `nodeRef(kind, id: string, name?: string)` erases ID
    branding and uses positional `name`. Switch to
    `nodeRef(kind, brandedId, { name })` preserving `KernelId<"node">`
    and literal name. Add `nodeRef.parse(...)` and `nodeRef.unsafe(...)`
    as dynamic-ingestion companions. Introduce `ref.node(factory,
kind, name)` / `ref.edge(factory, kind, ...endpoints)` as the
    public ref namespace symmetric to `id.*`. Small, mechanical;
    unblocks branded patches and dialect-owned ref factories
    (Track A §9).
    12a. **Add `kernel.edge(kind)` builder as the public edge DX.** Keep
    `defineEdgeFromKind(...)` as the implementation primitive, but
    route examples and new authoring code through a curried builder:
    `kernel.edge(kind).from(endpoints).id(edgeId).metadata(input).done()`.
    This binds the edge-kind witness before endpoints, improves
    autocomplete, preserves endpoint/metadata generics, and lets the
    primary `.id(...)` path require a branded edge ID. Include
    `autoId(factory, ...parts)`, `.parseId(...)`, and `.unsafeId(...)`
    so normal authoring stays cast-free while dynamic importers stay
    explicit.
13. **Editor-DX type regression on the slice fixture.** Add
    `expectTypeOf` assertions proving `slice.acknowledgeIncident.writes`
    exposes useful literal field names, operation tags, endpoint keys,
    and `$infer` surfaces without call-site casts. Treat loss of those
    facts as breakage.

These twelve changes leave the codebase materially less stuck without
committing to any of the large refactors.
