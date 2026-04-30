/* @__NO_SIDE_EFFECTS__ */
/**
 * TanStack Query target plugin for the reactive graph.
 *
 * Generates TypeScript artifacts using `@tanstack/query-core` APIs from the
 * portable reactive graph IR. Resources lower to `queryOptions` records keyed
 * by the bound key family; mutations lower to factories that invalidate the
 * affected query keys via `QueryClient.invalidateQueries`.
 */

import type { Artifact } from "../../core/artifacts.ts";
import { diagnostic, type Diagnostic } from "../../core/diagnostics.ts";
import { definePlugin } from "../../core/plugin.ts";
import { makeArtifact } from "../../core/artifacts.ts";
import type { ReactiveGraph } from "../reactivity.ts";

const KEY_FAMILY_PREFIX = "key:";

const stripPrefix = (id: string, prefix: string): string =>
  id.startsWith(prefix) ? id.slice(prefix.length) : id;

const queryKeyLiteral = (parts: readonly string[]): string =>
  `[${parts.map((part) => JSON.stringify(part)).join(", ")}] as const`;

const collectResourceQueryKey = (
  graph: ReactiveGraph,
  resourceId: string,
  queryName: string,
): readonly string[] => {
  const queryEdge = graph.edges.find((edge) => {
    if (edge.from !== resourceId || edge.kind !== "wraps_query") return false;
    return graph.nodes.some((node) => node.id === edge.to && node.kind === "query_function");
  });
  if (queryEdge === undefined) return [queryName];
  const keyEdges = graph.edges
    .filter(
      (edge) =>
        edge.from === queryEdge.to &&
        edge.kind === "reads_key" &&
        edge.to.startsWith(KEY_FAMILY_PREFIX),
    )
    .map((edge) => stripPrefix(edge.to, KEY_FAMILY_PREFIX))
    .sort();
  return keyEdges.length > 0 ? keyEdges : [queryName];
};

const collectMutationInvalidationKeys = (
  graph: ReactiveGraph,
  mutationId: string,
): readonly string[] =>
  graph.edges
    .filter(
      (edge) =>
        edge.from === mutationId &&
        edge.kind === "invalidates_key" &&
        edge.to.startsWith(KEY_FAMILY_PREFIX),
    )
    .map((edge) => stripPrefix(edge.to, KEY_FAMILY_PREFIX))
    .sort();

/**
 * Generates TanStack Query TypeScript artifacts from a reactive graph.
 *
 * @param graph - The reactive graph to generate from.
 * @returns Artifacts and diagnostics.
 */
export const generateTanstackQueryArtifacts = (
  graph: ReactiveGraph,
): { readonly artifacts: readonly Artifact[]; readonly diagnostics: readonly Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const resourceNodes = graph.nodes.filter((node) => node.kind === "resource");
  const mutationNodes = graph.nodes.filter((node) => node.kind === "mutation");

  const unsupportedKinds = ["form", "subscription"] as const;
  for (const kind of unsupportedKinds) {
    if (graph.nodes.some((node) => node.kind === kind)) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "tanstack-query:unsupported-feature",
          message: `TanStack Query target does not yet generate code for ${kind} nodes`,
        }),
      );
    }
  }

  const resourceCode = resourceNodes.map((node) => {
    const queryEdge = graph.edges.find((edge) => {
      if (edge.from !== node.id || edge.kind !== "wraps_query") return false;
      return graph.nodes.some((n) => n.id === edge.to && n.kind === "query_function");
    });
    const queryNode = queryEdge
      ? graph.nodes.find((n) => n.id === queryEdge.to && n.kind === "query_function")
      : undefined;

    if (queryNode === undefined) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "tanstack-query:missing-query",
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
          code: "tanstack-query:unsupported-key-expression",
          message: `Resource ${node.name} bound query has no key expression`,
        }),
      );
    }

    if (!queryNode.stable_id) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "tanstack-query:missing-symbol-metadata",
          message: `Resource ${node.name} query lacks symbol metadata for code generation`,
        }),
      );
    }

    const queryKey = collectResourceQueryKey(graph, node.id, queryNode.name);
    return `export const ${node.name} = queryOptions({\n  queryKey: ${queryKeyLiteral(queryKey)},\n  queryFn: () => ${queryNode.name}(),\n});`;
  });

  const resourceAllNodes = graph.nodes.filter((node) => node.kind === "resource_all");
  const resourceAllCode = resourceAllNodes.map((node) => {
    diagnostics.push(
      diagnostic({
        severity: "warning",
        code: "tanstack-query:unsupported-feature",
        message: `TanStack Query target does not yet generate full code for resource_all nodes (${node.name})`,
      }),
    );
    const branchNames = graph.edges
      .filter((edge) => edge.from === node.id && edge.kind === "composes_resource")
      .map((edge) => graph.nodes.find((n) => n.id === edge.to))
      .filter((n): n is NonNullable<typeof n> => n !== undefined)
      .map((n) => n.name);
    return `// TODO: useQueries([${branchNames.join(", ")}]) for ${node.name}`;
  });

  const resourceChainNodes = graph.nodes.filter((node) => node.kind === "resource_chain");
  const resourceChainCode = resourceChainNodes.map((node) => {
    diagnostics.push(
      diagnostic({
        severity: "warning",
        code: "tanstack-query:unsupported-feature",
        message: `TanStack Query target does not yet generate full code for resource_chain nodes (${node.name})`,
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

  const mutationCode = mutationNodes.map((node) => {
    const actionEdge = graph.edges.find((edge) => {
      if (edge.from !== node.id || edge.kind !== "wraps_action") return false;
      return graph.nodes.some((n) => n.id === edge.to && n.kind === "action_function");
    });
    const actionNode = actionEdge
      ? graph.nodes.find((n) => n.id === actionEdge.to && n.kind === "action_function")
      : undefined;

    if (actionNode === undefined) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "tanstack-query:missing-action",
          message: `Mutation ${node.name} has no bound action`,
        }),
      );
      return `// ERROR: Mutation ${node.name} has no bound action`;
    }

    if (!actionNode.stable_id) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "tanstack-query:missing-symbol-metadata",
          message: `Mutation ${node.name} action lacks symbol metadata for code generation`,
        }),
      );
    }

    const invalidationKeys = collectMutationInvalidationKeys(graph, node.id);
    const invalidations = invalidationKeys
      .map((key) => `      queryClient.invalidateQueries({ queryKey: ${queryKeyLiteral([key])} });`)
      .join("\n");
    const onSuccess =
      invalidations.length > 0 ? `\n    onSuccess: () => {\n${invalidations}\n    },` : "";

    return `export const ${node.name} = (queryClient: QueryClient) => ({\n    mutationFn: (input: unknown) => ${actionNode.name}(input),${onSuccess}\n  });`;
  });

  const content = [
    `import { queryOptions, type QueryClient } from "@tanstack/query-core";`,
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
    path: "tanstack-query/reactive.ts",
    content,
    kind: "source",
    language: "typescript",
    diagnostics,
  });

  return { artifacts: [artifact], diagnostics };
};

/**
 * Creates the TanStack Query target plugin.
 */
export const createTanstackQueryTargetPlugin = () =>
  definePlugin({
    id: "tanstack-query",
    namespace: "tanstack-query",
    setup: () => ({
      targets: [
        {
          name: "tanstack-query",
          accepts_inputs: ["reactive_graph"],
          generate: (input) => {
            if (input.kind !== "reactive_graph" || !input.value) {
              return [
                makeArtifact({
                  path: "tanstack-query/error.txt",
                  content: "Invalid input: expected reactive_graph",
                  kind: "source",
                }),
              ];
            }
            const { artifacts } = generateTanstackQueryArtifacts(input.value as ReactiveGraph);
            return artifacts;
          },
        },
      ],
    }),
  });
