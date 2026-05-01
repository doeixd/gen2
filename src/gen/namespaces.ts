/**
 * Namespace factories for the Gen API.
 *
 * @module
 */

import * as semantic from "../types/semantic.ts";
import * as opMod from "../types/operation.ts";
import * as repr from "../types/representation.ts";
import * as traitMod from "../types/trait.ts";
import * as exprMod from "../expression/index.ts";
import * as relationMod from "../relation/index.ts";
import * as queryMod from "../query/index.ts";
import * as functionMod from "../function/index.ts";
import * as apiMod from "../api/index.ts";
import * as authzMod from "../authz/index.ts";
import * as formsMod from "../forms/index.ts";
import * as adminMod from "../admin/index.ts";
import * as lifecycleMod from "../lifecycle/index.ts";
import * as core from "../core/index.ts";
import * as reactivityMod from "../reactivity/index.ts";
import * as routerMod from "../router/index.ts";
import * as hydrationMod from "../hydration/index.ts";
import * as servicesMod from "../services/index.ts";
import * as rulesMod from "../rules/index.ts";
import * as reactionMod from "../reaction/index.ts";
import * as planMod from "../plan/index.ts";
import * as contextMod from "../context/index.ts";
import * as locationsMod from "../storage/locations.ts";
import * as requirementsMod from "../requirements/index.ts";
import * as stateMod from "../state/index.ts";
import * as mergeMod from "../merge/index.ts";
import * as offlineMod from "../offline/index.ts";
import * as orchestrationMod from "../orchestration/index.ts";
import * as workflowMod from "../workflow/index.ts";
import * as boundaryMod from "../boundary/index.ts";
import * as obligationsMod from "../obligations/index.ts";
import * as targetsMod from "../targets/index.ts";

import type { GenContext } from "../core/index.ts";
import {
  bindSerializer,
  bindOneToOne,
  bindOneToMany,
  bindManyToOne,
  bindManyToMany,
  bindBuildQuery,
  bindFromEntity,
  bindStaticFunction,
  bindExprFunction,
  bindPredicateFunction,
  bindQueryFunction,
  bindActionFunction,
  bindPatchFunction,
  bindPlanFunction,
  bindRoute,
  bindResource,
  bindGetter,
  bindMutator,
  bindPolicy,
  bindEvent,
  bindEmit,
  bindReducer,
  bindSubscription,
  bindConfigEntry,
  bindConfig,
  bindDefaultInstance,
  bindKeyFamily,
  bindReactiveMutation,
  bindReactiveResource,
  bindStreamResource,
  bindDerivedResource,
  bindReactiveRuntime,
  bindServiceLayer,
  bindLifecycleRequirement,
  bindResourceAll,
  bindResourceChain,
  bindReactiveRegistry,
  bindAppRoute,
  bindTrackingScope,
  bindServiceRef,
} from "./binders.ts";

import type {
  GenConfig,
  TypesNamespace,
  ExpressionNamespace,
  RelationNamespace,
  QueryNamespace,
  FunctionNamespace,
  ApiNamespace,
  AuthzNamespace,
  EventsNamespace,
  FormsNamespace,
  AdminNamespace,
  LifecycleNamespace,
  ConfigNamespace,
  EnvNamespace,
  KeyNamespace,
  ReactivityNamespace,
  RouterNamespace,
  HydrationNamespace,
  ServicesNamespace,
  RulesNamespace,
  ReactionNamespace,
  AuthzSurfaceNamespace,
  NodeNamespace,
  PlanNamespace,
  ContextNamespace,
  StorageLocationNamespace,
  RequirementNamespace,
  ProviderNamespace,
  StateNamespace,
  MergeNamespace,
  OfflineNamespace,
  ScheduleNamespace,
  CronNamespace,
  WorkflowNamespace,
  BoundaryNamespace,
  ObligationsNamespace,
  TargetsNamespace,
} from "./types.ts";

export const createKeyNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): KeyNamespace<C> => ({
  family: bindKeyFamily(ctx),
  entity: ((entity) => {
    const family = reactivityMod.entityKeyFamily(entity);
    ctx.key_families.push(family);
    ctx.refs.push(family.ref);
    return family;
  }) as typeof reactivityMod.entityKeyFamily,
  collection: ((entity) => {
    const family = reactivityMod.collectionKeyFamily(entity);
    ctx.key_families.push(family);
    ctx.refs.push(family.ref);
    return family;
  }) as typeof reactivityMod.collectionKeyFamily,
  custom: bindKeyFamily(ctx),
  key: reactivityMod.key,
  any: reactivityMod.anyKey,
  match: reactivityMod.matchKey,
  expr: reactivityMod.keyExpr,
  patternExpr: reactivityMod.keyPatternExpr,
});

export const createReactivityNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): ReactivityNamespace<C> => ({
  resource: bindReactiveResource(ctx),
  mutation: bindReactiveMutation(ctx),
  stream: bindStreamResource(ctx),
  derived: bindDerivedResource(ctx),
  all: bindResourceAll(ctx),
  chain: bindResourceChain(ctx),
  registry: bindReactiveRegistry(ctx),
  scope: bindTrackingScope(ctx),
  optimistic: reactivityMod.defineOptimisticPlan,
  invalidates: reactivityMod.invalidates,
  graph: reactivityMod.deriveReactiveGraph,
  affectedResourcesForMutation: reactivityMod.affectedResourcesForMutation,
  affectedRoutesForMutation: reactivityMod.affectedRoutesForMutation,
  affectedFormsForMutation: reactivityMod.affectedFormsForMutation,
  affectedSubscriptionsForMutation: reactivityMod.affectedSubscriptionsForMutation,
  affectedKeysForMutation: reactivityMod.affectedKeysForMutation,
  staleQueriesForKeys: reactivityMod.staleQueriesForKeys,
  entitiesWrittenByAction: reactivityMod.entitiesWrittenByAction,
  entitiesWrittenByMutation: reactivityMod.entitiesWrittenByMutation,
  actionsWritingEntity: reactivityMod.actionsWritingEntity,
  mutationsWritingEntity: reactivityMod.mutationsWritingEntity,
  graphArtifact: (graph: reactivityMod.ReactiveGraph, path?: string) =>
    reactivityMod.reactiveGraphArtifact(graph, path, ctx),
  singleFlight: reactivityMod.deriveSingleFlightPlan,
  ruleInvalidations: reactivityMod.deriveRuleInvalidationPlans,
  ivmPlans: reactivityMod.deriveIvmPlans,
  patchPlans: reactivityMod.deriveRulePatchPlans,
  editableFields: reactivityMod.deriveEditableFieldsForRule,
  editabilityRules: reactivityMod.deriveEditabilityRulesForField,
  checkOptimisticPlans: reactivityMod.checkOptimisticPlans,
  runtime: bindReactiveRuntime(ctx),
  serviceLayer: bindServiceLayer(ctx),
  lifecycleRequirement: bindLifecycleRequirement(ctx),
  refresh: {
    manual: reactivityMod.refreshManual,
    onMount: reactivityMod.refreshOnMount,
    onInvalidate: reactivityMod.refreshOnInvalidate,
    interval: reactivityMod.refreshInterval,
  },
});

export const createRouterNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): RouterNamespace<C> => ({
  route: bindAppRoute(ctx),
  link: routerMod.link,
});

export const createHydrationNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): HydrationNamespace<C> => ({
  plan: (route) => hydrationMod.deriveHydrationPlan(ctx, route),
  artifact: hydrationMod.hydrationSnapshotArtifact,
  httpRpcTransport: hydrationMod.httpRpcTransport,
  httpFormPostTransport: hydrationMod.httpFormPostTransport,
  websocketTransport: hydrationMod.websocketTransport,
  serverSentEventsTransport: hydrationMod.serverSentEventsTransport,
  fixture: hydrationMod.generateBundledFetchFixture,
  projection: hydrationMod.defineSafeProjection,
  serializationContract: hydrationMod.defineSerializationContract,
});

export const createServicesNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): ServicesNamespace<C> => ({
  define: bindServiceRef(ctx),
  method: servicesMod.defineMethodRef,
  graph: () => servicesMod.deriveModuleGraph(ctx),
});

export const createRulesNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): RulesNamespace<C> => ({
  define: ((input) => {
    const rule = rulesMod.defineRule(input as never);
    ctx.rules.push(rule);
    return rule;
  }) as typeof rulesMod.defineRule,
  literal: rulesMod.ruleLiteral,
  var: rulesMod.ruleVar,
  field: rulesMod.ruleField,
  eq: rulesMod.ruleEq,
  compare: rulesMod.ruleCompare,
  and: rulesMod.ruleAnd,
  or: rulesMod.ruleOr,
  not: rulesMod.ruleNot,
  exists: rulesMod.ruleExists,
  dependencies: rulesMod.extractRuleDependencies,
  translateSql: rulesMod.translateRuleToSql,
  sqlPredicate: rulesMod.ruleToSqlPredicate,
  rlsPolicy: rulesMod.ruleToRlsPolicy,
  translateSqlWithBindings: rulesMod.translateRuleToSqlWithBindings,
  evaluate: rulesMod.evaluateRule,
  analyzePlacement: rulesMod.analyzeRulePlacement,
  classifyPlacement: rulesMod.classifyRulePlacement,
  defineView: ((input) => {
    const view = rulesMod.defineDerivedRuleView(input);
    ctx.derived_rule_views.push(view);
    return view;
  }) as typeof rulesMod.defineDerivedRuleView,
  viewDependencies: rulesMod.extractRuleViewDependencies,
});

export const createReactionNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): ReactionNamespace<C> => ({
  define: ((input) => {
    const reaction = reactionMod.defineReaction(input as never);
    ctx.reactions.push(reaction);
    return reaction;
  }) as typeof reactionMod.defineReaction,
});

/**
 * Creates the `types` namespace for a Gen context.
 * @param ctx - The mutable Gen context.
 * @returns The types namespace.
 *
 * @example
 * ```ts
 * const types = createTypesNamespace(ctx);
 * const Email = types.string;
 * ```
 */
export const createTypesNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): TypesNamespace<C> => ({
  string: semantic.string,
  int: semantic.int,
  bigint: semantic.bigint,
  decimal: semantic.decimal,
  money: semantic.money,
  boolean: semantic.boolean,
  uuid: semantic.uuid,
  datetime: semantic.datetime,
  date: semantic.date,
  timestamp: semantic.timestamp,
  json: semantic.json,
  email: semantic.email,
  url: semantic.url,
  phone: semantic.phone,
  duration: semantic.duration,
  bytes: semantic.bytes,
  enumOf: semantic.enumOf,
  array: semantic.arrayOf,
  struct: semantic.struct,
  tagged: semantic.tagged,
  object: semantic.object,
  literal: semantic.literal,
  brand: semantic.brand,
  withTrait: semantic.withTrait,
  custom: semantic.custom,
  factory: semantic.factory,
  extend: semantic.extend,
  nullable: semantic.nullable,
  serializer: bindSerializer(ctx),
  withMerge: semantic.withMerge,
  trait: traitMod.defineTrait,
  op: {
    unary: opMod.unaryOp,
    binary: opMod.binaryOp,
    comparison: opMod.comparisonOp,
    aggregate: opMod.aggregateOp,
    reducer: opMod.reducerOp,
    predicate: opMod.predicateOp,
    effect: opMod.effectOp,
  },
  cap: {
    pure: opMod.capPure,
    deterministic: opMod.capDeterministic,
    reversible: opMod.capReversible,
    partial: opMod.capPartial,
    total: opMod.capTotal,
    async: opMod.capAsync,
    effectful: opMod.capEffectful,
    transactional: opMod.capTransactional,
    idempotentEffect: opMod.capIdempotentEffect,
    cacheable: opMod.capCacheable,
    clientSafe: opMod.capClientSafe,
    serverOnly: opMod.capServerOnly,
  },
  effect: {
    network: opMod.effectNetwork,
    email: opMod.effectEmail,
    dbRead: opMod.effectDbRead,
    dbWrite: opMod.effectDbWrite,
    fsRead: opMod.effectFsRead,
    fsWrite: opMod.effectFsWrite,
    crypto: opMod.effectCrypto,
    clock: opMod.effectClock,
    random: opMod.effectRandom,
    queue: opMod.effectQueue,
    payment: opMod.effectPayment,
    cacheRead: opMod.effectCacheRead,
    cacheWrite: opMod.effectCacheWrite,
  },
  law: {
    associative: opMod.lawAssociative,
    commutative: opMod.lawCommutative,
    idempotent: opMod.lawIdempotent,
    identity: opMod.lawIdentity,
    inverse: opMod.lawInverse,
    distributive: opMod.lawDistributive,
  },
  repr,
});

/**
 * Creates the `expr` namespace for building expressions.
 * @returns The expression namespace.
 *
 * @example
 * ```ts
 * const expr = createExpressionNamespace();
 * const nameExpr = expr.field(User, "name");
 * ```
 */
export const createExpressionNamespace = <
  C extends GenConfig = GenConfig,
>(): ExpressionNamespace<C> => ({
  literal: exprMod.semanticLiteral,
  field: exprMod.fieldRef,
  applyUnary: exprMod.applyUnary,
  applyBinary: exprMod.applyBinary,
  applyComparison: exprMod.applyComparison,
  applyAggregate: exprMod.applyAggregate,
  build: exprMod.buildExpr,
  predicate: exprMod.buildPredicate,
  builder: exprMod.exprBuilder,
  inputs: exprMod.exprInputs,
});

/**
 * Creates the `rel` namespace for a Gen context.
 * @param ctx - The mutable Gen context.
 * @returns The relation shorthand namespace.
 *
 * @example
 * ```ts
 * const rel = createRelationNamespace(ctx);
 * const userPosts = rel.oneToMany(User, Post, userPostsRel);
 * ```
 */
export const createRelationNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): RelationNamespace<C> => ({
  oneToOne: bindOneToOne(ctx),
  oneToMany: bindOneToMany(ctx),
  manyToOne: bindManyToOne(ctx),
  manyToMany: bindManyToMany(ctx),
  integrityDbFk: relationMod.integrityDbFk,
  integrityAppChecked: relationMod.integrityAppChecked,
  integrityUnchecked: relationMod.integrityUnchecked,
  foreignKey: relationMod.foreignKey,
  fkCascade: relationMod.fkCascade,
  fkRestrict: relationMod.fkRestrict,
  fkSetNull: relationMod.fkSetNull,
  fkSetDefault: relationMod.fkSetDefault,
  fkNoAction: relationMod.fkNoAction,
  appDeletion: relationMod.appDeletion,
});

/**
 * Creates the `query` namespace for a Gen context.
 * @param ctx - The mutable Gen context.
 * @returns The query namespace.
 *
 * @example
 * ```ts
 * const query = createQueryNamespace(ctx);
 * const q = query.from(User).where(...).build();
 * ```
 */
export const createQueryNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): QueryNamespace<C> => ({
  build: bindBuildQuery(ctx),
  from: bindFromEntity(ctx),
  buildProjectedField: queryMod.buildProjectedField,
  buildAggregateProjection: queryMod.buildAggregateProjection,
  buildProjection: queryMod.buildQueryProjection,
  buildOrderByClause: queryMod.buildOrderByClause,
  buildJoinClause: queryMod.buildJoinClause,
  queryBackedField: queryMod.queryBackedField,
  createQueryPlan: queryMod.createQueryPlan,
  createQueryPlanner: queryMod.createQueryPlanner,
  crossStoreQuery: queryMod.crossStoreQuery,
});

/**
 * Creates the `func` namespace for a Gen context.
 * @param ctx - The mutable Gen context.
 * @returns The function namespace.
 *
 * @example
 * ```ts
 * const func = createFunctionNamespace(ctx);
 * const myQuery = func.query("listUsers", ...);
 * ```
 */
export const createFunctionNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): FunctionNamespace<C> => ({
  catalog: functionMod.emptyFunctionCatalog,
  static: bindStaticFunction(ctx),
  expr: bindExprFunction(ctx),
  predicate: bindPredicateFunction(ctx),
  query: bindQueryFunction(ctx),
  action: bindActionFunction(ctx),
  patch: bindPatchFunction(ctx),
  plan: bindPlanFunction(ctx),
  buildActionInsert: functionMod.buildActionInsert,
  buildActionUpdate: functionMod.buildActionUpdate,
  buildActionDelete: functionMod.buildActionDelete,
  buildActionInvalidate: functionMod.buildActionInvalidate,
  buildActionSequence: functionMod.buildActionSequence,
  buildPatchInsert: functionMod.buildPatchInsert,
  buildPatchUpdate: functionMod.buildPatchUpdate,
  buildPatchDelete: functionMod.buildPatchDelete,
  error: {
    conflict: functionMod.errorConflict,
    validation: functionMod.errorValidation,
    auth: functionMod.errorAuth,
    notFound: functionMod.errorNotFound,
    forbidden: functionMod.errorForbidden,
  },
  consistency: {
    transactional: functionMod.consistencyTransactional,
    eventual: functionMod.consistencyEventual,
    bestEffort: functionMod.consistencyBestEffort,
  },
});

/**
 * Creates the `api` namespace for a Gen context.
 * @param ctx - The mutable Gen context.
 * @returns The API namespace.
 *
 * @example
 * ```ts
 * const api = createApiNamespace(ctx);
 * const route = api.route({ path: "/users", handler: ... });
 * ```
 */
export const createApiNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): ApiNamespace<C> => ({
  buildQueryHandler: apiMod.buildQueryHandler,
  buildActionHandler: apiMod.buildActionHandler,
  buildStaticHandler: apiMod.buildStaticHandler,
  resource: bindResource(ctx),
  route: bindRoute(ctx),
  getter: bindGetter(ctx),
  mutator: bindMutator(ctx),
});

/**
 * Creates the `authz` namespace for a Gen context.
 * @param ctx - The mutable Gen context.
 * @returns The authorization namespace.
 *
 * @example
 * ```ts
 * const authz = createAuthzNamespace(ctx);
 * const policy = authz.policy("users", authz.allowAuthenticated());
 * ```
 */
export const createAuthzNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): AuthzNamespace<C> => ({
  policy: bindPolicy(ctx),
  allowAuthenticated: authzMod.allowAuthenticated,
  allowPublic: authzMod.allowPublic,
  allowRole: authzMod.allowRole,
  allowOwner: authzMod.allowOwner,
  allowRelation: authzMod.allowRelation,
  or: authzMod.or,
  surface: createAuthzSurfaceNamespace<C>(ctx),
  matrix: authzMod.deriveAccessMatrix,
  plan: (action) => authzMod.deriveMutationAccessPlan(action, ctx.policies),
});

export const createAuthzSurfaceNamespace = <C extends GenConfig = GenConfig>(
  _ctx: GenContext,
): AuthzSurfaceNamespace<C> => ({
  entityRead: authzMod.entityRead,
  entityCreate: authzMod.entityCreate,
  entityUpdate: authzMod.entityUpdate,
  entityDelete: authzMod.entityDelete,
  fieldRead: authzMod.fieldRead,
  fieldWrite: authzMod.fieldWrite,
  relationRead: authzMod.relationRead,
  relationLink: authzMod.relationLink,
  relationUnlink: authzMod.relationUnlink,
  actionExecute: authzMod.actionExecute,
  queryFilter: authzMod.queryFilter,
  routeEnter: authzMod.routeEnter,
  formSubmit: authzMod.formSubmit,
  uiHint: authzMod.uiHint,
  binding: authzMod.defineAccessSurfaceBinding,
  defaultDeny: authzMod.deriveDefaultDeny,
});

/**
 * Creates the `events` namespace for a Gen context.
 * @param ctx - The mutable Gen context.
 * @returns The events namespace.
 *
 * @example
 * ```ts
 * const events = createEventsNamespace(ctx);
 * const userCreated = events.event("UserCreated");
 * ```
 */
export const createEventsNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): EventsNamespace<C> => ({
  event: bindEvent(ctx),
  emit: bindEmit(ctx),
  reducer: bindReducer(ctx),
  subscription: bindSubscription(ctx),
});

/**
 * Creates the `forms` namespace for a Gen context.
 * @param ctx - The mutable Gen context.
 * @returns The forms namespace.
 *
 * @example
 * ```ts
 * const forms = createFormsNamespace(ctx);
 * const form = forms.build("UserForm", ...);
 * ```
 */
export const createFormsNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): FormsNamespace<C> => ({
  build: ((name, source_function, submit_result, options) => {
    const form = formsMod.buildForm(name, source_function, submit_result, options);
    ctx.forms.push(form as any);
    return form;
  }) as typeof formsMod.buildForm,
  auto: formsMod.autoForm,
  field: formsMod.formField,
  defaultWidget: formsMod.defaultWidget,
  inferWidgetKind: formsMod.inferWidgetKind,
  controlFor: formsMod.controlFor,
  errorMapping: formsMod.errorMapping,
});

/**
 * Creates the `admin` namespace for a Gen context.
 * @returns The admin namespace.
 *
 * @example
 * ```ts
 * const admin = createAdminNamespace();
 * const page = admin.page.list("Users", userList);
 * ```
 */
export const createAdminNamespace = <C extends GenConfig = GenConfig>(): AdminNamespace<C> => ({
  define: adminMod.defineAdmin,
  auto: adminMod.autoAdmin,
  page: {
    list: adminMod.adminListPage,
    editor: adminMod.adminEditorPage,
    dashboard: adminMod.adminDashboardPage,
  },
  route: adminMod.adminRoute,
});

/**
 * Creates the `lifecycle` namespace.
 * @returns The lifecycle namespace.
 *
 * @example
 * ```ts
 * const lifecycle = createLifecycleNamespace();
 * lifecycle.check(ctx);
 * ```
 */
export const createLifecycleNamespace = <
  C extends GenConfig = GenConfig,
>(): LifecycleNamespace<C> => ({
  check: lifecycleMod.check,
  generate: lifecycleMod.generate,
  standardPhases: lifecycleMod.standardPhases,
});

/**
 * Creates the `config` namespace for a Gen context.
 * @param ctx - The mutable Gen context.
 * @returns The config namespace.
 *
 * @example
 * ```ts
 * const config = createConfigNamespace(ctx);
 * const entry = config.entry("API_URL", "string", "http://localhost");
 * ```
 */
export const createConfigNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): ConfigNamespace<C> => ({
  entry: bindConfigEntry(ctx),
  define: bindConfig(ctx),
  defaultInstance: bindDefaultInstance(ctx),
});

/**
 * Creates the `env` namespace.
 * @returns The environment namespace.
 *
 * @example
 * ```ts
 * const env = createEnvNamespace();
 * const dbUrl = env.string("DATABASE_URL");
 * ```
 */
export const createEnvNamespace = <C extends GenConfig = GenConfig>(): EnvNamespace<C> => ({
  schema: core.defineEnvSchema,
  string: core.envString,
  url: core.envUrl,
  number: core.envNumber,
  boolean: core.envBoolean,
  json: core.envJson,
  requires: core.envRequires,
});

/**
 * Creates the `node` namespace for custom application-level nodes.
 * @param ctx - The mutable Gen context.
 * @returns The node namespace.
 */
export const createNodeNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): NodeNamespace<C> => ({
  define: (input) => {
    const node = core.defineNode(input);
    core.registerNode(ctx, node);
    return node;
  },
  register: (node) => core.registerNode(ctx, node),
});

export const createPlanNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): PlanNamespace<C> => ({
  sequence: ((steps) => {
    const plan = planMod.sequencePlan(steps);
    ctx.composable_plans.push(plan);
    return plan;
  }) as typeof planMod.sequencePlan,
  parallel: ((branches) => {
    const plan = planMod.parallelPlan(branches);
    ctx.composable_plans.push(plan);
    return plan;
  }) as typeof planMod.parallelPlan,
  fallback: ((primary, alternative, reason) => {
    const plan = planMod.fallbackPlanNode(primary, alternative, reason);
    ctx.composable_plans.push(plan);
    return plan;
  }) as typeof planMod.fallbackPlanNode,
  map: ((source, mapper) => {
    const plan = planMod.mapPlan(source, mapper);
    ctx.composable_plans.push(plan);
    return plan;
  }) as typeof planMod.mapPlan,
  chain: ((first, second) => {
    const plan = planMod.chainPlan(first, second);
    ctx.composable_plans.push(plan);
    return plan;
  }) as typeof planMod.chainPlan,
  retry: ((target, max_attempts, backoff) => {
    const plan = planMod.retryPlan(target, max_attempts, backoff);
    ctx.composable_plans.push(plan);
    return plan;
  }) as typeof planMod.retryPlan,
  withPlacement: ((target, runtime, store) => {
    const plan = planMod.placementPlan(target, runtime, store);
    ctx.composable_plans.push(plan);
    return plan;
  }) as typeof planMod.placementPlan,
  isComposable: planMod.isComposableNode,
  validate: planMod.validatePlanComposition,
  deriveRequirements: planMod.derivePlanRequirements,
  deriveEffects: planMod.derivePlanEffects,
  checkFallback: planMod.checkPlanFallbackCompatibility,
});

export const createContextNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): ContextNamespace<C> => ({
  define: ((input) => {
    const context = contextMod.defineContext(input);
    ctx.contexts.push(context);
    return context;
  }) as typeof contextMod.defineContext,
  provide: ((input) => {
    const provision = contextMod.provideContext(input);
    ctx.context_provisions.push(provision);
    return provision;
  }) as typeof contextMod.provideContext,
  require: ((input) => {
    const requirement = contextMod.requireContext(input);
    ctx.context_requirements.push(requirement);
    return requirement;
  }) as typeof contextMod.requireContext,
});

export const createRequirementNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): RequirementNamespace<C> => ({
  define: ((input) => {
    const requirement = requirementsMod.defineRequirement(input);
    ctx.requirements.push(requirement);
    return requirement;
  }) as typeof requirementsMod.defineRequirement,
});

export const createProviderNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): ProviderNamespace<C> => ({
  define: ((input) => {
    const provider = requirementsMod.defineProvider(input);
    ctx.providers.push(provider);
    return provider;
  }) as typeof requirementsMod.defineProvider,
  source: requirementsMod.providerSource,
  plan: requirementsMod.deriveRequirementSatisfactionPlan,
});

export const createStateNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): StateNamespace<C> => ({
  define: ((input) => {
    const state = stateMod.defineStateResource(input);
    ctx.state_resources.push(state);
    return state;
  }) as typeof stateMod.defineStateResource,
});

export const createMergeNamespace = <C extends GenConfig = GenConfig>(): MergeNamespace<C> => ({
  replace: mergeMod.mergeReplace,
  lastWriteWins: mergeMod.mergeLastWriteWins,
  firstWriteWins: mergeMod.mergeFirstWriteWins,
  max: mergeMod.mergeMax,
  min: mergeMod.mergeMin,
  sumDelta: mergeMod.mergeSumDelta,
  append: mergeMod.mergeAppend,
  prepend: mergeMod.mergePrepend,
  setUnion: mergeMod.mergeSetUnion,
  setIntersection: mergeMod.mergeSetIntersection,
  addRemoveSet: mergeMod.mergeAddRemoveSet,
  byIdCollection: mergeMod.mergeByIdCollection,
  fieldWise: mergeMod.mergeFieldWise,
  stateMachine: mergeMod.mergeStateMachine,
  manualConflict: mergeMod.mergeManualConflict,
  rejectConflict: mergeMod.mergeRejectConflict,
  customExpr: mergeMod.mergeCustomExpr,
  opaqueRuntime: mergeMod.mergeOpaqueRuntime,
  plan: mergeMod.deriveEntityMergePlan,
});

export const createOfflineNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): OfflineNamespace<C> => ({
  envelope: ((input) => {
    const envelope = offlineMod.defineOfflineCommandEnvelope(input);
    ctx.offline_commands.push(envelope);
    return envelope;
  }) as typeof offlineMod.defineOfflineCommandEnvelope,
  queue: ((input) => {
    const queue = offlineMod.defineOfflineQueuePlan(input);
    ctx.offline_queues.push(queue);
    return queue;
  }) as typeof offlineMod.defineOfflineQueuePlan,
  check: offlineMod.checkOfflinePlans,
});

export const createStorageLocationNamespace = <
  C extends GenConfig = GenConfig,
>(): StorageLocationNamespace<C> => ({
  serverRequestContext: locationsMod.serverRequestContext,
  serverSessionStore: locationsMod.serverSessionStore,
  clientLocalStorage: locationsMod.clientLocalStorage,
  clientSessionStorage: locationsMod.clientSessionStorage,
  clientQueryCache: locationsMod.clientQueryCache,
  clientMemory: locationsMod.clientMemory,
  sharedCookie: locationsMod.sharedCookie,
  sharedDatabase: locationsMod.sharedDatabase,
  sharedCache: locationsMod.sharedCache,
  sharedQueue: locationsMod.sharedQueue,
});

export const createScheduleNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): ScheduleNamespace<C> => ({
  cron: orchestrationMod.cronExpression,
  interval: orchestrationMod.intervalExpression,
  daily: orchestrationMod.dailyExpression,
  weekly: orchestrationMod.weeklyExpression,
  define: ((input) => {
    const schedule = orchestrationMod.defineSchedule(input);
    ctx.schedules.push(schedule);
    return schedule;
  }) as typeof orchestrationMod.defineSchedule,
});

export const createCronNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): CronNamespace<C> => ({
  define: ((input) => {
    const job = orchestrationMod.defineCronJob(input);
    ctx.cron_jobs.push(job);
    return job;
  }) as typeof orchestrationMod.defineCronJob,
});

export const createWorkflowNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): WorkflowNamespace<C> => ({
  define: ((input) => {
    const workflow = workflowMod.defineWorkflow(input);
    ctx.workflows.push(workflow);
    return workflow;
  }) as typeof workflowMod.defineWorkflow,
  call: workflowMod.workflowCall,
  query: workflowMod.workflowQuery,
  action: workflowMod.workflowAction,
  sequence: workflowMod.workflowSequence,
  parallel: workflowMod.workflowParallel,
  branch: workflowMod.workflowBranch,
  wait: workflowMod.workflowWait,
  waitForEvent: workflowMod.workflowWaitForEvent,
  child: workflowMod.workflowChild,
  checkpoint: workflowMod.workflowCheckpoint,
  compensate: workflowMod.workflowCompensate,
  retry: workflowMod.workflowRetry,
  emit: workflowMod.workflowEmit,
  invalidate: workflowMod.workflowInvalidate,
});

export const createBoundaryNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): BoundaryNamespace<C> => ({
  browser: boundaryMod.browserBoundary,
  server: boundaryMod.serverBoundary,
  database: boundaryMod.databaseBoundary,
  worker: boundaryMod.workerBoundary,
  edge: boundaryMod.edgeBoundary,
  queue: boundaryMod.queueBoundary,
  externalService: boundaryMod.externalServiceBoundary,
  transport: ((input) => {
    const plan = boundaryMod.defineTransportPlan(input);
    return plan;
  }) as typeof boundaryMod.defineTransportPlan,
  callPlan: ((input) => {
    const plan = boundaryMod.defineBoundaryCallPlan(input);
    ctx.boundary_plans.push(plan);
    return plan;
  }) as typeof boundaryMod.defineBoundaryCallPlan,
  derive: () => boundaryMod.deriveBoundaryPlans(ctx),
});

export const createObligationsNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): ObligationsNamespace<C> => ({
  define: obligationsMod.defineSemanticObligation,
  derive: () => {
    const graph = obligationsMod.deriveObligationGraph(ctx);
    ctx.obligation_graphs.push(graph);
    return graph;
  },
});

export const createTargetsNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
): TargetsNamespace<C> => ({
  docs: () => targetsMod.generateDocsArtifacts(ctx),
  tests: () => targetsMod.generateTestSuites(ctx),
  devtools: () => targetsMod.generateDevtoolsGraph(ctx),
  server: () => targetsMod.lowerServerProviders(ctx),
  client: () => targetsMod.lowerClientProviders(ctx),
  matrix: () => targetsMod.buildTargetIntegrationMatrix(),
});
