/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel identity primitives.
 *
 * Stable identity for kernel objects. Models the revised core Id primitive.
 */

import type { Ref } from "../core/refs.ts";

/** Kernel identity brand. */
declare const kernelIdBrand: unique symbol;

/** Stable kernel ID for a specific semantic namespace. */
export type KernelId<Kind extends string = string> = string & {
  readonly [kernelIdBrand]?: Kind;
};

/** Kernel ID constructors for all kernel object kinds. */
export type EntityKernelId = KernelId<"entity">;
export type FieldKernelId = KernelId<"field">;
export type TypeKernelId = KernelId<"type">;
export type ExprKernelId = KernelId<"expr">;
export type TransformKernelId = KernelId<"transform">;
export type NodeKernelId = KernelId<"node">;
export type EdgeKernelId = KernelId<"edge">;
export type TraitKernelId = KernelId<"trait">;
export type MetadataKernelId = KernelId<"metadata">;
export type PassKernelId = KernelId<"pass">;
export type GraphKernelId = KernelId<"graph">;

/** All valid kernel ID kinds. */
export type KernelIdKind =
  | "entity"
  | "field"
  | "type"
  | "expr"
  | "transform"
  | "node"
  | "edge"
  | "trait"
  | "metadata"
  | "pass"
  | "graph";

/** Brand a string as a kernel ID. */
export const kernelId = <Kind extends string>(id: string): KernelId<Kind> => id as KernelId<Kind>;

/** Kernel object reference - can wrap existing Ref or create new KernelId. */
export interface KernelRef<Kind extends string = string, Ts = unknown> {
  readonly kind: Kind;
  readonly id?: KernelId<Kind>;
  readonly name?: string;
  readonly _ts?: Ts;
}

/** Convert existing Ref to KernelRef. */
export const refToKernelRef = <Kind extends string>(
  ref: Ref,
): KernelRef<Kind> => ({
  kind: ref.kind as Kind,
  id: kernelId<Kind>(ref.id ?? ref.name ?? ""),
  name: ref.name,
});

/** Union of all kernel object references. */
export type KernelObjectRef =
  | KernelRef<"node">
  | KernelRef<"edge">
  | KernelRef<"type">
  | KernelRef<"expr">
  | KernelRef<"transform">
  | KernelRef<"trait">
  | Ref;