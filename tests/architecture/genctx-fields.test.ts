/**
 * Architecture lint — guard against new top-level semantic arrays on `GenContext`.
 *
 * Why: the kernel rebase (see docs/revised-kernel.md and
 * docs/revision/revised_phases.md) is migrating semantic state into
 * `ctx.graph: KernelGraph`. Adding new `readonly <name>: X[]` fields to
 * `GenContext` regresses that direction and is forbidden by the migration
 * rules in AGENTS.md §"Kernel rebase migration".
 *
 * If this test fails:
 *   - You added a new array field to `GenContext`. Don't. Put the new state
 *     in `ctx.graph` via kernel nodes/edges/traits.
 *   - You renamed an existing field. Update the baseline below.
 *   - You removed an existing field. Update the baseline below — that is
 *     the desired migration direction.
 *
 * The baseline is intentionally exhaustive (a snapshot of the legacy fields
 * that exist today) rather than minimal, so that *removals* also need an
 * explicit baseline edit. That way the deletion phase (R13) lands in
 * deliberate, reviewable chunks.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const here = dirname(fileURLToPath(import.meta.url));
const contextPath = resolve(here, "../../src/core/context.ts");

/**
 * Extracts the set of `readonly <name>: ...[]` field names declared inside
 * the `GenContext` interface body. Stops at the closing brace of the
 * interface to avoid picking up unrelated declarations later in the file.
 */
const extractGenContextArrayFields = (source: string): readonly string[] => {
  const start = source.indexOf("export interface GenContext");
  if (start === -1) throw new Error("Could not locate `export interface GenContext` in context.ts");

  // Walk balanced braces from the first `{` after the interface header.
  const openIdx = source.indexOf("{", start);
  if (openIdx === -1) throw new Error("Could not locate opening brace of GenContext interface");

  let depth = 0;
  let endIdx = -1;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) throw new Error("Could not locate closing brace of GenContext interface");

  const body = source.slice(openIdx + 1, endIdx);
  const fields: string[] = [];

  // Match: optional whitespace, `readonly`, name, `:`, ..., `[]` or `[];`
  // on the same logical line. Multi-line types are uncommon for arrays here.
  const lineRegex = /^\s*readonly\s+(\w+)\s*:\s*([^;]*?)\s*;?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(body)) !== null) {
    const name = m[1]!;
    const type = m[2]!;
    // Treat as an array field if the type ends with `[]` or the type is
    // `ReadonlyArray<...>` / `Array<...>`.
    if (/\]\s*$/.test(type) || /^\s*(?:Readonly)?Array\s*</.test(type)) {
      fields.push(name);
    }
  }
  return fields.sort();
};

/**
 * Baseline: every `readonly <name>: X[]` field on `GenContext` as of the start
 * of the kernel rebase. Adding to this list requires explicit review and
 * should only happen if a field is being **removed** as part of an R-phase
 * migration. New semantic state belongs in `ctx.graph`, not here.
 */
const BASELINE_GENCTX_ARRAY_FIELDS: readonly string[] = [
  "app_routes",
  "artifacts",
  "behaviors",
  "boundary_plans",
  "components",
  "composable_plans",
  "context_provisions",
  "context_requirements",
  "contexts",
  "cron_jobs",
  "cross_store_planners",
  "cruds",
  "defaults",
  "derived_resources",
  "diagnostics",
  "editors",
  "entities",
  "expr_functions",
  "forms",
  "getters",
  "graphs",
  "lifecycle_requirements",
  "lists",
  "mappings",
  "mutators",
  "obligation_graphs",
  "offline_commands",
  "offline_queues",
  "patch_functions",
  "plan_functions",
  "platforms",
  "plugins",
  "policies",
  "predicate_functions",
  "projections",
  "providers",
  "queries",
  "reactive_mutations",
  "reactive_registries",
  "reactive_resources",
  "reactive_runtimes",
  "relation_entities",
  "relations",
  "renderers",
  "requirements",
  "resource_alls",
  "resource_chains",
  "resources",
  "routes",
  "schedules",
  "schemas",
  "scoped_resources",
  "serializers",
  "service_layers",
  "services",
  "state_resources",
  "storage_locations",
  "stores",
  "styles",
  "static_functions",
  "tables",
  "columns",
  "targets",
  "themes",
  "tracking_scopes",
  "trait_applications",
  "runtimes",
  "views",
  "workflows",
].sort();

test("architecture: GenContext array fields are frozen at the kernel-rebase baseline", () => {
  const source = readFileSync(contextPath, "utf8");
  const actual = extractGenContextArrayFields(source);
  const baseline = BASELINE_GENCTX_ARRAY_FIELDS;

  const added = actual.filter((name) => !baseline.includes(name));
  const removed = baseline.filter((name) => !actual.includes(name));

  if (added.length > 0 || removed.length > 0) {
    const messageLines = [
      "GenContext array fields drifted from the kernel-rebase baseline.",
      "",
      'See docs/revised-kernel.md and AGENTS.md §"Kernel rebase migration".',
      "",
    ];
    if (added.length > 0) {
      messageLines.push("Added (forbidden — put new semantic state in ctx.graph):");
      for (const name of added) messageLines.push(`  + ${name}`);
      messageLines.push("");
    }
    if (removed.length > 0) {
      messageLines.push(
        "Removed (allowed — but update BASELINE_GENCTX_ARRAY_FIELDS in this test):",
      );
      for (const name of removed) messageLines.push(`  - ${name}`);
      messageLines.push("");
    }
    throw new Error(messageLines.join("\n"));
  }

  expect(actual).toEqual(baseline);
});
