/**
 * Type definitions for the Gen namespace.
 *
 * @module
 */

import * as core from "../core/index.ts";
import * as entityMod from "../entity/index.ts";
import * as exprMod from "../expression/index.ts";
import * as relationMod from "../relation/index.ts";
import * as storageMod from "../storage/index.ts";
import * as semantic from "../types/semantic.ts";
import * as repr from "../types/representation.ts";
import * as opMod from "../types/operation.ts";
import * as runtimeMod from "../types/runtime.ts";
import * as traitMod from "../types/trait.ts";
import * as queryMod from "../query/index.ts";
import * as functionMod from "../function/index.ts";
import * as apiMod from "../api/index.ts";
import * as uiMod from "../ui/index.ts";
import * as authzMod from "../authz/index.ts";
import * as eventsMod from "../events/index.ts";
import * as lifecycleMod from "../lifecycle/index.ts";
import * as formsMod from "../forms/index.ts";
import * as adminMod from "../admin/index.ts";
import * as editorMod from "../editor/index.ts";
import * as crudMod from "../crud/index.ts";
import * as listMod from "../list/index.ts";
import * as reactivityMod from "../reactivity/index.ts";
import * as routerMod from "../router/index.ts";
import type { AppRoute } from "../router/index.ts";
import * as hydrationMod from "../hydration/index.ts";
import * as servicesMod from "../services/index.ts";
import * as rulesMod from "../rules/index.ts";
import * as reactionMod from "../reaction/index.ts";

import type { Plugin } from "../core/index.ts";
import type { GenContext } from "../core/index.ts";

/**
 * Extension slot for plugin-contributed helpers on the `gen` namespace.
 * Plugins augment this interface via declaration merging.
 *
 * @example
 * ```ts
 * declare module "gen2" {
 *   interface GenPluginExtensions {
 *     react: { form: typeof defineForm; component: typeof defineComponent };
 *   }
 * }
 * ```
 */
export interface GenPluginExtensions extends Record<string, unknown> {
  // intentionally empty — plugins augment via declaration merging
}

/**
 * Per-namespace configuration shapes. Plugins and backends can extend this
 * via declaration merging to add typed options for their namespace.
 *
 * @example
 * ```ts
 * declare module "gen2" {
 *   interface GenConfig {
 *     ui?: { backend: "jsx" };
 *     db?: { dialect: "postgresql" };
 *   }
 * }
 * ```
 */
export interface GenConfig {
  // intentionally empty — backends augment via declaration merging
  ui?: UiNamespaceRuntimeOptions<string>;
}

/**
 * Factory signature for building a namespaced subset of the `gen` API.
 * Plugins and custom backends can provide their own factory to create
 * a typed namespace given a context, the full `gen` object, and options.
 * @typeParam TNamespace - The shape of the namespace produced.
 * @typeParam TOptions - The options accepted by the factory.
 * @typeParam C - The GenConfig used for backend-specific typing.
 * @typeParam G - The full `gen` type.
 */
export type NamespaceFactory<
  TNamespace,
  TOptions,
  C extends GenConfig = GenConfig,
  G extends Gen<C> = Gen<C>,
> = (ctx: GenContext, gen: G, options: TOptions) => TNamespace;

/**
 * Converts a union type into an intersection type.
 * @typeParam U - The union to collapse.
 */
export type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (
  arg: infer I,
) => void
  ? I
  : never;

/**
 * Extracts the helper shape from a Plugin type.
 * @typeParam P - The Plugin type to inspect.
 */
export type PluginHelperShape<P> = P extends Plugin<infer THelpers> ? THelpers : {};
/**
 * Combines the base `Gen` type with helpers contributed by all installed plugins.
 * @typeParam C - The GenConfig used for backend-specific typing.
 * @typeParam P - The tuple of plugins installed.
 */
export type GenWithPluginHelpers<C extends GenConfig, P extends readonly Plugin[]> = Gen<C> &
  UnionToIntersection<PluginHelperShape<P[number]>>;

/**
 * Extracts the UI backend from a GenConfig, defaulting to the base UI namespace.
 */
export type InferUiBackend<C extends GenConfig> = C extends { ui: { backend: infer B } }
  ? B
  : "jsx";

export interface JsxElementHandle {
  readonly backend: "jsx";
  readonly tag: string;
}

export interface TuiElementHandle {
  readonly backend: "tui";
  readonly kind: string;
}

export interface JsxPlatformHandle {
  readonly backend: "jsx";
  readonly platform: uiMod.Platform<JsxElementHandle>;
}

export interface TuiPlatformHandle {
  readonly backend: "tui";
  readonly platform: uiMod.Platform<TuiElementHandle>;
}

export interface JsxRendererHandle {
  readonly backend: "jsx";
  readonly renderer: uiMod.Renderer<JsxElementHandle>;
}

export interface JsxViewHandle<
  S extends Record<string, uiMod.ElementCapability> = Record<string, uiMod.ElementCapability>,
> {
  readonly backend: "jsx";
  readonly view: uiMod.View<JsxElementHandle, S>;
}

export type JsxSlotHandle<C extends uiMod.ElementCapability = uiMod.ElementCapability> = uiMod.Slot<
  JsxElementHandle,
  C
>;

export interface JsxComponentHandle<P = unknown> {
  readonly backend: "jsx";
  readonly component: uiMod.Component<P, JsxElementHandle>;
}

export interface TuiRendererHandle {
  readonly backend: "tui";
  readonly renderer: uiMod.Renderer<TuiElementHandle>;
}

export interface TuiViewHandle<
  S extends Record<string, uiMod.ElementCapability> = Record<string, uiMod.ElementCapability>,
> {
  readonly backend: "tui";
  readonly view: uiMod.View<TuiElementHandle, S>;
}

export type TuiSlotHandle<C extends uiMod.ElementCapability = uiMod.ElementCapability> = uiMod.Slot<
  TuiElementHandle,
  C
>;

export interface TuiComponentHandle<P = unknown> {
  readonly backend: "tui";
  readonly component: uiMod.Component<P, TuiElementHandle>;
}

export interface JsxUiNamespaceExtensions {
  readonly jsxElement: (tag: string) => JsxElementHandle;
  readonly jsxPlatform: (name: string) => JsxPlatformHandle;
  readonly jsxRenderer: (
    name: string,
    platform: uiMod.Platform<JsxElementHandle>,
  ) => JsxRendererHandle;
  readonly jsxSlot: <C extends uiMod.ElementCapability = uiMod.ElementCapability>(
    name: string,
    capability: C,
    allowed_attributes?: readonly string[],
    allowed_events?: readonly string[],
    platform_requirements?: readonly string[],
    hidden?: boolean,
  ) => JsxSlotHandle<C>;
  readonly jsxView: <
    S extends Record<string, uiMod.ElementCapability> = Record<string, uiMod.ElementCapability>,
  >(
    name: string,
    slots: JsxSlotHandle[],
    structure: string,
    target_platforms?: readonly uiMod.Platform<JsxElementHandle>[],
  ) => JsxViewHandle<S>;
  readonly jsxComponent: <P = unknown>(
    name: string,
    props_type: string,
    view: uiMod.View<JsxElementHandle>,
  ) => JsxComponentHandle<P>;
  readonly jsxAttachStyle: (
    style: uiMod.Style<string, JsxElementHandle>,
    view: uiMod.View<JsxElementHandle>,
  ) => uiMod.Style<string, JsxElementHandle>;
  readonly jsxAttachBehavior: (
    behavior: uiMod.Behavior<Record<string, uiMod.ElementCapability>, JsxElementHandle>,
    view: uiMod.View<JsxElementHandle>,
  ) => uiMod.Behavior<Record<string, uiMod.ElementCapability>, JsxElementHandle>;
}

export interface TuiUiNamespaceExtensions {
  readonly tuiElement: (kind: string) => TuiElementHandle;
  readonly tuiPlatform: (name: string) => TuiPlatformHandle;
  readonly tuiRenderer: (
    name: string,
    platform: uiMod.Platform<TuiElementHandle>,
  ) => TuiRendererHandle;
  readonly tuiSlot: <C extends uiMod.ElementCapability = uiMod.ElementCapability>(
    name: string,
    capability: C,
    allowed_attributes?: readonly string[],
    allowed_events?: readonly string[],
    platform_requirements?: readonly string[],
    hidden?: boolean,
  ) => TuiSlotHandle<C>;
  readonly tuiView: <
    S extends Record<string, uiMod.ElementCapability> = Record<string, uiMod.ElementCapability>,
  >(
    name: string,
    slots: TuiSlotHandle[],
    structure: string,
    target_platforms?: readonly uiMod.Platform<TuiElementHandle>[],
  ) => TuiViewHandle<S>;
  readonly tuiComponent: <P = unknown>(
    name: string,
    props_type: string,
    view: uiMod.View<TuiElementHandle>,
  ) => TuiComponentHandle<P>;
  readonly tuiAttachStyle: (
    style: uiMod.Style<string, TuiElementHandle>,
    view: uiMod.View<TuiElementHandle>,
  ) => uiMod.Style<string, TuiElementHandle>;
  readonly tuiAttachBehavior: (
    behavior: uiMod.Behavior<Record<string, uiMod.ElementCapability>, TuiElementHandle>,
    view: uiMod.View<TuiElementHandle>,
  ) => uiMod.Behavior<Record<string, uiMod.ElementCapability>, TuiElementHandle>;
}

export interface NodeNamespace<C extends GenConfig = GenConfig> {
  readonly _config?: C;
  define: typeof core.defineNode;
  register: (node: core.StaticNode) => void;
}

export interface KeyNamespace<C extends GenConfig = GenConfig> {
  readonly _config?: C;
  family: typeof reactivityMod.defineKeyFamily;
  entity: typeof reactivityMod.entityKeyFamily;
  collection: typeof reactivityMod.collectionKeyFamily;
  custom: typeof reactivityMod.customKeyFamily;
  key: typeof reactivityMod.key;
  any: typeof reactivityMod.anyKey;
  match: typeof reactivityMod.matchKey;
  expr: typeof reactivityMod.keyExpr;
  patternExpr: typeof reactivityMod.keyPatternExpr;
}

export interface ReactivityNamespace<C extends GenConfig = GenConfig> {
  readonly _config?: C;
  resource: typeof reactivityMod.defineReactiveResource;
  mutation: typeof reactivityMod.defineReactiveMutation;
  all: typeof reactivityMod.defineResourceAll;
  chain: typeof reactivityMod.defineResourceChain;
  registry: typeof reactivityMod.defineReactiveRegistry;
  scope: typeof reactivityMod.defineTrackingScope;
  optimistic: typeof reactivityMod.defineOptimisticPlan;
  invalidates: typeof reactivityMod.invalidates;
  graph: typeof reactivityMod.deriveReactiveGraph;
  affectedResourcesForMutation: typeof reactivityMod.affectedResourcesForMutation;
  affectedRoutesForMutation: typeof reactivityMod.affectedRoutesForMutation;
  affectedFormsForMutation: typeof reactivityMod.affectedFormsForMutation;
  affectedSubscriptionsForMutation: typeof reactivityMod.affectedSubscriptionsForMutation;
  affectedKeysForMutation: typeof reactivityMod.affectedKeysForMutation;
  staleQueriesForKeys: typeof reactivityMod.staleQueriesForKeys;
  entitiesWrittenByAction: typeof reactivityMod.entitiesWrittenByAction;
  entitiesWrittenByMutation: typeof reactivityMod.entitiesWrittenByMutation;
  actionsWritingEntity: typeof reactivityMod.actionsWritingEntity;
  mutationsWritingEntity: typeof reactivityMod.mutationsWritingEntity;
  graphArtifact: (graph: reactivityMod.ReactiveGraph, path?: string) => core.Artifact;
  singleFlight: typeof reactivityMod.deriveSingleFlightPlan;
  ruleInvalidations: typeof reactivityMod.deriveRuleInvalidationPlans;
  ivmPlans: typeof reactivityMod.deriveIvmPlans;
  editableFields: typeof reactivityMod.deriveEditableFieldsForRule;
  editabilityRules: typeof reactivityMod.deriveEditabilityRulesForField;
  checkOptimisticPlans: typeof reactivityMod.checkOptimisticPlans;
  refresh: {
    manual: typeof reactivityMod.refreshManual;
    onMount: typeof reactivityMod.refreshOnMount;
    onInvalidate: typeof reactivityMod.refreshOnInvalidate;
    interval: typeof reactivityMod.refreshInterval;
  };
}

export interface RouterNamespace<C extends GenConfig = GenConfig> {
  readonly _config?: C;
  route: typeof routerMod.defineAppRoute;
  link: typeof routerMod.link;
}

export interface HydrationNamespace<C extends GenConfig = GenConfig> {
  readonly _config?: C;
  /** Derive a hydration snapshot for an app route. */
  plan: (route: AppRoute) => hydrationMod.HydrationSnapshot;
  artifact: typeof hydrationMod.hydrationSnapshotArtifact;
}

export interface ServicesNamespace<C extends GenConfig = GenConfig> {
  readonly _config?: C;
  define: typeof servicesMod.defineServiceRef;
  method: typeof servicesMod.defineMethodRef;
  graph: () => servicesMod.ModuleGraph;
}

export interface RulesNamespace<C extends GenConfig = GenConfig> {
  readonly _config?: C;
  define: typeof rulesMod.defineRule;
  literal: typeof rulesMod.ruleLiteral;
  var: typeof rulesMod.ruleVar;
  field: typeof rulesMod.ruleField;
  eq: typeof rulesMod.ruleEq;
  compare: typeof rulesMod.ruleCompare;
  and: typeof rulesMod.ruleAnd;
  or: typeof rulesMod.ruleOr;
  not: typeof rulesMod.ruleNot;
  exists: typeof rulesMod.ruleExists;
  dependencies: typeof rulesMod.extractRuleDependencies;
  translateSql: typeof rulesMod.translateRuleToSql;
  sqlPredicate: typeof rulesMod.ruleToSqlPredicate;
  rlsPolicy: typeof rulesMod.ruleToRlsPolicy;
  translateSqlWithBindings: typeof rulesMod.translateRuleToSqlWithBindings;
  evaluate: typeof rulesMod.evaluateRule;
  analyzePlacement: typeof rulesMod.analyzeRulePlacement;
  classifyPlacement: typeof rulesMod.classifyRulePlacement;
}

export interface ReactionNamespace<C extends GenConfig = GenConfig> {
  readonly _config?: C;
  define: typeof reactionMod.defineReaction;
}

export interface AuthzSurfaceNamespace<C extends GenConfig = GenConfig> {
  readonly _config?: C;
  entityRead: typeof authzMod.entityRead;
  entityCreate: typeof authzMod.entityCreate;
  entityUpdate: typeof authzMod.entityUpdate;
  entityDelete: typeof authzMod.entityDelete;
  fieldRead: typeof authzMod.fieldRead;
  fieldWrite: typeof authzMod.fieldWrite;
  relationRead: typeof authzMod.relationRead;
  relationLink: typeof authzMod.relationLink;
  relationUnlink: typeof authzMod.relationUnlink;
  actionExecute: typeof authzMod.actionExecute;
  queryFilter: typeof authzMod.queryFilter;
  routeEnter: typeof authzMod.routeEnter;
  formSubmit: typeof authzMod.formSubmit;
  uiHint: typeof authzMod.uiHint;
  binding: typeof authzMod.defineAccessSurfaceBinding;
  defaultDeny: typeof authzMod.deriveDefaultDeny;
}

export interface UiBackendRegistry {
  jsx: {
    element: JsxElementHandle;
    namespace: JsxUiNamespaceExtensions;
  };
  tui: {
    element: TuiElementHandle;
    namespace: TuiUiNamespaceExtensions;
  };
}

export type KnownUiBackend = keyof UiBackendRegistry;

export interface UiNamespaceOptions<B extends string = "jsx"> {
  readonly backend: B;
}

export interface CustomUiNamespaceFactory<
  B extends string = string,
  N extends object = object,
  E = unknown,
> {
  readonly backend: B;
  readonly create: (ctx: GenContext, base: BaseUiNamespace) => N;
  readonly _element?: E;
}

export interface UiNamespaceRuntimeOptions<B extends string = "jsx"> extends UiNamespaceOptions<B> {
  readonly factory?: CustomUiNamespaceFactory<B>;
}

export type BaseUiNamespace = {
  cap: typeof uiMod.cap;
  collection: typeof uiMod.collection;
  container: typeof uiMod.container;
  view: typeof uiMod.defineView;
  component: typeof uiMod.defineComponent;
  style: typeof uiMod.defineStyle;
  behavior: typeof uiMod.defineBehavior;
  theme: typeof uiMod.defineTheme;
  platform: typeof uiMod.definePlatform;
  renderer: typeof uiMod.defineRenderer;
  form: typeof uiMod.defineForm;
  widget: typeof uiMod.defineWidget;
  slot: typeof uiMod.defineSlot;
  formField: typeof uiMod.defineFormField;
  errorMapping: typeof uiMod.defineFormErrorMapping;
  safeHtml: typeof uiMod.safeHtml;
  attachStyle: typeof uiMod.attachStyleToView;
  attachBehavior: typeof uiMod.attachBehaviorToView;
};

type UiBackendExtensions<B> = B extends KnownUiBackend ? UiBackendRegistry[B]["namespace"] : {};

type UiNamespaceForBackend<B> = BaseUiNamespace & UiBackendExtensions<B>;

/**
 * The user-facing `gen` namespace aggregates every public constructor so domain
 * models can be declared fluently. Each property maps to a module's public
 * surface; plugins may extend this object at runtime via `ctx.helpers`.
 *
 * Generic over `C extends GenConfig` so that per-namespace backend options
 * flow through the type system from `createGen<Config>()` down to individual
 * constructors.
 */
export interface Gen<C extends GenConfig = GenConfig> extends GenPluginExtensions {
  /** Phantom reference to the config type so the parameter is considered used. */
  readonly _config?: C;
  // Types namespace: semantic types, operations, capabilities, effects, laws
  types: {
    // Primitive semantic types
    string: typeof semantic.string;
    int: typeof semantic.int;
    bigint: typeof semantic.bigint;
    decimal: typeof semantic.decimal;
    money: typeof semantic.money;
    boolean: typeof semantic.boolean;
    uuid: typeof semantic.uuid;
    datetime: typeof semantic.datetime;
    date: typeof semantic.date;
    timestamp: typeof semantic.timestamp;
    json: typeof semantic.json;
    email: typeof semantic.email;
    url: typeof semantic.url;
    phone: typeof semantic.phone;
    duration: typeof semantic.duration;
    bytes: typeof semantic.bytes;

    // Composite semantic types
    enumOf: typeof semantic.enumOf;
    array: typeof semantic.arrayOf;
    struct: typeof semantic.struct;
    tagged: typeof semantic.tagged;
    object: typeof semantic.object;
    literal: typeof semantic.literal;
    brand: typeof semantic.brand;
    withTrait: typeof semantic.withTrait;

    // Custom type constructors
    custom: typeof semantic.custom;
    factory: typeof semantic.factory;
    extend: typeof semantic.extend;
    nullable: typeof semantic.nullable;

    // Serializer
    serializer: typeof semantic.defineSerializer;

    // Trait
    trait: typeof traitMod.defineTrait;

    // Operations
    op: {
      unary: typeof opMod.unaryOp;
      binary: typeof opMod.binaryOp;
      comparison: typeof opMod.comparisonOp;
      aggregate: typeof opMod.aggregateOp;
      reducer: typeof opMod.reducerOp;
      predicate: typeof opMod.predicateOp;
      effect: typeof opMod.effectOp;
    };

    // Capabilities
    cap: {
      pure: typeof opMod.capPure;
      deterministic: typeof opMod.capDeterministic;
      reversible: typeof opMod.capReversible;
      partial: typeof opMod.capPartial;
      total: typeof opMod.capTotal;
      async: typeof opMod.capAsync;
      effectful: typeof opMod.capEffectful;
      transactional: typeof opMod.capTransactional;
      idempotentEffect: typeof opMod.capIdempotentEffect;
      cacheable: typeof opMod.capCacheable;
      clientSafe: typeof opMod.capClientSafe;
      serverOnly: typeof opMod.capServerOnly;
    };

    // Effects
    effect: {
      network: typeof opMod.effectNetwork;
      email: typeof opMod.effectEmail;
      dbRead: typeof opMod.effectDbRead;
      dbWrite: typeof opMod.effectDbWrite;
      fsRead: typeof opMod.effectFsRead;
      fsWrite: typeof opMod.effectFsWrite;
      crypto: typeof opMod.effectCrypto;
      clock: typeof opMod.effectClock;
      random: typeof opMod.effectRandom;
      queue: typeof opMod.effectQueue;
      payment: typeof opMod.effectPayment;
      cacheRead: typeof opMod.effectCacheRead;
      cacheWrite: typeof opMod.effectCacheWrite;
    };

    // Laws
    law: {
      associative: typeof opMod.lawAssociative;
      commutative: typeof opMod.lawCommutative;
      idempotent: typeof opMod.lawIdempotent;
      identity: typeof opMod.lawIdentity;
      inverse: typeof opMod.lawInverse;
      distributive: typeof opMod.lawDistributive;
    };

    // Representations (for advanced use)
    repr: typeof repr;
  };

  // Entities
  entity: typeof entityMod.defineEntity;

  // Custom application-level nodes
  node: NodeNamespace<C>;

  // Portable reactivity/cache keys
  key: KeyNamespace<C>;

  // Target-agnostic reactivity resources and mutations
  reactivity: ReactivityNamespace<C>;

  // Typed app routes
  router: RouterNamespace<C>;

  // Hydration snapshot plans
  hydration: HydrationNamespace<C>;

  // Service references and module graph
  services: ServicesNamespace<C>;

  // Typed rules
  rule: RulesNamespace<C>;

  // Reactions
  reaction: ReactionNamespace<C>;

  // Expressions
  expr: {
    literal: typeof exprMod.semanticLiteral;
    field: typeof exprMod.fieldRef;
    applyUnary: typeof exprMod.applyUnary;
    applyBinary: typeof exprMod.applyBinary;
    applyComparison: typeof exprMod.applyComparison;
    applyAggregate: typeof exprMod.applyAggregate;
    build: typeof exprMod.buildExpr;
    predicate: typeof exprMod.buildPredicate;
    builder: typeof exprMod.exprBuilder;
    inputs: typeof exprMod.exprInputs;
  };

  // Storage
  store: typeof storageMod.defineStore;
  table: typeof storageMod.defineTable;
  column: typeof storageMod.defineColumn;
  mapping: typeof storageMod.defineMapping;
  projection: typeof storageMod.defineProjection;
  schema: typeof storageMod.defineSchema;
  schemaInput: typeof storageMod.schemaTargetInput;
  fieldMapping: typeof storageMod.fieldMapping;
  mapField: typeof storageMod.mapField;
  readOnlySource: typeof storageMod.readOnlySource;
  hiddenSource: typeof storageMod.hiddenSource;
  // Rich mapping source builders
  buildColumnSource: typeof storageMod.buildColumnSource;
  buildExpressionSource: typeof storageMod.buildExpressionSource;
  buildQueryBackedSource: typeof storageMod.buildQueryBackedSource;
  buildAggregateSource: typeof storageMod.buildAggregateSource;
  buildServiceCallSource: typeof storageMod.buildServiceCallSource;
  buildColumnTarget: typeof storageMod.buildColumnTarget;
  buildExpressionTarget: typeof storageMod.buildExpressionTarget;
  buildComputedTarget: typeof storageMod.buildComputedTarget;
  buildServiceCallTarget: typeof storageMod.buildServiceCallTarget;
  // Reversible transforms
  oneWayTransform: typeof storageMod.oneWayTransform;
  bidirectionalTransform: typeof storageMod.bidirectionalTransform;
  // High-level mapping builders
  readMapping: typeof storageMod.readMapping;
  writeMapping: typeof storageMod.writeMapping;
  mixedMapping: typeof storageMod.mixedMapping;
  reversibleMapping: typeof storageMod.reversibleMapping;

  // Relations
  relation: typeof relationMod.defineRelation;
  relationEntity: typeof relationMod.defineRelationEntity;
  graph: typeof relationMod.defineGraph;
  rel: {
    oneToOne: typeof relationMod.oneToOne;
    oneToMany: typeof relationMod.oneToMany;
    manyToOne: typeof relationMod.manyToOne;
    manyToMany: typeof relationMod.manyToMany;
    integrityDbFk: typeof relationMod.integrityDbFk;
    integrityAppChecked: typeof relationMod.integrityAppChecked;
    integrityUnchecked: typeof relationMod.integrityUnchecked;
    foreignKey: typeof relationMod.foreignKey;
    fkCascade: typeof relationMod.fkCascade;
    fkRestrict: typeof relationMod.fkRestrict;
    fkSetNull: typeof relationMod.fkSetNull;
    fkSetDefault: typeof relationMod.fkSetDefault;
    fkNoAction: typeof relationMod.fkNoAction;
    appDeletion: typeof relationMod.appDeletion;
  };

  // Runtimes
  runtime: typeof runtimeMod.defineRuntime;

  // Queries
  query: {
    build: typeof queryMod.buildQuery;
    from: typeof queryMod.fromEntity;
    buildProjectedField: typeof queryMod.buildProjectedField;
    buildAggregateProjection: typeof queryMod.buildAggregateProjection;
    buildProjection: typeof queryMod.buildQueryProjection;
    buildOrderByClause: typeof queryMod.buildOrderByClause;
    buildJoinClause: typeof queryMod.buildJoinClause;
    queryBackedField: typeof queryMod.queryBackedField;
    createQueryPlan: typeof queryMod.createQueryPlan;
    createQueryPlanner: typeof queryMod.createQueryPlanner;
    crossStoreQuery: typeof queryMod.crossStoreQuery;
  };

  // Functions
  func: {
    catalog: typeof functionMod.emptyFunctionCatalog;
    static: typeof functionMod.defineStaticFunction;
    expr: typeof functionMod.defineExprFunction;
    predicate: typeof functionMod.definePredicateFunction;
    query: typeof functionMod.defineQueryFunction;
    action: typeof functionMod.defineActionFunction;
    patch: typeof functionMod.definePatchFunction;
    plan: typeof functionMod.definePlanFunction;
    buildActionInsert: typeof functionMod.buildActionInsert;
    buildActionUpdate: typeof functionMod.buildActionUpdate;
    buildActionDelete: typeof functionMod.buildActionDelete;
    buildActionInvalidate: typeof functionMod.buildActionInvalidate;
    buildActionSequence: typeof functionMod.buildActionSequence;
    buildPatchInsert: typeof functionMod.buildPatchInsert;
    buildPatchUpdate: typeof functionMod.buildPatchUpdate;
    buildPatchDelete: typeof functionMod.buildPatchDelete;
    error: {
      conflict: typeof functionMod.errorConflict;
      validation: typeof functionMod.errorValidation;
      auth: typeof functionMod.errorAuth;
      notFound: typeof functionMod.errorNotFound;
      forbidden: typeof functionMod.errorForbidden;
    };
    consistency: {
      transactional: typeof functionMod.consistencyTransactional;
      eventual: typeof functionMod.consistencyEventual;
      bestEffort: typeof functionMod.consistencyBestEffort;
    };
  };

  // API
  api: {
    buildQueryHandler: typeof apiMod.buildQueryHandler;
    buildActionHandler: typeof apiMod.buildActionHandler;
    buildStaticHandler: typeof apiMod.buildStaticHandler;
    resource: typeof apiMod.defineResource;
    route: typeof apiMod.defineRoute;
    getter: typeof apiMod.defineGetter;
    mutator: typeof apiMod.defineMutator;
  };

  // UI
  ui: UiNamespaceForBackend<InferUiBackend<C>>;

  // Authz
  authz: {
    policy: typeof authzMod.definePolicy;
    allowAuthenticated: typeof authzMod.allowAuthenticated;
    allowPublic: typeof authzMod.allowPublic;
    allowRole: typeof authzMod.allowRole;
    allowOwner: typeof authzMod.allowOwner;
    allowRelation: typeof authzMod.allowRelation;
    or: typeof authzMod.or;
    surface: AuthzSurfaceNamespace<C>;
    matrix: typeof authzMod.deriveAccessMatrix;
    plan: <In, Out>(
      action: import("../function/index.ts").ActionFunction<In, Out>,
    ) => import("../authz/index.ts").MutationAccessPlan<In, Out>;
  };

  // Events
  events: {
    event: typeof eventsMod.defineEvent;
    emit: typeof eventsMod.emit;
    reducer: typeof eventsMod.defineReducer;
    subscription: typeof eventsMod.defineSubscription;
  };

  // Forms
  forms: {
    build: typeof formsMod.buildForm;
    auto: typeof formsMod.autoForm;
    field: typeof formsMod.formField;
    defaultWidget: typeof formsMod.defaultWidget;
    inferWidgetKind: typeof formsMod.inferWidgetKind;
    controlFor: typeof formsMod.controlFor;
    errorMapping: typeof formsMod.errorMapping;
  };

  // Editor
  editor: {
    define: typeof editorMod.defineEditor;
    auto: typeof editorMod.autoEditor;
    fieldOverride: typeof editorMod.fieldOverride;
    section: typeof editorMod.editorSection;
    nested: typeof editorMod.nestedEditor;
    command: typeof editorMod.editorCommand;
  };

  // CRUD
  crud: {
    derive: typeof crudMod.deriveCrud;
  };

  // List
  list: {
    define: typeof listMod.defineList;
    auto: typeof listMod.autoList;
    column: typeof listMod.listColumn;
    offsetPagination: typeof listMod.offsetPagination;
    cursorPagination: typeof listMod.cursorPagination;
    action: typeof listMod.listAction;
    bulkAction: typeof listMod.listBulkAction;
  };

  // Admin
  admin: {
    define: typeof adminMod.defineAdmin;
    auto: typeof adminMod.autoAdmin;
    page: {
      list: typeof adminMod.adminListPage;
      editor: typeof adminMod.adminEditorPage;
      dashboard: typeof adminMod.adminDashboardPage;
    };
    route: typeof adminMod.adminRoute;
  };

  // Lifecycle
  lifecycle: {
    check: typeof lifecycleMod.check;
    generate: typeof lifecycleMod.generate;
    standardPhases: typeof lifecycleMod.standardPhases;
  };

  // Core
  contract: typeof core.defineContract;
  actor: typeof core.defineActor;
  config: {
    entry: typeof core.defineConfigEntry;
    define: typeof core.defineConfig;
    defaultInstance: typeof core.defineDefaultInstance;
  };
  env: {
    schema: typeof core.defineEnvSchema;
    string: typeof core.envString;
    url: typeof core.envUrl;
    number: typeof core.envNumber;
    boolean: typeof core.envBoolean;
    json: typeof core.envJson;
    requires: typeof core.envRequires;
  };

  // Plugin
  definePlugin: typeof core.definePlugin;
}

/**
 * The types namespace exposed on `gen.types`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type TypesNamespace<C extends GenConfig = GenConfig> = Gen<C>["types"];
/**
 * The expression namespace exposed on `gen.expr`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type ExpressionNamespace<C extends GenConfig = GenConfig> = Gen<C>["expr"];
/**
 * The relation shorthand namespace exposed on `gen.rel`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type RelationNamespace<C extends GenConfig = GenConfig> = Gen<C>["rel"];
/**
 * The query namespace exposed on `gen.query`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type QueryNamespace<C extends GenConfig = GenConfig> = Gen<C>["query"];
/**
 * The function namespace exposed on `gen.func`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type FunctionNamespace<C extends GenConfig = GenConfig> = Gen<C>["func"];
/**
 * The API namespace exposed on `gen.api`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type ApiNamespace<C extends GenConfig = GenConfig> = Gen<C>["api"];
/**
 * The UI namespace exposed on `gen.ui`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type UiNamespace<C extends GenConfig = GenConfig> = Gen<C>["ui"];
/**
 * The authorization namespace exposed on `gen.authz`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type AuthzNamespace<C extends GenConfig = GenConfig> = Gen<C>["authz"];
/**
 * The events namespace exposed on `gen.events`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type EventsNamespace<C extends GenConfig = GenConfig> = Gen<C>["events"];
/**
 * The forms namespace exposed on `gen.forms`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type FormsNamespace<C extends GenConfig = GenConfig> = Gen<C>["forms"];
/**
 * The admin namespace exposed on `gen.admin`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type AdminNamespace<C extends GenConfig = GenConfig> = Gen<C>["admin"];
/**
 * The lifecycle namespace exposed on `gen.lifecycle`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type LifecycleNamespace<C extends GenConfig = GenConfig> = Gen<C>["lifecycle"];
/**
 * The config namespace exposed on `gen.config`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type ConfigNamespace<C extends GenConfig = GenConfig> = Gen<C>["config"];
/**
 * The environment namespace exposed on `gen.env`.
 * @typeParam C - The GenConfig used for backend-specific typing.
 */
export type EnvNamespace<C extends GenConfig = GenConfig> = Gen<C>["env"];

/**
 * The result returned by {@link createGen}, pairing the mutable context with
 * the user-facing `gen` namespace.
 * @typeParam C - The GenConfig used for backend-specific typing.
 * @typeParam G - The full `gen` type (including plugin helpers).
 */
export interface CreateGenResult<C extends GenConfig = GenConfig, G = Gen<C>> {
  readonly ctx: GenContext;
  readonly gen: G;
}
