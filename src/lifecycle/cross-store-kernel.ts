import { CROSS_STORE_PLANNER_NODE_KIND } from "../dialects/callable.ts";
import {
  defineNode,
  graphFragment,
  graphNode,
  type AnyGraphStep,
  type KernelNode,
} from "../kernel/index.ts";
import type { CrossStorePlanner } from "./cross-store-legacy.ts";

export type CrossStorePlannerNodeCustom = {
  readonly planner: CrossStorePlanner;
};

const nodeKindFromDef = (def: {
  readonly id: string;
  readonly metadata?: { readonly title?: unknown };
}) => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

const plannerNodeId = (planner: CrossStorePlanner): string =>
  `node:crossStorePlanner:${planner.name}`;

export const crossStorePlannerToKernelNode = (planner: CrossStorePlanner): KernelNode =>
  defineNode(nodeKindFromDef(CROSS_STORE_PLANNER_NODE_KIND), plannerNodeId(planner), {
    name: planner.name,
    metadata: {
      title: planner.name,
      custom: { planner } satisfies CrossStorePlannerNodeCustom,
    },
  });

export const crossStorePlannerToGraphFragment = (planner: CrossStorePlanner): AnyGraphStep =>
  graphFragment(graphNode(crossStorePlannerToKernelNode(planner)));

export const getCrossStorePlannersFromGraph = (graph: {
  nodes: ReadonlyMap<string, KernelNode>;
}): CrossStorePlanner[] => {
  const planners: CrossStorePlanner[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== CROSS_STORE_PLANNER_NODE_KIND.id) continue;
    const custom = node.metadata?.custom as CrossStorePlannerNodeCustom | undefined;
    if (custom?.planner) planners.push(custom.planner);
  }
  return planners;
};
