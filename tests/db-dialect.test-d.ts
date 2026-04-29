/**
 * Type-level tests for dialect-specific DB surfaces. The dialect declared in
 * `db({ stores: { ... } })` should determine which sub-surface is populated
 * and reject usage of the wrong dialect's helpers at the type level.
 */
import { createGen, db } from "../src/index.ts";
import type { Column } from "../src/storage/index.ts";

const setup = createGen({
  plugins: [
    db({
      stores: {
        main: { dialect: "postgres" },
        docs: { dialect: "mongo" },
        cache: { dialect: "redis" },
      },
      default: "main",
    }),
  ],
});
const gen = setup.gen as unknown as {
  db: {
    main: {
      relational: {
        table: <C extends Record<string, { semantic_type: { _ts?: unknown } }>>(
          name: string,
          columns: C,
        ) => {
          cols: {
            readonly [K in keyof C]: C[K] extends { semantic_type: { _ts?: infer T } }
              ? Column<T>
              : Column;
          };
        };
      };
      document: never;
      kv: never;
    };
    docs: {
      document: { collection: (name: string, fields: Record<string, unknown>) => unknown };
      relational: never;
      kv: never;
    };
    cache: {
      kv: { keyspace: (name: string, input: { key_type: string; value_type: string }) => unknown };
      relational: never;
      document: never;
    };
  };
  types: {
    uuid: () => { _ts?: string };
    email: () => { _ts?: string };
    string: () => { _ts?: string };
  };
};

const users = gen.db.main.relational.table("users", {
  id: { physical_type: "uuid", semantic_type: gen.types.uuid(), nullable: false },
});
// users.cols.id should be Column<string>
const _idCol: Column<string> = users.cols.id;
void _idCol;

// @ts-expect-error — main is postgres, so it does not expose a document surface
gen.db.main.document.collection("x", {});

// @ts-expect-error — main is postgres, so it does not expose a kv surface
gen.db.main.kv.keyspace("x", { key_type: "s", value_type: "s" });

// @ts-expect-error — docs is mongo, so it does not expose a relational surface
gen.db.docs.relational.table("x", {});

// @ts-expect-error — docs is mongo, so it does not expose a kv surface
gen.db.docs.kv.keyspace("x", { key_type: "s", value_type: "s" });

// @ts-expect-error — cache is redis, so it does not expose a relational surface
gen.db.cache.relational.table("x", {});

// @ts-expect-error — cache is redis, so it does not expose a document surface
gen.db.cache.document.collection("x", {});
