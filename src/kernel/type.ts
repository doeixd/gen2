/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel type - semantic value shapes.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";

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

/** Kernel type definition. */
export interface KernelType<Decoded = unknown> {
  readonly id: KernelId<"type">;
  readonly kind: KernelTypeKind;
  readonly properties?: ReadonlyMap<string, KernelType>;
  readonly enumValues?: readonly string[];
  readonly literalValue?: unknown;
  readonly items?: KernelType;
  readonly keys?: KernelType;
  readonly values?: KernelType;
  readonly variants?: ReadonlyMap<string, KernelType>;
  readonly of?: KernelType;
  readonly metadata?: KernelMetadata;
}

/** Create a kernel type. */
export const defineType = <Kind extends KernelTypeKind>(
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
  metadata: input?.metadata,
});

/** Common built-in types. */
export const kernelTypes = {
  unknown: defineType("unknown"),
  never: defineType("never"),
  string: defineType("string"),
  number: defineType("number"),
  boolean: defineType("boolean"),
  uuid: defineType("uuid"),
  email: defineType("email"),
  datetime: defineType("datetime"),
};