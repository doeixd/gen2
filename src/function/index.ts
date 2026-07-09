/**
 * Re-exports all function-related types, interfaces, and builders from `function.ts`.
 *
 * This barrel file provides the public API surface for defining and validating
 * functions, including static, expression, predicate, query, action, patch, and
 * plan variants.
 */
export * from "./function.ts";
export {
  staticFunctionToKernelNode,
  exprFunctionToKernelNode,
  predicateFunctionToKernelNode,
  queryFunctionToKernelNode,
  actionFunctionToKernelNode,
  patchFunctionToKernelNode,
  planFunctionToKernelNode,
  staticFunctionToKernelEdges,
  exprFunctionToKernelEdges,
  predicateFunctionToKernelEdges,
  queryFunctionToKernelEdges,
  actionFunctionToKernelEdges,
  queryFunctionToGraphFragment,
  actionFunctionToGraphFragment,
  staticFunctionToGraphFragment,
  exprFunctionToGraphFragment,
  predicateFunctionToGraphFragment,
  patchFunctionToGraphFragment,
  planFunctionToGraphFragment,
  actionFunctionToWriteEdges,
  patchFunctionToKernelEdges,
  planFunctionToKernelEdges,
  getStaticFunctionsFromGraph,
  getExprFunctionsFromGraph,
  getPredicateFunctionsFromGraph,
  getActionFunctionsFromGraph,
  getPatchFunctionsFromGraph,
  getPlanFunctionsFromGraph,
  getQueryFunctionsFromGraph,
  getFunctionCatalogFromGraph,
  findActionFunctionByNameOnGraph,
  findQueryFunctionByNameOnGraph,
} from "./kernel.ts";
export {
  checkFunctionsOnGraph,
  functionCheckPass,
  checkActionWritesOnGraph,
  actionWritesCheckPass,
} from "./checks-kernel.ts";
