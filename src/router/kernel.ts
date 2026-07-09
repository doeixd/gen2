import type { AppRoute } from "./router.ts";
import { APP_ROUTE_NODE_KIND } from "../dialects/ui.ts";
import {
  defineNode,
  graphFragment,
  graphNode,
  type AnyGraphStep,
  type KernelNode,
} from "../kernel/index.ts";

export type AppRouteNodeCustom = {
  readonly route: AppRoute;
};

const nodeKindFromDef = (def: {
  readonly id: string;
  readonly metadata?: { readonly title?: unknown };
}) => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

const appRouteNodeId = (route: AppRoute): string => `node:appRoute:${route.path}`;

export const appRouteToKernelNode = (route: AppRoute): KernelNode =>
  defineNode(nodeKindFromDef(APP_ROUTE_NODE_KIND), appRouteNodeId(route), {
    name: route.path,
    metadata: {
      title: route.path,
      custom: { route } satisfies AppRouteNodeCustom,
    },
  });

export const appRouteToGraphFragment = (route: AppRoute): AnyGraphStep =>
  graphFragment(graphNode(appRouteToKernelNode(route)));

export const getAppRoutesFromGraph = (graph: {
  nodes: ReadonlyMap<string, KernelNode>;
}): AppRoute[] => {
  const routes: AppRoute[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== APP_ROUTE_NODE_KIND.id) continue;
    const custom = node.metadata?.custom as AppRouteNodeCustom | undefined;
    if (custom?.route) routes.push(custom.route);
  }
  return routes;
};
