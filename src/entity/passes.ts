import { checkEntityInvariants, checkRefsExist } from "./entity.ts";
import { getEntitiesFromGraph } from "./kernel.ts";
import { getRefsFromGraph } from "../core/refs.ts";
import {
  BUILT_IN_PASSES,
  defineDiagnostic,
  type KernelGraph,
  type PassContext,
} from "../kernel/index.ts";
import type { GenContext } from "../core/index.ts";

export const registerEntityPasses = (ctx: GenContext): void => {
  if (!ctx.passRegistry.has(BUILT_IN_PASSES.VERIFY_SYMBOLS.REF)) {
    ctx.passRegistry.register(
      { name: BUILT_IN_PASSES.VERIFY_SYMBOLS.REF, phase: "verify-symbols" },
      (graph: KernelGraph, _passCtx: PassContext) => {
        const diagnostics = checkRefsExist(
          getRefsFromGraph(graph),
          getEntitiesFromGraph(graph),
        ).map((d) =>
          defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
        );
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics,
        };
      },
    );
  }

  if (!ctx.passRegistry.has(BUILT_IN_PASSES.VERIFY_SYMBOLS.ENTITY)) {
    ctx.passRegistry.register(
      { name: BUILT_IN_PASSES.VERIFY_SYMBOLS.ENTITY, phase: "verify-symbols" },
      (graph: KernelGraph, _passCtx: PassContext) => {
        const diagnostics = checkEntityInvariants(getEntitiesFromGraph(graph)).map((d) =>
          defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
        );
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics,
        };
      },
    );
  }
};
