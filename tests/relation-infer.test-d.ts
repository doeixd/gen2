/**
 * Type-level tests for InferRelationFrom and InferRelationTo.
 */
import { defineEntity } from "../src/entity/index.ts";
import {
  defineRelation,
  type InferRelationFrom,
  type InferRelationTo,
} from "../src/relation/index.ts";
import { int as intType, string as stringType, uuid as uuidType } from "../src/types/index.ts";

const User = defineEntity("User", { id: uuidType(), name: stringType() });
const Post = defineEntity("Post", { id: uuidType(), user_id: uuidType(), views: intType() });

const userPosts = defineRelation({
  name: "userPosts",
  kind: "one_to_many",
  from_entity: User,
  to_entity: Post,
  from_field: User.fields.id,
  to_field: Post.fields.user_id,
});

type FromTs = InferRelationFrom<typeof userPosts>;
type ToTs = InferRelationTo<typeof userPosts>;

const fromVal: FromTs = "u_1";
void fromVal;
const toVal: ToTs = "u_1";
void toVal;

// @ts-expect-error — relation From is string, not number
const badFrom: FromTs = 1;
void badFrom;
// @ts-expect-error — relation To is string, not number
const badTo: ToTs = 1;
void badTo;
