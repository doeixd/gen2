/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel symbol - typed symbol definitions.
 *
 * Base for all typed symbol definitions: trait, node kind, edge kind, law, capability, etc.
 * Matches the revised core: no magic strings for internal semantics.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";

/** Symbol domain - categorizes what kind of symbol this is. */
export type SymbolDomain =
  | "trait"
  | "node.kind"
  | "edge.kind"
  | "endpoint.role"
  | "law"
  | "capability"
  | "target"
  | "transform";

/** A typed symbol definition. */
export interface SymbolDef<
  Domain extends SymbolDomain,
  Id extends string = string,
  Payload = unknown
> {
  readonly domain: Domain;
  readonly id: KernelId<Domain>;
  readonly label: string;
  readonly metadata?: KernelMetadata;
  readonly _payload?: Payload;
}

/** Define a typed symbol. */
export const defineSymbol = <Domain extends SymbolDomain, Id extends string, Payload>(
  domain: Domain,
  id: string,
  label: string,
  metadata?: KernelMetadata,
): SymbolDef<Domain, Id, Payload> => ({
  domain,
  id: id as KernelId<Domain>,
  label,
  metadata,
});

/** Trait definition domain. */
export type TraitTarget =
  | "type"
  | "expr"
  | "transform"
  | "node"
  | "edge"
  | "artifact"
  | "pass";

/** A trait definition - a checked semantic claim. */
export interface TraitDef<Payload = unknown> extends SymbolDef<"trait", string, Payload> {
  readonly target: TraitTarget;
  readonly implies?: readonly TraitDef[];
  readonly conflictsWith?: readonly TraitDef[];
}

/** Define a trait. */
export const defineTrait = <Payload>(
  id: string,
  label: string,
  target: TraitTarget,
  options?: {
    readonly implies?: readonly TraitDef[];
    readonly conflictsWith?: readonly TraitDef[];
    readonly metadata?: KernelMetadata;
  },
): TraitDef<Payload> => ({
  domain: "trait",
  id: id as KernelId<"trait">,
  label,
  target,
  implies: options?.implies,
  conflictsWith: options?.conflictsWith,
  metadata: options?.metadata,
});

/** Node kind definition. */
export interface NodeKindDef<Payload = unknown> extends SymbolDef<"node.kind", string, Payload> {}

/** Define a node kind. */
export const defineNodeKind = (
  id: string,
  label: string,
  metadata?: KernelMetadata,
): NodeKindDef => ({
  domain: "node.kind",
  id: id as KernelId<"node.kind">,
  label,
  metadata,
});

/** Edge kind definition. */
export interface EdgeKindDef<Payload = unknown> extends SymbolDef<"edge.kind", string, Payload> {
  readonly roles?: readonly EndpointRoleDef[];
}

/** Define an edge kind. */
export const defineEdgeKind = (
  id: string,
  label: string,
  options?: {
    readonly roles?: readonly EndpointRoleDef[];
    readonly metadata?: KernelMetadata;
  },
): EdgeKindDef => ({
  domain: "edge.kind",
  id: id as KernelId<"edge.kind">,
  label,
  roles: options?.roles,
  metadata: options?.metadata,
});

/** Endpoint role definition. */
export interface EndpointRoleDef extends SymbolDef<"endpoint.role", string> {}

/** Define an endpoint role. */
export const defineEndpointRole = (
  id: string,
  label: string,
  metadata?: KernelMetadata,
): EndpointRoleDef => ({
  domain: "endpoint.role",
  id: id as KernelId<"endpoint.role">,
  label,
  metadata,
});

/** Law definition - a behavioral/algebraic semantic claim. */
export interface LawDef<Payload = unknown> extends SymbolDef<"law", string, Payload> {
  readonly appliesTo: readonly TraitTarget[];
}

/** Define a law. */
export const defineLaw = <Payload>(
  id: string,
  label: string,
  appliesTo: readonly TraitTarget[],
  metadata?: KernelMetadata,
): LawDef<Payload> => ({
  domain: "law",
  id: id as KernelId<"law">,
  label,
  appliesTo,
  metadata,
});

/** Capability definition - a claim about target/runtime ability. */
export interface CapabilityDef<Payload = unknown> extends SymbolDef<"capability", string, Payload> {}

/** Define a capability. */
export const defineCapability = <Payload>(
  id: string,
  label: string,
  metadata?: KernelMetadata,
): CapabilityDef<Payload> => ({
  domain: "capability",
  id: id as KernelId<"capability">,
  label,
  metadata,
});