/* @__NO_SIDE_EFFECTS__ */
/**
 * First-class state resource IR for non-query application state.
 */

import type { Diagnostic, GenContext } from "../core/index.ts";
import { diagnostic } from "../core/index.ts";
import type { KeyFamily } from "../reactivity/index.ts";
import type { StorageLocation } from "../storage/index.ts";
import { isClientReadable, isSensitivePlacementUnsafe } from "../storage/locations.ts";
import type { SemanticType } from "../types/index.ts";
import type { Sensitivity, ProviderLifetime } from "../requirements/index.ts";

export type StateAccess = "server" | "client" | "shared";

export interface StateResource<
  Value = unknown,
  KeyPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly kind: "state_resource";
  readonly name: string;
  readonly value_type: SemanticType<Value>;
  readonly key_family?: KeyFamily<KeyPayload>;
  readonly storage: StorageLocation;
  readonly default?: Value;
  readonly readable_by: StateAccess;
  readonly writable_by: StateAccess;
  readonly reactive: boolean;
  readonly sensitivity?: Sensitivity;
  readonly lifetime?: ProviderLifetime;
  /** Whether this state resource should be included in hydration plans. */
  readonly hydrate?: boolean;
  readonly _value?: Value;
  readonly _key?: KeyPayload;
}

export const defineStateResource = <
  Value,
  KeyPayload extends Record<string, unknown> = Record<string, unknown>,
>(input: {
  readonly name: string;
  readonly value_type: SemanticType<Value>;
  readonly key_family?: KeyFamily<KeyPayload>;
  readonly storage: StorageLocation;
  readonly default?: Value;
  readonly readable_by?: StateAccess;
  readonly writable_by?: StateAccess;
  readonly reactive?: boolean;
  readonly sensitivity?: Sensitivity;
  readonly lifetime?: ProviderLifetime;
  readonly hydrate?: boolean;
}): StateResource<Value, KeyPayload> => ({
  kind: "state_resource",
  name: input.name,
  value_type: input.value_type,
  key_family: input.key_family,
  storage: input.storage,
  default: input.default,
  readable_by: input.readable_by ?? "shared",
  writable_by: input.writable_by ?? "shared",
  reactive: input.reactive ?? true,
  sensitivity: input.sensitivity,
  lifetime: input.lifetime,
  hydrate: input.hydrate,
});

const isSensitive = (sensitivity: Sensitivity | undefined): boolean =>
  sensitivity === "auth" ||
  sensitivity === "secret" ||
  sensitivity === "server_only" ||
  sensitivity === "regulated";

export const checkStateResources = (ctx: GenContext): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const state of ctx.state_resources) {
    if (isSensitive(state.sensitivity) && isSensitivePlacementUnsafe(state.storage)) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "state:unsafe-persistence",
          message: `State resource "${state.name}" stores ${state.sensitivity} data in "${state.storage.name}"`,
          suggestion: "Use sensitive-safe server storage or store a safe projection instead.",
        }),
      );
    }

    if (state.sensitivity === "server_only" && isClientReadable(state.storage)) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "state:server-only-client-readable",
          message: `State resource "${state.name}" is server-only but uses client-readable storage "${state.storage.name}"`,
          suggestion:
            "Keep this state server-side or define an explicit client-safe state resource.",
        }),
      );
    }

    if (state.storage.location_kind === "client.queryCache" && !state.key_family) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "state:query-cache-missing-key",
          message: `State resource "${state.name}" uses query cache storage without a key family`,
          suggestion: "Add a key family so query-cache state is addressable.",
        }),
      );
    }
  }

  return diagnostics;
};
