/* @__NO_SIDE_EFFECTS__ */
/**
 * Graph-native function checker — kernel-pass migration for functions.
 *
 * Behaviour: identical to the legacy `checkFunctions(cat)` and
 * `checkActionWrites(cat)`. The difference is in *how* it iterates
 * functions: through `graph.nodes` filtered by function node kinds,
 * then correlating back to the legacy catalog entries via function name.
 *
 * See `docs/revised-kernel.md`, `docs/revision/revised_phases.md` §R6,
 * and `docs/revision/funcs.txt`.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { KernelGraph } from "../kernel/index.ts";
import { nodeKinds } from "../kernel/index.ts";
import { PATCH_NODE_KIND, PLAN_NODE_KIND } from "../dialects/callable.ts";
import type { FunctionCatalog } from "./function.ts";

const FUNCTION_NODE_KINDS = [
  nodeKinds.STATIC,
  nodeKinds.EXPR_FUNCTION,
  nodeKinds.PREDICATE_FUNCTION,
  nodeKinds.QUERY,
  nodeKinds.ACTION,
  PATCH_NODE_KIND,
  PLAN_NODE_KIND,
] as const;

const kindToLabel = (kind: (typeof FUNCTION_NODE_KINDS)[number]): string => {
  switch (kind.id) {
    case nodeKinds.STATIC.id:
      return "static";
    case nodeKinds.EXPR_FUNCTION.id:
      return "expr";
    case nodeKinds.PREDICATE_FUNCTION.id:
      return "predicate";
    case nodeKinds.QUERY.id:
      return "query";
    case nodeKinds.ACTION.id:
      return "action";
    case PATCH_NODE_KIND.id:
      return "patch";
    case PLAN_NODE_KIND.id:
      return "plan";
    default:
      return "unknown";
  }
};

/**
 * Run the function-check pass over a kernel graph. Diagnostics are equivalent
 * to those produced by the legacy `checkFunctions(cat)`.
 */
export const checkFunctionsOnGraph = (
  graph: KernelGraph,
  cat: FunctionCatalog,
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // Index legacy catalog entries by name for correlation.
  const catalogByName = new Map<string, { kind: string; fn: { name: string } }>();
  for (const f of cat.static) catalogByName.set(f.name, { kind: "static", fn: f });
  for (const f of cat.expr) catalogByName.set(f.name, { kind: "expr", fn: f });
  for (const f of cat.predicate) catalogByName.set(f.name, { kind: "predicate", fn: f });
  for (const f of cat.query) catalogByName.set(f.name, { kind: "query", fn: f });
  for (const f of cat.action) catalogByName.set(f.name, { kind: "action", fn: f });
  for (const f of cat.patch) catalogByName.set(f.name, { kind: "patch", fn: f });
  for (const f of cat.plan) catalogByName.set(f.name, { kind: "plan", fn: f });

  // Collect graph-native function names per kind.
  const graphNamesByKind = new Map<string, Set<string>>();
  for (const kind of FUNCTION_NODE_KINDS) {
    graphNamesByKind.set(kindToLabel(kind), new Set());
  }
  for (const node of graph.nodes.values()) {
    for (const kind of FUNCTION_NODE_KINDS) {
      if (node.kind.id === kind.id && node.name) {
        graphNamesByKind.get(kindToLabel(kind))!.add(node.name);
      }
    }
  }

  // Determine which functions to check per kind. If any graph nodes exist for
  // a kind, restrict to those names; otherwise fall back to the full catalog.
  const filterKind = <T extends { name: string }>(
    kind: string,
    catalogItems: readonly T[],
  ): readonly T[] => {
    const names = graphNamesByKind.get(kind);
    if (names && names.size > 0) {
      return catalogItems.filter((f) => names.has(f.name));
    }
    return catalogItems;
  };

  const staticToCheck = filterKind("static", cat.static);
  const exprToCheck = filterKind("expr", cat.expr);
  const predicateToCheck = filterKind("predicate", cat.predicate);
  const queriesToCheck = filterKind("query", cat.query);
  const actionsToCheck = filterKind("action", cat.action);
  const patchToCheck = filterKind("patch", cat.patch);
  const planToCheck = filterKind("plan", cat.plan);

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
  collect("static", staticToCheck);
  collect("expr", exprToCheck);
  collect("predicate", predicateToCheck);
  collect("query", queriesToCheck);
  collect("action", actionsToCheck);
  collect("patch", patchToCheck);
  collect("plan", planToCheck);

  // FunctionBodyMatchesReturn (StaticFunction)
  for (const f of staticToCheck) {
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
  for (const a of actionsToCheck) {
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
  for (const p of patchToCheck) {
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
  for (const a of actionsToCheck) {
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
  for (const p of planToCheck) {
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

  for (const a of actionsToCheck) {
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

/** Pass definition for the function checker. */
export const functionCheckPass = {
  name: "function.check",
  phase: "check" as const,
  description:
    "Validates function nodes for name uniqueness, output matching, effects, and patch reconcilability.",
  reads: [
    "node:static",
    "node:exprFunction",
    "node:predicateFunction",
    "node:query",
    "node:action",
    "node:patch",
    "node:plan",
  ],
};

/**
 * Run the action-writes pass over a kernel graph. Diagnostics are equivalent
 * to those produced by the legacy `checkActionWrites(cat)`.
 */
export const checkActionWritesOnGraph = (
  graph: KernelGraph,
  cat: FunctionCatalog,
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // Walk ACTION nodes in the graph.
  const graphActionNames = new Set<string>();
  for (const node of graph.nodes.values()) {
    if (node.kind.id === nodeKinds.ACTION.id && node.name) {
      graphActionNames.add(node.name);
    }
  }

  const actionsToCheck =
    graphActionNames.size > 0 ? cat.action.filter((a) => graphActionNames.has(a.name)) : cat.action;

  for (const a of actionsToCheck) {
    for (const op of a.body.operations) {
      if (op.kind === "invalidate_op") continue;
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

/** Pass definition for the action-writes checker. */
export const actionWritesCheckPass = {
  name: "action.writes.check",
  phase: "check" as const,
  description: "Validates that action functions do not write to read-only fields.",
  reads: ["node:action"],
};
