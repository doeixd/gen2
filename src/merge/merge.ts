/* @__NO_SIDE_EFFECTS__ */
/**
 * Typed merge strategies and conflict metadata for semantic types.
 *
 * Merge behavior is inspectable metadata attached to semantic types and
 * optionally overridden by fields. It tells the compiler how values combine,
 * conflict, fold, or reconcile.
 */

import type { SemanticType } from "../types/index.ts";

export type MergeOperationKind =
  | "replace"
  | "last_write_wins"
  | "first_write_wins"
  | "max"
  | "min"
  | "sum_delta"
  | "append"
  | "prepend"
  | "set_union"
  | "set_intersection"
  | "add_remove_set"
  | "field_wise"
  | "by_id_collection"
  | "state_machine"
  | "manual_conflict"
  | "reject_conflict"
  | "custom_expr"
  | "opaque_runtime";

export type ConflictBehavior = "never" | "may_conflict" | "always_conflict";

export interface MergeStrategy<
  Ts = unknown,
  Delta = unknown,
  Op extends MergeOperationKind = MergeOperationKind,
  Conflict extends ConflictBehavior = ConflictBehavior,
> {
  readonly kind: "merge_strategy";
  readonly name: string;
  readonly operation: Op;
  readonly value_type?: SemanticType<Ts>;
  readonly delta_type?: SemanticType<Delta>;
  readonly conflict: Conflict;
  readonly associative?: boolean;
  readonly commutative?: boolean;
  readonly idempotent?: boolean;
  readonly invertible?: boolean;
  readonly monotonic?: boolean;
  readonly _ts?: Ts;
  readonly _delta?: Delta;
  readonly _op?: Op;
  readonly _conflict?: Conflict;
}

export const defineMergeStrategy = <
  Ts,
  Delta,
  Op extends MergeOperationKind,
  Conflict extends ConflictBehavior,
>(input: {
  readonly name: string;
  readonly operation: Op;
  readonly value_type?: SemanticType<Ts>;
  readonly delta_type?: SemanticType<Delta>;
  readonly conflict: Conflict;
  readonly associative?: boolean;
  readonly commutative?: boolean;
  readonly idempotent?: boolean;
  readonly invertible?: boolean;
  readonly monotonic?: boolean;
}): MergeStrategy<Ts, Delta, Op, Conflict> => ({
  kind: "merge_strategy",
  name: input.name,
  operation: input.operation,
  value_type: input.value_type,
  delta_type: input.delta_type,
  conflict: input.conflict,
  associative: input.associative,
  commutative: input.commutative,
  idempotent: input.idempotent,
  invertible: input.invertible,
  monotonic: input.monotonic,
});

export const mergeReplace = (): MergeStrategy<unknown, unknown, "replace", "never"> =>
  defineMergeStrategy({ name: "replace", operation: "replace", conflict: "never" });

export const mergeLastWriteWins = (): MergeStrategy<
  unknown,
  unknown,
  "last_write_wins",
  "may_conflict"
> =>
  defineMergeStrategy({
    name: "last_write_wins",
    operation: "last_write_wins",
    conflict: "may_conflict",
  });

export const mergeFirstWriteWins = (): MergeStrategy<
  unknown,
  unknown,
  "first_write_wins",
  "may_conflict"
> =>
  defineMergeStrategy({
    name: "first_write_wins",
    operation: "first_write_wins",
    conflict: "may_conflict",
  });

export const mergeMax = <T>(): MergeStrategy<T, T, "max", "never"> =>
  defineMergeStrategy({ name: "max", operation: "max", conflict: "never", monotonic: true });

export const mergeMin = <T>(): MergeStrategy<T, T, "min", "never"> =>
  defineMergeStrategy({ name: "min", operation: "min", conflict: "never", monotonic: true });

export const mergeSumDelta = <T>(): MergeStrategy<T, T, "sum_delta", "never"> =>
  defineMergeStrategy({
    name: "sum_delta",
    operation: "sum_delta",
    conflict: "never",
    associative: true,
    commutative: true,
  });

export const mergeAppend = <T>(): MergeStrategy<T, T, "append", "never"> =>
  defineMergeStrategy({ name: "append", operation: "append", conflict: "never" });

export const mergePrepend = <T>(): MergeStrategy<T, T, "prepend", "never"> =>
  defineMergeStrategy({ name: "prepend", operation: "prepend", conflict: "never" });

export const mergeSetUnion = <T>(): MergeStrategy<T, T, "set_union", "never"> =>
  defineMergeStrategy({
    name: "set_union",
    operation: "set_union",
    conflict: "never",
    associative: true,
    commutative: true,
    idempotent: true,
  });

export const mergeSetIntersection = <T>(): MergeStrategy<T, T, "set_intersection", "never"> =>
  defineMergeStrategy({
    name: "set_intersection",
    operation: "set_intersection",
    conflict: "never",
    associative: true,
    commutative: true,
    idempotent: true,
  });

export const mergeAddRemoveSet = <T>(): MergeStrategy<T, T, "add_remove_set", "may_conflict"> =>
  defineMergeStrategy({
    name: "add_remove_set",
    operation: "add_remove_set",
    conflict: "may_conflict",
    associative: true,
    commutative: true,
  });

export const mergeByIdCollection = <T>(): MergeStrategy<T, T, "by_id_collection", "may_conflict"> =>
  defineMergeStrategy({
    name: "by_id_collection",
    operation: "by_id_collection",
    conflict: "may_conflict",
  });

export const mergeFieldWise = <T>(): MergeStrategy<T, T, "field_wise", "may_conflict"> =>
  defineMergeStrategy({ name: "field_wise", operation: "field_wise", conflict: "may_conflict" });

export const mergeStateMachine = <T>(): MergeStrategy<T, T, "state_machine", "may_conflict"> =>
  defineMergeStrategy({
    name: "state_machine",
    operation: "state_machine",
    conflict: "may_conflict",
  });

export const mergeManualConflict = <T>(): MergeStrategy<
  T,
  T,
  "manual_conflict",
  "always_conflict"
> =>
  defineMergeStrategy({
    name: "manual_conflict",
    operation: "manual_conflict",
    conflict: "always_conflict",
  });

export const mergeRejectConflict = <T>(): MergeStrategy<
  T,
  T,
  "reject_conflict",
  "always_conflict"
> =>
  defineMergeStrategy({
    name: "reject_conflict",
    operation: "reject_conflict",
    conflict: "always_conflict",
  });

export const mergeCustomExpr = <T>(): MergeStrategy<T, T, "custom_expr", "may_conflict"> =>
  defineMergeStrategy({ name: "custom_expr", operation: "custom_expr", conflict: "may_conflict" });

export const mergeOpaqueRuntime = <T>(): MergeStrategy<T, T, "opaque_runtime", "may_conflict"> =>
  defineMergeStrategy({
    name: "opaque_runtime",
    operation: "opaque_runtime",
    conflict: "may_conflict",
  });

// --- Merge-aware planning helpers ------------------------------------------

import type { Entity } from "../entity/index.ts";
import type { ActionFunction } from "../function/index.ts";
import type { Effect } from "../types/index.ts";
import { diagnostic, type Diagnostic, type GenContext } from "../core/index.ts";

export interface EntityMergePlan {
  readonly kind: "entity_merge_plan";
  readonly entity_name: string;
  readonly field_plans: readonly FieldMergePlan[];
  readonly conflict_mode: ConflictBehavior;
  readonly diagnostics: readonly Diagnostic[];
}

export interface FieldMergePlan {
  readonly field_name: string;
  readonly strategy?: MergeStrategy;
  readonly diagnostic?: Diagnostic;
}

export const deriveEntityMergePlan = (entity: Entity): EntityMergePlan => {
  const fieldPlans: FieldMergePlan[] = [];
  const diagnostics: Diagnostic[] = [];
  let hasConflict = false;
  let hasAlwaysConflict = false;
  let hasStrategy = false;

  for (const field of entity.fieldList) {
    const strategy = field.semantic_type.merge_strategy;
    if (strategy) {
      hasStrategy = true;
      if (strategy.conflict === "always_conflict") {
        hasAlwaysConflict = true;
      } else if (strategy.conflict === "may_conflict") {
        hasConflict = true;
      }
      if (
        strategy.delta_type &&
        strategy.value_type &&
        strategy.delta_type.name !== strategy.value_type.name
      ) {
        diagnostics.push(
          diagnostic({
            severity: "warning",
            code: "merge:delta-type-mismatch",
            message: `Field "${field.name}" delta type "${strategy.delta_type.name}" does not match value type "${strategy.value_type.name}"`,
            suggestion:
              "Align delta type with value type or ensure the merge function handles the conversion.",
          }),
        );
      }
    } else {
      diagnostics.push(
        diagnostic({
          severity: "info",
          code: "merge:field-merge-missing",
          message: `Field "${field.name}" has no merge strategy`,
          suggestion:
            "Add a merge strategy to the field's semantic type for deterministic conflict resolution.",
        }),
      );
    }
    fieldPlans.push({
      field_name: field.name,
      strategy,
    });
  }

  if (!hasStrategy) {
    diagnostics.push(
      diagnostic({
        severity: "warning",
        code: "merge:strategy-missing",
        message: `Entity "${entity.name}" has no merge strategies on any field`,
        suggestion: "Add merge strategies to fields or define an entity-level merge policy.",
      }),
    );
  }

  const conflict_mode: ConflictBehavior = hasAlwaysConflict
    ? "always_conflict"
    : hasConflict
      ? "may_conflict"
      : "never";

  if (conflict_mode === "may_conflict") {
    diagnostics.push(
      diagnostic({
        severity: "info",
        code: "merge:conflict-policy-missing",
        message: `Entity "${entity.name}" has fields that may conflict but no explicit conflict policy`,
        suggestion:
          "Add a conflict policy (e.g., last-write-wins, manual resolution) to the entity.",
      }),
    );
  }

  return {
    kind: "entity_merge_plan",
    entity_name: entity.name,
    field_plans: fieldPlans,
    conflict_mode,
    diagnostics,
  };
};

export const checkActionMergeSemantics = (action: ActionFunction): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const operation of action.body.operations) {
    if (operation.kind === "invalidate_op") continue;
    for (const field of operation.values.keys()) {
      const strategy = field.semantic_type.merge_strategy;
      if (strategy?.operation === "reject_conflict") {
        diagnostics.push(
          diagnostic({
            severity: "error",
            code: "merge:reject-conflict-write",
            message: `Action "${action.name}" writes to field "${field.name}" whose merge strategy rejects conflict`,
            suggestion: "Use a merge-friendly strategy or handle conflict explicitly.",
          }),
        );
      }
      if (strategy?.operation === "manual_conflict") {
        diagnostics.push(
          diagnostic({
            severity: "warning",
            code: "merge:manual-conflict-write",
            message: `Action "${action.name}" writes to field "${field.name}" with manual-conflict merge strategy`,
            suggestion: "Ensure the action includes explicit conflict handling.",
          }),
        );
      }
      if (strategy && !strategy.idempotent) {
        diagnostics.push(
          diagnostic({
            severity: "warning",
            code: "merge:non-idempotent-retried-effect",
            message: `Action "${action.name}" writes to field "${field.name}" with non-idempotent merge strategy`,
            suggestion: "Use an idempotent merge strategy if the action may be retried.",
          }),
        );
      }
    }
  }

  return diagnostics;
};

export const checkPlanMergeSemantics = (ctx: GenContext): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const plan of ctx.composable_plans) {
    if (plan.kind === "retry_plan" && plan.max_attempts > 1) {
      diagnostics.push(
        diagnostic({
          severity: "info",
          code: "merge:law-required-for-retry",
          message: `Retry plan has ${plan.max_attempts} attempts; ensure target effects are idempotent`,
          suggestion: "Use idempotent merge strategies or add deduplication logic.",
        }),
      );
    }

    if (plan.kind === "parallel_plan") {
      const hasDbWrite = plan.branches.some(
        (b: { effects?: readonly Effect[] }) =>
          "effects" in b && b.effects?.some((e: Effect) => e.kind === "db_write"),
      );
      if (hasDbWrite) {
        diagnostics.push(
          diagnostic({
            severity: "warning",
            code: "merge:non-commutative-parallel-merge",
            message: `Parallel plan has branches with database writes; merge may not be commutative`,
            suggestion: "Use commutative merge strategies or sequence the writes.",
          }),
        );
      }
    }
  }

  return diagnostics;
};
