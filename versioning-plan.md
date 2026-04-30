# Versioning Plan for gen2

> **Status:** Draft  
> **Goal:** Close the gap between "diff detection" and "production-grade versioning" for the gen2 semantic IR.

---

## 1. Current State (What We Have)

| Layer                    | Status | Evidence                                                                       |
| ------------------------ | ------ | ------------------------------------------------------------------------------ |
| **Stable Identity**      | ✅     | `StableId<T>`, `entityId()`, `fieldId()`, etc. in `src/core/refs.ts`           |
| **Structural Diffing**   | ✅     | `deriveMigrationLineage(previous, current)` in `src/core/migration_lineage.ts` |
| **Artifact Kind**        | ✅     | `ArtifactKind = "migration"` in `src/core/artifacts.ts`                        |
| **Trait Marker**         | ✅     | `traits.migration_step` in `src/core/node.ts`                                  |
| **Storage Versioning**   | ✅     | `version` field on `StorageConfig` and `DatabaseConfig`                        |
| **Optimistic Locking**   | ✅     | `version_field` on `Editor` definitions                                        |
| **Execution Engine**     | ❌     | No migration runner, no up/down steps, no state tracking                       |
| **Schema Versioning**    | ❌     | No top-level schema version on the IR graph itself                             |
| **Snapshot Persistence** | ❌     | No standard format for saving/loading the "previous" snapshot                  |
| **Semantic Versioning**  | ❌     | No automatic SemVer derivation from structural changes                         |

**Verdict:** We have the _prerequisites_ (identity + diffing). We lack the _system_.

---

## 2. Guiding Principles

1. **IR is the source of truth.** Migrations derive from the graph, not from hand-written SQL.
2. **Stable IDs are non-negotiable.** Without them, renames become destructive drop+add.
3. **Versioning is explicit.** The graph advertises its own schema version; it is not inferred from package.json.
4. **Diagnostics over surprises.** Unsafe or ambiguous migrations emit structured diagnostics before execution.
5. **Targets decide execution.** The core produces a migration _plan_; the storage target (Postgres, SQLite, etc.) produces executable steps.

---

## 3. Milestones

### Milestone 1 — Schema Versioning on the Graph

**Goal:** The IR graph itself carries a version identity.

- [ ] Add `version: string` to `GenContext` (or a new `SchemaManifest` type).
- [ ] Add `previous_version?: string` to support chaining.
- [ ] Expose `gen.schema({ version: "1.0.0", previous_version: "0.9.0" })` in the builder API.
- [ ] Add diagnostic `schema:version-missing` when no version is declared.
- [ ] Add diagnostic `schema:version-not-semver` when the version string is not valid SemVer.

**Open Question:** Should the version live on `GenContext`, or should we introduce a first-class `Schema` node type?

---

### Milestone 2 — Snapshot Persistence

**Goal:** Save and load the "previous" IR snapshot so diffing has something to compare against.

- [ ] Define a canonical JSON serialization format for the entity graph (entities, fields, relations, policies, rules).
- [ ] Strip runtime-only data (e.g., closures, function bodies) from snapshots; keep only structural IR.
- [ ] Add `src/core/snapshot.ts` with `serializeGraph(graph) => string` and `deserializeGraph(snapshot) => Entity[]`.
- [ ] Store snapshots in a well-known location (e.g., `.gen2/snapshots/<version>.json`).
- [ ] Add `vp snapshot` CLI command (or `vp run snapshot`) to generate a snapshot from the current codebase.
- [ ] Add diagnostic `snapshot:missing-previous` when `deriveMigrationLineage` is called without a prior snapshot.

**Security Note:** Snapshots must not contain secrets, database URLs, or environment-specific config.

---

### Milestone 3 — Migration Plan Generation

**Goal:** Turn `MigrationLineage` into a target-agnostic migration plan.

- [ ] Define `MigrationPlan` type: a list of `MigrationStep` objects.
- [ ] Define concrete step kinds:
  - `create_entity`
  - `drop_entity`
  - `rename_entity`
  - `add_field`
  - `drop_field`
  - `rename_field`
  - `change_field_type`
  - `add_constraint`
  - `drop_constraint`
  - `backfill_field`
  - `create_index`
  - `drop_index`
- [ ] Add `MigrationStepNode` trait usage to mark user-defined migration hooks.
- [ ] Implement `deriveMigrationPlan(lineage, target)` that produces a `MigrationPlan`.
- [ ] Add diagnostic `migration:destructive-drop` when a step would drop an entity or field with data.
- [ ] Add diagnostic `migration:unplaceable-rename` when a rename cannot be executed safely on the target.

**Important:** The plan must be **idempotent** and **reversible** where the target supports it.

---

### Milestone 4 — Target-Specific Migration Execution

**Goal:** Convert a `MigrationPlan` into executable SQL (or API calls) and run it.

- [ ] Add `MigrationTarget` interface:
  ```ts
  interface MigrationTarget {
    generateSql(plan: MigrationPlan): string[];
    execute?(plan: MigrationPlan): Promise<ExecutionResult>;
  }
  ```
- [ ] Implement `PostgresMigrationTarget` with transactional DDL where supported.
- [ ] Implement `SQLiteMigrationTarget` with SQLite's DDL limitations (e.g., no `ALTER COLUMN`).
- [ ] Add `migration_state` table tracking:
  - `version`
  - `applied_at`
  - `checksum` (hash of the plan)
  - `duration_ms`
- [ ] Add `dryRun` mode: generate SQL without executing.
- [ ] Add diagnostic `migration:checksum-mismatch` when a previously-applied migration has changed.
- [ ] Add diagnostic `migration:locked` when another process holds the migration lock.

**Open Question:** Should we support _down_ migrations, or should rollbacks be handled via backups + re-apply?

---

### Milestone 5 — Semantic Version Derivation

**Goal:** Automatically suggest or enforce SemVer bumps based on structural changes.

- [ ] Define rules:
  - `MAJOR`: entity dropped, field dropped (breaking for consumers)
  - `MINOR`: entity added, field added (non-breaking expansion)
  - `PATCH`: rename (with stable ID), constraint added, index added (non-breaking)
  - `none`: unchanged
- [ ] Add `deriveSchemaVersionDelta(previous, current) => { bump: "major" | "minor" | "patch" | "none"; reasons: string[] }`.
- [ ] Add diagnostic `semver:version-mismatch` when the declared version bump does not match the structural delta.
- [ ] Optional: fail CI if `vp check` detects an un-bumped breaking change.

**Edge Case:** A field rename with a stable ID is _not_ breaking for the database, but it _is_ breaking for generated client SDKs. We may need target-aware SemVer rules.

---

### Milestone 6 — User-Defined Migration Hooks

**Goal:** Allow developers to inject custom logic into the migration pipeline.

- [ ] Add `gen.migration.hook({ before, step, after })` builder API.
- [ ] Support hooks for:
  - `before_plan` — inspect lineage before plan generation
  - `before_step` — run custom SQL before a specific step
  - `after_step` — run custom SQL after a specific step
  - `after_plan` — run post-migration validation
- [ ] Ensure hooks are tracked in the migration state table for auditability.
- [ ] Add diagnostic `migration:hook-failed` when a hook throws.

---

### Milestone 7 — Validation & Integration

**Goal:** End-to-end tests, CI integration, and documentation.

- [ ] Write property-based tests: random graph mutations => lineage => plan => reversible.
- [ ] Add migration tests to the existing test suite under `tests/migration/`.
- [ ] Integrate with `vp check`: warn on unversioned schema, error on checksum mismatch.
- [ ] Add `AGENTS.md` section on versioning conventions.
- [ ] Document the snapshot format and migration state schema.

---

## 4. Diagnostics (Proposed Codes)

All diagnostics follow the existing `Diagnostic` shape in `src/core/diagnostics.ts`.

| Code                           | Severity  | When                                               |
| ------------------------------ | --------- | -------------------------------------------------- |
| `schema:version-missing`       | `warning` | No `version` declared on the schema                |
| `schema:version-not-semver`    | `warning` | Version string is not valid SemVer                 |
| `snapshot:missing-previous`    | `error`   | Migration lineage requested but no snapshot exists |
| `snapshot:deserialize-failed`  | `error`   | Previous snapshot is corrupt or incompatible       |
| `migration:destructive-drop`   | `error`   | Plan contains a drop of an entity/field with data  |
| `migration:unplaceable-rename` | `error`   | Target cannot safely execute a detected rename     |
| `migration:checksum-mismatch`  | `error`   | Applied migration was modified after the fact      |
| `migration:locked`             | `error`   | Migration lock is held by another process          |
| `migration:hook-failed`        | `error`   | User-defined hook threw an exception               |
| `semver:version-mismatch`      | `warning` | Declared bump does not match structural delta      |
| `ref:rename-without-stable-id` | `warning` | Rename detected but no stable ID present           |

---

## 5. Open Questions

1. **Where does the version live?**
   - Option A: `GenContext.version` (simple, minimal change).
   - Option B: New first-class `Schema` node (cleaner, allows multiple schemas).
   - _Recommendation:_ Start with A; graduate to B if multi-schema support becomes real.

2. **Down migrations or backups?**
   - Down migrations are hard to get right and often untested.
   - _Recommendation:_ Phase 1 does not support down. Rollbacks are database-restore + re-apply. We can revisit if users demand it.

3. **Field type changes — migration or coercion?**
   - Changing `int` to `bigint` is different from `int` to `text`.
   - _Recommendation:_ The plan generator emits a `backfill_field` step for all type changes. The target decides if it can be done with `ALTER COLUMN` or requires a rebuild.

4. **Async breaking detection?**
   - A rename with a stable ID is safe for Postgres but breaking for a generated GraphQL schema.
   - _Recommendation:_ `deriveSchemaVersionDelta` accepts a `targetKind` parameter so rules are target-aware.

5. **Snapshot size / performance?**
   - Large graphs (1000+ entities) could produce multi-MB JSON snapshots.
   - _Recommendation:_ Snapshots are gzip-compressed by default. Diffs are computed in-memory; we do not diff on disk.

6. **Should plugins define custom migration steps?**
   - A custom storage target (e.g., S3, ElasticSearch) might need steps like `reindex`.
   - _Recommendation:_ Yes. The `MigrationStep` union should be extensible via plugin-defined kinds, validated by target checkers.

---

## 6. Implementation Details

### 6.1 Snapshot Format (v1)

```json
{
  "format": "gen2-snapshot-v1",
  "version": "1.2.3",
  "generated_at": "2026-04-30T12:00:00Z",
  "entities": [
    {
      "id": "entity:User",
      "name": "User",
      "fields": [
        { "id": "field:User.id", "name": "id", "semantic_type": { "kind": "uuid" } },
        { "id": "field:User.name", "name": "name", "semantic_type": { "kind": "string" } }
      ]
    }
  ]
}
```

Rules:

- Only structural data. No `ref` closures, no function bodies.
- IDs are serialized as strings (the `StableId` brand is dropped).
- Unknown fields in the JSON are ignored during deserialization (forward compatibility).

### 6.2 Migration State Table

For SQL targets, create a table:

```sql
CREATE TABLE IF NOT EXISTS __gen2_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  steps INTEGER NOT NULL,
  success BOOLEAN NOT NULL
);
```

### 6.3 Idempotency

Every generated migration script must be wrapped in a guard:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __gen2_migrations WHERE version = '1.2.3') THEN
    -- ... steps ...
    INSERT INTO __gen2_migrations (version, checksum, duration_ms, steps, success)
    VALUES ('1.2.3', 'abc123', 42, 5, true);
  END IF;
END $$;
```

### 6.4 Checksum Algorithm

- Serialize the `MigrationPlan` to canonical JSON (sorted keys, no whitespace).
- Hash with SHA-256.
- Truncate to 16 characters for readability.

### 6.5 Locking Strategy

- **Postgres:** Advisory lock (`pg_advisory_lock(hashtext('gen2:migration'))`).
- **SQLite:** File-based lock or `BEGIN IMMEDIATE` on the migrations table.
- **General:** A `__gen2_migration_lock` row with `locked_at` and `process_id`.

---

## 7. Risks & Mitigations

| Risk                                     | Impact                                      | Mitigation                                                                                             |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Stable IDs are missing or inconsistent   | High — renames become destructive           | Make `id` required on `Entity` and `Field` after a deprecation period; emit `ref:missing-stable-id`    |
| Snapshots become stale                   | Medium — lineage is inaccurate              | CI checks that snapshot is up to date; `vp check` validates snapshot freshness                         |
| Migration execution fails mid-flight     | High — database is in an inconsistent state | Every step runs in a transaction where the target supports it; state table tracks partial application  |
| Generated migrations are too destructive | High — data loss                            | `migration:destructive-drop` is an **error** by default; requires explicit `--allow-destructive` flag  |
| Plugin-defined steps are invalid         | Medium — target cannot execute              | Target checker validates all step kinds before generation; unknown steps emit `migration:unknown-step` |

---

## 8. Success Criteria

We will consider versioning "proper" when:

1. `vp check` warns if the schema has no declared version.
2. `vp snapshot` produces a reproducible JSON snapshot of the current IR.
3. `deriveMigrationLineage` + `deriveMigrationPlan` produce a target-aware, executable plan.
4. A Postgres migration can be generated, dry-run, and applied with full state tracking.
5. A breaking schema change (e.g., dropping a field) emits a diagnostic and requires an explicit override.
6. The system is fully covered by property-based and integration tests.

---

_This plan is a living document. Update it as milestones shift, questions are resolved, or new constraints are discovered._
