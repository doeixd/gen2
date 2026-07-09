/* @__NO_SIDE_EFFECTS__ */
/**
 * Domain dialect — R5 dialect for entities, fields, and relations.
 *
 * Entities, fields, and domain relations become explicit graph nodes and edges.
 * Cardinality, integrity, foreign-key behavior, and deletion behavior are
 * typed traits/edge payloads, not hardcoded relation-only fields.
 *
 * See docs/revision/revised_phases.md §R5.
 */

import { defineDialect, dialectId } from "../../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../../kernel/ods.ts";
import { hasMany, hasOne } from "../../kernel/relations.ts";
import { defineTrait } from "../../kernel/symbol.ts";
import { TYPE_NODE_KIND } from "../core/type-operation.ts";

// === Cardinality traits =====================================================

export const cardinalityTraits = {
  ONE_TO_ONE: defineTrait<true>("trait.cardinality.oneToOne", "One-to-one", "edge"),
  ONE_TO_MANY: defineTrait<true>("trait.cardinality.oneToMany", "One-to-many", "edge"),
  MANY_TO_ONE: defineTrait<true>("trait.cardinality.manyToOne", "Many-to-one", "edge"),
  MANY_TO_MANY: defineTrait<true>("trait.cardinality.manyToMany", "Many-to-many", "edge"),
} as const;

// === Integrity traits =======================================================

export const integrityTraits = {
  DB_FK: defineTrait<true>("trait.integrity.databaseForeignKey", "Database foreign key", "edge"),
  APP_CHECKED: defineTrait<true>(
    "trait.integrity.applicationChecked",
    "Application-checked",
    "edge",
  ),
  UNCHECKED: defineTrait<true>("trait.integrity.unchecked", "Unchecked integrity", "edge"),
  EVENTUAL: defineTrait<true>("trait.integrity.eventual", "Eventually-consistent", "edge"),
  EXTERNAL: defineTrait<true>("trait.integrity.external", "External integrity", "edge"),
} as const;

// === Referential action traits ==============================================

export const referentialTraits = {
  CASCADE: defineTrait<true>("trait.referential.cascade", "Cascade on delete/update", "edge"),
  RESTRICT: defineTrait<true>("trait.referential.restrict", "Restrict on delete/update", "edge"),
  SET_NULL: defineTrait<true>("trait.referential.setNull", "Set null on delete/update", "edge"),
  SET_DEFAULT: defineTrait<true>(
    "trait.referential.setDefault",
    "Set default on delete/update",
    "edge",
  ),
} as const;

// === Relation traits ========================================================

export const relationTraits = {
  REQUIRED: defineTrait<true>("trait.relation.required", "Required relation", "edge"),
  INDEXED: defineTrait<true>("trait.relation.indexed", "Indexed relation field", "node"),
  UNIQUE: defineTrait<true>("trait.relation.unique", "Unique field", "node"),
  SEARCHABLE: defineTrait<true>("trait.relation.searchable", "Searchable field", "node"),
  SORTABLE: defineTrait<true>("trait.relation.sortable", "Sortable field", "node"),
} as const;

// === Node kinds =============================================================

/**
 * Typed payload on an entity node. Carries the storage table name
 * and the full `Entity` JS object so dialect-owned passes (RLS, query
 * lowering, entity-invariant checks) read structurally from the graph
 * — no `_bridge*` side channel (PLAN.md §0.5 #8 / Track R §R5).
 *
 * `Entity` is imported as a type only; the dialect layer never
 * constructs one.
 */
export type EntityNodeCustom = {
  /** Storage table name when the entity has one, otherwise undefined. */
  readonly store_name?: string;
  /** The full `Entity` JS object (pure-data; carries field list, transitions, etc.). */
  readonly entity?: import("../../entity/entity.ts").Entity;
};

export const ENTITY_NODE_KIND = defineNodeKind({
  id: "node.kind.entity",
  dialect: "dialect.domain.entityFieldRelation",
  traits: [],
  custom: undefined as unknown as EntityNodeCustom,
  metadata: { title: "Entity" },
});

export const FIELD_NODE_KIND = defineNodeKind({
  id: "node.kind.field",
  dialect: "dialect.domain.entityFieldRelation",
  traits: Object.values(relationTraits),
  metadata: { title: "Field" },
});

export const DOMAIN_RELATION_NODE_KIND = defineNodeKind({
  id: "node.kind.domainRelation",
  dialect: "dialect.domain.entityFieldRelation",
  traits: [...Object.values(cardinalityTraits), ...Object.values(integrityTraits)],
  metadata: { title: "Domain relation" },
});

// === Edge kinds =============================================================

/** Entity owns field. */
export const ENTITY_OWNS_FIELD_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.ownsField",
  dialect: "dialect.domain.entityFieldRelation",
  endpoints: [
    defineEndpointRole("entity", { targetKinds: [ENTITY_NODE_KIND] }),
    defineEndpointRole("field", { targetKinds: [FIELD_NODE_KIND] }),
  ],
  metadata: { title: "Entity owns field" },
});

/** Field has type. */
export const FIELD_HAS_TYPE_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.fieldHasType",
  dialect: "dialect.domain.entityFieldRelation",
  endpoints: [
    defineEndpointRole("field", { targetKinds: [FIELD_NODE_KIND] }),
    defineEndpointRole("type", { targetKinds: [TYPE_NODE_KIND] }),
  ],
  metadata: { title: "Field has type" },
});

/** Domain relation between entities (or relation node). */
export const DOMAIN_RELATION_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.domainRelation",
  dialect: "dialect.domain.entityFieldRelation",
  endpoints: [
    defineEndpointRole("from", { targetKinds: [ENTITY_NODE_KIND] }),
    defineEndpointRole("to", { targetKinds: [ENTITY_NODE_KIND] }),
    defineEndpointRole("fromField", { targetKinds: [FIELD_NODE_KIND] }),
    defineEndpointRole("toField", { targetKinds: [FIELD_NODE_KIND] }),
  ],
  traits: [
    ...Object.values(cardinalityTraits),
    ...Object.values(integrityTraits),
    ...Object.values(referentialTraits),
    relationTraits.REQUIRED,
  ],
  metadata: { title: "Domain relation" },
});

/** Relation endpoint: links a relation node to an endpoint entity/field. */
export const RELATION_ENDPOINT_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.relationEndpoint",
  dialect: "dialect.domain.entityFieldRelation",
  endpoints: [
    defineEndpointRole("relation", { targetKinds: [DOMAIN_RELATION_NODE_KIND] }),
    defineEndpointRole("endpoint", { targetKinds: [ENTITY_NODE_KIND, FIELD_NODE_KIND] }),
  ],
  metadata: { title: "Relation endpoint" },
});

// === Relation-schema views (PLAN §B0a) =======================================
//
// Entities own fields; fields belong to exactly one entity. The schemas
// below are typed views over the edge kinds above — they back runtime
// `kernel.related(graph, node, kind)` accessors and
// `kernel.checkRelations(...)` underflow/overflow diagnostics without
// disturbing the bare exports above (whose endpoint constraints leak
// node-kind generics that some refs and tests rely on).
//
// Use these `_WITH_RELATIONS` variants when calling `kernel.related(...)`
// or `kernel.checkRelations(...)`. Verifiers, pattern shortcuts, and
// surface input precision are follow-up work.

/** Entity node augmented with `fields: hasMany(Field, via=ownsField, endpoint=field)`. */
export const ENTITY_NODE_KIND_WITH_RELATIONS = ENTITY_NODE_KIND.relations({
  fields: hasMany(FIELD_NODE_KIND, {
    via: ENTITY_OWNS_FIELD_EDGE_KIND,
    endpoint: "field",
  }),
});

/** Field node augmented with `entity: hasOne(Entity, via=ownsField, endpoint=entity)`. */
export const FIELD_NODE_KIND_WITH_RELATIONS = FIELD_NODE_KIND.relations({
  entity: hasOne(ENTITY_NODE_KIND, {
    via: ENTITY_OWNS_FIELD_EDGE_KIND,
    endpoint: "entity",
  }),
});

// === Dialect definition =====================================================

export const EntityFieldRelationDialect = defineDialect({
  id: dialectId("dialect.domain.entityFieldRelation"),
  namespace: "domain.entityFieldRelation",
  label: "Domain Entity/Field/Relation",
  nodeKinds: [ENTITY_NODE_KIND, FIELD_NODE_KIND, DOMAIN_RELATION_NODE_KIND],
  edgeKinds: [
    ENTITY_OWNS_FIELD_EDGE_KIND,
    FIELD_HAS_TYPE_EDGE_KIND,
    DOMAIN_RELATION_EDGE_KIND,
    RELATION_ENDPOINT_EDGE_KIND,
  ],
  traits: [
    ...Object.values(cardinalityTraits),
    ...Object.values(integrityTraits),
    ...Object.values(referentialTraits),
    ...Object.values(relationTraits),
  ],
  passes: [],
  lowerings: [],
  metadata: {
    title: "Domain Entity/Field/Relation Dialect",
    description:
      "Entities, fields, and domain relations with cardinality, integrity, and referential traits.",
  },
});
