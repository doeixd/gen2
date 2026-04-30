/* @__NO_SIDE_EFFECTS__ */
import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Entity } from "../entity/index.ts";
import type { Rule } from "./rules.ts";
import { ruleToSqlPredicate, type RuleSqlDialect } from "./sql.ts";

export interface RlsPolicyResult {
  readonly policyName: string;
  readonly sql: string;
  readonly predicate: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly translatable: boolean;
}

const quoteIdent = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

const tableName = (entity: Entity): string => entity.store_name ?? entity.name;

export const ruleToRlsPolicy = (
  rule: Rule,
  targetEntity: Entity,
  dialect?: RuleSqlDialect,
): RlsPolicyResult => {
  const predicate = ruleToSqlPredicate(rule, targetEntity, dialect, "row");
  const diagnostics: Diagnostic[] = [...predicate.diagnostics];

  if (!targetEntity.store_name) {
    diagnostics.push(
      diagnostic({
        severity: "error",
        code: "rules:not-rls-translatable",
        message: `Entity ${targetEntity.name} has no store_name; cannot generate RLS policy`,
      }),
    );
  }

  if (!predicate.translatable) {
    diagnostics.push(
      diagnostic({
        severity: "error",
        code: "rules:not-rls-translatable",
        message: `Rule ${rule.name} cannot be translated to an RLS predicate`,
      }),
    );
  }

  const policyName = `${rule.name}_policy`;
  const translatable = predicate.translatable && targetEntity.store_name != null;
  const sql = translatable
    ? `CREATE POLICY ${quoteIdent(policyName)} ON ${quoteIdent(tableName(targetEntity))} USING (${predicate.sql});`
    : "";

  return {
    policyName,
    sql,
    predicate: predicate.sql,
    diagnostics,
    translatable,
  };
};
