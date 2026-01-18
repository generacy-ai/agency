/**
 * Firebase Emulator Tools Tests
 *
 * Tests for emulators-start, emulators-stop, and emulators-status tools.
 * Uses mocked ProcessManager to avoid spawning actual processes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEmulatorsStartTool } from '../tools/emulators-start.js';
import { createEmulatorsStopTool } from '../tools/emulators-stop.js';
import { createEmulatorsStatusTool } from '../tools/emulators-status.js';
import type { ProcessHandle, EmulatorInfo } from '../process/types.js';
import type { ProcessManager } from '../process/manager.js';
import type { FirebasePluginConfig, EmulatorType } from '../config/types.js';
import { MOCK_ERRORS } from './mocks/firebase-cli.js';

/**
 * Create a mock ProcessManager
 */
function createMockProcessManager(): {
  manager: ProcessManager;
  mocks: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    getEmulatorInfo: ReturnType<typeof vi.fn>;
    getRunningProcesses: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
    getOutput: ReturnType<typeof vi.fn>;
  };
} {
  const mocks = {
    start: vi.fn(),
    stop: vi.fn(),
    status: vi.fn(),
    getEmulatorInfo: vi.fn(),
    getRunningProcesses: vi.fn(),
    cleanup: vi.fn(),
    getOutput: vi.fn(),
  };

  const manager = {
    start: mocks.start,
    stop: mocks.stop,
    status: mocks.status,
    getEmulatorInfo: mocks.getEmulatorInfo,
    getRunningProcesses: mocks.getRunningProcesses,
    cleanup: mocks.cleanup,
    getOutput: mocks.getOutput,
  } as unknown as ProcessManager;

  return { manager, mocks };
}

/**
 * Create a mock ProcessHandle
 */
function createMockHandle(overrides: Partial<ProcessHandle> = {}): ProcessHandle {
  return {
    pid: 1,
    startedAt: new Date(),
    command: 'firebase',
    args: ['emulators:start'],
    status: 'running',
    ...overrides,
  };
}

/**
 * Default test config
 */
const defaultConfig: FirebasePluginConfig = {
  cleanup: 'session',
  project: 'test-project',
  emulators: {
    only: ['auth', 'firestore', 'functions'],
  },
};

describe('Emulators Start Tool', () => {
  let mockManager: ReturnType<typeof createMockProcessManager>;

  beforeEach(() => {
    mockManager = createMockProcessManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('execute()', () => {
    it('should start emulators with default configuration', async () => {
      const handle = createMockHandle();
      mockManager.mocks.start.mockResolvedValue(handle);
      mockManager.mocks.getEmulatorInfo.mockImplementation(
        (_h: ProcessHandle, type: EmulatorType): EmulatorInfo | undefined => ({
          port: type === 'auth' ? 9099 : type === 'firestore' ? 8080 : 5001,
          url: `http://localhost:${type === 'auth' ? 9099 : type === 'firestore' ? 8080 : 5001}`,
          ready: true,
        })
      );

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      const result = await tool.execute({});

      expect(mockManager.mocks.start).toHaveBeenCalledOnce();
      expect(mockManager.mocks.start).toHaveBeenCalledWith(
        'firebase',
        expect.arrayContaining(['emulators:start', '--only', 'auth,firestore,functions', '--project', 'test-project']),
        expect.objectContaining({
          readyPattern: expect.any(RegExp),
          cleanup: 'session',
        })
      );
      expect(result.isError).toBe(false);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('Emulators started'),
      });
    });

    it('should use only parameter to start specific emulators', async () => {
      const handle = createMockHandle();
      mockManager.mocks.start.mockResolvedValue(handle);
      mockManager.mocks.getEmulatorInfo.mockReturnValue({
        port: 8080,
        url: 'http://localhost:8080',
        ready: true,
      });

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      await tool.execute({ only: ['firestore'] });

      expect(mockManager.mocks.start).toHaveBeenCalledWith(
        'firebase',
        expect.arrayContaining(['emulators:start', '--only', 'firestore']),
        expect.any(Object)
      );
    });

    it('should include import flag when import path is provided', async () => {
      const handle = createMockHandle();
      mockManager.mocks.start.mockResolvedValue(handle);
      mockManager.mocks.getEmulatorInfo.mockReturnValue(undefined);

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      await tool.execute({ import: './data/emulator-backup' });

      expect(mockManager.mocks.start).toHaveBeenCalledWith(
        'firebase',
        expect.arrayContaining(['--import', './data/emulator-backup']),
        expect.any(Object)
      );
    });

    it('should include export flag when export path is provided', async () => {
      const handle = createMockHandle();
      mockManager.mocks.start.mockResolvedValue(handle);
      mockManager.mocks.getEmulatorInfo.mockReturnValue(undefined);

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      await tool.execute({ export: './data/emulator-export' });

      expect(mockManager.mocks.start).toHaveBeenCalledWith(
        'firebase',
        expect.arrayContaining(['--export-on-exit', './data/emulator-export']),
        expect.any(Object)
      );
    });

    it('should override project from parameters', async () => {
      const handle = createMockHandle();
      mockManager.mocks.start.mockResolvedValue(handle);
      mockManager.mocks.getEmulatorInfo.mockReturnValue(undefined);

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      await tool.execute({ project: 'override-project' });

      expect(mockManager.mocks.start).toHaveBeenCalledWith(
        'firebase',
        expect.arrayContaining(['--project', 'override-project']),
        expect.any(Object)
      );
    });

    it('should return emulator URLs on success', async () => {
      const handle = createMockHandle();
      mockManager.mocks.start.mockResolvedValue(handle);
      mockManager.mocks.getEmulatorInfo.mockImplementation(
        (_h: ProcessHandle, type: EmulatorType): EmulatorInfo | undefined => {
          const ports: Record<EmulatorType, number> = {
            auth: 9099,
            firestore: 8080,
            database: 9000,
            functions: 5001,
            hosting: 5000,
            pubsub: 8085,
            storage: 9199,
          };
          return {
            port: ports[type],
            url: `http://localhost:${ports[type]}`,
            ready: true,
          };
        }
      );

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      const result = await tool.execute({});

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('auth: http://localhost:9099');
      expect(textContent.text).toContain('firestore: http://localhost:8080');
      expect(textContent.text).toContain('functions: http://localhost:5001');
    });

    it('should return error when process manager fails to start', async () => {
      mockManager.mocks.start.mockRejectedValue(new Error('Port 8080 is already in use'));

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('Port 8080 is already in use'),
      });
    });

    it('should handle timeout errors gracefully', async () => {
      mockManager.mocks.start.mockRejectedValue(
        new Error('Process did not become ready within 60000ms')
      );

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('Process did not become ready');
    });
  });

  describe('tool metadata', () => {
    it('should have correct tool name and namespace', () => {
      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);

      expect(tool.name).toBe('run.firebase_emulators_start');
      expect(tool.namespace).toBe('run');
      expect(tool.outputPattern).toBe('terse');
    });

    it('should define correct input schema', () => {
      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);

      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.properties).toHaveProperty('only');
      expect(tool.inputSchema.properties).toHaveProperty('import');
      expect(tool.inputSchema.properties).toHaveProperty('export');
      expect(tool.inputSchema.properties).toHaveProperty('project');
    });
  });
});

describe('Emulators Stop Tool', () => {
  let mockManager: ReturnType<typeof createMockProcessManager>;

  beforeEach(() => {
    mockManager = createMockProcessManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('execute()', () => {
    it('should stop all running emulator processes', async () => {
      const handle1 = createMockHandle({ pid: 1 });
      const handle2 = createMockHandle({ pid: 2 });
      mockManager.mocks.getRunningProcesses.mockReturnValue([handle1, handle2]);
      mockManager.mocks.stop.mockResolvedValue(undefined);

      const tool = createEmulatorsStopTool(mockManager.manager);
      const result = await tool.execute({});

      expect(mockManager.mocks.getRunningProcesses).toHaveBeenCalledOnce();
      expect(mockManager.mocks.stop).toHaveBeenCalledTimes(2);
      expect(mockManager.mocks.stop).toHaveBeenCalledWith(handle1, undefined);
      expect(mockManager.mocks.stop).toHaveBeenCalledWith(handle2, undefined);
      expect(result.isError).toBe(false);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('Emulators stopped'),
      });
    });

    it('should return success when no emulators are running', async () => {
      mockManager.mocks.getRunningProcesses.mockReturnValue([]);

      const tool = createEmulatorsStopTool(mockManager.manager);
      const result = await tool.execute({});

      expect(mockManager.mocks.stop).not.toHaveBeenCalled();
      expect(result.isError).toBe(false);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('No emulators running'),
      });
    });

    it('should force stop when force parameter is true', async () => {
      const handle = createMockHandle();
      mockManager.mocks.getRunningProcesses.mockReturnValue([handle]);
      mockManager.mocks.stop.mockResolvedValue(undefined);

      const tool = createEmulatorsStopTool(mockManager.manager);
      await tool.execute({ force: true });

      expect(mockManager.mocks.stop).toHaveBeenCalledWith(handle, true);
    });

    it('should use graceful shutdown by default', async () => {
      const handle = createMockHandle();
      mockManager.mocks.getRunningProcesses.mockReturnValue([handle]);
      mockManager.mocks.stop.mockResolvedValue(undefined);

      const tool = createEmulatorsStopTool(mockManager.manager);
      await tool.execute({});

      expect(mockManager.mocks.stop).toHaveBeenCalledWith(handle, undefined);
    });

    it('should handle errors during stop gracefully', async () => {
      const handle = createMockHandle();
      mockManager.mocks.getRunningProcesses.mockReturnValue([handle]);
      mockManager.mocks.stop.mockRejectedValue(new Error('Failed to stop process'));

      const tool = createEmulatorsStopTool(mockManager.manager);
      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('Failed to stop process'),
      });
    });
  });

  describe('tool metadata', () => {
    it('should have correct tool name and namespace', () => {
      const tool = createEmulatorsStopTool(mockManager.manager);

      expect(tool.name).toBe('run.firebase_emulators_stop');
      expect(tool.namespace).toBe('run');
      expect(tool.outputPattern).toBe('terse');
    });

    it('should define correct input schema', () => {
      const tool = createEmulatorsStopTool(mockManager.manager);

      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.properties).toHaveProperty('force');
    });
  });
});

describe('Emulators Status Tool', () => {
  let mockManager: ReturnType<typeof createMockProcessManager>;

  beforeEach(() => {
    mockManager = createMockProcessManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('execute()', () => {
    it('should return status for running emulators', async () => {
      const handle = createMockHandle();
      mockManager.mocks.getRunningProcesses.mockReturnValue([handle]);
      mockManager.mocks.getEmulatorInfo.mockImplementation(
        (_h: ProcessHandle, type: EmulatorType): EmulatorInfo | undefined => {
          if (['auth', 'firestore', 'functions'].includes(type)) {
            const ports: Record<EmulatorType, number> = {
              auth: 9099,
              firestore: 8080,
              functions: 5001,
              database: 9000,
              hosting: 5000,
              pubsub: 8085,
              storage: 9199,
            };
            return {
              port: ports[type],
              url: `http://localhost:${ports[type]}`,
              ready: true,
            };
          }
          return undefined;
        }
      );

      const tool = createEmulatorsStatusTool(mockManager.manager);
      const result = await tool.execute({});

      expect(result.isError).toBe(false);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('Emulators running');
      expect(textContent.text).toContain('auth (localhost:9099)');
      expect(textContent.text).toContain('firestore (localhost:8080)');
      expect(textContent.text).toContain('functions (localhost:5001)');
    });

    it('should return not running when no emulators are active', async () => {
      mockManager.mocks.getRunningProcesses.mockReturnValue([]);

      const tool = createEmulatorsStatusTool(mockManager.manager);
      const result = await tool.execute({});

      expect(result.isError).toBe(false);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('Emulators not running'),
      });
    });

    it('should only show ready emulators', async () => {
      const handle = createMockHandle();
      mockManager.mocks.getRunningProcesses.mockReturnValue([handle]);
      mockManager.mocks.getEmulatorInfo.mockImplementation(
        (_h: ProcessHandle, type: EmulatorType): EmulatorInfo | undefined => {
          if (type === 'auth') {
            return { port: 9099, url: 'http://localhost:9099', ready: true };
          }
          if (type === 'firestore') {
            return { port: 8080, url: 'http://localhost:8080', ready: false };
          }
          return undefined;
        }
      );

      const tool = createEmulatorsStatusTool(mockManager.manager);
      const result = await tool.execute({});

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('auth (localhost:9099)');
      expect(textContent.text).not.toContain('firestore');
    });

    it('should handle errors gracefully', async () => {
      mockManager.mocks.getRunningProcesses.mockImplementation(() => {
        throw new Error('Internal error');
      });

      const tool = createEmulatorsStatusTool(mockManager.manager);
      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('Internal error'),
      });
    });
  });

  describe('tool metadata', () => {
    it('should have correct tool name and namespace', () => {
      const tool = createEmulatorsStatusTool(mockManager.manager);

      expect(tool.name).toBe('run.firebase_emulators_status');
      expect(tool.namespace).toBe('run');
      expect(tool.outputPattern).toBe('terse');
    });

    it('should have empty input schema', () => {
      const tool = createEmulatorsStatusTool(mockManager.manager);

      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.properties).toEqual({});
    });
  });
});

describe('Emulator Lifecycle Integration', () => {
  let mockManager: ReturnType<typeof createMockProcessManager>;
  let runningProcesses: ProcessHandle[];

  beforeEach(() => {
    mockManager = createMockProcessManager();
    runningProcesses = [];

    // Simulate stateful process manager behavior
    mockManager.mocks.start.mockImplementation(async () => {
      const handle = createMockHandle({
        pid: runningProcesses.length + 1,
        status: 'running',
      });
      runningProcesses.push(handle);
      return handle;
    });

    mockManager.mocks.stop.mockImplementation(async (handle: ProcessHandle) => {
      const index = runningProcesses.findIndex((p) => p.pid === handle.pid);
      if (index !== -1) {
        runningProcesses.splice(index, 1);
      }
    });

    mockManager.mocks.getRunningProcesses.mockImplementation(() => [...runningProcesses]);

    mockManager.mocks.getEmulatorInfo.mockImplementation(
      (_h: ProcessHandle, type: EmulatorType): EmulatorInfo | undefined => {
        const ports: Record<EmulatorType, number> = {
          auth: 9099,
          firestore: 8080,
          database: 9000,
          functions: 5001,
          hosting: 5000,
          pubsub: 8085,
          storage: 9199,
        };
        return {
          port: ports[type],
          url: `http://localhost:${ports[type]}`,
          ready: true,
        };
      }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should complete start -> status -> stop lifecycle', async () => {
    const startTool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
    const statusTool = createEmulatorsStatusTool(mockManager.manager);
    const stopTool = createEmulatorsStopTool(mockManager.manager);

    // Step 1: Start emulators
    const startResult = await startTool.execute({});
    expect(startResult.isError).toBe(false);
    expect(runningProcesses.length).toBe(1);

    // Step 2: Check status
    const statusResult = await statusTool.execute({});
    expect(statusResult.isError).toBe(false);
    const statusText = (statusResult.content[0] as { type: string; text: string }).text;
    expect(statusText).toContain('Emulators running');

    // Step 3: Stop emulators
    const stopResult = await stopTool.execute({});
    expect(stopResult.isError).toBe(false);
    expect(runningProcesses.length).toBe(0);

    // Step 4: Verify status after stop
    const statusAfterStop = await statusTool.execute({});
    const statusAfterText = (statusAfterStop.content[0] as { type: string; text: string }).text;
    expect(statusAfterText).toContain('Emulators not running');
  });

  it('should handle multiple start attempts correctly', async () => {
    const startTool = createEmulatorsStartTool(mockManager.manager, defaultConfig);

    // First start should succeed
    const firstStart = await startTool.execute({});
    expect(firstStart.isError).toBe(false);

    // Second start should also work (creates another process)
    const secondStart = await startTool.execute({});
    expect(secondStart.isError).toBe(false);
    expect(runningProcesses.length).toBe(2);
  });
});

describe('Error Scenarios', () => {
  let mockManager: ReturnType<typeof createMockProcessManager>;

  beforeEach(() => {
    mockManager = createMockProcessManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Port Conflict Errors', () => {
    it('should return error when port is already in use', async () => {
      mockManager.mocks.start.mockRejectedValue(
        new Error(MOCK_ERRORS['portInUse']!.stderr)
      );

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('Port 8080 is already in use');
    });
  });

  describe('Authentication Errors', () => {
    it('should return error when not authenticated', async () => {
      mockManager.mocks.start.mockRejectedValue(
        new Error(MOCK_ERRORS['notAuthenticated']!.stderr)
      );

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('Not authenticated');
    });
  });

  describe('Configuration Errors', () => {
    it('should return error when firebase.json is missing', async () => {
      mockManager.mocks.start.mockRejectedValue(
        new Error(MOCK_ERRORS['configNotFound']!.stderr)
      );

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('firebase.json not found');
    });
  });

  describe('Project Errors', () => {
    it('should return error when project does not exist', async () => {
      mockManager.mocks.start.mockRejectedValue(
        new Error(MOCK_ERRORS['projectNotFound']!.stderr)
      );

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      const result = await tool.execute({ project: 'unknown-project' });

      expect(result.isError).toBe(true);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('does not exist');
    });
  });

  describe('Network Errors', () => {
    it('should return error on network failure', async () => {
      mockManager.mocks.start.mockRejectedValue(
        new Error(MOCK_ERRORS['networkError']!.stderr)
      );

      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('Network error');
    });
  });

  describe('Invalid Parameter Errors', () => {
    it('should return error for invalid emulator type', async () => {
      const tool = createEmulatorsStartTool(mockManager.manager, defaultConfig);
      const result = await tool.execute({ only: ['invalid-emulator'] });

      expect(result.isError).toBe(true);
    });
  });
});
