/* @__NO_SIDE_EFFECTS__ */
/**
 * Adapter: Relation → kernel graph IR.
 *
 * Pure conversion from the legacy `Relation` domain object to a kernel
 * `Edge(kind: DOMAIN_RELATION)`. The edge has four endpoints:
 * `from_entity`, `to_entity`, `from_field`, `to_field` — preserving the
 * full relation shape so downstream passes can answer the same questions
 * the legacy `checkRelations` answers today.
 *
 * Relation kind (one_to_one, one_to_many, many_to_one, many_to_many) and
 * integrity mode (database_foreign_key, application_checked, unchecked)
 * are emitted as typed traits on the edge. Cardinality at each endpoint
 * is derived from the relation kind.
 *
 * No `ctx.graph` mutation — registration happens in PR 4 (dual-write).
 *
 * See `docs/revised-kernel.md` and `docs/revision/revised_phases.md` §R5.
 */

import type { Relation, RelationKind, IntegrityMode, RelationEntity } from "./relation.ts";
import type { Entity, Field } from "../entity/entity.ts";
import {
  type EdgeCardinality,
  type AnyGraphStep,
  type KernelEdge,
  type TraitDef,
  defineEdgeFromKind,
  defineNode,
  defineTrait,
  graphEdge,
  graphFragment,
  graphNode,
  nodeKinds,
} from "../kernel/index.ts";
import { id } from "../kernel/id.ts";
import { nodeRef } from "../kernel/node.ts";
import {
  DOMAIN_RELATION_EDGE_KIND,
  ENTITY_NODE_KIND,
  FIELD_NODE_KIND,
} from "../dialects/domain/entity-field-relation.ts";

/**
 * Domain relation traits. Defined here rather than in the kernel registry
 * because they are stdlib-domain claims (R5 dialect material), not hard
 * kernel claims.
 */
export const relationTraits = {
  ONE_TO_ONE: defineTrait("trait.relation.one_to_one", "One-to-one", "edge"),
  ONE_TO_MANY: defineTrait("trait.relation.one_to_many", "One-to-many", "edge"),
  MANY_TO_ONE: defineTrait("trait.relation.many_to_one", "Many-to-one", "edge"),
  MANY_TO_MANY: defineTrait("trait.relation.many_to_many", "Many-to-many", "edge"),
  REQUIRED: defineTrait("trait.relation.required", "Required relation", "edge"),
  INTEGRITY_DB_FK: defineTrait(
    "trait.relation.integrity.database_foreign_key",
    "Database FK integrity",
    "edge",
  ),
  INTEGRITY_APP_CHECKED: defineTrait(
    "trait.relation.integrity.application_checked",
    "Application-checked integrity",
    "edge",
  ),
  INTEGRITY_UNCHECKED: defineTrait(
    "trait.relation.integrity.unchecked",
    "Unchecked integrity",
    "edge",
  ),
  INTEGRITY_EVENTUAL: defineTrait(
    "trait.relation.integrity.eventual",
    "Eventually-consistent integrity",
    "edge",
  ),
  INTEGRITY_EXTERNAL: defineTrait(
    "trait.relation.integrity.external",
    "External integrity",
    "edge",
  ),
} as const;

const cardinalityForFromEndpoint = (kind: RelationKind): EdgeCardinality =>
  kind === "many_to_one" || kind === "many_to_many" ? "many" : "one";

const cardinalityForToEndpoint = (kind: RelationKind): EdgeCardinality =>
  kind === "one_to_many" || kind === "many_to_many" ? "many" : "one";

const traitForKind = (kind: RelationKind): TraitDef => {
  switch (kind) {
    case "one_to_one":
      return relationTraits.ONE_TO_ONE;
    case "one_to_many":
      return relationTraits.ONE_TO_MANY;
    case "many_to_one":
      return relationTraits.MANY_TO_ONE;
    case "many_to_many":
      return relationTraits.MANY_TO_MANY;
  }
};

const traitForIntegrity = (mode: IntegrityMode): TraitDef => {
  switch (mode.kind) {
    case "database_foreign_key":
      return relationTraits.INTEGRITY_DB_FK;
    case "application_checked":
      return relationTraits.INTEGRITY_APP_CHECKED;
    case "unchecked":
      return relationTraits.INTEGRITY_UNCHECKED;
    case "eventual":
      return relationTraits.INTEGRITY_EVENTUAL;
    case "external":
      return relationTraits.INTEGRITY_EXTERNAL;
  }
};

const relationEdgeId = (relation: Relation): string =>
  `edge:domain.relation:${relation.id ?? relation.name}`;

const domainId = id.createFactory("domain.entityFieldRelation");

export const entityNodeRef = (entity: Entity) =>
  nodeRef(
    ENTITY_NODE_KIND,
    domainId.parse.node(ENTITY_NODE_KIND, `node:entity:${entity.id ?? entity.name}`),
    {
      name: entity.name,
    },
  );

export const fieldNodeRef = (field: Field) =>
  nodeRef(
    FIELD_NODE_KIND,
    domainId.parse.node(
      FIELD_NODE_KIND,
      `node:field:${field.id ?? `${field.owning_entity.name}.${field.name}`}`,
    ),
    {
      name: field.name,
    },
  );

/**
 * Typed payload on a `DOMAIN_RELATION` edge. Carries the full structural
 * `Relation` shape so dialect-owned passes (`checkRelationsOnGraph`) can
 * read foreign-key, integrity, link-entity, and inverse fields without
 * needing the legacy `ctx.relations` array (PLAN.md §0.5 #8 / Track E §2).
 */
export type DomainRelationEdgeCustom = {
  readonly ref: Relation["ref"];
  readonly relation: Relation;
};

/** Build the kernel `Edge(kind: DOMAIN_RELATION_EDGE_KIND)` for a relation. */
export const relationToKernelEdge = (relation: Relation): KernelEdge => {
  const traits: TraitDef[] = [traitForKind(relation.kind), traitForIntegrity(relation.integrity)];
  if (relation.required) traits.push(relationTraits.REQUIRED);

  return defineEdgeFromKind(
    DOMAIN_RELATION_EDGE_KIND,
    relationEdgeId(relation),
    {
      from: {
        target: entityNodeRef(relation.from_entity),
        cardinality: cardinalityForFromEndpoint(relation.kind),
      },
      to: {
        target: entityNodeRef(relation.to_entity),
        cardinality: cardinalityForToEndpoint(relation.kind),
      },
      fromField: {
        target: fieldNodeRef(relation.from_field),
        cardinality: "one",
      },
      toField: {
        target: fieldNodeRef(relation.to_field),
        cardinality: "one",
      },
    },
    {
      traits,
      metadata: {
        title: relation.name,
        custom: { ref: relation.ref, relation } satisfies DomainRelationEdgeCustom,
      },
    },
  );
};

/** Build a kernel `Node(kind: RELATION_ENTITY)` for a relation entity. */
export const relationEntityToKernelNode = (relationEntity: RelationEntity) =>
  defineNode(
    nodeKinds.RELATION_ENTITY,
    relationEntity.id ?? `node:relationEntity:${relationEntity.name}`,
    {
      name: relationEntity.name,
      metadata: {
        title: relationEntity.name,
        custom: { ref: relationEntity.ref },
      },
    },
  );

/** Build a composable graph fragment for a relation edge. */
export const relationToGraphFragment = (relation: Relation): AnyGraphStep =>
  graphFragment(graphEdge(relationToKernelEdge(relation)));

/** Build a composable graph fragment for a relation-entity node. */
export const relationEntityToGraphFragment = (relationEntity: RelationEntity): AnyGraphStep =>
  graphFragment(graphNode(relationEntityToKernelNode(relationEntity)));
