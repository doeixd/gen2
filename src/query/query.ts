/* @__NO_SIDE_EFFECTS__ */
/**
 * Query expression IR. Mirrors expression/QueryExpr but adds query-specific
 * composition fields (joins, group_by, target_runtimes, target_stores) and the
 * QueryBackedField/QueryPlanner machinery for cross-store composition.
 *
 * See spec/query.allium.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";
import type { Expr, Predicate } from "../expression/index.ts";
import type { FallbackPolicy } from "../expression/plan.ts";
import type { Relation } from "../relation/index.ts";
import type { Store } from "../storage/index.ts";
import type { Effect, Operation, Requirement, Runtime, SemanticType } from "../types/index.ts";

/**
 * Extract the result TypeScript type from a QueryExpression.
 *
 * @template Q - The QueryExpression type to infer from.
 */
export type InferQueryResult<Q extends QueryExpression> =
  Q extends QueryExpression<infer Ts> ? Ts : never;

/**
 * Discriminated kind tag for a query expression node.
 */
export type QueryExprKindTag =
  | "select"
  | "from"
  | "where"
  | "order_by"
  | "limit"
  | "offset"
  | "join"
  | "aggregate"
  | "subquery";

/**
 * Kind wrapper for a query expression node.
 */
export interface QueryExprKind {
  /** The kind tag of this query expression node. */
  readonly kind: QueryExprKindTag;
}

/**
 * Kind of data source for a query.
 */
export type QuerySourceKind =
  | "entity_source"
  | "relation_source"
  | "subquery_source"
  | "expression_source";

/**
 * Describes the origin of data for a query (entity, relation, subquery, or expression).
 */
export interface QuerySource {
  /** Discriminator for the source kind. */
  readonly kind: QuerySourceKind;
  /** The entity when kind is "entity_source". */
  readonly entity?: Entity;
  /** The relation when kind is "relation_source". */
  readonly relation?: Relation;
  /** The subquery when kind is "subquery_source". */
  readonly subquery?: QueryExpression;
  /** The expression when kind is "expression_source". */
  readonly source_expression?: Expr;
}

/**
 * A field selected in a query projection with an optional alias or expression.
 */
export interface ProjectedField {
  /** The field being projected. */
  readonly field: Field;
  /** Optional alias for the projected column. */
  readonly alias?: string;
  /** Optional expression that computes the projected value. */
  readonly expression?: Expr;
}

/**
 * An aggregate operation applied to a field in a query projection.
 */
export interface AggregateProjection {
  /** The aggregate operation (e.g., count, sum). */
  readonly aggregate_op: Operation;
  /** The field being aggregated. */
  readonly field: Field;
  /** Alias for the aggregate result. */
  readonly alias: string;
  /** Optional expression used in the aggregate. */
  readonly expression?: Expr;
}

/**
 * The full set of projected fields and aggregates for a query.
 */
export interface QueryProjection {
  /** Fields selected in the projection. */
  readonly fields: readonly ProjectedField[];
  /** Aggregate operations in the projection. */
  readonly aggregates: readonly AggregateProjection[];
}

/**
 * Kind of SQL-style join.
 */
export type JoinKind = "inner" | "left" | "right" | "cross";

/**
 * A join between two query sources with a predicate condition.
 */
export interface JoinClause {
  /** The kind of join (inner, left, right, cross). */
  readonly kind: JoinKind;
  /** The target query source to join with. */
  readonly target: QuerySource;
  /** Predicate condition for the join. */
  readonly condition: Predicate;
}

/**
 * Sort direction for an order-by clause.
 */
export type OrderDirection = "asc" | "desc";

/**
 * A single order-by criterion.
 */
export interface OrderByClause {
  /** Field to sort by. */
  readonly field: Field;
  /** Optional expression used for sorting. */
  readonly expression?: Expr;
  /** Sort direction. */
  readonly direction: OrderDirection;
}

/**
 * A fully structured query expression with source, projection, joins, filtering, and targets.
 */
export interface QueryExpression<Result = unknown> {
  /**
   * Phantom type parameter linking this query to its result TypeScript type.
   */
  readonly _result?: Result;
  /** Kind wrapper for the query node. */
  readonly kind: QueryExprKind;
  /** Data source for the query. */
  readonly source: QuerySource;
  /** Optional filter predicate. */
  readonly predicate?: Predicate;
  /** Optional projection of fields and aggregates. */
  readonly projection?: QueryProjection;
  /** Join clauses linking additional sources. */
  readonly joins: readonly JoinClause[];
  /** Order-by clauses. */
  readonly order_by: readonly OrderByClause[];
  /** Optional LIMIT expression. */
  readonly limit?: Expr;
  /** Optional OFFSET expression. */
  readonly offset?: Expr;
  /** Fields to group by. */
  readonly group_by: readonly Field[];
  /** Semantic type describing the query result shape. */
  readonly result_type: SemanticType<Result>;
  /** Capabilities required to execute the query. */
  readonly requirements: readonly Requirement[];
  /** Side effects that the query may produce. */
  readonly effects: readonly Effect[];
  /** Runtimes that the query may target. */
  readonly target_runtimes: readonly Runtime[];
  /** Stores that the query may read from. */
  readonly target_stores: readonly Store[];
}

/**
 * A field whose value is backed by a subquery expression.
 */
export interface QueryBackedField<Ts = unknown> {
  /** The field being backed. */
  readonly field: Field<Ts>;
  /** Subquery that produces the field's value. */
  readonly query: QueryExpression;
  /** Entity that owns the field. */
  readonly entity: Entity;
}

/**
 * Strategy for composing results across multiple stores.
 */
export type CompositionStrategyKind =
  | "server_composition"
  | "materialized_view"
  | "streaming_join"
  | "event_sourced";

/**
 * A query decomposed into per-store plans with a composition strategy.
 */
export interface CrossStoreQuery<Result = unknown> {
  /** The original query being decomposed. */
  readonly query: QueryExpression<Result>;
  /** Plans for individual stores. */
  readonly store_plans: readonly StoreQueryPlan<Result>[];
  /** Strategy used to merge partial results. */
  readonly composition_strategy: CompositionStrategyKind;
}

/**
 * A query fragment planned for execution on a specific store.
 */
export interface StoreQueryPlan<Result = unknown> {
  /** Store that will execute this fragment. */
  readonly store: Store;
  /** Fields required by this fragment. */
  readonly fields: readonly Field[];
  /** Local query expression for this store. */
  readonly local_query: QueryExpression<Result>;
  /** Runtime responsible for execution. */
  readonly runtime: Runtime;
}

/**
 * Kind of source for a field's value in a query plan.
 */
export type FieldSourceKind =
  | "database_column"
  | "computed_expression"
  | "aggregate_query"
  | "subquery"
  | "service_call"
  | "cache_lookup";

/**
 * Describes how a field's value is produced in a query plan.
 */
export interface FieldSource {
  /** Discriminator for the source kind. */
  readonly kind: FieldSourceKind;
  /** Column reference when kind is "database_column". */
  readonly column?: { name: string };
  /** Expression when kind is "computed_expression". */
  readonly expression?: Expr;
  /** Subquery when kind is "subquery" or "aggregate_query". */
  readonly query?: QueryExpression;
}

/**
 * Binds a field to a source, runtime, store, and optional operation.
 */
export interface FieldAssignment {
  /** The field being assigned. */
  readonly field: Field;
  /** Source that produces the field value. */
  readonly source: FieldSource;
  /** Runtime responsible for producing the value. */
  readonly runtime: Runtime;
  /** Optional store that the source belongs to. */
  readonly store?: Store;
  /** Optional operation expression. */
  readonly operation?: Expr;
}

/**
 * A compiled plan for executing a query with assignments and capability flags.
 */
export interface QueryPlan {
  /** Field-to-source assignments. */
  readonly assignments: readonly FieldAssignment[];
  /** Whether joins are required. */
  readonly joins_required: boolean;
  /** Whether subqueries are required. */
  readonly subqueries_required: boolean;
  /** Whether server-side composition across stores is required. */
  readonly server_composition_required: boolean;
  /** Whether the query reads from more than one store. */
  readonly cross_store_reads: boolean;
  /** Fallback policy when a store or runtime is unavailable. */
  readonly fallback_policy: FallbackPolicy;
}

/**
 * Combines a query with its compiled execution plan.
 */
export interface QueryPlanner<Result = unknown> {
  /** Human-readable name of the planner. */
  readonly name: string;
  /** The query being planned. */
  readonly query: QueryExpression<Result>;
  /** Compiled execution plan. */
  readonly plan: QueryPlan;
}

// --- Projection / OrderBy / Join helpers ---------------------------------

/**
 * Creates a ProjectedField.
 *
 * @param field - The field to project.
 * @param alias - Optional alias.
 * @param expression - Optional expression.
 * @returns A ProjectedField.
 */
export const buildProjectedField = (
  field: Field,
  alias?: string,
  expression?: Expr,
): ProjectedField => ({
  field,
  alias,
  expression,
});

/**
 * Creates an AggregateProjection.
 *
 * @param aggregate_op - The aggregate operation.
 * @param field - The field to aggregate.
 * @param alias - Result alias.
 * @param expression - Optional expression.
 * @returns An AggregateProjection.
 */
export const buildAggregateProjection = (
  aggregate_op: Operation,
  field: Field,
  alias: string,
  expression?: Expr,
): AggregateProjection => ({ aggregate_op, field, alias, expression });

/**
 * Creates a QueryProjection.
 *
 * @param fields - Projected fields.
 * @param aggregates - Aggregate projections.
 * @returns A QueryProjection.
 */
export const buildQueryProjection = (
  fields: readonly ProjectedField[],
  aggregates: readonly AggregateProjection[] = [],
): QueryProjection => ({ fields, aggregates });

/**
 * Creates an OrderByClause.
 *
 * @param field - Field to order by.
 * @param direction - Sort direction (default "asc").
 * @param expression - Optional expression.
 * @returns An OrderByClause.
 */
export const buildOrderByClause = (
  field: Field,
  direction: OrderDirection = "asc",
  expression?: Expr,
): OrderByClause => ({
  field,
  direction,
  expression,
});

/**
 * Creates a JoinClause.
 *
 * @param kind - Join kind.
 * @param target - Target query source.
 * @param condition - Join condition predicate.
 * @returns A JoinClause.
 */
export const buildJoinClause = (
  kind: JoinKind,
  target: QuerySource,
  condition: Predicate,
): JoinClause => ({
  kind,
  target,
  condition,
});

// --- Query-backed field / Planner constructors -----------------------------

/**
 * Creates a QueryBackedField that binds a field to a subquery expression.
 *
 * @param field - The field to back with a query.
 * @param query - The query expression that produces the field's value.
 * @param entity - The entity that owns the field.
 * @returns A QueryBackedField record.
 */
export const queryBackedField = <Ts = unknown>(
  field: Field<Ts>,
  query: QueryExpression,
  entity: Entity,
): QueryBackedField<Ts> => ({
  field,
  query,
  entity,
});

/**
 * Creates a QueryPlan with field assignments and capability flags.
 *
 * @param assignments - Field-to-source assignments.
 * @param options - Optional capability flags and fallback policy.
 * @returns A QueryPlan record.
 */
export const createQueryPlan = (
  assignments: readonly FieldAssignment[],
  options?: {
    joins_required?: boolean;
    subqueries_required?: boolean;
    server_composition_required?: boolean;
    cross_store_reads?: boolean;
    fallback_policy?: FallbackPolicy;
  },
): QueryPlan => ({
  assignments,
  joins_required: options?.joins_required ?? false,
  subqueries_required: options?.subqueries_required ?? false,
  server_composition_required: options?.server_composition_required ?? false,
  cross_store_reads: options?.cross_store_reads ?? false,
  fallback_policy: options?.fallback_policy ?? {
    kind: "deny",
    pure_only: true,
    deterministic_only: true,
    effectful_ok: false,
  },
});

/**
 * Creates a QueryPlanner that pairs a query with its execution plan.
 *
 * @param name - Planner name.
 * @param query - The query to plan.
 * @param plan - The compiled execution plan.
 * @returns A QueryPlanner record.
 */
export const createQueryPlanner = <Result = unknown>(
  name: string,
  query: QueryExpression<Result>,
  plan: QueryPlan,
): QueryPlanner<Result> => ({
  name,
  query,
  plan,
});

/**
 * Creates a CrossStoreQuery decomposed into per-store plans.
 *
 * @param query - The original query.
 * @param store_plans - Per-store query fragments.
 * @param composition_strategy - Strategy for composing results.
 * @returns A CrossStoreQuery record.
 */
export const crossStoreQuery = <Result = unknown>(
  query: QueryExpression<Result>,
  store_plans: readonly StoreQueryPlan<Result>[],
  composition_strategy: CompositionStrategyKind = "server_composition",
): CrossStoreQuery<Result> => ({
  query,
  store_plans,
  composition_strategy,
});

// --- Constructors ---------------------------------------------------------

/**
 * Constructs a QueryExpression from structured input.
 *
 * @param input - Query properties including source, result type, and optional clauses.
 * @returns A QueryExpression record.
 * @example
 * ```ts
 * const q = buildQuery({
 *   source: { kind: "entity_source", entity: User },
 *   result_type: User.resultType,
 *   predicate: gen.types.op.eq(User.fields.id, someId),
 * });
 * ```
 */
export const buildQuery = <Result = unknown>(input: {
  source: QuerySource;
  result_type: SemanticType<Result>;
  kind?: QueryExprKindTag;
  predicate?: Predicate;
  projection?: QueryProjection;
  joins?: readonly JoinClause[];
  order_by?: readonly OrderByClause[];
  limit?: Expr;
  offset?: Expr;
  group_by?: readonly Field[];
  requirements?: readonly Requirement[];
  effects?: readonly Effect[];
  target_runtimes?: readonly Runtime[];
  target_stores?: readonly Store[];
}): QueryExpression<Result> => ({
  kind: { kind: input.kind ?? "select" },
  source: input.source,
  predicate: input.predicate,
  projection: input.projection,
  joins: input.joins ?? [],
  order_by: input.order_by ?? [],
  limit: input.limit,
  offset: input.offset,
  group_by: input.group_by ?? [],
  result_type: input.result_type,
  requirements: input.requirements ?? [],
  effects: input.effects ?? [],
  target_runtimes: input.target_runtimes ?? [],
  target_stores: input.target_stores ?? [],
});

// --- Fluent query DSL ----------------------------------------------------

/**
 * Fluent query builder. Construct via `query.from(entity)` and chain
 * `.where()`, `.select()`, `.orderBy()`, `.limit()`, `.offset()`.
 *
 * @example
 * ```ts
 * const q = query.from(User)
 *   .where(gen.types.op.eq(User.fields.id, someIdExpr))
 *   .select([User.fields.id, User.fields.email]);
 * ```
 */
export interface QueryBuilder<Source = unknown, Result = Source> {
  /** Sets or replaces the query predicate. */
  where(predicate: Predicate<Source>): QueryBuilder<Source, Result>;
  /** Sets the projection to a list of fields (no aliases). */
  select<Ts>(fields: readonly Field<Ts>[]): QueryBuilder<Source, Ts[]>;
  /** Sets the projection from a QueryProjection record. */
  selectProjection(projection: QueryProjection): QueryBuilder<Source, unknown>;
  /** Adds an ORDER BY clause. */
  orderBy(field: Field, direction?: OrderDirection): QueryBuilder<Source, Result>;
  /** Adds a GROUP BY field. */
  groupBy(field: Field): QueryBuilder<Source, Result>;
  /** Sets LIMIT. */
  limit(expr: Expr): QueryBuilder<Source, Result>;
  /** Sets OFFSET. */
  offset(expr: Expr): QueryBuilder<Source, Result>;
  /** Adds a JOIN clause. */
  join(kind: JoinKind, target: QuerySource, condition: Predicate): QueryBuilder<Source, Result>;
  /** Finalizes and returns the typed QueryExpression. */
  build(): QueryExpression<Result>;
}

/**
 * Internal mutable state used by the query builder during construction.
 * Fields are writable so the builder can accumulate updates without
 * allocating a new object on every fluent call.
 */
interface QueryBuilderState {
  kind: QueryExprKind;
  source: QuerySource;
  predicate: Predicate | undefined;
  projection: QueryProjection | undefined;
  joins: JoinClause[];
  order_by: OrderByClause[];
  limit: Expr | undefined;
  offset: Expr | undefined;
  group_by: Field[];
  result_type: SemanticType;
  requirements: Requirement[];
  effects: Effect[];
  target_runtimes: Runtime[];
  target_stores: Store[];
}

const queryBuilder = <Source = unknown, Result = Source>(
  source: QuerySource,
  result_type: SemanticType,
): QueryBuilder<Source, Result> => {
  const state: QueryBuilderState = {
    kind: { kind: "select" },
    source,
    predicate: undefined,
    projection: undefined,
    joins: [],
    order_by: [],
    limit: undefined,
    offset: undefined,
    group_by: [],
    result_type,
    requirements: [],
    effects: [],
    target_runtimes: [],
    target_stores: [],
  };

  const self: QueryBuilder<Source, Result> = {
    where: (predicate) => {
      state.predicate = predicate;
      return self;
    },
    select: <Ts>(fields: readonly Field<Ts>[]) => {
      state.projection = {
        fields: fields.map((f) => ({ field: f })),
        aggregates: [],
      };
      state.result_type = fields[0]?.semantic_type ?? state.result_type;
      return self as QueryBuilder<Source, Ts[]>;
    },
    selectProjection: (projection) => {
      state.projection = projection;
      return self as QueryBuilder<Source, unknown>;
    },
    orderBy: (field, direction = "asc") => {
      state.order_by.push({ field, direction });
      return self;
    },
    groupBy: (field) => {
      state.group_by.push(field);
      return self;
    },
    limit: (expr) => {
      state.limit = expr;
      return self;
    },
    offset: (expr) => {
      state.offset = expr;
      return self;
    },
    join: (kind, target, condition) => {
      state.joins.push({ kind, target, condition });
      return self;
    },
    build: () =>
      ({
        kind: state.kind,
        source: state.source,
        predicate: state.predicate,
        projection: state.projection,
        joins: state.joins,
        order_by: state.order_by,
        limit: state.limit,
        offset: state.offset,
        group_by: state.group_by,
        result_type: state.result_type,
        requirements: state.requirements,
        effects: state.effects,
        target_runtimes: state.target_runtimes,
        target_stores: state.target_stores,
      }) as QueryExpression<Result>,
  };

  return self;
};

/**
 * Starts a fluent query builder from an entity source.
 *
 * @param entity - The source entity.
 * @param result_type - Optional result type (defaults to the entity's inferred type).
 * @returns A QueryBuilder.
 * @example
 * ```ts
 * const q = fromEntity(User).where(eq(User.fields.active, true)).build();
 * ```
 */
export const fromEntity = <Result = unknown>(
  entity: Entity,
  result_type?: SemanticType<Result>,
): QueryBuilder<unknown, Result> =>
  queryBuilder<unknown, Result>(
    { kind: "entity_source", entity },
    result_type ??
      (entity.fieldList[0]?.semantic_type as SemanticType<Result>) ??
      ({
        name: "unknown",
        kind: "json",
        ts_type_name: "unknown",
        storage_repr: { name: "unknown", kind: { kind: "document" }, fixed: false, metadata: [] },
        has_serializer: false,
        has_deserializer: false,
        server_only: false,
        traits: [],
      } as SemanticType<Result>),
  );

// --- Invariants and rules ------------------------------------------------

/**
 * Validates query invariants: aggregate operations, projection field existence,
 * join predicate kinds, and predicate entity scoping.
 *
 * @param queries - Queries to validate.
 * @returns Diagnostics for any violated query rules.
 */
export const checkQueries = (queries: readonly QueryExpression[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  for (const q of queries) {
    // AggregateProjectionUsesAggregateOp + AggregateProjectionFieldNumericWhenRequired
    if (q.projection) {
      for (const ap of q.projection.aggregates) {
        if (ap.aggregate_op.kind !== "aggregate") {
          out.push(
            diagnostic({
              severity: "error",
              code: "query:non-aggregate-op",
              message: `AggregateProjection uses non-aggregate operation ${ap.aggregate_op.name}`,
            }),
          );
        }
        if (ap.aggregate_op.requires_numeric && ap.field.semantic_type.kind !== "numeric") {
          out.push(
            diagnostic({
              severity: "error",
              code: "query:ambiguous-aggregate",
              message: `Aggregate ${ap.aggregate_op.name} over field ${ap.field.name} requires numeric type`,
            }),
          );
        }
      }
      // NonexistentFieldInProjection
      if (q.source.entity) {
        for (const pf of q.projection.fields) {
          if (!q.source.entity.fieldList.includes(pf.field)) {
            out.push(
              diagnostic({
                severity: "error",
                code: "query:nonexistent-field",
                message: `Projected field ${pf.field.name} does not exist in source entity ${q.source.entity.name}`,
              }),
            );
          }
        }
      }
    }

    // JoinConditionPredicate: kind must be comparison or boolean_logic
    for (const j of q.joins) {
      const k = j.condition.kind.kind;
      if (k !== "comparison" && k !== "boolean_logic") {
        out.push(
          diagnostic({
            severity: "warning",
            code: "query:join-non-predicate",
            message: `Join condition kind ${k} is unusual; expected comparison or boolean_logic`,
          }),
        );
      }
    }

    // FieldFromWrongEntityInPredicate
    if (q.predicate && q.source.entity) {
      const validEntityNames = new Set<string>([q.source.entity.name]);
      for (const j of q.joins) {
        if (j.target.entity) validEntityNames.add(j.target.entity.name);
      }
      for (const ref of q.predicate.refs) {
        if (ref.kind !== "FieldRef") continue;
        if (!validEntityNames.has(ref.owner.name)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "query:wrong-entity-field",
              message: `Predicate references field ${ref.name} from entity ${ref.owner.name} but query source is ${q.source.entity.name}`,
            }),
          );
        }
      }
    }

    // JoinConditionReferencesJoinedEntity
    for (const j of q.joins) {
      if (!j.target.entity) continue;
      const targetFieldNames = new Set(j.target.entity.fieldList.map((f) => f.name));
      const refsAnyTargetField = j.condition.refs.some(
        (r) =>
          r.kind === "FieldRef" &&
          r.owner.name === j.target.entity!.name &&
          targetFieldNames.has(r.name),
      );
      if (!refsAnyTargetField) {
        out.push(
          diagnostic({
            severity: "error",
            code: "query:join-condition-invalid",
            message: `Join condition does not reference any field of joined entity ${j.target.entity.name}`,
          }),
        );
      }
    }
  }

  return out;
};

/**
 * Checks that each query's required effects are supported by its target runtimes.
 *
 * @param queries - Queries to validate.
 * @returns Diagnostics for unsupported runtime effects.
 */
export const checkQueryRuntimes = (queries: readonly QueryExpression[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const q of queries) {
    for (const runtime of q.target_runtimes) {
      for (const e of q.effects) {
        if (!runtime.capabilities.includes(e.kind)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "query:unsupported-operation",
              message: `Query requires effect ${e.kind} not supported by runtime ${runtime.name}`,
            }),
          );
        }
      }
    }
  }
  return out;
};
