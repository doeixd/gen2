/* @__NO_SIDE_EFFECTS__ */
/**
 * Adapter: Policy → kernel graph IR.
 *
 * Pure conversion from the legacy `Policy` domain object to a kernel
 * `Node(kind: POLICY)` plus edges:
 *   - `Edge(kind: TARGETS)` connecting the policy to its target entity.
 *   - `Edge(kind: REQUIRES)` connecting the policy to its rule predicate
 *     (if present).
 *
 * No `ctx.graph` mutation — registration happens in the binder dual-write.
 *
 * See `docs/revised-kernel.md` and `docs/revision/revised_phases.md` §R8.
 */

import type { Policy } from "./authz.ts";
import {
  type KernelEdge,
  type KernelNode,
  type KernelRef,
  type EdgeKind,
  type EndpointRole,
  defineEdge,
  defineNode,
  graphEdge,
  graphFragment,
  graphNode,
  kernelId,
  nodeKinds,
  type GraphFragment,
} from "../kernel/index.ts";
import {
  POLICY_NODE_KIND,
  POLICY_TARGETS_ENTITY_EDGE_KIND,
  POLICY_USES_RULE_EDGE_KIND,
  type PolicyNodeCustom,
} from "../dialects/auth.ts";

const edgeKindFromDef = (def: {
  readonly id: string;
  readonly metadata?: { readonly title?: unknown };
}): EdgeKind => ({
  id: def.id,
  label: typeof def.metadata?.title === "string" ? def.metadata.title : def.id,
});

const endpointRoleFromDef = (def: {
  readonly id: string;
  readonly name: string;
}): EndpointRole => ({
  id: def.id,
  label: def.name,
});

const policyTargetsEntityKind = edgeKindFromDef(POLICY_TARGETS_ENTITY_EDGE_KIND);
const policyUsesRuleKind = edgeKindFromDef(POLICY_USES_RULE_EDGE_KIND);
const policyTargetsPolicyRole = endpointRoleFromDef(POLICY_TARGETS_ENTITY_EDGE_KIND.endpoints[0]!);
const policyTargetsEntityRole = endpointRoleFromDef(POLICY_TARGETS_ENTITY_EDGE_KIND.endpoints[1]!);
const policyUsesPolicyRole = endpointRoleFromDef(POLICY_USES_RULE_EDGE_KIND.endpoints[0]!);
const policyUsesRuleRole = endpointRoleFromDef(POLICY_USES_RULE_EDGE_KIND.endpoints[1]!);

const policyNodeId = (policy: Policy): string => `node:policy:${policy.name}`;

const policyNodeRef = (policy: Policy): KernelRef<"node"> => ({
  kind: "node",
  id: kernelId<"node">(policyNodeId(policy)),
});

const targetsEdgeId = (policy: Policy): string =>
  `edge:targets:${policy.name}->${policy.target_entity.name}`;

const requiresRuleEdgeId = (policy: Policy): string =>
  `edge:requires:${policy.name}->${policy.predicate!.name}`;

/**
 * Build the kernel `Node(kind: POLICY)` for a policy.
 *
 * The node carries a typed `PolicyNodeCustom` payload (PLAN.md
 * Track R §R2 — no `_bridge*` side channel) so dialect-owned passes
 * can walk back to the target entity and predicate rule by name.
 */
export const policyToKernelNode = (policy: Policy): KernelNode => {
  const custom = {
    policy,
    target_entity_name: policy.target_entity.name,
    predicate_rule_name: policy.predicate?.name,
  } satisfies PolicyNodeCustom;
  return defineNode(nodeKinds.POLICY, policyNodeId(policy), {
    name: policy.name,
    metadata: {
      title: policy.name,
      description: `Policy targeting ${policy.target_entity.name}`,
      custom,
    },
  });
};

/**
 * Build kernel edges that describe a policy's relationships:
 *   - TARGETS edge to the target entity.
 *   - REQUIRES edge to the rule predicate (if any).
 */
export const policyToKernelEdges = (policy: Policy): readonly KernelEdge[] => {
  const edges: KernelEdge[] = [];
  const policyRef = policyNodeRef(policy);

  edges.push(
    defineEdge(
      policyTargetsEntityKind,
      targetsEdgeId(policy),
      [
        { role: policyTargetsPolicyRole, target: policyRef, cardinality: "one" },
        { role: policyTargetsEntityRole, target: policy.target_entity.ref, cardinality: "one" },
      ],
      { metadata: { title: `${policy.name} targets ${policy.target_entity.name}` } },
    ),
  );

  if (policy.predicate) {
    edges.push(
      defineEdge(
        policyUsesRuleKind,
        requiresRuleEdgeId(policy),
        [
          { role: policyUsesPolicyRole, target: policyRef, cardinality: "one" },
          {
            role: policyUsesRuleRole,
            target: { kind: "node", id: kernelId<"node">(`node:rule:${policy.predicate.name}`) },
            cardinality: "one",
          },
        ],
        { metadata: { title: `${policy.name} requires rule ${policy.predicate.name}` } },
      ),
    );
  }

  return edges;
};

/** Build a composable graph fragment for a policy and its auth edges. */
export const policyToGraphFragment = (policy: Policy): GraphFragment =>
  graphFragment(
    graphNode(policyToKernelNode(policy)),
    ...policyToKernelEdges(policy).map((edge) => graphEdge(edge)),
  );

export const getPoliciesFromGraph = (graph: {
  nodes: ReadonlyMap<string, KernelNode>;
}): Policy[] => {
  const policies: Policy[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind.id !== POLICY_NODE_KIND.id) continue;
    const custom = node.metadata?.custom as PolicyNodeCustom | undefined;
    if (custom?.policy) policies.push(custom.policy);
  }
  return policies;
};
