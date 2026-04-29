# Gen2 UI Architecture: Widget vs Component vs Platform vs Element

This document clarifies the four foundational UI concepts in Gen2 and explains how they compose. It also captures lessons learned from building the CRUD, Editor, List, and Admin modules, with concrete design recommendations.

---

## The Four Concepts

### 1. Element — The Platform's Native DOM/Render Primitive

An **Element** is the concrete UI primitive of a target platform. It is a **phantom type** — it exists only at the TypeScript level and is erased at runtime.

| Platform       | Element Type  | Example                  |
| -------------- | ------------- | ------------------------ |
| React DOM      | `JSX.Element` | `<div>`, `<input>`       |
| SolidJS        | `JSX.Element` | `<div>`, `<input>`       |
| TUI (terminal) | `TuiElement`  | `box`, `text`, `list`    |
| Native iOS     | `UIView`      | `UILabel`, `UITextField` |
| Web Components | `HTMLElement` | `<my-component>`         |

**In the IR:** `E` is threaded through `View<E>`, `Slot<E>`, `Component<P, E>`, `Widget<E>`, `Form<Out, E>`, and `Editor<E, Out>` as a phantom type parameter. This lets the compiler reject a `View<HTMLElement>` being passed to a `Platform<JSX.Element>` renderer.

```ts
// React target
const reactPlatform = gen.ui.platform<JSX.Element>("react-dom", ...);

// TUI target
const tuiPlatform = gen.ui.platform<TuiElement>("terminal", ...);
```

**Key insight:** `E` is not a runtime value. It is a compile-time tag that ensures a Solid component is never attached to a React view.

---

### 2. Platform — The Target Environment's Capability Contract

A **Platform** declares what a target environment can do: which element capabilities it supports, which events it fires, which attributes it accepts, and which renderer generates code for it.

```ts
export interface Platform<E = unknown> {
  readonly _element?: E; // phantom
  readonly backend?: string; // "jsx" | "tui" | "html"
  readonly name: string;
  readonly element_capabilities: readonly ElementCapability[];
  readonly event_model: readonly string[]; // ["onClick", "onChange", ...]
  readonly attribute_model: readonly string[]; // ["className", "style", ...]
  readonly renderer_name: string;
  readonly host_capabilities: readonly string[];
}
```

**Platform is the bridge between static IR and code generation.** When a target generator runs, it asks:

- Does this platform support `TextInput` capability?
- Does it have `onChange` events?
- Does it use `className` or `class`?

A single project can have multiple platforms (e.g., React admin UI + TUI CLI tool), and the same `View`/`Component` IR can be compiled to both — as long as the view's slots are within the platform's capability set.

---

### 3. Component — A Reusable UI Unit with Props and a View

A **Component** is a reusable, named UI unit that has:

- A **props type** (`P`) — the shape of data it accepts
- A **view** (`View<E>`) — its internal slot structure
- **requirements** — services it needs (e.g., `ApiClient`, `Theme`)
- **errors** — error types it can surface

```ts
export interface Component<P = unknown, E = unknown> {
  readonly name: string;
  readonly props_type: string;
  readonly _props?: P;
  readonly requirements: readonly string[];
  readonly errors: readonly ErrorType[];
  readonly bindings: readonly string[];
  readonly view: View<E>;
}
```

**Component = reusable building block.** It is what you would import and render in a target framework:

```tsx
// Generated React code
import { UserCard } from "./components/UserCard";
<UserCard user={user} />;
```

**Component vs Widget:** A Component is a **composite** (has a View with slots). A Widget is a **leaf** (represents a single input control).

---

### 4. Widget — A Typed Input Control

A **Widget** is a **leaf-level input control** that knows how to render a single value. It is the thing that gets placed inside a form field or a table cell filter.

```ts
export interface Widget<E = unknown> {
  readonly _element?: E;
  readonly kind: WidgetKind;
  readonly options?: WidgetOptions;
}

export type WidgetKindTag =
  | "textInput"
  | "emailInput"
  | "numberInput"
  | "select"
  | "checkbox"
  | "relationSelect"
  | "datePicker"
  | "textArea";
```

**Widget = single input primitive.** Widgets are **type-to-widget mapped** from `SemanticType`:

```ts
// Auto-derived widget from a SemanticType
const stringWidget: Widget<JSX.Element> = defaultWidget(gen.types.string());
// → { kind: { kind: "textInput" } }

const emailWidget: Widget<JSX.Element> = defaultWidget(gen.types.email());
// → { kind: { kind: "emailInput" } }

const statusWidget: Widget<JSX.Element> = defaultWidget(
  gen.types.enumOf("Status", ["draft", "published"]),
);
// → { kind: { kind: "select" }, options: { options_source: { values: ["draft", "published"] } } }
```

**Widget sits inside FormField:**

```ts
export interface FormField<Ts, E> {
  readonly source_field: Field<Ts>;
  readonly widget: Widget<E>;
  // ...
}
```

---

## Relationship Diagram

```
Platform<E>
  │
  ├── declares ElementCapability[]  (what primitives exist)
  ├── declares event_model[]        (what events fire)
  └── is targeted by Renderer<E>

View<E>
  │
  ├── contains Slot<E>[]            (attachment points)
  ├── references Platform<E>[]      (where it can run)
  └── is owned by Component<P, E>

Component<P, E>
  │
  ├── has View<E>                   (internal structure)
  ├── accepts Props<P>              (data in)
  └── is rendered by Renderer<E>

Form<Out, E>
  │
  ├── contains FormField<unknown, E>[]
  │     └── each has Widget<E>      (leaf input control)
  ├── contains Slot<E>[]            (layout slots)
  └── binds to ActionFunction       (what happens on submit)

Editor<E, Out>
  │
  ├── contains Form<Out, E>         (create/update forms)
  ├── contains Widget<E>            (field overrides)
  ├── contains Component<unknown, E> (preview, display)
  └── binds to Query/Action Functions

List<Out>
  │
  ├── contains ListColumn[]
  │     └── each may have Component (cell renderer)
  ├── contains ListAction<Out>[]    (row actions)
  └── binds to QueryFunction        (data source)
```

---

## Lessons from CRUD/Editor/List/Admin Implementation

### Lesson 1: The `E` phantom parameter is underutilized

**Current state:** `E` is declared on `View`, `Slot`, `Component`, `Form`, `Widget`, `Editor`, `ListColumn`, etc. But it is often defaulted to `unknown` and never constrained.

**Problem:** You can accidentally write:

```ts
const reactView: View<JSX.Element> = ...;
const tuiComponent: Component<{}, TuiElement> = ...;
// No error if these are composed together
```

**Recommendation:** Add a `Platform<E>` reference to `View` and validate at `checkUi` time that every view's slots are within its platform's capability set. The `E` phantom should be backed by a runtime `Platform` check.

### Lesson 2: Widget lacks a typed props channel

**Current state:** `Widget` carries `kind` (e.g., `"textInput"`) and `options` (e.g., `EnumOptions`), but there is no typed way to pass props to a widget.

**Problem:** A `relationSelect` widget needs `relation`, `label_field`, `value_field`, and `search_fields`. These are stuffed into an untyped `WidgetOptions` bag. There's no way for the compiler to know that a `textInput` widget doesn't need `relation`.

**Recommendation:** Make `Widget` a discriminated union or use a phantom type parameter for widget-specific options:

```ts
export interface TextInputWidget<E> extends Widget<E> {
  readonly kind: { kind: "textInput" };
  readonly options?: { placeholder?: string; maxLength?: number };
}

export interface SelectWidget<E> extends Widget<E> {
  readonly kind: { kind: "select" };
  readonly options: { options_source: EnumOptions };
}

export type ConcreteWidget<E> = TextInputWidget<E> | SelectWidget<E> | ...;
```

### Lesson 3: Component and Widget have overlapping responsibilities

**Current state:** Both `Component` and `Widget` represent UI primitives. `Component` is composite (has a View). `Widget` is leaf (has a Kind). But in practice, a widget like `relationSelect` might need to be a full Component internally (it needs to fetch data, render a dropdown, handle search).

**Problem:** The boundary is blurry. Is a rich text editor a Widget or a Component?

**Recommendation:** Unify the model. A Widget should **be** a Component internally, but present a simpler interface to forms. Introduce `WidgetComponent<E>`:

```ts
export interface Widget<E = unknown> {
  readonly _element?: E;
  readonly kind: WidgetKind;
  readonly component?: Component<WidgetProps, E>; // internal implementation
  readonly options?: WidgetOptions;
}
```

This way, a `relationSelect` widget can reference a full `RelationSelectComponent` that has its own view, slots, and data requirements.

### Lesson 4: Platform capabilities should drive widget availability

**Current state:** `defaultWidget` maps `SemanticType` → `WidgetKindTag` without checking if the platform supports it.

**Problem:** A TUI platform might not support `datePicker`. But `defaultWidget(gen.types.datetime())` will still return `{ kind: "datePicker" }`, and the error won't be caught until code generation.

**Recommendation:** Make `defaultWidget` platform-aware:

```ts
export const defaultWidget = <E = unknown>(
  semantic_type: SemanticType,
  platform: Platform<E>,
): Widget<E> | undefined => {
  const kind = inferWidgetKind(semantic_type);
  if (!platformSupportsWidget(platform, kind)) {
    return undefined; // or fallback
  }
  return defineWidget<E>(kind);
};
```

### Lesson 5: Form slot generation is decoupled from widget capability

**Current state:** `buildForm` generates slots with `capability: { kind: "Field" }` for every field, regardless of widget.

**Problem:** A `numberInput` widget should require `NumberInput` capability. A `select` widget should require `Select` capability. But all form slots claim `Field`, which is too vague.

**Recommendation:** Map `WidgetKindTag` → `ElementCapabilityKind`:

```ts
const widgetCapability = (kind: WidgetKindTag): ElementCapabilityKind => {
  switch (kind) {
    case "textInput":
      return "TextInput";
    case "numberInput":
      return "NumberInput";
    case "select":
      return "Select";
    case "checkbox":
      return "Interactive";
    // ...
  }
};
```

Then `buildForm` should generate slots with the correct capability:

```ts
const slot: Slot<E> = {
  name: field.name,
  capability: cap(widgetCapability(field.widget.kind.kind)),
  // ...
};
```

### Lesson 6: List and Editor duplicate form-building logic

**Current state:** `autoList` creates `ListColumn[]` with `display_component`. `autoEditor` creates `EditorFieldOverride<E>[]` with `widget`. Both manually map fields to UI controls.

**Problem:** The type-to-UI-control mapping exists in `forms/defaultWidget`, `editor/fieldOverride`, and `list/listColumn` as three separate implementations.

**Recommendation:** Centralize type-to-control mapping in a single `gen.ui.controlFor` that works across forms, editors, and lists:

```ts
export const controlFor = <E = unknown>(
  field: Field,
  context: "form" | "table-cell" | "table-filter" | "preview",
  platform?: Platform<E>,
): Widget<E> | Component<unknown, E> => {
  // Single source of truth for all type-to-control mappings
};
```

### Lesson 7: The Admin module needs a page router concept

**Current state:** `Admin` has `pages: AdminPage[]` with static `path` strings.

**Problem:** There is no way to express nested routes, parameterized routes, or layout nesting. An editor page needs an `:id` parameter. A list page might have a detail drawer.

**Recommendation:** Add a lightweight router model:

```ts
export interface AdminRoute {
  readonly path: string;
  readonly page: AdminPage;
  readonly layout?: string; // "default" | "modal" | "drawer"
  readonly children?: readonly AdminRoute[];
}

export interface Admin {
  readonly routes: readonly AdminRoute[];
  // ...
}
```

### Lesson 8: Cross-module consistency is hard

**Current state:** `Crud<Out>`, `Editor<E, Out>`, `List<Out>`, `Admin` all have different generic patterns.

| Module           | Generics                              |
| ---------------- | ------------------------------------- |
| `Crud<Out>`      | `Out` (projection type)               |
| `Editor<E, Out>` | `E` (platform), `Out` (save result)   |
| `List<Out>`      | `Out` (row type)                      |
| `Form<Out, E>`   | `Out` (submit result), `E` (platform) |
| `Admin`          | None                                  |

**Problem:** The order of `E` and `Out` is inconsistent (`Editor<E, Out>` vs `Form<Out, E>`). This is confusing.

**Recommendation:** Standardize on `<Out, E>` everywhere (result type first, platform second), or drop `E` from high-level aggregates and only use it in UI-specific sub-records.

---

## Recommended Refactor Priority

| Priority | Change                                                                | Effort | Impact |
| -------- | --------------------------------------------------------------------- | ------ | ------ |
| 1        | Standardize generic order `<Out, E>` across all UI types              | Low    | High   |
| 2        | Add `Platform<E>` to `View` and validate capabilities in `checkUi`    | Medium | High   |
| 3        | Make `Widget` a discriminated union with typed options                | Medium | High   |
| 4        | Centralize `controlFor` mapping                                       | Medium | Medium |
| 5        | Add `Widget.component` for complex widgets                            | Low    | Medium |
| 6        | Make `defaultWidget` platform-aware                                   | Low    | Medium |
| 7        | Add router model to Admin                                             | Medium | Medium |
| 8        | Map `WidgetKindTag` → `ElementCapabilityKind` in form slot generation | Low    | High   |

---

## Summary

| Concept       | What It Is                                                                  | Analogy         |
| ------------- | --------------------------------------------------------------------------- | --------------- |
| **Element**   | Platform's native render primitive (`JSX.Element`, `UIView`)                | DOM node        |
| **Platform**  | Target environment's capability contract (events, attributes, capabilities) | Browser API     |
| **Component** | Reusable composite UI unit with props and internal view                     | React component |
| **Widget**    | Leaf-level input control for a single value                                 | HTML `<input>`  |

The architecture is sound but needs tighter coupling between:

1. **Widget ↔ Platform** (capability validation)
2. **Widget ↔ Component** (complex widgets as components)
3. **Type → Widget** (single source of truth)
4. **Form slots ↔ Widget capabilities** (correct capability tagging)
