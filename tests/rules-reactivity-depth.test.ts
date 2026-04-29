import { expect, test } from "vite-plus/test";
import { createGen } from "../src/gen.ts";
import { check } from "../src/lifecycle/lifecycle.ts";
import {
  string as stringType,
  uuid as uuidType,
  datetime as datetimeType,
} from "../src/types/semantic.ts";
import {
  ruleEq,
  ruleField,
  ruleLiteral,
  ruleVar,
  ruleAnd,
  ruleOr,
  ruleNot,
  ruleExists,
} from "../src/rules/rules.ts";
import { allowAuthenticated } from "../src/authz/authz.ts";
import { buildActionUpdate } from "../src/function/function.ts";
import { fromEntity } from "../src/query/query.ts";
import {
  deriveRuleInvalidationPlans,
  deriveIvmPlans,
  deriveEditableFieldsForRule,
} from "../src/reactivity/rule-derived.ts";

test("Level 2 matched precision when mutation has condition and rule is not simple equality", () => {
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
    body: buildActionUpdate(
      Project,
      [
        [
          Project.fields.status,
          {
            kind: "literal",
            value: "archived",
            semanticType: stringType(),
          } as unknown as import("../src/expression/index.ts").Expr,
        ],
      ],
      {
        kind: "comparison",
        kind_detail: { kind: "comparison" },
        input_type: stringType(),
        value_type: stringType(),
        ast: { kind: { kind: "op_call" }, children: [] },
        refs: [],
      } as unknown as import("../src/expression/index.ts").Predicate,
    ),
  });

  const plans = deriveRuleInvalidationPlans(ctx);
  expect(plans).toHaveLength(1);
  expect(plans[0]!.precision).toBe("matched");
});

test("Level 3 patchable precision for simple equality rule with same-field mutation", () => {
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

  const plans = deriveRuleInvalidationPlans(ctx);
  expect(plans).toHaveLength(1);
  expect(plans[0]!.precision).toBe("patchable");
  expect(plans[0]!.confidence).toBe("proven");
});

test("cross-store-rule-dependency diagnostic", () => {
  const { ctx, gen } = createGen();

  gen.store({ name: "StoreA", dialect: "postgres" });
  gen.store({ name: "StoreB", dialect: "postgres" });

  const EntityA = gen.entity("EntityA", { id: uuidType() });
  const EntityB = gen.entity("EntityB", { id: uuidType() });

  // Manually set store names to simulate cross-store entities
  (EntityA as { store_name?: string }).store_name = "StoreA";
  (EntityB as { store_name?: string }).store_name = "StoreB";

  gen.rule.define({
    name: "crossStoreRule",
    vars: [],
    when: ruleEq(
      ruleField(EntityA, EntityA.fields.id, stringType()),
      ruleField(EntityB, EntityB.fields.id, stringType()),
    ),
  });

  const result = check(ctx);
  const diag = result.diagnostics.find(
    (d) => d.code === "rules-reactivity:cross-store-rule-dependency",
  );
  expect(diag).toBeDefined();
  expect(diag!.severity).toBe("warning");
});

test("time-dependent-rule diagnostic", () => {
  const { ctx, gen } = createGen();

  const Event = gen.entity("Event", { id: uuidType(), startsAt: datetimeType() });

  gen.rule.define({
    name: "eventIsActive",
    vars: [ruleVar("now", datetimeType())],
    when: ruleEq(
      ruleField(Event, Event.fields.startsAt, datetimeType()),
      ruleVar("now", datetimeType()),
    ),
  });

  const result = check(ctx);
  const diag = result.diagnostics.find((d) => d.code === "rules-reactivity:time-dependent-rule");
  expect(diag).toBeDefined();
  expect(diag!.severity).toBe("warning");
});

test("dependency-not-extractable diagnostic for exists", () => {
  const { ctx, gen } = createGen();

  const User = gen.entity("User", { id: uuidType() });
  const Post = gen.entity("Post", { id: uuidType(), user_id: uuidType() });

  const userPosts = gen.relation({
    name: "userPosts",
    kind: "one_to_many",
    from_entity: User,
    to_entity: Post,
    from_field: User.fields.id,
    to_field: Post.fields.user_id,
  });

  gen.rule.define({
    name: "hasPosts",
    vars: [],
    when: ruleExists(
      userPosts,
      ruleEq(ruleLiteral("true", stringType()), ruleLiteral("true", stringType())),
    ),
  });

  const result = check(ctx);
  const diag = result.diagnostics.find(
    (d) => d.code === "rules-reactivity:dependency-not-extractable",
  );
  expect(diag).toBeDefined();
  expect(diag!.severity).toBe("info");
});

test("affected-set-unknown warning for unscoped mutation", () => {
  const { ctx, gen } = createGen();

  const Project = gen.entity("Project", {
    id: uuidType(),
    status: stringType(),
    name: stringType(),
  });

  gen.rule.define({
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

  gen.func.action({
    name: "archiveAllProjects",
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

  gen.rule.define({
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

  gen.func.action({
    name: "archiveAllProjects",
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
  const diags = result.diagnostics.filter(
    (d) => d.code === "rules-reactivity:affected-set-unknown" && d.severity === "warning",
  );
  expect(diags.length).toBeGreaterThan(0);
  expect(diags[0]!.message).toContain("archiveAllProjects");
});

test("ivm-delta-unsupported diagnostic for negated rules", () => {
  const { ctx, gen } = createGen();

  const User = gen.entity("User", { id: uuidType(), active: stringType() });

  gen.rule.define({
    name: "isInactive",
    vars: [],
    when: ruleNot(
      ruleEq(ruleField(User, User.fields.active, stringType()), ruleLiteral("true", stringType())),
    ),
  });

  const result = check(ctx);
  const diag = result.diagnostics.find((d) => d.code === "rules-reactivity:ivm-delta-unsupported");
  expect(diag).toBeDefined();
  expect(diag!.severity).toBe("warning");
});

test("ivm-delta-unsupported diagnostic for disjunctive rules", () => {
  const { ctx, gen } = createGen();

  const User = gen.entity("User", { id: uuidType(), role: stringType(), active: stringType() });

  gen.rule.define({
    name: "isAdminOrActive",
    vars: [],
    when: ruleOr(
      ruleEq(ruleField(User, User.fields.role, stringType()), ruleLiteral("admin", stringType())),
      ruleEq(ruleField(User, User.fields.active, stringType()), ruleLiteral("true", stringType())),
    ),
  });

  const result = check(ctx);
  const diag = result.diagnostics.find((d) => d.code === "rules-reactivity:ivm-delta-unsupported");
  expect(diag).toBeDefined();
  expect(diag!.severity).toBe("warning");
});

test("deriveIvmPlans returns unsupported for negated rules", () => {
  const { ctx, gen } = createGen();

  const User = gen.entity("User", { id: uuidType(), active: stringType() });

  gen.rule.define({
    name: "isInactive",
    vars: [],
    when: ruleNot(
      ruleEq(ruleField(User, User.fields.active, stringType()), ruleLiteral("true", stringType())),
    ),
  });

  const plans = deriveIvmPlans(ctx);
  expect(plans).toHaveLength(1);
  expect(plans[0]!.deltaMode).toBe("unsupported");
});

test("deriveEditableFieldsForRule returns fields read by rule", () => {
  const { gen } = createGen();

  const Project = gen.entity("Project", {
    id: uuidType(),
    status: stringType(),
    ownerId: uuidType(),
  });

  const canEditProject = gen.rule.define({
    name: "canEditProject",
    vars: [],
    when: ruleEq(
      ruleField(Project, Project.fields.status, stringType()),
      ruleLiteral("active", stringType()),
    ),
  });

  const fields = deriveEditableFieldsForRule(canEditProject);
  expect(fields).toHaveLength(1);
  expect(fields[0]!.name).toBe("status");
});

test("FormField editableWhen accepts a Rule", () => {
  const { gen } = createGen();

  const Project = gen.entity("Project", { id: uuidType(), status: stringType() });

  const canEditStatus = gen.rule.define({
    name: "canEditStatus",
    vars: [],
    when: ruleEq(
      ruleField(Project, Project.fields.status, stringType()),
      ruleLiteral("active", stringType()),
    ),
  });

  const formField = gen.forms.field(Project.fields.status, undefined, undefined, canEditStatus);

  expect(formField.editableWhen).toBe(canEditStatus);
  expect(formField.editableWhen!.name).toBe("canEditStatus");
});
