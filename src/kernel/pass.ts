/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel pass - compiler transformations.
 *
 * A compiler transformation over the graph. Models the revised core Pass primitive.
 *
 * Diagnostics and artifacts use the rich shapes defined in `./diagnostic.ts`
 * and `./artifact.ts`. The slim `PassDiagnostic` / `KernelArtifact`
 * forks were removed (PLAN.md §7 quick win #2). Use `defineDiagnostic`
 * to construct diagnostics — it generates deterministic IDs.
 */

import type { KernelId } from "./id.ts";
import type { KernelGraph } from "./graph.ts";
import { defineDiagnostic, type Diagnostic } from "./diagnostic.ts";
import type { Artifact } from "./artifact.ts";
import type { GraphPatch } from "./patch.ts";
import { summarizeStageResult, type Explanation, type StageResultSummary } from "./stage.ts";

/** Pass phase — R10 pipeline ordering. */
export type PassPhase =
  | "verify-symbols"
  | "verify-dialects"
  | "derive"
  | "canonicalize"
  | "legalize"
  | "lower"
  | "emit";

/**
 * Pass result.
 *
 * Generic parameters are additive seams toward broader pipeline result
 * narrowing (PLAN §0.1a — typed pipelines as programs). With the
 * defaults below the shape is identical to the pre-generic interface,
 * so existing callers don't need to change. When a pipeline carries a
 * typed witness (`definePipeline(...)`), `runPassPipeline` /
 * `runNamedPipeline` can later instantiate these parameters with the
 * pipeline's declared artifact/diagnostic/patch unions so consumer
 * code sees narrowed types without casts.
 */
export interface PassResult<
  TArtifact extends Artifact = Artifact,
  TDiagnostic extends Diagnostic = Diagnostic,
  TPatch extends GraphPatch = GraphPatch,
> {
  readonly success: boolean;
  readonly diagnostics?: readonly TDiagnostic[];
  readonly artifacts?: readonly TArtifact[];
  readonly patches?: readonly TPatch[];
  readonly explanations?: readonly Explanation[];
  readonly modifiedGraph?: KernelGraph;
}

// Re-export the rich shapes for convenience so pass authors don't have
// to import from two files.
export { defineDiagnostic, type Diagnostic } from "./diagnostic.ts";
export type { Artifact } from "./artifact.ts";

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
  VERIFY_SYMBOLS: {
    ENTITY: "verify-symbols.entity",
    REF: "verify-symbols.ref",
    FUNCTION: "verify-symbols.function",
  },
  VERIFY_DIALECTS: {
    NODE_KINDS: "verify-dialects.nodeKinds",
    EDGE_KINDS: "verify-dialects.edgeKinds",
    TRAITS: "verify-dialects.traits",
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
  CANONICALIZE: {
    EXPRESSION: "canonicalize.expression",
    PREDICATE: "canonicalize.predicate",
  },
  LEGALIZE: {
    TARGET_COMPATIBILITY: "legalize.targetCompatibility",
    PLACEMENT: "legalize.placement",
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

/** Pipeline definition — an ordered list of pass names. */
export interface PipelineDef<
  Name extends string = string,
  Passes extends readonly string[] = readonly string[],
> {
  readonly name: Name;
  readonly passes: Passes;
  readonly $infer?: {
    readonly name: Name;
    readonly passes: Passes;
  };
}

export type PipelineInput = readonly string[] | PipelineDef;

/** Preserve literal pipeline names and pass tuples at the authoring boundary. */
export const definePipeline = <const Name extends string, const Passes extends readonly string[]>(
  name: Name,
  passes: Passes,
): PipelineDef<Name, Passes> => ({
  name,
  passes,
});

const pipelinePasses = (pipeline: PipelineInput): readonly string[] =>
  "passes" in pipeline ? pipeline.passes : pipeline;

/** Pre-defined pipelines per R10. */
export const PIPELINES = {
  /** Core check pipeline: verify → derive → canonicalize → legalize. */
  CHECK: {
    name: "gen2-check",
    passes: [
      BUILT_IN_PASSES.VERIFY_SYMBOLS.ENTITY,
      BUILT_IN_PASSES.VERIFY_SYMBOLS.REF,
      BUILT_IN_PASSES.VERIFY_SYMBOLS.FUNCTION,
      BUILT_IN_PASSES.VERIFY_DIALECTS.NODE_KINDS,
      BUILT_IN_PASSES.VERIFY_DIALECTS.EDGE_KINDS,
      BUILT_IN_PASSES.VERIFY_DIALECTS.TRAITS,
      BUILT_IN_PASSES.DERIVE.ENTITY_FIELD_RELATIONSHIPS,
      BUILT_IN_PASSES.DERIVE.RULE_READS,
      BUILT_IN_PASSES.DERIVE.ACTION_WRITES,
      BUILT_IN_PASSES.DERIVE.QUERY_READS,
      BUILT_IN_PASSES.DERIVE.AUTH_GUARDS,
      BUILT_IN_PASSES.DERIVE.REACTIVITY_INVALIDATES,
      BUILT_IN_PASSES.CANONICALIZE.EXPRESSION,
      BUILT_IN_PASSES.CANONICALIZE.PREDICATE,
      BUILT_IN_PASSES.LEGALIZE.TARGET_COMPATIBILITY,
      BUILT_IN_PASSES.LEGALIZE.PLACEMENT,
    ],
  } satisfies PipelineDef,
  /** Postgres target pipeline: check + lower + emit.sql. */
  POSTGRES: {
    name: "gen2-postgres",
    passes: [BUILT_IN_PASSES.LOWER.ENTITY_TO_TABLE, BUILT_IN_PASSES.EMIT.SQL],
  } satisfies PipelineDef,
  /** TypeScript target pipeline. */
  TYPESCRIPT: {
    name: "gen2-typescript",
    passes: [BUILT_IN_PASSES.LOWER.VIEW_TO_COMPONENT, BUILT_IN_PASSES.EMIT.TYPESCRIPT],
  } satisfies PipelineDef,
  /** OpenAPI target pipeline. */
  OPENAPI: {
    name: "gen2-openapi",
    passes: [BUILT_IN_PASSES.LOWER.TYPE_TO_JSON_SCHEMA, BUILT_IN_PASSES.EMIT.OPENAPI],
  } satisfies PipelineDef,
  /** Docs target pipeline. */
  DOCS: {
    name: "gen2-docs",
    passes: [BUILT_IN_PASSES.EMIT.DOCS],
  } satisfies PipelineDef,
} as const;

/** Registry for named pass pipelines. */
export class PipelineRegistry {
  readonly #pipelines: Map<string, PipelineDef>;

  constructor(pipelines: readonly PipelineDef[] = []) {
    this.#pipelines = new Map();
    for (const pipeline of pipelines) {
      this.register(pipeline);
    }
  }

  /** Register or replace a named pipeline. */
  register(pipeline: PipelineDef): void {
    this.#pipelines.set(pipeline.name, pipeline);
  }

  /** Check if a pipeline exists. */
  has(name: string): boolean {
    return this.#pipelines.has(name);
  }

  /** Get a pipeline by name. */
  get(name: string): PipelineDef | undefined {
    return this.#pipelines.get(name);
  }

  /** List all registered pipelines. */
  list(): readonly PipelineDef[] {
    return Array.from(this.#pipelines.values());
  }

  /** Clear all registered pipelines. */
  clear(): void {
    this.#pipelines.clear();
  }
}

/** Pass registry. */
export class PassRegistry {
  readonly #passes: Map<string, { pass: Omit<KernelPass, "id">; runner: PassRunner }>;

  constructor() {
    this.#passes = new Map();
  }

  /** Register a pass. */
  register(pass: Omit<KernelPass, "id">, runner: PassRunner): void {
    this.#passes.set(pass.name, { pass, runner });
  }

  /** Run a pass by name. */
  run(name: string, graph: KernelGraph, ctx?: PassContext): PassResult {
    const entry = this.#passes.get(name);
    if (!entry) {
      return {
        success: false,
        diagnostics: [
          {
            code: "pass:not-found",
            severity: "error",
            message: `Pass "${name}" not found`,
            refs: [],
          },
        ],
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
      artifacts: results.flatMap((r) => r.artifacts ?? []),
      patches: results.flatMap((r) => r.patches ?? []),
      explanations: results.flatMap((r) => r.explanations ?? []),
      modifiedGraph: results.reduce((g, r) => r.modifiedGraph ?? g, graph),
    };
  }

  /** Check if a pass is registered. */
  has(name: string): boolean {
    return this.#passes.has(name);
  }

  /** List all registered passes. */
  list(): readonly { name: string; phase: PassPhase }[] {
    return Array.from(this.#passes.values()).map((e) => ({
      name: e.pass.name,
      phase: e.pass.phase,
    }));
  }

  /** Remove all registered passes. Primarily used by tests and lifecycle resets. */
  clear(): void {
    this.#passes.clear();
  }
}

/** Default pass registry instance. */
export const defaultPassRegistry = new PassRegistry();

/** Run a pipeline of passes through a given registry. */
export const runPassPipeline = (
  passes: PipelineInput,
  graph: KernelGraph,
  registry: PassRegistry = defaultPassRegistry,
  ctx?: PassContext,
): PassResult => {
  let currentGraph = graph;
  const allDiagnostics: Diagnostic[] = [];
  const allArtifacts: Artifact[] = [];
  const allPatches: GraphPatch[] = [];
  const allExplanations: Explanation[] = [];

  for (const passName of pipelinePasses(passes)) {
    const result = registry.run(passName, currentGraph, ctx);
    allDiagnostics.push(...(result.diagnostics ?? []));
    if (result.artifacts) allArtifacts.push(...result.artifacts);
    if (result.patches) allPatches.push(...result.patches);
    if (result.explanations) allExplanations.push(...result.explanations);
    if (result.modifiedGraph) {
      currentGraph = result.modifiedGraph;
    }
    if (!result.success && ctx?.options?.continueOnError !== true) {
      return {
        success: false,
        diagnostics: allDiagnostics,
        artifacts: allArtifacts,
        patches: allPatches,
        explanations: allExplanations,
        modifiedGraph: currentGraph,
      };
    }
  }

  return {
    success: true,
    diagnostics: allDiagnostics,
    artifacts: allArtifacts,
    patches: allPatches,
    explanations: allExplanations,
    modifiedGraph: currentGraph,
  };
};

export interface PassPipelinePreview {
  readonly result: PassResult;
  readonly summary: StageResultSummary;
}

/** Run a pipeline and return a structured preview summary alongside the raw result. */
export const previewPassPipeline = (
  passes: PipelineInput,
  graph: KernelGraph,
  registry: PassRegistry = defaultPassRegistry,
  ctx?: PassContext,
): PassPipelinePreview => {
  const result = runPassPipeline(passes, graph, registry, ctx);
  return {
    result,
    summary: summarizeStageResult(result),
  };
};

/** Run a named pipeline through a given registry. */
export const runNamedPipeline = (
  pipeline: PipelineDef | string,
  graph: KernelGraph,
  registry: PassRegistry = defaultPassRegistry,
  ctx?: PassContext & { readonly pipelineRegistry?: PipelineRegistry },
): PassResult => {
  const resolved = typeof pipeline === "string" ? ctx?.pipelineRegistry?.get(pipeline) : pipeline;
  if (!resolved) {
    const pipelineName = typeof pipeline === "string" ? pipeline : pipeline.name;
    return {
      success: false,
      diagnostics: [
        defineDiagnostic("pipeline:not-found", "error", `Pipeline "${pipelineName}" not found`),
      ],
    };
  }
  return runPassPipeline(resolved, graph, registry, ctx);
};
