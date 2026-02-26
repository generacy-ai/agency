// Schemas barrel — re-exports from domain schema modules

// Common (IDs, timestamps)
export * from './common/index.js';

// Tool result schemas (terse output pattern)
export {
  TerseToolResultSchema,
  type TerseToolResult,
  type TerseToolOptions,
  parseTerseToolResult,
  safeParseTerseToolResult,
} from './tool-result.js';

// Platform API schemas (auth, organization, subscription)
export * from './platform-api/index.js';
