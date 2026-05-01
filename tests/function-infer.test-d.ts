/**
 * Type-level tests for InferFunctionInput / InferFunctionOutput / InferFunctionErrors.
 * Constructed via type-only stubs so we don't need a real Expr body for the
 * inference contract.
 */
import type { InferNodeInput, InferNodeOutput } from "../src/core/index.ts";
import type {
  ExprFunction,
  QueryFunction,
  ActionFunction,
  ErrorType,
  InferFunctionInput,
  InferFunctionOutput,
  InferFunctionErrors,
  InferQueryInput,
  InferQueryOutput,
  InferQueryErrors,
  InferActionInput,
  InferActionOutput,
  InferActionErrors,
} from "../src/function/index.ts";

type StringToNumberExpr = ExprFunction<string, number>;
type ListUsersQuery = QueryFunction<{ q: string }, readonly { id: string }[]>;
type CreateUserAction = ActionFunction<{ name: string }, { id: string }> & {
  errors: readonly [ErrorType & { code: "user.email_taken"; kind: "conflict" }];
};

// Inputs
const exprInput: InferFunctionInput<StringToNumberExpr> = "abc";
void exprInput;

const queryInput: InferFunctionInput<ListUsersQuery> = { q: "alice" };
void queryInput;

const actionInput: InferFunctionInput<CreateUserAction> = { name: "bob" };
void actionInput;

// Outputs
const exprOutput: InferFunctionOutput<StringToNumberExpr> = 42;
void exprOutput;

const queryOutput: InferFunctionOutput<ListUsersQuery> = [{ id: "u_1" }];
void queryOutput;

const actionOutput: InferFunctionOutput<CreateUserAction> = { id: "u_1" };
void actionOutput;

// Errors
const errors: InferFunctionErrors<CreateUserAction>["code"] = "user.email_taken";
void errors;

const specificQueryInput: InferQueryInput<ListUsersQuery> = { q: "alice" };
void specificQueryInput;

const specificQueryOutput: InferQueryOutput<ListUsersQuery> = [{ id: "u_1" }];
void specificQueryOutput;

const specificActionInput: InferActionInput<CreateUserAction> = { name: "bob" };
void specificActionInput;

const specificActionOutput: InferActionOutput<CreateUserAction> = { id: "u_1" };
void specificActionOutput;

const specificQueryError: InferQueryErrors<ListUsersQuery> = undefined as never;
void specificQueryError;

const specificActionError: InferActionErrors<CreateUserAction>["code"] = "user.email_taken";
void specificActionError;

const genericNodeInput: InferNodeInput<ListUsersQuery> = { q: "alice" };
void genericNodeInput;

const genericNodeOutput: InferNodeOutput<CreateUserAction> = { id: "u_1" };
void genericNodeOutput;

// @ts-expect-error — wrong literal for the conflict code
const wrongCode: InferFunctionErrors<CreateUserAction>["code"] = "other";
void wrongCode;

// @ts-expect-error — input must be string, not number
const badExprInput: InferFunctionInput<StringToNumberExpr> = 1;
void badExprInput;

// @ts-expect-error — output must be number, not string
const badExprOutput: InferFunctionOutput<StringToNumberExpr> = "x";
void badExprOutput;

import type { InferRequirements, InferEffects } from "../src/core/node.ts";

declare const AuthReq: { readonly kind: "auth" };
declare const NetworkEff: { readonly kind: "network" };

declare const ReqEffAction: import("../src/function/index.ts").ActionFunction<
  { readonly name: string },
  { readonly id: string },
  never,
  typeof AuthReq,
  typeof NetworkEff
>;

const actionReqs: InferRequirements<typeof ReqEffAction> = { kind: "auth" };
void actionReqs;

const actionEffs: InferEffects<typeof ReqEffAction> = { kind: "network" };
void actionEffs;

import type { ReactiveResource } from "../src/reactivity/index.ts";

declare const ReqEffResource: ReactiveResource<
  { readonly id: string },
  { readonly name: string },
  never,
  typeof AuthReq,
  typeof NetworkEff
>;

const resourceReqs: InferRequirements<typeof ReqEffResource> = { kind: "auth" };
void resourceReqs;

const resourceEffs: InferEffects<typeof ReqEffResource> = { kind: "network" };
void resourceEffs;
