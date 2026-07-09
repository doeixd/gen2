/* @__NO_SIDE_EFFECTS__ */
/**
 * Relation dialect passes (Track E port, PLAN.md §3).
 *
 * Two graph-native passes ported here away from `legacy-check-bridge.ts`:
 *   - `derive.relation.entityFieldRelationships` — relation integrity,
 *     FK, cardinality, link-entity, inverse checks.
 *   - `derive.relation.entities` — relation-entity name uniqueness and
 *     entity-name collision.
 *
 * Both reads run from the graph alone: `DOMAIN_RELATION` edge payloads
 * carry the typed `DomainRelationEdgeCustom.relation`, and
 * RELATION_ENTITY / ENTITY nodes supply the name surface directly. No
 * `passCtx.options.genContext` reads (PLAN.md §0.5 #8).
 *
 * Pattern mirrors `src/requirements/passes.ts` and `src/rules/passes.ts`.
 */

import type { GenContext } from "../core/index.ts";
import { BUILT_IN_PASSES, type PassResult } from "../kernel/index.ts";
import { defineDiagnostic } from "../kernel/diagnostic.ts";
import { checkRelationsOnGraph, checkRelationEntitiesOnGraph } from "./checks-kernel.ts";

const RELATIONSHIPS_PASS_NAME = BUILT_IN_PASSES.DERIVE.ENTITY_FIELD_RELATIONSHIPS;
const RELATION_ENTITIES_PASS_NAME = "derive.relation.entities";

/** Register the graph-native relation passes on `ctx.passRegistry`. */
export const registerRelationPasses = (ctx: GenContext): void => {
  if (!ctx.passRegistry.has(RELATIONSHIPS_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: RELATIONSHIPS_PASS_NAME, phase: "derive" },
      (graph): PassResult => {
        const diagnostics = checkRelationsOnGraph(graph);
        return {
          success: !diagnostics.some((d) => d.severity === "error"),
          diagnostics: diagnostics.map((d) =>
            defineDiagnostic(d.code, d.severity === "info" ? "info" : d.severity, d.message),
          ),
        };
      },
    );
  }

  if (!ctx.passRegistry.has(RELATION_ENTITIES_PASS_NAME)) {
    ctx.passRegistry.register(
      { name: RELATION_ENTITIES_PASS_NAME, phase: "derive" },
      (graph): PassResult => {
        const diagnostics = checkRelationEntitiesOnGraph(graph);
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
