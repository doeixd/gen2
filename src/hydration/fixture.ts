/* @__NO_SIDE_EFFECTS__ */
/**
 * Target fixture generator for bundled fetches.
 *
 * Consumes SingleFlightPlan and HydrationSnapshot IR to emit representative
 * TypeScript artifacts proving imports, payload shape, and cache population
 * boundaries without modifying production targets.
 */

import type { Artifact } from "../core/artifacts.ts";
import { makeArtifact } from "../core/artifacts.ts";
import type { HydrationSnapshot } from "../hydration/hydration.ts";
import type { SingleFlightPlan } from "../reactivity/reactivity.ts";

export interface BundledFetchFixture {
  readonly kind: "bundled_fetch_fixture";
  readonly hydration_snapshots: readonly HydrationSnapshot[];
  readonly single_flight_plan: SingleFlightPlan;
  readonly artifacts: readonly Artifact[];
}

export const generateBundledFetchFixture = (
  snapshots: readonly HydrationSnapshot[],
  plan: SingleFlightPlan,
): BundledFetchFixture => {
  const artifacts: Artifact[] = [];

  // Generate a TypeScript fixture describing bundled queries
  const bundledQueryTypes =
    plan.bundled_queries?.map((bq) => {
      const payloadShape =
        bq.key.kind === "constant_key_expression" && bq.key.payload
          ? JSON.stringify(bq.key.payload)
          : `Record<string, unknown>`;
      return `  { query: "${bq.query.name}"; key: ${payloadShape}; }`;
    }) ?? [];

  const bundledContent = [
    "// Auto-generated bundled fetch fixture",
    "export interface BundledQueries {",
    ...bundledQueryTypes,
    "}",
    "",
    `export const bundledQueryCount = ${plan.bundled_queries?.length ?? 0};`,
    "",
    "export interface MutationRefreshBundle {",
    "  mutation: string;",
    "  loaders: string[];",
    "  responseMappings: { loader: string; path: string[] }[];",
    "}",
    "",
    "export const mutationBundles: MutationRefreshBundle[] = [",
    ...plan.mutations
      .map((m) => {
        const loaders = m.bundles.flatMap((b) => b.loaders.map((l) => l.name));
        const mappings =
          m.response_mappings?.map(
            (rm) =>
              `    { loader: "${rm.loader.name}", path: [${rm.response_path.map((p) => `"${p}"`).join(", ")}] }`,
          ) ?? [];
        return [
          "  {",
          `    mutation: "${m.mutation.name}",`,
          `    loaders: [${loaders.map((l) => `"${l}"`).join(", ")}],`,
          "    responseMappings: [",
          ...mappings,
          "    ],",
          "  },",
        ];
      })
      .flat(),
    "];",
    "",
  ].join("\n");

  artifacts.push(
    makeArtifact({
      path: "fixtures/bundled-queries.ts",
      content: bundledContent,
      kind: "source",
      language: "typescript",
    }),
  );

  // Generate JSON artifacts for hydration snapshots
  for (const snapshot of snapshots) {
    artifacts.push(
      makeArtifact({
        path: `fixtures/hydration-${snapshot.route_path.replace(/[^a-zA-Z0-9]/g, "_")}.json`,
        content: JSON.stringify(snapshot, null, 2),
        kind: "asset",
        language: "json",
      }),
    );
  }

  return {
    kind: "bundled_fetch_fixture",
    hydration_snapshots: snapshots,
    single_flight_plan: plan,
    artifacts,
  };
};
