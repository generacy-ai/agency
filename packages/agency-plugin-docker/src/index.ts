/**
 * @generacy-ai/agency-plugin-docker - Docker operations plugin
 *
 * Provides 8 Docker/Docker Compose tools following the Agency plugin architecture
 * and terse output pattern.
 */

import type { AgencyPlugin, AgencyCoreAPI } from '@generacy-ai/agency';
import { dockerPluginManifest } from './manifest.js';
import { dockerTools } from './tools/index.js';

// Re-export config
export { DockerPluginConfigSchema, DEFAULT_DOCKER_CONFIG } from './config.js';
export type { DockerPluginConfig } from './config.js';

// Re-export manifest
export { dockerPluginManifest, DOCKER_TOOLS, MODE_AFFILIATIONS } from './manifest.js';

// Re-export all tools and schemas
export * from './tools/index.js';

// Re-export utilities
export { execDocker, execDockerCompose } from './utils/exec.js';
export type { DockerExecResult, DockerExecOptions } from './utils/exec.js';
export { classifyDockerError, formatDockerError } from './utils/error-classifier.js';
export type { DockerErrorCategory, ClassifiedDockerError } from './utils/error-classifier.js';

/**
 * Docker plugin implementation
 */
export const dockerPlugin: AgencyPlugin = {
  manifest: dockerPluginManifest,

  async initialize(core: AgencyCoreAPI): Promise<void> {
    // Register all Docker tools
    for (const tool of dockerTools) {
      core.registerTool(tool);
    }
  },

  async shutdown(): Promise<void> {
    // No cleanup needed - stateless design
  },
};

export default dockerPlugin;
