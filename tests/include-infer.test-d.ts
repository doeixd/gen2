/**
 * Type-level tests for include inference: WithIncludes, IncludeValue, and the
 * cardinality-aware traversal of relations.
 */
import { defineEntity, type InferEntity } from "../src/entity/index.ts";
import {
  manyToMany,
  manyToOne,
  oneToMany,
  oneToOne,
  type IncludeValue,
  type InferRelationFromEntity,
  type InferRelationKind,
  type InferRelationToEntity,
  type WithIncludes,
} from "../src/relation/index.ts";
import { int as intType, string as stringType, uuid as uuidType } from "../src/types/index.ts";

const User = defineEntity("User", {
  id: uuidType(),
  name: stringType(),
});

const Post = defineEntity("Post", {
  id: uuidType(),
  user_id: uuidType(),
  title: stringType(),
  views: intType(),
});

const Tag = defineEntity("Tag", {
  id: uuidType(),
  label: stringType(),
});

const PostTag = defineEntity("PostTag", {
  post_id: uuidType(),
  tag_id: uuidType(),
});

const Profile = defineEntity("Profile", {
  id: uuidType(),
  user_id: uuidType(),
  bio: stringType(),
});

// --- Relation construction carries kind + entity types ---------------------

const userPosts = oneToMany(User, Post, User.fields.id, Post.fields.user_id);
const userProfile = oneToOne(User, Profile, User.fields.id, Profile.fields.user_id);
const postAuthor = manyToOne(Post, User, Post.fields.user_id, User.fields.id);
const postTags = manyToMany(Post, Tag, PostTag.fields.post_id, PostTag.fields.tag_id, PostTag);

// --- InferRelationKind extracts the kind literal ---------------------------

const k1: InferRelationKind<typeof userPosts> = "one_to_many";
void k1;
const k2: InferRelationKind<typeof userProfile> = "one_to_one";
void k2;
const k3: InferRelationKind<typeof postAuthor> = "many_to_one";
void k3;
const k4: InferRelationKind<typeof postTags> = "many_to_many";
void k4;

// @ts-expect-error — userPosts is one_to_many, not one_to_one
const wrongKind: InferRelationKind<typeof userPosts> = "one_to_one";
void wrongKind;

// --- InferRelationFromEntity / ToEntity -----------------------------------

const fromEntity: InferRelationFromEntity<typeof userPosts> = User;
void fromEntity;
const toEntity: InferRelationToEntity<typeof userPosts> = Post;
void toEntity;

// @ts-expect-error — userPosts traverses to Post, not Tag
const wrongTo: InferRelationToEntity<typeof userPosts> = Tag;
void wrongTo;

// --- IncludeValue: cardinality-aware traversal -----------------------------

// one_to_many → array
const postsList: IncludeValue<typeof userPosts> = [
  { id: "p_1", user_id: "u_1", title: "hi", views: 0 },
];
void postsList;

// many_to_many → array
const tagList: IncludeValue<typeof postTags> = [{ id: "t_1", label: "tag" }];
void tagList;

// one_to_one → single
const profile: IncludeValue<typeof userProfile> = {
  id: "pf_1",
  user_id: "u_1",
  bio: "...",
};
void profile;

// many_to_one → single
const author: IncludeValue<typeof postAuthor> = { id: "u_1", name: "alice" };
void author;

const postsAsSingle: IncludeValue<typeof userPosts> = {
  // @ts-expect-error — userPosts is many-cardinality; expects an array
  id: "p_1",
  user_id: "u_1",
  title: "hi",
  views: 0,
};
void postsAsSingle;

// @ts-expect-error — userProfile is one-cardinality; expects a single value
const profileAsArray: IncludeValue<typeof userProfile> = [
  { id: "pf_1", user_id: "u_1", bio: "..." },
];
void profileAsArray;

// --- WithIncludes embeds relations into the entity shape -------------------

type UserWithPosts = WithIncludes<typeof User, { posts: typeof userPosts }>;

const uwp: UserWithPosts = {
  id: "u_1",
  name: "alice",
  posts: [{ id: "p_1", user_id: "u_1", title: "hi", views: 0 }],
};
void uwp;

const uwpBad: UserWithPosts = {
  id: "u_1",
  name: "alice",
  // @ts-expect-error — posts must be an array
  posts: { id: "p_1", user_id: "u_1", title: "hi", views: 0 },
};
void uwpBad;

// Multi-include: profile (single) + posts (array)
type UserWithProfileAndPosts = WithIncludes<
  typeof User,
  { profile: typeof userProfile; posts: typeof userPosts }
>;

const uwpp: UserWithProfileAndPosts = {
  id: "u_1",
  name: "alice",
  profile: { id: "pf_1", user_id: "u_1", bio: "..." },
  posts: [],
};
void uwpp;

const uwppBad: UserWithProfileAndPosts = {
  id: "u_1",
  name: "alice",
  // @ts-expect-error — profile must be a single object, not an array
  profile: [{ id: "pf_1", user_id: "u_1", bio: "..." }],
  posts: [],
};
void uwppBad;

// Underlying entity inference still works
const _userBase: InferEntity<typeof User> = { id: "u_1", name: "alice" };
void _userBase;
