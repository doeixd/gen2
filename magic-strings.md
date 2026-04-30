Yes — typed references should be the default. Magic strings should be either avoided entirely or limited to stable external names where they are unavoidable.

The better design is:

```txt id="jql8n8"
Authoring API:
  typed refs and object references

Persisted IR / artifacts:
  stable IDs

Target output:
  target-specific strings generated from refs/IDs
```

So users write:

```ts id="julii4"
Project.fields.status;
Project.relations.members;
canViewProject;
currentActor;
projectKeys.detail;
EmailService.methods.send;
```

not:

```ts id="dk05x1"
"Project.status";
"members";
"canViewProject";
"currentActor";
"project.detail";
"send";
```

## Core principle

Every first-class thing should have a typed ref:

```txt id="mn51k6"
EntityRef<T>
FieldRef<Entity, T>
RelationRef<From, To>
FunctionRef<In, Out, Err, Req, Eff>
RuleRef<Input>
PolicyRef
KeyFamilyRef<Input>
ContextRef<T>
ServiceRef<T>
MethodRef<Service, In, Out>
StorageLocationRef<T>
ProviderRef<T>
RouteRef<Params, Query, Loader>
WorkflowRef<In, Out>
MigrationRef<From, To>
```

The ref carries:

```txt id="g6y83k"
stable ID
human name
kind
phantom types
metadata
```

Example shape:

```ts id="xtr9px"
interface Ref<Kind extends string, Id extends string, T = unknown> {
  readonly kind: Kind;
  readonly id: Id;
  readonly name?: string;
  readonly _type?: T;
}
```

But for fields you want stronger typing:

```ts id="xgxi4h"
interface FieldRef<E, Name extends string, T> {
  readonly kind: "field_ref";
  readonly id: StableId;
  readonly name: Name;
  readonly entity: EntityRef<E>;
  readonly type: SemanticType<T>;

  readonly _entity?: E;
  readonly _name?: Name;
  readonly _type?: T;
}
```

## What this improves

Typed refs give you:

```txt id="j2gyad"
rename safety
better autocomplete
better inference
fewer invalid strings
field/entity mismatch errors
relation source/target checks
key payload checks
provider/requirement checks
migration lineage
graph stability
agent-safe edits
```

For example, this should type-error:

```ts id="wz3l5v"
gen.expr.field(Invoice.fields.total, {
  from: Project,
});
```

because `Invoice.fields.total` is not a `Project` field.

## Expressions should use refs

Instead of:

```ts id="srm747"
gen.expr.field("project.status");
```

use:

```ts id="lhs7ux"
gen.expr.field(Project.fields.status);
```

Instead of:

```ts id="g3mzl3"
gen.expr.param("actorId");
```

you can use typed input refs where possible:

```ts id="626xmm"
const input = gen.input.object({
  actorId: Actor.fields.id.type,
  projectId: Project.fields.id.type,
});

gen.expr.param(input.fields.actorId);
```

Or inside a typed builder:

```ts id="9fay1d"
gen.func.expr({
  input: UpdateProjectInput,
  returns: Project.fields.id.type,
  body: ({ input }) => input.projectId,
});
```

As long as that builder lowers to static IR and does not preserve the callback.

## Rules should use refs

Prefer:

```ts id="1cjoyu"
const canEditProject = gen.rule.define({
  name: "canEditProject",
  input: gen.types.object({
    actor: Actor,
    project: Project,
  }),
  predicate: gen.predicate.and(
    gen.expr.eq(Project.fields.ownerId, Actor.fields.id),
    gen.expr.eq(Project.fields.status, ProjectStatus.values.draft),
  ),
});
```

Or with bound vars:

```ts id="6drxxv"
const vars = gen.rule.vars({
  actor: Actor,
  project: Project,
});

const canEditProject = gen.rule.define({
  name: "canEditProject",
  vars,
  predicate: gen.predicate.and(
    gen.expr.eq(vars.project.fields.ownerId, vars.actor.fields.id),
    gen.expr.eq(vars.project.fields.status, ProjectStatus.values.draft),
  ),
});
```

Not:

```ts id="hzt33a"
gen.rule.field("project.ownerId");
```

## Services should use method refs

Instead of:

```ts id="fwq5o5"
gen.action.callService(EmailService, "sendEmail", input);
```

prefer:

```ts id="jsl04n"
gen.action.call(EmailService.methods.sendEmail, input);
```

Then the method ref carries input/output/effect types:

```ts id="1xz9w7"
EmailService.methods.sendEmail;
// MethodRef<EmailService, SendEmailInput, SendEmailResult>
```

The compiler can reject wrong input.

## Context should use refs

Instead of:

```ts id="f2ph1y"
requires: ["CurrentActor"];
```

use:

```ts id="z77lk7"
requires: [CurrentActor];
```

And providers:

```ts id="4x3dqh"
gen.provider.define({
  provides: CurrentActor,
  source: gen.provider.fromCookie(SessionCookie),
});
```

Not:

```ts id="qlka9u"
provides: "CurrentActor";
```

## Keys should use key-family refs

Key names might still need stable string IDs, but the authoring API should use the ref object.

Define once:

```ts id="d2mcw3"
const projectDetailKey = gen.key.family({
  id: "key.project.detail",
  input: gen.types.object({
    id: Project.fields.id.type,
  }),
});
```

Then use:

```ts id="7286qy"
projectDetailKey({ id });
projectDetailKey.any();
projectDetailKey.match({ id });
```

not:

```ts id="bxe1m4"
gen.key.invalidate("project.detail");
```

## Migrations especially need stable refs

For migration lineage, stable IDs matter.

A field rename should look like:

```ts id="xe1dtq"
const Project = gen.entity({
  id: gen.id("entity.project"),
  name: "Project",
  fields: {
    title: gen.field.string({
      id: gen.id("field.project.name"),
      renamedFrom: ["name"],
    }),
  },
});
```

The author uses:

```ts id="pgl62a"
Project.fields.title;
```

The persisted IR knows:

```txt id="ijzlit"
stable field id: field.project.name
current name: title
previous name: name
```

That lets the migration planner distinguish:

```txt id="wkd9a4"
rename field
```

from:

```txt id="u4kqej"
drop old field + add unrelated new field
```

## Avoid path strings

A common temptation is:

```ts id="bqiyyd"
gen.path("Project.owner.email");
```

Better:

```ts id="51cx46"
gen.path(Project.relations.owner, User.fields.email);
```

Or:

```ts id="ydw0fe"
Project.paths.owner.email;
```

If you generate typed path objects.

Path refs can carry source/target types:

```ts id="ejwmwg"
PathRef<Project, string>;
```

Then forms, patches, projections, and relation includes become safer.

## Where strings are acceptable

Some strings are unavoidable or fine:

```txt id="rl2rzz"
human-readable display names
external table/column names
URL path templates
cron expressions
environment variable names
target artifact filenames
OpenAPI operation IDs
CSS class names
stable IDs if explicitly declared
```

But they should be clearly marked as external names, not used as internal references.

For example:

```ts id="oh8fr7"
gen.storage.column({
  name: "project_status", // physical DB column name
  field: Project.fields.status, // typed semantic ref
});
```

That is fine.

## Use branded stable IDs where needed

If users must supply IDs, make them branded:

```ts id="mrgwma"
const ProjectId = gen.id.entity("project");
const ProjectStatusFieldId = gen.id.field(ProjectId, "status");
```

Or:

```ts id="skeh6n"
id: gen.stableId("field.project.status");
```

This makes it visually clear that the string is a persistent ID, not a casual lookup key.

## Better API examples

### Entity

```ts id="qzwxb5"
const Project = gen.entity.define({
  id: gen.id.entity("project"),
  name: "Project",
  fields: {
    id: gen.field.uuid({
      id: gen.id.field("project.id"),
    }),
    status: gen.field.enum(ProjectStatus, {
      id: gen.id.field("project.status"),
    }),
  },
});
```

### Query

```ts id="i4bi93"
const listProjects = gen.func.query({
  name: "listProjects",
  input: ListProjectsInput,
  returns: gen.types.array(ProjectSummary),
  body: gen.query
    .from(Project)
    .where(gen.expr.eq(Project.fields.tenantId, ListProjectsInput.fields.tenantId)),
  reactivity: {
    key: gen.key.expr((input) =>
      projectKeys.list({
        tenantId: input.tenantId,
      }),
    ),
  },
});
```

### Provider

```ts id="45vvbt"
const CurrentActor = gen.context.define({
  id: gen.id.context("currentActor"),
  type: Actor,
});

const actorProvider = gen.provider.define({
  provides: CurrentActor,
  source: gen.provider.fromSession(SessionService.methods.getActor),
});
```

### Workflow

```ts id="vgmcnz"
const billingWorkflow = gen.workflow.define({
  name: "billingWorkflow",
  input: BillingRunInput,
  output: BillingRunResult,
  plan: gen.workflow.sequence([
    gen.workflow.call(SubscriptionQueries.listActive),
    gen.workflow.call(BillingActions.createInvoices),
    gen.workflow.call(PaymentService.methods.charge),
  ]),
});
```

No method names as strings.

## Registry lookup should accept refs first

Every registry API should prefer refs:

```ts id="o26i8s"
ctx.get(Project);
ctx.get(Project.fields.status);
ctx.get(canViewProject);
ctx.get(projectKeys.detail);
ctx.get(EmailService.methods.sendEmail);
```

Maybe allow string lookup only for tooling/import:

```ts id="u19tst"
ctx.lookupById("field.project.status");
```

But normal application code should not use it.

## For agents, refs are much better

Typed refs are also agent-friendly. An agent can rename `Project.fields.name` to `Project.fields.title` while preserving the field ID.

The compiler can say:

```txt id="fxsqrb"
This is the same field by stable ID.
Generated DB column remains project.name unless migration says otherwise.
Rules and forms update by reference.
```

If everything is strings, agents will break references more often.

## Suggested policy

I would add this as a project-wide rule:

```txt id="e4lorf"
Public portable APIs MUST accept typed refs where a referenced object exists.
Raw strings MAY be used only for external names, stable IDs, display labels, or target-specific names.
String lookup APIs MUST be secondary and should emit diagnostics when used in portable definitions where a typed ref was available.
```

And diagnostics:

```txt id="8k5208"
ref:raw-string-reference
ref:ambiguous-string-reference
ref:missing-stable-id
ref:rename-without-stable-id
ref:wrong-ref-kind
ref:field-entity-mismatch
ref:method-input-mismatch
ref:unregistered-ref
```

## Bottom line

Yes: use typed references everywhere possible.

The design should feel like:

```txt id="flnp17"
Refs in authoring.
Stable IDs in persisted IR.
Strings only at target boundaries.
```

That gives you type safety, better inference, rename safety, safer migrations, better graph construction, and much better AI-agent editing.
