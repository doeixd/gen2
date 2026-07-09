import { expect, test } from "vite-plus/test";
import { Store, Table, Column, Mapping, MapField } from "../../src/fx/storage.ts";
import { Entity } from "../../src/fx/entity.ts";
import { Types } from "../../src/fx/types.ts";

const User = Entity.make("User")({
  id: Types.uuid(),
  email: Types.email(),
  name: Types.string(),
});

test("Store.make creates a store", () => {
  const store = Store.make({ name: "main", dialect: "postgres" });
  expect(store.name).toBe("main");
  expect(store.dialect).toBe("postgres");
});

test("Table.make creates a table with columns", () => {
  const store = Store.make({ name: "main", dialect: "postgres" });
  const table = Table.make(store, "users", {
    id: Column.uuid({ primary: true }),
    email: Column.string({ unique: true }),
    name: Column.string(),
  });
  expect(table.name).toBe("users");
  expect(table.columns.id.name).toBe("id");
  expect(table.columns.email.name).toBe("email");
  expect(table.columns.name.name).toBe("name");
});

test("Mapping.make creates a field mapping", () => {
  const store = Store.make({ name: "main", dialect: "postgres" });
  const table = Table.make(store, "users", {
    id: Column.uuid(),
    email: Column.string(),
    name: Column.string(),
  });
  const mapping = Mapping.make(User, {
    id: MapField.column(table.columns.id),
    email: MapField.column(table.columns.email),
    name: MapField.column(table.columns.name),
  });
  expect(mapping.target_entity.name).toBe("User");
  expect(mapping.field_mappings.length).toBe(3);
});
