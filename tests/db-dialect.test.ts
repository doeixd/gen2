/**
 * Runtime tests for dialect-specific DB surface helpers.
 */
import { expect, test } from "vite-plus/test";
import { createGen, db } from "../src/index.ts";

test("relational store exposes table/index/schema with typed cols accessor", () => {
  const { ctx, gen } = createGen({
    plugins: [db({ stores: { main: { dialect: "postgres" } }, default: "main" })],
  });
  const main = gen.db.main.relational;
  expect(main).toBeDefined();

  const users = main.table("users", {
    id: { physical_type: "uuid", semantic_type: gen.types.uuid(), nullable: false },
    email: { physical_type: "text", semantic_type: gen.types.email(), nullable: false },
  });
  expect(users.cols.id.name).toBe("id");
  expect(users.cols.email.name).toBe("email");
  expect(users.columns.length).toBe(2);

  const idx = main.index(users, "users_email_idx", [users.cols.email], { unique: true });
  expect(idx.unique).toBe(true);
  expect(users.indexes[0]).toBe(idx);

  expect(ctx.tables.length).toBe(1);
});

test("document store exposes collection helper with typed fields accessor", () => {
  const { gen } = createGen({
    plugins: [db({ stores: { docs: { dialect: "mongo" } }, default: "docs" })],
  });
  const docs = gen.db.docs.document;
  expect(docs).toBeDefined();

  const events = docs.collection("events", {
    id: { physical_type: "objectId", semantic_type: gen.types.string() },
    payload: { physical_type: "document", semantic_type: gen.types.string() },
  });
  expect(events.fields_by_name.id.name).toBe("id");
  expect(events.fields_by_name.payload.name).toBe("payload");
});

test("kv store exposes keyspace helper", () => {
  const { gen } = createGen({
    plugins: [db({ stores: { cache: { dialect: "redis" } }, default: "cache" })],
  });
  const cache = gen.db.cache.kv;
  expect(cache).toBeDefined();

  const sessions = cache.keyspace("sessions", { key_type: "string", value_type: "json" });
  expect(sessions.name).toBe("sessions");
  expect(sessions.key_type).toBe("string");
});

test("a relational store does not expose document or kv surfaces at runtime", () => {
  const { gen } = createGen({
    plugins: [db({ stores: { main: { dialect: "postgres" } }, default: "main" })],
  });
  // The dialect-typed surface erases unrelated branches to `never` at the type
  // level; at runtime they are undefined. Cast just for the runtime probe.
  const runtime = gen.db.main as unknown as { document: unknown; kv: unknown };
  expect(runtime.document).toBeUndefined();
  expect(runtime.kv).toBeUndefined();
});
