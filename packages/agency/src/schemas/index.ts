// Schemas barrel — re-exports from domain schema modules

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
