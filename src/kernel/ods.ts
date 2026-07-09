/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel ODS - Operation Definition Specification.
 *
 * MLIR-style table-driven op definitions with verifiers, canonicalizers, and
 * generated accessors. Avoids magic strings and error-prone getOperand(3) access.
 */
import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";
import type { TraitDef } from "./trait.ts";

/** A verifier function - checks an object's invariants. */
export type VerifierFn<T> = (obj: T) => readonly string[];

/** A canonicalizer function - normalizes a set of objects. */
export type CanonicalizerFn<O> = (objs: readonly O[]) => readonly O[];

/** Endpoint target specification. */
export interface EndpointTarget {
  /** Node kind IDs that can occupy this endpoint. */
  readonly targetKinds?: readonly NodeKindDef[];
  /** Trait IDs that the endpoint node must carry. */
  readonly requiresTraits?: readonly string[];
  /** Trait IDs that the endpoint node must NOT carry. */
  readonly excludesTraits?: readonly string[];
}

/** Endpoint role - typed endpoint definition with constraints. */
export interface EndpointRoleDef<
  Name extends string = string,
  Target extends EndpointTarget = EndpointTarget,
> {
  readonly id: KernelId<"endpoint.role">;
  readonly name: Name;
  readonly target: Target;
  readonly metadata?: KernelMetadata;
}
export const defineEndpointRole = <const Name extends string, const Target extends EndpointTarget>(
  name: Name,
  target: Target,
  metadata?: KernelMetadata,
): EndpointRoleDef<Name, Target> => ({
  id: `endpoint.role:${name}` as KernelId<"endpoint.role">,
  name,
  target,
  metadata,
});

/** Minimal shape a `.relations({...})` schema must satisfy at the type level. */
export type RelationSchemaShape = Readonly<Record<string, { readonly kind: "relation" }>>;

/** Node kind definition with ODS-style constraints. */
export interface NodeKindDef<
  Id extends string = string,
  Inputs extends readonly EndpointRoleDef[] = readonly EndpointRoleDef[],
  Outputs extends readonly EndpointRoleDef[] = readonly EndpointRoleDef[],
  Traits extends readonly TraitDef[] = readonly TraitDef[],
  Custom extends object = Record<string, unknown>,
> {
  readonly id: KernelId<"node.kind"> & Id;
  readonly dialect?: string;
  readonly inputs: Inputs;
  readonly outputs: Outputs;
  readonly traits: Traits;
  readonly verifier?: VerifierFn<unknown>;
  readonly canonicalizers?: readonly CanonicalizerFn<unknown>[];
  readonly metadata?: KernelMetadata;
  readonly custom?: Custom;
}

/**
 * NodeKindDef augmented with a typed relation schema. Produced by the
 * fluent `.relations(schema)` step on a `defineNodeKind(...)` result.
 * The `relationSchema` field carries the schema so downstream passes
 * (verifiers, runtime accessors, pattern shortcuts, surface inputs)
 * can read it without erasing types.
 */
export interface NodeKindDefWithRelations<
  Id extends string = string,
  Inputs extends readonly EndpointRoleDef[] = readonly EndpointRoleDef[],
  Outputs extends readonly EndpointRoleDef[] = readonly EndpointRoleDef[],
  Traits extends readonly TraitDef[] = readonly TraitDef[],
  Custom extends object = Record<string, unknown>,
  Schema extends RelationSchemaShape = RelationSchemaShape,
> extends NodeKindDef<Id, Inputs, Outputs, Traits, Custom> {
  readonly relationSchema: Schema;
}

/**
 * A NodeKindDef plus the fluent `.relations(schema)` method.
 *
 * Calling `.relations(...)` returns a `NodeKindDefWithRelations` witness
 * with the schema attached. The non-augmented witness still satisfies the
 * existing `NodeKindDef` shape and is the type seen by all current
 * callsites that don't opt into relations.
 */
export type NodeKindBuilder<
  Id extends string = string,
  Inputs extends readonly EndpointRoleDef[] = readonly EndpointRoleDef[],
  Outputs extends readonly EndpointRoleDef[] = readonly EndpointRoleDef[],
  Traits extends readonly TraitDef[] = readonly TraitDef[],
  Custom extends object = Record<string, unknown>,
> = NodeKindDef<Id, Inputs, Outputs, Traits, Custom> & {
  readonly relations: <const Schema extends RelationSchemaShape>(
    schema: Schema,
  ) => NodeKindDefWithRelations<Id, Inputs, Outputs, Traits, Custom, Schema>;
};

export const defineNodeKind = <
  const Id extends string,
  const Inputs extends readonly EndpointRoleDef[] = [],
  const Outputs extends readonly EndpointRoleDef[] = [],
  const Traits extends readonly TraitDef[] = [],
  const Custom extends object = Record<string, unknown>,
>(def: {
  readonly id: Id;
  readonly dialect?: string;
  readonly inputs?: Inputs;
  readonly outputs?: Outputs;
  readonly traits?: Traits;
  readonly verifier?: VerifierFn<unknown>;
  readonly canonicalizers?: readonly CanonicalizerFn<unknown>[];
  readonly metadata?: KernelMetadata;
  readonly custom?: Custom;
}): NodeKindBuilder<Id, Inputs, Outputs, Traits, Custom> => {
  const base: NodeKindDef<Id, Inputs, Outputs, Traits, Custom> = {
    id: def.id as KernelId<"node.kind"> & Id,
    dialect: def.dialect,
    inputs: (def.inputs ?? []) as Inputs,
    outputs: (def.outputs ?? []) as Outputs,
    traits: (def.traits ?? []) as Traits,
    verifier: def.verifier,
    canonicalizers: def.canonicalizers,
    metadata: def.metadata,
    custom: def.custom,
  };
  return Object.assign(base, {
    relations: <const Schema extends RelationSchemaShape>(
      schema: Schema,
    ): NodeKindDefWithRelations<Id, Inputs, Outputs, Traits, Custom, Schema> => ({
      ...base,
      relationSchema: schema,
    }),
  });
};

/** Edge kind definition with typed endpoints. */
export interface EdgeKindDef<
  Id extends string = string,
  Endpoints extends readonly EndpointRoleDef[] = readonly EndpointRoleDef[],
  Traits extends readonly TraitDef[] = readonly TraitDef[],
  EndpointShape extends readonly EndpointRoleDef[] | Readonly<Record<string, EndpointRoleDef>> =
    Endpoints,
  Custom extends object = Record<string, unknown>,
> {
  readonly id: KernelId<"edge.kind"> & Id;
  readonly dialect?: string;
  readonly endpoints: Endpoints;
  readonly _endpointShape?: EndpointShape;
  readonly traits: Traits;
  readonly verifier?: VerifierFn<unknown>;
  readonly canonicalizers?: readonly CanonicalizerFn<unknown>[];
  readonly metadata?: KernelMetadata;
  readonly custom?: Custom;
}
export const defineEdgeKind = <
  const Id extends string,
  const Endpoints extends readonly EndpointRoleDef[] | Record<string, EndpointRoleDef>,
  const Traits extends readonly TraitDef[] = [],
  const Custom extends object = Record<string, unknown>,
>(def: {
  readonly id: Id;
  readonly dialect?: string;
  readonly endpoints: Endpoints;
  readonly traits?: Traits;
  readonly verifier?: VerifierFn<unknown>;
  readonly canonicalizers?: readonly CanonicalizerFn<unknown>[];
  readonly metadata?: KernelMetadata;
  readonly custom?: Custom;
}): EdgeKindDef<
  Id,
  Endpoints extends readonly EndpointRoleDef[] ? Endpoints : readonly EndpointRoleDef[],
  Traits,
  Endpoints,
  Custom
> => ({
  id: def.id as KernelId<"edge.kind"> & Id,
  dialect: def.dialect,
  endpoints: (Array.isArray(def.endpoints)
    ? def.endpoints
    : Object.values(def.endpoints)) as unknown as Endpoints extends readonly EndpointRoleDef[]
    ? Endpoints
    : readonly EndpointRoleDef[],
  traits: (def.traits ?? []) as Traits,
  verifier: def.verifier,
  canonicalizers: def.canonicalizers,
  metadata: def.metadata,
  custom: def.custom,
});
