/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel artifact - generated output with source mapping.
 *
 * Represents emitted artifacts (SQL, TypeScript, JSON, etc.) with back-
 * pointers to the graph objects they were generated from.
 */

import type { KernelId } from "./id.ts";

/** Artifact target platform. */
export type ArtifactTarget =
  | "postgres"
  | "sqlite"
  | "typescript"
  | "javascript"
  | "json"
  | "json-schema"
  | "openapi"
  | "solid"
  | "react"
  | "effect"
  | "docs"
  | "devtools";

/** Artifact content types. */
export type ArtifactContent = string | Uint8Array | JsonValue;

/** JSON value for JSON artifacts. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Semantic source map entry. */
export interface SourceMapEntry {
  readonly artifactOffset: number;
  readonly artifactLength: number;
  readonly sourceStart: number;
  readonly sourceLength: number;
  readonly sourceFile?: string;
}

/** Semantic source map. */
export interface SemanticSourceMap {
  readonly entries: readonly SourceMapEntry[];
  readonly sourceFile: string;
}

/** Back-pointer to a graph object that generated this artifact. */
export interface ArtifactSource {
  readonly id: KernelId;
  readonly kind: string;
  readonly context?: string;
}

/** An emitted artifact. */
export interface Artifact {
  readonly id: KernelId<"artifact">;
  readonly target: ArtifactTarget;
  readonly kind: string;
  readonly path?: string;
  readonly content?: ArtifactContent;

  readonly generatedFrom: readonly ArtifactSource[];

  readonly generatedBy: KernelId<"pass">;

  readonly sourceMap?: SemanticSourceMap;

  readonly metadata?: ReadonlyMap<string, unknown>;
}

/** Artifact input for construction. */
export interface ArtifactInput {
  readonly target: ArtifactTarget;
  readonly kind: string;
  readonly path?: string;
  readonly content?: ArtifactContent;
  readonly generatedFrom?: readonly ArtifactSource[];
  readonly generatedBy: KernelId<"pass">;
  readonly sourceMap?: SemanticSourceMap;
  readonly metadata?: ReadonlyMap<string, unknown>;
}

/** Create an artifact. */
export const defineArtifact = (id: string, input: ArtifactInput): Artifact => ({
  id: id as KernelId<"artifact">,
  target: input.target,
  kind: input.kind,
  path: input.path,
  content: input.content,
  generatedFrom: input.generatedFrom ?? [],
  generatedBy: input.generatedBy,
  sourceMap: input.sourceMap,
  metadata: input.metadata,
});

/** Common artifact kinds. */
export const ARTIFACT_KINDS = {
  // Postgres
  PG_TABLE: "artifact.pg.table",
  PG_COLUMN: "artifact.pg.column",
  PG_INDEX: "artifact.pg.index",
  PG_CONSTRAINT: "artifact.pg.constraint",
  PG_RLS_POLICY: "artifact.pg.rls-policy",
  PG_TRIGGER: "artifact.pg.trigger",
  PG_FUNCTION: "artifact.pg.function",
  PG_MIGRATION: "artifact.pg.migration",

  // TypeScript/JavaScript
  TS_TYPE: "artifact.ts.type",
  TS_INTERFACE: "artifact.ts.interface",
  TS_FUNCTION: "artifact.ts.function",
  TS_MODULE: "artifact.ts.module",

  // React/Solid
  REACT_COMPONENT: "artifact.react.component",
  REACT_HOOK: "artifact.react.hook",
  SOLID_COMPONENT: "artifact.solid.component",
  SOLID_SIGNAL: "artifact.solid.signal",

  // Effect
  EFFECT_SCHEMA: "artifact.effect.schema",
  EFFECT_SERVICE: "artifact.effect.service",
  EFFECT_LAYER: "artifact.effect.layer",

  // Schema
  JSON_SCHEMA: "artifact.json-schema",
  OPENAPI_SPEC: "artifact.openapi.spec",

  // Docs
  DOCS_PAGE: "artifact.docs.page",
  DOCS_API: "artifact.docs.api",
  DOCS_ACCESS_MATRIX: "artifact.docs.access-matrix",
  DOCS_RULE_TEST_MATRIX: "artifact.docs.rule-test-matrix",
  DOCS_RULE_AUDIT_EXPLANATION: "artifact.docs.rule-audit-explanation",
} as const;

/** Source map builder for accumulating mappings. */
export class SourceMapBuilder {
  private readonly entries: SourceMapEntry[] = [];
  private readonly sourceFile: string;

  constructor(sourceFile: string) {
    this.sourceFile = sourceFile;
  }

  /** Add a mapping entry. */
  addEntry(entry: SourceMapEntry): void {
    this.entries.push(entry);
  }

  /** Add a mapping between artifact and source positions. */
  map(
    artifactOffset: number,
    artifactLength: number,
    sourceStart: number,
    sourceLength: number,
  ): void {
    this.entries.push({
      artifactOffset,
      artifactLength,
      sourceStart,
      sourceLength,
      sourceFile: this.sourceFile,
    });
  }

  /** Build the source map. */
  build(): SemanticSourceMap {
    return {
      entries: [...this.entries],
      sourceFile: this.sourceFile,
    };
  }
}

/** Trace from artifact back to graph sources. */
export const traceArtifact = (artifact: Artifact): string => {
  const lines: string[] = [];
  lines.push(`Artifact: ${artifact.id} (${artifact.target}:${artifact.kind})`);
  if (artifact.path) {
    lines.push(`  Path: ${artifact.path}`);
  }
  lines.push("  Generated from:");
  for (const src of artifact.generatedFrom) {
    lines.push(`    - ${src.kind}: ${src.id}${src.context ? ` (${src.context})` : ""}`);
  }
  lines.push(`  Generated by: ${artifact.generatedBy}`);
  return lines.join("\n");
};

/** Filter artifacts by target. */
export const filterByTarget = (
  artifacts: readonly Artifact[],
  target: ArtifactTarget,
): readonly Artifact[] => artifacts.filter((a) => a.target === target);

/** Filter artifacts by kind. */
export const filterByKind = (artifacts: readonly Artifact[], kind: string): readonly Artifact[] =>
  artifacts.filter((a) => a.kind === kind);

/** Group artifacts by target. */
export const groupByTarget = (
  artifacts: readonly Artifact[],
): Map<ArtifactTarget, readonly Artifact[]> => {
  const groups = new Map<ArtifactTarget, Artifact[]>();
  for (const artifact of artifacts) {
    const existing = groups.get(artifact.target) ?? [];
    groups.set(artifact.target, [...existing, artifact]);
  }
  return groups;
};

/** Group artifacts by path. */
export const groupByPath = (artifacts: readonly Artifact[]): Map<string, readonly Artifact[]> => {
  const groups = new Map<string, Artifact[]>();
  for (const artifact of artifacts) {
    const path = artifact.path ?? "<inline>";
    const existing = groups.get(path) ?? [];
    groups.set(path, [...existing, artifact]);
  }
  return groups;
};
