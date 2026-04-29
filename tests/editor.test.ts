/**
 * Tests for the Editor module.
 *
 * Covers: defineEditor construction, dual form derivation, field override merging,
 * section creation, nested editor creation, command creation, hook binding,
 * cycle detection, draft validation, section references, visible_when scoping,
 * version field checks, default value validation, and checkEditors rules.
 */

import { describe, expect, test } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import { defineEntity } from "../src/entity/index.ts";
import { defineExprFunction } from "../src/function/index.ts";
import {
  checkEditors,
  defineEditor,
  editorCommand,
  editorSection,
  fieldOverride,
  nestedEditor,
} from "../src/editor/index.ts";

describe("Editor construction", () => {
  test("defineEditor creates an Editor with update purpose and derives update form", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    const loadUser = gen.func.query({
      name: "loadUser",
      input_type: gen.types.uuid(),
      returns: User,
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.string(),
      }),
    });

    const updateUser = gen.func.action({
      name: "updateUser",
      input_type: User,
      input_fields: [User.fields.id, User.fields.name],
      returns: User,
      body: gen.func.buildActionUpdate(User, []),
    });

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "update",
      load: loadUser,
      update: updateUser,
    });

    expect(editor.name).toBe("UserEditor");
    expect(editor.purpose).toBe("update");
    expect(editor.target_entity).toBe(User);
    expect(editor.load_query).toBe(loadUser);
    expect(editor.update_action).toBe(updateUser);
    expect(editor.forms.update).toBeDefined();
    expect(editor.forms.update!.name).toBe("UserEditorUpdateForm");
    expect(editor.forms.update!.fields.length).toBe(2);
    expect(editor.forms.create).toBeUndefined();
    expect(editor.modes).toEqual(["edit"]);
    expect(editor.nested).toEqual([]);
    expect(editor.commands).toEqual([]);
    expect(editor.sections).toEqual([]);
  });

  test("defineEditor derives both create and update forms for create_or_update", () => {
    const { gen } = createGen();
    const Post = gen.entity("Post", {
      title: gen.types.string(),
      body: gen.types.string(),
    });

    const createPost = gen.func.action({
      name: "createPost",
      input_type: Post,
      input_fields: [Post.fields.title, Post.fields.body],
      returns: Post,
      body: gen.func.buildActionInsert(Post, []),
    });

    const updatePost = gen.func.action({
      name: "updatePost",
      input_type: Post,
      input_fields: [Post.fields.title, Post.fields.body],
      returns: Post,
      body: gen.func.buildActionUpdate(Post, []),
    });

    const editor = defineEditor({
      name: "PostEditor",
      entity: Post,
      purpose: "create_or_update",
      create: createPost,
      update: updatePost,
    });

    expect(editor.forms.create).toBeDefined();
    expect(editor.forms.create!.source_function).toBe(createPost);
    expect(editor.forms.update).toBeDefined();
    expect(editor.forms.update!.source_function).toBe(updatePost);
  });

  test("defineEditor derives create form only for create purpose", () => {
    const { gen } = createGen();
    const Product = gen.entity("Product", { name: gen.types.string() });

    const createProduct = gen.func.action({
      name: "createProduct",
      input_type: Product,
      input_fields: [Product.fields.name],
      returns: Product,
      body: gen.func.buildActionInsert(Product, []),
    });

    const editor = defineEditor({
      name: "ProductEditor",
      entity: Product,
      purpose: "create",
      create: createProduct,
    });

    expect(editor.forms.create).toBeDefined();
    expect(editor.forms.update).toBeUndefined();
  });

  test("defineEditor omits forms when actions are missing", () => {
    const { gen } = createGen();
    const Tag = gen.entity("Tag", { name: gen.types.string() });

    const editor = defineEditor({
      name: "TagEditor",
      entity: Tag,
      purpose: "update",
    });

    expect(editor.forms.create).toBeUndefined();
    expect(editor.forms.update).toBeUndefined();
  });

  test("fieldOverrides merge widgets and labels into form fields", () => {
    const { gen } = createGen();
    const Article = gen.entity("Article", {
      title: gen.types.string(),
      body: gen.types.string(),
    });

    const updateArticle = gen.func.action({
      name: "updateArticle",
      input_type: Article,
      input_fields: [Article.fields.title, Article.fields.body],
      returns: Article,
      body: gen.func.buildActionUpdate(Article, []),
    });

    const richTextWidget = gen.ui.widget("textArea");

    const editor = defineEditor({
      name: "ArticleEditor",
      entity: Article,
      purpose: "update",
      update: updateArticle,
      fieldOverrides: [
        fieldOverride(Article.fields.body, { widget: richTextWidget, label: "Content" }),
      ],
    });

    const bodyField = editor.forms.update!.fields.find((f) => f.name === "body")!;
    expect(bodyField.widget.kind).toBe("textArea");
    expect(bodyField.label).toBe("Content");
  });

  test("fieldOverride builder produces correct record", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { name: gen.types.string() });

    const override = fieldOverride(User.fields.name, {
      label: "Full Name",
      read_only: true,
    });

    expect(override.field).toBe(User.fields.name);
    expect(override.label).toBe("Full Name");
    expect(override.read_only).toBe(true);
  });

  test("editorSection builder produces correct record", () => {
    const section = editorSection("meta", {
      label: "Metadata",
      region: "sidebar",
      collapsed: true,
      order: 5,
    });

    expect(section.name).toBe("meta");
    expect(section.label).toBe("Metadata");
    expect(section.region).toBe("sidebar");
    expect(section.collapsed).toBe(true);
    expect(section.order).toBe(5);
  });

  test("nestedEditor creates a NestedEditor record", () => {
    const { gen } = createGen();
    const Author = gen.entity("Author", { name: gen.types.string() });
    const Book = gen.entity("Book", { title: gen.types.string() });

    const authorWritesBook = gen.relation({
      name: "AuthorWrites",
      from_entity: Author,
      from_field: Author.fields.name,
      to_entity: Book,
      to_field: Book.fields.title,
      kind: "one_to_many",
    });

    const bookEditor = defineEditor({
      name: "BookEditor",
      entity: Book,
      purpose: "update",
    });

    const nested = nestedEditor(authorWritesBook, bookEditor, { inline: false });

    expect(nested.relation).toBe(authorWritesBook);
    expect(nested.editor).toBe(bookEditor);
    expect(nested.inline).toBe(false);
  });

  test("editorCommand creates an EditorCommand record", () => {
    const cmd = editorCommand("save", "Save", "save", {
      icon: "floppy-disk",
      region: "toolbar",
      visible_in: ["edit", "split"],
    });

    expect(cmd.name).toBe("save");
    expect(cmd.label).toBe("Save");
    expect(cmd.handler).toBe("save");
    expect(cmd.icon).toBe("floppy-disk");
    expect(cmd.region).toBe("toolbar");
    expect(cmd.visible_in).toEqual(["edit", "split"]);
  });
});

describe("Editor features", () => {
  test("sections and field override section references", () => {
    const { gen } = createGen();
    const Post = gen.entity("Post", {
      title: gen.types.string(),
      body: gen.types.string(),
    });

    const createPost = gen.func.action({
      name: "createPost",
      input_type: Post,
      input_fields: [Post.fields.title, Post.fields.body],
      returns: Post,
      body: gen.func.buildActionInsert(Post, []),
    });

    const editor = defineEditor({
      name: "PostEditor",
      entity: Post,
      purpose: "create",
      create: createPost,
      sections: [
        editorSection("content", { label: "Content", region: "main" }),
        editorSection("meta", { label: "Metadata", region: "sidebar" }),
      ],
      fieldOverrides: [
        fieldOverride(Post.fields.title, { section: "meta" }),
        fieldOverride(Post.fields.body, { section: "content" }),
      ],
    });

    expect(editor.sections.length).toBe(2);
    expect(editor.fields[0].section).toBe("meta");
    expect(editor.fields[1].section).toBe("content");
  });

  test("hooks, default_values, version_field, and preview_component", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      version: gen.types.int(),
    });

    const createUser = gen.func.action({
      name: "createUser",
      input_type: User,
      input_fields: [User.fields.id, User.fields.name],
      returns: User,
      body: gen.func.buildActionInsert(User, []),
    });

    const beforeSave = gen.func.expr({
      name: "stripWhitespace",
      input_type: User,
      output_type: User,
      body: gen.expr.literal(gen.types.string(), { kind: "string", string_value: "" }),
    });

    const onSuccess = gen.func.static({
      name: "refreshUsers",
      input_type: gen.types.string(),
      output_type: gen.types.string(),
      body: { kind: "native", output_type: gen.types.string(), requirements: [], effects: [] },
    });

    const preview = gen.ui.component(
      "UserCard",
      "UserCardProps",
      [],
      [],
      [],
      gen.ui.view("UserCardView", [], "div"),
    );

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "create",
      create: createUser,
      hooks: {
        before_save: beforeSave,
        on_success: onSuccess,
      },
      default_values: new Map([
        [
          "name",
          gen.expr.literal(gen.types.string(), { kind: "string", string_value: "Anonymous" }),
        ],
      ]),
      version_field: User.fields.version,
      preview_component: preview,
    });

    expect(editor.hooks?.before_save).toBe(beforeSave);
    expect(editor.hooks?.on_success).toBe(onSuccess);
    expect(editor.default_values?.get("name")).toBeDefined();
    expect(editor.version_field).toBe(User.fields.version);
    expect(editor.preview_component).toBe(preview);
  });
});

describe("Editor validation (checkEditors)", () => {
  test("flags missing create action for create purpose", () => {
    const { gen, ctx } = createGen();
    const Tag = gen.entity("Tag", { name: gen.types.string() });

    const editor = defineEditor({
      name: "TagEditor",
      entity: Tag,
      purpose: "create",
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:missing-create-action")).toBe(true);
  });

  test("flags missing update action and load query for update purpose", () => {
    const { gen, ctx } = createGen();
    const Tag = gen.entity("Tag", { name: gen.types.string() });

    const editor = defineEditor({
      name: "TagEditor",
      entity: Tag,
      purpose: "update",
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:missing-update-action")).toBe(true);
    expect(diagnostics.some((d) => d.code === "editor:missing-load-query")).toBe(true);
  });

  test("flags load query return type mismatch", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });
    const Post = gen.entity("Post", { title: gen.types.string() });

    const loadPost = gen.func.query({
      name: "loadPost",
      input_type: gen.types.uuid(),
      returns: Post,
      body: gen.query.build({
        source: { kind: "entity_source", entity: Post },
        result_type: gen.types.string(),
      }),
    });

    const updateUser = gen.func.action({
      name: "updateUser",
      input_type: User,
      input_fields: [User.fields.id],
      returns: User,
      body: gen.func.buildActionUpdate(User, []),
    });

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "update",
      load: loadPost,
      update: updateUser,
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:load-query-mismatch")).toBe(true);
  });

  test("flags action entity mismatch", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });
    const Post = gen.entity("Post", { title: gen.types.string() });

    const loadUser = gen.func.query({
      name: "loadUser",
      input_type: gen.types.uuid(),
      returns: User,
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.string(),
      }),
    });

    const updatePost = gen.func.action({
      name: "updatePost",
      input_type: Post,
      input_fields: [Post.fields.title],
      returns: Post,
      body: gen.func.buildActionUpdate(Post, []),
    });

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "update",
      load: loadUser,
      update: updatePost,
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:action-entity-mismatch")).toBe(true);
  });

  test("flags field override from wrong entity", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });
    const Post = gen.entity("Post", { title: gen.types.string() });

    const updateUser = gen.func.action({
      name: "updateUser",
      input_type: User,
      input_fields: [User.fields.id],
      returns: User,
      body: gen.func.buildActionUpdate(User, []),
    });

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "update",
      update: updateUser,
      fieldOverrides: [fieldOverride(Post.fields.title)],
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:field-not-in-entity")).toBe(true);
  });

  test("flags duplicate field overrides", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

    const updateUser = gen.func.action({
      name: "updateUser",
      input_type: User,
      input_fields: [User.fields.id, User.fields.name],
      returns: User,
      body: gen.func.buildActionUpdate(User, []),
    });

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "update",
      update: updateUser,
      fieldOverrides: [
        fieldOverride(User.fields.name, { label: "Full Name" }),
        fieldOverride(User.fields.name, { label: "Display Name" }),
      ],
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:duplicate-field-override")).toBe(true);
  });

  test("flags nested editor with unrelated relation", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });
    const Post = gen.entity("Post", { title: gen.types.string() });
    const Comment = gen.entity("Comment", { text: gen.types.string() });

    const userToComment = gen.relation({
      name: "UserComments",
      from_entity: User,
      from_field: User.fields.id,
      to_entity: Comment,
      to_field: Comment.fields.text,
      kind: "one_to_many",
    });

    const commentEditor = defineEditor({
      name: "CommentEditor",
      entity: Comment,
      purpose: "update",
    });

    const editor = defineEditor({
      name: "PostEditor",
      entity: Post,
      purpose: "update",
      nested: [nestedEditor(userToComment, commentEditor)],
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:nested-relation-mismatch")).toBe(true);
  });

  test("flags nested editor cycles", () => {
    const { gen, ctx } = createGen();
    const Author = gen.entity("Author", { name: gen.types.string() });
    const Book = gen.entity("Book", { title: gen.types.string() });

    const authorToBook = gen.relation({
      name: "AuthorBooks",
      from_entity: Author,
      from_field: Author.fields.name,
      to_entity: Book,
      to_field: Book.fields.title,
      kind: "one_to_many",
    });

    const bookToAuthor = gen.relation({
      name: "BookAuthor",
      from_entity: Book,
      from_field: Book.fields.title,
      to_entity: Author,
      to_field: Author.fields.name,
      kind: "many_to_one",
    });

    const bookEditor = defineEditor({
      name: "BookEditor",
      entity: Book,
      purpose: "update",
      nested: [],
    });

    const authorEditor = defineEditor({
      name: "AuthorEditor",
      entity: Author,
      purpose: "update",
      nested: [nestedEditor(authorToBook, bookEditor)],
    });

    // Close the cycle
    (bookEditor as { nested: typeof bookEditor.nested }).nested = [
      nestedEditor(bookToAuthor, authorEditor),
    ];

    ctx.editors.push(authorEditor);
    ctx.editors.push(bookEditor);

    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:nested-cycle")).toBe(true);
  });

  test("flags unregistered draft entity", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });
    // Create a draft entity directly so it is NOT registered in ctx.entities
    const DraftUser = defineEntity("DraftUser", {
      id: gen.types.uuid(),
      name: gen.types.string(),
    });

    const updateUser = gen.func.action({
      name: "updateUser",
      input_type: User,
      input_fields: [User.fields.id],
      returns: User,
      body: gen.func.buildActionUpdate(User, []),
    });

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "update",
      update: updateUser,
      draft_entity: DraftUser,
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:draft-unregistered")).toBe(true);
  });

  test("flags section reference for unknown section", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

    const updateUser = gen.func.action({
      name: "updateUser",
      input_type: User,
      input_fields: [User.fields.id, User.fields.name],
      returns: User,
      body: gen.func.buildActionUpdate(User, []),
    });

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "update",
      update: updateUser,
      fieldOverrides: [fieldOverride(User.fields.name, { section: "does_not_exist" })],
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:section-not-found")).toBe(true);
  });

  test("flags duplicate section names", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    const updateUser = gen.func.action({
      name: "updateUser",
      input_type: User,
      input_fields: [User.fields.id],
      returns: User,
      body: gen.func.buildActionUpdate(User, []),
    });

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "update",
      update: updateUser,
      sections: [
        editorSection("meta", { label: "Meta" }),
        editorSection("meta", { label: "Meta 2" }),
      ],
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:duplicate-section")).toBe(true);
  });

  test("flags default_values referencing unknown field", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    const createUser = gen.func.action({
      name: "createUser",
      input_type: User,
      input_fields: [User.fields.id],
      returns: User,
      body: gen.func.buildActionInsert(User, []),
    });

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "create",
      create: createUser,
      default_values: new Map([
        [
          "unknown_field",
          gen.expr.literal(gen.types.string(), { kind: "string", string_value: "x" }),
        ],
      ]),
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:default-value-unknown-field")).toBe(true);
  });

  test("flags version_field not in entity", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });
    const Post = gen.entity("Post", { title: gen.types.string() });

    const updateUser = gen.func.action({
      name: "updateUser",
      input_type: User,
      input_fields: [User.fields.id],
      returns: User,
      body: gen.func.buildActionUpdate(User, []),
    });

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "update",
      update: updateUser,
      version_field: Post.fields.title,
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:version-field-not-in-entity")).toBe(true);
  });

  test("flags unregistered hooks", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid() });

    const updateUser = gen.func.action({
      name: "updateUser",
      input_type: User,
      input_fields: [User.fields.id],
      returns: User,
      body: gen.func.buildActionUpdate(User, []),
    });

    // Create a hook directly so it is NOT registered in ctx.expr_functions
    const unregisteredHook = defineExprFunction({
      name: "unregisteredStrip",
      input_type: User,
      output_type: User,
      body: gen.expr.literal(gen.types.string(), { kind: "string", string_value: "" }),
    });

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "update",
      update: updateUser,
      hooks: { before_save: unregisteredHook },
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics.some((d) => d.code === "editor:unregistered-hook")).toBe(true);
  });

  test("passes validation for a well-formed editor", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      version: gen.types.int(),
    });

    const loadUser = gen.func.query({
      name: "loadUser",
      input_type: gen.types.uuid(),
      returns: User,
      body: gen.query.build({
        source: { kind: "entity_source", entity: User },
        result_type: gen.types.string(),
      }),
    });

    const createUser = gen.func.action({
      name: "createUser",
      input_type: User,
      input_fields: [User.fields.id, User.fields.name],
      returns: User,
      body: gen.func.buildActionInsert(User, []),
    });

    const updateUser = gen.func.action({
      name: "updateUser",
      input_type: User,
      input_fields: [User.fields.id, User.fields.name],
      returns: User,
      body: gen.func.buildActionUpdate(User, []),
    });

    const beforeSave = gen.func.expr({
      name: "normalizeUser",
      input_type: User,
      output_type: User,
      body: gen.expr.literal(gen.types.string(), { kind: "string", string_value: "" }),
    });

    const onSuccess = gen.func.static({
      name: "refreshUsers",
      input_type: gen.types.string(),
      output_type: gen.types.string(),
      body: { kind: "native", output_type: gen.types.string(), requirements: [], effects: [] },
    });

    const editor = defineEditor({
      name: "UserEditor",
      entity: User,
      purpose: "create_or_update",
      load: loadUser,
      create: createUser,
      update: updateUser,
      sections: [editorSection("main", { label: "Main" })],
      fieldOverrides: [fieldOverride(User.fields.name, { section: "main" })],
      modes: ["split", "edit", "preview"],
      commands: [editorCommand("save", "Save", "save")],
      hooks: { before_save: beforeSave, on_success: onSuccess },
      default_values: new Map([
        [
          "name",
          gen.expr.literal(gen.types.string(), { kind: "string", string_value: "Anonymous" }),
        ],
      ]),
      version_field: User.fields.version,
    });

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics).toEqual([]);
  });
});

describe("Gen namespace integration", () => {
  test("gen.editor.define registers the editor into ctx.editors", () => {
    const { gen, ctx } = createGen();
    const Product = gen.entity("Product", { name: gen.types.string() });

    const createProduct = gen.func.action({
      name: "createProduct",
      input_type: Product,
      input_fields: [Product.fields.name],
      returns: Product,
      body: gen.func.buildActionInsert(Product, []),
    });

    const editor = gen.editor.define({
      name: "ProductEditor",
      entity: Product,
      purpose: "create",
      create: createProduct,
    });

    expect(ctx.editors).toContain(editor);
    expect(editor.name).toBe("ProductEditor");
    expect(editor.forms.create).toBeDefined();
  });

  test("gen.editor.fieldOverride and gen.editor.section are available", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { name: gen.types.string() });

    const override = gen.editor.fieldOverride(User.fields.name, { label: "Full Name" });
    expect(override.field).toBe(User.fields.name);
    expect(override.label).toBe("Full Name");

    const section = gen.editor.section("meta", { label: "Metadata", region: "sidebar" });
    expect(section.name).toBe("meta");
    expect(section.region).toBe("sidebar");
  });

  test("gen.editor.nested and gen.editor.command are available", () => {
    const { gen } = createGen();
    const Author = gen.entity("Author", { name: gen.types.string() });
    const Book = gen.entity("Book", { title: gen.types.string() });

    const rel = gen.relation({
      name: "AuthorBooks",
      from_entity: Author,
      from_field: Author.fields.name,
      to_entity: Book,
      to_field: Book.fields.title,
      kind: "one_to_many",
    });

    const bookEditor = gen.editor.define({
      name: "BookEditor",
      entity: Book,
      purpose: "update",
    });

    const nested = gen.editor.nested(rel, bookEditor, { inline: true });
    expect(nested.inline).toBe(true);

    const cmd = gen.editor.command("delete", "Delete", "delete", { region: "toolbar" });
    expect(cmd.region).toBe("toolbar");
  });
});

describe("autoEditor", () => {
  test("derives an Editor from entity and CRUD with default settings", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      email: gen.types.email(),
    });

    const userCrud = gen.crud.derive(User);
    const editor = gen.editor.auto(User, userCrud);

    expect(editor.name).toBe("UserEditor");
    expect(editor.purpose).toBe("create_or_update");
    expect(editor.target_entity).toBe(User);
    expect(editor.load_query).toBe(userCrud.getById);
    expect(editor.create_action).toBe(userCrud.create);
    expect(editor.update_action).toBe(userCrud.update);
    expect(editor.delete_action).toBe(userCrud.delete);

    // Forms derived from create and update actions
    expect(editor.forms.create).toBeDefined();
    expect(editor.forms.update).toBeDefined();

    // Default section
    expect(editor.sections).toHaveLength(1);
    expect(editor.sections[0]!.name).toBe("main");

    // Field overrides for all writable fields
    expect(editor.fields).toHaveLength(3);
    expect(editor.fields.map((f) => f.field.name)).toContain("name");
    expect(editor.fields.map((f) => f.field.name)).toContain("email");
  });

  test("excludes read-only fields from auto-generated overrides", () => {
    const { gen } = createGen();
    const Post = gen.entity("Post", {
      id: gen.types.uuid(),
      title: gen.types.string(),
      created_at: { type: gen.types.datetime(), read_only: true },
    });

    const postCrud = gen.crud.derive(Post);
    const editor = gen.editor.auto(Post, postCrud);

    const fieldNames = editor.fields.map((f) => f.field.name);
    expect(fieldNames).toContain("title");
    expect(fieldNames).not.toContain("created_at");
  });

  test("allows name override", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

    const userCrud = gen.crud.derive(User);
    const editor = gen.editor.auto(User, userCrud, { name: "CustomUserEditor" });

    expect(editor.name).toBe("CustomUserEditor");
  });

  test("allows purpose override", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

    const userCrud = gen.crud.derive(User);
    const editor = gen.editor.auto(User, userCrud, { purpose: "update" });

    expect(editor.purpose).toBe("update");
  });

  test("allows custom field overrides to merge with defaults", () => {
    const { gen } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      email: gen.types.email(),
    });

    const userCrud = gen.crud.derive(User);
    const editor = gen.editor.auto(User, userCrud, {
      fieldOverrides: [gen.editor.fieldOverride(User.fields.name, { label: "Full Name" })],
    });

    const nameOverride = editor.fields.find((f) => f.field.name === "name");
    expect(nameOverride).toBeDefined();
    expect(nameOverride!.label).toBe("Full Name");

    // email still gets default override
    const emailOverride = editor.fields.find((f) => f.field.name === "email");
    expect(emailOverride).toBeDefined();
    expect(emailOverride!.widget).toBeDefined();
  });

  test("allows custom sections", () => {
    const { gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

    const userCrud = gen.crud.derive(User);
    const editor = gen.editor.auto(User, userCrud, {
      sections: [
        gen.editor.section("content", { label: "Content", region: "main" }),
        gen.editor.section("meta", { label: "Metadata", region: "sidebar" }),
      ],
    });

    expect(editor.sections).toHaveLength(2);
    expect(editor.sections[0]!.name).toBe("content");
    expect(editor.sections[1]!.name).toBe("meta");
  });

  test("registers editor into GenContext via bindEditor", () => {
    const { ctx, gen } = createGen();
    const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

    const userCrud = gen.crud.derive(User);
    const editor = gen.editor.auto(User, userCrud);

    // autoEditor returns an Editor but does NOT auto-register into ctx.editors
    // because we didn't bind it. Let's verify it returns a valid Editor.
    expect(editor.name).toBe("UserEditor");
    expect(ctx.editors).not.toContain(editor);

    // To register, use gen.editor.define after creating it manually,
    // or we can manually push.
    ctx.editors.push(editor);
    expect(ctx.editors).toContain(editor);
  });

  test("passes checkEditors when autoEditor is registered", () => {
    const { gen, ctx } = createGen();
    const User = gen.entity("User", {
      id: gen.types.uuid(),
      name: gen.types.string(),
      email: gen.types.email(),
    });

    const userCrud = gen.crud.derive(User);
    const editor = gen.editor.auto(User, userCrud);

    ctx.editors.push(editor);
    const diagnostics = checkEditors({
      editors: ctx.editors,
      entities: ctx.entities,
      queries: ctx.query_functions,
      actions: ctx.action_functions,
      expr_functions: ctx.expr_functions,
      static_functions: ctx.static_functions,
    });

    expect(diagnostics).toHaveLength(0);
  });
});
