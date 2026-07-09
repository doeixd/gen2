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

/**
 * Create a kernel transform.
 *
 * The ID is deterministic by default — derived from the participating
 * type IDs and direction. Pass an explicit `id` to override (e.g. for
 * named codecs that need a stable, human-readable identifier).
 *
 * Date-based IDs were removed because they prevent graph diff, snapshot
 * replay, and rename detection (see PLAN.md §7 quick win #1).
 */
export const defineTransform = <From, To>(
  from: KernelType<From>,
  to: KernelType<To>,
  input?: {
    readonly id?: string;
    readonly direction?: TransformDirection;
    readonly decode?: string;
    readonly encode?: string;
    readonly metadata?: KernelMetadata;
  },
): KernelTransform<From, To> => {
  const direction = input?.direction ?? "both";
  const id = input?.id ?? (`transform:${from.id}->${to.id}:${direction}` as string);
  return {
    id: id as KernelId<"transform">,
    from,
    to,
    direction,
    decode: input?.decode,
    encode: input?.encode,
    metadata: input?.metadata,
  };
};
