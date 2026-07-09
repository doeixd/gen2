import { expect, test } from "vite-plus/test";
import { GenContext } from "../../src/fx/context.ts";
import { Entity } from "../../src/fx/entity.ts";
import { Types } from "../../src/fx/types.ts";

test("GenContext.make creates a builder", () => {
  const builder = GenContext.make();
  expect(builder).toBeDefined();
  expect(typeof builder.entity).toBe("function");
  expect(typeof builder.build).toBe("function");
});

test("GenContext builder accumulates entities and builds", () => {
  const User = Entity.make("User")({ id: Types.uuid(), name: Types.string() });
  const Post = Entity.make("Post")({ id: Types.uuid(), title: Types.string() });

  const result = GenContext.make().entity(User).entity(Post).build();

  expect(result).toBeDefined();
  expect(result.ctx).toBeDefined();
  expect(result.gen).toBeDefined();
});
