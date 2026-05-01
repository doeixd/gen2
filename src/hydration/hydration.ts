/* @__NO_SIDE_EFFECTS__ */
/**
 * Hydration snapshot planning and cross-boundary transport descriptors.
 *
 * Derives descriptive hydration plans from app-route loaders. Each plan
 * lists the reactive keys and loader identifiers that must be present on
 * the server before the route can be rendered.
 *
 * Also defines explicit transport IR for server/client data movement.
 *
 * This is purely static IR — no runtime serialization logic yet.
 */

import { diagnostic, type Diagnostic, type GenContext, type Artifact } from "../core/index.ts";
import type { AppRoute } from "../router/index.ts";
import type { KeyExpression, ReactiveResource } from "../reactivity/index.ts";
import type { QueryFunction } from "../function/index.ts";
import { makeArtifact } from "../core/index.ts";
import type { Sensitivity } from "../requirements/index.ts";
import { deriveRequirementSatisfactionPlan } from "../requirements/index.ts";
import { defineSerializationContract } from "./projection.ts";
import type { SerializationContract } from "./projection.ts";

// --- Transport IR ----------------------------------------------------------

export type TransportKind = "http_rpc" | "http_form_post" | "websocket" | "server_sent_events";

export interface TransportDescriptor {
  readonly kind: "transport_descriptor";
  readonly transport: TransportKind;
  readonly endpoint_path?: string;
  readonly batchable: boolean;
  readonly streaming: boolean;
}

export const httpRpcTransport = (endpoint_path?: string): TransportDescriptor => ({
  kind: "transport_descriptor",
  transport: "http_rpc",
  endpoint_path,
  batchable: true,
  streaming: false,
});

export const httpFormPostTransport = (endpoint_path?: string): TransportDescriptor => ({
  kind: "transport_descriptor",
  transport: "http_form_post",
  endpoint_path,
  batchable: false,
  streaming: false,
});

export const websocketTransport = (endpoint_path?: string): TransportDescriptor => ({
  kind: "transport_descriptor",
  transport: "websocket",
  endpoint_path,
  batchable: true,
  streaming: true,
});

export const serverSentEventsTransport = (endpoint_path?: string): TransportDescriptor => ({
  kind: "transport_descriptor",
  transport: "server_sent_events",
  endpoint_path,
  batchable: false,
  streaming: true,
});

/** Secure serialization metadata for a hydration snapshot. */
export interface HydrationSecurity {
  readonly signed: boolean;
  readonly encrypted: boolean;
  readonly ttl_seconds?: number;
}

/** A state resource payload that may hydrate across the server-client boundary. */
export interface HydrationStatePayload {
  readonly kind: "hydration_state_payload";
  readonly state_name: string;
  readonly storage_location: string;
  readonly sensitivity?: Sensitivity;
  readonly serialization_contract?: SerializationContract;
}

/** A context payload that may hydrate across the server-client boundary. */
export interface HydrationContextPayload {
  readonly kind: "hydration_context_payload";
  readonly context_name: string;
  readonly provider_name?: string;
  readonly source_kind?: string;
  readonly projection_name?: string;
  readonly serialization_contract?: SerializationContract;
}

/** A provider binding used to satisfy a hydration requirement. */
export interface HydrationProviderBinding {
  readonly kind: "hydration_provider_binding";
  readonly provider_name: string;
  readonly requirement_name: string;
}

/** A descriptive snapshot of what a route needs to hydrate. */
export interface HydrationSnapshot {
  readonly kind: "hydration_snapshot";
  readonly route_path: string;
  /** Reactive keys that the route's loaders read. */
  readonly keys: readonly KeyExpression[];
  /** Loader identifiers (query or resource names) that must be resolved. */
  readonly loaders: readonly string[];
  /** Context requirements that must be satisfied on the server. */
  readonly required_contexts: readonly string[];
  /** Security settings for serializing the snapshot across the boundary. */
  readonly security: HydrationSecurity;
  /** State resources marked for hydration. */
  readonly state_payloads: readonly HydrationStatePayload[];
  /** Context payloads that can safely hydrate. */
  readonly context_payloads: readonly HydrationContextPayload[];
  /** Provider bindings used for hydration. */
  readonly provider_bindings: readonly HydrationProviderBinding[];
  /** Hydration-specific diagnostics. */
  readonly diagnostics: readonly Diagnostic[];
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

const isSensitive = (sensitivity: Sensitivity | undefined): boolean =>
  sensitivity === "auth" ||
  sensitivity === "secret" ||
  sensitivity === "server_only" ||
  sensitivity === "regulated";

const nonHydratableSourceKinds: readonly string[] = [
  "env_var",
  "service_constructor",
  "opaque_runtime",
];

/**
 * Derives a hydration snapshot for an app route by inspecting its loaders,
 * state resources, context requirements, and provider bindings.
 *
 * @param ctx - The GenContext.
 * @param route - The app route to plan hydration for.
 * @returns A descriptive hydration snapshot with diagnostics.
 */
export const deriveHydrationPlan = (ctx: GenContext, route: AppRoute): HydrationSnapshot => {
  const keys: KeyExpression[] = [];
  const loaders: string[] = [];

  for (const loader of route.loaders) {
    loaders.push(loaderName(loader));
    const key = loaderKey(loader);
    if (key !== undefined) {
      keys.push(key);
    }
  }

  // Gather required contexts from the route or global context requirements
  const requiredContexts = new Set<string>();
  for (const req of ctx.context_requirements) {
    requiredContexts.add(req.context.name);
  }

  const plan = deriveRequirementSatisfactionPlan(ctx);
  const diagnostics: Diagnostic[] = [];
  const statePayloads: HydrationStatePayload[] = [];
  const contextPayloads: HydrationContextPayload[] = [];
  const providerBindings: HydrationProviderBinding[] = [];

  // Derive state resource payloads
  for (const state of ctx.state_resources) {
    if (!state.hydrate) continue;

    if (isSensitive(state.sensitivity)) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "hydration:secret-excluded",
          message: `State resource "${state.name}" is marked for hydration but has ${state.sensitivity} sensitivity`,
          suggestion: "Remove hydrate flag or use a safe projection.",
        }),
      );
      continue;
    }

    if (state.readable_by === "server") {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "hydration:server-only-excluded",
          message: `State resource "${state.name}" is server-only but marked for hydration`,
          suggestion: "Change readable_by to shared or client, or remove hydrate flag.",
        }),
      );
      continue;
    }

    const inherentlySerializable: readonly string[] = [
      "string",
      "numeric",
      "boolean",
      "datetime",
      "date",
      "uuid",
      "json",
      "enum",
      "tagged",
      "struct",
      "array",
      "map",
      "timestamp",
      "duration",
    ];
    if (
      !state.value_type.has_serializer &&
      !inherentlySerializable.includes(state.value_type.kind)
    ) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "placement:nonserializable-hydration",
          message: `State resource "${state.name}" is marked for hydration but its type "${state.value_type.name}" has no serializer`,
          suggestion: "Add a serializer to the type or exclude it from hydration.",
        }),
      );
      continue;
    }

    statePayloads.push({
      kind: "hydration_state_payload",
      state_name: state.name,
      storage_location: state.storage.name,
      sensitivity: state.sensitivity,
      serialization_contract: defineSerializationContract({
        value_type: state.value_type,
        validation: "lenient",
      }),
    });
  }

  // Derive context payloads and provider bindings from the satisfaction plan
  for (const req of ctx.context_requirements) {
    if (req.optional) continue;

    const binding = plan.bindings.find(
      (b) => b.requirement.kind === "context_def" && b.requirement.name === req.context.name,
    );

    if (!binding) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "hydration:missing-provider",
          message: `Context "${req.context.name}" required for hydration has no provider`,
          suggestion: "Add a provider for this context.",
        }),
      );
      continue;
    }

    const provider = binding.provider;
    const sourceKind = provider.source.kind;

    if (nonHydratableSourceKinds.includes(sourceKind)) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "hydration:non-serializable-source",
          message: `Provider "${provider.name}" for context "${req.context.name}" uses non-hydratable source ${sourceKind}`,
          suggestion: "Use a hydratable source like static_value, cookie, or hydration_snapshot.",
        }),
      );
      continue;
    }

    if (isSensitive(provider.sensitivity)) {
      const projection = provider.client_projection;
      if (projection && !isSensitive(projection.projected_sensitivity)) {
        contextPayloads.push({
          kind: "hydration_context_payload",
          context_name: req.context.name,
          provider_name: provider.name,
          source_kind: sourceKind,
          projection_name: projection.source_name,
          serialization_contract: defineSerializationContract({
            value_type: projection.projected_type,
            validation: "strict",
          }),
        });
        providerBindings.push({
          kind: "hydration_provider_binding",
          provider_name: provider.name,
          requirement_name: req.context.name,
        });
        continue;
      }

      if (projection && isSensitive(projection.projected_sensitivity)) {
        diagnostics.push(
          diagnostic({
            severity: "error",
            code: "hydration:unsafe-projection",
            message: `Provider "${provider.name}" for context "${req.context.name}" has a projection but projected sensitivity ${projection.projected_sensitivity} is still unsafe`,
            suggestion: "Use a less sensitive projection or keep the value server-side.",
          }),
        );
        continue;
      }

      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "hydration:secret-excluded",
          message: `Provider "${provider.name}" for context "${req.context.name}" has ${provider.sensitivity} sensitivity and cannot hydrate`,
          suggestion: "Use a safe projection or reduce sensitivity.",
        }),
      );
      continue;
    }

    contextPayloads.push({
      kind: "hydration_context_payload",
      context_name: req.context.name,
      provider_name: provider.name,
      source_kind: sourceKind,
      serialization_contract: defineSerializationContract({
        value_type: req.context.semantic_type,
        validation: "lenient",
      }),
    });

    providerBindings.push({
      kind: "hydration_provider_binding",
      provider_name: provider.name,
      requirement_name: req.context.name,
    });
  }

  return {
    kind: "hydration_snapshot",
    route_path: route.path,
    keys,
    loaders,
    required_contexts: [...requiredContexts],
    security: {
      signed: true,
      encrypted: false,
      ttl_seconds: 300,
    },
    state_payloads: statePayloads,
    context_payloads: contextPayloads,
    provider_bindings: providerBindings,
    diagnostics,
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
