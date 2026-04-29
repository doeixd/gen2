# Rules Implementation Guide

## 1\. Purpose

The rules package defines a typed, static predicate language for application semantics.

Rules are **not** the authorization system, the query engine, the UI system, or the runtime evaluator. Rules are a reusable logical substrate that other packages can consume.

Primary consumers include:

- `@gen/authz` for policy predicates
- query planning for SQL/database filters
- routing and UI for non-authoritative visibility hints
- reactivity for dependency extraction
- devtools and visualizers for rule graphs
- future IVM/materialization planners

The core rule contract is:

```txt
A rule is typed, inspectable, dependency-aware logic.
A planner decides where and how it can safely run.
A target either generates a supported implementation or emits diagnostics.
```

## 2\. Non-Goals

The initial rules package should deliberately avoid becoming a general-purpose logic programming engine.

Out of scope for the first implementation:

- arbitrary JavaScript predicate callbacks
- unrestricted recursion
- unrestricted negation
- aggregates
- general Datalog execution
- client-authoritative authorization
- opaque external policy engines as the primary model
- automatic IVM/materialized view maintenance
- implicit fallback from database filtering to unsafe server filtering

These may become later extensions, but they should not be required for the MVP.

## 3\. Design Principles

### 3.1 Static IR First

Rules MUST be represented as static records or typed AST nodes.

Rules MUST NOT require executing arbitrary JavaScript closures for checking, generation, dependency extraction, or placement planning.

Ergonomic callback-style builders MAY exist only if they lower immediately to inspectable IR and do not preserve the callback as the portable definition.

### 3.2 Rules Are Logic, Not Authz

`@gen/rules` owns logical predicates.

`@gen/authz` owns actor/resource/action semantics such as:

- who is the actor
- what resource is being accessed
- which action is being attempted
- whether a policy is authoritative
- whether failure means deny, hide, redact, or challenge

Rules may be used by authz, but rules themselves should not know about policy concepts unless represented as generic variables and predicates.

### 3.3 Placement Is a First-Class Result

A rule can potentially run in multiple places:

```txt
database predicate
RLS policy
server pre-query
server integrated query
server post-filter
client hint
materialized view / IVM
external evaluator
```

The planner MUST classify possible placements and explain unsupported placements.

Placement decisions MUST lower to the shared `Placement` model used across the broader compiler.

### 3.4 Server Authority Is Preserved

Client-side rule evaluation is always a hint unless explicitly proven otherwise and still backed by server enforcement.

Generated UI may hide buttons, disable fields, or show explanatory states based on client hints. It MUST NOT treat those hints as authoritative access control.

### 3.5 Conservative Failure

If a rule cannot be translated safely, the planner should prefer correctness over convenience.

For example, if a list authorization rule cannot be pushed to the database, the planner MUST NOT silently fetch all rows and filter them on the server. That can break security, pagination, and performance.

## 4\. Rule MVP Scope

The first useful implementation should be intentionally small.

### MVP Supports

- typed rule definitions
- typed variables
- entity references
- field references
- literal values
- equality predicates
- comparison predicates
- boolean `and`, `or`, `not` with restrictions
- relation existence checks
- simple ownership-style predicates
- dependency extraction
- SQL `WHERE` translation where safe
- server integrated query placement
- server-only fallback where bounded and explicitly allowed
- diagnostics for unsupported constructs

### MVP Defers

- recursion
- aggregates
- stratified negation beyond simple local negation
- materialized rules
- IVM
- RLS generation
- external engines
- best-effort client policy evaluation
- cross-store joins
- complex quantifiers beyond simple `exists`

## 5\. Core Concepts

### 5.0 Relationship To Existing Typed Expressions

The rules package SHOULD reuse the existing typed expression system wherever possible.

If the core library already has:

- `SemanticType<T>`
- `Field<T>`
- `Expr<T, Req, Eff>`
- `Predicate<Input, Output>`
- typed operations
- function IR
- requirement/effect phantom slots
- operation laws

then rules should not duplicate those concepts.

The preferred model is:

```txt
Rule = named, typed predicate artifact
     + variable binding metadata
     + placement/dependency metadata
     + safety constraints
     + optional references to existing Expr/Predicate IR
```

In other words, rules are not a second expression language. Rules are a constrained interpretation of the existing expression language for logic, dependency extraction, placement planning, and policy use.

A separate `RuleExpr` union should only be introduced if the existing `Expr` IR cannot represent a required rule construct, such as:

- logical quantifiers like `exists`
- relation membership predicates
- safe variable binding metadata
- stratified negation metadata
- rule invocation / predicate references
- placement-specific annotations
- explainability metadata

Even then, prefer small wrapper nodes that embed or reference existing `Expr` nodes rather than creating a parallel universe of literals, field refs, comparisons, and boolean operations.

Recommended direction:

```ts
interface Rule<Name extends string = string, Input = unknown> {
  readonly kind: "rule";
  readonly name: Name;
  readonly input: SemanticType<Input>;
  readonly predicate: Predicate<Input, boolean> | Expr<boolean>;
  readonly dependencies?: RuleDependencies;
  readonly placement?: RulePlacementHints;

  readonly \_input?: Input;
  readonly \_output?: boolean;
}
```

For simple MVP rules, this is enough:

```txt
Rule body = existing Predicate / Expr
Rule checker = validates it is boolean, static, dependency-extractable, and placeable
Rule planner = decides database/server/client/materialized placement
```

Only add `RuleExpr` later for constructs that are genuinely rule-specific.

### 5.1 Rule

A `Rule` is a named, typed logical predicate.

```ts
interface Rule<Name extends string = string, Vars = unknown> {
  readonly kind: "rule";
  readonly name: Name;
  readonly vars: RuleVars<Vars>;
  readonly body: RuleExpr<boolean>;
  readonly metadata?: RuleMetadata;

  readonly \_vars?: Vars;
}
```

Requirements:

- Rule names MUST be unique within a registry or module.
- Rule variables MUST be typed.
- Rule bodies MUST evaluate to boolean.
- Rule bodies MUST be inspectable AST nodes.
- Rule dependencies MUST be derivable without executing runtime code.

### 5.2 Rule Variables

Variables represent typed values available to the rule.

Examples:

```ts
const canEditProject = gen.rule.define({
  name: "canEditProject",
  vars: {
    actor: ActorRef,
    project: Project,
  },
  when: gen.rule.and(
    gen.rule.eq(Project.fields.ownerId, gen.rule.var("actor", "id")),
    gen.rule.eq(Project.fields.status, "draft"),
  ),
});
```

Variable kinds may include:

```txt
entity instance
actor/session value
scalar value
input object
relation binding
service-derived value, later
```

MVP variable types should prefer entity instances and scalar inputs.

### 5.3 Rule Expressions

Rule expressions are typed AST nodes.

Recommended base union:

```ts
type RuleExpr<T = unknown> =
  | RuleVarExpr<T>
  | RuleFieldExpr<T>
  | RuleLiteralExpr<T>
  | RuleEqExpr
  | RuleCompareExpr
  | RuleAndExpr
  | RuleOrExpr
  | RuleNotExpr
  | RuleExistsExpr;
```

Each variant MUST have a discriminant field.

Example:

```ts
interface RuleEqExpr {
  readonly kind: "rule.eq";
  readonly left: RuleExpr;
  readonly right: RuleExpr;
  readonly \_type?: boolean;
}
```

Avoid a single wide interface with many optional fields.

## 6\. Suggested Public API

### 6.1 Canonical Static Form

The canonical public form should be object-based and static:

```ts
const canViewProject = gen.rule.define({
  name: "canViewProject",
  vars: {
    actor: Actor,
    project: Project,
  },
  when: gen.rule.or(
    gen.rule.eq(Project.fields.visibility, "public"),
    gen.rule.eq(Project.fields.ownerId, gen.rule.field("actor", "id")),
  ),
});
```

### 6.2 Ergonomic Builder Form

A builder form may be added, but it must lower to the same IR:

```ts
const canViewProject = gen
  .rule("canViewProject")
  .vars({ actor: Actor, project: Project })
  .when(
    gen.rule.or(
      gen.rule.eq(Project.fields.visibility, "public"),
      gen.rule.eq(Project.fields.ownerId, gen.rule.field("actor", "id")),
    ),
  );
```

### 6.3 Callback Macro Form

A callback macro may be allowed only if it is purely a construction DSL:

```ts
const canViewProject = gen.rule.define({
  name: "canViewProject",
  vars: { actor: Actor, project: Project },
  when: ({ actor, project }) =>
    gen.rule.or(gen.rule.eq(project.visibility, "public"), gen.rule.eq(project.ownerId, actor.id)),
});
```

Important restriction:

```txt
The callback MUST NOT become part of portable IR.
The callback MUST execute only at definition time to build AST nodes.
The resulting rule MUST be inspectable without the callback.
```

## 7\. Rule AST Variants

### 7.1 Literals

```ts
interface RuleLiteralExpr<T> {
  readonly kind: "rule.literal";
  readonly value: T;
  readonly semanticType: SemanticType<T>;
}
```

Literals SHOULD validate against their semantic type when validators are available.

### 7.2 Variables

```ts
interface RuleVarExpr<T> {
  readonly kind: "rule.var";
  readonly name: string;
  readonly semanticType: SemanticType<T>;
}
```

### 7.3 Fields

```ts
interface RuleFieldExpr<T> {
  readonly kind: "rule.field";
  readonly source: RuleVarExpr | EntityRef;
  readonly field: Field<T>;
  readonly semanticType: SemanticType<T>;
}
```

A field expression MUST reference a valid field on the source entity or variable type.

### 7.4 Equality

```ts
interface RuleEqExpr {
  readonly kind: "rule.eq";
  readonly left: RuleExpr;
  readonly right: RuleExpr;
}
```

The checker MUST reject equality between incompatible semantic types unless a safe coercion is defined.

### 7.5 Comparisons

```ts
interface RuleCompareExpr {
  readonly kind: "rule.compare";
  readonly op: "lt" | "lte" | "gt" | "gte";
  readonly left: RuleExpr;
  readonly right: RuleExpr;
}
```

Comparisons MUST only apply to comparable semantic types.

### 7.6 Boolean Composition

```ts
interface RuleAndExpr {
  readonly kind: "rule.and";
  readonly terms: readonly RuleExpr<boolean>\[];
}

interface RuleOrExpr {
  readonly kind: "rule.or";
  readonly terms: readonly RuleExpr<boolean>\[];
}

interface RuleNotExpr {
  readonly kind: "rule.not";
  readonly term: RuleExpr<boolean>;
}
```

For MVP, `not` should be restricted to locally safe predicates. Full negation should wait for a safety model.

### 7.7 Exists

```ts
interface RuleExistsExpr {
  readonly kind: "rule.exists";
  readonly relation: RelationRef;
  readonly where: RuleExpr<boolean>;
}
```

`exists` is the first useful relation primitive. It can express membership, ownership through relation tables, and many policy checks.

The planner should translate simple `exists` into SQL `EXISTS (...)` when all referenced stores and joins are supported.

## 8\. Type Safety Requirements

TypeScript SHOULD catch local shape errors:

- unknown variable name
- field not present on variable entity
- comparing incompatible field types
- using non-boolean expressions in `and`, `or`, `not`
- missing rule variable declarations
- invalid literal type where statically expressible

Lifecycle checks SHOULD catch global and target-level issues:

- duplicate rule names
- unresolved entity or relation refs
- unsupported SQL translation
- unsafe negation
- unsupported recursion
- cross-store planning failures
- unsafe authorization placement
- client-authoritative policy misuse
- missing server enforcement

## 9\. Dependency Extraction

Dependency extraction is one of the most valuable parts of the rules system.

Every rule should expose:

```ts
interface RuleDependencies {
  readonly entities: readonly EntityRef\[];
  readonly fields: readonly FieldRef\[];
  readonly relations: readonly RelationRef\[];
  readonly services: readonly ServiceRef\[];
  readonly effects: readonly EffectRef\[];
  readonly inputs: readonly RuleVarRef\[];
}
```

This enables:

- policy impact analysis
- reactive invalidation derivation
- route/form dependency graphs
- generated tests
- devtools visualization
- placement planning
- security diagnostics

Dependency extraction MUST be possible without running target code.

## 10\. Placement Planning

### 10.1 Placement Result

A rule planner should return a placement analysis, not just success/failure.

```ts
interface RulePlacementAnalysis {
  readonly rule: RuleRef;
  readonly placements: readonly RulePlacementOption\[];
  readonly selected?: RulePlacementOption;
  readonly diagnostics: readonly Diagnostic\[];
}

interface RulePlacementOption {
  readonly placement:
    | "database\_predicate"
    | "rls\_policy"
    | "server\_pre\_query"
    | "server\_integrated\_query"
    | "server\_post\_filter"
    | "client\_hint"
    | "materialized"
    | "external";
  readonly supported: boolean;
  readonly safety: "authoritative" | "non\_authoritative\_hint" | "unsafe";
  readonly requirements: readonly Requirement\[];
  readonly fallback?: FallbackPlan;
  readonly diagnostics: readonly Diagnostic\[];
}
```

### 10.2 Preferred Placement Order For List Authorization

For list queries protected by authorization rules, preferred placement should generally be:

```txt
1. database predicate / SQL WHERE / SQL EXISTS
2. database RLS policy
3. server integrated query with bounded, correct query planning
4. explicit bounded server post-filter, only when pagination correctness is preserved
5. reject with diagnostic
```

The planner MUST NOT silently choose unbounded server post-filtering.

### 10.3 Client Hint Placement

Client hint placement is useful for UI but not security.

Client hint output should include a mode:

```txt
exact
sound-allow
sound-deny
best-effort
disabled
```

For MVP, prefer only:

```txt
exact
best-effort
disabled
```

Every generated client hint MUST carry metadata showing that it is non-authoritative.

## 11\. SQL Translation

The MVP SQL translator should support:

- field equality
- field-to-literal comparisons
- field-to-input comparisons
- `and`
- `or`
- restricted `not`
- simple relation `exists`

Example rule:

```ts
gen.rule.define({
  name: "canViewProject",
  vars: { actor: Actor, project: Project },
  when: gen.rule.or(
    gen.rule.eq(Project.fields.visibility, "public"),
    gen.rule.eq(Project.fields.ownerId, gen.rule.field("actor", "id")),
  ),
});
```

Possible SQL predicate:

```sql
(project.visibility = 'public' OR project.owner\_id = :actor\_id)
```

The SQL translator MUST know:

- table mappings
- column mappings
- parameter bindings
- supported operators
- null semantics
- store/dialect capabilities
- whether joins or `EXISTS` are available

Unsupported translation should produce diagnostics, not partial unsafe SQL.

## 12\. Authz Integration

Authz should consume rules like this:

```ts
gen.authz.policy({
  name: "project.update",
  actor: Actor,
  resource: Project,
  action: "update",
  allow: canEditProject,
});
```

Authz is responsible for:

- binding actor/resource/action variables
- deciding deny/fallback behavior
- ensuring server enforcement
- deciding list vs item semantics
- generating forbidden/not-found behavior
- preventing unsafe client authority

Rules are responsible for:

- predicate structure
- dependencies
- type correctness
- translation feasibility

## 13\. Reactivity Integration

Rules can inform reactivity but should not own it.

A rule dependency graph can tell the reactivity planner:

```txt
This rule depends on Project.ownerId and Project.status.
A mutation that writes those fields may affect resources guarded by this rule.
```

Possible derived edges:

```txt
rule reads field
policy uses rule
query uses policy
resource wraps query
mutation writes field
mutation may affect resource
```

This is valuable for devtools, diagnostics, and conservative invalidation.

Do not require rule-derived reactivity in the MVP. Start by exposing dependencies.

## 14\. UI Integration

Rules may produce client hints for UI:

- hide action button
- disable submit
- show unavailable state
- hide field
- show explanation

But UI hints MUST be marked non-authoritative.

Generated client code should preserve the distinction:

```txt
canShowDeleteButton: hint
canDeleteProject: server policy
```

Avoid names that imply client authority when the result is only a hint.

## 15\. Diagnostics

Recommended diagnostics:

```txt
rules:duplicate-rule-name
rules:unknown-variable
rules:field-not-on-variable
rules:type-mismatch
rules:non-boolean-body
rules:unsafe-variable
rules:unsafe-negation
rules:recursion-unsupported
rules:aggregate-unsupported
rules:not-sql-translatable
rules:not-rls-translatable
rules:cross-store-unsupported
rules:client-hint-not-exact
rules:client-hint-non-authoritative
rules:external-evaluator-required

authz:unsafe-list-post-filter
authz:authoritative-client-policy
authz:missing-server-enforcement
authz:policy-variable-binding-missing
authz:list-policy-not-database-placeable
```

Diagnostics should include:

- rule name
- AST node path
- target placement attempted
- reason translation failed
- suggested fix
- whether fallback is safe

Example diagnostic:

```txt
authz:unsafe-list-post-filter
Rule `canViewProject` could not be translated to a database predicate for list query `listProjects`.
Unbounded server post-filtering would break pagination and may expose timing or count side channels.
Add a SQL-translatable predicate, change the query shape, or explicitly mark the query as bounded.
```

## 16\. Safety Model

### 16.1 Variable Safety

Every variable used in a rule body MUST be declared.

For future derived rules, every output variable MUST be safely bound by a positive predicate before use in negation or output position.

MVP can avoid output variables entirely.

### 16.2 Negation Safety

MVP should either:

- disallow `not` entirely for SQL placement, or
- allow only simple negation over already-bound scalar predicates.

Examples likely safe:

```txt
not(eq(project.status, "archived"))
```

Examples to reject initially:

```txt
not(exists(ProjectMember where ...))
```

until the planner has a clear semantics for nulls, joins, and anti-joins.

### 16.3 Recursion Safety

Recursion should be unsupported at first.

Later, recursive rules must be target-capability checked and bounded or stratified.

### 16.4 Aggregates

Aggregates should be unsupported at first.

Later, aggregates must declare grouping semantics, maintainability, and placement constraints.

## 17\. Runtime Evaluation

A simple server-side interpreter can be useful for tests and fallback execution.

However:

- the interpreter MUST evaluate AST, not opaque callbacks
- it MUST be clearly separated from authoritative database placement
- it MUST not become the default for unbounded list authorization
- it SHOULD be used for unit tests and item-level checks first

Runtime evaluator MVP:

```ts
const result = evaluateRule(canEditProject, {
  actor,
  project,
});
```

Use cases:

- generated policy tests
- server item-level checks
- devtools explanation
- fallback for bounded resources

## 18\. Testing Strategy

### 18.1 Runtime Tests

Add tests for:

- rule definition records
- variable refs
- field refs
- equality/comparison nodes
- boolean composition
- dependency extraction
- SQL translation
- unsupported translation diagnostics
- authz placement rejection for unsafe list post-filtering

### 18.2 Type Tests

Add `@ts-expect-error` coverage for:

- unknown variable
- field not present on variable
- comparing string field to number literal
- non-boolean `when` body
- relation from wrong source entity
- client-authoritative policy use

### 18.3 Snapshot Tests

Add snapshots for:

- rule AST
- dependency graph
- SQL predicate output
- placement analysis
- diagnostics

## 19\. Implementation Phases

### Phase RUL-0: AST Foundation

- Add `src/rules/` module.
- Add rule expression discriminated unions.
- Add `gen.rule.define`.
- Add `gen.rule.eq`, `compare`, `and`, `or`, `not`, `exists`.
- Add type inference helpers.
- Add runtime and type tests.

Done when a simple ownership rule can be represented as static IR.

### Phase RUL-1: Dependency Extraction

- Walk rule AST.
- Extract entities, fields, relations, variables, services, and effects.
- Add dependency snapshot tests.

Done when devtools or graph generation can ask what a rule depends on.

### Phase RUL-2: SQL Predicate Translation

- Translate equality, comparisons, `and`, `or`, and simple `exists`.
- Integrate table/column mappings.
- Add unsupported construct diagnostics.

Done when a simple auth predicate can become a SQL `WHERE` clause.

### Phase RUL-3: Authz Integration

- Allow authz policies to consume rules.
- Bind actor/resource/action variables.
- Reject unsafe list placements.
- Add server enforcement diagnostics.

Done when a protected list query fails generation if its policy cannot be placed safely.

### Phase RUL-4: Client Hints

- Generate non-authoritative hint metadata.
- Mark hint mode as exact/best-effort/disabled.
- Ensure server enforcement remains required.

Done when UI can safely hide or disable controls based on hints without implying authority.

### Phase RUL-5: Advanced Features

Only after the above are stable:

- RLS generation
- aggregates
- controlled negation
- recursion
- materialization
- IVM
- external evaluator targets

## 20\. Open Design Decisions

1. Should `not` exist in MVP, or should it be deferred entirely?
2. Should SQL translation be owned by `@gen/rules` or by storage/dialect targets?
3. Should rules support field-to-field comparison across entities in MVP?
4. Should `exists` be relation-first or query-first?
5. How should null semantics be represented in the rule AST?
6. Should client hints be generated from the same rule directly or from a partial evaluation artifact?
7. How much of authz variable binding should be type-level versus lifecycle-checked?
8. Should rules have explicit effect rows from day one?
9. Should rule dependencies participate in conservative reactivity invalidation immediately or only after graph support exists?

## 21\. Practical Advice

Start boring.

A tiny rule language that can statically express ownership and visibility checks, extract dependencies, translate to SQL, and reject unsafe list authorization is already a major win.

Do not begin with Datalog, recursion, aggregates, IVM, or a client policy runtime. Those are attractive later targets, but they will distract from the core value: making app semantics inspectable and safely placeable.

The ideal first demo is:

```txt
Define Project.
Define canViewProject(actor, project).
Use it in a listProjects policy.
Generate SQL WHERE.
Show dependency graph.
Reject the same policy if it cannot be placed safely.
Generate a non-authoritative UI hint.
```

That demo proves the rules system is not just another predicate helper. It proves it is a compiler feature.

Rules relate to auth and IVM in two different ways:

```txt

Auth:

&#x20; rules decide whether something should be allowed, visible, editable, etc.



IVM:

&#x20; rules describe derived facts/views and their dependencies, so updates can be propagated incrementally.

```

Same foundation — typed, inspectable predicates — but different consumers.

\## Rules → Auth

For auth, rules are usually \*\*predicates over actor + resource + action context\*\*.

Example:

```txt

canEditProject(actor, project) =

&#x20; project.ownerId == actor.id

&#x20; AND project.status == "draft"

```

`@gen/rules` should only own the predicate:

```txt

project.ownerId == actor.id

project.status == "draft"

```

`@gen/authz` should own the policy meaning:

```txt

actor may update Project when canEditProject(actor, project)

```

That separation matters.

A rule can be reused in multiple auth contexts:

```txt

canEditProject(actor, project)

&#x20; -> update Project policy

&#x20; -> show Edit button hint

&#x20; -> allow edit route

&#x20; -> allow form submission

&#x20; -> restrict editable fields

```

But authz decides whether the rule is \*\*authoritative\*\* and where it must be enforced.

For example:

```txt

Server item update:

&#x20; load project

&#x20; evaluate canEditProject(actor, project)

&#x20; deny if false



List query:

&#x20; translate canViewProject(actor, project) into SQL WHERE

&#x20; reject generation if it cannot be safely pushed down



Client UI:

&#x20; evaluate partial rule as a non-authoritative hint

&#x20; hide/disable controls

&#x20; still require server enforcement

```

The important safety rule:

```txt

Client rule result may improve UX.

It must not become the security boundary.

```

So rules give authz a portable, inspectable condition. Authz gives that condition security semantics.

\## Rules → IVM

For IVM, rules are less about “allow/deny” and more about \*\*derived facts\*\*.

Example:

```txt

projectIsOverdue(project) =

&#x20; project.dueDate < now

&#x20; AND project.status != "done"

```

Or:

```txt

userCanSeeProject(user, project) =

&#x20; project.visibility == "public"

&#x20; OR project.ownerId == user.id

&#x20; OR exists ProjectMember(userId = user.id, projectId = project.id)

```

Those rules define derived views/facts:

```txt

OverdueProject(projectId)

VisibleProject(userId, projectId)

EditableProject(userId, projectId)

```

IVM asks:

```txt

When base data changes, which derived facts need to change?

```

Because the rule is inspectable, the compiler can know:

```txt

VisibleProject depends on:

&#x20; Project.visibility

&#x20; Project.ownerId

&#x20; ProjectMember.userId

&#x20; ProjectMember.projectId

```

Then when a mutation happens:

```txt

update Project.visibility

insert ProjectMember

delete ProjectMember

```

the system can derive which materialized facts or cached views may need refresh.

The IVM version of the rule is not primarily:

```txt

Can this actor do this action right now?

```

It is:

```txt

What derived relation follows from these base relations?

How do changes to base relations affect that derived relation?

```

\## Same rule, two roles

A rule like this can serve both auth and IVM:

```txt

canViewProject(user, project) =

&#x20; project.visibility == "public"

&#x20; OR project.ownerId == user.id

&#x20; OR exists ProjectMember(userId = user.id, projectId = project.id)

```

Auth usage:

```txt

Policy:

&#x20; user can read Project when canViewProject(user, project)

```

IVM usage:

```txt

Derived relation:

&#x20; VisibleProject(userId, projectId)

```

Then the app can use `VisibleProject` for fast list queries, route checks, notifications, or sharing views.

But they have different requirements:

```txt

Auth cares about:

&#x20; authoritative enforcement

&#x20; deny behavior

&#x20; side-channel safety

&#x20; list filtering correctness

&#x20; server/database placement



IVM cares about:

&#x20; dependency tracking

&#x20; delta propagation

&#x20; monotonicity

&#x20; insert/delete/update effects

&#x20; materialization strategy

&#x20; recomputation fallback

```

\## Why this is powerful

The same inspectable rule can produce:

```txt

Auth policy:

&#x20; allow read Project if canViewProject(user, project)



SQL filter:

&#x20; WHERE project.visibility = 'public'

&#x20;    OR project.owner\_id = :user\_id

&#x20;    OR EXISTS (...)



Client hint:

&#x20; show project if likely visible



Materialized view:

&#x20; visible\_projects(user\_id, project\_id)



Invalidation logic:

&#x20; changes to Project.visibility affect visible project lists



Tests:

&#x20; owner can see private project

&#x20; member can see shared project

&#x20; unrelated user cannot see private project

```

That is the real leverage: rules are a shared semantic object, while auth and IVM are different interpretations.

\## Important boundary

Do not make IVM required for auth.

Auth should work with direct rule evaluation or SQL placement first:

```txt

Rule -> SQL WHERE / server check

```

IVM is an optimization or advanced derived-data layer:

```txt

Rule -> materialized derived relation -> incremental maintenance

```

If the materialized view is stale, auth can become dangerous. So for security-sensitive policies, either:

```txt

use authoritative live checks

```

or ensure the materialized relation has strong consistency guarantees and clear invalidation semantics.

My recommended model:

```txt

@gen/rules:

&#x20; defines predicates and dependencies



@gen/authz:

&#x20; consumes rules as authoritative policies or non-authoritative hints



@gen/ivm:

&#x20; consumes rules as derived relations/views and maintenance plans



@gen/reactivity:

&#x20; uses rule dependencies for invalidation and impact analysis

```

So rules are the shared logic layer. Auth is the security interpretation. IVM is the derived-data interpretation.

I would model it as a separate primitive:

```txt
Rule: pure condition / predicate
Reaction: typed effect plan that runs when a rule becomes true
```

The key is: do not put effects inside rules. Keep rules pure and inspectable. Then reactions consume rules.

## 22. Reaction Shape

Something like:

```ts
interface Reaction<Name extends string = string, Event = unknown, In = unknown, Out = unknown> {
  readonly kind: "reaction";
  readonly name: Name;
  // Pure condition
  readonly when: Rule | Predicate<Event, boolean>;
  // Optional projection from observed event/context into action input
  readonly select?: ExprFunction<Event, In>;
  // Existing action/function IR
  readonly run: ActionFunction<In, Out> | ActionExpr<In, Out>;
  readonly mode: ReactionMode;
  readonly delivery?: ReactionDelivery;
  readonly idempotency?: IdempotencyPlan<Event>;
  readonly requirements?: readonly Requirement[];
  readonly effects?: readonly Effect[];
  readonly _event?: Event;
  readonly _input?: In;
  readonly _output?: Out;
}
```

So it reuses established primitives:

```txt
Condition:        Rule / Predicate / Expr<boolean>
Input shaping:    ExprFunction
Behavior:         ActionFunction / ActionExpr
Typing:           SemanticType, Field, InferActionInput, InferActionOutput
Planning:         Requirement, Effect, Placement, FallbackPlan
Safety:           Operation laws, idempotency, diagnostics
```

## 23. Reaction Modes

You probably want different trigger semantics:

```txt
on_true:           run whenever condition is true for an observed input
on_transition_true: run only when condition changes false -> true
on_insert_match:   run when a newly inserted entity/fact satisfies the condition
on_update_match:   run when an updated entity/fact satisfies the condition
on_delete_match:   run when deletion affects a previously true condition
maintain:          maintain a derived fact/view instead of running an external side effect
```

The most important distinction is:

```txt
event reaction:       send email, enqueue job, emit notification, call webhook
derived-data reaction: maintain materialized view / derived fact / IVM state
```

Those should share a condition model, but not necessarily the same runtime target.

## 24. Example: Side-Effect Reaction

```ts
const projectIsOverdue = gen.rule.define({
  name: "projectIsOverdue",
  input: Project,
  predicate: gen.predicate.and(
    gen.expr.eq(Project.fields.status, "open"),
    gen.expr.lt(Project.fields.dueDate, gen.expr.now()),
  ),
});

const notifyOwner = gen.func.action({
  name: "notifyOwner",
  input: gen.types.object({ projectId: Project.fields.id.type }),
  returns: gen.types.void(),
  effects: [SendEmail],
  body: gen.action.callService(
    EmailService,
    "sendProjectOverdueEmail",
    // ...
  ),
});

const overdueReaction = gen.reaction.define({
  name: "notifyWhenProjectBecomesOverdue",
  when: projectIsOverdue,
  select: gen.func.expr({
    input: Project,
    returns: gen.types.object({ projectId: Project.fields.id.type }),
    body: gen.expr.object({ projectId: gen.expr.field(Project.fields.id) }),
  }),
  run: notifyOwner,
  mode: "on_transition_true",
  idempotency: gen.reaction.idempotentBy(({ projectId }) => ["project-overdue", projectId]),
});
```

This says:

```txt
When a Project transitions into the overdue condition,
run notifyOwner with { projectId },
but do it idempotently.
```

The compiler can inspect:

```txt
reads:      Project.status Project.dueDate Project.id
effects:    SendEmail
requires:   EmailService
delivery:   probably outbox/job queue
idempotency: project-overdue + projectId
```

That is much better than hiding this in a cron job or callback.

## 25. Example: IVM-Style Reaction

```ts
const visibleProject = gen.rule.define({
  name: "visibleProject",
  input: gen.types.object({ user: User, project: Project }),
  predicate: gen.predicate.or(
    gen.expr.eq(Project.fields.visibility, "public"),
    gen.expr.eq(Project.fields.ownerId, User.fields.id),
    gen.relation.exists(ProjectMember, {
      userId: User.fields.id,
      projectId: Project.fields.id,
    }),
  ),
});

const maintainVisibleProjects = gen.reaction.define({
  name: "maintainVisibleProjects",
  when: visibleProject,
  run: gen.ivm.maintain({
    relation: VisibleProject,
    key: {
      userId: User.fields.id,
      projectId: Project.fields.id,
    },
  }),
  mode: "maintain",
});
```

This is not "send an email when true." It is:

```txt
Keep the derived relation VisibleProject synchronized
with the truth of visibleProject(user, project).
```

That is the bridge to IVM.

## 26. Things to Keep in Mind

The big safety rule:

```txt
Rules are pure.
Reactions are effectful.
```

A reaction should require more metadata than a rule because effects are dangerous.

For side effects, require:

```txt
idempotency key
delivery mode
retry policy
effect declaration
requirement declaration
transition semantics
```

For example, email/webhook/job reactions should usually compile to an outbox or queue plan, not direct inline execution. Otherwise retries and partial failures become messy.

For transition reactions, the system must know what "became true" means:

```txt
previous state: false
current state: true
```

That requires either event payloads with before/after values, a database trigger/changefeed, or a queryable previous snapshot.

### Diagnostics

```txt
reaction:condition-not-boolean
reaction:condition-not-static
reaction:run-not-action
reaction:input-selection-mismatch
reaction:missing-idempotency-key
reaction:transition-boundary-unknown
reaction:side-effect-without-delivery-plan
reaction:unsafe-inline-effect
reaction:target-unsupported-delivery
reaction:unbounded-trigger-scan
```

## 27. Where It Fits

The stack becomes:

```txt
Expr / Predicate: typed logic
Rule:             named pure semantic condition
Authz:            uses rule as allow/deny condition
IVM:              uses rule as derived fact/view definition
Reaction:         runs action or maintenance plan when rule condition is observed
Events / Outbox:  provide safe delivery for effectful reactions
Reactivity graph: understands reads/writes/effects/invalidation
```

So yes: a reaction is probably the right abstraction for "when this rule evaluates true, do something."

```ts
const projectBecameOverdue = gen.rule.define({
  name: "projectBecameOverdue",
  input: ProjectChangedEvent,
  predicate: gen.predicate.and(
    gen.expr.eq(Project.fields.status, "open"),
    gen.expr.lt(Project.fields.dueDate, gen.expr.now()),
  ),
});

const notifyOwner = gen.func.action({
  name: "notifyOwner",
  input: gen.types.object({ projectId: Project.fields.id.type }),
  returns: gen.types.void(),
  effects: [SendEmail],
  body: gen.action.callService(EmailService, "sendProjectOverdueEmail", ...),
});

const overdueReaction = gen.reaction.define({
  name: "notifyWhenProjectOverdue",
  when: projectBecameOverdue,
  select: gen.func.expr({
    input: ProjectChangedEvent,
    returns: gen.types.object({ projectId: Project.fields.id.type }),
    body: gen.expr.object({ projectId: gen.expr.field("project", Project.fields.id) }),
  }),
  run: notifyOwner,
  mode: "on_transition_true",
  idempotency: gen.reaction.idempotentBy(({ projectId }) => [
    "project-overdue",
    projectId,
  ]),
});
```

### Important Invariants

A reaction MUST NOT hide side effects inside the rule predicate.
The when condition MUST be static, typed, and dependency-extractable.
The run action MUST declare requirements and effects.
Transition-based reactions MUST define the prior/current state boundary.
External side-effect reactions SHOULD require idempotency metadata.
Retryable reactions SHOULD declare operation laws or delivery guarantees.
Reactions that maintain derived data SHOULD compile to IVM/materialization plans when possible.
Reactions that send emails, webhooks, notifications, or jobs SHOULD compile to an outbox/job plan, not direct unsafe inline runtime code.

### Useful Diagnostics

```txt
reaction:condition-not-boolean
reaction:condition-not-static
reaction:run-not-action
reaction:input-selection-mismatch
reaction:missing-idempotency-key
reaction:transition-boundary-unknown
reaction:side-effect-without-delivery-plan
reaction:unsafe-inline-effect
reaction:target-unsupported-delivery
reaction:unbounded-trigger-scan
```

Reactions are where rules connect to behavior. Rules should remain pure. Reactions own the effectful interpretation.
