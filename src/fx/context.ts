/* @__NO_SIDE_EFFECTS__ */

import { createGen, type CreateGenResult, type GenConfig } from "../gen/index.ts";
import type { Entity } from "../entity/index.ts";
import type { Relation } from "../relation/index.ts";
import type { Store, Table, Mapping } from "../storage/index.ts";
import type {
  StaticFunction,
  ExprFunction,
  PredicateFunction,
  QueryFunction,
  ActionFunction,
} from "../function/index.ts";
import type { Crud } from "../crud/index.ts";
import type { Plugin } from "../core/index.ts";
import type { GenContext as GenContextCore } from "../core/context.ts";
import { attachGraphStep } from "../kernel/bridge.ts";
import type { AnyGraphStep } from "../kernel/index.ts";

type AnyFunction =
  | StaticFunction
  | ExprFunction
  | PredicateFunction
  | QueryFunction
  | ActionFunction;

interface GenContextBuilderState {
  readonly entities: Entity[];
  readonly relations: Relation[];
  readonly stores: Store[];
  readonly tables: Table[];
  readonly mappings: Mapping[];
  readonly functions: AnyFunction[];
  readonly cruds: Crud[];
  readonly plugins: Plugin[];
}

interface GenContextBuilder<TEntities extends Record<string, Entity> = Record<string, never>> {
  entity<E extends Entity>(entity: E): GenContextBuilder<TEntities & Record<E["name"], E>>;

  relation(relation: Relation): GenContextBuilder<TEntities>;

  store(store: Store): GenContextBuilder<TEntities>;

  table(table: Table): GenContextBuilder<TEntities>;

  mapping(mapping: Mapping): GenContextBuilder<TEntities>;

  fn(fn: AnyFunction): GenContextBuilder<TEntities>;

  crud(crud: Crud): GenContextBuilder<TEntities>;

  plugin(plugin: Plugin): GenContextBuilder<TEntities>;

  build(): CreateGenResult<GenConfig, any>;
}

const registerFunction = (ctx: GenContextCore, fn: AnyFunction): void => {
  const body = (fn as unknown as { body?: { kind?: unknown } }).body;
  if (!body) return;
  const kind = body.kind;
  if (kind == null || typeof kind === "string") {
    ctx.static_functions.push(fn as unknown as StaticFunction);
    return;
  }
  const tag = (kind as { kind?: string })?.kind;
  if (!tag) {
    ctx.static_functions.push(fn as unknown as StaticFunction);
    return;
  }
  switch (tag) {
    case "literal":
    case "field_ref":
    case "op_call":
    case "param_ref":
    case "conditional":
    case "let_binding":
    case "collection_expr":
    case "query_expr":
      ctx.expr_functions.push(fn as unknown as ExprFunction);
      break;
    case "comparison":
    case "membership":
    case "boolean_logic":
    case "null_check":
    case "exists":
    case "forall":
      ctx.predicate_functions.push(fn as unknown as PredicateFunction);
      break;
    case "select":
    case "from":
    case "where":
    case "order_by":
    case "limit":
    case "offset":
    case "join":
    case "aggregate":
    case "subquery":
    case "insert":
    case "update":
    case "delete":
    case "invalidate":
    case "custom":
    case "sequence": {
      const fragment = (fn as unknown as { readonly fragment: AnyGraphStep }).fragment;
      if (fragment) attachGraphStep(ctx.graph, fragment);
      break;
    }
    default:
      ctx.static_functions.push(fn as unknown as StaticFunction);
      break;
  }
};

const createBuilder = (state: GenContextBuilderState): GenContextBuilder<any> => ({
  entity(entity: Entity) {
    return createBuilder({
      ...state,
      entities: [...state.entities, entity],
    });
  },

  relation(relation: Relation) {
    return createBuilder({
      ...state,
      relations: [...state.relations, relation],
    });
  },

  store(store: Store) {
    return createBuilder({
      ...state,
      stores: [...state.stores, store],
    });
  },

  table(table: Table) {
    return createBuilder({
      ...state,
      tables: [...state.tables, table],
    });
  },

  mapping(mapping: Mapping) {
    return createBuilder({
      ...state,
      mappings: [...state.mappings, mapping],
    });
  },

  fn(fn: AnyFunction) {
    return createBuilder({
      ...state,
      functions: [...state.functions, fn],
    });
  },

  crud(crud: Crud) {
    return createBuilder({
      ...state,
      cruds: [...state.cruds, crud],
    });
  },

  plugin(plugin: Plugin) {
    return createBuilder({
      ...state,
      plugins: [...state.plugins, plugin],
    });
  },

  build(): CreateGenResult<GenConfig, any> {
    const result = createGen({ plugins: state.plugins });
    const { gen, ctx } = result;
    for (const entity of state.entities) {
      const options: Record<string, unknown> = {};
      if (entity.id) options.id = entity.id;
      if (entity.store_name) options.store_name = entity.store_name;
      if (entity.metadata) options.metadata = entity.metadata;
      gen.entity(
        entity.name,
        Object.fromEntries(entity.fieldList.map((f) => [f.name, f.semantic_type])),
        options,
      );
    }
    for (const rel of state.relations) {
      ctx.relations.push(rel);
    }
    for (const store of state.stores) {
      ctx.stores.push(store);
    }
    for (const table of state.tables) {
      ctx.tables.push(table);
    }
    for (const mapping of state.mappings) {
      ctx.mappings.push(mapping);
    }
    for (const fn of state.functions) {
      registerFunction(ctx, fn);
    }
    for (const crud of state.cruds) {
      ctx.cruds.push(crud);
    }
    return result;
  },
});

export const GenContext = {
  make: (): GenContextBuilder =>
    createBuilder({
      entities: [],
      relations: [],
      stores: [],
      tables: [],
      mappings: [],
      functions: [],
      cruds: [],
      plugins: [],
    }),
};
