/**
 * Plugin manifest definition for npm plugin
 */

import type { PluginManifest } from '@generacy-ai/agency';

/** npm plugin manifest */
export const manifest: PluginManifest = {
  id: '@generacy-ai/agency-plugin-npm',
  name: 'NPM Plugin',
  version: '0.0.0',
  description: 'NPM operations plugin for Agency - provides MCP tools for npm-ecosystem operations',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  dependencies: [],
  peerDependencies: {
    '@generacy-ai/agency': 'workspace:*',
  },
  tools: [
    'build.install_dependencies',
    'build.compile',
    'build.lint',
    'build.format',
    'build.validate',
    'test.run_unit',
    'test.run_integration',
    'test.run_e2e',
    'test.run_coverage',
  ],
  modes: ['coding', 'review'],
  channels: [],
  critical: false,
  provides: [],
  requires: [],
  uses: [],
};

/** Mode affiliations for tools */
export const modeAffiliations: Record<string, string[]> = {
  coding: [
    'build.install_dependencies',
    'build.compile',
    'build.lint',
    'build.format',
    'build.validate',
    'test.run_unit',
    'test.run_integration',
    'test.run_e2e',
    'test.run_coverage',
  ],
  review: ['build.lint', 'build.validate', 'build.format'],
};
