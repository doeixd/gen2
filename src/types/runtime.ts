/* @__NO_SIDE_EFFECTS__ */
/**
 * Runtimes describe execution contexts: postgres, node20, edge, browser, bun, etc.
 * Each runtime declares which capabilities it supports and which named operations
 * are available. Functions and queries assert their requirements against this set.
 *
 * See spec/types.allium :: entity Runtime.
 */

import type { CapabilityKind } from "./operation.ts";

/**
 * Describes an execution context with supported capabilities and operations.
 *
 * Runtimes are used by the query planner and codegen to decide where an
 * expression can safely execute and which operation implementations to select.
 */
export interface Runtime {
  /** Runtime name (e.g. "postgres", "node20", "edge", "browser"). */
  readonly name: string;
  /**
   * Capability identifiers the runtime supports. CapabilityKind is the canonical
   * vocabulary, but plugins may register custom ones (string literal type allows
   * arbitrary values).
   */
  readonly capabilities: readonly CapabilityKind[];
  /** Named operations the runtime provides implementations for. */
  readonly supported_operations: readonly string[];
}

/**
 * Creates a Runtime record.
 *
 * @param input - Runtime properties including name, capabilities, and supported operations.
 * @returns A Runtime record.
 *
 * @example
 * ```ts
 * const postgres = gen.types.defineRuntime({
 *   name: "postgres",
 *   capabilities: ["transactions", "joins", "aggregates"],
 *   supported_operations: ["eq", "add", "sum"],
 * });
 * ```
 */
export const defineRuntime = (input: {
  name: string;
  capabilities?: readonly CapabilityKind[];
  supported_operations?: readonly string[];
}): Runtime => ({
  name: input.name,
  capabilities: input.capabilities ?? [],
  supported_operations: input.supported_operations ?? [],
});
