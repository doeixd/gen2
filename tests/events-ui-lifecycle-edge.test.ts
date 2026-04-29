/**
 * Edge-case tests spanning events, UI, and lifecycle modules, covering emissions,
 * reducers, form/widget validation, planner rules, and fallback warnings.
 */
import { expect, test } from "vite-plus/test";
import { createGen, events, ui, lifecycle } from "../src/index.ts";

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

test("duplicate payload field produces diagnostic", () => {
  const { gen } = createGen();
  const ev = gen.events.event("OrderPlaced", {
    fields: [
      { name: "id", field_type: gen.types.uuid() },
      { name: "id", field_type: gen.types.string() },
    ],
  });
  const diags = events.checkEvents({
    events: [ev],
    emissions: [],
    reducers: [],
    subscriptions: [],
  });
  expect(diags.some((d) => d.code === "events:duplicate-payload-field")).toBe(true);
});

test("emitted_by without matching emission produces diagnostic", () => {
  const { gen } = createGen();
  const action = gen.func.action({
    name: "createOrder",
    input_type: gen.types.int(),
    returns: gen.types.int(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: gen.entity("Order", { id: gen.types.uuid() }),
      operations: [],
      effects: [],
      requirements: [],
    },
    effects: [],
  });
  const ev = gen.events.event("OrderPlaced", { fields: [] });
  ev.emitted_by.push(action);
  const diags = events.checkEvents({
    events: [ev],
    emissions: [],
    reducers: [],
    subscriptions: [],
  });
  expect(diags.some((d) => d.code === "events:emitted-by-no-emission")).toBe(true);
});

test("emission not listed in emitted_by produces diagnostic", () => {
  const { gen } = createGen();
  const action = gen.func.action({
    name: "createOrder",
    input_type: gen.types.int(),
    returns: gen.types.int(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: gen.entity("Order", { id: gen.types.uuid() }),
      operations: [],
      effects: [],
      requirements: [],
    },
    effects: [],
  });
  const ev = gen.events.event("OrderPlaced", { fields: [] });
  const emission = events.emit(ev, action);
  ev.emitted_by.length = 0;
  const diags = events.checkEvents({
    events: [ev],
    emissions: [emission],
    reducers: [],
    subscriptions: [],
  });
  expect(diags.some((d) => d.code === "events:emission-not-listed")).toBe(true);
});

test("reducer event with no source field produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { score: gen.types.int() });
  const ev = gen.events.event("ScoreUpdated", {
    fields: [{ name: "delta", field_type: gen.types.int() }],
  });
  const reducer = {
    name: "sumScore",
    target_field: User.fields.score,
    events: [ev],
    combine: {
      name: "add",
      input_type: gen.types.int(),
      output_type: gen.types.int(),
      associative: true,
      commutative: false,
      idempotent: false,
    },
  };
  const diags = events.checkEvents({
    events: [ev],
    emissions: [],
    reducers: [reducer],
    subscriptions: [],
  });
  expect(diags.some((d) => d.code === "events:reducer-event-no-source")).toBe(true);
});

test("non-associative reducer produces warning", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { score: gen.types.int() });
  const ev = gen.events.event("ScoreUpdated", {
    fields: [{ name: "delta", field_type: gen.types.int(), source_field: User.fields.score }],
  });
  const reducer = {
    name: "subScore",
    target_field: User.fields.score,
    events: [ev],
    combine: {
      name: "sub",
      input_type: gen.types.int(),
      output_type: gen.types.int(),
      associative: false,
      commutative: false,
      idempotent: false,
    },
  };
  const diags = events.checkEvents({
    events: [ev],
    emissions: [],
    reducers: [reducer],
    subscriptions: [],
  });
  expect(diags.some((d) => d.code === "events:non-associative-reducer")).toBe(true);
});

test("reducer type mismatch produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { score: gen.types.int() });
  const ev = gen.events.event("ScoreUpdated", {
    fields: [{ name: "delta", field_type: gen.types.int(), source_field: User.fields.score }],
  });
  const reducer = {
    name: "concatScore",
    target_field: User.fields.score,
    events: [ev],
    combine: {
      name: "concat",
      input_type: gen.types.string(),
      output_type: gen.types.string(),
      associative: true,
      commutative: false,
      idempotent: false,
    },
  };
  const diags = events.checkEvents({
    events: [ev],
    emissions: [],
    reducers: [reducer],
    subscriptions: [],
  });
  expect(diags.some((d) => d.code === "events:reducer-type-mismatch")).toBe(true);
});

test("effectful emission produces warning", () => {
  const { gen } = createGen();
  const action = gen.func.action({
    name: "notify",
    input_type: gen.types.int(),
    returns: gen.types.int(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: gen.entity("User", { id: gen.types.uuid() }),
      operations: [],
      effects: [{ kind: "email" as const }],
      requirements: [],
    },
    effects: [{ kind: "email" as const }],
  });
  const ev = gen.events.event("Notified", { fields: [] });
  const emission = events.emit(ev, action);
  const diags = events.checkEvents({
    events: [ev],
    emissions: [emission],
    reducers: [],
    subscriptions: [],
  });
  expect(diags.some((d) => d.code === "events:effectful-emission")).toBe(true);
});

test("subscription handler input mismatch produces diagnostic", () => {
  const { gen } = createGen();
  const ev = gen.events.event("OrderPlaced", {
    fields: [{ name: "id", field_type: gen.types.uuid() }],
  });
  const handler: import("../src/function/index.ts").StaticFunction = {
    name: "handle",
    input_type: gen.types.int(),
    input_fields: [],
    output_type: gen.types.int(),
    body: { kind: "noop", output_type: gen.types.int(), requirements: [], effects: [] },
    requirements: [],
    effects: [],
    capabilities: [],
    laws: [],
    target_runtimes: [],
  };
  const sub = {
    name: "sub",
    event: ev,
    handler,
    payload_type: gen.types.uuid(),
  };
  const diags = events.checkEvents({
    events: [ev],
    emissions: [],
    reducers: [],
    subscriptions: [sub],
  });
  expect(diags.some((d) => d.code === "events:subscription-input-mismatch")).toBe(true);
});

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const makeView = (name: string, slots: any[]): any => {
  const view = { name, slots, structure: "", slot_remaps: [], target_platforms: [] };
  for (const s of slots) s.owning_view = view;
  return view;
};

test("duplicate slot in view produces diagnostic", () => {
  const view = makeView("V", [
    {
      name: "s1",
      capability: ui.cap("Text"),
      allowed_attributes: [],
      allowed_events: [],
      platform_requirements: [],
      hidden: false,
    },
    {
      name: "s1",
      capability: ui.cap("Text"),
      allowed_attributes: [],
      allowed_events: [],
      platform_requirements: [],
      hidden: false,
    },
  ]);
  const diags = ui.checkUi({
    views: [view],
    forms: [],
    styles: [],
    behaviors: [],
    themes: [],
    components: [],
  });
  expect(diags.some((d) => d.code === "ui:duplicate-slot")).toBe(true);
});

test("collection slot missing item produces diagnostic", () => {
  const view = makeView("V", [
    {
      name: "list",
      capability: { kind: "Collection", collection_item: undefined },
      allowed_attributes: [],
      allowed_events: [],
      platform_requirements: [],
      hidden: false,
    },
  ]);
  const diags = ui.checkUi({
    views: [view],
    forms: [],
    styles: [],
    behaviors: [],
    themes: [],
    components: [],
  });
  expect(diags.some((d) => d.code === "ui:collection-missing-item")).toBe(true);
});

test("form field not in source function input produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  const action = gen.func.action({
    name: "createUser",
    input_type: gen.types.int(),
    input_fields: [User.fields.id],
    returns: gen.types.int(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
  });
  const formField = {
    name: "name",
    source_field: User.fields.name,
    widget: { kind: "textInput" as const, validation: [] },
    slot_names: [],
  };
  const form = {
    name: "createUserForm",
    source_function: action,
    fields: [formField],
    slots: [],
    submit_result: gen.types.int(),
    error_mapping: [],
  };
  const diags = ui.checkUi({
    views: [],
    forms: [form],
    styles: [],
    behaviors: [],
    themes: [],
    components: [],
  });
  expect(diags.some((d) => d.code === "ui:form-field-not-in-input")).toBe(true);
});

test("widget type mismatch produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  const action = gen.func.action({
    name: "createUser",
    input_type: gen.types.int(),
    input_fields: [User.fields.name],
    returns: gen.types.int(),
    body: {
      kind: { kind: "insert" as const },
      phase: "mutation" as const,
      target_entity: User,
      operations: [],
      effects: [],
      requirements: [],
    },
  });
  const formField = {
    name: "name",
    source_field: User.fields.name,
    widget: { kind: "numberInput" as const, validation: [] },
    slot_names: [],
  };
  const form = {
    name: "createUserForm",
    source_function: action,
    fields: [formField],
    slots: [],
    submit_result: gen.types.int(),
    error_mapping: [],
  };
  const diags = ui.checkUi({
    views: [],
    forms: [form],
    styles: [],
    behaviors: [],
    themes: [],
    components: [],
  });
  expect(diags.some((d) => d.code === "ui:widget-type-mismatch")).toBe(true);
});

test("style on invalid slot produces diagnostic", () => {
  const view = makeView("V", [
    {
      name: "s1",
      capability: ui.cap("Text"),
      allowed_attributes: [],
      allowed_events: [],
      platform_requirements: [],
      hidden: false,
    },
  ]);
  const style = {
    name: "bad",
    slot_styles: [
      {
        slot_name: "missing",
        properties: [{ name: "color", value: "red", kind: "literal" as const }],
      },
    ],
    target_view: view,
  };
  const diags = ui.checkUi({
    views: [view],
    forms: [],
    styles: [style],
    behaviors: [],
    themes: [],
    components: [],
  });
  expect(diags.some((d) => d.code === "ui:style-invalid-slot")).toBe(true);
});

test("behavior slot capability mismatch produces diagnostic", () => {
  const view = makeView("V", [
    {
      name: "s1",
      capability: ui.cap("Text"),
      allowed_attributes: [],
      allowed_events: [],
      platform_requirements: [],
      hidden: false,
    },
  ]);
  const behavior = {
    name: "b",
    required_slots: [{ slot_name: "s1", required_capability: ui.cap("NumberInput") }],
    attached_view: view,
    body: "",
    allowed_events: [],
  };
  const diags = ui.checkUi({
    views: [view],
    forms: [],
    styles: [],
    behaviors: [behavior],
    themes: [],
    components: [],
  });
  expect(diags.some((d) => d.code === "ui:behavior-slot-mismatch")).toBe(true);
});

test("invalid theme token produces diagnostic", () => {
  const view = makeView("V", [
    {
      name: "s1",
      capability: ui.cap("Text"),
      allowed_attributes: [],
      allowed_events: [],
      platform_requirements: [],
      hidden: false,
    },
  ]);
  const style = {
    name: "bad",
    slot_styles: [
      {
        slot_name: "s1",
        properties: [{ name: "color", value: "primary", kind: "token" as const }],
      },
    ],
    target_view: view,
  };
  const theme = { name: "default", colors: [], spaces: [], radii: [], fonts: [] };
  const diags = ui.checkUi({
    views: [view],
    forms: [],
    styles: [style],
    behaviors: [],
    themes: [theme],
    components: [],
  });
  expect(diags.some((d) => d.code === "ui:invalid-token")).toBe(true);
});

test("component hiding all slots produces warning", () => {
  const view = makeView("V", [
    {
      name: "s1",
      capability: ui.cap("Text"),
      allowed_attributes: [],
      allowed_events: [],
      platform_requirements: [],
      hidden: true,
    },
  ]);
  const component = {
    name: "C",
    props_type: "any",
    requirements: [],
    errors: [],
    bindings: [],
    view,
  };
  const diags = ui.checkUi({
    views: [view],
    forms: [],
    styles: [],
    behaviors: [],
    themes: [],
    components: [component],
  });
  expect(diags.some((d) => d.code === "ui:hidden-handles")).toBe(true);
});

test("component requiring unknown service produces diagnostic", () => {
  const view = makeView("V", []);
  const component = {
    name: "C",
    props_type: "any",
    requirements: ["UnknownService"],
    errors: [],
    bindings: [],
    view,
  };
  const diags = ui.checkUi({
    views: [view],
    forms: [],
    styles: [],
    behaviors: [],
    themes: [],
    components: [component],
  });
  expect(diags.some((d) => d.code === "ui:missing-service")).toBe(true);
});

test("slot remap capability mismatch produces diagnostic", () => {
  const view = makeView("V", [
    {
      name: "s1",
      capability: ui.cap("Text"),
      allowed_attributes: [],
      allowed_events: [],
      platform_requirements: [],
      hidden: false,
    },
    {
      name: "s2",
      capability: ui.cap("NumberInput"),
      allowed_attributes: [],
      allowed_events: [],
      platform_requirements: [],
      hidden: false,
    },
  ]);
  const remap = {
    source: view.slots[0],
    target: view.slots[1],
  };
  const component = {
    name: "C",
    props_type: "any",
    requirements: [],
    errors: [],
    bindings: [],
    view: { ...view, slot_remaps: [remap] },
  };
  const diags = ui.checkUi({
    views: [],
    forms: [],
    styles: [],
    behaviors: [],
    themes: [],
    components: [component],
  });
  expect(diags.some((d) => d.code === "ui:remap-capability-mismatch")).toBe(true);
});

test("unsupported style property for platform produces warning", () => {
  const platform = {
    name: "web",
    element_capabilities: [],
    event_model: [],
    attribute_model: ["color"],
    renderer_name: "dom",
    host_capabilities: [],
  };
  const view = makeView("V", [
    {
      name: "s1",
      capability: ui.cap("Text"),
      allowed_attributes: [],
      allowed_events: [],
      platform_requirements: [],
      hidden: false,
    },
  ]);
  view.target_platforms = [platform];
  const style = {
    name: "bad",
    slot_styles: [
      {
        slot_name: "s1",
        properties: [{ name: "borderRadius", value: "4px", kind: "literal" as const }],
      },
    ],
    target_view: view,
  };
  const diags = ui.checkUi({
    views: [view],
    forms: [],
    styles: [style],
    behaviors: [],
    themes: [],
    components: [],
  });
  expect(diags.some((d) => d.code === "ui:unsupported-style-property")).toBe(true);
});

test("unsupported behavior event for platform produces warning", () => {
  const platform = {
    name: "web",
    element_capabilities: [],
    event_model: ["click"],
    attribute_model: [],
    renderer_name: "dom",
    host_capabilities: [],
  };
  const view = makeView("V", [
    {
      name: "s1",
      capability: ui.cap("Text"),
      allowed_attributes: [],
      allowed_events: [],
      platform_requirements: [],
      hidden: false,
    },
  ]);
  view.target_platforms = [platform];
  const behavior = {
    name: "b",
    required_slots: [],
    attached_view: view,
    body: "",
    allowed_events: ["hover"],
  };
  const diags = ui.checkUi({
    views: [view],
    forms: [],
    styles: [],
    behaviors: [behavior],
    themes: [],
    components: [],
  });
  expect(diags.some((d) => d.code === "ui:unsupported-event")).toBe(true);
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test("standard phases are ordered correctly", () => {
  const phases = lifecycle.standardPhases();
  expect(phases.map((p) => p.order)).toEqual([0, 1, 2, 3, 4]);
});

test("check on empty context with no checkers returns ok", () => {
  const { ctx } = createGen();
  lifecycle.clearModuleCheckers(ctx);
  const result = lifecycle.check(ctx);
  expect(result.status).toBe("ok");
});

test("check with built-in checkers catches invalid entity", () => {
  const { ctx, gen } = createGen();
  lifecycle.clearModuleCheckers(ctx);
  const a = gen.entity("E", { id: gen.types.uuid() });
  const b = gen.entity("E", { id: gen.types.uuid() });
  ctx.entities.push(a, b);
  lifecycle.registerBuiltInModuleCheckers(ctx);
  const result = lifecycle.check(ctx);
  expect(result.status).toBe("has_errors");
  expect(result.diagnostics.some((d) => d.code === "entity:duplicate-name")).toBe(true);
  lifecycle.clearModuleCheckers(ctx);
});

test("generate skips codegen when check has errors", () => {
  const { ctx } = createGen();
  lifecycle.clearModuleCheckers(ctx);
  ctx.diagnostics.push({
    severity: "error",
    code: "test:error",
    message: "fail",
    refs: [],
  });
  lifecycle.registerBuiltInModuleCheckers(ctx);
  const result = lifecycle.generate(ctx);
  expect(result.status).toBe("has_errors");
  lifecycle.clearModuleCheckers(ctx);
});

test("cross-store planner with too few stores produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const store = gen.store({ name: "s1", dialect: "postgres" });
  const runtime = gen.runtime({ name: "r", capabilities: [] });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
  });
  const planner = {
    name: "bad",
    query: q,
    store_assignments: [{ store, fields: [User.fields.id], local_query: q, runtime }],
    composition_strategy: { kind: "server_composition" as const },
    fallback_policy: {
      kind: "allow" as const,
      pure_only: false,
      deterministic_only: false,
      effectful_ok: true,
    },
  };
  const diags = lifecycle.checkCrossStorePlanners([planner]);
  expect(diags.some((d) => d.code === "lifecycle:planner-too-few-stores")).toBe(true);
});

test("cross-store planner duplicate store produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const store = gen.store({ name: "s1", dialect: "postgres" });
  const runtime = gen.runtime({ name: "r", capabilities: [] });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
  });
  const planner = {
    name: "bad",
    query: q,
    store_assignments: [
      { store, fields: [User.fields.id], local_query: q, runtime },
      { store, fields: [User.fields.id], local_query: q, runtime },
    ],
    composition_strategy: { kind: "server_composition" as const },
    fallback_policy: {
      kind: "allow" as const,
      pure_only: false,
      deterministic_only: false,
      effectful_ok: true,
    },
  };
  const diags = lifecycle.checkCrossStorePlanners([planner]);
  expect(diags.some((d) => d.code === "lifecycle:planner-duplicate-store")).toBe(true);
});

test("cross-store planner missing projected field produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
  const s1 = gen.store({ name: "s1", dialect: "postgres" });
  const s2 = gen.store({ name: "s2", dialect: "postgres" });
  const runtime = gen.runtime({ name: "r", capabilities: [] });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
    projection: {
      fields: [{ field: User.fields.id }, { field: User.fields.name }],
      aggregates: [],
    },
  });
  const planner = {
    name: "bad",
    query: q,
    store_assignments: [
      { store: s1, fields: [User.fields.id], local_query: q, runtime },
      { store: s2, fields: [], local_query: q, runtime },
    ],
    composition_strategy: { kind: "server_composition" as const },
    fallback_policy: {
      kind: "allow" as const,
      pure_only: false,
      deterministic_only: false,
      effectful_ok: true,
    },
  };
  const diags = lifecycle.checkCrossStorePlanners([planner]);
  expect(diags.some((d) => d.code === "lifecycle:planner-missing-field")).toBe(true);
});

test("unplanned cross-store read produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const s1 = gen.store({ name: "s1", dialect: "postgres" });
  const s2 = gen.store({ name: "s2", dialect: "postgres" });
  const q = gen.query.build({
    source: { kind: "entity_source", entity: User },
    result_type: gen.types.uuid(),
    target_stores: [s1, s2],
  });
  const diags = lifecycle.checkCrossStoreReadComposition([q], []);
  expect(diags.some((d) => d.code === "lifecycle:cross-store-read-unplanned")).toBe(true);
});

test("cross-store transactional write without coordinator produces diagnostic", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  const s1 = gen.store({ name: "s1", dialect: "postgres" });
  const s2 = gen.store({ name: "s2", dialect: "postgres" });
  const mutator = gen.api.mutator({
    name: "bad",
    target_entity: User,
    input_fields: [],
    mapping: gen.mapping(User, []),
    returns: { mapping: gen.mapping(User, []), fields: [] },
    consistency: "transactional",
    written_stores: [s1, s2],
  });
  const diags = lifecycle.checkCrossStoreWriteCoordinator([mutator]);
  expect(diags.some((d) => d.code === "lifecycle:cross-store-write-no-coordinator")).toBe(true);
});

test("silent effectful fallback produces warning", () => {
  const { gen } = createGen();
  const plan = {
    kind: { kind: "fallback" as const },
    phase: "query" as const,
    primary: gen.expr.literal(gen.types.int(), { kind: "integer", integer_value: 1 }),
    fallback: {
      kind: { kind: "fallback" as const },
      phase: "query" as const,
      primary: {
        ...gen.expr.literal(gen.types.int(), { kind: "integer", integer_value: 2 }),
        effects: [{ kind: "db_read" }],
      },
      fallback_policy: {
        kind: "allow" as const,
        pure_only: false,
        deterministic_only: false,
        effectful_ok: false,
      },
      runtime_assignments: [],
    },
    fallback_policy: {
      kind: "allow" as const,
      pure_only: false,
      deterministic_only: false,
      effectful_ok: false,
    },
    runtime_assignments: [],
  };
  const diags = lifecycle.checkPlanFallback([plan]);
  expect(diags.some((d) => d.code === "runtime:silent-effectful-fallback")).toBe(true);
});
