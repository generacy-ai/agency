import type * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { ConfigService, McpClientService, ContainerService } from '../services';
import {
  configExists,
  readConfig,
  writeConfig,
  DEFAULT_CONFIG_PATH,
  DEFAULT_CONFIG_DIR,
  createDefaultConfig,
  getValidationErrors,
} from '../config';
import { createScopedLogger, getLogger } from '../utils';

const log = createScopedLogger('SetupCommands');

/**
 * Result of a single setup verification check.
 */
interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

/**
 * Initialize Agency in the current workspace.
 *
 * - If `.agency/agency.config.json` already exists, offers to open it.
 * - Otherwise creates the `.agency/` directory and writes a default config.
 *
 * @param vscodeModule The VS Code module
 */
export async function initAgency(vscodeModule: typeof vscode): Promise<void> {
  try {
    const workspaceFolder = vscodeModule.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscodeModule.window.showErrorMessage(
        'No workspace folder open. Open a folder first to initialize Agency.'
      );
      return;
    }

    const exists = await configExists(vscodeModule, DEFAULT_CONFIG_PATH);

    if (exists) {
      const action = await vscodeModule.window.showInformationMessage(
        'Agency configuration already exists.',
        'Open'
      );
      if (action === 'Open') {
        const configUri = vscodeModule.Uri.joinPath(workspaceFolder.uri, DEFAULT_CONFIG_PATH);
        await vscodeModule.window.showTextDocument(
          await vscodeModule.workspace.openTextDocument(configUri)
        );
      }
      return;
    }

    // Create .agency/ directory and write default config
    const configDirUri = vscodeModule.Uri.joinPath(workspaceFolder.uri, DEFAULT_CONFIG_DIR);
    try {
      await vscodeModule.workspace.fs.createDirectory(configDirUri);
    } catch {
      // Directory might already exist
    }

    const defaultConfig = createDefaultConfig();
    await writeConfig(vscodeModule, DEFAULT_CONFIG_PATH, defaultConfig);

    // Set context key so other commands know config is available
    await vscodeModule.commands.executeCommand(
      'setContext',
      'agency.configExists',
      true
    );

    const action = await vscodeModule.window.showInformationMessage(
      'Agency initialized!',
      'Open Config'
    );
    if (action === 'Open Config') {
      const configUri = vscodeModule.Uri.joinPath(workspaceFolder.uri, DEFAULT_CONFIG_PATH);
      await vscodeModule.window.showTextDocument(
        await vscodeModule.workspace.openTextDocument(configUri)
      );
    }

    log.info('Agency initialized in workspace');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscodeModule.window.showErrorMessage(`Failed to initialize Agency: ${message}`);
    log.error('Failed to initialize Agency', error);
  }
}

/**
 * Verify the Agency setup by running a series of checks.
 *
 * Checks performed:
 * 1. Config file exists and is valid JSON
 * 2. Config passes Zod schema validation
 * 3. MCP server is reachable (can list tools)
 * 4. Container is running (if containers are configured)
 *
 * Results are written to the Agency output channel and summarized
 * in a notification.
 *
 * @param vscodeModule The VS Code module
 */
export async function verifySetup(vscodeModule: typeof vscode): Promise<void> {
  const logger = getLogger();
  const checks: CheckResult[] = [];

  try {
    const workspaceFolder = vscodeModule.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscodeModule.window.showErrorMessage(
        'No workspace folder open. Open a folder first to verify setup.'
      );
      return;
    }

    // Check 1: Config file exists and is valid JSON
    const configCheck = await checkConfigFile(vscodeModule);
    checks.push(configCheck);

    // Check 2: Config schema validation (only if file exists)
    const schemaCheck = await checkConfigSchema(vscodeModule);
    checks.push(schemaCheck);

    // Check 3: MCP server is reachable
    const mcpCheck = await checkMcpConnection();
    checks.push(mcpCheck);

    // Check 4: Container is running (if configured)
    const containerCheck = await checkContainer(vscodeModule);
    checks.push(containerCheck);

    // Write results to output channel
    const timestamp = new Date().toLocaleString();
    logger.info(`\n--- Agency Setup Verification (${timestamp}) ---`);
    for (const check of checks) {
      const icon = check.passed ? '\u2713' : '\u2717';
      logger.info(`  ${icon} ${check.name}: ${check.detail}`);
    }

    const passedCount = checks.filter((c) => c.passed).length;
    const failedCount = checks.length - passedCount;

    if (failedCount === 0) {
      logger.info('Result: All checks passed!');
      logger.info('---\n');

      const action = await vscodeModule.window.showInformationMessage(
        '$(check) Agency: Setup verified',
        'Show Details'
      );
      if (action === 'Show Details') {
        logger.show();
      }
    } else {
      logger.info(`Result: ${failedCount} of ${checks.length} checks failed.`);
      logger.info('---\n');

      const action = await vscodeModule.window.showWarningMessage(
        `$(warning) Agency: ${failedCount} of ${checks.length} checks failed`,
        'Show Details'
      );
      if (action === 'Show Details') {
        logger.show();
      }
    }

    log.info(`Setup verification complete: ${passedCount}/${checks.length} passed`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscodeModule.window.showErrorMessage(`Setup verification failed: ${message}`);
    log.error('Setup verification failed', error);
  }
}

/**
 * Check 1: Config file exists and is valid JSON.
 */
async function checkConfigFile(vscodeModule: typeof vscode): Promise<CheckResult> {
  const name = 'Config file';

  try {
    const exists = await configExists(vscodeModule, DEFAULT_CONFIG_PATH);
    if (!exists) {
      return { name, passed: false, detail: `${DEFAULT_CONFIG_PATH} not found` };
    }

    // Try to read and parse as JSON
    const workspaceFolder = vscodeModule.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return { name, passed: false, detail: 'No workspace folder open' };
    }
    const configUri = vscodeModule.Uri.joinPath(workspaceFolder.uri, DEFAULT_CONFIG_PATH);
    const fileData = await vscodeModule.workspace.fs.readFile(configUri);
    const content = new TextDecoder().decode(fileData);
    JSON.parse(content);

    return { name, passed: true, detail: 'File exists and is valid JSON' };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { name, passed: false, detail: 'File exists but contains invalid JSON' };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { name, passed: false, detail: `Error reading config: ${message}` };
  }
}

/**
 * Check 2: Config passes Zod schema validation.
 */
async function checkConfigSchema(vscodeModule: typeof vscode): Promise<CheckResult> {
  const name = 'Config schema';

  try {
    const config = await readConfig(vscodeModule, DEFAULT_CONFIG_PATH);
    if (!config) {
      // readConfig returns null for missing file OR invalid schema
      // Try to read raw to distinguish
      const exists = await configExists(vscodeModule, DEFAULT_CONFIG_PATH);
      if (!exists) {
        return { name, passed: false, detail: 'Config file not found (skipped)' };
      }

      // File exists but failed validation - get specific errors
      const workspaceFolder = vscodeModule.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return { name, passed: false, detail: 'No workspace folder open' };
      }
      const configUri = vscodeModule.Uri.joinPath(workspaceFolder.uri, DEFAULT_CONFIG_PATH);
      const fileData = await vscodeModule.workspace.fs.readFile(configUri);
      const content = new TextDecoder().decode(fileData);
      const parsed = JSON.parse(content);
      const errors = getValidationErrors(parsed);

      return {
        name,
        passed: false,
        detail: `Validation failed: ${errors.join('; ')}`,
      };
    }

    return { name, passed: true, detail: 'Configuration is valid' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name, passed: false, detail: `Validation error: ${message}` };
  }
}

/**
 * Check 3: MCP server is reachable.
 */
async function checkMcpConnection(): Promise<CheckResult> {
  const name = 'MCP server';

  try {
    const mcpService = McpClientService.getInstance();

    if (!mcpService.isConnected()) {
      const status = mcpService.getConnectionStatus();
      return {
        name,
        passed: false,
        detail: `Not connected (status: ${status})`,
      };
    }

    // Attempt to list tools as a connectivity check
    const tools = await mcpService.listTools();
    return {
      name,
      passed: true,
      detail: `Connected (${tools.length} tools available)`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name, passed: false, detail: `Connection check failed: ${message}` };
  }
}

/**
 * Check 4: Container is running (if configured).
 */
async function checkContainer(_vscodeModule: typeof vscode): Promise<CheckResult> {
  const name = 'Container';

  try {
    const configService = ConfigService.getInstance();

    // If ConfigService is not initialized, skip
    if (!configService.isInitialized()) {
      return { name, passed: true, detail: 'Config service not initialized (skipped)' };
    }

    const containerConfigs = configService.getContainers();
    if (containerConfigs.length === 0) {
      return { name, passed: true, detail: 'No containers configured (skipped)' };
    }

    const containerService = ContainerService.getInstance();
    if (!containerService.isInitialized()) {
      return {
        name,
        passed: false,
        detail: 'Container service not initialized',
      };
    }

    const containers = await containerService.listContainers();
    const runningCount = containers.filter((c) => c.status === 'running').length;

    if (runningCount === 0) {
      return {
        name,
        passed: false,
        detail: `No running containers found (${containers.length} total)`,
      };
    }

    return {
      name,
      passed: true,
      detail: `${runningCount} container(s) running`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name, passed: false, detail: `Container check failed: ${message}` };
  }
}

/**
 * Initialize setup commands.
 * Called during extension activation.
 */
export function initializeSetupCommands(): void {
  log.debug('Setup commands initialized');
}

/**
 * Register setup commands with VS Code.
 *
 * @param vscodeModule The VS Code module
 * @returns Array of disposables for cleanup
 */
export function registerSetupCommands(vscodeModule: typeof vscode): vscode.Disposable[] {
  return [
    vscodeModule.commands.registerCommand(COMMANDS.INIT, () =>
      initAgency(vscodeModule)
    ),
    vscodeModule.commands.registerCommand(COMMANDS.VERIFY_SETUP, () =>
      verifySetup(vscodeModule)
    ),
  ];
}
