/**
 * HumancyPlugin - Main plugin class
 *
 * Implements the AgencyPlugin interface with lifecycle hooks.
 */

import type { AgencyPlugin, AgencyCoreAPI, PluginManifest } from '@generacy-ai/agency';
import { manifest } from './manifest.js';
import { ConnectionModeDetector } from './connection/index.js';
import {
  createAskQuestionTool,
  createRequestReviewTool,
  createRequestDecisionTool,
  createNotifyTool,
} from './tools/index.js';

/**
 * Humancy Plugin for human-agent interaction
 *
 * Provides tools for agents to request human input:
 * - humancy.ask_question: Freeform questions
 * - humancy.request_review: Artifact review
 * - humancy.request_decision: Structured options
 * - humancy.notify: Fire-and-forget notifications
 */
export class HumancyPlugin implements AgencyPlugin {
  readonly manifest: PluginManifest = manifest;

  private coreAPI?: AgencyCoreAPI;
  private detector: ConnectionModeDetector;
  private cleanups: Array<() => void> = [];

  constructor() {
    this.detector = new ConnectionModeDetector();
  }

  /**
   * Initialize the plugin with core API access
   */
  async initialize(core: AgencyCoreAPI): Promise<void> {
    this.coreAPI = core;

    // Initialize connection detector
    this.detector.initialize(core);

    // Detect connection mode
    await this.detector.detect();

    // Register all tools
    const tools = [
      createAskQuestionTool(core, this.detector),
      createRequestReviewTool(core, this.detector),
      createRequestDecisionTool(core, this.detector),
      createNotifyTool(core, this.detector),
    ];

    for (const tool of tools) {
      core.registerTool(tool);
    }

    // Subscribe to mode changes
    const unsubMode = core.onModeChange((mode: string) => {
      this.onModeChange?.(mode);
    });
    this.cleanups.push(unsubMode);
  }

  /**
   * Clean shutdown of the plugin
   */
  async shutdown(): Promise<void> {
    // Run all cleanup functions
    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch {
        // Ignore cleanup errors during shutdown
      }
    }
    this.cleanups = [];

    // Unregister tools
    if (this.coreAPI) {
      for (const toolName of this.manifest.tools ?? []) {
        try {
          this.coreAPI.unregisterTool(toolName);
        } catch {
          // Ignore unregister errors during shutdown
        }
      }
    }

    this.coreAPI = undefined;
  }

  /**
   * Handle mode changes
   */
  onModeChange?(mode: string): void {
    // All modes include humancy tools, so no filtering needed
    // This hook is available for future mode-specific behavior
  }

  /**
   * Get the connection detector for testing/status
   */
  getDetector(): ConnectionModeDetector {
    return this.detector;
  }
}

/**
 * Create and export the plugin instance
 */
export function createHumancyPlugin(): HumancyPlugin {
  return new HumancyPlugin();
}
