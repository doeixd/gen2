/* @__NO_SIDE_EFFECTS__ */
/**
 * Magic-string diagnostics for milestone 9.
 *
 * Scans portable definitions for raw string references where typed refs or
 * stable IDs are now expected. Strings remain valid for external names —
 * display labels, DB table/column names, URL templates, cron expressions,
 * env vars, target filenames, OpenAPI operation IDs, CSS classes, and
 * explicitly branded stable IDs.
 *
 * Diagnostics are educational: each one names what to do instead.
 */

import type { GenContext } from "./context.ts";
import type { Config } from "./config.ts";
import { type Diagnostic, diagnostic } from "./diagnostics.ts";
import {
  IDENTITY_DIAGNOSTIC_CODES,
  renameHintSeverity,
  stableIdSeverity,
} from "./identity-policy.ts";
import type { Ref } from "./refs.ts";
import type { KernelGraph } from "../kernel/index.ts";
import type { Entity } from "../entity/entity.ts";
import { getKeyFamiliesFromGraph, getReactiveMutationsFromGraph } from "../reactivity/kernel.ts";
import { getActionFunctionsFromGraph } from "../function/kernel.ts";
import { getRefsFromGraph } from "./refs.ts";

/**
 * Categorises strings that the checker considers acceptable.
 *
 * - `stable_id`: branded persisted ID (already typed via `StableId<Kind>`)
 * - `display_name`: human-readable label, never used for identity
 * - `external_name`: physical/storage/protocol name (table, column, URL, env var, ...)
 * - `target_artifact`: filename or OpenAPI operation ID
 * - `internal_ref`: NOT acceptable — should be a typed ref instead
 */
export type StringDomain =
  | "stable_id"
  | "display_name"
  | "external_name"
  | "target_artifact"
  | "internal_ref";

/** A single magic-string finding. */
export interface MagicStringFinding {
  readonly severity: "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly suggestion?: string;
  readonly refs?: readonly Ref[];
}

/**
 * Graph-native magic-string scan. Walks `graph` for key families,
 * action functions, reactive mutations, and service refs; reads
 * identity policy from `config`; takes `entities` as an explicit
 * parameter because duplicate stable-ID detection needs the
 * source-side array (the graph dedups by node id and would suppress
 * the duplicate the check is trying to report).
 *
 * Conservative: each diagnostic fires only when a typed alternative is
 * unambiguous. Strings remain valid for external names, display labels,
 * and explicitly branded stable IDs.
 */
export const checkMagicStringsOnGraph = (
  graph: KernelGraph,
  config: Config,
  entities: readonly Entity[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const stableSeverity = stableIdSeverity(config.identity.stableIds);
  const renameSeverity = renameHintSeverity(config.identity.renameHints);

  if (stableSeverity !== null) {
    const refsByStableId = new Map<string, Ref[]>();
    const collectRef = (ref: Ref): void => {
      if (ref.id === undefined) return;
      const refs = refsByStableId.get(ref.id) ?? [];
      refs.push(ref);
      refsByStableId.set(ref.id, refs);
    };
    for (const entity of entities) {
      collectRef(entity.ref);
      for (const field of entity.fieldList) collectRef(field.ref);
    }
    for (const family of getKeyFamiliesFromGraph(graph)) collectRef(family.ref);

    for (const [id, refs] of refsByStableId.entries()) {
      if (refs.length <= 1) continue;
      out.push(
        diagnostic({
          severity: stableSeverity,
          code: IDENTITY_DIAGNOSTIC_CODES.DUPLICATE_STABLE_ID,
          message: `Stable ID "${id}" is used by ${refs.map((r) => `${r.kind}:${r.name}`).join(", ")}`,
          refs,
          suggestion: "Assign a unique stable ID to each persisted semantic ref.",
        }),
      );
    }
  }

  // Entities authored without stable IDs cannot participate in rename lineage.
  for (const entity of entities) {
    if (entity.id === undefined && stableSeverity !== null) {
      out.push(
        diagnostic({
          severity: stableSeverity,
          code: IDENTITY_DIAGNOSTIC_CODES.MISSING_STABLE_ID,
          message: `Entity ${entity.name} has no stable ID; renames will look like drop+add to the migration planner`,
          refs: [entity.ref],
          suggestion: `Pass id: core.entityId({ name: "${entity.name}" }) to defineEntity`,
        }),
      );
    }
    for (const field of entity.fieldList) {
      if (field.id === undefined && field.renamed_from.length > 0 && renameSeverity !== null) {
        out.push(
          diagnostic({
            severity: renameSeverity,
            code: IDENTITY_DIAGNOSTIC_CODES.RENAME_WITHOUT_STABLE_ID,
            message: `Field ${entity.name}.${field.name} declares renamedFrom ${JSON.stringify(field.renamed_from)} but has no stable ID; rename lineage cannot be tracked`,
            refs: [field.ref],
            suggestion: `Add an id: core.fieldId({ entity: "${entity.name}", name: "${field.name}" }) so the rename can be persisted`,
          }),
        );
      }
    }
  }

  // Key families authored without stable IDs.
  for (const family of getKeyFamiliesFromGraph(graph)) {
    if (family.id === undefined && stableSeverity !== null) {
      out.push(
        diagnostic({
          severity: stableSeverity,
          code: IDENTITY_DIAGNOSTIC_CODES.MISSING_STABLE_ID,
          message: `Key family ${family.name} has no stable ID; graph nodes derived from it use the family name as a fallback`,
          refs: [family.ref],
          suggestion: `Pass id: core.keyFamilyId({ name: "${family.name}" }) when defining the family`,
        }),
      );
    }
  }

  // Service requirements: when Requirement.kind is set but no ref is attached
  // and the kind matches a registered service name, suggest the typed form.
  const serviceNamesById = new Map<string, Ref>();
  for (const ref of getRefsFromGraph(graph)) {
    if (ref.kind === "ServiceRef" || ref.kind === "ContextRef") {
      serviceNamesById.set(ref.name, ref);
    }
  }
  for (const action of getActionFunctionsFromGraph(graph)) {
    for (const requirement of action.requirements ?? []) {
      if (requirement.ref !== undefined) continue;
      const candidate = serviceNamesById.get(requirement.kind);
      if (candidate !== undefined) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "ref:raw-string-reference",
            message: `Action ${action.name} declares requires: [{ kind: "${requirement.kind}" }] which matches a registered ${candidate.kind}`,
            refs: [candidate],
            suggestion: `Pass the typed ref directly: requires: [${requirement.kind}]`,
          }),
        );
      }
    }
  }

  // Reactive mutations with empty match objects suggest a missing payload typed ref.
  for (const mutation of getReactiveMutationsFromGraph(graph)) {
    for (const pattern of mutation.invalidates.patterns) {
      if (
        typeof pattern.match === "object" &&
        pattern.match !== null &&
        Object.keys(pattern.match).length === 0
      ) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "ref:raw-string-reference",
            message: `Mutation ${mutation.name} matches key family ${pattern.family.name} with an empty payload object; intended to match all keys?`,
            suggestion: `Use gen.key.any(${pattern.family.name}) for "match all" or supply a typed payload`,
          }),
        );
      }
    }
  }

  return out;
};

/**
 * Backwards-compatible alias. New callers should prefer
 * `checkMagicStringsOnGraph(graph, config)`.
 */
export const checkMagicStrings = (ctx: GenContext): readonly Diagnostic[] =>
  checkMagicStringsOnGraph(ctx.graph, ctx.config, ctx.entities);

/**
 * Classifies a string by its semantic domain. Useful for tooling that wants to
 * decide whether a string in a portable definition is suspicious.
 */
export const classifyStringDomain = (input: {
  readonly value: string;
  readonly purpose:
    | "stable_id"
    | "display_name"
    | "table_name"
    | "column_name"
    | "url_template"
    | "cron_expression"
    | "env_var"
    | "target_artifact"
    | "operation_id"
    | "css_class"
    | "internal_ref";
}): StringDomain => {
  switch (input.purpose) {
    case "stable_id":
      return "stable_id";
    case "display_name":
      return "display_name";
    case "table_name":
    case "column_name":
    case "url_template":
    case "cron_expression":
    case "env_var":
    case "css_class":
      return "external_name";
    case "target_artifact":
    case "operation_id":
      return "target_artifact";
    case "internal_ref":
      return "internal_ref";
  }
};
