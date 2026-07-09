/**
 * Re-exports all public symbols from the relation module.
 *
 * @module
 */
export * from "./relation.ts";
export { checkRelationsOnGraph, relationCheckPass } from "./checks-kernel.ts";
export {
  relationToKernelEdge,
  relationEntityToKernelNode,
  relationToGraphFragment,
  relationEntityToGraphFragment,
  relationTraits,
} from "./kernel.ts";
