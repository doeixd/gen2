/* @__NO_SIDE_EFFECTS__ */
/**
 * Reactivity dialect — R7 dialect for reactivity, optimistic updates, offline, IVM.
 *
 * Reactivity derives from operation, read, write, key, and rule edges.
 * Optimistic planning derives from operation patchability/invertibility.
 * Offline planning derives from idempotency/retry/replay traits.
 * IVM planning derives from read/write/delta/reducer protocols.
 *
 * See docs/revision/revised_phases.md §R7.
 */

import { defineDialect, dialectId } from "../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../kernel/ods.ts";
import { defineTrait } from "../kernel/symbol.ts";
import { ACTION_NODE_KIND } from "./callable.ts";
import { OPERATION_DEF_NODE_KIND } from "./core/type-operation.ts";

// === Reactivity traits ======================================================

export const reactivityTraits = {
  /** Resource is reactive and derives from queries/keys. */
  REACTIVE: defineTrait<true>("trait.reactivity.reactive", "Reactive", "node"),
  /** Mutation produces optimistic patches before server confirmation. */
  OPTIMISTIC: defineTrait<true>("trait.reactivity.optimistic", "Optimistic", "node"),
  /** Operation is safe to replay after offline recovery. */
  OFFLINE_REPLAY_SAFE: defineTrait<true>(
    "trait.reactivity.offlineReplaySafe",
    "Offline-replay-safe",
    "node",
  ),
  /** Operation is idempotent under retries. */
  IDEMPOTENT: defineTrait<true>("trait.reactivity.idempotent", "Idempotent", "node"),
  /** Key family derives from entity or input shape. */
  DERIVED_KEY: defineTrait<true>("trait.reactivity.derivedKey", "Derived key", "node"),
  /** View is incrementally maintainable. */
  IVM: defineTrait<true>("trait.reactivity.ivm", "Incrementally maintainable view", "node"),
} as const;

// === Node kinds =============================================================

export const KEY_FAMILY_NODE_KIND = defineNodeKind({
  id: "node.kind.keyFamily",
  dialect: "dialect.reactivity",
  traits: [reactivityTraits.REACTIVE, reactivityTraits.DERIVED_KEY],
  metadata: { title: "Key family" },
});

export const REACTIVE_RESOURCE_NODE_KIND = defineNodeKind({
  id: "node.kind.reactiveResource",
  dialect: "dialect.reactivity",
  traits: [reactivityTraits.REACTIVE],
  metadata: { title: "Reactive resource" },
});

export const REACTIVE_MUTATION_NODE_KIND = defineNodeKind({
  id: "node.kind.reactiveMutation",
  dialect: "dialect.reactivity",
  traits: [reactivityTraits.REACTIVE, reactivityTraits.OPTIMISTIC],
  metadata: { title: "Reactive mutation" },
});

export const OPTIMISTIC_PLAN_NODE_KIND = defineNodeKind({
  id: "node.kind.optimisticPlan",
  dialect: "dialect.reactivity",
  traits: [reactivityTraits.OPTIMISTIC],
  metadata: { title: "Optimistic plan" },
});

export const OFFLINE_QUEUE_NODE_KIND = defineNodeKind({
  id: "node.kind.offlineQueue",
  dialect: "dialect.reactivity",
  traits: [reactivityTraits.OFFLINE_REPLAY_SAFE, reactivityTraits.IDEMPOTENT],
  metadata: { title: "Offline queue" },
});

export const MATERIALIZED_VIEW_NODE_KIND = defineNodeKind({
  id: "node.kind.materializedView",
  dialect: "dialect.reactivity",
  traits: [reactivityTraits.REACTIVE, reactivityTraits.IVM],
  metadata: { title: "Materialized view" },
});

export const IVM_PLAN_NODE_KIND = defineNodeKind({
  id: "node.kind.ivmPlan",
  dialect: "dialect.reactivity",
  traits: [reactivityTraits.IVM],
  metadata: { title: "IVM plan" },
});

// === Edge kinds =============================================================

/** Derives key edge: key family → source it derives from (query, entity, input). */
export const DERIVES_KEY_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.derivesKey",
  dialect: "dialect.reactivity",
  endpoints: [
    defineEndpointRole("key", { targetKinds: [KEY_FAMILY_NODE_KIND] }),
    defineEndpointRole("source", {}),
  ],
  metadata: { title: "Derives key" },
});

/** Invalidates key edge: action/mutation → key family it invalidates. */
export const INVALIDATES_KEY_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.invalidatesKey",
  dialect: "dialect.reactivity",
  endpoints: [
    defineEndpointRole("mutator", {
      targetKinds: [ACTION_NODE_KIND, REACTIVE_MUTATION_NODE_KIND],
    }),
    defineEndpointRole("key", { targetKinds: [KEY_FAMILY_NODE_KIND] }),
  ],
  metadata: { title: "Invalidates key" },
});

/** Patches resource edge: mutation → reactive resource it patches. */
export const PATCHES_RESOURCE_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.patchesResource",
  dialect: "dialect.reactivity",
  endpoints: [
    defineEndpointRole("mutation", {
      targetKinds: [REACTIVE_MUTATION_NODE_KIND, ACTION_NODE_KIND],
    }),
    defineEndpointRole("resource", { targetKinds: [REACTIVE_RESOURCE_NODE_KIND] }),
  ],
  metadata: { title: "Patches resource" },
});

/** Produces delta edge: operation → delta expression it produces. */
export const PRODUCES_DELTA_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.producesDelta",
  dialect: "dialect.reactivity",
  endpoints: [
    defineEndpointRole("operation", {
      targetKinds: [OPERATION_DEF_NODE_KIND, ACTION_NODE_KIND],
    }),
    defineEndpointRole("delta", {}),
  ],
  metadata: { title: "Produces delta" },
});

/** Maintains view edge: IVM plan → materialized view it maintains. */
export const MAINTAINS_VIEW_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.maintainsView",
  dialect: "dialect.reactivity",
  endpoints: [
    defineEndpointRole("plan", { targetKinds: [IVM_PLAN_NODE_KIND] }),
    defineEndpointRole("view", { targetKinds: [MATERIALIZED_VIEW_NODE_KIND] }),
  ],
  metadata: { title: "Maintains view" },
});

/** Uses combiner edge: reducer/aggregate → combiner operation it uses. */
export const USES_COMBINER_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.usesCombiner",
  dialect: "dialect.reactivity",
  endpoints: [
    defineEndpointRole("user", {}),
    defineEndpointRole("combiner", { targetKinds: [OPERATION_DEF_NODE_KIND] }),
  ],
  metadata: { title: "Uses combiner" },
});

// === Dialect definition =====================================================

export const ReactivityDialect = defineDialect({
  id: dialectId("dialect.reactivity"),
  namespace: "reactivity",
  label: "Reactivity",
  nodeKinds: [
    KEY_FAMILY_NODE_KIND,
    REACTIVE_RESOURCE_NODE_KIND,
    REACTIVE_MUTATION_NODE_KIND,
    OPTIMISTIC_PLAN_NODE_KIND,
    OFFLINE_QUEUE_NODE_KIND,
    MATERIALIZED_VIEW_NODE_KIND,
    IVM_PLAN_NODE_KIND,
  ],
  edgeKinds: [
    DERIVES_KEY_EDGE_KIND,
    INVALIDATES_KEY_EDGE_KIND,
    PATCHES_RESOURCE_EDGE_KIND,
    PRODUCES_DELTA_EDGE_KIND,
    MAINTAINS_VIEW_EDGE_KIND,
    USES_COMBINER_EDGE_KIND,
  ],
  traits: Object.values(reactivityTraits),
  passes: [],
  lowerings: [],
  metadata: {
    title: "Reactivity Dialect",
    description: "Reactive resources, optimistic plans, offline queues, and IVM.",
  },
});
