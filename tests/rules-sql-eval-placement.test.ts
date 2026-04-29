import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import { translateRuleToSql, evaluateRule, analyzeRulePlacement } from "../src/rules/index.ts";

// ---------------------------------------------------------------------------
// SQL Translation Tests
// ---------------------------------------------------------------------------

test("translateRuleToSql produces SQL for simple equality", () => {
  const { gen } = createGen();
  const User = gen.entity(
    "User",
    { id: gen.types.uuid(), name: gen.types.string() },
    { store_name: "users" },
  );

  const rule = gen.rule.define({
    name: "isNamedAlice",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.name, gen.types.string()),
      gen.rule.literal("Alice", gen.types.string()),
    ),
  });

  const result = gen.rule.translateSql(rule, User);
  expect(result.translatable).toBe(true);
  expect(result.sql).toBe("(users.name = 'Alice')");
  expect(result.diagnostics).toHaveLength(0);
});

test("translateRuleToSql uses store_name for table alias", () => {
  const { gen } = createGen();
  const Project = gen.entity("Project", { status: gen.types.string() }, { store_name: "projects" });

  const rule = gen.rule.define({
    name: "isDraft",
    when: gen.rule.eq(
      gen.rule.field(Project, Project.fields.status, gen.types.string()),
      gen.rule.literal("draft", gen.types.string()),
    ),
  });

  const result = gen.rule.translateSql(rule, Project);
  expect(result.sql).toContain("projects.status");
});

test("translateRuleToSql handles comparisons", () => {
  const { gen } = createGen();
  const Task = gen.entity("Task", { priority: gen.types.int() }, { store_name: "tasks" });

  const rule = gen.rule.define({
    name: "highPriority",
    when: gen.rule.compare(
      "gt",
      gen.rule.field(Task, Task.fields.priority, gen.types.int()),
      gen.rule.literal(5, gen.types.int()),
    ),
  });

  const result = gen.rule.translateSql(rule, Task);
  expect(result.translatable).toBe(true);
  expect(result.sql).toBe("(tasks.priority > 5)");
});

test("translateRuleToSql handles and / or composition", () => {
  const { gen } = createGen();
  const Post = gen.entity(
    "Post",
    { visibility: gen.types.string(), owner_id: gen.types.uuid() },
    { store_name: "posts" },
  );

  const rule = gen.rule.define({
    name: "canView",
    when: gen.rule.or(
      gen.rule.eq(
        gen.rule.field(Post, Post.fields.visibility, gen.types.string()),
        gen.rule.literal("public", gen.types.string()),
      ),
      gen.rule.eq(
        gen.rule.field(Post, Post.fields.owner_id, gen.types.uuid()),
        gen.rule.var("actor_id", gen.types.uuid()),
      ),
    ),
  });

  const result = gen.rule.translateSql(rule, Post);
  expect(result.translatable).toBe(true);
  expect(result.sql).toBe("((posts.visibility = 'public') OR (posts.owner_id = :actor_id))");
  expect(result.parameters).toHaveLength(1);
  expect(result.parameters[0]!.name).toBe("actor_id");
});

test("translateRuleToSql handles not over eq", () => {
  const { gen } = createGen();
  const Item = gen.entity("Item", { archived: gen.types.boolean() }, { store_name: "items" });

  const rule = gen.rule.define({
    name: "isActive",
    when: gen.rule.not(
      gen.rule.eq(
        gen.rule.field(Item, Item.fields.archived, gen.types.boolean()),
        gen.rule.literal(true, gen.types.boolean()),
      ),
    ),
  });

  const result = gen.rule.translateSql(rule, Item);
  expect(result.translatable).toBe(true);
  expect(result.sql).toBe("(NOT (items.archived = TRUE))");
});

test("translateRuleToSql emits diagnostic for variable-qualified field", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() }, { store_name: "users" });

  const rule = gen.rule.define({
    name: "badVarField",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.field(gen.rule.var("actor", gen.types.uuid()), User.fields.id, gen.types.uuid()),
      gen.rule.literal("x", gen.types.uuid()),
    ),
  });

  const result = gen.rule.translateSql(rule, User);
  expect(result.translatable).toBe(false);
  expect(result.diagnostics.some((d) => d.code === "rules:not-sql-translatable")).toBe(true);
});

test("translateRuleToSqlWithBindings substitutes bound variables as literals", () => {
  const { gen } = createGen();
  const Post = gen.entity("Post", { owner_id: gen.types.uuid() }, { store_name: "posts" });

  const rule = gen.rule.define({
    name: "isOwner",
    when: gen.rule.eq(
      gen.rule.field(Post, Post.fields.owner_id, gen.types.uuid()),
      gen.rule.var("actor_id", gen.types.uuid()),
    ),
  });

  const result = gen.rule.translateSqlWithBindings(rule, Post, { actor_id: "user-123" });
  expect(result.translatable).toBe(true);
  expect(result.sql).toBe("(posts.owner_id = 'user-123')");
  expect(result.parameters).toHaveLength(0);
});

test("translateRuleToSql leaves unbound variables as parameters", () => {
  const { gen } = createGen();
  const Post = gen.entity("Post", { owner_id: gen.types.uuid() }, { store_name: "posts" });

  const rule = gen.rule.define({
    name: "isOwner",
    when: gen.rule.eq(
      gen.rule.field(Post, Post.fields.owner_id, gen.types.uuid()),
      gen.rule.var("actor_id", gen.types.uuid()),
    ),
  });

  const result = gen.rule.translateSqlWithBindings(rule, Post, {});
  expect(result.translatable).toBe(true);
  expect(result.sql).toBe("(posts.owner_id = :actor_id)");
  expect(result.parameters).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// Runtime Evaluator Tests
// ---------------------------------------------------------------------------

test("evaluateRule evaluates simple equality with bindings", () => {
  const { gen } = createGen();
  const rule = gen.rule.define({
    name: "isOne",
    when: gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(1, gen.types.int())),
  });

  const result = gen.rule.evaluate(rule, {});
  expect(result.value).toBe(true);
  expect(result.diagnostics).toHaveLength(0);
});

test("evaluateRule evaluates variable bindings", () => {
  const { gen } = createGen();
  const rule = gen.rule.define({
    name: "isAdmin",
    vars: [{ name: "role", semanticType: gen.types.string() }],
    when: gen.rule.eq(
      gen.rule.var("role", gen.types.string()),
      gen.rule.literal("admin", gen.types.string()),
    ),
  });

  expect(gen.rule.evaluate(rule, { role: "admin" }).value).toBe(true);
  expect(gen.rule.evaluate(rule, { role: "user" }).value).toBe(false);
});

test("evaluateRule evaluates field access on bound objects", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), role: gen.types.string() });

  const rule = gen.rule.define({
    name: "isAdminField",
    vars: [{ name: "actor", semanticType: gen.types.string() }],
    when: gen.rule.eq(
      gen.rule.field(
        gen.rule.var("actor", gen.types.string()),
        User.fields.role,
        gen.types.string(),
      ),
      gen.rule.literal("admin", gen.types.string()),
    ),
  });

  const result = gen.rule.evaluate(rule, { actor: { id: "u1", role: "admin" } });
  expect(result.value).toBe(true);
});

test("evaluateRule evaluates and / or", () => {
  const { gen } = createGen();
  const rule = gen.rule.define({
    name: "complex",
    when: gen.rule.and(
      gen.rule.eq(
        gen.rule.literal(true, gen.types.boolean()),
        gen.rule.literal(true, gen.types.boolean()),
      ),
      gen.rule.or(
        gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(2, gen.types.int())),
        gen.rule.eq(gen.rule.literal(3, gen.types.int()), gen.rule.literal(3, gen.types.int())),
      ),
    ),
  });

  expect(gen.rule.evaluate(rule, {}).value).toBe(true);
});

test("evaluateRule evaluates not", () => {
  const { gen } = createGen();
  const rule = gen.rule.define({
    name: "isFalse",
    when: gen.rule.not(
      gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(2, gen.types.int())),
    ),
  });

  expect(gen.rule.evaluate(rule, {}).value).toBe(true);
});

test("evaluateRule evaluates comparisons", () => {
  const { gen } = createGen();
  const rule = gen.rule.define({
    name: "greaterThan",
    when: gen.rule.compare(
      "gt",
      gen.rule.literal(5, gen.types.int()),
      gen.rule.literal(3, gen.types.int()),
    ),
  });

  expect(gen.rule.evaluate(rule, {}).value).toBe(true);
});

test("evaluateRule reports unbound variable", () => {
  const { gen } = createGen();
  const rule = gen.rule.define({
    name: "needsX",
    vars: [{ name: "x", semanticType: gen.types.int() }],
    when: gen.rule.eq(gen.rule.var("x", gen.types.int()), gen.rule.literal(1, gen.types.int())),
  });

  const result = gen.rule.evaluate(rule, {});
  expect(result.value).toBe(false);
  expect(result.diagnostics.some((d) => d.includes("not bound"))).toBe(true);
});

test("evaluateRule reports unsupported exists", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { user_id: gen.types.uuid() });
  const rel = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.user_id,
    to_field: User.fields.id,
  });

  const rule = gen.rule.define({
    name: "hasPosts",
    when: gen.rule.exists(
      rel,
      gen.rule.eq(
        gen.rule.field(Post, Post.fields.user_id, gen.types.uuid()),
        gen.rule.literal("x", gen.types.uuid()),
      ),
    ),
  });

  const result = gen.rule.evaluate(rule, {});
  expect(result.value).toBe(false);
  expect(result.diagnostics.some((d) => d.includes("exists"))).toBe(true);
});

// ---------------------------------------------------------------------------
// Placement Analysis Tests
// ---------------------------------------------------------------------------

test("analyzeRulePlacement selects database_predicate for simple eq rule", () => {
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

  const analysis = gen.rule.analyzePlacement(rule, User);
  expect(analysis.selected).toBeDefined();
  expect(analysis.selected!.placement).toBe("database_predicate");
  expect(analysis.selected!.supported).toBe(true);
  expect(analysis.selected!.safety).toBe("authoritative");
});

test("analyzeRulePlacement rejects database_predicate for entity without store", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

  const rule = gen.rule.define({
    name: "isAlice",
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.name, gen.types.string()),
      gen.rule.literal("Alice", gen.types.string()),
    ),
  });

  const analysis = gen.rule.analyzePlacement(rule, User);
  const dbOption = analysis.placements.find((p) => p.placement === "database_predicate")!;
  expect(dbOption.supported).toBe(false);
  expect(dbOption.diagnostics.some((d) => d.code === "rules:not-sql-translatable")).toBe(true);
});

test("analyzeRulePlacement selects server_integrated_query for exists same-store with other-entity fields", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() }, { store_name: "app" });
  const Post = gen.entity("Post", { user_id: gen.types.uuid() }, { store_name: "app" });
  const rel = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.user_id,
    to_field: User.fields.id,
  });

  const rule = gen.rule.define({
    name: "hasPosts",
    when: gen.rule.exists(
      rel,
      gen.rule.eq(
        gen.rule.field(Post, Post.fields.user_id, gen.types.uuid()),
        gen.rule.literal("x", gen.types.uuid()),
      ),
    ),
  });

  const analysis = gen.rule.analyzePlacement(rule, User);
  expect(analysis.selected).toBeDefined();
  // database_predicate is unsupported because the exists WHERE references Post fields,
  // not User fields. server_integrated_query is the correct placement for same-store exists.
  expect(analysis.selected!.placement).toBe("server_integrated_query");
  const db = analysis.placements.find((p) => p.placement === "database_predicate")!;
  expect(db.supported).toBe(false);
});

test("analyzeRulePlacement flags unsafe list post-filter diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() }, { store_name: "users" });

  const rule = gen.rule.define({
    name: "alwaysTrue",
    when: gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(1, gen.types.int())),
  });

  const analysis = gen.rule.analyzePlacement(rule, User);
  const postFilter = analysis.placements.find((p) => p.placement === "server_post_filter")!;
  expect(postFilter.diagnostics.some((d) => d.code === "authz:unsafe-list-post-filter")).toBe(true);
});

test("analyzeRulePlacement marks client_hint as non-authoritative", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() }, { store_name: "users" });

  const rule = gen.rule.define({
    name: "isActor",
    vars: [{ name: "actor_id", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.field(User, User.fields.id, gen.types.uuid()),
      gen.rule.var("actor_id", gen.types.uuid()),
    ),
  });

  const analysis = gen.rule.analyzePlacement(rule, User);
  const hint = analysis.placements.find((p) => p.placement === "client_hint")!;
  expect(hint.supported).toBe(true);
  expect(hint.safety).toBe("non_authoritative_hint");
  expect(hint.diagnostics.some((d) => d.code === "rules:client-hint-non-authoritative")).toBe(true);
});

test("analyzeRulePlacement emits error when no authoritative placement exists", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", { user_id: gen.types.uuid() });
  const rel = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.user_id,
    to_field: User.fields.id,
  });

  const rule = gen.rule.define({
    name: "hasPosts",
    when: gen.rule.exists(
      rel,
      gen.rule.eq(
        gen.rule.field(Post, Post.fields.user_id, gen.types.uuid()),
        gen.rule.literal("x", gen.types.uuid()),
      ),
    ),
  });

  const analysis = gen.rule.analyzePlacement(rule, User);
  // No store on User, so no authoritative placement
  expect(
    analysis.diagnostics.some((d) => d.code === "authz:list-policy-not-database-placeable"),
  ).toBe(true);
});

test("analyzeRulePlacement flags materialized and external as unsupported", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() }, { store_name: "users" });

  const rule = gen.rule.define({
    name: "simple",
    when: gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(1, gen.types.int())),
  });

  const analysis = gen.rule.analyzePlacement(rule, User);
  const materialized = analysis.placements.find((p) => p.placement === "materialized")!;
  const external = analysis.placements.find((p) => p.placement === "external")!;

  expect(materialized.supported).toBe(false);
  expect(external.supported).toBe(false);
});

// ---------------------------------------------------------------------------
// Direct import tests
// ---------------------------------------------------------------------------

test("translateRuleToSql is importable directly", () => {
  expect(typeof translateRuleToSql).toBe("function");
});

test("evaluateRule is importable directly", () => {
  expect(typeof evaluateRule).toBe("function");
});

test("analyzeRulePlacement is importable directly", () => {
  expect(typeof analyzeRulePlacement).toBe("function");
});
