<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, but it invokes Vite through `vp dev` and `vp build`.

## Vite+ Workflow

`vp` is a global binary that handles the full development lifecycle. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

### Start

- create - Create a new project from a template
- migrate - Migrate an existing project to Vite+
- config - Configure hooks and agent integration
- staged - Run linters on staged files
- install (`i`) - Install dependencies
- env - Manage Node.js versions

### Develop

- dev - Run the development server
- check - Run format, lint, and TypeScript type checks
- lint - Lint code
- fmt - Format code
- test - Run tests

### Execute

- run - Run monorepo tasks
- exec - Execute a command from local `node_modules/.bin`
- dlx - Execute a package binary without installing it as a dependency
- cache - Manage the task cache

### Build

- build - Build for production
- pack - Build libraries
- preview - Preview production build

### Manage Dependencies

Vite+ automatically detects and wraps the underlying package manager such as pnpm, npm, or Yarn through the `packageManager` field in `package.json` or package manager-specific lockfiles.

- add - Add packages to dependencies
- remove (`rm`, `un`, `uninstall`) - Remove packages from dependencies
- update (`up`) - Update packages to latest versions
- dedupe - Deduplicate dependencies
- outdated - Check for outdated packages
- list (`ls`) - List installed packages
- why (`explain`) - Show why a package is installed
- info (`view`, `show`) - View package information from the registry
- link (`ln`) / unlink - Manage local package links
- pm - Forward a command to the package manager

### Maintain

- upgrade - Update `vp` itself to the latest version

These commands map to their corresponding tools. For example, `vp dev --port 3000` runs Vite's dev server and works the same as Vite. `vp test` runs JavaScript tests through the bundled Vitest. The version of all tools can be checked using `vp --version`. This is useful when researching documentation, features, and bugs.

## Common Pitfalls

- **Using the package manager directly:** Do not use pnpm, npm, or Yarn directly. Vite+ can handle all package manager operations.
- **Always use Vite commands to run tools:** Don't attempt to run `vp vitest` or `vp oxlint`. They do not exist. Use `vp test` and `vp lint` instead.
- **Running scripts:** Vite+ built-in commands (`vp dev`, `vp build`, `vp test`, etc.) always run the Vite+ built-in tool, not any `package.json` script of the same name. To run a custom script that shares a name with a built-in command, use `vp run <script>`. For example, if you have a custom `dev` script that runs multiple services concurrently, run it with `vp run dev`, not `vp dev` (which always starts Vite's dev server).
- **Do not install Vitest, Oxlint, Oxfmt, or tsdown directly:** Vite+ wraps these tools. They must not be installed directly. You cannot upgrade these tools by installing their latest versions. Always use Vite+ commands.
- **Use Vite+ wrappers for one-off binaries:** Use `vp dlx` instead of package-manager-specific `dlx`/`npx` commands.
- **Import JavaScript modules from `vite-plus`:** Instead of importing from `vite` or `vitest`, all modules should be imported from the project's `vite-plus` dependency. For example, `import { defineConfig } from 'vite-plus';` or `import { expect, test, vi } from 'vite-plus/test';`. You must not install `vitest` to import test utilities.
- **Type-Aware Linting:** There is no need to install `oxlint-tsgolint`, `vp lint --type-aware` works out of the box.

## CI Integration

For GitHub Actions, consider using [`voidzero-dev/setup-vp`](https://github.com/voidzero-dev/setup-vp) to replace separate `actions/setup-node`, package-manager setup, cache, and install steps with a single action.

```yaml
- uses: voidzero-dev/setup-vp@v1
  with:
    cache: true
- run: vp check
- run: vp test
```

## Review Checklist for Agents

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to validate changes.
<!--VITE PLUS END-->

---

# Kernel rebase migration

Gen2 is being rebased onto a composable graph kernel. **Read the docs in this order:**

1. **`docs/revised2/PLAN.md`** — the current prescriptive plan (synthesizes all of `docs/revised2/`; organizes the R-phase work around the five-primitive public model: Node, Edge, Predicate, Diagnostic, Pattern).
2. **`docs/revised2/CURRENT.md`** — the live status board (verified metrics, what has landed, what is next). Update it as work lands.
3. `docs/revision/revised-core.md` — the full destination-architecture design (kernel primitives, dialects, passes, MLIR analogy). Still the deep reference; `docs/revised2/` refines its public surface.
4. `docs/revision/revised_phases.md` — R-phase sequencing.
5. `docs/revised-kernel.md` — one-page orientation.

Active side-plans: `docs/fx-api-plan.md` — the Effect-inspired `src/fx/` API surface (implemented; some planned test files still missing). Note it currently delegates to the legacy `gen.*` builders, so it inherits whatever the kernel migration does to them. `docs/revised2/effect-atom-jsx-lessons.md` — design lessons adopted from the sibling `~/effect-atom-jsx` project (witness tiering, tsc-as-legalization-gate, Result rendering contract, UI target dialect candidate).

Superseded (historical context only, do not implement from them): the root `revised-core.md` (older draft of `docs/revision/revised-core.md`), `docs/core-primitives.md` and `docs/core-primitives-pre-phase5.md` (the pre-kernel stdlib primitive model), and `implementation_plan_next.md`.

The older milestone guides (`phase3_*`, `phase4_*`, `phase4.5_*`, `phase5_*`, `phase5.5_*`, `phase6_*`, `phase7_*`) are **superseded** as sequencing plans. They remain useful as source material for what behavior must be preserved, but new work should not extend the old `GenContext` array model they describe.

## Migration rules

While work is in progress on this branch:

1. **No new top-level semantic arrays on `GenContext`.** The interface in `src/core/context.ts` already carries a long list of legacy `readonly <name>: X[]` fields. Do not add new ones. New semantic state belongs in `ctx.graph` (the `KernelGraph` field added in PR 2 of the rebase).

2. **No raw-string trait, kind, edge, or capability identity in internal code.** Use the typed symbol definitions in `src/kernel/symbol.ts` (`defineSymbol`, `defineTrait`, `defineNodeKind`, `defineEdgeKind`, `defineLaw`, `defineCapability`). Strings remain fine for display names and external protocol names.

3. **No new module-level checker registration outside the pass pipeline.** Once `KernelPass`-based lifecycle lands (PR 5 onward), new checks must be registered as passes. Until then, a check added to `src/lifecycle/lifecycle.ts` should be small, well-isolated, and easy to port.

4. **Dual-write, then migrate, then delete.** When a builder is converted, it should populate both the legacy array and `ctx.graph` for at least one PR cycle, with golden tests proving byte-equivalent lifecycle output before any deletion.

5. **Targets keep consuming legacy IR until lowering passes exist.** Do not change target emitters during the bridge phase.

The architecture lint test in `tests/architecture/` enforces (1) and parts of (2) at CI time.

## Design preferences

- **Prefer the revised design over backward compatibility.** This branch may break older APIs when doing so improves the kernel design, advances the revised architecture, or removes legacy casts/bridge patterns. Preserve behavior where it is cheap and compatible with the new model, but do not keep awkward compatibility layers solely to avoid breaking callers.

- **Migrate to final IR, do not preserve bridge IR.** Bridge aliases and fallback readers are temporary scaffolding only. When a semantic family is migrated, add the final dialect node/edge kinds needed by the revised design, update new producers to emit only final dialect IR, update graph-native readers, and remove obsolete bridge aliases/tests. Do not add new compatibility aliases unless they are strictly needed to keep an already-migrated reader working during the same change.

- **End-user APIs must infer types without casts.** Public builders, helpers, plugins, targets, and dialect APIs should preserve literal names, payload types, and relationships through generics or typed definitions so callers do not need `as`, explicit type arguments, or manual narrowing in normal use. Internal casts are acceptable only as temporary bridge code and should be isolated behind typed accessors.

- **Typed IR beats ad-hoc metadata.** When moving state into `ctx.graph`, prefer dialect-owned node/edge definitions with typed payload helpers over raw `metadata` bags or `_bridge*` fields. Metadata can remain a temporary migration bridge, but new durable IR should be explicit and inferable.

- **Typed witnesses beat magic-string arguments.** When an API or IR edge needs to identify a trait, kind, edge role, capability, operation, field, rule, policy, target, or other semantic object, prefer passing the typed witness object/ref/definition itself instead of a raw string ID. String IDs are acceptable for display names, external protocol names, serialization boundaries, and temporary migration bridges, but avoid making them the internal argument shape when typed objects can carry identity and inference.

- **Use the TypeScript inference cheatsheet when shaping public APIs.** Before changing builders, namespaces, dialect definitions, or helper overloads, consult `docs/typescript_inference_cheatsheet.txt` and bias toward APIs with great inference, DX, flexibility, and composability. In normal authoring flows, callers should not need casts, explicit type arguments, or manual narrowing to preserve literal names, field ownership, payload types, or operation relationships.

## Agent work log

### 2026-05-06 — Typed witness API inference pass

Following `docs/typescript_inference_cheatsheet.txt`, improve kernel APIs by carrying typed witness objects through public helpers instead of asking callers to repeat magic string identities:

- Preserve literal IDs in `SymbolDef`, ODS node/edge/endpoint definitions, and operation signatures.
- Prefer `defineNodeFromKind(nodeKind, ...)` and `defineEdgeFromKind(edgeKind, ...)` for graph construction when a dialect witness exists.
- Let dialect definitions preserve their node-kind, edge-kind, trait, pass, and lowering tuple types through `defineDialect()`.
- Add type-level regression coverage whenever changing these APIs, especially for endpoint-key inference and operation input/output preservation.
- Use magic strings only at definition boundaries; internal construction and adapter code should pass typed witness objects whenever possible.

### 2026-05-04 — R13 premature deletion mistake

**What happened:** We began mechanically deleting `GenContext` arrays following `docs/revision/r13-remaining-arrays.md` **before** building the dialect infrastructure (R2–R12) that should own them. We completed Groups A and B:

- **Group A:** `refs`, `nodes` — deleted; graph-native readers (`getRefsFromGraph`, `getStaticNodesFromGraph`) added
- **Group B:** `events`, `event_emissions`, `reducers`, `subscriptions`, `reactions` — deleted; bridge files (`src/events/kernel.ts`, `src/reaction/kernel.ts`) and extraction helpers added
- **Stable ID API improvements:** Added structured-object overloads (`core.entityId({ name })`) and `_for` helpers (`core.entityIdFor(entity)`) in `src/core/refs.ts`

**Why this was out of order:** `revised_phases.md` sequences R2 (Core dialects) → R3–R9 (Domain dialects) → R10–R12 (Pass pipelines, target dialects) → **R13** (Delete legacy). Deleting arrays before the dialect system exists means we built ad-hoc bridge metadata (`_bridgeEvent`, `_bridgeReaction`, etc.) that will need to be migrated into proper `Dialect` definitions later.

**Decision:** Stop R13. Resume the phase plan in order starting from **R2 — Core dialects**.

**What still needs to be done (in proper order):**

1. **R2 — Core dialects:** Define `RefDialect`, `PlacementDialect`, `ContextDialect`, `ProviderDialect`, `OwnershipDialect` using `defineDialect()` from `src/kernel/dialect.ts`. These should use `NodeKindDef`/`EdgeKindDef` from `src/kernel/ods.ts`, not plain objects.
2. **R3–R9 — Domain dialects:** Convert existing ad-hoc bridge files (`src/entity/kernel.ts`, `src/function/kernel.ts`, `src/relation/kernel.ts`, etc.) into proper dialects.
3. **R10–R12 — Pass pipelines and target dialects:** Move lifecycle checkers into `KernelPass` definitions owned by dialects.
4. **R13 — Delete legacy:** Only after dialects and passes are complete. The Groups A/B deletions are done and can stay; Groups C–M should wait.

**Current state of the codebase as of 2026-05-06:**

- `src/kernel/dialect.ts`, `src/kernel/ods.ts`, `src/kernel/pass.ts`, and `src/kernel/lower.ts` exist and are wired into `createGen()`.
- `src/dialects/` now contains core, domain, callable, reactivity, auth, UI, target, and Postgres dialect scaffolds registered in `GenContext.dialectRegistry`.
- `GenContext` now has `graph`, `dialectRegistry`, `passRegistry`, `pipelineRegistry`, and `loweringRegistry`.
- R2 is scaffolded, and parts of R3-R12 are structurally present, but most dialects still have `passes: []` and `lowerings: []`; they are vocabulary definitions more than semantic owners.
- `GenContext` has lost `refs`, `nodes`, `events`, `event_emissions`, `reducers`, `subscriptions`, `reactions`; do not continue R13 deletion until graph-native readers and dialect-owned passes exist for the remaining legacy arrays.

**Next action:** Resume at R3/R4 implementation depth. Harden type/operation/expression/rule graph IR, move checks into dialect-owned pass behavior, and keep targets on bridge IR until lowering passes are real.

### 2026-05-06 — Resumed R3/R4 foundation after dialect scaffolding

**What changed:** The repository has moved beyond the earlier R2 starting note. Core dialects and several higher dialect scaffolds are registered at `createGen()` time, and the lifecycle already routes checks through `PassRegistry`/`PipelineRegistry`.

**Decision:** Treat the project as structurally ahead but semantically still around R3/R4. Continue by making dialect registration enforce graph ownership and by porting real checks/lowerings into dialect/pass-owned implementations. R13 remains paused.

**Current checkpoint:** Added lifecycle diagnostics for graph node and edge kinds that are not owned by any registered dialect. Auth, rule, expression field-read, and relation dual-write have been migrated off their bridge edge IDs and now emit final dialect-owned edge kinds.

### 2026-05-06 — Auth policy edges moved to final dialect kinds

**What changed:** `policyToKernelEdges()` now emits `edge.kind.policyTargetsEntity` and `edge.kind.policyUsesRule` from `AuthDialect` instead of the bridge-wide `edge.kind.targets` / `edge.kind.requires` kinds.

**Compatibility note:** Rule-derived reactivity still recognizes the old `edge.kind.requires` reader path as a bridge fallback, but new auth policy dual-writes no longer produce those legacy auth edges. The auth dialect no longer registers the auth-specific bridge aliases for `targets` or `requires`.

**Next action:** Continue bridge-edge retirement with the rule edge family (`edge.kind.reads`, `edge.kind.hasBody`, `edge.kind.hasVar`, `edge.kind.exprReadsField`) or relation edge family (`edge.kind.domain.relation`), updating graph-native readers before removing each alias.

### 2026-05-06 — Rule edges moved to final R4 dialect kinds

**What changed:** Added final `edge.kind.ruleHasBody` and `edge.kind.ruleDeclaresVar` definitions to `ExprRuleDialect`, alongside existing `edge.kind.ruleReads`. `ruleToKernelEdges()` and derived rule view dual-write now emit final rule dialect edge kinds instead of `edge.kind.reads`, `edge.kind.hasBody`, and `edge.kind.hasVar`.

**Compatibility note:** Graph-native rule dependency extraction and rule-derived reactivity now read final rule edge kinds. The old rule bridge aliases for `reads`, `hasBody`, and `hasVar` are no longer registered in `ExprRuleDialect`.

**Next action:** Migrate expression lowering off `edge.kind.exprReadsField` into a final expression/rule dialect edge kind, then remove that bridge alias. After that, migrate relation dual-write off `edge.kind.domain.relation`.

### 2026-05-06 — Expression field reads moved to final R4 dialect kind

**What changed:** Added final `edge.kind.expressionReadsField` to `ExprRuleDialect`. `lowerRuleExpr()` now emits that final edge kind for field access expressions instead of `edge.kind.exprReadsField`.

**Compatibility note:** The old `edge.kind.exprReadsField` alias is no longer registered in `ExprRuleDialect`, and new rule definitions assert they do not emit it.

**Next action:** Migrate relation dual-write off the remaining relation bridge edge `edge.kind.domain.relation` to final `edge.kind.domainRelation`, then remove that alias.

### 2026-05-06 — Relation edges moved to final domain dialect kind

**What changed:** `relationToKernelEdge()` now emits final `edge.kind.domainRelation` from `EntityFieldRelationDialect` instead of the bridge `edge.kind.domain.relation`.

**Compatibility note:** `checkRelationsOnGraph()` now reads `DOMAIN_RELATION_EDGE_KIND`, and the old `edge.kind.domain.relation` alias is no longer registered in `EntityFieldRelationDialect`.

**Next action:** Continue R5 domain ownership by migrating entity field ownership/type edges from generic `edge.kind.owns` / `edge.kind.hasType` to final `edge.kind.ownsField` / `edge.kind.fieldHasType`.

### 2026-05-06 — Entity field edges moved to final domain dialect kinds

**What changed:** `entityToFieldEdges()` now emits final `edge.kind.ownsField` and `edge.kind.fieldHasType` from `EntityFieldRelationDialect` instead of generic `edge.kind.owns` / `edge.kind.hasType`.

**Compatibility note:** Domain entity/field/relation dual-write now uses final domain dialect edge kinds. The generic `edge.kind.hasType` remains available for the core type/operation dialect and should not be used for domain field typing.

**Next action:** Move from R5 cleanup back to R3 type/operation cleanup: migrate built-in operation input/output type edges to final `TypeOperationDialect` edge definitions and endpoint roles, then audit remaining generic kernel edge producers.

### 2026-05-06 — Built-in operation type edges use typed dialect witnesses

**What changed:** `opToKernelEdges()` now emits built-in operation input/output type edges using `HAS_INPUT_TYPE_EDGE_KIND` and `HAS_OUTPUT_TYPE_EDGE_KIND` from `TypeOperationDialect`, including endpoint roles from the ODS edge definitions.

**Compatibility note:** The edge IDs are unchanged (`edge.kind.hasInputType`, `edge.kind.hasOutputType`), but operation registration no longer uses the generic `kernel.edgeKinds` / `kernel.endpointRoles` witness objects. Function/callable adapters may still emit generic input/output type edges and should be migrated under the callable/type-operation cleanup.

**Next action:** Continue R3/R6 cleanup by migrating function callable type edges from generic `edge.kind.hasInputType` / `edge.kind.hasOutputType` producers to typed dialect witnesses, then move query/action read/write edges to final callable dialect edges.

### 2026-05-06 — Breaking typed-domain witness cleanup started

**Decision:** Prefer the final typed domain API over backward compatibility. Wide `Entity`, `Field[]`, and projection-only generics are now considered compatibility debt when they erase owner/name relationships that factory-created witnesses already carry.

**Active plan:**

1. Replace wide `Entity`/`Field` public surfaces in relation, query, storage, CRUD, forms, and function-adjacent APIs with generics that preserve typed witnesses.
2. Enforce field ownership at compile time where a target entity witness is already available, starting with relation endpoints, query selections/order/grouping, storage mappings, and action insert/update values.
3. Remove temporary `as any` compatibility casts added during the previous inference pass, especially in `src/crud/crud.ts`.
4. Promote entity-return inference through CRUD, forms, reactivity, services, and UI surfaces instead of narrowing outputs back to manually supplied scalar generics.
5. Add type-level regression coverage for wrong-owner fields and entity-return output inference as each API family is migrated.

**Current status:** Entity and field witnesses preserve literal entity names, field names, and owners. Function builders infer input/output from `SemanticType` or `Entity` witnesses. Action insert/update values enforce `FieldOf<E>` for direct callers. Remaining work is to carry the same precision through relation/query/storage/CRUD instead of casting around older wide APIs.

### 2026-05-06 — Typed domain witness cleanup completed

**What changed:** Relation, query, storage, and CRUD APIs now preserve entity/field witnesses more consistently:

- Relation constructors enforce endpoint ownership through `FieldOf<E>` where the endpoint semantics are direct. Cardinality helpers preserve their domain-specific endpoint roles: `oneToMany(parent, child, childFk, parentId)` and `manyToMany(left, right, linkLeftFk, linkRightFk, linkEntity)`.
- Query builders created with `fromEntity(entity)` carry the entity witness through `select`, `orderBy`, and `groupBy`, rejecting fields from unrelated entities.
- Storage `Mapping<E>` and `Projection<E>` now carry the mapped entity witness and projections accept only `FieldOf<E>`.
- CRUD derivation now carries the entity witness and projection witnesses through its return type, and the previous temporary `as any` casts around action mappings and returned CRUD functions were removed.
- Type-level regression coverage was extended for wrong-owner relation fields, wrong-owner action values, and wrong-owner storage projections.

**Compatibility note:** Some runtime diagnostic tests now intentionally cast invalid fields to cross the type boundary. This is expected: the public API rejects those invalid calls at compile time, while lifecycle diagnostics still defend dynamic/plugin inputs.

**Semantic type factory idea:** A future ergonomic API should bind a semantic-type registry once and then define entity fields through a callback, for example `defineEntityUsingSemanticTypes(Types)("User", (t) => ({ age: t.u8() }))`. Prefer the curried callback form as the primary API, with object form as a convenience overload when callers already have ready-made `SemanticType` witnesses.

**Next action:** Continue the same cleanup into expression/rule/auth/UI surfaces so field refs and policy conditions carry the input entity context instead of accepting arbitrary `Field` witnesses.

### 2026-05-06 — Typed expression/rule/auth context cleanup started

**Decision:** Continue breaking public API compatibility where doing so lets user-facing builders infer from typed witnesses instead of loose fields, strings, or manually supplied generic output types.

**Active plan:**

1. Add an ergonomic semantic-type-registry entity factory, preferably curried and callback-first: `defineEntityUsingSemanticTypes(types)("User", (t) => ({ id: t.uuid() }))`.
2. Make auth owner conditions and policy builders carry the target entity witness so `allowOwner`/policy field conditions reject fields from unrelated entities.
3. Add context-aware rule/expression helpers that bind an entity once and expose `FieldOf<E>` reads inside a callback.
4. Move UI/editor/form field configuration surfaces toward `FieldOf<E>` where an entity witness is already available.
5. Add type-level regressions for wrong-owner auth fields, context-aware rule field reads, and the semantic-type entity factory.

**Current status:** Starting audit. Relation/query/storage/CRUD are already typed-domain witness aware; expression, rule, auth, and UI surfaces still contain loose `Field` entry points that should become typed binding boundaries.

### 2026-05-06 — Typed expression/rule/auth context cleanup completed

**What changed:** Added the next typed API layer for field-scoped public builders:

- Added `defineEntityUsingSemanticTypes(types)` with callback and curried forms, preserving literal entity and field witnesses while letting callers destructure a semantic-type registry.
- Auth policy action inputs now type owner conditions against the policy target entity. `allowOwner(field)` preserves the field owner's entity witness, and `allowOwnerFor(entity)(field)` provides an explicitly entity-scoped owner helper.
- Rule helpers now support entity-scoped field reads: `rule.field(entity, field)` infers the field semantic type and rejects wrong-owner fields, while `rule.context(entity)` / `rule.for(entity, cb)` expose a `FieldOf<E>` field helper and prebuilt typed `ctx.fields`.
- Expression helpers now mirror the rule API with `fieldRefFor(entity)` and `exprFor(entity, cb)`.
- UI-facing helper factories were added for the surfaces that already have an entity witness: `formFieldFor(entity)`, `fieldOverrideFor(entity)`, `listColumnFor(entity)`, and `cursorPaginationFor(entity)`.
- Type-level regression coverage now exercises the semantic-type entity factory, typed auth owner policy inputs, rule/expression entity contexts, and UI helper field scoping.

**Compatibility note:** Runtime diagnostic tests that intentionally construct invalid policies or rules now cast through the type boundary. Public APIs reject these wrong-owner field references at compile time; lifecycle diagnostics still protect dynamic and plugin-produced IR.

**Validation:** `vp check`, `vp install`, and `vp test` pass. Current full suite: 84 files, 951 tests.

**Next action:** Continue the typed witness cleanup into callable/query/action graph IR: migrate remaining function/callable input/output type edge producers to dialect-owned typed witnesses, then move query/action read-write edges to final callable dialect edge kinds.

### 2026-05-07 — Authz dynamic boundary made explicit

**What changed:** Added `defineDynamicPolicy()` and `gen.authz.dynamicPolicy()` for decoded/plugin-produced authorization IR that has not passed typed authoring checks. The normal `definePolicy()` / `gen.authz.policy()` path remains strict and rejects wrong-owner `AllowOwner` fields at compile time.

**Test policy:** Runtime diagnostic tests should use the dynamic boundary when they intentionally construct invalid authz IR. Do not cast a field to another entity's field type in authz tests just to reach a checker; that hides the authoring API guarantee being tested elsewhere.

**AGENTS.md guidance:** The design preferences now explicitly point agents to `docs/typescript_inference_cheatsheet.txt` before changing public builders, namespaces, dialect definitions, or overloads. The goal is great inference, DX, flexibility, and composability without casts in normal authoring flows.

**Validation:** `vp check`, `vp install`, and `vp test` pass on May 7, 2026. Current full suite: 84 files, 951 tests.

**Next action:** Apply the same typed-authoring vs dynamic-ingestion separation to rules and any other tests that still cast invalid typed witnesses. Then continue callable/query/action graph IR cleanup: migrate function/callable input-output type edge producers to dialect-owned typed witnesses and retire remaining generic read/write edge producers.

### 2026-05-07 — R2 core dialect ownership bridge started

**What changed:** Began closing the remaining R2 gaps instead of moving deeper into R3:

- Added `ClaimDialect` under `src/dialects/core/claim.ts` with `ClaimNodeKind`, subject/predicate/source/evidence edge kinds, and authoritative/client-safe/server-only/derived claim traits.
- Moved claim node kind ownership out of `AuthDialect`; auth still references `node.kind.claim`, but the node kind is now owned by the core claim dialect.
- Added bridge adapters for R2 core facts:
  - `src/context/kernel.ts` for context nodes, provision edges, and requires-context edges.
  - `src/requirements/kernel.ts` for requirement nodes, provider nodes, satisfies edges, and conservative provider dependency edges.
  - `src/storage/kernel.ts` for storage-location placement nodes with placement capability traits.
- Public context, requirement, and provider namespace builders now dual-write legacy arrays and `ctx.graph`.
- Added dual-write tests for context provision/requirement graph facts and provider satisfaction graph facts.

**Current R2 status:** R2 now has core claim vocabulary and initial graph ownership for context, requirement, provider, and storage-location placement facts. Remaining R2 work is to add graph-native readers/check passes for requirement satisfaction, context provisioning, and placement safety, then port lifecycle checks from legacy arrays to dialect-owned passes with equivalence tests.

**Validation:** `vp check`, `vp install`, and `vp test` pass on May 7, 2026. Current full suite: 84 files, 953 tests.

### 2026-05-07 — R2 graph-native checks started

**What changed:** Added graph-native R2 check/read paths and moved the built-in lifecycle pass specs onto them:

- Added `deriveRequirementSatisfactionPlanFromGraph()` and `checkRequirementsOnGraph()` over `RequirementDialect`, `ProviderDialect`, `SATISFIES_EDGE_KIND`, and required context edges.
- Added `checkContextAndStorageOnGraph()` over `ContextDialect`, `PlacementDialect`, provision edges, required-context edges, and storage-location placement traits.
- `legalize.requirements` now calls `checkRequirementsOnGraph(ctx.graph)`.
- `legalize.contextStorage` now calls `checkContextAndStorageOnGraph(ctx.graph)`.
- Added `tests/r2-core-graph-checks.test.ts` covering graph/legacy equivalence for missing providers, ambiguous providers, missing context provisions, unsafe context storage, and lifecycle pipeline diagnostics.

**Known limitation:** The graph requirement checker currently covers missing and ambiguous satisfaction plus required contexts. Some legacy provider-placement details remain array-only, including provider placement/storage sensitivity, lifetime escape, request values in global cache, regulated client exposure, and provider dependency-cycle diagnostics. Those need graph facts for provider placement/source/lifetime and dependency edges before R2 can be called complete.

**Validation:** `vp check`, `vp install`, and `vp test` pass on May 7, 2026. Current full suite: 85 files, 958 tests.

### 2026-05-07 — R2 provider placement graph parity expanded

**What changed:** Continued R2 graph-native requirement/provider parity:

- Provider bridge now emits placement/source graph edges for provider placement, provider storage, client-storage sources, and state-resource sources.
- Provider bridge records source lifetime ceilings on provider nodes so graph checks can detect lifetime escape without reading legacy provider objects.
- Provider dependency edges are recomputed after each provider registration so cycles are visible in `ctx.graph` even when dependencies are declared before their providers.
- `checkRequirementsOnGraph()` now detects provider dependency cycles, secret/server-only client-readable placement, and lifetime escape from graph facts.
- R2 graph equivalence tests now cover provider cycles, secret client storage, server-only client placement, and request-source lifetime escape.

**Current R2 status:** Requirement/provider/context/placement built-in lifecycle checks now run graph-native for the covered diagnostics. Remaining parity gaps are narrower: request-lifetime values stored in global cache and regulated client-readable provider storage still need focused graph equivalence coverage, and graph-safe projection facts are not represented yet.

**Validation:** `vp check`, `vp install`, and `vp test` pass on May 7, 2026. Current full suite: 85 files, 962 tests.

### 2026-05-07 — R2 provider placement parity completed

**What changed:** Closed the remaining known provider-placement graph parity gaps:

- Provider nodes now preserve `client_projection` metadata, including projected type and projected sensitivity, so hydration/safe-projection facts are graph-visible.
- Added graph/legacy equivalence coverage for request-lifetime providers stored in global cache.
- Added graph/legacy equivalence coverage for regulated providers exposed through client-readable storage.
- Added direct graph coverage proving safe projection metadata is present on provider nodes.

**Current R2 status:** Core claim, context, requirement, provider, and placement facts are now represented in graph IR and the built-in lifecycle R2 checks for context storage plus requirement/provider satisfaction/placement run graph-native. R2 is substantially complete for verification parity. Remaining cleanup before declaring R2 fully closed: decide whether hydration and target docs/devtools should consume graph provider/context facts now or wait for later target/legalization phases, and add any missing architecture guardrail for claim ownership if needed.

**Validation:** `vp check`, `vp install`, and `vp test` pass on May 7, 2026. Current full suite: 85 files, 965 tests.

### 2026-05-07 — Graph requirement plans split from domain plans

**What changed:** `deriveRequirementSatisfactionPlanFromGraph()` now returns a dedicated `GraphRequirementSatisfactionPlan` with graph-shaped requirements, providers, bindings, missing, and ambiguous arrays. It no longer casts graph summaries to `RequirementTarget[]`, `Provider[]`, or `RequirementBinding[]`.

**Core API improvement:** The kernel now has the first kind-aware API layer needed by this direction:

- `KernelMetadata<Custom>` carries a typed `custom` payload instead of forcing every reader through `Record<string, unknown>`.
- `defineNodeKind()` and `defineEdgeKind()` accept phantom `custom` payload witnesses.
- `defineNodeFromKind()` preserves node-kind metadata custom types in its returned `KernelNode`.
- `KernelNodeRef`, `RefOf<TNode>`, and `refOf(node)` preserve the node-kind witness in refs.
- `nodesOfKindDef()` and `edgesOfKindDef()` query by ODS kind witnesses and recover typed metadata.
- `readEdgeEndpoints(edgeKind, edge)` returns named endpoint accessors such as `{ provider, requirement }`, avoiding endpoint tuple indexing at reader sites.

**R2 reader cleanup:** Requirement/provider/context graph readers now use kind-aware graph queries and named endpoint readers for the main R2 edges. Provider node metadata reads no longer cast `source_kind`, `lifetime`, or `sensitivity`; those flow from `PROVIDER_NODE_KIND`'s typed custom payload.

**Design note:** This follows the typed-kernel direction: graph readers should expose graph-native facts unless they still have the original typed domain witnesses needed to produce a domain plan. Do not reintroduce `as unknown as RequirementTarget[]`-style return values; add an explicit domain conversion only when the original authoring values are available.

**Next action:** Continue kind-aware cleanup by typing endpoint targets from `EndpointRoleDef.target.targetKinds`, branding node/edge/requirement keys, and replacing the remaining bridge metadata casts with dialect-owned custom payload witnesses.
