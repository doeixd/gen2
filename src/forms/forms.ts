/* @__NO_SIDE_EFFECTS__ */
/**
 * Forms package — derives forms from action function contracts and produces UI IR.
 * Forms build UI IR and bind to action functions; they do not invent a parallel model.
 *
 * See spec/ui.allium :: FormSurface.
 */

import type { Field } from "../entity/index.ts";
import type { ActionFunction, ErrorType } from "../function/index.ts";
import type { SemanticType } from "../types/index.ts";
import type {
  Form,
  FormErrorMapping,
  FormField,
  Platform,
  Slot,
  ValidationRule,
  Widget,
  WidgetKindTag,
} from "../ui/index.ts";
import {
  cap,
  defineForm,
  defineFormErrorMapping,
  defineFormField,
  defineWidget,
} from "../ui/index.ts";
import type { ElementCapability, ElementCapabilityKind } from "../ui/index.ts";

/**
 * Infers the default widget kind for a given semantic type.
 *
 * @param semantic_type - The semantic type to infer a widget for.
 * @returns The default WidgetKindTag for that type.
 */
export const inferWidgetKind = (semantic_type: SemanticType): WidgetKindTag => {
  switch (semantic_type.kind) {
    case "string":
      return "textInput";
    case "numeric":
      return "numberInput";
    case "boolean":
      return "checkbox";
    case "email":
      return "emailInput";
    case "date":
    case "datetime":
    case "timestamp":
      return "datePicker";
    case "enum":
      return "select";
    default:
      return "textInput";
  }
};

/**
 * Maps a widget kind tag to the element capability it requires.
 *
 * @param kind - Widget kind tag.
 * @returns The corresponding element capability.
 */
export const widgetCapability = (kind: WidgetKindTag): ElementCapability => {
  const map: Record<WidgetKindTag, ElementCapabilityKind> = {
    textInput: "TextInput",
    emailInput: "TextInput",
    numberInput: "NumberInput",
    select: "Select",
    checkbox: "Interactive",
    relationSelect: "Select",
    datePicker: "TextInput",
    textArea: "TextInput",
  };
  return cap(map[kind] ?? "Field");
};

/**
 * Derives validation rules from a field's nullability, optionality, and traits.
 *
 * @param field - The entity field.
 * @returns Validation rules for the field.
 */
export const deriveValidation = <Ts = unknown>(field: Field<Ts>): readonly ValidationRule[] => {
  const rules: ValidationRule[] = [];
  if (!field.nullable && !field.optional) {
    rules.push({ kind: "required", message: `${field.name} is required` });
  }
  for (const trait of field.semantic_type.traits) {
    if (trait.validate_expression && trait.error_message) {
      rules.push({
        kind: "custom",
        message: trait.error_message,
        value: trait.validate_expression,
      });
    }
  }
  return rules;
};

/**
 * Checks whether a platform supports a given widget kind.
 *
 * @param platform - The target platform.
 * @param kind - Widget kind tag.
 * @returns True if the platform has a matching element capability.
 */
export const platformSupportsWidget = <E = unknown>(
  platform: Platform<E>,
  kind: WidgetKindTag,
): boolean => {
  const capKind = widgetCapability(kind).kind;
  return platform.element_capabilities.some((c) => c.kind === capKind);
};

/**
 * Creates a default Widget for a field, deriving kind, options, and validation
 * from the field's semantic type and constraints. When a platform is provided,
 * falls back to textInput if the inferred kind is unsupported.
 *
 * @param field - The entity field.
 * @param platform - Optional target platform for capability-aware fallback.
 * @returns A Widget with the inferred kind, options, and validation rules.
 */
export const defaultWidget = <Ts = unknown, E = unknown>(
  field: Field<Ts>,
  platform?: Platform<E>,
): Widget<E> => {
  const kind = inferWidgetKind(field.semantic_type);
  const validation = deriveValidation(field);

  const buildWidget = (k: WidgetKindTag): Widget<E> => {
    switch (k) {
      case "select": {
        const values = field.semantic_type.enum_values;
        if (values) {
          return defineWidget<E>("select", { options_source: { values } }, validation);
        }
        return defineWidget<E>("textInput", undefined, validation);
      }
      case "textInput":
        return defineWidget<E>("textInput", undefined, validation);
      case "emailInput":
        return defineWidget<E>("emailInput", undefined, validation);
      case "numberInput":
        return defineWidget<E>("numberInput", undefined, validation);
      case "checkbox":
        return defineWidget<E>("checkbox", undefined, validation);
      case "datePicker":
        return defineWidget<E>("datePicker", undefined, validation);
      case "textArea":
        return defineWidget<E>("textArea", undefined, validation);
      case "relationSelect":
        // relationSelect cannot be auto-derived without a Relation reference;
        // fall back to textInput so the form still renders.
        return defineWidget<E>("textInput", undefined, validation);
    }
  };

  if (!platform || platformSupportsWidget(platform, kind)) return buildWidget(kind);
  if (platformSupportsWidget(platform, "textInput")) return buildWidget("textInput");
  return buildWidget(kind); // unsupported, but checkUi will catch it
};

/**
 * Builds a FormField from an action function input field with a default widget.
 *
 * @param source_field - The entity field to bind.
 * @param widget - Optional explicit widget (defaults to type-inferred from field).
 * @param label - Optional label.
 * @returns A FormField.
 */
export const formField = <Ts = unknown, E = unknown>(
  source_field: Field<Ts>,
  widget?: Widget<E>,
  label?: string,
  editableWhen?: import("../rules/index.ts").Rule,
): FormField<Ts, E> =>
  defineFormField<Ts, E>(
    source_field.name,
    source_field,
    widget ?? defaultWidget<Ts, E>(source_field),
    [source_field.name],
    label ?? source_field.name,
    editableWhen,
  );

/**
 * Central mapping from a domain field to a UI control, context-aware and
 * platform-aware. This is the single source of truth used by forms, editors,
 * and lists when auto-deriving UI controls.
 *
 * @param field - The entity field.
 * @param context - Where the control will be rendered.
 * @param platform - Optional target platform for capability-aware fallback.
 * @returns A Widget appropriate for the context.
 */
export const controlFor = <Ts = unknown, E = unknown>(
  field: Field<Ts>,
  context: "form" | "table-cell" | "table-filter" | "preview",
  platform?: Platform<E>,
): Widget<E> => {
  // All contexts currently derive from the same default widget.
  // Future: table-cell may return a read-only display widget,
  // preview may return a Component-backed widget.
  void context;
  return defaultWidget<Ts, E>(field, platform);
};

/**
 * Builds a Form from an action function with auto-generated fields and slots.
 *
 * @param name - Form name.
 * @param source_function - The action function to derive the form from.
 * @param submit_result - The submit result semantic type.
 * @param options - Optional overrides for fields, slots, and error mappings.
 * @returns A Form record.
 */
export const buildForm = <
  Out = unknown,
  E = unknown,
  Err = import("../function/index.ts").ErrorType,
  Req = unknown,
  Eff = unknown,
  Cap = unknown,
>(
  name: string,
  source_function: ActionFunction<any, Out, Err, Req, Eff, Cap>,
  submit_result: SemanticType<Out>,
  options?: {
    fields?: readonly FormField<unknown, E>[];
    slots?: readonly Slot<E>[];
    error_mapping?: readonly FormErrorMapping[];
  },
): Form<Out, E, Err, Req, Eff, Cap> => {
  const fields =
    options?.fields ??
    source_function.input_fields.map((field) =>
      formField<unknown, E>(field, controlFor<unknown, E>(field, "form")),
    );

  const slots: readonly Slot<E>[] =
    options?.slots ??
    (fields.map((f) => ({
      name: f.name,
      capability: widgetCapability(f.widget.kind),
      allowed_attributes: [],
      allowed_events: [],
      platform_requirements: [],
      hidden: false,
    })) as Slot<E>[]);

  return defineForm<Out, E, Err, Req, Eff, Cap>(
    name,
    source_function,
    fields,
    slots,
    submit_result,
    options?.error_mapping,
  );
};

/**
 * Creates a FormErrorMapping from an error type.
 *
 * @param error - The error type.
 * @param target_field - Optional target form field.
 * @param message - Optional custom message.
 * @returns A FormErrorMapping.
 */
export const errorMapping = (
  error: ErrorType,
  target_field?: FormField,
  message?: string,
): FormErrorMapping => defineFormErrorMapping(error.code, message ?? error.code, target_field);

// --- Auto form -----------------------------------------------------------

/**
 * Derives a {@link Form} from an entity and one of its CRUD action functions.
 *
 * All input fields of the action become form fields with default widgets.
 *
 * @typeParam Out - The submit result type.
 * @typeParam E - The platform element type.
 * @param name - Form name.
 * @param entity - The entity being edited (used for field metadata).
 * @param action - The action function (create or update).
 * @param options - Optional overrides for fields, slots, and error mappings.
 * @returns A Form record.
 *
 * @example
 * ```ts
 * const userCrud = gen.crud.derive(User);
 * const createForm = autoForm("CreateUser", User, userCrud.create);
 * ```
 */
export const autoForm = <Out = unknown, E = unknown>(
  name: string,
  entity: import("../entity/index.ts").Entity,
  action: ActionFunction<unknown, Out>,
  options?: {
    fields?: readonly FormField<unknown, E>[];
    slots?: readonly Slot<E>[];
    error_mapping?: readonly FormErrorMapping[];
  },
): Form<Out, E> => buildForm<Out, E>(name, action, action.returns as SemanticType<Out>, options);

// --- Inference helpers -----------------------------------------------------

/**
 * Extracts the inferred submit value type shape from a Form.
 * The shape is a record of field names to their TypeScript types.
 */
export type InferFormValues<F extends Form> = F extends Form
  ? {
      [K in F["fields"][number]["name"]]: F["fields"][number] extends {
        name: K;
        source_field: Field<infer Ts>;
      }
        ? Ts
        : unknown;
    }
  : never;

/**
 * Extracts the inferred submit result type from a Form.
 */
export type InferFormResult<F extends Form> = F extends Form<infer Out> ? Out : never;

/**
 * Extracts the inferred error shape from a Form.
 */
export type InferFormErrors<F extends Form> = F extends Form
  ? F["error_mapping"][number]["error_code"]
  : never;
