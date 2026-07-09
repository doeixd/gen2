/* @__NO_SIDE_EFFECTS__ */
/**
 * Core-dialect passes (Track E port, PLAN.md §3).
 *
 * `verify-symbols.function` — fully graph-native validation of
 * contracts and actors via `getContractsFromGraph` /
 * `getActorsFromGraph`. No `passCtx.options.genContext` reads.
 *
 * Pattern mirrors `src/requirements/passes.ts` and
 * `src/relation/passes.ts`.
 */

import type { GenContext } from "./context.ts";
import { diagnostic } from "./diagnostics.ts";
import { BUILT_IN_PASSES, type KernelGraph, type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import type { DialectRegistry } from "../kernel/dialect.ts";
import { checkContractsAndActors } from "./contract.ts";
import { getContractsFromGraph, getActorsFromGraph } from "./contract-kernel.ts";
import { checkNodesOnGraph } from "./node-lowering.ts";
import { checkConfig } from "./config.ts";
import { checkMagicStringsOnGraph } from "./magic_strings.ts";
import { checkTargetCapabilities } from "./target-capabilities.ts";

const FUNCTION_SYMBOLS_PASS_NAME = BUILT_IN_PASSES.VERIFY_SYMBOLS.FUNCTION;
const NODES_SYMBOLS_PASS_NAME = "verify-symbols.nodes";
const MAGIC_STRINGS_PASS_NAME = "verify-symbols.magicStrings";
const CONFIG_PASS_NAME = "verify-dialects.config";
const TARGET_COMPATIBILITY_PASS_NAME = BUILT_IN_PASSES.LEGALIZE.TARGET_COMPATIBILITY;

const registerNoopPass = (
  ctx: GenContext,
  name: string,
  phase: "canonicalize" | "legalize",
): void => {
  if (ctx.passRegistry.has(name)) return;
  ctx.passRegistry.register({ name, phase }, (): PassResult => ({ success: true }));
};

export const checkDialectNodeKindOwnershipOnGraph = (
  graph: KernelGraph,
  dialectRegistry: DialectRegistry,
) => {
  const diagnostics = [];
  const seen = new Set<string>();

  for (const node of graph.nodes.values()) {
    const kindId = node.kind.id;
    if (seen.has(kindId) || dialectRegistry.getDialectForNodeKind(kindId)) continue;
    seen.add(kindId);
    diagnostics.push(
      diagnostic({
        severity: "warning",
        code: "dialect:unknown-node-kind",
        message: `Graph node kind "${kindId}" is not owned by a registered dialect`,
      }),
    );
  }

  return diagnostics;
};

export const checkDialectEdgeKindOwnershipOnGraph = (
  graph: KernelGraph,
  dialectRegistry: DialectRegistry,
) => {
  const diagnostics = [];
  const seen = new Set<string>();

  for (const edge of graph.edges.values()) {
    const kindId = edge.kind.id;
    if (seen.has(kindId) || dialectRegistry.getDialectForEdgeKind(kindId)) continue;
    seen.add(kindId);
    diagnostics.push(
      diagnostic({
        severity: "warning",
        code: "dialect:unknown-edge-kind",
        message: `Graph edge kind "${kindId}" is not owned by a registered dialect`,
      }),
    );
  }

  return diagnostics;
};

/** Register core graph-native verify-symbols passes on `ctx.passRegistry`. */
export const registerCorePasses = (ctx: GenContext): void => {
  if (!ctx.passRegistry.has(FUNCTION_SYMBOLS_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: FUNCTION_SYMBOLS_PASS_NAME, phase: "verify-symbols" },
      (graph): PassResult => {
        const diagnostics = checkContractsAndActors(
          getContractsFromGraph(graph),
          getActorsFromGraph(graph),
        );
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }

  if (!ctx.passRegistry.has(NODES_SYMBOLS_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: NODES_SYMBOLS_PASS_NAME, phase: "verify-symbols" },
      (graph): PassResult => {
        const nodeKindContributions = [...ctx.contributions.values()].flatMap(
          (contrib) => contrib.node_kinds,
        );
        const traitMetadata = new Map(ctx.trait_metadata);
        const diagnostics = checkNodesOnGraph(graph, nodeKindContributions, traitMetadata);
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }

  if (!ctx.passRegistry.has(BUILT_IN_PASSES.VERIFY_DIALECTS.NODE_KINDS)) {
    const dialectRegistry = ctx.dialectRegistry;
    ctx.passRegistry.register(
      { name: BUILT_IN_PASSES.VERIFY_DIALECTS.NODE_KINDS, phase: "verify-dialects" },
      (graph): PassResult => {
        const diagnostics = checkDialectNodeKindOwnershipOnGraph(graph, dialectRegistry);
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }

  if (!ctx.passRegistry.has(BUILT_IN_PASSES.VERIFY_DIALECTS.EDGE_KINDS)) {
    const dialectRegistry = ctx.dialectRegistry;
    ctx.passRegistry.register(
      { name: BUILT_IN_PASSES.VERIFY_DIALECTS.EDGE_KINDS, phase: "verify-dialects" },
      (graph): PassResult => {
        const diagnostics = checkDialectEdgeKindOwnershipOnGraph(graph, dialectRegistry);
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }

  if (!ctx.passRegistry.has(MAGIC_STRINGS_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: MAGIC_STRINGS_PASS_NAME, phase: "verify-symbols" },
      (graph): PassResult => {
        // ctx.entities is captured here because duplicate stable-ID
        // detection needs the source-side entity array (the graph dedups
        // by node id, which would mask the duplicate).
        const diagnostics = checkMagicStringsOnGraph(graph, ctx.config, ctx.entities);
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }

  if (!ctx.passRegistry.has(CONFIG_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: CONFIG_PASS_NAME, phase: "verify-dialects" },
      (): PassResult => {
        const diagnostics = checkConfig(ctx.config);
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }

  if (!ctx.passRegistry.has(TARGET_COMPATIBILITY_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: TARGET_COMPATIBILITY_PASS_NAME, phase: "legalize" },
      (): PassResult => {
        const diagnostics = checkTargetCapabilities(ctx);
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }

  registerNoopPass(ctx, BUILT_IN_PASSES.CANONICALIZE.EXPRESSION, "canonicalize");
  registerNoopPass(ctx, BUILT_IN_PASSES.CANONICALIZE.PREDICATE, "canonicalize");
  registerNoopPass(ctx, BUILT_IN_PASSES.LEGALIZE.PLACEMENT, "legalize");
};
