/* @__NO_SIDE_EFFECTS__ */
/**
 * Typed Context and Dependency Injection IR.
 *
 * Contexts represent typed environmental or session state (e.g. AuthSession,
 * TenantContext). Routes, components, and workflows declare requirements and
 * provisions so the lifecycle can validate that every required context is
 * satisfied by some provider.
 */

import type { SemanticType } from "../types/index.ts";
import type { StorageLocation } from "../storage/locations.ts";

// --- Context IR ------------------------------------------------------------

export interface ContextDef<T = unknown> {
  readonly kind: "context_def";
  readonly name: string;
  readonly semantic_type: SemanticType<T>;
  readonly description?: string;
  readonly _ts?: T;
}

export interface ContextProvision<T = unknown> {
  readonly kind: "context_provision";
  readonly context: ContextDef<T>;
  readonly from: StorageLocation;
  readonly _ts?: T;
}

export interface ContextRequirement<T = unknown> {
  readonly kind: "context_requirement";
  readonly context: ContextDef<T>;
  readonly optional: boolean;
  readonly _ts?: T;
}

// --- Constructors ----------------------------------------------------------

export const defineContext = <T>(input: {
  readonly name: string;
  readonly semantic_type: SemanticType<T>;
  readonly description?: string;
}): ContextDef<T> => ({
  kind: "context_def",
  name: input.name,
  semantic_type: input.semantic_type,
  description: input.description,
});

export const provideContext = <T>(input: {
  readonly context: ContextDef<T>;
  readonly from: StorageLocation;
}): ContextProvision<T> => ({
  kind: "context_provision",
  context: input.context,
  from: input.from,
});

export const requireContext = <T>(input: {
  readonly context: ContextDef<T>;
  readonly optional?: boolean;
}): ContextRequirement<T> => ({
  kind: "context_requirement",
  context: input.context,
  optional: input.optional ?? false,
});
