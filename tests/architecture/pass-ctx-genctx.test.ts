/**
 * Architecture lint — fence `passCtx.options.genContext` reads to bridge files.
 *
 * Why: the lifecycle bridge (`src/lifecycle/lifecycle.ts`) wraps ~60 legacy
 * `GenContext`-array checkers via `ctxCheckerToPass`, which threads
 * `passCtx.options.genContext as GenContext`. That is acceptable as a
 * transition shim, but new dialect-owned passes must not adopt the same
 * pattern — they should query `ctx.graph` (or graph views) directly.
 *
 * Track E (PLAN.md §3) splits the lifecycle file into a runner plus
 * explicit `*bridge*` files; only the bridge files are allowed to read
 * `passCtx.options.genContext`. Once Track E lands, the deny-list below
 * should narrow to just `src/lifecycle/runner.ts` and the bridge files.
 *
 * If this test fails:
 *   - You added a new pass that reads `passCtx.options.genContext` from a
 *     non-bridge file. Don't. Read `ctx.graph` instead, and add a
 *     graph-native reader for any legacy fact you need.
 *   - You renamed a bridge file. Update `BRIDGE_FILES` below.
 *
 * Quick Win #4 (PLAN.md §7).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import { expect, test } from "vite-plus/test";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../../src");

/**
 * Files that are allowed to read `passCtx.options.genContext`. These are
 * the bridge runners that knowingly thread the legacy `GenContext` through
 * pass execution. New entries require a deliberate decision and should
 * include a comment explaining the bridge role.
 *
 * As Track E ports each legacy checker to a dialect-owned pass, those
 * uses move out of `lifecycle.ts` and the deny-list shrinks.
 */
const BRIDGE_FILES: readonly string[] = [
  // Track E split lifecycle.ts into runner + *-bridge files. The
  // legacy-check-bridge hosts the ~60 ctxCheckerToPass-wrapped specs;
  // the target-bridge hosts the bridge lower/emit passes. Both
  // legitimately read `passCtx.options.genContext` because they are
  // bridges. As Track E ports each spec to a dialect-owned pass, the
  // reads in legacy-check-bridge.ts shrink toward zero.
  "src/lifecycle/legacy-check-bridge.ts",
  "src/lifecycle/target-bridge.ts",

  // Relational adapter's lower/emit passes still consume legacy `Store`
  // inputs from `GenContext`. Track F migrates these to consume
  // legalized `dialect.postgres` target IR; until then this is a
  // permitted bridge.
  "src/adapters/relational.ts",
];

const PATTERN = /passCtx\.options(?:\.|\?\.|\[['"])\s*genContext/;

/**
 * Strip JS-style comments (// line, /* block) so the architecture
 * regex doesn't false-match on docstrings that *describe* the bridge
 * pattern.
 */
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, (_match, prefix: string) => prefix);

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

test("only bridge files may read passCtx.options.genContext", () => {
  const offenders: string[] = [];

  for (const filePath of walk(srcRoot)) {
    const repoRel = toRepoRel(filePath);
    if (BRIDGE_FILES.includes(repoRel)) continue;

    const source = stripComments(readFileSync(filePath, "utf8"));
    if (PATTERN.test(source)) offenders.push(repoRel);
  }

  expect(
    offenders,
    `Non-bridge files reading passCtx.options.genContext: ${offenders.join(", ")}. ` +
      `Either move the read to a *-bridge.ts file in src/lifecycle/, or (preferred) ` +
      `port the pass to read ctx.graph via dialect views. See PLAN.md Track E.`,
  ).toEqual([]);
});

test("BRIDGE_FILES allow-list still actually contains the pattern (no rot)", () => {
  // If a bridge file no longer contains the pattern, it should be removed
  // from the allow-list. This keeps the list honest as Track E progresses.
  for (const repoRel of BRIDGE_FILES) {
    const filePath = resolve(here, "../..", repoRel);
    const source = stripComments(readFileSync(filePath, "utf8"));
    expect(
      PATTERN.test(source),
      `${repoRel} no longer reads passCtx.options.genContext; ` +
        `remove it from BRIDGE_FILES in this test.`,
    ).toBe(true);
  }
});
