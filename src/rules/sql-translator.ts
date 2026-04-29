/* @__NO_SIDE_EFFECTS__ */
/**
 * SQL Predicate Translation for Rules.
 *
 * Translates RuleExpr AST nodes into SQL WHERE clauses with parameter bindings.
 * Produces diagnostics for unsupported constructs.
 *
 * See rules_implementation_guide.md §11, RUL-2.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";
import type { Relation } from "../relation/index.ts";
import type { Rule, RuleExpr } from "./rules.ts";

// --- Translation Result -----------------------------------------------------

export interface SqlTranslationResult {
  readonly sql: string;
  readonly parameters: readonly SqlParameter[];
  readonly diagnostics: readonly Diagnostic[];
  readonly translatable: boolean;
}

export interface SqlParameter {
  readonly name: string;
  readonly index: number;
  readonly value: unknown;
}

// --- Dialect Capabilities ---------------------------------------------------

export interface SqlDialectCapabilities {
  readonly supportsExists: boolean;
  readonly supportsNot: boolean;
  readonly supportsCrossTableJoin: boolean;
}

export const defaultSqlCapabilities: SqlDialectCapabilities = {
  supportsExists: true,
  supportsNot: true,
  supportsCrossTableJoin: true,
};

// --- Context ----------------------------------------------------------------

interface TranslateContext {
  readonly targetEntity: Entity;
  readonly capabilities: SqlDialectCapabilities;
  readonly tableAlias: string;
  parameters: SqlParameter[];
  diagnostics: Diagnostic[];
  paramIndex: number;
}

const makeContext = (
  targetEntity: Entity,
  capabilities: SqlDialectCapabilities = defaultSqlCapabilities,
  tableAlias?: string,
): TranslateContext => ({
  targetEntity,
  capabilities,
  tableAlias: tableAlias ?? snakeCase(targetEntity.store_name ?? targetEntity.name),
  parameters: [],
  diagnostics: [],
  paramIndex: 0,
});

// --- Helpers ----------------------------------------------------------------

const snakeCase = (s: string): string =>
  s
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/g, "");

const tableName = (entity: Entity): string => snakeCase(entity.store_name ?? entity.name);

const columnName = (field: Field): string => field.name;

const addParam = (ctx: TranslateContext, name: string, value: unknown): string => {
  ctx.paramIndex += 1;
  ctx.parameters.push({ name, index: ctx.paramIndex, value });
  return `:${name}`;
};

const addDiagnostic = (
  ctx: TranslateContext,
  code: string,
  message: string,
  severity: Diagnostic["severity"] = "error",
): void => {
  ctx.diagnostics.push(diagnostic({ severity, code, message }));
};

const escapeSqlString = (s: string): string => s.replace(/'/g, "''");

// --- Expression Translation -------------------------------------------------

const translateExpr = (ctx: TranslateContext, expr: RuleExpr): string | null => {
  switch (expr.kind) {
    case "rule.literal": {
      const val = expr.value;
      if (val === null) return "NULL";
      if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
      if (typeof val === "number") return String(val);
      if (typeof val === "string") return `'${escapeSqlString(val)}'`;
      if (typeof val === "bigint") return `${val}::bigint`;
      // For other types, bind as parameter with a synthetic name
      return addParam(ctx, `literal_${ctx.paramIndex + 1}`, val);
    }

    case "rule.var": {
      return addParam(ctx, expr.name, null);
    }

    case "rule.field": {
      const src = expr.source;
      const col = columnName(expr.field);
      if ("kind" in src && src.kind === "rule.var") {
        // Variable-qualified field — only safe if the variable is the target entity
        addDiagnostic(
          ctx,
          "rules:not-sql-translatable",
          `Variable-qualified field references are not yet translatable to SQL: ${src.name}.${col}`,
        );
        return null;
      }
      // Entity field reference
      return `${ctx.tableAlias}.${col}`;
    }

    case "rule.eq": {
      const left = translateExpr(ctx, expr.left);
      const right = translateExpr(ctx, expr.right);
      if (left == null || right == null) return null;
      return `(${left} = ${right})`;
    }

    case "rule.compare": {
      const left = translateExpr(ctx, expr.left);
      const right = translateExpr(ctx, expr.right);
      if (left == null || right == null) return null;
      const opMap = { lt: "<", lte: "<=", gt: ">", gte: ">=" } as const;
      return `(${left} ${opMap[expr.op]} ${right})`;
    }

    case "rule.and": {
      const parts = expr.terms
        .map((t) => translateExpr(ctx, t))
        .filter((s): s is string => s != null);
      if (parts.length === 0) return null;
      if (parts.length === 1) return parts[0]!;
      return `(${parts.join(" AND ")})`;
    }

    case "rule.or": {
      const parts = expr.terms
        .map((t) => translateExpr(ctx, t))
        .filter((s): s is string => s != null);
      if (parts.length === 0) return null;
      if (parts.length === 1) return parts[0]!;
      return `(${parts.join(" OR ")})`;
    }

    case "rule.not": {
      if (!ctx.capabilities.supportsNot) {
        addDiagnostic(
          ctx,
          "rules:not-sql-translatable",
          "SQL dialect does not support NOT in predicates",
        );
        return null;
      }
      const term = translateExpr(ctx, expr.term);
      if (term == null) return null;
      return `(NOT ${term})`;
    }

    case "rule.exists": {
      if (!ctx.capabilities.supportsExists) {
        addDiagnostic(
          ctx,
          "rules:not-sql-translatable",
          "SQL dialect does not support EXISTS subqueries",
        );
        return null;
      }
      const subquery = translateExists(ctx, expr.relation, expr.where);
      if (subquery == null) return null;
      return `EXISTS (${subquery})`;
    }

    default:
      addDiagnostic(
        ctx,
        "rules:not-sql-translatable",
        `Unsupported rule expression kind: ${(expr as { kind: string }).kind}`,
      );
      return null;
  }
};

const translateExists = (
  ctx: TranslateContext,
  relation: Relation,
  where: RuleExpr<boolean>,
): string | null => {
  const fromTbl = tableName(relation.from_entity);
  const fromCol = columnName(relation.from_field);
  const toCol = columnName(relation.to_field);

  const fromAlias = `${fromTbl}_0`;

  // Build correlation join between the outer query and the exists subquery
  const correlation = `${fromAlias}.${fromCol} = ${ctx.tableAlias}.${toCol}`;

  // Translate the where clause inside the exists, using the from_entity as the context
  const innerCtx: TranslateContext = {
    ...ctx,
    tableAlias: fromAlias,
  };
  const whereSql = translateExpr(innerCtx, where);

  if (whereSql == null) {
    addDiagnostic(
      ctx,
      "rules:not-sql-translatable",
      "Failed to translate EXISTS subquery WHERE clause",
    );
    return null;
  }

  return `SELECT 1 FROM ${fromTbl} AS ${fromAlias} WHERE ${correlation} AND ${whereSql}`;
};

// --- Public API -------------------------------------------------------------

/**
 * Translates a rule body into a SQL WHERE predicate.
 *
 * @param rule - The rule to translate.
 * @param targetEntity - The entity being filtered (determines table alias and field scoping).
 * @param capabilities - Optional dialect capabilities.
 * @param tableAlias - Optional explicit table alias. Defaults to snake_case(entity name).
 * @returns A SqlTranslationResult with SQL text, parameter bindings, and diagnostics.
 */
export const translateRuleToSql = (
  rule: Rule,
  targetEntity: Entity,
  capabilities?: SqlDialectCapabilities,
  tableAlias?: string,
): SqlTranslationResult => {
  const ctx = makeContext(targetEntity, capabilities, tableAlias);
  const sql = translateExpr(ctx, rule.body);

  const translatable = sql != null && ctx.diagnostics.every((d) => d.severity !== "error");

  return {
    sql: sql ?? "",
    parameters: ctx.parameters,
    diagnostics: ctx.diagnostics,
    translatable,
  };
};

/**
 * Translates a rule body into a SQL WHERE predicate using a bindings map for literals.
 * This variant substitutes known variable bindings as literal SQL values where safe,
 * leaving unbound variables as parameters.
 *
 * @param rule - The rule to translate.
 * @param targetEntity - The entity being filtered.
 * @param bindings - Variable name -> runtime value map.
 * @param capabilities - Optional dialect capabilities.
 * @param tableAlias - Optional explicit table alias.
 * @returns A SqlTranslationResult.
 */
const substituteBindings = <T = unknown>(
  expr: RuleExpr<T>,
  bindings: Record<string, unknown>,
): RuleExpr<T> => {
  switch (expr.kind) {
    case "rule.var": {
      const bound = bindings[expr.name];
      if (bound !== undefined) {
        return {
          kind: "rule.literal",
          value: bound,
          semanticType: expr.semanticType,
        } as RuleExpr<T>;
      }
      return expr;
    }
    case "rule.field": {
      const newSource =
        "kind" in expr.source && expr.source.kind === "rule.var"
          ? substituteBindings(expr.source, bindings)
          : expr.source;
      return { ...expr, source: newSource as typeof expr.source };
    }
    case "rule.eq":
      return {
        ...expr,
        left: substituteBindings(expr.left, bindings),
        right: substituteBindings(expr.right, bindings),
      };
    case "rule.compare":
      return {
        ...expr,
        left: substituteBindings(expr.left, bindings),
        right: substituteBindings(expr.right, bindings),
      };
    case "rule.and":
      return {
        ...expr,
        terms: expr.terms.map((t) => substituteBindings(t, bindings)),
      } as RuleExpr<T>;
    case "rule.or":
      return {
        ...expr,
        terms: expr.terms.map((t) => substituteBindings(t, bindings)),
      } as RuleExpr<T>;
    case "rule.not":
      return { ...expr, term: substituteBindings(expr.term, bindings) } as RuleExpr<T>;
    case "rule.exists":
      return { ...expr, where: substituteBindings(expr.where, bindings) } as RuleExpr<T>;
    default:
      return expr;
  }
};

export const translateRuleToSqlWithBindings = (
  rule: Rule,
  targetEntity: Entity,
  bindings: Record<string, unknown>,
  capabilities?: SqlDialectCapabilities,
  tableAlias?: string,
): SqlTranslationResult => {
  const substitutedBody = substituteBindings(rule.body, bindings);
  const ctx = makeContext(targetEntity, capabilities, tableAlias);
  const sql = translateExpr(ctx, substitutedBody);

  const translatable = sql != null && ctx.diagnostics.every((d) => d.severity !== "error");

  return {
    sql: sql ?? "",
    parameters: ctx.parameters,
    diagnostics: ctx.diagnostics,
    translatable,
  };
};
