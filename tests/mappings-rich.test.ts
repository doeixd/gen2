/**
 * Runtime tests for rich mapping builders: source/target/transform helpers,
 * read/write/mixed/reversible mappings, and dependency tracking.
 */
import { expect, test } from "vite-plus/test";
import {
  buildAggregateSource,
  bidirectionalTransform,
  checkReversibleMappings,
  buildColumnSource,
  buildColumnTarget,
  buildComputedTarget,
  defineColumn,
  defineStore,
  defineTable,
  buildExpressionSource,
  buildExpressionTarget,
  mappingColumnDependencies,
  mappingFieldDependencies,
  mixedMapping,
  oneWayTransform,
  buildQueryBackedSource,
  readMapping,
  reversibleMapping,
  buildServiceCallSource,
  buildServiceCallTarget,
  writeMapping,
} from "../src/storage/index.ts";
import { defineEntity } from "../src/entity/index.ts";
import { int as intType, string as stringType, uuid as uuidType } from "../src/types/index.ts";

const User = defineEntity("User", {
  id: uuidType(),
  name: stringType(),
  age: intType(),
});

const store = defineStore({ name: "main", dialect: "postgres" });
const usersTable = defineTable(store, "users", []);
const idCol = defineColumn(usersTable, {
  name: "id",
  physical_type: "uuid",
  semantic_type: uuidType(),
  nullable: false,
});
const nameCol = defineColumn(usersTable, {
  name: "name",
  physical_type: "text",
  semantic_type: stringType(),
  nullable: false,
});
const ageCol = defineColumn(usersTable, {
  name: "age",
  physical_type: "integer",
  semantic_type: intType(),
  nullable: false,
});

test("readMapping marks every entry read_only and skips write targets", () => {
  const m = readMapping(User, [
    { field: User.fields.id, source: buildColumnSource(idCol) },
    { field: User.fields.name, source: buildColumnSource(nameCol) },
  ]);
  expect(m.field_mappings.length).toBe(2);
  expect(m.field_mappings.every((fm) => fm.read_only === true)).toBe(true);
  expect(m.field_mappings.every((fm) => fm.write_target === undefined)).toBe(true);
  expect(m.field_mappings.every((fm) => fm.read_source !== undefined)).toBe(true);
});

test("writeMapping has no read sources", () => {
  const m = writeMapping(User, [
    { field: User.fields.id, target: buildColumnTarget(idCol) },
    { field: User.fields.age, target: buildColumnTarget(ageCol) },
  ]);
  expect(m.field_mappings.every((fm) => fm.read_source === undefined)).toBe(true);
  expect(m.field_mappings.every((fm) => fm.write_target !== undefined)).toBe(true);
});

test("mixedMapping carries source, target, and transform", () => {
  const upper = oneWayTransform<string>("upper(name)");
  const m = mixedMapping(User, [
    {
      field: User.fields.name,
      source: buildColumnSource(nameCol),
      target: buildColumnTarget(nameCol),
      transform: upper,
    },
  ]);
  expect(m.field_mappings[0]?.transform).toBe(upper);
});

test("buildExpressionSource carries SQL expression and dependencies", () => {
  const src = buildExpressionSource({
    semantic_type: intType(),
    expression: "length(name)",
    dependencies: [nameCol],
  });
  expect(src.kind).toBe("expression");
  expect(src.expression).toBe("length(name)");
  expect(src.dependencies?.[0]).toBe(nameCol);
});

test("buildQueryBackedSource marks a query-backed field source", () => {
  const src = buildQueryBackedSource({
    semantic_type: intType(),
    query: "SELECT count(*) FROM posts WHERE author_id = users.id",
    dependencies: [idCol],
  });
  expect(src.kind).toBe("query");
  expect(src.query).toContain("count(*)");
});

test("buildAggregateSource records function and group_by", () => {
  const src = buildAggregateSource({
    semantic_type: intType(),
    fn: "sum",
    expression: "amount",
    group_by: ["account_id"],
  });
  expect(src.kind).toBe("aggregate");
  expect(src.aggregate?.fn).toBe("sum");
  expect(src.aggregate?.group_by).toEqual(["account_id"]);
});

test("buildServiceCallSource records service descriptor", () => {
  const src = buildServiceCallSource({
    semantic_type: stringType(),
    service: "stripe",
    method: "customer.lookup",
    args: ["external_id"],
  });
  expect(src.kind).toBe("service");
  expect(src.service?.name).toBe("stripe");
  expect(src.service?.method).toBe("customer.lookup");
});

test("buildComputedTarget records derived expression", () => {
  const t = buildComputedTarget({
    derived_expression: "first_name || ' ' || last_name",
  });
  expect(t.kind).toBe("computed");
  expect(t.derived_expression).toContain("||");
});

test("buildExpressionTarget and buildServiceCallTarget construct correctly", () => {
  const et = buildExpressionTarget({ expression: "lower(name)" });
  expect(et.kind).toBe("expression");
  const st = buildServiceCallTarget({ service: "stripe", method: "customer.update" });
  expect(st.kind).toBe("service");
});

test("reversibleMapping with bidirectional transform passes the check", () => {
  const dateRoundTrip = bidirectionalTransform<string>({
    forward: "to_iso(value)",
    reverse: "from_iso(value)",
  });
  const m = reversibleMapping(User, [
    {
      field: User.fields.name,
      source: buildColumnSource(nameCol),
      target: buildColumnTarget(nameCol),
      transform: dateRoundTrip,
    },
  ]);
  const diagnostics = checkReversibleMappings([m]);
  expect(diagnostics).toEqual([]);
});

test("checkReversibleMappings flags missing reverse on bidirectional transforms", () => {
  // Force a bad transform via type assertion to bypass static check.
  const bogus = {
    forward: "value",
    bidirectional: true,
  } as ReturnType<typeof bidirectionalTransform<string>>;
  const m = mixedMapping(User, [
    {
      field: User.fields.name,
      source: buildColumnSource(nameCol),
      target: buildColumnTarget(nameCol),
      transform: bogus,
    },
  ]);
  const diagnostics = checkReversibleMappings([m]);
  expect(diagnostics.some((d) => d.code === "mapping:bidirectional-missing-reverse")).toBe(true);
});

test("mappingColumnDependencies aggregates source and target columns", () => {
  const m = mixedMapping(User, [
    {
      field: User.fields.name,
      source: buildExpressionSource({
        semantic_type: stringType(),
        expression: "upper(name)",
        dependencies: [nameCol],
      }),
      target: buildColumnTarget(nameCol),
    },
  ]);
  const cols = mappingColumnDependencies(m);
  expect(cols).toContain(nameCol);
});

test("mappingFieldDependencies surfaces field-level dependencies", () => {
  const m = mixedMapping(User, [
    {
      field: User.fields.name,
      source: buildExpressionSource({
        semantic_type: stringType(),
        expression: "first || ' ' || last",
        field_dependencies: [User.fields.id],
      }),
    },
  ]);
  const fields = mappingFieldDependencies(m);
  expect(fields).toContain(User.fields.id);
});
