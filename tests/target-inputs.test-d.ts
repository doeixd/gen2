import { describe, expectTypeOf, test } from "vite-plus/test";
import { core } from "../src/index.ts";

describe("typed target inputs", () => {
  test("input kind helpers preserve kind and payload types", () => {
    type StorePayload = { readonly name: string; readonly dialect: "postgres" };

    const storeInput = core.defineTargetInputKind<"store", StorePayload>("store");
    const input = storeInput.make({
      name: "main",
      value: { name: "main", dialect: "postgres" },
    });

    expectTypeOf(input.kind).toEqualTypeOf<"store">();
    expectTypeOf(input.value).toEqualTypeOf<StorePayload>();
  });

  test("input kind filters narrow target inputs without caller casts", () => {
    type StorePayload = { readonly name: string };

    const storeInput = core.defineTargetInputKind<"store", StorePayload>("store");
    const inputs: readonly core.TargetInputRecord[] = [
      storeInput.make({ name: "main", value: { name: "main" } }),
      core.makeTargetInput({ name: "debug", kind: "debug", value: 1 }),
    ];

    const stores = core.targetInputsOfKind(inputs, storeInput);

    expectTypeOf(stores[0]!.kind).toEqualTypeOf<"store">();
    expectTypeOf(stores[0]!.value).toEqualTypeOf<StorePayload>();
  });
});
