/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel node - semantic graph objects.
 *
 * A semantic object in the application graph.
 */

import type {
  KernelId,
  KernelNodeRef,
  KernelEdgeRef,
  NamespacedKernelId,
  NamespaceIdFactory,
} from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { TraitDef } from "./trait.ts";
import type { KernelType } from "./type.ts";
import type { KernelExpr } from "./expr.ts";
import type { KernelObjectRef } from "./id.ts";
import type { EdgeKindDef, EndpointRoleDef, NodeKindDef } from "./ods.ts";

/** Node kind - simple typed identifier. */
export interface NodeKind {
  readonly id: string;
  readonly label: string;
}

/** Kernel node - a semantic object in the graph. */
export interface KernelNode<
  Kind extends NodeKind = NodeKind,
  In = unknown,
  Out = unknown,
  Metadata extends KernelMetadata = KernelMetadata,
> {
  readonly kind: Kind;
  readonly id: KernelId<"node">;
  readonly name?: string;
  readonly input?: KernelType<In>;
  readonly output?: KernelType<Out>;
  readonly body?: KernelExpr | KernelObjectRef;
  readonly traits: readonly TraitDef[];
  readonly metadata?: Metadata;
}

/** Create a kernel node. */
export const defineNode = <Kind extends NodeKind, In, Out>(
  kind: Kind,
  id: string,
  input?: {
    readonly name?: string;
    readonly input?: KernelType<In>;
    readonly output?: KernelType<Out>;
    readonly body?: KernelExpr | KernelObjectRef;
    readonly traits?: readonly TraitDef[];
    readonly metadata?: KernelMetadata;
  },
): KernelNode<Kind, In, Out> => ({
  kind,
  id: id as KernelId<"node">,
  name: input?.name,
  input: input?.input,
  output: input?.output,
  body: input?.body,
  traits: input?.traits ?? [],
  metadata: input?.metadata,
});

export type NodeCustomOf<Kind extends NodeKindDef> =
  Kind extends NodeKindDef<
    string,
    readonly EndpointRoleDef[],
    readonly EndpointRoleDef[],
    readonly TraitDef[],
    infer Custom
  >
    ? Custom
    : Record<string, unknown>;

export type NodeMetadataFor<Kind extends NodeKindDef> = KernelMetadata<NodeCustomOf<Kind>>;

export type NodeKindFromDef<Kind extends NodeKindDef> = {
  readonly id: Kind["id"];
  readonly label: string;
};

export const nodeKindFromDef = <const Kind extends NodeKindDef>(
  def: Kind,
): NodeKindFromDef<Kind> => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

/** Create a kernel node from a typed ODS node-kind witness. */
export const defineNodeFromKind = <
  const Kind extends NodeKindDef,
  In,
  Out,
  const Metadata extends NodeMetadataFor<Kind> = NodeMetadataFor<Kind>,
>(
  kind: Kind,
  id: string,
  input?: {
    readonly name?: string;
    readonly input?: KernelType<In>;
    readonly output?: KernelType<Out>;
    readonly body?: KernelExpr | KernelObjectRef;
    readonly traits?: readonly TraitDef[];
    readonly metadata?: Metadata;
  },
): KernelNode<NodeKindFromDef<Kind>, In, Out, Metadata> =>
  defineNode(nodeKindFromDef(kind), id, input) as KernelNode<
    NodeKindFromDef<Kind>,
    In,
    Out,
    Metadata
  >;

type NodeRefOptions<Name extends string | undefined = string | undefined> = {
  readonly name?: Name;
};

type NodeRefId<Kind extends NodeKindDef, Id extends KernelId<"node"> = KernelId<"node">> = Id &
  KernelId<"node"> & {
    readonly __nodeKindWitness?: Kind;
  };

const makeNodeRef = <
  const Kind extends NodeKindDef,
  const Id extends KernelId<"node">,
  const Name extends string | undefined = undefined,
>(
  kind: Kind,
  id: Id,
  input?: NodeRefOptions<Name>,
): KernelNodeRef<NodeKindFromDef<Kind>, Id, Name> =>
  ({
    kind: "node",
    id,
    name: input?.name,
    nodeKind: nodeKindFromDef(kind),
  }) as KernelNodeRef<NodeKindFromDef<Kind>, Id, Name>;

type NodeRefFactory = {
  /** Build a typed node ref from a branded node id made by `id.createFactory(...)`. */
  <
    const Kind extends NodeKindDef,
    const Id extends NamespacedKernelId<"node", string, NoInfer<Kind>, string>,
    const Name extends string | undefined = undefined,
  >(
    kind: Kind,
    id: Id,
    input?: NodeRefOptions<Name>,
  ): KernelNodeRef<NodeKindFromDef<Kind>, Id, Name>;

  /** Parse a dynamic raw id at an explicit ingestion boundary. */
  parse<
    const Kind extends NodeKindDef,
    const Raw extends string,
    const Name extends string | undefined = undefined,
  >(
    kind: Kind,
    raw: Raw,
    input?: NodeRefOptions<Name>,
  ): KernelNodeRef<NodeKindFromDef<Kind>, NodeRefId<Kind, KernelId<"node"> & Raw>, Name>;

  /** Unsafe escape hatch for existing graph/dialect adapters and tests. */
  unsafe<
    const Kind extends NodeKindDef,
    const Raw extends string,
    const Name extends string | undefined = undefined,
  >(
    kind: Kind,
    raw: Raw,
    input?: NodeRefOptions<Name>,
  ): KernelNodeRef<NodeKindFromDef<Kind>, NodeRefId<Kind, KernelId<"node"> & Raw>, Name>;
};

/** Build a typed node ref from a node-kind witness without requiring a node instance. */
export const nodeRef = Object.assign(
  <
    const Kind extends NodeKindDef,
    const Id extends NamespacedKernelId<"node", string, NoInfer<Kind>, string>,
    const Name extends string | undefined = undefined,
  >(
    kind: Kind,
    id: Id,
    input?: NodeRefOptions<Name>,
  ) => makeNodeRef(kind, id, input),
  {
    parse: <
      const Kind extends NodeKindDef,
      const Raw extends string,
      const Name extends string | undefined = undefined,
    >(
      kind: Kind,
      raw: Raw,
      input?: NodeRefOptions<Name>,
    ) => makeNodeRef(kind, raw as NodeRefId<Kind, KernelId<"node"> & Raw>, input),
    unsafe: <
      const Kind extends NodeKindDef,
      const Raw extends string,
      const Name extends string | undefined = undefined,
    >(
      kind: Kind,
      raw: Raw,
      input?: NodeRefOptions<Name>,
    ) => makeNodeRef(kind, raw as NodeRefId<Kind, KernelId<"node"> & Raw>, input),
  },
) as NodeRefFactory;

type RefIdPart = string | number | boolean | { readonly id: string } | { readonly name: string };

type EdgeKindFromDef<Kind extends EdgeKindDef> = {
  readonly id: Kind["id"];
  readonly label: string;
};

const edgeKindFromDef = <const Kind extends EdgeKindDef>(def: Kind): EdgeKindFromDef<Kind> => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

export type { KernelEdgeRef };

type EdgeRefId<Kind extends EdgeKindDef, Id extends KernelId<"edge"> = KernelId<"edge">> = Id &
  KernelId<"edge"> & {
    readonly __edgeKindWitness?: Kind;
  };

const edgeRef = <
  const Kind extends EdgeKindDef,
  const Id extends KernelId<"edge">,
  const Name extends string | undefined = undefined,
>(
  kind: Kind,
  id: Id,
  input?: NodeRefOptions<Name>,
): KernelEdgeRef<EdgeKindFromDef<Kind>, Id> & { readonly name?: Name } =>
  ({
    kind: "edge",
    id,
    name: input?.name,
    edgeKind: edgeKindFromDef(kind),
  }) as KernelEdgeRef<EdgeKindFromDef<Kind>, Id> & { readonly name?: Name };

/**
 * Explicit shape for {@link ref}. Declared by hand (rather than left to
 * inference) so the exported const's type never needs to expand the private
 * `kernelIdBrand` symbol from `./id.ts` for declaration-emit purposes.
 */
type RefApi = {
  node<const Namespace extends string, const Kind extends NodeKindDef, const Name extends string>(
    factory: NamespaceIdFactory<Namespace>,
    kind: Kind,
    name: Name,
    input?: NodeRefOptions<Name>,
  ): KernelNodeRef<
    NodeKindFromDef<Kind>,
    NamespacedKernelId<"node", Namespace, Kind, `node:${Namespace}:${Kind["id"]}:${Name}`>,
    Name
  >;
  edge<
    const Namespace extends string,
    const Kind extends EdgeKindDef,
    const Parts extends readonly RefIdPart[],
  >(
    factory: NamespaceIdFactory<Namespace>,
    kind: Kind,
    ...parts: Parts
  ): KernelEdgeRef<
    EdgeKindFromDef<Kind>,
    NamespacedKernelId<"edge", Namespace, Kind, `edge:${Namespace}:${Kind["id"]}:${string}`>
  > & { readonly name?: undefined };
  parse: {
    node<
      const Namespace extends string,
      const Kind extends NodeKindDef,
      const Raw extends string,
      const Name extends string | undefined = undefined,
    >(
      factory: NamespaceIdFactory<Namespace>,
      kind: Kind,
      raw: Raw,
      input?: NodeRefOptions<Name>,
    ): KernelNodeRef<NodeKindFromDef<Kind>, NamespacedKernelId<"node", Namespace, Kind, Raw>, Name>;
    edge<
      const Namespace extends string,
      const Kind extends EdgeKindDef,
      const Raw extends string,
      const Name extends string | undefined = undefined,
    >(
      factory: NamespaceIdFactory<Namespace>,
      kind: Kind,
      raw: Raw,
      input?: NodeRefOptions<Name>,
    ): KernelEdgeRef<EdgeKindFromDef<Kind>, NamespacedKernelId<"edge", Namespace, Kind, Raw>> & {
      readonly name?: Name;
    };
  };
  unsafe: {
    node<
      const Kind extends NodeKindDef,
      const Raw extends string,
      const Name extends string | undefined = undefined,
    >(
      kind: Kind,
      raw: Raw,
      input?: NodeRefOptions<Name>,
    ): KernelNodeRef<NodeKindFromDef<Kind>, NodeRefId<Kind, KernelId<"node"> & Raw>, Name>;
    edge<
      const Kind extends EdgeKindDef,
      const Raw extends string,
      const Name extends string | undefined = undefined,
    >(
      kind: Kind,
      raw: Raw,
      input?: NodeRefOptions<Name>,
    ): KernelEdgeRef<EdgeKindFromDef<Kind>, EdgeRefId<Kind, KernelId<"edge"> & Raw>> & {
      readonly name?: Name;
    };
  };
};

export const ref: RefApi = {
  node: <const Namespace extends string, const Kind extends NodeKindDef, const Name extends string>(
    factory: NamespaceIdFactory<Namespace>,
    kind: Kind,
    name: Name,
    input?: NodeRefOptions<Name>,
  ) => nodeRef(kind, factory.node(kind, name), input ?? ({ name } as NodeRefOptions<Name>)),
  edge: <
    const Namespace extends string,
    const Kind extends EdgeKindDef,
    const Parts extends readonly RefIdPart[],
  >(
    factory: NamespaceIdFactory<Namespace>,
    kind: Kind,
    ...parts: Parts
  ) => edgeRef(kind, factory.edge(kind, ...parts)),
  parse: {
    node: <
      const Namespace extends string,
      const Kind extends NodeKindDef,
      const Raw extends string,
      const Name extends string | undefined = undefined,
    >(
      factory: NamespaceIdFactory<Namespace>,
      kind: Kind,
      raw: Raw,
      input?: NodeRefOptions<Name>,
    ) => nodeRef(kind, factory.parse.node(kind, raw), input),
    edge: <
      const Namespace extends string,
      const Kind extends EdgeKindDef,
      const Raw extends string,
      const Name extends string | undefined = undefined,
    >(
      factory: NamespaceIdFactory<Namespace>,
      kind: Kind,
      raw: Raw,
      input?: NodeRefOptions<Name>,
    ) => edgeRef(kind, factory.parse.edge(kind, raw), input),
  },
  unsafe: {
    node: <
      const Kind extends NodeKindDef,
      const Raw extends string,
      const Name extends string | undefined = undefined,
    >(
      kind: Kind,
      raw: Raw,
      input?: NodeRefOptions<Name>,
    ) => nodeRef.unsafe(kind, raw, input),
    edge: <
      const Kind extends EdgeKindDef,
      const Raw extends string,
      const Name extends string | undefined = undefined,
    >(
      kind: Kind,
      raw: Raw,
      input?: NodeRefOptions<Name>,
    ) => edgeRef(kind, raw as EdgeRefId<Kind, KernelId<"edge"> & Raw>, input),
  },
};
