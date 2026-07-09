/* @__NO_SIDE_EFFECTS__ */
/**
 * Reactivity dialect passes (Track R §R6 + Track E port).
 *
 * Hosts `derive.rule.invalidationDependencies` — the **showcase
 * derivation** of the entire library (PLAN.md §0.2 derivation #8 and
 * §R6). The chain
 *
 *   Action writes Field -> Rule reads Field -> Policy uses Rule ->
 *   Query/Resource guarded by Policy -> Action invalidates Resource
 *
 * is the canonical example for `app.explain(...)`, the Track R slice
 * fixture's R-8 todo, and the README's opening rule-first demo. This
 * pass walks the graph, runs `deriveRuleInvalidationPlansFromGraph`,
 * and *materializes* its results as `INVALIDATES_KEY_EDGE_KIND` edges
 * with rich metadata (precision, confidence, the rules that drove the
 * derivation).
 *
 * The pass is graph-native: it reads only `graph` (no
 * `passCtx.options.genContext`) and returns `modifiedGraph` via
 * `registerEdge` (no `attachEdge` mutation). It satisfies both
 * architecture-test bridge bans.
 */

import type { GenContext } from "../core/index.ts";
import type { KernelGraph } from "../kernel/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { defineMorphism } from "../kernel/morphism.ts";
import { attachMorphism } from "../kernel/dialect.ts";
import { id } from "../kernel/id.ts";
import { graphPatch, type GraphPatch } from "../kernel/patch.ts";
import { nodeRef } from "../kernel/node.ts";
import { defineDerivationSurface, defineSurfaceId, subjectKind } from "../kernel/index.ts";
import {
  INVALIDATES_KEY_EDGE_KIND,
  KEY_FAMILY_NODE_KIND,
  ReactivityDialect,
} from "../dialects/reactivity.ts";
import {
  ACTION_NODE_KIND,
  ACTION_WRITES_FIELD_EDGE_KIND,
  QUERY_READS_EDGE_KIND,
} from "../dialects/callable.ts";
import { POLICY_USES_RULE_EDGE_KIND } from "../dialects/auth.ts";
import { RULE_READS_EDGE_KIND } from "../dialects/core/expr-rule.ts";
import {
  findKeyFamilyByNameOnGraph,
  getKeyFamiliesFromGraph,
  getReactiveMutationsFromGraph,
  getReactiveResourcesFromGraph,
} from "./kernel.ts";
import { getActionFunctionsFromGraph, getQueryFunctionsFromGraph } from "../function/kernel.ts";
import {
  checkOptimisticPlans,
  checkReactivity,
  checkScopedResourcesAndStreams,
} from "./reactivity.ts";
import {
  checkRuleReactivityOnGraph,
  deriveRuleInvalidationPlansFromGraph,
  RULE_INVALIDATION_SOURCE_PATTERN,
} from "./rule-derived.ts";
import type { DerivedInvalidationPlan, InvalidationConfidence } from "./rule-derived.ts";

const RULE_INVALIDATION_PASS_NAME = "derive.rule.invalidationDependencies";
const REACTIVITY_INVALIDATES_PASS_NAME = "derive.reactivity.invalidates";

const callableId = id.createFactory("callable");
const reactivityId = id.createFactory("reactivity");
const REACTIVITY_OPTIMISTIC_PASS_NAME = "derive.reactivity.optimisticPlans";
const RULE_REACTIVITY_PASS_NAME = "derive.rule.reactivity";

type ReactivityDiagnostic = ReturnType<typeof checkReactivity>[number];

const diagnosticsToPassResult = (diagnostics: readonly ReactivityDiagnostic[]): PassResult => ({
  success: !diagnostics.some((d) => d.severity === "error"),
  diagnostics: diagnostics.map((d) =>
    defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
  ),
});

/** Find the action node id for an action by name. */
const findActionNodeIdByName = (graph: KernelGraph, actionName: string): string | undefined => {
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== ACTION_NODE_KIND.id) continue;
    if (node.name === actionName) return node.id;
  }
  return undefined;
};

/** Stable, content-addressable id for a derived invalidation edge. */
const derivedInvalidationEdgeId = (actionNodeId: string, keyFamilyNodeId: string): string =>
  `edge:invalidatesKey:derived:${actionNodeId}:${keyFamilyNodeId}`;

const planConfidence = (c: InvalidationConfidence): "exact" | "conservative" =>
  c === "proven" ? "exact" : "conservative";

export const RULE_INVALIDATION_SURFACE = defineDerivationSurface
  .id(
    defineSurfaceId({
      phase: "derivation",
      id: "surface.rule.invalidationDependencies",
      label: "Rule invalidation dependencies",
    }),
  )
  .consumes({
    subjects: [subjectKind.ENTITY],
    edges: [
      ACTION_WRITES_FIELD_EDGE_KIND,
      RULE_READS_EDGE_KIND,
      POLICY_USES_RULE_EDGE_KIND,
      QUERY_READS_EDGE_KIND,
    ],
  })
  .yields({ edges: [INVALIDATES_KEY_EDGE_KIND] })
  .resultShape({
    patches: [INVALIDATES_KEY_EDGE_KIND],
    diagnostics: ["rule:derived-invalidation"],
  })
  .done({
    metadata: {
      title: "Rule-derived invalidation dependency surface",
      description:
        "Derives invalidation edges from action writes, rule reads, policy usage, and query reads.",
    },
  });

/**
 * Build patches for one plan. Application is handled by the derivation
 * runner so the resulting graph, patches, diagnostics, and explanations
 * travel as one `GraphStageResult`.
 */
const planPatches = (
  graph: KernelGraph,
  plan: DerivedInvalidationPlan,
  seenEdgeIds: Set<string>,
): readonly GraphPatch[] => {
  const actionNodeId = findActionNodeIdByName(graph, plan.mutation.name);
  if (!actionNodeId) return [];

  const patches: GraphPatch[] = [];

  for (const pattern of plan.invalidates) {
    const familyNode = findKeyFamilyByNameOnGraph(graph, pattern.family.name);
    if (!familyNode?.id) continue;
    const edgeId = derivedInvalidationEdgeId(actionNodeId, familyNode.id);
    if (graph.edges.has(edgeId) || seenEdgeIds.has(edgeId)) continue;
    seenEdgeIds.add(edgeId);

    patches.push(
      graphPatch.addEdge.unsafe(
        INVALIDATES_KEY_EDGE_KIND,
        edgeId,
        {
          mutator: {
            target: nodeRef(
              ACTION_NODE_KIND,
              callableId.parse.node(ACTION_NODE_KIND, actionNodeId),
              {
                name: plan.mutation.name,
              },
            ),
            cardinality: "one",
          },
          key: {
            target: nodeRef(
              KEY_FAMILY_NODE_KIND,
              reactivityId.parse.node(KEY_FAMILY_NODE_KIND, familyNode.id),
              {
                name: pattern.family.name,
              },
            ),
            cardinality: "one",
          },
        },
        {
          provenance: {
            kind: "inferred",
            pass: RULE_INVALIDATION_PASS_NAME,
            confidence: planConfidence(plan.confidence),
          },
          metadata: {
            title: `${plan.mutation.name} invalidates ${pattern.family.name}`,
            custom: {
              provenance: "derived",
              precision: plan.precision,
              appliedPrecision: plan.appliedPrecision,
              confidence: plan.confidence,
              affectedRules: plan.affectedRules.map((r) => r.name),
            },
          },
          patchProvenance: {
            source: "derivation",
            name: RULE_INVALIDATION_PASS_NAME,
            inputFacts: [
              ACTION_WRITES_FIELD_EDGE_KIND.id,
              RULE_READS_EDGE_KIND.id,
              POLICY_USES_RULE_EDGE_KIND.id,
              QUERY_READS_EDGE_KIND.id,
            ],
            confidence: planConfidence(plan.confidence),
            explanation: `${plan.mutation.name} invalidates ${pattern.family.name}`,
          },
        },
      ),
    );
  }

  return patches;
};

/**
 * Rule-derived invalidation as a morphism.
 *
 * Source-matches `Action ─[writes]→ Field ←[reads]─ Rule` via
 * `RULE_INVALIDATION_SOURCE_PATTERN`; aggregation runs over the full match
 * set in `mapAll` (per-action plan grouping doesn't fit a per-match `map`).
 * Emits `INVALIDATES_KEY_EDGE_KIND` edge patches plus a single info
 * diagnostic with a "Apply derived invalidation edges" repair.
 *
 * Compiled to a `GraphDerivation` via `.toDerivation()` so the pass
 * registry's existing pipeline runner stays unchanged.
 */
export const RULE_INVALIDATION_MORPHISM = defineMorphism({
  name: RULE_INVALIDATION_PASS_NAME,
  phase: "derivation",
  from: RULE_INVALIDATION_SOURCE_PATTERN,
  to: { edges: [INVALIDATES_KEY_EDGE_KIND] },
  surface: RULE_INVALIDATION_SURFACE,
  explanation: "An action writes a field read by a rule guarding a keyed query",
  diagnostics: ["rule:derived-invalidation"],
  mapAll: (_matches, helpers) => {
    const plans = deriveRuleInvalidationPlansFromGraph(helpers.graph);
    const seenEdgeIds = new Set<string>();
    const patches: GraphPatch[] = plans.flatMap((plan) =>
      planPatches(helpers.graph, plan, seenEdgeIds),
    );

    if (patches.length === 0) {
      return { patches: [], diagnostics: [], explanations: [] };
    }

    return {
      patches,
      diagnostics: [
        defineDiagnostic(
          "rule:derived-invalidation",
          "info",
          `Derived ${patches.length} rule-driven invalidation edge${patches.length === 1 ? "" : "s"}`,
          {
            repairs: [
              {
                label: "Apply derived invalidation edges",
                description:
                  "Materialize the rule-derived invalidation edges produced by this derivation.",
                patches,
              },
            ],
          },
        ),
      ],
      explanations: [
        {
          message: "Derived rule-driven invalidation edges from action writes and rule reads",
          facts: [
            ACTION_WRITES_FIELD_EDGE_KIND.id,
            RULE_READS_EDGE_KIND.id,
            POLICY_USES_RULE_EDGE_KIND.id,
            QUERY_READS_EDGE_KIND.id,
          ],
        },
      ],
    };
  },
});

// Wire `RULE_INVALIDATION_MORPHISM` into its owning dialect so dialect
// introspection (`ReactivityDialect.morphisms`, `ReactivityDialect.surfaces`)
// and future lowerability matrix consumers see the morphism without
// needing to know about the reactivity pass module. Idempotent.
attachMorphism(ReactivityDialect, RULE_INVALIDATION_MORPHISM);

const ruleInvalidationDerivation = RULE_INVALIDATION_MORPHISM.toDerivation();

/**
 * Register the rule-derived invalidation pass on `ctx.passRegistry`.
 *
 * The pass runs in the `derive` phase. It reads the graph + the
 * `_bridge*` metadata still on action/rule/query nodes, computes
 * derived invalidation plans via `deriveRuleInvalidationPlansFromGraph`,
 * and emits matching `INVALIDATES_KEY_EDGE_KIND` edges with
 * `provenance: "derived"` plus precision/confidence/affected-rules
 * metadata. `app.explain(action)` surfaces these edges automatically
 * because they are real graph edges incident to the action node.
 */
export const registerReactivityPasses = (ctx: GenContext): void => {
  if (!ctx.passRegistry.has(REACTIVITY_INVALIDATES_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: REACTIVITY_INVALIDATES_PASS_NAME, phase: "derive" },
      (graph) =>
        diagnosticsToPassResult(
          checkReactivity({
            key_families: getKeyFamiliesFromGraph(graph),
            reactive_resources: getReactiveResourcesFromGraph(graph),
            reactive_mutations: getReactiveMutationsFromGraph(graph),
            query_functions: getQueryFunctionsFromGraph(graph),
            action_functions: getActionFunctionsFromGraph(graph),
          }),
        ),
    );
  }

  if (!ctx.passRegistry.has(REACTIVITY_OPTIMISTIC_PASS_NAME)) {
    ctx.passRegistry.register({ name: REACTIVITY_OPTIMISTIC_PASS_NAME, phase: "derive" }, (graph) =>
      diagnosticsToPassResult(
        checkOptimisticPlans({ reactive_mutations: getReactiveMutationsFromGraph(graph) }),
      ),
    );
  }

  if (!ctx.passRegistry.has(RULE_REACTIVITY_PASS_NAME)) {
    ctx.passRegistry.register({ name: RULE_REACTIVITY_PASS_NAME, phase: "derive" }, (graph) =>
      diagnosticsToPassResult(checkRuleReactivityOnGraph(graph)),
    );
  }

  if (!ctx.passRegistry.has("legalize.scopedResources")) {
    ctx.passRegistry.register(
      { name: "legalize.scopedResources", phase: "legalize" },
      (): PassResult => diagnosticsToPassResult(checkScopedResourcesAndStreams(ctx)),
    );
  }

  if (ctx.passRegistry.has(RULE_INVALIDATION_PASS_NAME)) return;

  ctx.passRegistry.register(
    { name: RULE_INVALIDATION_PASS_NAME, phase: "derive" },
    (graph): PassResult => {
      const stage = ruleInvalidationDerivation.run(graph);
      return {
        success: !stage.diagnostics.some((d) => d.severity === "error"),
        diagnostics: stage.diagnostics,
        patches: stage.patches,
        explanations: stage.explanations,
        modifiedGraph: stage.graph,
      };
    },
  );
};

/** Re-export the pass name so the runner / pipeline registry can reference it. */
export const RULE_INVALIDATION_PASS = RULE_INVALIDATION_PASS_NAME;
