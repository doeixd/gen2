/* @__NO_SIDE_EFFECTS__ */
/**
 * Editor IR. WYSIWYG editor surfaces that bind query, form, and per-field
 * preview components for creating, editing, and deleting entities.
 *
 * Each {@link EditorFieldOverride} may declare a `display_component` that renders
 * the field's value in a live preview pane. The backend target composes these
 * into a preview {@link View} or uses a single {@link Editor.preview_component}.
 * Nested/collection editing is supported via {@link NestedEditor}. Fields can be
 * grouped into {@link EditorSection}s and shown conditionally via `visible_when`.
 *
 * @example
 * ```ts
 * const PostEditor = gen.editor.define({
 *   name: "PostEditor",
 *   entity: Post,
 *   purpose: "create_or_update",
 *   load: getPostById,
 *   create: createPost,
 *   update: updatePost,
 *   preview_component: PostCard,
 *   sections: [
 *     gen.editor.section("content", { label: "Content", region: "main" }),
 *     gen.editor.section("meta", { label: "Metadata", region: "sidebar" }),
 *   ],
 *   fieldOverrides: [
 *     gen.editor.fieldOverride(Post.fields.body, {
 *       widget: richTextWidget,
 *       display_component: MarkdownPreview,
 *       section: "content",
 *     }),
 *     gen.editor.fieldOverride(Post.fields.tags, {
 *       visible_when: gen.expr.predicate(gt(ref("tags.length"), literal(0))),
 *       section: "meta",
 *     }),
 *   ],
 *   nested: [gen.editor.nested(PostComments, CommentEditor, { inline: true })],
 *   hooks: {
 *     before_save: stripMarkdownHook,
 *     on_success: refreshPostList,
 *   },
 *   modes: ["split", "edit", "preview"],
 *   options: { autosave_interval_ms: 30000, live_preview: true },
 * });
 * ```
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";
import type { Expr, Predicate } from "../expression/index.ts";
import type {
  ActionFunction,
  ExprFunction,
  QueryFunction,
  StaticFunction,
} from "../function/index.ts";
import type { Relation } from "../relation/index.ts";
import type { SemanticType } from "../types/index.ts";
import type { Component, Form, Slot, View, Widget } from "../ui/index.ts";
import { defineForm, defineFormField } from "../ui/index.ts";
import { controlFor, widgetCapability } from "../forms/index.ts";
import type { Crud } from "../crud/index.ts";

/** Interaction mode for an editor surface. */
export type EditorMode = "edit" | "preview" | "split";

/** What lifecycle operations the editor supports. */
export type EditorPurpose = "create" | "update" | "create_or_update";

/** Named region within the editor chrome where content can be placed. */
export type EditorRegion = "toolbar" | "sidebar" | "main" | "footer" | "modal";

/** A command exposed by the editor chrome (toolbar, sidebar, etc.). */
export interface EditorCommand {
  readonly name: string;
  readonly label: string;
  readonly icon?: string;
  readonly region: EditorRegion;
  /** Action to invoke, or a built-in command name. */
  readonly handler:
    | ActionFunction
    | "save"
    | "save_and_close"
    | "discard"
    | "delete"
    | "undo"
    | "redo";
  /** Modes in which this command is visible and enabled. */
  readonly visible_in: readonly EditorMode[];
}

/**
 * A named section that groups fields in the editor chrome.
 *
 * @example
 * ```ts
 * const section = editorSection("content", { label: "Content", region: "main", collapsed: false });
 * ```
 */
export interface EditorSection {
  readonly name: string;
  readonly label: string;
  readonly region?: EditorRegion;
  /** Whether the section starts collapsed. */
  readonly collapsed: boolean;
  /** Display order relative to other sections. */
  readonly order: number;
}

/**
 * Lifecycle hooks for an editor.
 *
 * @example
 * ```ts
 * const hooks: EditorHooks = {
 *   before_save: stripMarkdownHook,
 *   on_success: refreshList,
 *   on_error: showToast,
 * };
 * ```
 */
export interface EditorHooks {
  /** Expression function called before save to transform values. */
  readonly before_save?: ExprFunction;
  /** Static function called after a successful save. */
  readonly on_success?: StaticFunction;
  /** Static function called after a failed save. */
  readonly on_error?: StaticFunction;
}

/**
 * Per-field override within an editor.
 *
 * @example
 * ```ts
 * const override = fieldOverride(Post.fields.body, {
 *   widget: richTextWidget,
 *   display_component: MarkdownPreview,
 *   section: "content",
 *   visible_when: gen.expr.predicate(isNotEmpty(ref("body"))),
 * });
 * ```
 */
export interface EditorFieldOverride<E = unknown> {
  /** The entity field being overridden. */
  readonly field: Field;
  /** Optional custom widget (defaults to type-inferred). */
  readonly widget?: Widget<E>;
  /** Optional component that renders this field's value in the preview pane. */
  readonly display_component?: Component<unknown, E>;
  /** Optional label override. */
  readonly label?: string;
  /** Which chrome region this field appears in. */
  readonly region?: EditorRegion;
  /** Section name this field belongs to. */
  readonly section?: string;
  /** Whether this field is read-only in the editor. */
  readonly read_only?: boolean;
  /** Predicate controlling field visibility. */
  readonly visible_when?: Predicate;
  /** Optional custom validation expression for this field. */
  readonly validate?: Expr;
}

/**
 * A nested editor bound to a relation for inline or modal collection editing.
 *
 * @example
 * ```ts
 * const nested: NestedEditor = {
 *   relation: PostToComments,
 *   editor: CommentEditor,
 *   inline: true,
 * };
 * ```
 */
export interface NestedEditor<Out = unknown, E = unknown> {
  /** The relation connecting the parent entity to the nested entity. */
  readonly relation: Relation;
  /** The editor to use for the related entity. */
  readonly editor: Editor<Out, E>;
  /** When true, the nested editor renders inline; otherwise it opens in a modal or navigates. */
  readonly inline: boolean;
}

/**
 * Behavioral options for an editor.
 *
 * Backends extend this via declaration merging on {@link GenConfig}.
 */
export interface EditorOptions {
  /** Target editor backend (e.g., "solid-js", "react", "tui"). */
  readonly backend?: string;
  /** Autosave interval in milliseconds; omit to disable. */
  readonly autosave_interval_ms?: number;
  /** Whether the preview updates on every keystroke. */
  readonly live_preview?: boolean;
  /** Max undo stack depth. */
  readonly undo_depth?: number;
  /** Validate fields on change rather than only on submit. */
  readonly validate_on_change?: boolean;
  /** Allow editing nested relation collections inline. */
  readonly inline_collections?: boolean;
  /** Show a confirmation dialog when navigating away with unsaved changes. */
  readonly confirm_on_unsaved?: boolean;
}

/**
 * Derived forms for an editor, keyed by purpose.
 *
 * @typeParam Out - TypeScript type of the save action's result.
 * @typeParam E - Phantom platform element type.
 */
export interface EditorForms<Out = unknown, E = unknown> {
  /** Form used when creating a new entity. */
  readonly create?: Form<Out, E>;
  /** Form used when updating an existing entity. */
  readonly update?: Form<Out, E>;
}

/**
 * A WYSIWYG editor surface binding read, edit, and preview for an entity.
 *
 * @typeParam E - Phantom platform element type (must match `Form`, `View`, and `Component`).
 * @typeParam Out - TypeScript type of the save action's result.
 */
export interface Editor<Out = unknown, E = unknown> {
  readonly name: string;
  readonly purpose: EditorPurpose;
  readonly target_entity: Entity;
  /** Optional draft/staging entity for optimistic editing. */
  readonly draft_entity?: Entity;
  /** How to load an existing entity (required for update). */
  readonly load_query?: QueryFunction;
  /** How to create a new entity (required for create). */
  readonly create_action?: ActionFunction<unknown, Out>;
  /** How to persist edits (required for update). */
  readonly update_action?: ActionFunction<unknown, Out>;
  /** How to delete the entity. */
  readonly delete_action?: ActionFunction;
  /** Field-level overrides and display components. */
  readonly fields: readonly EditorFieldOverride<E>[];
  /** Derived editing forms (create and/or update). */
  readonly forms: EditorForms<Out, E>;
  /** Optional component that renders the entire entity in the preview pane. */
  readonly preview_component?: Component<unknown, E>;
  /** Available interaction modes. */
  readonly modes: readonly EditorMode[];
  /** Commands exposed by the editor chrome. */
  readonly commands: readonly EditorCommand[];
  /** Nested editors for relation collections. */
  readonly nested: readonly NestedEditor<Out, E>[];
  /** Behavioral options. */
  readonly options: EditorOptions;
  /** Optional custom chrome layout view. */
  readonly chrome_view?: View<E>;
  /** Field sections for grouping. */
  readonly sections: readonly EditorSection[];
  /** Lifecycle hooks. */
  readonly hooks?: EditorHooks;
  /** Default values for fields in create mode. */
  readonly default_values?: ReadonlyMap<string, Expr>;
  /** Field used for optimistic locking / versioning. */
  readonly version_field?: Field;
}

// --- Input -----------------------------------------------------------------

/** User-facing input for {@link defineEditor}. */
export interface DefineEditorInput<Out = unknown, E = unknown> {
  readonly name: string;
  readonly entity: Entity;
  readonly purpose: EditorPurpose;
  readonly draft_entity?: Entity;
  /** Query used to load an existing entity. */
  readonly load?: QueryFunction;
  /** Action used to create a new entity. */
  readonly create?: ActionFunction<unknown, Out>;
  /** Action used to update an existing entity. */
  readonly update?: ActionFunction<unknown, Out>;
  /** Action used to delete the entity. */
  readonly delete?: ActionFunction;
  /** Per-field overrides including widgets, display components, and regions. */
  readonly fieldOverrides?: readonly EditorFieldOverride<E>[];
  /** Available interaction modes (defaults to `["edit"]`). */
  readonly modes?: readonly EditorMode[];
  /** Chrome commands. */
  readonly commands?: readonly EditorCommand[];
  /** Nested relation editors. */
  readonly nested?: readonly NestedEditor<Out, E>[];
  /** Behavioral options. */
  readonly options?: EditorOptions;
  /** Custom chrome layout view. */
  readonly chrome_view?: View<E>;
  /** Field sections for grouping. */
  readonly sections?: readonly EditorSection[];
  /** Lifecycle hooks. */
  readonly hooks?: EditorHooks;
  /** Default values for fields in create mode. */
  readonly default_values?: ReadonlyMap<string, Expr>;
  /** Field used for optimistic locking / versioning. */
  readonly version_field?: Field;
  /** Optional component that renders the entire entity in the preview pane. */
  readonly preview_component?: Component<unknown, E>;
}

// --- Builder helpers -------------------------------------------------------

/**
 * Derives a {@link Form} from an action and field overrides.
 *
 * @param name - Form name.
 * @param action - Source action function.
 * @param fieldOverrides - Field overrides to apply.
 * @returns A Form record, or undefined if the action is missing.
 */
const deriveForm = <Out = unknown, E = unknown>(
  name: string,
  action: ActionFunction<unknown, Out> | undefined,
  fieldOverrides: readonly EditorFieldOverride<E>[],
): Form<Out, E> | undefined => {
  if (!action) return undefined;

  const overrideMap = new Map(fieldOverrides.map((o) => [o.field.name, o]));

  const formFields = action.input_fields.map((field) => {
    const override = overrideMap.get(field.name);
    return defineFormField<unknown, E>(
      field.name,
      field,
      override?.widget ?? controlFor<unknown, E>(field, "form"),
      [field.name],
      override?.label ?? field.name,
    );
  });

  const slots: Slot<E>[] = formFields.map((f) => ({
    name: f.name,
    capability: widgetCapability(f.widget.kind),
    allowed_attributes: [],
    allowed_events: [],
    platform_requirements: [],
    hidden: false,
  }));

  return defineForm<Out, E>(name, action, formFields, slots, action.returns as SemanticType<Out>);
};

// --- Builder ---------------------------------------------------------------

/**
 * Creates an {@link Editor} record from structured input.
 *
 * Derives separate editing {@link Form}s for `create` and `update` actions.
 * Missing required actions are tolerated so that `checkEditors` can emit
 * diagnostics instead of throwing.
 *
 * @param input - Editor definition input.
 * @returns An Editor record.
 *
 * @example
 * ```ts
 * const editor = defineEditor({
 *   name: "PostEditor",
 *   entity: Post,
 *   purpose: "create_or_update",
 *   load: getPost,
 *   create: createPost,
 *   update: savePost,
 *   modes: ["split", "edit", "preview"],
 * });
 * ```
 */
export const defineEditor = <Out = unknown, E = unknown>(
  input: DefineEditorInput<Out, E>,
): Editor<Out, E> => {
  const overrides = input.fieldOverrides ?? [];

  return {
    name: input.name,
    purpose: input.purpose,
    target_entity: input.entity,
    draft_entity: input.draft_entity,
    load_query: input.load,
    create_action: input.create,
    update_action: input.update,
    delete_action: input.delete,
    fields: overrides,
    forms: {
      create: deriveForm(`${input.name}CreateForm`, input.create, overrides),
      update: deriveForm(`${input.name}UpdateForm`, input.update, overrides),
    },
    preview_component: input.preview_component,
    modes: input.modes ?? ["edit"],
    commands: input.commands ?? [],
    nested: input.nested ?? [],
    options: input.options ?? {},
    chrome_view: input.chrome_view,
    sections: input.sections ?? [],
    hooks: input.hooks,
    default_values: input.default_values,
    version_field: input.version_field,
  };
};

// --- Convenience constructors ----------------------------------------------

/**
 * Creates an {@link EditorFieldOverride} for a given field.
 *
 * @param field - The entity field to override.
 * @param options - Override options (widget, label, region, etc.).
 * @returns An EditorFieldOverride record.
 *
 * @example
 * ```ts
 * const override = fieldOverride(Post.fields.body, { widget: richTextWidget, section: "content" });
 * ```
 */
export const fieldOverride = <E = unknown>(
  field: Field,
  options?: Omit<EditorFieldOverride<E>, "field">,
): EditorFieldOverride<E> => ({ field, ...options });

/**
 * Creates an {@link EditorSection}.
 *
 * @param name - Section name.
 * @param options - Optional label, region, collapsed state, and order.
 * @returns An EditorSection record.
 *
 * @example
 * ```ts
 * const section = editorSection("content", { label: "Content", region: "main" });
 * ```
 */
export const editorSection = (
  name: string,
  options?: {
    label?: string;
    region?: EditorRegion;
    collapsed?: boolean;
    order?: number;
  },
): EditorSection => ({
  name,
  label: options?.label ?? name,
  region: options?.region,
  collapsed: options?.collapsed ?? false,
  order: options?.order ?? 0,
});

/**
 * Creates a {@link NestedEditor} for inline or modal collection editing.
 *
 * @param relation - The relation connecting parent to child entity.
 * @param editor - The editor to use for the related entity.
 * @param options - Optional settings (`inline` defaults to true).
 * @returns A NestedEditor record.
 *
 * @example
 * ```ts
 * const nestedComments = nestedEditor(PostToComments, CommentEditor, { inline: true });
 * ```
 */
export const nestedEditor = <Out = unknown, E = unknown>(
  relation: Relation,
  editor: Editor<Out, E>,
  options?: { inline?: boolean },
): NestedEditor<Out, E> => ({
  relation,
  editor,
  inline: options?.inline ?? true,
});

/**
 * Creates an {@link EditorCommand}.
 *
 * @param name - Command name.
 * @param label - Human-readable label.
 * @param handler - Action function or built-in command name.
 * @param options - Optional icon, region, and visible modes.
 * @returns An EditorCommand record.
 */
export const editorCommand = (
  name: string,
  label: string,
  handler: EditorCommand["handler"],
  options?: {
    icon?: string;
    region?: EditorRegion;
    visible_in?: readonly EditorMode[];
  },
): EditorCommand => ({
  name,
  label,
  handler,
  icon: options?.icon,
  region: options?.region ?? "toolbar",
  visible_in: options?.visible_in ?? ["edit", "split"],
});

// --- Auto-editor -----------------------------------------------------------

/**
 * Derives an {@link Editor} from an entity and its CRUD functions.
 *
 * This is a convenience factory that wires up `getById` → `load`,
 * `create` → `create`, `update` → `update`, and `delete` → `delete`.
 * All writable fields become editable with default widgets, grouped
 * into a single `"main"` section.
 *
 * @typeParam E - Phantom platform element type.
 * @typeParam Out - TypeScript type of the save action's result.
 * @param entity - The entity to edit.
 * @param crud - A {@link Crud} bundle (usually from `gen.crud.derive`).
 * @param options - Optional overrides for name, purpose, sections, modes, etc.
 * @returns A fully configured Editor.
 *
 * @example
 * ```ts
 * const userCrud = gen.crud.derive(User);
 * const UserEditor = gen.editor.auto(User, userCrud);
 * ```
 */
export const autoEditor = <E = unknown, Out = unknown>(
  entity: Entity,
  crud: Crud<Out>,
  options?: {
    readonly name?: string;
    readonly purpose?: EditorPurpose;
    readonly modes?: readonly EditorMode[];
    readonly sections?: readonly EditorSection[];
    readonly fieldOverrides?: readonly EditorFieldOverride<E>[];
    readonly preview_component?: Component<unknown, E>;
    readonly options?: EditorOptions;
    readonly hooks?: EditorHooks;
    readonly default_values?: ReadonlyMap<string, Expr>;
    readonly version_field?: Field;
  },
): Editor<Out, E> => {
  const writableFields = entity.fieldList.filter((f) => !f.read_only);

  // Build default field overrides for all writable fields.
  const defaultOverrides: EditorFieldOverride<E>[] = writableFields.map((field) =>
    fieldOverride<E>(field, {
      widget: controlFor<unknown, E>(field, "form"),
    }),
  );

  // Merge user-provided overrides on top of defaults.
  const userOverrides = options?.fieldOverrides ?? [];
  const overrideMap = new Map<string, EditorFieldOverride<E>>(
    defaultOverrides.map((o) => [o.field.name, o]),
  );
  for (const user of userOverrides) {
    const existing = overrideMap.get(user.field.name);
    if (existing) {
      overrideMap.set(user.field.name, { ...existing, ...user, field: user.field });
    } else {
      overrideMap.set(user.field.name, user);
    }
  }
  const mergedOverrides = [...overrideMap.values()];

  // Default single "main" section unless user provides sections.
  const sections: EditorSection[] =
    options?.sections && options.sections.length > 0
      ? [...options.sections]
      : [editorSection("main", { label: "Main", region: "main" })];

  // Default commands: save, delete (if delete action exists).
  const commands: EditorCommand[] = [
    editorCommand("save", "Save", "save", { region: "toolbar", visible_in: ["edit", "split"] }),
  ];
  if (crud.delete) {
    commands.push(
      editorCommand("delete", "Delete", "delete", { region: "toolbar", visible_in: ["edit"] }),
    );
  }

  return defineEditor<Out, E>({
    name: options?.name ?? `${entity.name}Editor`,
    entity,
    purpose: options?.purpose ?? "create_or_update",
    load: crud.getById,
    create: crud.create,
    update: crud.update,
    delete: crud.delete,
    fieldOverrides: mergedOverrides,
    modes: options?.modes ?? ["edit", "split"],
    commands,
    sections,
    preview_component: options?.preview_component,
    options: options?.options,
    hooks: options?.hooks,
    default_values: options?.default_values,
    version_field: options?.version_field,
  });
};

// --- Invariants and rules --------------------------------------------------

/**
 * Detects cycles in nested editor graphs.
 *
 * @param editor - The root editor to check.
 * @param path - Current path of editor names in the DFS.
 * @returns Diagnostics for any detected cycles.
 */
const checkNestedCycles = (
  editor: Editor,
  path: Set<string> = new Set(),
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  if (path.has(editor.name)) {
    out.push(
      diagnostic({
        severity: "error",
        code: "editor:nested-cycle",
        message: `Editor ${editor.name} contains a nested editor cycle: ${[...path, editor.name].join(" -> ")}`,
      }),
    );
    return out;
  }
  const nextPath = new Set(path);
  nextPath.add(editor.name);
  for (const ne of editor.nested) {
    out.push(...checkNestedCycles(ne.editor, nextPath));
  }
  return out;
};

/**
 * Validates editor invariants: required actions match purpose, entity
 * ownership, load query return type, field override validity, nested editor
 * relation consistency, command handler validity, draft entity consistency,
 * section references, visible_when field scoping, version field validity,
 * default value keys, hook registration, and nested editor cycles.
 *
 * @param input - Editor objects to validate.
 * @returns Diagnostics for any violated editor rules.
 */
export const checkEditors = (input: {
  readonly editors: readonly Editor[];
  readonly entities: readonly Entity[];
  readonly queries: readonly QueryFunction[];
  readonly actions: readonly ActionFunction[];
  readonly expr_functions?: readonly ExprFunction[];
  readonly static_functions?: readonly StaticFunction[];
}): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const entitySet = new Set(input.entities);
  const actionSet = new Set(input.actions);
  const querySet = new Set(input.queries);
  const exprSet = new Set(input.expr_functions ?? []);
  const staticSet = new Set(input.static_functions ?? []);

  for (const editor of input.editors) {
    // EditorEntityRegistered
    if (!entitySet.has(editor.target_entity)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "editor:unknown-entity",
          message: `Editor ${editor.name} targets entity ${editor.target_entity.name} that is not registered`,
        }),
      );
    }

    // PurposeMatchesActions
    if (
      (editor.purpose === "create" || editor.purpose === "create_or_update") &&
      !editor.create_action
    ) {
      out.push(
        diagnostic({
          severity: "error",
          code: "editor:missing-create-action",
          message: `Editor ${editor.name} with purpose "${editor.purpose}" requires a create action`,
        }),
      );
    }
    if (
      (editor.purpose === "update" || editor.purpose === "create_or_update") &&
      !editor.update_action
    ) {
      out.push(
        diagnostic({
          severity: "error",
          code: "editor:missing-update-action",
          message: `Editor ${editor.name} with purpose "${editor.purpose}" requires an update action`,
        }),
      );
    }
    if (
      (editor.purpose === "update" || editor.purpose === "create_or_update") &&
      !editor.load_query
    ) {
      out.push(
        diagnostic({
          severity: "error",
          code: "editor:missing-load-query",
          message: `Editor ${editor.name} with purpose "${editor.purpose}" requires a load query`,
        }),
      );
    }

    // LoadQueryReturnsTargetEntity
    if (editor.load_query) {
      if (!querySet.has(editor.load_query)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:unregistered-load-query",
            message: `Editor ${editor.name} load query ${editor.load_query.name} is not registered`,
          }),
        );
      }
      if (editor.load_query.returns.name !== editor.target_entity.name) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:load-query-mismatch",
            message: `Editor ${editor.name} load query returns ${editor.load_query.returns.name} but targets ${editor.target_entity.name}`,
          }),
        );
      }
    }

    // ActionTargetsEntity
    for (const [kind, action] of [
      ["create", editor.create_action],
      ["update", editor.update_action],
      ["delete", editor.delete_action],
    ] as const) {
      if (!action) continue;
      if (!actionSet.has(action)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:unregistered-action",
            message: `Editor ${editor.name} ${kind} action ${action.name} is not registered`,
          }),
        );
      }
      if (action.body.target_entity.name !== editor.target_entity.name) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:action-entity-mismatch",
            message: `Editor ${editor.name} ${kind} action targets ${action.body.target_entity.name} but editor targets ${editor.target_entity.name}`,
          }),
        );
      }
    }

    // DraftEntityValidation
    if (editor.draft_entity) {
      if (!entitySet.has(editor.draft_entity)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:draft-unregistered",
            message: `Editor ${editor.name} draft entity ${editor.draft_entity.name} is not registered`,
          }),
        );
      }
      const targetFieldNames = new Set(editor.target_entity.fieldList.map((f) => f.name));
      for (const df of editor.draft_entity.fieldList) {
        if (!targetFieldNames.has(df.name)) {
          out.push(
            diagnostic({
              severity: "warning",
              code: "editor:draft-extra-field",
              message: `Editor ${editor.name} draft entity ${editor.draft_entity.name} has extra field ${df.name} not present in target entity`,
            }),
          );
        }
      }
    }

    // FieldOverridesReferenceExistingFields
    for (const fo of editor.fields) {
      if (!editor.target_entity.fieldList.includes(fo.field)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:field-not-in-entity",
            message: `Editor ${editor.name} overrides field ${fo.field.name} which does not belong to ${editor.target_entity.name}`,
          }),
        );
      }
    }

    // ReadOnlyFieldInEditorOverride
    for (const fo of editor.fields) {
      if (fo.read_only === false && fo.field.read_only) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "editor:writable-override-on-readonly-field",
            message: `Editor ${editor.name} marks read-only field ${fo.field.name} as writable`,
          }),
        );
      }
    }

    // SectionReferencesValid
    const sectionNames = new Set(editor.sections.map((s) => s.name));
    for (const fo of editor.fields) {
      if (fo.section && !sectionNames.has(fo.section)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:section-not-found",
            message: `Editor ${editor.name} field ${fo.field.name} references unknown section ${fo.section}`,
          }),
        );
      }
    }

    // VisibleWhenFieldScope
    for (const fo of editor.fields) {
      if (!fo.visible_when) continue;
      for (const ref of fo.visible_when.refs) {
        if (ref.kind === "FieldRef" && ref.owner.name !== editor.target_entity.name) {
          out.push(
            diagnostic({
              severity: "error",
              code: "editor:visible-when-foreign-field",
              message: `Editor ${editor.name} field ${fo.field.name} visible_when references field ${ref.name} from foreign entity ${ref.owner.name}`,
            }),
          );
        }
      }
    }

    // VersionFieldValidation
    if (editor.version_field) {
      if (!editor.target_entity.fieldList.includes(editor.version_field)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:version-field-not-in-entity",
            message: `Editor ${editor.name} version field ${editor.version_field.name} does not belong to ${editor.target_entity.name}`,
          }),
        );
      }
      if (
        editor.version_field.semantic_type.kind !== "numeric" &&
        editor.version_field.semantic_type.kind !== "string"
      ) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "editor:version-field-type-unusual",
            message: `Editor ${editor.name} version field ${editor.version_field.name} has type ${editor.version_field.semantic_type.kind}; numeric or string is recommended`,
          }),
        );
      }
    }

    // DefaultValueKeysValid
    if (editor.default_values) {
      const fieldNames = new Set(editor.target_entity.fieldList.map((f) => f.name));
      for (const key of editor.default_values.keys()) {
        if (!fieldNames.has(key)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "editor:default-value-unknown-field",
              message: `Editor ${editor.name} default_values references unknown field ${key}`,
            }),
          );
        }
      }
    }

    // HookRegistrationValidation
    if (editor.hooks?.before_save) {
      if (!exprSet.has(editor.hooks.before_save)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:unregistered-hook",
            message: `Editor ${editor.name} before_save hook ${editor.hooks.before_save.name} is not registered`,
          }),
        );
      }
      if (editor.hooks.before_save.input_type.name !== editor.target_entity.name) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "editor:hook-input-mismatch",
            message: `Editor ${editor.name} before_save hook input type ${editor.hooks.before_save.input_type.name} does not match target entity`,
          }),
        );
      }
    }
    if (editor.hooks?.on_success) {
      if (!staticSet.has(editor.hooks.on_success)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:unregistered-hook",
            message: `Editor ${editor.name} on_success hook ${editor.hooks.on_success.name} is not registered`,
          }),
        );
      }
    }
    if (editor.hooks?.on_error) {
      if (!staticSet.has(editor.hooks.on_error)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:unregistered-hook",
            message: `Editor ${editor.name} on_error hook ${editor.hooks.on_error.name} is not registered`,
          }),
        );
      }
    }

    // NestedEditorRelationValid
    for (const ne of editor.nested) {
      const rel = ne.relation;
      const connected =
        rel.from_entity === editor.target_entity || rel.to_entity === editor.target_entity;
      if (!connected) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:nested-relation-mismatch",
            message: `Editor ${editor.name} nested editor via relation ${rel.name} does not connect to target entity`,
          }),
        );
      }
      if (
        ne.editor.target_entity !== rel.from_entity &&
        ne.editor.target_entity !== rel.to_entity
      ) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:nested-editor-entity-mismatch",
            message: `Nested editor ${ne.editor.name} targets ${ne.editor.target_entity.name} but relation ${rel.name} connects ${rel.from_entity.name} and ${rel.to_entity.name}`,
          }),
        );
      }
    }

    // NestedEditorCycles
    out.push(...checkNestedCycles(editor));

    // CommandHandlerValid
    for (const cmd of editor.commands) {
      if (typeof cmd.handler === "string") continue;
      if (!actionSet.has(cmd.handler)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:unregistered-command-action",
            message: `Editor ${editor.name} command ${cmd.name} uses unregistered action ${cmd.handler.name}`,
          }),
        );
      }
    }

    // DuplicateFieldOverride
    const seenFields = new Set<string>();
    for (const fo of editor.fields) {
      if (seenFields.has(fo.field.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:duplicate-field-override",
            message: `Editor ${editor.name} has duplicate override for field ${fo.field.name}`,
          }),
        );
      }
      seenFields.add(fo.field.name);
    }

    // DuplicateNestedRelation
    const seenRelations = new Set<string>();
    for (const ne of editor.nested) {
      if (seenRelations.has(ne.relation.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:duplicate-nested-relation",
            message: `Editor ${editor.name} has duplicate nested editor for relation ${ne.relation.name}`,
          }),
        );
      }
      seenRelations.add(ne.relation.name);
    }

    // DuplicateSectionName
    const seenSections = new Set<string>();
    for (const s of editor.sections) {
      if (seenSections.has(s.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "editor:duplicate-section",
            message: `Editor ${editor.name} has duplicate section ${s.name}`,
          }),
        );
      }
      seenSections.add(s.name);
    }
  }

  return out;
};
