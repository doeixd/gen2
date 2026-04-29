/**
 * Tests for UI validation, covering duplicate slots, collection slots, widget
 * type mismatches, invalid theme tokens, and missing service requirements.
 */
import { expect, test } from "vite-plus/test";
import { createGen, ui } from "../src/index.ts";

test("checkUi flags duplicate slot names within a view", () => {
  const view = {
    name: "MyView",
    slots: [
      {
        name: "header",
        capability: ui.cap("Base"),
        allowed_attributes: [],
        allowed_events: [],
        platform_requirements: [],
        hidden: false,
      },
      {
        name: "header",
        capability: ui.cap("Base"),
        allowed_attributes: [],
        allowed_events: [],
        platform_requirements: [],
        hidden: false,
      },
    ],
    structure: "linear",
    slot_remaps: [],
    target_platforms: [],
  };
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

test("checkUi flags collection slot missing item capability", () => {
  const view = {
    name: "MyView",
    slots: [
      {
        name: "rows",
        capability: ui.cap("Collection"),
        allowed_attributes: [],
        allowed_events: [],
        platform_requirements: [],
        hidden: false,
      },
    ],
    structure: "linear",
    slot_remaps: [],
    target_platforms: [],
  };
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

test("checkUi flags widget type mismatch", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { age: gen.types.int() });
  const action = {
    name: "createUser",
    input_type: gen.types.int(),
    input_fields: [User.fields.age],
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
  const form = {
    name: "UserForm",
    source_function: action,
    fields: [
      {
        name: "age",
        source_field: User.fields.age,
        widget: { kind: "checkbox" as const, validation: [] },
        slot_names: [] as string[],
      },
    ],
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

test("checkUi flags invalid theme token", () => {
  const view = {
    name: "MyView",
    slots: [
      {
        name: "header",
        capability: ui.cap("Base"),
        allowed_attributes: [],
        allowed_events: [],
        platform_requirements: [],
        hidden: false,
      },
    ],
    structure: "linear",
    slot_remaps: [],
    target_platforms: [],
  };
  const style = {
    name: "badStyle",
    slot_styles: [
      {
        slot_name: "header",
        properties: [{ name: "color", value: "not-a-token", kind: "token" as const }],
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
  expect(diags.some((d) => d.code === "ui:invalid-token")).toBe(true);
});

test("checkUi flags missing UI service requirement", () => {
  const view = {
    name: "MyView",
    slots: [
      {
        name: "header",
        capability: ui.cap("Base"),
        allowed_attributes: [],
        allowed_events: [],
        platform_requirements: [],
        hidden: false,
      },
    ],
    structure: "linear",
    slot_remaps: [],
    target_platforms: [],
  };
  const component = {
    name: "MyComp",
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
