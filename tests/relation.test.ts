/**
 * Tests for relation invariants, including many-to-many link entities,
 * cross-store foreign keys, and nullability constraints on delete actions.
 */
import { expect, test } from "vite-plus/test";
import { createGen, relation } from "../src/index.ts";

test("M2M relations require a backing link entity", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Group = gen.entity("Group", { id: gen.types.uuid() });
  const r = gen.relation({
    name: "membership",
    kind: "many_to_many",
    from_entity: User,
    to_entity: Group,
    from_field: User.fields.id,
    to_field: Group.fields.id,
  });
  const diags = relation.checkRelations([r]);
  expect(diags.some((d) => d.code === "relations:m2m-missing-link")).toBe(true);
});

test("Cross-store database FK is rejected", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() }, { store_name: "primary" });
  const Event = gen.entity("Event", { user_id: gen.types.uuid() }, { store_name: "analytics" });
  const r = gen.relation({
    name: "owner",
    kind: "many_to_one",
    from_entity: Event,
    to_entity: User,
    from_field: Event.fields.user_id,
    to_field: User.fields.id,
    integrity: { kind: "database_foreign_key" },
  });
  const diags = relation.checkRelations([r]);
  expect(diags.some((d) => d.code === "relations:cross-store-fk")).toBe(true);
});

test("setNull on non-nullable field is an error", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", {
    author_id: { type: gen.types.uuid(), nullable: false },
  });
  const r = gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id,
    to_field: User.fields.id,
    foreign_key: { on_delete: "set_null", on_update: "no_action", indexed: true },
  });
  const diags = relation.checkRelations([r]);
  expect(diags.some((d) => d.code === "relations:set-null-non-nullable")).toBe(true);
});
