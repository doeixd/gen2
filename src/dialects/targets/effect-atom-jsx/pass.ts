/* @__NO_SIDE_EFFECTS__ */
/**
 * UI target `ui-effect-atom-jsx` — phase 1 (keys + query + mutation wiring).
 *
 * `emit.ui.effectAtomJsx.keysAndAtoms` — graph-native pass. Per
 * `docs/revised2/ui-target-effect-atom-jsx.md` §6 phase 1: emits
 * `keys.ts` (Reactivity key witnesses derived from `KEY_FAMILY_NODE_KIND`
 * nodes) and `atoms.ts` (`defineQuery`/`defineMutation` wiring, with
 * `invalidates`/`key` options sourced from `INVALIDATES_KEY_EDGE_KIND` /
 * `query.reactivity.key`). No views, no rule-derived UI state, no
 * hydration — those are phases 2-4 (§6.2-6.4).
 *
 * Deviations from the spec doc (recorded here so they don't silently
 * drift):
 *
 *  - §2.1 lowering table cites `DERIVES_KEY_EDGE_KIND` (query -> key) as
 *    the source of a query's key. That edge kind is defined
 *    (`src/dialects/reactivity.ts`) but no pass in this repo materializes
 *    it yet — nothing ever calls `registerEdge` with it. This pass
 *    instead reads `QueryFunction.reactivity.key` directly off the typed
 *    `QueryNodeCustom` payload (the same source `derive.rule.
 *    invalidationDependencies` uses), mirroring how `postgres-table-
 *    pass.ts` reads `EntityNodeCustom` instead of a bridge edge.
 *  - §2.1's ancestors-expansion example assumes gen2's R-8 derivation can
 *    target a *child* witness (row-scoped key) on the `INVALIDATES_KEY`
 *    edge. Today's `derive.rule.invalidationDependencies` only ever
 *    targets the *family root* (`KeyFamily` node) — there is no id
 *    extraction / child-key materialization anywhere in the graph. So
 *    every invalidation this pass emits is already the "conservative
 *    static form" the spec's open question #1 anticipates; this pass
 *    does not attempt result-dependent `(result) => key.child(id)`
 *    resolution (no information in the graph would justify it yet) and
 *    emits an info diagnostic (`ui-target:conservative-invalidation`,
 *    not one of the spec's named §4 diagnostics — a phase-1 addition)
 *    recording the precision loss.
 *  - The emitted witness's string name is derived from the KeyFamily
 *    node's structural name (e.g. `"Incident:entity"` for
 *    `gen.key.entity(Incident)`) by taking the segment before `:` and
 *    lowercasing it (`"incident"`), matching the spec's own
 *    `KeyFamily<"incident">` example. This mapping is this pass's
 *    convention, not something the spec pins.
 *  - `atoms.ts`'s query/mutation bodies call an assumed `IncidentApi`
 *    service (matching the spec's own §2.3/§2.4 examples verbatim) —
 *    gen2 does not yet generate service implementations for query/action
 *    function bodies (that is Track F / a later phase), so the import is
 *    an application-level seam the emitter assumes exists, not a gen2
 *    artifact. No `Atom.runtime(layer)` binding is emitted in phase 1:
 *    the opsdesk slice fixture declares no `dialect.core.provider`/
 *    `requirement` nodes, so there is no Layer to bind (`§2.2`'s
 *    "fully resolve before lowering runs" holds vacuously). The
 *    `runtime` option on `defineQuery`/`defineMutation` is optional, so
 *    it is simply omitted; once a Provider node exists for this slice,
 *    this pass should emit `export const runtime = Atom.runtime(...)`
 *    and thread it through.
 *  - `optimistic`/`rollback` are never emitted in phase 1 (§2.4's
 *    eligibility gate needs rule-derived UI state, which is phase 3).
 *
 * Diagnostics implemented (per §4, "implemented" not "declared"):
 *  - `ui-target:redundant-key-edge` (§2.1/§4.4) — an action's
 *    `INVALIDATES_KEY_EDGE_KIND` edges must not target both a parent key
 *    family and one of its own children in the same emission. Always
 *    green for this slice (gen2 has no child-key nodes yet), but the
 *    check is real and generic.
 *  - `ui-target:unbound-requirement` (§2.2/§4.5) — every emitted
 *    query/action's `DECLARES_REQUIREMENT_EDGE_KIND` targets must have a
 *    `SATISFIES_EDGE_KIND` provider. Vacuously green for this slice (no
 *    requirement edges declared).
 *  - `ui-target:conservative-invalidation` (phase-1 addition, not in the
 *    spec's §4 list) — info diagnostic recording every invalidation this
 *    pass emitted at family-root (not row-scoped) precision.
 *
 * Deferred (TODO, no-op until their dialects exist, per §4.1-§4.3):
 *  - `ui-target:slot-capability-mismatch` — needs `views.ts` (phase 2).
 *  - `ui-target:unbound-style-binding` — needs the DesignSystem dialect
 *    (not built; phase 4 follow-up per §7 open question 4).
 *  - `ui-target:unknown-design-token` — same, no themed styles in v1.
 */

import { type PassResult, type KernelGraph } from "../../../kernel/index.ts";
import { defineArtifact, type Artifact } from "../../../kernel/artifact.ts";
import { defineDiagnostic, type Diagnostic } from "../../../kernel/diagnostic.ts";
import type { KernelId } from "../../../kernel/id.ts";
import type { GenContext } from "../../../core/index.ts";
import { getKeyFamiliesFromGraph } from "../../../reactivity/kernel.ts";
import {
  getActionFunctionsFromGraph,
  getQueryFunctionsFromGraph,
} from "../../../function/kernel.ts";
import { ACTION_NODE_KIND, QUERY_NODE_KIND } from "../../callable.ts";
import { INVALIDATES_KEY_EDGE_KIND } from "../../reactivity.ts";
import { DECLARES_REQUIREMENT_EDGE_KIND } from "../../core/requirement.ts";
import { SATISFIES_EDGE_KIND } from "../../core/provider.ts";

export const EFFECT_ATOM_JSX_UI_PASS_NAME = "emit.ui.effectAtomJsx.keysAndAtoms";
const PASS_NODE_ID = `pass:${EFFECT_ATOM_JSX_UI_PASS_NAME}` as KernelId<"pass">;

/** Target npm package this emitter's `import` statements reference. */
export const EFFECT_ATOM_JSX_PACKAGE = "effect-atom-jsx";

/**
 * Derive the emitted witness's string name + JS export identifier from a
 * `KeyFamily` node's structural name (e.g. `"Incident:entity"` ->
 * `{ witnessName: "incident", exportName: "incidentKey" }`).
 */
const witnessNamesFromFamilyName = (
  familyName: string,
): { readonly witnessName: string; readonly exportName: string } => {
  const [head] = familyName.split(":");
  const witnessName = (head ?? familyName).toLowerCase();
  return { witnessName, exportName: `${witnessName}Key` };
};

interface InvalidationEntry {
  readonly actionName: string;
  readonly keyFamilyNames: readonly string[];
}

/** Collect, per action, the set of KeyFamily node names it invalidates. */
const collectInvalidationsByAction = (graph: KernelGraph): InvalidationEntry[] => {
  const mutatorRole = INVALIDATES_KEY_EDGE_KIND.endpoints.find((e) =>
    e.id.endsWith(":mutator"),
  )?.id;
  const keyRole = INVALIDATES_KEY_EDGE_KIND.endpoints.find((e) => e.id.endsWith(":key"))?.id;
  if (!mutatorRole || !keyRole) return [];

  const byAction = new Map<string, Set<string>>();
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== INVALIDATES_KEY_EDGE_KIND.id) continue;
    const mutatorEp = edge.endpoints.find((ep) => ep.role.id === mutatorRole);
    const keyEp = edge.endpoints.find((ep) => ep.role.id === keyRole);
    const actionName = (mutatorEp?.target as { readonly name?: unknown })?.name;
    const keyName = (keyEp?.target as { readonly name?: unknown })?.name;
    if (typeof actionName !== "string" || typeof keyName !== "string") continue;
    const set = byAction.get(actionName) ?? new Set<string>();
    set.add(keyName);
    byAction.set(actionName, set);
  }

  return [...byAction.entries()].map(([actionName, keyFamilyNames]) => ({
    actionName,
    keyFamilyNames: [...keyFamilyNames],
  }));
};

/**
 * `ui-target:redundant-key-edge` (§2.1/§4.4). An action must not carry
 * both a parent `INVALIDATES_KEY` edge and one of its children's edges
 * simultaneously — ancestor invalidation is a target-runtime property of
 * the witness hierarchy (`keys = [...ancestors, self]`), not something
 * gen2 should re-derive as extra edges.
 */
const checkRedundantKeyEdges = (entries: readonly InvalidationEntry[]): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const entry of entries) {
    const names = entry.keyFamilyNames;
    for (const parent of names) {
      for (const child of names) {
        if (parent === child) continue;
        if (child.startsWith(`${parent}:`)) {
          diagnostics.push(
            defineDiagnostic(
              "ui-target:redundant-key-edge",
              "error",
              `Action "${entry.actionName}" invalidates both parent key "${parent}" and child key "${child}"; the child's ancestors-expansion already reaches the parent, so both edges is a redundant double emission.`,
            ),
          );
        }
      }
    }
  }
  return diagnostics;
};

/**
 * `ui-target:unbound-requirement` (§2.2/§4.5). Every query/action
 * emitted for this target must have a fully resolved Provider chain
 * before lowering runs: every `DECLARES_REQUIREMENT_EDGE_KIND` target
 * must have at least one `SATISFIES_EDGE_KIND` edge pointing at it.
 */
const checkUnboundRequirements = (graph: KernelGraph, nodeIds: readonly string[]): Diagnostic[] => {
  const consumerRole = DECLARES_REQUIREMENT_EDGE_KIND.endpoints.find((e) =>
    e.id.endsWith(":consumer"),
  )?.id;
  const requirementRole = DECLARES_REQUIREMENT_EDGE_KIND.endpoints.find((e) =>
    e.id.endsWith(":requirement"),
  )?.id;
  const satisfiesRequirementRole = SATISFIES_EDGE_KIND.endpoints.find((e) =>
    e.id.endsWith(":requirement"),
  )?.id;
  if (!consumerRole || !requirementRole || !satisfiesRequirementRole) return [];

  const satisfiedRequirementIds = new Set<string>();
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== SATISFIES_EDGE_KIND.id) continue;
    const reqEp = edge.endpoints.find((ep) => ep.role.id === satisfiesRequirementRole);
    const target = reqEp?.target as { readonly kind?: unknown; readonly id?: unknown };
    if (target?.kind === "node" && typeof target.id === "string") {
      satisfiedRequirementIds.add(target.id);
    }
  }

  const nodeIdSet = new Set(nodeIds);
  const diagnostics: Diagnostic[] = [];
  for (const edge of graph.edges.values()) {
    if (edge.kind.id !== DECLARES_REQUIREMENT_EDGE_KIND.id) continue;
    const consumerEp = edge.endpoints.find((ep) => ep.role.id === consumerRole);
    const consumerTarget = consumerEp?.target as {
      readonly kind?: unknown;
      readonly id?: unknown;
      readonly name?: unknown;
    };
    if (consumerTarget?.kind !== "node" || typeof consumerTarget.id !== "string") continue;
    if (!nodeIdSet.has(consumerTarget.id)) continue;

    const reqEp = edge.endpoints.find((ep) => ep.role.id === requirementRole);
    const reqTarget = reqEp?.target as { readonly kind?: unknown; readonly id?: unknown };
    if (reqTarget?.kind !== "node" || typeof reqTarget.id !== "string") continue;
    if (satisfiedRequirementIds.has(reqTarget.id)) continue;

    diagnostics.push(
      defineDiagnostic(
        "ui-target:unbound-requirement",
        "error",
        `"${String(consumerTarget.name ?? consumerTarget.id)}" declares a requirement (${reqTarget.id}) with no satisfying provider; the Provider/Requirement graph must fully resolve before effect-atom-jsx lowering runs.`,
      ),
    );
  }
  return diagnostics;
};

/** Node ids (by name) for QUERY/ACTION nodes in the graph, for requirement scoping. */
const emittedFunctionNodeIds = (graph: KernelGraph): string[] => {
  const ids: string[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id === QUERY_NODE_KIND.id || node.kind.id === ACTION_NODE_KIND.id) {
      ids.push(node.id);
    }
  }
  return ids;
};

const generatedHeaderLines = (file: string, section: string): string[] => [
  "/**",
  ` * GENERATED by \`${EFFECT_ATOM_JSX_UI_PASS_NAME}\` — do not hand-edit.`,
  ` * Source: docs/revised2/ui-target-effect-atom-jsx.md ${section} (opsdesk slice, phase 1).`,
  " */",
  `// ${file}`,
];

interface EmitQuery {
  readonly name: string;
  readonly keyFamilyName?: string;
}

interface EmitInput {
  readonly keyFamilies: ReadonlyArray<{ readonly name: string }>;
  readonly queries: readonly EmitQuery[];
  readonly invalidationsByAction: readonly InvalidationEntry[];
}

/**
 * Extract the `KeyFamily` name a query's `reactivity.key` reads, when the
 * key expression is a plain `constant_key_expression` (the only shape the
 * opsdesk slice's `gen.func.query({ reactivity: { key } })` produces).
 * Non-constant key expressions (patterns, computed) are out of scope for
 * phase 1 — the query is still emitted, just without a `key:` option.
 */
const queryKeyFamilyName = (query: {
  readonly reactivity?: {
    readonly key?: { readonly kind?: string; readonly family?: { readonly name?: string } };
  };
}): string | undefined => {
  const key = query.reactivity?.key;
  if (key?.kind !== "constant_key_expression") return undefined;
  return key.family?.name;
};

const buildKeysArtifactContent = (input: EmitInput): string => {
  const lines: string[] = [...generatedHeaderLines("keys.ts", "§2.1")];
  lines.push("");
  lines.push(`import { Reactivity } from "${EFFECT_ATOM_JSX_PACKAGE}";`);
  lines.push("");
  for (const family of input.keyFamilies) {
    const { witnessName, exportName } = witnessNamesFromFamilyName(family.name);
    lines.push(`/** Reactivity key witness for the "${family.name}" key family. */`);
    lines.push(`export const ${exportName} = Reactivity.Key.family("${witnessName}");`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
};

const buildAtomsArtifactContent = (input: EmitInput): string => {
  const keyExportByFamilyName = new Map<string, string>();
  for (const family of input.keyFamilies) {
    keyExportByFamilyName.set(family.name, witnessNamesFromFamilyName(family.name).exportName);
  }

  const keyImports = [...keyExportByFamilyName.values()].sort();

  const lines: string[] = [...generatedHeaderLines("atoms.ts", "§2.3-2.4")];
  lines.push("");
  lines.push(`import { defineMutation, defineQuery } from "${EFFECT_ATOM_JSX_PACKAGE}";`);
  lines.push("");
  lines.push(`import { ${keyImports.join(", ")} } from "./keys.ts";`);
  lines.push("");
  lines.push(
    "// `IncidentApi` is the hand-authored service this slice's query/action bodies",
    "// lower to (matching the spec's §2.3/§2.4 examples). Gen2 does not yet generate",
    "// service implementations for query/action function bodies (Track F work); this",
    "// import is an assumed application-level seam, not a gen2 artifact.",
  );
  lines.push(`import { IncidentApi } from "./incident-api.ts";`);
  lines.push("");

  for (const query of input.queries) {
    const keyName = query.keyFamilyName;
    const exportName = keyName ? keyExportByFamilyName.get(keyName) : undefined;
    const keyOption = exportName ? `${exportName}.key` : undefined;
    lines.push(`export const ${query.name}Query = defineQuery(() => IncidentApi.listOpen(), {`);
    if (keyOption) lines.push(`  key: ${keyOption},`);
    lines.push(`  name: "${query.name}",`);
    lines.push(`});`);
    lines.push("");
  }

  for (const entry of input.invalidationsByAction) {
    const invalidates = entry.keyFamilyNames
      .map((n) => keyExportByFamilyName.get(n))
      .filter((n): n is string => Boolean(n))
      .map((n) => `${n}.key`);
    lines.push(
      "// Precision-loss note (docs/revised2/ui-target-effect-atom-jsx.md §7 open",
      "// question #1): this emits the conservative static family-root key, not a",
      "// `(result) => key.child(result.id)` resolver — see the",
      "// `ui-target:conservative-invalidation` diagnostic for this action.",
    );
    lines.push(`export const ${entry.actionName}Mutation = defineMutation(`);
    lines.push(`  (input) => IncidentApi.acknowledge(input),`);
    lines.push(`  {`);
    lines.push(`    name: "${entry.actionName}",`);
    if (invalidates.length === 1) {
      lines.push(`    invalidates: ${invalidates[0]},`);
    } else if (invalidates.length > 1) {
      lines.push(`    invalidates: [${invalidates.join(", ")}],`);
    }
    lines.push(`  },`);
    lines.push(`);`);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
};

/** Build the `keys.ts` / `atoms.ts` artifacts for the effect-atom-jsx UI target. */
const buildEffectAtomJsxArtifacts = (
  graph: KernelGraph,
): { readonly artifacts: readonly Artifact[]; readonly diagnostics: readonly Diagnostic[] } => {
  const keyFamilies = getKeyFamiliesFromGraph(graph);
  if (keyFamilies.length === 0) return { artifacts: [], diagnostics: [] };

  const queries: EmitQuery[] = getQueryFunctionsFromGraph(graph).map((q) => ({
    name: q.name,
    keyFamilyName: queryKeyFamilyName(q),
  }));
  const actions = getActionFunctionsFromGraph(graph);
  const invalidationsByAction = collectInvalidationsByAction(graph);

  const diagnostics: Diagnostic[] = [];
  diagnostics.push(...checkRedundantKeyEdges(invalidationsByAction));
  diagnostics.push(...checkUnboundRequirements(graph, emittedFunctionNodeIds(graph)));

  for (const entry of invalidationsByAction) {
    diagnostics.push(
      defineDiagnostic(
        "ui-target:conservative-invalidation",
        "info",
        `Action "${entry.actionName}" invalidates ${entry.keyFamilyNames.join(", ")} at family-root precision; no row-scoped child key is derivable from today's gen2 graph, so the emitted \`invalidates\` option is the conservative static form (docs/revised2/ui-target-effect-atom-jsx.md §7 open question #1).`,
      ),
    );
  }

  const emitInput: EmitInput = { keyFamilies, queries, invalidationsByAction };

  const generatedFrom = [
    ...keyFamilies.map((f) => ({
      id: `key:${f.name}` as KernelId,
      kind: "reactivity.keyFamily",
      context: f.name,
    })),
    ...actions.map((a) => ({
      id: `action:${a.name}` as KernelId,
      kind: "callable.action",
      context: a.name,
    })),
  ];

  const keysArtifact = defineArtifact("artifact:effect-atom-jsx:keys", {
    target: "typescript",
    kind: "artifact.ts.module",
    path: "generated/effect-atom-jsx/keys.ts",
    content: buildKeysArtifactContent(emitInput),
    generatedFrom,
    generatedBy: PASS_NODE_ID,
  });

  const atomsArtifact = defineArtifact("artifact:effect-atom-jsx:atoms", {
    target: "typescript",
    kind: "artifact.ts.module",
    path: "generated/effect-atom-jsx/atoms.ts",
    content: buildAtomsArtifactContent(emitInput),
    generatedFrom,
    generatedBy: PASS_NODE_ID,
  });

  return { artifacts: [keysArtifact, atomsArtifact], diagnostics };
};

/** Register the effect-atom-jsx UI-target phase-1 emit pass. */
export const registerEffectAtomJsxUiPass = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(EFFECT_ATOM_JSX_UI_PASS_NAME)) return;

  ctx.passRegistry.register(
    { name: EFFECT_ATOM_JSX_UI_PASS_NAME, phase: "legalize" },
    (graph): PassResult => {
      const { artifacts, diagnostics } = buildEffectAtomJsxArtifacts(graph);
      return {
        success: !diagnostics.some((d) => d.severity === "error"),
        diagnostics,
        artifacts,
      };
    },
  );
};
