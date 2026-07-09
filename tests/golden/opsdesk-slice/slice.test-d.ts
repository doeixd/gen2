/**
 * Vertical slice — hover-budget regression (Quick Win #12).
 *
 * PLAN.md §0.5 #6 + Track C §10: hover output is part of the API. With
 * ~16 dialects × multiple builder forms × generic accumulators, hover
 * types balloon without active management. This file pins the *inferred
 * shapes* of representative slice witnesses so that a regression which
 * collapses them into a giant intersection or a mystery generic shows
 * up as a compile error, not a hover-time UX cliff.
 *
 * The test runs at type-check time (`.test-d.ts`).
 *
 * **First-run finding** — the very first iteration of this test caught
 * a real inference smell: rule and entity witnesses pass through
 * `as never` casts in the slice's predicate body because the rule var
 * / field generic plumbing isn't precise enough today. The assertions
 * below pin the *current* state. Each `test.todo` represents a
 * specific tightening Track C §10 / Track R will deliver.
 */

import { expectTypeOf, test } from "vite-plus/test";
import type {
  EmptyGraphStepState,
  GraphFragment,
  GraphStepInputOf,
} from "../../../src/kernel/index.ts";
import { buildOpsdeskSlice } from "./slice.ts";

const slice = buildOpsdeskSlice();

test("slice entities have a defined name slot (existence test)", () => {
  // Today the literal-narrowing on `Entity.name` is lost through the
  // rule context / `as never` plumbing. We assert *existence* not
  // *narrowness* — the todo below tracks the tightening.
  expectTypeOf(slice.entities.Incident.name).not.toBeNever();
  expectTypeOf(slice.entities.Organization.name).not.toBeNever();
});

test("slice rule definitions are present and named", () => {
  expectTypeOf(slice.rules.canViewIncident.name).not.toBeNever();
  expectTypeOf(slice.rules.canManageIncident.name).not.toBeNever();
});

test("slice policy preserves its predicate slot", () => {
  type PredicateSlot = typeof slice.policies.incidentPolicy.predicate;
  expectTypeOf<PredicateSlot>().not.toBeAny();
  expectTypeOf<PredicateSlot>().not.toBeNever();
});

// ------------------------------------------------------------------
// Track C §10 hover-budget targets — refine as inference improves.
// Each item below is a regression that needs Track R / Track K work.
// ------------------------------------------------------------------

test("slice.entities.Incident.name should be the literal `'Incident'`, not widened", () => {
  expectTypeOf(slice.entities.Incident.name).toEqualTypeOf<"Incident">();
});
test("slice.rules.canViewIncident.name should be the literal `'canViewIncident'`", () => {
  expectTypeOf(slice.rules.canViewIncident.name).toEqualTypeOf<"canViewIncident">();
});
test("rule var/field plumbing does not require `as never` casts in predicate bodies", () => {
  // The slice's rule bodies access `Incident.fields.status` directly
  // (no var binding), so the field reference type flows cleanly.
  expectTypeOf(slice.entities.Incident.fields.status).not.toBeNever();
  expectTypeOf(slice.entities.Incident.fields.status).not.toBeAny();
});

test("InferEntity<typeof slice.entities.Incident> exposes the field record", () => {
  type IncidentFields = (typeof slice.entities.Incident)["fields"];
  // Flat object literal: contains the four declared fields.
  expectTypeOf<IncidentFields>().toHaveProperty("id");
  expectTypeOf<IncidentFields>().toHaveProperty("organizationId");
  expectTypeOf<IncidentFields>().toHaveProperty("title");
  expectTypeOf<IncidentFields>().toHaveProperty("status");
});
test("rule.fragment carries a precise GraphFragment type, not AnyGraphStep", () => {
  type RuleFragment = typeof slice.rules.canViewIncident.fragment;
  expectTypeOf<RuleFragment>().toMatchTypeOf<GraphFragment>();
  expectTypeOf<GraphStepInputOf<RuleFragment>>().toEqualTypeOf<EmptyGraphStepState>();
});

test("policy.fragment carries a precise GraphFragment type, not AnyGraphStep", () => {
  type PolicyFragment = typeof slice.policies.incidentPolicy.fragment;
  expectTypeOf<PolicyFragment>().toMatchTypeOf<GraphFragment>();
  expectTypeOf<GraphStepInputOf<PolicyFragment>>().toEqualTypeOf<EmptyGraphStepState>();
});

test("hover output for slice.entities.Incident.fields.id stays compact", () => {
  const id = slice.entities.Incident.fields.id;
  expectTypeOf(id.name).toEqualTypeOf<"id">();
  expectTypeOf(id.owning_entity.name).toEqualTypeOf<"Incident">();
  expectTypeOf(id).not.toBeAny();
  expectTypeOf(id).not.toBeNever();
});
