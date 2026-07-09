/* @__NO_SIDE_EFFECTS__ */
/**
 * Graph-native relation checker.
 *
 * Reads the typed `DomainRelationEdgeCustom` payload on every
 * `DOMAIN_RELATION` edge — no legacy `ctx.relations` array. The
 * diagnostic codes / severities are stable (`relations:cross-store-fk`,
 * `relations:m2m-missing-link`, etc.) and form part of the public
 * contract; equivalence tested in
 * `tests/relation-pass-equivalence.test.ts`.
 *
 * See `docs/revised-kernel.md`.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { KernelGraph } from "../kernel/index.ts";
import { DOMAIN_RELATION_EDGE_KIND } from "../dialects/domain/entity-field-relation.ts";
import type { DomainRelationEdgeCustom } from "./kernel.ts";

/**
 * Run the relation-check pass over a kernel graph.
 *
 * The optional `relations` parameter is retained for backwards
 * compatibility with the legacy bridge call site; new callers should
 * pass `graph` only and let the typed edge payload supply the rest.
 */
export const checkRelationsOnGraph = (graph: KernelGraph): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // Walk every domain relation edge in the graph. The rich Relation
  // object is recovered from the typed `DomainRelationEdgeCustom.relation`
  // payload — no `_bridge*` slot, no legacy ctx.relations dependency.
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== DOMAIN_RELATION_EDGE_KIND.id) continue;

    const custom = edge.metadata?.custom as DomainRelationEdgeCustom | undefined;
    const r = custom?.relation;
    if (!r) continue;

    // RelationFieldTypesMatch
    if (r.from_field.semantic_type.name !== r.to_field.semantic_type.name) {
      out.push(
        diagnostic({
          severity: "error",
          code: "relations:field-type-mismatch",
          message: `Relation ${r.name} from/to fields have different types: ${r.from_field.semantic_type.name} vs ${r.to_field.semantic_type.name}`,
        }),
      );
    }

    // CrossStoreNoDatabaseFK
    const fromStore = r.from_entity.store_name;
    const toStore = r.to_entity.store_name;
    if (
      fromStore != null &&
      toStore != null &&
      fromStore !== toStore &&
      r.integrity.kind === "database_foreign_key"
    ) {
      out.push(
        diagnostic({
          severity: "error",
          code: "relations:cross-store-fk",
          message: `Database foreign key cannot span stores (${fromStore} → ${toStore})`,
        }),
      );
    }

    // SetNullRequiresNullable / SetDefaultRequiresDefault
    if (r.foreign_key) {
      const setNull =
        r.foreign_key.on_delete === "set_null" || r.foreign_key.on_update === "set_null";
      if (setNull && !r.from_field.nullable) {
        out.push(
          diagnostic({
            severity: "error",
            code: "relations:set-null-non-nullable",
            message: `setNull referential action requires nullable field ${r.from_field.name}`,
          }),
        );
      }
      const setDefault =
        r.foreign_key.on_delete === "set_default" || r.foreign_key.on_update === "set_default";
      if (setDefault && r.from_field.default_value == null) {
        out.push(
          diagnostic({
            severity: "error",
            code: "relations:set-default-no-default",
            message: `setDefault referential action requires field ${r.from_field.name} to declare a default value`,
          }),
        );
      }
    }

    // ManyToManyRequiresLinkEntity / NonM2MHasNoLinkEntity
    if (r.kind === "many_to_many" && r.link_entity == null) {
      out.push(
        diagnostic({
          severity: "error",
          code: "relations:m2m-missing-link",
          message: `Many-to-many relation ${r.name} requires a backing link_entity`,
        }),
      );
    }
    if (r.kind !== "many_to_many" && r.link_entity != null) {
      out.push(
        diagnostic({
          severity: "error",
          code: "relations:non-m2m-link",
          message: `Non many-to-many relation ${r.name} must not declare a link_entity`,
        }),
      );
    }

    // InverseConsistency
    if (r.inverse && r.inverse.inverse !== r) {
      out.push(
        diagnostic({
          severity: "error",
          code: "relations:inverse-mismatch",
          message: `Relation ${r.name} declares an inverse that does not point back to it`,
        }),
      );
    }
  }

  return out;
};

/**
 * Graph-native relation-entity checker: name uniqueness against
 * ordinary ENTITY nodes and other RELATION_ENTITY nodes. Behaviour
 * matches the legacy `checkRelationEntities(relation_entities, entities)`
 * but reads kernel nodes directly.
 */
export const checkRelationEntitiesOnGraph = (graph: KernelGraph): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const entityNames = new Set<string>();
  const relationEntityNodes: { id: string; name: string }[] = [];

  for (const node of graph.nodes.values()) {
    if (node.kind.id === "node.kind.entity") {
      if (node.name) entityNames.add(node.name);
    } else if (node.kind.id === "node.kind.relationEntity") {
      if (node.name) relationEntityNodes.push({ id: node.id, name: node.name });
    }
  }

  const seen = new Set<string>();
  for (const re of relationEntityNodes) {
    if (seen.has(re.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "relations:relation-entity-duplicate",
          message: `Duplicate relation entity name: ${re.name}`,
        }),
      );
    }
    seen.add(re.name);

    if (entityNames.has(re.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "relations:relation-entity-name-collision",
          message: `Relation entity name ${re.name} collides with an existing entity`,
        }),
      );
    }
  }

  return out;
};

/** Pass definition for the relation checker. */
export const relationCheckPass = {
  name: "relation.check",
  phase: "check" as const,
  description: "Validates domain-relation edges against integrity, cardinality, and FK rules.",
  reads: [DOMAIN_RELATION_EDGE_KIND.id] as readonly string[],
};
