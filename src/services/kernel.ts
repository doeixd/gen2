/* @__NO_SIDE_EFFECTS__ */
/**
 * Adapter: ServiceRef / MethodRef → kernel graph IR.
 *
 * Pure conversion from legacy service/method domain objects to kernel nodes.
 */

import type { ServiceRef, MethodRef } from "./services.ts";
import {
  defineNode,
  graphFragment,
  graphNode,
  nodeKinds,
  type AnyGraphStep,
} from "../kernel/index.ts";

const serviceNodeId = (service: ServiceRef): string => `node:service:${service.id ?? service.name}`;

const methodNodeId = (service: ServiceRef, method: MethodRef): string =>
  `node:method:${service.name}.${method.id ?? method.name}`;

/** Build a `Node(kind: SERVICE)` for a service. */
export const serviceRefToKernelNode = (service: ServiceRef) =>
  defineNode(nodeKinds.SERVICE, serviceNodeId(service), {
    name: service.name,
    metadata: {
      title: service.name,
      description: `Service with ${service.methods.length} method(s)`,
      custom: { ref: service.ref },
    },
  });

/** Build a `Node(kind: SERVICE)` for a method. */
export const methodRefToKernelNode = (service: ServiceRef, method: MethodRef) =>
  defineNode(nodeKinds.SERVICE, methodNodeId(service, method), {
    name: method.name,
    metadata: {
      title: `${service.name}.${method.name}`,
      description: `Method ${method.name} on ${service.name}`,
      custom: { ref: method.ref },
    },
  });

/** Build a composable graph fragment for a service and its methods. */
export const serviceRefToGraphFragment = (service: ServiceRef): AnyGraphStep =>
  graphFragment(
    graphNode(serviceRefToKernelNode(service)),
    ...service.methods.map((method) => graphNode(methodRefToKernelNode(service, method))),
  );

/** Build a composable graph fragment for a service method. */
export const methodRefToGraphFragment = (service: ServiceRef, method: MethodRef): AnyGraphStep =>
  graphFragment(graphNode(methodRefToKernelNode(service, method)));
