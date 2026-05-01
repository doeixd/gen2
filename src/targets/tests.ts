/* @__NO_SIDE_EFFECTS__ */
/**
 * Tests target fixture: emits structured test definitions from the obligation graph.
 *
 * Output is framework-agnostic JSON/TypeScript scaffolds, not Vitest-specific code.
 */

import type { GenContext } from "../core/index.ts";
import type { ObligationGraph, SemanticObligation } from "../obligations/index.ts";
import { deriveObligationGraph } from "../obligations/index.ts";

export interface TestCase {
  readonly name: string;
  readonly description: string;
  readonly obligation: string;
  readonly source_name: string;
  readonly priority: string;
  readonly suggested_path: string;
}

export interface TestSuite {
  readonly kind: "test_suite";
  readonly suite_name: string;
  readonly cases: readonly TestCase[];
}

const obligationToTestCase = (o: SemanticObligation): TestCase => ({
  name: `${o.source_name}_${o.obligation}`,
  description: o.description,
  obligation: o.obligation,
  source_name: o.source_name,
  priority: o.priority,
  suggested_path: o.affected_artifacts?.[0] ?? `tests/${o.obligation}/${o.source_name}.test.ts`,
});

export const generateTestSuites = (ctx: GenContext): readonly TestSuite[] => {
  const graph: ObligationGraph =
    ctx.obligation_graphs.length > 0 ? ctx.obligation_graphs[0]! : deriveObligationGraph(ctx);

  const byObligation = new Map<string, TestCase[]>();
  for (const o of graph.obligations) {
    const cases = byObligation.get(o.obligation) ?? [];
    cases.push(obligationToTestCase(o));
    byObligation.set(o.obligation, cases);
  }

  const suites: TestSuite[] = [];
  for (const [obligation, cases] of byObligation.entries()) {
    suites.push({
      kind: "test_suite",
      suite_name: obligation,
      cases,
    });
  }

  return suites;
};
