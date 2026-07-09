/* @__NO_SIDE_EFFECTS__ */

import {
  type SemanticType,
  string as stringType,
  int as intType,
  bigint as bigintType,
  boolean as booleanType,
  uuid as uuidType,
  email as emailType,
  url as urlType,
  phone as phoneType,
  datetime as datetimeType,
  date as dateType,
  timestamp as timestampType,
  json as jsonType,
  money as moneyType,
  decimal as decimalType,
  bytes as bytesType,
  duration as durationType,
  enumOf as enumOfType,
  arrayOf as arrayOfType,
  literal as literalType,
  object as objectType,
  brand as brandType,
  nullable as nullableType,
  withMerge,
} from "../types/semantic.ts";
import type { MergeStrategy } from "../merge/index.ts";

export const Types = {
  string: (): SemanticType<string> => stringType(),
  int: (): SemanticType<number> => intType(),
  bigint: (): SemanticType<bigint> => bigintType(),
  boolean: (): SemanticType<boolean> => booleanType(),
  uuid: (): SemanticType<string> => uuidType(),
  email: (): SemanticType<string> => emailType(),
  url: (): SemanticType<string> => urlType(),
  phone: (): SemanticType<string> => phoneType(),
  datetime: (): SemanticType<Date> => datetimeType(),
  date: (): SemanticType<string> => dateType(),
  timestamp: (): SemanticType<Date> => timestampType(),
  json: (): SemanticType<unknown> => jsonType(),
  money: (): SemanticType<bigint> => moneyType(),
  decimal: (precision?: number, scale?: number): SemanticType<string> =>
    decimalType(precision, scale),
  bytes: (): SemanticType<Uint8Array> => bytesType(),
  duration: (): SemanticType<number> => durationType(),

  enumOf: <const V extends readonly string[]>(name: string, values: V): SemanticType<V[number]> =>
    enumOfType(name, values),

  array: <T>(inner: SemanticType<T>): SemanticType<T[]> => arrayOfType(inner),

  nullable: <T>(inner: SemanticType<T>): SemanticType<T | null> => nullableType(inner),

  brand: <Ts>(name: string, base: SemanticType<Ts>): SemanticType<Ts> => brandType(name, base),

  literal: <const V extends string | number | boolean>(value: V): SemanticType<V> =>
    literalType(value),

  object: <const F extends Record<string, SemanticType<any>>>(
    fields: F,
  ): SemanticType<{ [K in keyof F]: F[K] extends SemanticType<infer T> ? T : never }> =>
    objectType(fields),

  withMerge: <Ts>(type: SemanticType<Ts>, strategy: MergeStrategy<Ts, unknown>): SemanticType<Ts> =>
    withMerge(type, strategy),
} as const;
