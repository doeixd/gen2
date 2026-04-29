/**
 * Tests for storage definitions, table creation, field mapping compatibility,
 * and storage invariant checks.
 */
import { expect, test } from "vite-plus/test";
import { createGen, storage } from "../src/index.ts";

test("defineStore creates a store with the given dialect", () => {
  const { gen } = createGen();
  const s = gen.store({ name: "primary", dialect: "postgres" });
  expect(s.name).toBe("primary");
  expect(s.dialect).toBe("postgres");
});

test("defineTable adds columns with back-references", () => {
  const { gen } = createGen();
  const s = gen.store({ name: "primary", dialect: "postgres" });
  const table = gen.table(s, "users", [
    { name: "id", physical_type: "uuid", semantic_type: gen.types.uuid(), nullable: false },
    { name: "email", physical_type: "text", semantic_type: gen.types.email(), nullable: false },
  ]);
  expect(table.store).toBe(s);
  expect(table.columns).toHaveLength(2);
  expect(table.columns[0]!.owning_table).toBe(table);
});

test("fieldMapping infers type compatibility", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    email: gen.types.email(),
  });
  const fm = gen.fieldMapping({
    field: User.fields.id,
    read_source: {
      kind: "column",
      semantic_type: gen.types.uuid(),
    },
  });
  expect(fm.type_compatible).toBe(true);
});

test("fieldMapping detects type incompatibility", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
  });
  const fm = gen.fieldMapping({
    field: User.fields.id,
    read_source: {
      kind: "column",
      semantic_type: gen.types.string(),
    },
  });
  expect(fm.type_compatible).toBe(false);
});

test("checkStorageInvariants flags duplicate columns", () => {
  const { gen } = createGen();
  const s = gen.store({ name: "primary", dialect: "postgres" });
  gen.table(s, "users", [
    { name: "id", physical_type: "uuid", semantic_type: gen.types.uuid(), nullable: false },
    { name: "id", physical_type: "text", semantic_type: gen.types.string(), nullable: false },
  ]);
  const diags = storage.checkStorageInvariants([s]);
  expect(diags.some((d) => d.code === "storage:duplicate-column")).toBe(true);
});

test("checkStorageInvariants warns on unknown dialect", () => {
  const { gen } = createGen();
  const s = gen.store({ name: "legacy", dialect: "cobol-db" });
  const diags = storage.checkStorageInvariants([s]);
  expect(diags.some((d) => d.code === "storage:unknown-dialect")).toBe(true);
});

test("checkMappings rejects incompatible field-column types", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const m = gen.mapping(User, [
    gen.fieldMapping({
      field: User.fields.id,
      read_source: { kind: "column", semantic_type: gen.types.string() },
    }),
  ]);
  const diags = storage.checkMappings([m]);
  expect(diags.some((d) => d.code === "mapping:incompatible-field-column")).toBe(true);
});

test("checkMappings rejects read-only field with write mapping", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const m = gen.mapping(User, [
    gen.fieldMapping({
      field: User.fields.id,
      read_source: { kind: "column", semantic_type: gen.types.uuid() },
      write_target: { kind: "column" },
      read_only: true,
    }),
  ]);
  const diags = storage.checkMappings([m]);
  expect(diags.some((d) => d.code === "mapping:readonly-field-writable")).toBe(true);
});
