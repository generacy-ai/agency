// Core plugin loader
export { PluginLoader, PluginErrorCodes } from './loader.js';
export type { PluginLoadOptions, PluginLoaderDependencies } from './loader.js';

// Plugin types
export type {
  AgencyPlugin,
  LegacyAgencyPlugin,
  PluginManifest,
  PluginState,
  DiscoveredPlugin,
  DiscoveryOptions,
  ValidationResult,
  DependencyCheck,
  AgencyCoreAPI,
  ChannelDefinition,
  MessageEnvelope,
  TelemetryEvent,
} from './types.js';

// Manifest validation
export {
  PluginManifestSchema,
  validateManifest,
  parseManifest,
  safeParseManifest,
  validateDependencyIds,
  createTestManifest,
} from './manifest.js';

// Plugin discovery
export {
  PluginDiscovery,
  createDiscoveryOptions,
} from './discovery.js';

// Dependency resolution
export {
  DependencyResolver,
  CircularDependencyError,
  MissingDependencyError,
  checkDependencies,
  resolveLoadOrder,
} from './dependency-resolver.js';
