/* @__NO_SIDE_EFFECTS__ */
/**
 * Plugin contract. Plugins extend the kernel with helpers, targets, runtimes,
 * stores, operations, metadata namespaces, diagnostic codes, check hooks, codegen
 * hooks, and artifact transforms. This is the only sanctioned extension surface;
 * plugins must NOT mutate global state.
 *
 * See spec/core.allium :: entity Plugin, entity PluginSetup, entity PluginContext,
 * entity PluginContributions, entity Helper, entity MetadataNamespace.
 */

import type { Artifact } from "./artifacts.ts";
import type { Diagnostic, DiagnosticDefinition, Severity } from "./diagnostics.ts";
import type { Ref } from "./refs.ts";
import type { TargetInputRecord } from "./target.ts";
import type { StaticNode, TraitKind, TraitMetadata } from "./node.ts";

/** Lifecycle status of a plugin within the kernel. */
export type PluginStatus = "registered" | "active" | "failed";

/** Extension slot for plugin-contributed context properties. */
export interface PluginContextExtensions {
  // intentionally empty — plugins augment via declaration merging
}

/** A plugin-contributed helper function or namespace entry. */
export interface Helper {
  readonly name: string;
  readonly namespace: string;
  /** Optional runtime value exposed on `gen.<namespace>.<name>`. */
  readonly value?: unknown;
  /** Optional factory that materializes a context-bound helper value. */
  readonly materialize?: (input: { ctx: object; gen: object }) => unknown;
  /** Set by HelperAvailableWhenRegistered after the plugin is activated. */
  available_in?: object | null;
}

/** A named metadata namespace with typed keys and values. */
export interface MetadataNamespace {
  readonly name: string;
  readonly key_type: string;
  readonly value_type: string;
}

/** A plugin-contributed check hook that validates a target's inputs. */
export interface CheckHook {
  readonly name: string;
  readonly target_kind: string;
  readonly check_fn: (
    input: TargetInputRecord,
  ) => readonly Diagnostic[] | Promise<readonly Diagnostic[]>;
}

/** A plugin-contributed codegen hook that generates artifacts for a target. */
export interface CodegenHook {
  readonly name: string;
  readonly target_kind: string;
  readonly generate_fn: (
    input: TargetInputRecord,
  ) => readonly Artifact[] | Promise<readonly Artifact[]>;
}

/** A plugin-contributed transform applied to generated artifacts. */
export interface ArtifactTransform {
  readonly name: string;
  readonly transform_fn: (artifact: Artifact) => Artifact;
}

/**
 * Build-time inputs that a plugin consumes. Since contributions reference targets
 * (which the plugin itself may define), we keep the type loose and let the
 * contributions object be assembled by `definePlugin`.
 */
export interface PluginContext extends PluginContextExtensions {
  readonly core_constructors: readonly string[];
  readonly registered_refs: readonly Ref[];
  readonly registered_metadata: readonly MetadataNamespace[];
  readonly runtime_registry: readonly string[];
  readonly target_registry: readonly string[];
  readonly store_registry: readonly string[];
  readonly operation_registry: readonly string[];
  readonly diagnostic_factory: (input: {
    code: string;
    severity: Severity;
    message: string;
  }) => Diagnostic;
  readonly artifact_factory: (input: { path: string; content: string }) => Artifact;
  readonly requirement_helpers: readonly string[];
}

/** A plugin-contributed custom node kind with traits and lifecycle hooks. */
export interface NodeKindContribution {
  readonly kind: string;
  readonly traits: readonly TraitKind[];
  readonly check?: (node: StaticNode) => readonly Diagnostic[];
  readonly deriveGraph?: (node: StaticNode, ctx: PluginContext) => unknown;
  readonly interpret?: Record<string, (node: StaticNode) => readonly Artifact[]>;
}

/** A plugin-contributed lowering from a custom node to canonical IR. */
export interface LoweringContribution {
  readonly from_kind: string;
  readonly to_kind: string;
  readonly lower: (node: StaticNode) => StaticNode | readonly StaticNode[];
}

/** Aggregated contributions produced by a plugin's setup function. */
export interface PluginContributions {
  readonly helpers: readonly Helper[];
  readonly targets: readonly TargetContribution[];
  readonly runtimes: readonly string[];
  readonly stores: readonly string[];
  readonly operations: readonly string[];
  readonly metadata_namespaces: readonly MetadataNamespace[];
  readonly diagnostic_definitions: readonly DiagnosticDefinition[];
  readonly checks: readonly CheckHook[];
  readonly codegen_hooks: readonly CodegenHook[];
  readonly artifact_transforms: readonly ArtifactTransform[];
  readonly node_kinds: readonly NodeKindContribution[];
  readonly lowerings: readonly LoweringContribution[];
  /** Plugin-contributed trait metadata, keyed by trait name. */
  readonly trait_metadata?: Record<string, TraitMetadata>;
}

/**
 * A target name + acceptable input kinds, contributed by a plugin. Concrete Target
 * entities are materialized when a target is first invoked; this is the contribution
 * record stored on the plugin itself.
 */
export interface TargetContribution {
  readonly name: string;
  readonly accepts_inputs: readonly string[];
  /** Plugin-supplied check function for this target's inputs. */
  readonly check?: (input: TargetInputRecord) => readonly Diagnostic[];
  /** Optional code generation function for this target. */
  readonly generate?: (input: TargetInputRecord) => readonly Artifact[];
}

/** Describes a plugin's setup function and its runtime behavior. */
export interface PluginSetup<P extends Plugin = Plugin> {
  /** Optional reference to the function name (for diagnostics/debugging). */
  readonly setup_fn: string;
  readonly run: (ctx: PluginContext) => P["contributions"];
}

/** A plugin definition including identity, helpers, dependencies, setup, contributions, and status. */
export interface Plugin<THelpers extends object = {}> {
  readonly id: string;
  readonly namespace: string;
  readonly helpers: readonly Helper[];
  readonly required_plugins: readonly Plugin[];
  readonly setup?: PluginSetup;
  readonly contributions: PluginContributions;
  readonly __gen_helpers__?: THelpers;
  status: PluginStatus;
}

/** User-facing plugin definition input. */
export interface DefinePluginInput {
  id: string;
  namespace: string;
  requires?: readonly Plugin[];
  setup?: (ctx: PluginContext) => Partial<PluginContributions>;
}

/**
 * `definePlugin()` produces a Plugin record. The setup function isn't run yet —
 * it runs during `createGen()` so the kernel can supply a real PluginContext.
 *
 * @param input - The plugin definition input.
 * @returns A Plugin record ready for registration.
 */
export const definePlugin = <THelpers extends object = {}>(
  input: DefinePluginInput,
): Plugin<THelpers> => ({
  id: input.id,
  namespace: input.namespace,
  helpers: [],
  required_plugins: input.requires ?? [],
  setup: input.setup
    ? {
        setup_fn: input.setup.name || `${input.id}.setup`,
        run: (ctx) => mergeContributions(input.setup!(ctx)),
      }
    : undefined,
  contributions: emptyContributions(),
  status: "registered",
});

/** Helper for defining a plugin-contributed node kind. */
export const defineNodeKind = (input: NodeKindContribution): NodeKindContribution => input;

/** Helper for defining a plugin-contributed lowering from a custom node to canonical IR. */
export const defineLowering = (input: LoweringContribution): LoweringContribution => input;

const emptyContributions = (): PluginContributions => ({
  helpers: [],
  targets: [],
  runtimes: [],
  stores: [],
  operations: [],
  metadata_namespaces: [],
  diagnostic_definitions: [],
  checks: [],
  codegen_hooks: [],
  artifact_transforms: [],
  node_kinds: [],
  lowerings: [],
});

const mergeContributions = (partial: Partial<PluginContributions>): PluginContributions => ({
  ...emptyContributions(),
  ...partial,
});
