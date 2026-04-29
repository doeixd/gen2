/* @__NO_SIDE_EFFECTS__ */
/**
 * Contracts and Actors. Contracts are interface declarations that plugins/targets
 * can demand or fulfil (`demands Codec`, `fulfils EventSubmitter`). Actors are
 * boundary identity declarations used in surface `facing` clauses.
 *
 * See spec/core.allium :: entity Contract, entity ContractOperation,
 * entity ContractInvariant, entity Actor.
 */

import { type Diagnostic, diagnostic } from "./diagnostics.ts";

/** A named operation within a contract with typed input and output. */
export interface ContractOperation {
  readonly name: string;
  readonly input_type: string;
  readonly output_type: string;
}

/** A named invariant assertion attached to a contract. */
export interface ContractInvariant {
  readonly name: string;
  readonly description: string;
  readonly expression?: string;
}

/** An interface declaration that plugins or targets can demand or fulfil. */
export interface Contract {
  readonly name: string;
  readonly operations: readonly ContractOperation[];
  readonly invariants: readonly ContractInvariant[];
}

/** Boundary identity declaration used in surface `facing` clauses. */
export interface Actor {
  readonly name: string;
  /** Field name on the actor that uniquely identifies the principal (e.g. "email"). */
  readonly identified_by: string;
  /**
   * Optional context entity for boundary identity. When set, context_type must
   * also be set (enforced by ActorWithinRequiresContextType).
   */
  readonly within?: string;
  readonly context_type?: string;
}

/** A named action governed by a policy. */
export interface PolicyAction {
  readonly action: string;
  readonly policy_name: string;
}

// --- Constructors ----------------------------------------------------------

/**
 * Creates a Contract record.
 *
 * @param name - Contract name.
 * @param operations - Operations the contract declares.
 * @param invariants - Optional invariant assertions.
 * @returns A Contract record.
 */
export const defineContract = (
  name: string,
  operations: readonly ContractOperation[],
  invariants?: readonly ContractInvariant[],
): Contract => ({ name, operations, invariants: invariants ?? [] });

/**
 * Creates a ContractOperation record.
 *
 * @param name - Operation name.
 * @param input_type - Input type name.
 * @param output_type - Output type name.
 * @returns A ContractOperation record.
 */
export const defineContractOperation = (
  name: string,
  input_type: string,
  output_type: string,
): ContractOperation => ({
  name,
  input_type,
  output_type,
});

/**
 * Creates an Actor record.
 *
 * @param name - Actor name.
 * @param identified_by - Field name that uniquely identifies the principal.
 * @param within - Optional context entity name.
 * @param context_type - Optional context type name (required when within is set).
 * @returns An Actor record.
 */
export const defineActor = (
  name: string,
  identified_by: string,
  within?: string,
  context_type?: string,
): Actor => ({ name, identified_by, within, context_type });

/**
 * Validates contract and actor core invariants.
 *
 * @param contracts - Contracts to validate.
 * @param actors - Actors to validate.
 * @returns Diagnostics for duplicate operations and invalid actor context declarations.
 */
export const checkContractsAndActors = (
  contracts: readonly Contract[],
  actors: readonly Actor[],
): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  for (const contract of contracts) {
    const seen = new Set<string>();
    for (const operation of contract.operations) {
      if (seen.has(operation.name)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "core:duplicate-contract-operation",
            message: `Contract ${contract.name} declares duplicate operation ${operation.name}`,
          }),
        );
      }
      seen.add(operation.name);
    }
  }

  for (const actor of actors) {
    if (actor.within != null && actor.context_type == null) {
      out.push(
        diagnostic({
          severity: "error",
          code: "core:actor-missing-context-type",
          message: `Actor ${actor.name} uses within: but does not declare context_type`,
        }),
      );
    }
  }

  return out;
};
