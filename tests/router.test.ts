import { expect, test } from "vite-plus/test";
import { createGen, lifecycle, router } from "../src/index.ts";
import { defineNode } from "../src/core/node-lowering.ts";

test("gen.router.route registers app routes in context", () => {
  const { gen, ctx } = createGen();
  gen.entity("User", { id: gen.types.uuid() });
  const route = gen.router.route({
    path: "/users/:id",
    path_params: { id: gen.types.uuid() },
  });

  expect(route.kind).toBe("app_route");
  expect(route.path).toBe("/users/:id");
  expect(ctx.app_routes).toEqual([route]);
});

test("checkAppRoute emits diagnostic for missing path param schema", () => {
  const { gen, ctx } = createGen();
  gen.router.route({
    path: "/users/:id",
  });

  const result = lifecycle.check(ctx);
  expect(result.status).toBe("has_errors");
  expect(result.diagnostics.some((d) => d.code === "router:path-param-missing-schema")).toBe(true);
});

test("checkAppRoute emits warning for unused path param schema", () => {
  const { gen, ctx } = createGen();
  gen.router.route({
    path: "/users",
    path_params: { id: gen.types.uuid() },
  });

  const result = lifecycle.check(ctx);
  expect(result.status).toBe("has_warnings");
  expect(result.diagnostics.some((d) => d.code === "router:path-param-unused-schema")).toBe(true);
});

test("reactive graph derives app route nodes and loader binds edges", () => {
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
  const route = gen.router.route({
    path: "/users/:id",
    path_params: { id: gen.types.uuid() },
    loaders: [userQuery],
  });

  const graph = gen.reactivity.graph(ctx);

  expect(graph.nodes).toContainEqual({
    id: "app_route:/users/:id",
    kind: "app_route",
    name: route.path,
  });
  expect(graph.edges).toContainEqual({
    from: "app_route:/users/:id",
    to: "function.getUser",
    kind: "route_loads",
  });
});

test("reactive graph derives app route action binds edge", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const updateUser = gen.func.action({
    name: "updateUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionUpdate(User, new Map()),
  });
  gen.router.route({
    path: "/users/:id",
    path_params: { id: gen.types.uuid() },
    action: updateUser,
  });

  const graph = gen.reactivity.graph(ctx);

  expect(graph.edges).toContainEqual({
    from: "app_route:/users/:id",
    to: "function.updateUser",
    kind: "route_submits",
  });
});

test("reactive graph derives app route with reactive resource loader", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const userQuery = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });
  const userResource = gen.reactivity.resource({ name: "userResource", query: userQuery });
  gen.router.route({
    path: "/users/:id",
    path_params: { id: gen.types.uuid() },
    loaders: [userResource],
  });

  const graph = gen.reactivity.graph(ctx);

  expect(graph.nodes).toContainEqual({
    id: "resource:userResource",
    kind: "resource",
    name: "userResource",
  });
  expect(graph.edges).toContainEqual({
    from: "app_route:/users/:id",
    to: "resource:userResource",
    kind: "route_loads",
  });
});

test("reactive graph derives app route with reactive mutation action", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const updateUser = gen.func.action({
    name: "updateUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionUpdate(User, new Map()),
  });
  const mutation = gen.reactivity.mutation({ name: "updateUserMutation", action: updateUser });
  gen.router.route({
    path: "/users/:id",
    path_params: { id: gen.types.uuid() },
    action: mutation,
  });

  const graph = gen.reactivity.graph(ctx);

  expect(graph.edges).toContainEqual({
    from: "app_route:/users/:id",
    to: "mutation:updateUserMutation",
    kind: "route_submits",
  });
});

test("affectedRoutesForMutation includes app routes with stale loaders", () => {
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
  const action = gen.func.action({
    name: "updateUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionUpdate(User, new Map()),
    reactivity: { invalidates: [gen.key.any(UserKey)] },
  });
  gen.router.route({
    path: "/users/:id",
    path_params: { id: gen.types.uuid() },
    loaders: [userQuery],
  });
  const mutation = gen.reactivity.mutation({ name: "updateUserMutation", action });

  const graph = gen.reactivity.graph(ctx);
  const affected = gen.reactivity.affectedRoutesForMutation(graph, mutation);

  expect(affected).toContainEqual({
    id: "app_route:/users/:id",
    kind: "app_route",
    name: "/users/:id",
  });
});

test("router.link fills path parameters into a concrete path", () => {
  const { gen } = createGen();
  const route = gen.router.route({
    path: "/users/:id/posts/:postId",
    path_params: { id: gen.types.uuid(), postId: gen.types.uuid() },
  });

  const path = router.link(route, { id: "u1", postId: "p2" });
  expect(path).toBe("/users/u1/posts/p2");
});

test("router.link replaces multiple occurrences of the same param", () => {
  const { gen } = createGen();
  const route = gen.router.route({
    path: "/users/:id/avatar/:id",
    path_params: { id: gen.types.uuid() },
  });

  const path = router.link(route, { id: "u1" });
  expect(path).toBe("/users/u1/avatar/u1");
});

test("custom trait-implementing node works as a route loader", () => {
  const { gen, ctx } = createGen();
  const _User = gen.entity("User", { id: gen.types.uuid() });
  void _User;

  // Define a custom callable+readable+server-placeable node
  const customLoader = defineNode({
    kind: "custom_loader",
    name: "customUserLoader",
    traits: ["callable", "readable", "server_placeable"],
    input: gen.types.uuid(),
    output: gen.types.uuid(),
  });

  // Use the custom node as a route loader
  gen.router.route({
    path: "/users/:id",
    path_params: { id: gen.types.uuid() },
    loaders: [customLoader as any],
  });

  // Derive the reactive graph
  const graph = gen.reactivity.graph(ctx);

  // The graph should contain the app route node
  expect(graph.nodes.some((n) => n.kind === "app_route" && n.name === "/users/:id")).toBe(true);

  // The graph should contain the custom loader node
  expect(
    graph.nodes.some((n) => n.kind === "query_function" && n.name === "customUserLoader"),
  ).toBe(true);

  // There should be a route_loads edge from the route to the custom loader
  expect(
    graph.edges.some(
      (e) =>
        e.from === "app_route:/users/:id" &&
        e.to === "node:customUserLoader" &&
        e.kind === "route_loads",
    ),
  ).toBe(true);
});
