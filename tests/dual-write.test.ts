/**
 * PR 4 — dual-write verification.
 *
 * After `gen.entity(...)` and `gen.relation(...)`, ctx.graph must be
 * populated with the corresponding kernel nodes/edges, while the legacy
 * arrays (ctx.entities, ctx.relations) remain unchanged. The golden
 * lifecycle snapshots in tests/golden/ are the byte-equivalence guard;
 * this file is the positive-presence guard.
 */

import { expect, test } from "vite-plus/test";
import { createGen, kernel } from "../src/index.ts";
import { getQueryFunctionsFromGraph, getActionFunctionsFromGraph } from "../src/function/kernel.ts";
import {
  CONTEXT_NODE_KIND,
  PROVISION_EDGE_KIND,
  REQUIRES_CONTEXT_EDGE_KIND,
} from "../src/dialects/core/context.ts";
import { STORAGE_LOCATION_NODE_KIND } from "../src/dialects/core/placement.ts";
import { REQUIREMENT_NODE_KIND } from "../src/dialects/core/requirement.ts";
import { PROVIDER_NODE_KIND, SATISFIES_EDGE_KIND } from "../src/dialects/core/provider.ts";
import {
  POLICY_TARGETS_ENTITY_EDGE_KIND,
  POLICY_USES_RULE_EDGE_KIND,
} from "../src/dialects/auth.ts";
import {
  RULE_DECLARES_VAR_EDGE_KIND,
  RULE_HAS_BODY_EDGE_KIND,
  RULE_READS_EDGE_KIND,
  EXPRESSION_READS_FIELD_EDGE_KIND,
} from "../src/dialects/core/expr-rule.ts";
import {
  HAS_INPUT_TYPE_EDGE_KIND,
  HAS_OUTPUT_TYPE_EDGE_KIND,
} from "../src/dialects/core/type-operation.ts";
import {
  DOMAIN_RELATION_EDGE_KIND,
  ENTITY_OWNS_FIELD_EDGE_KIND,
  FIELD_HAS_TYPE_EDGE_KIND,
} from "../src/dialects/domain/entity-field-relation.ts";

test("gen.entity dual-writes an entity node + field nodes + owns/hasType edges", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", {
    id: gen.types.uuid(),
    email: gen.types.email(),
  });

  // Legacy array still populated.
  expect(ctx.entities).toHaveLength(1);
  expect(ctx.entities[0]).toBe(User);

  // Kernel graph mirrors the entity.
  const entityNodes = [...ctx.graph.nodes.values()].filter(
    (n) => n.kind === kernel.nodeKinds.ENTITY,
  );
  const fieldNodes = [...ctx.graph.nodes.values()].filter((n) => n.kind === kernel.nodeKinds.FIELD);
  expect(entityNodes).toHaveLength(1);
  expect(entityNodes[0]!.name).toBe("User");
  expect(fieldNodes.map((n) => n.name ?? "").sort((a, b) => a.localeCompare(b))).toEqual([
    "email",
    "id",
  ]);

  const ownsEdges = [...ctx.graph.edges.values()].filter(
    (e) => e.kind.id === ENTITY_OWNS_FIELD_EDGE_KIND.id,
  );
  const hasTypeEdges = [...ctx.graph.edges.values()].filter(
    (e) => e.kind.id === FIELD_HAS_TYPE_EDGE_KIND.id,
  );
  expect(ownsEdges).toHaveLength(2);
  expect(hasTypeEdges).toHaveLength(2);
  expect([...ctx.graph.edges.values()].some((e) => e.kind === kernel.edgeKinds.OWNS)).toBe(false);
  expect([...ctx.graph.edges.values()].some((e) => e.kind === kernel.edgeKinds.HAS_TYPE)).toBe(
    false,
  );
});

test("gen.relation dual-writes a domain-relation edge", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", {
    id: gen.types.uuid(),
    author_id: gen.types.uuid(),
  });
  gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id!,
    to_field: User.fields.id!,
  });

  // Legacy array still populated.
  expect(ctx.relations).toHaveLength(1);

  const relationEdges = [...ctx.graph.edges.values()].filter(
    (e) => e.kind.id === DOMAIN_RELATION_EDGE_KIND.id,
  );
  expect(relationEdges).toHaveLength(1);
  expect(relationEdges[0]!.endpoints).toHaveLength(4);
  expect(
    [...ctx.graph.edges.values()].some((e) => e.kind === kernel.edgeKinds.DOMAIN_RELATION),
  ).toBe(false);
});

test("gen.context dual-writes context nodes and provision/requirement edges", () => {
  const { ctx, gen } = createGen();
  const AuthSession = gen.context.define({
    name: "AuthSession",
    semantic_type: gen.types.object({ userId: gen.types.uuid() }),
  });
  const location = gen.location.serverRequestContext();
  gen.context.provide({ context: AuthSession, from: location });
  gen.context.require({ context: AuthSession });

  expect(ctx.contexts).toHaveLength(1);
  expect(ctx.context_provisions).toHaveLength(1);
  expect(ctx.context_requirements).toHaveLength(1);

  expect(
    [...ctx.graph.nodes.values()].filter((n) => n.kind.id === CONTEXT_NODE_KIND.id),
  ).toHaveLength(1);
  expect(
    [...ctx.graph.nodes.values()].filter((n) => n.kind.id === STORAGE_LOCATION_NODE_KIND.id),
  ).toHaveLength(1);
  expect(
    [...ctx.graph.edges.values()].filter((e) => e.kind.id === PROVISION_EDGE_KIND.id),
  ).toHaveLength(1);
  expect(
    [...ctx.graph.edges.values()].filter((e) => e.kind.id === REQUIRES_CONTEXT_EDGE_KIND.id),
  ).toHaveLength(1);
});

test("gen.requirement/provider dual-writes requirement and provider graph facts", () => {
  const { ctx, gen } = createGen();
  const EmailService = gen.requirement.define({
    name: "EmailService",
    value_type: gen.types.object({ send: gen.types.string() }),
  });
  gen.provider.define({
    name: "smtp",
    provides: EmailService,
    source: gen.provider.source.opaqueRuntime("smtp"),
  });

  expect(ctx.requirements).toHaveLength(1);
  expect(ctx.providers).toHaveLength(1);
  expect(
    [...ctx.graph.nodes.values()].filter((n) => n.kind.id === REQUIREMENT_NODE_KIND.id),
  ).toHaveLength(1);
  expect(
    [...ctx.graph.nodes.values()].filter((n) => n.kind.id === PROVIDER_NODE_KIND.id),
  ).toHaveLength(1);
  expect(
    [...ctx.graph.edges.values()].filter((e) => e.kind.id === SATISFIES_EDGE_KIND.id),
  ).toHaveLength(1);
});

test("gen.rule dual-writes a rule node + reads edges", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.rule.define({
    name: "isSelf",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("actor", gen.types.uuid()),
      gen.rule.field(User, User.fields.id!, gen.types.uuid()),
    ),
  });

  // Kernel graph mirrors the rule (legacy ctx.rules array no longer populated).
  const ruleNodes = [...ctx.graph.nodes.values()].filter((n) => n.kind === kernel.nodeKinds.RULE);
  expect(ruleNodes).toHaveLength(1);
  expect(ruleNodes[0]!.name).toBe("isSelf");

  const readsEdges = [...ctx.graph.edges.values()].filter(
    (e) => e.kind.id === RULE_READS_EDGE_KIND.id,
  );
  // Should read the field and the entity.
  expect(readsEdges.length).toBeGreaterThanOrEqual(1);

  const expressionReadsFieldEdges = [...ctx.graph.edges.values()].filter(
    (e) => e.kind.id === EXPRESSION_READS_FIELD_EDGE_KIND.id,
  );
  expect(expressionReadsFieldEdges.length).toBeGreaterThanOrEqual(1);

  // Aligned with docs/revision/rules.md.txt: rule node carries traits.
  const traitIds = ruleNodes[0]!.traits.map((t) => t.id);
  expect(traitIds).toContain("trait.rule.pure");
  expect(traitIds).toContain("trait.rule.predicate");

  // RuleHasBody edge exists.
  const bodyEdges = [...ctx.graph.edges.values()].filter(
    (e) => e.kind.id === RULE_HAS_BODY_EDGE_KIND.id,
  );
  expect(bodyEdges).toHaveLength(1);

  // R4 — lowered KernelExpr is registered in graph.exprs and HAS_BODY points to it.
  expect(ctx.graph.exprs.size).toBeGreaterThanOrEqual(1);
  const bodyExprId = bodyEdges[0]!.endpoints.find(
    (ep) => ep.role.id === RULE_HAS_BODY_EDGE_KIND.endpoints[1]!.id,
  )?.target?.id;
  expect(bodyExprId).toBeDefined();
  expect(ctx.graph.exprs.has(bodyExprId!)).toBe(true);
  const bodyExpr = ctx.graph.exprs.get(bodyExprId!)!;
  expect(bodyExpr.op).toBe("call");

  // Variable declarations are registered as graph nodes.
  const varNodes = [...ctx.graph.nodes.values()].filter(
    (n) => n.kind === kernel.nodeKinds.VAR_DECL,
  );
  expect(varNodes).toHaveLength(1);
  expect(varNodes[0]!.name).toBe("actor");

  // HAS_VAR edges connect rule to each var-decl.
  const hasVarEdges = [...ctx.graph.edges.values()].filter(
    (e) => e.kind.id === RULE_DECLARES_VAR_EDGE_KIND.id,
  );
  expect(hasVarEdges).toHaveLength(1);

  expect([...ctx.graph.edges.values()].some((e) => e.kind === kernel.edgeKinds.READS)).toBe(false);
  expect([...ctx.graph.edges.values()].some((e) => e.kind === kernel.edgeKinds.HAS_BODY)).toBe(
    false,
  );
  expect([...ctx.graph.edges.values()].some((e) => e.kind === kernel.edgeKinds.HAS_VAR)).toBe(
    false,
  );
  expect(
    [...ctx.graph.edges.values()].some((e) => e.kind === kernel.edgeKinds.EXPR_READS_FIELD),
  ).toBe(false);
});

test("gen.authz.policy dual-writes a policy node + targets/requires edges", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const isSelf = gen.rule.define({
    name: "isSelf",
    vars: [{ name: "actor", semanticType: gen.types.uuid() }],
    when: gen.rule.eq(
      gen.rule.var("actor", gen.types.uuid()),
      gen.rule.field(User, User.fields.id!, gen.types.uuid()),
    ),
  });
  gen.authz.policy({
    name: "userPolicy",
    target_entity: User,
    actions: [{ action_name: "read", condition: gen.authz.allowAuthenticated() }],
    predicate: isSelf,
  });

  // Legacy array still populated.
  expect(ctx.policies).toHaveLength(1);

  // Kernel graph mirrors the policy.
  const policyNodes = [...ctx.graph.nodes.values()].filter(
    (n) => n.kind === kernel.nodeKinds.POLICY,
  );
  expect(policyNodes).toHaveLength(1);
  expect(policyNodes[0]!.name).toBe("userPolicy");

  const targetsEdges = [...ctx.graph.edges.values()].filter(
    (e) => e.kind.id === POLICY_TARGETS_ENTITY_EDGE_KIND.id,
  );
  expect(targetsEdges).toHaveLength(1);

  const requiresEdges = [...ctx.graph.edges.values()].filter(
    (e) => e.kind.id === POLICY_USES_RULE_EDGE_KIND.id,
  );
  expect(requiresEdges).toHaveLength(1);

  expect([...ctx.graph.edges.values()].some((e) => e.kind === kernel.edgeKinds.TARGETS)).toBe(
    false,
  );
  expect([...ctx.graph.edges.values()].some((e) => e.kind === kernel.edgeKinds.REQUIRES)).toBe(
    false,
  );
});

test("gen.func.query dual-writes a query node", () => {
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

  expect(getQueryFunctionsFromGraph(ctx.graph)).toHaveLength(1);

  const queryNodes = [...ctx.graph.nodes.values()].filter((n) => n.kind === kernel.nodeKinds.QUERY);
  expect(queryNodes).toHaveLength(1);
  expect(queryNodes[0]!.name).toBe("getUser");
});

test("gen.func.action dual-writes an action node", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  gen.func.action({
    name: "deleteUser",
    input_type: gen.types.uuid(),
    returns: User,
    body: gen.func.buildActionDelete(User),
  });

  expect(getActionFunctionsFromGraph(ctx.graph)).toHaveLength(1);

  const actionNodes = [...ctx.graph.nodes.values()].filter(
    (n) => n.kind === kernel.nodeKinds.ACTION,
  );
  expect(actionNodes).toHaveLength(1);
  expect(actionNodes[0]!.name).toBe("deleteUser");
});

test("gen.func.action dual-writes WRITES edges for each written field", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  gen.func.action({
    name: "updateUser",
    input_type: User,
    returns: User,
    body: gen.action
      .update(User)
      .values([
        [
          User.fields.name!,
          {
            kind: "literal",
            value: "x",
            semanticType: gen.types.string(),
          } as unknown as import("../src/expression/index.ts").Expr,
        ],
      ])
      .build(),
  });

  expect(getActionFunctionsFromGraph(ctx.graph)).toHaveLength(1);

  const writesEdges = [...ctx.graph.edges.values()].filter(
    (e) => e.kind.id === "edge.kind.actionWritesField",
  );
  expect(writesEdges.length).toBeGreaterThanOrEqual(1);
  // Update action writes the "name" field.
  const nameWrite = writesEdges.find((e) =>
    e.endpoints.some((ep) => ep.target.kind === "FieldRef" && ep.target.name === "name"),
  );
  expect(nameWrite).toBeDefined();
});

test("dual-writes scale: 3 entities + 1 relation populates the expected counts", () => {
  const { ctx, gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const Post = gen.entity("Post", {
    id: gen.types.uuid(),
    title: gen.types.string(),
    author_id: gen.types.uuid(),
  });
  gen.entity("Tag", { id: gen.types.uuid() });
  gen.relation({
    name: "author",
    kind: "many_to_one",
    from_entity: Post,
    to_entity: User,
    from_field: Post.fields.author_id!,
    to_field: User.fields.id!,
  });

  expect(ctx.entities).toHaveLength(3);
  expect(ctx.relations).toHaveLength(1);

  // 3 entity nodes + (1 + 3 + 1) field nodes = 8 builder nodes.
  // Plus built-in operation-def nodes registered at context creation.
  const opNodes = [...ctx.graph.nodes.values()].filter(
    (n) => n.kind.id === kernel.nodeKinds.OPERATION_DEF.id,
  );
  expect(ctx.graph.nodes.size).toBe(3 + 1 + 3 + 1 + opNodes.length);

  // Owns + HasType per field = 2 × 5 = 10. Plus 1 domain relation edge = 11.
  // Plus built-in operation type edges registered at context creation.
  const opTypeEdges = [...ctx.graph.edges.values()].filter(
    (e) => e.kind.id === HAS_INPUT_TYPE_EDGE_KIND.id || e.kind.id === HAS_OUTPUT_TYPE_EDGE_KIND.id,
  );
  expect(opTypeEdges.some((e) => e.kind === kernel.edgeKinds.HAS_INPUT_TYPE)).toBe(false);
  expect(opTypeEdges.some((e) => e.kind === kernel.edgeKinds.HAS_OUTPUT_TYPE)).toBe(false);
  expect(ctx.graph.edges.size).toBe(2 * (1 + 3 + 1) + 1 + opTypeEdges.length);
});
