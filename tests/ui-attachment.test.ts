import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";

test("safeHtml creates a branded SafeHtml type", () => {
  const { gen } = createGen();
  const html = gen.ui.safeHtml("<span>hello</span>");
  expect(html).toBe("<span>hello</span>");
});

test("attachStyle binds a style to a view and validates slots", () => {
  const { gen } = createGen();
  const view = gen.ui.view(
    "UserCard",
    [gen.ui.slot("title", gen.ui.cap("Text")), gen.ui.slot("body", gen.ui.cap("Text"))],
    "user-card",
  );

  const style = gen.ui.style("UserCardStyle", [
    { slot_name: "title", properties: [{ name: "color", value: "red", kind: "literal" }] },
  ]);

  const attached = gen.ui.attachStyle(style, view);
  expect(attached.target_view).toBe(view);
});

test("attachStyle throws for unknown slot", () => {
  const { gen } = createGen();
  const view = gen.ui.view("UserCard", [gen.ui.slot("title", gen.ui.cap("Text"))], "user-card");

  const style = gen.ui.style("BadStyle", [
    { slot_name: "footer", properties: [{ name: "color", value: "red", kind: "literal" }] },
  ]);

  expect(() => gen.ui.attachStyle(style, view)).toThrow("unknown slot");
});

test("attachStyle throws for hidden slot", () => {
  const { gen } = createGen();
  const view = gen.ui.view(
    "UserCard",
    [
      gen.ui.slot("title", gen.ui.cap("Text")),
      gen.ui.slot("secret", gen.ui.cap("Text"), [], [], [], true),
    ],
    "user-card",
  );

  const style = gen.ui.style("BadStyle", [
    { slot_name: "secret", properties: [{ name: "color", value: "red", kind: "literal" }] },
  ]);

  expect(() => gen.ui.attachStyle(style, view)).toThrow("hidden slot");
});

test("attachBehavior binds a behavior to a view and validates capabilities", () => {
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

test("attachBehavior throws for incompatible capability", () => {
  const { gen } = createGen();
  const view = gen.ui.view("UserCard", [gen.ui.slot("title", gen.ui.cap("Text"))], "user-card");

  const behavior = gen.ui.behavior(
    "ClickHandler",
    [{ slot_name: "title", required_capability: gen.ui.cap("Interactive") }],
    "handleClick",
    ["click"],
  );

  expect(() => gen.ui.attachBehavior(behavior, view)).toThrow("capability");
});

test("attachBehavior throws for unknown slot", () => {
  const { gen } = createGen();
  const view = gen.ui.view("UserCard", [gen.ui.slot("title", gen.ui.cap("Text"))], "user-card");

  const behavior = gen.ui.behavior(
    "ClickHandler",
    [{ slot_name: "footer", required_capability: gen.ui.cap("Text") }],
    "handleClick",
    ["click"],
  );

  expect(() => gen.ui.attachBehavior(behavior, view)).toThrow("unknown slot");
});

// --- Compile-time element-type enforcement ----------------------------------

test("attachment helpers preserve element type through generic parameter", () => {
  const { gen } = createGen();

  // Views and styles carry an E phantom parameter for cross-platform safety.
  // At compile time, attachStyle<HTMLDivElement> only accepts View<HTMLDivElement>.
  const htmlView = gen.ui.view("HtmlCard", [gen.ui.slot("title", gen.ui.cap("Text"))], "div");
  const htmlStyle = gen.ui.style("HtmlStyle", [
    { slot_name: "title", properties: [{ name: "color", value: "red", kind: "literal" }] },
  ]);

  // This succeeds because both share the default E = unknown
  const attached = gen.ui.attachStyle(htmlStyle, htmlView);
  expect(attached.target_view).toBe(htmlView);

  // The phantom _element field tracks the type at the value level
  type HtmlViewElement = typeof htmlView._element;
  const _assertElement: HtmlViewElement = undefined;
  expect(_assertElement).toBeUndefined();
});
