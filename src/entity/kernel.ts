/* @__NO_SIDE_EFFECTS__ */
/**
 * Adapter: Entity / Field → kernel graph IR.
 *
 * Pure conversion functions that translate the legacy `Entity` / `Field`
 * domain objects into kernel `Node`s and `Edge`s. They do not mutate any
 * `GenContext` state — registration into `ctx.graph` happens in PR 4
 * (dual-write).
 *
 * What is emitted:
 *   - One `Node(kind: ENTITY)` per `Entity`.
 *   - One `Node(kind: FIELD)` per `Field`.
 *   - One `Edge(kind: ENTITY_OWNS_FIELD_EDGE_KIND)` per (entity, field) pair.
 *   - One `Edge(kind: FIELD_HAS_TYPE_EDGE_KIND)` per `Field`, connecting the field
 *     to its semantic type (synthesized
 *     `KernelRef<"type">`).
 *
 * Stable IDs: where an `Entity`/`Field` carries an explicit stable id, the
 * kernel node id mirrors it (prefixed with `node:` to disambiguate the
 * kernel namespace). Otherwise we fall back to a name-based id; the
 * trade-off is that two unnamed entities with the same name would collide
 * — current invariants forbid this and `entity:duplicate-name` already
 * catches it during check.
 *
 * See `docs/revised-kernel.md` and `docs/revision/revised_phases.md` §R5
 * (entity/field/relation dialect) for the destination architecture.
 */

import type { Entity, Field } from "./entity.ts";
import {
  type EdgeKind,
  type EndpointRole,
  type KernelEdge,
  type KernelNode,
  type KernelRef,
  type AnyGraphStep,
  defineEdge,
  defineNode,
  graphEdge,
  graphFragment,
  graphNode,
  nodeKinds,
} from "../kernel/index.ts";
import {
  ENTITY_OWNS_FIELD_EDGE_KIND,
  FIELD_HAS_TYPE_EDGE_KIND,
} from "../dialects/domain/entity-field-relation.ts";

const edgeKindFromDef = (def: {
  readonly id: string;
  readonly metadata?: { readonly title?: unknown };
}): EdgeKind => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

const endpointRoleFromDef = (def: {
  readonly id: string;
  readonly name: string;
}): EndpointRole => ({
  id: def.id,
  label: def.name,
});

const entityOwnsFieldKind = edgeKindFromDef(ENTITY_OWNS_FIELD_EDGE_KIND);
const fieldHasTypeKind = edgeKindFromDef(FIELD_HAS_TYPE_EDGE_KIND);
const entityOwnsFieldEntityRole = endpointRoleFromDef(ENTITY_OWNS_FIELD_EDGE_KIND.endpoints[0]!);
const entityOwnsFieldFieldRole = endpointRoleFromDef(ENTITY_OWNS_FIELD_EDGE_KIND.endpoints[1]!);
const fieldHasTypeFieldRole = endpointRoleFromDef(FIELD_HAS_TYPE_EDGE_KIND.endpoints[0]!);
const fieldHasTypeTypeRole = endpointRoleFromDef(FIELD_HAS_TYPE_EDGE_KIND.endpoints[1]!);

const entityNodeId = (entity: Entity): string => `node:entity:${entity.id ?? entity.name}`;

const fieldNodeId = (field: Field): string =>
  `node:field:${field.id ?? `${field.owning_entity.name}.${field.name}`}`;

const ownsEdgeId = (entity: Entity, field: Field): string =>
  `edge:owns:${entity.id ?? entity.name}->${field.id ?? `${entity.name}.${field.name}`}`;

const hasTypeEdgeId = (field: Field): string =>
  `edge:hasType:${field.id ?? `${field.owning_entity.name}.${field.name}`}`;

/**
 * Synthesize a `KernelRef<"type">` for the field's semantic type. The type is
 * not yet registered as a `KernelType` in `ctx.graph.types` — that happens in
 * a later phase. The ref is enough to make the edge endpoint typed and
 * inspectable.
 */
const semanticTypeRef = (field: Field): KernelRef<"type"> => ({
  kind: "type",
  name: field.semantic_type.name,
});

/**
 * Build the kernel `Node(kind: ENTITY)` for an entity.
 *
 * The node carries a typed `EntityNodeCustom` payload (PLAN.md
 * Track R §R2 / §R5) — `store_name` and the entity's ref live in the
 * graph IR under typed keys, not on opaque bridge slots.
 */
export const entityToKernelNode = (entity: Entity): KernelNode => {
  return defineNode(nodeKinds.ENTITY, entityNodeId(entity), {
    name: entity.name,
    metadata: {
      source: undefined,
      custom: {
        ref: entity.ref,
        store_name: entity.store_name,
        entity,
      },
    },
  });
};

/** Build the kernel `Node(kind: FIELD)` for a field. */
export const fieldToKernelNode = (field: Field): KernelNode => {
  return defineNode(nodeKinds.FIELD, fieldNodeId(field), {
    name: field.name,
    metadata: { custom: { ref: field.ref } },
  });
};

/**
 * Build the kernel edges that describe an entity's field ownership and
 * field-type wiring. Returns one `Owns` edge and one `HasType` edge per
 * field, plus the field nodes themselves (returned separately so callers
 * can register them).
 */
export const entityToFieldEdges = (entity: Entity): readonly KernelEdge[] => {
  const edges: KernelEdge[] = [];
  for (const field of entity.fieldList) {
    edges.push(
      defineEdge(entityOwnsFieldKind, ownsEdgeId(entity, field), [
        { role: entityOwnsFieldEntityRole, target: entity.ref, cardinality: "one" },
        { role: entityOwnsFieldFieldRole, target: field.ref, cardinality: "one" },
      ]),
    );
    edges.push(
      defineEdge(fieldHasTypeKind, hasTypeEdgeId(field), [
        { role: fieldHasTypeFieldRole, target: field.ref, cardinality: "one" },
        { role: fieldHasTypeTypeRole, target: semanticTypeRef(field), cardinality: "one" },
      ]),
    );
  }
  return edges;
};

/** Build all field nodes for an entity. */
export const entityToFieldNodes = (entity: Entity): readonly KernelNode[] =>
  entity.fieldList.map(fieldToKernelNode);

/** Build a composable graph fragment for an entity and its field facts. */
export const entityToGraphFragment = (entity: Entity): AnyGraphStep =>
  graphFragment(
    graphNode(entityToKernelNode(entity)),
    ...entityToFieldNodes(entity).map((node) => graphNode(node)),
    ...entityToFieldEdges(entity).map((edge) => graphEdge(edge)),
  );

/**
 * Extract all `Entity` JS objects from ENTITY nodes in the graph.
 * Reads the typed `EntityNodeCustom.entity` payload (PLAN.md §0.5 #8
 * — no `_bridge*` slot).
 */
export const getEntitiesFromGraph = (graph: {
  nodes: ReadonlyMap<string, KernelNode>;
}): Entity[] => {
  const entities: Entity[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== nodeKinds.ENTITY) continue;
    const custom = node.metadata?.custom as { readonly entity?: Entity } | undefined;
    if (custom?.entity) entities.push(custom.entity);
  }
  return entities;
};
