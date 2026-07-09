/* @__NO_SIDE_EFFECTS__ */
/**
 * Adapter: Requirement/provider IR → kernel graph IR.
 */

import type {
  Provider,
  ProviderLifetime,
  ProviderSource,
  RequirementRef,
  RequirementTarget,
  Sensitivity,
} from "./requirements.ts";
import { diagnostic, type Diagnostic } from "../core/index.ts";
import type { ContextDef } from "../context/index.ts";
import type { ServiceRef } from "../services/index.ts";
import { defineNodeFromKind, nodeRef } from "../kernel/node.ts";
import { defineEdgeFromKind, readEdgeEndpoints } from "../kernel/edge.ts";
import type { KernelEdge } from "../kernel/edge.ts";
import { id, refOf } from "../kernel/id.ts";
import { contextNodeId } from "../context/kernel.ts";
import { REQUIREMENT_NODE_KIND, requirementTraits } from "../dialects/core/requirement.ts";
import {
  PROVIDER_NODE_KIND,
  SERVICE_NODE_KIND,
  SATISFIES_EDGE_KIND,
  DEPENDS_ON_PROVIDER_EDGE_KIND,
  providerTraits,
} from "../dialects/core/provider.ts";
import { REQUIRES_CONTEXT_EDGE_KIND, CONTEXT_NODE_KIND } from "../dialects/core/context.ts";
import {
  PLACED_IN_EDGE_KIND,
  SOURCED_FROM_EDGE_KIND,
  placementTraits,
} from "../dialects/core/placement.ts";
import type { KernelGraph } from "../kernel/graph.ts";
import { edgesOfKindDef, nodesOfKindDef } from "../kernel/graph.ts";
import type { StorageLocation } from "../storage/index.ts";
import { storageLocationToGraphFragment, storageLocationToKernelNode } from "../storage/kernel.ts";
import { graphEdge, graphFragment, graphNode, type AnyGraphStep } from "../kernel/index.ts";

const requirementId = id.createFactory("core.requirement");
const contextId = id.createFactory("core.context");
const providerId = id.createFactory("core.provider");

export const requirementNodeId = (requirement: RequirementRef): string =>
  `node:requirement:${requirement.name}`;

export const providerNodeId = (provider: Provider): string => `node:provider:${provider.name}`;

const serviceNodeId = (service: ServiceRef<any>): string => `node:service:${service.name}`;

const targetName = (target: RequirementTarget): string => target.name;

const targetNodeId = (target: RequirementTarget): string => {
  switch (target.kind) {
    case "requirement_ref":
      return requirementNodeId(target);
    case "context_def":
      return contextNodeId(target as ContextDef);
    case "service_ref":
      return serviceNodeId(target as ServiceRef<any>);
  }
};

const targetRef = (target: RequirementTarget) => {
  switch (target.kind) {
    case "requirement_ref":
      return nodeRef(
        REQUIREMENT_NODE_KIND,
        requirementId.parse.node(REQUIREMENT_NODE_KIND, targetNodeId(target)),
        {
          name: targetName(target),
        },
      );
    case "context_def":
      return nodeRef(
        CONTEXT_NODE_KIND,
        contextId.parse.node(CONTEXT_NODE_KIND, contextNodeId(target as ContextDef)),
        {
          name: targetName(target),
        },
      );
    case "service_ref":
      return nodeRef(
        SERVICE_NODE_KIND,
        providerId.parse.node(SERVICE_NODE_KIND, serviceNodeId(target as ServiceRef<any>)),
        {
          name: targetName(target),
        },
      );
  }
};

const providerRef = (provider: Provider) => refOf(providerToKernelNode(provider));

const locationRef = (location: StorageLocation) => refOf(storageLocationToKernelNode(location));

const sourceLifetimeCeiling = (source: ProviderSource): ProviderLifetime | undefined => {
  switch (source.kind) {
    case "request_header":
      return "request";
    case "route_param":
    case "query_param":
      return "route";
    case "cookie":
      return "session";
    case "hydration_snapshot":
    case "reactive_resource":
      return "component";
    case "client_storage":
      return source.storage.capabilities.persistent ? "app" : "component";
    case "state_resource":
      return (
        source.state.lifetime ??
        (source.state.storage.capabilities.persistent ? "app" : "component")
      );
    case "static_value":
    case "env_var":
    case "service_constructor":
    case "opaque_runtime":
      return undefined;
  }
};

export const storageLocationsForProvider = (
  provider: Provider,
): readonly { location: StorageLocation; role: "placement" | "storage" | "source" }[] => {
  const out: { location: StorageLocation; role: "placement" | "storage" | "source" }[] = [];
  if (provider.placement) out.push({ location: provider.placement, role: "placement" });
  if (provider.storage) out.push({ location: provider.storage, role: "storage" });
  if (provider.source.kind === "client_storage") {
    out.push({ location: provider.source.storage, role: "source" });
  }
  if (provider.source.kind === "state_resource") {
    out.push({ location: provider.source.state.storage, role: "source" });
  }
  return out;
};

export const requirementToKernelNode = (requirement: RequirementRef) =>
  defineNodeFromKind(REQUIREMENT_NODE_KIND, requirementNodeId(requirement), {
    name: requirement.name,
    traits: [requirementTraits.MANDATORY],
    metadata: {
      custom: {
        value_type: requirement.value_type.name,
        sensitivity: requirement.sensitivity,
      },
    },
  });

export const requirementToGraphFragment = (requirement: RequirementRef): AnyGraphStep =>
  graphFragment(graphNode(requirementToKernelNode(requirement)));

export const providerToKernelNode = (provider: Provider) =>
  defineNodeFromKind(PROVIDER_NODE_KIND, providerNodeId(provider), {
    name: provider.name,
    traits: [
      provider.source.kind === "opaque_runtime" || provider.source.kind === "service_constructor"
        ? providerTraits.EXTERNAL_IMPL
        : providerTraits.LOCAL_IMPL,
    ],
    metadata: {
      custom: {
        provides: targetName(provider.provides),
        source_kind: provider.source.kind,
        source_lifetime_ceiling: sourceLifetimeCeiling(provider.source),
        lifetime: provider.lifetime,
        sensitivity: provider.sensitivity,
        client_projection: provider.client_projection
          ? {
              source_name: provider.client_projection.source_name,
              projected_type: provider.client_projection.projected_type.name,
              projected_sensitivity: provider.client_projection.projected_sensitivity,
            }
          : undefined,
      },
    },
  });

export const providerToKernelEdges = (
  provider: Provider,
  providers: readonly Provider[] = [],
): readonly KernelEdge[] => {
  const edges: KernelEdge[] = [
    defineEdgeFromKind(
      SATISFIES_EDGE_KIND,
      `edge:satisfies:${provider.name}->${targetName(provider.provides)}`,
      {
        provider: providerRef(provider),
        requirement: targetRef(provider.provides),
      },
      { provenance: { kind: "explicit" } },
    ),
  ];

  for (const required of provider.requires ?? []) {
    const dependency = providers.find((candidate) => candidate.provides.name === required.name);
    if (!dependency) continue;
    edges.push(
      defineEdgeFromKind(
        DEPENDS_ON_PROVIDER_EDGE_KIND,
        `edge:providerDepends:${provider.name}->${dependency.name}`,
        {
          dependent: providerRef(provider),
          dependency: providerRef(dependency),
        },
        { provenance: { kind: "inferred", pass: "bridge.provider", confidence: "conservative" } },
      ),
    );
  }

  for (const { location, role } of storageLocationsForProvider(provider)) {
    if (role === "source") {
      edges.push(
        defineEdgeFromKind(
          SOURCED_FROM_EDGE_KIND,
          `edge:provider:${role}:${provider.name}->${location.location_kind}`,
          {
            consumer: providerRef(provider),
            source: locationRef(location),
          },
          {
            metadata: { custom: { role, location_kind: location.location_kind } },
            provenance: { kind: "explicit" },
          },
        ),
      );
    } else {
      edges.push(
        defineEdgeFromKind(
          PLACED_IN_EDGE_KIND,
          `edge:provider:${role}:${provider.name}->${location.location_kind}`,
          {
            placed: providerRef(provider),
            location: locationRef(location),
          },
          {
            metadata: { custom: { role, location_kind: location.location_kind } },
            provenance: { kind: "explicit" },
          },
        ),
      );
    }
  }

  return edges;
};

export const providerToGraphFragment = (
  provider: Provider,
  providers: readonly Provider[] = [],
): AnyGraphStep =>
  graphFragment(
    graphNode(providerToKernelNode(provider)),
    ...storageLocationsForProvider(provider).map(({ location }) =>
      storageLocationToGraphFragment(location),
    ),
    ...providerToKernelEdges(provider, providers).map((edge) => graphEdge(edge)),
  );

export type GraphRequirement = {
  readonly key: string;
  readonly kind: RequirementTarget["kind"];
  readonly name: string;
  readonly sensitivity?: Sensitivity;
};

export type GraphProvider = {
  readonly key: string;
  readonly name: string;
  readonly providesKey?: string;
  readonly sourceKind?: string;
  readonly sourceLifetimeCeiling?: ProviderLifetime;
  readonly lifetime?: ProviderLifetime;
  readonly sensitivity?: Sensitivity;
  readonly locations: readonly GraphProviderLocation[];
  readonly dependencies: readonly string[];
};

export type GraphProviderLocation = {
  readonly name: string;
  readonly role: "placement" | "storage" | "source";
  readonly sensitiveSafe: boolean;
  readonly clientReadable: boolean;
  readonly locationKind?: string;
};

export type GraphRequirementBinding = {
  readonly requirement: GraphRequirement;
  readonly provider: GraphProvider;
  readonly confidence: "exact";
};

export type GraphRequirementSatisfactionPlan = {
  readonly kind: "graph_requirement_satisfaction_plan";
  readonly requirements: readonly GraphRequirement[];
  readonly providers: readonly GraphProvider[];
  readonly bindings: readonly GraphRequirementBinding[];
  readonly missing: readonly GraphRequirement[];
  readonly ambiguous: readonly GraphRequirement[];
  readonly diagnostics: readonly Diagnostic[];
};

const targetKindForNodeKind = (nodeKindId: string): RequirementTarget["kind"] => {
  switch (nodeKindId) {
    case "node.kind.context":
      return "context_def";
    case "node.kind.service":
      return "service_ref";
    default:
      return "requirement_ref";
  }
};

const graphRequirements = (graph: KernelGraph): readonly GraphRequirement[] => {
  const requirements = new Map<string, GraphRequirement>();

  for (const node of nodesOfKindDef(graph, REQUIREMENT_NODE_KIND)) {
    const name = node.name ?? node.id;
    requirements.set(`requirement_ref:${name}`, {
      key: `requirement_ref:${name}`,
      kind: "requirement_ref",
      name,
      sensitivity: node.metadata?.custom?.sensitivity,
    });
  }

  for (const node of graph.nodes.values()) {
    if (node.kind.id !== "node.kind.context" && node.kind.id !== "node.kind.service") continue;
    const kind = targetKindForNodeKind(node.kind.id);
    const name = node.name ?? node.id;
    requirements.set(`${kind}:${name}`, {
      key: `${kind}:${name}`,
      kind,
      name,
    });
  }

  for (const edge of edgesOfKindDef(graph, REQUIRES_CONTEXT_EDGE_KIND)) {
    if (edge.metadata?.custom?.optional === true) continue;
    const { context: contextEndpoint } = readEdgeEndpoints(REQUIRES_CONTEXT_EDGE_KIND, edge);
    if (!contextEndpoint?.target.id) continue;
    const contextNode = graph.nodes.get(contextEndpoint.target.id);
    const name = contextNode?.name ?? contextEndpoint.target.name ?? contextEndpoint.target.id;
    requirements.set(`context_def:${name}`, {
      key: `context_def:${name}`,
      kind: "context_def",
      name,
    });
  }

  return [...requirements.values()];
};

const graphProviders = (graph: KernelGraph): readonly GraphProvider[] => {
  const providers = new Map<string, GraphProvider>();

  for (const node of nodesOfKindDef(graph, PROVIDER_NODE_KIND)) {
    providers.set(node.id, {
      key: node.id,
      name: node.name ?? node.id,
      sourceKind: node.metadata?.custom?.source_kind,
      sourceLifetimeCeiling: node.metadata?.custom?.source_lifetime_ceiling,
      lifetime: node.metadata?.custom?.lifetime,
      sensitivity: node.metadata?.custom?.sensitivity,
      locations: [],
      dependencies: [],
    });
  }

  for (const edge of edgesOfKindDef(graph, SATISFIES_EDGE_KIND)) {
    const { provider: providerEndpoint, requirement: requirementEndpoint } = readEdgeEndpoints(
      SATISFIES_EDGE_KIND,
      edge,
    );
    if (!providerEndpoint?.target.id || !requirementEndpoint?.target.name) continue;
    const existing = providers.get(providerEndpoint.target.id);
    if (!existing) continue;
    const targetNode = requirementEndpoint.target.id
      ? graph.nodes.get(requirementEndpoint.target.id)
      : undefined;
    const kind = targetKindForNodeKind(targetNode?.kind.id ?? REQUIREMENT_NODE_KIND.id);
    providers.set(providerEndpoint.target.id, {
      ...existing,
      providesKey: `${kind}:${requirementEndpoint.target.name}`,
    });
  }

  const placementEdges = [
    ...edgesOfKindDef(graph, PLACED_IN_EDGE_KIND).map((edge) => ({
      edge,
      endpoints: readEdgeEndpoints(PLACED_IN_EDGE_KIND, edge),
      defaultRole: "placement" as const,
    })),
    ...edgesOfKindDef(graph, SOURCED_FROM_EDGE_KIND).map((edge) => ({
      edge,
      endpoints: readEdgeEndpoints(SOURCED_FROM_EDGE_KIND, edge),
      defaultRole: "source" as const,
    })),
  ];

  for (const { edge, endpoints, defaultRole } of placementEdges) {
    const providerEndpoint = "consumer" in endpoints ? endpoints.consumer : endpoints.placed;
    const locationEndpoint = "source" in endpoints ? endpoints.source : endpoints.location;
    if (!providerEndpoint?.target.id || !locationEndpoint?.target.id) continue;
    const existing = providers.get(providerEndpoint.target.id);
    if (!existing) continue;
    const location = graph.nodes.get(locationEndpoint.target.id);
    const traitIds = new Set(location?.traits.map((trait) => trait.id) ?? []);
    const role =
      (edge.metadata?.custom?.role as GraphProviderLocation["role"] | undefined) ?? defaultRole;
    providers.set(providerEndpoint.target.id, {
      ...existing,
      locations: [
        ...existing.locations,
        {
          name: location?.name ?? locationEndpoint.target.name ?? locationEndpoint.target.id,
          role,
          sensitiveSafe: traitIds.has(placementTraits.SENSITIVE_SAFE.id),
          clientReadable: traitIds.has(placementTraits.CLIENT_READABLE.id),
          locationKind: location?.metadata?.custom?.location_kind as string | undefined,
        },
      ],
    });
  }

  for (const edge of edgesOfKindDef(graph, DEPENDS_ON_PROVIDER_EDGE_KIND)) {
    const { dependent, dependency } = readEdgeEndpoints(DEPENDS_ON_PROVIDER_EDGE_KIND, edge);
    if (!dependent?.target.id || !dependency?.target.id) continue;
    const existing = providers.get(dependent.target.id);
    if (!existing) continue;
    providers.set(dependent.target.id, {
      ...existing,
      dependencies: [...existing.dependencies, dependency.target.id],
    });
  }

  return [...providers.values()];
};

const isSensitive = (sensitivity: Sensitivity | undefined): boolean =>
  sensitivity === "auth" ||
  sensitivity === "secret" ||
  sensitivity === "server_only" ||
  sensitivity === "regulated";

const lifetimeRank: Record<ProviderLifetime, number> = {
  transaction: 1,
  request: 2,
  route: 3,
  component: 4,
  workflow_run: 4,
  job_run: 4,
  session: 5,
  tenant: 6,
  app: 7,
  global: 8,
  test: 8,
};

const hasProviderCycle = (
  provider: GraphProvider,
  providers: readonly GraphProvider[],
): boolean => {
  const byKey = new Map(providers.map((p) => [p.key, p]));
  const visit = (current: GraphProvider, path: ReadonlySet<string>): boolean => {
    if (path.has(current.key)) return true;
    const nextPath = new Set(path).add(current.key);
    for (const dependencyKey of current.dependencies) {
      const dependency = byKey.get(dependencyKey);
      if (dependency && visit(dependency, nextPath)) return true;
    }
    return false;
  };
  return visit(provider, new Set());
};

const providerSensitivity = (
  provider: GraphProvider,
  requirements: readonly GraphRequirement[],
): Sensitivity | undefined =>
  provider.sensitivity ??
  requirements.find((requirement) => requirement.key === provider.providesKey)?.sensitivity;

const providerPlacementDiagnostics = (
  provider: GraphProvider,
  requirements: readonly GraphRequirement[],
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const sensitivity = providerSensitivity(provider, requirements);

  for (const location of provider.locations) {
    if (isSensitive(sensitivity) && !location.sensitiveSafe) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "placement:secret-client-readable",
          message: `Provider "${provider.name}" exposes ${sensitivity} data through "${location.name}"`,
          suggestion:
            "Move the provider to sensitive-safe server storage or add an explicit safe projection.",
        }),
      );
    }

    if (sensitivity === "server_only" && location.clientReadable) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "placement:server-only-client-provider",
          message: `Provider "${provider.name}" places server-only data in client-readable storage "${location.name}"`,
          suggestion: "Keep this provider server-side or expose only a safe projected value.",
        }),
      );
    }
  }

  if (
    provider.lifetime !== undefined &&
    provider.sourceLifetimeCeiling !== undefined &&
    lifetimeRank[provider.lifetime] > lifetimeRank[provider.sourceLifetimeCeiling]
  ) {
    diagnostics.push(
      diagnostic({
        severity: "error",
        code: "placement:lifetime-escape",
        message: `Provider "${provider.name}" has ${provider.lifetime} lifetime from ${provider.sourceKind} source with ${provider.sourceLifetimeCeiling} lifetime`,
        suggestion:
          "Shorten the provider lifetime or change the source to one with a compatible lifetime.",
      }),
    );
  }

  if (
    provider.lifetime === "request" &&
    provider.locations.some(
      (location) => location.role === "storage" && location.locationKind === "shared.cache",
    )
  ) {
    diagnostics.push(
      diagnostic({
        severity: "warning",
        code: "placement:request-value-global-cache",
        message: `Provider "${provider.name}" has request lifetime but stores in global cache`,
        suggestion: "Use request-scoped storage or extend lifetime to match cache duration.",
      }),
    );
  }

  if (
    provider.sensitivity === "regulated" &&
    provider.locations.some((location) => location.role === "storage" && location.clientReadable)
  ) {
    diagnostics.push(
      diagnostic({
        severity: "error",
        code: "placement:regulated-devtools-exposure",
        message: `Provider "${provider.name}" is regulated but exposed to client-readable storage`,
        suggestion: "Keep regulated data server-side or use a safe projection.",
      }),
    );
  }

  return diagnostics;
};

const diagnosticsFromGraph = (input: {
  readonly requirements: readonly GraphRequirement[];
  readonly providers: readonly GraphProvider[];
  readonly missing: readonly GraphRequirement[];
  readonly ambiguous: readonly GraphRequirement[];
}): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const requirement of input.missing) {
    diagnostics.push(
      diagnostic({
        severity: "error",
        code: "requirement:missing-provider",
        message: `Requirement "${requirement.name}" has no matching provider`,
        suggestion: "Add a provider for this requirement or remove the requirement.",
      }),
    );
  }
  for (const requirement of input.ambiguous) {
    const matches = input.providers.filter((provider) => provider.providesKey === requirement.key);
    diagnostics.push(
      diagnostic({
        severity: "error",
        code: "requirement:ambiguous-provider",
        message: `Requirement "${requirement.name}" has ${matches.length} matching providers`,
        suggestion: "Constrain provider scope or remove duplicate providers.",
      }),
    );
  }
  for (const provider of input.providers) {
    diagnostics.push(...providerPlacementDiagnostics(provider, input.requirements));
    if (hasProviderCycle(provider, input.providers)) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "requirement:provider-cycle",
          message: `Provider "${provider.name}" participates in a provider dependency cycle`,
          suggestion:
            "Break the cycle by introducing an independent provider or narrowing provider requirements.",
        }),
      );
    }
  }
  return diagnostics;
};

export const deriveRequirementSatisfactionPlanFromGraph = (
  graph: KernelGraph,
): GraphRequirementSatisfactionPlan => {
  const requirements = graphRequirements(graph);
  const providers = graphProviders(graph);
  const bindings: GraphRequirementBinding[] = [];
  const missing: GraphRequirement[] = [];
  const ambiguous: GraphRequirement[] = [];

  for (const requirement of requirements) {
    const matches = providers.filter((provider) => provider.providesKey === requirement.key);
    if (matches.length === 0) {
      missing.push(requirement);
      continue;
    }
    if (matches.length > 1) {
      ambiguous.push(requirement);
      continue;
    }
    bindings.push({ requirement, provider: matches[0]!, confidence: "exact" });
  }

  const diagnostics = diagnosticsFromGraph({
    requirements,
    providers,
    missing,
    ambiguous,
  });

  return {
    kind: "graph_requirement_satisfaction_plan",
    requirements,
    providers,
    bindings,
    missing,
    ambiguous,
    diagnostics,
  };
};

export const checkRequirementsOnGraph = (graph: KernelGraph): readonly Diagnostic[] =>
  deriveRequirementSatisfactionPlanFromGraph(graph).diagnostics;
