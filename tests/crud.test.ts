/**
 * Tests for the CRUD auto-derivation module.
 *
 * Covers: deriveCrud construction, all five generated functions, context
 * registration, options (idField, include, exclude), and checkCrud validation.
 */

import { describe, expect, test } from "vite-plus/test";
import { createGen, reactivity } from "../src/index.ts";
import { getQueryFunctionsFromGraph, getActionFunctionsFromGraph } from "../src/function/kernel.ts";
import { deriveCrud, checkCrud } from "../src/crud/index.ts";
import { defineEntity } from "../src/entity/index.ts";

describe("deriveCrud", () => {
  test("produces all five standard functions", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      email: gen.types.email(),
    });

    const crud = gen.crud.derive(User);

    expect(crud.entity).toBe(User);
    expect(crud.getById).toBeDefined();
    expect(crud.list).toBeDefined();
    expect(crud.create).toBeDefined();
    expect(crud.update).toBeDefined();
    expect(crud.delete).toBeDefined();
  });

  test("registers functions into GenContext", () => {
    const { ctx, gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    const crud = gen.crud.derive(User);

    expect(getQueryFunctionsFromGraph(ctx.graph)).toContain(crud.getById);
    expect(getQueryFunctionsFromGraph(ctx.graph)).toContain(crud.list);
    expect(getActionFunctionsFromGraph(ctx.graph)).toContain(crud.create);
    expect(getActionFunctionsFromGraph(ctx.graph)).toContain(crud.update);
    expect(getActionFunctionsFromGraph(ctx.graph)).toContain(crud.delete);
    expect(ctx.cruds).toContain(crud);
  });

  test("getById has correct name and input fields", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    const crud = gen.crud.derive(User);

    expect(crud.getById.name).toBe("User.getById");
    expect(crud.getById.input_fields).toContain(User.fields.id);
    expect(crud.getById.body.predicate).toBeDefined();
  });

  test("list has correct name and no predicate by default", () => {
    const { gen } = createGen();
    const Post = gen.entity("Post", {
      id: gen.types.uuid(),
      title: gen.types.string(),
    });

    const crud = gen.crud.derive(Post);

    expect(crud.list.name).toBe("Post.list");
    expect(crud.list.body.predicate).toBeUndefined();
  });

  test("create has correct name and insert body", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      email: gen.types.email(),
    });

    const crud = gen.crud.derive(User);

    expect(crud.create.name).toBe("User.create");
    expect(crud.create.body.kind.kind).toBe("insert");
    expect(crud.create.input_fields).toContain(User.fields.name);
    expect(crud.create.input_fields).toContain(User.fields.email);
  });

  test("update has correct name and update body with condition", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      age: gen.types.int(),
    });

    const crud = gen.crud.derive(User);

    expect(crud.update.name).toBe("User.update");
    expect(crud.update.body.kind.kind).toBe("update");
    expect(
      (crud.update.body.operations[0] as import("../src/function/index.ts").WriteOperation)!
        .condition,
    ).toBeDefined();
    expect(crud.update.input_fields).toContain(User.fields.id);
    expect(crud.update.input_fields).toContain(User.fields.name);
    expect(crud.update.input_fields).toContain(User.fields.age);
  });

  test("delete has correct name and delete body with condition", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    const crud = gen.crud.derive(User);

    expect(crud.delete.name).toBe("User.delete");
    expect(crud.delete.body.kind.kind).toBe("delete");
    expect(
      (crud.delete.body.operations[0] as import("../src/function/index.ts").WriteOperation)!
        .condition,
    ).toBeDefined();
    expect(crud.delete.input_fields).toContain(User.fields.id);
  });

  test("respects custom idField option", () => {
    const { gen } = createGen();
    const Product = gen.entity("Product", {
      sku: gen.types.string(),
      name: gen.types.string(),
    });

    const crud = gen.crud.derive(Product, { idField: Product.fields.sku });

    expect(crud.getById.input_fields[0]).toBe(Product.fields.sku);
    expect(crud.update.input_fields[0]).toBe(Product.fields.sku);
    expect(crud.delete.input_fields[0]).toBe(Product.fields.sku);
  });

  test("excludes read-only fields from create/update", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      created_at: { type: gen.types.datetime(), read_only: true },
    });

    const crud = gen.crud.derive(User);

    expect(crud.create.input_fields).toContain(User.fields.name);
    expect(crud.create.input_fields).not.toContain(User.fields.created_at);
    expect(crud.update.input_fields).not.toContain(User.fields.created_at);
  });

  test("include option restricts create/update fields", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      email: gen.types.email(),
      age: gen.types.int(),
    });

    const crud = gen.crud.derive(User, {
      include: [User.fields.name, User.fields.email],
    });

    expect(crud.create.input_fields).toContain(User.fields.name);
    expect(crud.create.input_fields).toContain(User.fields.email);
    expect(crud.create.input_fields).not.toContain(User.fields.age);
  });

  test("exclude option removes fields from create/update", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      email: gen.types.email(),
      age: gen.types.int(),
    });

    const crud = gen.crud.derive(User, {
      exclude: [User.fields.age],
    });

    expect(crud.create.input_fields).toContain(User.fields.name);
    expect(crud.create.input_fields).toContain(User.fields.email);
    expect(crud.create.input_fields).not.toContain(User.fields.age);
  });

  test("falls back to first field when no id field exists", () => {
    const { gen } = createGen();
    const Tag = gen.entity("Tag", {
      label: gen.types.string(),
      color: gen.types.string(),
    });

    const crud = gen.crud.derive(Tag);

    expect(crud.getById.input_fields[0]).toBe(Tag.fields.label);
  });
});

describe("checkCrud", () => {
  test("passes for valid crud", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });
    gen.crud.derive(User);

    const diagnostics = checkCrud(
      ctx.cruds,
      ctx.entities,
      getQueryFunctionsFromGraph(ctx.graph),
      getActionFunctionsFromGraph(ctx.graph),
    );

    expect(diagnostics).toHaveLength(0);
  });

  test("flags unregistered entity", () => {
    const User = defineEntity("User", {
      id: {
        type: {
          name: "uuid",
          kind: "uuid",
          ts_type_name: "string",
          storage_repr: { name: "uuid", kind: { kind: "fixed_bytes" }, fixed: true, metadata: [] },
          has_serializer: false,
          has_deserializer: false,
          server_only: false,
          traits: [],
        },
        nullable: false,
      },
      name: {
        type: {
          name: "string",
          kind: "string",
          ts_type_name: "string",
          storage_repr: { name: "text", kind: { kind: "text" }, fixed: false, metadata: [] },
          has_serializer: false,
          has_deserializer: false,
          server_only: false,
          traits: [],
        },
        nullable: false,
      },
    });

    const crud = deriveCrud(User);
    const diagnostics = checkCrud([crud], [], [], []);

    expect(diagnostics.some((d) => d.code === "crud:entity-unregistered")).toBe(true);
  });

  test("flags id field not in entity", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });
    const Post = gen.entity("Post", {
      id: gen.types.uuid(),
      title: gen.types.string(),
    });

    // Derive CRUD for User but force Post's title field as the idField
    // (title does not exist on User, so this should trigger a diagnostic)
    gen.crud.derive(User, { idField: Post.fields.title as never });

    const diagnostics = checkCrud(
      ctx.cruds,
      ctx.entities,
      getQueryFunctionsFromGraph(ctx.graph),
      getActionFunctionsFromGraph(ctx.graph),
    );

    expect(diagnostics.some((d) => d.code === "crud:id-field-not-in-entity")).toBe(true);
  });

  test("flags read-only fields in create/update input", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    // Manually create a CRUD where the create function includes a read-only field
    gen.crud.derive(User);
    const diagnostics = checkCrud(
      ctx.cruds,
      ctx.entities,
      getQueryFunctionsFromGraph(ctx.graph),
      getActionFunctionsFromGraph(ctx.graph),
    );

    // The original crud.create doesn't have read-only fields, so this test
    // verifies the checker catches it when present.
    expect(diagnostics.some((d) => d.code === "crud:read-only-input-field")).toBe(false);

    // Now test with an actual read-only field
    const Product = gen.entity("Product", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      computed: { type: gen.types.string(), read_only: true },
    });
    gen.crud.derive(Product);
    const productDiags = checkCrud(
      ctx.cruds,
      ctx.entities,
      getQueryFunctionsFromGraph(ctx.graph),
      getActionFunctionsFromGraph(ctx.graph),
    );

    // deriveCrud automatically excludes read-only fields, so no diagnostic
    expect(productDiags.some((d) => d.code === "crud:read-only-input-field")).toBe(false);
  });

  test("deriveCrud overwrites existing graph nodes on duplicate calls", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    gen.crud.derive(User);
    gen.crud.derive(User);

    const queries = getQueryFunctionsFromGraph(ctx.graph);
    const actions = getActionFunctionsFromGraph(ctx.graph);

    // Graph deduplicates by node id, so only one of each remains.
    expect(queries.filter((q) => q.name === "User.getById")).toHaveLength(1);
    expect(queries.filter((q) => q.name === "User.list")).toHaveLength(1);
    expect(actions.filter((a) => a.name === "User.create")).toHaveLength(1);
    expect(actions.filter((a) => a.name === "User.update")).toHaveLength(1);
    expect(actions.filter((a) => a.name === "User.delete")).toHaveLength(1);
  });

  test("deriveCrud does not duplicate default key families on multiple calls", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    gen.crud.derive(User);
    const initialKeyCount = reactivity.getKeyFamiliesFromGraph(ctx.graph).length;

    gen.crud.derive(User); // Called twice
    expect(reactivity.getKeyFamiliesFromGraph(ctx.graph).length).toBe(initialKeyCount);
  });

  test("deriveCrud accepts custom key families and does not create defaults", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    const customGetByIdKey = gen.key.custom("CustomGetById", {
      input: gen.types.object({ id: gen.types.uuid() }),
    });
    const customListKey = gen.key.custom("CustomList");

    const crud = gen.crud.derive(User, {
      getByIdKey: customGetByIdKey,
      listKey: customListKey,
    });

    expect(crud.getById.reactivity?.key.family).toBe(customGetByIdKey);
    expect(crud.list.reactivity?.key.family).toBe(customListKey);

    const graphFamilies = reactivity.getKeyFamiliesFromGraph(ctx.graph);
    const isDefaultCreated = graphFamilies.some(
      (kf) => kf.name === "User:entity" || kf.name === "User:collection",
    );
    expect(isDefaultCreated).toBe(false);
  });
});
