/* @__NO_SIDE_EFFECTS__ */
/**
 * Artifacts are the output of generation. Each Target produces a set of artifacts
 * (source files, schemas, configs, etc.) that the CLI writes to disk.
 *
 * See spec/core.allium :: entity Artifact, entity GenerateResult, entity PackageDependency.
 */

import type { Diagnostic } from "./diagnostics.ts";

/** Categorizes the kind of generated artifact. */
export type ArtifactKind =
  | "source"
  | "test"
  | "schema"
  | "migration"
  | "config"
  | "asset"
  | "directory"
  | "package_dep"
  | "runtime_command";

/** A single generated output file or asset. */
export interface Artifact {
  readonly path: string;
  readonly content: string;
  readonly kind: ArtifactKind;
  readonly language?: string;
  readonly diagnostics: readonly Diagnostic[];
  status?: string;
}

/** A runtime or dev dependency required by generated artifacts. */
export interface PackageDependency {
  readonly name: string;
  readonly version?: string;
  readonly dev: boolean;
}

/** Result status of a target check pass. */
export type CheckStatus = "ok" | "has_errors" | "has_warnings";

/** Aggregated diagnostics from checking a single target. */
export interface CheckResult {
  status: CheckStatus;
  diagnostics: readonly Diagnostic[];
}

/** Result status of a target generation pass. */
export type GenerateStatus = "success" | "failed";

/** Aggregated artifacts, diagnostics, and dependencies from generating a single target. */
export interface GenerateResult {
  artifacts: readonly Artifact[];
  diagnostics: readonly Diagnostic[];
  dependencies?: readonly PackageDependency[];
  status: GenerateStatus;
}

/**
 * Creates an Artifact record.
 *
 * @param input - Artifact properties including path, content, kind, language, and diagnostics.
 * @returns An Artifact record.
 */
export const makeArtifact = (input: {
  path: string;
  content: string;
  kind: ArtifactKind;
  language?: string;
  diagnostics?: readonly Diagnostic[];
}): Artifact => ({
  path: input.path,
  content: input.content,
  kind: input.kind,
  language: input.language,
  diagnostics: input.diagnostics ?? [],
});
