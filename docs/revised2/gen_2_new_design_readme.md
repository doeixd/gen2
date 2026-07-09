# Gen2 / Dirived

**A typed semantic graph compiler for full-stack applications.**

Gen2 lets you define your application's semantics once — schema, operations, rules, policies, UI, sync, deployment, tests, docs, and migrations — then derive target-specific code from a verified graph.

Instead of scattering meaning across an ORM, API handlers, cache invalidation, forms, tables, tests, OpenAPI files, deployment config, and documentation, Gen2 gives you one inspectable semantic source of truth.

```txt
schema + operations + rules + UI intent
  -> semantic graph
  -> verify / derive / legalize
  -> generated code, tests, docs, migrations, deployment, devtools
```

Gen2 is not just another framework. It is a compiler for application semantics.

---

## Why Gen2?

Most full-stack apps duplicate the same meaning across many layers:

```txt
Database schema
Server actions
API contracts
Authorization rules
React hooks
Forms
Tables
Cache invalidation
Optimistic updates
OpenAPI specs
Tests
Docs
Deployment config
Migrations
```

That duplication creates drift.

Gen2's model is different:

```txt
Define semantic facts once.
Generate everything else from verified graph structure.
```

You define:

- entities and fields
- semantic types and codecs
- rules and policies
- operations and laws
- actions and queries
- resources and mutations
- forms and lists
- boundary calls and transports
- events, queues, reactions, dispatch
- requirements, providers, placement
- invariants, diagnostics, and obligations
- storage, deployment, migrations, docs, and tests

Gen2 lowers those definitions into one graph of **nodes**, **edges**, and **traits**.

Then passes derive the rest.

---

## The core idea

Gen2 has a small semantic kernel:

```txt
Node
Edge
Trait
```

Everything meaningful in the app is represented with those concepts.

```txt
Entity          -> Node
Field           -> Node
Action          -> Node
Rule            -> Node
Query           -> Node
Form            -> Node
List            -> Node
Provider        -> Node
StorageLocation -> Node
MigrationPlan   -> Node

Entity owns field       -> Edge
Field has type          -> Edge
Action writes field     -> Edge
Query reads field       -> Edge
Policy uses rule        -> Edge
Form submits action     -> Edge
Resource wraps query    -> Edge
Mutation invalidates key -> Edge

serverOnly     -> Trait
patchable      -> Trait
idempotent     -> Trait
sqlLowerable   -> Trait
clientReadable -> Trait
sensitiveSafe  -> Trait
```

The public API is rich and ergonomic. The compiler IR stays boring.

---

## Why Gen2 generation is precise

Gen2 is not string-based code generation.

It does not look at a field named `createdAt` and guess what to emit. It understands the full semantic stack behind that field:

```txt
Representation
  physical or wire layout

SemanticType
  domain meaning + TypeScript decoded type

Serializer / Transform
  conversion between semantic, storage, and wire forms

Operation
  typed computation over semantic types

Expr
  operation application tree

Trait
  semantic claim attached to a graph object

Law
  behavioral claim about an operation

Implementation
  target-specific realization
```

This is why Gen2 can generate database schemas, runtime codecs, API contracts, UI controls, tests, docs, migrations, and sync plans from the same source graph.

A field is not just a name and a TypeScript type.

```ts
createdAt: field(t.datetime());
```

Gen2 knows:

```txt
semantic meaning:
  datetime

TypeScript decoded type:
  Date

storage representation:
  i64 microseconds, or target-legalized timestamp storage

wire representation:
  ISO string, JSON string, or target-specific encoded form

runtime behavior:
  serializer and deserializer

target behavior:
  sortable
  comparable
  indexable
  serializable
```

That means one field can consistently generate many artifacts:

```txt
Postgres:
  created_at TIMESTAMPTZ NOT NULL
  -- or BIGINT microseconds, depending on target profile

TypeScript:
  createdAt: Date

OpenAPI:
  createdAt:
    type: string
    format: date-time

React:
  date/time display
  date picker when editable

Runtime:
  encode Date -> wire representation
  decode wire representation -> Date

Tests:
  serializer round-trip test
  migration compatibility test
```

The same idea applies to domain-specific types:

```ts
const UserId = t.brand("UserId", t.uuid());
const Email = t.email();
const Money = t.money();
```

These may share simple runtime representations, but they carry different semantic meaning.

```txt
UserId
  semantic: nominal user identifier
  storage: uuid / fixed bytes / text, depending target
  TypeScript: branded string
  OpenAPI: string format uuid

Email
  semantic: email address
  storage: text
  TypeScript: string
  validation: email format
  UI: email input
  privacy: likely PII

Money
  semantic: currency amount
  storage: i64 cents or decimal representation
  TypeScript: bigint or decimal string
  aggregation: semantic or storage-aware
```

Gen2 keeps those distinctions visible to compiler passes.

---

## Semantic types vs representations

Gen2 separates **meaning** from **layout**.

A semantic type describes what a value means:

```ts
const Email = t.email();
const UserId = t.brand("UserId", t.uuid());
const Amount = t.money();
const CreatedAt = t.datetime();
```

A representation describes how that value is stored or transmitted:

```ts
repr.text();
repr.i64();
repr.fixedBytes(16);
repr.struct([
  { name: "amount", repr: repr.i64() },
  { name: "currency", repr: repr.fixedString(3, "ascii") },
]);
```

This separation matters because different targets may require different representations.

```ts
const DateTime = t.datetime({
  storage: repr.i64(), // microseconds since epoch
  wire: repr.text(), // ISO string
});
```

A Postgres target may legalize that to `TIMESTAMPTZ`.
A binary protocol target may keep it as `i64`.
An OpenAPI target may expose it as an ISO string.
A TypeScript target may expose it as `Date`.

The semantic type stays the same.

The target representation changes.

---

## Types lower to graph facts

When you write:

```ts
class User extends app.entity.class("User", {
  fields: {
    id: field(t.brand("UserId", t.uuid())).primary(),
    email: field(t.email()).unique(),
    createdAt: field(t.datetime()),
  },
}) {}
```

Gen2 lowers this to graph facts:

```txt
Node(Entity): User
Node(Field): User.id
Node(Field): User.email
Node(Field): User.createdAt

Node(Type): UserId
Node(Type): uuid
Node(Type): email
Node(Type): datetime

Node(Representation): fixed_bytes(16)
Node(Representation): text
Node(Representation): i64

Edge(EntityOwnsField): User -> User.id
Edge(EntityOwnsField): User -> User.email
Edge(EntityOwnsField): User -> User.createdAt

Edge(FieldHasType): User.id -> UserId
Edge(FieldHasType): User.email -> email
Edge(FieldHasType): User.createdAt -> datetime

Edge(TypeBrands): UserId -> uuid
Edge(TypeHasStorageRepresentation): uuid -> fixed_bytes(16)
Edge(TypeHasStorageRepresentation): email -> text
Edge(TypeHasStorageRepresentation): datetime -> i64
```

Targets do not need to guess.

They consume verified semantic facts.

---

## Operations are semantic, not just functions

Operations describe computation in a way the compiler can analyze.

```ts
const addMoney = gen.operation.define("addMoney", {
  input: t.object({
    left: t.money(),
    right: t.money(),
  }),

  output: t.money(),

  traits: [traits.pure, traits.deterministic],

  laws: [
    laws.associative({ assurance: assurance.tested() }),
    laws.commutative({ assurance: assurance.tested() }),
  ],

  implementations: {
    postgres: op.sql("($1 + $2)"),
    typescript: op.ts("(left, right) => left + right"),
  },
});
```

Because Gen2 knows this operation is pure, deterministic, associative, and commutative, it can use that knowledge elsewhere:

```txt
optimistic updates
parallel execution
incremental view maintenance
rollback planning
merge strategies
generated property tests
target capability checks
```

A normal function is opaque.

A Gen2 operation is inspectable.

---

## Laws make generated behavior safer

Laws are semantic claims about operations.

```ts
laws.associative();
laws.commutative();
laws.idempotent();
laws.invertible();
laws.rollbackSafe();
laws.validStateTransition();
```

Every law has an assurance level.

```ts
laws.idempotent({
  key: ({ input }) => input.commandId,
  assurance: assurance.byConstruction(),
});
```

Common assurance levels include:

```txt
asserted
derived
tested
checked_by_target
proved_by_solver
by_construction
trusted_target
```

This matters because compiler passes rely on laws.

For example:

```ts
const acknowledgeIncident = app.action("acknowledgeIncident")((a) =>
  a
    .input({ incidentId: Incident.fields.id.type, commandId: t.uuid() })
    .writes([Incident.fields.status, Incident.fields.acknowledgedAt])
    .laws([
      laws.idempotent({
        key: ({ input }) => input.commandId,
        assurance: assurance.byConstruction(),
      }),
    ])
    .offline(true),
);
```

Now Gen2 can verify:

```txt
This action can be retried.
This action can be queued.
This action can run offline.
This action can participate in at-least-once delivery.
```

Without the idempotency law, the compiler emits a diagnostic.

---

## Traits are checked semantic claims

Traits are not comments.

A trait is a checked semantic claim attached to a graph object.

```ts
traits.serverOnly;
traits.clientReadable;
traits.sensitiveSafe;
traits.patchable;
traits.sqlLowerable;
traits.offlineReplaySafe;
traits.appendOnly;
traits.auditRequired;
```

Traits can attach to many graph objects:

```txt
Type
Field
Entity
Operation
Action
Query
Resource
Provider
Boundary
Queue
UI component
Artifact
Migration step
```

Example:

```ts
class AuditLog extends app.entity.class("AuditLog", {
  traits: [traits.appendOnly, traits.serverOnly],

  fields: {
    id: field(t.uuid()).primary(),
    organizationId: field(Organization.fields.id.type),
    action: field(t.string()),
    payload: field(t.json()),
    createdAt: field(t.datetime()),
  },
}) {}
```

Those traits affect generated output:

```txt
appendOnly
  -> no generated update/delete mutation
  -> insert-only storage checks
  -> append-only tests

serverOnly
  -> excluded from client projections
  -> client-read diagnostics
  -> server-only API generation
```

Traits can also define validation behavior:

```ts
const NonEmptyString = t.string().withTrait(
  traits.validate("non_empty", {
    expr: ({ value }) => expr.gt(expr.length(value), 0),
    diagnostic: diagnostic.define("string.non_empty", {
      severity: "error",
      message: "Value must not be empty.",
    }),
  }),
);
```

That one semantic claim can generate:

```txt
server validation
form validation
OpenAPI constraints
generated tests
user-facing error mapping
documentation
```

---

## Effects and capabilities drive placement

Gen2 distinguishes pure computation from effectful behavior.

```ts
const sendEmail = gen.operation.define("sendEmail", {
  input: t.object({
    to: t.email(),
    subject: t.string(),
    body: t.string(),
  }),

  output: t.void,

  effects: [effects.emailSend(), effects.network()],

  requires: [EmailApiKey],

  placement: WorkerBoundary,
});
```

The compiler can now verify:

```txt
email operation does not run on the client
required provider exists
provider is not leaked to browser
worker target supports network
deployment includes required secret
tests include provider mock
```

Effects, requirements, providers, placement, and deployment are connected graph facts.

---

## Why this matters for code generation

Gen2 can generate more than boilerplate because it understands meaning.

Given:

```ts
class Incident extends app.entity.class("Incident", {
  fields: {
    id: field(t.uuid()).primary(),
    title: field(t.string()),
    severity: field(t.enum("Severity", ["sev1", "sev2", "sev3", "sev4"] as const)),
    status: field(IncidentStatus.type),
    acknowledgedAt: field(t.optional(t.datetime())),
  },
}) {}

const canAcknowledgeIncident = app.rule("canAcknowledgeIncident")((r) =>
  r
    .vars({ session: AuthSession, incident: Incident })
    .when(({ session, incident }) =>
      expr.and(
        expr.eq(session.organizationId, incident.organizationId),
        expr.eq(incident.status, "open"),
      ),
    ),
);

const acknowledgeIncident = app.action("acknowledgeIncident")((a) =>
  a
    .input({ incidentId: Incident.fields.id.type })
    .requires(AuthSession)
    .guard(canAcknowledgeIncident)
    .writes([Incident.fields.status, Incident.fields.acknowledgedAt])
    .body(({ input, clock }) => {
      Incident.update(input.incidentId, {
        status: "acknowledged",
        acknowledgedAt: clock.now,
      });
    }),
);
```

Gen2 can derive:

```txt
Database:
  incidents table
  status column
  acknowledged_at column
  indexes
  check constraints
  migration steps

Server:
  acknowledgeIncident handler
  input validation
  auth/provider loading
  rule guard
  write transaction
  typed error handling

API:
  request schema
  response schema
  OpenAPI operation
  error union

Client:
  mutation hook
  optimistic update plan
  rollback plan
  disabled/enabled UI state

Reactivity:
  ActionWrites Incident.status
  RuleReads Incident.status
  QueryReads Incident.status
  affected resource keys
  invalidation plan

UI:
  button enabled when canAcknowledgeIncident
  form validation
  list row action

Tests:
  rule matrix
  action authorization tests
  mutation invalidation tests
  optimistic rollback tests

Docs:
  action documentation
  policy access matrix
  generated domain docs
```

That is the core power of Gen2.

You write schema, operations, and rules.

Gen2 generates implementation.

```

```

## A tiny example

```ts
import { createGen, targets } from "@dirived/gen2";

const gen = createGen("blog")
  .use(targets.postgres)
  .use(targets.effect)
  .use(targets.react)
  .use(targets.tests)
  .use(targets.docs);

const app = gen.kit.saas("Blog", {
  auth: "session-cookie",
  database: targets.postgres,
  server: targets.effect,
  web: targets.react,
});

const t = gen.type;

class Post extends app.entity.class("Post", {
  fields: {
    id: app.field(t.uuid).primary(),
    title: app.field(t.string),
    body: app.field(t.string),
    published: app.field(t.boolean),
    authorId: app.field(t.uuid),
    createdAt: app.field(t.datetime),
  },
}) {}

const canPublishPost = app.rule("canPublishPost")((r) =>
  r
    .vars({ session: app.AuthSession, post: Post })
    .when(({ session, post }) =>
      gen.expr.and(gen.expr.eq(session.userId, post.authorId), gen.expr.eq(session.role, "author")),
    ),
);

const publishPost = app.action("publishPost")((a) =>
  a
    .input({ postId: Post.fields.id.type })
    .requires(app.AuthSession)
    .guard(canPublishPost)
    .writes([Post.fields.published])
    .body(({ input }) => {
      Post.update(input.postId, { published: true });
    }),
);

const PublishedPosts = app.query("PublishedPosts")((q) =>
  q
    .from(Post)
    .where((post) => gen.expr.eq(post.published, true))
    .select({
      id: Post.fields.id,
      title: Post.fields.title,
      createdAt: Post.fields.createdAt,
    })
    .orderBy((post) => [post.createdAt.desc()]),
);

const PostList = app.ui.list("PostList", {
  query: PublishedPosts,
  columns: {
    title: app.ui.list.column(PublishedPosts.output.fields.title, {
      searchable: true,
      sortable: true,
    }),
    createdAt: app.ui.list.column(PublishedPosts.output.fields.createdAt, {
      sortable: true,
    }),
  },
});

const graph = gen.graph.pipe(Post, canPublishPost, publishPost, PublishedPosts, PostList);

const checked = graph.run(
  app
    .pipeline("blog.check")
    .verifyGraph()
    .deriveQueryReads()
    .deriveActionWrites()
    .deriveRuleInvalidation()
    .deriveObligations()
    .legalizeTargets()
    .diagnostics({ failOn: "error" }),
);

const build = checked.graph.emit([
  targets.postgres.artifacts.sqlMigration({ path: "generated/db/init.sql" }),
  targets.effect.artifacts.actionHandlers({ path: "generated/server/actions.ts" }),
  targets.react.artifacts.component({ source: PostList, path: "generated/web/PostList.tsx" }),
  targets.tests.artifacts.policyTests({ path: "generated/tests/policy.generated.test.ts" }),
  targets.docs.artifacts.markdown({ path: "generated/docs/blog.md" }),
]);
```

From this, Gen2 can derive:

```txt
Postgres table
Postgres indexes
Server action handler
Authorization guard
React query hook
React table component
Cache invalidation
OpenAPI route
Policy test matrix
Generated docs
Graph snapshot
```

The user wrote domain semantics. Gen2 produced implementation artifacts.

---

## What Gen2 generates

Given schema + operations + rules, Gen2 can generate:

```txt
Database
  SQL schema
  migrations
  indexes
  constraints
  row-level security policies
  outbox tables
  migration state tables

Server
  action handlers
  query handlers
  provider layers
  validation
  authorization checks
  error serialization
  queue workers

Client
  React components
  resource hooks
  mutation hooks
  forms
  lists/tables
  optimistic updates
  offline command queues

API
  OpenAPI documents
  typed clients
  route handlers
  request/response codecs

Reactivity
  resource keys
  invalidation plans
  optimistic patches
  rollback plans
  incremental view maintenance plans

Tests
  policy tests
  mutation invalidation tests
  optimistic rollback tests
  queue delivery tests
  migration tests
  generated fixtures
  property tests

Docs
  domain docs
  access matrices
  API docs
  migration reports
  compatibility reports
  runbooks

Deployment
  infrastructure code
  queues
  workers
  secrets
  databases
  observability resources

Devtools
  graph snapshots
  semantic diffs
  explain reports
  artifact provenance
```

---

## A fuller example: incident management SaaS

The rest of this README shows a larger example: an incident-management application called **OpsDesk**.

It demonstrates the core value of Gen2: rich semantic definitions producing many target artifacts.

---

## Create the compiler

```ts
import {
  createGen,
  dialects,
  targets,
  traits,
  laws,
  assurance,
  expr,
  merge,
  invariant,
  diagnostic,
  delivery,
  idempotency,
  retry,
  serialization,
  sensitivity,
  privacy,
  type GraphWitnessOf,
  type InferEntity,
  type InferInput,
  type InferOutput,
} from "@dirived/gen2";

export const gen = createGen("opsdesk")
  .config({
    strictness: {
      mode: "production",
      graph: "strict",
      typing: "strict",
      target: "strict",
      privacy: "strict",
      obligations: "error",
      opaqueCode: "deny_without_declared_blast_radius",
    },
    identity: {
      stableIds: "required",
      renameHints: "required_for_ambiguous_changes",
    },
  })
  .use(dialects.core)
  .use(dialects.type)
  .use(dialects.expr)
  .use(dialects.operation)
  .use(dialects.law)
  .use(dialects.domain)
  .use(dialects.rule)
  .use(dialects.auth)
  .use(dialects.callable)
  .use(dialects.query)
  .use(dialects.reactivity)
  .use(dialects.resource)
  .use(dialects.state)
  .use(dialects.dispatch)
  .use(dialects.boundary)
  .use(dialects.ui)
  .use(dialects.storage)
  .use(dialects.provider)
  .use(dialects.placement)
  .use(dialects.evolution)
  .use(dialects.obligation)
  .use(dialects.observability)
  .use(targets.postgres)
  .use(targets.effect)
  .use(targets.react)
  .use(targets.jsonRender)
  .use(targets.openapi)
  .use(targets.alchemy)
  .use(targets.tests)
  .use(targets.docs)
  .use(targets.graph)
  .use(targets.typescript);

export const app = gen.kit.saas("OpsDesk", {
  tenantModel: "organization",
  auth: "session-cookie",
  database: targets.postgres,
  server: targets.effect,
  web: targets.react,
  deployment: targets.alchemy,

  defaults: {
    timestamps: true,
    audit: true,
    optimisticMutations: true,
    offlineCommands: true,
    jsonRender: true,
    generatedTests: true,
    generatedDocs: true,
    graphWitness: true,
  },
});

const t = gen.type;
```

---

## Define placement and providers

Providers are semantic facts. They describe where values come from, how long they live, what they satisfy, and whether they are safe to expose.

```ts
export const RequestStorage = app.placement.storage("RequestStorage", {
  kind: "server.request",
  traits: [
    app.placement.traits.ephemeral,
    app.placement.traits.sensitiveSafe,
    app.placement.traits.serverReadable,
    app.placement.traits.serverWritable,
  ],
});

export const SessionCookieStorage = app.placement.storage("SessionCookieStorage", {
  kind: "cookie.session",
  ttl: "7d",
  traits: [
    app.placement.traits.persistent,
    app.placement.traits.clientReadable,
    app.placement.traits.serverReadable,
  ],
});

export const OrgRole = t.enum("OrgRole", ["owner", "admin", "responder", "viewer"] as const);

export const AuthSessionType = t.object("AuthSession", {
  userId: t.uuid,
  organizationId: t.uuid,
  role: OrgRole,
  teamIds: t.array(t.uuid),
});

export const AuthSession = app.requirement("AuthSession", {
  type: AuthSessionType,
  sensitivity: sensitivity.auth(),
  lifetime: "request",
});

export const ClientAuthSession = app.projection("ClientAuthSession", {
  from: AuthSession,
  placement: app.boundaries.ClientBoundary,
  sensitivity: sensitivity.user(),
  fields: {
    userId: AuthSessionType.fields.userId,
    organizationId: AuthSessionType.fields.organizationId,
    role: AuthSessionType.fields.role,
    teamIds: AuthSessionType.fields.teamIds,
  },
});

export const AuthSessionProvider = app.provider("AuthSessionProvider", {
  provides: AuthSession,
  source: app.provider.source.cookie("opsdesk_session", {
    type: AuthSessionType,
    storage: SessionCookieStorage,
  }),
  placement: app.boundaries.ServerBoundary,
  storage: RequestStorage,
  lifetime: "request",
  sensitivity: sensitivity.auth(),
  clientProjection: ClientAuthSession,
});
```

From this, Gen2 can verify:

```txt
AuthSession has exactly one provider
AuthSession does not escape request lifetime
server-only data does not leak to client-readable storage
client projection is safe
provider can be mocked in generated tests
deployment has required secret/storage resources
```

---

## Define entities and fields

Entities are graph nodes. Fields are graph nodes. Ownership and field types are graph edges.

```ts
export class Organization extends app.entity.class("Organization", {
  id: "entity:organization",
  traits: [traits.tenantRoot],

  fields: {
    id: app.field(t.uuid).id("field:organization.id").primary(),
    slug: app.field(t.string).id("field:organization.slug").unique(),
    name: app.field(t.string).id("field:organization.name"),
    createdAt: app.field(t.datetime).id("field:organization.created-at"),
  },
}) {}

export class User extends app.entity.class("User", {
  id: "entity:user",

  fields: {
    id: app.field(t.uuid).id("field:user.id").primary(),
    organizationId: app.field(Organization.fields.id.type).id("field:user.organization-id"),
    email: app.field(t.email).id("field:user.email").unique().classify({
      privacy: privacy.pii(),
      retention: "while_account_active",
      erase: "on_user_delete",
      logs: "redact",
      devtools: "masked",
    }),
    displayName: app.field(t.string).id("field:user.display-name"),
    role: app.field(OrgRole).id("field:user.role"),
  },
}) {}
```

A field privacy classification can generate runtime protections:

```txt
redacted logs
masked devtools values
PII export docs
erase obligations
privacy tests
```

---

## Define a state machine and merge policy

Gen2 can reason about offline sync and concurrent writes if merge semantics are explicit.

```ts
export const IncidentStatus = gen.variant.stateMachine("IncidentStatus", {
  states: ["open", "acknowledged", "mitigated", "resolved", "cancelled"] as const,
  transitions: {
    open: ["acknowledged", "cancelled"],
    acknowledged: ["mitigated", "resolved", "cancelled"],
    mitigated: ["resolved"],
    resolved: [],
    cancelled: [],
  },
  terminal: ["resolved", "cancelled"] as const,
});

export class Incident extends app.entity.class("Incident", {
  id: "entity:incident",
  traits: [traits.audited, traits.syncable],

  merge: merge.entityPolicy("IncidentMergePolicy", {
    default: merge.fieldWise({ conflict: "may_conflict" }),

    fields: {
      status: merge.stateMachine({
        machine: IncidentStatus,
        conflict: merge.manual({
          surface: "IncidentConflictResolutionView",
        }),
        laws: [laws.validStateTransition({ assurance: assurance.byConstruction() })],
      }),
      severity: merge.lastWriteWins({ clock: "server" }),
      updatedAt: merge.max({ assurance: assurance.byConstruction() }),
    },
  }),

  fields: {
    id: app.field(t.uuid).id("field:incident.id").primary(),
    organizationId: app.field(Organization.fields.id.type).id("field:incident.organization-id"),
    title: app.field(t.string).id("field:incident.title"),
    summary: app.field(t.optional(t.string)).id("field:incident.summary"),
    severity: app.field(t.enum("Severity", ["sev1", "sev2", "sev3", "sev4"] as const)),
    status: app.field(IncidentStatus.type).id("field:incident.status"),
    assignedTeamId: app.field(t.optional(t.uuid)).id("field:incident.assigned-team-id"),
    acknowledgedAt: app.field(t.optional(t.datetime)).id("field:incident.acknowledged-at"),
    resolvedAt: app.field(t.optional(t.datetime)).id("field:incident.resolved-at"),
    createdAt: app.field(t.datetime).id("field:incident.created-at"),
    updatedAt: app.field(t.datetime).id("field:incident.updated-at"),
  },

  invariants: [
    invariant.required("incident.title", {
      field: "title",
      diagnostic: diagnostic.define("incident.title.required", {
        severity: "error",
        message: "Incident title is required.",
        remediation: { kind: "focus_field", field: "title" },
      }),
    }),
  ],
}) {}
```

From this, Gen2 can derive:

```txt
state transition validators
valid transition tests
merge conflict diagnostics
offline replay checks
optimistic rollback safety
migration constraints
UI conflict resolution surfaces
```

---

## Define rules and policies

Rules are inspectable expressions. Policies connect rules to entities and enforcement surfaces.

```ts
export const canViewIncident = app.rule("canViewIncident")((r) =>
  r
    .vars({
      session: AuthSession,
      incident: Incident,
    })
    .when(({ session, incident }) => expr.eq(session.organizationId, incident.organizationId))
    .traits([traits.sqlLowerable]),
);

export const canManageIncident = app.rule("canManageIncident")((r) =>
  r
    .vars({
      session: AuthSession,
      incident: Incident,
    })
    .when(({ session, incident }) =>
      expr.and(
        expr.eq(session.organizationId, incident.organizationId),
        expr.or(
          expr.eq(session.role, "owner"),
          expr.eq(session.role, "admin"),
          expr.eq(session.role, "responder"),
        ),
      ),
    )
    .traits([traits.sqlLowerable]),
);

export const IncidentPolicy = app.auth.tenantPolicy("IncidentPolicy", {
  tenant: Organization,
  entity: Incident,
  rules: {
    read: canViewIncident,
    update: canManageIncident,
  },
  enforce: {
    read: ["server", "database"],
    update: ["server"],
  },
  exposeClientHints: true,
});
```

From this one policy, Gen2 can generate:

```txt
server guard code
Postgres row-level security policies
client UI enabled/disabled hints
policy test matrix
access matrix documentation
OpenAPI auth metadata
```

---

## Define operations and actions

Operations carry semantic laws. Actions use operations and declare requirements, writes, guards, and events.

```ts
export const SetField = gen.operation.define("SetField", {
  input: t.object("SetFieldInput", {
    field: t.ref("FieldRef"),
    value: t.unknown,
  }),
  output: t.object("SetFieldOutput", {
    previousValue: t.unknown,
    nextValue: t.unknown,
  }),
  traits: [traits.deterministic, traits.patchable, traits.invertible],
  laws: [laws.rollbackSafe({ assurance: assurance.byConstruction() })],
});

export const acknowledgeIncident = app.action("acknowledgeIncident")((a) =>
  a
    .input({ incidentId: Incident.fields.id.type })
    .requires(AuthSession)
    .requires(app.requirement("RequestClock", { type: t.object({ now: t.datetime }) }))
    .guard(canManageIncident)
    .runsIn(app.boundaries.ServerBoundary)
    .writes([Incident.fields.status, Incident.fields.acknowledgedAt, Incident.fields.updatedAt])
    .applies([SetField])
    .body(({ input, session, clock }) => {
      Incident.update(input.incidentId, {
        status: "acknowledged",
        acknowledgedAt: clock.now,
        updatedAt: clock.now,
      });
    })
    .event("IncidentAcknowledged", ({ input, session, clock, incident }) => ({
      eventId: app.uuid(),
      organizationId: incident.organizationId,
      incidentId: input.incidentId,
      acknowledgedByUserId: session.userId,
      occurredAt: clock.now,
    })),
);
```

From the action body and declared writes, Gen2 derives graph facts:

```txt
ActionWrites: acknowledgeIncident -> Incident.status
ActionWrites: acknowledgeIncident -> Incident.acknowledgedAt
ActionRequires: acknowledgeIncident -> AuthSession
ActionGuardedBy: acknowledgeIncident -> canManageIncident
ActionEmits: acknowledgeIncident -> IncidentAcknowledged
```

Those facts power downstream code generation.

---

## Define queries and resources

Queries are semantic read boundaries. Resources wrap queries for client/runtime use.

```ts
export const IncidentCard = app.projection("IncidentCard", {
  from: Incident,
  placement: app.boundaries.ClientBoundary,
  sensitivity: sensitivity.user(),
  fields: {
    id: Incident.fields.id,
    title: Incident.fields.title,
    severity: Incident.fields.severity,
    status: Incident.fields.status,
    updatedAt: Incident.fields.updatedAt,
  },
});

export const listOpenIncidents = app.query("listOpenIncidents")((q) =>
  q
    .input({ organizationId: Organization.fields.id.type })
    .requires(AuthSession)
    .from(Incident)
    .where(({ input, row }) =>
      expr.and(
        expr.eq(row.organizationId, input.organizationId),
        expr.not(expr.includes(["resolved", "cancelled"], row.status)),
      ),
    )
    .select(IncidentCard)
    .orderBy((row) => [row.severity.desc(), row.updatedAt.desc()])
    .key("openIncidents", { hierarchy: "collection" }),
);

export const OpenIncidentsResource = app.resource.query("OpenIncidentsResource", {
  query: listOpenIncidents,
  refresh: ["on_mount", "on_invalidate"],
});
```

From query reads and action writes, Gen2 can derive invalidation.

```txt
listOpenIncidents reads Incident.status
acknowledgeIncident writes Incident.status
therefore acknowledgeIncident invalidates OpenIncidentsResource
```

No manual cache-key bookkeeping required.

---

## Rule-derived reactivity

Gen2 can derive invalidation through rules and policies too.

```txt
Action writes Field
Rule reads Field
Policy uses Rule
Query is guarded by Policy
Query has KeyFamily
Resource wraps Query
Therefore Action invalidates Resource
```

This is the power of the semantic graph.

```ts
const graph = gen.graph.pipe(
  Incident,
  canViewIncident,
  canManageIncident,
  IncidentPolicy,
  acknowledgeIncident,
  listOpenIncidents,
  OpenIncidentsResource,
);

const plan = graph.run(
  app
    .pipeline("derive-reactivity")
    .deriveActionWrites()
    .deriveRuleReads()
    .deriveQueryReads()
    .deriveRuleInvalidation()
    .deriveOptimisticPlans(),
);

console.log(
  graph.explain(gen.reactivity.edges.invalidatesKey, {
    action: acknowledgeIncident,
    key: listOpenIncidents.key.any(),
  }),
);
```

Example explanation:

```txt
acknowledgeIncident invalidates openIncidents because:
  acknowledgeIncident writes Incident.status
  canManageIncident reads Incident.status
  IncidentPolicy uses canManageIncident
  listOpenIncidents is guarded by IncidentPolicy
  listOpenIncidents has key family openIncidents
```

---

## Generate UI from actions and resources

Forms derive from action contracts. Lists derive from queries/resources.

```ts
export const DeclareIncidentDraft = app.state.resource("DeclareIncidentDraft", {
  type: t.object("DeclareIncidentDraft", {
    title: t.string,
    summary: t.optional(t.string),
    severity: Incident.fields.severity.type,
    assignedTeamId: t.optional(t.uuid),
  }),
  storage: app.placement.storage("ClientSessionStorage", {
    kind: "client.sessionStorage",
  }),
  readableBy: [app.boundaries.ClientBoundary],
  writableBy: [app.boundaries.ClientBoundary],
  hydrate: false,
});

export const DeclareIncidentForm = app.form.fromAction("DeclareIncidentForm", {
  action: app.action("declareIncident"),
  draft: DeclareIncidentDraft,
  fields: {
    title: {
      label: "Title",
      widget: app.ui.widget.textInput(),
      bind: DeclareIncidentDraft.fields.title,
    },
    severity: {
      label: "Severity",
      widget: app.ui.widget.select({ options: Incident.fields.severity.type }),
      bind: DeclareIncidentDraft.fields.severity,
    },
    assignedTeamId: {
      label: "Assigned team",
      widget: app.ui.widget.relationSelect({ entity: Team }),
      visibleWhen: ({ values }) => expr.eq(values.severity, "sev1"),
    },
  },
});

export const IncidentList = app.ui.list("IncidentList", {
  resource: OpenIncidentsResource,
  projection: IncidentCard,
  columns: {
    title: app.ui.list.column(IncidentCard.fields.title, {
      searchable: true,
      sortable: true,
    }),
    severity: app.ui.list.column(IncidentCard.fields.severity, {
      filterable: true,
      filter: "select",
      sortable: true,
    }),
    status: app.ui.list.column(IncidentCard.fields.status, {
      filterable: true,
      filter: "select",
    }),
  },
  rowActions: {
    acknowledge: app.ui.list.rowAction({
      label: "Acknowledge",
      action: acknowledgeIncident,
      input: ({ row }) => ({ incidentId: row.id }),
      enabledWhen: ({ row, session }) => canManageIncident.call({ session, incident: row }),
    }),
  },
});
```

From this, Gen2 can generate:

```txt
React form component
React table component
JSON-render catalog
JSON-render spec
form validation tests
list interaction tests
client/server boundary checks
state binding checks
```

---

## Dispatch, queues, and workers

Events and dispatch are graph-native too.

```ts
export const NotificationMessage = t.object("NotificationMessage", {
  messageId: t.uuid,
  organizationId: Organization.fields.id.type,
  incidentId: Incident.fields.id.type,
  channel: t.enum("NotificationChannel", ["email", "slack"] as const),
  recipientUserId: User.fields.id.type,
  subject: t.string,
  body: t.string,
});

export const IncidentNotifications = app.recipes.notificationPipeline("IncidentNotifications", {
  trigger: acknowledgeIncident.events.IncidentAcknowledged,

  queue: {
    name: "NotificationQueue",
    message: NotificationMessage,
    placement: app.boundaries.WorkerBoundary,
    delivery: delivery.atLeastOnce(),
    retry: retry.exponential({ maxAttempts: 8 }),
    idempotency: idempotency.messageId(({ message }) => message.messageId),
    deadLetter: true,
  },

  deliveryPlan: delivery.outbox({
    guarantee: "at_least_once",
    storage: app.storage.postgresTable("incident_outbox"),
  }),
});
```

Gen2 verifies:

```txt
at-least-once dispatch has idempotency
queue messages have strict serialization
worker has required providers/secrets
non-idempotent effects are not retried unsafely
DLQ is configured when required
```

---

## Boundary and transport plans

Boundary plans describe how calls cross runtime boundaries.

```ts
export const AcknowledgeIncidentBoundaryCall = app.boundary.call(
  "AcknowledgeIncidentBoundaryCall",
  {
    callable: acknowledgeIncident,
    from: app.boundaries.ClientBoundary,
    to: app.boundaries.ServerBoundary,
    transport: app.boundary.transport.serverAction(),
    auth: AuthSession,

    serialization: {
      input: serialization.strictJson(acknowledgeIncident.input),
      output: serialization.strictJson(acknowledgeIncident.output),
      error: serialization.taggedUnion(acknowledgeIncident.errors),
    },

    invalidates: acknowledgeIncident.invalidates,
    optimistic: acknowledgeIncident.optimistic,
  },
);
```

Boundary facts can generate:

```txt
server action wrapper
client mutation hook
input/output codecs
error serializers
OpenAPI routes
transport tests
auth tests
```

---

## Versioning and migrations

Gen2 treats versioning as part of the graph.

```ts
export const OpsDeskSchema = app.evolution.schema("opsdesk", {
  version: "2.4.0",
  previous: "2.3.0",
  surfaces: {
    database: targets.postgres.surface,
    openapi: targets.openapi.surface,
    typescript: targets.typescript.surface,
    jsonRender: targets.jsonRender.surface,
  },
});

export const PreviousSnapshot = app.evolution.snapshot("previous-production", {
  schema: OpsDeskSchema,
  path: ".gen2/snapshots/2.3.0.json.gz",
  profile: "production",
  exclude: ["secrets", "runtimeConfig", "closures"],
  redaction: "strict",
});

export const MigrationPlan = app.evolution.migrationPlan("OpsDesk_2_3_to_2_4", {
  schema: OpsDeskSchema,
  from: PreviousSnapshot,
  to: "current",
  policies: {
    allowDestructive: false,
    requireBackfillForTypeChange: true,
    requireManualApprovalForDrop: true,
  },
});
```

Gen2 can generate:

```txt
migration plan
Postgres SQL migration
migration tests
compatibility report
rollback runbook
schema snapshot
semantic version diagnostics
```

---

## Obligations: generated tests and docs from semantics

Some semantic facts imply generated-output responsibilities.

```ts
export const PolicyTestObligations = app.obligation.derive("PolicyTestObligations", {
  from: [IncidentPolicy],
  produce: [
    app.obligation.kind.policyTest({ priority: "required" }),
    app.obligation.kind.accessMatrixDoc({ priority: "recommended" }),
  ],
});

export const ReactivityTestObligations = app.obligation.derive("ReactivityTestObligations", {
  from: [acknowledgeIncident, OpenIncidentsResource],
  produce: [
    app.obligation.kind.mutationInvalidationTest({ priority: "required" }),
    app.obligation.kind.optimisticRollbackTest({ priority: "required" }),
  ],
});
```

This lets Gen2 generate tests and docs because the graph says they are required.

---

## Compose modules

Modules are graph fragments with contracts.

```ts
export const IncidentModule = app
  .module("incident", {
    imports: {
      AuthSession,
      Organization,
      User,
    },

    exports: {
      entity: Incident,
      actions: {
        acknowledge: acknowledgeIncident,
      },
      resources: {
        openIncidents: OpenIncidentsResource,
      },
      ui: {
        list: IncidentList,
        form: DeclareIncidentForm,
      },
    },

    config: {
      allowOfflineAcknowledge: t.boolean.default(true),
    },
  })
  .pipe(
    Incident,
    canViewIncident,
    canManageIncident,
    IncidentPolicy,
    acknowledgeIncident,
    listOpenIncidents,
    OpenIncidentsResource,
    DeclareIncidentForm,
    IncidentList,
    IncidentNotifications,
  );
```

Modules support:

```txt
imports/exports
configuration
semantic versioning
package publication
graph shaking
composability tests
AI edit boundaries
```

---

## Preview, expand, explain

Gen2 derives a lot, so it makes derived behavior visible.

```ts
app.preview(IncidentList);
app.expand(IncidentNotifications);
app.explain(gen.reactivity.edges.invalidatesKey, {
  action: acknowledgeIncident,
  key: OpenIncidentsResource.key.any(),
});
app.traceArtifact("generated/web/IncidentList.tsx");
```

Example output:

```txt
IncidentList emits:
  Node(ListView)
  Node(ListColumn) x3
  Edge(ListUsesResource)
  Edge(ColumnDisplaysField) x3
  Edge(RowActionRunsAction)

Derived:
  React table component
  JSON-render list spec
  list interaction test obligation
  client data safety checks
```

---

## Check, legalize, emit

Targets do not emit from high-level source IR directly.

Gen2 always checks, derives, canonicalizes, legalizes, then emits.

```ts
export const appGraph = gen.graph.pipe(
  OpsDeskSchema,
  AuthSessionProvider,
  Organization,
  User,
  Incident,
  canViewIncident,
  canManageIncident,
  IncidentPolicy,
  acknowledgeIncident,
  listOpenIncidents,
  OpenIncidentsResource,
  DeclareIncidentForm,
  IncidentList,
  IncidentNotifications,
  MigrationPlan,
  IncidentModule,
);

export const checked = appGraph.run(
  app
    .pipeline("opsdesk.check")
    .verifySymbols()
    .verifyDialects()
    .verifyGraph()
    .deriveProviderSatisfaction()
    .deriveQueryReads()
    .deriveActionWrites()
    .deriveRuleReads()
    .deriveRuleInvalidation()
    .deriveOptimisticPlans()
    .deriveBoundaryPlans()
    .deriveObligations()
    .deriveMigrationPlan()
    .canonicalize()
    .legalizePlacement()
    .legalizeProviders()
    .legalizeQueries()
    .legalizeBoundaryTransports()
    .legalizeReactivity()
    .legalizeUi()
    .legalizeEvolution()
    .legalizeTargets()
    .diagnostics({
      failOn: "error",
      includeRemediation: true,
      includeCandidateFixes: true,
    }),
);

export const build = checked.graph.emit([
  targets.postgres.artifacts.sqlMigration({
    source: MigrationPlan,
    path: "generated/db/migrations/002_004_000.sql",
  }),

  targets.postgres.artifacts.rlsPolicies({
    source: IncidentPolicy,
    path: "generated/db/policies/incident.rls.sql",
  }),

  targets.effect.artifacts.actionHandlers({
    actions: [acknowledgeIncident],
    path: "generated/server/actions.ts",
  }),

  targets.react.artifacts.component({
    source: IncidentList,
    path: "generated/web/IncidentList.tsx",
  }),

  targets.react.artifacts.forms({
    forms: [DeclareIncidentForm],
    path: "generated/web/forms.tsx",
  }),

  targets.jsonRender.artifacts.catalog({
    source: IncidentList,
    path: "generated/ui/catalog.json",
  }),

  targets.openapi.artifacts.document({
    path: "generated/openapi.json",
  }),

  targets.tests.artifacts.policyTests({
    obligations: PolicyTestObligations,
    path: "generated/tests/policy.generated.test.ts",
  }),

  targets.tests.artifacts.reactivityTests({
    obligations: ReactivityTestObligations,
    path: "generated/tests/reactivity.generated.test.ts",
  }),

  targets.docs.artifacts.markdown({
    path: "generated/docs/opsdesk.md",
  }),

  targets.graph.artifacts.snapshot({
    path: "generated/graphs/opsdesk.graph.json",
  }),

  targets.typescript.artifacts.graphWitness({
    path: "generated/opsdesk.graph.d.ts",
  }),
]);
```

---

## TypeScript witness layer

The runtime graph is simple and serializable. The TypeScript witness layer gives editor feedback and local type safety.

```ts
export type OpsDeskGraph = GraphWitnessOf<typeof appGraph>;

export type IncidentValue = InferEntity<typeof Incident>;
export type AcknowledgeInput = InferInput<typeof acknowledgeIncident>;
export type AcknowledgeOutput = InferOutput<typeof acknowledgeIncident>;
export type IncidentListRow = typeof IncidentList.$infer.row;
export type DeclareIncidentFormValues = typeof DeclareIncidentForm.$infer.values;
```

Every major definition exposes a consistent witness surface:

```ts
Incident.ref;
Incident.type;
Incident.fields.status;
Incident.fragment;
Incident.$infer.value;

acknowledgeIncident.ref;
acknowledgeIncident.input;
acknowledgeIncident.output;
acknowledgeIncident.errors;
acknowledgeIncident.$infer.input;
acknowledgeIncident.$infer.output;
acknowledgeIncident.$infer.error;

OpenIncidentsResource.ref;
OpenIncidentsResource.key;
OpenIncidentsResource.$infer.state;
OpenIncidentsResource.$infer.value;

IncidentList.ref;
IncidentList.$infer.row;
DeclareIncidentForm.$infer.values;
```

---

## AI-safe graph editing

Gen2 is designed for AI-assisted app building.

```ts
const candidate = gen.import.jsonRenderSpec({
  catalog: "generated/ui/catalog.json",
  spec: "ai-output/incident-dashboard.json",
  into: appGraph,
  mode: "candidate",
  verify: [
    app.ui.verify.knownCatalogComponents,
    app.ui.verify.slotCapabilityCompatibility,
    app.ui.verify.actionInputCompatibility,
    app.ui.verify.stateBindingCompatibility,
    app.ui.verify.noServerOnlyData,
  ],
});

const reviewed = candidate.ok ? appGraph.pipe(candidate.acceptedFacts) : appGraph;

const diff = gen.graph.diff(appGraph, reviewed);
diff.print({ format: "review" });
```

AI edits graph facts, not arbitrary generated files.

Every candidate can be verified, explained, diffed, repaired, and reviewed before emission.

---

## Diagnostics with repairs

Diagnostics can produce candidate graph patches.

```ts
diagnostic.define("dispatch.at_least_once.requires_idempotency", {
  severity: "error",
  message: "Dispatch uses at-least-once delivery but has no idempotency plan.",
  remediation: {
    kind: "add_edge",
    suggestion:
      "Use idempotency.eventId(...), idempotency.inputHash(...), or idempotency.commandId(...).",
  },
  repair: ({ dispatchNode }) =>
    gen.patch.addEdge(app.dispatch.edges.usesIdempotency, {
      dispatch: dispatchNode,
      idempotency: idempotency.inputHash(),
    }),
});

const repaired = checked.applyFixes({
  codes: ["dispatch.at_least_once.requires_idempotency"],
  mode: "candidate",
});
```

---

## Mental model

```txt
Authoring API
  friendly TypeScript builders, classes, kits, and recipes

Semantic graph
  one source of truth made of nodes, edges, and traits

Passes
  verify, derive, canonicalize, legalize, lower, emit

Targets
  Postgres, Effect, React, JSON-render, OpenAPI, Alchemy, tests, docs, graph, TypeScript

Artifacts
  generated implementation, docs, tests, migrations, deployment, devtools
```

---

## Non-goals

Gen2 is not trying to make the runtime graph a giant TypeScript type.

Gen2 is not trying to hide all complexity.

Gen2 is not trying to be an ORM, RPC framework, React framework, test framework, and deployment tool as separate products.

It is one semantic compiler with many projections.

---

## Project status

This README describes the target design for the new architecture.

The intended implementation path is:

```txt
1. Stable IDs, refs, symbol definitions
2. Typed node/edge/trait witnesses
3. Indexed graph store and graph views
4. Graph fragments and module composition
5. Dialect registry and pass pipeline
6. Structured diagnostics with remediation
7. Entity / field / type graph-native implementation
8. Requirement / provider / placement graph-native implementation
9. Query / action read-write edges
10. Reactivity and rule-derived invalidation
11. Forms/lists/UI generation
12. Storage and target legalization
13. Tests/docs/obligations
14. Versioning/migrations/evolution
15. Observability/privacy/AI import-export
```

---

## One-sentence summary

**Gen2 is Rails at the surface, MLIR in the middle, and TypeScript-native in the editor.**
