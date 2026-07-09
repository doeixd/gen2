/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel graph morphisms (PLAN Track A §2).
 *
 * A `GraphMorphism` declares a typed transformation from a source `GraphPattern`
 * to a vocabulary of allowed outputs (`to.nodes`/`to.edges`/`to.artifacts`).
 * For each pattern match, the morphism's `map(match, helpers)` callback produces
 * patches (and optional diagnostics/explanations).
 *
 * Morphism makes derivation/lowering/import/emission specializations of one
 * execution model rather than independent shapes:
 *
 *   - `phase: "derivation"`  — emits new graph facts from existing facts
 *   - `phase: "lowering"`    — emits dialect-specific facts/artifacts
 *   - `phase: "import"`      — ingests external data as facts
 *   - `phase: "emission"`    — emits target artifacts (no graph mutation)
 *
 * The initial implementation is additive: `morphism.toDerivation()` compiles
 * the morphism to a `GraphDerivation` so existing pass infrastructure (the
 * pipeline runner, `GraphStageResult`, surface attachment) keeps working
 * unchanged. Direct execution via `morphism.run(graph)` is also exposed.
 *
 * **Not yet:** morphism dependencies, narrowed patch builders typed by `to`,
 * static/run meta facts for registration/provenance.
 */

import type { AnyEdgeKindDef, EndpointInputsFor, EdgeMetadataFor } from "./edge.ts";
import { type Diagnostic, defineDiagnostic } from "./diagnostic.ts";
import type { KernelGraph } from "./graph.ts";
import { graphPatch, type GraphPatch } from "./patch.ts";
import type { Explanation } from "./stage.ts";
import type { GraphMatch, GraphPattern, GraphPatternBindings, GraphPatternDef } from "./pattern.ts";
import type { NodeKindDef } from "./ods.ts";
import type { Surface } from "./surface.ts";
import type { NamespacedKernelId } from "./id.ts";
import type { Artifact } from "./artifact.ts";
import { graphDerivation, type GraphDerivation } from "./derivation.ts";

/** Phase the morphism participates in. */
export type MorphismPhase = "derivation" | "lowering" | "import" | "emission";

/** Vocabulary the morphism is permitted to emit. */
export interface MorphismTo<
  Nodes extends readonly NodeKindDef[] = readonly NodeKindDef[],
  Edges extends readonly AnyEdgeKindDef[] = readonly AnyEdgeKindDef[],
  Artifacts extends readonly string[] = readonly string[],
> {
  readonly nodes?: Nodes;
  readonly edges?: Edges;
  readonly artifacts?: Artifacts;
}

/** Output produced by a single `map(match)` invocation. */
export type MorphismMapOutput =
  | readonly GraphPatch[]
  | {
      readonly patches?: readonly GraphPatch[];
      readonly diagnostics?: readonly Diagnostic[];
      readonly explanations?: readonly Explanation[];
      readonly artifacts?: readonly Artifact[];
    };

/**
 * Patch builder narrowed to the morphism's declared `to` vocabulary.
 *
 * `addEdge` only accepts edge kinds listed in `to.edges`; `addNode` only
 * accepts node kinds listed in `to.nodes`. With an empty/default `to`, the
 * constraint widens to the kernel-wide types, so simple morphisms still
 * compile without ceremony.
 */
export interface MorphismPatchBuilder<
  Nodes extends readonly NodeKindDef[],
  Edges extends readonly AnyEdgeKindDef[],
> {
  readonly addEdge: <
    const Kind extends Edges[number] extends never ? AnyEdgeKindDef : Edges[number],
    const Id extends NamespacedKernelId<"edge", string, NoInfer<Kind>, string>,
    const Metadata extends EdgeMetadataFor<Kind> = EdgeMetadataFor<Kind>,
  >(
    kind: Kind,
    id: Id,
    endpoints: EndpointInputsFor<Kind>,
    input?: Parameters<typeof graphPatch.addEdge<Kind, Id, Metadata>>[3],
  ) => GraphPatch;
  readonly addNode: <
    const Kind extends Nodes[number] extends never ? NodeKindDef : Nodes[number],
    const Id extends NamespacedKernelId<"node", string, NoInfer<Kind>, string>,
  >(
    kind: Kind,
    id: Id,
    input?: Parameters<typeof graphPatch.addNode<Kind, Id, unknown, unknown>>[2],
  ) => GraphPatch;
}

/** Helpers passed to `map` callbacks. */
export interface MorphismMapHelpers<
  Nodes extends readonly NodeKindDef[] = readonly NodeKindDef[],
  Edges extends readonly AnyEdgeKindDef[] = readonly AnyEdgeKindDef[],
> {
  /** The full graph the morphism is running against. */
  readonly graph: KernelGraph;
  /** Patch builder narrowed to the morphism's declared `to` vocabulary. */
  readonly patch: MorphismPatchBuilder<Nodes, Edges>;
}

/** Input shape for `defineMorphism(...)`. */
export interface MorphismDef<
  Pattern extends GraphPatternDef,
  Nodes extends readonly NodeKindDef[] = readonly NodeKindDef[],
  Edges extends readonly AnyEdgeKindDef[] = readonly AnyEdgeKindDef[],
  Artifacts extends readonly string[] = readonly string[],
> {
  readonly name: string;
  readonly phase: MorphismPhase;
  readonly from: GraphPattern<Pattern>;
  readonly to: MorphismTo<Nodes, Edges, Artifacts>;
  readonly surface?: Surface;
  readonly explanation?: string;
  /**
   * Per-match transformation. Called once for each pattern match; outputs
   * are aggregated into the morphism's final result.
   *
   * Use `map` when each match is independent. Use `mapAll` when the
   * transformation needs cross-match aggregation (e.g. grouping matches by
   * one binding before emitting a single result per group).
   *
   * Exactly one of `map` / `mapAll` should be provided.
   */
  readonly map?: (
    match: GraphMatch<Pattern>,
    helpers: MorphismMapHelpers<Nodes, Edges>,
  ) => MorphismMapOutput;
  /**
   * Whole-result aggregation. Called once with all pattern matches; the
   * return value becomes the morphism's final output.
   */
  readonly mapAll?: (
    matches: readonly GraphMatch<Pattern>[],
    helpers: MorphismMapHelpers<Nodes, Edges>,
  ) => MorphismMapOutput;
  /**
   * Optional diagnostic codes the morphism may emit. Used to populate the
   * compiled derivation's `diagnostics` registration list (mirrors
   * `graphDerivation(...).diagnose(...)`).
   */
  readonly diagnostics?: readonly string[];
  /**
   * Optional names of other morphisms this one depends on (must run
   * before this morphism). Topological sort over `dependsOn` is
   * exposed via `kernel.topologicalSortMorphisms(...)` so pipeline
   * builders can honor the declared order without inferring it from
   * `from`/`to` vocabulary overlap.
   *
   * Cycles produce a `morphism:cyclic-dependency` diagnostic; unknown
   * names are tolerated and reported as `morphism:unknown-dependency`.
   */
  readonly dependsOn?: readonly string[];
}

const isPatchArray = (output: MorphismMapOutput): output is readonly GraphPatch[] =>
  Array.isArray(output);

const aggregateMatch = (
  output: MorphismMapOutput,
  acc: {
    patches: GraphPatch[];
    diagnostics: Diagnostic[];
    explanations: Explanation[];
    artifacts: Artifact[];
  },
): void => {
  if (isPatchArray(output)) {
    acc.patches.push(...output);
    return;
  }
  if (output.patches) acc.patches.push(...output.patches);
  if (output.diagnostics) acc.diagnostics.push(...output.diagnostics);
  if (output.explanations) acc.explanations.push(...output.explanations);
  if (output.artifacts) acc.artifacts.push(...output.artifacts);
};

/**
 * Compiled graph morphism. Walks pattern matches and aggregates each
 * `map(match)` into a single result.
 *
 * `Nodes`, `Edges`, and `Artifacts` preserve the morphism's declared
 * `to` vocabulary so callers can read `morphism.to.nodes` /
 * `morphism.to.edges` / `morphism.to.artifacts` as typed unions instead
 * of opaque `string[]`. This is a partial step toward broader pipeline
 * result generic narrowing (PLAN Track A §1a, §0.1a).
 */
export interface GraphMorphism<
  Pattern extends GraphPatternDef = GraphPatternDef,
  Nodes extends readonly NodeKindDef[] = readonly NodeKindDef[],
  Edges extends readonly AnyEdgeKindDef[] = readonly AnyEdgeKindDef[],
  Artifacts extends readonly string[] = readonly string[],
> {
  readonly kind: "graph.morphism";
  readonly name: string;
  readonly phase: MorphismPhase;
  readonly from: GraphPattern<Pattern>;
  readonly to: MorphismTo<Nodes, Edges, Artifacts>;
  readonly surface?: Surface;
  readonly explanation?: string;
  readonly diagnostics: readonly string[];
  /** Declared morphism dependencies (names of morphisms that must run first). */
  readonly dependsOn: readonly string[];
  /**
   * Run the morphism directly; returns aggregated patches/diagnostics/
   * explanations/artifacts. `producedBy` stamps the result with the
   * morphism name so callers can answer "which morphism produced this
   * patch?" without re-walking the pipeline (PLAN §0.1a — run meta
   * facts for execution/provenance).
   */
  readonly run: (graph: KernelGraph) => {
    readonly producedBy: string;
    readonly matchCount: number;
    readonly patches: readonly GraphPatch[];
    readonly diagnostics: readonly Diagnostic[];
    readonly explanations: readonly Explanation[];
    readonly artifacts: readonly Artifact[];
  };
  /** Compile to a `GraphDerivation` so the existing pass infra keeps working. */
  readonly toDerivation: () => GraphDerivation;
  /** Inspect typed match bindings (advanced: same as `from.materialize(graph)`). */
  readonly matches: (graph: KernelGraph) => readonly GraphMatch<Pattern>[];
}

/** Define a graph morphism. */
export const defineMorphism = <
  const Pattern extends GraphPatternDef,
  const Nodes extends readonly NodeKindDef[] = [],
  const Edges extends readonly AnyEdgeKindDef[] = [],
  const Artifacts extends readonly string[] = [],
>(
  def: MorphismDef<Pattern, Nodes, Edges, Artifacts>,
): GraphMorphism<Pattern, Nodes, Edges, Artifacts> => {
  const patchBuilder: MorphismPatchBuilder<Nodes, Edges> = {
    addEdge: ((kind, id, endpoints, input) =>
      graphPatch.addEdge(
        kind as AnyEdgeKindDef,
        id as NamespacedKernelId<"edge", string, AnyEdgeKindDef, string>,
        endpoints as EndpointInputsFor<AnyEdgeKindDef>,
        input,
      )) as MorphismPatchBuilder<Nodes, Edges>["addEdge"],
    addNode: ((kind, id, input) =>
      graphPatch.addNode(
        kind as NodeKindDef,
        id as NamespacedKernelId<"node", string, NodeKindDef, string>,
        input,
      )) as MorphismPatchBuilder<Nodes, Edges>["addNode"],
  };

  if (!def.map && !def.mapAll) {
    throw new Error(`Morphism "${def.name}": one of \`map\` or \`mapAll\` must be provided`);
  }
  if (def.map && def.mapAll) {
    throw new Error(`Morphism "${def.name}": specify either \`map\` or \`mapAll\`, not both`);
  }

  const run = (
    graph: KernelGraph,
  ): {
    producedBy: string;
    matchCount: number;
    patches: GraphPatch[];
    diagnostics: Diagnostic[];
    explanations: Explanation[];
    artifacts: Artifact[];
  } => {
    const acc = {
      patches: [] as GraphPatch[],
      diagnostics: [] as Diagnostic[],
      explanations: [] as Explanation[],
      artifacts: [] as Artifact[],
    };
    const helpers = { graph, patch: patchBuilder };
    const matches = def.from.materialize(graph);
    if (def.mapAll) {
      aggregateMatch(def.mapAll(matches, helpers), acc);
    } else if (def.map) {
      for (const match of matches) {
        aggregateMatch(def.map(match, helpers), acc);
      }
    }
    return { producedBy: def.name, matchCount: matches.length, ...acc };
  };

  const morphism: GraphMorphism<Pattern, Nodes, Edges, Artifacts> = {
    kind: "graph.morphism",
    name: def.name,
    phase: def.phase,
    from: def.from,
    to: def.to,
    surface: def.surface,
    explanation: def.explanation,
    diagnostics: def.diagnostics ?? [],
    dependsOn: def.dependsOn ?? [],
    run,
    matches: (graph) => def.from.materialize(graph),
    toDerivation: () => {
      let builder = graphDerivation(def.name);
      for (const node of def.to.nodes ?? []) builder = builder.read(node.id);
      for (const edge of def.to.edges ?? []) builder = builder.emit(edge.id);
      for (const code of def.diagnostics ?? []) builder = builder.diagnose(code);
      if (def.surface) builder = builder.surface(def.surface);
      if (def.explanation) builder = builder.because(def.explanation);
      return builder.run((graph) => {
        const result = run(graph);
        return {
          patches: result.patches,
          diagnostics: result.diagnostics,
          explanations: result.explanations,
        };
      });
    },
  };
  return morphism;
};

/** Type helper: extract the pattern bindings type from a morphism. */
export type MorphismBindings<M> =
  M extends GraphMorphism<infer Pattern> ? GraphPatternBindings<Pattern> : never;

/** Result of `topologicalSortMorphisms(...)`. */
export interface MorphismSortResult {
  /** Morphisms in dependency-respecting order. */
  readonly order: readonly GraphMorphism[];
  /**
   * Diagnostics emitted during sort:
   * - `morphism:cyclic-dependency` — a cycle was detected; remaining
   *   morphisms are appended in declaration order so the result is still
   *   usable, but the dependency invariant is violated.
   * - `morphism:unknown-dependency` — a `dependsOn` name doesn't match
   *   any morphism in the input set. Tolerated; the dependency edge is
   *   dropped.
   */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Topologically sort a set of morphisms by their declared `dependsOn`
 * names. Stable: ties break in declaration order.
 *
 * Unknown `dependsOn` names (no morphism in the input set has that
 * name) are reported as `morphism:unknown-dependency` diagnostics and
 * the edge is dropped — the dependency is treated as optional rather
 * than fatal. Cycles emit one `morphism:cyclic-dependency` diagnostic
 * naming the cycle members; the cycle's morphisms are appended to the
 * end of the order in declaration order so callers can still iterate.
 *
 * Pipeline builders can call this to honor declared morphism order
 * before scheduling without inferring it from `from` / `to` overlap
 * (PLAN §0.1a — typed pipelines as programs).
 */
export const topologicalSortMorphisms = (
  morphisms: readonly GraphMorphism[],
): MorphismSortResult => {
  const diagnostics: Diagnostic[] = [];
  const byName = new Map<string, GraphMorphism>();
  for (const m of morphisms) byName.set(m.name, m);

  type State = "unseen" | "visiting" | "done";
  const state = new Map<string, State>();
  for (const m of morphisms) state.set(m.name, "unseen");

  const order: GraphMorphism[] = [];
  const cycleMembers = new Set<string>();

  const visit = (m: GraphMorphism, stack: string[]): void => {
    const s = state.get(m.name);
    if (s === "done") return;
    if (s === "visiting") {
      const cycle = stack.slice(stack.indexOf(m.name)).concat(m.name);
      for (const name of cycle) cycleMembers.add(name);
      diagnostics.push(
        defineDiagnostic(
          "morphism:cyclic-dependency",
          "error",
          `Cyclic morphism dependency: ${cycle.join(" -> ")}`,
        ),
      );
      return;
    }
    state.set(m.name, "visiting");
    stack.push(m.name);
    for (const depName of m.dependsOn) {
      const dep = byName.get(depName);
      if (!dep) {
        diagnostics.push(
          defineDiagnostic(
            "morphism:unknown-dependency",
            "warning",
            `Morphism "${m.name}" depends on unknown morphism "${depName}"; dependency edge dropped.`,
          ),
        );
        continue;
      }
      visit(dep, stack);
    }
    stack.pop();
    state.set(m.name, "done");
    if (!cycleMembers.has(m.name)) order.push(m);
  };

  for (const m of morphisms) visit(m, []);
  // Append cycle members in declaration order so callers can still
  // iterate; the diagnostic flags the broken invariant.
  for (const m of morphisms) {
    if (cycleMembers.has(m.name)) order.push(m);
  }

  return { order, diagnostics };
};
