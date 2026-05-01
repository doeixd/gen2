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

  // Check for unsupported features and progressive enhancement needs
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

  // PE2: Progressive enhancement diagnostics
  for (const node of resourceNodes) {
    if (
      node.bindings &&
      node.bindings.some((b) => b.backend === "local_storage" || b.backend === "session_storage")
    ) {
      diagnostics.push(
        diagnostic({
          severity: "info",
          code: "effect-atom:progressive-enhancement",
          message: `Resource ${node.name} uses client storage bindings; generated code includes progressive enhancement fallback`,
        }),
      );
    }
  }

  // Build resource code
  const resourceCode = resourceNodes.map((node) => {
    // Find the actual resource from context - we only have node IDs here
    // For now, generate a placeholder that uses the query name
    const queryEdge = graph.edges.find(
      (edge) => edge.from === node.id && edge.kind === "wraps_query",
    );
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

    const keyEdge = graph.edges.find(
      (edge) => edge.from === queryNode.id && edge.kind === "reads_key",
    );
    if (!keyEdge) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "effect-atom:unsupported-key-expression",
          message: `Resource ${node.name} bound query has no key expression`,
        }),
      );
    }

    // Assume missing symbol metadata if we don't have a stable ID or execution plan.
    // For now we just emit the warning since we don't actually generate real imports yet.
    if (!queryNode.stable_id) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "effect-atom:missing-symbol-metadata",
          message: `Resource ${node.name} query lacks symbol metadata for code generation`,
        }),
      );
    }

    if (node.resource_type === "pull") {
      return `export const ${node.name} = Atom.pull((get) => {\n  return ${queryNode.name}(get);\n});`;
    }

    const searchParamBinding = node.bindings?.find((b) => b.backend === "url_search_params");
    if (searchParamBinding) {
      return `export const ${node.name} = Atom.searchParam("${searchParamBinding.key ?? node.name}");`;
    }

    const localStorageBinding = node.bindings?.find((b) => b.backend === "local_storage");
    if (localStorageBinding) {
      return `export const ${node.name} = Atom.kvs("${localStorageBinding.key ?? node.name}", { storage: "local" });`;
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
      .filter((edge) => edge.from === node.id && edge.kind === "composes_resource")
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
    const composedEdges = graph.edges.filter(
      (edge) => edge.from === node.id && edge.kind === "composes_resource",
    );
    const sourceName = composedEdges[0]
      ? graph.nodes.find((n) => n.id === composedEdges[0].to)?.name
      : undefined;
    const nextName = composedEdges[1]
      ? graph.nodes.find((n) => n.id === composedEdges[1].to)?.name
      : undefined;
    return `// TODO: Chain ${sourceName ?? "?"} -> ${nextName ?? "?"} for ${node.name}`;
  });

  // Build mutation code with invalidation
  const mutationCode = mutationNodes.map((node) => {
    const actionEdge = graph.edges.find((edge) => {
      if (edge.from !== node.id || edge.kind !== "wraps_action") return false;
      return graph.nodes.some((n) => n.id === edge.to && n.kind === "action_function");
    });
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

    if (!actionNode.stable_id) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "effect-atom:missing-symbol-metadata",
          message: `Mutation ${node.name} action lacks symbol metadata for code generation`,
        }),
      );
    }

    // Find invalidated resources
    const invalidationEdges = graph.edges.filter(
      (edge) => edge.from === node.id && edge.kind === "invalidates_key",
    );
    const invalidatedKeys = invalidationEdges.map((edge) => edge.to);

    // Find resources that read these keys
    const affectedResourceIds = new Set(
      graph.edges
        .filter((edge) => edge.kind === "reads_key" && invalidatedKeys.includes(edge.to))
        .map((edge) => edge.from)
        .filter((fromId) => resourceById.has(fromId)),
    );

    // Also find resources via stale queries
    const staleQueries = graph.edges
      .filter((edge) => edge.kind === "reads_key" && invalidatedKeys.includes(edge.to))
      .map((edge) => edge.from);

    for (const queryId of staleQueries) {
      const boundResources = graph.edges
        .filter((edge) => edge.kind === "wraps_query" && edge.to === queryId)
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
