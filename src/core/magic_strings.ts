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
import { type Diagnostic, diagnostic } from "./diagnostics.ts";
import type { Ref } from "./refs.ts";

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
 * Scans a GenContext for likely raw-string references where typed refs are now
 * available. The checker is conservative: it only fires when a typed alternative
 * is unambiguous.
 */
export const checkMagicStrings = (ctx: GenContext): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // Entities authored without stable IDs cannot participate in rename lineage.
  for (const entity of ctx.entities) {
    if (entity.id === undefined) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "ref:missing-stable-id",
          message: `Entity ${entity.name} has no stable ID; renames will look like drop+add to the migration planner`,
          refs: [entity.ref],
          suggestion: `Pass id: core.entityId("entity.${entity.name.toLowerCase()}") to defineEntity`,
        }),
      );
    }
    for (const field of entity.fieldList) {
      if (field.id === undefined && field.renamed_from.length > 0) {
        out.push(
          diagnostic({
            severity: "error",
            code: "ref:rename-without-stable-id",
            message: `Field ${entity.name}.${field.name} declares renamedFrom ${JSON.stringify(field.renamed_from)} but has no stable ID; rename lineage cannot be tracked`,
            refs: [field.ref],
            suggestion: `Add an id: core.fieldId("field.${entity.name.toLowerCase()}.${field.name}") so the rename can be persisted`,
          }),
        );
      }
    }
  }

  // Key families authored without stable IDs.
  for (const family of ctx.key_families) {
    if (family.id === undefined) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "ref:missing-stable-id",
          message: `Key family ${family.name} has no stable ID; graph nodes derived from it use the family name as a fallback`,
          refs: [family.ref],
          suggestion: `Pass id: core.keyFamilyId("key.${family.name}") when defining the family`,
        }),
      );
    }
  }

  // Service requirements: when Requirement.kind is set but no ref is attached
  // and the kind matches a registered service name, suggest the typed form.
  const serviceNamesById = new Map<string, Ref>();
  for (const ref of ctx.refs) {
    if (ref.kind === "ServiceRef" || ref.kind === "ContextRef") {
      serviceNamesById.set(ref.name, ref);
    }
  }
  for (const action of ctx.action_functions) {
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
  for (const mutation of ctx.reactive_mutations) {
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
