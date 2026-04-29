/* @__NO_SIDE_EFFECTS__ */
/**
 * Debug adapter — emits a JSON snapshot of the project graph as a generated
 * artifact. Useful as a "what does the kernel see?" diagnostic and as the
 * smallest possible TargetContract reference implementation.
 *
 * Usage:
 * ```ts
 * import { createGen, lifecycle } from "gen2";
 * import { defineDebugAdapter } from "gen2/adapters/debug";
 *
 * const { ctx, gen } = createGen({ plugins: [defineDebugAdapter()] });
 * gen.entity("User", { id: gen.types.uuid() });
 * gen.adapters.debug.snapshot();
 * const result = lifecycle.generate(ctx);
 * // result.artifacts[0].path === "debug/project-snapshot.json"
 * ```
 */

import {
  acceptTargetInput,
  definePlugin,
  type Helper,
  makeArtifact,
  makeTargetInput,
  type Plugin,
  type GenContext,
  type Artifact,
} from "../core/index.ts";

const TARGET_NAME = "debug:project-snapshot";
const INPUT_KIND = "context";
const ARTIFACT_PATH = "debug/project-snapshot.json";

export interface DebugAdapterOptions {
  readonly path?: string;
  readonly indent?: number;
}

export interface DebugAdapterNamespace {
  /** Mark this context for snapshot generation. Returns the registered target input. */
  readonly snapshot: () => void;
}

const summarize = (ctx: GenContext): unknown => ({
  status: ctx.status,
  counts: {
    plugins: ctx.plugins.length,
    targets: ctx.targets.length,
    entities: ctx.entities.length,
    stores: ctx.stores.length,
    tables: ctx.tables.length,
    columns: ctx.columns.length,
    mappings: ctx.mappings.length,
    projections: ctx.projections.length,
    relations: ctx.relations.length,
    relation_entities: ctx.relation_entities.length,
    queries: ctx.queries.length,
    static_functions: ctx.static_functions.length,
    expr_functions: ctx.expr_functions.length,
    predicate_functions: ctx.predicate_functions.length,
    query_functions: ctx.query_functions.length,
    action_functions: ctx.action_functions.length,
    patch_functions: ctx.patch_functions.length,
    plan_functions: ctx.plan_functions.length,
    routes: ctx.routes.length,
    getters: ctx.getters.length,
    mutators: ctx.mutators.length,
    policies: ctx.policies.length,
    events: ctx.events.length,
    forms: ctx.forms.length,
    views: ctx.views.length,
    components: ctx.components.length,
    refs: ctx.refs.length,
    diagnostics: ctx.diagnostics.length,
  },
  plugins: ctx.plugins.map((p) => ({ id: p.id, namespace: p.namespace, status: p.status })),
  entities: ctx.entities.map((e) => ({
    name: e.name,
    store_name: e.store_name,
    fields: e.fieldList.map((f) => ({
      name: f.name,
      semantic_type: f.semantic_type.name,
      nullable: f.nullable,
      optional: f.optional,
      read_only: f.read_only,
    })),
  })),
  stores: ctx.stores.map((s) => ({
    name: s.name,
    dialect: s.dialect,
    tables: s.tables.map((t) => ({
      name: t.name,
      columns: t.columns.map((c) => c.name),
    })),
  })),
  relations: ctx.relations.map((r) => ({
    name: r.name,
    from: r.from_entity?.name,
    to: r.to_entity?.name,
    kind: r.kind,
  })),
});

export const defineDebugAdapter = (
  options: DebugAdapterOptions = {},
): Plugin<{ adapters: { debug: DebugAdapterNamespace } }> => {
  const path = options.path ?? ARTIFACT_PATH;
  const indent = options.indent ?? 2;

  const debugHelper: Helper = {
    name: "debug",
    namespace: "adapters",
    materialize: ({ ctx }): DebugAdapterNamespace => ({
      snapshot: () => {
        const c = ctx as GenContext;
        const target = c.targets.find((t) => t.name === TARGET_NAME);
        if (!target) return;
        if (target.inputs.some((i) => i.kind === INPUT_KIND)) return;
        acceptTargetInput(target, makeTargetInput({ name: "context", kind: INPUT_KIND, value: c }));
      },
    }),
  };

  return definePlugin({
    id: "gen/adapter-debug",
    namespace: "adapter-debug",
    setup: () => ({
      helpers: [debugHelper],
      targets: [
        {
          name: TARGET_NAME,
          accepts_inputs: [INPUT_KIND],
          generate: (input): readonly Artifact[] => {
            const value = (input as { value?: GenContext }).value;
            if (!value) return [];
            return [
              makeArtifact({
                path,
                content: JSON.stringify(summarize(value), null, indent),
                kind: "asset",
                language: "json",
              }),
            ];
          },
        },
      ],
    }),
  });
};
