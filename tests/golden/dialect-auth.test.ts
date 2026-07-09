/**
 * Dialect-level golden test — `dialect.auth` (Quick Win #10).
 */

import { expect, test } from "vite-plus/test";
import { AuthDialect } from "../../src/dialects/auth.ts";

test("AuthDialect surface is locked", () => {
  const summary = {
    id: AuthDialect.dialectId.value,
    label: AuthDialect.label,
    nodeKinds: AuthDialect.nodeKinds.map((n) => n.id).sort(),
    edgeKinds: AuthDialect.edgeKinds.map((e) => e.id).sort(),
    traits: AuthDialect.traits.map((t) => t.id).sort(),
    passes: AuthDialect.passes.length,
    lowerings: AuthDialect.lowerings.length,
  };
  expect(summary).toMatchInlineSnapshot(`
  	{
  	  "edgeKinds": [
  	    "edge.kind.exposesClientHint",
  	    "edge.kind.guardsAction",
  	    "edge.kind.policyRequiresClaim",
  	    "edge.kind.policyTargetsEntity",
  	    "edge.kind.policyUsesRule",
  	    "edge.kind.requiresServerEnforcement",
  	  ],
  	  "id": "dialect.auth",
  	  "label": "Auth",
  	  "lowerings": 0,
  	  "nodeKinds": [
  	    "node.kind.accessSurface",
  	    "node.kind.policy",
  	  ],
  	  "passes": 0,
  	  "traits": [
  	    "trait.auth.authenticated",
  	    "trait.auth.clientEvaluable",
  	    "trait.auth.ownershipBased",
  	    "trait.auth.public",
  	    "trait.auth.roleBased",
  	    "trait.auth.serverEnforced",
  	    "trait.auth.sqlLowerable",
  	  ],
  	}
  `);
});
