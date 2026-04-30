/* @__NO_SIDE_EFFECTS__ */
/**
 * Node lowering pipeline. Handles plugin-defined node registration,
 * lowering traversal (interpret → lower → diagnostic), and node-level
 * diagnostics (duplicate IDs, missing traits, unknown kinds, cycles).
 *
 * See spec/core.allium :: entity NodeLowering, surface LoweringPipeline.
 */

import type { GenContext } from "./context.ts";
import type { StaticNode, TraitKind, NodeErrorType } from "./node.ts";
import { BUILT_IN_TRAITS } from "./node.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { nodeDiagnostics } from "./diagnostics.ts";
import type { SemanticType, Effect, Requirement } from "../types/index.ts";
import type { MetadataEntry } from "./refs.ts";

/** Register a custom node in the context, checking for duplicate IDs. */
export const registerNode = (ctx: GenContext, node: StaticNode): void => {
  if (node.id !== undefined) {
    const existing = ctx.nodes.find((n) => n.id === node.id);
    if (existing !== undefined) {
      ctx.diagnostics.push(
        nodeDiagnostics.duplicateId({
          id: node.id,
          suggestion: "Ensure each node has a unique stable ID.",
        }),
      );
      return;
    }
  }
  ctx.nodes.push(node);
};

/** Create a StaticNode from its components. */
export const defineNode = <
  Kind extends string,
  const TTraits extends readonly TraitKind[],
  In = unknown,
  Out = unknown,
  Err = never,
  Req = never,
  Eff = never,
>(input: {
  readonly kind: Kind;
  readonly id?: string;
  readonly name?: string;
  readonly traits: TTraits;
  readonly input?: SemanticType<In>;
  readonly output?: SemanticType<Out>;
  readonly errors?: readonly NodeErrorType[];
  readonly requirements?: readonly Requirement[];
  readonly effects?: readonly Effect[];
  readonly metadata?: readonly MetadataEntry[];
}): StaticNode<Kind, In, Out, Err, Req, Eff, TTraits> => ({
  kind: input.kind,
  id: input.id as import("./refs.ts").StableId<string> | undefined,
  name: input.name,
  traits: input.traits,
  input: input.input,
  output: input.output,
  errors: input.errors,
  requirements: input.requirements,
  effects: input.effects,
  metadata: input.metadata,
});

/** Look up a node-kind contribution by its kind string. */
const getNodeKindContribution = (ctx: GenContext, kind: string) => {
  for (const [, contrib] of ctx.contributions) {
    const found = contrib.node_kinds.find((nk) => nk.kind === kind);
    if (found !== undefined) return found;
  }
  return undefined;
};

/** Look up a lowering contribution by its from_kind string. */
const getLowering = (ctx: GenContext, fromKind: string) => {
  for (const [, contrib] of ctx.contributions) {
    const found = contrib.lowerings.find((l) => l.from_kind === fromKind);
    if (found !== undefined) return found;
  }
  return undefined;
};

/**
 * Lower a custom node toward a target kind.
 *
 * 1. If the node's kind has a direct interpreter for the target, return
 *    `undefined` (the caller should use the interpreter).
 * 2. Otherwise, if a lowering exists, apply it and recurse.
 * 3. Otherwise emit a diagnostic.
 *
 * @returns Lowered node(s), or `undefined` when interpreted directly.
 */
export const lowerNode = <N extends StaticNode = StaticNode>(
  ctx: GenContext,
  node: N,
  targetKind: string,
  visited: readonly string[] = [],
): StaticNode | readonly StaticNode[] | undefined => {
  // Cycle detection
  if (visited.includes(node.kind)) {
    ctx.diagnostics.push(
      nodeDiagnostics.loweringCycle({
        kind: node.kind,
        visited: [...visited, node.kind],
        suggestion: "Review lowering contributions for circular dependencies.",
      }),
    );
    return undefined;
  }

  // 1. Direct interpretation
  const nodeKindContrib = getNodeKindContribution(ctx, node.kind);
  if (nodeKindContrib?.interpret?.[targetKind] !== undefined) {
    return undefined;
  }

  // 2. Try lowering
  const lowering = getLowering(ctx, node.kind);
  if (lowering !== undefined) {
    const lowered = lowering.lower(node);
    if (lowered === undefined) {
      ctx.diagnostics.push(
        nodeDiagnostics.invalidLowering({
          kind: node.kind,
          toKind: lowering.to_kind,
          suggestion: `Check the lowering function for kind "${node.kind}".`,
        }),
      );
      return undefined;
    }

    if (!Array.isArray(lowered)) {
      const single = lowered as StaticNode;
      if (single.kind === node.kind) {
        ctx.diagnostics.push(
          nodeDiagnostics.loweringCycle({
            kind: node.kind,
            visited: [...visited, node.kind, node.kind],
            suggestion: "Lowering function produced a node of the same kind, creating a cycle.",
          }),
        );
        return undefined;
      }
      const further = lowerNode(ctx, single, targetKind, [...visited, node.kind]);
      return further ?? single;
    }

    // Array result – lower each element
    const results: StaticNode[] = [];
    for (const n of lowered) {
      const r = lowerNode(ctx, n, targetKind, [...visited, node.kind]);
      if (r !== undefined) {
        results.push(...(Array.isArray(r) ? r : [r]));
      } else {
        const hasInterp =
          getNodeKindContribution(ctx, n.kind)?.interpret?.[targetKind] !== undefined;
        if (!hasInterp) {
          results.push(n);
        }
      }
    }
    return results;
  }

  // 3. No interpretation or lowering
  // Only emit a diagnostic for plugin-defined kinds. Built-in kinds are assumed
  // to be directly interpretable by targets; unknown kinds are handled by checkNodes.
  const kindContrib = getNodeKindContribution(ctx, node.kind);
  if (kindContrib !== undefined) {
    ctx.diagnostics.push(
      nodeDiagnostics.noTargetInterpretation({
        kind: node.kind,
        target: targetKind,
        suggestion: `Add an interpretation for target "${targetKind}" or a lowering from "${node.kind}" to a known kind.`,
      }),
    );
  }
  return undefined;
};

/** Check all registered nodes for missing traits and unknown kinds. Returns new diagnostics. */
export const checkNodes = (ctx: GenContext): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const node of ctx.nodes) {
    const kindContrib = getNodeKindContribution(ctx, node.kind);
    if (kindContrib === undefined) {
      diagnostics.push(
        nodeDiagnostics.unknownKind({
          kind: node.kind,
          suggestion: "Register the node kind via a plugin or use a built-in kind.",
        }),
      );
      continue;
    }

    const missing = kindContrib.traits.filter((trait) => !node.traits.includes(trait));
    if (missing.length > 0) {
      diagnostics.push(
        nodeDiagnostics.missingTrait({
          nodeName: node.name,
          traits: missing,
          suggestion: `Add the missing traits [${missing.join(", ")}] to the node definition.`,
        }),
      );
    }

    // Check for unknown traits
    for (const trait of node.traits) {
      if (!BUILT_IN_TRAITS.has(trait) && !ctx.trait_metadata.has(trait)) {
        diagnostics.push(
          nodeDiagnostics.unknownTrait({
            trait,
            suggestion: "Register the trait via a plugin or use a built-in trait.",
          }),
        );
      }
    }
  }
  return diagnostics;
};
