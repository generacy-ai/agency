/**
 * Plugin manifest for Humancy plugin
 */

import type { PluginManifest } from '@generacy-ai/agency';

export const manifest: PluginManifest = {
  id: '@generacy-ai/agency-plugin-humancy',
  name: 'Humancy Plugin',
  version: '0.0.0',
  description: 'Enables agents to request human input via the Humancy VS Code extension',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  dependencies: [],
  tools: [
    'humancy.ask_question',
    'humancy.request_review',
    'humancy.request_decision',
    'humancy.notify',
  ],
  channels: ['agency.humancy'],
  critical: false,
};
