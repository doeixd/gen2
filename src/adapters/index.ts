/**
 * Adapter targets — concrete implementations of the kernel's TargetContract.
 * Each adapter is a Plugin that registers a Target plus helper(s) under
 * `gen.adapters.<name>` for queueing inputs.
 */

import type { DebugAdapterNamespace } from "./debug.ts";
import type { StandardSchemaAdapterNamespace } from "./standard-schema.ts";
import type { RelationalAdapterNamespace } from "./relational.ts";

export * from "./debug.ts";
export * from "./standard-schema.ts";
export * from "./relational.ts";

/**
 * Built-in adapter namespaces. Users add their own adapter helpers by augmenting
 * `AdaptersNamespace` from their own modules.
 *
 * Note: Adapters are plugin-contributed at runtime via `createGen({ plugins: [...] })`.
 * They are not statically required on `Gen` so that unused adapters do not
 * contribute to the type surface.
 */
export interface AdaptersNamespace {
  readonly debug: DebugAdapterNamespace;
  readonly standardSchema: StandardSchemaAdapterNamespace;
  readonly relational: RelationalAdapterNamespace;
}
