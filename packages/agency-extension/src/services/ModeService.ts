import type * as vscode from 'vscode';
import type {
  ModeConfig,
  ModeInfo,
  ModeTreeNode,
  ModeSwitchResult,
  ModeSwitchRequest,
  ModeStateEvent,
  ModeValidationResult,
  ModeValidationError,
  ModeValidationWarning,
} from '../types/mode';
import { createScopedLogger, DisposableManager } from '../utils';
import { ConfigService } from './ConfigService';

const log = createScopedLogger('ModeService');

/**
 * Simple event emitter for VS Code-style events.
 */
class EventEmitter<T> {
  private _listeners: Set<(value: T) => void> = new Set();

  get event(): (listener: (value: T) => void) => vscode.Disposable {
    return (listener: (value: T) => void): vscode.Disposable => {
      this._listeners.add(listener);
      return {
        dispose: () => {
          this._listeners.delete(listener);
        },
      };
    };
  }

  fire(value: T): void {
    for (const listener of this._listeners) {
      try {
        listener(value);
      } catch (error) {
        log.error('Error in mode change listener', error);
      }
    }
  }

  dispose(): void {
    this._listeners.clear();
  }
}

/**
 * ModeService manages modes in the Agency VS Code extension.
 *
 * Modes control which MCP tools are available to agents. This service:
 * - Loads and resolves mode configurations
 * - Handles mode inheritance (parent/child relationships)
 * - Manages the current active mode
 * - Validates mode configurations
 * - Builds mode trees for UI visualization
 * - Emits events when modes change
 *
 * @example
 * ```typescript
 * // Get the singleton instance
 * const modeService = ModeService.getInstance();
 *
 * // Get all modes
 * const modes = modeService.getModes();
 *
 * // Switch mode
 * const result = await modeService.setCurrentMode('debug');
 * console.log(`Added tools: ${result.addedTools.join(', ')}`);
 * ```
 */
export class ModeService {
  private static instance: ModeService | undefined;
  private configService: ConfigService;
  private modeChangeEmitter = new EventEmitter<ModeStateEvent>();
  private disposables = new DisposableManager();

  /**
   * Private constructor for singleton pattern.
   */
  private constructor() {
    this.configService = ConfigService.getInstance();
    this.disposables.add(this.modeChangeEmitter);
  }

  /**
   * Get the singleton instance of ModeService.
   */
  public static getInstance(): ModeService {
    if (!ModeService.instance) {
      ModeService.instance = new ModeService();
    }
    return ModeService.instance;
  }

  /**
   * Event fired when the active mode changes.
   */
  public get onModeChange(): (listener: (event: ModeStateEvent) => void) => vscode.Disposable {
    return this.modeChangeEmitter.event;
  }

  /**
   * Resolve mode inheritance to compute effective tools.
   *
   * @param mode - The mode configuration to resolve
   * @param allModes - All available mode configurations
   * @param visited - Set of visited mode IDs (for circular dependency detection)
   * @returns Array of effective tool names after inheritance resolution
   * @throws Error if circular inheritance detected or parent mode not found
   */
  private resolveInheritance(
    mode: ModeConfig,
    allModes: ModeConfig[],
    visited: Set<string> = new Set()
  ): string[] {
    // Detect circular inheritance
    if (visited.has(mode.id)) {
      const chain = Array.from(visited).join(' → ');
      throw new Error(`Circular inheritance detected: ${chain} → ${mode.id}`);
    }

    visited.add(mode.id);

    // Base case: root mode (no parent)
    if (!mode.parentId) {
      return Array.from(new Set(mode.includedTools));
    }

    // Find parent mode
    const parent = allModes.find(m => m.id === mode.parentId);
    if (!parent) {
      throw new Error(`Missing parent mode: ${mode.parentId} (referenced by ${mode.id})`);
    }

    // Recursively resolve parent
    const parentTools = this.resolveInheritance(parent, allModes, new Set(visited));

    // Apply inheritance: start with parent tools
    const effectiveTools = new Set(parentTools);

    // Add included tools
    for (const tool of mode.includedTools) {
      effectiveTools.add(tool);
    }

    // Remove excluded tools
    for (const tool of mode.excludedTools) {
      effectiveTools.delete(tool);
    }

    return Array.from(effectiveTools);
  }

  /**
   * Get all available modes with inheritance resolved.
   *
   * @returns Array of ModeInfo objects with effectiveTools computed
   */
  public getModes(): ModeInfo[] {
    const config = this.configService.getConfig();
    if (!config) {
      return [];
    }
    const modeConfigs = config.modes || [];
    const currentModeId = config.currentModeId;

    // Build ModeInfo array with resolved inheritance
    const modeInfos: ModeInfo[] = [];
    const modeMap = new Map<string, ModeInfo>();

    for (const modeConfig of modeConfigs) {
      try {
        const effectiveTools = this.resolveInheritance(modeConfig, modeConfigs);

        const modeInfo: ModeInfo = {
          config: modeConfig,
          effectiveTools,
          parent: undefined, // Will be set in second pass
          children: [],
          depth: 0, // Will be computed in second pass
          isActive: modeConfig.id === currentModeId,
        };

        modeInfos.push(modeInfo);
        modeMap.set(modeConfig.id, modeInfo);
      } catch (error) {
        log.error(`Failed to resolve inheritance for mode ${modeConfig.id}`, error);
        // Skip this mode if inheritance resolution fails
      }
    }

    // Second pass: build parent/child relationships and compute depth
    for (const modeInfo of modeInfos) {
      if (modeInfo.config.parentId) {
        const parent = modeMap.get(modeInfo.config.parentId);
        if (parent) {
          modeInfo.parent = parent;
          parent.children.push(modeInfo);
          modeInfo.depth = parent.depth + 1;
        }
      }
    }

    return modeInfos;
  }

  /**
   * Get a specific mode by ID.
   *
   * @param id - The mode ID to retrieve
   * @returns The ModeInfo object, or undefined if not found
   */
  public getMode(id: string): ModeInfo | undefined {
    return this.getModes().find(m => m.config.id === id);
  }

  /**
   * Get the currently active mode.
   *
   * @returns The active ModeInfo object
   * @throws Error if no mode is active and no default mode exists
   */
  public getCurrentMode(): ModeInfo {
    const modes = this.getModes();

    // First, try to find the active mode
    const activeMode = modes.find(m => m.isActive);
    if (activeMode) {
      return activeMode;
    }

    // Fallback: find default mode
    const defaultMode = modes.find(m => m.config.isDefault);
    if (defaultMode) {
      return defaultMode;
    }

    // Last resort: return first mode
    if (modes.length > 0) {
      return modes[0]!;
    }

    throw new Error('No modes configured');
  }

  /**
   * Set the current active mode.
   *
   * @param modeId - The ID of the mode to activate
   * @returns Result of the mode switch operation
   */
  public async setCurrentMode(modeId: string): Promise<ModeSwitchResult> {
    try {
      // Validate that target mode exists
      const targetMode = this.getMode(modeId);
      if (!targetMode) {
        return {
          success: false,
          previousModeId: this.getCurrentMode().config.id,
          newModeId: modeId,
          addedTools: [],
          removedTools: [],
          error: `Mode not found: ${modeId}`,
          timestamp: Date.now(),
        };
      }

      // Get previous mode
      const previousMode = this.getCurrentMode();
      const previousModeId = previousMode.config.id;

      // Compute tool diff
      const previousTools = new Set(previousMode.effectiveTools);
      const newTools = new Set(targetMode.effectiveTools);

      const addedTools = Array.from(newTools).filter(tool => !previousTools.has(tool));
      const removedTools = Array.from(previousTools).filter(tool => !newTools.has(tool));

      // Save to ConfigService
      await this.configService.setCurrentModeId(modeId);

      // Emit event
      const event: ModeStateEvent = {
        type: 'activated',
        modeId,
        modeInfo: targetMode,
        timestamp: Date.now(),
      };
      this.modeChangeEmitter.fire(event);

      log.info(`Mode switched: ${previousModeId} → ${modeId}`);

      return {
        success: true,
        previousModeId,
        newModeId: modeId,
        addedTools,
        removedTools,
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to switch mode to ${modeId}`, error);

      return {
        success: false,
        previousModeId: this.getCurrentMode().config.id,
        newModeId: modeId,
        addedTools: [],
        removedTools: [],
        error: errorMessage,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Build a hierarchical tree of modes for visualization.
   *
   * @returns Array of root ModeTreeNode objects with children
   */
  public buildModeTree(): ModeTreeNode[] {
    const modes = this.getModes();
    const modeMap = new Map<string, ModeInfo>();

    // Build mode map
    for (const mode of modes) {
      modeMap.set(mode.config.id, mode);
    }

    // Find root modes (no parent)
    const rootModes = modes.filter(m => !m.config.parentId);

    // Recursively build tree
    const buildNode = (mode: ModeInfo): ModeTreeNode => {
      const children = modes.filter(m => m.config.parentId === mode.config.id);

      const inheritedToolCount = mode.parent ? mode.parent.effectiveTools.length : 0;
      const addedToolCount = mode.config.includedTools.length;
      const excludedToolCount = mode.config.excludedTools.length;

      return {
        id: mode.config.id,
        name: mode.config.name,
        description: mode.config.description,
        toolCount: mode.effectiveTools.length,
        inheritedToolCount,
        addedToolCount,
        excludedToolCount,
        isActive: mode.isActive,
        children: children.map(c => buildNode(c)),
        parentId: mode.config.parentId,
      };
    };

    return rootModes.map(root => buildNode(root));
  }

  /**
   * Validate all mode configurations.
   *
   * Checks for:
   * - Duplicate mode IDs
   * - Missing parent modes
   * - Circular inheritance
   *
   * @returns Validation result with errors and warnings
   */
  public validate(): ModeValidationResult {
    const config = this.configService.getConfig();
    if (!config) {
      return {
        valid: false,
        errors: [{
          modeId: '',
          code: 'missing_parent',
          message: 'No configuration loaded',
        }],
        warnings: [],
      };
    }
    const modeConfigs = config.modes || [];

    const errors: ModeValidationError[] = [];
    const warnings: ModeValidationWarning[] = [];

    // Check for duplicate IDs
    const idSet = new Set<string>();
    for (const mode of modeConfigs) {
      if (idSet.has(mode.id)) {
        errors.push({
          modeId: mode.id,
          code: 'duplicate_id',
          message: `Duplicate mode ID: ${mode.id}`,
        });
      }
      idSet.add(mode.id);
    }

    // Check for missing parents
    for (const mode of modeConfigs) {
      if (mode.parentId) {
        const parentExists = modeConfigs.some(m => m.id === mode.parentId);
        if (!parentExists) {
          errors.push({
            modeId: mode.id,
            code: 'missing_parent',
            message: `Mode ${mode.id} references non-existent parent: ${mode.parentId}`,
          });
        }
      }
    }

    // Check for circular inheritance
    for (const mode of modeConfigs) {
      try {
        this.resolveInheritance(mode, modeConfigs);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Circular inheritance')) {
          errors.push({
            modeId: mode.id,
            code: 'circular_inheritance',
            message: error.message,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Dispose of resources used by the service.
   */
  public dispose(): void {
    this.disposables.dispose();
  }
}
