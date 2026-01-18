export { ModeManager } from './manager.js';
export type {
  ModeChangeCallback,
  ModeChangeUnsubscribe,
  LegacyModeConfig,
} from './manager.js';
export { ModeErrorCodes } from './manager.js';
export { matchesTool, matchesPattern } from './pattern-matcher.js';
export { resolveInheritance } from './inheritance-resolver.js';
export type {
  ModeDefinition,
  ResolvedMode,
  ModeConfig,
  ModeDefinitionInput,
  ModeConfigInput,
} from './types.js';
export { ModeDefinitionSchema, ModeConfigSchema } from './types.js';
export { loadModeConfig, DEFAULT_MODES } from './config-loader.js';
