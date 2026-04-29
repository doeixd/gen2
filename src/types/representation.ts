/* @__NO_SIDE_EFFECTS__ */
/**
 * Representations are the precise physical/wire layout under semantic types.
 * They distinguish u8 from u32, fixed_string(20) from text, and so on so that
 * adapters (Drizzle, Protobuf, Capnp, BSATN) can generate exact column types,
 * wire encodings, and check constraints.
 *
 * See spec/types.allium :: entity Representation, value RepresentationKind.
 */

import type { MetadataEntry } from "../core/index.ts";

/**
 * Discriminated kind tag for a Representation.
 *
 * Covers fixed-width integers (u8…i128), floats (f32, f64), booleans,
 * variable and fixed-length strings and bytes, and composite shapes
 * (optional, array, set, map, struct, tagged, document).
 */
export type ReprKindTag =
  | "u8"
  | "u16"
  | "u32"
  | "u64"
  | "u128"
  | "i8"
  | "i16"
  | "i32"
  | "i64"
  | "i128"
  | "f32"
  | "f64"
  | "bool"
  | "text"
  | "fixed_string"
  | "bytes"
  | "fixed_bytes"
  | "optional"
  | "array"
  | "set"
  | "map"
  | "struct"
  | "tagged"
  | "document";

/**
 * Byte order for numeric representations.
 */
export type Endianness = "little" | "big" | "native";

/**
 * Signedness of an integer representation.
 */
export type Signedness = "signed" | "unsigned";

/**
 * Text encoding used by string-like representations.
 */
export type TextEncoding = "utf8" | "utf16" | "ascii";

/**
 * Ordering position of null values in comparisons.
 */
export type NullsPosition = "first" | "last";

/**
 * Comparison semantics including total ordering and nulls position.
 */
export interface CompareSemantics {
  /** Whether the representation supports a total ordering (no NaN-like holes). */
  readonly total_ordering: boolean;
  /** Whether nulls sort before or after non-null values. */
  readonly nulls: NullsPosition;
}

/**
 * Supported aggregate operations for a numeric representation.
 */
export interface AggregateSemantics {
  /** Whether SUM is supported. */
  readonly sum_supported: boolean;
  /** Whether AVG is supported. */
  readonly avg_supported: boolean;
  /** Whether MIN is supported. */
  readonly min_supported: boolean;
  /** Whether MAX is supported. */
  readonly max_supported: boolean;
}

/**
 * A named field within a struct representation.
 */
export interface StructFieldRepr {
  /** Field name. */
  readonly name: string;
  /** Representation of the field's value. */
  readonly repr: Representation;
}

/**
 * The structural kind of a representation, possibly with inner types.
 */
export interface RepresentationKind {
  /** Discriminated kind tag. */
  readonly kind: ReprKindTag;
  /** Inner representations for composite kinds (optional, array, set, map). */
  readonly inner?: readonly Representation[];
  /** Tag value for tagged-union variants. */
  readonly variant_tag?: string;
  /** Named fields when kind is "struct". */
  readonly struct_fields?: readonly StructFieldRepr[];
  /** Map of tag values to variant representations when kind is "tagged". */
  readonly variant_map?: ReadonlyMap<string, Representation>;
}

/**
 * Precise physical/wire layout for a semantic type.
 */
export interface Representation {
  /** Representation name, often derived from the kind and parameters. */
  readonly name: string;
  /** Structural kind and optional inner types. */
  readonly kind: RepresentationKind;
  /** Byte width for fixed-size primitives. */
  readonly byte_width?: number;
  /** Signedness for integer kinds. */
  readonly signedness?: Signedness;
  /** Floating-point format description (e.g. "ieee754-single"). */
  readonly floating_point_format?: string;
  /** Text encoding for string-like kinds. */
  readonly text_encoding?: TextEncoding;
  /** Length-prefix strategy for variable-length data. */
  readonly length_prefix?: string;
  /** Whether the representation has a fixed byte width. */
  readonly fixed: boolean;
  /** Byte order for numeric kinds. */
  readonly endianness?: Endianness;
  /** Comparison semantics for ordering and null handling. */
  readonly compare?: CompareSemantics;
  /** Aggregate semantics for numeric kinds. */
  readonly aggregate?: AggregateSemantics;
  /** Additional metadata entries for adapters and codegen. */
  readonly metadata: readonly MetadataEntry[];
}

// --- Primitive integer/float reprs ----------------------------------------

const intRepr = (
  name: string,
  byte_width: number,
  signedness: Signedness,
  options: { endianness?: Endianness; sumAvg?: boolean } = {},
): Representation => ({
  name,
  kind: { kind: name as ReprKindTag },
  byte_width,
  signedness,
  fixed: true,
  endianness: options.endianness ?? "little",
  compare: { total_ordering: true, nulls: "last" },
  aggregate: {
    sum_supported: options.sumAvg ?? true,
    avg_supported: options.sumAvg ?? true,
    min_supported: true,
    max_supported: true,
  },
  metadata: [],
});

/**
 * Unsigned 8-bit integer representation.
 *
 * @returns A u8 Representation.
 */
export const u8 = (): Representation => intRepr("u8", 1, "unsigned");

/**
 * Unsigned 16-bit integer representation.
 *
 * @returns A u16 Representation.
 */
export const u16 = (): Representation => intRepr("u16", 2, "unsigned");

/**
 * Unsigned 32-bit integer representation.
 *
 * @returns A u32 Representation.
 */
export const u32 = (): Representation => intRepr("u32", 4, "unsigned");

/**
 * Unsigned 64-bit integer representation.
 *
 * @returns A u64 Representation.
 */
export const u64 = (): Representation => intRepr("u64", 8, "unsigned");

/**
 * Unsigned 128-bit integer representation.
 *
 * @returns A u128 Representation.
 */
export const u128 = (): Representation => intRepr("u128", 16, "unsigned");

/**
 * Signed 8-bit integer representation.
 *
 * @returns An i8 Representation.
 */
export const i8 = (): Representation => intRepr("i8", 1, "signed");

/**
 * Signed 16-bit integer representation.
 *
 * @returns An i16 Representation.
 */
export const i16 = (): Representation => intRepr("i16", 2, "signed");

/**
 * Signed 32-bit integer representation.
 *
 * @returns An i32 Representation.
 */
export const i32 = (): Representation => intRepr("i32", 4, "signed");

/**
 * Signed 64-bit integer representation.
 *
 * @returns An i64 Representation.
 */
export const i64 = (): Representation => intRepr("i64", 8, "signed");

/**
 * Signed 128-bit integer representation.
 *
 * @returns An i128 Representation.
 */
export const i128 = (): Representation => intRepr("i128", 16, "signed");

const floatRepr = (name: string, byte_width: number, format: string): Representation => ({
  name,
  kind: { kind: name as ReprKindTag },
  byte_width,
  fixed: true,
  endianness: "little",
  floating_point_format: format,
  // Floating point doesn't have a meaningful total ordering (NaN), so we mark
  // total_ordering false. Aggregations are still meaningful but lossy.
  compare: { total_ordering: false, nulls: "last" },
  aggregate: { sum_supported: true, avg_supported: true, min_supported: true, max_supported: true },
  metadata: [],
});

/**
 * 32-bit IEEE-754 floating point representation.
 *
 * @returns An f32 Representation.
 */
export const f32 = (): Representation => floatRepr("f32", 4, "ieee754-single");

/**
 * 64-bit IEEE-754 floating point representation.
 *
 * @returns An f64 Representation.
 */
export const f64 = (): Representation => floatRepr("f64", 8, "ieee754-double");

// --- Boolean / text / bytes ------------------------------------------------

/**
 * Boolean representation (1 byte).
 *
 * @returns A bool Representation.
 */
export const bool = (): Representation => ({
  name: "bool",
  kind: { kind: "bool" },
  byte_width: 1,
  fixed: true,
  compare: { total_ordering: true, nulls: "last" },
  aggregate: {
    sum_supported: false,
    avg_supported: false,
    min_supported: true,
    max_supported: true,
  },
  metadata: [],
});

/**
 * Variable-length text representation.
 *
 * @param options - Optional encoding and length-prefix settings.
 * @returns A text Representation.
 *
 * @example
 * ```ts
 * const utf16Text = gen.types.repr.text({ encoding: "utf16" });
 * ```
 */
export const text = (
  options: { encoding?: TextEncoding; lengthPrefix?: string } = {},
): Representation => ({
  name: "text",
  kind: { kind: "text" },
  fixed: false,
  text_encoding: options.encoding ?? "utf8",
  length_prefix: options.lengthPrefix,
  compare: { total_ordering: true, nulls: "last" },
  aggregate: {
    sum_supported: false,
    avg_supported: false,
    min_supported: true,
    max_supported: true,
  },
  metadata: [],
});

/**
 * Fixed-length string representation.
 *
 * @param length - Number of characters / bytes.
 * @param encoding - Text encoding (defaults to utf8).
 * @returns A fixed-string Representation.
 *
 * @example
 * ```ts
 * const isoCountry = gen.types.repr.fixedString(2, "ascii");
 * ```
 */
export const fixedString = (length: number, encoding: TextEncoding = "utf8"): Representation => ({
  name: `fixed_string(${length})`,
  kind: { kind: "fixed_string" },
  byte_width: length,
  fixed: true,
  text_encoding: encoding,
  compare: { total_ordering: true, nulls: "last" },
  aggregate: {
    sum_supported: false,
    avg_supported: false,
    min_supported: true,
    max_supported: true,
  },
  metadata: [],
});

/**
 * Variable-length raw bytes representation.
 *
 * @returns A bytes Representation.
 */
export const bytes = (): Representation => ({
  name: "bytes",
  kind: { kind: "bytes" },
  fixed: false,
  metadata: [],
});

/**
 * Fixed-length raw bytes representation.
 *
 * @param length - Number of bytes.
 * @returns A fixed-bytes Representation.
 *
 * @example
 * ```ts
 * const hash = gen.types.repr.fixedBytes(32);
 * ```
 */
export const fixedBytes = (length: number): Representation => ({
  name: `fixed_bytes(${length})`,
  kind: { kind: "fixed_bytes" },
  byte_width: length,
  fixed: true,
  metadata: [],
});

// --- Composite reprs -------------------------------------------------------

/**
 * Wraps a representation as optional (nullable).
 *
 * @param inner - The underlying representation.
 * @returns An optional Representation.
 *
 * @example
 * ```ts
 * const maybeInt = gen.types.repr.optional(gen.types.repr.i32());
 * ```
 */
export const optional = (inner: Representation): Representation => ({
  name: `optional(${inner.name})`,
  kind: { kind: "optional", inner: [inner] },
  fixed: false,
  metadata: [],
});

/**
 * Wraps a representation as an array.
 *
 * @param inner - The element representation.
 * @returns An array Representation.
 *
 * @example
 * ```ts
 * const intArray = gen.types.repr.array(gen.types.repr.i32());
 * ```
 */
export const array = (inner: Representation): Representation => ({
  name: `array(${inner.name})`,
  kind: { kind: "array", inner: [inner] },
  fixed: false,
  metadata: [],
});

/**
 * Wraps a representation as a set.
 *
 * @param inner - The element representation.
 * @returns A set Representation.
 *
 * @example
 * ```ts
 * const tagSet = gen.types.repr.set(gen.types.repr.text());
 * ```
 */
export const set = (inner: Representation): Representation => ({
  name: `set(${inner.name})`,
  kind: { kind: "set", inner: [inner] },
  fixed: false,
  metadata: [],
});

/**
 * Wraps key and value representations as a map.
 *
 * @param key - The key representation.
 * @param value - The value representation.
 * @returns A map Representation.
 *
 * @example
 * ```ts
 * const stringMap = gen.types.repr.map(gen.types.repr.text(), gen.types.repr.i32());
 * ```
 */
export const map = (key: Representation, value: Representation): Representation => ({
  name: `map(${key.name}, ${value.name})`,
  kind: { kind: "map", inner: [key, value] },
  fixed: false,
  metadata: [],
});

/**
 * Builds a struct representation from named fields.
 *
 * @param fields - Ordered field representations.
 * @returns A struct Representation.
 *
 * @example
 * ```ts
 * const pointRepr = gen.types.repr.struct([
 *   { name: "x", repr: gen.types.repr.i32() },
 *   { name: "y", repr: gen.types.repr.i32() },
 * ]);
 * ```
 */
export const struct = (fields: readonly StructFieldRepr[]): Representation => ({
  name: `struct(${fields.map((f) => `${f.name}:${f.repr.name}`).join(",")})`,
  kind: { kind: "struct", struct_fields: fields },
  fixed: fields.every((f) => f.repr.fixed),
  metadata: [],
});

/**
 * Builds a tagged union representation from variant mappings.
 *
 * @param variants - Map of tag values to variant representations.
 * @param variantTag - Name of the discriminant field (defaults to "tag").
 * @returns A tagged Representation.
 *
 * @example
 * ```ts
 * const eventRepr = gen.types.repr.tagged(new Map([
 *   ["created", createdRepr],
 *   ["deleted", deletedRepr],
 * ]));
 * ```
 */
export const tagged = (
  variants: ReadonlyMap<string, Representation>,
  variantTag = "tag",
): Representation => ({
  name: `tagged(${[...variants.keys()].join("|")})`,
  kind: { kind: "tagged", variant_map: variants, variant_tag: variantTag },
  fixed: false,
  metadata: [],
});

/**
 * Loose document representation (e.g. BSON, arbitrary JSON). Used for Mongo.
 *
 * @returns A document Representation.
 */
export const document = (): Representation => ({
  name: "document",
  kind: { kind: "document" },
  fixed: false,
  metadata: [],
});

// --- Invariants ------------------------------------------------------------

const NUMERIC_KINDS: readonly ReprKindTag[] = [
  "u8",
  "u16",
  "u32",
  "u64",
  "u128",
  "i8",
  "i16",
  "i32",
  "i64",
  "i128",
  "f32",
  "f64",
];

/**
 * RepresentationPrecision: numeric reprs must declare a byte_width.
 * VagueRepresentationForTarget tests this from the target's perspective.
 *
 * @param r - The representation to inspect.
 * @returns True if the representation is numeric.
 */
export const isNumericRepr = (r: Representation): boolean => NUMERIC_KINDS.includes(r.kind.kind);

/**
 * Checks whether a representation declares a precise byte width.
 *
 * @param r - The representation to inspect.
 * @returns True if the representation has a defined layout.
 */
export const hasPreciseLayout = (r: Representation): boolean => {
  if (isNumericRepr(r)) return r.byte_width != null;
  return true;
};
