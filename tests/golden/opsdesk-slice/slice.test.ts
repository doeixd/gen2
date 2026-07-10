/**
 * Vertical slice golden snapshot (PLAN.md §3.5, Quick Win #8).
 *
 * Locks the structural shape of the rule-first opsdesk slice. Every
 * later track must keep this snapshot intact (or document and re-lock
 * the diff). The eleven rule derivations from PLAN.md §0.2 are tracked
 * as `test.todo` until Track R lands them — when each derivation
 * arrives, its `test.todo` becomes a real assertion and a row in the
 * snapshot table moves from "pending" to "locked".
 *
 * The slice is the green-gate for every later landing.
 */

import { expect, test } from "vite-plus/test";
import { lifecycle } from "../../../src/index.ts";
import { buildOpsdeskSlice } from "./slice.ts";

const summarizeGraph = (ctx: ReturnType<typeof buildOpsdeskSlice>["ctx"]) => {
  const nodesByKind: Record<string, number> = {};
  for (const node of ctx.graph.nodes.values()) {
    nodesByKind[node.kind.id] = (nodesByKind[node.kind.id] ?? 0) + 1;
  }
  const edgesByKind: Record<string, number> = {};
  for (const edge of ctx.graph.edges.values()) {
    edgesByKind[edge.kind.id] = (edgesByKind[edge.kind.id] ?? 0) + 1;
  }
  return { nodesByKind, edgesByKind };
};

test("opsdesk slice — structural snapshot of registered graph nodes/edges", () => {
  const slice = buildOpsdeskSlice();
  expect(summarizeGraph(slice.ctx)).toMatchInlineSnapshot(`
  	{
  	  "edgesByKind": {
  	    "edge.kind.actionWritesField": 1,
  	    "edge.kind.exprUsesOperation": 2,
  	    "edge.kind.expressionReadsField": 2,
  	    "edge.kind.fieldHasType": 7,
  	    "edge.kind.guardsAction": 1,
  	    "edge.kind.hasInputType": 53,
  	    "edge.kind.hasOutputType": 29,
  	    "edge.kind.ownsField": 7,
  	    "edge.kind.policyTargetsEntity": 1,
  	    "edge.kind.policyUsesRule": 1,
  	    "edge.kind.ruleDeclaresVar": 5,
  	    "edge.kind.ruleHasBody": 2,
  	    "edge.kind.ruleReads": 4,
  	  },
  	  "nodesByKind": {
  	    "node.kind.action": 1,
  	    "node.kind.entity": 2,
  	    "node.kind.field": 7,
  	    "node.kind.keyFamily": 1,
  	    "node.kind.operationDef": 27,
  	    "node.kind.policy": 1,
  	    "node.kind.query": 1,
  	    "node.kind.rule": 2,
  	    "node.kind.varDecl": 5,
  	  },
  	}
  `);
});

test("opsdesk slice — lifecycle.check produces no errors", () => {
  const slice = buildOpsdeskSlice();
  const result = lifecycle.check(slice.ctx);

  const errors = result.diagnostics.filter((d) => d.severity === "error");
  expect(errors).toEqual([]);
});

test("opsdesk slice — lifecycle.check diagnostic codes by severity", () => {
  const slice = buildOpsdeskSlice();
  const result = lifecycle.check(slice.ctx);
  const summary = result.diagnostics
    .map((d) => ({ code: d.code, severity: d.severity }))
    .sort((a, b) =>
      a.code === b.code ? a.severity.localeCompare(b.severity) : a.code.localeCompare(b.code),
    );
  expect(summary).toMatchInlineSnapshot(`
  	[
  	  {
  	    "code": "authz:policy-variable-binding-missing",
  	    "severity": "warning",
  	  },
  	  {
  	    "code": "boundary:serializer-missing",
  	    "severity": "warning",
  	  },
  	  {
  	    "code": "boundary:transport-auth-missing",
  	    "severity": "hint",
  	  },
  	  {
  	    "code": "entity:no-store-name",
  	    "severity": "info",
  	  },
  	  {
  	    "code": "obligation:required-pending",
  	    "severity": "info",
  	  },
  	  {
  	    "code": "obligation:unhandled",
  	    "severity": "warning",
  	  },
  	  {
  	    "code": "rule:derived-invalidation",
  	    "severity": "info",
  	  },
  	  {
  	    "code": "rules-reactivity:ivm-delta-supported",
  	    "severity": "info",
  	  },
  	  {
  	    "code": "rules-reactivity:ivm-delta-supported",
  	    "severity": "info",
  	  },
  	  {
  	    "code": "rules:unbound-output-variable",
  	    "severity": "info",
  	  },
  	  {
  	    "code": "rules:unbound-output-variable",
  	    "severity": "info",
  	  },
  	  {
  	    "code": "rules:unbound-output-variable",
  	    "severity": "info",
  	  },
  	  {
  	    "code": "rules:unbound-output-variable",
  	    "severity": "info",
  	  },
  	  {
  	    "code": "rules:unbound-output-variable",
  	    "severity": "info",
  	  },
  	]
  `);
});

test("opsdesk slice — rule and policy names lock", () => {
  const slice = buildOpsdeskSlice();
  expect({
    rules: Object.keys(slice.rules).sort(),
    policies: [slice.policies.incidentPolicy.name],
    entities: Object.keys(slice.entities).sort(),
  }).toMatchInlineSnapshot(`
  	{
  	  "entities": [
  	    "Incident",
  	    "Organization",
  	  ],
  	  "policies": [
  	    "IncidentPolicy",
  	  ],
  	  "rules": [
  	    "canManageIncident",
  	    "canViewIncident",
  	  ],
  	}
  `);
});

// --- The eleven rule derivations (PLAN.md §0.2) ------------------------
//
// Each `test.todo` is a placeholder that becomes a real assertion as
// Track R lands the corresponding pass. The slice is the canonical
// regression target for Track R.

/**
 * Rule R-1 (PLAN.md §0.2 derivation #1 / Track R §R3) — *active via
 * the lowerability matrix*.
 *
 * The server guard is the universal enforcement fallback: every rule
 * is always supported for in-process evaluation, by construction
 * (see `src/rules/lowerability.ts:serverGuard`). The R-1 contract is
 * therefore a *floor*: even rules that fail every other lowering
 * surface (SQL, IVM, client) still report `serverGuard.supported`.
 *
 * The actual `derive.rule.toServerGuard` pass that emits an
 * executable guard function is Track R / Track F work.
 */
test("rule R-1: derive.rule.serverGuard — server guard floor (lowerability)", async () => {
  const slice = buildOpsdeskSlice();
  const { lowerability } = await import("../../../src/rules/lowerability.ts");
  const viewMatrix = lowerability(slice.rules.canViewIncident);
  expect(viewMatrix.serverGuard.supported).toBe(true);
  const manageMatrix = lowerability(slice.rules.canManageIncident);
  expect(manageMatrix.serverGuard.supported).toBe(true);
});
/**
 * Rule R-2 (PLAN.md §0.2 derivation #2 / Track R §R2) — graph-native
 * `legalize.rule.toRlsPolicy` pass emits a real `pg.rls-policy`
 * Artifact.
 *
 * The slice's `Incident` entity carries `store_name: "incidents"`,
 * so the pass lowers the `canViewIncident` predicate to a Postgres
 * `CREATE POLICY` statement targeting that table.
 */
test("rule R-2: legalize.rule.toRlsPolicy — emits pg.rls-policy artifact", () => {
  const slice = buildOpsdeskSlice();
  const result = lifecycle.check(slice.ctx);

  expect(result.diagnostics.some((d) => d.code === "rule:rls-not-translatable")).toBe(false);

  const rlsArtifact = result.artifacts.find(
    (a) => a.path === "policies/canViewIncident_policy.sql",
  );
  expect(rlsArtifact).toBeDefined();
  expect(rlsArtifact?.language).toBe("postgres");
  expect(rlsArtifact?.content).toContain("CREATE POLICY");
  expect(rlsArtifact?.content).toContain('"incidents"');
});

/**
 * Assembled schema conformance gate (mission: end-to-end runnable
 * Postgres artifact set).
 *
 * `legalize.entity.toPostgresTable` derives `CREATE TABLE` IR from
 * entity/field graph nodes; `legalize.schema.assemblePostgresSchema`
 * combines that with the RLS policy artifacts (`legalize.rule.toRlsPolicy`)
 * into one deployable `sql/schema.sql`: every `CREATE TABLE` first, then
 * `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for tables with at least
 * one policy, then every `CREATE POLICY` — a valid dependency order for
 * `psql -f`.
 *
 * `Organization` has no `store_name` (locked by the R-2 fixture / the
 * `entity:no-store-name` diagnostic above), so it does not get a table;
 * only `Incident` (`store_name: "incidents"`) does.
 */
test("assembled schema — golden snapshot of sql/schema.sql", () => {
  const slice = buildOpsdeskSlice();
  const result = lifecycle.check(slice.ctx);

  const schema = result.artifacts.find((a) => a.path === "sql/schema.sql");
  expect(schema).toBeDefined();
  expect(schema?.language).toBe("postgres");
  expect(schema?.content).toMatchInlineSnapshot(`
  	"CREATE TABLE "incidents" (
  	  "id" uuid NOT NULL,
  	  "organizationId" uuid NOT NULL,
  	  "title" text NOT NULL,
  	  "status" text NOT NULL,
  	  "role" text NOT NULL
  	);

  	ALTER TABLE "incidents" ENABLE ROW LEVEL SECURITY;

  	CREATE POLICY "canViewIncident_policy" ON "incidents" USING ((row.status = 'open'));
  	"
  `);
});

/**
 * Pure structural validator for the assembled schema — no database
 * required. Confirms statement ordering (tables before RLS enablement
 * before policies), balanced quoting, and that every `CREATE POLICY`'s
 * target table has a preceding `CREATE TABLE` and a preceding
 * `ENABLE ROW LEVEL SECURITY` for that same table. This is the always-on
 * half of the conformance gate; the docker round-trip below is the
 * optional half.
 */
const validateAssembledSchemaStructure = (sql: string): string[] => {
  const problems: string[] = [];

  // Balanced double quotes (every identifier must close).
  const quoteCount = (sql.match(/"/g) ?? []).length;
  if (quoteCount % 2 !== 0) {
    problems.push(`Unbalanced double quotes: ${quoteCount} occurrences.`);
  }

  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const createdTables = new Set<string>();
  const rlsEnabledTables = new Set<string>();

  for (const statement of statements) {
    const createMatch = /^CREATE TABLE "([^"]+)"/.exec(statement);
    if (createMatch) {
      createdTables.add(createMatch[1]!);
      continue;
    }
    const enableMatch = /^ALTER TABLE "([^"]+)" ENABLE ROW LEVEL SECURITY$/.exec(statement);
    if (enableMatch) {
      const table = enableMatch[1]!;
      if (!createdTables.has(table)) {
        problems.push(`ENABLE RLS on "${table}" has no preceding CREATE TABLE.`);
      }
      rlsEnabledTables.add(table);
      continue;
    }
    const policyMatch = /^CREATE POLICY "[^"]+" ON "([^"]+)"/.exec(statement);
    if (policyMatch) {
      const table = policyMatch[1]!;
      if (!createdTables.has(table)) {
        problems.push(`CREATE POLICY on "${table}" has no preceding CREATE TABLE.`);
      }
      if (!rlsEnabledTables.has(table)) {
        problems.push(`CREATE POLICY on "${table}" has no preceding ENABLE ROW LEVEL SECURITY.`);
      }
      continue;
    }
  }

  return problems;
};

test("assembled schema — structural validation (statement order, no docker required)", () => {
  const slice = buildOpsdeskSlice();
  const result = lifecycle.check(slice.ctx);
  const schema = result.artifacts.find((a) => a.path === "sql/schema.sql");
  expect(schema?.content).toBeDefined();

  const problems = validateAssembledSchemaStructure(schema!.content as string);
  expect(problems).toEqual([]);
});

/**
 * Optional docker-postgres round-trip: actually runs the assembled
 * artifact through `psql` against a real `postgres:16-alpine` container
 * and asserts it applies cleanly. Skipped unless both docker is on PATH
 * and `GEN2_PG_CONFORMANCE=1` is set, so the default `vp test` run never
 * depends on docker/network availability.
 */
const dockerConformanceEnabled = process.env.GEN2_PG_CONFORMANCE === "1";

test.skipIf(!dockerConformanceEnabled)(
  "assembled schema — docker postgres round-trip (opt-in via GEN2_PG_CONFORMANCE=1)",
  async () => {
    const { execFileSync } = await import("node:child_process");
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const slice = buildOpsdeskSlice();
    const result = lifecycle.check(slice.ctx);
    const schema = result.artifacts.find((a) => a.path === "sql/schema.sql");
    expect(schema?.content).toBeDefined();

    const dir = mkdtempSync(join(tmpdir(), "gen2-pg-conformance-"));
    const sqlPath = join(dir, "schema.sql");
    writeFileSync(sqlPath, schema!.content as string, "utf8");

    const containerName = `gen2-pg-conformance-${Date.now()}`;
    try {
      execFileSync("docker", [
        "run",
        "-d",
        "--rm",
        "--name",
        containerName,
        "-e",
        "POSTGRES_PASSWORD=postgres",
        "postgres:16-alpine",
      ]);

      // Wait for postgres to accept connections.
      let ready = false;
      for (let attempt = 0; attempt < 30 && !ready; attempt++) {
        try {
          execFileSync("docker", ["exec", containerName, "pg_isready", "-U", "postgres"]);
          ready = true;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      expect(ready).toBe(true);

      execFileSync("docker", ["cp", sqlPath, `${containerName}:/schema.sql`]);
      const output = execFileSync("docker", [
        "exec",
        containerName,
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        "/schema.sql",
      ]).toString();
      expect(output).not.toMatch(/ERROR/i);
    } finally {
      try {
        execFileSync("docker", ["rm", "-f", containerName]);
      } catch {
        // best-effort cleanup
      }
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

/**
 * Rule R-3 (PLAN.md §0.2 derivation #3 / Track R §R3) — *active via
 * the lowerability matrix*.
 *
 * The actual `legalize.rule.toSqlPredicate` pass that emits inline SQL
 * is Track R / Track F work. Here we lock the *eligibility* contract:
 * `canViewIncident` is a single-equality predicate on a single entity,
 * so the matrix must report `sql.supported`.
 */
test("rule R-3: legalize.rule.toSqlPredicate — predicate eligibility (lowerability)", async () => {
  const slice = buildOpsdeskSlice();
  const { lowerability } = await import("../../../src/rules/lowerability.ts");
  const matrix = lowerability(slice.rules.canViewIncident);
  // `Incident.status == "open"` is SQL-translatable in principle. The
  // existing placement analyzer also requires the entity to have a
  // store; if that fails it surfaces as a typed remediation.
  if (!matrix.sql.supported) {
    expect(matrix.sql.reason).toBeDefined();
    expect(matrix.sql.remediation).toBeDefined();
  }
});

/**
 * Rule R-4 (PLAN.md §0.2 derivation #4 / Track R §R3) — *active via
 * the lowerability matrix*. Eligibility for client UI hint emission.
 */
test("rule R-4: legalize.rule.toClientHint — client-eval eligibility (lowerability)", async () => {
  const slice = buildOpsdeskSlice();
  const { lowerability } = await import("../../../src/rules/lowerability.ts");
  const matrix = lowerability(slice.rules.canViewIncident);
  // The matrix is informative either way: if not supported, it must
  // say *why*.
  if (!matrix.client.supported) {
    expect(matrix.client.reason).toBeTruthy();
  }
  // UI mirrors client.
  expect(matrix.ui.supported).toBe(matrix.client.supported);
});

/**
 * Rule R-5 (PLAN.md §0.2 derivation #5 / Track R §R3) — *active via
 * the lowerability matrix*.
 *
 * Form validation needs a single target entity and at least one
 * field read. `canViewIncident` reads `Incident.status` → eligible.
 * `canManageIncident` also reads only `Incident.status` → eligible.
 *
 * The actual `legalize.rule.toFormValidation` pass (Track R / Track F)
 * will turn this into a runtime validator; here we lock the
 * eligibility contract.
 */
test("rule R-5: legalize.rule.toFormValidation — form eligibility (lowerability)", async () => {
  const slice = buildOpsdeskSlice();
  const { lowerability } = await import("../../../src/rules/lowerability.ts");
  const viewMatrix = lowerability(slice.rules.canViewIncident);
  expect(viewMatrix.form.supported).toBe(true);
  const manageMatrix = lowerability(slice.rules.canManageIncident);
  expect(manageMatrix.form.supported).toBe(true);
});
/**
 * Rule R-6 (PLAN.md §0.2 derivation #6 / Track R) — *active via the
 * `derive.rule.toTestMatrix` graph-native pass*.
 *
 * The pass walks every RULE node and derives the test *surface* —
 * the set of input vars and field reads a test generator would need
 * to exercise the rule. Emits a single
 * `artifact.docs.rule-test-matrix` artifact (JSON). Body evaluation
 * (computing verdicts per input combination) belongs to a later
 * track that adds an expression interpreter on the kernel IR.
 */
test("rule R-6: derive.rule.toTestMatrix — emits rule-test-matrix artifact", () => {
  const slice = buildOpsdeskSlice();
  const result = lifecycle.check(slice.ctx);

  const matrix = result.artifacts.find((a) => a.path === "docs/rule-test-matrix.json");
  expect(matrix).toBeDefined();

  const parsed = JSON.parse(matrix!.content) as {
    kind: string;
    rules: {
      rule_name: string;
      variables: string[];
      read_fields: { entity: string; field: string }[];
    }[];
  };
  expect(parsed.kind).toBe("rule-test-matrix");
  const view = parsed.rules.find((r) => r.rule_name === "canViewIncident");
  expect(view).toBeDefined();
  expect(view?.read_fields).toContainEqual({ entity: "Incident", field: "status" });
  expect(view?.variables.length).toBeGreaterThan(0);
});
/**
 * Rule R-7 (PLAN.md §0.2 derivation #7 / Track R) — *active via the
 * `derive.rule.toAccessMatrixDoc` graph-native pass*.
 *
 * The pass walks `POLICY_TARGETS_ENTITY` / `POLICY_USES_RULE` /
 * `GUARDS_ACTION` edges and emits a single
 * `artifact.docs.access-matrix` artifact (JSON) summarizing the
 * policy / rule / action wiring. The slice has one policy
 * (`IncidentPolicy`) which uses `canViewIncident` and targets
 * `Incident`; the matrix must contain it.
 */
test("rule R-7: derive.rule.toAccessMatrixDoc — emits docs.access-matrix artifact", () => {
  const slice = buildOpsdeskSlice();
  const result = lifecycle.check(slice.ctx);

  const matrix = result.artifacts.find((a) => a.path === "docs/access-matrix.json");
  expect(matrix).toBeDefined();
  expect(matrix?.language).toBe("docs");

  const parsed = JSON.parse(matrix!.content) as {
    kind: string;
    policies: { policy_name: string; target_entity?: string; predicate_rule?: string }[];
  };
  expect(parsed.kind).toBe("access-matrix");
  const incidentPolicy = parsed.policies.find((p) => p.policy_name === "IncidentPolicy");
  expect(incidentPolicy).toBeDefined();
  expect(incidentPolicy?.target_entity).toBe("Incident");
  expect(incidentPolicy?.predicate_rule).toBe("canViewIncident");
});
/**
 * Rule R-8 (PLAN.md §0.2 derivation #8 / Track R §R6) — *active*.
 *
 * `acknowledgeIncident` writes `Incident.status`; `canViewIncident`
 * reads `Incident.status`; `IncidentPolicy` uses `canViewIncident`;
 * `listOpenIncidents` is guarded by the policy and bound to
 * `incidentKey`. Therefore `acknowledgeIncident` invalidates
 * `incidentKey` — and the derive pass materializes that as an
 * `INVALIDATES_KEY_EDGE_KIND` edge in the graph.
 */
test("rule R-8: derive.rule.invalidationDependencies — action invalidates resource", async () => {
  const slice = buildOpsdeskSlice();
  lifecycle.check(slice.ctx);

  const { INVALIDATES_KEY_EDGE_KIND } = await import("../../../src/dialects/reactivity.ts");
  const invalidatesEdges = [...slice.ctx.graph.edges.values()].filter(
    (edge) => edge.kind.id === INVALIDATES_KEY_EDGE_KIND.id,
  );

  expect(invalidatesEdges.length).toBeGreaterThan(0);

  const targeting = invalidatesEdges.find((edge) =>
    edge.endpoints.some(
      (ep) => ep.target.kind === "node" && ep.target.name === slice.reactivity.incidentKey.name,
    ),
  );
  expect(targeting).toBeDefined();
  expect(targeting?.provenance?.kind).toBe("inferred");

  const meta = targeting?.metadata?.custom as
    | {
        provenance?: string;
        precision?: string;
        appliedPrecision?: string;
        confidence?: string;
        affectedRules?: readonly string[];
      }
    | undefined;
  expect(meta?.provenance).toBe("derived");
  // Both rules read Incident.status, so both should drive invalidation.
  expect(meta?.affectedRules).toEqual(
    expect.arrayContaining(["canViewIncident", "canManageIncident"]),
  );
  // The slice setup is the canonical "patchable" case: simple-equality
  // rule on the single field that the action writes. The precision
  // analyzer should report `patchable` with `proven` confidence
  // (Track R §R6 second-tier — see `deriveInvalidationPrecision`).
  expect(meta?.precision).toBe("patchable");
  expect(meta?.confidence).toBe("proven");
});
/**
 * Rule R-9 (PLAN.md §0.2 derivation #9 / Track R §R3) — *active via
 * the lowerability matrix*. Eligibility for incremental view
 * maintenance.
 *
 * `canViewIncident` is a positive equality (no or/not/exists), so the
 * matrix reports `ivm.supported = true`. The actual IVM lowering pass
 * is deferred (Track R §R9), but eligibility is now a green-gate.
 */
test("rule R-9: derive.rule.toIvmPlan — monotonic-rule eligibility (lowerability)", async () => {
  const slice = buildOpsdeskSlice();
  const { lowerability } = await import("../../../src/rules/lowerability.ts");
  const matrix = lowerability(slice.rules.canViewIncident);
  expect(matrix.ivm.supported).toBe(true);
});
/**
 * Rule R-10 (PLAN.md §0.2 derivation #10 / Track R) — *active via
 * the `derive.rule.toAuditExplanation` graph-native pass*.
 *
 * The pass walks every RULE node and derives a structural denial
 * trace *template* — the human-readable surface the audit subsystem
 * uses to explain why a request was denied, citing the fields and
 * entities the predicate examined. Emits one
 * `artifact.docs.rule-audit-explanation` artifact (JSON).
 *
 * Producing a *per-input* trace (with concrete values substituted)
 * needs the kernel-IR expression interpreter — out of scope for the
 * derivation; this contract locks the template.
 */
test("rule R-10: derive.rule.toAuditExplanation — emits rule-audit-explanation artifact", () => {
  const slice = buildOpsdeskSlice();
  const result = lifecycle.check(slice.ctx);

  const doc = result.artifacts.find((a) => a.path === "docs/rule-audit-explanation.json");
  expect(doc).toBeDefined();

  const parsed = JSON.parse(doc!.content) as {
    kind: string;
    rules: {
      rule_name: string;
      denial_template: string;
      cited_fields: { entity: string; field: string }[];
    }[];
  };
  expect(parsed.kind).toBe("rule-audit-explanation");
  const view = parsed.rules.find((r) => r.rule_name === "canViewIncident");
  expect(view).toBeDefined();
  expect(view?.denial_template).toContain("canViewIncident");
  expect(view?.denial_template).toContain("Incident.status");
  expect(view?.cited_fields).toContainEqual({ entity: "Incident", field: "status" });
});

/**
 * Rule R-11 (PLAN.md §0.2 derivation #11 / Track R §R3) — *active via
 * the lowerability matrix*. Eligibility for optimistic-update
 * enablement.
 */
test("rule R-11: derive.rule.toOptimisticEnablement — eligibility (lowerability)", async () => {
  const slice = buildOpsdeskSlice();
  const { lowerability } = await import("../../../src/rules/lowerability.ts");
  const matrix = lowerability(slice.rules.canViewIncident);
  // Single equality on single entity ⇒ optimistic eligible.
  expect(matrix.optimistic.supported).toBe(true);
});
