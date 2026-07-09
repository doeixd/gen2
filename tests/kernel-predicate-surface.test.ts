import { expect, test } from "vite-plus/test";
import { kernel } from "../src/index.ts";

test("definePredicate preserves flavor, subject kind, body, vars, and assurance witnesses", () => {
  const subject = { name: "Incident" } as const;
  const body = { op: "eq", left: "incident.org", right: "session.org" } as const;
  const predicate = kernel.definePredicate({
    id: "predicate.rule.canViewIncident",
    label: "Can view incident",
    subjectKind: kernel.subjectKind.ENTITY,
    subject,
    vars: { sessionOrg: "uuid" } as const,
    body,
    assurance: kernel.assuranceKind.ASSERTED,
    flavor: kernel.predicateFlavor.RULE,
  });

  expect(predicate.kind).toBe("predicate");
  expect(predicate.id).toBe("predicate.rule.canViewIncident");
  expect(predicate.subjectKind.id).toBe("subject.kind.entity");
  expect(predicate.flavor.id).toBe("predicate.flavor.rule");
  expect(predicate.assurance.id).toBe("assurance.kind.asserted");
  expect(predicate.body).toBe(body);
  expect(predicate.$infer.subject).toBe(subject);
});

test("assuranceAtLeast walks the open stronger-than graph", () => {
  const solverPlusReview = kernel.defineAssuranceKind({
    id: "assurance.kind.solverPlusReview",
    label: "Solver proof plus review",
    strongerThan: [kernel.assuranceKind.PROVED_BY_SOLVER],
  });

  expect(kernel.assuranceAtLeast(kernel.assuranceKind.TESTED, kernel.assuranceKind.ASSERTED)).toBe(
    true,
  );
  expect(kernel.assuranceAtLeast(solverPlusReview, kernel.assuranceKind.CHECKED_BY_TARGET)).toBe(
    true,
  );
  expect(kernel.assuranceAtLeast(kernel.assuranceKind.ASSERTED, kernel.assuranceKind.TESTED)).toBe(
    false,
  );
});

test("surface builders support object and curried forms", () => {
  const sqlPredicateSurfaceId = kernel.defineSurfaceId({
    phase: "lowering",
    id: "surface.postgres.sqlPredicate",
    label: "Postgres SQL predicate",
  });
  const consumes = {
    subjects: [kernel.subjectKind.ENTITY],
    requires: ["trait.expr.sqlLowerable"],
  } as const;
  const yields = {
    artifactKind: "pg.rls-policy",
  } as const;
  const resultShape = {
    sql: "boolean-sql",
    params: [] as readonly string[],
  } as const;

  const curried = kernel.defineLoweringSurface
    .id(sqlPredicateSurfaceId)
    .consumes(consumes)
    .yields(yields)
    .resultShape(resultShape)
    .done({ metadata: { title: "SQL predicate surface" } });

  const objectForm = kernel.defineLoweringSurface({
    id: sqlPredicateSurfaceId,
    consumes,
    yields,
    resultShape,
  });

  expect(curried.kind).toBe("surface");
  expect(curried.phase).toBe("lowering");
  expect(curried.id.value).toBe("surface.postgres.sqlPredicate");
  expect(curried.consumes).toBe(consumes);
  expect(curried.yields).toBe(yields);
  expect(curried.resultShape).toBe(resultShape);
  expect(objectForm.$infer.resultShape).toBe(resultShape);
});
