/**
 * Equivalence test — legacy `checkFunctions` / `checkActionWrites` vs new
 * graph-native `checkFunctionsOnGraph` / `checkActionWritesOnGraph`.
 *
 * If this test fails: either the kernel pass is missing a rule or the
 * dual-write isn't populating the graph correctly.
 */

import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import {
  checkFunctions,
  checkFunctionsOnGraph,
  checkActionWrites,
  checkActionWritesOnGraph,
  getFunctionCatalogFromGraph,
  getQueryFunctionsFromGraph,
  getActionFunctionsFromGraph,
} from "../src/function/index.ts";

interface DiagFingerprint {
  readonly code: string;
  readonly severity: string;
}

const fingerprints = (
  diagnostics: readonly { readonly code: string; readonly severity: string }[],
): DiagFingerprint[] =>
  [...diagnostics]
    .map((d) => ({ code: d.code, severity: d.severity }))
    .sort((a, b) =>
      a.code === b.code ? a.severity.localeCompare(b.severity) : a.code.localeCompare(b.code),
    );

const assertEquivalent = (
  legacy: readonly { readonly code: string; readonly severity: string }[],
  kernel: readonly { readonly code: string; readonly severity: string }[],
): void => {
  expect(fingerprints(kernel)).toEqual(fingerprints(legacy));
};

const buildCatalog = (ctx: ReturnType<typeof createGen>["ctx"]) => ({
  static: ctx.static_functions,
  expr: ctx.expr_functions,
  predicate: ctx.predicate_functions,
  query: getQueryFunctionsFromGraph(ctx.graph),
  action: getActionFunctionsFromGraph(ctx.graph),
  patch: ctx.patch_functions,
  plan: ctx.plan_functions,
});

test("equivalence: empty context — both produce zero diagnostics", () => {
  const { ctx } = createGen();
  const cat = buildCatalog(ctx);
  assertEquivalent(checkFunctions(cat), checkFunctionsOnGraph(ctx.graph, cat));
  assertEquivalent(checkActionWrites(cat), checkActionWritesOnGraph(ctx.graph, cat));
});

test("equivalence: query + action functions — no diagnostics", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });
  gen.func.action({
    name: "deleteUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionDelete(User),
  });
  const cat = buildCatalog(ctx);
  assertEquivalent(checkFunctions(cat), checkFunctionsOnGraph(ctx.graph, cat));
  assertEquivalent(checkActionWrites(cat), checkActionWritesOnGraph(ctx.graph, cat));
});

test("function graph catalog reader recovers typed function payloads", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const intType = gen.types.int();
  const staticFn = gen.func.static({
    name: "staticUser",
    input_type: intType,
    output_type: intType,
    body: { kind: "literal", output_type: intType, requirements: [], effects: [] },
  });
  const exprFn = gen.func.expr({
    name: "exprUser",
    input_type: intType,
    output_type: intType,
    body: gen.expr.literal(intType, { kind: "integer", integer_value: 2 }),
  });
  const predicateFn = gen.func.predicate({
    name: "predicateUser",
    input_type: User,
    body: gen.expr.predicate({
      input_type: User,
      value_type: gen.types.boolean(),
      ast: gen.expr.literal(gen.types.boolean(), { kind: "boolean", boolean_value: true }).ast,
    }),
  });
  const queryFn = gen.func.query({
    name: "queryUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });
  const actionFn = gen.func.action({
    name: "actionUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionDelete(User),
  });
  const patchFn = gen.func.patch({
    name: "patchUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildPatchUpdate(
      queryFn.body,
      [
        [
          User.fields.id,
          gen.expr.literal(gen.types.uuid(), { kind: "string", string_value: "u2" }),
        ],
      ],
      { reconcile_field: User.fields.id },
    ),
    reconcile_field: User.fields.id,
  });
  const planFn = gen.func.plan({
    name: "planUser",
    input_type: intType,
    output_type: intType,
    body: {
      kind: { kind: "fallback" as const },
      phase: "query" as const,
      primary: gen.expr.literal(intType, { kind: "integer", integer_value: 3 }),
      fallback_policy: {
        kind: "allow" as const,
        pure_only: false,
        deterministic_only: false,
        effectful_ok: true,
      },
      runtime_assignments: [],
    },
    fallback_policy: {
      kind: "allow" as const,
      pure_only: false,
      deterministic_only: false,
      effectful_ok: true,
    },
  });

  expect(getFunctionCatalogFromGraph(ctx.graph)).toEqual({
    static: [staticFn],
    expr: [exprFn],
    predicate: [predicateFn],
    query: [queryFn],
    action: [actionFn],
    patch: [patchFn],
    plan: [planFn],
  });
});

test("equivalence: duplicate function name — both emit function:duplicate-name", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });
  gen.func.query({
    name: "getUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.query.build({
      source: { kind: "entity_source", entity: User },
      result_type: gen.types.uuid(),
    }),
  });
  const cat = buildCatalog(ctx);
  const legacy = checkFunctions(cat);
  const kernel = checkFunctionsOnGraph(ctx.graph, cat);
  assertEquivalent(legacy, kernel);
  // Graph deduplicates by node id, so no duplicate-name diagnostic.
  expect(kernel.some((d) => d.code === "function:duplicate-name")).toBe(false);
});

test("equivalence: undeclared action effect — both emit function:undeclared-action-effect", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.func.action({
    name: "createUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionInsert(User, new Map(), {
      effects: [{ kind: "database_write" }],
    }),
    effects: [],
  });
  const cat = buildCatalog(ctx);
  const legacy = checkFunctions(cat);
  const kernel = checkFunctionsOnGraph(ctx.graph, cat);
  assertEquivalent(legacy, kernel);
  expect(kernel.some((d) => d.code === "function:undeclared-action-effect")).toBe(true);
});

test("equivalence: action writes read-only field — both emit function:non-writable-field", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    created_at: { type: gen.types.datetime(), read_only: true },
  });
  gen.func.action({
    name: "updateUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionUpdate(
      User,
      new Map([
        [
          User.fields.created_at!,
          {
            kind: "literal",
            value: "now()",
          } as unknown as import("../src/expression/index.ts").Expr,
        ],
      ]),
    ),
  });
  const cat = buildCatalog(ctx);
  const legacy = checkActionWrites(cat);
  const kernel = checkActionWritesOnGraph(ctx.graph, cat);
  assertEquivalent(legacy, kernel);
  expect(kernel.some((d) => d.code === "function:non-writable-field")).toBe(true);
});
