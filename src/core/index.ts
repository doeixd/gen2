/**
 * Core kernel public surface. Other modules and downstream packages should import
 * from `../core/index.ts` (or from the package root) — never reach into individual
 * files. The public API is intentionally small.
 */

export * from "./refs.ts";
export * from "./diagnostics.ts";
export * from "./artifacts.ts";
export * from "./target.ts";
export * from "./contract.ts";
export * from "./config.ts";
export * from "./env.ts";
export * from "./plugin.ts";
export * from "./context.ts";
export * from "./entity-to-semantic.ts";
