import { expect, test } from "vite-plus/test";
import { createGen, lifecycle } from "../src/index.ts";

test("gen.services.define registers service refs in context", () => {
  const { gen, ctx } = createGen();
  const service = gen.services.define({
    name: "EmailService",
    methods: [
      gen.services.method({
        name: "send",
        input_type: gen.types.string(),
        output_type: gen.types.boolean(),
      }),
    ],
  });

  expect(service.kind).toBe("service_ref");
  expect(service.name).toBe("EmailService");
  expect(ctx.services).toEqual([service]);
});

test("deriveModuleGraph bubbles query requirements through resources", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const query = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
    requirements: [{ kind: "Database" }],
  });
  gen.reactivity.resource({ name: "userResource", query });

  const graph = gen.services.graph();

  expect(graph.kind).toBe("module_graph");
  const node = graph.nodes.find((n) => n.kind === "resource");
  expect(node).toBeDefined();
  expect(node!.requirements).toContainEqual({ kind: "Database" });
});

test("deriveModuleGraph bubbles action requirements through mutations", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const action = gen.func.action({
    name: "createUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionInsert(User, new Map()),
    requirements: [{ kind: "EmailClient" }],
  });
  gen.reactivity.mutation({ name: "createUserMutation", action });

  const graph = gen.services.graph();

  const node = graph.nodes.find((n) => n.kind === "mutation");
  expect(node).toBeDefined();
  expect(node!.requirements).toContainEqual({ kind: "EmailClient" });
});

test("deriveModuleGraph bubbles requirements through app routes", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const query = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
    requirements: [{ kind: "Database" }],
  });
  gen.router.route({
    path: "/users/:id",
    path_params: { id: gen.types.uuid() },
    loaders: [query],
  });

  const graph = gen.services.graph();

  const node = graph.nodes.find((n) => n.kind === "app_route");
  expect(node).toBeDefined();
  expect(node!.requirements).toContainEqual({ kind: "Database" });
});

test("deriveModuleGraph bubbles requirements through forms", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
  const action = gen.func.action({
    name: "createUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionInsert(User, new Map()),
    requirements: [{ kind: "AuditLog" }],
  });
  gen.forms.build("CreateUserForm", action, gen.types.uuid());

  const graph = gen.services.graph();

  const node = graph.nodes.find((n) => n.kind === "form");
  expect(node).toBeDefined();
  expect(node!.requirements).toContainEqual({ kind: "AuditLog" });
});

test("checkServices emits diagnostic for missing provider", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const query = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
    requirements: [{ kind: "Database" }],
  });
  gen.reactivity.resource({ name: "userResource", query });

  const result = lifecycle.check(ctx);

  expect(result.status).toBe("has_errors");
  expect(result.diagnostics.some((d) => d.code === "services:missing-provider")).toBe(true);
  const diag = result.diagnostics.find((d) => d.code === "services:missing-provider");
  expect(diag!.message).toContain("Database");
  expect(diag!.message).toContain("userResource");
});

test("checkServices passes when required service is registered", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.services.define({ name: "Database" });
  const query = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
    requirements: [{ kind: "Database" }],
  });
  gen.reactivity.resource({ name: "userResource", query });

  const result = lifecycle.check(ctx);

  expect(result.diagnostics.some((d) => d.code === "services:missing-provider")).toBe(false);
});

test("module graph deduplicates missing service entries", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const query = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
    requirements: [{ kind: "Database" }, { kind: "Database" }],
  });
  gen.reactivity.resource({ name: "userResource", query });

  const graph = gen.services.graph();
  const node = graph.nodes.find((n) => n.kind === "resource")!;

  expect(node.missing_services).toEqual(["Database"]);
});
