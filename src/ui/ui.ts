/* @__NO_SIDE_EFFECTS__ */
/**
 * UI IR. Platform-agnostic views, slots, components, forms, styles, behaviors,
 * themes, platforms, renderers. The slot model lets generated UI expose typed
 * attachment points so styles/behaviors can be applied from outside without
 * forking the generated source.
 *
 * See spec/ui.allium.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Field } from "../entity/index.ts";
import type { ActionFunction, ErrorType } from "../function/index.ts";
import type { Relation } from "../relation/index.ts";
import type { Rule } from "../rules/index.ts";
import type { SemanticType } from "../types/index.ts";

// --- Element capabilities --------------------------------------------------

/** Discriminated capability kind for a UI element. */
export type ElementCapabilityKind =
  | "Base"
  | "Container"
  | "Text"
  | "Interactive"
  | "TextInput"
  | "NumberInput"
  | "Select"
  | "Form"
  | "Label"
  | "Field"
  | "Table"
  | "Row"
  | "Cell"
  | "Collection";

/** Describes the capabilities of a UI element, including nesting and collection support. */
export interface ElementCapability {
  readonly kind: ElementCapabilityKind;
  readonly inner_capability?: ElementCapability;
  readonly collection_item?: ElementCapability;
}

/**
 * Creates a basic ElementCapability.
 *
 * @param kind - The capability kind.
 * @returns An ElementCapability.
 */
export const cap = (kind: ElementCapabilityKind): ElementCapability => ({ kind });

/**
 * Creates a collection capability wrapping an item capability.
 *
 * @param item - The capability for each item in the collection.
 * @returns A collection ElementCapability.
 */
export const collection = (item: ElementCapability): ElementCapability => ({
  kind: "Collection",
  collection_item: item,
});

/**
 * Creates a container capability wrapping an inner capability.
 *
 * @param inner - The inner capability.
 * @returns A container ElementCapability.
 */
export const container = (inner: ElementCapability): ElementCapability => ({
  kind: "Container",
  inner_capability: inner,
});

// --- Widgets ---------------------------------------------------------------

/** Discriminated kind tag for a UI widget. */
export type WidgetKindTag =
  | "textInput"
  | "emailInput"
  | "numberInput"
  | "select"
  | "checkbox"
  | "relationSelect"
  | "datePicker"
  | "textArea";

/** A runtime validation rule attached to a widget. */
export interface ValidationRule {
  readonly kind: "required" | "minLength" | "maxLength" | "min" | "max" | "pattern" | "custom";
  readonly message: string;
  readonly value?: unknown;
}

/** Fixed list of values for a select widget. */
export interface EnumOptions {
  readonly values: readonly string[];
}

/** Text input widget. */
export interface TextInputWidget<E = unknown> {
  readonly _element?: E;
  readonly kind: "textInput";
  readonly options?: { placeholder?: string; maxLength?: number };
  readonly validation: readonly ValidationRule[];
  readonly component?: Component<unknown, E>;
}

/** Email input widget. */
export interface EmailInputWidget<E = unknown> {
  readonly _element?: E;
  readonly kind: "emailInput";
  readonly options?: { placeholder?: string };
  readonly validation: readonly ValidationRule[];
  readonly component?: Component<unknown, E>;
}

/** Number input widget. */
export interface NumberInputWidget<E = unknown> {
  readonly _element?: E;
  readonly kind: "numberInput";
  readonly options?: { min?: number; max?: number; step?: number };
  readonly validation: readonly ValidationRule[];
  readonly component?: Component<unknown, E>;
}

/** Select widget (enum or fixed options). */
export interface SelectWidget<E = unknown> {
  readonly _element?: E;
  readonly kind: "select";
  readonly options: { options_source: EnumOptions };
  readonly validation: readonly ValidationRule[];
  readonly component?: Component<unknown, E>;
}

/** Checkbox widget. */
export interface CheckboxWidget<E = unknown> {
  readonly _element?: E;
  readonly kind: "checkbox";
  readonly options?: { label?: string };
  readonly validation: readonly ValidationRule[];
  readonly component?: Component<unknown, E>;
}

/** Relation select widget. */
export interface RelationSelectWidget<E = unknown> {
  readonly _element?: E;
  readonly kind: "relationSelect";
  readonly options: {
    relation: Relation;
    label_field: Field;
    value_field: Field;
    search_fields?: readonly Field[];
  };
  readonly validation: readonly ValidationRule[];
  readonly component?: Component<unknown, E>;
}

/** Date picker widget. */
export interface DatePickerWidget<E = unknown> {
  readonly _element?: E;
  readonly kind: "datePicker";
  readonly options?: { min?: string; max?: string };
  readonly validation: readonly ValidationRule[];
  readonly component?: Component<unknown, E>;
}

/** Text area widget. */
export interface TextAreaWidget<E = unknown> {
  readonly _element?: E;
  readonly kind: "textArea";
  readonly options?: { rows?: number; placeholder?: string };
  readonly validation: readonly ValidationRule[];
  readonly component?: Component<unknown, E>;
}

/** A UI widget — leaf-level input control with typed options and validation. */
export type Widget<E = unknown> =
  | TextInputWidget<E>
  | EmailInputWidget<E>
  | NumberInputWidget<E>
  | SelectWidget<E>
  | CheckboxWidget<E>
  | RelationSelectWidget<E>
  | DatePickerWidget<E>
  | TextAreaWidget<E>;

// --- Theme tokens ----------------------------------------------------------

/** A single named design token (color, space, radius, font). */
export interface ThemeToken {
  readonly name: string;
  readonly value: string;
}

/** A named set of design tokens. */
export interface Theme {
  readonly name: string;
  readonly colors: readonly ThemeToken[];
  readonly spaces: readonly ThemeToken[];
  readonly radii: readonly ThemeToken[];
  readonly fonts: readonly ThemeToken[];
}

// --- Platforms / Renderers -------------------------------------------------

/** A target platform with element capabilities, event model, and renderer. */
export interface Platform<E = unknown> {
  /** Phantom type parameter tracking the platform's element type. */
  readonly _element?: E;
  /** Optional runtime backend marker used by backend-specific namespace helpers. */
  readonly backend?: string;
  readonly name: string;
  readonly element_capabilities: readonly ElementCapability[];
  readonly event_model: readonly string[];
  readonly attribute_model: readonly string[];
  readonly renderer_name: string;
  readonly host_capabilities: readonly string[];
}

/** A renderer targeting a specific platform with supported capabilities. */
export interface Renderer<E = unknown> {
  readonly name: string;
  readonly target_platform: Platform<E>;
  readonly supported_capabilities: readonly string[];
}

// --- Slots / Views / Components -------------------------------------------

/** A named attachment point within a View with capability and event/attribute constraints. */
export interface Slot<E = unknown, C extends ElementCapability = ElementCapability> {
  /** Phantom type parameter tracking the platform element type. */
  readonly _element?: E;
  /** Phantom type parameter tracking the slot's capability at compile time. */
  readonly _capability?: C;
  readonly name: string;
  readonly capability: ElementCapability;
  readonly owning_view?: View;
  readonly allowed_attributes: readonly string[];
  readonly allowed_events: readonly string[];
  readonly platform_requirements: readonly string[];
  readonly hidden: boolean;
}

/** Maps a source Slot to a target Slot for component composition. */
export interface SlotRemap<E = unknown> {
  readonly source: Slot<E>;
  readonly target: Slot<E>;
}

/** A UI view composed of slots with structure and remappings. */
export interface View<
  E = unknown,
  S extends Record<string, ElementCapability> = Record<string, ElementCapability>,
> {
  /** Phantom type parameter tracking the platform element type. */
  readonly _element?: E;
  /** Optional runtime backend marker used by backend-specific namespace helpers. */
  readonly backend?: string;
  /** Phantom type parameter tracking the view's slot schema at compile time. */
  readonly _slots?: S;
  readonly name: string;
  readonly slots: readonly Slot<E>[];
  readonly structure: string;
  readonly slot_remaps: SlotRemap<E>[];
  readonly target_platforms: readonly Platform<E>[];
}

/** A reusable UI component with props, requirements, errors, and a view. */
export interface Component<P = unknown, E = unknown> {
  readonly name: string;
  readonly props_type: string;
  /** Phantom type parameter for the component's props shape. */
  readonly _props?: P;
  readonly requirements: readonly string[];
  readonly errors: readonly ErrorType[];
  readonly bindings: readonly string[];
  readonly view: View<E>;
}

// --- Styles / Behaviors ----------------------------------------------------

/** A single CSS-like property with a name, value, and kind (token or literal). */
export interface StyleProperty {
  readonly name: string;
  readonly value: string;
  readonly kind: "token" | "literal";
}

/** Styles targeted at a specific slot by name. */
export interface SlotStyle<T extends string = string> {
  readonly slot_name: T;
  readonly properties: readonly StyleProperty[];
}

/** A named set of slot styles, optionally bound to a target view. */
export interface Style<T extends string = string, E = unknown> {
  readonly name: string;
  readonly slot_styles: readonly SlotStyle<T>[];
  readonly target_view?: View<E>;
}

/** A slot requirement for a behavior with a required capability. */
export interface BehaviorSlot<
  T extends string = string,
  C extends ElementCapability = ElementCapability,
> {
  readonly slot_name: T;
  readonly required_capability: C;
}

/** A reusable behavior attaching event handling to required slots. */
export interface Behavior<
  R extends Record<string, ElementCapability> = Record<string, ElementCapability>,
  E = unknown,
> {
  readonly name: string;
  readonly required_slots: readonly BehaviorSlot[];
  readonly attached_view?: View<E>;
  readonly body: string;
  readonly allowed_events: readonly string[];
  /** Phantom type parameter tracking required slot names and capabilities. */
  readonly _required?: R;
}

// --- Forms -----------------------------------------------------------------

/**
 * A field within a form bound to a source field and widget.
 *
 * @typeParam Ts - The TypeScript type of the field's value.
 * @typeParam E - The platform element type of the widget.
 */
export interface FormField<Ts = unknown, E = unknown> {
  readonly name: string;
  readonly source_field: Field<Ts>;
  readonly widget: Widget<E>;
  readonly label?: string;
  readonly slot_names: readonly string[];
  /** Optional rule that determines when this field is editable. */
  readonly editableWhen?: Rule;
}

/** Maps an error code to a target form field and message. */
export interface FormErrorMapping {
  readonly error_code: string;
  readonly target_field?: FormField;
  readonly message: string;
}

/** A form bound to an action function with fields, slots, and error mapping. */
export interface Form<Out = unknown, E = unknown> {
  readonly name: string;
  readonly source_function: ActionFunction;
  readonly fields: readonly FormField[];
  readonly slots: readonly Slot<E>[];
  readonly submit_result: SemanticType<Out>;
  readonly error_mapping: readonly FormErrorMapping[];
}

// --- Constructors ----------------------------------------------------------

/**
 * Creates a Theme record.
 *
 * @param name - Theme name.
 * @param colors - Color tokens.
 * @param spaces - Spacing tokens.
 * @param radii - Radius tokens.
 * @param fonts - Font tokens.
 * @returns A Theme.
 */
export const defineTheme = (
  name: string,
  colors: readonly ThemeToken[],
  spaces: readonly ThemeToken[],
  radii: readonly ThemeToken[],
  fonts: readonly ThemeToken[],
): Theme => ({ name, colors, spaces, radii, fonts });

/**
 * Creates a Platform record.
 *
 * @param name - Platform name.
 * @param element_capabilities - Supported element capabilities.
 * @param event_model - Supported event names.
 * @param attribute_model - Supported attribute names.
 * @param renderer_name - Default renderer name.
 * @param host_capabilities - Host environment capabilities.
 * @returns A Platform.
 */
export const definePlatform = <E = unknown>(
  name: string,
  element_capabilities: readonly ElementCapability[],
  event_model: readonly string[],
  attribute_model: readonly string[],
  renderer_name: string,
  host_capabilities: readonly string[],
): Platform<E> => ({
  name,
  element_capabilities,
  event_model,
  attribute_model,
  renderer_name,
  host_capabilities,
});

/**
 * Creates a Renderer record.
 *
 * @param name - Renderer name.
 * @param target_platform - Target platform.
 * @param supported_capabilities - Supported capability kinds.
 * @returns A Renderer.
 */
export const defineRenderer = <E = unknown>(
  name: string,
  target_platform: Platform<E>,
  supported_capabilities: readonly string[],
): Renderer<E> => ({ name, target_platform, supported_capabilities });

/**
 * Creates a Slot record.
 *
 * @param name - Slot name.
 * @param capability - Element capability.
 * @param allowed_attributes - Allowed attribute names.
 * @param allowed_events - Allowed event names.
 * @param platform_requirements - Required platform features.
 * @param hidden - Whether the slot is hidden.
 * @param owning_view - Optional owning view.
 * @returns A Slot.
 */
export const defineSlot = <E = unknown, C extends ElementCapability = ElementCapability>(
  name: string,
  capability: C,
  allowed_attributes: readonly string[] = [],
  allowed_events: readonly string[] = [],
  platform_requirements: readonly string[] = [],
  hidden = false,
  owning_view?: View<E>,
): Slot<E, C> => ({
  name,
  capability,
  allowed_attributes,
  allowed_events,
  platform_requirements,
  hidden,
  owning_view,
});

/**
 * Creates a View record.
 *
 * @param name - View name.
 * @param slots - View slots.
 * @param structure - Structural description.
 * @param slot_remaps - Slot remappings for composition.
 * @param target_platforms - Target platforms.
 * @returns A View.
 */
export const defineView = <
  E = unknown,
  S extends Record<string, ElementCapability> = Record<string, ElementCapability>,
>(
  name: string,
  slots: Slot<E>[],
  structure: string,
  slot_remaps: SlotRemap<E>[] = [],
  target_platforms: readonly Platform<E>[] = [],
): View<E, S> => ({ name, slots, structure, slot_remaps, target_platforms });

/**
 * Creates a Component record.
 *
 * @param name - Component name.
 * @param props_type - Props type name.
 * @param requirements - Required services.
 * @param errors - Error types.
 * @param bindings - Binding names.
 * @param view - Component view.
 * @returns A Component.
 */
export const defineComponent = <P = unknown, E = unknown>(
  name: string,
  props_type: string,
  requirements: readonly string[],
  errors: readonly ErrorType[],
  bindings: readonly string[],
  view: View<E>,
): Component<P, E> => ({ name, props_type, requirements, errors, bindings, view });

/**
 * Creates a StyleProperty record.
 *
 * @param name - Property name.
 * @param value - Property value.
 * @param kind - "token" or "literal".
 * @returns A StyleProperty.
 */
export const defineStyleProperty = (
  name: string,
  value: string,
  kind: StyleProperty["kind"] = "literal",
): StyleProperty => ({
  name,
  value,
  kind,
});

/**
 * Creates a SlotStyle record.
 *
 * @param slot_name - Target slot name.
 * @param properties - Style properties.
 * @returns A SlotStyle.
 */
export const defineSlotStyle = <T extends string = string>(
  slot_name: T,
  properties: readonly StyleProperty[],
): SlotStyle<T> => ({
  slot_name,
  properties,
});

/**
 * Creates a Style record.
 *
 * @param name - Style name.
 * @param slot_styles - Slot styles.
 * @param target_view - Optional target view.
 * @returns A Style.
 */
export const defineStyle = <T extends string = string, E = unknown>(
  name: string,
  slot_styles: readonly SlotStyle<T>[],
  target_view?: View<E>,
): Style<T, E> => ({ name, slot_styles, target_view });

/**
 * Creates a BehaviorSlot record.
 *
 * @param slot_name - Target slot name.
 * @param required_capability - Required element capability.
 * @returns A BehaviorSlot.
 */
export const defineBehaviorSlot = <
  T extends string = string,
  C extends ElementCapability = ElementCapability,
>(
  slot_name: T,
  required_capability: C,
): BehaviorSlot<T, C> => ({
  slot_name,
  required_capability,
});

/**
 * Creates a Behavior record.
 *
 * @param name - Behavior name.
 * @param required_slots - Required slots.
 * @param body - Behavior body.
 * @param allowed_events - Allowed event names.
 * @param attached_view - Optional attached view.
 * @returns A Behavior.
 */
export const defineBehavior = <
  R extends Record<string, ElementCapability> = Record<string, ElementCapability>,
  E = unknown,
>(
  name: string,
  required_slots: readonly BehaviorSlot[],
  body: string,
  allowed_events: readonly string[],
  attached_view?: View<E>,
): Behavior<R, E> => ({ name, required_slots, body, allowed_events, attached_view });

export function defineWidget<E = unknown>(
  kind: "textInput",
  options?: { placeholder?: string; maxLength?: number },
  validation?: readonly ValidationRule[],
  component?: Component<unknown, E>,
): TextInputWidget<E>;
export function defineWidget<E = unknown>(
  kind: "emailInput",
  options?: { placeholder?: string },
  validation?: readonly ValidationRule[],
  component?: Component<unknown, E>,
): EmailInputWidget<E>;
export function defineWidget<E = unknown>(
  kind: "numberInput",
  options?: { min?: number; max?: number; step?: number },
  validation?: readonly ValidationRule[],
  component?: Component<unknown, E>,
): NumberInputWidget<E>;
export function defineWidget<E = unknown>(
  kind: "select",
  options: { options_source: EnumOptions },
  validation?: readonly ValidationRule[],
  component?: Component<unknown, E>,
): SelectWidget<E>;
export function defineWidget<E = unknown>(
  kind: "checkbox",
  options?: { label?: string },
  validation?: readonly ValidationRule[],
  component?: Component<unknown, E>,
): CheckboxWidget<E>;
export function defineWidget<E = unknown>(
  kind: "relationSelect",
  options: {
    relation: Relation;
    label_field: Field;
    value_field: Field;
    search_fields?: readonly Field[];
  },
  validation?: readonly ValidationRule[],
  component?: Component<unknown, E>,
): RelationSelectWidget<E>;
export function defineWidget<E = unknown>(
  kind: "datePicker",
  options?: { min?: string; max?: string },
  validation?: readonly ValidationRule[],
  component?: Component<unknown, E>,
): DatePickerWidget<E>;
export function defineWidget<E = unknown>(
  kind: "textArea",
  options?: { rows?: number; placeholder?: string },
  validation?: readonly ValidationRule[],
  component?: Component<unknown, E>,
): TextAreaWidget<E>;
export function defineWidget<E = unknown>(
  kind: WidgetKindTag,
  options?: unknown,
  validation?: readonly ValidationRule[],
  component?: Component<unknown, E>,
): Widget<E> {
  return { kind, options, validation: validation ?? [], component } as Widget<E>;
}

/**
 * Creates a FormField record with a typed source field.
 *
 * @param name - Field name.
 * @param source_field - Source entity field.
 * @param widget - Widget.
 * @param slot_names - Slot names.
 * @param label - Optional label.
 * @returns A FormField.
 */
export const defineFormField = <Ts = unknown, E = unknown>(
  name: string,
  source_field: Field<Ts>,
  widget: Widget<E>,
  slot_names: readonly string[],
  label?: string,
  editableWhen?: Rule,
): FormField<Ts, E> => ({ name, source_field, widget, slot_names, label, editableWhen });

/**
 * Creates a FormErrorMapping record.
 *
 * @param error_code - Error code.
 * @param message - Error message.
 * @param target_field - Optional target form field.
 * @returns A FormErrorMapping.
 */
export const defineFormErrorMapping = (
  error_code: string,
  message: string,
  target_field?: FormField,
): FormErrorMapping => ({ error_code, target_field, message });

/**
 * Creates a Form record with a typed submit result.
 *
 * @param name - Form name.
 * @param source_function - Source action function.
 * @param fields - Form fields.
 * @param slots - Form slots.
 * @param submit_result - Submit result type.
 * @param error_mapping - Error mappings.
 * @returns A Form.
 */
export const defineForm = <Out = unknown, E = unknown>(
  name: string,
  source_function: ActionFunction,
  fields: readonly FormField<unknown, E>[],
  slots: readonly Slot<E>[],
  submit_result: SemanticType<Out>,
  error_mapping: readonly FormErrorMapping[] = [],
): Form<Out, E> => ({ name, source_function, fields, slots, submit_result, error_mapping });

// --- Safe HTML -------------------------------------------------------------

/** Branded type for safe HTML strings that have been sanitized. */
export type SafeHtml = string & { readonly _safeHtmlBrand: unique symbol };

/**
 * Marks a string as safe HTML. Only use this when the input is known to be
 * sanitized; never wrap untrusted user input.
 *
 * @param html - The sanitized HTML string.
 * @returns A branded SafeHtml.
 */
export const safeHtml = (html: string): SafeHtml => html as SafeHtml;

// --- Attachment helpers ----------------------------------------------------

/**
 * Validates that every slot targeted by a style exists on the view and is visible.
 *
 * @param style - The style to validate.
 * @param view - The target view.
 * @returns An error message if invalid, or null if valid.
 */
export const validateStyleAttachment = <E = unknown>(
  style: Style<string, E>,
  view: View<E>,
): string | null => {
  for (const ss of style.slot_styles) {
    const slot = view.slots.find((s) => s.name === ss.slot_name);
    if (!slot) return `Style targets unknown slot ${ss.slot_name} on view ${view.name}`;
    if (slot.hidden) return `Style targets hidden slot ${ss.slot_name} on view ${view.name}`;
  }
  return null;
};

/**
 * Attaches a style to a view, returning a new Style with target_view set.
 * Throws if the style references unknown or hidden slots on the view.
 * Enforces element-type compatibility at compile time via the generic parameter E.
 *
 * @param style - The style to attach.
 * @param view - The view to attach to.
 * @returns A new Style record bound to the view.
 */
export const attachStyleToView = <E = unknown>(
  style: Style<string, E>,
  view: View<E>,
): Style<string, E> => {
  const error = validateStyleAttachment(style, view);
  if (error) throw new Error(error);
  return { ...style, target_view: view };
};

/**
 * Validates that every required slot of a behavior exists on the view and has a
 * compatible capability.
 *
 * @param behavior - The behavior to validate.
 * @param view - The target view.
 * @returns An error message if invalid, or null if valid.
 */
export const validateBehaviorAttachment = <E = unknown>(
  behavior: Behavior<Record<string, ElementCapability>, E>,
  view: View<E>,
): string | null => {
  for (const req of behavior.required_slots) {
    const slot = view.slots.find((s) => s.name === req.slot_name);
    if (!slot) return `Behavior requires unknown slot ${req.slot_name} on view ${view.name}`;
    if (!capabilityEquals(slot.capability, req.required_capability)) {
      if (req.required_capability.kind === "Collection") {
        return `Behavior requires collection slot but ${req.slot_name} is not a collection`;
      }
      return `Behavior requires capability ${req.required_capability.kind} but slot ${req.slot_name} has ${slot.capability.kind}`;
    }
  }
  return null;
};

/**
 * Attaches a behavior to a view, returning a new Behavior with attached_view set.
 * Throws if required slots are missing or have incompatible capabilities.
 * Enforces element-type compatibility at compile time via the generic parameter E.
 *
 * @param behavior - The behavior to attach.
 * @param view - The view to attach to.
 * @returns A new Behavior record bound to the view.
 */
export const attachBehaviorToView = <E = unknown>(
  behavior: Behavior<Record<string, ElementCapability>, E>,
  view: View<E>,
): Behavior<Record<string, ElementCapability>, E> => {
  const error = validateBehaviorAttachment(behavior, view);
  if (error) throw new Error(error);
  return { ...behavior, attached_view: view };
};

// --- Invariants and rules --------------------------------------------------

const KNOWN_SERVICES = new Set([
  "Theme",
  "Router",
  "QueryClient",
  "MutationClient",
  "ToastService",
  "AuthContext",
  "I18n",
]);

const capabilityEquals = (a: ElementCapability, b: ElementCapability): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === "Collection") {
    const ai = a.collection_item;
    const bi = b.collection_item;
    if (ai && bi) return capabilityEquals(ai, bi);
    return ai == null && bi == null;
  }
  return true;
};

/**
 * Validates UI invariants: unique slot names, collection item capabilities,
 * form field matching, widget type compatibility, style slot validity,
 * theme token existence, behavior slot capability matching, component visibility,
 * and platform support for styles and events.
 *
 * @param input - UI objects to validate.
 * @returns Diagnostics for any violated UI rules.
 */
export const checkUi = (input: {
  views: readonly View[];
  forms: readonly Form[];
  styles: readonly Style[];
  behaviors: readonly Behavior[];
  themes: readonly Theme[];
  components: readonly Component[];
  platforms?: readonly Platform[];
}): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // SlotNamesUniqueWithinView
  for (const v of input.views) {
    const seen = new Set<string>();
    for (const s of v.slots) {
      if (seen.has(s.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "ui:duplicate-slot",
            message: `View ${v.name} has duplicate slot ${s.name}`,
          }),
        );
      }
      seen.add(s.name);
    }
  }

  // CollectionSlotHasItemCapability
  for (const v of input.views) {
    for (const s of v.slots) {
      if (s.capability.kind === "Collection" && s.capability.collection_item == null) {
        out.push(
          diagnostic({
            severity: "error",
            code: "ui:collection-missing-item",
            message: `Collection slot ${s.name} on view ${v.name} is missing collection_item`,
          }),
        );
      }
    }
  }

  // SlotCapabilitySupportedByPlatform
  for (const v of input.views) {
    if (v.target_platforms.length === 0) continue;
    for (const s of v.slots) {
      const supported = v.target_platforms.some((p) =>
        p.element_capabilities.some((c) => c.kind === s.capability.kind),
      );
      if (!supported) {
        out.push(
          diagnostic({
            severity: "error",
            code: "ui:slot-capability-unsupported",
            message: `Slot ${s.name} on view ${v.name} requires capability ${s.capability.kind} which is not supported by any target platform`,
          }),
        );
      }
    }
  }

  // FormFieldsMatchFunctionInput
  for (const f of input.forms) {
    for (const field of f.fields) {
      if (!f.source_function.input_fields.includes(field.source_field)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "ui:form-field-not-in-input",
            message: `Form ${f.name}: field ${field.name} not in source function input`,
          }),
        );
      }
    }
  }

  // WidgetFieldTypeCompatible
  for (const f of input.forms) {
    for (const field of f.fields) {
      const k = field.widget.kind;
      const semKind = field.source_field.semantic_type.kind;
      const semName = field.source_field.semantic_type.name;
      const fail = (msg: string): void => {
        out.push(
          diagnostic({
            severity: "error",
            code: "ui:widget-type-mismatch",
            message: msg,
          }),
        );
      };
      if (k === "textInput" || k === "textArea") {
        if (semKind !== "string" && semName !== "string") {
          fail(`Widget ${k} requires string-typed field but ${field.name} is ${semName}`);
        }
      } else if (k === "emailInput") {
        if (semName !== "email" && semName !== "string") {
          fail(`emailInput requires email or string but ${field.name} is ${semName}`);
        }
      } else if (k === "numberInput") {
        if (semKind !== "numeric") {
          fail(`numberInput requires numeric but ${field.name} is ${semKind}`);
        }
      } else if (k === "checkbox") {
        if (semKind !== "boolean" && semName !== "boolean") {
          fail(`checkbox requires boolean but ${field.name} is ${semName}`);
        }
      } else if (k === "select") {
        const ok = semKind === "enum" || field.widget.options?.options_source != null;
        if (!ok) {
          fail(`select requires an enum field or options_source on widget`);
        }
      } else if (k === "datePicker") {
        if (!["datetime", "date", "timestamp"].includes(semName)) {
          fail(`datePicker requires datetime/date/timestamp but ${field.name} is ${semName}`);
        }
      } else if (k === "relationSelect") {
        if (!field.widget.options || field.widget.options.relation == null) {
          fail(`relationSelect requires options.relation`);
        }
      }
    }
  }

  // StyleInvalidSlot rule (also rejects styles targeting hidden slots)
  for (const s of input.styles) {
    if (!s.target_view) continue;
    for (const ss of s.slot_styles) {
      const slot = s.target_view.slots.find((slot) => slot.name === ss.slot_name && !slot.hidden);
      if (!slot) {
        out.push(
          diagnostic({
            severity: "error",
            code: "ui:style-invalid-slot",
            message: `Style attaches to unknown or hidden slot ${ss.slot_name} in view ${s.target_view.name}`,
          }),
        );
      }
    }
  }

  // BehaviorSlotCapabilityMismatch + CollectionBehaviorOnNonCollectionSlot
  for (const b of input.behaviors) {
    if (!b.attached_view) continue;
    for (const req of b.required_slots) {
      const slot = b.attached_view.slots.find((s) => s.name === req.slot_name);
      if (!slot) continue;
      if (capabilityEquals(slot.capability, req.required_capability)) continue;
      if (req.required_capability.kind === "Collection") {
        out.push(
          diagnostic({
            severity: "error",
            code: "ui:collection-on-non-collection",
            message: `Behavior ${b.name} requires collection slot but ${req.slot_name} is not a collection`,
          }),
        );
      } else {
        out.push(
          diagnostic({
            severity: "error",
            code: "ui:behavior-slot-mismatch",
            message: `Behavior ${b.name} requires capability ${req.required_capability.kind} but slot ${req.slot_name} has ${slot.capability.kind}`,
          }),
        );
      }
    }
  }

  // InvalidThemeToken
  for (const s of input.styles) {
    if (!s.target_view) continue;
    for (const ss of s.slot_styles) {
      for (const prop of ss.properties) {
        if (prop.kind !== "token") continue;
        const found = input.themes.some(
          (t) =>
            t.colors.some((c) => c.name === prop.value) ||
            t.spaces.some((sp) => sp.name === prop.value) ||
            t.radii.some((r) => r.name === prop.value) ||
            t.fonts.some((f) => f.name === prop.value),
        );
        if (!found) {
          out.push(
            diagnostic({
              severity: "error",
              code: "ui:invalid-token",
              message: `Style ${s.name} uses invalid theme token ${prop.value}`,
            }),
          );
        }
      }
    }
  }

  // ComponentHidesAllHandles
  for (const c of input.components) {
    if (c.view.slots.length === 0) continue;
    if (c.view.slots.every((s) => s.hidden)) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "ui:hidden-handles",
          message: `Component ${c.name} hides every slot; downstream code cannot attach styles or behaviors`,
        }),
      );
    }
  }

  // MissingUiService
  for (const c of input.components) {
    for (const req of c.requirements) {
      if (!KNOWN_SERVICES.has(req)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "ui:missing-service",
            message: `Component ${c.name} requires unknown UI service ${req}`,
          }),
        );
      }
    }
  }

  // SlotRemappingIncompatibleCapability
  for (const c of input.components) {
    for (const remap of c.view.slot_remaps) {
      if (!capabilityEquals(remap.source.capability, remap.target.capability)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "ui:remap-capability-mismatch",
            message: `Slot remapping from ${remap.source.name} to ${remap.target.name} has incompatible capabilities`,
          }),
        );
      }
    }
  }

  // StyleUnsupportedPropertyForPlatform / BehaviorUnsupportedEventForPlatform
  for (const v of input.views) {
    if (!v.backend) continue;
    for (const platform of v.target_platforms) {
      if (platform.backend && platform.backend !== v.backend) {
        out.push(
          diagnostic({
            severity: "error",
            code: "ui:view-platform-backend-mismatch",
            message: `View ${v.name} targets backend ${v.backend} but platform ${platform.name} is ${platform.backend}`,
          }),
        );
      }
    }
  }

  for (const s of input.styles) {
    if (!s.target_view) continue;
    for (const ss of s.slot_styles) {
      for (const prop of ss.properties) {
        for (const platform of s.target_view.target_platforms) {
          if (!platform.attribute_model.includes(prop.name)) {
            out.push(
              diagnostic({
                severity: "warning",
                code: "ui:unsupported-style-property",
                message: `Style property ${prop.name} not supported by platform ${platform.name}`,
              }),
            );
          }
        }
      }
    }
  }
  for (const b of input.behaviors) {
    if (!b.attached_view) continue;
    for (const event of b.allowed_events) {
      for (const platform of b.attached_view.target_platforms) {
        if (!platform.event_model.includes(event)) {
          out.push(
            diagnostic({
              severity: "warning",
              code: "ui:unsupported-event",
              message: `Behavior event ${event} not supported by platform ${platform.name}`,
            }),
          );
        }
      }
    }
  }

  return out;
};

// --- Namespace builder ------------------------------------------------------

/** Configuration options for the UI namespace. Backends extend this via declaration merging. */
export interface UiConfig {
  /** Target UI backend (e.g., "jsx", "tui", "html"). */
  readonly backend?: string;
}

/** The user-facing UI namespace shape. */
export interface UiNamespace<C extends UiConfig = UiConfig> {
  readonly _config?: C;
  readonly cap: typeof cap;
  readonly collection: typeof collection;
  readonly container: typeof container;
  readonly view: typeof defineView;
  readonly component: typeof defineComponent;
  readonly style: typeof defineStyle;
  readonly behavior: typeof defineBehavior;
  readonly theme: typeof defineTheme;
  readonly platform: typeof definePlatform;
  readonly renderer: typeof defineRenderer;
  readonly form: typeof defineForm;
  readonly widget: typeof defineWidget;
  readonly slot: typeof defineSlot;
  readonly formField: typeof defineFormField;
  readonly errorMapping: typeof defineFormErrorMapping;
  readonly safeHtml: typeof safeHtml;
  readonly attachStyle: typeof attachStyleToView;
  readonly attachBehavior: typeof attachBehaviorToView;
}

/**
 * Builds a typed UI namespace with optional backend-specific configuration.
 *
 * @param config - UI backend configuration.
 * @returns A UiNamespace bound to the given config.
 */
export const createUiNamespace = <C extends UiConfig = UiConfig>(config?: C): UiNamespace<C> => ({
  _config: config,
  cap,
  collection,
  container,
  view: defineView,
  component: defineComponent,
  style: defineStyle,
  behavior: defineBehavior,
  theme: defineTheme,
  platform: definePlatform,
  renderer: defineRenderer,
  form: defineForm,
  widget: defineWidget,
  slot: defineSlot,
  formField: defineFormField,
  errorMapping: defineFormErrorMapping,
  safeHtml,
  attachStyle: attachStyleToView,
  attachBehavior: attachBehaviorToView,
});
