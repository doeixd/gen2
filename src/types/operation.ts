/* @__NO_SIDE_EFFECTS__ */
/**
 * Unified Operation entity. Replaces the previously separate UnaryOp/BinaryOp/
 * ComparisonOp/AggregateOp entities; the kind tag selects which type fields apply.
 *
 * Per spec/types.allium:
 *   unary       -> input_type, output_type
 *   binary      -> left_type, right_type, output_type
 *   comparison  -> operand_type, output_type (boolean)
 *   aggregate   -> input_type, output_type, requires_numeric, requires_orderable
 *   reducer     -> input_type, output_type
 *   predicate   -> input_type, output_type (boolean)
 *   effect      -> input_type, output_type, plus non-empty effects
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { ImplementationAst } from "./implementation.ts";
import type { SemanticType } from "./semantic.ts";

/**
 * Discriminated kind of an operation (unary, binary, comparison, etc.).
 */
export type OperationKind =
  | "unary"
  | "binary"
  | "comparison"
  | "aggregate"
  | "reducer"
  | "predicate"
  | "effect";

/**
 * Brand type for plugin-contributed capabilities.
 *
 * Plugins can introduce custom capabilities by using the
 * `${pluginId}:${name}` convention.
 */
export type BrandCapability<
  PluginId extends string,
  Name extends string,
> = `${PluginId}:${Name}` & {
  _capabilityKind?: never;
};

/**
 * Identifies a runtime capability or feature requirement.
 *
 * Includes purity, determinism, effect categories (network, filesystem, crypto),
 * database features (joins, aggregates, jsonb), and plugin-branded extensions.
 */
export type CapabilityKind =
  | "pure"
  | "deterministic"
  | "reversible"
  | "partial"
  | "total"
  | "async"
  | "effectful"
  | "transactional"
  | "idempotent_effect"
  | "cacheable"
  | "client_safe"
  | "server_only"
  | "network"
  | "filesystem"
  | "crypto"
  | "web_crypto"
  | "dom"
  | "fetch"
  | "timers"
  | "json"
  | "transactions"
  | "row_locks"
  | "foreign_keys"
  | "joins"
  | "subqueries"
  | "aggregates"
  | "window_functions"
  | "recursive_ctes"
  | "jsonb"
  | "full_text_search"
  | "extensions"
  | "queues"
  | "workers"
  | "streams"
  | "kv_store"
  | "conditional_writes"
  | "atomic_increments"
  | "analytics"
  | "columnar"
  | "append_only"
  | "ttl"
  | BrandCapability<string, string>
  | (string & { _capabilityKind?: never });

/**
 * Identifies an algebraic law satisfied by an operation.
 *
 * Built-in laws cover associativity, commutativity, idempotence, identity,
 * inverse, and distributivity. Plugins may extend with custom law names.
 */
export type LawKind =
  | "associative"
  | "commutative"
  | "idempotent"
  | "identity"
  | "inverse"
  | "distributive"
  | (string & { _lawKind?: never });

/**
 * Brand type for plugin-contributed effects.
 *
 * Plugins can introduce custom effects by using the
 * `${pluginId}:${name}` convention.
 */
export type BrandEffect<PluginId extends string, Name extends string> = `${PluginId}:${Name}` & {
  _effectKind?: never;
};

/**
 * Identifies a side effect produced by an operation.
 *
 * Built-in effects include network, email, database read/write, filesystem
 * access, crypto, clock, random, queue, payment, and cache operations.
 */
export type EffectKind =
  | "network"
  | "email"
  | "db_read"
  | "db_write"
  | "fs_read"
  | "fs_write"
  | "crypto"
  | "clock"
  | "random"
  | "queue"
  | "payment"
  | "cache_read"
  | "cache_write"
  | BrandEffect<string, string>
  | (string & { _effectKind?: never });

/**
 * A runtime capability required or provided by an operation.
 */
export interface Capability {
  /** The capability kind. */
  readonly kind: CapabilityKind;
}

/**
 * An algebraic law with an assurance level and optional test/proof artifacts.
 */
export interface Law {
  /** The law kind (e.g. "associative"). */
  readonly kind: LawKind;
  /** Assurance level: claimed, tested, or formally proven. */
  readonly assurance: "claim" | "tested" | "proven";
  /** Optional path or identifier to a test artifact verifying the law. */
  readonly test_artifact?: string;
  /** Optional path or identifier to a proof artifact verifying the law. */
  readonly proof_artifact?: string;
}

/**
 * A side effect produced by an operation.
 */
export interface Effect {
  /** The effect kind. */
  readonly kind: EffectKind;
}

/**
 * Maps an operation to a concrete implementation for a specific runtime.
 */
export interface Implementation {
  /** Target runtime name (e.g. "postgres", "node20"). */
  readonly runtime: string;
  /** Implementation body (static AST or opaque JS reference). */
  readonly body: ImplementationBody;
}

/**
 * Body of an implementation, either a static AST or an opaque JS reference.
 */
export interface ImplementationBody {
  /** Discriminates between a compiled AST and an opaque JS function. */
  readonly kind: "static_ast" | "opaque_js";
  /** Static AST when kind is "static_ast". */
  readonly ast?: ImplementationAst;
  /** Opaque JS function identifier when kind is "opaque_js". */
  readonly opaque_fn?: string;
}

/** Shared fields present on every operation variant. */
interface OperationBase {
  /** Operation name, often used as a function/operator identifier. */
  readonly name: string;
  /** Whether the operation requires a numeric operand type. */
  readonly requires_numeric: boolean;
  /** Whether the operation requires an orderable operand type. */
  readonly requires_orderable: boolean;
  /** Capabilities the operation requires or provides. */
  readonly capabilities: readonly Capability[];
  /** Algebraic laws the operation satisfies. */
  readonly laws: readonly Law[];
  /** Side effects the operation may produce. */
  readonly effects: readonly Effect[];
  /** Concrete implementations for specific runtimes. */
  readonly implementations: readonly Implementation[];
}

/**
 * Unary operation with a single input type and output type.
 *
 * @example
 * ```ts
 * const not = gen.types.unaryOp({
 *   name: "not",
 *   input_type: gen.types.boolean(),
 *   output_type: gen.types.boolean(),
 * });
 * ```
 */
export interface UnaryOperation<In = unknown, Out = unknown> extends OperationBase {
  readonly kind: "unary";
  /** Operand type. */
  readonly input_type: SemanticType<In>;
  /** Result type. */
  readonly output_type: SemanticType<Out>;
}

/**
 * Binary operation with left/right operand types and an output type.
 *
 * @example
 * ```ts
 * const add = gen.types.binaryOp({
 *   name: "add",
 *   left_type: gen.types.int(),
 *   right_type: gen.types.int(),
 *   output_type: gen.types.int(),
 * });
 * ```
 */
export interface BinaryOperation<L = unknown, R = unknown, Out = unknown> extends OperationBase {
  readonly kind: "binary";
  /** Left operand type. */
  readonly left_type: SemanticType<L>;
  /** Right operand type. */
  readonly right_type: SemanticType<R>;
  /** Result type. */
  readonly output_type: SemanticType<Out>;
}

/**
 * Comparison operation with a single operand type and a boolean output.
 *
 * @example
 * ```ts
 * const eq = gen.types.comparisonOp({
 *   name: "eq",
 *   operand_type: gen.types.int(),
 *   output_type: gen.types.boolean(),
 * });
 * ```
 */
export interface ComparisonOperation<Operand = unknown, Out = unknown> extends OperationBase {
  readonly kind: "comparison";
  /** Type being compared. */
  readonly operand_type: SemanticType<Operand>;
  /** Result type (conventionally boolean). */
  readonly output_type: SemanticType<Out>;
}

/**
 * Aggregate operation with an input type and output type.
 *
 * @example
 * ```ts
 * const sum = gen.types.aggregateOp({
 *   name: "sum",
 *   input_type: gen.types.int(),
 *   output_type: gen.types.int(),
 *   requires_numeric: true,
 * });
 * ```
 */
export interface AggregateOperation<In = unknown, Out = unknown> extends OperationBase {
  readonly kind: "aggregate";
  /** Input element type. */
  readonly input_type: SemanticType<In>;
  /** Result type. */
  readonly output_type: SemanticType<Out>;
}

/**
 * Reducer operation with an input type and output type.
 *
 * Reducers are expected to satisfy algebraic laws (e.g. associativity).
 *
 * @example
 * ```ts
 * const concat = gen.types.reducerOp({
 *   name: "concat",
 *   input_type: gen.types.string(),
 *   output_type: gen.types.string(),
 *   laws: [gen.types.lawAssociative()],
 * });
 * ```
 */
export interface ReducerOperation<In = unknown, Out = unknown> extends OperationBase {
  readonly kind: "reducer";
  /** Input element type. */
  readonly input_type: SemanticType<In>;
  /** Result type. */
  readonly output_type: SemanticType<Out>;
}

/**
 * Predicate operation with an input type and boolean output.
 *
 * @example
 * ```ts
 * const isPositive = gen.types.predicateOp({
 *   name: "isPositive",
 *   input_type: gen.types.int(),
 *   output_type: gen.types.boolean(),
 * });
 * ```
 */
export interface PredicateOperation<In = unknown, Out = unknown> extends OperationBase {
  readonly kind: "predicate";
  /** Input type. */
  readonly input_type: SemanticType<In>;
  /** Result type (conventionally boolean). */
  readonly output_type: SemanticType<Out>;
}

/**
 * Effect operation with an input type, output type, and non-empty effects.
 *
 * @example
 * ```ts
 * const sendEmail = gen.types.effectOp({
 *   name: "sendEmail",
 *   input_type: gen.types.string(),
 *   output_type: gen.types.boolean(),
 *   effects: [gen.types.effectEmail()],
 * });
 * ```
 */
export interface EffectOperation<In = unknown, Out = unknown> extends OperationBase {
  readonly kind: "effect";
  /** Input type. */
  readonly input_type: SemanticType<In>;
  /** Result type. */
  readonly output_type: SemanticType<Out>;
}

/**
 * Discriminated union of all operation kinds.
 */
export type Operation =
  | UnaryOperation
  | BinaryOperation
  | ComparisonOperation
  | AggregateOperation
  | ReducerOperation
  | PredicateOperation
  | EffectOperation;

/**
 * A generic requirement tag for an operation or expression.
 *
 * Used by runtimes and analyzers to declare additional constraints
 * that are not covered by capabilities or effects.
 */
export interface Requirement {
  /** Requirement category or name. */
  readonly kind: string;
  /** Optional typed ref for semantic requirements (e.g., a ServiceRef). */
  readonly ref?: import("../core/refs.ts").Ref;
}

// --- Constructors ----------------------------------------------------------

const baseOp = (partial: {
  name: string;
  requires_numeric?: boolean;
  requires_orderable?: boolean;
  capabilities?: readonly Capability[];
  laws?: readonly Law[];
  effects?: readonly Effect[];
  implementations?: readonly Implementation[];
}): Pick<
  Operation,
  | "requires_numeric"
  | "requires_orderable"
  | "capabilities"
  | "laws"
  | "effects"
  | "implementations"
> => ({
  requires_numeric: false,
  requires_orderable: false,
  capabilities: [],
  laws: [],
  effects: [],
  implementations: [],
  ...partial,
});

/**
 * Creates a unary operation.
 *
 * @param input - Operation properties including name, input type, output type, and optional capabilities, laws, and effects.
 * @returns A unary Operation.
 */
export const unaryOp = <In = unknown, Out = unknown>(input: {
  name: string;
  input_type: SemanticType<In>;
  output_type: SemanticType<Out>;
  capabilities?: readonly Capability[];
  laws?: readonly Law[];
  effects?: readonly Effect[];
  implementations?: readonly Implementation[];
}): UnaryOperation<In, Out> => ({
  kind: "unary",
  name: input.name,
  input_type: input.input_type,
  output_type: input.output_type,
  ...baseOp(input),
});

/**
 * Creates a binary operation.
 *
 * @param input - Operation properties including name, left/right types, output type, and optional metadata.
 * @returns A binary Operation.
 */
export const binaryOp = <L = unknown, R = unknown, Out = unknown>(input: {
  name: string;
  left_type: SemanticType<L>;
  right_type: SemanticType<R>;
  output_type: SemanticType<Out>;
  capabilities?: readonly Capability[];
  laws?: readonly Law[];
  effects?: readonly Effect[];
  implementations?: readonly Implementation[];
}): BinaryOperation<L, R, Out> => ({
  kind: "binary",
  name: input.name,
  left_type: input.left_type,
  right_type: input.right_type,
  output_type: input.output_type,
  ...baseOp(input),
});

/**
 * Creates a comparison operation.
 *
 * @param input - Operation properties including name, operand type, and output type.
 * @returns A comparison Operation.
 */
export const comparisonOp = <Operand = unknown, Out = unknown>(input: {
  name: string;
  operand_type: SemanticType<Operand>;
  output_type: SemanticType<Out>;
  capabilities?: readonly Capability[];
}): ComparisonOperation<Operand, Out> => ({
  kind: "comparison",
  name: input.name,
  operand_type: input.operand_type,
  output_type: input.output_type,
  ...baseOp(input),
});

/**
 * Creates an aggregate operation.
 *
 * @param input - Operation properties including name, input/output types, and optional numeric/orderable requirements.
 * @returns An aggregate Operation.
 */
export const aggregateOp = <In = unknown, Out = unknown>(input: {
  name: string;
  input_type: SemanticType<In>;
  output_type: SemanticType<Out>;
  requires_numeric?: boolean;
  requires_orderable?: boolean;
  capabilities?: readonly Capability[];
  laws?: readonly Law[];
}): AggregateOperation<In, Out> => ({
  kind: "aggregate",
  name: input.name,
  input_type: input.input_type,
  output_type: input.output_type,
  ...baseOp(input),
});

/**
 * Creates a reducer operation.
 *
 * @param input - Operation properties including name, input/output types, and required laws.
 * @returns A reducer Operation.
 */
export const reducerOp = <In = unknown, Out = unknown>(input: {
  name: string;
  input_type: SemanticType<In>;
  output_type: SemanticType<Out>;
  laws: readonly Law[];
}): ReducerOperation<In, Out> => ({
  kind: "reducer",
  name: input.name,
  input_type: input.input_type,
  output_type: input.output_type,
  ...baseOp(input),
});

/**
 * Creates a predicate operation.
 *
 * @param input - Operation properties including name, input/output types.
 * @returns A predicate Operation.
 */
export const predicateOp = <In = unknown, Out = unknown>(input: {
  name: string;
  input_type: SemanticType<In>;
  output_type: SemanticType<Out>;
}): PredicateOperation<In, Out> => ({
  kind: "predicate",
  name: input.name,
  input_type: input.input_type,
  output_type: input.output_type,
  ...baseOp(input),
});

/**
 * Creates an effect operation.
 *
 * @param input - Operation properties including name, input/output types, effects, and optional capabilities/implementations.
 * @returns An effect Operation.
 */
export const effectOp = <In = unknown, Out = unknown>(input: {
  name: string;
  input_type: SemanticType<In>;
  output_type: SemanticType<Out>;
  effects: readonly Effect[];
  capabilities?: readonly Capability[];
  implementations?: readonly Implementation[];
}): EffectOperation<In, Out> => ({
  kind: "effect",
  name: input.name,
  input_type: input.input_type,
  output_type: input.output_type,
  ...baseOp(input),
});

// --- Capability constructors -----------------------------------------------

/**
 * Creates a capability descriptor.
 *
 * @param kind - The capability kind.
 * @returns A Capability record.
 */
export const cap = (kind: CapabilityKind): Capability => ({ kind });

/**
 * Shorthand for the "pure" capability.
 *
 * @returns A pure Capability.
 */
export const capPure = (): Capability => ({ kind: "pure" });

/**
 * Shorthand for the "deterministic" capability.
 *
 * @returns A deterministic Capability.
 */
export const capDeterministic = (): Capability => ({ kind: "deterministic" });

/**
 * Shorthand for the "reversible" capability.
 *
 * @returns A reversible Capability.
 */
export const capReversible = (): Capability => ({ kind: "reversible" });

/**
 * Shorthand for the "partial" capability.
 *
 * @returns A partial Capability.
 */
export const capPartial = (): Capability => ({ kind: "partial" });

/**
 * Shorthand for the "total" capability.
 *
 * @returns A total Capability.
 */
export const capTotal = (): Capability => ({ kind: "total" });

/**
 * Shorthand for the "async" capability.
 *
 * @returns An async Capability.
 */
export const capAsync = (): Capability => ({ kind: "async" });

/**
 * Shorthand for the "effectful" capability.
 *
 * @returns An effectful Capability.
 */
export const capEffectful = (): Capability => ({ kind: "effectful" });

/**
 * Shorthand for the "transactional" capability.
 *
 * @returns A transactional Capability.
 */
export const capTransactional = (): Capability => ({ kind: "transactional" });

/**
 * Shorthand for the "idempotent_effect" capability.
 *
 * @returns An idempotent-effect Capability.
 */
export const capIdempotentEffect = (): Capability => ({ kind: "idempotent_effect" });

/**
 * Shorthand for the "cacheable" capability.
 *
 * @returns A cacheable Capability.
 */
export const capCacheable = (): Capability => ({ kind: "cacheable" });

/**
 * Shorthand for the "client_safe" capability.
 *
 * @returns A client-safe Capability.
 */
export const capClientSafe = (): Capability => ({ kind: "client_safe" });

/**
 * Shorthand for the "server_only" capability.
 *
 * @returns A server-only Capability.
 */
export const capServerOnly = (): Capability => ({ kind: "server_only" });

// --- Effect constructors ----------------------------------------------------

/**
 * Creates an effect descriptor.
 *
 * @param kind - The effect kind.
 * @returns An Effect record.
 */
export const effect = (kind: EffectKind): Effect => ({ kind });

/**
 * Shorthand for the "network" effect.
 *
 * @returns A network Effect.
 */
export const effectNetwork = (): Effect => ({ kind: "network" });

/**
 * Shorthand for the "email" effect.
 *
 * @returns An email Effect.
 */
export const effectEmail = (): Effect => ({ kind: "email" });

/**
 * Shorthand for the "db_read" effect.
 *
 * @returns A database-read Effect.
 */
export const effectDbRead = (): Effect => ({ kind: "db_read" });

/**
 * Shorthand for the "db_write" effect.
 *
 * @returns A database-write Effect.
 */
export const effectDbWrite = (): Effect => ({ kind: "db_write" });

/**
 * Shorthand for the "fs_read" effect.
 *
 * @returns A filesystem-read Effect.
 */
export const effectFsRead = (): Effect => ({ kind: "fs_read" });

/**
 * Shorthand for the "fs_write" effect.
 *
 * @returns A filesystem-write Effect.
 */
export const effectFsWrite = (): Effect => ({ kind: "fs_write" });

/**
 * Shorthand for the "crypto" effect.
 *
 * @returns A crypto Effect.
 */
export const effectCrypto = (): Effect => ({ kind: "crypto" });

/**
 * Shorthand for the "clock" effect.
 *
 * @returns A clock Effect.
 */
export const effectClock = (): Effect => ({ kind: "clock" });

/**
 * Shorthand for the "random" effect.
 *
 * @returns A random Effect.
 */
export const effectRandom = (): Effect => ({ kind: "random" });

/**
 * Shorthand for the "queue" effect.
 *
 * @returns A queue Effect.
 */
export const effectQueue = (): Effect => ({ kind: "queue" });

/**
 * Shorthand for the "payment" effect.
 *
 * @returns A payment Effect.
 */
export const effectPayment = (): Effect => ({ kind: "payment" });

/**
 * Shorthand for the "cache_read" effect.
 *
 * @returns A cache-read Effect.
 */
export const effectCacheRead = (): Effect => ({ kind: "cache_read" });

/**
 * Shorthand for the "cache_write" effect.
 *
 * @returns A cache-write Effect.
 */
export const effectCacheWrite = (): Effect => ({ kind: "cache_write" });

// --- Law constructors ------------------------------------------------------

/**
 * Creates a law with the given kind and assurance level.
 *
 * @param kind - The law kind.
 * @param assurance - Assurance level (default "claim").
 * @returns A Law record.
 */
export const law = (kind: LawKind, assurance: Law["assurance"] = "claim"): Law => ({
  kind,
  assurance,
});

/**
 * Shorthand law constructor for "associative" with claim assurance.
 *
 * @returns An associative Law.
 */
export const lawAssociative = (): Law => ({ kind: "associative", assurance: "claim" });

/**
 * Shorthand law constructor for "commutative" with claim assurance.
 *
 * @returns A commutative Law.
 */
export const lawCommutative = (): Law => ({ kind: "commutative", assurance: "claim" });

/**
 * Shorthand law constructor for "idempotent" with claim assurance.
 *
 * @returns An idempotent Law.
 */
export const lawIdempotent = (): Law => ({ kind: "idempotent", assurance: "claim" });

/**
 * Shorthand law constructor for "identity" with claim assurance.
 *
 * @returns An identity Law.
 */
export const lawIdentity = (): Law => ({ kind: "identity", assurance: "claim" });

/**
 * Shorthand law constructor for "inverse" with claim assurance.
 *
 * @returns An inverse Law.
 */
export const lawInverse = (): Law => ({ kind: "inverse", assurance: "claim" });

/**
 * Shorthand law constructor for "distributive" with claim assurance.
 *
 * @returns A distributive Law.
 */
export const lawDistributive = (): Law => ({ kind: "distributive", assurance: "claim" });

// --- Invariant checks ------------------------------------------------------

/**
 * OperationKindFieldsConsistent: validates kind-specific invariants that are not
 * enforced by the discriminated union type itself (e.g. boolean output for
 * predicates, non-empty effects for effect ops).
 *
 * @param op - The operation to validate.
 * @returns Violation messages describing missing or mismatched fields.
 */
export const checkOperationKindFields = (op: Operation): readonly string[] => {
  const out: string[] = [];
  if ((op.kind === "predicate" || op.kind === "comparison") && op.output_type.name !== "boolean") {
    out.push(`Operation ${op.name} (${op.kind}) must output boolean, got ${op.output_type.name}`);
  }
  if (op.kind === "effect" && op.effects.length === 0) {
    out.push(`Operation ${op.name} (effect) must declare at least one effect`);
  }
  return out;
};

/**
 * Checks operation invariants: duplicate implementations for the same runtime.
 *
 * @param ops - Operations to validate.
 * @returns Diagnostics for any violated operation rules.
 */
export const checkOperations = (ops: readonly Operation[]): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (const op of ops) {
    const seen = new Set<string>();
    for (const impl of op.implementations) {
      if (seen.has(impl.runtime)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "types:duplicate-implementation",
            message: `Operation ${op.name} has duplicate implementation for runtime ${impl.runtime}`,
          }),
        );
      }
      seen.add(impl.runtime);
    }
  }
  return out;
};
