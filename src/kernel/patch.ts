/* @__NO_SIDE_EFFECTS__ */
/**
 * Graph patches - typed, inspectable graph updates.
 *
 * A patch is the durable unit of graph change used by derivations,
 * diagnostic repairs, importers, migrations, and AI edits. Patches are
 * verified before application and applied immutably.
 */

import type { Diagnostic } from "./diagnostic.ts";
import { defineDiagnostic } from "./diagnostic.ts";
import {
  defineEdgeFromKind,
  type AnyEdgeKindDef,
  type EdgeFromKind,
  type EdgeMetadataFor,
  type EndpointInputsFor,
  type KernelEdge,
  type KernelEdgeEndpoint,
} from "./edge.ts";
import type { KernelExpr } from "./expr.ts";
import type { KernelGraph } from "./graph.ts";
import { registerEdge, registerExpr, registerNode } from "./graph.ts";
import type { KernelId, NamespacedKernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import {
  defineNodeFromKind,
  type KernelNode,
  type NodeKindFromDef,
  type NodeMetadataFor,
} from "./node.ts";
import type { NodeKindDef } from "./ods.ts";
import type { KernelObjectRef } from "./id.ts";
import type { KernelProvenance } from "./edge.ts";
import type { KernelType } from "./type.ts";
import type { TraitDef } from "./trait.ts";

export type GraphPatchSource =
  | "derivation"
  | "diagnostic"
  | "importer"
  | "migration"
  | "manual"
  | "ai";

export interface GraphPatchProvenance {
  readonly source: GraphPatchSource;
  readonly name?: string;
  readonly inputFacts?: readonly string[];
  readonly confidence?: "exact" | "conservative";
  readonly explanation?: string;
}

interface BaseGraphPatch {
  readonly id?: string;
  readonly provenance?: GraphPatchProvenance;
}

export interface AddNodePatch<Node extends KernelNode = KernelNode> extends BaseGraphPatch {
  readonly op: "addNode";
  readonly node: Node;
}

export interface AddEdgePatch<Edge extends KernelEdge = KernelEdge> extends BaseGraphPatch {
  readonly op: "addEdge";
  readonly edge: Edge;
}

export interface AddExprPatch extends BaseGraphPatch {
  readonly op: "addExpr";
  readonly expr: KernelExpr;
}

export interface AnnotateGraphPatch extends BaseGraphPatch {
  readonly op: "annotate";
  readonly target: KernelId;
  readonly metadata: KernelMetadata;
}

export type GraphPatch = AddNodePatch | AddEdgePatch | AddExprPatch | AnnotateGraphPatch;

type AddNodeFromKindInput<
  Kind extends NodeKindDef,
  In,
  Out,
  Metadata extends NodeMetadataFor<Kind>,
> = {
  readonly name?: string;
  readonly input?: KernelType<In>;
  readonly output?: KernelType<Out>;
  readonly body?: KernelExpr | KernelObjectRef;
  readonly traits?: readonly TraitDef[];
  readonly metadata?: Metadata;
  readonly provenance?: GraphPatchProvenance;
};

type AddEdgeFromKindInput<Kind extends AnyEdgeKindDef, Metadata extends EdgeMetadataFor<Kind>> = {
  readonly payloadType?: KernelObjectRef;
  readonly constraints?: readonly KernelObjectRef[];
  readonly traits?: readonly TraitDef[];
  readonly metadata?: Metadata;
  readonly provenance?: KernelProvenance;
  readonly patchProvenance?: GraphPatchProvenance;
};

type NodeFromKindWithId<
  Kind extends NodeKindDef,
  Id extends KernelId<"node">,
  In,
  Out,
  Metadata extends NodeMetadataFor<Kind>,
> = KernelNode<NodeKindFromDef<Kind>, In, Out, Metadata> & {
  readonly id: Id;
};

type EdgeFromKindWithId<
  Kind extends AnyEdgeKindDef,
  Id extends KernelId<"edge">,
  Metadata extends EdgeMetadataFor<Kind>,
> = EdgeFromKind<Kind, Metadata> & {
  readonly id: Id;
};

function addNodePatch<const Node extends KernelNode>(
  node: Node,
  provenance?: GraphPatchProvenance,
): AddNodePatch<Node>;
function addNodePatch<
  const Kind extends NodeKindDef,
  const Id extends NamespacedKernelId<"node", string, NoInfer<Kind>, string>,
  In,
  Out,
  const Metadata extends NodeMetadataFor<Kind> = NodeMetadataFor<Kind>,
>(
  kind: Kind,
  id: Id,
  input?: AddNodeFromKindInput<Kind, In, Out, Metadata>,
): AddNodePatch<NodeFromKindWithId<Kind, Id, In, Out, Metadata>>;
function addNodePatch(
  nodeOrKind: KernelNode | NodeKindDef,
  idOrProvenance?: string | GraphPatchProvenance,
  input?: AddNodeFromKindInput<NodeKindDef, unknown, unknown, NodeMetadataFor<NodeKindDef>>,
): AddNodePatch {
  if (typeof idOrProvenance === "string") {
    return addNodePatch(
      defineNodeFromKind(nodeOrKind as NodeKindDef, idOrProvenance, input),
      input?.provenance,
    );
  }
  const node = nodeOrKind as KernelNode;
  return {
    op: "addNode",
    node,
    provenance: idOrProvenance,
  };
}

function addNodeFromKindPatch<
  const Kind extends NodeKindDef,
  const Id extends NamespacedKernelId<"node", string, NoInfer<Kind>, string>,
  In,
  Out,
  const Metadata extends NodeMetadataFor<Kind> = NodeMetadataFor<Kind>,
>(
  kind: Kind,
  id: Id,
  input?: AddNodeFromKindInput<Kind, In, Out, Metadata>,
): AddNodePatch<NodeFromKindWithId<Kind, Id, In, Out, Metadata>> {
  return addNodePatch(kind, id, input) as AddNodePatch<
    NodeFromKindWithId<Kind, Id, In, Out, Metadata>
  >;
}

function addEdgePatch<const Edge extends KernelEdge>(
  edge: Edge,
  provenance?: GraphPatchProvenance,
): AddEdgePatch<Edge>;
function addEdgePatch<
  const Kind extends AnyEdgeKindDef,
  const Id extends NamespacedKernelId<"edge", string, NoInfer<Kind>, string>,
  const Metadata extends EdgeMetadataFor<Kind> = EdgeMetadataFor<Kind>,
>(
  kind: Kind,
  id: Id,
  endpoints: EndpointInputsFor<Kind>,
  input?: AddEdgeFromKindInput<Kind, Metadata>,
): AddEdgePatch<EdgeFromKindWithId<Kind, Id, Metadata>>;
function addEdgePatch(
  edgeOrKind: KernelEdge | AnyEdgeKindDef,
  idOrProvenance?: string | GraphPatchProvenance,
  endpoints?: EndpointInputsFor<AnyEdgeKindDef>,
  input?: AddEdgeFromKindInput<AnyEdgeKindDef, EdgeMetadataFor<AnyEdgeKindDef>>,
): AddEdgePatch {
  if (typeof idOrProvenance === "string") {
    return addEdgePatch(
      defineEdgeFromKind(edgeOrKind as AnyEdgeKindDef, idOrProvenance, endpoints ?? {}, input),
      input?.patchProvenance,
    );
  }
  const edge = edgeOrKind as KernelEdge;
  return {
    op: "addEdge",
    edge,
    provenance: idOrProvenance,
  };
}

function addEdgeFromKindPatch<
  const Kind extends AnyEdgeKindDef,
  const Id extends NamespacedKernelId<"edge", string, NoInfer<Kind>, string>,
  const Metadata extends EdgeMetadataFor<Kind> = EdgeMetadataFor<Kind>,
>(
  kind: Kind,
  id: Id,
  endpoints: EndpointInputsFor<Kind>,
  input?: AddEdgeFromKindInput<Kind, Metadata>,
): AddEdgePatch<EdgeFromKindWithId<Kind, Id, Metadata>> {
  return addEdgePatch(kind, id, endpoints, input) as AddEdgePatch<
    EdgeFromKindWithId<Kind, Id, Metadata>
  >;
}

function addNodePatchUnsafe<
  const Kind extends NodeKindDef,
  const Raw extends string,
  In,
  Out,
  const Metadata extends NodeMetadataFor<Kind> = NodeMetadataFor<Kind>,
>(
  kind: Kind,
  raw: Raw,
  input?: AddNodeFromKindInput<Kind, In, Out, Metadata>,
): AddNodePatch<NodeFromKindWithId<Kind, KernelId<"node"> & Raw, In, Out, Metadata>> {
  return addNodePatch(
    defineNodeFromKind(kind, raw, input) as NodeFromKindWithId<
      Kind,
      KernelId<"node"> & Raw,
      In,
      Out,
      Metadata
    >,
    input?.provenance,
  );
}

function addEdgePatchUnsafe<
  const Kind extends AnyEdgeKindDef,
  const Raw extends string,
  const Metadata extends EdgeMetadataFor<Kind> = EdgeMetadataFor<Kind>,
>(
  kind: Kind,
  raw: Raw,
  endpoints: EndpointInputsFor<Kind>,
  input?: AddEdgeFromKindInput<Kind, Metadata>,
): AddEdgePatch<EdgeFromKindWithId<Kind, KernelId<"edge"> & Raw, Metadata>> {
  return addEdgePatch(
    defineEdgeFromKind(kind, raw, endpoints, input) as EdgeFromKindWithId<
      Kind,
      KernelId<"edge"> & Raw,
      Metadata
    >,
    input?.patchProvenance,
  );
}

const addNode = Object.assign(addNodePatch, {
  unsafe: addNodePatchUnsafe,
});

const addEdge = Object.assign(addEdgePatch, {
  unsafe: addEdgePatchUnsafe,
});

export const graphPatch = {
  addNode,
  addNodeFromKind: addNodeFromKindPatch,
  addEdge,
  addEdgeFromKind: addEdgeFromKindPatch,

  addExpr: (expr: KernelExpr, provenance?: GraphPatchProvenance): AddExprPatch => ({
    op: "addExpr",
    expr,
    provenance,
  }),

  annotate: (
    target: KernelId,
    metadata: KernelMetadata,
    provenance?: GraphPatchProvenance,
  ): AnnotateGraphPatch => ({
    op: "annotate",
    target,
    metadata,
    provenance,
  }),
};

const endpointTargetNodeId = (endpoint: KernelEdgeEndpoint): string | undefined => {
  const target = endpoint.target;
  if (typeof target !== "object" || target === null) return undefined;
  if (!("kind" in target) || target.kind !== "node") return undefined;
  if ("id" in target && typeof target.id === "string" && target.id.length > 0) return target.id;
  return undefined;
};

export const verifyGraphPatch = (graph: KernelGraph, patch: GraphPatch): readonly Diagnostic[] => {
  switch (patch.op) {
    case "addNode":
      return graph.nodes.has(patch.node.id)
        ? [
            defineDiagnostic(
              "graph-patch:node-already-exists",
              "error",
              `Graph already contains node "${patch.node.id}"`,
              { subject: patch.node.id, subjectKind: "node" },
            ),
          ]
        : [];

    case "addEdge": {
      const diagnostics: Diagnostic[] = [];
      if (graph.edges.has(patch.edge.id)) {
        diagnostics.push(
          defineDiagnostic(
            "graph-patch:edge-already-exists",
            "error",
            `Graph already contains edge "${patch.edge.id}"`,
            { subject: patch.edge.id, subjectKind: "edge" },
          ),
        );
      }

      for (const endpoint of patch.edge.endpoints) {
        const targetId = endpointTargetNodeId(endpoint);
        if (targetId && !graph.nodes.has(targetId)) {
          diagnostics.push(
            defineDiagnostic(
              "graph-patch:edge-target-missing",
              "error",
              `Patch edge "${patch.edge.id}" targets missing node "${targetId}"`,
              { subject: patch.edge.id, subjectKind: "edge" },
            ),
          );
        }
      }

      return diagnostics;
    }

    case "addExpr":
      return graph.exprs.has(patch.expr.id)
        ? [
            defineDiagnostic(
              "graph-patch:expr-already-exists",
              "error",
              `Graph already contains expression "${patch.expr.id}"`,
              { subject: patch.expr.id, subjectKind: "expr" },
            ),
          ]
        : [];

    case "annotate":
      return graph.nodes.has(patch.target) ||
        graph.edges.has(patch.target) ||
        graph.exprs.has(patch.target) ||
        graph.types.has(patch.target)
        ? []
        : [
            defineDiagnostic(
              "graph-patch:annotate-target-missing",
              "error",
              `Patch annotation target "${patch.target}" does not exist`,
              { subject: patch.target, subjectKind: "graph-object" },
            ),
          ];
  }
};

export const applyGraphPatch = (graph: KernelGraph, patch: GraphPatch): KernelGraph => {
  switch (patch.op) {
    case "addNode":
      return registerNode(graph, patch.node);
    case "addEdge":
      return registerEdge(graph, patch.edge);
    case "addExpr":
      return registerExpr(graph, patch.expr);
    case "annotate":
      // Annotation application is intentionally deferred until the kernel
      // has a single typed metadata replacement primitive for all graph
      // object families.
      return graph;
  }
};

export const applyGraphPatches = (
  graph: KernelGraph,
  patches: readonly GraphPatch[],
): { readonly graph: KernelGraph; readonly diagnostics: readonly Diagnostic[] } => {
  let next = graph;
  const diagnostics: Diagnostic[] = [];

  for (const patch of patches) {
    const patchDiagnostics = verifyGraphPatch(next, patch);
    diagnostics.push(...patchDiagnostics);
    if (patchDiagnostics.some((d) => d.severity === "error")) continue;
    next = applyGraphPatch(next, patch);
  }

  return { graph: next, diagnostics };
};
