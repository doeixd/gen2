/* @__NO_SIDE_EFFECTS__ */
/**
 * Diagnostic IR. Every invariant violation or rule trigger produces one of these.
 * CheckResult and GenerateResult aggregate diagnostics for a single Target.
 *
 * See spec/core.allium :: entity Diagnostic, entity CheckResult, entity GenerateResult.
 */

import type { Ref } from "./refs.ts";

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
