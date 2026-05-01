/* @__NO_SIDE_EFFECTS__ */
/**
 * Typed Storage Locations.
 *
 * Models where data lives (server request context, client localStorage,
 * shared cookie, etc.) with semantic capabilities so the lifecycle can
 * emit diagnostics for unsafe placements.
 */

// --- Storage Location Kinds ------------------------------------------------

export type StorageLocationKind =
  | "server.requestContext"
  | "server.sessionStore"
  | "client.localStorage"
  | "client.sessionStorage"
  | "client.queryCache"
  | "client.memory"
  | "shared.cookie"
  | "shared.database"
  | "shared.cache"
  | "shared.queue";

// --- Capabilities ----------------------------------------------------------

export interface StorageCapabilities {
  /** Data survives page reloads. */
  readonly persistent: boolean;
  /** Safe for sensitive data (secrets, tokens). */
  readonly sensitive_safe: boolean;
  /** Readable by client code. */
  readonly client_readable: boolean;
  /** Writable by client code. */
  readonly client_writable: boolean;
  /** Readable by server code. */
  readonly server_readable: boolean;
  /** Writable by server code. */
  readonly server_writable: boolean;
}

// --- Location IR -----------------------------------------------------------

export interface StorageLocation {
  readonly kind: "storage_location";
  readonly location_kind: StorageLocationKind;
  readonly name: string;
  readonly capabilities: StorageCapabilities;
  readonly ttl_ms?: number;
}

// --- Predefined locations --------------------------------------------------

const makeLocation = (
  location_kind: StorageLocationKind,
  name: string,
  capabilities: StorageCapabilities,
  ttl_ms?: number,
): StorageLocation => ({
  kind: "storage_location",
  location_kind,
  name,
  capabilities,
  ttl_ms,
});

export const serverRequestContext = (): StorageLocation =>
  makeLocation("server.requestContext", "Server Request Context", {
    persistent: false,
    sensitive_safe: true,
    client_readable: false,
    client_writable: false,
    server_readable: true,
    server_writable: true,
  });

export const serverSessionStore = (): StorageLocation =>
  makeLocation("server.sessionStore", "Server Session Store", {
    persistent: true,
    sensitive_safe: true,
    client_readable: false,
    client_writable: false,
    server_readable: true,
    server_writable: true,
  });

export const clientLocalStorage = (): StorageLocation =>
  makeLocation("client.localStorage", "Client Local Storage", {
    persistent: true,
    sensitive_safe: false,
    client_readable: true,
    client_writable: true,
    server_readable: false,
    server_writable: false,
  });

export const clientSessionStorage = (): StorageLocation =>
  makeLocation("client.sessionStorage", "Client Session Storage", {
    persistent: true,
    sensitive_safe: false,
    client_readable: true,
    client_writable: true,
    server_readable: false,
    server_writable: false,
  });

export const clientQueryCache = (): StorageLocation =>
  makeLocation("client.queryCache", "Client Query Cache", {
    persistent: false,
    sensitive_safe: false,
    client_readable: true,
    client_writable: true,
    server_readable: false,
    server_writable: false,
  });

export const clientMemory = (): StorageLocation =>
  makeLocation("client.memory", "Client Memory", {
    persistent: false,
    sensitive_safe: false,
    client_readable: true,
    client_writable: true,
    server_readable: false,
    server_writable: false,
  });

export const sharedCookie = (): StorageLocation =>
  makeLocation("shared.cookie", "Shared Cookie", {
    persistent: true,
    sensitive_safe: false,
    client_readable: true,
    client_writable: false,
    server_readable: true,
    server_writable: true,
  });

export const sharedDatabase = (): StorageLocation =>
  makeLocation("shared.database", "Shared Database", {
    persistent: true,
    sensitive_safe: true,
    client_readable: false,
    client_writable: false,
    server_readable: true,
    server_writable: true,
  });

export const sharedCache = (): StorageLocation =>
  makeLocation("shared.cache", "Shared Cache", {
    persistent: false,
    sensitive_safe: false,
    client_readable: false,
    client_writable: false,
    server_readable: true,
    server_writable: true,
  });

export const sharedQueue = (): StorageLocation =>
  makeLocation("shared.queue", "Shared Queue", {
    persistent: true,
    sensitive_safe: true,
    client_readable: false,
    client_writable: false,
    server_readable: true,
    server_writable: true,
  });

// --- Validation helpers ----------------------------------------------------

/** True if storing sensitive data in this location is unsafe. */
export const isSensitivePlacementUnsafe = (location: StorageLocation): boolean =>
  !location.capabilities.sensitive_safe;

/** True if the location is readable from the client. */
export const isClientReadable = (location: StorageLocation): boolean =>
  location.capabilities.client_readable;
