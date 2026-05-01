/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel trait - checked semantic claims.
 *
 * A trait is a checked semantic claim that applies to kernel objects.
 * Models the revised core Trait primitive.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";

/** Kinds that traits can apply to. */
export type KernelTargetKind =
  | "type"
  | "expr"
  | "node"
  | "edge"
  | "transform";

/** A trait reference (string brand). */
export type TraitRef<Name extends string = string> = string & {
  readonly _traitRef?: Name;
};

/** Create a typed trait reference. */
export const traitRef = <Name extends string>(name: Name): TraitRef<Name> =>
  name as TraitRef<Name>;

/** Kernel trait definition. */
export interface KernelTrait {
  readonly id: KernelId<"trait">;
  readonly name: string;
  readonly appliesTo: readonly KernelTargetKind[];
  readonly implies?: readonly TraitRef[];
  readonly conflictsWith?: readonly TraitRef[];
  readonly metadata?: KernelMetadata;
}

/** Built-in trait names. */
export const BUILT_IN_TRAITS = {
  TYPE: {
    EMAIL: "type.email",
    UUID: "type.uuid",
    DATETIME: "type.datetime",
    UNIQUE: "type.unique",
    INDEXED: "type.indexed",
    SERVER_ONLY: "type.serverOnly",
    SECRET: "type.secret",
    QUERYABLE: "type.queryable",
  },
  NODE: {
    STATIC: "node.static",
    NAMED: "node.named",
    TYPED: "node.typed",
    CALLABLE: "node.callable",
    READABLE: "node.readable",
    WRITABLE: "node.writable",
    EFFECTFUL: "node.effectful",
    REQUIRES: "node.requires",
    REACTIVE: "node.reactive",
    KEYED: "node.keyed",
    POLICY_PROTECTED: "node.policyProtected",
    RESOURCE_LIKE: "node.resourceLike",
    MIGRATION_STEP: "node.migrationStep",
    TARGET_INTERPRETABLE: "node.targetInterpretable",
    PLAN: "node.plan",
    SERVER_PLACEABLE: "node.serverPlaceable",
    ENTITY: "node.entity",
    RULE: "node.rule",
    ACTION: "node.action",
    QUERY: "node.query",
    VIEW: "node.view",
  },
  EDGE: {
    OWNS: "edge.owns",
    HAS_TYPE: "edge.hasType",
    READS: "edge.reads",
    WRITES: "edge.writes",
    GUARDS: "edge.guards",
    REQUIRES: "edge.requires",
    PROVIDES: "edge.provides",
    DERIVES: "edge.derives",
    INVALIDATES: "edge.invalidates",
    PATCHES: "edge.patches",
    SUBMITS: "edge.submits",
    DISPLAYS: "edge.displays",
    EDITS: "edge.edits",
    STORES: "edge.stores",
    MAPS_TO: "edge.mapsTo",
    CROSSES_BOUNDARY: "edge.crossesBoundary",
    LOWERS_TO: "edge.lowersTo",
    GENERATED_FROM: "edge.generatedFrom",
  },
  EXPR: {
    PURE: "expr.pure",
    SQL_LOWERABLE: "expr.sqlLowerable",
    CLIENT_EVALUABLE: "expr.clientEvaluable",
  },
  TRANSFORM: {
    ENCODABLE: "transform.encodable",
    DECODABLE: "transform.decodable",
    COMposable: "transform.composable",
  },
} as const;

/** Validate that a trait applies to a given target kind. */
export const traitAppliesTo = (
  trait: KernelTrait,
  target: KernelTargetKind,
): boolean => trait.appliesTo.includes(target);

/** Check if a trait implies another trait (transitively). */
export const traitImplies = (
  trait: KernelTrait,
  implied: TraitRef,
): boolean => trait.implies?.some((t) => t === implied) ?? false;

/** Check if two traits conflict. */
export const traitsConflict = (
  a: TraitRef,
  b: TraitRef,
  traits: ReadonlyMap<string, KernelTrait>,
): boolean => {
  const traitA = traits.get(a);
  return traitA?.conflictsWith?.some((t) => t === b) ?? false;
};

/** Create a new trait definition. */
export const defineTrait = (input: {
  readonly name: string;
  readonly appliesTo: readonly KernelTargetKind[];
  readonly implies?: readonly TraitRef[];
  readonly conflictsWith?: readonly TraitRef[];
  readonly metadata?: KernelMetadata;
}): KernelTrait => ({
  id: `trait:${input.name}` as KernelId<"trait">,
  name: input.name,
  appliesTo: input.appliesTo,
  implies: input.implies,
  conflictsWith: input.conflictsWith,
  metadata: input.metadata,
});