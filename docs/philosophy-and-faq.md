# Gen2: Philosophy & FAQ

Gen2 is not a traditional web framework. It is a **programmable domain compiler**.

Instead of writing imperative glue code to connect your database, your APIs, and your frontend, you define the _semantic meaning_ of your application using a strictly-typed Intermediate Representation (IR). The compiler then derives the optimal full-stack implementation—from Postgres Row-Level Security policies to SolidJS reactive frontend forms.

This document explains the core philosophy behind `gen2`, addresses common criticisms, and answers the most frequently asked questions from teams evaluating it.

---

## 🧠 Core Philosophy

### 1. "Everything is Data" (Homoiconicity)

In most systems, your business logic is trapped inside the Abstract Syntax Tree (AST) of the JavaScript parser. In `gen2`, you write the AST directly using typed data structures (the `gen.*` API).
Because your application is just data (`{ kind: "action", ... }`), it is trivially inspectable, queryable, and transformable.

### 2. Derive, Don't Declare

If you have a database schema, an API route, and a frontend form, you usually have three parallel sources of truth. `gen2` eliminates this. You declare a semantic `Entity`, a pure `Rule`, and a write `Action`. The compiler _derives_:

- Which cache keys need to be invalidated.
- Which fields should be disabled in the UI.
- What SQL triggers are needed for Incremental View Maintenance (IVM).
- What security checks run on the server API.

### 3. Compiler as a Library

`gen2` is structured as a pipeline: **Primitives → Open Nodes → Lifecycle Checkers → Artifact Emitters**.
It doesn't hide the build process. If you want to change how a specific UI component renders, you don't fork the framework; you write a tiny `ArtifactEmitter` plugin that intercepts the graph and emits your custom code.

---

## ❓ Frequently Asked Questions & Criticisms

### Isn't this just UML / Model-Driven Architecture (MDA) from the 2000s?

**The Criticism:** _The industry tried generating code from models decades ago and it failed because visual diagrams and heavy XML configurations can't express complex business logic. Code is better._

**The Gen2 Answer:** We agree! That’s why `gen2` is **100% code**. You don't use a drag-and-drop tool or XML. You use standard TypeScript to build your domain graph. You get full IDE support, refactoring, code reviews, and Git diffs. We took the _theory_ of MDA and implemented it using modern type systems and developer-first ergonomics.

### What if I need a very specific feature, like a Postgres GIN index or a CSS animation? Am I locked out?

**The Criticism:** _Abstractions always leak. The moment I need a database-specific feature or a highly custom DOM interaction, the generic `gen2` IR won't support it, and I'll be stuck._

**The Gen2 Answer:** You are not locked out, and you don't need to fork the compiler. `gen2` is built on an "Open Node" and "Trait" architecture specifically for this reason:

- **Traits:** If you need a Postgres GIN index, you don't need the core library to understand it. You attach a custom trait: `withTrait(myField, "postgres:gin_index")`. You then write a 10-line plugin for the `PostgresEmitter` that listens for that trait and outputs the exact SQL you need.
- **Open Nodes:** If you need a completely new concept (like a custom Cron Job or an LLM call), you define a new `StaticNode` with the `"callable"` and `"effectful"` traits. The compiler's reactivity graph and lifecycle checkers instantly know how to sequence it alongside built-in nodes.

### Will the massive TypeScript complexity ruin my Developer Experience (DX)?

**The Criticism:** _The source code uses insane TypeScript gymnastics (Phantom types, recursive generic inference). When I make a mistake, I'm going to get a 400-line unreadable TS error, and my Language Server is going to crash._

**The Gen2 Answer:** The library authors absorbed that massive type-level complexity _specifically so you don't have to_.
When you use `gen.action({ input_type: gen.types.uuid(), ... })`, TypeScript invisibly infers that type and cascades it down to your action body. You never type out generic arguments.
**The Magic:** If you accidentally try to map a string literal to a numeric field, the complex type helpers (like `EnforceMixedFieldSpec`) are designed to do exactly one thing: **put the red squiggly line exactly on your typo**. You get perfect autocomplete and localized errors, backed by a robust type system that prevents you from wiring things together incorrectly.

### How on earth do I debug this?

**The Criticism:** _If a bug appears in my SolidJS frontend, but I didn't write the SolidJS code (the emitter did), how do I trace it back to my `gen2` domain logic?_

**The Gen2 Answer:** Because the entire application is an inspectable graph of data, `gen2` provides observability that traditional frameworks can only dream of.
Phase 7 introduces the **DevTools Emitter**. It takes the exact same graph used to generate your code and generates an interactive UI. You can click on a broken frontend query and visually trace the edge exactly back to the `Action`, `Rule`, or `KeyFamily` that caused the issue. The mapping between your semantic IR and the emitted artifact is 1:1.

### Aren't I heavily vendor-locked into Gen2?

**The Criticism:** _If I use Next.js, I can at least copy-paste my React components. If I use Gen2, my whole app is trapped in your proprietary IR._

**The Gen2 Answer:** You actually have _more_ freedom, because **you own the emitters**.
If you decide to move away from SolidJS to React, or Postgres to MySQL, you don't rewrite your application's business logic. You swap out the `ArtifactEmitter` plugin.
If you decide to leave `gen2` entirely, you run the compiler one last time, take the highly-optimized, human-readable React/Postgres code it generated, and just maintain that standard codebase moving forward. You are locked into a compiler that outputs standard code, not a proprietary runtime engine.

---

## 🚀 Who is Gen2 for?

Gen2 represents a shift from **Product Engineering** to **Platform Engineering**.

It is designed for teams that want **massive leverage**. To adopt `gen2` effectively, you need:

1.  **Platform Mindset:** Engineers comfortable tweaking `ArtifactEmitters` and defining custom `Traits` to map exactly to your company's physical infrastructure.
2.  **Product Velocity:** Once the emitters are set, product engineers can define `Entities`, pure `Rules`, and `Actions` at lightning speed. They never write a `fetch` call. They never manually invalidate a cache. They never write a SQL migration by hand. The platform handles the plumbing.

If you are tired of spending 80% of your sprint writing glue code to make your database, API, and frontend agree with each other, `gen2` is for you.
