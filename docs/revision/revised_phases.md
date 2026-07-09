# Revised Phases: Rebasing Gen2 on the New Kernel

> Status: replaces the older Phase 5 / Phase 6 implementation plans as the sequencing source of truth. Those plans remain useful as source material, but their implementation strategy is superseded by the revised kernel.

## Executive summary

Gen2 should move forward by rebasing the library on a new semantic graph kernel rather than continuing the old incremental unification plan.

The old phase plans were directionally right about type-safe composition, operation/law awareness, node unification, checker/emitter unification, dispatch, stored values, combiners, entity views, and better target infrastructure. However, they were designed as additive refactors over the current `GenContext` model. The new direction is stronger:

```txt
Everything semantic is represented in one graph.
Everything internal uses typed symbols / refs, not magic strings.
Operation definitions are nodes.
Operation facts are traits and edges.
Laws are typed traits on operation nodes, transforms, expressions, or edges.
Generic behavior is exposed through Protocols.
Modules become Dialects.
Check/generate become Pass pipelines.
Targets consume legalized target dialect IR, not high-level source IR directly.
```

The hard kernel becomes:

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

Operations are not a separate primitive family. An operation definition is a node; its inputs, outputs, patches, inverses, lowerings, and uses are edges; its properties and laws are traits; operation behavior for generic passes is exposed through protocols.

## Migration stance

This is a rebasing plan, not a backward-compatible internal overlay.

Temporary shims may exist on the migration branch, but the final architecture must not preserve the old parallel registry model.

Final-state prohibitions:

```txt
No permanent top-level semantic arrays on GenContext.
No raw string trait/kind/edge/protocol checks for internal semantics.
No module-level checker registry separate from Pass pipelines.
No target emitter consuming old high-level module IR directly.
No metadata used to control compiler behavior.
No separate Operation/Law/Checker/Emitter primitive families competing with Node/Edge/Trait/Pass.
```

The public builder API may remain ergonomic, but it must compile into graph IR:

```txt
gen.entity(...)
gen.rule(...)
gen.action(...)
gen.relation(...)
gen.view(...)
gen.provider(...)
```

These are dialect frontends, not independent sources of truth.

---

# How to interpret the older phases

## Phase 5: what survives

The Phase 5 guide focused on type-safe composition, node unification, and inference integrity. Most of its goals survive, but the implementation route changes.

### Keep the intent

Keep these ideas:

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

### Replace the mechanism

Old mechanism:

```txt
Adapters project existing canonical objects into StaticNode.
GenContext keeps old arrays.
Checkers continue over old module collections.
Traits/laws/capabilities remain distinct structures with loose relationships.
```

New mechanism:

```txt
Canonical objects are graph nodes/edges from the start.
GenContext owns a Graph, not many semantic arrays.
Checkers become Passes owned by Dialects.
Traits/laws/capabilities are typed symbols and trait applications.
Protocols expose generic behavior to passes.
Operations are operation-definition nodes.
```

## Phase 6: what survives

The Phase 6 guide focused on checker registry, target emitter framework, entity view unification, plugin registration, graph integration, and documentation.

### Keep the intent

Keep these ideas:

```txt
lifecycle checks need dependency ordering
emitters need dependency ordering and caching
forms/editors/lists/CRUD should unify
plugins should register semantic extensions
intermediate graphs should be cached and reused
documentation needs to reflect the actual architecture
```

### Replace the mechanism

Old mechanism:

```txt
Checker<T> registry
ArtifactEmitter<Input, Artifact> registry
EntityView added beside old forms/editors/lists/cruds arrays
old arrays remain populated for backward compatibility
```

New mechanism:

```txt
Pass pipelines replace checker/emitter registries.
Emitters are emit-phase passes.
EntityView is a UI dialect node kind, not a new top-level primitive.
Old arrays may exist only during migration branch; they are removed before merge.
Plugins register Dialects, Passes, Symbols, Traits, Protocols, NodeKinds, EdgeKinds, and Lowerings.
```

---

# Revised phase plan

## R0 — Architecture freeze and migration branch

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
No new public primitive family unless it can be expressed as Node, Edge, Type, Expr, Transform, Trait, Protocol, or Pass.
```

Required setup:

1. Add a short `docs/revised-kernel.md` or equivalent architecture note.
2. Add golden tests for existing important behavior: entity, relation, type, operation, rule, query, action, auth policy, reactivity, storage location, provider satisfaction, UI derivation, and target output.
3. Add grep-style architecture tests or lint rules for forbidden new patterns.
4. Continue using `vp check` and `vp test` as the validation commands.

Exit criteria:

```txt
Migration branch exists.
Old phase plans are marked superseded by revised_phases.md.
Golden behavior tests exist before deep rewrites begin.
Architecture guardrails are documented.
```

---

## R1 — Hard kernel

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
```

The first graph APIs should be symbol-first:

```txt
graph.nodesOfKind(EntityNodeKind)
graph.nodesWithTrait(NodeCallable)
graph.edgesOfKind(WritesEdgeKind)
graph.edgesFrom(action.ref, AppliesOperationEdgeKind)
graph.edgesTo(field.ref, WritesEdgeKind)
graph.supportsProtocol(node, WritableProtocol)
```

Do not expose string-first variants except for debug/textual IR.

Exit criteria:

```txt
Kernel builds without depending on old entity/relation/function/ui/auth modules.
Graph can register types, exprs, nodes, edges, traits, protocols, dialects, passes, diagnostics, artifacts.
No magic-string API is required for internal semantic graph queries.
```

---

## R2 — Core dialects

Create the core dialects that many higher dialects depend on.

Recommended structure:

```txt
src/dialects/core/ref
src/dialects/core/placement
src/dialects/core/context
src/dialects/core/requirement
src/dialects/core/provider
src/dialects/core/ownership
src/dialects/core/claim
src/dialects/core/provenance
src/dialects/core/capability
```

### Ref dialect

Current refs are a strong foundation. Preserve the idea of typed stable IDs and refs for entities, fields, relations, functions, rules, policies, keys, contexts, services, providers, routes, workflows, and migrations.

Revised guidance:

```txt
Refs are hard kernel / core dialect boundary objects.
Names may change; stable IDs should not.
Diagnostics, graph edges, artifacts, and agent edits point through refs.
```

### Placement dialect

Current `StorageLocation` becomes placement graph IR.

Represent locations as nodes:

```txt
StorageLocationNodeKind
```

Represent placement facts as edges:

```txt
PlacedInEdgeKind
SourcedFromEdgeKind
CrossesBoundaryEdgeKind
HydratesThroughEdgeKind
```

Represent storage/location properties as traits/capabilities:

```txt
LocationPersistent
LocationEphemeral
LocationSensitiveSafe
LocationClientReadable
LocationClientWritable
LocationServerReadable
LocationServerWritable
```

### Context / requirement / provider dialects

Current context and provider concepts become graph IR:

```txt
ContextNodeKind
RequirementNodeKind
ProviderNodeKind
ServiceNodeKind
```

Edges:

```txt
RequiresEdgeKind
ProvidesEdgeKind
DependsOnProviderEdgeKind
PlacedInEdgeKind
SourcedFromEdgeKind
ProjectsToClientEdgeKind
```

Provider safety checks become passes over graph edges and traits.

### Ownership dialect

Ownership is not one primitive. It is a family of edge kinds and analyses.

Examples:

```txt
OwnsEdgeKind
OwnsFieldEdgeKind
ContainsEdgeKind
GeneratedFromEdgeKind
ResponsibleForEdgeKind
BelongsToTenantEdgeKind
```

### Claim substrate

Claims are typed asserted facts used by auth and policy dialects.

Core claim nodes/edges:

```txt
ClaimNodeKind
ClaimSubjectEdgeKind
ClaimPredicateEdgeKind
ClaimSourceEdgeKind
ClaimEvidenceEdgeKind
```

Traits:

```txt
ClaimAuthoritative
ClaimClientSafe
ClaimServerOnly
ClaimDerived
```

Exit criteria:

```txt
Placement/context/provider/ownership/claim facts can be represented as graph nodes and edges.
Existing safety concepts can be expressed without special-purpose top-level arrays.
```

---

## R3 — Types, operations, and laws

This is the most important semantic phase.

The revised type and operation model must make it possible to ask:

```txt
What operations can happen to this type?
What properties do those operations have?
Which operation did this action apply?
What fields/types did it read or write?
Can the operation be patched, inverted, replayed, merged, lowered, or incrementally maintained?
```

### Type model

Evolve semantic types toward:

```txt
GType<Decoded, Encoded, DecodeR, EncodeR, Traits>
```

Keep the current meaning of semantic types, but make decoded/encoded/requirements explicit so Effect Schema and wire/storage transforms fit cleanly.

### Operation model

Operation definitions are nodes:

```txt
OperationDefNodeKind
```

Operation uses are expressions or node-local facts that point to an operation definition.

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

Laws are traits on operation nodes, transforms, expressions, and sometimes edges:

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

Some laws are marker traits; others need witnesses:

```txt
LawInverse -> inverse operation ref
LawIdentity -> identity expression ref
LawAssociative -> assurance metadata / test artifact / proof artifact
```

### Protocols for operations

Protocols expose behavior to passes:

```txt
OperationProtocol
PatchProtocol
DeltaProtocol
ReducerProtocol
PredicateAffectProtocol
LoweringProtocol
```

Trait vs Protocol rule:

```txt
Trait: this operation is patchable.
Protocol: here is how to produce/apply/invert the patch.
```

Exit criteria:

```txt
Operations are represented as graph nodes.
Operation facts are graph edges.
Laws are typed traits.
Operation uses in expressions/actions reference operation nodes.
CRUD, optimistic, offline, merge, and IVM planning can query operation facts from the graph.
```

---

## R4 — Expression and rule dialects

Migrate expression and rule logic to the new operation-aware graph model.

Goals:

```txt
Expr operation calls reference OperationDef nodes.
Rules are pure predicate nodes or predicate expr nodes.
Rule dependencies derive read edges.
Opaque JS is explicit through traits and diagnostics.
SQL/client/server lowerability is trait/protocol-based.
```

Key node/edge kinds:

```txt
RuleNodeKind
PredicateNodeKind
ExpressionNodeKind
ExprUsesOperationEdgeKind
RuleReadsEdgeKind
RuleGuardsEdgeKind
```

Important traits:

```txt
ExprPure
ExprOpaqueJs
ExprPortable
ExprSqlLowerable
ExprClientSafe
ExprServerOnly
RulePure
RulePolicyCandidate
```

Old `RuleExpr` does not need to survive as a separate conceptual system. If the public API remains, it should lower into the canonical expr/predicate IR.

Exit criteria:

```txt
Existing rule behavior is expressible through operation-aware Expr/Predicate IR.
Rule dependencies are edges.
Rules can be checked for placement/lowerability through traits and protocols.
```

---

## R5 — Domain dialect: entities, fields, relations

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

Cardinality, integrity, foreign-key behavior, and deletion behavior should be typed traits/edge payloads, not hardcoded relation-only fields.

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

Existing `gen.relation(...)` remains useful as a frontend, but it emits edge/node IR.

Exit criteria:

```txt
Entities and fields are graph nodes.
Field ownership is an edge.
Field type is an edge.
Domain relation is an edge or relation node + endpoint edges.
Existing relation invariants are rewritten as dialect verification passes.
```

---

## R6 — Callable, action, query, dispatch, workflow

Migrate behavior objects into callable/operation graph IR.

Node kinds:

```txt
QueryNodeKind
ActionNodeKind
PatchNodeKind
PlanNodeKind
DispatchNodeKind
WorkflowNodeKind
```

Protocols:

```txt
CallableProtocol
ReadableProtocol
WritableProtocol
EffectProtocol
PlanProtocol
DispatchProtocol
WorkflowProtocol
```

Edges:

```txt
ActionAppliesOperationEdgeKind
QueryReadsEdgeKind
ActionWritesEdgeKind
DispatchTriggersEdgeKind
DispatchHandlesEdgeKind
WorkflowContainsStepEdgeKind
PlanChainsToEdgeKind
PlanFallbackEdgeKind
```

Old Phase 5 milestones map this way:

```txt
Function/resource adapters -> no longer adapters; these are node kinds.
Type-safe plan chain -> PlanProtocol + pass verification + phantom inference.
Requirement/effect bubbling -> traits/protocols + type-level mirrors + graph passes.
Dispatch unification -> DispatchNodeKind and trigger/handler edges.
Workflow steps -> workflow regions or plan-node edges.
```

Exit criteria:

```txt
Query/action/plan/workflow/dispatch are graph nodes.
Read/write/apply relationships are graph edges.
Requirements/effects bubble at type level and runtime graph level.
```

---

## R7 — Reactivity, optimistic, offline, IVM

Reactivity should no longer rely on ad hoc invalidation lists first. It should derive from operation, read, write, key, and rule edges.

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
```

Edges:

```txt
DerivesKeyEdgeKind
InvalidatesKeyEdgeKind
PatchesResourceEdgeKind
ProducesDeltaEdgeKind
MaintainsViewEdgeKind
UsesCombinerEdgeKind
```

Old concepts:

```txt
StoredValue -> node kind in placement/state dialect.
Combiner -> operation-definition node with reducer/combiner traits and laws.
MergeStrategy -> operation/protocol over patch/delta values.
MonoidOp -> operation node with associative + identity traits.
```

Exit criteria:

```txt
Optimistic planning derives from operation patchability/invertibility/client-safety.
Offline planning derives from idempotency/retry/replay traits and key/idempotency edges.
IVM planning derives from read/write/delta/reducer/predicate-affect protocols.
Fallbacks are explicit and diagnostic-producing.
```

---

## R8 — Auth, policy, claims, placement

Auth should build on claims, rules, context, provider, operation, and placement dialects.

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

The placement dialect handles whether a policy/rule/claim can safely be exposed to the client.

Exit criteria:

```txt
Policies are graph nodes.
Claims are nodes/predicates.
Auth conditions lower to claim/rule/expr graph IR.
Client hints are explicit non-authoritative edges.
Server enforcement is explicit and checked.
```

---

## R9 — UI dialect and EntityView

Forms, editors, lists, and CRUD become UI dialect nodes/edges.

Node kinds:

```txt
EntityViewNodeKind
FormViewNodeKind, optional if mode-specific node is useful
EditorViewNodeKind, optional
ListViewNodeKind, optional
CrudViewNodeKind, optional
ComponentNodeKind
ControlNodeKind
```

Edges:

```txt
ViewDisplaysFieldEdgeKind
ViewEditsFieldEdgeKind
ViewSubmitsActionEdgeKind
ViewUsesQueryEdgeKind
ViewEnabledWhenRuleEdgeKind
ViewHiddenWhenRuleEdgeKind
ViewUsesDesignSystemEdgeKind
```

CRUD should be generated from operation availability:

```txt
Entity owns fields.
Fields have types.
Types support operations.
Operations have patch/inverse/lowerability traits.
Policies guard operations.
Storage target can lower operations.
=> derive create/read/update/delete actions, views, forms, validation, optimistic plans, and tests.
```

Old Phase 6 EntityView intent survives. The old strategy of keeping old arrays in final state does not.

Exit criteria:

```txt
Form/editor/list/CRUD are views over EntityView graph IR.
CRUD generation uses operation/type/policy/storage facts.
UI enablement/visibility comes from rule/policy edges.
No permanent ctx.forms/editors/lists/cruds arrays remain.
```

---

## R10 — Pass pipelines, canonicalization, legalization

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
gen2-react or gen2-solid
gen2-openapi
gen2-docs
gen2-tests
gen2-devtools
```

Old Phase 6 Checker/ArtifactEmitter intent maps to:

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
action -> server.mutation -> effect/node/http target IR -> artifact
entity view -> ui.view_model -> react.component -> tsx artifact
```

Exit criteria:

```txt
lifecycle.check runs pass pipeline.
lifecycle.generate runs check + target pipeline.
No moduleCheckers array remains.
Emitters are passes.
Targets reject non-legalized input with diagnostics.
```

---

## R11 — Plugin/dialect API

Plugins should register dialect contributions, not ad hoc helper blobs only.

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
Plugins may not mutate global registries outside the provided PluginContext.
Plugins must use typed symbols and refs.
```

Exit criteria:

```txt
A plugin can define a node kind, edge kind, trait, protocol, verifier pass, lowering pass, and target emission pass.
Plugin contributions are type-safe and graph-visible.
Duplicate symbols produce diagnostics.
```

---

## R12 — Target dialects and Effect interop

Effect interop should be first-class but not core-owned.

Effect target/dialect maps:

```txt
GType <-> Effect Schema adapter
Requirement/Provider/Service -> Effect Context.Service / Layer
Action/Workflow -> Effect runtime program
Errors/Cause/Exit -> optional target mapping
```

Postgres target maps:

```txt
storage.record -> table
field -> column
domain relation -> foreign key / join table
rule expr -> sql predicate
policy -> RLS policy
operation lowering -> SQL expression/update/trigger
```

React/Solid target maps:

```txt
EntityView -> component model
Action -> mutation hook / server function
Query -> resource/query hook
Rule -> disabled/hidden state where client-safe
```

Target capability nodes should carry traits:

```txt
CapabilitySql
CapabilityRls
CapabilityTransactions
CapabilityJsonb
CapabilityReactComponents
CapabilityEffectRuntime
```

Exit criteria:

```txt
Targets declare capabilities as typed traits.
Lowering passes check required operation/type/rule traits and target capabilities.
Effect interop is an adapter/dialect, not a hard kernel dependency.
```

---

## R13 — Delete legacy architecture

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

This does not necessarily mean deleting public builders. It means deleting permanent non-graph semantic storage.

Final `GenContext` should look more like:

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

## R14 — Documentation and agent workflow

Update documentation around the new mental model.

Required docs:

```txt
docs/revised-kernel.md
docs/dialects.md
docs/operations-and-laws.md
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
Agents must use vp check and vp test.
Agents should add graph diagnostics and source locations for generated behavior.
```

Exit criteria:

```txt
Docs explain the new kernel, dialects, operations, traits, protocols, passes, and migration rules.
Old phase docs are marked historical.
Agent instructions point to revised_phases.md and revised-kernel docs.
```

---

# Mapping old milestones to revised phases

| Old milestone                             | Revised destination                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| Phase 5 TYPE1 Namespace integrity         | Keep; becomes public builder/runtime shape tests during R4/R13.                          |
| Phase 5 TYPE2 Trait architecture          | Keep; rewritten as typed `TraitDef` + trait applications in R1/R3.                       |
| Phase 5 TYPE3 Canonical node adapter      | Superseded; objects are nodes directly. Temporary adapters only during branch migration. |
| Phase 5 TYPE4 Function/resource adapters  | Superseded by callable/reactivity dialect node kinds.                                    |
| Phase 5 TYPE5 Plan chain compatibility    | Keep; implemented through PlanProtocol, type helpers, and pass verification in R6.       |
| Phase 5 TYPE6 Requirement/effect bubbling | Keep; implemented across Node/Expr/Operation/Plan types and graph passes in R6/R10.      |
| Phase 5 TYPE7 Rule predicate lowering     | Keep; rebase on operation-aware Expr/Predicate IR in R4.                                 |
| Phase 5 TYPE8 Law-aware gates             | Keep; laws become typed traits on operation nodes/transforms/edges in R3/R7.             |
| Phase 5 TYPE9 Optional typed registry     | Keep; optional typed registry over Graph handles, not old GenContext arrays.             |
| Phase 5 TYPE10 Cast reduction             | Keep; becomes public builder inference audit after R4/R13.                               |
| Phase 5 TYPE11 Target fixtures            | Replace with target dialect regression suites in R12.                                    |
| Phase 5 TYPE12 Dispatch unification       | Keep; `DispatchNodeKind` + trigger/handler edges in R6.                                  |
| Phase 5 TYPE13 Callable base interface    | Rename/rebase as `CallableProtocol` in R6.                                               |
| Phase 5 TYPE14 Workflow steps             | Keep; workflow nodes with plan edges or regions in R6.                                   |
| Phase 5 TYPE15 StoredValue                | Keep; node kind in placement/state dialect in R7.                                        |
| Phase 5 TYPE16 Combiner                   | Keep; operation-definition node with reducer/combiner traits/laws in R3/R7.              |
| Phase 5 TYPE17 Execution footprint        | Keep; effect/capability traits and operation effect edges in R3/R6.                      |
| Phase 6 TYPE1 Checker registry            | Superseded by Pass pipelines in R10.                                                     |
| Phase 6 TYPE2 ArtifactEmitter framework   | Superseded by emit-phase Passes in R10/R12.                                              |
| Phase 6 TYPE3 EntityView                  | Keep; UI dialect node in R9.                                                             |
| Phase 6 TYPE4 Plugin checker/emitter APIs | Superseded by Dialect/Pass plugin registration in R11.                                   |
| Phase 6 TYPE5 Graph integration/caching   | Keep; Graph is hard kernel and pass cache is built into R1/R10.                          |
| Phase 6 TYPE6 Backward compatibility docs | Rewrite as migration docs; old arrays are not final-state compatibility.                 |

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
```

---

# Required architecture tests

Add tests or static checks for these constraints:

```txt
No internal graph query API accepts a raw string kind/trait/edge name.
No new top-level semantic arrays are added to GenContext.
No target emitter imports old domain/callable/auth modules directly for emission.
All target emission passes consume legalized target dialect objects.
All node/edge/trait/protocol definitions have typed stable IDs.
All generated artifacts have provenance/source locations.
Operations used by optimistic/IVM/CRUD tests are operation-definition nodes.
Laws used by planning are traits with assurance/witness payloads where needed.
```

---

# Success definition

The rebased Gen2 is successful when:

```txt
A user defines domain facts once through ergonomic builders.
Builders emit typed graph IR.
The graph contains nodes, edges, types, expressions, operations, traits, protocols, and locations.
Passes derive rules, CRUD, optimistic plans, invalidation, IVM, target IR, tests, docs, and artifacts from the graph.
Targets consume legalized target dialects.
Agents can inspect, explain, modify, and diff semantic graph facts.
No magic strings are needed for internal semantic identity.
TypeScript inference bubbles requirements/effects/traits upward and flows context downward.
Runtime diagnostics explain what TypeScript cannot prove.
```

Compact mental model:

```txt
Types define value domains.
Operations define what can happen to those domains.
Traits define semantic claims and laws.
Protocols define what passes can ask objects to reveal or do.
Nodes define semantic objects.
Edges define semantic facts between objects.
Dialects package related graph concepts.
Passes verify, derive, canonicalize, legalize, lower, and emit.
Targets are interpretations of legalized IR.
```
