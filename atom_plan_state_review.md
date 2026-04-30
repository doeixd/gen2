# Current State vs Atom Plan Review

This document compares the current repository state against `atom_plan.md` as of this review. It focuses on the atom/reactivity roadmap, but also notes adjacent implementation that materially changes the plan: router, hydration, services, rules, rule-derived reactivity, CRUD integration, and target generation.

## Executive Summary

The implementation is substantially ahead of the `atom_plan.md` embedded snapshot. The plan still says `src/reactivity/`, `gen.key.*`, `gen.reactivity.*`, typed routes, hydration, services, and rules are not built, but the repository now has initial versions of all of these.

The work is directionally correct and preserves the main architectural taste of `spec/atom.txt`: atoms are a target, not the core abstraction; `gen.func.query` and `gen.func.action` remain the source of truth; reactivity is an interpretation layer; and the compiler should derive a portable dependency/invalidation/dataflow graph from static functions, schemas, mappings, relations, rules, patches, services, routes, and runtime boundaries.

The biggest issue is that several milestones have been implemented as broad first slices before their foundation is fully precise. In particular, key families are typed by phantom payload only, runtime key expressions are shallow records rather than expression ASTs, target generators operate mostly on graph node names, and graph edges currently lose enough payload/input/output detail that generated target code is illustrative rather than usable.

My read: this is a good prototype layer, not yet a stable semantic IR layer. The next best move is not to add more targets or larger features. It is to tighten R1/R2 correctness and representation so everything above it has a solid address space.

## Additional Design Pressure From `spec/atom.txt`

`spec/atom.txt` is not just an Effect Atom API survey. It contains several architectural rules that should shape the next implementation slices.

- **Atoms are a target, not the model.** Effect Atom concepts map well to Gen targets (`Atom.family`, `Atom.fn`, `Atom.runtime`, `Atom.withReactivity`, `Atom.pull`, `Atom.searchParam`, `Atom.kvs`), but core Gen should stay target-agnostic.
- **Reactivity should be derived first.** Manual keys are necessary for opaque/external boundaries, but routine invalidation should come from static query reads, action writes, mappings, relations, projections, rules, operation laws, events, and runtime/store boundaries.
- **Manual reactivity is a typed refinement, not raw strings.** The escape hatch should still use typed key families, key patterns, and static invalidation expressions.
- **Key families are semantic address spaces.** They should support exact keys, `.any()`, `.match(partial)`, hierarchy (`entity`, `collection`, `field`, `relation`, `view`, `custom`), and batching semantics.
- **Tracking scopes matter.** Render, memo, loader, resource, effect, action, form, and route scopes should record semantic key/resource reads so components and route loaders can appear in the graph without direct references.
- **Resource states should be Result-like.** `initial`, `loading`, `success`, `refreshing`, `failure`, and `defect` matter because targets map them differently but UI needs one semantic state model.
- **Static invalidation actions are first-class.** `gen.reactivity.invalidate(...)` should eventually be an analyzable `ActionExpr` node, not a target-specific runtime call.
- **Rules improve derivation.** Datomic-style rules, auth policies, and derived views should make dependencies visible so reactivity/IVM can be derived instead of manually annotated.
- **CRUD is a macro over static IR.** CRUD should emit real query/action functions that participate in mapping checks, policies, reactivity derivation, optimistic plans, IVM, forms, routes, clients, tests, and visualizers.
- **Progressive enhancement and capability ladders are part of correctness.** Generated artifacts should declare baseline, enhanced, fallback, and unsupported behavior instead of silently picking target behavior.

These points strengthen, rather than replace, the review’s main recommendation: harden the typed static reactivity model before adding deeper target generation.

## What Changed Since The Plan Snapshot

`atom_plan.md` lines 1391-1415 list most atom/reactivity work as not built. That is now stale.

Implemented or partially implemented now:

- `src/reactivity/` exists with `KeyFamily`, `ReactiveKey`, `ReactiveKeyPattern`, `KeyExpression`, `KeyPatternExpression`, resources, mutations, graph derivation, optimistic plans, graph queries, SingleFlight plan derivation, and lifecycle check helpers.
- `gen.key.*` exists: `family`, `entity`, `collection`, `custom`, `key`, `any`, `match`, `expr`, and `patternExpr`.
- `gen.reactivity.*` exists: resources, mutations, resource composition, graph derivation, graph artifacts, affected-node queries, SingleFlight, rule invalidation, IVM plan stubs, editability helpers, optimistic plan checks, and refresh constructors.
- `QueryFunction.reactivity.key` and `ActionFunction.reactivity.invalidates` exist, with legacy `ActionFunction.invalidates: QueryFunction[]` lowering.
- `GenContext` registers key families, reactive resources, reactive mutations, resource compositions, app routes, services, rules, and reactions.
- `deriveCrud` now creates default entity/detail and collection/list key families, attaches reactivity keys and invalidation metadata through CRUD output, and registers generated functions.
- `src/router/` exists with typed app routes, route param schemas, loaders/actions, and link generation.
- `src/hydration/`, `src/services/`, `src/rules/`, and `src/reaction/` exist and are wired into `gen` and `GenContext`.
- Effect Atom and TanStack Query target plugins exist under `src/reactivity/targets/`.
- Runtime and type tests now include reactivity, router, hydration, services, rule reactivity, rules, and target-adjacent graph behavior.

## Milestone Status

### R1 Static Key Model And `gen.key.*`

Status: partially done.

What is good:

- `KeyFamily<Payload>`, `ReactiveKey<Payload>`, and `ReactiveKeyPattern<Payload>` are static inspectable records.
- `gen.key.family`, `gen.key.entity`, `gen.key.collection`, `gen.key.custom`, `gen.key.key`, `gen.key.any`, and `gen.key.match` are present.
- Key family payload types are preserved enough for type-level negative tests such as invalid payload fields and wrong payload value types.
- Key families are registered in `GenContext`, including families created through CRUD defaults.

Gaps:

- The public API differs from the plan’s intended callable family shape. A `KeyFamily` is not callable and does not expose `.any()` / `.match(partial)`. Users instead call `gen.key.key(family, payload)`, `gen.key.any(family)`, and `gen.key.match(family, partial)`. This is acceptable as a first slice but less ergonomic and less domain-shaped than the plan.
- `defineKeyFamily` accepts only a phantom payload generic and optional id/description. It does not accept an `input` semantic type, so payload conformance is compile-time only and not inspectable at runtime.
- Because payload shape is phantom-only, `checkReactivity` cannot really validate `reactivity:key-payload-mismatch` or unknown `.match()` fields. It currently can only warn about empty match objects.
- `entityKeyFamily` hardcodes `{ id: string }`, ignoring the actual entity id field semantic type. That is expedient but weakens one of the project’s core promises: inference from model references.
- Key hierarchy is implicit in names (`User:entity`, `User:collection`) rather than represented as a first-class `hierarchy` field as described in the spec draft.
- There is no registry object that groups key families into a typed domain-specific key namespace, even though `spec/atom.txt` repeatedly points to `Atom.family` and typed registries as the right mental model.
- Parent/child invalidation and batching semantics are not modeled. The graph treats invalidation mostly as family-level relationships.

Recommendation:

- Keep the current helpers but add runtime `input_type` to `KeyFamily<Payload>`. Let `gen.key.family(name, { input })` infer `Payload` from `SemanticType<Payload>`, while retaining generic-only usage only if there is a concrete reason.
- Add callable/sugar family wrappers later if desired, but do not rush. The important fix is inspectable payload shape, not syntax.
- Derive entity key payload from the entity’s id field once the id-field convention is explicit. Until then, prefer making id-field selection explicit over pretending all ids are strings.
- Add hierarchy and batching semantics before implementing more target logic. Targets need to know whether invalidating an entity key refreshes collection readers, field readers, relation readers, or only exact readers.
- Add `gen.reactivity.registry(...)` after key families carry runtime schemas. Registry ergonomics are useful, but a registry over phantom-only families would cement the wrong foundation.

### R2 Query And Action Reactivity Metadata

Status: partially done and directionally correct.

What is good:

- `QueryFunction` has nested `reactivity?: { key }` metadata.
- `ActionFunction` has nested `reactivity?: { invalidates }` metadata.
- Existing `invalidates: QueryFunction[]` is still present and lowers to key-family invalidation when the query has a reactivity key.
- `checkFunctions` emits `function:legacy-invalidation-without-query-key` when legacy invalidation cannot lower.
- `defineQueryFunction` and `defineActionFunction` accept ergonomic sugar and normalize to `KeyExpression` / `KeyPatternExpression`.

Gaps:

- `KeyExpression` and `KeyPatternExpression` are wrappers, but not true static expression ASTs. They carry `family` and optional concrete `payload` / `patterns`; they do not model mutation input/result/context -> key patterns.
- `ActionReactivity<Input, Payload>` has only one `Input` parameter and no output/result context. The plan’s canonical example uses `({ result }) => [...]`, but the implementation cannot represent that statically yet.
- `KeyPatternExpression` stores concrete patterns, so the type says “expression” but the data model is closer to “constant pattern declaration”. That is fine as a seed, but misleading once target generation tries to support real mutations.
- The action invalidation type is generic over a single payload. Multiple key families with different payloads are only supported after widening to the broad `KeyPayload` shape. That loses precision quickly.
- The compatibility rule exists for `ActionFunction.invalidates`, but the plan also calls out `Mutator.invalidates`; I did not see equivalent lowering on `Mutator`.
- There is no `infer: true | false`, `alsoInvalidates`, or precision policy shape even though `spec/atom.txt` frames manual invalidation as a refinement of derived reactivity, not the only mechanism.
- There is no static `gen.reactivity.invalidate(...)` action node, so invalidation inside action sequences is not yet analyzable.

Recommendation:

- Split constant key declarations from real expressions. For example, `ConstantKeyExpression` / `ConstantKeyPatternExpression` can be the current shape, while future expression-backed forms can carry `ExprFunction` or a dedicated key AST.
- Make invalidation plans generic over action input and output: `KeyPatternExpression<{ input: In; result: Out }, Pattern>` or a dedicated `MutationContext<In, Out>`.
- Preserve heterogeneous invalidation families as tuples/unions instead of forcing one payload generic.
- Add a `ReactivityPlan` shape with `infer`, `invalidates`/`alsoInvalidates`, and `precision` fields only after constant/expression key plans are cleaned up. This keeps the plan aligned with derived-first reactivity without prematurely implementing a full inference engine.
- Add an invalidation `ActionExpr` node as a separate later slice. It should compose through action sequences and lower to targets, but it must remain static data.

### R3 Reactive Resource And Mutation IR

Status: partially done.

What is good:

- `ReactiveResource<In, Value, Err>` wraps a `QueryFunction<In, Value>`.
- `ReactiveMutation<In, Out, Err>` wraps an `ActionFunction<In, Out>`.
- Resource and mutation inference helpers exist and are covered in `tests/reactivity.test-d.ts`.
- Refresh plans and optimistic plans exist.
- Resources/mutations are discoverable from `GenContext`.

Gaps:

- `ReactiveResource` does not store the query key directly. It relies on the wrapped query’s reactivity metadata. This is probably fine, but it means a resource can be created over an unkeyed query without constructor-level diagnostics.
- `ResourceState` uses `idle | loading | success | error`, while the plan specifies `initial | loading | success | refreshing | failure | defect`. This is a meaningful semantic mismatch if targets are expected to distinguish domain errors from defects and stale refreshes.
- `ReactiveMutation.invalidates` is always present, but may be empty. That is pragmatic, but the distinction between “does not invalidate anything” and “cannot derive invalidation” is lost.
- `Err` exists as a phantom on resources and mutations but is not sourced from `QueryFunction.errors` or `ActionFunction.errors` in a precise way.
- There are no `PullResource`, `InfiniteResource`, `StreamResource`, or client-store-backed resources yet, even though `spec/atom.txt` identifies `Atom.pull`, streams, URL search params, and key-value storage as important target inspirations.
- There is no `ReactiveRuntime` / client runtime link from resources/mutations to service requirements, so `Atom.runtime`/Effect Layer ideas cannot be represented generically yet.

Recommendation:

- Align `ResourceState` with the plan before target generators depend on the smaller state model.
- Add lifecycle diagnostics for keyed-resource expectations. A resource over an unkeyed query might be valid, but it should have an explicit refresh/fallback story.
- Thread function error metadata into resource/mutation inference or document that `Err` is currently an annotation.
- Do not implement pull/stream/client-store resources immediately. First make the base resource/mutation state and key semantics correct; then add these as explicit resource variants.
- When client-store resources are added, model them as typed stores/mappings rather than one-off target hooks.

### R4 Reactive Graph Derivation

Status: useful seed, not yet the graph promised by the plan.

What is good:

- `deriveReactiveGraph(ctx)` produces deterministic nodes and edges across keys, query functions, action functions, resources, mutations, resource composition, forms, events, subscriptions, API routes, and app routes.
- Graph query helpers exist for affected keys, stale queries, affected resources, routes, forms, subscriptions, and entity write sets.
- `reactiveGraphArtifact` emits JSON and enriches nodes with stable IDs/traits when context is provided.
- CRUD/query/action/key integration can produce enough graph structure for simple stale-after-mutation queries.

Gaps:

- Edge semantics are currently too coarse. `reads` from query to key family loses payload/pattern information. `invalidates` from mutation to key family loses exact/match/any semantics. `binds` is overloaded for wrapping, route loading, form submission, and composition.
- Graph nodes are mostly names and ids, not typed refs to the underlying static values. This helps snapshots but weakens generation.
- The graph does not yet include many planned node kinds: services, stores, runtimes, boundaries, components, UI consumers, hydration snapshots, transports, patches, requirements, or target capabilities.
- Graph derivation does not currently produce diagnostics when information is broadened or lost. Some diagnostics exist elsewhere, but the graph itself does not explain degradation.
- `affectedResourcesForMutation` works through invalidated key family -> stale query -> resource. That is the right shape, but family-level only. It cannot answer exact/match questions yet.
- The graph is mostly manually declared key metadata, not derived from query body reads, action write sets, mappings, relations, projections, laws, events, or rules beyond the separate rule-derived helper.
- Tracking scopes are absent, so UI/components/routes/forms can be linked only through explicit wrappers and route/form bindings, not through semantic reads.
- No capability/fallback/enhancement decisions are represented in graph metadata.

Recommendation:

- Introduce edge payloads before expanding graph breadth. `ReactiveGraphEdge` likely needs variants, not one flat interface. For example, `ReadsKeyEdge` should carry `KeyExpression`, and `InvalidatesKeyEdge` should carry `ReactiveKeyPattern` or `KeyPatternExpression`.
- Keep the current compact graph as a summary artifact if useful, but derive target generation from typed graph records, not from node names and string prefixes.
- Add a derived-dependency pass after edge payloads exist. Start conservatively: query reads entity/source/projection; actions write entity/fields; mappings and relations expand those dependencies; manual keys refine the result.
- Add tracking scopes as static/runtime metadata before attempting serious UI/devtools generation.

### T1 First Reactive Target

Status: started earlier than the plan recommends.

What is good:

- Effect Atom and TanStack Query targets are plugin-shaped and accept `reactive_graph` input.
- Both emit artifacts and diagnostics for unsupported or malformed graph shapes.
- TanStack generation at least maps resource keys to `queryOptions` and mutation invalidations to `queryClient.invalidateQueries`.

Gaps:

- The generated code is placeholder-level. It calls query/action node names as functions even though the graph does not carry import paths, runtime function bodies, argument mapping, or target execution semantics.
- Effect Atom generation uses APIs in a way that looks illustrative rather than verified. `Atom.make((get) => query(get))` and `get.refresh(resource)` need a stronger target contract before being treated as usable output.
- Target generation is based on names and graph edges, not on typed function/resource/mutation records. That creates a high risk of invalid code once examples become non-trivial.
- Target capability declarations are minimal. The plan expects capability-driven selection and degradation diagnostics; the current targets mostly warn about unsupported node kinds.
- Effect Atom-specific concepts from `spec/atom.txt` are not represented in target input yet: `Atom.runtime` service layers, `Atom.withReactivity` keys, `Atom.fn` result modes, `Atom.pull`, hydration, search param atoms, KVS atoms, and scoped finalizers.

Recommendation:

- Freeze target scope temporarily. Use these files as sketches/snapshot targets, but do not deepen them until key expressions, edge payloads, and function call lowering are stronger.
- Add explicit target input records that include typed graph plus symbol/import metadata. A graph alone is not enough to generate usable TypeScript.
- When targets resume, map from generic concepts to Effect Atom intentionally: `KeyFamily` -> `Atom.family`/reactivity key, `ReactiveMutation` -> `Atom.fn`, `ReactiveRuntime`/services -> `Atom.runtime`, `ResourceState` -> `Result`, pull resource -> `Atom.pull`, client stores -> `Atom.searchParam`/`Atom.kvs`.

## Adjacent Areas

### Typed Routes And SingleFlight

Routes are now present and are correctly distinct from API routes. They support path/query/hash schemas, loaders, actions, route checks, and typed link generation.

The current route model is a good start, but still minimal versus the plan:

- Path param checking exists at lifecycle/runtime diagnostic level.
- Query/hash params are typed but `link()` only accepts path params and does not append query/hash values despite its doc comment saying it does.
- Route loaders can be `QueryFunction | ReactiveResource`; actions can be `ActionFunction | ReactiveMutation`.
- SingleFlight is represented as a derived plan from affected resources/routes, but fallback modes and payload bundling are not modeled yet.
- Loader bundling does not yet use typed route loader key reads, active route matching, hydration snapshots, or mutation result + refreshed loader payload planning.

Taste note: routes are currently simple enough to stay in core for now. Avoid adding framework-specific route targets until loader/resource key semantics are stronger.

`spec/atom.txt` makes SingleFlight more important than a normal target feature: it is the bridge between route loaders, mutation invalidation, hydration, and client state. The current `deriveSingleFlightPlan` is a useful seed, but it should remain conservative until graph edges preserve exact key/pattern semantics.

### Rules And Rule-Derived Reactivity

The rules implementation appears much further along than the plan snapshot suggests. There are rule AST builders, dependency extraction, SQL/RLS translation, evaluator/placement tests, authz integration, and rule-derived reactivity.

The rule-derived reactivity direction is especially aligned with the plan: extract write sets, compare them to rule dependencies, find policies using those rules, then find keyed queries protected by those policies and derive broad invalidation.

Gaps and concerns:

- Precision is classified (`broad | matched | exact | patchable`), but invalidation output currently remains broad key-family invalidation.
- `patchable` inference for a simple equality rule based on one written field is probably too optimistic without before/after values, affected set reasoning, and list membership semantics.
- `dependency-not-extractable` for `exists` is conservative but odd if `extractRuleDependencies` already descends into `exists`. The diagnostic should mean “may be incomplete” only if there are truly opaque/service/external dependencies.
- Rule-to-policy-to-query mapping relies on `query.auth.policy_name`. That is workable, but typed policy refs would better match the rest of the project’s ref-first taste.
- The current rule-derived reactivity is still an add-on pass rather than one source feeding the main graph alongside mappings, relations, projections, events, and operation laws.
- IVM output is intentionally stubbed. `spec/atom.txt` makes clear this should eventually classify maintainability, pre-read needs, broad invalidation, full recompute, and unsupported target cases.

Recommendation:

- Keep Level 1 broad invalidation as the only authoritative behavior for now. Treat `matched` and `patchable` as advisory diagnostics until key payload expressions and affected-set derivation exist.
- Move policy/query linkage toward typed refs rather than names where possible.
- Feed rule dependency plans into the main reactive graph once typed edges exist. Avoid a parallel graph model.
- Add diagnostics that distinguish “rule dependency extracted but broad invalidation selected” from “dependency could not be extracted.”

### Services, Hydration, Admin, Reactions

The plan lists these as future standard-package ideas, but implementation has started.

This is broadly fine, but it increases the need for a consistent cross-cutting model. Services, hydration, routes, reactions, resources, and targets should all reuse the same requirement/effect/capability/fallback vocabulary. Some of that exists in types/core/rules, but the reactivity graph does not yet carry it through.

`spec/atom.txt` adds three concrete design pressures here:

- Services should be a generic dependency graph with Effect Layers as one target, not a hard Effect dependency.
- Hydration should snapshot resource/route/client-store state with schema validation and sensitive-state exclusions.
- Progressive enhancement should be modeled as capability ladders for forms, resources, routes, transports, validation, offline queues, and realtime behavior.

Recommendation:

- Before adding depth to any one adjacent area, define the shared graph edge/node payload shapes for requirements, effects, placements, fallbacks, and capabilities.
- Add requirement/fallback/capability metadata to graph edges only after the key/read/write/invalidation edges are fixed. Otherwise the graph will become broad but still too lossy.

## Type System Assessment

Strong points:

- Public namespace types mostly use `typeof` constructor references, which preserves generics and avoids signature drift.
- Reactivity type tests cover key payload inference, invalid key payloads, invalid match fields, raw string rejection in expression wrappers, resource/mutation inference, resource-all branch inference, and chain inference.
- `QueryFunction<In, Out, Payload>` and reactivity metadata preserve a payload phantom.
- `GenContext` collections are typed and the binders preserve constructor signatures through `as typeof constructor` casts.

Weak points:

- Several important runtime records have phantom types without inspectable runtime type witnesses. This is most visible in `KeyFamily<Payload>`.
- `as never` appears in rules and reaction namespace binders. It may be practical, but it is in a public type path and deserves scrutiny under this repo’s stated standards.
- The tests include some casts in type tests, including `{} as QueryExpression`, which is less concerning than end-user examples but still against the spirit of “tests should not need casts”.
- Resource/mutation error inference is not yet tied to function error definitions.
- `ActionFunction` reactivity is not output-aware, limiting inference for result-derived invalidation.

Recommendation:

- Prioritize type/runtime witness alignment. If TypeScript knows a key payload shape, lifecycle checks and generators should know enough of it too.
- Add negative tests for mismatched family patterns across heterogeneous invalidation arrays, unkeyed resource creation, and result-derived invalidation once the expression model exists.

## Correctness Risks

- Key payload validation is mostly compile-time only, so serialized/imported/plugin-generated IR can violate key family shape without reliable diagnostics.
- Target generators can emit syntactically plausible but semantically invalid code because graph nodes do not carry imports, executable plans, argument mapping, or target runtime requirements.
- Resource state semantics currently under-model refresh/failure/defect distinctions, which will matter for Effect/TanStack/Solid targets.
- Graph impact queries are family-level and may over-invalidate. That is safe, but diagnostics should clearly report broadening.
- CRUD default key families may duplicate names/ids if `deriveCrud` is called repeatedly for the same entity or alongside manually created matching families. There is a duplicate family checker, but ergonomically this may surprise users.
- `link()` is typed for path params only and does not enforce missing extra path placeholders after replacement.

## Taste And Architecture Notes

- The implementation has good momentum but is starting to sprawl across milestones. The plan’s warning to build portable IR before targets is still right.
- `gen.key.any(UserKey)` is less elegant than `UserKey.any()`, but it is more obviously static and simpler to type. I would not change it until runtime `input_type` is fixed.
- Naming is mostly clear. The one name I would reconsider is `KeyExpression` for the current constant wrapper. “Expression” implies a body over input/result; the implementation is not there yet.
- The graph API is pleasant for tests and devtools, but target generators should not use string IDs as their primary semantic source.
- The choice to wire rule-derived reactivity early is good. It validates the entire premise that rules, policies, queries, and keys can converge. Keep it conservative.

## Suggested Next Work

1. Update `atom_plan.md` current-state sections so contributors stop treating implemented features as absent.
2. Finish R1 properly by adding inspectable `input_type` to `KeyFamily` and deriving payload types from semantic types.
3. Rename or split current key “expressions” into constant key declarations versus real expression-backed key plans.
4. Make invalidation plans aware of action input and result, even if only constant/broad invalidation is implemented initially.
5. Convert graph edges into discriminated unions with payloads for key reads, key invalidation, writes, binds, emits, subscribes, requires, and hydrates.
6. Add semantic key hierarchy and batching semantics before making targets more concrete.
7. Align `ResourceState` with the Result-like plan before target code depends on it.
8. Add conservative derived read/write dependency extraction from query/action bodies, then let manual keys refine the result.
9. Add tracking-scope metadata for routes/resources/forms/components before serious devtools/hydration generation.
10. Treat Effect Atom and TanStack Query generators as experimental until symbol/import/call-plan lowering is designed.
11. Add lifecycle diagnostics for broadening: unkeyed query lowered from legacy invalidation, broad family invalidation selected, empty invalidation plan, resource over unkeyed query, and target fallback selected.
12. Add type tests that prove action invalidation can preserve heterogeneous key families and eventually result-derived key payloads.
13. Keep rule-derived invalidation at Level 1 as the stable behavior; expose higher precision as diagnostics/plans only after affected-set and key payload derivation are real.
14. Defer pull/stream/client-store/offline/progressive-enhancement depth until key schemas, typed graph edges, and conservative derivation are reliable.

## Bottom Line

The project is aligned with the spirit of `atom_plan.md` and `spec/atom.txt`, but the plan is stale and the implementation has jumped ahead in breadth. The core concern is not direction; it is representation depth. The key system, key expressions, graph edges, and derived dependency pass need to become more inspectable before targets, SingleFlight, hydration, progressive enhancement, and devtools can be correct rather than illustrative.

If I were choosing the next engineering slice, I would make it: “R1/R2 correctness plus conservative derivation.” Add runtime key payload schemas, split constant vs expression key plans, enrich graph key edges, add semantic key hierarchy/batching, and add diagnostics for every precision loss. Then add a small derived dependency pass from query/action/mapping/relation metadata. That one slice would improve reactivity, CRUD, router, SingleFlight, rule-derived invalidation, hydration, and target generation at the same time.
