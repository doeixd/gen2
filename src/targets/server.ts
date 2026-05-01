/* @__NO_SIDE_EFFECTS__ */
/**
 * Server provider lowering target.
 *
 * Consumes RequirementSatisfactionPlan and provider IR to emit structured
 * server-side runtime wiring artifacts: request context, cookie/session reads,
 * env var lookups, and service construction.
 */

import type { GenContext } from "../core/index.ts";
import { deriveRequirementSatisfactionPlan } from "../requirements/index.ts";

export interface ServerProviderBinding {
  readonly provider_name: string;
  readonly source_kind: string;
  readonly runtime_code: string;
}

export interface ServerProviderArtifact {
  readonly kind: "server_provider_artifact";
  readonly target: "server";
  readonly bindings: readonly ServerProviderBinding[];
  readonly request_context_wiring: readonly string[];
  readonly env_reads: readonly string[];
  readonly service_constructions: readonly string[];
}

export const lowerServerProviders = (ctx: GenContext): ServerProviderArtifact => {
  const plan = deriveRequirementSatisfactionPlan(ctx);
  const bindings: ServerProviderBinding[] = [];
  const request_context_wiring: string[] = [];
  const env_reads: string[] = [];
  const service_constructions: string[] = [];

  for (const binding of plan.bindings) {
    const provider = binding.provider;
    const source = provider.source;

    bindings.push({
      provider_name: provider.name,
      source_kind: source.kind,
      runtime_code: `provide("${provider.name}", ${source.kind});`,
    });

    switch (source.kind) {
      case "request_header":
      case "cookie":
      case "route_param":
      case "query_param":
        request_context_wiring.push(
          `context.${provider.name} = read_${source.kind}("${source.name}");`,
        );
        break;
      case "env_var":
        env_reads.push(`const ${provider.name} = process.env["${source.name}"];`);
        break;
      case "service_constructor":
        service_constructions.push(`const ${provider.name} = new ${source.service.name}();`);
        break;
    }
  }

  return {
    kind: "server_provider_artifact",
    target: "server",
    bindings,
    request_context_wiring,
    env_reads,
    service_constructions,
  };
};
