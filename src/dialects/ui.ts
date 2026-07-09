/* @__NO_SIDE_EFFECTS__ */
/**
 * UI dialect — R9 dialect for views, forms, editors, lists, CRUD, components,
 * and controls.
 *
 * Forms, editors, lists, and CRUD become UI dialect nodes/edges. CRUD is
 * generated from operation availability: entity owns fields, fields have types,
 * types support operations, operations have traits, policies guard operations,
 * storage target can lower operations.
 *
 * See docs/revision/revised_phases.md §R9.
 */

import { defineDialect, dialectId } from "../kernel/dialect.ts";
import { defineNodeKind, defineEdgeKind, defineEndpointRole } from "../kernel/ods.ts";
import { defineTrait } from "../kernel/symbol.ts";
import { FIELD_NODE_KIND } from "./domain/entity-field-relation.ts";
import { ACTION_NODE_KIND, QUERY_NODE_KIND } from "./callable.ts";
import { RULE_NODE_KIND, PREDICATE_NODE_KIND } from "./core/expr-rule.ts";

// === UI traits ==============================================================

export const uiTraits = {
  /** Element can receive user input (not display-only). */
  INTERACTIVE: defineTrait<true>("trait.ui.interactive", "Interactive", "node"),
  /** Element is display-only; no editing permitted. */
  READONLY: defineTrait<true>("trait.ui.readonly", "Read-only", "node"),
  /** Element supports pagination. */
  PAGINATED: defineTrait<true>("trait.ui.paginated", "Paginated", "node"),
  /** Element supports sorting. */
  SORTABLE: defineTrait<true>("trait.ui.sortable", "Sortable", "node"),
  /** Element supports filtering. */
  FILTERABLE: defineTrait<true>("trait.ui.filterable", "Filterable", "node"),
  /** Element supports full-text search. */
  SEARCHABLE: defineTrait<true>("trait.ui.searchable", "Searchable", "node"),
  /** Element opens in a modal overlay. */
  MODAL: defineTrait<true>("trait.ui.modal", "Modal", "node"),
  /** Element renders inline (not in a modal or separate page). */
  INLINE: defineTrait<true>("trait.ui.inline", "Inline", "node"),
  /** Element is client-only; has no direct server interaction. */
  CLIENT_ONLY: defineTrait<true>("trait.ui.clientOnly", "Client-only", "node"),
  /** Element is generated / derived from an entity (auto-CRUD, auto-list, etc). */
  DERIVED: defineTrait<true>("trait.ui.derived", "Derived from entity", "node"),
  /** Element supports row/bulk selection. */
  SELECTABLE: defineTrait<true>("trait.ui.selectable", "Selectable", "node"),
  /** Element supports virtualization for large datasets. */
  VIRTUALIZED: defineTrait<true>("trait.ui.virtualized", "Virtualized", "node"),
} as const;

// === Node kinds =============================================================

export const ENTITY_VIEW_NODE_KIND = defineNodeKind({
  id: "node.kind.entityView",
  dialect: "dialect.ui",
  traits: [uiTraits.READONLY, uiTraits.CLIENT_ONLY, uiTraits.DERIVED],
  metadata: { title: "Entity view" },
});

export const FORM_NODE_KIND = defineNodeKind({
  id: "node.kind.form",
  dialect: "dialect.ui",
  traits: [uiTraits.INTERACTIVE, uiTraits.MODAL, uiTraits.INLINE, uiTraits.DERIVED],
  metadata: { title: "Form" },
});

export const EDITOR_NODE_KIND = defineNodeKind({
  id: "node.kind.editor",
  dialect: "dialect.ui",
  traits: [uiTraits.INTERACTIVE, uiTraits.MODAL, uiTraits.INLINE, uiTraits.DERIVED],
  metadata: { title: "Editor" },
});

export const LIST_NODE_KIND = defineNodeKind({
  id: "node.kind.list",
  dialect: "dialect.ui",
  traits: [
    uiTraits.READONLY,
    uiTraits.PAGINATED,
    uiTraits.SORTABLE,
    uiTraits.FILTERABLE,
    uiTraits.SEARCHABLE,
    uiTraits.SELECTABLE,
    uiTraits.VIRTUALIZED,
    uiTraits.DERIVED,
  ],
  metadata: { title: "List" },
});

export const CRUD_NODE_KIND = defineNodeKind({
  id: "node.kind.crud",
  dialect: "dialect.ui",
  traits: [uiTraits.INTERACTIVE, uiTraits.DERIVED],
  metadata: { title: "CRUD" },
});

export const COMPONENT_NODE_KIND = defineNodeKind({
  id: "node.kind.component",
  dialect: "dialect.ui",
  traits: [uiTraits.CLIENT_ONLY],
  metadata: { title: "Component" },
});

export const APP_ROUTE_NODE_KIND = defineNodeKind({
  id: "node.kind.appRoute",
  dialect: "dialect.ui",
  traits: [uiTraits.CLIENT_ONLY],
  metadata: { title: "App route" },
});

export const CONTROL_NODE_KIND = defineNodeKind({
  id: "node.kind.control",
  dialect: "dialect.ui",
  traits: [uiTraits.INTERACTIVE, uiTraits.CLIENT_ONLY],
  metadata: { title: "Control" },
});

// === Edge kinds =============================================================

/** View displays field edge: view/list → field it displays. */
export const VIEW_DISPLAYS_FIELD_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.viewDisplaysField",
  dialect: "dialect.ui",
  endpoints: [
    defineEndpointRole("view", {
      targetKinds: [ENTITY_VIEW_NODE_KIND, LIST_NODE_KIND, COMPONENT_NODE_KIND],
    }),
    defineEndpointRole("field", { targetKinds: [FIELD_NODE_KIND] }),
  ],
  metadata: { title: "View displays field" },
});

/** View edits field edge: form/editor → field it allows editing. */
export const VIEW_EDITS_FIELD_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.viewEditsField",
  dialect: "dialect.ui",
  endpoints: [
    defineEndpointRole("view", {
      targetKinds: [FORM_NODE_KIND, EDITOR_NODE_KIND, CONTROL_NODE_KIND],
    }),
    defineEndpointRole("field", { targetKinds: [FIELD_NODE_KIND] }),
  ],
  metadata: { title: "View edits field" },
});

/** View submits action edge: form → action it submits to. */
export const VIEW_SUBMITS_ACTION_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.viewSubmitsAction",
  dialect: "dialect.ui",
  endpoints: [
    defineEndpointRole("view", { targetKinds: [FORM_NODE_KIND, EDITOR_NODE_KIND] }),
    defineEndpointRole("action", { targetKinds: [ACTION_NODE_KIND] }),
  ],
  metadata: { title: "View submits action" },
});

/** View uses query edge: list/view → query that provides its data. */
export const VIEW_USES_QUERY_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.viewUsesQuery",
  dialect: "dialect.ui",
  endpoints: [
    defineEndpointRole("view", {
      targetKinds: [LIST_NODE_KIND, ENTITY_VIEW_NODE_KIND, COMPONENT_NODE_KIND],
    }),
    defineEndpointRole("query", { targetKinds: [QUERY_NODE_KIND] }),
  ],
  metadata: { title: "View uses query" },
});

/** View enabled when rule edge: view → rule that must hold for it to be enabled. */
export const VIEW_ENABLED_WHEN_RULE_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.viewEnabledWhenRule",
  dialect: "dialect.ui",
  endpoints: [
    defineEndpointRole("view", {
      targetKinds: [
        ENTITY_VIEW_NODE_KIND,
        FORM_NODE_KIND,
        EDITOR_NODE_KIND,
        LIST_NODE_KIND,
        COMPONENT_NODE_KIND,
        CONTROL_NODE_KIND,
      ],
    }),
    defineEndpointRole("rule", { targetKinds: [RULE_NODE_KIND, PREDICATE_NODE_KIND] }),
  ],
  metadata: { title: "View enabled when rule" },
});

/** View hidden when rule edge: view → rule that hides it when true. */
export const VIEW_HIDDEN_WHEN_RULE_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.viewHiddenWhenRule",
  dialect: "dialect.ui",
  endpoints: [
    defineEndpointRole("view", {
      targetKinds: [
        ENTITY_VIEW_NODE_KIND,
        FORM_NODE_KIND,
        EDITOR_NODE_KIND,
        LIST_NODE_KIND,
        COMPONENT_NODE_KIND,
        CONTROL_NODE_KIND,
      ],
    }),
    defineEndpointRole("rule", { targetKinds: [RULE_NODE_KIND, PREDICATE_NODE_KIND] }),
  ],
  metadata: { title: "View hidden when rule" },
});

/** View uses design system edge: view/component → design system/theme it uses. */
export const VIEW_USES_DESIGN_SYSTEM_EDGE_KIND = defineEdgeKind({
  id: "edge.kind.viewUsesDesignSystem",
  dialect: "dialect.ui",
  endpoints: [
    defineEndpointRole("view", {
      targetKinds: [
        ENTITY_VIEW_NODE_KIND,
        FORM_NODE_KIND,
        EDITOR_NODE_KIND,
        LIST_NODE_KIND,
        COMPONENT_NODE_KIND,
      ],
    }),
    defineEndpointRole("designSystem", {}),
  ],
  metadata: { title: "View uses design system" },
});

// === Dialect definition =====================================================

export const UIDialect = defineDialect({
  id: dialectId("dialect.ui"),
  namespace: "ui",
  label: "UI",
  nodeKinds: [
    ENTITY_VIEW_NODE_KIND,
    FORM_NODE_KIND,
    EDITOR_NODE_KIND,
    LIST_NODE_KIND,
    CRUD_NODE_KIND,
    COMPONENT_NODE_KIND,
    APP_ROUTE_NODE_KIND,
    CONTROL_NODE_KIND,
  ],
  edgeKinds: [
    VIEW_DISPLAYS_FIELD_EDGE_KIND,
    VIEW_EDITS_FIELD_EDGE_KIND,
    VIEW_SUBMITS_ACTION_EDGE_KIND,
    VIEW_USES_QUERY_EDGE_KIND,
    VIEW_ENABLED_WHEN_RULE_EDGE_KIND,
    VIEW_HIDDEN_WHEN_RULE_EDGE_KIND,
    VIEW_USES_DESIGN_SYSTEM_EDGE_KIND,
  ],
  traits: Object.values(uiTraits),
  passes: [],
  lowerings: [],
  metadata: {
    title: "UI Dialect",
    description:
      "Views, forms, editors, lists, CRUD, components, controls, and their field/action/query/rule edges.",
  },
});
