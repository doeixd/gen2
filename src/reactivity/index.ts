export * from "./reactivity.ts";
export * from "./rule-derived.ts";
export * from "./targets/effect-atom.ts";
export * from "./targets/tanstack-query.ts";

// Re-export UI editability helpers alongside rule-derived reactivity.
export { deriveEditableFieldsForRule, deriveEditabilityRulesForField } from "./rule-derived.ts";

// Explicit re-exports for new key expression primitives so they appear in
// package-level type inference even when the wildcard above is tree-shaken.
export type { KeyExpression, KeyPatternExpression } from "./reactivity.ts";
