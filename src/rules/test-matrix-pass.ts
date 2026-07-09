/* @__NO_SIDE_EFFECTS__ */
/**
 * Track R §R3 — `derive.rule.toTestMatrix` (graph-native).
 *
 * For each `Rule` node in the graph, walks the rule's READS / VAR
 * edges via `extractRuleDependenciesFromGraph` to derive the test
 * *surface* — the set of input vars and field reads a test
 * generator would need to exercise the rule. Emits one
 * `artifact.docs.rule-test-matrix` artifact (JSON) covering every
 * rule.
 *
 * This is the structural derivation per PLAN.md §0.2 derivation #6:
 * "truth table over rule vars". The artifact lists the test surface;
 * actually evaluating the rule body to produce verdicts belongs to
 * Track R / Track F (needs an expression interpreter on the kernel
 * IR).
 *
 * **Entirely graph-native** per PLAN.md §0.5 #8: reads only
 * `graph.nodes` + `graph.edges`, via
 * `extractRuleDependenciesFromGraph`.
 */

import { type PassResult, type KernelGraph } from "../kernel/index.ts";
import { defineArtifact, ARTIFACT_KINDS, type Artifact } from "../kernel/artifact.ts";
import type { KernelId } from "../kernel/id.ts";
import type { GenContext } from "../core/index.ts";
import { extractRuleDependenciesFromGraph } from "./kernel.ts";

const PASS_NAME = "derive.rule.toTestMatrix";
const PASS_NODE_ID = `pass:${PASS_NAME}` as KernelId<"pass">;

const RULE_NODE_KIND_ID = "node.kind.rule";

type RuleSurface = {
  readonly rule_name: string;
  readonly variables: readonly string[];
  readonly read_fields: readonly { entity: string; field: string }[];
  readonly read_entities: readonly string[];
};

const buildTestMatrix = (graph: KernelGraph): Artifact | undefined => {
  const surfaces: RuleSurface[] = [];

  for (const node of graph.nodes.values()) {
    if (node.kind.id !== RULE_NODE_KIND_ID) continue;
    if (!node.name) continue;
    const deps = extractRuleDependenciesFromGraph(graph, node.id);
    surfaces.push({
      rule_name: node.name,
      variables: [...deps.variables].sort(),
      read_fields: deps.fields
        .map((f) => ({ entity: f.owning_entity.name, field: f.name }))
        .sort((a, b) =>
          a.entity === b.entity ? a.field.localeCompare(b.field) : a.entity.localeCompare(b.entity),
        ),
      read_entities: deps.entities.map((e) => e.name).sort(),
    });
  }

  if (surfaces.length === 0) return undefined;

  surfaces.sort((a, b) => a.rule_name.localeCompare(b.rule_name));

  const matrix = {
    kind: "rule-test-matrix" as const,
    generated_by: PASS_NAME,
    rules: surfaces,
  };

  return defineArtifact("artifact:rule-test-matrix", {
    target: "docs",
    kind: ARTIFACT_KINDS.DOCS_RULE_TEST_MATRIX,
    path: "docs/rule-test-matrix.json",
    content: JSON.stringify(matrix, null, 2),
    generatedBy: PASS_NODE_ID,
  });
};

/** Register the test-matrix-doc pass. */
export const registerTestMatrixPass = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(PASS_NAME)) return;

  ctx.passRegistry.register({ name: PASS_NAME, phase: "derive" }, (graph): PassResult => {
    const artifact = buildTestMatrix(graph);
    return {
      success: true,
      diagnostics: [],
      artifacts: artifact ? [artifact] : [],
    };
  });
};

export const TEST_MATRIX_PASS = PASS_NAME;
