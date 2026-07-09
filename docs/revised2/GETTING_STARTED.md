# Getting Started With Gen2 / Dirived

> **This guide is aspirational.** It describes Gen2 / Dirived as the
> coherent system the design is converging toward — the developer
> experience, the type story, the IR, the lowering machinery, the
> verification story — written for colleagues and AI agents who need
> to reason about what the system _should be_, not just what ships
> today.
>
> Implementation status lives in [`CURRENT.md`](./CURRENT.md). The
> staged work to get from today's code to this guide lives in
> [`PLAN.md`](./PLAN.md). When this guide and the code disagree, the
> guide is the target; the code is what's been written so far.
>
> Pre-release. Designs in here can change without backward-compat
> notes. The goal is the _correct design_, not the smallest delta from
> what currently compiles.

## 1. What Gen2 Is

Gen2 / Dirived is a **typed semantic graph compiler** for full-stack
applications.

You define application meaning once:

- entities and fields;
- semantic types;
- operations;
- expressions;
- queries and actions;
- predicates (traits, laws, rules) — typed boolean claims attached to
  graph subjects;
- policies, UI, sync, deployment, storage, and target requirements.

Gen2 stores those facts in a typed graph. Then graph programs derive the
implementation artifacts:

- database schema;
- RLS policies;
- SQL predicates;
- server handlers;
- client query bindings;
- forms and lists;
- OpenAPI;
- docs;
- tests;
- migrations;
- deployment plans;
- diagnostics and repair patches.

The goal is not "generate files from config." The goal is:

```txt
semantic graph
  -> typed graph programs
  -> explainable patches
  -> target artifacts
```

Every important fact should be inspectable, diffable, explainable,
repairable, cacheable, and target-portable.

## 2. The Core Mental Model

The kernel is small. Everything else is layered on top.

```txt
Node / edge          = durable semantic fact
Marker               = edge-shaped attachment of a classification kind
                       (trait, capability, assurance) to a subject
Predicate            = bodied boolean claim attached to a graph subject
GraphPattern         = typed source shape over graph facts
GraphMatch           = typed binding of a pattern to one graph instance
GraphProjection      = graph / match -> value
GraphMorphism        = source graph shape -> target graph shape
GraphPatch           = graph transaction
GraphStageResult     = graph + patches + diagnostics + artifacts + explanations
GraphPipeline        = ordered composition of graph stages
MetaGraph            = graph of dialects, patterns, morphisms, pipelines, runs
```

That is the whole compiler in one stack.

> **Trait** is an authoring family, not a third primitive. It produces
> either a marker (edge to a trait kind, when atomic) or a predicate
> (when body-bearing via `.when(...)`). The same is true of capabilities
> and assurances. See §10 for the full split.

The rule of thumb:

> If another pass needs to find it, join on it, explain it, diff it,
> repair it, target-lower it, or attach diagnostics to it, make it
> structural graph data. Do not hide it in metadata.

Metadata is still useful, but only as typed payload attached to one fact:
display names, source locations, provenance, hashes, confidence, and
dialect-owned custom data.

## 3. Three Altitudes Of Authoring

Before the deep dive, here is the same idea at three altitudes —
beginner, power user, and kernel author. All three lower to the
**same graph IR**. Switching altitudes is not switching tools; it is
switching how much of the graph you author by hand.

> **Recipes are not shortcuts around the graph. Recipes are graph
> authors.** Every fact a power user could write by hand is one a
> recipe can emit. The inspection, explanation, preview, and repair
> surface works identically across all three altitudes — there is no
> "looking inside" a recipe, because the recipe is the same graph it
> would have been if you'd typed it out.

This is a load-bearing claim, so it carries a product obligation:
the recipe layer must be inspectable all the way down. The four
inspection methods you can call on any altitude:

```ts
app.recipe.expand().print(); // every node/edge/predicate the recipe emitted
app.explain(Customer).print(); // the chain of facts behind one entity
app.preview().print(); // the patches the next emit will produce
app.showSourceFacts("generated/postgres/schema.sql"); // back from artifact to source facts
```

If any of these returns "opaque — recipe boundary," the recipe is
broken, not the inspection API. Altitude 1 must not be a toy.

### 3.1 Altitude 1 — Generated From A Recipe (Rails-Surface)

For a working SaaS app in 30 lines:

```ts
import { gen } from "@dirived/kit";

const app = gen.kit.saas("Billing", {
  entities: {
    Customer: { email: "email", displayName: "string" },
    Invoice: { customer: "Customer", total: "money", status: ["draft", "issued", "paid"] },
  },
  policies: {
    Invoice: { read: "ownedByActor", update: "ownedByActor" },
  },
});

await app.emit(); // → schema.sql, RLS, server handlers, tanstack queries, forms, tests, openapi
```

`gen.kit.saas` expands into typed graph facts (entities, fields,
relations, queries, actions, policies). The user wrote a recipe; the
recipe lowered to the same IR a power user would have authored
explicitly. Diagnostics, repairs, explanations, and previews work
identically.

### 3.2 Altitude 2 — Composed By Hand (Power-User-Surface)

For full control over dialects, rules, and target stack:

```ts
const app = gen.app(
  "Billing",
  {
    dialects: [
      DomainDialect,
      RuleDialect,
      CallableDialect,
      ReactivityDialect,
      PostgresDialect,
      TanstackQueryDialect,
    ],
  },
  (g) => {
    const Customer = g.entity("Customer", (t) => ({
      id: t.uuid(),
      email: t.email(),
    }));

    const Invoice = g.entity("Invoice", (t) => ({
      id: t.uuid(),
      customerId: t.ref(Customer),
      total: t.money(),
      status: t.enum("draft", "issued", "paid"),
    }));

    const canViewInvoice = g.rule.for(Invoice, ({ field, actor }) =>
      expr.eq(field(Invoice.fields.customerId), actor.customerId),
    );

    const listInvoices = g.query("listInvoices").from(Invoice).guard(canViewInvoice).key(Invoice);
    const markPaid = g.action("markPaid").update(Invoice).set(Invoice.fields.status, "paid");

    return { Customer, Invoice, canViewInvoice, listInvoices, markPaid };
  },
);

const preview = app.preview();
preview.print();

await app.emit(PostgresDialect.pipelines.emitSchema);
await app.emit(TanstackQueryDialect.pipelines.emitClient);
```

Same graph as Altitude 1 — just written explicitly. The user picks the
dialect set, names every entity, writes rules in expression form, and
chooses which target pipelines to emit. Sections §4–§18 walk this
altitude end-to-end.

### 3.3 Altitude 3 — Raw IR (Kernel-Surface) — Compile To C

For a target the standard dialects don't ship: declare a new dialect
with its own type vocabulary, write lowering morphisms for both data
_and_ operations, register an emitter. The full sketch below is the
shape of a real target — primitive C types, structs, functions,
parameters, and a precondition that becomes an `assert` in the
generated body.

```ts
import {
  defineDialect,
  defineNodeKind,
  defineEdgeKind,
  defineMorphism,
  definePipeline,
  MorphismPhase,
  payload,
  id,
  kernel,
  type KernelNode,
  type KernelNodeRef,
  type Representation,
  type SemanticType,
  type Serializer,
} from "@dirived/kernel";

// 1. Type vocabulary — C primitive types are themselves typed graph nodes.
//    Authors reference these by witness, never by string.
const cId = id.createFactory("c");

const CType = defineNodeKind({
  id: cId.nodeKind("type"),
  custom: payload.struct({
    name: payload.string(), // stable C type spelling: "bool", "int32_t", "Customer*", …
    bytes: payload.optional(payload.u32()), // sizeof, when known
    isPointer: payload.boolean(),
    elementOf: payload.optional(payload.string()), // for pointers/arrays
    include: payload.optional(payload.string()), // "stdint.h", "stdbool.h", generated header
  }),
});

// Pre-declared singletons for the common primitives. Each is a typed
// node ref into a `c.types.*` registry the dialect populates at boot.
const CBool = cId.nodeRef(CType, "bool");
const CChar = cId.nodeRef(CType, "char");
const CInt32 = cId.nodeRef(CType, "int32_t");
const CInt64 = cId.nodeRef(CType, "int64_t");
const CFloat = cId.nodeRef(CType, "float");
const CDouble = cId.nodeRef(CType, "double");
const CVoid = cId.nodeRef(CType, "void");

// Derived type factories return typed refs keyed by element type/size.
const CPointer = (element: KernelNodeRef<typeof CType>) =>
  cId.nodeRef(CType, `${element.id.name}*`);
const CConstPointer = (element: KernelNodeRef<typeof CType>) =>
  cId.nodeRef(CType, `const ${element.id.name}*`);
const CArray = (element: KernelNodeRef<typeof CType>, length: number) =>
  cId.nodeRef(CType, `${element.id.name}[${length}]`);

// 2. Structural node kinds — structs, fields, functions, parameters.
const CStruct = defineNodeKind({
  id: cId.nodeKind("struct"),
  custom: payload.struct({ name: payload.string() }),
});

const CField = defineNodeKind({
  id: cId.nodeKind("field"),
  custom: payload.struct({ name: payload.string() }),
});

const CFunction = defineNodeKind({
  id: cId.nodeKind("function"),
  custom: payload.struct({ name: payload.string(), body: payload.string() }),
});

const CParam = defineNodeKind({
  id: cId.nodeKind("param"),
  custom: payload.struct({
    name: payload.string(),
    index: payload.u32(),
    passing: payload.enum("value", "constPointer", "mutablePointer", "outPointer"),
    ownership: payload.enum("borrowed", "owned", "callerAllocated"),
    decodeWith: payload.optional(payload.ref(DomainDialect.nodes.serializer)),
  }),
});

// 3. Edges — structural relationships, all typed.
const CStructHasField = defineEdgeKind({
  id: cId.edgeKind("structHasField"),
  endpoints: { struct: CStruct, field: CField },
});
const CFieldHasType = defineEdgeKind({
  id: cId.edgeKind("fieldHasType"),
  endpoints: { field: CField, type: CType },
});
const CFunctionHasParam = defineEdgeKind({
  id: cId.edgeKind("functionHasParam"),
  endpoints: { function: CFunction, param: CParam },
});
const CParamHasType = defineEdgeKind({
  id: cId.edgeKind("paramHasType"),
  endpoints: { param: CParam, type: CType },
});
const CFunctionReturns = defineEdgeKind({
  id: cId.edgeKind("functionReturns"),
  endpoints: { function: CFunction, type: CType },
  custom: payload.struct({
    passing: payload.enum("value", "constPointer", "mutablePointer", "outPointer"),
    ownership: payload.enum("borrowed", "owned", "callerAllocated"),
    encodeWith: payload.optional(payload.ref(DomainDialect.nodes.serializer)),
  }),
});

// A target dialect should not throw away source type meaning. This edge records
// the ABI decision for each source semantic type. Later morphisms read this
// binding instead of re-running ad-hoc string switches.
const CSemanticTypeHasAbiType = defineEdgeKind({
  id: cId.edgeKind("semanticTypeHasAbiType"),
  endpoints: { semanticType: DomainDialect.nodes.semanticType, type: CType },
  custom: payload.struct({
    passing: payload.enum("value", "constPointer", "mutablePointer", "outPointer"),
    ownership: payload.enum("borrowed", "owned", "callerAllocated"),
    encoded: payload.boolean(), // true when the ABI type is the wire form
    codec: payload.optional(payload.ref(DomainDialect.nodes.serializer)),
  }),
});

// 4. Type-mapping morphism — domain semantic types become C ABI type refs.
//    The mapping considers both semantic meaning and representation:
//    Money + i64 storage -> int64_t, Email + text -> char*, Bool + bool -> bool.
const SemanticTypeToCType = defineMorphism({
  id: cId.morphism("semanticTypeToCType"),
  phase: MorphismPhase.lower,
  from: DomainDialect.patterns.semanticTypeWithRepresentation,
  to: { edges: [CSemanticTypeHasAbiType] },
  map: ({ match, patch, diagnostic }) => {
    const abi = mapSemanticTypeToCAbi({
      semantic: match.semanticType,
      storage: match.storageRepresentation,
      wire: match.wireRepresentation,
      serializer: match.serializer,
    });

    if (!abi) {
      diagnostic.error("c:unsupported-semantic-type", {
        subject: match.semanticType.ref,
        message: `No C ABI mapping for semantic type ${match.semanticType.name}`,
        hint: "Declare a representation/codec mapping or mark the operation unavailable for the C target.",
      });
      return [];
    }

    return [
      patch.addEdge(
        kernel
          .edge(CSemanticTypeHasAbiType)
          .from({
            semanticType: match.semanticType.ref,
            type: abi.type,
          })
          .custom({
            passing: abi.passing,
            ownership: abi.ownership,
            encoded: abi.encoded,
            codec: abi.codec?.ref,
          })
          .autoId(cId, match.semanticType, "abiType")
          .done(),
      ),
    ];
  },
});

// `mapSemanticTypeToCAbi` is a pure, testable table over typed facts:
//
//   money + i64 storage                       -> int64_t by value
//   email + text wire/storage                 -> const char* borrowed, encoded
//   uuid + string serializer                  -> const char* borrowed, encoded
//   uuid + fixed_bytes(16) storage            -> uint8_t[16] caller allocated
//   boolean + bool representation             -> bool by value
//   struct/entity value                       -> const Struct* borrowed
//
// If no entry matches, the morphism emits a typed diagnostic. Target
// portability depends on failed mappings being explicit.
type CAbiPlan = {
  type: KernelNodeRef<typeof CType>;
  passing: "value" | "constPointer" | "mutablePointer" | "outPointer";
  ownership: "borrowed" | "owned" | "callerAllocated";
  encoded: boolean;
  codec?: Serializer;
};

function mapSemanticTypeToCAbi(input: {
  semantic: SemanticType;
  storage: Representation;
  wire?: Representation;
  serializer?: Serializer;
}): CAbiPlan | undefined {
  /* ... */
}

const abiOf = (semanticType: SemanticType) =>
  kernel.lookup(CSemanticTypeHasAbiType, { semanticType: semanticType.ref }).one();
const abiTypeOf = (semanticType: SemanticType) => abiOf(semanticType).target("type");

function renderCParam(type: KernelNode<typeof CType>, param: KernelNode<typeof CParam>): string {
  if (param.custom.passing === "outPointer" && !type.custom.isPointer) {
    return `${type.custom.name}* ${param.custom.name}`;
  }
  return `${type.custom.name} ${param.custom.name}`;
}

// 5. Entity → C struct lowering — fields' types come from the registry,
//    not arbitrary strings, so cross-target consistency is enforced.
const EntityToCStruct = defineMorphism({
  id: cId.morphism("lowerEntityToCStruct"),
  phase: MorphismPhase.lower,
  from: DomainDialect.patterns.entityWithFields,
  to: { nodes: [CStruct, CField], edges: [CStructHasField, CFieldHasType] },
  map: ({ match, patch }) => [
    patch.addNode(CStruct, {
      id: cId.node(CStruct, match.entity.name),
      custom: { name: pascalCase(match.entity.name) },
    }),
    patch.addNode(CField, {
      id: cId.node(CField, `${match.entity.name}.${match.field.name}`),
      custom: { name: snakeCase(match.field.name) },
    }),
    patch.addEdge(
      kernel
        .edge(CStructHasField)
        .from({
          struct: cId.nodeRef(CStruct, match.entity.name),
          field: cId.nodeRef(CField, `${match.entity.name}.${match.field.name}`),
        })
        .autoId(cId, match.entity, match.field)
        .done(),
    ),
    patch.addEdge(
      kernel
        .edge(CFieldHasType)
        .from({
          field: cId.nodeRef(CField, `${match.entity.name}.${match.field.name}`),
          type: abiTypeOf(match.field.semanticType), // typed CType ref, not a string
        })
        .autoId(cId, match.field, "type")
        .done(),
    ),
  ],
});

// 6. Operation → C function lowering. Operations port too, not just data.
//    The keyed I/O record (§7.2) maps directly onto C parameters.
const OperationToCFunction = defineMorphism({
  id: cId.morphism("lowerOperationToCFunction"),
  phase: MorphismPhase.lower,
  from: DomainDialect.patterns.operationWithKeyedIO,
  to: { nodes: [CFunction, CParam], edges: [CFunctionHasParam, CParamHasType, CFunctionReturns] },
  map: ({ match, patch, emit }) => {
    const fn = patch.addNode(CFunction, {
      id: cId.node(CFunction, match.operation.name),
      custom: {
        name: snakeCase(match.operation.name),
        body: emit.functionBody(match.operation), // see §7 below
      },
    });

    // Inputs become parameters in declaration order. The ABI binding decides
    // whether the parameter is passed by value, as `const T*`, as `T*`, or as an
    // encoded wire value. Function-body lowering reads the same ABI binding to
    // insert decode calls when `encoded: true`.
    match.operation.input.forEach((slot, index) => {
      const abi = abiOf(slot.semanticType);
      emit.param(fn, slot.key, index, abi.target("type"), {
        passing: abi.custom.passing,
        ownership: abi.custom.ownership,
        decodeWith: abi.custom.encoded ? abi.custom.codec : undefined,
      });
    });

    // Single-key output becomes the return type; multi-key output becomes
    // an out-pointer + a final `int` status return. Encoded outputs are
    // produced through the declared codec rather than by formatting strings in
    // the emitter.
    const outputAbi = abiOf(match.operation.singleOutputType());
    emit.return(fn, outputAbi.target("type"), {
      passing: outputAbi.custom.passing,
      ownership: outputAbi.custom.ownership,
      encodeWith: outputAbi.custom.encoded ? outputAbi.custom.codec : undefined,
    });

    return fn;
  },
});

// 7. Precondition → assert lowering. §7.3 preconditions become asserts at
//    the top of the generated function body. The §23 verification story
//    means a `ProvedBySolver`-assured precondition can be elided here.
const PreconditionToCAssert = defineMorphism({
  id: cId.morphism("lowerPreconditionToCAssert"),
  phase: MorphismPhase.lower,
  from: DomainDialect.patterns.operationPreconditions,
  to: {
    /* augments the CFunction body produced by step 6 */
  },
  map: ({ match, append }) => {
    if (match.assurance.atLeast(ProvedBySolver)) return; // proof discharged it
    append(
      cId.nodeRef(CFunction, match.operation.name),
      `assert(${cExprOf(match.precondition.body)});`,
    );
  },
});

// 8. Emit — walk the C graph, write .h and .c text.
const EmitCSources = defineMorphism({
  id: cId.morphism("emitCSources"),
  phase: MorphismPhase.emit,
  reads: [
    CStruct,
    CField,
    CStructHasField,
    CFieldHasType,
    CFunction,
    CParam,
    CFunctionHasParam,
    CParamHasType,
    CFunctionReturns,
    CSemanticTypeHasAbiType,
  ],
  emit: ({ graph, write }) => {
    // Header file per struct: typedef + function prototypes.
    for (const struct of graph.nodes.ofKind(CStruct).toArray()) {
      const fields = graph.edges
        .ofKind(CStructHasField)
        .whereEndpoint("struct", struct.ref)
        .targets("field");
      const body = fields
        .map((f) => {
          const t = graph.edges
            .ofKind(CFieldHasType)
            .whereEndpoint("field", f.ref)
            .targets("type")[0];
          return `  ${t.custom.name} ${f.custom.name};`;
        })
        .join("\n");
      write(
        `include/${struct.custom.name}.h`,
        `typedef struct {\n${body}\n} ${struct.custom.name};\n`,
      );
    }

    // Source file per function: signature + body.
    for (const fn of graph.nodes.ofKind(CFunction).toArray()) {
      const retEdge = graph.edges
        .ofKind(CFunctionReturns)
        .whereEndpoint("function", fn.ref)
        .toArray()[0];
      const ret = retEdge.target("type");
      const params = graph.edges
        .ofKind(CFunctionHasParam)
        .whereEndpoint("function", fn.ref)
        .targets("param")
        .sort((a, b) => a.custom.index - b.custom.index)
        .map((p) => {
          const t = graph.edges
            .ofKind(CParamHasType)
            .whereEndpoint("param", p.ref)
            .targets("type")[0];
          return renderCParam(t, p);
        })
        .join(", ");
      write(
        `src/${fn.custom.name}.c`,
        `${ret.custom.name} ${fn.custom.name}(${params}) {\n${fn.custom.body}\n}\n`,
      );
    }
  },
});

// 9. Bundle into a dialect.
const CTarget = defineDialect({
  namespace: "c",
  dependsOn: [DomainDialect],
  nodes: { type: CType, struct: CStruct, field: CField, function: CFunction, param: CParam },
  edges: {
    structHasField: CStructHasField,
    fieldHasType: CFieldHasType,
    semanticTypeHasAbiType: CSemanticTypeHasAbiType,
    functionHasParam: CFunctionHasParam,
    paramHasType: CParamHasType,
    functionReturns: CFunctionReturns,
  },
  morphisms: {
    semanticTypeToCType: SemanticTypeToCType,
    entityToStruct: EntityToCStruct,
    operationToCFunction: OperationToCFunction,
    preconditionToCAssert: PreconditionToCAssert,
    emitC: EmitCSources,
  },
  pipelines: {
    emit: definePipeline(cId.pipeline("emit"), [
      SemanticTypeToCType,
      EntityToCStruct,
      OperationToCFunction,
      PreconditionToCAssert,
      EmitCSources,
    ]),
  },
});

// 10. Use it on the same graph as Altitude 2.
await app.emit(CTarget.pipelines.emit, { outDir: "generated/c" });
// → generated/c/include/Invoice.h
// → generated/c/include/Customer.h
// → generated/c/src/transfer_money.c   (with assert(amount > 0); from §7.3)
// → generated/c/src/issue_invoice.c    (consumes input — see CONSUMES_INPUT §7.1)
```

The same source `TransferMoney` operation that lowers to a Postgres
`UPDATE` and a TypeScript Effect program now also lowers to a C
function. The precondition `from.balance >= amount` becomes an
`assert(...)` (or is elided if a solver dialect from §23 has already
discharged it). The keyed I/O record becomes a parameter list. The
identity-flow laws (§7.1) determine whether the function takes a
pointer or returns a fresh value.

What this shows that the original sketch didn't:

- **Type and ABI vocabularies are graph facts**, not strings. `CBool`,
  `CInt32`, `CPointer(CChar)`, and `semanticTypeHasAbiType` are typed
  witnesses. A struct field's type is an edge to a `CType` node; a
  source semantic type has a reusable ABI binding with pass-by,
  ownership, and codec metadata.
- **Semantic meaning survives lowering.** `Email`, `UserId`, and
  `Money` do not collapse to `"string"` / `"number"` switches. The C
  dialect reads semantic type, storage representation, wire
  representation, brand, and serializer facts before deciding on
  `char*`, `uint8_t[16]`, `int64_t`, or a pointer to a generated struct.
- **Unsupported types produce diagnostics.** If a semantic type has no C
  ABI mapping, the lowering emits `c:unsupported-semantic-type` with a
  repair hint instead of guessing.
- **Codecs are boundary facts.** Encoded parameters and returns point to
  serializer/codec witnesses. Function-body lowering inserts encode or
  decode calls from graph facts instead of hand-formatting target code in
  the emitter.
- **Operations port too, not just data.** `OperationToCFunction`
  walks the `operationWithKeyedIO` pattern from the domain dialect
  and produces a `CFunction` plus `CParam` nodes per input key.
- **Predicates lower across targets.** Preconditions from §7.3
  become `assert(...)` in C; postconditions become test oracles;
  identity laws drive pointer-vs-value decisions. The same
  source-level claims drive every target's lowering.
- **The verification story crosses targets.** A precondition with
  `ProvedBySolver` assurance (§23) is elided from the C code — the
  proof discharges the runtime check. Without the proof, the assert
  ships.

What carries over from the kernel — for free, no extra code:

- `app.preview(CTarget.pipelines.emit).print()` shows every node/edge
  that would be added and every byte that would be written, before any
  file lands on disk;
- `app.explain("generated/c/src/transfer_money.c")` walks back from the
  artifact through `EmitCSources` → `OperationToCFunction` →
  `PreconditionToCAssert` → the source `TransferMoney` operation and
  its precondition;
- if `Account.balance` changes type, only the affected struct fields,
  function signatures, and asserts are re-emitted (incremental
  scheduling §20);
- if `mapSemanticTypeToCAbi` changes how `money` lowers, every
  dependent artifact is automatically marked stale;
- a second target (`WasmTarget`, `PostgresDialect`, …) emits from the
  same source graph without conflict — `TransferMoney` ships as
  `transfer_money.c` _and_ as a Postgres function _and_ as a TanstackQuery
  client binding from one source.

What this altitude **doesn't** give you for free: the application
semantics (rules, policies, optimistic UI, codecs) only translate to
C if you write the lowerings. Compiling business logic to a C runtime
is the canonical job; using Gen2 as a general C compiler framework
(kernels, parsers, firmware) is the wrong tool — see §22.4 for the
honest framing.

### Picking An Altitude

| You want                                               | Author at altitude |
| ------------------------------------------------------ | ------------------ |
| Working SaaS app in minutes, default stack             | 1 (recipe)         |
| Custom rules, multiple targets, full type inference    | 2 (composed)       |
| New target dialect (C, WebAssembly, GraphQL, DuckDB)   | 3 (raw IR)         |
| Plugin that adds vocabulary to an existing dialect     | 3 (raw IR)         |
| Tooling that introspects the graph (lints, dashboards) | 3 (raw IR)         |

The rest of this guide is altitude 2 in the body and altitude 3 in
the asides — once you understand the IR, recipes are just preset
authors of it.

## 4. Nodes And Edges

Everything durable starts as a typed node or edge.

A node is a thing with identity:

- entity;
- field;
- rule;
- action;
- query;
- policy;
- route;
- component;
- table;
- migration;
- provider;
- deployment resource.

An edge is a durable relationship:

- entity owns field;
- field has semantic type;
- action writes field;
- rule reads field;
- policy guards action;
- query uses key;
- table has column;
- route renders component.

Design-target API. Internal identity is **always a branded witness**, never
a string literal. Authors call a namespaced ID factory; the factory
encodes namespace + kind + name in the type:

```ts
const billingId = id.createFactory("billing");
//   ^? IdFactory<"billing">

const InvoiceNode = defineNodeKind({
  id: billingId.nodeKind("invoice"),
  //  ^? NamespacedKernelId<"node.kind", "billing", InvoiceNode, "invoice">
  name: "Invoice", // display name only
  custom: payload.struct({
    status: payload.literal("draft", "issued", "paid"),
  }),
});

const InvoiceChargesCustomer = defineEdgeKind({
  id: billingId.edgeKind("invoiceChargesCustomer"),
  endpoints: {
    invoice: InvoiceNode,
    customer: DomainDialect.nodes.entity,
  },
  custom: payload.struct({
    source: payload.literal("contract", "manual"),
  }),
});
```

`InvoiceNode` and `InvoiceChargesCustomer` are typed witnesses. Every
downstream API infers from those values — no string lookups, no casts.

**Constructing instances of a kind.** The default DX is the curried
`kernel.edge(kind)` builder, which binds the edge-kind witness first so
endpoint keys, target node-kind constraints, custom payload, provenance,
and branded edge-ID type all infer from one source:

```ts
patch.addNode(InvoiceNode, {
  id: billingId.node(InvoiceNode, "inv-001"),
  name: "Invoice", // display only
  custom: { status: "issued" },
});

patch.addEdge(
  kernel
    .edge(InvoiceChargesCustomer)
    .from({ invoice, customer })
    .autoId(billingId, invoice, customer)
    .metadata({ custom: { source: "contract" } })
    .done(),
);
```

`autoId(factory, ...parts)` builds a deterministic, namespace-branded
edge id from the endpoint refs — authors never hand-assemble id strings.
Raw strings only enter through `.parseId(...)` (returns a result with
diagnostics) or `.unsafeId(...)` (assertion form, tests/importers only).

For type-only payloads where no runtime parser is needed, use the fluent
type witness helper:

```ts
const InvoiceNode = defineNodeKind({
  id: billingId.nodeKind("invoice"),
  name: "Invoice",
}).custom<{
  readonly status: "draft" | "issued" | "paid";
}>();
```

Public kind definitions must never require
`undefined as unknown as T`. Node, edge, diagnostic, artifact, and
metadata payloads are declared with schema/payload witnesses, or with a
fluent `.custom<T>()` helper when the payload is type-only. Cast-based
phantom values are internal implementation details only.

### 4.1 Endpoint type safety

Edge kinds carry richer endpoint constraints than the inline form
above shows. The full `EndpointTarget` shape (`src/kernel/ods.ts:18`)
is:

```ts
interface EndpointTarget {
  readonly targetKinds?: readonly NodeKindDef[]; // which node kinds may occupy this end
  readonly requiresTraits?: readonly TraitDef[]; // traits the endpoint node MUST carry
  readonly excludesTraits?: readonly TraitDef[]; // traits the endpoint node must NOT carry
}
```

So a constrained edge looks like:

```ts
const PaymentSettlesInvoice = defineEdgeKind({
  id: billingId.edgeKind("paymentSettlesInvoice"),
  endpoints: {
    payment: defineEndpointRole("payment", {
      targetKinds: [PaymentNode],
      requiresTraits: [Settled], // payment node must be Settled
      excludesTraits: [Refunded], // and not Refunded
    }),
    invoice: defineEndpointRole("invoice", {
      targetKinds: [InvoiceNode],
      requiresTraits: [Issued],
    }),
  },
  custom: payload.struct({
    settledAt: payload.timestamp(),
    method: payload.literal("ach", "card", "wire"),
  }),
  traits: [DeterministicLowering], // traits on the edge KIND itself
});
```

**What is enforced at the TypeScript level**

| Constraint                                                   | Where                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Endpoint **node kind** (`targetKinds`)                       | `EndpointInputForRole<Role>` narrows to `KernelNodeRef<…>`                            |
| Endpoint **trait set** (`requiresTraits` / `excludesTraits`) | Phantom `Traits` on `KernelNodeRef` enforces `Has<…>` / `Without<…>` at the call site |
| Endpoint **predicate** (refined `targetKinds`)               | The endpoint's predicate body becomes a discharge obligation at the call site         |
| Endpoint **key names**                                       | `EndpointInputsFor<Kind>` requires every named role as a key                          |
| Endpoint **role names** in match output                      | `EndpointOutputsFor<Kind>` preserves them as keyed properties                         |
| Edge **custom payload** type                                 | `EdgeCustomOf<Kind>` extracts the schema; `metadata()` checks                         |
| Edge **ID** namespace + kind brand                           | `NamespacedKernelId<"edge", Namespace, Kind, …>` survives                             |
| Builder **step ordering**                                    | `from() → id()/autoId() → metadata() → done()` curried steps                          |

This means:

```ts
kernel
  .edge(PaymentSettlesInvoice)
  .from({
    payment: invoiceRef, // ← TS error: KernelNodeRef<Invoice> not assignable
    //              to KernelNodeRef<Payment>
    invoice: invoiceRef,
  })
  .autoId(billingId, paymentRef, invoiceRef)
  .metadata({ custom: { settledAt: t, method: "ach" } })
  .done();
```

Wrong node kind in `payment`, missing key, misspelled key, or wrong
`custom` shape — all are TS errors, not runtime errors. Inference
flows from `kind` through every subsequent step via `NoInfer<Kind>`
so the user never writes generic args. Match-side inference is
symmetric — `match.write.action` is narrowed to the action node-kind
because `EndpointOutputsFor` reads the role names off the edge-kind
witness.

**Trait and predicate constraints are also compile-time enforced.**
`requiresTraits` and `excludesTraits` are lifted into the ref's type
via a phantom trait-set parameter:

```ts
KernelNodeRef<NodeKind, Traits = TraitSet>
```

`Subject.where(predicate)` upgrades the trait set:

```ts
const issuedInvoice: KernelNodeRef<InvoiceNode, Has<Issued>> = invoiceRef.where(Issued);
```

So the wrong-trait endpoint case fails at the call site, with a
typed diagnostic suggesting the discharge:

```ts
kernel
  .edge(PaymentSettlesInvoice)
  .from({
    invoice: draftInvoice,   // ← TS error: KernelNodeRef<Invoice, Has<Draft>>
                             //   not assignable to KernelNodeRef<Invoice, Has<Issued>>.
                             //   Did you mean `draftInvoice.where(Issued)` after issuing?
    payment: settledPayment,
  })
  .autoId(...)
  .done();
```

Refined-type endpoints take this further — `targetKinds` accepts
not just `NodeKindDef[]` but `RefinedNodeKindDef[]`:

```ts
endpoints: {
  invoice: defineEndpointRole("invoice", {
    targetKinds: [Invoice.where(canBeSettled)], // full predicate body, not just a marker
  }),
}
```

The endpoint constraint becomes a complete boolean claim. The
verifier already has the predicate-evaluation machinery from rules;
this is the same evaluation lifted to a type-system input position.

**What the runtime verifier still owns.** The runtime verifier
remains the safety net for refs that come from outside the type
system: importers, plugin dialects loaded after build time, AI-edit
patches reconstituted from JSON, and parsed graph snapshots. The
typed `ref.parse.node(...)` / `ref.unsafe.node(...)` widener is the
explicit boundary — anything that crosses it gets a runtime check.
Compile-time enforcement is the authoring DX; runtime verification
is the trust boundary for dynamic input.

### Relation accessors on node kinds

The graph storage is edge-shaped, but authoring a node kind is more
ergonomic when "this node has these named, typed, cardinality-aware
relations to those nodes" is declared in one place. `defineNodeKind(...)
.relations({...})` is a **typed view over existing edge kinds** — not a
new IR primitive. Edges are still the durable fact; relations are the
typed accessor schema.

```ts
const InvoiceNode = defineNodeKind({
  id: billingId.nodeKind("invoice"),
  custom: payload.struct({ status: payload.literal("draft", "issued", "paid") }),
}).relations({
  customer: hasOne(CustomerNode, { via: InvoicePaidByCustomerEdge }),
  lines: hasMany(InvoiceLineNode, { via: InvoiceHasLineEdge, min: 1 }),
  payments: hasMany(PaymentNode, { via: PaymentSettlesInvoiceEdge }).order(
    PaymentNode.fields.settledAt,
    "desc",
  ),
  parent: belongsTo(InvoiceNode, { via: InvoiceParentEdge }).optional(),
  derivedFrom: hasZeroOrOne(QuoteNode, { via: InvoiceDerivedFromQuoteEdge }),
});
```

The factory family is curried so the target node kind narrows the
option shape:

```ts
hasOne(Target, opts?)            // exactly 1; .optional() -> 0..1
hasZeroOrOne(Target, opts?)      // 0..1 explicit
hasMany(Target, opts?)           // 0..N; { min: 1 } -> 1..N
hasRange(Target, { min, max })   // exact range
belongsTo(Target, opts?)         // exactly 1 (FK semantics; alias of hasOne with hints)
```

Each factory returns a `RelationWitness<...>` that preserves source
kind, target kind, cardinality, `via` edge kind, endpoint role, order,
uniqueness, and required-ness in `$infer`. When `via` has unambiguous
endpoints (one node-kind per side, matching source/target) the
`endpoint` argument can be omitted; the kernel resolves it. Ambiguous
edges (e.g. `InvoiceParentEdge` connecting Invoice -> Invoice) require
an explicit endpoint selector:

```ts
hasOne(CustomerNode, { via: InvoicePaidByCustomerEdge, endpoint: "customer" });
hasOne(CustomerNode, { via: InvoicePaidByCustomerEdge, endpoint: (e) => e.customer });
```

**Auto-derived inverse accessors.** Declaring `Invoice.relations.lines`
auto-registers the inverse on `InvoiceLineNode` — it gains
`.related.invoice` (typed `KernelNodeRef<Invoice>`) without an explicit
declaration. The inverse cardinality is the dual: `hasMany <-> belongsTo`,
`hasOne <-> hasMany`. The declaring side owns the relation; authors can
override the dual cardinality on the target node if it differs.

**Runtime accessors.** Given a `KernelNode<InvoiceNode>` instance, the
relation schema is exposed directly:

```ts
invoiceNode.related.customer(); // KernelNodeRef<Customer>     (exactly 1)
invoiceNode.related.lines(); // KernelNodeRef<InvoiceLine>[] (1+)
invoiceNode.related.payments(); // KernelNodeRef<Payment>[]    (0+; ordered by settledAt desc)
invoiceNode.related.parent(); // KernelNodeRef<Invoice> | undefined
```

Cardinality bounds flow into the return type — `lines()` returns
`[Line, ...Line[]]` (non-empty tuple) when `min: 1`. Accessors walk the
edge index — no whole-graph scans — and cache per node where
memoization is wired.

**What this buys.**

1. **Free verifiers.** The kernel auto-checks "every Invoice has 1+
   lines" without each dialect writing the verifier. Diagnostics
   reference the relation witness by id with a structured remediation.
2. **Pattern shortcuts.** `pattern.from(Invoice).relation("lines")` is
   typed; the binding is `KernelNodeRef<InvoiceLine>[]`.
3. **Precise surface inputs.**
   `defineLoweringSurface.consumes({ subjects: [Invoice], relations: [Invoice.relations.customer] })`
   gates a surface on a specific relation being present.
4. **Refinement composition.**
   `Invoice.where(inv => inv.related.lines().every(l => l.field.status.eq("settled")))` —
   relations participate in refinement bodies as typed sources.
5. **Deterministic storage lowering.** Postgres emitters read
   `belongsTo` relations and emit foreign keys; `hasMany` becomes the
   inverse index. JSON-render emitters read cardinality to pick array
   vs scalar shape.
6. **Incremental invalidation precision.** A mutation that writes
   `Invoice.lines` invalidates exactly the resources whose patterns
   include `Invoice.relations.lines`.
7. **Self-documenting.** `app.explain(InvoiceNode)` walks `.relations`
   and prints the schema. `appGraph.inspect()` surfaces relation
   cardinality on the entity graph view.

**Relationship to the domain `Relation` primitive.** The domain
dialect's `Relation` (one_to_one / one_to_many / many_to_many,
integrity modes, FK behavior, cascade rules) **stays**. It is a
specialization of node relations for entity-entity links — it carries
extra payload (integrity, deletion behavior) that doesn't apply to
generic node-kind relations. Domain `Relation` can be expressed in
terms of `.relations({...})` plus the integrity/FK payload, but
doesn't have to be rewritten. They coexist: the general slot is more
general, the domain `Relation` is more specific.

**Type-level guarantees.** A relation witness preserves in `$infer`:
the source node-kind witness, target node-kind witness, cardinality
witness, `via` edge-kind witness, selected endpoint role, `required`
literal, order/uniqueness witnesses when set, and a back-reference to
the source `NodeKindDef` so cross-relation dependencies stay typed.

Relations are additive and optional. Existing dialects whose node
kinds don't declare `.relations({...})` keep working — verifiers don't
fire when no relation schema is present.

## 5. Creating Your Own Dialect

A dialect is the unit of semantic ownership.

It owns:

- node kinds;
- edge kinds;
- traits;
- patterns;
- projections;
- morphisms;
- diagnostics;
- repair options;
- lowerings;
- emitters;
- pipelines;
- capabilities;
- laws;
- artifact kinds;
- performance boundaries.

Design-target API:

```ts
const BillingDialect = defineDialect({
  namespace: "billing",
  dependsOn: [DomainDialect],

  nodes: {
    invoice: InvoiceNode,
    payment: PaymentNode,
  },

  edges: {
    invoiceChargesCustomer: InvoiceChargesCustomer,
    paymentSettlesInvoice: PaymentSettlesInvoice,
  },

  morphisms: {
    // declared object — keys are friendly accessors. Each value is a
    // morphism witness from defineMorphism({...}). See §14.
    invoiceToBillingDoc: InvoiceToBillingDoc, // phase: lower
    emitBillingPdf: EmitBillingPdf, // phase: emit
  },

  capabilities: [CanEmitBillingDocs],

  // pipelines, surfaces, and emit-phase morphism shortcuts are *derived*
  // from `morphisms` — there is no parallel field for them on the dialect.
});
```

The dialect value is the main type witness, and it auto-wires its own
ID/ref factories from the namespace literal:

```ts
BillingDialect.nodes.invoice; // typed node-kind witness
BillingDialect.edges.invoiceChargesCustomer; // typed edge-kind witness
BillingDialect.morphisms.invoiceToBillingDoc; // typed morphism witness
BillingDialect.surfaces.billingExport; // *derived* from morphism surfaces
BillingDialect.emitters.emitBillingPdf; // *derived* — morphisms whose phase is `emit`

BillingDialect.id.node(BillingDialect.nodes.invoice, "inv-001");
//                ^? NamespacedKernelId<"node", "billing", InvoiceNode, "inv-001">
BillingDialect.id.nodeRef(BillingDialect.nodes.invoice, "inv-001");
//                ^? KernelNodeRef<InvoiceNode> branded with "billing"

BillingDialect.$infer.nodes;
BillingDialect.$infer.edges;
BillingDialect.$infer.surfaces; // typed union of surface ids
BillingDialect.$infer.emitters; // typed union of emit-phase morphism ids
```

ID factories expose **paired ID and ref constructors** at every shape
— `cId.node(K, n)` returns the branded ID, `cId.nodeRef(K, n)` returns
the typed ref. Same for `.edge(K, ...)` / `.edgeRef(K, ...)`. Authors
never need a separate `ref.*` import on the common path; the standalone
`ref.parse.*` namespace exists only for parsing dynamic input.

`Dialect.id` / `Dialect.id.nodeRef` replace hand-rolled
`id.createFactory` calls — authors never repeat the namespace literal,
and refs are branded with the dialect identity so cross-dialect mixups
fail at the type level.

Object keys (not arrays) are intentional. They give friendly accessors,
readable editor types, and stable inference. Avoid public dialect
arrays when object keys can carry the names.

Dialect dependency rules:

```txt
A dialect may read facts from itself and declared dependencies.
A dialect may emit facts it owns.
A dialect may emit facts owned by another dialect only when that output
is declared explicitly.
```

This keeps dialect interaction flexible but safe.

## 6. Semantic Types

Semantic types are the value-meaning layer of Gen2. The ultimate design
rule is:

> A semantic type is a typed handle to meaning that lowers into graph
> facts.

That sentence carries the whole feature:

- **typed handle** — authoring APIs infer ordinary TypeScript values from
  the semantic witness;
- **meaning** — Gen2 preserves domain distinctions that TypeScript erases;
- **graph facts** — validators, representations, codecs, brands,
  compatibility rules, laws, traits, and target lowerings are inspectable
  nodes/edges, not opaque metadata.

Plain TypeScript can say that `email`, `uuid`, `url`, and `displayName`
are all `string`. Gen2 needs to preserve the difference because targets,
rules, forms, serializers, storage adapters, and diagnostics depend on
meaning that TypeScript erases.

A normal code generator sees:

```txt
email: string
id: string
balance: bigint
```

Gen2 should see:

```txt
email is Email
id is UserId
UserId brands uuid
balance is Money
Money has arithmetic laws
Email has validation and display behavior
UserId has storage/wire codecs
```

That semantic layer is what lets one source graph derive database schema,
API contracts, forms, validation, UI widgets, auth checks, expression
compatibility, migrations, sync/merge plans, target-specific code,
diagnostics, and repair patches.

```txt
TypeScript type     says what the author can pass at compile time
SemanticType        says what the value means in the application
Representation      says how the value is laid out in storage or on the wire
Serializer/Codec    says how to convert between semantic and wire/storage forms
Trait/Predicate     says what claims or restrictions apply to the value
Law/MergeStrategy   says how the value behaves under transforms or conflicts
Implementation      says how a target realizes the value
```

Examples:

```txt
uuid      -> TypeScript string, semantic identity value, fixed_bytes(16) storage
email     -> TypeScript string, semantic contact address, text storage, email validation
money     -> TypeScript bigint/decimal, semantic currency amount, i64/decimal storage
datetime  -> TypeScript Date, semantic instant, i64 or ISO string wire form
status    -> TypeScript string union, semantic enum, transition/rule surface
```

The current implementation exposes this as `SemanticType<T>`:

```ts
const Uuid = gen.types.uuid(); // SemanticType<string>
const Email = gen.types.email(); // SemanticType<string>
const Money = gen.types.money(); // SemanticType<bigint>
const Active = gen.types.boolean(); // SemanticType<boolean>
```

Those helpers are not meant to be permanent bags of metadata. In the end
state, each helper is a compact authoring form for a small semantic
subgraph:

```txt
node Type Email
edge TypeHasStorageRepresentation Email -> text
edge TypeHasValidator Email -> EmailValidator
edge FieldHasType User.email -> Email
edge SerializerConverts Email -> JsonString
edge TypeLowerableTo Email -> C.charPointer
```

The generic parameter is a phantom TypeScript value type. It is how
authoring APIs infer normal values without users writing type arguments:

```ts
const User = gen.entity("User", {
  id: gen.types.uuid(),
  email: gen.types.email(),
  age: gen.types.int(),
});

User.fields.id; // Field<string>, semantically uuid
User.fields.email; // Field<string>, semantically email
User.fields.age; // Field<number>, semantically int
User.$infer.value; // { id: string; email: string; age: number }
```

The important detail is that `id` and `email` are both strings to
TypeScript, but they are not the same semantic type to Gen2. That
difference can drive:

- validation and generated schemas;
- form widget selection;
- database column and wire-format lowering;
- serializer/deserializer requirements;
- field compatibility checks in expressions, relations, queries, and actions;
- privacy, placement, and client-exposure diagnostics;
- merge/offline/conflict planning;
- target lowerability diagnostics.

### 6.1 Meaning vs representation

Do not confuse semantic meaning with physical layout.

```txt
email  = semantic type
text   = representation

uuid           = semantic type
fixed_bytes(16) = representation

money = semantic type
i64   = one possible representation, often cents
```

This separation is what lets the same app graph lower to Postgres,
OpenAPI, C, JSON, WebAssembly, or another target without rewriting the
source model. A target asks: "Given this semantic type, this storage
representation, and this wire/codec surface, what can I emit?"

For example, a C target might lower:

```txt
email + text representation        -> char*
uuid + fixed_bytes(16) storage     -> uint8_t[16] or const char* via codec
money + i64 storage                -> int64_t
boolean + bool representation      -> bool
entity struct                      -> pointer to generated C struct
```

That is why §3.3 records a `semanticTypeHasAbiType` edge instead of
letting every C morphism independently switch on strings.

### 6.2 Authoring semantic types

Simple authoring should feel like this:

```ts
const Types = defineTypeRegistry({
  uuid: semantic.uuid(),
  text: semantic.string(),
  money: semantic.decimal().brand("Money"),
  email: semantic.string().brand("Email").trait(ClientSafe),
});

const Customer = gen.entity("Customer", (t) => ({
  id: t.uuid(),
  email: t.email(),
  displayName: t.text(),
}));
```

Current Gen2 also supports direct constructors:

```ts
const Role = gen.types.enumOf("Role", ["admin", "user", "guest"]);
const Tags = gen.types.array(gen.types.string());
const LoginInput = gen.types.object({
  email: gen.types.email(),
  password: gen.types.string(),
});

const Percentage = gen.types.custom<number>({
  name: "Percentage",
  kind: "numeric",
  ts_type_name: "number",
  storage_repr: gen.types.repr.f64(),
  validate: (value): value is number => typeof value === "number" && value >= 0 && value <= 100,
});
```

`gen.types.object(...)` is useful for callable input/output surfaces.
It infers the TypeScript object shape from the semantic fields:

```ts
const CreateInvoiceInput = gen.types.object({
  customerId: gen.types.uuid(),
  total: gen.types.money(),
});

// SemanticType<{ customerId: string; total: bigint }>
```

For richer domain vocabularies, prefer a builder that keeps the decoded
type, representation, codec, traits, and laws connected:

```ts
const Email = gen.types
  .define("Email")
  .decoded<string>()
  .kind("email")
  .storage(gen.types.repr.text())
  .validator(isEmail)
  .done();

const UserId = gen.types
  .define("UserId")
  .decoded<string>()
  .brands(gen.types.uuid())
  .storage(gen.types.repr.fixedBytes(16))
  .wire(gen.types.string())
  .codec(uuidStringCodec)
  .done();
```

The builder is the canonical shape. Short helpers like `gen.types.email()`
and compatibility helpers like `gen.types.custom(...)` should normalize to
the same definition internally. That keeps simple code simple while making
custom types inspectable by passes and targets.

Expected domain failures are types too. Prefer a first-class result type
when failure is normal control flow. Error cases should be defined as
typed witnesses, then instantiated at the call site — no magic strings
outside the definition boundary:

```ts
const MoneyErrors = gen.errors.catalog(moneyId.errorCatalog("money"), {
  divideByZero: gen.errors.case(moneyId.error("divideByZero"), {
    type: moneyId.errorType("divide-by-zero"),
    code: moneyId.errorCode("divide_by_zero"),
    title: "Cannot divide by zero",
    detail: ({ right }) => `Expected non-zero denominator, got ${right}.`,
    fields: {
      right: gen.types.money(),
    },
  }),
});

const DivideMoneyResult = gen.types.result({
  ok: gen.types.money(),
  error: MoneyErrors,
});
```

`gen.types.result(...)` is sugar over a tagged semantic type:

```txt
Result<Ok, Err> =
  | { tag: "ok"; value: Ok }
  | { tag: "err"; error: ErrorInstance<Err> }
```

Every error instance uses the same shared problem envelope that
diagnostics should use. This is not a second diagnostics system; it is a
small common shape for "something reportable happened":

```txt
type      stable documentation/type URI or typed error ref
title     stable human title
code      stable machine code, derived from the error witness
detail    occurrence-specific explanation
instance  occurrence/ref id for this error event
```

The error side can be a catalog of named cases, each with typed fields:

```ts
const MoneyErrors = gen.errors.catalog(moneyId.errorCatalog("money"), {
  divideByZero: gen.errors.case(moneyId.error("divideByZero"), {
    type: moneyId.errorType("divide-by-zero"),
    code: moneyId.errorCode("divide_by_zero"),
    title: "Cannot divide by zero",
    fields: { right: gen.types.money() },
  }),
  precisionLoss: gen.errors.case(moneyId.error("precisionLoss"), {
    type: moneyId.errorType("precision-loss"),
    code: moneyId.errorCode("precision_loss"),
    title: "Precision would be lost",
    fields: { maxScale: gen.types.int() },
  }),
});
```

Those cases are graph facts. Targets can lower them to OpenAPI
responses, Effect errors, HTTP status mappings, form messages, telemetry
labels, generated clients, and test cases.

The definition/instance split mirrors diagnostics:

```txt
ErrorDef       reusable domain/runtime error family
ErrorInstance  concrete value returned through Result.err
DiagnosticDef  reusable compiler diagnostic family
DiagnosticFinding concrete compiler finding
```

Both instances share `type/title/code/detail/instance`; only diagnostics
carry compiler-only fields like severity, invariant evidence, source
locations, suggested code fixes, and graph repairs.

A domain application should usually collect these in a registry:

```ts
const Types = gen.types.registry({
  UserId,
  Email,
  Money: gen.types.money(),
});

const entity = gen.entity.using(Types);

const User = entity("User", (t) => ({
  id: t.UserId(),
  email: t.Email(),
}));
```

The registry becomes the app's domain vocabulary. It keeps field
declarations short, preserves literal field names, and prevents a codebase
from scattering slightly different definitions of the same concept.

Collection-like types also carry graph-visible cardinality, iterability,
and order facts:

```ts
const InvoiceList = Types.array(Invoice, {
  cardinality: Cardinality.many(),
  iterable: Iterable.sync(),
  order: Order.by(Invoice.fields.createdAt, "desc"),
});

const OptionalInvoice = Types.option(Invoice, {
  cardinality: Cardinality.zeroOrOne(),
});

const InvoiceSet = Types.set(Invoice, {
  cardinality: Cardinality.many(),
  uniqueness: Uniqueness.by(Invoice.fields.id),
  order: Order.none(),
});
```

These are not display hints. They are facts used by operation planning,
query lowering, pagination, streaming, UI list generation, and target
diagnostics.

### 6.3 Entities and field witnesses

An entity is not itself "just" a type. It is an identity-bearing domain
record whose fields carry semantic types:

```ts
Customer.name; // "Customer"
Customer.fields.email; // Field witness
Customer.$infer.value; // inferred value shape
Customer.fragment; // graph facts
```

The design principle comes from the TypeScript inference guide:

> Create typed values first. Then let every API infer from those values.

Users should not write:

```ts
query<CustomerRow, CustomerId>("Customer");
```

They should pass the witness:

```ts
query.from(Customer);
```

For APIs that need an inline value type rather than an entity witness,
the current bridge can synthesize a struct-shaped semantic type from an
entity. The final design should make those witnesses explicit instead:

```ts
User.entity; // identity-bearing graph subject
User.type; // value shape for a full row/document
User.inputType("create"); // input shape for a creation boundary
User.projection("public"); // named projection with privacy/codec facts
```

### 6.4 Compatibility and functions

Semantic type safety is not just field inference. Operations,
expressions, queries, actions, and target dialects should all use the
same compatibility facts.

```ts
const CreateUserInput = gen.types.object({
  email: Types.Email(),
});

const createUser = gen.func.action({
  name: "createUser",
  input_type: CreateUserInput,
  returns: User,
});

type CreateUserIn = InferFunctionInput<typeof createUser>;
// { email: string }

type CreateUserOut = InferFunctionOutput<typeof createUser>;
// InferEntity<typeof User>
```

The value type flows through the function surface, but Gen2 still knows
the input field is semantically an email. That lets API clients, forms,
validators, docs, and target emitters derive behavior from the same
source fact.

Compatibility rules should be explicit:

```txt
Email can display as string through a declared wire/display boundary.
UserId and OrderId may both wrap uuid, but they are not interchangeable.
Money can add Money, but Money plus int is a diagnostic unless a conversion exists.
Status compares with Status; string comparison requires an explicit boundary.
```

The same rules drive expression checks:

```ts
expr.eq(User.fields.email, User.fields.id); // diagnostic: email vs uuid
expr.eq(User.fields.id, Session.fields.userId); // ok when both are UserId
```

and target lowerability:

```txt
Email + text representation + C string codec -> char*
UserId + fixed_bytes(16) storage             -> uint8_t[16] or codec-selected char*
Money + i64 storage                          -> int64_t
```

The dialect should read graph facts like `TypeHasStorageRepresentation`,
`TypeHasWireRepresentation`, `TypeBrands`, and `TypeHasCodec`. It should
not guess from `type.name === "money"` unless it is at a dynamic import
boundary that immediately refines the string into a typed witness.

### 6.5 Where the plan is going

Today, `SemanticType<T>` is intentionally practical but too monolithic:
it can carry name, kind, decoded TypeScript type, storage representation,
wire representation, serializer flags, validators, traits, server-only
metadata, enum values, and merge strategy in one object.

The target design in `PLAN.md` splits that into graph-visible layers:

```txt
Representation  -> physical/wire layout
SemanticType    -> domain meaning + decoded TS type
Serializer      -> conversion between semantic/storage/wire forms
Transform       -> codecs, brands, refinements
Operation       -> typed computation over semantic types
Expr            -> operation application tree
Trait           -> semantic claim attached to a graph object
Law             -> behavioral claim about an operation
Implementation  -> target-specific realization
```

That split matters because many facts are not really properties of the
type itself. A value type is rarely inherently server-only; a field,
projection, provider, or usage may be server-only. A serializer is not a
boolean flag; it is a graph fact with source type, wire type,
requirements, errors, laws, and implementations. A brand like `UserId`
should be an explicit type relation, not an opaque naming convention.

The authoring surface can stay ergonomic:

```ts
gen.types.email();
gen.types.money();
gen.types.brand("UserId", gen.types.uuid());
gen.types.define("Percentage").decoded<number>().storage(gen.types.repr.f64()).done();
```

but those helpers should lower to separate, inspectable graph facts. The
rule is the same as the rest of the kernel: if another pass needs to
verify it, explain it, lower it, repair it, or diff it, make it graph
data.

## 7. Operations And Laws

Operations are typed computations over semantic types.

An operation should declare:

- input types;
- output type;
- effects;
- requirements;
- lowerings;
- laws;
- assurance levels.

Operations are graph nodes (PLAN §B2) — their identity goes through the
same namespaced ID factory as everything else.

The authoring form is a **builder with a self-binding callback** for
laws. The object form (`{ id, input, output, laws: [Laws.assoc(Op), ...]
}`) is rejected at design time because it requires `Op` to be in scope
before the binding completes — a classic JS / TS temporal-deadzone
pitfall (`Block-scoped variable 'AddMoney' used before its declaration`).
The builder threads `self` into a callback so the witness is fully
constructed before laws reference it:

```ts
const moneyId = id.createFactory("money");

const AddMoney = defineOperation(moneyId.op("add"))
  .input({ a: Types.money, b: Types.money })
  .output({ sum: Types.money })
  .laws((self) => [
    Laws.associative(self).withAssurance(ByConstruction),
    Laws.commutative(self).withAssurance(ByConstruction),
    Laws.identity(self, "0.00").withAssurance(Tested),
  ])
  .lowersTo([PostgresDialect.operations.addNumeric, TsDialect.operations.addDecimal]);
```

`Laws.*` factories take the operation witness directly; assurance is
attached via `.withAssurance(kind)` where the kind is itself a typed
edge-kind node (`Asserted | Tested | Derived | ProvedBySolver |
ByConstruction | ...`) registered through `defineAssuranceKind`.

Common law bundles compose under the same callback:

```ts
const AddMoney = defineOperation(moneyId.op("add"))
  .input({ a: Types.money, b: Types.money })
  .output({ sum: Types.money })
  .laws((self) =>
    Laws.all(
      Laws.commutativeMonoid(self, "0.00").withAssurance(ByConstruction),
      Laws.deterministic(self).withAssurance(ByConstruction),
    ),
  );
```

Each builder step returns a typed witness that narrows the next step's
input — `.laws((self) => ...)` already knows `self`'s input/output
record types, so wrong-arity bundles like `Laws.associative` over a
non-binary op fail at the callback boundary, not at runtime.

Laws are not documentation. They drive planning.

```txt
Associative + Commutative -> parallel aggregate
Idempotent + Deterministic -> safe retry
Patchable + Invertible -> exact optimistic rollback
Monotonic -> IVM eligible
LowerableToSql -> SQL predicate / RLS
```

This is why rules, optimistic UI, sync, merge, and target lowering all
depend on operation fidelity.

> Laws are predicates with operation subjects. They share the same IR
> as traits (markers on any subject) and rules (predicates on entities).
> See §10 for the unified picture.

Collection operations are typically generic over the element type.
The kernel exposes them as **operation factories** that monomorphize
at definition time — pass the element-type witness once, get a
concrete operation back:

```ts
const FilterInvoices = collectionOps
  .filter(Invoice) // monomorphizes element type to Invoice
  .laws((self) =>
    Laws.all(
      Laws.preservesOrder(self),
      Laws.cardinalityLeInput(self, { of: "source" }),
      Laws.preservesElementType(self),
    ),
  );

const SortInvoicesByCreated = collectionOps
  .sortBy(Invoice, Invoice.fields.createdAt)
  .laws((self) =>
    Laws.all(
      Laws.preservesCardinality(self),
      Laws.imposesOrderFromInput(self, { from: "order" }),
      Laws.stableSort(self).withAssurance(Tested),
    ),
  );
```

Under the hood, `collectionOps.filter(Invoice)` is sugar for
`defineOperation(collectionId.op("filter:Invoice")).input({ source:
Types.collection(Invoice), predicate: Predicate(Invoice) }).output({
filtered: Types.collection(Invoice) })`. The factory derives a
stable per-element id so the meta graph sees one op per
monomorphization, not one giant generic.

Common transformations should infer precise facts:

```txt
map      -> preserves cardinality, may preserve order
filter   -> cardinality <= input, preserves order
sort     -> preserves cardinality, imposes order
groupBy  -> cardinality <= input, produces keyed collection
distinct -> cardinality <= input, ensures uniqueness
take(n)  -> cardinality <= n, preserves order
exists   -> collection -> boolean
forall   -> collection -> boolean
first    -> many -> zero_or_one; requires order or marks arbitrary choice
reduce   -> many -> one if nonempty or if identity exists
```

### 7.1 Identity And Ownership Laws

The standard laws describe what an operation _does to its inputs_
(`Associative`, `Idempotent`, `Deterministic`, `Reversible`). They do
not describe what it _owns_. For most operations that's fine — pure
ops take semantic values (`Money`, `Email`), and values have no
identity, so consume / borrow / return-same don't apply. Side effects
on entities go through actions, which already carry typed
`ActionWritesField` / `ActionReadsField` edges (see §10's marker-edge
table) — that is the existing ownership story for entity-level
mutation.

The case that falls between the two tracks is operations that take a
ref and return a ref. `(c: Ref<Customer>) → Ref<Customer>` could
return the same identity (in-place transform), a different existing
one (lookup), or a fresh one (allocation). The standard signature
alone cannot tell them apart. That gap is filled by a typed law
family on operations:

```ts
traits.LAW.RETURNS_SAME_IDENTITY; // output key id === input key id (named via `of`)
traits.LAW.RETURNS_FRESH_IDENTITY; // output is a newly allocated entity
traits.LAW.CONSUMES_INPUT; // input may not be referenced after this call (linear)
traits.LAW.BORROWS_INPUT; // input is read-only during this call
traits.LAW.ALIASES; // outputs that share identity with named inputs
```

Each carries an `assurance` payload like the other laws (`asserted |
tested | by_construction | proved`) and parameterizes which input
**key** it refers to. Keys come from the operation's keyed I/O record
(§7.2); the builder-callback form (§7) makes `self` available to laws
without a temporal-deadzone reference:

```ts
const NormalizeCustomer = defineOperation(customerId.op("normalize"))
  .input({ customer: Types.ref(Customer) })
  .output({ customer: Types.ref(Customer) })
  .laws((self) =>
    Laws.all(
      Laws.returnsSameIdentity(self, { of: "customer" }).withAssurance(ByConstruction),
      Laws.borrowsInput(self, { of: "customer" }).withAssurance(ByConstruction),
      Laws.deterministic(self).withAssurance(ByConstruction),
    ),
  );

const ForkInvoice = defineOperation(invoiceId.op("fork"))
  .input({ source: Types.ref(Invoice) })
  .output({ forked: Types.ref(Invoice) })
  .laws((self) =>
    Laws.all(
      Laws.returnsFreshIdentity(self, { of: "forked" }).withAssurance(ByConstruction),
      Laws.borrowsInput(self, { of: "source" }).withAssurance(ByConstruction),
    ),
  );

const ConsumeDraft = defineOperation(invoiceId.op("issue"))
  .input({ invoice: Types.ref(Invoice) })
  .output({ invoice: Types.ref(Invoice) })
  .laws((self) =>
    Laws.all(
      Laws.returnsSameIdentity(self, { of: "invoice" }).withAssurance(Asserted),
      Laws.consumesInput(self, { of: "invoice" }).withAssurance(Asserted),
    ),
  );
```

What this unlocks:

| Law present              | Lowering / planning consequence                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `RETURNS_SAME_IDENTITY`  | Postgres `UPDATE` (not `INSERT`); React `useMemo` keyed by stable id; cache patch in place |
| `RETURNS_FRESH_IDENTITY` | Postgres `INSERT`; cache gets a new key; client refetch by new id                          |
| `BORROWS_INPUT`          | Safe to call concurrently with reads of input; no write barrier needed                     |
| `CONSUMES_INPUT`         | Planner / type system rejects double-use; outbox marks input retired                       |
| `ALIASES`                | Reactivity invalidates aliased outputs together; cache key derives from input              |

The `of` parameter names the input _key_ the law talks about —
exactly the way `Laws.identity(Op, "0.00")` parameterizes its value.
For multi-input ops, multiple `BORROWS_INPUT` / `CONSUMES_INPUT`
claims can coexist, one per input.

Three things to note about this family's place in the design:

- For _actions_, `ActionWritesField` / `ActionReadsField` edges
  give field-granular mutation tracking — that's the ownership
  surface for entity-level side effects (§9 explains the
  operation/action relationship).
- For _pure operations over values_, consume/borrow doesn't apply;
  values are immutable in the IR.
- For _operations over refs_, this law family is the typed answer
  to "is the result the same identity, a fresh one, or did the
  input get consumed?"

### 7.2 Keyed Input/Output For Identity Flow

The §7.1 law family uses positional `{ of: number }` indices to name
inputs. That works, but it drifts when ops are reordered and reads as
machinery rather than intent. The cleaner authoring form is **keyed
input and output**: shared keys carry the identity claim
structurally, and the §7.1 laws auto-derive from the type.

Rule of inference, applied per output key:

| Pattern                                       | Implicit claim                                |
| --------------------------------------------- | --------------------------------------------- |
| Same key on both sides, both ref-typed        | `RETURNS_SAME_IDENTITY` for that key          |
| Output key absent in input                    | `RETURNS_FRESH_IDENTITY` for that key         |
| `Fresh<T>` brand on a shared key              | Override: fresh identity, despite shared name |
| `AliasOf<"sourceKey">` brand on an output key | Output aliases the named input                |
| Value-typed shared key                        | No identity claim — keys are structural names |

Authors write the type; the planner reads the claims off it. No
separate `Laws.returnsSameIdentity(Op, { of: "key" })` annotation needed
for the common case.

```ts
// In-place transform — shared key + ref type carries the claim.
const NormalizeCustomer = defineOperation(customerId.op("normalize"))
  .input({ customer: Types.ref(Customer) })
  .output({ customer: Types.ref(Customer) }) // ⇒ RETURNS_SAME_IDENTITY for "customer"
  .laws((self) => Laws.all(Laws.borrowsInput(self, { of: "customer" }), Laws.deterministic(self)));

// Fresh identity — different output key, claim flips automatically.
const ForkInvoice = defineOperation(invoiceId.op("fork"))
  .input({ source: Types.ref(Invoice) })
  .output({ forked: Types.ref(Invoice) }) // ⇒ RETURNS_FRESH_IDENTITY for "forked"
  .laws((self) => Laws.borrowsInput(self, { of: "source" }));

// Linear consume — shared key for identity, explicit law for linearity.
const IssueInvoice = defineOperation(invoiceId.op("issue"))
  .input({ invoice: Types.ref(Invoice) })
  .output({ invoice: Types.ref(Invoice) }) // ⇒ RETURNS_SAME_IDENTITY for "invoice"
  .laws((self) => Laws.consumesInput(self, { of: "invoice" }));

// Alias — output explicitly names the input it shadows.
const SplitInvoice = defineOperation(invoiceId.op("split"))
  .input({ source: Types.ref(Invoice) })
  .output({
    head: AliasOf<"source", Ref<Invoice>>(),
    tail: Fresh<Ref<Invoice>>(),
  });
// Implicit claims: head aliases source; tail is fresh.
// No `.laws(...)` needed — both are derived from the keyed I/O type.
```

Call sites also benefit — `expr.call(Op, { invoice, actor })` reads
better than `expr.call(Op, [invoice, actor])`, and TS narrows missing
keys at the call.

`Fresh<T>` and `AliasOf<K, T>` are typed brand witnesses, not magic
strings — the same factory pattern used everywhere else in the
kernel:

```ts
const Fresh = defineRefBrand("fresh");
const AliasOf = defineRefBrand("aliasOf"); // takes a const-string source key
```

Branded refs preserve the underlying ref type — `Fresh<Ref<Invoice>>`
is assignable to `Ref<Invoice>` at the value level — so callers don't
need to know about the brand. The brand only matters to the
identity-law inference pass.

Keyed I/O is the canonical authoring form — the §7.1 law primitives
auto-derive from the type, so authors only write explicit
`Laws.*Input` / `Laws.*Identity` annotations for the cases keys
can't express (consume vs borrow, multi-output aliasing).

### 7.3 Predicates On Arguments — Refinement, Preconditions, Postconditions

Once arguments are keyed, attaching boolean claims to them is just
the unified `Predicate` IR (§10) wearing two more hats. Three
distinct shapes, all the same `Predicate` underneath:

| Shape                   | Subject   | Vars                 | Body holds      |
| ----------------------- | --------- | -------------------- | --------------- |
| Per-argument refinement | Type      | (none)               | At construction |
| Precondition            | Operation | Input scope          | Before op runs  |
| Postcondition           | Operation | Input + output scope | After op runs   |

**Per-argument refinement** is the existing §10 surface — narrow the
argument's type with a predicate that must hold for any value of
that type. No new machinery:

```ts
const TransferMoney = defineOperation(bankId.op("transfer"))
  .input({
    from: Types.ref(Account).where(NotFrozen), // refined type
    to: Types.ref(Account).where(NotFrozen),
    amount: Types.money().where(IsPositive),
  })
  .output({ from: Types.ref(Account), to: Types.ref(Account) });
```

The `.where(predicate)` produces a `RefinedType` that flows through
inference. Callers can only pass refs that already carry the
predicate (or have it derivable in context), and the planner uses
the refinement when picking lowerings.

**Preconditions** — `requires` — express claims _across_ inputs that
no single-argument refinement can. The callback receives a typed
**param scope** built from the operation's keyed input:

```ts
const TransferMoney = defineOperation(bankId.op("transfer"))
  .input({ from: Types.ref(Account), to: Types.ref(Account), amount: Types.money() })
  .output({ from: Types.ref(Account), to: Types.ref(Account) })
  .requires((p) =>
    expr.and(
      expr.not(expr.eq(p.from, p.to)), // distinct accounts
      p.from.field(Account.fields.balance).gte(p.amount), // sufficient funds
      p.from.field(Account.fields.currency).eq(p.to.field(Account.fields.currency)),
    ),
  );
```

`p` is a typed scope: `p.from` is `ExprBound<Ref<Account>>`,
`p.amount` is `ExprBound<Money>`, etc. Field access, comparison, and
quantifiers (§8) are available — the same expression surface used in
rules. Missing keys are TS errors at the callback boundary.

Multiple `.requires(...)` calls compose into a conjunction:

```ts
const IssueInvoice = defineOperation(invoiceId.op("issue"))
  .input({ invoice: Types.ref(Invoice) })
  .output({ invoice: Types.ref(Invoice) })
  .requires((p) => p.invoice.field(Invoice.fields.status).eq("draft"))
  .requires((p) => p.invoice.field(Invoice.fields.lineCount).gt(0));
```

**Postconditions** — `ensures` — receive both input scope `p` and
result scope `r`:

```ts
const TransferMoney = defineOperation(bankId.op("transfer"))
  .input({ from: Types.ref(Account), to: Types.ref(Account), amount: Types.money() })
  .output({ from: Types.ref(Account), to: Types.ref(Account) })
  .requires((p) => p.from.field(Account.fields.balance).gte(p.amount))
  .ensures((p, r) =>
    expr.and(
      r.from.field(Account.fields.balance).eq(p.from.field(Account.fields.balance).minus(p.amount)),
      r.to.field(Account.fields.balance).eq(p.to.field(Account.fields.balance).plus(p.amount)),
    ),
  );
```

`r.from` and `r.to` exist because §7.2's keyed output declares them.
Same identity as the inputs (per the keyed-I/O inference rule),
different field state — the postcondition spells out _which_ state
changed.

**Lowering / planning consequences.** Same fan-out story as rules
(§10), routed by the predicate's flavor:

| Flavor          | Surfaces it lowers to                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `precondition`  | server guard before call; client form validation; SQL `CHECK` when the args back a table; test fixture filter (only generate satisfying inputs); optimistic-UI gating (hide button if precondition fails on visible data); OpenAPI docs |
| `postcondition` | server-side assertion after call (in dev/test); test oracle; IVM "what changed" derivation; cache-key delta; audit explanation                                                                                                          |
| `invariant`     | transaction-level guard; SQL trigger; test property                                                                                                                                                                                     |

Same machinery as `app.predicate.lowerability(rule)` from §10 — the
result is a typed projection over registered surfaces, narrowed by
the predicate's subject kind (here `SubjectKind.operation`) and
required traits.

**Inheritance through refinement.** `Subject.where(...)` works on
operations the same way it works on entities. A precondition can be
attached at the operation level; callers can derive a tighter
operation by refining further:

```ts
const TransferUsdOnly = TransferMoney.where(
  Predicate.requires((p) => p.amount.field(Money.fields.currency).eq("USD")),
);
```

The refined operation carries the union of preconditions, and the
planner picks lowerings that satisfy the strongest claim available.

**Caller obligations.** A precondition the planner can't _prove_ at
the call site becomes a typed **obligation** — a diagnostic with
remediation listing how to discharge it (add a refinement to the
input type, add a guard before the call, prove via available rules).
Same shape as the obligation system used elsewhere; preconditions
just add a new producer.

### 7.4 Partial Operations, Results, And Matching

Partial operations must not hide failure. Division is the useful example:

```ts
const DivideMoney = defineOperation(moneyId.op("divide"))
  .input({ left: Types.money(), right: Types.money() })
  .output({ result: Types.money() })
  .impl(({ left, right }) => expr.divide(left, right));
```

That signature loses information. `right = 0` can fail, but the output
claims a plain `Money`. The final design should reject this unless the
failure is handled one of three ways.

**1. Prove failure impossible with a refinement or precondition.**

```ts
const NonZeroMoney = Types.money().where(NotZero);

const DivideMoney = defineOperation(moneyId.op("divide"))
  .input({ left: Types.money(), right: NonZeroMoney })
  .output({ result: Types.money() })
  .requires((p) => expr.neq(p.right, Types.money().literal("0.00")))
  .impl(({ left, right }) => expr.divide(left, right))
  .laws((self) => Laws.all(Laws.deterministic(self), Laws.total(self)));
```

Callers now owe the precondition. If the planner cannot prove it, it
emits an obligation diagnostic with repairs: add a guard, refine the
input type, or use a result-returning operation.

**2. Encode failure as a domain value with `Types.result`.**

```ts
const MoneyErrors = gen.errors.catalog(moneyId.errorCatalog("money"), {
  divideByZero: gen.errors.case(moneyId.error("divideByZero"), {
    type: moneyId.errorType("divide-by-zero"),
    code: moneyId.errorCode("divide_by_zero"),
    title: "Cannot divide by zero",
    fields: { right: Types.money() },
  }),
  precisionLoss: gen.errors.case(moneyId.error("precisionLoss"), {
    type: moneyId.errorType("precision-loss"),
    code: moneyId.errorCode("precision_loss"),
    title: "Precision would be lost",
    fields: { maxScale: Types.int() },
  }),
});

const DivideMoney = defineOperation(moneyId.op("divide"))
  .input({ left: Types.money(), right: Types.money() })
  .output({
    result: Types.result({
      ok: Types.money(),
      error: MoneyErrors,
    }),
  })
  .impl(({ left, right }) =>
    expr.if(
      expr.eq(right, Types.money().literal("0.00")),
      expr.err(MoneyErrors.divideByZero({ right })),
      expr.ok(expr.divide(left, right)),
    ),
  )
  .laws((self) => Laws.all(Laws.deterministic(self), Laws.total(self)));
```

This operation is total because failure is a value. The result type
preserves both branches:

```ts
const label = expr.match(divide.result, {
  ok: ({ value }) => formatMoney(value),
  err: ({ error }) =>
    expr.match(error, {
      [MoneyErrors.divideByZero]: ({ detail }) => detail,
      [MoneyErrors.precisionLoss]: ({ maxScale }) => expr.concat("Too many decimals: ", maxScale),
    }),
});
```

`expr.match` is exhaustive. Missing `ok`, `err`, or error-case handlers
are type errors unless the author supplies an explicit `_` fallback.
Handlers are keyed by typed error witnesses; string names appear only at
the catalog-definition boundary.

**3. Declare a boundary/runtime error channel.**

```ts
const ChargeCard = defineOperation(paymentsId.op("chargeCard"))
  .input({ card: Types.ref(Card), amount: Types.money() })
  .output({ receipt: Types.ref(Receipt) })
  .errors([Errors.paymentDeclined(), Errors.gatewayUnavailable()])
  .effects([Effects.network(), Effects.payment()]);
```

Use `.errors(...)` for boundary/runtime failures that are not part of
the domain value itself. Targets map this channel to Effect errors, HTTP
responses, OpenAPI errors, form failures, retries, and telemetry.

The rule of thumb:

```txt
Refinement / precondition  = valid callers must make failure impossible
Result output              = failure is normal domain control flow
.errors(...)               = boundary/runtime failure channel
Diagnostic                 = compiler could not prove, lower, or repair the graph
```

The corresponding invariant is `NoHiddenPartialOperation`: if an
operation is marked `partial`, or calls a known partial operation, it
must have a precondition/refinement, a result-like output, or an explicit
error channel. Otherwise the checker emits `operation:hidden-partial`
with candidate graph-patch repairs.

## 8. Expressions

Expressions are typed trees of operation calls.

Design-target API:

```ts
const invoiceIsPaid = expr.eq(
  expr.field(Invoice, Invoice.fields.status),
  expr.literal("paid", Types.text()),
);

const totalWithTax = expr.call(AddMoney, [
  expr.field(Invoice, Invoice.fields.subtotal),
  expr.field(Invoice, Invoice.fields.tax),
]);
```

Expression builders should infer result facts:

```ts
const latestInvoices = expr
  .from(Invoice)
  .filter((invoice) => invoice.field(Invoice.fields.status).eq("issued"))
  .sortBy(Invoice.fields.createdAt, "desc")
  .take(20);

latestInvoices.$infer.element; // Invoice
latestInvoices.$infer.cardinality; // 0..20
latestInvoices.$infer.order; // createdAt desc
latestInvoices.$infer.iterable; // sync/pageable depending source
```

Expressions also include typed first-order logic constructors:

```ts
const invoiceHasSettledPayment = expr.exists(Payment, (payment) =>
  payment
    .field(Payment.fields.invoiceId)
    .eq(invoice.field(Invoice.fields.id))
    .and(payment.field(Payment.fields.status).eq("settled")),
);

const allInvoiceLinesAreValid = expr.forall(InvoiceLine, (line) =>
  line
    .field(InvoiceLine.fields.invoiceId)
    .eq(invoice.field(Invoice.fields.id))
    .implies(line.field(InvoiceLine.fields.quantity).gt(0)),
);
```

### 8.1 Two equivalent styles

Every expression has a method form and a function form. Both produce
identical IR; the method form chains better, the function form
nests better.

```ts
// Method form (canonical for chains):
payment.field(Payment.fields.status).eq("settled").and(otherClaim);

// Function form (canonical for prefix-like nesting):
expr.and(expr.eq(payment.field(Payment.fields.status), "settled"), otherClaim);
```

Use whichever reads better at the call site. The doc uses method
form by default; nested boolean trees that don't chain naturally use
function form.

### 8.2 Literals

`expr.eq(field, "settled")` is the canonical form. The literal's
type is inferred from the comparand — when comparing a `text`-typed
field to a string, TypeScript narrows the literal automatically and
the IR records `expr.literal("settled", Types.text())` under the hood.

The explicit `expr.literal(value, Types.X())` form is only needed
when:

- the comparand is itself a literal (`expr.eq(expr.literal(0, Types.u32()), expr.literal(1, Types.u32()))`);
- the inferred type would be ambiguous (a brand discriminator that
  doesn't unify);
- you're constructing an expression in isolation, with no comparand
  to infer from.

### 8.3 `field(X)` callback accessor vs `Invoice.fields.X` direct path

Both appear in the doc; they mean different things.

- `Invoice.fields.X` — the **static field path**. Outside any rule
  or quantifier scope, this is the only way to refer to a field;
  it's a typed witness, not bound to any subject.
- `field(X)` inside a rule callback — the **subject-bound** form.
  When `gen.rule.for(Invoice, ({ field, actor }) => ...)` is the
  scope, `field(Invoice.fields.X)` resolves through the rule's bound
  subject to the field's value on _that_ invoice. The `field`
  helper is just sugar for "look up X on the rule's subject."
- `payment.field(Payment.fields.X)` inside a quantifier — the
  **bound-variable** form. The quantifier's callback parameter
  (`payment`) is a typed witness over its source; `.field(...)` is
  the typed accessor on it.

Quantifiers introduce scoped typed witnesses. Inside
`expr.exists(Payment, (payment) => ...)`, `payment.field(...)` only
accepts fields from `Payment`; the callback must return a boolean
expression. `expr.implies` and `expr.iff` only accept boolean
expressions. `expr.eq` only accepts compatible semantic types.

Quantifier legality depends on iterability/queryability. `exists` and
`forall` require a finite/queryable/streamable source. Cardinality facts
enable simplifications:

```txt
exists(empty, P)       => false
forall(empty, P)       => true
exists(exactly_one, P) => P(item)
forall(exactly_one, P) => P(item)
exists(zero_or_one, P) => nullable check + predicate
```

Expressions are graph-native:

- they can be inspected;
- they can be lowered;
- they can be checked for placement;
- they can be explained;
- they preserve operation laws.

An expression that cannot be inspected is an escape hatch. Escape hatches
are allowed, but they should carry blast radius, target limitations, and
diagnostics.

## 9. Functions, Queries, And Actions

Functions are named callable graph facts. **They are operations
(§7) with declared effects on the graph** — same node kind, same
keyed I/O, same identity laws, same precondition/postcondition
predicates from §7.3. The only thing that distinguishes a function
from a pure operation is the typed effect edges it carries:

```txt
Operation                         pure value computation; no effect edges
Operation + ActionReadsField      query — reads named fields
Operation + ActionWritesField     action — writes named fields
Operation + ActionEmitsEvent      side-effecting handler
```

The effect-edge story (§4.1's `ActionWritesField` / `ActionReadsField`)
is what makes an operation a function. Everything else — input/output
records (§7.2), identity laws (§7.1), preconditions (§7.3),
algebraic laws — applies uniformly.

This is why `IssueInvoice` from §7.1 (which mutates state and consumes
its input) is a perfectly valid operation: the consume claim is a
typed law on the operation node, and an `ActionWritesField` edge
declares the mutation. The same node carries both.

Queries read. Actions write. Both should be inspectable.

```ts
const listInvoices = gen
  .query("listInvoices")
  .from(Invoice)
  .where(invoiceIsVisible)
  .orderBy(Invoice.fields.createdAt, "desc")
  .limit(20)
  .key(Invoice)
  .returns(
    Invoice.projection("summary", {
      id: Invoice.fields.id,
      total: Invoice.fields.total,
      status: Invoice.fields.status,
    }),
  );

const markInvoicePaid = gen
  .action("markInvoicePaid")
  .input(Invoice)
  .update(Invoice)
  .set(Invoice.fields.status, "paid")
  .returns(Invoice);
```

These calls should emit structural facts:

```txt
QueryReadsEntity(listInvoices, Invoice)
QueryUsesKey(listInvoices, InvoiceKey)
QueryOrder(listInvoices, Invoice.createdAt desc)
QueryCardinality(listInvoices, 0..20)
QueryIterable(listInvoices, async_pageable)
ActionWritesField(markInvoicePaid, Invoice.status)
ActionReturns(markInvoicePaid, Invoice)
```

Because they are facts, later graph programs can discover:

- which actions affect which queries;
- which rules guard which calls;
- which targets need cache invalidation;
- which generated handlers need auth checks;
- which tests/docs should be emitted.
- which target pagination/streaming strategy is valid.

## 10. Predicates: Traits, Laws, And Rules

Predicates are the keystone — and rules are the demo case.

**A predicate is a typed boolean claim attached to a graph subject.**
Three authoring surfaces should normalize to the same canonical IR,
differing only by what kind of subject they decorate:

```
Predicate<TSubject, TVars, TBody, TAssurance, TFlavor> {
  subject:   typed subject witness (SubjectKind.type | .field |
                                    .operation | .entity | .dialect |
                                    .predicate | …)
  vars:      typed bindings (empty | universal | entity-scoped)
  body:      Expr<boolean>                          // always a real body
  assurance: branded witness (Asserted | Tested | Derived | …)
                                                    // attached via edge to
                                                    // an assurance kind node
  flavor:    branded witness (PredicateFlavor.trait | .law | .rule | …)
}
```

This is a composition model, not an inheritance hierarchy:

```txt
PredicateDef = canonical typed boolean claim
Rule         = entity-scoped authoring facade over PredicateDef
Law          = operation-scoped authoring facade over PredicateDef
BodiedTrait  = any-subject authoring facade over PredicateDef
MarkerTrait  = edge application, not a PredicateDef
```

So the correct mental model is:

```txt
Every rule has a predicate body and normalizes to a PredicateDef.
Not every predicate is a rule.
Rules do not inherit from predicates.
```

Implementation checkpoint: the current code still has a concrete
`Rule` / `RuleExpr` AST in `src/rules/rules.ts` and a separate generic
`Predicate` expression type in `src/expression/expr.ts`. Rules lower to
`node.kind.rule` with `trait.rule.predicate`; the dialect already also
defines `node.kind.predicate`. The intended next step is the real
`lower.rule.toPredicate` pass: produce a canonical predicate node from
each rule node, keep provenance back to the rule facade, then migrate
lowerability, RLS, audit, reactivity, UI, and test passes to consume
canonical predicates first.

**No magic strings anywhere.** `PredicateFlavor.trait`, `SubjectKind.entity`,
and assurance witnesses like `ProvedBySolver` are all branded values
produced by namespace-bound ID factories, not string literals.
Comparison is witness identity, not `===` on strings.

Subject is a **typed witness**, not a runtime-erased reference. That's
what lets `Subject.where(pred)` only accept matching predicates, and
what narrows the lowerability result shape per subject kind.

**Predicates always have a real body.** There is no marker / empty-body
case at the predicate level — see "markers are edges" below.

### Markers are edges, bodies are predicates

The kernel already has typed edges (`defineEdgeKind`). Most "X has
trait Y" or "X has capability Y" claims are atomic edges between two
graph nodes. **They are edges, not predicates.** Only the bodied cases
— where a real boolean expression does the work — go through the
Predicate IR.

```
Edge        atomic typed relations between graph nodes
            ├─ Trait application        (Field ──[has-trait]──> ClientSafeKind)
            ├─ Capability application   (Dialect ──[has-capability]──> CanEmitSqlKind)
            ├─ Assurance application    (Predicate ──[has-assurance]──> TestedKind)
            ├─ Effect application       (Action ──[writes]──> Field)
            ├─ Requirement application  (Action ──[requires]──> Provider)
            └─ Obligation application   (Rule ──[owes]──> ArtifactKind)

Predicate   bodied typed claims — body does the work
            ├─ Law                      (subject: Operation; body: algebraic identity)
            ├─ Rule                     (subject: Entity; body: business predicate)
            ├─ Trait with .when(...)    (subject: any; body: condition)
            └─ Capability with .when()  (subject: Dialect; body: feature gate)
```

**One authoring family, two IR shapes.** `defineTrait("ClientSafe")`
(no `.when`) produces a trait kind node + an edge attachment helper.
`defineTrait("PiiEraseable").when((field) => ...)` produces a
predicate that references the trait kind. Same factory, two outputs,
uniform witness shape (`.id`, `.ref`, `.attachTo(subject)`,
`.refine(subject)`, `.$infer`) — consumer code doesn't branch on the
underlying IR.

Same rule applies to capabilities. `defineCapability(PostgresDialect)`
produces a marker edge. `defineCapability(PostgresDialect).when((d) =>
d.version().gte("16"))` produces a guarded-capability predicate.

Assurances are always edges in practice — they're epistemic labels
attached to predicates with a `strongerThan` partial order among the
labels.

```ts
const Asserted = defineAssuranceKind({ id: assuranceId.kind("asserted") });
const Tested = defineAssuranceKind({
  id: assuranceId.kind("tested"),
  strongerThan: [Asserted],
});
const ProvedBySolver = defineAssuranceKind({
  id: assuranceId.kind("proved_by_solver"),
  strongerThan: [Tested],
});

canArchive.withAssurance(Tested); // writes Predicate ──[has-assurance]──> Tested
```

The `strongerThan` partial order is itself a relation among assurance
kind nodes — also edges. No predicate machinery; just typed graph
vocabulary. A formal-verification dialect can register `CoqProof` /
`LeanProof` by calling `defineAssuranceKind` — comparison walks the
edge graph, not strings.

The predicate flavors. The first three (trait, law, rule) are the
visible authoring surfaces; the next three (precondition,
postcondition, invariant) are operation-scoped predicates introduced
in §7.3 and share the same IR via flavor branding.

| Flavor          | Subject   | Vars                   | Body holds        |
| --------------- | --------- | ---------------------- | ----------------- |
| `trait`         | any       | `[]`                   | for the subject   |
| `law`           | operation | universally-quantified | for all inputs    |
| `rule`          | entity    | entity-scoped          | for the entity    |
| `precondition`  | operation | input record scope     | before op runs    |
| `postcondition` | operation | input + output scope   | after op runs     |
| `invariant`     | operation | input record scope     | throughout op run |

The flavor list is **open** — `predicateId.flavor("dialect.flavor.x")`
registers new ones. The kernel only reads `subject` / `vars` / `body`;
flavor is preserved so error messages and editor hints can specialize.
The rest of this section focuses on the original three because they
illustrate the IR most clearly; §7.3 covers the operation-scoped
flavors.

- **Trait (bodied form)** — `gen.trait("X").when(...)`. Body-bearing
  predicates on any subject. Most authoring uses the marker form
  (edge); this is the upgrade when there's logic to evaluate.
- **Law** — universally-quantified algebraic predicate on an operation.
  `Laws.associative(AddMoney)` asserts `forall x y z. f(f(x,y),z) =
f(x,f(y,z))`. Carries assurance levels because algebraic claims need
  to be trusted or proven.
- **Rule** — entity-scoped predicate with named vars and business
  meaning. `gen.rule.for(Invoice, ({field, actor}) => ...)`. The most
  visible flavor; the rest of this section focuses on rules because
  they fire the most derivations.

### Authoring surfaces

Every flavor has an explicit `define*` form (for full control) and an
ergonomic factory (for normal use). Both produce identical IR.

```ts
// Trait — marker form produces an edge kind + attachment helper
const ClientSafe = defineTrait({
  id: typeId.trait("ClientSafe"),
  appliesTo: TraitTarget.anyOf(type.kind("email"), domain.nodes.field),
});
const ClientSafeAlt = gen.trait("ClientSafe");
// Both: ClientSafe is an EdgeKindWitness. Attach via
//   User.fields.email.hasTrait(ClientSafe)

// Trait — body form upgrades to a predicate
const PiiEraseable = gen.trait("PiiEraseable").when((field) => field.classify.erase.exists());
// PiiEraseable is a PredicateWitness (flavor: trait, subject: any).

// Law — always a predicate (laws are always bodied)
const AddMoneyAssoc = defineLaw({
  id: moneyId.law("associative"),
  subject: AddMoney,
  body: (x, y, z) =>
    expr.eq(AddMoney.call(AddMoney.call(x, y), z), AddMoney.call(x, AddMoney.call(y, z))),
}).withAssurance(ByConstruction);

const AddMoneyAssocAlt = Laws.associative(AddMoney).withAssurance(ByConstruction);

// Rule — always a predicate (rules are always bodied)
const canViewInvoice = defineRule({
  id: invoiceId.rule("canViewInvoice"),
  subject: Invoice,
  body: ({ field, actor }) =>
    expr.or(
      expr.eq(field(Invoice.fields.status), "issued"),
      expr.eq(field(Invoice.fields.ownerId), actor.id),
    ),
});

const canViewInvoiceAlt = gen.rule.for(Invoice, ({ field, actor }) =>
  expr.or(
    expr.eq(field(Invoice.fields.status), "issued"),
    expr.eq(field(Invoice.fields.ownerId), actor.id),
  ),
);
```

The explicit `define*` form and the ergonomic factory produce
**byte-identical witnesses** for each case (marker traits produce
identical edge kinds; bodied predicates produce identical predicate
nodes). Pick whichever reads better at the call site. The ergonomic
factories are the documented defaults; the `define*` forms exist for
back-compat and for cases where you need to spell out every field.

### Rules — the demo flavor

Rules get the full first-order logic toolkit with an entity-bound
context:

```ts
const canApproveInvoice = gen.rule.for(Invoice, (r) =>
  r.implies(
    r.field(Invoice.fields.status).eq("pending"),
    r.exists(Payment, (payment) =>
      r.and(
        payment.field(Payment.fields.invoiceId).eq(r.field(Invoice.fields.id)),
        payment.field(Payment.fields.status).eq("settled"),
      ),
    ),
  ),
);

const canArchiveInvoice = gen.rule.for(Invoice, (r) =>
  r.forall(InvoiceLine, (line) =>
    line
      .field(InvoiceLine.fields.invoiceId)
      .eq(r.field(Invoice.fields.id))
      .implies(line.field(InvoiceLine.fields.status).eq("closed")),
  ),
);
```

Target lowerings may support only part of first-order logic. That is
fine: unsupported quantifiers stay in graph IR and produce legalization
diagnostics with repair or lowering alternatives. Canonicalization
morphisms can rewrite:

```txt
forall(x, P(x)) => not exists(x, not P(x))
implies(a, b)   => or(not a, b)
```

Use rules for business logic, not for graph discovery. A rule answers
"is this domain condition true for these runtime values?":

```txt
RefundAllowed(invoice, actor)
  = invoice.status == "paid"
  && invoice.refundedAt == null
  && invoice.ownerId == actor.id
```

That same rule can be attached to an action precondition, auth policy,
query filter, RLS lowering, UI enabled state, test matrix, and audit
explanation. The rule is the source of business meaning; each target
artifact is a lowering or derivation from it.

When a query uses a rule, the graph should make that explicit:

```txt
ListRefundableInvoices usesRule RefundAllowed
RefundAllowed readsField Invoice.status
RefundAllowed readsField Invoice.refundedAt
IssueRefund writesField Invoice.refundedAt
```

Those facts are what let patterns and invariants derive invalidation,
lowerability obligations, and diagnostics.

### The fan-out

A single rule should fan out to:

1. server guard;
2. RLS policy;
3. SQL predicate;
4. UI disabled state;
5. form validation;
6. test matrix;
7. access matrix docs;
8. reactivity invalidation;
9. IVM plan;
10. audit explanation;
11. optimistic enablement.

Laws and traits fan out to fewer surfaces because their subjects
participate in fewer layers, but they go through the same pipeline:

```txt
law on operation   -> target lowering choice (parallel SQL, IVM,
                      optimistic, retry policy)
trait on field     -> placement, codec choice, redaction, client
                      boundary
trait on action    -> dispatch plan, outbox eligibility,
                      optimistic capability
```

The value is compounding:

```txt
one typed predicate
  -> many target artifacts (indexed by subject kind)
  -> all explainable from one graph history
```

### Refinements

`Subject.where(claim)` works whether the claim is a predicate (bodied)
or a marker (edge):

```ts
const ArchivableInvoice = Invoice.where(canArchiveInvoice); // rule (predicate)
const ClientEmail = Invoice.fields.customerEmail.where(ClientSafe); // trait marker (edge)
const AssocAdd = AddMoney.where(Laws.associative); // law (predicate)
```

For predicates, refinement uses the predicate's body. For marker traits
or marker capabilities, refinement constructs an implicit body
predicate `hasTrait(subject, kind)` / `hasCapability(subject, kind)` —
"the subject has the edge attachment to this kind."

`Subject.where(...)` produces a `RefinedType` that flows into action
inputs, query outputs, form fields, operation selection, and test
fixtures.

### Explanation and lowerability

Every predicate exposes the same introspection surface. The result
shape is **not hardcoded** — it's a typed projection over registered
`LoweringSurface` declarations (see §14) filtered by the predicate's
subject kind and required traits. Adding a new dialect adds new
surfaces to the result automatically.

```ts
app.predicate.lowerability(canArchiveInvoice);
// Inferred shape — open-set, narrowed by which surfaces match:
// {
//   "auth.surface.serverGuard":        { supported: true },
//   "postgres.surface.sqlPredicate":   { supported: true },
//   "postgres.surface.rlsPolicy":      { supported: true },
//   "react.surface.clientHint":        { supported: false, reason, remediation },
//   "reactivity.surface.invalidation": { supported: true, precision: "exact" },
//   ...whichever else a third-party dialect registered
// }

app.predicate.lowerability(AddMoneyAssoc);
// Inferred shape — narrowed to operation-subject surfaces:
// {
//   "postgres.surface.parallelReduce": { supported, assurance },
//   "postgres.surface.sqlAggregate":   { supported, reason },
//   "ivm.surface.eligible":            { supported },
// }

// Drill into one specific surface — exact result shape:
app.predicate.lowerability(canArchiveInvoice).at(PostgresDialect.surfaces.sqlPredicate);
// : { supported, reason?, remediation? }

// Filter to one dialect:
app.predicate.lowerability(canArchiveInvoice, { dialect: PostgresDialect });

app.explain(canArchiveInvoice); // works for any flavor
```

`app.rule.lowerability(rule)` survives as a back-compat alias that
narrows the result to the historically-named eleven surfaces.

### Refinement composition

`Subject.where(...)` accepts any of these subject kinds, with
predicates whose subject witness matches:

| Subject kind | Example                                    | Result                           |
| ------------ | ------------------------------------------ | -------------------------------- |
| Type         | `Types.email.where(NotBanned)`             | refined semantic type            |
| Field        | `Invoice.fields.email.where(ClientSafe)`   | refined field witness            |
| Entity       | `Invoice.where(canArchive)`                | refined entity (a `RefinedType`) |
| Operation    | `AddMoney.where(Laws.associative)`         | refined operation                |
| Edge kind    | `InvoiceChargesCustomer.where(Settled)`    | refined edge endpoint constraint |
| Predicate    | `canView.where(Predicate.assured(Tested))` | refinement on assurance level    |

For predicates, refinement uses the predicate's body. For marker
traits or marker capabilities, refinement constructs an implicit
body predicate (`hasTrait(subject, kind)` /
`hasCapability(subject, kind)`).

Chained refinements compose into conjunctions:

```ts
const Active = Invoice.where(isActive);
const ActiveOpen = Active.where(isOpen); // and isOpen
const ActiveOpenMine = ActiveOpen.where(ownedByActor); // and ownedByActor
```

Other compositions are explicit, name-spaced under `Predicate.*`:

```ts
Predicate.or(canView, isAdmin);
Predicate.not(isLocked);
Predicate.implies(isPending, hasApprover);
```

Refinements materialize as graph nodes; `app.explain(refined)` walks
the chain.

### Policies are predicate bundles, not predicates

A policy is a typed bundle of predicate references keyed by action.
Not a predicate itself — it has no body, just a mapping:

```ts
const InvoicePolicy = defineAuthPolicy(Invoice, {
  read: canViewInvoice,
  update: canEditInvoice,
  delete: canArchiveInvoice,
});

InvoicePolicy.predicates.read; // typed Predicate witness
InvoicePolicy.$infer.actions; // "read" | "update" | "delete"
```

The eleven derivations fire on the wrapped predicates; the policy
routes actions to predicates and gives queries / actions a single
attachment point.

## 11. Invariants, Diagnostics, And Repairs

Predicates describe claims. Invariants decide whether graph facts satisfy
claims. Diagnostics explain failures or uncertainty. Repairs are
candidate graph patches that can fix them.

The compiler feedback loop is:

```txt
typed graph facts
  -> invariant instance
  -> diagnostic finding
  -> candidate graph-patch repairs
  -> preview / explain / apply
```

This is intentionally separate from artifact emission. A diagnostic is
not a hidden graph mutation. It says something about the current graph,
the current pipeline stage, a candidate patch, or an emitted artifact. If
the compiler can repair the problem, the repair is an explicit
`GraphPatch` attached to the diagnostic; applying it is a normal patch
step that can be previewed, diffed, explained, or rejected.

```ts
const result = app.check();

for (const finding of result.diagnostics) {
  finding.code; // "rules:type-mismatch"
  finding.subject; // canViewInvoice
  finding.invariant; // CompatibleOperands(...)
  finding.params; // { left: Email, right: UserId, operation: "eq" }
  finding.repairs; // candidate GraphPatch values
}

const preview = app.preview(result.diagnostics[0].repairs[0]);
preview.print();
```

Target shapes:

```ts
type InvariantFamily<Params, Subject> = {
  id: InvariantId;
  title: string;
  subject: SubjectKind<Subject>;
  params: PayloadSchema<Params>;
  diagnose(instance: InvariantInstance<Params, Subject>): DiagnosticFinding[];
};

type DiagnosticDef<Params> = {
  type: DiagnosticTypeRef;
  title: string;
  code: DiagnosticCode;
  severity: Severity;
  messages: {
    user: (p: Params) => string;
    developer: (p: Params) => string;
    agent: (p: Params) => string;
  };
  repair?: (p: Params, ctx: RepairContext) => readonly GraphPatch[];
};
```

This is an evolution of the existing implementation, not a replacement
for it. Today `src/core/diagnostics.ts` already has one canonical
`Diagnostic` shape with `code`, `message`, `id`, `subject`, `related`,
`source`, `suggestedFixes`, and `repairs`; `src/kernel/diagnostic.ts`
re-exports that shape. The missing layer is the typed family definition
above it: params, audience-specific messages, invariant evidence, and
problem-envelope fields.

`DiagnosticFinding` should use the same shared problem envelope as
runtime error instances:

```txt
type      stable documentation/type ref for the diagnostic definition
title     stable short title
code      stable machine code
detail    occurrence-specific explanation
instance  stable ref for this finding / invariant instance
```

Domain errors and diagnostics are related but not identical:

```txt
ErrorDef / ErrorInstance
  runtime/domain value returned by an operation

DiagnosticDef / DiagnosticFinding
  compiler feedback about graph facts, proof obligations, candidate
  patches, or artifacts
```

Sharing the envelope makes them easy to render and route; keeping
separate definitions prevents runtime control flow from being confused
with compiler verification.

Example: a rule compares incompatible semantic types.

```txt
InvariantFamily: CompatibleOperands
Instance: canViewInvoice compares User.email with User.id
Diagnostic: rules:type-mismatch
Params: { left: Email, right: UserId, operation: "eq" }
Repairs:
  - use a field with a compatible semantic type
  - insert an explicit conversion / display boundary
  - change the operation to one declared compatible for these types
```

The message shown to a user, a compiler developer, and an AI repair agent
can differ, but all three come from the same `DiagnosticDef` and params.
The agent-facing message should be structured enough to act on; the
user-facing message should say what happened and why it matters.

Example: an operation hides a partial failure.

```txt
InvariantFamily: NoHiddenPartialOperation
Instance: DivideMoney(left: Money, right: Money) -> Money
Diagnostic: operation:hidden-partial
Evidence:
  - implementation calls divide
  - divide is partial when right == 0
  - output is plain Money
  - no precondition/refinement proves right != 0
  - no Result output or .errors(...) channel exists
Repairs:
  - change right to NonZeroMoney
  - add .requires((p) => p.right != 0)
  - wrap output in Types.result({ ok: Money, error: DivideMoneyError })
  - declare .errors([Errors.divideByZero()])
```

The invariant does not decide which domain design is correct. It turns
the hidden failure into explicit graph-patch choices so a human or agent
can pick the right one.

Current implementation note: the codebase already has a mostly unified
`Diagnostic` shape with `subject`, `related`, `source`, `suggestedFixes`,
and `repairs`. The final design adds the missing typed layer above it:
`InvariantFamily`, `InvariantInstance`, richer `DiagnosticDef`, and
repair patch generation.

### 11.1 Passes Own Global Proof

TypeScript proves local authoring shape:

```txt
field belongs to entity
rule callback returns boolean
operation call has required keys
predicate subject matches refinement subject
```

Passes prove global graph properties:

```txt
no duplicate stable IDs
rule can lower to SQL
client hint reads only client-safe fields
provider requirements are satisfiable
target dialect can consume the lowered graph
```

Do not try to encode whole-graph correctness in TypeScript types. The
editor should reject malformed authoring calls; passes should validate
the graph and emit structured diagnostics for everything that requires
global knowledge, target capabilities, or proof.

### 11.2 Predicate Fan-Out Discipline

A predicate can eventually derive many surfaces, but the implementation
should prove one vertical slice before expanding:

```txt
predicate fact
  -> invariant checks
  -> lowerability matrix
  -> one target derivation
  -> diagnostics with repair patches
  -> explain / preview / artifact trace
```

For rules, the first complete slice should be:

```txt
rule predicate
  -> server guard surface
  -> SQL/RLS lowerability
  -> RLS artifact when legal
  -> structured diagnostic when not legal
  -> access-matrix doc
  -> explain trace from artifact back to predicate
```

After that loop is solid, the remaining surfaces — UI hints, form
validation, IVM, optimistic enablement, broad reactivity precision — can
reuse the same lowerability, diagnostic, repair, and explanation model.

## 12. Patterns And Matches

Patterns are the missing low-level primitive below projections,
derivations, lowerings, emitters, and diagnostics.

A pattern describes a source graph shape. It is the typed query language
over Gen2's own graph facts, not the business-rule language and not the
runtime database-query API.

```txt
Rule     = reusable predicate over domain/runtime values
Pattern  = matcher over Gen2 graph facts
Query    = runtime data retrieval plan over storage values
Invariant = global requirement over graph matches
```

Example split:

```txt
Rule:
  RefundAllowed(invoice, actor)

Runtime query:
  ListRefundableInvoices where RefundAllowed(currentActor, invoice)

Pattern:
  find actions that write fields read by rules used by queries

Derivation:
  derive action invalidates query key

Invariant:
  rules used by Postgres-backed queries must be SQL/RLS lowerable
```

This keeps the lanes clear. Use rules for business constraints; use
queries to retrieve application data from storage; use patterns when a
pass needs to find relationships among graph facts such as actions,
fields, rules, policies, queries, lowerings, and artifacts.

Design-target API. Pattern ids come from a namespaced factory; binding
keys are inferred const literals so the match callback's bindings stay
typed:

```ts
const RuleInvalidationPattern = definePattern(ReactivityDialect.id.pattern("ruleInvalidation"))
  .edge("write", CallableDialect.edges.actionWritesField)
  .edge("read", RuleDialect.edges.ruleReadsField)
  .same("write.field", "read.field")
  .edge("guard", AuthDialect.edges.policyUsesRule)
  .same("guard.rule", "read.rule")
  .edge("key", QueryDialect.edges.queryUsesKey)
  .same("key.query", "guard.query");
```

The match callback should infer named bindings:

```ts
for (const match of graph.match(RuleInvalidationPattern, { mode: "stream" })) {
  match.write.action;
  match.read.rule;
  match.key.key;
}
```

Patterns must compile to indexed lookups, not whole-graph scans by
default. They also declare dependency keys so the scheduler can cache and
invalidate them:

```txt
reads edge.kind.actionWritesField
reads edge.kind.ruleReadsField
reads edge.kind.policyUsesRule
reads edge.kind.queryUsesKey
```

Match modes:

```txt
stream       iterate lazily
first        stop at first match
count        count without materializing bindings
materialize  cache concrete matches
```

## 13. Projections

A projection is a typed read model over graph facts.

```txt
GraphProjection = graph / match -> value
```

Examples:

- all actions affecting a query;
- all client-safe fields for a route;
- effective auth matrix;
- target artifacts reachable from an entrypoint;
- deployment dependency plan.

Design-target API:

```ts
const AffectedQueries = defineProjection({
  id: ReactivityDialect.id.projection("affectedQueries"),
  from: RuleInvalidationPattern,
  select: ({ match }) => ({
    action: match.write.action,
    rule: match.read.rule,
    key: match.key.key,
  }),
});
```

Projections should preserve output facts:

```ts
const LatestInvoiceSummaries = defineProjection({
  id: BillingDialect.id.projection("latestInvoiceSummaries"),
  from: InvoiceQueryPattern,
  output: {
    element: Invoice.projections.summary,
    cardinality: Cardinality.range({ min: 0, max: 20 }),
    iterable: Iterable.pageable(),
    order: Order.by(Invoice.fields.createdAt, "desc"),
  },
});
```

A projection does not mutate the graph. If the result should become
durable, explainable, diffable, or consumable by later stages, promote it
to a morphism or derivation.

## 14. Morphisms

A morphism maps one graph shape to another graph shape.

```txt
GraphMorphism = source graph shape -> target graph shape
```

Specializations are distinguished by their `phase`, not by separate
factories:

```txt
MorphismPhase.derive   semantic graph -> semantic graph patches
MorphismPhase.lower    semantic graph -> target dialect graph patches
MorphismPhase.import   external/source graph -> semantic graph patches
MorphismPhase.migrate  old/new graph diff -> migration graph patches
MorphismPhase.emit     graph -> artifact graph + external artifact effect
```

There is one `defineMorphism({...})` primitive; the phase witness
selects the role. There is no `defineEmitter`, `defineDerivation`, or
`defineImport` — those would be parallel ceremony for the same IR.

Morphisms use the **object form**, not the builder-callback form
operations use (§7). The reason: morphisms don't self-reference. A
morphism's `map` callback receives `match` and `patch` from the
runtime, not the morphism itself, so there is no temporal-deadzone
hazard. Object form keeps the declaration compact and the field set
queryable.

Rule invalidation is a morphism. Phase is a branded `MorphismPhase`
witness (not the string `"derive"`); ids come from the dialect's
factory:

```ts
const DeriveInvalidatesKey = defineMorphism({
  id: ReactivityDialect.id.morphism("deriveInvalidationDependencies"),
  phase: MorphismPhase.derive,
  from: RuleInvalidationPattern,
  to: {
    edges: [ReactivityDialect.edges.invalidatesKey],
  },
  because: "actions writing fields read by guarded keyed queries invalidate those keys",
  map: ({ match, patch }) =>
    patch.addEdge(
      kernel
        .edge(ReactivityDialect.edges.invalidatesKey)
        .from({ mutator: match.write.action, key: match.key.key })
        .autoId(ReactivityDialect.id, match.write.action, match.key.key)
        .metadata({ custom: { confidence: "proven" } })
        .done(),
    ),
});
```

Entity-to-table lowering is also a morphism — same shape, lowering
phase, dialect-owned refs:

```ts
const EntityToTable = defineMorphism({
  id: PostgresDialect.id.morphism("entityToTable"),
  phase: MorphismPhase.lower,
  from: DomainDialect.patterns.entityWithFields,
  to: {
    nodes: [PostgresDialect.nodes.table, PostgresDialect.nodes.column],
    edges: [PostgresDialect.edges.tableHasColumn],
  },
  map: ({ match, patch }) => [
    patch.addNode(PostgresDialect.nodes.table, {
      id: PostgresDialect.id.node(PostgresDialect.nodes.table, match.entity.name),
      name: match.entity.name,
    }),
    patch.addNode(PostgresDialect.nodes.column, {
      id: PostgresDialect.id.node(PostgresDialect.nodes.column, match.field.name),
      name: match.field.name,
    }),
    patch.addEdge(
      kernel
        .edge(PostgresDialect.edges.tableHasColumn)
        .from({
          table: PostgresDialect.id.nodeRef(PostgresDialect.nodes.table, match.entity.name),
          column: PostgresDialect.id.nodeRef(PostgresDialect.nodes.column, match.field.name),
        })
        .autoId(PostgresDialect.id, match.entity, match.field)
        .done(),
    ),
  ],
});
```

The key type-safety property:

```txt
from controls match.*
to controls patch.*
```

If a morphism does not declare `PostgresDialect.nodes.table` in `to`, its
patch builder should not accept `PostgresDialect.nodes.table`.

### Surfaces — the public contract of a morphism

A morphism that's part of a target's public lowering contract declares
a typed `surface`. This is what `app.predicate.lowerability(...)`,
`app.capabilities.report(...)`, and the meta graph query.

The recommended core form is the **curried builder** — each step
narrows the next, and every identity is a branded witness:

```ts
const PredicateToSqlPredicate = defineMorphism({
  id: PostgresDialect.id.morphism("lowerPredicateToSqlPredicate"),
  phase: MorphismPhase.lower, // branded witness, not "lower"
  from: PredicateOnEntityPattern,
  to: { nodes: [PostgresDialect.nodes.sqlPredicate] },

  // Public contract — what the lowerability matrix sees.
  surface: defineLoweringSurface
    .id(PostgresDialect.id.surface("sqlPredicate"))
    .consumes({
      subjects: [SubjectKind.entity, SubjectKind.field], // branded witnesses
      requires: [SqlLowerable], // predicate witnesses
      forbids: [ServerOnly],
    })
    // ↑ after .consumes, the builder knows subject and requirement shapes;
    //   .yields and .resultShape narrow against that context.
    .yields(PostgresDialect.nodes.sqlPredicate)
    .resultShape((p) =>
      p.struct({
        supported: p.boolean(),
        reason: p.optional(p.string()),
        remediation: p.optional(RemediationWitness),
      }),
    )
    .done(),

  map: ({ match, patch }) => ...,
});
```

A morphism without a `surface` is **internal** — composable in
pipelines, but not advertised externally. A morphism with one is
**public** — registered in the meta graph and discoverable through
`app.predicate.lowerability(...)`. A `Dialect.surfaces.*` accessor is
_derived_ from morphism surfaces, not a separately declared field.

`defineLoweringSurface` / `defineDerivationSurface` /
`defineEmitSurface` are thin specializations of one `defineSurface`
factory — different phase tag, same builder shape, identical IR.

This is how third-party dialects extend the lowerability matrix
without kernel edits: register a morphism with a surface, and it shows
up in every consumer's `app.predicate.lowerability(...)` result type.

## 15. Patches

A patch is a concrete graph transaction.

```txt
GraphPatch = add node | add edge | add expr | annotate | retract | rename
```

Patches are used by:

- authoring APIs;
- derivations;
- lowerings;
- importers;
- migrations;
- AI edits;
- diagnostic repairs.

Every patch should be:

- typed;
- verifiable;
- previewable;
- applicable;
- reversible when possible;
- serializable;
- explainable;
- cacheable.

Design-target API. Patches reuse the curried `kernel.edge(kind)` builder
so the patch payload is type-checked against the edge kind in one place
— no parallel `patch.addEdge(kind, payload)` schema to keep in sync:

```ts
const patch = graphPatch.addEdge(
  kernel
    .edge(ReactivityDialect.edges.invalidatesKey)
    .from({ mutator: markInvoicePaid, key: invoiceKey })
    .autoId(ReactivityDialect.id, markInvoicePaid, invoiceKey)
    .provenance({
      producedBy: DeriveInvalidatesKey,
      sourceFacts: [markInvoicePaid.ref, canViewInvoice.ref, listInvoices.ref],
    })
    .done(),
);
```

## 16. Pipelines

A pipeline composes graph stages. Pipeline ids come from the dialect's
factory; stage entries are typed morphism witnesses, not strings:

```ts
const ReactivityPipeline = definePipeline(ReactivityDialect.id.pipeline("preview"), [
  RuleDialect.morphisms.deriveRuleReads,
  CallableDialect.morphisms.deriveActionWrites,
  ReactivityDialect.morphisms.deriveInvalidation,
  ReactivityDialect.emitters.emitTanstackQuery,
]);
```

The pipeline witness should infer:

- literal pipeline name;
- pass/stage tuple;
- reads;
- writes;
- patch union;
- diagnostics;
- repair patch union;
- explanations;
- artifact kinds.

Then preview is simple:

```ts
const preview = gen.preview.pipeline(ReactivityPipeline);

preview.summary.patches;
preview.summary.diagnostics;
preview.summary.artifacts;
preview.summary.explanations;
```

Pipeline performance comes from declarations:

```txt
read keys + write keys + source hashes -> incremental scheduling
```

If a patch only changes `Invoice.status`, the scheduler should only rerun
patterns/morphisms whose read keys overlap that fact.

### 16.1 The pipeline lifecycle

Three verbs sit on top of any pipeline. The same pipeline value is
the input to each — they differ only in what they do with the
result.

```ts
const PostgresPipeline = PostgresDialect.pipelines.emitSchema;

// 1. Preview — runs the pipeline through the patch-and-diagnostic phases,
//    stops before any external effect, returns a typed result.
const preview = app.preview(PostgresPipeline);
preview.print(); // human-readable summary
preview.patches; // every patch that would apply
preview.diagnostics; // every typed finding
preview.artifacts; // every artifact byte that would be written
preview.explanations; // provenance chain per artifact

// 2. Verify — same as preview, but treats any non-info diagnostic as a hard error.
//    Returns a Result<Preview, Diagnostic[]>; never writes anything.
const verified = app.verify(PostgresPipeline);

// 3. Emit — runs the pipeline all the way through; applies patches to durable
//    graph state and writes artifacts to disk / target. Same Result shape.
await app.emit(PostgresPipeline, { outDir: "generated/postgres" });
```

The preview / emit split is the trust boundary. Preview is pure
inspection — no graph mutation, no file writes, no external calls.
Emit is the only verb that crosses to durable side effects, and it
runs preview internally first; if any diagnostic is `error`-level,
emit aborts before the side-effecting phase.

`app.explain(<artifact-or-fact>)` and `app.showSourceFacts(<artifact>)`
work on both preview results and emitted artifacts — same provenance
graph, same chain.

## 17. The Meta Graph

The meta graph describes the graph programs themselves.

Static meta graph:

- dialects;
- node kinds;
- edge kinds;
- traits;
- patterns;
- morphisms;
- pipelines;
- capabilities;
- laws;
- artifact kinds.

Run meta graph:

- stage runs;
- produced patches;
- diagnostics;
- repairs;
- artifacts;
- timings;
- cache hits;
- source hashes.

Optional audit/devtool graph:

- detailed match traces;
- full provenance chains;
- why a stage did or did not run.

The meta graph answers:

- what produces this edge kind?
- what depends on this field?
- what pipelines are invalidated by this patch?
- what dialect owns this morphism?
- what artifacts can this app emit?
- why did this artifact change?
- what capability is missing?

This powers:

```ts
app.preview();
app.explain(markInvoicePaid);
app.explainWhy(markInvoicePaid).invalidates(invoiceKey);
app.traceArtifact("postgres/schema.sql");
app.capabilities.report({ targets: [PostgresDialect] });
```

## 18. Code Generation

Code generation is not a separate black box. It is the last part of the
same graph pipeline.

```txt
semantic graph
  -> legalize target inputs
  -> lower to target dialect graph
  -> emit artifacts
```

Postgres example:

```ts
const PostgresPipeline = definePipeline(PostgresDialect.id.pipeline("emit"), [
  PostgresDialect.morphisms.entityToTable,
  PostgresDialect.morphisms.policyToRls,
  PostgresDialect.emitters.emitSchemaSql,
]);

const preview = app.preview(PostgresPipeline);
```

The preview should show:

- target facts that will be created;
- diagnostics and repairs;
- artifact paths;
- source facts behind each artifact;
- whether output changed by content hash;
- why a lowering was legal.

Only after preview/legalization succeeds should artifacts be written.

```ts
await app.emit(PostgresPipeline, {
  outDir: "generated/postgres",
});
```

## 19. Type Safety And Inference Rules

The entire design depends on excellent TypeScript inference.

Rules:

1. Create typed values first. Infer from those values downstream.
2. Prefer witnesses over magic strings.
3. Use object-literal namespaces for dialects.
4. Use `const` generics for names, binding keys, pipeline names, and
   artifact kinds.
5. Expose `$infer` surfaces for advanced users.
6. Keep unsafe casts inside factories.
7. Use explicit dynamic boundaries for runtime-loaded facts.
8. Preserve named bindings in callbacks.
9. Flatten public types with `Compute<T>`.
10. Add `.test-d.ts` regression coverage for inference and editor DX.

Good:

```ts
const Customer = gen.entity("Customer", (t) => ({
  id: t.uuid(),
  email: t.email(),
}));

query.from(Customer);
```

Avoid:

```ts
query.from<"Customer", CustomerRow, CustomerId>("Customer");
```

The normal authoring flow should need:

```txt
no casts
no explicit generic arguments
no manual narrowing
```

## 20. Performance Rules

This design is powerful because it is declarative enough to optimize.

Performance rules:

- patterns compile to `GraphIndex` / `GraphView` lookups;
- whole-graph scans are debug/small-graph escapes;
- matches stream by default;
- materialization is opt-in;
- projections have explicit cache lifetimes;
- cardinality/order/iterability facts are part of cache keys and target
  legality checks;
- morphisms emit deterministic patch IDs / derived fact IDs;
- derived facts carry source hashes and producer provenance;
- artifact emission is content-addressed;
- meta graph traces are layered and opt-in;
- pipelines schedule incrementally by dependency keys.

Cache key ingredients:

```txt
dialect version/hash
dependency dialect versions
morphism ID
read fact hash
configuration hash
target capability hash
```

This is what makes large projects feasible.

## 21. What The Full Experience Should Feel Like

A beginner should write:

```ts
const app = gen.kit.saas("Billing", {
  entities: {
    Customer: {
      email: "email",
      displayName: "string",
    },
    Invoice: {
      customer: "Customer",
      total: "money",
      status: ["draft", "issued", "paid"],
    },
  },
});
```

A power user should write:

```ts
const app = gen.app(
  "Billing",
  {
    dialects: [
      DomainDialect,
      RuleDialect,
      CallableDialect,
      ReactivityDialect,
      PostgresDialect,
      TanstackQueryDialect,
    ],
  },
  (g) => {
    const Customer = g.entity("Customer", (t) => ({
      id: t.uuid(),
      email: t.email(),
    }));

    const Invoice = g.entity("Invoice", (t) => ({
      id: t.uuid(),
      customerId: t.ref(Customer),
      total: t.money(),
      status: t.enum("draft", "issued", "paid"),
    }));

    const canViewInvoice = g.rule.for(Invoice, ({ field, actor }) =>
      expr.eq(field(Invoice.fields.customerId), actor.customerId),
    );

    const listInvoices = g.query("listInvoices").from(Invoice).guard(canViewInvoice).key(Invoice);

    const markPaid = g.action("markPaid").update(Invoice).set(Invoice.fields.status, "paid");

    return { Customer, Invoice, canViewInvoice, listInvoices, markPaid };
  },
);
```

Then:

```ts
const preview = app.preview();
preview.print();

app.explain(app.refs.markPaid).print();

await app.emit(PostgresDialect.pipelines.emitSchema);
await app.emit(TanstackQueryDialect.pipelines.emitClient);
```

Behind that simple surface:

```txt
typed facts
  -> indexed patterns
  -> typed matches
  -> graph morphisms
  -> patches
  -> diagnostics/repairs
  -> target dialect facts
  -> artifacts
  -> explanations
```

That is the intended Gen2/Dirived experience: Rails at the surface, MLIR
in the middle, TypeScript-native in the editor.

## 22. References, Instances, And Datalog-Shaped Queries

A few questions readers familiar with MLIR / Datomic / Datalog ask
early. Distilled answers, because they clarify the model.

### 22.1 References And Value/Reference Semantics

The graph storage is the value-store. Nodes hold values — typed
`custom` payloads, semantic-type values, expression literals. Edges,
expressions, patches, queries, and actions never embed those values;
they hold **typed refs**.

The ref family is fully branded:

```txt
KernelObjectRef                       opaque stable id
KernelNodeRef<NodeKind>               narrowed to one node-kind
                                      (what `invoiceNode.related.lines()` returns)
Ref<Entity>                           domain-level entity ref
NamespacedKernelId<Kind, Namespace,
                   Witness, Name>     branded ID — node.kind cannot be passed
                                      where edge.kind is expected
```

Equality is **witness identity** (id), not structural equality.
Mutation is a `GraphPatch`, not in-place writes — patches reference
the affected node/edge by id and are reversible/serializable. There is
no value/reference duality at the IR level: everything in the graph is
a value, and you point at it by ref. At the semantic-type layer the
usual scalar-vs-handle split applies (`Types.money` is a value;
`Customer` flows as `Ref<Customer>`).

Refs are dialect-branded — `BillingDialect.id.nodeRef(...)` produces a
ref tagged with `"billing"` so it cannot be passed where another
dialect's ref is required. Cross-dialect identity mixups are type
errors, not runtime errors.

### 22.2 Kinds And Instances (the MLIR analogy)

The MLIR layering shows up as a kind/instance split throughout the
kernel:

| MLIR                  | Gen2                                                            |
| --------------------- | --------------------------------------------------------------- |
| op-def (`arith.addf`) | `defineOperation(...)`, also `defineNodeKind`, `defineEdgeKind` |
| op instance in region | `KernelNode` / `KernelEdge` (a `patch.addNode(InvoiceNode, …)`) |
| SSA value             | `KernelNodeRef<InvoiceNode>`                                    |
| operand list          | `expr.call(AddMoney, [a, b])` — args are typed sub-`Expr`s      |
| function              | `gen.query(...)` / `gen.action(...)` — itself a node            |
| call-site             | invoking a query/action with a concrete `Ref<Invoice>`          |

"Applying to a particular instance of a function" is therefore:
construct an `Expr` whose leaves are refs to specific node instances
(`expr.field(Invoice, Invoice.fields.status)` against an `Invoice` ref
bound by a pattern match or a query input). The op-def stays a kind;
the call is an instance.

The relation accessors from §4 are the same pattern: `.relations({...})`
declares the relation kind on the node _kind_; `invoiceNode.related
.lines()` walks the edge index from one node _instance_ and returns
typed refs to other instances.

### 22.3 Datalog-Shaped Queries

`definePattern(...)` from §12 is exactly Datalog over the EAV-shaped
graph. Node-with-kind ≈ E/A; typed edges ≈ triples with named
endpoints. The properties that carry over from Datomic / Datalog:

- **Named bindings preserved and typed** in the match callback. The
  pattern's `.edge("write", ...)` step contributes a `match.write`
  binding whose endpoint refs are typed against the edge kind's
  endpoints.
- **`same(...)` is unification across edges** — the join keys.
- **Match modes** mirror Datalog's lazy/limit semantics:
  `stream | first | count | materialize`.
- **Compiles to indexed lookups** on edge-kind, not whole-graph scans
  (PLAN §A: `GraphIndex` + `GraphView`).
- **Patterns declare their read keys** so the scheduler can cache and
  incrementally invalidate matches when patches touch the same keys —
  the IVM angle Datomic gets via tx-data.
- **Relation accessors give pull-style navigation**:
  `pattern.from(Invoice).relation("lines")` is a typed traversal whose
  binding is `KernelNodeRef<InvoiceLine>[]`.
- **The meta graph is itself queryable** (§17): "what produces this
  edge kind?", "what depends on this field?" — Datomic's "schema is
  data" property carries through to dialects, morphisms, surfaces, and
  pipelines.

What's _not_ there today (vs full Datomic):

- No first-class as-of / history queries on the authoring pattern API.
  The run meta graph stores stage runs and provenance, but you don't
  write `(d/as-of db t)` over user facts; the "history" surface is the
  explanation/repair trace.
- No general recursive Datalog rules. Quantifiers (`exists` / `forall`)
  and refinement composition cover most cases; deeper recursion lands
  as a morphism with a fixpoint pass rather than a pattern.

### 22.4 Targeting Something Other Than Web Apps

The kernel/dialect/morphism/surface/pipeline machinery is **target-
agnostic** — nothing in `src/kernel/` knows about SQL or React. So the
question "could I compile to C / WebGPU / firmware / a stored-proc
runtime?" splits cleanly:

**What works.** A `defineDialect("c")` with node kinds for translation
unit / function / struct / expression, lowerings from the semantic
graph to that dialect, and an emitter that prints `.c` files. The
same way `PostgresDialect` lowers entities → tables, a `CDialect`
could lower entities → structs and operations → functions. Meta
graph, incremental invalidation, surface negotiation, and provenance
all carry over. This is the kind of target swap the architecture is
designed for.

**What doesn't help.** The _semantic vocabulary_ on top of the kernel
is shaped for full-stack apps — entities, fields, RLS policies,
queries, actions, ClientSafe traits, optimistic UI, money/email
semantic types. If the goal is to compile _application_ logic to a
non-web target (a C runtime, an embedded stored-proc engine, a
WebAssembly worker), reuse most of it. If the goal is to write
_systems code_ (kernels, parsers, firmware), you'd be replacing the
entire upper stack and using only the kernel — at which point a
mature C/LLVM ecosystem like MLIR itself is a better fit.

The honest framing:

| Goal                                                          | Verdict                                         |
| ------------------------------------------------------------- | ----------------------------------------------- |
| "Compile my Gen2 app's logic to a C runtime instead of TS/PG" | Yes — write a `CDialect` + lowerings + emitter. |
| "Use Gen2 as a general C compiler framework"                  | No — use MLIR. Gen2's value-add is wasted.      |
| "Add a new web/data target (DuckDB, Cloudflare D1, GraphQL)"  | Yes — this is the canonical extension story.    |

The ceiling is set by the semantic vocabulary, not the kernel.

## 23. Portability And Formal Verification

The same property powers both: **business logic lives in the IR as
typed graph facts with structured boolean bodies, not as opaque code,
so it can be both _re-emitted_ into any target language with
appropriate lowerings and _interrogated_ by external proof tools
without re-parsing source.** Portability and verifiability are two
projections of the same underlying invariant.

### 23.1 Why portability works

Most "this app should work in TypeScript and Rust" attempts hit the
same wall: the application logic is _encoded in the host language_
(control flow, exceptions, type tricks, library calls), so porting
means rewriting. Gen2 inverts that — application logic is encoded in
the _graph_, and the host language is a target.

The only things that exist as semantic facts:

| Kind                                          | Form                                                       |
| --------------------------------------------- | ---------------------------------------------------------- |
| Entities & fields                             | Typed nodes with semantic types                            |
| Operations                                    | Nodes with keyed input/output records                      |
| Expressions                                   | Trees of operation calls over typed refs and values        |
| Rules / preconditions / postconditions / laws | Predicates with `Expr<boolean>` bodies                     |
| Identity & ownership                          | Branded laws (`RETURNS_SAME_IDENTITY`, `BORROWS_INPUT`, …) |
| Effects                                       | Typed edges (`ActionWritesField`, `ActionReadsField`)      |
| Refinements                                   | `Subject.where(predicate)` — composable claim sets         |

None of these mention TypeScript, Postgres, or React. Each target is
a **dialect** that ships morphisms from these semantic facts to its
own vocabulary. Adding a new target is adding a new dialect:

```txt
semantic graph
  ├─ PostgresDialect lowerings  → schema.sql, RLS, triggers
  ├─ TanstackQueryDialect       → client query bindings
  ├─ ReactDialect               → forms, lists, optimistic UI
  ├─ EffectDialect              → server handlers
  ├─ CDialect (you write)       → .h structs, .c functions
  ├─ RustDialect (you write)    → enums, traits, async fns
  └─ PythonDialect (you write)  → dataclasses, FastAPI routes
```

The same `TransferMoney` operation — with the same precondition
(`from.balance >= amount`), same postcondition (`r.from.balance ==
p.from.balance - p.amount`), same identity laws (`from` and `to`
keys preserved) — can lower to:

- a Postgres function with `CHECK` constraints and a transactional `UPDATE`;
- a TypeScript handler with assertion guards and an Effect program;
- a Rust function with affine types proving the consume claim;
- a Python dataclass method with runtime asserts.

**The boundary.** Portability is bounded by the **semantic
vocabulary**, not the kernel. If a target needs concepts the
standard dialects don't model (GPU memory, real-time deadlines,
cryptographic protocols), you extend the vocabulary first. If you
use `expr.opaque(...)` escape hatches, those islands won't port —
they need a per-target reimplementation, and that's why opaque code
has to declare its blast radius (PLAN §O5). The discipline is: keep
the load-bearing logic structural; keep escape hatches small and
labeled.

### 23.2 Why formal verification works

Laws, rules, preconditions, postconditions, and invariants aren't
strings, doc comments, or runtime asserts. They are **typed
Predicate nodes whose bodies are `Expr<boolean>` trees over a fixed
first-order logic vocabulary** (§8: `and`, `or`, `not`, `implies`,
`iff`, `exists`, `forall`, typed comparisons over semantic types).
That's the exact shape program-verification tools want as input:

| Claim shape                                                                         | Proof technique              | Tools                        |
| ----------------------------------------------------------------------------------- | ---------------------------- | ---------------------------- |
| `Laws.associative(AddMoney)` — algebraic identity                                   | Equational reasoning         | Z3, CVC5, Coq, Lean          |
| `pre: from.balance >= amount` + `post: r.from.balance == p.from.balance - p.amount` | Hoare-logic VC generation    | Why3, Dafny, Frama-C         |
| `RETURNS_SAME_IDENTITY` + `CONSUMES_INPUT`                                          | Linear/affine type discharge | Rust borrow-checker analogue |
| `forall(InvoiceLine, line => line.invoice == this && line.qty > 0)`                 | First-order satisfiability   | Z3, CVC5                     |
| `Subject.where(canArchive)` refinement                                              | Refinement-type discharge    | F\*, LiquidHaskell-style     |
| Endpoint trait constraints (per §4.1)                                               | Subtyping / set membership   | Native to the type system    |

The infrastructure is already shaped for this. From §10:

```ts
const ProvedBySolver = defineAssuranceKind({
  id: assuranceId.kind("proved_by_solver"),
  strongerThan: [Tested],
});
const CoqProof = defineAssuranceKind({
  id: assuranceId.kind("coq_proof"),
  strongerThan: [ProvedBySolver],
});
const LeanProof = defineAssuranceKind({
  id: assuranceId.kind("lean_proof"),
  strongerThan: [ProvedBySolver],
});
```

`Assurance` is an **open registry of partially-ordered edge kinds**.
A formal-verification dialect is just another dialect:

```ts
const Z3VerifierDialect = defineDialect({
  namespace: "z3",
  morphisms: {
    predicateToSmt: defineMorphism({
      // Lowers Predicate nodes to SMT-LIB2 assertions.
      // Runs the solver. On success, attaches a ProvedBySolver edge
      // from the predicate to a proof artifact node.
    }),
  },
});
```

After the solver dialect runs, the planner reads the strengthened
assurance off the predicate's edges and picks more aggressive
lowerings (the §10 / PLAN §B3a table: `Asserted` → server runtime
check; `ProvedBySolver` → no runtime check needed). The proof and
the artifact selection are in the same graph — no separate "verified
version" of the codebase.

**The boundary.** Verifiability is bounded by what the body's
vocabulary can express _to_ the solver:

1. **Decidability.** Algebraic laws over commutative monoids are
   easy; quantifiers over unbounded collections are not. The
   verifier dialect categorizes each claim by what it can discharge
   automatically and what it can't.
2. **Opaque escape hatches.** `expr.opaque(...)` blocks the proof
   exactly as it blocks portability — a body the solver can't read
   isn't provable. Hence the same discipline: small, labeled,
   blast-radius-declared.
3. **Assurance honesty.** A `ProvedBySolver` claim that's not
   actually backed by a solver run is a typed diagnostic. The
   assurance edge has provenance back to the proof artifact; if the
   artifact is missing or stale (source hash changed), the assurance
   downgrades automatically.
4. **Solver coverage.** Different solvers handle different
   fragments. The dialect graph supports this naturally — register
   multiple solver dialects, each contributing to the assurance
   partial order; the planner picks the strongest discharged claim.

### 23.3 Where the two meet — certified codegen

This is the part that's rare. In most systems, the artifact you ship
and the artifact you verify are different — verified specs in TLA+
get hand-translated to Java; Coq proofs get extracted to OCaml;
Dafny outputs C# you have to trust the extractor for. Each
translation step is a place trust leaks.

In Gen2, the **same graph** is:

- the source of the SQL schema;
- the source of the React forms;
- the source of the Effect programs;
- the source of the C structs (if you write the dialect);
- **and the source of the SMT/Coq/Lean proof obligations.**

A proof against the graph is a proof about _every artifact the graph
emits_, because each artifact's lowering is itself a typed morphism
whose correctness is part of the dialect's contract. The provenance
chain (`app.showSourceFacts(...)`, §3) lets you point at any byte of
any output and walk back to the predicates that justify it.

Lowerings can themselves carry assurance claims that they preserve
the source predicates. That's how you get _certified codegen_ — not
just "the source is verified" but "the emitted target is verified to
satisfy the source's claims."

```ts
const PostgresLoweringPreservesAuth = defineLaw({
  id: postgresId.law("policyToRls.preservesAuth"),
  subject: PostgresDialect.morphisms.policyToRls,
  body: ({ source, emitted, forall }) =>
    forall(Actor, (actor) =>
      expr.iff(
        source.policy.allowsRead(actor),
        emitted.rlsPolicy.admitsRow(actor, source.policy.entity),
      ),
    ),
}).withAssurance(ProvedBySolver);
```

`source` and `emitted` are typed witnesses drawn from the morphism's
`from` and `to` declarations — no opaque records, no string
introspection. When that law has a `ProvedBySolver` assurance, the
artifact carries a transitive proof that the RLS policy enforces the
source-level access rule. The artifact itself becomes a verifiable
witness, not just generated text you have to trust. Full callback
shape spec'd in PLAN Track Q §Q6.

### 23.4 The honest framing

- **Portability is _real_** for any target you write a dialect for.
  Adding a target is real work but bounded — it's writing morphisms
  over a fixed semantic vocabulary, not redesigning the
  architecture.
- **Verification is _available_** for any predicate whose body lives
  in the standard FOL vocabulary and whose subjects use the standard
  semantic types. Opaque code isn't portable and isn't verifiable,
  by the same mechanism.
- **Both compose** — a dialect's morphism can carry an assurance
  claim that the lowering preserves the source predicates.

The architecture doesn't make verification easy; it makes
verification _possible_, and removes the usual "we'd have to rewrite
everything in a verification-friendly format" objection. The format
the verifier wants is the format the codegen wants — the typed
graph IR. Tracked in PLAN Track Q.
