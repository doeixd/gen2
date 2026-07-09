/* @__NO_SIDE_EFFECTS__ */
/**
 * Adapter: Context IR → kernel graph IR.
 */

import type { ContextDef, ContextProvision, ContextRequirement } from "./context.ts";
import { diagnostic, type Diagnostic } from "../core/index.ts";
import { defineNodeFromKind, nodeRef } from "../kernel/node.ts";
import { defineEdgeFromKind, readEdgeEndpoints } from "../kernel/edge.ts";
import type { KernelEdge } from "../kernel/edge.ts";
import { id, refOf } from "../kernel/id.ts";
import {
  CONTEXT_NODE_KIND,
  PROVISION_EDGE_KIND,
  REQUIRES_CONTEXT_EDGE_KIND,
  contextTraits,
} from "../dialects/core/context.ts";
import { STORAGE_LOCATION_NODE_KIND, placementTraits } from "../dialects/core/placement.ts";
import type { KernelGraph } from "../kernel/graph.ts";
import { edgesOfKindDef, nodesOfKindDef } from "../kernel/graph.ts";
import { storageLocationToGraphFragment, storageLocationToKernelNode } from "../storage/kernel.ts";
import { graphEdge, graphFragment, graphNode, type AnyGraphStep } from "../kernel/index.ts";

export const contextNodeId = (context: ContextDef): string => `node:context:${context.name}`;

const contextId = id.createFactory("core.context");

const contextRef = (context: ContextDef) => refOf(contextToKernelNode(context));

const locationRef = (provision: ContextProvision) =>
  refOf(storageLocationToKernelNode(provision.from));

const contextConsumerRef = (requirement: ContextRequirement) =>
  nodeRef(
    CONTEXT_NODE_KIND,
    contextId.parse.node(CONTEXT_NODE_KIND, `node:contextRequirement:${requirement.context.name}`),
    {
      name: `${requirement.context.name} requirement`,
    },
  );

export const contextToKernelNode = (context: ContextDef) =>
  defineNodeFromKind(CONTEXT_NODE_KIND, contextNodeId(context), {
    name: context.name,
    traits: [contextTraits.REQUEST_SCOPED],
    metadata: {
      custom: {
        semantic_type: context.semantic_type.name,
        description: context.description,
      },
    },
  });

export const contextToGraphFragment = (context: ContextDef): AnyGraphStep =>
  graphFragment(graphNode(contextToKernelNode(context)));

export const contextProvisionToKernelEdge = (provision: ContextProvision): KernelEdge =>
  defineEdgeFromKind(
    PROVISION_EDGE_KIND,
    `edge:contextProvision:${provision.context.name}->${provision.from.location_kind}`,
    {
      context: contextRef(provision.context),
      location: locationRef(provision),
    },
    { provenance: { kind: "explicit" } },
  );

export const contextProvisionToGraphFragment = (provision: ContextProvision): AnyGraphStep =>
  graphFragment(
    storageLocationToGraphFragment(provision.from),
    graphEdge(contextProvisionToKernelEdge(provision)),
  );

export const contextRequirementToKernelEdge = (requirement: ContextRequirement): KernelEdge =>
  defineEdgeFromKind(
    REQUIRES_CONTEXT_EDGE_KIND,
    `edge:requiresContext:${requirement.context.name}`,
    {
      consumer: contextConsumerRef(requirement),
      context: contextRef(requirement.context),
    },
    {
      traits: requirement.optional ? [contextTraits.OPTIONAL] : [contextTraits.REQUIRED],
      metadata: { custom: { optional: requirement.optional } },
      provenance: { kind: "explicit" },
    },
  );

export const contextRequirementToGraphFragment = (requirement: ContextRequirement): AnyGraphStep =>
  graphFragment(graphEdge(contextRequirementToKernelEdge(requirement)));

export const checkContextAndStorageOnGraph = (graph: KernelGraph): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const seenContexts = new Set<string>();

  for (const node of nodesOfKindDef(graph, CONTEXT_NODE_KIND)) {
    const name = node.name ?? node.id;
    if (seenContexts.has(name)) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "lifecycle:duplicate-context",
          message: `Context "${name}" is defined more than once`,
        }),
      );
    }
    seenContexts.add(name);
  }

  const provisionedContextIds = new Set<string>();
  for (const edge of edgesOfKindDef(graph, PROVISION_EDGE_KIND)) {
    const { context, location } = readEdgeEndpoints(PROVISION_EDGE_KIND, edge);
    if (context?.target.id) provisionedContextIds.add(context.target.id);
    const contextName =
      (context?.target.id ? graph.nodes.get(context.target.id)?.name : undefined) ??
      context?.target.name ??
      context?.target.id ??
      "unknown";
    const locationNode = location?.target.id ? graph.nodes.get(location.target.id) : undefined;
    const traitIds = new Set(locationNode?.traits.map((trait) => trait.id) ?? []);
    if (
      locationNode?.kind.id === STORAGE_LOCATION_NODE_KIND.id &&
      !traitIds.has(placementTraits.SENSITIVE_SAFE.id)
    ) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "context:unsafe-storage-location",
          message: `Context "${contextName}" is stored in "${locationNode.name ?? locationNode.id}" which is not marked sensitive-safe`,
          suggestion: "Use a server-side storage location for sensitive contexts.",
        }),
      );
    }
  }

  for (const edge of edgesOfKindDef(graph, REQUIRES_CONTEXT_EDGE_KIND)) {
    if (edge.metadata?.custom?.optional === true) continue;
    const { context } = readEdgeEndpoints(REQUIRES_CONTEXT_EDGE_KIND, edge);
    if (!context?.target.id || provisionedContextIds.has(context.target.id)) continue;
    const contextName =
      graph.nodes.get(context.target.id)?.name ?? context.target.name ?? context.target.id;
    diagnostics.push(
      diagnostic({
        severity: "error",
        code: "context:missing-provider",
        message: `Required context "${contextName}" has no matching provision`,
        suggestion: "Add a context provision or mark the requirement as optional.",
      }),
    );
  }

  return diagnostics;
};
