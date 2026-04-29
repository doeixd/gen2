# Allium Spec Review — Domain Compiler Library

## Executive Summary

The current Allium specs in `spec/` provide a **solid structural skeleton** but are **insufficient for an AI agent to build the library correctly and completely**. Many of the most distinctive and behaviorally-critical features from `spec.md` are either missing entirely or captured only as untyped strings rather than as checkable domain rules.

The specs are approximately **60-70% complete** on entity definitions, **30-40% complete** on behavioral rules, and **20% complete** on the expression/query system that forms the heart of the library.

---

## Critical Gaps (Will Cause Incorrect Build)

### 1. Expression & Operation Type System — Almost Entirely Missing

`spec.md` §11 defines a **static typed AST system** where `gen.expr(type, input => expr)` builds expression trees with compile-time type checking. The current specs model `Expression` as:

```allium
entity Expression {
    kind: schema | query | mutation | client | server
    value_type: SemanticType
    contains_opaque_js: Boolean
    requirements: List<String>
    effects: List<String>
}
```

This is **far too coarse**. An AI agent reading this would not know:

- That `gen.op.eq` requires both operands to have the same semantic type
- That `gen.op.lower` requires a string expression (spec.md §11.2)
- That schema expressions cannot contain opaque JS (invariant exists but enforcement is unclear)
- How expression trees compose (unary, binary, n-ary, predicate, comparison, aggregate)
- Expression phase awareness (schema vs query vs mutation vs client vs server)

**Missing entities:** `UnaryOp`, `BinaryOp`, `Predicate`, `ComparisonOp`, `AggregateOp`, `FieldOp`, `QueryOp`.

### 2. Query System — Missing

`spec.md` §27 describes typed predicates, query-backed fields, and runtime-aware planning. The current specs have `QueryBody` with:

```allium
entity QueryBody {
    predicate: String?
    projection: storage/Projection?
    order_by: List<OrderClause>
    limit: Integer?
    offset: Integer?
}
```

Using `String` for `predicate` means **zero type-checking** of query logic. An AI agent cannot enforce that `gen.eq(User.fields.email, input.field("email"))` is valid, or that aggregates use the correct representation.

**Missing:** `QueryExpression`, `PredicateExpr`, `JoinExpr`, `AggregateExpr`, `QueryBackedField`, `QueryPlanner`, `ExecutionPlan` with store/runtime placement.

### 3. Representation Primitives — Missing

`spec.md` §9.2-9.3 defines precise representation primitives:

- `gen.repr.u8()`, `u16()`, `u32()`, `u64()`, `u128()`
- `gen.repr.i8()`, `i16()`, `i32()`, `i64()`, `i128()`
- `gen.repr.f32()`, `f64()`
- `gen.repr.text({ encoding: "utf8", lengthPrefix: "u32-le" })`
- `gen.repr.fixedBytes(16)`
- `gen.repr.optional(inner)`, `array(inner)`, `map(key, value)`, `struct(...)`, `tagged(...)`

The current `Representation` entity has:

```allium
entity Representation {
    name: String
    kind: primitive | compound | tagged
    byte_width: Integer?
    signedness: signed | unsigned?
    fixed: Boolean
    text_encoding: utf8 | utf16 | ascii?
}
```

This loses critical layout information (endianness, length prefix format, floating-point format, comparison semantics, aggregation semantics). An AI agent cannot generate correct SQL column types, BSATN, or JSON Schema from this.

### 4. Semantic Type Ergonomic Layer — Missing

`spec.md` §9.5 lists:

- `gen.uuid()`, `gen.string()`, `gen.email()`, `gen.url()`
- `gen.int()`, `gen.decimal()`, `gen.boolean()`
- `gen.datetime()`, `gen.date()`, `gen.json()`
- `gen.array(type)`, `gen.object({...})`, `gen.enumOf([...])`
- `gen.literal(value)`, `gen.brand("UserId", gen.uuid())`

None of these are modeled. The specs only have the underlying `SemanticType` with no way to express "this is an email type backed by text representation with email validation trait."

### 5. Value Types (Struct / Tagged Union) — Missing

`spec.md` §9.8 explicitly distinguishes:

- **Entity**: identity-bearing domain object
- **Struct**: inline product value
- **Tagged**: inline sum/discriminated-union value

The specs have no `Struct` or `Tagged` entities. This means an AI agent would likely conflate value types with entities, missing the design requirement that "not every structured value should become an entity."

### 6. Events, Facts, Reducers — Missing

`spec.md` §25 defines events, emission, reducers, and optional fact-log systems. The current specs have **zero** coverage of:

- `gen.events.event("UserCreated", {...})`
- `gen.events.reducer(...)`
- Emission from mutators
- Outbox/subscription patterns

### 7. Contracts — Missing

`spec.md` describes `contract` declarations with `@invariant` annotations, referenced by surface `contracts:` clauses (`demands Codec`, `fulfils EventSubmitter`). No `Contract` entity exists.

### 8. Actors & Identity — Missing

`spec.md` surfaces use `facing` clauses with actor types (`facing viewer: Interviewer`) and `identified_by` mappings. Actors with `within:` context are used for boundary identity. No `Actor` entity exists.

### 9. Runtime Planning & Fallback — Under-Specified

`spec.md` §12.4 describes a planner that assigns operations to runtimes with explicit fallback policies:

```ts
gen.plan(UserRead, {
  runtimes: { database: postgres16, server: node20 },
  placement: { prefer: "database", fallback: "server" },
  fallback: gen.fallback.allow({ pureOnly: true, deterministicOnly: true }),
});
```

The current specs have a skeletal `ExecutionPlan` but no `Planner`, `PlacementPolicy`, `FallbackPolicy`, or rules for splitting execution across database/server.

### 10. Configuration & Defaults — Missing

`spec.md` shows:

```allium
config {
    invitation_expiry: Duration = 7.days
    max_login_attempts: Integer = 5
}

default Role viewer = { name: "viewer", permissions: { "documents.read" } }
```

No `ConfigEntry` or `DefaultInstance` entities exist.

---

## Major Gaps (Incomplete Behavior)

### 11. Many Type Safety Requirements Not Captured

`spec.md` §31 lists 40 type safety requirements. The current specs capture approximately 15 of them. Missing include:

| #   | Requirement                                                  | Status                                   |
| --- | ------------------------------------------------------------ | ---------------------------------------- |
| 1   | Nonexistent entity fields                                    | ❌ Not captured                          |
| 2   | Fields from wrong entity                                     | ❌ Not captured                          |
| 11  | Passing Mongo storage to SQL-only targets                    | ❌ Not captured                          |
| 13  | Binding component props to incompatible field types          | ❌ Not captured                          |
| 14  | Exposing server-only fields/effects to client bundles        | ⚠️ Partial (only for routes)             |
| 18  | Unsupported relation cardinality in target                   | ❌ Not captured                          |
| 19  | Unsupported store dialect in target                          | ❌ Not captured                          |
| 20  | Unsupported query operation in runtime/store                 | ⚠️ Partial (predicate check only)        |
| 21  | Vague storage representation where target requires precision | ❌ Not captured                          |
| 22  | Non-static JS closure in portable definition                 | ⚠️ Only has `contains_opaque_js` flag    |
| 23  | Expression type mismatch (string op on numeric)              | ❌ Not captured                          |
| 25  | Aggregation over ambiguous derived type                      | ❌ Not captured                          |
| 26  | Function body output not matching return type                | ⚠️ Only checks `output_type != null`     |
| 27  | Effects unsupported by target runtime                        | ⚠️ Partial (StaticFunction only)         |
| 29  | Optimistic patch not reconcilable                            | ⚠️ Only checks `reconcile_field != null` |
| 30  | Action writes non-writable fields                            | ❌ Not captured                          |
| 33  | Style uses invalid token                                     | ❌ Not captured                          |
| 34  | Style property unsupported by platform                       | ❌ Not captured                          |
| 35  | Behavior requires unsupported event                          | ❌ Not captured                          |
| 36  | Missing required UI service                                  | ⚠️ Partial (only checks `ui_service`)    |
| 38  | Slot remapping to incompatible capability                    | ❌ Not captured                          |
| 39  | Collection behavior on non-collection slot                   | ❌ Not captured                          |

### 12. Core Plugin Contract Too Thin

`spec.md` §4 defines `definePlugin()` with:

- `id`, `requires`, `setup(ctx)`
- Returns: `helpers`, `targets`, `runtimes`, `metadata`, `diagnostic definitions`

The current `core.allium` has `Plugin` with `id`, `namespace`, `helpers`, `required_plugins`, `status` but:

- No `setup` function concept
- No `targets` contribution on Plugin
- No `runtimes` contribution on Plugin
- No `metadata namespaces` contribution
- No `diagnostic definitions` contribution
- No `checks` or `codegen hooks` contribution

An AI agent would build a plugin system that cannot register targets, runtimes, or metadata — which is central to the architecture.

### 13. Multi-Store Boundaries Not Explicit

`spec.md` §13.6 says cross-store queries/writes must be explicit about:

- consistency, transactionality, integrity enforcement
- runtime placement, fallback behavior, compensation behavior

The current specs only check "cross-store transaction > 1 stores = error." They do not model:

- `EventualConsistency` with retry/timeout policies
- `Saga` with compensation steps
- Cross-store read planning (which store serves which field)

### 14. Missing Relation Include Inference

`spec.md` §16.7 describes:

```ts
type PostWithAuthor = InferEntity<typeof Post, { include: [typeof PostAuthor] }>;
```

No `IncludeConfig` or inference rules exist for relation includes.

### 15. Missing Authz Policy Translation

`spec.md` §19.3 requires policies to be:

- Optionally translatable to SQL predicates
- Translatable to server runtime checks
- Safe to expose only as limited client metadata

The current specs check policy-to-entity matching but do not model translation targets or client-metadata safety limits.

### 16. Form System Under-Specified

`spec.md` §22 describes:

- Form derived from `gen.func.action` input contract
- Relation inputs with `relationSelect` widget
- Form inference: `InferFormValues`, `InferFormSubmit`, `InferFormErrors`
- Style attachment to form slots

The current `ui.allium` has `FormField.widget_kind: String` which is far too vague. No `relationSelect` concept. No form error mapping.

### 17. UI Collection Slots Missing

`spec.md` §23.12 describes typed collection slots:

```ts
rows: gen.ui.Element.Collection(gen.ui.Element.Row);
```

The current `Slot.capability: String` cannot express `Collection(Row)`. An AI agent would not know how to type-check collection behaviors.

### 18. Missing Serialization Boundary Types

`spec.md` §28 requires explicit serializers for non-JSON-native types:

```ts
gen.serializer(gen.datetime(), {
  json: gen.string(),
  encode: (d) => d.toISOString(),
  decode: (s) => new Date(s),
});
```

No `Serializer` entity exists. The `has_serializer: Boolean` flag on `SemanticType` is insufficient.

### 19. Missing Environment/Secrets Schema

`spec.md` §29 shows:

```ts
const Env = gen.env.schema({
  DATABASE_URL: gen.env.url().serverOnly(),
  SESSION_SECRET: gen.env.string().secret(),
});
```

No `EnvSchema` or `EnvVariable` entities exist.

---

## Minor Issues & Inconsistencies

### 20. Unused Entities

- `entity/FieldShape` is defined but never referenced by `Entity`
- `entity/DefaultValue` is defined but `Field.default_value` is `String?` instead of `DefaultValue?`
- `storage/Mutator` is a leftover helper entity that should be removed (replaced by `api/Mutator`)
- `ui/FormValues` is a helper with no clear relationship to `Form`

### 21. Stringly-Typed Where It Should Be Typed

| Location                 | Current        | Should Be                   |
| ------------------------ | -------------- | --------------------------- |
| `Expression.kind`        | `String`       | Enum or variant             |
| `Operation.capabilities` | `List<String>` | `List<Capability>`          |
| `Operation.effects`      | `List<String>` | `List<Effect>`              |
| `Operation.laws`         | `List<String>` | `List<Law>`                 |
| `Slot.capability`        | `String`       | `ElementCapability` variant |
| `Behavior.body`          | `String`       | `ActionBody` or AST         |
| `QueryBody.predicate`    | `String`       | `PredicateExpr`             |
| `ActionBody.inserts`     | `List<String>` | `List<InsertOp>`            |

### 22. Invariant `ReadOnlyFieldNoDefault` Is Wrong

```allium
invariant ReadOnlyFieldNoDefault {
    for e in Entities:
        for f in e.fields where f.read_only:
            f.default_value = null
}
```

A read-only field **can** have a default (e.g., `created_at = now()`). The rule should be: read-only fields cannot appear in **mutator inputs**, not that they cannot have defaults. `spec.md` §15.4 shows read-only mapping sources like aggregates and hidden fields — it doesn't say read-only fields can't have defaults.

### 23. Missing `transition` Graphs on Entities

`spec.md` (v3 feature) shows:

```allium
entity Order {
    status: pending | confirmed | shipped | delivered | cancelled
    transitions status {
        pending -> confirmed
        confirmed -> shipped
        terminal: delivered, cancelled
    }
}
```

No `TransitionGraph` entity exists. This is optional for v2.1 but should be noted.

### 24. Surface `related` Clauses Are Weak

Most `related` clauses use prose conditions (`when entity has mapping`) rather than typed references. An AI agent cannot check these.

### 25. Missing `contract` and `guarantee` on Surfaces

`spec.md` surfaces support `contracts:` (demands/fulfils), `@guarantee` (prose), `@guidance` (non-normative). None of these appear on current surfaces.

### 26. Missing `timeout` on Surfaces

Temporal rules that apply within a surface's context are not modeled.

---

## Clarifying Questions

### Q1: Scope of Expression Type-Checking

Should the Allium specs model the **full expression algebra** (`gen.op.eq`, `gen.op.gt`, `gen.op.concat`, `gen.op.lower`, aggregates, etc.) with type-checking rules, or is it sufficient to model `Expression` as an opaque AST node and leave type-checking to the TypeScript implementation?

**Implication:** If we model the full algebra, the specs grow by ~200-300 lines but an AI agent can generate correct expression builders and validators. If opaque, the agent must invent its own expression system.

### Q2: Events/Reducers/Facts — In Scope?

`spec.md` §25 says events/reducers are standard, but §25.4 says immutable facts/IVM/rules are **optional packages** (`@gen/facts`, `@gen/rules`). Should the base specs include `Event` and `Reducer`, or defer to a separate `events.allium` module?

### Q3: Contracts and Actors — In Scope?

Contracts (`contract Codec { ... }`) and actor declarations (`actor Interviewer { identified_by: email, within: Workspace }`) appear in the surface syntax but are not heavily used in the end-to-end example. Are these v2.1 core or v3 deferred?

### Q4: Transition Graphs and State-Dependent Fields

These are marked "(v3)" in `spec.md`. Should they be included in the current specs or noted as deferred?

### Q5: TypeScript Inference Requirements

`spec.md` §32 lists 30+ inference requirements (e.g., `InferEntity`, `InferField`, `InferFormValues`). These are TypeScript compile-time behaviors. Should Allium specs capture them as **behavioral assertions** ("the system must infer X from Y") or are they implementation notes outside the spec?

### Q6: CLI Commands

`spec.md` §34 lists CLI commands (`gen check`, `gen generate`, `gen watch`, etc.). Should these be modeled as surfaces/operations in `lifecycle.allium`, or are they out-of-band tooling concerns?

### Q7: Testing Requirements

`spec.md` §33 describes type tests, runtime tests, golden tests, and law tests. Should the Allium specs define what test artifacts must be generated, or is this documentation for developers?

### Q8: Cross-Store Read Planning

When a query reads fields mapped to different stores (e.g., `User.displayName` from Postgres, `User.lastSeenAt` from ClickHouse, `User.preferences` from Mongo), how should the planner behave?

- Option A: Prohibit cross-store reads entirely
- Option B: Allow reads with explicit `gen.plan()` annotations
- Option C: Automatically plan with fallback to server-side composition

`spec.md` §12.4 suggests Option C with explicit fallback policies. Should the specs mandate a specific behavior?

---

## Recommendations

### Immediate (Must Fix Before Build)

1. **Expand `core.allium`** to include the full plugin contract: `setup`, `targets`, `runtimes`, `metadata namespaces`, `diagnostic definitions`, `checks`, `codegen hooks`.
2. **Expand `types.allium`** to include representation primitives (`u8` through `i128`, `f32`/`f64`, `text`, `fixedBytes`, `optional`, `array`, `struct`, `tagged`) and the ergonomic semantic type layer (`uuid`, `email`, `money`, `timestamp`, etc.).
3. **Add `expression.allium`** with the typed expression algebra, operation kinds, and phase-aware type checking rules.
4. **Add `query.allium`** with `QueryExpression`, predicates, joins, aggregates, query-backed fields, and runtime-aware planning.
5. **Expand `function.allium`** to distinguish `Expr`, `Predicate`, `Query`, `Action`, `Patch`, `Plan` as separate static node kinds.

### High Priority (Should Fix)

6. **Add `event.allium`** for events, reducers, emission, and outbox (even if minimal).
7. **Expand `api.allium`** to capture type safety requirements #1, #2, #11, #13, #14, #18, #19, #20.
8. **Expand `ui.allium`** to add `ElementCapability` variants (including `Collection(inner)`), proper widget kinds, form error mapping, and collection slot support.
9. **Expand `authz.allium`** to model policy translation targets and client-metadata safety.
10. **Add `config.allium`** or expand `core.allium` to include `config` blocks and `default` instances.

### Medium Priority (Nice to Have)

11. Add `Contract`, `Actor`, and `TransitionGraph` entities (or defer with `deferred` annotations).
12. Add `Serializer` entity for boundary types.
13. Add `EnvSchema` for environment/secrets.
14. Fix minor inconsistencies (unused entities, stringly-typed fields, incorrect `ReadOnlyFieldNoDefault` invariant).

---

## Verdict

**The current specs are a good first draft but cannot be used as-is by an AI agent to build the full library.** The agent would build:

- ✅ Basic entity/field system
- ✅ Basic plugin registration
- ✅ Basic storage mapping
- ✅ Basic relations with FK checks
- ✅ Basic API routes
- ✅ Basic UI forms with slot checks
- ❌ The expression/type system (heart of the library)
- ❌ The query system
- ❌ Runtime-aware planning
- ❌ Representation precision
- ❌ Events/reducers
- ❌ ~25 of 40 type safety requirements

**Recommendation:** Address the 5 Immediate items and the 10 High Priority items before treating the specs as build-ready.
