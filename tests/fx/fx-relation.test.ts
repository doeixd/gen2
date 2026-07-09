import { expect, test } from "vite-plus/test";
import { Relation } from "../../src/fx/relation.ts";
import { Entity } from "../../src/fx/entity.ts";
import { Types } from "../../src/fx/types.ts";
import { pipe } from "../../src/fx/pipe.ts";

const User = Entity.make("User")({
  id: Types.uuid(),
  name: Types.string(),
});

const Post = Entity.make("Post")({
  id: Types.uuid(),
  authorId: Types.uuid(),
  title: Types.string(),
});

test("Relation.oneToMany creates a one-to-many relation", () => {
  const rel = Relation.oneToMany(User, Post, Post.fields.authorId, User.fields.id);
  expect(rel.kind).toBe("one_to_many");
  expect(rel.from_entity.name).toBe("User");
  expect(rel.to_entity.name).toBe("Post");
});

test("Relation.manyToOne creates a many-to-one relation", () => {
  const rel = Relation.manyToOne(Post, User, Post.fields.authorId, User.fields.id);
  expect(rel.kind).toBe("many_to_one");
  expect(rel.from_entity.name).toBe("Post");
  expect(rel.to_entity.name).toBe("User");
});

test("Relation.withOnDelete sets foreign key via pipe", () => {
  const rel = pipe(
    Relation.oneToMany(User, Post, Post.fields.authorId, User.fields.id),
    Relation.withOnDelete("cascade"),
  );
  expect(rel.foreign_key?.on_delete).toBe("cascade");
});
