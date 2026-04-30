import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";

test("hydration plan derives keys from query function loaders", () => {
  const { gen } = createGen();
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

  const plan = gen.hydration.plan(route);

  expect(plan.kind).toBe("hydration_snapshot");
  expect(plan.route_path).toBe("/users/:id");
  expect(plan.loaders).toEqual(["getUser"]);
  expect(plan.keys).toEqual([
    { kind: "constant_key_expression", family: UserKey, payload: undefined },
  ]);
});

test("hydration plan derives keys from reactive resource loaders", () => {
  const { gen } = createGen();
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
  const route = gen.router.route({
    path: "/users/:id",
    path_params: { id: gen.types.uuid() },
    loaders: [userResource],
  });

  const plan = gen.hydration.plan(route);

  expect(plan.loaders).toEqual(["userResource"]);
  expect(plan.keys).toEqual([
    { kind: "constant_key_expression", family: UserKey, payload: undefined },
  ]);
});

test("hydration plan includes multiple loaders and keys", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Org = gen.entity("Org", { id: gen.types.uuid() });
  const UserKey = gen.key.family<{ readonly id: string }>("User");
  const OrgKey = gen.key.family<{ readonly id: string }>("Org");
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
  const orgQuery = gen.func.query({
    name: "getOrg",
    input_type: gen.types.uuid(),
    returns: Org,
    body: gen.query.build({
      source: { kind: "entity_source", entity: Org },
      result_type: gen.types.uuid(),
    }),
    reactivity: { key: OrgKey },
  });
  const route = gen.router.route({
    path: "/dashboard",
    loaders: [userQuery, orgQuery],
  });

  const plan = gen.hydration.plan(route);

  expect(plan.loaders).toEqual(["getUser", "getOrg"]);
  expect(plan.keys).toEqual([
    { kind: "constant_key_expression", family: UserKey, payload: undefined },
    { kind: "constant_key_expression", family: OrgKey, payload: undefined },
  ]);
});

test("hydration plan omits keys for loaders without reactivity key", () => {
  const { gen } = createGen();
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
  const route = gen.router.route({
    path: "/users/:id",
    path_params: { id: gen.types.uuid() },
    loaders: [userQuery],
  });

  const plan = gen.hydration.plan(route);

  expect(plan.loaders).toEqual(["getUser"]);
  expect(plan.keys).toEqual([]);
});

test("hydration artifact produces json with default path", () => {
  const { gen } = createGen();
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

  const plan = gen.hydration.plan(route);
  const artifact = gen.hydration.artifact(plan);

  expect(artifact.path).toBe("hydration/_users__id.json");
  expect(artifact.kind).toBe("asset");
  expect(artifact.language).toBe("json");
  expect(artifact.content).toContain('"kind": "hydration_snapshot"');
  expect(artifact.content).toContain('"route_path": "/users/:id"');
});

test("hydration artifact accepts custom path", () => {
  const { gen } = createGen();
  const route = gen.router.route({ path: "/" });
  const plan = gen.hydration.plan(route);
  const artifact = gen.hydration.artifact(plan, "custom/path.json");

  expect(artifact.path).toBe("custom/path.json");
});
