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
export * from "./kind.ts";
export * from "./type.ts";
export * from "./expr.ts";
export * from "./transform.ts";
export * from "./node.ts";
export * from "./edge.ts";
export * from "./graph.ts";
export * from "./patch.ts";
export type {
  GraphStageResult,
  StagePatchSummary,
  StageDiagnosticSummary,
  StageArtifactSummary,
  StageResultSummary,
} from "./stage.ts";
export {
  graphStageResult,
  summarizeStageResult,
  previewStageResult,
  explainStageResult,
} from "./stage.ts";
export * from "./derivation.ts";
export * from "./builder.ts";
export * from "./step.ts";
export * from "./query.ts";
export * from "./pattern.ts";
export * from "./morphism.ts";
export * from "./pass.ts";
export * from "./scope.ts";
// `./law.ts` was removed in PLAN.md §7 quick win #5 — laws are typed
// traits via `traits.LAW.*` in `./trait.ts`, not a separate primitive
// family. See PLAN.md Track B §B7.
export * from "./artifact.ts";
export * from "./dialect.ts";
export * from "./ods.ts";
export * from "./relations.ts";
export * from "./relation-accessors.ts";
export * from "./predicate.ts";
export * from "./surface.ts";
export * from "./lower.ts";
export * from "./verifier.ts";
export * from "./operations.ts";
export * from "./bridge.ts";
export * from "./explain.ts";

export { DIAGNOSTIC_CODES } from "./diagnostic.ts";
export type { Diagnostic, SourceSpan } from "./diagnostic.ts";

export { defineSymbol, defineTrait, defineCapability } from "./symbol.ts";
export type { SymbolDef, SymbolDomain, TraitDef, TraitTarget, CapabilityDef } from "./symbol.ts";

export { traits, traitAppliesTo, traitImplies, traitsConflict, getTrait } from "./trait.ts";
export type { TraitRef } from "./trait.ts";
