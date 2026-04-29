import { expect, test } from "vite-plus/test";
import { createGen, reactivity } from "../src/index.ts";

test("key families produce inspectable static records", () => {
  const UserKey = reactivity.defineKeyFamily<{ readonly id: string }>("User");
  const key = reactivity.key(UserKey, { id: "u_1" });
  const pattern = reactivity.matchKey(UserKey, { id: "u_1" });

  expect(key).toEqual({ kind: "reactive_key", family: UserKey, payload: { id: "u_1" } });
  expect(pattern).toEqual({ kind: "reactive_key_pattern", family: UserKey, match: { id: "u_1" } });
});

test("gen.key registers key families in context", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });

  const custom = gen.key.family<{ readonly id: string }>("User");
  const entity = gen.key.entity(User);
  const collection = gen.key.collection(User);

  expect(ctx.key_families).toEqual([custom, entity, collection]);
});

test("key family any pattern matches all payloads", () => {
  const UserKey = reactivity.defineKeyFamily<{ readonly id: string }>("User");

  expect(reactivity.anyKey(UserKey)).toEqual({
    kind: "reactive_key_pattern",
    family: UserKey,
    match: "any",
  });
});

test("reactive resources and mutations are static records registered in context", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const UserKey = gen.key.family<{ readonly id: string }>("User");
  const query = gen.func.query({
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

  const resource = gen.reactivity.resource({
    name: "userResource",
    query,
    refresh: [gen.reactivity.refresh.onMount()],
  });
  const mutation = gen.reactivity.mutation({ name: "updateUserMutation", action });

  expect(resource).toEqual({
    kind: "reactive_resource",
    name: "userResource",
    query,
    refresh: [{ kind: "on_mount" }],
  });
  expect(mutation.invalidates).toEqual({ patterns: [gen.key.any(UserKey)] });
  expect(ctx.reactive_resources).toEqual([resource]);
  expect(ctx.reactive_mutations).toEqual([mutation]);
});

test("reactive graph derivation is deterministic for keys functions resources and mutations", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const UserKey = gen.key.family<{ readonly id: string }>("User");
  const query = gen.func.query({
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
    invalidates: [query],
  });

  gen.reactivity.resource({ name: "userResource", query });
  gen.reactivity.mutation({ name: "updateUserMutation", action });

  expect(gen.reactivity.graph(ctx)).toEqual({
    kind: "reactive_graph",
    nodes: [
      { id: "action:updateUser", kind: "action_function", name: "updateUser" },
      { id: "entity:User", kind: "entity", name: "User" },
      { id: "key:User", kind: "key_family", name: "User" },
      { id: "mutation:updateUserMutation", kind: "mutation", name: "updateUserMutation" },
      { id: "query:getUser", kind: "query_function", name: "getUser" },
      { id: "resource:userResource", kind: "resource", name: "userResource" },
    ],
    edges: [
      { from: "action:updateUser", to: "entity:User", kind: "writes" },
      { from: "action:updateUser", to: "key:User", kind: "invalidates" },
      { from: "mutation:updateUserMutation", to: "action:updateUser", kind: "binds" },
      { from: "mutation:updateUserMutation", to: "key:User", kind: "invalidates" },
      { from: "query:getUser", to: "key:User", kind: "reads" },
      { from: "resource:userResource", to: "query:getUser", kind: "binds" },
    ],
  });
});

test("reactive graph reports resources affected by a mutation", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
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
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
    reactivity: { key: OrgKey },
  });
  const action = gen.func.action({
    name: "updateUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionUpdate(User, new Map()),
    reactivity: { invalidates: [gen.key.any(UserKey)] },
  });
  const userResource = gen.reactivity.resource({ name: "userResource", query: userQuery });
  gen.reactivity.resource({ name: "orgResource", query: orgQuery });
  const route = gen.api.route({
    method: { kind: "GET" },
    path: { template: "/users/:id", segments: [] },
    handler: gen.api.buildQueryHandler(userQuery),
  });
  const mutation = gen.reactivity.mutation({ name: "updateUserMutation", action });

  const graph = gen.reactivity.graph(ctx);

  expect(gen.reactivity.affectedKeysForMutation(graph, mutation)).toEqual([
    { id: "key:User", kind: "key_family", name: "User" },
  ]);
  expect(gen.reactivity.staleQueriesForKeys(graph, [UserKey])).toEqual([
    { id: "query:getUser", kind: "query_function", name: "getUser" },
  ]);
  expect(gen.reactivity.affectedResourcesForMutation(graph, mutation)).toEqual([
    { id: "resource:userResource", kind: "resource", name: userResource.name },
  ]);
  expect(gen.reactivity.affectedRoutesForMutation(graph, mutation)).toEqual([
    { id: "route:GET /users/:id", kind: "route", name: route.path.template },
  ]);
  expect(graph.edges).toContainEqual({
    from: "route:GET /users/:id",
    to: "query:getUser",
    kind: "binds",
  });
});

test("reactive graph can be emitted as a json artifact", () => {
  const { gen, ctx } = createGen();
  const UserKey = gen.key.family<{ readonly id: string }>("User");
  const graph = gen.reactivity.graph(ctx);

  expect(gen.reactivity.staleQueriesForKeys(graph, [UserKey])).toEqual([]);
  expect(gen.reactivity.graphArtifact(graph, "graphs/reactive.json")).toEqual({
    path: "graphs/reactive.json",
    kind: "asset",
    language: "json",
    content: `${JSON.stringify(graph, null, 2)}\n`,
    diagnostics: [],
  });
});

test("singleflight plan bundles mutation with affected loaders", () => {
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
  const userResource = gen.reactivity.resource({ name: "userResource", query: userQuery });
  const route = gen.api.route({
    method: { kind: "GET" },
    path: { template: "/users/:id", segments: [] },
    handler: gen.api.buildQueryHandler(userQuery),
  });
  const mutation = gen.reactivity.mutation({ name: "updateUserMutation", action });

  const graph = gen.reactivity.graph(ctx);
  const plan = gen.reactivity.singleFlight(ctx, graph);

  expect(plan.kind).toBe("single_flight_plan");
  expect(plan.mutations).toHaveLength(1);
  expect(plan.mutations[0].mutation).toBe(mutation);
  expect(plan.mutations[0].bundles).toHaveLength(1);
  expect(plan.mutations[0].bundles[0].kind).toBe("loader_bundle");
  expect(plan.mutations[0].bundles[0].loaders).toEqual([
    { id: "resource:userResource", kind: "resource", name: userResource.name },
    { id: "route:GET /users/:id", kind: "route", name: route.path.template },
  ]);
});

test("effect-atom target generates typescript from reactive graph", () => {
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
  gen.reactivity.resource({ name: "userResource", query: userQuery });
  gen.reactivity.mutation({ name: "updateUserMutation", action });

  const graph = gen.reactivity.graph(ctx);
  const { artifacts, diagnostics } = reactivity.generateEffectAtomArtifacts(graph);

  expect(diagnostics).toHaveLength(0);
  expect(artifacts).toHaveLength(1);
  expect(artifacts[0].path).toBe("effect-atom/reactive.ts");
  expect(artifacts[0].content).toContain("export const userResource = Atom.make");
  expect(artifacts[0].content).toContain("export const updateUserMutation = Atom.writable");
  expect(artifacts[0].content).toContain("get.refresh(userResource);");
});

test("reactive graph derives form nodes and form->action binds edges", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
  const UserKey = gen.key.family<{ readonly id: string }>("User");
  const createUser = gen.func.action({
    name: "createUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionInsert(User, new Map()),
    reactivity: { invalidates: [gen.key.any(UserKey)] },
  });
  const form = gen.forms.build("CreateUserForm", createUser, gen.types.uuid());
  const mutation = gen.reactivity.mutation({ name: "createUserMutation", action: createUser });

  const graph = gen.reactivity.graph(ctx);

  expect(graph.nodes).toContainEqual({ id: "form:CreateUserForm", kind: "form", name: form.name });
  expect(graph.edges).toContainEqual({
    from: "form:CreateUserForm",
    to: "action:createUser",
    kind: "binds",
  });
  expect(gen.reactivity.affectedFormsForMutation(graph, mutation)).toEqual([
    { id: "form:CreateUserForm", kind: "form", name: form.name },
  ]);
});

test("reactive graph derives event emit and subscription subscribe edges", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const event = gen.events.event("UserCreated", {
    fields: [{ name: "userId", field_type: gen.types.uuid() }],
  });
  const action = gen.func.action({
    name: "createUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionInsert(User, new Map()),
  });
  gen.events.emit(event, action);
  const handler = gen.func.static({
    name: "onUserCreated",
    input_type: gen.types.uuid(),
    output_type: gen.types.uuid(),
    body: { kind: "literal", output_type: gen.types.uuid(), requirements: [], effects: [] },
  });
  const subscription = gen.events.subscription("userCreatedSub", event, handler, gen.types.uuid());
  const mutation = gen.reactivity.mutation({ name: "createUserMutation", action });

  const graph = gen.reactivity.graph(ctx);

  expect(graph.nodes).toContainEqual({
    id: "event:UserCreated",
    kind: "event",
    name: "UserCreated",
  });
  expect(graph.nodes).toContainEqual({
    id: "subscription:userCreatedSub",
    kind: "subscription",
    name: subscription.name,
  });
  expect(graph.edges).toContainEqual({
    from: "action:createUser",
    to: "event:UserCreated",
    kind: "emits",
  });
  expect(graph.edges).toContainEqual({
    from: "subscription:userCreatedSub",
    to: "event:UserCreated",
    kind: "subscribes",
  });
  expect(gen.reactivity.affectedSubscriptionsForMutation(graph, mutation)).toEqual([
    { id: "subscription:userCreatedSub", kind: "subscription", name: subscription.name },
  ]);
});

test("reactive graph supports write-target queries by entity, action, and mutation", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Org = gen.entity("Org", { id: gen.types.uuid() });
  const updateUser = gen.func.action({
    name: "updateUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionUpdate(User, new Map()),
  });
  const updateOrg = gen.func.action({
    name: "updateOrg",
    input_type: gen.types.uuid(),
    returns: Org,
    body: gen.func.buildActionUpdate(Org, new Map()),
  });
  const userMutation = gen.reactivity.mutation({ name: "updateUserMutation", action: updateUser });
  gen.reactivity.mutation({ name: "updateOrgMutation", action: updateOrg });

  const graph = gen.reactivity.graph(ctx);

  expect(gen.reactivity.entitiesWrittenByAction(graph, updateUser)).toEqual([
    { id: "entity:User", kind: "entity", name: "User" },
  ]);
  expect(gen.reactivity.entitiesWrittenByMutation(graph, userMutation)).toEqual([
    { id: "entity:User", kind: "entity", name: "User" },
  ]);
  expect(gen.reactivity.actionsWritingEntity(graph, User)).toEqual([
    { id: "action:updateUser", kind: "action_function", name: "updateUser" },
  ]);
  expect(gen.reactivity.mutationsWritingEntity(graph, User)).toEqual([
    { id: "mutation:updateUserMutation", kind: "mutation", name: "updateUserMutation" },
  ]);
});

test("checkReactivity flags duplicate key family names", () => {
  const fam1 = reactivity.defineKeyFamily<{ readonly id: string }>("User");
  const fam2 = reactivity.defineKeyFamily<{ readonly id: string }>("User");
  const diags = reactivity.checkReactivity({
    key_families: [fam1, fam2],
    reactive_resources: [],
    reactive_mutations: [],
  });
  expect(diags.some((d) => d.code === "reactivity:duplicate-key-family")).toBe(true);
});

test("checkReactivity flags resources without a query function source", () => {
  const fakeResource = {
    kind: "reactive_resource",
    name: "userResource",
    query: { name: "getUser" } as never,
    refresh: [],
  } as const;
  const diags = reactivity.checkReactivity({
    key_families: [],
    reactive_resources: [fakeResource],
    reactive_mutations: [],
  });
  expect(diags.some((d) => d.code === "reactivity:resource-source-not-query")).toBe(true);
});

test("checkReactivity flags mutations without an action function source", () => {
  const fakeMutation = {
    kind: "reactive_mutation",
    name: "updateUserMutation",
    action: { name: "updateUser" } as never,
    invalidates: { patterns: [] },
  } as const;
  const diags = reactivity.checkReactivity({
    key_families: [],
    reactive_resources: [],
    reactive_mutations: [fakeMutation],
  });
  expect(diags.some((d) => d.code === "reactivity:mutation-source-not-action")).toBe(true);
});

test("tanstack-query target generates queryOptions and mutation factories", () => {
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
  gen.reactivity.resource({ name: "userResource", query: userQuery });
  gen.reactivity.mutation({ name: "updateUserMutation", action });

  const graph = gen.reactivity.graph(ctx);
  const { artifacts, diagnostics } = reactivity.generateTanstackQueryArtifacts(graph);

  expect(diagnostics).toHaveLength(0);
  expect(artifacts).toHaveLength(1);
  expect(artifacts[0].path).toBe("tanstack-query/reactive.ts");
  expect(artifacts[0].content).toContain(
    `import { queryOptions, type QueryClient } from "@tanstack/query-core";`,
  );
  expect(artifacts[0].content).toContain(
    `export const userResource = queryOptions({\n  queryKey: ["User"] as const,\n  queryFn: () => getUser(),\n});`,
  );
  expect(artifacts[0].content).toContain(
    `queryClient.invalidateQueries({ queryKey: ["User"] as const });`,
  );
});

test("checkReactivity flags raw-key-not-portable for string patterns", () => {
  const UserKey = reactivity.defineKeyFamily<{ readonly id: string }>("User");
  const fakeMutation = {
    kind: "reactive_mutation" as const,
    name: "updateUserMutation",
    action: {
      name: "updateUser",
      body: {
        kind: { kind: "update" as const },
        phase: "mutation" as const,
        target_entity: { name: "User" },
        operations: [],
        effects: [],
        requirements: [],
      },
      input_type: { name: "uuid" },
      input_fields: [],
      returns: { name: "User" },
      auth: undefined,
      errors: [],
      invalidates: [],
      consistency: "transactional" as const,
      written_stores: [],
      effects: [],
      requirements: [],
      target_runtimes: [],
    },
    invalidates: {
      patterns: [
        {
          kind: "reactive_key_pattern" as const,
          family: UserKey,
          match: "raw-string-key" as unknown as Partial<{ readonly id: string }>,
        },
      ],
    },
  };
  const diags = reactivity.checkReactivity({
    key_families: [UserKey],
    reactive_resources: [],
    reactive_mutations: [fakeMutation as never],
  });
  expect(diags.some((d) => d.code === "reactivity:raw-key-not-portable")).toBe(true);
});

test("hardened isQueryFunction guard rejects objects without query body shape", () => {
  expect(
    reactivity
      .checkReactivity({
        key_families: [],
        reactive_resources: [
          {
            kind: "reactive_resource",
            name: "badResource",
            query: { name: "getUser" } as never,
            refresh: [],
          } as const,
        ],
        reactive_mutations: [],
      })
      .some((d) => d.code === "reactivity:resource-source-not-query"),
  ).toBe(true);
});

test("hardened isActionFunction guard rejects objects without action body shape", () => {
  expect(
    reactivity
      .checkReactivity({
        key_families: [],
        reactive_resources: [],
        reactive_mutations: [
          {
            kind: "reactive_mutation",
            name: "badMutation",
            action: { name: "updateUser" } as never,
            invalidates: { patterns: [] },
          } as const,
        ],
      })
      .some((d) => d.code === "reactivity:mutation-source-not-action"),
  ).toBe(true);
});

test("gen.reactivity.all creates ResourceAll and registers in context", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { id: gen.types.uuid() });

  const userQuery = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });
  const postQuery = gen.func.query({
    name: "getPost",
    input_type: gen.types.uuid(),
    returns: Post,
    body: gen.query.build({
      source: { kind: "entity_source", entity: Post },
      result_type: gen.types.uuid(),
    }),
  });

  const userResource = gen.reactivity.resource({ name: "userResource", query: userQuery });
  const postResource = gen.reactivity.resource({ name: "postResource", query: postQuery });

  const all = gen.reactivity.all("dashboard", {
    branches: { user: userResource, post: postResource },
    mode: "parallel",
  });

  expect(all.kind).toBe("resource_all");
  expect(all.name).toBe("dashboard");
  expect(all.mode).toBe("parallel");
  expect(all.branches.user).toBe(userResource);
  expect(all.branches.post).toBe(postResource);
  expect(ctx.resource_alls).toEqual([all]);
});

test("gen.reactivity.chain creates ResourceChain and registers in context", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Profile = gen.entity("Profile", { id: gen.types.uuid() });

  const userQuery = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });
  const profileQuery = gen.func.query({
    name: "getProfile",
    input_type: gen.types.uuid(),
    returns: Profile,
    body: gen.query.build({
      source: { kind: "entity_source", entity: Profile },
      result_type: gen.types.uuid(),
    }),
  });

  const userResource = gen.reactivity.resource({ name: "userResource", query: userQuery });
  const profileResource = gen.reactivity.resource({ name: "profileResource", query: profileQuery });

  const deriveNext = gen.func.static({
    name: "deriveProfileInput",
    input_type: User,
    output_type: gen.types.uuid(),
    body: {
      kind: "native",
      output_type: gen.types.uuid(),
      requirements: [],
      effects: [],
    },
  });

  const chain = gen.reactivity.chain("userThenProfile", {
    source: userResource,
    derive_next: deriveNext,
    next_resource: profileResource,
  });

  expect(chain.kind).toBe("resource_chain");
  expect(chain.name).toBe("userThenProfile");
  expect(chain.source).toBe(userResource);
  expect(chain.derive_next).toBe(deriveNext);
  expect(chain.next_resource).toBe(profileResource);
  expect(ctx.resource_chains).toEqual([chain]);
});

test("deriveReactiveGraph includes resource_all and resource_chain nodes with edges", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { id: gen.types.uuid() });

  const userQuery = gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });
  const postQuery = gen.func.query({
    name: "getPost",
    input_type: gen.types.uuid(),
    returns: Post,
    body: gen.query.build({
      source: { kind: "entity_source", entity: Post },
      result_type: gen.types.uuid(),
    }),
  });

  const userResource = gen.reactivity.resource({ name: "userResource", query: userQuery });
  const postResource = gen.reactivity.resource({ name: "postResource", query: postQuery });

  gen.reactivity.all("dashboard", {
    branches: { user: userResource, post: postResource },
  });

  const deriveNext = gen.func.static({
    name: "derivePostInput",
    input_type: User,
    output_type: gen.types.uuid(),
    body: {
      kind: "native",
      output_type: gen.types.uuid(),
      requirements: [],
      effects: [],
    },
  });

  gen.reactivity.chain("userThenPost", {
    source: userResource,
    derive_next: deriveNext,
    next_resource: postResource,
  });

  const graph = gen.reactivity.graph(ctx);

  const allNode = graph.nodes.find((n) => n.kind === "resource_all" && n.name === "dashboard");
  expect(allNode).toBeDefined();

  const allEdges = graph.edges.filter((e) => e.from === allNode!.id && e.kind === "binds");
  expect(allEdges.map((e) => e.to)).toContain("resource:userResource");
  expect(allEdges.map((e) => e.to)).toContain("resource:postResource");

  const chainNode = graph.nodes.find((n) => n.kind === "resource_chain" && n.name === "userThenPost");
  expect(chainNode).toBeDefined();

  const chainBinds = graph.edges.filter((e) => e.from === chainNode!.id && e.kind === "binds");
  expect(chainBinds.map((e) => e.to)).toContain("resource:userResource");
  expect(chainBinds.map((e) => e.to)).toContain("resource:postResource");

  const chainReads = graph.edges.filter(
    (e) => e.from === "resource:userResource" && e.to === "resource:postResource" && e.kind === "reads",
  );
  expect(chainReads.length).toBe(1);
});

test("gen.reactivity.optimistic creates OptimisticPlan record", () => {
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

  const apply = gen.func.buildPatchInsert(query.body, [[User.fields.id, gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "temp" })]]);
  const rollback = gen.func.buildPatchDelete(query.body);

  const plan = gen.reactivity.optimistic({
    apply,
    rollback,
    fallback: { kind: "reject", reason: "unsafe" },
  });

  expect(plan.kind).toBe("optimistic_plan");
  expect(plan.apply).toBe(apply);
  expect(plan.rollback).toBe(rollback);
  expect(plan.fallback).toEqual({ kind: "reject", reason: "unsafe" });
  expect(plan.diagnostics).toEqual([]);
});

test("ReactiveMutation carries explicit optimistic plan", () => {
  const { gen, ctx } = createGen();
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
  void query;

  const action = gen.func.action({
    name: "createUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionInsert(User, [[User.fields.id, gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "temp" })]]),
  });

  const apply = gen.func.buildPatchInsert(query.body, [[User.fields.id, gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "temp" })]]);
  const rollback = gen.func.buildPatchDelete(query.body);

  const mutation = gen.reactivity.mutation({
    name: "createUserMutation",
    action,
    optimistic: gen.reactivity.optimistic({
      apply,
      rollback,
      fallback: { kind: "server_check", reason: "verify after create" },
    }),
  });

  expect(mutation.optimistic).toBeDefined();
  expect(mutation.optimistic!.apply).toBe(apply);
  expect(mutation.optimistic!.rollback).toBe(rollback);
  expect(ctx.reactive_mutations).toEqual([mutation]);
});

test("deriveDefaultOptimisticPlan derives plan for simple insert action", () => {
  const { gen, ctx } = createGen();
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
  void query;

  const action = gen.func.action({
    name: "createUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionInsert(User, [[User.fields.id, gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "temp" })]]),
  });

  gen.reactivity.mutation({ name: "createUserMutation", action });

  const mutation = ctx.reactive_mutations[0]!;
  expect(mutation.optimistic).toBeDefined();
  expect(mutation.optimistic!.apply.kind.kind).toBe("optimistic_insert");
  expect(mutation.optimistic!.rollback.kind.kind).toBe("optimistic_delete");
  expect(mutation.optimistic!.fallback.kind).toBe("degrade_to_hint");
  expect(mutation.optimistic!.diagnostics.some((d) => d.code === "reactivity:optimistic-unreconcilable")).toBe(true);
});

test("deriveDefaultOptimisticPlan derives plan for simple update action", () => {
  const { gen, ctx } = createGen();
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
  void query;

  const action = gen.func.action({
    name: "updateUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionUpdate(User, [[User.fields.id, gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "new" })]]),
  });

  gen.reactivity.mutation({ name: "updateUserMutation", action });

  const mutation = ctx.reactive_mutations[0]!;
  expect(mutation.optimistic).toBeDefined();
  expect(mutation.optimistic!.apply.kind.kind).toBe("optimistic_update");
  expect(mutation.optimistic!.rollback.kind.kind).toBe("optimistic_update");
  expect(mutation.optimistic!.diagnostics.some((d) => d.code === "reactivity:optimistic-unreconcilable")).toBe(true);
});

test("deriveDefaultOptimisticPlan derives plan for simple delete action", () => {
  const { gen, ctx } = createGen();
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
  void query;

  const action = gen.func.action({
    name: "deleteUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionDelete(User),
  });

  gen.reactivity.mutation({ name: "deleteUserMutation", action });

  const mutation = ctx.reactive_mutations[0]!;
  expect(mutation.optimistic).toBeDefined();
  expect(mutation.optimistic!.apply.kind.kind).toBe("optimistic_delete");
  expect(mutation.optimistic!.rollback.kind.kind).toBe("optimistic_insert");
  expect(mutation.optimistic!.diagnostics.some((d) => d.code === "reactivity:optimistic-unreconcilable")).toBe(true);
});

test("deriveDefaultOptimisticPlan returns undefined for multi-operation actions", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { id: gen.types.uuid() });

  const action = gen.func.action({
    name: "createUserAndPost",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionSequence(User, [
      gen.func.buildActionInsert(User, [[User.fields.id, gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "u1" })]]),
      gen.func.buildActionInsert(Post, [[Post.fields.id, gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "p1" })]]),
    ]),
  });

  gen.reactivity.mutation({ name: "createBothMutation", action });

  const mutation = ctx.reactive_mutations[0]!;
  expect(mutation.optimistic).toBeUndefined();
});

test("checkOptimisticPlans emits diagnostic for empty apply patch", () => {
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

  const apply: import("../src/function/index.ts").PatchExpr = {
    kind: { kind: "optimistic_insert" },
    phase: "client",
    target_query: query.body,
    patch_items: [],
    rollback_strategy: "inverse",
  };
  const rollback = gen.func.buildPatchDelete(query.body);

  const action = gen.func.action({
    name: "createUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionInsert(User, [[User.fields.id, gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "temp" })]]),
  });

  const mutation = gen.reactivity.mutation({
    name: "createUserMutation",
    action,
    optimistic: gen.reactivity.optimistic({
      apply,
      rollback,
      fallback: { kind: "reject", reason: "test" },
    }),
  });

  const diagnostics = gen.reactivity.checkOptimisticPlans({
    reactive_mutations: [mutation],
  });

  expect(diagnostics.some((d) => d.code === "reactivity:optimistic-empty-apply")).toBe(true);
});

test("checkOptimisticPlans surfaces plan diagnostics", () => {
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

  const apply = gen.func.buildPatchInsert(query.body, [[User.fields.id, gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "temp" })]]);
  const rollback = gen.func.buildPatchDelete(query.body);

  const action = gen.func.action({
    name: "createUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionInsert(User, [[User.fields.id, gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "temp" })]]),
  });

  const mutation = gen.reactivity.mutation({
    name: "createUserMutation",
    action,
    optimistic: gen.reactivity.optimistic({
      apply,
      rollback,
      fallback: { kind: "reject", reason: "test" },
      diagnostics: [
        {
          severity: "warning",
          code: "reactivity:optimistic-unreconcilable",
          message: "Rollback is coarse",
          refs: [],
        },
      ],
    }),
  });

  const diagnostics = gen.reactivity.checkOptimisticPlans({
    reactive_mutations: [mutation],
  });

  expect(diagnostics.some((d) => d.code === "reactivity:optimistic-unreconcilable")).toBe(true);
});
