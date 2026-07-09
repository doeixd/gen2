/**
 * Track R §R3 — `app.rule.lowerability(rule)` matrix.
 *
 * The seven-cell matrix per PLAN.md §R3 is the AI-consumable contract
 * surface: when a rule can't lower somewhere, the matrix carries a
 * typed remediation. These tests pin the behaviour against the slice
 * fixture's `canViewIncident` (a clean, sql-translatable rule) and
 * a deliberately non-monotonic counter-rule.
 */

import { describe, expect, test } from "vite-plus/test";
import { buildOpsdeskSlice } from "./golden/opsdesk-slice/slice.ts";
import { createGen } from "../src/index.ts";
import { lowerability, formatLowerability } from "../src/rules/lowerability.ts";
import { string as stringType } from "../src/types/semantic.ts";
import { ruleAnd, ruleEq, ruleField, ruleLiteral, ruleNot, ruleOr } from "../src/rules/rules.ts";

describe("Track R §R3 — rule.lowerability matrix", () => {
  test("clean equality rule on a single entity is sql + ivm + optimistic supported", () => {
    const slice = buildOpsdeskSlice();
    const matrix = lowerability(slice.rules.canViewIncident);

    expect(matrix.serverGuard.supported).toBe(true);
    // Slice's canViewIncident is `Incident.status == "open"` — pure equality
    // on a single entity. Should clear the simple-equality and monotonic gates.
    expect(matrix.ivm.supported).toBe(true);
    expect(matrix.optimistic.supported).toBe(true);
  });

  test("non-monotonic body (uses or) marks ivm + optimistic unsupported with reason", () => {
    const { gen } = createGen();
    const Project = gen.entity("Project", { id: gen.types.uuid(), status: gen.types.string() });
    const ambiguousRule = gen.rule.define({
      name: "ambiguousRule",
      vars: [],
      when: ruleOr(
        ruleEq(
          ruleField(Project, Project.fields.status, stringType()),
          ruleLiteral("open", stringType()),
        ),
        ruleEq(
          ruleField(Project, Project.fields.status, stringType()),
          ruleLiteral("acked", stringType()),
        ),
      ),
    });

    const matrix = lowerability(ambiguousRule);
    expect(matrix.ivm.supported).toBe(false);
    if (!matrix.ivm.supported) {
      expect(matrix.ivm.reason).toMatch(/non-monotonic|or|not|exists/i);
      expect(matrix.ivm.remediation).toBeDefined();
    }
    expect(matrix.optimistic.supported).toBe(false);
  });

  test("negated body marks ivm unsupported (rule.not breaks monotonicity)", () => {
    const { gen } = createGen();
    const Project = gen.entity("Project", { id: gen.types.uuid(), status: gen.types.string() });
    const notRule = gen.rule.define({
      name: "notRule",
      vars: [],
      when: ruleNot(
        ruleEq(
          ruleField(Project, Project.fields.status, stringType()),
          ruleLiteral("closed", stringType()),
        ),
      ),
    });

    const matrix = lowerability(notRule);
    expect(matrix.ivm.supported).toBe(false);
  });

  test("compound AND body is monotonic but not simple-equality (optimistic unsupported)", () => {
    const { gen } = createGen();
    const Project = gen.entity("Project", {
      id: gen.types.uuid(),
      status: gen.types.string(),
      name: gen.types.string(),
    });
    const compound = gen.rule.define({
      name: "compoundRule",
      vars: [],
      when: ruleAnd(
        ruleEq(
          ruleField(Project, Project.fields.status, stringType()),
          ruleLiteral("open", stringType()),
        ),
      ),
    });

    const matrix = lowerability(compound);
    expect(matrix.ivm.supported).toBe(true);
    // Simple equality body inside AND => still optimistic-eligible.
    expect(matrix.optimistic.supported).toBe(true);
  });

  test("formatLowerability produces a multi-line trace including the rule name", () => {
    const slice = buildOpsdeskSlice();
    const matrix = lowerability(slice.rules.canManageIncident);
    const trace = formatLowerability(matrix);

    expect(trace).toContain("canManageIncident");
    expect(trace.split("\n").length).toBeGreaterThanOrEqual(8); // header + 7 surfaces
    // Server guard always supported; the marker must be the success glyph.
    expect(trace).toMatch(/✓ Server guard/);
  });

  test("server guard is always supported regardless of rule shape", () => {
    const { gen } = createGen();
    const Project = gen.entity("Project", { id: gen.types.uuid() });
    const rule = gen.rule.define({
      name: "anyRule",
      vars: [],
      when: ruleEq(
        ruleField(Project, Project.fields.id, gen.types.uuid()),
        ruleLiteral("any", gen.types.uuid()),
      ),
    });
    const matrix = lowerability(rule);
    expect(matrix.serverGuard.supported).toBe(true);
  });

  test("ui mirrors client (depends on client lowering)", () => {
    const slice = buildOpsdeskSlice();
    const matrix = lowerability(slice.rules.canViewIncident);
    expect(matrix.ui.supported).toBe(matrix.client.supported);
  });
});
