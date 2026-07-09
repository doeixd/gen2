/* @__NO_SIDE_EFFECTS__ */
/**
 * Typed relation witnesses (PLAN §B0a).
 *
 * `RelationWitness` is a typed view over an existing `EdgeKindDef`. It binds
 * a source node-kind to a target node-kind via a specific edge kind, plus a
 * cardinality bound and (when ambiguous) an explicit endpoint selector.
 *
 * Witnesses preserve source/target/via/cardinality in `$infer` so consumer
 * passes (verifiers, runtime accessors, lowering surfaces, refinement bodies,
 * pattern shortcuts) can read them without erasing types.
 *
 * This file is the standalone primitive layer. Integration with
 * `defineNodeKind(...).relations({...})` is a follow-up — these witnesses
 * are usable on their own to declare relation schemas.
 */
import type { EdgeKindDef, NodeKindDef } from "./ods.ts";

/** Cardinality bounds for a relation. `[min, max]`; `max: null` means unbounded. */
export interface RelationCardinality<
  Min extends number = number,
  Max extends number | null = number | null,
> {
  readonly min: Min;
  readonly max: Max;
}

/** Order hint for `hasMany`-style relations. */
export interface RelationOrder<
  Field extends { readonly id: string } = { readonly id: string },
  Direction extends "asc" | "desc" = "asc" | "desc",
> {
  readonly by: Field;
  readonly direction: Direction;
}

/**
 * A typed relation witness. Preserves source/target/via/cardinality in
 * `$infer`. Endpoint role is optional — when the edge kind has unambiguous
 * source/target endpoints, the kernel can resolve it.
 */
export interface RelationWitness<
  Source extends NodeKindDef = NodeKindDef,
  Target extends NodeKindDef = NodeKindDef,
  Via extends EdgeKindDef = EdgeKindDef,
  Cardinality extends RelationCardinality = RelationCardinality,
  Endpoint extends string | undefined = string | undefined,
  Required extends boolean = boolean,
> {
  readonly kind: "relation";
  readonly source?: Source;
  readonly target: Target;
  readonly via: Via;
  readonly cardinality: Cardinality;
  readonly endpoint?: Endpoint;
  readonly required: Required;
  readonly order?: RelationOrder;
  readonly $infer?: {
    readonly source: Source;
    readonly target: Target;
    readonly via: Via;
    readonly cardinality: Cardinality;
    readonly endpoint: Endpoint;
    readonly required: Required;
  };
}

/** Options shared by relation factory functions. */
export interface RelationOptions<
  Via extends EdgeKindDef = EdgeKindDef,
  Endpoint extends string | undefined = string | undefined,
> {
  readonly via: Via;
  readonly endpoint?: Endpoint;
}

/** Options for `hasMany` — supports `{ min }` to require at least N targets. */
export interface HasManyOptions<
  Via extends EdgeKindDef = EdgeKindDef,
  Endpoint extends string | undefined = string | undefined,
  Min extends number = 0,
> extends RelationOptions<Via, Endpoint> {
  readonly min?: Min;
}

/** Options for `hasRange` — requires both `min` and `max`. */
export interface HasRangeOptions<
  Via extends EdgeKindDef = EdgeKindDef,
  Endpoint extends string | undefined = string | undefined,
  Min extends number = number,
  Max extends number = number,
> extends RelationOptions<Via, Endpoint> {
  readonly min: Min;
  readonly max: Max;
}

const makeWitness = <
  const Target extends NodeKindDef,
  const Via extends EdgeKindDef,
  const Min extends number,
  const Max extends number | null,
  const Endpoint extends string | undefined,
  const Required extends boolean,
>(
  target: Target,
  via: Via,
  endpoint: Endpoint | undefined,
  cardinality: RelationCardinality<Min, Max>,
  required: Required,
  order?: RelationOrder,
): RelationWitness<
  NodeKindDef,
  Target,
  Via,
  RelationCardinality<Min, Max>,
  Endpoint,
  Required
> => ({
  kind: "relation",
  target,
  via,
  cardinality,
  endpoint,
  required,
  order,
});

/**
 * Exactly one target (1..1). Returns a `RelationWitness` whose cardinality
 * is `{ min: 1, max: 1 }`. Call `.optional()` to widen to `{ min: 0, max: 1 }`.
 */
export const hasOne = <
  const Target extends NodeKindDef,
  const Via extends EdgeKindDef,
  const Endpoint extends string | undefined = undefined,
>(
  target: Target,
  opts: RelationOptions<Via, Endpoint>,
): HasOneFluent<Target, Via, Endpoint> => {
  const witness = makeWitness(target, opts.via, opts.endpoint, { min: 1, max: 1 }, true);
  return Object.assign(witness, {
    optional: () =>
      makeWitness(target, opts.via, opts.endpoint, { min: 0, max: 1 }, false) as RelationWitness<
        NodeKindDef,
        Target,
        Via,
        RelationCardinality<0, 1>,
        Endpoint,
        false
      >,
  });
};

/** Result type for `hasOne(...)` — a relation witness with `.optional()`. */
export type HasOneFluent<
  Target extends NodeKindDef,
  Via extends EdgeKindDef,
  Endpoint extends string | undefined = undefined,
> = RelationWitness<NodeKindDef, Target, Via, RelationCardinality<1, 1>, Endpoint, true> & {
  optional: () => RelationWitness<
    NodeKindDef,
    Target,
    Via,
    RelationCardinality<0, 1>,
    Endpoint,
    false
  >;
};

/** Zero or one target (0..1). Explicit shorthand for `hasOne(...).optional()`. */
export const hasZeroOrOne = <
  const Target extends NodeKindDef,
  const Via extends EdgeKindDef,
  const Endpoint extends string | undefined = undefined,
>(
  target: Target,
  opts: RelationOptions<Via, Endpoint>,
): RelationWitness<NodeKindDef, Target, Via, RelationCardinality<0, 1>, Endpoint, false> =>
  makeWitness(target, opts.via, opts.endpoint, { min: 0, max: 1 }, false);

/**
 * Zero or more targets (0..N). With `{ min: 1 }` becomes a non-empty
 * relation (1..N). `.order(field, "asc" | "desc")` attaches an order hint
 * carried through to runtime accessors and lowerings.
 */
export const hasMany = <
  const Target extends NodeKindDef,
  const Via extends EdgeKindDef,
  const Endpoint extends string | undefined = undefined,
  const Min extends number = 0,
>(
  target: Target,
  opts: HasManyOptions<Via, Endpoint, Min>,
): HasManyFluent<Target, Via, Endpoint, Min> => {
  const min = (opts.min ?? 0) as Min;
  const required = (min > 0) as Min extends 0 ? false : true;
  const witness = makeWitness(target, opts.via, opts.endpoint, { min, max: null }, required);
  return Object.assign(witness, {
    order: <const F extends { readonly id: string }, const D extends "asc" | "desc">(
      by: F,
      direction: D,
    ): RelationWitness<
      NodeKindDef,
      Target,
      Via,
      RelationCardinality<Min, null>,
      Endpoint,
      Min extends 0 ? false : true
    > & { readonly order: RelationOrder<F, D> } =>
      ({
        ...witness,
        order: { by, direction },
      }) as RelationWitness<
        NodeKindDef,
        Target,
        Via,
        RelationCardinality<Min, null>,
        Endpoint,
        Min extends 0 ? false : true
      > & { readonly order: RelationOrder<F, D> },
  });
};

/** Result type for `hasMany(...)` — a relation witness with `.order(...)`. */
export type HasManyFluent<
  Target extends NodeKindDef,
  Via extends EdgeKindDef,
  Endpoint extends string | undefined = undefined,
  Min extends number = 0,
> = RelationWitness<
  NodeKindDef,
  Target,
  Via,
  RelationCardinality<Min, null>,
  Endpoint,
  Min extends 0 ? false : true
> & {
  order: <const F extends { readonly id: string }, const D extends "asc" | "desc">(
    by: F,
    direction: D,
  ) => RelationWitness<
    NodeKindDef,
    Target,
    Via,
    RelationCardinality<Min, null>,
    Endpoint,
    Min extends 0 ? false : true
  > & { readonly order: RelationOrder<F, D> };
};

/** Bounded range (`min..max`). Both bounds required. */
export const hasRange = <
  const Target extends NodeKindDef,
  const Via extends EdgeKindDef,
  const Endpoint extends string | undefined = undefined,
  const Min extends number = number,
  const Max extends number = number,
>(
  target: Target,
  opts: HasRangeOptions<Via, Endpoint, Min, Max>,
): RelationWitness<
  NodeKindDef,
  Target,
  Via,
  RelationCardinality<Min, Max>,
  Endpoint,
  Min extends 0 ? false : true
> =>
  makeWitness(
    target,
    opts.via,
    opts.endpoint,
    { min: opts.min, max: opts.max },
    (opts.min > 0) as Min extends 0 ? false : true,
  );

/**
 * `belongsTo(Target, opts)` is a `hasOne` with FK semantics — the source side
 * owns the foreign-key column / pointer. Identical witness shape; storage
 * lowerings read the `belongsTo` flavor to decide which side carries the FK.
 */
export const belongsTo = <
  const Target extends NodeKindDef,
  const Via extends EdgeKindDef,
  const Endpoint extends string | undefined = undefined,
>(
  target: Target,
  opts: RelationOptions<Via, Endpoint>,
): BelongsToFluent<Target, Via, Endpoint> => {
  const witness = makeWitness(target, opts.via, opts.endpoint, { min: 1, max: 1 }, true);
  return Object.assign(witness, {
    flavor: "belongsTo" as const,
    optional: () =>
      makeWitness(target, opts.via, opts.endpoint, { min: 0, max: 1 }, false) as RelationWitness<
        NodeKindDef,
        Target,
        Via,
        RelationCardinality<0, 1>,
        Endpoint,
        false
      >,
  });
};

/** Result type for `belongsTo(...)` — carries a `flavor: "belongsTo"` tag for lowerings. */
export type BelongsToFluent<
  Target extends NodeKindDef,
  Via extends EdgeKindDef,
  Endpoint extends string | undefined = undefined,
> = RelationWitness<NodeKindDef, Target, Via, RelationCardinality<1, 1>, Endpoint, true> & {
  readonly flavor: "belongsTo";
  optional: () => RelationWitness<
    NodeKindDef,
    Target,
    Via,
    RelationCardinality<0, 1>,
    Endpoint,
    false
  >;
};

/** Helper: extract the target node-kind witness from a relation witness. */
export type RelationTarget<R extends RelationWitness> = R["target"];

/** Helper: extract the via edge-kind witness from a relation witness. */
export type RelationVia<R extends RelationWitness> = R["via"];

/** Helper: extract the cardinality witness from a relation witness. */
export type RelationCardinalityOf<R extends RelationWitness> = R["cardinality"];
