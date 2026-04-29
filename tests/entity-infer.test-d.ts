/**
 * Type-level tests for InferEntity and InferField.
 */
import { defineEntity, type InferEntity, type InferField } from "../src/entity/index.ts";
import { int as intType, string as stringType, uuid as uuidType } from "../src/types/index.ts";

const User = defineEntity("User", {
  id: uuidType(),
  name: stringType(),
  age: intType(),
});

type UserShape = InferEntity<typeof User>;

const ok: UserShape = { id: "u_1", name: "alice", age: 30 };
void ok;

// @ts-expect-error — id must be a string
const badId: UserShape = { id: 1, name: "alice", age: 30 };
void badId;

// @ts-expect-error — age must be a number
const badAge: UserShape = { id: "u_1", name: "alice", age: "30" };
void badAge;

// @ts-expect-error — missing required field
const missing: UserShape = { id: "u_1", name: "alice" };
void missing;

// InferField on a single field
type IdTs = InferField<typeof User.fields.id>;
const idValue: IdTs = "u_1";
void idValue;

// @ts-expect-error — InferField<id> is string, not number
const badIdValue: IdTs = 1;
void badIdValue;
