/* @__NO_SIDE_EFFECTS__ */
/**
 * Reaction IR — typed effect plans that run when a rule becomes true.
 *
 * Reactions are a separate primitive from rules. Rules stay pure and
 * inspectable; reactions own the effectful interpretation.
 *
 * See atom_plan_progress.md :: REACT1.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { ActionFunction, ExprFunction } from "../function/index.ts";
import type { Rule } from "../rules/index.ts";

// --- Reaction Mode ---------------------------------------------------------

export type ReactionMode =
  | "on_true"
  | "on_transition_true"
  | "on_insert_match"
  | "on_update_match"
  | "on_delete_match"
  | "maintain";

// --- Idempotency Plan ------------------------------------------------------

export interface IdempotencyPlan {
  readonly key: "auto" | "input_hash" | "custom";
  readonly deduplicate_window_ms?: number;
}

// --- Delivery Plan ---------------------------------------------------------

export type DeliveryKind = "outbox" | "job_queue" | "webhook" | "inline";

export interface DeliveryPlan {
  readonly kind: DeliveryKind;
  readonly retry_count?: number;
  readonly retry_delay_ms?: number;
}

// --- Reaction IR -----------------------------------------------------------

export interface Reaction<
  Name extends string = string,
  Event = unknown,
  In = unknown,
  Out = unknown,
> {
  readonly kind: "reaction";
  readonly name: Name;
  readonly when: Rule;
  /** Optional projection from observed event/context into action input. */
  readonly select?: ExprFunction<Event, In>;
  readonly run: ActionFunction<In, Out>;
  readonly mode: ReactionMode;
  readonly idempotency?: IdempotencyPlan;
  readonly delivery?: DeliveryPlan;
}

// --- Builder ---------------------------------------------------------------

export interface ReactionBuilder<
  Name extends string = never,
  Event = unknown,
  In = unknown,
  Out = unknown,
> {
  name<N extends string>(n: N): ReactionBuilder<N, Event, In, Out>;
  when(rule: Rule): ReactionBuilder<Name, Event, In, Out>;
  select<E, I>(fn: ExprFunction<E, I>): ReactionBuilder<Name, E, I, Out>;
  run<AIn, AOut>(action: ActionFunction<AIn, AOut>): ReactionBuilder<Name, Event, AIn, AOut>;
  mode(m: ReactionMode): ReactionBuilder<Name, Event, In, Out>;
  idempotency(plan: IdempotencyPlan): ReactionBuilder<Name, Event, In, Out>;
  delivery(plan: DeliveryPlan): ReactionBuilder<Name, Event, In, Out>;
  build(): Reaction<Name, Event, In, Out>;
}

export const createReactionBuilder = (): ReactionBuilder<never, unknown, unknown, unknown> => {
  let currentName: string | undefined;
  let currentWhen: Rule | undefined;
  let currentSelect: ExprFunction<unknown, unknown> | undefined;
  let currentRun: ActionFunction<unknown, unknown> | undefined;
  let currentMode: ReactionMode | undefined;
  let currentIdempotency: IdempotencyPlan | undefined;
  let currentDelivery: DeliveryPlan | undefined;

  const builder = {
    name<N extends string>(n: N) {
      currentName = n;
      return this as unknown as ReactionBuilder<N, unknown, unknown, unknown>;
    },
    when(rule: Rule) {
      currentWhen = rule;
      return this as unknown as ReactionBuilder<never, unknown, unknown, unknown>;
    },
    select<E, I>(fn: ExprFunction<E, I>) {
      currentSelect = fn as ExprFunction<unknown, unknown>;
      return this as unknown as ReactionBuilder<never, E, I, unknown>;
    },
    run<AIn, AOut>(action: ActionFunction<AIn, AOut>) {
      currentRun = action as ActionFunction<unknown, unknown>;
      return this as unknown as ReactionBuilder<never, unknown, AIn, AOut>;
    },
    mode(m: ReactionMode) {
      currentMode = m;
      return this as unknown as ReactionBuilder<never, unknown, unknown, unknown>;
    },
    idempotency(plan: IdempotencyPlan) {
      currentIdempotency = plan;
      return this as unknown as ReactionBuilder<never, unknown, unknown, unknown>;
    },
    delivery(plan: DeliveryPlan) {
      currentDelivery = plan;
      return this as unknown as ReactionBuilder<never, unknown, unknown, unknown>;
    },
    build(): Reaction<string, unknown, unknown, unknown> {
      if (!currentName) {
        throw new Error("reaction builder: .name() must be called before .build()");
      }
      if (!currentWhen) {
        throw new Error("reaction builder: .when() must be called before .build()");
      }
      if (!currentRun) {
        throw new Error("reaction builder: .run() must be called before .build()");
      }
      if (!currentMode) {
        throw new Error("reaction builder: .mode() must be called before .build()");
      }
      return defineReactionImpl({
        name: currentName,
        when: currentWhen,
        select: currentSelect,
        run: currentRun,
        mode: currentMode,
        idempotency: currentIdempotency,
        delivery: currentDelivery,
      });
    },
  };

  return builder as unknown as ReactionBuilder<never, unknown, unknown, unknown>;
};

// --- Constructors ----------------------------------------------------------

const defineReactionImpl = <
  Name extends string,
  Event = unknown,
  In = unknown,
  Out = unknown,
>(input: {
  readonly name: Name;
  readonly when: Rule;
  readonly select?: ExprFunction<Event, In>;
  readonly run: ActionFunction<In, Out>;
  readonly mode: ReactionMode;
  readonly idempotency?: IdempotencyPlan;
  readonly delivery?: DeliveryPlan;
}): Reaction<Name, Event, In, Out> => ({
  kind: "reaction",
  name: input.name,
  when: input.when,
  select: input.select,
  run: input.run,
  mode: input.mode,
  idempotency: input.idempotency,
  delivery: input.delivery,
});

export function defineReaction<Name extends string, Event = unknown, In = unknown, Out = unknown>(
  builder: (b: ReactionBuilder<never, unknown, unknown, unknown>) => Reaction<Name, Event, In, Out>,
): Reaction<Name, Event, In, Out>;
export function defineReaction<
  Name extends string,
  Event = unknown,
  In = unknown,
  Out = unknown,
>(input: {
  readonly name: Name;
  readonly when: Rule;
  readonly select?: ExprFunction<Event, In>;
  readonly run: ActionFunction<In, Out>;
  readonly mode: ReactionMode;
  readonly idempotency?: IdempotencyPlan;
  readonly delivery?: DeliveryPlan;
}): Reaction<Name, Event, In, Out>;
export function defineReaction<Name extends string, Event = unknown, In = unknown, Out = unknown>(
  inputOrBuilder:
    | ((b: ReactionBuilder<never, unknown, unknown, unknown>) => Reaction<Name, Event, In, Out>)
    | {
        readonly name: Name;
        readonly when: Rule;
        readonly select?: ExprFunction<Event, In>;
        readonly run: ActionFunction<In, Out>;
        readonly mode: ReactionMode;
        readonly idempotency?: IdempotencyPlan;
        readonly delivery?: DeliveryPlan;
      },
): Reaction<Name, Event, In, Out> {
  if (typeof inputOrBuilder === "function") {
    return inputOrBuilder(createReactionBuilder());
  }
  return defineReactionImpl(inputOrBuilder);
}

// --- Checker ---------------------------------------------------------------

const isBooleanRule = (rule: Rule): boolean => {
  // All rules have boolean bodies by construction, but we double-check
  // that the body is one of the boolean expression kinds.
  const { body } = rule;
  switch (body.kind) {
    case "rule.eq":
    case "rule.compare":
    case "rule.and":
    case "rule.or":
    case "rule.not":
    case "rule.exists":
      return true;
    default:
      return false;
  }
};

const isActionFunction = (value: unknown): value is ActionFunction => {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    typeof obj.body === "object" &&
    obj.body !== null &&
    "operations" in obj.body &&
    "phase" in obj.body &&
    (obj.body as { phase: unknown }).phase === "mutation"
  );
};

export const checkReactions = (reactions: readonly Reaction[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const reaction of reactions) {
    // DuplicateName
    if (seen.has(reaction.name)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "reaction:duplicate-name",
          message: `Reaction name "${reaction.name}" is already defined`,
        }),
      );
    } else {
      seen.add(reaction.name);
    }

    // ConditionNotBoolean
    if (!isBooleanRule(reaction.when)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "reaction:condition-not-boolean",
          message: `Reaction "${reaction.name}" condition rule must have a boolean body`,
        }),
      );
    }

    // RunNotAction
    if (!isActionFunction(reaction.run)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "reaction:run-not-action",
          message: `Reaction "${reaction.name}" run must be an ActionFunction`,
        }),
      );
    }

    // MissingIdempotency for side-effect modes
    const sideEffectModes: ReactionMode[] = [
      "on_true",
      "on_transition_true",
      "on_insert_match",
      "on_update_match",
      "on_delete_match",
    ];
    if (sideEffectModes.includes(reaction.mode) && reaction.idempotency === undefined) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "reaction:missing-idempotency-key",
          message: `Reaction "${reaction.name}" mode "${reaction.mode}" should declare an idempotency plan`,
        }),
      );
    }

    // SideEffectWithoutDeliveryPlan
    if (sideEffectModes.includes(reaction.mode) && reaction.delivery === undefined) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "reaction:side-effect-without-delivery-plan",
          message: `Reaction "${reaction.name}" mode "${reaction.mode}" should declare a delivery plan`,
        }),
      );
    }

    // InputSelectionMismatch
    if (reaction.select) {
      const selectOutType = reaction.select.output_type?.name;
      const actionInType = reaction.run.input_type?.name;
      if (selectOutType && actionInType && selectOutType !== actionInType) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "reaction:input-selection-mismatch",
            message: `Reaction "${reaction.name}" select output type (${selectOutType}) does not match action input type (${actionInType})`,
            suggestion:
              "Ensure the select projection produces the same shape as the action's input.",
          }),
        );
      }
    }

    // UnsafeInlineEffect
    if (sideEffectModes.includes(reaction.mode) && reaction.delivery?.kind === "inline") {
      out.push(
        diagnostic({
          severity: "warning",
          code: "reaction:unsafe-inline-effect",
          message: `Reaction "${reaction.name}" uses inline delivery for a side-effect mode. Inline effects are unsafe for retries and partial failures.`,
          suggestion: "Use 'outbox' or 'job_queue' delivery for side-effect reactions.",
        }),
      );
    }
  }

  return out;
};
