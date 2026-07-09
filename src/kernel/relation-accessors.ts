/* @__NO_SIDE_EFFECTS__ */
/**
 * Runtime relation accessors (PLAN §B0a).
 *
 * `related(graph, node, kind)` returns a typed accessors object whose method
 * names mirror `kind.relationSchema` and whose return types are bounded by
 * each relation's cardinality:
 *
 * ```ts
 * const inv = related(graph, invoiceNode, InvoiceNodeKind);
 * inv.customer();   // KernelNodeRef<Customer>            (1..1)
 * inv.lines();      // [KernelNodeRef<Line>, ...]         (1..N when min: 1)
 * inv.parent();     // KernelNodeRef<Invoice> | undefined (0..1)
 * inv.payments();   // readonly KernelNodeRef<Payment>[]  (0..N)
 * ```
 *
 * The accessor walks the graph index for the relation's `via` edge kind and
 * returns refs to the endpoint on the other side of the source node. When a
 * relation declares an explicit `endpoint` key, that key is the target
 * endpoint; otherwise the kernel picks the first endpoint whose target is
 * not the source node (suitable for binary edges).
 *
 * Cardinality bounds are checked at the type level; runtime diagnostics for
 * underflow (e.g. `hasMany({ min: 1 })` with 0 matches) are follow-up work.
 */
import type { KernelGraph } from "./graph.ts";
import { edgesOfKindDef, nodesOfKindDef } from "./graph.ts";
import type { KernelNode, NodeKindFromDef } from "./node.ts";
import { nodeRef } from "./node.ts";
import type { KernelNodeRef, KernelObjectRef } from "./id.ts";
import type { NodeKindDef, NodeKindDefWithRelations, RelationSchemaShape } from "./ods.ts";
import type { RelationCardinality, RelationWitness } from "./relations.ts";
import { type Diagnostic, defineDiagnostic } from "./diagnostic.ts";

/**
 * Compute the runtime return type for one relation, based on its cardinality.
 * Each branch returns a `KernelNodeRef`, a `KernelNodeRef | undefined`, or
 * an array (non-empty when `min >= 1`).
 */
export type RelationReturn<R extends RelationWitness> =
  R extends RelationWitness<
    NodeKindDef,
    infer Target,
    infer _Via,
    infer Card,
    infer _Endpoint,
    infer _Required
  >
    ? Card extends RelationCardinality<infer Min, infer Max>
      ? [Min, Max] extends [1, 1]
        ? KernelNodeRef<NodeKindFromDef<Target>>
        : [Min, Max] extends [0, 1]
          ? KernelNodeRef<NodeKindFromDef<Target>> | undefined
          : Min extends 0
            ? readonly KernelNodeRef<NodeKindFromDef<Target>>[]
            : readonly [
                KernelNodeRef<NodeKindFromDef<Target>>,
                ...KernelNodeRef<NodeKindFromDef<Target>>[],
              ]
      : never
    : never;

/** Typed accessor object for a node kind's relation schema. */
export type RelatedAccessors<Schema extends RelationSchemaShape> = {
  readonly [Name in keyof Schema]: () => Schema[Name] extends RelationWitness
    ? RelationReturn<Schema[Name]>
    : never;
};

/**
 * Match an edge-endpoint target to a kernel node by id or, as a fallback,
 * by name. The fallback matters for graphs built by legacy domain adapters
 * (entity/field/relation refs) whose ref `.id` is the domain id, not the
 * kernel node id. Mirrors the lenient matching used by `GraphPattern`.
 */
const targetMatchesNode = (target: KernelObjectRef, node: KernelNode): boolean => {
  const tid = typeof target.id === "string" ? target.id : undefined;
  const nid = typeof node.id === "string" ? node.id : String(node.id);
  if (tid && tid === nid) return true;
  const tn = typeof target.name === "string" ? target.name : undefined;
  const nn = typeof node.name === "string" ? node.name : undefined;
  return Boolean(tn && nn && tn === nn);
};

/**
 * Resolve an edge-endpoint target to an actual kernel node of `targetKind`.
 * Tries id first, then name (legacy ref fallback). Returns undefined when
 * the target points outside the graph or to a node of a different kind.
 */
const resolveTargetNode = (
  graph: KernelGraph,
  targetKind: NodeKindDef,
  target: KernelObjectRef,
): KernelNode | undefined => {
  const tid = typeof target.id === "string" && target.id.length > 0 ? target.id : undefined;
  if (tid) {
    const direct = graph.nodes.get(tid);
    if (direct && direct.kind.id === targetKind.id) return direct;
  }
  const tn = typeof target.name === "string" && target.name.length > 0 ? target.name : undefined;
  if (tn) {
    return nodesOfKindDef(graph, targetKind).find((n) => n.name === tn);
  }
  return undefined;
};

const collectTargets = (
  graph: KernelGraph,
  node: KernelNode,
  relation: RelationWitness,
): KernelNodeRef[] => {
  const candidates = edgesOfKindDef(graph, relation.via);
  const targets: KernelNodeRef[] = [];
  const seen = new Set<string>();
  for (const edge of candidates) {
    const endpoints = edge.endpoints;
    let sourceIdx = -1;
    for (let i = 0; i < endpoints.length; i += 1) {
      if (targetMatchesNode(endpoints[i]!.target, node)) {
        sourceIdx = i;
        break;
      }
    }
    if (sourceIdx === -1) continue;
    let targetEndpoint: (typeof endpoints)[number] | undefined;
    if (relation.endpoint !== undefined) {
      targetEndpoint = endpoints.find(
        (ep) => ep.role.label === relation.endpoint || ep.role.id === relation.endpoint,
      );
      if (!targetEndpoint || targetMatchesNode(targetEndpoint.target, node)) continue;
    } else {
      targetEndpoint = endpoints.find((_, i) => i !== sourceIdx);
      if (!targetEndpoint) continue;
    }
    // Prefer resolving the endpoint target to a real kernel node so the
    // returned ref points at a node that actually exists in the graph.
    const resolved = resolveTargetNode(
      graph,
      relation.target as NodeKindDef,
      targetEndpoint.target,
    );
    let refId: string;
    let refName: string | undefined;
    if (resolved) {
      refId = String(resolved.id);
      refName = typeof resolved.name === "string" ? resolved.name : undefined;
    } else {
      const tid =
        typeof targetEndpoint.target.id === "string" ? targetEndpoint.target.id : undefined;
      if (!tid) continue;
      refId = tid;
      refName =
        typeof targetEndpoint.target.name === "string" ? targetEndpoint.target.name : undefined;
    }
    if (!refId || seen.has(refId)) continue;
    seen.add(refId);
    const ref = nodeRef.unsafe(
      relation.target,
      refId,
      refName !== undefined ? { name: refName } : undefined,
    );
    targets.push(ref);
  }
  return targets;
};

const resolveSchema = (
  kind: NodeKindDef | NodeKindDefWithRelations,
): RelationSchemaShape | undefined => {
  if ("relationSchema" in kind && kind.relationSchema) {
    return kind.relationSchema;
  }
  return undefined;
};

/**
 * Validate that a node's relation schema is satisfied on the current graph.
 *
 * For each relation in `kind.relationSchema`:
 * - emits a `relation:underflow` error when the actual target count is below
 *   the relation's `cardinality.min`;
 * - emits a `relation:overflow` warning when the count is above
 *   `cardinality.max` (when `max` is a finite number, not `null`).
 *
 * Returns an empty array when every relation is satisfied. Pure read — does
 * not mutate the graph.
 */
export const checkRelations = (
  graph: KernelGraph,
  node: KernelNode,
  kind: NodeKindDefWithRelations,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const schema = resolveSchema(kind);
  if (!schema) return diagnostics;
  for (const [name, witness] of Object.entries(schema)) {
    const relation = witness as RelationWitness;
    const targets = collectTargets(graph, node, relation);
    const { min, max } = relation.cardinality;
    if (targets.length < min) {
      diagnostics.push(
        defineDiagnostic(
          "relation:underflow",
          "error",
          `Node ${node.id} relation "${name}" has ${targets.length} target${targets.length === 1 ? "" : "s"}; expected at least ${min}`,
        ),
      );
    }
    if (typeof max === "number" && targets.length > max) {
      diagnostics.push(
        defineDiagnostic(
          "relation:overflow",
          "warning",
          `Node ${node.id} relation "${name}" has ${targets.length} targets; expected at most ${max}`,
        ),
      );
    }
  }
  return diagnostics;
};

/**
 * Synthesized inverse accessor shape for a peer kind whose relation schema
 * targets this kind. Inverse cardinality is always `0..N` — multiple peers
 * may legitimately reference the same target, even when the forward relation
 * is `hasOne` or `belongsTo`. Inverse accessors always return a plain
 * `readonly KernelNodeRef<Peer>[]`.
 */
export type InverseAccessors<Peers extends readonly NodeKindDefWithRelations[]> = {
  readonly [P in Peers[number] as InverseAccessorName<P["id"]>]: () => readonly KernelNodeRef[];
};

/** Derive an inverse accessor name from a peer kind id (last dotted segment). */
export type InverseAccessorName<Id extends string> = Id extends `${string}.${infer Rest}`
  ? InverseAccessorName<Rest>
  : Id;

const inverseAccessorNameFor = (kindId: string): string => {
  const idx = kindId.lastIndexOf(".");
  return idx === -1 ? kindId : kindId.slice(idx + 1);
};

const collectInverseSources = (
  graph: KernelGraph,
  targetKind: NodeKindDef,
  targetNode: KernelNode,
  peer: NodeKindDefWithRelations,
): KernelNodeRef[] => {
  const schema = peer.relationSchema;
  if (!schema) return [];
  // Find any relation whose forward target matches our `targetKind`.
  const matchingRelations: RelationWitness[] = [];
  for (const witness of Object.values(schema)) {
    const relation = witness as RelationWitness;
    if (relation.target.id === targetKind.id) {
      matchingRelations.push(relation);
    }
  }
  if (matchingRelations.length === 0) return [];

  // For each match, walk peer-kind nodes; gather peer refs whose forward
  // relation lookup would land on our `targetNode`.
  const refs: KernelNodeRef[] = [];
  const seen = new Set<string>();
  const targetId = String(targetNode.id);

  for (const relation of matchingRelations) {
    // Walk all peer nodes by scanning the peer kind, but cheaper: walk edges
    // of `relation.via` and check if either endpoint matches our target.
    const edges = edgesOfKindDef(graph, relation.via);
    for (const edge of edges) {
      // Endpoint matching `targetKind` -> our `targetNode.id`.
      let peerEndpoint: (typeof edge.endpoints)[number] | undefined;
      let targetMatched = false;
      for (const ep of edge.endpoints) {
        const epId = String(ep.target.id ?? "");
        if (epId === targetId) {
          targetMatched = true;
        } else if (!peerEndpoint) {
          peerEndpoint = ep;
        }
      }
      if (!targetMatched || !peerEndpoint) continue;
      const peerId = String(peerEndpoint.target.id ?? "");
      if (!peerId || seen.has(peerId)) continue;
      seen.add(peerId);
      const peerName = peerEndpoint.target.name;
      const peerNode = graph.nodes.get(peerId);
      if (!peerNode || peerNode.kind.id !== peer.id) continue;
      refs.push(
        nodeRef.unsafe(
          peer as NodeKindDef,
          peerId,
          peerName !== undefined ? { name: peerName } : undefined,
        ),
      );
    }
  }
  return refs;
};

/**
 * Build runtime accessors for a node's typed relation schema. The accessor
 * shape and return types are inferred from `kind.relationSchema`.
 *
 * Pass the original `defineNodeKind(...).relations({...})` result as `kind`
 * so type inference can see the schema; runtime resolution uses the same
 * witness to walk the graph.
 *
 * Optional `peers` synthesizes inverse accessors: any peer whose
 * `relationSchema` declares a relation targeting `kind` produces an inverse
 * accessor on the result, named by the peer kind id's last dotted segment.
 * Inverse accessors return `readonly KernelNodeRef[]` (cardinality always
 * widens to 0..N for inverses since multiple peers may reference the same
 * target).
 */
export const related = <
  const Kind extends NodeKindDefWithRelations,
  const Peers extends readonly NodeKindDefWithRelations[] = [],
>(
  graph: KernelGraph,
  node: KernelNode,
  kind: Kind,
  options?: { readonly peers?: Peers },
): RelatedAccessors<Kind["relationSchema"]> & InverseAccessors<Peers> => {
  const schema = resolveSchema(kind);
  const accessors: Record<string, () => unknown> = {};
  if (schema) {
    for (const [name, witness] of Object.entries(schema)) {
      const relation = witness as RelationWitness;
      accessors[name] = () => {
        const targets = collectTargets(graph, node, relation);
        const card = relation.cardinality;
        if (card.max === 1) {
          if (card.min === 1) {
            return targets[0];
          }
          return targets[0];
        }
        return targets;
      };
    }
  }
  for (const peer of options?.peers ?? []) {
    const inverseName = inverseAccessorNameFor(peer.id);
    if (inverseName in accessors) continue;
    accessors[inverseName] = () => collectInverseSources(graph, kind, node, peer);
  }
  return accessors as RelatedAccessors<Kind["relationSchema"]> & InverseAccessors<Peers>;
};
