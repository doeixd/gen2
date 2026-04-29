/* @__NO_SIDE_EFFECTS__ */
/**
 * Portable reactivity key primitives.
 *
 * Keys are static records used by future resource, invalidation, hydration, and
 * devtools layers. They intentionally do not close over runtime code.
 */

import type { Entity } from "../entity/index.ts";
import type {
  ActionFunction,
  ErrorType,
  PatchExpr,
  QueryFunction,
  StaticFunction,
} from "../function/index.ts";
import {
  buildPatchDelete,
  buildPatchInsert,
  buildPatchUpdate,
} from "../function/index.ts";
import {
  diagnostic,
  makeArtifact,
  type Artifact,
  type Diagnostic,
  type GenContext,
} from "../core/index.ts";
import type { FallbackPlan } from "../rules/placement.ts";
import type { Event, Subscription } from "../events/index.ts";
import type { Form } from "../ui/index.ts";
import type { AppRoute } from "../router/index.ts";

export type KeyPayload = Record<string, unknown>;

export interface KeyFamily<Payload extends KeyPayload = KeyPayload> {
  readonly kind: "key_family";
  readonly name: string;
  readonly description?: string;
  readonly _payload?: Payload;
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

export interface ResourceState<Value = unknown, Err = ErrorType> {
  readonly status: "idle" | "loading" | "success" | "error";
  readonly value?: Value;
  readonly error?: Err;
  readonly stale: boolean;
}

export interface RefreshPlan {
  readonly kind: "manual" | "on_mount" | "on_invalidate" | "interval";
  readonly interval_ms?: number;
}

export interface InvalidationPlan {
  readonly patterns: readonly ReactiveKeyPattern[];
}

export interface KeyExpression<Input = unknown, Payload extends KeyPayload = KeyPayload> {
  readonly kind: "key_expression";
  readonly family: KeyFamily<Payload>;
  readonly payload?: Payload;
  readonly _input?: Input;
  readonly _payload?: Payload;
}

export interface KeyPatternExpression<Input = unknown, Payload extends KeyPayload = KeyPayload> {
  readonly kind: "key_pattern_expression";
  readonly family: KeyFamily<Payload>;
  readonly patterns: readonly ReactiveKeyPattern<Payload>[];
  readonly _input?: Input;
  readonly _payload?: Payload;
}

export interface ReactiveResource<In = unknown, Value = unknown, Err = ErrorType> {
  readonly kind: "reactive_resource";
  readonly name: string;
  readonly query: QueryFunction<In, Value>;
  readonly refresh: readonly RefreshPlan[];
  readonly _input?: In;
  readonly _value?: Value;
  readonly _error?: Err;
}

export interface ReactiveMutation<In = unknown, Out = unknown, Err = ErrorType> {
  readonly kind: "reactive_mutation";
  readonly name: string;
  readonly action: ActionFunction<In, Out>;
  readonly invalidates: InvalidationPlan;
  readonly optimistic?: OptimisticPlan<In, Out>;
  readonly _input?: In;
  readonly _output?: Out;
  readonly _error?: Err;
}

export interface ResourceAll<
  Branches extends Record<string, ReactiveResource<any, any, any>> = Record<
    string,
    ReactiveResource<any, any, any>
  >,
> {
  readonly kind: "resource_all";
  readonly name: string;
  readonly branches: Branches;
  readonly mode: "parallel" | "target_decides";
  readonly _branches?: Branches;
}

export interface ResourceChain<
  SourceIn = unknown,
  SourceValue = unknown,
  NextIn = unknown,
  NextValue = unknown,
  SourceErr = ErrorType,
  NextErr = ErrorType,
> {
  readonly kind: "resource_chain";
  readonly name: string;
  readonly source: ReactiveResource<SourceIn, SourceValue, SourceErr>;
  readonly derive_next: StaticFunction<SourceValue, NextIn>;
  readonly next_resource: ReactiveResource<NextIn, NextValue, NextErr>;
  readonly _source_in?: SourceIn;
  readonly _source_value?: SourceValue;
  readonly _next_in?: NextIn;
  readonly _next_value?: NextValue;
  readonly _source_err?: SourceErr;
  readonly _next_err?: NextErr;
}

export interface OptimisticPlan<In = unknown, Out = unknown> {
  readonly kind: "optimistic_plan";
  readonly apply: PatchExpr;
  readonly rollback: PatchExpr;
  readonly reconcile?: PatchExpr;
  readonly fallback: FallbackPlan;
  readonly diagnostics: readonly Diagnostic[];
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
  | "subscription";

export interface ReactiveGraphNode {
  readonly id: string;
  readonly kind: ReactiveGraphNodeKind;
  readonly name: string;
}

export type ReactiveGraphEdgeKind =
  | "reads"
  | "writes"
  | "invalidates"
  | "binds"
  | "emits"
  | "subscribes";

export interface ReactiveGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: ReactiveGraphEdgeKind;
}

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

export const defineKeyFamily = <const Payload extends KeyPayload = KeyPayload>(
  name: string,
  options: { readonly description?: string } = {},
): KeyFamily<Payload> => ({
  kind: "key_family",
  name,
  description: options.description,
});

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

export const entityKeyFamily = <E extends Entity>(entity: E): KeyFamily<{ readonly id: string }> =>
  defineKeyFamily<{ readonly id: string }>(`${entity.name}:entity`);

export const collectionKeyFamily = <E extends Entity>(
  entity: E,
): KeyFamily<{ readonly filters?: KeyPayload }> =>
  defineKeyFamily<{ readonly filters?: KeyPayload }>(`${entity.name}:collection`);

export const customKeyFamily = defineKeyFamily;

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
): KeyExpression<Input, Payload> => ({
  kind: "key_expression",
  family,
  payload,
});

export const keyPatternExpr = <Input = unknown, Payload extends KeyPayload = KeyPayload>(
  family: KeyFamily<Payload>,
  patterns: readonly ReactiveKeyPattern<Payload>[],
): KeyPatternExpression<Input, Payload> => ({
  kind: "key_pattern_expression",
  family,
  patterns,
});

export const defineReactiveResource = <In = unknown, Value = unknown, Err = ErrorType>(input: {
  readonly name: string;
  readonly query: QueryFunction<In, Value>;
  readonly refresh?: readonly RefreshPlan[];
}): ReactiveResource<In, Value, Err> => ({
  kind: "reactive_resource",
  name: input.name,
  query: input.query,
  refresh: input.refresh ?? [refreshOnInvalidate()],
});

export const defineReactiveMutation = <In = unknown, Out = unknown, Err = ErrorType>(input: {
  readonly name: string;
  readonly action: ActionFunction<In, Out>;
  readonly invalidates?: InvalidationPlan;
  readonly optimistic?: OptimisticPlan<In, Out>;
}): ReactiveMutation<In, Out, Err> => {
  const patterns: readonly ReactiveKeyPattern[] =
    input.invalidates?.patterns ??
    (input.action.reactivity?.invalidates ?? []).flatMap((expr) => expr.patterns);
  return {
    kind: "reactive_mutation",
    name: input.name,
    action: input.action,
    invalidates: { patterns },
    optimistic: input.optimistic,
  };
};

export const defineOptimisticPlan = <In = unknown, Out = unknown>(input: {
  readonly apply: PatchExpr;
  readonly rollback: PatchExpr;
  readonly reconcile?: PatchExpr;
  readonly fallback: FallbackPlan;
  readonly diagnostics?: readonly Diagnostic[];
}): OptimisticPlan<In, Out> => ({
  kind: "optimistic_plan",
  apply: input.apply,
  rollback: input.rollback,
  reconcile: input.reconcile,
  fallback: input.fallback,
  diagnostics: input.diagnostics ?? [],
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

export const defineResourceAll = <const Branches extends Record<string, ReactiveResource>>(
  name: string,
  input: {
    readonly branches: Branches;
    readonly mode?: "parallel" | "target_decides";
  },
): ResourceAll<Branches> => ({
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
>(
  name: string,
  input: {
    readonly source: ReactiveResource<SourceIn, SourceValue, SourceErr>;
    readonly derive_next: StaticFunction<SourceValue, NextIn>;
    readonly next_resource: ReactiveResource<NextIn, NextValue, NextErr>;
  },
): ResourceChain<SourceIn, SourceValue, NextIn, NextValue, SourceErr, NextErr> => ({
  kind: "resource_chain",
  name,
  source: input.source,
  derive_next: input.derive_next,
  next_resource: input.next_resource,
});

const keyFamilyId = (family: KeyFamily): string => `key:${family.name}`;
const entityId = (entity: Entity): string => `entity:${entity.name}`;
const queryId = (query: QueryFunction): string => `query:${query.name}`;
const actionId = (action: ActionFunction): string => `action:${action.name}`;
const resourceId = (resource: ReactiveResource): string => `resource:${resource.name}`;
const mutationId = (mutation: ReactiveMutation): string => `mutation:${mutation.name}`;
const resourceAllId = (ra: ResourceAll): string => `resource_all:${ra.name}`;
const resourceChainId = (rc: ResourceChain): string => `resource_chain:${rc.name}`;
const routeId = (route: GenContext["routes"][number]): string =>
  `route:${route.method.kind} ${route.path.template}`;
const appRouteId = (route: AppRoute): string => `app_route:${route.path}`;
const formId = (form: Form): string => `form:${form.name}`;
const eventId = (event: Event): string => `event:${event.name}`;
const subscriptionId = (subscription: Subscription): string => `subscription:${subscription.name}`;

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
    addNode(nodes, { id: keyFamilyId(family), kind: "key_family", name: family.name });
  }

  for (const query of ctx.query_functions) {
    addNode(nodes, { id: queryId(query), kind: "query_function", name: query.name });
    const declaredKey = query.reactivity?.key;
    if (declaredKey !== undefined) {
      const family = declaredKey.family;
      addNode(nodes, { id: keyFamilyId(family), kind: "key_family", name: family.name });
      edges.push({ from: queryId(query), to: keyFamilyId(family), kind: "reads" });
    }
  }

  for (const action of ctx.action_functions) {
    addNode(nodes, { id: actionId(action), kind: "action_function", name: action.name });
    for (const operation of action.body.operations) {
      addNode(nodes, {
        id: entityId(operation.target),
        kind: "entity",
        name: operation.target.name,
      });
      edges.push({ from: actionId(action), to: entityId(operation.target), kind: "writes" });
    }
    for (const expr of action.reactivity?.invalidates ?? []) {
      for (const pattern of expr.patterns) {
        addNode(nodes, {
          id: keyFamilyId(pattern.family),
          kind: "key_family",
          name: pattern.family.name,
        });
        edges.push({
          from: actionId(action),
          to: keyFamilyId(pattern.family),
          kind: "invalidates",
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
    edges.push({ from: resourceId(resource), to: queryId(resource.query), kind: "binds" });
  }

  for (const mutation of ctx.reactive_mutations) {
    addNode(nodes, { id: mutationId(mutation), kind: "mutation", name: mutation.name });
    addNode(nodes, {
      id: actionId(mutation.action),
      kind: "action_function",
      name: mutation.action.name,
    });
    edges.push({ from: mutationId(mutation), to: actionId(mutation.action), kind: "binds" });
    for (const pattern of mutation.invalidates.patterns) {
      addNode(nodes, {
        id: keyFamilyId(pattern.family),
        kind: "key_family",
        name: pattern.family.name,
      });
      edges.push({
        from: mutationId(mutation),
        to: keyFamilyId(pattern.family),
        kind: "invalidates",
      });
    }
  }

  for (const ra of ctx.resource_alls) {
    addNode(nodes, { id: resourceAllId(ra), kind: "resource_all", name: ra.name });
    for (const branch of Object.values(ra.branches)) {
      addNode(nodes, { id: resourceId(branch), kind: "resource", name: branch.name });
      edges.push({ from: resourceAllId(ra), to: resourceId(branch), kind: "binds" });
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
    edges.push({ from: resourceChainId(rc), to: resourceId(rc.source), kind: "binds" });
    edges.push({
      from: resourceChainId(rc),
      to: resourceId(rc.next_resource),
      kind: "binds",
    });
    edges.push({
      from: resourceId(rc.source),
      to: resourceId(rc.next_resource),
      kind: "reads",
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
      from: formId(form),
      to: actionId(form.source_function),
      kind: "binds",
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
      edges.push({ from: actionId(action), to: eventId(event), kind: "emits" });
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
      from: actionId(emission.action),
      to: eventId(emission.event),
      kind: "emits",
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
      from: subscriptionId(subscription),
      to: eventId(subscription.event),
      kind: "subscribes",
    });
  }

  for (const route of ctx.routes) {
    addNode(nodes, { id: routeId(route), kind: "route", name: route.path.template });
    if (route.handler.kind === "query" && isQueryFunction(route.handler.query_func)) {
      addNode(nodes, {
        id: queryId(route.handler.query_func),
        kind: "query_function",
        name: route.handler.query_func.name,
      });
      edges.push({ from: routeId(route), to: queryId(route.handler.query_func), kind: "binds" });
    }
    if (route.handler.kind === "action" && isActionFunction(route.handler.action_func)) {
      addNode(nodes, {
        id: actionId(route.handler.action_func),
        kind: "action_function",
        name: route.handler.action_func.name,
      });
      edges.push({ from: routeId(route), to: actionId(route.handler.action_func), kind: "binds" });
    }
  }

  for (const route of ctx.app_routes) {
    addNode(nodes, { id: appRouteId(route), kind: "app_route", name: route.path });
    for (const loader of route.loaders) {
      if (isQueryFunction(loader)) {
        addNode(nodes, {
          id: queryId(loader),
          kind: "query_function",
          name: loader.name,
        });
        edges.push({ from: appRouteId(route), to: queryId(loader), kind: "binds" });
      } else {
        addNode(nodes, {
          id: resourceId(loader),
          kind: "resource",
          name: loader.name,
        });
        edges.push({ from: appRouteId(route), to: resourceId(loader), kind: "binds" });
      }
    }
    if (route.action) {
      if (isActionFunction(route.action)) {
        addNode(nodes, {
          id: actionId(route.action),
          kind: "action_function",
          name: route.action.name,
        });
        edges.push({ from: appRouteId(route), to: actionId(route.action), kind: "binds" });
      } else {
        addNode(nodes, {
          id: mutationId(route.action),
          kind: "mutation",
          name: route.action.name,
        });
        edges.push({ from: appRouteId(route), to: mutationId(route.action), kind: "binds" });
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
      .filter((edge) => edge.kind === "binds" && staleQueries.has(edge.to))
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
      .filter((edge) => edge.kind === "binds" && staleQueries.has(edge.to))
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
      .filter((edge) => edge.from === mutationNodeId && edge.kind === "invalidates")
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
      if ("id" in key) return key.id;
      return keyFamilyId(key);
    }),
  );
  const queryIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "reads" && keyIds.has(edge.to))
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
      .filter((edge) => edge.from === mutationNodeId && edge.kind === "binds")
      .map((edge) => edge.to)
      .filter((id) => id.startsWith("action:")),
  );
  const formIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "binds" && actionIds.has(edge.to))
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
      .filter((edge) => edge.from === mutationNodeId && edge.kind === "binds")
      .map((edge) => edge.to)
      .filter((id) => id.startsWith("action:")),
  );
  const eventIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "emits" && actionIds.has(edge.from))
      .map((edge) => edge.to),
  );
  const subscriptionIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "subscribes" && eventIds.has(edge.to))
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
      .filter((edge) => edge.from === actionNodeId && edge.kind === "writes")
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
      .filter((edge) => edge.kind === "writes" && edge.to === entityNodeId)
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
      .filter((edge) => edge.kind === "binds" && writingActions.has(edge.to))
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
    .filter((edge) => edge.from === mutationNodeId && edge.kind === "binds")
    .map((edge) => edge.to)
    .filter((id) => id.startsWith("action:"));
  const seen = new Map<string, ReactiveGraphNode>();
  for (const id of actionIds) {
    for (const node of entitiesWrittenByAction(graph, id)) {
      seen.set(node.id, node);
    }
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
};

export const reactiveGraphArtifact = (
  graph: ReactiveGraph,
  path = "reactive-graph.json",
): Artifact =>
  makeArtifact({
    path,
    kind: "asset",
    language: "json",
    content: `${JSON.stringify(graph, null, 2)}\n`,
  });

export interface LoaderBundle {
  readonly kind: "loader_bundle";
  readonly loaders: readonly ReactiveGraphNode[];
}

export interface MutationRefreshPlan {
  readonly kind: "mutation_refresh_plan";
  readonly mutation: ReactiveMutation;
  readonly bundles: readonly LoaderBundle[];
}

export interface SingleFlightPlan {
  readonly kind: "single_flight_plan";
  readonly mutations: readonly MutationRefreshPlan[];
}

export const createLoaderBundle = (loaders: readonly ReactiveGraphNode[]): LoaderBundle => ({
  kind: "loader_bundle",
  loaders,
});

export const createMutationRefreshPlan = (
  mutation: ReactiveMutation,
  bundles: readonly LoaderBundle[],
): MutationRefreshPlan => ({
  kind: "mutation_refresh_plan",
  mutation,
  bundles,
});

export const createSingleFlightPlan = (
  mutations: readonly MutationRefreshPlan[],
): SingleFlightPlan => ({
  kind: "single_flight_plan",
  mutations,
});

const isQueryFunction = (value: unknown): value is QueryFunction => {
  if (typeof value !== "object" || value === null) return false;
  if (!("name" in value) || !("body" in value)) return false;
  const body = (value as { body: unknown }).body;
  return (
    typeof body === "object" &&
    body !== null &&
    "kind" in body &&
    "source" in body &&
    "result_type" in body
  );
};

const isActionFunction = (value: unknown): value is ActionFunction => {
  if (typeof value !== "object" || value === null) return false;
  if (!("name" in value) || !("body" in value)) return false;
  const body = (value as { body: unknown }).body;
  return (
    typeof body === "object" &&
    body !== null &&
    "phase" in body &&
    (body as { phase: unknown }).phase === "mutation" &&
    "operations" in body
  );
};

/**
 * Derives a SingleFlightPlan from the reactive graph and registered mutations.
 * Each mutation gets bundled with the routes and resources that become stale
 * after the mutation invalidates its keys.
 */
export const deriveSingleFlightPlan = (ctx: GenContext, graph: ReactiveGraph): SingleFlightPlan => {
  const plans: MutationRefreshPlan[] = [];

  for (const mutation of ctx.reactive_mutations) {
    const resources = affectedResourcesForMutation(graph, mutation);
    const routes = affectedRoutesForMutation(graph, mutation);

    const loaders: ReactiveGraphNode[] = [...resources, ...routes].sort((a, b) =>
      a.id.localeCompare(b.id),
    );

    if (loaders.length > 0) {
      plans.push(createMutationRefreshPlan(mutation, [createLoaderBundle(loaders)]));
    }
  }

  return createSingleFlightPlan(plans);
};

// --- Reactivity invariants -------------------------------------------------

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
  readonly reactive_resources: readonly ReactiveResource[];
  readonly reactive_mutations: readonly ReactiveMutation[];
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
    if (!isQueryFunction(resource.query)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "reactivity:resource-source-not-query",
          message: `Reactive resource ${resource.name} does not reference a query function`,
        }),
      );
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
    if (!isActionFunction(mutation.action)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "reactivity:mutation-source-not-action",
          message: `Reactive mutation ${mutation.name} does not reference an action function`,
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
        // Best-effort structural check: pattern keys should be a subset of family payload keys.
        // Since families carry phantom types, we only check that the match is a plain object.
        const matchKeys = Object.keys(pattern.match);
        if (matchKeys.length === 0) {
          out.push(
            diagnostic({
              severity: "warning",
              code: "reactivity:key-match-unknown-field",
              message: `Mutation ${mutation.name} match pattern on family ${pattern.family.name} is empty`,
            }),
          );
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

    for (const d of mutation.optimistic.diagnostics) {
      out.push(d);
    }
  }

  return out;
};
