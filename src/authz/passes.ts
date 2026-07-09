import type { GenContext } from "../core/index.ts";
import { BUILT_IN_PASSES, type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkAuthzOnGraph } from "./checks-kernel.ts";
import { checkMutationAccessPlansOnGraph } from "./mutation-plan.ts";

const MUTATION_ACCESS_PASS_NAME = "derive.authz.mutationAccess";
const AUTH_GUARDS_PASS_NAME = BUILT_IN_PASSES.DERIVE.AUTH_GUARDS;

export const registerAuthzPasses = (ctx: GenContext): void => {
  if (!ctx.passRegistry.has(AUTH_GUARDS_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: AUTH_GUARDS_PASS_NAME, phase: "derive" },
      (graph): PassResult => {
        const diagnostics = checkAuthzOnGraph({
          graph,
          translations: [],
          exposures: [],
        });
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }

  if (ctx.passRegistry.has(MUTATION_ACCESS_PASS_NAME)) return;

  ctx.passRegistry.register(
    { name: MUTATION_ACCESS_PASS_NAME, phase: "derive" },
    (graph): PassResult => {
      const diagnostics = checkMutationAccessPlansOnGraph(graph);
      return {
        success: !diagnostics.some((d) => d.severity === "error"),
        diagnostics: diagnostics.map((d) =>
          defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
        ),
      };
    },
  );
};
