/* @__NO_SIDE_EFFECTS__ */
/**
 * Semantic types are ergonomic domain concepts (gen.types.email(), gen.types.money()) layered
 * on top of precise representations. They drive TypeScript inference, validation
 * trait attachment, serializer/deserializer wiring, and codegen of column types.
 *
 * See spec/types.allium :: entity SemanticType, entity Struct, entity Tagged,
 * entity StructField, entity Serializer.
 */

import * as repr from "./representation.ts";
import type { Representation } from "./representation.ts";
import type { TypedExpression, Trait } from "./trait.ts";
import type { MergeStrategy } from "../merge/index.ts";

/**
 * Discriminated kind tag for a {@link SemanticType}.
 *
 * Covers built-in primitives (string, numeric, boolean), temporal types
 * (datetime, date, timestamp, duration), identifiers (uuid), composite
 * shapes (array, map, struct, tagged), and domain-specific concepts
 * (money, email, url, phone).
 */
export type SemanticKind =
  | "string"
  | "numeric"
  | "boolean"
  | "datetime"
  | "date"
  | "uuid"
  | "bytes"
  | "json"
  | "enum"
  | "tagged"
  | "struct"
  | "array"
  | "map"
  | "money"
  | "email"
  | "url"
  | "phone"
  | "timestamp"
  | "duration"
  | (string & { _semanticKind?: never });

/**
 * Extract the TypeScript type represented by a {@link SemanticType}.
 *
 * @example
 * ```ts
 * type T = InferType<ReturnType<typeof gen.types.string>>; // string
 * ```
 */
export type InferType<T extends SemanticType> = T extends SemanticType<infer Ts> ? Ts : never;

/**
 * An ergonomic domain type carrying storage/wire representations, traits, and metadata.
 *
 * `SemanticType` is the central abstraction of the type system: every column,
 * field, and expression has one. It links a human-friendly name (e.g. "email")
 * to a precise {@link Representation} and optionally wires up runtime
 * validation, serialization, and traits.
 */
export interface SemanticType<Ts = unknown> {
  /** Phantom type parameter linking this semantic type to its TypeScript equivalent. */
  readonly _ts?: Ts;
  /** Human-readable name, often used in codegen and error messages. */
  readonly name: string;
  /** Discriminated kind that drives which adapters and validators apply. */
  readonly kind: SemanticKind;
  /** TypeScript type name emitted during codegen (e.g. "string", "Date", "bigint"). */
  readonly ts_type_name: string;
  /** Precise physical layout used for storage (database column, file, etc.). */
  readonly storage_repr: Representation;
  /** Optional override for the on-the-wire representation (e.g. ISO string instead of i64). */
  readonly wire_repr?: Representation;
  /** Whether a serializer (semantic → wire) is defined. */
  readonly has_serializer: boolean;
  /** Whether a deserializer (wire → semantic) is defined. */
  readonly has_deserializer: boolean;
  /** When true, the type is stripped from client-facing schemas. */
  readonly server_only: boolean;
  /** Attached traits that add validation, privacy, or UI behavior. */
  readonly traits: readonly Trait[];
  /** Allowed string values when kind is "enum". */
  readonly enum_values?: readonly string[];
  /** Whether aggregation should happen on the semantic or storage representation. */
  readonly aggregate_on?: "semantic" | "storage";
  /** Optional runtime validator bridging compile-time and runtime safety. */
  readonly validate?: (value: unknown) => value is Ts;
  /** Optional merge strategy for optimistic updates, offline replay, and conflict resolution. */
  readonly merge_strategy?: MergeStrategy<Ts, unknown>;
}

/**
 * Low-level helper that fills in defaults for a {@link SemanticType}.
 *
 * Supplies `has_serializer: false`, `has_deserializer: false`,
 * `server_only: false`, and `traits: []` unless overridden.
 *
 * @param partial - Partial semantic type; `name`, `kind`, `ts_type_name`, and `storage_repr` are required.
 * @returns A complete SemanticType.
 */
export const baseSemantic = <Ts = unknown>(
  partial: Partial<SemanticType<Ts>> & {
    name: string;
    kind: SemanticKind;
    ts_type_name: string;
    storage_repr: Representation;
  },
): SemanticType<Ts> => ({
  has_serializer: false,
  has_deserializer: false,
  server_only: false,
  traits: [],
  ...partial,
});

/**
 * Attaches a merge strategy to a semantic type without mutating the original.
 *
 * @param type - The semantic type to augment.
 * @param strategy - The merge strategy to attach.
 * @returns A new semantic type with the merge strategy.
 */
export const withMerge = <Ts>(
  type: SemanticType<Ts>,
  strategy: MergeStrategy<Ts, unknown>,
): SemanticType<Ts> => ({
  ...type,
  merge_strategy: strategy,
});

// --- Built-in semantic types ----------------------------------------------

/**
 * Built-in string semantic type.
 *
 * Storage: {@link repr.text}.
 *
 * @example
 * ```ts
 * const name = gen.types.string();
 * ```
 */
export const string = (): SemanticType<string> =>
  baseSemantic<string>({
    name: "string",
    kind: "string",
    ts_type_name: "string",
    storage_repr: repr.text(),
    validate: isString,
  });

/**
 * Built-in 32-bit integer semantic type.
 *
 * Storage: {@link repr.i32}. Supports aggregation on the storage representation.
 *
 * @example
 * ```ts
 * const age = gen.types.int();
 * ```
 */
export const int = (): SemanticType<number> =>
  baseSemantic<number>({
    name: "int",
    kind: "numeric",
    ts_type_name: "number",
    storage_repr: repr.i32(),
    aggregate_on: "storage",
    validate: isInteger,
  });

/**
 * Built-in 64-bit integer semantic type.
 *
 * Storage: {@link repr.i64}. Supports aggregation on the storage representation.
 *
 * @example
 * ```ts
 * const snowflake = gen.types.bigint();
 * ```
 */
export const bigint = (): SemanticType<bigint> =>
  baseSemantic<bigint>({
    name: "bigint",
    kind: "numeric",
    ts_type_name: "bigint",
    storage_repr: repr.i64(),
    aggregate_on: "storage",
    validate: isBigint,
  });

/**
 * Built-in decimal semantic type with configurable precision and scale.
 *
 * Storage: text with a name reflecting the precision/scale.
 *
 * @param precision - Total number of digits (default 18).
 * @param scale - Digits after the decimal point (default 6).
 * @returns A decimal SemanticType.
 *
 * @example
 * ```ts
 * const price = gen.types.decimal(19, 4);
 * ```
 */
export const decimal = (precision = 18, scale = 6): SemanticType<string> =>
  baseSemantic<string>({
    name: `decimal(${precision},${scale})`,
    kind: "numeric",
    ts_type_name: "string",
    storage_repr: { ...repr.text(), name: `decimal_text(${precision},${scale})` },
    aggregate_on: "semantic",
  });

/**
 * Built-in money semantic type (cents as i64).
 *
 * Storage: {@link repr.i64}. Adapters may override the representation.
 *
 * @example
 * ```ts
 * const balance = gen.types.money();
 * ```
 */
export const money = (): SemanticType<bigint> =>
  baseSemantic<bigint>({
    name: "money",
    kind: "money",
    ts_type_name: "bigint",
    // Cents-as-i64 is a defensible default; adapters can override.
    storage_repr: repr.i64(),
    aggregate_on: "semantic",
    validate: isBigint,
  });

/**
 * Built-in boolean semantic type.
 *
 * Storage: {@link repr.bool}.
 *
 * @example
 * ```ts
 * const active = gen.types.boolean();
 * ```
 */
export const boolean = (): SemanticType<boolean> =>
  baseSemantic<boolean>({
    name: "boolean",
    kind: "boolean",
    ts_type_name: "boolean",
    storage_repr: repr.bool(),
    validate: isBoolean,
  });

/**
 * Built-in UUID semantic type.
 *
 * Storage: {@link repr.fixedBytes}(16). Includes serializer/deserializer flags.
 *
 * @example
 * ```ts
 * const id = gen.types.uuid();
 * ```
 */
export const uuid = (): SemanticType<string> =>
  baseSemantic<string>({
    name: "uuid",
    kind: "uuid",
    ts_type_name: "string",
    storage_repr: repr.fixedBytes(16),
    has_serializer: true,
    has_deserializer: true,
    validate: isString,
  });

/**
 * Built-in datetime semantic type (i64 microseconds since epoch).
 *
 * Storage: {@link repr.i64}. Includes serializer/deserializer flags.
 *
 * @example
 * ```ts
 * const createdAt = gen.types.datetime();
 * ```
 */
export const datetime = (): SemanticType<Date> =>
  baseSemantic<Date>({
    name: "datetime",
    kind: "datetime",
    ts_type_name: "Date",
    // i64 microseconds since epoch.
    storage_repr: repr.i64(),
    has_serializer: true,
    has_deserializer: true,
    validate: isDate,
  });

/**
 * Built-in date semantic type (text, e.g. "2024-01-15").
 *
 * Storage: specialized text named `date_text`. Includes serializer/deserializer flags.
 *
 * @example
 * ```ts
 * const birthDate = gen.types.date();
 * ```
 */
export const date = (): SemanticType<string> =>
  baseSemantic<string>({
    name: "date",
    kind: "date",
    ts_type_name: "string",
    storage_repr: { ...repr.text(), name: "date_text" },
    has_serializer: true,
    has_deserializer: true,
    validate: isString,
  });

/**
 * Built-in timestamp semantic type.
 *
 * Storage: {@link repr.i64}. Includes serializer/deserializer flags.
 *
 * @example
 * ```ts
 * const updatedAt = gen.types.timestamp();
 * ```
 */
export const timestamp = (): SemanticType<Date> =>
  baseSemantic<Date>({
    name: "timestamp",
    kind: "timestamp",
    ts_type_name: "Date",
    storage_repr: repr.i64(),
    has_serializer: true,
    has_deserializer: true,
    validate: isDate,
  });

/**
 * Built-in JSON semantic type.
 *
 * Storage: {@link repr.text}.
 *
 * @example
 * ```ts
 * const metadata = gen.types.json();
 * ```
 */
export const json = (): SemanticType<unknown> =>
  baseSemantic<unknown>({
    name: "json",
    kind: "json",
    ts_type_name: "unknown",
    storage_repr: repr.text(),
  });

/**
 * Built-in email semantic type.
 *
 * Storage: {@link repr.text}.
 *
 * @example
 * ```ts
 * const email = gen.types.email();
 * ```
 */
export const email = (): SemanticType<string> =>
  baseSemantic<string>({
    name: "email",
    kind: "email",
    ts_type_name: "string",
    storage_repr: repr.text(),
    validate: isString,
  });

/**
 * Built-in URL semantic type.
 *
 * Storage: {@link repr.text}.
 *
 * @example
 * ```ts
 * const homepage = gen.types.url();
 * ```
 */
export const url = (): SemanticType<string> =>
  baseSemantic<string>({
    name: "url",
    kind: "url",
    ts_type_name: "string",
    storage_repr: repr.text(),
    validate: isString,
  });

/**
 * Built-in phone semantic type.
 *
 * Storage: {@link repr.text}.
 *
 * @example
 * ```ts
 * const mobile = gen.types.phone();
 * ```
 */
export const phone = (): SemanticType<string> =>
  baseSemantic<string>({
    name: "phone",
    kind: "phone",
    ts_type_name: "string",
    storage_repr: repr.text(),
    validate: isString,
  });

/**
 * Built-in duration semantic type.
 *
 * Storage: {@link repr.i64}.
 *
 * @example
 * ```ts
 * const ttl = gen.types.duration();
 * ```
 */
export const duration = (): SemanticType<number> =>
  baseSemantic<number>({
    name: "duration",
    kind: "duration",
    ts_type_name: "number",
    storage_repr: repr.i64(),
    validate: isNumber,
  });

/**
 * Bytes type for arbitrary binary blobs.
 *
 * Storage: {@link repr.bytes}.
 *
 * @example
 * ```ts
 * const avatar = gen.types.bytes();
 * ```
 */
export const bytes = (): SemanticType<Uint8Array> =>
  baseSemantic<Uint8Array>({
    name: "bytes",
    kind: "bytes",
    ts_type_name: "Uint8Array",
    storage_repr: repr.bytes(),
    validate: isBytes,
  });

/**
 * Define an enum type from a fixed list of string values. Storage is stable
 * length text; targets that support native enums may upgrade.
 *
 * @param name - The semantic type name.
 * @param values - Allowed enum values.
 * @returns An enum SemanticType.
 *
 * @example
 * ```ts
 * const status = gen.types.enumOf("Status", ["pending", "shipped", "delivered"]);
 * ```
 */
export const enumOf = <const V extends readonly string[]>(
  name: string,
  values: V,
): SemanticType<V[number]> =>
  baseSemantic<V[number]>({
    name,
    kind: "enum",
    ts_type_name: values.map((v) => JSON.stringify(v)).join(" | "),
    storage_repr: repr.text(),
    enum_values: [...values],
  });

/**
 * Array of another semantic type.
 *
 * @param inner - The element semantic type.
 * @returns An array SemanticType.
 *
 * @example
 * ```ts
 * const tags = gen.types.arrayOf(gen.types.string());
 * ```
 */
export const arrayOf = <Ts>(inner: SemanticType<Ts>): SemanticType<Ts[]> =>
  baseSemantic<Ts[]>({
    name: `array(${inner.name})`,
    kind: "array",
    ts_type_name: `${inner.ts_type_name}[]`,
    storage_repr: repr.array(inner.storage_repr),
  });

// --- Structs and tagged unions --------------------------------------------

/**
 * A named field within a {@link Struct}.
 */
export interface StructField {
  /** Field name. */
  readonly name: string;
  /** Semantic type of the field. */
  readonly field_type: SemanticType;
}

/**
 * A structured record type composed of named fields.
 */
export interface Struct {
  /** Struct name. */
  readonly name: string;
  /** Ordered list of fields. */
  readonly fields: readonly StructField[];
}

/**
 * A tagged union of {@link Struct} variants discriminated by a tag field.
 */
export interface Tagged {
  /** Tagged union name. */
  readonly name: string;
  /** Name of the discriminant field. */
  readonly tag_field: string;
  /** Map of tag values to their corresponding struct variants. */
  readonly variants: ReadonlyMap<string, Struct>;
}

/**
 * Creates a {@link Struct} definition.
 *
 * @param name - Struct name.
 * @param fields - Ordered list of struct fields.
 * @returns A Struct record.
 *
 * @example
 * ```ts
 * const address = gen.types.struct("Address", [
 *   { name: "street", field_type: gen.types.string() },
 *   { name: "city", field_type: gen.types.string() },
 * ]);
 * ```
 */
export const struct = (name: string, fields: readonly StructField[]): Struct => ({
  name,
  fields,
});

/**
 * Creates a {@link Tagged} union definition.
 *
 * @param name - Tagged union name.
 * @param variants - Map of tag values to Struct variants.
 * @param tag_field - Name of the discriminant field (defaults to "tag").
 * @returns A Tagged record.
 *
 * @example
 * ```ts
 * const event = gen.types.tagged("Event", new Map([
 *   ["created", createdStruct],
 *   ["deleted", deletedStruct],
 * ]));
 * ```
 */
export const tagged = (
  name: string,
  variants: ReadonlyMap<string, Struct>,
  tag_field = "tag",
): Tagged => ({ name, variants, tag_field });

// --- Trait attachment ------------------------------------------------------

/**
 * Attach a trait to a semantic type, returning a new type. The trait's
 * `applies_to` (when set) must match the type's name; otherwise the
 * AttachTrait surface precondition (and InvalidTraitApplication rule)
 * flags a diagnostic.
 *
 * @param st - The semantic type to attach the trait to.
 * @param trait - The trait to attach.
 * @returns A new SemanticType with the trait appended.
 *
 * @example
 * ```ts
 * const email = gen.types.withTrait(gen.types.string(), uniqueTrait);
 * ```
 */
export const withTrait = <Ts>(st: SemanticType<Ts>, trait: Trait): SemanticType<Ts> => ({
  ...st,
  traits: [...st.traits, trait],
});

// --- Branded types ---------------------------------------------------------

/**
 * Creates a branded semantic type — a nominal wrapper around an existing type
 * that prevents accidental substitution (e.g. UserId vs OrderId both wrapping
 * uuid).
 *
 * @param name - The branded type name (e.g. "UserId").
 * @param base - The underlying semantic type to wrap.
 * @returns A new SemanticType with the same representation but distinct identity.
 *
 * @example
 * ```ts
 * const UserId = gen.types.brand("UserId", gen.types.uuid());
 * const OrderId = gen.types.brand("OrderId", gen.types.uuid());
 * ```
 */
export const brand = <Ts>(name: string, base: SemanticType<Ts>): SemanticType<Ts> =>
  baseSemantic<Ts>({
    name,
    kind: base.kind,
    ts_type_name: base.ts_type_name,
    storage_repr: base.storage_repr,
    has_serializer: base.has_serializer,
    has_deserializer: base.has_deserializer,
    server_only: base.server_only,
    traits: [...base.traits],
    enum_values: base.enum_values,
    aggregate_on: base.aggregate_on,
  });

// --- Literal type ----------------------------------------------------------

/**
 * Creates a literal semantic type representing a single fixed value.
 * Useful for tagged-union tags and discriminated types.
 *
 * @param value - The literal value (string, number, boolean).
 * @returns A SemanticType whose domain contains exactly one value.
 *
 * @example
 * ```ts
 * const tag = gen.types.literal("user_created");
 * ```
 */
export const literal = <V extends string | number | boolean>(value: V): SemanticType<V> =>
  baseSemantic<V>({
    name: JSON.stringify(value),
    kind: typeof value === "string" ? "string" : typeof value === "number" ? "numeric" : "boolean",
    ts_type_name:
      typeof value === "string"
        ? `"${value}"`
        : typeof value === "number"
          ? `${value}`
          : `${value}`,
    storage_repr:
      typeof value === "string"
        ? repr.fixedString(value.length)
        : typeof value === "number"
          ? Number.isInteger(value)
            ? repr.i32()
            : repr.f64()
          : repr.bool(),
  });

// --- Object type -----------------------------------------------------------

/**
 * Creates an inline product (object) semantic type. Objects are anonymous
 * structs — they carry no identity and are suitable for function inputs,
 * query parameters, and inline composite values.
 *
 * @param fields - Record of field names to SemanticTypes.
 * @returns A SemanticType representing the inline object shape.
 *
 * @example
 * ```ts
 * const point = gen.types.object({
 *   x: gen.types.int(),
 *   y: gen.types.int(),
 * });
 * ```
 */
export const object = <F extends Record<string, SemanticType>>(
  fields: F,
): SemanticType<{ [K in keyof F]: F[K] extends SemanticType<infer Ts> ? Ts : never }> => {
  const fieldEntries = Object.entries(fields);
  const structRepr = repr.struct(
    fieldEntries.map(([name, ft]) => ({ name, repr: (ft as SemanticType).storage_repr })),
  );
  const tsShape = fieldEntries
    .map(([name, ft]) => `${name}: ${(ft as SemanticType).ts_type_name}`)
    .join("; ");
  return baseSemantic<{ [K in keyof F]: F[K] extends SemanticType<infer Ts> ? Ts : never }>({
    name: `object({${fieldEntries.map(([n, ft]) => `${n}:${(ft as SemanticType).name}`).join(",")}})`,
    kind: "struct",
    ts_type_name: `{ ${tsShape} }`,
    storage_repr: structRepr,
  });
};

// --- Runtime validators ----------------------------------------------------

/**
 * Attach a runtime validator to a semantic type. The validator is a type predicate
 * that can be used to check values at runtime.
 *
 * @param st - The semantic type to attach the validator to.
 * @param validate - A type predicate function.
 * @returns A new SemanticType with the validator attached.
 *
 * @example
 * ```ts
 * const positiveInt = gen.types.withValidator(
 *   gen.types.int(),
 *   (v): v is number => typeof v === "number" && v > 0,
 * );
 * ```
 */
export const withValidator = <Ts>(
  st: SemanticType<Ts>,
  validate: (value: unknown) => value is Ts,
): SemanticType<Ts> => ({ ...st, validate });

/**
 * Default validator for string values.
 *
 * @param value - Value to test.
 * @returns True when `value` is a string.
 */
export const isString = (value: unknown): value is string => typeof value === "string";

/**
 * Default validator for number values.
 *
 * @param value - Value to test.
 * @returns True when `value` is a number.
 */
export const isNumber = (value: unknown): value is number => typeof value === "number";

/**
 * Default validator for integer values.
 *
 * @param value - Value to test.
 * @returns True when `value` is a finite integer.
 */
export const isInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

/**
 * Default validator for boolean values.
 *
 * @param value - Value to test.
 * @returns True when `value` is a boolean.
 */
export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/**
 * Default validator for bigint values.
 *
 * @param value - Value to test.
 * @returns True when `value` is a bigint.
 */
export const isBigint = (value: unknown): value is bigint => typeof value === "bigint";

/**
 * Default validator for Date values.
 *
 * @param value - Value to test.
 * @returns True when `value` is a `Date` instance.
 */
export const isDate = (value: unknown): value is Date => value instanceof Date;

/**
 * Default validator for Uint8Array values.
 *
 * @param value - Value to test.
 * @returns True when `value` is a `Uint8Array` instance.
 */
export const isBytes = (value: unknown): value is Uint8Array => value instanceof Uint8Array;

// --- Custom type constructors ----------------------------------------------

/**
 * Creates a custom semantic type from a full configuration. This is the
 * low-level escape hatch for domain-specific types that don't fit the built-in
 * helpers (string, int, boolean, etc.).
 *
 * @param config - Complete semantic type configuration.
 * @returns A fully configured SemanticType.
 *
 * @example
 * ```ts
 * const semver = gen.types.custom({
 *   name: "semver",
 *   kind: "string",
 *   ts_type_name: "string",
 *   storage_repr: gen.types.repr.text(),
 *   validate: isString,
 * });
 * ```
 */
export const custom = <Ts = unknown>(config: {
  name: string;
  kind: SemanticKind;
  ts_type_name: string;
  storage_repr: Representation;
  wire_repr?: Representation;
  has_serializer?: boolean;
  has_deserializer?: boolean;
  server_only?: boolean;
  traits?: readonly Trait[];
  enum_values?: readonly string[];
  aggregate_on?: "semantic" | "storage";
  validate?: (value: unknown) => value is Ts;
}): SemanticType<Ts> => baseSemantic<Ts>(config);

/**
 * Creates a reusable factory for semantic types that share a common base
 * configuration. Useful for plugin authors and domain libraries that define
 * families of related types (e.g. multiple numeric precisions, various string
 * formats).
 *
 * @param baseConfig - Shared defaults for every type produced by the factory.
 * @returns A function that creates SemanticTypes, overriding defaults per call.
 *
 * @example
 * ```ts
 * const numeric = gen.types.factory({
 *   kind: "numeric",
 *   ts_type_name: "number",
 *   storage_repr: gen.types.repr.i32(),
 * });
 * const score = numeric("score");
 * const level = numeric("level", { storage_repr: gen.types.repr.i16() });
 * ```
 */
export const factory = <Ts = unknown>(baseConfig: {
  kind: SemanticKind;
  ts_type_name: string;
  storage_repr: Representation;
  validate?: (value: unknown) => value is Ts;
}): ((
  name: string,
  overrides?: Partial<Omit<SemanticType<Ts>, "name" | "kind" | "ts_type_name">>,
) => SemanticType<Ts>) => {
  return (name, overrides = {}) =>
    baseSemantic<Ts>({
      ...baseConfig,
      ...overrides,
      name,
      kind: baseConfig.kind,
      ts_type_name: baseConfig.ts_type_name,
      storage_repr: overrides.storage_repr ?? baseConfig.storage_repr,
    });
};

/**
 * Derives a new semantic type from an existing one, overriding selected
 * properties. Preserves the underlying TypeScript type.
 *
 * @param base - The semantic type to derive from.
 * @param overrides - Properties to override.
 * @returns A new SemanticType with the merged configuration.
 *
 * @example
 * ```ts
 * const nullableEmail = gen.types.extend(
 *   gen.types.email(),
 *   { server_only: true },
 * );
 * ```
 */
export const extend = <Ts>(
  base: SemanticType<Ts>,
  overrides: Partial<Omit<SemanticType<Ts>, "kind" | "ts_type_name">>,
): SemanticType<Ts> => baseSemantic<Ts>({ ...base, ...overrides });

/**
 * Wraps a semantic type as nullable (domain includes null). The underlying
 * representation is wrapped with {@link repr.optional}.
 *
 * @param inner - The semantic type to make nullable.
 * @returns A nullable SemanticType.
 *
 * @example
 * ```ts
 * const maybeName = gen.types.nullable(gen.types.string());
 * ```
 */
export const nullable = <Ts>(inner: SemanticType<Ts>): SemanticType<Ts | null> =>
  baseSemantic<Ts | null>({
    name: `${inner.name} | null`,
    kind: inner.kind,
    ts_type_name: `${inner.ts_type_name} | null`,
    storage_repr: repr.optional(inner.storage_repr),
    has_serializer: inner.has_serializer,
    has_deserializer: inner.has_deserializer,
    server_only: inner.server_only,
    traits: [...inner.traits],
    enum_values: inner.enum_values,
    aggregate_on: inner.aggregate_on,
    validate: (value: unknown): value is Ts | null =>
      value === null || inner.validate?.(value) === true,
  });

// --- Serializers -----------------------------------------------------------

/**
 * Defines encode/decode expressions for translating between semantic and wire types.
 *
 * @example
 * ```ts
 * const isoDateSerializer = gen.types.defineSerializer(
 *   gen.types.datetime(),
 *   gen.types.string(),
 *   encodeExpr,
 *   decodeExpr,
 * );
 * ```
 */
export interface Serializer<Src = unknown, Wire = unknown> {
  /** The source semantic type (e.g. `datetime`). */
  readonly semantic_type: SemanticType<Src>;
  /** The target wire semantic type (e.g. `string`). */
  readonly wire_type: SemanticType<Wire>;
  /** Expression that encodes from semantic to wire. */
  readonly encode: TypedExpression;
  /** Expression that decodes from wire to semantic. */
  readonly decode: TypedExpression;
}

/**
 * Creates a {@link Serializer} record.
 *
 * @param semantic_type - The source semantic type.
 * @param wire_type - The target wire semantic type.
 * @param encode - Expression that encodes from semantic to wire.
 * @param decode - Expression that decodes from wire to semantic.
 * @returns A Serializer record.
 */
export const defineSerializer = <Src = unknown, Wire = unknown>(
  semantic_type: SemanticType<Src>,
  wire_type: SemanticType<Wire>,
  encode: TypedExpression,
  decode: TypedExpression,
): Serializer<Src, Wire> => ({ semantic_type, wire_type, encode, decode });
