/**
 * Plugin manifest for @generacy-ai/agency-plugin-spec-kit
 */

import type { PluginManifest } from '@generacy-ai/agency';

/**
 * Static plugin manifest
 *
 * Defines the plugin metadata and tool declarations for the SpecKit plugin.
 */
export const manifest: PluginManifest = {
  id: '@generacy-ai/agency-plugin-spec-kit',
  name: 'Spec Kit',
  version: '0.0.1',
  description: 'Specification-driven development toolkit with backlog provider abstraction',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  dependencies: [],
  tools: [
    'spec_kit.git_ops',
    'spec_kit.create_feature',
    'spec_kit.get_paths',
    'spec_kit.check_prereqs',
    'spec_kit.copy_template',
    'spec_kit.update_agent',
    'spec_kit.get_ticket',
    'spec_kit.create_ticket',
    'spec_kit.update_ticket',
    'spec_kit.tasks_to_issues',
    'spec_kit.manage_clarifications',
  ],
  modes: ['coding', 'research'],
  critical: false,
  // Facet declarations
  provides: [],
  requires: [],
  uses: [
    { facet: 'IssueTracker' },
    { facet: 'SourceControl' },
  ],
};

/**
 * Mode affiliations - defines which tools are available in each mode
 */
export const modeAffiliations: Record<string, string[]> = {
  coding: [
    'spec_kit.git_ops',
    'spec_kit.create_feature',
    'spec_kit.get_paths',
    'spec_kit.check_prereqs',
    'spec_kit.copy_template',
    'spec_kit.update_agent',
    'spec_kit.get_ticket',
    'spec_kit.create_ticket',
    'spec_kit.update_ticket',
    'spec_kit.tasks_to_issues',
    'spec_kit.manage_clarifications',
  ],
  research: [
    'spec_kit.get_ticket',
    'spec_kit.get_paths',
    'spec_kit.check_prereqs',
  ],
};

// Legacy export for backwards compatibility
export const PLUGIN_MANIFEST = manifest;
