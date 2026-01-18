/**
 * @generacy-ai/agency-plugin-humancy
 *
 * Humancy integration plugin for Agency - enables agents to request human input
 * via the Humancy VS Code extension.
 *
 * Tools provided:
 * - humancy.ask_question: Ask human a freeform question
 * - humancy.request_review: Request human review of an artifact
 * - humancy.request_decision: Present structured options for selection
 * - humancy.notify: Send a non-blocking notification
 */

// Plugin
export { HumancyPlugin, createHumancyPlugin } from './plugin.js';
export { manifest } from './manifest.js';

// Types
export * from './types/index.js';

// Connection
export { ConnectionMode, type ConnectionState, ConnectionModeDetector } from './connection/index.js';

// Tools (for advanced usage)
export {
  createAskQuestionTool,
  createRequestReviewTool,
  createRequestDecisionTool,
  createNotifyTool,
} from './tools/index.js';

// Default export is the plugin factory
export { createHumancyPlugin as default } from './plugin.js';
