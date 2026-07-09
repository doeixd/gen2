/* @__NO_SIDE_EFFECTS__ */
/**
 * Track R §R2 — graph-native SQL translation for rule bodies.
 *
 * Walks a `KernelExpr` tree (resolved via `graph.exprs`) and produces
 * SQL text for the predicate. **Reads only the typed graph IR** — no
 * `Rule`/`Entity` JS-object input, no `_bridge*` lookups. Per PLAN.md
 * §0.5 #8, this replaces the JS-object-flavoured `ruleToSqlPredicate`
 * for graph-native passes (the `legalize.rule.toRlsPolicy` emit pass
 * is the first consumer).
 *
 * Today the translator covers the operators the slice fixture uses
 * (`eq`, `and`, `or`, `not`, `lt`/`lte`/`gt`/`gte`, plus literal /
 * var-ref / field-access). Track R §R5 (standard operation library)
 * adds the rest as the operator surface grows.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { KernelExpr, KernelGraph } from "../kernel/index.ts";

export interface GraphSqlResult {
  readonly translatable: boolean;
  readonly sql: string;
  readonly diagnostics: readonly Diagnostic[];
}

const formatLiteral = (value: unknown): string => {
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
};

/**
 * Extract a literal value carried by a `KernelExpr` of `op === "literal"`.
 *
 * `lowerRuleExpr` stamps the JS value into `metadata.custom.value`.
 */
const literalValue = (expr: KernelExpr): unknown => expr.metadata?.custom?.value;

/**
 * Resolve a `ref` expression — `lowerRuleExpr` shapes it as
 * `{ op: "ref", args: [{ name: "name" | "entity", value: <literal> }] }`.
 *
 * Returns `{ kind: "var" | "entity", name }`.
 */
const refTarget = (
  expr: KernelExpr,
): { readonly kind: "var" | "entity" | "unknown"; readonly name: string } => {
  const arg = expr.args[0];
  if (!arg) return { kind: "unknown", name: "" };
  const name = literalValue(arg.value);
  if (typeof name !== "string") return { kind: "unknown", name: "" };
  if (arg.name === "name") return { kind: "var", name };
  if (arg.name === "entity") return { kind: "entity", name };
  return { kind: "unknown", name };
};

const fieldAccessParts = (
  graph: KernelGraph,
  expr: KernelExpr,
): { readonly source: string; readonly field: string } | undefined => {
  const sourceArg = expr.args.find((a) => a.name === "source");
  const fieldArg = expr.args.find((a) => a.name === "field");
  if (!sourceArg || !fieldArg) return undefined;

  const sourceExpr =
    sourceArg.value.op === "ref" ? sourceArg.value : graph.exprs.get(sourceArg.value.id);
  if (!sourceExpr) return undefined;

  const ref = refTarget(sourceExpr);
  const fieldExpr =
    fieldArg.value.op === "literal" ? fieldArg.value : graph.exprs.get(fieldArg.value.id);
  if (!fieldExpr) return undefined;
  const fieldName = literalValue(fieldExpr);
  if (typeof fieldName !== "string") return undefined;

  return { source: ref.name, field: fieldName };
};

/**
 * Resolve a sub-expression argument: prefer the inline value, fall
 * back to `graph.exprs` when only the id is materialized.
 */
const resolveArg = (graph: KernelGraph, arg: KernelExpr): KernelExpr =>
  graph.exprs.get(arg.id) ?? arg;

const operationIdOf = (expr: KernelExpr): string | undefined => {
  // `OperationCallExpr` carries `.operation: OpSignature` directly
  // (kernel/expr.ts), so we don't need to walk EXPR_USES_OPERATION.
  const op = (expr as KernelExpr & { readonly operation?: { readonly id?: string } }).operation;
  return op?.id;
};

const renderBinary = (
  graph: KernelGraph,
  expr: KernelExpr,
  options: SqlOptions,
  operator: string,
): GraphSqlResult => {
  const left = expr.args[0]?.value;
  const right = expr.args[1]?.value;
  if (!left || !right) {
    return {
      translatable: false,
      sql: "",
      diagnostics: [
        diagnostic({
          severity: "error",
          code: "rules:sql-binary-arity",
          message: `Binary operator ${operator} expected 2 args, got ${expr.args.length}`,
        }),
      ],
    };
  }
  const lhs = renderExpr(graph, resolveArg(graph, left), options);
  const rhs = renderExpr(graph, resolveArg(graph, right), options);
  if (!lhs.translatable || !rhs.translatable) {
    return {
      translatable: false,
      sql: "",
      diagnostics: [...lhs.diagnostics, ...rhs.diagnostics],
    };
  }
  return {
    translatable: true,
    sql: `(${lhs.sql} ${operator} ${rhs.sql})`,
    diagnostics: [...lhs.diagnostics, ...rhs.diagnostics],
  };
};

const renderNary = (
  graph: KernelGraph,
  expr: KernelExpr,
  options: SqlOptions,
  joiner: string,
): GraphSqlResult => {
  const parts: string[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const arg of expr.args) {
    const r = renderExpr(graph, resolveArg(graph, arg.value), options);
    diagnostics.push(...r.diagnostics);
    if (!r.translatable) {
      return { translatable: false, sql: "", diagnostics };
    }
    parts.push(r.sql);
  }
  return {
    translatable: true,
    sql: `(${parts.join(` ${joiner} `)})`,
    diagnostics,
  };
};

interface SqlOptions {
  /**
   * Default table alias for entity-anchored field references. When
   * the rule body reads `Incident.status`, the resulting SQL is
   * `<tableAlias>.status`.
   */
  readonly tableAlias?: string;
}

/**
 * Recursive expression-tree → SQL renderer.
 */
const renderExpr = (graph: KernelGraph, expr: KernelExpr, options: SqlOptions): GraphSqlResult => {
  switch (expr.op) {
    case "literal":
      return { translatable: true, sql: formatLiteral(literalValue(expr)), diagnostics: [] };

    case "ref": {
      const ref = refTarget(expr);
      if (ref.kind === "var") {
        // SQL bind parameter form, matching the legacy translator.
        return { translatable: true, sql: `:${ref.name}`, diagnostics: [] };
      }
      if (ref.kind === "entity") {
        return { translatable: true, sql: options.tableAlias ?? ref.name, diagnostics: [] };
      }
      return {
        translatable: false,
        sql: "",
        diagnostics: [
          diagnostic({
            severity: "error",
            code: "rules:sql-unknown-ref",
            message: `Unknown ref shape in expr ${expr.id}`,
          }),
        ],
      };
    }

    case "get": {
      const parts = fieldAccessParts(graph, expr);
      if (!parts) {
        return {
          translatable: false,
          sql: "",
          diagnostics: [
            diagnostic({
              severity: "error",
              code: "rules:sql-bad-field-access",
              message: `Field access expr ${expr.id} missing source/field args`,
            }),
          ],
        };
      }
      const source = options.tableAlias ?? parts.source;
      return {
        translatable: true,
        sql: `${source}.${parts.field}`,
        diagnostics: [],
      };
    }

    case "call": {
      const opId = operationIdOf(expr);
      switch (opId) {
        case "op.eq":
          return renderBinary(graph, expr, options, "=");
        case "op.neq":
          return renderBinary(graph, expr, options, "<>");
        case "op.lt":
          return renderBinary(graph, expr, options, "<");
        case "op.lte":
          return renderBinary(graph, expr, options, "<=");
        case "op.gt":
          return renderBinary(graph, expr, options, ">");
        case "op.gte":
          return renderBinary(graph, expr, options, ">=");
        case "op.and":
          return renderNary(graph, expr, options, "AND");
        case "op.or":
          return renderNary(graph, expr, options, "OR");
        case "op.not": {
          const inner = expr.args[0]?.value;
          if (!inner) {
            return {
              translatable: false,
              sql: "",
              diagnostics: [
                diagnostic({
                  severity: "error",
                  code: "rules:sql-not-arity",
                  message: "NOT expected 1 arg",
                }),
              ],
            };
          }
          const r = renderExpr(graph, resolveArg(graph, inner), options);
          if (!r.translatable) return r;
          return {
            translatable: true,
            sql: `NOT (${r.sql})`,
            diagnostics: r.diagnostics,
          };
        }
        default:
          return {
            translatable: false,
            sql: "",
            diagnostics: [
              diagnostic({
                severity: "info",
                code: "rules:sql-operation-unsupported",
                message: `Operation ${opId ?? "<unknown>"} has no SQL lowering yet (Track R §R5).`,
              }),
            ],
          };
      }
    }

    default:
      return {
        translatable: false,
        sql: "",
        diagnostics: [
          diagnostic({
            severity: "info",
            code: "rules:sql-expr-unsupported",
            message: `Expression op "${expr.op}" has no SQL lowering yet`,
          }),
        ],
      };
  }
};

/**
 * Translate a `KernelExpr` to SQL by walking the typed graph IR.
 *
 * The `tableAlias` option is the table name (or alias) that
 * unprefixed entity-anchored field references resolve to. For RLS
 * policies this is typically `"row"`.
 */
export const kernelExprToSql = (
  graph: KernelGraph,
  exprId: string,
  options?: SqlOptions,
): GraphSqlResult => {
  const expr = graph.exprs.get(exprId);
  if (!expr) {
    return {
      translatable: false,
      sql: "",
      diagnostics: [
        diagnostic({
          severity: "error",
          code: "rules:sql-missing-expr",
          message: `Expression ${exprId} not found in graph.exprs`,
        }),
      ],
    };
  }
  return renderExpr(graph, expr, options ?? {});
};
