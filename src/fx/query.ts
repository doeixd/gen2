/* @__NO_SIDE_EFFECTS__ */

import { fromEntity, type QueryBuilder, type QueryExpression } from "../query/index.ts";
import type { Entity, InferEntity } from "../entity/index.ts";
import type { SemanticType } from "../types/index.ts";

export const Query = {
  from: <const E extends Entity, Result = InferEntity<E>>(
    entity: E,
    result_type?: SemanticType<Result>,
  ): QueryBuilder<E, Result> => fromEntity(entity, result_type),
};

export type { QueryBuilder, QueryExpression };
