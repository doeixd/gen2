/* @__NO_SIDE_EFFECTS__ */
/**
 * Target IR. A Target is the bridge between domain models and concrete generated
 * artifacts (Drizzle schemas, Hono routes, OpenAPI documents, etc.). The kernel
 * owns Target instances; plugins contribute their behavior via TargetContribution.
 *
 * See spec/core.allium :: entity Target, entity TargetInput, surface TargetContract.
 */

import type { CheckResult, GenerateResult } from "./artifacts.ts";
import type { Capability } from "../types/operation.ts";

export type CapabilityTier =
  | "static"
  | "server_form"
  | "enhanced_client"
  | "reactive"
  | "optimistic_offline"
  | "realtime";

export interface EnhancementPlan {
  readonly kind: "enhancement_plan";
  readonly baseline: CapabilityTier;
  readonly preferred: CapabilityTier;
  readonly fallbacks: readonly CapabilityTier[];
  readonly required_capabilities: readonly Capability[];
}

/** A concrete input supplied to a target during generation. */
export interface TargetInput {
  readonly name: string;
  readonly kind: string;
  readonly value?: unknown;
}

/** A generation target that bridges domain models to concrete artifacts. */
export interface Target {
  readonly name: string;
  readonly plugin_id: string;
  readonly accepts_inputs: readonly string[];
  inputs: TargetInput[];
  check_result?: CheckResult;
  generate_result?: GenerateResult;
}

/**
 * Creates a new Target instance.
 *
 * @param input - Target configuration including name, plugin id, accepted inputs, and optional inputs.
 * @returns A Target record.
 */
export const makeTarget = (input: {
  name: string;
  plugin_id: string;
  accepts_inputs: readonly string[];
  inputs?: TargetInput[];
}): Target => ({
  name: input.name,
  plugin_id: input.plugin_id,
  accepts_inputs: input.accepts_inputs,
  inputs: input.inputs ?? [],
});

/**
 * Creates a concrete TargetInput record.
 *
 * @param input - Input metadata and optional payload.
 * @returns A TargetInput record.
 */
export const makeTargetInput = (input: {
  name: string;
  kind: string;
  value?: unknown;
}): TargetInput => ({
  name: input.name,
  kind: input.kind,
  value: input.value,
});

/**
 * Attaches an input to a target.
 *
 * @param target - The target receiving the input.
 * @param input - The input to attach.
 * @returns The same target for chaining.
 */
export const acceptTargetInput = (target: Target, input: TargetInput): Target => {
  target.inputs.push(input);
  return target;
};
