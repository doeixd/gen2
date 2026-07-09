/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel scope - typed lexical and execution scope bindings.
 *
 * Provides scope binding types for expressions, rules, functions, and
 * execution contexts.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { KernelType } from "./type.ts";

/** Scope binding kind. */
export type ScopeBindingKind =
  | "input"
  | "output"
  | "actor"
  | "session"
  | "tenant"
  | "resource"
  | "before"
  | "after"
  | "result"
  | "error"
  | "context"
  | "variable";

/** A scope binding - a typed variable in a scope. */
export interface ScopeBinding<Name extends string = string, Ty = unknown> {
  readonly id: KernelId<"scope.binding">;
  readonly name: Name;
  readonly kind: ScopeBindingKind;
  readonly type: KernelType<Ty>;
  readonly metadata?: KernelMetadata;
}

/** Scope input for construction. */
export interface ScopeBindingInput<Name extends string, Ty> {
  readonly name: Name;
  readonly kind: ScopeBindingKind;
  readonly type: KernelType<Ty>;
  readonly metadata?: KernelMetadata;
}

/** Create a scope binding. */
export const defineScopeBinding = <Name extends string, Ty>(
  name: Name,
  kind: ScopeBindingKind,
  type: KernelType<Ty>,
  metadata?: KernelMetadata,
): ScopeBinding<Name, Ty> => ({
  id: `scope.binding:${name}` as KernelId<"scope.binding">,
  name,
  kind,
  type,
  metadata,
});

/** An execution scope - runtime context. */
export interface ExecutionScope {
  readonly id: KernelId<"scope.execution">;
  readonly name?: string;
  readonly bindings: readonly ScopeBinding[];
  readonly parent?: ExecutionScope;
  readonly metadata?: KernelMetadata;
}

/** Execution scope input. */
export interface ExecutionScopeInput {
  readonly name?: string;
  readonly bindings?: readonly ScopeBinding[];
  readonly parent?: ExecutionScope;
  readonly metadata?: KernelMetadata;
}

/** Create an execution scope. */
export const defineExecutionScope = (id: string, input?: ExecutionScopeInput): ExecutionScope => ({
  id: id as KernelId<"scope.execution">,
  name: input?.name,
  bindings: input?.bindings ?? [],
  parent: input?.parent,
  metadata: input?.metadata,
});

/** Common scope binding names. */
export const SCOPE_BINDINGS = {
  // === Action scope ===
  INPUT: "input",
  ACTOR: "actor",
  SESSION: "session",
  TENANT: "tenant",
  RESULT: "result",
  ERROR: "error",
  NOW: "now",
  CLOCK: "clock",
  TRANSACTION: "transaction",

  // === Mutation scope ===
  BEFORE: "before",
  AFTER: "after",
  CHANGED: "changed",

  // === Rule scope ===
  RESOURCE: "resource",
  ACTION: "action",
  FIELD: "field",
} as const;

/** Built-in execution scopes. */
export const EXECUTION_SCOPES = {
  REQUEST: defineExecutionScope("scope:request"),
  SESSION: defineExecutionScope("scope:session"),
  TENANT: defineExecutionScope("scope:tenant"),
  TRANSACTION: defineExecutionScope("scope:transaction"),
} as const;

/** Get all bindings in a scope and its parents. */
export const getAllBindings = (scope: ExecutionScope): readonly ScopeBinding[] => {
  const bindings: ScopeBinding[] = [...scope.bindings];
  let current: ExecutionScope | undefined = scope.parent;
  while (current) {
    bindings.push(...current.bindings);
    current = current.parent;
  }
  return bindings;
};

/** Look up a binding by name in a scope. */
export const lookupBinding = (scope: ExecutionScope, name: string): ScopeBinding | undefined => {
  const all = getAllBindings(scope);
  return all.find((b) => b.name === name);
};

/** Check if a scope has a binding. */
export const hasBinding = (scope: ExecutionScope, name: string): boolean =>
  lookupBinding(scope, name) !== undefined;
