import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StdioClient, type StdioClientConfig } from '../../mcp/StdioClient';
import { McpErrorCode, type ConnectionState, type ToolCallEventInternal } from '../../mcp/types';
import type { ToolExecutionRequest, ToolResult } from '../../types';

// Mock the MCP SDK Client
const mockSdkConnect = vi.fn();
const mockSdkClose = vi.fn();
const mockSdkListTools = vi.fn();
const mockSdkCallTool = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockSdkConnect,
    close: mockSdkClose,
    listTools: mockSdkListTools,
    callTool: mockSdkCallTool,
  })),
}));

// Mock DockerExecTransport
const mockTransportStart = vi.fn();
const mockTransportStop = vi.fn();
const mockTransportSend = vi.fn();
const mockTransportGetState = vi.fn();
const mockTransportOnStateChange = vi.fn();
const mockTransportOnMessage = vi.fn();
const mockTransportOnError = vi.fn();

vi.mock('../../mcp/DockerExecTransport', () => ({
  DockerExecTransport: vi.fn().mockImplementation(() => ({
    start: mockTransportStart,
    stop: mockTransportStop,
    send: mockTransportSend,
    getState: mockTransportGetState,
    onStateChange: mockTransportOnStateChange,
    onMessage: mockTransportOnMessage,
    onError: mockTransportOnError,
  })),
}));

describe('StdioClient', () => {
  let client: StdioClient;
  let config: StdioClientConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    mockTransportGetState.mockReturnValue('disconnected');
    mockTransportOnStateChange.mockReturnValue(() => {});
    mockTransportOnMessage.mockReturnValue(() => {});
    mockTransportOnError.mockReturnValue(() => {});
    mockSdkConnect.mockResolvedValue(undefined);
    mockSdkClose.mockResolvedValue(undefined);

    config = {
      containerId: 'test-container',
      command: ['node', 'server.js'],
      clientName: 'test-client',
      clientVersion: '1.0.0',
      defaultExecutionTimeout: 5000,
    };

    client = new StdioClient(config);
  });

  afterEach(async () => {
    try {
      await client.disconnect();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should initialize with disconnected state', () => {
      expect(client.getConnectionState()).toBe('disconnected');
      expect(client.isConnected()).toBe(false);
    });

    it('should create DockerExecTransport with config', async () => {
      const DockerExecTransportModule = await import('../../mcp/DockerExecTransport');
      expect(DockerExecTransportModule.DockerExecTransport).toHaveBeenCalledWith(expect.objectContaining({
        containerId: 'test-container',
        command: ['node', 'server.js'],
      }));
    });

    it('should use default values for optional config', () => {
      const minimalConfig: StdioClientConfig = {
        containerId: 'container',
        command: ['cmd'],
      };
      const minimalClient = new StdioClient(minimalConfig);
      expect(minimalClient.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect via SDK client', async () => {
      await client.connect();

      expect(mockSdkConnect).toHaveBeenCalled();
      expect(client.isConnected()).toBe(true);
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should not reconnect if already connected', async () => {
      await client.connect();
      mockSdkConnect.mockClear();

      await client.connect();

      expect(mockSdkConnect).not.toHaveBeenCalled();
    });

    it('should throw on connection failure', async () => {
      mockSdkConnect.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(client.connect()).rejects.toThrow();
      expect(client.isConnected()).toBe(false);
    });

    it('should clear tool cache on new connection', async () => {
      // First connection and list tools
      mockSdkListTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'Test tool', inputSchema: { type: 'object' } }],
      });

      await client.connect();
      await client.listTools();

      // Disconnect and reconnect
      await client.disconnect();
      mockSdkConnect.mockResolvedValueOnce(undefined);
      mockSdkListTools.mockResolvedValueOnce({
        tools: [{ name: 'tool2', description: 'New tool', inputSchema: { type: 'object' } }],
      });

      await client.connect();
      const tools = await client.listTools();

      expect(tools[0].name).toBe('tool2');
    });
  });

  describe('disconnect', () => {
    it('should disconnect via SDK client', async () => {
      await client.connect();

      await client.disconnect();

      expect(mockSdkClose).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });

    it('should handle disconnect when not connected', async () => {
      await expect(client.disconnect()).resolves.not.toThrow();
    });
  });

  describe('listTools', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should return tools from SDK', async () => {
      mockSdkListTools.mockResolvedValueOnce({
        tools: [
          { name: 'tool1', description: 'First tool', inputSchema: { type: 'object' } },
          { name: 'tool2', description: 'Second tool', inputSchema: { type: 'object' } },
        ],
      });

      const tools = await client.listTools();

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('tool1');
      expect(tools[1].name).toBe('tool2');
    });

    it('should cache tools on subsequent calls', async () => {
      mockSdkListTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', inputSchema: { type: 'object' } }],
      });

      await client.listTools();
      await client.listTools();

      expect(mockSdkListTools).toHaveBeenCalledTimes(1);
    });

    it('should extract namespace from tool name', async () => {
      mockSdkListTools.mockResolvedValueOnce({
        tools: [
          { name: 'mcp__server__tool1', inputSchema: { type: 'object' } },
          { name: 'simple_tool', inputSchema: { type: 'object' } },
        ],
      });

      const tools = await client.listTools();

      expect(tools[0].namespace).toBe('server');
      expect(tools[1].namespace).toBeUndefined();
    });

    it('should throw when not connected', async () => {
      await client.disconnect();

      await expect(client.listTools()).rejects.toThrow();
    });

    it('should allow cache clearing', async () => {
      mockSdkListTools.mockResolvedValue({
        tools: [{ name: 'tool1', inputSchema: { type: 'object' } }],
      });

      await client.listTools();
      client.clearToolCache();
      await client.listTools();

      expect(mockSdkListTools).toHaveBeenCalledTimes(2);
    });
  });

  describe('executeTool', () => {
    const testRequest: ToolExecutionRequest = {
      name: 'test-tool',
      arguments: { param: 'value' },
    };

    beforeEach(async () => {
      await client.connect();
    });

    it('should execute tool via SDK', async () => {
      mockSdkCallTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'text', text: 'Result' }],
      });

      const result = await client.executeTool(testRequest);

      expect(mockSdkCallTool).toHaveBeenCalledWith({
        name: 'test-tool',
        arguments: { param: 'value' },
      });
      expect(result.isError).toBe(false);
    });

    it('should convert SDK response to ToolResult', async () => {
      mockSdkCallTool.mockResolvedValueOnce({
        isError: false,
        content: [
          { type: 'text', text: 'Text result' },
          { type: 'image', data: 'base64data', mimeType: 'image/png' },
        ],
      });

      const result = await client.executeTool(testRequest);

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Text result' });
      expect(result.content[1]).toEqual({ type: 'image', data: 'base64data', mimeType: 'image/png' });
    });

    it('should handle error responses', async () => {
      mockSdkCallTool.mockResolvedValueOnce({
        isError: true,
        content: [{ type: 'text', text: 'Error message' }],
      });

      const result = await client.executeTool(testRequest);

      expect(result.isError).toBe(true);
      expect(result.errorMessage).toBe('Error message');
    });

    it('should include duration in result', async () => {
      mockSdkCallTool.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { isError: false, content: [] };
      });

      const result = await client.executeTool(testRequest);

      // Duration should be at least somewhat close to the delay
      expect(result.duration).toBeGreaterThanOrEqual(15);
    });

    it('should include timestamp in result', async () => {
      mockSdkCallTool.mockResolvedValueOnce({ isError: false, content: [] });

      const before = Date.now();
      const result = await client.executeTool(testRequest);
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });

    it('should respect custom timeout', async () => {
      vi.useFakeTimers();

      mockSdkCallTool.mockImplementation(() => new Promise(() => {})); // Never resolves

      const promise = client.executeTool(testRequest, { timeout: 100 });

      vi.advanceTimersByTime(150);

      await expect(promise).rejects.toThrow();

      vi.useRealTimers();
    });

    it('should use default timeout from config', async () => {
      vi.useFakeTimers();

      mockSdkCallTool.mockImplementation(() => new Promise(() => {}));

      const promise = client.executeTool(testRequest);

      vi.advanceTimersByTime(6000); // > 5000ms default

      await expect(promise).rejects.toThrow();

      vi.useRealTimers();
    });

    it('should throw when not connected', async () => {
      await client.disconnect();

      await expect(client.executeTool(testRequest)).rejects.toThrow();
    });

    it('should retry on failure when enabled', async () => {
      mockSdkCallTool
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValueOnce({ isError: false, content: [] });

      const result = await client.executeTool(testRequest, { retry: true, maxRetries: 1 });

      expect(mockSdkCallTool).toHaveBeenCalledTimes(2);
      expect(result.isError).toBe(false);
    });

    it('should not retry when retry is disabled', async () => {
      mockSdkCallTool.mockRejectedValueOnce(new Error('Error'));

      await expect(client.executeTool(testRequest, { retry: false })).rejects.toThrow();

      expect(mockSdkCallTool).toHaveBeenCalledTimes(1);
    });
  });

  describe('tool call events', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should emit tool call event on start', async () => {
      mockSdkCallTool.mockResolvedValueOnce({ isError: false, content: [] });

      const events: ToolCallEventInternal[] = [];
      client.onToolCall((event) => events.push(event));

      await client.executeTool({ name: 'test', arguments: { a: 1 } });

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].toolName).toBe('test');
      expect(events[0].arguments).toEqual({ a: 1 });
    });

    it('should emit tool call event on completion', async () => {
      mockSdkCallTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'text', text: 'done' }],
      });

      const events: ToolCallEventInternal[] = [];
      client.onToolCall((event) => events.push(event));

      await client.executeTool({ name: 'test', arguments: {} });

      const completedEvent = events.find((e) => e.completedAt !== undefined);
      expect(completedEvent).toBeDefined();
      expect(completedEvent?.result?.isError).toBe(false);
    });

    it('should emit tool call event on error', async () => {
      mockSdkCallTool.mockRejectedValueOnce(new Error('Execution failed'));

      const events: ToolCallEventInternal[] = [];
      client.onToolCall((event) => events.push(event));

      try {
        await client.executeTool({ name: 'test', arguments: {} });
      } catch {
        // Expected
      }

      const errorEvent = events.find((e) => e.error !== undefined);
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.error?.message).toBe('Execution failed');
    });

    it('should allow unsubscribing from tool call events', async () => {
      mockSdkCallTool.mockResolvedValueOnce({ isError: false, content: [] });

      const events: ToolCallEventInternal[] = [];
      const unsubscribe = client.onToolCall((event) => events.push(event));
      unsubscribe();

      await client.executeTool({ name: 'test', arguments: {} });

      expect(events).toHaveLength(0);
    });
  });

  describe('connection state events', () => {
    it('should emit state change on connect', async () => {
      const states: ConnectionState[] = [];
      client.onConnectionStateChange((event) => {
        states.push(event.currentState);
      });

      await client.connect();

      expect(states).toContain('connecting');
      expect(states).toContain('connected');
    });

    it('should emit state change on disconnect', async () => {
      await client.connect();

      const states: ConnectionState[] = [];
      client.onConnectionStateChange((event) => {
        states.push(event.currentState);
      });

      await client.disconnect();

      expect(states).toContain('disconnected');
    });

    it('should allow unsubscribing from state events', async () => {
      const states: ConnectionState[] = [];
      const unsubscribe = client.onConnectionStateChange((event) => {
        states.push(event.currentState);
      });
      unsubscribe();

      await client.connect();

      expect(states).toHaveLength(0);
    });
  });

  describe('content conversion', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should convert text content', async () => {
      mockSdkCallTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'text', text: 'Hello world' }],
      });

      const result = await client.executeTool({ name: 'test', arguments: {} });

      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello world' });
    });

    it('should convert image content', async () => {
      mockSdkCallTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'image', data: 'abc123', mimeType: 'image/jpeg' }],
      });

      const result = await client.executeTool({ name: 'test', arguments: {} });

      expect(result.content[0]).toEqual({
        type: 'image',
        data: 'abc123',
        mimeType: 'image/jpeg',
      });
    });

    it('should convert resource content', async () => {
      mockSdkCallTool.mockResolvedValueOnce({
        isError: false,
        content: [{
          type: 'resource',
          resource: {
            uri: 'file:///test.txt',
            mimeType: 'text/plain',
            text: 'content',
          },
        }],
      });

      const result = await client.executeTool({ name: 'test', arguments: {} });

      expect(result.content[0]).toEqual({
        type: 'resource',
        resource: {
          uri: 'file:///test.txt',
          mimeType: 'text/plain',
          text: 'content',
          blob: undefined,
        },
      });
    });

    it('should convert unknown content to JSON text', async () => {
      mockSdkCallTool.mockResolvedValueOnce({
        isError: false,
        content: [{ unknownType: 'data' }],
      });

      const result = await client.executeTool({ name: 'test', arguments: {} });

      expect(result.content[0].type).toBe('text');
      expect((result.content[0] as { type: 'text'; text: string }).text).toBe('{"unknownType":"data"}');
    });

    it('should handle empty content array', async () => {
      mockSdkCallTool.mockResolvedValueOnce({
        isError: false,
        content: [],
      });

      const result = await client.executeTool({ name: 'test', arguments: {} });

      expect(result.content).toHaveLength(0);
    });
  });

  describe('error wrapping', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should wrap SDK errors with proper code', async () => {
      mockSdkCallTool.mockRejectedValueOnce(new Error('SDK error'));

      try {
        await client.executeTool({ name: 'test', arguments: {} });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as { code: McpErrorCode }).code).toBe(McpErrorCode.EXECUTION_FAILED);
      }
    });

    it('should preserve MCP transport errors', async () => {
      const mcpError = new Error('Transport error') as Error & { code: McpErrorCode };
      mcpError.code = McpErrorCode.DISCONNECTED;
      mockSdkCallTool.mockRejectedValueOnce(mcpError);

      try {
        await client.executeTool({ name: 'test', arguments: {} });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as { code: McpErrorCode }).code).toBe(McpErrorCode.DISCONNECTED);
      }
    });
  });
});
