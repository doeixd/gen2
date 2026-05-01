/* @__NO_SIDE_EFFECTS__ */
/**
 * Devtools target fixture: emits graph JSON for visualizing requirements,
 * providers, storage, hydration, and reactive edges.
 */

import type { GenContext } from "../core/index.ts";

export interface DevtoolsNode {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly metadata?: Record<string, unknown>;
}

export interface DevtoolsEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label: string;
}

export interface DevtoolsGraph {
  readonly kind: "devtools_graph";
  readonly nodes: readonly DevtoolsNode[];
  readonly edges: readonly DevtoolsEdge[];
}

export const generateDevtoolsGraph = (ctx: GenContext): DevtoolsGraph => {
  const nodes: DevtoolsNode[] = [];
  const edges: DevtoolsEdge[] = [];
  let nodeId = 0;
  const nextId = (prefix: string): string => `${prefix}_${++nodeId}`;

  for (const req of ctx.requirements) {
    const reqId = nextId("req");
    nodes.push({ id: reqId, kind: "requirement", label: req.name });

    const providers = ctx.providers.filter((p) => p.provides.name === req.name);
    for (const provider of providers) {
      const provId = nextId("prov");
      nodes.push({
        id: provId,
        kind: "provider",
        label: provider.name,
        metadata: { source_kind: provider.source.kind },
      });
      edges.push({
        id: nextId("edge"),
        source: provId,
        target: reqId,
        label: "satisfies",
      });
    }
  }

  for (const state of ctx.state_resources) {
    const stateId = nextId("state");
    nodes.push({
      id: stateId,
      kind: "state_resource",
      label: state.name,
      metadata: { storage: state.storage.name, hydrate: state.hydrate },
    });
  }

  for (const plan of ctx.boundary_plans) {
    const planId = nextId("boundary");
    nodes.push({
      id: planId,
      kind: "boundary_call_plan",
      label: plan.name,
      metadata: { transport: plan.transport.transport },
    });
  }

  for (const resource of ctx.reactive_resources) {
    const resId = nextId("resource");
    nodes.push({
      id: resId,
      kind: "reactive_resource",
      label: resource.name,
    });
  }

  return {
    kind: "devtools_graph",
    nodes,
    edges,
  };
};
