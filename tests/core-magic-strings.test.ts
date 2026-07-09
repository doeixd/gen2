import { expect, test } from "vite-plus/test";
import { DIAGNOSTIC_CODES } from "../src/kernel/index.ts";
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

test("stable ID diagnostics respect gen.config identity strictness", () => {
  const off = createGen({ identity: { stableIds: "off" } });
  off.gen.entity("Project", { id: off.gen.types.uuid() });
  expect(core.checkMagicStrings(off.ctx).some((d) => d.code === "ref:missing-stable-id")).toBe(
    false,
  );

  const required = createGen({ identity: { stableIds: "required" } });
  required.gen.entity("Project", { id: required.gen.types.uuid() });
  const missing = core
    .checkMagicStrings(required.ctx)
    .find((d) => d.code === "ref:missing-stable-id");
  expect(missing?.severity).toBe("error");

  required.gen.config({ identity: { stableIds: "warn" } });
  const afterConfig = core
    .checkMagicStrings(required.ctx)
    .find((d) => d.code === "ref:missing-stable-id");
  expect(afterConfig?.severity).toBe("warning");
});

test("stable ID diagnostics include the four standard identity codes", () => {
  expect(DIAGNOSTIC_CODES.REF_MISSING_STABLE_ID).toBe("ref:missing-stable-id");
  expect(DIAGNOSTIC_CODES.REF_RENAME_WITHOUT_STABLE_ID).toBe("ref:rename-without-stable-id");
  expect(DIAGNOSTIC_CODES.REF_DUPLICATE_STABLE_ID).toBe("ref:duplicate-stable-id");
  expect(DIAGNOSTIC_CODES.REF_UNSTABLE_NAME_DERIVED_ID).toBe("ref:unstable-name-derived-id");
});

test("checkMagicStrings reports duplicate stable IDs", () => {
  const { ctx, gen } = createGen();
  gen.entity("Project", { id: gen.types.uuid() }, { id: core.entityId("shared") });
  gen.entity("Task", { id: gen.types.uuid() }, { id: core.entityId("shared") });

  const duplicate = core.checkMagicStrings(ctx).find((d) => d.code === "ref:duplicate-stable-id");

  expect(duplicate).toBeDefined();
  expect(duplicate?.severity).toBe("warning");
  expect(duplicate?.message).toContain("shared");
});

test("checkMagicStrings is silent when entities have stable IDs", () => {
  const { ctx, gen } = createGen();
  gen.entity(
    "Project",
    {
      id: { type: gen.types.uuid(), id: core.fieldId({ entity: "Project", name: "id" }) },
    },
    { id: core.entityId({ name: "Project" }) },
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
    { id: core.entityId({ name: "Project" }) },
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
