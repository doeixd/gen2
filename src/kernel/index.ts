/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel - revised core primitives.
 *
 * The tiny kernel that underpins all Gen2 functionality.
 * Models the revised core design from revised-core.md.
 *
 * This is Phase 1 of the staged migration. No existing code is rewritten.
 */

export * from "./id.ts";
export * from "./metadata.ts";
export * from "./trait.ts";
export * from "./type.ts";
export * from "./expr.ts";
export * from "./transform.ts";
export * from "./node.ts";
export * from "./edge.ts";
export * from "./graph.ts";
export * from "./pass.ts";