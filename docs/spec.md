# Typed Domain Compiler Library — v2.1 Design Specification

## 0. Purpose

This document describes the v2 design for a TypeScript-first domain compiler library.

The goal is to find the best primitives for defining semantic domain models, typed operations, runtimes, storage mappings, relations, APIs, forms, components, and generation targets in a way that is:

- highly inferable
- composable
- plugin-driven
- framework-agnostic
- database-agnostic
- runtime-aware
- suitable for generating large parts of real applications
- not tied to one ORM, database, frontend framework, or backend framework

The library should not be designed as a giant CRUD generator. It should be designed as a small typed kernel plus official and third-party extension packages.

The central idea:

```txt
Core gives us typed references, semantic types, precise representations, staged expressions, static functions, operations, runtimes, diagnostics, artifacts, and plugin contracts.

Official packages define traits, relations, storage, mapping, APIs, forms, components, policies, events, and optional reactive/fact-log systems.

Adapters generate concrete code for databases, ORMs, frameworks, validators, SDKs, UI libraries, deployments, and tools.
```

Important v2.1 addition:

```txt
Semantic types are ergonomic domain concepts.
Representations are precise physical/wire layouts.
Expressions are static typed ASTs, not runtime closures.
```

This means `gen.money()` can be ergonomic at the call site while still compiling down to an exact storage representation such as signed 64-bit integer cents, with explicit serialization/deserialization expressions.

## v2.2 UI Update

Add a standard UI IR package inspired by AF-UI:

```txt
@gen/ui
  Element capabilities
  View<Slots>
  Component<Props, Req, E, Bindings, Slots>
  Style
  Behavior
  Theme / typed tokens
  Renderer
  Platform
  Slot remapping
  Collection slots
```

Forms and generated components should target `@gen/ui` first.
React, Vue, Svelte, Solid, React Native, TUI, and other renderers should compile `@gen/ui` into concrete platform output.

Generated UI should not be sealed framework code. It should expose typed structure, style handles, and behavior attachment points so users can customize it without forking generated files.

The primary user-facing entry point should be:

```ts
const gen = createGen({
  plugins: [...],
})
```

`createGen()` returns a typed context whose helpers, runtimes, stores, targets, metadata namespaces, and generators are determined by installed plugins.

---

# 1. Design Principles

## 1.1 Semantic First

Entities and fields describe domain meaning, not storage.

```ts
const User = gen.entity("User", {
  id: gen.uuid(),
  email: gen.email(),
  displayName: gen.string(),
  postCount: gen.int(),
});
```

This does not imply that `User` is stored in one table, one collection, one service, or one ORM model.

`User.fields.displayName` might be backed by `first_name + last_name`.

`User.fields.postCount` might be backed by an aggregate query.

`User.fields.avatarUrl` might be backed by a server-side service call.

## 1.2 References Over Strings

Use typed references wherever possible.

Prefer:

```ts
primaryKey: users.columns.id;
by: User.fields.id;
input: [User.fields.email, User.fields.displayName];
include: [PostAuthor];
```

Avoid:

```ts
primaryKey: "id";
by: "id";
input: ["email", "displayName"];
include: ["author"];
```

Strings remain appropriate only when declaring names at boundaries:

```ts
gen.entity("User", ...)
gen.db.primary.table("users", ...)
gen.db.primary.column.text("email")
gen.rel.name(Post, "author")
gen.api.route`/users/${User.fields.id}`
```

After declaration, code should use typed references.

## 1.3 Normal Functions First

The primary API should use plain functions and values.

```ts
const User = gen.entity(...)
const UserMap = gen.mapping.mapping(User, [...])
const getUser = gen.api.getter(User, {...})
```

Builder/fluent APIs may exist as optional sugar, but should not be the foundation.

## 1.4 Plugin-Driven, Not Global

Users should not rely on global mutable registration.

Prefer:

```ts
const gen = createGen({
  plugins: [
    relations(),
    mapping(),
    api(),
    forms(),
    db({ stores: { primary: postgres() } }),
    drizzle(),
    hono(),
    react(),
  ],
});
```

Avoid:

```ts
registerPlugin(postgres());
registerPlugin(react());
```

A `gen` context must be deterministic, testable, isolated, and type-safe.

## 1.5 Core Should Be Small

Core should not contain React, Vue, Prisma, Drizzle, Postgres, Hono, pages, deployment, search, jobs, file uploads, or auth providers.

Core should provide the typed substrate that makes those packages possible.

## 1.6 Runtimes Are First-Class

An operation being meaningful does not mean it can run everywhere.

```txt
Operation: what this means
Runtime: where/how this can execute
Target: what code/artifact to generate
```

Runtimes must be modeled explicitly.

## 1.7 Stores Are First-Class

Applications may use one database or many stores.

A semantic entity may be backed by:

- Postgres
- SQLite
- MongoDB
- Redis
- ClickHouse
- S3/R2/GCS
- search indexes
- external APIs
- services
- event logs
- computed queries

Multi-store apps should be supported without pretending cross-store transactions or cross-store foreign keys are automatic.

## 1.8 Adapters Should Not Own Semantics

ORM/database/framework adapters should interpret semantic models, mappings, operations, representations, and relations. They should not own the core domain model.

## 1.9 Precise Representations Under Semantic Types

A semantic type like `gen.int()`, `gen.money()`, or `gen.timestamp()` must not be vague.

The library should distinguish:

```txt
Semantic type: what the value means in the domain.
TypeScript type: how the value appears in generated TS.
Storage representation: how the value is stored physically.
Wire encoding: how the value serializes over a transport/binary protocol.
```

Examples:

```txt
gen.int()       -> semantic integer, usually backed by repr.i32()
gen.money()     -> semantic money, possibly backed by repr.i64() cents
gen.timestamp() -> semantic timestamp, possibly backed by repr.i64() microseconds
gen.uuid()      -> semantic UUID, possibly backed by repr.fixedBytes(16)
```

This lets engines and adapters reason about byte width, signedness, overflow, comparison behavior, index behavior, serialization, aggregation correctness, and cross-language compatibility.

## 1.10 Static ASTs, Not Closures, in Portable Definitions

Portable schema-critical definitions should be static expression trees, not JavaScript closures.

Allowed:

```ts
const Slug = gen.type.derive(gen.string(), {
  serialize: gen.expr(gen.string(), (s) => gen.op.replace(gen.op.lower(gen.op.trim(s)), " ", "-")),
});
```

Discouraged or non-portable:

```ts
const Slug = gen.type.derive(gen.string(), {
  serialize: (s) => slugify(s),
});
```

If arbitrary JS is needed, it must be explicit:

```ts
serialize: gen.opaque.js({
  runtime: gen.runtimes.node20,
  fn: slugify,
});
```

Then the planner knows it cannot compile that transform to SQL, WASM, a database check constraint, or a static client validator unless an implementation exists.

## 1.11 TypeScript as Meta-Language, Gen Expressions as Object-Language

The API may use TypeScript callback syntax for ergonomics, but those callbacks run once at definition time to build expression trees.

```txt
TypeScript is the authoring/meta-language.
Gen expression trees are the portable object-language.
Targets compile expression trees to SQL, TypeScript, Rust, WASM, validators, query plans, forms, and runtime code.
```

This staged model should be used consistently across type transforms, validation traits, mappings, queries, permissions, mutators, rules, and projections.

## 1.12 Generated UI Should Be Inside-Out

Generated UI should separate:

```txt
View      = structure and typed slots
Style     = appearance attached to slots
Behavior  = interaction attached to slots
Renderer  = converts abstract UI tree to host output
Platform  = element vocabulary, event system, renderer, and host capabilities
```

Generated forms/components should not be black-box JSX or template files with hardcoded class strings.

They should expose named typed slots:

```txt
root
label
input
error
submitButton
rows
cells
```

Styles and behaviors attach to those slots from the outside.

This avoids generated-file forking and lets design-system packages override appearance/behavior safely.

## 1.13 UI Slots Are Refs With Capabilities

UI slots should behave like typed refs.

```txt
FieldRef      -> typed domain field
RelationRef   -> typed relation
SlotRef       -> typed UI attachment point
```

A slot knows:

```txt
slot name
element capability
owning view/component
allowed attributes
allowed events
platform requirements
metadata/style handles
```

Behaviors and styles should attach only to compatible slots.

Example:

```ts
gen.ui.Behavior.attach(pressBehavior, {
  target: "submitButton",
});
```

should type-check only if `submitButton` satisfies `Element.Interactive`.

## 1.14 UI Source Is Platform-Agnostic

The standard UI representation should not be Web-DOM-specific.

The same generated form/view should be compilable to:

```txt
React DOM
Vue
Svelte
Solid
React Native
Terminal UI
static HTML where possible
server components where possible
```

Platform packages define available tags, events, attributes, renderer behavior, and capability mappings.

---

# 2. Package Layers

## 2.1 Core Kernel

`@gen/core` should provide:

```txt
createGen()
definePlugin()
semantic type system
precise representation system
staged expression system
entity and field refs
general typed ref protocol
operation/effect/law/capability model
runtime abstraction
requirement/compatibility model
metadata/annotation protocol
diagnostics protocol
generated artifact IR
target/plugin contracts
dependency graph/check/generate lifecycle contracts
inference helper types
```

## 2.2 Official Standard Packages

Official but optional packages:

```txt
@gen/traits
  reusable validation, storage, behavior, privacy, and UI traits

@gen/relations
  relation refs, graph, includes, FK/app deletion semantics

@gen/storage or @gen/db
  stores, database abstractions, tables, columns, collections, indexes

@gen/mapping
  field mappings, read/write mappings, projections, dependency tracking

@gen/api
  getters, mutators, resources, route contracts

@gen/forms
  portable form IR, widgets, layout, submit contracts

@gen/components
  portable component contracts

@gen/ui
  platform-agnostic UI IR, element capabilities, views, slots, styles,
  behaviors, typed tokens, renderers, platforms, slot remapping, collections

@gen/authz
  policies, ownership, relation-aware authorization

@gen/events
  events, reducers, outbox, subscriptions

@gen/cli
  check/generate/watch/diff/doctor
```

These are not kernel core, but they are part of the recommended standard distribution.

`@gen/forms` and `@gen/components` should build on `@gen/ui`.

Framework packages such as `@gen/react`, `@gen/vue`, `@gen/svelte`,
`@gen/native`, and `@gen/tui` should target `@gen/ui`, not invent
separate form/component abstractions.

## 2.3 Adapter Packages

Official or third-party adapters:

```txt
@gen/db-postgres
@gen/db-mysql
@gen/db-sqlite
@gen/db-mongo
@gen/db-redis
@gen/db-clickhouse

@gen/drizzle
@gen/prisma
@gen/kysely
@gen/mongoose
@gen/convex

@gen/hono
@gen/express
@gen/fastify
@gen/next
@gen/remix

@gen/react
@gen/vue
@gen/svelte
@gen/solid
@gen/react-native
@gen/tui
@gen/web
@gen/static-html

@gen/zod
@gen/valibot
@gen/arktype
@gen/json-schema
@gen/openapi
@gen/graphql
```

## 2.4 App-Level Packages

Mostly third-party or later official packages:

```txt
pages
layouts
navigation
auth providers
client caches
jobs/schedules
file uploads
search indexes
deployment
observability
admin dashboards
design systems
fixtures/seeds
API versioning
```

These should not be kernel core. They should build on the standard extension surface.

---

# 3. `createGen()`

## 3.1 Purpose

`createGen()` creates a typed generation context.

It solves:

```txt
plugin registration
typed helper availability
typed runtime catalogs
typed store catalogs
typed target catalogs
metadata namespace availability
operation implementation availability
adapter-specific helper availability
project configuration
check/generate lifecycle
```

## 3.2 Basic Usage

```ts
import { createGen } from "@gen/core";
import { relations } from "@gen/relations";
import { mapping } from "@gen/mapping";
import { api } from "@gen/api";
import { forms } from "@gen/forms";
import { db } from "@gen/db";
import { postgres } from "@gen/db-postgres";
import { drizzle } from "@gen/drizzle";
import { hono } from "@gen/hono";
import { react } from "@gen/react";

export const gen = createGen({
  plugins: [
    relations(),
    mapping(),
    api(),
    forms(),
    db({
      stores: {
        primary: postgres({ version: "16" }),
      },
      default: "primary",
    }),
    drizzle(),
    hono(),
    react(),
  ],
});
```

Then:

```ts
const User = gen.entity("User", {
  id: gen.uuid(),
  email: gen.email(),
  displayName: gen.string(),
});
```

## 3.3 Typed Helper Availability

If React is not installed, this should not exist:

```ts
gen.react.form(...)
```

If the DB plugin is not installed, this should not exist:

```ts
gen.db.primary.table(...)
```

If Postgres is not the configured dialect, Postgres-specific helpers should not exist.

Example:

```ts
const gen = createGen({
  plugins: [db({ stores: { primary: sqlite() }, default: "primary" })],
});

// okay
gen.db.primary.column.text("name");

// should not exist
gen.db.primary.column.jsonb("metadata");
```

## 3.4 Single Store Convenience

For single-store apps, this:

```ts
const gen = createGen({
  plugins: [db({ dialect: postgres({ version: "16" }) })],
});
```

is sugar for:

```ts
const gen = createGen({
  plugins: [
    db({
      stores: { default: postgres({ version: "16" }) },
      default: "default",
    }),
  ],
});
```

It exposes:

```ts
gen.db.table(...)
gen.db.column.uuid(...)
```

as a convenience alias for the default store.

## 3.5 Multiple Stores

For multi-store apps:

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

The context exposes:

```ts
gen.db.primary;
gen.db.analytics;
gen.db.documents;
gen.db.cache;
```

Each store is typed by its own dialect/capabilities.

```ts
const users = gen.db.primary.table("users", {
  id: gen.db.primary.column.uuid("id"),
  email: gen.db.primary.column.text("email"),
});

const events = gen.db.analytics.table("events", {
  id: gen.db.analytics.column.string("id"),
  userId: gen.db.analytics.column.uuid("user_id"),
  type: gen.db.analytics.column.string("type"),
});

const profiles = gen.db.documents.collection("user_profiles", {
  userId: gen.db.documents.field.uuid("userId"),
  preferences: gen.db.documents.field.json("preferences"),
});

const sessions = gen.db.cache.keyspace("sessions", {
  key: gen.db.cache.key.string(),
  value: gen.db.cache.value.json(),
});
```

## 3.6 Plugin Dependencies

Plugins may declare dependencies.

```ts
const drizzle = definePlugin({
  id: "drizzle",
  requires: ["db"],
  setup(ctx) {
    ...
  },
})
```

If missing, `createGen()` should produce a diagnostic.

## 3.7 Plugin Namespace Conflicts

Two plugins cannot register the same helper namespace unless explicitly composed.

```ts
createGen({
  plugins: [reactA(), reactB()],
});
```

should produce a diagnostic:

```txt
Duplicate helper namespace: react
```

## 3.8 Direct Imports

Direct imports remain available for library authors and advanced users.

```ts
import { entity, uuid, op, runtime } from "@gen/core";
```

But documentation should favor `createGen()`.

---

# 4. Plugin Contract

## 4.1 `definePlugin()`

Conceptual API:

```ts
export function definePlugin<
  const Id extends string,
  Helpers,
  Targets,
  Runtimes,
  Metadata,
>(plugin: {
  id: Id;
  requires?: readonly string[];
  setup(ctx: PluginContext): {
    helpers?: Helpers;
    targets?: Targets;
    runtimes?: Runtimes;
    metadata?: Metadata;
    diagnostics?: DiagnosticDefinition[];
  };
}): GenPlugin<Id, Helpers, Targets, Runtimes, Metadata>;
```

## 4.2 Plugin Context

`PluginContext` provides access to:

```txt
core constructors
registered refs
registered metadata namespaces
runtime registry
target registry
diagnostic factory
artifact factory
requirement/capability helpers
```

## 4.3 Plugin Contributions

A plugin may contribute:

```txt
helpers
targets
runtimes
stores
operations
metadata namespaces
diagnostic definitions
checks
codegen hooks
artifact transforms
```

## 4.4 Target Contract

```ts
type Target<Input, Options = unknown> = {
  name: string;
  accepts(input: unknown): input is Input;
  check(input: Input, options: Options, ctx: CheckContext): Diagnostic[];
  generate(input: Input, options: Options, ctx: GenerateContext): GenerateResult;
};
```

## 4.5 Generate Result

```ts
type GenerateResult = {
  artifacts: GeneratedArtifact[];
  diagnostics: Diagnostic[];
  dependencies?: PackageDependency[];
};
```

---

# 5. Core Reference Protocol

## 5.1 Purpose

All major concepts should use a common typed reference protocol.

Core owns the protocol so plugins interoperate.

Examples:

```txt
EntityRef
FieldRef
RelationRef
OperationRef
RuntimeRef
StoreRef
MappingRef
ProjectionRef
GetterRef
MutatorRef
FormRef
ComponentRef
SlotRef
StyleRef
BehaviorRef
PlatformRef
RendererRef
```

Not all concrete concepts must live in core, but the ref protocol must.

UI packages should implement slots as refs under the core ref protocol.
That allows diagnostics, metadata, requirements, and dependency tracking to
work consistently across domain and UI layers.

## 5.2 Conceptual Type

```ts
type Ref<Kind extends string, Owner, const Name extends string, Value, Meta = {}> = {
  readonly kind: Kind;
  readonly owner: Owner;
  readonly name: Name;
  readonly value: Value;
  readonly meta: Meta;
  readonly symbol: unique symbol;
};
```

## 5.3 Requirements

Refs must support:

```txt
stable identity
display names
dependency tracking
diagnostics paths
metadata attachment
source location where possible
value inference
ownership inference
```

---

# 6. Metadata and Annotation Protocol

## 6.1 Namespaced Metadata

Core should support typed metadata namespaces.

```ts
const uiLabel = gen.metadata.key<"ui:label", string>("ui:label");
const pii = gen.metadata.key<"privacy:pii", boolean>("privacy:pii");

const User = gen.entity("User", {
  email: gen.email().meta([gen.meta(uiLabel, "Email"), gen.meta(pii, true)]),
});
```

## 6.2 Plugin Metadata

Plugins may define metadata namespaces:

```ts
const formsPlugin = definePlugin({
  id: "forms",
  setup(ctx) {
    return {
      metadata: {
        label: ctx.metadata.key<"forms:label", string>("forms:label"),
        placeholder: ctx.metadata.key<"forms:placeholder", string>("forms:placeholder"),
      },
    };
  },
});
```

Metadata should not force core to know about UI, privacy, OpenAPI, search, or auth.

---

# 7. Diagnostics

## 7.1 Diagnostic Type

Core owns structured diagnostics.

```ts
type Diagnostic = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  path?: DiagnosticPath;
  refs?: AnyRef[];
  suggestion?: string;
};
```

## 7.2 Diagnostic Requirements

Diagnostics must be:

```txt
structured
machine-readable
namespaced by package
attached to refs where possible
shown during check and generate
usable by CLI and editor tooling
```

Example codes:

```txt
core:duplicate-ref
core:plugin-missing-dependency
relations:invalid-set-null
mapping:incompatible-field-column
api:readonly-field-in-mutator-input
runtime:unsupported-operation
react:component-prop-mismatch
drizzzle:unsupported-store-dialect
```

---

# 8. Generated Artifact IR

## 8.1 Artifact Type

Core should define generated artifacts.

```ts
type GeneratedArtifact =
  | GeneratedFile
  | GeneratedDirectory
  | PackageDependency
  | RuntimeCommand
  | MigrationArtifact;
```

Minimum file type:

```ts
type GeneratedFile = {
  path: string;
  content: string;
  kind: "source" | "test" | "schema" | "migration" | "config" | "asset";
  language?: string;
  diagnostics?: Diagnostic[];
};
```

## 8.2 Write Policy

Targets should return artifacts. The CLI or caller decides how to write them.

This supports:

```txt
dry runs
formatting
conflict detection
virtual files
editor previews
monorepos
custom write policies
```

---

# 9. Representations and Semantic Types

## 9.1 Purpose

Semantic types describe value meaning.

Representations describe precise physical and/or wire layout.

This distinction is essential. A vague `number` type is not enough for engines, stores, wire protocols, indexes, aggregators, or cross-language codegen. The system should know whether a number is `i32`, `u64`, `f64`, fixed-point cents, basis points, or something else.

## 9.2 Representation Primitives

Core should provide a precise representation layer.

```ts
gen.repr.u8();
gen.repr.u16();
gen.repr.u32();
gen.repr.u64();
gen.repr.u128();

gen.repr.i8();
gen.repr.i16();
gen.repr.i32();
gen.repr.i64();
gen.repr.i128();

gen.repr.f32();
gen.repr.f64();

gen.repr.bool();

gen.repr.text({
  encoding: "utf8",
  lengthPrefix: "u32-le",
});

gen.repr.fixedString(2);
gen.repr.bytes({ lengthPrefix: "u32-le" });
gen.repr.fixedBytes(16);
```

A representation should capture:

```txt
byte width
signedness
range where known
floating-point format
text encoding
length prefix format
fixed vs variable layout
endianness where relevant
comparison semantics
index semantics
aggregation semantics
wire format
TypeScript representation hints
```

Conceptual type:

```ts
type Representation<Ts = unknown, Wire = unknown> = {
  kind: "representation";
  name: string;
  ts: Ts;
  wire: Wire;
  layout?: LayoutSpec;
  compare?: CompareSemantics;
  aggregate?: AggregateSemantics;
  metadata?: Metadata[];
};
```

## 9.3 Compound Representations

Core should support precise compound value representations.

```ts
gen.repr.optional(inner, {
  tag: gen.repr.u8(),
});

gen.repr.array(inner, {
  lengthPrefix: "u32-le",
});

gen.repr.set(inner, {
  lengthPrefix: "u32-le",
});

gen.repr.map(key, value, {
  lengthPrefix: "u32-le",
});

gen.repr.struct("Coordinates", {
  lat: gen.repr.f64(),
  lng: gen.repr.f64(),
});

gen.repr.tagged("Notification", {
  taskAssigned: gen.repr.struct({
    taskId: gen.repr.u64(),
    assigneeName: gen.repr.text({ encoding: "utf8", lengthPrefix: "u32-le" }),
  }),
  commentAdded: gen.repr.struct({
    taskId: gen.repr.u64(),
    body: gen.repr.text({ encoding: "utf8", lengthPrefix: "u32-le" }),
  }),
});
```

The representation layer should be general. A SpacetimeDB adapter may map it to SATS/BSATN. A Postgres adapter may map it to SQL column types. A JSON Schema adapter may map it to JSON-compatible contracts. Core should not be tied to any one engine.

## 9.4 Semantic Types Built From Representations

Semantic types should be built from precise representations.

```ts
const Money = gen.type.derive(gen.repr.i64(), {
  name: "money",
  ts: gen.ts.number(),
  storageUnit: "cents",
  serialize: gen.expr(gen.ts.number(), (v) => gen.op.round(gen.op.mul(v, 100))),
  deserialize: gen.expr(gen.repr.i64(), (v) => gen.op.div(v, 100)),
  validate: gen.expr(gen.ts.number(), (v) => gen.op.gte(v, 0)),
  aggregateOn: "storage",
});
```

Conceptual type:

```ts
type GenType<Ts, Storage, Wire = Storage> = {
  kind: "type";
  name: string;
  ts: Ts;
  storage: Storage;
  wire: Wire;
  serialize?: Expr<Ts, Storage>;
  deserialize?: Expr<Storage, Ts>;
  validate?: Expr<Ts, boolean>;
  aggregateOn?: "semantic" | "storage";
  metadata?: Metadata[];
};
```

`aggregateOn: "storage"` matters for types like money, where summing integer cents is correct while summing floating display values may accumulate rounding error.

## 9.5 Ergonomic Type Layer

Core should include common semantic types:

Core should include common semantic types:

```ts
gen.uuid()
gen.string()
gen.email()
gen.url()
gen.int()
gen.decimal()
gen.boolean()
gen.datetime()
gen.date()
gen.json()
gen.array(type)
gen.object({...})
gen.enumOf([...])
gen.literal(value)
gen.brand("UserId", gen.uuid())
```

## 9.6 Type Inference

```ts
const User = gen.entity("User", {
  id: gen.uuid(),
  role: gen.enumOf(["user", "admin"]),
});

type UserValue = InferEntity<typeof User>;
// {
//   id: string
//   role: "user" | "admin"
// }
```

## 9.7 Target-Specific Representation Mapping

`gen.uuid()` may have a canonical semantic representation such as fixed 16-byte data plus UUID formatting rules, but each target may still map it differently:

```txt
TypeScript: string
Postgres: uuid or bytea depending policy
SQLite: text or blob
MongoDB: ObjectId or string depending policy
JSON Schema: string with format uuid
GraphQL: ID
SpacetimeDB: SATS-compatible fixed bytes / UUID representation
```

Core should define the representation protocol. Runtimes and targets declare supported mappings.

## 9.8 Inline Product and Sum Types

Not every structured value should become an entity. Core should support inline product and sum types.

```ts
const Coordinates = gen.struct("Coordinates", {
  lat: gen.f64(),
  lng: gen.f64(),
});

const Color = gen.struct("Color", {
  r: gen.u8(),
  g: gen.u8(),
  b: gen.u8(),
  a: gen.u8(),
});

const Notification = gen.tagged("Notification", {
  taskAssigned: gen.struct({
    taskId: gen.uuid(),
    assigneeName: gen.string(),
  }),
  commentAdded: gen.struct({
    taskId: gen.uuid(),
    body: gen.string(),
  }),
});
```

Distinction:

```txt
Entity: identity-bearing domain object.
Struct: inline product value.
Tagged: inline sum/discriminated-union value.
Relation: semantic graph edge or relation entity.
```

---

# 10. Entities and Fields

## 10.1 Entity Definition

```ts
const User = gen.entity("User", {
  id: gen.uuid(),
  email: gen.email(),
  displayName: gen.string(),
  role: gen.enumOf(["user", "admin"]),
  createdAt: gen.datetime(),
});
```

## 10.2 Entity Conceptual Type

```ts
type Entity<const Name extends string, const Fields extends FieldShape, Meta = {}> = {
  kind: "entity";
  name: Name;
  fields: FieldRefs<Name, Fields>;
  shape: Fields;
  meta: Meta;
};
```

## 10.3 Field Refs

```ts
User.fields.id;
User.fields.email;
User.fields.displayName;
```

A field ref knows:

```txt
owning entity
field name
semantic type
value type
nullability
optionality
default behavior
metadata
```

## 10.4 Inference Helpers

Core exports:

```ts
type InferType<T> = ...
type InferEntity<E> = ...
type InferField<F> = ...
type FieldOwner<F> = ...
type FieldName<F> = ...
type FieldValue<F> = ...
type IsNullable<F> = ...
type IsOptional<F> = ...
type RefKind<R> = ...
type RefValue<R> = ...
```

---

# 11. Staged Expressions, Operations, Laws, Capabilities, and Effects

## 11.1 Purpose

Expressions are static typed ASTs.

Operations are typed behavior nodes used to build those ASTs.

They may operate on:

```txt
primitive values
semantic types
entity fields
entities
relations
queries
mappings
effects
events
reducers
mutators
getters
```

## 11.2 `expr()`

Core should provide staged expression builders.

```ts
gen.expr(type, (input) => expr);

gen.expr.inputs(
  {
    start: gen.datetime(),
    end: gen.datetime(),
  },
  ({ start, end }) => gen.op.isAfter(end, start),
);
```

The callback runs once at definition time. It receives typed placeholders and returns an expression tree. It is not stored as a runtime closure.

Example:

```ts
const Positive = gen.trait("positive", {
  validate: gen.expr(gen.int(), (v) => gen.op.gt(v, 0)),
});
```

This should fail:

```ts
gen.expr(gen.int(), (v) => gen.op.lower(v));
// type error: lower expects string expression
```

Conceptual expression node:

```ts
type Expr<T, Requirements = never, Effects = never> = {
  kind: "expr";
  value: T;
  requirements: Requirements;
  effects: Effects;
  ast: ExprAstNode;
};
```

## 11.3 Expression Phases

Expressions should be phase-aware.

```txt
schema expressions:
  validation, type transforms, storage transforms
  must be fully static and portable
  no opaque JS by default

query expressions:
  predicates, projections, joins, aggregates
  may depend on store/runtime capabilities

mutation expressions:
  state changes and effects
  may include effect requirements

client expressions:
  must be client-safe

server expressions:
  may use server/runtime effects
```

Opaque/runtime-specific behavior must be explicit.

```ts
gen.opaque.js({
  runtime: gen.runtimes.node20,
  fn: customNormalize,
});
```

## 11.4 Operation Kinds

Core should define operation primitives:

```txt
unary
binary
n-ary
iso/reversible
predicate
comparison
aggregate
effect
field operation
entity operation
query operation
reducer
```

## 11.5 Operation Example

```ts
const NormalizeEmail = gen.op.unary({
  name: "normalizeEmail",
  input: gen.email(),
  output: gen.email(),
  capabilities: [gen.cap.pure(), gen.cap.deterministic()],
  laws: [gen.law.claim.idempotent()],
  implementations: [
    gen.impl.ts([gen.runtimes.node20, gen.runtimes.browserModern], {
      run: (value) => value.trim().toLowerCase(),
    }),
    gen.impl.sql([gen.runtimes.postgres16], {
      emit: (value) => sql`lower(trim(${value}))`,
    }),
  ],
});
```

## 11.6 Capabilities

```ts
gen.cap.pure();
gen.cap.deterministic();
gen.cap.reversible();
gen.cap.partial();
gen.cap.total();
gen.cap.async();
gen.cap.effectful();
gen.cap.transactional();
gen.cap.idempotentEffect();
gen.cap.cacheable();
gen.cap.clientSafe();
gen.cap.serverOnly();
```

## 11.7 Laws

```ts
gen.law.claim.associative();
gen.law.claim.commutative();
gen.law.claim.idempotent();
gen.law.claim.identity(value);
gen.law.claim.inverse(op);
gen.law.claim.distributiveOver(otherOp);
```

Law assurance levels:

```ts
gen.law.claim.associative();
gen.law.tested.associative(propertyTest);
gen.law.proven.associative(proofArtifact);
```

The library should not pretend TypeScript can prove arbitrary user-supplied laws.

## 11.8 Effects

Effects are typed:

```ts
gen.effect.network();
gen.effect.email();
gen.effect.dbRead();
gen.effect.dbWrite();
gen.effect.fsRead();
gen.effect.fsWrite();
gen.effect.crypto();
gen.effect.clock();
gen.effect.random();
gen.effect.queue();
gen.effect.payment();
gen.effect.cacheRead();
gen.effect.cacheWrite();
```

## 11.9 Effect Operation Example

```ts
const SendWelcomeEmail = gen.op.effect({
  name: "sendWelcomeEmail",
  input: gen.object({
    userId: gen.uuid(),
    email: gen.email(),
  }),
  output: gen.unit(),
  effects: [gen.effect.network(), gen.effect.email()],
  implementations: [
    gen.impl.ts([gen.runtimes.node20], {
      run: async ({ email }) => {
        await emailClient.send({ to: email });
      },
    }),
  ],
});
```

---

# 12. Static Functions

## 12.1 Purpose

`gen.func` is the core primitive for named, typed, reusable static computations.

A function has:

```txt
name
input type
return/output type
body kind
static body AST
requirements
effects
properties/laws/capabilities
optional implementations
metadata
```

A function should not store an arbitrary JavaScript closure as its portable body. The callback syntax is only the authoring surface. It runs once at definition time and produces a static node.

## 12.2 Static Node Family

Not everything should literally be an `Expr<T>`. The system should distinguish static node kinds:

```txt
Expr<T>
  pure value computation

Predicate
  boolean expression, usually Expr<boolean>

Query<T>
  read computation

Action<T>
  write/effect computation

Patch<T>
  optimistic client-side state transformation

Plan<T>
  composed runtime execution plan
```

Conceptual type:

```ts
type StaticNode<Kind extends string, Input, Output, Requirements = never, Effects = never> = {
  kind: Kind;
  input: Input;
  output: Output;
  requirements: Requirements;
  effects: Effects;
  ast: unknown;
};
```

## 12.3 Static Function Type

```ts
type StaticFunction<
  const Name extends string,
  Input,
  Output,
  Body extends StaticNode<any, Input, Output, any, any>,
> = {
  kind: "func";
  name: Name;
  input: Input;
  output: Output;
  body: Body;
  properties: Property[];
  requirements: InferRequirements<Body>;
  effects: InferEffects<Body>;
  metadata?: Metadata[];
};
```

## 12.4 Expression Function

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

Calling a function creates a static expression node:

```ts
normalizeEmail.call({ email: User.fields.email });
```

Conceptually:

```txt
CallNode {
  fn: normalizeEmail,
  args: { email: FieldRef(User.email) }
}
```

## 12.5 Query Function

Getters should be based on `gen.func.query`.

```ts
const getUserFunc = gen.func.query({
  name: "getUser",
  input: gen.object({
    id: User.fields.id.type,
  }),
  returns: UserDetail,
  body: gen.query(({ id }) =>
    gen.query.from(User).where(gen.op.eq(User.fields.id, id)).select(UserDetail),
  ),
  auth: UserPolicy.actions.read,
});
```

A query function is not an API route by itself. It is a typed read computation. API packages, client packages, and framework adapters can expose it.

## 12.6 Action Function

Mutators should be based on `gen.func.action`.

```ts
const createUserFunc = gen.func.action({
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
server route handlers
transaction plans
SQL/ORM writes
permission checks
event emission
client SDK methods
mutation hooks
form submit handlers
tests
```

## 12.7 Patch Function for Optimistic UI

Optimistic UI should also be static and typed.

```ts
const optimisticCreatePost = gen.func.patch({
  name: "optimisticCreatePost",
  input: createPostFunc.input,
  returns: gen.optimistic.patchType(),
  body: gen.patch(({ title, body, authorId }) =>
    gen.optimistic.insert(listPostsFunc, {
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

Or inline on an action function:

```ts
const createPostFunc = gen.func.action({
  name: "createPost",
  input: ...,
  returns: PostDetail,
  body: ...,
  optimistic: gen.patch(({ title, body, authorId }) =>
    gen.optimistic.insert(listPostsFunc, {
      id: gen.optimistic.tempId(Post.fields.id),
      title,
      body,
      authorId,
    })
  ),
})
```

The optimistic patch is a client-side patch AST, not arbitrary UI code.

## 12.8 Function Exposure

Functions are computations. Other packages expose or interpret them.

```txt
API route = transport exposure of a function
Form = UI input over a function input
Hook = framework-specific client binding to a function
OpenAPI operation = documentation/transport schema for a function
Test = generated assertions for a function
```

Example:

```ts
const createUserRoute = gen.api.route({
  method: "POST",
  path: gen.api.path`/users`,
  func: createUserFunc,
});

const UserCreateForm = gen.forms.fromFunc(createUserFunc, {
  fields: [
    gen.forms.field("email", {
      source: User.fields.email,
      widget: gen.forms.widgets.emailInput(),
    }),
    gen.forms.field("displayName", {
      source: User.fields.displayName,
      widget: gen.forms.widgets.textInput(),
    }),
  ],
});
```

## 12.9 Why Functions Are Core

`gen.func` unifies:

```txt
validators = Func<Input, boolean>
serializers = Func<Ts, Storage>
deserializers = Func<Storage, Ts>
computed fields = Func<Row/Input, Value>
permission predicates = Func<AuthContext + Resource, boolean>
getters = Func<Input, Query<Output>>
mutators = Func<Input, Action<Output>>
optimistic patches = Func<Input, Patch>
form transforms = Func<FormValues, MutatorInput>
```

This gives the system one static, typed, analyzable primitive for reusable logic.

## 12.10 UI Functions

UI components, behaviors, and render plans may use static functions too.

Examples:

```txt
component setup = Func<Props, Bindings>
behavior body = Func<Slots + Bindings, Action>
style variant = Func<Props + Theme, StyleObject>
form transform = Func<FormValues, MutatorInput>
optimistic patch = Func<MutatorInput, Patch>
```

This keeps UI logic analyzable and lets requirements/effects bubble through
component composition.

---

# 13. Traits

## 12.1 Purpose

Traits are reusable annotations that attach validation, storage behavior, privacy behavior, UI hints, indexing constraints, encryption directives, algebraic merge behavior, or other metadata to types and fields.

Traits should be static data plus expression trees. They should not contain arbitrary runtime closures.

## 12.2 Basic Traits

```ts
const required = gen.trait("required", {
  validate: gen.expr.any((v) => gen.op.notNull(v)),
  error: "Value is required",
});

const minLength = (n: number) =>
  gen.trait(`minLength(${n})`, {
    appliesTo: gen.string(),
    validate: gen.expr(gen.string(), (v) => gen.op.gte(gen.op.length(v), n)),
    error: `Must be at least ${n} characters`,
  });

const positive = gen.trait("positive", {
  appliesTo: gen.int(),
  validate: gen.expr(gen.int(), (v) => gen.op.gt(v, 0)),
  error: "Must be positive",
});
```

## 12.3 Storage and Behavior Traits

```ts
const unique = gen.trait("unique", {
  storage: gen.storage.uniqueIndex(),
});

const encrypted = gen.trait("encrypted", {
  storage: gen.storage.encrypted(),
  queryable: false,
});

const crdtText = gen.trait("crdtText", {
  combine: gen.ops.yjsMerge(),
  laws: [gen.law.claim.associative(), gen.law.claim.commutative(), gen.law.claim.idempotent()],
});
```

## 12.4 Traits on Fields

```ts
const User = gen.entity("User", {
  email: gen.email().traits([gen.traits.required(), gen.traits.unique()]),
  name: gen.string().traits([gen.traits.required(), gen.traits.minLength(1)]),
});
```

Traits should be reusable, composable, inspectable, and target-compilable.

---

# 14. Runtimes

## 12.1 Runtime Definition

Core provides runtime abstractions. Plugins provide concrete runtimes.

```ts
const Node20 = gen.runtime("node", {
  version: "20",
  language: "typescript",
  capabilities: [gen.rt.sync(), gen.rt.async(), gen.rt.network(), gen.rt.crypto(), gen.rt.json()],
});
```

## 12.2 Runtime Capabilities

Runtime capabilities include:

```txt
sync
async
network
filesystem
crypto
webCrypto
DOM
fetch
timers
JSON
transactions
row locks
foreign keys
joins
subqueries
aggregates
window functions
recursive CTEs
JSONB
full text search
extensions
queues
workers
streams
KV store
conditional writes
atomic increments
```

## 12.3 Requirements

Operations and expressions accumulate requirements.

```ts
type Expr<Value, Requirements, Effects = never> = {
  kind: "expr";
  value: Value;
  requirements: Requirements;
  effects: Effects;
};
```

Examples:

```txt
Expr<string, Requires<"string.concat">>
Expr<number, Requires<"aggregate.count" | "join" | "subquery">>
```

## 12.4 Planning

A planner assigns operations to runtimes.

```ts
const UserReadPlan = gen.plan(UserRead, {
  runtimes: {
    database: gen.runtimes.postgres16,
    server: gen.runtimes.node20,
  },
  placement: {
    prefer: "database",
    fallback: "server",
  },
});
```

The planner might split execution:

```txt
Database:
  id
  displayName
  postCount

Server:
  avatarUrl
```

## 12.5 Fallback Policy

Fallback should be explicit.

```ts
gen.plan(UserRead, {
  runtimes: {
    database: gen.runtimes.postgres16,
    server: gen.runtimes.node20,
  },
  fallback: gen.fallback.allow({
    from: "database",
    to: "server",
    pureOnly: true,
    deterministicOnly: true,
  }),
});
```

Do not silently fallback effectful operations.

---

# 15. Stores and Databases

## 13.1 Store Concept

A store is a named physical persistence/execution backend.

Examples:

```txt
Postgres database
SQLite database
Mongo database
Redis cache
ClickHouse analytics database
S3 bucket
search index
external service
```

## 13.2 Store Type

Conceptual type:

```ts
type Store<
  const Name extends string,
  Dialect extends StoreDialect,
  Capabilities extends readonly Capability[],
> = {
  kind: "store";
  name: Name;
  dialect: Dialect;
  capabilities: Capabilities;
};
```

## 13.3 DB Plugin with Stores

Primary API:

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

Use:

```ts
const primary = gen.db.primary;
const analytics = gen.db.analytics;
const documents = gen.db.documents;
const cache = gen.db.cache;
```

## 13.4 Store-Specific Helpers

Each store exposes only helpers supported by its dialect.

```ts
const users = primary.table("users", {
  id: primary.column.uuid("id"),
  email: primary.column.text("email"),
});

const events = analytics.table("events", {
  id: analytics.column.string("id"),
  timestamp: analytics.column.datetime("timestamp"),
});

const profiles = documents.collection("profiles", {
  userId: documents.field.uuid("userId"),
  preferences: documents.field.json("preferences"),
});

const sessions = cache.keyspace("sessions", {
  key: cache.key.string(),
  value: cache.value.json(),
});
```

## 13.5 Default Store Alias

If a default store is configured, this may be available:

```ts
gen.db.table(...)
gen.db.column.uuid(...)
```

as an alias to:

```ts
gen.db.primary.table(...)
gen.db.primary.column.uuid(...)
```

## 13.6 Store Boundaries

The system must understand boundaries between stores.

Cross-store queries, relationships, and writes are possible, but must be explicit about:

```txt
consistency
transactionality
integrity enforcement
runtime placement
fallback behavior
compensation behavior
```

## 13.7 Store Capabilities

Stores declare capabilities.

```ts
postgres({
  capabilities: [gen.rt.transactions(), gen.rt.foreignKeys(), gen.rt.joins(), gen.rt.rowLocks()],
});

clickhouse({
  capabilities: [gen.rt.analytics(), gen.rt.aggregates(), gen.rt.columnar(), gen.rt.appendOnly()],
});

redis({
  capabilities: [gen.rt.kv(), gen.rt.ttl(), gen.rt.atomicIncrements()],
});
```

---

# 16. Storage Model

## 14.1 Physical Storage Is Separate From Entities

```ts
const User = gen.entity("User", {
  id: gen.uuid(),
  email: gen.email(),
  displayName: gen.string(),
});

const users = gen.db.primary.table("users", {
  id: gen.db.primary.column.uuid("id"),
  email: gen.db.primary.column.text("email"),
  firstName: gen.db.primary.column.text("first_name"),
  lastName: gen.db.primary.column.text("last_name"),
});
```

`User.fields.email` and `users.columns.email` are different things.

## 14.2 Table/Column Refs

Tables and columns are typed refs.

```ts
users.columns.id;
users.columns.email;
```

Columns know:

```txt
owning table
store
physical name
physical type
semantic-compatible type
nullability/defaults
constraints
```

## 14.3 Schema

```ts
const AppDb = gen.db.primary.schema({
  tables: [users, posts],
  indexes: [...],
  relations: [...],
})
```

For multiple stores:

```ts
const PrimarySchema = gen.db.primary.schema({ tables: [users, posts] });
const AnalyticsSchema = gen.db.analytics.schema({ tables: [events] });
const DocumentsSchema = gen.db.documents.schema({ collections: [profiles] });
```

Targets consume the schemas they support.

---

# 17. Mapping Layer

## 15.1 Purpose

Mappings connect semantic entity fields to physical columns, expressions, queries, services, other stores, or computed values.

A field may be backed by:

```txt
one column
many columns
an expression
a join
a subquery
an aggregate
a document field
a cache key
a service call
a search index field
an event-sourced reducer
a virtual/computed field
```

## 15.2 Mapping Example

```ts
const User = gen.entity("User", {
  id: gen.uuid(),
  email: gen.email(),
  displayName: gen.string(),
  postCount: gen.int(),
  lastSeenAt: gen.datetime().nullable(),
  preferences: gen.json(),
});

const users = gen.db.primary.table("users", {
  id: gen.db.primary.column.uuid("id"),
  email: gen.db.primary.column.text("email"),
  firstName: gen.db.primary.column.text("first_name"),
  lastName: gen.db.primary.column.text("last_name"),
});

const events = gen.db.analytics.table("user_events", {
  id: gen.db.analytics.column.string("id"),
  userId: gen.db.analytics.column.uuid("user_id"),
  timestamp: gen.db.analytics.column.datetime("timestamp"),
});

const profiles = gen.db.documents.collection("user_profiles", {
  userId: gen.db.documents.field.uuid("userId"),
  preferences: gen.db.documents.field.json("preferences"),
});

const UserRead = gen.mapping.read(User, [
  gen.mapping.mapField(User.fields.id, {
    read: users.columns.id,
  }),

  gen.mapping.mapField(User.fields.email, {
    read: users.columns.email,
  }),

  gen.mapping.mapField(User.fields.displayName, {
    read: gen.op.concat(users.columns.firstName, gen.literal(" "), users.columns.lastName),
  }),

  gen.mapping.mapField(User.fields.lastSeenAt, {
    read: gen.query
      .from(events)
      .select(gen.op.max(events.columns.timestamp))
      .where(gen.eq(events.columns.userId, users.columns.id)),
  }),

  gen.mapping.mapField(User.fields.preferences, {
    read: profiles.fields.preferences,
  }),
]);
```

## 15.3 Read/Write Separation

Mappings should distinguish read and write.

```ts
const UserWrite = gen.mapping.write(User, [
  gen.mapping.mapField(User.fields.email, {
    write: users.columns.email,
  }),
]);
```

Combined:

```ts
const UserMap = gen.mapping.mapping(User, [
  gen.mapping.mapField(User.fields.email, {
    read: users.columns.email,
    write: users.columns.email,
  }),
]);
```

## 15.4 Read-Only and Hidden Fields

```ts
gen.mapping.mapField(User.fields.postCount, {
  read: gen.aggregate.count(posts.columns.id, {
    where: gen.eq(posts.columns.authorId, users.columns.id),
  }),
  write: gen.mapping.readOnly(),
});
```

```ts
gen.mapping.mapField(User.fields.password, {
  read: gen.mapping.hidden(),
  write: HashPassword.to(users.columns.passwordHash),
});
```

## 15.5 Reversible Mapping

```ts
const FullName = gen.op.iso({
  name: "fullName",
  input: gen.object({ first: gen.string(), last: gen.string() }),
  output: gen.string(),
  to: ({ first, last }) => `${first} ${last}`,
  from: parseFullName,
  capabilities: [gen.cap.pure(), gen.cap.deterministic(), gen.cap.reversible()],
});

const UserMap = gen.mapping.mapping(User, [
  gen.mapping.mapField(User.fields.displayName, {
    read: FullName.to({
      first: users.columns.firstName,
      last: users.columns.lastName,
    }),
    write: FullName.from({
      first: users.columns.firstName,
      last: users.columns.lastName,
    }),
  }),
]);
```

## 15.6 Dependency Tracking

Derived fields must track dependencies.

```ts
gen.mapping.mapField(User.fields.displayName, {
  read: gen.mapping.derived({
    dependsOn: [users.columns.firstName, users.columns.lastName],
    expr: FullName.to({
      first: users.columns.firstName,
      last: users.columns.lastName,
    }),
  }),
});
```

Supports:

```txt
query planning
cache invalidation
incremental recomputation
subscriptions
migration analysis
select optimization
event derivation
```

## 15.7 Projections

```ts
const UserSummary = gen.mapping.projection(User, {
  mapping: UserRead,
  fields: [User.fields.id, User.fields.displayName, User.fields.postCount],
});

const UserDetail = gen.mapping.projection(User, {
  mapping: UserRead,
  fields: [
    User.fields.id,
    User.fields.email,
    User.fields.displayName,
    User.fields.postCount,
    User.fields.preferences,
  ],
});
```

---

# 18. Relations and Graphs

## 16.1 Relations Are Semantic

Relations connect entities semantically. They may or may not correspond to database foreign keys.

```ts
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

## 16.2 Cross-Store Relations

Cross-store relations are allowed, but cannot imply database-enforced foreign keys unless a store supports that exact behavior.

```ts
const UserProfileName = gen.rel.name(User, "profile");
const ProfileUserName = gen.rel.name(Profile, "user");

const UserProfile = gen.rel.oneToOne(UserProfileName, {
  from: profiles.fields.userId,
  to: users.columns.id,
  inverse: ProfileUserName,
  integrity: gen.rel.integrity.applicationChecked(),
  deletion: {
    whenParentDeleted: gen.appDelete.serviceCascade(),
  },
});
```

Integrity modes:

```ts
gen.rel.integrity.databaseForeignKey();
gen.rel.integrity.applicationChecked();
gen.rel.integrity.eventual();
gen.rel.integrity.unchecked();
gen.rel.integrity.external();
```

## 16.3 Referential Actions

```ts
gen.rel.fk.cascade();
gen.rel.fk.restrict();
gen.rel.fk.noAction();
gen.rel.fk.setNull();
gen.rel.fk.setDefault();
```

Type rules:

```txt
setNull requires nullable FK field/column
setDefault requires default
foreignKey requires compatible store/dialect
cross-store relation usually cannot use databaseForeignKey
```

## 16.4 App Deletion Behavior

Database FK behavior and app deletion behavior are separate.

```ts
const PostAuthor = gen.rel.manyToOne(PostAuthorName, {
  from: Post.fields.authorId,
  to: User.fields.id,
  inverse: UserPostsName,
  foreignKey: {
    onDelete: gen.rel.fk.restrict(),
  },
  deletion: {
    whenParentDeleted: gen.appDelete.preventIfRelated({
      message: "Cannot delete user with posts.",
    }),
  },
});
```

Behaviors:

```ts
gen.appDelete.databaseCascade();
gen.appDelete.serviceCascade();
gen.appDelete.softDeleteChildren();
gen.appDelete.archiveChildren();
gen.appDelete.preventIfRelated();
gen.appDelete.orphanChildren();
```

## 16.5 Graph

```ts
const Blog = gen.rel.graph({
  entities: [User, Post, Comment],
  relations: [PostAuthor, CommentPost, CommentAuthor],
});
```

## 17.6 Relation Entities and N-ary Relations

In addition to binary relations, the relations package should support relation entities / hyperedges.

This models relationships that have multiple roles and their own fields.

```ts
const Deal = gen.rel.entity("Deal", {
  roles: {
    buyer: gen.rel.role(Company),
    seller: gen.rel.role(Company),
    advisors: gen.rel.role(Advisor, { cardinality: "many" }),
  },
  fields: {
    amount: gen.money(),
    stage: DealStage,
  },
});
```

A relation entity is useful when a relationship is itself a domain concept.

Examples:

```txt
Deal connects buyer, seller, and advisors.
Employment connects employee, employer, time range, and role.
ConflictOfInterest connects deal, advisor, and evidence.
Membership connects user, organization, role, and dates.
```

Relation entities should support:

```txt
typed roles
role cardinality
fields/attributes
mappings
permissions
views/getters/mutators
storage as tables, facts, documents, or graph edges
participation in other relations
```

## 17.7 Relation Include Inference

```ts
type PostWithAuthor = InferEntity<typeof Post, { include: [typeof PostAuthor] }>;
```

should infer an `author` property of `User` shape.

Nested includes:

```ts
type PostFull = InferEntity<
  typeof Post,
  {
    include: [
      typeof PostAuthor,
      Include<
        typeof PostComments,
        {
          include: [typeof CommentAuthor];
        }
      >,
    ];
  }
>;
```

---

# 19. Consistency and Transactions

## 17.1 Consistency Is Explicit

Mutators that write across stores must declare consistency behavior.

Single-store transaction:

```ts
const updateUser = gen.api.mutator.update(User, {
  name: "updateUser",
  input: [User.fields.email, User.fields.displayName],
  mapping: UserWrite,
  consistency: gen.consistency.transactional({
    store: gen.db.primary,
  }),
});
```

Eventual consistency:

```ts
const updateUserPreferences = gen.api.mutator.update(User, {
  name: "updateUserPreferences",
  input: [User.fields.id, User.fields.preferences],
  writes: [gen.write.to(gen.db.documents)],
  consistency: gen.consistency.eventual(),
});
```

Saga:

```ts
const createUser = gen.api.mutator.custom({
  name: "createUser",
  input: gen.object({
    email: gen.email(),
    displayName: gen.string(),
    preferences: gen.json(),
  }),
  steps: [
    gen.write.insert(users, {...}),
    gen.write.insert(profiles, {...}),
  ],
  consistency: gen.consistency.saga({
    compensations: [...],
  }),
})
```

## 17.2 Diagnostics

If a mutator writes across stores and claims transactional consistency without a coordinator, diagnostics should fail.

```txt
Cannot generate transactional mutator createUser across stores primary and documents.
Choose consistency.saga(), consistency.eventual(), or configure a transaction coordinator.
```

---

# 20. API, Getters, and Mutators

## 20.1 Resources Expose Functions

Resources group exposed query/action functions. They do not imply CRUD.

```ts
const UserResource = gen.api.resource(User, {
  path: gen.api.route`/users`,
  operations: [listUsersRoute, getUserRoute, createUserRoute],
});
```

A resource should generally expose `gen.func.query` and `gen.func.action` values through transport-specific API definitions.

## 20.2 Getter as Query Function

```ts
const getUserFunc = gen.func.query({
  name: "getUser",
  input: gen.object({
    id: User.fields.id.type,
  }),
  returns: UserDetail,
  body: gen.query(({ id }) =>
    gen.query.from(User).where(gen.op.eq(User.fields.id, id)).select(UserDetail),
  ),
  auth: UserPolicy.actions.read,
});

const getUserRoute = gen.api.get({
  path: gen.api.path`/users/${User.fields.id}`,
  func: getUserFunc,
});
```

List getter:

```ts
const listUsersFunc = gen.func.query({
  name: "listUsers",
  input: gen.object({
    search: gen.optional(gen.string()),
    role: gen.optional(User.fields.role.type),
    limit: gen.optional(gen.int()),
  }),
  returns: gen.array(UserSummary),
  body: gen.query(({ search, role, limit }) =>
    gen.query
      .from(User)
      .where(
        gen.op.and(
          gen.op.whenSome(search, (s) => gen.op.contains(User.fields.displayName, s)),
          gen.op.whenSome(role, (r) => gen.op.eq(User.fields.role, r)),
        ),
      )
      .orderBy(gen.order.asc(User.fields.displayName))
      .limit(gen.op.coalesce(limit, 50))
      .select(UserSummary),
  ),
});
```

## 20.3 Mutator as Action Function

Create:

```ts
const createUserFunc = gen.func.action({
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
  auth: UserPolicy.actions.create,
  after: [SendWelcomeEmail],
  consistency: gen.consistency.transactional({ store: gen.db.primary }),
});
```

Update:

```ts
const updateUserFunc = gen.func.action({
  name: "updateUser",
  input: gen.object({
    id: User.fields.id.type,
    email: gen.optional(User.fields.email.type),
    displayName: gen.optional(User.fields.displayName.type),
  }),
  returns: UserDetail,
  body: gen.action(({ id, email, displayName }) =>
    gen.action
      .update(User)
      .where(gen.op.eq(User.fields.id, id))
      .setWhenSome(User.fields.email, email, (e) => normalizeEmail.call({ email: e }))
      .setWhenSome(User.fields.displayName, displayName)
      .returning(UserDetail),
  ),
});
```

Delete:

```ts
const deleteUserFunc = gen.func.action({
  name: "deleteUser",
  input: gen.object({ id: User.fields.id.type }),
  returns: gen.unit(),
  body: gen.action(({ id }) =>
    gen.action
      .delete(User)
      .where(gen.op.eq(User.fields.id, id))
      .behavior(gen.appDelete.preventIfRelated({ relations: [UserPosts] })),
  ),
});
```

## 18.4 Typed Errors

Mutators and getters should declare typed errors.

```ts
const createUserFunc = gen.func.action({
  name: "createUser",
  input: gen.object({ email: User.fields.email.type }),
  body: ...,
  errors: [
    gen.error.conflict("EmailAlreadyExists", {
      field: User.fields.email,
    }),
    gen.error.validation("InvalidUserInput"),
    gen.error.auth("Unauthorized"),
  ],
})
```

Inference:

```ts
type CreateUserInput = InferInput<typeof createUserFunc>;
type CreateUserOutput = InferOutput<typeof createUserFunc>;
type CreateUserError = InferError<typeof createUserFunc>;
```

## 18.5 Cache Invalidation and Optimistic Updates

This may live in API or client-cache packages, but mutators should expose enough metadata.

```ts
const createPostFunc = gen.func.action({
  name: "createPost",
  input: gen.object({
    title: Post.fields.title.type,
    body: Post.fields.body.type,
    authorId: Post.fields.authorId.type,
  }),
  returns: PostDetail,
  body: ...,
  invalidates: [listPostsFunc],
  optimistic: gen.patch(({ title, body, authorId }) =>
    gen.optimistic.insert(listPostsFunc, {
      id: gen.optimistic.tempId(Post.fields.id),
      title,
      body,
      authorId,
    })
  ),
})
```

If `optimistic` lives in a plugin, core still needs refs/metadata to support it.

---

# 21. Authorization Policies

## 19.1 Policy

```ts
const UserPolicy = gen.authz.policy(User, {
  read: gen.authz.allow.authenticated(),
  create: gen.authz.allow.role("admin"),
  update: gen.authz.allow.owner(User.fields.id).or(gen.authz.allow.role("admin")),
  delete: gen.authz.allow.role("admin"),
});
```

## 19.2 Relation-Aware Policy

```ts
const PostPolicy = gen.authz.policy(Post, {
  read: gen.authz.allow.public(),
  update: gen.authz.allow
    .relation(PostAuthor)
    .where(User.fields.id, gen.authz.equalsCurrentUserId()),
  delete: gen.authz.allow.owner(Post.fields.authorId).or(gen.authz.allow.role("admin")),
});
```

## 19.3 Requirements

Policies should be:

```txt
typed by entity
typed by fields and relations
usable by getters/mutators/resources
optionally translatable to SQL predicates
translatable to server runtime checks
safe to expose only as limited client metadata
```

---

# 22. Forms

## 22.1 Portable Form from Function

Forms describe input and interaction intent without requiring a frontend framework.

A form should usually be derived from a `gen.func.action` input contract.

Forms should produce a `@gen/ui` component/view with typed slots, not direct framework JSX.

```ts
const UserCreateForm = gen.forms.fromFunc(createUserFunc, {
  name: "UserCreateForm",
  slots: {
    root: gen.ui.Element.Form,
    emailField: gen.ui.Element.Field,
    emailLabel: gen.ui.Element.Text,
    emailInput: gen.ui.Element.TextInput,
    emailError: gen.ui.Element.Text,
    displayNameField: gen.ui.Element.Field,
    displayNameInput: gen.ui.Element.TextInput,
    submitButton: gen.ui.Element.Interactive,
  },
  fields: [
    gen.forms.field("email", {
      source: User.fields.email,
      widget: gen.forms.widgets.emailInput(),
      label: "Email",
      slots: {
        field: "emailField",
        input: "emailInput",
        error: "emailError",
        label: "emailLabel",
      },
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

The form input is `InferInput<typeof createUserFunc>`. The submit result is `InferOutput<typeof createUserFunc>`. Typed errors can map back to fields.

## 20.2 Relation Inputs

```ts
const PostForm = gen.forms.form(Post, {
  fields: [
    gen.forms.field(Post.fields.title, {
      widget: gen.forms.widgets.textInput(),
    }),
    gen.forms.field(Post.fields.authorId, {
      widget: gen.forms.widgets.relationSelect({
        relation: PostAuthor,
        label: User.fields.displayName,
        value: User.fields.id,
        search: [User.fields.displayName, User.fields.email],
        source: listUsers,
      }),
    }),
  ],
  submit: createPostFunc,
});
```

## 20.3 Form Inference

```ts
type UserFormValues = InferFormValues<typeof UserCreateForm>;
type UserFormSubmitInput = InferFormSubmit<typeof UserCreateForm>;
type UserFormErrors = InferFormErrors<typeof UserCreateForm>;
```

Generated forms must expose stable public slots/handles for styling and behavior attachment.

Examples:

```ts
const BrandedUserCreateForm = UserCreateForm.pipe(
  gen.ui.Style.attach({
    root: { gap: "md" },
    emailInput: { borderColor: "neutral" },
    emailError: { color: "danger" },
    submitButton: { backgroundColor: "primary" },
  }),
  gen.ui.Behavior.attach(gen.forms.behaviors.submitOnEnter(), {
    form: "root",
    submit: "submitButton",
  }),
);
```

---

# 23. UI IR

## 23.1 Purpose

`@gen/ui` defines a platform-agnostic intermediate representation for generated UI.

It should be used by:

```txt
forms
components
tables
detail views
cards
modals
admin pages
design-system packages
framework renderers
```

The purpose is to avoid generating sealed framework components that users must fork to customize.

## 23.2 Architecture

The UI stack is:

```txt
Element capabilities -> View<Slots> -> Component -> Renderer -> Platform
```

Definitions:

```txt
Element capability:
  abstract element interface such as Container, Text, Interactive, TextInput, Form.

View<Slots>:
  structural skeleton with named typed slots.

Component:
  logical unit with props, requirements, possible errors, bindings/state, and a View.

Style:
  typed appearance data attached to slots.

Behavior:
  typed interaction/effect/action data attached to slots.

Renderer:
  service that converts UI IR into host nodes or source files.

Platform:
  element vocabulary, event system, renderer, attribute model, and host capabilities.
```

## 23.3 Element Capabilities

The UI package should define abstract element capabilities:

```ts
gen.ui.Element.Base;
gen.ui.Element.Container;
gen.ui.Element.Text;
gen.ui.Element.Interactive;
gen.ui.Element.TextInput;
gen.ui.Element.NumberInput;
gen.ui.Element.Select;
gen.ui.Element.Form;
gen.ui.Element.Label;
gen.ui.Element.Field;
gen.ui.Element.Table;
gen.ui.Element.Row;
gen.ui.Element.Cell;
gen.ui.Element.Collection(inner);
```

Element capabilities are not hardcoded HTML tags.

Platform packages map them to concrete tags/widgets/events:

```txt
Web:
  Interactive -> button, a, div[role=button], etc.
  onPress -> click / keyboard activation

TUI:
  Interactive -> focusable terminal node
  onPress -> key event / enter

Native:
  Interactive -> Pressable
  onPress -> GestureResponderEvent
```

## 23.4 View<Slots>

A view is a typed structural skeleton.

```ts
const BaseButtonView = gen.ui.view({
  root: gen.ui.Element.Interactive,
  label: gen.ui.Element.Text,
}, ({ props, slot }) => (
  <Button slot={slot.root}>
    <Text slot={slot.label}>{props.children}</Text>
  </Button>
))
```

The stored artifact should be a UI AST, not an opaque JSX element.

The callback is an authoring surface, like `gen.expr`; it builds static UI structure.

## 23.5 Component

Components combine props, setup/bindings, requirements, and a view.

```ts
const BaseButton = gen.ui.component({
  name: "BaseButton",
  props: gen.object({
    children: gen.ui.node(),
  }),
  requires: [],
  setup: gen.func.expr({
    name: "buttonSetup",
    input: gen.object({}),
    returns: gen.object({}),
    body: gen.expr(() => ({})),
  }),
  view: BaseButtonView,
});
```

Conceptual type:

```ts
type Component<Props, Req, E, Bindings, Slots> = {
  kind: "component";
  props: Props;
  requirements: Req;
  errors: E;
  bindings: Bindings;
  view: View<Slots>;
  pipe: PipeableComponent<Props, Req, E, Bindings, Slots>;
};
```

Components should not return black-box `JSX.Element`.
They should return or contain a typed `View<Slots>`.

## 23.6 Style

Styles are typed data attached to slots.

```ts
const buttonStyle = gen.ui.Style.make({
  root: {
    padding: ["sm", "md"],
    borderRadius: "md",
    backgroundColor: "primary",
  },
  label: {
    color: "inverse",
    fontWeight: "bold",
  },
});

const Button = BaseButton.pipe(gen.ui.Style.attach(buttonStyle));
```

Invalid slot names should be type errors.

Invalid theme tokens should be type errors.

Invalid style properties for a platform should be diagnostics or type errors where possible.

## 23.7 Theme and Typed Tokens

The UI package should support typed theme tokens.

```ts
const AppTheme = gen.ui.theme({
  color: {
    primary: gen.ui.color("#2563eb"),
    inverse: gen.ui.color("#ffffff"),
    danger: gen.ui.color("#dc2626"),
    surface: gen.ui.color("#ffffff"),
  },
  space: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
  },
  radius: {
    sm: "0.25rem",
    md: "0.5rem",
    full: "9999px",
  },
});
```

Styles should refer to tokens:

```ts
backgroundColor: "primary";
padding: ["sm", "md"];
borderRadius: "full";
```

No massive untyped Tailwind strings should be the source of truth.

Targets may compile typed style data to Tailwind classes, CSS, CSS modules,
Vanilla Extract, inline styles, React Native StyleSheet, or terminal styles.

## 23.8 Style Handles and Overrides

Generated components should expose public style handles.

Example generated form handles:

```ts
{
  root: Element.Form,
  emailField: Element.Field,
  emailLabel: Element.Text,
  emailInput: Element.TextInput,
  emailError: Element.Text,
  submitButton: Element.Interactive,
}
```

Users should customize generated UI with:

```ts
const BrandedForm = UserCreateForm.pipe(
  gen.ui.Style.attach({
    submitButton: {
      backgroundColor: "primary",
      borderRadius: "full",
    },
  }),
);
```

This avoids generated-file forking.

## 23.9 Behavior

Behaviors are typed slot consumers that attach interaction, accessibility, state,
subscriptions, lifecycle resources, or effects to slots.

```ts
const submitBehavior = gen.ui.Behavior.make({
  form: gen.ui.Element.Form,
  submit: gen.ui.Element.Interactive,
})(({ form, submit }) =>
  gen.action.seq(submit.onPress(form.submit()), form.onSubmit(createUserFunc)),
);
```

Attach:

```ts
const UserCreateFormWithBehavior = UserCreateForm.pipe(
  gen.ui.Behavior.attach(submitBehavior, {
    form: "root",
    submit: "submitButton",
  }),
);
```

Attachment should type-check:

```txt
slot exists
slot satisfies required element capability
behavior requirements are provided or bubble upward
events are supported by target platform
effects are supported by target runtime
```

## 23.10 Lifecycle and Cleanup

Behaviors may acquire resources:

```txt
event listeners
timers
subscriptions
focus traps
observers
external stores
```

The behavior system should model lifecycle requirements and cleanup as static action/effect plans where possible.

Platform renderers are responsible for translating lifecycle plans into concrete cleanup behavior.

## 23.11 Slot Remapping

Views/components should support slot remapping for composition.

```ts
const Panel = gen.ui.component({
  name: "Panel",
  props: gen.object({
    title: gen.string(),
    children: gen.ui.node(),
  }),
  view: gen.ui.view({
    panelRoot: gen.ui.Element.Container,
    panelTitle: gen.ui.Element.Text,
    panelBody: gen.ui.Element.Container,
  }, ({ props, slot }) => (
    <BaseModal
      title={props.title}
      slots={{
        root: slot.panelRoot,
        title: slot.panelTitle,
        content: slot.panelBody,
      }}
    >
      {props.children}
    </BaseModal>
  )),
})
```

Slot remapping lets components compose without leaking internal slot names.

## 23.12 Collection Slots

Generated lists, tables, grids, repeatable form sections, and relation selectors
need typed collection slots.

```ts
const UsersTableView = gen.ui.view({
  root: gen.ui.Element.Table,
  rows: gen.ui.Element.Collection(gen.ui.Element.Row),
  cells: gen.ui.Element.Collection(gen.ui.Element.Cell),
});
```

Behaviors can attach to collections:

```ts
UsersTableView.pipe(
  gen.ui.Behavior.attach(selectionBehavior, {
    target: "rows",
  }),
  gen.ui.Behavior.attach(keyboardNavBehavior, {
    target: "rows",
  }),
);
```

This supports:

```txt
selection
keyboard navigation
drag and drop
virtualization
row expansion
bulk actions
sortable tables
```

## 23.13 Requirements Bubble Through UI

Components and behaviors should declare requirements:

```txt
Theme
Router
MutationClient
QueryClient
ToastService
AuthContext
I18n
Platform capabilities
```

When a component renders a child or attaches a behavior with requirements,
those requirements should bubble up to the parent component/page/app.

Missing requirements should be compile-time errors where possible or structured diagnostics.

## 23.14 Platform and Renderer

Platform packages define:

```txt
element vocabulary
attribute model
event model
renderer
host capabilities
style output
lifecycle behavior
```

Examples:

```ts
gen.web.platform(...)
gen.react.renderer(...)
gen.vue.renderer(...)
gen.native.platform(...)
gen.tui.platform(...)
```

Generated UI targets should compile the same `@gen/ui` IR to platform-specific output.

## 23.15 Security Holes

UI holes that can introduce security risks should require branded safe types.

Example:

```ts
gen.ui.html(SafeHtml);
```

not:

```ts
gen.ui.html(gen.string());
```

Unsafe HTML/string interpolation should be explicit and diagnosable.

---

# 24. Components and Framework Adapters

## 24.1 Components Build on @gen/ui

`@gen/components` should build on `@gen/ui`, not define an unrelated component model.

The core component abstraction should be:

```txt
Component<Props, Req, E, Bindings, Slots>
```

where `Slots` is a typed slot map from `@gen/ui`.

```ts
type ComponentContract<Props, Events, Slots = {}> = {
  props: Props;
  events: Events;
  slots: Slots;
};
```

Framework adapters should consume the UI/component IR and emit framework-specific code.

## 24.2 Framework-Specific Rendering

React/Vue/Svelte/Solid/native/TUI packages should compile `@gen/ui` views,
styles, and behaviors to concrete components.

They should not require forms/components to be authored separately per framework.

Example:

```ts
await gen.generate([
  gen.react.component(UserCreateForm),
  gen.vue.component(UserCreateForm),
  gen.tui.component(UserCreateForm),
]);
```

Targets may vary in feature coverage, but unsupported platform features should produce diagnostics.

## 24.3 Framework-Specific Components

React plugin:

```tsx
const EmailInput = gen.react.component({
  name: "EmailInput",
  props: gen.object({
    value: gen.email(),
    onChange: gen.fn([gen.email()], gen.unit()),
    error: gen.optional(gen.string()),
  }),
  component: (props) => <input value={props.value} />,
});
```

Vue plugin:

```ts
const EmailInputVue = gen.vue.component({
  name: "EmailInput",
  props: gen.object({
    modelValue: gen.email(),
    error: gen.optional(gen.string()),
  }),
  emits: {
    "update:modelValue": gen.email(),
  },
});
```

## 24.4 Typed Binding

```ts
const UserReactForm = gen.react.form(UserCreateForm, {
  components: [
    gen.react.bind(User.fields.email, EmailInput, {
      value: gen.react.prop.value,
      onChange: gen.react.prop.onChange,
      error: gen.react.prop.error,
    }),
  ],
});
```

This must type-check that component props match field value types.

Invalid:

```ts
gen.react.bind(User.fields.email, NumberInput);
// type error: NumberInput expects number, email field is string/email
```

---

# 25. Events, Facts, Rules, and Reducers

## 25.1 Events

```ts
const UserCreated = gen.events.event("UserCreated", {
  userId: User.fields.id.type,
  email: User.fields.email.type,
});
```

## 25.2 Emission

```ts
const createUser = gen.api.mutator.create(User, {
  input: [User.fields.email, User.fields.displayName],
  emits: [UserCreated],
});
```

## 25.3 Reducers

```ts
const UserScoreReducer = gen.events.reducer(User.fields.score, {
  events: [ScoreAdded],
  combine: gen.op.monoid({
    value: gen.int(),
    combine: addInt,
    empty: 0,
  }),
});
```

If `combine` is associative, replay can be chunked. If commutative, ordering may be relaxed where safe.

## 25.4 Immutable Facts and IVM as Optional Packages

Immutable facts, time-travel queries, diff queries, inference rules, reactive views, and incremental view maintenance are powerful, but they should not be mandatory core assumptions.

They should live in optional packages such as:

```txt
@gen/facts
@gen/views
@gen/rules
@gen/ivm
@gen/spacetimedb
```

These packages can use the same core primitives:

```txt
refs
representations
expressions
operations
laws
runtimes
stores
artifacts
```

Example optional API:

```ts
const dealDashboard = gen.views.view(
  "dealDashboard",
  gen.query
    .from(Deal, (deal) => {
      const buyer = gen.query.traverse(deal, Deal.roles.buyer);
      const advisors = gen.query.traverseMany(deal, Deal.roles.advisors);
      return { deal, buyer, advisors };
    })
    .where(gen.op.neq(Deal.fields.stage, DealStage.cancelled)),
);
```

This should compile to a store/runtime-specific view, subscription, materialized view, or incremental dataflow where supported.

Core should enable this, not require it.

---

# 26. Generation Targets

## 26.1 Generate API

```ts
await gen.generate([
  gen.drizzle.schema(PrimarySchema),
  gen.hono.routes(UserResource, {
    runtime: gen.runtimes.node20,
  }),
  gen.react.component(UserCreateForm, {
    runtime: gen.runtimes.browserModern,
  }),
  gen.zod.schemas([User, Post]),
  gen.openapi.document(UserResource),
]);
```

## 26.2 Target Compatibility

Targets must check input compatibility.

Examples:

```txt
Drizzle supports Postgres/MySQL/SQLite schemas, not Mongo collections.
React form target supports React components/contracts, not Vue components.
Hono target requires server-compatible runtimes.
OpenAPI target requires serializable contracts.
```

## 26.3 Store-Specific Targeting

```ts
await gen.generate([
  gen.drizzle.schema(gen.db.primary.schema({ tables: [users, posts] })),
  gen.clickhouse.schema(gen.db.analytics.schema({ tables: [events] })),
  gen.mongoose.schema(gen.db.documents.schema({ collections: [profiles] })),
]);
```

## 26.4 Cross-Store App Targets

Higher-level targets may consume many stores.

```ts
await gen.generate([
  gen.hono.routes(AppApi, {
    stores: {
      primary: gen.db.primary,
      analytics: gen.db.analytics,
      documents: gen.db.documents,
    },
    runtime: gen.runtimes.node20,
  }),
]);
```

UI generation targets should consume `@gen/ui` IR:

```ts
gen.react.component(...)
gen.vue.component(...)
gen.svelte.component(...)
gen.native.component(...)
gen.tui.component(...)
```

Form-specific helpers may exist, but should be sugar over UI component generation:

```ts
gen.react.form(UserCreateForm);
// sugar for:
gen.react.component(UserCreateForm);
```

---

# 27. Query System

## 27.1 Typed Predicates

```ts
gen.eq(User.fields.email, input.field("email"))
gen.gt(User.fields.createdAt, input.field("after"))
gen.and(...)
gen.or(...)
```

Predicates should work over:

```txt
field refs
column refs
expressions
relation paths
operation outputs
query-backed fields
```

## 27.2 Query-Backed Fields

```ts
gen.mapping.mapField(User.fields.latestPostTitle, {
  read: gen.query.field({
    type: gen.string().nullable(),
    query: (q) =>
      q
        .select(Post.fields.title)
        .from(Post)
        .where(gen.eq(Post.fields.authorId, User.fields.id))
        .orderBy(gen.desc(Post.fields.createdAt))
        .limit(1),
  }),
});
```

## 27.3 Runtime-Aware Query Planning

The planner should decide whether to use:

```txt
joins
subqueries
server-side loaders
batching
service calls
cache reads
fallback operations
```

based on runtime/store capabilities.

---

# 28. Serialization

## 28.1 Boundary Types

Generated API clients, OpenAPI, GraphQL, and JSON transports need explicit serializers for non-JSON-native types.

```ts
gen.serializer(gen.datetime(), {
  json: gen.string(),
  encode: (d) => d.toISOString(),
  decode: (s) => new Date(s),
});

gen.serializer(gen.money(), {
  json: gen.object({
    amount: gen.int(),
    currency: gen.string(),
  }),
});
```

Serializers may be core or an official standard package, but the protocol should be core-level because many targets need it.

---

# 29. Environment and Secrets

This should likely be a standard package, not core, but the core runtime/effect system should support env requirements.

```ts
const Env = gen.env.schema({
  DATABASE_URL: gen.env.url().serverOnly(),
  SESSION_SECRET: gen.env.string().secret(),
  PUBLIC_API_URL: gen.env.url().public(),
});
```

Operations can require env values:

```ts
const GetAvatarUrl = gen.op.effect({
  name: "getAvatarUrl",
  requires: [gen.env.requires("S3_BUCKET")],
  effects: [gen.effect.network()],
  ...
})
```

---

# 30. Check and Generate Lifecycle

## 30.1 Lifecycle

Core should define the lifecycle:

```txt
collect refs
resolve plugin dependencies
resolve metadata
resolve runtimes/stores
gather requirements
build dependency graph
run checks
plan runtimes
produce diagnostics
generate artifacts
return artifacts
optional CLI write/format
```

## 30.2 Check

```ts
const result = await gen.check(Project);
```

Checks should include:

```txt
invalid refs
plugin dependency errors
runtime incompatibilities
unsupported target inputs
mapping type mismatches
cross-store consistency problems
component prop mismatches
policy translation failures
serializer gaps
```

## 30.3 Generate

```ts
const result = await gen.generate([...])
```

Generation should fail on errors by default.

---

# 31. Type Safety Requirements

The library must reject or diagnose:

1. Nonexistent entity fields.
2. Fields from the wrong entity where ownership matters.
3. Incompatible field-to-column mappings.
4. `setNull` on non-nullable FK fields/columns.
5. `setDefault` without a default.
6. Database foreign keys across stores that cannot enforce them.
7. Cross-store transactional writes without a coordinator.
8. Using read-only fields in create/update inputs.
9. Running an operation in a runtime without an implementation or capability.
10. Silently falling back effectful operations.
11. Passing Mongo storage to SQL-only targets.
12. Passing Vue components to React targets.
13. Binding component props to incompatible field types.
14. Exposing server-only fields/effects to client bundles.
15. Generating OpenAPI for unserializable types without serializers.
16. Using a target whose plugin dependencies are missing.
17. Duplicate plugin helper namespaces.
18. Unsupported relation cardinality in a target.
19. Unsupported store dialect in a target.
20. Unsupported query operation in a runtime/store.
21. Vague storage representation where a target requires precise physical layout.
22. Non-static JS closure in a schema-critical portable definition.
23. Expression type mismatch, such as applying string operations to numeric expressions.
24. Trait applied to an incompatible type.
25. Aggregation over a derived type whose aggregation representation is ambiguous.
26. Function body output not matching declared return type.
27. Query/action/patch function using effects unsupported by its target runtime.
28. Form field not present in the function input contract.
29. Optimistic patch not reconcilable with action output identity.
30. Action function writes fields not writable under its mapping/consistency policy.
31. Style attaches to a slot that does not exist.
32. Behavior attaches to a slot that does not satisfy its required element capability.
33. Style uses an invalid token.
34. Style uses a property unsupported by the target platform.
35. UI behavior requires an event unsupported by the target platform.
36. Component/page fails to provide a required UI service such as Theme, Router, QueryClient, or MutationClient.
37. Unsafe HTML/string interpolation is used without a branded safe type.
38. Slot remapping points to an incompatible slot capability.
39. Collection behavior attaches to a non-collection slot.
40. Generated UI component hides all style/behavior handles and therefore cannot be customized safely.

---

# 32. Inference Requirements

The call site should rarely require explicit generics.

The system should infer:

```txt
entity value types
field names and field value types
field owner/nullability/optionality/defaults
store/dialect-specific column types
mapping read/create/update types
read-only/write-only/hidden fields
projection output types
relation include output types
nested include output types
function input/output/body/effects/requirements
query function input/output/error/effects
action function input/output/error/effects
patch function input/output/reconciliation requirements
form values and submit types from functions
UI slot maps
slot element capabilities
style handle names
style token names
behavior slot requirements
component requirements/errors/bindings
platform event/attribute types
collection slot item types
slot remapping compatibility
component prop compatibility
operation runtime requirements
expression input/output types
representation storage/wire types
trait applicability
store/runtime capabilities
target compatibility where practical
```

Use const generics and literal-preserving APIs.

```ts
function entity<const Name extends string, const Fields extends FieldShape>(
  name: Name,
  fields: Fields,
): Entity<Name, Fields>;
```

---

# 33. Testing Requirements

## 33.1 Type Tests

Use `tsd`, `expect-type`, or equivalent.

Type tests must cover:

```txt
field ref inference
entity inference
invalid field refs
relation inference
invalid relation includes
FK action compatibility
mapping compatibility
read-only write rejection
multi-store type availability
plugin helper availability
component prop mismatch
runtime unsupported operation
representation inference
staged expression type checking
trait applicability
static function inference
query/action/patch body compatibility
getter/mutator inference
UI slot inference
style attachment type errors
behavior attachment type errors
theme token type errors
slot remapping compatibility
collection slot behavior compatibility
platform renderer diagnostics
unsafe HTML branded type checks
```

## 33.2 Runtime Tests

Runtime tests must cover:

```txt
entity metadata
ref identity
plugin registration
plugin conflicts
mapping dependency collection
relation graph construction
runtime planning
diagnostics
artifact generation
```

## 33.3 Golden Tests

Adapters must have golden tests for generated output.

```txt
Drizzle schemas
Prisma schemas
Hono routes
React forms
OpenAPI documents
Zod schemas
migration files
client SDKs
```

## 33.4 Law Tests

Operations declaring laws may provide property tests.

```ts
gen.testing.testLaws(addInt, {
  arbitrary: gen.testing.int.arbitrary(),
  laws: [gen.law.associative(), gen.law.commutative()],
});
```

---

# 34. CLI Requirements

CLI should live outside core but use core lifecycle contracts.

Commands:

```txt
gen check
gen generate
gen watch
gen diff
gen migrate
gen doctor
gen graph
gen inspect
```

Config:

```ts
export default gen.defineConfig({
  modules: [BlogModule],
  output: {
    root: "./generated",
  },
  targets: [
    gen.drizzle.config(...),
    gen.hono.config(...),
    gen.react.config(...),
  ],
})
```

---

# 35. End-to-End Example

```ts
import { createGen } from "@gen/core";
import { relations } from "@gen/relations";
import { mapping } from "@gen/mapping";
import { api } from "@gen/api";
import { forms } from "@gen/forms";
import { authz } from "@gen/authz";
import { db } from "@gen/db";
import { postgres } from "@gen/db-postgres";
import { clickhouse } from "@gen/db-clickhouse";
import { mongo } from "@gen/db-mongo";
import { drizzle } from "@gen/drizzle";
import { hono } from "@gen/hono";
import { react } from "@gen/react";
import { zod } from "@gen/zod";

const gen = createGen({
  plugins: [
    relations(),
    mapping(),
    api(),
    forms(),
    authz(),
    db({
      stores: {
        primary: postgres({ version: "16" }),
        analytics: clickhouse({ version: "24" }),
        documents: mongo({ version: "7" }),
      },
      default: "primary",
    }),
    drizzle(),
    hono(),
    react(),
    zod(),
  ],
});

const User = gen.entity("User", {
  id: gen.uuid(),
  email: gen.email(),
  displayName: gen.string(),
  role: gen.enumOf(["user", "admin"]),
  lastSeenAt: gen.datetime().nullable(),
  preferences: gen.json(),
});

const Post = gen.entity("Post", {
  id: gen.uuid(),
  authorId: gen.uuid(),
  title: gen.string(),
  body: gen.string(),
});

const users = gen.db.primary.table("users", {
  id: gen.db.primary.column.uuid("id"),
  email: gen.db.primary.column.text("email"),
  firstName: gen.db.primary.column.text("first_name"),
  lastName: gen.db.primary.column.text("last_name"),
  role: gen.db.primary.column.text("role"),
});

const posts = gen.db.primary.table("posts", {
  id: gen.db.primary.column.uuid("id"),
  authorId: gen.db.primary.column.uuid("author_id"),
  title: gen.db.primary.column.text("title"),
  body: gen.db.primary.column.text("body"),
});

const events = gen.db.analytics.table("user_events", {
  id: gen.db.analytics.column.string("id"),
  userId: gen.db.analytics.column.uuid("user_id"),
  type: gen.db.analytics.column.string("type"),
  timestamp: gen.db.analytics.column.datetime("timestamp"),
});

const profiles = gen.db.documents.collection("user_profiles", {
  userId: gen.db.documents.field.uuid("userId"),
  preferences: gen.db.documents.field.json("preferences"),
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

const BlogGraph = gen.rel.graph({
  entities: [User, Post],
  relations: [PostAuthor],
});

const FullName = gen.op.iso({
  name: "fullName",
  input: gen.object({
    first: gen.string(),
    last: gen.string(),
  }),
  output: gen.string(),
  to: ({ first, last }) => `${first} ${last}`,
  from: parseFullName,
  capabilities: [gen.cap.pure(), gen.cap.deterministic(), gen.cap.reversible()],
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
    read: FullName.to({
      first: users.columns.firstName,
      last: users.columns.lastName,
    }),
    write: FullName.from({
      first: users.columns.firstName,
      last: users.columns.lastName,
    }),
  }),
  gen.mapping.mapField(User.fields.role, {
    read: users.columns.role,
    write: users.columns.role,
  }),
  gen.mapping.mapField(User.fields.lastSeenAt, {
    read: gen.query
      .from(events)
      .select(gen.op.max(events.columns.timestamp))
      .where(gen.eq(events.columns.userId, users.columns.id)),
    write: gen.mapping.readOnly(),
  }),
  gen.mapping.mapField(User.fields.preferences, {
    read: profiles.fields.preferences,
    write: profiles.fields.preferences,
  }),
]);

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
    User.fields.lastSeenAt,
    User.fields.preferences,
  ],
});

const UserPolicy = gen.authz.policy(User, {
  read: gen.authz.allow.authenticated(),
  create: gen.authz.allow.role("admin"),
  update: gen.authz.allow.owner(User.fields.id).or(gen.authz.allow.role("admin")),
  delete: gen.authz.allow.role("admin"),
});

const getUser = gen.api.getter(User, {
  name: "getUser",
  by: User.fields.id,
  projection: UserDetail,
  auth: UserPolicy.actions.read,
});

const listUsers = gen.api.getter.list(User, {
  name: "listUsers",
  projection: UserSummary,
  filter: gen.api.filter({
    search: gen.optional(gen.string()),
    role: gen.optional(User.fields.role.type),
  }),
  pagination: gen.api.pagination.cursor({
    cursor: User.fields.id,
    defaultLimit: 50,
  }),
});

const createUser = gen.api.mutator.create(User, {
  name: "createUser",
  input: [User.fields.email, User.fields.displayName, User.fields.role],
  mapping: UserMap,
  returns: UserDetail,
  auth: UserPolicy.actions.create,
  consistency: gen.consistency.transactional({ store: gen.db.primary }),
});

const updateUserPreferences = gen.api.mutator.update(User, {
  name: "updateUserPreferences",
  by: User.fields.id,
  input: [User.fields.preferences],
  mapping: UserMap,
  returns: UserDetail,
  consistency: gen.consistency.eventual(),
});

const UserResource = gen.api.resource(User, {
  path: gen.api.route`/users`,
  operations: [listUsers, getUser, createUser, updateUserPreferences],
});

const UserCreateForm = gen.forms.form(User, {
  name: "UserCreateForm",
  mode: gen.forms.mode.create(),
  fields: [
    gen.forms.field(User.fields.email, {
      widget: gen.forms.widgets.emailInput(),
      label: "Email",
    }),
    gen.forms.field(User.fields.displayName, {
      widget: gen.forms.widgets.textInput(),
      label: "Display name",
    }),
    gen.forms.field(User.fields.role, {
      widget: gen.forms.widgets.select({
        options: gen.forms.enumOptions(User.fields.role),
      }),
    }),
  ],
  submit: createUser,
});

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
  gen.react.component(UserCreateForm, {
    runtime: gen.runtimes.browserModern,
  }),
  gen.zod.schemas([User, Post]),
]);
```

---

# 36. Final Primitive Set

The best core primitives appear to be:

```txt
createGen
Plugin
Target
Ref
Metadata
Diagnostic
Artifact
Representation
SemanticType
StaticNode
StagedExpression
StaticFunction
Entity
FieldRef
Operation
Capability
Law
Effect
Runtime
Requirement
CheckLifecycle
GenerateLifecycle
```

The best standard primitives appear to be:

```txt
Trait
Store
StoreDialect
Table
Column
Collection
Index
Mapping
Projection
Relation
RelationEntity
Graph
Getter
Mutator
Resource
Policy
Form
Widget
ComponentContract
ElementCapability
SlotRef
UIView
UIComponent
Style
Behavior
Theme
Token
Renderer
Platform
Event
Fact
Rule
QueryView
Reducer
```

The best design direction:

```txt
Small core kernel.
Typed plugin context.
Named stores instead of hardcoded database namespaces.
Precise representations under ergonomic semantic types.
Static staged expression trees and static function bodies instead of runtime closures in portable definitions.
Traits as reusable validation/storage/behavior annotations.
Inline structs/tagged unions for value types.
Semantic entities separate from storage.
Mappings connect fields to storage/query/service expressions.
Relations are semantic and reusable.
Relation entities support N-ary/hypergraph relationships.
Operations carry capabilities/laws/effects/implementations.
Runtimes and stores declare capabilities.
Facts/rules/views/IVM are optional packages enabled by the same primitives.
Generation targets check compatibility and emit artifact IR.
Third-party packages extend the system through stable refs, metadata, diagnostics, runtimes, targets, representations, expressions, and artifacts.
```

Generated UI should be customized by attaching typed styles and behaviors to published handles,
not by editing generated files.

The design-system story should be:

```txt
Generated function/form contract
  -> generated View<Slots>
  -> design-system Style attachments
  -> behavior attachments
  -> platform renderer
```

This preserves the same architecture used elsewhere in the system:

```txt
semantic core
static analyzable IR
typed refs
external interpretation by plugins
```

This gives the library a strong foundation without forcing every full-app concern into core.
