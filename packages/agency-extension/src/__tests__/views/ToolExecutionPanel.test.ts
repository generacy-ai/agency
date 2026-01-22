import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import type { ToolInfo, JsonSchema, ToolResult, ToolExecutionRecord } from '../../types';

/**
 * Tests for ToolExecutionPanel webview.
 *
 * These tests verify:
 * - Form generation from JSON Schema
 * - Parameter validation
 * - Tool execution flow
 * - History management
 */

// Mock VS Code module
const mockWebview = {
  html: '',
  onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
  postMessage: vi.fn().mockResolvedValue(true),
  asWebviewUri: vi.fn((uri: any) => uri),
  cspSource: 'https://test',
};

const mockPanel = {
  webview: mockWebview,
  onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
  reveal: vi.fn(),
  dispose: vi.fn(),
  visible: true,
  title: '',
};

const mockVscode = {
  window: {
    createWebviewPanel: vi.fn(() => mockPanel),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  ViewColumn: {
    One: 1,
    Two: 2,
  },
  Uri: {
    joinPath: vi.fn((...args: unknown[]) => args.join('/')),
  },
} as unknown as typeof vscode;

// Mock McpClientService
vi.mock('../../services', () => ({
  McpClientService: {
    getInstance: vi.fn(() => ({
      isConnected: vi.fn(() => true),
      getConnectionStatus: vi.fn(() => 'connected'),
      executeTool: vi.fn(),
      onConnectionStatusChange: vi.fn(() => ({ dispose: vi.fn() })),
    })),
  },
}));

// Mock logger
vi.mock('../../utils', async () => {
  const actual = await vi.importActual('../../utils');
  return {
    ...actual,
    createScopedLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  };
});

describe('ToolExecutionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebview.html = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Form Generation from JSON Schema', () => {
    const createToolWithSchema = (properties: JsonSchema['properties'], required?: string[]): ToolInfo => ({
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: {
        type: 'object',
        properties,
        required,
      },
    });

    it('should generate text input for string type', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool = createToolWithSchema({
        name: { type: 'string', description: 'A name field' },
      });

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      // The HTML should contain an input for the name field
      expect(mockWebview.html).toContain('name="name"');
      expect(mockWebview.html).toContain('type="text"');
      expect(mockWebview.html).toContain('A name field');

      panel.dispose();
    });

    it('should generate number input with min/max for number type', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool = createToolWithSchema({
        count: { type: 'number', minimum: 1, maximum: 100, description: 'A count field' },
      });

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      expect(mockWebview.html).toContain('name="count"');
      expect(mockWebview.html).toContain('type="number"');
      expect(mockWebview.html).toContain('min="1"');
      expect(mockWebview.html).toContain('max="100"');

      panel.dispose();
    });

    it('should generate checkbox for boolean type', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool = createToolWithSchema({
        enabled: { type: 'boolean', default: true },
      });

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      expect(mockWebview.html).toContain('name="enabled"');
      expect(mockWebview.html).toContain('type="checkbox"');
      expect(mockWebview.html).toContain('checked');

      panel.dispose();
    });

    it('should generate select dropdown for enum type', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool = createToolWithSchema({
        level: { type: 'string', enum: ['low', 'medium', 'high'] },
      });

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      expect(mockWebview.html).toContain('<select');
      expect(mockWebview.html).toContain('name="level"');
      expect(mockWebview.html).toContain('<option value="low"');
      expect(mockWebview.html).toContain('<option value="medium"');
      expect(mockWebview.html).toContain('<option value="high"');

      panel.dispose();
    });

    it('should generate textarea for array type', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool = createToolWithSchema({
        items: { type: 'array', description: 'A list of items' },
      });

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      expect(mockWebview.html).toContain('<textarea');
      expect(mockWebview.html).toContain('name="items"');
      expect(mockWebview.html).toContain('data-type="json"');

      panel.dispose();
    });

    it('should generate textarea for object type', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool = createToolWithSchema({
        config: { type: 'object', description: 'Configuration object' },
      });

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      expect(mockWebview.html).toContain('<textarea');
      expect(mockWebview.html).toContain('name="config"');
      expect(mockWebview.html).toContain('data-type="json"');

      panel.dispose();
    });

    it('should mark required fields with asterisk', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool = createToolWithSchema(
        {
          required_field: { type: 'string' },
          optional_field: { type: 'string' },
        },
        ['required_field']
      );

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      // Should have required marker
      expect(mockWebview.html).toContain('required-marker');
      // Required field should have required attribute
      expect(mockWebview.html).toContain('name="required_field"');

      panel.dispose();
    });
  });

  describe('Tool Execution Handling', () => {
    it('should create panel and show connection status', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool: ToolInfo = {
        name: 'test_tool',
        description: 'Test tool description',
        inputSchema: { type: 'object' },
      };

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalled();
      expect(mockWebview.html).toContain('test_tool');
      expect(mockWebview.html).toContain('Test tool description');
      expect(mockWebview.html).toContain('Connected');

      panel.dispose();
    });

    it('should reuse existing panel for same tool', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool: ToolInfo = {
        name: 'test_tool',
        inputSchema: { type: 'object' },
      };

      const extensionUri = { fsPath: '/test' } as vscode.Uri;

      const panel1 = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);
      const createCallCount = (mockVscode.window.createWebviewPanel as any).mock.calls.length;

      const panel2 = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      // Should not create a new panel
      expect((mockVscode.window.createWebviewPanel as any).mock.calls.length).toBe(createCallCount);
      // Should reveal existing panel
      expect(mockPanel.reveal).toHaveBeenCalled();

      expect(panel1).toBe(panel2);

      panel1.dispose();
    });

    it('should show empty state when no parameters', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool: ToolInfo = {
        name: 'no_params_tool',
        inputSchema: { type: 'object' },
      };

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      expect(mockWebview.html).toContain('This tool has no parameters');

      panel.dispose();
    });

    it('should include execute button', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool: ToolInfo = {
        name: 'test_tool',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      };

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      expect(mockWebview.html).toContain('id="executeBtn"');
      expect(mockWebview.html).toContain('Execute');

      panel.dispose();
    });

    it('should include history section', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool: ToolInfo = {
        name: 'test_tool',
        inputSchema: { type: 'object' },
      };

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      expect(mockWebview.html).toContain('History');
      expect(mockWebview.html).toContain('id="historyList"');
      expect(mockWebview.html).toContain('id="clearHistoryBtn"');

      panel.dispose();
    });

    it('should include loading indicator', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool: ToolInfo = {
        name: 'test_tool',
        inputSchema: { type: 'object' },
      };

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      expect(mockWebview.html).toContain('id="loadingIndicator"');
      expect(mockWebview.html).toContain('Executing...');

      panel.dispose();
    });

    it('should include result display area', async () => {
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool: ToolInfo = {
        name: 'test_tool',
        inputSchema: { type: 'object' },
      };

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      expect(mockWebview.html).toContain('Result');
      expect(mockWebview.html).toContain('id="resultContent"');
      expect(mockWebview.html).toContain('id="executionTime"');

      panel.dispose();
    });
  });

  describe('Error Handling', () => {
    it('should show disconnected status when not connected', async () => {
      // Re-mock with disconnected status
      vi.doMock('../../services', () => ({
        McpClientService: {
          getInstance: vi.fn(() => ({
            isConnected: vi.fn(() => false),
            getConnectionStatus: vi.fn(() => 'disconnected'),
            executeTool: vi.fn(),
            onConnectionStatusChange: vi.fn(() => ({ dispose: vi.fn() })),
          })),
        },
      }));

      // Need to re-import to get new mock
      vi.resetModules();

      // Re-setup mocks for vscode
      const { ToolExecutionPanel, _clearPanels } = await import('../../views/tool-browser/ToolExecutionPanel');
      _clearPanels();

      const tool: ToolInfo = {
        name: 'test_tool',
        inputSchema: { type: 'object' },
      };

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ToolExecutionPanel.createOrShow(mockVscode, extensionUri, tool);

      expect(mockWebview.html).toContain('Disconnected');

      panel.dispose();
    });
  });
});
