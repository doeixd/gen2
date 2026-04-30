import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import { defineNodeKind, defineLowering, definePlugin } from "../src/core/plugin.ts";
import type { StaticNode } from "../src/core/node.ts";

test("can contribute a node kind and a lowering", () => {
  const myPlugin = definePlugin({
    id: "my-plugin",
    namespace: "my",
    setup: () => {
      const workflowKind = defineNodeKind({
        kind: "workflow",
        traits: [],
        check: () => [],
        deriveGraph: () => undefined,
        interpret: {
          artifact: () => [],
        },
      });

      const workflowToEntityLowering = defineLowering({
        from_kind: "workflow",
        to_kind: "entity",
        lower: (node: StaticNode): StaticNode => node,
      });

      return {
        node_kinds: [workflowKind],
        lowerings: [workflowToEntityLowering],
      };
    },
  });

  const { ctx } = createGen({ plugins: [myPlugin] });

  const contributions = ctx.contributions.get("my-plugin");
  expect(contributions).toBeDefined();
  expect(contributions!.node_kinds).toHaveLength(1);
  expect(contributions!.node_kinds[0]!.kind).toBe("workflow");

  expect(contributions!.lowerings).toHaveLength(1);
  expect(contributions!.lowerings[0]!.from_kind).toBe("workflow");
  expect(contributions!.lowerings[0]!.to_kind).toBe("entity");
});
