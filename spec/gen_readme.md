# Gen

**Gen** is a TypeScript-first domain compiler for building full-stack applications from typed, static, analyzable definitions.

Define your domain once — entities, fields, mappings, operations, queries, actions, forms, UI, reactivity, stores, runtimes, and policies — then generate the concrete code you need:

```txt
Database schemas
ORM models
Migrations
Typed queries
Typed mutators
API routes
RPC clients
OpenAPI documents
React/Vue/Svelte components
Forms
Optimistic UI
State management hooks
Atoms/signals/stores
Validation schemas
Tests
Dependency graphs
Devtools visualizations
```

Gen is not just a CRUD generator. It is a typed static IR for your app.

```txt
Schema tells us what exists.
Mappings tell us where data comes from.
Relations tell us how entities connect.
Functions tell us what reads and writes do.
Rules tell us what follows.
Reactivity tells us what must refresh.
Generators turn the graph into code.
```

---

## Why Gen?

Modern applications repeat the same facts everywhere:

```txt
Database schema
ORM schema
Validation schema
API schema
Client SDK
React hooks
Forms
Optimistic cache updates
Authorization checks
OpenAPI docs
Tests
```

Gen lets you model those facts once using typed static definitions.

```ts
const User = gen.entity("User", {
  id: gen.uuid(),
  email: gen.email(),
  displayName: gen.string(),
});
```

From this, Gen can infer types, generate code, track dependencies, derive invalidation, build forms, and check compatibility across runtimes and targets.

---

## Highlights

- **Type-safe entities and fields** with excellent inference.
- **Fields are not columns.** Domain fields can map to columns, expressions, queries, services, documents, caches, or aggregates.
- **Precise representations** under ergonomic semantic types.
- **Static expressions and functions**, not opaque runtime closures.
- **Typed operations** with laws and capabilities: pure, deterministic, reversible, associative, commutative, idempotent, effectful, transactional.
- **Multiple stores**: Postgres, SQLite, Mongo, Redis, ClickHouse, local storage, URL params, search indexes, blobs, and more.
- **First-class relations**, including relation entities / N-ary relations.
- **Generic CRUD factories** that expand into typed static functions.
- **Derived reactivity graph** from schemas, mappings, relations, actions, rules, and laws.
- **Manual reactivity keys** only when you need explicit external invalidation.
- **Optimistic UI** generated from static patch plans and operation laws.
- **Datalog-style rules** for derived facts, policies, IVM, subscriptions, and reactivity.
- **Typed UI IR** with slots, style handles, behaviors, platforms, and renderers.
- **Progressive enhancement** and graceful degradation built in.
- **Plugin architecture** via `createGen()`.

---

## Install

```bash
pnpm add @gen/core
```

Install the packages you want:

```bash
pnpm add \
  @gen/db \
  @gen/db-postgres \
  @gen/mapping \
  @gen/relations \
  @gen/crud \
  @gen/api \
  @gen/forms \
  @gen/ui \
  @gen/reactivity \
  @gen/drizzle \
  @gen/hono \
  @gen/react \
  @gen/zod \
  @gen/openapi
```

---

## Create a Gen context

Gen is plugin-driven. `createGen()` returns typed helpers based on the plugins you install.

```ts
import { createGen } from "@gen/core";
import { db } from "@gen/db";
import { postgres } from "@gen/db-postgres";
import { mapping } from "@gen/mapping";
import { relations } from "@gen/relations";
import { crud } from "@gen/crud";
import { api } from "@gen/api";
import { forms } from "@gen/forms";
import { ui } from "@gen/ui";
import { reactivity } from "@gen/reactivity";
import { drizzle } from "@gen/drizzle";
import { hono } from "@gen/hono";
import { react } from "@gen/react";
import { zod } from "@gen/zod";
import { openapi } from "@gen/openapi";

export const gen = createGen({
  plugins: [
    db({
      stores: {
        primary: postgres({ version: "16" }),
      },
      default: "primary",
    }),
    mapping(),
    relations(),
    crud(),
    api(),
    forms(),
    ui(),
    reactivity(),
    drizzle(),
    hono(),
    react(),
    zod(),
    openapi(),
  ],
});
```

If you do not install React, `gen.react` does not exist.

If your default DB is SQLite, Postgres-only helpers like `jsonb` or `gin` indexes do not exist.

---

## Define entities

Entities describe domain meaning.

They do not imply storage.

```ts
const User = gen.entity("User", {
  id: gen.uuid(),
  email: gen.email().traits([gen.traits.required(), gen.traits.unique()]),
  displayName: gen.string().traits([gen.traits.required(), gen.traits.minLength(1)]),
  role: gen.enumOf(["user", "admin"]),
  createdAt: gen.datetime(),
});

type UserValue = gen.InferEntity<typeof User>;
// {
//   id: string
//   email: string
//   displayName: string
//   role: "user" | "admin"
//   createdAt: Date
// }
```

Every field is a typed reference:

```ts
User.fields.id;
User.fields.email;
User.fields.displayName;
```

You use refs everywhere instead of magic strings.

---

## Semantic types and precise representations

Gen has ergonomic semantic types:

```ts
gen.uuid();
gen.email();
gen.money();
gen.datetime();
gen.string();
gen.int();
gen.json();
```

Under the hood, types can compile to precise physical and wire representations:

```ts
const Money = gen.type.derive(gen.repr.i64(), {
  name: "money",
  ts: gen.ts.number(),
  storageUnit: "cents",
  serialize: gen.expr(gen.ts.number(), (v) => gen.op.round(gen.op.mul(v, 100))),
  deserialize: gen.expr(gen.repr.i64(), (v) => gen.op.div(v, 100)),
  aggregateOn: "storage",
});
```

This means targets know whether a value is `i32`, `i64`, `f64`, fixed bytes, UTF-8 text, a tagged union, or a struct — not just “number” or “string.”

---

## Define storage separately

Fields are semantic. Tables and columns are physical.

```ts
const users = gen.db.primary.table("users", {
  id: gen.db.primary.column.uuid("id"),
  email: gen.db.primary.column.text("email"),
  firstName: gen.db.primary.column.text("first_name"),
  lastName: gen.db.primary.column.text("last_name"),
  role: gen.db.primary.column.text("role"),
  createdAt: gen.db.primary.column.timestamp("created_at"),
});
```

`User.fields.email` and `users.columns.email` are different refs.

---

## Map fields to storage, queries, and services

A domain field can be backed by one column, many columns, an expression, an aggregate, a document, a cache key, or a service call.

```ts
const FullName = gen.func.expr({
  name: "fullName",
  input: gen.object({
    first: gen.string(),
    last: gen.string(),
  }),
  returns: gen.string(),
  body: gen.expr(({ first, last }) => gen.op.concat(first, gen.literal(" "), last)),
  properties: [gen.cap.pure(), gen.cap.deterministic()],
});

const UserMap = gen.mapping.mapping(User, [
  gen.mapping.mapField(User.fields.id, {
    read: users.columns.id,
    write: users.columns.id,
  }),

  gen.mapping.mapField(User.fields.email, {
    read: users.columns.email,
    write: users.columns.email,
  }),

  gen.mapping.mapField(User.fields.displayName, {
    read: FullName.call({
      first: users.columns.firstName,
      last: users.columns.lastName,
    }),
    write: gen.mapping.split({
      into: {
        first: users.columns.firstName,
        last: users.columns.lastName,
      },
      using: FullName.inverse(),
    }),
  }),

  gen.mapping.mapField(User.fields.role, {
    read: users.columns.role,
    write: users.columns.role,
  }),

  gen.mapping.mapField(User.fields.createdAt, {
    read: users.columns.createdAt,
    write: users.columns.createdAt,
  }),
]);
```

Mappings drive read types, write types, CRUD, forms, validation, optimistic UI, and reactivity.

---

## Static expressions and functions

Portable logic in Gen is static and analyzable.

Use `gen.expr`, `gen.query`, `gen.action`, and `gen.patch` to build static IR.

Wrap reusable logic in `gen.func`.

```ts
const normalizeEmail = gen.func.expr({
  name: "normalizeEmail",
  input: gen.object({
    email: gen.email(),
  }),
  returns: gen.email(),
  body: gen.expr(({ email }) => gen.op.lower(gen.op.trim(email))),
  properties: [gen.cap.pure(), gen.cap.deterministic(), gen.law.claim.idempotent()],
});
```

The callback is only an authoring surface. Gen stores an AST, not a JS closure.

That AST can be compiled to SQL, TypeScript, validators, forms, policies, tests, diagrams, or runtime code.

---

## Query functions

A query function is a typed static read.

```ts
const getUser = gen.func.query({
  name: "getUser",
  input: gen.object({
    id: User.fields.id.type,
  }),
  returns: UserDetail,
  key: gen.expr(({ id }) => gen.key.entity(User, id)),
  body: gen.query(({ id }) =>
    gen.query.from(User).where(gen.op.eq(User.fields.id, id)).select(UserDetail).one(),
  ),
});
```

A query function can generate:

```txt
SQL / ORM queries
server handlers
RPC procedures
client SDK methods
React Query hooks
Effect atoms
OpenAPI operations
loading/error states
tests
```

---

## Action functions

An action function is a typed static write/effect.

```ts
const createUser = gen.func.action({
  name: "createUser",
  input: gen.object({
    email: User.fields.email.type,
    displayName: User.fields.displayName.type,
    role: User.fields.role.type,
  }),
  returns: UserDetail,
  body: gen.action(({ email, displayName, role }) =>
    gen.action
      .insert(User, {
        [User.fields.email]: normalizeEmail.call({ email }),
        [User.fields.displayName]: displayName,
        [User.fields.role]: role,
      })
      .returning(UserDetail),
  ),
  consistency: gen.consistency.transactional({
    store: gen.db.primary,
  }),
  errors: [
    gen.error.conflict("EmailAlreadyExists", {
      field: User.fields.email,
    }),
  ],
});
```

An action function can generate:

```txt
input validators
server handlers
transactions
SQL / ORM writes
field error mapping
client mutations
optimistic patches
cache invalidation
event emission
tests
```

---

## Projections

Projections describe named read shapes.

```ts
const UserSummary = gen.mapping.projection(User, {
  mapping: UserMap,
  fields: [User.fields.id, User.fields.displayName, User.fields.role],
});

const UserDetail = gen.mapping.projection(User, {
  mapping: UserMap,
  fields: [
    User.fields.id,
    User.fields.email,
    User.fields.displayName,
    User.fields.role,
    User.fields.createdAt,
  ],
});
```

Projections are used by queries, APIs, forms, tables, UI, OpenAPI, and clients.

---

## Generic CRUD

Gen can generate typed CRUD functions from entity metadata.

Generic CRUD is a macro over static functions. It does not bypass the analyzable model.

```ts
const userCrud = gen.crud(User, {
  id: User.fields.id,
  mapping: UserMap,
  projections: {
    list: UserSummary,
    detail: UserDetail,
  },
  operations: {
    getById: true,
    list: true,
    create: {
      input: [User.fields.email, User.fields.displayName, User.fields.role],
      optimistic: gen.optimistic.derive(),
    },
    update: {
      input: [
        User.fields.email.optional(),
        User.fields.displayName.optional(),
        User.fields.role.optional(),
      ],
      optimistic: gen.optimistic.derive(),
    },
    delete: true,
  },
});
```

This expands into typed functions:

```ts
userCrud.getById;
userCrud.list;
userCrud.create;
userCrud.update;
userCrud.delete;
```

Each function participates in:

```txt
mapping checks
policy checks
reactivity derivation
optimistic UI
IVM planning
route generation
client state generation
form generation
```

Runtime usage might look like:

```ts
await client.user.getById({ id });
await client.user.update({ id, displayName: "Ada" });
```

But the source is still typed static IR.

---

## Relations

Relations are semantic graph edges.

They are not just ORM config.

```ts
const Post = gen.entity("Post", {
  id: gen.uuid(),
  authorId: gen.uuid(),
  title: gen.string(),
  body: gen.string(),
});

const posts = gen.db.primary.table("posts", {
  id: gen.db.primary.column.uuid("id"),
  authorId: gen.db.primary.column.uuid("author_id"),
  title: gen.db.primary.column.text("title"),
  body: gen.db.primary.column.text("body"),
});

const PostAuthorName = gen.rel.name(Post, "author");
const UserPostsName = gen.rel.name(User, "posts");

const PostAuthor = gen.rel.manyToOne(PostAuthorName, {
  from: Post.fields.authorId,
  to: User.fields.id,
  inverse: UserPostsName,
  required: true,
  integrity: gen.rel.integrity.databaseForeignKey(),
  foreignKey: {
    onDelete: gen.rel.fk.restrict(),
    onUpdate: gen.rel.fk.cascade(),
    indexed: true,
  },
});
```

Relations can generate:

```txt
foreign keys
ORM relations
include types
nested DTOs
forms with relation selects
authorization ownership checks
reactivity dependencies
IVM dependencies
```

---

## Relation entities / N-ary relations

Not every relationship is binary.

Some relationships are domain concepts.

```ts
const Deal = gen.rel.entity("Deal", {
  roles: {
    buyer: gen.rel.role(Company),
    seller: gen.rel.role(Company),
    advisors: gen.rel.role(Advisor, { cardinality: "many" }),
  },
  fields: {
    amount: gen.money(),
    stage: gen.enumOf(["draft", "active", "closed"]),
  },
});
```

Relation entities are useful for memberships, employments, deals, ownerships, conflicts of interest, and other N-ary facts.

---

## Multiple stores

Gen supports multiple named stores.

```ts
const gen = createGen({
  plugins: [
    db({
      stores: {
        primary: postgres({ version: "16" }),
        analytics: clickhouse({ version: "24" }),
        documents: mongo({ version: "7" }),
        cache: redis({ version: "7" }),
      },
      default: "primary",
    }),
  ],
});
```

Each store exposes only the helpers its dialect supports.

```ts
const events = gen.db.analytics.table("events", {
  id: gen.db.analytics.column.string("id"),
  userId: gen.db.analytics.column.uuid("user_id"),
  type: gen.db.analytics.column.string("type"),
  timestamp: gen.db.analytics.column.datetime("timestamp"),
});

const profiles = gen.db.documents.collection("user_profiles", {
  userId: gen.db.documents.field.uuid("userId"),
  preferences: gen.db.documents.field.json("preferences"),
});
```

A single entity can read from many stores.

```ts
const UserRead = gen.mapping.read(User, [
  gen.mapping.mapField(User.fields.id, {
    read: users.columns.id,
  }),
  gen.mapping.mapField(User.fields.preferences, {
    read: profiles.fields.preferences,
  }),
  gen.mapping.mapField(User.fields.lastSeenAt, {
    read: gen.query
      .from(events)
      .select(gen.op.max(events.columns.timestamp))
      .where(gen.op.eq(events.columns.userId, users.columns.id)),
  }),
]);
```

Cross-store writes require explicit consistency.

```ts
const updatePreferences = gen.func.action({
  name: "updatePreferences",
  input: gen.object({
    id: User.fields.id.type,
    preferences: gen.json(),
  }),
  returns: UserDetail,
  body: gen.action(({ id, preferences }) =>
    gen.action
      .update(User)
      .where(gen.op.eq(User.fields.id, id))
      .set(User.fields.preferences, preferences)
      .returning(UserDetail),
  ),
  consistency: gen.consistency.eventual(),
});
```

Gen will not pretend cross-store transactions exist unless you configure a coordinator.

---

## Reactivity graph

Gen derives a reactivity graph from your static model.

It uses:

```txt
entities
mappings
relations
projections
query functions
action functions
rules
operation laws
store boundaries
optimistic patches
```

If an action inserts `Post`, Gen can infer that it affects:

```txt
Post collection queries
Post detail by id
User.posts relation
User.postCount aggregates
views/rules depending on Post
UI resources displaying those keys
```

You can add manual invalidation when dependencies are external or opaque.

```ts
const dashboardStatsKey = gen.key.family("dashboard.stats", {
  input: gen.object({}),
})

const createPost = gen.func.action({
  name: "createPost",
  input: CreatePostInput,
  returns: PostDetail,
  body: ...,
  reactivity: gen.reactivity.derive({
    infer: true,
    alsoInvalidates: gen.expr(({ result }) => [
      dashboardStatsKey(),
    ]),
  }),
})
```

Manual keys are typed values, not raw strings.

---

## Generate state management

From the same reactive graph, Gen can generate state management for different targets.

```ts
await gen.generate([
  gen.tanstackQuery.hooks([userCrud, postCrud]),
  gen.effectAtom.resources([userCrud, postCrud]),
  gen.svelte.stores([userCrud, postCrud]),
]);
```

TanStack Query output can include query keys, hooks, invalidation, optimistic updates, and rollback.

Effect Atom output can include atom families, function atoms, runtime atoms, reactivity keys, and pull atoms.

Svelte/Vue/Solid output can generate stores, composables, resources, or signals.

The source is always static functions and reactive keys.

---

## Optimistic UI

Optimistic UI is defined as a static patch plan.

```ts
const createPost = gen.func.action({
  name: "createPost",
  input: gen.object({
    title: Post.fields.title.type,
    body: Post.fields.body.type,
    authorId: Post.fields.authorId.type,
  }),
  returns: PostDetail,
  body: gen.action(({ title, body, authorId }) =>
    gen.action
      .insert(Post, {
        [Post.fields.title]: title,
        [Post.fields.body]: body,
        [Post.fields.authorId]: authorId,
      })
      .returning(PostDetail),
  ),
  optimistic: gen.patch(({ title, body, authorId }) =>
    gen.optimistic.insert(postCrud.list, {
      id: gen.optimistic.tempId(Post.fields.id),
      title,
      body,
      authorId,
    }),
  ),
  reconcile: gen.optimistic.reconcile({
    tempId: Post.fields.id,
    serverId: Post.fields.id,
  }),
  rollback: gen.optimistic.rollback.inverse(),
});
```

If Gen can derive a safe optimistic plan from the action body and operation laws, you can use:

```ts
optimistic: gen.optimistic.derive();
```

If it cannot prove rollback/reconciliation is safe, it emits a diagnostic and falls back to invalidate-and-refetch unless configured otherwise.

---

## Rules and IVM

Gen supports Datalog-style rules as an optional standard package.

Rules make derived facts explicit.

```ts
const IsPostAuthor = gen.rules.rule("IsPostAuthor", {
  input: {
    user: User,
    post: Post,
  },
  body: ({ user, post }) =>
    gen.rules.and(
      gen.rules.fact(Post, {
        id: post.id,
        authorId: user.id,
      }),
      gen.rules.fact(User, {
        id: user.id,
      }),
    ),
});
```

Rules can power policies:

```ts
const CanEditPost = gen.rules.rule("CanEditPost", {
  input: {
    actor: User,
    post: Post,
  },
  body: ({ actor, post }) =>
    gen.rules.or(gen.rules.eq(actor.role, "admin"), IsPostAuthor({ user: actor, post })),
});
```

Rules can define incrementally maintained views:

```ts
const UserPostCount = gen.rules.ivm("UserPostCount", {
  key: User.fields.id,
  value: gen.int(),
  body: ({ user }) =>
    gen.rules.aggregate.count(Post, {
      where: gen.op.eq(Post.fields.authorId, user.id),
    }),
  maintenance: gen.ivm.derive(),
});
```

Then `postCrud.create`, `postCrud.delete`, and `postCrud.update` can derive IVM deltas automatically:

```txt
insert Post(authorId = A) -> UserPostCount[A] += 1
delete Post(authorId = A) -> UserPostCount[A] -= 1
update Post.authorId A -> B -> A -= 1, B += 1
```

Rules can generate:

```txt
materialized views
incremental maintenance plans
reactivity invalidation
subscriptions
authorization predicates
search-index updates
visualization graphs
tests
```

---

## Forms from functions

Forms are generated from action functions.

```ts
const UserCreateForm = gen.forms.fromFunc(userCrud.create, {
  name: "UserCreateForm",
  fields: [
    gen.forms.field("email", {
      source: User.fields.email,
      widget: gen.forms.widgets.emailInput(),
      label: "Email",
    }),
    gen.forms.field("displayName", {
      source: User.fields.displayName,
      widget: gen.forms.widgets.textInput(),
      label: "Display name",
    }),
    gen.forms.field("role", {
      source: User.fields.role,
      widget: gen.forms.widgets.select({
        options: gen.forms.enumOptions(User.fields.role),
      }),
    }),
  ],
});
```

The form knows:

```txt
input type
field types
writable fields
client-safe validation
server-only validation
typed errors
loading state
optimistic behavior
fallback behavior
```

---

## UI IR, slots, styles, and behaviors

Generated UI targets `@gen/ui` first.

React, Vue, Svelte, Solid, TUI, and native renderers compile from the same UI IR.

Generated UI exposes typed slots instead of forcing you to fork generated files.

```ts
const UserCreateForm = gen.forms.fromFunc(userCrud.create, {
  slots: {
    root: gen.ui.Element.Form,
    emailField: gen.ui.Element.Field,
    emailLabel: gen.ui.Element.Text,
    emailInput: gen.ui.Element.TextInput,
    emailError: gen.ui.Element.Text,
    submitButton: gen.ui.Element.Interactive,
  },
  fields: [...],
})
```

Attach typed styles:

```ts
const BrandedForm = UserCreateForm.pipe(
  gen.ui.Style.attach({
    root: { gap: "md" },
    emailInput: { borderColor: "neutral" },
    emailError: { color: "danger" },
    submitButton: {
      backgroundColor: "primary",
      borderRadius: "full",
    },
  }),
);
```

Attach typed behaviors:

```ts
const EnhancedForm = BrandedForm.pipe(
  gen.ui.Behavior.attach(gen.forms.behaviors.submitOnEnter(), {
    form: "root",
    submit: "submitButton",
  }),
);
```

Style and behavior attachments are type-checked against slots and element capabilities.

---

## Progressive enhancement

Gen supports graceful degradation.

A generated web form can work without JavaScript, then progressively enhance to client validation, mutation hooks, optimistic UI, offline queue, or realtime subscriptions.

```ts
const UserCreateForm = gen.forms.fromFunc(userCrud.create, {
  enhancement: gen.enhancement.progressive({
    baseline: gen.forms.baseline.htmlPost({
      action: gen.api.path`/users`,
      method: "POST",
    }),
    enhanced: gen.forms.enhanced.clientMutation({
      optimistic: gen.optimistic.derive(),
      validation: "client-and-server",
    }),
    fallback: gen.forms.fallback.serverRedirect({
      success: gen.nav.to("/users"),
      failure: gen.nav.samePageWithErrors(),
    }),
  }),
});
```

A target can choose the best supported tier:

```txt
Tier 0: static/read-only
Tier 1: server forms
Tier 2: enhanced client forms
Tier 3: reactive client state
Tier 4: optimistic/offline
Tier 5: realtime/collaborative
```

If a target lacks a capability, Gen picks a fallback or emits a diagnostic.

---

## Authorization

Policies are typed and can use fields, relations, functions, and rules.

```ts
const UserPolicy = gen.authz.policy(User, {
  read: gen.authz.allow.authenticated(),
  create: gen.authz.allow.role("admin"),
  update: gen.authz.allow.owner(User.fields.id).or(gen.authz.allow.role("admin")),
  delete: gen.authz.allow.role("admin"),
});

const PostPolicy = gen.authz.policy(Post, {
  read: gen.authz.allow.public(),
  update: CanEditPost({
    actor: gen.auth.currentUser(),
    post: gen.authz.resource(Post),
  }),
});
```

Policies can generate:

```txt
server checks
SQL predicates where possible
route middleware
tests
docs
diagnostics when not translatable
```

---

## Generate APIs, clients, forms, and schemas

Expose functions through APIs:

```ts
const UserResource = gen.api.resource(User, {
  path: gen.api.route`/users`,
  operations: [
    gen.api.get({
      path: gen.api.path`/:id`,
      func: userCrud.getById,
    }),
    gen.api.get({
      path: gen.api.path`/`,
      func: userCrud.list,
    }),
    gen.api.post({
      path: gen.api.path`/`,
      func: userCrud.create,
    }),
    gen.api.patch({
      path: gen.api.path`/:id`,
      func: userCrud.update,
    }),
    gen.api.delete({
      path: gen.api.path`/:id`,
      func: userCrud.delete,
    }),
  ],
});
```

Generate artifacts:

```ts
await gen.generate([
  gen.drizzle.schema(
    gen.db.primary.schema({
      tables: [users, posts],
      relations: [PostAuthor],
    }),
  ),

  gen.hono.routes(UserResource, {
    runtime: gen.runtimes.node20,
  }),

  gen.openapi.document(UserResource),

  gen.zod.schemas([User, Post]),

  gen.react.component(UserCreateForm, {
    runtime: gen.runtimes.browserModern,
  }),

  gen.tanstackQuery.hooks([userCrud]),

  gen.effectAtom.resources([userCrud]),
]);
```

---

## Devtools and visualization

Because Gen definitions are static, the compiler can visualize your app.

Generate graphs for:

```txt
entity relationships
field mappings
query dependencies
action writes
reactivity invalidation
optimistic patches
IVM deltas
runtime boundaries
UI requirements
policy dependencies
```

Example graph:

```txt
createPost
  writes Post.title, Post.body, Post.authorId
  creates Post:{id}
  invalidates Post.collection
  invalidates User.posts:{authorId}
  increments UserPostCount:{authorId}
  patches listPosts optimistically
  emits PostCreated
```

This can power docs, devtools, tests, diagrams, and debugging UIs.

---

## Graceful target compatibility

Targets are checked before generation.

Examples:

```txt
Drizzle target supports Postgres/MySQL/SQLite schemas, not Mongo collections.
React target supports React-compatible UI IR.
Static HTML target supports server forms but not optimistic client patches.
Browser runtime cannot run server-only effects.
Postgres runtime cannot execute opaque JS transforms.
```

Diagnostics are structured:

```txt
ERROR react:component-slot-mismatch
  Behavior submitOnEnter requires Element.Interactive for slot "submit".
  Provided slot "emailInput" is Element.TextInput.

WARNING enhancement:optimistic-fallback
  createPost requested optimistic UI, but rollback cannot be derived.
  Falling back to invalidate-and-refetch.

ERROR runtime:unsupported-operation
  normalizeAvatarUrl has only a Node implementation.
  Cannot run it in Postgres.
```

---

## Direct imports

`createGen()` is recommended for applications.

Library authors can import primitives directly:

```ts
import { entity, uuid, string, func, expr } from "@gen/core";
```

---

## Philosophy

Gen is built around a small set of ideas:

```txt
1. Model facts once.
2. Prefer typed references over strings.
3. Keep domain fields separate from physical storage.
4. Make portable logic static and analyzable.
5. Derive as much as possible from schemas, mappings, relations, functions, rules, and laws.
6. Use manual annotations only for opaque boundaries.
7. Generate concrete code through plugins.
8. Check capabilities before generating.
9. Prefer progressive enhancement and graceful fallback.
10. Never force one ORM, database, framework, or state library.
```

The result is a system where one typed source of truth can generate the boring parts of an application while leaving you room to customize the domain-specific parts.

---

## Status

Gen is a design for a typed domain compiler and plugin ecosystem.

The examples in this README assume the full feature set is implemented.
