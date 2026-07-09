import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkAppRoute } from "./router.ts";
import { getAppRoutesFromGraph } from "./kernel.ts";

const APP_ROUTES_PASS_NAME = "derive.appRoutes";

export const registerRouterPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(APP_ROUTES_PASS_NAME)) return;

  ctx.passRegistry.register(
    { name: APP_ROUTES_PASS_NAME, phase: "derive" },
    (graph): PassResult => {
      const diagnostics = getAppRoutesFromGraph(graph).flatMap((route) => checkAppRoute(route));
      return {
        success: !diagnostics.some((d) => d.severity === "error"),
        diagnostics: diagnostics.map((d) =>
          defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
        ),
      };
    },
  );
};
