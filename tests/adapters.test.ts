/**
 * Tests for the concrete adapter targets (debug, standard-schema, relational).
 * These verify that adapters register Targets via the plugin contract, accept
 * inputs from `gen.adapters.*` helpers, and emit the expected artifacts during
 * `lifecycle.generate()`.
 */
import { expect, test } from "vite-plus/test";
import {
  createGen,
  defineDebugAdapter,
  defineRelationalAdapter,
  defineStandardSchemaAdapter,
  lifecycle,
} from "../src/index.ts";

test("debug adapter emits a project snapshot artifact", () => {
  const { ctx, gen } = createGen({ plugins: [defineDebugAdapter()] });
  gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });

  gen.adapters.debug.snapshot();

  const result = lifecycle.generate(ctx);
  expect(result.status).not.toBe("has_errors");
  const snapshot = result.artifacts.find((a) => a.path === "debug/project-snapshot.json");
  expect(snapshot).toBeDefined();
  const parsed = JSON.parse(snapshot!.content) as {
    counts: { entities: number };
    entities: { name: string }[];
  };
  expect(parsed.counts.entities).toBe(1);
  expect(parsed.entities[0]?.name).toBe("User");
});

test("standard-schema adapter emits a per-entity validator", () => {
  const { ctx, gen } = createGen({ plugins: [defineStandardSchemaAdapter()] });
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });

  gen.adapters.standardSchema.fromEntity(User);

  const result = lifecycle.generate(ctx);
  expect(result.status).not.toBe("has_errors");
  const file = result.artifacts.find((a) => a.path === "schemas/user.ts");
  expect(file).toBeDefined();
  // Generated file must conform to Standard Schema spec
  expect(file!.content).toContain('"~standard"');
  expect(file!.content).toContain("version: 1");
  expect(file!.content).toContain('vendor: "gen2"');
  expect(file!.content).toContain("validate(value)");
  expect(file!.content).toContain("export interface User");
  expect(file!.content).toContain("export const UserSchema");
});

test("standard-schema adapter handles all entities at once", () => {
  const { ctx, gen } = createGen({ plugins: [defineStandardSchemaAdapter()] });
  gen.entity("User", { id: gen.types.uuid() });
  gen.entity("Post", { id: gen.types.uuid(), title: gen.types.string() });

  gen.adapters.standardSchema.fromAllEntities();

  const result = lifecycle.generate(ctx);
  expect(result.artifacts.map((a) => a.path).sort()).toEqual([
    "schemas/post.ts",
    "schemas/user.ts",
  ]);
});

test("relational adapter emits SQL DDL per store", () => {
  const { ctx, gen } = createGen({ plugins: [defineRelationalAdapter()] });
  const store = gen.store({ name: "main", dialect: "postgres" });
  gen.table(store, "users", [
    {
      name: "id",
      physical_type: "uuid",
      semantic_type: gen.types.uuid(),
      nullable: false,
    },
    {
      name: "email",
      physical_type: "text",
      semantic_type: gen.types.email(),
      nullable: false,
    },
  ]);

  gen.adapters.relational.fromStore(store);

  const result = lifecycle.generate(ctx);
  expect(result.status).not.toBe("has_errors");
  const sql = result.artifacts.find((a) => a.path === "sql/main.sql");
  expect(sql).toBeDefined();
  expect(sql!.content).toContain('CREATE TABLE "users"');
  expect(sql!.content).toContain('"id" uuid NOT NULL');
  expect(sql!.content).toContain('"email" text NOT NULL');
});

test("relational adapter escapes default values to prevent SQL injection", () => {
  const { ctx, gen } = createGen({ plugins: [defineRelationalAdapter()] });
  const store = gen.store({ name: "main", dialect: "postgres" });
  gen.table(store, "users", [
    {
      name: "status",
      physical_type: "text",
      semantic_type: gen.types.string(),
      nullable: false,
      default_value: "'; DROP TABLE users; --",
    },
  ]);

  gen.adapters.relational.fromStore(store);

  const result = lifecycle.generate(ctx);
  expect(result.status).not.toBe("has_errors");
  const sql = result.artifacts.find((a) => a.path === "sql/main.sql");
  expect(sql).toBeDefined();
  // The malicious payload should be escaped, not interpreted as SQL
  expect(sql!.content).toContain("DEFAULT '''; DROP TABLE users; --'");
  expect(sql!.content).not.toContain("DEFAULT '; DROP TABLE users; --");
});

test("multiple adapters compose in a single project", () => {
  const { ctx, gen } = createGen({
    plugins: [defineDebugAdapter(), defineStandardSchemaAdapter()],
  });
  gen.entity("User", { id: gen.types.uuid() });

  gen.adapters.debug.snapshot();
  gen.adapters.standardSchema.fromAllEntities();

  const result = lifecycle.generate(ctx);
  const paths = result.artifacts.map((a) => a.path).sort();
  expect(paths).toEqual(["debug/project-snapshot.json", "schemas/user.ts"]);
});
