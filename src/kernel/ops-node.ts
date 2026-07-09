/* @__NO_SIDE_EFFECTS__ */
/**
 * Operation → kernel node adapter.
 *
 * Kept separate from `operations.ts` to avoid a circular dependency:
 * `node.ts` → `expr.ts` → `operations.ts` → `node.ts`.
 */

import type { OpSignature } from "./operations.ts";
import { defineNodeFromKind, nodeRef } from "./node.ts";
import { id } from "./id.ts";
import { defineEdgeFromKind } from "./index.ts";
import type { KernelEdge } from "./index.ts";
import {
  HAS_INPUT_TYPE_EDGE_KIND,
  HAS_OUTPUT_TYPE_EDGE_KIND,
  OPERATION_DEF_NODE_KIND,
  TYPE_NODE_KIND,
} from "../dialects/core/type-operation.ts";

const typeOperationId = id.createFactory("core.typeOperation");

/** Convert an operation signature to a kernel node (kind: OPERATION_DEF). */
export const opToKernelNode = (op: OpSignature) =>
  defineNodeFromKind(OPERATION_DEF_NODE_KIND, op.id, {
    name: op.name,
    traits: op.traits ?? [],
    metadata: { title: op.name, description: `Operation: ${op.name} (${op.category})` },
  });

const opNodeRef = (op: OpSignature) =>
  nodeRef(OPERATION_DEF_NODE_KIND, typeOperationId.parse.node(OPERATION_DEF_NODE_KIND, op.id));

const typeRef = (typeId: string) =>
  nodeRef(TYPE_NODE_KIND, typeOperationId.parse.node(TYPE_NODE_KIND, typeId));

/**
 * Build HAS_INPUT_TYPE and HAS_OUTPUT_TYPE edges for an operation.
 *
 * Each argument gets a separate HAS_INPUT_TYPE edge (ordered by position).
 * The output gets a single HAS_OUTPUT_TYPE edge.
 */
export const opToKernelEdges = (op: OpSignature): readonly KernelEdge[] => {
  const edges: KernelEdge[] = [];
  const src = opNodeRef(op);

  for (let i = 0; i < op.args.length; i++) {
    const arg = op.args[i]!;
    edges.push(
      defineEdgeFromKind(
        HAS_INPUT_TYPE_EDGE_KIND,
        `edge:hasInputType:${op.id}:${i}`,
        {
          operation: { target: src, cardinality: "one" },
          input: { target: typeRef(arg.id), cardinality: "one" },
        },
        { metadata: { title: `Arg ${i}: ${arg.kind.label}` } },
      ),
    );
  }

  edges.push(
    defineEdgeFromKind(
      HAS_OUTPUT_TYPE_EDGE_KIND,
      `edge:hasOutputType:${op.id}`,
      {
        operation: { target: src, cardinality: "one" },
        output: { target: typeRef(op.output.id), cardinality: "one" },
      },
      { metadata: { title: `Returns: ${op.output.kind.label}` } },
    ),
  );

  return edges;
};
