/* @__NO_SIDE_EFFECTS__ */
/** Kernel transform - typed conversions. */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { KernelType } from "./type.ts";

/** Transform direction. */
export type TransformDirection = "encode" | "decode" | "both";

/** Kernel transform definition. */
export interface KernelTransform<From = unknown, To = unknown> {
  readonly id: KernelId<"transform">;
  readonly from: KernelType<From>;
  readonly to: KernelType<To>;
  readonly direction: TransformDirection;
  readonly decode?: string;
  readonly encode?: string;
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
    readonly metadata?: KernelMetadata;
  },
): KernelTransform<From, To> => ({
  id: `transform:${Date.now()}` as KernelId<"transform">,
  from,
  to,
  direction: input?.direction ?? "both",
  decode: input?.decode,
  encode: input?.encode,
  metadata: input?.metadata,
});