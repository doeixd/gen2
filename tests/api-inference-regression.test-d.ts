import { describe, expectTypeOf, test } from "vite-plus/test";
import {
  defineEntity,
  defineEntityUsingSemanticTypes,
  type InferEntity,
  type InferFieldName,
  type InferFieldOwner,
} from "../src/entity/index.ts";
import { allowOwner, allowOwnerFor, definePolicy } from "../src/authz/index.ts";
import { fieldRefFor, exprFor } from "../src/expression/index.ts";
import {
  buildActionInsert,
  defineActionFunction,
  errorConflict,
  type InferActionErrors,
  type InferActionOutput,
} from "../src/function/index.ts";
import type { Expr } from "../src/expression/index.ts";
import { fieldOverrideFor } from "../src/editor/index.ts";
import { formFieldFor } from "../src/forms/index.ts";
import { cursorPaginationFor, listColumnFor } from "../src/list/index.ts";
import { oneToOne } from "../src/relation/index.ts";
import { rule, ruleField } from "../src/rules/index.ts";
import {
  buildColumnSource,
  defineMapping,
  defineProjection,
  fieldMapping,
} from "../src/storage/index.ts";
import { string as stringType, uuid as uuidType } from "../src/types/index.ts";

describe("public API inference regressions", () => {
  test("semantic type registry entity factory preserves field literals", () => {
    const entity = defineEntityUsingSemanticTypes({
      uuid: uuidType,
      string: stringType,
    });
    const User = entity("User", ({ uuid, string }) => ({
      id: uuid(),
      email: string(),
    }));
    const Curried = entity("Curried")(({ uuid }) => ({
      id: uuid(),
    }));

    expectTypeOf<InferFieldName<typeof User.fields.email>>().toEqualTypeOf<"email">();
    expectTypeOf<InferFieldOwner<typeof Curried.fields.id>>().toEqualTypeOf<typeof Curried>();
  });

  test("entity and field witnesses preserve literal identity", () => {
    const User = defineEntity("User", {
      id: uuidType(),
      email: stringType(),
    });

    expectTypeOf(User.name).toEqualTypeOf<"User">();
    expectTypeOf<InferFieldName<typeof User.fields.email>>().toEqualTypeOf<"email">();
    expectTypeOf<InferFieldOwner<typeof User.fields.email>>().toEqualTypeOf<typeof User>();
  });

  test("entity return witnesses infer action output shape", () => {
    const User = defineEntity("User", {
      id: uuidType(),
      email: stringType(),
    });

    const createUser = defineActionFunction({
      name: "createUser",
      input_type: User,
      returns: User,
      body: buildActionInsert(User, []),
      errors: [errorConflict("user.email_taken")],
    });

    expectTypeOf<InferActionOutput<typeof createUser>>().toEqualTypeOf<InferEntity<typeof User>>();
    expectTypeOf<
      InferActionErrors<typeof createUser>["code"]
    >().toEqualTypeOf<"user.email_taken">();
  });

  test("action value builders reject fields from other entities", () => {
    const User = defineEntity("User", {
      id: uuidType(),
      email: stringType(),
    });
    const Post = defineEntity("Post", {
      id: uuidType(),
      title: stringType(),
    });
    const expr = undefined as unknown as Expr;

    buildActionInsert(User, [[User.fields.email, expr]]);

    // @ts-expect-error Post.title is not owned by User
    buildActionInsert(User, [[Post.fields.title, expr]]);
  });

  test("relation helpers reject fields from unrelated entities", () => {
    const User = defineEntity("User", {
      id: uuidType(),
    });
    const Profile = defineEntity("Profile", {
      id: uuidType(),
      userId: uuidType(),
    });
    const Post = defineEntity("Post", {
      authorId: uuidType(),
    });

    oneToOne(User, Profile, User.fields.id, Profile.fields.userId);

    // @ts-expect-error Post.authorId is not owned by User
    oneToOne(User, Profile, Post.fields.authorId, Profile.fields.userId);
  });

  test("storage projections reject fields outside the mapping entity", () => {
    const User = defineEntity("User", {
      id: uuidType(),
    });
    const Post = defineEntity("Post", {
      id: uuidType(),
    });
    const column = {
      name: "id",
      owning_table: undefined as never,
      physical_type: "uuid",
      semantic_type: uuidType(),
      nullable: false,
    };
    const mapping = defineMapping(User, [
      fieldMapping({ field: User.fields.id, read_source: buildColumnSource(column) }),
    ]);

    defineProjection(mapping, [User.fields.id]);

    // @ts-expect-error Post.id is not part of a User mapping projection
    defineProjection(mapping, [Post.fields.id]);
  });

  test("auth owner conditions are tied to policy target entity", () => {
    const User = defineEntity("User", {
      id: uuidType(),
    });
    const Post = defineEntity("Post", {
      id: uuidType(),
      authorId: uuidType(),
    });

    definePolicy({
      name: "userPolicy",
      target_entity: User,
      actions: [{ action_name: "read", condition: allowOwner(User.fields.id) }],
    });
    allowOwnerFor(User)(User.fields.id);

    // @ts-expect-error Post.authorId is not owned by the User policy target
    definePolicy({
      name: "badUserPolicy",
      target_entity: User,
      actions: [
        {
          action_name: "read",
          condition: allowOwner(Post.fields.authorId),
        },
      ],
    });

    // @ts-expect-error allowOwnerFor(User) only accepts User fields
    allowOwnerFor(User)(Post.fields.authorId);
  });

  test("rule and expression entity contexts reject unrelated fields", () => {
    const User = defineEntity("User", {
      id: uuidType(),
      email: stringType(),
    });
    const Post = defineEntity("Post", {
      id: uuidType(),
      title: stringType(),
    });

    ruleField(User, User.fields.email);
    rule.for(User, (ctx) => rule.eq(ctx.fields.id, ctx.field(User.fields.id)));
    fieldRefFor(User)(User.fields.email);
    exprFor(User, (ctx) => ctx.fields.email);

    // @ts-expect-error Post.title is not owned by User
    ruleField(User, Post.fields.title);

    // @ts-expect-error ctx.field is scoped to User fields
    rule.for(User, (ctx) => ctx.field(Post.fields.title));

    // @ts-expect-error fieldRefFor(User) only accepts User fields
    fieldRefFor(User)(Post.fields.title);

    // @ts-expect-error exprFor(User) exposes a User-scoped field helper
    exprFor(User, (ctx) => ctx.field(Post.fields.title));
  });

  test("ui helper factories are scoped to entity fields", () => {
    const User = defineEntity("User", {
      id: uuidType(),
      email: stringType(),
    });
    const Post = defineEntity("Post", {
      id: uuidType(),
      title: stringType(),
    });

    formFieldFor(User)(User.fields.email);
    fieldOverrideFor(User)(User.fields.email);
    listColumnFor(User)(User.fields.email);
    cursorPaginationFor(User)(User.fields.id, 50);

    // @ts-expect-error formFieldFor(User) only accepts User fields
    formFieldFor(User)(Post.fields.title);

    // @ts-expect-error fieldOverrideFor(User) only accepts User fields
    fieldOverrideFor(User)(Post.fields.title);

    // @ts-expect-error listColumnFor(User) only accepts User fields
    listColumnFor(User)(Post.fields.title);

    // @ts-expect-error cursorPaginationFor(User) only accepts User fields
    cursorPaginationFor(User)(Post.fields.id, 50);
  });
});
