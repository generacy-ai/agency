/**
 * Plugin manifest for @generacy-ai/agency-plugin-spec-kit
 */

import type { PluginManifest } from '@generacy-ai/agency';

/**
 * Static plugin manifest
 *
 * Tools array is empty for this skeleton - actual tools will be added
 * in subsequent features.
 */
export const PLUGIN_MANIFEST: PluginManifest = {
  id: '@generacy-ai/agency-plugin-spec-kit',
  name: 'Spec Kit Plugin',
  version: '0.0.0',
  description: 'Specification management tools for agents',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  dependencies: [],
  tools: [],
  modes: ['research', 'coding'],
  critical: false,
};
