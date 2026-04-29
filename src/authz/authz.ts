/* @__NO_SIDE_EFFECTS__ */
/**
 * Authorization IR. Policies declare per-action conditions (AllowAuthenticated,
 * AllowRole, AllowOwner, AllowRelation, OrCondition). PolicyTranslation tracks
 * which policies can be lowered to SQL predicates, server runtime checks, or
 * safely-exposed client metadata.
 *
 * See spec/authz.allium.
 */

import { type Diagnostic, diagnostic } from "../core/index.ts";
import type { Entity, Field } from "../entity/index.ts";
import type { Getter, Mutator } from "../api/index.ts";
import type { Relation } from "../relation/index.ts";
import type { Rule } from "../rules/index.ts";
import { extractRuleDependencies } from "../rules/index.ts";
import {
  defineAccessSurfaceBinding,
  type AccessSurfaceBinding,
  type AccessSurfaceOf,
  type DenyBehavior,
} from "./surface.ts";
import { checkPlacement } from "./placement.ts";

// --- Authz-specific diagnostics ---------------------------------------------

export type AuthzDiagnosticCode =
  | "authz:rule-policy-mismatch"
  | "authz:owner-field-wrong-entity"
  | "authz:relation-wrong-entity"
  | "authz:policy-entity-mismatch"
  | "authz:unenforceable-policy"
  | "authz:sql-translation-no-store"
  | "authz:sql-translation-failed"
  | "authz:server-only-in-client-policy"
  | "authz:unsafe-client-exposure"
  | "authz:safe-but-not-hidden"
  | "authz:rule-dependencies-missing"
  | "authz:unsafe-list-post-filter"
  | "authz:list-policy-not-placeable"
  | "authz:write-policy-needs-before-state"
  | "authz:transition-policy-needs-before-after"
  | "authz:authoritative-client-policy"
  | "authz:missing-server-enforcement"
  | "authz:policy-variable-binding-missing"
  | "authz:list-policy-not-database-placeable";

export const authzDiagnostic = (input: {
  severity: Diagnostic["severity"];
  code: AuthzDiagnosticCode;
  message: string;
  refs?: readonly import("../core/index.ts").Ref[];
  path?: import("../core/index.ts").DiagnosticPath;
  suggestion?: string;
}): Diagnostic =>
  diagnostic({
    severity: input.severity,
    code: input.code,
    message: input.message,
    refs: input.refs,
    path: input.path,
    suggestion: input.suggestion,
  });

/** Discriminated kind of an authorization condition. */
export type AuthConditionKind =
  | "AllowAuthenticated"
  | "AllowPublic"
  | "AllowRole"
  | "AllowOwner"
  | "AllowRelation"
  | "OrCondition";

/** Loose input shape for an AuthCondition, used by validation functions. */
export interface AuthConditionInput {
  readonly kind: AuthConditionKind;
  readonly role?: string;
  readonly owner_field?: Field;
  readonly target_relation?: Relation;
  readonly relation_field?: Field;
  readonly left?: AuthConditionInput;
  readonly right?: AuthConditionInput;
}

/** Discriminated auth condition — each kind carries exactly its required fields. */
export type AuthCondition =
  | { readonly kind: "AllowAuthenticated" }
  | { readonly kind: "AllowPublic" }
  | { readonly kind: "AllowRole"; readonly role: string }
  | { readonly kind: "AllowOwner"; readonly owner_field: Field }
  | {
      readonly kind: "AllowRelation";
      readonly target_relation: Relation;
      readonly relation_field?: Field;
    }
  | { readonly kind: "OrCondition"; readonly left: AuthCondition; readonly right: AuthCondition };

/** A rule binding an action name to a condition within a policy. */
export interface PolicyRule {
  readonly action_name: string;
  readonly condition: AuthConditionInput;
  readonly policy: Policy;
}

/** Variable binding metadata for actor, resource, and action in a policy. */
export interface PolicyVariableBindings {
  /** Variable name representing the actor (e.g., "actor", "user"). */
  readonly actor?: string;
  /** Variable name representing the resource being accessed (e.g., "project", "post"). */
  readonly resource?: string;
  /** Variable name or literal representing the action (e.g., "read", "update"). */
  readonly action?: string;
}

/** A named set of authorization rules targeting a specific entity. */
export interface Policy<E extends Entity = Entity> {
  readonly name: string;
  readonly target_entity: E;
  readonly actions: PolicyRule[];
  /** Optional rule predicate that the policy uses for authorization decisions. */
  readonly predicate?: Rule;
  /** Optional typed access surface bindings (AUTHZ2+). When present, these augment or replace string-based actions. */
  readonly access_surface_bindings?: readonly AccessSurfaceBinding[];
  /** Optional explicit variable bindings for actor, resource, and action (AUTHZ2+). */
  readonly variable_bindings?: PolicyVariableBindings;
}

/** Describes the desired lowering target for a policy (SQL, server check, client metadata). */
export interface TranslationTarget {
  readonly kind: "sql_predicate" | "server_runtime_check" | "client_metadata" | "none";
}

/** Links a policy to a translation target and translatability status. */
export interface PolicyTranslation {
  readonly policy: Policy;
  readonly target: TranslationTarget;
  readonly translated_expression?: string;
  readonly translatable: boolean;
}

/** Describes how a policy is exposed to clients and whether it is safe to do so. */
export interface ClientPolicyExposure {
  readonly policy: Policy;
  readonly exposed_actions: readonly string[];
  readonly server_only_fields_hidden: boolean;
  readonly safe_to_expose: boolean;
}

// --- Builder ---------------------------------------------------------------

export interface PolicyBuilder<E extends Entity = Entity> {
  name(n: string): PolicyBuilder<E>;
  for<F extends Entity>(entity: F): PolicyBuilder<F>;
  rule(r: Rule): PolicyBuilder<E>;
  variables(v: PolicyVariableBindings): PolicyBuilder<E>;
  surface<S extends AccessSurfaceOf<E>>(s: S, deny?: DenyBehavior): PolicyBuilder<E>;
  build(): Policy<E>;
}

export const createPolicyBuilder = <E extends Entity = Entity>(): PolicyBuilder<E> => {
  let currentName: string | undefined;
  let currentEntity: E | undefined;
  let currentRule: Rule | undefined;
  let currentVariables: PolicyVariableBindings | undefined;
  const surfaces: { surface: AccessSurfaceOf<E>; deny?: DenyBehavior }[] = [];

  const builder = {
    name(n: string) {
      currentName = n;
      return this as unknown as PolicyBuilder<E>;
    },
    for<F extends Entity>(entity: F) {
      currentEntity = entity as unknown as E;
      return this as unknown as PolicyBuilder<F>;
    },
    rule(r: Rule) {
      currentRule = r;
      return this as unknown as PolicyBuilder<E>;
    },
    variables(v: PolicyVariableBindings) {
      currentVariables = v;
      return this as unknown as PolicyBuilder<E>;
    },
    surface<S extends AccessSurfaceOf<E>>(s: S, deny?: DenyBehavior) {
      surfaces.push({ surface: s, deny });
      return this as unknown as PolicyBuilder<E>;
    },
    build(): Policy<E> {
      if (!currentName) {
        throw new Error("policy builder: .name() must be called before .build()");
      }
      if (!currentEntity) {
        throw new Error("policy builder: .for() must be called before .build()");
      }
      return definePolicyImpl({
        name: currentName,
        target_entity: currentEntity,
        predicate: currentRule,
        variable_bindings: currentVariables,
        surfaces,
      } as never) as Policy<E>;
    },
  };

  return builder as unknown as PolicyBuilder<E>;
};

// --- Constructors ---------------------------------------------------------

/**
 * Creates a Policy and wires up action back-references.
 *
 * @param input - Policy properties including name, target entity, and actions.
 * @returns A Policy record.
 */
const definePolicyImpl = <E extends Entity = Entity>(input: {
  name: string;
  target_entity: E;
  actions?: readonly Omit<PolicyRule, "policy">[];
  predicate?: Rule;
  access_surface_bindings?: readonly AccessSurfaceBinding[];
  surfaces?: readonly { surface: AccessSurfaceOf<E>; deny?: DenyBehavior }[];
  /** Explicit variable bindings for actor, resource, and action. */
  variable_bindings?: PolicyVariableBindings;
}): Policy<E> => {
  const policy: Policy<E> = {
    name: input.name,
    target_entity: input.target_entity,
    actions: [],
    predicate: input.predicate,
    access_surface_bindings: input.access_surface_bindings,
    variable_bindings: input.variable_bindings,
  };
  for (const a of input.actions ?? []) {
    policy.actions.push({ ...a, policy });
  }
  if (input.surfaces) {
    const bindings = input.surfaces.map((s) =>
      defineAccessSurfaceBinding({ surface: s.surface, policy, deny: s.deny }),
    );
    (
      policy as { access_surface_bindings?: readonly AccessSurfaceBinding[] }
    ).access_surface_bindings = bindings;
  }
  return policy;
};

export function definePolicy<E extends Entity = Entity>(
  builder: (b: PolicyBuilder<E>) => Policy<E>,
): Policy<E>;
export function definePolicy<E extends Entity = Entity>(input: {
  name: string;
  target_entity: E;
  actions?: readonly Omit<PolicyRule, "policy">[];
  predicate?: Rule;
  access_surface_bindings?: readonly AccessSurfaceBinding[];
  surfaces?: readonly { surface: AccessSurfaceOf<E>; deny?: DenyBehavior }[];
  variable_bindings?: PolicyVariableBindings;
}): Policy<E>;
export function definePolicy<E extends Entity = Entity>(
  inputOrBuilder:
    | ((b: PolicyBuilder<E>) => Policy<E>)
    | {
        name: string;
        target_entity: E;
        actions?: readonly Omit<PolicyRule, "policy">[];
        predicate?: Rule;
        access_surface_bindings?: readonly AccessSurfaceBinding[];
        surfaces?: readonly { surface: AccessSurfaceOf<E>; deny?: DenyBehavior }[];
        variable_bindings?: PolicyVariableBindings;
      },
): Policy<E> {
  if (typeof inputOrBuilder === "function") {
    return inputOrBuilder(createPolicyBuilder<E>());
  }
  return definePolicyImpl(inputOrBuilder);
}

/**
 * Creates an AllowAuthenticated condition.
 *
 * @returns An AuthCondition of kind AllowAuthenticated.
 */
export const allowAuthenticated = (): Extract<AuthCondition, { kind: "AllowAuthenticated" }> => ({
  kind: "AllowAuthenticated",
});

/**
 * Creates an AllowPublic condition.
 *
 * @returns An AuthCondition of kind AllowPublic.
 */
export const allowPublic = (): Extract<AuthCondition, { kind: "AllowPublic" }> => ({
  kind: "AllowPublic",
});

/**
 * Creates an AllowRole condition.
 *
 * @param role - The required role name.
 * @returns An AuthCondition of kind AllowRole.
 */
export const allowRole = (role: string): Extract<AuthCondition, { kind: "AllowRole" }> => ({
  kind: "AllowRole",
  role,
});

/**
 * Creates an AllowOwner condition.
 *
 * @param field - The field identifying the owner.
 * @returns An AuthCondition of kind AllowOwner.
 */
export const allowOwner = (field: Field): Extract<AuthCondition, { kind: "AllowOwner" }> => ({
  kind: "AllowOwner",
  owner_field: field,
});

/**
 * Creates an AllowRelation condition.
 *
 * @param relation - The relation to check.
 * @param field - Optional field on the relation.
 * @returns An AuthCondition of kind AllowRelation.
 */
export const allowRelation = (
  relation: Relation,
  field?: Field,
): Extract<AuthCondition, { kind: "AllowRelation" }> => ({
  kind: "AllowRelation",
  target_relation: relation,
  relation_field: field,
});

/**
 * Creates an OrCondition combining two conditions.
 *
 * @param left - Left condition.
 * @param right - Right condition.
 * @returns An AuthCondition of kind OrCondition.
 */
export const or = (
  left: AuthCondition,
  right: AuthCondition,
): Extract<AuthCondition, { kind: "OrCondition" }> => ({
  kind: "OrCondition",
  left,
  right,
});

// --- Invariants and rules --------------------------------------------------

/**
 * Validates authorization invariants: policy back-references, owner/relation entity
 * ownership, getter/mutator policy matching, cross-store relation enforceability,
 * SQL translation validity, and safe client exposure.
 *
 * @param input - Authorization objects to validate.
 * @returns Diagnostics for any violated authorization rules.
 */
export const checkAuthz = (input: {
  policies: readonly Policy[];
  translations: readonly PolicyTranslation[];
  exposures: readonly ClientPolicyExposure[];
  getters?: readonly Getter[];
  mutators?: readonly Mutator[];
  entities?: readonly Entity[];
}): readonly Diagnostic[] => {
  const out: Diagnostic[] = [];

  // PolicyActionsMatchEntity (each rule's policy points back)
  for (const p of input.policies) {
    for (const a of p.actions) {
      if (a.policy !== p) {
        out.push(
          diagnostic({
            severity: "error",
            code: "authz:rule-policy-mismatch",
            message: `Rule for action ${a.action_name} in policy ${p.name} has wrong back-pointer`,
          }),
        );
      }
    }
  }

  // OwnerFieldBelongsToEntity
  for (const p of input.policies) {
    for (const a of p.actions) {
      if (a.condition.kind === "AllowOwner" && a.condition.owner_field) {
        if (a.condition.owner_field.owning_entity !== p.target_entity) {
          out.push(
            diagnostic({
              severity: "error",
              code: "authz:owner-field-wrong-entity",
              message: `Policy ${p.name}: AllowOwner field ${a.condition.owner_field.name} belongs to a different entity`,
            }),
          );
        }
      }
      if (a.condition.kind === "AllowRelation" && a.condition.target_relation) {
        if (a.condition.target_relation.from_entity !== p.target_entity) {
          out.push(
            diagnostic({
              severity: "error",
              code: "authz:relation-wrong-entity",
              message: `Policy ${p.name}: AllowRelation does not start at policy target entity`,
            }),
          );
        }
      }
    }
  }

  // PolicyAppliedToGetter / PolicyAppliedToMutator (auth references valid policy + entity)
  for (const g of input.getters ?? []) {
    if (!g.auth) continue;
    const ok = input.policies.some(
      (p) => p.name === g.auth!.policy_name && p.target_entity === g.target_entity,
    );
    if (!ok) {
      out.push(
        diagnostic({
          severity: "error",
          code: "authz:policy-entity-mismatch",
          message: `Policy ${g.auth.policy_name} does not match getter entity`,
        }),
      );
    }
  }
  for (const m of input.mutators ?? []) {
    if (!m.auth) continue;
    const ok = input.policies.some(
      (p) => p.name === m.auth!.policy_name && p.target_entity === m.target_entity,
    );
    if (!ok) {
      out.push(
        diagnostic({
          severity: "error",
          code: "authz:policy-entity-mismatch",
          message: `Policy ${m.auth.policy_name} does not match mutator entity`,
        }),
      );
    }
  }

  // UnenforceablePolicy (cross-store relation)
  for (const p of input.policies) {
    for (const a of p.actions) {
      if (a.condition.kind === "AllowRelation" && a.condition.target_relation) {
        const fromStore = p.target_entity.store_name;
        const toStore = a.condition.target_relation.to_entity.store_name;
        if (fromStore && toStore && fromStore !== toStore) {
          out.push(
            diagnostic({
              severity: "warning",
              code: "authz:unenforceable-policy",
              message: `Relation-aware policy may not be translatable to SQL for cross-store relation`,
            }),
          );
        }
      }
    }
  }

  // PolicyTranslationTargetValid + PolicyNotTranslatableToSQL
  for (const pt of input.translations) {
    if (pt.target.kind === "sql_predicate") {
      if (pt.translatable && pt.policy.target_entity.store_name == null) {
        out.push(
          diagnostic({
            severity: "error",
            code: "authz:sql-translation-no-store",
            message: `Policy ${pt.policy.name} marked translatable to SQL but its entity has no store`,
          }),
        );
      }
      if (!pt.translatable) {
        out.push(
          diagnostic({
            severity: "warning",
            code: "authz:sql-translation-failed",
            message: `Policy ${pt.policy.name} cannot be translated to SQL predicate`,
          }),
        );
      }
    }
  }

  // ServerOnlyFieldExposedInClientPolicy
  for (const cpe of input.exposures) {
    for (const action of cpe.exposed_actions) {
      for (const policy_rule of cpe.policy.actions) {
        if (
          policy_rule.action_name === action &&
          policy_rule.condition.kind === "AllowOwner" &&
          policy_rule.condition.owner_field &&
          policy_rule.condition.owner_field.semantic_type.server_only
        ) {
          out.push(
            diagnostic({
              severity: "error",
              code: "authz:server-only-in-client-policy",
              message: `Server-only owner field exposed in client policy metadata for action ${action}`,
            }),
          );
        }
      }
    }
  }

  // UnsafeClientPolicyExposure + ClientExposureSafe invariant
  for (const cpe of input.exposures) {
    if (!cpe.safe_to_expose && !cpe.server_only_fields_hidden) {
      out.push(
        diagnostic({
          severity: "error",
          code: "authz:unsafe-client-exposure",
          message: `Policy ${cpe.policy.name} exposes unsafe metadata to client`,
        }),
      );
    }
    if (cpe.safe_to_expose && !cpe.server_only_fields_hidden) {
      out.push(
        diagnostic({
          severity: "error",
          code: "authz:safe-but-not-hidden",
          message: `Policy ${cpe.policy.name} marked safe_to_expose but server-only fields aren't hidden`,
        }),
      );
    }
  }

  // RuleDependencyExists (validate rule-backed policies have resolvable dependencies)
  const knownEntities = new Set(input.entities ?? []);
  for (const p of input.policies) {
    if (!p.predicate) continue;
    const deps = extractRuleDependencies(p.predicate);
    for (const e of deps.entities) {
      if (!knownEntities.has(e)) {
        out.push(
          diagnostic({
            severity: "error",
            code: "authz:rule-dependencies-missing",
            message: `Policy ${p.name} rule "${p.predicate.name}" depends on entity "${e.name}" which is not registered`,
          }),
        );
      }
    }
  }

  // PolicyVariableBindingMissing (rule-backed policies should declare actor/resource/action bindings)
  for (const p of input.policies) {
    if (!p.predicate) continue;
    if (!p.variable_bindings) {
      out.push(
        diagnostic({
          severity: "warning",
          code: "authz:policy-variable-binding-missing",
          message: `Policy ${p.name} uses a rule predicate but does not declare variable_bindings (actor, resource, action). Add explicit bindings for clarity and tooling.`,
          suggestion: `Add variable_bindings: { actor: "actor", resource: "${p.target_entity.name.toLowerCase()}" } to policy ${p.name}`,
        }),
      );
    }
  }

  // MissingServerEnforcement / AuthoritativeClientPolicy
  for (const p of input.policies) {
    for (const binding of p.access_surface_bindings ?? []) {
      if (binding.surface.kind === "ui.hint") {
        // Client hints must always be non-authoritative
        const isClientOnly =
          binding.placement?.kind === "client_hint" || (!binding.placement && p.predicate == null);
        if (isClientOnly && p.predicate == null) {
          out.push(
            diagnostic({
              severity: "error",
              code: "authz:missing-server-enforcement",
              message: `Policy ${p.name} for UI hint surface has no server-side enforcement. Client hints are not authoritative.`,
            }),
          );
        }
      }
    }
  }

  // Placement analysis for access-surface bindings (AUTHZ2+)
  out.push(...checkPlacement({ policies: input.policies }));

  return out;
};
