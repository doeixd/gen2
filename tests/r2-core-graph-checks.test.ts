import { describe, expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import {
  checkRequirements,
  checkRequirementsOnGraph,
  deriveRequirementSatisfactionPlan,
  deriveRequirementSatisfactionPlanFromGraph,
} from "../src/requirements/index.ts";
import { lifecycle } from "../src/index.ts";
import { checkContextAndStorage } from "../src/lifecycle/index.ts";
import { checkContextAndStorageOnGraph } from "../src/context/index.ts";

const diagnosticCodes = (diagnostics: readonly { code: string }[]): readonly string[] =>
  diagnostics.map((diagnostic) => diagnostic.code).sort((a, b) => a.localeCompare(b));

describe("R2 core graph checks", () => {
  test("requirement graph reader matches legacy missing provider diagnostics", () => {
    const { ctx, gen } = createGen();
    gen.requirement.define({
      name: "EmailService",
      value_type: gen.types.object({ send: gen.types.string() }),
    });

    expect(diagnosticCodes(checkRequirementsOnGraph(ctx.graph))).toEqual(
      diagnosticCodes(checkRequirements(ctx)),
    );
    const graphPlan = deriveRequirementSatisfactionPlanFromGraph(ctx.graph);
    expect(graphPlan.kind).toBe("graph_requirement_satisfaction_plan");
    expect(graphPlan.requirements).toHaveLength(1);
    expect(deriveRequirementSatisfactionPlan(ctx).requirements).toHaveLength(1);
  });

  test("requirement graph reader matches legacy ambiguous provider diagnostics", () => {
    const { ctx, gen } = createGen();
    const EmailService = gen.requirement.define({
      name: "EmailService",
      value_type: gen.types.object({ send: gen.types.string() }),
    });
    gen.provider.define({
      name: "smtpA",
      provides: EmailService,
      source: gen.provider.source.opaqueRuntime("smtpA"),
    });
    gen.provider.define({
      name: "smtpB",
      provides: EmailService,
      source: gen.provider.source.opaqueRuntime("smtpB"),
    });

    expect(diagnosticCodes(checkRequirementsOnGraph(ctx.graph))).toEqual(
      diagnosticCodes(checkRequirements(ctx)),
    );
  });

  test("context graph check matches legacy missing provider diagnostics", () => {
    const { ctx, gen } = createGen();
    const AuthSession = gen.context.define({
      name: "AuthSession",
      semantic_type: gen.types.object({ userId: gen.types.uuid() }),
    });
    gen.context.require({ context: AuthSession });

    expect(diagnosticCodes(checkContextAndStorageOnGraph(ctx.graph))).toEqual(
      diagnosticCodes(checkContextAndStorage(ctx)),
    );
  });

  test("context graph check matches legacy unsafe storage diagnostics", () => {
    const { ctx, gen } = createGen();
    const AuthSession = gen.context.define({
      name: "AuthSession",
      semantic_type: gen.types.object({ userId: gen.types.uuid() }),
    });
    gen.context.provide({ context: AuthSession, from: gen.location.clientLocalStorage() });

    expect(diagnosticCodes(checkContextAndStorageOnGraph(ctx.graph))).toEqual(
      diagnosticCodes(checkContextAndStorage(ctx)),
    );
  });

  test("lifecycle uses graph-native R2 checks", () => {
    const { ctx, gen } = createGen();
    gen.requirement.define({
      name: "EmailService",
      value_type: gen.types.object({ send: gen.types.string() }),
    });
    const AuthSession = gen.context.define({
      name: "AuthSession",
      semantic_type: gen.types.object({ userId: gen.types.uuid() }),
    });
    gen.context.require({ context: AuthSession });

    const result = lifecycle.check(ctx);
    expect(diagnosticCodes(result.diagnostics)).toEqual(
      expect.arrayContaining(["context:missing-provider", "requirement:missing-provider"]),
    );
  });

  test("requirement graph reader matches legacy provider dependency cycles", () => {
    const { ctx, gen } = createGen();
    const A = gen.requirement.define({ name: "A", value_type: gen.types.string() });
    const B = gen.requirement.define({ name: "B", value_type: gen.types.string() });

    gen.provider.define({
      name: "ProviderA",
      provides: A,
      source: gen.provider.source.staticValue("a", A.value_type),
      requires: [B],
    });
    gen.provider.define({
      name: "ProviderB",
      provides: B,
      source: gen.provider.source.staticValue("b", B.value_type),
      requires: [A],
    });

    expect(diagnosticCodes(checkRequirementsOnGraph(ctx.graph))).toEqual(
      diagnosticCodes(checkRequirements(ctx)),
    );
  });

  test("requirement graph reader matches legacy sensitive provider placement diagnostics", () => {
    const { ctx, gen } = createGen();
    const SecretToken = gen.requirement.define({
      name: "SecretToken",
      value_type: gen.types.string(),
      sensitivity: "secret",
    });

    gen.provider.define({
      name: "SecretLocalStorageProvider",
      provides: SecretToken,
      source: gen.provider.source.clientStorage(
        gen.location.clientLocalStorage(),
        SecretToken.value_type,
      ),
      lifetime: "app",
    });

    expect(diagnosticCodes(checkRequirementsOnGraph(ctx.graph))).toEqual(
      diagnosticCodes(checkRequirements(ctx)),
    );
  });

  test("requirement graph reader matches legacy server-only placement diagnostics", () => {
    const { ctx, gen } = createGen();
    const InternalSession = gen.requirement.define({
      name: "InternalSession",
      value_type: gen.types.string(),
      sensitivity: "server_only",
    });

    gen.provider.define({
      name: "InternalSessionClientProvider",
      provides: InternalSession,
      source: gen.provider.source.staticValue("session", InternalSession.value_type),
      placement: gen.location.clientMemory(),
      lifetime: "component",
    });

    expect(diagnosticCodes(checkRequirementsOnGraph(ctx.graph))).toEqual(
      diagnosticCodes(checkRequirements(ctx)),
    );
  });

  test("requirement graph reader matches legacy lifetime escape diagnostics", () => {
    const { ctx, gen } = createGen();
    const RequestId = gen.requirement.define({ name: "RequestId", value_type: gen.types.string() });

    gen.provider.define({
      name: "RequestHeaderGlobalProvider",
      provides: RequestId,
      source: gen.provider.source.requestHeader("x-request-id", RequestId.value_type),
      lifetime: "global",
    });

    expect(diagnosticCodes(checkRequirementsOnGraph(ctx.graph))).toEqual(
      diagnosticCodes(checkRequirements(ctx)),
    );
  });

  test("requirement graph reader matches legacy request value in global cache diagnostics", () => {
    const { ctx, gen } = createGen();
    const RequestId = gen.requirement.define({ name: "RequestId", value_type: gen.types.string() });

    gen.provider.define({
      name: "RequestCacheProvider",
      provides: RequestId,
      source: gen.provider.source.staticValue("request-1", RequestId.value_type),
      lifetime: "request",
      storage: gen.location.sharedCache(),
    });

    expect(diagnosticCodes(checkRequirementsOnGraph(ctx.graph))).toEqual(
      diagnosticCodes(checkRequirements(ctx)),
    );
  });

  test("requirement graph reader matches legacy regulated client-readable storage diagnostics", () => {
    const { ctx, gen } = createGen();
    const RegulatedData = gen.requirement.define({
      name: "RegulatedData",
      value_type: gen.types.string(),
      sensitivity: "regulated",
    });

    gen.provider.define({
      name: "RegulatedClientProvider",
      provides: RegulatedData,
      source: gen.provider.source.staticValue("regulated", RegulatedData.value_type),
      sensitivity: "regulated",
      storage: gen.location.clientLocalStorage(),
    });

    expect(diagnosticCodes(checkRequirementsOnGraph(ctx.graph))).toEqual(
      diagnosticCodes(checkRequirements(ctx)),
    );
  });

  test("provider safe projection is represented on graph provider nodes", () => {
    const { ctx, gen } = createGen();
    const AuthSession = gen.context.define({
      name: "AuthSession",
      semantic_type: gen.types.object({ userId: gen.types.uuid(), token: gen.types.string() }),
    });

    gen.provider.define({
      name: "AuthProvider",
      provides: AuthSession,
      source: gen.provider.source.requestHeader("authorization", AuthSession.semantic_type),
      sensitivity: "secret",
      client_projection: gen.hydration.projection({
        source_name: "AuthSession",
        projected_type: gen.types.object({ userId: gen.types.uuid() }),
        projected_sensitivity: "public",
      }),
    });

    const providerNode = [...ctx.graph.nodes.values()].find((node) => node.name === "AuthProvider");
    expect(providerNode?.metadata?.custom?.client_projection).toEqual({
      source_name: "AuthSession",
      projected_type: "object({userId:uuid})",
      projected_sensitivity: "public",
    });
  });
});
