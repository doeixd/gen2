/* @__NO_SIDE_EFFECTS__ */
/**
 * Client provider/state lowering target.
 *
 * Consumes provider, state, and hydration IR to emit structured client-side
 * runtime wiring artifacts: context hooks, query cache bindings, URL state,
 * and localStorage reads.
 */

import type { GenContext } from "../core/index.ts";

export interface ClientProviderBinding {
  readonly provider_name: string;
  readonly source_kind: string;
  readonly client_code: string;
}

export interface ClientStateBinding {
  readonly state_name: string;
  readonly storage_kind: string;
  readonly client_code: string;
}

export interface ClientProviderArtifact {
  readonly kind: "client_provider_artifact";
  readonly target: "client";
  readonly provider_bindings: readonly ClientProviderBinding[];
  readonly state_bindings: readonly ClientStateBinding[];
  readonly hydration_inputs: readonly string[];
}

export const lowerClientProviders = (ctx: GenContext): ClientProviderArtifact => {
  const provider_bindings: ClientProviderBinding[] = [];
  const state_bindings: ClientStateBinding[] = [];
  const hydration_inputs: string[] = [];

  for (const provider of ctx.providers) {
    const source = provider.source;
    switch (source.kind) {
      case "client_storage":
        provider_bindings.push({
          provider_name: provider.name,
          source_kind: source.kind,
          client_code: `useProvider("${provider.name}", () => readStorage("${source.storage.name}"));`,
        });
        break;
      case "hydration_snapshot":
        provider_bindings.push({
          provider_name: provider.name,
          source_kind: source.kind,
          client_code: `useProvider("${provider.name}", () => hydrationSnapshot["${source.name}"]);`,
        });
        hydration_inputs.push(provider.name);
        break;
      case "reactive_resource":
        provider_bindings.push({
          provider_name: provider.name,
          source_kind: source.kind,
          client_code: `useProvider("${provider.name}", () => useResource("${source.resource.name}"));`,
        });
        break;
    }
  }

  for (const state of ctx.state_resources) {
    const storage = state.storage;
    switch (storage.location_kind) {
      case "client.localStorage":
        state_bindings.push({
          state_name: state.name,
          storage_kind: "localStorage",
          client_code: `useState("${state.name}", () => localStorage.getItem("${state.name}"));`,
        });
        break;
      case "client.sessionStorage":
        state_bindings.push({
          state_name: state.name,
          storage_kind: "sessionStorage",
          client_code: `useState("${state.name}", () => sessionStorage.getItem("${state.name}"));`,
        });
        break;
      case "client.queryCache":
        state_bindings.push({
          state_name: state.name,
          storage_kind: "queryCache",
          client_code: `useState("${state.name}", () => queryClient.getQueryData(["${state.name}"]));`,
        });
        break;
      case "client.memory":
        state_bindings.push({
          state_name: state.name,
          storage_kind: "memory",
          client_code: `useState("${state.name}", () => memoryStore["${state.name}"]);`,
        });
        break;
    }
  }

  return {
    kind: "client_provider_artifact",
    target: "client",
    provider_bindings,
    state_bindings,
    hydration_inputs,
  };
};
