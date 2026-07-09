import { expect, test } from "vite-plus/test";
import { Query } from "../../src/fx/query.ts";
import { Entity } from "../../src/fx/entity.ts";
import { Types } from "../../src/fx/types.ts";

const User = Entity.make("User")({
  id: Types.uuid(),
  email: Types.email(),
  name: Types.string(),
});

test("Query.from creates a query builder", () => {
  const q = Query.from(User).build();
  expect(q.source.kind).toBe("entity_source");
  expect(q.source.entity?.name).toBe("User");
});

test("Query.from with select narrows result", () => {
  const q = Query.from(User).select([User.fields.id, User.fields.email]).build();
  expect(q.projection?.fields.length).toBe(2);
});
