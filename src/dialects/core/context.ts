/* @__NO_SIDE_EFFECTS__ */
/**
 * Context dialect — core dialect for typed context definitions and provisions.
 *
 * Contexts are typed runtime values (e.g. AuthSession, TenantContext) that
 * routes, components, and workflows declare they need. Provisions describe
 * which storage location satisfies a context.
 *
 * See docs/revision/revised_phases.md §R2.
 */

import { defineDialect, dialectId } from "../../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../../kernel/ods.ts";
import { defineTrait } from "../../kernel/symbol.ts";
import { STORAGE_LOCATION_NODE_KIND } from "./placement.ts";

export type ContextNodeCustom = {
  readonly semantic_type: string;
  readonly description?: string;
};

export type RequiresContextEdgeCustom = {
  readonly optional?: boolean;
};

// === Traits =================================================================

export const contextTraits = {
  /** Context is required at runtime; missing = error. */
  REQUIRED: defineTrait<true>("trait.context.required", "Required context", "node"),
  /** Context may be absent; consumers must handle missing. */
  OPTIONAL: defineTrait<true>("trait.context.optional", "Optional context", "node"),
  /** Context is scoped to a single request / interaction. */
  REQUEST_SCOPED: defineTrait<true>(
    "trait.context.requestScoped",
    "Request-scoped context",
    "node",
  ),
  /** Context survives across requests (session, localStorage, etc). */
  DURABLE: defineTrait<true>("trait.context.durable", "Durable context", "node"),
} as const;

// === Node kinds =============================================================

export const CONTEXT_NODE_KIND = defineNodeKind({
  id: "node.kind.context",
  dialect: "dialect.core.context",
  traits: Object.values(contextTraits),
  custom: undefined as unknown as ContextNodeCustom,
  metadata: { title: "Context" },
});

// === Edge kinds =============================================================

/** Provision edge: context → storage location that provides it. */
export const PROVISION_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.provision",
  dialect: "dialect.core.context",
  endpoints: [
    defineEndpointRole("context", { targetKinds: [CONTEXT_NODE_KIND] }),
    defineEndpointRole("location", { targetKinds: [STORAGE_LOCATION_NODE_KIND] }),
  ],
  metadata: { title: "Provision" },
});

/** Requirement edge: route/component → context it requires. */
export const REQUIRES_CONTEXT_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.requiresContext",
  dialect: "dialect.core.context",
  endpoints: [
    defineEndpointRole("consumer", {}),
    defineEndpointRole("context", { targetKinds: [CONTEXT_NODE_KIND] }),
  ],
  custom: undefined as unknown as RequiresContextEdgeCustom,
  metadata: { title: "Requires context" },
});

// === Dialect definition =====================================================

export const ContextDialect = defineDialect({
  id: dialectId("dialect.core.context"),
  namespace: "core.context",
  label: "Core Context",
  nodeKinds: [CONTEXT_NODE_KIND],
  edgeKinds: [PROVISION_EDGE_KIND, REQUIRES_CONTEXT_EDGE_KIND],
  traits: Object.values(contextTraits),
  passes: [],
  lowerings: [],
  metadata: {
    title: "Core Context Dialect",
    description: "Typed runtime context definitions and provisions.",
  },
});
