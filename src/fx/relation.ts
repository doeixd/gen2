/* @__NO_SIDE_EFFECTS__ */

import {
  defineRelation,
  type Relation as RelationType,
  type ReferentialAction,
} from "../relation/index.ts";
import type { Entity, FieldOf, InferField } from "../entity/index.ts";
import type { IntegrityMode, ForeignKey, AppDeletionBehavior } from "../relation/index.ts";
import type { RelationId } from "../core/index.ts";

interface RelationOptions {
  readonly id?: RelationId;
  readonly required?: boolean;
  readonly integrity?: IntegrityMode;
  readonly foreign_key?: ForeignKey;
  readonly deletion_behavior?: AppDeletionBehavior;
}

export const Relation = {
  oneToOne: <
    E1 extends Entity,
    E2 extends Entity,
    FromField extends FieldOf<E1>,
    ToField extends FieldOf<E2>,
  >(
    from: E1,
    to: E2,
    foreignKey: FromField,
    primaryKey: ToField,
    options?: RelationOptions,
  ): RelationType<
    InferField<FromField>,
    InferField<ToField>,
    "one_to_one",
    E1,
    E2,
    FromField,
    ToField
  > =>
    defineRelation<"one_to_one", E1, E2, FromField, ToField>({
      name: `${from.name}_${to.name}`,
      kind: "one_to_one",
      from_entity: from,
      to_entity: to,
      from_field: foreignKey,
      to_field: primaryKey,
      ...options,
    }),

  oneToMany: <
    E1 extends Entity,
    E2 extends Entity,
    FromField extends FieldOf<E2>,
    ToField extends FieldOf<E1>,
  >(
    from: E1,
    to: E2,
    foreignKey: FromField,
    primaryKey: ToField,
    options?: RelationOptions,
  ): RelationType<
    InferField<FromField>,
    InferField<ToField>,
    "one_to_many",
    E1,
    E2,
    FromField,
    ToField
  > =>
    defineRelation<"one_to_many", E1, E2, FromField, ToField>({
      name: `${from.name}_${to.name}s`,
      kind: "one_to_many",
      from_entity: from,
      to_entity: to,
      from_field: foreignKey,
      to_field: primaryKey,
      ...options,
    }),

  manyToOne: <
    E1 extends Entity,
    E2 extends Entity,
    FromField extends FieldOf<E1>,
    ToField extends FieldOf<E2>,
  >(
    from: E1,
    to: E2,
    foreignKey: FromField,
    primaryKey: ToField,
    options?: RelationOptions,
  ): RelationType<
    InferField<FromField>,
    InferField<ToField>,
    "many_to_one",
    E1,
    E2,
    FromField,
    ToField
  > =>
    defineRelation<"many_to_one", E1, E2, FromField, ToField>({
      name: `${from.name}_${to.name}`,
      kind: "many_to_one",
      from_entity: from,
      to_entity: to,
      from_field: foreignKey,
      to_field: primaryKey,
      ...options,
    }),

  manyToMany: <
    E1 extends Entity,
    E2 extends Entity,
    Link extends Entity,
    LeftFk extends FieldOf<Link>,
    RightFk extends FieldOf<Link>,
  >(
    left: E1,
    right: E2,
    leftFk: LeftFk,
    rightFk: RightFk,
    linkEntity: Link,
    options?: RelationOptions,
  ): RelationType<
    InferField<LeftFk>,
    InferField<RightFk>,
    "many_to_many",
    E1,
    E2,
    LeftFk,
    RightFk
  > =>
    defineRelation<"many_to_many", E1, E2, LeftFk, RightFk>({
      name: `${left.name}_${right.name}s`,
      kind: "many_to_many",
      from_entity: left,
      to_entity: right,
      from_field: leftFk,
      to_field: rightFk,
      link_entity: linkEntity,
      ...options,
    }),

  withOnDelete:
    <const A extends ReferentialAction>(action: A) =>
    <R extends RelationType>(
      relation: R,
    ): R & {
      readonly foreign_key: {
        readonly on_delete: A;
        readonly on_update: A;
        readonly indexed: boolean;
      };
    } => {
      const existing = relation.foreign_key ?? {};
      return {
        ...relation,
        foreign_key: { ...existing, on_delete: action, on_update: action, indexed: true },
      } as unknown as R & {
        readonly foreign_key: {
          readonly on_delete: A;
          readonly on_update: A;
          readonly indexed: boolean;
        };
      };
    },

  withId:
    (id: RelationId) =>
    <R extends RelationType>(relation: R): R & { readonly id: RelationId } =>
      ({ ...relation, id }) as R & { readonly id: RelationId },
};
