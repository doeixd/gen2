/**
 * Dialect-level golden test — `dialect.callable` (Quick Win #10).
 *
 * Per PLAN.md §7 quick win #10: every dialect ships small graph
 * fragments and their expected lowered IR. This catches dialect
 * internal regressions that end-to-end artifact tests miss.
 *
 * The MLIR pattern: lock the *expected output* via inline snapshots,
 * so any change to the dialect's node-kinds, edge-kinds, traits, or
 * lowering shape shows up loudly in the diff.
 */

import { expect, test } from "vite-plus/test";
import { CallableDialect } from "../../src/dialects/callable.ts";

test("CallableDialect surface is locked (node kinds, edge kinds, traits)", () => {
  const summary = {
    id: CallableDialect.dialectId.value,
    label: CallableDialect.label,
    nodeKinds: CallableDialect.nodeKinds.map((n) => n.id).sort(),
    edgeKinds: CallableDialect.edgeKinds.map((e) => e.id).sort(),
    traits: CallableDialect.traits.map((t) => t.id).sort(),
    passes: CallableDialect.passes.length,
    lowerings: CallableDialect.lowerings.length,
  };

  expect(summary).toMatchInlineSnapshot(`
    {
      "edgeKinds": [
        "edge.kind.actionWrites",
        "edge.kind.actionWritesField",
        "edge.kind.dispatchHandles",
        "edge.kind.dispatchTriggers",
        "edge.kind.planChainsTo",
        "edge.kind.planFallback",
        "edge.kind.queryReads",
        "edge.kind.workflowContainsStep",
      ],
      "id": "dialect.callable",
      "label": "Callable",
      "lowerings": 0,
      "nodeKinds": [
        "node.kind.action",
        "node.kind.apiRoute",
        "node.kind.crossStorePlanner",
        "node.kind.dispatch",
        "node.kind.exprFunction",
        "node.kind.getter",
        "node.kind.mutator",
        "node.kind.patch",
        "node.kind.plan",
        "node.kind.predicateFunction",
        "node.kind.query",
        "node.kind.queryExpression",
        "node.kind.static",
        "node.kind.workflow",
      ],
      "passes": 0,
      "traits": [
        "trait.callable.batchable",
        "trait.callable.callable",
        "trait.callable.dispatch",
        "trait.callable.effectful",
        "trait.callable.plan",
        "trait.callable.readable",
        "trait.callable.requires",
        "trait.callable.streaming",
        "trait.callable.workflow",
        "trait.callable.writable",
      ],
    }
  `);
});

test("CallableDialect query and action edge endpoints are locked", () => {
  const queryReads = CallableDialect.edgeKinds.find((e) => e.id === "edge.kind.queryReads");
  const actionWrites = CallableDialect.edgeKinds.find((e) => e.id === "edge.kind.actionWrites");

  expect(
    queryReads?.endpoints.map((e) => ({
      name: e.name,
      targetKinds: (e.target as { targetKinds?: readonly { id: string }[] }).targetKinds?.map(
        (k) => k.id,
      ),
    })),
  ).toMatchInlineSnapshot(`
      [
        {
          "name": "query",
          "targetKinds": [
            "node.kind.query",
          ],
        },
        {
          "name": "read",
          "targetKinds": undefined,
        },
      ]
    `);

  expect(
    actionWrites?.endpoints.map((e) => ({
      name: e.name,
      targetKinds: (e.target as { targetKinds?: readonly { id: string }[] }).targetKinds?.map(
        (k) => k.id,
      ),
    })),
  ).toMatchInlineSnapshot(`
    [
      {
        "name": "action",
        "targetKinds": [
          "node.kind.action",
        ],
      },
      {
        "name": "write",
        "targetKinds": undefined,
      },
    ]
  `);
});
