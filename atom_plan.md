# Gen2 Atom Plan

> A living, iterative roadmap for the `gen2` domain compiler. This plan synthesizes the current codebase state, existing improvement backlogs (`ISSUES.md`, `TYPE_IMPROVEMENT_PLAN.md`), the Allium spec review (`spec/REVIEW.md`), and the architectural explorations in `spec/atom.txt` into a single prioritized execution path.
>
> **Last updated**: 2026-04-29 after comparing `spec/atom.txt` against the current implementation.

---

## 0. Guiding Principles (from `spec/atom.txt`)

1. **Data-first, static IR**: All domain behavior must be representable as static data. No opaque JS closures in portable definitions.
2. **Type inference is a feature**: The API should infer as much as possible. Phantom types on `SemanticType`, `Field`, `Expr`, `QueryBuilder` are not optional — they are the product.
3. **Composability over configuration**: Pipeable APIs, module composition, and layered interpretation beat giant config objects.
4. **Source of truth**: `gen.func.query` and `gen.func.action` remain canonical. Reactivity, routing, UI, and IVM are interpretation layers.
5. **Target agnostic**: Core remains generic. Effect-TS, React, Vue, Svelte, Solid are targets, not dependencies.
6. **Derived over manual**: Infer invalidation, optimistic patches, and IVM deltas where possible. Manual annotations are refinements.
7. **Progressive enhancement**: Every generated feature declares baseline, enhanced, fallback, and unsupported behavior.
8. **Capability-driven**: Targets declare capabilities. Generators pick the best plan. Diagnostics report degradation choices.

---

## 0.1 Next Implementation Milestones

This section is the execution queue. Later sections preserve the full design backlog and architectural rationale.

### R1 — Static Key Model and `gen.key.*`

Build the portable key model before any runtime target.

**Scope**:

- Add `src/reactivity/` module exports.
- Add `ReactiveKey`, `ReactiveKeyPattern`, and `KeyFamily`.
- Add `gen.key.family`, `gen.key.entity`, `gen.key.collection`, `gen.key.custom`.
- Add `.any()` and `.match(partial)` semantics.
- Add type-level inference helpers and negative type tests.

**Done when**:

- Key constructors produce static inspectable records.
- Key family payload types are preserved.
- Invalid key payloads fail in `.test-d.ts` tests.
- `vp check` and `vp test` pass.

### R2 — Query and Action Reactivity Metadata

Attach portable reactivity metadata to existing function IR.

**Scope**:

- Add query key metadata to `QueryFunction` and `defineQueryFunction`.
- Add `reactivity` metadata to `ActionFunction` and `defineActionFunction`.
- Implement the legacy `invalidates: QueryFunction[]` lowering/deprecation behavior from section `0.7`.
- Add invariants for key and invalidation expression output types.

**Done when**:

- Query functions can declare typed key expressions.
- Action functions can declare typed invalidation plans.
- Existing `invalidates: QueryFunction[]` use either lowers to query keys or emits a clear diagnostic.
- Existing tests still pass or are intentionally migrated.
- Diagnostics catch invalid reactivity metadata.

### R3 — Reactive Resource and Mutation IR

Add target-agnostic wrappers over query/action functions.

**Scope**:

- Add `ResourceState`, `ReactiveResource`, `ReactiveMutation`, `InvalidationPlan`, `RefreshPlan`.
- Add `gen.reactivity.resource`, `gen.reactivity.mutation`, and `gen.reactivity.registry`.
- Add inference helpers for resource input/output/error/state and mutation input/output/error.

**Done when**:

- Query resources and action mutations are discoverable static records.
- Resource/mutation inference works in type tests.
- Lifecycle checks can validate resource/mutation definitions.

### R4 — Reactive Graph Derivation

Derive the application dataflow graph from registered static IR.

**Scope**:

- Add `ReactiveGraph` / `ApplicationDataflowGraph` artifact shape.
- Derive nodes for funcs, keys, resources, mutations, routes, forms, UI, services, stores, and boundaries.
- Derive read/write/invalidate/patch/require edges from existing IR.
- Add JSON graph artifact output.

**Done when**:

- A small CRUD domain produces a deterministic graph snapshot.
- The graph can answer stale-after-mutation and affected-resource queries.
- Graph derivation does not require a runtime target.

### T1 — First Reactive Target

Implement the first target after the portable IR is stable.

**Scope**:

- Choose `@gen/effect-atom` or TanStack Query as the first target.
- Generate query resources, mutation resources, invalidation, and resource state mapping.
- Add snapshot tests for generated artifacts.

**Done when**:

- At least one full query/action/resource/mutation example generates usable target code.
- Target diagnostics explain unsupported graph features.

### ROUTE1 — Typed Routes Before SingleFlight

Routes need to be first-class static values before loader bundling.

**Scope**:

- Add typed route params/query/hash schemas.
- Connect route loaders to query functions/resources.
- Add typed navigation metadata and route error boundaries.

**Done when**:

- Route loader dependencies appear in the reactive graph.
- Route parameter mismatches produce diagnostics.

### SF1 — SingleFlight Plans

Use route loader dependencies and invalidation edges to bundle refreshes.

**Scope**:

- Add `SingleFlightPlan`, `LoaderBundle`, and `MutationRefreshPlan`.
- Derive affected loaders after a mutation.
- Generate mutation result + refreshed loader payload plans.

**Done when**:

- A mutation invalidating a route loader key produces an affected-loader bundle.
- Fallback behavior is represented as static plan data.

### RULE1 — Rule Core and Planner

Rules become useful once they produce dependency and placement information.

**Scope**:

- Add typed rule AST primitives.
- Add dependency extraction.
- Add evaluation planner classifications for database, server, client hint, materialized/IVM, and external placements.

**Done when**:

- A policy rule reports dependencies and valid placements.
- Unsafe placement produces an actionable diagnostic.

---

## 0.2 Dependency Order

Use this order when choosing work. Items on the right should not be implemented before their prerequisites on the left are stable.

```txt
Reactive foundation:
  R1 keys
    -> R2 query/action metadata
    -> R3 resources/mutations
    -> R4 reactive graph
    -> T1 first reactive target

Routing and data loading:
  R2 query/action metadata
    -> ROUTE1 typed routes
    -> R4 reactive graph
    -> SF1 single-flight
    -> hydration snapshots

Rules and auth:
  rule AST
    -> rule dependency extraction
    -> rule evaluation planner
    -> authz/CRUD policy integration
    -> rule-derived reactivity and IVM

Services:
  service refs
    -> module graph
    -> requirement bubbling
    -> scoped cleanup
    -> Effect/React/plain-TS/test targets

CRUD:
  existing deriveCrud
    -> mapping-aware CRUD
    -> CRUD keys/reactivity
    -> CRUD forms/routes/clients
    -> CRUD policy/rule integration
```

---

## 0.3 API Compatibility Decisions

These decisions should be made before implementing `R2`.

- [x] Use `gen.key.*` as the canonical public key namespace. Keys are broader than reactivity and also support hydration, singleflight, subscriptions, devtools, visualization, tests, and cache policies.
- [x] Put query/action reactivity metadata under a nested `reactivity` object. Avoid adding more top-level function fields unless they are core to all function kinds.
- [x] Treat `ActionFunction.invalidates: readonly QueryFunction[]` as legacy sugar. Lower each query ref to its declared `reactivity.key` when possible, emit a diagnostic otherwise, and deprecate after the key-based model is stable.
- [x] Apply the same legacy migration rule to `Mutator.invalidates: readonly QueryFunction[]`.
- [x] Prefer a dedicated `KeyExpression`/`KeyPatternExpression` wrapper over accepting arbitrary `Expr` directly in public reactivity APIs. Internally it can wrap an `Expr` node.
- [x] Register key families as first-class discoverable objects in `GenContext` or a context-owned registry. Embedded-only keys are too hard for graph generation, diagnostics, and devtools.
- [x] Make `ReactiveGraph` derived compiler output, not user-authored input.
- [x] Keep rules separate from authz. `@gen/rules` owns logical predicates; `@gen/authz` consumes policy rules and owns actor/resource/action security semantics.
- [x] Make every runtime/generator target a plugin using one target contract. Effect Atom, TanStack Query, Hono, OpenAPI, RLS, devtools, visualizer, and future targets must not use privileged pathways.
- [x] Standardize shared `Capability`, `Requirement`, `Placement`, `FallbackPlan`, and `Diagnostic` concepts. Packages may specialize them but should not invent incompatible fallback/placement models.

---

## 0.4 Normative Terms

Use these terms consistently when converting this plan into code or Allium specs.

- **MUST** means required for a valid implementation.
- **MUST NOT** means forbidden behavior.
- **SHOULD** means required unless a documented design decision says otherwise.
- **MAY** means optional behavior.
- **Portable definition** means a value intended to be inspected, checked, generated, serialized, visualized, or interpreted by multiple targets.
- **Opaque runtime code** means arbitrary JS/TS closures or target-specific code that cannot be statically inspected.

---

## 0.5 Global Requirements

These apply across every package in this plan.

- Portable definitions MUST be represented as static records or typed AST nodes.
- Portable definitions MUST NOT require arbitrary JS closure execution for checking or generation.
- Runtime target integrations MAY generate JS/TS closures, hooks, components, effects, atoms, stores, or providers as artifacts.
- `gen.func.query` and `gen.func.action` MUST remain the canonical source of truth for reads and writes.
- Reactivity, routing, hydration, UI, forms, optimistic behavior, clients, and devtools MUST be interpretations of the static graph, not separate source-of-truth systems.
- Every first-class object created through `gen.*` SHOULD be discoverable from `GenContext` or from an explicitly registered module/registry.
- Every target-specific fallback or degradation choice SHOULD produce diagnostics or graph metadata.
- Generated code MUST preserve the security boundary: client hints are never authoritative auth checks.
- Type-level APIs SHOULD preserve exact input/output/error/key payload types where TypeScript can express them.
- If exact analysis is impossible, checkers SHOULD choose conservative correctness and explain the loss of precision.
- Public APIs SHOULD prefer static object specifications as the canonical form. Fluent builders and `.pipe()` MAY exist as ergonomic sugar over the same static records.
- Cross-cutting concepts such as placement, fallback, capabilities, and requirements MUST use shared primitives wherever possible.
- Package-specific fallback concepts MUST either reuse `FallbackPlan` or document why they need a distinct type.
- Client-visible authorization behavior MUST be modeled as hints unless explicitly proven safe and still enforced server-side.
- Core IR variants MUST prefer algebraic data types (discriminated unions) over records with many optional fields.
- Static composition APIs SHOULD expose domain-friendly map/all/chain-style helpers where they preserve inspectable dependency graphs.
- Operation laws SHOULD be first-class metadata whenever an operation may be optimized, batched, retried, rolled back, merged, or incrementally maintained.
- TypeScript SHOULD prove local shape/type correctness and preserve inference through `gen.*` constructors.
- Lifecycle checks SHOULD prove global graph correctness and target feasibility.
- Public APIs MUST NOT require users to pass explicit generic arguments for common use cases when the information is available from values.

---

## 0.5a Type Safety And Inference Contract

This project should optimize for full inference from `gen.*` constructors down to generated artifacts, while keeping global checks out of TypeScript when they would become brittle or slow.

### Split Of Responsibility

```txt
TypeScript should catch:
  local type mismatches
  wrong field/entity usage where expressible
  invalid key payloads
  invalid route params/query shapes
  invalid form field/action input bindings
  invalid resource/mutation input/output use
  missing branch handlers where represented as local unions

Lifecycle check should catch:
  duplicate names
  unresolved service providers
  unsupported target capabilities
  cross-store planning feasibility
  rule placement/translatability
  generated graph consistency
  full app requirement satisfaction
  target-specific degradation choices
```

### Phantom Type Slots

Every first-class IR node SHOULD carry phantom type slots when relevant. These are type-only and MUST NOT affect runtime output.

```ts
interface StaticNode<In = unknown, Out = unknown, Err = never, Req = never, Eff = never> {
  readonly _input?: In;
  readonly _output?: Out;
  readonly _errors?: Err;
  readonly _requires?: Req;
  readonly _effects?: Eff;
}
```

Use the idea, not necessarily this exact interface, for:

```txt
Entity
Field
SemanticType
Expr
Predicate
QueryExpression
ActionExpr
QueryFunction
ActionFunction
PatchFunction
ReactiveResource
ReactiveMutation
Form
Route
Rule
Service
Module
Target artifact inputs
```

### Requirement And Effect Bubbling

Requirements and effects SHOULD be represented both in runtime records and type-level phantom slots.

Rules:

- If `A` requires `Database` and `B` requires `EmailClient`, `all({ A, B })` requires `Database | EmailClient`.
- If `B` depends on the output of `A`, `chain(A, B)` requires `Requires<A> | Requires<B>` and creates a graph sequencing edge.
- Forms inherit action requirements plus form runtime requirements.
- Routes inherit loader/action/component/service requirements.
- Modules provide and require service sets.
- `createGen({ plugins })` should infer plugin-contributed namespaces, targets, helpers, and default service/provider capabilities where possible.

TypeScript MAY expose inferred requirements, but lifecycle checks remain authoritative for whole-app satisfaction.

### Inference Helpers

Add specific inference helpers instead of forcing users to inspect internals:

```ts
InferType<T>;
InferField<F>;
InferEntity<E>;
InferQueryInput<Q>;
InferQueryOutput<Q>;
InferQueryErrors<Q>;
InferActionInput<A>;
InferActionOutput<A>;
InferActionErrors<A>;
InferResourceInput<R>;
InferResourceValue<R>;
InferResourceState<R>;
InferMutationInput<M>;
InferMutationOutput<M>;
InferMutationErrors<M>;
InferFormValues<F>;
InferFormSubmit<F>;
InferFormErrors<F>;
InferRouteParams<R>;
InferRouteQuery<R>;
InferRouteHash<R>;
InferRouteLoaderData<R>;
InferServiceMethods<S>;
InferRequirements<T>;
InferEffects<T>;
InferKeyPayload<K>;
InferKeyFamilyInput<KF>;
InferCrud<C>;
```

### Generic And DX Rules

- Public constructors SHOULD infer from object literals and values.
- Public constructors SHOULD use `const` type parameters where they preserve tuple/object literal types.
- Public APIs SHOULD avoid broad `unknown` returns when input values contain enough information to infer.
- Explicit generic arguments MAY exist for escape hatches but SHOULD NOT be needed in normal examples.
- Examples SHOULD use `satisfies` when it improves exactness without type assertions.
- Public type paths MUST avoid `as unknown as` where possible.
- Arrays of fields, routes, plugins, errors, or resources SHOULD preserve tuple literal information when it matters.
- Prefer narrow branded refs for entity, field, key family, service, route, and target identities.

### Compile-Time Negative Cases

The type test suite SHOULD include `@ts-expect-error` coverage for:

- Wrong entity field used in a query/action/relation.
- Setting a read-only field.
- Writing through a lossy or non-writable mapping.
- Invalid key family payload.
- `.match()` with an unknown key payload field.
- Route path param missing from schema.
- Route navigation missing required params.
- Form field not present in action input.
- Relation include from the wrong source entity.
- Client bundle exposing server-only field/effect where locally expressible.
- Resource mutation called with invalid input.
- Rule/client hint used as authoritative auth in a client context.

---

## 0.5b Functional Design Principles To Steal

Use functional-programming ideas as implementation discipline, not as public API jargon. Prefer domain names over abstract names.

### Algebraic Data Types

All variant-heavy IR should be modeled as discriminated unions.

Apply this to:

```txt
Operation
Expr AST nodes
Query clauses
ActionExpr
PatchExpr
ResourceState
RuleExpr
Placement
FallbackPlan
EnhancementPlan
CrudOperation
RouteNode
```

Requirements:

- Variants MUST have a discriminant field.
- Variant-specific fields MUST be required on the owning variant, not optional on a shared catch-all interface.
- Checkers and generators SHOULD use exhaustive switches where TypeScript can enforce them.

### Laws

Operations, reducers, patches, transports, and merge strategies SHOULD carry law metadata when relevant.

Useful laws:

```txt
associative
commutative
identity
inverse
idempotent
monotonic
total
lossless
reversible
```

Uses:

- batching invalidations
- retry safety
- optimistic rollback
- conflict resolution
- event reducer folding
- IVM delta planning
- aggregate maintenance
- offline queue replay

### Applicative Composition

Independent resources, validations, loaders, and service calls SHOULD compose in a way that preserves parallelism.

Canonical shapes:

```ts
gen.resource.all({ user, stats, notifications });
gen.validation.all({ email, displayName, role });
gen.loader.all({ currentUser, dashboard });
```

Requirements:

- `all` composition MUST preserve per-branch dependencies and errors.
- Targets MAY execute independent branches in parallel.
- Graph derivation MUST show each branch separately.

### Dependent Composition

Dependent composition is allowed but should be explicit because it creates sequencing edges.

Canonical shapes:

```ts
gen.resource.chain(currentUser, (user) => projectsForOrg({ orgId: user.orgId }));
gen.plan.then(first, second);
```

Requirements:

- Dependent composition MUST create a graph edge from the first result to the second input.
- Checkers SHOULD warn when chain-style composition hides a dependency that could be expressed as a static query relation.

### Optics For Mappings, Forms, Patches, And Editors

Use practical lens/path/prism/traversal concepts without requiring users to know optics terminology.

Canonical shapes:

```txt
Path/Lens      focus one field or nested property
Prism          focus one tagged-union variant
Traversal      focus many items in a collection/relation
```

Uses:

- nested patch generation
- form field binding
- editor sections
- relation includes
- reversible mappings
- optimistic rollback

Requirements:

- A writable path MUST prove the target is writable.
- A reversible mapping MUST declare both read and write directions.
- A lossy mapping MUST NOT be used for generated writes unless explicitly overridden.

### Validation Accumulation

Validation should support both fail-fast and error-accumulating modes.

Requirements:

- Form validation SHOULD default to accumulating field errors.
- Server mutation validation MAY fail fast for expensive checks when declared.
- Validation errors MUST retain typed field paths where possible.

### Effect And Requirement Rows

Functions, rules, resources, services, and generated features SHOULD expose their effects and requirements as typed rows/sets.

Examples:

```txt
requires: Database | EmailClient | AuthSession
effects: Read<User> | Write<User> | SendEmail | Emit<UserCreated>
```

Requirements:

- Requirement rows MUST bubble upward through composed nodes.
- Target generation MUST fail or fall back when required rows cannot be satisfied.
- Effect rows SHOULD drive placement, security diagnostics, and generated tests.

### Partial Evaluation

Rules, auth hints, validation, route guards, and target placement SHOULD support partial evaluation against available data.

Requirements:

- Partial evaluation MUST preserve unknown branches explicitly.
- Client auth partial evaluation MUST produce hints, not authoritative enforcement.
- Diagnostics SHOULD explain missing data needed for exact evaluation.

### State Machines

Stateful workflows SHOULD be represented as explicit finite-state machines where possible.

Apply this to:

```txt
entity status transitions
mutation lifecycle
offline queue lifecycle
resource loading lifecycle
route loading lifecycle
editor workflow
```

Requirements:

- State transitions SHOULD be static and checkable.
- Invalid transitions SHOULD produce diagnostics.
- Generated UI MAY use state machines for disabled states, pending states, and error recovery.

---

## 0.6 Core Static Model Contract

The core implementation should keep this minimum contract stable while packages evolve.

```txt
Static source nodes:
  Entity
  Field
  SemanticType
  Expr
  Predicate
  QueryExpression
  ActionExpr
  PatchExpr
  StaticFunction
  ExprFunction
  QueryFunction
  ActionFunction
  PatchFunction
  PlanFunction
  Runtime
  Requirement
  Effect
  Target
  Artifact
  Capability
  Placement
  FallbackPlan
  Law
  StateMachine
  Path
  ValidationPlan
  TypeInferenceWitness
```

Requirements:

- A static node MUST have a discriminant or kind field sufficient for exhaustive checking.
- A static node SHOULD carry typed references rather than raw string references when the referenced object exists in the model.
- A function body MUST match its declared output type or produce a diagnostic.
- A function's declared requirements/effects MUST cover the requirements/effects used by its body.
- A target MUST declare accepted input kinds and capabilities before generation.
- A checker MUST reject target inputs that require unsupported capabilities unless a fallback plan exists.
- A placement decision SHOULD be represented as static data: preferred placement, allowed fallbacks, required capabilities, and diagnostics on degradation.
- A fallback plan SHOULD be explicit and inspectable, not buried in target code.
- Requirement/effect rows SHOULD be composable through `all` and `chain`-style static composition nodes.
- Laws SHOULD be attached to operations and reducers before they are used for automatic optimization or rollback.
- Phantom type slots SHOULD preserve input, output, error, requirement, effect, capability, and key payload information where practical.

### Shared Placement and Fallback Contract

Use this shared shape across query planning, auth policy placement, enhancement tiers, service runtimes, transports, hydration, and reactive targets.

```txt
Placement
  preferred: runtime | database | server | client | edge | worker | native | external | target-specific
  allowed_fallbacks: List<Placement>
  required_capabilities: List<Capability>
  policy: require | prefer | allow | forbid

FallbackPlan
  preferred: Plan
  fallbacks: List<Plan>
  last_resort: Plan?
  diagnostics: List<Diagnostic>
```

Requirements:

- A package MAY define specialized placement values, but they MUST lower to the shared `Placement` model.
- A target MUST report which placement and fallback branch it selected.
- A target MUST NOT silently choose a less secure placement.
- Auth and validation fallbacks MUST preserve authoritative server-side enforcement.

---

## 0.7 Reactivity Specification Draft

This section is intentionally spec-like. It should become `spec/reactivity.allium` before or during `R1`.

### Terms

- **ReactiveKey**: A typed static identity for data that can be read, refreshed, invalidated, patched, hydrated, or visualized.
- **ReactiveKeyPattern**: A static selector over keys. It can target one key, every key in a family, or a subset of a family.
- **KeyFamily**: A typed static function from input payload to `ReactiveKey`.
- **InvalidationPlan**: A static expression/function that maps mutation input/result/context to `ReactiveKeyPattern[]`.
- **RefreshPlan**: A static plan that describes how stale resources should be refreshed.
- **ReactiveResource**: A target-independent interpretation of a `QueryFunction` as stateful data.
- **ReactiveMutation**: A target-independent interpretation of an `ActionFunction` as a callable mutation.
- **ReactiveGraph**: A derived graph of reads, writes, invalidations, patches, subscriptions, routes, UI consumers, services, and runtime boundaries.

### Required Entities

```txt
ReactiveKey<Name, Payload>
  name: Name
  payload_type: SemanticType<Payload>
  payload: Expr<Payload> | Payload
  hierarchy: collection | entity | field | relation | view | custom

ReactiveKeyPattern<Name, Payload>
  kind: exact | any | match
  family: KeyFamily<Name, Payload>?
  key: ReactiveKey<Name, Payload>?
  partial_payload: Partial<Payload>?

KeyFamily<Name, Input>
  name: Name
  input_type: SemanticType<Input>
  output_type: ReactiveKey<Name, Input>

KeyExpression<Input, Key>
  input_type: SemanticType<Input>
  output_type: SemanticType<Key>
  body: Expr<Input, Key>

KeyPatternExpression<Input, Pattern>
  input_type: SemanticType<Input>
  output_type: SemanticType<Pattern>
  body: Expr<Input, Pattern>

ResourceState<Value, Error>
  initial | loading | success | refreshing | failure | defect

ReactiveResource<Input, Value, Error>
  source_query: QueryFunction<Input, Value>
  key: KeyExpression<Input, ReactiveKey | ReactiveKeyPattern>
  state: ResourceState<Value, Error>

ReactiveMutation<Input, Output, Error>
  source_action: ActionFunction<Input, Output>
  invalidates: InvalidationPlan<Input, Output>?
  optimistic: OptimisticPlan<Input, Output>?

ReactiveGraph
  nodes: funcs | keys | resources | mutations | routes | forms | components | services | stores | runtimes | boundaries
  edges: reads | writes | invalidates | derives | patches | reconciles | rolls_back | emits | subscribes | requires | hydrates | transports

ResourceAll
  branches: Record<String, ReactiveResource>
  mode: parallel | target_decides

ResourceChain
  source: ReactiveResource
  derive_next: StaticFunction
```

### Invariants

- A `KeyFamily` name MUST be unique within its registry/module.
- A `ReactiveKey` payload MUST conform to its family input type.
- A `ReactiveKeyPattern.match` partial payload MUST only mention fields present in the family input type.
- A `ReactiveKeyPattern.any` MUST reference a family, not an arbitrary string.
- A `QueryFunction.key` MUST evaluate to `ReactiveKey` or `ReactiveKeyPattern`.
- An `ActionFunction.reactivity.invalidates` plan MUST evaluate to `ReactiveKeyPattern[]`.
- Raw string invalidation keys MUST NOT be accepted in portable definitions except through an explicit `gen.key.custom(...)` constructor.
- Public reactivity APIs MUST accept `KeyExpression` or `KeyPatternExpression`, not arbitrary raw expressions.
- A `ReactiveResource` MUST reference a `QueryFunction`.
- A `ReactiveMutation` MUST reference an `ActionFunction`.
- A resource key SHOULD be stable for equivalent query inputs.
- A mutation with optimistic behavior MUST define or derive rollback and reconcile behavior, or declare a fallback plan.
- If exact invalidation cannot be derived, the graph SHOULD use broader valid patterns such as `.match(...)`, `.any()`, or collection keys.
- `ResourceAll` MUST preserve each branch's key dependencies and errors.
- `ResourceChain` MUST add a sequencing edge from source result to derived resource input.

### Required Diagnostics

```txt
reactivity:duplicate-key-family
reactivity:key-payload-mismatch
reactivity:key-match-unknown-field
reactivity:query-key-output-invalid
reactivity:invalidates-output-invalid
reactivity:raw-key-not-portable
reactivity:resource-source-not-query
reactivity:mutation-source-not-action
reactivity:optimistic-unreconcilable
reactivity:target-capability-missing
reactivity:invalidation-broadened
```

### Compatibility Rule

Existing `invalidates: QueryFunction[]` fields are legacy query-reference invalidation.

```txt
Chosen path:
  1. Keep legacy field as sugar during the transition.
  2. Lower each query ref to its declared `reactivity.key` when possible.
  3. Emit a diagnostic if a referenced query has no key.
  4. Deprecate the legacy field after key-based invalidation is stable.
  5. Remove it only in an explicit breaking-change release.
```

This MUST be reflected in `function.allium`, `api.allium`, and migration notes.

### Canonical API Shape

Use this public shape unless a later decision supersedes it:

```ts
const usersListKey = gen.key.family("users.list", {
  input: gen.types.object({
    role: gen.types.optional(User.fields.role.type),
  }),
})

const listUsers = gen.func.query({
  name: "listUsers",
  input: usersListKey.input,
  returns: gen.types.array(UserSummary),
  body: gen.query.from(User).select(UserSummary),
  reactivity: {
    key: gen.key.expr(({ role }) => usersListKey({ role })),
  },
})

const createUser = gen.func.action({
  name: "createUser",
  input: CreateUserInput,
  returns: UserDetail,
  body: gen.action.insert(User, ...),
  reactivity: {
    infer: true,
    invalidates: gen.key.patternExpr(({ result }) => [
      usersListKey.any(),
      gen.key.entity(User, result.id),
    ]),
  },
})
```

---

## 0.8 Router and SingleFlight Specification Draft

This should become `spec/router.allium` and `spec/singleflight.allium`.

### Route Requirements

- App routes MUST be distinct from HTTP API routes.
- An app route MUST declare path params, query params, and hash params as typed schemas when they are used.
- Every path template parameter MUST have a matching path param schema entry.
- A route loader MUST be a `QueryFunction` or `ReactiveResource`.
- A route action SHOULD be an `ActionFunction` or `ReactiveMutation`.
- Route error boundaries SHOULD be typed against declared function errors.
- Exhaustive error boundary checking MAY be configurable.
- Typed navigation helpers MUST reject missing or invalid params at compile time where possible.
- Route definitions SHOULD use static object specs as the canonical form. Pipeable route builders MAY lower to the same route record.

### SingleFlight Requirements

- A `SingleFlightPlan` MUST be derived from route loader read keys and mutation invalidation keys.
- A mutation refresh plan MUST include the mutation result and affected loader payloads or a declared fallback.
- If affected loaders cannot be determined precisely, the plan SHOULD choose a conservative fallback and emit a diagnostic.
- SingleFlight MUST NOT require a specific frontend framework.

Required diagnostics:

```txt
router:path-param-missing-schema
router:loader-not-query
router:error-boundary-non-exhaustive
singleflight:affected-loaders-unknown
singleflight:unsupported-loader-refresh
```

---

## 0.9 Rules and Auth Specification Draft

This should become `spec/rules.allium`, with `spec/authz.allium` referencing rule predicates for policies.

### Rule Requirements

- A rule MUST compile to a typed logical AST, not opaque runtime code.
- `@gen/rules` MUST NOT own actor/resource/action policy semantics. Those belong to `@gen/authz`.
- `@gen/authz` SHOULD consume `Rule` or `PolicyRule` predicates for relational policies.
- Rule variables MUST be typed.
- Every output variable MUST be safely bound.
- Negation MUST be stratified or rejected.
- Recursion MUST be controlled and target-capability checked.
- Aggregates MUST declare grouping/key semantics.
- A rule MUST expose dependency metadata: entities, fields, relations, services, and effects it reads.

### Rule Placement Requirements

- A rule planner MUST classify possible placements: database predicate, RLS, server pre-query, server integrated query, server post-filter, client hint, materialized/IVM, external evaluator.
- Rule placements MUST lower to the shared `Placement` model from section `0.6`.
- A list query MUST NOT silently fall back to unbounded server post-filtering when database placement fails.
- Client hints MUST be marked non-authoritative.
- Client hint modes MUST be explicit: exact, sound-allow, sound-deny, best-effort, disabled.
- Field-level auth MUST remain enforced server-side even when UI hints hide or disable fields.

Required diagnostics:

```txt
rules:unsafe-variable
rules:unsafe-negation
rules:recursion-unsupported
rules:aggregate-not-maintainable
rules:not-sql-translatable
rules:not-rls-translatable
rules:client-hint-not-exact
authz:unsafe-list-post-filter
authz:authoritative-client-policy
```

### Rule-Derived Reactivity

Rules expose what they read. The compiler uses the rule’s dependency graph to derive reactive edges.

Given a rule:

```ts
const canViewProject = gen.rule.define({
  name: "canViewProject",
  input: gen.types.object({
    actor: Actor,
    project: Project,
  }),
  predicate: gen.predicate.or(
    gen.expr.eq(Project.fields.visibility, "public"),
    gen.expr.eq(Project.fields.ownerId, Actor.fields.id),
    gen.relation.exists(ProjectMember, {
      userId: Actor.fields.id,
      projectId: Project.fields.id,
    }),
  ),
});
```

The compiler extracts:

```txt
canViewProject reads:
  Project.visibility
  Project.ownerId
  Actor.id
  ProjectMember.userId
  ProjectMember.projectId
```

When a query uses that rule, the reactive graph derives:

```txt
listVisibleProjects depends on:
  Project rows
  Project.visibility
  Project.ownerId
  ProjectMember membership rows
  canViewProject rule
```

So mutations that write `Project.visibility`, `Project.ownerId`, or `ProjectMember` rows may invalidate `listVisibleProjects`.

This replaces hand-written invalidation:

```ts
// Without rule-derived reactivity — brittle manual wiring
createMembership.invalidates = [listVisibleProjects];
updateProjectVisibility.invalidates = [listVisibleProjects];
transferProjectOwnership.invalidates = [listVisibleProjects];
deleteMembership.invalidates = [listVisibleProjects];
```

With rule-derived reactivity, the system infers:

```txt
This mutation writes a field/relation that the visibility rule reads.
This query is filtered by that visibility rule.
Therefore this query’s resource may be stale.
```

#### Reactive Graph Edges

```txt
ActionFunction --writes--> Field
Rule --reads--> Field
Policy --uses--> Rule
QueryFunction --uses--> Policy
ReactiveResource --wraps--> QueryFunction
Component/Route/Form --reads--> ReactiveResource
```

Impact path example:

```txt
updateProjectVisibility
  -> canViewProject may change
  -> listVisibleProjects may change
  -> visibleProjectsResource stale
  -> ProjectList UI updates
```

#### Compiler Levels

**Level 1 — Conservative invalidation** (start here):

```txt
Mutation writes field/relation that rule reads.
Therefore any resource using that rule may be stale.
```

**Level 2 — Key-aware invalidation**:

```ts
update Project.status for projectId=123
  invalidates:
    project.detail({ id: 123 })
    project.editability({ id: 123, actorId })
```

**Level 3 — Predicate-aware affected set**:

```txt
before: canViewProject(actor, oldProject) = false
after:  canViewProject(actor, newProject) = true
=> add project to visible list
```

**Level 4 — IVM/delta maintenance**:

```txt
VisibleProject(userId, projectId) maintained incrementally.
```

Defer Level 4 until Levels 1–3 are stable.

#### Forms and UI

Rule-derived reactivity applies to UI editability too:

```ts
gen.form.field(Project.fields.name, {
  editableWhen: canEditProjectName,
});
```

The compiler derives:

```txt
Project.name field editability depends on:
  Project.ownerId
  Project.status
  Actor.id
```

When `Project.status` changes from `draft` to `archived`, the UI knows the field may no longer be editable.

#### Diagnostics

```txt
rules-reactivity:dependency-not-extractable
rules-reactivity:opaque-rule-not-reactive
rules-reactivity:mutation-writes-rule-dependency
rules-reactivity:broad-invalidation-selected
rules-reactivity:affected-set-unknown
rules-reactivity:cross-store-rule-dependency
rules-reactivity:time-dependent-rule
rules-reactivity:external-service-rule
rules-reactivity:ivm-delta-unsupported
```

#### Rule + Key Integration

Rules integrate with the key system by turning **rule dependencies** into **key dependencies** and then into **key invalidation plans**.

The key system is the address space; rules help determine which addresses may be stale.

**Rules should not own keys directly.** A rule should not say `invalidate project.visibleList.any()`. It should say (or allow the compiler to derive):

```txt
canViewProject reads:
  Project.visibility
  Project.ownerId
  ProjectMember.userId
  ProjectMember.projectId
```

Queries/resources that use the rule declare their own keys. The compiler connects:

```txt
listVisibleProjects uses canViewProject
listVisibleProjects has key projects.visible({ actorId })
```

**Mutations expose write sets.** With rule-derived reactivity, the compiler helps derive broader invalidation:

```txt
updateProjectVisibility writes Project.visibility
canViewProject reads Project.visibility
listVisibleProjects uses canViewProject
listVisibleProjects key = projects.visible({ actorId })
=> visibleProjectsKey.any()
```

**Precision levels through keys**:

1. **Family-wide invalidation** — `visibleProjectsKey.any()`
2. **Match invalidation** — `visibleProjectsKey.match({ actorId: 7 })`
3. **Exact key invalidation** — `projectKey({ id: 123 })`
4. **Patch instead of invalidate** — add project to list when membership is proven

**Rule result keys.** Sometimes the rule itself should have a key:

```ts
const canEditProjectKey = gen.key.family("rule.canEditProject", {
  input: gen.types.object({
    actorId: Actor.fields.id.type,
    projectId: Project.fields.id.type,
  }),
});
```

Then `Project.status` or `Project.ownerId` changes invalidate:

```ts
canEditProjectKey.match({ projectId });
```

**Suggested IR**:

```ts
interface RuleKeyDependency {
  readonly kind: "rule_key_dependency";
  readonly rule: RuleRef;
  readonly reads: readonly ReactiveKeyPattern[];
  readonly precision: "entity" | "field" | "relation" | "custom";
}

interface DerivedInvalidationPlan {
  readonly kind: "derived_invalidation_plan";
  readonly sourceAction: ActionFunctionRef;
  readonly reason: readonly InvalidationReason[];
  readonly invalidates: readonly ReactiveKeyPattern[];
  readonly precision: "broad" | "matched" | "exact" | "patchable";
  readonly confidence: "conservative" | "proven";
}
```

**Safety boundary**: Do not make key invalidation part of the rule’s meaning. The rule stays pure; the graph derives invalidation.

**What this enables**: cache invalidation, route loader refresh, form editability refresh, permission resource invalidation, single-flight affected loader bundles, devtools impact graphs, test plans for mutation effects, IVM/materialized view maintenance.

**Start with the simplest useful version**:

```txt
1. Extract rule field/relation dependencies.
2. Map query/resource usage of rules to declared query keys.
3. Extract mutation write sets.
4. Derive broad key-family invalidation.
5. Add match/exact invalidation later.
```

---

## 0.10 Services and Modules Specification Draft

This should become `spec/services.allium`.

### Required Entities

```txt
ServiceRef
MethodRef
Provider
Layer
Module
Scope
Finalizer
```

Requirements:

- A service method SHOULD reference a static function type or function definition.
- A function that calls a service MUST declare or derive a requirement on that service.
- Requirements MUST bubble through actions, resources, routes, forms, components, modules, and app shells.
- A module MUST declare provided and required services.
- A module graph MUST reject unresolved required services unless a target explicitly supplies them.
- Scoped services MUST declare acquisition and release/finalizer semantics.
- Effect Layers, React providers, plain TS DI containers, and test mocks are target interpretations, not the core model.

Required diagnostics:

```txt
services:missing-provider
services:conflicting-provider
services:cyclic-module-import
services:invalid-scope
services:finalizer-missing
services:target-unsupported-scope
```

---

## 0.11 Progressive Enhancement Specification Draft

This should become `spec/enhancement.allium`.

Requirements:

- Every generated feature SHOULD declare baseline, enhanced, fallback, failure, and unsupported behavior.
- Enhancement fallbacks MUST lower to the shared `FallbackPlan` model from section `0.6`.
- Target capability checks MUST choose a supported plan or produce diagnostics.
- Web form generation SHOULD default to server-first behavior when possible.
- Server validation MUST remain authoritative even when client validation exists.
- Optimistic behavior MUST degrade safely when rollback/reconcile cannot be derived.
- Offline support MUST declare persistence, serialization, retry, and conflict behavior.
- Realtime/live behavior MUST declare stream/subscription capabilities and fallback behavior.

Required diagnostics:

```txt
enhancement:capability-missing
enhancement:fallback-selected
enhancement:no-supported-plan
enhancement:client-validation-not-authoritative
enhancement:offline-persistence-unavailable
enhancement:optimistic-fallback-selected
```

---

## 0.12 CRUD Specification Draft

This should become `spec/crud.allium` and should align with the already implemented `src/crud/` module.

CRUD is the **first big integration point** where entities, static expressions, rules, auth, actions, keys, and reactivity all "click" together. CRUD should not be a separate shortcut system — it should expand into the same IR as everything else.

### Core Principle

CRUD is sugar over canonical primitives:

```txt
Entity + Rules/Auth + Static Expr + Mappings
  -> safe queries/actions
  -> generated inputs/projections
  -> generated keys
  -> derived reactivity
  -> generated UI/routes/forms/tests
```

### Requirements

- CRUD helpers MUST expand to real static query/action functions.
- CRUD helpers MUST NOT bypass mappings, policies, reactivity, optimistic patches, routes, or lifecycle checks.
- Mapping-aware CRUD MUST derive writable inputs from mapping writability, field traits, hidden fields, server-only fields, and read-only fields.
- CRUD list/get outputs MUST respect projections and hidden/server-only fields.
- CRUD operations SHOULD derive keys and invalidation plans.
- CRUD policy placement MUST use the rule/auth planner when policies are rule-backed.
- CRUD optimistic behavior MUST be conservative and diagnosable.
- CRUD soft delete, versioning, delete restrictions, relation includes, count/exists/getMany, and generated routes/clients/forms SHOULD be modeled as static options.

### What Generated CRUD Should Emit

For an entity like `Project`, CRUD generates:

```txt
Queries:
  listProjects, getProjectById, countProjects, existsProject

Actions:
  createProject, updateProject, deleteProject

Keys:
  project.collection
  project.detail({ id })
  project.list({ filters, actorId? })

Auth bindings:
  Project.read, Project.create, Project.update, Project.delete
  Project.field.read/write

Reactivity:
  create invalidates collection/list/count
  update invalidates detail/list fields/rule-derived lists
  delete invalidates detail/list/count
```

### How Auth/Rules Plug In

CRUD accepts or derives policy hooks:

```ts
const projectCrud = gen.crud.derive(Project, {
  access: {
    read: canViewProject,
    create: canCreateProject,
    update: canEditProject,
    delete: canDeleteProject,
    fields: {
      budget: { read: canViewProjectBudget, write: canEditProjectBudget },
      ownerId: { write: canTransferProject },
    },
  },
});
```

This expands into policies, query filters, action checks, and field read/write policies.

### List CRUD + Auth

Generated `listProjects` should not be `SELECT * FROM projects`. It should be:

```txt
SELECT allowed fields
FROM projects
WHERE user filters
AND authz filter from canViewProject
ORDER/PAGINATE safely
```

The planner must check: can the auth predicate be placed as SQL WHERE/RLS? Does pagination remain correct?

### Update CRUD + Auth

Generated `updateProject` derives a mutation plan:

```txt
1. Load before Project by id.
2. Check entity update policy canEditProject(actor, before).
3. Derive proposed after Project from patch input.
4. Check field.write policies for changed fields.
5. Check transition policies for before -> after.
6. Apply update with safe WHERE/auth predicate if possible.
7. Return read-safe projection.
8. Invalidate detail/list/rule-derived keys.
9. Emit audit/events/reactions.
```

The write set drives auth checks, reactivity, audit logs, and reactions.

### How Keys Fit

CRUD generates standard key families by default:

```ts
projectKeys.collection();
projectKeys.detail({ id });
projectKeys.list({ actorId, filter, page });
projectKeys.count({ actorId, filter });
```

Queries attach keys via `reactivity.key`. Actions attach invalidation via `reactivity.invalidates`. At first, broad invalidation is fine (`list.any()`, `count.any()`). Later, make it precise with write sets and rule deps.

### Diagnostics

```txt
crud:field-not-writable
crud:hidden-field-exposed
crud:server-only-field-exposed
crud:missing-id-field
crud:policy-placement-impossible
crud:relation-include-unsupported
crud:optimistic-unsafe
crud:version-field-missing
crud:list-read-policy-not-placeable
crud:generated-input-overpermits-field
crud:update-needs-before-state
crud:delete-policy-not-enforced
```

---

## 1. Current State Snapshot (Corrected)

### What Is Already Implemented (Well)

| Module            | Status  | Notes                                                                                                                                                                                |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/core/`       | Strong  | `GenContext`, plugins, targets, refs, diagnostics, artifacts, contracts, actors, config. Plugin extensibility via `GenPluginExtensions` and `GenConfig` declaration merging.         |
| `src/types/`      | Strong  | `SemanticType<Ts>`, `Field<Ts>`, `Ref<Ts>`, branded `CapabilityKind`, `BrandCapability`. `InferType`, `InferField`, `InferEntity` helpers.                                           |
| `src/entity/`     | Strong  | `defineEntity<F>` infers `Field<Ts>` from inputs. `InferEntity<E>` and `InferFieldFromInput<T>` work. Mutable builder pattern used during construction but result is properly typed. |
| `src/expression/` | Strong  | `Expr<Ts, Req, Eff>` with THREE phantom params. `Predicate<Input, Output>` with two phantom params. `semanticLiteral<Ts>`, `fieldRef<Ts>` builders. `InferQueryResult<Q>`.           |
| `src/query/`      | Good    | `QueryBuilder<Source, Result>` is generic. `select<Ts>()` changes result type. O(n²) allocation issue exists but API is typed.                                                       |
| `src/function/`   | Good    | Full taxonomy: static, expr, predicate, query, action, patch, plan. `buildActionInsert/Update/Delete/Sequence` exist. Error type constructors.                                       |
| `src/storage/`    | Good    | Stores, tables, columns, mappings, projections, schemas. `escapeSqlLiteral` used in relational adapter (SQL injection fixed).                                                        |
| `src/relation/`   | Good    | Binary relations, graphs, relation entities, integrity modes, FK actions.                                                                                                            |
| `src/api/`        | Good    | `RouteHandler` is a discriminated union. `AuthCondition` is a discriminated union. Routes, getters, mutators, resources.                                                             |
| `src/authz/`      | Good    | Policies, rules, `AllowRole`, `AllowOwner`, `AllowRelation`, `AllowAuthenticated`, `AllowPublic`.                                                                                    |
| `src/events/`     | Good    | Events, emissions, reducers, subscriptions, outbox. Monoid ops with associativity/commutativity/idempotence flags.                                                                   |
| `src/ui/`         | Good    | Platform-agnostic views, slots, components, forms, styles, behaviors, themes, platforms, renderers. Widget kinds.                                                                    |
| `src/crud/`       | Strong  | `deriveCrud(entity)` produces typed `QueryFunction` and `ActionFunction` records. Auto-registered in `GenContext`.                                                                   |
| `src/editor/`     | Strong  | `defineEditor` and `autoEditor`. WYSIWYG with sections, field overrides, nested editors, commands, hooks.                                                                            |
| `src/list/`       | Strong  | `defineList`, `autoList`, `listColumn`, pagination (offset/cursor), row actions, bulk actions. Bound in `gen.list.*`.                                                                |
| `src/reactivity/` | Strong  | `ReactiveKey`, `KeyFamily`, `ReactiveResource`, `ReactiveMutation`, `ReactiveGraph`. Static key derivation and rule-derived reactivity safety, `TargetAdapter` diagnostics.          |
| `src/router/`     | Good    | Typed routes with loaders, actions, guards, error boundaries. Reactivity edges for `route_loads` and `route_submits`.                                                                |
| `src/hydration/`  | Good    | SSR snapshot dehydration, client rehydration plans.                                                                                                                                  |
| `src/services/`   | Good    | Generic service refs, modules, requirement bubbling, scoped cleanup.                                                                                                                 |
| `src/rules/`      | Strong  | Datalog-style typed rules, predicates, rule-to-SQL evaluation, and IVM delta capability placeholders.                                                                                |
| `src/admin/`      | Good    | Admin shell, generated dashboard, lists, and editors into navigation.                                                                                                                |
| `src/lifecycle/`  | Good    | `check()` and `generate()` runners. `moduleCheckers` and `builtInModuleCheckersRegistered` live on `GenContext` (no global singleton). 35 test files.                                |
| `src/adapters/`   | Good    | `standard-schema` adapter with per-entity validator generation. `relational` adapter with DDL generation. `debug` adapter. Reactivity targets `effect-atom` and `tanstack-query`.    |
| `src/db/`         | Partial | DB plugin exists and contributes `gen.db.*` helpers through the plugin system. Needs dialect-aware helper typing and capability diagnostics.                                         |
| Tests             | Good    | 65+ runtime test files. Type-level `.test-d.ts` files for all core semantic types. Over 670 passing tests.                                                                           |

### What Is Partially Implemented / Has Gaps

| Gap                                                  | Location                          | Severity |
| ---------------------------------------------------- | --------------------------------- | -------- |
| `Operation` is NOT a discriminated union             | `src/types/operation.ts`          | Medium   |
| `createUiNamespace` uses `as unknown as` casts       | `src/gen/ui-backends.ts`          | Medium   |
| `gen.db.*` exists only as a plugin surface           | `src/db/db.ts`                    | Medium   |
| Query builder O(n²) allocations                      | `src/query/query.ts`              | Medium   |
| `bindFromEntity` reconstructs closures per call      | `src/gen/binders.ts`              | Medium   |
| Standard-schema adapter lacks enum/nested validation | `src/adapters/standard-schema.ts` | Low      |
| `safeHtml` is pure branding, no sanitization         | `src/ui/ui.ts`                    | Low      |
| `View.slots` is mutable                              | `src/ui/ui.ts`                    | Low      |
| `neverSemanticType` allocates per call               | `src/storage/storage.ts`          | Low      |
| UI/Forms registration gaps in `GenContext`           | `src/gen/binders.ts`              | Low      |

### What Is Spec'd But Not Built

- **Client state store adapters**: URL search params, local storage, session storage, key-value stores
- **Stream/pull resources**: Paginated, infinite, and stream-backed generated resources
- **SingleFlight** (`@gen/singleflight`): Route loader bundling and mutation + affected-loader refresh (Stubs exist)
- **Devtools/visualizer targets**: Dependency graphs, runtime boundary graphs, impact analysis, generated docs, and test plans
- **Cross-boundary transports**: RPC, HTTP, WebSocket mutations, offline command envelopes, queues, OpenAPI, Effect RPC groups
- **Advanced CRUD factory**: Includes, getMany, soft delete, versioning, generated clients/routes/forms
- **IVM**: Incremental view maintenance from rules (Stubs exist)

---

## Current Hardening Priority

The current active work is defined in `atom_plan_agent_implementation_guide.md`. That document captures the prioritized hardening path to align the reactivity IR with the original `spec/atom.txt` design.

**Key principles from `spec/atom.txt` driving current development:**

1. **Atoms as Target:** Effect Atom is an inspiration and target, not the core model.
2. **Derived-First Reactivity:** The compiler derives conservative read/write/invalidation edges.
3. **Typed Manual Keys:** Manual keys are typed refinements for opaque boundaries.
4. **Hierarchy & Batching:** Address spaces have intrinsic invalidation semantics.
5. **Tracking Scopes:** Resources, forms, loaders, and components own their reads.
6. **Result-Like States:** Resource states are discriminated unions (`initial`, `loading`, `success`, `failure`).
7. **Progressive Enhancement:** Targets declare capabilities and degrade gracefully.

> **Note:** Many sections below outline ambitious future work (like IVM, cross-boundary transports, and SingleFlight). The immediate focus remains on executing the agent implementation guide to stabilize the core IR before expanding target ambition.

---

## 2. Phase 0 — Type System Hardening (Do First)

> The type system is already strong. These changes close the remaining gaps and improve inference quality.

**Success criteria for this phase**:

- `vp check` passes with zero type errors
- `vp test` passes with all 35+ test files green
- No `as unknown as` or `as never` casts in core type-system code
- `Operation` union narrows correctly in switch statements without optional field checks
- Public constructors infer without explicit generics in common examples
- Requirement/effect phantom slots are preserved through resources, forms, routes, and composition helpers

### 2.1 Convert `Operation` to Discriminated Union

- **File**: `src/types/operation.ts`
- **Current**: Single interface with optional fields per kind
- **Target**:
  ```ts
  export type Operation =
    | UnaryOperation
    | BinaryOperation
    | ComparisonOperation
    | NaryOperation
    | AggregateOperation
    | CastOperation
    | CoalesceOperation
    | CaseOperation;
  ```
- **Impact**: Breaking for direct object literals only. Builders cover 99% of usage.
- **Effort**: Medium

### 2.2 Fix `createUiNamespace` Type Bypass

- **File**: `src/gen/ui-backends.ts`
- **Issue**: `as unknown as UiNamespace<C>` casts discard all backend-specific overloads
- **Fix**: Extract backend-specific namespace merging into typed helper functions that return precise intersection types
- **Effort**: Medium

### 2.3 Query Builder Performance

- **File**: `src/query/query.ts`
- **Issue**: Every fluent call allocates `{ ...state, predicate }` — O(n²) in chain length
- **Fix**: Use mutable builder accumulating state, freeze in `.build()`. Preserve generic `Source/Result` params.
- **Effort**: Medium

### 2.4 Move `bindFromEntity` to Prototype/Class

- **File**: `src/gen/binders.ts`
- **Issue**: Reconstructs 8 closures on every call
- **Fix**: `QueryBuilder` methods on prototype; instance carries `ctx` and `state`
- **Effort**: Medium

### 2.5 Small Fixes (from `ISSUES.md`)

- [ ] Make `View.slots` readonly (`src/ui/ui.ts`)
- [ ] Extract `neverSemanticType` to module-level singleton (`src/storage/storage.ts`)
- [ ] Add runtime validation hook or explicit trust boundary docs to `safeHtml` (`src/ui/ui.ts`)
- [ ] Fix storage mutation on inputs (`store.tables.push`, `table.columns.push`) — return new arrays or freeze
- [ ] Fix target input mutation via cast (`src/core/target.ts`)
- [ ] Fix config mutation via cast (`src/gen.ts`)

### 2.6 Type Inference Hardening

- [ ] Audit every public `gen.*` constructor for avoidable `unknown` widening.
- [ ] Add `const` type parameters to tuple/object-literal-heavy APIs where useful.
- [ ] Preserve exact field maps from `gen.entity(...)` through `Entity.fields` and `InferEntity`.
- [ ] Preserve tuple literals for arrays of fields, errors, routes, plugins, resources, and form fields where they drive inference.
- [ ] Add phantom slots for `_errors`, `_requires`, `_effects`, and `_capabilities` where missing.
- [ ] Ensure plugin helper types flow from `createGen({ plugins })` into the returned `gen` namespace.
- [ ] Remove or isolate `as unknown as` casts from public type paths.

### 2.7 Requirement Bubbling Type Model

- [ ] Add type-level `InferRequirements<T>` and `InferEffects<T>` helpers.
- [ ] Make `gen.resource.all`, `gen.validation.all`, and future route loader composition union branch requirements/effects.
- [ ] Make `gen.resource.chain` and plan sequencing preserve sequenced requirements/effects.
- [ ] Make forms inherit action requirements plus form runtime requirements.
- [ ] Make routes inherit loader/action/component requirements.
- [ ] Keep lifecycle diagnostics authoritative for app-wide provider satisfaction.

---

## 2.5 Data-First Design Rules

> Reinforce the principle that portable definitions must be static IR, not arbitrary runtime closures.

- [ ] **Add `contains_opaque_js` enforcement to action/query builders**
  - Currently `Expr.contains_opaque_js` is tracked but not blocked at construction time
  - Add opt-in strict mode: `createGen({ strict: { noOpaqueJs: true } })`
  - Effort: Small
- [ ] **Document the "no closures in portable definitions" rule**
  - Every `gen.*` constructor must accept serializable inputs only
  - Callbacks must be `Expr` trees, not JS functions
  - Effort: Small
- [ ] **Add diagnostic for opaque JS detection in schema-phase expressions**
  - `spec/expression.allium` says schema expressions cannot contain opaque JS
  - The invariant exists but should produce a diagnostic during `check()`
  - Effort: Small

## 3. Phase 1 — API Design & Composability

> Focus on making the authoring API more ergonomic, pipeable, and composable.

**Success criteria for this phase**:

- All core constructors follow consistent `buildX`/`defineX`/`createX` naming
- `gen.action.insert/update/delete` support staged fluent builders
- `gen.db.*` namespace is available with dialect-specific helpers
- `gen.list.*` and `gen.editor.*` are fully registered in `GenContext`
- Major values (forms, routes, components) support `.pipe()` composition

### 1.1 Add Staged Action DSL

**Current**: `buildActionInsert(entity, [[field, expr], ...])` — works but verbose
**Target**:

```ts
gen.action
  .insert(User)
  .values({
    [User.fields.email]: param("email"),
    [User.fields.name]: param("name"),
  })
  .returning(UserDetail);

gen.action
  .update(User)
  .where(eq(User.fields.id, param("id")))
  .set(User.fields.name, param("name"))
  .returning(UserDetail);

gen.action.delete(User).where(eq(User.fields.id, param("id")));
```

**Rules**:

- Body must still be `ActionExpr`, not arbitrary imperative callback
- `.returning()` should accept `Entity | SemanticType | Projection`
- Type-safe: `set()` should reject fields not in the target entity
- Type-safe: `values()` keys should be writable fields only

### 1.2 Add Pipeable Composition to Major Values

**From `spec/atom.txt`**: AF-UI's pipeability is valuable. Metadata and behavior compose without central config.
**Target**:

```ts
const UserCreateForm = gen.forms.fromFunc(createUser).pipe(
  gen.ui.Style.attach(formStyle),
  gen.ui.Behavior.attach(submitOnEnter),
  gen.enhancement.progressive(...),
);

const UserRoute = gen.route(UserDetailPage).pipe(
  gen.route.path(gen.path`/users/${User.fields.id}`),
  gen.route.loader(getUser),
  gen.route.catch(...),
);
```

**Implementation**: Sugar over plain `pipe(value, fn1, fn2, ...)`.

### 1.3 Add `gen.db.*` Store Plugin Surface

**Current**: Generic `defineStore`, `defineTable`, `defineColumn` exist. `src/db/db.ts` provides a plugin-based `gen.db.*` surface, but it is still generic and not dialect/capability aware.
**Target**:

```ts
const db = gen.db.primary; // default store alias
db.table("users", [db.column("id", gen.types.uuid()), db.column("email", gen.types.email())]);
```

**Rules**:

- Dialect-specific helpers only (no SQL columns on Mongo store)
- Store declares capabilities; unsupported helpers emit diagnostics
- Type-safe: `db.column` should reject semantic types incompatible with the dialect
- Example: Mongo document store should not accept `gen.types.money()` without a serializer

### 1.4 Complete Context Registration Audit

**Current**: Most objects register, but some UI/API objects may not
**Action**: Cross-reference every `GenContext` collection with `gen.*` constructors
**Missing likely**: resources, forms, views, components, styles, behaviors, themes, platforms, renderers
**Rule**: Every first-class object created through `gen.*` must be discoverable in `ctx` for checks and generation.

### 1.5 Standardize Naming Conventions

**Current**: Mixed `defineX`, `createX`, `makeX`, no-prefix
**Target**:

- `defineX` for registered domain objects (entities, functions, policies)
- `buildX` for transient DSL helpers (expressions, predicates, handlers)
- `createX` for mutable factories
- Rename: `actionInsert` → `buildActionInsert`, `projectedField` → `buildProjectedField`, `queryHandler` → `buildQueryHandler`

---

## 4. Phase 2 — Type Inference & Flexibility

> Make the type system work harder for users. Reduce `unknown`, improve inference chains, add negative tests.

### 2.1 Improve `QueryBuilder.select` Inference

**Current**: `select<Ts>(fields)` returns `QueryBuilder<Source, Ts[]>`. For heterogeneous fields, `Ts` is the first field's type only.
**Target**: Infer tuple/record type from heterogeneous field selections.

```ts
// Current: result is Ts[] (homogeneous)
// Target: result is { id: string; name: string } when selecting id + name
```

**Approach**: Use variadic tuple inference or a `SelectRow<Fields>` mapped type.

### 2.2 Add `InferActionInput<A>` and `InferActionOutput<A>`

**Current**: `InferFunctionInput<F>` and `InferFunctionOutput<F>` exist but are broad
**Target**: Specific helpers for `ActionFunction`, `QueryFunction`, `PatchFunction` that preserve exact shapes.

Required helpers:

- `InferQueryInput<Q>`
- `InferQueryOutput<Q>`
- `InferQueryErrors<Q>`
- `InferActionInput<A>`
- `InferActionOutput<A>`
- `InferActionErrors<A>`
- `InferPatchInput<P>`
- `InferPatchOutput<P>`
- `InferRequirements<T>`
- `InferEffects<T>`

### 2.3 Add `InferCrud<C>` Helper

**Target**:

```ts
type UserCrud = InferCrud<typeof userCrud>;
// => { getById: QueryFunction<{id: string}, User>; create: ActionFunction<...>; ... }
```

### 2.4 Expand Negative Type Tests

**Current**: 4 `.test-d.ts` files exist but mostly positive tests
**Target**: Add `@ts-expect-error` tests for:

- Passing wrong entity to relation constructor
- Mixing Mongo storage with SQL-only target
- Exposing server-only fields to client route
- Expression type mismatch (`contains` on numeric field)
- Setting read-only field in action values
- Calling unsupported dialect helper
- Invalid key family payload
- `.match()` with unknown key payload field
- Route path params missing from schema
- Form field not in action input
- Resource/mutation called with invalid input
- Relation include from wrong source entity

### 2.5 Add Runtime Validator Bridge

**Current**: `SemanticType.validate?: (value: unknown) => value is Ts` exists but is rarely used
**Target**:

- Wire validators into expression literal builders (reject `literal(42)` for `stringType`)
- Wire validators into standard-schema adapter output
- Wire validators into form field builders
- Optional — can be disabled for performance

---

## 5. Phase 3 — New Standard Packages

> Major feature areas from `spec/atom.txt`. Each is a standalone standard package on top of core.

Execution note: build these in the dependency order from `0.2 Dependency Order`. The sections below describe complete package goals, not the order in which every sub-feature should land.

**Success criteria for this phase**:

- Each package can be imported independently: `@gen/reactivity`, `@gen/router`, `@gen/admin`
- `@gen/reactivity` supports at least two targets (e.g., effect-atom and tanstack-query)
- `@gen/router` supports single-flight bundle generation
- `@gen/rules` can compile simple auth predicates to SQL WHERE clauses
- `@gen/enhancement` produces diagnostics for unsupported capability combinations

### 3.1 `@gen/reactivity` — Reactive State Layer

**Core idea**: `gen.func.query` and `gen.func.action` are source of truth. Reactivity is an interpretation layer.

**Current state**:

- No `src/reactivity/` module exists.
- No `gen.key.*` namespace exists.
- No `gen.reactivity.*` namespace exists.
- `ActionFunction.invalidates` and `Mutator.invalidates` are `readonly QueryFunction[]`, not typed key expressions.
- `QueryFunction` has no cache/resource key field.
- CRUD functions are good source inputs for future derivation, but currently have no generated keys or invalidation plans.

**Primitives**:

- `ReactiveKey<Name, Payload>` — typed cache identity
- `KeyFamily<Name, Input>` — stable keyed registry
- `ReactiveRegistry` — typed registry with `.any()`, `.match(partial)`
- `ResourceState<T, E>` — `initial | loading | success | refreshing | failure | defect`
- `ReactiveResource<T, E>` — wrapper around `QueryFunction`
- `ReactiveMutation<I, O, E>` — wrapper around `ActionFunction`
- `InvalidationPlan` — static expression: mutation result → keys to invalidate
- `PullResource<T>` — paginated/infinite resource
- `StreamResource<T>` — stream-backed resource

**API**:

```ts
const userKey = gen.key.family("user", {
  input: gen.object({ id: User.fields.id.type }),
});

const getUser = gen.func.query({
  name: "getUser",
  input: gen.object({ id: User.fields.id.type }),
  returns: UserDetail,
  key: gen.expr(({ id }) => userKey({ id })),
  body: ...,
});

const createUser = gen.func.action({
  name: "createUser",
  input: CreateUserInput,
  returns: UserDetail,
  body: ...,
  invalidates: gen.expr(({ result }) => [
    gen.key.collection(User),
    userKey({ id: result.id }),
  ]),
});
```

**Targets**: `@gen/effect-atom`, `@gen/tanstack-query`, `@gen/swr`, `@gen/vue-query`, `@gen/svelte-store`, `@gen/solid-resource`

**Design rule**: All reactive behavior as static functions/expressions. No raw string keys.

#### 3.1.1 Add Static Key Model

- [ ] Add `src/reactivity/reactivity.ts` and `src/reactivity/index.ts`.
- [ ] Define `ReactiveKey<Name, Payload>` as a static value, not a runtime string.
- [ ] Define `ReactiveKeyPattern` for exact, any, and partial-match invalidation.
- [ ] Define `KeyFamily<Name, Input>` with callable exact keys plus `.any()` and `.match(partial)`.
- [ ] Add built-in key helpers: `entity(entity, id)`, `collection(entity)`, `custom(name)`, `family(name, input)`.
- [ ] Preserve type information through `InferKeyPayload<K>` and `InferKeyFamilyInput<F>` helpers.
- [ ] Add diagnostics for raw string keys in portable reactivity definitions.
- [ ] Add tests for exact keys, entity keys, collection keys, custom keys, `.any()`, and `.match()`.

#### 3.1.2 Add `gen.key.*` Namespace

- [ ] Add `createKeyNamespace` to `src/gen/namespaces.ts` or a dedicated namespace builder.
- [ ] Expose `gen.key.family`, `gen.key.entity`, `gen.key.collection`, `gen.key.custom`, `gen.key.any`.
- [ ] Add hierarchical key helpers: `gen.key.field(entityField, id)`, `gen.key.relation(relation, payload)`, `gen.key.view(viewOrRule, payload)`.
- [ ] Define parent/child invalidation semantics for collection, entity, field, relation, and view keys.
- [ ] Define batching semantics so multiple invalidations in one action coalesce before target-specific refresh.
- [ ] Register key families in `GenContext` if they become first-class discoverable objects.
- [ ] Add type-level tests for key family input inference and invalid payload rejection.

#### 3.1.3 Add Function-Level Reactivity Metadata

- [ ] Extend `QueryFunction` with `key?: ExprFunction | Expr` or a dedicated `KeyExpression` type.
- [ ] Prefer `QueryFunction.reactivity.key?: KeyExpression` over a top-level `key` field.
- [ ] Extend `defineQueryFunction` input with nested `reactivity.key`.
- [ ] Extend `ActionFunction` with `reactivity?: ReactivityPlan`.
- [ ] Extend `defineActionFunction` input with `reactivity`.
- [ ] Lower existing `invalidates: readonly QueryFunction[]` to query keys when possible, with deprecation diagnostics.
- [ ] Add invariant: query keys must return `ReactiveKey` or `ReactiveKeyPattern`.
- [ ] Add invariant: action invalidation expressions must return `ReactiveKeyPattern[]`.
- [ ] Add tests proving query/action functions remain the source of truth.

#### 3.1.4 Add Reactive Resource and Mutation IR

- [ ] Define `ResourceState<T, E>` with `initial`, `loading`, `success`, `refreshing`, `failure`, and `defect` states.
- [ ] Define `ReactiveResource<T, E>` as an interpretation wrapper over `QueryFunction`.
- [ ] Define `ReactiveMutation<I, O, E>` as an interpretation wrapper over `ActionFunction`.
- [ ] Define `InvalidationPlan<Input>` as static expression/function metadata.
- [ ] Define `RefreshPlan<Input>` for explicit refresh behavior distinct from invalidation.
- [ ] Define `ReactiveRegistry` for collecting key families and resources.
- [ ] Add `gen.reactivity.resource(queryFunc, options)`.
- [ ] Add `gen.reactivity.mutation(actionFunc, options)`.
- [ ] Add `gen.reactivity.registry(...)`.
- [ ] Add type-level inference helpers for resource input, output, state, mutation input, mutation output, and error type.

#### 3.1.5 Add Static Invalidation Action Node

- [ ] Extend `ActionExprKindTag` with a reactivity invalidation kind or add a nested effect/action operation kind.
- [ ] Add `gen.reactivity.invalidate(keys)` returning an analyzable `ActionExpr` node.
- [ ] Ensure invalidation action nodes compose through `buildActionSequence`.
- [ ] Add checks that invalidation keys are static expressions, not opaque JS.
- [ ] Add adapter hooks so targets can compile invalidation to runtime-specific APIs.

#### 3.1.6 Add Derived Resources and Selectors

- [ ] Define `ReactiveDerivedResource` or `gen.reactivity.derive(...)`.
- [ ] Model dependencies as typed key expressions.
- [ ] Model derived body as `ExprFunction`, not arbitrary JS.
- [ ] Support target mappings: `Atom.map`, selectors, computed refs, memos, and derived stores.

#### 3.1.6a Add Resource Composition

- [ ] Add `gen.resource.map(resource, exprFunction)` for static value transformation.
- [ ] Add `gen.resource.all(recordOrTuple)` for independent resource composition.
- [ ] Add `gen.resource.chain(resource, staticFunction)` for dependent resource composition.
- [ ] Preserve branch-level loading/error states for `all` composition.
- [ ] Add graph edges that distinguish parallel dependencies from sequential dependencies.
- [ ] Add diagnostics when dependent composition hides a query relation that could be represented statically.

#### 3.1.6b Add Semantic Tracking Scopes

- [ ] Define `TrackingScope` as static/runtime metadata for render, memo, loader, resource, effect, and action scopes.
- [ ] Track which resources/functions/keys a component, loader, route, form, or behavior reads.
- [ ] Let generated runtimes bridge semantic key reads to framework-specific subscriptions/version signals.
- [ ] Derive UI dependencies such as `UserList -> listUsers -> User.collection`.
- [ ] Support target mappings: `Atom.withReactivity`, TanStack query observers, Solid resources, Svelte stores, Vue refs.
- [ ] Add dev-only diagnostics for missing tracking scopes and accidental untracked reads.

#### 3.1.6c Add Reactive Graph / Dataflow Graph

- [ ] Define `ReactiveGraph` or `ApplicationDataflowGraph` as a first-class generated artifact.
- [ ] Ensure graph construction is compiler-derived, not user-authored.
- [ ] Graph nodes: funcs, keys, resources, mutations, streams, routes, loaders, forms, components, services, stores, runtimes, external boundaries.
- [ ] Graph edges: reads, writes, invalidates, derives, patches, reconciles, rolls back, emits, subscribes, requires, transports, hydrates.
- [ ] Add compiler pass to derive the graph from registered entities, mappings, relations, functions, events, resources, UI, rules, and targets.
- [ ] Add graph queries: stale-after-mutation, affected-loaders, required-services, components-reading-key, forms-producing-error, offline-capable-mutations.
- [ ] Add artifact output for JSON graph snapshots.
- [ ] Add tests for graph derivation on a small CRUD domain.

#### 3.1.7 Add Pull, Infinite, and Stream Resources

- [ ] Add `Page<T>` semantic helper or resource wrapper for cursor/offset pages.
- [ ] Add `PullResource<T>` and `InfiniteResource<T>` over paginated `QueryFunction`.
- [ ] Add `StreamResource<T>` over future `StreamFunction` or stream-like function metadata.
- [ ] Add `gen.reactivity.pull(...)`, `gen.reactivity.infinite(...)`, and `gen.reactivity.stream(...)`.
- [ ] Add target mapping notes for `Atom.pull`, TanStack `useInfiniteQuery`, Svelte stores, and Solid resources.

#### 3.1.8 Add Client Store Adapters

- [ ] Model URL search params as a typed store adapter.
- [ ] Model local storage, session storage, and browser key-value storage as typed store adapters.
- [ ] Reuse `SemanticType`/schema parsing for adapter read/write boundaries.
- [ ] Support generated mappings to `Atom.searchParam` and `Atom.kvs` in the effect-atom target.
- [ ] Add diagnostics for non-serializable client store values.

#### 3.1.9 Add Reactive Runtime and Services

- [ ] Define `ReactiveRuntime` / `ClientRuntime` as a client-side runtime boundary.
- [ ] Define `ServiceLayer` metadata that can map to Effect `Layer`, provider contexts, or plain clients.
- [ ] Allow resources and mutations to reference runtime requirements.
- [ ] Add requirement bubbling from resources/mutations into generated UI/routes/forms.
- [ ] Map Effect targets to `Atom.runtime(layer)`.

#### 3.1.10 Add Scoped Resource Lifecycle

- [ ] Define `ScopedResource`, `Finalizer`, and lifecycle requirements for client subscriptions.
- [ ] Connect scoped resources to UI `Behavior` without embedding opaque JS in portable definitions.
- [ ] Map effect-atom output to `get.addFinalizer` or scoped Effects.
- [ ] Map React-style targets to effect cleanup and Solid/Svelte/Vue targets to their lifecycle cleanup APIs.

#### 3.1.11 Add Optimistic Reactivity Integration

- [ ] Connect existing `PatchFunction` to `ReactiveMutation`.
- [ ] Model optimistic apply, rollback, and reconcile plans as static patch functions.
- [ ] Add diagnostics when optimistic patches lack a reconcile field.
- [ ] Generate target-specific optimistic updates for effect-atom and TanStack Query.
- [ ] Add explicit `OptimisticPlan` with apply, rollback, reconcile, fallback, and diagnostics.
- [ ] Support fallback chain: optimistic patch -> pending placeholder -> disable submit/refetch -> server redirect.
- [ ] Require operation laws before deriving automatic aggregate updates, inverse rollbacks, batching, or retry coalescing.
- [ ] Generate tests for rollback and reconciliation plans.

#### 3.1.11b Add Offline Commands and Queues

- [ ] Model offline command envelopes generated from `ActionFunction` input, output, errors, effects, and serialization metadata.
- [ ] Add `gen.offline.queue(actionFunc, options)` or equivalent standard package surface.
- [ ] Support queue persistence choices through enhancement plans: IndexedDB, local storage, memory, none.
- [ ] Add conflict/retry policy metadata.
- [ ] Ensure queued commands carry reactivity invalidation and optimistic rollback/reconcile metadata.

#### 3.1.12 Add Reactivity Checks and Diagnostics

- [ ] Key family names must be unique within a registry.
- [ ] Query key output type must match declared key family.
- [ ] Action invalidation output must be key patterns, not concrete queries.
- [ ] Resource key must be stable for the query input.
- [ ] `.match(partial)` can only use known payload fields.
- [ ] Client-store resources must use serializable semantic types.
- [ ] Target diagnostics must explain unsupported resources, fallback behavior, and broad invalidation.

#### 3.1.13 Add Reactivity Tests

- [ ] Runtime tests for key constructors and registry behavior.
- [ ] Runtime tests for query resource and action mutation records.
- [ ] Runtime tests for invalidation action nodes in action sequences.
- [ ] Type tests for invalid key payloads and invalid `.match()` payloads.
- [ ] Type tests for resource state and mutation input/output inference.
- [ ] Type tests for resource requirement/effect bubbling through `map`, `all`, and `chain`.
- [ ] Lifecycle tests proving `ctx` discovers all first-class reactivity objects.

#### 3.1.14 Add `@gen/effect-atom` Target

- [ ] Add target plugin scaffold after the portable `@gen/reactivity` model exists.
- [ ] Generate `Atom.family` for keyed query resources.
- [ ] Generate `runtime.atom` for effectful queries.
- [ ] Generate `Atom.fn` for action mutations.
- [ ] Generate `Atom.withReactivity` for query read keys.
- [ ] Generate `Reactivity.invalidate` or `Atom.invalidateReactivity` for invalidation plans.
- [ ] Generate `Result` state handling for effectful resources.
- [ ] Generate `Atom.pull` for pull/infinite resources.
- [ ] Generate `Atom.searchParam` and `Atom.kvs` for client store adapters.
- [ ] Add snapshot tests for generated effect-atom artifacts.

#### 3.1.15 Add Additional Reactive Targets

- [ ] Add TanStack Query generator with `queryKey`, `useQuery`, `useMutation`, and `invalidateQueries`.
- [ ] Add SWR generator with stable keys and `mutate` invalidation.
- [ ] Add Solid resource generator.
- [ ] Add Svelte store generator.
- [ ] Add Vue Query/composable generator.
- [ ] Keep each target optional and capability-declared.

#### 3.1.15b Add Devtools and Visualization Targets

- [ ] Add `@gen/devtools` target for inspecting resources, keys, stale state, pending mutations, optimistic patches, and service requirements.
- [ ] Add `@gen/visualizer` target for rendering reactive graph, dependency graph, route graph, runtime boundary graph, and auth/rule graph.
- [ ] Generate docs from the graph: mutation impact, affected resources, route loader dependencies, form error mappings.
- [ ] Generate impact-analysis reports: what changes if a field/relation/action/rule changes.
- [ ] Generate test plans from graph obligations.

#### 3.1.16 Recommended First Implementation Slice

- [ ] Build only static key primitives and namespaces first.
- [ ] Add `QueryFunction.key` and `ActionFunction.reactivity.invalidates` second.
- [ ] Add `ReactiveResource` and `ReactiveMutation` wrappers third.
- [ ] Add diagnostics and tests before writing any runtime target.
- [ ] Add `@gen/effect-atom` only after the portable IR is stable.

### 3.2 `@gen/router` — Typed Routes & Single-Flight

**Primitives**: `Route<Params, Query, Loader, Component>`, `Router`, `Guard`, `ErrorBoundary`, `SingleFlight`

**API**:

```ts
const UserRoute = gen.route({
  name: "UserRoute",
  path: gen.path`/users/${User.fields.id}`,
  params: gen.object({ id: User.fields.id.type }),
  query: gen.object({ tab: gen.optional(gen.enumOf(["profile", "posts"])) }),
  loader: getUser,
  title: gen.func.expr({ ... }),
  component: UserDetailPage,
  catch: gen.route.catch({
    UserNotFound: NotFoundView,
    NetworkError: OfflineView,
  }),
});
```

**Key differentiator**: `gen.singleFlight.routes(AppRoutes)` generates POST endpoints that run mutations + return refreshed loader payloads in one round trip.

#### 3.2.1 Typed Route Values

- [ ] Add route primitive separate from API routes/resources.
- [ ] Model path params, query params, hash params, loader functions, guards, titles, metadata, layouts, and components.
- [ ] Validate path template params against declared param schema.
- [ ] Connect loaders to `QueryFunction` and resource keys.
- [ ] Add typed navigation helpers generated from route schemas.
- [ ] Add backend targets for filesystem routes, React Router, TanStack Router, SolidStart, Next/Remix-like routers, and server-rendered documents.

#### 3.2.2 Typed Error Boundaries

- [ ] Let query/action `ErrorType`s flow into route catches and UI boundaries.
- [ ] Add `gen.match.errors(func, handlers)` or equivalent exhaustive matching helper.
- [ ] Add checker option for exhaustive route error handling.
- [ ] Generate typed not-found/offline/forbidden/error boundaries.

### 3.2b `@gen/singleflight` — Loader Bundling and Mutation Refresh

**Core idea**: Routes know their loaders, actions know what they invalidate, and the reactivity graph knows affected resources. Generate one round trip that returns all needed data.

**Primitives**:

- `SingleFlightPlan`
- `LoaderBundle`
- `MutationRefreshPlan`
- `AffectedLoaderSet`
- `RoutePayload`
- `HydratablePayload`

**Work**:

- [ ] Add `gen.singleFlight.routes(AppRoutes)` to bundle matched route loaders.
- [ ] Add `gen.singleFlight.afterMutation({ refreshAffectedLoaders: true })`.
- [ ] Derive affected loaders from invalidated keys and active route loader read keys.
- [ ] Generate server endpoint that runs mutation, computes affected loaders, refreshes them, and returns mutation result plus loader payloads.
- [ ] Support SSR initial-load bundles and client navigation bundles.
- [ ] Add diagnostics when affected loaders cannot be determined precisely.
- [ ] Add fallback modes: refetch all active loaders, invalidate only, client manual refresh.
- [ ] Add tests for route navigation bundling and mutation-driven loader refresh.

### 3.3 `@gen/hydration` — SSR Snapshot Management

**API**:

```ts
const AppHydration = gen.hydration.define({
  include: [gen.hydration.fromRoutes(AppRoutes), gen.hydration.resource(listUsers)],
  exclude: [gen.hydration.sensitive(AuthSession)],
  validation: "strict",
});
```

**Work**:

- [ ] Define hydration snapshots over resources, route loaders, services, and client stores.
- [ ] Support sensitive state exclusions.
- [ ] Validate snapshots with semantic schemas before client rehydration.
- [ ] Preserve `ResourceState` so initial client state avoids loading flicker.
- [ ] Support selective hydration by route/module/resource.
- [ ] Support target-specific output for Effect Atom hydration, TanStack Query dehydration, custom JSON payloads, and server-rendered HTML payloads.
- [ ] Add diagnostics for non-serializable values, sensitive values included by mistake, and schema mismatch.

### 3.4 `@gen/services` — Generic Service Model

**API**:

```ts
const Database = gen.service("Database", {
  methods: {
    query: gen.func.type({ input: ..., returns: ... }),
  },
});

const UsersModule = gen.module("users", {
  entities: [User],
  funcs: [getUser, createUser],
  requires: [Database],
  provides: [UsersService],
});
```

**Requirement bubbling**: If `createUser` → `sendWelcomeEmail` → requires `EmailClient`, then `UsersModule` requires `EmailClient`. Checker emits diagnostic if unresolved.

#### 3.4.1 Service and Module Graph

- [ ] Add `ServiceRef`, `MethodRef`, `Provider`, `Layer`, `Module`, and `Scope` concepts.
- [ ] Add `gen.service(...)`, `gen.service.ref(...)`, `gen.module(...)`, and provider helpers.
- [ ] Let functions/actions require services and call service methods as static action/query nodes.
- [ ] Represent service requirements as composable requirement rows/sets.
- [ ] Bubble requirements through functions, resources, routes, forms, UI components, modules, and app shells.
- [ ] Detect unresolved services, conflicting providers, invalid scopes, target-incompatible services, and cyclic modules.
- [ ] Support module imports and provider composition.

#### 3.4.2 Scoped Services and Cleanup

- [ ] Model acquire/release lifecycle for scoped services.
- [ ] Model finalizers generically, with Effect target mapping to `Layer.scoped` and `Effect.addFinalizer`.
- [ ] Map React target to providers plus effect cleanup.
- [ ] Map server target to startup/shutdown hooks.
- [ ] Add test target support for deterministic finalizers.

#### 3.4.3 Service Targets and Testing

- [ ] Add `@gen/effect` target for `Effect.Tag`, `Effect.Service`, `Layer`, scoped layers, and test layers.
- [ ] Add React provider/context target.
- [ ] Add plain TypeScript DI/container target.
- [ ] Add `@gen/testing` helpers for mocks, fakes, in-memory providers, and service-call assertions.
- [ ] Implement each service/runtime output as a target plugin using the shared target contract.
- [ ] Generate tests against static functions with service mocks.

### 3.5 `@gen/rules` — Typed Datalog-Style Rules

**Core idea**: Named logical predicates for derived relations, auth predicates, and materialized views. Typed, static, analyzable, constrained.

**API**:

```ts
const CanEditPost = gen.rules.rule("CanEditPost", {
  input: { actor: User, post: Post },
  body: ({ actor, post }) =>
    gen.rules.or(
      gen.rules.eq(actor.role, "admin"),
      gen.rules.rel(PostAuthor, { post, user: actor }),
    ),
});
```

**Safety constraints**: typed predicates, positive rules, safe variables, stratified negation only, controlled recursion, no arbitrary JS, aggregates with explicit grouping.

**Compiler should say**: "This rule cannot be compiled to SQL", "This recursive rule requires a runtime that supports recursion", "This negation is unsafe".

#### 3.5.1 Rule Core

- [ ] Define typed logical AST for rules, not JS callbacks.
- [ ] Add rule primitives: facts, predicates, logic variables, unification, conjunction, disjunction, exists, recursion, stratified negation, aggregates.
- [ ] Add rule views, derived relations, constraints, reducers, and IVM views.
- [ ] Add dependency extraction from rule ASTs.
- [ ] Add safety checks: safe variables, termination where possible, no arbitrary JS, aggregate grouping, recursion constraints.

#### 3.5.2 Rule Evaluation Planner

- [ ] Add planner inputs: rule AST, target operation, available data, store capabilities, runtime capabilities, security policy, performance policy, client hint policy.
- [ ] Classify evaluation placements: database predicate, RLS, server pre-query, server query-integrated, server post-filter, client hint, materialized/IVM, external evaluator.
- [ ] Classify rules by capability: pure local, database-translatable, server-evaluable, materialized/IVM, client-hint-only, not portable.
- [ ] Add placement annotations: prefer database, require database, server-before-write, server-post-filter with max rows, client hint mode, external.
- [ ] Fail loudly for unsafe implicit list post-filtering.
- [ ] Add partial evaluation support with explicit `unknown` branches.
- [ ] Emit diagnostics for missing data needed for exact client/server/database evaluation.

#### 3.5.3 Database, RLS, Server, Client, and Materialized Evaluators

- [ ] Generate SQL `WHERE`, `EXISTS`, `JOIN`, check constraints, and RLS policies where translatable.
- [ ] Add DB session binding model for actor/session values used by RLS.
- [ ] Generate server evaluators for service-backed or non-SQL rules.
- [ ] Generate client partial evaluators for non-authoritative UI hints.
- [ ] Support client hint modes: exact, sound-allow, sound-deny, best-effort, disabled.
- [ ] Generate materialized permission/view lookups for expensive, recursive, or aggregate rules.
- [ ] Add diagnostics explaining why a rule cannot run in a desired placement.

#### 3.5.4 Rule Testing

- [ ] Generate unit tests for rule evaluation.
- [ ] Generate SQL predicate equivalence tests comparing DB translation against server evaluator.
- [ ] Generate client hint approximation tests.
- [ ] Generate CRUD auth tests and RLS policy tests.

### 3.5b Rules + Auth + CRUD Integration

> From `spec/atom.txt`: rules are one of the best primitives for auth and should feed CRUD generation.

**Problem**: Auth is rarely just `allow.role("admin")`. It is relational:

```txt
Can edit post if:
  user is admin
  OR user authored the post
  OR user belongs to the org that owns the post and has role editor
  OR user has an explicit permission grant
```

**Solution**: Use rules as typed predicates, attach them to CRUD, and generate enforcement layers.

#### Auth Rules as Typed Predicates

```ts
const CanEditPost = gen.rules.rule("CanEditPost", {
  input: { actor: User, post: Post },
  body: ({ actor, post }) =>
    gen.rules.or(
      gen.rules.eq(actor.role, "admin"),
      gen.rules.rel(PostAuthor, { post, user: actor }),
      gen.rules.exists(({ membership, org }) =>
        gen.rules.and(
          gen.rules.rel(PostOrg, { post, org }),
          gen.rules.rel(UserMembership, { user: actor, membership }),
          gen.rules.eq(membership.orgId, org.id),
          gen.rules.in(membership.role, ["owner", "editor"]),
        ),
      ),
    ),
});
```

#### CRUD Integration

```ts
const postCrud = gen.crud(Post, {
  mapping: PostMap,
  policy: {
    read: CanReadPost,
    create: CanCreatePost,
    update: CanEditPost,
    delete: CanDeletePost,
  },
});
```

Generated `postCrud.update` automatically injects the policy predicate:

```ts
// Generated (not hand-written)
gen.action
  .update(Post)
  .where(gen.op.eq(Post.fields.id, id))
  .where(CanEditPost({ actor, post: gen.action.current(Post) }))
  .setWhenSome(Post.fields.title, title)
  .returning(PostDetail);
```

#### Policy Placement

Not every policy can run in the same place. Placement options:

```ts
const postCrud = gen.crud(Post, {
  policy: { read: CanReadPost, update: CanEditPost },
  policyPlacement: {
    read: gen.policy.prefer("database").fallback("server"),
    update: gen.policy.require("server-before-write"),
  },
});
```

Placement kinds:

- `database` → compile to WHERE / RLS / policy predicate
- `server-before-query` → check before query if enough input known
- `server-after-query` → fetch then check (must avoid leaking list data)
- `server-before-write` → check before mutation
- `client-hint` → hide/disable UI only, never authoritative
- `edge` → route-level fast rejection
- `external` → call policy service

#### Field-Level Auth

```ts
const PostPolicy = gen.authz.policy(Post, {
  actor: User,
  read: CanReadPost,
  update: CanEditPost,
  fields: {
    publishedAt: { update: CanPublishPost },
    internalNotes: { read: CanReadInternalNotes, update: CanEditInternalNotes },
  },
});
```

Effects:

- `postCrud.update` input excludes fields actor cannot edit
- Generated forms disable/hide fields based on client-safe policy hints
- Server action validates field-level permissions
- OpenAPI docs expose role-based constraints

#### Client Hints

Server-side auth remains authoritative, but UI can use client-safe approximations:

```ts
const CanEditPostClientHint = gen.rules.clientHint(CanEditPost, {
  allowedInputs: ["actor.role", "post.authorId"],
});

const PostsTable = gen.ui.table(postCrud.list, {
  rowActions: [gen.ui.action(postCrud.update, { visibleWhen: CanEditPostClientHint })],
});
```

Diagnostic if not client-hintable:

```txt
Cannot generate client hint for CanEditPost:
requires Membership query not available on client.
Use server check or include membership in loader.
```

#### Rule Compilation Targets

Same rule generates different enforcement:

```txt
SQL WHERE clauses
server-side checks
route middleware
form visibility rules
field-level editability
OpenAPI/security metadata
tests
audit logs
diagnostics if not translatable
```

Classification:

```txt
RLS-translatable
SQL-WHERE-translatable
server-only
client-hint-only
not statically analyzable
```

Diagnostic example:

```txt
CanReadPost is not SQL-translatable.
Falling back to server-side post-filtering.
Warning: this may overfetch.
```

#### Auth-Driven Reactivity

Because policies are rules, Gen knows their dependencies:

```txt
CanReadProject depends on:
  Project.orgId
  Membership.userId
  Membership.orgId
```

If `Membership` changes, Gen infers:

```txt
invalidate:
  project list queries for affected user/org
  route loaders whose auth depends on membership
  UI actions whose visibility depends on membership
```

#### Distinct Rule Kinds

```txt
Rule             general Datalog-like predicate
PolicyRule       auth predicate with actor/resource/action semantics
ConstraintRule   invariant that must hold
DerivationRule   derived fact/view
ReactivityRule   dependency/invalidation relation
ClientHintRule   non-authoritative UI predicate
```

They share implementation, but names help users understand intent.

### 3.6 `@gen/enhancement` — Progressive Enhancement

**Capability tiers**:

- Tier 0: static/read-only
- Tier 1: server forms (no JS)
- Tier 2: enhanced client forms
- Tier 3: reactive client state
- Tier 4: optimistic/offline
- Tier 5: realtime/collaborative

**API**:

```ts
const UserCreateForm = gen.forms.fromFunc(createUser, {
  enhancement: gen.enhancement.progressive({
    baseline: gen.forms.baseline.htmlPost({ action: "/users", method: "POST" }),
    enhanced: gen.forms.enhanced.mutation({ func: createUser, optimistic: true }),
    fallback: gen.forms.fallback.serverRedirect({ success: "/users", failure: "same" }),
  }),
});
```

#### 3.6.1 Capability Ladder

- [ ] Define `EnhancementPlan`, `CapabilityTier`, `FallbackPlan`, and `DegradationDiagnostic`.
- [ ] Every generated feature declares baseline behavior, enhanced behavior, required capabilities, fallback behavior, failure behavior, and unsupported diagnostics.
- [ ] Model tiers: static/read-only, server forms, enhanced client forms, reactive client state, optimistic/offline, realtime/collaborative.
- [ ] Let targets declare supported tiers and capabilities.
- [ ] Add checker that selects best supported plan or reports fallback/error.

#### 3.6.2 Progressive Forms

- [ ] Model no-JS HTML POST baseline.
- [ ] Model enhanced fetch/RPC mutation submit.
- [ ] Model client-safe validation, async server validation, pending states, typed error mapping, optimistic patching, rollback, and server redirect fallback.
- [ ] Classify validators as client-safe, server-only, database-backed, external, or offline-deferred.
- [ ] Support validation accumulation for field errors and fail-fast validation for explicitly expensive checks.
- [ ] Ensure server validation remains authoritative.

#### 3.6.3 Progressive Resources and Reactivity

- [ ] Let resources declare preferred/fallback modes: live subscription, cache invalidation/refetch, manual refresh, server-render refresh.
- [ ] Add degradation diagnostics for unsupported live queries, streams, query cache, and client runtime.
- [ ] Add default web behavior: server-render baseline plus client enhancement where available.

#### 3.6.4 Progressive Transports and Storage

- [ ] Model transport fallback: RPC, HTTP JSON, server action, WebSocket, HTML form POST.
- [ ] Model client persistence fallback: IndexedDB, local storage, session storage, memory, none.
- [ ] Model offline queue fallback and unsupported behavior.
- [ ] Bubble tier-specific requirements upward into pages/app shells.

#### 3.6.5 Progressive UI Components

- [ ] Let components declare preferred behaviors and fallbacks, e.g. async combobox -> native select -> text input with server validation.
- [ ] Ensure generated forms remain functional at lower tiers.
- [ ] Add diagnostics for missing platform capabilities and chosen component degradation.

### 3.7 `@gen/admin` — Admin Shell

**API**:

```ts
const Admin = gen.admin.define({
  title: "Content Admin",
  entities: [Post, User, Comment],
  navigation: "sidebar",
});
```

### 3.8 Advanced `@gen/crud` — Static CRUD Factory Over Metadata

**Current state**: `src/crud/` has `deriveCrud(entity)` for basic get/list/create/update/delete functions. It does not yet cover mapping-aware CRUD, advanced helper functions, generated resources/routes/forms, relation includes, policy placement, soft delete, versioning, or full reactivity derivation.

**Design rule**: Generic CRUD is a macro/factory over static IR. It must expand to real `QueryFunction`, `ActionFunction`, `PatchFunction`, routes, forms, resources, and graph edges.

#### 3.8.1 Mapping-Aware CRUD Factory

- [ ] Add `gen.crud.define(entity, options)` as the configured factory surface.
- [ ] Use `Mapping`, `Projection`, `Relation`, `Policy`, traits, runtime/store capabilities, and operation laws, not just entity fields.
- [ ] Exclude read-only/hidden/server-only fields from inappropriate inputs/outputs.
- [ ] Support reversible mapping writes and hidden write-only inputs such as passwords.
- [ ] Model nested field access and updates through static paths/lenses.
- [ ] Reject generated writes through lossy or non-reversible mappings unless explicitly overridden.
- [ ] Support operation overrides and custom action/query replacement.

#### 3.8.2 Advanced CRUD Operations

- [ ] Add static factories for `getById`, `getMany`, `findOne`, `findMany`, `exists`, `count`, `create`, `updateById`, `patch`, `deleteById`, `upsert`.
- [ ] Support static authoring forms and generated runtime/client forms separately.
- [ ] Add pagination, filtering, sorting, search, and projection options.
- [ ] Add relation includes and typed projected outputs.
- [ ] Ensure relation includes add read dependencies to the reactive graph.

#### 3.8.3 CRUD Reactivity, Optimistic UI, and IVM

- [ ] Generate default keys for get/list/count/exists operations.
- [ ] Derive create/update/delete invalidation from action bodies and relation graph.
- [ ] Derive optimistic create/update/delete patches when safe.
- [ ] Use operation laws to determine safe rollback, reconciliation, aggregate patching, and coalescing.
- [ ] Use state machines for mutation lifecycle, soft-delete lifecycle, and entity transition validation where configured.
- [ ] Feed generated CRUD actions into IVM delta planning.
- [ ] Add diagnostics for broad invalidation, missing old values, and unsafe optimistic derivation.

#### 3.8.4 CRUD Routes, Clients, Forms, Lists, Editors, Admin

- [ ] Generate REST resources and API routes from CRUD bundles.
- [ ] Generate RPC/OpenAPI/client SDK methods from CRUD bundles.
- [ ] Generate reactivity target artifacts: hooks, atoms, stores, resources.
- [ ] Generate forms from create/update/delete actions.
- [ ] Generate list views and table row actions.
- [ ] Generate editor pages and admin shell integration.

#### 3.8.5 CRUD Policies, Errors, Soft Delete, Versioning

- [ ] Attach policy rules to CRUD operations with placement metadata.
- [ ] Generate field-level auth inputs/forms/hints from policy metadata.
- [ ] Derive common typed errors: NotFound, Conflict, UniqueViolation, ForeignKeyViolation, ValidationError, Unauthorized, Forbidden, DeleteRestricted, StaleVersion.
- [ ] Support optimistic concurrency through version traits.
- [ ] Support soft delete through traits and delete behavior options.
- [ ] Support delete restrictions based on relations.

---

## 6. Phase 4 — Derived Reactivity & IVM

> Once `@gen/reactivity` and `@gen/rules` exist, derive invalidation automatically.

**Success criteria for this phase**:

- `insert(User)` automatically invalidates `key.collection(User)` without manual annotation
- `update(User).where(id)` automatically invalidates `key.entity(User, id)` and affected relation keys
- `gen.rules.ivm()` views produce delta rules that compile to SQL triggers or event handlers
- Optimistic UI patches are generated automatically for simple CRUD when operation laws permit

### 4.1 Automatic Invalidation Derivation

From static analysis of action bodies:

- `insert(User)` → invalidates `key.collection(User)`, creates `key.entity(User, result.id)`
- `update(User).where(id)` → invalidates `key.entity(User, id)`, changed fields, relation keys
- `delete(User).where(id)` → invalidates `key.entity(User, id)`, `key.collection(User)`
- Relation field changes → invalidate both old and new relation sides

**Precision levels**:

- `precise` — exact key when old/new values known
- `bounded` — invalidate family/match
- `broad` — invalidate `.any()` or collection

### 4.2 Optimistic UI Derivation

When safe, derive from action bodies:

- Create with temp ID → insert into list, replace temp ID on success
- Update field patch → patch matching rows, rollback on failure
- Requires operation laws (associative/commutative/inverse) for aggregate updates

### 4.3 IVM (Incremental View Maintenance)

For `gen.rules.ivm()` views:

- Derive delta rules from action bodies
- Generate SQL triggers, event processors, or client cache updates
- Classify: `fully_incremental`, `incremental_with_pre_read`, `requires_recompute`

---

## 7. Phase 5 — Testing & Quality

**Success criteria for this phase**:

- At least 10 `@ts-expect-error` negative type tests exist across major invariants
- One end-to-end integration test covers `createGen` → domain definition → `check()` → `generate()` → artifact verification
- Standard-schema adapter has round-trip tests for valid and invalid data
- Relational adapter DDL output is stable (snapshot tests)

### 5.0 Milestone Validation Rule

Every implementation milestone in section `0.1` should end with:

- `vp check`
- `vp test`
- Runtime tests for new constructors/checkers
- Type-level tests for public generic APIs
- Snapshot tests for generated artifacts once a target is involved

### 5.1 Expand Type-Level Tests

- Add `@ts-expect-error` negative tests for all major invariants
- Property-based tests for expression algebra (symmetry, idempotence)
- Add type tests for key hierarchy, key families, `.any()`, `.match()`, and invalid payloads
- Add type tests for route params/query/hash schemas and navigation helpers
- Add type tests for service requirement bubbling and missing provider diagnostics where possible
- Add type tests for rule/client-hint placement APIs and forbidden authoritative client auth
- Add type tests proving common public constructors do not require explicit generic arguments
- Add type tests for plugin-contributed namespace inference from `createGen({ plugins })`
- Add type tests for `InferRequirements<T>` / `InferEffects<T>` through forms, routes, resources, and modules
- Add negative tests for avoidable `unknown` widening in high-value APIs

### 5.2 Integration Tests

- End-to-end lifecycle test: small domain → `check()` → `generate()` → artifacts
- Cross-module consistency: field change invalidates query types
- Reactivity graph test: entity + query + action + UI form produces expected read/write/invalidation edges
- SingleFlight test: route loaders plus mutation invalidation produce affected loader bundle
- Hydration test: resources dehydrate/rehydrate with sensitive exclusions
- Progressive enhancement test: target capability changes selected fallback plan
- Rule planner test: same policy rule classifies to SQL, server, client hint, or diagnostic depending on target
- CRUD integration test: mapping-aware CRUD generates funcs, routes, forms, resources, and graph edges

### 5.3 Adapter Tests

- Standard Schema round-trip: valid/invalid data
- Relational DDL snapshot tests for stability
- Effect Atom artifact snapshots for query resource, mutation, invalidation, pull resource, search param, and KVS adapters
- TanStack Query artifact snapshots for query key, query hook, mutation hook, optimistic update, and invalidation
- Visualizer/devtools graph snapshot tests
- SQL/RLS generation snapshots for rule-based policies

### 5.4 Generated Test Plan Targets

- [ ] Generate rollback/reconciliation tests from `OptimisticPlan`.
- [ ] Generate stale-after-mutation tests from `ReactiveGraph`.
- [ ] Generate route loader dependency tests.
- [ ] Generate service mock tests for action functions.
- [ ] Generate auth policy tests from rules and CRUD policy placement.
- [ ] Generate SQL equivalence tests for rule translations.

---

## 8. Phase 6 — Spec & Documentation Alignment

> The Allium specs and implementation have drifted. Reconcile them.

**Success criteria for this phase**:

- Every entity in `src/` has a corresponding entity in `spec/*.allium`
- Every major package in this plan has either an Allium spec module or an explicit deferred note
- All public invariants and diagnostics in sections `0.7` through `0.12` are captured in Allium or checked in code
- `spec/REVIEW.md` is updated or marked superseded so it no longer contradicts current specs/source
- Legacy invalidation and new key-based reactivity are reconciled in `spec/function.allium` and `spec/api.allium`

### 6.1 Retire Stale Spec Review Items

- [ ] Update or supersede `spec/REVIEW.md`; it still claims several now-present concepts are missing.
- [ ] Remove old plan tasks that say to add events, contracts, actors, config, struct/tagged values, and representation primitives as if absent.
- [ ] Re-run a spec/source comparison after each major package lands.

### 6.2 Add New Allium Spec Modules For Planned Packages

- [ ] Add `spec/reactivity.allium` from section `0.7` before or during `R1`.
- [ ] Add `spec/router.allium` from section `0.8` before `ROUTE1`.
- [ ] Add `spec/singleflight.allium` from section `0.8` before `SF1`.
- [ ] Add `spec/rules.allium` from section `0.9` before `RULE1`.
- [ ] Add `spec/services.allium` from section `0.10` before service/module implementation.
- [ ] Add `spec/enhancement.allium` from section `0.11` before progressive fallback planner implementation.
- [ ] Add `spec/crud.allium` from section `0.12` before advanced mapping-aware CRUD.
- [ ] Add `spec/hydration.allium` before hydration snapshot implementation.
- [ ] Add or expand `spec/admin.allium`, `spec/list.allium`, and `spec/editor.allium` to cover already implemented modules.

### 6.3 Update Existing Specs For New Contracts

- [ ] Update `spec/function.allium` so `QueryFunction` can declare a key and `ActionFunction` can declare a key-based reactivity plan.
- [ ] Update `spec/api.allium` so `Mutator.invalidates` is compatible with the chosen key-based invalidation migration.
- [ ] Update `spec/authz.allium` to reference rule-backed policy predicates and policy placement planning.
- [ ] Update `spec/lifecycle.allium` to include graph generation, target diagnostics, and generated test-plan artifacts.
- [ ] Update `spec/ui.allium` so UI components/forms can declare enhancement plans, route/resource dependencies, and client-safe auth hints.
- [ ] Update `spec/core.allium` if services/modules become core-adjacent rather than standalone.
- [ ] Update `spec/types.allium`/operation specs to model law metadata for operations and reducers.
- [ ] Update expression/query/action specs to prefer discriminated unions over optional-field catch-all records.
- [ ] Add static path/optic concepts to mapping, patch, form, and editor specs if nested writes become first-class.
- [ ] Add validation plan/error accumulation semantics to UI/forms or a dedicated validation spec.
- [ ] Add state machine/transition graph specs if entity transitions or workflow lifecycle generation become first-class.
- [ ] Add behavioral assertions for TypeScript inference requirements where Allium can express them: inferred entity shape, query/action input/output, form values/errors, route params, key payloads, and requirement/effect bubbling.
- [ ] Mark app-wide provider satisfaction as lifecycle diagnostics rather than TypeScript-only obligations.

### 6.4 Specify Implemented Modules That Still Lack Allium Coverage

- [ ] Specify `src/env` concepts: `EnvVariable`, `EnvSchema`, server-only variables, secrets, defaults, and validation.
- [ ] Specify `src/db` plugin concepts: DB plugin input, store surfaces, dialect helpers, default store aliasing, and capability diagnostics.
- [ ] Specify concrete adapter targets: relational DDL, standard-schema generation, debug artifacts.
- [ ] Specify editor/list/admin current IR and registration rules.
- [ ] Specify CRUD current IR and how it evolves into advanced CRUD.
- [ ] Specify outbox as first-class if events outbox support should be discoverable from `GenContext`.

### 6.5 Capture Type Safety Requirements

- [ ] Audit current specs against the latest source checks, not the stale `spec/REVIEW.md` list.
- [ ] Add missing invariants for wrong-entity fields, target/store capability mismatches, server-only exposure, unsupported query operations, non-static portable definitions, UI slot/capability mismatches, and service requirement failures.
- [ ] Ensure every invariant has either a checker implementation, a planned checker task, or an explicit deferral note.

### 6.6 Spec Authoring Rule

- Write or update the relevant Allium spec no later than the milestone that introduces a new first-class concept.
- Keep `atom_plan.md` as the roadmap and design rationale.
- Keep Allium specs as the implementation contract for agents, checkers, and generated tests.
- Avoid duplicating long prose examples in Allium; encode entities, relationships, invariants, diagnostics, and surfaces.

---

---

## 9. Ongoing Principles

1. **Source of truth**: `gen.func.query` and `gen.func.action` remain canonical. Reactivity, routing, UI, and IVM are interpretation layers.
2. **Static first**: All reactive behavior must be representable as static functions/actions/expressions. No raw string keys. No opaque JS closures in portable definitions.
3. **Target agnostic**: Core remains generic. Effect-TS, React, Vue, Svelte, Solid are targets, not dependencies.
4. **Derived over manual**: Infer invalidation, optimistic patches, and IVM deltas where possible. Manual annotations are refinements/escape hatches.
5. **Progressive enhancement**: Every generated feature declares baseline, enhanced, fallback, and unsupported behavior. Server-first by default.
6. **Capability-driven**: Targets declare capabilities. Generators pick the best plan. Diagnostics report degradation choices.
7. **Conservative correctness**: Favor correctness over minimal invalidation. Broad invalidation is acceptable when precision is unknown.
8. **Auth is relational**: Policies should be expressed as typed rules, not scattered middleware. CRUD generation should inject auth predicates automatically.
9. **Data-first**: Portable definitions are static IR. Runtime behavior is generated from that IR, not embedded as callbacks.
10. **Pipeable composition**: Major values should support `.pipe()` for incremental decoration without central config objects.

---

## Appendix A: Corrected Priority Summary

| Priority    | Item                                                  | Phase | Effort | Status      |
| ----------- | ----------------------------------------------------- | ----- | ------ | ----------- |
| **High**    | Convert `Operation` to discriminated union            | 0     | Medium | Not started |
| **High**    | Fix `createUiNamespace` type bypass                   | 0     | Medium | Not started |
| **High**    | Query builder performance (O(n²) → mutable)           | 0     | Medium | Not started |
| **High**    | Move `bindFromEntity` to prototype/class              | 0     | Medium | Not started |
| **High**    | Add staged action DSL                                 | 1     | Medium | Not started |
| **High**    | Harden `gen.db.*` store plugin surface                | 1     | Medium | Partial     |
| **High**    | Improve `QueryBuilder.select` heterogeneous inference | 2     | Medium | Not started |
| **High**    | Harden public constructor inference                   | 0     | Medium | Not started |
| **High**    | Add requirement/effect bubbling type model            | 0     | Medium | Not started |
| **High**    | Add targeted inference helper types                   | 2     | Small  | Not started |
| **High**    | Add static reactive key model                         | 3.1   | Medium | Not started |
| **High**    | Add `gen.key.*` namespace                             | 3.1   | Small  | Not started |
| **High**    | Add query keys and action invalidation metadata       | 3.1   | Medium | Not started |
| **High**    | Add reactive resource/mutation IR                     | 3.1   | Medium | Not started |
| **High**    | Add reactivity diagnostics and tests                  | 3.1   | Medium | Not started |
| **High**    | Add reactive graph/dataflow graph artifact            | 3.1   | Medium | Not started |
| **High**    | Add semantic tracking scopes                          | 3.1   | Medium | Not started |
| **High**    | Convert variant IR to discriminated unions/ADTs       | 0     | Medium | Not started |
| **Medium**  | Add pipeable composition (`.pipe()`)                  | 1     | Medium | Not started |
| **Medium**  | Standardize naming conventions                        | 1     | Medium | Not started |
| **Medium**  | Context registration audit                            | 1     | Small  | Not started |
| **Medium**  | Add `InferCrud<C>` / `InferActionInput/Output`        | 2     | Small  | Not started |
| **Medium**  | Expand negative type tests                            | 2     | Medium | Not started |
| **Medium**  | Add `@gen/reactivity` package                         | 3.1   | Large  | Not started |
| **Medium**  | Add static invalidation action node                   | 3.1   | Medium | Not started |
| **Medium**  | Add pull/infinite/stream resources                    | 3.1   | Medium | Not started |
| **Medium**  | Add client store adapters                             | 3.1   | Medium | Not started |
| **Medium**  | Add reactive runtime/service layer                    | 3.1   | Medium | Not started |
| **Medium**  | Add `@gen/effect-atom` target                         | 3.1   | Large  | Not started |
| **Medium**  | Add devtools/visualizer graph targets                 | 3.1   | Medium | Not started |
| **Medium**  | Add operation law metadata                            | 2     | Medium | Not started |
| **Medium**  | Add resource/validation applicative composition       | 3.1   | Medium | Not started |
| **Medium**  | Add static paths/optics for mappings and patches      | 3.8   | Medium | Not started |
| **Medium**  | Add `@gen/router` + single-flight                     | 3     | Large  | Not started |
| **Medium**  | Add `@gen/singleflight` package                       | 3.2b  | Medium | Not started |
| **Medium**  | Add `@gen/admin` shell                                | 3     | Medium | Not started |
| **Medium**  | Add hydration/dehydration for reactive resources      | 3     | Medium | Not started |
| **Medium**  | Add advanced mapping-aware CRUD factory               | 3.8   | Large  | Partial     |
| **Medium**  | Add rule evaluation planner                           | 3.5   | Large  | Not started |
| **Medium**  | Add service/module graph                              | 3.4   | Large  | Not started |
| **Medium**  | Add progressive enhancement fallback planner          | 3.6   | Medium | Not started |
| **Low**     | Add `@gen/rules`                                      | 3     | Large  | Not started |
| **Low**     | Add `@gen/services`                                   | 3     | Large  | Not started |
| **Low**     | Add `@gen/hydration`                                  | 3     | Medium | Not started |
| **Low**     | Add `@gen/enhancement`                                | 3     | Medium | Not started |
| **Low**     | Add non-effect-atom reactive targets                  | 3.1   | Large  | Not started |
| **Low**     | Add scoped resource lifecycle                         | 3.1   | Medium | Not started |
| **Low**     | Add derived resources/selectors                       | 3.1   | Medium | Not started |
| **Low**     | Add offline queue/command envelope model              | 3.1   | Medium | Not started |
| **Low**     | Add cross-boundary transport planner                  | 3.6   | Medium | Not started |
| **Low**     | Add partial evaluation for rules and validation       | 3.5   | Medium | Not started |
| **Low**     | Add state machine/transition graph support            | 3.8   | Medium | Not started |
| **Low**     | Automatic invalidation derivation                     | 4     | Large  | Not started |
| **Low**     | Optimistic UI derivation                              | 4     | Large  | Not started |
| **Low**     | IVM                                                   | 4     | Large  | Not started |
| **Ongoing** | Spec alignment                                        | 6     | Medium | Not started |
| **Ongoing** | Testing & quality                                     | 5     | Medium | Not started |

## Appendix B: Already Done (Do Not Re-add)

The following items from earlier backlogs are **already implemented** and should be removed from any parallel tracking:

- ✅ Phantom types on `SemanticType<Ts>`, `Field<Ts>`, `Ref<Ts>`
- ✅ `Expr<Ts, Req, Eff>` with three phantom params
- ✅ `Predicate<Input, Output>` with two phantom params
- ✅ `QueryBuilder<Source, Result>` generic
- ✅ `InferType<T>`, `InferField<F>`, `InferEntity<E>`, `InferQueryResult<Q>`, `InferFieldFromInput<T>`
- ✅ `GenPluginExtensions` and `GenConfig` with declaration merging
- ✅ `RouteHandler` discriminated union
- ✅ `AuthCondition` discriminated union
- ✅ `BrandCapability` branded string unions
- ✅ CRUD derivation (`src/crud/`)
- ✅ DB plugin scaffold with `gen.db.*` helper contribution (`src/db/`)
- ✅ Editor IR with `autoEditor` (`src/editor/`)
- ✅ List view IR (`src/list/`)
- ✅ Lifecycle `moduleCheckers` on `GenContext` (no global singleton)
- ✅ SQL injection fixed in relational adapter (`escapeSqlLiteral`)
- ✅ 35 runtime tests + 4 type-level `.test-d.ts` files
- ✅ No `as never` casts remaining in tests
- ⚠️ One `as unknown as` remains in `src/gen/index.ts:69` (`mergePluginHelpers`)

---

## Appendix C: CRUD as the First Big Integration Point

> Yes — ideally CRUD becomes the **first big integration point** where entities, static expressions, rules, auth, actions, keys, and reactivity all “click” together.

CRUD should not be a separate shortcut system. It should expand into the same IR as everything else.

```txt
CRUD helper
  -> QueryFunction
  -> ActionFunction
  -> Auth policies
  -> Rule predicates
  -> Key families
  -> Reactivity metadata
  -> Forms/lists/routes
  -> Generated tests/docs
```

### The core principle

CRUD should be sugar over canonical primitives:

```txt
Entity:
  User, Project, Membership

Static expr/query/action:
  listProjects, getProject, createProject, updateProject, deleteProject

Rules:
  canViewProject, canCreateProject, canEditProject, canDeleteProject

Auth:
  policies binding rules to read/create/update/delete

Keys:
  project.detail({ id })
  project.list({ filters })
  project.collection()
  project.field.status({ id })

Reactivity:
  create/update/delete invalidates or patches affected keys
```

So `deriveCrud(Project)` should not produce opaque magic. It should produce registered, inspectable functions and metadata.

### What generated CRUD should emit

For an entity like `Project`, CRUD can generate:

```txt
Queries:
  listProjects
  getProjectById
  countProjects
  existsProject

Actions:
  createProject
  updateProject
  deleteProject
  maybe restoreProject / softDeleteProject

Keys:
  project.collection
  project.detail({ id })
  project.list({ filters, actorId? })
  project.count({ filters, actorId? })
  project.exists({ id })
  project.field.<field>({ id })

Auth bindings:
  Project.read
  Project.create
  Project.update
  Project.delete
  Project.field.read/write

Reactivity:
  create invalidates collection/list/count
  update invalidates detail/list fields/rule-derived lists
  delete invalidates detail/list/count
```

And later:

```txt
Forms:
  ProjectCreateForm
  ProjectEditForm

Views:
  ProjectList
  ProjectDetail
  ProjectEditor

Routes:
  /projects
  /projects/:id
  /projects/:id/edit

Tests:
  CRUD allowed/denied cases
  field exposure tests
  invalidation tests
```

### How auth/rules plug in

CRUD should accept or derive policy hooks:

```ts
const projectCrud = gen.crud.derive(Project, {
  access: {
    read: canViewProject,
    create: canCreateProject,
    update: canEditProject,
    delete: canDeleteProject,
    fields: {
      budget: {
        read: canViewProjectBudget,
        write: canEditProjectBudget,
      },
      ownerId: {
        write: canTransferProject,
      },
    },
  },
});
```

This expands into policies:

```txt
Project.read uses canViewProject
Project.create uses canCreateProject
Project.update uses canEditProject
Project.delete uses canDeleteProject
Project.budget.read uses canViewProjectBudget
Project.ownerId.write uses canTransferProject
```

Then CRUD queries/actions consume those policies.

### List CRUD + auth

Generated `listProjects` should not just be:

```txt
SELECT * FROM projects
```

It should be:

```txt
SELECT allowed fields
FROM projects
WHERE user filters
AND authz filter from canViewProject
ORDER/PAGINATE safely
```

The planner must check:

```txt
Can canViewProject become SQL WHERE / RLS?
Can field projections omit unauthorized fields?
Does pagination remain correct?
Are filters allowed on hidden/server-only fields?
```

If not, diagnostics should fire.

High-value diagnostic:

```txt
crud:list-read-policy-not-placeable
```

because CRUD list endpoints are where unsafe post-filtering often sneaks in.

### Get-by-id CRUD + auth

Generated `getProject` can usually be:

```txt
load by id
check canViewProject
return allowed projection
```

Or better, when possible:

```txt
SELECT allowed projection
FROM projects
WHERE id = :id
AND authz predicate
```

Deny mode matters:

```txt
not_found:
  return 404 when actor cannot read

forbidden:
  return 403 when actor cannot read

redact/omit:
  return partial field-safe object
```

CRUD should make this explicit.

### Create CRUD + auth

Create is different because there may be no `before` resource.

Create planning usually needs:

```txt
input shape derived from writable fields
server-only/default fields filled by server
create policy checked against actor + input
field write policies checked
relation link policies checked
insert action generated
created entity returned through read projection
keys invalidated
events/reactions emitted
```

Example:

```txt
createProject writes:
  Project.name
  Project.ownerId
  Project.status

server fills:
  Project.ownerId = actor.id
  Project.status = "draft"

client may provide:
  name only
```

So generated create input should exclude `ownerId` and `status` unless explicitly writable.

### Update CRUD + auth

Update is where rules really matter.

Generated `updateProject` should derive a mutation plan:

```txt
1. Load before Project by id.
2. Check entity update policy canEditProject(actor, before).
3. Derive proposed after Project from patch input.
4. Check field.write policies for changed fields.
5. Check transition policies for before -> after.
6. Apply update with safe WHERE/auth predicate if possible.
7. Return read-safe projection.
8. Invalidate detail/list/rule-derived keys.
9. Emit audit/events/reactions.
```

The generated update input should include only writable fields, but still server-check everything because clients can send forbidden fields.

This is the subtle but powerful part:

```txt
CRUD can derive write-set from the update patch.
Write-set drives auth checks.
Write-set drives reactivity.
Write-set drives audit logs.
Write-set drives reactions.
```

### Delete CRUD + auth

Delete planning should distinguish:

```txt
hard delete
soft delete
archive
status transition
restricted delete
cascade delete
relation unlink
```

Soft delete should probably be modeled as an update/transition:

```txt
Project.deletedAt: null -> now()
```

That lets the same field-write/transition/auth/reactivity machinery apply.

Delete invalidation:

```txt
project.detail({ id })
project.collection.any()
project.list.any()
rule.canViewProject.match({ projectId: id })
```

If soft delete affects visibility rules, rule-derived reactivity should catch that too.

### How keys fit

CRUD should generate standard key families by default.

For `Project`:

```ts
const projectKeys = gen.crud.keys(Project);
// or generated inside deriveCrud

projectKeys.collection();
projectKeys.detail({ id });
projectKeys.list({ actorId, filter, page });
projectKeys.count({ actorId, filter });
projectKeys.field.status({ id });
```

Then generated queries attach keys:

```ts
const listProjects = gen.func.query({
  name: "listProjects",
  input: ListProjectsInput,
  returns: gen.types.array(ProjectSummary),
  body: ...,
  reactivity: {
    key: gen.key.expr((input) => projectKeys.list(input)),
  },
});
```

Generated actions attach invalidation:

```ts
const updateProject = gen.func.action({
  name: "updateProject",
  input: UpdateProjectInput,
  returns: ProjectDetail,
  body: ...,
  reactivity: {
    invalidates: gen.key.patternExpr(({ input, result, writeSet }) => [
      projectKeys.detail({ id: input.id }),
      projectKeys.list.any(),
      projectKeys.count.any(),
      ...gen.reactivity.fromWriteSet(writeSet),
    ]),
  },
});
```

At first, broad invalidation is fine:

```txt
update -> detail exact + list any
create -> collection/list/count any
delete -> detail exact + list/count any
```

Later, make it more precise with write sets and rules.

### How rules improve CRUD reactivity

Suppose the generated list query uses:

```txt
canViewProject(actor, project)
```

And the rule reads:

```txt
Project.visibility
Project.ownerId
ProjectMember
```

Then generated CRUD mutations know:

```txt
update Project.visibility
  affects canViewProject
  affects listProjects
  invalidates projectKeys.list.any()

update Project.ownerId
  affects canViewProject
  affects owner-specific lists
  invalidates projectKeys.list.match({ actorId: oldOwnerId/newOwnerId }) if known

insert ProjectMember
  affects canViewProject
  invalidates projectKeys.list.match({ actorId: userId })
```

That is the integrated story.

### Static expressions are the glue

Static expressions are what let this build safely.

CRUD should use existing expression/action/query IR for:

```txt
where clauses
input validation
field defaults
computed projections
auth predicates
field masks
transition checks
write-set detection
patch generation
return projections
```

Avoid special CRUD-only logic where possible. CRUD should emit normal primitives:

```txt
gen.query.from(...)
gen.action.insert(...)
gen.action.update(...)
gen.action.delete(...)
gen.predicate...
gen.func.query(...)
gen.func.action(...)
gen.authz.policy(...)
gen.key.family(...)
```

That way, all generic checkers and generators still work.

### A concrete CRUD pipeline

For `deriveCrud(Project)`:

```txt
1. Inspect entity fields and traits.
2. Inspect mappings/projections.
3. Inspect access policies/rules.
4. Derive input types:
   - create input
   - update patch input
   - filters
   - sort/page input
5. Derive queries:
   - list
   - getById
   - count/exists
6. Derive actions:
   - create
   - update
   - delete/softDelete/restore
7. Attach auth:
   - query filters
   - action checks
   - field read/write policies
8. Attach keys:
   - collection/list/detail/count/field keys
9. Attach reactivity:
   - invalidation from operation kind
   - later from write-set + rule deps
10. Register everything in GenContext.
11. Generate diagnostics, tests, docs, routes/forms/views if requested.
```

### The “it all builds” dependency chain

Yes, it all builds if the layers are clean:

```txt
Entity
  defines fields, ids, mappings, traits

Expr / Predicate
  defines typed logic over fields and inputs

Rule
  names reusable predicates

Authz
  binds rules to access surfaces

CRUD
  expands entity + auth + mappings into queries/actions

Keys
  identify CRUD resources and rule results

Reactivity graph
  connects CRUD reads/writes/rules/keys

Targets
  generate DB/API/UI/cache/tests from the same IR
```

That is the architecture.

### Suggested CRUD API shape

Something like:

```ts
const projectCrud = gen.crud.derive(Project, {
  projection: {
    summary: ProjectSummary,
    detail: ProjectDetail,
  },

  access: {
    read: canViewProject,
    create: canCreateProject,
    update: canEditProject,
    delete: canDeleteProject,

    fields: {
      budget: {
        read: canViewProjectBudget,
        write: canEditProjectBudget,
      },
      ownerId: {
        write: canTransferProject,
      },
    },
  },

  behavior: {
    delete: "soft",
    timestamps: true,
    versioning: true,
  },

  reactivity: {
    keys: "derive",
    invalidation: "derive-conservative",
  },
});
```

It returns something like:

```ts
projectCrud.queries.list;
projectCrud.queries.getById;
projectCrud.actions.create;
projectCrud.actions.update;
projectCrud.actions.delete;
projectCrud.keys.list;
projectCrud.keys.detail;
projectCrud.forms.create;
projectCrud.forms.edit;
projectCrud.routes.list;
projectCrud.routes.detail;
```

### Diagnostics CRUD should add

```txt
crud:missing-read-policy
crud:list-read-policy-not-placeable
crud:hidden-field-exposed
crud:server-only-field-exposed
crud:field-not-writable
crud:generated-input-overpermits-field
crud:update-needs-before-state
crud:delete-policy-not-enforced
crud:relation-include-unauthorized
crud:sort-field-not-readable
crud:filter-field-not-readable
crud:key-not-declared
crud:invalidation-broadened
crud:optimistic-unsafe
```

### Bottom line

CRUD is where the architecture becomes obviously useful.

Instead of hand-writing CRUD and separately remembering auth, validation, keys, invalidation, forms, and tests, CRUD becomes a compiler expansion:

```txt
Entity + Rules/Auth + Static Expr + Mappings
  -> safe queries/actions
  -> generated inputs/projections
  -> generated keys
  -> derived reactivity
  -> generated UI/routes/forms/tests
```

And because it expands to the same canonical IR, it does not become a dead-end abstraction. It becomes the easiest way to produce a correct full-stack slice.

---

## Appendix D: Schema Evolution and Migrations

> Yes — if the library wants to model the app as static IR, then **schema evolution has to be first-class**.

Not necessarily “every migration must be fully inferred,” but the system should represent migrations as typed, inspectable, data-driven plans.

The right philosophy is probably:

```txt
Entities describe the current semantic model.
Versions describe historical semantic models.
Mappings describe how semantic models map to storage.
Migrations describe how storage/data moves between versions.
Checkers verify that generated targets and app code agree.
```

### The short answer

I would add a new core area:

```txt
@gen/schema
@gen/migration
@gen/versioning
```

Or one package:

```txt
@gen/evolution
```

Its purpose:

```txt
Track entity/schema versions,
compare versions,
generate migration plans,
represent manual data transforms as typed IR,
verify compatibility,
and produce target-specific migration artifacts.
```

### Do entities need versions?

Yes. I think entities should support versions.

But be careful: there are multiple kinds of versions.

```txt
Entity model version:
  The semantic shape of User/Project/Invoice changed.

Storage schema version:
  The database table/columns/indexes changed.

API contract version:
  The input/output shape clients see changed.

Data migration version:
  The persisted data was transformed.

Projection/view version:
  A generated client/view/form output changed.
```

You do not want to collapse all of those into one global integer. But you do want a coherent evolution model.

I’d give each important schema artifact a stable identity and version history:

```ts
const Project = gen.entity("Project", {
  version: 3,
  fields: {
    id: gen.field.uuid(),
    name: gen.field.string(),
    status: gen.field.enum(["draft", "active", "archived"]),
    archivedAt: gen.field.optional(gen.types.datetime()),
  },
});
```

Versions may be integers or strings — e.g. `version: 3`, `version: "2024.06"`, or `version: "2.1.0"`. Strings are useful for semantic versions, named milestones, or timestamp-based snapshots.

But the version alone is not enough. You also need the previous snapshots or declared changes.

### There are two approaches

#### 1. Diff-driven migrations

The system compares old IR and new IR:

```txt
Project v2:
  status: "draft" | "active"

Project v3:
  status: "draft" | "active" | "archived"
  archivedAt?: Date
```

Then it suggests:

```txt
add nullable column archived_at
alter status enum
no data backfill required
```

Good for simple structural changes.

#### 2. Declared migrations

The developer explicitly declares the semantic change:

```ts
gen.migration.define({
  name: "addProjectArchival",
  from: Project.version(2),
  to: Project.version(3),
  steps: [
    gen.migration.addField(Project.fields.archivedAt, {
      nullable: true,
    }),
    gen.migration.extendEnum(Project.fields.status, ["archived"]),
  ],
});
```

Necessary for data transforms and ambiguous changes.

The best system supports both:

```txt
diff suggests
developer confirms or overrides
migration becomes explicit IR
```

Generated migrations should not be silent magic.

### Should migrations be spelled out exactly?

For production: yes, the final migration plan should be explicit.

The compiler can infer candidates, but the committed migration should be inspectable.

Good flow:

```txt
1. Developer changes entity IR.
2. Compiler compares previous snapshot to current model.
3. Compiler proposes migration steps.
4. Developer accepts/edits plan.
5. Migration is stored as static IR.
6. Targets generate SQL/Prisma/Drizzle/etc.
7. Checker verifies app model and migration history agree.
```

That gives you both convenience and safety.

### Append-only schemas?

Append-only is a great recommendation, but not a universal rule.

I’d model schema changes by safety level:

```txt
append_safe:
  add nullable field
  add field with default
  add enum value
  add table
  add index concurrently
  add optional relation

compatible_transform:
  rename with mapping
  split field with backfill
  merge fields with reversible transform
  change type with parser/formatter

breaking:
  remove field
  make nullable field required without default
  narrow enum
  change id type
  destructive data rewrite
  drop table
```

Then the checker can say:

```txt
This migration is append-safe.
This migration requires backfill.
This migration is breaking for API clients.
This migration is destructive and needs explicit approval.
```

For most users, recommend:

```txt
Prefer append-only semantic evolution.
Deprecate before removing.
Use projections to hide old fields.
Use mappings to bridge old storage to new semantics.
Make destructive migration explicit.
```

That is a practical philosophy.

### Mappings are essential

Yes, mappings are the key to making evolution sane.

You want to separate:

```txt
semantic entity shape
from
physical storage shape
```

Example:

```txt
Semantic Project.name
  maps to database column projects.name
```

If you rename the semantic field:

```txt
Project.title
```

You do not necessarily need to rename the database column immediately.

You can map:

```ts
gen.mapping.field(Project.fields.title, {
  storage: projects.columns.name,
  since: "Project@v4",
  previousNames: ["name"],
});
```

This avoids unnecessary database churn and helps migrations.

### Stable IDs matter more than names

This is where “sigils” or stable identity comes in.

Field names change. Entity names change. Tables move. But the compiler needs to know whether something was renamed or replaced.

So every entity/field/relation should have a stable identity.

Maybe not user-visible sigils, but internally:

```ts
const Project = gen.entity("Project", {
  id: "ent_project", // stable
  fields: {
    title: gen.field.string({
      id: "fld_project_name", // stable, even though renamed from name -> title
      previousNames: ["name"],
    }),
  },
});
```

Or a helper:

```ts
gen.field.string().stable("project.name");
```

I would not make ugly sigils required everywhere, but I would support stable IDs and strongly recommend them for persisted entities.

Why it matters:

```txt
rename field:
  same stable ID, new name

drop + add field:
  different stable ID

migration planner:
  can distinguish rename from deletion
```

Without stable IDs, a diff engine cannot safely tell rename from delete/add.

### Entity versions plus field lineage

Versioning should be more than `version: 3`.

You want lineage metadata:

```ts
gen.field.string({
  id: "fld_project_title",
  since: "Project@3",
  renamedFrom: ["name"],
  deprecated: false,
});
```

For removed fields:

```ts
gen.entity("Project", {
  version: 4,
  removedFields: [
    gen.schema.removedField({
      id: "fld_project_legacyCode",
      name: "legacyCode",
      removedIn: "Project@4",
      migration: "dropLegacyProjectCode",
    }),
  ],
});
```

That helps check old migrations, old API projections, and generated compatibility layers.

### Data-driven migration primitives

Yes: support TypeScript type-safe, data-driven migrations.

But make them static IR, not arbitrary imperative code by default.

Core primitives:

```txt
createEntity / createTable
dropEntity / dropTable

addField
dropField
renameField
copyField
moveField
splitField
mergeFields
changeFieldType
changeNullability
setDefault
backfill
addIndex
dropIndex
addConstraint
dropConstraint
addRelation
dropRelation
renameRelation

transformRows
assertInvariant
validateBackfill
markDeprecated
removeDeprecated
```

The common ones can be pure static records.

Example:

```ts
const addArchivedAt = gen.migration.define({
  name: "addArchivedAtToProject",
  from: Project.v(2),
  to: Project.v(3),
  steps: [
    gen.migration.addField(Project.fields.archivedAt, {
      nullable: true,
      storage: {
        column: "archived_at",
        type: "timestamp",
      },
    }),

    gen.migration.extendEnum(Project.fields.status, {
      values: ["archived"],
    }),
  ],
});
```

### Typed transforms

For real data transforms, you need typed expressions.

Example: split `fullName` into `firstName` and `lastName`.

```ts
const splitUserName = gen.migration.define({
  name: "splitUserFullName",
  from: User.v(1),
  to: User.v(2),
  steps: [
    gen.migration.addField(User.fields.firstName),
    gen.migration.addField(User.fields.lastName),

    gen.migration.backfill(User, {
      set: {
        firstName: gen.expr.split(User.v(1).fields.fullName, " ").at(0),
        lastName: gen.expr.split(User.v(1).fields.fullName, " ").rest().join(" "),
      },
    }),

    gen.migration.dropField(User.v(1).fields.fullName),
  ],
});
```

That is type-safe and inspectable.

If a transform cannot be expressed statically, allow an escape hatch:

```ts
gen.migration.custom({
  name: "normalizeLegacyAddresses",
  input: OldAddress,
  output: NewAddress,
  effects: [DatabaseWrite],
  opaque: true,
  reviewRequired: true,
});
```

But mark it as opaque and less portable.

### Migration plans should be composable

You want composable primitives:

```ts
gen.migration.sequence([addArchivedAt, backfillArchivedProjects, makeArchivedAtIndexed]);

gen.migration.parallel([addProjectIndexes, addUserIndexes]);

gen.migration.transaction([addColumn, backfill, addConstraint]);
```

But with safety constraints:

```txt
Some steps cannot be transactional.
Some steps require two-phase rollout.
Some steps require online migration.
Some steps require backfill before constraint.
Some steps require app compatibility window.
```

So migration IR should support rollout plans.

### Two-phase and multi-phase migrations

Production-safe migrations often require phases:

```txt
Phase 1:
  add nullable column

Phase 2:
  deploy app writing both old and new fields

Phase 3:
  backfill old rows

Phase 4:
  switch reads to new field

Phase 5:
  enforce NOT NULL / constraints

Phase 6:
  stop writing old field

Phase 7:
  drop old field later
```

The library should model this explicitly.

Example:

```ts
gen.evolution.renameField({
  entity: Project,
  from: Project.v(2).fields.name,
  to: Project.v(3).fields.title,
  rollout: "expand_migrate_contract",
});
```

This expands to:

```txt
add new column title
dual-write name/title
backfill title from name
read from title with fallback to name
validate title not null
stop writing name
drop name later
```

This is much safer than a naive rename.

### Current, previous, and compatibility models

You probably need versioned entity references:

```ts
Project.current;
Project.v(1);
Project.v(2);
Project.v(3);
```

And compatibility projections:

```ts
ProjectV1Api = gen.projection(Project.v(1), ...)
ProjectCurrentApi = gen.projection(Project.current, ...)
```

This lets you support old API clients while the domain moves forward.

### Versioned semantic types

Semantic types also evolve.

Example:

```txt
status: enum ["draft", "active"]
status: enum ["draft", "active", "archived"]
status: enum ["draft", "active", "archived", "deleted"]
```

Or:

```txt
price: number
price: money
```

So migrations should understand type evolution:

```ts
gen.migration.changeType({
  field: Product.fields.price,
  from: gen.types.number(),
  to: gen.types.money({ currency: "USD" }),
  transform: gen.expr.moneyFromNumber(Product.v(1).fields.price, "USD"),
});
```

Type changes should require a transform unless the system knows a safe widening.

### Schema compatibility checker

Add a checker that classifies changes:

```txt
compatible
requires_migration
requires_backfill
requires_dual_write
requires_api_version
destructive
unsafe
```

For example:

```txt
Add optional field:
  compatible, migration needed

Add required field without default:
  unsafe, requires backfill/default

Rename field with stable ID:
  compatible with mapping, migration optional

Remove field:
  breaking, requires deprecation window

Narrow enum:
  breaking, requires data audit

Change string -> int:
  unsafe unless transform provided
```

### Integration with CRUD

CRUD should be version-aware.

If a field is deprecated:

```txt
hide from new forms
maybe still read in old projections
block writes unless compatibility mode
generate migration warning
```

If a field is added:

```txt
create input includes it only if writable
update input includes it if field.write policy allows
list/detail projections include it based on projection config
keys/invalidation include it if rules depend on it
```

If a field is required:

```txt
create input requires it unless default/server-filled
backfill required for existing rows
```

CRUD generation should consult evolution metadata.

### Integration with auth/rules

Rules may refer to fields that changed.

Example:

```txt
canEditProject depends on Project.status
```

If `Project.status` enum changes, the checker should ask:

```txt
Does canEditProject handle the new status?
Do transition rules handle it?
Do generated tests include it?
```

If a field used in a policy is removed:

```txt
authz policy broken
list filter broken
client hints broken
```

That should be a hard diagnostic unless a mapping/compatibility rule exists.

### Integration with keys/reactivity

Schema changes affect keys too.

Examples:

```txt
Changing Project.id type:
  affects project.detail key payload

Changing list filter input:
  affects project.list key payload

Renaming field used in rule:
  affects rule-derived invalidation

Adding archivedAt:
  may affect visible list keys if list filters exclude archived
```

Key families should be versioned or stable.

```ts
const projectDetailKey = gen.key.family("project.detail", {
  version: 1,
  input: gen.types.object({ id: Project.fields.id.type }),
});
```

If key payload changes, the system should detect cache compatibility:

```txt
key payload compatible
key payload changed, cache bust required
key family renamed with alias
key family incompatible
```

This matters for hydration, offline queues, persisted caches, and client stores.

### Integration with events and reactions

Migrations can also affect event schemas.

If you have:

```txt
ProjectCreated v1
ProjectUpdated v2
```

then events should have schema versions too.

For reactions:

```txt
project became overdue
```

If `dueDate` changes type or `status` enum changes, the reaction must be rechecked.

### Suggested migration IR

Something like:

```ts
interface SchemaVersion<Name extends string = string> {
  readonly kind: "schema_version";
  readonly name: Name;
  readonly entities: readonly Entity[];
  readonly mappings: readonly StorageMapping[];
  readonly createdAt?: string;
}

interface Migration<From = unknown, To = unknown> {
  readonly kind: "migration";
  readonly name: string;
  readonly from: SchemaVersionRef<From>;
  readonly to: SchemaVersionRef<To>;
  readonly steps: readonly MigrationStep[];
  readonly rollout?: RolloutPlan;
  readonly safety: MigrationSafety;
  readonly checks?: readonly MigrationCheck[];

  readonly _from?: From;
  readonly _to?: To;
}
```

Step union:

```ts
type MigrationStep =
  | AddEntityStep
  | DropEntityStep
  | RenameEntityStep
  | AddFieldStep
  | DropFieldStep
  | RenameFieldStep
  | ChangeFieldTypeStep
  | ChangeNullabilityStep
  | SetDefaultStep
  | BackfillStep
  | CopyFieldStep
  | SplitFieldStep
  | MergeFieldStep
  | AddIndexStep
  | DropIndexStep
  | AddConstraintStep
  | DropConstraintStep
  | AddRelationStep
  | DropRelationStep
  | CustomMigrationStep;
```

### Rollout plans

Add first-class rollout modes:

```txt
offline_transactional
online_expand_contract
online_backfill
dual_write
read_fallback
shadow_write
validate_then_cutover
manual_custom
```

Example:

```ts
gen.migration.renameField({
  entity: Project,
  from: "name",
  to: "title",
  strategy: "online_expand_contract",
});
```

### Safety levels

```txt
safe
  no data loss, backward compatible

requires_backfill
  safe if backfill succeeds

requires_dual_write
  needs compatibility deployment window

breaking
  app/API clients must update

destructive
  data loss possible

opaque
  custom code, cannot fully verify
```

Generated migration should carry safety metadata.

### Should users write raw SQL?

Yes, but as an escape hatch.

You need this because real migrations get weird.

But raw SQL should be wrapped:

```ts
gen.migration.rawSql({
  dialect: "postgres",
  sql: "...",
  safety: "manual_review",
  affects: [Project.fields.status, Project.indexes.projectStatusIdx],
});
```

Require the developer to declare what it affects, so the graph and checker stay useful.

### Diagnostics

Important diagnostics:

```txt
schema:field-removed-without-migration
schema:required-field-added-without-default
schema:enum-narrowed-without-data-audit
schema:type-change-without-transform
schema:rename-ambiguous-without-stable-id
schema:mapping-missing-for-field
schema:storage-column-orphaned
schema:entity-version-gap
schema:migration-order-invalid
schema:backfill-required
schema:destructive-migration-needs-approval
schema:raw-sql-affects-undeclared
schema:key-payload-changed
schema:rule-references-removed-field
schema:crud-input-incompatible
schema:api-breaking-change
schema:offline-cache-incompatible
```

### Agent-era advantage

This is another area where the library becomes agent-native.

An agent can make a semantic change:

```txt
Rename Project.name to Project.title.
Keep old API clients working for one release.
```

Compiler produces:

```txt
stable field lineage
new semantic field
storage mapping
compat projection
dual read/write plan
backfill migration
deprecated old projection
tests
diagnostics
```

That is much safer than an agent editing migrations, models, forms, and handlers by hand.

### Recommended initial implementation

Do not start with full migration magic.

Start with four pieces.

#### 1. Stable IDs and snapshots

Every persisted entity, field, relation, and key family should have stable identity.

Store previous IR snapshots:

```txt
.gen/snapshots/schema-v1.json
.gen/snapshots/schema-v2.json
```

#### 2. Diff checker

Compare previous/current IR and classify changes:

```txt
add optional field
remove field
rename maybe
type changed
enum widened/narrowed
requiredness changed
mapping changed
key payload changed
```

#### 3. Explicit migration IR

Let users define:

```txt
add field
rename field
change type with transform
backfill
drop field
raw SQL escape hatch
```

#### 4. Target generator

Generate Postgres migrations first.

Do not support every storage target immediately.

### My preferred design

I would make schema evolution a first-class graph:

```txt
EntityVersionGraph
  entity versions
  field lineage
  relation lineage
  mapping versions
  projection versions
  key versions
  migration edges
```

Each migration is an edge:

```txt
Schema v3 -> Schema v4
```

Each edge has:

```txt
steps
safety classification
data transforms
rollout plan
target artifacts
checks
diagnostics
```

That fits the rest of the library perfectly.

### Bottom line

Yes, support migrations. But do it in this order:

```txt
1. Stable identities for entities/fields/relations/keys.
2. Versioned schema snapshots.
3. Diff classification.
4. Explicit typed migration IR.
5. Storage mappings and lineage.
6. Generated SQL migrations.
7. Backfills and transforms using Expr/Action IR.
8. Online rollout plans.
9. API/key/cache compatibility checks.
10. Agent-friendly migration suggestions.
```

The big philosophy:

```txt
Prefer append-only changes.
Model renames and transforms explicitly.
Keep stable IDs separate from names.
Use mappings to avoid unnecessary physical churn.
Require explicit plans for destructive changes.
Represent migrations as typed IR, not just SQL strings.
```

That would make schema evolution feel like part of the same system, not an afterthought.

---

## 0.13 Post-Breadth Milestones

These items were identified during an in-depth review of the implementation against the spec. They close gaps between the current codebase and the full design intent.

### 0.13.1 `KeyExpression` / `KeyPatternExpression` Wrappers

The spec (§0.7) says public reactivity APIs **must** accept `KeyExpression` or `KeyPatternExpression`, not arbitrary raw expressions. Currently `QueryReactivity.key` accepts `KeyFamily | ReactiveKey` directly.

**Scope**:

- Add `KeyExpression<Input, Key>` and `KeyPatternExpression<Input, Pattern>` wrapper types.
- Update `QueryFunction.reactivity.key` and `ActionFunction.reactivity.invalidates` to use the wrappers.
- Enforce that the expression's input type matches the function's input type at the type level.
- Unlock diagnostics: `reactivity:query-key-output-invalid`, `reactivity:invalidates-output-invalid`, `reactivity:raw-key-not-portable`.

**Effort**: Medium | **Impact**: Spec compliance, type safety

### 0.13.2 `ResourceAll` and `ResourceChain` Composition

The spec defines parallel and dependent resource composition primitives. They are currently missing from the implementation.

**Scope**:

- Add `ResourceAll` and `ResourceChain` IR records.
- Add `gen.reactivity.all({ ... })` and `gen.reactivity.chain(source, derive)` constructors.
- Derive `composes` (parallel) and `sequences` (dependent) edges in `deriveReactiveGraph`.
- Update TanStack Query target to generate `useQueries` for `ResourceAll`.
- Update Effect-Atom target to generate dependent atom chains for `ResourceChain`.

**Effort**: Medium | **Impact**: Unlocks composed loader patterns for all targets

### 0.13.3 `OptimisticPlan` IR

Optimistic mutations are currently stubbed (`PatchFunction` exists but no explicit `OptimisticPlan`).

**Scope**:

- Add `OptimisticPlan<Input, Output>` with `apply`, `rollback`, `reconcile`, `fallback`, and `diagnostics`.
- Derive conservative optimistic plans automatically for simple CRUD updates (rollback: `"inverse"` when all fields are reversible).
- Wire into `ActionFunction` and reactive targets so generated mutations can include optimistic UI behavior.
- Add diagnostic: `reactivity:optimistic-unreconcilable`.

**Effort**: Medium | **Impact**: Safer generated mutations, better CRUD UX

### 0.13.4 Harden Reactive Graph Guards

The current `isQueryFunction` and `isActionFunction` guards in `src/reactivity/reactivity.ts` are too loose (they only check `name` and `body`).

**Scope**:

- Replace loose guards with discriminant checks (`body.operations`, `body.result_type`, `body.phase === "mutation"`).
- Add runtime assertion diagnostics when graph derivation encounters an unexpected node kind.
- Prevent silent graph corruption (e.g., treating a `StaticFunction` as a `QueryFunction`).

**Effort**: Low | **Impact**: Safety, correctness

### 0.13.5 Extract Rule Placement from Authz into Rules Module

Rule placement logic currently lives in `src/authz/placement.ts`, but the spec says `@gen/rules` owns logical predicates and `@gen/authz` consumes them.

**Scope**:

- Move `classifyPlacement` for `RuleExpr` into `src/rules/placement.ts`.
- Keep access-surface-specific concerns in `src/authz/placement.ts` as a thin wrapper.
- Ensure query planners and IVM systems can import rule placement without pulling in authz semantics.
- Add rule-level placement diagnostics: `rules:not-sql-translatable`, `rules:not-rls-translatable`, `rules:client-hint-not-exact`.

**Effort**: Medium | **Impact**: Architectural cleanliness, enables planner reuse

### 0.13.6 Compile-Time Negative Tests for Key Payloads

The spec lists several `@ts-expect-error` cases that are not yet covered in `.test-d.ts` files.

**Scope**:

- Add `tests/key-payload-negative.test-d.ts` covering:
  - Invalid key family payload (wrong field type).
  - `.match()` with an unknown key payload field.
  - Resource mutation called with invalid input.
  - Route param missing from schema.
  - Form field not present in action input.
- Ensure these tests fail if the type system ever stops catching the errors.

**Effort**: Low | **Impact**: Regression prevention for phantom types

### 0.13.7 Document Design Intent in Complex Modules

Several algorithms carry design intent that is only visible in `atom_plan.md`. Inline comments should explain the "why".

**Scope**:

- Add design-note comments to `src/reactivity/rule-derived.ts` explaining precision leveling (why Level 3 requires simple equality + single-field write).
- Add design-note comments to `src/authz/mutation-plan.ts` explaining `beforeState` / `afterState` lifecycle.
- Add design-note comments to `src/authz/placement.ts` explaining placement preference ordering (rule predicate → legacy AuthCondition → none).
- Target: one concise comment per non-trivial algorithm.

**Effort**: Low | **Impact**: Onboarding, maintenance

### 0.13.8 Unified Reactivity Registry

`key_families`, `reactive_resources`, and `reactive_mutations` are separate arrays in `GenContext`. A unified registry could enforce cross-references and simplify target discovery.

**Scope**:

- Add `ReactivityRegistry` interface holding families, resources, mutations, and derived graph artifacts.
- Add `ctx.reactivity_registry` or `gen.reactivity.registry`.
- Enforce invariants at registration time (e.g., a resource's `query` must exist in `query_functions`).
- Migrate existing arrays; keep backward-compatible accessors during transition.

**Effort**: Medium | **Impact**: Future-proofing, reduces drift between arrays

---

_Last updated: 2026-04-29_
