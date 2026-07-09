/* @__NO_SIDE_EFFECTS__ */
/**
 * Track R §R2 — `legalize.rule.toRlsPolicy` (graph-native).
 *
 * For each `Policy` node in the graph, walks `POLICY_TARGETS_ENTITY`
 * and `POLICY_USES_RULE` edges to find the target entity name and
 * predicate rule node, then walks the rule's body via
 * `RULE_HAS_BODY` and renders SQL via `kernelExprToSql`. The
 * resulting `CREATE POLICY ...` text becomes a Postgres
 * `pg.rls-policy` `Artifact`.
 *
 * **Entirely graph-native** per PLAN.md §0.5 #8: no
 * `passCtx.options.genContext` reads, no `_bridge*` JS-object
 * lookups, no calls to `ruleToRlsPolicy`/`ruleToSqlPredicate` (the
 * legacy JS-object helpers). The pass reads only:
 *
 *   - `graph.nodes` (policy node + typed `PolicyNodeCustom` payload)
 *   - `graph.edges` (POLICY_TARGETS_ENTITY, POLICY_USES_RULE,
 *     RULE_HAS_BODY)
 *   - `graph.exprs` (the rule's body expression tree)
 *
 * The storage table name for the target entity is read from the
 * typed `EntityNodeCustom.store_name` payload. No JS-object side
 * channel.
 */

import {
  attachMorphism,
  defineGraphPattern,
  defineMorphism,
  type PassResult,
  type KernelGraph,
  type KernelNode,
} from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { defineArtifact, ARTIFACT_KINDS, type Artifact } from "../kernel/artifact.ts";
import type { KernelId } from "../kernel/id.ts";
import type { GenContext } from "../core/index.ts";
import {
  AuthDialect,
  POLICY_NODE_KIND,
  POLICY_TARGETS_ENTITY_EDGE_KIND,
  POLICY_USES_RULE_EDGE_KIND,
  type PolicyNodeCustom,
} from "../dialects/auth.ts";
import {
  ENTITY_NODE_KIND,
  type EntityNodeCustom,
} from "../dialects/domain/entity-field-relation.ts";
import { RULE_HAS_BODY_EDGE_KIND, RULE_NODE_KIND } from "../dialects/core/expr-rule.ts";
import type { KernelExpr } from "../kernel/index.ts";
import { kernelExprToSql } from "./sql-graph.ts";

const RLS_PASS_NAME = "legalize.rule.toRlsPolicy";
const PASS_NODE_ID = `pass:${RLS_PASS_NAME}` as KernelId<"pass">;

const quoteIdent = (id: string): string => `"${id.replace(/"/g, '""')}"`;

export const RLS_POLICY_PATTERN = defineGraphPattern({
  nodes: {
    policy: POLICY_NODE_KIND,
    entity: ENTITY_NODE_KIND,
    rule: RULE_NODE_KIND,
  },
  exprs: {
    body: true,
  },
  edges: {
    policyTargetsEntity: {
      kind: POLICY_TARGETS_ENTITY_EDGE_KIND,
      endpoints: { policy: "policy", entity: "entity" },
    },
    policyUsesRule: {
      kind: POLICY_USES_RULE_EDGE_KIND,
      endpoints: { policy: "policy", rule: "rule" },
    },
    ruleHasBody: {
      kind: RULE_HAS_BODY_EDGE_KIND,
      endpoints: { rule: "rule", body: "body" },
    },
  },
});

const buildArtifactForPolicy = (
  graph: KernelGraph,
  policyNode: KernelNode,
  entityNode: KernelNode,
  ruleNode: KernelNode,
  body: KernelExpr,
  policyName: string,
): { readonly artifact?: Artifact; readonly translatable: boolean; readonly reason?: string } => {
  const entityName = entityNode.name ?? entityNode.id;
  const ruleName = ruleNode.name ?? ruleNode.id;
  const entityCustom = entityNode.metadata?.custom as (EntityNodeCustom & object) | undefined;
  const storeName = entityCustom?.store_name;
  if (!storeName) {
    return {
      translatable: false,
      reason: `Entity "${entityName}" has no store_name; cannot generate RLS policy`,
    };
  }
  const sql = kernelExprToSql(graph, body.id, { tableAlias: "row" });
  if (!sql.translatable) {
    return {
      translatable: false,
      reason: `Rule "${ruleName}" body cannot be lowered to SQL`,
    };
  }

  const rlsPolicyName = `${ruleName}_policy`;
  const policySql = `CREATE POLICY ${quoteIdent(rlsPolicyName)} ON ${quoteIdent(storeName)} USING (${sql.sql});`;

  const artifact = defineArtifact(`artifact:rls:${policyName}`, {
    target: "postgres",
    kind: ARTIFACT_KINDS.PG_RLS_POLICY,
    path: `policies/${rlsPolicyName}.sql`,
    content: policySql,
    generatedFrom: [
      { id: policyNode.id as KernelId, kind: "policy", context: policyName },
      { id: ruleNode.id as KernelId, kind: "rule", context: ruleName },
      { id: entityNode.id as KernelId, kind: "entity", context: entityName },
    ],
    generatedBy: PASS_NODE_ID,
  });
  return { translatable: true, artifact };
};

/**
 * Lowering morphism for rule → Postgres RLS policy.
 *
 * Walks `RLS_POLICY_PATTERN` matches; per match, runs `buildArtifactForPolicy`
 * to produce either a `pg.rls-policy` artifact (translatable rule body) or
 * an info diagnostic explaining why the rule was not lowerable.
 *
 * This is the first production pass authored as a `defineMorphism(...)`
 * rather than a `graphDerivation(...)` — proves the unified
 * pattern→morphism execution model end-to-end (PLAN Track A §2).
 */
export const RLS_POLICY_MORPHISM = defineMorphism({
  name: RLS_PASS_NAME,
  phase: "lowering",
  from: RLS_POLICY_PATTERN,
  to: { artifacts: ["pg.rls-policy"] },
  diagnostics: ["rule:rls-not-translatable"],
  map: (match, helpers) => {
    const { policy, entity, rule, body } = match.bindings;
    const custom = policy.metadata?.custom as PolicyNodeCustom | undefined;
    if (!custom) return [];
    const ruleName = custom.predicate_rule_name;
    if (!ruleName) return [];
    if (entity.name !== custom.target_entity_name) return [];
    if (rule.name !== ruleName) return [];

    const result = buildArtifactForPolicy(
      helpers.graph,
      policy,
      entity,
      rule,
      body,
      policy.name ?? custom.target_entity_name,
    );
    if (result.artifact) {
      return { artifacts: [result.artifact] };
    }
    return {
      diagnostics: [
        defineDiagnostic(
          "rule:rls-not-translatable",
          "info",
          `${result.reason ?? "RLS lowering failed"}; falling back to server enforcement.`,
        ),
      ],
    };
  },
});

// Wire `RLS_POLICY_MORPHISM` into its owning dialect so dialect
// introspection (`AuthDialect.morphisms`, `AuthDialect.surfaces`) and
// future lowerability matrix consumers see the morphism without needing
// to know about the rule pass module. Idempotent; safe at module load.
attachMorphism(AuthDialect, RLS_POLICY_MORPHISM);

/**
 * Register the RLS-policy emit pass. Graph-native: walks policy nodes,
 * resolves their target entity / predicate rule by name (typed
 * `PolicyNodeCustom` payload + verification edges), translates the
 * body via `kernelExprToSql`, emits one `pg.rls-policy` artifact per
 * translatable triple. Untranslatable rules surface as info
 * diagnostics.
 *
 * The pass delegates to `RLS_POLICY_MORPHISM.run(graph)`; this register
 * function exists only to wire the morphism's aggregated result into
 * the pass registry's `PassResult` shape.
 */
export const registerRlsPolicyPass = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(RLS_PASS_NAME)) return;

  ctx.passRegistry.register({ name: RLS_PASS_NAME, phase: "legalize" }, (graph): PassResult => {
    const result = RLS_POLICY_MORPHISM.run(graph);
    return {
      success: result.diagnostics.every((d) => d.severity !== "error"),
      diagnostics: [...result.diagnostics],
      artifacts: [...result.artifacts],
    };
  });
};

export const RLS_POLICY_PASS = RLS_PASS_NAME;
