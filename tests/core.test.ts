/**
 * Tests for core framework behavior, including context creation, registration of
 * entities, stores, queries, projections, plugins, and eager diagnostics.
 */
import { expect, test } from "vite-plus/test";
import {
  createApiNamespace,
  createDbNamespace,
  createGen,
  createQueryNamespace,
  createUiNamespace,
  db,
  definePlugin,
} from "../src/index.ts";

declare module "../src/index.ts" {
  interface UiBackendRegistry {
    html: {
      element: { readonly backend: "html"; readonly tag: string };
      namespace: {
        readonly htmlElement: (tag: string) => { readonly backend: "html"; readonly tag: string };
        readonly htmlSlot: (name: string) => import("../src/ui/index.ts").Slot;
      };
    };
  }
}

test("createGen produces an idle context with no plugins", () => {
  const { ctx, gen } = createGen();
  expect(ctx.status).toBe("idle");
  expect(ctx.plugins.length).toBe(0);
  expect(ctx.entities.length).toBe(0);
  expect(ctx.refs.length).toBe(0);
  expect(typeof gen.entity).toBe("function");
});

test("context-bound gen constructors register created objects", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    email: gen.types.email(),
  });
  const store = gen.store({ name: "primary", dialect: "postgres" });
  const runtime = gen.runtime({ name: "node20" });
  const query = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
  });

  expect(ctx.entities).toContain(User);
  expect(ctx.refs).toEqual([User.ref, User.fields.id.ref, User.fields.email.ref]);
  expect(ctx.stores).toContain(store);
  expect(ctx.runtimes).toContain(runtime);
  expect(ctx.queries).toContain(query);
});

test("serializer, contract, actor, config entry, and default instance register in context", () => {
  const { ctx, gen } = createGen();
  const serializer = gen.types.serializer(
    gen.types.datetime(),
    gen.types.string(),
    {
      kind: "schema",
      value_type: gen.types.string(),
      contains_opaque_js: false,
      requirements: [],
      effects: [],
    },
    {
      kind: "schema",
      value_type: gen.types.datetime(),
      contains_opaque_js: false,
      requirements: [],
      effects: [],
    },
  );
  const contract = gen.contract("Codec", []);
  const actor = gen.actor("User", "email");
  const entry = gen.config.entry("DATABASE_URL", "url");
  const defaults = gen.config.defaultInstance(
    "User",
    "admin",
    new Map([["email", "admin@example.com"]]),
  );

  expect(ctx.serializers).toContain(serializer);
  expect(ctx.contracts).toContain(contract);
  expect(ctx.actors).toContain(actor);
  expect(ctx.config.entries).toContain(entry);
  expect(ctx.defaults).toContain(defaults);
});

test("projection and resource constructors register graph objects", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    email: gen.types.email(),
  });
  const mapping = gen.mapping(User, []);
  const projection = gen.projection(mapping, [User.fields.id]);
  const resource = gen.api.resource({
    target_entity: User,
    path: "/users",
  });

  expect(ctx.projections).toContain(projection);
  expect(ctx.resources).toContain(resource);
});

test("projection emits eager diagnostic for fields not present in mapping", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    email: gen.types.email(),
  });
  const mapping = gen.mapping(User, []);

  gen.projection(mapping, [User.fields.email]);

  expect(ctx.diagnostics.some((d) => d.code === "storage:projection-field-not-mapped")).toBe(true);
});

test("route emits eager diagnostic for handler kind mismatch", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const queryFunc = gen.func.query({
    name: "getUser",
    input_type: gen.types.object({ id: gen.types.uuid() }),
    input_fields: [User.fields.id],
    returns: gen.types.uuid(),
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });

  gen.api.route({
    method: { kind: "GET" },
    path: { template: "/users/:id", segments: [] },
    handler: { kind: "action", query_func: queryFunc },
  });

  expect(ctx.diagnostics.some((d) => d.code === "api:handler-kind-mismatch")).toBe(true);
});

test("graph emits eager diagnostic for relations whose entities are missing from graph", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { authorId: gen.types.uuid() });
  const relation = gen.relation({
    name: "PostAuthor",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.authorId,
    to_field: User.fields.id,
  });

  gen.graph("BrokenGraph", [User], [relation]);

  expect(ctx.diagnostics.some((d) => d.code === "relations:graph-missing-entity")).toBe(true);
});

test("getter emits eager diagnostics for wrong field ownership and projection mismatch", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { id: gen.types.uuid() });
  const postMapping = gen.mapping(Post, []);
  const postProjection = gen.projection(postMapping, []);

  gen.api.getter({
    name: "getUser",
    target_entity: User,
    by_field: Post.fields.id,
    projection: postProjection,
  });

  expect(ctx.diagnostics.some((d) => d.code === "entity:wrong-entity-field")).toBe(true);
  expect(ctx.diagnostics.some((d) => d.code === "api:getter-projection-entity-mismatch")).toBe(
    true,
  );
});

test("mutator emits eager diagnostics for mapping, return projection, and input mismatch", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { id: gen.types.uuid() });
  const postMapping = gen.mapping(Post, []);
  const postProjection = gen.projection(postMapping, []);

  gen.api.mutator({
    name: "updateUser",
    target_entity: User,
    input_fields: [User.fields.id],
    mapping: postMapping,
    returns: postProjection,
  });

  expect(ctx.diagnostics.some((d) => d.code === "api:mutator-mapping-entity-mismatch")).toBe(true);
  expect(ctx.diagnostics.some((d) => d.code === "api:mutator-returns-entity-mismatch")).toBe(true);
  expect(ctx.diagnostics.some((d) => d.code === "api:mutator-input-not-mapped")).toBe(true);
});

test("relation emits eager diagnostics for wrong field ownership and type mismatch", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { authorId: gen.types.uuid(), title: gen.types.string() });

  gen.relation({
    name: "BrokenRelation",
    kind: "many_to_one",
    from_entity: User,
    to_entity: Post,
    from_field: Post.fields.authorId,
    to_field: Post.fields.title,
  });

  expect(
    ctx.diagnostics.filter((d) => d.code === "entity:wrong-entity-field").length,
  ).toBeGreaterThan(0);
  expect(ctx.diagnostics.some((d) => d.code === "relations:field-type-mismatch")).toBe(true);
});

test("createGen registers plugins and runs their setup functions", () => {
  let setupRan = 0;
  const plugin = definePlugin({
    id: "test/p1",
    namespace: "p1",
    setup: () => {
      setupRan++;
      return { runtimes: ["my-runtime"] };
    },
  });
  const { ctx } = createGen({ plugins: [plugin] });
  expect(setupRan).toBe(1);
  expect(ctx.plugins).toHaveLength(1);
  expect(ctx.plugins[0]!.status).toBe("active");
  expect(ctx.contributions.get("test/p1")?.runtimes).toEqual(["my-runtime"]);
});

test("plugin helper namespaces are merged onto gen at runtime", () => {
  const plugin = definePlugin({
    id: "test/helpers",
    namespace: "helpers",
    setup: () => ({
      helpers: [
        { name: "answer", namespace: "demo", value: 42 },
        { name: "label", namespace: "demo", value: "ok" },
      ],
    }),
  });

  const { gen, ctx } = createGen({ plugins: [plugin] });
  const pluginGen = gen as typeof gen & { demo: { answer: number; label: string } };

  expect(pluginGen.demo.answer).toBe(42);
  expect(pluginGen.demo.label).toBe("ok");
  expect(ctx.helpers.get("demo")).toEqual({ answer: 42, label: "ok" });
});

test("plugin helpers can contribute callable extension functions", () => {
  const plugin = definePlugin({
    id: "test/callable-helper",
    namespace: "helpers",
    setup: () => ({
      helpers: [
        {
          name: "prefix",
          namespace: "strings",
          value: (value: string) => `plugin:${value}`,
        },
      ],
    }),
  });

  const { gen, ctx } = createGen({ plugins: [plugin] });
  const pluginGen = gen as typeof gen & { strings: { prefix: (value: string) => string } };

  expect(pluginGen.strings.prefix("x")).toBe("plugin:x");
  expect(ctx.plugins[0]!.helpers[0]!.available_in).toBe(ctx);
});

test("plugin helpers can materialize context-bound extension APIs", () => {
  const plugin = definePlugin({
    id: "test/materialized-helper",
    namespace: "helpers",
    setup: () => ({
      helpers: [
        {
          name: "entityCount",
          namespace: "meta",
          materialize: ({ ctx, gen }) => {
            const runtimeCtx = ctx as { entities: unknown[] };
            const runtimeGen = gen as { types: { string: () => unknown } };
            return {
              count: () => runtimeCtx.entities.length,
              sampleType: () => runtimeGen.types.string(),
            };
          },
        },
      ],
    }),
  });

  const { gen, ctx } = createGen({ plugins: [plugin] });
  const pluginGen = gen as typeof gen & {
    meta: { entityCount: { count: () => number; sampleType: () => unknown } };
  };

  gen.entity("User", { id: gen.types.uuid() });

  expect(pluginGen.meta.entityCount.count()).toBe(1);
  expect(pluginGen.meta.entityCount.sampleType()).toEqual(gen.types.string());
  expect(typeof ctx.helpers.get("meta")?.entityCount).toBe("object");
});

test("db plugin materializes named stores and default aliases on gen.db", () => {
  const { gen, ctx } = createGen({
    plugins: [
      db({
        stores: {
          primary: { dialect: "postgres", version: "16" },
          cache: { dialect: "redis", version: "7" },
        },
        default: "primary",
      }),
    ],
  });

  expect(gen.db.primary.store.name).toBe("primary");
  expect(gen.db.cache.store.name).toBe("cache");
  expect(gen.db.store.name).toBe("primary");
  expect(ctx.stores.map((store) => store.name).sort()).toEqual(["cache", "primary"]);
});

test("db plugin default table alias registers tables on the default store", () => {
  const { gen, ctx } = createGen({
    plugins: [
      db({
        stores: {
          primary: { dialect: "postgres" },
        },
        default: "primary",
      }),
    ],
  });

  const table = gen.db.table("users", []);

  expect(table.store.name).toBe("primary");
  expect(ctx.tables).toContain(table);
});

test("db plugin schema helpers register schemas in context", () => {
  const { gen, ctx } = createGen({
    plugins: [
      db({
        stores: {
          primary: { dialect: "postgres" },
        },
        default: "primary",
      }),
    ],
  });

  const users = gen.db.primary.table("users", []);
  const schema = gen.db.primary.schema({ tables: [users] });
  const defaultSchema = gen.db.schema({ tables: [users] });

  expect(schema.store.name).toBe("primary");
  expect(defaultSchema.store.name).toBe("primary");
  expect(ctx.schemas).toContain(schema);
  expect(ctx.schemas).toContain(defaultSchema);
});

test("createDbNamespace builds a backend-specific namespace from ctx/gen/options", () => {
  const { ctx, gen } = createGen();
  const namespace = createDbNamespace(ctx, gen, {
    stores: {
      primary: { dialect: "postgres" },
      cache: { dialect: "redis" },
    },
    default: "primary",
  });

  expect(namespace.primary.store.name).toBe("primary");
  expect(namespace.cache.store.name).toBe("cache");
  expect(namespace.store.name).toBe("primary");
  expect(ctx.stores.map((store) => store.name).sort()).toEqual(["cache", "primary"]);
});

test("built-in namespace factories expose typed reusable boundaries", () => {
  const { ctx, gen } = createGen();
  const query = createQueryNamespace(ctx);
  const api = createApiNamespace(ctx);
  const User = gen.entity("User", { id: gen.types.uuid() });
  const q = query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
  });
  const route = api.route({
    method: { kind: "GET" },
    path: { template: "/users", segments: [] },
    handler: {
      kind: "query",
      query_func: gen.func.query({
        name: "listUsers",
        input_type: gen.types.object({}),
        returns: gen.types.uuid(),
        body: q,
      }),
    },
  });

  expect(ctx.queries).toContain(q);
  expect(ctx.routes).toContain(route);
});

test("ui backend config propagates typed jsx namespace helpers", () => {
  const { gen, ctx } = createGen<{ ui: { backend: "jsx" } }>({ ui: { backend: "jsx" } });

  const element = gen.ui.jsxElement("div");
  const platform = gen.ui.jsxPlatform("web");
  const renderer = gen.ui.jsxRenderer("react", platform.platform);
  const slot = gen.ui.jsxSlot("root", gen.ui.cap("Container"));
  const view = gen.ui.jsxView("Page", [slot], "page", [platform.platform]);
  const component = gen.ui.jsxComponent("PageComponent", "PageProps", view.view);

  expect(element.backend).toBe("jsx");
  expect(element.tag).toBe("div");
  expect(platform.platform.name).toBe("web");
  expect(renderer.renderer.target_platform).toBe(platform.platform);
  expect(view.view.target_platforms[0]).toBe(platform.platform);
  expect(component.component.view).toBe(view.view);
  expect(ctx.views).toContain(view.view);
  expect(ctx.components).toContain(component.component);
});

test("ui backend config propagates typed tui namespace helpers", () => {
  const { gen, ctx } = createGen<{ ui: { backend: "tui" } }>({ ui: { backend: "tui" } });

  const element = gen.ui.tuiElement("list");
  const platform = gen.ui.tuiPlatform("terminal");
  const renderer = gen.ui.tuiRenderer("blessed", platform.platform);
  const slot = gen.ui.tuiSlot("root", gen.ui.cap("Container"));
  const view = gen.ui.tuiView("Panel", [slot], "panel", [platform.platform]);
  const component = gen.ui.tuiComponent("PanelComponent", "PanelProps", view.view);

  expect(element.backend).toBe("tui");
  expect(element.kind).toBe("list");
  expect(platform.platform.name).toBe("terminal");
  expect(renderer.renderer.target_platform).toBe(platform.platform);
  expect(view.view.target_platforms[0]).toBe(platform.platform);
  expect(component.component.view).toBe(view.view);
  expect(ctx.views).toContain(view.view);
  expect(ctx.components).toContain(component.component);
});

test("createUiNamespace accepts explicit backend options for jsx", () => {
  const { ctx } = createGen();
  const ui = createUiNamespace(ctx, { backend: "jsx" });

  const element = ui.jsxElement("section");
  const platform = ui.jsxPlatform("web");
  const slot = ui.jsxSlot("root", ui.cap("Container"));
  const view = ui.jsxView("SectionView", [slot], "section", [platform.platform]);

  expect(element.backend).toBe("jsx");
  expect(element.tag).toBe("section");
  expect(platform.platform.name).toBe("web");
  expect(view.view.target_platforms[0]).toBe(platform.platform);
});

test("createUiNamespace accepts explicit backend options for tui", () => {
  const { ctx } = createGen();
  const ui = createUiNamespace(ctx, { backend: "tui" });

  const element = ui.tuiElement("panel");
  const platform = ui.tuiPlatform("terminal");
  const slot = ui.tuiSlot("root", ui.cap("Container"));
  const view = ui.tuiView("PanelView", [slot], "panel", [platform.platform]);

  expect(element.backend).toBe("tui");
  expect(element.kind).toBe("panel");
  expect(platform.platform.name).toBe("terminal");
  expect(view.view.target_platforms[0]).toBe(platform.platform);
});

test("createUiNamespace defaults to jsx backend", () => {
  const { ctx } = createGen();
  const ui = createUiNamespace(ctx);

  const element = ui.jsxElement("main");

  expect(element.backend).toBe("jsx");
  expect(element.tag).toBe("main");
});

test("createUiNamespace accepts user-provided backend factories", () => {
  const { ctx } = createGen();
  const ui = createUiNamespace(ctx, {
    backend: "html",
    factory: {
      backend: "html",
      create: (_ctx, base) => ({
        htmlElement: (tag: string) => ({ backend: "html" as const, tag }),
        htmlSlot: (name: string) => base.slot(name, base.cap("Container")),
      }),
    },
  });

  const element = ui.htmlElement("article");
  const slot = ui.htmlSlot("root");

  expect(element.backend).toBe("html");
  expect(element.tag).toBe("article");
  expect(slot.name).toBe("root");
});

test("createGen propagates user-provided backend factories through ui config", () => {
  const { gen } = createGen<{ ui: { backend: "html" } }>({
    ui: {
      backend: "html",
      factory: {
        backend: "html",
        create: (_ctx, base) => ({
          htmlElement: (tag: string) => ({ backend: "html" as const, tag }),
          htmlSlot: (name: string) => base.slot(name, base.cap("Container")),
        }),
      },
    },
  });

  const element = gen.ui.htmlElement("aside");
  const slot = gen.ui.htmlSlot("root");

  expect(element.backend).toBe("html");
  expect(element.tag).toBe("aside");
  expect(slot.name).toBe("root");
});

test("schemaTargetInput wraps schemas as concrete target inputs", () => {
  const { gen } = createGen({
    plugins: [
      db({
        stores: {
          primary: { dialect: "postgres" },
        },
        default: "primary",
      }),
    ],
  });

  const schema = gen.db.schema({ tables: [] });
  const input = gen.schemaInput(schema);

  expect(input.kind).toBe("schema");
  expect(input.name).toBe("primarySchema");
  expect(input.value).toBe(schema);
});

test("duplicate plugin namespaces produce a diagnostic", () => {
  const a = definePlugin({ id: "a", namespace: "shared" });
  const b = definePlugin({ id: "b", namespace: "shared" });
  const { ctx } = createGen({ plugins: [a, b] });
  expect(ctx.diagnostics.some((d) => d.code === "core:duplicate-namespace")).toBe(true);
});

test("missing plugin dependencies are reported", () => {
  const dep = definePlugin({ id: "missing-dep", namespace: "dep" });
  const consumer = definePlugin({
    id: "consumer",
    namespace: "consumer",
    requires: [dep],
  });
  // Only register the consumer.
  const { ctx } = createGen({ plugins: [consumer] });
  expect(ctx.diagnostics.some((d) => d.code === "core:plugin-missing-dependency")).toBe(true);
});

test("new function constructors register into context", () => {
  const { ctx, gen } = createGen();

  const staticFn = gen.func.static({
    name: "constant",
    input_type: gen.types.string(),
    output_type: gen.types.int(),
    body: { kind: "literal", output_type: gen.types.int(), requirements: [], effects: [] },
  });
  const predFn = gen.func.predicate({
    name: "isActive",
    input_type: gen.types.object({ active: gen.types.boolean() }),
    body: gen.expr.predicate({
      input_type: gen.types.object({ active: gen.types.boolean() }),
      value_type: gen.types.boolean(),
      ast: gen.expr.literal(gen.types.boolean(), { kind: "boolean", boolean_value: true }).ast,
    }),
  });

  expect(ctx.static_functions).toContain(staticFn);
  expect(ctx.predicate_functions).toContain(predFn);
});

test("UI constructors register into context", () => {
  const { ctx, gen } = createGen();
  const platform = gen.ui.platform("web", [], ["click"], ["class"], "dom", []);
  const view = gen.ui.view("LoginView", [], "div");
  const component = gen.ui.component("LoginForm", "{}", [], [], [], view);
  const style = gen.ui.style("primary", []);
  const behavior = gen.ui.behavior("clickHandler", [], "handleClick", ["click"]);
  const theme = gen.ui.theme("light", [], [], [], []);
  const renderer = gen.ui.renderer("dom", platform, []);

  expect(ctx.platforms).toContain(platform);
  expect(ctx.views).toContain(view);
  expect(ctx.components).toContain(component);
  expect(ctx.styles).toContain(style);
  expect(ctx.behaviors).toContain(behavior);
  expect(ctx.themes).toContain(theme);
  expect(ctx.renderers).toContain(renderer);
});

test("event reducer and subscription register into context", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), count: gen.types.int() });
  const event = gen.events.event("UserCreated", { fields: [] });
  const reducer = gen.events.reducer("totalUsers", User.fields.count, [event], {
    name: "add",
    input_type: gen.types.int(),
    output_type: gen.types.int(),
    associative: true,
    commutative: true,
    idempotent: false,
  });
  const subscription = gen.events.subscription(
    "onCreate",
    event,
    {
      name: "handler",
      input_type: gen.types.string(),
      input_fields: [],
      output_type: gen.types.string(),
      body: { kind: "literal", output_type: gen.types.string(), requirements: [], effects: [] },
      requirements: [],
      effects: [],
      capabilities: [],
      laws: [],
      target_runtimes: [],
    },
    gen.types.string(),
  );

  expect(ctx.reducers).toContain(reducer);
  expect(ctx.subscriptions).toContain(subscription);
});

test("relation helper family creates typed relations", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
  const Post = gen.entity("Post", { id: gen.types.uuid(), user_id: gen.types.uuid() });

  const rel = gen.rel.oneToMany(User, Post, Post.fields.user_id, User.fields.id, {
    foreign_key: gen.rel.fkCascade(),
  });

  expect(rel.kind).toBe("one_to_many");
  expect(rel.foreign_key?.on_delete).toBe("cascade");
  expect(ctx.relations).toContain(rel);
});

test("forms module builds typed forms from action functions", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });

  const createUser = gen.func.action({
    name: "createUser",
    input_type: gen.types.object({ email: gen.types.email() }),
    input_fields: [User.fields.email],
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

  const form = gen.forms.build("CreateUserForm", createUser, gen.types.uuid());

  expect(form.name).toBe("CreateUserForm");
  expect(form.fields).toHaveLength(1);
  expect(form.fields[0]!.name).toBe("email");
  expect(ctx.forms).toContain(form);
});
