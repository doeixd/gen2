/* @__NO_SIDE_EFFECTS__ */
/** Kernel type - semantic value shapes. */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { TraitDef } from "./trait.ts";

/** Type kind - typed symbol. */
export interface TypeKind {
  readonly id: string;
  readonly label: string;
}

/** Common type kinds. */
export const typeKinds = {
  UNKNOWN: { id: "type.unknown", label: "Unknown" },
  NEVER: { id: "type.never", label: "Never" },
  STRING: { id: "type.string", label: "String" },
  NUMBER: { id: "type.number", label: "Number" },
  BOOLEAN: { id: "type.boolean", label: "Boolean" },
  UUID: { id: "type.uuid", label: "UUID" },
  EMAIL: { id: "type.email", label: "Email" },
  DATETIME: { id: "type.datetime", label: "DateTime" },
  ENUM: { id: "type.enum", label: "Enum" },
  LITERAL: { id: "type.literal", label: "Literal" },
  OBJECT: { id: "type.object", label: "Object" },
  ARRAY: { id: "type.array", label: "Array" },
  RECORD: { id: "type.record", label: "Record" },
  UNION: { id: "type.union", label: "Union" },
  TAGGED_UNION: { id: "type.taggedUnion", label: "TaggedUnion" },
  CUSTOM: { id: "type.custom", label: "Custom" },
  OPAQUE: { id: "type.opaque", label: "Opaque" },
} as const;

/** Kernel type definition. */
export interface KernelType<Decoded = unknown> {
  readonly kind: TypeKind;
  readonly id: KernelId<"type">;
  readonly decoded?: Decoded;
  readonly properties?: ReadonlyMap<string, KernelType>;
  readonly enumValues?: readonly string[];
  readonly literalValue?: unknown;
  readonly items?: KernelType;
  readonly keys?: KernelType;
  readonly values?: KernelType;
  readonly variants?: ReadonlyMap<string, KernelType>;
  readonly of?: KernelType;
  readonly traits: readonly TraitDef[];
  readonly metadata?: KernelMetadata;
}

/** Create a kernel type. */
export const defineType = <Kind extends TypeKind>(
  kind: Kind,
  id: string,
  input?: {
    readonly properties?: ReadonlyMap<string, KernelType>;
    readonly enumValues?: readonly string[];
    readonly literalValue?: unknown;
    readonly items?: KernelType;
    readonly keys?: KernelType;
    readonly values?: KernelType;
    readonly variants?: ReadonlyMap<string, KernelType>;
    readonly of?: KernelType;
    readonly traits?: readonly TraitDef[];
    readonly metadata?: KernelMetadata;
  },
): KernelType => ({
  kind,
  id: id as KernelId<"type">,
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
  unknown: defineType(typeKinds.UNKNOWN, "type:unknown"),
  never: defineType(typeKinds.NEVER, "type:never"),
  string: defineType(typeKinds.STRING, "type:string"),
  number: defineType(typeKinds.NUMBER, "type:number"),
  boolean: defineType(typeKinds.BOOLEAN, "type:boolean"),
  uuid: defineType(typeKinds.UUID, "type:uuid"),
  email: defineType(typeKinds.EMAIL, "type:email"),
  datetime: defineType(typeKinds.DATETIME, "type:datetime"),
};

/** Inference helpers. */
export type InferDecoded<T> = T extends KernelType<infer D> ? D : never;