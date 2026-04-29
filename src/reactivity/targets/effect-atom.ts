/* @__NO_SIDE_EFFECTS__ */
/**
 * Effect-Atom target plugin for the reactive graph.
 *
 * Generates TypeScript artifacts using `@effect-atom/atom` APIs from the
 * portable reactive graph IR.
 */

import type { Artifact } from "../../core/artifacts.ts";
import { diagnostic } from "../../core/diagnostics.ts";
import { definePlugin } from "../../core/plugin.ts";
import { makeArtifact } from "../../core/artifacts.ts";
import type { ReactiveGraph } from "../reactivity.ts";

/**
 * Generates Effect-Atom TypeScript artifacts from a reactive graph.
 *
 * @param graph - The reactive graph to generate from.
 * @returns Artifacts and diagnostics.
 */
export const generateEffectAtomArtifacts = (
  graph: ReactiveGraph,
): {
  readonly artifacts: readonly Artifact[];
  readonly diagnostics: readonly ReturnType<typeof diagnostic>[];
} => {
  const diagnostics: ReturnType<typeof diagnostic>[] = [];
  const resourceNodes = graph.nodes.filter((node) => node.kind === "resource");
  const mutationNodes = graph.nodes.filter((node) => node.kind === "mutation");

  const resourceById = new Map(resourceNodes.map((node) => [node.id, node]));

  // Check for unsupported features (none currently in graph node kinds, but reserved for future)
  const unsupportedNodeKinds = ["form", "ui", "service", "store"] as string[];
  for (const node of graph.nodes) {
    if (unsupportedNodeKinds.includes(node.kind)) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "effect-atom:unsupported-feature",
          message: `Effect-Atom target does not yet support ${node.kind} nodes`,
        }),
      );
    }
  }

  // Build resource code
  const resourceCode = resourceNodes.map((node) => {
    // Find the actual resource from context - we only have node IDs here
    // For now, generate a placeholder that uses the query name
    const queryEdge = graph.edges.find((edge) => edge.from === node.id && edge.kind === "binds");
    const queryNode = queryEdge
      ? graph.nodes.find((n) => n.id === queryEdge.to && n.kind === "query_function")
      : undefined;

    if (!queryNode) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "effect-atom:missing-query",
          message: `Resource ${node.name} has no bound query`,
        }),
      );
      return `// ERROR: Resource ${node.name} has no bound query`;
    }

    return `export const ${node.name} = Atom.make((get) => {\n  return ${queryNode.name}(get);\n});`;
  });

  const resourceAllNodes = graph.nodes.filter((node) => node.kind === "resource_all");
  const resourceAllCode = resourceAllNodes.map((node) => {
    diagnostics.push(
      diagnostic({
        severity: "warning",
        code: "effect-atom:unsupported-feature",
        message: `Effect-Atom target does not yet generate full code for resource_all nodes (${node.name})`,
      }),
    );
    const branchNames = graph.edges
      .filter((edge) => edge.from === node.id && edge.kind === "binds")
      .map((edge) => graph.nodes.find((n) => n.id === edge.to))
      .filter((n): n is NonNullable<typeof n> => n !== undefined)
      .map((n) => n.name);
    return `// TODO: Atom.all([${branchNames.join(", ")}]) for ${node.name}`;
  });

  const resourceChainNodes = graph.nodes.filter((node) => node.kind === "resource_chain");
  const resourceChainCode = resourceChainNodes.map((node) => {
    diagnostics.push(
      diagnostic({
        severity: "warning",
        code: "effect-atom:unsupported-feature",
        message: `Effect-Atom target does not yet generate full code for resource_chain nodes (${node.name})`,
      }),
    );
    const sourceEdge = graph.edges.find(
      (edge) => edge.from === node.id && edge.kind === "binds" && edge.to.startsWith("resource:"),
    );
    const sourceName = sourceEdge
      ? graph.nodes.find((n) => n.id === sourceEdge.to)?.name
      : undefined;
    const nextEdge = graph.edges.find(
      (edge) =>
        edge.from === node.id &&
        edge.kind === "binds" &&
        edge.to.startsWith("resource:") &&
        edge.to !== sourceEdge?.to,
    );
    const nextName = nextEdge ? graph.nodes.find((n) => n.id === nextEdge.to)?.name : undefined;
    return `// TODO: Chain ${sourceName ?? "?"} -> ${nextName ?? "?"} for ${node.name}`;
  });

  // Build mutation code with invalidation
  const mutationCode = mutationNodes.map((node) => {
    const actionEdge = graph.edges.find(
      (edge) => edge.from === node.id && edge.kind === "binds" && edge.to.startsWith("action:"),
    );
    const actionNode = actionEdge
      ? graph.nodes.find((n) => n.id === actionEdge.to && n.kind === "action_function")
      : undefined;

    if (!actionNode) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "effect-atom:missing-action",
          message: `Mutation ${node.name} has no bound action`,
        }),
      );
      return `// ERROR: Mutation ${node.name} has no bound action`;
    }

    // Find invalidated resources
    const invalidationEdges = graph.edges.filter(
      (edge) => edge.from === node.id && edge.kind === "invalidates",
    );
    const invalidatedKeys = invalidationEdges.map((edge) => edge.to);

    // Find resources that read these keys
    const affectedResourceIds = new Set(
      graph.edges
        .filter((edge) => edge.kind === "reads" && invalidatedKeys.includes(edge.to))
        .map((edge) => edge.from)
        .filter((fromId) => resourceById.has(fromId)),
    );

    // Also find resources via stale queries
    const staleQueries = graph.edges
      .filter((edge) => edge.kind === "reads" && invalidatedKeys.includes(edge.to))
      .map((edge) => edge.from);

    for (const queryId of staleQueries) {
      const boundResources = graph.edges
        .filter((edge) => edge.kind === "binds" && edge.to === queryId)
        .map((edge) => edge.from);
      for (const rId of boundResources) {
        if (resourceById.has(rId)) {
          affectedResourceIds.add(rId);
        }
      }
    }

    const invalidatedResourceNames = [...affectedResourceIds]
      .map((id) => resourceById.get(id)!.name)
      .sort();

    const refreshCalls = invalidatedResourceNames
      .map((name) => `    get.refresh(${name});`)
      .join("\n");

    return `export const ${node.name} = Atom.writable(\n  (get) => null,\n  (ctx, value) => {\n    ${actionNode.name}(value);\n${refreshCalls}\n  }\n);`;
  });

  const content = [
    `import { Atom } from "@effect-atom/atom"`,
    "",
    "// Generated resources",
    ...resourceCode,
    "",
    "// Generated resource_all compositions",
    ...resourceAllCode,
    "",
    "// Generated resource_chain compositions",
    ...resourceChainCode,
    "",
    "// Generated mutations",
    ...mutationCode,
    "",
  ].join("\n");

  const artifact = makeArtifact({
    path: "effect-atom/reactive.ts",
    content,
    kind: "source",
    language: "typescript",
    diagnostics,
  });

  return { artifacts: [artifact], diagnostics };
};

/**
 * Creates the Effect-Atom target plugin.
 */
export const createEffectAtomTargetPlugin = () =>
  definePlugin({
    id: "effect-atom",
    namespace: "effect-atom",
    setup: () => ({
      targets: [
        {
          name: "effect-atom",
          accepts_inputs: ["reactive_graph"],
          generate: (input) => {
            if (input.kind !== "reactive_graph" || !input.value) {
              return [
                makeArtifact({
                  path: "effect-atom/error.txt",
                  content: "Invalid input: expected reactive_graph",
                  kind: "source",
                }),
              ];
            }
            const { artifacts } = generateEffectAtomArtifacts(input.value as ReactiveGraph);
            return artifacts;
          },
        },
      ],
    }),
  });
