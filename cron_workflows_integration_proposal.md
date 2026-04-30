# Proposal: Cron And Workflows For A TypeScript Static IR App Library

## 1. Summary

This proposal adds first-class support for **cron jobs**, **scheduled tasks**, and **workflows** to the TypeScript IR library.

The goal is not to bolt on a background-job runner. The goal is to model scheduled and long-running behavior as typed, inspectable application semantics that compose with the existing primitives:

- `Entity`
- `SemanticType`
- `Expr`
- `Predicate`
- `Function`
- `QueryFunction`
- `ActionFunction`
- `Rule`
- `Requirement`
- `Effect`
- `Key`
- `Reaction`
- `Event`
- `Migration`
- `Authz`
- `ReactivityGraph`
- `Target`
- `Artifact`

Cron and workflows should become part of the same static graph as CRUD, auth, routes, forms, reactivity, and services.

The central idea:

```txt
Cron describes when work should be started.
Workflow describes durable, typed, multi-step work.
ActionFunction remains the canonical primitive for effectful units of work.
```

Cron should trigger actions or workflows. Workflows should compose actions, queries, rules, waits, timers, retries, compensation, and child workflows using inspectable plan nodes.

## 2. Motivation

Modern apps need more than request/response handlers.

They need:

- nightly cleanup jobs
- billing cycles
- trial expiration checks
- digest emails
- SLA escalation
- reminder notifications
- data syncs
- webhook retries
- import/export pipelines
- approval flows
- onboarding flows
- recurring reports
- long-running backfills
- state-machine transitions
- outbox processing
- reaction delivery
- scheduled reactivity invalidation

In ordinary apps, this logic is often scattered across:

```txt
cron configs
queue consumers
Temporal workflows
BullMQ processors
Cloudflare Queues
serverless scheduled functions
ad-hoc scripts
database triggers
outbox tables
manual runbooks
```

That makes it hard to answer:

- What jobs exist?
- What do they read and write?
- What services do they require?
- What happens if they fail?
- Are they idempotent?
- What keys do they invalidate?
- Which auth or rules do they bypass?
- What target can run them?
- What data migrations/backfills are safe?
- Which jobs are affected by a schema change?

This library can do better by making cron and workflows part of the semantic IR.

## 3. Design Goals

### 3.1 Static And Inspectable

Cron jobs and workflows MUST be represented as static records or typed AST/plan nodes.

They MUST NOT require arbitrary JavaScript closure execution for checking, graph derivation, target generation, placement planning, or diagnostics.

### 3.2 Reuse Existing Primitives

Cron and workflows should reuse existing primitives rather than creating a separate parallel system.

Use:

```txt
ActionFunction
  as the canonical unit of effectful work

QueryFunction
  as the canonical unit of reads

Expr / Predicate
  for typed conditions, projections, transforms, and branching

Requirement / Effect
  for service and side-effect tracking

Rule
  for reusable semantic predicates

Key / ReactiveKeyPattern
  for invalidation and cache refresh

Event
  for event-triggered starts and workflow emissions

Reaction
  for rule/event-to-action connections

FallbackPlan / Placement
  for target capability planning
```

### 3.3 Composable

Users and plugin authors should be able to define new workflow-like abstractions that compose if they expose the right traits:

```txt
Callable
Effectful
Requires
Emits
Waits
Schedules
Compensatable
Retryable
Idempotent
TargetInterpretable
Lowerable
```

### 3.4 Target-Agnostic

Cron/workflow definitions should not depend on a single runtime.

Targets may include:

- plain Node cron
- serverless scheduled functions
- Cloudflare Cron Triggers
- Vercel Cron Jobs
- GitHub Actions schedules
- Kubernetes CronJobs
- database scheduler
- BullMQ
- Faktory
- Sidekiq-like adapters
- Temporal
- Inngest
- Trigger.dev
- Hatchet
- AWS Step Functions
- durable execution engines
- custom outbox/worker runtime

### 3.5 Durable Where Needed

Short background jobs and long-running workflows have different semantics.

The IR should distinguish:

```txt
Ephemeral job:
  may run to completion in one process invocation

Durable workflow:
  may wait, retry, checkpoint, resume, compensate, and survive process restarts
```

### 3.6 Safe By Default

Effectful scheduled work should require explicit metadata for:

- idempotency
- retry policy
- concurrency policy
- timeout
- failure handling
- delivery guarantees
- requirements/effects
- key invalidation
- observability
- target capability support

## 4. Conceptual Model

### 4.1 Three Layers

```txt
Schedule:
  When should work start?

Job:
  A scheduled invocation of a callable/action/workflow.

Workflow:
  A typed, inspectable plan for multi-step or durable work.
```

### 4.2 Relationship To Existing Primitives

```txt
CronJob
  uses Schedule
  invokes CallableNode or ActionFunction or Workflow
  declares execution policy
  participates in graph

Workflow
  is a CallableNode
  contains WorkflowPlan nodes
  composes QueryFunction, ActionFunction, Rule, Expr, waits, branches, retries, compensation
  declares requirements/effects
  may emit events and invalidate keys

ActionFunction
  remains the canonical effectful primitive
  workflow steps should usually call actions rather than hide side effects internally
```

### 4.3 Recommended Namespaces

```ts
gen.schedule.*
gen.cron.*
gen.workflow.*
gen.job.*
```

Possible package names:

```txt
@gen/schedule
@gen/workflow
@gen/jobs
```

Or one package:

```txt
@gen/orchestration
```

Recommended split:

```txt
@gen/schedule:
  Schedule, CronJob, scheduled triggers

@gen/workflow:
  Workflow, WorkflowPlan, durable orchestration

@gen/jobs:
  queue/outbox/job execution model
```

But they can initially ship together.

## 5. Core Types

### 5.1 Schedule

A schedule is a static description of when work should start.

```ts
interface Schedule<Name extends string = string> {
  readonly kind: "schedule";
  readonly id: StaticId;
  readonly name: Name;
  readonly expression: ScheduleExpression;
  readonly timezone?: TimeZone;
  readonly calendar?: CalendarPolicy;
  readonly jitter?: JitterPolicy;
  readonly misfire?: MisfirePolicy;
  readonly enabled?: boolean | Expr<boolean>;
  readonly metadata?: StaticMetadata;
}
```

`ScheduleExpression` should be a discriminated union:

```ts
type ScheduleExpression =
  | CronExpressionSchedule
  | IntervalSchedule
  | DailySchedule
  | WeeklySchedule
  | MonthlySchedule
  | CalendarSchedule
  | OneOffSchedule
  | CustomSchedule;
```

Examples:

```ts
const nightly = gen.schedule.cron("0 2 * * *", {
  timezone: "America/New_York",
});

const everyFiveMinutes = gen.schedule.interval({ minutes: 5 });

const weekdaysAtNine = gen.schedule.weekly({
  days: ["mon", "tue", "wed", "thu", "fri"],
  time: "09:00",
  timezone: "America/New_York",
});
```

### 5.2 CronJob

A cron job binds a schedule to a typed callable.

```ts
interface CronJob<
  In = void,
  Out = unknown,
  Err = never,
  Req = never,
  Eff = never,
> extends StaticNode<"cron_job", In, Out, Err, Req, Eff> {
  readonly schedule: Schedule;
  readonly input?: ExprFunction<ScheduledFireContext, In> | StaticInput<In>;
  readonly run: CallableNode<In, Out, Err, Req, Eff> | ActionFunction<In, Out> | Workflow<In, Out>;
  readonly execution: CronExecutionPolicy;
  readonly placement?: Placement;
  readonly fallback?: FallbackPlan;
}
```

The `input` maps the scheduled fire context into the action/workflow input.

`ScheduledFireContext` may include:

```ts
interface ScheduledFireContext {
  readonly scheduledAt: Date;
  readonly firedAt: Date;
  readonly scheduleName: string;
  readonly attempt: number;
  readonly windowStart?: Date;
  readonly windowEnd?: Date;
}
```

### 5.3 CronExecutionPolicy

```ts
interface CronExecutionPolicy {
  readonly concurrency?: ConcurrencyPolicy;
  readonly retry?: RetryPolicy;
  readonly timeout?: Duration;
  readonly idempotency?: IdempotencyPlan;
  readonly misfire?: MisfirePolicy;
  readonly catchup?: CatchupPolicy;
  readonly delivery?: DeliveryPolicy;
  readonly observability?: ObservabilityPolicy;
}
```

Important policies:

```txt
concurrency:
  allow_overlap
  skip_if_running
  queue_next
  replace_running
  singleton_global
  singleton_per_key

misfire:
  skip
  run_once
  run_all_missed
  run_latest_window

catchup:
  none
  bounded
  all

retry:
  none
  fixed
  exponential
  target_default

delivery:
  at_most_once
  at_least_once
  exactly_once_if_supported
```

### 5.4 Workflow

A workflow is a typed callable plan.

```ts
interface Workflow<
  In = unknown,
  Out = unknown,
  Err = never,
  Req = never,
  Eff = never,
> extends StaticNode<"workflow", In, Out, Err, Req, Eff> {
  readonly name: string;
  readonly input: SemanticType<In>;
  readonly output: SemanticType<Out>;
  readonly errors?: readonly ErrorType[];
  readonly plan: WorkflowPlan<In, Out>;
  readonly execution?: WorkflowExecutionPolicy;
  readonly requirements?: readonly Requirement[];
  readonly effects?: readonly Effect[];
}
```

A workflow should implement the generic `CallableNode` trait so it can be used anywhere a callable/effectful server-side operation is allowed.

### 5.5 WorkflowPlan

`WorkflowPlan` should be a discriminated union.

```ts
type WorkflowPlan<In = unknown, Out = unknown> =
  | WorkflowCallStep<In, Out>
  | WorkflowQueryStep<In, Out>
  | WorkflowActionStep<In, Out>
  | WorkflowSequenceStep<In, Out>
  | WorkflowParallelStep<In, Out>
  | WorkflowMapStep<In, Out>
  | WorkflowChainStep<In, Out>
  | WorkflowBranchStep<In, Out>
  | WorkflowSwitchStep<In, Out>
  | WorkflowWaitStep<In, Out>
  | WorkflowWaitUntilStep<In, Out>
  | WorkflowWaitForEventStep<In, Out>
  | WorkflowRetryStep<In, Out>
  | WorkflowTimeoutStep<In, Out>
  | WorkflowCompensateStep<In, Out>
  | WorkflowSagaStep<In, Out>
  | WorkflowEmitEventStep<In, Out>
  | WorkflowInvalidateStep<In, Out>
  | WorkflowChildWorkflowStep<In, Out>
  | WorkflowCustomStep<In, Out>;
```

Start smaller for MVP:

```txt
call
action
query
sequence
parallel
branch
wait
retry
emit
invalidate
```

Add compensation and durable waits later.

## 6. Public API Proposal

### 6.1 Simple Cron Job

```ts
const cleanupExpiredSessions = gen.func.action({
  name: "cleanupExpiredSessions",
  input: gen.types.object({ olderThan: gen.types.datetime() }),
  returns: gen.types.object({ deleted: gen.types.number() }),
  effects: [Delete(Session)],
  body: gen.action
    .delete(Session)
    .where(gen.expr.lt(Session.fields.expiresAt, gen.expr.param("olderThan"))),
});

const cleanupJob = gen.cron.define({
  name: "cleanupExpiredSessionsNightly",
  schedule: gen.schedule.cron("0 3 * * *", {
    timezone: "UTC",
  }),
  input: gen.func.expr({
    input: gen.schedule.fireContext(),
    returns: cleanupExpiredSessions.input,
    body: gen.expr.object({
      olderThan: gen.expr.minus(gen.expr.field("firedAt"), gen.duration.days(30)),
    }),
  }),
  run: cleanupExpiredSessions,
  execution: {
    concurrency: "skip_if_running",
    retry: gen.retry.exponential({ maxAttempts: 3 }),
    timeout: gen.duration.minutes(10),
    idempotency: gen.idempotency.byScheduleWindow("daily"),
  },
});
```

### 6.2 Cron Running A Workflow

```ts
const sendWeeklyDigest = gen.workflow.define({
  name: "sendWeeklyDigest",
  input: gen.types.object({ weekStart: gen.types.date() }),
  output: gen.types.object({ sent: gen.types.number(), failed: gen.types.number() }),
  plan: gen.workflow.sequence([
    gen.workflow.query(listUsersEligibleForDigest),
    gen.workflow.parallelMap({
      items: gen.workflow.value("users"),
      run: sendDigestToUser,
      concurrency: 50,
      retry: gen.retry.exponential({ maxAttempts: 5 }),
    }),
    gen.workflow.return(
      gen.expr.object({
        sent: gen.expr.countSuccesses(),
        failed: gen.expr.countFailures(),
      }),
    ),
  ]),
});

const weeklyDigestJob = gen.cron.define({
  name: "weeklyDigest",
  schedule: gen.schedule.weekly({ day: "mon", time: "09:00", timezone: "UTC" }),
  input: gen.schedule.windowInput({ unit: "week" }),
  run: sendWeeklyDigest,
  execution: {
    concurrency: "singleton_global",
    idempotency: gen.idempotency.byScheduleWindow("weekly"),
  },
});
```

### 6.3 Event-Started Workflow

Cron is not the only workflow trigger.

```ts
const onboardingWorkflow = gen.workflow.define({
  name: "onboardingWorkflow",
  input: UserCreatedEvent,
  output: gen.types.void(),
  plan: gen.workflow.sequence([
    gen.workflow.action(createDefaultWorkspace),
    gen.workflow.action(sendWelcomeEmail),
    gen.workflow.wait(gen.duration.days(3)),
    gen.workflow.branch({
      if: userHasActivatedRule,
      then: gen.workflow.action(sendActivationCongrats),
      else: gen.workflow.action(sendReminderEmail),
    }),
  ]),
});

gen.reaction.define({
  name: "startOnboardingWhenUserCreated",
  when: UserCreatedEvent,
  run: onboardingWorkflow,
  mode: "on_insert_match",
  delivery: gen.delivery.outbox(),
});
```

### 6.4 Rule-Started Scheduled Work

```ts
const invoiceIsPastDue = gen.rule.define({
  name: "invoiceIsPastDue",
  input: Invoice,
  predicate: gen.predicate.and(
    gen.expr.eq(Invoice.fields.status, "open"),
    gen.expr.lt(Invoice.fields.dueDate, gen.expr.now()),
  ),
});

const pastDueInvoiceJob = gen.cron.define({
  name: "scanPastDueInvoices",
  schedule: gen.schedule.daily({ time: "01:00", timezone: "UTC" }),
  run: gen.workflow.define({
    name: "processPastDueInvoices",
    input: gen.types.void(),
    output: gen.types.void(),
    plan: gen.workflow.sequence([
      gen.workflow.query(listInvoicesMatching(invoiceIsPastDue)),
      gen.workflow.parallelMap({
        items: gen.workflow.value("invoices"),
        run: sendPastDueNotice,
        concurrency: 25,
      }),
    ]),
  }),
});
```

## 7. Workflow Composition Semantics

### 7.1 Sequence

Runs steps in order.

```ts
gen.workflow.sequence([stepA, stepB, stepC]);
```

Requirements/effects:

```txt
requires = Requires<A> | Requires<B> | Requires<C>
effects = Effects<A> | Effects<B> | Effects<C>
```

Graph edges:

```txt
A -> B -> C
```

### 7.2 Parallel

Runs independent branches concurrently if target supports it.

```ts
gen.workflow.parallel({
  user: getUser,
  projects: listProjects,
  notifications: listNotifications,
});
```

Requirements/effects are unioned. Errors should preserve branch identity.

Graph edges show parallel branches separately.

### 7.3 Chain

Runs a dependent next step using previous output.

```ts
gen.workflow.chain(getUser, (user) => listProjectsForOrg(user.orgId));
```

The callback form must lower to static IR or a static function builder. Avoid storing opaque callbacks.

### 7.4 Branch

Branches on a typed predicate.

```ts
gen.workflow.branch({
  if: canSendReminder,
  then: sendReminder,
  else: noop,
});
```

The predicate should be `Predicate<Input, boolean>` or `Rule`.

### 7.5 Retry

Retry should wrap a step and expose retry semantics as static data.

```ts
gen.workflow.retry(sendEmail, {
  policy: gen.retry.exponential({ maxAttempts: 5, baseDelay: "10s" }),
  retryOn: [TransientEmailError],
});
```

Targets decide whether retry is implemented by queue, durable workflow engine, or inline loop.

### 7.6 Wait

```ts
gen.workflow.wait(gen.duration.days(3));
```

Durable wait requires target support. If target cannot checkpoint/resume, the checker should reject or select a fallback.

### 7.7 Wait For Event

```ts
gen.workflow.waitForEvent({
  event: UserActivatedEvent,
  where: gen.expr.eq(UserActivatedEvent.fields.userId, gen.workflow.input("userId")),
  timeout: gen.duration.days(7),
});
```

Requires event correlation and durable state.

### 7.8 Compensation / Saga

For multi-step side effects, workflows may define compensation.

```ts
gen.workflow.saga([
  gen.workflow.step({
    run: reserveInventory,
    compensate: releaseInventory,
  }),
  gen.workflow.step({
    run: chargePayment,
    compensate: refundPayment,
  }),
  gen.workflow.step({
    run: createShipment,
    compensate: cancelShipment,
  }),
]);
```

Compensation should not be implicit. It should be declared and checked.

## 8. Requirements, Effects, And Laws

### 8.1 Requirement Bubbling

Cron jobs and workflows should bubble requirements from their run targets.

Example:

```txt
cleanupExpiredSessions requires Database
sendDigest requires Database | EmailService
weeklyDigestJob requires Database | EmailService | SchedulerRuntime
```

### 8.2 Effects

Effects should include:

```txt
Read<Entity>
Write<Entity>
Delete<Entity>
SendEmail
CallWebhook
EnqueueJob
EmitEvent
InvalidateKey
Wait
StartWorkflow
```

### 8.3 Laws

Laws are important for retry, batching, and recovery.

Useful laws:

```txt
idempotent
commutative
associative
has_inverse
retry_safe
compensatable
monotonic
```

Examples:

```ts
const sendDigestToUser = gen.func.action({
  name: "sendDigestToUser",
  input: SendDigestInput,
  returns: gen.types.void(),
  effects: [SendEmail],
  laws: [gen.law.idempotent({ key: ["weekly-digest", "userId", "weekStart"] })],
  body: ...,
});
```

If an action is retried but not idempotent, emit a diagnostic unless a delivery target can guarantee exactly-once behavior.

## 9. Idempotency And Delivery

Effectful scheduled work is dangerous without idempotency.

### 9.1 IdempotencyPlan

```ts
interface IdempotencyPlan<In = unknown> {
  readonly kind: "idempotency";
  readonly key: ExprFunction<In, string | readonly unknown[]>;
  readonly scope: "global" | "tenant" | "entity" | "schedule_window";
  readonly storage?: ServiceRef;
}
```

Common helpers:

```ts
gen.idempotency.byInput(fields);
gen.idempotency.byEntity(entity, idExpr);
gen.idempotency.byScheduleWindow("daily");
gen.idempotency.byEventId();
gen.idempotency.custom(expr);
```

### 9.2 DeliveryPolicy

```txt
at_most_once:
  may skip during failure; no duplicate side effects

at_least_once:
  retries possible; idempotency needed

exactly_once_if_supported:
  target must prove support or reject
```

Default recommendation:

```txt
Cron/job delivery should assume at_least_once unless target proves otherwise.
External side effects require idempotency.
```

## 10. Concurrency

Cron needs explicit concurrency semantics.

```ts
gen.cron.define({
  name: "syncStripeCustomers",
  schedule: gen.schedule.interval({ minutes: 5 }),
  run: syncStripeCustomers,
  execution: {
    concurrency: gen.concurrency.singletonGlobal(),
  },
});
```

Policies:

```txt
allow_overlap
skip_if_running
queue_next
replace_running
singleton_global
singleton_per_key
limit(n)
```

For tenant-aware jobs:

```ts
gen.concurrency.singletonPerKey(gen.expr.field("tenantId"));
```

Concurrency constraints should become target requirements.

## 11. Observability

Cron and workflows should generate observability metadata.

```ts
interface ObservabilityPolicy {
  readonly logs?: boolean;
  readonly metrics?: readonly MetricSpec[];
  readonly traces?: boolean;
  readonly audit?: boolean;
  readonly events?: readonly EventType[];
  readonly dashboards?: boolean;
}
```

Built-in events:

```txt
job.scheduled
job.started
job.succeeded
job.failed
job.skipped
job.misfired
workflow.started
workflow.step.started
workflow.step.succeeded
workflow.step.failed
workflow.completed
workflow.compensated
workflow.cancelled
```

These events can feed devtools, audit logs, generated dashboards, and tests.

## 12. Error Handling

Workflows should model typed errors.

A workflow can:

```txt
fail
retry
fallback
compensate
continue
skip item
emit failure event
escalate
```

Example:

```ts
gen.workflow.parallelMap({
  items: users,
  run: sendDigestToUser,
  onItemError: "continue",
  collectErrors: true,
});
```

The workflow output type should reflect partial success if errors are collected.

## 13. Graph Integration

Cron and workflows should appear in the app graph.

### 13.1 Nodes

```txt
Schedule
CronJob
Workflow
WorkflowStep
Queue
Outbox
Worker
Timer
ExternalService
```

### 13.2 Edges

```txt
schedule_triggers
cron_runs
workflow_calls
workflow_queries
workflow_actions
workflow_waits
workflow_emits
workflow_invalidates
workflow_requires
workflow_effects
workflow_compensates
workflow_starts_child
workflow_listens_for_event
```

### 13.3 Queries The Graph Should Answer

```txt
Which jobs write Project?
Which jobs send email?
Which jobs require StripeService?
Which jobs can overlap?
Which jobs lack idempotency?
Which workflows wait longer than one request?
Which targets can run this workflow?
Which jobs are affected by a schema change?
Which keys can this workflow invalidate?
Which jobs bypass auth?
```

## 14. Reactivity And Keys Integration

Cron/workflows often write data or invalidate derived resources.

### 14.1 Explicit Invalidation

```ts
gen.workflow.invalidate([
  projectKeys.list.any(),
  projectKeys.detail.match({ id: gen.workflow.value("projectId") }),
]);
```

### 14.2 Derived Invalidation

If a workflow action writes fields, normal write-set based reactivity should apply.

```txt
Workflow step updateProjectStatus writes Project.status
Rule canViewProject reads Project.status
Query listVisibleProjects uses canViewProject
Key projects.visible.any() may be stale
```

### 14.3 Time-Based Rule Reactivity

Cron can support rules depending on time.

Example:

```txt
Invoice is past due if dueDate < now()
```

This can become:

```txt
Schedule invalidates invoice.pastDue keys daily/hourly
```

The rule planner may suggest a cron invalidation job:

```ts
gen.cron.define({
  name: "refreshPastDueInvoices",
  schedule: gen.schedule.daily({ time: "00:05", timezone: "UTC" }),
  run: gen.reactivity.invalidateAction([invoiceKeys.pastDue.any()]),
});
```

## 15. Auth And Security

Scheduled work often runs without an interactive actor.

The model should distinguish:

```txt
system actor
service account
tenant actor
impersonated actor
user-triggered delayed job
```

### 15.1 Execution Identity

```ts
interface ExecutionIdentity {
  readonly kind: "system" | "service_account" | "tenant" | "user" | "impersonated";
  readonly actor?: ActorRef | ExprFunction<any, ActorRef>;
  readonly permissions?: readonly PolicyRef[];
}
```

Cron jobs should declare identity:

```ts
gen.cron.define({
  name: "billingRun",
  schedule: monthly,
  identity: gen.authz.serviceAccount("billing-worker"),
  run: runBillingWorkflow,
});
```

### 15.2 Policy Checks

Scheduled jobs should not accidentally bypass policy.

There are two valid modes:

```txt
policy_checked:
  workflow invokes normal actions that enforce policies using a declared actor

system_authorized:
  job uses a privileged service identity with explicit permission declaration
```

Diagnostics should fire if a cron job writes protected entities with no identity or policy bypass declaration.

## 16. Workflows And CRUD

CRUD-generated actions can be workflow steps.

Examples:

```txt
Nightly archive old projects:
  query projects inactive for 90 days
  update status to archived
  invalidate project lists
  emit ProjectArchived events

Monthly billing:
  list billable accounts
  create invoice
  charge payment method
  update invoice status
  send receipt
```

CRUD actions already expose:

- input/output types
- write sets
- auth requirements
- key invalidation
- effects

So workflows should call CRUD actions instead of duplicating CRUD logic.

## 17. Migrations And Backfills

Backfills can be modeled as workflows.

```ts
const backfillProjectSearchText = gen.workflow.define({
  name: "backfillProjectSearchText",
  input: gen.types.object({ batchSize: gen.types.number() }),
  output: gen.types.object({ processed: gen.types.number() }),
  plan: gen.workflow.loopBatches({
    query: listProjectsMissingSearchText,
    batchSize: gen.workflow.input("batchSize"),
    run: updateProjectSearchText,
    checkpoint: Project.fields.id,
  }),
});

gen.migration.define({
  name: "addProjectSearchText",
  steps: [
    gen.migration.addField(Project.fields.searchText, { nullable: true }),
    gen.migration.runWorkflow(backfillProjectSearchText),
    gen.migration.setNotNull(Project.fields.searchText),
  ],
});
```

This ties migration safety, job execution, and typed action IR together.

## 18. Target Capability Model

Targets should declare capabilities:

```txt
schedule.cron
schedule.interval
schedule.timezone
schedule.misfire_policy
job.queue
job.retry
job.concurrency_lock
job.idempotency_store
workflow.sequence
workflow.parallel
workflow.durable_wait
workflow.event_wait
workflow.compensation
workflow.child_workflow
workflow.long_running
workflow.checkpoint
workflow.cancellation
workflow.observability
```

A target may support some but not all.

Example:

```txt
Node cron target:
  supports cron, interval, simple action runs
  may not support durable waits or event waits

Temporal target:
  supports durable waits, retries, child workflows, compensation

Serverless cron target:
  supports schedules but has short timeout
  may require workflow lowering to queue steps
```

## 19. Lowering Strategy

Custom and high-level workflows should lower into target-supported primitives.

Examples:

```txt
Workflow sequence
  -> single inline function if short-lived
  -> queue chain if async
  -> Temporal workflow if durable

Cron job
  -> serverless schedule + endpoint
  -> Kubernetes CronJob
  -> Node process schedule
  -> database scheduler entry

Retry wrapper
  -> target retry config
  -> queue retry config
  -> generated retry loop

Wait step
  -> durable timer if supported
  -> scheduled continuation job
  -> reject if unsupported
```

Every lowering should preserve graph metadata.

## 20. Diagnostics

Recommended diagnostics:

```txt
schedule:invalid-cron-expression
schedule:timezone-required
schedule:unsupported-timezone
schedule:misfire-policy-unsupported
schedule:catchup-unbounded

cron:run-not-callable
cron:input-selection-mismatch
cron:missing-idempotency
cron:overlap-policy-missing
cron:target-timeout-too-short
cron:identity-missing
cron:protected-write-without-policy
cron:unbounded-scan
cron:raw-runtime-callback

workflow:step-not-static
workflow:input-output-mismatch
workflow:branch-not-boolean
workflow:parallel-effects-conflict
workflow:durable-wait-unsupported
workflow:event-correlation-missing
workflow:retry-non-idempotent-effect
workflow:compensation-missing
workflow:compensation-input-mismatch
workflow:unhandled-error
workflow:requirements-unsatisfied
workflow:target-capability-missing
workflow:opaque-step-not-portable
workflow:long-running-without-checkpoint
workflow:unsafe-inline-side-effect
workflow:cancellation-unsupported
```

## 21. MVP Scope

Do not start with a full Temporal clone.

### MVP 1: Scheduled Actions

Implement:

- `Schedule`
- `gen.schedule.cron`
- `gen.schedule.interval`
- `CronJob`
- `gen.cron.define`
- run target must be `ActionFunction` or generic `CallableNode`
- input mapping via `ExprFunction`
- concurrency policy
- retry policy
- idempotency metadata
- requirement/effect bubbling
- graph nodes/edges
- diagnostics
- one target, probably Node cron or serverless cron

### MVP 2: Basic Workflow Plan

Implement:

- `Workflow`
- `gen.workflow.define`
- `sequence`
- `parallel`
- `branch`
- `query`
- `action`
- `retry`
- `emit`
- `invalidate`
- type inference for input/output/errors/requirements/effects
- graph derivation
- lower to plain TypeScript or Effect initially

### MVP 3: Durable Features

Add:

- wait
- waitForEvent
- child workflows
- checkpointing
- cancellation
- compensation/saga
- target support for Temporal/Inngest/Trigger.dev/etc.

### MVP 4: Backfills, Reactions, IVM

Integrate workflows with:

- migration backfills
- rule reactions
- outbox delivery
- time-based rule invalidation
- IVM maintenance plans

## 22. Recommended Internal Architecture

### 22.1 Core Traits

Introduce generic traits if not already present:

```txt
callable
readable
writable
effectful
requires
emits
scheduled
workflow
retryable
idempotent
compensatable
lowerable
target_interpretable
```

`Workflow` should implement `callable` and `effectful`.

`CronJob` should implement `scheduled` and `requires`/`effects` via its run target.

### 22.2 Generic Composition

Prefer generic plan composition that can eventually apply outside workflows:

```ts
gen.plan.sequence(...)
gen.plan.parallel(...)
gen.plan.branch(...)
gen.plan.retry(...)
gen.plan.withTimeout(...)
gen.plan.withFallback(...)
```

Then `gen.workflow.*` can be a domain-specific facade over `gen.plan.*`.

### 22.3 Lowering Hooks

Every workflow node should either:

```txt
be directly supported by target
lower to known primitive nodes
emit diagnostic
```

Example:

```ts
interface LowerableWorkflowNode {
  readonly lowersTo?: readonly StaticNode[];
}
```

## 23. Open Questions

1. Should `CronJob.run` accept only `ActionFunction` initially, or any `CallableNode` with effects?
2. Should workflows be implemented as a special function kind, or as a generic callable plan node?
3. Should `gen.workflow.sequence` preserve named intermediate values, or should users explicitly bind outputs?
4. How much callback ergonomics should be allowed before it risks opaque JS?
5. Should retry require idempotency by default for all external effects?
6. Should scheduled jobs always require an execution identity?
7. Should cron definitions generate admin UI controls by default?
8. Should schedules be versioned like schema artifacts?
9. Should migration backfills be workflows from day one?
10. Which target should be first: Node cron, serverless cron, or Temporal?

## 24. Strong Recommendations

1. Keep cron and workflows as **IR**, not runtime-only callbacks.
2. Make `ActionFunction` the canonical unit of effectful work.
3. Make `Workflow` a generic `CallableNode`, not an island.
4. Require idempotency metadata for retried external side effects.
5. Require explicit concurrency policy for cron.
6. Require execution identity for scheduled writes.
7. Start with scheduled actions before durable workflows.
8. Add durable waits only when a target can support them safely.
9. Make backfills workflow-compatible.
10. Put every job and workflow in the graph.

## 25. Example End-To-End Slice

Define:

- `User`
- `Project`
- `Invoice`
- `Subscription`
- `sendEmail` service
- `chargePayment` service

Add:

```txt
Monthly billing cron
  -> starts billing workflow
  -> lists active subscriptions
  -> creates invoices
  -> charges payment method
  -> sends receipts
  -> updates invoice status
  -> retries transient failures
  -> emits BillingRunCompleted
  -> invalidates billing keys
```

The compiler derives:

```txt
requirements:
  Database | PaymentService | EmailService | SchedulerRuntime

effects:
  Read<Subscription>
  Create<Invoice>
  Call<PaymentService>
  SendEmail
  Emit<BillingRunCompleted>
  Invalidate<billing.keys>

graph:
  monthly schedule -> billing workflow -> actions/services/events/keys

diagnostics:
  missing idempotency for chargePayment unless provided
  target timeout too short unless durable target selected
  protected invoice write requires service identity

target output:
  cron trigger
  worker/workflow code
  retry config
  observability events
  generated tests
```

This demonstrates the value: scheduled and long-running behavior becomes a typed, checkable, generatable part of the app model.
