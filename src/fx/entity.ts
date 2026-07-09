/* @__NO_SIDE_EFFECTS__ */

import {
  defineEntity,
  type Entity as EntityType,
  type EntityDefinitionOptions,
  type EntityFromInput,
  type FieldShapeInput,
  type FieldsRecord,
  type InferFieldFromInput,
  type TransitionGraph,
} from "../entity/index.ts";
import type { EntityId, MetadataEntry } from "../core/index.ts";
import type { AnyGraphStep } from "../kernel/index.ts";

type FxEntity<
  Name extends string = string,
  F extends FieldsRecord = FieldsRecord,
> = EntityFromInput<Name, F> & { readonly fragment: AnyGraphStep };

interface EntityMake {
  <const Name extends string>(
    name: Name,
  ): <const F extends FieldsRecord>(
    fields: F,
    options?: EntityDefinitionOptions,
  ) => FxEntity<Name, F>;

  <const Name extends string, const F extends FieldsRecord>(
    name: Name,
    fields: F,
    options?: EntityDefinitionOptions,
  ): FxEntity<Name, F>;
}

const entityMakeImpl = (
  name: string,
  fields?: FieldsRecord,
  options?: EntityDefinitionOptions,
): unknown => {
  if (fields !== undefined) return defineEntity(name, fields, options);
  return (f: FieldsRecord, o?: EntityDefinitionOptions) => defineEntity(name, f, o);
};

export const Entity = {
  make: entityMakeImpl as EntityMake,

  withStore:
    <const S extends string>(store: S) =>
    <E extends EntityType>(entity: E): E & { readonly store_name: S } =>
      ({ ...entity, store_name: store }) as E & { readonly store_name: S },

  withId:
    (id: EntityId) =>
    <E extends EntityType>(entity: E): E & { readonly id: EntityId } =>
      ({ ...entity, id }) as E & { readonly id: EntityId },

  withMetadata:
    <const M extends readonly MetadataEntry[]>(...entries: M) =>
    <E extends EntityType>(
      entity: E,
    ): E & { readonly metadata: readonly [...E["metadata"], ...M] } =>
      ({
        ...entity,
        metadata: [...entity.metadata, ...entries],
      }) as unknown as E & { readonly metadata: readonly [...E["metadata"], ...M] },

  withTransition:
    (graph: TransitionGraph) =>
    <E extends EntityType>(
      entity: E,
    ): E & { readonly transitions: readonly [...E["transitions"], TransitionGraph] } =>
      ({
        ...entity,
        transitions: [...entity.transitions, graph],
      }) as unknown as E & {
        readonly transitions: readonly [...E["transitions"], TransitionGraph];
      },

  withField:
    <const N extends string, const T extends FieldShapeInput>(name: N, type: NoInfer<T>) =>
    <E extends EntityType>(
      entity: E,
    ): EntityType<E["name"], E["fields"] & Record<N, InferFieldFromInput<T, E, N>>> => {
      const existingFields: Record<string, FieldShapeInput> = {};
      for (const f of entity.fieldList) {
        existingFields[f.name] = f.semantic_type;
      }
      const newEntity = defineEntity(
        entity.name,
        { ...existingFields, [name]: type },
        { id: entity.id, store_name: entity.store_name, metadata: entity.metadata },
      );
      return newEntity as unknown as EntityType<
        E["name"],
        E["fields"] & Record<N, InferFieldFromInput<T, E, N>>
      >;
    },

  fields: <E extends EntityType>(entity: E): E["fields"] => entity.fields,

  field: <E extends EntityType, K extends keyof E["fields"] & string>(
    entity: E,
    name: K,
  ): E["fields"][K] => entity.fields[name] as E["fields"][K],

  name: <E extends EntityType>(entity: E): E["name"] => entity.name,

  ref: <E extends EntityType>(entity: E): E["ref"] => entity.ref,
};
