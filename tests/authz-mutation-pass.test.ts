import { expect, test } from "vite-plus/test";
import { authz, createGen, kernel } from "../src/index.ts";
import { getPoliciesFromGraph, policyToGraphFragment } from "../src/authz/kernel.ts";
import { fieldWrite } from "../src/authz/surface.ts";
import { buildActionInsert } from "../src/function/function.ts";
import { literal } from "../src/expression/builders.ts";
import { check } from "../src/lifecycle/lifecycle.ts";

test("auth policy graph reader recovers typed policy payloads", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  const policy = authz.definePolicy({
    name: "userPolicy",
    target_entity: User,
    surfaces: [{ surface: fieldWrite(User, User.fields.name) }],
  });

  const graph = kernel.graph.pipe(policyToGraphFragment(policy));

  expect(getPoliciesFromGraph(graph)).toEqual([policy]);
});

test("derive.authz.mutationAccess runs graph-native policy diagnostics", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });

  gen.authz.policy({
    name: "userPolicy",
    target_entity: User,
    surfaces: [{ surface: fieldWrite(User, User.fields.name) }],
  });

  gen.func.action({
    name: "createUser",
    input_type: gen.types.string(),
    returns: User,
    body: buildActionInsert(User, [
      [User.fields.name, literal({ kind: "string", string_value: "alice" })],
    ]),
  });

  const result = check(ctx);

  expect(result.diagnostics.some((d) => d.code === "authz:write-policy-needs-before-state")).toBe(
    true,
  );
});
