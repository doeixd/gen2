/* @__NO_SIDE_EFFECTS__ */
/**
 * Schedule and cron job IR for typed, inspectable scheduled work.
 *
 * Schedules describe when work starts. Cron jobs bind a schedule to a typed
 * callable run target with execution policy, identity, and target capability
 * metadata.
 */

import type { Diagnostic, GenContext } from "../core/index.ts";
import { diagnostic } from "../core/index.ts";
import type { ActionFunction } from "../function/index.ts";
import type { Effect } from "../types/index.ts";

export type ScheduleExpression =
  | { readonly kind: "cron"; readonly expression: string }
  | { readonly kind: "interval"; readonly duration_ms: number }
  | { readonly kind: "daily"; readonly hour: number; readonly minute: number }
  | {
      readonly kind: "weekly";
      readonly day: number;
      readonly hour: number;
      readonly minute: number;
    }
  | {
      readonly kind: "monthly";
      readonly day: number;
      readonly hour: number;
      readonly minute: number;
    }
  | { readonly kind: "calendar"; readonly calendar_ref: string }
  | { readonly kind: "one_off"; readonly timestamp: number }
  | { readonly kind: "opaque"; readonly expression: string };

export interface Schedule<Name extends string = string> {
  readonly kind: "schedule";
  readonly name: Name;
  readonly expression: ScheduleExpression;
  readonly timezone?: string;
  readonly calendar_policy?: "skip" | "include" | "shift";
  readonly jitter_policy?: "none" | "random" | "proportional";
  readonly misfire_policy?: "ignore" | "fire_once" | "fire_all";
  readonly enabled?: boolean;
  readonly _name?: Name;
}

export interface ScheduledFireContext {
  readonly kind: "scheduled_fire_context";
  readonly scheduled_time: number;
  readonly fired_time: number;
  readonly schedule_name: string;
  readonly attempt: number;
  readonly window_start?: number;
  readonly window_end?: number;
}

export interface CronExecutionPolicy {
  readonly kind: "cron_execution_policy";
  readonly concurrency: "allow" | "forbid" | "replace";
  readonly retry?: {
    readonly max_attempts: number;
    readonly backoff: "none" | "fixed" | "exponential";
  };
  readonly timeout_ms?: number;
  readonly idempotency?: boolean;
  readonly misfire?: "ignore" | "fire_once" | "fire_all";
  readonly catchup?: boolean;
  readonly delivery?: "at_least_once" | "at_most_once" | "exactly_once";
  readonly observability?: boolean;
  readonly overlap_policy?: "skip" | "delay" | "run_parallel";
}

export interface CronJob<In = unknown, Out = unknown, Err = unknown, Req = unknown, Eff = unknown> {
  readonly kind: "cron_job";
  readonly name: string;
  readonly schedule: Schedule;
  readonly run_target: ActionFunction<In, Out, Err, Req, Eff, unknown>;
  readonly input_mapping?: string;
  readonly execution_policy: CronExecutionPolicy;
  readonly execution_identity?: string;
  readonly fallback_schedule?: Schedule;
  readonly _input?: In;
  readonly _output?: Out;
  readonly _errors?: Err;
  readonly _requires?: Req;
  readonly _effects?: Eff;
}

export const defineSchedule = <const Name extends string>(input: {
  readonly name: Name;
  readonly expression: ScheduleExpression;
  readonly timezone?: string;
  readonly calendar_policy?: "skip" | "include" | "shift";
  readonly jitter_policy?: "none" | "random" | "proportional";
  readonly misfire_policy?: "ignore" | "fire_once" | "fire_all";
  readonly enabled?: boolean;
}): Schedule<Name> => ({
  kind: "schedule",
  name: input.name,
  expression: input.expression,
  timezone: input.timezone,
  calendar_policy: input.calendar_policy,
  jitter_policy: input.jitter_policy,
  misfire_policy: input.misfire_policy,
  enabled: input.enabled ?? true,
});

export const cronExpression = (expression: string): ScheduleExpression => ({
  kind: "cron",
  expression,
});

export const intervalExpression = (duration_ms: number): ScheduleExpression => ({
  kind: "interval",
  duration_ms,
});

export const dailyExpression = (hour: number, minute: number): ScheduleExpression => ({
  kind: "daily",
  hour,
  minute,
});

export const weeklyExpression = (
  day: number,
  hour: number,
  minute: number,
): ScheduleExpression => ({
  kind: "weekly",
  day,
  hour,
  minute,
});

export const defineCronJob = <In, Out, Err, Req, Eff>(input: {
  readonly name: string;
  readonly schedule: Schedule;
  readonly run_target: ActionFunction<In, Out, Err, Req, Eff, unknown>;
  readonly input_mapping?: string;
  readonly execution_policy?: CronExecutionPolicy;
  readonly execution_identity?: string;
  readonly fallback_schedule?: Schedule;
}): CronJob<In, Out, Err, Req, Eff> => ({
  kind: "cron_job",
  name: input.name,
  schedule: input.schedule,
  run_target: input.run_target,
  input_mapping: input.input_mapping,
  execution_policy: input.execution_policy ?? {
    kind: "cron_execution_policy",
    concurrency: "forbid",
    idempotency: false,
    observability: true,
  },
  execution_identity: input.execution_identity,
  fallback_schedule: input.fallback_schedule,
});

const hasDbWrite = (effects: readonly Effect[]): boolean =>
  effects.some((e) => e.kind === "db_write");

const hasServerOnly = (run_target: ActionFunction<any, any, any, any, any, any>): boolean =>
  run_target.target_runtimes.some((r) => r.name === "server") || hasDbWrite(run_target.effects);

export const checkCronJobs = (ctx: GenContext): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const job of ctx.cron_jobs) {
    const target = job.run_target;

    if (job.schedule.expression.kind === "opaque") {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "cron:opaque-schedule",
          message: `Cron job "${job.name}" uses an opaque schedule expression`,
          suggestion: "Use a typed schedule expression for portability.",
        }),
      );
    }

    if (hasDbWrite(target.effects) && !job.execution_policy.idempotency) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "cron:missing-idempotency",
          message: `Cron job "${job.name}" writes to the database but lacks idempotency`,
          suggestion: "Enable idempotency in the execution policy or make the action idempotent.",
        }),
      );
    }

    if (hasDbWrite(target.effects) && job.execution_policy.concurrency === "allow") {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "cron:unsafe-concurrency",
          message: `Cron job "${job.name}" allows concurrent execution of a database-writing action`,
          suggestion: "Use concurrency: 'forbid' or 'replace' for database-writing cron jobs.",
        }),
      );
    }

    if (hasServerOnly(target) && !job.execution_identity) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "cron:missing-execution-identity",
          message: `Cron job "${job.name}" performs protected work but has no execution identity`,
          suggestion: "Provide an execution_identity for cron jobs that run protected actions.",
        }),
      );
    }

    if (
      job.execution_policy.timeout_ms !== undefined &&
      job.execution_policy.timeout_ms > 300_000
    ) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "cron:excessive-timeout",
          message: `Cron job "${job.name}" has a timeout of ${job.execution_policy.timeout_ms}ms`,
          suggestion: "Consider breaking long-running cron jobs into smaller steps or workflows.",
        }),
      );
    }

    if (job.execution_policy.overlap_policy === undefined) {
      diagnostics.push(
        diagnostic({
          severity: "info",
          code: "cron:overlap-policy-missing",
          message: `Cron job "${job.name}" has no overlap policy`,
          suggestion:
            "Add an overlap_policy to define behavior when a previous run is still active.",
        }),
      );
    }

    if (job.execution_policy.timeout_ms !== undefined && job.execution_policy.timeout_ms < 1_000) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "cron:target-timeout-too-short",
          message: `Cron job "${job.name}" has a very short timeout of ${job.execution_policy.timeout_ms}ms`,
          suggestion: "Increase the timeout to at least 1000ms to avoid premature failures.",
        }),
      );
    }

    if (hasDbWrite(target.effects) && !job.execution_policy.idempotency) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "cron:protected-write-without-policy",
          message: `Cron job "${job.name}" writes to the database but lacks a protected-write policy`,
          suggestion: "Enable idempotency or add a write policy to prevent duplicate mutations.",
        }),
      );
    }

    if (target.target_runtimes.some((r) => r.name === "opaque")) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "cron:raw-runtime-callback",
          message: `Cron job "${job.name}" targets an opaque runtime`,
          suggestion: "Use a typed runtime target for portability and observability.",
        }),
      );
    }
  }

  return diagnostics;
};
