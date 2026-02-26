// Schemas and types
export {
  ToolCallEventV1,
  ToolCallEvent,
  TelemetryFilterSchema,
  StatsFilterSchema,
  ToolStatsSchema,
  TimeWindow,
  TimeWindowSchema,
  ErrorCategory,
  ErrorCategorySchema,
  ToolStatsApiSchema,
  ULID_REGEX,
  generateEventId,
  type TelemetryFilter,
  type StatsFilter,
  type ToolStats,
  type ToolStatsApi,
} from './schemas.js';

// Interfaces and types
export type {
  TelemetryStorageProvider,
  MemoryProviderOptions,
  ToolCallHandler,
  WrapHandlerOptions,
  SubscriberCallback,
} from './types.js';

// Configuration
export {
  TelemetryConfigSchema,
  DEFAULT_TELEMETRY_CONFIG,
  MemoryProviderOptionsSchema,
  type TelemetryConfig,
  type MemoryProviderOptionsConfig,
} from './config.js';

// Core classes
export { TelemetryBus } from './bus.js';
export { TelemetryManager } from './manager.js';

// Interceptor utilities
export { wrapToolHandler, createHandlerWrapper } from './interceptor.js';

// Built-in providers
export { MemoryStorageProvider } from './providers/index.js';
export {
  FileStorageProvider,
  FileProviderOptionsSchema,
  RotationResultSchema,
  type FileProviderOptions,
  type RotationResult,
} from './providers/index.js';

// Factory function
export { createTelemetryManager, type CreateTelemetryManagerOptions } from './factory.js';
