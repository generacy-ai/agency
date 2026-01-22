import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DockerExecTransport } from '../../mcp/DockerExecTransport';
import { McpErrorCode, type DockerExecConfig, type ConnectionState } from '../../mcp/types';
import type { ExecaChildProcess } from 'execa';

// Mock execa
const mockStdin = {
  write: vi.fn(),
  end: vi.fn(),
  writable: true,
};

const mockStdout = {
  on: vi.fn(),
};

const mockStderr = {
  on: vi.fn(),
};

const mockProcess = {
  stdin: mockStdin,
  stdout: mockStdout,
  stderr: mockStderr,
  on: vi.fn(),
  killed: false,
  kill: vi.fn(),
} as unknown as ExecaChildProcess;

vi.mock('execa', () => ({
  execa: vi.fn(() => mockProcess),
}));

describe('DockerExecTransport', () => {
  let transport: DockerExecTransport;
  let config: DockerExecConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock process state
    mockProcess.killed = false;
    mockStdin.writable = true;
    mockStdin.write.mockImplementation((_data, callback) => {
      if (callback) callback();
    });

    config = {
      containerId: 'test-container',
      command: ['node', 'server.js'],
      workDir: '/app',
      connectionTimeout: 1000,
      maxReconnectAttempts: 2,
      reconnectDelay: 100,
    };

    transport = new DockerExecTransport(config);
  });

  afterEach(async () => {
    try {
      await transport.stop();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(transport.getState()).toBe('disconnected');
    });

    it('should use default values for optional config', () => {
      const minimalConfig: DockerExecConfig = {
        containerId: 'container',
        command: ['cmd'],
      };
      const minimalTransport = new DockerExecTransport(minimalConfig);
      expect(minimalTransport.getState()).toBe('disconnected');
    });
  });

  describe('start', () => {
    it('should transition to connecting then connected state', async () => {
      const stateChanges: ConnectionState[] = [];
      transport.onStateChange((event) => {
        stateChanges.push(event.currentState);
      });

      await transport.start();

      expect(stateChanges).toContain('connecting');
      expect(stateChanges).toContain('connected');
      expect(transport.getState()).toBe('connected');
    });

    it('should not start if already connected', async () => {
      await transport.start();
      const execa = await import('execa');
      vi.mocked(execa.execa).mockClear();

      await transport.start();

      expect(execa.execa).not.toHaveBeenCalled();
    });

    it('should call execa with correct docker args', async () => {
      await transport.start();

      const execa = await import('execa');
      expect(execa.execa).toHaveBeenCalledWith(
        'docker',
        ['exec', '-i', '-w', '/app', 'test-container', 'node', 'server.js'],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'pipe'],
          buffer: false,
        })
      );
    });

    it('should include environment variables in docker args', async () => {
      const envConfig: DockerExecConfig = {
        ...config,
        env: { NODE_ENV: 'test', DEBUG: 'true' },
      };
      const envTransport = new DockerExecTransport(envConfig);

      await envTransport.start();

      const execa = await import('execa');
      expect(execa.execa).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['-e', 'NODE_ENV=test', '-e', 'DEBUG=true']),
        expect.any(Object)
      );
    });
  });

  describe('stop', () => {
    it('should transition to disconnected state', async () => {
      await transport.start();

      await transport.stop();

      expect(transport.getState()).toBe('disconnected');
    });

    it('should close stdin', async () => {
      await transport.start();

      await transport.stop();

      expect(mockStdin.end).toHaveBeenCalled();
    });

    it('should handle stop when not connected', async () => {
      await expect(transport.stop()).resolves.not.toThrow();
    });
  });

  describe('send', () => {
    it('should send JSON message with newline', async () => {
      await transport.start();
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      await transport.send(message);

      expect(mockStdin.write).toHaveBeenCalledWith(
        JSON.stringify(message) + '\n',
        expect.any(Function)
      );
    });

    it('should throw when not connected', async () => {
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      await expect(transport.send(message)).rejects.toThrow();
    });

    it('should propagate write errors', async () => {
      await transport.start();
      const writeError = new Error('Write failed');
      mockStdin.write.mockImplementationOnce((_data, callback) => {
        if (callback) callback(writeError);
      });

      await expect(transport.send({ test: true })).rejects.toThrow();
    });
  });

  describe('message handling', () => {
    it('should parse and emit JSON messages', async () => {
      await transport.start();

      const messages: unknown[] = [];
      transport.onMessage((event) => {
        messages.push(event.data);
      });

      // Simulate stdout data
      const dataHandler = mockStdout.on.mock.calls.find((call) => call[0] === 'data')?.[1];
      expect(dataHandler).toBeDefined();

      const message = { jsonrpc: '2.0', result: 'test', id: 1 };
      dataHandler(Buffer.from(JSON.stringify(message) + '\n'));

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
    });

    it('should handle multiple messages in single chunk', async () => {
      await transport.start();

      const messages: unknown[] = [];
      transport.onMessage((event) => {
        messages.push(event.data);
      });

      const dataHandler = mockStdout.on.mock.calls.find((call) => call[0] === 'data')?.[1];
      const msg1 = { id: 1 };
      const msg2 = { id: 2 };
      dataHandler(Buffer.from(JSON.stringify(msg1) + '\n' + JSON.stringify(msg2) + '\n'));

      expect(messages).toHaveLength(2);
    });

    it('should handle message split across chunks', async () => {
      await transport.start();

      const messages: unknown[] = [];
      transport.onMessage((event) => {
        messages.push(event.data);
      });

      const dataHandler = mockStdout.on.mock.calls.find((call) => call[0] === 'data')?.[1];
      const message = { jsonrpc: '2.0', result: 'test' };
      const json = JSON.stringify(message);

      // Split message across two chunks
      dataHandler(Buffer.from(json.slice(0, 10)));
      expect(messages).toHaveLength(0);

      dataHandler(Buffer.from(json.slice(10) + '\n'));
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
    });

    it('should emit error for invalid JSON', async () => {
      await transport.start();

      const errors: Error[] = [];
      transport.onError((error) => {
        errors.push(error);
      });

      const dataHandler = mockStdout.on.mock.calls.find((call) => call[0] === 'data')?.[1];
      dataHandler(Buffer.from('not valid json\n'));

      expect(errors).toHaveLength(1);
      expect((errors[0] as unknown as { code: McpErrorCode }).code).toBe(McpErrorCode.INVALID_RESPONSE);
    });
  });

  describe('state change events', () => {
    it('should notify listeners of state changes', async () => {
      const events: { previous: ConnectionState; current: ConnectionState }[] = [];
      transport.onStateChange((event) => {
        events.push({
          previous: event.previousState,
          current: event.currentState,
        });
      });

      await transport.start();
      await transport.stop();

      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events[0]).toEqual({ previous: 'disconnected', current: 'connecting' });
    });

    it('should include timestamp in state change events', async () => {
      let eventTimestamp = 0;
      transport.onStateChange((event) => {
        eventTimestamp = event.timestamp;
      });

      const before = Date.now();
      await transport.start();
      const after = Date.now();

      expect(eventTimestamp).toBeGreaterThanOrEqual(before);
      expect(eventTimestamp).toBeLessThanOrEqual(after);
    });

    it('should allow unsubscribing from state changes', async () => {
      const events: ConnectionState[] = [];
      const unsubscribe = transport.onStateChange((event) => {
        events.push(event.currentState);
      });

      unsubscribe();
      await transport.start();

      expect(events).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should emit errors to listeners', async () => {
      await transport.start();

      const errors: Error[] = [];
      transport.onError((error) => {
        errors.push(error);
      });

      // Simulate process error
      const errorHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      expect(errorHandler).toBeDefined();
      errorHandler(new Error('Process error'));

      expect(errors).toHaveLength(1);
      expect((errors[0] as unknown as { code: McpErrorCode }).code).toBe(McpErrorCode.DOCKER_ERROR);
    });

    it('should allow unsubscribing from errors', async () => {
      await transport.start();

      const errors: Error[] = [];
      const unsubscribe = transport.onError((error) => {
        errors.push(error);
      });

      unsubscribe();

      const errorHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      errorHandler(new Error('Process error'));

      expect(errors).toHaveLength(0);
    });
  });

  describe('process exit handling', () => {
    it('should emit disconnected error on unexpected exit', async () => {
      await transport.start();

      const errors: Error[] = [];
      transport.onError((error) => {
        errors.push(error);
      });

      // Simulate process exit
      const exitHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'exit')?.[1];
      expect(exitHandler).toBeDefined();
      exitHandler(1, null);

      expect(errors).toHaveLength(1);
      expect((errors[0] as unknown as { code: McpErrorCode }).code).toBe(McpErrorCode.DISCONNECTED);
    });
  });

  describe('multiple listeners', () => {
    it('should support multiple message listeners', async () => {
      await transport.start();

      const messages1: unknown[] = [];
      const messages2: unknown[] = [];

      transport.onMessage((event) => messages1.push(event.data));
      transport.onMessage((event) => messages2.push(event.data));

      const dataHandler = mockStdout.on.mock.calls.find((call) => call[0] === 'data')?.[1];
      dataHandler(Buffer.from('{"test":true}\n'));

      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(1);
    });

    it('should continue notifying other listeners if one throws', async () => {
      await transport.start();

      const messages: unknown[] = [];
      transport.onMessage(() => {
        throw new Error('Listener error');
      });
      transport.onMessage((event) => messages.push(event.data));

      const dataHandler = mockStdout.on.mock.calls.find((call) => call[0] === 'data')?.[1];

      // Should not throw
      expect(() => dataHandler(Buffer.from('{"test":true}\n'))).not.toThrow();
      expect(messages).toHaveLength(1);
    });
  });
});
