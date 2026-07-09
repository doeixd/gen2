/* @__NO_SIDE_EFFECTS__ */
/**
 * Track R §R3 — `derive.rule.toAuditExplanation` (graph-native).
 *
 * For each `Rule` node in the graph, derives a structural denial
 * trace *template* — the human-readable surface that the audit
 * subsystem would use to explain "rule X denied this request because
 * field Y on entity Z didn't satisfy the predicate." Emits a single
 * `artifact.docs.rule-audit-explanation` artifact (JSON) keyed by
 * rule name.
 *
 * This is the structural derivation per PLAN.md §0.2 derivation
 * #10. Producing a *per-input* denial trace (with concrete values
 * substituted in) requires the kernel-IR expression interpreter and
 * runtime context capture — out of scope for this pass; this pass
 * provides the template the interpreter would fill in.
 *
 * **Entirely graph-native** per PLAN.md §0.5 #8: reads only
 * `graph.nodes` + `graph.edges` via
 * `extractRuleDependenciesFromGraph`.
 */

import { type PassResult, type KernelGraph } from "../kernel/index.ts";
import { defineArtifact, ARTIFACT_KINDS, type Artifact } from "../kernel/artifact.ts";
import type { KernelId } from "../kernel/id.ts";
import type { GenContext } from "../core/index.ts";
import { extractRuleDependenciesFromGraph } from "./kernel.ts";

const PASS_NAME = "derive.rule.toAuditExplanation";
const PASS_NODE_ID = `pass:${PASS_NAME}` as KernelId<"pass">;

const RULE_NODE_KIND_ID = "node.kind.rule";

type RuleExplanation = {
  readonly rule_name: string;
  readonly denial_template: string;
  readonly cited_fields: readonly { entity: string; field: string }[];
  readonly cited_entities: readonly string[];
  readonly cited_variables: readonly string[];
};

const buildAuditExplanations = (graph: KernelGraph): Artifact | undefined => {
  const explanations: RuleExplanation[] = [];

  for (const node of graph.nodes.values()) {
    if (node.kind.id !== RULE_NODE_KIND_ID) continue;
    if (!node.name) continue;
    const deps = extractRuleDependenciesFromGraph(graph, node.id);
    const fields = deps.fields
      .map((f) => ({ entity: f.owning_entity.name, field: f.name }))
      .sort((a, b) =>
        a.entity === b.entity ? a.field.localeCompare(b.field) : a.entity.localeCompare(b.entity),
      );
    const fieldClause =
      fields.length === 0
        ? "no fields"
        : fields.map((f) => `\`${f.entity}.${f.field}\``).join(", ");
    explanations.push({
      rule_name: node.name,
      denial_template: `Rule \`${node.name}\` denied access; the predicate examined ${fieldClause}.`,
      cited_fields: fields,
      cited_entities: deps.entities.map((e) => e.name).sort(),
      cited_variables: [...deps.variables].sort(),
    });
  }

  if (explanations.length === 0) return undefined;

  explanations.sort((a, b) => a.rule_name.localeCompare(b.rule_name));

  const doc = {
    kind: "rule-audit-explanation" as const,
    generated_by: PASS_NAME,
    rules: explanations,
  };

  return defineArtifact("artifact:rule-audit-explanation", {
    target: "docs",
    kind: ARTIFACT_KINDS.DOCS_RULE_AUDIT_EXPLANATION,
    path: "docs/rule-audit-explanation.json",
    content: JSON.stringify(doc, null, 2),
    generatedBy: PASS_NODE_ID,
  });
};

/** Register the audit-explanation-doc pass. */
export const registerAuditExplanationPass = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(PASS_NAME)) return;

  ctx.passRegistry.register({ name: PASS_NAME, phase: "derive" }, (graph): PassResult => {
    const artifact = buildAuditExplanations(graph);
    return {
      success: true,
      diagnostics: [],
      artifacts: artifact ? [artifact] : [],
    };
  });
};

export const AUDIT_EXPLANATION_PASS = PASS_NAME;
