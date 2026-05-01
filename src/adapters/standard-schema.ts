/* @__NO_SIDE_EFFECTS__ */
/**
 * Standard Schema adapter — generates per-entity validators that conform to the
 * Standard Schema spec (https://standardschema.dev). The output is vendor-neutral
 * code with no library dependency: any consumer that accepts a `StandardSchemaV1`
 * (Zod, Valibot, ArkType interop layers, tRPC, etc.) can use it directly.
 *
 * Usage:
 * ```ts
 * import { createGen, lifecycle } from "gen2";
 * import { defineStandardSchemaAdapter } from "gen2/adapters/standard-schema";
 *
 * const { ctx, gen } = createGen({ plugins: [defineStandardSchemaAdapter()] });
 * const User = gen.entity("User", { id: gen.types.uuid(), email: gen.types.email() });
 * gen.adapters.standardSchema.fromEntity(User);
 * const result = lifecycle.generate(ctx);
 * // result.artifacts[0].path === "schemas/user.ts"
 * ```
 */

import {
  acceptTargetInput,
  definePlugin,
  type Helper,
  makeArtifact,
  makeTargetInput,
  type Plugin,
  type GenContext,
  type Artifact,
  type TargetInputRecord,
  type Target,
} from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";

const TARGET_NAME = "standard-schema:entity";
const INPUT_KIND = "entity";

export interface StandardSchemaAdapterOptions {
  /** Output directory prefix. Defaults to `"schemas"`. */
  readonly outDir?: string;
  /** Vendor string emitted in the generated `~standard.vendor` field. */
  readonly vendor?: string;
}

export interface StandardSchemaAdapterNamespace {
  /** Schedule a single entity for Standard Schema generation. */
  readonly fromEntity: (entity: Entity) => void;
  /** Schedule every entity registered in the project for generation. */
  readonly fromAllEntities: () => void;
}

const tsTypeOf = (field: Field): string => {
  const base = field.semantic_type.ts_type_name || "unknown";
  return field.nullable ? `${base} | null` : base;
};

const tsKey = (field: Field): string => (field.optional ? `${field.name}?` : field.name);

const validatorFor = (field: Field): string => {
  const kind = field.semantic_type.kind;
  const v = "v[" + JSON.stringify(field.name) + "]";
  const path = JSON.stringify(field.name);
  const issues: string[] = [];
  if (field.nullable) {
    issues.push(`if (${v} == null) {} else `);
  } else if (!field.optional) {
    issues.push(
      `if (${v} === undefined || ${v} === null) issues.push({ message: "Field ${field.name} is required", path: [${path}] }); else `,
    );
  }
  let check: string;
  switch (kind) {
    case "string":
    case "uuid":
    case "email":
    case "url":
    case "phone":
    case "enum":
      check = `typeof ${v} !== "string"`;
      break;
    case "numeric":
      check =
        field.semantic_type.ts_type_name === "bigint"
          ? `typeof ${v} !== "bigint"`
          : `typeof ${v} !== "number"`;
      break;
    case "boolean":
      check = `typeof ${v} !== "boolean"`;
      break;
    case "datetime":
    case "date":
    case "timestamp":
      check = `!(${v} instanceof Date) && typeof ${v} !== "string"`;
      break;
    case "bytes":
      check = `!(${v} instanceof Uint8Array)`;
      break;
    case "array":
      check = `!Array.isArray(${v})`;
      break;
    case "struct":
    case "tagged":
    case "json":
    case "map":
    default:
      check = `typeof ${v} !== "object" || ${v} === null`;
      break;
  }
  return (
    issues.join("") +
    `if (${check}) issues.push({ message: "Field ${field.name} has wrong type for ${kind}", path: [${path}] });`
  );
};

const renderEntity = (entity: Entity, vendor: string): string => {
  const interfaceLines = entity.fieldList.map((f) => `  readonly ${tsKey(f)}: ${tsTypeOf(f)};`);
  const validators = entity.fieldList.map(validatorFor).map((line) => `      ${line}`);
  return `import type { StandardSchemaV1 } from "@standard-schema/spec";

export interface ${entity.name} {
${interfaceLines.join("\n")}
}

export const ${entity.name}Schema: StandardSchemaV1<unknown, ${entity.name}> = {
  "~standard": {
    version: 1,
    vendor: ${JSON.stringify(vendor)},
    types: undefined as unknown as { input: unknown; output: ${entity.name} },
    validate(value) {
      const issues: { message: string; path?: ReadonlyArray<PropertyKey> }[] = [];
      if (typeof value !== "object" || value === null) {
        return { issues: [{ message: "Expected object" }] };
      }
      const v = value as Record<string, unknown>;
${validators.join("\n")}
      if (issues.length > 0) return { issues };
      return { value: v as unknown as ${entity.name} };
    },
  },
};
`;
};

const fileNameFor = (entity: Entity): string =>
  entity.name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[A-Z]+/g, (m) => m.toLowerCase())
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const findTarget = (ctx: GenContext): Target | undefined =>
  ctx.targets.find((t) => t.name === TARGET_NAME);

const inputAlreadyAttached = (target: Target, entity: Entity): boolean =>
  target.inputs.some(
    (i) => i.kind === INPUT_KIND && (i.value as { entity?: Entity })?.entity === entity,
  );

export const defineStandardSchemaAdapter = (
  options: StandardSchemaAdapterOptions = {},
): Plugin<{ adapters: { standardSchema: StandardSchemaAdapterNamespace } }> => {
  const outDir = (options.outDir ?? "schemas").replace(/\/+$/, "");
  const vendor = options.vendor ?? "gen2";

  const standardSchemaHelper: Helper = {
    name: "standardSchema",
    namespace: "adapters",
    materialize: ({ ctx }): StandardSchemaAdapterNamespace => {
      const attach = (entity: Entity): void => {
        const c = ctx as GenContext;
        const target = findTarget(c);
        if (!target || inputAlreadyAttached(target, entity)) return;
        acceptTargetInput(
          target,
          makeTargetInput({ name: entity.name, kind: INPUT_KIND, value: { entity } }),
        );
      };
      return {
        fromEntity: attach,
        fromAllEntities: () => {
          for (const entity of (ctx as GenContext).entities) attach(entity);
        },
      };
    },
  };

  return definePlugin({
    id: "gen/adapter-standard-schema",
    namespace: "adapter-standard-schema",
    setup: () => ({
      helpers: [standardSchemaHelper],
      targets: [
        {
          name: TARGET_NAME,
          accepts_inputs: [INPUT_KIND],
          generate: (input): readonly Artifact[] => {
            const i = input as TargetInputRecord;
            const entity = (i.value as { entity?: Entity })?.entity;
            if (!entity) return [];
            return [
              makeArtifact({
                path: `${outDir}/${fileNameFor(entity)}.ts`,
                content: renderEntity(entity, vendor),
                kind: "source",
                language: "typescript",
              }),
            ];
          },
        },
      ],
    }),
  });
};
