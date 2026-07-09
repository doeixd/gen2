# Revised kernel — orientation

This is the one-page summary of where Gen2 is going. For the current prescriptive plan and live status see [`docs/revised2/PLAN.md`](./revised2/PLAN.md) and [`docs/revised2/CURRENT.md`](./revised2/CURRENT.md). For the full design see [`docs/revision/revised-core.md`](./revision/revised-core.md). For phase-by-phase sequencing see [`docs/revision/revised_phases.md`](./revision/revised_phases.md). For migration rules during the rebase see [`AGENTS.md`](../AGENTS.md).

## What changes

Gen2 today keeps semantic state in a hundred-plus typed arrays on `GenContext` (entities, relations, queries, action_functions, rules, policies, forms, …). Each module owns its own checkers and emitters. Cross-module facts (this rule reads this field; this action writes this field; this view submits this action) are reconstructed module by module.

The rebase replaces that with a single semantic graph:

```
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

The hard kernel (`src/kernel/`) is the substrate: `Id`, `SymbolDef`, `Metadata`, `Trait`, `Type`, `Expr`, `Transform`, `Node`, `Edge`, `Graph`, `Pass`, `Dialect`, `Diagnostic`, `Artifact`. It depends on nothing else in the repo.

## What stays ergonomic

The public builder API (`gen.entity`, `gen.relation`, `gen.rule`, `gen.func.action`, `gen.ui.*`) does not go away. Builders become **dialect frontends** that emit graph IR. The user still writes:

```ts
const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
const Post = gen.entity("Post", { ... });
gen.relation(User, "posts", Post, "author", { kind: "one_to_many" });
```

…and the implementation populates `ctx.graph` instead of (or in addition to, during migration) the legacy arrays.

## The bridge

The migration is staged: dual-write, then migrate, then delete. While the bridge is in place:

```
GenContext = {
  graph: KernelGraph,          // new — kernel substrate
  entities: Entity[],          // legacy — kept until every reader is graph-native
  relations: Relation[],       // legacy
  ...                          // (the existing arrays stay during migration)
}
```

When a builder is converted, it pushes to both. Golden tests in `tests/golden/` pin lifecycle output byte-for-byte so dual-writes cannot perturb anything legacy reads. An architecture lint test in `tests/architecture/` rejects PRs that add new semantic arrays to `GenContext` or use raw string identity for kinds/traits in internal code.

When every reader of a legacy array has been replaced by a graph query, the array is removed. That cleanup is not part of the bridge — it lands in the deletion phase (R13 of `revised_phases.md`).

## Where things live

```
src/kernel/         hard kernel — id, symbol, type, expr, transform, node,
                    edge, graph, trait, pass, dialect, law, scope, ods,
                    lower, verifier, operations, metadata, artifact,
                    diagnostic, kind. Pure. No imports from src/ above.

src/dialects/       (does not exist yet) — once stdlib modules begin to
                    carve out, dialect packages will live here.
                    Until then, modules emit kernel IR directly through
                    adapter files (e.g. src/entity/kernel.ts).

src/core/context.ts GenContext, currently legacy-array-shaped. Gains a
                    `graph: KernelGraph` field in PR 2 of the rebase.

src/lifecycle/      Today: orchestrates module checkers and target emitters.
                    Migration target: replaces those with KernelPass
                    pipelines as checkers/emitters are ported.

src/<module>/       Existing modules (entity, relation, rules, function,
                    authz, reactivity, storage, ui, ...). These remain
                    during the bridge. Each one will gain a `kernel.ts`
                    that emits kernel IR, then have its checks ported to
                    KernelPasses, then have its legacy IR removed.
```

## Sequencing

The first wave of bridge PRs:

1. R0 — branch, guardrails, golden tests, this note. (PR 1)
2. Add `graph: KernelGraph` to `GenContext` and initialize it in `createGen()`. (PR 2)
3. Add `entityToKernelNode`, `relationToKernelEdge`, etc. as pure conversion functions. (PR 3)
4. Dual-write entities and relations through the kernel. (PR 4)
5. Rebuild relation checking as a `KernelPass` over `ctx.graph`. Equivalence-test against the legacy checker. (PR 5)

After PR 5 the pattern is proven and the rest of `revised_phases.md` (R3 operations/laws, R4 expressions/rules, R5 entities-as-dialect, R6 callables, R7 reactivity, R8 auth, R9 UI, R10 pass pipelines, R11 plugin/dialect API, R12 targets, R13 deletion, R14 docs) plays out the same way: adapter, dual-write, pass migration, deletion.

## Mental model

```
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
