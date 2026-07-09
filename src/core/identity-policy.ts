/* @__NO_SIDE_EFFECTS__ */
/**
 * Identity policy — stable-ID strictness.
 *
 * Quick Win #9 (PLAN.md §7) and PLAN.md §0.5 #7
 * ("Stable IDs are required, not configurable, in production").
 *
 * Without stable IDs, every rename becomes drop-and-recreate, every
 * snapshot becomes lossy, every AI edit risks data loss. This module
 * provides the configurable strictness levels and the four standard
 * diagnostic codes that surface stable-ID violations.
 *
 * - `"off"` — no diagnostics emitted (only safe in throwaway scripts).
 * - `"warn"` — emit warnings; legacy-friendly default.
 * - `"required"` — emit errors; production setting. Once Track M's
 *   evolution dialect lands, this becomes the recommended floor.
 *
 * The four diagnostic codes:
 *   - `ref:missing-stable-id` — a ref was created without a stable ID.
 *   - `ref:rename-without-stable-id` — a ref appears renamed but has
 *     no stable ID to track the rename through migrations.
 *   - `ref:duplicate-stable-id` — two refs share the same stable ID.
 *   - `ref:unstable-name-derived-id` — a ref's ID was derived from a
 *     mutable name, so renames will silently become drop+add.
 *
 * Two of the four codes already exist in `core/diagnostics.ts` —
 * the other two are added in this file's companion update.
 */

import type { Severity } from "./diagnostics.ts";

/** Strictness level for stable-ID enforcement. */
export type StableIdStrictness = "off" | "warn" | "required";

/** Strictness level for rename-hint enforcement. */
export type RenameHintStrictness = "off" | "warn" | "required_for_ambiguous_changes";

/** Identity policy for the gen system. */
export interface IdentityPolicy {
  /** How strict is stable-ID enforcement? */
  readonly stableIds: StableIdStrictness;
  /** How strict is rename-hint enforcement? */
  readonly renameHints: RenameHintStrictness;
}

/** Default identity policy: warn-level stable IDs, hard errors for rename hints. */
export const defaultIdentityPolicy: IdentityPolicy = {
  stableIds: "warn",
  renameHints: "required_for_ambiguous_changes",
};

/**
 * Map a strictness level to the diagnostic severity it should emit.
 *
 * `"off"` returns `null` so callers can short-circuit emission.
 */
export const stableIdSeverity = (level: StableIdStrictness): Severity | null => {
  switch (level) {
    case "off":
      return null;
    case "warn":
      return "warning";
    case "required":
      return "error";
  }
};

/** Map a rename-hint strictness level to its diagnostic severity. */
export const renameHintSeverity = (level: RenameHintStrictness): Severity | null => {
  switch (level) {
    case "off":
      return null;
    case "warn":
      return "warning";
    case "required_for_ambiguous_changes":
      return "error";
  }
};

/**
 * Standard diagnostic codes for identity-policy violations.
 *
 * Two of these (`ref:missing-stable-id`, `ref:rename-without-stable-id`)
 * already had emitters in `core/diagnostics.ts`. The other two
 * (`ref:duplicate-stable-id`, `ref:unstable-name-derived-id`) are
 * added by this Quick Win.
 */
export const IDENTITY_DIAGNOSTIC_CODES = {
  MISSING_STABLE_ID: "ref:missing-stable-id",
  RENAME_WITHOUT_STABLE_ID: "ref:rename-without-stable-id",
  DUPLICATE_STABLE_ID: "ref:duplicate-stable-id",
  UNSTABLE_NAME_DERIVED_ID: "ref:unstable-name-derived-id",
} as const;
