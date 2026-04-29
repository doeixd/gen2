/* @__NO_SIDE_EFFECTS__ */
/**
 * Environment and Secrets Schema. Defines typed environment variables and
 * secrets that operations can require at runtime.
 *
 * See spec.md §29.
 */

export type EnvVarKind = "string" | "url" | "number" | "boolean" | "json";

export interface EnvVariable {
  readonly name: string;
  readonly kind: EnvVarKind;
  readonly server_only: boolean;
  readonly secret: boolean;
  readonly optional: boolean;
}

export interface EnvSchema {
  readonly variables: readonly EnvVariable[];
}

export interface EnvRequirement {
  readonly name: string;
}

// --- Constructors ----------------------------------------------------------

const baseEnvVar = (
  name: string,
  kind: EnvVarKind,
  options: { server_only?: boolean; secret?: boolean; optional?: boolean } = {},
): EnvVariable => ({
  name,
  kind,
  server_only: options.server_only ?? false,
  secret: options.secret ?? false,
  optional: options.optional ?? false,
});

/** Creates a string environment variable. */
export const envString = (
  name: string,
  options?: { secret?: boolean; optional?: boolean },
): EnvVariable => baseEnvVar(name, "string", options);

/** Creates a URL environment variable. */
export const envUrl = (
  name: string,
  options?: { server_only?: boolean; secret?: boolean; optional?: boolean },
): EnvVariable =>
  baseEnvVar(name, "url", { ...options, server_only: options?.server_only ?? true });

/** Creates a numeric environment variable. */
export const envNumber = (name: string, options?: { optional?: boolean }): EnvVariable =>
  baseEnvVar(name, "number", options);

/** Creates a boolean environment variable. */
export const envBoolean = (name: string, options?: { optional?: boolean }): EnvVariable =>
  baseEnvVar(name, "boolean", options);

/** Creates a JSON environment variable. */
export const envJson = (name: string, options?: { optional?: boolean }): EnvVariable =>
  baseEnvVar(name, "json", options);

/**
 * Creates an EnvSchema from a record of environment variables.
 *
 * @param variables - Record of variable names to EnvVariable descriptors.
 * @returns An EnvSchema record.
 */
export const defineEnvSchema = (variables: Record<string, EnvVariable>): EnvSchema => ({
  variables: Object.values(variables),
});

/**
 * Creates an EnvRequirement referencing a variable by name.
 *
 * @param name - The required environment variable name.
 * @returns An EnvRequirement record.
 */
export const envRequires = (name: string): EnvRequirement => ({ name });
