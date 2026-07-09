import { expect, test } from "vite-plus/test";
import { createGen, fn, lifecycle } from "../src/index.ts";

test("canonicalize.actionMerge reports graph-backed reject-conflict writes", () => {
  const { ctx, gen } = createGen();
  const RejectingName = gen.types.withMerge(gen.types.string(), gen.merge.rejectConflict());
  const User = gen.entity("User", { name: RejectingName });

  gen.func.action({
    name: "renameUser",
    input_type: gen.types.string(),
    returns: User,
    body: fn.buildActionUpdate(
      User,
      new Map([
        [
          User.fields.name,
          gen.expr.literal(RejectingName, { kind: "string", string_value: "Ada" }),
        ],
      ]),
    ),
  });

  const result = lifecycle.check(ctx);

  expect(result.diagnostics.some((d) => d.code === "merge:reject-conflict-write")).toBe(true);
});
