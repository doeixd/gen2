/* @__NO_SIDE_FFECTS__ */
/**
 * Kernel lowering - legalization between dialects.
 *
 * A lowering defines how to convert nodes/edges from a source dialect to a
 * target dialect. It either produces legalized IR or diagnostics explaining
 * why legalization failed.
 */

/** Lowering direction. */
export interface Lowering {
  readonly id: string;
  readonly label: string;
  readonly from: readonly string[];
  readonly to: readonly string[];
  readonly description?: string;
}
export const defineLowering = (def: {
  readonly id: string;
  readonly label: string;
  readonly from: readonly string[];
  readonly to: readonly string[];
  readonly description?: string;
}): Lowering => ({
  id: def.id,
  label: def.label,
  from: def.from,
  to: def.to,
  description: def.description,
});

/** Registry for lowering definitions contributed by dialects and plugins. */
export class LoweringRegistry {
  readonly #lowerings: Map<string, Lowering>;

  constructor(lowerings: readonly Lowering[] = []) {
    this.#lowerings = new Map();
    for (const lowering of lowerings) {
      this.register(lowering);
    }
  }

  /** Register or replace a lowering definition. */
  register(lowering: Lowering): void {
    this.#lowerings.set(lowering.id, lowering);
  }

  /** Check if a lowering exists. */
  has(id: string): boolean {
    return this.#lowerings.has(id);
  }

  /** Get a lowering by id. */
  get(id: string): Lowering | undefined {
    return this.#lowerings.get(id);
  }

  /** Find lowerings that can consume a source kind/dialect. */
  findFrom(from: string): readonly Lowering[] {
    return Array.from(this.#lowerings.values()).filter((lowering) => lowering.from.includes(from));
  }

  /** List all registered lowerings. */
  list(): readonly Lowering[] {
    return Array.from(this.#lowerings.values());
  }

  /** Clear all registered lowerings. */
  clear(): void {
    this.#lowerings.clear();
  }
}
