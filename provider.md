
Yes — this architecture can absolutely cover **client state**, **typed context**, and a lot of what people normally use DI for.

But I would frame it carefully:

```txt id="hykjmc"
Requirements describe what a node needs.
Registries describe what exists.
Storage locations describe where state/resources live.
Keys describe how state/resources are addressed.
Providers/bindings describe how requirements are satisfied.
```

That can replace a lot of ad-hoc dependency injection, React context, global stores, and manually wired caches.

But it probably should not “abolish DI” entirely. It should make DI a **generated interpretation of requirements and providers**, not a handwritten pattern users manage everywhere.

## The core idea

If every function/resource/workflow/component says what it requires:

```txt id="5knhg8"
requires:
  AuthSession
  Database
  EmailService
  TenantContext
  FeatureFlags
  ProjectCache
```

And every provider says what it supplies:

```txt id="165go9"
provides:
  AuthSession from request cookies
  TenantContext from route params
  FeatureFlags from client store
  ProjectCache from TanStack Query
  EmailService from server runtime
```

Then the compiler can connect them.

That is dependency injection, but as IR:

```txt id="7sk0gv"
Requirement graph + Provider registry + Placement planner
```

Instead of manually passing things through constructors or React providers.

## How this relates to client state

Client state can be modeled using the same key/storage/registry system.

Examples of client state:

```txt id="nncoj0"
current route params
URL search params
auth session snapshot
theme
locale
feature flags
selected project ID
draft form values
wizard progress
offline queue
pending mutations
local preferences
expanded table rows
```

Each of these can be represented as a typed resource/store entry:

```ts id="0mlokw"
const ThemeState = gen.state.define({
  name: "theme",
  type: gen.types.enum(["light", "dark", "system"]),
  storage: gen.storage.client.localStorage({
    key: "theme",
  }),
  default: "system",
});

const ProjectFilterState = gen.state.define({
  name: "projectFilters",
  type: ProjectFilterInput,
  storage: gen.storage.client.urlSearchParams({
    namespace: "projects",
  }),
});

const CurrentUserResource = gen.reactivity.resource(getCurrentUser, {
  key: currentUserKey,
  storage: gen.storage.client.queryCache(),
});
```

Now client state is no longer random:

```txt id="bhfipa"
some React context here
some Zustand store there
some URL state elsewhere
some localStorage parsing in a hook
```

It is typed, discoverable, and targetable.

## Typed context

You can model “context” as a typed requirement.

Example:

```ts id="sce81y"
const AuthSession = gen.context.define("AuthSession", {
  type: gen.types.object({
    userId: User.fields.id.type,
    roles: gen.types.array(Role),
  }),
  placement: ["server", "client"],
  sensitivity: "auth",
});

const TenantContext = gen.context.define("TenantContext", {
  type: gen.types.object({
    tenantId: Tenant.fields.id.type,
  }),
  placement: ["server", "client"],
});
```

Then functions declare requirements:

```ts id="kf9fcw"
const listProjects = gen.func.query({
  name: "listProjects",
  input: ListProjectsInput,
  returns: gen.types.array(ProjectSummary),
  requires: [AuthSession, TenantContext],
  body: ...,
});
```

A route can provide them:

```ts id="mesqr1"
const TenantRoute = gen.route({
  path: "/t/:tenantId/projects",
  params: gen.types.object({
    tenantId: Tenant.fields.id.type,
  }),
  provides: [
    gen.context.fromParams(TenantContext, ({ tenantId }) => ({ tenantId })),
  ],
  loader: listProjects,
});
```

A server target might lower this to request context. A React target might lower it to providers/hooks. An Effect target might lower it to Layers/Context.

Same semantic requirement, different runtime implementation.

## Does this obviate DI?

It can replace a lot of handwritten DI by making the dependency graph explicit.

Traditional DI:

```txt id="yru5vo"
construct service container
register providers
inject services into handlers
hope wiring is correct
```

This IR approach:

```txt id="v1g7xg"
nodes declare requirements
providers declare capabilities
compiler checks satisfaction
targets generate provider wiring
```

So instead of a user manually writing:

```ts id="yqqh6j"
const service = container.get(ProjectService);
```

They write:

```ts id="jmly9s"
requires: [ProjectService]
```

And the target generates the wiring.

That is better because the compiler can answer:

```txt id="f4gmbl"
Which routes require AuthSession?
Which workflows require EmailService?
Which client components require FeatureFlags?
Which requirements are not provided?
Which provider is server-only but used in client output?
Which contexts must be serialized during hydration?
```

## But keep the distinction

You probably want three related concepts:

```txt id="2uth6y"
Requirement:
  abstract need

Provider:
  how that need is satisfied

Storage/Registry:
  where values/resources are stored or discovered
```

Example:

```txt id="exz73h"
Requirement:
  AuthSession

Provider:
  read signed cookie on server
  hydrate safe session snapshot on client

Storage:
  request context on server
  React context / query cache / atom on client
```

Do not merge them into one concept.

## Storage locations

Storage locations should be first-class typed IR.

Possible storage kinds:

```txt id="lx6d3d"
server.requestContext
server.session
server.database
server.cache
server.kv
server.queue
server.secretStore

client.memory
client.reactContext
client.urlSearchParams
client.localStorage
client.sessionStorage
client.indexedDB
client.queryCache
client.atomStore
client.serviceWorkerCache

shared.hydrationSnapshot
shared.cookie
shared.header
```

Each storage location should declare capabilities:

```txt id="5il8t3"
persistent?
serializable?
sensitive-safe?
server-only?
client-readable?
encrypted?
tenant-scoped?
transactional?
reactive?
hydrated?
offline-capable?
```

Example:

```ts id="gi9msg"
const ClientPreferencesStore = gen.storage.client.localStorage({
  name: "ClientPreferencesStore",
  schema: ClientPreferences,
  capabilities: ["persistent", "client_readable", "reactive"],
});
```

Then the checker can reject unsafe placements:

```txt id="jftmer"
AuthSecret cannot be stored in client.localStorage.
Database connection cannot be provided to client component.
Non-serializable service cannot be hydrated.
```

## Registries

Registries are how the compiler discovers things.

You might have registries for:

```txt id="f34rp4"
entities
fields
semantic types
functions
queries
actions
rules
policies
keys
resources
routes
forms
services
contexts
providers
storage locations
targets
artifacts
workflows
cron jobs
migrations
```

The registry should not just be a bag of objects. It should be graph-aware.

```txt id="9p7y1n"
Registry:
  what exists

Graph:
  how things depend on each other

Planner:
  where and how things are provided/generated
```

## Keys as client-state addresses

Typed keys can address client state too.

Examples:

```ts id="7r8jny"
const selectedProjectKey = gen.key.family("client.selectedProject", {
  input: gen.types.object({
    viewId: gen.types.string(),
  }),
});

const projectFiltersKey = gen.key.family("client.projectFilters", {
  input: gen.types.object({
    routeId: gen.types.string(),
  }),
});

const draftKey = gen.key.family("client.formDraft", {
  input: gen.types.object({
    formId: gen.types.string(),
    entityId: gen.types.optional(Project.fields.id.type),
  }),
});
```

Then client state resources can be keyed:

```ts id="w9oerw"
const projectFilters = gen.state.resource({
  name: "projectFilters",
  key: projectFiltersKey,
  type: ProjectFilterInput,
  storage: gen.storage.client.urlSearchParams(),
});
```

Now route loaders, forms, and components can depend on these keys.

## The big unification

The same graph can represent:

```txt id="0cg271"
server data:
  Project.detail({ id })

client state:
  ProjectFilters({ routeId })

context:
  AuthSession.current

service:
  EmailService

workflow state:
  BillingWorkflowRun({ runId })

offline state:
  OfflineQueue({ tenantId })

hydration:
  HydrationSnapshot({ routeId })
```

They are not all the same thing, but they can all be **typed, addressed, placed, and provided**.

## Suggested primitive: `ContextRef`

Add a first-class context requirement:

```ts id="b6whg2"
interface ContextRef<T> {
  readonly kind: "context_ref";
  readonly name: string;
  readonly type: SemanticType<T>;
  readonly sensitivity?: "public" | "user" | "tenant" | "secret" | "auth";
  readonly allowedPlacements: readonly Placement[];
  readonly defaultStorage?: StorageLocationRef;
  readonly _type?: T;
}
```

Usage:

```ts id="qifb16"
const CurrentActor = gen.context.define("CurrentActor", {
  type: Actor,
  sensitivity: "auth",
  allowedPlacements: ["server", "client"],
});
```

Then:

```ts id="0sm71m"
const canEditProject = gen.rule.define({
  name: "canEditProject",
  input: gen.types.object({
    actor: CurrentActor.type,
    project: Project,
  }),
  predicate: ...
});
```

Or a query can implicitly require it:

```ts id="nlm260"
const listMyProjects = gen.func.query({
  name: "listMyProjects",
  requires: [CurrentActor],
  input: ListProjectsInput,
  returns: gen.types.array(ProjectSummary),
  body: ...
});
```

## Suggested primitive: `Provider`

```ts id="wv8bap"
interface Provider<Req = unknown, Value = unknown> {
  readonly kind: "provider";
  readonly name: string;
  readonly provides: RequirementRef<Req> | ContextRef<Value> | ServiceRef<Value>;
  readonly placement: Placement;
  readonly source: ProviderSource<Value>;
  readonly lifetime: ProviderLifetime;
  readonly scope?: ProviderScope;
  readonly requirements?: readonly Requirement[];
  readonly _value?: Value;
}
```

Provider sources:

```txt id="wn71ny"
static value
environment variable
request header
cookie
route param
query param
database lookup
service constructor
hydration snapshot
client storage
reactive resource
target-native context
```

Example:

```ts id="9dznaf"
gen.provider.define({
  name: "currentActorFromSession",
  provides: CurrentActor,
  placement: "server",
  source: gen.provider.fromRequest(asyncSessionLookup),
  lifetime: "request",
});
```

But for portable IR, prefer static source nodes:

```ts id="6com78"
gen.provider.define({
  name: "currentActorFromSession",
  provides: CurrentActor,
  placement: "server",
  source: gen.provider.fromCookieSession({
    cookie: "session",
    lookup: getSessionActor,
  }),
  lifetime: "request",
});
```

## Suggested primitive: `StateResource`

For client/server state:

```ts id="srvwx0"
interface StateResource<T, K = unknown> {
  readonly kind: "state_resource";
  readonly name: string;
  readonly type: SemanticType<T>;
  readonly key?: KeyFamily<string, K>;
  readonly storage: StorageLocationRef;
  readonly default?: Expr<T> | T;
  readonly readableBy?: readonly Placement[];
  readonly writableBy?: readonly Placement[];
  readonly reactivity?: StateReactivityPlan;
  readonly _type?: T;
  readonly _key?: K;
}
```

Examples:

```ts id="r7lga0"
const Theme = gen.state.define({
  name: "theme",
  type: gen.types.enum(["light", "dark", "system"]),
  storage: gen.storage.client.localStorage({ key: "theme" }),
  default: "system",
});

const CurrentTenant = gen.state.define({
  name: "currentTenant",
  type: TenantContext,
  storage: gen.storage.route.params(),
});
```

## Requirement satisfaction

The compiler should solve:

```txt id="53par1"
For every node:
  collect requirements

For every target/placement:
  find providers

If requirement is not provided:
  diagnostic

If provider placement is incompatible:
  diagnostic

If provider depends on other requirements:
  bubble upward

If provider is sensitive and target is client:
  reject or require safe projection
```

This is DI as static planning.

## Example: route/component generation

Suppose:

```txt id="bl0hmx"
ProjectPage requires:
  CurrentActor
  CurrentTenant
  ProjectResource({ id })
  FeatureFlags
```

Providers:

```txt id="9yq97p"
CurrentActor:
  server: cookie session
  client: hydrated safe actor snapshot

CurrentTenant:
  route params

ProjectResource:
  query resource / TanStack Query

FeatureFlags:
  server: config service
  client: hydrated snapshot + remote refresh
```

React target generates:

```txt id="02g83z"
AuthProvider
TenantProvider
FeatureFlagProvider
QueryClientProvider
useProjectResource
```

Effect target generates:

```txt id="jw10i3"
Layer<AuthSession>
Layer<TenantContext>
Layer<FeatureFlags>
```

Plain TS target generates:

```txt id="se0tf3"
function ProjectPage(ctx: GeneratedContext) { ... }
```

Same IR, different DI strategy.

## Does this replace React Context?

For many things, yes.

Instead of manually deciding:

```txt id="zqs1to"
Should this be React Context?
Should this be Zustand?
Should this be URL state?
Should this be TanStack Query?
Should this be props?
```

You declare:

```txt id="y496no"
This is typed state/context.
Its lifetime is route/session/app/component.
Its storage preference is URL/local/query-cache/memory.
Its sensitivity is public/auth/secret.
It is reactive or not.
```

Then the target chooses or generates:

```txt id="cji0ab"
React Context
hook
atom
query cache
URL binding
localStorage binding
server request context
hydration payload
```

This makes target-specific context an output, not the source of truth.

## Lifetimes are important

Provider and state lifetimes should be explicit:

```txt id="c00oip"
global
app
request
session
tenant
route
component
workflow_run
job_run
transaction
test
```

This prevents mistakes like using request-only data in a global cache.

Example diagnostic:

```txt id="3ksn1j"
context:lifetime-escape
CurrentActor has request lifetime but is captured by global singleton provider.
```

## Sensitivity is important

Context/state should declare sensitivity:

```txt id="5i9wq0"
public
user
tenant
auth
secret
server_only
regulated
```

Then hydration and client generation can check:

```txt id="xgch5z"
Can this value be sent to the client?
Can this be persisted in localStorage?
Can this be logged?
Can this be included in devtools?
```

This is especially important if context replaces DI.

## Testability

This becomes excellent for tests.

Because requirements are explicit, test targets can generate mocks:

```ts id="37q2n7"
gen.test.provide(CurrentActor, fakeActor)
gen.test.provide(EmailService, fakeEmailService)
gen.test.provide(FeatureFlags, { newBilling: true })
```

And the compiler knows which tests need which providers.

## Agent-era benefit

This is also very agent-friendly.

An agent can ask:

```txt id="8gnwbb"
Why does this route need AuthSession?
What provides TenantContext?
Can this component be rendered client-side?
What state is persisted?
What secrets could leak to the browser?
What mocks are needed for this workflow test?
```

The graph can answer.

## The danger

The danger is over-unifying everything into a vague “registry.”

Avoid making one giant abstraction called `ContextStoreThing`.

Keep the model separated:

```txt id="ouyy56"
Requirement:
  a need

Provider:
  a way to satisfy a need

StorageLocation:
  where values live

Key:
  how values/resources are addressed

StateResource:
  typed value in a storage location

Registry:
  discoverable catalog of definitions

Graph:
  dependency/placement relationships

Target:
  generated runtime interpretation
```

That separation will keep the system understandable.

## Recommended initial implementation

Start small:

```txt id="r3y3hb"
1. Requirement and Provider IR
2. ContextRef for typed context values
3. StorageLocation for server request, client memory, URL search params, localStorage, query cache
4. StateResource for typed client/server state
5. Requirement satisfaction checker
6. Placement/sensitivity/lifetime diagnostics
7. One React target lowering to Context/hooks/query cache
8. One server target lowering to request context
```

Do not try to replace all DI systems immediately.

## Good diagnostics

```txt id="a3y5s4"
context:missing-provider
context:ambiguous-provider
context:provider-placement-invalid
context:lifetime-escape
context:secret-exposed-to-client
context:non-serializable-hydration
context:client-storage-sensitive-value
context:requirement-unsatisfied
context:cyclic-provider-dependency
context:provider-scope-conflict
context:state-key-mismatch
context:storage-capability-missing
context:server-only-requirement-in-client-node
```

## Bottom line

Yes, this can become a powerful replacement for much of DI and client state management.

The best framing is:

```txt id="720ete"
Requirements flow upward.
Providers satisfy requirements.
Storage locations determine where values live.
Keys address reactive values.
Targets lower the plan into React context, Effect layers, request context, query cache, localStorage, URL params, or server containers.
```

That means users define semantic needs and state, not hand-wired runtime plumbing.

It does not eliminate DI as a concept. It turns DI into a **checked, generated interpretation of the app graph**.
