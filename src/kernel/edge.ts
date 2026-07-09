/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel edge - semantic connections.
 *
 * A semantic connection between graph objects - first-class.
 */

import type { KernelId, NamespacedKernelId, NamespaceIdFactory } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { TraitDef } from "./trait.ts";
import type { KernelObjectRef, KernelNodeRef } from "./id.ts";
import type { EdgeKindDef, EndpointRoleDef, NodeKindDef } from "./ods.ts";
import type { NodeKind, NodeKindFromDef } from "./node.ts";

export type AnyEdgeKindDef = EdgeKindDef<
  string,
  readonly EndpointRoleDef[],
  readonly TraitDef[],
  readonly EndpointRoleDef[] | Readonly<Record<string, EndpointRoleDef>>,
  Record<string, unknown>
>;

/** Edge cardinality. */
export type EdgeCardinality = "one" | "optional" | "many";

/** Endpoint role - typed role identifier. */
export interface EndpointRole {
  readonly id: string;
  readonly label: string;
}

/** An endpoint in an edge. */
export interface KernelEdgeEndpoint {
  readonly role: EndpointRole;
  readonly target: KernelObjectRef;
  readonly cardinality?: EdgeCardinality;
}

/** Edge kind - simple typed identifier. */
export interface EdgeKind {
  readonly id: string;
  readonly label: string;
}

/** Provenance - how an edge was derived. */
export type KernelProvenance =
  | { kind: "explicit"; source?: string }
  | { kind: "inferred"; pass: string; confidence: "exact" | "conservative" }
  | { kind: "lowered"; from: KernelId; pass: string };

/** Kernel edge - a semantic connection between objects. */
export interface KernelEdge<
  Kind extends EdgeKind = EdgeKind,
  Endpoints extends readonly KernelEdgeEndpoint[] = readonly KernelEdgeEndpoint[],
  Metadata extends KernelMetadata = KernelMetadata,
> {
  readonly kind: Kind;
  readonly id: KernelId<"edge">;
  readonly endpoints: Endpoints;
  readonly payloadType?: KernelObjectRef;
  readonly constraints?: readonly KernelObjectRef[];
  readonly traits: readonly TraitDef[];
  readonly metadata?: Metadata;
  readonly provenance?: KernelProvenance;
}

/** Create a kernel edge. */
export const defineEdge = <Kind extends EdgeKind>(
  kind: Kind,
  id: string,
  endpoints: readonly KernelEdgeEndpoint[],
  input?: {
    readonly payloadType?: KernelObjectRef;
    readonly constraints?: readonly KernelObjectRef[];
    readonly traits?: readonly TraitDef[];
    readonly metadata?: KernelMetadata;
    readonly provenance?: KernelProvenance;
  },
): KernelEdge<Kind> => ({
  kind,
  id: id as KernelId<"edge">,
  endpoints,
  payloadType: input?.payloadType,
  constraints: input?.constraints,
  traits: input?.traits ?? [],
  metadata: input?.metadata,
  provenance: input?.provenance,
});

type EndpointRoleName<Endpoint> = Endpoint extends EndpointRoleDef<infer Name> ? Name : never;
type EndpointShapeOf<Kind> =
  Kind extends EdgeKindDef<
    string,
    readonly EndpointRoleDef[],
    readonly TraitDef[],
    infer Shape,
    object
  >
    ? Shape
    : Kind extends EdgeKindDef<string, infer Endpoints>
      ? Endpoints
      : never;

export type EdgeCustomOf<Kind extends AnyEdgeKindDef> =
  Kind extends EdgeKindDef<
    string,
    readonly EndpointRoleDef[],
    readonly TraitDef[],
    readonly EndpointRoleDef[] | Readonly<Record<string, EndpointRoleDef>>,
    infer Custom
  >
    ? Custom
    : Record<string, unknown>;

export type EdgeMetadataFor<Kind extends AnyEdgeKindDef> = KernelMetadata<EdgeCustomOf<Kind>>;

type EdgeIdPart = string | number | boolean | { readonly id: string } | { readonly name: string };

/** Extract allowed node kind for an endpoint role from its targetKinds. */
export type AllowedNodeKindForRole<Role extends EndpointRoleDef> = Role["target"] extends {
  targetKinds: infer Kinds;
}
  ? Kinds extends readonly NodeKindDef[]
    ? Kinds extends readonly []
      ? NodeKind
      : NodeKindFromDef<Kinds[number]>
    : NodeKind
  : NodeKind;

/** Whether an endpoint role has a non-empty targetKinds constraint. */
export type IsConstrainedRole<Role extends EndpointRoleDef> = Role["target"] extends {
  targetKinds: infer Kinds;
}
  ? Kinds extends readonly NodeKindDef[]
    ? Kinds extends readonly []
      ? false
      : true
    : false
  : false;

/** Typed endpoint input for a specific role — accepts KernelNodeRef matching targetKinds. */
export type EndpointInputForRole<Role extends EndpointRoleDef> =
  IsConstrainedRole<Role> extends true
    ?
        | KernelNodeRef<AllowedNodeKindForRole<Role>>
        | {
            readonly target: KernelNodeRef<AllowedNodeKindForRole<Role>>;
            readonly cardinality?: EdgeCardinality;
          }
    :
        | KernelNodeRef
        | KernelObjectRef
        | {
            readonly target: KernelNodeRef | KernelObjectRef;
            readonly cardinality?: EdgeCardinality;
          };

export type EndpointInputsFor<Kind extends AnyEdgeKindDef> =
  EndpointShapeOf<Kind> extends Readonly<Record<string, EndpointRoleDef>>
    ? {
        readonly [Key in keyof EndpointShapeOf<Kind> & string]: EndpointInputForRole<
          EndpointShapeOf<Kind>[Key]
        >;
      }
    : {
        readonly [Endpoint in Kind["endpoints"][number] as EndpointRoleName<Endpoint>]: EndpointInputForRole<Endpoint>;
      };

export type EndpointOutputFor<Role extends EndpointRoleDef> = KernelEdgeEndpoint & {
  readonly role: EndpointRole & { readonly id: Role["id"]; readonly label: Role["name"] };
};

export type EndpointOutputsFor<Kind extends AnyEdgeKindDef> =
  EndpointShapeOf<Kind> extends Readonly<Record<string, EndpointRoleDef>>
    ? {
        readonly [Key in keyof EndpointShapeOf<Kind> & string]: EndpointOutputFor<
          EndpointShapeOf<Kind>[Key]
        >;
      }
    : {
        readonly [Endpoint in Kind["endpoints"][number] as EndpointRoleName<Endpoint>]: EndpointOutputFor<Endpoint>;
      };

export type EndpointTupleFor<Kind extends AnyEdgeKindDef> = readonly KernelEdgeEndpoint[] & {
  readonly [Index in keyof Kind["endpoints"]]: Kind["endpoints"][Index] extends EndpointRoleDef
    ? EndpointOutputFor<Kind["endpoints"][Index]>
    : never;
};

export type EdgeFromKind<
  Kind extends AnyEdgeKindDef,
  Metadata extends EdgeMetadataFor<Kind> = EdgeMetadataFor<Kind>,
> = KernelEdge<EdgeKindFromDef<Kind>, EndpointTupleFor<Kind>, Metadata>;

export type EdgeKindFromDef<Kind extends AnyEdgeKindDef> = {
  readonly id: Kind["id"];
  readonly label: string;
};

const edgeKindFromDef = <const Kind extends AnyEdgeKindDef>(def: Kind): EdgeKindFromDef<Kind> => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

const endpointRoleFromDef = (def: EndpointRoleDef): EndpointRole => ({
  id: def.id,
  label: def.name,
});

type AnyEndpointInput =
  | KernelObjectRef
  | KernelNodeRef
  | {
      readonly target: KernelObjectRef | KernelNodeRef;
      readonly cardinality?: EdgeCardinality;
    };

const endpointInputTarget = (input: AnyEndpointInput): KernelObjectRef =>
  "target" in input ? (input.target as KernelObjectRef) : (input as KernelObjectRef);

const endpointInputCardinality = (input: AnyEndpointInput): EdgeCardinality | undefined =>
  "target" in input ? input.cardinality : undefined;

/** Create a kernel edge from a typed ODS edge-kind witness. */
export const defineEdgeFromKind = <
  const Kind extends AnyEdgeKindDef,
  const Metadata extends EdgeMetadataFor<Kind> = EdgeMetadataFor<Kind>,
>(
  kind: Kind,
  id: string,
  endpoints: EndpointInputsFor<Kind>,
  input?: {
    readonly payloadType?: KernelObjectRef;
    readonly constraints?: readonly KernelObjectRef[];
    readonly traits?: readonly TraitDef[];
    readonly metadata?: Metadata;
    readonly provenance?: KernelProvenance;
  },
): EdgeFromKind<Kind, Metadata> => {
  const entries = kind.endpoints.map((role) => {
    const endpointInput = endpoints[role.name as keyof EndpointInputsFor<Kind>] as AnyEndpointInput;
    return {
      role: endpointRoleFromDef(role),
      target: endpointInputTarget(endpointInput),
      cardinality: endpointInputCardinality(endpointInput),
    };
  });
  return defineEdge(edgeKindFromDef(kind), id, entries, input) as unknown as EdgeFromKind<
    Kind,
    Metadata
  >;
};

type EdgeBuilderInput<
  Kind extends AnyEdgeKindDef,
  Metadata extends EdgeMetadataFor<Kind> = EdgeMetadataFor<Kind>,
> = {
  readonly payloadType?: KernelObjectRef;
  readonly constraints?: readonly KernelObjectRef[];
  readonly traits?: readonly TraitDef[];
  readonly metadata?: Metadata;
  readonly provenance?: KernelProvenance;
};

type EdgeBuilderDone<
  Kind extends AnyEdgeKindDef,
  Id extends KernelId<"edge">,
  Metadata extends EdgeMetadataFor<Kind>,
> = EdgeFromKind<Kind, Metadata> & {
  readonly id: Id;
};

type EdgeBuilderWithId<
  Kind extends AnyEdgeKindDef,
  Endpoints extends EndpointInputsFor<Kind>,
  Id extends KernelId<"edge">,
  Metadata extends EdgeMetadataFor<Kind> = EdgeMetadataFor<Kind>,
> = {
  readonly metadata: <const NextMetadata extends EdgeMetadataFor<Kind>>(
    metadata: NextMetadata,
  ) => EdgeBuilderWithId<Kind, Endpoints, Id, NextMetadata>;
  readonly input: <const NextMetadata extends EdgeMetadataFor<Kind>>(
    input: EdgeBuilderInput<Kind, NextMetadata>,
  ) => EdgeBuilderWithId<Kind, Endpoints, Id, NextMetadata>;
  readonly done: () => EdgeBuilderDone<Kind, Id, Metadata>;
};

type EdgeBuilderWithEndpoints<
  Kind extends AnyEdgeKindDef,
  Endpoints extends EndpointInputsFor<Kind>,
> = {
  readonly id: <const Id extends NamespacedKernelId<"edge", string, NoInfer<Kind>, string>>(
    id: Id,
  ) => EdgeBuilderWithId<Kind, Endpoints, Id>;
  readonly autoId: <const Namespace extends string, const Parts extends readonly EdgeIdPart[]>(
    factory: NamespaceIdFactory<Namespace>,
    ...parts: Parts
  ) => EdgeBuilderWithId<
    Kind,
    Endpoints,
    NamespacedKernelId<"edge", Namespace, Kind, `edge:${Namespace}:${Kind["id"]}:${string}`>
  >;
  readonly parseId: <const Namespace extends string, const Raw extends string>(
    factory: NamespaceIdFactory<Namespace>,
    raw: Raw,
  ) => EdgeBuilderWithId<Kind, Endpoints, NamespacedKernelId<"edge", Namespace, Kind, Raw>>;
  readonly unsafeId: <const Raw extends string>(
    raw: Raw,
  ) => EdgeBuilderWithId<Kind, Endpoints, KernelId<"edge"> & Raw>;
};

/**
 * Helpers exposed to the optional `.from(e => ...)` callback form. Each
 * helper is a pass-through that improves autocomplete and signals intent
 * without changing the typed endpoint shape returned to the builder.
 *
 * - `e.node(ref)` — pass through a kernel node ref. Useful for naming
 *   clarity inside a complex endpoint map; the ref is returned unchanged.
 * - `e.with(ref, cardinality)` — attach an explicit cardinality to an
 *   endpoint without dropping the typed ref. Equivalent to
 *   `{ target: ref, cardinality }` but keeps the call site at the same
 *   level of detail as the bare `e.node(...)` form.
 */
export interface EdgeFromHelpers {
  readonly node: <T extends KernelNodeRef | KernelObjectRef>(ref: T) => T;
  readonly with: <T extends KernelNodeRef | KernelObjectRef>(
    ref: T,
    cardinality: EdgeCardinality,
  ) => { readonly target: T; readonly cardinality: EdgeCardinality };
}

const edgeFromHelpers: EdgeFromHelpers = {
  node: (ref) => ref,
  with: (ref, cardinality) => ({ target: ref, cardinality }),
};

export type EdgeBuilder<Kind extends AnyEdgeKindDef> = {
  /**
   * Bind endpoint inputs. Accepts either an object map keyed by endpoint
   * role name, or a callback `(e) => endpoints` whose `e` argument
   * exposes `e.node(ref)` / `e.with(ref, card)` helpers for autocomplete
   * clarity in complex edges.
   */
  readonly from: <const Endpoints extends EndpointInputsFor<Kind>>(
    endpoints: Endpoints | ((helpers: EdgeFromHelpers) => Endpoints),
  ) => EdgeBuilderWithEndpoints<Kind, Endpoints>;
};

const edgeBuilderWithId = <
  const Kind extends AnyEdgeKindDef,
  const Endpoints extends EndpointInputsFor<Kind>,
  const Id extends KernelId<"edge">,
  const Metadata extends EdgeMetadataFor<Kind> = EdgeMetadataFor<Kind>,
>(
  kind: Kind,
  endpoints: Endpoints,
  id: Id,
  input: EdgeBuilderInput<Kind, Metadata> = {},
): EdgeBuilderWithId<Kind, Endpoints, Id, Metadata> => ({
  metadata: (metadata) =>
    edgeBuilderWithId<Kind, Endpoints, Id, typeof metadata>(kind, endpoints, id, {
      ...input,
      metadata,
    }),
  input: (nextInput) =>
    edgeBuilderWithId<
      Kind,
      Endpoints,
      Id,
      typeof nextInput extends EdgeBuilderInput<Kind, infer M> ? M : EdgeMetadataFor<Kind>
    >(kind, endpoints, id, nextInput),
  done: () => defineEdgeFromKind(kind, id, endpoints, input) as EdgeBuilderDone<Kind, Id, Metadata>,
});

/** Curried public edge builder. Binds the edge-kind witness before IDs and endpoints. */
export const edge = <const Kind extends AnyEdgeKindDef>(kind: Kind): EdgeBuilder<Kind> => ({
  from: (endpoints) => {
    const resolved = (
      typeof endpoints === "function" ? endpoints(edgeFromHelpers) : endpoints
    ) as EndpointInputsFor<Kind>;
    return {
      id: (id) => edgeBuilderWithId(kind, resolved, id),
      autoId: (factory, ...parts) =>
        edgeBuilderWithId(kind, resolved, factory.edge(kind, ...parts)),
      parseId: (factory, raw) => edgeBuilderWithId(kind, resolved, factory.parse.edge(kind, raw)),
      unsafeId: (raw) => edgeBuilderWithId(kind, resolved, raw as KernelId<"edge"> & typeof raw),
    };
  },
});

/** Read an edge's endpoints through the edge-kind witness instead of tuple positions. */
export const readEdgeEndpoints = <const Kind extends AnyEdgeKindDef>(
  kind: Kind,
  edge: KernelEdge<EdgeKindFromDef<Kind>, readonly KernelEdgeEndpoint[], EdgeMetadataFor<Kind>>,
): EndpointOutputsFor<Kind> => {
  const byName: Record<string, KernelEdgeEndpoint> = {};
  for (const role of kind.endpoints) {
    const endpoint = edge.endpoints.find((ep) => ep.role.id === role.id);
    if (endpoint) byName[role.name] = endpoint;
  }
  return byName as EndpointOutputsFor<Kind>;
};

/** Dynamically refine and read endpoints for an edge that may not match the witness. */
export const tryReadEdgeEndpoints = <const Kind extends AnyEdgeKindDef>(
  kind: Kind,
  edge: KernelEdge,
): EndpointOutputsFor<Kind> | undefined =>
  edge.kind.id === kind.id
    ? readEdgeEndpoints(
        kind,
        edge as KernelEdge<
          EdgeKindFromDef<Kind>,
          readonly KernelEdgeEndpoint[],
          EdgeMetadataFor<Kind>
        >,
      )
    : undefined;
