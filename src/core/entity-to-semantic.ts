/* @__NO_SIDE_EFFECTS__ */
/**
 * Shared utility for converting an Entity to a struct SemanticType.
 * Used by expression builders and function DSL so both can accept
 * `SemanticType | Entity` at their boundaries.
 */

import type { Entity } from "../entity/index.ts";
import type { SemanticType } from "../types/index.ts";

/** Type predicate that distinguishes an Entity from a SemanticType. */
export const isEntity = (value: SemanticType | Entity): value is Entity => "fieldList" in value;

/**
 * Converts an Entity to a struct SemanticType, or returns the SemanticType as-is.
 *
 * @param value - Either a SemanticType or an Entity.
 * @returns A SemanticType representing the value.
 */
export const entityToSemanticType = <Ts = unknown>(
  value: SemanticType<Ts> | Entity,
): SemanticType<Ts> => {
  if (isEntity(value)) {
    return {
      name: value.name,
      kind: "struct",
      ts_type_name: value.name,
      storage_repr: {
        name: value.name,
        kind: { kind: "document" },
        fixed: false,
        metadata: [],
      },
      has_serializer: false,
      has_deserializer: false,
      server_only: false,
      traits: [],
    };
  }
  return value;
};
