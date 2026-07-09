/* @__NO_SIDE_EFFECTS__ */

import { deriveCrud, type Crud as CrudType, type DeriveCrudOptions } from "../crud/index.ts";
import type { Entity } from "../entity/index.ts";

export const Crud = {
  derive: <E extends Entity>(entity: E, options?: DeriveCrudOptions<E>): CrudType<E> =>
    deriveCrud(entity, options) as CrudType<E>,
};
