/**
 * Gen2 — Domain Compiler Library
 *
 * This package provides a typed, spec-driven domain model compiler. Users
 * construct entities, types, relations, queries, functions, and UI components
 * through the `gen` namespace, then run `lifecycle.check()` and
 * `lifecycle.generate()` to produce target artifacts (schemas, routes, SDKs,
 * etc.).
 *
 * Quick start:
 * ```ts
 * import { createGen } from "gen2";
 * const { gen, ctx } = createGen();
 * const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
 * lifecycle.check(ctx);
 * ```
 *
 * Every sub-module is also available as a named export for direct imports:
 * ```ts
 * import { entity, storage, lifecycle } from "gen2";
 * ```
 */

export * from "./gen.ts";
export * from "./db/index.ts";
export * from "./adapters/index.ts";
export * as kernel from "./kernel/index.ts";

// Module re-exports for users who want to import directly from a sub-module.
export * as core from "./core/index.ts";
export * as dbPlugin from "./db/index.ts";
export * as types from "./types/index.ts";
export * as entity from "./entity/index.ts";
export * as expression from "./expression/index.ts";
export * as storage from "./storage/index.ts";
export * as relation from "./relation/index.ts";
export * as query from "./query/index.ts";
export * as fn from "./function/index.ts";
export * as api from "./api/index.ts";
export * as ui from "./ui/index.ts";
export * as authz from "./authz/index.ts";
export * as events from "./events/index.ts";
export * as lifecycle from "./lifecycle/index.ts";
export * as editor from "./editor/index.ts";
export * as crud from "./crud/index.ts";
export * as list from "./list/index.ts";
export * as admin from "./admin/index.ts";
export * as reactivity from "./reactivity/index.ts";
export * as router from "./router/index.ts";
export * as hydration from "./hydration/index.ts";
export * as services from "./services/index.ts";
export * as rules from "./rules/index.ts";
export { rule } from "./rules/index.ts";
export * as reaction from "./reaction/index.ts";
export * as plan from "./plan/index.ts";
export * as context from "./context/index.ts";
export * as requirements from "./requirements/index.ts";
export * as state from "./state/index.ts";
