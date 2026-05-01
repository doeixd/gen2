/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel node - semantic graph objects.
 *
 * A semantic object in the application graph.
 * Models the revised core Node primitive.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { TraitRef } from "./trait.ts";
import type { KernelType } from "./type.ts";
import type { KernelExpr } from "./expr.ts";
import type { KernelRef } from "./id.ts";

/** Kinds of nodes in the kernel. */
export type NodeKind =
  | "entity"
  | "field"
  | "rule"
  | "query"
  | "action"
  | "view"
  | "policy"
  | "provider"
  | "service"
  | "boundary"
  | "storage"
  | "workflow"
  | "dispatch"
  | "resource"
  | "key"
  | "static";

/** Kernel node - a semantic object in the graph. */
export interface KernelNode<
  In = unknown,
  Out = unknown,
> {
  readonly id: KernelId<"node">;
  readonly kind: NodeKind;
  readonly name?: string;
  readonly input?: KernelType<In>;
  readonly output?: KernelType<Out>;
  readonly body?: KernelExpr | KernelRef;
  readonly traits: readonly TraitRef[];
  readonly metadata?: KernelMetadata;
}

/** Create a kernel node. */
export const defineNode = <const K extends NodeKind, In, Out>(
  kind: K,
  input?: {
    readonly name?: string;
    readonly input?: KernelType<In>;
    readonly output?: KernelType<Out>;
    readonly body?: KernelExpr | KernelRef;
    readonly traits?: readonly TraitRef[];
    readonly metadata?: KernelMetadata;
  },
): KernelNode<In, Out> => ({
  id: `node:${kind}:${input?.name ?? ""}` as KernelId<"node">,
  kind,
  name: input?.name,
  input: input?.input,
  output: input?.output,
  body: input?.body,
  traits: input?.traits ?? [],
  metadata: input?.metadata,
});

/** Common node builders. */
export const node = {
  entity: (name: string, output: KernelType): KernelNode =>
    defineNode("entity", {
      name,
      output,
      traits: ["node.entity", "node.named"],
    }),

  field: (name: string, type: KernelType, owner: KernelId<"node">): KernelNode =>
    defineNode("field", {
      name,
      output: type,
      traits: ["node.named", "node.typed"],
    }),

  rule: (
    name: string,
    body: KernelExpr<boolean>,
    metadata?: KernelMetadata,
  ): KernelNode<unknown, boolean> =>
    defineNode("rule", {
      name,
      output: { kind: "boolean" } as KernelType<boolean>,
      body,
      traits: ["node.rule", "node.targetInterpretable"],
      metadata,
    }),

  query: <In, Out>(
    name: string,
    input: KernelType<In>,
    output: KernelType<Out>,
    body: KernelExpr<Out>,
  ): KernelNode<In, Out> =>
    defineNode("query", {
      name,
      input,
      output,
      body,
      traits: ["node.query", "node.callable", "node.readable"],
    }),

  action: <In, Out>(
    name: string,
    input: KernelType<In>,
    output: KernelType<Out>,
    body: KernelExpr<Out>,
  ): KernelNode<In, Out> =>
    defineNode("action", {
      name,
      input,
      output,
      body,
      traits: ["node.action", "node.callable", "node.writable", "node.effectful"],
    }),

  view: (name: string, metadata?: KernelMetadata): KernelNode =>
    defineNode("view", {
      name,
      traits: ["node.view", "node.static"],
      metadata,
    }),

  policy: (name: string, body: KernelExpr<boolean>): KernelNode<unknown, boolean> =>
    defineNode("policy", {
      name,
      output: { kind: "boolean" } as KernelType<boolean>,
      body,
      traits: ["node.policy_protected", "node.targetInterpretable"],
    }),
};