/* @__NO_SIDE_EFFECTS__ */
/**
 * Refs are the typed citation primitive. Every domain object that other parts of
 * the spec want to point at — fields, relations, slots, columns, etc. — is referred
 * to by a Ref rather than by string. The owner discriminates the citation's namespace
 * (Entity for FieldRef, Relation for RelationRef, etc.).
 *
 * See spec/core.allium :: entity Ref, entity RefOwner.
 */

/** Discriminated kinds of entities that can own a Ref. */
export type RefOwnerKind =
  | "Entity"
  | "Relation"
  | "Store"
  | "Table"
  | "Column"
  | "View"
  | "Slot"
  | "Component"
  | "Form"
  | "Plugin"
  | "Target"
  | "Runtime"
  | "Operation"
  | "Trait"
  | "Theme"
  | "Behavior"
  | "Style"
  | "Policy"
  | "Event"
  | "Function";

/** Identifies the owner of a Ref by kind and name. */
export interface RefOwner {
  readonly kind: RefOwnerKind;
  readonly name: string;
}

/** Discriminated kinds of Refs (e.g., FieldRef, RelationRef). */
export type RefKind =
  | "FieldRef"
  | "RelationRef"
  | "StoreRef"
  | "TableRef"
  | "ColumnRef"
  | "SlotRef"
  | "ComponentRef"
  | "FormRef"
  | "PluginRef"
  | "TargetRef"
  | "RuntimeRef"
  | "OperationRef"
  | "TraitRef"
  | "ThemeRef"
  | "BehaviorRef"
  | "StyleRef"
  | "PolicyRef"
  | "EventRef"
  | "FunctionRef"
  | "ParamRef";

/** A single metadata key/value pair attached to a Ref. */
export interface MetadataEntry {
  readonly namespace: string;
  readonly key: string;
  readonly value: string;
}

/** Typed citation primitive pointing to a named value within an owner. */
export interface Ref<Ts = unknown> {
  /** Phantom type parameter linking this ref to its TypeScript equivalent. */
  readonly _ts?: Ts;
  readonly kind: RefKind;
  readonly owner: RefOwner;
  readonly name: string;
  /** Human-readable type name for the value the ref points at. */
  readonly value_type: string;
  readonly value?: string;
  readonly metadata: readonly MetadataEntry[];
  status?: string;
}

/**
 * Creates a Ref with the given identity and optional value.
 *
 * @param input - Ref properties including kind, owner, name, value type, value, and metadata.
 * @returns A Ref record.
 */
export const makeRef = <Ts = unknown>(input: {
  kind: RefKind;
  owner: RefOwner;
  name: string;
  value_type: string;
  value?: string;
  metadata?: readonly MetadataEntry[];
}): Ref<Ts> => ({
  kind: input.kind,
  owner: input.owner,
  name: input.name,
  value_type: input.value_type,
  value: input.value,
  metadata: input.metadata ?? [],
});

/**
 * Strict equality on Ref identity (kind + owner + name).
 *
 * @param a - First Ref to compare.
 * @param b - Second Ref to compare.
 * @returns True if both refs have the same kind, owner kind, owner name, and name.
 */
export const refEquals = <A, B>(a: Ref<A>, b: Ref<B>): boolean =>
  a.kind === b.kind &&
  a.owner.kind === b.owner.kind &&
  a.owner.name === b.owner.name &&
  a.name === b.name;
