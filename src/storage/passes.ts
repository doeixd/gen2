/* @__NO_SIDE_EFFECTS__ */
/**
 * Storage-dialect passes (Track E §2 port).
 *
 * Three closely-related verify-dialects passes live on the storage
 * domain: invariants over stores, trait checks over mappings, and
 * reversibility checks over mappings. Each reads a single top-level
 * ctx array directly; this module wires all three into the canonical
 * pass registry so the legacy bridge entries can retire.
 */

import type { GenContext } from "../core/index.ts";
import { BUILT_IN_PASSES, type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkStorageInvariants, checkMappings, checkReversibleMappings } from "./storage.ts";

const STORAGE_INVARIANTS_PASS_NAME = "verify-dialects.storageInvariants";
const MAPPINGS_TRAITS_PASS_NAME = BUILT_IN_PASSES.VERIFY_DIALECTS.TRAITS;
const REVERSIBLE_MAPPINGS_PASS_NAME = "verify-dialects.reversibleMappings";

/** Register the storage-related verify-dialects passes on `ctx.passRegistry`. */
export const registerStoragePasses = (ctx: GenContext): void => {
  if (!ctx.passRegistry.has(STORAGE_INVARIANTS_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: STORAGE_INVARIANTS_PASS_NAME, phase: "verify-dialects" },
      (): PassResult => {
        const diagnostics = checkStorageInvariants(ctx.stores);
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }

  if (!ctx.passRegistry.has(MAPPINGS_TRAITS_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: MAPPINGS_TRAITS_PASS_NAME, phase: "verify-dialects" },
      (): PassResult => {
        const diagnostics = checkMappings(ctx.mappings);
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }

  if (!ctx.passRegistry.has(REVERSIBLE_MAPPINGS_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: REVERSIBLE_MAPPINGS_PASS_NAME, phase: "verify-dialects" },
      (): PassResult => {
        const diagnostics = checkReversibleMappings(ctx.mappings);
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }
};
