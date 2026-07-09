# UI target: `ui-effect-atom-jsx`

> Companion to [`PLAN.md`](./PLAN.md) and
> [`effect-atom-jsx-lessons.md`](./effect-atom-jsx-lessons.md). Defines
> gen2's first UI target dialect/emitter: lowering the `dialect.ui`
> EntityView family (`src/forms/forms.ts`, `src/editor/editor.ts`,
> `src/list/list.ts`) plus `dialect.reactivity` (`KeyFamily`,
> `INVALIDATES_KEY`) and `dialect.core.requirement`/`provider` to the
> sibling project `effect-atom-jsx` at `~/effect-atom-jsx`.
>
> **Frozen target snapshot**: `effect-atom-jsx@0.5.0` (from its
> `package.json`, exports `.`, `./jsx-runtime`, `./runtime`, ...). Emitters
> for this target MUST pin this version in the golden/conformance test and
> MUST NOT silently regenerate against a newer sibling checkout. Bumping
> the snapshot is a deliberate, reviewed step with a new golden lock (§5,
> §2.3 of the lessons doc).
>
> This is a design spec, not an implementation. Per the guardrail in
> §2.1 of the lessons doc: gen2 _emits against_ effect-atom-jsx's public
> API surface; none of its runtime semantics enter `src/kernel` or core
> dialects. Everything below lives in a new `dialects/targets/effect-atom-jsx`
> emitter package (not yet created).

---

## 1. Scope: what v1 emits

Source slice: `tests/golden/opsdesk-slice/slice.ts` — one entity
(`Incident`), two rules (`canViewIncident`, `canManageIncident`), one
policy (`incidentPolicy`), one reactivity key (`incidentKey =
gen.key.entity(Incident)`), one query (`listOpenIncidents`), one action
(`acknowledgeIncident`).

v1 emits, for this slice:

1. A **list view** of open incidents (`ENTITY_VIEW_NODE_KIND` /
   `LIST_NODE_KIND` wired via `VIEW_USES_QUERY_EDGE_KIND` to
   `listOpenIncidents`) rendered through the `Result` builder contract.
2. A **detail/edit form** for one `Incident` (`FORM_NODE_KIND` wired via
   `VIEW_EDITS_FIELD_EDGE_KIND` to `Incident.fields.status` and via
   `VIEW_SUBMITS_ACTION_EDGE_KIND` to `acknowledgeIncident`).
3. **Rule-derived UI state**: `VIEW_ENABLED_WHEN_RULE_EDGE_KIND` /
   `VIEW_HIDDEN_WHEN_RULE_EDGE_KIND` from the form/list to
   `canManageIncident` / `canViewIncident` lower to derived boolean atoms
   that gate a `disabled`/`hidden` prop — not to duplicated predicate
   logic in the emitted component.
4. **Invalidation**: `acknowledgeIncident`'s
   `INVALIDATES_KEY_EDGE_KIND` edge to `incidentKey` (materialized today
   by `derive.rule.invalidationDependencies`, §R-8) lowers to the
   mutation's `invalidates` option.
5. **Hydration**: the list query and the edited incident's read atom are
   registered for SSR dehydrate/hydrate; nothing else crosses the
   boundary implicitly (§1.5 of the lessons doc).

Out of scope for v1 (explicitly deferred, see §6 phasing):
multi-entity dashboards, routing/`Route.ts` integration, optimistic UI
beyond the single mutation's `optimistic`/`rollback` hooks, design-system
theming, and any authored event/behavior composition beyond the plain
submit handler.

---

## 2. Lowering map

Table of gen2 IR concept → effect-atom-jsx API. Signatures below are
read directly from `~/effect-atom-jsx/src/*.ts` at the frozen snapshot;
treat them as load-bearing, not paraphrased.

### 2.1 KeyFamily / `INVALIDATES_KEY` → Reactivity key witnesses

gen2 side (`src/dialects/reactivity.ts`): `KEY_FAMILY_NODE_KIND`,
`DERIVES_KEY_EDGE_KIND` (query → key it reads), `INVALIDATES_KEY_EDGE_KIND`
(action → key it invalidates; materialized by
`derive.rule.invalidationDependencies`, R-8).

Target side (`src/Reactivity.ts`):

```ts
interface ReactivityKeyWitness<Name extends string = string> {
  readonly name: Name;
  readonly keys: ReadonlyArray<NormalizedReactivityKey>; // ancestors + self
  readonly child: <Sub extends string | number>(sub: Sub) => ReactivityKeyWitness<`${Name}:${Sub}`>;
}
interface KeyFamily<Name extends string> {
  <Sub extends string | number>(sub: Sub): ReactivityKeyWitness<`${Name}:${Sub}`>;
  readonly key: ReactivityKeyWitness<Name>;
}
```

| gen2 IR                                                                      | effect-atom-jsx emission                                                                                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `KEY_FAMILY_NODE_KIND` node (`incidentKey`, from `gen.key.entity(Incident)`) | one emitted `KeyFamily<"incident">`-shaped witness (module-level `const`)                                                  |
| Entity-scoped key child (per-row invalidation, e.g. a single incident)       | `incidentKey.key.child(incidentId)` — literal-typed child, **not** a new top-level key                                     |
| `INVALIDATES_KEY_EDGE_KIND` (action → key)                                   | emitted mutation's `invalidates:` option carries the witness (or `witness.child(idFromResult)` when the key is row-scoped) |
| `DERIVES_KEY_EDGE_KIND` (query → key)                                        | emitted query's `key:` option in `defineQuery(fn, { key })`                                                                |

**Ancestors-expansion semantics** (§3.1 of the lessons doc): a witness's
`keys` array is `[...ancestors, self]`, so invalidating a child key
(`incidentKey.child(id)`) also flushes observers of the parent
(`incidentKey.key`) for free. Gen2's R-8 pass must emit the **child**
witness reference on the action's `INVALIDATES_KEY_EDGE_KIND` edge when
the write is row-scoped; it must not additionally emit a separate edge
to the parent key — the expansion is a target-runtime property, not
something the gen2 graph should re-derive. The emitter is responsible for
asserting this: if an emitted action's edge targets both a parent key and
one of its own children, that is a diagnostic (`ui-target:redundant-key-edge`),
not a legal double emission.

### 2.2 Requirement/Provider → `Atom.runtime(layer)`

Target side (`src/Atom.ts`):

```ts
export const runtime: {
  <R, E>(layer: Layer.Layer<R, E, never>): AtomRuntime<R, E>;
  addGlobalLayer<R, E>(layer: Layer.Layer<R, E, never>): void;
  clearGlobalLayers(): void;
};
export const runtimeEffect = <R, E>(layer: Layer.Layer<R, E, never>): Effect.Effect<AtomRuntime<R, E>>;
```

R-erasure shape used throughout `Atom.ts`:

```ts
atom<A, E2, RReq extends R = R>(effect: Effect<A, E2, RReq>): ResultAtom<A, E2> // R gone
```

| gen2 IR                                                                        | effect-atom-jsx emission                                                                                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dialect.core.provider` node (e.g. a DB/service Layer providing `IncidentApi`) | one `Layer.Layer<...>` construction, composed by the emitter into a single app-level layer                                                                    |
| Requirement application edge (Action/Query → Provider)                         | proves `RReq extends R` at the call site — the emitted `defineQuery`/`defineMutation` body's effect type must be assignable into the bound `AtomRuntime<R,E>` |
| `Atom.runtime(layer)` binding                                                  | emitted once per artifact module (§5), not per component; `atoms.ts` exports the bound runtime                                                                |

The gen2 Provider/Requirement graph must fully resolve (no dangling
requirement edges) before this lowering runs; an unresolved requirement
is a legalization failure (`ui-target:unbound-requirement`), not a
runtime `R` leak — TypeScript catches the leak anyway per §1.2/2.2 of
the lessons doc, but gen2 should not rely on tsc alone for the diagnostic
message.

### 2.3 Queries → `defineQuery`

```ts
export function defineQuery<A, E, R>(
  fn: (get: QueryGet) => Effect.Effect<A, E, R>,
  options?: DefineQueryOptions<A, R>,
): QueryRef<A, E>;
```

`gen.func.query({ name, input_type, returns, body, reactivity: { key }, auth })`
lowers to:

```ts
export const listOpenIncidentsQuery = defineQuery(() => IncidentApi.listOpen(), {
  key: incidentKey.key,
  name: "listOpenIncidents",
});
```

- `reactivity.key` (gen2) → `options.key` (target) — same witness object,
  no re-derivation.
- `auth: { action, policy_name }` does not lower into the query body
  itself (§2.4 of PLAN — GraphQL-lifted model puts auth on the schema,
  not the resolver); it gates emission — the emitter refuses to emit a
  query whose policy has not been legalized against a server-side guard
  target (out of scope here; cross-reference the boundary/authz emitter).
- Read requirement bubbling (§2.2) applies to `body`'s effect type.

### 2.4 Actions → `defineMutation`

```ts
export interface MutationEffectOptions<A, E, R> {
  runtime?: RuntimeLike<R, unknown>;
  name?: string;
  invalidates?: QueryKey<any> | ReadonlyArray<QueryKey<any>>;
  optimistic?: (input: A) => void;
  rollback?: (input: A) => void;
  refresh?: (() => void) | ReadonlyArray<() => void>;
  onSuccess?: (input: A) => void;
  onFailure?: (error: MutationFailure<E>, input: A) => void;
  onTransition?: (event: { readonly phase: "start" | "success" | "failure" | "defect" }) => void;
  observe?: (event: { ... }) => void;
}
export function defineMutation<A, E, R>(
  fn: (input: A) => Effect.Effect<unknown, E, R>,
  options?: MutationEffectOptions<A, E, R>,
): MutationEffectHandle<A, E>;
```

`gen.func.action({ name, input_type, returns, body })` +
`INVALIDATES_KEY_EDGE_KIND` lowers to:

```ts
export const acknowledgeIncidentMutation = defineMutation(
  (input: Incident) => IncidentApi.acknowledge(input),
  {
    name: "acknowledgeIncident",
    invalidates: incidentKey.key.child(/* result-dependent id */),
  },
);
```

- §3.1's **result-dependent invalidation keys** ("invalidating resolves
  keys from the success value") matters here: when the acknowledged
  incident's id is only known from the mutation result, the emitter must
  emit a `(result) => incidentKey.key.child(result.id)`-shaped resolver,
  not a static key computed from the input. gen2's R-8 derive pass
  should therefore carry, on the `INVALIDATES_KEY_EDGE_KIND` edge,
  whether the key expression is a function of `input` or of the action's
  `returns` type — this is new information the current pass does not
  yet distinguish and must add before this lowering can be correct in
  general (open question, §7).
- `optimistic`/`rollback` are v1-in-scope only for the single
  acknowledge mutation and only when the rule-derived UI state (§2.5)
  already proves the optimistic value satisfies `canManageIncident`
  client-side; otherwise gen2 must not emit an `optimistic` hook (a rule
  it cannot prove client-checkable becomes an optimism hazard, not a
  UI nicety).

### 2.5 EntityView → `View.Slots.define` + `Result.builder`

Target side (`src/View.ts`):

```ts
const Slots = View.Slots.define({
  root: { capability: Element.Capability.Container },
  input: {
    capability: Element.Capability.TextInput,
    allowedEvents: [View.Event.Input, View.Event.Focus],
  },
});
```

Target side (`src/Result.ts`, six-variant lattice: `Loading | Refreshing<A,E> | Success<A> | Failure<E> | Stale<A,E> | Defect`):

```ts
interface Builder<A, E, R> {
  onSuccess<R2>(
    f: (value: A, meta: { waiting: boolean; timestamp: number }) => R2,
  ): Builder<A, E, R | R2>;
  onFailure<R2>(
    f: (
      error: E | { defect: string },
      meta: { waiting: boolean; previousSuccess: Success<A, E> | null },
    ) => R2,
  ): Builder<A, E, R | R2>;
  render(): R | undefined;
}
```

| gen2 IR                                                                             | effect-atom-jsx emission                                                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LIST_NODE_KIND` (open-incidents list) + `VIEW_DISPLAYS_FIELD_EDGE_KIND` per column | one `View.Slots.define({ root, row, ... })` contract + a component rendering `Result.builder(listOpenIncidentsQuery.result).onSuccess(...).onFailure(...).render()`                              |
| `FORM_NODE_KIND` + `VIEW_EDITS_FIELD_EDGE_KIND`/`VIEW_SUBMITS_ACTION_EDGE_KIND`     | one `View.Slots.define({ root, statusField, submit })` contract + component calling `acknowledgeIncidentMutation` on submit                                                                      |
| Slot capability (e.g. `submit` must accept `Focusable`/`Interactive`)               | emitted slot definitions carry `capability: Element.Capability.*`; mismatch is caught by `IsPlatformCompatible`-style structural checks at emit-time (checked, not just declared — §2.4 lessons) |

EntityView's own emitted rendering contract is _exactly_ the six-variant
`Result` lattice, matching §1.3 of the lessons doc — gen2 does not
introduce a parallel `isLoading` boolean anywhere in the emitted code.

### 2.6 Rule-derived UI state → derived atoms

`VIEW_ENABLED_WHEN_RULE_EDGE_KIND` / `VIEW_HIDDEN_WHEN_RULE_EDGE_KIND`
(view → rule) lower to a derived `ReadonlyAtom<boolean>` built from
`Atom.make`/`derived` over the same requirement-bound runtime as the
query/mutation, e.g.:

```ts
export const canManageIncidentAtom = Atom.derived((get) =>
  evaluateCanManageIncident(get(currentIncidentAtom), get(sessionAtom)),
);
```

- The emitted predicate body is a **direct lowering of the rule's typed
  expression tree** (gen2's `Expr<boolean>`), not hand-authored — this
  is the same rule fact that drives R-2 (RLS) and R-6/R-7 (docs); the UI
  lowering is one more consumer of the canonical predicate, per PLAN
  §0.1/§0.1.5 ("the same rule answers many questions").
- `VIEW_ENABLED_WHEN_RULE_EDGE_KIND` → `disabled={!get(canManageIncidentAtom)}`
  on the submit control; `VIEW_HIDDEN_WHEN_RULE_EDGE_KIND` → conditional
  slot omission.
- This is UI _hint_ only — never a substitute for the server-side
  guard/RLS lowering of the same rule. The emitter must annotate the
  emitted atom with a comment/metadata pointer back to the rule id so a
  reviewer can see it is a client mirror, not the enforcement point.

### 2.7 Hydration → `dehydrate`/`hydrate` resolvers

Target side (`src/Hydration.ts`):

```ts
type HydrationError =
  | { _tag: "HydrationUnknownKeys"; keys: ReadonlyArray<string> }
  | { _tag: "HydrationMissingKeys"; keys: ReadonlyArray<string> };
// dehydrate(registry, entries) / hydrate(registry, payload, resolvers, { strict })
```

Per-atom opt-in (§1.5, §3.6 of the lessons doc): the emitter registers a
resolver **only** for atoms it actually emitted for this slice —
`listOpenIncidentsQuery`'s underlying atom and the edited incident's
read atom. Nothing else crosses the SSR boundary implicitly. The
hydration manifest (§5) is the explicit, generated list of participating
atoms; adding a new emitted view/query means regenerating that manifest,
not editing a global sweep.

---

## 3. What NOT to emit against

| Target surface                                                          | Why excluded                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EventHole<Event, Req, E>` (`src/Event.ts`)                             | Typed but **unwired** — no runtime ever forks the returned Effect; DOM handlers discard return values. Emitting against it produces code that type-checks but silently drops the handler's effect. Instance of the type-verified ≠ runtime-implemented guardrail (§2.4 lessons, §3c).                                       |
| The renderer-neutral `ViewNode` tree                                    | Perpetual empty-fragment placeholder — no compiler extraction exists on their side, and hole nodes are no-ops in tree validation. Gen2, as the actual compiler, should not target a tree that is dead weight in the source project; if gen2 needs a structural tree it should own that IR itself (§3.9, "ViewNode advice"). |
| Auto event-bridges (`Atom.onChange → Event`)                            | Explicitly rejected upstream as a feedback-loop hazard. Gen2's Dispatch lowering must record which role (fact/command/invalidation/input) an edge represents and lower to the _separate_ mechanism (`Event`, `Atom`, `Atom.action`, `Reactivity`, `Element.on`) rather than synthesizing a bridge.                          |
| Anything under `docs/archive/` in effect-atom-jsx                       | Declared dead/superseded by the source project's own docs; treating archived docs as current API is exactly the "declared but deferred" trap.                                                                                                                                                                               |
| Two route-definition tiers (component-first / tree-first) in `Route.ts` | Real duplication upstream; gen2's route dialect (out of scope for this slice, no routing emitted in v1) must pick one canonical form rather than mirroring both.                                                                                                                                                            |

---

## 4. Diagnostics gating emission

Emission for this target must run these verify passes before any file is
written, each producing a typed diagnostic on failure (no silent
best-effort emission):

1. **Slot capability check** (`ui-target:slot-capability-mismatch`) —
   every `VIEW_DISPLAYS_FIELD_EDGE_KIND`/`VIEW_EDITS_FIELD_EDGE_KIND`
   target field's inferred UI capability must be a member of the emitted
   slot's `AssignableNamesOf<Capability>` union (§3b capability lattice).
   Mirrors their `view:unsupported-slot-event` template.
2. **Style-binding phantom check** (`ui-target:unbound-style-binding`) —
   if the emitter attaches a `ComposedStyle` with `whenBinding(X)`, the
   target component must expose binding `X`; port their
   `ComposedStyle<SlotNames, Bindings>` phantom-witness check as a gen2
   verify pass over the DesignSystem dialect (not yet built — v1 has no
   style bindings, but the pass must exist before styles are added in a
   later phase).
3. **Unknown-token rejection** (`ui-target:unknown-design-token`) — gen2
   must **close the gap** the lessons doc flags: their `lookupToken`
   silently passes unknown tokens through as literal strings with no
   diagnostic. Gen2's emitter must validate every emitted `Style.Property`
   / theme token path against `LeafPaths<ThemeTokens>` at emit time and
   raise a hard diagnostic (not a warning) for anything that would fall
   through to the string escape hatch. v1 emits no themed styles, so this
   pass is a no-op gate for this slice, but it must be wired now so
   phase-3 (DesignSystem) work cannot silently regress into their gap.
4. **Redundant-key-edge check** (`ui-target:redundant-key-edge`, §2.1) —
   an action must not carry both a parent `INVALIDATES_KEY` edge and one
   of its children's edges simultaneously.
5. **Unbound-requirement check** (`ui-target:unbound-requirement`, §2.2)
   — every query/action emitted for this target must have a fully
   resolved Provider chain before lowering runs.

**tsc-as-legalization-gate** (§1.2 lessons): after the above passes are
green and files are written, the conformance suite runs
`tsc --noEmit` against the emitted module set (importing the pinned
`effect-atom-jsx@0.5.0` types). A `tsc` failure is a **conformance test
failure**, distinct from (and in addition to) the gen2 verify-pass
failures above — it exists specifically to catch emitter drift against
the target library's actual type signatures, which the gen2-side passes
cannot see (they check gen2 IR, not the target's `.d.ts`).

Each of the checks above must be tagged `checked` (compile-time enforced
by the emitted TS), `implemented` (gen2 verify pass runs it), or
`declared` (contract exists, no enforcement yet) per §2.4 of the lessons
doc — v1's diagnostics above are all `implemented`; nothing in this list
may ship as merely `declared`.

---

## 5. Artifact shape

Emitted per app (not per component) for this slice:

```
generated/effect-atom-jsx/
  keys.ts          # KeyFamily witnesses: incidentKey
  atoms.ts         # Atom.runtime(layer) binding, defineQuery/defineMutation
                    # exports: listOpenIncidentsQuery, acknowledgeIncidentMutation,
                    # canManageIncidentAtom, canViewIncidentAtom
  views.ts          # View.Slots.define contracts + components (IncidentList, IncidentForm)
  hydration.ts       # dehydrate/hydrate resolver manifest (opt-in per emitted atom)
```

- `atoms.ts` imports `effect-atom-jsx`'s public entry points only
  (`Atom`, `Reactivity` re-exports from `.`/`./runtime` per its
  `exports` map) — never internal paths like `src/internals.ts` or
  `src/component-scope.ts`.
- `views.ts` imports `View`, `Element`, `Result` the same way, plus the
  `jsx-runtime` entry for JSX.
- `hydration.ts` imports `Hydration` and re-exports a single
  `resolvers` map keyed by the atoms actually registered — this file
  _is_ the explicit per-atom opt-in list; nothing sweeps.
- The golden/conformance test (new:
  `tests/golden/opsdesk-slice-ui-target/`, mirroring the existing
  `tests/golden/opsdesk-slice/` pattern) pins: the exact generated file
  set, a snapshot of each file's content, the `effect-atom-jsx` version
  string read from its `package.json` at test time (failing loudly if
  the sibling checkout has drifted from `0.5.0`), and the `tsc --noEmit`
  pass/fail for the generated set.

---

## 6. Phasing

Smallest demonstrable increment first, each gated by its own golden
snapshot:

1. **Keys + query + mutation wiring, no views.** Emit `keys.ts` +
   `atoms.ts` only (§2.1–2.4). Prove: witness identity, `invalidates`
   wiring, `Atom.runtime` R-erasure, result-dependent key resolution.
   No JSX, no `View`/`Result` rendering.
2. **Views.** Add `views.ts` (§2.5): `Slots.define` contracts + `Result.builder`
   rendering for the list and form, wired to the atoms from phase 1.
   Gate: slot-capability check (§4.1) now has real edges to check.
3. **Rule-derived UI state.** Add `canManageIncidentAtom` /
   `canViewIncidentAtom` (§2.6) and wire `disabled`/hidden props. Gate:
   the rule-lowering must reuse the exact `Expr<boolean>` the RLS/docs
   derivations already consume — no forked predicate logic.
4. **Hydration.** Add `hydration.ts` (§2.7) — explicit dehydrate/hydrate
   manifest for the phase-1/2 atoms. Gate: `HydrationUnknownKeys`/
   `HydrationMissingKeys` under `{ strict: true }` must be clean for
   exactly the registered set.

Each phase's golden test is additive — phase _n_'s emitted-file set is a
superset of phase _n-1_'s, and phase _n-1_'s files must not change
content when phase _n_ lands (an emitter regression signal if they do).

---

## 7. Open questions for the human

1. **Result-dependent invalidation key derivation** (§2.4): today's
   `derive.rule.invalidationDependencies` (R-8) does not distinguish
   "key is a function of the action's input" from "key is a function of
   the action's result." Does this distinction belong on the
   `INVALIDATES_KEY_EDGE_KIND` edge itself (new edge metadata), or should
   it be inferred at emit time by checking whether the key's entity id
   field appears in `input_type` vs `returns`?
2. **Optimistic-eligibility rule.** §2.4 proposes that gen2 only emits
   `optimistic`/`rollback` hooks when the rule graph proves the
   optimistic value satisfies the gating rule client-side. Is "provable
   client-side" scoped to rules with no server-only reads, or does it
   need a new trait (e.g. `ClientEvaluable`) on the rule/predicate?
3. **Route/boundary integration timing.** This spec deliberately emits no
   routing (their `Route.ts` two-tier duplication is flagged as a
   caution, §3). When gen2's own route dialect exists, does it target
   effect-atom-jsx's router at all, or stay renderer-agnostic and let a
   separate emitter own routing?
4. **DesignSystem/style dialect sequencing.** The unknown-token gap fix
   (§4.3) is wired as a no-op gate now. Should the DesignSystem dialect
   and its token-path type-level machinery (`LeafPaths<ThemeTokens>`)
   be scoped as a phase-5 UI-target follow-up, or does it belong to a
   target-agnostic gen2 dialect that this emitter merely lowers into?
5. **Golden test placement.** Should
   `tests/golden/opsdesk-slice-ui-target/` live under the existing
   `tests/golden/opsdesk-slice/` directory (reusing its fixture import)
   or as a fully separate golden suite, given it depends on an external
   sibling repo's pinned version rather than only in-repo fixtures?
6. **Sibling-repo version drift detection.** The conformance test reads
   `~/effect-atom-jsx/package.json` at test time to assert `0.5.0`. Is a
   live filesystem read of a sibling repo an acceptable CI dependency, or
   should the frozen snapshot be vendored (a pinned `.d.ts`/type-only
   copy) into gen2's repo so CI does not require the sibling checkout to
   exist at all?
