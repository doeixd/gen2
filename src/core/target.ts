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

export interface SymbolRegistry {
  readonly symbols: readonly import("./node.ts").SymbolMetadata[];
}

/** Shared metadata for a concrete input supplied to a target during generation. */
export interface TargetInputBase<TKind extends string = string> {
  readonly name: string;
  readonly kind: TKind;
  readonly symbol_registry?: SymbolRegistry;
  readonly target_config?: Record<string, unknown>;
}

/** A concrete input supplied to a target during generation. */
export type TargetInputRecord<
  TKind extends string = string,
  TValue = unknown,
> = TargetInputBase<TKind> &
  (unknown extends TValue
    ? { readonly value?: TValue }
    : undefined extends TValue
      ? { readonly value?: TValue }
      : { readonly value: TValue });

export type TargetInputValue<TInput extends TargetInputRecord> =
  TInput extends TargetInputRecord<string, infer TValue> ? TValue : never;

export type TargetInputInit<TKind extends string, TValue> = TargetInputBase<TKind> &
  (undefined extends TValue ? { readonly value?: TValue } : { readonly value: TValue });

export interface TargetInputKind<TKind extends string, TValue> {
  readonly kind: TKind;
  readonly accepts_inputs: readonly TKind[];
  readonly make: (
    input: Omit<TargetInputInit<TKind, TValue>, "kind">,
  ) => TargetInputRecord<TKind, TValue>;
  readonly is: (input: TargetInputRecord) => input is TargetInputRecord<TKind, TValue>;
}

/** A generation target that bridges domain models to concrete artifacts. */
export interface TargetCapabilities {
  readonly tiers: readonly CapabilityTier[];
  readonly effects: readonly string[];
}

export interface Target<TInput extends TargetInputRecord = TargetInputRecord> {
  readonly name: string;
  readonly plugin_id: string;
  readonly accepts_inputs: readonly string[];
  inputs: TInput[];
  capabilities?: TargetCapabilities;
  pipeline?: string;
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
  inputs?: TargetInputRecord[];
  pipeline?: string;
}): Target<TargetInputRecord> => ({
  name: input.name,
  plugin_id: input.plugin_id,
  accepts_inputs: input.accepts_inputs,
  inputs: input.inputs ?? [],
  pipeline: input.pipeline,
});

/**
 * Creates a concrete TargetInputRecord.
 *
 * @param input - Input metadata and optional payload.
 * @returns A TargetInputRecord.
 */
export function makeTargetInput<const TKind extends string, const TValue>(input: {
  name: string;
  kind: TKind;
  value: TValue;
  symbol_registry?: SymbolRegistry;
  target_config?: Record<string, unknown>;
}): TargetInputRecord<TKind, TValue>;
export function makeTargetInput<const TKind extends string>(input: {
  name: string;
  kind: TKind;
  value?: undefined;
  symbol_registry?: SymbolRegistry;
  target_config?: Record<string, unknown>;
}): TargetInputRecord<TKind, undefined>;
export function makeTargetInput(input: {
  name: string;
  kind: string;
  value?: unknown;
  symbol_registry?: SymbolRegistry;
  target_config?: Record<string, unknown>;
}): TargetInputRecord {
  return {
    name: input.name,
    kind: input.kind,
    value: input.value,
    symbol_registry: input.symbol_registry,
    target_config: input.target_config,
  };
}

export const defineTargetInputKind = <const TKind extends string, TValue = unknown>(
  kind: TKind,
): TargetInputKind<TKind, TValue> => ({
  kind,
  accepts_inputs: [kind],
  make: (input) => ({ ...input, kind }) as TargetInputRecord<TKind, TValue>,
  is: (input): input is TargetInputRecord<TKind, TValue> => input.kind === kind,
});

export const targetInputValue = <TInput extends TargetInputRecord>(
  input: TInput,
): TargetInputValue<TInput> | undefined => input.value as TargetInputValue<TInput> | undefined;

export const targetInputsOfKind = <const TKind extends string, TValue>(
  inputs: readonly TargetInputRecord[],
  kind: TargetInputKind<TKind, TValue>,
): readonly TargetInputRecord<TKind, TValue>[] => inputs.filter(kind.is);

/**
 * Attaches an input to a target.
 *
 * @param target - The target receiving the input.
 * @param input - The input to attach.
 * @returns The same target for chaining.
 */
export const acceptTargetInput = <
  TExistingInput extends TargetInputRecord,
  TInput extends TargetInputRecord,
>(
  target: Target<TExistingInput>,
  input: TInput,
): Target<TExistingInput | TInput> => {
  const widened = target as Target<TExistingInput | TInput>;
  widened.inputs = [...widened.inputs, input];
  return widened;
};
