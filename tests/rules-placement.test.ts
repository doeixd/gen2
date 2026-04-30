import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import { classifyRulePlacement } from "../src/rules/index.ts";

test("classifyRulePlacement returns inspectable RulePlacement IR", () => {
  const { gen } = createGen();
  const User = gen.entity(
    "User",
    { id: gen.types.uuid(), name: gen.types.string() },
    { store_name: "users" },
  );

  const rule = gen.rule.define({
    name: "isAlice",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.name, gen.types.string()),
      gen.rule.literal("Alice", gen.types.string()),
    ),
  });

  const placement = classifyRulePlacement(rule, User);

  expect(placement.kind).toBe("rule_placement");
  expect(placement.rule).toBe(rule);
  expect(placement.target_entity).toBe(User);
  expect(placement.selected).toBe("database_predicate");
  expect(placement.options.some((o) => o.placement === "rls")).toBe(true);
  expect(placement.options.some((o) => o.placement === "materialized_ivm")).toBe(true);
  expect(placement.options.some((o) => o.placement === "external_evaluator")).toBe(true);
});

test("gen.rule.classifyPlacement exposes RulePlacement IR", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() }, { store_name: "users" });
  const rule = gen.rule.define({
    name: "alwaysTrue",
    when: gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(1, gen.types.int())),
  });

  const placement = gen.rule.classifyPlacement(rule, User);

  expect(placement.kind).toBe("rule_placement");
  expect(placement.selected).toBe("database_predicate");
});

test("rule placement emits rules diagnostics without authz policy dependency", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const rule = gen.rule.define({
    name: "alwaysTrue",
    when: gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(1, gen.types.int())),
  });

  const placement = classifyRulePlacement(rule, User);

  const dbOption = placement.options.find((o) => o.placement === "database_predicate")!;
  expect(dbOption.diagnostics.some((d) => d.code === "rules:not-sql-translatable")).toBe(true);
});
