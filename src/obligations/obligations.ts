/* @__NO_SIDE_EFFECTS__ */
/**
 * Semantic obligation graph for tests, docs, and devtools.
 *
 * Records generated-output obligations implied by semantic definitions
 * so targets can produce test scaffolds, documentation, and devtools
 * artifacts from the same IR.
 */

import type { Diagnostic, GenContext } from "../core/index.ts";
import { diagnostic } from "../core/index.ts";

export type ObligationKind =
  | "policy_test"
  | "access_matrix_doc"
  | "mutation_invalidation_test"
  | "provider_mock_test"
  | "hydration_safety_test"
  | "form_validation_test"
  | "enum_exhaustiveness_test"
  | "reaction_delivery_test"
  | "target_capability_doc"
  | "cron_idempotency_test"
  | "workflow_error_handler_test"
  | "boundary_auth_test";

export type ObligationPriority = "required" | "recommended" | "optional";

export interface SemanticObligation {
  readonly kind: "semantic_obligation";
  readonly name: string;
  readonly obligation: ObligationKind;
  readonly source_kind: string;
  readonly source_name: string;
  readonly description: string;
  readonly priority: ObligationPriority;
  readonly affected_artifacts?: readonly string[];
  readonly consumers?: readonly string[];
}

export interface ObligationGraph {
  readonly kind: "obligation_graph";
  readonly obligations: readonly SemanticObligation[];
  readonly diagnostics: readonly Diagnostic[];
}

export const defineSemanticObligation = (input: {
  readonly name: string;
  readonly obligation: ObligationKind;
  readonly source_kind: string;
  readonly source_name: string;
  readonly description: string;
  readonly priority?: ObligationPriority;
  readonly affected_artifacts?: readonly string[];
  readonly consumers?: readonly string[];
}): SemanticObligation => ({
  kind: "semantic_obligation",
  name: input.name,
  obligation: input.obligation,
  source_kind: input.source_kind,
  source_name: input.source_name,
  description: input.description,
  priority: input.priority ?? "recommended",
  affected_artifacts: input.affected_artifacts,
  consumers: input.consumers,
});

export const deriveObligationGraph = (ctx: GenContext): ObligationGraph => {
  const obligations: SemanticObligation[] = [];
  const diagnostics: Diagnostic[] = [];

  // Policies → policy tests + access matrix docs
  for (const policy of ctx.policies) {
    obligations.push(
      defineSemanticObligation({
        name: `policy-test-${policy.name}`,
        obligation: "policy_test",
        source_kind: "policy",
        source_name: policy.name,
        description: `Verify policy "${policy.name}" with concrete test cases`,
        priority: "required",
        affected_artifacts: [`tests/policy/${policy.name}.test.ts`],
      }),
    );
    obligations.push(
      defineSemanticObligation({
        name: `access-matrix-${policy.name}`,
        obligation: "access_matrix_doc",
        source_kind: "policy",
        source_name: policy.name,
        description: `Document access matrix for policy "${policy.name}"`,
        priority: "recommended",
        affected_artifacts: [`docs/access-matrix/${policy.name}.md`],
      }),
    );
  }

  // Actions with invalidation → mutation invalidation tests
  for (const action of ctx.action_functions) {
    if (action.reactivity && action.reactivity.invalidates.length > 0) {
      obligations.push(
        defineSemanticObligation({
          name: `mutation-invalidation-${action.name}`,
          obligation: "mutation_invalidation_test",
          source_kind: "action",
          source_name: action.name,
          description: `Test that "${action.name}" correctly invalidates reactive keys`,
          priority: "required",
          affected_artifacts: [`tests/mutation/${action.name}.invalidation.test.ts`],
        }),
      );
    }
  }

  // Requirements/providers → provider mock tests
  if (ctx.requirements.length > 0 || ctx.providers.length > 0) {
    obligations.push(
      defineSemanticObligation({
        name: "provider-mock-test",
        obligation: "provider_mock_test",
        source_kind: "provider_graph",
        source_name: "requirement_satisfaction_plan",
        description: "Test provider bindings and mock unavailable requirements",
        priority: "recommended",
        affected_artifacts: ["tests/providers/mock.test.ts"],
      }),
    );
  }

  // Hydration-sensitive values → hydration safety tests
  for (const state of ctx.state_resources) {
    if (state.hydrate) {
      obligations.push(
        defineSemanticObligation({
          name: `hydration-safety-${state.name}`,
          obligation: "hydration_safety_test",
          source_kind: "state_resource",
          source_name: state.name,
          description: `Verify safe hydration of state resource "${state.name}"`,
          priority: "required",
          affected_artifacts: [`tests/hydration/${state.name}.test.ts`],
        }),
      );
    }
  }

  // Forms → form validation tests
  for (const form of ctx.forms) {
    obligations.push(
      defineSemanticObligation({
        name: `form-validation-${form.name}`,
        obligation: "form_validation_test",
        source_kind: "form",
        source_name: form.name,
        description: `Validate form "${form.name}" field constraints and error mappings`,
        priority: "recommended",
        affected_artifacts: [`tests/forms/${form.name}.validation.test.ts`],
      }),
    );
  }

  // Reactions → reaction delivery tests
  for (const reaction of ctx.reactions) {
    obligations.push(
      defineSemanticObligation({
        name: `reaction-delivery-${reaction.name}`,
        obligation: "reaction_delivery_test",
        source_kind: "reaction",
        source_name: reaction.name,
        description: `Verify delivery semantics for reaction "${reaction.name}"`,
        priority: "recommended",
        affected_artifacts: [`tests/reactions/${reaction.name}.delivery.test.ts`],
      }),
    );
  }

  // Cron jobs → idempotency tests
  for (const job of ctx.cron_jobs) {
    if (job.execution_policy.idempotency) {
      obligations.push(
        defineSemanticObligation({
          name: `cron-idempotency-${job.name}`,
          obligation: "cron_idempotency_test",
          source_kind: "cron_job",
          source_name: job.name,
          description: `Verify idempotency of cron job "${job.name}"`,
          priority: "required",
          affected_artifacts: [`tests/cron/${job.name}.idempotency.test.ts`],
        }),
      );
    }
  }

  // Workflows with errors → error handler tests
  for (const workflow of ctx.workflows) {
    if (workflow.errors.length > 0) {
      obligations.push(
        defineSemanticObligation({
          name: `workflow-error-${workflow.name}`,
          obligation: "workflow_error_handler_test",
          source_kind: "workflow",
          source_name: workflow.name,
          description: `Verify error handling in workflow "${workflow.name}"`,
          priority: "required",
          affected_artifacts: [`tests/workflow/${workflow.name}.error.test.ts`],
        }),
      );
    }
  }

  // Boundary plans with auth → boundary auth tests
  for (const plan of ctx.boundary_plans) {
    if (plan.auth_requirements && plan.auth_requirements.length > 0) {
      obligations.push(
        defineSemanticObligation({
          name: `boundary-auth-${plan.name}`,
          obligation: "boundary_auth_test",
          source_kind: "boundary_call_plan",
          source_name: plan.name,
          description: `Verify auth requirements for boundary call "${plan.name}"`,
          priority: "required",
          affected_artifacts: [`tests/boundary/${plan.name}.auth.test.ts`],
        }),
      );
    }
  }

  return {
    kind: "obligation_graph",
    obligations,
    diagnostics,
  };
};

export const checkObligations = (ctx: GenContext): readonly Diagnostic[] => {
  const graph = deriveObligationGraph(ctx);
  const diagnostics: Diagnostic[] = [...graph.diagnostics];

  const required = graph.obligations.filter((o) => o.priority === "required");
  if (required.length > 0) {
    diagnostics.push(
      diagnostic({
        severity: "info",
        code: "obligation:required-pending",
        message: `${required.length} required obligations are pending`,
        suggestion: "Review the obligation graph and implement missing test/doc artifacts.",
      }),
    );
  }

  const unhandled = graph.obligations.filter((o) => !o.consumers || o.consumers.length === 0);
  if (unhandled.length > 0) {
    diagnostics.push(
      diagnostic({
        severity: "warning",
        code: "obligation:unhandled",
        message: `${unhandled.length} obligations have no consumers: ${unhandled.map((o) => o.name).join(", ")}`,
        suggestion:
          "Add consumers (tests, docs, devtools) for each obligation or lower its priority.",
      }),
    );
  }

  return diagnostics;
};
