/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel operations - typed reusable operation semantics.
 *
 * Operations are reusable semantic units that form the basis of expressions.
 * They carry type-level information for inference and validation.
 */

import type { KernelId } from "./id.ts";
import type { KernelType } from "./type.ts";
import type { TraitDef } from "./trait.ts";

/**
 * Operation category.
 */
export type OpCategory =
  | "logic"
  | "comparison"
  | "arithmetic"
  | "string"
  | "collection"
  | "control"
  | "access"
  | "cast"
  | "aggregate"
  | "custom";

/**
 * Input/output type specification for operations.
 *
 * Laws are trait applications on the operation node, accessible via
 * `traits` (e.g. `traits.LAW.ASSOCIATIVE`). The separate `laws` slot
 * was removed in PLAN.md §7 quick win #5 — laws are not a primitive
 * family separate from traits; they are typed traits with optional
 * witness payloads. See PLAN.md Track B §B7.
 */
export interface OpSignature<
  Id extends string = string,
  Args extends readonly KernelType[] = readonly KernelType[],
  Out extends KernelType = KernelType,
  Traits extends readonly TraitDef[] = readonly TraitDef[],
> {
  readonly id: KernelId<"op"> & Id;
  readonly name: string;
  readonly category: OpCategory;
  readonly args: Args;
  readonly output: Out;
  readonly traits?: Traits;
}

export type ArgsOf<Op extends OpSignature> = Op["args"];
export type OutputOf<Op extends OpSignature> = Op["output"];
export type OpIdOf<Op extends OpSignature> = Op["id"];

/** Define an operation with explicit types. */
export const defineOp = <
  const Id extends string,
  const Args extends readonly KernelType[],
  const Out extends KernelType,
  const Traits extends readonly TraitDef[] = readonly TraitDef[],
>(
  id: Id,
  name: string,
  category: OpCategory,
  args: Args,
  output: Out,
  options?: {
    readonly traits?: Traits;
  },
): OpSignature<Id, Args, Out, Traits> => ({
  id: id as KernelId<"op"> & Id,
  name,
  category,
  args,
  output,
  traits: options?.traits,
});

/** Built-in operation definitions. */
export const OPERATIONS = {
  // === Logical operations ===
  AND: defineOp(
    "op.and",
    "And",
    "logic",
    [
      {
        id: "type:boolean" as KernelId<"type">,
        kind: { id: "type.boolean", label: "Boolean" },
        traits: [],
      },
      {
        id: "type:boolean" as KernelId<"type">,
        kind: { id: "type.boolean", label: "Boolean" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
    {
      traits: [
        {
          id: "trait.law.associative" as KernelId<"trait">,
          label: "Associative",
          target: "node",
          metadata: undefined,
        },
      ],
    },
  ),
  OR: defineOp(
    "op.or",
    "Or",
    "logic",
    [
      {
        id: "type:boolean" as KernelId<"type">,
        kind: { id: "type.boolean", label: "Boolean" },
        traits: [],
      },
      {
        id: "type:boolean" as KernelId<"type">,
        kind: { id: "type.boolean", label: "Boolean" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
  NOT: defineOp(
    "op.not",
    "Not",
    "logic",
    [
      {
        id: "type:boolean" as KernelId<"type">,
        kind: { id: "type.boolean", label: "Boolean" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
  IMPLIES: defineOp(
    "op.implies",
    "Implies",
    "logic",
    [
      {
        id: "type:boolean" as KernelId<"type">,
        kind: { id: "type.boolean", label: "Boolean" },
        traits: [],
      },
      {
        id: "type:boolean" as KernelId<"type">,
        kind: { id: "type.boolean", label: "Boolean" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),

  // === Comparison operations ===
  EQ: defineOp(
    "op.eq",
    "Equals",
    "comparison",
    [
      {
        id: "type:unknown" as KernelId<"type">,
        kind: { id: "type.unknown", label: "Unknown" },
        traits: [],
      },
      {
        id: "type:unknown" as KernelId<"type">,
        kind: { id: "type.unknown", label: "Unknown" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
  NEQ: defineOp(
    "op.neq",
    "Not equals",
    "comparison",
    [
      {
        id: "type:unknown" as KernelId<"type">,
        kind: { id: "type.unknown", label: "Unknown" },
        traits: [],
      },
      {
        id: "type:unknown" as KernelId<"type">,
        kind: { id: "type.unknown", label: "Unknown" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
  LT: defineOp(
    "op.lt",
    "Less than",
    "comparison",
    [
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
  LTE: defineOp(
    "op.lte",
    "Less than or equals",
    "comparison",
    [
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
  GT: defineOp(
    "op.gt",
    "Greater than",
    "comparison",
    [
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
  GTE: defineOp(
    "op.gte",
    "Greater than or equals",
    "comparison",
    [
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),

  // === Arithmetic operations ===
  ADD: defineOp(
    "op.add",
    "Add",
    "arithmetic",
    [
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
    ],
    {
      id: "type:number" as KernelId<"type">,
      kind: { id: "type.number", label: "Number" },
      traits: [],
    },
  ),
  SUB: defineOp(
    "op.sub",
    "Subtract",
    "arithmetic",
    [
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
    ],
    {
      id: "type:number" as KernelId<"type">,
      kind: { id: "type.number", label: "Number" },
      traits: [],
    },
  ),
  MUL: defineOp(
    "op.mul",
    "Multiply",
    "arithmetic",
    [
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
    ],
    {
      id: "type:number" as KernelId<"type">,
      kind: { id: "type.number", label: "Number" },
      traits: [],
    },
  ),
  DIV: defineOp(
    "op.div",
    "Divide",
    "arithmetic",
    [
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
      {
        id: "type:number" as KernelId<"type">,
        kind: { id: "type.number", label: "Number" },
        traits: [],
      },
    ],
    {
      id: "type:number" as KernelId<"type">,
      kind: { id: "type.number", label: "Number" },
      traits: [],
    },
  ),

  // === String operations ===
  CONCAT: defineOp(
    "op.concat",
    "Concatenate",
    "string",
    [
      {
        id: "type:string" as KernelId<"type">,
        kind: { id: "type.string", label: "String" },
        traits: [],
      },
      {
        id: "type:string" as KernelId<"type">,
        kind: { id: "type.string", label: "String" },
        traits: [],
      },
    ],
    {
      id: "type:string" as KernelId<"type">,
      kind: { id: "type.string", label: "String" },
      traits: [],
    },
  ),
  INCLUDES: defineOp(
    "op.includes",
    "Includes",
    "string",
    [
      {
        id: "type:string" as KernelId<"type">,
        kind: { id: "type.string", label: "String" },
        traits: [],
      },
      {
        id: "type:string" as KernelId<"type">,
        kind: { id: "type.string", label: "String" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
  STARTS_WITH: defineOp(
    "op.startsWith",
    "Starts with",
    "string",
    [
      {
        id: "type:string" as KernelId<"type">,
        kind: { id: "type.string", label: "String" },
        traits: [],
      },
      {
        id: "type:string" as KernelId<"type">,
        kind: { id: "type.string", label: "String" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
  ENDS_WITH: defineOp(
    "op.endsWith",
    "Ends with",
    "string",
    [
      {
        id: "type:string" as KernelId<"type">,
        kind: { id: "type.string", label: "String" },
        traits: [],
      },
      {
        id: "type:string" as KernelId<"type">,
        kind: { id: "type.string", label: "String" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
  TO_UPPER: defineOp(
    "op.toUpper",
    "To upper case",
    "string",
    [
      {
        id: "type:string" as KernelId<"type">,
        kind: { id: "type.string", label: "String" },
        traits: [],
      },
    ],
    {
      id: "type:string" as KernelId<"type">,
      kind: { id: "type.string", label: "String" },
      traits: [],
    },
  ),
  TO_LOWER: defineOp(
    "op.toLower",
    "To lower case",
    "string",
    [
      {
        id: "type:string" as KernelId<"type">,
        kind: { id: "type.string", label: "String" },
        traits: [],
      },
    ],
    {
      id: "type:string" as KernelId<"type">,
      kind: { id: "type.string", label: "String" },
      traits: [],
    },
  ),
  TRIM: defineOp(
    "op.trim",
    "Trim",
    "string",
    [
      {
        id: "type:string" as KernelId<"type">,
        kind: { id: "type.string", label: "String" },
        traits: [],
      },
    ],
    {
      id: "type:string" as KernelId<"type">,
      kind: { id: "type.string", label: "String" },
      traits: [],
    },
  ),

  // === Collection operations ===
  IN: defineOp(
    "op.in",
    "In",
    "collection",
    [
      {
        id: "type:unknown" as KernelId<"type">,
        kind: { id: "type.unknown", label: "Unknown" },
        traits: [],
      },
      {
        id: "type:unknown" as KernelId<"type">,
        kind: { id: "type.unknown", label: "Unknown" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
  NOT_IN: defineOp(
    "op.notIn",
    "Not in",
    "collection",
    [
      {
        id: "type:unknown" as KernelId<"type">,
        kind: { id: "type.unknown", label: "Unknown" },
        traits: [],
      },
      {
        id: "type:unknown" as KernelId<"type">,
        kind: { id: "type.unknown", label: "Unknown" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
  GET: defineOp(
    "op.get",
    "Get property",
    "access",
    [
      {
        id: "type:object" as KernelId<"type">,
        kind: { id: "type.object", label: "Object" },
        traits: [],
      },
      {
        id: "type:string" as KernelId<"type">,
        kind: { id: "type.string", label: "String" },
        traits: [],
      },
    ],
    {
      id: "type:unknown" as KernelId<"type">,
      kind: { id: "type.unknown", label: "Unknown" },
      traits: [],
    },
  ),

  // === Control operations ===
  COALESCE: defineOp(
    "op.coalesce",
    "Coalesce",
    "control",
    [
      {
        id: "type:unknown" as KernelId<"type">,
        kind: { id: "type.unknown", label: "Unknown" },
        traits: [],
      },
      {
        id: "type:unknown" as KernelId<"type">,
        kind: { id: "type.unknown", label: "Unknown" },
        traits: [],
      },
    ],
    {
      id: "type:unknown" as KernelId<"type">,
      kind: { id: "type.unknown", label: "Unknown" },
      traits: [],
    },
  ),
  CASE: defineOp(
    "op.case",
    "Case",
    "control",
    [
      {
        id: "type:boolean" as KernelId<"type">,
        kind: { id: "type.boolean", label: "Boolean" },
        traits: [],
      },
      {
        id: "type:unknown" as KernelId<"type">,
        kind: { id: "type.unknown", label: "Unknown" },
        traits: [],
      },
      {
        id: "type:unknown" as KernelId<"type">,
        kind: { id: "type.unknown", label: "Unknown" },
        traits: [],
      },
    ],
    {
      id: "type:unknown" as KernelId<"type">,
      kind: { id: "type.unknown", label: "Unknown" },
      traits: [],
    },
  ),

  // === Relational / quantifier operations ===
  EXISTS: defineOp(
    "op.exists",
    "Exists",
    "collection",
    [
      {
        id: "type:relation" as KernelId<"type">,
        kind: { id: "type.object", label: "Relation" },
        traits: [],
      },
      {
        id: "type:boolean" as KernelId<"type">,
        kind: { id: "type.boolean", label: "Boolean" },
        traits: [],
      },
    ],
    {
      id: "type:boolean" as KernelId<"type">,
      kind: { id: "type.boolean", label: "Boolean" },
      traits: [],
    },
  ),
} as const;

/** Operation registry - maps operation IDs to their definitions. */
type OpFromRegistry<Ops extends Readonly<Record<string, OpSignature>>, Id extends string> = Extract<
  Ops[keyof Ops],
  { readonly id: KernelId<"op"> & Id }
>;

export class OpRegistry<
  Ops extends Readonly<Record<string, OpSignature>> = Readonly<Record<string, OpSignature>>,
> {
  private readonly ops = new Map<string, OpSignature>();

  constructor(ops: readonly OpSignature[] | Ops = []) {
    const values = Array.isArray(ops) ? ops : Object.values(ops);
    for (const op of values) {
      this.ops.set(op.id, op);
    }
  }

  /** Get an operation by ID. */
  get<const Id extends Ops[keyof Ops]["id"] & string>(id: Id): OpFromRegistry<Ops, Id> | undefined;
  get(id: string): OpSignature | undefined;
  get(id: string): OpSignature | undefined {
    return this.ops.get(id);
  }

  /** Check if an operation exists. */
  has(id: string): boolean {
    return this.ops.has(id);
  }

  /** Get all operations in a category. */
  byCategory<const Category extends OpCategory>(
    category: Category,
  ): readonly Extract<Ops[keyof Ops], { readonly category: Category }>[];
  byCategory(category: OpCategory): readonly OpSignature[];
  byCategory(category: OpCategory): readonly OpSignature[] {
    return Array.from(this.ops.values()).filter((op) => op.category === category);
  }
}

export const defineOpRegistry = <const Ops extends Readonly<Record<string, OpSignature>>>(
  ops: Ops,
): OpRegistry<Ops> => new OpRegistry(ops);

/** Default operation registry with built-in operations. */
export const defaultOpRegistry = defineOpRegistry(OPERATIONS);
