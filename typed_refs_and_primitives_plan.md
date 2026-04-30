# Typed Refs and Open Primitives Implementation Plan

This plan implements the direction from `magic-strings.md` and `primitive_plan.md` in the current `gen2` codebase. It is intentionally incremental: preserve existing authoring ergonomics while moving the internal model toward typed refs, stable IDs, trait-capable static nodes, and trait-based consumers.

## Current Architecture Snapshot

- `src/core/refs.ts` already defines a generic `Ref<Ts>` with `kind`, `owner`, `name`, `value_type`, metadata, and phantom typing. It does not yet carry stable IDs or first-class typed ref aliases such as `EntityRef`, `FieldRef`, `FunctionRef`, `KeyFamilyRef`, or `MethodRef`.
- `src/entity/entity.ts` constructs field refs automatically on `Field.ref`, and `bindEntity` registers those refs into `ctx.refs`. `Entity` itself does not have a ref or stable ID.
- `src/relation/relation.ts` constructs relation refs and registers them in relation binders. Relation endpoint typing exists, but ownership constraints are currently runtime diagnostics in `bindRelation`, not compile-time entity-scoped field constraints.
- `src/expression/ast.ts` and `src/expression/builders.ts` already use refs for field and param AST nodes. `fieldRef(User.fields.id)` is present and type-safe at the field value level.
- `src/function/function.ts` models static, expr, predicate, query, action, patch, and plan functions as separate closed interfaces. They carry names, input/output semantic types, requirements/effects, and phantom inference helpers, but no `id`, `ref`, `traits`, or unified node shape.
- `src/core/context.ts` stores each node category in separate arrays. There is no `ctx.nodes` registry, no ref-first `ctx.get(ref)`, and no lowering registry.
- `src/core/plugin.ts` has a plugin system for helpers, targets, checks, codegen hooks, and contribution metadata. It does not yet allow plugin-defined node kinds, trait declarations, lowering hooks, or trait-based target acceptance.
- `src/services/services.ts` already has `ServiceRef` and `MethodRef`, but method refs are not linked to the generic `Ref` system and service requirements are still string-shaped (`Requirement.kind`).
- `src/reactivity/reactivity.ts` contains typed `KeyFamily<Payload>`, `ReactiveKey`, and `ReactiveKeyPattern`, but key families are named by strings only and graph IDs are mostly string-derived (`query:${name}`, `entity:${name}`, `app_route:${path}`).
- `src/router/router.ts` accepts concrete `QueryFunction | ReactiveResource` loaders and `ActionFunction | ReactiveMutation` actions. This is a good early target for trait-based ports.

## Target State

- Authoring APIs prefer object/typed refs: `Project.fields.status`, `Project.relations.members`, `canViewProject`, `CurrentActor`, `EmailService.methods.sendEmail`, `projectKeys.detail`.
- Persisted IR and generated graph artifacts use branded stable IDs, not mutable display names.
- Strings remain valid for external names only: display labels, DB table/column names, URL templates, cron expressions, env vars, target filenames, OpenAPI operation IDs, CSS classes, and explicitly branded stable IDs.
- First-class objects expose a shared `StaticNode` protocol: stable ID, kind, optional name, traits, input/output/error metadata, requirements/effects, metadata, and phantom slots.
- Built-ins remain ergonomic but also implement traits: functions are callable/readable/writable/effectful/keyed as appropriate; services methods are callable/effectful; routes consume trait contracts rather than closed concrete unions.
- Plugins can register node kinds, trait metadata, checkers, graph derivation hooks, target interpreters, and lowerings without global mutation.

## Non-Negotiable Invariants

- Public portable APIs must accept typed refs wherever a referenced object exists.
- Raw strings must not be used as internal references in new public APIs.
- Stable IDs are immutable identity; `name` is human-readable and renameable.
- Generated graph node IDs and artifact references must derive from stable IDs when available.
- Existing expression-level IR stays relatively closed and exhaustively handled by targets.
- Application-level nodes become open through traits and lowerings.
- Constructors return narrow specific types, not broad unions.
- Phantom type inference remains the source of API ergonomics; common user code must not need explicit type arguments.
- Tests and user-facing examples must not use `as`, `as unknown`, `as any`, or import-casts to satisfy APIs.
- Plugin-defined nodes must either be directly interpreted, lower to known IR, or emit diagnostics.

## Milestone 1: Stable ID and Ref Kernel

Goal: make refs suitable as durable identity without forcing all modules to migrate immediately.

Work:

- Add branded stable ID types in `src/core/refs.ts`, likely `StableId<Kind>`, with constructors such as `stableId`, `entityId`, `fieldId`, `relationId`, `functionId`, `keyFamilyId`, `contextId`, `serviceId`, and `methodId`.
- Extend `Ref<Ts>` with optional `id?: StableId<string>` first, then tighten important ref aliases to require IDs where appropriate.
- Add typed aliases around the existing `Ref` shape: `EntityRef<E>`, `FieldRef<E, Name, Ts>`, `RelationRef<From, To>`, `FunctionRef<In, Out, Err, Req, Eff>`, `RuleRef<Vars>`, `PolicyRef<E>`, `KeyFamilyRef<Payload>`, `ServiceRefValue<T>`, and `MethodRefValue<Service, In, Out>`.
- Add `refId(ref)` and `refIdentity(ref)` helpers. `refEquals` should prefer stable IDs when both refs have IDs and fall back to current kind/owner/name matching only for legacy refs.
- Add diagnostics codes for the ref migration: `ref:missing-stable-id`, `ref:raw-string-reference`, `ref:ambiguous-string-reference`, `ref:wrong-ref-kind`, `ref:unregistered-ref`, `ref:rename-without-stable-id`.

Considerations:

- Do not replace `Ref` outright. The existing `Field.ref` and relation refs are used throughout expressions, diagnostics, and tests.
- Stable ID constructors should brand values but remain lightweight runtime strings.
- Keep display names separate from IDs in docs and types.

Validation:

- Add type tests proving stable ID brands do not freely mix across entity/field/function IDs.
- Add unit tests for `refEquals` behavior with IDs and legacy fallback.
- Run `vp check` and `vp test`.

## Milestone 2: Entity, Field, and Relation Refs as First-Class Identity

Goal: entities and fields become the canonical typed refs for data model authoring and graph IDs.

Work:

- Add `id` and `ref` to `Entity`. Keep `defineEntity(name, fields, options)` initially, but extend options to accept `id?: EntityId`.
- Extend `FieldShapeInput` object form with `id?: FieldId`, `renamedFrom?: readonly string[]`, and possibly `external_name?: string` for storage targets.
- Make `Field.ref` a `FieldRef<typeof Entity, FieldName, Ts>`-style alias at the type level while preserving runtime compatibility with `Ref<Ts>`.
- Register `entity.ref` in `bindEntity` before field refs.
- Add relation stable IDs and typed `RelationRef` aliases; register all relation refs consistently, including shorthand relation constructors.
- Update graph ID derivation helpers in reactivity and relation graph code to prefer `ref.id` over names.

Considerations:

- `defineEntity` currently has the signature `defineEntity(name, fields, options)`. A future object-form `gen.entity.define({ id, name, fields })` is desirable, but this milestone should avoid forcing a large user-facing break unless the repo is ready for it.
- Field ID generation should be explicit for migration-grade stability. If omitted, emit warnings rather than silently pretending name-derived IDs are stable.
- Existing tests may assert string IDs like `entity:User`; update them only when the behavior intentionally changes.

Validation:

- Add tests for entity/field IDs, field rename metadata, and diagnostic emission for missing stable IDs.
- Add type tests for field ownership where feasible.
- Run `vp check` and `vp test`.

## Milestone 3: Ref-First Registry APIs

Goal: provide the authoring and compiler path for `ctx.get(Project)`, `ctx.get(Project.fields.status)`, and explicit string lookup only at import/tooling boundaries.

Work:

- Add a registry abstraction in `src/core/context.ts` or a new `src/core/registry.ts`.
- Add `ctx.nodes` later, but start with `ctx.ref_index` or helper functions that index existing arrays by `ref.id` and legacy ref identity.
- Implement `getByRef(ctx, ref)` and typed overloads for known ref aliases.
- Implement `lookupById(ctx, id)` as the explicit string/stable-ID boundary API.
- Add checker `checkRegisteredRefs(ctx)` to detect refs present inside expressions, policies, routes, functions, services, keys, and graph nodes that are not registered.

Considerations:

- Avoid making `GenContext` mutable maps mandatory until all binders register refs reliably.
- The first version can build the index on demand from existing context arrays.
- String lookup should not be removed; it should be demoted and clearly named as ID/tooling lookup.

Validation:

- Add tests for `getByRef` with entities, fields, relations, functions, key families, services, and methods as they become ref-backed.
- Add diagnostics tests for unregistered refs.
- Run `vp check` and `vp test`.

## Milestone 4: StaticNode and Trait Kernel

Goal: introduce the open primitive protocol without rewriting every built-in module at once.

Work:

- Create `src/core/node.ts` with `TraitKind`, `StaticNode`, `NodeMetadata`, `LowerableNode`, and generic inference helpers: `InferNodeInput`, `InferNodeOutput`, `InferNodeErrors`, `InferNodeRequirements`, `InferNodeEffects`, `InferNodeTraits`.
- Define minimal trait marker interfaces: `NamedNode`, `TypedNode`, `CallableNode`, `ReadableNode`, `WritableNode`, `EffectfulNode`, `RequiresNode`, `ReactiveNode`, `KeyedNode`, `PolicyProtectedNode`, `ResourceLikeNode`, `PlanNode`, `TargetInterpretableNode`, and later `ServerPlaceableNode`.
- Use string literal unions for built-in traits while permitting branded plugin traits via `${pluginId}:${name}`.
- Provide `hasTrait(node, trait)` and `requiresTraits(node, traits)` helpers for runtime checks.
- Export node primitives from `src/core/index.ts` and surface them in `gen` only if there is a clear public API need.

Considerations:

- Do not convert expression AST nodes to `StaticNode`; expression-level IR should stay closed.
- Keep traits as plain data, not classes or prototype inheritance.
- Avoid making all current interfaces extend `StaticNode` immediately if it causes broad breakage. Use adapter helpers first.

Validation:

- Add type tests around `CallableNode<In, Out>` and inference helpers.
- Add unit tests for `hasTrait` and trait diagnostics.
- Run `vp check` and `vp test`.

## Milestone 5: Built-In Function Nodes Implement Traits

Goal: make existing function types usable through the node protocol while preserving current APIs.

Work:

- Add `id`, `ref`, `traits`, and optional `metadata` to `StaticFunction`, `ExprFunction`, `PredicateFunction`, `QueryFunction`, `ActionFunction`, `PatchFunction`, and `PlanFunction`.
- Update all function constructors in `src/function/function.ts` to populate stable IDs and traits.
- Map traits conservatively:
  - `QueryFunction`: `static`, `named`, `typed`, `callable`, `readable`, `requires`, optionally `keyed`, `target_interpretable`.
  - `ActionFunction`: `static`, `named`, `typed`, `callable`, `writable`, `requires`, `effectful`, optionally `reactive`, `target_interpretable`.
  - `StaticFunction` and `ExprFunction`: `callable`, plus `effectful` only when effects are non-empty.
  - `PlanFunction`: `callable`, `plan`, and effect/requirement traits inferred from the body where available.
- Register function refs in binders for all function categories.
- Replace function name uniqueness diagnostics with stable-ID uniqueness where IDs exist; keep name collision warnings where names are ambiguous.
- Add generic node inference helpers as primary and re-express `InferActionInput`, `InferQueryOutput`, etc. as aliases where possible.

Considerations:

- Constructors must continue returning the specific function interface, not a broad `StaticNode` type.
- If IDs are generated from names for legacy calls, they should be marked generated/unstable in metadata and eligible for `ref:missing-stable-id` warnings.
- Keep `invalidates: readonly QueryFunction[]` temporarily, but plan to move invalidation to key family refs in a later milestone.

Validation:

- Update function tests and type tests to assert traits and ref registration.
- Add tests proving `InferNodeInput<typeof query>` equals existing `InferQueryInput<typeof query>`.
- Run `vp check` and `vp test`.

## Milestone 6: Key Families, Context, Services, and Methods Become Refs

Goal: remove high-value string references from services, requirements, and reactivity keys.

Work:

- Add `id` and `ref` to `KeyFamily`, and extend `defineKeyFamily` to accept branded IDs or object input.
- Add callable object ergonomics later for key families (`projectDetailKey({ id })`, `.any()`, `.match()`), but first keep `gen.key.key(family, payload)` and `gen.key.any(family)` working.
- Add `id` and generic ref backing to `ServiceRef` and `MethodRef` in `src/services/services.ts`.
- Add `ServiceRequirement<S>` or `RequirementRef<T>` so `requires: [CurrentActor]` and service requirements can be typed refs rather than `Requirement.kind: string`.
- Keep `Requirement.kind` for target/runtime-level external capability names, but add a parallel `ref?: Ref` or a new `Requirement` union branch for semantic requirements.
- Update `deriveModuleGraph` to compare service refs/IDs first, and string names only as legacy fallback.
- Add `gen.action.call(methodRef, input)` or similar when action expression support is ready; for now, define the method-ref data model and validation.

Considerations:

- `Requirement.kind` is used by runtimes and service checks, so this needs careful compatibility handling.
- Service names may be external or human-readable; IDs should drive provider matching.
- Key family payload inference must remain unchanged.

Validation:

- Add type tests for method input/output inference and wrong method input rejection where an action call builder exists.
- Add module graph tests proving service ID matching survives service rename.
- Add key family tests for stable ID graph derivation.
- Run `vp check` and `vp test`.

## Milestone 7: Trait-Based Ports for Routes, Reactivity, and Forms

Goal: begin consuming capabilities instead of closed concrete unions.

Work:

- Introduce route port types in `src/router/router.ts`:
  - `RouteLoader<I, O> = CallableNode<I, O> & ReadableNode & ServerPlaceableNode`.
  - `MutationHandler<I, O> = CallableNode<I, O> & EffectfulNode & ServerPlaceableNode`.
- Update `AppRouteLoader` from `QueryFunction | ReactiveResource` toward trait contracts. Keep existing concrete types assignable by making them implement traits or via adapter types.
- Update reactivity graph derivation to read node traits and stable refs when possible, while retaining current concrete branches for legacy resources/mutations/routes.
- Update forms that accept `source_function: ActionFunction` to accept the relevant callable/writable port once action functions implement traits.
- Add runtime diagnostics for nodes passed to consumers without the required traits, e.g. `node:missing-trait`.

Considerations:

- This is where broad type fallout is likely. Do not start here before functions and key refs are stable.
- Prefer overloaded or generic inputs that preserve existing narrow inference.
- Keep concrete unions in implementation branches until graph/lowering can fully dispatch on traits.

Validation:

- Add type tests proving a `QueryFunction` still works as a route loader.
- Add tests proving an intentionally callable/readable custom node works as a route loader after the custom node milestone.
- Add negative type tests for writable-only nodes as loaders.
- Run `vp check` and `vp test`.

## Milestone 8: Plugin-Defined Node Kinds and Lowering Hooks

Goal: let plugin authors define custom application-level nodes that participate in checking, graph derivation, and target lowering.

Work:

- Extend `PluginContributions` in `src/core/plugin.ts` with `nodes`, `traits`, `lowerings`, and `graph_hooks`.
- Add `defineNodeKind` and `defineNode` constructors in a new `src/core/node.ts` or `src/node/node.ts` module.
- Add `gen.node.define({ kind, id, name, traits, input, output, requires, effects, lowerTo })` for advanced users.
- Add `ctx.nodes` registry and binder support for custom nodes.
- Add lowering graph traversal: direct target interpretation first, lowering second, diagnostic third.
- Add diagnostics: `node:unknown-kind`, `node:missing-trait`, `node:lowering-cycle`, `node:no-target-interpretation`, `node:invalid-lowering`, `node:duplicate-id`.

Considerations:

- Dynamic namespace typing is hard; keep `GenWithPluginHelpers` as the primary path for plugin helper typing and add node-kind support separately.
- Plugin node kinds must be plain records, not classes.
- Lowerings must not mutate global context unexpectedly; if they need to create nodes, they should return node records or a declared graph fragment.

Validation:

- Add a test plugin that defines a `workflow` node with `callable`, `effectful`, and `plan` traits.
- Add tests proving the workflow can lower to an `ActionFunction` sequence or produce diagnostics when no lowering exists.
- Add type tests proving plugin helper namespace inference still works.
- Run `vp check` and `vp test`.

## Milestone 9: Magic String Diagnostics and Migration Cleanup

Goal: actively guide users away from string references while preserving valid external strings.

Work:

- Add a checker that scans portable definitions for suspicious raw string references where typed refs now exist.
- Categorize strings by domain: stable ID, display name, external name, target artifact, URL template, env var, cron expression, CSS class, OpenAPI operation ID.
- Rename APIs that intentionally accept strings to reflect boundary semantics, e.g. `lookupById`, `externalName`, `tableName`, `columnName`, `pathTemplate`.
- Add docs/examples that prefer object refs and stable ID constructors.
- Update existing tests and examples to avoid unnecessary strings in internal refs.

Considerations:

- Do not warn for legitimate URL path templates in `defineAppRoute`, DB column names, or display names.
- Diagnostics should be educational and actionable, not noisy.
- Some current APIs use `name` as both identity and display. Those need stable ID support before enabling warnings.

Validation:

- Add diagnostics tests for raw string references, ambiguous string references, and allowed external strings.
- Add snapshot-style tests for migration-safe field rename metadata.
- Run `vp check` and `vp test`.

## Milestone 10: Persisted IR and Artifact Graph Stability

Goal: ensure generated artifacts and graph exports are stable across renames.

Work:

- Update graph derivation in reactivity, services, relations, authz, routing, and lifecycle to use stable IDs.
- Ensure artifacts that serialize nodes emit IDs, current names, previous names where applicable, traits, refs, and lowerings.
- Add migration planner hooks that distinguish field rename from drop/add based on stable IDs and `renamedFrom` metadata.
- Add compatibility tests showing renaming an entity/field/function changes display names but not stable graph identity.

Considerations:

- This milestone should happen after stable IDs are present across most first-class nodes.
- Generated target-specific strings should be derived late, from IDs/refs and target naming rules.

Validation:

- Add tests for graph stability across renames.
- Add migration lineage tests for field rename vs drop/add.
- Run `vp check` and `vp test`.

## Milestone 11: Typed Trait References and Trait Metadata

Goal: eliminate magic string traits by introducing branded `TraitRef<Name>` values with optional metadata, while preserving backward compatibility during the migration window.

Work:

- Introduce `TraitRef<Name extends string>` as a branded string type (similar to `StableId<Kind>`) in `src/core/node.ts`:
  ```ts
  export type TraitRef<Name extends string = string> = string & { readonly _traitRef?: Name };
  ```
- Add `createTrait<Name extends string>(name: Name, metadata?: TraitMetadata): TraitRef<Name>` constructor. Plugin traits become `createTrait("myPlugin:workflow")` instead of raw template literals.
- Add a `TraitMetadata` interface for optional metadata (description, version, constraints, deprecation, docs URL). Traits become small inspectable records rather than bare strings.
- Export a `traits` namespace object with predefined typed refs for all built-ins:
  ```ts
  export const traits = {
    static: createTrait("static"),
    named: createTrait("named"),
    callable: createTrait("callable"),
    readable: createTrait("readable"),
    writable: createTrait("writable"),
    effectful: createTrait("effectful"),
    // ... etc.
  } as const;
  ```
- Update `hasTrait`, `hasTraits`, `missingTraits`, and `defineNodeKind` to accept `TraitKind | TraitRef`. Internally normalize to the raw string for comparisons.
- Update `BuiltInTraitKind` to remain the literal union (so existing string arrays still type-check), but encourage new code to use `traits.callable` etc.
- Add a `PluginTraitNamespace<PluginId>` helper so plugins can expose typed trait refs under `gen.myPlugin.traits.*`.
- Support trait metadata lookup: `getTraitMetadata(ctx, traitRef)` returns the metadata record if registered by a plugin.
- Add diagnostics for unknown traits (`trait:unknown`) and conflicting trait metadata (`trait:metadata-mismatch`).

Considerations:

- Keep string literals valid during the migration window. `hasTrait(node, "readable")` must continue to work.
- The `traits` namespace object must preserve generics through its methods (similar to `rule.eq` and `gen.authz.surface`).
- Trait metadata is optional; bare `createTrait("name")` without metadata is the common case.
- Plugin-defined traits should be registered in the plugin setup so metadata is available at check time.
- Do not refactor all existing `["callable", "readable"]` arrays in this milestone; focus on the infrastructure and new APIs.
- Make sure everything has great typescript inference, compability, naming, consistancy, usefulness, good primitives.

Validation:

- Add type tests proving `TraitRef<"callable">` does not freely mix with `TraitRef<"writable">`.
- Add runtime tests for `createTrait`, trait metadata round-trip, and `hasTrait` with both strings and `TraitRef` values.
- Add plugin tests proving a plugin can register a custom trait with metadata and use it in `defineNodeKind`.
- Run `vp check` and `vp test`.

## Suggested Implementation Order

1. `src/core/refs.ts`: stable IDs, typed ref aliases, ref diagnostics.
2. `src/entity/entity.ts` and `src/relation/relation.ts`: entity/field/relation IDs and refs.
3. `src/core/context.ts` and `src/gen/binders.ts`: ref registration and lookup helpers.
4. `src/core/node.ts`: StaticNode, traits, inference helpers.
5. `src/function/function.ts`: function refs, IDs, traits, node inference aliases.
6. `src/reactivity/reactivity.ts`: key family refs and stable graph IDs.
7. `src/services/services.ts`: service/method refs and ref-backed requirements.
8. `src/router/router.ts`, forms, reactivity graph: trait-based ports.
9. `src/core/plugin.ts`: plugin node-kind and lowering contributions.
10. Docs/tests/examples: magic string diagnostics and migration cleanup.
11. `src/core/node.ts`: typed trait refs (`TraitRef`, `createTrait`, `TraitMetadata`) and trait namespace.

## Cross-Cutting Type Rules

- Every new first-class IR type needs phantom slots for the type dimensions it carries.
- Generic constructors infer from runtime references and return the narrow branch type.
- Entity-scoped APIs should use `keyof E["fields"]`, `FieldOf<E>`, or `AccessSurfaceOf<E>`-style constraints.
- Namespace objects must use `typeof constructor` signatures rather than hand-written wrappers that erase generics.
- Avoid compatibility shims unless they protect persisted data, shipped behavior, or existing test coverage during the migration window.

## Testing Strategy

- Add `.test-d.ts` coverage first for ref branding, field ownership, node inference, callable ports, key payload inference, and plugin helper inference.
- Add runtime unit tests for ID generation, ref equality, registry lookup, diagnostics, graph IDs, and lowering behavior.
- Keep existing behavioral tests passing after each milestone.
- Use `vp check` and `vp test` after every milestone. Use `vp lint` or `vp fmt` when changing broad type surfaces.

## Main Risks

- Type churn: changing base interfaces like `Field`, `Entity`, and functions may cascade through many tests. Mitigate by adding optional fields first, then tightening.
- Name/ID confusion: APIs must make it obvious whether a string is a display name, external name, or stable ID.
- Plugin typing: dynamic namespace extension is already delicate. Keep plugin node-kind typing additive and test with `plugin-composition.test-d.ts`.
- Overgeneralization: trait-based dispatch should not make expression IR open-ended. Keep closed algebras where targets need exhaustiveness.
- Diagnostics noise: raw string warnings should only fire where a typed ref alternative clearly exists.

## Definition of Done

- First-class authoring APIs prefer typed refs and stable IDs.
- Built-in functions, key families, services, routes, policies, rules, reactions, CRUD outputs, and plugin nodes participate in a shared node/ref graph.
- Consumers that need capabilities accept trait contracts rather than concrete `kind` checks where practical.
- Custom nodes can register, check, derive graph edges, lower, and be interpreted by targets.
- Graph artifacts are stable across renames.
- Raw string internal references either disappear or produce actionable diagnostics.
