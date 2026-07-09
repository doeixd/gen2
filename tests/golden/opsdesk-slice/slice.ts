/**
 * Vertical slice fixture — `acknowledgeIncident` (PLAN.md §3.5, Quick Win #8).
 *
 * Rule-first opsdesk slice. Co-stars `canManageIncident` and
 * `canViewIncident`; the slice's job is to prove the eleven rule
 * derivations land cleanly (PLAN.md §0.2) and to lock the chain
 * `Rule → Action → Query → Policy` end-to-end.
 *
 * For Quick Win #8, the fixture builds the graph using *today's* APIs.
 * Track R/F/G/M will progressively add the eleven rule derivations,
 * the eight surrounding artifacts, and the textual IR. Each addition
 * is a deliberate snapshot re-lock in `slice.test.ts`.
 *
 * The slice is the green-gate for every later track: any change that
 * breaks the snapshot rolls back unless the diff is intentional.
 */

import { core, createGen } from "../../../src/index.ts";
import { buildActionUpdate } from "../../../src/function/function.ts";
import { fromEntity } from "../../../src/query/query.ts";
import type { Expr } from "../../../src/expression/index.ts";

export const buildOpsdeskSlice = () => {
  const { ctx, gen } = createGen({
    identity: { stableIds: "warn" },
  });

  const t = gen.types;

  // --- Domain -----------------------------------------------------------
  const Organization = gen.entity(
    "Organization",
    {
      id: { type: t.uuid(), id: core.fieldId({ entity: "Organization", name: "id" }) },
      name: { type: t.string(), id: core.fieldId({ entity: "Organization", name: "name" }) },
    },
    { id: core.entityId({ name: "Organization" }) },
  );

  const Incident = gen.entity(
    "Incident",
    {
      id: { type: t.uuid(), id: core.fieldId({ entity: "Incident", name: "id" }) },
      organizationId: {
        type: t.uuid(),
        id: core.fieldId({ entity: "Incident", name: "organization-id" }),
      },
      title: { type: t.string(), id: core.fieldId({ entity: "Incident", name: "title" }) },
      // Status is modeled as enum-of-strings for now; the formal state
      // machine arrives with Track H (variant dialect).
      status: { type: t.string(), id: core.fieldId({ entity: "Incident", name: "status" }) },
      role: { type: t.string(), id: core.fieldId({ entity: "Incident", name: "role" }) },
    },
    { id: core.entityId({ name: "Incident" }), store_name: "incidents" },
  );

  // --- Rules — the keystone (PLAN.md §0.2) ------------------------------
  // canViewIncident: incident is not closed (reads Incident.status). The
  // simple equality form lets Track R §R6 fire `derive.rule.invalidationDependencies`
  // when an action writes `Incident.status`. Full predicate
  // (`status != "resolved" AND status != "cancelled"`) lands once Track R
  // §R5 ships the standard operation library.
  const canViewIncident = gen.rule.define((r) =>
    r
      .name("canViewIncident")
      .vars({ session_org: t.uuid(), incident: Incident })
      .when(() =>
        gen.rule.eq(
          gen.rule.field(Incident, Incident.fields.status!),
          gen.rule.literal("open", t.string()),
        ),
      ),
  );

  // canManageIncident: requires status == open. The full role-set
  // predicate is a Track R §R5 operation-library expansion.
  const canManageIncident = gen.rule.define((r) =>
    r
      .name("canManageIncident")
      .vars({ session_org: t.uuid(), session_role: t.string(), incident: Incident })
      .when(() =>
        gen.rule.eq(
          gen.rule.field(Incident, Incident.fields.status!),
          gen.rule.literal("open", t.string()),
        ),
      ),
  );

  // --- Policy ----------------------------------------------------------
  // Currently only `predicate` is wired; the surfaces/actions on the
  // policy expand with Track R §R2 (policy → server guard, RLS, etc.).
  const incidentPolicy = gen.authz.policy({
    name: "IncidentPolicy",
    target_entity: Incident,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
    predicate: canViewIncident,
  });

  // --- Reactivity key + query + action ---------------------------------
  // The minimum needed to fire the Track R §R6 derivation
  // (`derive.rule.invalidationDependencies`). See PLAN.md §R6.
  const incidentKey = gen.key.entity(Incident);

  const listOpenIncidents = gen.func.query({
    name: "listOpenIncidents",
    input_type: t.string(),
    returns: t.string(),
    body: fromEntity(Incident).build(),
    reactivity: { key: incidentKey },
    auth: { action: "read", policy_name: incidentPolicy.name },
  });

  const acknowledgeIncident = gen.func.action({
    name: "acknowledgeIncident",
    input_type: Incident,
    returns: Incident,
    body: buildActionUpdate(Incident, [
      [
        Incident.fields.status,
        {
          kind: "literal",
          value: "acknowledged",
          semanticType: t.string(),
        } as unknown as Expr,
      ],
    ]),
  });

  return {
    ctx,
    gen,
    entities: { Organization, Incident },
    rules: { canViewIncident, canManageIncident },
    policies: { incidentPolicy },
    reactivity: { incidentKey },
    queries: { listOpenIncidents },
    actions: { acknowledgeIncident },
  };
};
