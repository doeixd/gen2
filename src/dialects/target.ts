/* @__NO_SIDE_EFFECTS__ */
/**
 * Target dialect — R12 dialect for generation targets and their capabilities.
 *
 * Targets bridge domain models to concrete artifacts (Postgres tables,
 * React components, Effect programs). The target dialect makes target
 * capabilities explicit as typed traits so lowering passes can check
 * compatibility between required and supported features.
 *
 * See docs/revision/revised_phases.md §R12.
 */

import { defineDialect, dialectId } from "../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../kernel/ods.ts";
import { defineTrait } from "../kernel/symbol.ts";

// === Target capability traits ===============================================

export const targetCapabilityTraits = {
  /** Target supports SQL generation (tables, columns, indexes). */
  CAPABILITY_SQL: defineTrait<true>("trait.target.sql", "SQL-capable target", "node"),
  /** Target supports Row-Level Security policies. */
  CAPABILITY_RLS: defineTrait<true>("trait.target.rls", "RLS-capable target", "node"),
  /** Target supports multi-statement transactions. */
  CAPABILITY_TRANSACTIONS: defineTrait<true>(
    "trait.target.transactions",
    "Transaction-capable target",
    "node",
  ),
  /** Target supports JSONB / document storage. */
  CAPABILITY_JSONB: defineTrait<true>("trait.target.jsonb", "JSONB-capable target", "node"),
  /** Target supports React component generation. */
  CAPABILITY_REACT_COMPONENTS: defineTrait<true>(
    "trait.target.reactComponents",
    "React-capable target",
    "node",
  ),
  /** Target supports Solid component generation. */
  CAPABILITY_SOLID_COMPONENTS: defineTrait<true>(
    "trait.target.solidComponents",
    "Solid-capable target",
    "node",
  ),
  /** Target supports Effect runtime interop. */
  CAPABILITY_EFFECT_RUNTIME: defineTrait<true>(
    "trait.target.effectRuntime",
    "Effect-capable target",
    "node",
  ),
  /** Target supports optimistic updates and offline replay. */
  CAPABILITY_OPTIMISTIC_OFFLINE: defineTrait<true>(
    "trait.target.optimisticOffline",
    "Optimistic-offline-capable target",
    "node",
  ),
  /** Target supports real-time streaming / WebSocket push. */
  CAPABILITY_REALTIME: defineTrait<true>(
    "trait.target.realtime",
    "Realtime-capable target",
    "node",
  ),
  /** Target supports cron / scheduled job execution. */
  CAPABILITY_CRON: defineTrait<true>("trait.target.cron", "Cron-capable target", "node"),
} as const;

// === Node kinds =============================================================

/** A generation target (postgres, react, solid, effect, etc.). */
export const TARGET_NODE_KIND = defineNodeKind({
  id: "node.kind.target",
  dialect: "dialect.target",
  traits: Object.values(targetCapabilityTraits),
  metadata: { title: "Target" },
});

/** A target capability node representing a single supported feature. */
export const TARGET_CAPABILITY_NODE_KIND = defineNodeKind({
  id: "node.kind.targetCapability",
  dialect: "dialect.target",
  traits: Object.values(targetCapabilityTraits),
  metadata: { title: "Target capability" },
});

/** A concrete input supplied to a generation target. */
export const TARGET_INPUT_NODE_KIND = defineNodeKind({
  id: "node.kind.targetInput",
  dialect: "dialect.target",
  traits: [],
  metadata: { title: "Target input" },
});

/** Postgres-specific target node. */
export const POSTGRES_TARGET_NODE_KIND = defineNodeKind({
  id: "node.kind.postgresTarget",
  dialect: "dialect.target",
  traits: [
    targetCapabilityTraits.CAPABILITY_SQL,
    targetCapabilityTraits.CAPABILITY_RLS,
    targetCapabilityTraits.CAPABILITY_TRANSACTIONS,
    targetCapabilityTraits.CAPABILITY_JSONB,
  ],
  metadata: { title: "Postgres target" },
});

/** React-specific target node. */
export const REACT_TARGET_NODE_KIND = defineNodeKind({
  id: "node.kind.reactTarget",
  dialect: "dialect.target",
  traits: [
    targetCapabilityTraits.CAPABILITY_REACT_COMPONENTS,
    targetCapabilityTraits.CAPABILITY_OPTIMISTIC_OFFLINE,
    targetCapabilityTraits.CAPABILITY_REALTIME,
  ],
  metadata: { title: "React target" },
});

/** Solid-specific target node. */
export const SOLID_TARGET_NODE_KIND = defineNodeKind({
  id: "node.kind.solidTarget",
  dialect: "dialect.target",
  traits: [
    targetCapabilityTraits.CAPABILITY_SOLID_COMPONENTS,
    targetCapabilityTraits.CAPABILITY_OPTIMISTIC_OFFLINE,
    targetCapabilityTraits.CAPABILITY_REALTIME,
  ],
  metadata: { title: "Solid target" },
});

/** Effect-specific target node. */
export const EFFECT_TARGET_NODE_KIND = defineNodeKind({
  id: "node.kind.effectTarget",
  dialect: "dialect.target",
  traits: [
    targetCapabilityTraits.CAPABILITY_EFFECT_RUNTIME,
    targetCapabilityTraits.CAPABILITY_TRANSACTIONS,
    targetCapabilityTraits.CAPABILITY_CRON,
  ],
  metadata: { title: "Effect target" },
});

// === Edge kinds =============================================================

/** Target supports capability edge: target → capability it supports. */
export const TARGET_SUPPORTS_CAPABILITY_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.targetSupportsCapability",
  dialect: "dialect.target",
  endpoints: [
    defineEndpointRole("target", {
      targetKinds: [
        TARGET_NODE_KIND,
        POSTGRES_TARGET_NODE_KIND,
        REACT_TARGET_NODE_KIND,
        SOLID_TARGET_NODE_KIND,
        EFFECT_TARGET_NODE_KIND,
      ],
    }),
    defineEndpointRole("capability", { targetKinds: [TARGET_CAPABILITY_NODE_KIND] }),
  ],
  metadata: { title: "Target supports capability" },
});

/** Target lowers from domain node edge: target → domain node it can lower. */
export const TARGET_LOWERS_FROM_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.targetLowersFrom",
  dialect: "dialect.target",
  endpoints: [
    defineEndpointRole("target", {
      targetKinds: [
        TARGET_NODE_KIND,
        POSTGRES_TARGET_NODE_KIND,
        REACT_TARGET_NODE_KIND,
        SOLID_TARGET_NODE_KIND,
        EFFECT_TARGET_NODE_KIND,
      ],
    }),
    defineEndpointRole("source", {}),
  ],
  metadata: { title: "Target lowers from" },
});

/** Target input has passed target compatibility and legalization checks. */
export const TARGET_LEGALIZES_INPUT_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.targetLegalizesInput",
  dialect: "dialect.target",
  endpoints: [
    defineEndpointRole("target", {
      targetKinds: [
        TARGET_NODE_KIND,
        POSTGRES_TARGET_NODE_KIND,
        REACT_TARGET_NODE_KIND,
        SOLID_TARGET_NODE_KIND,
        EFFECT_TARGET_NODE_KIND,
      ],
    }),
    defineEndpointRole("input", { targetKinds: [TARGET_INPUT_NODE_KIND] }),
  ],
  metadata: { title: "Target legalizes input" },
});

// === Dialect definition =====================================================

export const TargetDialect = defineDialect({
  id: dialectId("dialect.target"),
  namespace: "target",
  label: "Target",
  nodeKinds: [
    TARGET_NODE_KIND,
    TARGET_CAPABILITY_NODE_KIND,
    TARGET_INPUT_NODE_KIND,
    POSTGRES_TARGET_NODE_KIND,
    REACT_TARGET_NODE_KIND,
    SOLID_TARGET_NODE_KIND,
    EFFECT_TARGET_NODE_KIND,
  ],
  edgeKinds: [
    TARGET_SUPPORTS_CAPABILITY_EDGE_KIND,
    TARGET_LOWERS_FROM_EDGE_KIND,
    TARGET_LEGALIZES_INPUT_EDGE_KIND,
  ],
  traits: Object.values(targetCapabilityTraits),
  passes: [],
  lowerings: [],
  metadata: {
    title: "Target Dialect",
    description: "Generation targets (Postgres, React, Solid, Effect) and their capability traits.",
  },
});
