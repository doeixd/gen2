/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel dialect - MLIR-style dialect system.
 *
 * Dialects group operations, types, and attributes for a logical domain.
 * They own node kinds, edge kinds, traits, verifiers, canonicalizers, and lowering rules.
 */

import type { KernelMetadata } from "./metadata.ts";
import type { TraitDef } from "./trait.ts";
import type { NodeKindDef, EdgeKindDef, EndpointRoleDef } from "./ods.ts";
import type { KernelPass } from "./pass.ts";
import type { Lowering } from "./lower.ts";
import type { NamespaceIdFactory } from "./id.ts";
import { createIdFactory } from "./id.ts";
import type { GraphMorphism } from "./morphism.ts";
import type { Surface } from "./surface.ts";
import { type Diagnostic, defineDiagnostic } from "./diagnostic.ts";

/** Dialect identity - unique symbol for type-level differentiation. */
export interface DialectId<Id extends string = string> {
  readonly __dialectId: unique symbol;
  readonly value: Id;
}

/** Create a dialect ID. */
export const dialectId = <const Id extends string>(id: Id): DialectId<Id> =>
  ({ __dialectId: Symbol(id), value: id }) as DialectId<Id>;

/** A kernel dialect - groups related node kinds, edge kinds, traits, and passes. */
export interface Dialect<
  Id extends DialectId = DialectId,
  NodeKinds extends readonly NodeKindDef[] = readonly NodeKindDef[],
  EdgeKinds extends readonly EdgeKindDef[] = readonly EdgeKindDef[],
  EndpointRoles extends readonly EndpointRoleDef[] = readonly EndpointRoleDef[],
  Traits extends readonly TraitDef[] = readonly TraitDef[],
  Passes extends readonly KernelPass[] = readonly KernelPass[],
  Lowerings extends readonly Lowering[] = readonly Lowering[],
  Namespace extends string = string,
  Morphisms extends readonly GraphMorphism[] = readonly GraphMorphism[],
> {
  /** Stable symbolic dialect identity used for registration and lookup. */
  readonly dialectId: Id;
  /** Dialect-owned ID/ref factory branded with this dialect's namespace. */
  readonly id: NamespaceIdFactory<Namespace>;
  readonly label: string;
  /**
   * Stable namespace literal used by `id.*` and `parse.*` IDs.
   * Branded into every namespace-bound ID/ref so cross-dialect ref mixups
   * fail at the type level. When omitted, derived from `id.value`.
   */
  readonly namespace: Namespace;
  readonly nodeKinds: NodeKinds;
  readonly edgeKinds: EdgeKinds;
  readonly endpointRoles: EndpointRoles;
  readonly traits: Traits;
  readonly passes: Passes;
  readonly lowerings: Lowerings;
  /**
   * Morphisms registered with this dialect (PLAN Track A §2).
   * Surfaces and emit-phase morphisms are derived from this tuple.
   */
  readonly morphisms: Morphisms;
  /**
   * Surfaces derived from `morphisms[*].surface`. Materializes the public
   * lowerability/derivation/emit contract exposed by this dialect (PLAN §B3b).
   * One entry per unique surface witness; order matches morphism declaration.
   */
  readonly surfaces: readonly Surface[];
  readonly metadata?: KernelMetadata;
}

/** Input for constructing a dialect. */
export interface DialectDef<
  Id extends DialectId = DialectId,
  NodeKinds extends readonly NodeKindDef[] = readonly NodeKindDef[],
  EdgeKinds extends readonly EdgeKindDef[] = readonly EdgeKindDef[],
  EndpointRoles extends readonly EndpointRoleDef[] = readonly EndpointRoleDef[],
  Traits extends readonly TraitDef[] = readonly TraitDef[],
  Passes extends readonly KernelPass[] = readonly KernelPass[],
  Lowerings extends readonly Lowering[] = readonly Lowering[],
  Namespace extends string = string,
  Morphisms extends readonly GraphMorphism[] = readonly GraphMorphism[],
> {
  readonly id: Id;
  readonly label: string;
  /** Optional namespace literal. When omitted, derived from `id.value`. */
  readonly namespace?: Namespace;
  readonly nodeKinds?: NodeKinds;
  readonly edgeKinds?: EdgeKinds;
  readonly endpointRoles?: EndpointRoles;
  readonly traits?: Traits;
  readonly passes?: Passes;
  readonly lowerings?: Lowerings;
  /**
   * Morphisms owned by this dialect. `Dialect.surfaces` is derived from
   * `morphisms[*].surface`; cross-track passes can walk `dialect.morphisms`
   * to discover the dialect's public contract.
   */
  readonly morphisms?: Morphisms;
  readonly metadata?: KernelMetadata;
}

const deriveNamespace = (value: string): string =>
  value.startsWith("dialect.") ? value.slice("dialect.".length) : value;

/** Create a dialect from its definition. */
export const defineDialect = <
  const Id extends DialectId,
  const NodeKinds extends readonly NodeKindDef[] = [],
  const EdgeKinds extends readonly EdgeKindDef[] = [],
  const EndpointRoles extends readonly EndpointRoleDef[] = [],
  const Traits extends readonly TraitDef[] = [],
  const Passes extends readonly KernelPass[] = [],
  const Lowerings extends readonly Lowering[] = [],
  const Namespace extends string = string,
  const Morphisms extends readonly GraphMorphism[] = [],
>(
  def: DialectDef<
    Id,
    NodeKinds,
    EdgeKinds,
    EndpointRoles,
    Traits,
    Passes,
    Lowerings,
    Namespace,
    Morphisms
  >,
): Dialect<
  Id,
  NodeKinds,
  EdgeKinds,
  EndpointRoles,
  Traits,
  Passes,
  Lowerings,
  Namespace,
  Morphisms
> => {
  const namespace = (def.namespace ?? deriveNamespace(def.id.value)) as Namespace;
  const dialectFactory = createIdFactory(namespace);
  // Use mutable arrays internally so `attachMorphism(...)` can register
  // late-bound morphisms (e.g. lowering passes whose body lives in a
  // higher layer than the dialect file can import). The arrays are still
  // exposed as `readonly` to consumers.
  const morphisms: GraphMorphism[] = def.morphisms ? [...def.morphisms] : [];
  const seenSurfaceIds = new Set<string>();
  const surfaces: Surface[] = [];
  for (const m of morphisms) {
    if (!m.surface) continue;
    const surfaceId = m.surface.id?.value ?? "";
    if (surfaceId && seenSurfaceIds.has(surfaceId)) continue;
    if (surfaceId) seenSurfaceIds.add(surfaceId);
    surfaces.push(m.surface);
  }
  return {
    dialectId: def.id,
    id: dialectFactory,
    label: def.label,
    namespace,
    nodeKinds: def.nodeKinds ?? ([] as unknown as NodeKinds),
    edgeKinds: def.edgeKinds ?? ([] as unknown as EdgeKinds),
    endpointRoles: def.endpointRoles ?? ([] as unknown as EndpointRoles),
    traits: def.traits ?? ([] as unknown as Traits),
    passes: def.passes ?? ([] as unknown as Passes),
    lowerings: def.lowerings ?? ([] as unknown as Lowerings),
    morphisms: morphisms as unknown as Morphisms,
    surfaces,
    metadata: def.metadata,
  };
};

/**
 * Attach a morphism to an existing dialect post-construction. Dedups by
 * morphism name. If the morphism declares a surface, the surface is also
 * appended to `dialect.surfaces` (deduplicated by surface id).
 *
 * Use this when the morphism's body lives in a layer the dialect file
 * cannot import directly (e.g. legalization passes that depend on
 * cross-cutting helpers). Idempotent: a second call with the same
 * morphism name is a no-op.
 *
 * Mutates the dialect in place. Callers should invoke this during module
 * initialization (typically alongside `registerPass`) so consumers see
 * the morphism before any pipeline preview reads `dialect.morphisms`.
 */
export const attachMorphism = (dialect: Dialect, morphism: GraphMorphism): void => {
  const morphisms = dialect.morphisms as GraphMorphism[];
  if (morphisms.some((m) => m.name === morphism.name)) return;
  morphisms.push(morphism);
  if (morphism.surface) {
    const surfaces = dialect.surfaces as Surface[];
    const sId = morphism.surface.id?.value;
    const exists = sId
      ? surfaces.some((s) => s.id?.value === sId)
      : surfaces.includes(morphism.surface);
    if (!exists) surfaces.push(morphism.surface);
  }
};

/**
 * Dialect registry - provides lookup by node kind, edge kind, or trait.
 *
 * Allows passes and emiters to discover which dialect owns a given concept.
 */
export class DialectRegistry {
  private readonly byNodeKind = new Map<string, Dialect>();
  private readonly byEdgeKind = new Map<string, Dialect>();
  private readonly byTrait = new Map<string, Dialect>();
  private readonly byId = new Map<DialectId, Dialect>();
  private readonly _all: Dialect[];

  constructor(dialects: readonly Dialect[]) {
    this._all = [...dialects];
    for (const d of dialects) {
      this.byId.set(d.dialectId, d);
      for (const n of d.nodeKinds) this.byNodeKind.set(n.id, d);
      for (const e of d.edgeKinds) this.byEdgeKind.set(e.id, d);
      for (const t of d.traits) this.byTrait.set(t.id, d);
    }
  }

  /** Register a new dialect. Returns conflicts (duplicate ids) if any. */
  add(dialect: Dialect): { kind: "nodeKind" | "edgeKind" | "trait" | "dialect"; id: string }[] {
    const conflicts: { kind: "nodeKind" | "edgeKind" | "trait" | "dialect"; id: string }[] = [];

    if (this.byId.has(dialect.dialectId)) {
      conflicts.push({ kind: "dialect", id: dialect.dialectId.value });
    }
    for (const n of dialect.nodeKinds) {
      if (this.byNodeKind.has(n.id)) conflicts.push({ kind: "nodeKind", id: n.id });
    }
    for (const e of dialect.edgeKinds) {
      if (this.byEdgeKind.has(e.id)) conflicts.push({ kind: "edgeKind", id: e.id });
    }
    for (const t of dialect.traits) {
      if (this.byTrait.has(t.id)) conflicts.push({ kind: "trait", id: t.id });
    }

    if (conflicts.length === 0) {
      this._all.push(dialect);
      this.byId.set(dialect.dialectId, dialect);
      for (const n of dialect.nodeKinds) this.byNodeKind.set(n.id, dialect);
      for (const e of dialect.edgeKinds) this.byEdgeKind.set(e.id, dialect);
      for (const t of dialect.traits) this.byTrait.set(t.id, dialect);
    }

    return conflicts;
  }

  /** Get the dialect that owns a node kind. */
  getDialectForNodeKind(kindId: string): Dialect | undefined {
    return this.byNodeKind.get(kindId);
  }

  /** Get the dialect that owns an edge kind. */
  getDialectForEdgeKind(kindId: string): Dialect | undefined {
    return this.byEdgeKind.get(kindId);
  }

  /** Get the dialect that owns a trait. */
  getDialectForTrait(traitId: string): Dialect | undefined {
    return this.byTrait.get(traitId);
  }

  /** Get a dialect by its ID. */
  getById(id: DialectId): Dialect | undefined {
    return this.byId.get(id);
  }

  /** Get all registered dialects. */
  getAll(): readonly Dialect[] {
    return this._all;
  }
}

/** Built-in dialects. */
export const BUILT_IN_DIALECTS = {
  CORE: dialectId("dialect.core"),
  DOMAIN: dialectId("dialect.domain"),
  EXPR: dialectId("dialect.expr"),
  CALLABLE: dialectId("dialect.callable"),
  STORAGE: dialectId("dialect.storage"),
  REACTIVITY: dialectId("dialect.reactivity"),
  UI: dialectId("dialect.ui"),
} as const;

/**
 * Verify that a dialect has been registered with the given registry.
 *
 * Use this on dynamic / plugin dialects whose node-kind, edge-kind,
 * trait, or morphism lookups would silently miss when the dialect was
 * created but never registered. Returns:
 *
 * - `[]` when `dialect` is present in the registry (`registry.getById`
 *   resolves to the same `dialectId`);
 * - one `dialect:not-registered` error diagnostic otherwise.
 *
 * Static core dialects don't need this check because they are
 * unconditionally registered at bootstrap. Plugin dialects that may be
 * created lazily, side-loaded, or imported in the wrong order benefit
 * from a typed diagnostic instead of a silent capability gap.
 */
export const verifyDialectRegistered = (
  registry: DialectRegistry,
  dialect: Dialect,
): readonly Diagnostic[] => {
  const found = registry.getById(dialect.dialectId);
  if (found === dialect) return [];
  if (found && found.dialectId.value === dialect.dialectId.value) return [];
  return [
    defineDiagnostic(
      "dialect:not-registered",
      "error",
      `Dialect "${dialect.dialectId.value}" (${dialect.label}) is not registered with the active dialect registry. ` +
        `Pass it to the registry constructor or call \`registry.add(dialect)\` before consumers query node/edge/trait/morphism ownership.`,
    ),
  ];
};

/**
 * Static meta-graph fact about a morphism registered on a dialect.
 *
 * Materializes the implicit relationships a `defineMorphism(...)` /
 * `attachMorphism(...)` registration declares — which dialect owns it,
 * which node/edge kinds it reads (from its pattern), which node/edge
 * kinds and artifact kinds it emits (from its `to` vocabulary), and
 * which surface it advertises. Devtools, `app.preview`,
 * capability reports, and the lowerability matrix can query these
 * facts without re-walking the morphism's internal shape (PLAN §0.1a,
 * §0.1b — "registering ... should create meta facts").
 */
export type MorphismMetaFact =
  | { readonly kind: "Morphism"; readonly morphism: string; readonly phase: string }
  | {
      readonly kind: "BelongsToDialect";
      readonly morphism: string;
      readonly dialect: string;
    }
  | { readonly kind: "ReadsNodeKind"; readonly morphism: string; readonly nodeKind: string }
  | { readonly kind: "ReadsEdgeKind"; readonly morphism: string; readonly edgeKind: string }
  | { readonly kind: "EmitsNodeKind"; readonly morphism: string; readonly nodeKind: string }
  | { readonly kind: "EmitsEdgeKind"; readonly morphism: string; readonly edgeKind: string }
  | {
      readonly kind: "EmitsArtifactKind";
      readonly morphism: string;
      readonly artifactKind: string;
    }
  | { readonly kind: "HasSurface"; readonly morphism: string; readonly surface: string }
  | {
      readonly kind: "DiagnoseCode";
      readonly morphism: string;
      readonly diagnosticCode: string;
    };

/**
 * Run-time meta fact emitted by `morphismRunMetaFacts(...)`. Captures
 * which morphism produced which output at execution time so devtools
 * and `app.explain` can answer "what came from where" without
 * re-deriving provenance (PLAN §0.1a — run meta facts for
 * execution/provenance).
 */
export type MorphismRunMetaFact =
  | { readonly kind: "RanMorphism"; readonly morphism: string; readonly matchCount: number }
  | { readonly kind: "ProducedPatch"; readonly morphism: string; readonly index: number }
  | {
      readonly kind: "ProducedDiagnostic";
      readonly morphism: string;
      readonly diagnosticCode: string;
      readonly index: number;
    }
  | {
      readonly kind: "ProducedArtifact";
      readonly morphism: string;
      readonly artifactId: string;
      readonly artifactKind: string;
      readonly index: number;
    }
  | { readonly kind: "ProducedExplanation"; readonly morphism: string; readonly index: number };

/**
 * Materialize per-run meta facts from a morphism run result. Emits one
 * `RanMorphism` fact (with match count), plus one `Produced*` fact per
 * patch / diagnostic / artifact / explanation in the run output.
 *
 * Pure read — does not mutate the morphism or the run result. Use this
 * to attach execution provenance to a pipeline preview, devtool
 * panel, or `app.explain(subject)` answer.
 */
export const morphismRunMetaFacts = (result: {
  readonly producedBy: string;
  readonly matchCount: number;
  readonly patches: readonly { readonly id?: unknown }[];
  readonly diagnostics: readonly { readonly code: string }[];
  readonly artifacts: readonly { readonly id: unknown; readonly kind: string }[];
  readonly explanations: readonly unknown[];
}): readonly MorphismRunMetaFact[] => {
  const facts: MorphismRunMetaFact[] = [
    { kind: "RanMorphism", morphism: result.producedBy, matchCount: result.matchCount },
  ];
  for (let i = 0; i < result.patches.length; i += 1) {
    facts.push({ kind: "ProducedPatch", morphism: result.producedBy, index: i });
  }
  for (let i = 0; i < result.diagnostics.length; i += 1) {
    facts.push({
      kind: "ProducedDiagnostic",
      morphism: result.producedBy,
      diagnosticCode: result.diagnostics[i]!.code,
      index: i,
    });
  }
  for (let i = 0; i < result.artifacts.length; i += 1) {
    const a = result.artifacts[i]!;
    facts.push({
      kind: "ProducedArtifact",
      morphism: result.producedBy,
      artifactId: String(a.id),
      artifactKind: a.kind,
      index: i,
    });
  }
  for (let i = 0; i < result.explanations.length; i += 1) {
    facts.push({ kind: "ProducedExplanation", morphism: result.producedBy, index: i });
  }
  return facts;
};

/**
 * Materialize the meta-graph facts implied by `dialect.morphisms`.
 *
 * For each morphism the dialect owns, emits one `Morphism(...)` fact,
 * a `BelongsToDialect(...)` relation, one `ReadsNodeKind` / `ReadsEdgeKind`
 * per pattern node / pattern edge, one `EmitsNodeKind` /
 * `EmitsEdgeKind` / `EmitsArtifactKind` per declared `to` entry, an
 * optional `HasSurface(...)` if the morphism advertises a surface, and
 * one `DiagnoseCode(...)` per declared diagnostic code.
 *
 * Pure read — does not register anything on the dialect or graph. The
 * static meta facts are derived data; consumers can rebuild them on
 * demand whenever the dialect's morphism list changes.
 */
export const morphismMetaFacts = (dialect: Dialect): readonly MorphismMetaFact[] => {
  const facts: MorphismMetaFact[] = [];
  for (const morphism of dialect.morphisms) {
    facts.push({ kind: "Morphism", morphism: morphism.name, phase: morphism.phase });
    facts.push({
      kind: "BelongsToDialect",
      morphism: morphism.name,
      dialect: dialect.dialectId.value,
    });
    const patternNodes = morphism.from.def.nodes ?? {};
    for (const node of Object.values(patternNodes)) {
      facts.push({
        kind: "ReadsNodeKind",
        morphism: morphism.name,
        nodeKind: (node as { readonly id: string }).id,
      });
    }
    const patternEdges = morphism.from.def.edges ?? {};
    for (const edge of Object.values(patternEdges)) {
      const edgeKind = (edge as { readonly kind: { readonly id: string } }).kind;
      facts.push({ kind: "ReadsEdgeKind", morphism: morphism.name, edgeKind: edgeKind.id });
    }
    for (const node of morphism.to.nodes ?? []) {
      facts.push({ kind: "EmitsNodeKind", morphism: morphism.name, nodeKind: node.id });
    }
    for (const edge of morphism.to.edges ?? []) {
      facts.push({ kind: "EmitsEdgeKind", morphism: morphism.name, edgeKind: edge.id });
    }
    for (const artifactKind of morphism.to.artifacts ?? []) {
      facts.push({ kind: "EmitsArtifactKind", morphism: morphism.name, artifactKind });
    }
    if (morphism.surface) {
      facts.push({
        kind: "HasSurface",
        morphism: morphism.name,
        surface: morphism.surface.id.value,
      });
    }
    for (const code of morphism.diagnostics) {
      facts.push({ kind: "DiagnoseCode", morphism: morphism.name, diagnosticCode: code });
    }
  }
  return facts;
};
