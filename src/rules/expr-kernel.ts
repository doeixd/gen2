/* @__NO_SIDE_EFFECTS__ */
/**
 * RuleExpr → KernelExpr lowering with edge derivation.
 *
 * Converts the legacy `RuleExpr` AST into operation-aware `KernelExpr` IR and
 * derives expression edges (`EXPR_USES_OPERATION`, `EXPRESSION_READS_FIELD`) that
 * expose the dependency surface to graph-native passes.
 *
 * See `docs/revision/rules.md.txt` §1, §2 and `docs/revision/revised_phases.md` §R4.
 */

import type { KernelExpr } from "../kernel/expr.ts";
import type { KernelType } from "../kernel/type.ts";
import type { SemanticType } from "../types/semantic.ts";
import type { RuleExpr } from "./rules.ts";
import type { KernelEdge } from "../kernel/edge.ts";
import {
  defineExpr,
  opCall,
  OPERATIONS,
  kernelTypes,
  edgeKinds,
  endpointRoles,
  kernelId,
  type EdgeKind,
  type EndpointRole,
} from "../kernel/index.ts";
import { defineEdge } from "../kernel/edge.ts";
import { EXPRESSION_READS_FIELD_EDGE_KIND } from "../dialects/core/expr-rule.ts";

const edgeKindFromDef = (def: {
  readonly id: string;
  readonly metadata?: { readonly title?: unknown };
}): EdgeKind => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

const endpointRoleFromDef = (def: {
  readonly id: string;
  readonly name: string;
}): EndpointRole => ({
  id: def.id,
  label: def.name,
});

const expressionReadsFieldKind = edgeKindFromDef(EXPRESSION_READS_FIELD_EDGE_KIND);
const expressionReadsFieldExprRole = endpointRoleFromDef(
  EXPRESSION_READS_FIELD_EDGE_KIND.endpoints[0]!,
);
const expressionReadsFieldFieldRole = endpointRoleFromDef(
  EXPRESSION_READS_FIELD_EDGE_KIND.endpoints[1]!,
);

// ---------------------------------------------------------------------------
// SemanticType → KernelType (best-effort bridge mapping)
// ---------------------------------------------------------------------------

const semanticToKernelType = (st: SemanticType): KernelType => {
  switch (st.kind) {
    case "boolean":
      return kernelTypes.boolean;
    case "string":
    case "email":
    case "url":
    case "phone":
      return kernelTypes.string;
    case "numeric":
    case "money":
      return kernelTypes.number;
    case "uuid":
      return kernelTypes.uuid;
    case "datetime":
    case "date":
    case "timestamp":
    case "duration":
      return kernelTypes.datetime;
    default:
      return kernelTypes.unknown;
  }
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * `lowerRuleExpr` previously used a module-level mutable counter to
 * generate child expression IDs. That made lowering non-deterministic
 * across calls — two rules with identical bodies got different IDs
 * depending on how many other rules had been lowered in the same
 * process. Quick Win #7 / PLAN.md §0.5 #7 require deterministic IDs
 * for graph diff, snapshot replay, and facade-equivalence.
 *
 * The counter is now *local to each top-level `lowerRuleExpr` call*
 * via a `LoweringContext`. Two calls with the same `RuleExpr` and
 * `idPrefix` always produce the same IDs.
 */
interface LoweringContext {
  counter: number;
}
const newLoweringContext = (): LoweringContext => ({ counter: 0 });

const nextId = (ctx: LoweringContext, prefix: string): string => {
  ctx.counter++;
  return `${prefix}:${ctx.counter}`;
};

const withRuleExprKind = (expr: KernelExpr, kind: RuleExpr["kind"]): KernelExpr => ({
  ...expr,
  metadata: {
    ...expr.metadata,
    custom: {
      ...expr.metadata?.custom,
      rule_expr_kind: kind,
    },
  },
});

/**
 * @deprecated The expression-id counter is no longer module-global, so
 * resetting has no effect. Kept exported for backwards compatibility
 * during the rebase; will be removed once no callers reference it.
 */
export const resetExprCounter = (): void => {
  // Intentionally a no-op. See note above `LoweringContext`.
};

// ---------------------------------------------------------------------------
// Edge builders
// ---------------------------------------------------------------------------

const exprUsesOperationEdge = (exprId: string, opId: string): KernelEdge =>
  defineEdge(
    edgeKinds.EXPR_USES_OPERATION,
    `edge:exprUsesOperation:${exprId}->${opId}`,
    [
      {
        role: endpointRoles.SOURCE,
        target: { kind: "expr", id: kernelId<"expr">(exprId) },
        cardinality: "one",
      },
      {
        role: endpointRoles.TARGET,
        target: { kind: "node", id: kernelId<"node">(opId) },
        cardinality: "one",
      },
    ],
    { metadata: { title: `Expr uses operation ${opId}` } },
  );

const exprReadsFieldEdge = (
  exprId: string,
  fieldRef: { id?: string; name?: string; owner?: { readonly name?: string } },
): KernelEdge => {
  const fieldNodeId = `node:field:${fieldRef.id ?? `${fieldRef.owner?.name ?? ""}.${fieldRef.name ?? ""}`}`;
  return defineEdge(
    expressionReadsFieldKind,
    `edge:exprReadsField:${exprId}->${fieldNodeId}`,
    [
      {
        role: expressionReadsFieldExprRole,
        target: { kind: "expr", id: kernelId<"expr">(exprId) },
        cardinality: "one",
      },
      {
        role: expressionReadsFieldFieldRole,
        target: { kind: "node", id: kernelId<"node">(fieldNodeId) },
        cardinality: "one",
      },
    ],
    { metadata: { title: `Expr reads field ${fieldNodeId}` } },
  );
};

// ---------------------------------------------------------------------------
// Lowering result
// ---------------------------------------------------------------------------

export interface LoweredRuleExpr {
  readonly expr: KernelExpr;
  readonly edges: readonly KernelEdge[];
}

// ---------------------------------------------------------------------------
// Lowering
// ---------------------------------------------------------------------------

/**
 * Recursively lower a `RuleExpr` into a `KernelExpr` tree and derive edges.
 *
 * @param expr - The rule expression to lower.
 * @param idPrefix - Prefix for generated expression ids, e.g. `expr:rule:isSelf`.
 * @returns A `LoweredRuleExpr` containing the root expression and all derived edges.
 */
export const lowerRuleExpr = (expr: RuleExpr, idPrefix: string): LoweredRuleExpr =>
  lowerRuleExprWithCtx(expr, idPrefix, newLoweringContext());

const lowerRuleExprWithCtx = (
  expr: RuleExpr,
  idPrefix: string,
  ctx: LoweringContext,
): LoweredRuleExpr => {
  const edges: KernelEdge[] = [];

  const recurse = (e: RuleExpr): KernelExpr => {
    const lowered = lowerRuleExprWithCtx(e, idPrefix, ctx);
    edges.push(...lowered.edges);
    return lowered.expr;
  };

  switch (expr.kind) {
    case "rule.literal": {
      const type = semanticToKernelType(expr.semanticType);
      const id = nextId(ctx, idPrefix);
      return {
        expr: defineExpr("literal", type, {
          id,
          metadata: { custom: { value: expr.value, rule_expr_kind: expr.kind } },
        }),
        edges,
      };
    }

    case "rule.var": {
      const type = semanticToKernelType(expr.semanticType);
      const id = nextId(ctx, idPrefix);
      return {
        expr: defineExpr("ref", type, {
          id,
          metadata: { custom: { rule_expr_kind: expr.kind } },
          args: [
            {
              name: "name",
              value: defineExpr("literal", kernelTypes.string, {
                id: nextId(ctx, idPrefix),
                metadata: { custom: { value: expr.name } },
              }),
            },
          ],
        }),
        edges,
      };
    }

    case "rule.field": {
      const type = semanticToKernelType(expr.semanticType);
      const fieldName = expr.field.name;
      const id = nextId(ctx, idPrefix);

      // Emit EXPRESSION_READS_FIELD for every field access.
      edges.push(exprReadsFieldEdge(id, expr.field.ref));

      const sourceExpr: KernelExpr =
        "kind" in expr.source && expr.source.kind === "rule.var"
          ? recurse(expr.source)
          : defineExpr("ref", kernelTypes.unknown, {
              id: nextId(ctx, idPrefix),
              args: [
                {
                  name: "entity",
                  value: defineExpr("literal", kernelTypes.string, {
                    id: nextId(ctx, idPrefix),
                    metadata: { custom: { value: (expr.source as { name: string }).name } },
                  }),
                },
              ],
            });
      return {
        expr: defineExpr("get", type, {
          id,
          metadata: { custom: { rule_expr_kind: expr.kind } },
          args: [
            { name: "source", value: sourceExpr },
            {
              name: "field",
              value: defineExpr("literal", kernelTypes.string, {
                id: nextId(ctx, idPrefix),
                metadata: { custom: { value: fieldName } },
              }),
            },
          ],
        }),
        edges,
      };
    }

    case "rule.eq": {
      const id = nextId(ctx, idPrefix);
      const left = recurse(expr.left);
      const right = recurse(expr.right);
      edges.push(exprUsesOperationEdge(id, OPERATIONS.EQ.id));
      return {
        expr: withRuleExprKind(opCall(OPERATIONS.EQ, [left, right], id), expr.kind),
        edges,
      };
    }

    case "rule.compare": {
      const id = nextId(ctx, idPrefix);
      const op =
        expr.op === "lt"
          ? OPERATIONS.LT
          : expr.op === "lte"
            ? OPERATIONS.LTE
            : expr.op === "gt"
              ? OPERATIONS.GT
              : OPERATIONS.GTE;
      const left = recurse(expr.left);
      const right = recurse(expr.right);
      edges.push(exprUsesOperationEdge(id, op.id));
      return {
        expr: withRuleExprKind(opCall(op, [left, right], id), expr.kind),
        edges,
      };
    }

    case "rule.and": {
      if (expr.terms.length === 0) {
        const id = nextId(ctx, idPrefix);
        return {
          expr: defineExpr("literal", kernelTypes.boolean, {
            id,
            metadata: { custom: { value: true } },
          }),
          edges,
        };
      }
      if (expr.terms.length === 1) {
        const single = lowerRuleExprWithCtx(expr.terms[0]!, idPrefix, ctx);
        return { expr: withRuleExprKind(single.expr, expr.kind), edges: single.edges };
      }
      let acc = lowerRuleExprWithCtx(expr.terms[0]!, idPrefix, ctx);
      edges.push(...acc.edges);
      for (let i = 1; i < expr.terms.length; i++) {
        const id = nextId(ctx, idPrefix);
        const nextTerm = lowerRuleExprWithCtx(expr.terms[i]!, idPrefix, ctx);
        edges.push(...nextTerm.edges);
        edges.push(exprUsesOperationEdge(id, OPERATIONS.AND.id));
        acc = {
          expr: withRuleExprKind(opCall(OPERATIONS.AND, [acc.expr, nextTerm.expr], id), expr.kind),
          edges,
        };
      }
      return acc;
    }

    case "rule.or": {
      if (expr.terms.length === 0) {
        const id = nextId(ctx, idPrefix);
        return {
          expr: defineExpr("literal", kernelTypes.boolean, {
            id,
            metadata: { custom: { value: false } },
          }),
          edges,
        };
      }
      if (expr.terms.length === 1) {
        const single = lowerRuleExprWithCtx(expr.terms[0]!, idPrefix, ctx);
        return { expr: withRuleExprKind(single.expr, expr.kind), edges: single.edges };
      }
      let acc = lowerRuleExprWithCtx(expr.terms[0]!, idPrefix, ctx);
      edges.push(...acc.edges);
      for (let i = 1; i < expr.terms.length; i++) {
        const id = nextId(ctx, idPrefix);
        const nextTerm = lowerRuleExprWithCtx(expr.terms[i]!, idPrefix, ctx);
        edges.push(...nextTerm.edges);
        edges.push(exprUsesOperationEdge(id, OPERATIONS.OR.id));
        acc = {
          expr: withRuleExprKind(opCall(OPERATIONS.OR, [acc.expr, nextTerm.expr], id), expr.kind),
          edges,
        };
      }
      return acc;
    }

    case "rule.not": {
      const id = nextId(ctx, idPrefix);
      const term = recurse(expr.term);
      edges.push(exprUsesOperationEdge(id, OPERATIONS.NOT.id));
      return {
        expr: withRuleExprKind(opCall(OPERATIONS.NOT, [term], id), expr.kind),
        edges,
      };
    }

    case "rule.exists": {
      const id = nextId(ctx, idPrefix);
      const where = recurse(expr.where);
      edges.push(exprUsesOperationEdge(id, OPERATIONS.EXISTS.id));
      return {
        expr: withRuleExprKind(
          opCall(
            OPERATIONS.EXISTS,
            [
              defineExpr("literal", kernelTypes.unknown, {
                id: nextId(ctx, idPrefix),
                metadata: { custom: { value: expr.relation.name } },
              }),
              where,
            ],
            id,
          ),
          expr.kind,
        ),
        edges,
      };
    }
  }
};
