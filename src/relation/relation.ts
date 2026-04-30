/* @__NO_SIDE_EFFECTS__ */
/**
 * Relations connect entities. A Relation declares a from→to direction with a
 * cardinality kind, an integrity mode (database FK, application-checked, etc.),
 * referential actions, and (for many-to-many) a backing link entity.
 *
 * See spec/relation.allium :: entity Relation, value IntegrityMode,
 * value ForeignKey, value ReferentialAction, value AppDeletionBehavior.
 */

import { type Diagnostic, diagnostic, makeRef } from "../core/index.ts";
import type { RelationId, RelationRef } from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";

/**
 * Cardinality kind of a relation.
 *
 * @example
 * ```ts
 * const kind: RelationKind = "one_to_many";
 * ```
 */
export type RelationKind = "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";

/**
 * Mode of referential integrity enforcement.
 */
export type IntegrityKind =
  | "database_foreign_key"
  | "application_checked"
  | "eventual"
  | "unchecked"
  | "external";

/**
 * Action taken when a referenced row is deleted or updated.
 */
export type ReferentialAction = "cascade" | "restrict" | "no_action" | "set_null" | "set_default";

/**
 * Application-level deletion behavior for related records.
 */
export type AppDeletion =
  | "database_cascade"
  | "service_cascade"
  | "soft_delete_children"
  | "archive_children"
  | "prevent_if_related"
  | "orphan_children";

/**
 * Describes how referential integrity is enforced.
 */
export interface IntegrityMode {
  /** Discriminator for the integrity mode. */
  readonly kind: IntegrityKind;
}

/**
 * Database foreign key constraints with referential actions.
 */
export interface ForeignKey {
  /** Action when the referenced row is deleted. */
  readonly on_delete: ReferentialAction;
  /** Action when the referenced row is updated. */
  readonly on_update: ReferentialAction;
  /** Whether an index is created for the foreign key. */
  readonly indexed: boolean;
}

/**
 * Application-level behavior when a related record is deleted.
 */
export interface AppDeletionBehavior {
  /** Discriminator for the deletion behavior. */
  readonly kind: AppDeletion;
  /** Optional human-readable message explaining the behavior. */
  readonly message?: string;
}

/**
 * A directed association between two entities with cardinality, integrity, and deletion behavior.
 */
export interface Relation<
  From = unknown,
  To = unknown,
  K extends RelationKind = RelationKind,
  E1 extends Entity = Entity,
  E2 extends Entity = Entity,
> {
  /** Stable persisted identity for this relation, when explicitly declared. */
  readonly id?: RelationId;
  /** Human-readable name of the relation. */
  readonly name: string;
  /** Cardinality kind (e.g., one_to_many). */
  readonly kind: K;
  /** Entity on the "from" side of the relation. */
  readonly from_entity: E1;
  /** Entity on the "to" side of the relation. */
  readonly to_entity: E2;
  /** Field on the from entity that participates in the relation. */
  readonly from_field: Field<From>;
  /** Field on the to entity that participates in the relation. */
  readonly to_field: Field<To>;
  /** Inverse relation, if defined. */
  readonly inverse?: Relation<To, From>;
  /** Whether the relation is required. */
  readonly required: boolean;
  /** Integrity enforcement mode. */
  readonly integrity: IntegrityMode;
  /** Foreign key constraints when integrity is database-enforced. */
  readonly foreign_key?: ForeignKey;
  /** Application-level behavior when a related record is deleted. */
  readonly deletion_behavior?: AppDeletionBehavior;
  /**
   * Required for many_to_many; null for other kinds.
   */
  readonly link_entity?: Entity;
  /**
   * Auto-populated RelationRef preserving relation endpoint types.
   */
  readonly ref: RelationRef<From, To>;
}

/**
 * A named endpoint of a relation with cardinality.
 */
export interface Role {
  /** Name of the role. */
  readonly name: string;
  /** Entity that this role targets. */
  readonly target_entity: Entity;
  /** Cardinality at this endpoint ("one" or "many"). */
  readonly cardinality: "one" | "many";
}

/**
 * A synthetic entity representing a many-to-many link table.
 */
export interface RelationEntity {
  /** Stable persisted identity for this relation entity, when explicitly declared. */
  readonly id?: RelationId;
  /** Name of the relation entity. */
  readonly name: string;
  /** Roles participating in the relation entity. */
  readonly roles: readonly Role[];
  /** Fields defined on the relation entity. */
  readonly fields: readonly Field[];
  /**
   * Auto-populated RelationRef for typed citation.
   */
  readonly ref: RelationRef;
}

/**
 * A graph of entities and the relations connecting them.
 */
export interface Graph {
  /** Name of the graph. */
  readonly name: string;
  /** Entities participating in the graph. */
  readonly entities: readonly Entity[];
  /** Relations connecting the entities. */
  readonly relations: readonly Relation[];
}

// --- Constructors ----------------------------------------------------------

/**
 * Creates a Relation record with inferred field types.
 *
 * @param input - Relation properties.
 * @returns A Relation record.
 * @example
 * ```ts
 * const rel = defineRelation({
 *   name: "UserPosts",
 *   kind: "one_to_many",
 *   from_entity: User,
 *   to_entity: Post,
 *   from_field: Post.fields.userId,
 *   to_field: User.fields.id,
 * });
 * ```
 */
export const defineRelation = <
  From = unknown,
  To = unknown,
  K extends RelationKind = RelationKind,
  E1 extends Entity = Entity,
  E2 extends Entity = Entity,
>(input: {
  id?: RelationId;
  name: string;
  kind: K;
  from_entity: E1;
  to_entity: E2;
  from_field: Field<From>;
  to_field: Field<To>;
  required?: boolean;
  integrity?: IntegrityMode;
  foreign_key?: ForeignKey;
  deletion_behavior?: AppDeletionBehavior;
  link_entity?: Entity;
  inverse?: Relation<To, From>;
}): Relation<From, To, K, E1, E2> => ({
  id: input.id,
  name: input.name,
  kind: input.kind,
  from_entity: input.from_entity,
  to_entity: input.to_entity,
  from_field: input.from_field,
  to_field: input.to_field,
  required: input.required ?? false,
  integrity: input.integrity ?? { kind: "application_checked" },
  foreign_key: input.foreign_key,
  deletion_behavior: input.deletion_behavior,
  link_entity: input.link_entity,
  inverse: input.inverse,
  ref: makeRef({
    kind: "RelationRef",
    id: input.id,
    owner: { kind: "Relation", name: input.name },
    name: input.name,
    value_type: `${input.from_entity.name}_${input.to_entity.name}`,
  }) as RelationRef<From, To>,
});

/**
 * Creates a RelationEntity record with a typed ref.
 *
 * @param name - The relation entity name.
 * @param roles - The roles participating in the relation entity.
 * @param fields - The fields of the relation entity.
 * @returns A RelationEntity record.
 */
export const defineRelationEntity = (
  name: string,
  roles: readonly Role[],
  fields: readonly Field[],
  options: { id?: RelationId } = {},
): RelationEntity => ({
  id: options.id,
  name,
  roles,
  fields,
  ref: makeRef({
    kind: "RelationRef",
    id: options.id,
    owner: { kind: "Relation", name },
    name,
    value_type: "relation_entity",
  }) as RelationRef,
});

// --- Invariants and rules --------------------------------------------------

/**
 * Validates relation invariants: field type matching, cross-store FK constraints,
 * nullable requirements for setNull, default requirements for setDefault,
 * many-to-many link entity presence, and inverse consistency.
 *
 * @param relations - Relations to validate.
 * @returns Diagnostics for any violated relation rules.
 */
export const checkRelations = (
  relations: readonly Relation<unknown, unknown>[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  for (const r of relations) {
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

    // CrossStoreNoDatabaseFK + CrossStoreDatabaseFK rule
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

    // SetNullRequiresNullable
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

      // SetDefaultRequiresDefault / SetDefaultOnNoDefault rule
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

    // ManyToManyRequiresLinkEntity
    if (r.kind === "many_to_many" && r.link_entity == null) {
      out.push(
        diagnostic({
          severity: "error",
          code: "relations:m2m-missing-link",
          message: `Many-to-many relation ${r.name} requires a backing link_entity`,
        }),
      );
    }
    // NonM2MHasNoLinkEntity
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
 * Validates relation-entity invariants: name uniqueness against ordinary entities
 * and other relation entities.
 *
 * @param relation_entities - Relation entities to validate.
 * @param entities - Ordinary entities to check against for name collisions.
 * @returns Diagnostics for any violated relation-entity rules.
 */
export const checkRelationEntities = (
  relation_entities: readonly RelationEntity[],
  entities: readonly Entity[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const re of relation_entities) {
    // RelationEntityNameUnique
    if (seen.has(re.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "relations:relation-entity-duplicate",
          message: `Duplicate relation entity name: ${re.name}`,
          refs: [re.ref],
        }),
      );
    }
    seen.add(re.name);

    // RelationEntityNameDoesNotCollideWithEntity
    if (entities.some((e) => e.name === re.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "relations:relation-entity-name-collision",
          message: `Relation entity name ${re.name} collides with an existing entity`,
          refs: [re.ref],
        }),
      );
    }
  }

  return out;
};

// --- Ergonomic relation helpers --------------------------------------------

/**
 * Creates a one-to-one relation with inferred field types.
 *
 * @param from_entity - Source entity.
 * @param to_entity - Target entity.
 * @param from_field - FK field on the source entity.
 * @param to_field - Referenced field on the target entity.
 * @param options - Optional integrity, FK, and deletion behavior.
 * @returns A one-to-one Relation.
 */
export const oneToOne = <
  From = unknown,
  To = unknown,
  E1 extends Entity = Entity,
  E2 extends Entity = Entity,
>(
  from_entity: E1,
  to_entity: E2,
  from_field: Field<From>,
  to_field: Field<To>,
  options?: {
    id?: RelationId;
    required?: boolean;
    integrity?: IntegrityMode;
    foreign_key?: ForeignKey;
    deletion_behavior?: AppDeletionBehavior;
    inverse?: Relation<To, From>;
  },
): Relation<From, To, "one_to_one", E1, E2> =>
  defineRelation<From, To, "one_to_one", E1, E2>({
    name: `${from_entity.name}_${to_entity.name}`,
    kind: "one_to_one",
    from_entity,
    to_entity,
    from_field,
    to_field,
    ...options,
  });

/**
 * Creates a one-to-many relation (from parent to children) with inferred field types.
 *
 * @param from_entity - Parent entity.
 * @param to_entity - Child entity.
 * @param from_field - FK field on the child entity that references the parent.
 * @param to_field - Referenced field on the parent entity.
 * @param options - Optional integrity, FK, and deletion behavior.
 * @returns A one-to-many Relation.
 */
export const oneToMany = <
  From = unknown,
  To = unknown,
  E1 extends Entity = Entity,
  E2 extends Entity = Entity,
>(
  from_entity: E1,
  to_entity: E2,
  from_field: Field<From>,
  to_field: Field<To>,
  options?: {
    id?: RelationId;
    required?: boolean;
    integrity?: IntegrityMode;
    foreign_key?: ForeignKey;
    deletion_behavior?: AppDeletionBehavior;
    inverse?: Relation<To, From>;
  },
): Relation<From, To, "one_to_many", E1, E2> =>
  defineRelation<From, To, "one_to_many", E1, E2>({
    name: `${from_entity.name}_${to_entity.name}s`,
    kind: "one_to_many",
    from_entity,
    to_entity,
    from_field,
    to_field,
    ...options,
  });

/**
 * Creates a many-to-one relation (from child to parent) with inferred field types.
 *
 * @param from_entity - Child entity.
 * @param to_entity - Parent entity.
 * @param from_field - FK field on the child entity.
 * @param to_field - Referenced field on the parent entity.
 * @param options - Optional integrity, FK, and deletion behavior.
 * @returns A many-to-one Relation.
 */
export const manyToOne = <
  From = unknown,
  To = unknown,
  E1 extends Entity = Entity,
  E2 extends Entity = Entity,
>(
  from_entity: E1,
  to_entity: E2,
  from_field: Field<From>,
  to_field: Field<To>,
  options?: {
    id?: RelationId;
    required?: boolean;
    integrity?: IntegrityMode;
    foreign_key?: ForeignKey;
    deletion_behavior?: AppDeletionBehavior;
    inverse?: Relation<To, From>;
  },
): Relation<From, To, "many_to_one", E1, E2> =>
  defineRelation<From, To, "many_to_one", E1, E2>({
    name: `${from_entity.name}_${to_entity.name}`,
    kind: "many_to_one",
    from_entity,
    to_entity,
    from_field,
    to_field,
    ...options,
  });

/**
 * Creates a many-to-many relation with a backing link entity and inferred field types.
 *
 * @param from_entity - First entity.
 * @param to_entity - Second entity.
 * @param from_field - FK field on the link entity referencing the first entity.
 * @param to_field - FK field on the link entity referencing the second entity.
 * @param link_entity - Synthetic link entity.
 * @param options - Optional integrity and deletion behavior.
 * @returns A many-to-many Relation.
 */
export const manyToMany = <
  From = unknown,
  To = unknown,
  E1 extends Entity = Entity,
  E2 extends Entity = Entity,
>(
  from_entity: E1,
  to_entity: E2,
  from_field: Field<From>,
  to_field: Field<To>,
  link_entity: Entity,
  options?: {
    id?: RelationId;
    required?: boolean;
    integrity?: IntegrityMode;
    deletion_behavior?: AppDeletionBehavior;
    inverse?: Relation<To, From>;
  },
): Relation<From, To, "many_to_many", E1, E2> =>
  defineRelation<From, To, "many_to_many", E1, E2>({
    name: `${from_entity.name}_${to_entity.name}`,
    kind: "many_to_many",
    from_entity,
    to_entity,
    from_field,
    to_field,
    link_entity,
    ...options,
  });

// --- Integrity / FK / Deletion shorthand constructors ----------------------

/**
 * Shorthand for a database_foreign_key integrity mode.
 *
 * @returns An IntegrityMode with kind `database_foreign_key`.
 */
export const integrityDbFk = (): IntegrityMode => ({ kind: "database_foreign_key" });

/**
 * Shorthand for an application_checked integrity mode.
 *
 * @returns An IntegrityMode with kind `application_checked`.
 */
export const integrityAppChecked = (): IntegrityMode => ({ kind: "application_checked" });

/**
 * Shorthand for an unchecked integrity mode.
 *
 * @returns An IntegrityMode with kind `unchecked`.
 */
export const integrityUnchecked = (): IntegrityMode => ({ kind: "unchecked" });

/**
 * Creates a ForeignKey constraint.
 *
 * @param on_delete - Action when the referenced row is deleted.
 * @param on_update - Action when the referenced row is updated.
 * @param indexed - Whether an index is created for the foreign key (default `true`).
 * @returns A ForeignKey record.
 */
export const foreignKey = (
  on_delete: ReferentialAction,
  on_update: ReferentialAction,
  indexed = true,
): ForeignKey => ({ on_delete, on_update, indexed });

/**
 * Shorthand for a ForeignKey with cascade on delete and update.
 *
 * @returns A ForeignKey with both actions set to `cascade`.
 */
export const fkCascade = (): ForeignKey => foreignKey("cascade", "cascade");

/**
 * Shorthand for a ForeignKey with restrict on delete and update.
 *
 * @returns A ForeignKey with both actions set to `restrict`.
 */
export const fkRestrict = (): ForeignKey => foreignKey("restrict", "restrict");

/**
 * Shorthand for a ForeignKey with set_null on delete and update.
 *
 * @returns A ForeignKey with both actions set to `set_null`.
 */
export const fkSetNull = (): ForeignKey => foreignKey("set_null", "set_null");

/**
 * Shorthand for a ForeignKey with set_default on delete and update.
 *
 * @returns A ForeignKey with both actions set to `set_default`.
 */
export const fkSetDefault = (): ForeignKey => foreignKey("set_default", "set_default");

/**
 * Shorthand for a ForeignKey with no_action on delete and update.
 *
 * @returns A ForeignKey with both actions set to `no_action`.
 */
export const fkNoAction = (): ForeignKey => foreignKey("no_action", "no_action");

/**
 * Creates an AppDeletionBehavior.
 *
 * @param kind - The application deletion behavior kind.
 * @param message - Optional human-readable message.
 * @returns An AppDeletionBehavior record.
 */
export const appDeletion = (kind: AppDeletion, message?: string): AppDeletionBehavior => ({
  kind,
  message,
});

// --- Graph builder ---------------------------------------------------------

/**
 * Creates a Graph record linking a set of entities and relations.
 *
 * @param name - Graph name.
 * @param entities - Entities participating in the graph.
 * @param relations - Relations connecting the entities.
 * @returns A Graph record.
 */
export const defineGraph = (
  name: string,
  entities: readonly Entity[],
  relations: readonly Relation[],
): Graph => ({
  name,
  entities,
  relations,
});

// --- Type-level inference helpers ------------------------------------------

/**
 * Extract the `From` TypeScript type from a Relation.
 *
 * @template R - The Relation type to infer from.
 */
export type InferRelationFrom<R> = R extends Relation<infer From, unknown> ? From : never;

/**
 * Extract the `To` TypeScript type from a Relation.
 *
 * @template R - The Relation type to infer from.
 */
export type InferRelationTo<R> = R extends Relation<unknown, infer To> ? To : never;

// --- Include inference ----------------------------------------------------

import type { InferEntity } from "../entity/index.ts";

/**
 * Cardinality on the `to` side of a relation. `one_to_many` and `many_to_many`
 * traverse to a collection from the perspective of the `from` entity; the rest
 * traverse to a single record (or null when `required` is false).
 */
export type ToCardinality<K extends RelationKind> = K extends "one_to_many" | "many_to_many"
  ? "many"
  : "one";

/**
 * The TypeScript shape of an included relation traversed from its `from` side.
 * `many` cardinality yields an array of the target entity's inferred shape;
 * `one` cardinality yields a single value.
 *
 * Both directions are supported: pass a relation whose `from_entity` is the
 * traversal root for forward traversal.
 */
export type IncludeValue<R> =
  R extends Relation<unknown, unknown, infer K, Entity, infer E2>
    ? ToCardinality<K> extends "many"
      ? readonly InferEntity<E2>[]
      : InferEntity<E2>
    : never;

/**
 * Embed one or more relations into an entity's inferred shape. The include map
 * pairs a friendly key with a relation; the resulting type is the entity's own
 * shape extended with one property per include, typed by the relation's
 * cardinality.
 *
 * @example
 * ```ts
 * const userPosts = oneToMany(User, Post, User.fields.id, Post.fields.user_id);
 * type UserWithPosts = WithIncludes<typeof User, { posts: typeof userPosts }>;
 * // => InferEntity<typeof User> & { readonly posts: readonly InferEntity<typeof Post>[] }
 * ```
 */
export type WithIncludes<
  E extends Entity,
  IncMap extends Readonly<Record<string, Relation>>,
> = InferEntity<E> & {
  readonly [K in keyof IncMap]: IncludeValue<IncMap[K]>;
};

/** Convenience alias: extract the `from_entity` type from a Relation. */
export type InferRelationFromEntity<R> =
  R extends Relation<unknown, unknown, RelationKind, infer E1, Entity> ? E1 : never;

/** Convenience alias: extract the `to_entity` type from a Relation. */
export type InferRelationToEntity<R> =
  R extends Relation<unknown, unknown, RelationKind, Entity, infer E2> ? E2 : never;

/** Convenience alias: extract the relation kind literal from a Relation. */
export type InferRelationKind<R> =
  R extends Relation<unknown, unknown, infer K, Entity, Entity> ? K : never;
