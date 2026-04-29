/**
 * UI backend registry, factories, and namespace creation.
 *
 * @module
 */

import * as uiMod from "../ui/index.ts";
import type { GenContext } from "../core/index.ts";
import {
  bindView,
  bindComponent,
  bindStyle,
  bindBehavior,
  bindTheme,
  bindPlatform,
  bindRenderer,
  bindForm,
} from "./binders.ts";
import type {
  GenConfig,
  BaseUiNamespace,
  UiNamespaceRuntimeOptions,
  CustomUiNamespaceFactory,
  KnownUiBackend,
  UiBackendRegistry,
  UiNamespace,
  JsxElementHandle,
  TuiElementHandle,
} from "./types.ts";

const createBaseUiNamespace = (ctx: GenContext): BaseUiNamespace => ({
  cap: uiMod.cap,
  collection: uiMod.collection,
  container: uiMod.container,
  view: bindView(ctx),
  component: bindComponent(ctx),
  style: bindStyle(ctx),
  behavior: bindBehavior(ctx),
  theme: bindTheme(ctx),
  platform: bindPlatform(ctx),
  renderer: bindRenderer(ctx),
  form: bindForm(ctx),
  widget: uiMod.defineWidget,
  slot: uiMod.defineSlot,
  formField: uiMod.defineFormField,
  errorMapping: uiMod.defineFormErrorMapping,
  safeHtml: uiMod.safeHtml,
  attachStyle: uiMod.attachStyleToView,
  attachBehavior: uiMod.attachBehaviorToView,
});

/**
 * Creates the `ui` namespace for a Gen context.
 *
 * @param ctx - The mutable Gen context.
 * @param options - Optional runtime options for the UI backend.
 * @param customFactory - Optional custom factory for extending the UI namespace.
 * @returns The UI namespace, potentially augmented with backend-specific helpers.
 *
 * @example
 * ```ts
 * const ui = createUiNamespace(ctx, { backend: "jsx" });
 * const view = ui.view("UserList", ...);
 * ```
 */
export function createUiNamespace<B extends string>(
  ctx: GenContext,
  options: UiNamespaceRuntimeOptions<B>,
): BaseUiNamespace & (B extends KnownUiBackend ? UiBackendRegistry[B]["namespace"] : object);
export function createUiNamespace<B extends string, N extends object>(
  ctx: GenContext,
  options: UiNamespaceRuntimeOptions<B>,
  customFactory: CustomUiNamespaceFactory<B, N>,
): BaseUiNamespace & N;
export function createUiNamespace<C extends GenConfig = GenConfig>(ctx: GenContext): UiNamespace<C>;
export function createUiNamespace(
  ctx: GenContext,
  options?: UiNamespaceRuntimeOptions<string>,
  customFactory?: CustomUiNamespaceFactory<string, object>,
): BaseUiNamespace & object {
  const backend = options?.backend ?? "jsx";
  const baseNamespace = createBaseUiNamespace(ctx);
  const effectiveFactory = customFactory ?? options?.factory;

  if (effectiveFactory && backend === effectiveFactory.backend) {
    return {
      ...baseNamespace,
      ...effectiveFactory.create(ctx, baseNamespace),
    };
  }

  if (backend === "jsx") {
    return {
      ...baseNamespace,
      ...jsxUiNamespaceFactory.create(ctx, baseNamespace),
    };
  }

  if (backend === "tui") {
    return {
      ...baseNamespace,
      ...tuiUiNamespaceFactory.create(ctx, baseNamespace),
    };
  }

  return baseNamespace;
}

export const jsxUiNamespaceFactory = {
  backend: "jsx" as const,
  create: (ctx: GenContext, baseNamespace: BaseUiNamespace) => ({
    jsxElement: (tag: string) => ({ backend: "jsx" as const, tag }),
    jsxPlatform: (name: string) => ({
      backend: "jsx" as const,
      platform: Object.assign(
        baseNamespace.platform(
          name,
          [],
          ["click", "input"],
          ["class", "style"],
          `${name}Renderer`,
          ["dom"],
        ),
        { backend: "jsx" as const },
      ),
    }),
    jsxRenderer: (name: string, platform: uiMod.Platform<JsxElementHandle>) => ({
      backend: "jsx" as const,
      renderer: baseNamespace.renderer(name, platform, [
        "Base",
        "Container",
        "Text",
        "Interactive",
      ]),
    }),
    jsxSlot: (
      name: string,
      capability: uiMod.ElementCapability,
      allowed_attributes: readonly string[] = [],
      allowed_events: readonly string[] = [],
      platform_requirements: readonly string[] = [],
      hidden = false,
    ) =>
      uiMod.defineSlot<JsxElementHandle>(
        name,
        capability,
        allowed_attributes,
        allowed_events,
        platform_requirements,
        hidden,
      ),
    jsxView: (
      name: string,
      slots: uiMod.Slot<JsxElementHandle>[],
      structure: string,
      target_platforms: readonly uiMod.Platform<JsxElementHandle>[] = [],
    ) => ({
      backend: "jsx" as const,
      view: Object.assign(baseNamespace.view(name, slots, structure, [], target_platforms), {
        backend: "jsx" as const,
      }),
    }),
    jsxComponent: (name: string, props_type: string, view: uiMod.View<JsxElementHandle>) => ({
      backend: "jsx" as const,
      component: baseNamespace.component(name, props_type, [], [], [], view),
    }),
    jsxAttachStyle: (
      style: uiMod.Style<string, JsxElementHandle>,
      view: uiMod.View<JsxElementHandle>,
    ) => baseNamespace.attachStyle(style, view),
    jsxAttachBehavior: (
      behavior: uiMod.Behavior<Record<string, uiMod.ElementCapability>, JsxElementHandle>,
      view: uiMod.View<JsxElementHandle>,
    ) => baseNamespace.attachBehavior(behavior, view),
  }),
};

export const tuiUiNamespaceFactory = {
  backend: "tui" as const,
  create: (ctx: GenContext, baseNamespace: BaseUiNamespace) => ({
    tuiElement: (kind: string) => ({ backend: "tui" as const, kind }),
    tuiPlatform: (name: string) => ({
      backend: "tui" as const,
      platform: Object.assign(
        baseNamespace.platform(
          name,
          [],
          ["keypress", "submit"],
          ["width", "height"],
          `${name}Renderer`,
          ["terminal"],
        ),
        { backend: "tui" as const },
      ),
    }),
    tuiRenderer: (name: string, platform: uiMod.Platform<TuiElementHandle>) => ({
      backend: "tui" as const,
      renderer: baseNamespace.renderer(name, platform, [
        "Base",
        "Container",
        "Text",
        "Interactive",
      ]),
    }),
    tuiSlot: (
      name: string,
      capability: uiMod.ElementCapability,
      allowed_attributes: readonly string[] = [],
      allowed_events: readonly string[] = [],
      platform_requirements: readonly string[] = [],
      hidden = false,
    ) =>
      uiMod.defineSlot<TuiElementHandle>(
        name,
        capability,
        allowed_attributes,
        allowed_events,
        platform_requirements,
        hidden,
      ),
    tuiView: (
      name: string,
      slots: uiMod.Slot<TuiElementHandle>[],
      structure: string,
      target_platforms: readonly uiMod.Platform<TuiElementHandle>[] = [],
    ) => ({
      backend: "tui" as const,
      view: Object.assign(baseNamespace.view(name, slots, structure, [], target_platforms), {
        backend: "tui" as const,
      }),
    }),
    tuiComponent: (name: string, props_type: string, view: uiMod.View<TuiElementHandle>) => ({
      backend: "tui" as const,
      component: baseNamespace.component(name, props_type, [], [], [], view),
    }),
    tuiAttachStyle: (
      style: uiMod.Style<string, TuiElementHandle>,
      view: uiMod.View<TuiElementHandle>,
    ) => baseNamespace.attachStyle(style, view),
    tuiAttachBehavior: (
      behavior: uiMod.Behavior<Record<string, uiMod.ElementCapability>, TuiElementHandle>,
      view: uiMod.View<TuiElementHandle>,
    ) => baseNamespace.attachBehavior(behavior, view),
  }),
};
