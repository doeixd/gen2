/**
 * Target legalization bridge (Track E, PLAN.md §3).
 *
 * The "bridge" emit/lower passes that route through legacy target
 * `generate(input)` hooks. Per PLAN.md Track F, target lowerings will
 * eventually consume legalized target dialect IR
 * (`dialects/postgres`, `dialects/react`, …) and these bridge passes
 * will be deleted.
 *
 * This file is *allowed* to read `passCtx.options.genContext` — it
 * is on the architecture-test allow-list at
 * `tests/architecture/pass-ctx-genctx.test.ts`.
 *
 * Track E milestone: lifecycle.ts no longer owns target plumbing;
 * the runner just delegates here.
 */

import {
  type Artifact,
  type Diagnostic,
  diagnostic,
  type GenContext,
  hasErrors,
} from "../core/index.ts";
import type { Target, TargetInputRecord } from "../core/target.ts";
import {
  defineEdge,
  defineNode,
  endpointRoles,
  type PassContext,
  type PassResult,
} from "../kernel/index.ts";
import { defineDiagnostic as kernelDiagnostic } from "../kernel/diagnostic.ts";
import { attachEdge, attachNode } from "../kernel/bridge.ts";
import {
  TARGET_INPUT_NODE_KIND,
  TARGET_LEGALIZES_INPUT_EDGE_KIND,
  TARGET_NODE_KIND,
} from "../dialects/target.ts";

const targetNodeKind = { id: TARGET_NODE_KIND.id, label: "Target" } as const;
const targetInputNodeKind = { id: TARGET_INPUT_NODE_KIND.id, label: "Target input" } as const;
const targetLegalizesInputEdgeKind = {
  id: TARGET_LEGALIZES_INPUT_EDGE_KIND.id,
  label: "Target legalizes input",
} as const;

const targetNodeId = (target: Target): string => `target:${target.plugin_id}:${target.name}`;

const targetInputNodeId = (target: Target, input: TargetInputRecord): string =>
  `target-input:${target.name}:${input.kind}:${input.name}`;

const unsupportedAsyncCodegenHookDiagnostic = (name: string): Diagnostic =>
  diagnostic({
    severity: "error",
    code: "lifecycle:async-codegen-hook-unsupported",
    message: `Async codegen hook ${name} is not supported by the synchronous lifecycle runner`,
  });

/**
 * Mark a target's input as legalized in the kernel graph by attaching
 * a `Target` node, a `TargetInput` node, and the legalizes-input edge.
 */
export const markTargetInputLegalized = (
  ctx: GenContext,
  target: Target,
  input: TargetInputRecord,
): void => {
  const targetId = targetNodeId(target);
  const inputId = targetInputNodeId(target, input);

  attachNode(
    ctx.graph,
    defineNode(targetNodeKind, targetId, {
      name: target.name,
      metadata: { title: target.name },
    }),
  );
  attachNode(
    ctx.graph,
    defineNode(targetInputNodeKind, inputId, {
      name: input.name,
      metadata: { title: input.name },
    }),
  );
  attachEdge(
    ctx.graph,
    defineEdge(
      targetLegalizesInputEdgeKind,
      `edge:target-legalizes-input:${target.name}:${input.kind}:${input.name}`,
      [
        {
          role: endpointRoles.TARGET,
          target: { kind: "target", id: targetId, name: target.name },
          cardinality: "one",
        },
        {
          role: endpointRoles.SOURCE,
          target: { kind: "targetInput", id: inputId, name: input.name },
          cardinality: "one",
        },
      ],
      {
        metadata: {
          title: `${target.name} legalizes ${input.name}`,
          custom: { targetName: target.name, inputName: input.name, inputKind: input.kind },
        },
      },
    ),
  );
};

/**
 * Look up whether a target's input has been legalized, by scanning the
 * legalize-input edges on the graph. This still uses metadata custom
 * fields — Track F will replace it with a typed graph query once the
 * target dialect ships.
 */
export const isTargetInputLegalized = (
  ctx: GenContext,
  target: Target,
  input: TargetInputRecord,
): boolean =>
  Array.from(ctx.graph.edges.values()).some(
    (edge) =>
      edge.kind.id === TARGET_LEGALIZES_INPUT_EDGE_KIND.id &&
      edge.metadata?.custom?.targetName === target.name &&
      edge.metadata.custom.inputName === input.name &&
      edge.metadata.custom.inputKind === input.kind,
  );

const bridgeLowerPassName = (targetName: string): string => `lower.bridge.${targetName}`;

const bridgeEmitPassName = (targetName: string): string => `emit.bridge.${targetName}`;

/** Pipeline name used for a generated bridge pipeline of a target. */
export const targetPipelineName = (target: Target): string => `gen2-target:${target.name}`;

/** Build a bridge pipeline (`lower.bridge.<name>`, `emit.bridge.<name>`) for a target. */
export const targetPipelineForTarget = (
  target: Target,
): {
  readonly name: string;
  readonly passes: readonly string[];
} => ({
  name: targetPipelineName(target),
  passes: [bridgeLowerPassName(target.name), bridgeEmitPassName(target.name)],
});

/**
 * Register the bridge pipeline for a target in `ctx.pipelineRegistry`.
 * No-op if the target's existing pipeline is already registered.
 */
export const registerTargetPipeline = (ctx: GenContext, target: Target): string => {
  if (target.pipeline && ctx.pipelineRegistry.has(target.pipeline)) {
    return target.pipeline;
  }
  const pipeline = targetPipelineForTarget(target);
  ctx.pipelineRegistry.register(pipeline);
  return pipeline.name;
};

/** Register a no-op lower pass that simply succeeds. Track F replaces this. */
export const registerBridgeLowerPass = (ctx: GenContext, targetName: string): string => {
  const passName = bridgeLowerPassName(targetName);
  if (ctx.passRegistry.has(passName)) return passName;

  ctx.passRegistry.register({ name: passName, phase: "lower" }, () => ({ success: true }));
  return passName;
};

/**
 * Register an emit pass that calls the target's legacy `generate(input)`
 * hooks for each legalized input. Track F replaces this with dialect
 * emit passes that consume legalized target dialect IR.
 */
export const registerBridgeEmitPass = (ctx: GenContext, targetName: string): string => {
  const passName = bridgeEmitPassName(targetName);
  if (ctx.passRegistry.has(passName)) return passName;

  ctx.passRegistry.register(
    { name: passName, phase: "emit" },
    (_graph, passCtx: PassContext): PassResult => {
      const genCtx = passCtx.options?.genContext as GenContext | undefined;
      const target = passCtx.options?.target as Target | undefined;
      if (!genCtx || !target) {
        return {
          success: false,
          diagnostics: [
            kernelDiagnostic("pass:missing-context", "error", "Emit pass missing target context"),
          ],
        };
      }

      const plugin = genCtx.plugins.find((p) => p.id === target.plugin_id);
      const contributions = plugin ? genCtx.contributions.get(plugin.id) : undefined;
      const targetContrib = contributions?.targets.find((tc) => tc.name === target.name);
      if (!targetContrib?.generate || !contributions) {
        target.generate_result = { artifacts: [], diagnostics: [], status: "success" };
        return { success: true };
      }

      let artifacts: Artifact[] = [];
      const diagnostics: Diagnostic[] = [];

      for (const input of target.inputs) {
        if (!isTargetInputLegalized(genCtx, target, input)) {
          diagnostics.push(
            diagnostic({
              severity: "error",
              code: "target:input-not-legalized",
              message: `Target ${target.name} input ${input.name} was not legalized before emit`,
            }),
          );
          continue;
        }

        try {
          artifacts.push(...targetContrib.generate(input));
          for (const hook of contributions.codegen_hooks) {
            if (hook.target_kind !== input.kind) continue;
            const hookResult = hook.generate_fn(input);
            if (hookResult instanceof Promise) {
              diagnostics.push(unsupportedAsyncCodegenHookDiagnostic(hook.name));
              continue;
            }
            artifacts.push(...hookResult);
          }
        } catch (err) {
          diagnostics.push(
            diagnostic({
              severity: "error",
              code: "lifecycle:generate-error",
              message: `Generation failed for target ${target.name}: ${(err as Error).message}`,
            }),
          );
        }
      }

      for (const transform of contributions.artifact_transforms) {
        artifacts = artifacts.map((artifact) => transform.transform_fn(artifact));
      }

      target.generate_result = {
        artifacts,
        diagnostics,
        status: hasErrors(diagnostics) ? "failed" : "success",
      };

      return {
        success: !hasErrors(diagnostics),
        diagnostics: diagnostics.map((d) =>
          kernelDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
        ),
      };
    },
  );

  return passName;
};
