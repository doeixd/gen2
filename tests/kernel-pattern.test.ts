import { expect, test } from "vite-plus/test";
import { kernel } from "../src/index.ts";
import { ACTION_NODE_KIND, ACTION_WRITES_FIELD_EDGE_KIND } from "../src/dialects/callable.ts";
import { FIELD_NODE_KIND } from "../src/dialects/domain/entity-field-relation.ts";

test("defineGraphPattern materializes node and edge bindings using graph indexes", () => {
  const ids = kernel.id.createFactory("pattern");
  const action = kernel.defineNodeFromKind(
    ACTION_NODE_KIND,
    ids.node(ACTION_NODE_KIND, "archive"),
    {
      name: "archive",
    },
  );
  const field = kernel.defineNodeFromKind(
    FIELD_NODE_KIND,
    ids.node(FIELD_NODE_KIND, "Incident.status"),
    {
      name: "status",
    },
  );
  const writes = kernel
    .edge(ACTION_WRITES_FIELD_EDGE_KIND)
    .from({
      action: ids.nodeRef(ACTION_NODE_KIND, "archive"),
      field: ids.nodeRef(FIELD_NODE_KIND, "Incident.status"),
    })
    .autoId(ids, "archive", "Incident.status")
    .done();
  const graph = kernel.createGraphBuilder().node(action).node(field).edge(writes).done();

  const pattern = kernel.defineGraphPattern({
    nodes: {
      action: ACTION_NODE_KIND,
      field: FIELD_NODE_KIND,
    },
    edges: {
      writes: {
        kind: ACTION_WRITES_FIELD_EDGE_KIND,
        endpoints: { action: "action", field: "field" },
      },
    },
  });

  const matches = pattern.materialize(graph);
  expect(matches).toHaveLength(1);
  expect(matches[0]!.bindings.action.id).toBe(action.id);
  expect(matches[0]!.bindings.field.id).toBe(field.id);
  expect(matches[0]!.bindings.writes.id).toBe(writes.id);
  expect(pattern.first(graph)?.bindings.action.name).toBe("archive");
  expect(pattern.count(graph)).toBe(1);
  expect([...pattern.stream(graph)]).toHaveLength(1);
});
