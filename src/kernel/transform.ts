/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel transform - typed conversions.
 *
 * Typed conversion between representations.
 * Models the revised core Transform primitive.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { TraitRef } from "./trait.ts";
import type { KernelType } from "./type.ts";

/** Transform direction. */
export type TransformDirection = "encode" | "decode" | "both";

/** Kernel transform definition. */
export interface KernelTransform<
  From = unknown,
  To = unknown,
> {
  readonly id: KernelId<"transform">;
  readonly from: KernelType<From>;
  readonly to: KernelType<To>;
  readonly direction: TransformDirection;
  readonly decode?: string;
  readonly encode?: string;
  readonly traits: readonly TraitRef[];
  readonly metadata?: KernelMetadata;
}

/** Create a kernel transform. */
export const defineTransform = <From, To>(
  from: KernelType<From>,
  to: KernelType<To>,
  input?: {
    readonly direction?: TransformDirection;
    readonly decode?: string;
    readonly encode?: string;
    readonly traits?: readonly TraitRef[];
    readonly metadata?: KernelMetadata;
  },
): KernelTransform<From, To> => ({
  id: `transform:${Date.now()}` as KernelId<"transform">,
  from,
  to,
  direction: input?.direction ?? "both",
  decode: input?.decode,
  encode: input?.encode,
  traits: input?.traits ?? [],
  metadata: input?.metadata,
});

/** Common transforms. */
export const transforms = {
  stringToUuid: defineTransform(
    { kind: "string" } as KernelType<string>,
    { kind: "uuid" } as KernelType<string>,
    { direction: "decode", traits: ["transform.decodable"] },
  ),
  jsonToObject: defineTransform(
    { kind: "string" } as KernelType<string>,
    { kind: "object" } as KernelType<object>,
    { direction: "decode", traits: ["transform.decodable"] },
  ),
  objectToJson: defineTransform(
    { kind: "object" } as KernelType<object>,
    { kind: "string" } as KernelType<string>,
    { direction: "encode", traits: ["transform.encodable"] },
  ),
  dateToIso: defineTransform(
    { kind: "datetime" } as KernelType<string>,
    { kind: "string" } as KernelType<string>,
    { direction: "encode", traits: ["transform.encodable"] },
  ),
  isoToDate: defineTransform(
    { kind: "string" } as KernelType<string>,
    { kind: "datetime" } as KernelType<string>,
    { direction: "decode", traits: ["transform.decodable"] },
  ),
};