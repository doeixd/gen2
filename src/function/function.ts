/* @__NO_SIDE_EFFECTS__ */
/**
 * Functions encapsulate reusable logic. The taxonomy mirrors expression.allium:
 *   StaticFunction    — opaque static node body, declared effects/requirements
 *   ExprFunction      — body is an Expr; useful for pure derivations
 *   PredicateFunction — body is a Predicate
 *   QueryFunction     — body is a QueryExpression
 *   ActionFunction    — body is an ActionExpr (writes)
 *   PatchFunction     — body is a PatchExpr (optimistic)
 *   PlanFunction      — body is a PlanExpr (planner output)
 *
 * See spec/function.allium.
 */

import {
  type Diagnostic,
  diagnostic,
  entityToSemanticType,
  type PolicyAction,
} from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";
import type { Expr, PlanExpr, Predicate } from "../expression/index.ts";
import type { FallbackPolicy } from "../expression/plan.ts";
import type { QueryExpression } from "../query/index.ts";
import type {
  KeyExpression,
  KeyFamily,
  KeyPayload,
  KeyPatternExpression,
  ReactiveKeyPattern,
} from "../reactivity/index.ts";
import { anyKey, keyExpr, keyPatternExpr } from "../reactivity/index.ts";
import type { Store } from "../storage/index.ts";
import type {
  Capability,
  Effect,
  Law,
  Operation,
  Requirement,
  Runtime,
  SemanticType,
} from "../types/index.ts";

/** Describes an error that a function may return. */
export interface ErrorType {
  readonly code: string;
  readonly kind: "conflict" | "validation" | "auth" | "not_found" | "forbidden";
  readonly field_name?: string;
}

// ---------------------------------------------------------------------------
// Body types referenced by ActionFunction and PatchFunction. These mirror
// expression.allium's ActionExpr and PatchExpr but live here so function.ts
// doesn't need to round-trip through expression for trivial constructions.
// ---------------------------------------------------------------------------

/** Discriminated kind tag for an action expression. */
export type ActionExprKindTag = "insert" | "update" | "delete" | "custom" | "sequence";

/** Kind wrapper for an action expression. */
export interface ActionExprKind {
  readonly kind: ActionExprKindTag;
}

/** A single insert, update, or delete operation within an action expression. */
export interface WriteOperation {
  readonly kind: "insert_op" | "update_op" | "delete_op";
  readonly target: Entity;
  readonly values: ReadonlyMap<Field, Expr>;
  readonly condition?: Predicate;
}

/** An expression representing a write action against an entity. */
export interface ActionExpr {
  readonly kind: ActionExprKind;
  readonly phase: "schema" | "query" | "mutation" | "client" | "server";
  readonly target_entity: import("../entity/index.ts").Entity;
  readonly operations: readonly WriteOperation[];
  readonly effects: readonly Effect[];
  readonly requirements: readonly Requirement[];
}

/** A single patch item within an optimistic patch expression. */
export interface PatchItemExpr {
  readonly kind: "patch_insert" | "patch_update" | "patch_delete";
  readonly values: ReadonlyMap<Field, Expr>;
  readonly temp_id?: Expr;
}

/** An optimistic patch expression for pending mutations. */
export interface PatchExpr {
  readonly kind: { kind: "optimistic_insert" | "optimistic_update" | "optimistic_delete" };
  readonly phase: "schema" | "query" | "mutation" | "client" | "server";
  readonly target_query: QueryExpression;
  readonly patch_items: readonly PatchItemExpr[];
  readonly reconcile_field?: Field;
  readonly rollback_strategy: "inverse" | "custom";
}

// ---------------------------------------------------------------------------
// Function entities.
// ---------------------------------------------------------------------------

/** A function with an opaque static body and declared effects/requirements. */
export interface StaticFunction<In = unknown, Out = unknown> {
  readonly name: string;
  readonly input_type: SemanticType<In>;
  readonly input_fields: readonly Field[];
  readonly output_type: SemanticType<Out>;
  readonly body: {
    kind: string;
    output_type: SemanticType<Out>;
    requirements: readonly Requirement[];
    effects: readonly Effect[];
  };
  readonly requirements: readonly Requirement[];
  readonly effects: readonly Effect[];
  readonly capabilities: readonly Capability[];
  readonly laws: readonly Law[];
  readonly target_runtimes: readonly Runtime[];
}

/** A function whose body is a typed expression. */
export interface ExprFunction<In = unknown, Out = unknown> {
  readonly name: string;
  readonly input_type: SemanticType<In>;
  readonly output_type: SemanticType<Out>;
  readonly body: Expr;
  readonly requirements: readonly Requirement[];
  readonly effects: readonly Effect[];
  readonly capabilities: readonly Capability[];
  readonly laws: readonly Law[];
  readonly target_runtimes: readonly Runtime[];
}

/** A function whose body is a predicate expression. */
export interface PredicateFunction<In = unknown> {
  readonly name: string;
  readonly input_type: SemanticType<In>;
  readonly body: Predicate;
  readonly requirements: readonly Requirement[];
  readonly effects: readonly Effect[];
  readonly target_runtimes: readonly Runtime[];
}

/** A function that returns query results, optionally with auth and error types. */
export interface QueryReactivity<Input = unknown, Payload extends KeyPayload = KeyPayload> {
  readonly key: KeyExpression<Input, Payload>;
}

export interface ActionReactivity<Input = unknown, Payload extends KeyPayload = KeyPayload> {
  readonly invalidates: readonly KeyPatternExpression<Input, Payload>[];
}

export interface QueryFunction<
  In = unknown,
  Out = unknown,
  Payload extends KeyPayload = KeyPayload,
> {
  readonly name: string;
  readonly input_type: SemanticType<In>;
  readonly input_fields: readonly Field[];
  readonly returns: SemanticType<Out>;
  readonly body: QueryExpression;
  readonly reactivity?: QueryReactivity<In, Payload>;
  readonly auth?: PolicyAction;
  readonly errors: readonly ErrorType[];
  readonly requirements: readonly Requirement[];
  readonly target_runtimes: readonly Runtime[];
}

/** A function representing a write action with auth, effects, and store targets. */
export interface ActionFunction<In = unknown, Out = unknown> {
  readonly name: string;
  readonly input_type: SemanticType<In>;
  readonly input_fields: readonly Field[];
  readonly returns: SemanticType<Out>;
  readonly body: ActionExpr;
  readonly auth?: PolicyAction;
  readonly errors: readonly ErrorType[];
  readonly invalidates: readonly QueryFunction[];
  readonly reactivity?: ActionReactivity<In>;
  readonly optimistic?: PatchFunction;
  readonly consistency: "transactional" | "eventual" | "best_effort";
  readonly written_stores: readonly Store[];
  readonly effects: readonly Effect[];
  readonly requirements: readonly Requirement[];
  readonly target_runtimes: readonly Runtime[];
}

/** A function representing an optimistic patch with reconciliation. */
export interface PatchFunction<In = unknown, Out = unknown> {
  readonly name: string;
  readonly input_type: SemanticType<In>;
  readonly returns: SemanticType<Out>;
  readonly body: PatchExpr;
  readonly reconcile_field?: Field;
  readonly rollback_strategy?: "inverse" | "custom";
}

/** A function wrapping a runtime-aware execution plan. */
export interface PlanFunction<In = unknown, Out = unknown> {
  readonly name: string;
  readonly input_type: SemanticType<In>;
  readonly output_type: SemanticType<Out>;
  readonly body: PlanExpr;
  readonly fallback_policy: FallbackPolicy;
}

// ---------------------------------------------------------------------------
// Catalog used to enforce global function-name uniqueness across kinds.
// ---------------------------------------------------------------------------

/** Registry of all functions across kinds, used for global uniqueness checks. */
export interface FunctionCatalog {
  static: readonly StaticFunction[];
  expr: readonly ExprFunction[];
  predicate: readonly PredicateFunction[];
  query: readonly QueryFunction[];
  action: readonly ActionFunction[];
  patch: readonly PatchFunction[];
  plan: readonly PlanFunction[];
}

/**
 * Creates an empty {@link FunctionCatalog}.
 *
 * @returns An empty catalog with all function-kind arrays initialized to `[]`.
 *
 * @example
 * ```ts
 * const catalog = emptyFunctionCatalog();
 * // catalog.static === []
 * // catalog.query === []
 * ```
 */
export const emptyFunctionCatalog = (): FunctionCatalog => ({
  static: [],
  expr: [],
  predicate: [],
  query: [],
  action: [],
  patch: [],
  plan: [],
});

// --- Type-level inference helpers ------------------------------------------

/** Extract the input TypeScript type from any function type. */
export type InferFunctionInput<F> = F extends { input_type: SemanticType<infer In> } ? In : never;

/** Extract the output TypeScript type from any function type. */
export type InferFunctionOutput<F> = F extends { output_type: SemanticType<infer Out> }
  ? Out
  : F extends { returns: SemanticType<infer Out> }
    ? Out
    : never;

/** Extract the error element type from a function that carries `errors`. */
export type InferFunctionErrors<F> = F extends { errors: readonly (infer E)[] } ? E : never;

export type InferQueryInput<Q extends QueryFunction> = InferFunctionInput<Q>;
export type InferQueryOutput<Q extends QueryFunction> = InferFunctionOutput<Q>;
export type InferQueryErrors<Q extends QueryFunction> = InferFunctionErrors<Q>;
export type InferActionInput<A extends ActionFunction> = InferFunctionInput<A>;
export type InferActionOutput<A extends ActionFunction> = InferFunctionOutput<A>;
export type InferActionErrors<A extends ActionFunction> = InferFunctionErrors<A>;

// ---------------------------------------------------------------------------
// Invariants and rules.
// ---------------------------------------------------------------------------

/**
 * Validates function catalog invariants: global name uniqueness, body/output type
 * matching, declared action effects, patch reconcilability, and plan fallback policies.
 *
 * @param cat - The function catalog to validate.
 * @returns Diagnostics for any violated function rules.
 */
export const checkFunctions = (cat: FunctionCatalog): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // Global function-name uniqueness across kinds.
  const allNames = new Map<string, string>(); // name → kind
  const collect = (kind: string, fns: readonly { name: string }[]): void => {
    for (const f of fns) {
      const owner = allNames.get(f.name);
      if (owner !== undefined && owner !== kind) {
        out.push(
          diagnostic({
            severity: "error",
            code: "function:duplicate-name",
            message: `Function name ${f.name} declared as both ${owner} and ${kind}`,
          }),
        );
      } else if (owner === kind) {
        out.push(
          diagnostic({
            severity: "error",
            code: "function:duplicate-name",
            message: `Function ${f.name} declared twice in ${kind}`,
          }),
        );
      } else {
        allNames.set(f.name, kind);
      }
    }
  };
  collect("static", cat.static);
  collect("expr", cat.expr);
  collect("predicate", cat.predicate);
  collect("query", cat.query);
  collect("action", cat.action);
  collect("patch", cat.patch);
  collect("plan", cat.plan);

  // FunctionBodyMatchesReturn (StaticFunction)
  for (const f of cat.static) {
    if (f.body.output_type.name !== f.output_type.name) {
      out.push(
        diagnostic({
          severity: "error",
          code: "expression:function-output-mismatch",
          message: `Function ${f.name} body output type does not match declared return type`,
        }),
      );
    }
  }

  // ActionFunctionEffectsDeclared
  for (const a of cat.action) {
    const declared = new Set(a.effects.map((e) => e.kind));
    for (const e of a.body.effects) {
      if (!declared.has(e.kind)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "function:undeclared-action-effect",
            message: `Action ${a.name} body uses effect ${e.kind} not in its declared effects`,
          }),
        );
      }
    }
  }

  // PatchFunctionReconcilable
  for (const p of cat.patch) {
    if (p.reconcile_field == null) {
      out.push(
        diagnostic({
          severity: "error",
          code: "function:unreconcilable-patch",
          message: `Patch function ${p.name} has no reconcile_field`,
        }),
      );
    }
  }

  // OptimisticPatchNotReconcilable rule
  for (const a of cat.action) {
    if (a.optimistic && a.optimistic.reconcile_field == null) {
      out.push(
        diagnostic({
          severity: "error",
          code: "function:unreconcilable-patch",
          message: `Optimistic patch for action ${a.name} has no reconcile field`,
        }),
      );
    }
  }

  // PlanFunctionFallbackPolicy
  for (const p of cat.plan) {
    if (p.fallback_policy.pure_only && p.body.primary.effects.length > 0) {
      out.push(
        diagnostic({
          severity: "error",
          code: "function:plan-pure-only-violated",
          message: `Plan function ${p.name} declares pure_only fallback but primary has effects`,
        }),
      );
    }
  }

  for (const a of cat.action) {
    for (const q of a.invalidates) {
      if (q.reactivity?.key === undefined) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "function:legacy-invalidation-without-query-key",
            message: `Action ${a.name} invalidates query ${q.name}, but the query has no reactivity key to lower`,
          }),
        );
      }
    }
  }

  return out;
};

const lowerLegacyInvalidations = <In = unknown>(
  invalidates: readonly QueryFunction[],
): readonly KeyPatternExpression<In>[] =>
  invalidates.flatMap((query) => {
    const declaredKey = query.reactivity?.key;
    if (declaredKey === undefined) return [];
    return [keyPatternExpr<In>(declaredKey.family, [anyKey(declaredKey.family)])];
  });

/**
 * Checks that all function effects are supported by their target runtimes.
 *
 * @param cat - The function catalog to validate.
 * @returns Diagnostics for unsupported runtime effects.
 */
export const checkFunctionRuntimes = (cat: FunctionCatalog): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const checkOne = (
    name: string,
    effects: readonly Effect[],
    runtimes: readonly Runtime[],
  ): void => {
    for (const runtime of runtimes) {
      for (const effect of effects) {
        if (!runtime.capabilities.includes(effect.kind)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "runtime:unsupported-operation",
              message: `Function ${name}: effect ${effect.kind} not supported by runtime ${runtime.name}`,
            }),
          );
        }
      }
    }
  };
  for (const f of cat.static) checkOne(f.name, f.effects, f.target_runtimes);
  for (const f of cat.expr) checkOne(f.name, f.effects, f.target_runtimes);
  for (const f of cat.predicate) checkOne(f.name, f.effects, f.target_runtimes);
  for (const f of cat.action) checkOne(f.name, f.effects, f.target_runtimes);
  return out;
};

/**
 * Ensures action functions do not write to read-only fields.
 *
 * @param cat - The function catalog to validate.
 * @returns Diagnostics for writes to non-writable fields.
 */
export const checkActionWrites = (cat: FunctionCatalog): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const a of cat.action) {
    for (const op of a.body.operations) {
      for (const field of op.values.keys()) {
        if (field.read_only) {
          out.push(
            diagnostic({
              severity: "error",
              code: "function:non-writable-field",
              message: `Action ${a.name} writes read-only field ${field.name}`,
            }),
          );
        }
      }
    }
  }
  return out;
};

/**
 * Checks that query function requirements are supported by their target runtimes.
 *
 * @param cat - The function catalog to validate.
 * @returns Diagnostics for unsupported query operations.
 */
export const checkQueryFunctionRuntimes = (cat: FunctionCatalog): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const q of cat.query) {
    for (const runtime of q.target_runtimes) {
      for (const req of q.body.requirements) {
        if (
          !runtime.supported_operations.includes(req.kind) &&
          !runtime.capabilities.includes(req.kind)
        ) {
          out.push(
            diagnostic({
              severity: "error",
              code: "function:unsupported-query-operation",
              message: `Query ${q.name} requires ${req.kind} unsupported by runtime ${runtime.name}`,
            }),
          );
        }
      }
    }
  }
  return out;
};

// --- Function builders -----------------------------------------------------

/**
 * Builds an {@link ExprFunction} record with inferred input/output types.
 *
 * @param input - Function definition including name, input type, return type, body expr, and optional properties.
 * @returns An ExprFunction.
 *
 * @example
 * ```ts
 * const double = defineExprFunction({
 *   name: "double",
 *   input_type: numberType,
 *   output_type: numberType,
 *   body: multiply(ref("input"), literal(2)),
 * });
 * ```
 */
export const defineExprFunction = <In = unknown, Out = unknown>(input: {
  name: string;
  input_type: SemanticType<In> | Entity;
  output_type: SemanticType<Out> | Entity;
  body: Expr;
  requirements?: readonly Requirement[];
  effects?: readonly Effect[];
  capabilities?: readonly Capability[];
  laws?: readonly Law[];
  target_runtimes?: readonly Runtime[];
}): ExprFunction<In, Out> => ({
  name: input.name,
  input_type: entityToSemanticType<In>(input.input_type),
  output_type: entityToSemanticType<Out>(input.output_type),
  body: input.body,
  requirements: input.requirements ?? [],
  effects: input.effects ?? [],
  capabilities: input.capabilities ?? [],
  laws: input.laws ?? [],
  target_runtimes: input.target_runtimes ?? [],
});

/**
 * Builds a {@link QueryFunction} record with inferred input/output types.
 *
 * @param input - Function definition including name, input type, return type, body query, and optional auth/errors.
 * @returns A QueryFunction.
 *
 * @example
 * ```ts
 * const listUsers = defineQueryFunction({
 *   name: "listUsers",
 *   input_type: voidType,
 *   returns: listOf(userEntity),
 *   body: queryAll(userEntity),
 * });
 * ```
 */
export const defineQueryFunction = <
  In = unknown,
  Out = unknown,
  Payload extends KeyPayload = KeyPayload,
>(input: {
  name: string;
  input_type: SemanticType<In> | Entity;
  input_fields?: readonly Field[];
  returns: SemanticType<Out> | Entity;
  body: QueryExpression;
  reactivity?:
    | QueryReactivity<In, Payload>
    | { readonly key: KeyFamily<Payload> | import("../reactivity/index.ts").ReactiveKey<Payload> };
  auth?: PolicyAction;
  errors?: readonly ErrorType[];
  requirements?: readonly Requirement[];
  target_runtimes?: readonly Runtime[];
}): QueryFunction<In, Out, Payload> => {
  const reactivity: QueryReactivity<In, Payload> | undefined =
    input.reactivity == null
      ? undefined
      : input.reactivity.key.kind === "key_expression"
        ? (input.reactivity as QueryReactivity<In, Payload>)
        : {
            key: keyExpr<In, Payload>(
              input.reactivity.key as KeyFamily<Payload>,
              "payload" in input.reactivity.key
                ? (input.reactivity.key as import("../reactivity/index.ts").ReactiveKey<Payload>)
                    .payload
                : undefined,
            ),
          };
  return {
    name: input.name,
    input_type: entityToSemanticType<In>(input.input_type),
    input_fields: input.input_fields ?? [],
    returns: entityToSemanticType<Out>(input.returns),
    body: input.body,
    reactivity,
    auth: input.auth,
    errors: input.errors ?? [],
    requirements: input.requirements ?? [],
    target_runtimes: input.target_runtimes ?? [],
  };
};

/**
 * Builds an {@link ActionFunction} record with inferred input/output types.
 *
 * @param input - Function definition including name, input type, return type, body action, and optional metadata.
 * @returns An ActionFunction.
 *
 * @example
 * ```ts
 * const createUser = defineActionFunction({
 *   name: "createUser",
 *   input_type: createUserDto,
 *   returns: userEntity,
 *   body: buildActionInsert(userEntity, [
 *     [userEntity.field("name"), ref("input.name")],
 *   ]),
 * });
 * ```
 */
export const defineActionFunction = <In = unknown, Out = unknown>(input: {
  name: string;
  input_type: SemanticType<In> | Entity;
  input_fields?: readonly Field[];
  returns: SemanticType<Out> | Entity;
  body: ActionExpr;
  auth?: PolicyAction;
  errors?: readonly ErrorType[];
  invalidates?: readonly QueryFunction[];
  reactivity?: ActionReactivity<In> | { readonly invalidates: readonly ReactiveKeyPattern[] };
  optimistic?: PatchFunction;
  consistency?: ActionFunction["consistency"];
  written_stores?: readonly Store[];
  effects?: readonly Effect[];
  requirements?: readonly Requirement[];
  target_runtimes?: readonly Runtime[];
}): ActionFunction<In, Out> => {
  const reactivity: ActionReactivity<In> | undefined =
    input.reactivity == null
      ? input.invalidates === undefined
        ? undefined
        : { invalidates: lowerLegacyInvalidations(input.invalidates) }
      : input.reactivity.invalidates.length > 0 &&
          input.reactivity.invalidates[0]!.kind === "key_pattern_expression"
        ? (input.reactivity as ActionReactivity<In>)
        : {
            invalidates: (input.reactivity.invalidates as ReactiveKeyPattern[]).map(
              (p): KeyPatternExpression<In> => keyPatternExpr<In>(p.family, [p]),
            ),
          };
  return {
    name: input.name,
    input_type: entityToSemanticType<In>(input.input_type),
    input_fields: input.input_fields ?? [],
    returns: entityToSemanticType<Out>(input.returns),
    body: input.body,
    auth: input.auth,
    errors: input.errors ?? [],
    invalidates: input.invalidates ?? [],
    reactivity,
    optimistic: input.optimistic,
    consistency: input.consistency ?? "transactional",
    written_stores: input.written_stores ?? [],
    effects: input.effects ?? [],
    requirements: input.requirements ?? [],
    target_runtimes: input.target_runtimes ?? [],
  };
};

/**
 * Builds a {@link PatchFunction} record with inferred input/output types.
 *
 * @param input - Function definition including name, input type, return type, body patch, and optional reconcile/rollback.
 * @returns A PatchFunction.
 *
 * @example
 * ```ts
 * const optimisticCreateUser = definePatchFunction({
 *   name: "optimisticCreateUser",
 *   input_type: createUserDto,
 *   returns: userEntity,
 *   body: buildPatchInsert(listUsersQuery, [
 *     [userEntity.field("name"), ref("input.name")],
 *   ]),
 *   reconcile_field: userEntity.field("id"),
 * });
 * ```
 */
export const definePatchFunction = <In = unknown, Out = unknown>(input: {
  name: string;
  input_type: SemanticType<In> | Entity;
  returns: SemanticType<Out> | Entity;
  body: PatchExpr;
  reconcile_field?: Field;
  rollback_strategy?: PatchFunction["rollback_strategy"];
}): PatchFunction<In, Out> => ({
  name: input.name,
  input_type: entityToSemanticType<In>(input.input_type),
  returns: entityToSemanticType<Out>(input.returns),
  body: input.body,
  reconcile_field: input.reconcile_field,
  rollback_strategy: input.rollback_strategy,
});

// --- Static, Predicate, and Plan function builders -------------------------

/**
 * Builds a {@link StaticFunction} record with inferred input/output types.
 *
 * @param input - Function definition including name, input type, output type, body, and optional metadata.
 * @returns A StaticFunction with specific SemanticType preservation.
 *
 * @example
 * ```ts
 * const hashPassword = defineStaticFunction({
 *   name: "hashPassword",
 *   input_type: stringType,
 *   output_type: stringType,
 *   body: { kind: "native", output_type: stringType, requirements: [], effects: [] },
 *   target_runtimes: [nodeRuntime],
 * });
 * ```
 */
export const defineStaticFunction = <In = unknown, Out = unknown>(input: {
  name: string;
  input_type: SemanticType<In> | Entity;
  input_fields?: readonly Field[];
  output_type: SemanticType<Out> | Entity;
  body: {
    kind: string;
    output_type: SemanticType<Out>;
    requirements: readonly Requirement[];
    effects: readonly Effect[];
  };
  requirements?: readonly Requirement[];
  effects?: readonly Effect[];
  capabilities?: readonly Capability[];
  laws?: readonly Law[];
  target_runtimes?: readonly Runtime[];
}): StaticFunction & { input_type: SemanticType<In>; output_type: SemanticType<Out> } => ({
  name: input.name,
  input_type: entityToSemanticType<In>(input.input_type),
  input_fields: input.input_fields ?? [],
  output_type: entityToSemanticType<Out>(input.output_type),
  body: input.body,
  requirements: input.requirements ?? [],
  effects: input.effects ?? [],
  capabilities: input.capabilities ?? [],
  laws: input.laws ?? [],
  target_runtimes: input.target_runtimes ?? [],
});

/**
 * Builds a {@link PredicateFunction} record with inferred input type.
 *
 * @param input - Function definition including name, input type, predicate body, and optional metadata.
 * @returns A PredicateFunction with specific SemanticType preservation.
 *
 * @example
 * ```ts
 * const isAdult = definePredicateFunction({
 *   name: "isAdult",
 *   input_type: userEntity,
 *   body: gte(ref("age"), literal(18)),
 * });
 * ```
 */
export const definePredicateFunction = <In = unknown>(input: {
  name: string;
  input_type: SemanticType<In> | Entity;
  body: Predicate;
  requirements?: readonly Requirement[];
  effects?: readonly Effect[];
  target_runtimes?: readonly Runtime[];
}): PredicateFunction & { input_type: SemanticType<In> } => ({
  name: input.name,
  input_type: entityToSemanticType<In>(input.input_type),
  body: input.body,
  requirements: input.requirements ?? [],
  effects: input.effects ?? [],
  target_runtimes: input.target_runtimes ?? [],
});

/**
 * Builds a {@link PlanFunction} record with inferred input/output types.
 *
 * @param input - Function definition including name, input type, output type, plan body, and fallback policy.
 * @returns A PlanFunction with specific SemanticType preservation.
 *
 * @example
 * ```ts
 * const optimizedSearch = definePlanFunction({
 *   name: "optimizedSearch",
 *   input_type: searchParams,
 *   output_type: searchResults,
 *   body: primaryPlanExpr,
 *   fallback_policy: { pure_only: true },
 * });
 * ```
 */
export const definePlanFunction = <In = unknown, Out = unknown>(input: {
  name: string;
  input_type: SemanticType<In> | Entity;
  output_type: SemanticType<Out> | Entity;
  body: PlanExpr;
  fallback_policy: FallbackPolicy;
}): PlanFunction & { input_type: SemanticType<In>; output_type: SemanticType<Out> } => ({
  name: input.name,
  input_type: entityToSemanticType<In>(input.input_type),
  output_type: entityToSemanticType<Out>(input.output_type),
  body: input.body,
  fallback_policy: input.fallback_policy,
});

// --- Action DSL constructors -----------------------------------------------

const normalizeValues = (values: Iterable<readonly [Field, Expr]>): ReadonlyMap<Field, Expr> =>
  values instanceof Map ? values : new Map(values);

/**
 * Builds an insert {@link ActionExpr}.
 *
 * @param target - The entity to insert into.
 * @param values - Field-to-expression mappings for the insert.
 * @param options - Optional effects and requirements.
 * @returns An ActionExpr representing an insert operation.
 *
 * @example
 * ```ts
 * const insertUser = buildActionInsert(userEntity, [
 *   [userEntity.field("name"), ref("input.name")],
 *   [userEntity.field("email"), ref("input.email")],
 * ]);
 * ```
 */
export const buildActionInsert = (
  target: Entity,
  values: Iterable<readonly [Field, Expr]>,
  options?: { effects?: readonly Effect[]; requirements?: readonly Requirement[] },
): ActionExpr => ({
  kind: { kind: "insert" },
  phase: "mutation",
  target_entity: target,
  operations: [
    {
      kind: "insert_op",
      target,
      values: normalizeValues(values),
    },
  ],
  effects: options?.effects ?? [],
  requirements: options?.requirements ?? [],
});

/**
 * Builds an update {@link ActionExpr}.
 *
 * @param target - The entity to update.
 * @param values - Field-to-expression mappings for the update.
 * @param condition - Optional predicate limiting which rows are updated.
 * @param options - Optional effects and requirements.
 * @returns An ActionExpr representing an update operation.
 *
 * @example
 * ```ts
 * const updateUser = buildActionUpdate(
 *   userEntity,
 *   [[userEntity.field("name"), ref("input.name")]],
 *   eq(ref("id"), ref("input.id")),
 * );
 * ```
 */
export const buildActionUpdate = (
  target: Entity,
  values: Iterable<readonly [Field, Expr]>,
  condition?: Predicate,
  options?: { effects?: readonly Effect[]; requirements?: readonly Requirement[] },
): ActionExpr => ({
  kind: { kind: "update" },
  phase: "mutation",
  target_entity: target,
  operations: [
    {
      kind: "update_op",
      target,
      values: normalizeValues(values),
      condition,
    },
  ],
  effects: options?.effects ?? [],
  requirements: options?.requirements ?? [],
});

/**
 * Builds a delete {@link ActionExpr}.
 *
 * @param target - The entity to delete from.
 * @param condition - Optional predicate limiting which rows are deleted.
 * @param options - Optional effects and requirements.
 * @returns An ActionExpr representing a delete operation.
 *
 * @example
 * ```ts
 * const deleteUser = buildActionDelete(userEntity, eq(ref("id"), ref("input.id")));
 * ```
 */
export const buildActionDelete = (
  target: Entity,
  condition?: Predicate,
  options?: { effects?: readonly Effect[]; requirements?: readonly Requirement[] },
): ActionExpr => ({
  kind: { kind: "delete" },
  phase: "mutation",
  target_entity: target,
  operations: [
    {
      kind: "delete_op",
      target,
      values: new Map(),
      condition,
    },
  ],
  effects: options?.effects ?? [],
  requirements: options?.requirements ?? [],
});

/**
 * Builds a sequence {@link ActionExpr} that composes multiple action expressions.
 *
 * @param target - The primary target entity for the sequence.
 * @param steps - The ActionExpr steps to run in order.
 * @param options - Optional effects and requirements.
 * @returns An ActionExpr representing a sequential composition.
 *
 * @example
 * ```ts
 * const transfer = buildActionSequence(accountEntity, [
 *   debitAction,
 *   creditAction,
 * ]);
 * ```
 */
export const buildActionSequence = (
  target: Entity,
  steps: readonly ActionExpr[],
  options?: { effects?: readonly Effect[]; requirements?: readonly Requirement[] },
): ActionExpr => ({
  kind: { kind: "sequence" },
  phase: "mutation",
  target_entity: target,
  operations: steps.flatMap((s) => [...s.operations]),
  effects: [...(options?.effects ?? []), ...steps.flatMap((s) => [...s.effects])],
  requirements: [...(options?.requirements ?? []), ...steps.flatMap((s) => [...s.requirements])],
});

// --- Patch DSL constructors ------------------------------------------------

/**
 * Builds an optimistic insert {@link PatchExpr}.
 *
 * @param target_query - The query whose results will be patched.
 * @param values - Field-to-expression mappings for the patch.
 * @param temp_id - Optional temporary id expression for reconciliation.
 * @param options - Optional reconcile_field, rollback_strategy, effects, requirements, and phase.
 * @returns A PatchExpr representing an optimistic insert.
 *
 * @example
 * ```ts
 * const optimisticAdd = buildPatchInsert(
 *   listTodosQuery,
 *   [[todoEntity.field("text"), ref("input.text")]],
 *   ref("input.tempId"),
 *   { reconcile_field: todoEntity.field("id") },
 * );
 * ```
 */
export const buildPatchInsert = (
  target_query: QueryExpression,
  values: Iterable<readonly [Field, Expr]>,
  temp_id?: Expr,
  options?: {
    reconcile_field?: Field;
    rollback_strategy?: "inverse" | "custom";
    phase?: "schema" | "query" | "mutation" | "client" | "server";
  },
): PatchExpr => ({
  kind: { kind: "optimistic_insert" },
  phase: options?.phase ?? "client",
  target_query,
  patch_items: [
    {
      kind: "patch_insert",
      values: normalizeValues(values),
      temp_id,
    },
  ],
  reconcile_field: options?.reconcile_field,
  rollback_strategy: options?.rollback_strategy ?? "inverse",
});

/**
 * Builds an optimistic update {@link PatchExpr}.
 *
 * @param target_query - The query whose results will be patched.
 * @param values - Field-to-expression mappings for the patch.
 * @param options - Optional reconcile_field, rollback_strategy, and phase.
 * @returns A PatchExpr representing an optimistic update.
 *
 * @example
 * ```ts
 * const optimisticToggle = buildPatchUpdate(
 *   listTodosQuery,
 *   [[todoEntity.field("completed"), literal(true)]],
 *   { reconcile_field: todoEntity.field("id") },
 * );
 * ```
 */
export const buildPatchUpdate = (
  target_query: QueryExpression,
  values: Iterable<readonly [Field, Expr]>,
  options?: {
    reconcile_field?: Field;
    rollback_strategy?: "inverse" | "custom";
    phase?: "schema" | "query" | "mutation" | "client" | "server";
  },
): PatchExpr => ({
  kind: { kind: "optimistic_update" },
  phase: options?.phase ?? "client",
  target_query,
  patch_items: [
    {
      kind: "patch_update",
      values: normalizeValues(values),
    },
  ],
  reconcile_field: options?.reconcile_field,
  rollback_strategy: options?.rollback_strategy ?? "inverse",
});

/**
 * Builds an optimistic delete {@link PatchExpr}.
 *
 * @param target_query - The query whose results will be patched.
 * @param options - Optional reconcile_field, rollback_strategy, and phase.
 * @returns A PatchExpr representing an optimistic delete.
 *
 * @example
 * ```ts
 * const optimisticRemove = buildPatchDelete(listTodosQuery, {
 *   reconcile_field: todoEntity.field("id"),
 * });
 * ```
 */
export const buildPatchDelete = (
  target_query: QueryExpression,
  options?: {
    reconcile_field?: Field;
    rollback_strategy?: "inverse" | "custom";
    phase?: "schema" | "query" | "mutation" | "client" | "server";
  },
): PatchExpr => ({
  kind: { kind: "optimistic_delete" },
  phase: options?.phase ?? "client",
  target_query,
  patch_items: [
    {
      kind: "patch_delete",
      values: new Map(),
    },
  ],
  reconcile_field: options?.reconcile_field,
  rollback_strategy: options?.rollback_strategy ?? "inverse",
});

// --- Error constructors ----------------------------------------------------

/**
 * Creates a conflict {@link ErrorType}.
 *
 * @param code - Error code string.
 * @param field_name - Optional field associated with the error.
 * @returns An ErrorType with `kind: "conflict"`.
 *
 * @example
 * ```ts
 * const err = errorConflict("email_already_exists", "email");
 * ```
 */
export const errorConflict = (code: string, field_name?: string): ErrorType => ({
  code,
  kind: "conflict",
  field_name,
});

/**
 * Creates a validation {@link ErrorType}.
 *
 * @param code - Error code string.
 * @param field_name - Optional field associated with the error.
 * @returns An ErrorType with `kind: "validation"`.
 *
 * @example
 * ```ts
 * const err = errorValidation("too_short", "password");
 * ```
 */
export const errorValidation = (code: string, field_name?: string): ErrorType => ({
  code,
  kind: "validation",
  field_name,
});

/**
 * Creates an auth {@link ErrorType}.
 *
 * @param code - Error code string.
 * @returns An ErrorType with `kind: "auth"`.
 *
 * @example
 * ```ts
 * const err = errorAuth("invalid_credentials");
 * ```
 */
export const errorAuth = (code: string): ErrorType => ({ code, kind: "auth" });

/**
 * Creates a not_found {@link ErrorType}.
 *
 * @param code - Error code string.
 * @returns An ErrorType with `kind: "not_found"`.
 *
 * @example
 * ```ts
 * const err = errorNotFound("user_not_found");
 * ```
 */
export const errorNotFound = (code: string): ErrorType => ({ code, kind: "not_found" });

/**
 * Creates a forbidden {@link ErrorType}.
 *
 * @param code - Error code string.
 * @returns An ErrorType with `kind: "forbidden"`.
 *
 * @example
 * ```ts
 * const err = errorForbidden("insufficient_permissions");
 * ```
 */
export const errorForbidden = (code: string): ErrorType => ({ code, kind: "forbidden" });

// --- Consistency constructors ----------------------------------------------

/**
 * Returns a transactional consistency marker.
 *
 * @returns The literal `"transactional"` consistency level.
 */
export const consistencyTransactional = (): "transactional" => "transactional";

/**
 * Returns an eventual consistency marker.
 *
 * @returns The literal `"eventual"` consistency level.
 */
export const consistencyEventual = (): "eventual" => "eventual";

/**
 * Returns a best_effort consistency marker.
 *
 * @returns The literal `"best_effort"` consistency level.
 */
export const consistencyBestEffort = (): "best_effort" => "best_effort";

// Suppress unused-locals on Operation export; keep import for downstream consumers.
/** Re-export of {@link Operation} from the types module for downstream consumers. */
export type { Operation };
