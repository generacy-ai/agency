/**
 * Tool exports and factory for @generacy-ai/agency-plugin-git
 */

import type { AgencyTool, AgencyCoreAPI } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';

// Tool creators
import { createStatusTool } from './status.js';
import { createDiffTool } from './diff.js';
import { createLogTool } from './log.js';
import { createBlameTool } from './blame.js';
import { createCommitTool } from './commit.js';
import { createPushTool } from './push.js';
import { createPullTool } from './pull.js';
import { createCheckoutTool } from './checkout.js';
import { createBranchTool } from './branch.js';
import { createStashTool } from './stash.js';
import { createMergeTool } from './merge.js';
import { createRebaseTool } from './rebase.js';

// Re-export individual creators
export { createStatusTool } from './status.js';
export { createDiffTool } from './diff.js';
export { createLogTool } from './log.js';
export { createBlameTool } from './blame.js';
export { createCommitTool } from './commit.js';
export { createPushTool } from './push.js';
export { createPullTool } from './pull.js';
export { createCheckoutTool } from './checkout.js';
export { createBranchTool } from './branch.js';
export { createStashTool } from './stash.js';
export { createMergeTool } from './merge.js';
export { createRebaseTool } from './rebase.js';

/**
 * Create all git tools
 *
 * @param config - Plugin configuration
 * @param core - Agency core API (needed for push escalation)
 * @returns Array of all 12 git tools
 */
export function createTools(
  config: GitPluginConfig,
  core: AgencyCoreAPI
): AgencyTool[] {
  return [
    // Read-only tools (research, coding, review modes)
    createStatusTool(config),
    createDiffTool(config),
    createLogTool(config),
    createBlameTool(config),

    // Write tools (coding mode only)
    createCommitTool(config),
    createPushTool(config, core),
    createPullTool(config),
    createCheckoutTool(config),
    createBranchTool(config),
    createStashTool(config),
    createMergeTool(config),
    createRebaseTool(config),
  ];
}
