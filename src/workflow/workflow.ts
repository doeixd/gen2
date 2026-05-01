/* @__NO_SIDE_EFFECTS__ */
/**
 * Workflow plan IR for typed, inspectable multi-step orchestration.
 *
 * Workflows compose actions, queries, rules, events, invalidations,
 * requirements, and effects into callable/effectful plan nodes.
 */

import type { Diagnostic, GenContext } from "../core/index.ts";
import { diagnostic } from "../core/index.ts";
import type {
  ActionFunction,
  QueryFunction,
  StaticFunction,
  ExprFunction,
} from "../function/index.ts";
import type { Event } from "../events/index.ts";
import type { KeyPatternExpression } from "../reactivity/index.ts";
import type { SemanticType, Requirement, Effect } from "../types/index.ts";
import { entityToSemanticType } from "../core/entity-to-semantic.ts";
import type { Entity } from "../entity/index.ts";

export type WorkflowPlanStep =
  | WorkflowCallStep
  | WorkflowQueryStep
  | WorkflowActionStep
  | WorkflowSequenceStep
  | WorkflowParallelStep
  | WorkflowBranchStep
  | WorkflowWaitStep
  | WorkflowWaitForEventStep
  | WorkflowChildStep
  | WorkflowCheckpointStep
  | WorkflowCancelStep
  | WorkflowCompensationStep
  | WorkflowRetryStep
  | WorkflowEmitStep
  | WorkflowInvalidateStep;

export interface WorkflowCallStep {
  readonly kind: "workflow_call";
  readonly target: StaticFunction | ExprFunction;
}

export interface WorkflowQueryStep {
  readonly kind: "workflow_query";
  readonly target: QueryFunction;
}

export interface WorkflowActionStep {
  readonly kind: "workflow_action";
  readonly target: ActionFunction;
}

export interface WorkflowSequenceStep {
  readonly kind: "workflow_sequence";
  readonly steps: readonly WorkflowPlanStep[];
}

export interface WorkflowParallelStep {
  readonly kind: "workflow_parallel";
  readonly branches: readonly WorkflowPlanStep[];
}

export interface WorkflowBranchStep {
  readonly kind: "workflow_branch";
  readonly predicate: string;
  readonly if_true: WorkflowPlanStep;
  readonly if_false: WorkflowPlanStep;
}

export interface WorkflowWaitStep {
  readonly kind: "workflow_wait";
  readonly duration_ms: number;
}

export interface WorkflowWaitForEventStep {
  readonly kind: "workflow_wait_for_event";
  readonly event_type: string;
  readonly correlation_key?: string;
}

export interface WorkflowChildStep {
  readonly kind: "workflow_child";
  readonly workflow: Workflow;
  readonly input_mapping?: string;
}

export interface WorkflowCheckpointStep {
  readonly kind: "workflow_checkpoint";
  readonly name: string;
}

export interface WorkflowCancelStep {
  readonly kind: "workflow_cancel";
  readonly reason?: string;
}

export interface WorkflowCompensationStep {
  readonly kind: "workflow_compensation";
  readonly primary: WorkflowPlanStep;
  readonly compensate: WorkflowPlanStep;
}

export interface WorkflowRetryStep {
  readonly kind: "workflow_retry";
  readonly step: WorkflowPlanStep;
  readonly max_attempts: number;
  readonly backoff: "none" | "fixed" | "exponential";
}

export interface WorkflowEmitStep {
  readonly kind: "workflow_emit";
  readonly event: Event;
}

export interface WorkflowInvalidateStep {
  readonly kind: "workflow_invalidate";
  readonly patterns: readonly KeyPatternExpression[];
}

export interface Workflow<
  In = unknown,
  Out = unknown,
  Err = unknown,
  Req = unknown,
  Eff = unknown,
> {
  readonly kind: "workflow";
  readonly name: string;
  readonly input_type: SemanticType<In>;
  readonly output_type: SemanticType<Out>;
  readonly errors: readonly Err[];
  readonly plan: WorkflowPlanStep;
  readonly execution_policy?: {
    readonly timeout_ms?: number;
    readonly retry?: {
      readonly max_attempts: number;
      readonly backoff: "none" | "fixed" | "exponential";
    };
    readonly idempotency?: boolean;
  };
  readonly requirements?: readonly Requirement[];
  readonly effects?: readonly Effect[];
  readonly traits: readonly ["callable", "effectful", "requires"];
  readonly _input?: In;
  readonly _output?: Out;
  readonly _errors?: Err;
  readonly _requires?: Req;
  readonly _effects?: Eff;
}

export const defineWorkflow = <In, Out, Err = unknown, Req = unknown, Eff = unknown>(input: {
  readonly name: string;
  readonly input_type: SemanticType<In> | Entity;
  readonly output_type: SemanticType<Out> | Entity;
  readonly errors?: readonly Err[];
  readonly plan: WorkflowPlanStep;
  readonly execution_policy?: {
    readonly timeout_ms?: number;
    readonly retry?: {
      readonly max_attempts: number;
      readonly backoff: "none" | "fixed" | "exponential";
    };
    readonly idempotency?: boolean;
  };
  readonly requirements?: readonly Requirement[];
  readonly effects?: readonly Effect[];
}): Workflow<In, Out, Err, Req, Eff> => ({
  kind: "workflow",
  name: input.name,
  input_type: entityToSemanticType(input.input_type),
  output_type: entityToSemanticType(input.output_type),
  errors: input.errors ?? [],
  plan: input.plan,
  execution_policy: input.execution_policy,
  requirements: input.requirements,
  effects: input.effects,
  traits: ["callable", "effectful", "requires"],
});

export const workflowCall = (target: StaticFunction | ExprFunction): WorkflowCallStep => ({
  kind: "workflow_call",
  target,
});

export const workflowQuery = (target: QueryFunction): WorkflowQueryStep => ({
  kind: "workflow_query",
  target,
});

export const workflowAction = (target: ActionFunction): WorkflowActionStep => ({
  kind: "workflow_action",
  target,
});

export const workflowSequence = (steps: readonly WorkflowPlanStep[]): WorkflowSequenceStep => ({
  kind: "workflow_sequence",
  steps,
});

export const workflowParallel = (branches: readonly WorkflowPlanStep[]): WorkflowParallelStep => ({
  kind: "workflow_parallel",
  branches,
});

export const workflowBranch = (
  predicate: string,
  if_true: WorkflowPlanStep,
  if_false: WorkflowPlanStep,
): WorkflowBranchStep => ({
  kind: "workflow_branch",
  predicate,
  if_true,
  if_false,
});

export const workflowWait = (duration_ms: number): WorkflowWaitStep => ({
  kind: "workflow_wait",
  duration_ms,
});

export const workflowWaitForEvent = (
  event_type: string,
  correlation_key?: string,
): WorkflowWaitForEventStep => ({
  kind: "workflow_wait_for_event",
  event_type,
  correlation_key,
});

export const workflowChild = (workflow: Workflow, input_mapping?: string): WorkflowChildStep => ({
  kind: "workflow_child",
  workflow,
  input_mapping,
});

export const workflowCheckpoint = (name: string): WorkflowCheckpointStep => ({
  kind: "workflow_checkpoint",
  name,
});

export const workflowCompensate = (
  primary: WorkflowPlanStep,
  compensate: WorkflowPlanStep,
): WorkflowCompensationStep => ({
  kind: "workflow_compensation",
  primary,
  compensate,
});

export const workflowRetry = (
  step: WorkflowPlanStep,
  max_attempts: number,
  backoff: "none" | "fixed" | "exponential",
): WorkflowRetryStep => ({
  kind: "workflow_retry",
  step,
  max_attempts,
  backoff,
});

export const workflowEmit = (event: Event): WorkflowEmitStep => ({
  kind: "workflow_emit",
  event,
});

export const workflowInvalidate = (
  patterns: readonly KeyPatternExpression[],
): WorkflowInvalidateStep => ({
  kind: "workflow_invalidate",
  patterns,
});

const hasDbWrite = (effects: readonly Effect[]): boolean =>
  effects.some((e) => e.kind === "db_write");

const isNonIdempotentAction = (step: WorkflowPlanStep): boolean => {
  if (step.kind === "workflow_action") {
    const target = step.target;
    return (
      hasDbWrite(target.effects) && !target.effects.some((e) => e.kind === "idempotent_effect")
    );
  }
  return false;
};

const walkSteps = (step: WorkflowPlanStep, onStep: (s: WorkflowPlanStep) => void): void => {
  onStep(step);
  switch (step.kind) {
    case "workflow_sequence":
      step.steps.forEach((s) => walkSteps(s, onStep));
      break;
    case "workflow_parallel":
      step.branches.forEach((s) => walkSteps(s, onStep));
      break;
    case "workflow_branch":
      walkSteps(step.if_true, onStep);
      walkSteps(step.if_false, onStep);
      break;
    case "workflow_compensation":
      walkSteps(step.primary, onStep);
      walkSteps(step.compensate, onStep);
      break;
    case "workflow_retry":
      walkSteps(step.step, onStep);
      break;
  }
};

export const checkWorkflows = (ctx: GenContext): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const workflow of ctx.workflows) {
    let hasDbWriteAction = false;
    let hasCompensation = false;
    let hasCheckpoint = false;
    let leafStepCount = 0;
    let hasOpaqueStep = false;

    walkSteps(workflow.plan, (step) => {
      // Track structural properties for post-walk diagnostics
      if (
        step.kind === "workflow_action" &&
        step.target.effects.some((e) => e.kind === "db_write")
      ) {
        hasDbWriteAction = true;
      }
      if (step.kind === "workflow_compensation") {
        hasCompensation = true;
      }
      if (step.kind === "workflow_checkpoint") {
        hasCheckpoint = true;
      }
      if (
        step.kind === "workflow_action" ||
        step.kind === "workflow_query" ||
        step.kind === "workflow_call" ||
        step.kind === "workflow_emit" ||
        step.kind === "workflow_invalidate"
      ) {
        leafStepCount++;
      }
      if (
        step.kind === "workflow_action" &&
        step.target.target_runtimes.some((r) => r.name === "opaque")
      ) {
        hasOpaqueStep = true;
      }

      switch (step.kind) {
        case "workflow_parallel":
          diagnostics.push(
            diagnostic({
              severity: "warning",
              code: "workflow:unsupported-parallelism",
              message: `Workflow "${workflow.name}" contains a parallel step`,
              suggestion: "Ensure the target runtime supports parallel execution.",
            }),
          );
          break;
        case "workflow_wait_for_event":
          diagnostics.push(
            diagnostic({
              severity: "warning",
              code: "workflow:unsupported-durable-wait",
              message: `Workflow "${workflow.name}" contains a durable wait-for-event step`,
              suggestion: "Use a simple wait or ensure the target supports durable event waiting.",
            }),
          );
          if (!step.correlation_key) {
            diagnostics.push(
              diagnostic({
                severity: "error",
                code: "workflow:missing-event-correlation",
                message: `Workflow "${workflow.name}" wait-for-event step lacks a correlation key`,
                suggestion: "Add a correlation_key to match the awaited event.",
              }),
            );
          }
          break;
        case "workflow_child":
          diagnostics.push(
            diagnostic({
              severity: "warning",
              code: "workflow:unsupported-child-workflow",
              message: `Workflow "${workflow.name}" starts a child workflow`,
              suggestion: "Ensure the target runtime supports child workflow execution.",
            }),
          );
          break;
        case "workflow_checkpoint":
          diagnostics.push(
            diagnostic({
              severity: "warning",
              code: "workflow:unsupported-checkpoint",
              message: `Workflow "${workflow.name}" contains a checkpoint step`,
              suggestion: "Ensure the target runtime supports checkpointing.",
            }),
          );
          break;
        case "workflow_compensation":
          diagnostics.push(
            diagnostic({
              severity: "warning",
              code: "workflow:unsupported-compensation",
              message: `Workflow "${workflow.name}" contains a compensation step`,
              suggestion: "Ensure the target runtime supports compensation/saga semantics.",
            }),
          );
          break;
        case "workflow_retry":
          if (isNonIdempotentAction(step.step)) {
            diagnostics.push(
              diagnostic({
                severity: "error",
                code: "workflow:retry-non-idempotent",
                message: `Workflow "${workflow.name}" retries a non-idempotent action`,
                suggestion: "Make the action idempotent or avoid retrying it.",
              }),
            );
          }
          diagnostics.push(
            diagnostic({
              severity: "warning",
              code: "workflow:unsupported-retry",
              message: `Workflow "${workflow.name}" contains a retry step`,
              suggestion: "Ensure the target runtime supports retry semantics.",
            }),
          );
          break;
        case "workflow_branch":
          if (!step.predicate || step.predicate.trim().length === 0) {
            diagnostics.push(
              diagnostic({
                severity: "error",
                code: "workflow:non-boolean-branch",
                message: `Workflow "${workflow.name}" branch step has an empty predicate`,
                suggestion: "Provide a non-empty predicate expression.",
              }),
            );
          }
          break;
      }
    });

    if (hasDbWriteAction && !hasCompensation) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "workflow:compensation-missing",
          message: `Workflow "${workflow.name}" has database-writing actions but no compensation step`,
          suggestion: "Add a compensation step to handle failures and maintain consistency.",
        }),
      );
    }

    if (hasOpaqueStep) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "workflow:opaque-step-not-portable",
          message: `Workflow "${workflow.name}" contains an opaque runtime step`,
          suggestion: "Replace opaque steps with typed targets for portability.",
        }),
      );
    }

    if (leafStepCount > 5 && !hasCheckpoint) {
      diagnostics.push(
        diagnostic({
          severity: "info",
          code: "workflow:long-running-without-checkpoint",
          message: `Workflow "${workflow.name}" has ${leafStepCount} steps but no checkpoint`,
          suggestion: "Add checkpoint steps to enable recovery on failure.",
        }),
      );
    }

    if (workflow.errors.length > 0) {
      const hasErrorHandler =
        workflow.plan.kind === "workflow_sequence" &&
        workflow.plan.steps.some(
          (s) => s.kind === "workflow_compensation" || s.kind === "workflow_cancel",
        );
      if (!hasErrorHandler) {
        diagnostics.push(
          diagnostic({
            severity: "warning",
            code: "workflow:unhandled-error",
            message: `Workflow "${workflow.name}" declares errors but has no compensation or cancellation step`,
            suggestion: "Add compensation or cancellation steps to handle declared errors.",
          }),
        );
      }
    }
  }

  return diagnostics;
};
