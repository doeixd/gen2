/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel - revised core primitives with typed symbol definitions.
 *
 * Philosophy: No magic strings for internal semantics.
 * - Strings are for display names and external protocol names.
 * - Internal semantics use typed symbols.
 */

export * from "./id.ts";
export * from "./metadata.ts";
export * from "./symbol.ts";
export * from "./kind.ts";
export * from "./type.ts";
export * from "./expr.ts";
export * from "./transform.ts";
export * from "./node.ts";
export * from "./edge.ts";
export * from "./graph.ts";
export * from "./pass.ts";

export type { traits, TraitDef, TraitTarget, TraitRef, traitAppliesTo, traitImplies, traitsConflict, getTrait } from "./trait.ts";
export { defineTrait } from "./trait.ts";