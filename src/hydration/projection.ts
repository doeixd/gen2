/* @__NO_SIDE_EFFECTS__ */
/**
 * Safe projection and serialization contract IR for hydration and
 * cross-boundary value exposure.
 *
 * A safe projection describes how a sensitive or server-only value can be
 * transformed into a client-safe representation. A serialization contract
 * describes how a value must be validated, serialized, and redacted before
 * crossing a boundary.
 */

import type { SemanticType } from "../types/index.ts";
import type { Sensitivity } from "../requirements/index.ts";

/** Describes a safe projection from a source value to a client-safe representation. */
export interface SafeProjection<Source = unknown, Projected = unknown> {
  readonly kind: "safe_projection";
  /** Name of the source context, provider, or state resource. */
  readonly source_name: string;
  /** Semantic type of the projected (client-safe) value. */
  readonly projected_type: SemanticType<Projected>;
  /** Sensitivity of the projected value (should be less sensitive than the source). */
  readonly projected_sensitivity?: Sensitivity;
  readonly _source?: Source;
  readonly _projected?: Projected;
}

/** Describes validation, serialization, and redaction rules for a boundary crossing. */
export interface SerializationContract<T = unknown> {
  readonly kind: "serialization_contract";
  readonly value_type: SemanticType<T>;
  /** Optional serializer reference (e.g., a schema name). */
  readonly serializer?: string;
  /** Validation strictness for the serialized form. */
  readonly validation: "strict" | "lenient" | "none";
  /** Redaction policy for sensitive fields. */
  readonly redaction?: "none" | "mask" | "omit";
  readonly _value?: T;
}

export const defineSafeProjection = <Source, Projected>(input: {
  readonly source_name: string;
  readonly projected_type: SemanticType<Projected>;
  readonly projected_sensitivity?: Sensitivity;
}): SafeProjection<Source, Projected> => ({
  kind: "safe_projection",
  source_name: input.source_name,
  projected_type: input.projected_type,
  projected_sensitivity: input.projected_sensitivity,
});

export const defineSerializationContract = <T>(input: {
  readonly value_type: SemanticType<T>;
  readonly serializer?: string;
  readonly validation?: "strict" | "lenient" | "none";
  readonly redaction?: "none" | "mask" | "omit";
}): SerializationContract<T> => ({
  kind: "serialization_contract",
  value_type: input.value_type,
  serializer: input.serializer,
  validation: input.validation ?? "strict",
  redaction: input.redaction ?? "none",
});
