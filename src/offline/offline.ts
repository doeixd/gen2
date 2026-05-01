/* @__NO_SIDE_EFFECTS__ */
/**
 * Offline command envelope and queue plan IR.
 *
 * Models whether a mutation can be queued, replayed, deduplicated,
 * and reconciled after replay.
 */

import type { SemanticType } from "../types/index.ts";
import type { StorageLocation } from "../storage/locations.ts";
import type { KeyFamily } from "../reactivity/index.ts";
import { diagnostic, type Diagnostic } from "../core/index.ts";
import type { Sensitivity } from "../requirements/index.ts";

export interface OfflineCommandEnvelope<In = unknown> {
  readonly kind: "offline_command_envelope";
  readonly action_name: string;
  readonly input_type: SemanticType<In>;
  readonly serializer?: string;
  readonly idempotency_key?: string;
  readonly ordering_key?: string;
  readonly conflict_policy?: "reject" | "overwrite" | "queue";
  readonly retry_policy?: "none" | "fixed" | "exponential";
  readonly replay_requirements?: readonly string[];
  readonly _input?: In;
}

export interface OfflineQueuePlan {
  readonly kind: "offline_queue_plan";
  readonly name: string;
  readonly storage: StorageLocation;
  readonly queue_key_family?: KeyFamily;
  readonly persistence: boolean;
  readonly encryption_required: boolean;
  readonly drain_trigger?: "online" | "manual" | "scheduled";
  readonly sensitivity?: Sensitivity;
}

export const defineOfflineCommandEnvelope = <In>(input: {
  readonly action_name: string;
  readonly input_type: SemanticType<In>;
  readonly serializer?: string;
  readonly idempotency_key?: string;
  readonly ordering_key?: string;
  readonly conflict_policy?: "reject" | "overwrite" | "queue";
  readonly retry_policy?: "none" | "fixed" | "exponential";
  readonly replay_requirements?: readonly string[];
}): OfflineCommandEnvelope<In> => ({
  kind: "offline_command_envelope",
  action_name: input.action_name,
  input_type: input.input_type,
  serializer: input.serializer,
  idempotency_key: input.idempotency_key,
  ordering_key: input.ordering_key,
  conflict_policy: input.conflict_policy,
  retry_policy: input.retry_policy,
  replay_requirements: input.replay_requirements,
});

export const defineOfflineQueuePlan = (input: {
  readonly name: string;
  readonly storage: StorageLocation;
  readonly queue_key_family?: KeyFamily;
  readonly persistence?: boolean;
  readonly encryption_required?: boolean;
  readonly drain_trigger?: "online" | "manual" | "scheduled";
  readonly sensitivity?: Sensitivity;
}): OfflineQueuePlan => ({
  kind: "offline_queue_plan",
  name: input.name,
  storage: input.storage,
  queue_key_family: input.queue_key_family,
  persistence: input.persistence ?? false,
  encryption_required: input.encryption_required ?? false,
  drain_trigger: input.drain_trigger,
  sensitivity: input.sensitivity,
});

export const checkOfflinePlans = (
  envelopes: readonly OfflineCommandEnvelope[],
  queues: readonly OfflineQueuePlan[],
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const envelope of envelopes) {
    if (!envelope.idempotency_key) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "offline:missing-idempotency-key",
          message: `Offline command envelope for "${envelope.action_name}" has no idempotency key`,
          suggestion: "Add an idempotency_key for safe replay.",
        }),
      );
    }
    if (!envelope.conflict_policy) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "offline:missing-conflict-policy",
          message: `Offline command envelope for "${envelope.action_name}" has no conflict policy`,
          suggestion: "Add a conflict_policy to define replay behavior.",
        }),
      );
    }
    if (!envelope.input_type.has_serializer) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "offline:payload-not-serializable",
          message: `Offline command envelope for "${envelope.action_name}" input type "${envelope.input_type.name}" has no serializer`,
          suggestion: "Add a serializer to the input type so it can be queued and replayed.",
        }),
      );
    }
    if (envelope.replay_requirements && envelope.replay_requirements.length > 0) {
      diagnostics.push(
        diagnostic({
          severity: "info",
          code: "offline:replay-provider-unavailable",
          message: `Offline command envelope for "${envelope.action_name}" has replay requirements that must be satisfied at drain time`,
          suggestion:
            "Ensure all replay_requirements providers are available before draining the queue.",
        }),
      );
    }
  }

  for (const queue of queues) {
    if (
      (queue.sensitivity === "secret" ||
        queue.sensitivity === "regulated" ||
        queue.sensitivity === "auth") &&
      !queue.encryption_required
    ) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "offline:unsafe-sensitive-persistence",
          message: `Offline queue "${queue.name}" stores ${queue.sensitivity} data but encryption is not required`,
          suggestion: "Set encryption_required to true for sensitive offline queues.",
        }),
      );
    }
    if (!queue.drain_trigger) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "offline:missing-drain-trigger",
          message: `Offline queue "${queue.name}" has no drain trigger`,
          suggestion: "Add a drain_trigger to specify when the queue should replay.",
        }),
      );
    }
  }

  return diagnostics;
};
