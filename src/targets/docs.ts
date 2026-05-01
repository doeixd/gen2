/* @__NO_SIDE_EFFECTS__ */
/**
 * Docs target fixture: emits Markdown documentation from the obligation graph
 * and provider/requirement/hydration plans.
 */

import type { GenContext } from "../core/index.ts";
import type { ObligationGraph, SemanticObligation } from "../obligations/index.ts";
import { deriveObligationGraph } from "../obligations/index.ts";

export interface DocsArtifact {
  readonly kind: "docs_artifact";
  readonly title: string;
  readonly format: "markdown";
  readonly content: string;
}

const renderObligation = (o: SemanticObligation): string =>
  `- **${o.obligation}** (${o.priority}) — ${o.description}`;

const renderAccessMatrix = (ctx: GenContext): string => {
  const lines: string[] = [];
  lines.push("# Access Matrix\n");
  for (const policy of ctx.policies) {
    lines.push(`## ${policy.name}\n`);
    lines.push(`- Target: ${policy.target_entity.name}`);
    lines.push(`- Actions: ${policy.actions.map((a) => a.action_name).join(", ") || "none"}`);
    lines.push("");
  }
  return lines.join("\n");
};

const renderProviderGraph = (ctx: GenContext): string => {
  const lines: string[] = [];
  lines.push("# Provider Graph\n");
  for (const req of ctx.requirements) {
    const providers = ctx.providers.filter((p) => p.provides.name === req.name);
    lines.push(`## Requirement: ${req.name}`);
    if (providers.length === 0) {
      lines.push("- **No providers**");
    } else {
      for (const provider of providers) {
        lines.push(`- Provider: ${provider.name} (source: ${provider.source.kind})`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
};

export const generateDocsArtifacts = (ctx: GenContext): readonly DocsArtifact[] => {
  const graph: ObligationGraph =
    ctx.obligation_graphs.length > 0 ? ctx.obligation_graphs[0]! : deriveObligationGraph(ctx);

  const obligationsMd = [
    "# Semantic Obligations\n",
    ...graph.obligations.map(renderObligation),
  ].join("\n");

  const artifacts: DocsArtifact[] = [
    {
      kind: "docs_artifact",
      title: "Obligations",
      format: "markdown",
      content: obligationsMd,
    },
  ];

  if (ctx.policies.length > 0) {
    artifacts.push({
      kind: "docs_artifact",
      title: "Access Matrix",
      format: "markdown",
      content: renderAccessMatrix(ctx),
    });
  }

  if (ctx.requirements.length > 0 || ctx.providers.length > 0) {
    artifacts.push({
      kind: "docs_artifact",
      title: "Provider Graph",
      format: "markdown",
      content: renderProviderGraph(ctx),
    });
  }

  return artifacts;
};
