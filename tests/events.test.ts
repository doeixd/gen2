/**
 * Tests for event definition, emission registration, and event invariant checks
 * including duplicate fields, reducer types, and subscription mismatches.
 */
import { expect, test } from "vite-plus/test";
import { createGen, events } from "../src/index.ts";

test("defineEvent creates an event with empty emitted_by", () => {
  const { gen } = createGen();
  const e = gen.events.event("UserCreated", {
    fields: [{ name: "userId", field_type: gen.types.uuid() }],
  });
  expect(e.name).toBe("UserCreated");
  expect(e.emitted_by).toHaveLength(0);
});

test("emit registers the action on the event", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const e = gen.events.event("UserCreated", {
    fields: [{ name: "userId", field_type: gen.types.uuid() }],
  });
  const action = {
    name: "createUser",
    input_type: gen.types.int(),
    input_fields: [],
    returns: gen.types.int(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
    errors: [],
    requirements: [],
    target_runtimes: [],
    invalidates: [],
    consistency: "transactional" as const,
    written_stores: [],
    effects: [] as { kind: string }[],
  };
  gen.events.emit(e, action);
  expect(e.emitted_by).toContain(action);
});

test("checkEvents flags duplicate payload fields", () => {
  const { gen } = createGen();
  const e = gen.events.event("Bad", {
    fields: [
      { name: "x", field_type: gen.types.int() },
      { name: "x", field_type: gen.types.string() },
    ],
  });
  const diags = events.checkEvents({ events: [e], emissions: [], reducers: [], subscriptions: [] });
  expect(diags.some((d) => d.code === "events:duplicate-payload-field")).toBe(true);
});

test("checkEvents flags emitted-by without matching emission record", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const e = gen.events.event("UserCreated", {
    fields: [{ name: "userId", field_type: gen.types.uuid() }],
  });
  const action = {
    name: "createUser",
    input_type: gen.types.int(),
    input_fields: [],
    returns: gen.types.int(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
    errors: [],
    requirements: [],
    target_runtimes: [],
    invalidates: [],
    consistency: "transactional" as const,
    written_stores: [],
    effects: [] as { kind: string }[],
  };
  e.emitted_by.push(action);
  const diags = events.checkEvents({ events: [e], emissions: [], reducers: [], subscriptions: [] });
  expect(diags.some((d) => d.code === "events:emitted-by-no-emission")).toBe(true);
});

test("checkEvents flags reducer type mismatch", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { count: gen.types.int() });
  const reducer = {
    name: "sum",
    target_field: User.fields.count,
    events: [],
    combine: {
      name: "add",
      input_type: gen.types.string(),
      output_type: gen.types.string(),
      associative: true,
      commutative: false,
      idempotent: false,
    },
  };
  const diags = events.checkEvents({
    events: [],
    emissions: [],
    reducers: [reducer],
    subscriptions: [],
  });
  expect(diags.some((d) => d.code === "events:reducer-type-mismatch")).toBe(true);
});

test("checkEvents flags subscription input mismatch", () => {
  const { gen } = createGen();
  const e = gen.events.event("E", { fields: [] });
  const handler = {
    name: "h",
    input_type: gen.types.int(),
    input_fields: [],
    output_type: gen.types.int(),
    body: { kind: "literal", output_type: gen.types.int(), requirements: [], effects: [] },
    requirements: [],
    effects: [],
    capabilities: [],
    laws: [],
    target_runtimes: [],
  };
  const sub = {
    name: "sub",
    event: e,
    handler,
    payload_type: gen.types.string(),
  };
  const diags = events.checkEvents({
    events: [e],
    emissions: [],
    reducers: [],
    subscriptions: [sub],
  });
  expect(diags.some((d) => d.code === "events:subscription-input-mismatch")).toBe(true);
});
