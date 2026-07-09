/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel diagnostic — compiler diagnostics with rich context.
 *
 * As of PLAN.md Track D-prefix phase 3, `Diagnostic` is a single
 * canonical type defined in `src/core/diagnostics.ts` and re-exported
 * from here. `defineDiagnostic(...)` is the kernel-side factory
 * (auto-fills `id` deterministically); `diagnostic(...)` is the
 * core-side factory. Both produce the same shape.
 *
 * Co-located helpers (`errorDiagnostic`, `warningDiagnostic`, etc.,
 * `formatDiagnostic`, `filterBySeverity`, `hasErrors`, `groupByCode`)
 * stay here because passes import them by name.
 */

import type { KernelId } from "./id.ts";
import type {
  Diagnostic as CoreDiagnostic,
  DiagnosticFix as CoreDiagnosticFix,
  DiagnosticRepair as CoreDiagnosticRepair,
  DiagnosticRelated as CoreDiagnosticRelated,
  Severity as CoreSeverity,
  SourceLocation as CoreSourceLocation,
  SourceSpan as CoreSourceSpan,
} from "../core/diagnostics.ts";

/** Diagnostic severity level (re-export of `core.Severity`). */
export type DiagnosticSeverity = CoreSeverity;

/** Source location in code (re-export from core). */
export type SourceLocation = CoreSourceLocation;

/** Source span — a range in source code (re-export from core). */
export type SourceSpan = CoreSourceSpan;

/** Related diagnostic subject (re-export from core). */
export type DiagnosticRelated = CoreDiagnosticRelated;

/** A suggested fix for a diagnostic (re-export from core). */
export type DiagnosticFix = CoreDiagnosticFix;

/** Typed graph repair option attached to a diagnostic. */
export type DiagnosticRepair = CoreDiagnosticRepair;

/**
 * The canonical Diagnostic shape. Re-export of `core.Diagnostic` so
 * passes that import `Diagnostic` from `kernel/diagnostic.ts` get the
 * unified type (PLAN.md Track D-prefix phase 3).
 */
export type Diagnostic = CoreDiagnostic;

/** Common diagnostic codes by category. */
export const DIAGNOSTIC_CODES = {
  // === General ===
  UNKNOWN: "diag:unknown",
  INTERNAL_ERROR: "diag:internal-error",

  // === Ref / identity diagnostics ===
  REF_MISSING_STABLE_ID: "ref:missing-stable-id",
  REF_RENAME_WITHOUT_STABLE_ID: "ref:rename-without-stable-id",
  REF_DUPLICATE_STABLE_ID: "ref:duplicate-stable-id",
  REF_UNSTABLE_NAME_DERIVED_ID: "ref:unstable-name-derived-id",

  // === Trait diagnostics ===
  TRAIT_INVALID_TARGET: "trait:invalid-target",
  TRAIT_CONFLICT: "trait:conflict",
  TRAIT_MISSING_REQUIRED: "trait:missing-required",
  TRAIT_IMPLICATION_INVALID: "trait:implication-invalid",

  // === Node diagnostics ===
  NODE_UNKNOWN_KIND: "node:unknown-kind",
  NODE_MISSING_INPUT: "node:missing-input",
  NODE_MISSING_OUTPUT: "node:missing-output",
  NODE_MISSING_BODY: "node:missing-body",
  NODE_INVALID_TRAIT: "node:invalid-trait",
  NODE_VERIFICATION_FAILED: "node:verification-failed",

  // === Edge diagnostics ===
  EDGE_MISSING_ENDPOINT: "edge:missing-endpoint",
  EDGE_INVALID_ENDPOINT: "edge:invalid-endpoint",
  EDGE_INVALID_CARDINALITY: "edge:invalid-cardinality",
  EDGE_DUPLICATE: "edge:duplicate",
  EDGE_SELF_REFERENCE: "edge:self-reference",
  EDGE_CYCLE: "edge:cycle-detected",

  // === Type diagnostics ===
  TYPE_MISMATCH: "type:mismatch",
  TYPE_UNKNOWN: "type:unknown",
  TYPE_NOT_SQL_LOWERABLE: "type:not-sql-lowerable",
  TYPE_OPAQUE: "type:opaque",

  // === Expr diagnostics ===
  EXPR_OPERATION_ARG_MISMATCH: "expr:operation-arg-type-mismatch",
  EXPR_UNKNOWN_VARIABLE: "expr:unknown-variable",
  EXPR_UNBOUND_REF: "expr:unbound-ref",
  EXPR_NOT_PORTABLE: "expr:not-portable",
  EXPR_OPAQUE: "expr:opaque",
  EXPR_SQL_LOWERING_UNSUPPORTED: "expr:sql-lowering-unsupported",
  EXPR_CLIENT_UNSAFE: "expr:client-unsafe",
  EXPR_EFFECT_NOT_ALLOWED: "expr:effect-not-allowed-in-pure",

  // === Rule diagnostics ===
  RULE_BODY_NOT_BOOLEAN: "rule:body-not-boolean",
  RULE_EFFECT_NOT_ALLOWED: "rule:effect-not-allowed",
  RULE_SERVER_ONLY_CLIENT_EXPOSURE: "rule:server-only-client-exposure",
  RULE_NOT_SQL_LOWERABLE: "rule:not-sql-lowerable",
  RULE_DEPENDENCY_EXTRACTION_CONSERVATIVE: "rule:dependency-extraction-conservative",
  RULE_IVM_NOT_INCREMENTALIZABLE: "rule:ivm-not-incrementalizable",

  // === Callable diagnostics ===
  CALLABLE_MISSING_INPUT: "callable:missing-input-type",
  CALLABLE_MISSING_OUTPUT: "callable:missing-output-type",
  CALLABLE_GUARD_NOT_RULE: "callable:guard-not-rule",
  CALLABLE_BODY_EFFECT_MISMATCH: "callable:body-effect-mismatch",
  CALLABLE_REQUIRES_UNMET: "callable:requires-unmet",

  // === Reactivity diagnostics ===
  REACTIVITY_KEY_CONFLICT: "reactivity:key-conflict",
  REACTIVITY_INVALIDATION_MISSING: "reactivity:invalidation-missing",
  REACTIVITY_CONSERVATIVE_INVALIDATION: "reactivity:conservative-invalidation",

  // === Storage diagnostics ===
  STORAGE_MAPPING_MISSING: "storage:mapping-missing",
  STORAGE_RELATION_NEEDS_JOIN: "storage:relation-needs-join-table",
  STORAGE_INDEX_DUPLICATE: "storage:index-duplicate",

  // === Pass diagnostics ===
  PASS_NOT_FOUND: "pass:not-found",
  PASS_PHASE_FAILED: "pass:phase-failed",
  PASS_LEGALIZATION_FAILED: "pass:legalization-failed",

  // === Artifact diagnostics ===
  ARTIFACT_EMIT_FAILED: "artifact:emit-failed",
  ARTIFACT_TARGET_NOT_SUPPORTED: "artifact:target-not-supported",
} as const;

/**
 * Stable 32-bit FNV-1a hash of a string, returned as 8 hex chars.
 *
 * Used to derive deterministic diagnostic IDs from message text without
 * pulling in a crypto dependency. Two diagnostics with the same code,
 * subject, and message will hash to the same ID — that is the intended
 * behavior (it lets passes dedup re-emitted findings).
 */
const fnv1aHex = (input: string): string => {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiplication
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/**
 * Create a diagnostic.
 *
 * The ID is deterministic by default — derived from `code`, `subject`,
 * and a hash of `message`. Pass an explicit `id` to override.
 *
 * Date-based IDs were removed (PLAN.md §7 quick win #1) because they
 * prevent graph diff, snapshot replay, and dedup of re-emitted findings.
 */
export const defineDiagnostic = (
  code: string,
  severity: DiagnosticSeverity,
  message: string,
  input?: {
    readonly id?: string;
    readonly subject?: KernelId;
    readonly subjectKind?: string;
    readonly related?: readonly DiagnosticRelated[];
    readonly source?: SourceSpan;
    readonly suggestedFixes?: readonly DiagnosticFix[];
    readonly repairs?: readonly DiagnosticRepair[];
    readonly context?: ReadonlyMap<string, unknown>;
  },
): Diagnostic => {
  const subjectKey = input?.subject ?? "_";
  const id = input?.id ?? `diag:${code}:${subjectKey}:${fnv1aHex(message)}`;
  return {
    id,
    code,
    severity,
    message,
    // `refs` is required on the unified Diagnostic; kernel-side callers
    // don't yet thread typed Refs through, so default to an empty list.
    refs: [],
    subject: input?.subject,
    subjectKind: input?.subjectKind,
    related: input?.related,
    source: input?.source,
    suggestedFixes: input?.suggestedFixes,
    repairs: input?.repairs,
    context: input?.context,
  };
};

/** Create an error diagnostic. */
export const errorDiagnostic = (
  code: string,
  message: string,
  input?: Parameters<typeof defineDiagnostic>[3],
): Diagnostic => defineDiagnostic(code, "error", message, input);

/** Create a warning diagnostic. */
export const warningDiagnostic = (
  code: string,
  message: string,
  input?: Parameters<typeof defineDiagnostic>[3],
): Diagnostic => defineDiagnostic(code, "warning", message, input);

/** Create an info diagnostic. */
export const infoDiagnostic = (
  code: string,
  message: string,
  input?: Parameters<typeof defineDiagnostic>[3],
): Diagnostic => defineDiagnostic(code, "info", message, input);

/** Create a hint diagnostic. */
export const hintDiagnostic = (
  code: string,
  message: string,
  input?: Parameters<typeof defineDiagnostic>[3],
): Diagnostic => defineDiagnostic(code, "hint", message, input);

/** Filter diagnostics by severity. */
export const filterBySeverity = (
  diags: readonly Diagnostic[],
  severity: DiagnosticSeverity,
): readonly Diagnostic[] => diags.filter((d) => d.severity === severity);

/** Get all errors from a diagnostic list. */
export const getErrors = (diags: readonly Diagnostic[]): readonly Diagnostic[] =>
  filterBySeverity(diags, "error");

/** Get all warnings from a diagnostic list. */
export const getWarnings = (diags: readonly Diagnostic[]): readonly Diagnostic[] =>
  filterBySeverity(diags, "warning");

/** Check if diagnostics contain errors. */
export const hasErrors = (diags: readonly Diagnostic[]): boolean =>
  diags.some((d) => d.severity === "error");

/** Group diagnostics by code. */
export const groupByCode = (diags: readonly Diagnostic[]): Map<string, readonly Diagnostic[]> => {
  const groups = new Map<string, Diagnostic[]>();
  for (const diag of diags) {
    const existing = groups.get(diag.code) ?? [];
    groups.set(diag.code, [...existing, diag]);
  }
  return groups;
};

/** Format a diagnostic for display. */
export const formatDiagnostic = (diag: Diagnostic): string => {
  const severityIcon =
    diag.severity === "error"
      ? "error"
      : diag.severity === "warning"
        ? "warn"
        : diag.severity === "info"
          ? "info"
          : "hint";
  let result = `${severityIcon} [${diag.code}] ${diag.message}`;
  if (diag.subject) {
    result += ` (at ${diag.subject})`;
  }
  if (diag.source) {
    result += ` (${(diag.source as { file?: string }).file ?? "<unknown>"}:${diag.source.start.line}:${diag.source.start.column})`;
  }
  return result;
};
