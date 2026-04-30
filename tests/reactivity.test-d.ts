import { createGen, reactivity } from "../src/index.ts";
import type { InferKeyFamilyInput, InferKeyPayload } from "../src/reactivity/index.ts";
import type {
  InferMutationInput,
  InferMutationOutput,
  InferResourceInput,
  InferResourceState,
  InferResourceValue,
} from "../src/reactivity/index.ts";

const UserKey = reactivity.defineKeyFamily<{ readonly id: string; readonly orgId?: string }>(
  "User",
);

reactivity.key(UserKey, { id: "u_1" });
reactivity.matchKey(UserKey, { orgId: "org_1" });

// @ts-expect-error — id must be a string
reactivity.key(UserKey, { id: 1 });

// @ts-expect-error — match payload cannot include unknown fields
reactivity.matchKey(UserKey, { missing: "x" });

type UserPayload = InferKeyPayload<typeof UserKey>;
const payload: UserPayload = { id: "u_1" };
void payload;

// @ts-expect-error — inferred key payload requires id
const missingPayload: UserPayload = {};
void missingPayload;

type UserFamilyInput = InferKeyFamilyInput<typeof UserKey>;
const familyInput: UserFamilyInput = { id: "u_2", orgId: "org_1" };
void familyInput;

const { gen } = createGen();
const AccountKey = gen.key.family<{ readonly accountId: string }>("Account");
gen.key.key(AccountKey, { accountId: "acct_1" });

// @ts-expect-error — gen.key preserves family payload type
gen.key.key(AccountKey, { accountId: 123 });

// --- Schema-driven key family inference ---

const SchemaUserSchema = gen.types.object({ id: gen.types.uuid() });
const SchemaUserKey = gen.key.family("SchemaUser", {
  input: SchemaUserSchema,
  hierarchy: "entity",
});

type SchemaUserPayload = InferKeyFamilyInput<typeof SchemaUserKey>;
const schemaPayload: SchemaUserPayload = { id: "u_1" };
void schemaPayload;

// @ts-expect-error — inferred payload requires id
const badSchemaPayload: SchemaUserPayload = {};
void badSchemaPayload;

// --- Registry inference ---

import type {
  InferReactiveRegistryFamilies,
  InferRegistryFamily,
} from "../src/reactivity/index.ts";

const { gen: gen4 } = createGen();
const RegistryUserKey = gen4.key.family<{ readonly id: string }>("RegistryUser");
const RegistryOrgKey = gen4.key.family<{ readonly slug: string }>("RegistryOrg");
const AppRegistry = gen4.reactivity.registry("app", { user: RegistryUserKey, org: RegistryOrgKey });

type AppFamilies = InferReactiveRegistryFamilies<typeof AppRegistry>;
const _appFamilies: AppFamilies = { user: RegistryUserKey, org: RegistryOrgKey };
void _appFamilies;

type UserFamilyFromRegistry = InferRegistryFamily<typeof AppRegistry, "user">;
const _userFamily: UserFamilyFromRegistry = RegistryUserKey;
void _userFamily;

// @ts-expect-error — "unknown" is not a key in the registry
type BadFamily = InferRegistryFamily<typeof AppRegistry, "unknown">;
// @ts-expect-error — inferred family is never for unknown key
const _badFamily: BadFamily = RegistryUserKey;
void _badFamily;

// --- Action reactivity carries MutationKeyContext ---

import type { MutationKeyContext, KeyPayload } from "../src/reactivity/index.ts";

declare const actionWithResult: import("../src/function/index.ts").ActionFunction<
  { readonly id: string },
  { readonly ok: true }
>;

type ActionInvalidates = NonNullable<typeof actionWithResult.reactivity>["invalidates"];
type ExpectedInvalidates = readonly import("../src/reactivity/index.ts").KeyPatternExpression<
  MutationKeyContext<{ readonly id: string }, { readonly ok: true }>,
  KeyPayload
>[];

const _invalidatesCheck: ActionInvalidates extends ExpectedInvalidates ? true : false = true;
void _invalidatesCheck;

declare const resource: import("../src/reactivity/index.ts").ReactiveResource<
  { readonly id: string },
  { readonly name: string }
>;

const resourceInput: InferResourceInput<typeof resource> = { id: "u_1" };
void resourceInput;

const resourceValue: InferResourceValue<typeof resource> = { name: "Alice" };
void resourceValue;

const resourceState: InferResourceState<typeof resource> = {
  status: "success",
  value: { name: "Alice" },
  stale: false,
};
void resourceState;

// @ts-expect-error — resource input id must be string
const badResourceInput: InferResourceInput<typeof resource> = { id: 1 };
void badResourceInput;

declare const mutation: import("../src/reactivity/index.ts").ReactiveMutation<
  { readonly id: string },
  { readonly ok: true }
>;

const mutationInput: InferMutationInput<typeof mutation> = { id: "u_1" };
void mutationInput;

const mutationOutput: InferMutationOutput<typeof mutation> = { ok: true };
void mutationOutput;

// @ts-expect-error — mutation output literal must be true
const badMutationOutput: InferMutationOutput<typeof mutation> = { ok: false };
void badMutationOutput;

// KeyExpression / KeyPatternExpression wrapper type tests
const UserKeyExpr = reactivity.keyExpr(UserKey);
const UserPatternExpr = reactivity.keyPatternExpr(UserKey, [reactivity.anyKey(UserKey)]);

// Valid construction
void UserKeyExpr;
void UserPatternExpr;

// @ts-expect-error — keyExpr requires a KeyFamily, not a raw string
reactivity.keyExpr("raw");

// @ts-expect-error — keyPatternExpr requires a KeyFamily, not a raw string
reactivity.keyPatternExpr("raw", []);

// @ts-expect-error — keyPatternExpr patterns must belong to the same family
reactivity.keyPatternExpr(UserKey, [reactivity.anyKey(AccountKey)]);

// Query reactivity must use KeyExpression wrapper
const { gen: gen2 } = createGen();
const User2 = gen2.entity("User2", { id: gen2.types.uuid() });
const User2Key = gen2.key.family<{ readonly id: string }>("User2");

// Valid: auto-wrapped legacy key
const q1 = gen2.func.query({
  name: "getUser2",
  input_type: gen2.types.uuid(),
  returns: User2,
  body: gen2.query.build({
    source: { kind: "entity_source", entity: User2 },
    result_type: gen2.types.uuid(),
  }),
  reactivity: { key: User2Key },
});

// Runtime shape is a KeyExpression
const _expr = q1.reactivity!.key;
void _expr;

// --- ResourceAll / ResourceChain type inference ---

import type {
  InferResourceAllBranches,
  InferResourceAllValues,
  InferResourceChainOutput,
  InferResourceChainSourceValue,
  ResourceAll,
  ResourceChain,
  ReactiveResource,
} from "../src/reactivity/index.ts";

declare const userResource: ReactiveResource<{ readonly id: string }, { readonly name: string }>;

declare const postResource: ReactiveResource<
  { readonly postId: string },
  { readonly title: string }
>;

declare const allResource: ResourceAll<{
  readonly user: typeof userResource;
  readonly post: typeof postResource;
}>;

type AllBranches = InferResourceAllBranches<typeof allResource>;
const _allBranches: AllBranches = { user: userResource, post: postResource };
void _allBranches;

type AllValues = InferResourceAllValues<typeof allResource>;
const _allValues: AllValues = { user: { name: "Alice" }, post: { title: "Hello" } };
void _allValues;

const _badAllValues: InferResourceAllValues<typeof allResource> = {
  user: { name: "Alice" },
  // @ts-expect-error — branch values are independent; post title must be string
  post: { title: 123 },
};
void _badAllValues;

declare const chainResource: ResourceChain<
  { readonly id: string },
  { readonly name: string },
  { readonly name: string },
  { readonly bio: string }
>;

type ChainOutput = InferResourceChainOutput<typeof chainResource>;
const _chainOutput: ChainOutput = { bio: "Hello" };
void _chainOutput;

// @ts-expect-error — chain output is the next_resource value, not source value
const _badChainOutput: InferResourceChainOutput<typeof chainResource> = { name: "Alice" };
void _badChainOutput;

type ChainSource = InferResourceChainSourceValue<typeof chainResource>;
const _chainSource: ChainSource = { name: "Alice" };
void _chainSource;

// @ts-expect-error — chain source value is not the output value
const _badChainSource: InferResourceChainSourceValue<typeof chainResource> = { bio: "Hello" };
void _badChainSource;

// --- OptimisticPlan type inference ---

import type { OptimisticPlan } from "../src/reactivity/index.ts";

declare const plan: OptimisticPlan<{ readonly id: string }, { readonly ok: true }>;

const _planApply: typeof plan.apply = {
  kind: { kind: "optimistic_update" },
  phase: "client",
  target_query: {} as import("../src/query/index.ts").QueryExpression,
  patch_items: [],
  rollback_strategy: "inverse",
};
void _planApply;

const _planFallback: typeof plan.fallback = { kind: "server_check", reason: "verify" };
void _planFallback;
