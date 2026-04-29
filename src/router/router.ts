/* @__NO_SIDE_EFFECTS__ */
/**
 * Typed app routes, distinct from HTTP API routes.
 *
 * App routes declare path params, query params, and hash params as SemanticType
 * schemas. They bind loaders (QueryFunction | ReactiveResource) and actions
 * (ActionFunction | ReactiveMutation) for reactive graph derivation.
 */

import type { SemanticType } from "../types/index.ts";
import type { QueryFunction, ActionFunction } from "../function/index.ts";
import type { ReactiveResource, ReactiveMutation } from "../reactivity/index.ts";
import { diagnostic, type Diagnostic } from "../core/index.ts";

export type AppRouteLoader = QueryFunction | ReactiveResource;
export type AppRouteAction = ActionFunction | ReactiveMutation;

export interface AppRoute<
  PathParams extends Record<string, SemanticType> = Record<string, SemanticType>,
  QueryParams extends Record<string, SemanticType> = Record<string, SemanticType>,
  HashParams extends Record<string, SemanticType> = Record<string, SemanticType>,
> {
  readonly kind: "app_route";
  readonly path: string;
  readonly path_params: PathParams;
  readonly query_params: QueryParams;
  readonly hash_params: HashParams;
  readonly loaders: readonly AppRouteLoader[];
  readonly action?: AppRouteAction;
  readonly error_boundary?: string;
}

export type InferAppRoutePathParams<R> =
  R extends AppRoute<infer P, Record<string, SemanticType>, Record<string, SemanticType>>
    ? { [K in keyof P]: P[K] extends SemanticType<infer T> ? T : never }
    : never;

export type InferAppRouteQueryParams<R> =
  R extends AppRoute<Record<string, SemanticType>, infer Q, Record<string, SemanticType>>
    ? { [K in keyof Q]?: Q[K] extends SemanticType<infer T> ? T : never }
    : never;

export type InferAppRouteHashParams<R> =
  R extends AppRoute<Record<string, SemanticType>, Record<string, SemanticType>, infer H>
    ? { [K in keyof H]?: H[K] extends SemanticType<infer T> ? T : never }
    : never;

export type InferAppRouteParams<R> = InferAppRoutePathParams<R> &
  InferAppRouteQueryParams<R> &
  InferAppRouteHashParams<R>;

export const parsePathTemplate = (path: string): readonly string[] => {
  const params: string[] = [];
  const parts = path.split("/");
  for (const part of parts) {
    if (part.startsWith(":")) {
      params.push(part.slice(1));
    } else if (part.startsWith("*")) {
      params.push(part.slice(1) || "rest");
    }
  }
  return params;
};

export const defineAppRoute = <
  PathParams extends Record<string, SemanticType> = Record<string, SemanticType>,
  QueryParams extends Record<string, SemanticType> = Record<string, SemanticType>,
  HashParams extends Record<string, SemanticType> = Record<string, SemanticType>,
>(input: {
  readonly path: string;
  readonly path_params?: PathParams;
  readonly query_params?: QueryParams;
  readonly hash_params?: HashParams;
  readonly loaders?: readonly AppRouteLoader[];
  readonly action?: AppRouteAction;
  readonly error_boundary?: string;
}): AppRoute<PathParams, QueryParams, HashParams> => ({
  kind: "app_route",
  path: input.path,
  path_params: (input.path_params ?? {}) as PathParams,
  query_params: (input.query_params ?? {}) as QueryParams,
  hash_params: (input.hash_params ?? {}) as HashParams,
  loaders: input.loaders ?? [],
  action: input.action,
  error_boundary: input.error_boundary,
});

export const checkAppRoute = (route: AppRoute): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const expectedParams = parsePathTemplate(route.path);
  const declaredParams = Object.keys(route.path_params);
  for (const param of expectedParams) {
    if (!declaredParams.includes(param)) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "router:path-param-missing-schema",
          message: `App route "${route.path}" declares path parameter ":${param}" but it is missing from path_params`,
        }),
      );
    }
  }
  for (const param of declaredParams) {
    if (!expectedParams.includes(param)) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "router:path-param-unused-schema",
          message: `App route "${route.path}" declares path_params.${param} but the parameter does not appear in the path template`,
        }),
      );
    }
  }
  return diagnostics;
};

export const appRouteId = (route: AppRoute): string => `app_route:${route.path}`;

/**
 * Build a concrete URL path from an AppRoute and its path parameters.
 * Query and hash parameters are appended as search string and hash.
 *
 * @param route - The AppRoute to navigate to.
 * @param params - Path parameter values required by the route template.
 * @returns A concrete URL string.
 */
export const link = <
  PathParams extends Record<string, SemanticType>,
  QueryParams extends Record<string, SemanticType>,
  HashParams extends Record<string, SemanticType>,
>(
  route: AppRoute<PathParams, QueryParams, HashParams>,
  params: { [K in keyof PathParams]: string | number },
): string => {
  let path = route.path;
  for (const [key, value] of Object.entries(params)) {
    path = path.replaceAll(`:${key}`, String(value));
  }
  return path;
};
