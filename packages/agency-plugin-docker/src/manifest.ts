/**
 * Docker plugin manifest
 */

import type { PluginManifest } from '@generacy-ai/agency';

/**
 * Docker plugin tool names
 */
export const DOCKER_TOOLS = [
  'run.docker_compose_up',
  'run.docker_compose_down',
  'run.docker_compose_logs',
  'run.docker_compose_ps',
  'run.docker_build',
  'run.docker_run',
  'run.docker_stop',
  'run.docker_exec',
] as const;

/**
 * Mode affiliations for Docker tools
 */
export const MODE_AFFILIATIONS = {
  debug: [...DOCKER_TOOLS],
  coding: [
    'run.docker_compose_up',
    'run.docker_compose_down',
    'run.docker_compose_logs',
  ],
} as const;

/**
 * Docker plugin manifest definition
 */
export const dockerPluginManifest: PluginManifest = {
  id: '@generacy-ai/agency-plugin-docker',
  name: 'Docker Plugin',
  version: '0.0.0',
  description: 'Docker and Docker Compose operations for container management',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  dependencies: [],
  tools: [...DOCKER_TOOLS],
  modes: ['debug', 'coding'],
  critical: false,
  provides: [{ facet: 'ContainerRuntime', qualifier: 'docker', priority: 10 }],
  requires: [],
  uses: [],
};
