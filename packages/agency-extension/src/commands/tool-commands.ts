import type * as vscode from 'vscode';
import type { ToolInfo } from '../types';
import { COMMANDS, CONTEXT_KEYS } from '../constants';
import { McpClientService } from '../services';
import { createScopedLogger } from '../utils';

const log = createScopedLogger('ToolCommands');

/**
 * Tool command handlers for the Agency extension.
 * These commands manage MCP tool testing and connection.
 */

/**
 * Opens the tool execution panel for testing a specific tool.
 * If no tool is provided, shows a quick pick to select one.
 *
 * @param vscodeModule The VS Code module
 * @param tool Optional tool to test directly
 */
export async function testTool(
  vscodeModule: typeof vscode,
  tool?: ToolInfo
): Promise<void> {
  const mcpService = McpClientService.getInstance();

  if (!mcpService.isConnected()) {
    const action = await vscodeModule.window.showWarningMessage(
      'Not connected to MCP server. Connect first?',
      'Connect',
      'Cancel'
    );
    if (action === 'Connect') {
      await connectMcp(vscodeModule);
      // Re-check connection after attempting to connect
      if (!mcpService.isConnected()) {
        return;
      }
    } else {
      return;
    }
  }

  // Get selected tool or show picker
  let selectedTool: ToolInfo | undefined = tool;
  if (!selectedTool) {
    try {
      const tools = await mcpService.listTools();

      if (tools.length === 0) {
        vscodeModule.window.showInformationMessage('No tools available from the MCP server.');
        return;
      }

      const items = tools.map((t) => ({
        label: t.name,
        description: t.namespace ? `[${t.namespace}]` : undefined,
        detail: t.description,
        tool: t,
      }));

      const selected = await vscodeModule.window.showQuickPick(items, {
        placeHolder: 'Select a tool to test',
        title: 'Test MCP Tool',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (!selected) {
        return; // User cancelled
      }

      selectedTool = selected.tool;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscodeModule.window.showErrorMessage(`Failed to list tools: ${message}`);
      log.error('Failed to list tools', error);
      return;
    }
  }

  // Show input for tool parameters
  const schema = selectedTool.inputSchema;
  const params = await promptForToolParameters(vscodeModule, selectedTool);

  if (params === undefined) {
    return; // User cancelled
  }

  // Execute the tool with progress indication
  await vscodeModule.window.withProgress(
    {
      location: vscodeModule.ProgressLocation.Notification,
      title: `Executing ${selectedTool.name}...`,
      cancellable: false,
    },
    async () => {
      try {
        const result = await mcpService.executeTool(selectedTool!.name, params);

        if (result.isError) {
          vscodeModule.window.showErrorMessage(
            `Tool execution failed: ${result.errorMessage || 'Unknown error'}`
          );
          log.error(`Tool ${selectedTool!.name} failed`, result.errorMessage);
        } else {
          // Show result in output channel or as message
          const textContent = result.content
            .filter((c) => c.type === 'text')
            .map((c) => (c as { type: 'text'; text: string }).text)
            .join('\n');

          // For small outputs, show in notification
          if (textContent.length < 500) {
            vscodeModule.window.showInformationMessage(
              `Tool ${selectedTool!.name} completed (${result.duration}ms): ${textContent.substring(0, 200)}${textContent.length > 200 ? '...' : ''}`
            );
          } else {
            // For larger outputs, show in a new document
            const doc = await vscodeModule.workspace.openTextDocument({
              content: `# Tool Execution Result: ${selectedTool!.name}\n\nDuration: ${result.duration}ms\n\n## Output\n\n${textContent}`,
              language: 'markdown',
            });
            await vscodeModule.window.showTextDocument(doc, { preview: true });
          }

          log.info(`Tool ${selectedTool!.name} executed successfully (${result.duration}ms)`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscodeModule.window.showErrorMessage(`Tool execution error: ${message}`);
        log.error(`Tool ${selectedTool!.name} execution error`, error);
      }
    }
  );
}

/**
 * Prompts the user to enter tool parameters based on the input schema.
 * Returns the parsed parameters or undefined if cancelled.
 */
async function promptForToolParameters(
  vscodeModule: typeof vscode,
  tool: ToolInfo
): Promise<Record<string, unknown> | undefined> {
  const schema = tool.inputSchema;

  // If no parameters required, return empty object
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    return {};
  }

  // For simple schemas, use a JSON input box
  // Build a template with the required properties
  const template: Record<string, unknown> = {};
  const properties = schema.properties || {};
  const required = schema.required || [];

  for (const [key, prop] of Object.entries(properties)) {
    if (prop.default !== undefined) {
      template[key] = prop.default;
    } else if (required.includes(key)) {
      // Add placeholder based on type
      switch (prop.type) {
        case 'string':
          template[key] = '';
          break;
        case 'number':
          template[key] = 0;
          break;
        case 'boolean':
          template[key] = false;
          break;
        case 'array':
          template[key] = [];
          break;
        case 'object':
          template[key] = {};
          break;
        default:
          template[key] = null;
      }
    }
  }

  const templateJson = JSON.stringify(template, null, 2);

  // Build description of parameters
  const paramDescriptions = Object.entries(properties)
    .map(([key, prop]) => {
      const isRequired = required.includes(key);
      return `• ${key}${isRequired ? ' (required)' : ''}: ${prop.description || prop.type}`;
    })
    .join('\n');

  const result = await vscodeModule.window.showInputBox({
    prompt: `Enter parameters for ${tool.name} (JSON format)`,
    value: templateJson,
    valueSelection: undefined,
    placeHolder: 'Enter tool parameters as JSON',
    validateInput: (value) => {
      try {
        const parsed = JSON.parse(value);
        // Validate required fields
        for (const req of required) {
          if (parsed[req] === undefined || parsed[req] === null || parsed[req] === '') {
            return `Missing required parameter: ${req}`;
          }
        }
        return null;
      } catch {
        return 'Invalid JSON format';
      }
    },
  });

  if (result === undefined) {
    return undefined; // User cancelled
  }

  try {
    return JSON.parse(result) as Record<string, unknown>;
  } catch {
    vscodeModule.window.showErrorMessage('Invalid JSON parameters');
    return undefined;
  }
}

/**
 * Refreshes the tool list from the MCP server.
 * Triggers a refresh of the tools tree view.
 *
 * @param vscodeModule The VS Code module
 */
export async function refreshTools(vscodeModule: typeof vscode): Promise<void> {
  const mcpService = McpClientService.getInstance();

  if (!mcpService.isConnected()) {
    vscodeModule.window.showWarningMessage('Not connected to MCP server. Connect first to refresh tools.');
    return;
  }

  try {
    const tools = await mcpService.listTools();
    vscodeModule.window.showInformationMessage(`Tools refreshed: ${tools.length} tool(s) available.`);
    log.info(`Tools refreshed: ${tools.length} tools`);

    // Trigger tree view refresh if it exists
    await vscodeModule.commands.executeCommand('workbench.actions.treeView.agency.tools.refresh');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscodeModule.window.showErrorMessage(`Failed to refresh tools: ${message}`);
    log.error('Failed to refresh tools', error);
  }
}

/**
 * Connects to an MCP server running in a container.
 * Prompts the user for connection details if not provided.
 *
 * @param vscodeModule The VS Code module
 */
export async function connectMcp(vscodeModule: typeof vscode): Promise<void> {
  const mcpService = McpClientService.getInstance();

  if (mcpService.isConnected()) {
    const action = await vscodeModule.window.showWarningMessage(
      'Already connected to MCP server. Disconnect first?',
      'Disconnect',
      'Cancel'
    );
    if (action === 'Disconnect') {
      await disconnectMcp(vscodeModule);
    } else {
      return;
    }
  }

  // Prompt for container ID
  const containerId = await vscodeModule.window.showInputBox({
    prompt: 'Enter the container ID or name to connect to',
    placeHolder: 'e.g., my-dev-container or abc123def456',
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'Container ID is required';
      }
      return null;
    },
  });

  if (!containerId) {
    return; // User cancelled
  }

  // Connect with progress indication
  await vscodeModule.window.withProgress(
    {
      location: vscodeModule.ProgressLocation.Notification,
      title: `Connecting to MCP server in ${containerId}...`,
      cancellable: false,
    },
    async () => {
      try {
        // Initialize the service if needed
        if (!mcpService.isInitialized()) {
          await mcpService.initialize(vscodeModule);
        }

        await mcpService.connect({
          containerId: containerId.trim(),
        });

        // Set context for command enablement
        await vscodeModule.commands.executeCommand(
          'setContext',
          CONTEXT_KEYS.MCP_CONNECTED,
          true
        );

        vscodeModule.window.showInformationMessage(
          `Connected to MCP server in container: ${containerId}`
        );
        log.info(`Connected to MCP server in container: ${containerId}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscodeModule.window.showErrorMessage(`Failed to connect: ${message}`);
        log.error('Failed to connect to MCP server', error);

        // Ensure context is cleared on failure
        await vscodeModule.commands.executeCommand(
          'setContext',
          CONTEXT_KEYS.MCP_CONNECTED,
          false
        );
      }
    }
  );
}

/**
 * Disconnects from the MCP server.
 *
 * @param vscodeModule The VS Code module
 */
export async function disconnectMcp(vscodeModule: typeof vscode): Promise<void> {
  const mcpService = McpClientService.getInstance();

  if (!mcpService.isConnected()) {
    vscodeModule.window.showInformationMessage('Not currently connected to an MCP server.');
    return;
  }

  try {
    await mcpService.disconnect();

    // Clear context for command enablement
    await vscodeModule.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.MCP_CONNECTED,
      false
    );

    vscodeModule.window.showInformationMessage('Disconnected from MCP server.');
    log.info('Disconnected from MCP server');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscodeModule.window.showErrorMessage(`Failed to disconnect: ${message}`);
    log.error('Failed to disconnect from MCP server', error);
  }
}

/**
 * Registers all tool commands with VS Code.
 * Returns disposables for cleanup.
 *
 * @param vscodeModule The VS Code module
 */
export function registerToolCommands(vscodeModule: typeof vscode): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Test Tool command
  disposables.push(
    vscodeModule.commands.registerCommand(COMMANDS.TEST_TOOL, (tool?: ToolInfo) =>
      testTool(vscodeModule, tool)
    )
  );

  // Refresh Tools command
  disposables.push(
    vscodeModule.commands.registerCommand(COMMANDS.REFRESH_TOOLS, () =>
      refreshTools(vscodeModule)
    )
  );

  // Connect MCP command
  disposables.push(
    vscodeModule.commands.registerCommand(COMMANDS.CONNECT_MCP, () =>
      connectMcp(vscodeModule)
    )
  );

  // Disconnect MCP command
  disposables.push(
    vscodeModule.commands.registerCommand(COMMANDS.DISCONNECT_MCP, () =>
      disconnectMcp(vscodeModule)
    )
  );

  log.debug('Tool commands registered');
  return disposables;
}
