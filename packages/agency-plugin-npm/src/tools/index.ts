/**
 * Tool registration for npm plugin
 */

import type { AgencyTool } from '@generacy-ai/agency';
import type { NpmPluginConfig } from '../config.js';

import { createInstallDependenciesTool } from './build/install-dependencies.js';
import { createCompileTool } from './build/compile.js';
import { createLintTool } from './build/lint.js';
import { createFormatTool } from './build/format.js';
import { createValidateTool } from './build/validate.js';
import { createRunUnitTool } from './test/run-unit.js';
import { createRunIntegrationTool } from './test/run-integration.js';
import { createRunE2ETool } from './test/run-e2e.js';
import { createRunCoverageTool } from './test/run-coverage.js';

/**
 * Create all npm plugin tools with the given configuration
 */
export function createTools(config: NpmPluginConfig): AgencyTool[] {
  return [
    // Build tools
    createInstallDependenciesTool(config),
    createCompileTool(config),
    createLintTool(config),
    createFormatTool(config),
    createValidateTool(config),

    // Test tools
    createRunUnitTool(config),
    createRunIntegrationTool(config),
    createRunE2ETool(config),
    createRunCoverageTool(config),
  ];
}

// Re-export schemas for external use
export * from './schemas.js';
