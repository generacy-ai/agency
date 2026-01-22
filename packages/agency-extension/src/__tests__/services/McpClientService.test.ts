import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import { McpClientService } from '../../services/McpClientService';
import type { McpConnectionStatusChangeEvent, McpReconnectConfig } from '../../types';

// Mock the MCP SDK
const mockClientConnect = vi.fn();
const mockClientClose = vi.fn();
const mockClientListTools = vi.fn();
const mockClientCallTool = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockClientConnect,
    close: mockClientClose,
    listTools: mockClientListTools,
    callTool: mockClientCallTool,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

// Mock the utils module
vi.mock('../../utils', () => ({
  createScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  DisposableManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    dispose: vi.fn(),
  })),
  delay: vi.fn().mockResolvedValue(undefined),
}));

describe('McpClientService', () => {
  let mockVscode: typeof vscode;

  beforeEach(() => {
    // Reset the singleton before each test
    McpClientService.reset();

    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock behaviors
    mockClientConnect.mockResolvedValue(undefined);
    mockClientClose.mockResolvedValue(undefined);
    mockClientListTools.mockResolvedValue({
      tools: [
        {
          name: 'file_read',
          description: 'Read a file',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
        },
        {
          name: 'file_write',
          description: 'Write a file',
          inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
        },
      ],
    });
    mockClientCallTool.mockResolvedValue({
      content: [{ type: 'text', text: 'success' }],
      isError: false,
    });

    // Create mock VS Code module
    mockVscode = {} as typeof vscode;
  });

  afterEach(() => {
    McpClientService.reset();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = McpClientService.getInstance();
      const instance2 = McpClientService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = McpClientService.getInstance();
      McpClientService.reset();
      const instance2 = McpClientService.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const service = McpClientService.getInstance();

      await service.initialize(mockVscode);

      expect(service.isInitialized()).toBe(true);
    });

    it('should not re-initialize if already initialized', async () => {
      const service = McpClientService.getInstance();

      await service.initialize(mockVscode);
      await service.initialize(mockVscode);

      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('Connection State', () => {
    let service: McpClientService;

    beforeEach(async () => {
      service = McpClientService.getInstance();
      await service.initialize(mockVscode);
    });

    it('should start disconnected', () => {
      expect(service.isConnected()).toBe(false);
      expect(service.getConnectionStatus()).toBe('disconnected');
    });

    it('should return disconnected even if not initialized', () => {
      // These methods are simple state getters that don't require initialization
      McpClientService.reset();
      const uninitService = McpClientService.getInstance();

      // Should return disconnected state without throwing
      expect(uninitService.isConnected()).toBe(false);
      expect(uninitService.getConnectionStatus()).toBe('disconnected');
    });
  });

  describe('Connection Lifecycle', () => {
    let service: McpClientService;

    beforeEach(async () => {
      service = McpClientService.getInstance();
      await service.initialize(mockVscode);
    });

    describe('connect', () => {
      it('should connect successfully', async () => {
        await service.connect({ containerId: 'test-container' });

        expect(service.isConnected()).toBe(true);
        expect(service.getConnectionStatus()).toBe('connected');
        expect(mockClientConnect).toHaveBeenCalled();
      });

      it('should throw if already connected', async () => {
        await service.connect({ containerId: 'test-container' });

        await expect(
          service.connect({ containerId: 'another-container' })
        ).rejects.toThrow('Cannot connect: already connected');
      });

      it('should throw if connecting', async () => {
        // Make connect hang
        mockClientConnect.mockImplementation(() => new Promise(() => {}));

        const connectPromise = service.connect({ containerId: 'test-container' });

        // Wait a tick for status to change to connecting
        await new Promise(resolve => setTimeout(resolve, 0));

        await expect(
          service.connect({ containerId: 'another-container' })
        ).rejects.toThrow('Cannot connect: already connecting');

        // Clean up
        McpClientService.reset();
      });

      it('should emit status change events during connect', async () => {
        const events: McpConnectionStatusChangeEvent[] = [];
        service.onConnectionStatusChange((event) => events.push(event));

        await service.connect({ containerId: 'test-container' });

        expect(events.length).toBeGreaterThan(0);
        expect(events.some(e => e.newStatus === 'connecting')).toBe(true);
        expect(events.some(e => e.newStatus === 'connected')).toBe(true);
      });

      it('should handle connection failure', async () => {
        const error = new Error('Connection failed');
        mockClientConnect.mockRejectedValue(error);

        // Disable reconnect for this test
        service.setReconnectConfig({ enabled: false });

        await expect(
          service.connect({ containerId: 'test-container' })
        ).rejects.toThrow('Connection failed');

        expect(service.isConnected()).toBe(false);
        expect(service.getConnectionStatus()).toBe('error');
      });
    });

    describe('disconnect', () => {
      it('should disconnect successfully', async () => {
        await service.connect({ containerId: 'test-container' });
        await service.disconnect();

        expect(service.isConnected()).toBe(false);
        expect(service.getConnectionStatus()).toBe('disconnected');
        expect(mockClientClose).toHaveBeenCalled();
      });

      it('should be idempotent when already disconnected', async () => {
        await service.disconnect();

        expect(service.isConnected()).toBe(false);
        expect(mockClientClose).not.toHaveBeenCalled();
      });

      it('should emit status change event on disconnect', async () => {
        await service.connect({ containerId: 'test-container' });

        const events: McpConnectionStatusChangeEvent[] = [];
        service.onConnectionStatusChange((event) => events.push(event));

        await service.disconnect();

        expect(events).toContainEqual(
          expect.objectContaining({
            previousStatus: 'connected',
            newStatus: 'disconnected',
          })
        );
      });
    });

    describe('getConnectionInfo', () => {
      it('should return disconnected info when not connected', () => {
        const info = service.getConnectionInfo();

        expect(info.status).toBe('disconnected');
        expect(info.containerId).toBeUndefined();
        expect(info.connectedAt).toBeUndefined();
        expect(info.reconnectAttempts).toBe(0);
      });

      it('should return connected info when connected', async () => {
        await service.connect({ containerId: 'test-container' });
        const info = service.getConnectionInfo();

        expect(info.status).toBe('connected');
        expect(info.containerId).toBe('test-container');
        expect(info.connectedAt).toBeDefined();
        expect(info.reconnectAttempts).toBe(0);
      });
    });
  });

  describe('Tool Operations', () => {
    let service: McpClientService;

    beforeEach(async () => {
      service = McpClientService.getInstance();
      await service.initialize(mockVscode);
      await service.connect({ containerId: 'test-container' });
    });

    describe('listTools', () => {
      it('should list available tools', async () => {
        const tools = await service.listTools();

        expect(tools).toHaveLength(2);
        expect(tools[0].name).toBe('file_read');
        expect(tools[0].description).toBe('Read a file');
        expect(tools[1].name).toBe('file_write');
      });

      it('should extract namespace from tool name', async () => {
        const tools = await service.listTools();

        expect(tools[0].namespace).toBe('file');
        expect(tools[1].namespace).toBe('file');
      });

      it('should throw if not connected', async () => {
        await service.disconnect();

        await expect(service.listTools()).rejects.toThrow('Not connected to MCP server');
      });
    });

    describe('executeTool', () => {
      it('should execute tool successfully', async () => {
        const result = await service.executeTool('file_read', { path: '/test.txt' });

        expect(result.isError).toBe(false);
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toEqual({ type: 'text', text: 'success' });
        expect(result.duration).toBeDefined();
        expect(result.timestamp).toBeDefined();
        expect(mockClientCallTool).toHaveBeenCalledWith({
          name: 'file_read',
          arguments: { path: '/test.txt' },
        });
      });

      it('should handle tool execution error', async () => {
        mockClientCallTool.mockResolvedValue({
          content: [{ type: 'text', text: 'File not found' }],
          isError: true,
        });

        const result = await service.executeTool('file_read', { path: '/nonexistent.txt' });

        expect(result.isError).toBe(true);
        expect(result.errorMessage).toBe('File not found');
      });

      it('should handle tool execution exception', async () => {
        mockClientCallTool.mockRejectedValue(new Error('Network error'));

        const result = await service.executeTool('file_read', { path: '/test.txt' });

        expect(result.isError).toBe(true);
        expect(result.errorMessage).toBe('Network error');
      });

      it('should throw if not connected', async () => {
        await service.disconnect();

        await expect(
          service.executeTool('file_read', { path: '/test.txt' })
        ).rejects.toThrow('Not connected to MCP server');
      });
    });
  });

  describe('Reconnect Configuration', () => {
    let service: McpClientService;

    beforeEach(async () => {
      service = McpClientService.getInstance();
      await service.initialize(mockVscode);
    });

    it('should have default reconnect config', () => {
      const config = service.getReconnectConfig();

      expect(config.enabled).toBe(true);
      expect(config.maxAttempts).toBe(5);
      expect(config.initialDelay).toBe(1000);
      expect(config.maxDelay).toBe(30000);
      expect(config.backoffMultiplier).toBe(2);
    });

    it('should allow updating reconnect config', () => {
      service.setReconnectConfig({ maxAttempts: 10, initialDelay: 500 });

      const config = service.getReconnectConfig();

      expect(config.maxAttempts).toBe(10);
      expect(config.initialDelay).toBe(500);
      // Other values should remain default
      expect(config.enabled).toBe(true);
    });
  });

  describe('Auto-Reconnect', () => {
    let service: McpClientService;

    beforeEach(async () => {
      service = McpClientService.getInstance();
      await service.initialize(mockVscode);
    });

    it('should attempt reconnect on connection failure when enabled', async () => {
      let callCount = 0;
      mockClientConnect
        .mockImplementation(() => {
          callCount++;
          if (callCount < 3) {
            return Promise.reject(new Error('Connection failed'));
          }
          return Promise.resolve();
        });

      service.setReconnectConfig({ enabled: true, maxAttempts: 5, initialDelay: 100 });

      await service.connect({ containerId: 'test-container' });

      // Should have connected after retries
      expect(service.isConnected()).toBe(true);
      expect(callCount).toBe(3);
    });

    it('should not reconnect when disabled', async () => {
      mockClientConnect.mockRejectedValue(new Error('Connection failed'));
      service.setReconnectConfig({ enabled: false });

      await expect(
        service.connect({ containerId: 'test-container' })
      ).rejects.toThrow('Connection failed');

      expect(mockClientConnect).toHaveBeenCalledTimes(1);
    });

    it('should stop reconnecting after max attempts', async () => {
      mockClientConnect.mockRejectedValue(new Error('Connection failed'));
      service.setReconnectConfig({ enabled: true, maxAttempts: 3, initialDelay: 10 });

      await expect(
        service.connect({ containerId: 'test-container' })
      ).rejects.toThrow('Connection failed');

      // Should have tried maxAttempts times
      expect(mockClientConnect).toHaveBeenCalledTimes(3);
      expect(service.getConnectionStatus()).toBe('error');
    });

    it('should emit reconnecting status during retry', async () => {
      let callCount = 0;
      mockClientConnect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Connection failed'));
        }
        return Promise.resolve();
      });

      const events: McpConnectionStatusChangeEvent[] = [];
      service.onConnectionStatusChange((event) => events.push(event));

      service.setReconnectConfig({ enabled: true, maxAttempts: 5, initialDelay: 10 });
      await service.connect({ containerId: 'test-container' });

      expect(events.some(e => e.newStatus === 'reconnecting')).toBe(true);
    });
  });

  describe('Event Emitter', () => {
    let service: McpClientService;

    beforeEach(async () => {
      service = McpClientService.getInstance();
      await service.initialize(mockVscode);
    });

    it('should allow multiple listeners', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      service.onConnectionStatusChange(listener1);
      service.onConnectionStatusChange(listener2);

      await service.connect({ containerId: 'test-container' });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should stop receiving events after dispose', async () => {
      const listener = vi.fn();
      const disposable = service.onConnectionStatusChange(listener);

      disposable.dispose();

      await service.connect({ containerId: 'test-container' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should include containerId in event', async () => {
      const events: McpConnectionStatusChangeEvent[] = [];
      service.onConnectionStatusChange((event) => events.push(event));

      await service.connect({ containerId: 'test-container' });

      expect(events.some(e => e.containerId === 'test-container')).toBe(true);
    });

    it('should include timestamp in event', async () => {
      const beforeConnect = Date.now();
      const events: McpConnectionStatusChangeEvent[] = [];
      service.onConnectionStatusChange((event) => events.push(event));

      await service.connect({ containerId: 'test-container' });
      const afterConnect = Date.now();

      expect(events.every(e => e.timestamp >= beforeConnect && e.timestamp <= afterConnect)).toBe(true);
    });
  });

  describe('Dispose', () => {
    it('should clean up resources on dispose', async () => {
      const service = McpClientService.getInstance();
      await service.initialize(mockVscode);
      await service.connect({ containerId: 'test-container' });

      service.dispose();

      expect(service.isInitialized()).toBe(false);
    });

    it('should close client connection on dispose', async () => {
      const service = McpClientService.getInstance();
      await service.initialize(mockVscode);
      await service.connect({ containerId: 'test-container' });

      service.dispose();

      expect(mockClientClose).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw when connecting without initialization', async () => {
      const service = McpClientService.getInstance();

      await expect(
        service.connect({ containerId: 'test-container' })
      ).rejects.toThrow('McpClientService not initialized');
    });

    it('should throw when disconnecting without initialization', async () => {
      const service = McpClientService.getInstance();

      await expect(service.disconnect()).rejects.toThrow('McpClientService not initialized');
    });

    it('should throw when listing tools without initialization', async () => {
      const service = McpClientService.getInstance();

      await expect(service.listTools()).rejects.toThrow('McpClientService not initialized');
    });

    it('should throw when executing tool without initialization', async () => {
      const service = McpClientService.getInstance();

      await expect(
        service.executeTool('test', {})
      ).rejects.toThrow('McpClientService not initialized');
    });
  });
});
