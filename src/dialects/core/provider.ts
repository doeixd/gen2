/* @__NO_SIDE_EFFECTS__ */
/**
 * Provider dialect — core dialect for requirement satisfaction.
 *
 * Providers describe how requirements, contexts, and services are satisfied.
 * They connect requirements to implementations (functions, external APIs,
 * storage locations, etc.).
 *
 * See docs/revision/revised_phases.md §R2.
 */

import { defineDialect, dialectId } from "../../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../../kernel/ods.ts";
import { defineTrait } from "../../kernel/symbol.ts";
import { REQUIREMENT_NODE_KIND } from "./requirement.ts";
import { CONTEXT_NODE_KIND } from "./context.ts";
import type {
  ProviderLifetime,
  ProviderSource,
  Sensitivity,
} from "../../requirements/requirements.ts";

export type ProviderNodeCustom = {
  readonly provides: string;
  readonly source_kind: ProviderSource["kind"];
  readonly source_lifetime_ceiling?: ProviderLifetime;
  readonly lifetime?: ProviderLifetime;
  readonly sensitivity?: Sensitivity;
  readonly client_projection?: {
    readonly source_name: string;
    readonly projected_type: string;
    readonly projected_sensitivity?: Sensitivity;
  };
};

// === Traits =================================================================

export const providerTraits = {
  /** Provider is implemented by a local function / module. */
  LOCAL_IMPL: defineTrait<true>("trait.provider.localImpl", "Local implementation", "node"),
  /** Provider delegates to an external service or API. */
  EXTERNAL_IMPL: defineTrait<true>(
    "trait.provider.externalImpl",
    "External implementation",
    "node",
  ),
  /** Provider is a composite of other providers. */
  COMPOSITE: defineTrait<true>("trait.provider.composite", "Composite provider", "node"),
  /** Provider is auto-generated from schema / entity definitions. */
  DERIVED: defineTrait<true>("trait.provider.derived", "Derived provider", "node"),
} as const;

// === Node kinds =============================================================

export const PROVIDER_NODE_KIND = defineNodeKind({
  id: "node.kind.provider",
  dialect: "dialect.core.provider",
  traits: Object.values(providerTraits),
  custom: undefined as unknown as ProviderNodeCustom,
  metadata: { title: "Provider" },
});

/** Service is a special provider with named methods. */
export const SERVICE_NODE_KIND = defineNodeKind({
  id: "node.kind.service",
  dialect: "dialect.core.provider",
  traits: [providerTraits.LOCAL_IMPL, providerTraits.EXTERNAL_IMPL],
  metadata: { title: "Service" },
});

// === Edge kinds =============================================================

/** Satisfies edge: provider → requirement it satisfies. */
export const SATISFIES_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.satisfies",
  dialect: "dialect.core.provider",
  endpoints: [
    defineEndpointRole("provider", { targetKinds: [PROVIDER_NODE_KIND, SERVICE_NODE_KIND] }),
    defineEndpointRole("requirement", {
      targetKinds: [REQUIREMENT_NODE_KIND, CONTEXT_NODE_KIND, SERVICE_NODE_KIND],
    }),
  ],
  metadata: { title: "Satisfies" },
});

/** Depends-on edge: provider → provider it depends on. */
export const DEPENDS_ON_PROVIDER_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.dependsOnProvider",
  dialect: "dialect.core.provider",
  endpoints: [
    defineEndpointRole("dependent", { targetKinds: [PROVIDER_NODE_KIND, SERVICE_NODE_KIND] }),
    defineEndpointRole("dependency", { targetKinds: [PROVIDER_NODE_KIND, SERVICE_NODE_KIND] }),
  ],
  metadata: { title: "Depends on provider" },
});

// === Dialect definition =====================================================

export const ProviderDialect = defineDialect({
  id: dialectId("dialect.core.provider"),
  namespace: "core.provider",
  label: "Core Provider",
  nodeKinds: [PROVIDER_NODE_KIND, SERVICE_NODE_KIND],
  edgeKinds: [SATISFIES_EDGE_KIND, DEPENDS_ON_PROVIDER_EDGE_KIND],
  traits: Object.values(providerTraits),
  passes: [],
  lowerings: [],
  metadata: {
    title: "Core Provider Dialect",
    description: "Requirement satisfaction and service/provider definitions.",
  },
});
