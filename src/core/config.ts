/* @__NO_SIDE_EFFECTS__ */
/**
 * Config and DefaultInstance. Apps declare config entries (with optional defaults)
 * and named default instances of entities. The kernel wires these into the
 * GenContext so other modules can reference them as typed handles.
 *
 * See spec/core.allium :: entity Config, entity ConfigEntry, entity DefaultInstance.
 */

import { type Diagnostic, diagnostic } from "./diagnostics.ts";

/** A single configuration entry with an optional default value. */
export interface ConfigEntry {
  readonly name: string;
  readonly entry_type: string;
  readonly default_value?: string;
  readonly expression_default?: string;
  readonly config_reference?: string;
}

/** Aggregated configuration entries for an application. */
export interface Config {
  readonly entries: readonly ConfigEntry[];
}

/** A named default instance of an entity with preset field values. */
export interface DefaultInstance {
  readonly entity_name: string;
  readonly name: string;
  readonly values: ReadonlyMap<string, string>;
}

// --- Constructors ----------------------------------------------------------

/**
 * Creates a ConfigEntry record.
 *
 * @param name - Entry name.
 * @param entry_type - Type name for the entry.
 * @param default_value - Optional string default.
 * @param expression_default - Optional expression-based default.
 * @param config_reference - Optional reference to another config entry.
 * @returns A ConfigEntry record.
 */
export const defineConfigEntry = (
  name: string,
  entry_type: string,
  default_value?: string,
  expression_default?: string,
  config_reference?: string,
): ConfigEntry => ({ name, entry_type, default_value, expression_default, config_reference });

/**
 * Creates a Config record from a list of entries.
 *
 * @param entries - Config entries.
 * @returns A Config record.
 */
export const defineConfig = (entries: readonly ConfigEntry[]): Config => ({ entries });

/**
 * Creates a DefaultInstance record.
 *
 * @param entity_name - The entity this is an instance of.
 * @param name - Instance name.
 * @param values - Map of field names to string values.
 * @returns A DefaultInstance record.
 */
export const defineDefaultInstance = (
  entity_name: string,
  name: string,
  values: ReadonlyMap<string, string>,
): DefaultInstance => ({ entity_name, name, values });

/**
 * Validates config-level invariants.
 *
 * @param config - Config to validate.
 * @returns Diagnostics for duplicate entry names.
 */
export const checkConfig = (config: Config): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const entry of config.entries) {
    if (seen.has(entry.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "core:duplicate-config-entry",
          message: `Config declares duplicate entry ${entry.name}`,
        }),
      );
    }
    seen.add(entry.name);
  }
  return out;
};
