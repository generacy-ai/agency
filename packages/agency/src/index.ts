/**
 * @generacy-ai/agency - Core agent infrastructure for Generacy platform
 *
 * Provides the AgencyServer - an MCP server foundation with:
 * - Plugin-based tool registration
 * - Mode-based tool filtering
 * - Multi-source configuration
 * - Graceful lifecycle management
 */

// Server
export { AgencyServer, type AgencyServerOptions } from './server/index.js';

// Config
export {
  ConfigLoader,
  AgencyConfigSchema,
  DEFAULT_CONFIG,
  type AgencyConfig,
  type PartialAgencyConfig,
  type ConfigSource,
} from './config/index.js';

// Tools
export {
  ToolRegistry,
  toMcpTool,
  type AgencyTool,
  type ToolResult,
  type ToolContent,
  type McpTool,
  type JsonSchema,
} from './tools/index.js';

// Plugins
export {
  PluginLoader,
  PluginErrorCodes,
  PluginDiscovery,
  DependencyResolver,
  PluginManifestSchema,
  validateManifest,
  parseManifest,
  createTestManifest,
  CircularDependencyError,
  MissingDependencyError,
  type AgencyPlugin,
  type LegacyAgencyPlugin,
  type PluginManifest,
  type PluginState,
  type DiscoveredPlugin,
  type AgencyCoreAPI,
  type PluginLoadOptions,
} from './plugins/index.js';

// Channels
export {
  ChannelManager,
  createMessageEnvelope,
  type ChannelDefinition,
  type MessageEnvelope,
  type MessageHandler,
  type ChannelState,
} from './channels/index.js';

// Core API
export {
  CoreAPIFactory,
  createCoreAPIFactory,
  type CoreAPIDependencies,
} from './core-api/index.js';

// Modes
export { ModeManager } from './modes/index.js';

// Errors
export { AgencyError, ErrorCodes, type ErrorCode } from './errors/index.js';

// Telemetry - Tool call interception and event capture
export * from './telemetry/index.js';

// Output - Terse output pattern utilities
export {
  TerseOutput,
  toMcpToolResult as terseToMcpToolResult,
  formatError,
  SUCCESS_MESSAGES,
  getSuccessMessage,
  Verbosity,
  DEFAULT_TERSE_CONFIG,
  type TerseToolResult,
  type ExecResult,
  type TerseOutputConfig,
  type SuccessMessageKey,
} from './output/index.js';

// Utils - Git utilities and other helpers
export {
  isGitRepo,
  getGit,
  getCurrentBranch,
  branchExists,
  createBranch,
  checkout,
  fetch,
  getStatus,
  type GitStatus,
  type FetchOptions,
} from './utils/index.js';
