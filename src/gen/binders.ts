/**
 * Context-bound binder factories for the Gen namespace.
 *
 * @module
 */

import * as core from "../core/index.ts";
import * as entityMod from "../entity/index.ts";
import * as storageMod from "../storage/index.ts";
import * as relationMod from "../relation/index.ts";
import * as runtimeMod from "../types/runtime.ts";
import * as queryMod from "../query/index.ts";
import * as functionMod from "../function/index.ts";
import * as apiMod from "../api/index.ts";
import * as uiMod from "../ui/index.ts";
import * as authzMod from "../authz/index.ts";
import * as eventsMod from "../events/index.ts";
import * as semantic from "../types/semantic.ts";
import * as editorMod from "../editor/index.ts";
import * as crudMod from "../crud/index.ts";
import * as listMod from "../list/index.ts";
import * as reactivityMod from "../reactivity/index.ts";
import * as routerMod from "../router/index.ts";
import * as servicesMod from "../services/index.ts";

import type { GenContext } from "../core/index.ts";

/**
 * Registers an array of refs into the given context so they can be tracked
 * for diagnostics and code generation.
 * @param ctx - The mutable Gen context.
 * @param refs - The refs to register.
 */
export const registerRefs = (ctx: GenContext, refs: readonly core.Ref[]): void => {
  ctx.refs.push(...refs);
};

/**
 * Records a diagnostic message in the context for later reporting.
 * @param ctx - The mutable Gen context.
 * @param input - The diagnostic input to record.
 */
export const recordDiagnostic = (
  ctx: GenContext,
  input: Parameters<typeof core.diagnostic>[0],
): void => {
  ctx.diagnostics.push(core.diagnostic(input));
};

/**
 * Higher-order factory for context-bound constructors that follow the simple
 * pattern: call the pure constructor, register the result into a ctx collection,
 * and return it. Complex constructors with validation should keep their own
 * bind functions.
 */
export const bindFactory =
  <Args extends unknown[], R>(
    collection: R[],
    constructor: (...args: Args) => R,
  ): ((...args: Args) => R) =>
  (...args: Args) => {
    const result = constructor(...args);
    collection.push(result);
    return result;
  };

export const bindKeyFamily = (ctx: GenContext): typeof reactivityMod.defineKeyFamily =>
  ((name, options) => {
    const family = reactivityMod.defineKeyFamily(name, options);
    ctx.key_families.push(family);
    registerRefs(ctx, [family.ref]);
    return family;
  }) as typeof reactivityMod.defineKeyFamily;

export const bindReactiveResource = (
  ctx: GenContext,
): typeof reactivityMod.defineReactiveResource =>
  ((input) => {
    const resource = reactivityMod.defineReactiveResource(input);
    ctx.reactive_resources.push(resource);
    return resource;
  }) as typeof reactivityMod.defineReactiveResource;

export const bindReactiveMutation = (
  ctx: GenContext,
): typeof reactivityMod.defineReactiveMutation =>
  ((input) => {
    const optimistic =
      input.optimistic ?? reactivityMod.deriveDefaultOptimisticPlan(input.action, ctx);
    const mutation = reactivityMod.defineReactiveMutation({ ...input, optimistic });
    ctx.reactive_mutations.push(mutation);
    return mutation;
  }) as typeof reactivityMod.defineReactiveMutation;

export const bindResourceAll = (ctx: GenContext): typeof reactivityMod.defineResourceAll =>
  ((name, input) => {
    const ra = reactivityMod.defineResourceAll(name, input);
    ctx.resource_alls.push(ra);
    return ra;
  }) as typeof reactivityMod.defineResourceAll;

export const bindResourceChain = (ctx: GenContext): typeof reactivityMod.defineResourceChain =>
  ((name, input) => {
    const rc = reactivityMod.defineResourceChain(name, input);
    ctx.resource_chains.push(rc);
    return rc;
  }) as typeof reactivityMod.defineResourceChain;

export const bindReactiveRegistry = (
  ctx: GenContext,
): typeof reactivityMod.defineReactiveRegistry =>
  ((name, families) => {
    const registry = reactivityMod.defineReactiveRegistry(name, families);
    ctx.reactive_registries.push(registry);
    return registry;
  }) as typeof reactivityMod.defineReactiveRegistry;

export const bindTrackingScope = (ctx: GenContext): typeof reactivityMod.defineTrackingScope =>
  ((...args) => {
    const scope = reactivityMod.defineTrackingScope(...args);
    ctx.tracking_scopes.push(scope);
    return scope;
  }) as typeof reactivityMod.defineTrackingScope;

export const bindAppRoute = (ctx: GenContext): typeof routerMod.defineAppRoute =>
  ((input) => {
    const route = routerMod.defineAppRoute(input);
    ctx.app_routes.push(route);
    return route;
  }) as typeof routerMod.defineAppRoute;

export const bindServiceRef = (ctx: GenContext): typeof servicesMod.defineServiceRef =>
  ((input) => {
    const service = servicesMod.defineServiceRef(input);
    ctx.services.push(service);
    if (service.ref) registerRefs(ctx, [service.ref]);
    for (const method of service.methods) {
      if (method.ref) registerRefs(ctx, [method.ref]);
    }
    return service;
  }) as typeof servicesMod.defineServiceRef;

/**
 * Binds `defineEntity` to a context, registering the result and its field refs.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineEntity`.
 */
export const bindEntity = (ctx: GenContext): typeof entityMod.defineEntity =>
  ((name, fields, options) => {
    const entity = entityMod.defineEntity(name, fields, options);
    ctx.entities.push(entity);
    registerRefs(ctx, [entity.ref, ...entity.fieldList.map((field) => field.ref)]);
    return entity;
  }) as typeof entityMod.defineEntity;

/**
 * Binds `defineStore` to a context, registering the result into the stores collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineStore`.
 */
export const bindStore = (ctx: GenContext): typeof storageMod.defineStore =>
  bindFactory(ctx.stores, storageMod.defineStore);

/**
 * Binds `defineTable` to a context, registering the result and its columns.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineTable`.
 */
export const bindTable = (ctx: GenContext): typeof storageMod.defineTable =>
  ((store, name, columns) => {
    const table = storageMod.defineTable(store, name, columns);
    (store.tables as storageMod.Table[]).push(table);
    ctx.tables.push(table);
    ctx.columns.push(...table.columns);
    return table;
  }) as typeof storageMod.defineTable;

/**
 * Binds `defineColumn` to a context, registering the result into the columns
 * collection. Preserves the column's generic value-type parameter so that
 * `gen.column(table, { semantic_type: stringType() })` returns `Column<string>`.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineColumn`.
 */
export const bindColumn = (ctx: GenContext): typeof storageMod.defineColumn =>
  (<T = unknown>(
    table: storageMod.Table,
    input: Omit<storageMod.Column<T>, "owning_table">,
  ): storageMod.Column<T> => {
    const c = storageMod.defineColumn<T>(table, input);
    ctx.columns.push(c as storageMod.Column);
    return c;
  }) as typeof storageMod.defineColumn;

/**
 * Binds `defineMapping` to a context, registering the result into the mappings collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineMapping`.
 */
export const bindMapping = (ctx: GenContext): typeof storageMod.defineMapping =>
  bindFactory(ctx.mappings, storageMod.defineMapping);

/**
 * Binds `defineProjection` to a context, validating that every projected field
 * exists in the source mapping before registering the result.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineProjection`.
 */
export const bindProjection = (ctx: GenContext): typeof storageMod.defineProjection =>
  ((mapping, fields) => {
    for (const field of fields) {
      if (!mapping.field_mappings.some((fm) => fm.field === field)) {
        recordDiagnostic(ctx, {
          severity: "error",
          code: "storage:projection-field-not-mapped",
          message: `Projection field ${field.name} is not present in the source mapping for ${mapping.target_entity.name}`,
          refs: [field.ref],
        });
      }
    }
    const projection = storageMod.defineProjection(mapping, fields);
    ctx.projections.push(projection);
    return projection;
  }) as typeof storageMod.defineProjection;

/**
 * Binds `defineSchema` to a context, registering the result into the schemas collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineSchema`.
 */
export const bindSchema = (ctx: GenContext): typeof storageMod.defineSchema =>
  bindFactory(ctx.schemas, storageMod.defineSchema);

/**
 * Binds `defineRelation` to a context, validating field ownership and type
 * compatibility before registering the result and its ref.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineRelation`.
 */
export const bindRelation = (ctx: GenContext): typeof relationMod.defineRelation =>
  ((input) => {
    if (input.from_field.owning_entity !== input.from_entity) {
      recordDiagnostic(ctx, {
        severity: "error",
        code: "entity:wrong-entity-field",
        message: `Field ${input.from_field.name} belongs to entity ${input.from_field.owning_entity.name} but relation ${input.name} starts from ${input.from_entity.name}`,
        refs: [input.from_field.ref],
      });
    }
    if (input.to_field.owning_entity !== input.to_entity) {
      recordDiagnostic(ctx, {
        severity: "error",
        code: "entity:wrong-entity-field",
        message: `Field ${input.to_field.name} belongs to entity ${input.to_field.owning_entity.name} but relation ${input.name} points to ${input.to_entity.name}`,
        refs: [input.to_field.ref],
      });
    }
    if (input.from_field.semantic_type.name !== input.to_field.semantic_type.name) {
      recordDiagnostic(ctx, {
        severity: "error",
        code: "relations:field-type-mismatch",
        message: `Relation ${input.name} from/to fields have different types: ${input.from_field.semantic_type.name} vs ${input.to_field.semantic_type.name}`,
      });
    }
    const relation = relationMod.defineRelation(input);
    ctx.relations.push(relation);
    registerRefs(ctx, [relation.ref]);
    return relation;
  }) as typeof relationMod.defineRelation;

/**
 * Binds `defineRelationEntity` to a context, registering the result and its ref.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineRelationEntity`.
 */
export const bindRelationEntity = (ctx: GenContext): typeof relationMod.defineRelationEntity =>
  ((name, roles, fields, options) => {
    const relationEntity = relationMod.defineRelationEntity(name, roles, fields, options);
    ctx.relation_entities.push(relationEntity);
    registerRefs(ctx, [relationEntity.ref]);
    return relationEntity;
  }) as typeof relationMod.defineRelationEntity;

/**
 * Binds `defineGraph` to a context, validating that all relations belong to the
 * provided entities before registering the result.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineGraph`.
 */
export const bindGraph = (ctx: GenContext): typeof relationMod.defineGraph =>
  ((name, entities, relations) => {
    for (const relation of relations) {
      if (!entities.includes(relation.from_entity) || !entities.includes(relation.to_entity)) {
        recordDiagnostic(ctx, {
          severity: "error",
          code: "relations:graph-missing-entity",
          message: `Graph ${name} includes relation ${relation.name} whose endpoints are not both present in the graph entity list`,
        });
      }
    }
    const graph = relationMod.defineGraph(name, entities, relations);
    ctx.graphs.push(graph);
    return graph;
  }) as typeof relationMod.defineGraph;

/**
 * Binds `oneToOne` to a context, registering the result into the relations collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `oneToOne`.
 */
export const bindOneToOne = (ctx: GenContext): typeof relationMod.oneToOne =>
  ((...args) => {
    const relation = relationMod.oneToOne(...args);
    ctx.relations.push(relation);
    registerRefs(ctx, [relation.ref]);
    return relation;
  }) as typeof relationMod.oneToOne;

/**
 * Binds `oneToMany` to a context, registering the result into the relations collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `oneToMany`.
 */
export const bindOneToMany = (ctx: GenContext): typeof relationMod.oneToMany =>
  ((...args) => {
    const relation = relationMod.oneToMany(...args);
    ctx.relations.push(relation);
    registerRefs(ctx, [relation.ref]);
    return relation;
  }) as typeof relationMod.oneToMany;

/**
 * Binds `manyToOne` to a context, registering the result into the relations collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `manyToOne`.
 */
export const bindManyToOne = (ctx: GenContext): typeof relationMod.manyToOne =>
  ((...args) => {
    const relation = relationMod.manyToOne(...args);
    ctx.relations.push(relation);
    registerRefs(ctx, [relation.ref]);
    return relation;
  }) as typeof relationMod.manyToOne;

/**
 * Binds `manyToMany` to a context, registering the result into the relations collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `manyToMany`.
 */
export const bindManyToMany = (ctx: GenContext): typeof relationMod.manyToMany =>
  ((...args) => {
    const relation = relationMod.manyToMany(...args);
    ctx.relations.push(relation);
    registerRefs(ctx, [relation.ref]);
    return relation;
  }) as typeof relationMod.manyToMany;

/**
 * Binds `defineRuntime` to a context, registering the result into the runtimes collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineRuntime`.
 */
export const bindRuntime = (ctx: GenContext): typeof runtimeMod.defineRuntime =>
  bindFactory(ctx.runtimes, runtimeMod.defineRuntime);

/**
 * Binds `buildQuery` to a context, registering the result into the queries collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `buildQuery`.
 */
export const bindBuildQuery = (ctx: GenContext): typeof queryMod.buildQuery =>
  bindFactory(ctx.queries, queryMod.buildQuery) as typeof queryMod.buildQuery;

/**
 * Binds `fromEntity` to a context, returning a fluent query builder that
 * registers the final query when `build()` is called.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `fromEntity`.
 */
export const bindFromEntity = (ctx: GenContext): typeof queryMod.fromEntity =>
  ((entity, result_type) => {
    const builder = queryMod.fromEntity(entity, result_type);
    const originalBuild = builder.build.bind(builder);
    return Object.assign(builder, {
      build: () => {
        const query = originalBuild();
        ctx.queries.push(query);
        return query;
      },
    });
  }) as typeof queryMod.fromEntity;

/**
 * Binds `defineExprFunction` to a context, registering the result into the
 * expr_functions collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineExprFunction`.
 */
export const bindExprFunction = (ctx: GenContext): typeof functionMod.defineExprFunction =>
  ((input) => {
    const fn = functionMod.defineExprFunction(input);
    ctx.expr_functions.push(fn);
    if (fn.ref) registerRefs(ctx, [fn.ref]);
    return fn;
  }) as typeof functionMod.defineExprFunction;

/**
 * Binds `defineQueryFunction` to a context, registering the result into the
 * query_functions collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineQueryFunction`.
 */
export const bindQueryFunction = (ctx: GenContext): typeof functionMod.defineQueryFunction =>
  ((input) => {
    const fn = functionMod.defineQueryFunction(input);
    ctx.query_functions.push(fn);
    if (fn.ref) registerRefs(ctx, [fn.ref]);
    return fn;
  }) as typeof functionMod.defineQueryFunction;

/**
 * Binds `defineActionFunction` to a context, registering the result into the
 * action_functions collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineActionFunction`.
 */
export const bindActionFunction = (ctx: GenContext): typeof functionMod.defineActionFunction =>
  ((input) => {
    const fn = functionMod.defineActionFunction(input);
    ctx.action_functions.push(fn);
    if (fn.ref) registerRefs(ctx, [fn.ref]);
    return fn;
  }) as typeof functionMod.defineActionFunction;

/**
 * Binds `definePatchFunction` to a context, registering the result into the
 * patch_functions collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `definePatchFunction`.
 */
export const bindPatchFunction = (ctx: GenContext): typeof functionMod.definePatchFunction =>
  ((input) => {
    const fn = functionMod.definePatchFunction(input);
    ctx.patch_functions.push(fn);
    if (fn.ref) registerRefs(ctx, [fn.ref]);
    return fn;
  }) as typeof functionMod.definePatchFunction;

/**
 * Binds `defineRoute` to a context, validating that the handler has exactly one
 * function field set and that it matches the declared kind before registering the result.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineRoute`.
 */
export const bindRoute = (ctx: GenContext): typeof apiMod.defineRoute =>
  ((input) => {
    const h = input.handler;
    const exactlyOne =
      [h.query_func, h.action_func, h.static_func].filter((x) => x != null).length === 1;
    if (!exactlyOne) {
      recordDiagnostic(ctx, {
        severity: "error",
        code: "api:handler-kind-mismatch",
        message: `Route ${input.path.template} handler must have exactly one function field set`,
      });
    } else {
      switch (h.kind) {
        case "query":
          if (!h.query_func) {
            recordDiagnostic(ctx, {
              severity: "error",
              code: "api:handler-kind-mismatch",
              message: `Route ${input.path.template} handler kind query missing query_func`,
            });
          }
          break;
        case "action":
          if (!h.action_func) {
            recordDiagnostic(ctx, {
              severity: "error",
              code: "api:handler-kind-mismatch",
              message: `Route ${input.path.template} handler kind action missing action_func`,
            });
          }
          break;
        case "static":
          if (!h.static_func) {
            recordDiagnostic(ctx, {
              severity: "error",
              code: "api:handler-kind-mismatch",
              message: `Route ${input.path.template} handler kind static missing static_func`,
            });
          }
          break;
        default:
          recordDiagnostic(ctx, {
            severity: "error",
            code: "api:handler-kind-mismatch",
            message: `Route ${input.path.template} has unknown handler kind`,
          });
      }
    }
    const route = apiMod.defineRoute(input);
    ctx.routes.push(route);
    return route;
  }) as typeof apiMod.defineRoute;

/**
 * Binds `defineGetter` to a context, validating field ownership and projection
 * entity consistency before registering the result.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineGetter`.
 */
export const bindGetter = (ctx: GenContext): typeof apiMod.defineGetter =>
  ((input) => {
    if (input.by_field.owning_entity !== input.target_entity) {
      recordDiagnostic(ctx, {
        severity: "error",
        code: "entity:wrong-entity-field",
        message: `Field ${input.by_field.name} belongs to entity ${input.by_field.owning_entity.name} but getter ${input.name} targets ${input.target_entity.name}`,
        refs: [input.by_field.ref],
      });
    }
    if (input.projection.mapping.target_entity !== input.target_entity) {
      recordDiagnostic(ctx, {
        severity: "error",
        code: "api:getter-projection-entity-mismatch",
        message: `Getter ${input.name} uses a projection for ${input.projection.mapping.target_entity.name} but targets ${input.target_entity.name}`,
      });
    }
    const getter = apiMod.defineGetter(input);
    ctx.getters.push(getter);
    return getter;
  }) as typeof apiMod.defineGetter;

/**
 * Binds `defineMutator` to a context, validating mapping and returns entity
 * consistency and input field presence before registering the result.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineMutator`.
 */
export const bindMutator = (ctx: GenContext): typeof apiMod.defineMutator =>
  ((input) => {
    if (input.mapping.target_entity !== input.target_entity) {
      recordDiagnostic(ctx, {
        severity: "error",
        code: "api:mutator-mapping-entity-mismatch",
        message: `Mutator ${input.name} uses a mapping for ${input.mapping.target_entity.name} but targets ${input.target_entity.name}`,
      });
    }
    if (input.returns.mapping.target_entity !== input.target_entity) {
      recordDiagnostic(ctx, {
        severity: "error",
        code: "api:mutator-returns-entity-mismatch",
        message: `Mutator ${input.name} returns a projection for ${input.returns.mapping.target_entity.name} but targets ${input.target_entity.name}`,
      });
    }
    for (const field of input.input_fields) {
      if (!input.mapping.target_entity.fieldList.includes(field)) {
        recordDiagnostic(ctx, {
          severity: "error",
          code: "api:mutator-input-not-mapped",
          message: `Mutator ${input.name}: input field ${field.name} is not part of the mapping's target entity`,
          refs: [field.ref],
        });
      }
    }
    const mutator = apiMod.defineMutator(input);
    ctx.mutators.push(mutator);
    return mutator;
  }) as typeof apiMod.defineMutator;

/**
 * Binds `defineResource` to a context, validating that the target entity is
 * registered before registering the result.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineResource`.
 */
export const bindResource = (ctx: GenContext): typeof apiMod.defineResource =>
  ((input) => {
    if (!ctx.entities.includes(input.target_entity)) {
      recordDiagnostic(ctx, {
        severity: "error",
        code: "api:resource-unknown-entity",
        message: `Resource path ${input.path} targets entity ${input.target_entity.name} that is not registered in the current context`,
      });
    }
    const resource = apiMod.defineResource(input);
    ctx.resources.push(resource);
    return resource;
  }) as typeof apiMod.defineResource;

/**
 * Binds `definePolicy` to a context, registering the result into the policies collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `definePolicy`.
 */
export const bindPolicy = (ctx: GenContext): typeof authzMod.definePolicy =>
  ((input) => {
    const result = authzMod.definePolicy(input as never);
    ctx.policies.push(result as import("../authz/index.ts").Policy);
    return result;
  }) as typeof authzMod.definePolicy;

/**
 * Binds `defineSerializer` to a context, registering the result into the serializers collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineSerializer`.
 */
export const bindSerializer = (ctx: GenContext): typeof semantic.defineSerializer =>
  bindFactory(ctx.serializers, semantic.defineSerializer) as typeof semantic.defineSerializer;

/**
 * Binds `defineContract` to a context, registering the result into the contracts collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineContract`.
 */
export const bindContract = (ctx: GenContext): typeof core.defineContract =>
  bindFactory(ctx.contracts, core.defineContract);

/**
 * Binds `defineActor` to a context, registering the result into the actors collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineActor`.
 */
export const bindActor = (ctx: GenContext): typeof core.defineActor =>
  bindFactory(ctx.actors, core.defineActor);

/**
 * Binds `defineConfigEntry` to a context, registering the result into the
 * config entries collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineConfigEntry`.
 */
export const bindConfigEntry = (ctx: GenContext): typeof core.defineConfigEntry =>
  ((name, entry_type, default_value, expression_default, config_reference) => {
    const entry = core.defineConfigEntry(
      name,
      entry_type,
      default_value,
      expression_default,
      config_reference,
    );
    ctx.config = { entries: [...ctx.config.entries, entry] };
    return entry;
  }) as typeof core.defineConfigEntry;

/**
 * Binds `defineConfig` to a context, replacing the context's config entries
 * with those from the newly defined config.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineConfig`.
 */
export const bindConfig = (ctx: GenContext): typeof core.defineConfig =>
  ((entries) => {
    const config = core.defineConfig(entries);
    ctx.config = config;
    return config;
  }) as typeof core.defineConfig;

/**
 * Binds `defineDefaultInstance` to a context, registering the result into the defaults collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineDefaultInstance`.
 */
export const bindDefaultInstance = (ctx: GenContext): typeof core.defineDefaultInstance =>
  bindFactory(ctx.defaults, core.defineDefaultInstance);

/**
 * Binds `defineEvent` to a context, registering the result into the events collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineEvent`.
 */
export const bindEvent = (ctx: GenContext): typeof eventsMod.defineEvent =>
  bindFactory(ctx.events, eventsMod.defineEvent);

/**
 * Binds `emit` to a context, registering the resulting emission into the
 * event_emissions collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `emit`.
 */
export const bindEmit = (ctx: GenContext): typeof eventsMod.emit =>
  ((event, action, payload_expr) => {
    const emission = eventsMod.emit(event, action, payload_expr);
    ctx.event_emissions.push(emission);
    return emission;
  }) as typeof eventsMod.emit;

/**
 * Binds `defineReducer` to a context, registering the result into the reducers collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineReducer`.
 */
export const bindReducer = (ctx: GenContext): typeof eventsMod.defineReducer =>
  bindFactory(ctx.reducers, eventsMod.defineReducer);

/**
 * Binds `defineSubscription` to a context, registering the result into the subscriptions collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineSubscription`.
 */
export const bindSubscription = (ctx: GenContext): typeof eventsMod.defineSubscription =>
  bindFactory(ctx.subscriptions, eventsMod.defineSubscription);

/**
 * Binds `defineStaticFunction` to a context, registering the result into the
 * static_functions collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineStaticFunction`.
 */
export const bindStaticFunction = (ctx: GenContext): typeof functionMod.defineStaticFunction =>
  ((input) => {
    const fn = functionMod.defineStaticFunction(input);
    ctx.static_functions.push(fn);
    if (fn.ref) registerRefs(ctx, [fn.ref]);
    return fn;
  }) as typeof functionMod.defineStaticFunction;

/**
 * Binds `definePredicateFunction` to a context, registering the result into the
 * predicate_functions collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `definePredicateFunction`.
 */
export const bindPredicateFunction = (
  ctx: GenContext,
): typeof functionMod.definePredicateFunction =>
  ((input) => {
    const fn = functionMod.definePredicateFunction(input);
    ctx.predicate_functions.push(fn);
    if (fn.ref) registerRefs(ctx, [fn.ref]);
    return fn;
  }) as typeof functionMod.definePredicateFunction;

/**
 * Binds `definePlanFunction` to a context, registering the result into the
 * plan_functions collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `definePlanFunction`.
 */
export const bindPlanFunction = (ctx: GenContext): typeof functionMod.definePlanFunction =>
  ((input) => {
    const fn = functionMod.definePlanFunction(input);
    ctx.plan_functions.push(fn);
    if (fn.ref) registerRefs(ctx, [fn.ref]);
    return fn;
  }) as typeof functionMod.definePlanFunction;

/**
 * Binds `defineView` to a context, registering the result into the views collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineView`.
 */
export const bindView = (ctx: GenContext): typeof uiMod.defineView =>
  bindFactory(ctx.views, uiMod.defineView) as typeof uiMod.defineView;

/**
 * Binds `defineComponent` to a context, registering the result into the components collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineComponent`.
 */
export const bindComponent = (ctx: GenContext): typeof uiMod.defineComponent =>
  bindFactory(ctx.components, uiMod.defineComponent) as typeof uiMod.defineComponent;

/**
 * Binds `defineStyle` to a context, registering the result into the styles collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineStyle`.
 */
export const bindStyle = (ctx: GenContext): typeof uiMod.defineStyle =>
  bindFactory(ctx.styles, uiMod.defineStyle) as typeof uiMod.defineStyle;

/**
 * Binds `defineBehavior` to a context, registering the result into the behaviors collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineBehavior`.
 */
export const bindBehavior = (ctx: GenContext): typeof uiMod.defineBehavior =>
  bindFactory(ctx.behaviors, uiMod.defineBehavior) as typeof uiMod.defineBehavior;

/**
 * Binds `defineTheme` to a context, registering the result into the themes collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineTheme`.
 */
export const bindTheme = (ctx: GenContext): typeof uiMod.defineTheme =>
  bindFactory(ctx.themes, uiMod.defineTheme);

/**
 * Binds `definePlatform` to a context, registering the result into the platforms collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `definePlatform`.
 */
export const bindPlatform = (ctx: GenContext): typeof uiMod.definePlatform =>
  bindFactory(ctx.platforms, uiMod.definePlatform) as typeof uiMod.definePlatform;

/**
 * Binds `defineRenderer` to a context, registering the result into the renderers collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineRenderer`.
 */
export const bindRenderer = (ctx: GenContext): typeof uiMod.defineRenderer =>
  bindFactory(ctx.renderers, uiMod.defineRenderer) as typeof uiMod.defineRenderer;

/**
 * Binds `defineForm` to a context, registering the result into the forms collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineForm`.
 */
export const bindForm = (ctx: GenContext): typeof uiMod.defineForm =>
  bindFactory(ctx.forms, uiMod.defineForm) as typeof uiMod.defineForm;

/**
 * Binds `defineEditor` to a context, registering the result into the editors collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineEditor`.
 */
export const bindEditor = (ctx: GenContext): typeof editorMod.defineEditor =>
  bindFactory(ctx.editors, editorMod.defineEditor) as typeof editorMod.defineEditor;

/**
 * Binds `deriveCrud` to a context, registering the produced functions into
 * the query_functions, action_functions, and cruds collections.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `deriveCrud`.
 */
export const bindDeriveCrud = (ctx: GenContext): typeof crudMod.deriveCrud =>
  ((entity, options) => {
    const getByIdKey = options?.getByIdKey ?? reactivityMod.entityKeyFamily(entity);
    const listKey = options?.listKey ?? reactivityMod.collectionKeyFamily(entity);
    if (!options?.getByIdKey) {
      if (!ctx.key_families.some((kf) => kf.name === getByIdKey.name)) {
        ctx.key_families.push(getByIdKey);
      }
    }
    if (!options?.listKey) {
      if (!ctx.key_families.some((kf) => kf.name === listKey.name)) {
        ctx.key_families.push(listKey);
      }
    }
    const crud = crudMod.deriveCrud(entity, {
      ...options,
      getByIdKey,
      listKey,
    });
    ctx.query_functions.push(crud.getById, crud.list);
    ctx.action_functions.push(crud.create, crud.update, crud.delete);
    ctx.cruds.push(crud);

    // Register access-surface bindings from CRUD access options (AUTHZ2+)
    if (options?.access) {
      const bindings = crudMod.expandAccessToSurfaces(options.access, entity);
      for (const binding of bindings) {
        const policy = binding.policy as import("../authz/index.ts").Policy & {
          access_surface_bindings?: import("../authz/index.ts").AccessSurfaceBinding[];
        };
        policy.access_surface_bindings = [...(policy.access_surface_bindings ?? []), binding];
      }
    }

    return crud;
  }) as typeof crudMod.deriveCrud;

/**
 * Binds `defineList` to a context, registering the result into the lists collection.
 * @param ctx - The mutable Gen context.
 * @returns A context-bound `defineList`.
 */
export const bindDefineList = (ctx: GenContext): typeof listMod.defineList =>
  bindFactory(ctx.lists, listMod.defineList) as typeof listMod.defineList;
