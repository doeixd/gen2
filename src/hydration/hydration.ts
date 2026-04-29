/* @__NO_SIDE_EFFECTS__ */
/**
 * Hydration snapshot planning.
 *
 * Derives descriptive hydration plans from app-route loaders. Each plan
 * lists the reactive keys and loader identifiers that must be present on
 * the server before the route can be rendered.
 *
 * This is purely static IR — no runtime serialization logic yet.
 */

import type { GenContext, Artifact } from "../core/index.ts";
import type { AppRoute } from "../router/index.ts";
import type { KeyExpression, ReactiveResource } from "../reactivity/index.ts";
import type { QueryFunction } from "../function/index.ts";
import { makeArtifact } from "../core/index.ts";

/** A descriptive snapshot of what a route needs to hydrate. */
export interface HydrationSnapshot {
  readonly kind: "hydration_snapshot";
  readonly route_path: string;
  /** Reactive keys that the route's loaders read. */
  readonly keys: readonly KeyExpression[];
  /** Loader identifiers (query or resource names) that must be resolved. */
  readonly loaders: readonly string[];
}

const isReactiveResource = (value: unknown): value is ReactiveResource =>
  typeof value === "object" &&
  value !== null &&
  "kind" in value &&
  (value as { kind: unknown }).kind === "reactive_resource";

const loaderKey = (loader: QueryFunction | ReactiveResource): KeyExpression | undefined => {
  if (isReactiveResource(loader)) {
    return loader.query.reactivity?.key;
  }
  return loader.reactivity?.key;
};

const loaderName = (loader: QueryFunction | ReactiveResource): string => {
  if (isReactiveResource(loader)) {
    return loader.name;
  }
  return loader.name;
};

/**
 * Derives a hydration snapshot for an app route by inspecting its loaders.
 *
 * @param _ctx - The GenContext (used for lookups in future expansions).
 * @param route - The app route to plan hydration for.
 * @returns A descriptive hydration snapshot.
 */
export const deriveHydrationPlan = (_ctx: GenContext, route: AppRoute): HydrationSnapshot => {
  const keys: KeyExpression[] = [];
  const loaders: string[] = [];

  for (const loader of route.loaders) {
    loaders.push(loaderName(loader));
    const key = loaderKey(loader);
    if (key !== undefined) {
      keys.push(key);
    }
  }

  return {
    kind: "hydration_snapshot",
    route_path: route.path,
    keys,
    loaders,
  };
};

/**
 * Produces a JSON artifact from a hydration snapshot.
 *
 * @param snapshot - The snapshot to serialize.
 * @param path - Optional artifact path override.
 * @returns An artifact record.
 */
export const hydrationSnapshotArtifact = (snapshot: HydrationSnapshot, path?: string): Artifact =>
  makeArtifact({
    path: path ?? `hydration/${snapshot.route_path.replace(/[/]/g, "_").replace(/:/g, "_")}.json`,
    kind: "asset",
    language: "json",
    content: `${JSON.stringify(snapshot, null, 2)}\n`,
  });
