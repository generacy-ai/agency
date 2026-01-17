/**
 * Tool Registry for Agency
 *
 * Manages tool registration and provides mode-based filtering
 * using minimatch glob patterns.
 */

import { minimatch } from 'minimatch';
import { AgencyError, ErrorCodes } from '../errors/index.js';
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
 * Tool registry for managing and filtering tools
 */
export class ToolRegistry {
  private readonly tools = new Map<string, AgencyTool>();
  private readonly modePatterns = new Map<string, string[]>();

  /**
   * Set the mode patterns for filtering
   */
  setModePatterns(modes: Record<string, string[]>): void {
    this.modePatterns.clear();
    for (const [mode, patterns] of Object.entries(modes)) {
      this.modePatterns.set(mode, patterns);
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
   * 2. Tool name matches any pattern in the mode's pattern list
   */
  getToolsForMode(mode: string): AgencyTool[] {
    const patterns = this.modePatterns.get(mode);

    // If mode not found, return empty list
    if (!patterns) {
      return [];
    }

    return [...this.tools.values()].filter((tool) => {
      // Check explicit mode list first
      if (tool.modes && tool.modes.length > 0) {
        return tool.modes.includes(mode);
      }

      // Fall back to pattern matching
      return patterns.some((pattern) => this.matchPattern(tool.name, pattern));
    });
  }

  /**
   * Get tools for mode in MCP format
   */
  getMcpToolsForMode(mode: string): McpTool[] {
    return this.getToolsForMode(mode).map(toMcpTool);
  }

  /**
   * Match a tool name against a glob pattern
   *
   * Special handling for namespace patterns:
   * - "namespace.*" matches "namespace.action"
   * - "*" matches everything
   */
  private matchPattern(toolName: string, pattern: string): boolean {
    // Use minimatch for glob matching
    return minimatch(toolName, pattern);
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
