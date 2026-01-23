import * as fs from 'fs/promises';
import * as path from 'path';
import { createScopedLogger } from './logger';

const logger = createScopedLogger('DevContainerDetector');

/**
 * Configuration parsed from devcontainer.json.
 */
export interface DevContainerConfig {
  /** Path to the devcontainer.json file */
  configPath: string;

  /** Container name from config (or derived) */
  name?: string;

  /** Docker image to use */
  image?: string;

  /** Dockerfile path (relative to .devcontainer) */
  dockerFile?: string;

  /** Docker Compose file path */
  dockerComposeFile?: string | string[];

  /** Service name in compose file */
  service?: string;

  /** Workspace folder inside container */
  workspaceFolder?: string;

  /** Raw config for additional properties */
  raw: Record<string, unknown>;
}

/**
 * Result of detecting devcontainer.json in workspace.
 */
export interface DevContainerDetectionResult {
  /** Whether a devcontainer.json was found */
  found: boolean;

  /** Parsed configuration if found */
  config?: DevContainerConfig;

  /** Path where config was found */
  path?: string;

  /** Error message if detection failed */
  error?: string;
}

/**
 * Priority-ordered search paths for devcontainer.json.
 */
const DEVCONTAINER_SEARCH_PATHS = [
  '.devcontainer/devcontainer.json',
  '.devcontainer.json',
] as const;

/**
 * Check if a file exists at the given path.
 *
 * @param filePath - The absolute path to check
 * @returns True if the file exists, false otherwise
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Find devcontainer.json files in subdirectories of .devcontainer/.
 *
 * @param devcontainerDir - The .devcontainer directory path
 * @returns Array of paths to devcontainer.json files in subdirectories
 */
async function findSubfolderConfigs(devcontainerDir: string): Promise<string[]> {
  const configs: string[] = [];

  try {
    const entries = await fs.readdir(devcontainerDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const configPath = path.join(devcontainerDir, entry.name, 'devcontainer.json');
        if (await fileExists(configPath)) {
          configs.push(configPath);
        }
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
    logger.debug('Failed to read .devcontainer directory for subfolder configs');
  }

  return configs;
}

/**
 * Parse a devcontainer.json file and extract configuration.
 *
 * @param configPath - The absolute path to the devcontainer.json file
 * @returns The parsed DevContainerConfig
 * @throws Error if the file cannot be read or parsed
 */
async function parseDevContainerConfig(configPath: string): Promise<DevContainerConfig> {
  const content = await fs.readFile(configPath, 'utf-8');

  // Remove comments (// and /* */) from JSON for parsing
  // devcontainer.json supports JSON with comments (jsonc)
  const jsonContent = content
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

  const raw = JSON.parse(jsonContent) as Record<string, unknown>;

  return {
    configPath,
    name: typeof raw['name'] === 'string' ? raw['name'] : undefined,
    image: typeof raw['image'] === 'string' ? raw['image'] : undefined,
    dockerFile: typeof raw['dockerFile'] === 'string' ? raw['dockerFile'] : undefined,
    dockerComposeFile: parseDockerComposeFile(raw['dockerComposeFile']),
    service: typeof raw['service'] === 'string' ? raw['service'] : undefined,
    workspaceFolder: typeof raw['workspaceFolder'] === 'string' ? raw['workspaceFolder'] : undefined,
    raw,
  };
}

/**
 * Parse the dockerComposeFile field which can be a string or array of strings.
 *
 * @param value - The raw value from the config
 * @returns The parsed dockerComposeFile value or undefined
 */
function parseDockerComposeFile(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value as string[];
  }
  return undefined;
}

/**
 * Detect devcontainer.json in a workspace.
 *
 * Searches for devcontainer.json in the following priority order:
 * 1. `.devcontainer/devcontainer.json`
 * 2. `.devcontainer.json` (root)
 * 3. `.devcontainer/<subfolder>/devcontainer.json`
 *
 * @param workspacePath - The absolute path to the workspace root
 * @returns The detection result with config if found
 */
export async function detectDevContainer(
  workspacePath: string
): Promise<DevContainerDetectionResult> {
  logger.debug(`Detecting devcontainer.json in workspace: ${workspacePath}`);

  // Check priority-ordered paths first
  for (const relativePath of DEVCONTAINER_SEARCH_PATHS) {
    const configPath = path.join(workspacePath, relativePath);

    if (await fileExists(configPath)) {
      logger.info(`Found devcontainer.json at: ${configPath}`);

      try {
        const config = await parseDevContainerConfig(configPath);
        return {
          found: true,
          config,
          path: configPath,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error parsing devcontainer.json';
        logger.error(`Failed to parse devcontainer.json at ${configPath}: ${errorMessage}`);
        return {
          found: false,
          path: configPath,
          error: `Failed to parse devcontainer.json: ${errorMessage}`,
        };
      }
    }
  }

  // Check for configs in .devcontainer subdirectories
  const devcontainerDir = path.join(workspacePath, '.devcontainer');
  const subfolderConfigs = await findSubfolderConfigs(devcontainerDir);

  if (subfolderConfigs.length > 0) {
    // Use the first subfolder config found (alphabetically sorted by directory name)
    const configPath = subfolderConfigs[0] as string;
    logger.info(`Found devcontainer.json in subfolder: ${configPath}`);

    try {
      const config = await parseDevContainerConfig(configPath);
      return {
        found: true,
        config,
        path: configPath,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error parsing devcontainer.json';
      logger.error(`Failed to parse devcontainer.json at ${configPath}: ${errorMessage}`);
      return {
        found: false,
        path: configPath,
        error: `Failed to parse devcontainer.json: ${errorMessage}`,
      };
    }
  }

  logger.debug('No devcontainer.json found in workspace');
  return {
    found: false,
    error: 'No devcontainer.json found in workspace',
  };
}
