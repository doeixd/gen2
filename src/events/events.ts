/* @__NO_SIDE_EFFECTS__ */
/**
 * Events, reducers, subscriptions, and the outbox. EventEmissions are concrete
 * per-call records that round-trip with Event.emitted_by — codegen materializes
 * one EventEmission per gen.events.emit() call discovered while traversing an
 * action's body.
 *
 * See spec/events.allium.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Field } from "../entity/index.ts";
import type { Expr } from "../expression/index.ts";
import type { ActionFunction, StaticFunction } from "../function/index.ts";
import type { SemanticType } from "../types/index.ts";

/** A field within an event payload with an optional source field mapping. */
export interface EventField {
  readonly name: string;
  readonly field_type: SemanticType;
  readonly source_field?: Field;
}

/** The structured payload of an event. */
export interface EventPayload {
  readonly fields: readonly EventField[];
}

/** A named event with a payload and back-references to emitting actions. */
export interface Event {
  readonly name: string;
  readonly payload: EventPayload;
  /** Mutators that emit this event. Round-trips with EventEmission. */
  emitted_by: ActionFunction[];
}

/** A concrete record of an action emitting an event. */
export interface EventEmission {
  readonly action: ActionFunction;
  readonly event: Event;
  readonly payload_expr?: Expr;
}

/** A monoid operation with associativity, commutativity, and idempotence flags. */
export interface MonoidOp {
  readonly name: string;
  readonly input_type: SemanticType;
  readonly output_type: SemanticType;
  readonly associative: boolean;
  readonly commutative: boolean;
  readonly idempotent: boolean;
}

/** A reducer that combines event payloads into a target field value. */
export interface Reducer {
  readonly name: string;
  readonly target_field: Field;
  readonly events: readonly Event[];
  readonly combine: MonoidOp;
  readonly empty_value?: Expr;
}

/** A subscription binding an event to a handler function. */
export interface Subscription {
  readonly name: string;
  readonly event: Event;
  readonly handler: StaticFunction;
  readonly payload_type: SemanticType;
}

/** A durable outbox record for reliable event delivery. */
export interface OutboxEntry {
  readonly event: Event;
  readonly payload: EventPayload;
  readonly emitted_at: string; // ISO-8601
  readonly processed: boolean;
}

// --- Constructors ---------------------------------------------------------

/**
 * Creates an Event record.
 *
 * @param name - Event name.
 * @param payload - Event payload definition.
 * @returns An Event record.
 */
export const defineEvent = (name: string, payload: EventPayload): Event => ({
  name,
  payload,
  emitted_by: [],
});

/**
 * Records an EventEmission and updates the event's emitted_by list.
 *
 * @param event - The event being emitted.
 * @param action - The action that emits the event.
 * @param payload_expr - Optional expression producing the payload.
 * @returns The EventEmission record.
 */
export const emit = (event: Event, action: ActionFunction, payload_expr?: Expr): EventEmission => {
  if (!event.emitted_by.includes(action)) {
    event.emitted_by.push(action);
  }
  return { action, event, payload_expr };
};

/**
 * Creates a Reducer record with a typed target field.
 *
 * @param name - Reducer name.
 * @param target_field - Target field to reduce into.
 * @param events - Source events.
 * @param combine - Monoid operation for combining values.
 * @param empty_value - Optional empty value expression.
 * @returns A Reducer.
 */
export const defineReducer = <Ts = unknown>(
  name: string,
  target_field: Field<Ts>,
  events: readonly Event[],
  combine: MonoidOp,
  empty_value?: Expr<Ts>,
): Reducer => ({ name, target_field, events, combine, empty_value });

/**
 * Creates a Subscription record with a typed payload.
 *
 * @param name - Subscription name.
 * @param event - Event to subscribe to.
 * @param handler - Handler static function.
 * @param payload_type - Payload semantic type.
 * @returns A Subscription.
 */
export const defineSubscription = <Ts = unknown>(
  name: string,
  event: Event,
  handler: StaticFunction,
  payload_type: SemanticType<Ts>,
): Subscription => ({ name, event, handler, payload_type });

// --- Invariants and rules --------------------------------------------------

/**
 * Validates event invariants: unique payload fields, emitted_by/emission consistency,
 * reducer event source matching, reducer associativity, reducer type matching,
 * effectful emission warnings, and subscription handler input matching.
 *
 * @param input - Event objects to validate.
 * @returns Diagnostics for any violated event rules.
 */
export const checkEvents = (input: {
  events: readonly Event[];
  emissions: readonly EventEmission[];
  reducers: readonly Reducer[];
  subscriptions: readonly Subscription[];
}): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // EventPayloadFieldsUnique
  for (const e of input.events) {
    const seen = new Set<string>();
    for (const f of e.payload.fields) {
      if (seen.has(f.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "events:duplicate-payload-field",
            message: `Event ${e.name} payload has duplicate field ${f.name}`,
          }),
        );
      }
      seen.add(f.name);
    }
  }

  // EmittedByMatchesEmissions
  for (const e of input.events) {
    for (const a of e.emitted_by) {
      const found = input.emissions.some((em) => em.action === a && em.event === e);
      if (!found) {
        out.push(
          diagnostic({
            severity: "error",
            code: "events:emitted-by-no-emission",
            message: `Event ${e.name} lists ${a.name} in emitted_by but no EventEmission record exists`,
          }),
        );
      }
    }
  }

  // EventEmissionListed
  for (const em of input.emissions) {
    if (!em.event.emitted_by.includes(em.action)) {
      out.push(
        diagnostic({
          severity: "error",
          code: "events:emission-not-listed",
          message: `EventEmission for ${em.action.name} -> ${em.event.name} not present in event.emitted_by`,
        }),
      );
    }
  }

  // ReducerEventsMatchTarget
  for (const r of input.reducers) {
    for (const e of r.events) {
      const ok = e.payload.fields.some((f) => f.source_field === r.target_field);
      if (!ok) {
        out.push(
          diagnostic({
            severity: "error",
            code: "events:reducer-event-no-source",
            message: `Reducer ${r.name} reads from event ${e.name} which has no payload field sourced from ${r.target_field.name}`,
          }),
        );
      }
    }
  }

  // NonAssociativeReducer rule
  for (const r of input.reducers) {
    if (!r.combine.associative) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "events:non-associative-reducer",
          message: `Reducer ${r.name} uses non-associative combine; replay/reorder may yield inconsistent state`,
        }),
      );
    }
  }

  // ReducerTypeMismatch
  for (const r of input.reducers) {
    if (r.combine.input_type.name !== r.target_field.semantic_type.name) {
      out.push(
        diagnostic({
          severity: "error",
          code: "events:reducer-type-mismatch",
          message: `Reducer ${r.name} combine input type does not match target field type`,
        }),
      );
    }
  }

  // EventEmittedByMutator (effectful emission warning)
  for (const e of input.events) {
    for (const emitter of e.emitted_by) {
      const hasEffectfulEffect = emitter.body.effects.some(
        (ef) => ef.kind === "email" || ef.kind === "network",
      );
      if (hasEffectfulEffect) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "events:effectful-emission",
            message: `Event ${e.name} emitted by effectful mutator may require outbox pattern`,
          }),
        );
      }
    }
  }

  // SubscriptionHandlerInputMatchesEvent
  for (const s of input.subscriptions) {
    if (s.handler.input_type.name !== s.payload_type.name) {
      out.push(
        diagnostic({
          severity: "error",
          code: "events:subscription-input-mismatch",
          message: `Subscription ${s.name} handler input does not match event ${s.event.name} payload type`,
        }),
      );
    }
  }

  return out;
};
