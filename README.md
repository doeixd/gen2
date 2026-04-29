# gen2

A **typed semantic IR SDK for full-stack applications**.

> It lets you describe your application's domain, data, actions, rules, auth, UI, routes, forms, reactivity, and runtime requirements as typed, inspectable TypeScript values — then checks, derives, generates, visualizes, and evolves the app from that model.

It is a language inside TypeScript, but not just for syntax convenience. Its real purpose is to make the **meaning of the app** explicit.

---

## What is gen2?

Most apps are built out of scattered implementation fragments:

```
database schema
ORM models
API handlers
React components
forms
validation schemas
auth middleware
query cache keys
route loaders
mutation invalidation
tests
docs
```

The actual product meaning is hidden across all of that.

gen2 says:

```
Define the app semantics once as static typed IR.
Then derive the runtime implementation from that.
```

So instead of the source of truth being "whatever handwritten code happens to exist," the source of truth becomes a graph of typed domain objects:

```
Entity
Field
SemanticType
Expr
Predicate
QueryFunction
ActionFunction
Rule
Policy
Key
Resource
Route
Form
View
Service
Target
Artifact
```

That graph can be checked, transformed, generated, and understood by tools.

### The philosophy

```
Application behavior should be data first.
Domain semantics should be inspectable.
Generated code should be an interpretation, not the source of truth.
Type inference is part of the product.
Targets are plugins, not hardcoded assumptions.
Reactivity, routing, auth, UI, and CRUD should derive from one graph.
Rules should be pure predicates.
Effects should be explicit.
Fallbacks should be visible.
Diagnostics should explain degradation and unsafe choices.
```

The guiding preference is:

```
Describe what the app means.
Let the compiler decide what can be generated safely.
```

Not:

```
Write framework glue everywhere and hope it stays consistent.
```

---

## What problem it solves

Modern full-stack apps have many repeated obligations.

When you add a field, action, or policy, you may need to update:

```
database schema
migration
validation
API input type
API output type
form field
list column
detail view
auth policy
field-level permissions
cache invalidation
route loader
OpenAPI/RPC client
tests
docs
```

Humans forget these. AI agents forget these. Frameworks usually do not know enough to catch them.

gen2 tries to encode those obligations into the IR graph so that changes become checkable.

For example:

```
Project.status changes
  -> update transition rules
  -> update editability rules
  -> update list filters
  -> update mutation write checks
  -> update invalidation
  -> update generated tests
```

That is the reason for being.

---

## Features

- **Entity system** — identity-bearing domain objects with typed fields, refs, transitions, and presence conditions.
- **Rich type system** — semantic types (`uuid`, `email`, `money`, `datetime`, …) backed by precise physical representations (`u8`…`i128`, `f32`/`f64`, `text`, `fixedBytes`, …).
- **Expression algebra** — static, typed ASTs for literals, field refs, unary/binary/comparison/aggregate operations, and predicates.
- **Query system** — `SELECT`, `WHERE`, `JOIN`, `ORDER BY`, `LIMIT`, plus query-backed fields and cross-store composition planning.
- **Function taxonomy** — `StaticFunction`, `ExprFunction`, `PredicateFunction`, `QueryFunction`, `ActionFunction`, `PatchFunction`, `PlanFunction`.
- **Storage mapping** — map entity fields to tables, columns, collections, and keyspaces with type-compatibility checks.
- **Relations** — one-to-one, one-to-many, many-to-one, many-to-many with integrity modes, foreign keys, and referential actions.
- **Authorization** — per-action policies (`AllowAuthenticated`, `AllowRole`, `AllowOwner`, `AllowRelation`) with SQL translation and safe client exposure checks.
- **Events & reducers** — event definitions, emissions, monoidal reducers, and subscriptions.
- **UI system** — platform-agnostic views, slots, components, forms, styles, behaviors, themes, and renderers.
- **Plugin architecture** — extend the kernel with custom helpers, targets, runtimes, stores, metadata namespaces, and codegen hooks.
- **Lifecycle runner** — `check` validates plugins, targets, and module invariants; `generate` invokes plugin codegen hooks.

---

## Quick start

```ts
import { createGen, lifecycle } from "gen2";

const { gen, ctx } = createGen();

const User = gen.entity("User", {
  id: gen.uuid(),
  email: gen.email(),
  displayName: gen.string(),
  role: gen.enumOf("Role", ["admin", "user"]),
});

const Post = gen.entity("Post", {
  id: gen.uuid(),
  title: gen.string(),
  authorId: gen.uuid(),
});

gen.relation({
  name: "author",
  kind: "many_to_one",
  from_entity: Post,
  to_entity: User,
  from_field: Post.fields.authorId,
  to_field: User.fields.id,
  integrity: { kind: "database_foreign_key" },
});

const result = lifecycle.check(ctx);
console.log(result.status); // "ok" | "has_errors" | "has_warnings"
```

---

## The source of truth

A key design principle is that queries and actions remain canonical:

```
gen.func.query
gen.func.action
```

Reads and writes live there.

Everything else interprets them:

```
reactivity
routing
hydration
UI
forms
single-flight
clients
devtools
tests
docs
```

This matters because it prevents the app from fragmenting into separate systems.

A query is not separately defined for API, UI, cache, and route loader. It is one static function that can be used by all of them.

---

## Entities and semantic types

Entities define the domain:

```
User
Project
Invoice
Order
Membership
```

Fields carry semantic types:

```
email
uuid
money
date
enum
role
status
markdown
safeHtml
```

The point is not just to know that something is a `string`; it is to know what it **means**.

That lets generators make better decisions:

```
email field -> email input + validation
money field -> decimal/db mapping + currency display
status enum -> transition checks + badges
server-only field -> exclude from client bundles
hidden field -> omit from forms/views
```

Semantic types are what make generated app code less generic.

---

## Static expressions

Typed expressions are the glue.

They let the system represent logic without opaque callbacks:

```
field comparisons
predicates
query filters
computed projections
action updates
validation conditions
policy rules
transition checks
derived values
```

Because expressions are static IR, the compiler can inspect them.

That enables:

```
SQL generation
dependency extraction
auth placement
reactivity derivation
test generation
diagnostics
```

This is one of the most important ideas: logic should be represented as typed, inspectable expression trees when it is meant to be portable.

---

## Queries and actions

Queries are typed read functions.

Actions are typed write/effect functions.

They carry:

```
input type
output type
error type
requirements
effects
body IR
reactivity metadata
auth constraints
```

A query might become:

```
SQL SELECT
HTTP endpoint
RPC method
route loader
React query hook
OpenAPI operation
test fixture
```

An action might become:

```
SQL INSERT/UPDATE/DELETE
API mutation
TanStack mutation
Effect action
audit event
outbox job
cache invalidation plan
single-flight refresh
```

The power comes from defining the operation once and generating multiple target artifacts.

---

## Rules

Rules are named, typed predicates.

They answer questions like:

```
canViewProject(actor, project)
canEditInvoice(actor, invoice)
isOrderShippable(order)
isProjectOverdue(project)
isFieldEditable(actor, resource, field)
```

But rules are not just boolean helpers. Because they are inspectable, the system can know:

```
which fields they read
which relations they depend on
whether they can become SQL
whether they can be used as a client hint
which mutations may affect them
which tests should be generated
```

Rules are the semantic layer for business logic.

They should be pure. Effects belong elsewhere.

---

## Auth

Auth is a consumer of rules.

A rule says:

```
project.ownerId == actor.id
```

Auth says:

```
actor may update Project when canEditProject(actor, project)
```

The system can model access at multiple levels:

```
entity.read
entity.create
entity.update
entity.delete
field.read
field.write
relation.link
relation.unlink
action.execute
query.filter
route.enter
form.submit
ui.hint
```

This is much richer than a single middleware check.

It lets the compiler generate:

```
SQL WHERE filters
server item checks
field redaction
input write masks
form disabled states
route guards
client hints
policy tests
access matrix docs
```

And importantly, it can reject unsafe choices, such as list authorization that cannot be pushed into the database.

---

## CRUD

CRUD is not meant to be a separate magic shortcut. It should expand into the same canonical IR.

For an entity like `Project`, CRUD can generate:

```
listProjects
getProjectById
createProject
updateProject
deleteProject
ProjectCreateForm
ProjectEditForm
ProjectList
ProjectDetailRoute
project.detail key
project.list key
auth policies
field write checks
invalidation plans
tests
docs
```

But all of those are normal queries, actions, keys, routes, forms, and policies.

That means CRUD does not become a dead-end abstraction. It becomes a fast way to produce a complete, inspectable full-stack slice.

---

## Keys and reactivity

The key system gives the app a typed address space for reactive data.

Examples:

```
project.detail({ id })
project.list({ actorId, filter })
project.collection()
rule.canEditProject({ actorId, projectId })
Project.field.status({ id })
```

Queries declare the keys they read or produce. Actions declare or derive the keys they invalidate.

Rules make this more powerful. If a rule reads `Project.visibility`, and a query uses that rule, and a mutation writes `Project.visibility`, the compiler can infer that the query's key may be stale.

That gives you rule-derived reactivity:

```
mutation writes field
  -> rule depends on field
  -> query uses rule
  -> resource has key
  -> invalidate or refresh key
```

This is how cache invalidation becomes a graph problem instead of handwritten bookkeeping.

---

## Reactive graph

The reactive graph is the heart of the architecture.

It connects:

```
entities
fields
queries
actions
rules
policies
keys
resources
mutations
forms
routes
components
services
targets
```

With edges like:

```
reads
writes
uses
invalidates
derives
requires
emits
subscribes
hydrates
transports
```

Once this graph exists, the compiler can answer questions like:

```
What becomes stale after this mutation?
Which routes depend on this query?
Which UI reads this key?
Which policies depend on this field?
Which generated tests are needed?
What breaks if this enum adds a value?
Which target cannot support this feature?
```

That is the big power move.

---

## Targets

gen2 is target-agnostic.

The same IR could generate different stacks:

```
Postgres
SQLite
Mongo
Hono
OpenAPI
Effect
React
TanStack Query
TanStack Router
Svelte
Vue
Solid
standard-schema
Zod-like validators
Tailwind UI
admin screens
docs
tests
devtools
```

The goal is not to hardcode one blessed stack. The goal is:

```
Same app semantics.
Different target interpretations.
```

So stack preferences become configuration:

```
database: Postgres
api: Hono
frontend: React
router: TanStack Router
reactivity: TanStack Query
validation: standard-schema
styling: Tailwind
```

The generator picks supported plans and emits diagnostics for unsupported features.

---

## Progressive enhancement

Another philosophical piece is that features should have explicit fallback plans.

For example:

```
best case:
  optimistic update with precise rollback

fallback:
  pending state + refetch

last resort:
  disable submit until server response
```

Or:

```
best case:
  SQL auth filter

fallback:
  bounded server check

reject:
  unsafe unbounded post-filter
```

The system should not silently degrade. It should say what it did and why.

---

## Reactions

Rules can also connect to reactions.

A rule remains pure:

```
project is overdue
```

A reaction says:

```
when project becomes overdue, send notification
```

This should compile to an inspectable effect plan:

```
condition
selected input
action to run
requirements
effects
idempotency key
delivery plan
retry policy
```

This matters because effectful behavior needs safety: outbox, idempotency, retries, audit logs, and clear delivery guarantees.

---

## IVM and derived data

Rules can also define derived facts:

```
VisibleProject(userId, projectId)
OverdueProject(projectId)
EditableInvoice(userId, invoiceId)
```

At first, this can drive broad invalidation.

Later, it can drive materialized views or incremental view maintenance.

The progression should be:

```
dependency extraction
conservative invalidation
key-aware invalidation
predicate-aware patches
IVM/materialized maintenance
```

The value is that derived data comes from the same semantic rules used for auth, UI, and reactivity.

---

## Why this matters for AI agents

gen2 is especially compelling in the AI-agent era because agents need structured context.

Today, an agent modifying an app has to infer intent from scattered code. It may update the handler but forget the form. It may update the field but forget the auth rule. It may change a mutation but forget invalidation.

With gen2, the agent can operate on a semantic model.

Instead of saying:

```
edit these seven files
```

The agent can say:

```
Add archivedAt to Project.
Make archived projects read-only.
Hide them from the default list.
Allow admins to restore them.
```

Then the compiler can produce or check:

```
field addition
migration
update input changes
transition rule
auth policy changes
list filter changes
form disabled state
restore action
cache invalidation
generated tests
docs
```

That is the future-facing reason this is powerful.

AI agents are better when they can edit **intent**, not just text.

---

## What makes it different from ordinary codegen

Ordinary codegen often means:

```
generate scaffolding once
then hand-edit forever
```

gen2 wants:

```
define semantic IR
check it
derive graph
generate targets
keep regenerating safely
```

That is not scaffolding. That is a compiler pipeline.

The generated artifacts are downstream of the source model.

---

## What makes it different from a normal framework

A normal framework gives you conventions and runtime APIs.

gen2 gives you an application model.

Framework:

```
write code in my lifecycle
```

gen2:

```
describe your app semantics
I will generate framework code as a target
```

That distinction is huge.

It means React, Hono, TanStack Query, SQL, OpenAPI, and devtools are not the app. They are outputs.

---

## The power

The power is coherence.

One domain change can propagate through:

```
types
queries
actions
auth
forms
routes
keys
reactivity
tests
docs
generated UI
```

One rule can power:

```
server enforcement
SQL filtering
client hints
field permissions
route guards
test cases
reactive invalidation
IVM
```

One mutation can expose:

```
write set
auth checks
field transition checks
audit events
key invalidation
reactions
single-flight refresh
```

The power is not that it writes code for you.

The power is that it **knows what the code means**.

---

## Architecture

The codebase is organized into modules that mirror the Allium specification in `spec/`:

- `src/core/` — kernel, plugins, targets, refs, diagnostics, artifacts, contracts, actors, config
- `src/types/` — semantic types, representations, operations, traits, runtimes
- `src/entity/` — entities, fields, transitions
- `src/expression/` — AST, builders, checks, planning
- `src/storage/` — stores, tables, columns, mappings, projections
- `src/relation/` — relations, graphs, integrity, foreign keys
- `src/query/` — query expressions, projections, joins, planners, cross-store queries
- `src/function/` — static, expr, predicate, query, action, patch, and plan functions
- `src/api/` — resources, routes, getters, mutators
- `src/ui/` — views, slots, components, forms, styles, behaviors, themes
- `src/authz/` — policies, rules, translations, client exposure
- `src/events/` — events, emissions, reducers, subscriptions, outbox
- `src/lifecycle/` — phases, check/generate runner, cross-store planning

Each module exports pure `check*` functions that return `Diagnostic[]`, making the validation pipeline easy to test and compose.

---

## Development

```bash
# Install dependencies
vp install

# Run type checks, lint, and format
vp check

# Run tests
vp test

# Build library for production
vp pack
```

---

## License

MIT
