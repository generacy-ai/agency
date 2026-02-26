import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type * as vscode from 'vscode';
import { ContainerDetailPanel, _clearPanels } from '../../views/containers/ContainerDetailPanel';
import { ContainerService } from '../../services/ContainerService';
import type { ContainerInfo } from '../../types';

// Mock VS Code module
const mockVscode = {
  ViewColumn: {
    One: 1,
    Two: 2,
  },
  Uri: {
    joinPath: vi.fn((base: unknown, ...segments: string[]) => ({
      fsPath: segments.join('/'),
      toString: () => segments.join('/'),
    })),
  },
  window: {
    createWebviewPanel: vi.fn(),
  },
  env: {},
  extensions: {
    getExtension: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  workspace: {
    fs: {
      writeFile: vi.fn(),
    },
  },
} as unknown as typeof vscode;

// Mock extension URI
const mockExtensionUri = { fsPath: '/test/extension', toString: () => '/test/extension' } as vscode.Uri;

// Mock webview
const createMockWebview = () => ({
  html: '',
  cspSource: 'vscode-webview://test',
  asWebviewUri: vi.fn((uri: vscode.Uri) => uri),
  postMessage: vi.fn().mockResolvedValue(true),
  onDidReceiveMessage: vi.fn(),
});

// Mock webview panel
const createMockPanel = (webview: ReturnType<typeof createMockWebview>) => ({
  webview,
  title: 'Test Panel',
  reveal: vi.fn(),
  dispose: vi.fn(),
  onDidDispose: vi.fn((callback: () => void) => ({
    dispose: vi.fn(),
  })),
  visible: true,
});

// Mock container info
const mockContainer: ContainerInfo = {
  id: 'abc123',
  name: 'test-container',
  image: 'test:latest',
  status: 'running',
  health: 'healthy',
  isDevContainer: true,
  workspacePath: '/workspaces/test',
  ports: [
    { host: 8080, container: 80, protocol: 'tcp' },
  ],
  labels: {},
  createdAt: Date.now(),
  hasMcpServer: true,
};

describe('ContainerDetailPanel', () => {
  let panel: ContainerDetailPanel;
  let mockWebview: ReturnType<typeof createMockWebview>;
  let mockPanel: ReturnType<typeof createMockPanel>;

  beforeEach(() => {
    // Clear any existing panels
    _clearPanels();

    // Reset mocks
    vi.clearAllMocks();

    // Create mock webview and panel
    mockWebview = createMockWebview();
    mockPanel = createMockPanel(mockWebview);

    // Mock createWebviewPanel to return our mock panel
    (mockVscode.window.createWebviewPanel as Mock).mockReturnValue(mockPanel);

    // Mock ContainerService
    vi.spyOn(ContainerService, 'getInstance').mockReturnValue({
      getContainer: vi.fn().mockResolvedValue(mockContainer),
      startContainer: vi.fn().mockResolvedValue({ success: true, containerId: 'abc123', action: 'start', timestamp: Date.now() }),
      stopContainer: vi.fn().mockResolvedValue({ success: true, containerId: 'abc123', action: 'stop', timestamp: Date.now() }),
      rebuildContainer: vi.fn().mockResolvedValue({ success: true, containerId: 'abc123', action: 'rebuild', timestamp: Date.now() }),
      getContainerLogs: vi.fn().mockImplementation(async function* () {
        yield { content: 'Log line 1', stream: 'stdout', timestamp: Date.now() };
        yield { content: 'Log line 2', stream: 'stdout', timestamp: Date.now() };
      }),
      isInitialized: vi.fn().mockReturnValue(true),
    } as unknown as ContainerService);
  });

  afterEach(() => {
    if (panel) {
      panel.dispose();
    }
    _clearPanels();
  });

  describe('createOrShow', () => {
    it('should create a new panel', () => {
      panel = ContainerDetailPanel.createOrShow(mockVscode, mockExtensionUri, 'abc123');

      expect(panel).toBeDefined();
      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'agency.containerDetail',
        expect.stringContaining('abc123'),
        2,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        })
      );
    });

    it('should reuse existing panel for the same container', () => {
      const panel1 = ContainerDetailPanel.createOrShow(mockVscode, mockExtensionUri, 'abc123');
      const panel2 = ContainerDetailPanel.createOrShow(mockVscode, mockExtensionUri, 'abc123');

      expect(panel1).toBe(panel2);
      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);

      panel1.dispose();
    });

    it('should create separate panels for different containers', () => {
      const panel1 = ContainerDetailPanel.createOrShow(mockVscode, mockExtensionUri, 'abc123');
      const panel2 = ContainerDetailPanel.createOrShow(mockVscode, mockExtensionUri, 'def456');

      expect(panel1).not.toBe(panel2);
      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);

      panel1.dispose();
      panel2.dispose();
    });
  });

  describe('setContainer', () => {
    it('should update the container being displayed', async () => {
      panel = ContainerDetailPanel.createOrShow(mockVscode, mockExtensionUri, 'abc123');

      const newContainer: ContainerInfo = {
        ...mockContainer,
        id: 'def456',
        name: 'new-container',
      };

      const containerService = ContainerService.getInstance();
      (containerService.getContainer as Mock).mockResolvedValue(newContainer);

      await panel.setContainer('def456');

      // Verify the container was loaded
      expect(containerService.getContainer).toHaveBeenCalledWith('def456');
    });
  });

  describe('message handling', () => {
    beforeEach(() => {
      panel = ContainerDetailPanel.createOrShow(mockVscode, mockExtensionUri, 'abc123');
    });

    it('should handle start container message', async () => {
      const containerService = ContainerService.getInstance();
      const messageHandler = (mockPanel.webview.onDidReceiveMessage as Mock).mock.calls[0]![0];

      await messageHandler({ type: 'startContainer' });

      expect(containerService.startContainer).toHaveBeenCalledWith('abc123');
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'actionResult',
          payload: expect.objectContaining({
            action: 'start',
            success: true,
          }),
        })
      );
    });

    it('should handle stop container message', async () => {
      const containerService = ContainerService.getInstance();
      const messageHandler = (mockPanel.webview.onDidReceiveMessage as Mock).mock.calls[0]![0];

      await messageHandler({ type: 'stopContainer' });

      expect(containerService.stopContainer).toHaveBeenCalledWith('abc123');
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'actionResult',
          payload: expect.objectContaining({
            action: 'stop',
            success: true,
          }),
        })
      );
    });

    it('should handle rebuild container message', async () => {
      const containerService = ContainerService.getInstance();
      const messageHandler = (mockPanel.webview.onDidReceiveMessage as Mock).mock.calls[0]![0];

      await messageHandler({ type: 'rebuildContainer' });

      expect(containerService.rebuildContainer).toHaveBeenCalledWith('abc123');
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'actionResult',
          payload: expect.objectContaining({
            action: 'rebuild',
            success: true,
          }),
        })
      );
    });

    it('should handle filter logs message', async () => {
      const messageHandler = (mockPanel.webview.onDidReceiveMessage as Mock).mock.calls[0]![0];

      await messageHandler({ type: 'filterLogs', payload: { filter: 'error' } });

      // The filter should trigger a log update with filtered results
      // We can verify this by checking if postMessage was called with logData
      // (implementation detail: logs are sent after filtering)
    });

    it('should handle init message', async () => {
      const messageHandler = (mockPanel.webview.onDidReceiveMessage as Mock).mock.calls[0]![0];

      await messageHandler({ type: 'init' });

      // Should send container data and logs
      expect(mockWebview.postMessage).toHaveBeenCalled();
    });
  });

  describe('log filtering', () => {
    beforeEach(() => {
      panel = ContainerDetailPanel.createOrShow(mockVscode, mockExtensionUri, 'abc123');
    });

    it('should filter logs based on search term', async () => {
      const messageHandler = (mockPanel.webview.onDidReceiveMessage as Mock).mock.calls[0]![0];

      // Wait for initial logs to load
      await new Promise(resolve => setTimeout(resolve, 100));

      // Apply filter
      await messageHandler({ type: 'filterLogs', payload: { filter: 'Log line 1' } });

      // Check if logs were sent with filter applied
      const logMessages = (mockWebview.postMessage as Mock).mock.calls.filter(
        call => call[0]?.type === 'logData'
      );

      expect(logMessages.length).toBeGreaterThan(0);
    });
  });

  describe('disposal', () => {
    it('should clean up resources on dispose', () => {
      panel = ContainerDetailPanel.createOrShow(mockVscode, mockExtensionUri, 'abc123');

      panel.dispose();

      expect(mockPanel.dispose).toHaveBeenCalled();
    });

    it('should remove panel from instances on dispose', () => {
      const panel1 = ContainerDetailPanel.createOrShow(mockVscode, mockExtensionUri, 'abc123');
      panel1.dispose();

      // Creating a new panel with the same ID should create a new instance
      const panel2 = ContainerDetailPanel.createOrShow(mockVscode, mockExtensionUri, 'abc123');
      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);

      panel2.dispose();
    });
  });

  describe('container info display', () => {
    beforeEach(() => {
      panel = ContainerDetailPanel.createOrShow(mockVscode, mockExtensionUri, 'abc123');
    });

    it('should send container data to webview on init', async () => {
      const messageHandler = (mockPanel.webview.onDidReceiveMessage as Mock).mock.calls[0]![0];

      await messageHandler({ type: 'init' });

      const containerDataMessages = (mockWebview.postMessage as Mock).mock.calls.filter(
        call => call[0]?.type === 'containerData'
      );

      expect(containerDataMessages.length).toBeGreaterThan(0);
      expect(containerDataMessages[0]![0].payload.container).toMatchObject({
        id: 'abc123',
        name: 'test-container',
        status: 'running',
      });
    });
  });
});
