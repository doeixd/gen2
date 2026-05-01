/* @__NO_SIDE_EFFECTS__ */
/**
 * Target integration matrix documenting which Phase 4 IR each production
 * target can consume, and their capability metadata.
 */

export type Phase4Feature =
  | "requirements_providers"
  | "state_resources"
  | "hydration_projections"
  | "single_flight"
  | "obligations"
  | "merge_strategies"
  | "offline_queues"
  | "cron_jobs"
  | "workflows"
  | "boundary_plans";

export type TargetSupport = "full" | "partial" | "planned" | "unsupported";

export interface TargetIntegrationRow {
  readonly target_name: string;
  readonly requirements_providers: TargetSupport;
  readonly state_resources: TargetSupport;
  readonly hydration_projections: TargetSupport;
  readonly single_flight: TargetSupport;
  readonly obligations: TargetSupport;
  readonly merge_strategies: TargetSupport;
  readonly offline_queues: TargetSupport;
  readonly cron_jobs: TargetSupport;
  readonly workflows: TargetSupport;
  readonly boundary_plans: TargetSupport;
}

export interface TargetIntegrationMatrix {
  readonly kind: "target_integration_matrix";
  readonly rows: readonly TargetIntegrationRow[];
}

const defaultMatrix: TargetIntegrationRow[] = [
  {
    target_name: "server",
    requirements_providers: "full",
    state_resources: "partial",
    hydration_projections: "full",
    single_flight: "full",
    obligations: "unsupported",
    merge_strategies: "partial",
    offline_queues: "full",
    cron_jobs: "full",
    workflows: "full",
    boundary_plans: "full",
  },
  {
    target_name: "client",
    requirements_providers: "partial",
    state_resources: "full",
    hydration_projections: "full",
    single_flight: "partial",
    obligations: "unsupported",
    merge_strategies: "partial",
    offline_queues: "partial",
    cron_jobs: "unsupported",
    workflows: "planned",
    boundary_plans: "partial",
  },
  {
    target_name: "relational_storage",
    requirements_providers: "unsupported",
    state_resources: "unsupported",
    hydration_projections: "unsupported",
    single_flight: "unsupported",
    obligations: "unsupported",
    merge_strategies: "partial",
    offline_queues: "unsupported",
    cron_jobs: "unsupported",
    workflows: "unsupported",
    boundary_plans: "unsupported",
  },
  {
    target_name: "standard_schema",
    requirements_providers: "unsupported",
    state_resources: "unsupported",
    hydration_projections: "unsupported",
    single_flight: "unsupported",
    obligations: "unsupported",
    merge_strategies: "partial",
    offline_queues: "unsupported",
    cron_jobs: "unsupported",
    workflows: "unsupported",
    boundary_plans: "unsupported",
  },
];

export const buildTargetIntegrationMatrix = (): TargetIntegrationMatrix => ({
  kind: "target_integration_matrix",
  rows: defaultMatrix,
});

export const targetSupportsFeature = (
  matrix: TargetIntegrationMatrix,
  target_name: string,
  feature: Phase4Feature,
): boolean => {
  const row = matrix.rows.find((r) => r.target_name === target_name);
  if (!row) return false;
  const support = row[feature];
  return support === "full" || support === "partial";
};
