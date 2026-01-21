/**
 * Shared constants for the Agency VS Code extension.
 */

/** Extension identifier */
export const EXTENSION_ID = 'generacy-ai.agency-extension';

/** Extension display name */
export const EXTENSION_NAME = 'Agency';

/** View identifiers */
export const VIEW_IDS = {
  PLUGINS: 'agency.plugins',
  TOOLS: 'agency.tools',
  ACTIVITY: 'agency.activity',
  CONTAINERS: 'agency.containers',
  MODES: 'agency.modes',
} as const;

/** Command identifiers */
export const COMMANDS = {
  // Plugin commands
  CONFIGURE_PLUGIN: 'agency.configurePlugin',
  ENABLE_PLUGIN: 'agency.enablePlugin',
  DISABLE_PLUGIN: 'agency.disablePlugin',
  REFRESH_PLUGINS: 'agency.refreshPlugins',

  // Tool commands
  TEST_TOOL: 'agency.testTool',
  REFRESH_TOOLS: 'agency.refreshTools',
  CONNECT_MCP: 'agency.connectMcp',
  DISCONNECT_MCP: 'agency.disconnectMcp',

  // Mode commands
  SWITCH_MODE: 'agency.switchMode',
  VIEW_MODE_TOOLS: 'agency.viewModeTools',

  // Container commands
  START_CONTAINER: 'agency.startContainer',
  STOP_CONTAINER: 'agency.stopContainer',
  REBUILD_CONTAINER: 'agency.rebuildContainer',
  VIEW_CONTAINER_LOGS: 'agency.viewContainerLogs',
} as const;

/** Configuration keys */
export const CONFIG_KEYS = {
  CONFIG_PATH: 'agency.configPath',
  AUTO_CONNECT: 'agency.autoConnect',
} as const;

/** Default configuration values */
export const CONFIG_DEFAULTS = {
  CONFIG_PATH: '.agency/agency.config.json',
  AUTO_CONNECT: true,
} as const;

/** Output channel name */
export const OUTPUT_CHANNEL_NAME = 'Agency';

/** Log levels */
export const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const;

export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

/** Activity bar icon */
export const ACTIVITY_BAR_ICON = 'media/icons/agency.svg';

/** Context keys for conditional command enablement */
export const CONTEXT_KEYS = {
  MCP_CONNECTED: 'agency.mcpConnected',
  HAS_CONTAINERS: 'agency.hasContainers',
  HAS_PLUGINS: 'agency.hasPlugins',
} as const;
