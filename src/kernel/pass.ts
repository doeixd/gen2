/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel pass - compiler transformations.
 *
 * A compiler transformation over the graph. Models the revised core Pass primitive.
 */

import type { KernelId } from "./id.ts";
import type { KernelGraph } from "./graph.ts";

/** Pass phase. */
export type PassPhase = "check" | "derive" | "lower" | "emit";

/** Pass result. */
export interface PassResult {
  readonly success: boolean;
  readonly diagnostics?: readonly PassDiagnostic[];
  readonly artifacts?: readonly KernelArtifact[];
  readonly modifiedGraph?: KernelGraph;
}

/** Diagnostic produced by a pass. */
export interface PassDiagnostic {
  readonly code: string;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly subject?: string;
  readonly suggestedFix?: string;
}

/** Artifact produced by a pass. */
export interface KernelArtifact {
  readonly id: KernelId;
  readonly target: string;
  readonly kind: string;
  readonly path?: string;
  readonly content?: string;
}

/** Kernel pass - a compiler transformation. */
export interface KernelPass {
  readonly id: KernelId<"pass">;
  readonly name: string;
  readonly phase: PassPhase;
  readonly description?: string;
  readonly reads?: readonly string[];
  readonly writes?: readonly string[];
  readonly requiresTraits?: readonly string[];
}

/** Runner for a pass. */
export type PassRunner = (graph: KernelGraph, ctx: PassContext) => PassResult;

/** Context passed to a pass runner. */
export interface PassContext {
  readonly config?: Record<string, unknown>;
  readonly options?: Record<string, unknown>;
}

/** Create a kernel pass. */
export const definePass = (
  name: string,
  phase: PassPhase,
  input?: {
    readonly description?: string;
    readonly reads?: readonly string[];
    readonly writes?: readonly string[];
    readonly requiresTraits?: readonly string[];
  },
): Omit<KernelPass, "id"> => ({
  name,
  phase,
  description: input?.description,
  reads: input?.reads,
  writes: input?.writes,
  requiresTraits: input?.requiresTraits,
});

/** Built-in pass names by phase. */
export const BUILT_IN_PASSES = {
  CHECK: {
    RELATION: "relation.check",
    ENTITY: "entity.check",
    EXPRESSION: "expression.check",
    TRAIT: "trait.check",
    TYPE: "type.check",
    NODE: "node.check",
    EDGE: "edge.check",
  },
  DERIVE: {
    ENTITY_FIELD_RELATIONSHIPS: "derive.entity.fieldRelationships",
    RULE_READS: "derive.rule.reads",
    ACTION_WRITES: "derive.action.writes",
    QUERY_READS: "derive.query.reads",
    AUTH_GUARDS: "derive.auth.guards",
    REACTIVITY_INVALIDATES: "derive.reactivity.invalidates",
    STORAGE_MAPS_TO: "derive.storage.mapsTo",
    ARTIFACT_GENERATED_FROM: "derive.artifact.generatedFrom",
  },
  LOWER: {
    ENTITY_TO_TABLE: "lower.entity.toTable",
    RULE_TO_PREDICATE: "lower.rule.toPredicate",
    ACTION_TO_HANDLER: "lower.action.toHandler",
    VIEW_TO_COMPONENT: "lower.view.toComponent",
    TYPE_TO_JSON_SCHEMA: "lower.type.toJsonSchema",
    PROVIDER_TO_LAYER: "lower.provider.toLayer",
  },
  EMIT: {
    SQL: "emit.sql",
    TYPESCRIPT: "emit.typescript",
    JSON: "emit.json",
    OPENAPI: "emit.openapi",
    DOCS: "emit.docs",
  },
} as const;

/** Pass registry. */
export class PassRegistry {
  readonly #passes: Map<string, { pass: Omit<KernelPass, "id">; runner: PassRunner }>;

  constructor() {
    this.#passes = new Map();
  }

  /** Register a pass. */
  register(
    pass: Omit<KernelPass, "id">,
    runner: PassRunner,
  ): void {
    this.#passes.set(pass.name, { pass, runner });
  }

  /** Run a pass by name. */
  run(name: string, graph: KernelGraph, ctx?: PassContext): PassResult {
    const entry = this.#passes.get(name);
    if (!entry) {
      return {
        success: false,
        diagnostics: [{
          code: "pass:not-found",
          severity: "error",
          message: `Pass "${name}" not found`,
        }],
      };
    }
    return entry.runner(graph, ctx ?? {});
  }

  /** Run all passes in a phase. */
  runPhase(phase: PassPhase, graph: KernelGraph, ctx?: PassContext): PassResult {
    const results: PassResult[] = [];
    for (const entry of this.#passes.values()) {
      if (entry.pass.phase === phase) {
        results.push(entry.runner(graph, ctx ?? {}));
      }
    }
    const allSuccess = results.every((r) => r.success);
    return {
      success: allSuccess,
      diagnostics: results.flatMap((r) => r.diagnostics ?? []),
      modifiedGraph: results.reduce((g, r) => r.modifiedGraph ?? g, graph),
    };
  }

  /** List all registered passes. */
  list(): readonly { name: string; phase: PassPhase }[] {
    return Array.from(this.#passes.values()).map((e) => ({
      name: e.pass.name,
      phase: e.pass.phase,
    }));
  }
}

/** Default pass registry instance. */
export const defaultPassRegistry = new PassRegistry();

/** Run a pipeline of passes. */
export const runPassPipeline = (
  passes: readonly string[],
  graph: KernelGraph,
  ctx?: PassContext,
): PassResult => {
  let currentGraph = graph;
  const allDiagnostics: PassDiagnostic[] = [];

  for (const passName of passes) {
    const result = defaultPassRegistry.run(passName, currentGraph, ctx);
    allDiagnostics.push(...result.diagnostics ?? []);
    if (result.modifiedGraph) {
      currentGraph = result.modifiedGraph;
    }
    if (!result.success) {
      return {
        success: false,
        diagnostics: allDiagnostics,
        modifiedGraph: currentGraph,
      };
    }
  }

  return {
    success: true,
    diagnostics: allDiagnostics,
    modifiedGraph: currentGraph,
  };
};