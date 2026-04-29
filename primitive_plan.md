# Primitive Plan: Open Traits, Closed Core

> **Status:** Architectural Proposal  
> **Goal:** Replace rigid, closed primitive types with a composable, trait-based IR so that user-defined abstractions (workflows, reactions, jobs, etc.) can participate in the graph on equal footing with built-ins such as `func`, `query`, and `action`.

---

## 1. Problem Statement

If primitives like `func`, `query`, `action`, `rule`, `resource`, and `migration` are all closed, special-purpose types, the library will eventually feel rigid. Users and plugin authors will want to define new higher-level things that still participate in dependency analysis, effect tracking, key generation, and target lowering.

**Example:** A user defines a `workflow` abstraction:

```ts
const sendWelcomeEmail = myLib.workflow({
  name: "sendWelcomeEmail",
  input: UserCreated,
  steps: [findUser, renderEmail, sendEmail],
});
```

**Question:** Can `sendWelcomeEmail` be used wherever an action/function-like thing is expected?  
**Answer (today):** Probably not, because consumers check `thing.kind === "action_function"`.  
**Answer (target):** Yes—if it exposes the right _shape_.

---

## 2. Guiding Principle

```
Small closed core IR
+ open extension model
+ composable traits/capabilities
+ interpreters/generators over those traits
```

Do **not** hardcode everything into `gen.func.*`. Instead, make the system _protocol-oriented_.

---

## 3. Mental Model: Traits over Concrete Classes

Core objects should advertise **traits/capabilities**, not just a `kind` string.

### 3.1 Example Traits

| Trait                     | Meaning                                                   |
| ------------------------- | --------------------------------------------------------- |
| `StaticNode`              | Has an ID, name, metadata, and exists in the static graph |
| `NamedNode`               | Has a human-readable name                                 |
| `TypedNode`               | Carries input/output/error types                          |
| `CallableNode`            | Can be invoked like a function                            |
| `ReadableNode`            | Represents a read/query operation                         |
| `WritableNode`            | Represents a write/mutation operation                     |
| `EffectfulNode`           | Produces side effects                                     |
| `RequiresNode`            | Declares runtime requirements                             |
| `ReactiveNode`            | Participates in reactivity / cache invalidation           |
| `KeyedNode`               | Has a cache key family                                    |
| `PolicyProtectedNode`     | Governed by authorization rules                           |
| `ResourceLikeNode`        | Models a domain resource / entity                         |
| `MigrationStepNode`       | Represents a schema or data migration                     |
| `TargetInterpretableNode` | Can be lowered or interpreted by a target                 |
| `PlanNode`                | Contains a sub-graph or execution plan                    |

### 3.2 How Built-ins Map to Traits

**`QueryFunction`**

```
StaticNode
NamedNode
CallableNode
ReadableNode
RequiresNode
EffectfulNode
KeyedNode          (optional)
TargetInterpretableNode
```

**`ActionFunction`**

```
StaticNode
NamedNode
CallableNode
WritableNode
RequiresNode
EffectfulNode
ReactiveInvalidator  (optional)
TargetInterpretableNode
```

**`Workflow` (user-defined)**

```
StaticNode
NamedNode
CallableNode
RequiresNode
EffectfulNode
PlanNode
TargetInterpretableNode
```

Because all three implement `CallableNode`, a route loader or mutation handler can accept any of them—as long as the _trait contract_ is satisfied.

---

## 4. Core `StaticNode` Protocol

A shared base shape that every first-class node should expose:

```ts
interface StaticNode<
  Kind extends string = string,
  In = unknown,
  Out = unknown,
  Err = never,
  Req = never,
  Eff = never,
> {
  readonly kind: Kind;
  readonly id: StaticId;
  readonly name?: string;

  readonly traits: readonly Trait[];

  readonly input?: SemanticType<In>;
  readonly output?: SemanticType<Out>;
  readonly errors?: readonly ErrorType[];

  readonly requires?: readonly Requirement[];
  readonly effects?: readonly Effect[];

  readonly metadata?: StaticMetadata;

  // phantom slots for type inference
  readonly _input?: In;
  readonly _output?: Out;
  readonly _errors?: Err;
  readonly _requires?: Req;
  readonly _effects?: Eff;
}
```

> **Key point:** All first-class things must expose common metadata so that generic composition, graph analysis, and target lowering can operate uniformly.

---

## 5. `CallableNode` / `FunctionLike` as a Protocol

```ts
interface CallableNode<In, Out, Err = never, Req = never, Eff = never> extends StaticNode<
  string,
  In,
  Out,
  Err,
  Req,
  Eff
> {
  readonly traits: readonly ["callable", ...Trait[]];
  readonly callPlan: CallPlan<In, Out>;
}
```

**Anything** can be callable:

- `QueryFunction`
- `ActionFunction`
- `Rule` evaluator
- `Workflow`
- `Service` method
- `Migration` transform
- `Reaction` runner
- Generated client operation

### 5.1 Consumers Should Demand Traits, Not Kinds

| Consumer needs         | Trait contract                                                          |
| ---------------------- | ----------------------------------------------------------------------- |
| Route loader           | `CallableNode<Params, LoaderData> & ReadableNode & ServerPlaceableNode` |
| Mutation handler       | `CallableNode<Input, Output> & EffectfulNode & ServerPlaceableNode`     |
| Cacheable query source | `KeyedNode & ReadableNode`                                              |
| Background job target  | `PlanNode & EffectfulNode`                                              |

---

## 6. What Stays Closed vs. What Stays Open

| Closed Core Algebra        | Open Object Model |
| -------------------------- | ----------------- |
| `Expr` nodes               | `functions`       |
| `ActionExpr` / `QueryExpr` | `resources`       |
| Operation variants         | `workflows`       |
| `Placement`                | `routes`          |
| `FallbackPlan`             | `policies`        |
| `Diagnostic`               | `generators`      |
| `Requirement`              | `migrations`      |
| `Effect`                   | `reactions`       |
|                            | `modules`         |

**Rule of thumb:**

- **Expression-level IR** is relatively closed because targets need exhaustive handling.
- **Application-level nodes** are extensible because users will invent new abstractions.

---

## 7. Plugin-Defined Nodes

A plugin should be able to register a new node kind alongside its traits, checker, graph deriver, and target interpreters.

```ts
const workflowPlugin = gen.plugin({
  name: "@gen/workflow",

  nodes: {
    workflow: gen.nodeKind({
      traits: ["callable", "effectful", "plan"],
      check: checkWorkflow,
      deriveGraph: deriveWorkflowGraph,
      interpret: {
        effect: generateEffectWorkflow,
        temporal: generateTemporalWorkflow,
        plainTs: generatePlainWorkflow,
      },
    }),
  },

  namespace(gen) {
    return {
      workflow: {
        define: defineWorkflow,
      },
    };
  },
});
```

**Usage:**

```ts
const onboarding = gen.workflow.define({
  name: "onboardUser",
  input: UserCreated,
  steps: [createProfile, sendWelcomeEmail, addToDefaultWorkspace],
});
```

Because it implements `CallableNode`, it can be used anywhere that accepts callable/effectful plans.

---

## 8. Generic Composition over Traits

Composition primitives should operate on traits, not on concrete kinds.

```ts
gen.plan.sequence([a, b, c]);
gen.plan.parallel({ user, projects, notifications });
gen.plan.map(node, expr);
gen.plan.chain(node, next);
gen.plan.retry(node, policy);
gen.plan.withRequirement(node, Service);
gen.plan.withFallback(primary, fallback);
gen.plan.withPlacement(node, placement);
```

These work across node kinds as long as the traits line up.

**Example:**

```ts
const loadDashboard = gen.plan.parallel({
  user: getCurrentUser,
  projects: listProjects,
  notifications: listNotifications,
});
```

This preserves:

- Input type
- Output object type
- Union of errors
- Union of requirements
- Union of effects
- Parallel graph edges

---

## 9. Requirements and Effects Are the Glue

Requirements and effects must bubble through composition.

Given:

```
getUser   requires Database
sendEmail requires EmailService
audit     requires AuditLog
```

Then:

```ts
const workflow = gen.plan.sequence([getUser, sendEmail, audit]);
```

Infers:

```
requires: Database | EmailService | AuditLog
effects:  Read<User> | SendEmail | Write<AuditLog>
```

This is exactly what makes custom primitives compose seamlessly.

---

## 10. Targets: Interpret Traits, Not Only Kinds

Targets can support concrete kinds:

```
query_function
action_function
route
reactive_resource
```

But they should also support **trait-based lowering** where possible:

```
callable + readable      -> route loader
callable + effectful     -> mutation handler
keyed + readable         -> query resource
plan + effectful         -> job / workflow target
```

If a target does not natively support a custom node, it can ask whether the node **lowers** to known primitives.

### 10.1 Lowering

Every extension node should optionally provide lowerings:

```ts
interface LowerableNode {
  readonly lowersTo?: readonly StaticNode[];
}
```

**Examples:**

| Custom abstraction | Lowers to                                                             |
| ------------------ | --------------------------------------------------------------------- |
| `Workflow`         | `ActionFunction` sequence                                             |
| `CRUD`             | `QueryFunction` + `ActionFunction` + keys + forms + routes + policies |
| `Reaction`         | `EventSubscription` + `ActionFunction` + `OutboxPlan`                 |
| `Migration`        | Target-specific DDL/DML steps                                         |

**A custom abstraction must not trap the graph.** It must either:

1. Be directly interpreted by the target, **or**
2. Lower into known core IR, **or**
3. Produce a diagnostic.

---

## 11. Avoid Inheritance-Heavy Design

Prefer:

```
plain static records
discriminated unions for core IR
trait metadata
type-level phantom slots
plugin registries
checker / interpreter hooks
lowering hooks
```

Keep the runtime model **data-first**.

---

## 12. Proposed Architecture Layers

```
1. Core kernel
   - StaticNode
   - Trait
   - SemanticType
   - Expr
   - Requirement
   - Effect
   - Diagnostic
   - Placement
   - FallbackPlan
   - Artifact
   - Registry

2. Algebra packages
   - query IR
   - action IR
   - rule / predicate layer
   - storage mapping
   - key / reactivity model

3. Derived semantic packages
   - CRUD
   - authz
   - router
   - forms
   - reactions
   - migrations
   - workflows

4. Graph compiler
   - dependency extraction
   - lowering
   - validation
   - placement planning
   - requirement / effect bubbling
   - artifact graph

5. Target plugins
   - SQL / Postgres
   - Hono / API
   - React / TanStack
   - Effect
   - docs / tests / devtools
```

Packages in **layer 3** lower into **layer 1/2** primitives and register graph metadata.

---

## 13. Design Rule for Every New Abstraction

For every new abstraction, ask:

```
What canonical primitives does it lower to?
What traits does it implement?
What requirements / effects does it add?
What graph edges does it produce?
What targets can interpret it?
What diagnostics can it emit?
```

### 13.1 Example: CRUD

```
Traits:
  named, generated, resource-collection, policy-protected, reactive

Lowers to:
  query functions, action functions, key families, forms, routes, policies

Graph edges:
  entity -> queries
  actions -> writes
  policies -> rules
  queries -> keys
  actions -> invalidates keys
```

### 13.2 Example: Reaction

```
Traits:
  named, effectful, subscribes, delivery-planned

Lowers to:
  rule / predicate, event subscription, action function, outbox / job plan
```

---

## 14. User-Defined Nodes

Users should be able to define custom nodes through a builder that declares traits.

```ts
const myFunc = gen.node.define({
  kind: "my.custom_func",
  name: "myFunc",

  traits: ["callable", "effectful"],

  input: MyInput,
  output: MyOutput,

  requires: [Database],
  effects: [WriteThing],

  lowerTo: ({ input }) =>
    gen.func.action({
      name: "myFunc.lowered",
      input: MyInput,
      returns: MyOutput,
      body: ...,
    }),
});
```

Any consumer that accepts `CallableNode<MyInput, MyOutput>` can now use it.

For ergonomic package authors, wrap the boilerplate:

```ts
const myFunc = myPlugin.func({
  name: "myFunc",
  input: MyInput,
  returns: MyOutput,
  body: ...,
});
```

---

## 15. TypeScript Challenge: Preserving Inference Through Open Plugins

The hard part is preserving type inference when plugins dynamically extend the `gen` namespace.

**Approach:**

- Use plugin-returned namespace typing (or module augmentation).
- Provide generic helper types that operate on the phantom slots of `StaticNode`, not on concrete classes.

```ts
const gen = createGen({
  plugins: [workflowPlugin, migrationsPlugin],
});

gen.workflow.define(...); // typed
```

### 15.1 Generic Helpers (operate on any node)

```ts
InferNodeInput<T>;
InferNodeOutput<T>;
InferNodeErrors<T>;
InferNodeRequirements<T>;
InferNodeEffects<T>;
InferNodeTraits<T>;
```

Specialized helpers can be thin aliases:

```ts
InferActionInput<A> = InferNodeInput<A>; // where A extends ActionFunction
```

**Avoid** making `InferActionInput` the _only_ path; keep the generic node helpers primary.

---

## 16. “Ports” or Interfaces

Some APIs should accept an **interface** (trait contract), not a concrete node.

```ts
type RouteLoader<I, O> = CallableNode<I, O> & ReadableNode & ServerPlaceableNode;
```

Then:

```ts
gen.route({
  path: "/projects",
  loader: listProjects, // QueryFunction, Resource, Workflow, etc.
});
```

Likewise:

```ts
type MutationHandler<I, O> = CallableNode<I, O> & EffectfulNode & ServerPlaceableNode;
```

This makes the system **open without being sloppy**.

---

## 17. Public API Abstraction Level

| Audience                    | Mental model                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Everyday users              | `gen.func.query(...)`, `gen.func.action(...)`, `gen.crud.derive(...)`, `gen.route(...)` |
| Plugin authors              | Traits, `StaticNode`, lowering hooks, registries                                        |
| Advanced users              | `gen.node.define(...)`, custom trait composition                                        |
| Internal compiler / targets | Trait-based dispatch, graph edges, diagnostics                                          |

The trait system is **mostly invisible** to everyday users but **fully available** to plugin authors and the compiler.

---

## 18. Verdict

**Yes—there is a better design.**

Do not make each primitive a closed island. Instead:

1. **Make primitives implement shared protocols.**
2. **Make higher-level abstractions lower to canonical IR.**
3. **Make composition work over traits.**
4. **Make targets interpret traits and known lowerings.**
5. **Make requirements, effects, keys, and diagnostics graph-wide.**

The architecture should feel like:

```
Closed enough for reliable generation.
Open enough for new semantic abstractions.
```

The best version of this library is **not** a giant list of hardcoded `gen.*` features. It is:

```
A small semantic compiler kernel
with typed, composable, extensible application IR nodes.
```

That is what lets someone define `myFunc`, `workflow`, `subscription`, `report`, `importJob`, `approvalFlow`, or `billingPlan`—and still have it participate in auth, reactivity, keys, migrations, routes, tests, docs, and targets.
