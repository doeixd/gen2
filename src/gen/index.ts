/**
 * Gen factory and namespace assembly.
 *
 * @module
 */

import { createGen as createGenContext, type GenContext } from "../core/index.ts";
import * as lifecycleMod from "../lifecycle/index.ts";
import * as storageMod from "../storage/index.ts";
import * as editorMod from "../editor/index.ts";
import * as listMod from "../list/index.ts";
import * as adminMod from "../admin/index.ts";
import * as functionMod from "../function/index.ts";
import * as core from "../core/index.ts";

import type { Plugin } from "../core/index.ts";
import type {
  GenConfig,
  Gen,
  CreateGenResult,
  GenWithPluginHelpers,
  UiNamespace,
  UiNamespaceRuntimeOptions,
} from "./types.ts";
import {
  bindEntity,
  bindStore,
  bindTable,
  bindColumn,
  bindMapping,
  bindProjection,
  bindSchema,
  bindRelation,
  bindRelationEntity,
  bindGraph,
  bindRuntime,
  bindContract,
  bindActor,
  bindEditor,
  bindDeriveCrud,
  bindDefineList,
} from "./binders.ts";
import {
  createTypesNamespace,
  createExpressionNamespace,
  createRelationNamespace,
  createQueryNamespace,
  createFunctionNamespace,
  createApiNamespace,
  createAuthzNamespace,
  createEventsNamespace,
  createFormsNamespace,
  createLifecycleNamespace,
  createConfigNamespace,
  createEnvNamespace,
  createKeyNamespace,
  createReactivityNamespace,
  createRouterNamespace,
  createHydrationNamespace,
  createServicesNamespace,
  createRulesNamespace,
  createReactionNamespace,
  createNodeNamespace,
} from "./namespaces.ts";
import { createUiNamespace } from "./ui-backends.ts";

// Re-exports for public API
export * from "./types.ts";
export * from "./namespaces.ts";
export * from "./builder.ts";
export { jsxUiNamespaceFactory, tuiUiNamespaceFactory, createUiNamespace } from "./ui-backends.ts";

/**
 * Merges plugin-contributed helpers into the `gen` namespace.
 * Helpers that expose a `materialize` function are evaluated first.
 * @param ctx - The mutable Gen context.
 * @param gen - The `gen` namespace to extend.
 */
interface MaterializableHelper {
  materialize(input: { ctx: GenContext; gen: Gen }): unknown;
}

const isMaterializable = (value: unknown): value is MaterializableHelper =>
  value !== null &&
  typeof value === "object" &&
  "materialize" in value &&
  typeof (value as Record<string, unknown>).materialize === "function";

const mergePluginHelpers = <C extends GenConfig>(ctx: GenContext, gen: Gen<C>): void => {
  for (const [namespace, helpers] of ctx.helpers.entries()) {
    const materializedHelpers = Object.fromEntries(
      Object.entries(helpers).map(([name, helper]) => {
        if (isMaterializable(helper)) {
          const value = helper.materialize({ ctx, gen });
          helpers[name] = value;
          return [name, value];
        }
        return [name, helper];
      }),
    );

    const existing = gen[namespace];
    if (existing && typeof existing === "object" && existing !== null) {
      Object.assign(existing, materializedHelpers);
      continue;
    }
    gen[namespace] = materializedHelpers;
  }
};

/**
 * Assembles the full `gen` namespace from all individual namespaces and binders.
 * @param ctx - The mutable Gen context.
 * @returns The complete `gen` namespace.
 */
const buildGenNamespace = <C extends GenConfig = GenConfig>(
  ctx: GenContext,
  options?: Partial<GenConfig>,
): Gen<C> => ({
  types: createTypesNamespace<C>(ctx),
  entity: bindEntity(ctx),
  node: createNodeNamespace<C>(ctx),
  key: createKeyNamespace<C>(ctx),
  reactivity: createReactivityNamespace<C>(ctx),
  router: createRouterNamespace<C>(ctx),
  hydration: createHydrationNamespace<C>(ctx),
  services: createServicesNamespace<C>(ctx),
  rule: createRulesNamespace<C>(ctx),
  reaction: createReactionNamespace<C>(ctx),
  expr: createExpressionNamespace<C>(),
  store: bindStore(ctx),
  table: bindTable(ctx),
  column: bindColumn(ctx),
  mapping: bindMapping(ctx),
  projection: bindProjection(ctx),
  schema: bindSchema(ctx),
  schemaInput: storageMod.schemaTargetInput,
  fieldMapping: storageMod.fieldMapping,
  mapField: storageMod.mapField,
  readOnlySource: storageMod.readOnlySource,
  hiddenSource: storageMod.hiddenSource,
  buildColumnSource: storageMod.buildColumnSource,
  buildExpressionSource: storageMod.buildExpressionSource,
  buildQueryBackedSource: storageMod.buildQueryBackedSource,
  buildAggregateSource: storageMod.buildAggregateSource,
  buildServiceCallSource: storageMod.buildServiceCallSource,
  buildColumnTarget: storageMod.buildColumnTarget,
  buildExpressionTarget: storageMod.buildExpressionTarget,
  buildComputedTarget: storageMod.buildComputedTarget,
  buildServiceCallTarget: storageMod.buildServiceCallTarget,
  oneWayTransform: storageMod.oneWayTransform,
  bidirectionalTransform: storageMod.bidirectionalTransform,
  readMapping: storageMod.readMapping,
  writeMapping: storageMod.writeMapping,
  mixedMapping: storageMod.mixedMapping,
  reversibleMapping: storageMod.reversibleMapping,
  relation: bindRelation(ctx),
  relationEntity: bindRelationEntity(ctx),
  graph: bindGraph(ctx),
  rel: createRelationNamespace<C>(ctx),
  runtime: bindRuntime(ctx),
  query: createQueryNamespace<C>(ctx),
  func: createFunctionNamespace<C>(ctx),
  action: functionMod.actionBuilder,
  api: createApiNamespace<C>(ctx),
  ui: createUiNamespace(ctx, {
    backend: options?.ui?.backend ?? "jsx",
    factory: options?.ui?.factory,
  } as UiNamespaceRuntimeOptions<string>) as unknown as UiNamespace<C>,
  authz: createAuthzNamespace<C>(ctx),
  events: createEventsNamespace<C>(ctx),
  forms: createFormsNamespace<C>(ctx),
  editor: {
    define: bindEditor(ctx),
    auto: editorMod.autoEditor,
    fieldOverride: editorMod.fieldOverride,
    section: editorMod.editorSection,
    nested: editorMod.nestedEditor,
    command: editorMod.editorCommand,
  },
  crud: {
    derive: bindDeriveCrud(ctx),
  },
  admin: {
    define: adminMod.defineAdmin,
    auto: adminMod.autoAdmin,
    page: {
      list: adminMod.adminListPage,
      editor: adminMod.adminEditorPage,
      dashboard: adminMod.adminDashboardPage,
    },
    route: adminMod.adminRoute,
  },
  list: {
    define: bindDefineList(ctx),
    auto: listMod.autoList,
    column: listMod.listColumn,
    offsetPagination: listMod.offsetPagination,
    cursorPagination: listMod.cursorPagination,
    action: listMod.listAction,
    bulkAction: listMod.listBulkAction,
  },
  lifecycle: createLifecycleNamespace<C>(),
  contract: bindContract(ctx),
  actor: bindActor(ctx),
  config: createConfigNamespace<C>(ctx),
  env: createEnvNamespace<C>(),
  definePlugin: core.definePlugin,
});

/**
 * Build a Gen environment. The returned `gen` namespace bundles every public
 * constructor; the `ctx` carries the mutable state that lifecycle.check() and
 * lifecycle.generate() operate on.
 * @param input - Optional configuration, including plugins to install.
 * @returns The Gen context and namespace.
 *
 * @example
 * ```ts
 * const { ctx, gen } = createGen({
 *   plugins: [myPlugin],
 * });
 *
 * const User = gen.entity("User", {
 *   name: gen.types.string,
 * });
 * ```
 */
export const createGen = <
  C extends GenConfig = GenConfig,
  P extends readonly Plugin[] = readonly Plugin[],
>(
  input: { plugins?: P } & Partial<GenConfig> = {},
): CreateGenResult<C, GenWithPluginHelpers<C, P>> => {
  const ctx = createGenContext(input);
  lifecycleMod.registerBuiltInModuleCheckers(ctx);
  const gen = buildGenNamespace<C>(ctx, input);
  mergePluginHelpers<C>(ctx, gen);
  return { ctx, gen: gen as GenWithPluginHelpers<C, P> };
};

// Re-export commonly used pieces directly so users don't always need to dig
// through namespaces.
export { definePlugin } from "../core/index.ts";
