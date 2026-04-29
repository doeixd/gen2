/* @__NO_SIDE_EFFECTS__ */
/**
 * API IR. Resources, routes, getters, list-getters, mutators. Routes wrap a
 * query/action/static function via a discriminated RouteHandler. Mutators model
 * write endpoints with multi-store consistency awareness.
 *
 * See spec/api.allium.
 */

import { type Diagnostic, diagnostic, type PolicyAction } from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";
import type {
  ActionFunction,
  ErrorType,
  PatchFunction,
  QueryFunction,
  StaticFunction,
} from "../function/index.ts";
import type { Mapping, Projection, Store } from "../storage/index.ts";
import type { SemanticType } from "../types/index.ts";

/** Supported HTTP methods for API routes. */
export type HttpMethodKind = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** An HTTP method value object. */
export interface HttpMethod {
  readonly kind: HttpMethodKind;
}

/** A single segment of a route path, either literal or parameterized. */
export interface PathSegment {
  readonly kind: "literal" | "parameter";
  readonly value: string;
  readonly field_ref?: Field;
}

/** A parsed route path composed of segments and a template string. */
export interface RoutePath {
  readonly segments: readonly PathSegment[];
  readonly template: string;
}

/** A typed parameter for a route (path, query, body, or header). */
export interface RouteParameter {
  readonly name: string;
  readonly param_type: SemanticType;
  readonly kind: "path" | "query" | "body" | "header";
}

/** Loose input shape for a RouteHandler, used by validation functions. */
export interface RouteHandlerInput {
  readonly kind: "query" | "action" | "static";
  readonly query_func?: { readonly input_fields?: readonly Field[] };
  readonly action_func?: { readonly input_fields?: readonly Field[] };
  readonly static_func?: { readonly input_fields?: readonly Field[] };
}

/** Discriminated route handler — exactly one function is set per kind. */
export type RouteHandler =
  | { readonly kind: "query"; readonly query_func: QueryFunction }
  | { readonly kind: "action"; readonly action_func: ActionFunction }
  | { readonly kind: "static"; readonly static_func: StaticFunction };

/** An API route binding an HTTP method and path to a handler. */
export interface Route {
  readonly method: HttpMethod;
  readonly path: RoutePath;
  readonly handler: RouteHandlerInput;
  readonly runtime?: string;
  readonly target?: string;
  readonly parameters: readonly RouteParameter[];
}

/** Links an operation kind to its route and handler. */
export interface OperationRefRecord {
  readonly kind: string;
  readonly route: Route;
  readonly handler: RouteHandlerInput;
}

/** A REST resource exposing operations for a target entity. */
export interface Resource {
  readonly target_entity: Entity;
  readonly path: string;
  readonly operations: readonly OperationRefRecord[];
}

/** A read endpoint that fetches a single entity by a field. */
export interface Getter {
  readonly name: string;
  readonly target_entity: Entity;
  readonly by_field: Field;
  readonly projection: Projection;
  readonly auth?: PolicyAction;
  readonly errors: readonly ErrorType[];
}

/** A read endpoint that lists entities with filtering, search, and pagination. */
export interface ListGetter {
  readonly name: string;
  readonly target_entity: Entity;
  readonly projection: Projection;
  readonly filter_fields: readonly Field[];
  readonly search_field?: Field;
  readonly pagination_kind: "cursor" | "offset" | "none";
  readonly pagination_field?: Field;
  readonly default_limit?: number;
  readonly auth?: PolicyAction;
}

/** A write endpoint with input mapping, consistency, and invalidation rules. */
export interface Mutator {
  readonly name: string;
  readonly target_entity: Entity;
  readonly input_fields: readonly Field[];
  readonly mapping: Mapping;
  readonly returns: Projection;
  readonly auth?: PolicyAction;
  readonly consistency: "transactional" | "eventual" | "best_effort";
  readonly written_stores: readonly Store[];
  readonly after: readonly ActionFunction[];
  readonly errors: readonly ErrorType[];
  readonly invalidates: readonly QueryFunction[];
  readonly optimistic?: PatchFunction;
}

// --- Constructors ----------------------------------------------------------

/**
 * Creates a {@link RouteHandler} for a query function.
 *
 * @param f - The QueryFunction to wrap.
 * @returns A RouteHandler of kind `"query"`.
 *
 * @example
 * ```ts
 * const handler = queryHandler(listUsersQuery);
 * ```
 */
export const buildQueryHandler = (f: QueryFunction): Extract<RouteHandler, { kind: "query" }> => ({
  kind: "query",
  query_func: f,
});

/**
 * Creates a {@link RouteHandler} for an action function.
 *
 * @param f - The ActionFunction to wrap.
 * @returns A RouteHandler of kind `"action"`.
 *
 * @example
 * ```ts
 * const handler = actionHandler(createUserAction);
 * ```
 */
export const buildActionHandler = (
  f: ActionFunction,
): Extract<RouteHandler, { kind: "action" }> => ({
  kind: "action",
  action_func: f,
});

/**
 * Creates a {@link RouteHandler} for a static function.
 *
 * @param f - The StaticFunction to wrap.
 * @returns A RouteHandler of kind `"static"`.
 *
 * @example
 * ```ts
 * const handler = staticHandler(hashPasswordStatic);
 * ```
 */
export const buildStaticHandler = (
  f: StaticFunction,
): Extract<RouteHandler, { kind: "static" }> => ({
  kind: "static",
  static_func: f,
});

/**
 * Constructs a {@link Resource} record.
 *
 * @param input - Resource definition including entity, path, and exposed operations.
 * @returns A Resource record.
 *
 * @example
 * ```ts
 * const userResource = defineResource({
 *   target_entity: userEntity,
 *   path: "/users",
 *   operations: [
 *     { kind: "list", route: listRoute, handler: listHandler },
 *   ],
 * });
 * ```
 */
export const defineResource = (input: {
  target_entity: Entity;
  path: string;
  operations?: readonly OperationRefRecord[];
}): Resource => ({
  target_entity: input.target_entity,
  path: input.path,
  operations: input.operations ?? [],
});

// --- Invariants and rules --------------------------------------------------

const handlerInputFields = (h: RouteHandlerInput): readonly Field[] => {
  switch (h.kind) {
    case "query":
      return h.query_func?.input_fields ?? [];
    case "action":
      return h.action_func?.input_fields ?? [];
    case "static":
      return h.static_func?.input_fields ?? [];
    default:
      return [];
  }
};

/**
 * Validates API invariants: handler kind consistency, route parameter entity matching,
 * mutator input mapping coverage, cross-store transactional constraints, read-only
 * field exposure, server-only field exposure, and type serialization for OpenAPI.
 *
 * @param routes - Routes to validate.
 * @param mutators - Mutators to validate.
 * @returns Diagnostics for any violated API rules.
 *
 * @example
 * ```ts
 * const issues = checkApi(routes, mutators);
 * if (issues.length > 0) {
 *   console.error(issues.map((d) => d.message).join("\n"));
 * }
 * ```
 */
export const checkApi = (
  routes: readonly (Omit<Route, "handler"> & { readonly handler: RouteHandlerInput })[],
  mutators: readonly Mutator[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // RouteHandlerKindMatches — validated at runtime since RouteHandlerInput is loose.
  for (const r of routes) {
    const h = r.handler;
    const exactlyOne =
      [h.query_func, h.action_func, h.static_func].filter((x) => x != null).length === 1;
    if (!exactlyOne) {
      out.push(
        diagnostic({
          severity: "error",
          code: "api:handler-kind-mismatch",
          message: `Route ${r.path.template} handler must have exactly one function field set`,
        }),
      );
      continue;
    }
    switch (h.kind) {
      case "query":
        if (!h.query_func) {
          out.push(
            diagnostic({
              severity: "error",
              code: "api:handler-kind-mismatch",
              message: `Route ${r.path.template} handler kind query missing query_func`,
            }),
          );
        }
        break;
      case "action":
        if (!h.action_func) {
          out.push(
            diagnostic({
              severity: "error",
              code: "api:handler-kind-mismatch",
              message: `Route ${r.path.template} handler kind action missing action_func`,
            }),
          );
        }
        break;
      case "static":
        if (!h.static_func) {
          out.push(
            diagnostic({
              severity: "error",
              code: "api:handler-kind-mismatch",
              message: `Route ${r.path.template} handler kind static missing static_func`,
            }),
          );
        }
        break;
      default:
        out.push(
          diagnostic({
            severity: "error",
            code: "api:handler-kind-mismatch",
            message: `Route ${r.path.template} has unknown handler kind`,
          }),
        );
    }
  }

  // RouteParameterTypesMatchEntity
  for (const r of routes) {
    const inputs = handlerInputFields(r.handler);
    for (const seg of r.path.segments) {
      if (seg.kind !== "parameter" || !seg.field_ref) continue;
      const ok = inputs.some((f) => f.owning_entity === seg.field_ref!.owning_entity);
      if (!ok) {
        out.push(
          diagnostic({
            severity: "error",
            code: "api:route-param-no-matching-entity",
            message: `Route parameter ${seg.value} references entity ${seg.field_ref.owning_entity.name} but handler input fields don't include any from that entity`,
          }),
        );
      }
    }
  }

  // MutatorMappingCoversInput
  for (const m of mutators) {
    for (const f of m.input_fields) {
      if (!m.mapping.target_entity.fieldList.includes(f)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "api:mutator-input-not-mapped",
            message: `Mutator ${m.name}: input field ${f.name} is not part of the mapping's target entity`,
          }),
        );
      }
    }
  }

  // CrossStoreTransactionalMutator
  for (const m of mutators) {
    if (m.consistency === "transactional" && m.written_stores.length > 1) {
      out.push(
        diagnostic({
          severity: "error",
          code: "api:cross-store-transaction",
          message: `Cannot generate transactional mutator ${m.name} across multiple stores without coordinator`,
        }),
      );
    }
  }

  // ReadOnlyFieldInMutatorInput
  for (const m of mutators) {
    for (const f of m.input_fields) {
      if (f.read_only) {
        out.push(
          diagnostic({
            severity: "error",
            code: "api:readonly-field-in-mutator-input",
            message: `Read-only field ${f.name} cannot appear in mutator input`,
          }),
        );
      }
    }
  }

  // ServerOnlyFieldExposedToClient + UnserializableTypeInOpenAPI + MongoStorageToSQLTarget
  for (const r of routes) {
    if (r.target === "client") {
      for (const param of r.parameters) {
        if (param.param_type.server_only) {
          out.push(
            diagnostic({
              severity: "error",
              code: "api:server-only-field-exposed",
              message: `Server-only field ${param.name} exposed to client route`,
            }),
          );
        }
      }
    }
    if (r.target === "openapi") {
      for (const param of r.parameters) {
        if (param.param_type.wire_repr == null && !param.param_type.has_serializer) {
          out.push(
            diagnostic({
              severity: "error",
              code: "api:unserializable-openapi-type",
              message: `Field ${param.name} has no serializer for OpenAPI target`,
            }),
          );
        }
      }
    }
    if (r.target && ["drizzle", "prisma", "kysely"].includes(r.target)) {
      for (const param of r.parameters) {
        if (param.param_type.storage_repr.kind.kind === "document") {
          out.push(
            diagnostic({
              severity: "error",
              code: "api:mongo-to-sql-target",
              message: `MongoDB document storage passed to SQL-only target ${r.target}`,
            }),
          );
        }
      }
    }
  }

  return out;
};

// --- API builders ----------------------------------------------------------

/**
 * Constructs a {@link Route} record wrapping a query, action, or static function.
 *
 * @param input - Route definition including method, path, handler, and optional metadata.
 * @returns A Route record.
 *
 * @example
 * ```ts
 * const getUserRoute = defineRoute({
 *   method: { kind: "GET" },
 *   path: parsePath("/users/:id"),
 *   handler: queryHandler(getUserQuery),
 *   parameters: [{ name: "id", param_type: uuidType, kind: "path" }],
 * });
 * ```
 */
export const defineRoute = (input: {
  method: HttpMethod;
  path: RoutePath;
  handler: RouteHandlerInput;
  runtime?: string;
  target?: string;
  parameters?: readonly RouteParameter[];
}): Route => ({
  method: input.method,
  path: input.path,
  handler: input.handler,
  runtime: input.runtime,
  target: input.target,
  parameters: input.parameters ?? [],
});

/**
 * Constructs a {@link Getter} record.
 *
 * @param input - Getter definition including name, target entity, lookup field, and projection.
 * @returns A Getter record.
 *
 * @example
 * ```ts
 * const getUser = defineGetter({
 *   name: "getUser",
 *   target_entity: userEntity,
 *   by_field: userEntity.field("id"),
 *   projection: projectionAll(userEntity),
 * });
 * ```
 */
export const defineGetter = (input: {
  name: string;
  target_entity: Entity;
  by_field: Field;
  projection: Projection;
  auth?: PolicyAction;
  errors?: readonly ErrorType[];
}): Getter => ({
  name: input.name,
  target_entity: input.target_entity,
  by_field: input.by_field,
  projection: input.projection,
  auth: input.auth,
  errors: input.errors ?? [],
});

/**
 * Constructs a {@link Mutator} record.
 *
 * @param input - Mutator definition including name, target entity, input fields, mapping, and optional metadata.
 * @returns A Mutator record.
 *
 * @example
 * ```ts
 * const createUserMutator = defineMutator({
 *   name: "createUser",
 *   target_entity: userEntity,
 *   input_fields: [userEntity.field("name"), userEntity.field("email")],
 *   mapping: directMapping(userEntity),
 *   returns: projectionAll(userEntity),
 * });
 * ```
 */
export const defineMutator = (input: {
  name: string;
  target_entity: Entity;
  input_fields: readonly Field[];
  mapping: Mapping;
  returns: Projection;
  auth?: PolicyAction;
  consistency?: Mutator["consistency"];
  written_stores?: readonly Store[];
  after?: readonly ActionFunction[];
  errors?: readonly ErrorType[];
  invalidates?: readonly QueryFunction[];
  optimistic?: PatchFunction;
}): Mutator => ({
  name: input.name,
  target_entity: input.target_entity,
  input_fields: input.input_fields,
  mapping: input.mapping,
  returns: input.returns,
  auth: input.auth,
  consistency: input.consistency ?? "transactional",
  written_stores: input.written_stores ?? [],
  after: input.after ?? [],
  errors: input.errors ?? [],
  invalidates: input.invalidates ?? [],
  optimistic: input.optimistic,
});
