/**
 * Track R §R6 — rule-derived invalidation pass.
 *
 * The showcase derivation: action writes a field that a rule reads,
 * the rule guards a query (via policy), the query has a key family,
 * therefore the action invalidates the key family. The pass
 * `derive.rule.invalidationDependencies` materializes this chain as
 * a real `INVALIDATES_KEY_EDGE_KIND` edge in the graph, with
 * provenance + precision + affected-rule metadata.
 *
 * This is what the whole library is *for*. PLAN.md §0.2 derivation
 * #8 / §R6.
 */

import { expect, test } from "vite-plus/test";
import { check } from "../src/lifecycle/lifecycle.ts";
import { createGen } from "../src/gen.ts";
import { string as stringType, uuid as uuidType } from "../src/types/semantic.ts";
import { ruleEq, ruleField, ruleLiteral, ruleVar } from "../src/rules/rules.ts";
import { allowAuthenticated } from "../src/authz/authz.ts";
import { buildActionUpdate } from "../src/function/function.ts";
import { fromEntity } from "../src/query/query.ts";
import {
  explain,
  previewPassPipeline,
  runPassPipeline,
  summarizeStageResult,
} from "../src/kernel/index.ts";
import { INVALIDATES_KEY_EDGE_KIND } from "../src/dialects/reactivity.ts";
import {
  registerReactivityPasses,
  RULE_INVALIDATION_PASS,
  RULE_INVALIDATION_SURFACE,
} from "../src/reactivity/passes.ts";
import { registerTestMatrixPass, TEST_MATRIX_PASS } from "../src/rules/test-matrix-pass.ts";

const buildScenario = () => {
  const { ctx, gen } = createGen();

  const Project = gen.entity("Project", {
    id: uuidType(),
    name: stringType(),
    status: stringType(),
  });

  const canViewProject = gen.rule.define({
    name: "canViewProject",
    vars: [ruleVar("actorId", stringType())],
    when: ruleEq(
      ruleField(Project, Project.fields.status, stringType()),
      ruleLiteral("active", stringType()),
    ),
  });

  const projectPolicy = gen.authz.policy({
    name: "projectPolicy",
    target_entity: Project,
    actions: [{ action_name: "read", condition: allowAuthenticated() }],
    predicate: canViewProject,
  });

  const projectKey = gen.key.entity(Project);

  gen.func.query({
    name: "listProjects",
    input_type: stringType(),
    returns: stringType(),
    body: fromEntity(Project).build(),
    reactivity: { key: projectKey },
    auth: { action: "read", policy_name: projectPolicy.name },
  });

  gen.func.action({
    name: "updateProjectStatus",
    input_type: Project,
    returns: Project,
    body: buildActionUpdate(Project, [
      [
        Project.fields.status,
        {
          kind: "literal",
          value: "archived",
          semanticType: stringType(),
        } as unknown as import("../src/expression/index.ts").Expr,
      ],
    ]),
  });

  return { ctx, gen, projectKey };
};

test("derive.rule.invalidationDependencies declares a derivation surface", () => {
  expect(RULE_INVALIDATION_SURFACE.phase).toBe("derivation");
  expect(RULE_INVALIDATION_SURFACE.id.value).toBe("surface.rule.invalidationDependencies");
  expect(RULE_INVALIDATION_SURFACE.consumes.subjects[0]?.id).toBe("subject.kind.entity");
  expect(RULE_INVALIDATION_SURFACE.consumes.edges.map((edge) => edge.id)).toEqual([
    "edge.kind.actionWritesField",
    "edge.kind.ruleReads",
    "edge.kind.policyUsesRule",
    "edge.kind.queryReads",
  ]);
  expect(RULE_INVALIDATION_SURFACE.yields.edges.map((edge) => edge.id)).toEqual([
    INVALIDATES_KEY_EDGE_KIND.id,
  ]);
  expect(RULE_INVALIDATION_SURFACE.resultShape.diagnostics).toContain("rule:derived-invalidation");
});

test("derive.rule.invalidationDependencies emits an InvalidatesKey edge for the chain", () => {
  const { ctx, projectKey } = buildScenario();

  // Run the lifecycle so the dialect-pass registration fires.
  check(ctx);

  const invalidatesEdges = [...ctx.graph.edges.values()].filter(
    (edge) => edge.kind.id === INVALIDATES_KEY_EDGE_KIND.id,
  );
  expect(invalidatesEdges.length).toBeGreaterThan(0);

  const targeting = invalidatesEdges.find((edge) =>
    edge.endpoints.some((ep) => ep.target.kind === "node" && ep.target.name === projectKey.name),
  );
  expect(targeting).toBeDefined();
  expect(targeting?.provenance?.kind).toBe("inferred");
});

test("derive.rule.invalidationDependencies exposes graph patches and explanations", () => {
  const { ctx } = buildScenario();
  registerReactivityPasses(ctx);

  const result = runPassPipeline([RULE_INVALIDATION_PASS], ctx.graph, ctx.passRegistry);

  expect(result.success).toBe(true);
  expect(result.patches?.some((patch) => patch.op === "addEdge")).toBe(true);
  expect(result.diagnostics?.[0]?.repairs?.[0]?.patches).toEqual(result.patches);
  expect(result.explanations?.[0]?.message).toContain("Derived rule-driven invalidation");
  expect(
    [...(result.modifiedGraph?.edges.values() ?? [])].some(
      (edge) => edge.kind.id === INVALIDATES_KEY_EDGE_KIND.id,
    ),
  ).toBe(true);
});

test("stage summary exposes invalidation patches, diagnostics, repairs, and explanations", () => {
  const { ctx } = buildScenario();
  registerReactivityPasses(ctx);

  const result = runPassPipeline([RULE_INVALIDATION_PASS], ctx.graph, ctx.passRegistry);
  const summary = summarizeStageResult(result);

  expect(summary.patches.some((patch) => patch.op === "addEdge")).toBe(true);
  expect(summary.patches.some((patch) => patch.kind === INVALIDATES_KEY_EDGE_KIND.id)).toBe(true);
  expect(summary.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "rule:derived-invalidation",
      severity: "info",
      repairCount: 1,
      repairPatchCount: summary.patchCount,
    }),
  );
  expect(summary.explanations[0]?.message).toContain("Derived rule-driven invalidation");
});

test("previewPassPipeline exposes invalidation stage summary in one call", () => {
  const { ctx } = buildScenario();
  registerReactivityPasses(ctx);

  const preview = previewPassPipeline([RULE_INVALIDATION_PASS], ctx.graph, ctx.passRegistry);

  expect(preview.result.success).toBe(true);
  expect(preview.summary.patches.some((patch) => patch.kind === INVALIDATES_KEY_EDGE_KIND.id)).toBe(
    true,
  );
  expect(preview.summary.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "rule:derived-invalidation",
      repairCount: 1,
      repairPatchCount: preview.summary.patchCount,
    }),
  );
});

test("gen.preview.pipeline exposes invalidation stage summary", () => {
  const { ctx, gen } = buildScenario();
  registerReactivityPasses(ctx);

  const preview = gen.preview.pipeline([RULE_INVALIDATION_PASS]);

  expect(preview.result.success).toBe(true);
  expect(preview.summary.patches.some((patch) => patch.kind === INVALIDATES_KEY_EDGE_KIND.id)).toBe(
    true,
  );
  expect(preview.summary.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "rule:derived-invalidation",
      repairPatchCount: preview.summary.patchCount,
    }),
  );
});

test("gen.preview.pipeline surfaces derived patches and emitted docs artifacts together", () => {
  const { ctx, gen } = buildScenario();
  registerReactivityPasses(ctx);
  registerTestMatrixPass(ctx);

  const preview = gen.preview.pipeline([RULE_INVALIDATION_PASS, TEST_MATRIX_PASS]);

  expect(preview.result.success).toBe(true);
  expect(preview.summary.patches.some((patch) => patch.kind === INVALIDATES_KEY_EDGE_KIND.id)).toBe(
    true,
  );
  expect(preview.summary.artifacts).toContainEqual(
    expect.objectContaining({
      target: "docs",
      kind: "artifact.docs.rule-test-matrix",
      path: "docs/rule-test-matrix.json",
    }),
  );
  expect(preview.summary.artifactCount).toBe(1);
});

test("derived invalidation edge carries provenance + precision + affected rules metadata", () => {
  const { ctx } = buildScenario();
  check(ctx);

  const invalidatesEdges = [...ctx.graph.edges.values()].filter(
    (edge) => edge.kind.id === INVALIDATES_KEY_EDGE_KIND.id,
  );
  expect(invalidatesEdges.length).toBeGreaterThan(0);

  const meta = invalidatesEdges[0]!.metadata?.custom as
    | {
        provenance?: string;
        precision?: string;
        confidence?: string;
        affectedRules?: readonly string[];
      }
    | undefined;
  expect(meta?.provenance).toBe("derived");
  expect(["broad", "matched", "exact", "patchable"]).toContain(meta?.precision);
  expect(["proven", "conservative"]).toContain(meta?.confidence);
  expect(meta?.affectedRules).toContain("canViewProject");
});

test("app.explain on the action surfaces the derived invalidation chain", () => {
  const { ctx, projectKey } = buildScenario();
  check(ctx);

  // Find the action node id.
  const actionNode = [...ctx.graph.nodes.values()].find((n) => n.name === "updateProjectStatus");
  expect(actionNode).toBeDefined();

  const result = explain(ctx.graph, actionNode!.id, { maxDepth: 1 });

  // The trace includes the InvalidatesKey edge, with the key family
  // name on the right-hand side.
  expect(result.trace).toMatch(/invalidatesKey/);
  expect(result.trace).toContain(projectKey.name);
});
