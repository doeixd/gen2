# AUTHZ2+ Implementation Plan

> Authz depth — access surfaces, mutation access plans, explicit deny modes, generated access matrix.
>
> Prereqs: AUTHZ1 ✅, RULE1 ✅, CRUD1 ✅, R-REACT ✅.
> Target file: this plan lives at `AUTHZ2_PLAN.md` and should be updated as slices land.

---

## 0. Goal

Authz should **produce plans**, not just checks.

Current state (`AUTHZ1`):

- `Policy` has `actions: PolicyRule[]` + optional `predicate?: Rule`.
- `checkAuthz` validates back-references, entity matching, cross-store relations, SQL translation, client exposure, and rule dependency existence.
- Authz is **entity-centric** — one policy per entity, action names are strings.

Target state (`AUTHZ2+`):

- Authz is **surface-centric** — `entity.read`, `entity.create`, `entity.update`, `entity.delete`, `field.read`, `field.write`, `relation.read`, `relation.link`, `relation.unlink`, `action.execute`, `query.filter`, `route.enter`, `form.submit`, `ui.hint`.
- Each surface has a **placement mode**: `sql_where`, `rls`, `server_pre_query`, `server_post_filter`, `client_hint`, `materialized`, `external`.
- Each surface has a **deny behavior**: `forbidden`, `not_found`, `omit`, `redact`, `mask`, `readonly`, `noop`, `explain`.
- Mutations get a generated `MutationAccessPlan`.
- CRUD can derive access from `gen.crud.derive(Entity, { access: { ... } })`.
- `checkAuthz` emits placement and deny-mode diagnostics.

---

## 1. Guiding Principles

1. **Surfaces, not strings** — replace `action_name: "read"` with typed `AccessSurface`.
2. **Placement is derived** — the checker classifies where a policy can run; the user can override.
3. **Deny is explicit** — every surface must declare what happens when access is denied.
4. **Field auth is first-class** — `field.read` and `field.write` are separate surfaces with distinct enforcement.
5. **Mutation plans are generated** — `updateProject` gets a `MutationAccessPlan` with before/after checks, field writes, transition validation.
6. **Access matrix is human-visible** — `deriveAccessMatrix(ctx)` produces a summary of every entity/surface/deny mapping.
7. **CRUD is the first consumer** — `gen.crud.derive` should accept `access` and expand it into surfaces.

---

## 2. New IR Types

### 2.1 AccessSurface (discriminated union)

```ts
export type AccessSurface =
  | { readonly kind: "entity.read"; readonly entity: Entity }
  | { readonly kind: "entity.create"; readonly entity: Entity }
  | { readonly kind: "entity.update"; readonly entity: Entity }
  | { readonly kind: "entity.delete"; readonly entity: Entity }
  | { readonly kind: "field.read"; readonly entity: Entity; readonly field: Field }
  | { readonly kind: "field.write"; readonly entity: Entity; readonly field: Field }
  | { readonly kind: "relation.read"; readonly relation: Relation }
  | { readonly kind: "relation.link"; readonly relation: Relation }
  | { readonly kind: "relation.unlink"; readonly relation: Relation }
  | { readonly kind: "action.execute"; readonly action: ActionFunction }
  | { readonly kind: "query.filter"; readonly query: QueryFunction }
  | { readonly kind: "route.enter"; readonly route: AppRoute }
  | { readonly kind: "form.submit"; readonly form: Form }
  | { readonly kind: "ui.hint"; readonly component: Component };
```

### 2.2 Placement (where enforcement happens)

```ts
export type PlacementKind =
  | "sql_where"
  | "rls"
  | "server_pre_query"
  | "server_integrated_query"
  | "server_post_filter"
  | "client_hint"
  | "materialized"
  | "external"
  | "none";

export interface Placement {
  readonly kind: PlacementKind;
  readonly authoritative: boolean;
  readonly exact: boolean;
}
```

Rules:

- `sql_where` and `rls` are authoritative and exact.
- `server_post_filter` is authoritative but **not exact** (may fetch too many rows).
- `client_hint` is **not authoritative**.
- List queries MUST NOT silently fall back to `server_post_filter` without a diagnostic.

### 2.3 DenyBehavior (what happens on denial)

```ts
export type DenyBehavior =
  | "forbidden" // 403
  | "not_found" // 404 (hides existence)
  | "omit" // omit field from projection
  | "redact" // replace field value with placeholder
  | "mask" // partial masking (e.g., credit card)
  | "readonly" // show but disable editing
  | "noop" // silently ignore
  | "explain" // include denial reason in response
  | "unauthorized"; // 401
```

Default per surface:

- `entity.read` on single item → `not_found`
- `entity.read` on list → `omit` (item excluded from list)
- `entity.create/update/delete` → `forbidden`
- `field.read` → `omit`
- `field.write` → `forbidden`
- `relation.read` → `omit`
- `action.execute` → `forbidden`
- `route.enter` → `forbidden`
- `form.submit` → `forbidden`
- `ui.hint` → `readonly`

### 2.4 AccessSurfaceBinding (policy + surface + deny)

```ts
export interface AccessSurfaceBinding {
  readonly kind: "access_surface_binding";
  readonly surface: AccessSurface;
  readonly policy: Policy;
  readonly deny: DenyBehavior;
  readonly placement?: Placement;
}
```

### 2.5 MutationAccessPlan

```ts
export interface FieldWriteCheck {
  readonly field: Field;
  readonly policy: Policy;
  readonly deny: DenyBehavior;
}

export interface TransitionCheck {
  readonly field: Field;
  readonly from: readonly unknown[];
  readonly to: readonly unknown[];
  readonly policy: Policy;
}

export interface WriteSetEntry {
  readonly entity: Entity;
  readonly field: Field;
  readonly oldValue?: Expr;
  readonly newValue?: Expr;
}

export interface MutationAccessPlan {
  readonly kind: "mutation_access_plan";
  readonly action: ActionFunction;
  readonly actor: Entity; // or ActorRef
  readonly writes: readonly WriteSetEntry[];
  readonly requiredPolicies: readonly Policy[];
  readonly beforeState: readonly Entity[];
  readonly afterState: readonly Entity[];
  readonly fieldWriteChecks: readonly FieldWriteCheck[];
  readonly relationChecks: readonly RelationWriteCheck[];
  readonly transitionChecks: readonly TransitionCheck[];
  readonly diagnostics: readonly Diagnostic[];
}
```

### 2.6 AccessMatrix (human/devtool-visible)

```ts
export interface AccessMatrixEntry {
  readonly entity: Entity;
  readonly surface: AccessSurface["kind"];
  readonly policyName: string;
  readonly placement?: PlacementKind;
  readonly deny: DenyBehavior;
}

export interface AccessMatrix {
  readonly kind: "access_matrix";
  readonly entries: readonly AccessMatrixEntry[];
}
```

---

## 3. API Surface

### 3.1 `gen.authz.surface.*` constructors

```ts
gen.authz.surface.entityRead(entity, policy, deny?)
gen.authz.surface.entityCreate(entity, policy, deny?)
gen.authz.surface.entityUpdate(entity, policy, deny?)
gen.authz.surface.entityDelete(entity, policy, deny?)
gen.authz.surface.fieldRead(entity, field, policy, deny?)
gen.authz.surface.fieldWrite(entity, field, policy, deny?)
gen.authz.surface.relationRead(relation, policy, deny?)
gen.authz.surface.relationLink(relation, policy, deny?)
gen.authz.surface.relationUnlink(relation, policy, deny?)
gen.authz.surface.actionExecute(action, policy, deny?)
gen.authz.surface.queryFilter(query, policy, deny?)
gen.authz.surface.routeEnter(route, policy, deny?)
gen.authz.surface.formSubmit(form, policy, deny?)
```

### 3.2 `gen.authz.matrix(ctx)`

```ts
const matrix = gen.authz.matrix(ctx);
// matrix.entries: AccessMatrixEntry[]
```

### 3.3 `gen.authz.plan(action, actor?)`

```ts
const plan = gen.authz.plan(updateProjectAction);
// plan: MutationAccessPlan
```

### 3.4 CRUD integration

```ts
const projectCrud = gen.crud.derive(Project, {
  access: {
    read: canViewProject,
    create: canCreateProject,
    update: canEditProject,
    delete: canDeleteProject,
    fields: {
      budget: { read: canViewProjectBudget, write: canEditProjectBudget },
      ownerId: { write: canTransferProject },
    },
  },
});
```

This expands to:

- `entity.read` → `canViewProject`
- `entity.create` → `canCreateProject`
- `entity.update` → `canEditProject`
- `entity.delete` → `canDeleteProject`
- `field.budget.read` → `canViewProjectBudget`
- `field.budget.write` → `canEditProjectBudget`
- `field.ownerId.write` → `canTransferProject`

---

## 4. Implementation Phases

### Phase A — AccessSurface IR + constructors (AUTHZ2-A)

**Goal**: Replace string action names with typed `AccessSurface` union.

**Files**:

- `src/authz/surface.ts` — `AccessSurface`, `Placement`, `DenyBehavior`, `AccessSurfaceBinding`
- `src/authz/authz.ts` — add `defineAccessSurfaceBinding`, `deriveDefaultDeny`, `classifyPlacement`
- `src/authz/index.ts` — export new types

**Changes**:

1. Add `AccessSurface` discriminated union.
2. Add `DenyBehavior` type + `deriveDefaultDeny(surface)` helper.
3. Add `Placement` type + `classifyPlacement(surface, policy)` helper.
4. Add `AccessSurfaceBinding` record.
5. Update `PolicyRule` to optionally carry `surface?: AccessSurface` (backward compatible).
6. Update `definePolicy` to accept `surfaces?: AccessSurfaceBinding[]` in addition to `actions`.

**Tests**:

- `tests/authz2-surface.test.ts` — surface construction, default deny per surface, placement classification

**Est. effort**: Small

---

### Phase B — Placement analysis + diagnostics (AUTHZ2-B)

**Goal**: Derive placement for each surface and emit diagnostics when placement is unsafe.

**Files**:

- `src/authz/placement.ts` — `classifyPlacement`, `isPlaceableAsSqlWhere`, `isPlaceableAsRls`
- `src/authz/authz.ts` — extend `checkAuthz` with placement checks

**Diagnostics**:

```txt
authz:list-policy-not-placeable
authz:unsafe-list-post-filter
authz:server-only-field-exposed
authz:hidden-field-exposed
authz:forbidden-field-writable
authz:write-policy-needs-before-state
authz:transition-policy-needs-before-after
authz:relation-link-policy-missing
authz:client-authoritative-policy
authz:generated-input-overpermits-field
```

**Implementation**:

1. `classifyPlacement(surface, policy)`:
   - If policy has `predicate` with only `rule.eq`/`rule.compare` on fields of the target entity → `sql_where`.
   - If policy has `predicate` with `rule.exists` on relations in same store → `server_integrated_query`.
   - If policy has `predicate` with cross-store relation → `server_post_filter` (with warning).
   - If policy is `AllowRole`/`AllowAuthenticated`/`AllowOwner` on same entity → `rls` (if store supports RLS).
   - Otherwise → `server_pre_query`.
2. `checkAuthz` now walks `AccessSurfaceBinding[]` and checks placement.
3. For `query.filter` surfaces on list queries, warn if placement is `server_post_filter`.
4. For `field.write` surfaces, check that the mutation has a `beforeState` (needs `load before`).

**Tests**:

- `tests/authz2-placement.test.ts` — SQL placement, RLS placement, post-filter warning, cross-store fallback

**Est. effort**: Medium

---

### Phase C — MutationAccessPlan generation (AUTHZ2-C)

**Goal**: Generate `MutationAccessPlan` for action functions.

**Files**:

- `src/authz/mutation-plan.ts` — `deriveMutationAccessPlan(action, ctx)`
- `src/authz/authz.ts` — add `checkMutationAccessPlans(ctx)`

**Implementation**:

1. For each `ActionFunction`:
   a. Extract write-set (entity + fields from operations).
   b. Find `field.write` bindings for written fields.
   c. Find `entity.update`/`entity.create`/`entity.delete` bindings for target entity.
   d. Find `transitionChecks` for fields with transition policies.
   e. Find `relationChecks` for relations affected by the mutation.
2. Build `MutationAccessPlan` with:
   - `writes`: `WriteSetEntry[]`
   - `fieldWriteChecks`: `FieldWriteCheck[]`
   - `requiredPolicies`: deduplicated policies
   - `beforeState`: entities that need loading before mutation
   - `afterState`: entities that exist after mutation
3. Register `checkMutationAccessPlans` as a built-in module checker.

**Diagnostics**:

- `authz:write-policy-needs-before-state` — mutation writes a field with `field.write` policy but has no `beforeState`.
- `authz:transition-policy-needs-before-after` — mutation writes a field with transition policy but only provides `after`.

**Tests**:

- `tests/authz2-mutation-plan.test.ts` — plan generation for create/update/delete, field write checks, transition checks, relation checks

**Est. effort**: Medium-Large

---

### Phase D — Deny behavior enforcement (AUTHZ2-D)

**Goal**: Wire deny behaviors into query projections, action checks, and UI hints.

**Files**:

- `src/authz/deny.ts` — `applyDenyToQuery(query, binding)`, `applyDenyToAction(action, binding)`, `applyDenyToFormField(field, binding)`
- `src/crud/crud.ts` — use deny behavior when deriving CRUD projections

**Implementation**:

1. For `entity.read` + `not_found`:
   - Query gets an `AND auth_predicate` in WHERE.
2. For `field.read` + `omit`:
   - Projection drops the field.
3. For `field.read` + `redact`:
   - Projection replaces field with a placeholder expression.
4. For `field.write` + `forbidden`:
   - Action body checks the policy before writing.
5. For `ui.hint` + `readonly`:
   - Form field gets `editableWhen` set to the negation of the write policy.

**Tests**:

- `tests/authz2-deny.test.ts` — query projection omit, query projection redact, action forbidden check, form field readonly hint

**Est. effort**: Medium

---

### Phase E — Access matrix + CRUD integration (AUTHZ2-E)

**Goal**: `deriveAccessMatrix(ctx)` and `gen.crud.derive(Entity, { access: ... })`.

**Files**:

- `src/authz/matrix.ts` — `deriveAccessMatrix(ctx)`
- `src/crud/crud.ts` — extend `DeriveCrudOptions` with `access`
- `src/crud/crud.ts` — `expandAccessToSurfaces(access, entity)`

**Implementation**:

1. `deriveAccessMatrix(ctx)`:
   - Walk `ctx.policies`.
   - For each policy, walk its `AccessSurfaceBinding[]`.
   - Produce `AccessMatrixEntry[]` sorted by entity + surface.
2. `gen.crud.derive(Entity, { access })`:
   - Convert `access.read` → `entity.read` binding.
   - Convert `access.create` → `entity.create` binding.
   - Convert `access.update` → `entity.update` binding.
   - Convert `access.delete` → `entity.delete` binding.
   - Convert `access.fields[field].read` → `field.read` binding.
   - Convert `access.fields[field].write` → `field.write` binding.
   - Register all bindings in `ctx`.
   - Derive CRUD queries with auth predicates in WHERE.
   - Derive CRUD actions with access checks in body.
   - Derive CRUD projections with omitted/redacted fields.

**Tests**:

- `tests/authz2-matrix.test.ts` — matrix derivation, sorting, human-readable output
- `tests/authz2-crud-integration.test.ts` — CRUD derive with access, query auth filter, action auth check, projection field omit

**Est. effort**: Large

---

### Phase F — Namespace wiring + lifecycle (AUTHZ2-F)

**Goal**: Wire everything into `gen.authz.*`, `checkAuthz`, and lifecycle.

**Files**:

- `src/gen/types.ts` — add `AuthzSurfaceNamespace`, `AuthzMatrixNamespace`
- `src/gen/namespaces.ts` — add `createAuthzSurfaceNamespace`, `createAuthzMatrixNamespace`
- `src/gen/index.ts` — wire namespaces
- `src/lifecycle/lifecycle.ts` — extend `checkAuthz` call, add `checkMutationAccessPlans`
- `src/index.ts` — export new authz types

**Implementation**:

1. `gen.authz.surface.entityRead(...)` etc.
2. `gen.authz.matrix(ctx)`
3. `gen.authz.plan(action)`
4. Extend `checkAuthz` to accept `access_surface_bindings` and `action_functions`.
5. Register placement checker + mutation plan checker as built-in module checkers.

**Tests**:

- `tests/authz2-lifecycle.test.ts` — full lifecycle check with surfaces, placement warnings, mutation plan diagnostics

**Est. effort**: Small-Medium

---

## 5. Sequencing

```
AUTHZ2-A → AUTHZ2-B → AUTHZ2-C → AUTHZ2-D → AUTHZ2-E → AUTHZ2-F
   ↑          ↑          ↑          ↑          ↑          ↑
  Surface   Placement  Mutation   Deny       Matrix     Namespace
  IR        analysis   plan       behavior   + CRUD     + Lifecycle
```

**Recommendation**: Do AUTHZ2-A through AUTHZ2-D before returning to CRUD depth (AUTHZ2-E). AUTHZ2-E is the integration point where everything clicks together.

---

## 6. Validation Checklist

After each phase:

- [ ] `vp test` passes with new tests green.
- [ ] `vp check` formatting passes (lint/type errors only pre-existing).
- [ ] New diagnostics have at least one test each.
- [ ] New IR types are exported from `src/index.ts`.
- [ ] `atom_plan_progress.md` is updated with the completed phase.
- [ ] `AUTHZ2_PLAN.md` is updated to mark the phase complete.

---

## 7. Deferred (post-AUTHZ2+)

- **Rule placement codegen** — actually generating SQL WHERE/RLS from rules.
- **Client hint generation** — generating non-authoritative client-side auth metadata.
- **Transition policy DSL** — `gen.authz.transition(field, from, to, policy)`.
- **Audit log integration** — emitting audit events from mutation access plans.
- **Multi-actor access** — delegating access checks to a different actor.
- **Time-based access** — policies that expire or are valid only during certain hours.
- **Hierarchical roles** — role inheritance in `AllowRole`.

---

## 8. File Map

| File                         | Phase | Purpose                                                         |
| ---------------------------- | ----- | --------------------------------------------------------------- |
| `src/authz/surface.ts`       | A     | `AccessSurface`, `DenyBehavior`, `AccessSurfaceBinding`         |
| `src/authz/placement.ts`     | B     | `Placement`, `classifyPlacement`, placement diagnostics         |
| `src/authz/mutation-plan.ts` | C     | `MutationAccessPlan`, `deriveMutationAccessPlan`                |
| `src/authz/deny.ts`          | D     | `applyDenyToQuery`, `applyDenyToAction`, `applyDenyToFormField` |
| `src/authz/matrix.ts`        | E     | `AccessMatrix`, `deriveAccessMatrix`                            |
| `src/authz/authz.ts`         | A-F   | `checkAuthz` extensions, constructors                           |
| `src/crud/crud.ts`           | E     | `DeriveCrudOptions.access`, CRUD auth expansion                 |
| `src/gen/types.ts`           | F     | Namespace type declarations                                     |
| `src/gen/namespaces.ts`      | F     | Namespace factory functions                                     |
| `tests/authz2-*.test.ts`     | A-F   | Phase-specific tests                                            |
