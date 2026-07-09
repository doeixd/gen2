/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel verifier - runs ODS verifiers from node/edge kind definitions.
 *
 * Connects ODS (Operation Definition Specification) verifiers to the pass system,
 * allowing passes to validate nodes and edges against their kind definitions.
 */

import type { KernelNode } from "./node.ts";
import type { KernelEdge } from "./edge.ts";
import type { NodeKindDef } from "./ods.ts";
import type { EdgeKindDef } from "./ods.ts";
import type { KernelGraph } from "./graph.ts";
import type { KernelId } from "./id.ts";
import { defineDiagnostic, type Diagnostic } from "./diagnostic.ts";

/** Verification result - a set of diagnostics from verification. */
export interface VerificationResult {
  readonly errors: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
}

const errorDiag = (code: string, message: string, subject: KernelId): Diagnostic =>
  defineDiagnostic(code, "error", message, { subject });

const warningDiag = (code: string, message: string, subject: KernelId): Diagnostic =>
  defineDiagnostic(code, "warning", message, { subject });

/** Verify a node against its kind definition. */
export const verifyNode = (node: KernelNode, kindDef: NodeKindDef): VerificationResult => {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];

  if (kindDef.verifier) {
    const issues = kindDef.verifier(node);
    for (const issue of issues) {
      errors.push(errorDiag("node:verification-failed", issue, node.id));
    }
  }

  // Check trait requirements if any
  for (const required of kindDef.traits) {
    const hasTrait = node.traits.some((t) => t.id === required.id);
    if (!hasTrait) {
      warnings.push(
        warningDiag(
          "node:missing-trait",
          `Node ${node.name ?? node.id} missing recommended trait: ${required.id}`,
          node.id,
        ),
      );
    }
  }

  return { errors, warnings };
};

/** Verify an edge against its kind definition. */
export const verifyEdge = (edge: KernelEdge, kindDef: EdgeKindDef): VerificationResult => {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];

  if (kindDef.verifier) {
    const issues = kindDef.verifier(edge);
    for (const issue of issues) {
      errors.push(errorDiag("edge:verification-failed", issue, edge.id));
    }
  }

  // Validate endpoints
  for (const endpoint of kindDef.endpoints) {
    const role = endpoint.name;
    const actualEndpoint = edge.endpoints.find((e) => e.role.id === endpoint.id);
    if (!actualEndpoint) {
      errors.push(
        errorDiag(
          "edge:missing-endpoint",
          `Edge ${edge.id} missing required endpoint role: ${role}`,
          edge.id,
        ),
      );
      continue;
    }

    // Check target kinds
    if (endpoint.target.targetKinds && endpoint.target.targetKinds.length > 0) {
      const targetKind =
        typeof actualEndpoint.target === "object" && "kind" in actualEndpoint.target
          ? actualEndpoint.target.kind
          : undefined;
      const allowedKindIds = endpoint.target.targetKinds.map((k) => k.id);
      if (targetKind && !allowedKindIds.includes(targetKind)) {
        errors.push(
          errorDiag(
            "edge:invalid-endpoint-kind",
            `Edge ${edge.id} endpoint ${role} target kind ${targetKind} not in allowed: ${allowedKindIds.join(", ")}`,
            edge.id,
          ),
        );
      }
    }

    // Check required traits
    if (endpoint.target.requiresTraits && endpoint.target.requiresTraits.length > 0) {
      const targetTraits: readonly { readonly id: string }[] =
        typeof actualEndpoint.target === "object" && "traits" in actualEndpoint.target
          ? ((actualEndpoint.target.traits as readonly { readonly id: string }[]) ?? [])
          : [];
      for (const required of endpoint.target.requiresTraits) {
        if (!targetTraits.some((t) => t.id === required)) {
          errors.push(
            errorDiag(
              "edge:endpoint-missing-trait",
              `Edge ${edge.id} endpoint ${role} missing required trait: ${required}`,
              edge.id,
            ),
          );
        }
      }
    }

    // Check excluded traits
    if (endpoint.target.excludesTraits && endpoint.target.excludesTraits.length > 0) {
      const targetTraits: readonly { readonly id: string }[] =
        typeof actualEndpoint.target === "object" && "traits" in actualEndpoint.target
          ? ((actualEndpoint.target.traits as readonly { readonly id: string }[]) ?? [])
          : [];
      for (const excluded of endpoint.target.excludesTraits) {
        if (targetTraits.some((t) => t.id === excluded)) {
          errors.push(
            errorDiag(
              "edge:endpoint-has-excluded-trait",
              `Edge ${edge.id} endpoint ${role} has forbidden trait: ${excluded}`,
              edge.id,
            ),
          );
        }
      }
    }
  }

  return { errors, warnings };
};

/** Verify all nodes in a graph against their kind definitions. */
export const verifyGraphNodes = (
  graph: KernelGraph,
  kindDefs: ReadonlyMap<string, NodeKindDef>,
): VerificationResult => {
  const allErrors: Diagnostic[] = [];
  const allWarnings: Diagnostic[] = [];

  for (const node of graph.nodes.values()) {
    const kindDef = kindDefs.get(node.kind.id);
    if (kindDef) {
      const result = verifyNode(node, kindDef);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }
  }

  return { errors: allErrors, warnings: allWarnings };
};

/** Verify all edges in a graph against their kind definitions. */
export const verifyGraphEdges = (
  graph: KernelGraph,
  kindDefs: ReadonlyMap<string, EdgeKindDef>,
): VerificationResult => {
  const allErrors: Diagnostic[] = [];
  const allWarnings: Diagnostic[] = [];

  for (const edge of graph.edges.values()) {
    const kindDef = kindDefs.get(edge.kind.id);
    if (kindDef) {
      const result = verifyEdge(edge, kindDef);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }
  }

  return { errors: allErrors, warnings: allWarnings };
};

/** Verify entire graph. */
export const verifyGraph = (
  graph: KernelGraph,
  options?: {
    readonly nodeKinds?: ReadonlyMap<string, NodeKindDef>;
    readonly edgeKinds?: ReadonlyMap<string, EdgeKindDef>;
  },
): VerificationResult => {
  const nodeResult = options?.nodeKinds
    ? verifyGraphNodes(graph, options.nodeKinds)
    : { errors: [], warnings: [] };
  const edgeResult = options?.edgeKinds
    ? verifyGraphEdges(graph, options.edgeKinds)
    : { errors: [], warnings: [] };

  return {
    errors: [...nodeResult.errors, ...edgeResult.errors],
    warnings: [...nodeResult.warnings, ...edgeResult.warnings],
  };
};
