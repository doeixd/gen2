/* @__NO_SIDE_EFFECTS__ */

import {
  defineStaticFunction,
  defineExprFunction,
  definePredicateFunction,
  defineQueryFunction,
  defineActionFunction,
  type StaticFunction,
  type ExprFunction,
  type PredicateFunction,
  type QueryFunction,
  type ActionFunction,
  type ActionExpr,
  type TypeInputValue,
} from "../function/index.ts";
import type { Entity } from "../entity/index.ts";
import type { Expr, Predicate } from "../expression/index.ts";
import type { QueryExpression } from "../query/index.ts";
import { baseSemantic } from "../types/semantic.ts";
import type { SemanticType } from "../types/index.ts";

type WitnessInput = SemanticType | Entity;

export const Fn = {
  static: <const N extends string, const O extends WitnessInput>(input: {
    name: N;
    output: O;
    value: TypeInputValue<O>;
  }): StaticFunction<unknown, TypeInputValue<O>> =>
    defineStaticFunction({
      name: input.name,
      input_type: baseSemantic({
        name: "void",
        kind: "json",
        ts_type_name: "void",
        storage_repr: { name: "void", kind: { kind: "document" }, fixed: false, metadata: [] },
      }) as SemanticType<unknown>,
      output_type: input.output as SemanticType<TypeInputValue<O>>,
      body: {
        kind: "static",
        output_type: input.output as SemanticType<TypeInputValue<O>>,
        requirements: [],
        effects: [],
      },
    }),

  expr: <
    const N extends string,
    const I extends WitnessInput,
    const O extends WitnessInput,
  >(input: {
    name: N;
    input: I;
    output: O;
    body: Expr;
  }): ExprFunction<TypeInputValue<I>, TypeInputValue<O>> =>
    defineExprFunction({
      name: input.name,
      input_type: input.input as SemanticType<TypeInputValue<I>>,
      output_type: input.output as SemanticType<TypeInputValue<O>>,
      body: input.body,
    }),

  predicate: <const N extends string, const I extends WitnessInput>(input: {
    name: N;
    input: I;
    body: Predicate;
  }): PredicateFunction<TypeInputValue<I>> =>
    definePredicateFunction({
      name: input.name,
      input_type: input.input as SemanticType<TypeInputValue<I>>,
      body: input.body,
    }),

  query: <
    const N extends string,
    const I extends WitnessInput,
    const O extends WitnessInput,
  >(input: {
    name: N;
    input: I;
    output: O;
    body: QueryExpression;
  }): QueryFunction<TypeInputValue<I>, TypeInputValue<O>> =>
    defineQueryFunction({
      name: input.name,
      input_type: input.input as SemanticType<TypeInputValue<I>>,
      returns: input.output as SemanticType<TypeInputValue<O>>,
      body: input.body,
    }),

  action: <
    const N extends string,
    const I extends WitnessInput,
    const O extends WitnessInput,
  >(input: {
    name: N;
    input: I;
    output: O;
    body: ActionExpr;
  }): ActionFunction<TypeInputValue<I>, TypeInputValue<O>> =>
    defineActionFunction({
      name: input.name,
      input_type: input.input as SemanticType<TypeInputValue<I>>,
      returns: input.output as SemanticType<TypeInputValue<O>>,
      body: input.body,
    }),
};
