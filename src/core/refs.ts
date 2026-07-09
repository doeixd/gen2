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
  duplicateStableId: "ref:duplicate-stable-id",
  unstableNameDerivedId: "ref:unstable-name-derived-id",
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

import type { KernelGraph } from "../kernel/index.ts";

/** Brands a string as a stable persisted ID. */
export const stableId = <Kind extends string>(id: string): StableId<Kind> => id as StableId<Kind>;

// === Structured ID builders =================================================

export interface EntityIdInput {
  readonly name: string;
}

export interface FieldIdInput {
  readonly entity: string;
  readonly name: string;
}

export type RelationIdInput =
  | { readonly from: string; readonly to: string; readonly name?: string }
  | { readonly name: string };

export interface NamedIdInput {
  readonly name: string;
}

export interface MethodIdInput extends NamedIdInput {
  readonly service?: string;
}

/** @deprecated Pass a structured object or use entityIdFor instead. */
export function entityId(input: string): EntityId;
export function entityId(input: EntityIdInput): EntityId;
export function entityId(input: string | EntityIdInput): EntityId {
  return typeof input === "string"
    ? stableId<"entity">(input)
    : stableId<"entity">(`entity.${input.name.toLowerCase()}`);
}

/** @deprecated Pass a structured object or use fieldIdFor instead. */
export function fieldId(input: string): FieldId;
export function fieldId(input: FieldIdInput): FieldId;
export function fieldId(input: string | FieldIdInput): FieldId {
  return typeof input === "string"
    ? stableId<"field">(input)
    : stableId<"field">(`field.${input.entity.toLowerCase()}.${input.name.toLowerCase()}`);
}

/** @deprecated Pass a structured object or use relationIdFor instead. */
export function relationId(input: string): RelationId;
export function relationId(input: RelationIdInput): RelationId;
export function relationId(input: string | RelationIdInput): RelationId {
  if (typeof input === "string") return stableId<"relation">(input);
  if ("from" in input) {
    const base = `relation.${input.from.toLowerCase()}.${input.to.toLowerCase()}`;
    return stableId<"relation">(input.name ? `${base}.${input.name.toLowerCase()}` : base);
  }
  return stableId<"relation">(`relation.${input.name.toLowerCase()}`);
}

/** @deprecated Pass a structured object or use functionIdFor instead. */
export function functionId(input: string): FunctionId;
export function functionId(input: NamedIdInput): FunctionId;
export function functionId(input: string | NamedIdInput): FunctionId {
  return typeof input === "string"
    ? stableId<"function">(input)
    : stableId<"function">(`function.${input.name}`);
}

/** @deprecated Pass a structured object or use ruleIdFor instead. */
export function ruleId(input: string): RuleId;
export function ruleId(input: NamedIdInput): RuleId;
export function ruleId(input: string | NamedIdInput): RuleId {
  return typeof input === "string"
    ? stableId<"rule">(input)
    : stableId<"rule">(`rule.${input.name.toLowerCase()}`);
}

/** @deprecated Pass a structured object or use policyIdFor instead. */
export function policyId(input: string): PolicyId;
export function policyId(input: NamedIdInput): PolicyId;
export function policyId(input: string | NamedIdInput): PolicyId {
  return typeof input === "string"
    ? stableId<"policy">(input)
    : stableId<"policy">(`policy.${input.name.toLowerCase()}`);
}

/** @deprecated Pass a structured object or use keyFamilyIdFor instead. */
export function keyFamilyId(input: string): KeyFamilyId;
export function keyFamilyId(input: NamedIdInput): KeyFamilyId;
export function keyFamilyId(input: string | NamedIdInput): KeyFamilyId {
  return typeof input === "string"
    ? stableId<"key_family">(input)
    : stableId<"key_family">(`key.${input.name.toLowerCase()}`);
}

/** @deprecated Pass a structured object or use contextIdFor instead. */
export function contextId(input: string): ContextId;
export function contextId(input: NamedIdInput): ContextId;
export function contextId(input: string | NamedIdInput): ContextId {
  return typeof input === "string"
    ? stableId<"context">(input)
    : stableId<"context">(`context.${input.name.toLowerCase()}`);
}

/** @deprecated Pass a structured object or use serviceIdFor instead. */
export function serviceId(input: string): ServiceId;
export function serviceId(input: NamedIdInput): ServiceId;
export function serviceId(input: string | NamedIdInput): ServiceId {
  return typeof input === "string"
    ? stableId<"service">(input)
    : stableId<"service">(`service.${input.name.toLowerCase()}`);
}

/** @deprecated Pass a structured object or use methodIdFor instead. */
export function methodId(input: string): MethodId;
export function methodId(input: MethodIdInput): MethodId;
export function methodId(input: string | MethodIdInput): MethodId {
  if (typeof input === "string") return stableId<"method">(input);
  if (input.service)
    return stableId<"method">(`method.${input.service.toLowerCase()}.${input.name.toLowerCase()}`);
  return stableId<"method">(`method.${input.name.toLowerCase()}`);
}

/** @deprecated Pass a structured object or use providerIdFor instead. */
export function providerId(input: string): ProviderId;
export function providerId(input: NamedIdInput): ProviderId;
export function providerId(input: string | NamedIdInput): ProviderId {
  return typeof input === "string"
    ? stableId<"provider">(input)
    : stableId<"provider">(`provider.${input.name.toLowerCase()}`);
}

/** @deprecated Pass a structured object or use routeIdFor instead. */
export function routeId(input: string): RouteId;
export function routeId(input: NamedIdInput): RouteId;
export function routeId(input: string | NamedIdInput): RouteId {
  return typeof input === "string"
    ? stableId<"route">(input)
    : stableId<"route">(`route.${input.name.toLowerCase()}`);
}

/** @deprecated Pass a structured object or use workflowIdFor instead. */
export function workflowId(input: string): WorkflowId;
export function workflowId(input: NamedIdInput): WorkflowId;
export function workflowId(input: string | NamedIdInput): WorkflowId {
  return typeof input === "string"
    ? stableId<"workflow">(input)
    : stableId<"workflow">(`workflow.${input.name.toLowerCase()}`);
}

/** @deprecated Pass a structured object or use migrationIdFor instead. */
export function migrationId(input: string): MigrationId;
export function migrationId(input: NamedIdInput): MigrationId;
export function migrationId(input: string | NamedIdInput): MigrationId {
  return typeof input === "string"
    ? stableId<"migration">(input)
    : stableId<"migration">(`migration.${input.name.toLowerCase()}`);
}

// === Object-derived ID builders (zero strings) ==============================

interface EntityLike {
  readonly name: string;
}

interface FieldLike {
  readonly name: string;
  readonly owning_entity: EntityLike;
}

interface RelationLike {
  readonly name: string;
  readonly from_entity: EntityLike;
  readonly to_entity: EntityLike;
}

interface NamedLike {
  readonly name: string;
}

interface MethodLike extends NamedLike {
  readonly service?: NamedLike;
}

export const entityIdFor = (entity: EntityLike): EntityId => entityId({ name: entity.name });

export const fieldIdFor = (field: FieldLike): FieldId =>
  fieldId({ entity: field.owning_entity.name, name: field.name });

export const relationIdFor = (relation: RelationLike): RelationId =>
  relationId({ from: relation.from_entity.name, to: relation.to_entity.name, name: relation.name });

export const namedRelationIdFor = (relation: NamedLike): RelationId =>
  relationId({ name: relation.name });

export const functionIdFor = (fn: NamedLike): FunctionId => functionId({ name: fn.name });

export const ruleIdFor = (rule: NamedLike): RuleId => ruleId({ name: rule.name });

export const policyIdFor = (policy: NamedLike): PolicyId => policyId({ name: policy.name });

export const keyFamilyIdFor = (kf: NamedLike): KeyFamilyId => keyFamilyId({ name: kf.name });

export const contextIdFor = (ctx: NamedLike): ContextId => contextId({ name: ctx.name });

export const serviceIdFor = (service: NamedLike): ServiceId => serviceId({ name: service.name });

export const methodIdFor = (method: MethodLike): MethodId =>
  method.service
    ? methodId({ service: method.service.name, name: method.name })
    : methodId({ name: method.name });

export const providerIdFor = (provider: NamedLike): ProviderId =>
  providerId({ name: provider.name });

export const routeIdFor = (route: NamedLike): RouteId => routeId({ name: route.name });

export const workflowIdFor = (workflow: NamedLike): WorkflowId =>
  workflowId({ name: workflow.name });

export const migrationIdFor = (migration: NamedLike): MigrationId =>
  migrationId({ name: migration.name });

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

// ---------------------------------------------------------------------------
// Graph-native ref extraction
// ---------------------------------------------------------------------------

/**
 * Read the typed `ref` slot from a node or edge's `metadata.custom`
 * payload. Every adapter that registers a domain object on the graph
 * stamps its ref under this slot — no opaque `_bridge*` keys
 * (PLAN.md §0.5 #8 retirement).
 */
const getRefFromCustom = (item: {
  metadata?: { custom?: Record<string, unknown> };
}): Ref | undefined => (item.metadata?.custom as { ref?: Ref } | undefined)?.ref;

/** Extract all refs from graph node and edge typed payloads. */
export const getRefsFromGraph = (graph: KernelGraph): Ref[] => {
  const refs: Ref[] = [];
  for (const node of graph.nodes.values()) {
    const ref = getRefFromCustom(node);
    if (ref) refs.push(ref);
  }
  // Relations and other domain objects that register as edges (not
  // nodes) carry their ref on the edge's typed custom payload.
  for (const edge of graph.edges.values()) {
    const ref = getRefFromCustom(edge);
    if (ref) refs.push(ref);
  }
  return refs;
};

/**
 * Look up a registered Ref by its stable ID. Walks all bridge metadata
 * stamps on nodes and edges and returns the first ref whose `id`
 * matches.
 */
export const lookupRefByIdOnGraph = (graph: KernelGraph, id: string): Ref | undefined => {
  for (const ref of getRefsFromGraph(graph)) {
    if (ref.id === id) return ref;
  }
  return undefined;
};
