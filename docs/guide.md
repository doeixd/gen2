# Implementation Guide

This document is a practical companion to `docs/spec.md`.

It explains what the current codebase already provides, what is still missing, how the remaining work fits together, and what order to implement it in. It is written for anyone continuing the implementation of the spec.

It should be read together with `spec/*.allium`, which is more precise than `docs/spec.md` about canonical entities, invariants, rules, and `surface` contracts.

## Purpose

The repository already contains a substantial typed IR skeleton:

- core context, refs, diagnostics, artifacts, plugins, targets
- semantic types and representations
- entities, relations, queries, functions, API, authz, events, UI data models
- many standalone validation/check functions

What it does not yet contain is the connective tissue that turns those pieces into the spec's intended system:

- a context-aware project graph
- plugin-shaped helper availability
- store- and adapter-specific APIs
- end-to-end lifecycle orchestration
- the missing authoring surfaces for forms, UI, actions, mappings, and adapters

The biggest fact to keep in mind is this:

> The repo is currently closer to a typed IR and validator prototype than to a fully integrated domain compiler.

That is fine. The remaining work should preserve the good parts already present while wiring them into a smaller number of stronger abstractions.

## Allium As Source Of Truth

Use the repository's spec layers in this order:

1. `spec/*.allium` for exact entities, invariants, rules, and surfaces.
2. `docs/spec.md` for product direction, rationale, and examples.
3. existing `src/*` for current implementation choices.

The Allium specs matter because they answer implementation questions that `docs/spec.md` leaves open.

Examples:

- `spec/core.allium` defines `PluginAPI`, `CheckSurface`, `GenerateSurface`, `TargetContract`, and `ConfigSurface`.
- `spec/lifecycle.allium` defines lifecycle phase semantics and cross-store planner invariants.
- `spec/types.allium` explicitly says `types/Expression` is metadata only and must resolve against the real expression system.
- `spec/ui.allium` defines actual `FormSurface` and `ComponentSurface` operations and preconditions.

## How To Use The Allium Specs

When implementing a missing feature, use this process:

1. find the relevant `surface` in `spec/*.allium`
2. identify the entities and values it exposes
3. identify the invariants that must always hold
4. identify the rules that must emit diagnostics when violated
5. identify the `provides` operations and their `when` preconditions
6. only then design the TypeScript authoring API

This keeps the implementation aligned with the modeled system rather than only with example syntax.

## Namespace Architecture

Some `gen.*` namespaces are inherently generic and backend-dependent.

Examples:

- `gen.db.*` depends on store names, dialects, and default-store aliases
- future UI namespaces should depend on platform/backend choices such as JSX, DOM, native, or TUI element vocabularies
- future adapter namespaces should depend on target/runtime/backend capabilities

Because of that, top-to-bottom type safety should not stop at the leaf helper.

It should flow all the way from:

1. namespace-specific options or plugin configuration
2. namespace factory return types
3. plugin contribution typing
4. `createGen(...)`
5. the final `gen` object seen by the user

### Recommendation

Yes: each major generic namespace should converge on an explicit factory pattern.

Preferred shape:

```ts
createXNamespace<const Opts>(ctx, gen, opts): XNamespace<Opts>
```

Where:

- `ctx` gives access to the shared project graph
- `gen` gives access to already-bound core helpers
- `opts` carries namespace-specific backend or plugin configuration
- the return type is specific to that namespace's backend/runtime/dialect/platform choices

This is better than scattering ad hoc helper materialization logic across plugin setup functions because it gives one clear place where:

- backend-specific type parameters live
- runtime registration behavior lives
- backend-specific helper surfaces are assembled
- namespace-level preconditions can be enforced

### `createGen(...)` implication

The long-term `createGen(...)` type should be a composition of namespace factories, not a single monolithic static `Gen` interface with late runtime patching.

The practical migration path is:

1. runtime namespace factories first
2. typed namespace return types next
3. plugin-config-to-`createGen` generic propagation after the namespace contracts stabilize

This avoids trying to solve the full type-composition problem before the namespace boundaries are real.

### Backend-flexible namespaces

This pattern is especially important for namespaces whose shape should differ by backend.

Examples:

- `createDbNamespace(ctx, gen, dbOpts)`
- `createUiNamespace(ctx, gen, uiOpts)`
- `createReactNamespace(ctx, gen, reactOpts)`
- `createTuiNamespace(ctx, gen, tuiOpts)`

For UI specifically, this is likely the correct place to encode differences like JSX-host capabilities vs TUI element capabilities rather than forcing one over-general namespace that becomes weakly typed.

## Current State

These modules already exist and are useful foundations:

- `src/core/*`: context, refs, diagnostics, artifacts, plugins, targets, config, env
- `src/types/*`: semantic types, representations, operations, runtimes, traits
- `src/entity/*`: entity and field modeling
- `src/expression/*`: expression IR, AST, builders, checks, plan IR
- `src/storage/*`: stores, tables, columns, mappings, projections
- `src/relation/*`: relations and graphs
- `src/query/*`: query IR and a basic builder
- `src/function/*`: static/query/action/patch function records and checks
- `src/api/*`: routes, getters, mutators, checks
- `src/authz/*`: policies and checks
- `src/events/*`: events, emissions, reducers, checks
- `src/ui/*`: UI IR and checks
- `src/lifecycle/*`: a simple checker/generator runner
- `src/gen.ts`: user-facing namespace assembly

The most important structural limitation today is that the user-facing constructors are detached from `GenContext`.

For example:

- `createGen()` builds `ctx` and a static `gen` namespace in `src/gen.ts`
- `defineEntity()` builds an entity in `src/entity/entity.ts`
- but the entity is never registered into `ctx`
- and the lifecycle never sees it unless the caller manually threads it somewhere else

That makes the existing checks much less valuable than they should be.

## Guiding Constraints

Any implementation of the remaining spec should preserve these constraints.

1. Keep the core small.
2. Prefer typed refs over strings after declaration.
3. Preserve the semantic type / representation split.
4. Keep portable definitions as static IR, not arbitrary runtime closures.
5. Make plugins shape the available authoring API.
6. Keep runtimes, stores, requirements, and target compatibility explicit.
7. Do not let adapters own semantics.
8. Make generated UI customizable through typed handles, not file forking.
9. Do not build parallel semantic models when Allium already establishes one.

The ninth constraint is especially important for expressions and types. `spec/types.allium` is explicit that the lightweight `types/Expression` exists only as metadata and should resolve against the main expression system. Future work should not create a second expression or planner stack.

## Main Gap Summary

The remaining work falls into two categories.

### Integration gaps

These stop the current pieces from working as one system.

- context registration of created domain objects
- lifecycle discovery and orchestration of all model elements
- plugin-contributed helpers becoming real `gen.*` APIs
- target input registration and compatibility checking
- authoring-time enforcement of Allium `surface` preconditions

### Surface gaps

These are spec features whose APIs or modules are not implemented yet.

- `gen.db.*` and schema/store helper packages
- richer mapping DSL and projections
- relation helper family and relation entities
- forms package
- UI authoring/building APIs
- action/query authoring DSLs
- adapter/target packages
- type inference helpers
- type-level test coverage

## Recommended Implementation Order

Implement the remainder of the spec in this order.

1. Build a real project graph in `GenContext`.
2. Make lifecycle checks operate on that graph.
3. Make plugin helpers shape `gen`.
4. Add the store/db plugin surface.
5. Finish the mapping layer.
6. Finish relations and include inference.
7. Finish functions, actions, and query authoring surfaces.
8. Add forms on top of functions and UI.
9. Finish UI authoring and attachment APIs.
10. Add adapter targets and generation packages.
11. Add inference helpers and type tests.

This order matters because later layers depend on stable lower-level registration and lifecycle behavior.

For any phase, the implementation is only really done when:

- the corresponding Allium entities exist in the project graph
- the corresponding invariants are enforced
- the corresponding rules can produce diagnostics
- the corresponding `surface` operations are available through TypeScript APIs
- the `when` preconditions are enforced statically, eagerly at construction time, or during `check()`

## Phase 1: Make `GenContext` Real

### Goal

`createGen({ plugins })` must return a context-aware environment where created objects are registered into a shared model graph.

### Why this comes first

Without this, the lifecycle cannot reliably check anything beyond plugin invariants and target inputs.

### Current files involved

- `src/gen.ts`
- `src/core/context.ts`
- `src/lifecycle/lifecycle.ts`
- every constructor module such as `entity.ts`, `storage.ts`, `relation.ts`, `query.ts`, `function.ts`, `api.ts`, `authz.ts`, `events.ts`, `ui.ts`

### What to implement

#### 1. Add a project registry to `GenContext`

Add explicit collections for all first-class modeled objects. At minimum:

- entities
- stores
- tables
- columns
- mappings
- projections
- relations
- graphs
- queries
- function catalogs or function collections by kind
- routes
- getters
- mutators
- policies
- events
- emissions
- reducers
- forms
- views
- components
- styles
- behaviors
- themes
- platforms
- renderers
- expressions and plans that should be checked globally
- contracts
- actors
- config entries and default instances where they are modeled separately
- cross-store planners and store assignments
- trait applications and serializers if they become first-class checked objects

This should live in `src/core/context.ts`, not in scattered module-local registries.

This recommendation follows the plural model sets implied across the Allium files, such as `Entities`, `Relations`, `Mappings`, `Policies`, `Events`, `Forms`, `Views`, `Targets`, and `CrossStorePlanners`.

#### 2. Create context-bound constructor wrappers

The current `buildGenNamespace()` returns plain module functions. Replace or augment that with wrappers that do both:

- build the object
- register it into `ctx`

Example shape:

```ts
const bindEntity = (ctx: GenContext) =>
  <F extends FieldsRecord>(name: string, fields: F, options?: ...) => {
    const entity = defineEntity(name, fields, options)
    ctx.entities.push(entity)
    ctx.refs.push(...entity.fieldList.map((f) => f.ref))
    return entity
  }
```

This pattern should be repeated for every first-class constructor exposed through `gen`.

#### 3. Decide registration ownership clearly

Registration should happen only at the user-facing context-bound layer, not inside the pure constructors themselves.

Reason:

- pure constructors remain testable and reusable
- direct imports can still create detached values if needed
- `gen.*` becomes the context-aware surface promised by the spec

This is a better fit than making every low-level constructor depend on global mutable state.

#### 4. Register refs consistently

Refs should be added to `ctx.refs` whenever a first-class object creates them.

This likely includes:

- field refs
- relation refs once added
- column/table/store refs once added
- slot refs once UI builders exist
- function/policy/event refs if the ref protocol is extended to them

Refs are part of the checkable model, not just convenience handles. In particular:

- `spec/entity.allium` has a `FieldRefCreated` rule
- `spec/core.allium` uses refs in diagnostics and inspection surfaces
- `spec/expression.allium` and `spec/query.allium` rely on refs for semantic validation

### Deliverable for Phase 1

After this phase, a trivial program using `createGen()` and `gen.entity()` should produce a context that contains those entities and refs without any manual registration.

## Phase 2: Wire Lifecycle Checks to the Project Graph

### Goal

`lifecycle.check(ctx)` should validate the actual project graph, not just plugin and target metadata.

### Current issue

`src/lifecycle/lifecycle.ts` has a checker registry, but nothing in the repo registers module checkers. As a result, most domain-level checks are dormant.

The Allium lifecycle model is stricter than the current implementation. `spec/lifecycle.allium` defines:

- unique lifecycle phase order
- `check` before `generate`
- explicit `collect_refs`, `resolve_plugins`, `check_targets`, `run_checks`, `generate` behavior
- cross-store planner coverage and distinct-store requirements

### What to implement

#### 1. Register module checkers centrally

Create a single lifecycle registration module that binds all existing checks to `ctx` collections.

Possible location:

- `src/lifecycle/register-checkers.ts`
- imported once from `src/gen.ts` or `src/lifecycle/index.ts`

#### 2. Map existing checks to context collections

Example mapping:

- `checkEntityInvariants(ctx.entities)`
- `checkRefsExist(ctx.refs, ctx.entities)`
- `checkStorageInvariants(ctx.stores, pluginDialects)`
- `checkMappings(ctx.mappings)`
- `checkRelations(ctx.relations)`
- `checkQueries(ctx.queries)`
- `checkQueryRuntimes(ctx.queries)`
- `checkFunctions(ctx.functionCatalog)`
- `checkFunctionRuntimes(ctx.functionCatalog)`
- `checkActionWrites(ctx.functionCatalog)`
- `checkApi(ctx.routes, ctx.mutators)`
- `checkAuthz(...)`
- `checkEvents(...)`
- `checkUi(...)`
- `checkPlanFallback(ctx.plans)`
- `checkCrossStoreReadComposition(...)`
- `checkCrossStorePlanners(ctx.crossStorePlanners)`
- core-level target/plugin rules such as missing target plugin ownership and duplicate helper namespaces

#### 3. Distinguish graph checks from target checks

The lifecycle should have two clearly different classes of checks:

- project/model graph checks
- target compatibility checks

The current code partially models target checks already. Keep that separation.

#### 4. Gather plugin-contributed checks

`PluginContributions` already supports `checks`. The lifecycle should execute those in addition to built-in module checkers.

It should also materialize or execute plugin-contributed:

- metadata namespaces
- runtimes
- stores
- operations
- codegen hooks
- artifact transforms

### Deliverable for Phase 2

After this phase, building a small sample project and calling `check(ctx)` should produce meaningful diagnostics for entities, mappings, relations, functions, API, authz, events, and UI.

It should also satisfy the core and lifecycle rules modeled in Allium, including diagnostics such as:

- `core:target-plugin-missing`
- `core:duplicate-helper-namespace`
- `lifecycle:target-incompatible-input`
- `lifecycle:cross-store-read-unplanned`
- `lifecycle:cross-store-write-no-coordinator`

## Phase 3: Make Plugins Shape the `gen` Namespace

### Goal

The spec's central promise is that installed plugins determine helper availability.

### Current issue

`src/gen.ts` builds a fixed static namespace. `ctx.helpers` is recorded, but not surfaced or typed.

### What to implement

#### 1. Runtime merging of plugin helper namespaces

When a plugin contributes helpers, they should appear on `gen` under the contributed namespace.

Examples from the spec:

- `gen.db.*`
- `gen.rel.*`
- `gen.forms.*`
- `gen.react.*`
- `gen.hono.*`

#### 2. Introduce typed plugin composition for `createGen`

The ideal end state is that the `Gen` type depends on plugin inputs. That may require a redesign of `createGen` typings using generics over plugin contributions.

If full type-level plugin composition is too large to do immediately, implement in two steps:

1. runtime namespace merging
2. progressively stronger generic typing over plugin contribution shapes

When doing the type-level work, use the Allium `surface` model as the contract to expose. `PluginAPI` is not just "plugins can add helpers"; it also implies registration and activation semantics, helper definition, metadata namespace definition, and target ownership.

#### 3. Keep core helpers stable

Core helpers like `entity`, `expr`, `runtime`, `definePlugin`, semantic types, and representations should remain always available.

Plugin helpers should augment, not replace, that kernel.

### Deliverable for Phase 3

Plugins can provide real authoring namespaces, and the library is structurally aligned with the spec's plugin-driven API model.

## Phase 4: Implement the DB/Store Plugin Surface

### Goal

Provide the spec's named store experience.

### Current issue

The repo has generic `defineStore`, `defineTable`, and `defineColumn`, but not the plugin-driven `gen.db.primary.table(...)` style surface.

### What to implement

#### 1. Add a DB plugin package or module

This plugin should:

- register named stores
- expose them under `gen.db`
- optionally expose a default store alias

#### 2. Add dialect-specific helper families

The spec expects each store to expose only helpers supported by its dialect.

Examples:

- relational tables and columns
- document collections and document fields
- keyspaces and key/value helpers

#### 3. Add schema builders

The storage model needs schema objects for target consumption.

Examples:

- relational schema
- document schema
- keyspace schema

Keep the schema layer distinct from semantic entities. `spec/storage.allium` is explicit that `MappingSurface` owns stores, tables, mappings, and projections, while entities remain in `entity.allium`.

#### 4. Upgrade storage refs

Tables and columns should become properly typed refs with ergonomic access patterns like `users.columns.id`.

### Suggested file additions

- `src/db/*` or plugin package equivalent
- maybe split `src/storage/storage.ts` into relational/document/kv concerns if it becomes too dense

## Phase 5: Finish the Mapping Layer

### Goal

Mappings should become the real bridge between semantic entities and physical or computed backing sources.

### Current issue

The IR exists, but the builder surface is much smaller than the spec.

### What to implement

#### 1. Add first-class read/write/mixed mapping builders

The spec expects:

- read mappings
- write mappings
- combined mappings
- projections

#### 2. Add source/target helpers

Support sources like:

- column
- expression
- query-backed field
- aggregate
- document field
- service call
- hidden
- read-only

#### 3. Add dependency tracking

Derived mappings should track dependencies explicitly. This is important for:

- query planning
- invalidation
- recomputation
- subscriptions
- migration analysis

The current `MappingSource` and `MappingTarget` already have `dependencies` fields. Prefer strengthening those existing fields over inventing a second dependency model.

#### 4. Add reversible mapping support

The spec's reversible mapping examples imply a richer transform layer than the current string-or-expression placeholder fields.

### Recommendation

Do not over-specialize mapping around SQL tables. Keep sources/targets generic enough for multi-store and service-backed fields.

## Phase 6: Finish Relations

### Goal

Move from basic binary relation records to the spec's full semantic relation package.

### Current issue

`src/relation/relation.ts` models binary relations and graphs, but not the richer authoring and inference surfaces.

### What to implement

#### 1. Add ergonomic helper family

Expected surface includes helpers for:

- relation naming
- one-to-one, one-to-many, many-to-one, many-to-many
- integrity helpers
- FK action helpers
- app deletion behavior helpers

#### 2. Add relation refs

The core ref protocol already anticipates `RelationRef`. Use it.

#### 3. Add relation entities / hyperedges

This is explicitly called out in the spec and is one of the larger missing semantic features.

`spec/relation.allium` adds one subtle constraint worth preserving: relation-entity names must not collide with either existing relation entities or ordinary entities.

#### 4. Add include inference

This likely requires new type-level utilities, probably not runtime code first.

### Recommendation

Implement relation entities before deep include inference. The type system should reflect the richer relation model, not force a redesign later.

## Phase 7: Finish Function, Query, and Action Authoring Surfaces

### Goal

Move from record constructors to the spec's authoring model.

### Current issue

The repo can represent query and action functions, but it does not yet expose the richer staged builder surfaces shown in the spec.

### What to implement

#### 1. Query authoring improvements

Build out:

- richer predicate helpers
- projection selection by projection objects
- ordering helpers
- query-backed fields
- relation traversal where appropriate

Use `spec/query.allium` as the checklist. The query layer is not only a fluent DSL. It also needs to support:

- `QueryBackedField`
- `QueryPlanner`
- `QueryPlan`
- `FieldAssignment`
- `CrossStoreQuery`
- `StoreQueryPlan`

#### 2. Action DSL

Add a staged action builder for:

- insert
- update
- delete
- conditional sets
- returning projections
- explicit deletion behaviors

Keep the DSL aligned with `spec/function.allium` and `spec/expression.allium`: an `ActionFunction` body is an `ActionExpr`, not an arbitrary imperative callback.

#### 3. Patch / optimistic UI helpers

The `PatchFunction` type exists. Add authoring helpers and reconciliation support.

#### 4. Error and consistency helper namespaces

The spec expects ergonomics like typed conflict/validation/auth errors and explicit consistency helpers.

Some low-level constructors already exist in `src/function/function.ts`; they should be surfaced more coherently.

Also preserve the global function-name uniqueness rule from `spec/function.allium`. This applies across all function kinds, not only within a single function family.

## Phase 8: Build the Forms Package

### Goal

Forms should be derived from action function contracts and produce UI IR, not framework-specific output.

### Current issue

There is no dedicated forms module even though `src/ui/ui.ts` contains `Form` types and form validation logic.

### What to implement

#### 1. Add a `src/forms/*` module

This should own:

- form builders
- form field builders
- widget helpers
- enum/relation option helpers
- inference helpers for form values/submit/errors
- behaviors specific to forms

Use `spec/ui.allium`'s `FormSurface` as the baseline contract. A complete forms implementation is not just a `Form` record; it must support:

- submit values constrained by form field names
- style attachment constrained by form slots
- behavior attachment constrained by required slots

#### 2. Keep forms as sugar over UI + functions

Forms should build UI IR and bind to action functions. They should not invent a parallel model.

#### 3. Reuse existing UI validation where possible

The current UI checks around form field membership and widget compatibility are a good base.

## Phase 9: Finish the UI Authoring API

### Goal

Expose the platform-agnostic UI IR through usable builders and attachment APIs.

### Current issue

The current `gen.ui` surface only exports capability helpers. The major authoring surface from the spec is missing.

### What to implement

#### 1. View builders

Add `view` construction with typed slots and static structure capture.

This should target the `View` entity from `spec/ui.allium`, including `slot_remaps` and `target_platforms`, not just a slot map plus a render callback.

#### 2. Component builders

Add components with:

- props
- requirements
- errors
- bindings/setup
- view

#### 3. Style builders and attachers

Add:

- style creation
- style attachment to views/components/forms
- public style handles

#### 4. Behavior builders and attachers

Add:

- behavior creation
- capability-aware attachment
- requirement bubbling
- platform/runtime validation hooks

`spec/ui.allium` makes the attachment contract concrete. Behavior attachment must respect:

- slot existence
- exact capability compatibility
- collection-slot requirements
- target-platform event support
- hidden-slot visibility rules

#### 5. Themes, tokens, platforms, renderers

These all exist as IR types and need their authoring surfaces.

Keep platform checks view-scoped through `target_platforms`, rather than validating every style or behavior against every platform in the registry.

#### 6. Safe HTML / security holes

Implement branded safe types for dangerous UI holes instead of allowing raw strings.

### Recommendation

The UI system should be implemented with the same staged, analyzable mindset as expressions. Do not fall back to black-box JSX as the source of truth.

## Phase 10: Implement Adapter Targets

### Goal

Turn the core target contract into real adapter packages.

### Current issue

The kernel target/plugin model exists, but there are no concrete adapters in this repo.

### What to implement

#### 1. Start with a small official target set

Recommended order:

1. schema/diagnostic debug target
2. OpenAPI or Zod-like boundary target
3. one relational schema target
4. one server API target
5. one UI/component target

This sequence exercises different parts of the model without committing too early to every framework.

Make sure concrete adapters satisfy `spec/core.allium`'s `TargetContract`, not just ad hoc generation conventions.

#### 2. Make target compatibility checks real

The spec explicitly requires diagnostics for incompatible stores, runtimes, components, and serialization gaps.

#### 3. Support artifact dependencies

`Artifact` and `GenerateResult` already model dependencies. Adapters should populate them.

## Phase 11: Add Inference Helpers and Type Tests

### Goal

Match the spec's emphasis on inference and type safety.

### Current issue

The runtime tests are present, but there are no dedicated type-test files and no visible `Infer*` helper layer.

### What to implement

#### 1. Add type-level helper exports

Expected families include:

- infer entity values
- infer includes
- infer function input/output/error
- infer form values/submit/errors
- infer slot maps and style handles

The TypeScript inference checklist in `spec/lifecycle.allium` is a good acceptance list for this phase. Use it directly instead of reconstructing inference requirements from prose.

#### 2. Add type tests

Add `*.test-d.ts` or equivalent type assertion coverage for the inference and rejection cases listed in the spec.

#### 3. Keep runtime and type tests separate

Do not try to force all correctness into runtime tests. The spec is explicit that type tests are part of the product.

## Module-by-Module Notes

### `src/gen.ts`

This is the most important integration file.

It should eventually:

- build core helpers
- merge plugin helpers
- bind helpers to `ctx`
- register built-in lifecycle checkers
- possibly expose typed plugin-augmented namespaces

It should also become the main place where Allium `surface` operations are translated into ergonomic TypeScript APIs.

### `src/core/context.ts`

This should become the source of truth for the project graph.

Keep it explicit. Avoid hidden registries elsewhere.

### `src/lifecycle/lifecycle.ts`

This should evolve into:

- project graph validation
- plugin validation
- target compatibility checking
- generation orchestration
- plugin-contributed check and codegen hook execution

Avoid making it depend on framework-specific concepts.

It should also enforce the phase semantics described in `spec/lifecycle.allium`, rather than only acting as a wrapper around a checker list.

### `src/storage/storage.ts`

This file probably wants refactoring as the DB and mapping surfaces grow.

Likely future split:

- store/schema primitives
- relational helpers
- document helpers
- mapping/projection helpers

Do not lose the simple `MappingSurface` preconditions from Allium during that split, especially projection membership checks.

### `src/ui/ui.ts`

This already has a rich IR and good validation coverage. It is a good candidate for building outward from the existing model rather than rewriting.

It is also one of the closer matches to the Allium rules already present in the repo, so prefer extending the current IR with authoring surfaces rather than redesigning the IR itself.

### `src/function/function.ts`

This module already models several important abstractions. The main missing work is authoring ergonomics and stronger integration with actions, patches, errors, and consistency.

## Cross-Cutting Decisions Still to Make

These decisions should be made deliberately before too much surface area is added.

### 1. What is registered automatically vs manually?

Recommendation:

- anything created through `gen.*` should register into `ctx`
- direct low-level imports may stay detached and explicit

### 2. How strongly typed should plugin helper composition be?

Recommendation:

- do runtime composition first
- then add generic typing once the contribution shapes are stable

### 3. Where do detached pure constructors remain useful?

Recommendation:

- keep pure constructors available for tests and internal composition
- use bound wrappers for the public context-driven API

### 4. How much of the spec belongs in core vs standard packages?

Recommendation:

- keep only universally reusable substrate in core
- put forms, db, relation helpers, UI renderers, adapters, and transport targets in separate packages or modules

## Suggested Milestones

### Milestone A: Integrated Core

- context graph exists
- `gen.*` constructors register objects
- lifecycle runs real graph checks

### Milestone B: Plugin-Shaped Authoring

- plugin helpers appear on `gen`
- DB plugin works with named stores
- target inputs and plugin checks are wired

### Milestone C: Domain Modeling Completeness

- mappings, projections, richer relations, query/action authoring
- consistency, patch, and error ergonomics

### Milestone D: UI and Forms

- forms package exists
- UI view/component/style/behavior APIs exist
- attachment and requirement bubbling work

### Milestone E: Adapters and Generation

- at least one schema target
- at least one API target
- at least one UI target
- compatibility diagnostics are meaningful

### Milestone F: Inference and Test Hardening

- `Infer*` helpers exported
- type tests added
- adapter golden tests added

## Immediate Next Step

If only one thing is implemented next, it should be this:

> Bind `gen.*` constructors to `GenContext` and register all created first-class objects into a project graph.

That one change unlocks almost every other part of the spec because it gives the lifecycle, plugins, targets, and diagnostics a shared world to operate on.

It also aligns the implementation with the Allium assumption that surfaces operate over shared collections like `Entities`, `Mappings`, `Relations`, `Policies`, `Events`, `Forms`, and `Targets`.

## Allium-Driven Checklist By Surface

Use this when implementing a module to avoid missing modeled contracts.

### Core

- implement `PluginAPI`, `CheckSurface`, `GenerateSurface`, `TargetContract`, and `ConfigSurface`
- enforce target ownership by plugin
- mark helper availability when plugins activate
- support duplicate-helper-namespace diagnostics

### Entity

- register field refs as part of entity creation flow
- implement transition graph and field-presence authoring surfaces
- preserve helper entities like `CreateOperation`, `UpdateOperation`, and `FieldOwnershipCheck`

### Types

- keep `types/Expression` as metadata only
- enforce operation-kind field consistency
- enforce implementation runtime registration and uniqueness
- implement trait applications and serializer registration as checkable objects if they become first-class

### Storage

- implement store, table, mapping, and projection authoring with Allium preconditions
- preserve dialect extensibility through plugin contributions
- reuse `dependencies` on mapping sources and targets rather than adding a parallel mechanism

### Relation

- add `RelationEntity` and `Role`
- preserve relation-entity name uniqueness against ordinary entities
- keep many-to-many link-entity semantics explicit

### Query

- implement `QueryBackedField`, `QueryPlanner`, `QueryPlan`, and `FieldAssignment`
- support cross-store composition structures, not just fluent query syntax
- enforce predicate/entity ownership constraints

### Function

- enforce global uniqueness across all function kinds
- keep function bodies aligned to the expression/query/plan IR kinds defined by Allium
- ensure optimistic patch compatibility is checked at attach time and during lifecycle validation

### API

- add missing resource and list-getter surfaces
- enforce route-handler exclusivity and entity alignment preconditions
- keep target-specific diagnostics in target compatibility, not only route creation code

### Authz

- implement policy translation and client exposure objects as real modeled values
- preserve cross-store relation policy warnings

### Events

- make `EmitEvent` atomic with `EventEmission` plus `event.emitted_by` maintenance
- treat outbox modeling as part of the events surface, even if delivery infra remains adapter-specific

### UI and Forms

- implement `FormSurface` and `ComponentSurface` semantics, not just records
- enforce hidden-slot and target-platform constraints through attachment APIs
- support `UiAstNode`-level unsafe HTML diagnostics if raw HTML injection is introduced

## Practical Checklist

Use this as the short working checklist.

- add graph collections to `GenContext`
- add context-bound wrappers in `src/gen.ts`
- register refs during object creation
- register built-in lifecycle checkers
- execute plugin-contributed checks/codegen hooks
- implement plugin helper namespace merging
- add DB plugin and named store APIs
- add schema builders and storage refs
- expand mappings and projections
- expand relations and relation entities
- build query and action authoring DSLs
- add forms package
- add UI builders and attachment APIs
- add concrete adapter targets
- add `Infer*` helpers
- add type tests and golden tests

## Final Advice

Do not try to implement the rest of the spec as a flat list of features.

Implement it as layered system completion:

1. shared context graph
2. lifecycle over that graph
3. plugin-shaped authoring surface
4. domain packages on top
5. adapters at the edge

If that order is respected, the repo can grow into the spec without accumulating a second, parallel architecture.

off what's done vs what's missing.
→ Read docs\guide.md
Thinking: Let me compare our completed work against the guide.md phases and checklist. I'll go through each phase and item systematically.
Here's what's done vs still missing from guide.md, organized by phase:

---

Phase 1: Make GenContext Real ✅ DONE

- Project registry collections exist in GenContext (entities, stores, tables, columns, mappings, projections, relations, graphs, queries, functions, routes, getters, mutators, policies, events, emissions, reducers, forms, views, components, styles, behaviors, themes, platforms, renderers, contracts, actors, cross_store_planners, etc.)
- Context-bound wrappers (bindEntity, bindStore, bindTable, bindRelation, bindView, bindForm, etc.) register into ctx
- Refs registered during creation (field refs via bindEntity, relation refs via bindRelation, relation entity refs via bindRelationEntity)
  Phase 2: Wire Lifecycle Checks to Project Graph ✅ DONE
- registerBuiltInModuleCheckers() maps all checks to context collections
- Module checkers registered: entity invariants, refs, contracts, config, storage, mappings, relations, relation entities, queries, functions (5 kinds), API, authz, events, UI, cross-store planners, cross-store read composition, cross-store write coordinator, plan fallback
- Phase semantics: collect_refs → resolve_plugins → check_targets → run_checks → generate
- Target compatibility checks separate from graph checks
  Phase 3: Make Plugins Shape gen ✅ PARTIAL
- GenPluginExtensions supports declaration merging
- mergePluginHelpers materializes plugin helpers onto gen at runtime
- Gen<C extends GenConfig> is generic but plugin composition is still runtime-only (type-level plugin-to-Gen mapping not yet implemented)
- createGen<C>() propagates config type parameter
  Phase 4: DB/Store Plugin Surface ⚠️ PARTIAL
- src/db/db.ts exists with defineDbPlugin and named stores
- gen.db.\* available via plugin contributions
- Missing: dialect-specific helper families, schema builders, users.columns.id style storage refs
  Phase 5: Finish Mapping Layer ⚠️ PARTIAL
- Basic defineMapping, defineProjection, field mapping helpers exist
- Missing: read/write/mixed mapping builders, source/target helpers (expression, query-backed, aggregate, service call), reversible mappings, richer dependency tracking
  Phase 6: Finish Relations ✅ DONE
- Ergonomic helpers: oneToOne, oneToMany, manyToOne, manyToMany
- Integrity/FK/deletion shorthand constructors
- RelationEntity with defineRelationEntity and checkRelationEntities
- Relation refs auto-populated
- InferRelationFrom / InferRelationTo type helpers
- Missing: include inference (type-level traversal utilities)
  Phase 7: Function/Query/Action Authoring ✅ DONE
- Action DSL: actionInsert, actionUpdate, actionDelete, actionSequence
- Patch DSL: patchInsert, patchUpdate, patchDelete
- Error helper namespace: gen.func.error.\*
- Consistency helper namespace: gen.func.consistency.\*
- Query authoring: queryBackedField, createQueryPlan, createQueryPlanner, crossStoreQuery
  Phase 8: Forms Package ✅ DONE
- src/forms/forms.ts with buildForm, formField, defaultWidget, inferWidgetKind, errorMapping
- InferFormValues, InferFormResult, InferFormErrors type helpers
- Forms wired into gen.forms.\*
  Phase 9: UI Authoring API ✅ DONE
- View, Component, Style, Behavior, Theme, Platform, Renderer constructors
- attachStyle / attachBehavior with slot/capability validation
- safeHtml branded type
- Cross-platform generic element types: Slot<E>, View<E>, Style<T,E>, Behavior<R,E>, Form<Out,E>, Component<P,E>
- Per-namespace builder: createUiNamespace<UiConfig>(config?)
  Phase 10: Adapter Targets ❌ NOT STARTED
- No concrete adapter packages in repo
- Missing: schema debug target, OpenAPI/Zod target, relational schema target, server API target, UI component target
  Phase 11: Inference Helpers and Type Tests ⚠️ PARTIAL
- InferEntity, InferField, InferQueryResult, InferFormValues, InferFormResult, InferFormErrors, InferFunctionInput, InferFunctionOutput, InferFunctionErrors, InferRelationFrom, InferRelationTo exist
- Missing: dedicated \*.test-d.ts type assertion files, include inference helpers, slot map inference, style handle inference

---

Practical Checklist Status
Item Status
graph collections in GenContext ✅
context-bound wrappers in gen.ts ✅
register refs during creation ✅
register built-in lifecycle checkers ✅
execute plugin-contributed checks/codegen hooks ⚠️ (checks wired, codegen hooks basic)
plugin helper namespace merging ⚠️ (runtime done, type-level pending)
DB plugin and named store APIs ⚠️ (basic done, dialect-specific missing)
schema builders and storage refs ❌
expand mappings and projections ⚠️ (basic done, rich DSL missing)
expand relations and relation entities ✅
query and action authoring DSLs ✅
forms package ✅
UI builders and attachment APIs ✅
concrete adapter targets ❌
Infer\* helpers ⚠️ (most done, include/slot missing)
type tests and golden tests ❌

---

Biggest remaining gaps

1. Adapter targets (Phase 10) — zero concrete implementations
2. Type tests (Phase 11) — no \*.test-d.ts files
3. Include inference (Phase 6.4) — no type-level relation traversal
4. Rich mapping DSL (Phase 5) — read/write/mixed mappings, reversible transforms
5. Dialect-specific DB helpers (Phase 4) — relational/document/kv split
6. Typed plugin composition (Phase 3) — createGen generic doesn't yet compose plugin types
