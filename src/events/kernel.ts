/* @__NO_SIDE_EFFECTS__ */
/**
 * Adapter: Event domain → kernel graph IR.
 *
 * Bridges Event, EventEmission, Reducer, and Subscription into kernel
 * nodes and edges via typed `*NodeCustom` / `*EdgeCustom` payloads —
 * no `_bridge*` JS-object side channels (PLAN.md §0.5 #8).
 *
 * See docs/revised-kernel.md and docs/revision/revised_phases.md §R13 Group B.
 */

import type { Event, EventEmission, Reducer, Subscription } from "./events.ts";
import {
  defineNode,
  defineEdge,
  nodeKinds,
  edgeKinds,
  endpointRoles,
  graphFragment,
  graphNode,
  graphEdge,
} from "../kernel/index.ts";
import type { AnyGraphStep, KernelNode, KernelEdge } from "../kernel/index.ts";

/** Typed payload on an EVENT node. */
export type EventNodeCustom = { readonly event: Event };
/** Typed payload on a REDUCER node. */
export type ReducerNodeCustom = { readonly reducer: Reducer };
/** Typed payload on a SUBSCRIPTION node. */
export type SubscriptionNodeCustom = { readonly subscription: Subscription };
/** Typed payload on an EMITS edge. */
export type EmitsEdgeCustom = { readonly emission: EventEmission };

/** Build a kernel `Node(kind: EVENT)` for an event. */
export const eventToKernelNode = (event: Event): KernelNode =>
  defineNode(nodeKinds.EVENT, `event:${event.name}`, {
    name: event.name,
    metadata: { title: event.name, custom: { event } satisfies EventNodeCustom },
  });

export const eventToGraphFragment = (event: Event): AnyGraphStep =>
  graphFragment(graphNode(eventToKernelNode(event)));

/** Build a kernel `Edge(kind: EMITS)` for an event emission. */
export const eventEmissionToKernelEdge = (emission: EventEmission): KernelEdge =>
  defineEdge(
    edgeKinds.EMITS,
    `edge:emits:${emission.action.name}:${emission.event.name}`,
    [
      {
        role: endpointRoles.SOURCE,
        target: emission.action.ref ?? {
          kind: "FunctionRef",
          id: `action:${emission.action.name}`,
          owner: { kind: "Function", name: emission.action.name },
          name: emission.action.name,
          value_type: "action",
        },
        cardinality: "one",
      },
      {
        role: endpointRoles.TARGET,
        target: {
          kind: "EventRef",
          id: `event:${emission.event.name}`,
          owner: { kind: "Event", name: emission.event.name },
          name: emission.event.name,
          value_type: "event",
        },
        cardinality: "one",
      },
    ],
    {
      metadata: {
        title: `${emission.action.name} emits ${emission.event.name}`,
        custom: { emission } satisfies EmitsEdgeCustom,
      },
    },
  );

export const eventEmissionToGraphFragment = (emission: EventEmission): AnyGraphStep =>
  graphFragment(graphEdge(eventEmissionToKernelEdge(emission)));

/** Build a kernel `Node(kind: REDUCER)` for a reducer. */
export const reducerToKernelNode = (reducer: Reducer): KernelNode =>
  defineNode(nodeKinds.REDUCER, `reducer:${reducer.name}`, {
    name: reducer.name,
    metadata: { title: reducer.name, custom: { reducer } satisfies ReducerNodeCustom },
  });

export const reducerToGraphFragment = (reducer: Reducer): AnyGraphStep =>
  graphFragment(graphNode(reducerToKernelNode(reducer)));

/** Build a kernel `Node(kind: SUBSCRIPTION)` for a subscription. */
export const subscriptionToKernelNode = (subscription: Subscription): KernelNode =>
  defineNode(nodeKinds.SUBSCRIPTION, `subscription:${subscription.name}`, {
    name: subscription.name,
    metadata: {
      title: subscription.name,
      custom: { subscription } satisfies SubscriptionNodeCustom,
    },
  });

export const subscriptionToGraphFragment = (subscription: Subscription): AnyGraphStep =>
  graphFragment(graphNode(subscriptionToKernelNode(subscription)));

// === Graph-native extraction helpers =========================================

/** Extract all Event instances from the graph. */
export const getEventsFromGraph = (graph: { nodes: ReadonlyMap<string, KernelNode> }): Event[] => {
  const events: Event[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== nodeKinds.EVENT) continue;
    const custom = node.metadata?.custom as EventNodeCustom | undefined;
    if (custom?.event) events.push(custom.event);
  }
  return events;
};

/** Extract all EventEmission instances from the graph. */
export const getEventEmissionsFromGraph = (graph: {
  edges: ReadonlyMap<string, KernelEdge>;
}): EventEmission[] => {
  const emissions: EventEmission[] = [];
  for (const edge of graph.edges.values()) {
    if (edge.kind !== edgeKinds.EMITS) continue;
    const custom = edge.metadata?.custom as EmitsEdgeCustom | undefined;
    if (custom?.emission) emissions.push(custom.emission);
  }
  return emissions;
};

/** Extract all Reducer instances from the graph. */
export const getReducersFromGraph = (graph: {
  nodes: ReadonlyMap<string, KernelNode>;
}): Reducer[] => {
  const reducers: Reducer[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== nodeKinds.REDUCER) continue;
    const custom = node.metadata?.custom as ReducerNodeCustom | undefined;
    if (custom?.reducer) reducers.push(custom.reducer);
  }
  return reducers;
};

/** Extract all Subscription instances from the graph. */
export const getSubscriptionsFromGraph = (graph: {
  nodes: ReadonlyMap<string, KernelNode>;
}): Subscription[] => {
  const subscriptions: Subscription[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== nodeKinds.SUBSCRIPTION) continue;
    const custom = node.metadata?.custom as SubscriptionNodeCustom | undefined;
    if (custom?.subscription) subscriptions.push(custom.subscription);
  }
  return subscriptions;
};
