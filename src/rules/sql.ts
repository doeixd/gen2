/* @__NO_SIDE_EFFECTS__ */
import type { Entity } from "../entity/index.ts";
import type { StoreDialect } from "../storage/index.ts";
import { sqlCapabilitiesForDialect } from "../db/index.ts";
import type { Rule } from "./rules.ts";
import {
  type SqlDialectCapabilities,
  type SqlTranslationResult,
  translateRuleToSql,
} from "./sql-translator.ts";

export type RuleSqlDialect = StoreDialect | SqlDialectCapabilities;

const resolveCapabilities = (dialect?: RuleSqlDialect): SqlDialectCapabilities | undefined =>
  typeof dialect === "string" ? sqlCapabilitiesForDialect(dialect) : dialect;

export const ruleToSqlPredicate = (
  rule: Rule,
  targetEntity: Entity,
  dialect?: RuleSqlDialect,
  tableAlias?: string,
): SqlTranslationResult =>
  translateRuleToSql(rule, targetEntity, resolveCapabilities(dialect), tableAlias);
