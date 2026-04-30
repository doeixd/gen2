import { expect, test } from "vite-plus/test";
import { core, createGen } from "../src/index.ts";

test("checkMagicStrings warns when an entity is authored without a stable ID", () => {
  const { ctx, gen } = createGen();
  gen.entity("Project", { id: gen.types.uuid() });

  const findings = core.checkMagicStrings(ctx);
  const codes = findings.map((d) => d.code);

  expect(codes).toContain("ref:missing-stable-id");
  const entityWarning = findings.find(
    (d) => d.code === "ref:missing-stable-id" && d.message.includes("Project"),
  );
  expect(entityWarning?.severity).toBe("warning");
  expect(entityWarning?.suggestion).toMatch(/core\.entityId/);
});

test("checkMagicStrings is silent when entities have stable IDs", () => {
  const { ctx, gen } = createGen();
  gen.entity(
    "Project",
    {
      id: { type: gen.types.uuid(), id: core.fieldId("field.project.id") },
    },
    { id: core.entityId("entity.project") },
  );

  const findings = core.checkMagicStrings(ctx);
  const projectWarnings = findings.filter((d) => d.message.includes("Project"));
  expect(projectWarnings).toHaveLength(0);
});

test("checkMagicStrings errors when a field has renamedFrom but no stable ID", () => {
  const { ctx, gen } = createGen();
  gen.entity(
    "Project",
    {
      id: gen.types.uuid(),
      title: { type: gen.types.string(), renamedFrom: ["name"] },
    },
    { id: core.entityId("entity.project") },
  );

  const findings = core.checkMagicStrings(ctx);
  const renameError = findings.find((d) => d.code === "ref:rename-without-stable-id");

  expect(renameError).toBeDefined();
  expect(renameError?.severity).toBe("error");
  expect(renameError?.message).toContain("title");
  expect(renameError?.message).toContain("name");
});

test("checkMagicStrings warns when a key family has no stable ID", () => {
  const { ctx, gen } = createGen();
  gen.key.family<{ readonly id: string }>("ProjectDetail");

  const findings = core.checkMagicStrings(ctx);
  const keyWarning = findings.find(
    (d) => d.code === "ref:missing-stable-id" && d.message.includes("ProjectDetail"),
  );

  expect(keyWarning).toBeDefined();
  expect(keyWarning?.suggestion).toMatch(/core\.keyFamilyId/);
});

test("classifyStringDomain bins strings by intended purpose", () => {
  expect(core.classifyStringDomain({ value: "x", purpose: "stable_id" })).toBe("stable_id");
  expect(core.classifyStringDomain({ value: "x", purpose: "display_name" })).toBe("display_name");
  expect(core.classifyStringDomain({ value: "x", purpose: "table_name" })).toBe("external_name");
  expect(core.classifyStringDomain({ value: "x", purpose: "url_template" })).toBe("external_name");
  expect(core.classifyStringDomain({ value: "x", purpose: "operation_id" })).toBe(
    "target_artifact",
  );
  expect(core.classifyStringDomain({ value: "x", purpose: "internal_ref" })).toBe("internal_ref");
});
