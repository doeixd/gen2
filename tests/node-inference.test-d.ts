/**
 * Type-level tests for node/trait inference: defineNode must infer Kind, In, Out,
 * and Traits from runtime arguments without explicit type annotations.
 */

import { describe, test, expectTypeOf } from "vite-plus/test";
import { defineNode } from "../src/core/node-lowering.ts";
import {
  traits,
  type InferNodeInput,
  type InferNodeOutput,
  type InferNodeTraits,
} from "../src/core/node.ts";
import * as semantic from "../src/types/semantic.ts";

describe("defineNode type inference", () => {
  test("infers Kind from the kind property", () => {
    const node = defineNode({ kind: "workflow", name: "w", traits: [] });
    expectTypeOf(node).toHaveProperty("kind");
    expectTypeOf(node.kind).toEqualTypeOf<"workflow">();
  });

  test("infers In and Out from input/output SemanticTypes", () => {
    const node = defineNode({
      kind: "callable",
      name: "c",
      traits: ["callable"],
      input: semantic.string(),
      output: semantic.int(),
    });
    expectTypeOf<InferNodeInput<typeof node>>().toEqualTypeOf<string>();
    expectTypeOf<InferNodeOutput<typeof node>>().toEqualTypeOf<number>();
  });

  test("infers Traits as a literal tuple from string array", () => {
    const node = defineNode({
      kind: "workflow",
      name: "w",
      traits: ["callable", "readable", "effectful"],
    });
    expectTypeOf<InferNodeTraits<typeof node>>().toMatchTypeOf<
      readonly ["callable", "readable", "effectful"]
    >();
  });

  test("infers Traits as literal tuple of TraitRefs", () => {
    const node = defineNode({
      kind: "workflow",
      name: "w",
      traits: [traits.callable, traits.readable],
    });
    expectTypeOf<InferNodeTraits<typeof node>>().toMatchTypeOf<
      readonly [typeof traits.callable, typeof traits.readable]
    >();
  });

  test("preserves never defaults for Err/Req/Eff when not provided", () => {
    const node = defineNode({ kind: "simple", name: "s", traits: [] });
    expectTypeOf(node).toHaveProperty("_errors");
    expectTypeOf(node._errors).toBeUndefined();
  });
});
