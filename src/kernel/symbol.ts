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
  Payload = unknown,
> {
  readonly domain: Domain;
  readonly id: KernelId<Domain> & Id;
  readonly label: string;
  readonly metadata?: KernelMetadata;
  readonly _payload?: Payload;
}

/** Define a typed symbol. */
export const defineSymbol = <Domain extends SymbolDomain, Id extends string, Payload>(
  domain: Domain,
  id: Id,
  label: string,
  metadata?: KernelMetadata,
): SymbolDef<Domain, Id, Payload> => ({
  domain,
  id: id as KernelId<Domain> & Id,
  label,
  metadata,
});

/** Trait definition domain. */
export type TraitTarget = "type" | "expr" | "transform" | "node" | "edge" | "artifact" | "pass";

/** A trait definition - a checked semantic claim. */
export interface TraitDef<Payload = unknown, Id extends string = string> extends SymbolDef<
  "trait",
  Id,
  Payload
> {
  readonly target: TraitTarget;
  readonly implies?: readonly TraitDef[];
  readonly conflictsWith?: readonly TraitDef[];
}

/** Define a trait. */
export const defineTrait = <Payload, const Id extends string = string>(
  id: Id,
  label: string,
  target: TraitTarget,
  options?: {
    readonly implies?: readonly TraitDef[];
    readonly conflictsWith?: readonly TraitDef[];
    readonly metadata?: KernelMetadata;
  },
): TraitDef<Payload, Id> => ({
  domain: "trait",
  id: id as KernelId<"trait"> & Id,
  label,
  target,
  implies: options?.implies,
  conflictsWith: options?.conflictsWith,
  metadata: options?.metadata,
});

/** Endpoint role definition. */
export interface EndpointRoleDef<Id extends string = string> extends SymbolDef<
  "endpoint.role",
  Id
> {}

/** Capability definition - a claim about target/runtime ability. */
export interface CapabilityDef<Payload = unknown, Id extends string = string> extends SymbolDef<
  "capability",
  Id,
  Payload
> {}

/** Define a capability. */
export const defineCapability = <Payload, const Id extends string = string>(
  id: Id,
  label: string,
  metadata?: KernelMetadata,
): CapabilityDef<Payload, Id> => ({
  domain: "capability",
  id: id as KernelId<"capability"> & Id,
  label,
  metadata,
});
