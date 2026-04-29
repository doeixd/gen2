/* @__NO_SIDE_EFFECTS__ */
/**
 * Admin shell IR. A top-level administration interface that composes
 * {@link List} views and {@link Editor} surfaces into navigable pages.
 *
 * Pages can be auto-derived from entity CRUD bundles or manually configured.
 * The navigation structure drives sidebar / top-bar generation in targets.
 *
 * @example
 * ```ts
 * const Admin = gen.admin.define({
 *   name: "ContentAdmin",
 *   title: "Content Admin",
 *   pages: [
 *     gen.admin.page.list("Posts", postList),
 *     gen.admin.page.editor("Edit Post", postEditor),
 *   ],
 *   navigation: "sidebar",
 * });
 * ```
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Entity } from "../entity/index.ts";
import type { Editor } from "../editor/index.ts";
import type { List } from "../list/index.ts";
import type { Crud } from "../crud/index.ts";
import { autoList } from "../list/index.ts";
import { autoEditor } from "../editor/index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Where the primary navigation chrome is placed. */
export type AdminNavigation = "sidebar" | "topbar" | "hidden";

/** The kind of page in the admin shell. */
export type AdminPageKind = "dashboard" | "list" | "editor" | "custom";

/** Layout mode for a route. */
export type AdminLayout = "default" | "modal" | "drawer" | "fullscreen";

/** A single page within the admin shell. */
export interface AdminPage {
  readonly name: string;
  readonly label: string;
  readonly kind: AdminPageKind;
  /** Icon name or emoji for the navigation link. */
  readonly icon?: string;
  /** The list view (when kind is "list"). */
  readonly list?: List;
  /** The editor surface (when kind is "editor"). */
  readonly editor?: Editor;
  /** Route path segment (defaults to kebab-case name). */
  readonly path?: string;
  /** Whether this page is the default landing page. */
  readonly default: boolean;
}

/** A route in the admin router, supporting nesting and layout modes. */
export interface AdminRoute {
  readonly path: string;
  readonly page: AdminPage;
  /** Optional layout mode for this route. */
  readonly layout?: AdminLayout;
  /** Optional child routes (e.g., detail drawers). */
  readonly children?: readonly AdminRoute[];
}

/**
 * A top-level administration interface.
 *
 * @example
 * ```ts
 * const admin = defineAdmin({
 *   name: "AppAdmin",
 *   title: "App Admin",
 *   pages: [...],
 *   navigation: "sidebar",
 * });
 * ```
 */
export interface Admin {
  readonly name: string;
  readonly title: string;
  readonly pages: readonly AdminPage[];
  readonly routes: readonly AdminRoute[];
  readonly navigation: AdminNavigation;
  /** Optional authentication policy for the entire admin shell. */
  readonly auth_required?: boolean;
  /** Optional custom header component. */
  readonly header_component?: string;
}

/** Input for {@link defineAdmin}. */
export interface DefineAdminInput {
  readonly name: string;
  readonly title?: string;
  readonly pages?: readonly AdminPage[];
  readonly routes?: readonly AdminRoute[];
  readonly navigation?: AdminNavigation;
  readonly auth_required?: boolean;
  readonly header_component?: string;
}

// ---------------------------------------------------------------------------
// Page constructors
// ---------------------------------------------------------------------------

/**
 * Creates a list-view {@link AdminPage}.
 *
 * @param label - Human-readable page label.
 * @param list - The {@link List} to display.
 * @param options - Optional icon, path, and default flag.
 * @returns An AdminPage record.
 */
export const adminListPage = (
  label: string,
  list: List,
  options?: {
    readonly icon?: string;
    readonly path?: string;
    readonly default?: boolean;
  },
): AdminPage => ({
  name: list.name,
  label,
  kind: "list",
  list,
  icon: options?.icon,
  path: options?.path ?? `/${toKebabCase(list.entity.name)}`,
  default: options?.default ?? false,
});

/**
 * Creates an editor {@link AdminPage}.
 *
 * @param label - Human-readable page label.
 * @param editor - The {@link Editor} to display.
 * @param options - Optional icon, path, and default flag.
 * @returns An AdminPage record.
 */
export const adminEditorPage = (
  label: string,
  editor: Editor,
  options?: {
    readonly icon?: string;
    readonly path?: string;
    readonly default?: boolean;
  },
): AdminPage => ({
  name: editor.name,
  label,
  kind: "editor",
  editor,
  icon: options?.icon,
  path: options?.path ?? `/${toKebabCase(editor.target_entity.name)}/edit`,
  default: options?.default ?? false,
});

/**
 * Creates a dashboard {@link AdminPage}.
 *
 * @param label - Human-readable page label.
 * @param options - Optional icon, path, and default flag.
 * @returns An AdminPage record.
 */
export const adminDashboardPage = (
  label: string,
  options?: {
    readonly icon?: string;
    readonly path?: string;
    readonly default?: boolean;
  },
): AdminPage => ({
  name: "dashboard",
  label,
  kind: "dashboard",
  icon: options?.icon,
  path: options?.path ?? "/",
  default: options?.default ?? true,
});

/**
 * Creates an {@link AdminRoute} record.
 *
 * @param path - Route path (e.g., "/posts/:id").
 * @param page - The {@link AdminPage} to render.
 * @param options - Optional layout and child routes.
 * @returns An AdminRoute record.
 */
export const adminRoute = (
  path: string,
  page: AdminPage,
  options?: {
    readonly layout?: AdminLayout;
    readonly children?: readonly AdminRoute[];
  },
): AdminRoute => ({
  path,
  page,
  layout: options?.layout,
  children: options?.children,
});

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Creates an {@link Admin} record from structured input.
 *
 * Derives flat routes from pages when routes are not explicitly provided.
 *
 * @param input - Admin definition input.
 * @returns An Admin record.
 */
export const defineAdmin = (input: DefineAdminInput): Admin => {
  const pages = input.pages ?? [];
  const routes =
    input.routes ??
    pages.map((p) => ({
      path: p.path ?? `/${toKebabCase(p.name)}`,
      page: p,
    }));

  return {
    name: input.name,
    title: input.title ?? input.name,
    pages,
    routes,
    navigation: input.navigation ?? "sidebar",
    auth_required: input.auth_required ?? true,
    header_component: input.header_component,
  };
};

// ---------------------------------------------------------------------------
// Auto-admin (derive from entities + CRUD)
// ---------------------------------------------------------------------------

/**
 * Derives an {@link Admin} shell from a list of entities and their CRUD bundles.
 *
 * For each entity, auto-generates:
 * - A list page (`${entity}List`)
 * - An editor page (`${entity}Editor`)
 *
 * @param name - Admin name.
 * @param title - Admin title (defaults to name).
 * @param entities - Entities to include.
 * @param cruds - CRUD bundles for the entities (in matching order).
 * @param options - Optional overrides for navigation, auth, etc.
 * @returns An Admin record.
 *
 * @example
 * ```ts
 * const Admin = gen.admin.auto("ContentAdmin", "Content Admin", [Post, User], [postCrud, userCrud]);
 * ```
 */
export const autoAdmin = (
  name: string,
  title: string,
  entities: readonly Entity[],
  cruds: readonly Crud[],
  options?: {
    readonly navigation?: AdminNavigation;
    readonly auth_required?: boolean;
    readonly includeEditors?: boolean;
  },
): Admin => {
  const pages: AdminPage[] = [adminDashboardPage("Dashboard")];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]!;
    const crud = cruds[i];

    if (crud) {
      const list = autoList(entity, crud);
      pages.push(adminListPage(entity.name, list, { icon: "list" }));

      if (options?.includeEditors !== false) {
        const editor = autoEditor(entity, crud);
        pages.push(adminEditorPage(`Edit ${entity.name}`, editor, { icon: "edit" }));
      }
    }
  }

  return defineAdmin({
    name,
    title,
    pages,
    navigation: options?.navigation ?? "sidebar",
    auth_required: options?.auth_required ?? true,
  });
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Checks admin shell invariants: page uniqueness, entity registration,
 * and list/editor cross-references.
 *
 * @param admins - Admin shells to validate.
 * @param entities - All registered entities.
 * @param lists - All registered lists.
 * @param editors - All registered editors.
 * @returns Diagnostics for any violated admin rules.
 */
export const checkAdmin = (
  admins: readonly Admin[],
  entities: readonly Entity[],
  lists: readonly List[],
  editors: readonly Editor[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const entityNames = new Set(entities.map((e) => e.name));
  const listNames = new Set(lists.map((l) => l.name));
  const editorNames = new Set(editors.map((e) => e.name));

  for (const admin of admins) {
    // Check for duplicate page names
    const pageNames = new Map<string, number>();
    for (const page of admin.pages) {
      pageNames.set(page.name, (pageNames.get(page.name) ?? 0) + 1);
    }
    for (const [name, count] of pageNames) {
      if (count > 1) {
        out.push(
          diagnostic({
            severity: "error",
            code: "admin:duplicate-page-name",
            message: `Admin ${admin.name} has duplicate page name: ${name}`,
          }),
        );
      }
    }

    // Check for duplicate default pages
    const defaults = admin.pages.filter((p) => p.default);
    if (defaults.length > 1) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "admin:multiple-default-pages",
          message: `Admin ${admin.name} has ${defaults.length} default pages; only one should be default`,
        }),
      );
    }

    for (const page of admin.pages) {
      if (page.kind === "list" && page.list) {
        if (!listNames.has(page.list.name)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "admin:list-page-unregistered",
              message: `Admin ${admin.name} page ${page.name} references unregistered list: ${page.list.name}`,
            }),
          );
        }
        if (!entityNames.has(page.list.entity.name)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "admin:list-entity-unregistered",
              message: `Admin ${admin.name} page ${page.name} references list with unregistered entity: ${page.list.entity.name}`,
            }),
          );
        }
      }

      if (page.kind === "editor" && page.editor) {
        if (!editorNames.has(page.editor.name)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "admin:editor-page-unregistered",
              message: `Admin ${admin.name} page ${page.name} references unregistered editor: ${page.editor.name}`,
            }),
          );
        }
        if (!entityNames.has(page.editor.target_entity.name)) {
          out.push(
            diagnostic({
              severity: "error",
              code: "admin:editor-entity-unregistered",
              message: `Admin ${admin.name} page ${page.name} references editor with unregistered entity: ${page.editor.target_entity.name}`,
            }),
          );
        }
      }
    }

    // Route validation
    const collectPaths = (routes: readonly AdminRoute[], prefix = ""): string[] => {
      const paths: string[] = [];
      for (const route of routes) {
        const fullPath = prefix + route.path;
        paths.push(fullPath);
        if (route.children) {
          paths.push(...collectPaths(route.children, fullPath));
        }
      }
      return paths;
    };

    const allPaths = collectPaths(admin.routes);
    const seenPaths = new Map<string, number>();
    for (const path of allPaths) {
      seenPaths.set(path, (seenPaths.get(path) ?? 0) + 1);
    }
    for (const [path, count] of seenPaths) {
      if (count > 1) {
        out.push(
          diagnostic({
            severity: "error",
            code: "admin:duplicate-route-path",
            message: `Admin ${admin.name} has duplicate route path: ${path}`,
          }),
        );
      }
    }
  }

  return out;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converts a PascalCase string to kebab-case. */
const toKebabCase = (str: string): string =>
  str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
