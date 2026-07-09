/* @__NO_SIDE_EFFECTS__ */
/**
 * Graph stage results.
 *
 * Derive, legalize, lower, and emit stages all share this shape. The
 * legacy `PassResult.modifiedGraph` field remains as an adapter layer,
 * but new graph-native code should prefer this result model.
 */

import type { Artifact } from "./artifact.ts";
import type { Diagnostic } from "./diagnostic.ts";
import type { KernelGraph } from "./graph.ts";
import type { GraphPatch } from "./patch.ts";

export interface Explanation {
  readonly subject?: string;
  readonly message: string;
  readonly facts?: readonly string[];
}

export interface GraphStageResult {
  readonly graph: KernelGraph;
  readonly patches: readonly GraphPatch[];
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: readonly Artifact[];
  readonly explanations: readonly Explanation[];
}

export const graphStageResult = (
  graph: KernelGraph,
  input?: {
    readonly patches?: readonly GraphPatch[];
    readonly diagnostics?: readonly Diagnostic[];
    readonly artifacts?: readonly Artifact[];
    readonly explanations?: readonly Explanation[];
  },
): GraphStageResult => ({
  graph,
  patches: input?.patches ?? [],
  diagnostics: input?.diagnostics ?? [],
  artifacts: input?.artifacts ?? [],
  explanations: input?.explanations ?? [],
});

export interface StagePatchSummary {
  readonly op: GraphPatch["op"];
  readonly id?: string;
  readonly kind?: string;
  readonly target?: string;
  readonly provenance?: string;
}

export interface StageDiagnosticSummary {
  readonly code: string;
  readonly severity: Diagnostic["severity"];
  readonly message: string;
  readonly subject?: string;
  readonly repairCount: number;
  readonly repairPatchCount: number;
}

export interface StageArtifactSummary {
  readonly id: string;
  readonly target: Artifact["target"];
  readonly kind: string;
  readonly path?: string;
}

export interface StageResultSummary {
  readonly patchCount: number;
  readonly diagnosticCount: number;
  readonly artifactCount: number;
  readonly explanationCount: number;
  readonly patches: readonly StagePatchSummary[];
  readonly diagnostics: readonly StageDiagnosticSummary[];
  readonly artifacts: readonly StageArtifactSummary[];
  readonly explanations: readonly Explanation[];
}

const patchSummary = (patch: GraphPatch): StagePatchSummary => {
  switch (patch.op) {
    case "addNode":
      return {
        op: patch.op,
        id: patch.node.id,
        kind: patch.node.kind.id,
        target: patch.node.name,
        provenance: patch.provenance?.name ?? patch.provenance?.source,
      };
    case "addEdge":
      return {
        op: patch.op,
        id: patch.edge.id,
        kind: patch.edge.kind.id,
        target: patch.edge.endpoints
          .map((endpoint) =>
            typeof endpoint.target === "object" && endpoint.target !== null
              ? (endpoint.target.id ?? endpoint.target.name ?? endpoint.role.id)
              : endpoint.role.id,
          )
          .join(" -> "),
        provenance: patch.provenance?.name ?? patch.provenance?.source,
      };
    case "addExpr":
      return {
        op: patch.op,
        id: patch.expr.id,
        kind: patch.expr.op,
        provenance: patch.provenance?.name ?? patch.provenance?.source,
      };
    case "annotate":
      return {
        op: patch.op,
        target: patch.target,
        provenance: patch.provenance?.name ?? patch.provenance?.source,
      };
  }
};

export const summarizeStageResult = (result: {
  readonly patches?: readonly GraphPatch[];
  readonly diagnostics?: readonly Diagnostic[];
  readonly artifacts?: readonly Artifact[];
  readonly explanations?: readonly Explanation[];
}): StageResultSummary => {
  const patches = result.patches ?? [];
  const diagnostics = result.diagnostics ?? [];
  const artifacts = result.artifacts ?? [];
  const explanations = result.explanations ?? [];

  return {
    patchCount: patches.length,
    diagnosticCount: diagnostics.length,
    artifactCount: artifacts.length,
    explanationCount: explanations.length,
    patches: patches.map(patchSummary),
    diagnostics: diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      subject: diagnostic.subject,
      repairCount: diagnostic.repairs?.length ?? 0,
      repairPatchCount:
        diagnostic.repairs?.reduce((total, repair) => total + repair.patches.length, 0) ?? 0,
    })),
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      target: artifact.target,
      kind: artifact.kind,
      path: artifact.path,
    })),
    explanations,
  };
};

export const previewStageResult = summarizeStageResult;
export const explainStageResult = summarizeStageResult;
