/**
 * Re-exports all authorization-related types, interfaces, and builders from `authz.ts`.
 *
 * This barrel file provides the public API surface for defining policies,
 * authorization conditions, and client exposure rules.
 */
export * from "./authz.ts";
export * from "./surface.ts";
export * from "./placement.ts";
export * from "./mutation-plan.ts";
export * from "./passes.ts";
export * from "./deny.ts";
export * from "./matrix.ts";
export {
  getPoliciesFromGraph,
  policyToKernelNode,
  policyToKernelEdges,
  policyToGraphFragment,
} from "./kernel.ts";
export { checkAuthzOnGraph, authzCheckPass } from "./checks-kernel.ts";
export { authConditionToRuleExpr } from "./expr.ts";
