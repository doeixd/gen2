import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";

test("Slot preserves capability type through phantom parameter", () => {
  const { gen } = createGen();
  const textSlot = gen.ui.slot("title", gen.ui.cap("Text"));

  // textSlot should be Slot<{ kind: "Text" }>
  type TextCap = typeof textSlot._capability;
  const _assertCap = (_: TextCap) => {};
  _assertCap({ kind: "Text" });
  expect(textSlot.capability.kind).toBe("Text");
});

test("View carries slot schema through phantom parameter", () => {
  const { gen } = createGen();
  const view = gen.ui.view(
    "UserCard",
    [gen.ui.slot("title", gen.ui.cap("Text")), gen.ui.slot("submitBtn", gen.ui.cap("Interactive"))],
    "user-card",
  );

  // The view has slots at runtime
  expect(view.slots).toHaveLength(2);
});

test("Style preserves target slot names through phantom parameter", () => {
  const { gen } = createGen();
  const style = gen.ui.style("CardStyle", [
    { slot_name: "title", properties: [{ name: "color", value: "red", kind: "literal" }] },
  ]);

  // style should be Style<"title">
  expect(style.slot_styles[0]!.slot_name).toBe("title");
});

test("Behavior preserves required slot schema through phantom parameter", () => {
  const { gen } = createGen();
  const behavior = gen.ui.behavior(
    "ClickHandler",
    [{ slot_name: "submitBtn", required_capability: gen.ui.cap("Interactive") }],
    "handleClick",
    ["click"],
  );

  // behavior should carry the required slots type
  expect(behavior.required_slots[0]!.slot_name).toBe("submitBtn");
});

test("Component preserves props type through phantom parameter", () => {
  const { gen } = createGen();
  const view = gen.ui.view("Empty", [], "empty");
  const comp = gen.ui.component("UserCard", "UserCardProps", [], [], [], view);

  // comp should be Component<unknown> by default
  expect(comp.props_type).toBe("UserCardProps");
});

test("attachStyle returns a Style bound to a View", () => {
  const { gen } = createGen();
  const view = gen.ui.view("UserCard", [gen.ui.slot("title", gen.ui.cap("Text"))], "user-card");

  const style = gen.ui.style("CardStyle", [
    { slot_name: "title", properties: [{ name: "color", value: "red", kind: "literal" }] },
  ]);

  const attached = gen.ui.attachStyle(style, view);
  expect(attached.target_view).toBe(view);
});

test("attachBehavior returns a Behavior bound to a View", () => {
  const { gen } = createGen();
  const view = gen.ui.view(
    "UserCard",
    [gen.ui.slot("submitBtn", gen.ui.cap("Interactive"))],
    "user-card",
  );

  const behavior = gen.ui.behavior(
    "ClickHandler",
    [{ slot_name: "submitBtn", required_capability: gen.ui.cap("Interactive") }],
    "handleClick",
    ["click"],
  );

  const attached = gen.ui.attachBehavior(behavior, view);
  expect(attached.attached_view).toBe(view);
});
