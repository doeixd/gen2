# Phase 5 Agent Implementation Guide: Type-Safe Composition, Node Unification, and Inference Integrity

This guide is a handoff plan for an AI coding agent executing Phase 5 of the `gen2` roadmap. Phase 5 is not a new feature expansion phase. It is an architectural strengthening phase focused on making the existing semantic IR easier to compose safely, infer correctly, extend predictably, and trust across targets.

Read this guide literally. Do not infer a larger rewrite than the milestone asks for. Phase 5 is about connecting existing primitives with stronger typing and diagnostics, not replacing the library with a new abstraction model.

Phase 5 builds on the primitive model documented in `docs/core-primitives.md`:

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

## Primary Goal

Phase 5 makes type-safe composition a first-class compiler guarantee.

The core outcome is that built-in and plugin-defined semantic objects can participate in generic plans, workflows, dispatches, boundaries, providers, reactivity, and target derivation through a shared typed node protocol without losing inference or semantic metadata.

The phase should preserve the existing strengths:

1. `SemanticType<T>` remains the root of value meaning and inference.
2. `Entity` and `Field<T>` remain the canonical domain shape.
3. `QueryFunction` and `ActionFunction` remain the canonical read/write source of truth.
4. `Rule` remains the pure inspectable business-logic layer.
5. `KeyFamily` and key expressions remain the target-agnostic reactivity identity layer.
6. Traits remain reusable semantic modifiers and capability markers, not an overloaded replacement for rules or laws.
7. `GenContext` remains the runtime graph for lifecycle checks and generation.
8. Plugins remain additive and must not mutate global state.

Phase 5 should not replace these concepts. It should connect them with stronger typed adapters, compositional constraints, and namespace integrity checks.

## Implementation Discipline

Follow these rules for every milestone:

1. Implement the complete production behavior described by the milestone, in the dependency order stated by the milestone.
2. Prefer additive adapters, checks, and helper types over reshaping existing public IR.
3. Do not rename public concepts unless the milestone explicitly says to do so.
4. Do not remove existing direct constructors such as `gen.entity`, `gen.func.query`, `gen.rule.define`, or `gen.reactivity.resource`.
5. Do not replace `QueryFunction` or `ActionFunction` with `StaticNode`. Add adapters first.
6. Do not make traits into rules. Traits may reference rules or predicates.
7. Do not make laws into traits. Traits may require laws.
8. Do not make `GenContext` a type-level registry by default. If a typed registry is implemented, it must be optional.
9. Do not add target generator behavior before the IR shape and diagnostics have tests.
10. After each milestone, run `vp check` and `vp test`. If existing unrelated failures remain, document them and do not hide them with casts.

When two production-quality approaches are valid, choose the least disruptive approach that preserves existing public APIs and satisfies the milestone acceptance criteria.

## Current Assessment

The current design already has a strong type-safety foundation:

1. `createGen<C, P>()` carries config and plugin helper types into the `gen` namespace.
2. `Gen<C>` threads backend/config typing through namespaces.
3. Plugin helper shapes are merged into `gen` through `GenWithPluginHelpers<C, P>`.
4. Semantic objects carry phantom type slots such as `_ts`, `_input`, `_output`, `_requires`, and `_effects`.
5. Most public constructors infer from values rather than requiring explicit type parameters.
6. `SemanticType<T>` flows into `Field<T>`, `Expr<T>`, `Function<In, Out>`, resources, providers, state resources, and merge strategies.
7. `StaticNode` already models open application-level composition through traits and phantom slots.
8. Plan combinators already preserve node identity generics.
9. Runtime `GenContext` cleanly aggregates the graph for checks and targets.

Keep these decisions.

The main gaps are architectural seams rather than missing concepts:

1. Many function-like objects are not structurally or adaptively usable as typed `StaticNode`s.
2. `plan.chain` preserves the two nodes but does not deeply enforce output-to-input compatibility.
3. Requirement/effect bubbling exists at runtime but is not consistently reflected at the type level.
4. `RuleExpr`, `Predicate`, and `Expr` overlap but are not unified or lowered through one canonical predicate path.
5. Namespace runtime objects can drift from namespace interfaces, as shown by `PlanNamespace` requiring members not returned by `createPlanNamespace`.
6. Some binders use broad casts to preserve constructor signatures, which can hide runtime/type drift.
7. `GenContext` is intentionally runtime-oriented and does not provide an optional typed registry of definitions created so far.
8. Laws exist as metadata but are not yet used as strongly as they could be in compositional APIs.
9. Semantic traits and node traits both exist, but their relationship to rules, laws, capabilities, checks, and target interpretations is under-specified.

## Non-Goals

Phase 5 should avoid overcorrecting the architecture.

1. Do not make every IR object literally extend one giant interface if adapters preserve better ergonomics.
2. Do not replace dedicated canonical IR types with vague universal nodes.
3. Do not make `GenContext` itself a deeply type-accumulating builder by default.
4. Do not force every user into a chained builder style.
5. Do not require theorem-prover-level law validation.
6. Do not remove runtime diagnostics just because a type-level check catches some cases.
7. Do not break existing public constructors unless the migration is narrow, justified, documented, and fully tested.
8. Do not add casts in tests or examples to prove type safety.
9. Do not collapse traits, rules, laws, and capabilities into one vague abstraction.
10. Do not introduce a new universal `Thing` or `SemanticObject` type that every feature must use.
11. Do not use broad casts to force a milestone to compile. If a cast is unavoidable, isolate it and explain it in a comment.

## Critical Distinctions

These distinctions must remain clear throughout implementation:

```txt
SemanticType<T>
  Describes what a value means and carries the TypeScript value type.

Trait
  Describes reusable semantic behavior, constraints, or capability markers.
  A trait can reference rules, expressions, laws, and capabilities.

Rule
  Describes a pure predicate or business fact.
  A rule should not perform effects.

Law
  Describes algebraic properties of an operation or merge strategy.
  A law is not validation logic.

Capability
  Describes target/runtime support or requirement.
  A capability is not proof that behavior is safe by itself.

StaticNode
  Describes an open, trait-bearing graph object for composition.
  It should not erase canonical object metadata.
```

Incorrect interpretations:

```txt
Wrong: Traits are just rules.
Right: Traits may include validation rules, but also carry metadata, capabilities, conflicts, and target meaning.

Wrong: Everything should become a StaticNode.
Right: Canonical objects should adapt to StaticNode when generic composition needs it.

Wrong: Type-level checks replace lifecycle diagnostics.
Right: Type-level checks catch obvious mistakes; diagnostics explain semantic safety and target constraints.

Wrong: Phase 5 should build new app features.
Right: Phase 5 strengthens inference, composition, adapters, traits, checks, and target consumption of existing IR.
```

## Design Principles

1. **Objects carry meaning.** Preserve semantic metadata on the values users pass around.
2. **Composition should infer.** Normal users should not write explicit type arguments.
3. **Adapters beat inheritance when cheaper.** If a `QueryFunction` should compose as a node, an `asNode(query)` adapter may be safer than reshaping `QueryFunction` immediately.
4. **Runtime checks still matter.** TypeScript can prove shape compatibility, but lifecycle diagnostics explain semantic safety.
5. **Open nodes should not weaken closed IR.** Closed expression unions are useful for target exhaustiveness; open application nodes are useful for plugin extensibility.
6. **No parallel sources of truth.** Plans, workflows, providers, targets, and docs should reference canonical functions, rules, keys, entities, and semantic types.
7. **Namespace types must match runtime objects.** Drift in `gen` undermines trust in the whole API.
8. **Traits describe reusable meaning.** Rules may implement trait checks, laws may justify trait safety, and capabilities may be implied by traits, but traits should not become rules.

## Recommended Milestone Order

1. **TYPE1: Namespace Integrity and Drift Checks**
2. **TYPE2: Trait Architecture and Trait Checking**
3. **TYPE3: Canonical Node Adapter Protocol**
4. **TYPE4: Function and Resource Node Adapters**
5. **TYPE5: Type-Safe Plan Chain Compatibility**
6. **TYPE6: Requirement and Effect Type Bubbling**
7. **TYPE7: Rule Predicate Unification or Lowering**
8. **TYPE8: Law-Aware Composition Gates**
9. **TYPE9: Optional Typed Registry Builder**
10. **TYPE10: Binder Cast Reduction and Public API Inference Audit**
11. **TYPE11: Composition Target Fixtures and Regression Suite**
12. **TYPE12: Unified Dispatch Model — Event and Reaction Unification**
13. **TYPE13: Unified Callable Base Interface**
14. **TYPE14: Workflow Steps as ComposablePlan Views**
15. **TYPE15: StoredValue Unification (StateResource + OfflineQueuePlan)**
16. **TYPE16: Combiner Unification (MergeStrategy + MonoidOp)**
17. **TYPE17: Execution Footprint Unification (EffectKind + CapabilityKind)**

Do not skip ahead to target fixtures before namespace integrity, trait checks, node adapters, and plan compatibility are stable. Later milestones depend on earlier ones.

---

## Milestone TYPE1: Namespace Integrity and Drift Checks

### Problem

The `gen` namespace is the user's primary API surface. If namespace interfaces and runtime factories drift, TypeScript reports confusing errors or, worse, users see members that are typed but missing at runtime.

One current example is `PlanNamespace`: the interface includes `deriveRequirements`, `deriveEffects`, and `checkFallback`, but `createPlanNamespace` does not return them.

### Target Design

Every namespace factory should be checked against its declared namespace type at the local construction site. Missing methods should fail near the factory, not later through broad assignment errors.

### Implementation Steps

1. Fix existing namespace drift, starting with `createPlanNamespace`.
2. Prefer `satisfies` checks on namespace object literals where TypeScript can still preserve narrow method types.
3. Add focused compile-time tests or runtime smoke tests for namespace shape parity.
4. Avoid adding broad `as Namespace<C>` casts unless a short comment explains why inference cannot be preserved otherwise.
5. Review factories in `src/gen/namespaces.ts` for similar drift.

Production implementation sequence:

1. Add the missing `deriveRequirements`, `deriveEffects`, and `checkFallback` members to `createPlanNamespace`.
2. Run `vp check` and confirm the previous `PlanNamespace` mismatch is gone.
3. After the `PlanNamespace` mismatch is resolved and checked, review other namespace factories.

Do not solve this milestone by deleting members from `PlanNamespace` unless those members truly do not exist anywhere in implementation. If implementation functions exist, expose them from the namespace factory.

### Diagnostics

This milestone is primarily type-level, but lifecycle or developer diagnostics may be useful for plugin helper collisions.

Required diagnostic codes if runtime namespace validation is added:

```txt
gen:namespace-member-missing
gen:namespace-member-conflict
gen:plugin-helper-runtime-mismatch
```

### Acceptance Criteria

1. `vp check` no longer fails because of namespace runtime/type drift.
2. `createPlanNamespace` returns every member declared by `PlanNamespace`.
3. Namespace factory changes preserve generic inference for public methods.
4. At least one test or type assertion catches a missing namespace member.
5. No tests or examples require casts.

---

## Milestone TYPE2: Trait Architecture and Trait Checking

### Problem

Traits are already present in two forms: semantic type traits and node traits. Semantic traits attach validation, storage, privacy, UI, or queryability meaning to values. Node traits advertise compositional capabilities such as `callable`, `readable`, `writable`, `effectful`, `reactive`, `keyed`, and `plan`.

These are useful foundations, but the trait model is under-specified. It is not yet clear how traits relate to rules, expressions, laws, capabilities, requirements, effects, target support, or diagnostics. Without that clarity, future features may either duplicate trait concepts or overload rules into doing trait work.

### Target Design

Traits should become reusable semantic packages. A trait can reference rules, expressions, laws, capabilities, requirements, effects, diagnostics, and target interpretations, but the trait itself remains distinct from those concepts.

Keep this separation:

```txt
Trait = reusable semantic annotation/capability
Rule = pure predicate/business fact
Law = algebraic safety fact about computation
Capability = target/runtime requirement or support
Node trait = graph composition capability
```

Traits may declare:

```txt
allowed target kinds
validation predicate or rule
storage expression
implied traits
conflicting traits
required capabilities
required laws
requirements
diagnostic definitions
target interpretation hints
```

Traits should be type-preserving by default:

```txt
SemanticType<T> + Trait -> SemanticType<T>
Field<T> + Trait -> Field<T>
StaticNode<In, Out, Traits> + Trait -> StaticNode<In, Out, [...Traits, Trait]>
```

If a modifier changes the TypeScript type, it should be modeled as a transformation or constructor, not as an ordinary trait.

### Implementation Steps

1. Review `src/types/trait.ts`, `src/types/semantic.ts`, `src/core/node.ts`, and plugin trait metadata support.
2. Add a `TraitTargetKind` literal union, starting with `semantic_type`, `field`, `entity`, `node`, `operation`, `function`, `rule`, `resource`, `provider`, and `target`.
3. Extend semantic `Trait` or add a companion `TraitDefinition` that can express target kind, applies-to constraints, implied traits, conflicts, capabilities, requirements, effects, laws, validation predicates, and storage expressions.
4. Do not break existing `Trait` and `withTrait` calls. Add compatibility fields or a focused conversion path if needed.
5. Implement `checkTraitApplications` for the first meaningful slice: invalid target kind, incompatible `applies_to`, conflicting traits, validation expression type mismatch, and forbidden effects.
6. Add node trait invariant checks: `callable` requires input/output or call plan, `effectful` requires effects, `keyed` requires key metadata, `reactive` requires reactive metadata, and `target_interpretable` requires target support or lowering.
7. Allow traits to reference rules or predicates for validation, but do not make traits themselves rules.
8. Add trait registry helpers on `GenContext` only if existing `trait_metadata` is not enough.
9. Add tests showing semantic traits preserve `SemanticType<T>` inference and node traits preserve composable node inference.

Production implementation sequence:

1. Add `TraitTargetKind` and target-kind metadata without breaking existing `defineTrait` calls.
2. Implement `checkTraitApplications` for `applies_to` mismatch and conflicting traits as the first required diagnostic classes, then complete the remaining trait diagnostics named in this milestone before closing it.
3. Add semantic trait inference tests proving `withTrait(gen.types.string(), trait)` remains `SemanticType<string>` and that trait metadata is preserved.
4. Add node trait invariant tests for `callable` without input/output/call plan and for at least one additional node trait such as `effectful`, `keyed`, or `reactive`.

Implement trait registry expansion once the required trait checks pass. Keep existing rules as rules; traits may reference rules but must not absorb them.

### Diagnostics

```txt
trait:invalid-target-kind
trait:applies-to-mismatch
trait:conflict
trait:implied-trait-missing
trait:validation-not-boolean
trait:storage-type-mismatch
trait:effect-not-allowed
trait:required-capability-missing
trait:required-law-missing
trait:target-interpretation-missing
node:callable-trait-missing-call-plan
node:effectful-trait-missing-effects
node:keyed-trait-missing-key
node:reactive-trait-missing-reactivity
node:target-interpretable-missing-lowering
```

### Acceptance Criteria

1. Semantic traits, node traits, rules, laws, and capabilities are explicitly documented and modeled as distinct concepts.
2. `withTrait(type, trait)` preserves the original semantic type parameter.
3. Trait applications can be checked for invalid target kinds, conflicts, validation type mismatches, and forbidden effects.
4. Node trait claims are checked against the metadata needed to make the claim meaningful.
5. Traits can reference rule/predicate validation without becoming rules.
6. Plugin-defined traits can register metadata and participate in trait checks.
7. `vp check` and `vp test` pass.

---

## Milestone TYPE3: Canonical Node Adapter Protocol

### Problem

`StaticNode` is the open composition protocol, but many canonical IR objects are not directly composable as nodes. Plan/workflow/reaction/boundary APIs therefore risk either hardcoding every concrete kind or accepting loosely typed objects.

### Target Design

Add a canonical adapter protocol that can expose any function-like or resource-like IR object as a typed `StaticNode` without replacing the original concrete type.

The adapter should preserve:

```txt
kind
name/ref/id
input semantic type
output semantic type
errors
requirements
traits
call plan
symbol metadata
phantom generic slots
source object reference where needed
```

### Implementation Steps

1. Add a focused module such as `src/core/node-adapter.ts` if no existing module fits.
2. Define `NodeAdapter<TSource, TNode extends StaticNode>` or equivalent.
3. Define `NodeSourceKind` as a literal union for built-in adapted sources, such as `query_function`, `action_function`, `reactive_resource`, `workflow`, `service_method`, `plan`, and `custom`.
4. Add a helper such as `toStaticNode(source)` only for supported source kinds.
5. Preserve the original object. Do not erase a `QueryFunction` into a node when callers need query-specific metadata.
6. Add `node_source` metadata or a typed source reference only if targets need to recover the canonical source object.
7. Add tests showing a canonical function can be adapted into a node with inferred input/output types.

Production implementation sequence:

1. Complete the adapter types and `toStaticNode` behavior for `QueryFunction` as the first production adapter that proves the protocol design.
2. Preserve query name, input type, output type, requirements, traits, call plan, and symbol if present.
3. Add tests showing the adapted query is accepted by `gen.plan.sequence` and preserves its typed input/output metadata.
4. Complete and test the query adapter before implementing the broader adapter set in TYPE4.

Do not change the shape of `QueryFunction` in this milestone. The adapter should wrap or project it.

### Diagnostics

```txt
node:adapter-unsupported-source
node:adapter-missing-input-type
node:adapter-missing-output-type
node:adapter-trait-mismatch
node:adapter-source-erased
```

### Acceptance Criteria

1. The canonical adapter protocol is implemented with clear source-kind modeling and typed source preservation.
2. A `QueryFunction<In, Out>` can adapt to a `StaticNode<..., In, Out, ...>` through the protocol.
3. Adapted query nodes preserve requirements, effects when present, call plans, refs, names, symbol metadata, and source identity where available.
4. Unsupported sources fail with diagnostics or type errors rather than silent broad nodes.
5. Existing concrete query APIs remain usable unchanged.
6. `vp check` and `vp test` pass.

---

## Milestone TYPE4: Function and Resource Node Adapters

### Problem

The adapter protocol is only useful if the most important canonical objects can use it. Queries, actions, resources, mutations, services, and workflows are the main compositional units.

### Target Design

Implement built-in adapters for the canonical behavior objects.

Required first set:

```txt
QueryFunction -> callable + readable + typed + keyed when it has reactivity
ActionFunction -> callable + writable + effectful + typed
ReactiveResource -> readable + reactive + resource_like + keyed
ReactiveMutation -> callable + writable + effectful + reactive
Plan -> plan + callable/effectful when children are callable/effectful
Workflow -> callable + effectful + requires + plan
```

### Implementation Steps

1. Implement the adapter set in dependency order: query, action, resource, mutation, workflow, and plan.
2. Add explicit trait mapping helpers for each source kind.
3. Register adapted nodes in graph derivation only where doing so does not duplicate existing graph nodes.
4. Add tests for adapted functions participating in `gen.plan.sequence`, `gen.plan.parallel`, and `gen.plan.chain`.
5. Ensure target generators still consume canonical objects where they need detailed metadata.

Production implementation sequence:

1. Add the `ActionFunction` adapter after the `QueryFunction` adapter exists.
2. Add the `ReactiveResource` adapter after query/action adapters pass.
3. Add mutation, workflow, plan, and reaction adapters after query, action, and resource adapters are complete and tested.

Do not register adapted nodes into `ctx.nodes` automatically unless a test proves that is necessary. Avoid duplicate graph entries.

### Diagnostics

```txt
node:function-adapter-missing-body
node:resource-adapter-missing-query
node:mutation-adapter-missing-action
node:workflow-adapter-opaque-step
node:adapted-node-duplicate-graph-entry
```

### Acceptance Criteria

1. Query, action, resource, mutation, and reaction adapters preserve type inference.
2. Adapted canonical objects can be composed by trait-based plan APIs.
3. Graph derivation can recognize adapted nodes without duplicating existing canonical graph nodes.
4. Existing direct query/action/resource/reaction tests continue to pass.
5. `vp check` and `vp test` pass.

---

## Milestone TYPE5: Type-Safe Plan Chain Compatibility

### Problem

`chainPlan(first, second)` preserves the two nodes, but it does not fully enforce that the output of `first` can feed the input of `second`.

This weakens the promise that composable IR chains are type-safe.

### Target Design

`gen.plan.chain(a, b)` should infer the output of `a`, infer the input of `b`, and reject incompatible chains at compile time when both sides are statically known.

Runtime diagnostics should cover cases TypeScript cannot prove, such as missing type metadata or opaque nodes.

### Implementation Steps

1. Review `InferNodeInput` and `InferNodeOutput` in `src/core/node.ts`.
2. Add or refine helper types for compatibility, such as `NodeInput<N>`, `NodeOutput<N>`, and `IsAssignable<Out, In>` if needed.
3. Update `chainPlan` signature to enforce compatibility for typed nodes.
4. Add an escape hatch for intentionally dynamic composition, but mark it unsafe or opaque.
5. Add `checkPlanTypeCompatibility(plan)` for runtime diagnostics.
6. Add tests for compatible chain, incompatible chain, unknown-input chain, and opaque escape hatch.

Production implementation sequence:

1. Add helper types for `NodeInput<N>` and `NodeOutput<N>` using existing inference helpers.
2. Update `chainPlan` so known incompatible nodes fail a type test.
3. Add a runtime diagnostic for missing input/output metadata.

Do not make `sequencePlan` or `parallelPlan` enforce chain compatibility. This milestone is specifically about `chainPlan`.

### Diagnostics

```txt
plan:chain-input-output-mismatch
plan:chain-missing-input-type
plan:chain-missing-output-type
plan:chain-opaque-compatibility
plan:dynamic-chain-not-portable
```

### Acceptance Criteria

1. Compatible chains infer successfully without explicit type arguments.
2. Incompatible chains fail at compile time when types are known.
3. Unknown or opaque nodes produce diagnostics instead of claiming safety.
4. Existing sequence/parallel/fallback APIs continue to work.
5. `vp check` and `vp test` pass.

---

## Milestone TYPE6: Requirement and Effect Type Bubbling

### Problem

Requirements and effects exist on expressions, functions, nodes, plans, workflows, reactions, and providers. Runtime bubbling exists in places, but type-level bubbling is inconsistent.

This makes it harder for composed plans to preserve the information needed by provider planning and target diagnostics.

### Target Design

Plan composition should infer combined requirements and effects from child nodes.

Examples:

```txt
sequence([a, b, c])
  requires ReqA | ReqB | ReqC
  effects EffA | EffB | EffC

parallel({ user, projects })
  requires ReqUser | ReqProjects
  effects EffUser | EffProjects
```

### Implementation Steps

1. Refine `InferNodeRequirements` and `InferNodeEffects`.
2. Add tuple/object utility types for collecting requirement/effect unions from plan steps and branches.
3. Add phantom `_requires` and `_effects` slots to plan IR variants where missing.
4. Ensure `derivePlanRequirements` and `derivePlanEffects` runtime helpers match the type-level intent.
5. Feed composed plan requirements into requirement satisfaction planning.
6. Add tests for sequence, parallel, fallback, retry, and chain requirement/effect aggregation.

Production implementation sequence:

1. Add `_requires` and `_effects` phantom slots to `SequencePlan` and `ParallelPlan` first because they establish the tuple/object aggregation pattern.
2. Extend the same aggregation model to fallback, retry, and chain plans before closing the milestone.
3. Infer requirement/effect unions from direct child nodes for each supported plan variant.
4. Verify runtime `derivePlanRequirements` and `derivePlanEffects` match those direct children.

Complete direct plan-node aggregation before adding recursive workflow aggregation.

### Diagnostics

```txt
plan:requirements-not-bubbled
plan:effects-not-bubbled
plan:fallback-requirements-unsatisfied
plan:parallel-effects-conflict
requirement:plan-derived-provider-missing
```

### Acceptance Criteria

1. Plan variants carry inferred requirement/effect phantom types.
2. Runtime derivation matches type-level aggregation for built-in nodes.
3. Requirement satisfaction checks include requirements bubbled from plans.
4. Unsafe fallback or parallel effect combinations produce diagnostics.
5. `vp check` and `vp test` pass.

---

## Milestone TYPE7: Rule Predicate Unification or Lowering

### Problem

Rules are powerful but currently use `RuleExpr`, while the general expression system has `Expr` and `Predicate`. This creates duplicate logical AST concepts and limits reuse of operation/law/effect/type infrastructure.

### Target Design

Rules should either use the canonical predicate expression model directly or lower into it through a well-tested adapter.

Production compatibility path:

```txt
RuleExpr -> Predicate lowering
```

This avoids breaking existing rule builders while connecting rules to expression checks and operation metadata.

### Implementation Steps

1. Review `src/rules/rules.ts`, `src/expression/expr.ts`, and expression AST constructors.
2. Define `lowerRuleExprToPredicate(rule)` or `lowerRuleExpr(expr, inputType?)`.
3. Preserve rule-specific dependency extraction while adding expression-level dependency reuse where safe.
4. Ensure rule lowering rejects or diagnoses unsupported rule forms.
5. Add tests comparing rule dependency extraction before and after lowering.
6. Add target tests showing SQL/RLS translation still works.

Production implementation sequence:

1. Implement lowering for `rule.literal`, `rule.var`, `rule.field`, `rule.eq`, and simple comparisons first because they establish the primitive mapping.
2. Extend lowering or explicit diagnostics to every public `RuleExpr` variant before closing the milestone.
3. Return a diagnostic for unsupported or non-portable forms instead of silently producing an opaque predicate.
4. Prove existing dependency extraction output is unchanged for supported forms.

Do not replace `RuleExpr` in public APIs during this milestone. Lowering is the compatibility path.

### Diagnostics

```txt
rules:predicate-lowering-unsupported
rules:predicate-type-mismatch
rules:rule-expr-effect-not-allowed
rules:opaque-predicate-not-portable
rules:lowered-predicate-ref-mismatch
```

### Acceptance Criteria

1. Existing rule APIs continue to work.
2. Rules can lower to predicate/expression IR for supported forms.
3. Lowered predicates preserve field/entity/relation dependencies.
4. Effects remain forbidden in pure rules.
5. SQL/RLS/reactivity behavior is preserved or intentionally improved with tests.
6. `vp check` and `vp test` pass.

---

## Milestone TYPE8: Law-Aware Composition Gates

### Problem

Operations and merge strategies carry law metadata, but many APIs that require laws rely on runtime diagnostics or do not check law requirements at all.

Examples:

```txt
retry of effectful operation should require idempotency
parallel merge should require commutativity or conflict handling
optimistic rollback should require inverse or old-value capture
offline replay should require idempotency/deduplication
reducer folding should require associativity
```

### Target Design

Use laws as safety metadata in both type signatures and diagnostics. Type-level checks should catch clear cases; runtime diagnostics should explain uncertain or opaque cases.

### Implementation Steps

1. Add helper predicates such as `hasLaw(operation, "idempotent")` and `hasCapability(operation, "transactional")` if missing.
2. Add branded or generic law-bearing strategy types only where they improve ergonomics.
3. Update optimistic/offline/merge/retry planning to require relevant laws where known.
4. Avoid making common APIs unusable when law metadata is absent; prefer diagnostics and safe degradation unless unsafe generation would occur.
5. Add tests for idempotent retry, non-idempotent retry diagnostic, inverse rollback, and non-commutative parallel merge diagnostic.

Production implementation sequence:

1. Add `hasLaw` and `hasCapability` helpers if missing.
2. Use them in one checker first, preferably retry or optimistic rollback, to prove diagnostic shape.
3. Apply the same law-checking pattern to the optimistic/offline/merge/retry surfaces named in this milestone before closing it.
4. Add diagnostics for missing law and unverified law claim.

Runtime diagnostics are required production behavior for law checks. Add type branding only where it improves ergonomics without weakening diagnostics or inference.

### Diagnostics

```txt
law:required-law-missing
law:law-claim-unverified
law:operation-law-mismatch
law:opaque-operation-law-unknown
merge:law-required-for-retry
optimistic:operation-not-reversible
offline:idempotency-key-missing
```

### Acceptance Criteria

1. APIs that require known laws use law metadata explicitly.
2. Missing laws produce actionable diagnostics or compile-time failures where practical.
3. Safe degradation remains possible when an explicit fallback exists.
4. Opaque law claims are visibly marked as lower assurance.
5. `vp check` and `vp test` pass.

---

## Milestone TYPE9: Optional Typed Registry Builder

### Problem

`GenContext` intentionally stores runtime arrays. This is good for lifecycle and generation, but it means the type system does not know which entities, functions, rules, and resources have been registered so far.

Some users and agents would benefit from an optional builder that accumulates a typed registry without changing the default `createGen` workflow.

### Target Design

Add an optional registry builder that accumulates named definitions at the type level.

Example shape:

```ts
const app = appBuilder(createGen())
  .entity("User", { id: gen.types.uuid() })
  .query("getUser", ...)
  .action("updateUser", ...)
  .build();

app.registry.entities.User
app.registry.queries.getUser
app.registry.actions.updateUser
```

This should be additive. Users who prefer direct `gen.entity(...)` calls should not be affected.

### Implementation Steps

1. Design the registry as a separate builder, not a replacement for `GenContext`.
2. Keep the runtime context shared with `createGen`.
3. Accumulate type-level records for entities, queries, actions, rules, resources, providers, and states through independently validated production additions.
4. Preserve literal names with `const` generics.
5. Add duplicate-name type checks where practical and runtime diagnostics where necessary.
6. Add examples showing both direct and builder styles.

Production implementation sequence:

1. Design the type shape in a dedicated design test or internal type-only test file.
2. Implement typed accumulation for entities first because they establish name preservation and runtime-context sharing.
3. Extend typed accumulation to the entity/function/resource categories required by the acceptance criteria before closing the milestone.
4. Ensure the builder shares the same runtime `ctx` as direct `createGen` usage.

Do not convert existing examples to the registry builder. It is optional.

### Diagnostics

```txt
registry:duplicate-name
registry:name-not-literal
registry:unknown-reference
registry:type-registry-runtime-mismatch
```

### Acceptance Criteria

1. The typed registry builder is optional and does not change `createGen` behavior.
2. Literal entity/function/resource names are available through a typed registry.
3. Registry entries are the same runtime objects registered in `ctx`.
4. Duplicate names are caught by type or lifecycle diagnostics.
5. `vp check` and `vp test` pass.

---

## Milestone TYPE10: Binder Cast Reduction and Public API Inference Audit

### Problem

Several binders cast context-bound wrappers back to `typeof originalConstructor`. This is pragmatic, but broad casts can hide mismatches between public signatures and runtime behavior.

Phase 5 should reduce casts where it can do so without harming inference.

### Target Design

Context-bound binders should preserve overloads, generics, and return types with the narrowest possible casts. When a cast remains necessary, it should be isolated and documented.

### Implementation Steps

1. Audit `src/gen/binders.ts` and namespace factories for casts.
2. Classify casts as safe signature preservation, unsafe generic widening, or obsolete.
3. Replace simple casts with generic binder helpers where possible.
4. Add type inference tests for constructors touched by the audit.
5. Audit binders in a controlled order, prioritizing high-value constructors: entity, function, key, resource, provider, state, relation.

Production implementation sequence:

1. Audit and document casts without changing behavior.
2. Pick one well-contained binder to establish the cast-reduction or cast-documentation pattern.
3. Apply the same pattern to the prioritized constructors named in the implementation steps.
4. Add inference tests for every binder touched by the audit.

Do not do a mass cast removal in one commit.

### Diagnostics

This milestone is mostly type-level. If runtime binder validation is added, use:

```txt
binder:return-not-registered
binder:ref-not-registered
binder:signature-runtime-mismatch
```

### Acceptance Criteria

1. Public constructor inference is preserved or improved.
2. Broad casts are reduced in touched binders.
3. Remaining casts have short explanatory comments.
4. No public examples require `as any`, `as unknown as`, or `as never`.
5. `vp check` and `vp test` pass.

---

## Milestone TYPE11: Composition Target Fixtures and Regression Suite

### Problem

Type-safe composition is only useful if targets and derived planners can consume the composed IR without private knowledge or ad hoc kind checks.

### Target Design

Add fixture targets and regression tests that prove composed typed IR can feed real derivations.

Required scenarios:

```txt
query -> resource -> derived resource -> target artifact
action -> mutation -> invalidation -> optimistic/offline plan
rule -> auth policy -> RLS/docs/test obligation
query/action adapted to nodes -> plan.chain -> workflow/boundary target
provider/state/hydration -> client/server target fixture
```

### Implementation Steps

1. Add structural tests rather than broad snapshots where possible.
2. Ensure fixtures use public APIs only.
3. Include one plugin-defined node with traits and lowering.
4. Include one incompatible composition case with diagnostics.
5. Include one target fixture that consumes adapted nodes and one that consumes canonical objects.

Production implementation sequence:

1. Add a fixture target that consumes a composed plan of adapted query/action nodes.
2. Add incompatible chain diagnostic tests.
3. Add the plugin-defined node test after built-in adapted nodes work.

Do not use private module internals in fixtures. If the fixture needs private internals, the public IR surface is not ready.

### Diagnostics

```txt
target:composed-node-unsupported
target:adapted-node-source-required
target:composition-private-internal-access
target:capability-missing-for-composition
```

### Acceptance Criteria

1. At least one fixture target consumes composed plan/node IR.
2. At least one fixture target consumes canonical function/resource IR unchanged.
3. Plugin-defined trait-bearing nodes compose with built-in nodes through public APIs.
4. Incompatible compositions produce diagnostics before target generation.
5. `vp check` and `vp test` pass.

---

## Milestone TYPE12: Unified Dispatch Model — Event and Reaction Unification

### Problem

Events and Reactions are 80% the same infrastructure with 20% different semantics. Both define:

- A trigger source (explicit emission vs. rule-derived predicate)
- An effectful handler (action, subscription, or reducer)
- A delivery plan (outbox, job queue, webhook, inline)
- Idempotency and retry semantics
- Lifecycle diagnostics and graph edges
- Target fixtures for code generation

Currently this machinery is duplicated:

- `src/events/events.ts` + `src/reaction/reaction.ts`
- `checkEvents()` + `checkReactions()`
- `OutboxEntry` + `OutboxPlan`
- `emits_event` / `subscribes_event` edges vs. custom reaction edges
- `ctx.events` + `ctx.event_emissions` + `ctx.reactions`

This duplication means every improvement to delivery, diagnostics, or graph derivation must be implemented twice. It also prevents natural cross-pollination: a reaction cannot easily emit an event, and a subscription cannot easily trigger a reaction.

### Target Design

Extract a unified `Dispatch<Trigger, Handler>` primitive. Events and Reactions become two trigger flavors plugged into the same execution machinery. The public builder APIs (`gen.events.*`, `gen.reaction.*`) remain unchanged.

### Core Types

```ts
interface Dispatch<TIn, TOut> {
  readonly kind: "dispatch";
  readonly name: string;
  readonly trigger: Trigger<TIn>;
  readonly handler: Handler<TIn, TOut>;
  readonly delivery: DeliveryPlan;
  readonly idempotency: IdempotencyPlan;
}

type Trigger<T> = ExplicitTrigger<T> | DerivedTrigger<T> | ScheduleTrigger<T>;

interface ExplicitTrigger<T> {
  kind: "explicit";
  event: Event;
  correlation?: Expr;
}

interface DerivedTrigger<T> {
  kind: "derived";
  rule: Rule;
  mode: ReactionMode;
  select?: ExprFunction<unknown, T>;
}

type Handler<TIn, TOut> = ActionHandler<TIn, TOut> | SubscriptionHandler<TIn> | ReducerHandler<TIn>;
```

### Public API Preservation

The `gen.events` and `gen.reaction` namespaces keep their existing signatures. Internally they construct `Dispatch` values:

```ts
gen.events.emit(event, action);
// → Dispatch({ trigger: ExplicitTrigger(event), handler: ActionHandler(action) })

gen.events.subscription(event, handler);
// → Dispatch({ trigger: ExplicitTrigger(event), handler: SubscriptionHandler(handler) })

gen.events.reducer(name, field, events, combine);
// → Dispatch({ trigger: ExplicitTrigger(events), handler: ReducerHandler(...) })

gen.reaction.define({ when: rule, run: action, mode: "on_true" });
// → Dispatch({ trigger: DerivedTrigger({ rule, mode }), handler: ActionHandler(action) })
```

### Implementation Steps

1. **Extract shared delivery primitives.**
   - Move `DeliveryPlan`, `OutboxPlan`, `IdempotencyPlan`, and `RetryPolicy` into `src/delivery/index.ts`.
   - Ensure both `Event` and `Reaction` types import from the shared module.

2. **Create `Dispatch` IR in `src/dispatch/dispatch.ts`.**
   - Define `Dispatch`, `Trigger`, `Handler`, and their variants.
   - Provide constructors: `createDispatch`, `explicitTrigger`, `derivedTrigger`, `actionHandler`, `subscriptionHandler`, `reducerHandler`.
   - Ensure all constructors preserve full type inference for `TIn` and `TOut`.

3. **Rewrite `src/events/events.ts` as a thin wrapper.**
   - `defineEvent`, `emit`, `defineSubscription`, `defineReducer` construct `Dispatch` values internally.
   - Export the same public types (`Event`, `EventEmission`, `Reducer`, `Subscription`) but model them as views over `Dispatch`.
   - Keep `Event.emitted_by` as a derived property (collect actions from explicit triggers).

4. **Rewrite `src/reaction/reaction.ts` as a thin wrapper.**
   - `defineReaction`, `reaction` builder construct `Dispatch` values with `DerivedTrigger`.
   - Export `Reaction` as a view over `Dispatch`.
   - Preserve `when`, `run`, `select`, `mode`, `idempotency`, `delivery`, `outbox` accessors.

5. **Unify context storage.**
   - Replace `ctx.events`, `ctx.event_emissions`, `ctx.reactions` with `ctx.dispatches: Dispatch[]`.
   - Add computed getters for backward compatibility:
     ```ts
     get events(): Event[] { return this.dispatches.filter(isExplicit).map(toEventView); }
     get reactions(): Reaction[] { return this.dispatches.filter(isDerived).map(toReactionView); }
     ```
   - Update `GenContext` type and `createGen` factory.

6. **Merge lifecycle diagnostics.**
   - Replace `checkEvents()` and `checkReactions()` with `checkDispatches()`.
   - Map all existing diagnostic codes to unified `dispatch:*` codes:
     - `events:duplicate-payload-field` → `dispatch:duplicate-payload-field`
     - `events:emitted-by-no-emission` → `dispatch:trigger-missing-source`
     - `events:emission-not-listed` → `dispatch:emission-not-listed`
     - `events:reducer-event-no-source` → `dispatch:reducer-source-missing`
     - `events:non-associative-reducer` → `dispatch:non-associative-reducer`
     - `events:reducer-type-mismatch` → `dispatch:reducer-type-mismatch`
     - `events:effectful-emission` → `dispatch:effectful-emission`
     - `events:subscription-input-mismatch` → `dispatch:handler-input-mismatch`
     - `reaction:duplicate-name` → `dispatch:duplicate-name`
     - `reaction:condition-not-boolean` → `dispatch:derived-trigger-not-boolean`
     - `reaction:run-not-action` → `dispatch:handler-not-action`
     - `reaction:missing-idempotency-key` → `dispatch:missing-idempotency-key`
     - `reaction:side-effect-without-delivery-plan` → `dispatch:missing-delivery-plan`
     - `reaction:input-selection-mismatch` → `dispatch:handler-input-mismatch`
     - `reaction:unsafe-inline-effect` → `dispatch:unsafe-inline-effect`
     - `reaction:outbox-delivery-mismatch` → `dispatch:outbox-delivery-mismatch`
     - `reaction:outbox-invalid-retries` → `dispatch:outbox-invalid-retries`
     - `reaction:outbox-invalid-delay` → `dispatch:outbox-invalid-delay`
   - Preserve the same severity, message, and suggestion content.

7. **Unify graph derivation.**
   - Replace `emits_event` / `subscribes_event` edges with `produces` / `consumes` edges on `Dispatch` nodes.
   - Update `deriveReactiveGraph` to traverse `ctx.dispatches`.
   - Ensure graph node IDs remain stable for existing tests.

8. **Unify obligation generation.**
   - Update `deriveObligationGraph` to consume `ctx.dispatches`.
   - Map explicit dispatches to `event_delivery_test`, `event_subscription_test`, `event_reducer_test`.
   - Map derived dispatches to `reaction_delivery_test`.

9. **Adapt `Dispatch` to `StaticNode`.**
   - Add `Dispatch` adapter to the canonical node adapter protocol from TYPE3/TYPE4.
   - Map dispatch traits: `callable` (via handler), `effectful` (via action handlers), `requires` (via handler requirements), `plan` (for workflow composition).
   - Ensure adapted nodes preserve trigger, handler, delivery, and idempotency metadata.

10. **Add requirement/effect bubbling for dispatches.**
    - A dispatch's requirements are the union of its trigger requirements (e.g., rule dependencies) and handler requirements.
    - A dispatch's effects are the union of its handler effects.
    - Feed into TYPE6's plan requirement/effect aggregation.

11. **Add cross-pollination constructors (additive).**
    - `gen.dispatch.onEvent(event, action)` — sugar for explicit trigger + action handler.
    - `gen.dispatch.onRule(rule, action, options)` — sugar for derived trigger + action handler.
    - `gen.dispatch.reduce(event, field, combine)` — sugar for explicit trigger + reducer handler.
    - These are optional conveniences, not replacements for `gen.events.*` and `gen.reaction.*`.

12. **Add target fixtures.**
    - Add a fixture target that consumes `Dispatch` delivery IR (outbox, job queue, webhook) and emits representative artifacts.
    - At least one fixture must cover explicit triggers, one must cover derived triggers.

13. **Update tests.**
    - Migrate existing `events.test.ts` and `reactivity.test.ts` assertions to use `ctx.dispatches`.
    - Add tests proving public API (`gen.events.*`, `gen.reaction.*`) still works unchanged.
    - Add tests proving cross-pollination: reaction emits event, subscription triggers reaction.
    - Add tests for `checkDispatches` covering unified diagnostics.
    - Add tests for dispatch node adaptation and requirement bubbling.
    - Add tests for target fixture generation.

### Diagnostics

```txt
dispatch:duplicate-name
dispatch:duplicate-payload-field
dispatch:trigger-missing-source
dispatch:emission-not-listed
dispatch:derived-trigger-not-boolean
dispatch:handler-not-action
dispatch:handler-input-mismatch
dispatch:missing-delivery-plan
dispatch:missing-idempotency-key
dispatch:effectful-emission
dispatch:unsafe-inline-effect
dispatch:outbox-delivery-mismatch
dispatch:outbox-invalid-retries
dispatch:outbox-invalid-delay
dispatch:reducer-source-missing
dispatch:non-associative-reducer
dispatch:reducer-type-mismatch
dispatch:requirements-not-bubbled
dispatch:effects-not-bubbled
dispatch:adapter-missing-trigger
dispatch:adapter-missing-handler
dispatch:delivery-target-unsupported
```

### Lighter Alternative (Escape Hatch)

If the full refactor proves too large within this milestone, implement this phased subset instead:

1. Extract shared `DeliveryPlan`, `OutboxPlan`, `IdempotencyPlan` into `src/delivery/index.ts`.
2. Make `Event` and `Reaction` both implement `EffectfulExecution` (shared interface for delivery + idempotency).
3. Unify graph edges to `produces` / `consumes`.
4. Allow reactions to emit events (bridge).
5. Allow event subscriptions to trigger reactions (bridge).
6. Keep separate context arrays but derive a unified `ctx.effectful_executions` view.

This gives 70% of the benefit with 30% of the refactor. The full `Dispatch` model can then follow in a later phase.

### Acceptance Criteria

1. `src/dispatch/dispatch.ts` exists with typed `Dispatch`, `Trigger`, and `Handler` IR.
2. `gen.events.*` and `gen.reaction.*` public APIs are unchanged and pass existing tests.
3. `checkDispatches` replaces `checkEvents` + `checkReactions` with no loss of diagnostic coverage.
4. Unified `dispatch:*` diagnostic codes cover all prior `events:*` and `reaction:*` cases.
5. `ctx.dispatches` replaces `ctx.events` + `ctx.event_emissions` + `ctx.reactions`.
6. Graph derivation uses unified `produces` / `consumes` edges.
7. `Dispatch` adapts to typed `StaticNode` through the canonical adapter protocol.
8. Dispatch requirements and effects bubble through plan composition.
9. At least one fixture target consumes `Dispatch` delivery IR for explicit triggers.
10. At least one fixture target consumes `Dispatch` delivery IR for derived triggers.
11. Cross-pollination tests prove reactions can emit events and subscriptions can trigger reactions.
12. `vp check` and `vp test` pass.

---

## Milestone TYPE13: Unified Callable Base Interface

### Problem

`StaticFunction`, `ExprFunction`, `PredicateFunction`, `QueryFunction`, `ActionFunction`, `PatchFunction`, and `PlanFunction` in `src/function/function.ts` all share ~90% identical fields: `id`, `ref`, `name`, `traits`, `input_type`, `output_type`, `requirements`, `effects`, `laws`, `target_runtimes`, `callPlan`, `symbol`, and four phantom type slots each.

The `capabilities` field is always `[]` in practice (verified across all tests and source usage). It exists on every function type but serves no purpose. Adding a universal field (e.g., `boundary_plan`, `offline_plan`, `authz_policy`) currently requires touching seven interfaces. The phantom slots (`_input`, `_output`, `_errors`, `_requires`, `_effects`) are copy-pasted across all seven. Node adapters must handle each function kind separately. Target fixtures consume each kind through separate code paths.

### Target Design

Extract a `Callable<Body, In, Out, Err, Req, Eff>` base interface. All seven function kinds extend it with body-specific fields. Node adapters adapt `Callable` generically. Target fixtures consume `Callable` without body-specific knowledge where possible.

Effects on a `Callable` are typed IR (`Effect[]`). When a `Callable` adapts to a `StaticNode`, the node adapter derives `effectful` traits from the effects array (e.g., `"effectful:network"`, `"effectful:db_write"`). This means effects are typed metadata at the function level and discoverable traits at the node level.

### Core Types

```ts
interface Callable<Body, In, Out, Err, Req, Eff> {
  readonly id?: FunctionId;
  readonly ref?: FunctionRef<In, Out>;
  readonly name: string;
  readonly traits?: readonly TraitKind[];
  readonly input_type: SemanticType<In>;
  readonly output_type: SemanticType<Out>;
  readonly body: Body;
  readonly requirements: readonly Requirement[];
  readonly effects: readonly Effect[];
  readonly laws: readonly Law[];
  readonly target_runtimes: readonly Runtime[];
  readonly callPlan?: CallPlan<In, Out>;
  readonly symbol?: SymbolMetadata;
  readonly _input?: In;
  readonly _output?: Out;
  readonly _errors?: Err;
  readonly _requires?: Req;
  readonly _effects?: Eff;
}

interface ActionFunction<In, Out, ...>
  extends Callable<ActionExpr, In, Out, ...> {
  readonly invalidates: readonly QueryFunction[];
  readonly optimistic?: PatchFunction;
  readonly consistency: "transactional" | "eventual" | "best_effort";
  readonly written_stores: readonly Store[];
  readonly auth?: PolicyAction;
  readonly errors: readonly ErrorType[];
}
```

### Implementation Steps

1. Define `Callable` in `src/function/function.ts` before the existing function interfaces.
2. **Remove `capabilities` from all function types.** Delete the field from `StaticFunction`, `ExprFunction`, `PredicateFunction`, `QueryFunction`, `ActionFunction`, `PatchFunction`, and `PlanFunction`.
3. Make each existing function interface extend `Callable` with its body type and extra fields.
4. Ensure phantom type slots are inherited from `Callable` and not redeclared.
5. Update `src/core/node.ts` node adapter protocol: add `callable` adapter that matches any `Callable` without body-specific checks.
6. In the `callable` adapter, derive effect traits from `callable.effects`:
   ```ts
   const effectTraits = callable.effects.map((e) => `effectful:${e.kind}` as PluginTraitKind);
   return {
     traits: ["callable", "effectful", ...effectTraits],
     // ...
   };
   ```
7. Update TYPE4 function adapter implementation to use `Callable` for generic trait mapping.
8. Ensure `checkFunctions` and `checkFunctionRuntimes` in lifecycle can iterate over `Callable[]`.
9. Add tests proving all seven function kinds still satisfy their existing structural assertions.
10. Add tests proving a generic `isCallable` guard works across all function kinds.
11. Add tests proving adapted nodes derive effect traits from the source function's effects.

### Diagnostics

```txt
callable:missing-body
callable:missing-input-type
callable:missing-output-type
callable:adapter-missing-body
callable:adapter-effect-trait-derivation-failed
```

### Acceptance Criteria

1. `Callable` base interface exists with all shared fields.
2. `capabilities` is removed from all function types.
3. All seven function kinds extend `Callable` without redeclaring shared fields.
4. Existing tests for all function kinds pass unchanged.
5. A generic `Callable` adapter can adapt any function kind to `StaticNode`.
6. Adapted nodes derive `effectful:*` traits from the source function's effects.
7. `vp check` and `vp test` pass.

---

## Milestone TYPE14: Workflow Steps as ComposablePlan Views

### Problem

`src/workflow/workflow.ts` defines 15 step kinds (`WorkflowSequenceStep`, `WorkflowParallelStep`, `WorkflowBranchStep`, `WorkflowRetryStep`, ...) that mirror plan combinators in `src/plan/plan.ts` (`SequencePlan`, `ParallelPlan`, `FallbackPlanNode`, `RetryPlan`, ...). The workflow module reimplements plan semantics instead of referencing them.

This means:

- `plan.chain` compatibility checks do not apply to workflow steps.
- Workflow sequences are not validated for input/output compatibility.
- Requirement/effect bubbling from TYPE6 does not reach workflows.

### Target Design

Workflow steps should be `ComposablePlan` nodes plus workflow-specific metadata. A workflow step is a plan with a metadata wrapper, not a separate step taxonomy.

### Core Types

```ts
interface WorkflowStep {
  readonly kind: "workflow_step";
  readonly plan: ComposablePlan;
  readonly metadata: WorkflowStepMetadata;
}

type WorkflowStepMetadata =
  | { kind: "checkpoint"; name: string }
  | { kind: "compensation"; rollback: ComposablePlan }
  | { kind: "wait"; duration_ms: number }
  | { kind: "wait_for_event"; event_type: string; correlation_key?: string }
  | { kind: "emit"; event: Event }
  | { kind: "cancel"; reason?: string };
```

### Implementation Steps

1. Define `WorkflowStep` and `WorkflowStepMetadata` in `src/workflow/workflow.ts`.
2. Rewrite existing workflow step constructors (`workflowSequence`, `workflowParallel`, `workflowRetry`, ...) to produce `WorkflowStep` wrapping the corresponding `ComposablePlan`.
3. Preserve existing public API signatures (`gen.workflow.sequence`, `gen.workflow.parallel`, ...).
4. Update `checkWorkflows` to validate `WorkflowStep.plan` through `checkPlanCompatibility`.
5. Ensure workflow steps participate in TYPE6 requirement/effect bubbling.
6. Update graph derivation to traverse `WorkflowStep.plan` for reactive edges.
7. Add tests proving workflow sequences are validated for input/output compatibility.
8. Add tests proving workflow steps bubble requirements and effects.

### Diagnostics

```txt
workflow:step-plan-incompatible
workflow:step-missing-metadata
workflow:step-unsupported-plan-kind
```

### Acceptance Criteria

1. `WorkflowStep` wraps `ComposablePlan` with `WorkflowStepMetadata`.
2. Existing workflow builder API (`gen.workflow.sequence`, etc.) passes unchanged tests.
3. Workflow sequences are validated for chain compatibility.
4. Workflow steps bubble requirements and effects.
5. `vp check` and `vp test` pass.

---

## Milestone TYPE15: StoredValue Unification (StateResource + OfflineQueuePlan)

### Problem

`StateResource` (`src/state/state.ts`) and `OfflineQueuePlan` (`src/offline/offline.ts`) both describe a value stored somewhere with access controls, persistence, sensitivity, and key semantics. They are 70% the same concept but modeled independently.

```ts
// StateResource
readonly storage: StorageLocation;
readonly readable_by: StateAccess;
readonly writable_by: StateAccess;
readonly reactive: boolean;
readonly sensitivity?: Sensitivity;
readonly lifetime?: ProviderLifetime;
readonly hydrate?: boolean;

// OfflineQueuePlan
readonly storage: StorageLocation;
readonly persistence: boolean;
readonly encryption_required: boolean;
readonly drain_trigger?: "online" | "manual" | "scheduled";
readonly sensitivity?: Sensitivity;
```

Target fixtures in `src/targets/client.ts` handle `state_resources` and `offline_queues` in separate loops with duplicated logic.

### Target Design

Extract `StoredValue<Value, KeyPayload>` as a shared primitive. `StateResource` and `OfflineQueuePlan` become views over `StoredValue` with different defaults.

### Core Types

```ts
interface StoredValue<Value, KeyPayload> {
  readonly kind: "stored_value";
  readonly name: string;
  readonly value_type: SemanticType<Value>;
  readonly storage: StorageLocation;
  readonly key_family?: KeyFamily<KeyPayload>;
  readonly access: { readonly: StateAccess; write: StateAccess };
  readonly persistence: boolean;
  readonly encryption?: boolean;
  readonly sensitivity?: Sensitivity;
  readonly lifetime?: ProviderLifetime;
  readonly hydrate?: boolean;
  readonly reactive?: boolean;
}
```

### Implementation Steps

1. Define `StoredValue` in `src/storage/stored-value.ts`.
2. Rewrite `StateResource` as a thin wrapper: `StoredValue` with `reactive=true`, `hydrate=true`.
3. Rewrite `OfflineQueuePlan` as a thin wrapper: `StoredValue` with `persistence=true`, `encryption=true`.
4. Update `GenContext` to store `stored_values: StoredValue[]` with computed getters for `state_resources` and `offline_queues`.
5. Merge `checkStateResources` and `checkOfflinePlans` into `checkStoredValues`.
6. Update `src/targets/client.ts` to consume `StoredValue` generically.
7. Add tests proving both wrappers still pass existing structural assertions.
8. Add tests proving a generic stored-value target fixture handles both.

### Diagnostics

```txt
stored_value:missing-storage
stored_value:unsafe-client-write
stored_value:sensitive-unencrypted
stored_value:duplicate-name
```

### Acceptance Criteria

1. `StoredValue` primitive exists with full type parameters.
2. `StateResource` and `OfflineQueuePlan` are views over `StoredValue`.
3. Existing state and offline tests pass unchanged.
4. Client target consumes `StoredValue` generically.
5. `vp check` and `vp test` pass.

---

## Milestone TYPE16: Combiner Unification (MergeStrategy + MonoidOp)

### Problem

`MergeStrategy` (`src/merge/merge.ts`) and `MonoidOp` (`src/events/events.ts`) both describe associative/commutative/idempotent operations for combining values. Event reducers and offline merge strategies share algebraic properties but use different types.

```ts
// MergeStrategy
readonly operation: "replace" | "last_write_wins" | "sum_delta" | "append" | ...;
readonly associative?: boolean;
readonly commutative?: boolean;
readonly idempotent?: boolean;
readonly invertible?: boolean;
readonly monotonic?: boolean;

// MonoidOp
readonly associative: boolean;
readonly commutative: boolean;
readonly idempotent: boolean;
```

### Target Design

Unify on `Combiner<T, Delta>` with a full operation taxonomy and algebraic flags.

### Core Types

```ts
interface Combiner<T, Delta = T> {
  readonly kind: "combiner";
  readonly name: string;
  readonly operation: CombinerOp;
  readonly input_type: SemanticType<T>;
  readonly output_type: SemanticType<T>;
  readonly delta_type?: SemanticType<Delta>;
  readonly associative: boolean;
  readonly commutative: boolean;
  readonly idempotent: boolean;
  readonly invertible: boolean;
  readonly monotonic: boolean;
}
```

### Implementation Steps

1. Define `Combiner` and `CombinerOp` in `src/combiner/combiner.ts`.
2. Rewrite `MonoidOp` as a view over `Combiner` with limited operation subset.
3. Rewrite `MergeStrategy` to use `Combiner` for its operation and flags.
4. Update `defineReducer` to accept `Combiner`.
5. Update `defineMergeStrategy` to construct `Combiner` internally.
6. Update `checkEvents` and `checkOfflinePlans` to validate `Combiner` properties.
7. Add tests proving reducers and merge strategies share algebraic validation.
8. Add tests proving a generic `Combiner` can be used in both contexts.

### Diagnostics

```txt
combiner:non-associative
combiner:type-mismatch
combiner:missing-delta-type
combiner:unsupported-operation
```

### Acceptance Criteria

1. `Combiner` primitive exists with full algebraic flags.
2. `MonoidOp` and `MergeStrategy` are views over `Combiner`.
3. Existing reducer and merge tests pass unchanged.
4. Algebraic validation is unified across events and offline modules.
5. `vp check` and `vp test` pass.

---

## Milestone TYPE17: Execution Footprint Unification (EffectKind + CapabilityKind)

### Problem

`EffectKind` (`src/types/operation.ts`, lines 127-142) and `CapabilityKind` (`src/types/operation.ts`, lines 51-94) describe the same concept from two sides:

- **EffectKind** (demand side): what an operation produces — `network`, `email`, `db_write`, `crypto`, `fs_read`...
- **CapabilityKind** (supply side): what a runtime supports — `network`, `filesystem`, `crypto`, `web_crypto`, `dom`, `fetch`, `timers`...

But `CapabilityKind` is a grab-bag of three unrelated concepts:

1. **Behavioral properties** (should be `Law`s): `pure`, `deterministic`, `reversible`, `async`, `effectful`, `transactional`, `idempotent_effect`, `cacheable`, `partial`, `total`
2. **Environmental features** (overlap with `EffectKind`): `network`, `filesystem`, `crypto`, `web_crypto`, `dom`, `fetch`, `timers`
3. **Runtime/database features** (legitimate): `joins`, `aggregates`, `window_functions`, `jsonb`, `transactions`, `row_locks`, `foreign_keys`, `subqueries`, `recursive_ctes`, `full_text_search`, `extensions`, `queues`, `workers`, `streams`, `kv_store`, `conditional_writes`, `atomic_increments`, `analytics`, `columnar`, `append_only`, `ttl`

Additionally, `capabilities` on functions is always `[]` in practice. Every test and every constructor call passes `capabilities: []` or omits it. The field exists on all seven function types but serves no purpose.

`checkFunctionRuntimes` (`src/function/function.ts`, lines 608-634) currently validates effects against runtime capabilities:

```ts
if (!runtime.capabilities.includes(effect.kind)) {
  // error: effect not supported by runtime
}
```

This only works because `CapabilityKind` accidentally includes some effect strings. It's an accident of type design, not intentional architecture.

### Target Design

1. **Unify `EffectKind` and environmental `CapabilityKind` into `ExecutionFootprint`.**
   This is the single source of truth for "what can this code do / what can this runtime support."

2. **Move behavioral properties to `LawKind`.**
   `pure`, `deterministic`, `async`, `idempotent`, `cacheable`, `atomic` become laws on operations.

3. **Move runtime/database features to `RuntimeFeature` (or `Capacity`).**
   `joins`, `aggregates`, `transactions`, etc. become runtime capacities.

4. **Remove `capabilities` from functions.**
   The field is unused. Function behavior is described by `effects`, `requirements`, and `laws`.

5. **Rename `Runtime.capabilities` to `Runtime.capacities`.**
   A runtime has capacities (what it can hold/support), not capabilities.

6. **Derive effect traits from `effects[]` in node adapters.**
   When a function adapts to `StaticNode`, the adapter derives traits like `"effectful:network"` from the function's effects. Effects are typed IR at the function level and discoverable traits at the node level.

### Core Types

```ts
// Single source of truth for execution footprint
type ExecutionFootprint =
  | "network"
  | "email"
  | "db_read"
  | "db_write"
  | "fs_read"
  | "fs_write"
  | "crypto"
  | "clock"
  | "random"
  | "queue"
  | "payment"
  | "cache_read"
  | "cache_write"
  | BrandFootprint<string, string>;

// Function declares what it does
interface Effect {
  readonly kind: ExecutionFootprint;
}

// Runtime declares what it supports
interface Runtime {
  readonly name: string;
  readonly capacities: readonly RuntimeFeature[];
}

type RuntimeFeature =
  | "joins"
  | "aggregates"
  | "window_functions"
  | "jsonb"
  | "transactions"
  | "row_locks"
  | "foreign_keys"
  | "subqueries"
  | "recursive_ctes"
  | "full_text_search"
  | "extensions"
  | "queues"
  | "workers"
  | "streams"
  | "kv_store"
  | "conditional_writes"
  | "atomic_increments"
  | "analytics"
  | "columnar"
  | "append_only"
  | "ttl"
  | BrandFeature<string, string>;

// Laws are behavioral properties, not environmental effects
type LawKind =
  | "associative"
  | "commutative"
  | "idempotent"
  | "identity"
  | "pure_function"
  | "deterministic"
  | "reversible"
  | "async"
  | "atomic"
  | "cacheable"
  | BrandLaw<string, string>;
```

### Implementation Steps

1. **Define `ExecutionFootprint` in `src/types/operation.ts`.**
   - Combine all `EffectKind` values plus environmental features from `CapabilityKind`.
   - Replace `EffectKind` with `ExecutionFootprint`.

2. **Define `RuntimeFeature` in `src/types/runtime.ts`.**
   - Extract database/runtime features from `CapabilityKind`.
   - Remove behavioral properties (`pure`, `deterministic`, etc.).

3. **Extend `LawKind` in `src/types/operation.ts`.**
   - Add `pure_function`, `deterministic`, `reversible`, `async`, `atomic`, `cacheable`.
   - Remove `idempotent_effect` (replaced by `idempotent` law).

4. **Remove `capabilities` from all function types.**
   - Delete `capabilities` from `StaticFunction`, `ExprFunction`, `PredicateFunction`, `QueryFunction`, `ActionFunction`, `PatchFunction`, `PlanFunction`.
   - Update all constructors (`defineStaticFunction`, `defineActionFunction`, etc.) to remove `capabilities` parameter.
   - Update all call sites (tests, builders, CRUD) that pass `capabilities: []`.

5. **Update `Runtime` interface.**
   - Rename `capabilities` to `capacities`.
   - Change type from `CapabilityKind[]` to `RuntimeFeature[]`.

6. **Update `Store` interface.**
   - Change `capabilities: readonly string[]` to `capacities: readonly RuntimeFeature[]`.

7. **Update `checkFunctionRuntimes`.**
   - Change the check from `runtime.capabilities.includes(effect.kind)` to a mapping function.
   - Effects are `ExecutionFootprint`. Runtimes have `RuntimeFeature`.
   - The mapping is explicit: `db_write` effect requires `transactions` capacity. `network` effect requires no runtime feature (it just means the code talks to the network).
   - For effects that map directly to runtime features (e.g., `crypto` effect -> `crypto` feature), the check is straightforward.
   - For effects that don't map (e.g., `email`), the check always passes (any runtime can send email if it has network access).

8. **Update node adapters to derive effect traits.**
   - In the `callable` adapter (TYPE13), map `callable.effects` to plugin traits:
     ```ts
     const effectTraits = callable.effects.map((e) => `effectful:${e.kind}` as PluginTraitKind);
     ```
   - The node gets traits `["callable", "effectful", "effectful:network", "effectful:db_write"]`.

9. **Update `checkQueryFunctionRuntimes`.**
   - Query requirements (`req.kind`) currently checked against `runtime.capabilities`.
   - Change to check against `runtime.capacities` for runtime features.
   - For query requirements that are operation names (e.g., `"joins"`), check `runtime.capacities`.

10. **Update all tests.**
    - Remove `capabilities: []` from all function constructor calls.
    - Update `runtime({ capabilities: [...] })` to `runtime({ capacities: [...] })`.
    - Update `store({ capabilities: [...] })` to `store({ capacities: [...] })`.
    - Add tests proving effect trait derivation works.
    - Add tests proving `checkFunctionRuntimes` validates effects against capacities.

### Diagnostics

```txt
footprint:unsupported-effect
footprint:runtime-missing-capacity
footprint:deprecated-capability-kind
footprint:effect-trait-derivation-failed
footprint:behavioral-property-should-be-law
```

### Acceptance Criteria

1. `ExecutionFootprint` unifies `EffectKind` and environmental `CapabilityKind`.
2. `RuntimeFeature` extracts runtime/database features from `CapabilityKind`.
3. `LawKind` includes behavioral properties (`pure_function`, `deterministic`, `async`, `atomic`, `cacheable`).
4. `capabilities` is removed from all function types.
5. `Runtime.capacities` replaces `Runtime.capabilities`.
6. `Store.capacities` replaces `Store.capabilities`.
7. Node adapters derive `effectful:*` traits from function effects.
8. Existing runtime validation tests pass with the new model.
9. `vp check` and `vp test` pass.

## Cross-Cutting Type Safety Rules

Phase 5 should enforce these rules across all milestones:

1. Public APIs should infer from values, not require explicit generic arguments for normal use.
2. Tests and examples must not use `as any`, `as unknown as`, or `as never`.
3. Internal casts must be narrow, localized, and commented when they preserve inference.
4. Prefer `typeof actualFunction` namespace signatures to preserve overloads and generics.
5. Prefer `satisfies` for namespace object shape checking.
6. Do not erase concrete IR metadata when adapting to nodes.
7. Runtime diagnostics must remain even when type-level constraints exist.
8. Plugin-defined nodes must be able to participate without hardcoded kind checks.
9. Type-level checks should reject impossible composition; diagnostics should explain uncertain or unsafe composition.
10. Existing direct-constructor workflows must keep working.
11. Traits must preserve the underlying TypeScript value type unless explicitly modeled as a transformation.
12. Traits may reference rules, laws, capabilities, and expressions, but must not collapse those concepts into one abstraction.

## Required Test Style

Every milestone must include tests that prove both success and failure behavior.

Use this pattern:

```txt
positive inference test
  proves normal user code infers without explicit generic arguments

negative compatibility test
  proves invalid composition fails by type test or diagnostic

runtime shape test
  proves the produced IR contains expected metadata

lifecycle diagnostic test
  proves unsafe semantic cases are reported through checks
```

Do not rely only on snapshots. Prefer structural assertions against fields such as `kind`, `name`, `traits`, `input`, `output`, `requirements`, `effects`, `diagnostics`, and `source`.

Do not use casts in tests to make examples compile. If the test needs a cast, either the public API is not inference-safe yet or the test is not a valid user scenario.

## Safe Implementation Order Inside A Milestone

Use this exact order unless the milestone says otherwise:

1. Read the existing module and tests.
2. Add or update types with no runtime behavior change.
3. Add the required production constructor/helper.
4. Add runtime diagnostics or checker integration.
5. Add tests for inference, shape, and diagnostics.
6. Run `vp check` and `vp test`.
7. Update target fixtures or downstream derivations after tests cover the core IR and diagnostics.

If a downstream change requires many unrelated edits, stop and add a compatibility note instead of widening the milestone.

## Cross-Cutting Diagnostic Code Families

Required diagnostic families include:

```txt
gen:namespace-member-missing
gen:namespace-member-conflict
gen:plugin-helper-runtime-mismatch
trait:invalid-target-kind
trait:applies-to-mismatch
trait:conflict
trait:implied-trait-missing
trait:validation-not-boolean
trait:storage-type-mismatch
trait:effect-not-allowed
trait:required-capability-missing
trait:required-law-missing
trait:target-interpretation-missing
node:adapter-unsupported-source
node:adapter-missing-input-type
node:adapter-missing-output-type
node:adapter-trait-mismatch
node:callable-trait-missing-call-plan
node:effectful-trait-missing-effects
node:keyed-trait-missing-key
node:reactive-trait-missing-reactivity
node:target-interpretable-missing-lowering
node:function-adapter-missing-body
node:resource-adapter-missing-query
node:mutation-adapter-missing-action
node:adapted-node-duplicate-graph-entry
plan:chain-input-output-mismatch
plan:chain-missing-input-type
plan:chain-missing-output-type
plan:dynamic-chain-not-portable
plan:requirements-not-bubbled
plan:effects-not-bubbled
plan:parallel-effects-conflict
rules:predicate-lowering-unsupported
rules:predicate-type-mismatch
rules:rule-expr-effect-not-allowed
rules:opaque-predicate-not-portable
law:required-law-missing
law:law-claim-unverified
law:operation-law-mismatch
law:opaque-operation-law-unknown
registry:duplicate-name
registry:name-not-literal
registry:unknown-reference
binder:signature-runtime-mismatch
target:composed-node-unsupported
target:adapted-node-source-required
target:capability-missing-for-composition
dispatch:duplicate-name
dispatch:duplicate-payload-field
dispatch:trigger-missing-source
dispatch:emission-not-listed
dispatch:derived-trigger-not-boolean
dispatch:handler-not-action
dispatch:handler-input-mismatch
dispatch:missing-delivery-plan
dispatch:missing-idempotency-key
dispatch:effectful-emission
dispatch:unsafe-inline-effect
dispatch:outbox-delivery-mismatch
dispatch:outbox-invalid-retries
dispatch:outbox-invalid-delay
dispatch:reducer-source-missing
dispatch:non-associative-reducer
dispatch:reducer-type-mismatch
dispatch:requirements-not-bubbled
dispatch:effects-not-bubbled
dispatch:adapter-missing-trigger
dispatch:adapter-missing-handler
dispatch:delivery-target-unsupported
footprint:unsupported-effect
footprint:runtime-missing-capacity
footprint:deprecated-capability-kind
footprint:effect-trait-derivation-failed
footprint:behavioral-property-should-be-law
```

Every diagnostic should include:

1. the semantic object or node involved;
2. the trait, rule, law, capability, input/output, requirement, or effect involved when relevant;
3. expected input/output/requirement/effect/law/trait target when relevant;
4. actual input/output/requirement/effect/law/trait target when relevant;
5. whether the issue is a hard error, warning, info, or degraded plan;
6. whether generation may continue safely;
7. the selected fallback, if one exists;
8. a suggested fix.

## Error Policy

Use this policy unless a milestone specifies otherwise:

1. **Hard error:** The compiler would generate type-invalid or unsafe runtime behavior. Examples: chain output cannot feed next input, missing required provider from a plan, secret crossing client boundary, invalid trait target, trait validation expression returning a non-boolean, non-idempotent offline replay without dedupe.
2. **Warning:** The compiler can generate correct but degraded behavior. Examples: unknown law causes refetch fallback, opaque node blocks target-specific optimization, broad invalidation replaces patching.
3. **Info:** The compiler made a conservative but expected choice. Examples: manual key expression used for opaque external dependency.
4. **Degraded:** A preferred typed composition cannot be proven, but an explicit safe fallback is selected.

## What To Keep

Phase 5 should protect the good parts of the current architecture:

1. Keep `SemanticType<T>` as the root type-safety primitive.
2. Keep direct object-value composition. Users should pass typed IR values, not string names.
3. Keep `createGen` as a lightweight namespace/context factory.
4. Keep `GenContext` as a runtime graph rather than forcing it to be a type-level database.
5. Keep plugins additive through helper shapes, node kinds, lowerings, checks, and targets.
6. Keep closed expression IR where targets need exhaustiveness.
7. Keep open `StaticNode` traits where application-level extensibility matters.
8. Keep lifecycle diagnostics as the semantic safety layer.
9. Keep targets as interpretations of IR, not sources of business logic.
10. Keep public constructors ergonomic and inference-friendly.
11. Keep rules pure and traits descriptive; let traits reference rules for validation rather than becoming rules.
12. Keep laws separate from traits; traits may require laws, but laws remain algebraic facts about operations.

## Final Phase 5 Completion Criteria

Phase 5 is complete when all of the following are true:

1. Namespace factory runtime shapes are checked against namespace interface shapes.
2. Semantic traits, node traits, rules, laws, and capabilities are modeled distinctly and checked coherently.
3. Trait applications preserve type inference and produce diagnostics for invalid targets, conflicts, invalid validation/storage expressions, and unsupported target interpretations.
4. Canonical function/resource/workflow objects can adapt to typed `StaticNode`s without metadata loss.
5. Trait-based plan composition works over adapted built-in objects and plugin-defined nodes.
6. `plan.chain` enforces known input/output compatibility and diagnoses unknown or opaque compatibility.
7. Plan composition bubbles requirement/effect information at runtime and in type slots where practical.
8. Rules can lower to, or interoperate cleanly with, canonical predicate/expression IR.
9. Laws are consumed by optimistic/offline/retry/merge/reducer planning with clear diagnostics.
10. Optional typed registry building exists as a production-quality additive API.
11. Public API inference is audited for the core constructor path.
12. Fixture targets prove composed typed IR can be consumed without private internals.
13. Events and Reactions unify into a single `Dispatch` primitive with shared delivery, diagnostics, graph edges, and node adaptation.
14. Function types (`StaticFunction`, `ExprFunction`, `QueryFunction`, `ActionFunction`, `PatchFunction`, `PlanFunction`, `PredicateFunction`) share a unified `Callable` base interface.
15. Workflow steps are views over `ComposablePlan` with metadata, reusing plan compatibility and requirement/effect bubbling.
16. `StateResource` and `OfflineQueuePlan` unify into a shared `StoredValue` primitive.
17. `MergeStrategy` and `MonoidOp` unify into a shared `Combiner` primitive with algebraic flags.
18. `ExecutionFootprint` unifies `EffectKind` and environmental `CapabilityKind`; `RuntimeFeature` extracts runtime features; behavioral properties move to `LawKind`.
19. `capabilities` is removed from all function types; `Runtime.capacities` and `Store.capacities` replace `capabilities`.
20. Node adapters derive `effectful:*` traits from function effects.
21. Existing direct `gen.*` construction style remains supported.
22. Plugin-defined extensions remain type-safe and composable.
23. `vp check` and `vp test` pass after every completed milestone.

## Phase 5 Summary

Phase 5 should make the library feel less like many adjacent typed modules and more like one coherent typed semantic graph.

The intended result is:

```txt
Typed primitives compose into larger typed IR.
Larger typed IR adapts into open trait-bearing nodes.
Nodes compose safely through plans and workflows.
Traits describe reusable semantic behavior.
Rules and laws explain semantic safety.
Diagnostics explain what TypeScript cannot prove.
Targets interpret the same graph without private knowledge.
```

This phase is successful when the type-safety story is not only true in isolated constructors, but remains true across chains, plans, providers, rules, dispatches, reactivity, plugins, and targets.
