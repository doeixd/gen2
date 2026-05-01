/* @__NO_SIDE_EFFECTS__ */
/**
 * Typed rule AST and checker.
 *
 * Rules are named, inspectable logical predicates used by authz, query planning,
 * reactivity dependency extraction, and UI hint generation.
 *
 * See rules_implementation_guide.md.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";
import type { Relation } from "../relation/index.ts";
import type { SemanticType } from "../types/index.ts";

// --- Rule Expression AST ---------------------------------------------------

export interface RuleLiteralExpr<T = unknown> {
  readonly kind: "rule.literal";
  readonly value: T;
  readonly semanticType: SemanticType<T>;
}

export interface RuleVarExpr<T = unknown> {
  readonly kind: "rule.var";
  readonly name: string;
  readonly semanticType: SemanticType<T>;
}

export interface RuleFieldExpr<T = unknown> {
  readonly kind: "rule.field";
  readonly source: RuleVarExpr | Entity;
  readonly field: Field<T>;
  readonly semanticType: SemanticType<T>;
}

export interface RuleEqExpr {
  readonly kind: "rule.eq";
  readonly left: RuleExpr;
  readonly right: RuleExpr;
}

export interface RuleCompareExpr {
  readonly kind: "rule.compare";
  readonly op: "lt" | "lte" | "gt" | "gte";
  readonly left: RuleExpr;
  readonly right: RuleExpr;
}

export interface RuleAndExpr {
  readonly kind: "rule.and";
  readonly terms: readonly RuleExpr<boolean>[];
}

export interface RuleOrExpr {
  readonly kind: "rule.or";
  readonly terms: readonly RuleExpr<boolean>[];
}

export interface RuleNotExpr {
  readonly kind: "rule.not";
  readonly term: RuleExpr<boolean>;
}

export interface RuleExistsExpr {
  readonly kind: "rule.exists";
  readonly relation: Relation;
  readonly where: RuleExpr<boolean>;
}

export type RuleExpr<T = unknown> =
  | RuleLiteralExpr<T>
  | RuleVarExpr<T>
  | RuleFieldExpr<T>
  | RuleEqExpr
  | RuleCompareExpr
  | RuleAndExpr
  | RuleOrExpr
  | RuleNotExpr
  | RuleExistsExpr;

// --- Rule IR ---------------------------------------------------------------

export interface RuleVarDecl<T = unknown> {
  readonly name: string;
  readonly semanticType: SemanticType<T>;
}

export interface Rule<Name extends string = string, Vars = unknown> {
  readonly kind: "rule";
  readonly name: Name;
  readonly vars: readonly RuleVarDecl[];
  readonly body: RuleExpr<boolean>;

  readonly _vars?: Vars;
}

// --- Builder types ---------------------------------------------------------

export type RuleVarRecord = Record<string, SemanticType>;

export type VarTypes<Vars extends RuleVarRecord> = {
  [K in keyof Vars]: Vars[K] extends SemanticType<infer Ts> ? Ts : unknown;
};

export type RuleVarContext<Vars extends RuleVarRecord> = {
  readonly var: {
    [K in keyof Vars]: Vars[K] extends SemanticType<infer Ts> ? RuleVarExpr<Ts> : RuleVarExpr;
  };
};

export interface RuleBuilder<Name extends string = never, Vars extends RuleVarRecord = {}> {
  name<N extends string>(n: N): RuleBuilder<N, Vars>;
  vars<V extends RuleVarRecord>(v: V): RuleBuilder<Name, Vars & V>;
  when(fn: (ctx: RuleVarContext<Vars>) => RuleExpr<boolean>): Rule<Name, VarTypes<Vars>>;
}

export const createRuleBuilder = (): RuleBuilder<never, {}> => {
  let currentName: string | undefined;
  const currentVars: RuleVarDecl[] = [];

  const builder = {
    name<N extends string>(n: N) {
      currentName = n;
      return this as unknown as RuleBuilder<N, {}>;
    },
    vars<V extends RuleVarRecord>(v: V) {
      for (const [key, semType] of Object.entries(v)) {
        currentVars.push({ name: key, semanticType: semType as SemanticType });
      }
      return this as unknown as RuleBuilder<never, V>;
    },
    when(fn: (ctx: RuleVarContext<Record<string, SemanticType>>) => RuleExpr<boolean>) {
      if (!currentName) {
        throw new Error("rule.define builder: .name() must be called before .when()");
      }

      const varExprs: Record<string, RuleVarExpr> = {};
      for (const vd of currentVars) {
        varExprs[vd.name] = ruleVar(vd.name, vd.semanticType);
      }

      const ctx = { var: varExprs } as RuleVarContext<Record<string, SemanticType>>;
      const body = fn(ctx);

      return defineRule({ name: currentName, vars: currentVars, when: body }) as Rule<
        string,
        Record<string, unknown>
      >;
    },
  };

  return builder as unknown as RuleBuilder<never, {}>;
};

// --- Dependencies ----------------------------------------------------------

export interface RuleDependencies {
  readonly entities: readonly Entity[];
  readonly fields: readonly Field[];
  readonly relations: readonly Relation[];
  readonly variables: readonly string[];
}

const addUnique = <T>(arr: T[], item: T): void => {
  if (!arr.some((x) => x === item)) {
    arr.push(item);
  }
};

const collectExprDeps = (
  expr: RuleExpr,
  deps: {
    entities: Entity[];
    fields: Field[];
    relations: Relation[];
    variables: string[];
  },
): void => {
  switch (expr.kind) {
    case "rule.literal":
      break;
    case "rule.var":
      addUnique(deps.variables, expr.name);
      break;
    case "rule.field": {
      if ("kind" in expr.source && expr.source.kind === "rule.var") {
        addUnique(deps.variables, expr.source.name);
      } else {
        addUnique(deps.entities, expr.source as Entity);
      }
      addUnique(deps.fields, expr.field);
      if (expr.field.owning_entity) {
        addUnique(deps.entities, expr.field.owning_entity);
      }
      break;
    }
    case "rule.eq":
      collectExprDeps(expr.left, deps);
      collectExprDeps(expr.right, deps);
      break;
    case "rule.compare":
      collectExprDeps(expr.left, deps);
      collectExprDeps(expr.right, deps);
      break;
    case "rule.and":
      for (const t of expr.terms) collectExprDeps(t, deps);
      break;
    case "rule.or":
      for (const t of expr.terms) collectExprDeps(t, deps);
      break;
    case "rule.not":
      collectExprDeps(expr.term, deps);
      break;
    case "rule.exists": {
      addUnique(deps.relations, expr.relation);
      addUnique(deps.entities, expr.relation.from_entity);
      addUnique(deps.entities, expr.relation.to_entity);
      collectExprDeps(expr.where, deps);
      break;
    }
  }
};

export const extractRuleDependencies = (rule: Rule): RuleDependencies => {
  const deps = {
    entities: [] as Entity[],
    fields: [] as Field[],
    relations: [] as Relation[],
    variables: [] as string[],
  };
  collectExprDeps(rule.body, deps);
  for (const v of rule.vars) {
    addUnique(deps.variables, v.name);
  }
  return {
    entities: deps.entities,
    fields: deps.fields,
    relations: deps.relations,
    variables: deps.variables,
  };
};

// --- Constructors ----------------------------------------------------------

export function defineRule<Name extends string, Vars = unknown>(
  builder: (b: RuleBuilder<never, {}>) => Rule<Name, Vars>,
): Rule<Name, Vars>;
export function defineRule<Name extends string, Vars = unknown>(input: {
  readonly name: Name;
  readonly vars?: readonly RuleVarDecl[];
  readonly when: RuleExpr<boolean>;
}): Rule<Name, Vars>;
export function defineRule<Name extends string, Vars = unknown>(
  inputOrBuilder:
    | ((b: RuleBuilder<never, {}>) => Rule<Name, Vars>)
    | {
        readonly name: Name;
        readonly vars?: readonly RuleVarDecl[];
        readonly when: RuleExpr<boolean>;
      },
): Rule<Name, Vars> {
  if (typeof inputOrBuilder === "function") {
    return inputOrBuilder(createRuleBuilder());
  }
  return {
    kind: "rule",
    name: inputOrBuilder.name,
    vars: inputOrBuilder.vars ?? [],
    body: inputOrBuilder.when,
  } as Rule<Name, Vars>;
}

export const ruleLiteral = <T>(value: T, semanticType: SemanticType<T>): RuleLiteralExpr<T> => ({
  kind: "rule.literal",
  value,
  semanticType,
});

export const ruleVar = <T>(name: string, semanticType: SemanticType<T>): RuleVarExpr<T> => ({
  kind: "rule.var",
  name,
  semanticType,
});

export const ruleField = <T>(
  source: RuleVarExpr | Entity,
  field: Field<T>,
  semanticType: SemanticType<T>,
): RuleFieldExpr<T> => ({
  kind: "rule.field",
  source,
  field,
  semanticType,
});

export const ruleEq = (left: RuleExpr, right: RuleExpr): RuleEqExpr => ({
  kind: "rule.eq",
  left,
  right,
});

export const ruleCompare = (
  op: "lt" | "lte" | "gt" | "gte",
  left: RuleExpr,
  right: RuleExpr,
): RuleCompareExpr => ({
  kind: "rule.compare",
  op,
  left,
  right,
});

export const ruleAnd = (...terms: RuleExpr<boolean>[]): RuleAndExpr => ({
  kind: "rule.and",
  terms,
});

export const ruleOr = (...terms: RuleExpr<boolean>[]): RuleOrExpr => ({
  kind: "rule.or",
  terms,
});

export const ruleNot = (term: RuleExpr<boolean>): RuleNotExpr => ({
  kind: "rule.not",
  term,
});

export const ruleExists = (relation: Relation, where: RuleExpr<boolean>): RuleExistsExpr => ({
  kind: "rule.exists",
  relation,
  where,
});

/** Namespace object for all rule expression constructors. */
export const rule = {
  define: defineRule,
  literal: ruleLiteral,
  var: ruleVar,
  field: ruleField,
  eq: ruleEq,
  compare: ruleCompare,
  and: ruleAnd,
  or: ruleOr,
  not: ruleNot,
  exists: ruleExists,
  dependencies: extractRuleDependencies,
};

// --- Checker ---------------------------------------------------------------

const collectVarsInExpr = (expr: RuleExpr, out: Set<string>): void => {
  switch (expr.kind) {
    case "rule.literal":
      break;
    case "rule.var":
      out.add(expr.name);
      break;
    case "rule.field": {
      if ("kind" in expr.source && expr.source.kind === "rule.var") {
        out.add(expr.source.name);
      }
      break;
    }
    case "rule.eq":
      collectVarsInExpr(expr.left, out);
      collectVarsInExpr(expr.right, out);
      break;
    case "rule.compare":
      collectVarsInExpr(expr.left, out);
      collectVarsInExpr(expr.right, out);
      break;
    case "rule.and":
      for (const t of expr.terms) collectVarsInExpr(t, out);
      break;
    case "rule.or":
      for (const t of expr.terms) collectVarsInExpr(t, out);
      break;
    case "rule.not":
      collectVarsInExpr(expr.term, out);
      break;
    case "rule.exists":
      collectVarsInExpr(expr.where, out);
      break;
  }
};

const isBooleanExpr = (expr: RuleExpr): boolean => {
  switch (expr.kind) {
    case "rule.eq":
    case "rule.compare":
    case "rule.and":
    case "rule.or":
    case "rule.not":
    case "rule.exists":
      return true;
    default:
      return false;
  }
};

const hasUnsafeNegation = (expr: RuleExpr): boolean => {
  if (expr.kind === "rule.not") {
    // Simple scalar negation is safe; exists negation is unsafe for MVP
    if (expr.term.kind === "rule.exists") return true;
    if (expr.term.kind === "rule.and" || expr.term.kind === "rule.or") return true;
    // not(eq(...)) and not(compare(...)) are considered safe for MVP
    if (expr.term.kind === "rule.eq" || expr.term.kind === "rule.compare") return false;
    // Nested not
    if (expr.term.kind === "rule.not") return hasUnsafeNegation(expr.term);
    return true;
  }
  if (expr.kind === "rule.and") {
    return expr.terms.some((t) => hasUnsafeNegation(t));
  }
  if (expr.kind === "rule.or") {
    return expr.terms.some((t) => hasUnsafeNegation(t));
  }
  if (expr.kind === "rule.exists") {
    return hasUnsafeNegation(expr.where);
  }
  return false;
};

// --- Additional diagnostic helpers ------------------------------------------

/** Extract the semantic type name from an expression if available. */
const exprSemanticTypeName = (expr: RuleExpr): string | undefined => {
  switch (expr.kind) {
    case "rule.literal":
      return expr.semanticType.name;
    case "rule.var":
      return expr.semanticType.name;
    case "rule.field":
      return expr.semanticType.name;
    default:
      return undefined;
  }
};

/** Collect type-mismatch diagnostics for eq/compare nodes. */
const collectTypeMismatches = (expr: RuleExpr, ruleName: string, out: Diagnostic[]): void => {
  switch (expr.kind) {
    case "rule.eq":
    case "rule.compare": {
      const leftType = exprSemanticTypeName(expr.left);
      const rightType = exprSemanticTypeName(expr.right);
      if (leftType && rightType && leftType !== rightType) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "rules:type-mismatch",
            message: `Rule "${ruleName}" compares incompatible types: ${leftType} and ${rightType}`,
            suggestion: "Ensure both operands have the same semantic type.",
          }),
        );
      }
      collectTypeMismatches(expr.left, ruleName, out);
      collectTypeMismatches(expr.right, ruleName, out);
      break;
    }
    case "rule.and":
      for (const t of expr.terms) collectTypeMismatches(t, ruleName, out);
      break;
    case "rule.or":
      for (const t of expr.terms) collectTypeMismatches(t, ruleName, out);
      break;
    case "rule.not":
      collectTypeMismatches(expr.term, ruleName, out);
      break;
    case "rule.exists":
      collectTypeMismatches(expr.where, ruleName, out);
      break;
    default:
      break;
  }
};

/** Collect field-not-on-variable diagnostics. */
const collectFieldOwnershipIssues = (expr: RuleExpr, ruleName: string, out: Diagnostic[]): void => {
  switch (expr.kind) {
    case "rule.field": {
      const src = expr.source;
      if (!("kind" in src) || src.kind !== "rule.var") {
        // Direct entity reference — verify the field belongs to the source entity
        if (expr.field.owning_entity !== src) {
          out.push(
            diagnostic({
              severity: "error",
              code: "rules:field-not-on-variable",
              message: `Rule "${ruleName}" references field "${expr.field.name}" on entity "${(src as Entity).name}" but the field belongs to "${expr.field.owning_entity.name}"`,
            }),
          );
        }
      }
      break;
    }
    case "rule.eq":
      collectFieldOwnershipIssues(expr.left, ruleName, out);
      collectFieldOwnershipIssues(expr.right, ruleName, out);
      break;
    case "rule.compare":
      collectFieldOwnershipIssues(expr.left, ruleName, out);
      collectFieldOwnershipIssues(expr.right, ruleName, out);
      break;
    case "rule.and":
      for (const t of expr.terms) collectFieldOwnershipIssues(t, ruleName, out);
      break;
    case "rule.or":
      for (const t of expr.terms) collectFieldOwnershipIssues(t, ruleName, out);
      break;
    case "rule.not":
      collectFieldOwnershipIssues(expr.term, ruleName, out);
      break;
    case "rule.exists":
      collectFieldOwnershipIssues(expr.where, ruleName, out);
      break;
    default:
      break;
  }
};

export const checkRules = (rules: readonly Rule[]): Diagnostic[] => {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    // DuplicateRuleName
    if (seen.has(rule.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "rules:duplicate-rule-name",
          message: `Rule name "${rule.name}" is already defined`,
        }),
      );
    } else {
      seen.add(rule.name);
    }

    // NonBooleanBody
    if (!isBooleanExpr(rule.body)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "rules:non-boolean-body",
          message: `Rule "${rule.name}" body must be a boolean expression`,
        }),
      );
    }

    // UnknownVariable
    const declaredVars = new Set(rule.vars.map((v) => v.name));
    const usedVars = new Set<string>();
    collectVarsInExpr(rule.body, usedVars);
    for (const v of usedVars) {
      if (!declaredVars.has(v)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "rules:unknown-variable",
            message: `Rule "${rule.name}" uses undeclared variable "${v}"`,
          }),
        );
      }
    }

    // UnsafeNegation
    if (hasUnsafeNegation(rule.body)) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "rules:unsafe-negation",
          message: `Rule "${rule.name}" contains negation that may not be safely translatable to SQL`,
        }),
      );
    }

    // TypeMismatch
    collectTypeMismatches(rule.body, rule.name, out);

    // FieldOwnership
    collectFieldOwnershipIssues(rule.body, rule.name, out);

    // UnboundOutputVariable
    for (const v of rule.vars) {
      if (!usedVars.has(v.name)) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "rules:unbound-output-variable",
            message: `Rule "${rule.name}" declares variable "${v.name}" but never uses it`,
            suggestion: "Remove the unused variable or reference it in the rule body.",
          }),
        );
      }
    }
  }

  return out;
};

// --- Derived Rule Views ----------------------------------------------------

export interface DerivedRuleView<
  Name extends string = string,
  In extends Record<string, unknown> = Record<string, unknown>,
  Out = unknown,
> {
  readonly kind: "derived_rule_view";
  readonly name: Name;
  readonly input_vars: readonly RuleVarDecl[];
  readonly output_type: SemanticType<Out>;
  readonly body: RuleExpr<boolean>;
  readonly projection: readonly RuleVarDecl[];
  readonly maintenance: "incremental" | "rebuild" | "manual";
  readonly _in?: In;
  readonly _out?: Out;
}

export const defineDerivedRuleView = <
  const Name extends string,
  In extends Record<string, unknown>,
  Out,
>(input: {
  readonly name: Name;
  readonly input_vars: readonly RuleVarDecl[];
  readonly output_type: SemanticType<Out>;
  readonly body: RuleExpr<boolean>;
  readonly projection: readonly RuleVarDecl[];
  readonly maintenance?: "incremental" | "rebuild" | "manual";
}): DerivedRuleView<Name, In, Out> => ({
  kind: "derived_rule_view",
  name: input.name,
  input_vars: input.input_vars,
  output_type: input.output_type,
  body: input.body,
  projection: input.projection,
  maintenance: input.maintenance ?? "incremental",
});

export const extractRuleViewDependencies = (view: DerivedRuleView): RuleDependencies => {
  const entities: Entity[] = [];
  const fields: Field[] = [];
  const relations: Relation[] = [];
  const variables: string[] = [];
  collectExprDeps(view.body, { entities, fields, relations, variables });
  return { entities, fields, relations, variables };
};

export const checkDerivedRuleViews = (views: readonly DerivedRuleView[]): Diagnostic[] => {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const view of views) {
    // DuplicateViewName
    if (seen.has(view.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "rules:duplicate-view-name",
          message: `Derived view name "${view.name}" is already defined`,
        }),
      );
    } else {
      seen.add(view.name);
    }

    // NonBooleanBody
    if (!isBooleanExpr(view.body)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "rules:view-non-boolean-body",
          message: `Derived view "${view.name}" body must be a boolean expression`,
        }),
      );
    }

    // UnboundOutputVariable
    const declaredVars = new Set(view.input_vars.map((v) => v.name));
    const projectedVars = new Set(view.projection.map((v) => v.name));
    const usedVars = new Set<string>();
    collectVarsInExpr(view.body, usedVars);
    for (const v of projectedVars) {
      if (!declaredVars.has(v) && !usedVars.has(v)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "rules:view-unbound-output-variable",
            message: `Derived view "${view.name}" projects unbound variable "${v}"`,
            suggestion: "Bind the variable in the view body or declare it as an input.",
          }),
        );
      }
    }

    // UnsafeNegation
    if (hasUnsafeNegation(view.body)) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "rules:view-unsafe-negation",
          message: `Derived view "${view.name}" contains negation that may not be safely translatable to SQL`,
        }),
      );
    }

    // TypeMismatch
    collectTypeMismatches(view.body, view.name, out);

    // FieldOwnership
    collectFieldOwnershipIssues(view.body, view.name, out);
  }

  return out;
};
