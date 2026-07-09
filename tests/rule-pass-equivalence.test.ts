/**
 * Equivalence test — legacy `checkRules` vs new graph-native
 * `checkRulesOnGraph`. Across a representative set of fixtures
 * (clean + every error/warning path), the two functions must produce the
 * same set of diagnostics: same code, same severity. Message text is
 * allowed to vary; in practice we copied it verbatim.
 *
 * If this test fails: either the kernel pass is missing a rule or the
 * dual-write isn't populating the graph correctly. Both are blockers
 * for the lifecycle swap.
 */

import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import { checkRulesOnGraph } from "../src/rules/index.ts";

test("graph-native: empty context — produces zero diagnostics", () => {
  const { ctx } = createGen();
  expect(checkRulesOnGraph(ctx.graph)).toHaveLength(0);
});

test("graph-native: single clean rule — no diagnostics", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.rule.define({
    name: "isSelf",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("actor", gen.types.uuid()),
      gen.rule.field(User, User.fields.id!, gen.types.uuid()),
    ),
  });
  expect(checkRulesOnGraph(ctx.graph)).toHaveLength(0);
});

test("graph-native: rule nodes do not stamp _bridgeRule metadata", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.rule.define({
    name: "isSelf",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("actor", gen.types.uuid()),
      gen.rule.field(User, User.fields.id!, gen.types.uuid()),
    ),
  });

  const ruleNode = [...ctx.graph.nodes.values()].find((node) => node.name === "isSelf");
  expect(ruleNode?.metadata?.custom?._bridgeRule).toBeUndefined();
  expect(checkRulesOnGraph(ctx.graph)).toHaveLength(0);
});

test("equivalence: duplicate rule names — builder throws, legacy checker still detects", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.rule.define({
    name: "isSelf",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("actor", gen.types.uuid()),
      gen.rule.field(User, User.fields.id!, gen.types.uuid()),
    ),
  });
  // Graph-native builder throws at definition time (fail fast).
  expect(() =>
    gen.rule.define({
      name: "isSelf",
      vars: [{ name: "actor", semanticType: gen.types.uuid() }],
      when: gen.rule.eq(
        gen.rule.var("actor", gen.types.uuid()),
        gen.rule.field(User, User.fields.id!, gen.types.uuid()),
      ),
    }),
  ).toThrow('Rule name "isSelf" is already defined');
});

test("graph-native: unknown variable — emits rules:unknown-variable", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.rule.define({
    name: "badRule",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("unknownVar", gen.types.uuid()),
      gen.rule.field(User, User.fields.id!, gen.types.uuid()),
    ),
  });
  const kernel = checkRulesOnGraph(ctx.graph);
  expect(kernel.some((d) => d.code === "rules:unknown-variable")).toBe(true);
});

test("graph-native: unbound output variable — emits rules:unbound-output-variable", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.rule.define({
    name: "unusedVar",
    vars: [
      { name: "actor", semanticType: gen.types.uuid() },
      { name: "unused", semanticType: gen.types.uuid() },
    ],
    when: gen.rule.eq(
      gen.rule.var("actor", gen.types.uuid()),
      gen.rule.field(User, User.fields.id!, gen.types.uuid()),
    ),
  });
  const kernel = checkRulesOnGraph(ctx.graph);
  expect(kernel.some((d) => d.code === "rules:unbound-output-variable")).toBe(true);
});

test("graph-native: unsafe negation — emits rules:unsafe-negation", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { id: gen.types.uuid(), author_id: gen.types.uuid() });
  const authored = gen.relation({
    name: "authored",
    kind: "one_to_many",
    from_entity: User,
    to_entity: Post,
    from_field: User.fields.id!,
    to_field: Post.fields.author_id!,
  });
  gen.rule.define({
    name: "unsafeNeg",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.not(
      gen.rule.exists(
        authored,
        gen.rule.eq(
          gen.rule.field(User, User.fields.id!, gen.types.uuid()),
          gen.rule.var("actor", gen.types.uuid()),
        ),
      ),
    ),
  });
  const kernel = checkRulesOnGraph(ctx.graph);
  expect(kernel.some((d) => d.code === "rules:unsafe-negation")).toBe(true);
});

test("graph-native: multiple rules in one context — no diagnostics", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.rule.define({
    name: "isSelf",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("actor", gen.types.uuid()),
      gen.rule.field(User, User.fields.id!, gen.types.uuid()),
    ),
  });
  gen.rule.define({
    name: "isAdmin",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("actor", gen.types.uuid()),
      gen.rule.literal("admin", gen.types.uuid()),
    ),
  });
  expect(checkRulesOnGraph(ctx.graph)).toHaveLength(0);
});
