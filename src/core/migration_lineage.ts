/* @__NO_SIDE_EFFECTS__ */
/**
 * Migration lineage for milestone 10.
 *
 * Compares two snapshots of the data model (entities + their fields) and
 * classifies the difference as renames, drops, additions, or unchanged. The
 * planner uses stable IDs first; when both sides have an ID, equal IDs mean
 * "same node, possibly renamed". When IDs are absent, falls back to current
 * names. Field-level rename hints from `renamed_from` are honored as a last
 * resort for un-IDed fields.
 */

import type { Entity, Field } from "../entity/index.ts";
import type { EntityId, FieldId } from "./refs.ts";

export type EntityChangeKind = "added" | "removed" | "renamed" | "unchanged";

export interface EntityChange {
  readonly kind: EntityChangeKind;
  readonly id?: EntityId;
  readonly previous_name?: string;
  readonly current_name?: string;
}

export type FieldChangeKind = "added" | "removed" | "renamed" | "unchanged";

export interface FieldChange {
  readonly kind: FieldChangeKind;
  readonly entity_id?: EntityId;
  readonly entity_name: string;
  readonly id?: FieldId;
  readonly previous_name?: string;
  readonly current_name?: string;
}

export interface MigrationLineage {
  readonly entities: readonly EntityChange[];
  readonly fields: readonly FieldChange[];
}

const indexEntities = (
  entities: readonly Entity[],
): { byId: Map<EntityId, Entity>; byName: Map<string, Entity> } => {
  const byId = new Map<EntityId, Entity>();
  const byName = new Map<string, Entity>();
  for (const entity of entities) {
    if (entity.id !== undefined) byId.set(entity.id, entity);
    byName.set(entity.name, entity);
  }
  return { byId, byName };
};

const indexFields = (entity: Entity): { byId: Map<FieldId, Field>; byName: Map<string, Field> } => {
  const byId = new Map<FieldId, Field>();
  const byName = new Map<string, Field>();
  for (const field of entity.fieldList) {
    if (field.id !== undefined) byId.set(field.id, field);
    byName.set(field.name, field);
  }
  return { byId, byName };
};

const diffFields = (
  previous: Entity | undefined,
  current: Entity | undefined,
): readonly FieldChange[] => {
  const out: FieldChange[] = [];
  const entity_id = current?.id ?? previous?.id;
  const entity_name = current?.name ?? previous?.name ?? "<unknown>";

  if (current === undefined && previous !== undefined) {
    for (const field of previous.fieldList) {
      out.push({
        kind: "removed",
        entity_id,
        entity_name,
        id: field.id,
        previous_name: field.name,
      });
    }
    return out;
  }
  if (previous === undefined && current !== undefined) {
    for (const field of current.fieldList) {
      out.push({
        kind: "added",
        entity_id,
        entity_name,
        id: field.id,
        current_name: field.name,
      });
    }
    return out;
  }
  if (previous === undefined || current === undefined) return out;

  const previousByField = indexFields(previous);
  const currentByField = indexFields(current);

  const matchedPrevious = new Set<Field>();
  const matchedCurrent = new Set<Field>();

  // Match by stable ID first.
  for (const [id, currentField] of currentByField.byId) {
    const previousField = previousByField.byId.get(id);
    if (previousField === undefined) continue;
    matchedPrevious.add(previousField);
    matchedCurrent.add(currentField);
    if (previousField.name === currentField.name) {
      out.push({
        kind: "unchanged",
        entity_id,
        entity_name,
        id,
        previous_name: previousField.name,
        current_name: currentField.name,
      });
    } else {
      out.push({
        kind: "renamed",
        entity_id,
        entity_name,
        id,
        previous_name: previousField.name,
        current_name: currentField.name,
      });
    }
  }

  // Match remaining fields by `renamed_from` hints (works even without IDs).
  for (const currentField of current.fieldList) {
    if (matchedCurrent.has(currentField)) continue;
    for (const oldName of currentField.renamed_from) {
      const previousField = previousByField.byName.get(oldName);
      if (previousField === undefined || matchedPrevious.has(previousField)) continue;
      matchedPrevious.add(previousField);
      matchedCurrent.add(currentField);
      out.push({
        kind: "renamed",
        entity_id,
        entity_name,
        id: currentField.id,
        previous_name: previousField.name,
        current_name: currentField.name,
      });
      break;
    }
  }

  // Match remaining fields by current name (covers IDless unchanged fields).
  for (const currentField of current.fieldList) {
    if (matchedCurrent.has(currentField)) continue;
    const previousField = previousByField.byName.get(currentField.name);
    if (previousField === undefined || matchedPrevious.has(previousField)) continue;
    matchedPrevious.add(previousField);
    matchedCurrent.add(currentField);
    out.push({
      kind: "unchanged",
      entity_id,
      entity_name,
      id: currentField.id,
      previous_name: previousField.name,
      current_name: currentField.name,
    });
  }

  for (const currentField of current.fieldList) {
    if (matchedCurrent.has(currentField)) continue;
    out.push({
      kind: "added",
      entity_id,
      entity_name,
      id: currentField.id,
      current_name: currentField.name,
    });
  }
  for (const previousField of previous.fieldList) {
    if (matchedPrevious.has(previousField)) continue;
    out.push({
      kind: "removed",
      entity_id,
      entity_name,
      id: previousField.id,
      previous_name: previousField.name,
    });
  }

  return out;
};

/**
 * Computes the migration lineage between two snapshots.
 *
 * @param previous - The earlier set of entities (e.g., the persisted IR).
 * @param current - The current set of entities authored in code.
 * @returns Entity- and field-level changes classified as added/removed/renamed/unchanged.
 */
export const deriveMigrationLineage = (
  previous: readonly Entity[],
  current: readonly Entity[],
): MigrationLineage => {
  const previousIndex = indexEntities(previous);
  const currentIndex = indexEntities(current);

  const entityChanges: EntityChange[] = [];
  const fieldChanges: FieldChange[] = [];
  const matchedPrevious = new Set<Entity>();
  const matchedCurrent = new Set<Entity>();

  for (const [id, currentEntity] of currentIndex.byId) {
    const previousEntity = previousIndex.byId.get(id);
    if (previousEntity === undefined) continue;
    matchedPrevious.add(previousEntity);
    matchedCurrent.add(currentEntity);
    entityChanges.push({
      kind: previousEntity.name === currentEntity.name ? "unchanged" : "renamed",
      id,
      previous_name: previousEntity.name,
      current_name: currentEntity.name,
    });
    fieldChanges.push(...diffFields(previousEntity, currentEntity));
  }

  for (const currentEntity of current) {
    if (matchedCurrent.has(currentEntity)) continue;
    const previousEntity = previousIndex.byName.get(currentEntity.name);
    if (previousEntity === undefined || matchedPrevious.has(previousEntity)) continue;
    matchedPrevious.add(previousEntity);
    matchedCurrent.add(currentEntity);
    entityChanges.push({
      kind: "unchanged",
      id: currentEntity.id ?? previousEntity.id,
      previous_name: previousEntity.name,
      current_name: currentEntity.name,
    });
    fieldChanges.push(...diffFields(previousEntity, currentEntity));
  }

  for (const currentEntity of current) {
    if (matchedCurrent.has(currentEntity)) continue;
    entityChanges.push({
      kind: "added",
      id: currentEntity.id,
      current_name: currentEntity.name,
    });
    fieldChanges.push(...diffFields(undefined, currentEntity));
  }

  for (const previousEntity of previous) {
    if (matchedPrevious.has(previousEntity)) continue;
    entityChanges.push({
      kind: "removed",
      id: previousEntity.id,
      previous_name: previousEntity.name,
    });
    fieldChanges.push(...diffFields(previousEntity, undefined));
  }

  return { entities: entityChanges, fields: fieldChanges };
};
