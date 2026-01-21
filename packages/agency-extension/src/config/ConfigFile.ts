import type * as vscode from 'vscode';
import { AgencyConfigSchema, type AgencyConfig, getValidationErrors } from './ConfigSchema';
import { createDefaultConfig, DEFAULT_CONFIG_DIR } from './defaults';
import { createScopedLogger, DisposableManager } from '../utils';
import { debounce } from '../utils/debounce';

const log = createScopedLogger('ConfigFile');

/**
 * Debounce delay for file watcher callbacks (in milliseconds).
 * Prevents rapid-fire updates when files are saved multiple times.
 */
const WATCHER_DEBOUNCE_MS = 300;

/**
 * Read and parse the Agency configuration file.
 *
 * @param vscodeModule The VS Code module (for workspace API access)
 * @param configPath Path to the configuration file (relative to workspace)
 * @returns Parsed AgencyConfig, or null if file doesn't exist or is invalid
 */
export async function readConfig(
  vscodeModule: typeof vscode,
  configPath: string
): Promise<AgencyConfig | null> {
  const workspaceFolders = vscodeModule.workspace.workspaceFolders;
  const workspaceFolder = workspaceFolders?.[0];
  if (!workspaceFolder) {
    log.debug('No workspace folder open');
    return null;
  }

  const configUri = vscodeModule.Uri.joinPath(workspaceFolder.uri, configPath);

  try {
    const fileData = await vscodeModule.workspace.fs.readFile(configUri);
    const content = new TextDecoder().decode(fileData);
    const parsed = JSON.parse(content);

    const result = AgencyConfigSchema.safeParse(parsed);
    if (!result.success) {
      const errors = getValidationErrors(parsed);
      log.warn(`Configuration validation failed: ${errors.join(', ')}`);
      return null;
    }

    log.debug(`Configuration loaded from ${configPath}`);
    return result.data;
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      log.debug(`Configuration file not found: ${configPath}`);
      return null;
    }
    if (error instanceof SyntaxError) {
      log.warn(`Invalid JSON in configuration file: ${configPath}`);
      return null;
    }
    // Check for VS Code FileSystemError (file not found)
    if (error && typeof error === 'object' && 'code' in error) {
      const fsError = error as { code: string };
      if (fsError.code === 'FileNotFound') {
        log.debug(`Configuration file not found: ${configPath}`);
        return null;
      }
    }
    log.error(`Error reading configuration: ${configPath}`, error);
    return null;
  }
}

/**
 * Write the Agency configuration to file.
 * Creates the config directory if it doesn't exist.
 *
 * @param vscodeModule The VS Code module (for workspace API access)
 * @param configPath Path to the configuration file (relative to workspace)
 * @param config The configuration to write
 * @throws Error if writing fails
 */
export async function writeConfig(
  vscodeModule: typeof vscode,
  configPath: string,
  config: AgencyConfig
): Promise<void> {
  const workspaceFolders = vscodeModule.workspace.workspaceFolders;
  const workspaceFolder = workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('No workspace folder open');
  }

  const workspaceUri = workspaceFolder.uri;
  const configUri = vscodeModule.Uri.joinPath(workspaceUri, configPath);

  // Ensure the config directory exists
  const configDir = vscodeModule.Uri.joinPath(workspaceUri, DEFAULT_CONFIG_DIR);
  try {
    await vscodeModule.workspace.fs.createDirectory(configDir);
  } catch {
    // Directory might already exist, which is fine
  }

  // Validate config before writing
  const result = AgencyConfigSchema.safeParse(config);
  if (!result.success) {
    const errors = getValidationErrors(config);
    throw new Error(`Invalid configuration: ${errors.join(', ')}`);
  }

  const content = JSON.stringify(result.data, null, 2);
  const encoded = new TextEncoder().encode(content);

  await vscodeModule.workspace.fs.writeFile(configUri, encoded);
  log.debug(`Configuration written to ${configPath}`);
}

/**
 * Check if the configuration file exists.
 *
 * @param vscodeModule The VS Code module (for workspace API access)
 * @param configPath Path to the configuration file (relative to workspace)
 * @returns true if the file exists, false otherwise
 */
export async function configExists(
  vscodeModule: typeof vscode,
  configPath: string
): Promise<boolean> {
  const workspaceFolders = vscodeModule.workspace.workspaceFolders;
  const workspaceFolder = workspaceFolders?.[0];
  if (!workspaceFolder) {
    return false;
  }

  const configUri = vscodeModule.Uri.joinPath(workspaceFolder.uri, configPath);

  try {
    await vscodeModule.workspace.fs.stat(configUri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize a new configuration file with defaults.
 * Does nothing if the file already exists.
 *
 * @param vscodeModule The VS Code module (for workspace API access)
 * @param configPath Path to the configuration file (relative to workspace)
 * @returns The configuration (existing or newly created)
 */
export async function initializeConfig(
  vscodeModule: typeof vscode,
  configPath: string
): Promise<AgencyConfig> {
  const existing = await readConfig(vscodeModule, configPath);
  if (existing) {
    return existing;
  }

  const defaultConfig = createDefaultConfig();
  await writeConfig(vscodeModule, configPath, defaultConfig);
  return defaultConfig;
}

/**
 * Watch the configuration file for external changes.
 * Calls the callback with the new configuration when the file changes.
 *
 * @param vscodeModule The VS Code module (for workspace API access)
 * @param configPath Path to the configuration file (relative to workspace)
 * @param callback Function called when the configuration changes
 * @returns A Disposable that stops watching when disposed
 */
export function watchConfig(
  vscodeModule: typeof vscode,
  configPath: string,
  callback: (config: AgencyConfig | null) => void
): vscode.Disposable {
  const workspaceFolders = vscodeModule.workspace.workspaceFolders;
  const workspaceFolder = workspaceFolders?.[0];
  if (!workspaceFolder) {
    log.debug('No workspace folder open, cannot watch config');
    return { dispose: () => {} };
  }

  const disposables = new DisposableManager();

  // Create a debounced handler to prevent rapid-fire updates
  const debouncedHandler = debounce(async () => {
    try {
      const config = await readConfig(vscodeModule, configPath);
      callback(config);
    } catch (error) {
      log.error('Error reading config on change', error);
      callback(null);
    }
  }, WATCHER_DEBOUNCE_MS);

  // Create the file system watcher
  const pattern = new vscodeModule.RelativePattern(workspaceFolder, configPath);
  const watcher = vscodeModule.workspace.createFileSystemWatcher(pattern);

  // Handle file changes
  disposables.add(
    watcher.onDidChange(() => {
      log.debug('Configuration file changed');
      debouncedHandler();
    })
  );

  // Handle file creation
  disposables.add(
    watcher.onDidCreate(() => {
      log.debug('Configuration file created');
      debouncedHandler();
    })
  );

  // Handle file deletion
  disposables.add(
    watcher.onDidDelete(() => {
      log.debug('Configuration file deleted');
      debouncedHandler.cancel();
      callback(null);
    })
  );

  // Add watcher itself to disposables
  disposables.add(watcher);

  // Clean up debounce timer on dispose
  disposables.add({ dispose: () => debouncedHandler.cancel() });

  log.debug(`Watching configuration file: ${configPath}`);

  return disposables;
}
