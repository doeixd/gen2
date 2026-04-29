/**
 * Tests for the optimistic patch DSL, covering insert, update, and delete
 * patch expressions as well as patch function registration.
 */
import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";

test("buildPatchInsert builds an optimistic insert PatchExpr", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
  });

  const expr = gen.func.buildPatchInsert(q, [
    [
      User.fields.email,
      gen.expr.literal(gen.types.email(), { kind: "string", string_value: "a@b.com" }),
    ],
  ]);

  expect(expr.kind.kind).toBe("optimistic_insert");
  expect(expr.phase).toBe("client");
  expect(expr.target_query).toBe(q);
  expect(expr.patch_items).toHaveLength(1);
  expect(expr.patch_items[0]!.kind).toBe("patch_insert");
  expect(expr.rollback_strategy).toBe("inverse");
});

test("buildPatchUpdate builds an optimistic update PatchExpr", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), age: gen.types.int() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
  });

  const expr = gen.func.buildPatchUpdate(q, [
    [User.fields.age, gen.expr.literal(gen.types.int(), { kind: "integer", integer_value: 30 })],
  ]);

  expect(expr.kind.kind).toBe("optimistic_update");
  expect(expr.phase).toBe("client");
  expect(expr.patch_items[0]!.kind).toBe("patch_update");
  expect(expr.rollback_strategy).toBe("inverse");
});

test("buildPatchDelete builds an optimistic delete PatchExpr", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
  });

  const expr = gen.func.buildPatchDelete(q, { rollback_strategy: "custom", phase: "server" });

  expect(expr.kind.kind).toBe("optimistic_delete");
  expect(expr.phase).toBe("server");
  expect(expr.patch_items[0]!.kind).toBe("patch_delete");
  expect(expr.rollback_strategy).toBe("custom");
});

test("patch functions accept PatchExpr bodies built with DSL", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
  });

  const patch = gen.func.patch({
    name: "createUserOptimistic",
    input_type: gen.types.object({ email: gen.types.email() }),
    returns: User,
    body: gen.func.buildPatchInsert(q, [
      [
        User.fields.email,
        gen.expr.literal(gen.types.email(), { kind: "string", string_value: "a@b.com" }),
      ],
    ]),
  });

  expect(patch.name).toBe("createUserOptimistic");
  expect(patch.body.kind.kind).toBe("optimistic_insert");
  expect(ctx.patch_functions).toContain(patch);
});
