/* @__NO_SIDE_EFFECTS__ */
/**
 * Refs are the typed citation primitive. Every domain object that other parts of
 * the spec want to point at — fields, relations, slots, columns, etc. — is referred
 * to by a Ref rather than by string. The owner discriminates the citation's namespace
 * (Entity for FieldRef, Relation for RelationRef, etc.).
 *
 * See spec/core.allium :: entity Ref, entity RefOwner.
 */

/** Brand marker for stable, persisted IDs. */
declare const stableIdBrand: unique symbol;

/** Diagnostic codes for ref migration. */
export const refMigrationDiagnosticCodes = {
  missingStableId: "ref:missing-stable-id",
  rawStringReference: "ref:raw-string-reference",
  ambiguousStringReference: "ref:ambiguous-string-reference",
  wrongRefKind: "ref:wrong-ref-kind",
  unregisteredRef: "ref:unregistered-ref",
  renameWithoutStableId: "ref:rename-without-stable-id",
} as const;

/** Stable persisted ID for a specific semantic namespace. */
export type StableId<Kind extends string = string> = string & {
  readonly [stableIdBrand]: Kind;
};

export type EntityId = StableId<"entity">;
export type FieldId = StableId<"field">;
export type RelationId = StableId<"relation">;
export type FunctionId = StableId<"function">;
export type RuleId = StableId<"rule">;
export type PolicyId = StableId<"policy">;
export type KeyFamilyId = StableId<"key_family">;
export type ContextId = StableId<"context">;
export type ServiceId = StableId<"service">;
export type MethodId = StableId<"method">;
export type ProviderId = StableId<"provider">;
export type RouteId = StableId<"route">;
export type WorkflowId = StableId<"workflow">;
export type MigrationId = StableId<"migration">;

/** Brands a string as a stable persisted ID. */
export const stableId = <Kind extends string>(id: string): StableId<Kind> => id as StableId<Kind>;

export const entityId = (id: string): EntityId => stableId<"entity">(id);
export const fieldId = (id: string): FieldId => stableId<"field">(id);
export const relationId = (id: string): RelationId => stableId<"relation">(id);
export const functionId = (id: string): FunctionId => stableId<"function">(id);
export const ruleId = (id: string): RuleId => stableId<"rule">(id);
export const policyId = (id: string): PolicyId => stableId<"policy">(id);
export const keyFamilyId = (id: string): KeyFamilyId => stableId<"key_family">(id);
export const contextId = (id: string): ContextId => stableId<"context">(id);
export const serviceId = (id: string): ServiceId => stableId<"service">(id);
export const methodId = (id: string): MethodId => stableId<"method">(id);
export const providerId = (id: string): ProviderId => stableId<"provider">(id);
export const routeId = (id: string): RouteId => stableId<"route">(id);
export const workflowId = (id: string): WorkflowId => stableId<"workflow">(id);
export const migrationId = (id: string): MigrationId => stableId<"migration">(id);

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
  | "Function"
  | "Rule"
  | "KeyFamily"
  | "Context"
  | "Service"
  | "Method"
  | "Provider"
  | "Route"
  | "Workflow"
  | "Migration";

/** Identifies the owner of a Ref by kind and name. */
export interface RefOwner {
  readonly kind: RefOwnerKind;
  readonly name: string;
}

/** Discriminated kinds of Refs (e.g., FieldRef, RelationRef). */
export type RefKind =
  | "EntityRef"
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
  | "RuleRef"
  | "KeyFamilyRef"
  | "ContextRef"
  | "ServiceRef"
  | "MethodRef"
  | "ProviderRef"
  | "RouteRef"
  | "WorkflowRef"
  | "MigrationRef"
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
  /** Stable persisted identity. Names may change; IDs must not. */
  readonly id?: StableId<string>;
  readonly owner: RefOwner;
  readonly name: string;
  /** Human-readable type name for the value the ref points at. */
  readonly value_type: string;
  readonly value?: string;
  readonly metadata: readonly MetadataEntry[];
  status?: string;
}

export type EntityRef<E = unknown> = Ref<E> & {
  readonly kind: "EntityRef";
  readonly id?: EntityId;
};

export type FieldRef<E = unknown, Name extends string = string, Ts = unknown> = Ref<Ts> & {
  readonly kind: "FieldRef";
  readonly id?: FieldId;
  readonly _entity?: E;
  readonly _name?: Name;
};

export type RelationRef<From = unknown, To = unknown> = Ref<{ from: From; to: To }> & {
  readonly kind: "RelationRef";
  readonly id?: RelationId;
};

export type FunctionRef<In = unknown, Out = unknown, Err = never, Req = never, Eff = never> = Ref<{
  input: In;
  output: Out;
  errors: Err;
  requirements: Req;
  effects: Eff;
}> & {
  readonly kind: "FunctionRef";
  readonly id?: FunctionId;
};

export type RuleRef<Input = unknown> = Ref<Input> & {
  readonly kind: "RuleRef";
  readonly id?: RuleId;
};

export type PolicyRef<E = unknown> = Ref<E> & {
  readonly kind: "PolicyRef";
  readonly id?: PolicyId;
};

export type KeyFamilyRef<Payload = unknown> = Ref<Payload> & {
  readonly kind: "KeyFamilyRef";
  readonly id?: KeyFamilyId;
};

export type ContextRef<Ts = unknown> = Ref<Ts> & {
  readonly kind: "ContextRef";
  readonly id?: ContextId;
};

export type ServiceRefValue<Ts = unknown> = Ref<Ts> & {
  readonly kind: "ServiceRef";
  readonly id?: ServiceId;
};

export type MethodRefValue<Service = unknown, In = unknown, Out = unknown> = Ref<{
  service: Service;
  input: In;
  output: Out;
}> & {
  readonly kind: "MethodRef";
  readonly id?: MethodId;
};

export type ProviderRef<Ts = unknown> = Ref<Ts> & {
  readonly kind: "ProviderRef";
  readonly id?: ProviderId;
};

export type RouteRef<Params = unknown, Query = unknown, Loader = unknown> = Ref<{
  params: Params;
  query: Query;
  loader: Loader;
}> & {
  readonly kind: "RouteRef";
  readonly id?: RouteId;
};

export type WorkflowRef<In = unknown, Out = unknown> = Ref<{ input: In; output: Out }> & {
  readonly kind: "WorkflowRef";
  readonly id?: WorkflowId;
};

export type MigrationRef<From = unknown, To = unknown> = Ref<{ from: From; to: To }> & {
  readonly kind: "MigrationRef";
  readonly id?: MigrationId;
};

/**
 * Creates a Ref with the given identity and optional value.
 *
 * @param input - Ref properties including kind, owner, name, value type, value, and metadata.
 * @returns A Ref record.
 */
export const makeRef = <Ts = unknown>(input: {
  kind: RefKind;
  id?: StableId<string>;
  owner: RefOwner;
  name: string;
  value_type: string;
  value?: string;
  metadata?: readonly MetadataEntry[];
}): Ref<Ts> => ({
  kind: input.kind,
  id: input.id,
  owner: input.owner,
  name: input.name,
  value_type: input.value_type,
  value: input.value,
  metadata: input.metadata ?? [],
});

/** Returns the stable ID for a ref, when one is available. */
export const refId = (ref: Ref): StableId<string> | undefined => ref.id;

/** Returns stable identity when available, otherwise a legacy identity tuple. */
export const refIdentity = (ref: Ref): string =>
  ref.id ?? `${ref.kind}:${ref.owner.kind}:${ref.owner.name}:${ref.name}`;

/**
 * Strict equality on Ref identity (kind + owner + name).
 *
 * @param a - First Ref to compare.
 * @param b - Second Ref to compare.
 * @returns True if both refs have the same kind, owner kind, owner name, and name.
 */
export const refEquals = <A, B>(a: Ref<A>, b: Ref<B>): boolean =>
  a.id !== undefined && b.id !== undefined
    ? a.id === b.id
    : a.kind === b.kind &&
      a.owner.kind === b.owner.kind &&
      a.owner.name === b.owner.name &&
      a.name === b.name;
