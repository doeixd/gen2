/**
 * Quick Win #11 (PLAN.md §7) — `app.explain` stub.
 *
 * Verifies the basic walk-the-derivation-chain implementation is
 * correct, returns structured steps + a printable trace, and respects
 * `maxDepth`. Future work (Track N) will add per-derivation
 * explainers; this test fixes the foundation.
 */

import { describe, expect, it } from "vite-plus/test";

import {
  createKernelGraph,
  defineEdge,
  defineNode,
  explain,
  explainTrace,
  kernelRef,
  registerEdge,
  registerNode,
} from "../src/kernel/index.ts";
import type { EdgeKind, EndpointRole, NodeKind } from "../src/kernel/index.ts";

const ActionKind = { id: "node.kind.test.action", label: "Action" } satisfies NodeKind;
const FieldKind = { id: "node.kind.test.field", label: "Field" } satisfies NodeKind;
const QueryKind = { id: "node.kind.test.query", label: "Query" } satisfies NodeKind;

const WritesKind = { id: "edge.kind.test.writes", label: "Writes" } satisfies EdgeKind;
const ReadsKind = { id: "edge.kind.test.reads", label: "Reads" } satisfies EdgeKind;

const SourceRole = { id: "edge.role.source", label: "Source" } satisfies EndpointRole;
const TargetRole = { id: "edge.role.target", label: "Target" } satisfies EndpointRole;

const buildSampleGraph = () => {
  const actionRef = kernelRef("node", "node:archiveUser");
  const fieldRef = kernelRef("node", "node:User.archivedAt");
  const queryRef = kernelRef("node", "node:listActiveUsers");

  const action = defineNode(ActionKind, actionRef.id, { name: "archiveUser" });
  const field = defineNode(FieldKind, fieldRef.id, { name: "User.archivedAt" });
  const query = defineNode(QueryKind, queryRef.id, { name: "listActiveUsers" });

  const writes = defineEdge(WritesKind, "edge:writes:1", [
    { role: SourceRole, target: actionRef },
    { role: TargetRole, target: fieldRef },
  ]);
  const reads = defineEdge(ReadsKind, "edge:reads:1", [
    { role: SourceRole, target: queryRef },
    { role: TargetRole, target: fieldRef },
  ]);

  let g = createKernelGraph();
  g = registerNode(g, action);
  g = registerNode(g, field);
  g = registerNode(g, query);
  g = registerEdge(g, writes);
  g = registerEdge(g, reads);

  return { graph: g, action, field, query, actionRef, fieldRef, queryRef };
};

describe("kernel/explain.ts — derivation chain (Quick Win #11)", () => {
  it("starts the chain at the requested subject", () => {
    const { graph, action } = buildSampleGraph();
    const result = explain(graph, action.id);

    expect(result.subjectId).toBe(action.id);
    expect(result.subjectName).toBe("archiveUser");
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps[0]?.depth).toBe(0);
    expect(result.steps[0]?.nodeId).toBe(action.id);
  });

  it("reaches transitively connected nodes (action → field → query)", () => {
    const { graph, action, field, query } = buildSampleGraph();
    const result = explain(graph, action.id);

    const reachedIds = result.steps.map((s) => s.nodeId);
    expect(reachedIds).toContain(action.id);
    expect(reachedIds).toContain(field.id);
    expect(reachedIds).toContain(query.id);
  });

  it("respects maxDepth (depth 1 stops at the field)", () => {
    const { graph, action, field, query } = buildSampleGraph();
    const result = explain(graph, action.id, { maxDepth: 1 });

    const reachedIds = result.steps.map((s) => s.nodeId);
    expect(reachedIds).toContain(action.id);
    expect(reachedIds).toContain(field.id);
    expect(reachedIds).not.toContain(query.id);
  });

  it("annotates non-root steps with the edge kind that reached them", () => {
    const { graph, action } = buildSampleGraph();
    const result = explain(graph, action.id);

    const fieldStep = result.steps.find((s) => s.nodeName === "User.archivedAt");
    expect(fieldStep).toBeDefined();
    expect(fieldStep?.viaEdgeKind).toBe(WritesKind.id);
    expect(fieldStep?.depth).toBe(1);
  });

  it("produces a multi-line printable trace", () => {
    const { graph, action } = buildSampleGraph();
    const trace = explainTrace(graph, action.id);

    expect(typeof trace).toBe("string");
    const lines = trace.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // Root step uses the "■" marker; later steps use "↳".
    expect(lines[0]).toContain("■");
    expect(lines.slice(1).some((l) => l.includes("↳"))).toBe(true);
  });

  it("accepts both a string id and a {id} object as the subject", () => {
    const { graph, action } = buildSampleGraph();
    const fromString = explain(graph, action.id);
    const fromRef = explain(graph, { id: action.id });
    expect(fromString.steps).toEqual(fromRef.steps);
  });
});
