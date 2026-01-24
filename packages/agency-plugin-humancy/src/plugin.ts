/**
 * HumancyPlugin - Main plugin class
 *
 * Implements the AgencyPlugin interface with lifecycle hooks.
 */

import type { AgencyPlugin, AgencyCoreAPI, PluginManifest } from '@generacy-ai/agency';
import { manifest } from './manifest.js';
import { ConnectionModeDetector, ConnectionMode } from './connection/index.js';
import { DecisionStore } from './storage/index.js';
import { HumancyHttpClient } from './http/index.js';
import {
  createAskQuestionTool,
  createRequestReviewTool,
  createRequestDecisionTool,
  createNotifyTool,
  createGetDecisionOutcomeTool,
  createReportDecisionResultTool,
} from './tools/index.js';

/**
 * Humancy Plugin for human-agent interaction
 *
 * Provides tools for agents to request human input:
 * - humancy.ask_question: Freeform questions
 * - humancy.request_review: Artifact review
 * - humancy.request_decision: Structured options (with three-layer support)
 * - humancy.notify: Fire-and-forget notifications
 * - humancy.get_decision_outcome: Retrieve decision records
 * - humancy.report_decision_result: Report decision outcomes
 */
export class HumancyPlugin implements AgencyPlugin {
  readonly manifest: PluginManifest = manifest;

  private coreAPI?: AgencyCoreAPI;
  private detector: ConnectionModeDetector;
  private decisionStore: DecisionStore;
  private httpClient?: HumancyHttpClient;
  private cleanups: Array<() => void> = [];

  constructor() {
    this.detector = new ConnectionModeDetector();
    this.decisionStore = new DecisionStore();
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

    // Initialize HTTP client if in cloud mode
    const mode = this.detector.getMode();
    if (mode === ConnectionMode.CLOUD) {
      this.httpClient = new HumancyHttpClient({
        baseUrl: this.detector.getApiUrl(),
        apiKey: this.detector.getApiKey(),
        timeout: this.detector.getTimeout(),
      });
    }

    // Register all tools
    const tools = [
      createAskQuestionTool(core, this.detector, this.httpClient),
      createRequestReviewTool(core, this.detector, this.httpClient),
      createRequestDecisionTool(core, this.detector, this.decisionStore, this.httpClient),
      createNotifyTool(core, this.detector, this.httpClient),
      // Three-layer decision model tools
      createGetDecisionOutcomeTool(this.decisionStore, this.detector, this.httpClient),
      createReportDecisionResultTool(this.decisionStore, this.detector, this.httpClient),
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

    // Shutdown the decision store (clears cleanup interval)
    this.decisionStore.shutdown();

    // Clear HTTP client reference
    this.httpClient = undefined;

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

  /**
   * Get the decision store for testing
   */
  getDecisionStore(): DecisionStore {
    return this.decisionStore;
  }

  /**
   * Get the HTTP client for testing (cloud mode only)
   */
  getHttpClient(): HumancyHttpClient | undefined {
    return this.httpClient;
  }
}

/**
 * Create and export the plugin instance
 */
export function createHumancyPlugin(): HumancyPlugin {
  return new HumancyPlugin();
}
