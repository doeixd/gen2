/* @__NO_SIDE_EFFECTS__ */
/**
 * Portable reactivity key primitives.
 *
 * Keys are static records used by future resource, invalidation, hydration, and
 * devtools layers. They intentionally do not close over runtime code.
 */

import type { Entity, Field } from "../entity/index.ts";
import type {
  ActionFunction,
  ErrorType,
  PatchExpr,
  QueryFunction,
  StaticFunction,
} from "../function/index.ts";
import { buildPatchDelete, buildPatchInsert, buildPatchUpdate } from "../function/index.ts";
import {
  diagnostic,
  hasTrait,
  keyFamilyId as makeKeyFamilyId,
  type KeyFamilyId,
  type KeyFamilyRef,
  makeArtifact,
  makeRef,
  type Artifact,
  type Diagnostic,
  type GenContext,
  type TraitKind,
} from "../core/index.ts";
import type { FallbackPlan } from "../rules/placement.ts";
import type { Event, Subscription } from "../events/index.ts";
import type { Form } from "../ui/index.ts";
import type { AppRoute } from "../router/index.ts";
import type { StateResource } from "../state/index.ts";
import type { SemanticType } from "../types/index.ts";
import { object, json } from "../types/semantic.ts";
import type { EnhancementPlan } from "../core/index.ts";

export const defineTrackingScope = <O = unknown>(
  name: string,
  scope_kind: TrackingScopeKind,
  reads: readonly (KeyExpression | ReactiveResource | QueryFunction)[],
  owner?: string,
): TrackingScope<O> => ({
  kind: "tracking_scope",
  name,
  scope_kind,
  reads,
  owner,
});

export type KeyPayload = Record<string, unknown>;

export type KeyFamilyHierarchy = "entity" | "collection" | "field" | "relation" | "view" | "custom";

export interface KeyInvalidationSemantics {
  readonly propagates_to_parents: boolean;
  readonly propagates_to_children: boolean;
  readonly batch: "microtask" | "transaction" | "target_decides";
}

export interface KeyFamily<Payload extends KeyPayload = KeyPayload> {
  readonly kind: "key_family";
  readonly id?: KeyFamilyId;
  readonly ref: KeyFamilyRef<Payload>;
  readonly name: string;
  readonly input_type?: SemanticType<Payload>;
  readonly hierarchy: KeyFamilyHierarchy;
  readonly semantics?: KeyInvalidationSemantics;
  readonly description?: string;
  readonly _payload?: Payload;
}

export interface ReactiveRegistry<
  Families extends Record<string, KeyFamily> = Record<string, KeyFamily>,
> {
  readonly kind: "reactive_registry";
  readonly name: string;
  readonly families: Families;
  readonly _families?: Families;
}

export interface ReactiveKey<Payload extends KeyPayload = KeyPayload> {
  readonly kind: "reactive_key";
  readonly family: KeyFamily<Payload>;
  readonly payload: Payload;
}

export interface ReactiveKeyPattern<Payload extends KeyPayload = KeyPayload> {
  readonly kind: "reactive_key_pattern";
  readonly family: KeyFamily<Payload>;
  readonly match: Partial<Payload> | "any";
}

export type ResourceState<Value = unknown, Err = ErrorType> =
  | { readonly status: "initial"; readonly stale: false }
  | { readonly status: "loading"; readonly stale: boolean }
  | { readonly status: "success"; readonly value: Value; readonly stale: boolean }
  | { readonly status: "refreshing"; readonly value: Value; readonly stale: true }
  | { readonly status: "failure"; readonly error: Err; readonly stale: boolean }
  | { readonly status: "defect"; readonly defect: unknown; readonly stale: boolean };

export interface RefreshPlan {
  readonly kind: "manual" | "on_mount" | "on_invalidate" | "interval";
  readonly interval_ms?: number;
}

export interface InvalidationPlan {
  readonly patterns: readonly ReactiveKeyPattern[];
}

export interface MutationKeyContext<In = unknown, Out = unknown> {
  readonly input: In;
  readonly result: Out;
}

export interface ConstantKeyExpression<Input = unknown, Payload extends KeyPayload = KeyPayload> {
  readonly kind: "constant_key_expression";
  readonly family: KeyFamily<Payload>;
  readonly payload?: Payload;
  readonly _input?: Input;
  readonly _payload?: Payload;
}

export interface StaticKeyExpression<Input = unknown, Payload extends KeyPayload = KeyPayload> {
  readonly kind: "static_key_expression";
  readonly family: KeyFamily<Payload>;
  readonly body: import("../expression/index.ts").Expr;
  readonly _input?: Input;
  readonly _payload?: Payload;
}

export type KeyExpression<Input = unknown, Payload extends KeyPayload = KeyPayload> =
  | ConstantKeyExpression<Input, Payload>
  | StaticKeyExpression<Input, Payload>;

export interface ConstantKeyPatternExpression<
  Input = unknown,
  Payload extends KeyPayload = KeyPayload,
> {
  readonly kind: "constant_key_pattern_expression";
  readonly family: KeyFamily<Payload>;
  readonly patterns: readonly ReactiveKeyPattern<Payload>[];
  readonly _input?: Input;
  readonly _payload?: Payload;
}

export interface StaticKeyPatternExpression<
  Input = unknown,
  Payload extends KeyPayload = KeyPayload,
> {
  readonly kind: "static_key_pattern_expression";
  readonly family: KeyFamily<Payload>;
  readonly body: import("../expression/index.ts").Expr;
  readonly _input?: Input;
  readonly _payload?: Payload;
}

export type KeyPatternExpression<Input = unknown, Payload extends KeyPayload = KeyPayload> =
  | ConstantKeyPatternExpression<Input, Payload>
  | StaticKeyPatternExpression<Input, Payload>;

export type ResourceBackend = "memory" | "url_search_params" | "local_storage" | "session_storage";

export interface ResourceBinding {
  readonly kind: "resource_binding";
  readonly backend: ResourceBackend;
  readonly sync: "one_way" | "two_way";
  readonly key?: string; // Optional custom key in the backend
}

export interface BaseResource<
  In = unknown,
  Value = unknown,
  Err = ErrorType,
  Req = unknown,
  Eff = unknown,
> {
  readonly name: string;
  readonly query: QueryFunction<In, Value, any, Err, Req, Eff>;
  readonly refresh: readonly RefreshPlan[];
  readonly enhancement?: EnhancementPlan;
  readonly bindings?: readonly ResourceBinding[];
  readonly traits?: readonly TraitKind[];
  readonly symbol?: import("../core/index.ts").SymbolMetadata;
  readonly _input?: In;
  readonly _value?: Value;
  readonly _error?: Err;
  readonly _requires?: Req;
  readonly _effects?: Eff;
}

export interface ReactiveResource<
  In = unknown,
  Value = unknown,
  Err = ErrorType,
  Req = unknown,
  Eff = unknown,
> extends BaseResource<In, Value, Err, Req, Eff> {
  readonly kind: "reactive_resource";
}

export interface PullResource<
  In = unknown,
  Value = unknown,
  Err = ErrorType,
  Req = unknown,
  Eff = unknown,
> extends BaseResource<In, Value, Err, Req, Eff> {
  readonly kind: "pull_resource";
}

export interface InfiniteResource<
  In = unknown,
  Value = unknown,
  Err = ErrorType,
  Req = unknown,
  Eff = unknown,
> extends BaseResource<In, Value, Err, Req, Eff> {
  readonly kind: "infinite_resource";
  readonly cursor_field: Field;
}

export interface StreamResource<
  In = unknown,
  Value = unknown,
  Err = ErrorType,
  Req = unknown,
  Eff = unknown,
> extends BaseResource<In, Value, Err, Req, Eff> {
  readonly kind: "stream_resource";
  readonly stream_type: "sse" | "websocket" | "webrtc";
  readonly disposal_policy?: "auto" | "manual" | "deferred";
}

/** A derived resource computed from dependencies without a query backend. */
export interface DerivedResource<Value = unknown, Err = ErrorType> {
  readonly kind: "derived_resource";
  readonly name: string;
  readonly dependencies: readonly (
    | KeyExpression
    | ReactiveKey
    | ReactiveResource
    | DerivedResource
  )[];
  readonly output_type: SemanticType<Value>;
  readonly resource_state: "reactive" | "pull" | "infinite" | "stream";
  readonly traits?: readonly TraitKind[];
  readonly symbol?: import("../core/index.ts").SymbolMetadata;
  readonly _value?: Value;
  readonly _error?: Err;
}

/** Static cleanup IR for scoped resources. */
export interface Finalizer {
  readonly kind: "finalizer";
  readonly name: string;
  readonly cleanup: "invalidate" | "unsubscribe" | "dispose" | "custom";
  /** True if the cleanup is target-specific and not portable. */
  readonly target_specific?: boolean;
}

/** A scoped resource with lifecycle owner and cleanup semantics. */
export interface ScopedResource<Source extends AnyResource = AnyResource> {
  readonly kind: "scoped_resource";
  readonly name: string;
  readonly source: Source;
  readonly owner: string;
  readonly finalizers: readonly Finalizer[];
  readonly refresh_policy?: "on_invalidate" | "on_mount" | "manual";
  readonly disposal_policy?: "auto" | "manual" | "deferred";
}

/** Runtime environment for reactive resources (e.g., SSR, edge, client). */
export interface ReactiveRuntime {
  readonly kind: "reactive_runtime";
  readonly name: string;
  readonly environment: "server" | "client" | "edge" | "ssr";
  readonly capabilities: readonly string[];
  readonly fallback_runtime?: string;
}

/** Service layer grouping related resources and their lifecycle. */
export interface ServiceLayer {
  readonly kind: "service_layer";
  readonly name: string;
  readonly resources: readonly AnyResource[];
  readonly mutations?: readonly ReactiveMutation[];
  readonly runtime?: ReactiveRuntime;
  readonly scoped?: readonly ScopedResource[];
}

/** A requirement that expresses a lifecycle constraint (mount, unmount, cleanup). */
export interface LifecycleRequirement {
  readonly kind: "lifecycle_requirement";
  readonly name: string;
  readonly constraint: "mount" | "unmount" | "cleanup" | "refresh";
  readonly target_resource: string;
  readonly owner?: string;
  readonly finalizers?: readonly Finalizer[];
}

export type AnyResource =
  | ReactiveResource<any, any, any, any, any>
  | PullResource<any, any, any, any, any>
  | InfiniteResource<any, any, any, any, any>
  | StreamResource<any, any, any, any, any>;

export interface ReactiveMutation<
  In = unknown,
  Out = unknown,
  Err = ErrorType,
  Req = unknown,
  Eff = unknown,
> {
  readonly kind: "reactive_mutation";
  readonly name: string;
  readonly action: ActionFunction<In, Out, Err, Req, Eff>;
  readonly invalidates: InvalidationPlan;
  readonly optimistic?: OptimisticPlan<In, Out>;
  readonly traits?: readonly TraitKind[];
  readonly symbol?: import("../core/index.ts").SymbolMetadata;
  readonly _input?: In;
  readonly _output?: Out;
  readonly _error?: Err;
  readonly _requires?: Req;
  readonly _effects?: Eff;
}

export interface ResourceAll<
  Branches extends Record<string, AnyResource> = Record<string, AnyResource>,
  Req = unknown,
  Eff = unknown,
> {
  readonly kind: "resource_all";
  readonly name: string;
  readonly branches: Branches;
  readonly mode: "parallel" | "target_decides";
  readonly _branches?: Branches;
  readonly _requires?: Req;
  readonly _effects?: Eff;
}

export interface ResourceChain<
  SourceIn = unknown,
  SourceValue = unknown,
  NextIn = unknown,
  NextValue = unknown,
  SourceErr = ErrorType,
  NextErr = ErrorType,
  Req = unknown,
  Eff = unknown,
> {
  readonly kind: "resource_chain";
  readonly name: string;
  readonly source: AnyResource;
  readonly derive_next: StaticFunction<SourceValue, NextIn>;
  readonly next_resource: AnyResource;
  readonly _source_in?: SourceIn;
  readonly _source_value?: SourceValue;
  readonly _next_in?: NextIn;
  readonly _next_value?: NextValue;
  readonly _source_err?: SourceErr;
  readonly _next_err?: NextErr;
  readonly _requires?: Req;
  readonly _effects?: Eff;
}

export interface OptimisticPlan<In = unknown, Out = unknown> {
  readonly kind: "optimistic_plan";
  readonly apply: PatchExpr;
  readonly rollback: PatchExpr;
  readonly reconcile?: PatchExpr;
  readonly fallback: FallbackPlan;
  readonly diagnostics: readonly Diagnostic[];
  readonly temp_id_strategy?: "auto" | "uuid" | "client" | "server";
  readonly affected_keys?: readonly KeyExpression[];
  readonly affected_resources?: readonly string[];
  readonly safety_classification?: "safe" | "degraded" | "unsafe";
  readonly operation_laws?: {
    readonly associative?: boolean;
    readonly commutative?: boolean;
    readonly idempotent?: boolean;
    readonly invertible?: boolean;
    readonly monotonic?: boolean;
  };
  readonly old_value?: unknown;
  readonly target?: AnyResource;
  readonly _input?: In;
  readonly _output?: Out;
}

export type ReactiveGraphNodeKind =
  | "entity"
  | "key_family"
  | "query_function"
  | "action_function"
  | "resource"
  | "mutation"
  | "resource_all"
  | "resource_chain"
  | "route"
  | "app_route"
  | "form"
  | "event"
  | "subscription"
  | "tracking_scope"
  | "state_resource"
  | "derived_resource";

export interface ReactiveGraphNode {
  readonly id: string;
  readonly kind: ReactiveGraphNodeKind;
  readonly name: string;
  readonly traits?: readonly string[];
  readonly stable_id?: string;
  readonly previous_names?: readonly string[];
  readonly renamed_from?: readonly string[];
  readonly scope_kind?: TrackingScopeKind;
  readonly owner?: string;
  readonly call_plan?: import("../core/index.ts").CallPlan;
  readonly symbol?: import("../core/index.ts").SymbolMetadata;
  readonly resource_type?: "reactive" | "pull" | "infinite" | "stream" | "derived";
  readonly bindings?: readonly ResourceBinding[];
}

export type DerivationConfidence = "declared" | "derived" | "conservative";
export type DerivationPrecision = "exact" | "matched" | "broad" | "unknown";

export interface ReadDependency<E extends Entity = Entity, F extends Field = Field> {
  readonly kind: "read_dependency";
  readonly source: "query_body" | "projection" | "join";
  readonly entity: E;
  readonly fields?: readonly F[];
}

export interface WriteDependency<E extends Entity = Entity, F extends Field = Field> {
  readonly kind: "write_dependency";
  readonly operation: "insert" | "update" | "delete";
  readonly entity: E;
  readonly fields?: readonly F[];
}

export interface DerivedInvalidation<Payload extends KeyPayload = KeyPayload> {
  readonly kind: "derived_invalidation";
  readonly family: KeyFamily<Payload>;
  readonly pattern: ReactiveKeyPattern<Payload>;
  readonly confidence: DerivationConfidence;
  readonly precision: DerivationPrecision;
}

export type TrackingScopeKind =
  | "render"
  | "memo"
  | "loader"
  | "resource"
  | "effect"
  | "action"
  | "form"
  | "route";

export interface TrackingScope<Owner = unknown> {
  readonly kind: "tracking_scope";
  readonly name: string;
  readonly scope_kind: TrackingScopeKind;
  readonly reads: readonly (KeyExpression | ReactiveResource | QueryFunction)[];
  readonly owner?: string;
  readonly _owner?: Owner; // Phantom type for type safety
}

export interface TrackingScopeNode {
  readonly kind: "tracking_scope";
  readonly id: string;
  readonly name: string;
  readonly scope_kind: TrackingScopeKind;
  readonly owner?: string;
}

export interface ScopeReadsKeyEdge {
  readonly kind: "scope_reads_key";
  readonly from: string; // scope id
  readonly to: string; // key id
}

export interface ScopeReadsQueryEdge {
  readonly kind: "scope_reads_query";
  readonly from: string; // scope id
  readonly to: string; // query id
}

export interface ScopeReadsKeyEdge {
  readonly kind: "scope_reads_key";
  readonly from: string; // scope id
  readonly to: string; // key id
}

export interface ScopeReadsQueryEdge {
  readonly kind: "scope_reads_query";
  readonly from: string; // scope id
  readonly to: string; // query id
}

export interface ReadsKeyEdge {
  readonly kind: "reads_key";
  readonly from: string;
  readonly to: string;
  readonly key: KeyExpression;
  readonly confidence?: DerivationConfidence;
}

export interface WritesEntityEdge {
  readonly kind: "writes_entity";
  readonly from: string;
  readonly to: string;
  readonly confidence?: DerivationConfidence;
}

export interface InvalidatesKeyEdge {
  readonly kind: "invalidates_key";
  readonly from: string;
  readonly to: string;
  readonly pattern: ReactiveKeyPattern;
  readonly expression?: KeyPatternExpression;
  readonly confidence?: DerivationConfidence;
  readonly precision?: DerivationPrecision;
}

export interface WrapsQueryEdge {
  readonly kind: "wraps_query";
  readonly from: string;
  readonly to: string;
}

export interface WrapsActionEdge {
  readonly kind: "wraps_action";
  readonly from: string;
  readonly to: string;
}

export interface ComposesResourceEdge {
  readonly kind: "composes_resource";
  readonly from: string;
  readonly to: string;
}

export interface ReadsResourceEdge {
  readonly kind: "reads_resource";
  readonly from: string;
  readonly to: string;
}

export interface RouteLoadsEdge {
  readonly kind: "route_loads";
  readonly from: string;
  readonly to: string;
}

export interface RouteSubmitsEdge {
  readonly kind: "route_submits";
  readonly from: string;
  readonly to: string;
}

export interface FormSubmitsEdge {
  readonly kind: "form_submits";
  readonly from: string;
  readonly to: string;
}

export interface EmitsEventEdge {
  readonly kind: "emits_event";
  readonly from: string;
  readonly to: string;
}

export interface SubscribesEventEdge {
  readonly kind: "subscribes_event";
  readonly from: string;
  readonly to: string;
}

export interface ReadsStateEdge {
  readonly kind: "reads_state";
  readonly from: string;
  readonly to: string;
}

export interface WritesStateEdge {
  readonly kind: "writes_state";
  readonly from: string;
  readonly to: string;
}

export interface HydratesStateEdge {
  readonly kind: "hydrates_state";
  readonly from: string;
  readonly to: string;
}

export interface ScopeReadsKeyEdge {
  readonly kind: "scope_reads_key";
  readonly from: string; // scope id
  readonly to: string; // key id
}

export interface ScopeReadsQueryEdge {
  readonly kind: "scope_reads_query";
  readonly from: string; // scope id
  readonly to: string; // query id
}

export interface ScopeReadsKeyEdge {
  readonly kind: "scope_reads_key";
  readonly from: string; // scope id
  readonly to: string; // key id
}

export interface ScopeReadsQueryEdge {
  readonly kind: "scope_reads_query";
  readonly from: string; // scope id
  readonly to: string; // query id
}

export interface ScopeReadsKeyEdge {
  readonly kind: "scope_reads_key";
  readonly from: string; // scope id
  readonly to: string; // key id
}

export interface ScopeReadsQueryEdge {
  readonly kind: "scope_reads_query";
  readonly from: string; // scope id
  readonly to: string; // query id
}

export type ReactiveGraphEdge =
  | ReadsKeyEdge
  | WritesEntityEdge
  | InvalidatesKeyEdge
  | WrapsQueryEdge
  | WrapsActionEdge
  | ComposesResourceEdge
  | ReadsResourceEdge
  | RouteLoadsEdge
  | RouteSubmitsEdge
  | FormSubmitsEdge
  | EmitsEventEdge
  | SubscribesEventEdge
  | ReadsStateEdge
  | WritesStateEdge
  | HydratesStateEdge
  | ScopeReadsKeyEdge
  | ScopeReadsQueryEdge;

export type ReactiveGraphEdgeKind = ReactiveGraphEdge["kind"];

export interface ReactiveGraph {
  readonly kind: "reactive_graph";
  readonly nodes: readonly ReactiveGraphNode[];
  readonly edges: readonly ReactiveGraphEdge[];
}

export type InferKeyPayload<K> =
  K extends KeyFamily<infer Payload>
    ? Payload
    : K extends ReactiveKey<infer Payload>
      ? Payload
      : K extends ReactiveKeyPattern<infer Payload>
        ? Payload
        : never;

export type InferKeyFamilyInput<KF> = KF extends KeyFamily<infer Payload> ? Payload : never;
export type InferResourceInput<R> =
  R extends ReactiveResource<infer In, unknown, unknown> ? In : never;
export type InferResourceValue<R> =
  R extends ReactiveResource<unknown, infer Value, unknown> ? Value : never;
export type InferResourceState<R> =
  R extends ReactiveResource<unknown, infer Value, infer Err> ? ResourceState<Value, Err> : never;
export type InferMutationInput<M> =
  M extends ReactiveMutation<infer In, unknown, unknown> ? In : never;
export type InferMutationOutput<M> =
  M extends ReactiveMutation<unknown, infer Out, unknown> ? Out : never;
export type InferMutationErrors<M> =
  M extends ReactiveMutation<unknown, unknown, infer Err> ? Err : never;

export type InferResourceAllBranches<R> = R extends ResourceAll<infer Branches> ? Branches : never;

export type InferResourceAllValues<R> =
  R extends ResourceAll<infer Branches>
    ? { [K in keyof Branches]: InferResourceValue<Branches[K]> }
    : never;

export type InferResourceAllErrors<R> =
  R extends ResourceAll<infer Branches>
    ? {
        [K in keyof Branches]: Branches[K] extends ReactiveResource<unknown, unknown, infer Err>
          ? Err
          : never;
      }
    : never;

export type InferResourceChainOutput<R> =
  R extends ResourceChain<unknown, unknown, unknown, infer NextValue, unknown, unknown>
    ? NextValue
    : never;

export type InferResourceChainSourceValue<R> =
  R extends ResourceChain<unknown, infer SourceValue, unknown, unknown, unknown, unknown>
    ? SourceValue
    : never;

export type InferResourceChainErrors<R> =
  R extends ResourceChain<unknown, unknown, unknown, unknown, infer SourceErr, infer NextErr>
    ? SourceErr | NextErr
    : never;

export type InferReactiveRegistryFamilies<R> =
  R extends ReactiveRegistry<infer Families> ? Families : never;

export type InferRegistryFamily<R, K extends keyof InferReactiveRegistryFamilies<R>> =
  R extends ReactiveRegistry<infer Families>
    ? K extends keyof Families
      ? Families[K]
      : never
    : never;

export const defaultKeyInvalidationSemantics = (
  hierarchy: KeyFamilyHierarchy,
): KeyInvalidationSemantics => {
  switch (hierarchy) {
    case "entity":
      return { propagates_to_parents: true, propagates_to_children: false, batch: "microtask" };
    case "collection":
      return { propagates_to_parents: false, propagates_to_children: true, batch: "transaction" };
    case "field":
      return { propagates_to_parents: true, propagates_to_children: false, batch: "microtask" };
    case "relation":
      return { propagates_to_parents: true, propagates_to_children: true, batch: "target_decides" };
    case "view":
      return {
        propagates_to_parents: false,
        propagates_to_children: false,
        batch: "target_decides",
      };
    case "custom":
      return {
        propagates_to_parents: false,
        propagates_to_children: false,
        batch: "target_decides",
      };
  }
};

export const defineKeyFamily = <const Payload extends KeyPayload = KeyPayload>(
  name: string,
  options: {
    readonly id?: KeyFamilyId;
    readonly description?: string;
    readonly input?: SemanticType<Payload>;
    readonly hierarchy?: KeyFamilyHierarchy;
    readonly semantics?: KeyInvalidationSemantics;
  } = {},
): KeyFamily<Payload> => {
  const hierarchy = options.hierarchy ?? "custom";
  return {
    kind: "key_family",
    id: options.id,
    ref: makeRef<Payload>({
      kind: "KeyFamilyRef",
      id: options.id,
      owner: { kind: "KeyFamily", name },
      name,
      value_type: "key_family",
    }) as KeyFamilyRef<Payload>,
    name,
    input_type: options.input,
    hierarchy,
    semantics: options.semantics ?? defaultKeyInvalidationSemantics(hierarchy),
    description: options.description,
  };
};

export const key = <const Payload extends KeyPayload>(
  family: KeyFamily<Payload>,
  payload: Payload,
): ReactiveKey<Payload> => ({
  kind: "reactive_key",
  family,
  payload,
});

export const anyKey = <Payload extends KeyPayload>(
  family: KeyFamily<Payload>,
): ReactiveKeyPattern<Payload> => ({
  kind: "reactive_key_pattern",
  family,
  match: "any",
});

export const matchKey = <Payload extends KeyPayload>(
  family: KeyFamily<Payload>,
  match: Partial<Payload>,
): ReactiveKeyPattern<Payload> => ({
  kind: "reactive_key_pattern",
  family,
  match,
});

export const entityKeyFamily = <E extends Entity>(
  entity: E,
): KeyFamily<{ readonly id: string }> => {
  const idField = entity.fields["id"];
  return defineKeyFamily<{ readonly id: string }>(`${entity.name}:entity`, {
    id: makeKeyFamilyId(`key.${entity.ref.id ?? entity.name}.entity`),
    hierarchy: "entity",
    input: idField ? object({ id: idField.semantic_type as SemanticType<string> }) : undefined,
    ...({ _entity: entity } as any),
  });
};

export const collectionKeyFamily = <E extends Entity>(
  entity: E,
): KeyFamily<{ readonly filters?: KeyPayload }> =>
  defineKeyFamily<{ readonly filters?: KeyPayload }>(`${entity.name}:collection`, {
    id: makeKeyFamilyId(`key.${entity.ref.id ?? entity.name}.collection`),
    hierarchy: "collection",
    input: object({ filters: json() }),
    ...({ _entity: entity } as any),
  });

export const customKeyFamily = defineKeyFamily;

export const defineReactiveRegistry = <const Families extends Record<string, KeyFamily>>(
  name: string,
  families: Families,
): ReactiveRegistry<Families> => ({
  kind: "reactive_registry",
  name,
  families,
});

export const refreshManual = (): RefreshPlan => ({ kind: "manual" });

export const refreshOnMount = (): RefreshPlan => ({ kind: "on_mount" });

export const refreshOnInvalidate = (): RefreshPlan => ({ kind: "on_invalidate" });

export const refreshInterval = (interval_ms: number): RefreshPlan => ({
  kind: "interval",
  interval_ms,
});

export const invalidates = (patterns: readonly ReactiveKeyPattern[]): InvalidationPlan => ({
  patterns,
});

export const keyExpr = <Input = unknown, Payload extends KeyPayload = KeyPayload>(
  family: KeyFamily<Payload>,
  payload?: Payload,
): ConstantKeyExpression<Input, Payload> => ({
  kind: "constant_key_expression",
  family,
  payload,
});

export const keyPatternExpr = <Input = unknown, Payload extends KeyPayload = KeyPayload>(
  family: KeyFamily<Payload>,
  patterns: readonly ReactiveKeyPattern<Payload>[],
): ConstantKeyPatternExpression<Input, Payload> => ({
  kind: "constant_key_pattern_expression",
  family,
  patterns,
});

export const defineReactiveResource = <
  In = unknown,
  Value = unknown,
  Err = ErrorType,
  Req = unknown,
  Eff = unknown,
>(input: {
  readonly name: string;
  readonly query: QueryFunction<In, Value, any, Err, Req, Eff>;
  readonly refresh?: readonly RefreshPlan[];
  readonly enhancement?: EnhancementPlan;
}): ReactiveResource<In, Value, Err, Req, Eff> => ({
  kind: "reactive_resource",
  name: input.name,
  query: input.query,
  refresh: input.refresh ?? [refreshOnInvalidate()],
  enhancement: input.enhancement,
  traits: ["named", "readable", "reactive"],
});

export const defineStreamResource = <
  In = unknown,
  Value = unknown,
  Err = ErrorType,
  Req = unknown,
  Eff = unknown,
>(input: {
  readonly name: string;
  readonly query: QueryFunction<In, Value, any, Err, Req, Eff>;
  readonly stream_type: "sse" | "websocket" | "webrtc";
  readonly refresh?: readonly RefreshPlan[];
  readonly enhancement?: EnhancementPlan;
  readonly disposal_policy?: "auto" | "manual" | "deferred";
}): StreamResource<In, Value, Err, Req, Eff> => ({
  kind: "stream_resource",
  name: input.name,
  query: input.query,
  stream_type: input.stream_type,
  refresh: input.refresh ?? [refreshOnInvalidate()],
  enhancement: input.enhancement,
  disposal_policy: input.disposal_policy,
  traits: ["named", "readable", "reactive"],
});

export const defineReactiveMutation = <
  In = unknown,
  Out = unknown,
  Err = ErrorType,
  Req = unknown,
  Eff = unknown,
>(input: {
  readonly name: string;
  readonly action: ActionFunction<In, Out, Err, Req, Eff>;
  readonly invalidates?: InvalidationPlan;
  readonly optimistic?: OptimisticPlan<In, Out>;
}): ReactiveMutation<In, Out, Err, Req, Eff> => {
  const patterns: readonly ReactiveKeyPattern[] =
    input.invalidates?.patterns ??
    (input.action.reactivity?.invalidates ?? []).flatMap((expr) =>
      expr.kind === "constant_key_pattern_expression" ? expr.patterns : [],
    );
  return {
    kind: "reactive_mutation",
    name: input.name,
    action: input.action,
    invalidates: { patterns },
    optimistic: input.optimistic,
    traits: ["named", "writable", "effectful", "reactive"],
  };
};

export const defineOptimisticPlan = <In = unknown, Out = unknown>(input: {
  readonly apply: PatchExpr;
  readonly rollback: PatchExpr;
  readonly reconcile?: PatchExpr;
  readonly fallback: FallbackPlan;
  readonly diagnostics?: readonly Diagnostic[];
  readonly temp_id_strategy?: "auto" | "uuid" | "client" | "server";
  readonly affected_keys?: readonly KeyExpression[];
  readonly affected_resources?: readonly string[];
  readonly safety_classification?: "safe" | "degraded" | "unsafe";
  readonly operation_laws?: {
    readonly associative?: boolean;
    readonly commutative?: boolean;
    readonly idempotent?: boolean;
    readonly invertible?: boolean;
    readonly monotonic?: boolean;
  };
}): OptimisticPlan<In, Out> => ({
  kind: "optimistic_plan",
  apply: input.apply,
  rollback: input.rollback,
  reconcile: input.reconcile,
  fallback: input.fallback,
  diagnostics: input.diagnostics ?? [],
  temp_id_strategy: input.temp_id_strategy,
  affected_keys: input.affected_keys,
  affected_resources: input.affected_resources,
  safety_classification: input.safety_classification,
  operation_laws: input.operation_laws,
});

const findEntityQuery = (
  entity: Entity,
  queries: readonly QueryFunction[],
): QueryFunction | undefined =>
  queries.find((q) => q.body.source.kind === "entity_source" && q.body.source.entity === entity);

export const deriveDefaultOptimisticPlan = <In = unknown, Out = unknown>(
  action: ActionFunction<In, Out>,
  ctx: GenContext,
): OptimisticPlan<In, Out> | undefined => {
  const ops = action.body.operations;
  if (ops.length !== 1) return undefined;

  const op = ops[0]!;
  if (op.kind === "invalidate_op") return undefined;

  const query = findEntityQuery(op.target, ctx.query_functions);
  if (query === undefined) return undefined;

  const values = [...op.values.entries()];

  switch (op.kind) {
    case "insert_op": {
      const apply = buildPatchInsert(query.body, values);
      const rollback = buildPatchDelete(query.body);
      return defineOptimisticPlan<In, Out>({
        apply,
        rollback,
        fallback: { kind: "degrade_to_hint", reason: "rollback is coarse for insert" },
        diagnostics: [
          diagnostic({
            severity: "warning",
            code: "reactivity:optimistic-unreconcilable",
            message: `Optimistic rollback for insert action ${action.name} is coarse; consider providing an explicit OptimisticPlan`,
          }),
        ],
      });
    }
    case "delete_op": {
      const apply = buildPatchDelete(query.body);
      const rollback = buildPatchInsert(query.body, []);
      return defineOptimisticPlan<In, Out>({
        apply,
        rollback,
        fallback: { kind: "degrade_to_hint", reason: "rollback values unavailable for delete" },
        diagnostics: [
          diagnostic({
            severity: "warning",
            code: "reactivity:optimistic-unreconcilable",
            message: `Optimistic rollback for delete action ${action.name} cannot restore deleted values; consider providing an explicit OptimisticPlan`,
          }),
        ],
      });
    }
    case "update_op": {
      const apply = buildPatchUpdate(query.body, values);
      const rollback = buildPatchUpdate(query.body, values);
      return defineOptimisticPlan<In, Out>({
        apply,
        rollback,
        fallback: {
          kind: "degrade_to_hint",
          reason: "rollback cannot invert update values statically",
        },
        diagnostics: [
          diagnostic({
            severity: "warning",
            code: "reactivity:optimistic-unreconcilable",
            message: `Optimistic rollback for update action ${action.name} cannot derive inverse values; consider providing an explicit OptimisticPlan`,
          }),
        ],
      });
    }
    default:
      return undefined;
  }
};

export const defineResourceAll = <
  const Branches extends Record<string, ReactiveResource<any, any, any, any, any>>,
  const Req = Branches[keyof Branches] extends ReactiveResource<any, any, any, infer R, any>
    ? R
    : never,
  const Eff = Branches[keyof Branches] extends ReactiveResource<any, any, any, any, infer E>
    ? E
    : never,
>(
  name: string,
  input: {
    readonly branches: Branches;
    readonly mode?: "parallel" | "target_decides";
  },
): ResourceAll<Branches, Req, Eff> => ({
  kind: "resource_all",
  name,
  branches: input.branches,
  mode: input.mode ?? "parallel",
});

export const defineResourceChain = <
  SourceIn = unknown,
  SourceValue = unknown,
  NextIn = unknown,
  NextValue = unknown,
  SourceErr = ErrorType,
  NextErr = ErrorType,
  const Req = unknown,
  const Eff = unknown,
>(
  name: string,
  input: {
    readonly source: ReactiveResource<SourceIn, SourceValue, SourceErr, Req, Eff>;
    readonly derive_next: StaticFunction<SourceValue, NextIn>;
    readonly next_resource: ReactiveResource<NextIn, NextValue, NextErr, Req, Eff>;
  },
): ResourceChain<SourceIn, SourceValue, NextIn, NextValue, SourceErr, NextErr, Req, Eff> => ({
  kind: "resource_chain",
  name,
  source: input.source,
  derive_next: input.derive_next,
  next_resource: input.next_resource,
});

export const defineDerivedResource = <Value, Err = ErrorType>(input: {
  readonly name: string;
  readonly dependencies: readonly (
    | KeyExpression
    | ReactiveKey
    | ReactiveResource
    | DerivedResource
  )[];
  readonly output_type: SemanticType<Value>;
  readonly resource_state?: "reactive" | "pull" | "infinite" | "stream";
  readonly traits?: readonly TraitKind[];
}): DerivedResource<Value, Err> => ({
  kind: "derived_resource",
  name: input.name,
  dependencies: input.dependencies,
  output_type: input.output_type,
  resource_state: input.resource_state ?? "reactive",
  traits: input.traits,
});

export const defineFinalizer = (input: {
  readonly name: string;
  readonly cleanup: "invalidate" | "unsubscribe" | "dispose" | "custom";
  readonly target_specific?: boolean;
}): Finalizer => ({
  kind: "finalizer",
  name: input.name,
  cleanup: input.cleanup,
  target_specific: input.target_specific,
});

export const defineScopedResource = <Source extends AnyResource>(input: {
  readonly name: string;
  readonly source: Source;
  readonly owner: string;
  readonly finalizers: readonly Finalizer[];
  readonly refresh_policy?: "on_invalidate" | "on_mount" | "manual";
  readonly disposal_policy?: "auto" | "manual" | "deferred";
}): ScopedResource<Source> => ({
  kind: "scoped_resource",
  name: input.name,
  source: input.source,
  owner: input.owner,
  finalizers: input.finalizers,
  refresh_policy: input.refresh_policy,
  disposal_policy: input.disposal_policy,
});

export const defineReactiveRuntime = (input: {
  readonly name: string;
  readonly environment: "server" | "client" | "edge" | "ssr";
  readonly capabilities?: readonly string[];
  readonly fallback_runtime?: string;
}): ReactiveRuntime => ({
  kind: "reactive_runtime",
  name: input.name,
  environment: input.environment,
  capabilities: input.capabilities ?? [],
  fallback_runtime: input.fallback_runtime,
});

export const defineServiceLayer = (input: {
  readonly name: string;
  readonly resources: readonly AnyResource[];
  readonly mutations?: readonly ReactiveMutation[];
  readonly runtime?: ReactiveRuntime;
  readonly scoped?: readonly ScopedResource[];
}): ServiceLayer => ({
  kind: "service_layer",
  name: input.name,
  resources: input.resources,
  mutations: input.mutations,
  runtime: input.runtime,
  scoped: input.scoped,
});

export const defineLifecycleRequirement = (input: {
  readonly name: string;
  readonly constraint: "mount" | "unmount" | "cleanup" | "refresh";
  readonly target_resource: string;
  readonly owner?: string;
  readonly finalizers?: readonly Finalizer[];
}): LifecycleRequirement => ({
  kind: "lifecycle_requirement",
  name: input.name,
  constraint: input.constraint,
  target_resource: input.target_resource,
  owner: input.owner,
  finalizers: input.finalizers,
});

export const checkScopedResourcesAndStreams = (ctx: GenContext): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const resource of ctx.reactive_resources as AnyResource[]) {
    if (resource.kind === "stream_resource" && resource.disposal_policy === undefined) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "reactivity:missing-disposal-policy",
          message: `Stream resource "${resource.name}" has no disposal policy`,
          suggestion: "Add a disposal_policy to specify cleanup semantics.",
        }),
      );
    }
  }

  return diagnostics;
};

const keyFamilyGraphId = (family: KeyFamily): string => family.ref.id ?? `key:${family.name}`;
const entityId = (entity: Entity): string => entity.ref.id ?? `entity:${entity.name}`;
const queryId = (query: QueryFunction): string => query.ref?.id ?? `query:${query.name}`;
const actionId = (action: ActionFunction): string => action.ref?.id ?? `action:${action.name}`;
const nodeGraphId = (node: { name?: string; ref?: { id?: string }; id?: string }): string =>
  node.ref?.id ?? node.id ?? `node:${node.name ?? "unknown"}`;
const resourceId = (resource: AnyResource): string => `resource:${resource.name}`;
const mutationId = (mutation: ReactiveMutation): string => `mutation:${mutation.name}`;
const resourceAllId = (ra: ResourceAll): string => `resource_all:${ra.name}`;
const resourceChainId = (rc: ResourceChain): string => `resource_chain:${rc.name}`;
const routeId = (route: GenContext["routes"][number]): string =>
  `route:${route.method.kind} ${route.path.template}`;
const appRouteId = (route: AppRoute): string => `app_route:${route.path}`;
const formId = (form: Form): string => `form:${form.name}`;
const eventId = (event: Event): string => `event:${event.name}`;
const subscriptionId = (subscription: Subscription): string => `subscription:${subscription.name}`;
const stateResourceId = (state: StateResource): string => `state_resource:${state.name}`;
const derivedResourceId = (resource: DerivedResource): string =>
  `derived_resource:${resource.name}`;

const addNode = (nodes: Map<string, ReactiveGraphNode>, node: ReactiveGraphNode): void => {
  nodes.set(node.id, node);
};

const sortNodes = (nodes: Iterable<ReactiveGraphNode>): ReactiveGraphNode[] =>
  [...nodes].sort((a, b) => a.id.localeCompare(b.id));

const sortEdges = (edges: ReactiveGraphEdge[]): ReactiveGraphEdge[] =>
  [...edges].sort((a, b) => {
    const from = a.from.localeCompare(b.from);
    if (from !== 0) return from;
    const to = a.to.localeCompare(b.to);
    if (to !== 0) return to;
    return a.kind.localeCompare(b.kind);
  });

export const deriveReactiveGraph = (ctx: GenContext): ReactiveGraph => {
  const nodes = new Map<string, ReactiveGraphNode>();
  const edges: ReactiveGraphEdge[] = [];

  for (const family of ctx.key_families) {
    addNode(nodes, { id: keyFamilyGraphId(family), kind: "key_family", name: family.name });
  }

  for (const query of ctx.query_functions) {
    addNode(nodes, { id: queryId(query), kind: "query_function", name: query.name });
    const declaredKey = query.reactivity?.key;
    if (declaredKey !== undefined) {
      const family = declaredKey.family;
      addNode(nodes, { id: keyFamilyGraphId(family), kind: "key_family", name: family.name });
      edges.push({
        kind: "reads_key",
        from: queryId(query),
        to: keyFamilyGraphId(family),
        key: declaredKey,
        confidence: "declared",
      });
    }
    // DERI1: derived read dependencies from query body (only when no declared key)
    if (declaredKey === undefined) {
      const readDeps = deriveQueryReadDependencies(query);
      for (const dep of readDeps) {
        const family = ctx.key_families.find((kf) => kf.name === dep.entity.name);
        if (
          family &&
          !edges.some(
            (e) =>
              e.kind === "reads_key" &&
              e.from === queryId(query) &&
              e.to === keyFamilyGraphId(family),
          )
        ) {
          addNode(nodes, { id: keyFamilyGraphId(family), kind: "key_family", name: family.name });
          edges.push({
            kind: "reads_key",
            from: queryId(query),
            to: keyFamilyGraphId(family),
            key: { kind: "constant_key_expression", family },
            confidence: "derived",
          });
        }
      }
    }
  }

  for (const action of ctx.action_functions) {
    addNode(nodes, { id: actionId(action), kind: "action_function", name: action.name });
    for (const operation of action.body.operations) {
      if (operation.kind === "invalidate_op") {
        for (const pattern of operation.patterns) {
          if (pattern.kind !== "constant_key_pattern_expression") continue;
          for (const p of pattern.patterns) {
            addNode(nodes, {
              id: keyFamilyGraphId(p.family),
              kind: "key_family",
              name: p.family.name,
            });
            edges.push({
              kind: "invalidates_key",
              from: actionId(action),
              to: keyFamilyGraphId(p.family),
              pattern: p,
              expression: pattern,
              confidence: "declared",
            });
          }
        }
        continue;
      }
      addNode(nodes, {
        id: entityId(operation.target),
        kind: "entity",
        name: operation.target.name,
      });
      edges.push({
        kind: "writes_entity",
        from: actionId(action),
        to: entityId(operation.target),
        confidence: "derived",
      });
    }
    for (const expr of action.reactivity?.invalidates ?? []) {
      if (expr.kind !== "constant_key_pattern_expression") continue;
      for (const pattern of expr.patterns) {
        addNode(nodes, {
          id: keyFamilyGraphId(pattern.family),
          kind: "key_family",
          name: pattern.family.name,
        });
        edges.push({
          kind: "invalidates_key",
          from: actionId(action),
          to: keyFamilyGraphId(pattern.family),
          pattern,
          expression: expr,
          confidence: "declared",
        });
      }
    }
    // DERI1: conservative derived invalidations from write dependencies
    const derivedInvalidations = deriveConservativeInvalidations(ctx, action);
    for (const inv of derivedInvalidations) {
      addNode(nodes, {
        id: keyFamilyGraphId(inv.family),
        kind: "key_family",
        name: inv.family.name,
      });
      if (
        !edges.some(
          (e) =>
            e.kind === "invalidates_key" &&
            e.from === actionId(action) &&
            e.to === keyFamilyGraphId(inv.family),
        )
      ) {
        edges.push({
          kind: "invalidates_key",
          from: actionId(action),
          to: keyFamilyGraphId(inv.family),
          pattern: inv.pattern,
          confidence: inv.confidence,
          precision: inv.precision,
        });
      }
    }
  }

  for (const resource of ctx.reactive_resources) {
    addNode(nodes, { id: resourceId(resource), kind: "resource", name: resource.name });
    addNode(nodes, {
      id: queryId(resource.query),
      kind: "query_function",
      name: resource.query.name,
    });
    edges.push({
      kind: "wraps_query",
      from: resourceId(resource),
      to: queryId(resource.query),
    });
  }

  for (const mutation of ctx.reactive_mutations) {
    addNode(nodes, { id: mutationId(mutation), kind: "mutation", name: mutation.name });
    addNode(nodes, {
      id: actionId(mutation.action),
      kind: "action_function",
      name: mutation.action.name,
    });
    edges.push({
      kind: "wraps_action",
      from: mutationId(mutation),
      to: actionId(mutation.action),
    });
    for (const pattern of mutation.invalidates.patterns) {
      addNode(nodes, {
        id: keyFamilyGraphId(pattern.family),
        kind: "key_family",
        name: pattern.family.name,
      });
      edges.push({
        kind: "invalidates_key",
        from: mutationId(mutation),
        to: keyFamilyGraphId(pattern.family),
        pattern,
        confidence: "declared",
      });
    }
    // DERI1: conservative derived invalidations from wrapped action
    const derivedInvalidations = deriveConservativeInvalidations(ctx, mutation.action);
    for (const inv of derivedInvalidations) {
      addNode(nodes, {
        id: keyFamilyGraphId(inv.family),
        kind: "key_family",
        name: inv.family.name,
      });
      if (
        !edges.some(
          (e) =>
            e.kind === "invalidates_key" &&
            e.from === mutationId(mutation) &&
            e.to === keyFamilyGraphId(inv.family),
        )
      ) {
        edges.push({
          kind: "invalidates_key",
          from: mutationId(mutation),
          to: keyFamilyGraphId(inv.family),
          pattern: inv.pattern,
          confidence: inv.confidence,
          precision: inv.precision,
        });
      }
    }
  }

  for (const ra of ctx.resource_alls) {
    addNode(nodes, { id: resourceAllId(ra), kind: "resource_all", name: ra.name });
    for (const branch of Object.values(ra.branches)) {
      addNode(nodes, { id: resourceId(branch), kind: "resource", name: branch.name });
      edges.push({
        kind: "composes_resource",
        from: resourceAllId(ra),
        to: resourceId(branch),
      });
    }
  }

  for (const scope of ctx.tracking_scopes) {
    const scopeId = `scope:${scope.name}`;
    addNode(nodes, {
      id: scopeId,
      kind: "tracking_scope",
      name: scope.name,
      scope_kind: scope.scope_kind,
      owner: scope.owner,
    });
    for (const read of scope.reads) {
      if ("family" in read) {
        // Assume KeyExpression
        edges.push({
          kind: "scope_reads_key",
          from: scopeId,
          to: keyFamilyGraphId(read.family),
        });
      } else if ("query" in read) {
        // Assume ReactiveResource
        edges.push({
          kind: "scope_reads_query",
          from: scopeId,
          to: queryId(read.query),
        });
      } else {
        // Assume QueryFunction
        edges.push({
          kind: "scope_reads_query",
          from: scopeId,
          to: queryId(read),
        });
      }
    }
  }

  for (const rc of ctx.resource_chains) {
    addNode(nodes, { id: resourceChainId(rc), kind: "resource_chain", name: rc.name });
    addNode(nodes, { id: resourceId(rc.source), kind: "resource", name: rc.source.name });
    addNode(nodes, {
      id: resourceId(rc.next_resource),
      kind: "resource",
      name: rc.next_resource.name,
    });
    edges.push({
      kind: "composes_resource",
      from: resourceChainId(rc),
      to: resourceId(rc.source),
    });
    edges.push({
      kind: "composes_resource",
      from: resourceChainId(rc),
      to: resourceId(rc.next_resource),
    });
    edges.push({
      kind: "reads_resource",
      from: resourceId(rc.source),
      to: resourceId(rc.next_resource),
    });
  }

  for (const form of ctx.forms) {
    addNode(nodes, { id: formId(form), kind: "form", name: form.name });
    addNode(nodes, {
      id: actionId(form.source_function),
      kind: "action_function",
      name: form.source_function.name,
    });
    edges.push({
      kind: "form_submits",
      from: formId(form),
      to: actionId(form.source_function),
    });
  }

  for (const event of ctx.events) {
    addNode(nodes, { id: eventId(event), kind: "event", name: event.name });
    for (const action of event.emitted_by) {
      addNode(nodes, {
        id: actionId(action),
        kind: "action_function",
        name: action.name,
      });
      edges.push({
        kind: "emits_event",
        from: actionId(action),
        to: eventId(event),
      });
    }
  }

  for (const emission of ctx.event_emissions) {
    addNode(nodes, {
      id: eventId(emission.event),
      kind: "event",
      name: emission.event.name,
    });
    addNode(nodes, {
      id: actionId(emission.action),
      kind: "action_function",
      name: emission.action.name,
    });
    edges.push({
      kind: "emits_event",
      from: actionId(emission.action),
      to: eventId(emission.event),
    });
  }

  for (const subscription of ctx.subscriptions) {
    addNode(nodes, {
      id: subscriptionId(subscription),
      kind: "subscription",
      name: subscription.name,
    });
    addNode(nodes, {
      id: eventId(subscription.event),
      kind: "event",
      name: subscription.event.name,
    });
    edges.push({
      kind: "subscribes_event",
      from: subscriptionId(subscription),
      to: eventId(subscription.event),
    });
  }

  for (const state of ctx.state_resources) {
    const id = stateResourceId(state);
    addNode(nodes, { id, kind: "state_resource", name: state.name });
    if (state.key_family) {
      addNode(nodes, {
        id: keyFamilyGraphId(state.key_family),
        kind: "key_family",
        name: state.key_family.name,
      });
      edges.push({
        kind: "reads_key",
        from: id,
        to: keyFamilyGraphId(state.key_family),
        key: { kind: "constant_key_expression", family: state.key_family },
        confidence: "declared",
      });
    }
  }

  for (const derived of ctx.derived_resources) {
    const id = derivedResourceId(derived);
    addNode(nodes, {
      id,
      kind: "derived_resource",
      name: derived.name,
      resource_type: derived.resource_state,
    });
    for (const dep of derived.dependencies) {
      if (
        dep.kind === "constant_key_expression" ||
        dep.kind === "static_key_expression" ||
        dep.kind === "reactive_key"
      ) {
        addNode(nodes, {
          id: keyFamilyGraphId(dep.family),
          kind: "key_family",
          name: dep.family.name,
        });
        edges.push({
          kind: "reads_key",
          from: id,
          to: keyFamilyGraphId(dep.family),
          key:
            dep.kind === "reactive_key"
              ? { kind: "constant_key_expression", family: dep.family }
              : dep,
          confidence: "declared",
        });
      } else if (dep.kind === "reactive_resource") {
        addNode(nodes, { id: resourceId(dep), kind: "resource", name: dep.name });
        edges.push({
          kind: "reads_resource",
          from: id,
          to: resourceId(dep),
        });
      } else if (dep.kind === "derived_resource") {
        addNode(nodes, { id: derivedResourceId(dep), kind: "derived_resource", name: dep.name });
        edges.push({
          kind: "reads_resource",
          from: id,
          to: derivedResourceId(dep),
        });
      }
    }
  }

  for (const route of ctx.routes) {
    addNode(nodes, { id: routeId(route), kind: "route", name: route.path.template });
    if (route.handler.kind === "query" && route.handler.query_func) {
      const queryFunc = route.handler.query_func as QueryFunction;
      if (hasTrait(queryFunc, "readable") && hasTrait(queryFunc, "callable")) {
        addNode(nodes, {
          id: queryId(queryFunc),
          kind: "query_function",
          name: queryFunc.name,
        });
        edges.push({
          kind: "route_loads",
          from: routeId(route),
          to: queryId(queryFunc),
        });
      }
    }
    if (route.handler.kind === "action" && route.handler.action_func) {
      const actionFunc = route.handler.action_func as ActionFunction;
      if (hasTrait(actionFunc, "writable") && hasTrait(actionFunc, "callable")) {
        addNode(nodes, {
          id: actionId(actionFunc),
          kind: "action_function",
          name: actionFunc.name,
        });
        edges.push({
          kind: "route_submits",
          from: routeId(route),
          to: actionId(actionFunc),
        });
      }
    }
  }

  for (const route of ctx.app_routes) {
    addNode(nodes, { id: appRouteId(route), kind: "app_route", name: route.path });
    for (const loader of route.loaders) {
      if (hasTrait(loader, "readable") && hasTrait(loader, "callable")) {
        const id = nodeGraphId(loader);
        addNode(nodes, {
          id,
          kind: "query_function",
          name: loader.name ?? "unknown",
        });
        edges.push({
          kind: "route_loads",
          from: appRouteId(route),
          to: id,
        });
      } else if (hasTrait(loader, "readable")) {
        const id =
          "kind" in loader && loader.kind === "reactive_resource"
            ? resourceId(loader as ReactiveResource)
            : nodeGraphId(loader);
        addNode(nodes, {
          id,
          kind: "resource",
          name: loader.name ?? "unknown",
        });
        edges.push({
          kind: "route_loads",
          from: appRouteId(route),
          to: id,
        });
      }
    }
    if (route.action) {
      if (hasTrait(route.action, "writable") && hasTrait(route.action, "callable")) {
        const id = nodeGraphId(route.action);
        addNode(nodes, {
          id,
          kind: "action_function",
          name: route.action.name ?? "unknown",
        });
        edges.push({
          kind: "route_submits",
          from: appRouteId(route),
          to: id,
        });
      } else if (hasTrait(route.action, "writable")) {
        const id =
          "kind" in route.action && route.action.kind === "reactive_mutation"
            ? mutationId(route.action as ReactiveMutation)
            : nodeGraphId(route.action);
        addNode(nodes, {
          id,
          kind: "mutation",
          name: route.action.name ?? "unknown",
        });
        edges.push({
          kind: "route_submits",
          from: appRouteId(route),
          to: id,
        });
      }
    }
  }

  // ARCH1: Plugin-defined nodes participate via traits and lowering
  for (const node of ctx.nodes) {
    const nodeId = node.id ?? `node:${node.name ?? node.kind}`;
    // Only add if not already present from a concrete kind handler
    if (!nodes.has(nodeId)) {
      addNode(nodes, {
        id: nodeId,
        kind: "tracking_scope", // Reuse tracking_scope as a generic plugin node container
        name: node.name ?? node.kind,
        traits: node.traits as readonly string[],
      });
    }

    // If the node is lowerable, expand its lowered children into the graph
    const lowerable = node as import("../core/node.ts").LowerableNode;
    if (lowerable.lowersTo !== undefined) {
      for (const lowered of lowerable.lowersTo) {
        const loweredId = lowered.id ?? `node:${lowered.name ?? lowered.kind}`;
        if (!nodes.has(loweredId)) {
          addNode(nodes, {
            id: loweredId,
            kind: "tracking_scope",
            name: lowered.name ?? lowered.kind,
            traits: lowered.traits as readonly string[],
          });
        }
        edges.push({
          kind: "composes_resource",
          from: nodeId,
          to: loweredId,
        });
      }
    }
  }

  return {
    kind: "reactive_graph",
    nodes: sortNodes(nodes.values()),
    edges: sortEdges(edges),
  };
};

export const affectedResourcesForMutation = (
  graph: ReactiveGraph,
  mutation: ReactiveMutation | string,
): readonly ReactiveGraphNode[] => {
  const staleQueries = new Set(
    staleQueriesForKeys(graph, affectedKeysForMutation(graph, mutation)).map((node) => node.id),
  );
  const affectedResourceIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "wraps_query" && staleQueries.has(edge.to))
      .map((edge) => edge.from),
  );

  return graph.nodes.filter((node) => node.kind === "resource" && affectedResourceIds.has(node.id));
};

export const affectedRoutesForMutation = (
  graph: ReactiveGraph,
  mutation: ReactiveMutation | string,
): readonly ReactiveGraphNode[] => {
  const staleQueries = new Set(
    staleQueriesForKeys(graph, affectedKeysForMutation(graph, mutation)).map((node) => node.id),
  );
  const affectedRouteIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "route_loads" && staleQueries.has(edge.to))
      .map((edge) => edge.from),
  );

  return graph.nodes.filter(
    (node) => (node.kind === "route" || node.kind === "app_route") && affectedRouteIds.has(node.id),
  );
};

export const affectedKeysForMutation = (
  graph: ReactiveGraph,
  mutation: ReactiveMutation | string,
): readonly ReactiveGraphNode[] => {
  const mutationNodeId = typeof mutation === "string" ? mutation : mutationId(mutation);
  const keyIds = new Set(
    graph.edges
      .filter((edge) => edge.from === mutationNodeId && edge.kind === "invalidates_key")
      .map((edge) => edge.to),
  );
  return graph.nodes.filter((node) => node.kind === "key_family" && keyIds.has(node.id));
};

export const staleQueriesForKeys = (
  graph: ReactiveGraph,
  keys: readonly (ReactiveGraphNode | KeyFamily | string)[],
): readonly ReactiveGraphNode[] => {
  const keyIds = new Set(
    keys.map((key) => {
      if (typeof key === "string") return key;
      if (key.kind === "key_family" && "ref" in key) return keyFamilyGraphId(key);
      return key.id;
    }),
  );
  const queryIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "reads_key" && keyIds.has(edge.to))
      .map((edge) => edge.from),
  );
  return graph.nodes.filter((node) => node.kind === "query_function" && queryIds.has(node.id));
};

export const affectedFormsForMutation = (
  graph: ReactiveGraph,
  mutation: ReactiveMutation | string,
): readonly ReactiveGraphNode[] => {
  const mutationNodeId = typeof mutation === "string" ? mutation : mutationId(mutation);
  const actionIds = new Set(
    graph.edges
      .filter((edge) => edge.from === mutationNodeId && edge.kind === "wraps_action")
      .map((edge) => edge.to),
  );
  const formIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "form_submits" && actionIds.has(edge.to))
      .map((edge) => edge.from)
      .filter((id) => id.startsWith("form:")),
  );
  return graph.nodes.filter((node) => node.kind === "form" && formIds.has(node.id));
};

export const affectedSubscriptionsForMutation = (
  graph: ReactiveGraph,
  mutation: ReactiveMutation | string,
): readonly ReactiveGraphNode[] => {
  const mutationNodeId = typeof mutation === "string" ? mutation : mutationId(mutation);
  const actionIds = new Set(
    graph.edges
      .filter((edge) => edge.from === mutationNodeId && edge.kind === "wraps_action")
      .map((edge) => edge.to),
  );
  const eventIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "emits_event" && actionIds.has(edge.from))
      .map((edge) => edge.to),
  );
  const subscriptionIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "subscribes_event" && eventIds.has(edge.to))
      .map((edge) => edge.from),
  );
  return graph.nodes.filter((node) => node.kind === "subscription" && subscriptionIds.has(node.id));
};

export const entitiesWrittenByAction = (
  graph: ReactiveGraph,
  action: ActionFunction | string,
): readonly ReactiveGraphNode[] => {
  const actionNodeId = typeof action === "string" ? action : actionId(action);
  const entityIds = new Set(
    graph.edges
      .filter((edge) => edge.from === actionNodeId && edge.kind === "writes_entity")
      .map((edge) => edge.to),
  );
  return graph.nodes.filter((node) => node.kind === "entity" && entityIds.has(node.id));
};

export const actionsWritingEntity = (
  graph: ReactiveGraph,
  entity: Entity | string,
): readonly ReactiveGraphNode[] => {
  const entityNodeId = typeof entity === "string" ? entity : entityId(entity);
  const actionIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "writes_entity" && edge.to === entityNodeId)
      .map((edge) => edge.from),
  );
  return graph.nodes.filter((node) => node.kind === "action_function" && actionIds.has(node.id));
};

export const mutationsWritingEntity = (
  graph: ReactiveGraph,
  entity: Entity | string,
): readonly ReactiveGraphNode[] => {
  const writingActions = new Set(actionsWritingEntity(graph, entity).map((n) => n.id));
  const mutationIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "wraps_action" && writingActions.has(edge.to))
      .map((edge) => edge.from)
      .filter((id) => id.startsWith("mutation:")),
  );
  return graph.nodes.filter((node) => node.kind === "mutation" && mutationIds.has(node.id));
};

export const entitiesWrittenByMutation = (
  graph: ReactiveGraph,
  mutation: ReactiveMutation | string,
): readonly ReactiveGraphNode[] => {
  const mutationNodeId = typeof mutation === "string" ? mutation : mutationId(mutation);
  const actionIds = graph.edges
    .filter((edge) => edge.from === mutationNodeId && edge.kind === "wraps_action")
    .map((edge) => edge.to);
  const seen = new Map<string, ReactiveGraphNode>();
  for (const id of actionIds) {
    for (const node of entitiesWrittenByAction(graph, id)) {
      seen.set(node.id, node);
    }
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
};

// ---------------------------------------------------------------------------
// Conservative derived dependency pass (DERI1)
// ---------------------------------------------------------------------------

export const deriveQueryReadDependencies = <E extends Entity = Entity>(
  query: QueryFunction,
): readonly ReadDependency<E>[] => {
  const deps: ReadDependency<E>[] = [];
  const body = query.body;
  if (body.source.kind === "entity_source" && body.source.entity) {
    deps.push({
      kind: "read_dependency",
      source: "query_body",
      entity: body.source.entity as E,
    });
  }
  for (const join of body.joins) {
    if (join.target.entity) {
      deps.push({
        kind: "read_dependency",
        source: "join",
        entity: join.target.entity as E,
      });
    }
  }
  return deps;
};

export const deriveActionWriteDependencies = <E extends Entity = Entity, F extends Field = Field>(
  action: ActionFunction,
): readonly WriteDependency<E, F>[] =>
  action.body.operations
    .filter(
      (op): op is import("../function/index.ts").WriteOperation => op.kind !== "invalidate_op",
    )
    .map((op) => ({
      kind: "write_dependency",
      operation: op.kind === "insert_op" ? "insert" : op.kind === "update_op" ? "update" : "delete",
      entity: op.target as E,
      fields: op.values ? ([...op.values.keys()] as F[]) : undefined,
    }));

export const deriveConservativeInvalidations = <Payload extends KeyPayload = KeyPayload>(
  ctx: GenContext,
  action: ActionFunction,
): readonly DerivedInvalidation<Payload>[] => {
  const writes = deriveActionWriteDependencies(action);
  const invalidations: DerivedInvalidation<Payload>[] = [];
  for (const write of writes) {
    const family = ctx.key_families.find((kf) => kf.name === write.entity.name);
    if (family) {
      invalidations.push({
        kind: "derived_invalidation",
        family: family as KeyFamily<Payload>,
        pattern: {
          kind: "reactive_key_pattern",
          family: family as KeyFamily<Payload>,
          match: "any",
        },
        confidence: "conservative",
        precision: "broad",
      });
    }
  }
  return invalidations;
};

const enrichGraphNode = (node: ReactiveGraphNode, ctx: GenContext): ReactiveGraphNode => {
  const enrichment: {
    stable_id?: string;
    traits?: readonly string[];
    symbol?: import("../core/index.ts").SymbolMetadata;
    call_plan?: import("../core/index.ts").CallPlan;
    resource_type?: "reactive" | "pull" | "infinite" | "stream" | "derived";
    bindings?: readonly ResourceBinding[];
  } = {};
  switch (node.kind) {
    case "entity": {
      const entity = ctx.entities.find((e) => e.ref.id === node.id || e.name === node.name);
      if (entity) {
        enrichment.stable_id = entity.ref.id;
      }
      break;
    }
    case "query_function": {
      const query = ctx.query_functions.find((q) => q.ref?.id === node.id || q.name === node.name);
      if (query) {
        enrichment.traits = query.traits;
        enrichment.stable_id = query.ref?.id ?? query.id;
        enrichment.symbol = query.symbol;
        enrichment.call_plan = query.callPlan;
      }
      break;
    }
    case "action_function": {
      const action = ctx.action_functions.find(
        (a) => a.ref?.id === node.id || a.name === node.name,
      );
      if (action) {
        enrichment.traits = action.traits;
        enrichment.stable_id = action.ref?.id ?? action.id;
        enrichment.symbol = action.symbol;
        enrichment.call_plan = action.callPlan;
      }
      break;
    }
    case "resource": {
      const resource = ctx.reactive_resources.find((r) => r.name === node.name) as AnyResource;
      if (resource) {
        enrichment.traits = resource.traits;
        enrichment.symbol = resource.symbol;
        enrichment.resource_type =
          resource.kind === "reactive_resource"
            ? "reactive"
            : resource.kind === "pull_resource"
              ? "pull"
              : resource.kind === "infinite_resource"
                ? "infinite"
                : "stream";
        enrichment.bindings = resource.bindings;
      }
      break;
    }
    case "mutation": {
      const mutation = ctx.reactive_mutations.find((m) => m.name === node.name);
      if (mutation) {
        enrichment.traits = mutation.traits;
        enrichment.symbol = mutation.symbol;
      }
      break;
    }
    case "key_family": {
      const family = ctx.key_families.find((f) => f.ref.id === node.id || f.name === node.name);
      if (family) {
        enrichment.stable_id = family.ref.id;
      }
      break;
    }
    case "app_route": {
      const route = ctx.app_routes.find((r) => r.path === node.name);
      if (route) {
        // AppRoute does not yet carry traits or stable IDs
      }
      break;
    }
  }
  return Object.keys(enrichment).length > 0 ? { ...node, ...enrichment } : node;
};

export const reactiveGraphArtifact = (
  graph: ReactiveGraph,
  path = "reactive-graph.json",
  ctx?: GenContext,
): Artifact => {
  const enrichedGraph = ctx
    ? { ...graph, nodes: graph.nodes.map((node) => enrichGraphNode(node, ctx)) }
    : graph;
  return makeArtifact({
    path,
    kind: "asset",
    language: "json",
    content: `${JSON.stringify(enrichedGraph, null, 2)}\n`,
  });
};

export interface LoaderBundle {
  readonly kind: "loader_bundle";
  readonly loaders: readonly ReactiveGraphNode[];
}

export interface ResponseMapping {
  readonly kind: "response_mapping";
  /** The loader that receives the mapped payload. */
  readonly loader: ReactiveGraphNode;
  /** Path into the mutation response to extract. */
  readonly response_path: readonly string[];
}

export interface MutationRefreshPlan {
  readonly kind: "mutation_refresh_plan";
  readonly mutation: ReactiveMutation;
  readonly bundles: readonly LoaderBundle[];
  /** Mappings from mutation response to loader updates, preventing double round-trips. */
  readonly response_mappings?: readonly ResponseMapping[];
}

export interface BundledQuery {
  readonly kind: "bundled_query";
  readonly query: QueryFunction;
  readonly key: KeyExpression;
}

export interface SingleFlightPlan {
  readonly kind: "single_flight_plan";
  readonly mutations: readonly MutationRefreshPlan[];
  /** All loader queries that can be bundled into a single request. */
  readonly bundled_queries?: readonly BundledQuery[];
}

export const createLoaderBundle = (loaders: readonly ReactiveGraphNode[]): LoaderBundle => ({
  kind: "loader_bundle",
  loaders,
});

export const createMutationRefreshPlan = (
  mutation: ReactiveMutation,
  bundles: readonly LoaderBundle[],
  response_mappings?: readonly ResponseMapping[],
): MutationRefreshPlan => ({
  kind: "mutation_refresh_plan",
  mutation,
  bundles,
  response_mappings,
});

export const createSingleFlightPlan = (
  mutations: readonly MutationRefreshPlan[],
  bundled_queries?: readonly BundledQuery[],
): SingleFlightPlan => ({
  kind: "single_flight_plan",
  mutations,
  bundled_queries,
});

/**
 * Derives a SingleFlightPlan from the reactive graph and registered mutations.
 * Each mutation gets bundled with the routes and resources that become stale
 * after the mutation invalidates its keys. Also bundles all loader queries
 * and maps mutation responses to updated loader payloads.
 */
export const deriveSingleFlightPlan = (ctx: GenContext, graph: ReactiveGraph): SingleFlightPlan => {
  const plans: MutationRefreshPlan[] = [];

  // Collect all loader queries that can be bundled
  const bundledQueries: BundledQuery[] = [];
  for (const query of ctx.query_functions) {
    const declaredKey = query.reactivity?.key;
    if (declaredKey) {
      bundledQueries.push({
        kind: "bundled_query",
        query,
        key: declaredKey,
      });
    }
  }

  for (const mutation of ctx.reactive_mutations) {
    const resources = affectedResourcesForMutation(graph, mutation);
    const routes = affectedRoutesForMutation(graph, mutation);

    const loaders: ReactiveGraphNode[] = [...resources, ...routes].sort((a, b) =>
      a.id.localeCompare(b.id),
    );

    if (loaders.length > 0) {
      // Derive response mappings: mutation output can populate loader cache directly
      const responseMappings: ResponseMapping[] = loaders
        .filter((loader) => loader.kind === "resource")
        .map((loader) => ({
          kind: "response_mapping" as const,
          loader,
          response_path: ["data"],
        }));

      plans.push(
        createMutationRefreshPlan(mutation, [createLoaderBundle(loaders)], responseMappings),
      );
    }
  }

  return createSingleFlightPlan(plans, bundledQueries);
};

// --- Reactivity invariants -------------------------------------------------

const keyPayloadFields = (family: KeyFamily): readonly string[] | undefined => {
  const input = family.input_type;
  if (input === undefined) return undefined;
  if (input.kind === "struct") {
    return input.storage_repr.kind.struct_fields?.map((f) => f.name);
  }
  return undefined;
};

/**
 * Validates reactivity invariants from spec section 0.7:
 *
 * - `reactivity:duplicate-key-family` — no two key families may share a name.
 * - `reactivity:resource-source-not-query` — a `ReactiveResource` must wrap a query function.
 * - `reactivity:mutation-source-not-action` — a `ReactiveMutation` must wrap an action function.
 * - `reactivity:duplicate-resource-name` — no two reactive resources may share a name.
 * - `reactivity:duplicate-mutation-name` — no two reactive mutations may share a name.
 * - `reactivity:key-payload-mismatch` — a key payload contains fields not declared by its family.
 * - `reactivity:key-match-unknown-field` — a match partial references an unknown field.
 * - `reactivity:query-key-output-invalid` — a query key expression references an invalid family.
 * - `reactivity:invalidates-output-invalid` — an invalidation expression contains raw keys.
 * - `reactivity:raw-key-not-portable` — a raw string key is used where a family is required.
 *
 * @param input - Reactivity records to validate.
 * @returns Diagnostics for any violated invariants.
 */
export const checkReactivity = (input: {
  readonly key_families: readonly KeyFamily[];
  readonly reactive_resources: readonly AnyResource[];
  readonly reactive_mutations: readonly ReactiveMutation[];
  readonly query_functions?: readonly QueryFunction[];
  readonly action_functions?: readonly ActionFunction[];
}): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  const familyNames = new Map<string, number>();
  for (const family of input.key_families) {
    familyNames.set(family.name, (familyNames.get(family.name) ?? 0) + 1);
  }
  for (const [name, count] of familyNames) {
    if (count > 1) {
      out.push(
        diagnostic({
          severity: "error",
          code: "reactivity:duplicate-key-family",
          message: `Key family ${name} is defined ${count} times`,
        }),
      );
    }
  }

  const resourceNames = new Map<string, number>();
  for (const resource of input.reactive_resources) {
    resourceNames.set(resource.name, (resourceNames.get(resource.name) ?? 0) + 1);
    if (!hasTrait(resource.query, "readable") || !hasTrait(resource.query, "callable")) {
      out.push(
        diagnostic({
          severity: "error",
          code: "reactivity:resource-source-not-query",
          message: `Reactive resource ${resource.name} does not reference a readable+callable query function`,
        }),
      );
    }
    const hasKey = resource.query.reactivity?.key !== undefined;
    if (!hasKey) {
      const hasInvalidateRefresh = resource.refresh.some((r) => r.kind === "on_invalidate");
      if (hasInvalidateRefresh) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "reactivity:resource-query-unkeyed",
            message: `Reactive resource ${resource.name} has refresh-on-invalidate but its query ${resource.query.name} has no reactivity key`,
          }),
        );
      }
    }
  }
  for (const [name, count] of resourceNames) {
    if (count > 1) {
      out.push(
        diagnostic({
          severity: "error",
          code: "reactivity:duplicate-resource-name",
          message: `Reactive resource ${name} is defined ${count} times`,
        }),
      );
    }
  }

  const mutationNames = new Map<string, number>();
  for (const mutation of input.reactive_mutations) {
    mutationNames.set(mutation.name, (mutationNames.get(mutation.name) ?? 0) + 1);
    if (!hasTrait(mutation.action, "writable") || !hasTrait(mutation.action, "callable")) {
      out.push(
        diagnostic({
          severity: "error",
          code: "reactivity:mutation-source-not-action",
          message: `Reactive mutation ${mutation.name} does not reference a writable+callable action function`,
        }),
      );
    }
    for (const pattern of mutation.invalidates.patterns) {
      if (typeof pattern.match === "string" && pattern.match !== "any") {
        out.push(
          diagnostic({
            severity: "error",
            code: "reactivity:raw-key-not-portable",
            message: `Mutation ${mutation.name} uses a raw string key pattern "${String(pattern.match)}" instead of a KeyFamily`,
          }),
        );
      }
      if (typeof pattern.match === "object" && pattern.match !== null) {
        const matchKeys = Object.keys(pattern.match);
        if (matchKeys.length === 0) {
          out.push(
            diagnostic({
              severity: "warning",
              code: "reactivity:key-match-unknown-field",
              message: `Mutation ${mutation.name} match pattern on family ${pattern.family.name} is empty`,
            }),
          );
        } else {
          const knownFields = keyPayloadFields(pattern.family);
          if (knownFields !== undefined) {
            for (const key of matchKeys) {
              if (!knownFields.includes(key)) {
                out.push(
                  diagnostic({
                    severity: "error",
                    code: "reactivity:key-match-unknown-field",
                    message: `Mutation ${mutation.name} match pattern on family ${pattern.family.name} references unknown field "${key}" (known fields: ${knownFields.join(", ")})`,
                  }),
                );
              }
            }
          }
        }
      }
    }
  }
  for (const [name, count] of mutationNames) {
    if (count > 1) {
      out.push(
        diagnostic({
          severity: "error",
          code: "reactivity:duplicate-mutation-name",
          message: `Reactive mutation ${name} is defined ${count} times`,
        }),
      );
    }
  }

  for (const query of input.query_functions ?? []) {
    const keyExpr = query.reactivity?.key;
    if (keyExpr?.kind === "constant_key_expression" && keyExpr.payload !== undefined) {
      const knownFields = keyPayloadFields(keyExpr.family);
      if (knownFields !== undefined) {
        for (const key of Object.keys(keyExpr.payload)) {
          if (!knownFields.includes(key)) {
            out.push(
              diagnostic({
                severity: "error",
                code: "reactivity:key-payload-mismatch",
                message: `Query ${query.name} key payload on family ${keyExpr.family.name} contains unknown field "${key}" (known fields: ${knownFields.join(", ")})`,
              }),
            );
          }
        }
      }
    }
  }

  for (const action of input.action_functions ?? []) {
    for (const expr of action.reactivity?.invalidates ?? []) {
      if (expr.kind !== "constant_key_pattern_expression") continue;
      for (const pattern of expr.patterns) {
        if (typeof pattern.match === "object" && pattern.match !== null) {
          const matchKeys = Object.keys(pattern.match);
          if (matchKeys.length === 0) {
            out.push(
              diagnostic({
                severity: "warning",
                code: "reactivity:key-match-unknown-field",
                message: `Action ${action.name} invalidation pattern on family ${pattern.family.name} is empty`,
              }),
            );
          } else {
            const knownFields = keyPayloadFields(pattern.family);
            if (knownFields !== undefined) {
              for (const key of matchKeys) {
                if (!knownFields.includes(key)) {
                  out.push(
                    diagnostic({
                      severity: "error",
                      code: "reactivity:key-match-unknown-field",
                      message: `Action ${action.name} invalidation pattern on family ${pattern.family.name} references unknown field "${key}" (known fields: ${knownFields.join(", ")})`,
                    }),
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  return out;
};

export const checkOptimisticPlans = (input: {
  readonly reactive_mutations: readonly ReactiveMutation[];
}): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  for (const mutation of input.reactive_mutations) {
    if (mutation.optimistic === undefined) continue;

    if (mutation.optimistic.apply.patch_items.length === 0) {
      out.push(
        diagnostic({
          severity: "error",
          code: "reactivity:optimistic-empty-apply",
          message: `Optimistic plan for mutation ${mutation.name} has an empty apply patch`,
        }),
      );
    }

    if (mutation.optimistic.rollback.patch_items.length === 0) {
      out.push(
        diagnostic({
          severity: "error",
          code: "reactivity:optimistic-empty-rollback",
          message: `Optimistic plan for mutation ${mutation.name} has an empty rollback patch`,
        }),
      );
    }

    if (
      mutation.optimistic.apply.kind.kind === "optimistic_insert" &&
      mutation.optimistic.temp_id_strategy === undefined
    ) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "reactivity:optimistic-missing-temp-id",
          message: `Optimistic plan for mutation ${mutation.name} is an insert but has no temp_id_strategy`,
          suggestion: "Add a temp_id_strategy to specify how temporary IDs are reconciled.",
        }),
      );
    }

    if (mutation.optimistic.safety_classification === "unsafe") {
      out.push(
        diagnostic({
          severity: "error",
          code: "optimistic:rollback-missing",
          message: `Optimistic plan for mutation ${mutation.name} is unsafe and lacks a safe rollback`,
          suggestion: "Provide a safe rollback or degrade to refetch/pending state.",
        }),
      );
    }

    if (
      mutation.optimistic.apply.kind.kind === "optimistic_update" &&
      !mutation.optimistic.old_value
    ) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "optimistic:old-value-required",
          message: `Optimistic update plan for mutation ${mutation.name} may require old_value for safe rollback`,
          suggestion: "Provide old_value so the rollback can restore the previous state.",
        }),
      );
    }

    if (mutation.optimistic.target && !mutation.optimistic.target.traits?.includes("patchable")) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "optimistic:target-cannot-patch",
          message: `Optimistic plan target for mutation ${mutation.name} does not support patching`,
          suggestion: "Use a patchable target or switch to refetch-based optimistic updates.",
        }),
      );
    }

    for (const d of mutation.optimistic.diagnostics) {
      out.push(d);
    }
  }

  return out;
};
