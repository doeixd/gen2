/**
 * Gen2 / Dirived Ultimate Showcase Example
 * ========================================
 *
 * Target-shape TypeScript API example.
 *
 * This file is intentionally a comprehensive north-star reference, not current
 * runnable implementation code. It demonstrates how the final Gen2 / Dirived
 * authoring surface should feel after integrating the full design:
 *
 * - tiny semantic ontology: Node / Edge / Trait
 * - rich TypeScript witness layer
 * - graph-native entities, fields, types, relations, traits, laws, protocols
 * - app kits, feature modules, module contracts, graph packages
 * - requirements, providers, context, placement, storage locations
 * - privacy/compliance classifications
 * - merge/conflict policies
 * - errors/failures and typed remediation
 * - queries, projections, resources, state, mutations, optimistic/offline sync
 * - rule-derived reactivity, IVM plans, graph-derived invalidation
 * - UI forms, lists, pages, slots, behaviors, JSON-render import/export
 * - dispatch, events, outbox, queues, workers, reactions
 * - boundary/transport plans
 * - observability: metrics, traces, logs, health checks, alerts
 * - evolution/versioning/snapshots/migrations/compatibility surfaces
 * - fixtures, obligations, tests, docs, devtools
 * - capability reports, explain/trace APIs, recipe expansion, graph preview
 * - mandatory legalize-before-emit target pipelines
 *
 * The single most important idea:
 *
 *   Public API can be rich and high-level.
 *   The compiler IR remains one graph of Nodes, Edges, and Traits.
 */

import {
  createGen,
  dialects,
  targets,

  // semantic helpers
  traits,
  laws,
  assurance,
  expr,
  merge,
  invariant,
  diagnostic,
  obligation,

  // runtime/distributed semantics
  delivery,
  idempotency,
  retry,
  serialization,
  sensitivity,
  privacy,
  placement,
  failure,

  // typing helpers
  type GraphWitnessOf,
  type InferDecoded,
  type InferEntity,
  type InferInput,
  type InferOutput,
  type InferError,
} from "@dirived/gen2";

// =============================================================================
// 0. Compiler instance and strictness profile
// =============================================================================

export const gen = createGen("opsdesk")
  .config({
    strictness: {
      mode: "production",
      graph: "strict",
      typing: "strict",
      target: "strict",
      privacy: "strict",
      obligations: "error",
      opaqueCode: "deny_without_declared_blast_radius",
    },

    identity: {
      stableIds: "required",
      renameHints: "required_for_ambiguous_changes",
    },

    diagnostics: {
      includeRemediation: true,
      includeCandidateFixes: true,
      audience: ["developer", "ai_agent"],
    },
  })

  // Hard-kernel-adjacent standard dialects.
  .use(dialects.core)
  .use(dialects.symbol)
  .use(dialects.location)
  .use(dialects.type)
  .use(dialects.expr)
  .use(dialects.operation)
  .use(dialects.law)
  .use(dialects.trait)
  .use(dialects.protocol)
  .use(dialects.diagnostic)
  .use(dialects.artifact)
  .use(dialects.obligation)

  // Core app reasoning dialects.
  .use(dialects.placement)
  .use(dialects.requirement)
  .use(dialects.provider)
  .use(dialects.boundary)
  .use(dialects.failure)
  .use(dialects.privacy)
  .use(dialects.observability)
  .use(dialects.evolution)

  // Product/app dialects.
  .use(dialects.domain)
  .use(dialects.variant)
  .use(dialects.merge)
  .use(dialects.rule)
  .use(dialects.auth)
  .use(dialects.callable)
  .use(dialects.query)
  .use(dialects.reactivity)
  .use(dialects.resource)
  .use(dialects.state)
  .use(dialects.dataflow)
  .use(dialects.dispatch)
  .use(dialects.ui)
  .use(dialects.storage)
  .use(dialects.deployment)
  .use(dialects.fixture)
  .use(dialects.package)

  // Targets.
  .use(targets.postgres)
  .use(targets.effect)
  .use(targets.react)
  .use(targets.jsonRender)
  .use(targets.openapi)
  .use(targets.alchemy)
  .use(targets.tests)
  .use(targets.docs)
  .use(targets.graph)
  .use(targets.typescript)
  .use(targets.textualIr);

const t = gen.type;
const domain = gen.domain;
const rule = gen.rule;
const query = gen.query;
const callable = gen.callable;
const ui = gen.ui;
const storage = gen.storage;
const provider = gen.provider;
const requirement = gen.requirement;
const boundary = gen.boundary;
const dispatch = gen.dispatch;
const dataflow = gen.dataflow;
const deploy = gen.deployment;
const evolution = gen.evolution;
const observability = gen.observability;
const fixtures = gen.fixture;

// =============================================================================
// 1. SaaS kit and app-level defaults
// =============================================================================

export const app = gen.kit.saas("OpsDesk", {
  tenantModel: "organization",
  auth: "session-cookie",
  database: targets.postgres,
  server: targets.effect,
  web: targets.react,
  deployment: targets.alchemy,

  defaults: {
    timestamps: true,
    audit: true,
    optimisticMutations: true,
    offlineCommands: true,
    jsonRender: true,
    generatedTests: true,
    generatedDocs: true,
    graphWitness: true,
    textualIr: true,
  },

  naming: {
    database: storage.naming.snakeCase(),
    artifacts: gen.artifacts.naming.byModule(),
    diagnostics: "reverse_dns",
  },
});

export const {
  ClientBoundary,
  ServerBoundary,
  WorkerBoundary,
  QueueBoundary,
  DatabaseBoundary,
  EdgeBoundary,
} = app.boundaries;

// =============================================================================
// 2. Schema manifest, snapshots, evolution, and versioning
// =============================================================================

export const OpsDeskSchema = evolution.schema("opsdesk", {
  version: "2.4.0",
  previous: "2.3.0",

  surfaces: {
    database: targets.postgres.surface,
    openapi: targets.openapi.surface,
    typescript: targets.typescript.surface,
    jsonRender: targets.jsonRender.surface,
    events: dispatch.surfaces.eventPayloads,
    queues: dataflow.surfaces.queueMessages,
  },

  diagnostics: {
    missingVersion: "error",
    semverMismatch: "warning",
    destructiveDrop: "error",
  },
});

export const PreviousSnapshot = evolution.snapshot("previous-production", {
  schema: OpsDeskSchema,
  path: ".gen2/snapshots/2.3.0.json.gz",
  profile: "production",
  exclude: ["secrets", "runtimeConfig", "closures"],
  redaction: "strict",
});

export const SnapshotPolicy = evolution.snapshotPolicy("ProductionSnapshotPolicy", {
  requireStableIds: true,
  forbidSecrets: true,
  forbidRuntimeClosures: true,
  requireSourceLocations: true,
});

export const RenameHints = evolution.renameHints("OpsDeskRenameHints", [
  evolution.renamedField({
    from: "Incident.description",
    to: "Incident.summary",
    stableId: "field:incident.summary",
    affects: ["database", "typescript", "openapi"],
  }),
]);

// =============================================================================
// 3. Placement and storage locations
// =============================================================================

export const RequestStorage = app.placement.storage("RequestStorage", {
  kind: "server.request",
  traits: [
    placement.traits.ephemeral,
    placement.traits.sensitiveSafe,
    placement.traits.serverReadable,
    placement.traits.serverWritable,
  ],
});

export const SessionCookieStorage = app.placement.storage("SessionCookieStorage", {
  kind: "cookie.session",
  ttl: "7d",
  traits: [
    placement.traits.persistent,
    placement.traits.clientReadable,
    placement.traits.serverReadable,
  ],
});

export const ClientSessionStorage = app.placement.storage("ClientSessionStorage", {
  kind: "client.sessionStorage",
  traits: [
    placement.traits.ephemeral,
    placement.traits.clientReadable,
    placement.traits.clientWritable,
  ],
});

export const ClientQueryCache = app.placement.storage("ClientQueryCache", {
  kind: "client.queryCache",
  traits: [
    placement.traits.ephemeral,
    placement.traits.clientReadable,
    placement.traits.clientWritable,
  ],
});

export const DurableQueueStorage = app.placement.storage("DurableQueueStorage", {
  kind: "server.durableQueue",
  traits: [
    placement.traits.persistent,
    placement.traits.sensitiveSafe,
    placement.traits.serverReadable,
    placement.traits.serverWritable,
  ],
});

export const SharedServerCache = app.placement.storage("SharedServerCache", {
  kind: "shared.cache",
  ttl: "5m",
  traits: [
    placement.traits.ephemeral,
    placement.traits.sensitiveSafe,
    placement.traits.serverReadable,
    placement.traits.serverWritable,
  ],
});

// =============================================================================
// 4. Requirements, providers, context, sensitivity, and lifetimes
// =============================================================================

export const OrgRole = t.enum("OrgRole", ["owner", "admin", "responder", "viewer"] as const);

export const AuthSessionType = t.object("AuthSession", {
  userId: t.uuid,
  organizationId: t.uuid,
  role: OrgRole,
  teamIds: t.array(t.uuid),
});

export const RequestClockType = t.object("RequestClock", {
  now: t.datetime,
});

export const AuthSession = requirement.define("AuthSession", {
  type: AuthSessionType,
  sensitivity: sensitivity.auth(),
  lifetime: "request",
});

export const RequestClock = requirement.define("RequestClock", {
  type: RequestClockType,
  sensitivity: sensitivity.serverOnly(),
  lifetime: "request",
});

export const EmailApiKey = requirement.define("EmailApiKey", {
  type: t.string,
  sensitivity: sensitivity.secret(),
  lifetime: "app",
});

export const SlackWebhookUrl = requirement.define("SlackWebhookUrl", {
  type: t.url,
  sensitivity: sensitivity.secret(),
  lifetime: "app",
});

export const ClientAuthSessionProjection = app.projection("ClientAuthSession", {
  id: "projection:client-auth-session",
  from: AuthSession,
  placement: ClientBoundary,
  sensitivity: sensitivity.user(),

  fields: {
    userId: AuthSessionType.fields.userId,
    organizationId: AuthSessionType.fields.organizationId,
    role: AuthSessionType.fields.role,
    teamIds: AuthSessionType.fields.teamIds,
  },
});

export const AuthSessionProvider = provider.define("AuthSessionProvider", {
  id: "provider:auth-session",
  provides: AuthSession,
  source: provider.source.cookie("opsdesk_session", {
    type: AuthSessionType,
    storage: SessionCookieStorage,
  }),
  placement: ServerBoundary,
  storage: RequestStorage,
  lifetime: "request",
  sensitivity: sensitivity.auth(),
  clientProjection: ClientAuthSessionProjection,
});

export const ClockProvider = provider.define("ClockProvider", {
  id: "provider:clock",
  provides: RequestClock,
  source: provider.source.runtime("clock", { type: RequestClockType }),
  placement: ServerBoundary,
  lifetime: "request",
  sensitivity: sensitivity.serverOnly(),
});

export const EmailProvider = provider.define("EmailProvider", {
  id: "provider:email-api-key",
  provides: EmailApiKey,
  source: provider.source.envVar("EMAIL_API_KEY", { type: t.string }),
  placement: WorkerBoundary,
  lifetime: "app",
  sensitivity: sensitivity.secret(),
});

export const SlackProvider = provider.define("SlackProvider", {
  id: "provider:slack-webhook-url",
  provides: SlackWebhookUrl,
  source: provider.source.envVar("SLACK_WEBHOOK_URL", { type: t.url }),
  placement: WorkerBoundary,
  lifetime: "app",
  sensitivity: sensitivity.secret(),
});

export const ProviderModule = app
  .module("providers", {
    exports: {
      AuthSession,
      RequestClock,
      EmailApiKey,
      SlackWebhookUrl,
      AuthSessionProvider,
      ClockProvider,
      EmailProvider,
      SlackProvider,
    },
  })
  .pipe(
    RequestStorage,
    SessionCookieStorage,
    ClientSessionStorage,
    ClientQueryCache,
    DurableQueueStorage,
    SharedServerCache,
    AuthSession,
    RequestClock,
    EmailApiKey,
    SlackWebhookUrl,
    ClientAuthSessionProjection,
    AuthSessionProvider,
    ClockProvider,
    EmailProvider,
    SlackProvider,
  );

// =============================================================================
// 5. Domain: organization, user, team, project
// =============================================================================

export class Organization extends domain.entity.class("Organization", {
  id: "entity:organization",
  traits: [traits.tenantRoot],

  fields: {
    id: domain.field(t.uuid).id("field:organization.id").primary(),
    slug: domain.field(t.string).id("field:organization.slug").unique(),
    name: domain.field(t.string).id("field:organization.name"),
    plan: domain
      .field(t.enum("Plan", ["free", "team", "enterprise"] as const))
      .id("field:organization.plan"),
    createdAt: domain.field(t.datetime).id("field:organization.created-at"),
  },

  invariants: [
    invariant.unique("organization.slug", {
      field: "slug",
      diagnostic: diagnostic.define("org.slug.not_unique", {
        severity: "error",
        message: "Organization slug must be unique.",
        remediation: { kind: "suggest_value", field: "slug" },
      }),
    }),
  ],
}) {}

export class User extends domain.entity.class("User", {
  id: "entity:user",

  fields: {
    id: domain.field(t.uuid).id("field:user.id").primary(),
    organizationId: domain
      .field(Organization.fields.id.type)
      .id("field:user.organization-id")
      .indexed(),
    email: domain.field(t.email).id("field:user.email").unique().classify({
      privacy: privacy.pii(),
      retention: "while_account_active",
      erase: "on_user_delete",
      logs: "redact",
      devtools: "masked",
    }),
    displayName: domain.field(t.string).id("field:user.display-name"),
    role: domain.field(OrgRole).id("field:user.role"),
    createdAt: domain.field(t.datetime).id("field:user.created-at"),
    disabledAt: domain.field(t.optional(t.datetime)).id("field:user.disabled-at"),
  },

  indexes: [
    domain.index("user_by_org_email", {
      fields: ["organizationId", "email"],
      unique: true,
    }),
  ],
}) {}

export class Team extends domain.entity.class("Team", {
  id: "entity:team",

  fields: {
    id: domain.field(t.uuid).id("field:team.id").primary(),
    organizationId: domain
      .field(Organization.fields.id.type)
      .id("field:team.organization-id")
      .indexed(),
    name: domain.field(t.string).id("field:team.name"),
    createdAt: domain.field(t.datetime).id("field:team.created-at"),
  },
}) {}

export class Project extends domain.entity.class("Project", {
  id: "entity:project",

  fields: {
    id: domain.field(t.uuid).id("field:project.id").primary(),
    organizationId: domain
      .field(Organization.fields.id.type)
      .id("field:project.organization-id")
      .indexed(),
    owningTeamId: domain.field(Team.fields.id.type).id("field:project.owning-team-id").indexed(),
    name: domain.field(t.string).id("field:project.name"),
    slug: domain.field(t.string).id("field:project.slug"),
    createdAt: domain.field(t.datetime).id("field:project.created-at"),
    archivedAt: domain.field(t.optional(t.datetime)).id("field:project.archived-at"),
  },

  indexes: [
    domain.index("project_by_org_slug", {
      fields: ["organizationId", "slug"],
      unique: true,
    }),
  ],
}) {}

export const CoreDomainModule = app
  .module("core-domain", {
    exports: { Organization, User, Team, Project },
  })
  .pipe(
    Organization,
    User,
    Team,
    Project,

    domain.relation("OrganizationUsers", {
      id: "relation:organization-users",
      from: Organization,
      to: User,
      kind: "one_to_many",
      fromField: Organization.fields.id,
      toField: User.fields.organizationId,
      integrity: domain.integrity.databaseForeignKey({ onDelete: "restrict" }),
    }),

    domain.relation("OrganizationProjects", {
      id: "relation:organization-projects",
      from: Organization,
      to: Project,
      kind: "one_to_many",
      fromField: Organization.fields.id,
      toField: Project.fields.organizationId,
    }),

    domain.relation("TeamProjects", {
      id: "relation:team-projects",
      from: Team,
      to: Project,
      kind: "one_to_many",
      fromField: Team.fields.id,
      toField: Project.fields.owningTeamId,
    }),
  );

// =============================================================================
// 6. Incident domain, state machine, merge/conflict, privacy, invariants
// =============================================================================

export const Severity = t.enum("IncidentSeverity", ["sev1", "sev2", "sev3", "sev4"] as const);
export const NotificationChannel = t.enum("NotificationChannel", [
  "email",
  "slack",
  "sms",
] as const);

export const IncidentStatus = gen.variant.stateMachine("IncidentStatus", {
  id: "variant:incident-status",
  states: ["open", "acknowledged", "mitigated", "resolved", "cancelled"] as const,
  transitions: {
    open: ["acknowledged", "cancelled"],
    acknowledged: ["mitigated", "resolved", "cancelled"],
    mitigated: ["resolved"],
    resolved: [],
    cancelled: [],
  },
  terminal: ["resolved", "cancelled"] as const,
});

export const IncidentConflictError = failure.define("IncidentConflictError", {
  kind: "conflict",
  recoverable: true,
  userVisible: true,
  remediation: "manual_resolution",
});

export const ForbiddenError = failure.define("Forbidden", {
  kind: "authorization",
  recoverable: false,
  userVisible: true,
  remediation: "request_access",
});

export const ValidationError = failure.define("ValidationError", {
  kind: "validation",
  recoverable: true,
  userVisible: true,
  remediation: "edit_input",
});

export class Incident extends domain.entity.class("Incident", {
  id: "entity:incident",
  traits: [traits.audited, traits.syncable],

  merge: merge.entityPolicy("IncidentMergePolicy", {
    id: "merge-policy:incident",
    default: merge.fieldWise({ conflict: "may_conflict" }),

    fields: {
      status: merge.stateMachine({
        machine: IncidentStatus,
        conflict: merge.manual({
          surface: "IncidentConflictResolutionView",
          error: IncidentConflictError,
        }),
        laws: [laws.validStateTransition({ assurance: assurance.byConstruction() })],
      }),
      severity: merge.lastWriteWins({ clock: "server" }),
      summary: merge.lastWriteWins({ clock: "server" }),
      updatedAt: merge.max({ assurance: assurance.byConstruction() }),
    },
  }),

  fields: {
    id: domain.field(t.uuid).id("field:incident.id").primary(),
    organizationId: domain
      .field(Organization.fields.id.type)
      .id("field:incident.organization-id")
      .indexed(),
    projectId: domain.field(Project.fields.id.type).id("field:incident.project-id").indexed(),
    title: domain.field(t.string).id("field:incident.title"),
    summary: domain
      .field(t.optional(t.string))
      .id("field:incident.summary")
      .renamedFrom("description"),
    severity: domain.field(Severity).id("field:incident.severity"),
    status: domain.field(IncidentStatus.type).id("field:incident.status"),
    createdByUserId: domain.field(User.fields.id.type).id("field:incident.created-by-user-id"),
    assignedTeamId: domain
      .field(t.optional(Team.fields.id.type))
      .id("field:incident.assigned-team-id"),
    acknowledgedByUserId: domain
      .field(t.optional(User.fields.id.type))
      .id("field:incident.acknowledged-by-user-id"),
    acknowledgedAt: domain.field(t.optional(t.datetime)).id("field:incident.acknowledged-at"),
    mitigatedAt: domain.field(t.optional(t.datetime)).id("field:incident.mitigated-at"),
    resolvedAt: domain.field(t.optional(t.datetime)).id("field:incident.resolved-at"),
    cancelledAt: domain.field(t.optional(t.datetime)).id("field:incident.cancelled-at"),
    createdAt: domain.field(t.datetime).id("field:incident.created-at"),
    updatedAt: domain.field(t.datetime).id("field:incident.updated-at"),
  },

  invariants: [
    invariant.required("incident.title", {
      field: "title",
      diagnostic: diagnostic.define("incident.title.required", {
        severity: "error",
        message: "Incident title is required.",
        remediation: { kind: "focus_field", field: "title" },
      }),
    }),

    invariant.custom("sev1_requires_assigned_team", {
      subject: "Incident",
      when: ({ incident }) => expr.eq(incident.severity, "sev1"),
      must: ({ incident }) => expr.isNotNull(incident.assignedTeamId),
      diagnostic: diagnostic.define("incident.sev1.requires_team", {
        severity: "error",
        audience: ["developer", "ai_agent", "user"],
        message: "SEV1 incidents must have an assigned team.",
        remediation: { kind: "set_field", field: "assignedTeamId" },
      }),
    }),
  ],
}) {}

export class IncidentUpdate extends domain.entity.class("IncidentUpdate", {
  id: "entity:incident-update",
  traits: [traits.appendOnly],
  fields: {
    id: domain.field(t.uuid).id("field:incident-update.id").primary(),
    organizationId: domain
      .field(Organization.fields.id.type)
      .id("field:incident-update.organization-id")
      .indexed(),
    incidentId: domain
      .field(Incident.fields.id.type)
      .id("field:incident-update.incident-id")
      .indexed(),
    authorUserId: domain.field(User.fields.id.type).id("field:incident-update.author-user-id"),
    body: domain.field(t.string).id("field:incident-update.body"),
    createdAt: domain.field(t.datetime).id("field:incident-update.created-at"),
  },
}) {}

export class AuditLog extends domain.entity.class("AuditLog", {
  id: "entity:audit-log",
  traits: [traits.appendOnly, traits.serverOnly],
  fields: {
    id: domain.field(t.uuid).id("field:audit-log.id").primary(),
    organizationId: domain
      .field(Organization.fields.id.type)
      .id("field:audit-log.organization-id")
      .indexed(),
    actorType: domain
      .field(t.enum("AuditActorType", ["user", "system", "worker"] as const))
      .id("field:audit-log.actor-type"),
    actorUserId: domain.field(t.optional(User.fields.id.type)).id("field:audit-log.actor-user-id"),
    action: domain.field(t.string).id("field:audit-log.action"),
    entityRef: domain.field(t.string).id("field:audit-log.entity-ref"),
    payload: domain.field(t.json).id("field:audit-log.payload"),
    createdAt: domain.field(t.datetime).id("field:audit-log.created-at"),
  },
}) {}

export class NotificationPreference extends domain.entity.class("NotificationPreference", {
  id: "entity:notification-preference",
  fields: {
    id: domain.field(t.uuid).id("field:notification-preference.id").primary(),
    organizationId: domain
      .field(Organization.fields.id.type)
      .id("field:notification-preference.organization-id")
      .indexed(),
    userId: domain.field(User.fields.id.type).id("field:notification-preference.user-id").indexed(),
    channel: domain.field(NotificationChannel).id("field:notification-preference.channel"),
    enabled: domain.field(t.boolean).id("field:notification-preference.enabled"),
    minimumSeverity: domain.field(Severity).id("field:notification-preference.minimum-severity"),
  },
}) {}

export const IncidentDomainModule = app
  .module("incident-domain", {
    imports: CoreDomainModule.exports,
    exports: {
      Severity,
      IncidentStatus,
      Incident,
      IncidentUpdate,
      AuditLog,
      NotificationPreference,
    },
  })
  .pipe(
    Severity,
    NotificationChannel,
    IncidentStatus,
    Incident,
    IncidentUpdate,
    AuditLog,
    NotificationPreference,
    domain.relation("ProjectIncidents", {
      id: "relation:project-incidents",
      from: Project,
      to: Incident,
      kind: "one_to_many",
      fromField: Project.fields.id,
      toField: Incident.fields.projectId,
      integrity: domain.integrity.databaseForeignKey({ onDelete: "cascade" }),
    }),
    domain.relation("IncidentUpdates", {
      id: "relation:incident-updates",
      from: Incident,
      to: IncidentUpdate,
      kind: "one_to_many",
      fromField: Incident.fields.id,
      toField: IncidentUpdate.fields.incidentId,
      integrity: domain.integrity.databaseForeignKey({ onDelete: "cascade" }),
    }),
  );

// =============================================================================
// 7. Client-safe projections, rules, and policy
// =============================================================================

export const IncidentCard = app.projection("IncidentCard", {
  id: "projection:incident-card",
  from: Incident,
  placement: ClientBoundary,
  sensitivity: sensitivity.user(),
  fields: {
    id: Incident.fields.id,
    organizationId: Incident.fields.organizationId,
    projectId: Incident.fields.projectId,
    title: Incident.fields.title,
    severity: Incident.fields.severity,
    status: Incident.fields.status,
    assignedTeamId: Incident.fields.assignedTeamId,
    updatedAt: Incident.fields.updatedAt,
  },
});

export const IncidentDetail = app.projection("IncidentDetail", {
  id: "projection:incident-detail",
  from: Incident,
  placement: ClientBoundary,
  sensitivity: sensitivity.user(),
  fields: {
    id: Incident.fields.id,
    organizationId: Incident.fields.organizationId,
    projectId: Incident.fields.projectId,
    title: Incident.fields.title,
    summary: Incident.fields.summary,
    severity: Incident.fields.severity,
    status: Incident.fields.status,
    assignedTeamId: Incident.fields.assignedTeamId,
    acknowledgedByUserId: Incident.fields.acknowledgedByUserId,
    acknowledgedAt: Incident.fields.acknowledgedAt,
    mitigatedAt: Incident.fields.mitigatedAt,
    resolvedAt: Incident.fields.resolvedAt,
    createdAt: Incident.fields.createdAt,
    updatedAt: Incident.fields.updatedAt,
  },
});

export const canViewIncident = rule.define("canViewIncident")((ctx, r) =>
  r
    .vars({ session: AuthSession, incident: Incident })
    .when(({ session, incident }) => expr.eq(session.organizationId, incident.organizationId))
    .traits([traits.sqlLowerable]),
);

export const canManageIncident = rule.define("canManageIncident")((ctx, r) =>
  r
    .vars({ session: AuthSession, incident: Incident })
    .when(({ session, incident }) =>
      expr.and(
        expr.eq(session.organizationId, incident.organizationId),
        expr.or(
          expr.eq(session.role, "owner"),
          expr.eq(session.role, "admin"),
          expr.and(
            expr.eq(session.role, "responder"),
            expr.includes(session.teamIds, incident.assignedTeamId),
          ),
        ),
      ),
    )
    .traits([traits.sqlLowerable]),
);

export const canAcknowledgeIncident = rule.define("canAcknowledgeIncident")((ctx, r) =>
  r
    .vars({ session: AuthSession, incident: Incident })
    .when(({ session, incident }) =>
      expr.and(canManageIncident.call({ session, incident }), expr.eq(incident.status, "open")),
    ),
);

export const canResolveIncident = rule.define("canResolveIncident")((ctx, r) =>
  r
    .vars({ session: AuthSession, incident: Incident })
    .when(({ session, incident }) =>
      expr.and(
        canManageIncident.call({ session, incident }),
        expr.or(expr.eq(incident.status, "acknowledged"), expr.eq(incident.status, "mitigated")),
      ),
    ),
);

export const IncidentPolicy = app.auth.tenantPolicy("IncidentPolicy", {
  id: "policy:incident",
  tenant: Organization,
  entity: Incident,
  rules: { read: canViewIncident, update: canManageIncident },
  enforce: { read: ["server", "database"], update: ["server"] },
  exposeClientHints: true,
});

// =============================================================================
// 8. Operations, actions, events, queries, resources, sync
// =============================================================================

export const SetField = gen.operation.define("SetField", {
  id: "operation:set-field",
  input: t.object("SetFieldInput", { field: t.ref("FieldRef"), value: t.unknown }),
  output: t.object("SetFieldOutput", { previousValue: t.unknown, nextValue: t.unknown }),
  traits: [traits.deterministic, traits.patchable, traits.invertible],
  laws: [laws.rollbackSafe({ assurance: assurance.byConstruction() })],
});

export const AppendIncidentUpdate = gen.operation.define("AppendIncidentUpdate", {
  id: "operation:append-incident-update",
  input: t.object("AppendIncidentUpdateInput", {
    incidentId: Incident.fields.id.type,
    updateId: IncidentUpdate.fields.id.type,
  }),
  output: t.void,
  traits: [traits.deterministic, traits.appendOnly, traits.offlineReplaySafe],
  laws: [
    laws.idempotent({ key: ({ input }) => input.updateId, assurance: assurance.byConstruction() }),
  ],
});

export const IncidentLifecycle = app.recipes.stateMachineFeature("IncidentLifecycle", {
  id: "feature:incident-lifecycle",
  entity: Incident,
  state: Incident.fields.status,
  machine: IncidentStatus,
  timestampField: Incident.fields.updatedAt,
  audit: { entity: AuditLog, actorContext: AuthSession },
  transitionOperation: {
    traits: [traits.deterministic, traits.patchable, traits.serverOnly],
    laws: [
      laws.validStateTransition({ machine: IncidentStatus, assurance: assurance.byConstruction() }),
      laws.rollbackSafe({ assurance: assurance.byConstruction() }),
    ],
  },
  transitions: {
    acknowledge: {
      name: "acknowledgeIncident",
      from: "open",
      to: "acknowledged",
      input: { incidentId: Incident.fields.id.type },
      requires: [AuthSession, RequestClock],
      guard: canAcknowledgeIncident,
      errors: [ForbiddenError, IncidentConflictError, ValidationError],
      set: ({ session, clock }) => ({
        acknowledgedByUserId: session.userId,
        acknowledgedAt: clock.now,
        updatedAt: clock.now,
      }),
      event: {
        name: "IncidentAcknowledged",
        payload: ({ input, session, clock, incident }) => ({
          eventId: app.uuid(),
          organizationId: incident.organizationId,
          incidentId: input.incidentId,
          acknowledgedByUserId: session.userId,
          occurredAt: clock.now,
        }),
      },
      optimistic: "derive",
      offline: true,
    },
    resolve: {
      name: "resolveIncident",
      from: ["acknowledged", "mitigated"],
      to: "resolved",
      input: { incidentId: Incident.fields.id.type, resolutionSummary: t.string },
      requires: [AuthSession, RequestClock],
      guard: canResolveIncident,
      errors: [ForbiddenError, IncidentConflictError, ValidationError],
      append: {
        entity: IncidentUpdate,
        operation: AppendIncidentUpdate,
        values: ({ input, session, clock, incident }) => ({
          id: app.uuid(),
          organizationId: incident.organizationId,
          incidentId: input.incidentId,
          authorUserId: session.userId,
          body: input.resolutionSummary,
          createdAt: clock.now,
        }),
      },
      set: ({ clock }) => ({ resolvedAt: clock.now, updatedAt: clock.now }),
      event: {
        name: "IncidentResolved",
        payload: ({ input, session, clock, incident }) => ({
          eventId: app.uuid(),
          organizationId: incident.organizationId,
          incidentId: input.incidentId,
          resolvedByUserId: session.userId,
          occurredAt: clock.now,
        }),
      },
      optimistic: "derive",
      offline: false,
    },
  },
});

export const acknowledgeIncident = IncidentLifecycle.actions.acknowledge;
export const resolveIncident = IncidentLifecycle.actions.resolve;
export const IncidentAcknowledged = IncidentLifecycle.events.acknowledge;
export const IncidentResolved = IncidentLifecycle.events.resolve;
export const AcknowledgeIncidentMutation = IncidentLifecycle.mutations.acknowledge;
export const ResolveIncidentMutation = IncidentLifecycle.mutations.resolve;

export const declareIncident = callable.action("declareIncident")((ctx, action) =>
  action
    .input({
      organizationId: Organization.fields.id.type,
      projectId: Project.fields.id.type,
      title: t.string,
      summary: t.optional(t.string),
      severity: Severity,
      assignedTeamId: t.optional(Team.fields.id.type),
    })
    .requires(AuthSession)
    .requires(RequestClock)
    .runsIn(ServerBoundary)
    .writes([Incident, AuditLog])
    .applies([SetField])
    .errors([ForbiddenError, ValidationError])
    .body(({ input, session, clock }) => {
      const incident = Incident.insert({
        id: app.uuid(),
        organizationId: input.organizationId,
        projectId: input.projectId,
        title: input.title,
        summary: input.summary,
        severity: input.severity,
        status: "open",
        assignedTeamId: input.assignedTeamId,
        createdByUserId: session.userId,
        createdAt: clock.now,
        updatedAt: clock.now,
      });
      AuditLog.insert({
        id: app.uuid(),
        organizationId: input.organizationId,
        actorType: "user",
        actorUserId: session.userId,
        action: "incident.declared",
        entityRef: incident.ref.id,
        payload: { severity: input.severity },
        createdAt: clock.now,
      });
      return { incident };
    })
    .event("IncidentDeclared", ({ input, result, clock }) => ({
      eventId: app.uuid(),
      organizationId: input.organizationId,
      incidentId: result.incident.id,
      projectId: input.projectId,
      severity: input.severity,
      title: input.title,
      occurredAt: clock.now,
    })),
);

export const IncidentDeclared = declareIncident.events.IncidentDeclared;

export const IncidentQueries = app.recipes.queryResourceSet("IncidentQueries", {
  id: "feature:incident-queries",
  entity: Incident,
  projection: { list: IncidentCard, detail: IncidentDetail },
  queries: {
    listOpen: {
      name: "listOpenIncidents",
      input: {
        organizationId: Organization.fields.id.type,
        projectId: t.optional(Project.fields.id.type),
      },
      key: { name: "openIncidents", hierarchy: "collection" },
      requires: [AuthSession],
      guard: ({ session, input }) => expr.eq(session.organizationId, input.organizationId),
      where: ({ input, row }) =>
        expr.and(
          expr.eq(row.organizationId, input.organizationId),
          input.projectId ? expr.eq(row.projectId, input.projectId) : expr.true(),
          expr.not(expr.includes(["resolved", "cancelled"], row.status)),
        ),
      orderBy: ({ row }) => [row.severity.desc(), row.updatedAt.desc()],
      targetStores: [storage.store.postgres("opsdesk")],
    },
    detail: {
      name: "getIncidentDetail",
      input: { incidentId: Incident.fields.id.type },
      key: { name: "incidentDetail", hierarchy: "entity" },
      requires: [AuthSession],
      whereUnique: ({ input }) => ({ id: input.incidentId }),
      guardResult: ({ session, result }) => canViewIncident.call({ session, incident: result }),
    },
  },
});

export const listOpenIncidents = IncidentQueries.queries.listOpen;
export const getIncidentDetail = IncidentQueries.queries.detail;
export const OpenIncidentsKey = IncidentQueries.keys.listOpen;
export const IncidentDetailKey = IncidentQueries.keys.detail;
export const OpenIncidentsResource = IncidentQueries.resources.listOpen;
export const IncidentDetailResource = IncidentQueries.resources.detail;

export const IncidentTimeline = app.recipes.queryResource("IncidentTimeline", {
  entity: IncidentUpdate,
  projection: IncidentUpdate,
  query: {
    name: "getIncidentTimeline",
    input: { incidentId: Incident.fields.id.type },
    key: { name: "incidentTimeline", hierarchy: "collection" },
    requires: [AuthSession],
    where: ({ input, row }) => expr.eq(row.incidentId, input.incidentId),
    orderBy: ({ row }) => [row.createdAt.asc()],
  },
});

export const IncidentTimelineResource = IncidentTimeline.resource;

export const DeclareIncidentDraftKey = app.key.family("DeclareIncidentDraftKey", {
  input: t.object({ organizationId: Organization.fields.id.type }),
  hierarchy: "custom",
});

export const DeclareIncidentDraft = app.state.resource("DeclareIncidentDraft", {
  type: t.object("DeclareIncidentDraft", {
    title: t.string,
    summary: t.optional(t.string),
    severity: Severity,
    assignedTeamId: t.optional(Team.fields.id.type),
  }),
  key: DeclareIncidentDraftKey,
  storage: ClientSessionStorage,
  readableBy: [ClientBoundary],
  writableBy: [ClientBoundary],
  sensitivity: sensitivity.user(),
  hydrate: false,
  reactive: true,
});

export const IncidentSyncPlan = app.sync.semantic("IncidentSyncPlan", {
  resources: [OpenIncidentsResource, IncidentDetailResource, IncidentTimelineResource],
  mutations: [AcknowledgeIncidentMutation, ResolveIncidentMutation],
  derive: {
    queryReadEdges: true,
    actionWriteEdges: true,
    ruleReads: true,
    ruleInvalidation: true,
    optimisticPatches: true,
    rollback: true,
    ivm: { enabled: true, fallbackForNonMonotonicRules: "broad_invalidation" },
  },
  fallback: {
    opaque: "broad_invalidation",
    unprovablePatch: "invalidate",
    crossStore: "server_composition",
  },
  offline: {
    allow: [acknowledgeIncident],
    queue: app.recipes.offlineCommandQueue("OfflineIncidentCommands", {
      storage: storage.indexedDb("opsdesk_offline_commands"),
      encryption: "required",
      idempotency: idempotency.inputHash(),
      drainWhen: "online",
      mergePolicy: Incident.merge,
    }),
  },
});

// =============================================================================
// 9. UI: form, list, dashboard, JSON-render
// =============================================================================

export const DeclareIncidentMutation = app.mutation("DeclareIncidentMutation", {
  action: declareIncident,
  invalidates: [OpenIncidentsKey.any()],
  optimistic: "invalidate",
});

export const DeclareIncidentForm = app.form.fromAction("DeclareIncidentForm", {
  action: declareIncident,
  mutation: DeclareIncidentMutation,
  draft: DeclareIncidentDraft,
  fields: {
    title: {
      label: "Title",
      widget: ui.widget.textInput(),
      bind: DeclareIncidentDraft.fields.title,
    },
    summary: {
      label: "Summary",
      widget: ui.widget.textArea(),
      bind: DeclareIncidentDraft.fields.summary,
    },
    severity: {
      label: "Severity",
      widget: ui.widget.select({ options: Severity }),
      bind: DeclareIncidentDraft.fields.severity,
    },
    assignedTeamId: {
      label: "Assigned team",
      widget: ui.widget.relationSelect({ entity: Team }),
      bind: DeclareIncidentDraft.fields.assignedTeamId,
      visibleWhen: ({ values }) => expr.eq(values.severity, "sev1"),
    },
  },
  errors: {
    "incident.title.required": "title",
    "incident.sev1.requires_team": "assignedTeamId",
    forbidden: "$form",
  },
  slots: {
    root: ui.slot([ui.traits.container]),
    field: ui.slot([ui.traits.field]),
    submit: ui.slot([ui.traits.interactive]),
    error: ui.slot([ui.traits.text]),
  },
  target: { jsonRender: true, react: true },
});

export const IncidentList = app.ui.list("IncidentList", {
  resource: OpenIncidentsResource,
  projection: IncidentCard,
  columns: {
    title: ui.list.column(IncidentCard.fields.title, {
      label: "Title",
      searchable: true,
      sortable: true,
      size: "minmax(20rem, 1fr)",
    }),
    severity: ui.list.column(IncidentCard.fields.severity, {
      label: "Severity",
      sortable: true,
      filterable: true,
      filter: "select",
      cell: ui.cell.badge({ variantBy: IncidentCard.fields.severity }),
    }),
    status: ui.list.column(IncidentCard.fields.status, {
      label: "Status",
      sortable: true,
      filterable: true,
      filter: "select",
    }),
    updatedAt: ui.list.column(IncidentCard.fields.updatedAt, { label: "Updated", sortable: true }),
  },
  pagination: ui.list.cursor({ cursor: IncidentCard.fields.id, defaultLimit: 50, maxLimit: 500 }),
  defaultSort: { field: IncidentCard.fields.updatedAt, direction: "desc" },
  rowActions: {
    acknowledge: ui.list.rowAction({
      label: "Acknowledge",
      action: acknowledgeIncident,
      input: ({ row }) => ({ incidentId: row.id }),
      enabledWhen: ({ row, session }) => canAcknowledgeIncident.call({ session, incident: row }),
      inline: true,
    }),
    resolve: ui.list.rowAction({
      label: "Resolve",
      action: resolveIncident,
      input: ({ row }) => ({ incidentId: row.id, resolutionSummary: "Resolved from list" }),
      enabledWhen: ({ row, session }) => canResolveIncident.call({ session, incident: row }),
      inline: true,
    }),
  },
  table: {
    rowSelection: "multi",
    columnFilters: true,
    globalFilter: true,
    sorting: true,
    columnResize: true,
    columnVisibility: true,
    virtualization: true,
    stickyHeader: true,
    density: "normal",
    carded: true,
  },
  states: {
    empty: "No open incidents.",
    loading: "Loading incidents…",
    error: "Could not load incidents.",
  },
});

export const IncidentConflictResolutionView = app.ui.view("IncidentConflictResolutionView", {
  purpose: "Resolve concurrent incident status update conflicts.",
  placement: ClientBoundary,
  data: { current: IncidentDetailResource },
  actions: { retryAcknowledge: acknowledgeIncident, refresh: getIncidentDetail },
});

export const IncidentDashboard = app.ui.page("IncidentDashboard", {
  route: "/org/:organizationId/incidents",
  placement: ClientBoundary,
  requires: [AuthSession],
  data: { openIncidents: OpenIncidentsResource },
  slots: {
    root: ui.slot([ui.traits.container]),
    toolbar: ui.slot([ui.traits.container]),
    createForm: ui.slot([ui.traits.form]),
    list: ui.slot([ui.traits.collection]),
  },
  structure: ({ slots }) =>
    ui.tree(
      ui.element("Stack", { slot: slots.root }, [
        ui.element("Toolbar", { slot: slots.toolbar }, [
          ui.text("Open incidents"),
          ui.button("New incident", { behavior: ui.behavior.openPanel(DeclareIncidentForm) }),
        ]),
        ui.render(DeclareIncidentForm, { slot: slots.createForm }),
        ui.render(IncidentList, { slot: slots.list }),
      ]),
    ),
  jsonRender: {
    aiEditable: true,
    verifyOnImport: [
      ui.verify.knownCatalogComponents,
      ui.verify.slotCapabilityCompatibility,
      ui.verify.actionInputCompatibility,
      ui.verify.stateBindingCompatibility,
      ui.verify.noServerOnlyData,
    ],
  },
});

// =============================================================================
// 10. Dispatch, boundaries, observability, evolution, obligations
// =============================================================================

export const NotificationMessage = t.object("NotificationMessage", {
  messageId: t.uuid,
  organizationId: Organization.fields.id.type,
  incidentId: Incident.fields.id.type,
  channel: NotificationChannel,
  recipientUserId: User.fields.id.type,
  subject: t.string,
  body: t.string,
});

export const NotificationPipeline = app.recipes.notificationPipeline("IncidentNotifications", {
  trigger: IncidentDeclared,
  channels: ["email", "slack"],
  effects: {
    email: app.effect("email.send", { requires: [EmailApiKey], placement: WorkerBoundary }),
    slack: app.effect("slack.send", { requires: [SlackWebhookUrl], placement: WorkerBoundary }),
  },
  queue: {
    name: "NotificationQueue",
    message: NotificationMessage,
    placement: WorkerBoundary,
    storage: DurableQueueStorage,
    delivery: delivery.atLeastOnce(),
    retry: retry.exponential({ maxAttempts: 8, initialDelayMs: 1_000, maxDelayMs: 60_000 }),
    idempotency: idempotency.messageId(({ message }) => message.messageId),
    deadLetter: true,
  },
  selectRecipients: ({ event }) =>
    query.inline("selectIncidentNotificationRecipients", {
      from: NotificationPreference,
      where: (pref) =>
        expr.and(
          expr.eq(pref.organizationId, event.payload.organizationId),
          expr.eq(pref.enabled, true),
        ),
    }),
  message: ({ event, recipient }) => ({
    messageId: event.payload.eventId,
    organizationId: event.payload.organizationId,
    incidentId: event.payload.incidentId,
    channel: recipient.channel,
    recipientUserId: recipient.userId,
    subject: `New ${event.payload.severity.toUpperCase()} incident: ${event.payload.title}`,
    body: `Incident ${event.payload.incidentId} was declared.`,
  }),
  deliveryPlan: delivery.outbox({
    guarantee: "at_least_once",
    storage: storage.postgresTable("incident_outbox"),
  }),
  idempotency: idempotency.eventId(({ event }) => event.payload.eventId),
});

export const NotificationQueue = NotificationPipeline.queue;
export const notifyOnIncidentDeclared = NotificationPipeline.dispatch;
export const NotificationWorkerAction = NotificationPipeline.workerAction;

export const DeclareIncidentBoundaryCall = boundary.call("DeclareIncidentBoundaryCall", {
  callable: declareIncident,
  from: ClientBoundary,
  to: ServerBoundary,
  transport: boundary.transport.serverAction(),
  auth: AuthSession,
  serialization: {
    input: serialization.strictJson(declareIncident.input),
    output: serialization.strictJson(declareIncident.output),
    error: serialization.taggedUnion(declareIncident.errors),
  },
  invalidates: [OpenIncidentsKey.any()],
});

export const AcknowledgeIncidentBoundaryCall = boundary.call("AcknowledgeIncidentBoundaryCall", {
  callable: acknowledgeIncident,
  from: ClientBoundary,
  to: ServerBoundary,
  transport: boundary.transport.serverAction(),
  auth: AuthSession,
  serialization: {
    input: serialization.strictJson(acknowledgeIncident.input),
    output: serialization.strictJson(acknowledgeIncident.output),
    error: serialization.taggedUnion(acknowledgeIncident.errors),
  },
  invalidates: AcknowledgeIncidentMutation.invalidates,
  optimistic: AcknowledgeIncidentMutation.optimistic,
  offline: IncidentSyncPlan.offline.commands.acknowledgeIncident,
});

export const NotificationDeliveryBoundary = boundary.route("NotificationDeliveryBoundary", {
  path: [ServerBoundary, QueueBoundary, WorkerBoundary, boundary.external("Slack")],
  transports: [
    boundary.transport.outbox({ idempotency: idempotency.eventId() }),
    boundary.transport.queue({
      serialization: serialization.strictJson(NotificationMessage),
      retry: retry.exponential({ maxAttempts: 8 }),
    }),
    boundary.transport.http({ auth: SlackWebhookUrl }),
  ],
});

export const IncidentDeclaredMetric = observability.metric("incident_declared_total", {
  type: "counter",
  source: IncidentDeclared,
  labels: { severity: Severity, organizationId: Organization.fields.id.type },
});

export const NotificationQueueHealth = observability.healthCheck("NotificationQueueHealth", {
  target: NotificationQueue,
  checks: [
    observability.queueDepth({ warnAt: 1_000, criticalAt: 10_000 }),
    observability.oldestMessageAge({ warnAt: "5m", criticalAt: "30m" }),
    observability.deadLetterRate({ warnAt: "1%", criticalAt: "5%" }),
  ],
});

export const MigrationPreview = evolution.preview("OpsDeskMigrationPreview", {
  from: PreviousSnapshot,
  to: OpsDeskSchema,
  hints: RenameHints,
  policies: {
    allowDestructive: false,
    requireBackfillForTypeChange: true,
    requireManualApprovalForDrop: true,
  },
});

export const MigrationPlan = evolution.migrationPlan("OpsDesk_2_3_to_2_4", {
  schema: OpsDeskSchema,
  from: PreviousSnapshot,
  to: "current",
  hints: RenameHints,
  hooks: [
    evolution.hook.beforeStep("validate_incident_rows", {
      stepKind: "change_field_type",
      run: query.sql("SELECT COUNT(*) FROM incidents"),
    }),
    evolution.hook.afterPlan("verify_no_null_titles", {
      run: query.sql("SELECT COUNT(*) FROM incidents WHERE title IS NULL"),
      expect: 0,
    }),
  ],
});

export const CompatibilityReport = evolution.compatibility("OpsDeskCompatibility", {
  from: PreviousSnapshot,
  to: "current",
  surfaces: [
    targets.postgres.surface,
    targets.openapi.surface,
    targets.typescript.surface,
    targets.jsonRender.surface,
    dispatch.surfaces.eventPayloads,
    dataflow.surfaces.queueMessages,
  ],
});

export const PolicyTestObligations = obligation.derive("PolicyTestObligations", {
  from: [IncidentPolicy],
  produce: [
    obligation.kind.policyTest({ priority: "required" }),
    obligation.kind.accessMatrixDoc({ priority: "recommended" }),
  ],
});

export const ReactivityTestObligations = obligation.derive("ReactivityTestObligations", {
  from: [IncidentSyncPlan],
  produce: [
    obligation.kind.mutationInvalidationTest({ priority: "required" }),
    obligation.kind.optimisticRollbackTest({ priority: "required" }),
    obligation.kind.offlineReplayTest({ priority: "required", only: [acknowledgeIncident] }),
  ],
});

export const UiTestObligations = obligation.derive("UiTestObligations", {
  from: [DeclareIncidentForm, IncidentList, IncidentDashboard],
  produce: [
    obligation.kind.formValidationTest({ priority: "recommended" }),
    obligation.kind.listInteractionTest({ priority: "recommended" }),
    obligation.kind.clientBoundarySafetyTest({ priority: "required" }),
  ],
});

export const VersioningObligations = obligation.derive("VersioningObligations", {
  from: [MigrationPlan, CompatibilityReport],
  produce: [
    obligation.kind.migrationTest({ priority: "required" }),
    obligation.kind.compatibilityDoc({ priority: "recommended" }),
    obligation.kind.rollbackRunbook({ priority: "required" }),
  ],
});

// =============================================================================
// 11. Storage, deployment, modules, package, graph composition
// =============================================================================

export const OpsDeskStorage = app.recipes.postgresStorage("OpsDeskStorage", {
  databaseName: "opsdesk",
  entities: [
    Organization,
    User,
    Team,
    Project,
    Incident,
    IncidentUpdate,
    AuditLog,
    NotificationPreference,
  ],
  naming: storage.naming.snakeCase(),
  policies: [IncidentPolicy],
  outbox: {
    events: [IncidentDeclared, IncidentAcknowledged, IncidentResolved],
    table: "outbox_events",
  },
});

export const OpsDeskDeployment = app.recipes.alchemyStack("OpsDeskCloudflare", {
  resources: [
    OpsDeskStorage.database,
    NotificationPipeline.worker,
    deploy.secret("SlackWebhookUrl", { satisfies: SlackWebhookUrl }),
    deploy.secret("EmailApiKey", { satisfies: EmailApiKey }),
    deploy.bucket("IncidentAttachments"),
  ],
  boundaries: [ClientBoundary, ServerBoundary, WorkerBoundary, QueueBoundary, DatabaseBoundary],
  capabilities: [
    deploy.capabilities.sql,
    deploy.capabilities.transactions,
    deploy.capabilities.queue,
    deploy.capabilities.email,
    deploy.capabilities.network,
    deploy.capabilities.secretStore,
    deploy.capabilities.metrics,
    deploy.capabilities.tracing,
  ],
});

export const AuthzModule = app
  .module("authz", {
    imports: { AuthSession: ProviderModule.exports.AuthSession },
    exports: {
      canViewIncident,
      canManageIncident,
      canAcknowledgeIncident,
      canResolveIncident,
      IncidentPolicy,
    },
  })
  .pipe(
    canViewIncident,
    canManageIncident,
    canAcknowledgeIncident,
    canResolveIncident,
    IncidentPolicy,
  );

export const IncidentFeatureModule = app
  .module("incident-feature", {
    imports: {
      providers: ProviderModule.exports,
      domain: CoreDomainModule.exports,
      authz: AuthzModule.exports,
    },
    exports: {
      entity: Incident,
      actions: {
        declare: declareIncident,
        acknowledge: acknowledgeIncident,
        resolve: resolveIncident,
      },
      resources: {
        open: OpenIncidentsResource,
        detail: IncidentDetailResource,
        timeline: IncidentTimelineResource,
      },
      ui: { dashboard: IncidentDashboard, list: IncidentList, form: DeclareIncidentForm },
    },
    config: {
      allowOfflineAcknowledge: t.boolean.default(true),
      notificationChannels: t.array(NotificationChannel).default(["email", "slack"]),
    },
  })
  .pipe(
    IncidentDomainModule,
    AuthzModule,
    SetField,
    AppendIncidentUpdate,
    IncidentLifecycle,
    declareIncident,
    IncidentQueries,
    IncidentTimeline,
    DeclareIncidentDraft,
    IncidentSyncPlan,
    DeclareIncidentForm,
    IncidentList,
    IncidentDashboard,
    NotificationPipeline,
    DeclareIncidentBoundaryCall,
    AcknowledgeIncidentBoundaryCall,
    NotificationDeliveryBoundary,
    IncidentDeclaredMetric,
    NotificationQueueHealth,
    PolicyTestObligations,
    ReactivityTestObligations,
    UiTestObligations,
    VersioningObligations,
  );

export const DeploymentModule = app
  .module("deployment", {
    imports: { incident: IncidentFeatureModule.exports },
    exports: { storage: OpsDeskStorage, stack: OpsDeskDeployment },
  })
  .pipe(OpsDeskStorage, OpsDeskDeployment);

export const OpsDeskPackage = app.package("opsdesk", {
  version: "2.4.0",
  exports: { ProviderModule, CoreDomainModule, IncidentFeatureModule, DeploymentModule },
  compatibility: { graph: "^1.0", postgres: ">=16", react: ">=19" },
  breakingChanges: app.package.detectBreakingChanges(),
});

export const appGraph = gen.graph.pipe(
  OpsDeskSchema,
  SnapshotPolicy,
  PreviousSnapshot,
  RenameHints,
  ProviderModule,
  CoreDomainModule,
  IncidentFeatureModule,
  DeploymentModule,
  MigrationPreview,
  MigrationPlan,
  CompatibilityReport,
  OpsDeskPackage,
);

// =============================================================================
// 12. TypeScript witness layer, preview, explain, import, capabilities
// =============================================================================

export type OpsDeskGraph = GraphWitnessOf<typeof appGraph>;
export type IncidentValue = InferEntity<typeof Incident>;
export type IncidentCardValue = InferDecoded<typeof IncidentCard.type>;
export type DeclareIncidentInput = InferInput<typeof declareIncident>;
export type DeclareIncidentOutput = InferOutput<typeof declareIncident>;
export type DeclareIncidentError = InferError<typeof declareIncident>;
export type AcknowledgeIncidentInput = InferInput<typeof acknowledgeIncident>;
export type IncidentDeclaredPayload = InferDecoded<typeof IncidentDeclared.payload>;
export type OpenIncidentsState = typeof OpenIncidentsResource.$infer.state;
export type DeclareIncidentFormValues = typeof DeclareIncidentForm.$infer.values;
export type IncidentListRow = typeof IncidentList.$infer.row;

export const LifecycleExpansion = IncidentLifecycle.expand({ format: "explain" });
export const DashboardPreview = appGraph.preview(IncidentDashboard);
export const AcknowledgePreview = appGraph.preview(acknowledgeIncident);

export const explainOpenIncidentsInvalidation = appGraph.explain(
  gen.reactivity.edges.invalidatesKey,
  {
    action: acknowledgeIncident,
    key: OpenIncidentsKey.any(),
  },
);

export const explainAuthProvider = appGraph.explain(provider.edges.satisfies, {
  provider: AuthSessionProvider,
  requirement: AuthSession,
});

export const importedDashboardCandidate = gen.import.jsonRenderSpec({
  catalog: "generated/ui/catalog.json",
  spec: "ai-output/incident-dashboard-candidate.json",
  into: appGraph,
  namespace: "ai.dashboard.candidate",
  mode: "candidate",
  verify: [
    ui.verify.knownCatalogComponents,
    ui.verify.slotCapabilityCompatibility,
    ui.verify.actionInputCompatibility,
    ui.verify.stateBindingCompatibility,
    ui.verify.noServerOnlyData,
  ],
});

export const reviewedGraph = importedDashboardCandidate.ok
  ? appGraph.pipe(importedDashboardCandidate.acceptedFacts)
  : appGraph;

export const semanticDiff = gen.graph.diff(PreviousSnapshot, reviewedGraph);

export const targetPlan = reviewedGraph.targets.negotiate({
  desired: {
    optimistic: "exact",
    offline: true,
    streaming: true,
    rls: true,
    jsonRender: true,
    migrations: true,
    observability: true,
  },
  targets: [targets.postgres, targets.effect, targets.react, targets.jsonRender, targets.alchemy],
});

export const capabilityReport = reviewedGraph.capabilities.report({
  targets: [
    targets.postgres,
    targets.effect,
    targets.react,
    targets.jsonRender,
    targets.openapi,
    targets.alchemy,
    targets.tests,
    targets.docs,
  ],
  focus: [
    IncidentDashboard,
    IncidentList,
    DeclareIncidentForm,
    IncidentSyncPlan,
    notifyOnIncidentDeclared,
    NotificationPipeline.worker,
    MigrationPlan,
    OpsDeskDeployment,
  ],
});

// =============================================================================
// 13. Check, repair, legalize, emit
// =============================================================================

export const checkResult = reviewedGraph.run(
  app
    .pipeline("opsdesk.check")
    .verifySymbols()
    .verifyDialects()
    .verifyGraph()
    .deriveProviderSatisfaction()
    .deriveQueryReads()
    .deriveActionWrites()
    .deriveRuleReads()
    .deriveRuleInvalidation()
    .deriveIvmPlans()
    .deriveOptimisticPlans()
    .deriveBoundaryPlans()
    .deriveRequirementBubbling()
    .deriveDeploymentRequirements()
    .deriveObligations()
    .deriveMigrationPlan()
    .deriveCompatibilityReport()
    .deriveObservabilityPlan()
    .canonicalize()
    .legalizePlacement()
    .legalizeProviders()
    .legalizePrivacy()
    .legalizeQueries()
    .legalizeBoundaryTransports()
    .legalizeReactivity()
    .legalizeMerge()
    .legalizeUi()
    .legalizeObligations()
    .legalizeEvolution()
    .legalizeObservability()
    .legalizeTargets({ report: capabilityReport })
    .diagnostics({
      audience: "developer",
      failOn: "error",
      includeRemediation: true,
      includeCandidateFixes: true,
    }),
);

export const repairedGraph = checkResult.applyFixes({
  mode: "candidate",
  codes: [
    "dispatch.at_least_once.requires_idempotency",
    "ui.client.server_only_field",
    "offline.write.requires_merge_policy",
  ],
});

export const legalized = repairedGraph.graph.legalize({
  targets: [
    targets.postgres,
    targets.effect,
    targets.react,
    targets.jsonRender,
    targets.openapi,
    targets.alchemy,
    targets.tests,
    targets.docs,
    targets.graph,
    targets.textualIr,
    targets.typescript,
  ],
});

export const buildResult = legalized.emit([
  targets.postgres.artifacts.sqlMigration({
    source: MigrationPlan,
    path: "generated/db/migrations/002_004_000.sql",
  }),
  targets.postgres.artifacts.rlsPolicies({
    source: IncidentPolicy,
    path: "generated/db/policies/incident.rls.sql",
  }),
  targets.postgres.artifacts.schemaSnapshot({
    source: OpsDeskSchema,
    path: ".gen2/snapshots/2.4.0.json.gz",
  }),

  targets.effect.artifacts.serverRuntime({ path: "generated/server/runtime.ts" }),
  targets.effect.artifacts.actionHandlers({
    actions: [declareIncident, acknowledgeIncident, resolveIncident],
    path: "generated/server/actions.ts",
  }),
  targets.effect.artifacts.providerLayer({
    providers: [AuthSessionProvider, ClockProvider, EmailProvider, SlackProvider],
    path: "generated/server/providers.ts",
  }),

  targets.react.artifacts.component({
    source: IncidentDashboard,
    path: "generated/web/components/IncidentDashboard.tsx",
  }),
  targets.react.artifacts.forms({ forms: [DeclareIncidentForm], path: "generated/web/forms.tsx" }),
  targets.react.artifacts.lists({ lists: [IncidentList], path: "generated/web/lists.tsx" }),
  targets.react.artifacts.resourceHooks({
    resources: [OpenIncidentsResource, IncidentDetailResource, IncidentTimelineResource],
    path: "generated/web/resources.ts",
  }),
  targets.react.artifacts.mutationHooks({
    mutations: [DeclareIncidentMutation, AcknowledgeIncidentMutation, ResolveIncidentMutation],
    path: "generated/web/mutations.ts",
  }),

  targets.jsonRender.artifacts.catalog({
    source: IncidentDashboard,
    path: "generated/ui/catalog.json",
  }),
  targets.jsonRender.artifacts.spec({
    source: IncidentDashboard,
    path: "generated/ui/incident-dashboard.json",
  }),
  targets.openapi.artifacts.document({ path: "generated/openapi.json" }),
  targets.alchemy.artifacts.stack({
    source: OpsDeskDeployment,
    path: "generated/deploy/opsdesk.ts",
  }),
  targets.alchemy.artifacts.observability({
    source: [IncidentDeclaredMetric, NotificationQueueHealth],
    path: "generated/deploy/observability.ts",
  }),

  targets.tests.artifacts.policyTests({
    obligations: PolicyTestObligations,
    path: "generated/tests/policy/incident-policy.generated.test.ts",
  }),
  targets.tests.artifacts.reactivityTests({
    obligations: ReactivityTestObligations,
    path: "generated/tests/reactivity/incident-reactivity.generated.test.ts",
  }),
  targets.tests.artifacts.uiInteractionTests({
    obligations: UiTestObligations,
    path: "generated/tests/ui/incident-dashboard.generated.test.ts",
  }),
  targets.tests.artifacts.migrationTests({
    obligations: VersioningObligations,
    path: "generated/tests/migration/opsdesk-migration.generated.test.ts",
  }),
  targets.tests.artifacts.propertyTests({
    path: "generated/tests/opsdesk.property.generated.test.ts",
    include: [
      "state_machine_transitions",
      "policy_matrix",
      "operation_laws",
      "merge_laws",
      "optimistic_rollback",
      "offline_replay",
      "provider_satisfaction",
      "boundary_transport_safety",
      "migration_reversibility",
      "privacy_redaction",
      "invariant_preservation",
    ],
  }),

  targets.docs.artifacts.markdown({ path: "generated/docs/opsdesk.md" }),
  targets.docs.artifacts.accessMatrix({
    source: IncidentPolicy,
    path: "generated/docs/access-matrix/incident-policy.md",
  }),
  targets.docs.artifacts.compatibilityReport({
    source: CompatibilityReport,
    path: "generated/docs/compatibility/2.4.0.md",
  }),
  targets.docs.artifacts.rollbackRunbook({
    source: MigrationPlan,
    path: "generated/docs/runbooks/rollback-2.4.0.md",
  }),

  targets.graph.artifacts.snapshot({ path: "generated/graphs/opsdesk.graph.json" }),
  targets.graph.artifacts.diffReport({
    source: semanticDiff,
    path: "generated/graphs/opsdesk.diff.md",
  }),
  targets.graph.artifacts.explainReport({
    explains: [explainOpenIncidentsInvalidation, explainAuthProvider],
    path: "generated/graphs/explain.md",
  }),
  targets.graph.artifacts.capabilityReport({
    source: capabilityReport,
    path: "generated/graphs/capabilities.md",
  }),

  targets.textualIr.artifacts.module({
    source: IncidentFeatureModule,
    path: "generated/ir/incident-feature.gen2",
  }),
  targets.textualIr.artifacts.graph({ source: reviewedGraph, path: "generated/ir/opsdesk.gen2" }),
  targets.typescript.artifacts.graphWitness({ path: "generated/opsdesk.graph.d.ts" }),
]);

// =============================================================================
// 14. What the compiler sees
// =============================================================================

/**
 * Even though this file uses high-level kits and recipes, the final IR is still
 * a simple graph:
 *
 *   Node(Entity): Incident
 *   Node(Field): Incident.status
 *   Node(Type): IncidentStatus
 *   Node(StateMachine): IncidentStatus
 *   Node(MergeStrategy): Incident.status.stateMachineMerge
 *   Node(Requirement): AuthSession
 *   Node(Provider): AuthSessionProvider
 *   Node(StorageLocation): SessionCookieStorage
 *   Node(Action): acknowledgeIncident
 *   Node(Event): IncidentAcknowledged
 *   Node(Query): listOpenIncidents
 *   Node(KeyFamily): OpenIncidentsKey
 *   Node(Resource): OpenIncidentsResource
 *   Node(Mutation): AcknowledgeIncidentMutation
 *   Node(StateResource): DeclareIncidentDraft
 *   Node(Form): DeclareIncidentForm
 *   Node(ListView): IncidentList
 *   Node(Component): IncidentDashboard
 *   Node(Dispatch): notifyOnIncidentDeclared
 *   Node(Queue): NotificationQueue
 *   Node(BoundaryCallPlan): AcknowledgeIncidentBoundaryCall
 *   Node(Metric): incident_declared_total
 *   Node(SchemaManifest): opsdesk@2.4.0
 *   Node(MigrationPlan): OpsDesk_2_3_to_2_4
 *   Node(Obligation): policy-test-IncidentPolicy
 *   Node(DeploymentStack): OpsDeskCloudflare
 *
 *   Edge(EntityOwnsField): Incident -> Incident.status
 *   Edge(FieldHasType): Incident.status -> IncidentStatus
 *   Edge(FieldUsesMergeStrategy): Incident.status -> stateMachineMerge
 *   Edge(ProviderSatisfies): AuthSessionProvider -> AuthSession
 *   Edge(ProviderSourcedFrom): AuthSessionProvider -> SessionCookieStorage
 *   Edge(ProviderPlacedIn): AuthSessionProvider -> ServerBoundary
 *   Edge(ActionWrites): acknowledgeIncident -> Incident.status
 *   Edge(ActionEmits): acknowledgeIncident -> IncidentAcknowledged
 *   Edge(QueryReads): listOpenIncidents -> Incident.status
 *   Edge(QueryHasKey): listOpenIncidents -> OpenIncidentsKey
 *   Edge(ResourceWrapsQuery): OpenIncidentsResource -> listOpenIncidents
 *   Edge(MutationWrapsAction): AcknowledgeIncidentMutation -> acknowledgeIncident
 *   Edge(MutationInvalidatesKey): AcknowledgeIncidentMutation -> OpenIncidentsKey
 *   Edge(FormSubmitsAction): DeclareIncidentForm -> declareIncident
 *   Edge(ListUsesResource): IncidentList -> OpenIncidentsResource
 *   Edge(RowActionRunsAction): acknowledgeRowAction -> acknowledgeIncident
 *   Edge(ComponentRendersList): IncidentDashboard -> IncidentList
 *   Edge(DispatchTriggeredBy): notifyOnIncidentDeclared -> IncidentDeclared
 *   Edge(DispatchUsesIdempotency): notifyOnIncidentDeclared -> eventId
 *   Edge(BoundaryCallUsesTransport): AcknowledgeIncidentBoundaryCall -> serverAction
 *   Edge(ObligationSource): policy-test-IncidentPolicy -> IncidentPolicy
 *   Edge(ObligationSatisfiedBy): policy-test-IncidentPolicy -> generated policy test artifact
 *   Edge(MigrationHasStep): OpsDesk_2_3_to_2_4 -> rename_field
 *
 * Public authoring is expressive.
 * Compiler IR stays boring.
 */
