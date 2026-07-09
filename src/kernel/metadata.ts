/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel metadata - passive annotations.
 *
 * Passive descriptive data that does not affect compilation semantics.
 * Models the revised core Metadata primitive.
 */

/** Source location for diagnostics and provenance. */
export interface SourceSpan {
  readonly start: { readonly line: number; readonly column: number };
  readonly end: { readonly line: number; readonly column: number };
  readonly file?: string;
}

/** Passive metadata attached to kernel objects. */
export interface KernelMetadata<Custom extends object = Record<string, unknown>> {
  readonly title?: string;
  readonly description?: string;
  readonly documentation?: string;
  readonly examples?: readonly unknown[];
  readonly deprecated?: boolean | string;
  readonly tags?: readonly string[];
  readonly source?: SourceSpan;
  readonly custom?: Custom;
}

/** Create metadata with optional fields. */
export const createMetadata = <Custom extends object = Record<string, unknown>>(
  input?: Partial<KernelMetadata<Custom>>,
): KernelMetadata<Custom> | undefined =>
  input
    ? {
        title: input.title,
        description: input.description,
        documentation: input.documentation,
        examples: input.examples,
        deprecated: input.deprecated,
        tags: input.tags,
        source: input.source,
        custom: input.custom,
      }
    : undefined;

/** Merge two metadata objects, with later ones taking precedence. */
export const mergeMetadata = <Custom extends object = Record<string, unknown>>(
  base: KernelMetadata<Custom> | undefined,
  override: KernelMetadata<Custom> | undefined,
): KernelMetadata<Custom> | undefined => {
  if (!base) return override;
  if (!override) return base;
  return {
    title: override.title ?? base.title,
    description: override.description ?? base.description,
    documentation: override.documentation ?? base.documentation,
    examples: override.examples ?? base.examples,
    deprecated: override.deprecated ?? base.deprecated,
    tags: override.tags ?? base.tags,
    source: override.source ?? base.source,
    custom: { ...base.custom, ...override.custom } as Custom,
  };
};
