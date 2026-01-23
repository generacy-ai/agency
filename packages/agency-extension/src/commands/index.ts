/**
 * Command exports for the Agency VS Code extension.
 */

export {
  configurePlugin,
  enablePlugin,
  disablePlugin,
  refreshPlugins,
  registerPluginCommands,
  initializePluginCommands,
} from './plugin-commands';

export {
  testTool,
  refreshTools,
  connectMcp,
  disconnectMcp,
  registerToolCommands,
  initializeToolCommands,
} from './tool-commands';

export {
  switchMode,
  viewModeTools,
  refreshModes,
  registerModeCommands,
  initializeModeCommands,
} from './mode-commands';

export {
  startContainer,
  stopContainer,
  rebuildContainer,
  viewContainerLogs,
  registerContainerCommands,
  initializeContainerCommands,
  showContainerPicker,
  setVscodeModule,
} from './container-commands';
