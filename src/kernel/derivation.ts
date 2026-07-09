/* @__NO_SIDE_EFFECTS__ */
/**
 * Graph derivations - inspectable recipes from graph facts to patches.
 */

import type { Diagnostic } from "./diagnostic.ts";
import type { KernelGraph } from "./graph.ts";
import { graphStageResult, type Explanation, type GraphStageResult } from "./stage.ts";
import { applyGraphPatches, type GraphPatch } from "./patch.ts";
import type { Surface } from "./surface.ts";

export interface GraphDerivationContext {
  readonly options?: Record<string, unknown>;
}

export type GraphDerivationOutput =
  | readonly GraphPatch[]
  | {
      readonly patches?: readonly GraphPatch[];
      readonly diagnostics?: readonly Diagnostic[];
      readonly explanations?: readonly Explanation[];
    }
  | GraphStageResult;

export interface GraphDerivation {
  readonly name: string;
  readonly reads: readonly string[];
  readonly emits: readonly string[];
  readonly diagnostics: readonly string[];
  readonly surface?: Surface;
  readonly explanation?: string;
  readonly run: (graph: KernelGraph, ctx?: GraphDerivationContext) => GraphStageResult;
}

const isPatchArray = (output: GraphDerivationOutput): output is readonly GraphPatch[] =>
  Array.isArray(output);

const isStageResult = (output: GraphDerivationOutput): output is GraphStageResult =>
  "graph" in output &&
  "patches" in output &&
  "diagnostics" in output &&
  "artifacts" in output &&
  "explanations" in output;

const normalizeDerivationOutput = (
  graph: KernelGraph,
  output: GraphDerivationOutput,
): GraphStageResult => {
  if (isStageResult(output)) return output;

  const patches = isPatchArray(output) ? output : (output.patches ?? []);
  const applied = applyGraphPatches(graph, patches);
  const diagnostics = isPatchArray(output)
    ? applied.diagnostics
    : [...(output.diagnostics ?? []), ...applied.diagnostics];

  return graphStageResult(applied.graph, {
    patches,
    diagnostics,
    explanations: isPatchArray(output) ? [] : output.explanations,
  });
};

class GraphDerivationBuilder {
  readonly #name: string;
  readonly #reads: readonly string[];
  readonly #emits: readonly string[];
  readonly #diagnostics: readonly string[];
  readonly #surface?: Surface;
  readonly #explanation?: string;

  constructor(
    name: string,
    input?: {
      readonly reads?: readonly string[];
      readonly emits?: readonly string[];
      readonly diagnostics?: readonly string[];
      readonly surface?: Surface;
      readonly explanation?: string;
    },
  ) {
    this.#name = name;
    this.#reads = input?.reads ?? [];
    this.#emits = input?.emits ?? [];
    this.#diagnostics = input?.diagnostics ?? [];
    this.#surface = input?.surface;
    this.#explanation = input?.explanation;
  }

  read(fact: string | { readonly id: string }): GraphDerivationBuilder {
    const id = typeof fact === "string" ? fact : fact.id;
    return new GraphDerivationBuilder(this.#name, {
      reads: [...this.#reads, id],
      emits: this.#emits,
      diagnostics: this.#diagnostics,
      surface: this.#surface,
      explanation: this.#explanation,
    });
  }

  emit(fact: string | { readonly id: string }): GraphDerivationBuilder {
    const id = typeof fact === "string" ? fact : fact.id;
    return new GraphDerivationBuilder(this.#name, {
      reads: this.#reads,
      emits: [...this.#emits, id],
      diagnostics: this.#diagnostics,
      surface: this.#surface,
      explanation: this.#explanation,
    });
  }

  diagnose(code: string): GraphDerivationBuilder {
    return new GraphDerivationBuilder(this.#name, {
      reads: this.#reads,
      emits: this.#emits,
      diagnostics: [...this.#diagnostics, code],
      surface: this.#surface,
      explanation: this.#explanation,
    });
  }

  surface(surface: Surface): GraphDerivationBuilder {
    return new GraphDerivationBuilder(this.#name, {
      reads: this.#reads,
      emits: this.#emits,
      diagnostics: this.#diagnostics,
      surface,
      explanation: this.#explanation,
    });
  }

  because(explanation: string): GraphDerivationBuilder {
    return new GraphDerivationBuilder(this.#name, {
      reads: this.#reads,
      emits: this.#emits,
      diagnostics: this.#diagnostics,
      surface: this.#surface,
      explanation,
    });
  }

  run(
    runner: (graph: KernelGraph, ctx?: GraphDerivationContext) => GraphDerivationOutput,
  ): GraphDerivation {
    return {
      name: this.#name,
      reads: this.#reads,
      emits: this.#emits,
      diagnostics: this.#diagnostics,
      surface: this.#surface,
      explanation: this.#explanation,
      run: (graph, ctx) => normalizeDerivationOutput(graph, runner(graph, ctx)),
    };
  }
}

export const graphDerivation = (name: string): GraphDerivationBuilder =>
  new GraphDerivationBuilder(name);
