# Gen2 CURRENT.md

Live status for executing [`PLAN.md`](./PLAN.md). Keep this file compact:
it is the context handoff, not the historical journal.

---

## At A Glance

| Metric                             | Now (verified 2026-05-18)                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test files                         | **125 passed** via `vp test`                                                                                                                                                                                                                                                                                                                                                                                      |
| Tests                              | **1,170 passed**, **0 todo**                                                                                                                                                                                                                                                                                                                                                                                      |
| `lifecycle.ts` size                | **71 lines** (public re-export wrapper)                                                                                                                                                                                                                                                                                                                                                                           |
| Legacy bridge specs                | **0** in `src/lifecycle/legacy-check-bridge.ts` (down from ~60). Final 2026-05-18 batch ported 16 ctx-direct checks to domain-owned `src/<domain>/passes.ts` modules: storage (3), services, ui, editors, crud, list, state, scopedResources, targetCompatibility, obligations, merge (planMerge), orchestration (cron), workflow, boundary, offline. `registerBuiltInPasses` now bundles the dialect registrars. |
| Distinct `_bridge*` keys in src/   | **0** — bridge metadata surface retired                                                                                                                                                                                                                                                                                                                                                                           |
| Eleven rule derivations green      | **11 of 11** at contract level — R-1/R-5 via lowerability matrix; R-2 emits `pg.rls-policy`; R-6/R-7/R-10 emit docs artifacts; R-8 materializes `INVALIDATES_KEY` edges; runtime depth is Track F work                                                                                                                                                                                                            |
| `Predicate` IR landing (§P0)       | **initial kernel beachhead 2026-05-15** — `src/kernel/predicate.ts` defines canonical `Predicate`, branded `PredicateFlavor`, `SubjectKind`, open `AssuranceKind`, and `definePredicate(...)`; existing trait/law/rule consumers are not migrated yet.                                                                                                                                                            |
| `Surface` primitive (§B3b)         | **first real surface registered 2026-05-15** — initial builders landed, and `derive.rule.invalidationDependencies` now carries `RULE_INVALIDATION_SURFACE` (`surface.rule.invalidationDependencies`) as a real derivation surface.                                                                                                                                                                                |
| `GraphPattern` / `GraphMatch`      | **two proof slices ported 2026-05-15** — `src/kernel/pattern.ts` adds `defineGraphPattern(...)`, typed node/edge/expr bindings, `materialize`/`first`/`count`/`stream`. Both rule→RLS (`RLS_POLICY_PATTERN`) and rule-invalidation (`RULE_INVALIDATION_SOURCE_PATTERN`) source-match through patterns.                                                                                                            |
| `GraphMorphism` / `defineMorphism` | **two production ports + dialect registration 2026-05-15** — `src/kernel/morphism.ts` exports `defineMorphism(...)` with `map`/`mapAll`, narrowed `helpers.patch`, and Artifact emission. Both `RLS_POLICY_MORPHISM` and `RULE_INVALIDATION_MORPHISM` run in production. `defineDialect({ morphisms })` exposes `Dialect.morphisms` and auto-derives `Dialect.surfaces` from `morphisms[*].surface`.              |
| `definePipeline(...)` witnesses    | **initial implementation 2026-05-14** — preserves literal pipeline names/pass tuples; `runPassPipeline`, `previewPassPipeline`, and `gen.preview.pipeline` accept witnesses or raw arrays                                                                                                                                                                                                                         |
| Relation accessors (§B0a)          | **inverses + diagnostics landed 2026-05-15** — `hasOne`/`hasZeroOrOne`/`hasMany`/`hasRange`/`belongsTo`, `defineNodeKind(...).relations({...})`, `kernel.related(graph, node, kind, { peers? })` with auto-derived inverse accessors, and `kernel.checkRelations(graph, node, kind)` underflow/overflow diagnostics. `.order(...)` literals now preserved in `$infer`. OpsDesk adoption is follow-up work.        |
| `nodeRef` shape (§C #6a)           | **tightened 2026-05-14** — primary path takes namespace/kind-branded node IDs plus `{ name }`; raw strings moved to `nodeRef.parse/unsafe`                                                                                                                                                                                                                                                                        |
| `ref.*` namespace                  | **initial implementation 2026-05-14** — `ref.node`, `ref.edge`, `ref.parse.*`, `ref.unsafe.*` delegate to namespace ID factories                                                                                                                                                                                                                                                                                  |
| `kernel.edge(kind)` builder        | **initial implementation 2026-05-14** — binds edge-kind first, infers endpoints/metadata, supports branded `.id`, `.autoId`, `.parseId`, `.unsafeId`                                                                                                                                                                                                                                                              |
| Branded graph patch IDs            | **initial implementation 2026-05-14** — kind-witness `graphPatch.addNode/addEdge` paths require branded IDs; raw IDs moved to `.unsafe(...)`                                                                                                                                                                                                                                                                      |
| Dialect-owned ID/ref factories     | **target naming landed 2026-05-15** — `defineDialect` accepts a `namespace` literal and exposes `Dialect.id` as the namespace-bound ID/ref factory; symbolic registry identity moved to `Dialect.dialectId`.                                                                                                                                                                                                      |

Green gates:

```powershell
vp test
vp check
```

`vp test` and the OpsDesk slice golden snapshots are gating. `vp check`
should be run before finishing code changes; if it hits the known broad
type-aware lint baseline, report that clearly and verify touched files
with focused tests/formatting.

---

## What This Project Is

Gen2 / Dirived is a **typed semantic graph compiler** for full-stack
applications. The composition chain (PLAN §0.1):

```txt
Nodes -> Types -> Operations -> Expressions -> Functions -> Predicates
                                                            ├─ Traits
                                                            ├─ Laws
                                                            └─ Rules
                                                              (refinements
                                                               feed back
                                                               into Types)
```

The updated PLAN is trying to collapse the public mental model toward
five high-level primitives:

```txt
Node       typed graph thing with identity
Edge       typed atomic relation between nodes (with typed payload)
Predicate  typed bodied claim (laws, rules, body-bearing traits/capabilities)
Diagnostic typed observation + provenance + repair patches
Pattern    typed query returning bindings
```

Everything else (Entity, Action, Rule body-bearing forms, Query, Policy,
KeyFamily, Provider, Route, UI, target IR) is a **dialect** layered over
the kernel. See [`GETTING_STARTED.md`](./GETTING_STARTED.md) for the
intended DX and [`PLAN.md`](./PLAN.md) for the full design.

Implementation reality: `src/kernel` still contains the broader
transitional primitive set (`id`, `symbol`, `trait`, `type`, `expr`,
`node`, `edge`, `graph`, `patch`, `derivation`, `stage`, `pass`,
`dialect`, `lower`, etc.). Do not delete or flatten those until the
Predicate/Surface/Pattern work has real adapters and tests.

Predicates are the keystone. A single authored rule should fan out to
server guards, RLS policy, SQL predicates, client UI hints, form
validation, test matrices, access matrices, reactivity dependencies, IVM
plans, audit explanations, and optimistic enablement.

---

## Current Design Commitments

### Markers Are Edges; Bodies Are Predicates (§B3, §B3c)

This is the single most load-bearing design call. **Atomic typed
relations are edges; bodied typed claims are predicates.**

```txt
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
            └─ Capability with .when()  (subject: Dialect; body: feature gate)
```

One authoring family — `defineTrait` / `defineLaw` / `defineRule` /
`defineCapability` / `defineAssuranceKind`, plus ergonomic forms — produces
either an `Edge` or a `Predicate` depending on whether `.when(...)`
supplies a body. The public witness shape is uniform either way
(`.id`, `.ref`, `.attachTo(...)`, `.refine(...)`, `.$infer`); consumer
passes walk both shapes through `app.predicate.lowerability(...)` and
`app.explain(...)` without branching on representation.

`defineLaw` and `defineRule` always produce predicates (always bodied).
`defineAssuranceKind` always produces an edge kind (assurances are
markers with a `strongerThan` partial order among kinds).

### Typed Graph Programs

Graph derivation, piping, patching, diagnostics, and emitting are
first-class compiler concepts. The target spine:

```txt
GraphPattern -> GraphMatch -> GraphProjection / GraphMorphism
GraphMorphism -> GraphPatch[] -> GraphStageResult
Pipeline -> preview / explain / diff / emit artifacts
```

Current runtime spine that exists in code:

- `src/kernel/predicate.ts` — initial canonical `Predicate` witness,
  `PredicateFlavor`, `SubjectKind`, open `AssuranceKind`,
  `definePredicate(...)`, and `assuranceAtLeast(...)`.
- `src/kernel/surface.ts` — initial `Surface` witness and lowering /
  derivation / emit surface builders, with object and curried forms.
- `src/kernel/derivation.ts` — `GraphDerivation` now has an optional
  `surface` witness and the builder supports `.surface(...)`.
- `src/kernel/pattern.ts` — initial `GraphPattern` / `GraphMatch`
  matcher with named node, edge, and expression bindings plus
  `materialize`, `first`, `count`, and `stream` modes.
- `src/kernel/patch.ts` — `GraphPatch`, verification, application,
  witness-first `graphPatch.addNode(...)` / `addEdge(...)`. Kind-
  witness patch construction now requires namespace/kind-branded IDs;
  dynamic raw IDs use `graphPatch.addNode.unsafe(...)` /
  `graphPatch.addEdge.unsafe(...)`.
- `src/kernel/stage.ts` — `GraphStageResult`,
  `summarizeStageResult(...)`.
- `src/kernel/pass.ts` — `definePipeline(...)`,
  `previewPassPipeline(...)`, `runPassPipeline(...)`.
- public `gen.preview.pipeline(...)` wrapper.

Still design-only / not implemented:

- `GraphMorphism` / `defineMorphism`;
- static/run meta graph materialization.
- `definePipeline(...)` typed witness builder is implemented, but
  pipeline result generics for emitted artifact/diagnostic/patch unions
  are still future work;
- `Surface` declarations on morphisms/lowerings;

Hardening targets for existing spine:

- Make `GraphPatch`, `GraphDerivation`, `GraphStageResult`, diagnostic
  repairs, lowerings, and pipeline previews generic and
  witness-preserving instead of collapsing to broad `GraphPatch[]`,
  `KernelEdge`, or `string[]`.
- `GraphPattern` exists in initial form. Rule→RLS
  (`legalize.rule.toRlsPolicy`, §P2 rule 2) is the first proof slice.
  Next: back-port `derive.rule.invalidationDependencies` to a pattern
  source shape so both passes share one execution model.

### Surfaces (§B3b)

Lowerability/derivation/emit matrices are **open-extension typed
projections**, not closed sets of keys. A morphism that's part of a
target's public contract carries a `surface` declaration:

```ts
defineMorphism({
  ...,
  surface: defineLoweringSurface
    .id(postgresId.surface("sqlPredicate"))
    .consumes({ subjects: [SubjectKind.entity], requires: [SqlLowerable] })
    .yields(PostgresDialect.nodes.sqlPredicate)
    .resultShape(SqlPredicateLowerabilityShape)
    .done(),
});
```

`app.predicate.lowerability(pred)` returns a typed projection over all
registered surfaces. Adding a new dialect (GraphQL, Effect-Atom,
ConnectRPC) registers new surfaces; they appear in `$infer`
automatically. **Not yet implemented in the kernel.**

### Refs, IDs, And Dialect-Owned Factories

Raw string IDs are serialization/dynamic-ingestion details, not normal
authoring shape. Prefer namespace-bound branded factories:

```ts
const reactivityId = id.createFactory("reactivity");
reactivityId.node(KEY_FAMILY_NODE_KIND, "OpenIncidents");
reactivityId.edge(INVALIDATES_KEY_EDGE_KIND, actionRef, keyRef);
```

Done:

- `src/kernel/id.ts` exposes `id.createFactory(namespace)`.
- factory-scoped `parse.*` helpers exist for dynamic IDs.
- branded IDs preserve ID family, namespace, and node/edge kind witness.
- runtime and `.test-d.ts` coverage exist.

Open work (PLAN §C #6a, Quick Win #12):

- `nodeRef(kind, brandedId, { name })` is implemented in
  `src/kernel/node.ts` for namespace/kind-branded IDs from
  `id.createFactory(namespace)`. It preserves the ID and literal name.
  `nodeRef.parse(...)` and `nodeRef.unsafe(...)` are the dynamic-
  ingestion companions.
- Initial `ref.*` namespace exists in `src/kernel/node.ts`:
  `ref.node(factory, kind, name)`,
  `ref.edge(factory, kind, ...parts)`, `ref.parse.*`, `ref.unsafe.*`.
  It delegates to `id.createFactory(...)` and returns typed node/edge
  refs. It is exported through `kernel`.
- Transitional source adapters now use namespace-bound parse factories
  where they still derive refs from legacy raw strings. `nodeRef.unsafe`
  is limited to the `ref.unsafe` implementation and type-level tests.
- Refs are typed pointers, not existence proofs. Forward refs work
  during patch construction; verification at commit emits
  `ref:dangling` for unreconciled refs.
- Dialect-owned ref/id factories (Track A §9): target naming landed
  2026-05-15. `defineDialect({ ..., namespace: "callable" })` exposes
  `dialect.id`, a namespace-bound `NamespaceIdFactory<Namespace>`
  with `.node(...)`, `.edge(...)`, `.nodeRef(...)`, `.edgeRef(...)`,
  `.parse.*`. Branded with the namespace literal so cross-dialect mixups
  fail at the type level. When `namespace` is omitted, falls back to the
  constructor `id.value` suffix (strips `dialect.` prefix).
  `NamespaceIdFactory`
  itself now carries `nodeRef`/`edgeRef` (and parse counterparts), so
  plain factories created via `id.createFactory(...)` also expose the
  full id+ref surface — there is no separate `factory.ref.*` namespace.
  Symbolic dialect registration identity is now `dialect.dialectId`.

### Edge Construction DX

`defineEdgeFromKind(kind, id, endpoints, input)` remains the low-level
implementation primitive. The preferred public DX layer now binds the
edge-kind witness first:

```ts
kernel
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

Design rules:

- `kernel.edge(kind)` captures `Kind` once, then endpoint keys,
  endpoint target-kind constraints, custom metadata payloads,
  provenance payloads, and edge ID brands infer from that witness.
- Primary `.id(...)` accepts only branded `KernelId<"edge">` values
  whose edge-kind witness matches `kind`; raw strings are limited to
  `.parseId(...)` / `.unsafeId(...)`.
- `.autoId(factory, ...parts)` lets normal authoring use
  namespace-bound factories without manually assembling edge IDs.
- Initial implementation lives in `src/kernel/edge.ts` and is exported
  through `kernel`. Type coverage lives in
  `tests/kernel-typed-witnesses.test-d.ts`.
- Optional callback endpoint form is still open and allowed when it improves
  autocomplete for complex edges:
  `kernel.edge(kind).from((e) => ({ from: e.node(...), ... }))`.
- `defineEdgeKind(...).edge(...)` may later exist as sugar, but it
  should delegate to `kernel.edge(kind)` so the inference path stays
  single-source.

### Relation Accessors On Node Kinds (§B0a)

`defineNodeKind(...).relations({...})` is a **typed view over existing
edge kinds**, not a new IR primitive. The graph stays edge-shaped;
authoring gains a typed accessor schema.

```ts
const InvoiceNode = defineNodeKind({...}).relations({
  customer:    hasOne(CustomerNode,     { via: InvoicePaidByCustomerEdge }),
  lines:       hasMany(InvoiceLineNode, { via: InvoiceHasLineEdge, min: 1 }),
  payments:    hasMany(PaymentNode,     { via: PaymentSettlesInvoiceEdge })
                 .order(PaymentNode.fields.settledAt, "desc"),
  parent:      belongsTo(InvoiceNode,   { via: InvoiceParentEdge }).optional(),
});

invoiceNode.related.customer();     // KernelNodeRef<Customer>
invoiceNode.related.lines();        // [Line, ...Line[]] (non-empty when min: 1)
```

Buys: free verifiers, pattern shortcuts, surface input precision,
refinement composition, deterministic FK/index lowering, invalidation
precision, self-documenting schema. **Not yet implemented.** Domain
dialect's `Relation` (entity-entity, integrity/FK payload) stays as a
specialization.

### Facts, Metadata, And Authoring Discipline

Use:

- **typed nodes** for durable things with identity;
- **typed edges** for durable relationships/facts (including
  trait/capability/assurance markers);
- **typed predicates** for bodied claims (laws, rules, body-bearing
  traits/capabilities);
- **typed patterns/matches** for reusable graph source shapes;
- **typed projections** for computed read models;
- **typed morphisms** for graph-to-graph mapping (with optional
  `surface` for public contracts);
- **typed patches** for durable graph transactions;
- **typed diagnostics** for observations and repair options;
- **metadata** only for attached display/source/provenance/custom payload.

Rule:

> If another pass needs to find it, join on it, explain it, diff it,
> repair it, target-lower it, or attach diagnostics to it, make it a
> typed node, edge, predicate, projection, morphism output, or patch.
> Do not hide it in metadata.

### Type Inference Rules

Use `docs/typescript_inference_cheatsheet.txt` before shaping public
builders. Normal authoring should not need casts, explicit type
arguments, or manual narrowing.

Rules:

- create typed witnesses first; infer downstream from values;
- no magic strings in typed APIs — predicate flavor, subject kind,
  surface ID, morphism phase, assurance kind, and capability identity
  all come from branded witness factories;
- preserve literal names, endpoint keys, payload types, pass names,
  pipeline names, artifact kinds, and law/predicate identities;
- expose flattened `$infer` surfaces for major witnesses;
- keep dynamic plugin/importer data behind parse/narrow/diagnose APIs;
- public kind definitions must never require
  `undefined as unknown as T`; use payload/schema witnesses or fluent
  `.custom<T>()` type-only helpers;
- curried builders are preferred where step 2 needs step 1's types
  (e.g. `defineLoweringSurface.id(...).consumes(...).yields(...)
.resultShape(...).done()`).

---

## Implemented Milestones

### Bridge Retirement (2026-05-11)

- Distinct `_bridge*` keys in `src/`: **0**.
- `_bridgeRef`, `_bridgeField`, `_bridgeEntity`, `_bridgeKeyFamily`,
  `_bridgeRule`, `_bridgeRuleView`, and related typed-payload
  migrations are retired.
- Canonical replacement: typed node/edge custom payload + graph-edge
  verification + graph-native reader/pass.
- **Do not add new `_bridge*` keys** (PLAN §0.5 #8).

### Pass Pipeline Migration

Status: Track E §1 done; Track E §2 in progress. **19 specs remain** in
`legacy-check-bridge.ts`.

Completed clusters:

- lifecycle routing through pass registries;
- symbol/entity/function/relation/event/reaction verification ports;
- auth, API, route, query-shape/runtime, cross-store, planner, and
  function derivation/legalization ports;
- reactivity invalidation/optimistic ports;
- core no-op pass bridge removal;
- `derive.rule.reactivity` port.

Remaining Track E §2 work (port-or-delete each):

- `verify-dialects.config`
- storage/mapping checks:
  `verify-dialects.storageInvariants`,
  `verify-dialects.traits` (currently `checkMappings`),
  `verify-dialects.reversibleMappings`
- `derive.services`
- `verify-symbols.magicStrings`
- UI/editors/CRUD/list legalizers
- state/scoped-resource/target-compatibility legalizers
- cron/workflow/boundary/obligations legalizers
- `canonicalize.planMerge`
- `legalize.offline`

### Rule Derivation Matrix

All eleven derivations are active at contract level.

- R-2 emits real RLS policy artifacts via graph-native
  `legalize.rule.toRlsPolicy`.
- R-6/R-7/R-10 emit docs artifacts.
- R-8 (the keystone graph derivation) ships as
  `derive.rule.invalidationDependencies`. **The pass predates
  `GraphPattern`/`GraphDerivation`**; it gets back-ported once those
  primitives land via the rule→RLS lowering proof slice.

Runtime-grade target artifacts are still Track R / Track F work.

### Diagnostics

Diagnostic unification phases 1-3 complete:

- severity alignment, including `hint`;
- structural fields preserved at the runner seam;
- canonical type via `kernel.Diagnostic = core.Diagnostic` re-export.

### Quick Wins

PLAN §7 quick wins 1-11 are complete. Notable outcomes:

- deterministic transform/diagnostic IDs;
- laws unified into traits;
- `ENTRYPOINT` trait added;
- pass/artifact forks collapsed;
- architecture guardrails added (`tests/architecture/*`).

Quick Win **#12 / 12a** is partially implemented:

- `nodeRef(kind, brandedId, { name })`, `nodeRef.parse`,
  `nodeRef.unsafe`, and initial `ref.*` namespace are in place.
- `kernel.edge(kind)` builder is in place for object endpoint maps,
  branded `.id`, `.autoId`, `.parseId`, `.unsafeId`, and typed
  `.metadata(...)` / `.input(...)`.
- `graphPatch.addNode` / `graphPatch.addEdge` kind-witness overloads
  now require branded IDs. Raw graph patch IDs are explicit through
  `.unsafe(...)` companions.
- Production `src/` adapters no longer call `nodeRef.unsafe(...)`
  directly; obvious legacy raw-ID sites now parse through
  namespace-bound factories.
- Remaining: callback endpoint helper form and dialect-owned ID/ref
  factories.

---

## Next Up

The PLAN sequencing puts these in this order. **Each milestone closes
behind a slice green-gate** (Track Z OpsDesk fixture; `tests/golden/
opsdesk-slice/slice.test.ts`).

### 1. Finish typed refs and IDs

PLAN §C #6a, Quick Win #12.

- Done 2026-05-14: `nodeRef(kind, brandedId, { name })`,
  `nodeRef.parse`, `nodeRef.unsafe`, and initial `ref.*` namespace.
- Done 2026-05-14: `.test-d.ts` coverage for raw-string rejection on
  the primary authoring path, node-kind/ID witness mismatches, literal
  name preservation, and endpoint construction with kind-aware refs.
- Done 2026-05-14: `graphPatch.addNode` / `graphPatch.addEdge`
  kind-witness overloads accept branded IDs and preserve those IDs in
  the returned patch witness. Raw-string graph patch construction moved
  behind `graphPatch.addNode.unsafe(...)` /
  `graphPatch.addEdge.unsafe(...)`.
- Done 2026-05-14: initial `kernel.edge(kind)` builder wraps
  `defineEdgeFromKind`, preserves `EndpointInputsFor<Kind>` /
  `EdgeMetadataFor<Kind>`, requires branded edge IDs on `.id(...)`, and
  provides `.autoId(factory, ...parts)`, `.parseId(...)`, and
  `.unsafeId(...)`.
- Done 2026-05-14: source adapters that still receive legacy raw node IDs
  now parse them through namespace-bound factories; direct
  `nodeRef.unsafe(...)` usage is gone from production `src/` outside the
  `ref.unsafe` implementation.
- Done 2026-05-18: optional callback endpoint helper form on
  `kernel.edge(kind).from((e) => ({...}))`. `e.node(ref)` is a typed
  pass-through (useful for naming clarity); `e.with(ref, cardinality)`
  attaches typed cardinality. Endpoint inference is preserved. Type
  coverage in `tests/kernel-typed-witnesses.test-d.ts`.
- Done 2026-05-15: dialect helpers use the PLAN target name:
  `Dialect.id.node(...)`, `Dialect.id.edge(...)`,
  `Dialect.id.nodeRef(...)`, and `Dialect.id.edgeRef(...)`. Raw
  `ref.unsafe.*` remains the dynamic/plugin boundary.

### 2. Add typed pipeline witnesses

PLAN §0.1a / Track A.

- Done 2026-05-14: `definePipeline(name, passes)` preserves literal
  pipeline name and pass tuple while keeping current `PipelineDef`
  compatibility.
- Done 2026-05-14: `runPassPipeline` and `previewPassPipeline` accept
  either typed pipeline witnesses or current raw pass-name arrays.
- Done 2026-05-14: `gen.preview.pipeline(...)` accepts typed pipeline
  witnesses through the public preview namespace.
- Done 2026-05-14: runtime/type coverage in
  `tests/pass-pipeline.test.ts` for literal names, pass tuple
  inference, witness execution, and public preview namespace execution.
- Done 2026-05-18: `GraphMorphism` preserves Nodes/Edges/Artifacts
  generics on `morphism.to`. Callers see typed unions (e.g. `readonly
["pg.rls-policy", "tsx.component"]`) instead of opaque `string[]`.
  Type coverage in `tests/kernel-morphism.test-d.ts`. First
  incremental step toward broader pipeline result generic narrowing.
- Remaining: broaden pipeline result generics for emitted artifact
  kinds, diagnostic repair patch unions, produced patch kinds, and
  `GraphStageResult` unions once graph stages become generic. The
  morphism `to` work above is one slice; the harder work is making
  `PassResult.artifacts` narrow through `runPassPipeline` and through
  the pipeline-witness-aware `app.preview` API.

### 3. Dialect-owned ID/ref factories

PLAN Track A §9.

- Done 2026-05-15: `defineDialect` accepts an optional `namespace`
  literal; when omitted, derived from the suffix of `id.value`. The
  resulting `Dialect.id` is auto-wired via `id.createFactory` and
  exposes branded `.node/.edge/.nodeRef/.edgeRef` plus `.parse.*` —
  cross-dialect/cross-namespace mixups fail at the type level.
- Done 2026-05-15: `NamespaceIdFactory` itself now carries
  `nodeRef`/`edgeRef` (and parse counterparts), so plain factories
  created via `id.createFactory(...)` also expose the full id+ref
  surface. There is no separate `factory.ref.*` namespace.
- Done 2026-05-15: all 15 core dialects now declare an explicit
  `namespace` literal — `auth`, `callable`, `core.claim`,
  `core.context`, `core.exprRule`, `core.ownership`, `core.placement`,
  `core.provider`, `core.ref`, `core.requirement`, `core.typeOperation`,
  `domain.entityFieldRelation`, `postgres`, `reactivity`, `target`,
  `ui` (and `core.ref` via `RefDialect`). The runtime fallback (suffix
  of `id.value`) remains for dynamic plugin dialects that omit the
  literal.
- Done 2026-05-15: runtime coverage in `tests/dialects.test.ts` and
  type coverage in `tests/kernel-typed-witnesses.test-d.ts`
  (`namespace factory exposes typed nodeRef and edgeRef constructors`,
  `dialect-owned id factory inherits namespace literal and brands
cross-dialect refs`).
- Done 2026-05-15: renamed the public dialect-owned factory from
  `Dialect.factory` to `Dialect.id`; the previous symbolic identity slot
  is now `Dialect.dialectId`, and `DialectRegistry.getById(...)` indexes
  that identity.
- Done 2026-05-18: `kernel.verifyDialectRegistered(registry, dialect)`
  emits a typed `dialect:not-registered` error when a (plugin /
  dynamic) dialect was constructed but not added to the active
  registry. Returns `[]` for registered dialects, including the static
  core ones registered at `createGen` time. Coverage in
  `tests/dialects.test.ts` (3 cases).

### 4. Land `Predicate` IR and `Surface` primitive (kernel beachhead)

PLAN §P0, §B3, §B3b. Pre-release rule: **additive, not destructive**;
existing `defineTrait`/`defineLaw`/`defineRule` keep working.

- Done 2026-05-15: add `src/kernel/predicate.ts` with the
  `Predicate<TSubject, TVars, TBody, TAssurance, TFlavor>` shape and
  `definePredicate(...)`.
- Done 2026-05-15: add branded witness registries:
  `PredicateFlavor`, `SubjectKind`,
  assurance kinds (`Asserted`, `Tested`, `ProvedBySolver`, …) with
  `defineAssuranceKind`, `strongerThan`, and `assuranceAtLeast(...)`.
- Done 2026-05-15: add `src/kernel/surface.ts` with `defineLoweringSurface`,
  `defineDerivationSurface`, `defineEmitSurface`, plus a curried
  builder form and an object-form alias.
- Add the `surface` aspect once `GraphMorphism` exists.
  `Dialect.surfaces` should be derived from `morphisms[*].surface`.
- Done 2026-05-15: registered the first real surface on
  `derive.rule.invalidationDependencies`. `RULE_INVALIDATION_SURFACE`
  consumes action-write, rule-read, policy-use, and query-read edges;
  yields `INVALIDATES_KEY_EDGE_KIND`; and is attached through
  `GraphDerivation.surface`.

### 5. Add `GraphPattern` / `GraphMatch`

PLAN Track A §1.

- Done 2026-05-15: define `defineGraphPattern({...})` with typed named bindings, edge-
  kind references, and same-node constraints.
- Done 2026-05-15: compile edge/node clauses through existing
  `GraphIndex` helpers (`nodesOfKindDef`, `edgesOfKindDef`, and
  `edgesOfKindAtEndpoint`) with fallback joining for legacy name refs.
- Done 2026-05-15: expose match modes: `stream`, `first`, `count`,
  `materialize`.
- Done 2026-05-15: proof slice ported rule→RLS source matching
  (`legalize.rule.toRlsPolicy`, §P2 rule 2) to `RLS_POLICY_PATTERN`.
  Artifact generation remains unchanged.
- Done 2026-05-15: back-ported `derive.rule.invalidationDependencies`
  to `RULE_INVALIDATION_SOURCE_PATTERN` — matches the canonical chain
  `Action ─[writes]→ Field ←[reads]─ Rule`. Pattern matches replace the
  nested `actionOverlapsRuleOnGraph` loop; precision/family/confidence
  bookkeeping is unchanged. Helpers `actionOverlapsRuleOnGraph` and
  `ruleReadFieldsFromGraph` are now dead code and have been deleted.

### 6. Add `GraphMorphism`

PLAN Track A §2.

- Done 2026-05-15: `defineMorphism({ name, phase, from: GraphPattern,
to: { nodes?, edges?, artifacts? }, map, surface?, diagnostics?,
explanation? })` in `src/kernel/morphism.ts`. Phase covers
  `derivation` / `lowering` / `import` / `emission` — one execution
  model. `morphism.run(graph)` walks pattern matches and aggregates
  patches/diagnostics/explanations. `morphism.toDerivation()` compiles
  to a `GraphDerivation` so the existing pass pipeline keeps working.
- Done 2026-05-15: runtime coverage in `tests/kernel-morphism.test.ts`
  (5 tests: metadata, run, matches, toDerivation, aggregation).
- Done 2026-05-15: narrowed patch builder on `helpers.patch`.
  `helpers.patch.addEdge(kind, id, endpoints)` and
  `helpers.patch.addNode(kind, id, input?)` constrain the `kind`
  parameter to entries from `def.to.edges` / `def.to.nodes`
  respectively (degrades to the kernel-wide types when `to` is empty).
  Delegates to `graphPatch.addEdge` / `graphPatch.addNode`.
- Done 2026-05-15: morphism registration on dialects.
  `defineDialect({ ..., morphisms: [m1, m2] })` accepts morphism
  witnesses; `Dialect.morphisms` exposes them at runtime.
  `Dialect.surfaces` is auto-derived from `morphisms[*].surface`
  (deduplicated by surface id). Coverage in `tests/dialects.test.ts`.
- Done 2026-05-18: wired `RULE_INVALIDATION_MORPHISM` into
  `ReactivityDialect` and `RLS_POLICY_MORPHISM` into `AuthDialect`
  via the new `kernel.attachMorphism(dialect, morphism)` mutator
  (`src/kernel/dialect.ts`). The mutator dedups by morphism name and
  carries the morphism's surface into `dialect.surfaces`. Wiring fires
  at module load (`src/rules/rls-pass.ts`, `src/reactivity/passes.ts`).
  Resolves the previously documented import-direction block without
  requiring `dialects/*.ts` to import the pass layer.
- Done 2026-05-18: static meta facts for morphism registration via
  `kernel.morphismMetaFacts(dialect)`. Materializes `Morphism`,
  `BelongsToDialect`, `ReadsNodeKind` / `ReadsEdgeKind` (from pattern),
  `EmitsNodeKind` / `EmitsEdgeKind` / `EmitsArtifactKind` (from `to`),
  optional `HasSurface`, and per-code `DiagnoseCode`. Coverage in
  `tests/dialects.test.ts`.
- Done 2026-05-18: run meta facts via `morphism.run()` (`producedBy`,
  `matchCount`) and `kernel.morphismRunMetaFacts(result)` which
  derives typed `RanMorphism` / `Produced{Patch,Diagnostic,Artifact,
Explanation}` facts. This is the execution-time companion of the
  static facts above and the seam `app.explain` will consume.
- Done 2026-05-18: morphism dependencies — `defineMorphism({
dependsOn: [...] })` plus `kernel.topologicalSortMorphisms(...)`.
  Returns dependency-respecting order with typed cycle / unknown-dep
  diagnostics. Coverage in `tests/kernel-morphism.test.ts`.
- Done 2026-05-15: `MorphismMapOutput` now includes optional
  `artifacts: readonly Artifact[]` for lowering/emission phases;
  runtime + type coverage in `tests/kernel-morphism.test.ts`.
- Done 2026-05-15: `legalize.rule.toRlsPolicy` ported to a morphism
  (`RLS_POLICY_MORPHISM`) — first production pass using
  `defineMorphism(...)`. Emits `pg.rls-policy` artifacts via the
  morphism's `artifacts` channel; existing tests (`rule-rls-pass.test`,
  `golden/opsdesk-slice`) pass without change.
- Done 2026-05-15: morphism `mapAll(matches, helpers)` aggregation form
  added. Use `mapAll` when the transformation needs cross-match
  grouping (e.g. plan-level grouping over per-match results); use `map`
  for independent per-match transformations. The builder rejects both
  or neither being supplied.
- Done 2026-05-15: `derive.rule.invalidationDependencies` ported to
  `RULE_INVALIDATION_MORPHISM` (`mapAll` variant); the surface,
  diagnostics, repair patches, and explanation are unchanged. The pass
  registry still wires through `morphism.toDerivation()`.

### 7. Relation accessors on node kinds

PLAN §B0a.

- Done 2026-05-15: standalone `RelationWitness` primitives in
  `src/kernel/relations.ts` with factories `hasOne` /
  `hasZeroOrOne` / `hasMany` / `hasRange` / `belongsTo`. Target,
  via edge-kind, cardinality (`{ min, max }`), endpoint key, and
  required-ness are preserved in `$infer`. `hasOne(...).optional()`
  widens 1..1 → 0..1. `hasMany(...).order(field, "asc" | "desc")`
  attaches an order hint. `belongsTo` carries a `flavor: "belongsTo"`
  tag so storage lowerings can decide which side owns the FK.
- Done 2026-05-15: runtime coverage in `tests/kernel-relations.test.ts`
  and type coverage in `tests/kernel-relations.test-d.ts`.
- Done 2026-05-15: `defineNodeKind(...)` now returns a
  `NodeKindBuilder` with a fluent `.relations(schema)` step. The
  augmented kind is typed as `NodeKindDefWithRelations<...>` and
  carries the schema under `relationSchema`. The bare `NodeKindDef`
  shape is preserved for all existing callsites that don't opt in.
  Runtime + type coverage in `tests/kernel-relations.{test,test-d}.ts`.
- Done 2026-05-15: `kernel.related(graph, node, kindWithRelations)`
  returns a typed accessors object whose method shape mirrors
  `kind.relationSchema`. Return types are bounded by cardinality:
  1..1 → `KernelNodeRef<Target>`; 0..1 → `KernelNodeRef<Target> |
undefined`; 0..N → `readonly KernelNodeRef<Target>[]`; 1..N → non-
  empty tuple. Runtime walks edges of the relation's `via` kind and
  returns refs to the other-side endpoint. Coverage in
  `tests/kernel-relation-accessors.{test,test-d}.ts`.
- Done 2026-05-15: runtime underflow/overflow diagnostics via
  `kernel.checkRelations(graph, node, kind)`. Emits
  `relation:underflow` (error) when target count is below
  `cardinality.min` and `relation:overflow` (warning) when above a
  finite `cardinality.max`. Returns `[]` when satisfied. Coverage in
  `tests/kernel-relation-accessors.test.ts`.
- Done 2026-05-15: auto-derived inverse accessors via
  `kernel.related(graph, node, kind, { peers })`. For each peer whose
  `relationSchema` declares a relation targeting `kind`, the result
  exposes an inverse accessor named by the peer kind id's last dotted
  segment. Inverse cardinality always widens to `readonly Ref[]` (any
  number of peers may reference the same target). Coverage in
  `tests/kernel-relation-accessors.test.ts`.
- Done 2026-05-18: schema-bearing companions
  `ENTITY_NODE_KIND_WITH_RELATIONS` and `FIELD_NODE_KIND_WITH_RELATIONS`
  ship alongside the bare exports in
  `src/dialects/domain/entity-field-relation.ts`. The bare kinds keep
  their endpoint-constrained generics (required by
  `kernel.ref.node(...)` typed refs); the `*_WITH_RELATIONS` variants
  carry the `fields` / `entity` schemas for `kernel.related(...)` /
  `kernel.checkRelations(...)`. `kernel.related` was made tolerant of
  legacy entity/field refs (id-then-name fallback) so OpsDesk-shaped
  graphs walk through the schema cleanly. Coverage in
  `tests/entity-kernel-adapter.test.ts`.
- Done 2026-05-15: literal-tightened `.order(...)` return types —
  `hasMany(...).order(field, direction)` preserves the field literal
  and direction literal in the relation witness's `order` field
  (verified in `tests/kernel-relations.test-d.ts`).

### 8. Continue Track E §2 ports

- Done 2026-05-18: legacy bridge fully drained — all remaining 16
  ctx-direct specs ported to domain-owned `src/<domain>/passes.ts`
  modules in one batch (storage ×3, services, ui, editors, crud,
  list, state, scopedResources, targetCompatibility, obligations,
  merge, orchestration, workflow, boundary, offline). Bridge spec
  count: 16 → **0**. `registerBuiltInPasses` now bundles the dialect
  registrars so `createGen(...)` still wires the full check pipeline.
  True graph-IR-native conversion remains follow-up per domain (the
  closure-over-ctx readers stay until graph IR for services/ui/
  editors/cruds/lists/state/cron/workflows/boundary/obligations/
  composable_plans/offline lands).
- Done 2026-05-18: `legalize.offline` relocated from the legacy
  bridge to a new `src/offline/passes.ts` registrar (registered via
  `registerOfflinePasses` in `src/lifecycle/runner.ts`'s
  `dialectPassRegistrations` array). `checkOfflinePlans(envelopes,
queues)` already took its inputs directly, so this is a clean
  relocation (offline command/queue graph IR remains follow-up work).
  Bridge spec count: 17 → 16.
- Done 2026-05-18: `verify-symbols.magicStrings` ported from the legacy
  bridge to `src/core/passes.ts`. `checkMagicStringsOnGraph(graph,
config, entities)` is the new graph-native entry point; the
  `ctx.entities` parameter is preserved (graph dedups by node id, so
  duplicate-stable-ID detection still needs the source array).
  `checkMagicStrings(ctx)` is a thin backwards-compat alias. Bridge
  spec count: 18 → 17.
- Done 2026-05-15: `verify-dialects.config` relocated from
  `src/lifecycle/legacy-check-bridge.ts` to `src/core/passes.ts`
  (bridge spec count: 19 → 18). Pass behavior unchanged (config
  remains a scalar context field, not graph IR).
- Inspect `derive.services` first, then UI/editors/CRUD/list. Use the
  remaining-spec list above as the source of truth.
- Migrate each to graph-native typed payloads/readers. Many remaining
  specs (cron jobs, workflows, boundary plans, scoped resources, UI,
  editors, CRUD, list) require graph IR for their respective domains
  before the legacy ctx-array reads can be retired. These are
  multi-PR ports — each domain's graph IR landing is the prerequisite.
- Remove bridge specs only after the graph-native path is covered,
  `builtInCheckPasses()` count drops, and golden snapshots stay green.

### 9. Target/legalization artifacts (Track F)

- Deepen the eleven derivations from contract artifacts into runtime
  target output.
- Add `defineLoweringSurface` declarations on every target morphism so
  the lowerability matrix grows as targets ship.

---

## Guardrails

Full agent contract: see `AGENTS.md`. Brief recap of the rules most
likely to bite:

- run `vp` directly — not `npx vp`, `npx tsc`, or `pnpm vp`. `vp check`
  bundles format + lint + type-aware checks; do **not** install Vitest /
  Oxlint / tsdown separately;
- run `vp install` after pulling remote changes; `vp check` + `vp test`
  before reporting a slice done;
- consult `docs/typescript_inference_cheatsheet.txt` before shaping
  public builders, namespaces, dialect definitions, or overloads;
- public/end-user APIs must infer without casts, explicit type args, or
  manual narrowing on the normal authoring path;
- prefer final dialect IR; bridge aliases and fallback readers are
  temporary scaffolding only.

Do:

- use Vite+ commands: `vp install`, `vp test`, `vp check`, `vp fmt`;
- use `defineNodeKind` / `defineEdgeKind` / typed witnesses instead of
  raw kind strings in internal code;
- use graph-native readers and dialect-owned passes for new checks;
- update this file when completing a meaningful slice;
- keep `GETTING_STARTED.md` aligned when public DX changes.

Do not:

- add top-level semantic arrays to `GenContext`;
- add new `_bridge*` metadata (PLAN §0.5 #8);
- add new `ctxCheckerToPass` wrappers;
- add module-level checker registration outside the pass pipeline;
- hide semantic relationships in `metadata.custom`;
- introduce raw-string identity in typed APIs (predicate flavor,
  subject kind, surface ID, phase, assurance — all branded witnesses);
- weaken typed authoring APIs for dynamic/plugin ingestion;
- treat marker traits/capabilities as predicates with empty bodies
  (they're edges; PLAN §B3c);
- ship `LoweringSurface` declarations with closed-set result shapes
  (each surface owns its `resultShape`; the matrix is a typed
  projection, not a fixed schema).

---

## Verification

Standard:

```powershell
vp test
vp check
```

Useful focused checks:

```powershell
rg "_bridge\w+" src
rg "ctxCheckerToPass" src
@'
$txt = Get-Content -Raw src\lifecycle\legacy-check-bridge.ts
$body = [regex]::Match($txt, 'builtInCheckPasses = \(\): readonly BuiltInCheckPassSpec\[\] => \[(?<body>[\s\S]*?)\];').Groups['body'].Value
([regex]::Matches($body, 'name:\s*')).Count
'@ | powershell -NoProfile -Command -
# .test-d.ts assertions are exercised by vp check, not vp test.
vp check
vp test tests/kernel-graph-stage.test.ts tests/reactivity-rule-invalidation-pass.test.ts
vp test tests/golden/opsdesk-slice/
```

Expected constraints:

- `_bridge*` should remain absent from `src/`;
- `ctxCheckerToPass` should remain limited to
  `src/lifecycle/legacy-check-bridge.ts` and its architecture tests;
- no new raw-string semantic identity in internal code;
- touched files should be formatted even if full type-aware lint has
  an existing informational baseline.

---

## Snapshot Locks

Locked and important:

- `tests/golden/opsdesk-slice/slice.test.ts` — graph counts,
  diagnostics, exports, R-2/R-6/R-7/R-10 artifacts.
- `tests/golden/opsdesk-slice/slice.test-d.ts` — slice type-level
  assertions.
- `tests/golden/dialect-callable.test.ts`
- `tests/golden/dialect-reactivity.test.ts`
- `tests/golden/dialect-auth.test.ts`
- `tests/golden/lifecycle-bridge.test.ts`

Deferred until Track F: full target snapshots such as `postgres.sql`,
`server.ts`, `react.tsx`, `openapi.json`, `expected.gen2`, and
`explain.txt`.

---

## Last Compaction

2026-05-18 (latest+++): `PassResult` made generic over
`TArtifact extends Artifact`, `TDiagnostic extends Diagnostic`, and
`TPatch extends GraphPatch` with defaults to the current types. Pure
additive seam — every existing caller continues to compile unchanged.
This is the first step toward `runPassPipeline` / `runNamedPipeline`
preserving a typed pipeline witness's artifact/diagnostic/patch
unions through to consumers (PLAN §0.1a — typed pipelines as
programs). Follow-up: have `runPassPipeline<P extends PipelineDef>`
extract the union from `P` so callers see narrowed result types.

2026-05-18 (latest++): morphism dependencies + topo sort. Morphisms
now accept an optional `dependsOn: readonly string[]` of upstream
morphism names; `kernel.topologicalSortMorphisms(morphisms)` returns
a dependency-respecting order plus typed diagnostics for cycles
(`morphism:cyclic-dependency`, error) and unknown deps
(`morphism:unknown-dependency`, warning, edge dropped). Stable: ties
break in declaration order. Pipeline builders can call this before
scheduling so the declared morphism order is honored without
inferring from `from`/`to` overlap. Coverage in
`tests/kernel-morphism.test.ts` (3 cases). Test totals now **1,170**.

2026-05-18 (latest+): morphism run meta facts. `morphism.run()` result
now carries `producedBy` (morphism name) and `matchCount` so callers
can attribute outputs without re-walking the pipeline.
`kernel.morphismRunMetaFacts(result)` derives typed
`RanMorphism` / `ProducedPatch` / `ProducedDiagnostic` /
`ProducedArtifact` / `ProducedExplanation` facts from any morphism
run result — the runtime companion of `morphismMetaFacts` (static).
Coverage in `tests/dialects.test.ts` (2 cases). Test totals now
**1,167** (was 1,165).

2026-05-18 (latest): static morphism meta facts + plugin-dialect
registration diagnostic. Two small landings closing Next Up caveats:

- `kernel.morphismMetaFacts(dialect)` materializes the static
  meta-graph facts implied by a dialect's morphism registrations:
  `Morphism`, `BelongsToDialect`, `ReadsNodeKind` / `ReadsEdgeKind`
  (from pattern), `EmitsNodeKind` / `EmitsEdgeKind` /
  `EmitsArtifactKind` (from `to`), optional `HasSurface`, and
  per-code `DiagnoseCode`. Devtools, `app.preview`, capability
  reports, and the lowerability matrix can query these without
  re-walking morphism internals (PLAN §0.1a/§0.1b). Coverage in
  `tests/dialects.test.ts` (2 cases).
- `kernel.verifyDialectRegistered(registry, dialect)` emits a
  typed `dialect:not-registered` error when a (plugin / dynamic)
  dialect was constructed but not added to the active registry —
  catches the silent-capability-gap class of bug. Static core
  dialects pass cleanly. Coverage in `tests/dialects.test.ts` (3
  cases).

2026-05-18 (later): typed `to` vocabulary preserved on `GraphMorphism`.
`defineMorphism` now returns
`GraphMorphism<Pattern, Nodes, Edges, Artifacts>` so callers see
`morphism.to.nodes` / `.edges` / `.artifacts` as the typed unions the
caller declared (e.g. `readonly ["pg.rls-policy", "tsx.component"]`),
not opaque `string[]`. First incremental step toward broader pipeline
result generic narrowing (PLAN Track A §1a). Type coverage in
`tests/kernel-morphism.test-d.ts` (3 cases: nodes/edges/artifacts).

2026-05-18 (late): legacy bridge fully drained. Final 16 ctx-direct
bridge specs ported to domain-owned `src/<domain>/passes.ts` modules
in a single batch — storage (3 specs: invariants/traits/reversible),
services, ui, editors, crud, list, state, scopedResources, target
compatibility, obligations, merge (planMerge), orchestration (cron),
workflow, boundary, offline. `registerBuiltInPasses` now bundles the
new dialect registrars so the canonical entry point still wires the
full check pipeline. `checkTargetCapabilities` extracted to
`src/core/target-capabilities.ts` (Track E §2 port). Bridge spec
count: 16 → **0**. The legacy `builtInCheckPasses()` array is now
empty (kept as a comment marker for the few cross-domain checks that
remain registered through `registerCorePasses`).

2026-05-18 (mid): production morphism wiring + edge DX + OpsDesk
relation schema groundwork + magicStrings port. Landed:

- `verify-symbols.magicStrings` ported from the legacy bridge to
  `src/core/passes.ts` (graph-native entry point
  `checkMagicStringsOnGraph(graph, config, entities)`; ctx.entities
  preserved because graph dedup masks duplicate-stable-ID detection).
  Bridge spec count: 18 → 17.

- `kernel.attachMorphism(dialect, morphism)` mutator in
  `src/kernel/dialect.ts`. Idempotent (dedups by name), also dedups
  `dialect.surfaces` by surface id. Unblocks "morphisms live in their
  owning dialect" without requiring `dialects/*.ts` to import the pass
  layer.
- `RLS_POLICY_MORPHISM` attached to `AuthDialect` at module load
  (`src/rules/rls-pass.ts`).
- `RULE_INVALIDATION_MORPHISM` attached to `ReactivityDialect` at
  module load (`src/reactivity/passes.ts`); also carries
  `RULE_INVALIDATION_SURFACE` into `ReactivityDialect.surfaces`.
- New test in `tests/dialects.test.ts` verifies both attachments fire
  and dedup correctly.
- `kernel.edge(kind).from((e) => ({...}))` callback form landed in
  `src/kernel/edge.ts`. `e.node(ref)` and `e.with(ref, cardinality)`
  are pass-through helpers that improve autocomplete clarity in
  complex edge constructions without breaking endpoint inference.
- `ENTITY_NODE_KIND_WITH_RELATIONS` / `FIELD_NODE_KIND_WITH_RELATIONS`
  introduced in `src/dialects/domain/entity-field-relation.ts` as
  schema-bearing companions to the bare kinds. Direct augmentation of
  `ENTITY_NODE_KIND` / `FIELD_NODE_KIND` would change their inferred
  generics and break edge-endpoint-constrained ref types in tests,
  so the schemas live alongside.
- `kernel.related(...)` now tolerates legacy entity/field refs whose
  `target.id` is a domain id rather than a kernel node id; matches by
  id then falls back to name (mirrors `GraphPattern`'s lenient
  matching). New entity-kernel-adapter tests exercise the
  `ENTITY_NODE_KIND_WITH_RELATIONS.fields` accessor end-to-end.

Full `vp test` is green (125 files, 1,160 tests, up from 1,157).
Touched files all pass scoped `vp check`.

2026-05-15 (latest+): consolidation slice. Landed since the previous
"latest" entry:

- Auto-derived inverse accessors via `kernel.related(graph, node,
kind, { peers })`. Scans peer kinds' `relationSchema` for entries
  targeting `kind`; synthesizes inverse accessor methods keyed by the
  peer kind id's last dotted segment. Inverse cardinality always
  widens to `readonly Ref[]`.
- Runtime underflow/overflow diagnostics via `kernel.checkRelations`.
- Literal-tightened `.order(...)` return types — `hasMany(...).order(
field, direction)` now preserves the field literal and direction
  literal in the relation witness's `order` field.
- `defineDialect({ morphisms: [...] })` and `Dialect.surfaces`
  auto-derived from `morphisms[*].surface` (deduplicated by surface
  id). Ad-hoc unit tests in `tests/dialects.test.ts`.
- `verify-dialects.config` relocated from
  `src/lifecycle/legacy-check-bridge.ts` to `src/core/passes.ts`
  (bridge spec count: 19 → 18).

Full `vp test` is green (125 files, 1,157 tests). Touched files all
pass scoped `vp check`. Production morphism dialect wiring deferred
due to circular import direction between dialect and pass files.

2026-05-15 (latest): both rule-derivation passes now run as
morphisms. `RULE_INVALIDATION_MORPHISM` ports
`derive.rule.invalidationDependencies` using the new `mapAll`
aggregation form (per-action plan grouping). Both `RLS_POLICY_MORPHISM`
and `RULE_INVALIDATION_MORPHISM` use `defineMorphism(...)` end-to-end;
`.toDerivation()` keeps the existing pass registry / pipeline runner
unchanged. Morphism API grew: `helpers.patch` narrowed by `to`,
`MorphismMapOutput.artifacts`, and `mapAll(matches, helpers)` for
cross-match aggregation. Full `vp test` is green (125 files, 1,148
tests). Touched files (`src/kernel/morphism.ts`,
`src/rules/rls-pass.ts`, `src/reactivity/passes.ts`,
`tests/kernel-morphism.test.ts`) all pass scoped `vp check`. Two
broad-baseline errors remain on `src/reactivity/rule-derived.ts`
unrelated to this slice.

2026-05-15 (later): morphism artifact emission + first production
port. `MorphismMapOutput` gained `artifacts: readonly Artifact[]`;
`run` aggregates them alongside patches/diagnostics/explanations.
`src/rules/rls-pass.ts` ported its `RLS_POLICY_PATTERN.materialize`
loop to `RLS_POLICY_MORPHISM` (`defineMorphism({ phase: "lowering",
from: RLS_POLICY_PATTERN, to: { artifacts: ["pg.rls-policy"] }, map,
diagnostics })`). The `registerRlsPolicyPass` shim now delegates to
`morphism.run(graph)`; existing tests pass unchanged. Active
direction: port `derive.rule.invalidationDependencies` once a
`reduce`/`mapAll` aggregation form is added to morphisms (per-action
plan grouping doesn't fit the current per-match `map`).

2026-05-15: initial `GraphMorphism` and rule-invalidation pattern
back-port landed. `src/kernel/morphism.ts` adds `defineMorphism(...)`
with phases derivation/lowering/import/emission, `from: GraphPattern`,
typed `to: { nodes?, edges?, artifacts? }`, per-match `map(match,
helpers)` callbacks, and a `.toDerivation()` compile path that hooks
into the existing pipeline runner. `src/reactivity/rule-derived.ts`
now uses `RULE_INVALIDATION_SOURCE_PATTERN` for source matching
(Action ─[writes]→ Field ←[reads]─ Rule), replacing the nested
`actionOverlapsRuleOnGraph` loop; dead helpers
(`actionOverlapsRuleOnGraph`, `ruleReadFieldsFromGraph`) deleted. Full
`vp test` is green (125 files, 1,144 tests, up from 1,139). New
files (`src/kernel/morphism.ts`, `tests/kernel-morphism.test.ts`) and
the touched `src/reactivity/rule-derived.ts` are scoped-`vp check`
clean except for 2 pre-existing baseline errors (`anyKey(family)`
and `mutation: graphAction`).

2026-05-15: runtime `.related.X()` accessors landed.
`src/kernel/relation-accessors.ts` exports
`related(graph, node, kindWithRelations)`, returning a typed
accessors object whose method names mirror `kind.relationSchema` and
whose return types are bounded by cardinality (`KernelNodeRef`,
`Ref | undefined`, plain readonly array, or non-empty tuple). Runtime
walks `edgesOfKindDef(graph, relation.via)`, identifies the source
endpoint by matching the source node id, and returns refs to the
other-side endpoint. Explicit `endpoint` keys on the relation are
honored; binary edges resolve target by elimination. Runtime + type
coverage in `tests/kernel-relation-accessors.{test,test-d}.ts`. Full
`vp test` is green (124 files, 1,139 tests, up from 1,134). All
touched files pass scoped `vp check` (formatted, no lint/type
errors). Active direction: OpsDesk slice adoption, then
auto-derived inverse accessors and runtime underflow diagnostics
for required relations.

2026-05-15: `defineNodeKind(...).relations({...})` integration landed.
`src/kernel/ods.ts` now returns a `NodeKindBuilder` from
`defineNodeKind`, exposing a fluent `.relations(schema)` step that
returns a `NodeKindDefWithRelations<Id, Inputs, Outputs, Traits,
Custom, Schema>` carrying the schema under `relationSchema`. The bare
`NodeKindDef` shape is unchanged for the 58+ existing callsites that
don't opt into relations. Schema entries must be `RelationWitness`-
shaped (constrained to `{ kind: "relation" }` at the type level).
Runtime + type coverage in `tests/kernel-relations.{test,test-d}.ts`.
Full `vp test` is green (123 files, 1,134 tests, up from 1,132).
Active direction now: runtime `node.related.X()` accessors with
cardinality-bounded return types, then auto-derived inverse accessors,
then OpsDesk slice adoption.

2026-05-15: initial `GraphPattern` / `GraphMatch` implementation
landed. `src/kernel/pattern.ts` exports `defineGraphPattern(...)` with
named node, edge, and expression bindings, `sameNode` constraints, and
`materialize` / `first` / `count` / `stream` match modes. Matching uses
existing graph indexes for node and edge-kind lookup and endpoint-index
lookup where bound refs line up; it also joins legacy refs by name so it
works with current bridge-retired but still mixed ref shapes. The
rule→RLS pass now declares `RLS_POLICY_PATTERN` and uses it to match
`Policy -> Entity`, `Policy -> Rule`, and `Rule -> BodyExpr`; SQL
artifact generation is unchanged. Added runtime/type coverage in
`tests/kernel-pattern.*`, and existing `tests/rule-rls-pass.test.ts`
proves the pattern-backed RLS path still emits artifacts and diagnostics.
Focused checks pass for `src/kernel/pattern.ts`,
`src/rules/rls-pass.ts`, and the new pattern tests. Full `vp test` is
green (123 files, 1,132 tests).

2026-05-15: first real Surface registration landed. `GraphDerivation`
now carries an optional `surface` witness and the builder has
`.surface(...)`. `src/reactivity/passes.ts` exports
`RULE_INVALIDATION_SURFACE`, a derivation surface for
`surface.rule.invalidationDependencies`, and attaches it to
`derive.rule.invalidationDependencies`. The surface consumes
`ACTION_WRITES_FIELD_EDGE_KIND`, `RULE_READS_EDGE_KIND`,
`POLICY_USES_RULE_EDGE_KIND`, and `QUERY_READS_EDGE_KIND`; yields
`INVALIDATES_KEY_EDGE_KIND`; and has a typed result shape for the
derived invalidation diagnostic/patch contract. Runtime coverage was
added to `tests/reactivity-rule-invalidation-pass.test.ts`. Focused
runtime test passes. `vp check src/kernel/derivation.ts` passes; scoped
check including `src/reactivity/passes.ts` still hits the existing
`ACTION_NODE_KIND.id`/`never` type baseline in that file. Full
`vp test` is green (122 files, 1,131 tests).

2026-05-15: Predicate IR + Surface kernel beachhead landed
additively. `src/kernel/predicate.ts` now exposes branded
`PredicateFlavor`, `SubjectKind`, open `AssuranceKind`,
`defineAssuranceKind(...)`, `assuranceAtLeast(...)`,
`predicateFlavor`, `subjectKind`, `assuranceKind`, and canonical
`definePredicate(...)`. `src/kernel/surface.ts` now exposes
`defineSurfaceId(...)`, `defineLoweringSurface`,
`defineDerivationSurface`, and `defineEmitSurface` with both object
form and curried `.id(...).consumes(...).yields(...).resultShape(...)
.done()` form. These are exported through `kernel`. Existing
trait/law/rule consumers are not migrated yet, and no real rule surface
is registered yet. Added runtime and `.test-d.ts` coverage in
`tests/kernel-predicate-surface.*`. Focused `vp check` on the new files
passes. Full `vp test` is green (122 files, 1,130 tests).

2026-05-15: dialect-owned ID/ref factories now use the PLAN target
name. `Dialect.id` is the namespace-bound factory
(`.node/.edge/.nodeRef/.edgeRef/.parse.*`), while symbolic registry
identity moved to `Dialect.dialectId`. `DialectRegistry` indexes
`dialect.dialectId`; dialect golden tests and plugin dialect tests were
updated to use the new identity field. Focused dialect/plugin/golden
tests pass, and full `vp test` is green (121 files, 1,127 tests).
`vp check` gets past formatting but still hits the known broad
type/lint baseline across migration files.

2026-05-15: standalone `RelationWitness` primitives landed in
`src/kernel/relations.ts` with `hasOne` / `hasZeroOrOne` /
`hasMany` / `hasRange` / `belongsTo` factories. Cardinality,
target/via, endpoint, and required-ness inference are typed via
`$infer`. Integration with `defineNodeKind(...).relations({...})` is
follow-up work — the witnesses are usable on their own to declare
relation schemas. Full `vp test` is green (121 files, 1,127 tests,
up from 1,117).

2026-05-15 (earlier): dialect-owned ID/ref factories landed as an
initial implementation. `NamespaceIdFactory` gained `nodeRef`/`edgeRef` (and
parse counterparts); `defineDialect` accepts an optional `namespace`
literal and originally auto-wired `Dialect.factory` via
`id.createFactory` (renamed to `Dialect.id` in the latest entry),
falling back to the constructor `id.value` suffix when omitted. All 15 core
dialects now declare an explicit `namespace` literal (`auth`,
`callable`, the `core.*` family, `domain.entityFieldRelation`,
`postgres`, `reactivity`, `target`, `ui`). `KernelEdgeRef` moved to
`src/kernel/id.ts` so the factory can produce branded refs without a
circular dep. Full `vp test` is green (120 files, 1,117 tests, up
from 1,115). `vp check` baseline is unchanged for kernel/dialect
touched files (single pre-existing `Explanation` re-export ambiguity
in `src/kernel/index.ts`).

Remaining legacy bridge specs: 19. Current active direction: back-port
`derive.rule.invalidationDependencies` to the `GraphPattern` source
shape → GraphMorphism → relation accessors → broaden typed pipeline
result generics when graph stages become generic → remaining Track E §2
ports → Track F target artifacts.

Prior compaction (2026-05-14): initial `kernel.edge(kind)` builder
landed after the branded `nodeRef` / `ref.*` work; branded graph patch
IDs landed next. `definePipeline(...)` typed witnesses landed after
that, including the public `gen.preview.pipeline(...)` wrapper.
Production `src/` no longer calls `nodeRef.unsafe(...)` directly
outside the `ref.unsafe` implementation.
