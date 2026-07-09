/* @__NO_SIDE_EFFECTS__ */

import {
  defineStore,
  defineTable,
  defineMapping,
  fieldMapping,
  buildColumnSource,
  buildColumnTarget,
  type Store as StoreType,
  type StoreDialect,
  type Table as TableType,
  type Column as ColumnType,
  type Mapping as MappingType,
  type MappingSource,
  type MappingTarget,
} from "../storage/index.ts";
import type { Entity, Field } from "../entity/index.ts";
import {
  string as stringType,
  uuid as uuidType,
  int as intType,
  boolean as booleanType,
  datetime as datetimeType,
} from "../types/semantic.ts";
import type { SemanticType } from "../types/index.ts";

interface ColumnOptions {
  readonly primary?: boolean;
  readonly unique?: boolean;
  readonly nullable?: boolean;
  readonly default_value?: string;
}

const columnFactory =
  <T>(makeType: () => SemanticType<T>, physicalType: string) =>
  (options?: ColumnOptions): Omit<ColumnType<T>, "owning_table"> => ({
    name: "",
    physical_type: physicalType,
    semantic_type: makeType(),
    nullable: options?.nullable ?? false,
    default_value: options?.default_value,
  });

export const Column = {
  uuid: columnFactory(uuidType, "uuid"),
  string: columnFactory(stringType, "varchar"),
  int: columnFactory(intType, "int4"),
  boolean: columnFactory(booleanType, "boolean"),
  datetime: columnFactory(datetimeType, "int8"),
};

export const Store = {
  make: <const N extends string, const D extends StoreDialect>(input: {
    name: N;
    dialect: D;
    version?: string;
    capabilities?: readonly string[];
  }): StoreType & { readonly name: N; readonly dialect: D } =>
    defineStore(input) as StoreType & { readonly name: N; readonly dialect: D },
};

export const Table = {
  make: <
    S extends StoreType,
    const N extends string,
    const C extends Record<string, Omit<ColumnType<any>, "owning_table">>,
  >(
    store: S,
    name: N,
    columns: C,
  ): TableType & {
    readonly name: N;
    readonly store: S;
    readonly columns: {
      [K in keyof C]: ColumnType<
        C[K] extends Omit<ColumnType<infer T>, "owning_table"> ? T : unknown
      >;
    };
  } => {
    const columnDefs = Object.entries(columns).map(([colName, col]) => ({
      ...col,
      name: colName,
    }));
    const table = defineTable(store, name, columnDefs);
    const columnsByName: Record<string, ColumnType<any>> = {};
    for (const col of table.columns) {
      columnsByName[col.name] = col;
    }
    return Object.assign(table, { columns: columnsByName }) as unknown as TableType & {
      readonly name: N;
      readonly store: S;
      readonly columns: {
        [K in keyof C]: ColumnType<
          C[K] extends Omit<ColumnType<infer T>, "owning_table"> ? T : unknown
        >;
      };
    };
  },
};

export const MapField = {
  column: <T>(
    column: ColumnType<T>,
  ): {
    readonly read_source: MappingSource<T>;
    readonly write_target: MappingTarget<T>;
  } => ({
    read_source: buildColumnSource(column),
    write_target: buildColumnTarget(column),
  }),
};

export const Mapping = {
  make: <
    E extends Entity,
    const M extends {
      [K in keyof E["fields"]]?: {
        readonly read_source?: MappingSource;
        readonly write_target?: MappingTarget;
      };
    },
  >(
    entity: E,
    fieldMappings: M,
  ): MappingType<E> => {
    const mappings = Object.entries(fieldMappings).map(([fieldName, spec]) => {
      const field = entity.fields[fieldName] as Field;
      return fieldMapping({
        field,
        read_source: spec?.read_source,
        write_target: spec?.write_target,
      });
    });
    return defineMapping(entity, mappings);
  },
};
