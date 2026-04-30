import { expect, test } from "vite-plus/test";
import { core, types } from "../src/index.ts";

test("trait helpers detect present and missing traits", () => {
  const node: core.StaticNode<"demo.workflow"> = {
    kind: "demo.workflow",
    id: core.workflowId("workflow.onboarding"),
    name: "onboarding",
    traits: ["static", "named", "callable", "effectful", "plan"],
  };

  expect(core.hasTrait(node, "callable")).toBe(true);
  expect(core.hasTraits(node, ["callable", "plan"])).toBe(true);
  expect(core.missingTraits(node, ["callable", "readable", "plan"])).toEqual(["readable"]);
});

test("callPlan records typed input and output metadata", () => {
  const input = types.string();
  const output = types.boolean();
  const target = core.makeRef({
    kind: "FunctionRef",
    id: core.functionId("function.canView"),
    owner: { kind: "Function", name: "canView" },
    name: "canView",
    value_type: "function",
  });

  const plan = core.callPlan({ input, output, target });

  expect(plan.kind).toBe("call_plan");
  expect(plan.input).toBe(input);
  expect(plan.output).toBe(output);
  expect(plan.target).toBe(target);
});
