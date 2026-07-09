# Lessons from effect-atom-jsx (design sharpening)

> Companion to [`PLAN.md`](./PLAN.md). Source: the sibling project at
> `~/effect-atom-jsx` (same author) — an Effect-native fine-grained reactive
> JSX runtime with witness-keyed invalidation, three-axis `A/E/R` atom
> typing, slot-contract components, single-flight mutations, and typed
> SSR/hydration. Its `docs/archive/GEN2_UI_IMPLEMENTATION_NOTES.md`
> cross-references this repo; the two projects are halves of one research
> program. This doc records what gen2's plan adopts from it.
>
> Status: strategic lessons below are settled; the "Concrete mechanisms"
> section is being filled in from a file-level deep dive.

---

## 1. Strategic lessons (adopt into PLAN)

### 1.1 Witness-tiering is the universal API pattern — name it and apply it everywhere

effect-atom-jsx's `Reactivity.Key.make("users")` returns a literal-typed
witness shared by the tracked read and the invalidating write, so a typo is
a compile error instead of a silent non-refresh. Gen2 already does this for
node/edge identity (`ref.node` vs `ref.parse`/`ref.unsafe`). The lesson is
that this is one pattern with three tiers, and every gen2 surface should
state which tier it is on:

| Tier    | Shape                                            | Who uses it                    |
| ------- | ------------------------------------------------ | ------------------------------ |
| Witness | typed def/ref object carrying literal identity   | authored code + generated code |
| Parse   | `x.parse(string)` — validated ingestion boundary | serialization, wire, storage   |
| Unsafe  | `x.unsafe(string)` — explicit escape hatch       | dynamic/legacy interop only    |

Apply explicitly to: reactivity keys (KeyFamily dialect), trait/kind/law
identity (done), provider/requirement identity, artifact IDs, and the
public `gen.*` builder returns. Emitters emit witnesses; strings appear
only at serialization boundaries.

### 1.2 "Type-checked generation is a feature" — make tsc a legalization gate

Their stated principle: generated code that guesses wrong (bad slot,
missing layer, bad token) must fail to compile, not misbehave. For gen2
this becomes a pass-pipeline requirement:

- Target dialects should emit against _maximally-inferring_ surfaces so the
  TypeScript compiler acts as a second verifier after legalization.
- A target's conformance suite should include "emit + `tsc --noEmit` the
  artifact" as a gating check (cheap to automate; catches emitter drift
  against the target library).

### 1.3 One `Result<A,E>` tagged union is the emitted rendering contract

Never ad-hoc `isLoading` booleans. Variants: Loading / Refreshing /
Success / Failure / Defect (their proposal adds Stale / Idle). Exhaustive
rendering via a builder (`Result.builder().onSuccess(...).onFailure(...)
.render()`) — no conditional hooks, stale-while-revalidate baked in.
EntityView emitters should standardize on this contract regardless of
target framework; it is highly generable and diffable.

### 1.4 Layer-bound-once runtimes; test seams are just layer swaps

`Atom.runtime(layer)` binds requirements once and eliminates `R` at
construction; forgetting a dependency is a compile error. Their
`Reactivity.test` layer (manual `flush()`, captured invalidations) makes
reactive code deterministically testable with zero component changes.

Gen2 mapping: the Requirement/Provider topology should lower to exactly
this shape for Effect-family targets, and the **generated-tests obligation
should emit a test layer per target** (deterministic flush + invalidation
capture) rather than mocking at the component level.

### 1.5 Hydration is explicit, typed, per-atom opt-in

`dehydrate(registry, entries)` / `hydrate(registry, payload, resolvers,
{strict})` with a typed `HydrationError` on mismatch; the app chooses which
atoms cross the boundary. Gen2's hydration module should emit against this
explicit contract — whole-state implicit transfer is an anti-goal.

### 1.6 effect-atom-jsx is the closest-fit UI target dialect

Its concepts line up nearly one-to-one with gen2's:

| effect-atom-jsx                            | gen2                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| Reactivity key witnesses / KeyFamily       | KeyFamily dialect, rule-derived invalidation (R-8 `INVALIDATES_KEY` edges) |
| `A/E/R` atom typing, `Atom.runtime(layer)` | Requirement/Provider graph, effect/requirement bubbling                    |
| Slot contracts (`View.Slots.define`)       | EntityView / DesignSystem dialects                                         |
| Single-flight mutation + affected loaders  | boundary/transport planning, mutation plans                                |
| `dehydrate`/`hydrate` per-atom             | hydration/projection module                                                |
| `Result<A,E>` + builder rendering          | EntityView emitted rendering contract                                      |

A `ui-effect-atom-jsx` target dialect is likely a _better first UI target_
than generic React/TanStack: the semantic fit means less lowering loss and
sharper conformance checks. Keep it an emitter — see 2.1.

---

## 2. Cautionary lessons (hold these lines)

### 2.1 Do not absorb the target

effect-atom-jsx reimplemented the atom core instead of depending on
`@effect-atom/atom`, and grew a signal core + component system + router +
server in one package (~23k LOC; `Route.ts` alone 3.2k). Gen2's defense is
the kernel/dialect split — hold it: gen2 _targets_ effect-atom-jsx or
`@effect-atom/atom` via emitters; their semantics never enter `src/kernel`
or core dialects.

### 2.2 Inference has a ceiling — budget deliberate widening points

Even expert-level TS hit `TS2589` (deep instantiation) and deliberately
widened JSX children and route-metadata roots to `unknown`. Expect the same
at gen2's deepest witness chains (graph queries over large dialect unions,
full-registry inference). Treat deliberate widening as a designed feature
with a named location, not a defeat. Candidate rule for
`typescript_inference_cheatsheet.txt`: "every unbounded-depth inference
surface needs a designated widening point and a type-test pinning where
inference stops."

### 2.3 Generate against frozen target snapshots

Both projects track Effect 4 beta + bleeding-edge TS; effect-atom-jsx runs
a "breaking-change-first" redesign with a long rename table. Emitters must
pin target-library versions and generate against a frozen API snapshot,
with golden tests per snapshot — never "latest."

### 2.4 Distinguish type-verified from runtime-implemented

Their slot/token/capability checks are compile-time enforced while some
tooling and alternate renderers are declared-but-deferred. Gen2 diagnostics
for target capabilities should carry this distinction explicitly (a
capability can be `checked`, `implemented`, or `declared`) so legalization
does not treat a declared contract as a shipped runtime.

---

## 3. Concrete mechanisms (from file-level deep dive)

### 3.1 Key witness (`src/Reactivity.ts`) — the KeyFamily dialect template

```ts
interface ReactivityKeyWitness<Name extends string = string> {
  readonly [ReactivityKeyTypeId]: true;
  readonly name: Name; // "users" | "users:42"
  readonly keys: ReadonlyArray<NormalizedReactivityKey>; // ancestors + self
  readonly child: <Sub extends string | number>(sub: Sub) => ReactivityKeyWitness<`${Name}:${Sub}`>;
}
interface KeyFamily<Name extends string> {
  <Sub extends string | number>(sub: Sub): ReactivityKeyWitness<`${Name}:${Sub}`>;
  readonly key: ReactivityKeyWitness<Name>; // callable object; .key = parent
}
```

- A witness _is its own hierarchy_: `keys = [...ancestors, self]`, so
  invalidating a child reaches parent observers for free. Directly portable
  to R-8 `INVALIDATES_KEY` edges: emit the child witness; ancestor
  invalidation falls out of the expansion, not extra edges.
- Reads (`tracked`) and writes (`invalidating`) funnel through one
  `normalizeReactivityKeys(witnesses | strings | Record<key, subs[]>)` —
  witnesses and raw strings normalize to the same strings, so the runtime
  stays stringly and interoperable; witnesses only kill authoring typos.
  This is the witness/parse/unsafe tiering (§1.1) proven end to end.
- `invalidating` resolves keys **from the success value** (`Effect.tap`),
  i.e. invalidation keys can be a function of the mutation result — gen2's
  derive pass should support result-dependent key expressions.
- Dependency capture uses a push/pop `readCaptureStack`
  (`beginReactivityReadCapture()/end()`): run a thunk, collect touched
  keys. That is a witness-driven dependency-capture kernel gen2 can use
  when deriving reads/writes edges from opaque runtime adapters.

### 3.2 Test layer — one `makeLive` flag away

`live` = `makeLive({ autoFlush: true })` (microtask-batched, deduped
subscriber flush). `test` = `makeLive({ autoFlush: false,
captureLastInvalidated: true })` — nothing fires until manual `flush()`,
and `lastInvalidated()` returns exactly which keys flushed. Deterministic
assertions like `expect(keys).toEqual(["todo","todo:1"])` with zero
component changes. **Gen2's generated-tests obligation should emit this
per target**: same runtime, one constructor flag, manual flush + capture.

### 3.3 R-erasure (`src/Atom.ts`) — the Requirement/Provider lowering shape

```ts
// Atom.runtime(layer): AtomRuntime<R, E> — Layer bound once
atom<A, E2, RReq extends R = R>(effect: Effect<A, E2, RReq>): ResultAtom<A, E2> // R gone
```

Constrain-then-erase: the generic bound `RReq extends R` proves the
provider covers the requirement; the return type drops the axis. This is
the exact type-level shape gen2's Provider-satisfies-Requirement lowering
should emit. Companion trick: `...runtime: [R] extends [never] ?
[runtime?: X] : [runtime: X]` — an argument that is optional exactly when
the requirement axis is empty.

Branding: three `unique symbol` TypeIds (`TypeId` / `ReadonlyTypeId` /
`WritableTypeId`) plus an optional phantom `[TypeVarianceId]?: { A; E; R }`
keep readonly/writable atoms structurally distinct with no runtime cost —
same triad gen2 uses for node/edge kinds; note `Writable<R, W, E, Req>`
separates read and write types (read/write asymmetry EntityView needs).

`Atom.family` caches by a **reference-identity trie** over the argument
tuple (no key stringification) — reusable for per-entity view caches.

### 3.4 Runtime semantics to emit (`src/effect-ts.ts`)

- `atomEffect`: Effect runs inside a reactive computation (sync dep
  registration); on dep change, **interrupt the in-flight fiber**, set
  `Refreshing(previous)`, refork; outcomes map via `matchCause` to
  Success / Stale(err, lastGood) / Failure / Defect. This is the canonical
  runtime contract for gen2's emitted reactive derived nodes.
- `defineMutation`: optimistic → run → on success: set result, invalidate
  keys, refresh hooks; on failure: rollback. A `runVersion` counter makes
  superseded runs no-ops (typed `MutationSupersededError`) — adopt in
  mutation-plan lowering.
- `createOptimistic`: an overlay signal (`{hasValue} | {hasValue, value}`)
  over any source; reads fall through when no override. Minimal, generable
  optimistic-update shape.

### 3.5 Result lattice + accumulating builder (`src/Result.ts`)

Six-variant async state: `Loading | Refreshing<A,E> | Success<A> |
Failure<E> | Stale<A,E> | Defect`, each settled variant carrying a
canonical `exit: Exit<…>` for lossless round-tripping (the serialization
anchor for hydration). The rendering contract:

```ts
onSuccess<R2>(f: (v: A, meta) => R2): Builder<A, E, R | R2>  // result type accumulates
render(): R | undefined
```

Union-accumulating fluent builder — the emitted view-hole renderer's
result type is inferred from the arms provided. EntityView should emit
exactly this contract.

### 3.6 Hydration contract (`src/Hydration.ts`)

`dehydrate(registry, entries)` / `hydrate(registry, payload, resolvers,
{strict})`; participation is **per-atom opt-in** (must appear in
`entries`/`resolvers` — no global sweep); envelope is branded; errors are
typed (`HydrationUnknownKeys` / `HydrationMissingKeys`), surfaced in the
Effect error channel under `strict`. Template for gen2's hydration module:
a node participates only if the emitter registers a resolver for it.

### 3.7 Single-flight envelope (`src/SingleFlightTransport.ts`)

```ts
{ ok: true; payload: { mutation: A; url: string;
    loaders: Array<{ routeId: string; result: unknown }> } } | { ok: false; error: E }
```

One round trip returns the mutation result **plus** refreshed data for all
affected loaders; "affected" = loaders of the route tree matched by the
current URL. Composition with §3.1: the keys a mutation invalidates
determine which loaders are affected; the payload carries their new
values. This is a precise IR for gen2's boundary planner — mutation plan +
affected-Provider set shipped together. Discovery ladder (layer-provided
transport → installed global → direct fetch → plain effect, with
`mode:"force"` failing loudly) is a good progressive-enhancement shape.

### 3.8 Slot contracts (`src/View.ts`, `src/Style.ts`)

`Slots.define<const T>(definitions)` — const type param preserves record
keys as literal slot names; each slot gets phantom capability/events/attrs
types with defaults. Downstream attachment is checked by a **mapped type
keyed on the contract's names**:

```ts
forSlots<const W>(slots): (styles: { [K in SlotContractNames<W>]?: StyleValue }) => …
```

Unknown slot ⇒ compile error; component compatibility is a structural
`Record<TargetNames, Handle>` check. This is the type-level analogue of
gen2's Requirement/Provider check and the template for EntityView /
DesignSystem contract checking.

### 3.9 Their notes on gen2 (`docs/archive/GEN2_UI_IMPLEMENTATION_NOTES.md`)

Their review of gen2's UI IR — worth treating as external design review:

- **Port conceptually**: slot metadata `{ name, capability, hidden }` with
  phantom platform/capability params; views as inspectable data; the
  `SafeHtml` brand (brands only — sanitization stays the caller's job,
  documented); runtime validation for _generated/dynamic_ attachments
  (compile-time checks cover authored ones); slot remap compatibility
  checks; platform metadata for diagnostics.
- **Do not port**: gen2's stringly generator metadata
  (`Component.props_type: string`, `Behavior.body: string`,
  `View.structure: string`) as runtime API.
- **ViewTree advice**: don't build the full static UiNode tree IR first —
  ship a minimal runtime `View<Slots>` with `node: unknown` and grow
  optional typed tree/hole metadata later.
- Their `checkUi` diagnostics list (duplicate slots, capability mismatch,
  style-targets-hidden-slot, etc.) maps onto gen2 verify passes for the
  UI dialect.
- Since those notes, effect-atom-jsx **implemented** the recommended
  runtime shape — so gen2's UI emitter now has a concrete IR consumer to
  target (§1.6).

---

## 3b. UI subsystem mechanisms (holes, capabilities, renderers, routing, composition)

### Capability lattice — the spine (fully working there; adopt for UI traits)

Capabilities are branded metadata tokens with an explicit parent list,
reified **twice**: at runtime as a string-keyed DAG (`extendsCapability`
does a visited-set DFS; custom capabilities extend built-ins without
touching core) and at the type level as a `Self ∪ Ancestors` assignability
union:

```ts
type AssignableNamesOf<T> =
  T extends Capability<any, infer Extends>
    ? NameOf<T> | AssignableNamesOf<Extends[number]>
    : NameOf<T>;
// AssignableNamesOf<TextInput> = "TextInput" | "Focusable" | "Interactive" | "Base"
```

Assignability is union membership, not TS subtyping — the lattice is data,
extensible, and checkable by both the compiler and verify passes. Every
attachment (style, behavior, slot remap, platform check, a11y role) gates
through it. Failures surface as a **branded `TypeErrorMessage<"Handle
capability 'X' does not satisfy slot capability 'Y'">`** — a readable
sentence, not a structural dump. Gen2's UI dialect capability traits
should adopt all three: dual reification, union-membership assignability,
and readable branded type errors (worth considering for kernel witness
mismatches generally).

Parallel hierarchies: capability _tokens_ (declarative claims) vs runtime
_handles_ (op interfaces), bridged by most-specific-first `handleFor` —
same shape as gen2's Trait (claim) vs Interface/Protocol (behavior) split,
independently converged on.

### Holes — typed content insertion points (adopt the typing, fix their gap)

Holes are a tagged union of content kinds (`text | class | style | html |
event | children`); the html hole only accepts branded `SafeHtml`; the
**event hole carries phantom `Req`/`E`** so a handler's effects/requirements
propagate into the view's type. Structural insertion points (slots) are a
separate concept from content insertion points (holes) — keep that split.
Caution: their renderer-neutral `ViewNode` tree "rides alongside" the real
JSX and stayed a perpetual empty-fragment placeholder because no compiler
extraction exists, and hole nodes are no-ops in tree validation. Gen2, as
the compiler, can make the tree the _primary_ artifact and type/check hole
values for real.

### Renderer independence — own the lowering, not just the contracts

Their contracts (Handle ops, `View<Slots>`, Platform-as-service,
`IsPlatformCompatible<Slot, Platform>` compile-time checks) are genuinely
renderer-neutral, and a **pure in-memory Handle implementation** lets the
whole slot/behavior/capability system run testable with zero DOM. But the
pixel path is DOM-only because JSX compilation was delegated to an
external DOM-targeting compiler — TUI/native never shipped. Lesson: gen2
must own the lowering stage as the abstraction point (emitters per
renderer), and should emit a pure in-memory handle target as the neutral
reference implementation for generated-test purposes.

### Routing — the SWR/reactivity fusion is the prize

- Type-level path-param extraction from the literal pattern
  (`ExtractParams<"users/:id">` via template-literal recursion) + Effect
  Schema decode of 7 request parts (params, form, body, query, headers,
  cookies) = the boundary-dialect contract shape.
- Loader `A/E/R` propagates into the route node and component Req — the
  model for boundary planning requirement bubbling.
- **Standout**: loader SWR cache keyed `(routeId, stable-params-json)`
  where keys _read during the loader_ are captured
  (`beginReactivityReadCapture`) and stored on the cache entry, with a
  reverse index `reactivityKey → cacheEntries`; invalidating a key marks
  exactly the dependent loaders stale. This is the runtime contract gen2's
  rule-derived invalidation should lower to for route/loader targets.
- Caution: they maintain two route-definition tiers (component-first and
  tree-first) with real duplication and legacy fallbacks — gen2's route
  dialect should have one canonical form.

### Component composition — a 5-axis IR

`Component<Props, Req, E, Bindings, SlotContract>`; every composition
operator is `(component) => component` recomputing all five axes:

- `withLayer`: requirement subtraction + input addition
  (`Exclude<Req, ROut> | RIn`) — provider boundaries as typed transforms.
- `withErrorBoundary`: subtracts handled `_tag`s from `E` — typed error
  narrowing at composition seams.
- `setup<Props>().bind(name, f)`: accumulates `Bindings & {name: A}`,
  unions `E`/`R`, rejects duplicate names at the type level; `use(fragment)`
  composes setup fragments.
- Slot remapping (`remap(source, target)`) validated by capability
  compatibility — wrappers re-expose inner slots under new names safely.
- Lifecycle: reactive owner tied to Effect `Scope`; unmount = scope close =
  owner disposal + finalizers; a post-dispose `assertLive` guard throws on
  writes after teardown.
- `PreserveRouteMetadata`: composition operators must carry foreign
  annotations through, or wrappers silently drop loader/guard metadata —
  the runtime analogue of gen2's "adapters lose no metadata" invariant;
  gen2 transforms/morphisms should enforce it as a law.

---

## 3c. Events, behaviors, styles (Dispatch + DesignSystem dialect lessons)

### Events — a deliberate refusal to unify (read before finalizing Dispatch)

Their ratified event design (`src/Event.ts` + `EVENT_RUNTIME_PLAN.md`) keeps
five mechanisms separate with explicit bridges: `Event` channels = facts
(typed Effect PubSub), `Atom` = state, `Atom.action` = commands,
`Reactivity` keys = invalidation, `Element.on` = input. Channel identity is
an opaque service key (`ServiceMap.Key` from `` `Event/${name}` ``) — the
_symbol is the identity, the name is metadata_ — so distinct channels
cannot cross-deliver by construction and there is no global bus, registry,
or replay. They explicitly rejected a global `Event.Runtime` bus and an
`Atom.onChange→Event` auto-bridge (feedback loops).

Gen2's Dispatch primitive collapses what they keep apart. That can still be
right — Dispatch is IR, not runtime — but the lesson is: **Dispatch nodes
must record which role they lower to (fact / command / invalidation /
input), lower to separate runtime mechanisms with explicit bridge edges,
and the verify pass must reject auto-bridges that create cycles.** Their
`EventChannel` split (contract = inert data; channel = scoped service;
witness carries payload type via phantom) is the emission shape.

Also: their `EventHole<Event, Req, E>` (event handlers carrying Effect
requirements through the view type) is **typed but unwired** — no runtime
ever forks the returned Effect; DOM handlers discard return values. Gen2
emitting against it would be emitting against a contract with no
implementation — instance of the "type-verified ≠ runtime-implemented"
guardrail (§2.4).

### Behaviors — composition algebra + the coordination gap

- `Behavior<Elements, Bindings, Req, E>`: Elements typed by capability;
  `compose` intersects Elements/Bindings and unions Req/E (last-wins on
  binding collision) — the algebra for gen2 behavior composition.
- `attachToAllWithCapability` walks the runtime capability DAG
  (`extendsCapability`) — the runtime dual of the type-level
  `AssignableNamesOf` union.
- The composite `combobox` coordinates five sub-behaviors via **untyped
  callback injection** (select → close disclosure → deactivate focus trap)
  because behaviors share no witness for cross-behavior wiring. That
  coordination graph is exactly what gen2's Dispatch/reaction edges can
  type — a concrete place gen2 improves on the source material.
- Cleanup rides entirely on the reactive owner (`Handle.on` registers
  `onCleanup`; `Collection.observeEach` re-runs on set, disposing per-item
  finalizers first) — no separate behavior lifecycle API needed.

### Styles — pieces as data, phantom binding deps, typed token paths

- `StyleValue` is a ~24-variant tagged-union AST ("style values are data,
  not DOM mutations"): slot styles, conditionals, states/pseudo,
  responsive/media/container queries, CSS vars, animation, grid, layers.
  Resolution flattens the AST against bindings at attach time and lowers to
  `Handle.setStyle` calls (inline-style application; no class generation).
  This matches gen2's "EntityView emits style data; lowering interprets it."
- `ComposedStyle<SlotNames, Bindings>` carries a **phantom `_bindings`
  witness** aggregated from `whenBinding` pieces — attaching a style that
  needs binding `X` to a component not exposing `X` is a compile error with
  a readable `TypeErrorMessage`. Model for gen2's style-binding verify pass.
- Theme tokens: `LeafPaths<ThemeTokens>` computes dotted literal paths
  (`"accent.default" | "text.primary" | ...`) via depth-limited
  template-literal recursion, with `string` as escape hatch. **Gap to fix
  in gen2:** their `lookupToken` silently passes unknown tokens through as
  literal strings — no invalid-token diagnostic. Gen2's DesignSystem verify
  pass should reject unknown tokens.
- One brand unifies the metadata vocabulary: `Element.Capability`,
  `View.EventName`, and `Style.Property` are all `MetadataToken<namespace,
Name>` — the generalization gen2's DesignSystem dialect should adopt as
  its token primitive.
- Variants/recipes (`variants(def)`, `recipe(def)` with `VariantProps`/
  `RecipeProps` extraction) are highly generable shapes for emitted
  component styling. Merge precedence is last-wins shallow spread — gen2
  likely wants an explicit cascade/specificity witness instead.
- Diagnostic codes shipped there: `view:unsupported-slot-event` (behavior
  demands an event outside the slot's allow-list) and
  `style:unsupported-property` (platform capability check) — both direct
  templates for gen2 UI-dialect verify passes.

---

## 4. Additions made to `docs/typescript_inference_cheatsheet.txt`

Extracted tricks appended there: const type parameters for record-key
literal capture; template-literal branded tokens; unique-symbol TypeId +
phantom variance fields; variadic conditional tuples for
optional-when-`never` arguments; bounded-then-erased generics
(R-erasure); union-accumulating fluent builders; `Extract`/`Exclude`
projections on discriminated unions; overload ordering via
excess-property checks; `infer`-based extractor families.
