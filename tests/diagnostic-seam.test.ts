import { test, expect } from "vite-plus/test";
import { createGen, lifecycle } from "../src/index.ts";
import { defineDiagnostic } from "../src/kernel/diagnostic.ts";

/**
 * Phase 2 Diagnostic shape unification (PLAN.md Track D-prefix).
 *
 * `core.Diagnostic` and `kernel.Diagnostic` were divergent: passes
 * produced the kernel shape (carrying `subject` / `subjectKind` /
 * `source` / `related`), the runner converted to the core shape, and
 * those fields were dropped at the seam. Phase 2 added the same
 * fields to `core.Diagnostic` and tightened the seam to preserve
 * them. This test pins that behavior.
 */
test("runner seam preserves subject/subjectKind/related/source from kernel diagnostics", () => {
  const { ctx } = createGen();

  // Register a pass that emits a kernel diagnostic with every optional
  // field populated. The seam should flow each one onto ctx.diagnostics.
  ctx.passRegistry.register({ name: "test.diagnostic-seam.fullPayload", phase: "derive" }, () => ({
    success: true,
    diagnostics: [
      defineDiagnostic("test:seam-check", "warning", "Carrying every field", {
        subject: "node:test:subject" as never,
        subjectKind: "test-subject-kind",
        related: [
          { id: "node:test:related" as never, kind: "related-kind", context: "test-context" },
        ],
        source: {
          start: { file: "a.ts", line: 10, column: 4 },
          end: { file: "a.ts", line: 10, column: 20 },
        },
      }),
    ],
  }));

  const result = lifecycle.check(ctx);
  const carried = result.diagnostics.find((d) => d.code === "test:seam-check");
  expect(carried).toBeDefined();
  expect(carried?.subject).toBe("node:test:subject");
  expect(carried?.subjectKind).toBe("test-subject-kind");
  expect(carried?.related).toEqual([
    { id: "node:test:related", kind: "related-kind", context: "test-context" },
  ]);
  expect(carried?.source?.start.line).toBe(10);
  expect(carried?.source?.end.column).toBe(20);
});

test("seam-preserved fields stay undefined when the pass does not set them", () => {
  const { ctx } = createGen();
  ctx.passRegistry.register({ name: "test.diagnostic-seam.minimal", phase: "derive" }, () => ({
    success: true,
    diagnostics: [defineDiagnostic("test:seam-minimal", "info", "Only basics")],
  }));

  const result = lifecycle.check(ctx);
  const carried = result.diagnostics.find((d) => d.code === "test:seam-minimal");
  expect(carried).toBeDefined();
  expect(carried?.subject).toBeUndefined();
  expect(carried?.subjectKind).toBeUndefined();
  expect(carried?.related).toBeUndefined();
  expect(carried?.source).toBeUndefined();
});
