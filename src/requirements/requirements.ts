/* @__NO_SIDE_EFFECTS__ */
/**
 * Requirement/provider IR and satisfaction planning.
 */

import type { GenContext, Diagnostic } from "../core/index.ts";
import { diagnostic } from "../core/index.ts";
import type { ContextDef } from "../context/index.ts";
import type { ReactiveResource } from "../reactivity/index.ts";
import type { ServiceRef } from "../services/index.ts";
import type { StateResource } from "../state/index.ts";
import type { StorageLocation } from "../storage/index.ts";
import { isClientReadable, isSensitivePlacementUnsafe } from "../storage/locations.ts";
import type { SemanticType } from "../types/index.ts";
import type { SafeProjection } from "../hydration/index.ts";

export type Sensitivity =
  | "public"
  | "user"
  | "tenant"
  | "auth"
  | "secret"
  | "server_only"
  | "regulated";

export type ProviderLifetime =
  | "global"
  | "app"
  | "request"
  | "session"
  | "tenant"
  | "route"
  | "component"
  | "workflow_run"
  | "job_run"
  | "transaction"
  | "test";

export interface ProviderScope {
  readonly tenant?: string;
  readonly actor?: string;
  readonly route?: string;
  readonly component?: string;
  readonly transaction?: string;
}

export type ProviderSource<Value = unknown> =
  | {
      readonly kind: "static_value";
      readonly value: Value;
      readonly value_type?: SemanticType<Value>;
    }
  | { readonly kind: "env_var"; readonly name: string; readonly value_type?: SemanticType<Value> }
  | {
      readonly kind: "request_header";
      readonly name: string;
      readonly value_type?: SemanticType<Value>;
    }
  | { readonly kind: "cookie"; readonly name: string; readonly value_type?: SemanticType<Value> }
  | {
      readonly kind: "route_param";
      readonly name: string;
      readonly value_type?: SemanticType<Value>;
    }
  | {
      readonly kind: "query_param";
      readonly name: string;
      readonly value_type?: SemanticType<Value>;
    }
  | {
      readonly kind: "hydration_snapshot";
      readonly name: string;
      readonly value_type?: SemanticType<Value>;
    }
  | {
      readonly kind: "client_storage";
      readonly storage: StorageLocation;
      readonly value_type?: SemanticType<Value>;
    }
  | { readonly kind: "state_resource"; readonly state: StateResource<Value, any> }
  | { readonly kind: "reactive_resource"; readonly resource: ReactiveResource<any, any, any> }
  | { readonly kind: "service_constructor"; readonly service: ServiceRef<any> }
  | {
      readonly kind: "opaque_runtime";
      readonly name: string;
      readonly value_type?: SemanticType<Value>;
    };

export interface RequirementRef<Name extends string = string, Value = unknown> {
  readonly kind: "requirement_ref";
  readonly name: Name;
  readonly value_type: SemanticType<Value>;
  readonly sensitivity?: Sensitivity;
  readonly _value?: Value;
}

export type RequirementTarget<Value = unknown> =
  | RequirementRef<string, Value>
  | ContextDef<Value>
  | ServiceRef<any>;

export interface Provider<Name extends string = string, Value = unknown> {
  readonly kind: "provider";
  readonly name: Name;
  readonly provides: RequirementTarget<Value>;
  readonly source: ProviderSource<Value>;
  readonly placement?: StorageLocation;
  readonly storage?: StorageLocation;
  readonly lifetime?: ProviderLifetime;
  readonly scope?: ProviderScope;
  readonly sensitivity?: Sensitivity;
  readonly requires?: readonly RequirementTarget[];
  /** Optional safe projection for cross-boundary hydration. */
  readonly client_projection?: SafeProjection<Value, unknown>;
  readonly _value?: Value;
}

export interface RequirementBinding {
  readonly requirement: RequirementTarget;
  readonly provider: Provider;
  readonly consumer?: unknown;
  readonly placement?: StorageLocation;
  readonly confidence: "exact" | "compatible" | "fallback";
}

export interface RequirementSatisfactionPlan {
  readonly kind: "requirement_satisfaction_plan";
  readonly requirements: readonly RequirementTarget[];
  readonly providers: readonly Provider[];
  readonly bindings: readonly RequirementBinding[];
  readonly missing: readonly RequirementTarget[];
  readonly ambiguous: readonly RequirementTarget[];
  readonly diagnostics: readonly Diagnostic[];
}

export const defineRequirement = <const Name extends string, Value>(input: {
  readonly name: Name;
  readonly value_type: SemanticType<Value>;
  readonly sensitivity?: Sensitivity;
}): RequirementRef<Name, Value> => ({
  kind: "requirement_ref",
  name: input.name,
  value_type: input.value_type,
  sensitivity: input.sensitivity,
});

export const defineProvider = <const Name extends string, Value>(input: {
  readonly name: Name;
  readonly provides: RequirementTarget<Value>;
  readonly source: ProviderSource<Value>;
  readonly placement?: StorageLocation;
  readonly storage?: StorageLocation;
  readonly lifetime?: ProviderLifetime;
  readonly scope?: ProviderScope;
  readonly sensitivity?: Sensitivity;
  readonly requires?: readonly RequirementTarget[];
  readonly client_projection?: SafeProjection<Value, unknown>;
}): Provider<Name, Value> => ({
  kind: "provider",
  name: input.name,
  provides: input.provides,
  source: input.source,
  placement: input.placement,
  storage: input.storage,
  lifetime: input.lifetime,
  scope: input.scope,
  sensitivity: input.sensitivity,
  requires: input.requires,
  client_projection: input.client_projection,
});

export const providerSource = {
  staticValue: <Value>(value: Value, value_type?: SemanticType<Value>): ProviderSource<Value> => ({
    kind: "static_value",
    value,
    value_type,
  }),
  envVar: <Value = string>(
    name: string,
    value_type?: SemanticType<Value>,
  ): ProviderSource<Value> => ({
    kind: "env_var",
    name,
    value_type,
  }),
  requestHeader: <Value = string>(
    name: string,
    value_type?: SemanticType<Value>,
  ): ProviderSource<Value> => ({ kind: "request_header", name, value_type }),
  cookie: <Value = string>(
    name: string,
    value_type?: SemanticType<Value>,
  ): ProviderSource<Value> => ({
    kind: "cookie",
    name,
    value_type,
  }),
  routeParam: <Value = string>(
    name: string,
    value_type?: SemanticType<Value>,
  ): ProviderSource<Value> => ({
    kind: "route_param",
    name,
    value_type,
  }),
  queryParam: <Value = string>(
    name: string,
    value_type?: SemanticType<Value>,
  ): ProviderSource<Value> => ({
    kind: "query_param",
    name,
    value_type,
  }),
  hydrationSnapshot: <Value>(
    name: string,
    value_type?: SemanticType<Value>,
  ): ProviderSource<Value> => ({
    kind: "hydration_snapshot",
    name,
    value_type,
  }),
  clientStorage: <Value>(
    storage: StorageLocation,
    value_type?: SemanticType<Value>,
  ): ProviderSource<Value> => ({
    kind: "client_storage",
    storage,
    value_type,
  }),
  stateResource: <Value>(state: StateResource<Value, any>): ProviderSource<Value> => ({
    kind: "state_resource",
    state,
  }),
  reactiveResource: <Value>(resource: ReactiveResource<any, any, any>): ProviderSource<Value> => ({
    kind: "reactive_resource",
    resource,
  }),
  serviceConstructor: <Value>(service: ServiceRef<any>): ProviderSource<Value> => ({
    kind: "service_constructor",
    service,
  }),
  opaqueRuntime: <Value>(
    name: string,
    value_type?: SemanticType<Value>,
  ): ProviderSource<Value> => ({
    kind: "opaque_runtime",
    name,
    value_type,
  }),
};

const targetName = (target: RequirementTarget): string => target.name;

const sameTarget = (a: RequirementTarget, b: RequirementTarget): boolean =>
  a.kind === b.kind && targetName(a) === targetName(b);

const uniqueTargets = (targets: readonly RequirementTarget[]): RequirementTarget[] => {
  const seen = new Set<string>();
  const out: RequirementTarget[] = [];
  for (const target of targets) {
    const key = `${target.kind}:${targetName(target)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }
  return out;
};

const collectRequirements = (ctx: GenContext): RequirementTarget[] =>
  uniqueTargets([
    ...ctx.requirements,
    ...ctx.context_requirements.filter((r) => !r.optional).map((r) => r.context),
    ...ctx.providers.flatMap((p) => p.requires ?? []),
  ]);

const hasProviderCycle = (provider: Provider, providers: readonly Provider[]): boolean => {
  const visit = (current: Provider, path: ReadonlySet<Provider>): boolean => {
    if (path.has(current)) return true;
    const nextPath = new Set(path).add(current);
    for (const requirement of current.requires ?? []) {
      for (const next of providers.filter((p) => sameTarget(p.provides, requirement))) {
        if (visit(next, nextPath)) return true;
      }
    }
    return false;
  };
  return visit(provider, new Set());
};

const sensitivityOfTarget = (target: RequirementTarget): Sensitivity | undefined =>
  target.kind === "requirement_ref" ? target.sensitivity : undefined;

const providerSensitivity = (provider: Provider): Sensitivity | undefined =>
  provider.sensitivity ?? sensitivityOfTarget(provider.provides);

const isSensitive = (sensitivity: Sensitivity | undefined): boolean =>
  sensitivity === "auth" ||
  sensitivity === "secret" ||
  sensitivity === "server_only" ||
  sensitivity === "regulated";

const storageLocationsForProvider = (provider: Provider): StorageLocation[] => {
  const out: StorageLocation[] = [];
  if (provider.placement) out.push(provider.placement);
  if (provider.storage) out.push(provider.storage);
  if (provider.source.kind === "client_storage") out.push(provider.source.storage);
  if (provider.source.kind === "state_resource") out.push(provider.source.state.storage);
  return out;
};

const sourceLifetimeCeiling = (source: ProviderSource): ProviderLifetime | undefined => {
  switch (source.kind) {
    case "request_header":
      return "request";
    case "route_param":
    case "query_param":
      return "route";
    case "cookie":
      return "session";
    case "hydration_snapshot":
    case "reactive_resource":
      return "component";
    case "client_storage":
      return source.storage.capabilities.persistent ? "app" : "component";
    case "state_resource":
      return (
        source.state.lifetime ??
        (source.state.storage.capabilities.persistent ? "app" : "component")
      );
    case "static_value":
    case "env_var":
    case "service_constructor":
    case "opaque_runtime":
      return undefined;
  }
};

const lifetimeRank: Record<ProviderLifetime, number> = {
  transaction: 1,
  request: 2,
  route: 3,
  component: 4,
  workflow_run: 4,
  job_run: 4,
  session: 5,
  tenant: 6,
  app: 7,
  global: 8,
  test: 8,
};

const checkProviderPlacement = (provider: Provider): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const sensitivity = providerSensitivity(provider);
  const locations = storageLocationsForProvider(provider);

  for (const location of locations) {
    if (isSensitive(sensitivity) && isSensitivePlacementUnsafe(location)) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "placement:secret-client-readable",
          message: `Provider "${provider.name}" exposes ${sensitivity} data through "${location.name}"`,
          suggestion:
            "Move the provider to sensitive-safe server storage or add an explicit safe projection.",
        }),
      );
    }

    if (sensitivity === "server_only" && isClientReadable(location)) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "placement:server-only-client-provider",
          message: `Provider "${provider.name}" places server-only data in client-readable storage "${location.name}"`,
          suggestion: "Keep this provider server-side or expose only a safe projected value.",
        }),
      );
    }
  }

  const ceiling = sourceLifetimeCeiling(provider.source);
  if (
    provider.lifetime !== undefined &&
    ceiling !== undefined &&
    lifetimeRank[provider.lifetime] > lifetimeRank[ceiling]
  ) {
    diagnostics.push(
      diagnostic({
        severity: "error",
        code: "placement:lifetime-escape",
        message: `Provider "${provider.name}" has ${provider.lifetime} lifetime from ${provider.source.kind} source with ${ceiling} lifetime`,
        suggestion:
          "Shorten the provider lifetime or change the source to one with a compatible lifetime.",
      }),
    );
  }

  if (provider.lifetime === "request" && provider.storage?.location_kind === "shared.cache") {
    diagnostics.push(
      diagnostic({
        severity: "warning",
        code: "placement:request-value-global-cache",
        message: `Provider "${provider.name}" has request lifetime but stores in global cache`,
        suggestion: "Use request-scoped storage or extend lifetime to match cache duration.",
      }),
    );
  }

  if (
    provider.sensitivity === "regulated" &&
    provider.storage &&
    isClientReadable(provider.storage)
  ) {
    diagnostics.push(
      diagnostic({
        severity: "error",
        code: "placement:regulated-devtools-exposure",
        message: `Provider "${provider.name}" is regulated but exposed to client-readable storage`,
        suggestion: "Keep regulated data server-side or use a safe projection.",
      }),
    );
  }

  return diagnostics;
};

export const deriveRequirementSatisfactionPlan = (ctx: GenContext): RequirementSatisfactionPlan => {
  const requirements = collectRequirements(ctx);
  const bindings: RequirementBinding[] = [];
  const missing: RequirementTarget[] = [];
  const ambiguous: RequirementTarget[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const requirement of requirements) {
    const matches = ctx.providers.filter((provider) => sameTarget(provider.provides, requirement));
    if (matches.length === 0) {
      missing.push(requirement);
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "requirement:missing-provider",
          message: `Requirement "${targetName(requirement)}" has no matching provider`,
          suggestion: "Add a provider for this requirement or remove the requirement.",
        }),
      );
      continue;
    }
    if (matches.length > 1) {
      ambiguous.push(requirement);
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "requirement:ambiguous-provider",
          message: `Requirement "${targetName(requirement)}" has ${matches.length} matching providers`,
          suggestion: "Constrain provider scope or remove duplicate providers.",
        }),
      );
      continue;
    }
    bindings.push({ requirement, provider: matches[0]!, confidence: "exact" });
  }

  for (const provider of ctx.providers) {
    diagnostics.push(...checkProviderPlacement(provider));

    if (hasProviderCycle(provider, ctx.providers)) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "requirement:provider-cycle",
          message: `Provider "${provider.name}" participates in a provider dependency cycle`,
          suggestion:
            "Break the cycle by introducing an independent provider or narrowing provider requirements.",
        }),
      );
    }
  }

  return {
    kind: "requirement_satisfaction_plan",
    requirements,
    providers: ctx.providers,
    bindings,
    missing,
    ambiguous,
    diagnostics,
  };
};

export const checkRequirements = (ctx: GenContext): readonly Diagnostic[] =>
  deriveRequirementSatisfactionPlan(ctx).diagnostics;
