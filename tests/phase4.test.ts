import { describe, expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import { checkCronJobs } from "../src/orchestration/index.ts";
import { checkWorkflows } from "../src/workflow/index.ts";
import { checkBoundaryPlans } from "../src/boundary/index.ts";
import { checkDerivedRuleViews } from "../src/rules/index.ts";

describe("Phase 4 provider planning", () => {
  test("gen.requirement and gen.provider define typed provider bindings", () => {
    const { gen, ctx } = createGen();
    const CurrentActor = gen.requirement.define({
      name: "CurrentActor",
      value_type: gen.types.object({ id: gen.types.uuid() }),
    });

    const provider = gen.provider.define({
      name: "ActorCookieProvider",
      provides: CurrentActor,
      source: gen.provider.source.cookie("actor", CurrentActor.value_type),
      lifetime: "request",
      placement: gen.location.serverRequestContext(),
    });

    const plan = gen.provider.plan(ctx);

    expect(ctx.requirements).toContain(CurrentActor);
    expect(ctx.providers).toContain(provider);
    expect(plan.kind).toBe("requirement_satisfaction_plan");
    expect(plan.bindings).toHaveLength(1);
    expect(plan.bindings[0]?.requirement).toBe(CurrentActor);
    expect(plan.bindings[0]?.provider).toBe(provider);
    expect(plan.diagnostics).toHaveLength(0);
  });

  test("context requirements can be satisfied by provider IR", () => {
    const { gen, ctx } = createGen();
    const AuthSession = gen.context.define({
      name: "AuthSession",
      semantic_type: gen.types.object({ userId: gen.types.uuid() }),
    });

    gen.context.require({ context: AuthSession });
    const provider = gen.provider.define({
      name: "SessionProvider",
      provides: AuthSession,
      source: gen.provider.source.cookie("session", AuthSession.semantic_type),
      lifetime: "request",
    });

    const plan = gen.provider.plan(ctx);

    expect(plan.bindings.some((binding) => binding.provider === provider)).toBe(true);
    expect(plan.diagnostics.find((d) => d.code === "requirement:missing-provider")).toBeUndefined();
  });

  test("lifecycle reports missing provider diagnostics", () => {
    const { gen, ctx } = createGen();
    gen.requirement.define({ name: "CurrentTenant", value_type: gen.types.string() });

    const result = gen.lifecycle.check(ctx);

    expect(result.diagnostics.find((d) => d.code === "requirement:missing-provider")).toBeDefined();
  });

  test("planner reports ambiguous providers", () => {
    const { gen, ctx } = createGen();
    const Theme = gen.requirement.define({ name: "Theme", value_type: gen.types.string() });

    gen.provider.define({
      name: "ThemeCookieProvider",
      provides: Theme,
      source: gen.provider.source.cookie("theme", Theme.value_type),
    });
    gen.provider.define({
      name: "ThemeStorageProvider",
      provides: Theme,
      source: gen.provider.source.clientStorage(
        gen.location.clientLocalStorage(),
        Theme.value_type,
      ),
    });

    const plan = gen.provider.plan(ctx);

    expect(plan.ambiguous).toContain(Theme);
    expect(plan.diagnostics.find((d) => d.code === "requirement:ambiguous-provider")).toBeDefined();
  });

  test("planner reports provider dependency cycles", () => {
    const { gen, ctx } = createGen();
    const A = gen.requirement.define({ name: "A", value_type: gen.types.string() });
    const B = gen.requirement.define({ name: "B", value_type: gen.types.string() });

    gen.provider.define({
      name: "ProviderA",
      provides: A,
      source: gen.provider.source.staticValue("a", A.value_type),
      requires: [B],
    });
    gen.provider.define({
      name: "ProviderB",
      provides: B,
      source: gen.provider.source.staticValue("b", B.value_type),
      requires: [A],
    });

    const plan = gen.provider.plan(ctx);

    expect(plan.diagnostics.find((d) => d.code === "requirement:provider-cycle")).toBeDefined();
  });

  test("planner rejects sensitive providers in client-readable storage", () => {
    const { gen, ctx } = createGen();
    const SecretToken = gen.requirement.define({
      name: "SecretToken",
      value_type: gen.types.string(),
      sensitivity: "secret",
    });

    gen.provider.define({
      name: "SecretLocalStorageProvider",
      provides: SecretToken,
      source: gen.provider.source.clientStorage(
        gen.location.clientLocalStorage(),
        SecretToken.value_type,
      ),
      lifetime: "app",
    });

    const plan = gen.provider.plan(ctx);

    expect(
      plan.diagnostics.find((d) => d.code === "placement:secret-client-readable"),
    ).toBeDefined();
  });

  test("planner rejects server-only providers in client-readable placement", () => {
    const { gen, ctx } = createGen();
    const InternalSession = gen.requirement.define({
      name: "InternalSession",
      value_type: gen.types.string(),
      sensitivity: "server_only",
    });

    gen.provider.define({
      name: "InternalSessionClientProvider",
      provides: InternalSession,
      source: gen.provider.source.staticValue("session", InternalSession.value_type),
      placement: gen.location.clientMemory(),
      lifetime: "component",
    });

    const plan = gen.provider.plan(ctx);

    expect(
      plan.diagnostics.find((d) => d.code === "placement:server-only-client-provider"),
    ).toBeDefined();
  });

  test("planner rejects provider lifetime escapes from request sources", () => {
    const { gen, ctx } = createGen();
    const RequestId = gen.requirement.define({ name: "RequestId", value_type: gen.types.string() });

    gen.provider.define({
      name: "RequestHeaderGlobalProvider",
      provides: RequestId,
      source: gen.provider.source.requestHeader("x-request-id", RequestId.value_type),
      lifetime: "global",
    });

    const plan = gen.provider.plan(ctx);

    expect(plan.diagnostics.find((d) => d.code === "placement:lifetime-escape")).toBeDefined();
  });

  test("state resources are typed, stored, and can provide requirements", () => {
    const { gen, ctx } = createGen();
    const Theme = gen.requirement.define({ name: "Theme", value_type: gen.types.string() });
    const ThemeState = gen.state.define({
      name: "ThemeState",
      value_type: gen.types.string(),
      storage: gen.location.clientLocalStorage(),
      default: "dark",
      readable_by: "client",
      writable_by: "client",
      lifetime: "app",
    });

    const provider = gen.provider.define({
      name: "ThemeStateProvider",
      provides: Theme,
      source: gen.provider.source.stateResource(ThemeState),
      lifetime: "app",
    });

    const plan = gen.provider.plan(ctx);

    expect(ThemeState.kind).toBe("state_resource");
    expect(ctx.state_resources).toContain(ThemeState);
    expect(plan.bindings.some((binding) => binding.provider === provider)).toBe(true);
    expect(plan.diagnostics).toHaveLength(0);
  });

  test("state resources in query cache require key families", () => {
    const { gen, ctx } = createGen();

    gen.state.define({
      name: "CachedFilterState",
      value_type: gen.types.object({ search: gen.types.string() }),
      storage: gen.location.clientQueryCache(),
    });

    const result = gen.lifecycle.check(ctx);

    expect(
      result.diagnostics.find((d) => d.code === "state:query-cache-missing-key"),
    ).toBeDefined();
  });

  test("state resources reject sensitive data in unsafe client storage", () => {
    const { gen, ctx } = createGen();

    gen.state.define({
      name: "SecretDraftState",
      value_type: gen.types.string(),
      storage: gen.location.clientLocalStorage(),
      sensitivity: "secret",
      lifetime: "app",
    });

    const result = gen.lifecycle.check(ctx);

    expect(result.diagnostics.find((d) => d.code === "state:unsafe-persistence")).toBeDefined();
  });

  test("deriveReactiveGraph includes state resource nodes", () => {
    const { gen, ctx } = createGen();

    gen.state.define({
      name: "ThemeState",
      value_type: gen.types.string(),
      storage: gen.location.clientLocalStorage(),
      default: "dark",
    });

    const graph = gen.reactivity.graph(ctx);

    const node = graph.nodes.find((n) => n.kind === "state_resource" && n.name === "ThemeState");
    expect(node).toBeDefined();
  });

  test("state resource with key family has reads_key edge in reactive graph", () => {
    const { gen, ctx } = createGen();
    const UserKeyFamily = gen.key.family("User", {
      input: gen.types.object({ id: gen.types.uuid() }),
    });

    gen.state.define({
      name: "UserPrefState",
      value_type: gen.types.string(),
      storage: gen.location.clientLocalStorage(),
      key_family: UserKeyFamily,
    });

    const graph = gen.reactivity.graph(ctx);

    const stateNode = graph.nodes.find(
      (n) => n.kind === "state_resource" && n.name === "UserPrefState",
    );
    expect(stateNode).toBeDefined();

    const familyNode = graph.nodes.find((n) => n.kind === "key_family" && n.name === "User");
    expect(familyNode).toBeDefined();

    expect(
      graph.edges.some(
        (e) => e.kind === "reads_key" && e.from === stateNode!.id && e.to === familyNode!.id,
      ),
    ).toBe(true);
  });
});

describe("Phase 4 hydration planning", () => {
  test("hydration plan includes state payloads for marked state resources", () => {
    const { gen } = createGen();

    gen.state.define({
      name: "ThemeState",
      value_type: gen.types.string(),
      storage: gen.location.clientLocalStorage(),
      default: "dark",
      hydrate: true,
    });

    const route = gen.router.route({ path: "/" });
    const plan = gen.hydration.plan(route);

    expect(plan.state_payloads).toHaveLength(1);
    expect(plan.state_payloads[0]?.state_name).toBe("ThemeState");
    expect(plan.diagnostics).toHaveLength(0);
  });

  test("hydration plan excludes secret state resources with diagnostics", () => {
    const { gen } = createGen();

    gen.state.define({
      name: "SecretState",
      value_type: gen.types.string(),
      storage: gen.location.clientLocalStorage(),
      sensitivity: "secret",
      hydrate: true,
    });

    const route = gen.router.route({ path: "/" });
    const plan = gen.hydration.plan(route);

    expect(plan.state_payloads).toHaveLength(0);
    expect(plan.diagnostics.find((d) => d.code === "hydration:secret-excluded")).toBeDefined();
  });

  test("hydration plan includes context payloads and provider bindings", () => {
    const { gen } = createGen();
    const AuthSession = gen.context.define({
      name: "AuthSession",
      semantic_type: gen.types.object({ userId: gen.types.uuid() }),
    });

    gen.context.require({ context: AuthSession });
    gen.provider.define({
      name: "SessionProvider",
      provides: AuthSession,
      source: gen.provider.source.cookie("session", AuthSession.semantic_type),
      lifetime: "request",
    });

    const route = gen.router.route({ path: "/" });
    const plan = gen.hydration.plan(route);

    expect(plan.context_payloads).toHaveLength(1);
    expect(plan.context_payloads[0]?.context_name).toBe("AuthSession");
    expect(plan.provider_bindings).toHaveLength(1);
    expect(plan.provider_bindings[0]?.provider_name).toBe("SessionProvider");
    expect(plan.diagnostics).toHaveLength(0);
  });

  test("hydration plan diagnoses non-hydratable provider sources", () => {
    const { gen } = createGen();
    const DatabaseUrl = gen.context.define({
      name: "DatabaseUrl",
      semantic_type: gen.types.string(),
    });

    gen.context.require({ context: DatabaseUrl });
    gen.provider.define({
      name: "EnvProvider",
      provides: DatabaseUrl,
      source: gen.provider.source.envVar("DATABASE_URL"),
    });

    const route = gen.router.route({ path: "/" });
    const plan = gen.hydration.plan(route);

    expect(plan.context_payloads).toHaveLength(0);
    expect(
      plan.diagnostics.find((d) => d.code === "hydration:non-serializable-source"),
    ).toBeDefined();
  });

  test("hydration plan diagnoses missing providers for required contexts", () => {
    const { gen } = createGen();
    const MissingContext = gen.context.define({
      name: "MissingContext",
      semantic_type: gen.types.string(),
    });

    gen.context.require({ context: MissingContext });

    const route = gen.router.route({ path: "/" });
    const plan = gen.hydration.plan(route);

    expect(plan.context_payloads).toHaveLength(0);
    expect(plan.diagnostics.find((d) => d.code === "hydration:missing-provider")).toBeDefined();
  });

  test("safe projection allows sensitive provider to hydrate", () => {
    const { gen } = createGen();
    const AuthSession = gen.context.define({
      name: "AuthSession",
      semantic_type: gen.types.object({ userId: gen.types.uuid(), token: gen.types.string() }),
    });

    gen.context.require({ context: AuthSession });
    gen.provider.define({
      name: "AuthProvider",
      provides: AuthSession,
      source: gen.provider.source.requestHeader("authorization", AuthSession.semantic_type),
      sensitivity: "secret",
      client_projection: gen.hydration.projection({
        source_name: "AuthSession",
        projected_type: gen.types.object({ userId: gen.types.uuid() }),
        projected_sensitivity: "public",
      }),
    });

    const route = gen.router.route({ path: "/" });
    const plan = gen.hydration.plan(route);

    expect(plan.context_payloads).toHaveLength(1);
    expect(plan.context_payloads[0]?.projection_name).toBe("AuthSession");
    expect(plan.diagnostics).toHaveLength(0);
  });

  test("unsafe projection with still-sensitive target produces diagnostic", () => {
    const { gen } = createGen();
    const AuthSession = gen.context.define({
      name: "AuthSession",
      semantic_type: gen.types.object({ userId: gen.types.uuid() }),
    });

    gen.context.require({ context: AuthSession });
    gen.provider.define({
      name: "AuthProvider",
      provides: AuthSession,
      source: gen.provider.source.requestHeader("authorization", AuthSession.semantic_type),
      sensitivity: "secret",
      client_projection: gen.hydration.projection({
        source_name: "AuthSession",
        projected_type: gen.types.object({ userId: gen.types.uuid() }),
        projected_sensitivity: "secret",
      }),
    });

    const route = gen.router.route({ path: "/" });
    const plan = gen.hydration.plan(route);

    expect(plan.context_payloads).toHaveLength(0);
    expect(plan.diagnostics.find((d) => d.code === "hydration:unsafe-projection")).toBeDefined();
  });

  test("serialization contracts are visible in hydration IR", () => {
    const { gen } = createGen();
    const Theme = gen.context.define({
      name: "Theme",
      semantic_type: gen.types.string(),
    });

    gen.context.require({ context: Theme });
    gen.provider.define({
      name: "ThemeProvider",
      provides: Theme,
      source: gen.provider.source.staticValue("dark", Theme.semantic_type),
    });

    const route = gen.router.route({ path: "/" });
    const plan = gen.hydration.plan(route);

    expect(plan.context_payloads[0]?.serialization_contract).toBeDefined();
    expect(plan.context_payloads[0]?.serialization_contract?.kind).toBe("serialization_contract");
  });
});

describe("Phase 4 derived resources", () => {
  test("derived resource appears in reactive graph with dependencies", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });
    const UserKey = gen.key.family<{ readonly id: string }>("User");
    const userQuery = gen.func.query({
      name: "getUser",
      input_type: gen.types.uuid(),
      returns: User,
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.uuid(),
      }),
      reactivity: { key: UserKey },
    });
    const userResource = gen.reactivity.resource({ name: "userResource", query: userQuery });

    gen.reactivity.derived({
      name: "userSummary",
      dependencies: [userResource],
      output_type: gen.types.object({ id: gen.types.uuid(), name: gen.types.string() }),
    });

    const graph = gen.reactivity.graph(ctx);

    const derivedNode = graph.nodes.find(
      (n) => n.kind === "derived_resource" && n.name === "userSummary",
    );
    expect(derivedNode).toBeDefined();
    expect(derivedNode?.resource_type).toBe("reactive");

    const resourceNode = graph.nodes.find(
      (n) => n.kind === "resource" && n.name === "userResource",
    );
    expect(resourceNode).toBeDefined();

    expect(
      graph.edges.some(
        (e) =>
          e.kind === "reads_resource" && e.from === derivedNode!.id && e.to === resourceNode!.id,
      ),
    ).toBe(true);
  });

  test("derived resource with key expression dependency has reads_key edge", () => {
    const { gen, ctx } = createGen();
    const UserKey = gen.key.family<{ readonly id: string }>("User");

    gen.reactivity.derived({
      name: "userCount",
      dependencies: [gen.key.key(UserKey, { id: "all" })],
      output_type: gen.types.int(),
    });

    const graph = gen.reactivity.graph(ctx);

    const derivedNode = graph.nodes.find(
      (n) => n.kind === "derived_resource" && n.name === "userCount",
    );
    expect(derivedNode).toBeDefined();

    const familyNode = graph.nodes.find((n) => n.kind === "key_family" && n.name === "User");
    expect(familyNode).toBeDefined();

    expect(
      graph.edges.some(
        (e) => e.kind === "reads_key" && e.from === derivedNode!.id && e.to === familyNode!.id,
      ),
    ).toBe(true);
  });
});

describe("Phase 4 scoped resources and streams", () => {
  test("stream resource without disposal policy produces lifecycle warning", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });
    const userQuery = gen.func.query({
      name: "getUsers",
      input_type: gen.types.uuid(),
      returns: User,
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.uuid(),
      }),
    });

    gen.reactivity.stream({
      name: "userStream",
      query: userQuery,
      stream_type: "sse",
    });

    const result = gen.lifecycle.check(ctx);

    expect(
      result.diagnostics.find((d) => d.code === "reactivity:missing-disposal-policy"),
    ).toBeDefined();
  });

  test("stream resource with disposal policy has no warning", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });
    const userQuery = gen.func.query({
      name: "getUsers",
      input_type: gen.types.uuid(),
      returns: User,
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.uuid(),
      }),
    });

    gen.reactivity.stream({
      name: "userStream",
      query: userQuery,
      stream_type: "sse",
      disposal_policy: "auto",
    });

    const result = gen.lifecycle.check(ctx);

    expect(
      result.diagnostics.find((d) => d.code === "reactivity:missing-disposal-policy"),
    ).toBeUndefined();
  });
});

describe("Phase 4 merge strategies", () => {
  test("merge strategies are typed IR with operation and conflict behavior", () => {
    const { gen } = createGen();
    const strategy = gen.merge.lastWriteWins();

    expect(strategy.kind).toBe("merge_strategy");
    expect(strategy.operation).toBe("last_write_wins");
    expect(strategy.conflict).toBe("may_conflict");
  });

  test("withMerge attaches strategy to semantic type", () => {
    const { gen } = createGen();
    const Counter = gen.types.int();
    const strategy = gen.merge.sumDelta();

    const merged = gen.types.withMerge(Counter, strategy);

    expect(merged.merge_strategy).toBe(strategy);
    expect(merged.name).toBe(Counter.name);
  });

  test("built-in merge strategies carry law metadata", () => {
    const { gen } = createGen();

    const sum = gen.merge.sumDelta();
    expect(sum.associative).toBe(true);
    expect(sum.commutative).toBe(true);

    const setUnion = gen.merge.setUnion();
    expect(setUnion.idempotent).toBe(true);

    const max = gen.merge.max();
    expect(max.monotonic).toBe(true);
  });

  test("deriveEntityMergePlan collects field merge strategies", () => {
    const { gen } = createGen();
    const Counter = gen.types.withMerge(gen.types.int(), gen.merge.sumDelta());
    const Name = gen.types.string();

    const Product = gen.entity("Product", {
      count: Counter,
      name: Name,
    });

    const plan = gen.merge.plan(Product);

    expect(plan.kind).toBe("entity_merge_plan");
    expect(plan.entity_name).toBe("Product");
    expect(plan.field_plans.find((f) => f.field_name === "count")?.strategy?.operation).toBe(
      "sum_delta",
    );
    expect(plan.field_plans.find((f) => f.field_name === "name")?.strategy).toBeUndefined();
  });
});

describe("Phase 4 optimistic plan IR", () => {
  test("optimistic plan can carry temp_id_strategy and safety classification", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    const query = gen.func.query({
      name: "listUsers",
      input_type: gen.types.uuid(),
      returns: User,
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.uuid(),
      }),
    });

    const apply = gen.func.buildPatchInsert(query.body, [
      [
        User.fields.id,
        gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "temp" }),
      ],
    ]);
    const rollback = gen.func.buildPatchDelete(query.body);

    const plan = gen.reactivity.optimistic({
      apply,
      rollback,
      fallback: { kind: "reject", reason: "unsafe" },
      temp_id_strategy: "uuid",
      safety_classification: "safe",
      operation_laws: { associative: true, commutative: false },
    });

    expect(plan.temp_id_strategy).toBe("uuid");
    expect(plan.safety_classification).toBe("safe");
    expect(plan.operation_laws?.associative).toBe(true);
  });

  test("checkOptimisticPlans warns on insert without temp_id_strategy", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    const query = gen.func.query({
      name: "listUsers",
      input_type: gen.types.uuid(),
      returns: User,
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.uuid(),
      }),
    });

    const apply = gen.func.buildPatchInsert(query.body, [
      [
        User.fields.id,
        gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "temp" }),
      ],
    ]);
    const rollback = gen.func.buildPatchDelete(query.body);

    const mutation = gen.reactivity.mutation({
      name: "createUser",
      action: gen.func.action({
        name: "createUserAction",
        input_type: gen.types.object({ id: gen.types.uuid() }),
        returns: User,
        body: {
          kind: { kind: "insert" },
          phase: "mutation",
          target_entity: User,
          operations: [
            {
              kind: "insert_op",
              target: User,
              values: new Map(),
            },
          ],
          effects: [],
          requirements: [],
        },
      }),
      optimistic: gen.reactivity.optimistic({
        apply,
        rollback,
        fallback: { kind: "reject", reason: "unsafe" },
      }),
    });

    const diagnostics = gen.reactivity.checkOptimisticPlans({
      reactive_mutations: [mutation],
    });

    expect(diagnostics.some((d) => d.code === "reactivity:optimistic-missing-temp-id")).toBe(true);
  });

  test("checkOptimisticPlans errors on unsafe safety classification", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    const query = gen.func.query({
      name: "listUsers",
      input_type: gen.types.uuid(),
      returns: User,
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.uuid(),
      }),
    });

    const apply = gen.func.buildPatchUpdate(query.body, [
      [
        User.fields.id,
        gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "temp" }),
      ],
    ]);
    const rollback = gen.func.buildPatchUpdate(query.body, []);

    const mutation = gen.reactivity.mutation({
      name: "updateUser",
      action: gen.func.action({
        name: "updateUserAction",
        input_type: gen.types.object({ id: gen.types.uuid() }),
        returns: User,
        body: {
          kind: { kind: "update" },
          phase: "mutation",
          target_entity: User,
          operations: [
            {
              kind: "update_op",
              target: User,
              values: new Map(),
            },
          ],
          effects: [],
          requirements: [],
        },
      }),
      optimistic: gen.reactivity.optimistic({
        apply,
        rollback,
        fallback: { kind: "reject", reason: "unsafe" },
        safety_classification: "unsafe",
      }),
    });

    const diagnostics = gen.reactivity.checkOptimisticPlans({
      reactive_mutations: [mutation],
    });

    expect(diagnostics.some((d) => d.code === "optimistic:rollback-missing")).toBe(true);
  });
});

describe("Phase 4 offline commands and queues", () => {
  test("offline command envelope carries queue metadata", () => {
    const { gen } = createGen();

    const envelope = gen.offline.envelope({
      action_name: "createTask",
      input_type: gen.types.object({ title: gen.types.string() }),
      idempotency_key: "task:create",
      conflict_policy: "queue",
      retry_policy: "exponential",
    });

    expect(envelope.kind).toBe("offline_command_envelope");
    expect(envelope.idempotency_key).toBe("task:create");
    expect(envelope.conflict_policy).toBe("queue");
  });

  test("offline queue plan diagnoses missing encryption for secret data", () => {
    const { gen } = createGen();

    const queue = gen.offline.queue({
      name: "SecretQueue",
      storage: gen.location.clientLocalStorage(),
      sensitivity: "secret",
      encryption_required: false,
    });

    const diagnostics = gen.offline.check([], [queue]);

    expect(diagnostics.some((d) => d.code === "offline:unsafe-sensitive-persistence")).toBe(true);
  });

  test("offline check warns on missing idempotency key", () => {
    const { gen } = createGen();

    const envelope = gen.offline.envelope({
      action_name: "createTask",
      input_type: gen.types.object({ title: gen.types.string() }),
    });

    const diagnostics = gen.offline.check([envelope], []);

    expect(diagnostics.some((d) => d.code === "offline:missing-idempotency-key")).toBe(true);
  });

  test("offline envelope and queue are registered in GenContext", () => {
    const { gen, ctx } = createGen();

    const envelope = gen.offline.envelope({
      action_name: "createTask",
      input_type: gen.types.object({ title: gen.types.string() }),
      idempotency_key: "task:create",
    });

    const queue = gen.offline.queue({
      name: "TaskQueue",
      storage: gen.location.sharedQueue(),
    });

    expect(ctx.offline_commands).toContain(envelope);
    expect(ctx.offline_queues).toContain(queue);
  });
});

describe("Phase 4 plan composition", () => {
  test("retry plan is a composable node", () => {
    const { gen } = createGen();
    const stepA = gen.node.define({ kind: "test_step", name: "stepA", traits: ["callable"] });

    const plan = gen.plan.retry(stepA, 3, "exponential");

    expect(plan.kind).toBe("retry_plan");
    expect(plan.max_attempts).toBe(3);
    expect(plan.backoff).toBe("exponential");
  });

  test("placement plan assigns target runtime", () => {
    const { gen } = createGen();
    const stepA = gen.node.define({ kind: "test_step", name: "stepA", traits: ["callable"] });

    const plan = gen.plan.withPlacement(stepA, "node20", "primary");

    expect(plan.kind).toBe("placement_plan");
    expect(plan.runtime).toBe("node20");
    expect(plan.store).toBe("primary");
  });

  test("map and chain plans are composable", () => {
    const { gen } = createGen();
    const stepA = gen.node.define({ kind: "test_step", name: "stepA", traits: ["callable"] });
    const stepB = gen.node.define({ kind: "test_step", name: "stepB", traits: ["callable"] });

    const mapped = gen.plan.map(stepA, stepB);
    expect(mapped.kind).toBe("map_plan");

    const chained = gen.plan.chain(stepA, stepB);
    expect(chained.kind).toBe("chain_plan");
  });

  test("derivePlanRequirements bubbles requirements from child nodes", () => {
    const { gen } = createGen();

    const stepA = gen.node.define({
      kind: "test_step",
      name: "stepA",
      traits: ["callable"],
      requirements: [{ kind: "db_read" }],
    });

    const stepB = gen.node.define({
      kind: "test_step",
      name: "stepB",
      traits: ["callable"],
      requirements: [{ kind: "db_write" }],
    });

    const plan = gen.plan.sequence([stepA, stepB]);
    const reqs = gen.plan.deriveRequirements(plan);
    expect(reqs.some((r) => r.kind === "db_read")).toBe(true);
    expect(reqs.some((r) => r.kind === "db_write")).toBe(true);
  });

  test("derivePlanEffects bubbles effects from child nodes", () => {
    const { gen } = createGen();

    const stepA = gen.node.define({
      kind: "test_step",
      name: "stepA",
      traits: ["callable"],
      effects: [{ kind: "network" }],
    });

    const plan = gen.plan.retry(stepA, 3, "exponential");
    const effs = gen.plan.deriveEffects(plan);
    expect(effs.some((e) => e.kind === "network")).toBe(true);
  });

  test("plan composition pushes to ctx.composable_plans", () => {
    const { gen, ctx } = createGen();

    const stepA = gen.node.define({ kind: "test_step", name: "stepA", traits: ["callable"] });
    const stepB = gen.node.define({ kind: "test_step", name: "stepB", traits: ["callable"] });

    gen.plan.sequence([stepA, stepB]);
    gen.plan.parallel([stepA]);
    gen.plan.retry(stepA, 3, "exponential");

    expect(ctx.composable_plans.length).toBeGreaterThanOrEqual(3);
  });

  test("checkFallback warns on incompatible fallback outputs", () => {
    const { gen } = createGen();

    const stepA = gen.node.define({
      kind: "test_step",
      name: "stepA",
      traits: ["callable"],
      output: gen.types.string(),
    });

    const stepB = gen.node.define({
      kind: "test_step",
      name: "stepB",
      traits: ["callable"],
      output: gen.types.int(),
    });

    const plan = gen.plan.fallback(stepA, stepB, "primary failed");
    const diagnostics = gen.plan.checkFallback(plan);
    expect(diagnostics.some((d) => d.code === "plan:fallback-output-mismatch")).toBe(true);
  });
});

describe("Phase 4 orchestration", () => {
  test("schedule helpers produce typed schedule IR", () => {
    const { gen, ctx } = createGen();

    const s1 = gen.schedule.define({
      name: "nightly",
      expression: gen.schedule.cron("0 0 * * *"),
      timezone: "UTC",
    });

    expect(s1.kind).toBe("schedule");
    expect(s1.name).toBe("nightly");
    expect(s1.expression.kind).toBe("cron");
    expect(ctx.schedules).toContain(s1);

    const s2 = gen.schedule.define({
      name: "hourly",
      expression: gen.schedule.interval(3_600_000),
    });
    expect(s2.expression.kind).toBe("interval");

    const s3 = gen.schedule.define({
      name: "dailyReport",
      expression: gen.schedule.daily(9, 0),
    });
    expect(s3.expression.kind).toBe("daily");

    const s4 = gen.schedule.define({
      name: "weeklySync",
      expression: gen.schedule.weekly(1, 10, 0),
    });
    expect(s4.expression.kind).toBe("weekly");
  });

  test("cron job invokes an action and is registered", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });
    const schedule = gen.schedule.define({
      name: "everyMinute",
      expression: gen.schedule.cron("* * * * *"),
    });

    const action = gen.func.action({
      name: "cleanup",
      input_type: gen.types.object({ batch: gen.types.int() }),
      returns: Task,
      effects: [gen.types.effect.dbWrite()],
      body: gen.func.buildActionUpdate(Task, new Map()),
    });

    const job = gen.cron.define({
      name: "cleanupJob",
      schedule,
      run_target: action,
      execution_policy: {
        kind: "cron_execution_policy",
        concurrency: "forbid",
        idempotency: true,
        observability: true,
      },
    });

    expect(job.kind).toBe("cron_job");
    expect(job.name).toBe("cleanupJob");
    expect(ctx.cron_jobs).toContain(job);
  });

  test("cron diagnostic for missing idempotency on db-write action", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });
    const schedule = gen.schedule.define({
      name: "everyMinute",
      expression: gen.schedule.cron("* * * * *"),
    });

    const action = gen.func.action({
      name: "dangerousCleanup",
      input_type: gen.types.object({ batch: gen.types.int() }),
      returns: Task,
      effects: [gen.types.effect.dbWrite()],
      body: gen.func.buildActionUpdate(Task, new Map()),
    });

    gen.cron.define({
      name: "dangerousJob",
      schedule,
      run_target: action,
      execution_policy: {
        kind: "cron_execution_policy",
        concurrency: "forbid",
        idempotency: false,
        observability: true,
      },
    });

    const diagnostics = checkCronJobs(ctx);
    expect(diagnostics.some((d) => d.code === "cron:missing-idempotency")).toBe(true);
  });

  test("cron diagnostic for missing execution identity on protected action", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });
    const schedule = gen.schedule.define({
      name: "nightly",
      expression: gen.schedule.cron("0 0 * * *"),
    });

    const action = gen.func.action({
      name: "adminSweep",
      input_type: gen.types.object({ batch: gen.types.int() }),
      returns: Task,
      effects: [gen.types.effect.dbWrite()],
      target_runtimes: [{ name: "server", capabilities: [], supported_operations: [] }],
      body: gen.func.buildActionUpdate(Task, new Map()),
    });

    gen.cron.define({
      name: "adminSweepJob",
      schedule,
      run_target: action,
      execution_policy: {
        kind: "cron_execution_policy",
        concurrency: "forbid",
        idempotency: true,
        observability: true,
      },
    });

    const diagnostics = checkCronJobs(ctx);
    expect(diagnostics.some((d) => d.code === "cron:missing-execution-identity")).toBe(true);
  });

  test("cron diagnostic for opaque schedule expression", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });
    const schedule = gen.schedule.define({
      name: "custom",
      expression: { kind: "opaque", expression: "whenever" },
    });

    const action = gen.func.action({
      name: "noopAction",
      input_type: gen.types.object({}),
      returns: Task,
      body: gen.func.buildActionUpdate(Task, new Map()),
    });

    gen.cron.define({
      name: "customJob",
      schedule,
      run_target: action,
      execution_policy: {
        kind: "cron_execution_policy",
        concurrency: "forbid",
        idempotency: true,
        observability: true,
      },
    });

    const diagnostics = checkCronJobs(ctx);
    expect(diagnostics.some((d) => d.code === "cron:opaque-schedule")).toBe(true);
  });
});

describe("Phase 4 workflow orchestration", () => {
  test("workflow define registers a typed workflow", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    const action = gen.func.action({
      name: "doTask",
      input_type: gen.types.object({ id: gen.types.uuid() }),
      returns: Task,
      body: gen.func.buildActionUpdate(Task, new Map()),
    });

    const wf = gen.workflow.define({
      name: "processTask",
      input_type: gen.types.object({ id: gen.types.uuid() }),
      output_type: Task,
      plan: gen.workflow.action(action),
    });

    expect(wf.kind).toBe("workflow");
    expect(wf.name).toBe("processTask");
    expect(ctx.workflows).toContain(wf);
  });

  test("workflow sequence and parallel produce correct step kinds", () => {
    const { gen } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    const action = gen.func.action({
      name: "doTask",
      input_type: gen.types.object({ id: gen.types.uuid() }),
      returns: Task,
      body: gen.func.buildActionUpdate(Task, new Map()),
    });

    const seq = gen.workflow.sequence([gen.workflow.action(action), gen.workflow.action(action)]);
    expect(seq.kind).toBe("workflow_sequence");
    expect(seq.steps).toHaveLength(2);

    const par = gen.workflow.parallel([gen.workflow.action(action)]);
    expect(par.kind).toBe("workflow_parallel");
  });

  test("workflow branch with empty predicate produces diagnostic", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    const action = gen.func.action({
      name: "doTask",
      input_type: gen.types.object({ id: gen.types.uuid() }),
      returns: Task,
      body: gen.func.buildActionUpdate(Task, new Map()),
    });

    gen.workflow.define({
      name: "branchingWorkflow",
      input_type: gen.types.object({}),
      output_type: Task,
      plan: gen.workflow.branch("", gen.workflow.action(action), gen.workflow.action(action)),
    });

    const diagnostics = checkWorkflows(ctx);
    expect(diagnostics.some((d) => d.code === "workflow:non-boolean-branch")).toBe(true);
  });

  test("workflow retry of non-idempotent action produces diagnostic", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    const action = gen.func.action({
      name: "writeTask",
      input_type: gen.types.object({ id: gen.types.uuid() }),
      returns: Task,
      effects: [gen.types.effect.dbWrite()],
      body: gen.func.buildActionUpdate(Task, new Map()),
    });

    gen.workflow.define({
      name: "retryingWorkflow",
      input_type: gen.types.object({}),
      output_type: Task,
      plan: gen.workflow.retry(gen.workflow.action(action), 3, "exponential"),
    });

    const diagnostics = checkWorkflows(ctx);
    expect(diagnostics.some((d) => d.code === "workflow:retry-non-idempotent")).toBe(true);
  });

  test("workflow wait-for-event without correlation key produces diagnostic", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    gen.workflow.define({
      name: "waitingWorkflow",
      input_type: gen.types.object({}),
      output_type: Task,
      plan: gen.workflow.waitForEvent("task.completed"),
    });

    const diagnostics = checkWorkflows(ctx);
    expect(diagnostics.some((d) => d.code === "workflow:missing-event-correlation")).toBe(true);
  });

  test("workflow with unsupported durable semantics produces diagnostics", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    const action = gen.func.action({
      name: "doTask",
      input_type: gen.types.object({ id: gen.types.uuid() }),
      returns: Task,
      body: gen.func.buildActionUpdate(Task, new Map()),
    });

    gen.workflow.define({
      name: "advancedWorkflow",
      input_type: gen.types.object({}),
      output_type: Task,
      plan: gen.workflow.sequence([
        gen.workflow.parallel([gen.workflow.action(action)]),
        gen.workflow.checkpoint("mid"),
        gen.workflow.compensate(gen.workflow.action(action), gen.workflow.action(action)),
        gen.workflow.child(
          gen.workflow.define({
            name: "childWf",
            input_type: gen.types.object({}),
            output_type: Task,
            plan: gen.workflow.action(action),
          }),
        ),
        gen.workflow.waitForEvent("done", "key1"),
      ]),
    });

    const diagnostics = checkWorkflows(ctx);
    expect(diagnostics.some((d) => d.code === "workflow:unsupported-parallelism")).toBe(true);
    expect(diagnostics.some((d) => d.code === "workflow:unsupported-checkpoint")).toBe(true);
    expect(diagnostics.some((d) => d.code === "workflow:unsupported-compensation")).toBe(true);
    expect(diagnostics.some((d) => d.code === "workflow:unsupported-child-workflow")).toBe(true);
    expect(diagnostics.some((d) => d.code === "workflow:unsupported-durable-wait")).toBe(true);
  });

  test("workflow with declared errors but no handler produces diagnostic", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    const action = gen.func.action({
      name: "doTask",
      input_type: gen.types.object({ id: gen.types.uuid() }),
      returns: Task,
      body: gen.func.buildActionUpdate(Task, new Map()),
    });

    gen.workflow.define({
      name: "riskyWorkflow",
      input_type: gen.types.object({}),
      output_type: Task,
      errors: [{ code: "task_failed" }],
      plan: gen.workflow.action(action),
    });

    const diagnostics = checkWorkflows(ctx);
    expect(diagnostics.some((d) => d.code === "workflow:unhandled-error")).toBe(true);
  });
});

describe("Phase 4 boundary and transport", () => {
  test("boundary call plan is registered and typed", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    const action = gen.func.action({
      name: "createTask",
      input_type: gen.types.object({ title: gen.types.string() }),
      returns: Task,
      body: gen.func.buildActionInsert(Task, new Map()),
    });

    const plan = gen.boundary.callPlan({
      name: "createTaskBoundary",
      callable: action,
      client_boundary: gen.boundary.browser(),
      server_boundary: gen.boundary.server(),
      transport: gen.boundary.transport({
        transport: "server_action",
        source_boundary: gen.boundary.browser(),
        target_boundary: gen.boundary.server(),
      }),
    });

    expect(plan.kind).toBe("boundary_call_plan");
    expect(plan.name).toBe("createTaskBoundary");
    expect(ctx.boundary_plans).toContain(plan);
  });

  test("deriveBoundaryPlans generates plans for query and action functions", () => {
    const { gen } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    gen.func.query({
      name: "getTask",
      input_type: gen.types.uuid(),
      returns: Task,
      body: gen.query.build({
        source: { kind: "entity_source", entity: Task },
        result_type: gen.types.uuid(),
      }),
    });

    gen.func.action({
      name: "deleteTask",
      input_type: gen.types.uuid(),
      returns: Task,
      body: gen.func.buildActionDelete(Task, undefined),
    });

    const plans = gen.boundary.derive();
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(plans.some((p) => p.name === "getTask")).toBe(true);
    expect(plans.some((p) => p.name === "deleteTask")).toBe(true);
  });

  test("boundary diagnostic for server-only callable called from client", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    const action = gen.func.action({
      name: "secretTask",
      input_type: gen.types.object({}),
      returns: Task,
      effects: [gen.types.effect.dbWrite()],
      target_runtimes: [{ name: "server", capabilities: [], supported_operations: [] }],
      body: gen.func.buildActionInsert(Task, new Map()),
    });

    gen.boundary.callPlan({
      name: "secretTaskBoundary",
      callable: action,
      client_boundary: gen.boundary.browser(),
      server_boundary: gen.boundary.server(),
      transport: gen.boundary.transport({
        transport: "server_action",
        source_boundary: gen.boundary.browser(),
        target_boundary: gen.boundary.server(),
      }),
    });

    const diagnostics = checkBoundaryPlans(ctx);
    expect(diagnostics.some((d) => d.code === "boundary:server-only-client-call")).toBe(true);
  });

  test("boundary diagnostic for edge runtime with unsupported effects", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    const action = gen.func.action({
      name: "edgeTask",
      input_type: gen.types.object({}),
      returns: Task,
      effects: [gen.types.effect.dbWrite()],
      body: gen.func.buildActionInsert(Task, new Map()),
    });

    gen.boundary.callPlan({
      name: "edgeTaskBoundary",
      callable: action,
      client_boundary: gen.boundary.browser(),
      server_boundary: gen.boundary.edge(),
      transport: gen.boundary.transport({
        transport: "http",
        source_boundary: gen.boundary.browser(),
        target_boundary: gen.boundary.edge(),
      }),
    });

    const diagnostics = checkBoundaryPlans(ctx);
    expect(diagnostics.some((d) => d.code === "boundary:edge-unsupported-effect")).toBe(true);
  });

  test("boundary diagnostic for queue transport without strict serialization", () => {
    const { gen, ctx } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    const action = gen.func.action({
      name: "queuedTask",
      input_type: gen.types.object({}),
      returns: Task,
      effects: [gen.types.effect.dbWrite()],
      body: gen.func.buildActionInsert(Task, new Map()),
    });

    gen.boundary.callPlan({
      name: "queuedTaskBoundary",
      callable: action,
      client_boundary: gen.boundary.browser(),
      server_boundary: gen.boundary.server(),
      transport: gen.boundary.transport({
        transport: "queue",
        source_boundary: gen.boundary.browser(),
        target_boundary: gen.boundary.server(),
      }),
    });

    const diagnostics = checkBoundaryPlans(ctx);
    expect(diagnostics.some((d) => d.code === "boundary:queue-missing-serialization")).toBe(true);
  });
});

describe("Phase 4 semantic obligations", () => {
  test("policies produce policy test and access matrix doc obligations", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    gen.authz.policy({ name: "userRead", target_entity: User, actions: [] });

    const graph = gen.obligations.derive();
    expect(graph.obligations.some((o) => o.obligation === "policy_test")).toBe(true);
    expect(graph.obligations.some((o) => o.obligation === "access_matrix_doc")).toBe(true);
  });

  test("actions with invalidation produce mutation invalidation test obligations", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });
    const UserKey = gen.key.family("UserKey", {
      input: gen.types.object({ id: gen.types.uuid() }),
    });

    gen.func.action({
      name: "updateUser",
      input_type: gen.types.object({ id: gen.types.uuid(), name: gen.types.string() }),
      returns: User,
      body: gen.func.buildActionUpdate(User, new Map()),
      reactivity: { invalidates: [gen.key.any(UserKey)] },
    });

    const graph = gen.obligations.derive();
    expect(graph.obligations.some((o) => o.obligation === "mutation_invalidation_test")).toBe(true);
  });

  test("requirements produce provider mock test obligations", () => {
    const { gen } = createGen();

    gen.requirement.define({
      name: "CurrentActor",
      value_type: gen.types.object({ id: gen.types.uuid() }),
    });

    const graph = gen.obligations.derive();
    expect(graph.obligations.some((o) => o.obligation === "provider_mock_test")).toBe(true);
  });

  test("hydration-sensitive state resources produce hydration safety test obligations", () => {
    const { gen } = createGen();

    gen.state.define({
      name: "ThemePreference",
      value_type: gen.types.string(),
      storage: gen.location.clientLocalStorage(),
      hydrate: true,
    });

    const graph = gen.obligations.derive();
    expect(graph.obligations.some((o) => o.obligation === "hydration_safety_test")).toBe(true);
  });

  test("cron jobs with idempotency produce cron idempotency test obligations", () => {
    const { gen } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    const schedule = gen.schedule.define({
      name: "everyMinute",
      expression: gen.schedule.cron("* * * * *"),
    });

    const action = gen.func.action({
      name: "cleanup",
      input_type: gen.types.object({}),
      returns: Task,
      body: gen.func.buildActionUpdate(Task, new Map()),
    });

    gen.cron.define({
      name: "cleanupJob",
      schedule,
      run_target: action,
      execution_policy: {
        kind: "cron_execution_policy",
        concurrency: "forbid",
        idempotency: true,
        observability: true,
      },
    });

    const graph = gen.obligations.derive();
    expect(graph.obligations.some((o) => o.obligation === "cron_idempotency_test")).toBe(true);
  });

  test("workflows with errors produce workflow error handler test obligations", () => {
    const { gen } = createGen();
    const Task = gen.entity("Task", { id: gen.types.uuid() });

    const action = gen.func.action({
      name: "doTask",
      input_type: gen.types.object({ id: gen.types.uuid() }),
      returns: Task,
      body: gen.func.buildActionUpdate(Task, new Map()),
    });

    gen.workflow.define({
      name: "processTask",
      input_type: gen.types.object({ id: gen.types.uuid() }),
      output_type: Task,
      errors: [{ code: "task_failed" }],
      plan: gen.workflow.action(action),
    });

    const graph = gen.obligations.derive();
    expect(graph.obligations.some((o) => o.obligation === "workflow_error_handler_test")).toBe(
      true,
    );
  });
});

describe("Phase 4 target fixtures", () => {
  test("docs target generates markdown artifacts from obligations", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    gen.authz.policy({ name: "userRead", target_entity: User, actions: [] });

    const docs = gen.targets.docs();
    expect(docs.length).toBeGreaterThanOrEqual(2);
    expect(docs.some((d) => d.title === "Obligations")).toBe(true);
    expect(docs.some((d) => d.title === "Access Matrix")).toBe(true);

    const obligationsDoc = docs.find((d) => d.title === "Obligations")!;
    expect(obligationsDoc.content).toContain("policy_test");
    expect(obligationsDoc.format).toBe("markdown");
  });

  test("tests target generates test suites from obligations", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    gen.authz.policy({ name: "userRead", target_entity: User, actions: [] });

    const suites = gen.targets.tests();
    expect(suites.length).toBeGreaterThanOrEqual(1);
    const policySuite = suites.find((s) => s.suite_name === "policy_test");
    expect(policySuite).toBeDefined();
    expect(policySuite!.cases.length).toBeGreaterThanOrEqual(1);
    expect(policySuite!.cases[0]!.suggested_path).toContain("tests/policy/");
  });

  test("devtools target generates graph with provider and state nodes", () => {
    const { gen } = createGen();

    gen.requirement.define({
      name: "CurrentActor",
      value_type: gen.types.object({ id: gen.types.uuid() }),
    });

    gen.state.define({
      name: "ThemePreference",
      value_type: gen.types.string(),
      storage: gen.location.clientLocalStorage(),
      hydrate: true,
    });

    const graph = gen.targets.devtools();
    expect(graph.kind).toBe("devtools_graph");
    expect(graph.nodes.some((n) => n.kind === "requirement")).toBe(true);
    expect(graph.nodes.some((n) => n.kind === "state_resource")).toBe(true);
  });
});

describe("Phase 4 provider lowering targets", () => {
  test("server target lowers providers to request context and env reads", () => {
    const { gen } = createGen();

    const ActorReq = gen.requirement.define({
      name: "CurrentActor",
      value_type: gen.types.object({ id: gen.types.uuid() }),
    });

    gen.provider.define({
      name: "ActorCookieProvider",
      provides: ActorReq,
      source: gen.provider.source.cookie("actor", ActorReq.value_type),
    });

    gen.provider.define({
      name: "ApiKeyEnvProvider",
      provides: gen.requirement.define({
        name: "ApiKey",
        value_type: gen.types.string(),
      }),
      source: gen.provider.source.envVar("API_KEY"),
    });

    const artifact = gen.targets.server();
    expect(artifact.kind).toBe("server_provider_artifact");
    expect(artifact.target).toBe("server");
    expect(artifact.request_context_wiring.length).toBeGreaterThanOrEqual(1);
    expect(artifact.env_reads.length).toBeGreaterThanOrEqual(1);
  });

  test("client target lowers state resources to storage hooks", () => {
    const { gen } = createGen();

    gen.state.define({
      name: "ThemePreference",
      value_type: gen.types.string(),
      storage: gen.location.clientLocalStorage(),
    });

    gen.state.define({
      name: "SessionToken",
      value_type: gen.types.string(),
      storage: gen.location.clientSessionStorage(),
    });

    const artifact = gen.targets.client();
    expect(artifact.kind).toBe("client_provider_artifact");
    expect(artifact.target).toBe("client");
    expect(artifact.state_bindings.some((b) => b.storage_kind === "localStorage")).toBe(true);
    expect(artifact.state_bindings.some((b) => b.storage_kind === "sessionStorage")).toBe(true);
  });

  test("target integration matrix documents Phase 4 support levels", () => {
    const { gen } = createGen();

    const matrix = gen.targets.matrix();
    expect(matrix.kind).toBe("target_integration_matrix");
    expect(matrix.rows.length).toBeGreaterThanOrEqual(2);

    const serverRow = matrix.rows.find((r) => r.target_name === "server");
    expect(serverRow).toBeDefined();
    expect(serverRow!.requirements_providers).toBe("full");
    expect(serverRow!.workflows).toBe("full");

    const clientRow = matrix.rows.find((r) => r.target_name === "client");
    expect(clientRow).toBeDefined();
    expect(clientRow!.state_resources).toBe("full");
    expect(clientRow!.cron_jobs).toBe("unsupported");
  });
});

describe("Phase 4 constrained rule views", () => {
  test("derived rule view is registered and exposes dependencies", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

    const view = gen.rule.defineView({
      name: "activeUsers",
      input_vars: [],
      output_type: gen.types.object({ id: gen.types.uuid(), name: gen.types.string() }),
      body: gen.rule.eq(
        gen.rule.field(User, User.fields.name, gen.types.string()),
        gen.rule.literal("active", gen.types.string()),
      ),
      projection: [{ name: "name", semanticType: gen.types.string() }],
      maintenance: "incremental",
    });

    expect(view.kind).toBe("derived_rule_view");
    expect(view.name).toBe("activeUsers");
    expect(ctx.derived_rule_views).toContain(view);

    const deps = gen.rule.viewDependencies(view);
    expect(deps.entities).toContain(User);
    expect(deps.fields).toContain(User.fields.name);
  });

  test("derived view diagnostic for unbound output variable", () => {
    const { gen } = createGen();

    const view = gen.rule.defineView({
      name: "badView",
      input_vars: [],
      output_type: gen.types.object({ id: gen.types.uuid() }),
      body: gen.rule.eq(
        gen.rule.literal(true, gen.types.boolean()),
        gen.rule.literal(true, gen.types.boolean()),
      ),
      projection: [{ name: "missingVar", semanticType: gen.types.string() }],
    });

    const diagnostics = checkDerivedRuleViews([view]);
    expect(diagnostics.some((d) => d.code === "rules:view-unbound-output-variable")).toBe(true);
  });

  test("derived view diagnostic for unsafe negation", () => {
    const { gen } = createGen();

    const view = gen.rule.defineView({
      name: "negatedView",
      input_vars: [],
      output_type: gen.types.object({ id: gen.types.uuid() }),
      body: gen.rule.not(
        gen.rule.and(
          gen.rule.eq(
            gen.rule.literal(true, gen.types.boolean()),
            gen.rule.literal(true, gen.types.boolean()),
          ),
        ),
      ),
      projection: [],
    });

    const diagnostics = checkDerivedRuleViews([view]);
    expect(diagnostics.some((d) => d.code === "rules:view-unsafe-negation")).toBe(true);
  });
});
