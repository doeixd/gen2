/* @__NO_SIDE_EFFECTS__ */
/**
 * Functional, type-safe helpers for building, extending, and transforming the
 * result returned by {@link createGen}.
 *
 * Every helper returns a **new** {@link CreateGenResult} while sharing the
 * original mutable {@link GenContext}.  This makes it safe to create derived
 * views (e.g. a restricted namespace for a plugin) without affecting the
 * underlying context.
 *
 * @module
 */

import type { GenConfig, Gen, CreateGenResult } from "./types.ts";

/**
 * Force TypeScript to eagerly resolve a mapped type instead of keeping it
 * as an alias.  This improves property lookup on large types like {@link Gen}
 * after `Omit` or intersection operations.
 */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Extend the `gen` namespace with additional properties.
 *
 * The returned result shares the same mutable `ctx`.  New keys are inferred
 * from the `extensions` object so callers never need explicit type arguments.
 *
 * @example
 * ```ts
 * const { gen, ctx } = extendGen(createGen(), {
 *   customHelper: (x: number) => x * 2,
 * });
 * // gen.customHelper is fully typed
 * ```
 */
export const extendGen = <C extends GenConfig, G extends Gen<C>, E extends Record<string, unknown>>(
  result: CreateGenResult<C, G>,
  extensions: E,
): CreateGenResult<C, G & E> => ({
  ctx: result.ctx,
  gen: { ...result.gen, ...extensions } as G & E,
});

/**
 * Omit keys from the `gen` namespace.
 *
 * Returns a new result whose `gen` type no longer contains the supplied keys.
 * Useful for creating restricted views (e.g. removing `admin` or `list` before
 * passing the namespace to a sandboxed plugin).
 *
 * Uses {@link Object.fromEntries} instead of `delete` to avoid V8
 * de-optimisation and to produce a clean new object.
 *
 * @example
 * ```ts
 * const restricted = omitGen(base, ["admin", "list"]);
 * // restricted.gen.admin  // ❌ compile-time error
 * ```
 */
export const omitGen = <
  C extends GenConfig,
  G extends Gen<C>,
  const K extends readonly (keyof G)[],
>(
  result: CreateGenResult<C, G>,
  keys: K,
): CreateGenResult<C, Prettify<Omit<G, K[number]>>> => {
  const omitSet = new Set<string>(keys as readonly string[]);
  const gen = Object.fromEntries(
    Object.entries(result.gen as Record<string, unknown>).filter(([k]) => !omitSet.has(k)),
  ) as Prettify<Omit<G, K[number]>>;
  return { ctx: result.ctx, gen };
};

/**
 * Pick keys from the `gen` namespace.
 *
 * Returns a new result containing **only** the selected keys.  The inverse of
 * {@link omitGen}.
 *
 * @example
 * ```ts
 * const coreOnly = pickGen(base, ["entity", "types", "query"]);
 * // coreOnly.gen.entity  // ✅
 * // coreOnly.gen.admin   // ❌ compile-time error
 * ```
 */
export const pickGen = <
  C extends GenConfig,
  G extends Gen<C>,
  const K extends readonly (keyof G)[],
>(
  result: CreateGenResult<C, G>,
  keys: K,
): CreateGenResult<C, Pick<G, K[number]>> => {
  const gen = {} as Record<string, unknown>;
  for (const key of keys) {
    gen[key as string] = (result.gen as Record<string, unknown>)[key as string];
  }
  return { ctx: result.ctx, gen: gen as Pick<G, K[number]> };
};

/**
 * Override existing keys on the `gen` namespace.
 *
 * The `overrides` object is constrained to `Partial<G>` so TypeScript rejects
 * unknown keys at compile time.  The resulting type replaces the overridden
 * properties while preserving everything else.
 *
 * @example
 * ```ts
 * const withMockQuery = overrideGen(base, {
 *   query: { ...base.gen.query, build: mockBuild },
 * });
 * ```
 */
export const overrideGen = <C extends GenConfig, G extends Gen<C>, O extends Partial<G>>(
  result: CreateGenResult<C, G>,
  overrides: O,
): CreateGenResult<C, Prettify<Omit<G, keyof O> & O>> => ({
  ctx: result.ctx,
  gen: { ...result.gen, ...overrides } as Prettify<Omit<G, keyof O> & O>,
});

/**
 * Merge two `CreateGenResult` objects.
 *
 * The returned result uses `a.ctx` as its context.  When `a.ctx !== b.ctx` the
 * caller is responsible for ensuring the contexts are compatible (e.g. both
 * produced by the same `createGen()` call or explicitly merged beforehand).
 *
 * **Note:** If both results define the same key, the value from `b` wins at
 * runtime, but the type is an intersection (`G1 & G2`).  Overlapping function
 * signatures may require explicit disambiguation.
 *
 * @example
 * ```ts
 * const base = createGen();
 * const extended = extendGen(base, { helperA: () => 1 });
 * const merged = mergeGen(base, extended);
 * // merged.gen.helperA  // ✅
 * ```
 */
export const mergeGen = <
  C1 extends GenConfig,
  G1 extends Gen<C1>,
  C2 extends GenConfig,
  G2 extends Gen<C2>,
>(
  a: CreateGenResult<C1, G1>,
  b: CreateGenResult<C2, G2>,
): CreateGenResult<C1 & C2, G1 & G2> => ({
  ctx: a.ctx,
  gen: { ...a.gen, ...b.gen } as G1 & G2,
});

/**
 * Chainable builder API wrapping a {@link CreateGenResult}.
 *
 * Each operation returns a new builder instance with updated types, so the
 * final `.build()` call produces a fully typed result without explicit generics.
 *
 * @example
 * ```ts
 * const { gen, ctx } = genBuilder(createGen())
 *   .extend({ customHelper: (x: number) => x * 2 })
 *   .omit(["admin", "list"] as const)
 *   .build();
 * ```
 */
export interface GenBuilder<C extends GenConfig, G> {
  /** The current result. */
  readonly result: CreateGenResult<C, G>;

  /** Extend the `gen` namespace with new properties. */
  extend: <E extends Record<string, unknown>>(extensions: E) => GenBuilder<C, G & E>;

  /** Omit keys from the `gen` namespace. */
  omit: <const K extends readonly (keyof G)[]>(
    keys: K,
  ) => GenBuilder<C, Prettify<Omit<G, K[number]>>>;

  /** Pick keys from the `gen` namespace. */
  pick: <const K extends readonly (keyof G)[]>(keys: K) => GenBuilder<C, Pick<G, K[number]>>;

  /** Override existing keys on the `gen` namespace. */
  override: <O extends Partial<G>>(overrides: O) => GenBuilder<C, Prettify<Omit<G, keyof O> & O>>;

  /** Merge another result into this builder. */
  merge: <C2 extends GenConfig, G2 extends Gen<C2>>(
    other: CreateGenResult<C2, G2>,
  ) => GenBuilder<C & C2, G & G2>;

  /** Finalise the builder and return a fresh typed result. */
  build: () => CreateGenResult<C, G>;
}

/**
 * Create a chainable {@link GenBuilder} from a {@link CreateGenResult}.
 *
 * @example
 * ```ts
 * const { gen, ctx } = genBuilder(createGen())
 *   .extend({ myHelper: () => "hello" })
 *   .omit(["admin"] as const)
 *   .build();
 * ```
 */
export const genBuilder = <C extends GenConfig, G extends Gen<C>>(
  result: CreateGenResult<C, G>,
): GenBuilder<C, G> => ({
  result,
  extend: (extensions) => genBuilderFromView(extendGen(result, extensions)),
  omit: (keys) => genBuilderFromView(omitGen(result, keys)),
  pick: (keys) => genBuilderFromView(pickGen(result, keys)),
  override: (overrides) => genBuilderFromView(overrideGen(result, overrides)),
  merge: (other) => genBuilderFromView(mergeGen(result, other)),
  build: () => ({ ctx: result.ctx, gen: result.gen }) as CreateGenResult<C, G>,
});

// Internal helper that creates a builder from a CreateGenResult without
// requiring G to extend Gen<C>.  This is what lets omit/pick/override chain.
const genBuilderFromView = <C extends GenConfig, G>(
  result: CreateGenResult<C, G>,
): GenBuilder<C, G> => ({
  result,
  extend: (extensions) =>
    genBuilderFromView({
      ctx: result.ctx,
      gen: { ...result.gen, ...extensions } as G & typeof extensions,
    }),
  omit: (keys) => {
    const omitSet = new Set<string>(keys as readonly string[]);
    const gen = Object.fromEntries(
      Object.entries(result.gen as Record<string, unknown>).filter(([k]) => !omitSet.has(k)),
    );
    return genBuilderFromView({
      ctx: result.ctx,
      gen: gen as Prettify<Omit<G, (typeof keys)[number]>>,
    });
  },
  pick: (keys) => {
    const gen = {} as Record<string, unknown>;
    for (const key of keys) {
      gen[key as string] = (result.gen as Record<string, unknown>)[key as string];
    }
    return genBuilderFromView({
      ctx: result.ctx,
      gen: gen as Pick<G, (typeof keys)[number]>,
    });
  },
  override: (overrides) =>
    genBuilderFromView({
      ctx: result.ctx,
      gen: { ...result.gen, ...overrides } as Prettify<
        Omit<G, keyof typeof overrides> & typeof overrides
      >,
    }),
  merge: (other) =>
    genBuilderFromView({
      ctx: result.ctx,
      gen: { ...result.gen, ...other.gen } as G & (typeof other)["gen"],
    }),
  build: () => ({ ctx: result.ctx, gen: result.gen }) as CreateGenResult<C, G>,
});
