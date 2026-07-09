import { expect, test } from "vite-plus/test";
import { createGen, kernel } from "../src/index.ts";
import { edgeKinds } from "../src/kernel/index.ts";
import { RefDialect, REF_NODE_KIND, refTraits } from "../src/dialects/core/ref.ts";
import { PlacementDialect, STORAGE_LOCATION_NODE_KIND } from "../src/dialects/core/placement.ts";
import { ContextDialect, CONTEXT_NODE_KIND } from "../src/dialects/core/context.ts";
import {
  ClaimDialect,
  CLAIM_NODE_KIND,
  CLAIM_SUBJECT_EDGE_KIND,
  claimTraits,
} from "../src/dialects/core/claim.ts";
import { RequirementDialect, REQUIREMENT_NODE_KIND } from "../src/dialects/core/requirement.ts";
import { ProviderDialect, PROVIDER_NODE_KIND } from "../src/dialects/core/provider.ts";
import { OwnershipDialect, OWNS_EDGE_KIND } from "../src/dialects/core/ownership.ts";
import {
  TypeOperationDialect,
  OPERATION_DEF_NODE_KIND,
  HAS_OUTPUT_TYPE_EDGE_KIND,
  operationTraits,
  lawTraits,
} from "../src/dialects/core/type-operation.ts";
import {
  ExprRuleDialect,
  EXPRESSION_NODE_KIND,
  PREDICATE_NODE_KIND,
  RULE_NODE_KIND,
  RULE_DECLARES_VAR_EDGE_KIND,
  RULE_HAS_BODY_EDGE_KIND,
  RULE_READS_EDGE_KIND,
  EXPRESSION_READS_FIELD_EDGE_KIND,
  exprTraits,
  ruleTraits,
} from "../src/dialects/core/expr-rule.ts";
import {
  EntityFieldRelationDialect,
  ENTITY_NODE_KIND,
  FIELD_NODE_KIND,
  DOMAIN_RELATION_NODE_KIND,
  DOMAIN_RELATION_EDGE_KIND,
  cardinalityTraits,
  integrityTraits,
  relationTraits,
} from "../src/dialects/domain/entity-field-relation.ts";
import {
  CallableDialect,
  QUERY_NODE_KIND,
  ACTION_NODE_KIND,
  PLAN_NODE_KIND,
  WORKFLOW_NODE_KIND,
  QUERY_READS_EDGE_KIND,
  callableTraits,
} from "../src/dialects/callable.ts";
import {
  ReactivityDialect,
  KEY_FAMILY_NODE_KIND,
  REACTIVE_RESOURCE_NODE_KIND,
  REACTIVE_MUTATION_NODE_KIND,
  OPTIMISTIC_PLAN_NODE_KIND,
  OFFLINE_QUEUE_NODE_KIND,
  MATERIALIZED_VIEW_NODE_KIND,
  IVM_PLAN_NODE_KIND,
  DERIVES_KEY_EDGE_KIND,
  INVALIDATES_KEY_EDGE_KIND,
  reactivityTraits,
} from "../src/dialects/reactivity.ts";
import {
  AuthDialect,
  POLICY_NODE_KIND,
  ACCESS_SURFACE_NODE_KIND,
  POLICY_TARGETS_ENTITY_EDGE_KIND,
  POLICY_USES_RULE_EDGE_KIND,
  GUARDS_ACTION_EDGE_KIND,
  authTraits,
} from "../src/dialects/auth.ts";
import {
  UIDialect,
  ENTITY_VIEW_NODE_KIND,
  FORM_NODE_KIND,
  EDITOR_NODE_KIND,
  LIST_NODE_KIND,
  CRUD_NODE_KIND,
  COMPONENT_NODE_KIND,
  CONTROL_NODE_KIND,
  VIEW_DISPLAYS_FIELD_EDGE_KIND,
  VIEW_EDITS_FIELD_EDGE_KIND,
  VIEW_SUBMITS_ACTION_EDGE_KIND,
  VIEW_USES_QUERY_EDGE_KIND,
  uiTraits,
} from "../src/dialects/ui.ts";

test("dialect registry is populated with all core dialects at createGen time", () => {
  const { ctx } = createGen();

  expect(ctx.dialectRegistry.getById(RefDialect.dialectId)).toBe(RefDialect);
  expect(ctx.dialectRegistry.getById(PlacementDialect.dialectId)).toBe(PlacementDialect);
  expect(ctx.dialectRegistry.getById(ContextDialect.dialectId)).toBe(ContextDialect);
  expect(ctx.dialectRegistry.getById(ClaimDialect.dialectId)).toBe(ClaimDialect);
  expect(ctx.dialectRegistry.getById(RequirementDialect.dialectId)).toBe(RequirementDialect);
  expect(ctx.dialectRegistry.getById(ProviderDialect.dialectId)).toBe(ProviderDialect);
  expect(ctx.dialectRegistry.getById(OwnershipDialect.dialectId)).toBe(OwnershipDialect);
  expect(ctx.dialectRegistry.getById(TypeOperationDialect.dialectId)).toBe(TypeOperationDialect);
  expect(ctx.dialectRegistry.getById(ExprRuleDialect.dialectId)).toBe(ExprRuleDialect);
  expect(ctx.dialectRegistry.getById(EntityFieldRelationDialect.dialectId)).toBe(
    EntityFieldRelationDialect,
  );
  expect(ctx.dialectRegistry.getById(CallableDialect.dialectId)).toBe(CallableDialect);
  expect(ctx.dialectRegistry.getById(ReactivityDialect.dialectId)).toBe(ReactivityDialect);
  expect(ctx.dialectRegistry.getById(AuthDialect.dialectId)).toBe(AuthDialect);
  expect(ctx.dialectRegistry.getById(UIDialect.dialectId)).toBe(UIDialect);
});

test("dialect registry resolves node kind to RefDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(REF_NODE_KIND.id);
  expect(dialect).toBe(RefDialect);
});

test("dialect registry resolves ref trait to RefDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForTrait(refTraits.STABLE_ID.id);
  expect(dialect).toBe(RefDialect);
});

test("dialect registry resolves placement node kind to PlacementDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(STORAGE_LOCATION_NODE_KIND.id);
  expect(dialect).toBe(PlacementDialect);
});

test("dialect registry resolves context node kind to ContextDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(CONTEXT_NODE_KIND.id);
  expect(dialect).toBe(ContextDialect);
});

test("dialect registry resolves claim substrate to ClaimDialect", () => {
  const { ctx } = createGen();

  expect(ctx.dialectRegistry.getDialectForNodeKind(CLAIM_NODE_KIND.id)).toBe(ClaimDialect);
  expect(ctx.dialectRegistry.getDialectForEdgeKind(CLAIM_SUBJECT_EDGE_KIND.id)).toBe(ClaimDialect);
  expect(ctx.dialectRegistry.getDialectForTrait(claimTraits.AUTHORITATIVE.id)).toBe(ClaimDialect);
});

test("dialect registry resolves requirement node kind to RequirementDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(REQUIREMENT_NODE_KIND.id);
  expect(dialect).toBe(RequirementDialect);
});

test("dialect registry resolves provider node kind to ProviderDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(PROVIDER_NODE_KIND.id);
  expect(dialect).toBe(ProviderDialect);
});

test("dialect registry resolves ownership edge kind to OwnershipDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(OWNS_EDGE_KIND.id);
  expect(dialect).toBe(OwnershipDialect);
});

test("dialect registry resolves operation node kind to TypeOperationDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(OPERATION_DEF_NODE_KIND.id);
  expect(dialect).toBe(TypeOperationDialect);
});

test("dialect registry resolves operation edge kind to TypeOperationDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(HAS_OUTPUT_TYPE_EDGE_KIND.id);
  expect(dialect).toBe(TypeOperationDialect);
});

test("dialect registry resolves operation trait to TypeOperationDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForTrait(operationTraits.PURE.id);
  expect(dialect).toBe(TypeOperationDialect);
});

test("dialect registry resolves law trait to TypeOperationDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForTrait(lawTraits.ASSOCIATIVE.id);
  expect(dialect).toBe(TypeOperationDialect);
});

test("dialect registry resolves expression node kind to ExprRuleDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(EXPRESSION_NODE_KIND.id);
  expect(dialect).toBe(ExprRuleDialect);
});

test("dialect registry resolves predicate node kind to ExprRuleDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(PREDICATE_NODE_KIND.id);
  expect(dialect).toBe(ExprRuleDialect);
});

test("dialect registry resolves rule node kind to ExprRuleDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(RULE_NODE_KIND.id);
  expect(dialect).toBe(ExprRuleDialect);
});

test("dialect registry resolves rule edge kind to ExprRuleDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(RULE_READS_EDGE_KIND.id);
  expect(dialect).toBe(ExprRuleDialect);
});

test("dialect registry resolves rule body edge kind to ExprRuleDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(RULE_HAS_BODY_EDGE_KIND.id);
  expect(dialect).toBe(ExprRuleDialect);
});

test("dialect registry resolves rule declares var edge kind to ExprRuleDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(RULE_DECLARES_VAR_EDGE_KIND.id);
  expect(dialect).toBe(ExprRuleDialect);
});

test("dialect registry resolves expr trait to ExprRuleDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForTrait(exprTraits.PURE.id);
  expect(dialect).toBe(ExprRuleDialect);
});

test("dialect registry resolves expression reads field edge kind to ExprRuleDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(EXPRESSION_READS_FIELD_EDGE_KIND.id);
  expect(dialect).toBe(ExprRuleDialect);
});

test("dialect registry resolves rule trait to ExprRuleDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForTrait(ruleTraits.PURE.id);
  expect(dialect).toBe(ExprRuleDialect);
});

test("dialect registry resolves entity node kind to EntityFieldRelationDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(ENTITY_NODE_KIND.id);
  expect(dialect).toBe(EntityFieldRelationDialect);
});

test("dialect registry resolves field node kind to EntityFieldRelationDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(FIELD_NODE_KIND.id);
  expect(dialect).toBe(EntityFieldRelationDialect);
});

test("dialect registry resolves domain relation node kind to EntityFieldRelationDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(DOMAIN_RELATION_NODE_KIND.id);
  expect(dialect).toBe(EntityFieldRelationDialect);
});

test("dialect registry resolves domain relation edge kind to EntityFieldRelationDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(DOMAIN_RELATION_EDGE_KIND.id);
  expect(dialect).toBe(EntityFieldRelationDialect);
});

test("dialect registry resolves legacy bridge edge kinds to owning dialects", () => {
  const { ctx } = createGen();

  expect(ctx.dialectRegistry.getDialectForEdgeKind(edgeKinds.DOMAIN_RELATION.id)).toBeUndefined();
});

test("dialect registry resolves cardinality trait to EntityFieldRelationDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForTrait(cardinalityTraits.ONE_TO_MANY.id);
  expect(dialect).toBe(EntityFieldRelationDialect);
});

test("dialect registry resolves integrity trait to EntityFieldRelationDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForTrait(integrityTraits.DB_FK.id);
  expect(dialect).toBe(EntityFieldRelationDialect);
});

test("dialect registry resolves relation trait to EntityFieldRelationDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForTrait(relationTraits.REQUIRED.id);
  expect(dialect).toBe(EntityFieldRelationDialect);
});

test("dialect registry resolves query node kind to CallableDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(QUERY_NODE_KIND.id);
  expect(dialect).toBe(CallableDialect);
});

test("dialect registry resolves action node kind to CallableDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(ACTION_NODE_KIND.id);
  expect(dialect).toBe(CallableDialect);
});

test("dialect registry resolves plan node kind to CallableDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(PLAN_NODE_KIND.id);
  expect(dialect).toBe(CallableDialect);
});

test("dialect registry resolves workflow node kind to CallableDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(WORKFLOW_NODE_KIND.id);
  expect(dialect).toBe(CallableDialect);
});

test("dialect registry resolves query reads edge kind to CallableDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(QUERY_READS_EDGE_KIND.id);
  expect(dialect).toBe(CallableDialect);
});

test("dialect registry resolves callable trait to CallableDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForTrait(callableTraits.CALLABLE.id);
  expect(dialect).toBe(CallableDialect);
});

test("dialect registry resolves key family node kind to ReactivityDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(KEY_FAMILY_NODE_KIND.id);
  expect(dialect).toBe(ReactivityDialect);
});

test("dialect registry resolves reactive resource node kind to ReactivityDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(REACTIVE_RESOURCE_NODE_KIND.id);
  expect(dialect).toBe(ReactivityDialect);
});

test("dialect registry resolves reactive mutation node kind to ReactivityDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(REACTIVE_MUTATION_NODE_KIND.id);
  expect(dialect).toBe(ReactivityDialect);
});

test("dialect registry resolves optimistic plan node kind to ReactivityDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(OPTIMISTIC_PLAN_NODE_KIND.id);
  expect(dialect).toBe(ReactivityDialect);
});

test("dialect registry resolves offline queue node kind to ReactivityDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(OFFLINE_QUEUE_NODE_KIND.id);
  expect(dialect).toBe(ReactivityDialect);
});

test("dialect registry resolves materialized view node kind to ReactivityDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(MATERIALIZED_VIEW_NODE_KIND.id);
  expect(dialect).toBe(ReactivityDialect);
});

test("dialect registry resolves ivm plan node kind to ReactivityDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(IVM_PLAN_NODE_KIND.id);
  expect(dialect).toBe(ReactivityDialect);
});

test("dialect registry resolves derives key edge kind to ReactivityDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(DERIVES_KEY_EDGE_KIND.id);
  expect(dialect).toBe(ReactivityDialect);
});

test("dialect registry resolves invalidates key edge kind to ReactivityDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(INVALIDATES_KEY_EDGE_KIND.id);
  expect(dialect).toBe(ReactivityDialect);
});

test("dialect registry resolves reactivity trait to ReactivityDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForTrait(reactivityTraits.REACTIVE.id);
  expect(dialect).toBe(ReactivityDialect);
});

test("dialect registry resolves policy node kind to AuthDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(POLICY_NODE_KIND.id);
  expect(dialect).toBe(AuthDialect);
});

test("dialect registry resolves access surface node kind to AuthDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(ACCESS_SURFACE_NODE_KIND.id);
  expect(dialect).toBe(AuthDialect);
});

test("dialect registry resolves policy targets entity edge kind to AuthDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(POLICY_TARGETS_ENTITY_EDGE_KIND.id);
  expect(dialect).toBe(AuthDialect);
});

test("dialect registry resolves policy uses rule edge kind to AuthDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(POLICY_USES_RULE_EDGE_KIND.id);
  expect(dialect).toBe(AuthDialect);
});

test("dialect registry resolves guards action edge kind to AuthDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(GUARDS_ACTION_EDGE_KIND.id);
  expect(dialect).toBe(AuthDialect);
});

test("dialect registry resolves auth trait to AuthDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForTrait(authTraits.SERVER_ENFORCED.id);
  expect(dialect).toBe(AuthDialect);
});

test("dialect registry resolves entity view node kind to UIDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(ENTITY_VIEW_NODE_KIND.id);
  expect(dialect).toBe(UIDialect);
});

test("dialect registry resolves form node kind to UIDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(FORM_NODE_KIND.id);
  expect(dialect).toBe(UIDialect);
});

test("dialect registry resolves editor node kind to UIDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(EDITOR_NODE_KIND.id);
  expect(dialect).toBe(UIDialect);
});

test("dialect registry resolves list node kind to UIDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(LIST_NODE_KIND.id);
  expect(dialect).toBe(UIDialect);
});

test("dialect registry resolves crud node kind to UIDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(CRUD_NODE_KIND.id);
  expect(dialect).toBe(UIDialect);
});

test("dialect registry resolves component node kind to UIDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(COMPONENT_NODE_KIND.id);
  expect(dialect).toBe(UIDialect);
});

test("dialect registry resolves control node kind to UIDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForNodeKind(CONTROL_NODE_KIND.id);
  expect(dialect).toBe(UIDialect);
});

test("dialect registry resolves view displays field edge kind to UIDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(VIEW_DISPLAYS_FIELD_EDGE_KIND.id);
  expect(dialect).toBe(UIDialect);
});

test("dialect registry resolves view edits field edge kind to UIDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(VIEW_EDITS_FIELD_EDGE_KIND.id);
  expect(dialect).toBe(UIDialect);
});

test("dialect registry resolves view submits action edge kind to UIDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(VIEW_SUBMITS_ACTION_EDGE_KIND.id);
  expect(dialect).toBe(UIDialect);
});

test("dialect registry resolves view uses query edge kind to UIDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForEdgeKind(VIEW_USES_QUERY_EDGE_KIND.id);
  expect(dialect).toBe(UIDialect);
});

test("dialect registry resolves ui trait to UIDialect", () => {
  const { ctx } = createGen();

  const dialect = ctx.dialectRegistry.getDialectForTrait(uiTraits.INTERACTIVE.id);
  expect(dialect).toBe(UIDialect);
});

test("dialect-owned id factory derives namespace and produces namespace-bound IDs", () => {
  expect(CallableDialect.namespace).toBe("callable");
  expect(CallableDialect.id.namespace).toBe("callable");

  const actionId = CallableDialect.id.node(ACTION_NODE_KIND, "updateProjectStatus");
  expect(actionId).toBe("node:callable:node.kind.action:updateProjectStatus");

  const actionRef = CallableDialect.id.nodeRef(ACTION_NODE_KIND, "updateProjectStatus");
  expect(actionRef.kind).toBe("node");
  expect(actionRef.id).toBe("node:callable:node.kind.action:updateProjectStatus");
  expect(actionRef.nodeKind.id).toBe(ACTION_NODE_KIND.id);
  expect(actionRef.name).toBe("updateProjectStatus");
});

test("dialect-owned id factory derives namespace from constructor id.value when namespace omitted", () => {
  // PlacementDialect does not declare an explicit `namespace` field, so it
  // falls back to the suffix of its `dialectId.value` (e.g.
  // "dialect.core.placement" → "core.placement").
  expect(PlacementDialect.namespace).toBe("core.placement");
  expect(PlacementDialect.id.namespace).toBe("core.placement");
  const locationId = PlacementDialect.id.node(STORAGE_LOCATION_NODE_KIND, "primary");
  expect(locationId.startsWith("node:core.placement:")).toBe(true);
});

test("Dialect.surfaces is derived from morphisms[*].surface (PLAN §B3b)", () => {
  // Tiny ad-hoc dialect with a morphism whose surface should bubble up.
  const NodeA = kernel.defineNodeKind({ id: "node.kind.test.dialectSurfaces.a" });
  const NodeB = kernel.defineNodeKind({ id: "node.kind.test.dialectSurfaces.b" });
  const Link = kernel.defineEdgeKind({
    id: "edge.kind.test.dialectSurfaces.link",
    endpoints: [
      kernel.defineEndpointRole("a", { targetKinds: [NodeA] }),
      kernel.defineEndpointRole("b", { targetKinds: [NodeB] }),
    ],
  });
  const TestPattern = kernel.defineGraphPattern({
    nodes: { a: NodeA, b: NodeB },
    edges: { link: { kind: Link, endpoints: { a: "a", b: "b" } } },
  });

  const surface = kernel.defineDerivationSurface
    .id(
      kernel.defineSurfaceId({
        phase: "derivation",
        id: "surface.test.dialect.derive",
        label: "Test derivation surface",
      }),
    )
    .consumes({ subjects: [kernel.subjectKind.ENTITY], edges: [Link] })
    .yields({ edges: [Link] })
    .resultShape({ patches: [Link] })
    .done({});

  const morphism = kernel.defineMorphism({
    name: "test.dialect.derive",
    phase: "derivation",
    from: TestPattern,
    to: { edges: [Link] },
    surface,
    map: () => [],
  });

  const TestDialect = kernel.defineDialect({
    id: kernel.dialectId("dialect.test.dialectSurfaces"),
    namespace: "test.dialectSurfaces",
    label: "Test dialect surfaces",
    nodeKinds: [NodeA, NodeB],
    edgeKinds: [Link],
    morphisms: [morphism],
  });

  expect(TestDialect.morphisms).toHaveLength(1);
  expect(TestDialect.morphisms[0]!.name).toBe("test.dialect.derive");
  expect(TestDialect.surfaces).toHaveLength(1);
  expect(TestDialect.surfaces[0]!.id.value).toBe("surface.test.dialect.derive");
});

test("Dialect.surfaces deduplicates by surface id when multiple morphisms share a surface", () => {
  const NodeA = kernel.defineNodeKind({ id: "node.kind.test.dialectSurfacesDedup.a" });
  const NodeB = kernel.defineNodeKind({ id: "node.kind.test.dialectSurfacesDedup.b" });
  const Link = kernel.defineEdgeKind({
    id: "edge.kind.test.dialectSurfacesDedup.link",
    endpoints: [
      kernel.defineEndpointRole("a", { targetKinds: [NodeA] }),
      kernel.defineEndpointRole("b", { targetKinds: [NodeB] }),
    ],
  });
  const TestPattern = kernel.defineGraphPattern({
    nodes: { a: NodeA, b: NodeB },
    edges: { link: { kind: Link, endpoints: { a: "a", b: "b" } } },
  });
  const surface = kernel.defineDerivationSurface
    .id(
      kernel.defineSurfaceId({
        phase: "derivation",
        id: "surface.test.dedup",
        label: "Dedup surface",
      }),
    )
    .consumes({ subjects: [kernel.subjectKind.ENTITY], edges: [Link] })
    .yields({ edges: [Link] })
    .resultShape({ patches: [Link] })
    .done({});

  const m1 = kernel.defineMorphism({
    name: "test.dialect.dedup.1",
    phase: "derivation",
    from: TestPattern,
    to: { edges: [Link] },
    surface,
    map: () => [],
  });
  const m2 = kernel.defineMorphism({
    name: "test.dialect.dedup.2",
    phase: "derivation",
    from: TestPattern,
    to: { edges: [Link] },
    surface,
    map: () => [],
  });

  const TestDialect = kernel.defineDialect({
    id: kernel.dialectId("dialect.test.dedup"),
    namespace: "test.dedup",
    label: "Dedup test",
    nodeKinds: [NodeA, NodeB],
    edgeKinds: [Link],
    morphisms: [m1, m2],
  });

  expect(TestDialect.morphisms).toHaveLength(2);
  expect(TestDialect.surfaces).toHaveLength(1);
});

test("attachMorphism wires a late-bound morphism into an existing dialect (idempotent)", async () => {
  // Importing the rls / reactivity pass modules attaches their
  // production morphisms to the auth/reactivity dialects at module load.
  // Re-importing must not double-register the morphism (dedup by name).
  const [{ AuthDialect }, { ReactivityDialect }] = await Promise.all([
    import("../src/dialects/auth.ts"),
    import("../src/dialects/reactivity.ts"),
  ]);
  // Pull in the pass modules so their module-level `attachMorphism`
  // calls have fired.
  await import("../src/rules/rls-pass.ts");
  await import("../src/reactivity/passes.ts");

  const authMorphismNames = (AuthDialect.morphisms as readonly { readonly name: string }[]).map(
    (m) => m.name,
  );
  const reactivityMorphismNames = (
    ReactivityDialect.morphisms as readonly { readonly name: string }[]
  ).map((m) => m.name);

  expect(authMorphismNames).toContain("legalize.rule.toRlsPolicy");
  expect(reactivityMorphismNames).toContain("derive.rule.invalidationDependencies");

  // RULE_INVALIDATION_MORPHISM declares a surface; ReactivityDialect.surfaces
  // should expose it after attach.
  const reactivitySurfaceIds = ReactivityDialect.surfaces.map((s) => s.id.value);
  expect(reactivitySurfaceIds).toContain("surface.rule.invalidationDependencies");

  // Re-running attachMorphism with the same morphism is a no-op (dedup by name).
  const { attachMorphism } = await import("../src/kernel/dialect.ts");
  const { RLS_POLICY_MORPHISM } = await import("../src/rules/rls-pass.ts");
  const before = AuthDialect.morphisms.length;
  attachMorphism(AuthDialect, RLS_POLICY_MORPHISM);
  expect(AuthDialect.morphisms.length).toBe(before);
});

test("verifyDialectRegistered returns no diagnostics for a registered dialect", () => {
  const { ctx } = createGen();
  const findings = kernel.verifyDialectRegistered(ctx.dialectRegistry, AuthDialect);
  expect(findings).toEqual([]);
});

test("verifyDialectRegistered returns a dialect:not-registered error for a missing plugin dialect", () => {
  const { ctx } = createGen();

  // Construct a freestanding plugin-style dialect that was never
  // registered with `ctx.dialectRegistry`. The verifier should surface
  // a typed error diagnostic rather than fail silently.
  const PluginDialect = kernel.defineDialect({
    id: kernel.dialectId("dialect.test.unregistered-plugin"),
    namespace: "test.unregisteredPlugin",
    label: "Unregistered Test Plugin",
    nodeKinds: [],
    edgeKinds: [],
    traits: [],
    passes: [],
    lowerings: [],
  });

  const findings = kernel.verifyDialectRegistered(ctx.dialectRegistry, PluginDialect);
  expect(findings).toHaveLength(1);
  expect(findings[0]!.code).toBe("dialect:not-registered");
  expect(findings[0]!.severity).toBe("error");
  expect(findings[0]!.message).toContain("dialect.test.unregistered-plugin");
});

test("morphismMetaFacts materializes static facts from dialect morphisms", () => {
  // ReactivityDialect carries RULE_INVALIDATION_MORPHISM (attached at
  // module load) plus the rule-invalidation surface. The meta facts
  // should expose its membership, pattern reads, emitted edges, and
  // surface advertisement without re-walking morphism internals.
  const facts = kernel.morphismMetaFacts(ReactivityDialect);
  const morphismFacts = facts.filter((f) => f.kind === "Morphism");
  expect(morphismFacts.length).toBeGreaterThan(0);
  expect(morphismFacts.some((f) => f.morphism === "derive.rule.invalidationDependencies")).toBe(
    true,
  );

  const belongsTo = facts.filter((f) => f.kind === "BelongsToDialect");
  expect(belongsTo.every((f) => f.dialect === ReactivityDialect.dialectId.value)).toBe(true);

  const emitsEdgeKind = facts.filter((f) => f.kind === "EmitsEdgeKind");
  expect(emitsEdgeKind.some((f) => f.edgeKind === INVALIDATES_KEY_EDGE_KIND.id)).toBe(true);

  const hasSurface = facts.filter((f) => f.kind === "HasSurface");
  expect(hasSurface.some((f) => f.surface === "surface.rule.invalidationDependencies")).toBe(true);
});

test("morphism.run() result carries `producedBy` and `matchCount` (run meta seam)", async () => {
  const { RLS_POLICY_MORPHISM } = await import("../src/rules/rls-pass.ts");
  const { ctx } = createGen();
  // The OpsDesk slice builds a graph with one matching policy; the
  // run result should stamp the morphism name and the match count.
  const result = RLS_POLICY_MORPHISM.run(ctx.graph);
  expect(result.producedBy).toBe("legalize.rule.toRlsPolicy");
  expect(typeof result.matchCount).toBe("number");
});

test("morphismRunMetaFacts derives RanMorphism + Produced* facts from a run result", () => {
  const result = {
    producedBy: "test.run-meta.morphism",
    matchCount: 3,
    patches: [{ id: "patch:1" }, { id: "patch:2" }],
    diagnostics: [{ code: "diag:test:one", severity: "info" as const, message: "x" }],
    artifacts: [{ id: "artifact:1", kind: "pg.rls-policy" }],
    explanations: [{ message: "test", facts: [] }],
  };
  const facts = kernel.morphismRunMetaFacts(result);
  expect(facts.find((f) => f.kind === "RanMorphism")?.matchCount).toBe(3);
  expect(facts.filter((f) => f.kind === "ProducedPatch").length).toBe(2);
  expect(facts.filter((f) => f.kind === "ProducedDiagnostic").length).toBe(1);
  expect(facts.filter((f) => f.kind === "ProducedArtifact").length).toBe(1);
  expect(facts.filter((f) => f.kind === "ProducedExplanation").length).toBe(1);
  const artifactFact = facts.find((f) => f.kind === "ProducedArtifact");
  expect(artifactFact?.artifactKind).toBe("pg.rls-policy");
});

test("morphismMetaFacts emits no facts for a dialect with no morphisms", () => {
  const EmptyDialect = kernel.defineDialect({
    id: kernel.dialectId("dialect.test.empty-morphism-facts"),
    namespace: "test.emptyMorphismFacts",
    label: "Empty test dialect",
    nodeKinds: [],
    edgeKinds: [],
    traits: [],
    passes: [],
    lowerings: [],
  });
  expect(kernel.morphismMetaFacts(EmptyDialect)).toEqual([]);
});

test("verifyDialectRegistered returns no diagnostics after the plugin dialect is added", () => {
  const { ctx } = createGen();
  const PluginDialect = kernel.defineDialect({
    id: kernel.dialectId("dialect.test.late-registered-plugin"),
    namespace: "test.lateRegisteredPlugin",
    label: "Late Registered Test Plugin",
    nodeKinds: [],
    edgeKinds: [],
    traits: [],
    passes: [],
    lowerings: [],
  });

  expect(kernel.verifyDialectRegistered(ctx.dialectRegistry, PluginDialect)).toHaveLength(1);
  ctx.dialectRegistry.add(PluginDialect);
  expect(kernel.verifyDialectRegistered(ctx.dialectRegistry, PluginDialect)).toEqual([]);
});
