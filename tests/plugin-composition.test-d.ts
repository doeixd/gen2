/**
 * Type-level tests for typed plugin composition through createGen. The plugins
 * passed to `createGen({ plugins: [...] })` should contribute their helper
 * shapes to the returned `gen` namespace at the type level — without casts.
 */
import {
  createGen,
  db,
  defineDebugAdapter,
  defineRelationalAdapter,
  defineStandardSchemaAdapter,
} from "../src/index.ts";
import type { Column } from "../src/storage/index.ts";

// --- db plugin contributes typed `gen.db.<store>` ---------------------------

const setup = createGen({
  plugins: [
    db({
      stores: {
        main: { dialect: "postgres" },
        cache: { dialect: "redis" },
      },
      default: "main",
    }),
  ],
});

// gen.db is statically known because db() returns Plugin<{ db: DbNamespace<...> }>
const main = setup.gen.db.main;
const cache = setup.gen.db.cache;
void main;
void cache;

// Default store aliases land on gen.db itself (since `default: "main"`)
const defaultStore = setup.gen.db.store;
void defaultStore;

// --- Dialect-specific surfaces flow through plugin composition --------------

const users = setup.gen.db.main.relational.table("users", {
  id: { physical_type: "uuid", semantic_type: setup.gen.types.uuid(), nullable: false },
  email: { physical_type: "text", semantic_type: setup.gen.types.email(), nullable: false },
});

// users.cols.id is statically Column<string> — no cast required
const _idCol: Column<string> = users.cols.id;
void _idCol;

// @ts-expect-error — main is postgres, so document surface is `never`
setup.gen.db.main.document.collection("x", {});

// @ts-expect-error — cache is redis, so relational surface is `never`
setup.gen.db.cache.relational.table("x", {});

// --- A bare createGen has no plugin namespaces ------------------------------

const bare = createGen();

// @ts-expect-error — no db plugin installed, so gen.db does not exist
bare.gen.db;

// --- Adapters compose into gen.adapters.<name> ------------------------------

const adapterSetup = createGen({
  plugins: [defineDebugAdapter(), defineStandardSchemaAdapter(), defineRelationalAdapter()],
});

// All three adapter namespaces are typed via plugin composition — no casts.
adapterSetup.gen.adapters.debug.snapshot();
adapterSetup.gen.adapters.standardSchema.fromAllEntities();
const someStore = adapterSetup.gen.store({ name: "x", dialect: "postgres" });
adapterSetup.gen.adapters.relational.fromStore(someStore);

// @ts-expect-error — debug adapter has no `fromEntity`
adapterSetup.gen.adapters.debug.fromEntity(someStore);

// @ts-expect-error — relational adapter has no `snapshot`
adapterSetup.gen.adapters.relational.snapshot();

// A subset of adapters narrows the namespace correctly
const onlyDebug = createGen({ plugins: [defineDebugAdapter()] });
onlyDebug.gen.adapters.debug.snapshot();

// @ts-expect-error — relational adapter not installed
onlyDebug.gen.adapters.relational;

// @ts-expect-error — standard-schema adapter not installed
onlyDebug.gen.adapters.standardSchema;
