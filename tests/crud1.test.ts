import { expect, test } from "vite-plus/test";
import { createGen, crud, lifecycle } from "../src/index.ts";

test("deriveCrud creates five standard functions", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  const c = gen.crud.derive(User);

  expect(c.getById.name).toBe("User.getById");
  expect(c.list.name).toBe("User.list");
  expect(c.create.name).toBe("User.create");
  expect(c.update.name).toBe("User.update");
  expect(c.delete.name).toBe("User.delete");
});

test("deriveWritableInput filters read-only fields", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    id: { type: gen.types.uuid(), read_only: true },
    name: gen.types.string(),
  });
  const writable = crud.deriveWritableInput(User);

  expect(writable.map((f) => f.name)).toContain("name");
  expect(writable.map((f) => f.name)).not.toContain("id");
});

test("deriveWritableInput respects mapping hidden source", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    name: gen.types.string(),
    secret: gen.types.string(),
  });
  const mapping = gen.mapping(User, [
    gen.mapField(User.fields.id),
    gen.mapField(User.fields.name),
    gen.mapField(User.fields.secret, { read: gen.hiddenSource() }),
  ]);

  const writable = crud.deriveWritableInput(User, mapping);

  expect(writable.map((f) => f.name)).toContain("name");
  expect(writable.map((f) => f.name)).not.toContain("secret");
});

test("deriveWritableInput respects mapping without write target", () => {
  const { gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    name: gen.types.string(),
    computed: gen.types.string(),
  });
  const mapping = gen.mapping(User, [
    gen.mapField(User.fields.id),
    gen.mapField(User.fields.name),
    gen.mapField(User.fields.computed),
  ]);

  // Remove write target from the computed field mapping
  const modifiedMapping = {
    ...mapping,
    field_mappings: mapping.field_mappings.map((fm) =>
      fm.field.name === "computed" ? { ...fm, write_target: undefined } : fm,
    ),
  };

  const writable = crud.deriveWritableInput(User, modifiedMapping);

  expect(writable.map((f) => f.name)).toContain("name");
  // Fields without write_target are still writable unless explicitly blocked
  expect(writable.map((f) => f.name)).toContain("computed");
});

test("deriveWritableInput respects server-only semantic type", () => {
  const { gen } = createGen();
  const serverOnlyUuid = { ...gen.types.uuid(), server_only: true };
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    name: gen.types.string(),
    internalId: serverOnlyUuid,
  });

  const writable = crud.deriveWritableInput(User);

  expect(writable.map((f) => f.name)).toContain("name");
  expect(writable.map((f) => f.name)).not.toContain("internalId");
});

test("checkCrud flags hidden field exposed when explicitly included", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    name: gen.types.string(),
    secret: gen.types.string(),
  });

  // Register mapping in context so checkCrud can find it
  gen.mapping(User, [
    gen.mapField(User.fields.id),
    gen.mapField(User.fields.name),
    gen.mapField(User.fields.secret, { read: gen.hiddenSource() }),
  ]);

  // Force-include the hidden field to trigger the diagnostic
  gen.crud.derive(User, { include: [User.fields.id, User.fields.name, User.fields.secret] });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "crud:hidden-field-exposed")).toBe(true);
});

test("checkCrud flags server-only field exposed in update", () => {
  const { gen, ctx } = createGen();
  const serverOnlyUuid = { ...gen.types.uuid(), server_only: true };
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    name: gen.types.string(),
    internalId: serverOnlyUuid,
  });

  gen.crud.derive(User);

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "crud:server-only-field-exposed")).toBe(true);
});

test("checkCrud flags read-only mapping source", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    name: gen.types.string(),
    computed: gen.types.string(),
  });
  const mapping = gen.mapping(User, [
    gen.mapField(User.fields.id),
    gen.mapField(User.fields.name),
    gen.mapField(User.fields.computed, { read: gen.readOnlySource() }),
  ]);

  gen.crud.derive(User, { mapping });

  const result = lifecycle.check(ctx);
  expect(result.diagnostics.some((d) => d.code === "crud:field-not-writable")).toBe(true);
});

test("CRUD getById receives entity key family", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  const c = gen.crud.derive(User);

  expect(c.getById.reactivity?.key).toBeDefined();
});

test("CRUD list receives collection key family", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  const c = gen.crud.derive(User);

  expect(c.list.reactivity?.key).toBeDefined();
});

test("deriveReactiveGraph includes CRUD query nodes", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  gen.crud.derive(User);

  const graph = gen.reactivity.graph(ctx);
  const queryNodes = graph.nodes.filter((n) => n.kind === "query_function");

  expect(queryNodes.some((n) => n.id.includes("User.getById"))).toBe(true);
  expect(queryNodes.some((n) => n.id.includes("User.list"))).toBe(true);
});

test("deriveReactiveGraph includes CRUD action nodes", () => {
  const { gen, ctx } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  gen.crud.derive(User);

  const graph = gen.reactivity.graph(ctx);
  const actionNodes = graph.nodes.filter((n) => n.kind === "action_function");

  expect(actionNodes.some((n) => n.id.includes("User.create"))).toBe(true);
  expect(actionNodes.some((n) => n.id.includes("User.update"))).toBe(true);
  expect(actionNodes.some((n) => n.id.includes("User.delete"))).toBe(true);
});
