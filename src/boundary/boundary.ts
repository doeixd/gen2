/* @__NO_SIDE_EFFECTS__ */
/**
 * Boundary, transport, and runtime placement graph.
 *
 * Describes where functions/resources/actions run, which transports connect
 * them, and what serialization/auth/reactivity semantics cross the boundary.
 */

import type { Diagnostic, GenContext } from "../core/index.ts";
import { diagnostic } from "../core/index.ts";
import type { ActionFunction, QueryFunction, StaticFunction } from "../function/index.ts";
import type { RequirementRef } from "../requirements/index.ts";
import type { SerializationContract } from "../hydration/index.ts";
import type { KeyPatternExpression } from "../reactivity/index.ts";
import type { Effect, Requirement } from "../types/index.ts";

export type RuntimeBoundary =
  | { readonly kind: "browser_boundary"; readonly name: string }
  | { readonly kind: "server_boundary"; readonly name: string }
  | { readonly kind: "database_boundary"; readonly name: string }
  | { readonly kind: "worker_boundary"; readonly name: string }
  | { readonly kind: "edge_boundary"; readonly name: string }
  | { readonly kind: "native_boundary"; readonly name: string }
  | { readonly kind: "queue_boundary"; readonly name: string }
  | { readonly kind: "external_service_boundary"; readonly name: string };

export type TransportKind =
  | "http"
  | "rpc"
  | "websocket"
  | "server_action"
  | "queue"
  | "offline_command"
  | "hydration";

export interface TransportPlan {
  readonly kind: "transport_plan";
  readonly transport: TransportKind;
  readonly source_boundary: RuntimeBoundary;
  readonly target_boundary: RuntimeBoundary;
  readonly serialization?: SerializationContract;
  readonly auth_required?: boolean;
}

export interface BoundaryCallPlan<
  Source extends StaticFunction | ActionFunction | QueryFunction =
    | StaticFunction
    | ActionFunction
    | QueryFunction,
> {
  readonly kind: "boundary_call_plan";
  readonly name: string;
  readonly callable: Source;
  readonly client_boundary: RuntimeBoundary;
  readonly server_boundary: RuntimeBoundary;
  readonly transport: TransportPlan;
  readonly input_contract?: SerializationContract;
  readonly output_contract?: SerializationContract;
  readonly error_contract?: SerializationContract;
  readonly auth_requirements?: readonly Requirement[];
  readonly provider_requirements?: readonly RequirementRef[];
  readonly invalidation_payloads?: readonly KeyPatternExpression[];
  readonly optimistic_plan?: string;
  readonly offline_plan?: string;
}

export const browserBoundary = (name = "browser"): RuntimeBoundary => ({
  kind: "browser_boundary",
  name,
});

export const serverBoundary = (name = "server"): RuntimeBoundary => ({
  kind: "server_boundary",
  name,
});

export const databaseBoundary = (name = "database"): RuntimeBoundary => ({
  kind: "database_boundary",
  name,
});

export const workerBoundary = (name = "worker"): RuntimeBoundary => ({
  kind: "worker_boundary",
  name,
});

export const edgeBoundary = (name = "edge"): RuntimeBoundary => ({
  kind: "edge_boundary",
  name,
});

export const queueBoundary = (name = "queue"): RuntimeBoundary => ({
  kind: "queue_boundary",
  name,
});

export const externalServiceBoundary = (name: string): RuntimeBoundary => ({
  kind: "external_service_boundary",
  name,
});

export const defineTransportPlan = (input: {
  readonly transport: TransportKind;
  readonly source_boundary: RuntimeBoundary;
  readonly target_boundary: RuntimeBoundary;
  readonly serialization?: SerializationContract;
  readonly auth_required?: boolean;
}): TransportPlan => ({
  kind: "transport_plan",
  transport: input.transport,
  source_boundary: input.source_boundary,
  target_boundary: input.target_boundary,
  serialization: input.serialization,
  auth_required: input.auth_required,
});

export const defineBoundaryCallPlan = <
  Source extends StaticFunction | ActionFunction | QueryFunction,
>(input: {
  readonly name: string;
  readonly callable: Source;
  readonly client_boundary: RuntimeBoundary;
  readonly server_boundary: RuntimeBoundary;
  readonly transport: TransportPlan;
  readonly input_contract?: SerializationContract;
  readonly output_contract?: SerializationContract;
  readonly error_contract?: SerializationContract;
  readonly auth_requirements?: readonly Requirement[];
  readonly provider_requirements?: readonly RequirementRef[];
  readonly invalidation_payloads?: readonly KeyPatternExpression[];
  readonly optimistic_plan?: string;
  readonly offline_plan?: string;
}): BoundaryCallPlan<Source> => ({
  kind: "boundary_call_plan",
  name: input.name,
  callable: input.callable,
  client_boundary: input.client_boundary,
  server_boundary: input.server_boundary,
  transport: input.transport,
  input_contract: input.input_contract,
  output_contract: input.output_contract,
  error_contract: input.error_contract,
  auth_requirements: input.auth_requirements,
  provider_requirements: input.provider_requirements,
  invalidation_payloads: input.invalidation_payloads,
  optimistic_plan: input.optimistic_plan,
  offline_plan: input.offline_plan,
});

const hasDbWrite = (effects: readonly Effect[]): boolean =>
  effects.some((e) => e.kind === "db_write");

const isServerOnly = (callable: StaticFunction | ActionFunction | QueryFunction): boolean => {
  if ("effects" in callable && callable.effects) {
    if (hasDbWrite(callable.effects)) return true;
  }
  if ("target_runtimes" in callable && callable.target_runtimes) {
    return callable.target_runtimes.some((r) => r.name === "server");
  }
  return false;
};

export const deriveBoundaryPlans = (ctx: GenContext): readonly BoundaryCallPlan[] => {
  const plans: BoundaryCallPlan[] = [];
  const client = browserBoundary();
  const server = serverBoundary();

  for (const action of ctx.action_functions) {
    if (
      action.target_runtimes.length === 0 ||
      action.target_runtimes.some((r) => r.name === "server")
    ) {
      plans.push(
        defineBoundaryCallPlan({
          name: action.name,
          callable: action,
          client_boundary: client,
          server_boundary: server,
          transport: defineTransportPlan({
            transport: "server_action",
            source_boundary: client,
            target_boundary: server,
          }),
          auth_requirements: action.requirements,
          invalidation_payloads: action.reactivity?.invalidates.map((inv) =>
            inv.kind === "constant_key_pattern_expression" ? inv : inv,
          ),
        }),
      );
    }
  }

  for (const query of ctx.query_functions) {
    if (
      query.target_runtimes.length === 0 ||
      query.target_runtimes.some((r) => r.name === "server")
    ) {
      plans.push(
        defineBoundaryCallPlan({
          name: query.name,
          callable: query,
          client_boundary: client,
          server_boundary: server,
          transport: defineTransportPlan({
            transport: "http",
            source_boundary: client,
            target_boundary: server,
          }),
          auth_requirements: query.requirements,
        }),
      );
    }
  }

  return plans;
};

export const checkBoundaryPlans = (ctx: GenContext): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const plans = ctx.boundary_plans.length > 0 ? ctx.boundary_plans : deriveBoundaryPlans(ctx);

  for (const plan of plans) {
    const callable = plan.callable;

    if (isServerOnly(callable) && plan.client_boundary.kind === "browser_boundary") {
      const transport = plan.transport.transport;
      if (transport === "http" || transport === "server_action") {
        diagnostics.push(
          diagnostic({
            severity: "error",
            code: "boundary:server-only-client-call",
            message: `Boundary call "${plan.name}" invokes a server-only callable from the client boundary`,
            suggestion: "Add a safe projection or move the callable to a client-safe runtime.",
          }),
        );
      }
    }

    if (plan.transport.transport === "websocket") {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "boundary:websocket-capability",
          message: `Boundary call "${plan.name}" uses WebSocket transport`,
          suggestion: "Ensure the target resource supports streaming/subscription semantics.",
        }),
      );
    }

    if (plan.transport.transport === "queue") {
      if ("effects" in callable && callable.effects && hasDbWrite(callable.effects)) {
        if (!callable.effects.some((e) => e.kind === "idempotent_effect")) {
          diagnostics.push(
            diagnostic({
              severity: "warning",
              code: "boundary:queue-non-idempotent",
              message: `Boundary call "${plan.name}" sends a non-idempotent action over a queue`,
              suggestion: "Make the action idempotent or use a different transport.",
            }),
          );
        }
      }
      if (!plan.input_contract || plan.input_contract.validation === "none") {
        diagnostics.push(
          diagnostic({
            severity: "warning",
            code: "boundary:queue-missing-serialization",
            message: `Boundary call "${plan.name}" uses queue transport without strict serialization`,
            suggestion: "Add a strict serialization contract for queue messages.",
          }),
        );
      }
    }

    if (plan.server_boundary.kind === "edge_boundary") {
      if ("effects" in callable && callable.effects) {
        const unsupported = callable.effects.filter(
          (e) => e.kind === "db_write" || e.kind === "filesystem" || e.kind === "payment",
        );
        if (unsupported.length > 0) {
          diagnostics.push(
            diagnostic({
              severity: "error",
              code: "boundary:edge-unsupported-effect",
              message: `Boundary call "${plan.name}" places unsupported effects on edge runtime`,
              suggestion: "Move database, filesystem, or payment effects to a server runtime.",
            }),
          );
        }
      }
    }

    if (plan.transport.transport !== "http" && !plan.input_contract) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "boundary:serializer-missing",
          message: `Boundary call "${plan.name}" uses ${plan.transport.transport} transport without a serialization contract`,
          suggestion: "Add an input_contract serializer for non-HTTP transports.",
        }),
      );
    }

    if (
      (!plan.auth_requirements || plan.auth_requirements.length === 0) &&
      (plan.transport.transport === "http" || plan.transport.transport === "websocket")
    ) {
      diagnostics.push(
        diagnostic({
          severity: "info",
          code: "boundary:transport-auth-missing",
          message: `Boundary call "${plan.name}" uses ${plan.transport.transport} without auth requirements`,
          suggestion: "Add auth_requirements to authenticate cross-boundary calls.",
        }),
      );
    }
  }

  return diagnostics;
};
