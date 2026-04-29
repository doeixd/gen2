/* @__NO_SIDE_EFFECTS__ */
/**
 * Service references and module graph derivation.
 *
 * Services declare capabilities that functions, resources, routes, and forms
 * may require. The module graph derives requirements and reports missing
 * providers as diagnostics.
 */

import type { SemanticType, Capability, Requirement } from "../types/index.ts";
import type { GenContext, Diagnostic } from "../core/index.ts";
import { diagnostic } from "../core/index.ts";

/** A single method on a service with typed input/output and required capabilities. */
export interface MethodRef<In = unknown, Out = unknown> {
  readonly kind: "method_ref";
  readonly name: string;
  readonly input_type: SemanticType<In>;
  readonly output_type: SemanticType<Out>;
  readonly capabilities: readonly Capability[];
  readonly _input?: In;
  readonly _output?: Out;
}

/** A service reference exposing named methods. */
export interface ServiceRef<Methods extends readonly MethodRef[] = readonly MethodRef[]> {
  readonly kind: "service_ref";
  readonly name: string;
  readonly methods: Methods;
  readonly _methods?: Methods;
}

/** Inference helper: extract the method names from a ServiceRef. */
export type InferServiceMethods<S> =
  S extends ServiceRef<infer Methods>
    ? Methods extends readonly MethodRef[]
      ? { [K in keyof Methods]: Methods[K] extends MethodRef ? Methods[K]["name"] : never }
      : never
    : never;

/** A node in the module graph describing a registered component and its requirements. */
export interface ModuleGraphNode {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly requirements: readonly Requirement[];
  readonly missing_services: readonly string[];
}

/** A derived graph of services and their consumers. */
export interface ModuleGraph {
  readonly kind: "module_graph";
  readonly nodes: readonly ModuleGraphNode[];
}

export const defineMethodRef = <In = unknown, Out = unknown>(input: {
  readonly name: string;
  readonly input_type: SemanticType<In>;
  readonly output_type: SemanticType<Out>;
  readonly capabilities?: readonly Capability[];
}): MethodRef<In, Out> => ({
  kind: "method_ref",
  name: input.name,
  input_type: input.input_type,
  output_type: input.output_type,
  capabilities: input.capabilities ?? [],
});

export const defineServiceRef = <
  const Methods extends readonly MethodRef[] = readonly MethodRef[],
>(input: {
  readonly name: string;
  readonly methods?: Methods;
}): ServiceRef<Methods> => ({
  kind: "service_ref",
  name: input.name,
  methods: (input.methods ?? []) as Methods,
});

const checkNode = (
  id: string,
  kind: string,
  name: string,
  reqs: readonly Requirement[],
  serviceNames: ReadonlySet<string>,
): ModuleGraphNode => {
  const missing = reqs.filter((r) => !serviceNames.has(r.kind)).map((r) => r.kind);
  return { id, kind, name, requirements: reqs, missing_services: [...new Set(missing)] };
};

/**
 * Derives a module graph from the context, bubbling requirements from
 * query/action functions up through resources, mutations, app routes, and forms.
 *
 * @param ctx - The GenContext to inspect.
 * @returns A module graph with requirement and missing-provider information.
 */
export const deriveModuleGraph = (ctx: GenContext): ModuleGraph => {
  const serviceNames = new Set(ctx.services.map((s) => s.name));
  const nodes: ModuleGraphNode[] = [];

  for (const resource of ctx.reactive_resources) {
    nodes.push(
      checkNode(
        `resource:${resource.name}`,
        "resource",
        resource.name,
        resource.query.requirements,
        serviceNames,
      ),
    );
  }

  for (const mutation of ctx.reactive_mutations) {
    nodes.push(
      checkNode(
        `mutation:${mutation.name}`,
        "mutation",
        mutation.name,
        mutation.action.requirements,
        serviceNames,
      ),
    );
  }

  for (const route of ctx.app_routes) {
    const reqs: Requirement[] = [];
    for (const loader of route.loaders) {
      if ("query" in loader) {
        reqs.push(...loader.query.requirements);
      } else {
        reqs.push(...loader.requirements);
      }
    }
    if (route.action) {
      if ("action" in route.action) {
        reqs.push(...route.action.action.requirements);
      } else {
        reqs.push(...route.action.requirements);
      }
    }
    nodes.push(checkNode(`app_route:${route.path}`, "app_route", route.path, reqs, serviceNames));
  }

  for (const form of ctx.forms) {
    if (form.source_function) {
      nodes.push(
        checkNode(
          `form:${form.name}`,
          "form",
          form.name,
          form.source_function.requirements,
          serviceNames,
        ),
      );
    }
  }

  return { kind: "module_graph", nodes };
};

/**
 * Validates that every bubbled requirement has a matching registered service.
 *
 * @param ctx - The GenContext to check.
 * @returns Diagnostics for any missing service providers.
 */
export const checkServices = (ctx: GenContext): readonly Diagnostic[] => {
  const graph = deriveModuleGraph(ctx);
  const out: Diagnostic[] = [];
  for (const node of graph.nodes) {
    for (const missing of node.missing_services) {
      out.push(
        diagnostic({
          severity: "error",
          code: "services:missing-provider",
          message: `Node ${node.name} (${node.kind}) requires service "${missing}" but no ServiceRef is registered`,
        }),
      );
    }
  }
  return out;
};
