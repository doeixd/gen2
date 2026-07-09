import type { Getter, Mutator, Route } from "./api.ts";
import { API_ROUTE_NODE_KIND, GETTER_NODE_KIND, MUTATOR_NODE_KIND } from "../dialects/callable.ts";
import {
  defineNode,
  graphFragment,
  graphNode,
  type AnyGraphStep,
  type KernelNode,
} from "../kernel/index.ts";

export type ApiRouteNodeCustom = {
  readonly route: Route;
};

export type MutatorNodeCustom = {
  readonly mutator: Mutator;
};

export type GetterNodeCustom = {
  readonly getter: Getter;
};

const nodeKindFromDef = (def: {
  readonly id: string;
  readonly metadata?: { readonly title?: unknown };
}) => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

const routeNodeId = (route: Route): string =>
  `node:apiRoute:${route.method.kind}:${route.path.template}`;

const getterNodeId = (getter: Getter): string => `node:getter:${getter.name}`;

const mutatorNodeId = (mutator: Mutator): string => `node:mutator:${mutator.name}`;

export const routeToKernelNode = (route: Route): KernelNode =>
  defineNode(nodeKindFromDef(API_ROUTE_NODE_KIND), routeNodeId(route), {
    name: route.path.template,
    metadata: {
      title: `${route.method.kind} ${route.path.template}`,
      custom: { route } satisfies ApiRouteNodeCustom,
    },
  });

export const mutatorToKernelNode = (mutator: Mutator): KernelNode =>
  defineNode(nodeKindFromDef(MUTATOR_NODE_KIND), mutatorNodeId(mutator), {
    name: mutator.name,
    metadata: {
      title: mutator.name,
      custom: { mutator } satisfies MutatorNodeCustom,
    },
  });

export const getterToKernelNode = (getter: Getter): KernelNode =>
  defineNode(nodeKindFromDef(GETTER_NODE_KIND), getterNodeId(getter), {
    name: getter.name,
    metadata: {
      title: getter.name,
      custom: { getter } satisfies GetterNodeCustom,
    },
  });

export const routeToGraphFragment = (route: Route): AnyGraphStep =>
  graphFragment(graphNode(routeToKernelNode(route)));

export const getterToGraphFragment = (getter: Getter): AnyGraphStep =>
  graphFragment(graphNode(getterToKernelNode(getter)));

export const mutatorToGraphFragment = (mutator: Mutator): AnyGraphStep =>
  graphFragment(graphNode(mutatorToKernelNode(mutator)));

export const getRoutesFromGraph = (graph: { nodes: ReadonlyMap<string, KernelNode> }): Route[] => {
  const routes: Route[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== API_ROUTE_NODE_KIND.id) continue;
    const custom = node.metadata?.custom as ApiRouteNodeCustom | undefined;
    if (custom?.route) routes.push(custom.route);
  }
  return routes;
};

export const getMutatorsFromGraph = (graph: {
  nodes: ReadonlyMap<string, KernelNode>;
}): Mutator[] => {
  const mutators: Mutator[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== MUTATOR_NODE_KIND.id) continue;
    const custom = node.metadata?.custom as MutatorNodeCustom | undefined;
    if (custom?.mutator) mutators.push(custom.mutator);
  }
  return mutators;
};

export const getGettersFromGraph = (graph: {
  nodes: ReadonlyMap<string, KernelNode>;
}): Getter[] => {
  const getters: Getter[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== GETTER_NODE_KIND.id) continue;
    const custom = node.metadata?.custom as GetterNodeCustom | undefined;
    if (custom?.getter) getters.push(custom.getter);
  }
  return getters;
};
