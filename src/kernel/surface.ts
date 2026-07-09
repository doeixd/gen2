/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel surfaces.
 *
 * Surfaces are open-extension typed projections over morphisms/lowerings.
 * They declare what a public compiler contract consumes, yields, and returns.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";

export type SurfacePhase = "lowering" | "derivation" | "emit";

/** Typed surface identity witness. */
export interface SurfaceId<Phase extends SurfacePhase = SurfacePhase, Id extends string = string> {
  readonly kind: "surface.id";
  readonly phase: Phase;
  readonly value: KernelId<`surface.${Phase}`> & Id;
  readonly label?: string;
  readonly metadata?: KernelMetadata;
}

/** Define a typed surface ID at a dynamic/definition boundary. */
export const defineSurfaceId = <const Phase extends SurfacePhase, const Id extends string>(input: {
  readonly phase: Phase;
  readonly id: Id;
  readonly label?: string;
  readonly metadata?: KernelMetadata;
}): SurfaceId<Phase, Id> => ({
  kind: "surface.id",
  phase: input.phase,
  value: input.id as KernelId<`surface.${Phase}`> & Id,
  label: input.label,
  metadata: input.metadata,
});

/** Surface witness. */
export interface Surface<
  Phase extends SurfacePhase = SurfacePhase,
  Id extends SurfaceId<Phase> = SurfaceId<Phase>,
  Consumes = unknown,
  Yields = unknown,
  ResultShape = unknown,
> {
  readonly kind: "surface";
  readonly phase: Phase;
  readonly id: Id;
  readonly consumes: Consumes;
  readonly yields: Yields;
  readonly resultShape: ResultShape;
  readonly metadata?: KernelMetadata;
  readonly $infer: {
    readonly phase: Phase;
    readonly id: Id;
    readonly consumes: Consumes;
    readonly yields: Yields;
    readonly resultShape: ResultShape;
  };
}

export interface SurfaceDef<
  Phase extends SurfacePhase,
  Id extends SurfaceId<Phase>,
  Consumes,
  Yields,
  ResultShape,
> {
  readonly id: Id;
  readonly consumes: Consumes;
  readonly yields: Yields;
  readonly resultShape: ResultShape;
  readonly metadata?: KernelMetadata;
}

const defineSurface = <
  const Phase extends SurfacePhase,
  const Id extends SurfaceId<Phase>,
  const Consumes,
  const Yields,
  const ResultShape,
>(
  phase: Phase,
  def: SurfaceDef<Phase, Id, Consumes, Yields, ResultShape>,
): Surface<Phase, Id, Consumes, Yields, ResultShape> =>
  ({
    kind: "surface",
    phase,
    id: def.id,
    consumes: def.consumes,
    yields: def.yields,
    resultShape: def.resultShape,
    metadata: def.metadata,
    $infer: {
      phase,
      id: def.id,
      consumes: def.consumes,
      yields: def.yields,
      resultShape: def.resultShape,
    },
  }) as Surface<Phase, Id, Consumes, Yields, ResultShape>;

interface SurfaceBuilderWithResult<
  Phase extends SurfacePhase,
  Id extends SurfaceId<Phase>,
  Consumes,
  Yields,
  ResultShape,
> {
  done(input?: {
    readonly metadata?: KernelMetadata;
  }): Surface<Phase, Id, Consumes, Yields, ResultShape>;
}

interface SurfaceBuilderWithYields<
  Phase extends SurfacePhase,
  Id extends SurfaceId<Phase>,
  Consumes,
  Yields,
> {
  resultShape<const ResultShape>(
    resultShape: ResultShape,
  ): SurfaceBuilderWithResult<Phase, Id, Consumes, Yields, ResultShape>;
}

interface SurfaceBuilderWithConsumes<
  Phase extends SurfacePhase,
  Id extends SurfaceId<Phase>,
  Consumes,
> {
  yields<const Yields>(yields: Yields): SurfaceBuilderWithYields<Phase, Id, Consumes, Yields>;
}

interface SurfaceBuilderWithId<Phase extends SurfacePhase, Id extends SurfaceId<Phase>> {
  consumes<const Consumes>(consumes: Consumes): SurfaceBuilderWithConsumes<Phase, Id, Consumes>;
}

export interface SurfaceFactory<Phase extends SurfacePhase> {
  <const Id extends SurfaceId<Phase>, const Consumes, const Yields, const ResultShape>(
    def: SurfaceDef<Phase, Id, Consumes, Yields, ResultShape>,
  ): Surface<Phase, Id, Consumes, Yields, ResultShape>;
  id<const Id extends SurfaceId<Phase>>(id: Id): SurfaceBuilderWithId<Phase, Id>;
}

const createSurfaceFactory = <const Phase extends SurfacePhase>(
  phase: Phase,
): SurfaceFactory<Phase> => {
  const factory = (<
    const Id extends SurfaceId<Phase>,
    const Consumes,
    const Yields,
    const ResultShape,
  >(
    def: SurfaceDef<Phase, Id, Consumes, Yields, ResultShape>,
  ) => defineSurface(phase, def)) as SurfaceFactory<Phase>;

  factory.id = <const Id extends SurfaceId<Phase>>(surfaceId: Id) => ({
    consumes: <const Consumes>(consumes: Consumes) => ({
      yields: <const Yields>(yields: Yields) => ({
        resultShape: <const ResultShape>(resultShape: ResultShape) => ({
          done: (input?: { readonly metadata?: KernelMetadata }) =>
            defineSurface(phase, {
              id: surfaceId,
              consumes,
              yields,
              resultShape,
              metadata: input?.metadata,
            }),
        }),
      }),
    }),
  });

  return factory;
};

export const defineLoweringSurface = createSurfaceFactory("lowering");
export const defineDerivationSurface = createSurfaceFactory("derivation");
export const defineEmitSurface = createSurfaceFactory("emit");
