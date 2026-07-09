/* @__NO_SIDE_EFFECTS__ */
/**
 * Type/Operation dialect — R3 core dialect for semantic types, operations, and laws.
 *
 * Operations are reusable semantic units that form the basis of expressions.
 * They carry type-level information, laws, and properties that passes query
 * for CRUD, optimistic, offline, merge, and IVM planning.
 *
 * See docs/revision/revised_phases.md §R3.
 */

import { defineDialect, dialectId } from "../../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../../kernel/ods.ts";
import { defineTrait } from "../../kernel/symbol.ts";

// === Operation property traits ==============================================

export const operationTraits = {
  PURE: defineTrait<true>("trait.operation.pure", "Pure operation", "node"),
  DETERMINISTIC: defineTrait<true>(
    "trait.operation.deterministic",
    "Deterministic operation",
    "node",
  ),
  TOTAL: defineTrait<true>("trait.operation.total", "Total operation", "node"),
  PARTIAL: defineTrait<true>("trait.operation.partial", "Partial operation", "node"),
  EFFECTFUL: defineTrait<true>("trait.operation.effectful", "Effectful operation", "node"),
  CLIENT_SAFE: defineTrait<true>("trait.operation.clientSafe", "Client-safe operation", "node"),
  SERVER_ONLY: defineTrait<true>("trait.operation.serverOnly", "Server-only operation", "node"),
  SQL_LOWERABLE: defineTrait<true>(
    "trait.operation.sqlLowerable",
    "SQL-lowerable operation",
    "node",
  ),
  PATCHABLE: defineTrait<true>("trait.operation.patchable", "Patchable operation", "node"),
  INVERTIBLE: defineTrait<true>("trait.operation.invertible", "Invertible operation", "node"),
  INCREMENTALIZABLE: defineTrait<true>(
    "trait.operation.incrementalizable",
    "Incrementalizable operation",
    "node",
  ),
  RETRY_SAFE: defineTrait<true>("trait.operation.retrySafe", "Retry-safe operation", "node"),
  OFFLINE_REPLAY_SAFE: defineTrait<true>(
    "trait.operation.offlineReplaySafe",
    "Offline-replay-safe operation",
    "node",
  ),
} as const;

// === Law traits =============================================================

export const lawTraits = {
  ASSOCIATIVE: defineTrait<true>("trait.law.associative", "Associative", "node"),
  COMMUTATIVE: defineTrait<true>("trait.law.commutative", "Commutative", "node"),
  IDEMPOTENT: defineTrait<true>("trait.law.idempotent", "Idempotent", "node"),
  IDENTITY: defineTrait<{ readonly identityExprId: string }>(
    "trait.law.identity",
    "Identity",
    "node",
  ),
  INVERSE: defineTrait<{ readonly inverseOpId: string }>("trait.law.inverse", "Inverse", "node"),
  DISTRIBUTIVE: defineTrait<true>("trait.law.distributive", "Distributive", "node"),
  MONOTONIC: defineTrait<true>("trait.law.monotonic", "Monotonic", "node"),
  ORDER_PRESERVING: defineTrait<true>("trait.law.orderPreserving", "Order-preserving", "node"),
  CONFLUENT: defineTrait<true>("trait.law.confluent", "Confluent", "node"),
  ROLLBACK_SAFE: defineTrait<true>("trait.law.rollbackSafe", "Rollback-safe", "node"),
} as const;

// === Node kinds =============================================================

export const TYPE_NODE_KIND = defineNodeKind({
  id: "node.kind.type",
  dialect: "dialect.core.typeOperation",
  traits: [],
  metadata: { title: "Type" },
});

export const OPERATION_DEF_NODE_KIND = defineNodeKind({
  id: "node.kind.operationDef",
  dialect: "dialect.core.typeOperation",
  traits: Object.values(operationTraits),
  metadata: { title: "Operation definition" },
});

export const VARIABLE_DECL_NODE_KIND = defineNodeKind({
  id: "node.kind.varDecl",
  dialect: "dialect.core.typeOperation",
  traits: [],
  metadata: { title: "Variable declaration" },
});

// === Edge kinds =============================================================

export const HAS_TYPE_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.hasType",
  dialect: "dialect.core.typeOperation",
  endpoints: [
    defineEndpointRole("owner", {}),
    defineEndpointRole("type", { targetKinds: [TYPE_NODE_KIND] }),
  ],
  metadata: { title: "Has type" },
});

export const HAS_INPUT_TYPE_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.hasInputType",
  dialect: "dialect.core.typeOperation",
  endpoints: [
    defineEndpointRole("operation", { targetKinds: [OPERATION_DEF_NODE_KIND] }),
    defineEndpointRole("input", { targetKinds: [TYPE_NODE_KIND] }),
  ],
  metadata: { title: "Has input type" },
});

export const HAS_OUTPUT_TYPE_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.hasOutputType",
  dialect: "dialect.core.typeOperation",
  endpoints: [
    defineEndpointRole("operation", { targetKinds: [OPERATION_DEF_NODE_KIND] }),
    defineEndpointRole("output", { targetKinds: [TYPE_NODE_KIND] }),
  ],
  metadata: { title: "Has output type" },
});

export const TYPE_SUPPORTS_OPERATION_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.typeSupportsOperation",
  dialect: "dialect.core.typeOperation",
  endpoints: [
    defineEndpointRole("type", { targetKinds: [TYPE_NODE_KIND] }),
    defineEndpointRole("operation", { targetKinds: [OPERATION_DEF_NODE_KIND] }),
  ],
  metadata: { title: "Type supports operation" },
});

export const OPERATION_READS_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.operationReads",
  dialect: "dialect.core.typeOperation",
  endpoints: [
    defineEndpointRole("operation", { targetKinds: [OPERATION_DEF_NODE_KIND] }),
    defineEndpointRole("read", {}),
  ],
  metadata: { title: "Operation reads" },
});

export const OPERATION_WRITES_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.operationWrites",
  dialect: "dialect.core.typeOperation",
  endpoints: [
    defineEndpointRole("operation", { targetKinds: [OPERATION_DEF_NODE_KIND] }),
    defineEndpointRole("write", {}),
  ],
  metadata: { title: "Operation writes" },
});

export const OPERATION_PRODUCES_PATCH_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.operationProducesPatch",
  dialect: "dialect.core.typeOperation",
  endpoints: [
    defineEndpointRole("operation", { targetKinds: [OPERATION_DEF_NODE_KIND] }),
    defineEndpointRole("patch", {}),
  ],
  metadata: { title: "Operation produces patch" },
});

export const OPERATION_INVERSE_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.operationInverse",
  dialect: "dialect.core.typeOperation",
  endpoints: [
    defineEndpointRole("operation", { targetKinds: [OPERATION_DEF_NODE_KIND] }),
    defineEndpointRole("inverse", { targetKinds: [OPERATION_DEF_NODE_KIND] }),
  ],
  metadata: { title: "Operation inverse" },
});

export const OPERATION_LOWERS_TO_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.operationLowersTo",
  dialect: "dialect.core.typeOperation",
  endpoints: [
    defineEndpointRole("from", { targetKinds: [OPERATION_DEF_NODE_KIND] }),
    defineEndpointRole("to", {}),
  ],
  metadata: { title: "Operation lowers to" },
});

export const ACTION_APPLIES_OPERATION_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.actionAppliesOperation",
  dialect: "dialect.core.typeOperation",
  endpoints: [
    defineEndpointRole("action", {}),
    defineEndpointRole("operation", { targetKinds: [OPERATION_DEF_NODE_KIND] }),
  ],
  metadata: { title: "Action applies operation" },
});

export const EXPR_USES_OPERATION_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.exprUsesOperation",
  dialect: "dialect.core.typeOperation",
  endpoints: [
    defineEndpointRole("expr", {}),
    defineEndpointRole("operation", { targetKinds: [OPERATION_DEF_NODE_KIND] }),
  ],
  metadata: { title: "Expression uses operation" },
});

// === Dialect definition =====================================================

export const TypeOperationDialect = defineDialect({
  id: dialectId("dialect.core.typeOperation"),
  namespace: "core.typeOperation",
  label: "Core Type/Operation",
  nodeKinds: [TYPE_NODE_KIND, OPERATION_DEF_NODE_KIND, VARIABLE_DECL_NODE_KIND],
  edgeKinds: [
    HAS_TYPE_EDGE_KIND,
    HAS_INPUT_TYPE_EDGE_KIND,
    HAS_OUTPUT_TYPE_EDGE_KIND,
    TYPE_SUPPORTS_OPERATION_EDGE_KIND,
    OPERATION_READS_EDGE_KIND,
    OPERATION_WRITES_EDGE_KIND,
    OPERATION_PRODUCES_PATCH_EDGE_KIND,
    OPERATION_INVERSE_EDGE_KIND,
    OPERATION_LOWERS_TO_EDGE_KIND,
    ACTION_APPLIES_OPERATION_EDGE_KIND,
    EXPR_USES_OPERATION_EDGE_KIND,
  ],
  traits: [...Object.values(operationTraits), ...Object.values(lawTraits)],
  passes: [],
  lowerings: [],
  metadata: {
    title: "Core Type/Operation Dialect",
    description: "Semantic types, operations, laws, and operation relationships.",
  },
});
