/**
 * Type-level tests for generic mapping builders. These assertions verify that
 * field/source/target value types must agree at the call site rather than
 * waiting for `checkMappings` at lifecycle time.
 *
 * Run with `tsgo --noEmit`. The presence of `@ts-expect-error` is itself the
 * assertion: if the surrounding line stops being a type error, the directive
 * triggers TS2578 and the build fails.
 */
import { defineEntity } from "../src/entity/index.ts";
import {
  bidirectionalTransform,
  buildColumnSource,
  buildColumnTarget,
  defineColumn,
  defineStore,
  defineTable,
  buildExpressionSource,
  fieldMapping,
  mixedMapping,
  readMapping,
  reversibleMapping,
  writeMapping,
  type FieldMapping,
  type Mapping,
  type MappingSource,
  type MappingTarget,
  type ReversibleTransform,
} from "../src/storage/index.ts";
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

// --- buildColumnSource carries the column's value type --------------------------

const idSrcAsString: MappingSource<string> = buildColumnSource(idCol);
void idSrcAsString;

const ageSrcAsNumber: MappingSource<number> = buildColumnSource(ageCol);
void ageSrcAsNumber;

// @ts-expect-error — string source can't satisfy a number annotation
const idSrcMismatch: MappingSource<number> = buildColumnSource(idCol);
void idSrcMismatch;

// --- buildColumnTarget carries the column's value type --------------------------

const ageTgt: MappingTarget<number> = buildColumnTarget(ageCol);
void ageTgt;

// @ts-expect-error — number column can't be a string target
const ageTgtMismatch: MappingTarget<string> = buildColumnTarget(ageCol);
void ageTgtMismatch;

// --- buildExpressionSource binds T via semantic_type ----------------------------

const lenSrc: MappingSource<number> = buildExpressionSource({
  semantic_type: intType(),
  expression: "length(name)",
});
void lenSrc;

// --- readMapping: per-field type pairing -----------------------------------

const okRead: Mapping = readMapping(User, [
  { field: User.fields.id, source: buildColumnSource(idCol) },
  { field: User.fields.age, source: buildColumnSource(ageCol) },
]);
void okRead;

const badRead: Mapping = readMapping(User, [
  // @ts-expect-error — pairing User.fields.age (number) with a string source
  { field: User.fields.age, source: buildColumnSource(idCol) },
]);
void badRead;

// --- writeMapping: per-field target pairing --------------------------------

const okWrite: Mapping = writeMapping(User, [
  { field: User.fields.id, target: buildColumnTarget(idCol) },
  { field: User.fields.age, target: buildColumnTarget(ageCol) },
]);
void okWrite;

const badWrite: Mapping = writeMapping(User, [
  // @ts-expect-error — id (string) cannot be written to age (number) column
  { field: User.fields.id, target: buildColumnTarget(ageCol) },
]);
void badWrite;

// --- mixedMapping: source and target must both match field type ------------

const okMixed: Mapping = mixedMapping(User, [
  {
    field: User.fields.name,
    source: buildColumnSource(nameCol),
    target: buildColumnTarget(nameCol),
  },
]);
void okMixed;

const badMixed: Mapping = mixedMapping(User, [
  // @ts-expect-error — source/target value-type mismatch with field
  { field: User.fields.name, source: buildColumnSource(ageCol), target: buildColumnTarget(ageCol) },
]);
void badMixed;

// --- bidirectionalTransform binds T ----------------------------------------

const stringRoundTrip: ReversibleTransform<string> = bidirectionalTransform<string>({
  forward: "value",
  reverse: "value",
});

const badReversible: Mapping = reversibleMapping(User, [
  // @ts-expect-error — string transform attached to a number-typed reversible spec
  {
    field: User.fields.age,
    source: buildColumnSource(ageCol),
    target: buildColumnTarget(ageCol),
    transform: stringRoundTrip,
  },
]);
void badReversible;

// --- FieldMapping<T> carries through fieldMapping --------------------------

const idMapping: FieldMapping<string> = fieldMapping({
  field: User.fields.id,
  read_source: buildColumnSource(idCol),
});
void idMapping;
