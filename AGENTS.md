<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, but it invokes Vite through `vp dev` and `vp build`.

## Vite+ Workflow

`vp` is a global binary that handles the full development lifecycle. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

### Start

- create - Create a new project from a template
- migrate - Migrate an existing project to Vite+
- config - Configure hooks and agent integration
- staged - Run linters on staged files
- install (`i`) - Install dependencies
- env - Manage Node.js versions

### Develop

- dev - Run the development server
- check - Run format, lint, and TypeScript type checks
- lint - Lint code
- fmt - Format code
- test - Run tests

### Execute

- run - Run monorepo tasks
- exec - Execute a command from local `node_modules/.bin`
- dlx - Execute a package binary without installing it as a dependency
- cache - Manage the task cache

### Build

- build - Build for production
- pack - Build libraries
- preview - Preview production build

### Manage Dependencies

Vite+ automatically detects and wraps the underlying package manager such as pnpm, npm, or Yarn through the `packageManager` field in `package.json` or package manager-specific lockfiles.

- add - Add packages to dependencies
- remove (`rm`, `un`, `uninstall`) - Remove packages from dependencies
- update (`up`) - Update packages to latest versions
- dedupe - Deduplicate dependencies
- outdated - Check for outdated packages
- list (`ls`) - List installed packages
- why (`explain`) - Show why a package is installed
- info (`view`, `show`) - View package information from the registry
- link (`ln`) / unlink - Manage local package links
- pm - Forward a command to the package manager

### Maintain

- upgrade - Update `vp` itself to the latest version

These commands map to their corresponding tools. For example, `vp dev --port 3000` runs Vite's dev server and works the same as Vite. `vp test` runs JavaScript tests through the bundled Vitest. The version of all tools can be checked using `vp --version`. This is useful when researching documentation, features, and bugs.

## Common Pitfalls

- **Using the package manager directly:** Do not use pnpm, npm, or Yarn directly. Vite+ can handle all package manager operations.
- **Always use Vite commands to run tools:** Don't attempt to run `vp vitest` or `vp oxlint`. They do not exist. Use `vp test` and `vp lint` instead.
- **Running scripts:** Vite+ built-in commands (`vp dev`, `vp build`, `vp test`, etc.) always run the Vite+ built-in tool, not any `package.json` script of the same name. To run a custom script that shares a name with a built-in command, use `vp run <script>`. For example, if you have a custom `dev` script that runs multiple services concurrently, run it with `vp run dev`, not `vp dev` (which always starts Vite's dev server).
- **Do not install Vitest, Oxlint, Oxfmt, or tsdown directly:** Vite+ wraps these tools. They must not be installed directly. You cannot upgrade these tools by installing their latest versions. Always use Vite+ commands.
- **Use Vite+ wrappers for one-off binaries:** Use `vp dlx` instead of package-manager-specific `dlx`/`npx` commands.
- **Import JavaScript modules from `vite-plus`:** Instead of importing from `vite` or `vitest`, all modules should be imported from the project's `vite-plus` dependency. For example, `import { defineConfig } from 'vite-plus';` or `import { expect, test, vi } from 'vite-plus/test';`. You must not install `vitest` to import test utilities.
- **Type-Aware Linting:** There is no need to install `oxlint-tsgolint`, `vp lint --type-aware` works out of the box.

## CI Integration

For GitHub Actions, consider using [`voidzero-dev/setup-vp`](https://github.com/voidzero-dev/setup-vp) to replace separate `actions/setup-node`, package-manager setup, cache, and install steps with a single action.

```yaml
- uses: voidzero-dev/setup-vp@v1
  with:
    cache: true
- run: vp check
- run: vp test
```

## Compile and Bundling Hints

This project uses bundler-specific annotation comments to optimize tree-shaking. It does **not** use browser-native `//# allFunctionsCalledOnLoad` hints because `src/index.ts` is a library re-export barrel with no function declarations; the consuming application should place that hint in its own entry point if desired.

### Bundler Annotations

Most source modules contain a leading `/* @__NO_SIDE_EFFECTS__ */` comment. This tells Rollup, Rolldown, and other compatible bundlers that every top-level function declared in that module is side-effect free. When a consumer imports only a subset of the library, this annotation lets the bundler drop unused functions aggressively during tree-shaking.

Key conventions:

- **`/* @__NO_SIDE_EFFECTS__ */`** — Placed at the top of modules whose exports are pure factories or pure utility functions. We do **not** place this on modules that perform module-level mutation (e.g., `src/lifecycle/lifecycle.ts` maintains a `moduleCheckers` registry) or on `src/gen.ts`, whose `createGen` triggers global checker registration.
- **`/* @__PURE__ */`** — Used sparingly at call sites to mark a specific expression as side-effect free. We prefer file-level `/* @__NO_SIDE_EFFECTS__ */` where possible because this codebase is almost entirely factory functions.
- **Comment preservation** — `vite.config.ts` configures `pack.outputOptions.comments` with `annotation: true` and `legal: true` so that these hints survive into the published `dist/index.mjs` bundle.

When adding new pure factory modules, copy the `/* @__NO_SIDE_EFFECTS__ */` hint to the top of the file. When adding a module that mutates shared state at the top level, omit the hint.

## Library Goals and Philosophy

gen2 is a **typed semantic IR SDK for full-stack applications**. It lets you describe your application's domain, data, actions, rules, auth, UI, routes, forms, reactivity, and runtime requirements as typed, inspectable TypeScript values — then checks, derives, generates, visualizes, and evolves the app from that model.

### Core Principles

- **Application behavior should be data first.** The source of truth is a graph of typed domain objects (Entity, Field, Rule, Policy, QueryFunction, ActionFunction), not handwritten code scattered across layers.
- **Domain semantics should be inspectable.** Every concept is a static value that can be checked, transformed, and understood by tools.
- **Generated code is an interpretation, not the source of truth.** Queries and actions (`gen.func.query`, `gen.func.action`) are canonical. Everything else (reactivity, routing, UI, forms, clients, tests) interprets them.
- **Type inference is part of the product.** The IDE experience is a first-class concern. Users should never need explicit type annotations for common cases.
- **Targets are plugins, not hardcoded assumptions.** Storage backends, UI platforms, and code generators are swappable through the plugin architecture.
- **Reactivity, routing, auth, UI, and CRUD should derive from one graph.** A single change (e.g., adding a field) should flow through all derived systems automatically.
- **Rules should be pure predicates.** Authorization, validation, and reactivity conditions are named, inspectable rules, not opaque functions.
- **Effects should be explicit.** Every action declares its write-set, invalidation patterns, and requirements.
- **Fallbacks should be visible.** Unsafe or degraded placements (e.g., server post-filter instead of SQL WHERE) emit diagnostics.
- **Diagnostics should explain degradation and unsafe choices.** Warnings and errors guide the developer toward better decisions.

### The Guiding Preference

```
Describe what the app means.
Let the compiler decide what can be generated safely.
```

Not:

```
Write framework glue everywhere and hope it stays consistent.
```

### Stability and Breaking Changes

**This library is pre-release.** APIs, types, and internal structures will change. Breaking changes are explicitly acceptable when they provide a clear benefit such as:

- Greater type safety or stronger inference
- Better developer experience (DX) — fewer manual annotations, clearer errors, improved autocomplete
- Performance improvements in compile-time or generated runtime code
- Cleaner architecture that enables future extensibility (e.g., trait-based composition, plugin-defined nodes)
- More accurate diagnostics or safer defaults

When making a breaking change, prefer to:

- Keep the public API surface as small and expressive as possible.
- Preserve IDE inference and autocomplete; never trade type precision for convenience.
- Update or add tests that demonstrate the new, better behavior.
- Document the rationale briefly if the change is large.

Do **not** avoid a breaking change solely to keep existing code compiling if the change measurably improves safety, DX, or performance.

### End-User Autocomplete and IDE Experience

Every public API should feel like it "just works" in an IDE:

- **`gen.entity("User", { ... })`** — field names autocomplete, types flow from `semanticType` constructors.
- **`gen.crud.derive(User, { access: { fields: { na| } } })`** — only valid field names of `User` appear in autocomplete.
- **`gen.authz.policy({ target_entity: User, surfaces: [{ surface: gen.authz.surface.entityRead(Po|) }] })`** — `Post` is rejected at type-check time because `AccessSurfaceOf<typeof User>` only accepts surfaces targeting `User`.
- **`rule.define({ name: "isActive", when: rule.eq(rule.field(User, User.fields.name, |) })`** — the third argument's type is inferred from the field's `semantic_type`.

**Rule:** If you add a new public API and you cannot use it comfortably without explicit type annotations, the types are wrong. Fix the inference.

## TypeScript Philosophy and Conventions

This codebase treats TypeScript as a **design language**, not just a linter. Types carry semantic intent, enable compile-time verification, and drive IDE autocomplete. Every new feature should make the library _more_ type-safe and _easier_ to use without explicit type annotations.

### Phantom Types

We use phantom type parameters pervasively to link runtime values to their TypeScript equivalents:

- `SemanticType<Ts>` carries `_ts?: Ts`
- `Field<Ts>` carries `_ts?: Ts`
- `Rule<Name, Vars>` carries `_vars?: Vars`
- `QueryExpression<Result>` carries `_result?: Result`
- `Entity` does **not** carry a phantom type param because its shape is structural (fields are the source of truth)

**Rule:** When adding a new IR type that represents a typed concept, attach a phantom type parameter. Name it `_ts?`, `_result?`, `_vars?`, or similar. Do not use `unknown` as the default if a more specific default is meaningful.

### Generics and Inference

**Inference flows down from references; requirements bubble up from constraints.**

- Constructors should be generic and infer their type arguments from runtime arguments:
  ```ts
  // Good — E is inferred from the entity argument
  export const entityRead = <E extends Entity>(entity: E): EntityReadSurface<E> => ...
  ```
- Generic parameters should have meaningful constraints:
  ```ts
  // Good — E is constrained to Entity, not any
  export interface Policy<E extends Entity = Entity> { ... }
  ```
- Avoid explicit type arguments at call sites; let inference do the work:
  ```ts
  // Good
  const s = entityRead(User); // EntityReadSurface<typeof User>
  // Bad
  const s = entityRead<typeof User>(User);
  ```

### Narrow Return Types

Factory functions must return the **narrowest possible type**, not the broad union.

```ts
// Good — returns the specific branch
export const entityRead = <E extends Entity>(entity: E): EntityReadSurface<E> => ...

// Bad — returns the full union, forcing consumers to narrow
export const entityRead = (entity: Entity): AccessSurface => ...
```

This applies to:

- `AccessSurface` branch constructors (`entityRead`, `fieldRead`, etc.)
- `AuthCondition` constructors (`allowRole`, `allowOwner`, etc.)
- Expression constructors (`ruleEq`, `ruleField`, etc.)

### Entity-Typed APIs

When an API targets a specific entity, its configuration should be typed against that entity's fields:

```ts
// Good — field names are keyof E["fields"]
export interface CrudAccessOptions<E extends Entity = Entity> {
  readonly fields?: {
    readonly [K in keyof E["fields"]]?: { read?: Policy<E>; write?: Policy<E> };
  };
}
```

This gives autocomplete for valid field names and rejects invalid ones at compile time.

### AccessSurfaceOf<E> — Entity-Scoped Surfaces

Policies should only accept surfaces that target their entity. Use `AccessSurfaceOf<E>` to enforce this:

```ts
export const definePolicy = <E extends Entity = Entity>(input: {
  target_entity: E;
  surfaces?: readonly { surface: AccessSurfaceOf<E>; deny?: DenyBehavior }[];
}): Policy<E> => ...
```

This prevents attaching a `Post` read surface to a `User` policy.

### No Casting in Tests or End-User Code

**Avoid `as`, `as unknown`, `as any`, or `as import(...)` in tests and end-user-facing code.** If a test needs a cast, the public API is not expressive enough — fix the types instead.

Internal source casts are acceptable when they are the only practical way to improve inference, preserve phantom types through namespace builders, or fix a TypeScript limitation that would otherwise degrade the consumer DX. When you use one, add a short comment explaining why the cast is necessary and what type-system limitation it works around.

```ts
// Bad — tests should not need this
(policy as unknown as { access_surface_bindings: Binding[] }).access_surface_bindings = [binding];

// Good — the API should accept surfaces directly
const policy = definePolicy({
  target_entity: User,
  surfaces: [{ surface: entityRead(User) }],
});

// Acceptable — internal binder preserving generic inference through a namespace object
const bound = ((...args) => {
  const result = constructor(...args);
  collection.push(result);
  return result;
}) as typeof constructor;
```

### No Magic Strings

String codes, kinds, and identifiers should be literal union types, not plain `string`:

```ts
// Good — branded literal union
export type AuthzDiagnosticCode =
  | "authz:unsafe-list-post-filter"
  | "authz:list-policy-not-placeable"
  | "authz:write-policy-needs-before-state";

// Bad — any string is accepted
export interface Diagnostic {
  code: string;
}
```

This enables exhaustiveness checking and prevents typos.

### Namespace Objects Preserve Generics

When exposing a namespace object (e.g., `rule`, `gen.authz.surface`), every method must preserve generics through its signature:

```ts
// Good — rule.define returns Rule<Name, Vars>
export const rule = {
  define: defineRule,
  eq: ruleEq,
  and: ruleAnd,
  // ...
};

// Bad — wrapping in an object that strips generics
export const rule = {
  define: (input: { name: string; when: RuleExpr }) => defineRule(input),
};
```

### Type-Safe Surface Construction

Access surface bindings should be created through the policy constructor, not via manual mutation after the fact:

```ts
// Good — surfaces are part of the policy definition
const policy = definePolicy({
  name: "userPolicy",
  target_entity: User,
  surfaces: [
    { surface: entityRead(User), deny: "not_found" },
    { surface: fieldWrite(User, User.fields.name), deny: "forbidden" },
  ],
});

// Bad — manual mutation requires casts and is error-prone
const policy = definePolicy({ name: "userPolicy", target_entity: User, actions: [] });
const binding = defineAccessSurfaceBinding({ surface: entityRead(User), policy });
(policy as unknown as { access_surface_bindings: Binding[] }).access_surface_bindings = [binding];
```

### Generic Mutation Plans

When analyzing functions, preserve their type parameters in the plan:

```ts
// Good — MutationAccessPlan tracks the action's In/Out types
export interface MutationAccessPlan<In = unknown, Out = unknown> {
  readonly action: ActionFunction<In, Out>;
  // ...
}
```

This lets consumers use `plan.action.input_type` with full type safety.

### Prefer `typeof` Over Hand-Written Interfaces

When referencing a function's type in namespace types, use `typeof`:

```ts
// Good
export interface AuthzSurfaceNamespace<C extends GenConfig = GenConfig> {
  entityRead: typeof entityRead;
  fieldRead: typeof fieldRead;
}

// Bad — redeclaring the signature manually
export interface AuthzSurfaceNamespace {
  entityRead: (entity: Entity) => AccessSurface;
}
```

This ensures namespace types stay in sync with the actual function signatures.

### Diagnostic Code Branding

Authz-specific diagnostics should use a branded code type:

```ts
export type AuthzDiagnosticCode =
  | "authz:unsafe-list-post-filter"
  | "authz:list-policy-not-placeable"
  | ...;

export const authzDiagnostic = (input: {
  severity: Diagnostic["severity"];
  code: AuthzDiagnosticCode; // constrained to literal union
  message: string;
}): Diagnostic => ...
```

This makes it impossible to emit an authz diagnostic with an arbitrary string code.

## Working in This Codebase

### Patterns You Will Encounter

- **Discriminated unions everywhere.** `AccessSurface`, `AuthCondition`, `RuleExpr`, `ActionExprKind` — every branch has a `kind` literal. Use narrow return types so consumers don't need `Extract<...>`.
- **Module checkers.** `registerModuleChecker(ctx, (ctx) => checkReactions(ctx.reactions))` is how validation hooks into the lifecycle. Follow this pattern when adding new checker categories.
- **Context-bound factories.** `bindPolicy(ctx)`, `bindDeriveCrud(ctx)` wrap raw constructors and register results into `GenContext`. The raw constructor (`definePolicy`) does **not** mutate context; the binder does.
- **Phantom types over wrapper classes.** We never wrap a value in a class just for types. We use `readonly _ts?: Ts` on interfaces.

### Specific APIs and Their Current Shape

- **Policies** are `Policy<E extends Entity>`. Use `definePolicy({ target_entity: User, surfaces: [...] })` — the `surfaces` option auto-creates `AccessSurfaceBinding` records. Do not manually mutate `policy.access_surface_bindings`.
- **Access surfaces** are generic: `entityRead(User)` returns `EntityReadSurface<typeof User>`, not `AccessSurface`. The `AccessSurfaceOf<E>` type constrains which surfaces a policy can accept.
- **CRUD derivation** accepts `access?: CrudAccessOptions<E>` where `fields` is keyed by `keyof E["fields"]`. This gives autocomplete and rejects invalid field names.
- **Authz namespace** exposes `gen.authz.surface.*` constructors, `gen.authz.matrix(ctx)`, and `gen.authz.plan(action)` for mutation access plans.
- **Reactions** are `Reaction<Name, In, Out>` with `when: Rule`, `run: ActionFunction`, `mode: ReactionMode`, and optional `idempotency` / `delivery` plans.
- **Rule reactivity** uses `deriveRuleInvalidationPlans(ctx)` which returns `DerivedInvalidationPlan` with `precision: "broad" | "matched" | "exact" | "patchable"` and `confidence: "conservative" | "proven"`. IVM delta maintenance is stubbed (`deltaMode: "unsupported"`) for non-monotonic rules.
- **Rules** have a standalone namespace: `rule.define`, `rule.eq`, `rule.and`, etc. Preserve generics through the namespace object.
- **UI editability** uses `editableWhen?: Rule` on `FormField`. `defineFormField` accepts it as the last parameter.

### What Not to Do

- Do not add string-based action names to policies. Use typed `AccessSurface` via the `surfaces` option.
- Do not use `as unknown` or `as any` in tests to attach bindings to policies. Use the `surfaces` option.
- Do not import `vitest`, `oxlint`, `tsdown`, or `vite` directly. Import from `vite-plus` or `vite-plus/test`.
- Do not use `npm`, `pnpm`, or `yarn` directly. Use `vp` for all package management.
- Do not run `vp vitest` or `vp oxlint`. Use `vp test` and `vp lint`.
- Do not run custom scripts that share names with built-in commands without `vp run <script>`.

## Review Checklist for Agents

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to validate changes.
- [ ] New IR types use phantom type parameters where appropriate.
- [ ] Constructors return narrow types, not broad unions.
- [ ] Generic parameters have meaningful constraints (`extends Entity`, not `extends any`).
- [ ] No `as`, `as unknown`, `as any`, or `as import(...)` in tests or end-user-facing examples. Internal source casts are allowed when they improve inference or DX, with an explanatory comment.
- [ ] No magic strings — use literal union types for codes, kinds, and discriminants.
- [ ] Namespace objects preserve generics through all methods.
- [ ] Entity-scoped APIs use `keyof E["fields"]` or `AccessSurfaceOf<E>` for type safety.
- [ ] Types are inferred from references, not manually specified at call sites.
<!--VITE PLUS END-->
