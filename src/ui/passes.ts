/* @__NO_SIDE_EFFECTS__ */
/**
 * UI-dialect passes (Track E §2 port).
 *
 * `legalize.ui` validates UI legality (views/forms/styles/behaviors/
 * themes/components/platforms). The checker (`checkUi`) takes an
 * options object built from ctx fields; this module wires it into the
 * canonical pass registry so the legacy bridge entry can retire.
 */

import type { GenContext } from "../core/index.ts";
import { type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkUi } from "./ui.ts";

const UI_PASS_NAME = "legalize.ui";

/** Register the UI legalization pass on `ctx.passRegistry`. */
export const registerUiPasses = (ctx: GenContext): void => {
  if (ctx.passRegistry.has(UI_PASS_NAME)) return;
  ctx.passRegistry.register({ name: UI_PASS_NAME, phase: "legalize" }, (): PassResult => {
    const diagnostics = checkUi({
      views: ctx.views,
      forms: ctx.forms,
      styles: ctx.styles,
      behaviors: ctx.behaviors,
      themes: ctx.themes,
      components: ctx.components,
      platforms: ctx.platforms,
    });
    return {
      success: !diagnostics.some((d) => d.severity === "error"),
      diagnostics: diagnostics.map((d) =>
        defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
      ),
    };
  });
};
