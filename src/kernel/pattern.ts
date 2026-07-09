/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel graph patterns.
 *
 * Minimal typed matcher over graph nodes, edges, and expression refs. It is
 * intentionally small: enough to prove pass source-shapes can be declared as
 * data before GraphMorphism lands.
 */

import type { KernelExpr } from "./expr.ts";
import type { AnyEdgeKindDef, EdgeFromKind, KernelEdge, KernelEdgeEndpoint } from "./edge.ts";
import { readEdgeEndpoints } from "./edge.ts";
import type { KernelGraph } from "./graph.ts";
import { edgesOfKindAtEndpoint, edgesOfKindDef, nodesOfKindDef } from "./graph.ts";
import type { KernelObjectRef } from "./id.ts";
import type { KernelNode, NodeKindFromDef, NodeMetadataFor } from "./node.ts";
import type { NodeKindDef } from "./ods.ts";

type BindingName = string;

export type GraphNodePattern = NodeKindDef;
export type GraphExprPattern = true;

export interface GraphEdgePattern<Kind extends AnyEdgeKindDef = AnyEdgeKindDef> {
  readonly kind: Kind;
  readonly endpoints: Readonly<Record<string, BindingName>>;
}

export interface GraphPatternDef<
  Nodes extends Readonly<Record<string, GraphNodePattern>> = Readonly<
    Record<string, GraphNodePattern>
  >,
  Edges extends Readonly<Record<string, GraphEdgePattern>> = Readonly<
    Record<string, GraphEdgePattern>
  >,
  Exprs extends Readonly<Record<string, GraphExprPattern>> = Readonly<
    Record<string, GraphExprPattern>
  >,
> {
  readonly nodes?: Nodes;
  readonly edges?: Edges;
  readonly exprs?: Exprs;
  readonly sameNode?: readonly (readonly [keyof Nodes & string, keyof Nodes & string])[];
}

type NodeBinding<Kind extends NodeKindDef> = KernelNode<
  NodeKindFromDef<Kind>,
  unknown,
  unknown,
  NodeMetadataFor<Kind>
>;

type NodeBindings<Nodes extends Readonly<Record<string, GraphNodePattern>>> = {
  readonly [Name in keyof Nodes]: NodeBinding<Nodes[Name]>;
};

type EdgeBindings<Edges extends Readonly<Record<string, GraphEdgePattern>>> = {
  readonly [Name in keyof Edges]: Edges[Name] extends GraphEdgePattern<infer Kind>
    ? EdgeFromKind<Kind>
    : KernelEdge;
};

type ExprBindings<Exprs extends Readonly<Record<string, GraphExprPattern>>> = {
  readonly [Name in keyof Exprs]: KernelExpr;
};

export type GraphPatternBindings<Pattern extends GraphPatternDef> =
  Pattern extends GraphPatternDef<infer Nodes, infer Edges, infer Exprs>
    ? NodeBindings<Nodes> &
        EdgeBindings<Edges> &
        ExprBindings<Exprs> &
        Readonly<Record<string, KernelObjectRef | KernelNode | KernelEdge | KernelExpr>>
    : Readonly<Record<string, KernelObjectRef | KernelNode | KernelEdge | KernelExpr>>;

export interface GraphMatch<Pattern extends GraphPatternDef = GraphPatternDef> {
  readonly pattern: GraphPattern<Pattern>;
  readonly bindings: GraphPatternBindings<Pattern>;
}

export interface GraphPattern<Pattern extends GraphPatternDef = GraphPatternDef> {
  readonly kind: "graph.pattern";
  readonly def: Pattern;
  readonly materialize: (graph: KernelGraph) => readonly GraphMatch<Pattern>[];
  readonly first: (graph: KernelGraph) => GraphMatch<Pattern> | undefined;
  readonly count: (graph: KernelGraph) => number;
  readonly stream: (graph: KernelGraph) => IterableIterator<GraphMatch<Pattern>>;
}

type MutableBindingMap = Record<string, KernelObjectRef | KernelNode | KernelEdge | KernelExpr>;

const bindingId = (
  value: KernelObjectRef | KernelNode | KernelEdge | KernelExpr,
): string | undefined => {
  if ("id" in value && typeof value.id === "string" && value.id.length > 0) return value.id;
  if ("name" in value && typeof value.name === "string" && value.name.length > 0) return value.name;
  return undefined;
};

const targetId = (target: KernelObjectRef): string | undefined => {
  if (typeof target.id === "string" && target.id.length > 0) return target.id;
  if (typeof target.name === "string" && target.name.length > 0) return target.name;
  return undefined;
};

const targetMatchesNode = (target: KernelObjectRef, node: KernelNode): boolean => {
  if (target.id && target.id === node.id) return true;
  return typeof target.name === "string" && target.name === node.name;
};

const isKernelNode = (
  value: KernelObjectRef | KernelNode | KernelEdge | KernelExpr,
): value is KernelNode => "traits" in value && "kind" in value && typeof value.kind === "object";

const nodeMatchesKind = (node: KernelNode, kind: NodeKindDef): boolean => node.kind.id === kind.id;

const resolveNodeTarget = (
  graph: KernelGraph,
  kind: NodeKindDef,
  target: KernelObjectRef,
): KernelNode | undefined => {
  if (target.id) {
    const node = graph.nodes.get(target.id);
    if (node && nodeMatchesKind(node, kind)) return node;
  }
  if (target.name) {
    return nodesOfKindDef(graph, kind).find((node) => node.name === target.name);
  }
  return undefined;
};

const resolveExprTarget = (graph: KernelGraph, target: KernelObjectRef): KernelExpr | undefined =>
  target.kind === "expr" && target.id ? graph.exprs.get(target.id) : undefined;

const cloneWith = (
  bindings: MutableBindingMap,
  key: string,
  value: KernelObjectRef | KernelNode | KernelEdge | KernelExpr,
): MutableBindingMap | undefined => {
  const existing = bindings[key];
  if (existing) {
    return bindingId(existing) === bindingId(value) ? bindings : undefined;
  }
  return { ...bindings, [key]: value };
};

const candidateEdges = (
  graph: KernelGraph,
  edgePattern: GraphEdgePattern,
  bindings: MutableBindingMap,
): readonly KernelEdge[] => {
  for (const [roleName, bindingName] of Object.entries(edgePattern.endpoints)) {
    const bound = bindings[bindingName];
    if (!bound) continue;
    const role = edgePattern.kind.endpoints.find((endpoint) => endpoint.name === roleName);
    if (!role) continue;
    const refIds = [
      bindingId(bound),
      "name" in bound && typeof bound.name === "string" ? bound.name : undefined,
    ].filter((id): id is string => typeof id === "string" && id.length > 0);
    if (refIds.length === 0) continue;
    const matches = new Map<string, KernelEdge>();
    for (const refId of refIds) {
      for (const edge of edgesOfKindAtEndpoint(
        graph,
        { id: edgePattern.kind.id, label: edgePattern.kind.id },
        role.id,
        refId,
      )) {
        matches.set(edge.id, edge);
      }
    }
    if (matches.size > 0) return [...matches.values()];
  }
  return edgesOfKindDef(graph, edgePattern.kind);
};

const bindEndpoint = (
  graph: KernelGraph,
  def: GraphPatternDef,
  bindings: MutableBindingMap,
  bindingName: string,
  endpoint: KernelEdgeEndpoint | undefined,
): readonly MutableBindingMap[] => {
  if (!endpoint) return [];
  const existing = bindings[bindingName];
  if (existing) {
    if (isKernelNode(existing)) {
      return targetMatchesNode(endpoint.target, existing) ? [bindings] : [];
    }
    if ("kind" in existing && existing.kind === "node") {
      const node = isKernelNode(existing)
        ? existing
        : existing.id
          ? graph.nodes.get(existing.id)
          : undefined;
      if (node) return targetMatchesNode(endpoint.target, node) ? [bindings] : [];
    }
    return bindingId(existing) === targetId(endpoint.target) ? [bindings] : [];
  }

  const nodeKind = def.nodes?.[bindingName];
  if (nodeKind) {
    const node = resolveNodeTarget(graph, nodeKind, endpoint.target);
    return node ? [{ ...bindings, [bindingName]: node }] : [];
  }

  if (def.exprs?.[bindingName]) {
    const expr = resolveExprTarget(graph, endpoint.target);
    return expr ? [{ ...bindings, [bindingName]: expr }] : [];
  }

  return [{ ...bindings, [bindingName]: endpoint.target }];
};

const applyNodeClause = (
  graph: KernelGraph,
  bindings: readonly MutableBindingMap[],
  name: string,
  kind: NodeKindDef,
): readonly MutableBindingMap[] => {
  const out: MutableBindingMap[] = [];
  for (const binding of bindings) {
    const existing = binding[name];
    if (existing) {
      if (isKernelNode(existing)) {
        if (nodeMatchesKind(existing, kind)) out.push({ ...binding, [name]: existing });
      } else if ("kind" in existing && existing.kind === "node") {
        const node = isKernelNode(existing)
          ? existing
          : existing.id
            ? graph.nodes.get(existing.id)
            : undefined;
        if (node && nodeMatchesKind(node, kind)) out.push({ ...binding, [name]: node });
      }
      continue;
    }
    for (const node of nodesOfKindDef(graph, kind)) {
      out.push({ ...binding, [name]: node });
    }
  }
  return out;
};

const applyEdgeClause = (
  graph: KernelGraph,
  def: GraphPatternDef,
  bindings: readonly MutableBindingMap[],
  name: string,
  edgePattern: GraphEdgePattern,
): readonly MutableBindingMap[] => {
  const out: MutableBindingMap[] = [];
  for (const binding of bindings) {
    for (const edge of candidateEdges(graph, edgePattern, binding)) {
      const withEdge = cloneWith(binding, name, edge);
      if (!withEdge) continue;
      const endpoints = readEdgeEndpoints(edgePattern.kind, edge);
      let partials: readonly MutableBindingMap[] = [withEdge];
      for (const [roleName, bindingName] of Object.entries(edgePattern.endpoints)) {
        partials = partials.flatMap((partial) =>
          bindEndpoint(
            graph,
            def,
            partial,
            bindingName,
            endpoints[roleName as keyof typeof endpoints],
          ),
        );
        if (partials.length === 0) break;
      }
      out.push(...partials);
    }
  }
  return out;
};

const sameNodeId = (bindings: MutableBindingMap, name: string): string | undefined => {
  const value = bindings[name];
  return value && "kind" in value && value.kind === "node" ? bindingId(value) : undefined;
};

const passesSameNodeConstraints = (def: GraphPatternDef, bindings: MutableBindingMap): boolean =>
  (def.sameNode ?? []).every(([left, right]) => {
    const leftId = sameNodeId(bindings, left);
    const rightId = sameNodeId(bindings, right);
    return leftId !== undefined && leftId === rightId;
  });

const materializePattern = <const Pattern extends GraphPatternDef>(
  pattern: GraphPattern<Pattern>,
  graph: KernelGraph,
): readonly GraphMatch<Pattern>[] => {
  let bindings: readonly MutableBindingMap[] = [{}];
  for (const [name, kind] of Object.entries(pattern.def.nodes ?? {})) {
    bindings = applyNodeClause(graph, bindings, name, kind);
  }
  for (const [name, edgePattern] of Object.entries(pattern.def.edges ?? {})) {
    bindings = applyEdgeClause(graph, pattern.def, bindings, name, edgePattern);
  }
  return bindings
    .filter((binding) => passesSameNodeConstraints(pattern.def, binding))
    .map((binding) => ({ pattern, bindings: binding as GraphPatternBindings<Pattern> }));
};

/** Define a typed graph pattern with named node, edge, and expression bindings. */
export const defineGraphPattern = <const Pattern extends GraphPatternDef>(
  def: Pattern,
): GraphPattern<Pattern> => {
  const pattern = {
    kind: "graph.pattern",
    def,
    materialize(graph: KernelGraph) {
      return materializePattern(pattern, graph);
    },
    first(graph: KernelGraph) {
      return pattern.materialize(graph)[0];
    },
    count(graph: KernelGraph) {
      return pattern.materialize(graph).length;
    },
    *stream(graph: KernelGraph) {
      yield* pattern.materialize(graph);
    },
  } as GraphPattern<Pattern>;
  return pattern;
};
