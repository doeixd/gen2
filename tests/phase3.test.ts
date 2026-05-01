import { describe, expect, test } from "vite-plus/test";
import { createGen, fn } from "../src/index.ts";
import { isSensitivePlacementUnsafe } from "../src/storage/locations.ts";

describe("Phase 3 Milestones", () => {
  // ARCH1: Open Trait-Based Composition
  test("gen.plan.sequence and gen.plan.parallel are available", () => {
    const { gen } = createGen();
    const node1 = gen.node.define({ kind: "test", name: "a", traits: ["callable"] });
    const node2 = gen.node.define({ kind: "test", name: "b", traits: ["effectful"] });

    const seq = gen.plan.sequence([node1, node2]);
    expect(seq.kind).toBe("sequence_plan");
    expect(seq.steps).toHaveLength(2);

    const par = gen.plan.parallel([node1, node2]);
    expect(par.kind).toBe("parallel_plan");
    expect(par.branches).toHaveLength(2);
  });

  test("gen.plan.fallback creates fallback plan node", () => {
    const { gen } = createGen();
    const primary = gen.node.define({ kind: "test", name: "primary", traits: ["callable"] });
    const alternative = gen.node.define({ kind: "test", name: "alt", traits: ["callable"] });

    const fb = gen.plan.fallback(primary, alternative, "primary unsupported");
    expect(fb.kind).toBe("fallback_plan");
    expect(fb.reason).toBe("primary unsupported");
  });

  test("plugin-defined nodes participate in reactive graph via traits", () => {
    const { gen, ctx } = createGen();
    gen.node.define({
      kind: "custom_node",
      name: "myCustom",
      traits: ["callable", "readable"],
    });

    const graph = gen.reactivity.graph(ctx);
    const found = graph.nodes.find((n) => n.name === "myCustom");
    expect(found).toBeDefined();
    expect(found?.traits).toContain("callable");
    expect(found?.traits).toContain("readable");
  });

  // DI1: Typed Context and Storage Locations
  test("gen.context.define creates typed context definitions", () => {
    const { gen, ctx } = createGen();
    const AuthSession = gen.context.define({
      name: "AuthSession",
      semantic_type: gen.types.object({ userId: gen.types.uuid() }),
    });

    expect(AuthSession.kind).toBe("context_def");
    expect(ctx.contexts).toContain(AuthSession);
  });

  test("gen.context.provide and gen.context.require work", () => {
    const { gen, ctx } = createGen();
    const AuthSession = gen.context.define({
      name: "AuthSession",
      semantic_type: gen.types.object({ userId: gen.types.uuid() }),
    });

    const provision = gen.context.provide({
      context: AuthSession,
      from: gen.location.serverRequestContext(),
    });
    expect(provision.kind).toBe("context_provision");
    expect(ctx.context_provisions).toContain(provision);

    const requirement = gen.context.require({ context: AuthSession });
    expect(requirement.kind).toBe("context_requirement");
    expect(requirement.optional).toBe(false);
    expect(ctx.context_requirements).toContain(requirement);
  });

  test("lifecycle warns on sensitive context in client storage", () => {
    const { gen, ctx } = createGen();
    const SecretToken = gen.context.define({
      name: "SecretToken",
      semantic_type: gen.types.string(),
    });

    gen.context.provide({
      context: SecretToken,
      from: gen.location.clientLocalStorage(),
    });

    const result = gen.lifecycle.check(ctx);
    const unsafe = result.diagnostics.find((d) => d.code === "context:unsafe-storage-location");
    expect(unsafe).toBeDefined();
    expect(unsafe?.severity).toBe("warning");
  });

  test("lifecycle errors on missing required context provision", () => {
    const { gen, ctx } = createGen();
    const AuthSession = gen.context.define({
      name: "AuthSession",
      semantic_type: gen.types.object({ userId: gen.types.uuid() }),
    });

    gen.context.require({ context: AuthSession, optional: false });

    const result = gen.lifecycle.check(ctx);
    const missing = result.diagnostics.find((d) => d.code === "context:missing-provider");
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe("error");
  });

  test("storage location capabilities are correct", () => {
    const { gen } = createGen();
    expect(isSensitivePlacementUnsafe(gen.location.clientLocalStorage())).toBe(true);
    expect(isSensitivePlacementUnsafe(gen.location.serverRequestContext())).toBe(false);
  });

  // PE2: Progressive Enhancement and Fallbacks
  test("FallbackPlan supports degraded execution modes", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });
    const rule = gen.rule.define({
      name: "isActive",
      when: gen.rule.eq(
        gen.rule.field(User, User.fields.id, gen.types.uuid()),
        gen.rule.literal("x", gen.types.string()),
      ),
    });
    const analysis = gen.rule.analyzePlacement(rule, User);
    const fallbackKinds = analysis.placements.map((p) => p.fallback?.kind).filter(Boolean);
    expect(fallbackKinds.length).toBeGreaterThan(0);
  });

  // IVM1: Rule-Derived Incremental View Maintenance
  test("monotonic rules derive IVM plans with supported delta mode", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid(), active: gen.types.boolean() });
    gen.rule.define({
      name: "isActive",
      when: gen.rule.eq(
        gen.rule.field(User, User.fields.active, gen.types.boolean()),
        gen.rule.literal(true, gen.types.boolean()),
      ),
    });

    const ivmPlans = gen.reactivity.ivmPlans(ctx);
    const plan = ivmPlans.find((p) => p.rule.name === "isActive");
    expect(plan).toBeDefined();
    expect(plan?.deltaMode).not.toBe("unsupported");
  });

  test("non-monotonic rules derive IVM plans with unsupported delta mode", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid(), active: gen.types.boolean() });
    gen.rule.define({
      name: "isNotActive",
      when: gen.rule.not(
        gen.rule.eq(
          gen.rule.field(User, User.fields.active, gen.types.boolean()),
          gen.rule.literal(true, gen.types.boolean()),
        ),
      ),
    });

    const ivmPlans = gen.reactivity.ivmPlans(ctx);
    const plan = ivmPlans.find((p) => p.rule.name === "isNotActive");
    expect(plan).toBeDefined();
    expect(plan?.deltaMode).toBe("unsupported");
  });

  test("patchable invalidation precision is applied for simple equality rules", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

    gen.func.action({
      name: "updateUserName",
      input_type: gen.types.object({ id: gen.types.uuid(), name: gen.types.string() }),
      returns: gen.types.object({ id: gen.types.uuid() }),
      body: fn.buildActionUpdate(
        User,
        new Map([[User.fields.name, { kind: "expr_literal", value: "newName" } as any]]),
      ),
    });

    gen.rule.define({
      name: "nameRule",
      when: gen.rule.eq(
        gen.rule.field(User, User.fields.name, gen.types.string()),
        gen.rule.literal("x", gen.types.string()),
      ),
    });

    const plans = gen.reactivity.ruleInvalidations(ctx);
    const plan = plans.find((p) => p.affectedRules.some((r) => r.name === "nameRule"));
    expect(plan).toBeDefined();
    expect(plan?.precision).toBe("patchable");
    expect(plan?.appliedPrecision).toBe("patchable");
  });

  // RX1: Reactions and Outbox Planning
  test("reaction supports outbox plan", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    const action = gen.func.action({
      name: "notifyUser",
      input_type: gen.types.object({ userId: gen.types.uuid() }),
      returns: gen.types.boolean(),
      body: fn.buildActionUpdate(User, new Map()),
    });

    const rule = gen.rule.define({
      name: "userOverdue",
      when: gen.rule.eq(
        gen.rule.literal(true, gen.types.boolean()),
        gen.rule.literal(true, gen.types.boolean()),
      ),
    });

    const reaction = gen.reaction.define({
      name: "sendOverdueNotification",
      when: rule,
      run: action,
      mode: "on_true",
      idempotency: { key: "auto" },
      delivery: { kind: "outbox" },
      outbox: {
        kind: "outbox_plan",
        outbox_table: "reaction_outbox",
        record_schema: {
          id: "uuid",
          payload: "json",
          created_at: "datetime",
          processed_at: "datetime",
          retry_count: 0,
        },
        delivery_guarantee: "at_least_once",
        max_retries: 5,
        retry_delay_ms: 10000,
      },
    });

    expect(reaction.outbox).toBeDefined();
    expect(reaction.outbox?.outbox_table).toBe("reaction_outbox");
    expect(reaction.outbox?.max_retries).toBe(5);
    ctx.reactions.push(reaction);

    const result = gen.lifecycle.check(ctx);
    const outboxMismatch = result.diagnostics.find(
      (d) => d.code === "reaction:outbox-delivery-mismatch",
    );
    expect(outboxMismatch).toBeUndefined();
  });

  // XFER1: Cross-Boundary Transports and SingleFlight
  test("SingleFlight plan bundles loader queries", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    const UserKey = gen.key.family<{ readonly id: string }>("User");
    const listUsers = gen.func.query({
      name: "listUsers",
      input_type: gen.types.object({}),
      returns: gen.types.array(gen.types.object({ id: gen.types.uuid() })),
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.object({ id: gen.types.uuid() }),
      }),
      reactivity: { key: UserKey },
    });

    gen.reactivity.resource({
      name: "listUsersResource",
      query: listUsers,
    });

    const updateUser = gen.func.action({
      name: "updateUser",
      input_type: gen.types.object({ id: gen.types.uuid() }),
      returns: gen.types.boolean(),
      body: fn.buildActionUpdate(User, new Map()),
      invalidates: [listUsers],
    });

    gen.reactivity.mutation({
      name: "updateUserMutation",
      action: updateUser,
      invalidates: gen.reactivity.invalidates([gen.key.any(UserKey)]),
    });

    const graph = gen.reactivity.graph(ctx);
    const sfPlan = gen.reactivity.singleFlight(ctx, graph);

    expect(sfPlan.kind).toBe("single_flight_plan");
    expect(sfPlan.bundled_queries).toBeDefined();
    expect(sfPlan.bundled_queries!.length).toBeGreaterThan(0);

    const mutationPlan = sfPlan.mutations[0];
    expect(mutationPlan).toBeDefined();
    expect(mutationPlan.response_mappings).toBeDefined();
  });

  test("hydration snapshot includes security metadata", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    const UserKey = gen.key.family<{ readonly id: string }>("User");
    const listUsers = gen.func.query({
      name: "listUsers",
      input_type: gen.types.object({}),
      returns: gen.types.array(gen.types.object({ id: gen.types.uuid() })),
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.object({ id: gen.types.uuid() }),
      }),
      reactivity: { key: UserKey },
    });

    const route = gen.router.route({
      path: "/users",
      loaders: [listUsers],
    });

    const snapshot = gen.hydration.plan(route);
    expect(snapshot.security).toBeDefined();
    expect(snapshot.security.signed).toBe(true);
    expect(snapshot.required_contexts).toBeDefined();
  });

  // PE2b: Target Capability Diagnostics
  test("lifecycle warns when target cannot satisfy preferred capability tier", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    // Create a target that only supports static tier
    ctx.targets.push({
      name: "static-target",
      plugin_id: "test",
      accepts_inputs: ["reactive_graph"],
      inputs: [],
      capabilities: { tiers: ["static"], effects: [] },
    });

    const listUsers = gen.func.query({
      name: "listUsers",
      input_type: gen.types.object({}),
      returns: gen.types.array(gen.types.object({ id: gen.types.uuid() })),
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.object({ id: gen.types.uuid() }),
      }),
    });

    gen.reactivity.resource({
      name: "userResource",
      query: listUsers,
      enhancement: {
        kind: "enhancement_plan",
        baseline: "static",
        preferred: "reactive",
        fallbacks: ["static"],
        required_capabilities: [],
      },
    });

    const result = gen.lifecycle.check(ctx);
    const missing = result.diagnostics.find((d) => d.code === "target:capability-missing");
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe("warning");
  });

  // XFER1a: Transport descriptors
  test("transport descriptors are typed and discriminated", () => {
    const { gen } = createGen();
    const rpc = gen.hydration.httpRpcTransport("/api/rpc");
    expect(rpc.transport).toBe("http_rpc");
    expect(rpc.batchable).toBe(true);
    expect(rpc.streaming).toBe(false);

    const ws = gen.hydration.websocketTransport("/api/ws");
    expect(ws.transport).toBe("websocket");
    expect(ws.batchable).toBe(true);
    expect(ws.streaming).toBe(true);

    const form = gen.hydration.httpFormPostTransport("/api/form");
    expect(form.transport).toBe("http_form_post");
    expect(form.batchable).toBe(false);
  });

  // XFER1b: Target fixture generation
  test("bundled fetch fixture generates artifacts", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    const UserKey = gen.key.family<{ readonly id: string }>("User");
    const listUsers = gen.func.query({
      name: "listUsers",
      input_type: gen.types.object({}),
      returns: gen.types.array(gen.types.object({ id: gen.types.uuid() })),
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.object({ id: gen.types.uuid() }),
      }),
      reactivity: { key: UserKey },
    });

    gen.reactivity.resource({
      name: "userResource",
      query: listUsers,
    });

    const route = gen.router.route({
      path: "/users",
      loaders: [listUsers],
    });

    const snapshot = gen.hydration.plan(route);
    const graph = gen.reactivity.graph(ctx);
    const sfPlan = gen.reactivity.singleFlight(ctx, graph);

    const fixture = gen.hydration.fixture([snapshot], sfPlan);
    expect(fixture.kind).toBe("bundled_fetch_fixture");
    expect(fixture.artifacts.length).toBeGreaterThan(0);
    expect(fixture.artifacts.some((a) => a.path.includes("bundled-queries"))).toBe(true);
    expect(fixture.artifacts.some((a) => a.path.includes("hydration-"))).toBe(true);
  });

  // IVM1a: Patch Plan IR
  test("patchable rules produce RulePatchPlan IR", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

    // Register a key family for the User entity so patch plans can reference it
    gen.key.family("User");

    gen.func.action({
      name: "updateUserName",
      input_type: gen.types.object({ id: gen.types.uuid(), name: gen.types.string() }),
      returns: gen.types.object({ id: gen.types.uuid() }),
      body: fn.buildActionUpdate(
        User,
        new Map([[User.fields.name, { kind: "expr_literal", value: "newName" } as any]]),
      ),
    });

    gen.rule.define({
      name: "nameRule",
      when: gen.rule.eq(
        gen.rule.field(User, User.fields.name, gen.types.string()),
        gen.rule.literal("x", gen.types.string()),
      ),
    });

    const patchPlans = gen.reactivity.patchPlans(ctx);
    const plan = patchPlans.find((p) => p.rule.name === "nameRule");
    expect(plan).toBeDefined();
    expect(plan?.kind).toBe("rule_patch_plan");
    expect(plan?.operation).toBe("key_patch");
    expect(plan?.field).toBe(User.fields.name);
  });
});
