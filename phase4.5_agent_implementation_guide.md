# Phase 4.5 Agent Implementation Guide: Expression Unification and Pure Rule Subtyping

This guide is a handoff plan for an AI coding agent executing Phase 4.5 of the `gen2` roadmap.

## Context: Why Phase 4.5?

During architectural review, a significant structural seam was identified: the divergence between `RuleExpr` (used for pure business logic and Authz) and `Expr` (used for generic computation and Functions).

Originally, Phase 5 (Milestone TYPE7) planned to solve this by creating a "lowering" step that translates `RuleExpr` into `Expr`. However, lowering is a band-aid over a fundamentally duplicated AST. It forces the compiler to maintain two sets of inference logic, prevents zero-cost reusability (e.g., passing a `Rule` directly into a mutation payload), and isolates dependency extraction strictly to the Authz layer.

Phase 4.5 intercepts this. Instead of lowering, we will unify them at the type level. **A Rule is not a different AST; it is mathematically just a purely declarative, effect-free Subset of `Expr`.**

## Primary Goal

Unify `RuleExpr` and `Expr` into a single universal AST with strict type-level subtyping, while adhering rigorously to the principle of **No Magic Strings** and ensuring **Full Type Safety and Inference**.

The core outcomes are:

1. **Single AST:** Delete `RuleExpr`. The compiler only understands `ExprAstNode`.
2. **Auto-Promotion:** Because a `Rule` extends `Expr`, it can be used natively anywhere an expression is expected (Queries, Actions, Patches) without adapter functions.
3. **Universal Dependency Tracking:** Every `Expr` in the system (not just Rules) will statically track which `Fields`, `Entities`, and `Relations` it touches using typed references.
4. **Typed Traits over Magic Strings:** Differentiate between "Pure" (no side-effects) and "SQL-Safe" (can be lowered to Postgres RLS) using the newly formalized `TraitRef` system (e.g., `core.traits.sql_safe`), completely eliminating magic strings like `"sql_safe"` from the AST and logic.
5. **Expanded Logical Operators & Refinements:** Introduce `implies`, string operations, set memberships, and `Refinement<A, B>` type guards to ensure all complex business logic can be safely expressed.

## Recommended Milestone Order

1. **EXP1: Universal Dependency Tracking in `Expr`**
2. **EXP2: Unifying the AST and The `Rule` Subtype**
3. **EXP3: Migrating the `gen.rule` Builder Ergonomics**
4. **EXP4: Logical Implication Operator (`implies`)**
5. **EXP5: Refinements and Comprehensive Logical Operators**
6. **EXP6: Typed SQL-Safe Traits and Target Fallbacks**
7. **EXP7: Cross-Pollination and Edge Cases**

---

## Milestone EXP1: Universal Dependency Tracking in `Expr`

### Problem

Currently, only `Rule`s track which fields and entities they depend on (via `extractRuleDependencies`). This means the compiler is blind to what an `ActionFunction`'s raw `Expr` payload touches, preventing deep invalidation analysis.

### Target Design

Dependency extraction should be a fundamental property of `Expr` construction. When `buildExpr` is called, it should aggregate dependencies bottom-up using typed `Ref`s where applicable.

### Implementation Steps

1. Update `src/expression/expr.ts`.
2. Add `dependencies` to the `Expr` interface:
   ```ts
   export interface ExprDependencies {
     readonly entities: readonly Entity[];
     readonly fields: readonly Field[];
     readonly relations: readonly Relation[];
     readonly unbound_vars: readonly string[]; // Use carefully; prefer typed ParamRefs if possible
   }
   ```
3. Update `buildExpr` and `buildPredicate` to compute these dependencies by traversing the incoming `ExprAstNode`.
4. **Edge Case - Variable Shadowing:** Ensure that `let` bindings or closures in the AST properly distinguish between bound variables and unbound variables. Only `unbound_vars` should bubble up to the top-level `Expr`.

### Diagnostics

```txt
expr:unbound-variable-reference
```

### Acceptance Criteria

1. Every `Expr` and `Predicate` exposes a `.dependencies` object.
2. Variable scoping correctly handles shadowing so bound variables do not leak as dependencies.
3. Tests prove that building a complex `Expr` perfectly aggregates all deeply nested field references.

---

## Milestone EXP2: Unifying the AST and The `Rule` Subtype

### Problem

`RuleExpr` has specific nodes (like `rule.exists` and `rule.compare`) that duplicate `ExprAstNode` logic.

### Target Design

Eliminate `RuleExpr`. Make `Rule` a strict type alias over `Predicate` with empty effects and specific traits.

```ts
// In src/expression/expr.ts
export type Predicate<
  In = unknown,
  Req extends Requirement[] = [],
  Eff extends Effect[] = [],
> = Expr<boolean, Req, Eff>;

// In src/rules/rules.ts
export interface Rule<Name extends string = string, Vars = unknown> {
  readonly kind: "rule";
  readonly name: Name;
  readonly vars: readonly RuleVarDecl[];
  // Body is now just a pure Predicate
  readonly body: Predicate<Vars, [], []>;
  readonly dependencies: ExprDependencies;
}
```

### Implementation Steps

1. Move `exists`, `forall`, and relational comparison nodes from `RuleExpr` into the universal `ExprAstNode` union in `src/expression/ast.ts`.
2. Delete the `RuleExpr` types from `src/rules/rules.ts`.
3. Update `Rule` to use `Predicate` for its body.
4. Refactor `checkRules` to operate on the universal `Predicate` rather than a custom switch statement.

### Acceptance Criteria

1. `RuleExpr` is entirely removed from the codebase.
2. `Rule` cleanly wraps `Predicate<..., [], []>`.
3. Type compilation enforces that a `Rule` cannot contain an `Expr` that declares effects (like network calls).

---

## Milestone EXP3: Migrating the `gen.rule` Builder Ergonomics

### Problem

The developer experience of `gen.rule.define` is excellent because of `RuleVarContext` (`ctx.var.user.field('id')`). We must preserve this UX while emitting standard `Expr` nodes.

### Target Design

The `gen.rule.*` helpers (e.g., `gen.rule.eq`, `gen.rule.and`) should act as factory wrappers that emit standard `buildExpr` / `buildPredicate` calls, specifically enforcing that no effects are passed in.

### Implementation Steps

1. Refactor `src/rules/rules.ts`.
2. Re-implement `ruleEq`, `ruleCompare`, `ruleAnd`, etc., to return `Predicate` instances.
3. Update `createRuleBuilder`. The `when` closure must now expect a `Predicate` to be returned.
4. **Edge Case - Type Widening:** Ensure that TypeScript does not accidentally widen `[]` (empty effects) to `Effect[]` during builder inference. Use strict `const` generic constraints to ensure absolute purity is statically verified.

### Diagnostics

```txt
rules:impure-expression-in-rule
```

### Acceptance Criteria

1. Existing user-facing tests (`tests/rules-builder.test.ts`) pass with ZERO changes to the test assertions or API surface.
2. A diagnostic is emitted (or type error raised) if a user attempts to pass a side-effecting `Expr` into `gen.rule.and()`.

---

## Milestone EXP4: Logical Implication Operator (`implies`)

### Problem

Complex validation and business logic often requires "if-then" conditional rules (e.g., "If the user is a guest, then they must provide an email"). Currently, developers must manually construct this using `not(p).or(q)`, which is unintuitive and obfuscates the true business intent behind the rule.

### Target Design

Introduce a native `implies` logical operator to the universal `ExprAstNode` and the `gen.rule.*` builder API. It represents a logical implication ($p \implies q$).

### Implementation Steps

1. Add an `implies` node to the `ExprAstNode` union in `src/expression/ast.ts` and `PredicateKindTag`.
2. Implement `ruleImplies(antecedent, consequent)` in `src/rules/rules.ts` that returns a `Predicate`.
3. Add `implies` to the exported `rule` namespace.
4. Update SQL generation to safely lower `implies(p, q)` into SQL's native `CASE WHEN p THEN q ELSE TRUE END` logic (to safely handle three-valued SQL NULL logic).

### Acceptance Criteria

1. `gen.rule.implies(p, q)` constructs a valid `Predicate`.
2. Tests confirm the logic behaves identically to conditional implication, gracefully handling vacuous truth scenarios.

---

## Milestone EXP5: Refinements and Comprehensive Logical Operators

### Problem

The AST lacks several standard operations required to build complex real-world logic (e.g., `IN`, `LIKE`, `IS NULL`). Furthermore, checking if a nullable field `isNotNull` does not currently narrow the TypeScript type for subsequent operations in the AST, leading to clunky builder experiences.

### Target Design

Introduce a `Refinement<A, B>` type, which is a specialized `Predicate` that acts as a type guard. Also, complete the standard library of AST operators.

```ts
// A Refinement is a predicate that narrows the input type from A to B.
export interface Refinement<A, B extends A> extends Predicate<A> {
  readonly _narrowed?: B;
  readonly kind: PredicateKind; // e.g. "null_check" or "type_guard"
}
```

### Implementation Steps

1. **Define Refinement:** Create the `Refinement<A, B>` interface in `src/expression/expr.ts`.
2. **Missing Operators:** Add the following nodes to `ExprAstNode`:
   - Null checks: `isNull`, `isNotNull` (where `isNotNull` returns a `Refinement<T | null, T>`).
   - Membership: `in`, `notIn` (e.g., checking if a value exists in a static list or subquery).
   - String Operations: `startsWith`, `endsWith`, `contains`, `matches` (regex).
   - Quantifiers: `forall` (the logical dual to the existing `exists` operator).
3. **Builder Integration:** Add `gen.rule.isNotNull`, `gen.rule.in`, etc., to the builder namespace.
4. **AST Lowering:** Ensure the target generators (like the Postgres SQL emitter) know how to translate `in` to `IN (...)`, `startsWith` to `LIKE '...'`, and `isNotNull` to `IS NOT NULL`.

### Diagnostics

```txt
expr:unsupported-string-operation
```

### Acceptance Criteria

1. The builder supports the full suite of standard operators (Null checks, Strings, Membership, `forall`).
2. `isNotNull` correctly returns a `Refinement`, allowing TypeScript inference to drop `null` from the resulting operand's generic type constraints.
3. The SQL emitter translates the new AST nodes into valid Postgres dialects.

---

## Milestone EXP6: Typed SQL-Safe Traits and Target Fallbacks

### Problem

Previously, `RuleExpr` guaranteed SQL safety because it artificially restricted the grammar. Now that `Rule` uses `Expr`, a user could write a pure JS regular expression match (`matches`). It has no side-effects (so it is a valid `Rule`), but it cannot be easily translated to a Postgres `CREATE POLICY`. We must track this capability safely without using magic strings.

### Target Design

Utilize the typed `TraitRef` system. Expressions that can be safely lowered to SQL must carry the `core.traits.sql_safe` trait, enforcing full type safety and eliminating stringly-typed metadata.

### Implementation Steps

1. Define a `sql_safe` trait in `src/core/node.ts` using `createTrait("sql_safe")`. Add it to the exported `traits` object.
2. In `buildExpr`, conditionally attach the `core.traits.sql_safe` trait based on the `ExprAstNode` kind. (e.g., `eq`, `compare`, `and`, `implies`, `isNotNull` are safe. `custom_js` or complex `matches` regex are stripped of the trait).
3. Update `src/authz/authz.ts`. When evaluating a `Policy` for translation:
   - If `hasTrait(policy.predicate.body, core.traits.sql_safe)`, emit `sql_predicate`.
   - Else, emit `server_runtime_check` and flag a warning that RLS cannot be generated.

### Diagnostics

```txt
authz:rule-not-sql-safe
```

### Acceptance Criteria

1. The codebase uses `core.traits.sql_safe` (a typed `TraitRef`) and never the magic string `"sql_safe"`.
2. Pure but non-SQL-translatable rules gracefully degrade to server-side checks.

---

## Milestone EXP7: Cross-Pollination and Edge Cases

### Problem

The whole point of this unification is auto-promotion. We must prove that `Rule`s can now be used natively inside `ActionFunction`s and `QueryFunction`s, carrying full inference end-to-end.

### Target Design

Ensure that the typing of `ActionInsertBuilder` and `QueryExpression` natively accepts a `Rule.body` without any casting, lowering, or loss of type parameters.

### Implementation Steps

1. Add tests in `tests/expression-unification.test.ts`.
2. Create a test that defines a Rule: `const isPremium = gen.rule.define(...)`.
3. Create an Action that uses it directly in an update payload: `gen.func.buildActionUpdate(User, [[User.fields.premium_status, isPremium.body]])`.
4. Ensure the resulting `ActionFunction` successfully inherits the dependencies (fields/entities) from the `isPremium` rule automatically.

### Acceptance Criteria

1. Rules can be passed into `Expr` contexts with zero adapters.
2. Action invalidation logic correctly tracks dependencies derived from deeply nested `Rule`s used within the action's payload.
3. `vp check` and `vp test` pass cleanly with no TypeScript warnings or `any` casts.

---

## Final Phase 4.5 Completion Criteria

Phase 4.5 is complete when:

1. `RuleExpr` is deleted from the codebase.
2. `Rule` is successfully typed as a wrapper around a pure `Predicate` (`Expr<boolean, [], []>`).
3. Dependency extraction happens universally and automatically in `buildExpr`.
4. The `implies`, `Refinement`, and standard operators (`in`, `isNull`, `startsWith`, `forall`) exist and correctly translate to targets.
5. SQL-safety is determined by the `core.traits.sql_safe` typed `TraitRef`, completely avoiding magic strings.
6. All existing public `gen.rule.*` APIs remain ergonomically identical.
7. `vp check` and `vp test` pass with zero regressions.
