/* @__NO_SIDE_EFFECTS__ */
/**
 * Diagnostic IR. Every invariant violation or rule trigger produces one of these.
 * CheckResult and GenerateResult aggregate diagnostics for a single Target.
 *
 * See spec/core.allium :: entity Diagnostic, entity CheckResult, entity GenerateResult.
 */

import type { Ref, RefKind } from "./refs.ts";

/** Severity level of a diagnostic message. */
export type Severity = "error" | "warning" | "info";

/** Hierarchical path segments locating a diagnostic within a document. */
export interface DiagnosticPath {
  readonly segments: readonly string[];
}

/** A single invariant violation or rule trigger emitted by the system. */
export interface Diagnostic {
  readonly severity: Severity;
  readonly code: string;
  readonly message: string;
  readonly path?: DiagnosticPath;
  readonly refs: readonly Ref[];
  readonly suggestion?: string;
}

/** Template for a class of diagnostics with a fixed code and severity. */
export interface DiagnosticDefinition {
  readonly code: string;
  readonly severity: Severity;
  readonly message_template: string;
}

/** Ref migration diagnostic definitions. */
export const refMigrationDiagnostics = {
  missingStableId: (input: { ref: Ref; suggestion?: string }): Diagnostic =>
    diagnostic({
      severity: "warning",
      code: "ref:missing-stable-id",
      message:
        `Ref ${input.ref.kind}:${input.ref.owner.kind}:${input.ref.owner.name}:${input.ref.name} is missing a stable ID. ${input.suggestion ?? ""}`.trim(),
      refs: [input.ref],
    }),
  rawStringReference: (input: { location: string; suggestion?: string }): Diagnostic =>
    diagnostic({
      severity: "warning",
      code: "ref:raw-string-reference",
      message:
        `Raw string reference "${input.location}" used where a typed ref is expected. ${input.suggestion ?? ""}`.trim(),
    }),
  ambiguousStringReference: (input: {
    location: string;
    candidates: readonly Ref[];
    suggestion?: string;
  }): Diagnostic =>
    diagnostic({
      severity: "warning",
      code: "ref:ambiguous-string-reference",
      message:
        `String reference "${input.location}" is ambiguous; it could refer to ${input.candidates.map((r) => `"${r.kind}:${r.owner.kind}:${r.owner.name}:${r.name}"`).join(", ")}. ${input.suggestion ?? ""}`.trim(),
      refs: input.candidates,
    }),
  wrongRefKind: (input: { expected: RefKind; actual: Ref; suggestion?: string }): Diagnostic =>
    diagnostic({
      severity: "error",
      code: "ref:wrong-ref-kind",
      message:
        `Expected a ${input.expected} ref but got a ${input.actual.kind} ref. ${input.suggestion ?? ""}`.trim(),
      refs: [input.actual],
    }),
  unregisteredRef: (input: { ref: Ref; suggestion?: string }): Diagnostic =>
    diagnostic({
      severity: "error",
      code: "ref:unregistered-ref",
      message:
        `Ref ${input.ref.kind}:${input.ref.owner.kind}:${input.ref.owner.name}:${input.ref.name} is not registered in the context. ${input.suggestion ?? ""}`.trim(),
      refs: [input.ref],
    }),
  renameWithoutStableId: (input: { ref: Ref; suggestion?: string }): Diagnostic =>
    diagnostic({
      severity: "warning",
      code: "ref:rename-without-stable-id",
      message:
        `Ref ${input.ref.kind}:${input.ref.owner.kind}:${input.ref.owner.name}:${input.ref.name} has been renamed but lacks a stable ID to track the rename. ${input.suggestion ?? ""}`.trim(),
      refs: [input.ref],
    }),
};

/** Node lowering diagnostic definitions. */
export const nodeDiagnostics = {
  unknownKind: (input: { kind: string; suggestion?: string }): Diagnostic =>
    diagnostic({
      severity: "error",
      code: "node:unknown-kind",
      message: `Unknown node kind "${input.kind}". ${input.suggestion ?? ""}`.trim(),
    }),
  missingTrait: (input: {
    nodeName?: string;
    traits: readonly string[];
    suggestion?: string;
  }): Diagnostic =>
    diagnostic({
      severity: "error",
      code: "node:missing-trait",
      message:
        `Node${input.nodeName ? ` "${input.nodeName}"` : ""} is missing required traits: ${input.traits.join(", ")}. ${input.suggestion ?? ""}`.trim(),
    }),
  loweringCycle: (input: {
    kind: string;
    visited: readonly string[];
    suggestion?: string;
  }): Diagnostic =>
    diagnostic({
      severity: "error",
      code: "node:lowering-cycle",
      message:
        `Lowering cycle detected for kind "${input.kind}" (visited: ${input.visited.join(" -> ")}). ${input.suggestion ?? ""}`.trim(),
    }),
  noTargetInterpretation: (input: {
    kind: string;
    target: string;
    suggestion?: string;
  }): Diagnostic =>
    diagnostic({
      severity: "error",
      code: "node:no-target-interpretation",
      message:
        `Node kind "${input.kind}" has no interpretation for target "${input.target}". ${input.suggestion ?? ""}`.trim(),
    }),
  invalidLowering: (input: { kind: string; toKind: string; suggestion?: string }): Diagnostic =>
    diagnostic({
      severity: "error",
      code: "node:invalid-lowering",
      message:
        `Lowering from "${input.kind}" to "${input.toKind}" produced an invalid result. ${input.suggestion ?? ""}`.trim(),
    }),
  duplicateId: (input: { id: string; suggestion?: string }): Diagnostic =>
    diagnostic({
      severity: "error",
      code: "node:duplicate-id",
      message: `Duplicate node stable ID "${input.id}". ${input.suggestion ?? ""}`.trim(),
    }),
  unknownTrait: (input: { trait: string; suggestion?: string }): Diagnostic =>
    diagnostic({
      severity: "warning",
      code: "trait:unknown",
      message: `Unknown trait "${input.trait}". ${input.suggestion ?? ""}`.trim(),
    }),
  metadataMismatch: (input: { trait: string; suggestion?: string }): Diagnostic =>
    diagnostic({
      severity: "warning",
      code: "trait:metadata-mismatch",
      message:
        `Trait "${input.trait}" has conflicting metadata registrations. ${input.suggestion ?? ""}`.trim(),
    }),
};

/**
 * Convenience constructor used by rule bodies.
 *
 * @param input - Diagnostic properties including severity, code, message, optional refs, path, and suggestion.
 * @returns A Diagnostic record.
 */
export const diagnostic = (input: {
  severity: Severity;
  code: string;
  message: string;
  refs?: readonly Ref[];
  path?: DiagnosticPath;
  suggestion?: string;
}): Diagnostic => ({
  severity: input.severity,
  code: input.code,
  message: input.message,
  refs: input.refs ?? [],
  path: input.path,
  suggestion: input.suggestion,
});

/**
 * Determines whether any diagnostic in the list is an error.
 *
 * @param diagnostics - List of diagnostics to inspect.
 * @returns True if at least one diagnostic has severity "error".
 */
export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((d) => d.severity === "error");

/**
 * Determines whether any diagnostic in the list is a warning.
 *
 * @param diagnostics - List of diagnostics to inspect.
 * @returns True if at least one diagnostic has severity "warning".
 */
export const hasWarnings = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((d) => d.severity === "warning");
