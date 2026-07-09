import { describe, expectTypeOf, test } from "vite-plus/test";
import { kernel } from "../src/index.ts";

describe("kernel predicate and surface witnesses", () => {
  test("predicate witnesses preserve literal identity and typed inputs", () => {
    const customFlavor = kernel.definePredicateFlavor({
      id: "predicate.flavor.audit",
      label: "Audit predicate",
    });
    const customSubjectKind = kernel.defineSubjectKind({
      id: "subject.kind.auditEvent",
      label: "Audit event",
    });
    const subject = { name: "IncidentViewed" } as const;
    const vars = { actorId: "uuid" } as const;
    const body = { op: "existsAuditEvent" } as const;
    const predicate = kernel.definePredicate({
      id: "predicate.audit.incidentViewed",
      subjectKind: customSubjectKind,
      subject,
      vars,
      body,
      assurance: kernel.assuranceKind.TESTED,
      flavor: customFlavor,
    });

    expectTypeOf(predicate.id).toEqualTypeOf<
      kernel.KernelId<"predicate"> & "predicate.audit.incidentViewed"
    >();
    expectTypeOf(predicate.$infer.subject).toEqualTypeOf<typeof subject>();
    expectTypeOf(predicate.$infer.vars).toEqualTypeOf<typeof vars>();
    expectTypeOf(predicate.$infer.body).toEqualTypeOf<typeof body>();
    expectTypeOf(predicate.$infer.flavor.id).toEqualTypeOf<typeof customFlavor.id>();
    expectTypeOf(predicate.$infer.subjectKind.id).toEqualTypeOf<typeof customSubjectKind.id>();
  });

  test("surface builders preserve phase, ID witness, and result shape", () => {
    const surfaceId = kernel.defineSurfaceId({
      phase: "derivation",
      id: "surface.rule.invalidationDependencies",
    });
    const consumes = {
      edges: ["edge.kind.actionWritesField", "edge.kind.ruleReads"] as const,
    };
    const yields = {
      edges: ["edge.kind.invalidatesKey"] as const,
    };
    const resultShape = {
      emittedEdges: 0,
      skippedRules: [] as readonly string[],
    } as const;

    const surface = kernel.defineDerivationSurface
      .id(surfaceId)
      .consumes(consumes)
      .yields(yields)
      .resultShape(resultShape)
      .done();

    expectTypeOf(surface.phase).toEqualTypeOf<"derivation">();
    expectTypeOf(surface.id.value).toEqualTypeOf<
      kernel.KernelId<"surface.derivation"> & "surface.rule.invalidationDependencies"
    >();
    expectTypeOf(surface.$infer.consumes).toEqualTypeOf<typeof consumes>();
    expectTypeOf(surface.$infer.yields).toEqualTypeOf<typeof yields>();
    expectTypeOf(surface.$infer.resultShape).toEqualTypeOf<typeof resultShape>();

    const emitSurfaceId = kernel.defineSurfaceId({
      phase: "emit",
      id: "surface.docs.markdown",
    });
    kernel.defineEmitSurface({
      id: emitSurfaceId,
      consumes: { artifacts: ["docs.rule-explanation"] as const },
      yields: { files: ["rules.md"] as const },
      resultShape: { path: "rules.md" as const },
    });

    kernel.defineDerivationSurface({
      // @ts-expect-error surface phase must match the surface factory
      id: emitSurfaceId,
      consumes,
      yields,
      resultShape,
    });
  });
});
