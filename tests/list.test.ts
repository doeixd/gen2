/**
 * Tests for the List view module.
 *
 * Covers: defineList construction, listColumn, pagination, actions,
 * autoList derivation from CRUD, and checkList validation.
 */

import { describe, expect, test } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import { defineList, checkList, listColumn, cursorPagination } from "../src/list/index.ts";
import { defineEntity } from "../src/entity/index.ts";

describe("defineList", () => {
  test("creates a List with columns and pagination", () => {
    const { gen } = createGen();
    const Post = gen.entity("Post", {
      id: gen.types.uuid(),
      title: gen.types.string(),
      status: gen.types.enumOf("Status", ["draft", "published", "archived"]),
    });

    const list = gen.list.define({
      name: "PostList",
      entity: Post,
      columns: [
        gen.list.column(Post.fields.title, { sortable: true, searchable: true }),
        gen.list.column(Post.fields.status, { filterable: true }),
      ],
      pagination: gen.list.offsetPagination(50),
    });

    expect(list.name).toBe("PostList");
    expect(list.entity).toBe(Post);
    expect(list.columns).toHaveLength(2);
    expect(list.columns[0]!.field).toBe(Post.fields.title);
    expect(list.columns[0]!.sortable).toBe(true);
    expect(list.columns[0]!.searchable).toBe(true);
    expect(list.columns[1]!.filterable).toBe(true);
    expect(list.pagination.kind).toBe("offset");
    expect(list.pagination).toMatchObject({ defaultLimit: 50 });
  });

  test("registers into GenContext", () => {
    const { ctx, gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    const list = gen.list.define({
      name: "UserList",
      entity: User,
      columns: [gen.list.column(User.fields.name)],
    });

    expect(ctx.lists).toContain(list);
  });

  test("supports cursor pagination", () => {
    const { gen } = createGen();
    const Post = gen.entity("Post", {
      id: gen.types.uuid(),
      title: gen.types.string(),
    });

    const list = gen.list.define({
      name: "PostList",
      entity: Post,
      columns: [gen.list.column(Post.fields.title)],
      pagination: gen.list.cursorPagination(Post.fields.id, 50, 500),
    });

    expect(list.pagination.kind).toBe("cursor");
    if (list.pagination.kind === "cursor") {
      expect(list.pagination.cursorField).toBe(Post.fields.id);
      expect(list.pagination.defaultLimit).toBe(50);
      expect(list.pagination.maxLimit).toBe(500);
    }
  });

  test("supports row and bulk actions", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    const updateUser = gen.func.action({
      name: "updateUser",
      input_type: User,
      input_fields: [User.fields.id, User.fields.name],
      returns: User,
      body: gen.func.buildActionUpdate(User, []),
    });

    const deleteUser = gen.func.action({
      name: "deleteUser",
      input_type: User,
      input_fields: [User.fields.id],
      returns: User,
      body: gen.func.buildActionDelete(User),
    });

    const list = gen.list.define({
      name: "UserList",
      entity: User,
      columns: [gen.list.column(User.fields.name)],
      rowActions: [gen.list.action("edit", "Edit", updateUser, { inline: true })],
      bulkActions: [gen.list.bulkAction("delete", "Delete Selected", deleteUser)],
    });

    expect(list.rowActions).toHaveLength(1);
    expect(list.rowActions[0]!.name).toBe("edit");
    expect(list.rowActions[0]!.inline).toBe(true);
    expect(list.bulkActions).toHaveLength(1);
    expect(list.bulkActions[0]!.name).toBe("delete");
  });

  test("supports multiSelect and exportable", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    const list = gen.list.define({
      name: "UserList",
      entity: User,
      columns: [gen.list.column(User.fields.name)],
      multiSelect: true,
      exportable: true,
    });

    expect(list.multiSelect).toBe(true);
    expect(list.exportable).toBe(true);
  });

  test("supports default sort", () => {
    const { gen } = createGen();
    const Post = gen.entity("Post", {
      id: gen.types.uuid(),
      title: gen.types.string(),
      published_at: gen.types.datetime(),
    });

    const list = gen.list.define({
      name: "PostList",
      entity: Post,
      columns: [
        gen.list.column(Post.fields.title),
        gen.list.column(Post.fields.published_at, { sortable: true }),
      ],
      defaultSort: { field: Post.fields.published_at, direction: "desc" },
    });

    expect(list.defaultSort).toBeDefined();
    expect(list.defaultSort!.field).toBe(Post.fields.published_at);
    expect(list.defaultSort!.direction).toBe("desc");
  });
});

describe("autoList", () => {
  test("derives a List from entity and CRUD", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      email: gen.types.email(),
      role: gen.types.enumOf("Role", ["admin", "user"]),
    });

    const userCrud = gen.crud.derive(User);
    const list = gen.list.auto(User, userCrud);

    expect(list.name).toBe("UserList");
    expect(list.entity).toBe(User);
    expect(list.query).toBe(userCrud.list);
    expect(list.columns).toHaveLength(4);
    expect(list.pagination.kind).toBe("offset");
  });

  test("autoList infers sortable/filterable/searchable from types", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      role: gen.types.enumOf("Role", ["admin", "user"]),
      active: gen.types.boolean(),
      created_at: gen.types.datetime(),
    });

    const userCrud = gen.crud.derive(User);
    const list = gen.list.auto(User, userCrud);

    const nameCol = list.columns.find((c) => c.field.name === "name");
    expect(nameCol!.sortable).toBe(true);
    expect(nameCol!.searchable).toBe(true);
    expect(nameCol!.filterable).toBe(true);

    const roleCol = list.columns.find((c) => c.field.name === "role");
    expect(roleCol!.filterable).toBe(true);
    expect(roleCol!.searchable).toBe(false);

    const activeCol = list.columns.find((c) => c.field.name === "active");
    expect(activeCol!.filterable).toBe(true);

    const createdCol = list.columns.find((c) => c.field.name === "created_at");
    expect(createdCol!.sortable).toBe(true);
  });

  test("autoList hides read-only fields by default", () => {
    const { gen } = createGen();
    const Post = gen.entity("Post", {
      id: gen.types.uuid(),
      title: gen.types.string(),
      created_at: { type: gen.types.datetime(), read_only: true },
    });

    const postCrud = gen.crud.derive(Post);
    const list = gen.list.auto(Post, postCrud);

    const createdCol = list.columns.find((c) => c.field.name === "created_at");
    expect(createdCol!.hidden).toBe(true);
  });

  test("autoList wires row actions from CRUD update/delete", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    const userCrud = gen.crud.derive(User);
    const list = gen.list.auto(User, userCrud);

    expect(list.rowActions).toHaveLength(2);
    expect(list.rowActions.map((a) => a.name)).toContain("edit");
    expect(list.rowActions.map((a) => a.name)).toContain("delete");
  });

  test("autoList allows options override", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    const userCrud = gen.crud.derive(User);
    const list = gen.list.auto(User, userCrud, {
      name: "CustomUserList",
      multiSelect: true,
      exportable: true,
    });

    expect(list.name).toBe("CustomUserList");
    expect(list.multiSelect).toBe(true);
    expect(list.exportable).toBe(true);
  });
});

describe("checkList", () => {
  test("passes for valid list", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    gen.list.define({
      name: "UserList",
      entity: User,
      columns: [gen.list.column(User.fields.name)],
    });

    const diagnostics = checkList(
      ctx.lists,
      ctx.entities,
      ctx.query_functions,
      ctx.action_functions,
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

    const list = defineList({
      name: "UserList",
      entity: User,
      columns: [listColumn(User.fields.name)],
    });

    const diagnostics = checkList([list], [], [], []);
    expect(diagnostics.some((d) => d.code === "list:entity-unregistered")).toBe(true);
  });

  test("flags column field not in entity", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });
    const Post = gen.entity("Post", {
      id: gen.types.uuid(),
      title: gen.types.string(),
    });

    gen.list.define({
      name: "UserList",
      entity: User,
      columns: [gen.list.column(Post.fields.title)],
    });

    const diagnostics = checkList(
      ctx.lists,
      ctx.entities,
      ctx.query_functions,
      ctx.action_functions,
    );
    expect(diagnostics.some((d) => d.code === "list:column-field-not-in-entity")).toBe(true);
  });

  test("flags sortable type warning", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      bio: gen.types.string(),
    });

    gen.list.define({
      name: "UserList",
      entity: User,
      columns: [gen.list.column(User.fields.bio, { sortable: true })],
    });

    const diagnostics = checkList(
      ctx.lists,
      ctx.entities,
      ctx.query_functions,
      ctx.action_functions,
    );
    // string type CAN be sorted, so no warning
    expect(diagnostics.some((d) => d.code === "list:sortable-type-may-not-be-orderable")).toBe(
      false,
    );
  });

  test("flags searchable type warning for non-text", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      age: gen.types.int(),
    });

    gen.list.define({
      name: "UserList",
      entity: User,
      columns: [gen.list.column(User.fields.age, { searchable: true })],
    });

    const diagnostics = checkList(
      ctx.lists,
      ctx.entities,
      ctx.query_functions,
      ctx.action_functions,
    );
    expect(diagnostics.some((d) => d.code === "list:searchable-type-not-text")).toBe(true);
  });

  test("flags default sort not in columns", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      email: gen.types.email(),
    });

    gen.list.define({
      name: "UserList",
      entity: User,
      columns: [gen.list.column(User.fields.name)],
      defaultSort: { field: User.fields.email, direction: "asc" },
    });

    const diagnostics = checkList(
      ctx.lists,
      ctx.entities,
      ctx.query_functions,
      ctx.action_functions,
    );
    expect(diagnostics.some((d) => d.code === "list:default-sort-not-in-columns")).toBe(true);
  });

  test("flags cursor field not in entity", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });
    const Post = gen.entity("Post", {
      id: gen.types.uuid(),
      title: gen.types.string(),
    });

    gen.list.define({
      name: "UserList",
      entity: User,
      columns: [gen.list.column(User.fields.name)],
      pagination: cursorPagination(Post.fields.id, 50),
    });

    const diagnostics = checkList(
      ctx.lists,
      ctx.entities,
      ctx.query_functions,
      ctx.action_functions,
    );
    expect(diagnostics.some((d) => d.code === "list:cursor-field-not-in-entity")).toBe(true);
  });
});
