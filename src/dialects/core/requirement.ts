/* @__NO_SIDE_EFFECTS__ */
/**
 * Requirement dialect — core dialect for abstract requirements.
 *
 * Requirements are capabilities that functions, resources, routes, or forms
 * declare they need (e.g. EmailService, PaymentGateway). Providers satisfy
 * them. The requirement dialect makes these explicit in the graph.
 *
 * See docs/revision/revised_phases.md §R2.
 */

import { defineDialect, dialectId } from "../../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../../kernel/ods.ts";
import { defineTrait } from "../../kernel/symbol.ts";
import type { Sensitivity } from "../../requirements/requirements.ts";

export type RequirementNodeCustom = {
  readonly value_type: string;
  readonly sensitivity?: Sensitivity;
};

// === Traits =================================================================

export const requirementTraits = {
  /** The requirement must be satisfied; missing = error. */
  MANDATORY: defineTrait<true>("trait.requirement.mandatory", "Mandatory requirement", "node"),
  /** The requirement may be missing; the app degrades gracefully. */
  OPTIONAL: defineTrait<true>("trait.requirement.optional", "Optional requirement", "node"),
  /** The requirement is satisfied by a provider in the same compilation unit. */
  LOCAL: defineTrait<true>("trait.requirement.local", "Local requirement", "node"),
  /** The requirement is satisfied by an external service or API. */
  EXTERNAL: defineTrait<true>("trait.requirement.external", "External requirement", "node"),
} as const;

// === Node kinds =============================================================

export const REQUIREMENT_NODE_KIND = defineNodeKind({
  id: "node.kind.requirement",
  dialect: "dialect.core.requirement",
  traits: Object.values(requirementTraits),
  custom: undefined as unknown as RequirementNodeCustom,
  metadata: { title: "Requirement" },
});

// === Edge kinds =============================================================

/** Declares edge: consumer → requirement. */
export const DECLARES_REQUIREMENT_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.declaresRequirement",
  dialect: "dialect.core.requirement",
  endpoints: [
    defineEndpointRole("consumer", {}),
    defineEndpointRole("requirement", { targetKinds: [REQUIREMENT_NODE_KIND] }),
  ],
  metadata: { title: "Declares requirement" },
});

// === Dialect definition =====================================================

export const RequirementDialect = defineDialect({
  id: dialectId("dialect.core.requirement"),
  namespace: "core.requirement",
  label: "Core Requirement",
  nodeKinds: [REQUIREMENT_NODE_KIND],
  edgeKinds: [DECLARES_REQUIREMENT_EDGE_KIND],
  traits: Object.values(requirementTraits),
  passes: [],
  lowerings: [],
  metadata: {
    title: "Core Requirement Dialect",
    description: "Abstract capability requirements declared by consumers.",
  },
});
