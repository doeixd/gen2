/**
 * Dialect-level golden test — `dialect.reactivity` (Quick Win #10).
 */

import { expect, test } from "vite-plus/test";
import { ReactivityDialect } from "../../src/dialects/reactivity.ts";

test("ReactivityDialect surface is locked", () => {
  const summary = {
    id: ReactivityDialect.dialectId.value,
    label: ReactivityDialect.label,
    nodeKinds: ReactivityDialect.nodeKinds.map((n) => n.id).sort(),
    edgeKinds: ReactivityDialect.edgeKinds.map((e) => e.id).sort(),
    traits: ReactivityDialect.traits.map((t) => t.id).sort(),
    passes: ReactivityDialect.passes.length,
    lowerings: ReactivityDialect.lowerings.length,
  };
  expect(summary).toMatchInlineSnapshot(`
  	{
  	  "edgeKinds": [
  	    "edge.kind.derivesKey",
  	    "edge.kind.invalidatesKey",
  	    "edge.kind.maintainsView",
  	    "edge.kind.patchesResource",
  	    "edge.kind.producesDelta",
  	    "edge.kind.usesCombiner",
  	  ],
  	  "id": "dialect.reactivity",
  	  "label": "Reactivity",
  	  "lowerings": 0,
  	  "nodeKinds": [
  	    "node.kind.ivmPlan",
  	    "node.kind.keyFamily",
  	    "node.kind.materializedView",
  	    "node.kind.offlineQueue",
  	    "node.kind.optimisticPlan",
  	    "node.kind.reactiveMutation",
  	    "node.kind.reactiveResource",
  	  ],
  	  "passes": 0,
  	  "traits": [
  	    "trait.reactivity.derivedKey",
  	    "trait.reactivity.idempotent",
  	    "trait.reactivity.ivm",
  	    "trait.reactivity.offlineReplaySafe",
  	    "trait.reactivity.optimistic",
  	    "trait.reactivity.reactive",
  	  ],
  	}
  `);
});
