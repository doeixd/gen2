# Gen2 / Dirived: The Ultimate Final Design

This document synthesizes the architectural evolution of Gen2 based on the complete corpus of revision documents and agent work logs from May 2026. It serves as the authoritative blueprint for the final, target architecture of the **Dirived** AI App Builder and its underlying Gen2 compiler.

## 1. Executive Summary: The Core Thesis

Gen2 is not a runtime framework; it is a **typed semantic graph compiler**.

The fundamental thesis is: **Define semantic facts once as a typed graph. Derive implementation artifacts by running passes over that graph.**

Instead of prompting an AI to scatter code across database schemas, React components, state managers, and API routes, Gen2 allows the AI (or developer) to capture the exact semantics of the application (types, entities, pure rules, operations, actions) into a serializable graph. From this graph, Gen2 derives authorization, cache invalidation, UI disabled states, database schemas, sync strategies, infrastructure deployments, and framework-specific runtime code.

## 2. The "Hard Kernel"

To reduce conceptual load while maximizing extensibility, Gen2's core is restricted to a tiny, universal substrate. Everything else (Entities, Actions, UI Views, Invariants) is part of the standard library built _on top_ of these primitives. The kernel consists of:

1.  **Id / Ref**: Stable compiler identity and typed semantic pointers (e.g., `FieldRef`, `RuleRef`). Refs prevent magic strings, survive renames, and allow safe cross-referencing.
2.  **SymbolDef**: Replaces raw strings for internal semantics (e.g. `NodeKindDef`, `EdgeKindDef`, `TraitDef`).
3.  **Location**: Source provenance to trace generated artifacts back to their origin.
4.  **Metadata**: Passive, JSON-serializable annotation (descriptions, display labels). Does not contain executable compiler behavior.
5.  **Trait**: Checked semantic claims (e.g., `pure`, `serverOnly`, `patchable`, `EntrypointTrait`). They declare what they apply to, require, and conflict with.
6.  **Protocol**: Behavior/accessor contracts for generic passes.
7.  **Type**: Semantic value shapes featuring `Decoded`, `Encoded`, `DecodeR`, and `EncodeR`.
8.  **Transform**: Typed conversions between representations (wire decoding, codecs) with expressions and laws.
9.  **Expr**: Typed, inspectable computation ASTs (validation, predicates, rules).
10. **Node**: Any named semantic object in the graph (Entity, Rule, Action, View, Provider, Artifact).
11. **Edge**: First-class semantic relationships. Edges are explicit entities with typed endpoints and metadata (e.g., `ownsField`, `reads`, `invalidates`, `triggeredBy`).
12. **Graph**: The universal registry of all primitives.
13. **Dialect**: Modules defining typed vocabulary (node/edge kinds, passes, lowerings).
14. **Pass**: A compiler transformation. Replaces disparate checkers, derivers, lowerers, and emitters.
15. **Diagnostic**: A first-class typed semantic object representing an error or hint.
16. **Artifact**: A final emitted file or target representation.

## 3. Dialect Architecture & Source Layout

Old parallel arrays (`ctx.entities`, `ctx.rules`) and separate registries are abolished. `GenContext` is stripped down, and all semantic vocabularies are grouped into **Dialects**:

- **`dialect.core`**: Placement, context, provider/requirement, ownership, claim, capability, provenance.
- **`dialect.domain`**: Entities, fields, relations.
- **`dialect.logic`**: Expressions, rules, operations, algebraic laws (commutative, associative).
- **`dialect.callable`**: Actions, queries, workflows, patches, plans.
- **`dialect.dispatch`**: Events, triggers, handlers, delivery guarantees, idempotency, outbox.
- **`dialect.reactivity`**: Keys, resources, mutations, invalidations, tracking scopes.
- **`dialect.dataflow`**: Collections, streams, queues, async/result states, mailboxes.
- **`dialect.ui`**: Views, slots, components, styles, design systems (AF-UI model).
- **`dialect.storage`**: Tables, columns, mappings.
- **`dialect.variant`**: Enums, tag unions, state machines.
- **`dialect.invariant`**: Diagnostics, invariant families.

Targets (Postgres, React, Solid, JSON-Render, Effect, Alchemy, OpenAPI) **only** consume legalized target dialect IR to emit artifacts.

## 4. Architectural Cornerstones

### Topology & Boundary Anchors

Because **Edges** are first-class, topologies are explicit. The **`BoundaryNode`** serves as the universal anchor. Every scope, placement, and execution edge points to a Boundary (e.g., client, server, worker), answering _"Where does this execution start or stop?"_

### Compiler Pass Pipelines & Three-Layer Graph Architecture

Passes are organized topologically based on the facts they consume and produce (`Verify -> Derive -> Canonicalize -> Legalize -> Lower -> Emit`). To guarantee high performance during semantic traversal and avoid slow array scans on hot paths, Gen2 is structured into three layers:

1.  **GraphStore**: The canonical, immutable-ish object storage.
2.  **GraphIndex**: Incrementally maintained indexes (e.g., `nodesByKind`, `edgesByKindAndEndpoint`) updated in bulk at write-time. Traversal APIs compile down to direct index probes instead of global scans.
3.  **GraphView**: Pass-local or dialect-local materialized views, cached across passes using delta-aware invalidation, to provide domain-specific query surfaces.

Additionally:

- **Graph Shaking (DCE)**: The `prune.reachableArtifacts` pass starts at nodes marked with `EntrypointTrait` (e.g., public boundaries, UI entrypoints) and walks edges to drop unused implementation graphs before emission.
- **Memoization & Semantic Hashing**: Passes explicitly declare their reads/writes. The compiler caches results based on the semantic hash of the subgraph read, re-running only what changed.
- **Textual IR & Migrations**: A Textual IR dumper (MLIR-style) ensures AI agents can read the graph. Migrations are generated by a pass that mathematically diffs `Graph(vOld)` and `Graph(vNew)`.

### First-Class Diagnostics & Invariants

Invariants are generic, extensible semantic objects (e.g., `RequiredField`, `AtLeastOnceRequiresIdempotency`). When an invariant fails, it emits a strongly-typed **Diagnostic** containing locations, severity, audience-specific messages, and machine-readable `remediation` hints to feed directly into the AI repair loop.

### UI Dialect (AF-UI & JSON-Render)

UI is separated into:

- **Authoring API (AF-UI)**: Inside-out composition using Slots, Behaviors, Styles, and Capabilities (Traits).
- **Serialization Target (JSON-Render)**: Emits Catalog and Spec JSON.
  This allows AI to safely generate JSON specs which Gen2 imports, verifies against capabilities, and legally compiles, preventing hallucinated React code.

### Derived Sync & Optimistic Updates

Instead of relying on a black-box generic sync engine, Gen2 derives precise cache invalidations, optimistic patches, and rollback plans from its knowledge of _Operations_, _Laws_ (idempotent, reversible), and _Edges_ (`Action writes Field`, `Query reads Field`).

### Infrastructure as Graph Facts (Alchemy)

Deployment is not an afterthought. A queue requiring durable storage or an action sending an email are recorded as requirement edges. The **Alchemy Target** lowers these semantic deployment requirements into actual TypeScript IaC (Cloudflare Workers, databases, secrets, buckets).

## 5. Authoring API & Ergonomics

### One Canonical Shape

Object, builder, curried, callback, `.class`, and pipe forms are authoring facades. They must all normalize to one canonical semantic definition and one graph-fragment lowering.

### Witnesses vs. Strings

Typed APIs accept _witnesses_ (e.g., `graph.edges.ofKind(app.edges.writes)`). Dynamic APIs accept _strings_ (e.g., `graph.edges.ofKindId("app.edge.writes")`). Mixing them is forbidden.

### Type Safety and Fallbacks

The developer API uses the **Fluent Builder Pattern** (`createGen().use(DomainDialect).use(UiDialect)`). To avoid the "Hover of Death" (massive intersection types), Gen2 uses **Type Collapsing** (`Compute<T>`) at public boundaries.
For custom, un-analyzable code (`ExprOpaqueJs`), developers must explicitly declare the "blast radius" (e.g., `conservativeWrites: [Project]`) to ensure the compiler can safely fall back to broad invalidation.

## 7. Agent Directives & Architectural Guardrails

For any autonomous agent working on this codebase, the following directives are **strict mandates**:

1.  **No New Legacy Arrays**: NEVER add new top-level arrays to `GenContext`. The array deletion is currently paused, but no regression is allowed. All semantic state must live in `ctx.graph`. Verify compliance using `tests/architecture/genctx-fields.test.ts`.
2.  **Witnesses Over Strings**: NEVER use raw strings (e.g., `"edge.writes"`) for internal semantic identity. ALWAYS use typed symbol witnesses (e.g., `app.edges.writes`). Dynamic strings are only allowed at decode/refinement boundaries.
3.  **Passes Over Checkers**: Do NOT register new legacy checkers in `src/lifecycle/lifecycle.ts`. All new verification, derivation, or emission logic must be wrapped in a `Pass` owned by a `Dialect`.
4.  **No Direct Emitter Hacks**: Target emitters (React, Postgres, etc.) MUST NOT consume high-level domain IR directly. They must consume **legalized target dialect IR**.
5.  **Preserve the Simple Runtime IR**: Do NOT make the underlying `RuntimeGraph` generic-heavy. TypeScript inference belongs at the construction (`.pipe()`, builder) and query boundaries.
6.  **Continuous Validation**: Always run `vp check` (linting/type-checking) and `vp test` (unit tests, including golden snapshots) after any change. Do not cast (`as any`) in tests just to bypass the compiler; if it doesn't infer, the API shape is wrong.

## 8. Current State & Immediate Next Steps

As of **May 2026**, the codebase is executing on the revised R0–R17 roadmap. Extensive architectural groundwork has been laid:

### Current State

1. **R0 & R1 (Hard Kernel) Complete**: The foundation is merged. Primitives like `Id`, `Node`, `Edge`, `Graph`, `Type`, `Expr`, `Trait`, and `Pass` are established in `src/kernel/`.
2. **R3 (Dialect Infrastructure) Active**: `DialectRegistry` and `defineDialect` are fully functional.
3. **Dialect Vocabularies Scaffolded (R8, R9, R12, R14)**: The core node kinds, edge kinds, and traits for Domain (`EntityFieldRelationDialect`), Callable (`CallableDialect`), Reactivity (`ReactivityDialect`), and UI (`UIDialect`) have been defined in `src/dialects/`.
4. **R17 (Legacy Arrays) Frozen**: An architecture test (`tests/architecture/genctx-fields.test.ts`) actively freezes the legacy `GenContext` arrays. The array deletion is currently paused while the dialect passes are built.

### Immediate Next Steps for the Agent

1. **Implement `GraphIndex` and Indexed Traversal (R1)**:
   - **Target File**: `src/kernel/graph.ts`
   - **Action**: Currently, queries like `nodesOfKindDef` and `edgesFrom` use `Array.from(...).filter(...)` which causes full table scans. Implement a `GraphIndex` (with `nodesByKind`, `edgesByKindAndEndpoint`, `incidentEdgesByRef`) that is incrementally updated during `registerNode` and `registerEdge`. Refactor the query functions to use these `O(1)` index probes.
2. **Complete R2 (Graph Composition API)**:
   - **Target Files**: `src/kernel/graph.ts` / `src/kernel/builder.ts`
   - **Action**: Implement the robust `.pipe(...)` and type-state builders (e.g. `GraphBuilder<TState>`). Ensure that chaining `node()` and `edge()` additions allows TypeScript to accumulate specific types without erasing them into generic `ReadonlyMap` types.
3. **Port Legacy Checkers to Passes (R15)**:
   - **Target Files**: `src/lifecycle/lifecycle.ts` and `src/dialects/**/*.ts`
   - **Action**: Extract validation and derivation logic from `lifecycle.ts` and legacy checker files. Refactor them into official `verify` and `derive` Passes (as defined in `src/kernel/pass.ts`), registering them within their respective dialects.
4. **Migrate Target Emitters (R16)**:
   - **Target Files**: `src/targets/**/*.ts`
   - **Action**: Refactor target emitters (e.g., Postgres, React) to query `ctx.graph` using specific `NodeKinds` and `EdgeKinds` via the newly indexed graph API instead of looping over the legacy `GenContext` arrays.
5. **Resume Legacy Array Deletion (R17)**:
   - **Target File**: `src/core/context.ts`
   - **Action**: Once the passes and emitters are 100% graph-native (and all `src/` readers are ported), systematically delete the frozen legacy arrays (starting with Group A: `refs`, `nodes`, and Group B: `events`, `reactions`). Maintain compliance with the `genctx-fields.test.ts` architecture test. The end state must be a completely clean `GenContext`.

## 9. Revision Document Index

The `docs/revision/` folder contains the detailed design discussions that shaped this final architecture. Here is a summary of their contents:

- **`deploy.txt`**: Proposes using "Alchemy" as the infrastructure-as-code deployment target for resources like queues, workers, databases, and secrets.
- **`dirived.txt`**: Landing page copy proposing the "Dirived" brand, an AI app builder powered by Gen2's semantic IR.
- **`funcs.txt`**: Defines the callable dialect, distinguishing pure expressions from runtime callable nodes (Queries, Actions, Mutations, Patches, Plans).
- **`gen_2_revised_readme.md`**: The revised public-facing README framing Gen2 as a typed semantic graph compiler rather than a traditional framework.
- **`gen_2_transition_agent_instructions.md`**: Instructions for AI agents guiding the transition to the typed semantic graph design without destroying the simple runtime IR.
- **`invariant.txt`**: Argues for making Invariants and Diagnostics first-class semantic objects with machine-readable metadata and actionable AI repair hints.
- **`multi-value.txt`**: Proposes higher-level dataflow dialects for Collections, Streams, Queues, Mailboxes, and Async Result States over the core primitives.
- **`perf.txt`**: Strategies for compiler and runtime performance, including graph shaking (DCE), pass memoization, incremental recomputation, and semantic hashing.
- **`phase_revisions.txt`**: Analyzes old Phase 5/6/7 plans and translates their intentions (e.g., entity views, dispatch unification, graph shaking) into the new kernel structure.
- **`r13-remaining-arrays.md`**: The meticulous, grouped migration plan for safely deleting all legacy arrays from `GenContext` (the final step of the rebase).
- **`reactions.txt`**: Proposes the `dispatch` and `effect` dialects to replace ad hoc reactions, subscriptions, and reducers as unified Trigger-to-Handler edges.
- **`ref.txt`**: Explains the critical role of "Refs" as typed, stable semantic pointers that prevent magic strings, survive renames, and maintain identity across compiler passes.
- **`revised-core.md`**: The original foundational proposal for the "hard kernel" design, reducing primitives to just Id, Type, Expr, Node, Edge, etc., and heavily utilizing dialects.
- **`revised_phases.md` & `revised_phases_new_design.md`**: The overarching 17-phase roadmap (R0-R17) for rebasing Gen2 onto the new kernel. The newer document incorporates typed dialects, graph steps, and diagnostics.
- **`revision-ideas.txt`**: Consolidates how the old subsystem folders should be absorbed into dialects, targets, adapters, or the kernel to eliminate parallel sources of truth.
- **`rules.md.txt`**: Discusses making rules pure, inspectable boolean expressions (`Expr<boolean>`) and treating them as the logic core for UI hints, Authz, and Reactivity.
- **`sync.txt`**: Details how Gen2 can derive cache invalidations, optimistic patches, and offline sync plans automatically from operation semantics and laws.
- **`typescript_suggestions.txt`**: Recommends heavy use of TypeScript inference, fluent builders, and phantom types to ensure type safety without user-land casts (e.g., solving the "Hover of Death").
- **`ui.txt`**: Recommends the AF-UI (Authoring API) and JSON-Render (Target Artifact) split for the UI dialect, modeling views and components using slots and traits.
