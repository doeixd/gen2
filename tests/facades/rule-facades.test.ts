/**
 * Quick Win #7 (PLAN.md §7) — Rule constructor facade equivalence.
 *
 * Per PLAN.md §2.5, every major constructor must support multiple forms
 * that *all normalize to one canonical definition shape and one
 * graph-fragment lowering*. This test locks in equivalence for the
 * two `defineRule` forms that exist today (object and builder) so a
 * future refactor cannot quietly drift one path from the other.
 *
 * The `.class` and curried-name facades are Track K additions; once
 * they land this file gets two more assertions.
 */

import { expect, test } from "vite-plus/test";
import { defineRule, ruleEq, ruleLiteral, ruleVar } from "../../src/rules/rules.ts";
import type { RuleVarDecl } from "../../src/rules/rules.ts";
import { boolean } from "../../src/types/index.ts";
import { kernel } from "../../src/index.ts";
import type { AnyGraphStep } from "../../src/kernel/index.ts";

const serializeFragment = (fragment: AnyGraphStep): string => {
  const graph = kernel.graph.pipe(fragment);
  const nodes = [...graph.nodes.values()]
    .map((node) => ({
      id: node.id,
      kind: node.kind.id,
      name: node.name,
      traits: node.traits.map((t) => t.id).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...graph.edges.values()]
    .map((edge) => ({
      id: edge.id,
      kind: edge.kind.id,
      endpoints: edge.endpoints.map((endpoint) => ({
        role: endpoint.role.id,
        target: endpoint.target.id,
      })),
      traits: edge.traits.map((t) => t.id).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ nodes, edges }, null, 2);
};

test("rule object, builder, curried, and class facades produce byte-identical graph fragments", () => {
  // Predicate: actor == true. Trivial but enough to exercise both
  // construction paths through the same lowering.
  const vars: readonly RuleVarDecl[] = [{ name: "actor", semanticType: boolean() }];
  const when = ruleEq(ruleVar("actor", boolean()), ruleLiteral(true, boolean()));

  const byObject = defineRule({
    name: "trivialIsActor",
    vars,
    when,
  });

  const byBuilder = defineRule((r) =>
    r
      .name("trivialIsActor")
      .vars({ actor: boolean() })
      .when(({ var: v }) => ruleEq(v.actor, ruleLiteral(true, boolean()))),
  );
  const byCurried = defineRule("trivialIsActor")({ vars, when });
  class RuleClass extends defineRule.class({ name: "trivialIsActor", vars, when }) {}

  expect(byBuilder.name).toBe(byObject.name);
  expect(byBuilder.vars.length).toBe(byObject.vars.length);
  expect(serializeFragment(byBuilder.fragment)).toBe(serializeFragment(byObject.fragment));
  expect(serializeFragment(byCurried.fragment)).toBe(serializeFragment(byObject.fragment));
  expect(serializeFragment(RuleClass.fragment)).toBe(serializeFragment(byObject.fragment));
});
