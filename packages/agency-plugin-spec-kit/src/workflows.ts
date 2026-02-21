/**
 * Bundled workflow management for the spec-kit plugin.
 *
 * Provides canonical workflow YAML files and a resolution helper that
 * checks for local overrides before falling back to bundled defaults.
 */

import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Names of bundled workflows */
export type BuiltinWorkflowName = 'speckit-feature' | 'speckit-bugfix';

/**
 * Map of bundled workflow names to their absolute file paths.
 *
 * Paths are resolved relative to the compiled module location.
 * The actual YAML files live in `../workflows/` relative to `dist/`.
 */
export const BUILTIN_WORKFLOWS: Record<BuiltinWorkflowName, string> = {
  'speckit-feature': resolve(__dirname, '../workflows/speckit-feature.yaml'),
  'speckit-bugfix': resolve(__dirname, '../workflows/speckit-bugfix.yaml'),
};

/**
 * Get the absolute path to a bundled workflow file.
 *
 * @param name - The workflow name
 * @returns The absolute path, or undefined if the name is not a known bundled workflow
 */
export function getBuiltinWorkflowPath(name: string): string | undefined {
  return BUILTIN_WORKFLOWS[name as BuiltinWorkflowName];
}

/**
 * Resolve a workflow by name, checking for a local override first.
 *
 * Resolution order:
 * 1. `<repoRoot>/.generacy/<name>.yaml` (local override)
 * 2. Bundled workflow from this package (fallback)
 *
 * @param name - Workflow name (e.g. 'speckit-feature')
 * @param repoRoot - Absolute path to the repository root
 * @returns The absolute path to the resolved workflow, or undefined if not found
 */
export function resolveWorkflow(name: string, repoRoot: string): string | undefined {
  // Check for local override
  const localPath = join(repoRoot, '.generacy', `${name}.yaml`);
  if (existsSync(localPath)) {
    return localPath;
  }

  // Fall back to bundled workflow
  return getBuiltinWorkflowPath(name);
}
