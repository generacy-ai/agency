/**
 * Tool Registry for Agency
 *
 * Manages tool registration and provides mode-based filtering
 * using minimatch glob patterns with include/exclude support.
 */

import { AgencyError, ErrorCodes } from '../errors/index.js';
import { matchesTool } from '../modes/pattern-matcher.js';
import type {
  AgencyTool,
  McpTool,
  ValidationOptions,
  ValidationResult,
  ToolCatalog,
} from './types.js';
import { toMcpTool } from './types.js';
import { validateToolName } from './validation.js';

/**
 * Mode patterns with includes and excludes
 */
export interface ModePatterns {
  /** Tool patterns to include (glob syntax) */
  includes: string[];
  /** Tool patterns to exclude (always win over includes) */
  excludes: string[];
}

/**
 * Input type for setModePatterns - can be:
 * - Legacy string[] (treated as includes only)
 * - ModePatterns with explicit includes/excludes
 * - ModeDefinition-like object (has includes, optional excludes)
 */
type ModePatternInput = string[] | ModePatterns | { includes: string[]; excludes?: string[] };

/**
 * Type guard to check if input has includes property
 */
function hasIncludesProperty(value: ModePatternInput): value is { includes: string[]; excludes?: string[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'includes' in value &&
    Array.isArray(value.includes)
  );
}

/**
 * Tool registry for managing and filtering tools
 */
export class ToolRegistry {
  private readonly tools = new Map<string, AgencyTool>();
  private readonly modePatterns = new Map<string, ModePatterns>();

  /**
   * Set the mode patterns for filtering
   *
   * Accepts multiple formats for backwards compatibility:
   * - Legacy: `Record<string, string[]>` - patterns treated as includes only
   * - ModePatterns: `Record<string, ModePatterns>` - includes and excludes
   * - ModeDefinition-like: Objects with `includes` and optional `excludes`
   *
   * @param modes - Mode configuration with patterns
   */
  setModePatterns(modes: Record<string, ModePatternInput>): void {
    this.modePatterns.clear();
    for (const [mode, patterns] of Object.entries(modes)) {
      if (Array.isArray(patterns)) {
        // Legacy format: string[] treated as includes only
        this.modePatterns.set(mode, { includes: patterns, excludes: [] });
      } else if (hasIncludesProperty(patterns)) {
        // ModeDefinition-like or ModePatterns format
        this.modePatterns.set(mode, {
          includes: patterns.includes,
          excludes: patterns.excludes ?? [],
        });
      }
    }
  }

  /**
   * Register a tool
   *
   * Logs a warning if a tool with the same name is already registered.
   */
  register(tool: AgencyTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(
        `Tool "${tool.name}" is already registered. Overwriting with new definition.`
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool by name
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a tool by name
   */
  get(name: string): AgencyTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get a tool by name, throwing if not found
   */
  getOrThrow(name: string): AgencyTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new AgencyError(
        ErrorCodes.TOOL_NOT_FOUND,
        `Tool not found: ${name}`,
        { toolName: name }
      );
    }
    return tool;
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): AgencyTool[] {
    return [...this.tools.values()];
  }

  /**
   * Get tools filtered by mode
   *
   * Tools match if:
   * 1. Tool has explicit modes array and includes this mode, OR
   * 2. Tool name matches include patterns and does NOT match exclude patterns
   *
   * Important: Excludes ALWAYS win over includes.
   */
  getToolsForMode(mode: string): AgencyTool[] {
    const modePattern = this.modePatterns.get(mode);

    // If mode not found, return empty list
    if (!modePattern) {
      return [];
    }

    return [...this.tools.values()].filter((tool) => {
      // Check explicit mode list first
      if (tool.modes && tool.modes.length > 0) {
        return tool.modes.includes(mode);
      }

      // Use matchesTool for pattern matching (handles includes and excludes)
      return matchesTool(tool.name, modePattern.includes, modePattern.excludes);
    });
  }

  /**
   * Get tools for mode in MCP format
   */
  getMcpToolsForMode(mode: string): McpTool[] {
    return this.getToolsForMode(mode).map(toMcpTool);
  }

  /**
   * Get the number of registered tools
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Validate a tool name against the naming convention
   *
   * @param name - The tool name to validate
   * @param options - Validation options (strict mode rejects custom prefixes)
   * @returns ValidationResult with valid flag, errors, and warnings
   */
  validateName(name: string, options?: ValidationOptions): ValidationResult {
    return validateToolName(name, options);
  }

  /**
   * Get all tools with a specific prefix
   *
   * @param prefix - The prefix to filter by (e.g., "source_control")
   * @returns Array of tools matching the prefix
   */
  getByPrefix(prefix: string): AgencyTool[] {
    return [...this.tools.values()].filter((tool) => {
      const dotIndex = tool.name.indexOf('.');
      if (dotIndex === -1) return false;
      return tool.name.substring(0, dotIndex) === prefix;
    });
  }

  /**
   * Generate a catalog of all registered tools grouped by prefix
   *
   * @returns ToolCatalog with all tools and prefix groupings
   */
  getCatalog(): ToolCatalog {
    const tools = this.getAll();
    const byPrefix: Record<string, AgencyTool[]> = {};

    for (const tool of tools) {
      const dotIndex = tool.name.indexOf('.');
      const prefix = dotIndex === -1 ? '' : tool.name.substring(0, dotIndex);

      if (!byPrefix[prefix]) {
        byPrefix[prefix] = [];
      }
      byPrefix[prefix].push(tool);
    }

    return {
      tools,
      byPrefix,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }
}
