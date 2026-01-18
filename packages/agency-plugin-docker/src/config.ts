/**
 * Docker plugin configuration schema
 */

import { z } from 'zod';

/**
 * Docker plugin configuration from agency.config.json
 */
export const DockerPluginConfigSchema = z.object({
  /** Path to compose file (default: 'docker-compose.yml') */
  composeFile: z.string().default('docker-compose.yml'),

  /** Docker Compose project name (default: directory name) */
  projectName: z.string().nullable().optional(),

  /** Default stop timeout in seconds (default: 10) */
  defaultTimeout: z.number().int().positive().default(10),
});

export type DockerPluginConfig = z.infer<typeof DockerPluginConfigSchema>;

/**
 * Default plugin configuration
 */
export const DEFAULT_DOCKER_CONFIG: DockerPluginConfig = {
  composeFile: 'docker-compose.yml',
  projectName: null,
  defaultTimeout: 10,
};
