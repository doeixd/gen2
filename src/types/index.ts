/**
 * Public surface of the type system.
 *
 * Re-exports representations, operations, traits, semantic types, runtimes,
 * and implementation AST nodes so consumers can import everything from
 * `gen/types`.
 */

export * as repr from "./representation.ts";
export type {
  AggregateSemantics,
  CompareSemantics,
  Endianness,
  NullsPosition,
  Representation,
  RepresentationKind,
  ReprKindTag,
  Signedness,
  StructFieldRepr,
  TextEncoding,
} from "./representation.ts";
export { hasPreciseLayout, isNumericRepr } from "./representation.ts";

export * from "./operation.ts";
export * from "./trait.ts";
export * from "./semantic.ts";
export * from "./runtime.ts";
export * from "./implementation.ts";
