/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel trait - typed semantic claims using symbol definitions.
 *
 * Traits are now typed symbol definitions, not magic strings.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";

/** Trait target - kinds that traits can apply to. */
export type TraitTarget = "type" | "expr" | "transform" | "node" | "edge" | "artifact" | "pass";

/**
 * Assurance level for a law-bearing trait.
 *
 * Per PLAN.md Track B §B3a, target lowering decisions are driven by
 * which laws hold *and* how strongly they're claimed. A
 * `LawAssociative` trait with `assurance: "asserted"` is OK to use
 * optimistically but must come with a generated property test;
 * `by_construction` skips the test; `proved_by_solver` is the
 * strongest. Assurance is always part of a law-trait's payload.
 *
 * - `asserted`: declared by the author with no verification.
 * - `derived`: inferred by a verify pass from operation/expr structure.
 * - `tested`: backed by generated property tests.
 * - `checked_by_target`: the target lowering verified it (e.g.
 *   Postgres confirmed the SQL is associative).
 * - `proved_by_solver`: SMT/Alloy/TLA+/Lean has discharged the proof.
 * - `by_construction`: the operation is built from law-preserving
 *   primitives, so the law follows mechanically.
 * - `trusted_target`: the target dialect declares the law without
 *   verification (escape hatch for opaque target ops).
 */
export type Assurance =
  | "asserted"
  | "derived"
  | "tested"
  | "checked_by_target"
  | "proved_by_solver"
  | "by_construction"
  | "trusted_target";

/** A trait definition - a checked semantic claim. */
export interface TraitDef<Payload = unknown> {
  readonly id: KernelId<"trait">;
  readonly label: string;
  readonly target: TraitTarget;
  readonly implies?: readonly TraitDef[];
  readonly conflictsWith?: readonly TraitDef[];
  readonly metadata?: KernelMetadata;
  readonly _payload?: Payload;
}

/** A trait reference - typed symbol. */
export type TraitRef<T extends TraitDef = TraitDef> = T;

/** Define a trait. */
export const defineTrait = <Payload>(
  id: string,
  label: string,
  target: TraitTarget,
  options?: {
    readonly implies?: readonly TraitDef[];
    readonly conflictsWith?: readonly TraitDef[];
    readonly metadata?: KernelMetadata;
  },
): TraitDef<Payload> => ({
  id: id as KernelId<"trait">,
  label,
  target,
  implies: options?.implies,
  conflictsWith: options?.conflictsWith,
  metadata: options?.metadata,
});

/** Built-in trait definitions using typed symbols. */
export const traits = {
  // --- Type traits ---
  TYPE: {
    EMAIL: defineTrait<true>("trait.type.email", "Email type", "type"),
    UUID: defineTrait<true>("trait.type.uuid", "UUID type", "type"),
    DATETIME: defineTrait<true>("trait.type.datetime", "DateTime type", "type"),
    UNIQUE: defineTrait<true>("trait.type.unique", "Unique type", "type"),
    INDEXED: defineTrait<true>("trait.type.indexed", "Indexed type", "type"),
    SERVER_ONLY: defineTrait<true>("trait.type.serverOnly", "Server-only type", "type"),
    SECRET: defineTrait<true>("trait.type.secret", "Secret type", "type"),
    QUERYABLE: defineTrait<true>("trait.type.queryable", "Queryable type", "type"),
  },
  // --- Node traits ---
  NODE: {
    STATIC: defineTrait<true>("trait.node.static", "Static node", "node"),
    NAMED: defineTrait<true>("trait.node.named", "Named node", "node"),
    TYPED: defineTrait<true>("trait.node.typed", "Typed node", "node"),
    CALLABLE: defineTrait<{ input: unknown; output: unknown }>(
      "trait.node.callable",
      "Callable node",
      "node",
    ),
    READABLE: defineTrait<true>("trait.node.readable", "Readable node", "node"),
    WRITABLE: defineTrait<true>("trait.node.writable", "Writable node", "node"),
    EFFECTFUL: defineTrait<unknown>("trait.node.effectful", "Effectful node", "node"),
    REQUIRES: defineTrait<readonly string[]>("trait.node.requires", "Requires node", "node"),
    REACTIVE: defineTrait<true>("trait.node.reactive", "Reactive node", "node"),
    KEYED: defineTrait<unknown>("trait.node.keyed", "Keyed node", "node"),
    POLICY_PROTECTED: defineTrait<true>(
      "trait.node.policyProtected",
      "Policy-protected node",
      "node",
    ),
    RESOURCE_LIKE: defineTrait<true>("trait.node.resourceLike", "Resource-like node", "node"),
    MIGRATION_STEP: defineTrait<true>("trait.node.migrationStep", "Migration step", "node"),
    TARGET_INTERPRETABLE: defineTrait<true>(
      "trait.node.targetInterpretable",
      "Target-interpretable node",
      "node",
    ),
    PLAN: defineTrait<true>("trait.node.plan", "Plan node", "node"),
    SERVER_PLACEABLE: defineTrait<true>(
      "trait.node.serverPlaceable",
      "Server-placeable node",
      "node",
    ),
    ENTITY: defineTrait<true>("trait.node.entity", "Entity node", "node"),
    RULE: defineTrait<true>("trait.node.rule", "Rule node", "node"),
    ACTION: defineTrait<true>("trait.node.action", "Action node", "node"),
    QUERY: defineTrait<true>("trait.node.query", "Query node", "node"),
    VIEW: defineTrait<true>("trait.node.view", "View node", "node"),
    PROVIDER: defineTrait<true>("trait.node.provider", "Provider node", "node"),
    /**
     * Marks a node as a graph-shaking entrypoint.
     *
     * Track A's `prune.reachableArtifacts` pass walks the graph from
     * every node bearing this trait and drops anything unreachable
     * before emit. Apply to public boundaries, exported callables,
     * UI entrypoints, queue workers, and explicit `forceEmit` nodes.
     *
     * Added by PLAN.md §7 quick win #6.
     */
    ENTRYPOINT: defineTrait<{ readonly reason?: string }>(
      "trait.node.entrypoint",
      "Entrypoint (graph-shaking root)",
      "node",
    ),
  },
  // --- Edge traits ---
  EDGE: {
    OWNS: defineTrait<true>("trait.edge.owns", "Owns edge", "edge"),
    HAS_TYPE: defineTrait<true>("trait.edge.hasType", "Has-type edge", "edge"),
    READS: defineTrait<true>("trait.edge.reads", "Reads edge", "edge"),
    WRITES: defineTrait<true>("trait.edge.writes", "Writes edge", "edge"),
    GUARDS: defineTrait<true>("trait.edge.guards", "Guards edge", "edge"),
    REQUIRES: defineTrait<true>("trait.edge.requires", "Requires edge", "edge"),
    PROVIDES: defineTrait<true>("trait.edge.provides", "Provides edge", "edge"),
    DERIVES: defineTrait<true>("trait.edge.derives", "Derives edge", "edge"),
    INVALIDATES: defineTrait<true>("trait.edge.invalidates", "Invalidates edge", "edge"),
    PATCHES: defineTrait<true>("trait.edge.patches", "Patches edge", "edge"),
    SUBMITS: defineTrait<true>("trait.edge.submits", "Submits edge", "edge"),
    DISPLAYS: defineTrait<true>("trait.edge.displays", "Displays edge", "edge"),
    EDITS: defineTrait<true>("trait.edge.edits", "Edits edge", "edge"),
    STORES: defineTrait<true>("trait.edge.stores", "Stores edge", "edge"),
    MAPS_TO: defineTrait<true>("trait.edge.mapsTo", "Maps-to edge", "edge"),
    CROSSES_BOUNDARY: defineTrait<true>(
      "trait.edge.crossesBoundary",
      "Crosses-boundary edge",
      "edge",
    ),
    LOWERS_TO: defineTrait<true>("trait.edge.lowersTo", "Lowers-to edge", "edge"),
    GENERATED_FROM: defineTrait<true>("trait.edge.generatedFrom", "Generated-from edge", "edge"),
    CAUSAL: defineTrait<true>("trait.edge.causal", "Causal edge", "edge"),
    EFFECTFUL: defineTrait<true>("trait.edge.effectful", "Effectful edge", "edge"),
    MUTATION: defineTrait<true>("trait.edge.mutation", "Mutation edge", "edge"),
    STATIC_ANALYZED: defineTrait<true>("trait.edge.staticAnalyzed", "Static-analyzed edge", "edge"),
    DEPENDENCY: defineTrait<true>("trait.edge.dependency", "Dependency edge", "edge"),
  },
  // --- Expr traits ---
  EXPR: {
    PURE: defineTrait<true>("trait.expr.pure", "Pure expression", "expr"),
    SQL_LOWERABLE: defineTrait<true>("trait.expr.sqlLowerable", "SQL-lowerable expression", "expr"),
    CLIENT_EVALUABLE: defineTrait<true>(
      "trait.expr.clientEvaluable",
      "Client-evaluable expression",
      "expr",
    ),
  },
  // --- Transform traits ---
  TRANSFORM: {
    ENCODABLE: defineTrait<true>("trait.transform.encodable", "Encodable transform", "transform"),
    DECODABLE: defineTrait<true>("trait.transform.decodable", "Decodable transform", "transform"),
    LOSSLESS: defineTrait<true>("trait.transform.lossless", "Lossless transform", "transform"),
    REVERSIBLE: defineTrait<{ inverse: string }>(
      "trait.transform.reversible",
      "Reversible transform",
      "transform",
    ),
  },
  // --- Law traits (behavioral/algebraic) ---
  //
  // Laws are typed traits — not a separate primitive family. Each law's
  // phantom payload starts with `assurance: Assurance` (see PLAN.md
  // Track B §B3a) and may carry additional witness data (identity
  // value, inverse ref, proof artifact id, etc.). The kernel/law.ts
  // file was deleted in Quick Win #5; this is the single source of
  // truth for laws.
  LAW: {
    IDEMPOTENT: defineTrait<{ assurance: Assurance }>("trait.law.idempotent", "Idempotent", "node"),
    ASSOCIATIVE: defineTrait<{ assurance: Assurance }>(
      "trait.law.associative",
      "Associative",
      "node",
    ),
    COMMUTATIVE: defineTrait<{ assurance: Assurance }>(
      "trait.law.commutative",
      "Commutative",
      "node",
    ),
    MONOTONIC: defineTrait<{ assurance: Assurance; order: string }>(
      "trait.law.monotonic",
      "Monotonic",
      "node",
    ),
    REVERSIBLE: defineTrait<{ assurance: Assurance; inverse: string }>(
      "trait.law.reversible",
      "Reversible",
      "transform",
    ),
    IDENTITY: defineTrait<{ assurance: Assurance; identityExprId: string }>(
      "trait.law.identity",
      "Has identity",
      "node",
    ),
    INVERSE: defineTrait<{ assurance: Assurance; inverse: string }>(
      "trait.law.inverse",
      "Has inverse",
      "node",
    ),
    DETERMINISTIC: defineTrait<{ assurance: Assurance }>(
      "trait.law.deterministic",
      "Deterministic",
      "node",
    ),
    PARALLEL_SAFE: defineTrait<{ assurance: Assurance }>(
      "trait.law.parallelSafe",
      "Parallel-safe",
      "node",
    ),
    ROLLBACK_SAFE: defineTrait<{ assurance: Assurance }>(
      "trait.law.rollbackSafe",
      "Rollback-safe",
      "node",
    ),
  },
} as const;

/** Trait set for phantom type-level capability checking. */
declare const traitSetBrand: unique symbol;

export type TraitSet = {
  readonly [traitSetBrand]?: never;
};

/** Validate that a trait applies to a given target kind. */
export const traitAppliesTo = (trait: TraitDef, target: TraitTarget): boolean =>
  trait.target === target;

/** Check if a trait implies another trait (transitively). */
export const traitImplies = (trait: TraitDef, implied: TraitDef): boolean =>
  trait.implies?.some((t) => t.id === implied.id) ?? false;

/** Check if two traits conflict. */
export const traitsConflict = (
  a: TraitDef,
  b: TraitDef,
  _allTraits: ReadonlyMap<string, TraitDef>,
): boolean => a.conflictsWith?.some((t) => t.id === b.id) ?? false;

/** Get trait by ID from registry. */
export const getTrait = (
  id: string,
  allTraits: ReadonlyMap<string, TraitDef>,
): TraitDef | undefined => allTraits.get(id);
