/* @__NO_SIDE_EFFECTS__ */
/**
 * Kernel kind - typed node and edge kind definitions.
 *
 * Provides typed symbols for node kinds, edge kinds, and endpoint roles.
 */

/** Common node kinds. */
export const nodeKinds = {
  ENTITY: { id: "node.kind.entity", label: "Entity" },
  FIELD: { id: "node.kind.field", label: "Field" },
  RULE: { id: "node.kind.rule", label: "Rule" },
  QUERY: { id: "node.kind.query", label: "Query" },
  ACTION: { id: "node.kind.action", label: "Action" },
  VIEW: { id: "node.kind.view", label: "View" },
  POLICY: { id: "node.kind.policy", label: "Policy" },
  PROVIDER: { id: "node.kind.provider", label: "Provider" },
  SERVICE: { id: "node.kind.service", label: "Service" },
  BOUNDARY: { id: "node.kind.boundary", label: "Boundary" },
  STORAGE: { id: "node.kind.storage", label: "Storage" },
  WORKFLOW: { id: "node.kind.workflow", label: "Workflow" },
  DISPATCH: { id: "node.kind.dispatch", label: "Dispatch" },
  RESOURCE: { id: "node.kind.resource", label: "Resource" },
  KEY: { id: "node.kind.key", label: "Key" },
  STATIC: { id: "node.kind.static", label: "Static" },
} as const;

/** Common edge kinds. */
export const edgeKinds = {
  OWNS: { id: "edge.kind.owns", label: "Owns" },
  CONTAINS: { id: "edge.kind.contains", label: "Contains" },
  REFERENCES: { id: "edge.kind.references", label: "References" },
  READS: { id: "edge.kind.reads", label: "Reads" },
  WRITES: { id: "edge.kind.writes", label: "Writes" },
  DERIVES: { id: "edge.kind.derives", label: "Derives" },
  REQUIRES: { id: "edge.kind.requires", label: "Requires" },
  PROVIDES: { id: "edge.kind.provides", label: "Provides" },
  INVALIDATES: { id: "edge.kind.invalidates", label: "Invalidates" },
  PATCHES: { id: "edge.kind.patches", label: "Patches" },
  EMITS: { id: "edge.kind.emits", label: "Emits" },
  HANDLES: { id: "edge.kind.handles", label: "Handles" },
  TRIGGERS: { id: "edge.kind.triggers", label: "Triggers" },
  GUARDS: { id: "edge.kind.guards", label: "Guards" },
  DISPLAYS: { id: "edge.kind.displays", label: "Displays" },
  EDITS: { id: "edge.kind.edits", label: "Edits" },
  SUBMITS: { id: "edge.kind.submits", label: "Submits" },
  STORES: { id: "edge.kind.stores", label: "Stores" },
  MAPS_TO: { id: "edge.kind.mapsTo", label: "Maps-to" },
  CROSSES_BOUNDARY: { id: "edge.kind.crossesBoundary", label: "Crosses-boundary" },
  LOWERS_TO: { id: "edge.kind.lowersTo", label: "Lowers-to" },
  GENERATED_FROM: { id: "edge.kind.generatedFrom", label: "Generated-from" },
  DEPENDS_ON: { id: "edge.kind.dependsOn", label: "Depends-on" },
  DOMAIN_RELATION: { id: "edge.kind.domain.relation", label: "Domain relation" },
} as const;

/** Common edge endpoint roles. */
export const endpointRoles = {
  OWNER: { id: "edge.role.owner", label: "Owner" },
  OWNED: { id: "edge.role.owned", label: "Owned" },
  SOURCE: { id: "edge.role.source", label: "Source" },
  TARGET: { id: "edge.role.target", label: "Target" },
  READER: { id: "edge.role.reader", label: "Reader" },
  WRITER: { id: "edge.role.writer", label: "Writer" },
  GUARD: { id: "edge.role.guard", label: "Guard" },
  GUARDED: { id: "edge.role.guarded", label: "Guarded" },
  PROVIDER: { id: "edge.role.provider", label: "Provider" },
  CONSUMER: { id: "edge.role.consumer", label: "Consumer" },
  DERIVER: { id: "edge.role.deriver", label: "Deriver" },
  DERIVED: { id: "edge.role.derived", label: "Derived" },
  VIEW: { id: "edge.role.view", label: "View" },
  ACTION_ROLE: { id: "edge.role.action", label: "Action" },
  FIELD: { id: "edge.role.field", label: "Field" },
  CONTAINER: { id: "edge.role.container", label: "Container" },
  ENTITY: { id: "edge.role.entity", label: "Entity" },
  FROM_ENTITY: { id: "edge.role.fromEntity", label: "From entity" },
  TO_ENTITY: { id: "edge.role.toEntity", label: "To entity" },
  FROM_FIELD: { id: "edge.role.fromField", label: "From field" },
  TO_FIELD: { id: "edge.role.toField", label: "To field" },
  INVERSE: { id: "edge.role.inverse", label: "Inverse" },
} as const;