/* @__NO_SIDE_EFFECTS__ */
/**
 * Access surfaces — typed authorization surfaces for entities, fields, relations,
 * actions, queries, routes, forms, and UI components.
 *
 * Part of AUTHZ2+. See AUTHZ2_PLAN.md.
 */

import type { Entity, Field } from "../entity/index.ts";
import type { ActionFunction, QueryFunction } from "../function/index.ts";
import type { Relation } from "../relation/index.ts";
import type { AppRoute } from "../router/index.ts";
import type { Form, Component } from "../ui/index.ts";
import type { Policy } from "./authz.ts";

// --- AccessSurface branch types ---------------------------------------------

export interface EntityReadSurface<E extends Entity = Entity> {
  readonly kind: "entity.read";
  readonly entity: E;
}

export interface EntityCreateSurface<E extends Entity = Entity> {
  readonly kind: "entity.create";
  readonly entity: E;
}

export interface EntityUpdateSurface<E extends Entity = Entity> {
  readonly kind: "entity.update";
  readonly entity: E;
}

export interface EntityDeleteSurface<E extends Entity = Entity> {
  readonly kind: "entity.delete";
  readonly entity: E;
}

export interface FieldReadSurface<E extends Entity = Entity, F extends Field = Field> {
  readonly kind: "field.read";
  readonly entity: E;
  readonly field: F;
}

export interface FieldWriteSurface<E extends Entity = Entity, F extends Field = Field> {
  readonly kind: "field.write";
  readonly entity: E;
  readonly field: F;
}

export interface RelationReadSurface {
  readonly kind: "relation.read";
  readonly relation: Relation;
}

export interface RelationLinkSurface {
  readonly kind: "relation.link";
  readonly relation: Relation;
}

export interface RelationUnlinkSurface {
  readonly kind: "relation.unlink";
  readonly relation: Relation;
}

export interface ActionExecuteSurface {
  readonly kind: "action.execute";
  readonly action: ActionFunction;
}

export interface QueryFilterSurface {
  readonly kind: "query.filter";
  readonly query: QueryFunction;
}

export interface RouteEnterSurface {
  readonly kind: "route.enter";
  readonly route: AppRoute;
}

export interface FormSubmitSurface {
  readonly kind: "form.submit";
  readonly form: Form;
}

export interface UiHintSurface {
  readonly kind: "ui.hint";
  readonly component: Component;
}

// --- AccessSurface union ----------------------------------------------------

export type AccessSurface =
  | EntityReadSurface
  | EntityCreateSurface
  | EntityUpdateSurface
  | EntityDeleteSurface
  | FieldReadSurface
  | FieldWriteSurface
  | RelationReadSurface
  | RelationLinkSurface
  | RelationUnlinkSurface
  | ActionExecuteSurface
  | QueryFilterSurface
  | RouteEnterSurface
  | FormSubmitSurface
  | UiHintSurface;

// --- AccessSurfaceOf<E> — entity-scoped surfaces ----------------------------

export type AccessSurfaceOf<E extends Entity> =
  | EntityReadSurface<E>
  | EntityCreateSurface<E>
  | EntityUpdateSurface<E>
  | EntityDeleteSurface<E>
  | FieldReadSurface<E, Field>
  | FieldWriteSurface<E, Field>
  | RelationReadSurface
  | RelationLinkSurface
  | RelationUnlinkSurface
  | ActionExecuteSurface
  | QueryFilterSurface
  | RouteEnterSurface
  | FormSubmitSurface
  | UiHintSurface;

// --- DenyBehavior -----------------------------------------------------------

export type DenyBehavior =
  | "forbidden"
  | "not_found"
  | "omit"
  | "redact"
  | "mask"
  | "readonly"
  | "noop"
  | "explain"
  | "unauthorized";

// --- Placement --------------------------------------------------------------

export type PlacementKind =
  | "sql_where"
  | "rls"
  | "server_pre_query"
  | "server_integrated_query"
  | "server_post_filter"
  | "client_hint"
  | "materialized"
  | "external"
  | "none";

export interface Placement {
  readonly kind: PlacementKind;
  readonly authoritative: boolean;
  readonly exact: boolean;
}

// --- AccessSurfaceBinding ---------------------------------------------------

export interface AccessSurfaceBinding<S extends AccessSurface = AccessSurface> {
  readonly kind: "access_surface_binding";
  readonly surface: S;
  readonly policy: Policy;
  readonly deny: DenyBehavior;
  readonly placement?: Placement;
}

// --- AccessMatrix -----------------------------------------------------------

export interface AccessMatrixEntry {
  readonly entity: Entity;
  readonly surface: AccessSurface["kind"];
  readonly policyName: string;
  readonly placement?: PlacementKind;
  readonly deny: DenyBehavior;
}

export interface AccessMatrix {
  readonly kind: "access_matrix";
  readonly entries: readonly AccessMatrixEntry[];
}

// --- Constructors -----------------------------------------------------------

export const entityRead = <E extends Entity>(entity: E): EntityReadSurface<E> => ({
  kind: "entity.read",
  entity,
});

export const entityCreate = <E extends Entity>(entity: E): EntityCreateSurface<E> => ({
  kind: "entity.create",
  entity,
});

export const entityUpdate = <E extends Entity>(entity: E): EntityUpdateSurface<E> => ({
  kind: "entity.update",
  entity,
});

export const entityDelete = <E extends Entity>(entity: E): EntityDeleteSurface<E> => ({
  kind: "entity.delete",
  entity,
});

export const fieldRead = <E extends Entity, F extends Field>(
  entity: E,
  field: F,
): FieldReadSurface<E, F> => ({
  kind: "field.read",
  entity,
  field,
});

export const fieldWrite = <E extends Entity, F extends Field>(
  entity: E,
  field: F,
): FieldWriteSurface<E, F> => ({
  kind: "field.write",
  entity,
  field,
});

export const relationRead = (relation: Relation): RelationReadSurface => ({
  kind: "relation.read",
  relation,
});

export const relationLink = (relation: Relation): RelationLinkSurface => ({
  kind: "relation.link",
  relation,
});

export const relationUnlink = (relation: Relation): RelationUnlinkSurface => ({
  kind: "relation.unlink",
  relation,
});

export const actionExecute = (action: ActionFunction): ActionExecuteSurface => ({
  kind: "action.execute",
  action,
});

export const queryFilter = (query: QueryFunction): QueryFilterSurface => ({
  kind: "query.filter",
  query,
});

export const routeEnter = (route: AppRoute): RouteEnterSurface => ({
  kind: "route.enter",
  route,
});

export const formSubmit = (form: Form): FormSubmitSurface => ({
  kind: "form.submit",
  form,
});

export const uiHint = (component: Component): UiHintSurface => ({
  kind: "ui.hint",
  component,
});

// --- Default deny behavior --------------------------------------------------

export const deriveDefaultDeny = (surface: AccessSurface): DenyBehavior => {
  switch (surface.kind) {
    case "entity.read":
      return "not_found";
    case "entity.create":
    case "entity.update":
    case "entity.delete":
      return "forbidden";
    case "field.read":
      return "omit";
    case "field.write":
      return "forbidden";
    case "relation.read":
      return "omit";
    case "relation.link":
    case "relation.unlink":
      return "forbidden";
    case "action.execute":
      return "forbidden";
    case "query.filter":
      return "omit";
    case "route.enter":
      return "forbidden";
    case "form.submit":
      return "forbidden";
    case "ui.hint":
      return "readonly";
    default:
      return "forbidden";
  }
};

// --- Binding constructor ----------------------------------------------------

export const defineAccessSurfaceBinding = <S extends AccessSurface>(input: {
  readonly surface: S;
  readonly policy: Policy;
  readonly deny?: DenyBehavior;
  readonly placement?: Placement;
}): AccessSurfaceBinding<S> => ({
  kind: "access_surface_binding",
  surface: input.surface,
  policy: input.policy,
  deny: input.deny ?? deriveDefaultDeny(input.surface),
  placement: input.placement,
});
