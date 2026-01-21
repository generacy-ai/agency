/**
 * Mode-related type definitions for the Agency VS Code extension.
 * Modes control which tools are active and available.
 */

/**
 * Configuration for a mode.
 */
export interface ModeConfig {
  /** Unique mode identifier */
  id: string;

  /** Human-readable mode name */
  name: string;

  /** Mode description */
  description?: string;

  /** Parent mode ID for inheritance (null for root modes) */
  parentId?: string;

  /** Tools explicitly included in this mode */
  includedTools: string[];

  /** Tools explicitly excluded from this mode */
  excludedTools: string[];

  /** Whether this mode is the default/active mode */
  isDefault?: boolean;
}

/**
 * Runtime information about a mode.
 */
export interface ModeInfo {
  /** Mode configuration */
  config: ModeConfig;

  /** Effective tools after inheritance resolution */
  effectiveTools: string[];

  /** Parent mode info (if has parent) */
  parent?: ModeInfo;

  /** Child modes */
  children: ModeInfo[];

  /** Depth in the inheritance tree (0 = root) */
  depth: number;

  /** Whether this is the currently active mode */
  isActive: boolean;
}

/**
 * Node in the mode tree for visualization.
 */
export interface ModeTreeNode {
  /** Mode ID */
  id: string;

  /** Display name */
  name: string;

  /** Description */
  description?: string;

  /** Number of effective tools */
  toolCount: number;

  /** Number of inherited tools (from parent) */
  inheritedToolCount: number;

  /** Number of tools added in this mode */
  addedToolCount: number;

  /** Number of tools excluded in this mode */
  excludedToolCount: number;

  /** Whether this mode is active */
  isActive: boolean;

  /** Child mode nodes */
  children: ModeTreeNode[];

  /** Parent node (null for root) */
  parentId?: string;
}

/**
 * Mode switch request.
 */
export interface ModeSwitchRequest {
  /** Target mode ID */
  modeId: string;

  /** Whether to persist the change to config */
  persist: boolean;
}

/**
 * Result of a mode switch operation.
 */
export interface ModeSwitchResult {
  /** Whether the switch was successful */
  success: boolean;

  /** Previous mode ID */
  previousModeId: string;

  /** New mode ID */
  newModeId: string;

  /** Tools that became available */
  addedTools: string[];

  /** Tools that became unavailable */
  removedTools: string[];

  /** Error message if switch failed */
  error?: string;

  /** Timestamp of the switch */
  timestamp: number;
}

/**
 * Mode validation result.
 */
export interface ModeValidationResult {
  /** Whether the mode configuration is valid */
  valid: boolean;

  /** Validation errors */
  errors: ModeValidationError[];

  /** Validation warnings */
  warnings: ModeValidationWarning[];
}

/**
 * Mode validation error.
 */
export interface ModeValidationError {
  /** Mode ID with the error */
  modeId: string;

  /** Error code */
  code: 'circular_inheritance' | 'missing_parent' | 'duplicate_id' | 'invalid_tool';

  /** Error message */
  message: string;
}

/**
 * Mode validation warning.
 */
export interface ModeValidationWarning {
  /** Mode ID with the warning */
  modeId: string;

  /** Warning code */
  code: 'empty_mode' | 'redundant_exclusion' | 'shadowed_tool';

  /** Warning message */
  message: string;
}

/**
 * Mode state change event.
 */
export interface ModeStateEvent {
  /** Type of event */
  type: 'activated' | 'deactivated' | 'updated' | 'created' | 'deleted';

  /** Mode ID */
  modeId: string;

  /** Mode info after the change */
  modeInfo?: ModeInfo;

  /** Timestamp of the event */
  timestamp: number;
}
