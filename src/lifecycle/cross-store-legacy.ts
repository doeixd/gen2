/**
 * Cross-store legacy checks (Track E, PLAN.md §3).
 *
 * These checkers were extracted from `lifecycle.ts` so the lifecycle
 * runner stops owning domain-specific knowledge. Per PLAN.md Track E,
 * they will eventually move into the query / storage / dataflow
 * dialects (e.g. `dialects/query/passes/legalize-cross-store-read.ts`).
 *
 * Until those dialect passes land this file is the temporary home.
 * Treat new additions as a smell — port to dialect-owned passes.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Mutator } from "../api/index.ts";
import type { QueryExpression } from "../query/index.ts";
import type { Store } from "../storage/index.ts";
import type { FallbackPolicy, PlanExpr } from "../expression/index.ts";
import type { Field } from "../entity/index.ts";
import type { Runtime } from "../types/index.ts";

// --- Cross-store planner --------------------------------------------------

/** Strategy for composing cross-store queries or writes. */
export type CompositionStrategyKind =
  | "server_composition"
  | "materialized_view"
  | "streaming_join"
  | "event_sourced";

/** Cross-store composition configuration with optional coordinator and timeout. */
export interface CompositionStrategy {
  readonly kind: CompositionStrategyKind;
  readonly coordinator?: Runtime;
  readonly timeout?: string;
}

/** Assigns a subset of fields and a local query to a specific store and runtime. */
export interface StoreAssignment {
  readonly store: Store;
  readonly fields: readonly Field[];
  readonly local_query: QueryExpression;
  readonly runtime: Runtime;
}

/** A planner that decomposes a query across multiple stores with a composition strategy. */
export interface CrossStorePlanner {
  readonly name: string;
  readonly query: QueryExpression;
  readonly store_assignments: readonly StoreAssignment[];
  readonly composition_strategy: CompositionStrategy;
  readonly fallback_policy: FallbackPolicy;
}

// --- Cross-store rules ----------------------------------------------------

/**
 * Validates cross-store planners: more than one store, distinct stores,
 * and coverage of projected fields.
 */
export const checkCrossStorePlanners = (
  planners: readonly CrossStorePlanner[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const csp of planners) {
    if (csp.store_assignments.length <= 1) {
      out.push(
        diagnostic({
          severity: "error",
          code: "lifecycle:planner-too-few-stores",
          message: `CrossStorePlanner ${csp.name} requires more than one store assignment`,
        }),
      );
      continue;
    }
    // Distinct stores
    const seen = new Set<string>();
    for (const sa of csp.store_assignments) {
      if (seen.has(sa.store.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "lifecycle:planner-duplicate-store",
            message: `CrossStorePlanner ${csp.name} has duplicate assignment to store ${sa.store.name}`,
          }),
        );
      }
      seen.add(sa.store.name);
    }
    // Assignments cover projection fields when projection is set.
    if (csp.query.projection) {
      for (const pf of csp.query.projection.fields) {
        const found = csp.store_assignments.some((sa) => sa.fields.includes(pf.field));
        if (!found) {
          out.push(
            diagnostic({
              severity: "error",
              code: "lifecycle:planner-missing-field",
              message: `CrossStorePlanner ${csp.name} does not cover projected field ${pf.field.name}`,
            }),
          );
        }
      }
    }
  }
  return out;
};

/** Ensures every cross-store query has a corresponding planner. */
export const checkCrossStoreReadComposition = (
  queries: readonly QueryExpression[],
  planners: readonly CrossStorePlanner[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const q of queries) {
    if (q.target_stores.length <= 1) continue;
    const planned = planners.some((p) => p.query === q);
    if (!planned) {
      out.push(
        diagnostic({
          severity: "error",
          code: "lifecycle:cross-store-read-unplanned",
          message: "Cross-store query requires explicit composition plan",
        }),
      );
    }
  }
  return out;
};

/** Warns when a transactional mutator writes to multiple stores without a coordinator. */
export const checkCrossStoreWriteCoordinator = (
  mutators: readonly Mutator[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const m of mutators) {
    if (m.written_stores.length > 1 && m.consistency === "transactional") {
      out.push(
        diagnostic({
          severity: "error",
          code: "lifecycle:cross-store-write-no-coordinator",
          message: `Cross-store transactional write ${m.name} requires coordinator; use saga or eventual consistency`,
        }),
      );
    }
  }
  return out;
};

/** Validates plan fallback policies: warns when effectful operations silently fallback. */
export const checkPlanFallback = (plans: readonly PlanExpr[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const plan of plans) {
    if (!plan.fallback) continue;
    if (
      !plan.fallback_policy.effectful_ok &&
      (plan.primary.effects.length > 0 || plan.fallback.primary.effects.length > 0)
    ) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "runtime:silent-effectful-fallback",
          message: "Effectful operations should not silently fallback",
        }),
      );
    }
  }
  return out;
};
