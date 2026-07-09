# Gen2 Transition Instructions for AI Agents

## Mission

Transition the Gen2 library from the current runtime-first kernel APIs to the ideal typed semantic graph design.

The goal is not to rewrite the runtime IR into a complicated type-level system. The goal is to keep the runtime graph simple and serializable while adding a high-DX typed authoring layer on top.

Target architecture:

```txt
Runtime IR
  Simple, serializable, broad graph objects.

Typed witnesses
  Dialects, node kinds, edge kinds, types, traits, laws, artifact kinds, passes, lowerings.

Composable authoring API
  object form, builder form, curried form, callback ctx form, .class form where useful, graph pipe/fragments.

Dynamic boundary
  Decode and refine plugin/runtime data before using typed APIs.
```

The new design should make this possible:

```ts
class User extends domain.entity.class("User", {
  fields: {
    id: field(t.uuid).primary(),
    email: field(t.email).unique(),
    archivedAt: field(t.optional(t.datetime)),
  },
}) {}

const canArchiveUser = app.rule("canArchiveUser")((ctx, rule) =>
  rule
    .vars({ actor: User, user: User })
    .when(({ actor, user }) =>
      expr.and(expr.eq(actor.role, "admin"), expr.isNull(user.archivedAt)),
    ),
);

const archiveUser = app.action("archiveUser")((ctx, action) =>
  action.input({ actor: User, user: User }).guard(canArchiveUser).writes(User.fields.archivedAt, {
    operation: "set",
    reversible: true,
  }),
);

const graph = kernel.graph.pipe(
  User,
  canArchiveUser,
  archiveUser,
  pass(app.passes.checkGuards),
  pass(app.passes.deriveOptimisticUpdates),
);
```

---

# Core principles

## 1. Do not destroy the runtime IR

Keep runtime structures simple:

```ts
type RuntimeNode = {
  id: string;
  kind: string;
  traits: readonly string[];
  metadata?: unknown;
};

type RuntimeEdge = {
  id: string;
  kind: string;
  endpoints: readonly RuntimeEndpoint[];
  metadata?: unknown;
};
```

The typed API should wrap and produce this runtime IR.

Do not make serialization, plugin loading, or graph inspection depend on complex TypeScript generics.

## 2. Put types at construction boundaries

TypeScript should infer from:

```txt
defineDialect(...)
defineTypeSystem(...)
defineTrait(...)
defineEdgeKind(...)
entity/action/rule/query builders
artifact kind definitions
operation definitions
scope definitions
```

Avoid APIs that require users to annotate lots of generics manually.

Prefer:

```ts
const archiveUser = app.action("archiveUser")((ctx, action) => ...);
```

Over:

```ts
const archiveUser = defineAction<AppCtx, "archiveUser", Input, Output, Effects>(...);
```

## 3. One canonical internal shape per concept

Every constructor facade must normalize to one canonical definition.

For example, all of these should produce the same internal `ActionDef` shape:

```ts
app.action("archiveUser")({...});
app.action("archiveUser")((ctx, action) => ...);
app.action().name("archiveUser").input(...).done();
class ArchiveUser extends app.action.class("archiveUser", {...}) {}
```

Do not implement separate behavior for each facade.

## 4. Typed APIs accept witnesses; dynamic APIs accept strings

Typed path:

```ts
graph.edges.ofKind(app.edges.writes);
edge(app.edges.writes, { action: ref(action), field: ref(field) });
```

Dynamic path:

```ts
graph.edges.ofKindId("app.edge.writes");
graph.edge(edgeId).as(app.edges.writes);
```

Do not mix these. If an API accepts strings, name it as dynamic/unchecked/refinement-oriented.

## 5. Static safety plus graph verification

Do not promise TypeScript can prove everything.

Layer the safety story:

```txt
TypeScript inference
  catches local composition mistakes.

Graph verification passes
  catch global invariants.

Target legalization
  catches unsupported lowerings.

Runtime decoding
  validates dynamic/plugin data.
```

---

# High-level migration phases

## Phase 0 — Baseline and guardrails

Before changing APIs:

1. Run the current test suite.
2. Add compile-time type tests using `tsd`, `expect-type`, or equivalent.
3. Add runtime snapshot tests for graph output from existing constructors.
4. Identify public exports and mark which are runtime IR, typed authoring API, adapters, or bridge-only.
5. Preserve old APIs behind compatibility wrappers during transition.

Minimum baseline tests:

```txt
existing graph creation still works
existing dialect registration still works
existing edge creation still works
existing rule/operation adapters still produce equivalent nodes/edges
existing artifact tracing still works
```

Do not remove old APIs until typed replacements are in place and covered by tests.

---

## Phase 1 — Split runtime IR from typed authoring layer

Create a clear internal layering:

```txt
src/kernel/runtime/*
  RuntimeGraph, RuntimeNode, RuntimeEdge, RuntimeType, RuntimeTrait, RuntimeArtifact.

src/kernel/witness/*
  Typed dialects, node kinds, edge kinds, endpoint roles, traits, laws, types.

src/kernel/graph-api/*
  GraphStep, GraphFragment, TypedGraph, graph.pipe, graph.builder, graph.build writer.

src/dialects/*
  Built-in typed dialect modules.

src/compat/*
  Old API wrappers and adapters.
```

Do not immediately move every file if that is too disruptive. The important part is conceptual separation.

### Runtime graph

Keep existing runtime graph maps, but rename or alias intentionally:

```ts
export interface RuntimeGraph {
  readonly id: KernelId<"graph">;
  readonly types: ReadonlyMap<string, RuntimeType>;
  readonly exprs: ReadonlyMap<string, RuntimeExpr>;
  readonly traits: ReadonlyMap<string, RuntimeTrait>;
  readonly nodes: ReadonlyMap<string, RuntimeNode>;
  readonly edges: ReadonlyMap<string, RuntimeEdge>;
  readonly artifacts: ReadonlyMap<string, RuntimeArtifact>;
}
```

Compatibility alias:

```ts
export type KernelGraph = RuntimeGraph;
```

### Typed graph facade

Add:

```ts
export interface TypedGraph<TKernel, TState> {
  readonly runtime: RuntimeGraph;
  readonly kernel: TKernel;
  readonly __state?: TState;
}
```

Do not store `__state` at runtime.

---

## Phase 2 — GraphStep, GraphFragment, pipe, builder, writer

Add the core composition protocol.

```ts
export interface GraphStep<TKernel = unknown, TIn = unknown, TOut = TIn> {
  readonly kind: "graph.step";
  readonly requires?: readonly unknown[];
  apply(graph: TypedGraph<TKernel, TIn>): TypedGraph<TKernel, TOut>;
}

export type GraphFragment<TKernel, TIn, TOut> = GraphStep<TKernel, TIn, TOut>;
```

Add helpers:

```ts
export const fragment = (...steps: readonly GraphStep[]) => ...;
export const node = (...) => GraphStep;
export const edge = (...) => GraphStep;
export const typeStep = (...) => GraphStep;
export const traitStep = (...) => GraphStep;
export const pass = (...) => GraphStep;
export const emit = (...) => GraphStep;
```

Add kernel graph API:

```ts
const kernel = createKernel({ dialects: { app, domain } });

kernel.graph.pipe(...steps);
kernel.graph.builder();
kernel.graph.build((w) => { ... });
```

### `pipe` rules

1. Apply steps in order.
2. Each step returns a new typed graph facade.
3. Runtime may use copy-on-write or internal mutation.
4. Type state should accumulate where practical.
5. Do not block runtime functionality if deep type accumulation becomes too complex.

Pragmatic implementation option:

```ts
pipe<A>(a: Step<Empty, A>): Graph<A>;
pipe<A, B>(a: Step<Empty, A>, b: Step<A, B>): Graph<B>;
pipe<A, B, C>(a: Step<Empty, A>, b: Step<A, B>, c: Step<B, C>): Graph<C>;
```

Provide overloads for 10–20 steps before attempting advanced recursive tuple types.

### `builder` rules

Builder should be type-stateful:

```ts
kernel.graph
  .builder()
  .add(User)
  .add(archiveUser)
  .edge(app.edges.writes, {...})
  .done();
```

Builder methods should return a new builder type.

### `build` writer rules

Replace public bridge mutation helpers with scoped writer APIs:

```ts
const graph = kernel.graph.build((w) => {
  const user = w.add(User);
  w.edge(app.edges.writes, {...});
});
```

The writer may mutate internally, but mutation must not leak into general public APIs.

---

## Phase 3 — Replace bridge helpers with internal GraphWriter

Current bridge helpers mutate readonly maps by casting them to mutable maps. Treat this as bridge-only compatibility.

Migration plan:

1. Move `attachNode`, `attachEdge`, `attachExpr`, `attachNodes`, and `attachEdges` into an internal module.
2. Create `GraphWriter` that uses those helpers internally.
3. Replace bridge call sites with `kernel.graph.build((w) => ...)` or `ctx.writer.add(...)`.
4. Mark old helpers deprecated.
5. After all bridge call sites are removed, make helpers private or delete them.

Target public API:

```ts
kernel.graph.build((w) => {
  w.node(nodeDef);
  w.edge(edgeKind, endpoints);
  w.expr(exprDef);
});
```

Do not expose `asMutable` or raw map mutation.

---

## Phase 4 — Typed dialect API

Current dialects preserve literal arrays, but registry lookups erase them into broad `Dialect` values.

Target dialect API:

```ts
const app = defineDialect("app")((d) => {
  const action = d.nodeKind("action");
  const rule = d.nodeKind("rule");
  const field = d.import(domain.nodes.field);

  const guards = d.edgeKind("guards", {
    endpoints: {
      rule: d.endpoint("rule").target(rule).source(),
      action: d.endpoint("action").target(action).target(),
    },
  });

  const writes = d.edgeKind("writes", {
    endpoints: {
      action: d.endpoint("action").target(action).source(),
      field: d.endpoint("field").target(field).target(),
    },
    metadata: schema<{
      operation: "set" | "increment" | "append" | "delete";
      reversible?: boolean;
    }>(),
  });

  return {
    imports: [domain],
    nodes: { action, rule },
    edges: { guards, writes },
  };
});
```

### Dialect requirements

Add:

```ts
export interface DialectWitness<Id, Contents> {
  readonly id: Id;
  readonly nodes: Contents["nodes"];
  readonly edges: Contents["edges"];
  readonly traits: Contents["traits"];
  readonly passes: Contents["passes"];
  readonly lowerings: Contents["lowerings"];
  readonly artifacts?: Contents["artifacts"];
}
```

Do not require arrays in the public API. Accept records and normalize to arrays for runtime.

### Registry

Add typed registry:

```ts
const registry = defineDialectRegistry({ core, domain, app });

registry.get("app"); // typeof app
registry.ownerOf(app.edges.writes); // typeof app
```

Keep dynamic methods separately:

```ts
registry.getById("app");
registry.ownerOfId("app.edge.writes");
```

### Kernel binding

```ts
const kernel = createKernel({ dialects: { core, domain, app } });
```

Kernel type must carry dialect record.

```ts
type Kernel<TDialects extends Record<string, DialectWitness>> = ...;
```

Graph steps should carry required dialects and be checked against `Kernel<TDialects>` where practical.

---

## Phase 5 — Typed node kinds, edge kinds, endpoint roles

Current kinds are mostly `{ id, label }` objects. Keep runtime shape, add typed witness shape.

### Node kind witness

```ts
export interface NodeKindWitness<Id, Metadata, Traits, Dialect> {
  readonly id: Id;
  readonly label: string;
  readonly metadataSchema?: Schema<Metadata>;
  readonly target: "node";
  readonly dialect?: Dialect;
}
```

### Edge kind witness

```ts
export interface EdgeKindWitness<Id, Endpoints, Metadata, Traits, Dialect> {
  readonly id: Id;
  readonly label: string;
  readonly endpoints: Endpoints;
  readonly metadataSchema?: Schema<Metadata>;
  readonly target: "edge";
  readonly dialect?: Dialect;
}
```

### Endpoint role witness

```ts
endpoint("action").target(app.nodes.action).source();
endpoint("field").target(domain.nodes.field).target();
```

Endpoint direction must be explicit. Do not infer direction from role name prefixes.

### Edge creation

Target:

```ts
edge(
  app.edges.writes,
  {
    action: ref(archiveUser),
    field: ref(User.fields.archivedAt),
  },
  {
    metadata: {
      operation: "set",
      reversible: true,
    },
  },
);
```

Must check:

```txt
endpoint names
endpoint target kinds
metadata shape
trait target compatibility
registered dialect requirement
```

### Edge output

`defineEdgeFromKind` or its replacement must preserve named endpoint shape.

Bad target shape:

```ts
KernelEdge<EdgeKind, readonly KernelEdgeEndpoint[], Metadata>;
```

Ideal:

```ts
TypedEdge<typeof app.edges.writes> = {
  endpoints: {
    action: Endpoint<"action", Ref<typeof app.nodes.action>>;
    field: Endpoint<"field", Ref<typeof domain.nodes.field>>;
  };
  metadata: WritesMetadata;
}
```

Runtime can still serialize endpoints as arrays. The typed wrapper should expose named endpoints.

---

## Phase 6 — Typed graph query API

Add witness-based queries:

```ts
graph.nodes.ofKind(app.nodes.action);
graph.edges.ofKind(app.edges.writes);
graph.edges.ofKind(app.edges.writes).whereEndpoint("action", ref(archiveUser));
graph.from(ref(archiveUser)).via(app.edges.dependsOn).targets("dependency");
```

Queries should infer:

```txt
node metadata
edge endpoint shape
edge metadata
ref target kind
```

Keep dynamic APIs separately:

```ts
graph.nodes.ofKindId("app.node.action");
graph.edges.ofKindId("app.edge.writes");
graph.edge(edgeId).as(app.edges.writes);
```

Do not make dynamic APIs pretend to be statically typed.

---

## Phase 7 — Type system API

Current `defineType` may lose decoded inference by returning a broad `KernelType`.

Target:

```ts
const t = defineTypeSystem("core.types")({
  string: scalar("string").decoded<string>(),
  number: scalar("number").decoded<number>(),
  boolean: scalar("boolean").decoded<boolean>(),
  uuid: scalar("uuid").decoded<Uuid>(),
  email: scalar("email").decoded<Email>(),
  datetime: scalar("datetime").decoded<Date>(),
});
```

Combinators:

```ts
t.optional(T);
t.array(T);
t.record(K, V);
t.enum("Role", ["admin", "user"] as const);
t.object("User", { id: t.uuid, email: t.email });
t.union([A, B] as const);
t.pick(ObjectType, { id: true });
t.omit(ObjectType, { secret: true });
t.brand<"UserId">();
t.refine(...);
```

Inference requirements:

```ts
type InferDecoded<T> = ...;
```

Must preserve:

```txt
object property shape
enum literal union
optional fields
array item type
union variant type
brand/refinement type
encoded/decoded transforms where present
```

Compatibility:

```ts
export const kernelTypes = {
  string: t.string,
  uuid: t.uuid,
  ...
};
```

---

## Phase 8 — Trait and law API

Current traits have target fields and runtime target checks. Add target-safe typed trait definitions.

Target trait API:

```ts
const destructive = defineTrait("destructive", {
  target: ["node"] as const,
  payload: schema<{ requiresConfirmation: boolean }>(),
});

const serverOnly = defineTrait("serverOnly", {
  target: ["type", "node", "expr"] as const,
  payload: schema<{ reason?: string }>(),
});
```

Application:

```ts
deleteUser.trait(destructive, { requiresConfirmation: true });
```

Must fail:

```ts
t.email.trait(destructive, { requiresConfirmation: true });
```

Law API:

```ts
claim(AddNumber, laws.commutative);
claim(AddNumber, laws.identity, {
  identity: expr.literal(t.number, 0),
});
```

Law target compatibility:

```txt
operation laws apply to operations
expr laws apply to expressions
node laws apply to nodes
transform laws apply to transforms
```

Witness payloads must be typed.

---

## Phase 9 — Operation and expression API

Current expression operation calls have a typed helper and an untyped helper. Collapse public API into typed-first facade.

Target:

```ts
const AddNumber = operation.define("AddNumber")({
  args: [t.number, t.number] as const,
  output: t.number,
  laws: [laws.associative, laws.commutative],
});

const sum = expr.call(AddNumber, expr.literal(t.number, 1), expr.literal(t.number, 2));
```

Bad arguments fail:

```ts
expr.call(AddNumber, expr.literal(t.number, 1), expr.literal(t.string, "two"));
```

Dynamic fallback:

```ts
expr.callUnchecked(operation, args);
```

Expression dependencies should use refs, not strings:

```ts
requirements?: readonly Ref[];
effects?: readonly Ref[];
```

Expression passes:

```ts
pass(expr.passes.deriveReads);
pass(expr.passes.deriveTraits);
```

---

## Phase 10 — Scope API

Current scopes store bindings in arrays and lookup by string. Keep that runtime structure but add typed context builders.

Target:

```ts
const scope = defineScope("archiveUser")
  .binding("actor", "actor", User)
  .binding("user", "input", User)
  .binding("now", "context", t.datetime)
  .done();
```

Infer:

```ts
type Ctx = ScopeContext<typeof scope>;
```

Builder-generated contexts:

```ts
app.action("archiveUser")((ctx, action) =>
  action
    .input({ actor: User, user: User })
    .context({ now: t.datetime })
    .body((body) => body.pipe(op.set(ctx.input.user.archivedAt, ctx.context.now))),
);
```

Invalid access should fail:

```ts
ctx.tenant;
```

Dynamic lookup remains:

```ts
scope.lookup("actor");
```

---

## Phase 11 — Entity API including `.class`

Entity is the strongest candidate for `.class` as a primary API.

Target class form:

```ts
class User extends domain.entity.class("User", {
  fields: {
    id: field(t.uuid).primary(),
    email: field(t.email).unique(),
    role: field(t.enum("Role", ["admin", "user"] as const)),
    archivedAt: field(t.optional(t.datetime)),
  },
}) {}
```

`User` should provide:

```ts
User.ref;
User.type;
User.fields.id;
User.fields.email;
User.fragment;
```

It should be usable directly as a graph fragment:

```ts
kernel.graph.pipe(User);
```

Also support object form:

```ts
const User = domain.entity("User")({
  fields: { id: t.uuid, email: t.email },
});
```

Builder form:

```ts
const User = domain.entity().name("User").field("id", t.uuid).field("email", t.email).done();
```

Class implementation rules:

1. Prefer `class("Name", spec)` over decorators.
2. The object literal must be passed into a generic factory before the class is created.
3. Do not rely on runtime instance field scanning.
4. Do not let TypeScript class inheritance imply semantic inheritance unless explicitly declared.

Good:

```ts
class User extends domain.entity.class("User", { fields: {...} }) {}
```

Risky as primary API:

```ts
class User extends domain.entity.class("User") {
  @field(t.uuid) id!: string;
}
```

---

## Phase 12 — Rule, action, query APIs

Support multiple forms for major semantic constructors.

### Recommended facade matrix

| Constructor kind     | Object |       Builder | Curried | Callback ctx |     `.class` |         Pipe/fragment |
| -------------------- | -----: | ------------: | ------: | -----------: | -----------: | --------------------: |
| `defineDialect`      |    yes |           yes |     yes |          yes |        maybe |    no/direct registry |
| `defineType`         |    yes |           yes |   maybe |       rarely |           no |  maybe as `type(...)` |
| `defineTrait`        |    yes |         maybe |      no |           no |           no | maybe as `trait(...)` |
| `defineLaw`          |    yes |         maybe |      no |           no |           no |      via `claim(...)` |
| `defineOperation`    |    yes |           yes |     yes |        maybe |        maybe |                   yes |
| `defineEntity`       |    yes |           yes |     yes |          yes | yes / strong |                   yes |
| `defineRule`         |    yes |           yes |     yes |          yes |        maybe |                   yes |
| `defineAction`       |    yes |           yes |     yes |          yes |        maybe |                   yes |
| `defineQuery`        |    yes |           yes |     yes |          yes |        maybe |                   yes |
| `defineEvent`        |    yes |           yes |     yes |        maybe |   yes / good |                   yes |
| `defineDispatch`     |    yes |           yes |     yes |          yes |        maybe |                   yes |
| `defineView`         |    yes |           yes |     yes |          yes |   yes / good |                   yes |
| `defineArtifactKind` |    yes |           yes |     yes |          yes |        maybe |                    no |
| `emit`               |    yes | builder maybe |      no |        maybe |           no |                   yes |
| `edge`               |    yes |            no |      no |           no |           no |                   yes |
| `pass`               | object |            no |   maybe |          yes |        maybe |                   yes |

### Rule target

```ts
const canArchiveUser = app.rule("canArchiveUser")((ctx, rule) =>
  rule
    .vars({ actor: User, user: User })
    .when(({ actor, user }) =>
      expr.and(expr.eq(actor.role, "admin"), expr.isNull(user.archivedAt)),
    ),
);
```

Rule lowers to:

```txt
Node(Rule)
Node(VarDecl)
Expr body
Edge(RuleHasBody)
Edge(RuleDeclaresVar)
Edge(RuleReads)
Trait(pure)
Trait(predicate)
```

### Action target

```ts
const archiveUser = app.action("archiveUser")((ctx, action) =>
  action
    .input({ actor: User, user: User })
    .guard(canArchiveUser)
    .writes(User.fields.archivedAt, { operation: "set", reversible: true })
    .body((body) => body.pipe(op.set(ctx.input.user.archivedAt, expr.now()))),
);
```

Action lowers to:

```txt
Node(Action)
Edge(GuardedBy)
Edge(Writes)
Edge(Emits)
Edge(Requires)
Edge(HasBody)
```

### Query target

```ts
const listActiveUsers = app.query("listActiveUsers")((ctx, query) =>
  query
    .input(t.object({}))
    .output(t.array(User))
    .key(keys.family("users.active"))
    .body(() => User.where((u) => expr.isNull(u.archivedAt))),
);
```

Query lowers to:

```txt
Node(Query)
Edge(QueryReads)
Edge(QueryHasKey)
Edge(QueryHasBody)
```

---

## Phase 13 — Artifact and target API

Current artifacts use target unions, string kinds, broad content, broad metadata, and broad source pointers. Add typed target artifact kinds.

Target:

```ts
const react = defineTarget("react")((t) => ({
  artifacts: {
    component: t.artifactKind("component", {
      content: content.tsx(),
      path: pathTemplate("src/components/{name}.tsx"),
      metadata: schema<{ componentName: string; exports: readonly string[] }>(),
      sources: [ui.nodes.view, app.nodes.action, app.nodes.rule],
    }),
  },
}));
```

Emit:

```ts
const artifact = emit(react.artifacts.component, {
  source: ref(UserListView),
  generatedBy: passRef(react.passes.emitComponents),
  path: { name: "UserList" },
  metadata: { componentName: "UserList", exports: ["UserList"] },
  content: tsx`export function UserList() { return null; }`,
});
```

Must check:

```txt
content type
path params
metadata shape
source object kind
generatedBy pass ref
```

Also materialize artifact provenance as graph facts:

```txt
Node(Artifact)
Edge(GeneratedFrom)
Edge(GeneratedBy)
```

---

## Phase 14 — Pass and lowering API

Passes should declare requirements.

```ts
const checkGuards = app.pass("checkGuards", {
  requires: [app],
  run(graph) {
    const actions = graph.nodes.ofKind(app.nodes.action);
    // ...
    return graph;
  },
});
```

Lowerings should declare source and target dialects/kinds.

```ts
const lowerRuleToPostgresPolicy = defineLowering({
  from: app.nodes.rule,
  to: postgres.nodes.policy,
  requires: [app, postgres],
  lower(rule, ctx) {
    return postgres.policy(`${rule.name}_policy`)({
      predicate: ctx.lowerExpr(rule.body, postgres.sql),
    });
  },
});
```

Use:

```ts
kernel.graph.pipe(canArchiveUser, lower(lowerRuleToPostgresPolicy));
```

If target dialect is not registered, type error where possible; runtime diagnostic otherwise.

---

## Phase 15 — Compatibility wrappers

Keep old APIs working initially.

Examples:

```ts
export const defineEdgeFromKind = compatDefineEdgeFromKind;
export const defineDialectLegacy = defineDialect;
export const registerNode = runtimeRegisterNode;
```

But implement new APIs in terms of canonical internals.

Compatibility rules:

1. Old APIs may return broad runtime types.
2. New APIs return typed witnesses/fragments.
3. Old APIs should not infect new APIs with broad types.
4. Mark old adapter-only APIs as deprecated once replacements exist.

Migration sequence:

```txt
add new API
make old API call new internals or runtime normalizers
migrate internal call sites
migrate tests/examples/docs
mark old API deprecated
remove only after downstream code is migrated
```

---

# Constructor facade rules

Support multiple forms where they provide real value.

## Standard constructor shape

For major named concepts:

```ts
type DefineX = {
  (): XBuilder;

  <const TName extends string>(name: TName): XNamedBinder<TName>;

  with<const TCtx>(): {
    (): XBuilder<TCtx>;
    <const TName extends string>(name: TName): XNamedBinder<TCtx, TName>;
  };
};
```

Named binder accepts object or callback:

```ts
type XNamedBinder<TCtx, TName extends string> = {
  <const TSpec extends XObjectSpec<TCtx>>(spec: TSpec): XDef<TCtx, TName, NormalizeSpec<TSpec>>;

  <const TResult>(
    build: (ctx: XContext<TCtx>, builder: XBuilder<TCtx, { name: TName }>) => TResult,
  ): XDef<TCtx, TName, NormalizeBuildResult<TResult>>;
};
```

Class facade where useful:

```ts
class User extends domain.entity.class("User", { fields: {...} }) {}
```

## Do not document all forms equally

Recommended docs priority:

```txt
Primary:
  dialect.concept("Name")((ctx, builder) => ...)
  dialect.entity.class("Name", {...}) for entities

Simple:
  dialect.concept("Name")({...})

Advanced:
  dialect.concept().name("Name"). ... .done()

Low-level:
  defineConcept.with<Ctx>()(...)
```

---

# Testing requirements

## Runtime tests

Verify graph output equivalence:

```txt
entity creates expected node/field/ownsField facts
rule creates rule/body/var/read facts
action creates action/guard/write/emit/require facts
query creates query/read/key/body facts
artifact emit creates artifact/generatedFrom facts
```

## Type tests

Add tests that must compile:

```ts
edge(app.edges.writes, {
  action: ref(archiveUser),
  field: ref(User.fields.archivedAt),
});

archiveUser.writes(User.fields.archivedAt, { operation: "set" });

expr.call(AddNumber, expr.literal(t.number, 1), expr.literal(t.number, 2));
```

Add tests that must fail:

```ts
edge(app.edges.writes, {
  action: ref(User.fields.email),
  field: ref(archiveUser),
});

expr.call(AddNumber, expr.literal(t.number, 1), expr.literal(t.string, "two"));

t.email.trait(app.traits.destructive);

ctx.tenant;
```

## API snapshot tests

Use `expectTypeOf` or equivalent to check inferred shapes:

```ts
expectTypeOf(User.fields.email.type).toEqualTypeOf<KernelType<Email>>();
expectTypeOf(graph.edges.ofKind(app.edges.writes).first().metadata.operation).toEqualTypeOf<
  "set" | "increment" | "append" | "delete"
>();
```

## Serialization tests

Ensure typed witnesses lower to stable runtime IR:

```txt
JSON round trip preserves ids/kinds/endpoints/metadata/provenance
runtime graph can be decoded/refined back with witnesses
plugin-loaded graph emits diagnostics on invalid shape
```

---

# Acceptance criteria

The transition is successful when all of these are true:

1. A kernel can be created from typed dialect records.
2. Dialect values expose typed records like `app.nodes.action`, `app.edges.writes`, `app.traits.serverOnly`.
3. Edge construction checks endpoint names, endpoint target kinds, and metadata.
4. `kernel.graph.pipe(...)` accepts graph fragments, graph steps, passes, and emit steps.
5. `kernel.graph.builder()` and `kernel.graph.build(...)` exist.
6. Existing runtime graph serialization still works.
7. `domain.entity.class("User", spec)` works and `User` is usable as a graph fragment.
8. Entities expose typed fields and decoded entity value inference.
9. Rules produce typed expression contexts and graph facts.
10. Actions infer input context, guard compatibility, writes, emits, and body operation types.
11. Queries infer input, output, key, reads, and body expression type.
12. Operation calls infer argument and output types.
13. Traits and laws check target compatibility and payload shape.
14. Scopes produce typed callback contexts.
15. Artifact kinds check content, metadata, path params, and source refs.
16. Dynamic APIs are clearly separated and named as dynamic/unchecked/refinement APIs.
17. Bridge mutation helpers are no longer used outside internal graph writer implementation.
18. Compile-time tests cover both success and failure cases.

---

# Anti-goals

Do not do these:

1. Do not make runtime IR generic-heavy or unserializable.
2. Do not require users to write explicit generic parameters for normal usage.
3. Do not rely on decorators as the primary API.
4. Do not infer edge direction from role-name prefixes.
5. Do not store domain objects in `metadata.custom` as the primary dependency mechanism.
6. Do not use string IDs in typed APIs when a witness/ref is available.
7. Do not expose raw graph map mutation as public API.
8. Do not implement object/builder/callback/class forms as separate semantic systems.
9. Do not remove compatibility APIs until migration tests pass.
10. Do not pretend TypeScript can validate runtime-loaded plugins without decoding.

---

# Suggested implementation order

1. Add runtime/typed layering aliases without changing behavior.
2. Add `GraphStep`, `GraphFragment`, `fragment`, and minimal `kernel.graph.pipe`.
3. Add typed `defineDialect("id")((d) => ...)` while keeping existing `defineDialect(def)`.
4. Add typed node/edge kind witnesses and endpoint target metadata.
5. Make `edge(kind, endpoints, options)` return a graph step with named endpoint typing.
6. Add typed graph queries: `nodes.ofKind`, `edges.ofKind`, `whereEndpoint`, `targets`.
7. Add typed type-system factories and preserve `InferDecoded`.
8. Add target-safe traits and typed law claims.
9. Add operation and expression typed facade.
10. Add entity object and `.class` APIs.
11. Add rule/action/query APIs.
12. Add artifact target/kind/emit APIs.
13. Add pass/lowering requirements.
14. Replace bridge mutation call sites with `GraphWriter`.
15. Migrate examples and README.
16. Deprecate legacy broad APIs.

---

# Final target example

This example should compile cleanly by the end of the migration:

```ts
const domain = defineDialect("domain")((d) => {
  const entity = d.nodeKind("entity");
  const field = d.nodeKind("field");

  const ownsField = d.edgeKind("ownsField", {
    endpoints: {
      entity: d.endpoint("entity").target(entity).source(),
      field: d.endpoint("field").target(field).target(),
    },
  });

  return { nodes: { entity, field }, edges: { ownsField } };
});

const app = defineDialect("app")((d) => {
  const action = d.nodeKind("action");
  const rule = d.nodeKind("rule");
  const field = d.import(domain.nodes.field);

  const guards = d.edgeKind("guards", {
    endpoints: {
      rule: d.endpoint("rule").target(rule).source(),
      action: d.endpoint("action").target(action).target(),
    },
  });

  const writes = d.edgeKind("writes", {
    endpoints: {
      action: d.endpoint("action").target(action).source(),
      field: d.endpoint("field").target(field).target(),
    },
    metadata: schema<{
      operation: "set" | "increment" | "append" | "delete";
      reversible?: boolean;
    }>(),
  });

  return { imports: [domain], nodes: { action, rule }, edges: { guards, writes } };
});

const kernel = createKernel({ dialects: { domain, app } });

class User extends domain.entity.class("User", {
  fields: {
    id: field(t.uuid).primary(),
    email: field(t.email).unique(),
    archivedAt: field(t.optional(t.datetime)),
  },
}) {}

const canArchiveUser = app.rule("canArchiveUser")((ctx, rule) =>
  rule
    .vars({ actor: User, user: User })
    .when(({ actor, user }) =>
      expr.and(expr.eq(actor.role, "admin"), expr.isNull(user.archivedAt)),
    ),
);

const archiveUser = app.action("archiveUser")((ctx, action) =>
  action
    .input({ actor: User, user: User })
    .guard(canArchiveUser)
    .writes(User.fields.archivedAt, { operation: "set", reversible: true }),
);

const graph = kernel.graph.pipe(User, canArchiveUser, archiveUser, pass(app.passes.checkGuards));
```

This is the north star. Implement incrementally, keep runtime compatibility, and move type safety to construction/query boundaries first.

These old files are actually a useful snapshot of the design tension in the library.

They show three different instincts:

```txt
type.ts
  simple semantic runtime shape

transform.ts
  typed conversion concept, but underspecified identity/runtime model

ods.ts
  strongest design direction: MLIR-style typed witnesses for operations/kinds
```

My take: **`ods.ts` is the seed of the ideal architecture**, while `type.ts` and `transform.ts` are still mostly runtime-object APIs that should be lifted into typed witness/builder APIs.

---

## 1. `type.ts`: good runtime model, weak authoring inference

The old type model has a solid runtime shape:

```ts
interface KernelType<Decoded = unknown> {
  kind: TypeKind;
  id: KernelId<"type">;
  properties?: ReadonlyMap<string, KernelType>;
  enumValues?: readonly string[];
  items?: KernelType;
  traits: readonly TraitDef[];
}
```

That is good for serialization and graph storage. It covers scalar, object, array, record, union, tagged union, opaque, and custom types.

The problem is the factory:

```ts
export const defineType = <Kind extends TypeKind>(
  kind: Kind,
  id: string,
  input?: ...
): KernelType => ({ ... });
```

It returns broad `KernelType`, not `KernelType<Decoded>`, so the decoded type generic is mostly lost at construction.

So this design is good as **runtime IR**, but not ideal as **user-facing type construction**.

### Ideal replacement

Keep the runtime shape, but wrap it with typed constructors:

```ts
const t = defineTypeSystem("core.types")({
  string: scalar("string").decoded<string>(),
  number: scalar("number").decoded<number>(),
  boolean: scalar("boolean").decoded<boolean>(),
  uuid: scalar("uuid").decoded<Uuid>(),
  email: scalar("email").decoded<Email>(),
  datetime: scalar("datetime").decoded<Date>(),
});

const UserType = t.object("User", {
  id: t.uuid,
  email: t.email,
  archivedAt: t.optional(t.datetime),
});

type UserValue = InferDecoded<typeof UserType>;
// {
//   id: Uuid;
//   email: Email;
//   archivedAt?: Date;
// }
```

So `type.ts` should become two layers:

```txt
RuntimeType
  current broad shape, serializable

TypeWitness<Decoded, Encoded, Traits, Shape>
  high-level typed construction and inference
```

---

## 2. `transform.ts`: strong concept, but too stringly and unstable

`transform.ts` is conceptually important. It models typed conversions:

```ts
KernelTransform<From, To> {
  from: KernelType<From>;
  to: KernelType<To>;
  direction: "encode" | "decode" | "both";
  decode?: string;
  encode?: string;
}
```

That is the right idea: Gen2 needs semantic conversions between decoded domain values and encoded/runtime/target values.

But the design has several issues:

```txt
id uses Date.now()
encode/decode are strings
direction is not reflected in callable surface
no laws/traits
no error type
no requirements/effects
no graph representation
no source/target dialect ownership
```

The `Date.now()` ID is especially not ideal for compiler IR. IDs should be stable and deterministic.

### Ideal replacement

Transforms should be typed semantic witnesses and graph fragments:

```ts
const EmailString = t.string.brand<"EmailString">();

const parseEmail = transform.define("parseEmail")({
  from: t.string,
  to: t.email,
  direction: "decode",

  errors: [errors.InvalidEmail],

  laws: [laws.deterministic],

  traits: [transform.traits.pure, transform.traits.lossless],

  decode: expr.fn((s) => email.parse(s)),
});
```

Or for encode/decode pairs:

```ts
const EmailCodec = transform.codec("EmailCodec")({
  decoded: t.email,
  encoded: t.string,

  encode: expr.fn((email) => email.toString()),
  decode: expr.fn((value) => email.parse(value)),

  laws: [
    laws.roundTrip({
      decodeEncode: proof("decode(encode(x)) = x"),
    }),
  ],
});
```

Then types can reference transforms:

```ts
const Email = t.scalar("email").decoded<Email>().encoded<string>().codec(EmailCodec);
```

This is much more powerful because transforms become inputs to:

```txt
serialization
boundary checking
OpenAPI/JSON schema generation
database mapping
Effect Schema lowering
client/server payload safety
migration planning
```

The current file has the right concept but needs to be upgraded from “string code snippets on a transform object” to “typed expression-backed transform witnesses.”

---

## 3. `ods.ts`: this is the strongest old design

`ods.ts` is the most interesting file.

It explicitly says it is an:

```txt
MLIR-style table-driven op definition system with verifiers, canonicalizers, and generated accessors.
```

That is very aligned with the ideal Gen2 direction.

It already has:

```txt
EndpointRoleDef
EndpointTarget
NodeKindDef
EdgeKindDef
verifiers
canonicalizers
typed endpoint names
edge endpoint record support
custom payload type generic
```

This is much closer to the design we want.

### What is good

`defineEndpointRole` captures role name and constraints:

```ts
defineEndpointRole(name, {
  targetKinds?: string[];
  requiresTraits?: string[];
  excludesTraits?: string[];
})
```

`defineNodeKind` preserves literal ID, inputs, outputs, traits, and custom metadata through const generics.

`defineEdgeKind` supports both arrays and records of endpoints, and it preserves the record shape in `_endpointShape`, which is exactly the direction needed for named endpoints like:

```ts
edge(app.edges.writes, {
  action: ref(archiveUser),
  field: ref(User.fields.archivedAt),
});
```

That record endpoint shape is the most important idea in the old files.

### What is not ideal

The constraints are still string-based:

```ts
targetKinds?: readonly string[];
requiresTraits?: readonly string[];
excludesTraits?: readonly string[];
```

That means endpoint constraints are not typed against actual node-kind or trait witnesses.

Also, `dialect?: string` is a string, not a dialect witness.

So `ods.ts` is halfway between current and ideal:

```txt
Good:
  typed ODS-style witnesses

Not ideal:
  string IDs inside constraints
  dialect ownership not typed
  target constraints not witness-based
  verifiers return strings instead of diagnostics
  canonicalizers operate on unknown
```

### Ideal ODS direction

This:

```ts
const writes = defineEdgeKind({
  id: "app.edge.writes",
  dialect: "app",
  endpoints: {
    action: defineEndpointRole("action", {
      targetKinds: ["app.node.action"],
    }),
    field: defineEndpointRole("field", {
      targetKinds: ["domain.node.field"],
    }),
  },
});
```

should become:

```ts
const writes = app.edgeKind("writes", {
  endpoints: {
    action: app.endpoint("action").target(app.nodes.action).source(),

    field: app.endpoint("field").target(domain.nodes.field).target(),
  },

  metadata: schema<{
    operation: "set" | "increment" | "append" | "delete";
    reversible?: boolean;
  }>(),
});
```

The important shift:

```txt
targetKinds: string[]
  becomes
target(nodeKindWitness)

requiresTraits: string[]
  becomes
requires(traitWitness)

dialect: string
  becomes
owned by dialect value

verifier: unknown -> string[]
  becomes
verifier: typed object -> Diagnostic[]
```

---

## 4. The old design is compiler-ish, but not yet user-facing DX

These files feel like an early compiler substrate:

```txt
type.ts
  semantic value shapes

transform.ts
  conversions

ods.ts
  operation/kind specifications
```

That is a good core.

But the API is still shaped around defining low-level objects:

```ts
defineType(...)
defineTransform(...)
defineNodeKind(...)
defineEdgeKind(...)
```

The ideal design should use those internally but expose higher-level dialect APIs:

```ts
const domain = defineDialect("domain")((d) => {
  const entity = d.nodeKind("entity");
  const field = d.nodeKind("field");

  const ownsField = d.edgeKind("ownsField", {
    endpoints: {
      entity: d.endpoint("entity").target(entity).source(),
      field: d.endpoint("field").target(field).target(),
    },
  });

  return { nodes: { entity, field }, edges: { ownsField } };
});
```

And user-facing builders:

```ts
class User extends domain.entity.class("User", {
  fields: {
    id: field(t.uuid),
    email: field(t.email),
  },
}) {}
```

So I would not discard these files. I would **reinterpret them as low-level runtime/witness infrastructure**.

---

## 5. How they fit the ideal architecture

I’d map them like this:

| Old file       |         Keep? | New role                                                       |
| -------------- | ------------: | -------------------------------------------------------------- |
| `type.ts`      |           yes | runtime type IR + low-level type witness base                  |
| `transform.ts` | yes, redesign | typed transform/codec witnesses with laws, errors, expr bodies |
| `ods.ts`       |  yes, central | basis for dialect-owned node/edge/endpoint kind witnesses      |

The best move is not to delete them. It is to lift them.

```txt
type.ts
  -> defineTypeSystem, TypeWitness, type combinators

transform.ts
  -> defineTransform, defineCodec, transform laws, encode/decode lowerings

ods.ts
  -> dialect builder internals: d.nodeKind, d.edgeKind, d.endpoint
```

---

## 6. The biggest improvement to make from these old files

The biggest improvement is to replace internal string constraints with typed witnesses.

Current ODS:

```ts
targetKinds?: readonly string[];
requiresTraits?: readonly string[];
excludesTraits?: readonly string[];
dialect?: string;
```

Ideal:

```ts
target: NodeKindWitness;
requiresTraits?: readonly TraitWitness[];
excludesTraits?: readonly TraitWitness[];
dialect: DialectWitness;
```

Then the edge API can truly type-check endpoint targets:

```ts
edge(app.edges.writes, {
  action: ref(archiveUser),
  field: ref(User.fields.archivedAt),
});
```

and reject:

```ts
edge(app.edges.writes, {
  action: ref(User.fields.email),
  field: ref(archiveUser),
});
```

That is the leap from “typed IDs” to “typed semantics.”

---

## 7. My overall read

This old design was going in the right direction.

It had the right compiler instincts:

```txt
semantic types
transforms/codecs
MLIR-style ODS
verifiers
canonicalizers
typed endpoint definitions
traits
```

But it had not yet crossed the line into the ideal high-DX design:

```txt
dialect values as typed vocabulary modules
kernel typed by registered dialects
graph steps/fragments
builder/curried/callback/class facades
endpoint constraints using witnesses
types preserving decoded inference
transforms as expression/law-backed semantic objects
dynamic strings isolated to decode/refinement APIs
```

So my conclusion is:

**`ods.ts` is the strongest architectural seed. `type.ts` is a good runtime model that needs typed factories. `transform.ts` is the right concept but needs a full redesign into typed codecs/transforms with stable IDs, laws, diagnostics, and expression-backed bodies.**
These docs feel like they’re converging on the **real Gen2 architecture**.

The strongest through-line is:

```txt
Rules/Exprs
  define pure, inspectable logic.

Functions/Queries/Actions
  define callable runtime boundaries.

Reactivity/Sync
  derives what changes affect what.

Events/Reactions/Dispatch
  define trigger-to-handler execution.

Effects/Delivery/Idempotency
  define runtime safety and capability requirements.
```

That is a good separation. It avoids turning the kernel into a giant set of primitives while still making each concept graph-native.

## My read on each doc

### `rules.md.txt`: this is the logic core

This is probably the most foundational doc. It says expressions and rules should become the **logic core** of the revised kernel, not just helper ASTs. Expressions should be operation-backed trees, and rules should be named boolean expressions with business meaning.

That is exactly right.

The model should be:

```txt
OperationDef
  defines reusable semantic operations and laws

Expr
  applies operations to values

Rule
  names a pure boolean expression with business meaning

Query/Action/UI/Auth/Reactivity
  consume rules and expression dependency edges
```

This is the piece that makes the whole compiler derivable.

Example:

```ts
const canArchiveUser = app.rule("canArchiveUser")((ctx, rule) =>
  rule
    .vars({
      actor: User,
      user: User,
    })
    .when(({ actor, user }) =>
      expr.and(expr.eq(actor.role, "admin"), expr.isNull(user.archivedAt)),
    ),
);
```

That should emit:

```txt
Node(Rule): canArchiveUser
Expr: and(eq(actor.role, "admin"), isNull(user.archivedAt))
Edge(RuleReads): canArchiveUser -> User.role
Edge(RuleReads): canArchiveUser -> User.archivedAt
Trait: pure
Trait: predicate
maybe Trait: sqlLowerable
maybe Trait: clientSafe
```

This is powerful because the same rule can drive:

```txt
server guard
database RLS
query predicate
UI disabled state
validation
tests
docs
reactivity dependency extraction
```

So I would make the expression/rule dialect one of the earliest things to stabilize after the low-level kernel.

---

### `funcs.txt`: this is the callable/codegen layer

This doc has the right distinction:

```txt
Expr
  pure inspectable logic

ExprFunction
  callable pure expression

Rule
  named boolean ExprFunction

QueryFunction
  callable read node

ActionFunction
  callable write/effect node

Mutation
  reactive wrapper around an ActionFunction
```

It explicitly says functions should become first-class callable nodes, and that expressions/rules should be the logic bodies functions can wrap.

That is the right codegen-facing layer.

I would not collapse everything into “callable expression.” The doc correctly avoids that, because purity and effects matter.

The ideal model:

```txt
ExprFunction
  pure, inspectable, reusable expression

Query
  callable readable node

Action
  callable writable/effectful node

Mutation
  client/reactive wrapper around action

PatchFunction
  optimistic/rollback/reconcile function

PlanFunction
  execution plan composed from callables
```

Graph facts:

```txt
Query hasBody Expr
Query reads Field
Query hasKey Key

Action hasBody Plan/Expr
Action appliesOperation Operation
Action writes Field
Action emits Event
Action invalidates Key
Action guardedBy Rule

Mutation wrapsAction Action
Mutation hasOptimisticPatch PatchFunction
Mutation rollsBackWith PatchFunction
```

This is important because targets mostly want to consume **callable nodes**, not arbitrary app-specific objects.

A React target wants:

```txt
Query -> hook/resource
Action/Mutation -> mutation hook
Rule -> disabled state
Key -> cache identity
```

A server target wants:

```txt
Query -> loader/RPC route
Action -> server action/API route
Rule -> guard
Provider -> dependency injection
```

A database target wants:

```txt
Rule -> SQL predicate/RLS
Query -> SELECT
Action operation uses -> INSERT/UPDATE/DELETE
```

So yes: functions should be graph-native callable nodes.

---

### `sync.txt`: this is the semantic sync advantage

This doc identifies one of Gen2’s clearest product advantages: Gen2 can own **sync semantics**, even if it lowers to an existing sync runtime. It distinguishes sync semantics from sync machinery, which is exactly the right distinction.

The split is:

```txt
Sync semantics
  What changed?
  What queries are affected?
  Can we patch locally?
  Is rollback safe?
  What conflict policy applies?

Sync machinery
  Local database
  change log
  subscriptions
  upload queue
  retry
  conflict resolution
  streaming transport
  persistence
```

Gen2 should absolutely own the first one.

Because Gen2 knows:

```txt
Action archiveUser writes User.archivedAt
Query listActiveUsers reads User.archivedAt
Predicate is archivedAt IS NULL
Operation is SetField
SetField is reversible/patchable
```

it can derive:

```txt
archiveUser invalidates listActiveUsers
archiveUser can optimistically remove the user from active list
rollback can restore previous archivedAt
if predicate becomes true again, reinsert user
```

That is much better than generic manual invalidation.

The doc’s recommended architecture is also right:

```txt
Gen2 owns semantics and planning.
Runtime adapters execute the plan.
```

So I would not position Gen2 as “we replace TanStack DB/PowerSync immediately.” Better:

```txt
Gen2 makes those systems implementation targets, not sources of truth.
```

That is a very strong claim and much safer.

---

### `reactions.txt`: this is the dispatch/effect model

This doc is also very good. Its key point is that `Reaction`, `Event`, and `Effect` should not become hard kernel primitives alongside `Node` and `Edge`. Instead, they should be dialect graph patterns.

The proposed split is right:

```txt
Effect
  typed footprint / capability requirement

Event
  typed trigger payload

Reaction
  rule-triggered dispatch

Subscription
  event-triggered dispatch

Reducer
  event-triggered dispatch with combiner/reducer semantics

Dispatch
  canonical trigger -> select/project -> handler -> delivery pattern
```

The most important invariant from this doc is:

```txt
Rules stay pure.
Dispatch owns effects.
```

That should be a hard architectural rule.

Bad:

```ts
rule("invoiceOverdue", () => {
  email.send(...);
});
```

Good:

```ts
const invoiceOverdue = app.rule("invoiceOverdue")(...);

const sendReminder = app.action("sendReminder")(...)
  .effect(effects.email.send);

const dispatch = app.dispatch("sendReminderWhenOverdue")({
  trigger: invoiceOverdue,
  run: sendReminder,
  delivery: delivery.outbox(...),
  idempotency: idempotency.inputHash(),
});
```

Canonical graph:

```txt
Node(Dispatch): sendReminderWhenOverdue
Edge(TriggeredBy): Dispatch -> Rule(invoiceOverdue)
Edge(Runs): Dispatch -> Action(sendReminder)
Edge(DeliveredBy): Dispatch -> DeliveryPlan(outbox)
Edge(UsesIdempotency): Dispatch -> IdempotencyPlan(inputHash)
Edge(HasEffect): sendReminder -> Effect(email.send)
```

This lets passes verify:

```txt
side-effecting dispatch has delivery plan
at-least-once delivery has idempotency
outbox storage is persistent
handler input matches trigger payload
effect is supported by runtime placement
```

That is exactly the right direction.

---

## The combined architecture

Together, these docs suggest this stack:

```txt
Type
  semantic value shape

Operation
  semantic operation + laws

Expr
  pure operation-use tree

Rule
  named boolean expression

Function
  callable semantic boundary

Query
  readable callable

Action
  writable/effectful callable

Mutation
  reactive wrapper around action

Key / Resource / TrackingScope
  stable reactivity identity and tracking

Event
  typed trigger payload

Dispatch / Reaction / Subscription / Reducer
  trigger-to-handler execution graph

Effect
  execution footprint / capability requirement

Delivery / Outbox / Idempotency
  runtime safety plan

SyncPlan
  derived client/server/offline behavior

Diagnostic / Invariant
  explanation, repair, and enforcement layer
```

That is coherent.

The most important thing: these should not become separate registries.

They should all lower into the same kernel graph:

```txt
Node
Edge
Trait
Type
Expr
Artifact
Pass
Diagnostic
```

with dialect-owned vocabulary.

---

## What I would keep from these docs

I would preserve these design decisions almost exactly:

```txt
Rules are pure.
Expressions are operation-backed.
Functions are callable nodes.
Queries are reads.
Actions are writes/effects.
Mutations wrap actions for reactive runtimes.
Manual stable keys remain.
Manual graph facts remain.
Sync is derived from reads/writes/keys/operations/laws.
Effects are footprints, not dispatches.
Dispatch owns trigger-to-handler execution.
Events/reactions/subscriptions/reducers are dispatch patterns.
Delivery/idempotency/outbox are graph-native runtime safety plans.
```

Those are strong.

---

## What I would tighten

I would make the naming hierarchy crisp:

```txt
Expr
  anonymous pure logic

ExprFunction
  named reusable pure logic

Rule
  named boolean ExprFunction with business meaning

Query
  callable read boundary

Action
  callable write/effect boundary

Mutation
  reactive client/runtime wrapper around Action

Event
  typed fact emitted by something

Dispatch
  trigger-to-handler plan

Reaction
  Dispatch triggered by Rule becoming true

Subscription
  Dispatch triggered by Event

Reducer
  Dispatch handler that folds events with operation laws

Effect
  footprint/capability requirement

DeliveryPlan
  how the dispatch runs

IdempotencyPlan
  how retry/dedupe safety is achieved

OutboxPlan
  durable delivery storage/transport plan
```

That avoids overlap.

---

## What I would avoid

I would avoid turning these into hard kernel primitives:

```txt
Event
Reaction
Effect
Mutation
Query
Action
Rule
```

They should be **stdlib/core dialect concepts**, not kernel primitives.

The hard kernel should stay small:

```txt
Node
Edge
Type
Expr
Trait
Ref
Graph
Pass
Artifact
Diagnostic
```

Everything else is a dialect pattern.

---

## Biggest design implication

These docs make it clear that the ideal Gen2 compiler is not just “generate code from schema.”

It is a semantic planner.

It can answer:

```txt
What logic is true?
What function can be called?
What does it read?
What does it write?
What operation happened?
What laws apply?
What queries are affected?
Can we patch?
Can we roll back?
Can this run offline?
Does retry require idempotency?
Can this rule lower to SQL?
Can this UI evaluate the rule safely?
What artifacts should be emitted?
What diagnostics or repairs are available?
```

That is the real product.

My verdict: **these docs are directionally very strong, and they fit the ideal design well.** They should be folded into the agent transition plan as the target architecture for the expression/rule, callable/function, reactivity/sync, and dispatch/effect dialects.
