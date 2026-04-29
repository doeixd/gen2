import { expect, test } from "vite-plus/test";
import { createGen, lifecycle } from "../src/index.ts";

test("reaction builder creates reaction with all fields", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const rule = gen.rule.define({
    name: "userChanged",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  const action = gen.func.action({
    name: "notifyUser",
    input_type: gen.types.uuid(),
    returns: gen.types.uuid(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
  });

  const reaction = gen.reaction.define((r) =>
    r
      .name("onUserChanged")
      .when(rule)
      .run(action)
      .mode("on_true")
      .idempotency({ key: "auto" })
      .delivery({ kind: "outbox" })
      .build(),
  );

  expect(reaction.kind).toBe("reaction");
  expect(reaction.name).toBe("onUserChanged");
  expect(reaction.when).toBe(rule);
  expect(reaction.run).toBe(action);
  expect(reaction.mode).toBe("on_true");
  expect(reaction.idempotency).toEqual({ key: "auto" });
  expect(reaction.delivery).toEqual({ kind: "outbox" });
  expect(ctx.reactions).toContain(reaction);
});

test("reaction builder supports optional select", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

  const rule = gen.rule.define({
    name: "userChanged",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.name, gen.types.string()),
      gen.rule.literal("admin", gen.types.string()),
    ),
  });

  const action = gen.func.action({
    name: "notifyUser",
    input_type: gen.types.uuid(),
    returns: gen.types.uuid(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
  });

  const selectFn = gen.func.expr({
    name: "selectUserId",
    input_type: User,
    output_type: gen.types.uuid(),
    body: gen.expr.field(User.fields.id),
  });

  const reaction = gen.reaction.define((r) =>
    r
      .name("onUserChanged")
      .when(rule)
      .select(selectFn)
      .run(action)
      .mode("on_true")
      .idempotency({ key: "auto" })
      .delivery({ kind: "outbox" })
      .build(),
  );

  expect(reaction.select).toBeDefined();
  expect(reaction.name).toBe("onUserChanged");
});

test("reaction builder throws without name", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const rule = gen.rule.define({
    name: "userChanged",
    when: gen.rule.literal(true, gen.types.boolean()) as any,
  });
  const action = gen.func.action({
    name: "notifyUser",
    input_type: gen.types.uuid(),
    returns: gen.types.uuid(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
  });

  expect(() =>
    gen.reaction.define((r) =>
      r.when(rule).run(action).mode("on_true").idempotency({ key: "auto" }).build(),
    ),
  ).toThrow("reaction builder: .name() must be called before .build()");
});

test("reaction builder throws without when", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const action = gen.func.action({
    name: "notifyUser",
    input_type: gen.types.uuid(),
    returns: gen.types.uuid(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
  });

  expect(() =>
    gen.reaction.define((r) =>
      r.name("onUserChanged").run(action).mode("on_true").idempotency({ key: "auto" }).build(),
    ),
  ).toThrow("reaction builder: .when() must be called before .build()");
});

test("reaction builder throws without run", () => {
  const { gen } = createGen();
  const rule = gen.rule.define({
    name: "userChanged",
    when: gen.rule.literal(true, gen.types.boolean()) as any,
  });

  expect(() =>
    gen.reaction.define((r) =>
      r.name("onUserChanged").when(rule).mode("on_true").idempotency({ key: "auto" }).build(),
    ),
  ).toThrow("reaction builder: .run() must be called before .build()");
});

test("reaction builder throws without mode", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const rule = gen.rule.define({
    name: "userChanged",
    when: gen.rule.literal(true, gen.types.boolean()) as any,
  });
  const action = gen.func.action({
    name: "notifyUser",
    input_type: gen.types.uuid(),
    returns: gen.types.uuid(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
  });

  expect(() =>
    gen.reaction.define((r) =>
      r.name("onUserChanged").when(rule).run(action).idempotency({ key: "auto" }).build(),
    ),
  ).toThrow("reaction builder: .mode() must be called before .build()");
});

test("reaction builder integrates with lifecycle checks", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const rule = gen.rule.define({
    name: "userChanged",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  const action = gen.func.action({
    name: "notifyUser",
    input_type: gen.types.uuid(),
    returns: gen.types.uuid(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
  });

  gen.reaction.define((r) =>
    r.name("dup").when(rule).run(action).mode("on_true").idempotency({ key: "auto" }).build(),
  );
  gen.reaction.define((r) =>
    r
      .name("dup")
      .when(rule)
      .run(action)
      .mode("on_transition_true")
      .idempotency({ key: "auto" })
      .build(),
  );

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "reaction:duplicate-name")).toBe(true);
});

test("reaction builder preserves backward compatibility with object form", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const rule = gen.rule.define({
    name: "userChanged",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  const action = gen.func.action({
    name: "notifyUser",
    input_type: gen.types.uuid(),
    returns: gen.types.uuid(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
  });

  const reaction = gen.reaction.define({
    name: "legacy",
    when: rule,
    run: action,
    mode: "on_true",
    idempotency: { key: "auto" },
    delivery: { kind: "outbox" },
  });

  expect(reaction.kind).toBe("reaction");
  expect(reaction.name).toBe("legacy");
  expect(ctx.reactions).toContain(reaction);
});
