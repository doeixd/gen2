Yes. Given the repo, the Dirived essay, the reactive-type discussion, and the smaller-reactivity idea, I would **revise the previous implementation plan in three important ways**:

1. Don’t make “changes” a new foundational subsystem. They should be derived semantic nodes in the existing graph.
2. Make `INVALIDATES` the canonical semantic relation for reactivity; `cache.invalidate()` or `source.invalidate()` is a target lowering, not domain truth.
3. Before building the causal type system, finish the **general compiler architecture**: typed graph → patterns → invariants → graph patches/morphisms → pipelines → preview/verify/emit.

The essay has the right north star: *the product is the semantic graph that can explain, verify, repair, and regenerate the implementation*.  The current revised-core document is already moving in exactly that direction: a tiny kernel of `Type / Expr / Transform / Trait / Node / Edge / Graph / Pass`, with entities, queries, actions, resources, etc. built above it.

Here is how I would improve the repo, in priority order.

1. **Finish the kernel migration and delete the parallel architectures.** This is the most important work. Right now gen2 has the new kernel, but also the older `SemanticType`, `Entity`, `ActionFunction`, `Operation`, reactivity structures, obligations, and so on. These contain useful semantics, but many of them are still independent sources of truth. For example, `ActionFunction` has its own `effects`, `requirements`, `invalidates`, `reactivity`, `written_stores`, and consistency fields.  Those should increasingly become projections/views over the graph rather than facts stored independently.

   The intended architecture should be:

   ```text
   Authoring API
        ↓
   canonical semantic graph
        ↓
   derivation/check/lowering passes
        ↓
   target graphs
        ↓
   artifacts
   ```

   So `gen.entity()`, `gen.action()`, `gen.rule()`, etc. can remain lovely user-facing APIs, but their job is to **author graph facts**. They should not create a second model that later gets synchronized with the graph.

   I would make this an explicit invariant of the project:

   > If a semantic fact can be represented by a node or edge, it must not also have an independently authored representation elsewhere.

   During migration, the old representation can derive the graph representation. Eventually the graph becomes canonical.

2. **Clean up the kernel before putting more semantics on it.** There are several concrete pieces of architectural drift in the current kernel that should be fixed first.

   `src/kernel/symbol.ts` already has the right abstraction: typed `SymbolDef`s, `NodeKindDef`, `EdgeKindDef`, traits, capabilities, and the explicit “no magic strings” philosophy.  But `node.ts`, `edge.ts`, and `kind.ts` still define simpler parallel `NodeKind`, `EdgeKind`, and role shapes.   Collapse those into the symbol system. There should be **one typed identity mechanism**.

   `KernelExpr` currently has:

   ```ts
   requirements?: readonly string[];
   effects?: readonly string[];
   ```

   which directly conflicts with the typed-symbol/no-magic-string design.  Those should become typed semantic refs/witnesses—or, where they represent relationships to first-class things, actual graph edges.

   `KernelType` also needs to preserve much more precise generic information. Right now it essentially carries `KernelType<Decoded>` and a broad `TypeKind`.  Move toward:

   ```ts
   GType<
     Decoded,
     Encoded = Decoded,
     DecodeRequirements = never,
     EncodeRequirements = never,
     Kind = TypeKind
   >
   ```

   and preserve literal kinds through constructors.

   There is also a particularly important graph issue: current traversal does not have robust directionality. `edgesFrom()`/`edgesTo()` inspect endpoints generally, while `edgesBetween()` heuristically decides direction using prefixes such as `"edge.role.owner"`, `"edge.role.source"`, `"edge.role.writer"`, etc.  That cannot be the foundation for causal analysis.

   Edge definitions should know their topology:

   ```ts
   const Invalidates = defineEdgeKind({
     id: ...,
     roles: {
       source: SourceRole,
       target: TargetRole,
     }
   });
   ```

   Then:

   ```ts
   graph.outgoing(node, Invalidates)
   graph.incoming(node, Invalidates)
   ```

   has actual semantics rather than string heuristics.

   One more concrete bug/design issue: `PassRegistry.runPhase()` currently runs each pass against the same incoming graph and only combines the results afterward, whereas compiler derivation passes generally need to see changes produced by previous passes.  Make phase execution sequential just like `runPassPipeline()` unless a pass explicitly declares itself parallel/independent.

3. **Build the missing general compiler layer: Pattern, GraphPatch, Invariant, Morphism, Pipeline.** This is now more important than implementing `User.ops.age.increment`.

   Your Dirived essay contains what I think is the best abstraction in the whole project:

   ```text
   facts
   → pattern match
   → invariant
   → diagnostic
   → repair patch
   ```



   Make that real.

   I would add roughly:

   ```text
   src/graph/
     pattern.ts
     query.ts
     patch.ts
     diff.ts

   src/compiler/
     invariant.ts
     morphism.ts
     pipeline.ts
     diagnostic.ts
     repair.ts
     preview.ts
   ```

   But **do not add these as new kernel primitives**. They are abstractions over `Graph` and `Pass`.

   Conceptually:

   ```ts
   const RuleInvalidation = pattern()
     .edge("write", ActionWritesField)
     .edge("read", RuleReadsField)
     .same("write.field", "read.field")
     .edge("use", QueryUsesRule)
     .same("use.rule", "read.rule");
   ```

   Then:

   ```ts
   defineMorphism({
     match: RuleInvalidation,

     map({ action, query }, patch) {
       return patch.addEdge(
         Invalidates,
         action,
         query
       );
     }
   });
   ```

   A morphism should return a **graph patch**, not mutate the graph arbitrarily.

   That immediately gives you semantic diffs, provenance, previews, reversible tooling, repair proposals, and AI-agent friendliness.

   This is the architecture behind the essay's strongest claim that the graph is a shared substrate for humans, agents, compiler passes, target dialects, diagnostics, and generated code. 

4. **Make Dialect a first-class organizational abstraction.** The essay's “dialects, morphisms, surfaces, passes, pipelines” vocabulary is better than letting every target become a miscellaneous generator directory. 

   Something like:

   ```ts
   const PostgresDialect = defineDialect({
     id: ...,

     nodes: {
       table: ...,
       column: ...
     },

     edges: {
       tableHasColumn: ...
     },

     surfaces: {
       sqlPredicate: ...,
       sqlExpression: ...
     },

     patterns: {
       entityWithFields: ...
     },

     morphisms: {
       entityToTable: ...
     },

     invariants: {
       sqlLowerability: ...
     },

     pipelines: {
       emitSchema: ...
     }
   });
   ```

   `Surface` is especially useful. Instead of generic:

   ```text
   "supports postgres"
   ```

   a target can say:

   ```text
   lowers to SQL predicate
   lowers to SQL value expression
   lowers to client validation
   lowers to server handler
   supports atomic transaction
   ```

   Lowerability becomes graph-checkable.

   Then a rule can be semantically valid but fail a particular placement:

   ```text
   CanViewInvoice is valid.
   CanViewInvoice cannot lower to Postgres.sqlPredicate.
   ```

   That's a much better error model.

5. **Move reactivity up into the semantic graph and down out of the framework layer.** This is where all the recent ideas converge.

   The graph should contain facts such as:

   ```text
   IssueInvoice
       WRITES
   Invoice.status

   InvoiceIsDraft
       READS
   Invoice.status

   ListDraftInvoices
       USES
   InvoiceIsDraft
   ```

   A compiler pattern derives:

   ```text
   IssueInvoice
       INVALIDATES
   ListDraftInvoices
   ```

   That is the canonical semantic fact.

   It should **not** canonically derive:

   ```text
   IssueInvoice
       REQUIRES
   TanStackQuery.invalidateQueries(...)
   ```

   because that's implementation.

   Different targets may lower the same `INVALIDATES` edge to:

   ```text
   TanStack Query
       → invalidateQueries()

   small reactive runtime
       → source.invalidate()

   incremental computation
       → propagate delta

   materialized DB view
       → incremental refresh

   local cache
       → evict key
   ```

   This is exactly consistent with your “screen the abstraction off from the implementation” principle. 

   The existing reactivity model already has useful typed key families, resources, and mutation invalidation machinery.  Preserve those ideas, but gradually turn them into a **target/runtime dialect consuming semantic `READS/WRITES/DERIVES/INVALIDATES` edges** instead of being a separate source of reactivity truth.

6. **Add change witnesses, but make them mostly derived IR rather than mandatory authoring syntax.** I still think the type/change idea is good; I would just place it lower in the architecture.

   From:

   ```ts
   const User = g.entity("User", {
     name: g.types.string(),
     active: g.types.boolean(),
   });
   ```

   the compiler can internally derive witnesses like:

   ```ts
   User.ops.name.set
   User.ops.active.set
   User.ops.active.toggle
   ```

   These are useful because they give changes stable typed identities.

   But normal application authors often shouldn't have to write:

   ```ts
   IssueInvoice.requires(
     Invoice.ops.status.set
   )
   ```

   if:

   ```ts
   IssueInvoice.writes(Invoice.fields.status)
   ```

   already tells the compiler that.

   So the flow should be:

   ```text
   author declares:
       IssueInvoice WRITES Invoice.status

   compiler derives:
       IssueInvoice EMITS ΔInvoice.status

   compiler reasons:
       ΔInvoice.status INVALIDATES ...
   ```

   Change witnesses become an excellent **intermediate semantic vocabulary**.

   Their operation algebra should derive from semantic types conservatively:

   ```text
   boolean
     set
     toggle

   int counter
     set
     increment
     decrement

   email
     set

   money
     probably set by default
   ```

   Do not infer lawful state operations from storage representation. `Money` being physically an `i64` does not imply arbitrary increment/decrement.

7. **Unify operations, actions, effects, and changes around Node + Trait rather than closed parallel unions.** The current `Operation` model has a large discriminated union for unary, binary, comparison, aggregate, reducer, predicate, and effect operations.  That's useful information, but in the revised architecture it shouldn't remain another fundamental object hierarchy.

   An operation can instead be a node with traits:

   ```text
   Node AddMoney
     callable
     pure
     deterministic
     associative
     commutative

   Node SendEmail
     callable
     effectful
     network
     serverOnly

   Node IssueInvoice
     callable
     writable
     stateTransition
   ```

   The existing “open traits, closed core” plan is already arguing for exactly this direction: consumers should ask for semantic capabilities rather than concrete kinds.

   I'd preserve closed algebras where exhaustive target handling actually matters—`ExprOp`, for example—but make **application-level semantic objects open**.

8. **Introduce typed `yield*` effects after the graph semantics are correct.** This is useful, but it shouldn't be the foundation.

   Once operation/effect witnesses are real graph nodes, runtime-style implementations can become:

   ```ts
   app.implement(IssueInvoice, function* (invoice) {
     const updated =
       yield* Invoice.update(...);

     yield* Audit.record(...);

     yield* InvoiceIssued.emit(...);

     return updated;
   });
   ```

   TypeScript can infer the possible effect set from the generator's yielded request types.

   But distinguish:

   ```text
   MAY perform B
   ```

   from:

   ```text
   MUST perform B
   ```

   TypeScript's generator yield union can prove the first much more easily than the second.

   For full verification, have an inspectable `Plan`/program IR:

   ```text
   Sequence
   Branch
   Parallel
   Request
   Return
   Try
   ```

   and compute:

   ```text
   MayEffects(P)
   MustEffects(P)
   ```

   For a branch:

   ```text
   May  = union(branch effects)
   Must = intersection(branch effects)
   ```

   Then:

   ```text
   MayEffects(implementation) ⊆ AllowedEffects(operation)

   RequiredEffects(operation) ⊆ MustEffects(implementation)
   ```

   Opaque JS remains legal, but follows the rule from the essay:

   > **Opaque code is allowed. Unknown impact is not.** 

   An opaque callback must declare its semantic footprint.

9. **Make `preview → verify → emit` the primary product workflow.** I would actually prioritize this before supporting lots more output targets.

   The authoring experience should converge on:

   ```ts
   const preview = app.preview({
     pipeline: ...
   });

   preview.graphDiff;
   preview.diagnostics;
   preview.repairs;
   preview.explanations;
   preview.artifacts;

   await app.verify(preview);
   await app.emit(preview);
   ```

   This is already how the Dirived essay presents the product. 

   The critical object isn't the emitted source code. It's the **semantic diff**.

   For an agent especially:

   ```text
   Agent proposes graph patch
             ↓
   compiler previews implications
             ↓
   invariants detect violations
             ↓
   compiler suggests repair patches
             ↓
   agent chooses/applies repair
             ↓
   verified graph
             ↓
   code generation
   ```

   That's where the “agent-native language” idea becomes technically concrete rather than marketing.

The resulting repository architecture would look approximately like this:

```text
src/
  kernel/
    id.ts
    type.ts
    expr.ts
    transform.ts
    symbol.ts
    trait.ts
    node.ts
    edge.ts
    graph.ts
    pass.ts

  graph/
    pattern.ts
    query.ts
    patch.ts
    diff.ts
    provenance.ts

  compiler/
    invariant.ts
    morphism.ts
    pipeline.ts
    diagnostic.ts
    repair.ts
    preview.ts
    verifier.ts

  stdlib/
    domain/
      entity.ts
      field.ts
      relation.ts

    callable/
      operation.ts
      action.ts
      query.ts
      rule.ts

    causal/
      change.ts
      effects.ts
      invalidation.ts
      derivation.ts

    runtime/
      boundary.ts
      service.ts
      provider.ts

  dialect/
    core/
    postgres/
    http/
    effect/
    react/
    solid/
    tanstack-query/

  authoring/
    gen.ts
    app.ts
```

I would **not split all of these into npm packages yet**. First stabilize the semantic boundaries inside one repo/package. Package boundaries are much harder to change than folders.

### The next actual milestone

I would temporarily stop expanding features and implement one complete vertical example:

```text
Invoice domain
      ↓
IssueInvoice action
      ↓
writes Invoice.status
      ↓
rule reads Invoice.status
      ↓
query uses rule
      ↓
compiler derives INVALIDATES edge
      ↓
preview explains why
      ↓
TanStack dialect lowers invalidation
      ↓
Postgres dialect lowers data model
      ↓
invariants verify both
```

If that one example works entirely through:

```text
facts
→ graph
→ patterns
→ derived edges
→ invariants
→ morphisms
→ preview
→ artifacts
```

then the architecture is real.

If implementing it requires special-case logic like:

```ts
if (thing.kind === "action_function") ...
```

or manually copying semantic information into three subsystems, that exposes exactly what still needs to be generalized.

**That is the version of gen2/Dirived I would build now:** not a framework that knows a lot of features, but a small semantic graph language with an increasingly rich standard library of facts, and a compiler capable of discovering, checking, explaining, repairing, and lowering their consequences.
