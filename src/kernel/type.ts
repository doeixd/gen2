/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel type - semantic value shapes.
 *
 * Represents semantic value shapes in the graph.
 * Models the revised core Type primitive.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { TraitRef } from "./trait.ts";

/** Kind discriminator for kernel types. */
export type KernelTypeKind =
  | "unknown"
  | "never"
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "uuid"
  | "email"
  | "datetime"
  | "duration"
  | "enum"
  | "literal"
  | "object"
  | "array"
  | "tuple"
  | "record"
  | "union"
  | "taggedUnion"
  | "custom"
  | "opaque";

/** Phantom type for TypeScript type information. */
declare const phantomBrand: unique symbol;
export type Phantom<T> = T & { readonly [phantomBrand]?: never };

/** Kernel type definition. */
export interface KernelType<
  Decoded = unknown,
 Encoded = Decoded,
> {
  readonly id: KernelId<"type">;
  readonly kind: KernelTypeKind;
  readonly decoded?: Phantom<Decoded>;
  readonly encoded?: Phantom<Encoded>;
  readonly properties?: ReadonlyMap<string, KernelType>;
  readonly enumValues?: readonly string[];
  readonly literalValue?: unknown;
  readonly items?: KernelType;
  readonly keys?: KernelType;
  readonly values?: KernelType;
  readonly variants?: ReadonlyMap<string, KernelType>;
  readonly of?: KernelType;
  readonly traits: readonly TraitRef[];
  readonly metadata?: KernelMetadata;
}

/** Create a kernel type. */
export const defineType = <const Kind extends KernelTypeKind>(
  kind: Kind,
  input?: {
    readonly properties?: ReadonlyMap<string, KernelType>;
    readonly enumValues?: readonly string[];
    readonly literalValue?: unknown;
    readonly items?: KernelType;
    readonly keys?: KernelType;
    readonly values?: KernelType;
    readonly variants?: ReadonlyMap<string, KernelType>;
    readonly of?: KernelType;
    readonly traits?: readonly TraitRef[];
    readonly metadata?: KernelMetadata;
  },
): KernelType => ({
  id: `type:${kind}` as KernelId<"type">,
  kind,
  properties: input?.properties,
  enumValues: input?.enumValues,
  literalValue: input?.literalValue,
  items: input?.items,
  keys: input?.keys,
  values: input?.values,
  variants: input?.variants,
  of: input?.of,
  traits: input?.traits ?? [],
  metadata: input?.metadata,
});

/** Common built-in types. */
export const kernelTypes = {
  unknown: defineType("unknown"),
  never: defineType("never"),
  string: defineType("string", { traits: ["type.queryable"] }),
  number: defineType("number", { traits: ["type.queryable"] }),
  boolean: defineType("boolean"),
  uuid: defineType("uuid", { traits: ["type.uuid", "type.unique"] }),
  email: defineType("email", { traits: ["type.email", "type.queryable"] }),
  datetime: defineType("datetime", { traits: ["type.datetime", "type.queryable"] }),
};