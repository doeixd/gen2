/**
 * Architecture lint — fence kernel bridge-mutation helpers.
 *
 * `attachNode`, `attachEdge`, `attachNodes`, `attachEdges`, and
 * `attachExpr` (`src/kernel/bridge.ts`) cast `ReadonlyMap` to `Map` and
 * mutate kernel graphs in place. They were created as a transition shim
 * during the kernel rebase so legacy builders could push facts into
 * `ctx.graph` without rewriting every call site.
 *
 * Per PLAN.md §7 quick win #3, these helpers should be reachable only
 * from a small allow-list of bridge files. New code must use the
 * immutable `register*` functions (or, once Track A's `kernel.graph.build`
 * writer ships, the scoped writer API).
 *
 * If this test fails:
 *   - You imported `attachNode`/`attachEdge` from a non-allowed file.
 *     Use `registerNode`/`registerEdge` (immutable) instead, or, when
 *     dealing with a pure migration adapter, add the file to
 *     `BRIDGE_FILES` with a comment explaining why and a Track-link.
 *
 * Quick Win #3 (PLAN.md §7).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import { expect, test } from "vite-plus/test";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../../src");

/**
 * Files allowed to import the bridge mutation helpers. Adding to this
 * list is a deliberate decision; each entry should explain the bridge
 * role and, ideally, the track that will retire it.
 *
 * As Track E (lifecycle split), Track F (target legalization), and
 * Track A (graph writer) land, entries move out of this list.
 */
const BRIDGE_FILES: readonly string[] = [
  // The helpers themselves.
  "src/kernel/bridge.ts",

  // The future writer API will be implemented here. Mutation is the
  // implementation, not the public surface.
  "src/kernel/builder.ts",

  // Track E split lifecycle.ts into focused bridge files. The
  // target-bridge owns the bridge lower/emit passes that touch the
  // graph (`attachNode` for legalize-input edges, etc.). lifecycle.ts
  // itself is now a thin re-export and no longer touches the graph.
  "src/lifecycle/target-bridge.ts",

  // GenContext binders dual-write to ctx.graph during the migration —
  // see PLAN.md G9 / Track J. Will retire once each builder family
  // lowers directly to graph fragments.
  "src/core/context.ts",

  // Contract kernel adapter and node lowering — both translate legacy
  // typed witnesses into kernel facts. Bridge code by construction.
  "src/core/contract-kernel.ts",
  "src/core/node-lowering.ts",

  // Relational adapter — see Track F (target legalization).
  "src/adapters/relational.ts",
];

const BRIDGE_HELPERS = ["attachNode", "attachEdge", "attachNodes", "attachEdges", "attachExpr"];
// Match an import statement that pulls any of the bridge helpers from
// either `kernel/bridge`, `kernel/index`, `./bridge` (when inside the
// kernel directory itself), or the package re-export.
const IMPORT_PATTERN = new RegExp(
  String.raw`import\s*\{[^}]*\b(${BRIDGE_HELPERS.join("|")})\b[^}]*\}\s*from\s+['"][^'"]*(?:kernel/(?:bridge|index)|\.\/bridge|\.\.\/bridge)`,
);

const walk = (dir: string, out: string[] = []): readonly string[] => {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const s = statSync(fullPath);
    if (s.isDirectory()) walk(fullPath, out);
    else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) out.push(fullPath);
  }
  return out;
};

const toRepoRel = (abs: string): string =>
  relative(resolve(here, "../.."), abs).split(sep).join("/");

test("only bridge files may import attachNode / attachEdge / attachExpr", () => {
  const offenders: string[] = [];

  for (const filePath of walk(srcRoot)) {
    const repoRel = toRepoRel(filePath);
    if (BRIDGE_FILES.includes(repoRel)) continue;

    const source = readFileSync(filePath, "utf8");
    if (IMPORT_PATTERN.test(source)) offenders.push(repoRel);
  }

  expect(
    offenders,
    `Non-bridge files importing attachNode/attachEdge/attachExpr: ${offenders.join(", ")}. ` +
      `Use registerNode/registerEdge (immutable) instead, or — if this is a pure migration ` +
      `adapter — add the file to BRIDGE_FILES with a comment. See PLAN.md Track A / Track E.`,
  ).toEqual([]);
});

test("BRIDGE_FILES allow-list contains no rot (every entry still imports a helper)", () => {
  for (const repoRel of BRIDGE_FILES) {
    if (repoRel === "src/kernel/bridge.ts") continue; // the helpers' home

    const filePath = resolve(here, "../..", repoRel);
    const source = readFileSync(filePath, "utf8");
    expect(
      IMPORT_PATTERN.test(source),
      `${repoRel} no longer imports any bridge helper; remove it from BRIDGE_FILES.`,
    ).toBe(true);
  }
});
