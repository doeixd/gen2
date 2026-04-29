/* @__NO_SIDE_EFFECTS__ */
/**
 * List view IR. Table/grid surfaces for browsing, sorting, filtering, and
 * paginating entity collections.
 *
 * Each {@link ListColumn} declares how a field is rendered, whether it is
 * sortable, filterable, or searchable. Pagination can be offset-based or
 * cursor-based. Row and bulk actions wire back to {@link ActionFunction}s.
 *
 * @example
 * ```ts
 * const PostList = gen.list.define({
 *   name: "PostList",
 *   entity: Post,
 *   columns: [
 *     gen.list.column(Post.fields.title, { sortable: true, searchable: true }),
 *     gen.list.column(Post.fields.status, { filterable: true }),
 *     gen.list.column(Post.fields.published_at, { sortable: true }),
 *   ],
 *   pagination: gen.list.cursor({ cursor: Post.fields.id, defaultLimit: 50 }),
 *   rowActions: [gen.list.action("edit", updatePost), gen.list.action("delete", deletePost)],
 * });
 * ```
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";
import type { ActionFunction, QueryFunction } from "../function/index.ts";
import type { Component } from "../ui/index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How the list paginates results. */
export type PaginationKind = "offset" | "cursor" | "none";

/** Offset-based pagination configuration. */
export interface OffsetPagination {
  readonly kind: "offset";
  /** Default page size. */
  readonly defaultLimit: number;
  /** Maximum allowed page size. */
  readonly maxLimit?: number;
}

/** Cursor-based pagination configuration. */
export interface CursorPagination {
  readonly kind: "cursor";
  /** Field used as the pagination cursor (must be unique and orderable). */
  readonly cursorField: Field;
  /** Default page size. */
  readonly defaultLimit: number;
  /** Maximum allowed page size. */
  readonly maxLimit?: number;
}

/** Pagination configuration for a list view. */
export type ListPagination = OffsetPagination | CursorPagination | { readonly kind: "none" };

/** How a column is pinned in the table. */
export type ColumnPin = "left" | "right";

/** Filter type for a column. */
export type ColumnFilterType = "text" | "select" | "range" | "date" | "boolean";

/** A column in the list view, bound to an entity field. */
export interface ListColumn {
  /** The entity field to display. */
  readonly field: Field;
  /** Optional custom label (defaults to field name). */
  readonly label?: string;
  /** Whether the column can be sorted. */
  readonly sortable: boolean;
  /** Whether the column can be filtered. */
  readonly filterable: boolean;
  /** The filter UI type for this column. */
  readonly filter_type?: ColumnFilterType;
  /** Whether the column participates in full-text search. */
  readonly searchable: boolean;
  /** Whether the column is hidden by default. */
  readonly hidden: boolean;
  /** Optional custom component for rendering this cell. */
  readonly display_component?: Component<unknown, unknown>;
  /** Optional custom component for the column header. */
  readonly header_component?: Component<unknown, unknown>;
  /** Suggested column width in pixels or CSS length. */
  readonly size?: number | string;
  /** Minimum column width (for resizable columns). */
  readonly minSize?: number;
  /** Maximum column width (for resizable columns). */
  readonly maxSize?: number;
  /** Pin this column to the left or right edge. */
  readonly pin?: ColumnPin;
  /** Whether the user can resize this column. */
  readonly enableResizing?: boolean;
  /** Whether the user can hide this column via visibility toggles. */
  readonly enableHiding?: boolean;
  /** Whether the user can reorder this column via drag. */
  readonly enableReordering?: boolean;
  /** Extra metadata passed through to the generated table column. */
  readonly meta?: Record<string, unknown>;
}

/** A row-level action exposed in the list view. */
export interface ListAction<Out = unknown> {
  readonly name: string;
  readonly label: string;
  /** The action function to invoke. */
  readonly handler: ActionFunction<unknown, Out>;
  /** When true, the action opens in a modal rather than navigating. */
  readonly inline: boolean;
}

/** A bulk action that operates on selected rows. */
export interface ListBulkAction<Out = unknown> {
  readonly name: string;
  readonly label: string;
  readonly handler: ActionFunction<unknown, Out>;
}

/** Density preset for row height. */
export type ListDensity = "compact" | "normal" | "comfortable";

/** Row selection behavior. */
export type RowSelectionMode = "none" | "single" | "multi";

/**
 * A list view for browsing, sorting, filtering, and paginating entity records.
 *
 * @typeParam Out - The projection / return type of list rows.
 */
export interface List<Out = unknown> {
  readonly name: string;
  readonly entity: Entity;
  /** Columns to display. */
  readonly columns: readonly ListColumn[];
  /** Pagination strategy. */
  readonly pagination: ListPagination;
  /** Row-level actions. */
  readonly rowActions: readonly ListAction<Out>[];
  /** Bulk actions for selected rows. */
  readonly bulkActions: readonly ListBulkAction<Out>[];
  /** The underlying query that fetches the list data. */
  readonly query?: QueryFunction<unknown, Out>;
  /** Whether multi-select is enabled for bulk actions. */
  readonly multiSelect: boolean;
  /** Optional default sort column and direction. */
  readonly defaultSort?: { readonly field: Field; readonly direction: "asc" | "desc" };
  /** Whether the list supports exporting data. */
  readonly exportable: boolean;

  // --- TanStack Table / target-specific table features --------------------

  /** Whether row selection is enabled. */
  readonly rowSelection: RowSelectionMode;
  /** Whether column-level filtering UI is enabled. */
  readonly enableColumnFilters: boolean;
  /** Whether global/full-text search is enabled. */
  readonly enableGlobalFilter: boolean;
  /** Whether column sorting UI is enabled. */
  readonly enableSorting: boolean;
  /** Whether columns can be resized by the user. */
  readonly enableColumnResize: boolean;
  /** Whether columns can be reordered by drag. */
  readonly enableColumnReorder: boolean;
  /** Whether a column-visibility toggle UI is shown. */
  readonly enableColumnVisibilityToggle: boolean;
  /** Whether a density toggle UI is shown. */
  readonly enableDensityToggle: boolean;
  /** Whether a fullscreen toggle UI is shown. */
  readonly enableFullScreenToggle: boolean;
  /** Whether rows can be expanded for detail views. */
  readonly enableRowExpansion: boolean;
  /** Whether virtualization is used for large datasets. */
  readonly enableVirtualization: boolean;
  /** Whether the header row sticks on scroll. */
  readonly stickyHeader: boolean;
  /** Default density preset. */
  readonly density: ListDensity;
  /** Estimated total row count (for virtualization and pagination). */
  readonly rowCount?: number;
  /** Component or message shown when the list has zero rows. */
  readonly emptyState?: string | Component<unknown, unknown>;
  /** Component or message shown while the query is loading. */
  readonly loadingState?: string | Component<unknown, unknown>;
  /** Component or message shown when the query errors. */
  readonly errorState?: string | Component<unknown, unknown>;
  /** Initial visibility state for columns (hidden columns by name). */
  readonly initialColumnVisibility?: readonly string[];
  /** Initial column order (field names in desired order). */
  readonly initialColumnOrder?: readonly string[];
  /** Whether the table wraps in a card/chrome container. */
  readonly carded: boolean;
}

/** Input for {@link defineList}. */
export interface DefineListInput<Out = unknown> {
  readonly name: string;
  readonly entity: Entity;
  readonly columns: readonly ListColumn[];
  readonly pagination?: ListPagination;
  readonly rowActions?: readonly ListAction<Out>[];
  readonly bulkActions?: readonly ListBulkAction<Out>[];
  /** Underlying query function. */
  readonly query?: QueryFunction<unknown, Out>;
  readonly multiSelect?: boolean;
  readonly defaultSort?: { readonly field: Field; readonly direction: "asc" | "desc" };
  readonly exportable?: boolean;

  // TanStack / table features
  readonly rowSelection?: RowSelectionMode;
  readonly enableColumnFilters?: boolean;
  readonly enableGlobalFilter?: boolean;
  readonly enableSorting?: boolean;
  readonly enableColumnResize?: boolean;
  readonly enableColumnReorder?: boolean;
  readonly enableColumnVisibilityToggle?: boolean;
  readonly enableDensityToggle?: boolean;
  readonly enableFullScreenToggle?: boolean;
  readonly enableRowExpansion?: boolean;
  readonly enableVirtualization?: boolean;
  readonly stickyHeader?: boolean;
  readonly density?: ListDensity;
  readonly rowCount?: number;
  readonly emptyState?: string | Component<unknown, unknown>;
  readonly loadingState?: string | Component<unknown, unknown>;
  readonly errorState?: string | Component<unknown, unknown>;
  readonly initialColumnVisibility?: readonly string[];
  readonly initialColumnOrder?: readonly string[];
  readonly carded?: boolean;
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

/**
 * Creates a {@link ListColumn} for a given field.
 *
 * @param field - The entity field to display.
 * @param options - Column options (sortable, filterable, searchable, etc.).
 * @returns A ListColumn record.
 *
 * @example
 * ```ts
 * const col = listColumn(Post.fields.title, { sortable: true, searchable: true });
 * ```
 */
export const listColumn = (
  field: Field,
  options?: {
    readonly label?: string;
    readonly sortable?: boolean;
    readonly filterable?: boolean;
    readonly filter_type?: ColumnFilterType;
    readonly searchable?: boolean;
    readonly hidden?: boolean;
    readonly display_component?: Component<unknown, unknown>;
    readonly header_component?: Component<unknown, unknown>;
    readonly size?: number | string;
    readonly minSize?: number;
    readonly maxSize?: number;
    readonly pin?: ColumnPin;
    readonly enableResizing?: boolean;
    readonly enableHiding?: boolean;
    readonly enableReordering?: boolean;
    readonly meta?: Record<string, unknown>;
  },
): ListColumn => ({
  field,
  label: options?.label ?? field.name,
  sortable: options?.sortable ?? false,
  filterable: options?.filterable ?? false,
  filter_type: options?.filter_type,
  searchable: options?.searchable ?? false,
  hidden: options?.hidden ?? false,
  display_component: options?.display_component,
  header_component: options?.header_component,
  size: options?.size,
  minSize: options?.minSize,
  maxSize: options?.maxSize,
  pin: options?.pin,
  enableResizing: options?.enableResizing,
  enableHiding: options?.enableHiding,
  enableReordering: options?.enableReordering,
  meta: options?.meta,
});

/**
 * Creates an offset-based pagination configuration.
 *
 * @param defaultLimit - Default page size.
 * @param maxLimit - Maximum allowed page size.
 * @returns An OffsetPagination record.
 */
export const offsetPagination = (defaultLimit: number, maxLimit?: number): OffsetPagination => ({
  kind: "offset",
  defaultLimit,
  maxLimit,
});

/**
 * Creates a cursor-based pagination configuration.
 *
 * @param cursorField - Field used as the cursor (must be unique and orderable).
 * @param defaultLimit - Default page size.
 * @param maxLimit - Maximum allowed page size.
 * @returns A CursorPagination record.
 */
export const cursorPagination = (
  cursorField: Field,
  defaultLimit: number,
  maxLimit?: number,
): CursorPagination => ({
  kind: "cursor",
  cursorField,
  defaultLimit,
  maxLimit,
});

/**
 * Creates a {@link ListAction} for a row-level operation.
 *
 * @param name - Action name.
 * @param label - Human-readable label.
 * @param handler - The action function to invoke.
 * @param options - Optional settings (inline defaults to false).
 * @returns A ListAction record.
 */
export const listAction = <Out = unknown>(
  name: string,
  label: string,
  handler: ActionFunction<unknown, Out>,
  options?: { readonly inline?: boolean },
): ListAction<Out> => ({
  name,
  label,
  handler,
  inline: options?.inline ?? false,
});

/**
 * Creates a {@link ListBulkAction} for operating on selected rows.
 *
 * @param name - Action name.
 * @param label - Human-readable label.
 * @param handler - The action function to invoke.
 * @returns A ListBulkAction record.
 */
export const listBulkAction = <Out = unknown>(
  name: string,
  label: string,
  handler: ActionFunction<unknown, Out>,
): ListBulkAction<Out> => ({
  name,
  label,
  handler,
});

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Creates a {@link List} record from structured input.
 *
 * @typeParam Out - The projection / return type of list rows.
 * @param input - List definition input.
 * @returns A List record.
 *
 * @example
 * ```ts
 * const PostList = defineList({
 *   name: "PostList",
 *   entity: Post,
 *   columns: [listColumn(Post.fields.title, { sortable: true })],
 *   pagination: offsetPagination(50),
 * });
 * ```
 */
export const defineList = <Out = unknown>(input: DefineListInput<Out>): List<Out> => ({
  name: input.name,
  entity: input.entity,
  columns: input.columns,
  pagination: input.pagination ?? { kind: "none" },
  rowActions: input.rowActions ?? [],
  bulkActions: input.bulkActions ?? [],
  query: input.query,
  multiSelect: input.multiSelect ?? false,
  defaultSort: input.defaultSort,
  exportable: input.exportable ?? false,
  rowSelection: input.rowSelection ?? "none",
  enableColumnFilters: input.enableColumnFilters ?? false,
  enableGlobalFilter: input.enableGlobalFilter ?? false,
  enableSorting: input.enableSorting ?? true,
  enableColumnResize: input.enableColumnResize ?? false,
  enableColumnReorder: input.enableColumnReorder ?? false,
  enableColumnVisibilityToggle: input.enableColumnVisibilityToggle ?? false,
  enableDensityToggle: input.enableDensityToggle ?? false,
  enableFullScreenToggle: input.enableFullScreenToggle ?? false,
  enableRowExpansion: input.enableRowExpansion ?? false,
  enableVirtualization: input.enableVirtualization ?? false,
  stickyHeader: input.stickyHeader ?? false,
  density: input.density ?? "normal",
  rowCount: input.rowCount,
  emptyState: input.emptyState,
  loadingState: input.loadingState,
  errorState: input.errorState,
  initialColumnVisibility: input.initialColumnVisibility,
  initialColumnOrder: input.initialColumnOrder,
  carded: input.carded ?? true,
});

// ---------------------------------------------------------------------------
// Auto-list (derive from CRUD)
// ---------------------------------------------------------------------------

/**
 * Derives a {@link List} from an entity and its CRUD bundle.
 *
 * All writable fields become columns. The CRUD's `list` query is used.
 * Row actions are wired from `update` and `delete` if present.
 *
 * @typeParam Out - The projection / return type.
 * @param entity - The target entity.
 * @param crud - A {@link Crud} bundle (usually from `gen.crud.derive`).
 * @param options - Optional overrides for pagination, multi-select, etc.
 * @returns A List record.
 *
 * @example
 * ```ts
 * const userCrud = gen.crud.derive(User);
 * const UserList = gen.list.auto(User, userCrud);
 * ```
 */
export const autoList = <Out = unknown>(
  entity: Entity,
  crud: {
    readonly list: QueryFunction<unknown, Out>;
    readonly update?: ActionFunction<unknown, Out>;
    readonly delete?: ActionFunction<unknown, Out>;
  },
  options?: {
    readonly name?: string;
    readonly pagination?: ListPagination;
    readonly multiSelect?: boolean;
    readonly exportable?: boolean;
    readonly defaultSort?: { readonly field: Field; readonly direction: "asc" | "desc" };
    readonly rowSelection?: RowSelectionMode;
    readonly enableColumnFilters?: boolean;
    readonly enableGlobalFilter?: boolean;
    readonly enableSorting?: boolean;
    readonly enableColumnResize?: boolean;
    readonly enableColumnReorder?: boolean;
    readonly enableColumnVisibilityToggle?: boolean;
    readonly enableDensityToggle?: boolean;
    readonly enableFullScreenToggle?: boolean;
    readonly enableRowExpansion?: boolean;
    readonly enableVirtualization?: boolean;
    readonly stickyHeader?: boolean;
    readonly density?: ListDensity;
    readonly carded?: boolean;
  },
): List<Out> => {
  const inferFilterType = (field: Field): ColumnFilterType | undefined => {
    const kind = field.semantic_type.kind;
    if (kind === "boolean") return "boolean";
    if (kind === "enum") return "select";
    if (kind === "numeric") return "range";
    if (kind === "date" || kind === "datetime" || kind === "timestamp") return "date";
    if (kind === "string" || kind === "email" || kind === "url") return "text";
    return undefined;
  };

  const columns: ListColumn[] = entity.fieldList.map((field) =>
    listColumn(field, {
      sortable: !field.read_only,
      filterable:
        field.semantic_type.kind === "enum" ||
        field.semantic_type.kind === "boolean" ||
        field.semantic_type.kind === "string",
      filter_type: inferFilterType(field),
      searchable: field.semantic_type.kind === "string",
      hidden: field.read_only,
      enableResizing: !field.read_only,
      enableHiding: true,
    }),
  );

  const rowActions: ListAction<Out>[] = [];
  if (crud.update) {
    rowActions.push(listAction("edit", "Edit", crud.update, { inline: true }));
  }
  if (crud.delete) {
    rowActions.push(listAction("delete", "Delete", crud.delete));
  }

  return defineList<Out>({
    name: options?.name ?? `${entity.name}List`,
    entity,
    columns,
    pagination: options?.pagination ?? offsetPagination(50, 500),
    query: crud.list,
    rowActions,
    multiSelect: options?.multiSelect ?? false,
    exportable: options?.exportable ?? false,
    defaultSort: options?.defaultSort,
    rowSelection: options?.rowSelection ?? "none",
    enableColumnFilters: options?.enableColumnFilters ?? true,
    enableGlobalFilter: options?.enableGlobalFilter ?? true,
    enableSorting: options?.enableSorting ?? true,
    enableColumnResize: options?.enableColumnResize ?? true,
    enableColumnReorder: options?.enableColumnReorder ?? false,
    enableColumnVisibilityToggle: options?.enableColumnVisibilityToggle ?? true,
    enableDensityToggle: options?.enableDensityToggle ?? false,
    enableFullScreenToggle: options?.enableFullScreenToggle ?? false,
    enableRowExpansion: options?.enableRowExpansion ?? false,
    enableVirtualization: options?.enableVirtualization ?? false,
    stickyHeader: options?.stickyHeader ?? true,
    density: options?.density ?? "normal",
    carded: options?.carded ?? true,
  });
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Checks list view invariants: entity registration, column field membership,
 * sortable/searchable field type compatibility, and query compatibility.
 *
 * @param lists - Lists to validate.
 * @param entities - All registered entities.
 * @param query_functions - All registered query functions.
 * @param action_functions - All registered action functions.
 * @returns Diagnostics for any violated list rules.
 */
export const checkList = (
  lists: readonly List<unknown>[],
  entities: readonly Entity[],
  query_functions: readonly QueryFunction[],
  action_functions: readonly ActionFunction[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const entityNames = new Set(entities.map((e) => e.name));
  const queryNames = new Set(query_functions.map((q) => q.name));
  const actionNames = new Set(action_functions.map((a) => a.name));

  for (const list of lists) {
    // Entity must be registered
    if (!entityNames.has(list.entity.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "list:entity-unregistered",
          message: `List ${list.name} targets unregistered entity: ${list.entity.name}`,
        }),
      );
    }

    // All columns must reference fields from the target entity
    const entityFields = new Set(list.entity.fieldList);
    for (const col of list.columns) {
      if (!entityFields.has(col.field)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "list:column-field-not-in-entity",
            message: `List ${list.name} column ${col.field.name} is not a field of ${list.entity.name}`,
            refs: [col.field.ref],
          }),
        );
      }

      // Sortable columns should have orderable types
      if (col.sortable) {
        const kind = col.field.semantic_type.kind;
        if (
          kind !== "string" &&
          kind !== "numeric" &&
          kind !== "timestamp" &&
          kind !== "datetime" &&
          kind !== "date"
        ) {
          out.push(
            diagnostic({
              severity: "warning",
              code: "list:sortable-type-may-not-be-orderable",
              message: `List ${list.name} column ${col.field.name} is marked sortable but type ${kind} may not support ordering`,
              refs: [col.field.ref],
            }),
          );
        }
      }

      // Searchable columns should be string-like
      if (col.searchable) {
        const kind = col.field.semantic_type.kind;
        if (kind !== "string" && kind !== "email" && kind !== "url" && kind !== "phone") {
          out.push(
            diagnostic({
              severity: "warning",
              code: "list:searchable-type-not-text",
              message: `List ${list.name} column ${col.field.name} is marked searchable but type ${kind} is not text-like`,
              refs: [col.field.ref],
            }),
          );
        }
      }
    }

    // Default sort field must be in columns
    if (list.defaultSort) {
      const columnFields = new Set(list.columns.map((c) => c.field.name));
      if (!columnFields.has(list.defaultSort.field.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "list:default-sort-not-in-columns",
            message: `List ${list.name} default sort field ${list.defaultSort.field.name} is not in columns`,
            refs: [list.defaultSort.field.ref],
          }),
        );
      }
    }

    // Query must be registered if provided
    if (list.query && !queryNames.has(list.query.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "list:query-unregistered",
          message: `List ${list.name} uses unregistered query: ${list.query.name}`,
        }),
      );
    }

    // Row action handlers must be registered
    for (const action of list.rowActions) {
      if (!actionNames.has(action.handler.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "list:row-action-unregistered",
            message: `List ${list.name} row action ${action.name} uses unregistered handler: ${action.handler.name}`,
          }),
        );
      }
    }

    // Bulk action handlers must be registered
    for (const action of list.bulkActions) {
      if (!actionNames.has(action.handler.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "list:bulk-action-unregistered",
            message: `List ${list.name} bulk action ${action.name} uses unregistered handler: ${action.handler.name}`,
          }),
        );
      }
    }

    // Cursor pagination field must belong to entity and be unique
    if (list.pagination.kind === "cursor") {
      const cursorField = list.pagination.cursorField;
      if (!entityFields.has(cursorField)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "list:cursor-field-not-in-entity",
            message: `List ${list.name} cursor field ${cursorField.name} is not a field of ${list.entity.name}`,
            refs: [cursorField.ref],
          }),
        );
      }
    }
  }

  return out;
};
