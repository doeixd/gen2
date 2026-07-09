/* @__NO_SIDE_EFFECTS__ */
/**
 * Contract/actor kernel bridge — R13 graph migration for contracts and actors.
 *
 * Contracts and actors are migrated from `ctx.contracts` / `ctx.actors` arrays
 * to graph nodes. This file provides dual-write builders and graph-native
 * extraction helpers.
 */

import { defineNodeKind } from "../kernel/ods.ts";
import { defineTrait } from "../kernel/symbol.ts";
import { attachNode } from "../kernel/bridge.ts";
import type { KernelGraph } from "../kernel/graph.ts";
import { nodesOfKind } from "../kernel/graph.ts";
import type { KernelNode } from "../kernel/node.ts";
import type { Contract, Actor } from "./contract.ts";

// === Traits =================================================================

export const contractTraits = {
  /** Contract declares operations. */
  HAS_OPERATIONS: defineTrait<true>("trait.contract.hasOperations", "Has operations", "node"),
  /** Contract declares invariants. */
  HAS_INVARIANTS: defineTrait<true>("trait.contract.hasInvariants", "Has invariants", "node"),
} as const;

export const actorTraits = {
  /** Actor has a boundary identity context. */
  HAS_CONTEXT: defineTrait<true>("trait.actor.hasContext", "Has context", "node"),
} as const;

// === Node kinds =============================================================

export const CONTRACT_NODE_KIND = defineNodeKind({
  id: "node.kind.contract",
  dialect: "dialect.core.contract",
  traits: Object.values(contractTraits),
  metadata: { title: "Contract" },
});

export const ACTOR_NODE_KIND = defineNodeKind({
  id: "node.kind.actor",
  dialect: "dialect.core.contract",
  traits: Object.values(actorTraits),
  metadata: { title: "Actor" },
});

// === Bridge metadata keys ===================================================

const BRIDGE_CONTRACT = Symbol.for("gen2.bridge.contract");
const BRIDGE_ACTOR = Symbol.for("gen2.bridge.actor");

// === Graph extraction helpers ===============================================

/** Extract all Contract records from graph nodes. */
export const getContractsFromGraph = (graph: KernelGraph): Contract[] => {
  const out: Contract[] = [];
  for (const node of nodesOfKind(graph, contractKind as any)) {
    const contract = (node.metadata?.custom as any)?.[BRIDGE_CONTRACT] as Contract | undefined;
    if (contract) out.push(contract);
  }
  return out;
};

/** Extract all Actor records from graph nodes. */
export const getActorsFromGraph = (graph: KernelGraph): Actor[] => {
  const out: Actor[] = [];
  for (const node of nodesOfKind(graph, actorKind as any)) {
    const actor = (node.metadata?.custom as any)?.[BRIDGE_ACTOR] as Actor | undefined;
    if (actor) out.push(actor);
  }
  return out;
};

// === Bridge builders ========================================================

/** NodeKind for contracts compatible with KernelNode. */
const contractKind = { id: CONTRACT_NODE_KIND.id, label: "Contract" };

/** NodeKind for actors compatible with KernelNode. */
const actorKind = { id: ACTOR_NODE_KIND.id, label: "Actor" };

/**
 * Attach a Contract as a graph node.
 *
 * @param graph - The kernel graph.
 * @param contract - The contract to bridge.
 * @returns The created graph node id.
 */
export const attachContractToGraph = (graph: KernelGraph, contract: Contract): string => {
  const id = `contract:${contract.name}`;
  const node: KernelNode = {
    id: id as any,
    kind: contractKind,
    name: contract.name,
    traits: contract.operations.length > 0 ? [contractTraits.HAS_OPERATIONS] : [],
    metadata: {
      source: undefined,
      custom: {
        operationCount: contract.operations.length,
        invariantCount: contract.invariants.length,
        [BRIDGE_CONTRACT]: contract,
      },
    },
  };
  attachNode(graph, node);
  return id;
};

/**
 * Attach an Actor as a graph node.
 *
 * @param graph - The kernel graph.
 * @param actor - The actor to bridge.
 * @returns The created graph node id.
 */
export const attachActorToGraph = (graph: KernelGraph, actor: Actor): string => {
  const id = `actor:${actor.name}`;
  const node: KernelNode = {
    id: id as any,
    kind: actorKind,
    name: actor.name,
    traits: actor.within != null ? [actorTraits.HAS_CONTEXT] : [],
    metadata: {
      source: undefined,
      custom: {
        identified_by: actor.identified_by,
        within: actor.within,
        context_type: actor.context_type,
        [BRIDGE_ACTOR]: actor,
      },
    },
  };
  attachNode(graph, node);
  return id;
};
