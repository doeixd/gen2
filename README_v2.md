# gen2 (v2)

A **programmable domain compiler for full-stack applications**.

> Define your application's domain, actions, rules, boundaries, UI, and storage as typed, inspectable, and homoiconic TypeScript values. The compiler then checks, derives, generates, and evolves your application into robust, production-ready target artifacts—from Postgres SQL and IVM triggers to SolidStart frontend components.

---

## 🚀 The Philosophy

Most apps are built out of scattered implementation fragments: database schemas, ORM models, API routes, React components, forms, cache keys, auth middleware, and validation rules. The actual product meaning is hidden across all of that.

`gen2` flips this model:

**Application behavior should be data first. Derive, don't declare.**

Define the semantics once as a typed Intermediate Representation (IR). Instead of the source of truth being "whatever handwritten glue code happens to exist," the source of truth becomes a unified, strictly orthogonal graph of typed primitives:

```
Entity
SemanticType
Rule
Callable (Queries, Actions)
Dispatch (Events, Reactions)
Boundary (RPC, REST, Real-time)
StorageContainer
EntityView (Forms, Lists, CRUD)
DesignSystem
Requirement & Provider
```

### The Core Tenets

- **Everything is Data:** Business logic isn't trapped in an AST—it is a typed, inspectable object graph.
- **Type Inference as a Product:** The compiler does the heavy lifting of TypeScript generic acrobatics so you get perfect autocomplete and red squiggles on typos without ever manually typing generic parameters.
- **No Parallel Sources of Truth:** We eliminate glue code. When you change a Rule, the compiler updates your SQL Row-Level Security, disables your UI buttons, and adjusts cache invalidation triggers.
- **Compiler as a Library:** Target environments (Postgres, SolidStart, TanStack Query) are just plugins (`ArtifactEmitters`). Change your entire tech stack without rewriting a single line of business logic.

---

## 🧩 The Unified Primitives

Following the completion of our deep unification phases (Phases 5-7), `gen2` provides an elegantly small but expressive set of primitives:

### Domain & Logic

- **Entity & SemanticType:** Define the physical shape and semantic meaning of your data (e.g., a `string` vs. an `email`).
- **Callable (`QueryFunction`, `ActionFunction`):** Purely semantic descriptions of read/write operations and their declared effects.
- **Rule:** Pure, inspectable predicates used for business logic, authz, and Incremental View Maintenance (IVM).

### Execution & Boundaries

- **Dispatch:** Unifies events and reactions. It binds a `Trigger` (explicit or rule-derived) to a `Handler` (action or reducer), managing idempotency and outbox delivery.
- **Boundary:** Represents any cross-environment transition (Client → Server, Service → Service). It lowers to routes, RPC getters, or server actions based on the target emitter.

### Presentation & UI

- **EntityView:** Unifies forms, lists, editors, and CRUD into a single declarative derivation over an entity and its bound operations.
- **DesignSystem:** Unifies visual tokens, CSS slot mappings, and JS behaviors. `EntityView`s simply declare which `DesignSystem` they adhere to.

### Dependencies & State

- **Requirement & Provider:** A single topological dependency graph for everything from auth sessions to external RPC clients.
- **StoredValue:** Unifies frontend reactive state and offline persistence queues.
- **StorageContainer:** Unifies SQL tables, NoSQL collections, and KV keyspaces, making field mapping completely uniform.

---

## ⚡ The Compiler Pipeline

`gen2` does not just scaffold code for you to hand-edit forever. It is a true compiler pipeline.

1. **Primitive Registration:** You define your graph using the `gen.*` API.
2. **Checker Registry:** The compiler topologically sorts and runs a unified suite of `Checker`s to catch safety hazards (e.g., passing `server_only` state to the client, parallelizing non-commutative actions).
3. **Graph Pruning (Artifact Shaking):** The compiler crawls the `ReactiveGraph` from the app boundaries and prunes any unreferenced entities, queries, or dispatches.
4. **Artifact Emitters:** Target plugins consume the unified, pruned graph and emit code.

---

## 🎯 Built-In Target Emitters

- **Postgres DDL & RLS:** Emits strict schema migrations and Row-Level Security policies derived from your `Rule`s.
- **Incremental View Maintenance (IVM):** Identifies monotonic rules and automatically generates Postgres `CREATE TRIGGER` functions to maintain derived views.
- **SolidStart v2 / Effect-TS:** Generates optimized, full-stack reactive code including Server Actions, API routes, and TanStack Query / Effect-Atom hooks.
- **DevTools Visualizer:** Emits the `ReactiveGraph` and `ObligationGraph` as a JSON artifact to power a local interactive graph visualizer. Trace any UI re-render back to the exact domain Rule!

---

## 📦 Code Examples

With `gen2`, you are writing ASTs using a hyper-ergonomic DSL. Here are some examples of what this looks like in practice.

### 1. Defining Domain & Rules

```ts
import { createGen, lifecycle } from "gen2";

const { gen, ctx } = createGen();

// Define physical shape and semantic meaning
const User = gen.entity("User", {
  id: gen.types.uuid(),
  email: gen.types.email(),
  role: gen.types.enumOf("Role", ["admin", "user", "guest"]),
  archivedAt: gen.types.datetime({ optional: true }),
});

// Define pure, inspectable business logic (Rules)
const isAdmin = gen.rule.define("isAdmin", User, (u) =>
  gen.rule.eq(u.field("role"), gen.expr.literal("admin")),
);

const isActive = gen.rule.define("isActive", User, (u) => gen.rule.isNull(u.field("archivedAt")));
```

### 2. Actions, Auth, and Reactivity

Because the compiler knows your Rules, you can use them directly to protect Actions and derive UI states.

```ts
// Define an action to delete a user.
const deleteUser = gen.func.action({
  name: "deleteUser",
  input_type: gen.types.uuid(),
  returns: User,
  // Execute a delete operation where id == input
  body: gen.func.buildActionDelete(User, gen.rule.eq(User.fields.id, gen.ref("input"))),
  // Automatically lower 'isAdmin' into a Postgres RLS policy and Server API Guard!
  auth: gen.authz.policy(isAdmin),
});

// Bind the Action to the Reactive Graph
// The compiler automatically figures out optimistic update/rollback patches!
const deleteUserMutation = gen.reactivity.mutation({
  name: "deleteUserMut",
  action: deleteUser,
});
```

### 3. Deriving UI from the Graph

You don't write forms by hand. You bind your Action to an `EntityView`, and the compiler figures out the rest.

```ts
// Create a form that automatically binds to the `deleteUser` mutation
const userListForm = gen.ui.deriveForm(User, deleteUser, defaultView);

// The compiler knows that 'deleteUser' requires 'isAdmin'.
// When emitted, the frontend component will automatically disable the submit
// button and show a hint if the current logged-in user is not an admin!
```

### 4. Extending the Compiler (Custom Emitters & Traits)

If you need a specific Postgres feature (like a GIN index) or a custom DOM feature, you don't fork `gen2`. You attach a `Trait` and write an `ArtifactEmitter` plugin.

```ts
// 1. Tag your field with a custom trait
const Article = gen.entity("Article", {
  content: gen.types.withTrait(gen.types.string(), "postgres:gin_index"),
});

// 2. Write a tiny ArtifactEmitter that listens for that trait
const ginIndexEmitter = {
  name: "gin_index_emitter",
  target: "postgres",
  dependencies: ["tables"], // Run after base tables are emitted
  emit: (ctx) => {
    // Find all fields with our custom trait
    const fields = ctx.entities.flatMap((e) =>
      e.fieldList.filter((f) => gen.hasTrait(f, "postgres:gin_index")),
    );

    // Emit the custom SQL
    const sql = fields
      .map((f) => `CREATE INDEX idx_${f.name} ON ${f.owning_entity.name} USING GIN (${f.name});`)
      .join("\n");

    return [{ kind: "sql", target: "postgres", content: sql, source_refs: [] }];
  },
};

// 3. Register your emitter plugin
pluginCtx.registerEmitter(ginIndexEmitter);
```

### 5. Finalizing the Build

Once your graph is built, run the lifecycle checks and generate the targets.

```ts
const result = lifecycle.check(ctx);

if (result.status === "has_errors") {
  console.error("Semantic hazards found!", result.diagnostics);
  process.exit(1);
}

// Emits Postgres SQL, SolidStart components, DevTools JSON, etc.
lifecycle.generate(ctx);
```

---

## 🛠 Extensibility & Progressive Enhancement

**No Vendor Lock-In.**

`gen2` understands the difference between a best-case scenario and a fallback. If an optimistic update cannot be mathematically proven as reversible by inspecting your `ActionFunction` AST, the compiler gracefully degrades to a server round-trip refresh and emits a diagnostic explaining why.

If you decide to move away from SolidJS, you just swap the `ArtifactEmitter`. Your pure business logic (Entities, Rules, Actions) remains exactly the same.

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

# Scaffolding and File-System Generation
vp generate
```

---

## License

MIT
