import { type ToolName } from './tool-name.js';

/**
 * Options for creating a tool catalog.
 */
export interface ToolCatalogOptions {
  /** Whether to allow duplicate tool names (default: false) */
  allowDuplicates?: boolean;
  /** Whether to validate tools on registration (default: true) */
  validateOnRegister?: boolean;
}

/**
 * Alias map for quick lookup of tool names by alias.
 */
export type AliasMap = Map<ToolName, ToolName>;
