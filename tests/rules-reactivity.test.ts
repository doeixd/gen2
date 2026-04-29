import { expect, test } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import { check } from "../src/lifecycle/lifecycle.ts";
import { string as stringType, uuid as uuidType } from "../src/types/semantic.ts";
import { ruleEq, ruleField, ruleLiteral, ruleVar, ruleAnd } from "../src/rules/rules.ts";
import { allowAuthenticated } from "../src/authz/authz.ts";
import { buildActionInsert, buildActionUpdate } from "../src/function/function.ts";
import { fromEntity } from "../src/query/query.ts";
import { deriveRuleInvalidationPlans } from "../src/reactivity/rule-derived.ts";

test("deriveRuleInvalidationPlans returns empty when no overlap", () => {
  const { ctx, gen } = createGen();

  const User = gen.entity("User", { id: uuidType(), name: stringType() });

  gen.rule.define({
    name: "canViewProject",
    vars: [ruleVar("actorId", stringType())],
    when: ruleEq(ruleVar("actorId", stringType()), ruleLiteral("admin", stringType())),
  });

  gen.func.action({
    name: "createUser",
    input_type: User,
    returns: User,
    body: buildActionInsert(User, []),
  });

  const plans = deriveRuleInvalidationPlans(ctx);
  expect(plans).toHaveLength(0);
});

test("deriveRuleInvalidationPlans detects mutation writing field that rule reads", () => {
  const { ctx, gen } = createGen();

  const Project = gen.entity("Project", {
    id: uuidType(),
    name: stringType(),
    status: stringType(),
  });

  const canViewProject = gen.rule.define({
    name: "canViewProject",
    vars: [ruleVar("actorId", stringType())],
    when: ruleEq(
      ruleField(Project, Project.fields.status, stringType()),
      ruleLiteral("active", stringType()),
    ),
  });

  const projectPolicy = gen.authz.policy({
    name: "projectPolicy",
    target_entity: Project,
    actions: [{ action_name: "read", condition: allowAuthenticated() }],
    predicate: canViewProject,
  });

  const projectKey = gen.key.entity(Project);

  gen.func.query({
    name: "listProjects",
    input_type: stringType(),
    returns: stringType(),
    body: fromEntity(Project).build(),
    reactivity: { key: projectKey },
    auth: { action: "read", policy_name: projectPolicy.name },
  });

  gen.func.action({
    name: "updateProjectStatus",
    input_type: Project,
    returns: Project,
    body: buildActionUpdate(Project, [
      [
        Project.fields.status,
        {
          kind: "literal",
          value: "archived",
          semanticType: stringType(),
        } as unknown as import("../src/expression/index.ts").Expr,
      ],
    ]),
  });

  const plans = deriveRuleInvalidationPlans(ctx);
  expect(plans).toHaveLength(1);
  expect(plans[0]!.mutation.name).toBe("updateProjectStatus");
  expect(plans[0]!.affectedRules).toHaveLength(1);
  expect(plans[0]!.affectedRules[0]!.name).toBe("canViewProject");
  expect(plans[0]!.invalidates).toHaveLength(1);
  expect(plans[0]!.precision).toBe("patchable");
  expect(plans[0]!.confidence).toBe("proven");
});

test("deriveRuleInvalidationPlans deduplicates key families", () => {
  const { ctx, gen } = createGen();

  const Project = gen.entity("Project", {
    id: uuidType(),
    name: stringType(),
    status: stringType(),
  });

  const canViewProject = gen.rule.define({
    name: "canViewProject",
    vars: [],
    when: ruleEq(
      ruleField(Project, Project.fields.status, stringType()),
      ruleLiteral("active", stringType()),
    ),
  });

  const canEditProject = gen.rule.define({
    name: "canEditProject",
    vars: [],
    when: ruleEq(
      ruleField(Project, Project.fields.status, stringType()),
      ruleLiteral("active", stringType()),
    ),
  });

  const projectPolicy = gen.authz.policy({
    name: "projectPolicy",
    target_entity: Project,
    actions: [{ action_name: "read", condition: allowAuthenticated() }],
    predicate: canViewProject,
  });

  const editPolicy = gen.authz.policy({
    name: "editPolicy",
    target_entity: Project,
    actions: [{ action_name: "update", condition: allowAuthenticated() }],
    predicate: canEditProject,
  });

  const projectKey = gen.key.entity(Project);

  gen.func.query({
    name: "listProjects",
    input_type: stringType(),
    returns: stringType(),
    body: fromEntity(Project).build(),
    reactivity: { key: projectKey },
    auth: { action: "read", policy_name: projectPolicy.name },
  });

  gen.func.query({
    name: "getProject",
    input_type: stringType(),
    returns: stringType(),
    body: fromEntity(Project).build(),
    reactivity: { key: projectKey },
    auth: { action: "read", policy_name: editPolicy.name },
  });

  gen.func.action({
    name: "updateProjectStatus",
    input_type: Project,
    returns: Project,
    body: buildActionUpdate(Project, [
      [
        Project.fields.status,
        {
          kind: "literal",
          value: "archived",
          semanticType: stringType(),
        } as unknown as import("../src/expression/index.ts").Expr,
      ],
    ]),
  });

  const plans = deriveRuleInvalidationPlans(ctx);
  expect(plans).toHaveLength(1);
  // Both rules read status, both policies use those rules, both queries share the same key family
  // Should be deduplicated to 1 invalidation pattern
  expect(plans[0]!.invalidates).toHaveLength(1);
});

test("checkRuleReactivity emits mutation-writes-rule-dependency diagnostic", () => {
  const { ctx, gen } = createGen();

  const Project = gen.entity("Project", {
    id: uuidType(),
    name: stringType(),
    status: stringType(),
  });

  const canViewProject = gen.rule.define({
    name: "canViewProject",
    vars: [],
    when: ruleEq(
      ruleField(Project, Project.fields.status, stringType()),
      ruleLiteral("active", stringType()),
    ),
  });

  const projectPolicy = gen.authz.policy({
    name: "projectPolicy",
    target_entity: Project,
    actions: [{ action_name: "read", condition: allowAuthenticated() }],
    predicate: canViewProject,
  });

  const projectKey = gen.key.entity(Project);

  gen.func.query({
    name: "listProjects",
    input_type: stringType(),
    returns: stringType(),
    body: fromEntity(Project).build(),
    reactivity: { key: projectKey },
    auth: { action: "read", policy_name: projectPolicy.name },
  });

  gen.func.action({
    name: "updateProjectStatus",
    input_type: Project,
    returns: Project,
    body: buildActionUpdate(Project, [
      [
        Project.fields.status,
        {
          kind: "literal",
          value: "archived",
          semanticType: stringType(),
        } as unknown as import("../src/expression/index.ts").Expr,
      ],
    ]),
  });

  const result = check(ctx);
  const diag = result.diagnostics.find(
    (d) => d.code === "rules-reactivity:mutation-writes-rule-dependency",
  );
  expect(diag).toBeDefined();
  expect(diag!.severity).toBe("info");
  expect(diag!.message).toContain("updateProjectStatus");
  expect(diag!.message).toContain("canViewProject");
});

test("checkRuleReactivity emits broad-invalidation-selected warning", () => {
  const { ctx, gen } = createGen();

  const Project = gen.entity("Project", {
    id: uuidType(),
    name: stringType(),
    status: stringType(),
  });

  const canViewProject = gen.rule.define({
    name: "canViewProject",
    vars: [],
    when: ruleAnd(
      ruleEq(
        ruleField(Project, Project.fields.status, stringType()),
        ruleLiteral("active", stringType()),
      ),
      ruleEq(ruleField(Project, Project.fields.name, stringType()), ruleLiteral("x", stringType())),
    ),
  });

  const projectPolicy = gen.authz.policy({
    name: "projectPolicy",
    target_entity: Project,
    actions: [{ action_name: "read", condition: allowAuthenticated() }],
    predicate: canViewProject,
  });

  const projectKey = gen.key.entity(Project);

  gen.func.query({
    name: "listProjects",
    input_type: stringType(),
    returns: stringType(),
    body: fromEntity(Project).build(),
    reactivity: { key: projectKey },
    auth: { action: "read", policy_name: projectPolicy.name },
  });

  gen.func.action({
    name: "updateProjectStatus",
    input_type: Project,
    returns: Project,
    body: buildActionUpdate(Project, [
      [
        Project.fields.status,
        {
          kind: "literal",
          value: "archived",
          semanticType: stringType(),
        } as unknown as import("../src/expression/index.ts").Expr,
      ],
    ]),
  });

  const result = check(ctx);
  const diag = result.diagnostics.find(
    (d) => d.code === "rules-reactivity:broad-invalidation-selected",
  );
  expect(diag).toBeDefined();
  expect(diag!.severity).toBe("warning");
  expect(diag!.message).toContain("updateProjectStatus");
});

test("no diagnostics when query has no reactivity key", () => {
  const { ctx, gen } = createGen();

  const Project = gen.entity("Project", {
    id: uuidType(),
    name: stringType(),
    status: stringType(),
  });

  const canViewProject = gen.rule.define({
    name: "canViewProject",
    vars: [],
    when: ruleEq(
      ruleField(Project, Project.fields.status, stringType()),
      ruleLiteral("active", stringType()),
    ),
  });

  const projectPolicy = gen.authz.policy({
    name: "projectPolicy",
    target_entity: Project,
    actions: [{ action_name: "read", condition: allowAuthenticated() }],
    predicate: canViewProject,
  });

  gen.func.query({
    name: "listProjects",
    input_type: stringType(),
    returns: stringType(),
    body: fromEntity(Project).build(),
    auth: { action: "read", policy_name: projectPolicy.name },
  });

  gen.func.action({
    name: "updateProjectStatus",
    input_type: Project,
    returns: Project,
    body: buildActionUpdate(Project, [
      [
        Project.fields.status,
        {
          kind: "literal",
          value: "archived",
          semanticType: stringType(),
        } as unknown as import("../src/expression/index.ts").Expr,
      ],
    ]),
  });

  const result = check(ctx);
  const broad = result.diagnostics.find(
    (d) => d.code === "rules-reactivity:broad-invalidation-selected",
  );
  expect(broad).toBeUndefined();
});
