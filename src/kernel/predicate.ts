/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel Predicate IR.
 *
 * Predicates are bodied claims over graph subjects. Marker traits,
 * marker capabilities, and assurance applications remain edge-shaped;
 * this module models only claims with a real body.
 */

import type { KernelId } from "./id.ts";
import type { KernelMetadata } from "./metadata.ts";

/** Typed predicate flavor witness: rule, law, trait-body, capability-body, etc. */
export interface PredicateFlavor<Id extends string = string> {
  readonly kind: "predicate.flavor";
  readonly id: KernelId<"predicate.flavor"> & Id;
  readonly label: string;
  readonly metadata?: KernelMetadata;
}

/** Define an open-extension predicate flavor witness. */
export const definePredicateFlavor = <const Id extends string>(input: {
  readonly id: Id;
  readonly label: string;
  readonly metadata?: KernelMetadata;
}): PredicateFlavor<Id> => ({
  kind: "predicate.flavor",
  id: input.id as KernelId<"predicate.flavor"> & Id,
  label: input.label,
  metadata: input.metadata,
});

/** Typed subject-kind witness used to scope predicate applicability. */
export interface SubjectKind<Id extends string = string> {
  readonly kind: "predicate.subjectKind";
  readonly id: KernelId<"subject.kind"> & Id;
  readonly label: string;
  readonly metadata?: KernelMetadata;
}

/** Define an open-extension predicate subject-kind witness. */
export const defineSubjectKind = <const Id extends string>(input: {
  readonly id: Id;
  readonly label: string;
  readonly metadata?: KernelMetadata;
}): SubjectKind<Id> => ({
  kind: "predicate.subjectKind",
  id: input.id as KernelId<"subject.kind"> & Id,
  label: input.label,
  metadata: input.metadata,
});

/**
 * Typed assurance-kind witness.
 *
 * `strongerThan` is an open partial order; comparison walks witness edges
 * instead of switching over a closed string enum.
 */
export interface AssuranceKindBase {
  readonly kind: "predicate.assuranceKind";
  readonly id: KernelId<"assurance.kind"> & string;
  readonly label: string;
  readonly strongerThan: readonly AssuranceKindBase[];
  readonly metadata?: KernelMetadata;
}

export interface AssuranceKind<
  Id extends string = string,
  StrongerThan extends readonly AssuranceKindBase[] = readonly AssuranceKindBase[],
> extends AssuranceKindBase {
  readonly kind: "predicate.assuranceKind";
  readonly id: KernelId<"assurance.kind"> & Id;
  readonly label: string;
  readonly strongerThan: StrongerThan;
  readonly metadata?: KernelMetadata;
}

/** Define an open-extension assurance kind witness. */
export const defineAssuranceKind = <
  const Id extends string,
  const StrongerThan extends readonly AssuranceKind[] = [],
>(input: {
  readonly id: Id;
  readonly label: string;
  readonly strongerThan?: StrongerThan;
  readonly metadata?: KernelMetadata;
}): AssuranceKind<Id, StrongerThan> => ({
  kind: "predicate.assuranceKind",
  id: input.id as KernelId<"assurance.kind"> & Id,
  label: input.label,
  strongerThan: input.strongerThan ?? ([] as unknown as StrongerThan),
  metadata: input.metadata,
});

/** True when `candidate` is equal to, or transitively stronger than, `baseline`. */
export const assuranceAtLeast = (
  candidate: AssuranceKind,
  baseline: AssuranceKind,
  seen: ReadonlySet<string> = new Set(),
): boolean => {
  if (candidate.id === baseline.id) return true;
  if (seen.has(candidate.id)) return false;
  const nextSeen = new Set(seen).add(candidate.id);
  return candidate.strongerThan.some((parent) => assuranceAtLeast(parent, baseline, nextSeen));
};

/** Built-in predicate flavors. */
export const predicateFlavor = {
  RULE: definePredicateFlavor({ id: "predicate.flavor.rule", label: "Rule" }),
  LAW: definePredicateFlavor({ id: "predicate.flavor.law", label: "Law" }),
  TRAIT: definePredicateFlavor({ id: "predicate.flavor.trait", label: "Bodied trait" }),
  CAPABILITY: definePredicateFlavor({
    id: "predicate.flavor.capability",
    label: "Guarded capability",
  }),
} as const;

/** Built-in subject kinds. */
export const subjectKind = {
  ANY: defineSubjectKind({ id: "subject.kind.any", label: "Any subject" }),
  NODE: defineSubjectKind({ id: "subject.kind.node", label: "Node" }),
  EDGE: defineSubjectKind({ id: "subject.kind.edge", label: "Edge" }),
  ENTITY: defineSubjectKind({ id: "subject.kind.entity", label: "Entity" }),
  FIELD: defineSubjectKind({ id: "subject.kind.field", label: "Field" }),
  OPERATION: defineSubjectKind({ id: "subject.kind.operation", label: "Operation" }),
  DIALECT: defineSubjectKind({ id: "subject.kind.dialect", label: "Dialect" }),
} as const;

/** Built-in assurance kinds. */
const asserted = defineAssuranceKind({
  id: "assurance.kind.asserted",
  label: "Asserted",
});
const derived = defineAssuranceKind({
  id: "assurance.kind.derived",
  label: "Derived",
  strongerThan: [asserted],
});
const tested = defineAssuranceKind({
  id: "assurance.kind.tested",
  label: "Tested",
  strongerThan: [derived],
});
const checkedByTarget = defineAssuranceKind({
  id: "assurance.kind.checkedByTarget",
  label: "Checked by target",
  strongerThan: [tested],
});
const provedBySolver = defineAssuranceKind({
  id: "assurance.kind.provedBySolver",
  label: "Proved by solver",
  strongerThan: [checkedByTarget],
});
const byConstruction = defineAssuranceKind({
  id: "assurance.kind.byConstruction",
  label: "By construction",
  strongerThan: [checkedByTarget],
});

export const assuranceKind = {
  ASSERTED: asserted,
  DERIVED: derived,
  TESTED: tested,
  CHECKED_BY_TARGET: checkedByTarget,
  PROVED_BY_SOLVER: provedBySolver,
  BY_CONSTRUCTION: byConstruction,
} as const;

/** Canonical predicate witness. */
export interface Predicate<
  Subject = unknown,
  Vars = unknown,
  Body = unknown,
  Assurance extends AssuranceKind = AssuranceKind,
  Flavor extends PredicateFlavor = PredicateFlavor,
  SubjectKindWitness extends SubjectKind = SubjectKind,
  Id extends string = string,
> {
  readonly kind: "predicate";
  readonly id: KernelId<"predicate"> & Id;
  readonly label?: string;
  readonly subjectKind: SubjectKindWitness;
  readonly subject: Subject;
  readonly vars: Vars;
  readonly body: Body;
  readonly assurance: Assurance;
  readonly flavor: Flavor;
  readonly metadata?: KernelMetadata;
  readonly $infer: {
    readonly id: Id;
    readonly subject: Subject;
    readonly vars: Vars;
    readonly body: Body;
    readonly assurance: Assurance;
    readonly flavor: Flavor;
    readonly subjectKind: SubjectKindWitness;
  };
}

/** Define a canonical predicate witness while preserving all literal inputs. */
export const definePredicate = <
  const Id extends string,
  const SubjectKindWitness extends SubjectKind,
  const Subject,
  const Vars,
  const Body,
  const Assurance extends AssuranceKind,
  const Flavor extends PredicateFlavor,
>(input: {
  readonly id: Id;
  readonly label?: string;
  readonly subjectKind: SubjectKindWitness;
  readonly subject: Subject;
  readonly vars: Vars;
  readonly body: Body;
  readonly assurance: Assurance;
  readonly flavor: Flavor;
  readonly metadata?: KernelMetadata;
}): Predicate<Subject, Vars, Body, Assurance, Flavor, SubjectKindWitness, Id> =>
  ({
    kind: "predicate",
    id: input.id as KernelId<"predicate"> & Id,
    label: input.label,
    subjectKind: input.subjectKind,
    subject: input.subject,
    vars: input.vars,
    body: input.body,
    assurance: input.assurance,
    flavor: input.flavor,
    metadata: input.metadata,
    $infer: {
      id: input.id,
      subject: input.subject,
      vars: input.vars,
      body: input.body,
      assurance: input.assurance,
      flavor: input.flavor,
      subjectKind: input.subjectKind,
    },
  }) as Predicate<Subject, Vars, Body, Assurance, Flavor, SubjectKindWitness, Id>;
