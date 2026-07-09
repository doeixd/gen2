# The Language Within A Language

Every great abstraction tends to eventually resemble a language.

And when I say language, I mean a discrete set of data types with
particular properties, invariants, and interaction rules. Everything in
the abstraction can be described or created from other things inside the
abstraction, except for the primitives.

What is a primitive?

A primitive is the foundational layer of your abstraction. The unit of
maximum composability. The source of causation. The thing everything
else is built from.

The important part is that the abstraction is screened off from the
implementation. You do not manipulate the implementation directly. You
manipulate the primitives, and the implementation becomes a lowering.

This is a very abstract definition. It can basically describe all of
programming. And probably the entire universe.

But nevertheless, this is where abstractions tend to go.

Look at the popular abstractions in the TypeScript community today.
React. Drizzle. Zod. Effect.

When you squint, you can see what I mean. All of these have been accused
of being their own languages. They all have primitives. Those primitives
compose. And the user mostly works inside the abstraction, not inside the
implementation.

That is why React can target different renderers. Drizzle can target
different databases. Zod schemas can be reused across boundaries. Effect
layers are implementation agnostic.

This ability arises from a few specific properties:

1. Transitions happen inside the abstraction. Causality comes from things
   at the same layer.
2. The abstraction contains enough data to lower correctly to a lower
   level. Drizzle needs database-specific column types because otherwise
   it cannot emit correct database-specific SQL.
3. The data and transitions are inspectable. They are static, declared,
   and visible to other things inside the abstraction. They are not just
   opaque callbacks.

The thing all these abstractions have in common is that they eventually
care about the shape of your data and the transitions that act on it.

Some make that explicit. Drizzle asks for a schema. GraphQL asks for a
schema. TanStack DB asks for collections. Zod asks for schemas. The
shape of the data is included in the language of the abstraction, and
that gives the abstraction power.

We have all seen code generation from schemas before. The entire GraphQL
ecosystem is based on it.

But what if you went further?

At some point, if you keep going, you stop looking like "a schema
library" and start looking like a compiler IR.

You would define your data types, operations, rules, invariants,
effects, targets, and lowering rules. And from that, you could derive
much more of the app.

If you knew enough about the data, the transitions, and the invariants,
you could derive most of the product.

Normally this information is scattered throughout the codebase. Some of
it is in database migrations. Some of it is in validators. Some of it is
in forms. Some of it is in auth middleware. Some of it is in React
components. Some of it is just in someone's head.

And a lot of it is dynamic and uninspectable.

For full derivability, it needs to be static and inspectable. Like a
GraphQL or Drizzle schema on steroids.

In the past, people have tried this sort of thing with state charts,
diagrams, schema files, and model-driven development tools. People
usually hate working this way.

It is not easily composable. We do not want to learn another language.
No one enjoys fiddling around with giant schema files. And it is slow to
manually write down every invariant and every edge case.

But this changes with AI agents.

AI agents do not mind picking up a new language. They do not mind
writing out every invariant they can find. They do not mind editing a
large graph of facts. They do not share our preferences.

Because of this, I think new languages will emerge that are not shaped
primarily for human enjoyment, but for AI utility.

The human interface can stay TypeScript. The agent interface can be the
IR.

All this to introduce:

## Dirived.

Dirived is a graph IR language whose main interface is typed TypeScript objects.

_Derived with IR. Get it? lol._

It sounds a little crazy. But it is what you get if you ask:

> What if we took Drizzle, GraphQL, React, Zod, and Effect to their
> logical conclusion?

## Define Your Data

In Dirived, domain/data is a graph of typed facts.

You define semantic types, entities, fields, relations, traits, storage
representations, codecs, and target constraints. The important thing is
that these are inspectable values, not comments and not erased types.

```ts
import { gen } from "@dirived/kit";

const app = gen.app("Billing", (g) => {
  const Types = g.types.registry({
    CustomerId: g.types.uuid().brand("CustomerId"),
    InvoiceId: g.types.uuid().brand("InvoiceId"),
    Email: g.types.email().trait(g.traits.clientSafe()),
    Money: g.types.money().storage(g.types.repr.decimal({ precision: 12, scale: 2 })),
    InvoiceStatus: g.types.enum("draft", "issued", "paid", "void"),
  });

  const Customer = g.entity("Customer", (t) => ({
    id: t.CustomerId(),
    email: t.Email(),
    displayName: t.text(),
  }));

  const Invoice = g.entity("Invoice", (t) => ({
    id: t.InvoiceId(),
    customerId: t.ref(Customer),
    total: t.Money(),
    status: t.InvoiceStatus(),
    issuedAt: t.datetime().optional(),
  }));

  return { Types, Customer, Invoice };
});
```

This is not just a schema.

The graph now knows:

- `Invoice.total` is money, not just a number.
- `Customer.email` is client-safe email, not just a string.
- `Invoice.customerId` references `Customer`.
- `Money` has a storage representation and a codec.
- `InvoiceStatus` is a finite domain, so targets can generate enum
  checks, UI controls, SQL constraints, tests, and docs.

That is the basic move: make domain meaning visible to the abstraction.

## Define Operations

Once the system knows your types, it can know your operations.

An operation is not just a function. It is a typed computation over
semantic types, with laws, effects, identity behavior, and lowerability.

```ts
const AddMoney = defineOperation(app.id.op("money.add"))
  .input({ left: app.Types.Money(), right: app.Types.Money() })
  .output({ sum: app.Types.Money() })
  .impl(({ left, right }) => expr.add(left, right))
  .laws((self) =>
    Laws.all(
      Laws.associative(self).withAssurance(ByConstruction),
      Laws.commutative(self).withAssurance(ByConstruction),
      Laws.identity(self, "0.00").withAssurance(Tested),
      Laws.deterministic(self).withAssurance(ByConstruction),
    ),
  );
```

The laws do a lot of heavy lifting for the compiler and later codegen steps.

If an operation is associative and commutative, a target can choose a
parallel reduction. If it has an identity, an empty collection has a
well-defined result. If it is deterministic and idempotent, retry and
cache behavior can be derived more safely.

The same pattern applies to actions:

```ts
const IssueInvoice = app
  .action("IssueInvoice")
  .input({ invoice: app.Types.ref(app.Invoice) })
  .requires(app.rules.InvoiceIsDraft)
  .writes(app.Invoice.fields.status, app.Invoice.fields.issuedAt)
  .run(({ invoice }) =>
    patch(invoice, {
      status: "issued",
      issuedAt: expr.now(),
    }),
  )
  .laws((self) =>
    Laws.all(
      Laws.returnsSameIdentity(self, { of: "invoice" }),
      Laws.consumesInput(self, { of: "invoice" }),
      Laws.deterministic(self).except("issuedAt"),
    ),
  );
```

This is the difference between "some code that mutates an invoice" and
"an inspectable domain transition."

The graph can see what it reads, what it writes, what preconditions it
requires, what identity it preserves, and which targets can safely lower
it.

## Define Rules And Invariants

Rules are business logic.

Patterns are graph queries.

Queries are runtime data access.

This distinction matters.

A rule answers:

> Is this business condition true?

A pattern answers:

> Where do these graph facts connect?

A query answers:

> What runtime data should I load from storage?

Example rule:

```ts
const CanViewInvoice = app.rule.for(app.Invoice, ({ field, actor }) =>
  expr.or(
    expr.eq(actor.customerId, field(app.Invoice.fields.customerId)),
    expr.eq(actor.role, "admin"),
  ),
);

const InvoiceIsDraft = app.rule.for(app.Invoice, ({ field }) =>
  expr.eq(field(app.Invoice.fields.status), "draft"),
);

const InvoiceTotalIsPositive = app.rule.for(app.Invoice, ({ field }) =>
  expr.gt(field(app.Invoice.fields.total), app.Types.Money.literal("0.00")),
);
```

These rules can be used by auth, actions, queries, forms, tests, RLS,
and UI state.

```ts
const ListInvoices = app
  .query("ListInvoices")
  .from(app.Invoice)
  .where(CanViewInvoice)
  .orderBy(app.Invoice.fields.issuedAt, "desc")
  .key(({ actor }) => ["invoices", actor.customerId]);

const CreateInvoice = app
  .action("CreateInvoice")
  .insert(app.Invoice)
  .requires(InvoiceTotalIsPositive);
```

Under the hood, these become graph facts:

```txt
ListInvoices usesRule CanViewInvoice
CanViewInvoice readsField Invoice.customerId
IssueInvoice writesField Invoice.status
CreateInvoice requiresRule InvoiceTotalIsPositive
```

Then patterns can find relationships between facts:

```ts
const RuleInvalidation = definePattern(app.id.pattern("ruleInvalidation"))
  .edge("write", CallableDialect.edges.actionWritesField)
  .edge("read", RuleDialect.edges.ruleReadsField)
  .same("write.field", "read.field")
  .edge("guard", QueryDialect.edges.queryUsesRule)
  .same("guard.rule", "read.rule");
```

That pattern is not business logic. It is compiler logic.

It says:

> Find actions that write fields read by rules used by queries.

From that, Dirived can derive cache invalidation, optimistic update
scope, reactivity keys, and diagnostics.

Invariants sit one level above this. They verify that the graph is
coherent.

```ts
const RulesUsedByPostgresQueriesMustLowerToSql = defineInvariant({
  id: app.id.invariant("rulesUsedByPostgresQueriesMustLowerToSql"),
  match: QueryUsesRuleOnPostgres,
  check: ({ query, rule, target }) => rule.lowerableTo(target.surfaces.sqlPredicate),
  diagnostic: ({ query, rule }) => ({
    code: "postgres.rule_not_sql_lowerable",
    message: `${query.name} uses ${rule.name}, but the rule cannot lower to SQL.`,
    repairs: [
      repairs.moveEnforcementToServer(query, rule),
      repairs.addSqlLowering(rule),
      repairs.changeQueryTarget(query, ServerQueryTarget),
    ],
  }),
});
```

That is the loop:

```txt
facts -> pattern match -> invariant -> diagnostic -> repair patch
```

## Derive The App

Once the graph knows your data, operations, rules, and invariants, it can
derive a lot of the app.

Not because of magic.

Because the facts are there.

Dirived can derive:

- getters and setters;
- SQL schemas and migrations;
- SQL queries;
- RLS policies;
- Zod-like validators;
- JSON schemas and OpenAPI;
- server handlers;
- routes;
- pages;
- forms;
- data tables;
- optimistic updates;
- cache invalidation;
- IVM plans;
- test matrices;
- audit explanations;
- documentation.

You preview before you emit:

```ts
const preview = app.preview({
  pipelines: [
    PostgresDialect.pipelines.emitSchema,
    PostgresDialect.pipelines.emitRls,
    EffectServerDialect.pipelines.emitHandlers,
    ReactDialect.pipelines.emitForms,
    TanstackQueryDialect.pipelines.emitClient,
    OpenApiDialect.pipelines.emitSpec,
  ],
});

preview.print();
preview.diagnostics;
preview.patches;
preview.artifacts;
preview.explanations;

await app.verify(preview);
await app.emit(preview, { outDir: "generated" });
```

If something is missing, the compiler does not just fail with a string.
It can produce a typed diagnostic:

```txt
Diagnostic: postgres.rule_not_sql_lowerable

ListInvoices uses CanViewInvoice.
CanViewInvoice calls Geo.distanceWithin.
Postgres target has no lowering for Geo.distanceWithin.

Repairs:
1. Move enforcement to server.
2. Add a PostGIS lowering for Geo.distanceWithin.
3. Mark this query as not RLS-backed.
```

That diagnostic can carry candidate graph patches. An agent can preview
the repair, apply it, rerun verification, and show the semantic diff.

This is why the graph matters.

The graph is the shared substrate between humans, AI agents, compiler
passes, target dialects, diagnostics, and generated code.

## The Catch

There is a catch.

Every derived thing needs a lowering.

Dirived does not magically know how to emit your exact Postgres schema,
your exact React component library, your exact deployment target, or your
exact internal API style.

Those are dialects, morphisms, surfaces, passes, pipelines, and artifact
kinds.

For example, turning an entity into a Postgres table is a morphism:

```ts
const EntityToTable = defineMorphism({
  id: PostgresDialect.id.morphism("entityToTable"),
  phase: MorphismPhase.lower,
  from: DomainDialect.patterns.entityWithFields,
  to: {
    nodes: [PostgresDialect.nodes.table, PostgresDialect.nodes.column],
    edges: [PostgresDialect.edges.tableHasColumn],
  },
  map: ({ match, patch }) => [
    patch.addNode(PostgresDialect.nodes.table, {
      id: PostgresDialect.id.node("table", match.entity.name),
      name: match.entity.name,
    }),
    patch.addNode(PostgresDialect.nodes.column, {
      id: PostgresDialect.id.node("column", match.field.name),
      name: match.field.name,
      type: PostgresDialect.mapSemanticType(match.field.semanticType),
    }),
    patch.addEdge(PostgresDialect.edges.tableHasColumn, {
      table: match.entity,
      column: match.field,
    }),
  ],
});
```

That looks like compiler work because it is compiler work.

But AI agents are good at this kind of work. They are good at writing
repetitive, explicit, structured transformations. They are good at
adding invariants. They are good at filling in metadata. They are good
at checking every edge case that humans get bored of writing down.

And once enough dialects exist in the ecosystem, most apps will not need
to define these lowerings from scratch.

They will compose existing ones.

That is the bet.

The most token-efficient way to build an app may not be to ask an agent
to write every file directly.

It may be to ask the agent to edit the semantic graph, verify the graph,
and let the compiler derive the files.

## One Graph, Many Products

Because the graph is screened off from the implementation, targets
become a choice.

The same domain graph can lower to different stacks:

```ts
await app.emit(RailsDialect.pipelines.emitApp, {
  outDir: "generated/rails",
});
```

or:

```ts
await app.emit(ReactStartDialect.pipelines.emitApp, {
  outDir: "generated/react-start",
});
```

or:

```ts
await app.emit({
  server: EffectServerDialect,
  database: PostgresDialect,
  client: SolidStartDialect,
  sync: TanstackQueryDialect,
});
```

In theory, you can turn a Rails-shaped app into a React-shaped app with
one target change.

In practice, targets have capabilities. Some rules lower to SQL. Some
only lower to server code. Some UI targets support optimistic updates.
Some do not. Some databases support the constraint you want. Some do
not.

So the compiler has to be honest.

It needs lowerability reports, diagnostics, repairs, and explicit escape
hatches.

Opaque code is allowed. Unknown impact is not.

```ts
const FraudScore = app.rule.custom("FraudScore", {
  runtime: app.runtime.serverOnly(checkFraudScore),
  reads: [app.Invoice.fields.total, app.Customer.fields.email],
  traits: [NotSqlLowerable, NotClientSafe],
});
```

Now the graph knows the blast radius:

```txt
FraudScore can enforce on the server.
FraudScore cannot lower to RLS.
FraudScore cannot be used as a client-only UI predicate.
Queries guarded by FraudScore need server enforcement.
```

That is the shape of the system.

Not "no escape hatches."

Typed escape hatches.

## Why This Exists

Dirived is domain-driven design taken seriously.

Not as folders and naming conventions.

As an actual IR.

The product is not the generated code. The product is the semantic graph
that can explain, verify, repair, and regenerate the code.

The point is not to replace TypeScript. The point is to use TypeScript
as the typed host language for authoring a deeper language underneath
it.

A language within a language.

One that humans can write when they want to.

One that agents can edit when they need to.

One that targets can lower.

And one that can finally make the important parts of an application
visible enough to derive from.
