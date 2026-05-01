/* @__NO_SIDE_EFFECTS__ */
/**
 * Open application-level node protocol.
 *
 * Expression IR stays closed for target exhaustiveness, but first-class semantic
 * objects can advertise composable traits so plugins and higher-level builders
 * can participate in the graph without hardcoded kind checks.
 */

import type { Ref, StableId } from "./refs.ts";
import type { Effect, Requirement, SemanticType } from "../types/index.ts";

export interface NodeErrorType {
  readonly code: string;
  readonly kind?: string;
}

export type BuiltInTraitKind =
  | "static"
  | "named"
  | "typed"
  | "callable"
  | "readable"
  | "writable"
  | "effectful"
  | "requires"
  | "reactive"
  | "keyed"
  | "policy_protected"
  | "resource_like"
  | "migration_step"
  | "target_interpretable"
  | "plan"
  | "server_placeable";

export type PluginTraitKind<
  PluginId extends string = string,
  Name extends string = string,
> = `${PluginId}:${Name}` & { readonly _traitKind?: never };

export type TraitKind = BuiltInTraitKind | PluginTraitKind | TraitRef;

/** Runtime set of all built-in trait names for validation. */
export const BUILT_IN_TRAITS: ReadonlySet<string> = new Set([
  "static",
  "named",
  "typed",
  "callable",
  "readable",
  "writable",
  "effectful",
  "requires",
  "reactive",
  "keyed",
  "policy_protected",
  "resource_like",
  "migration_step",
  "target_interpretable",
  "plan",
  "server_placeable",
]);

/** A branded trait reference for type-safe trait usage. */
export type TraitRef<Name extends string = string> = string & {
  readonly _traitRef?: Name;
};

/** Optional metadata attached to a trait. */
export interface TraitMetadata {
  readonly description?: string;
  readonly version?: string;
  readonly constraints?: readonly string[];
  readonly deprecated?: boolean;
  readonly docs_url?: string;
}

/** Create a typed trait reference from a trait name, with optional metadata. */
export const createTrait = <Name extends string>(
  name: Name,
  _metadata?: TraitMetadata,
): TraitRef<Name> => name as TraitRef<Name>;

/** Predefined trait references for all built-in traits. */
export const traits = {
  static: createTrait("static"),
  named: createTrait("named"),
  typed: createTrait("typed"),
  callable: createTrait("callable"),
  readable: createTrait("readable"),
  writable: createTrait("writable"),
  effectful: createTrait("effectful"),
  requires: createTrait("requires"),
  reactive: createTrait("reactive"),
  keyed: createTrait("keyed"),
  policy_protected: createTrait("policy_protected"),
  resource_like: createTrait("resource_like"),
  migration_step: createTrait("migration_step"),
  target_interpretable: createTrait("target_interpretable"),
  plan: createTrait("plan"),
  server_placeable: createTrait("server_placeable"),
} as const;

export interface SymbolMetadata {
  readonly module_path: string;
  readonly export_name: string;
  readonly is_default: boolean;
}

export interface StaticMetadataEntry {
  readonly namespace: string;
  readonly key: string;
  readonly value: string;
}

export interface StaticNode<
  Kind extends string = string,
  In = unknown,
  Out = unknown,
  Err = never,
  Req = never,
  Eff = never,
  Traits extends readonly TraitKind[] = readonly TraitKind[],
> {
  readonly kind: Kind;
  readonly id?: StableId<string>;
  readonly ref?: Ref;
  readonly name?: string;
  readonly traits: Traits;
  readonly input?: SemanticType<In>;
  readonly output?: SemanticType<Out>;
  readonly errors?: readonly NodeErrorType[];
  readonly requirements?: readonly Requirement[];
  readonly effects?: readonly Effect[];
  readonly metadata?: readonly StaticMetadataEntry[];
  readonly symbol?: SymbolMetadata;
  readonly _input?: In;
  readonly _output?: Out;
  readonly _errors?: Err;
  readonly _requires?: Req;
  readonly _effects?: Eff;
  readonly _traits?: Traits;
}

export interface NamedNode {
  readonly name: string;
}

export interface TypedNode<In = unknown, Out = unknown> {
  readonly input?: SemanticType<In>;
  readonly output?: SemanticType<Out>;
  readonly _input?: In;
  readonly _output?: Out;
}

export type CallArgMapping =
  | { readonly kind: "context" }
  | { readonly kind: "spread_input" }
  | { readonly kind: "input_field"; readonly field: string }
  | { readonly kind: "literal"; readonly value: unknown }
  | { readonly kind: "injected_service"; readonly service_id: string };

export interface CallPlan<In = unknown, Out = unknown> {
  readonly kind: "call_plan";
  readonly input?: SemanticType<In>;
  readonly output?: SemanticType<Out>;
  readonly target?: Ref;
  readonly args?: readonly CallArgMapping[];
  readonly is_async?: boolean;
  readonly _input?: In;
  readonly _output?: Out;
}

export interface CallableNode<In = unknown, Out = unknown> extends StaticNode<string, In, Out> {
  readonly callPlan?: CallPlan<In, Out>;
}

export interface ReadableNode {
  readonly traits: readonly TraitKind[];
}

export interface WritableNode {
  readonly traits: readonly TraitKind[];
}

export interface EffectfulNode<Eff = unknown> {
  readonly effects?: readonly Effect[];
  readonly _effects?: Eff;
}

export interface RequiresNode<Req = unknown> {
  readonly requirements?: readonly Requirement[];
  readonly _requires?: Req;
}

export interface ReactiveNode {
  readonly traits: readonly TraitKind[];
}

export interface KeyedNode {
  readonly traits: readonly TraitKind[];
}

export interface PolicyProtectedNode {
  readonly traits: readonly TraitKind[];
}

export interface ResourceLikeNode {
  readonly traits: readonly TraitKind[];
}

export interface MigrationStepNode {
  readonly traits: readonly TraitKind[];
}

export interface TargetInterpretableNode {
  readonly traits: readonly TraitKind[];
}

export interface PlanNode {
  readonly traits: readonly TraitKind[];
}

export interface ServerPlaceableNode {
  readonly traits: readonly TraitKind[];
}

export interface LowerableNode<N extends StaticNode = StaticNode> {
  readonly lowersTo?: readonly N[];
}

export type InferNodeInput<N> = N extends { readonly _input?: infer In }
  ? In
  : N extends { readonly input?: SemanticType<infer In> }
    ? In
    : N extends { readonly input_type: SemanticType<infer In> }
      ? In
      : never;

export type InferNodeOutput<N> = N extends { readonly _output?: infer Out }
  ? Out
  : N extends { readonly output?: SemanticType<infer Out> }
    ? Out
    : N extends { readonly output_type: SemanticType<infer Out> }
      ? Out
      : N extends { readonly returns: SemanticType<infer Out> }
        ? Out
        : never;

export type InferNodeErrors<N> = N extends { readonly _errors?: infer Err }
  ? Err
  : N extends { readonly errors?: readonly (infer Err)[] }
    ? Err
    : never;

export type InferNodeRequirements<N> = N extends { readonly _requires?: infer Req } ? Req : never;

export type InferNodeEffects<N> = N extends { readonly _effects?: infer Eff } ? Eff : never;

export type InferNodeTraits<N> = N extends { readonly traits: infer Traits } ? Traits : never;

export const hasTrait = (
  node: { readonly traits?: readonly (TraitKind | TraitRef)[] },
  trait: TraitKind | TraitRef,
): boolean => node.traits?.some((t) => t === trait) ?? false;

export const hasTraits = (
  node: { readonly traits?: readonly (TraitKind | TraitRef)[] },
  traits: readonly (TraitKind | TraitRef)[],
): boolean => traits.every((trait) => hasTrait(node, trait));

export const missingTraits = (
  node: { readonly traits?: readonly (TraitKind | TraitRef)[] },
  traits: readonly (TraitKind | TraitRef)[],
): readonly (TraitKind | TraitRef)[] => traits.filter((trait) => !hasTrait(node, trait));

export type InferRequirements<T> = T extends RequiresNode<infer Req> ? Req : unknown;
export type InferEffects<T> = T extends EffectfulNode<infer Eff> ? Eff : unknown;

export const callPlan = <In = unknown, Out = unknown>(input: {
  readonly input?: SemanticType<In>;
  readonly output?: SemanticType<Out>;
  readonly target?: Ref;
  readonly args?: readonly CallArgMapping[];
  readonly is_async?: boolean;
}): CallPlan<In, Out> => ({
  kind: "call_plan",
  input: input.input,
  output: input.output,
  target: input.target,
  args: input.args,
  is_async: input.is_async,
});
