import { describe, expect, test } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import { check } from "../src/lifecycle/lifecycle.ts";
import { defineRule, ruleEq, ruleLiteral, ruleVar } from "../src/rules/rules.ts";
import { buildActionInsert, defineActionFunction } from "../src/function/function.ts";
import { defineEntity } from "../src/entity/entity.ts";
import { string as stringType, uuid as uuidType } from "../src/types/semantic.ts";

describe("reactions", () => {
  const User = defineEntity("User", {
    id: uuidType(),
    name: stringType(),
  });

  const createUserAction = defineActionFunction({
    name: "createUser",
    input_type: User,
    returns: User,
    body: buildActionInsert(User, []),
  });

  const userIsAdmin = defineRule({
    name: "userIsAdmin",
    vars: [ruleVar("userId", stringType())],
    when: ruleEq(ruleVar("userId", stringType()), ruleLiteral("admin", stringType())),
  });

  test("defineReaction creates a reaction record", () => {
    const { gen } = createGen();
    const reaction = gen.reaction.define({
      name: "notifyAdmin",
      when: userIsAdmin,
      run: createUserAction,
      mode: "on_true",
      idempotency: { key: "input_hash" },
      delivery: { kind: "outbox" },
    });

    expect(reaction.kind).toBe("reaction");
    expect(reaction.name).toBe("notifyAdmin");
    expect(reaction.when).toBe(userIsAdmin);
    expect(reaction.run).toBe(createUserAction);
    expect(reaction.mode).toBe("on_true");
    expect(reaction.idempotency).toEqual({ key: "input_hash" });
    expect(reaction.delivery).toEqual({ kind: "outbox" });
  });

  test("reaction is registered in context", () => {
    const { ctx, gen } = createGen();
    const reaction = gen.reaction.define({
      name: "notifyAdmin",
      when: userIsAdmin,
      run: createUserAction,
      mode: "on_true",
      idempotency: { key: "input_hash" },
      delivery: { kind: "outbox" },
    });

    expect(ctx.reactions).toContain(reaction);
  });

  test("checkReactions emits duplicate-name diagnostic", () => {
    const { ctx, gen } = createGen();
    gen.reaction.define({
      name: "notifyAdmin",
      when: userIsAdmin,
      run: createUserAction,
      mode: "on_true",
      idempotency: { key: "input_hash" },
      delivery: { kind: "outbox" },
    });
    gen.reaction.define({
      name: "notifyAdmin",
      when: userIsAdmin,
      run: createUserAction,
      mode: "on_transition_true",
      idempotency: { key: "input_hash" },
      delivery: { kind: "outbox" },
    });

    const result = check(ctx);
    const dup = result.diagnostics.find((d) => d.code === "reaction:duplicate-name");
    expect(dup).toBeDefined();
    expect(dup!.message).toContain('"notifyAdmin"');
  });

  test("checkReactions emits condition-not-boolean for non-boolean rule body", () => {
    const { ctx, gen } = createGen();
    const badRule = defineRule({
      name: "badRule",
      vars: [],
      when: ruleLiteral("not-boolean", stringType()) as unknown as ReturnType<
        typeof defineRule
      >["body"],
    });

    gen.reaction.define({
      name: "badReaction",
      when: badRule,
      run: createUserAction,
      mode: "on_true",
    });

    const result = check(ctx);
    const diag = result.diagnostics.find((d) => d.code === "reaction:condition-not-boolean");
    expect(diag).toBeDefined();
  });

  test("checkReactions emits run-not-action for non-action run", () => {
    const { ctx, gen } = createGen();
    const fakeAction = {
      name: "fake",
      body: { phase: "query" },
    } as unknown as typeof createUserAction;

    gen.reaction.define({
      name: "badReaction",
      when: userIsAdmin,
      run: fakeAction,
      mode: "on_true",
    });

    const result = check(ctx);
    const diag = result.diagnostics.find((d) => d.code === "reaction:run-not-action");
    expect(diag).toBeDefined();
  });

  test("checkReactions warns on missing idempotency for side-effect modes", () => {
    const { ctx, gen } = createGen();
    gen.reaction.define({
      name: "noIdempotency",
      when: userIsAdmin,
      run: createUserAction,
      mode: "on_true",
    });

    const result = check(ctx);
    const diag = result.diagnostics.find((d) => d.code === "reaction:missing-idempotency-key");
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("warning");
  });

  test("checkReactions does not warn on missing idempotency for maintain mode", () => {
    const { ctx, gen } = createGen();
    gen.reaction.define({
      name: "maintainView",
      when: userIsAdmin,
      run: createUserAction,
      mode: "maintain",
    });

    const result = check(ctx);
    const diag = result.diagnostics.find((d) => d.code === "reaction:missing-idempotency-key");
    expect(diag).toBeUndefined();
  });

  test("checkReactions warns on missing delivery plan for side-effect modes", () => {
    const { ctx, gen } = createGen();
    gen.reaction.define({
      name: "noDelivery",
      when: userIsAdmin,
      run: createUserAction,
      mode: "on_transition_true",
      idempotency: { key: "auto" },
    });

    const result = check(ctx);
    const diag = result.diagnostics.find(
      (d) => d.code === "reaction:side-effect-without-delivery-plan",
    );
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("warning");
  });

  test("checkReactions does not warn on missing delivery for maintain mode", () => {
    const { ctx, gen } = createGen();
    gen.reaction.define({
      name: "maintainView2",
      when: userIsAdmin,
      run: createUserAction,
      mode: "maintain",
    });

    const result = check(ctx);
    const diag = result.diagnostics.find(
      (d) => d.code === "reaction:side-effect-without-delivery-plan",
    );
    expect(diag).toBeUndefined();
  });

  test("valid reaction passes check without errors", () => {
    const { ctx, gen } = createGen();
    gen.reaction.define({
      name: "validReaction",
      when: userIsAdmin,
      run: createUserAction,
      mode: "on_true",
      idempotency: { key: "input_hash" },
      delivery: { kind: "job_queue" },
    });

    const result = check(ctx);
    const reactionErrors = result.diagnostics.filter((d) => d.code.startsWith("reaction:"));
    expect(reactionErrors).toHaveLength(0);
  });
});
