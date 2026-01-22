/**
 * Status types for the Agency extension.
 * Defines connection states and status bar state mappings.
 */

/**
 * Connection status discriminated union
 */
export type ConnectionStatus =
  | { state: 'connected'; connectedAt: Date }
  | { state: 'disconnected'; reason?: string }
  | { state: 'connecting'; startedAt: Date }
  | { state: 'error'; error: Error; occurredAt: Date };

/**
 * Status bar item state
 */
export interface StatusBarState {
  /**
   * Display text (may include codicons)
   */
  text: string;

  /**
   * Hover tooltip
   */
  tooltip: string;

  /**
   * Codicon name (without $() wrapper)
   */
  icon: string;

  /**
   * Theme color key
   */
  color?: string;

  /**
   * Command to run on click
   */
  command?: string;
}
