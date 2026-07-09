/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel identity primitives.
 *
 * Stable identity for kernel objects. Models the revised core Id primitive.
 */

import type { Ref } from "../core/refs.ts";
import type { KernelNode, NodeKind } from "./node.ts";
import type { NodeKindDef, EdgeKindDef } from "./ods.ts";

/** Kernel identity brand. */
declare const kernelIdBrand: unique symbol;

/** Stable kernel ID for a specific semantic namespace. */
export type KernelId<Kind extends string = string> = string & {
  readonly [kernelIdBrand]?: Kind;
};

/** Additional phantom brand carried by IDs made through `id.createFactory`. */
declare const namespacedKernelIdBrand: unique symbol;

export type NamespacedKernelId<
  Kind extends string,
  Namespace extends string,
  Witness = unknown,
  Name extends string = string,
> = KernelId<Kind> &
  string & {
    readonly [namespacedKernelIdBrand]: {
      readonly kind: Kind;
      readonly namespace: Namespace;
      readonly witness: Witness;
      readonly name: Name;
    };
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
  | "graph"
  | "artifact"
  | "target"
  | "node.kind"
  | "edge.kind"
  | "endpoint.role"
  | "op"
  | "scope.binding"
  | "scope.execution";

/** Brand a string as a kernel ID while preserving literal identity. */
export const kernelId = <Kind extends string, const Id extends string = string>(
  id: Id,
): KernelId<Kind> & Id => id as KernelId<Kind> & Id;

type IdWitness = { readonly id: string };

type IdPart = string | number | boolean | IdWitness | { readonly name: string };

const idPartToString = (part: IdPart): string => {
  if (typeof part === "object") {
    if ("id" in part) return part.id;
    return part.name;
  }
  return String(part);
};

const joinIdParts = (parts: readonly IdPart[]): string => parts.map(idPartToString).join(":");

const namespacedId = <
  const Kind extends string,
  const Namespace extends string,
  Witness,
  const Name extends string,
>(
  id: string,
): NamespacedKernelId<Kind, Namespace, Witness, Name> =>
  id as NamespacedKernelId<Kind, Namespace, Witness, Name>;

export interface NamespaceIdParser<Namespace extends string> {
  node<const Kind extends IdWitness, const Raw extends string>(
    kind: Kind,
    raw: Raw,
  ): NamespacedKernelId<"node", Namespace, Kind, Raw>;
  edge<const Kind extends IdWitness, const Raw extends string>(
    kind: Kind,
    raw: Raw,
  ): NamespacedKernelId<"edge", Namespace, Kind, Raw>;
  type<const Raw extends string>(raw: Raw): NamespacedKernelId<"type", Namespace, unknown, Raw>;
  expr<const Raw extends string>(raw: Raw): NamespacedKernelId<"expr", Namespace, unknown, Raw>;
  pass<const Raw extends string>(raw: Raw): NamespacedKernelId<"pass", Namespace, unknown, Raw>;
  artifact<const Raw extends string>(
    raw: Raw,
  ): NamespacedKernelId<"artifact", Namespace, unknown, Raw>;
  nodeRef<
    const Kind extends NodeKindDef,
    const Raw extends string,
    const Name extends string | undefined = undefined,
  >(
    kind: Kind,
    raw: Raw,
    input?: { readonly name?: Name },
  ): KernelNodeRef<NodeKindShape<Kind>, NamespacedKernelId<"node", Namespace, Kind, Raw>, Name>;
  edgeRef<
    const Kind extends EdgeKindDef,
    const Raw extends string,
    const Name extends string | undefined = undefined,
  >(
    kind: Kind,
    raw: Raw,
    input?: { readonly name?: Name },
  ): KernelEdgeRef<EdgeKindShape<Kind>, NamespacedKernelId<"edge", Namespace, Kind, Raw>> & {
    readonly name?: Name;
  };
}

export interface NamespaceIdFactory<Namespace extends string> {
  readonly namespace: Namespace;
  node<const Kind extends IdWitness, const Name extends string>(
    kind: Kind,
    name: Name,
  ): NamespacedKernelId<"node", Namespace, Kind, `node:${Namespace}:${Kind["id"]}:${Name}`>;
  edge<const Kind extends IdWitness, const Parts extends readonly IdPart[]>(
    kind: Kind,
    ...parts: Parts
  ): NamespacedKernelId<"edge", Namespace, Kind, `edge:${Namespace}:${Kind["id"]}:${string}`>;
  type<const Name extends string>(
    name: Name,
  ): NamespacedKernelId<"type", Namespace, unknown, `type:${Namespace}:${Name}`>;
  expr<const Name extends string>(
    name: Name,
  ): NamespacedKernelId<"expr", Namespace, unknown, `expr:${Namespace}:${Name}`>;
  pass<const Name extends string>(
    name: Name,
  ): NamespacedKernelId<"pass", Namespace, unknown, `pass:${Namespace}:${Name}`>;
  artifact<const Name extends string>(
    name: Name,
  ): NamespacedKernelId<"artifact", Namespace, unknown, `artifact:${Namespace}:${Name}`>;
  /** Build a typed node ref bound to this namespace; mirrors `.node(...)` and wraps the result. */
  nodeRef<const Kind extends NodeKindDef, const Name extends string>(
    kind: Kind,
    name: Name,
  ): KernelNodeRef<
    NodeKindShape<Kind>,
    NamespacedKernelId<"node", Namespace, Kind, `node:${Namespace}:${Kind["id"]}:${Name}`>,
    Name
  >;
  /** Build a typed edge ref bound to this namespace; mirrors `.edge(...)` and wraps the result. */
  edgeRef<const Kind extends EdgeKindDef, const Parts extends readonly IdPart[]>(
    kind: Kind,
    ...parts: Parts
  ): KernelEdgeRef<
    EdgeKindShape<Kind>,
    NamespacedKernelId<"edge", Namespace, Kind, `edge:${Namespace}:${Kind["id"]}:${string}`>
  >;
  readonly parse: NamespaceIdParser<Namespace>;
}

const kindShape = <
  Def extends { readonly id: string; readonly metadata?: { readonly title?: unknown } },
>(
  def: Def,
): { readonly id: Def["id"]; readonly label: string } => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? (def.metadata.title as string) : def.id,
});

export const createIdFactory = <const Namespace extends string>(
  namespace: Namespace,
): NamespaceIdFactory<Namespace> => {
  const nodeIdFor = (kind: { readonly id: string }, name: string): string =>
    `node:${namespace}:${kind.id}:${name}`;
  const edgeIdFor = (kind: { readonly id: string }, parts: readonly IdPart[]): string =>
    `edge:${namespace}:${kind.id}:${joinIdParts(parts)}`;
  return {
    namespace,
    node: (kind, name) => namespacedId(nodeIdFor(kind, name as string)),
    edge: (kind, ...parts) => namespacedId(edgeIdFor(kind, parts)),
    type: (name) => namespacedId(`type:${namespace}:${name}`),
    expr: (name) => namespacedId(`expr:${namespace}:${name}`),
    pass: (name) => namespacedId(`pass:${namespace}:${name}`),
    artifact: (name) => namespacedId(`artifact:${namespace}:${name}`),
    nodeRef: ((kind: NodeKindDef, name: string) => ({
      kind: "node",
      id: namespacedId(nodeIdFor(kind, name)),
      name,
      nodeKind: kindShape(kind),
    })) as NamespaceIdFactory<Namespace>["nodeRef"],
    edgeRef: ((kind: EdgeKindDef, ...parts: readonly IdPart[]) => ({
      kind: "edge",
      id: namespacedId(edgeIdFor(kind, parts)),
      edgeKind: kindShape(kind),
    })) as NamespaceIdFactory<Namespace>["edgeRef"],
    parse: {
      node: (_kind, raw) => namespacedId(raw),
      edge: (_kind, raw) => namespacedId(raw),
      type: (raw) => namespacedId(raw),
      expr: (raw) => namespacedId(raw),
      pass: (raw) => namespacedId(raw),
      artifact: (raw) => namespacedId(raw),
      nodeRef: ((kind: NodeKindDef, raw: string, input?: { readonly name?: string }) => ({
        kind: "node",
        id: namespacedId(raw),
        name: input?.name,
        nodeKind: kindShape(kind),
      })) as NamespaceIdParser<Namespace>["nodeRef"],
      edgeRef: ((kind: EdgeKindDef, raw: string, input?: { readonly name?: string }) => ({
        kind: "edge",
        id: namespacedId(raw),
        name: input?.name,
        edgeKind: kindShape(kind),
      })) as NamespaceIdParser<Namespace>["edgeRef"],
    },
  };
};

export const id = {
  createFactory: createIdFactory,
} as const;

/** Kernel object reference - can wrap existing Ref or create new KernelId. */
export interface KernelRef<Kind extends string = string, Ts = unknown> {
  readonly kind: Kind;
  readonly id?: KernelId<Kind>;
  readonly name?: string;
  readonly _ts?: Ts;
}

/** Display shape derived from a NodeKindDef (id + label). */
export type NodeKindShape<Kind extends NodeKindDef> = {
  readonly id: Kind["id"];
  readonly label: string;
};

/** Display shape derived from an EdgeKindDef (id + label). */
export type EdgeKindShape<Kind extends EdgeKindDef> = {
  readonly id: Kind["id"];
  readonly label: string;
};

/** Kind-aware reference to a kernel edge. */
export type KernelEdgeRef<
  TEdgeKind extends { readonly id: string; readonly label: string } = {
    readonly id: string;
    readonly label: string;
  },
  TId extends KernelId<"edge"> = KernelId<"edge">,
> = KernelRef<"edge", TEdgeKind> & {
  readonly edgeKind: TEdgeKind;
  readonly id: TId;
  readonly __edge?: TEdgeKind;
};

/** Build a typed kernel object ref without requiring call-site casts. */
export const kernelRef = <const Kind extends string, const Id extends string>(
  kind: Kind,
  id: Id,
  input?: {
    readonly name?: string;
  },
): KernelRef<Kind> & { readonly id: KernelId<Kind> & Id } => ({
  kind,
  id: kernelId<Kind, Id>(id),
  name: input?.name,
});

/** Kind-aware reference to a kernel node. */
export type KernelNodeRef<
  TNodeKind extends NodeKind = NodeKind,
  TId extends KernelId<"node"> = KernelId<"node">,
  TName extends string | undefined = string | undefined,
> = KernelRef<"node", TNodeKind> & {
  readonly nodeKind: TNodeKind;
  readonly id: TId;
  readonly name?: TName;
  readonly __node?: TNodeKind;
};

/** Infer the precise node ref type for an existing kernel node value. */
export type RefOf<TNode extends KernelNode> = KernelNodeRef<
  TNode["kind"],
  TNode["id"],
  TNode["name"]
>;

/** Build a kind-aware node ref from a kernel node witness. */
export const refOf = <const TNode extends KernelNode>(node: TNode): RefOf<TNode> =>
  ({
    kind: "node",
    nodeKind: node.kind,
    id: node.id,
    name: node.name,
  }) as RefOf<TNode>;

/** Convert existing Ref to KernelRef. */
export const refToKernelRef = <Kind extends string>(ref: Ref): KernelRef<Kind> => ({
  kind: ref.kind as Kind,
  id: kernelId<Kind>(ref.id ?? ref.name ?? ""),
  name: ref.name,
});

/** Union of all kernel object references. */
export type KernelObjectRef = KernelRef<string> | Ref;
