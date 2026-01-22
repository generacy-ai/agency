import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';

// Mock execa
const mockExeca = vi.fn();
vi.mock('execa', () => ({
  execa: (...args: unknown[]) => mockExeca(...args),
}));

// Mock vscode
const mockExtension = {
  isActive: true,
  exports: {},
  activate: vi.fn().mockResolvedValue({}),
};

vi.mock('vscode', () => ({
  extensions: {
    getExtension: vi.fn(() => mockExtension),
  },
  env: {
    remoteName: undefined,
    machineId: 'test-machine-id',
  },
  commands: {
    executeCommand: vi.fn().mockResolvedValue(undefined),
  },
}));

// Import after mocking
import { ContainerService } from '../../services/ContainerService';

describe('ContainerService', () => {
  let service: ContainerService;
  let mockVscode: typeof vscode;

  beforeEach(async () => {
    vi.clearAllMocks();
    ContainerService.reset();

    // Get fresh mocked vscode
    mockVscode = await import('vscode');

    // Setup default mock for docker ps
    mockExeca.mockResolvedValue({
      stdout: '',
      stderr: '',
    });

    service = ContainerService.getInstance();
  });

  afterEach(() => {
    ContainerService.reset();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ContainerService.getInstance();
      const instance2 = ContainerService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = ContainerService.getInstance();
      ContainerService.reset();
      const instance2 = ContainerService.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await service.initialize(mockVscode);
      expect(service.isInitialized()).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      await service.initialize(mockVscode);
      await service.initialize(mockVscode);
      expect(service.isInitialized()).toBe(true);
    });

    it('should try to get Remote Containers extension', async () => {
      await service.initialize(mockVscode);
      expect(mockVscode.extensions.getExtension).toHaveBeenCalledWith(
        'ms-vscode-remote.remote-containers'
      );
    });
  });

  describe('listContainers', () => {
    beforeEach(async () => {
      await service.initialize(mockVscode);
    });

    it('should return empty array when no containers', async () => {
      mockExeca.mockResolvedValue({
        stdout: '',
        stderr: '',
      });

      const containers = await service.listContainers();
      expect(containers).toEqual([]);
    });

    it('should parse container list from docker ps', async () => {
      const containerJson = JSON.stringify({
        Id: 'abc123def456',
        Names: ['/test-container'],
        Image: 'node:20',
        State: 'running',
        Status: 'Up 2 hours',
        Created: Math.floor(Date.now() / 1000),
        Ports: [{ PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' }],
        Labels: {},
        Mounts: [],
      });

      // Mock docker ps
      mockExeca.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'ps') {
          return Promise.resolve({ stdout: containerJson, stderr: '' });
        }
        if (cmd === 'docker' && args[0] === 'inspect') {
          return Promise.resolve({
            stdout: JSON.stringify([{
              Id: 'abc123def456',
              Name: '/test-container',
              State: {
                Status: 'running',
                Running: true,
                Paused: false,
                Restarting: false,
                Dead: false,
                StartedAt: new Date().toISOString(),
              },
              Config: {
                Image: 'node:20',
                Labels: {},
              },
              NetworkSettings: {
                Ports: {
                  '3000/tcp': [{ HostIp: '0.0.0.0', HostPort: '3000' }],
                },
              },
              Mounts: [],
              Created: new Date().toISOString(),
            }]),
            stderr: '',
          });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const containers = await service.listContainers();
      expect(containers.length).toBe(1);
      expect(containers[0].name).toBe('test-container');
      expect(containers[0].status).toBe('running');
    });

    it('should detect dev containers by labels', async () => {
      const containerJson = JSON.stringify({
        Id: 'dev123container',
        Names: ['/vsc-project-abc123'],
        Image: 'mcr.microsoft.com/devcontainers/typescript-node:20',
        State: 'running',
        Status: 'Up 1 hour',
        Created: Math.floor(Date.now() / 1000),
        Ports: [],
        Labels: {
          'devcontainer.metadata': '{}',
          'devcontainer.local_folder': '/home/user/project',
        },
        Mounts: [
          { Type: 'bind', Source: '/home/user/project', Destination: '/workspaces/project' },
        ],
      });

      mockExeca.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'ps') {
          return Promise.resolve({ stdout: containerJson, stderr: '' });
        }
        if (cmd === 'docker' && args[0] === 'inspect') {
          return Promise.resolve({
            stdout: JSON.stringify([{
              Id: 'dev123container',
              Name: '/vsc-project-abc123',
              State: {
                Status: 'running',
                Running: true,
                Paused: false,
                Restarting: false,
                Dead: false,
                StartedAt: new Date().toISOString(),
              },
              Config: {
                Image: 'mcr.microsoft.com/devcontainers/typescript-node:20',
                Labels: {
                  'devcontainer.metadata': '{}',
                  'devcontainer.local_folder': '/home/user/project',
                },
              },
              NetworkSettings: { Ports: {} },
              Mounts: [
                { Type: 'bind', Source: '/home/user/project', Destination: '/workspaces/project' },
              ],
              Created: new Date().toISOString(),
            }]),
            stderr: '',
          });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const containers = await service.listContainers();
      expect(containers.length).toBe(1);
      expect(containers[0].isDevContainer).toBe(true);
      expect(containers[0].workspacePath).toBe('/home/user/project');
    });

    it('should use cache on subsequent calls', async () => {
      mockExeca.mockResolvedValue({ stdout: '', stderr: '' });

      await service.listContainers();
      await service.listContainers();

      // docker ps should only be called once due to caching
      const psCalls = mockExeca.mock.calls.filter(
        (call) => call[0] === 'docker' && call[1][0] === 'ps'
      );
      expect(psCalls.length).toBe(1);
    });

    it('should bypass cache with forceRefresh', async () => {
      mockExeca.mockResolvedValue({ stdout: '', stderr: '' });

      await service.listContainers();
      await service.listContainers(true);

      // docker ps should be called twice
      const psCalls = mockExeca.mock.calls.filter(
        (call) => call[0] === 'docker' && call[1][0] === 'ps'
      );
      expect(psCalls.length).toBe(2);
    });
  });

  describe('getContainer', () => {
    beforeEach(async () => {
      await service.initialize(mockVscode);
    });

    it('should return container info by id', async () => {
      mockExeca.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'inspect') {
          return Promise.resolve({
            stdout: JSON.stringify([{
              Id: 'abc123def456789',
              Name: '/test-container',
              State: {
                Status: 'running',
                Running: true,
                Paused: false,
                Restarting: false,
                Dead: false,
                StartedAt: new Date().toISOString(),
              },
              Config: {
                Image: 'node:20',
                Labels: {},
              },
              NetworkSettings: { Ports: {} },
              Mounts: [],
              Created: new Date().toISOString(),
            }]),
            stderr: '',
          });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const container = await service.getContainer('abc123def456');
      expect(container).toBeDefined();
      expect(container?.name).toBe('test-container');
    });

    it('should return undefined for non-existent container', async () => {
      mockExeca.mockRejectedValue(new Error('No such container'));

      const container = await service.getContainer('nonexistent');
      expect(container).toBeUndefined();
    });
  });

  describe('getContainerStatus', () => {
    beforeEach(async () => {
      await service.initialize(mockVscode);
    });

    it('should return container status', async () => {
      mockExeca.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'inspect') {
          return Promise.resolve({
            stdout: JSON.stringify([{
              Id: 'abc123',
              Name: '/test',
              State: {
                Status: 'running',
                Running: true,
                Paused: false,
                Restarting: false,
                Dead: false,
                StartedAt: new Date().toISOString(),
              },
              Config: { Image: 'node:20', Labels: {} },
              NetworkSettings: { Ports: {} },
              Mounts: [],
              Created: new Date().toISOString(),
            }]),
            stderr: '',
          });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const status = await service.getContainerStatus('abc123');
      expect(status).toBe('running');
    });

    it('should return unknown for non-existent container', async () => {
      mockExeca.mockRejectedValue(new Error('No such container'));

      const status = await service.getContainerStatus('nonexistent');
      expect(status).toBe('unknown');
    });
  });

  describe('startContainer', () => {
    beforeEach(async () => {
      await service.initialize(mockVscode);
    });

    it('should start a container successfully', async () => {
      mockExeca.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'start') {
          return Promise.resolve({ stdout: 'abc123', stderr: '' });
        }
        if (cmd === 'docker' && args[0] === 'inspect') {
          return Promise.resolve({
            stdout: JSON.stringify([{
              Id: 'abc123',
              Name: '/test',
              State: {
                Status: 'running',
                Running: true,
                Paused: false,
                Restarting: false,
                Dead: false,
                StartedAt: new Date().toISOString(),
              },
              Config: { Image: 'node:20', Labels: {} },
              NetworkSettings: { Ports: {} },
              Mounts: [],
              Created: new Date().toISOString(),
            }]),
            stderr: '',
          });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const result = await service.startContainer('abc123');
      expect(result.success).toBe(true);
      expect(result.action).toBe('start');
    });

    it('should handle start failure', async () => {
      mockExeca.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'start') {
          return Promise.reject(new Error('Cannot start container'));
        }
        if (cmd === 'docker' && args[0] === 'inspect') {
          return Promise.resolve({
            stdout: JSON.stringify([{
              Id: 'abc123',
              Name: '/test',
              State: { Status: 'exited', Running: false, Paused: false, Restarting: false, Dead: false, StartedAt: '' },
              Config: { Image: 'node:20', Labels: {} },
              NetworkSettings: { Ports: {} },
              Mounts: [],
              Created: new Date().toISOString(),
            }]),
            stderr: '',
          });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const result = await service.startContainer('abc123');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot start container');
    });

    it('should emit state change event', async () => {
      const stateChanges: Array<{ previousStatus: string; newStatus: string }> = [];

      service.onContainerStateChange((event) => {
        stateChanges.push({
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
        });
      });

      mockExeca.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'start') {
          return Promise.resolve({ stdout: 'abc123', stderr: '' });
        }
        if (cmd === 'docker' && args[0] === 'inspect') {
          return Promise.resolve({
            stdout: JSON.stringify([{
              Id: 'abc123',
              Name: '/test',
              State: {
                Status: 'running',
                Running: true,
                Paused: false,
                Restarting: false,
                Dead: false,
                StartedAt: new Date().toISOString(),
              },
              Config: { Image: 'node:20', Labels: {} },
              NetworkSettings: { Ports: {} },
              Mounts: [],
              Created: new Date().toISOString(),
            }]),
            stderr: '',
          });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      await service.startContainer('abc123');

      expect(stateChanges.length).toBe(1);
      expect(stateChanges[0].newStatus).toBe('running');
    });
  });

  describe('stopContainer', () => {
    beforeEach(async () => {
      await service.initialize(mockVscode);
    });

    it('should stop a container successfully', async () => {
      mockExeca.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'stop') {
          return Promise.resolve({ stdout: 'abc123', stderr: '' });
        }
        if (cmd === 'docker' && args[0] === 'inspect') {
          return Promise.resolve({
            stdout: JSON.stringify([{
              Id: 'abc123',
              Name: '/test',
              State: {
                Status: 'exited',
                Running: false,
                Paused: false,
                Restarting: false,
                Dead: false,
                StartedAt: '',
              },
              Config: { Image: 'node:20', Labels: {} },
              NetworkSettings: { Ports: {} },
              Mounts: [],
              Created: new Date().toISOString(),
            }]),
            stderr: '',
          });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const result = await service.stopContainer('abc123');
      expect(result.success).toBe(true);
      expect(result.action).toBe('stop');
    });
  });

  describe('rebuildContainer', () => {
    beforeEach(async () => {
      await service.initialize(mockVscode);
    });

    it('should fail for non-existent container', async () => {
      mockExeca.mockRejectedValue(new Error('No such container'));

      const result = await service.rebuildContainer('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Container not found');
    });

    it('should fail for non-dev container', async () => {
      mockExeca.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'inspect') {
          return Promise.resolve({
            stdout: JSON.stringify([{
              Id: 'abc123',
              Name: '/regular-container',
              State: {
                Status: 'running',
                Running: true,
                Paused: false,
                Restarting: false,
                Dead: false,
                StartedAt: new Date().toISOString(),
              },
              Config: {
                Image: 'node:20',
                Labels: {}, // No devcontainer labels
              },
              NetworkSettings: { Ports: {} },
              Mounts: [],
              Created: new Date().toISOString(),
            }]),
            stderr: '',
          });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const result = await service.rebuildContainer('abc123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Container is not a dev container');
    });

    it('should rebuild dev container via docker stop and rm', async () => {
      mockExeca.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'inspect') {
          return Promise.resolve({
            stdout: JSON.stringify([{
              Id: 'dev123',
              Name: '/vsc-project-abc',
              State: {
                Status: 'running',
                Running: true,
                Paused: false,
                Restarting: false,
                Dead: false,
                StartedAt: new Date().toISOString(),
              },
              Config: {
                Image: 'mcr.microsoft.com/devcontainers/typescript-node:20',
                Labels: {
                  'devcontainer.metadata': '{}',
                },
              },
              NetworkSettings: { Ports: {} },
              Mounts: [],
              Created: new Date().toISOString(),
            }]),
            stderr: '',
          });
        }
        if (cmd === 'docker' && args[0] === 'stop') {
          return Promise.resolve({ stdout: 'dev123', stderr: '' });
        }
        if (cmd === 'docker' && args[0] === 'rm') {
          return Promise.resolve({ stdout: 'dev123', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const result = await service.rebuildContainer('dev123');
      expect(result.success).toBe(true);
      expect(result.action).toBe('rebuild');
    });
  });

  describe('getContainerLogs', () => {
    beforeEach(async () => {
      await service.initialize(mockVscode);
    });

    it('should return log entries', async () => {
      mockExeca.mockResolvedValue({
        stdout: 'Line 1\nLine 2\nLine 3',
        stderr: '',
      });

      const logs: Array<{ content: string }> = [];
      for await (const entry of service.getContainerLogs('abc123')) {
        logs.push(entry);
      }

      expect(logs.length).toBe(3);
      expect(logs[0].content).toBe('Line 1');
      expect(logs[1].content).toBe('Line 2');
      expect(logs[2].content).toBe('Line 3');
    });

    it('should handle tail option', async () => {
      mockExeca.mockResolvedValue({ stdout: 'Last line', stderr: '' });

      const logs: string[] = [];
      for await (const entry of service.getContainerLogs('abc123', { tail: 1 })) {
        logs.push(entry.content);
      }

      expect(mockExeca).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['logs', '--tail', '1', 'abc123']),
        expect.any(Object)
      );
    });

    it('should handle timestamps option', async () => {
      mockExeca.mockResolvedValue({
        stdout: '2024-01-15T10:30:00.000Z Log message',
        stderr: '',
      });

      const logs: Array<{ content: string; timestamp: number }> = [];
      for await (const entry of service.getContainerLogs('abc123', { timestamps: true })) {
        logs.push(entry);
      }

      expect(mockExeca).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['logs', '--timestamps', 'abc123']),
        expect.any(Object)
      );
      expect(logs[0].content).toBe('Log message');
      expect(logs[0].timestamp).toBe(new Date('2024-01-15T10:30:00.000Z').getTime());
    });
  });

  describe('listDevContainers', () => {
    beforeEach(async () => {
      await service.initialize(mockVscode);
    });

    it('should filter to only dev containers', async () => {
      const containers = [
        {
          Id: 'dev123',
          Names: ['/vsc-project'],
          Image: 'devcontainer',
          State: 'running',
          Status: 'Up',
          Created: Math.floor(Date.now() / 1000),
          Ports: [],
          Labels: { 'devcontainer.metadata': '{}' },
          Mounts: [],
        },
        {
          Id: 'regular456',
          Names: ['/regular'],
          Image: 'nginx',
          State: 'running',
          Status: 'Up',
          Created: Math.floor(Date.now() / 1000),
          Ports: [],
          Labels: {},
          Mounts: [],
        },
      ];

      mockExeca.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'ps') {
          return Promise.resolve({
            stdout: containers.map((c) => JSON.stringify(c)).join('\n'),
            stderr: '',
          });
        }
        if (cmd === 'docker' && args[0] === 'inspect') {
          const id = args[1];
          const container = containers.find((c) => c.Id.startsWith(id));
          if (!container) {
            return Promise.reject(new Error('Not found'));
          }
          return Promise.resolve({
            stdout: JSON.stringify([{
              Id: container.Id,
              Name: container.Names[0],
              State: {
                Status: 'running',
                Running: true,
                Paused: false,
                Restarting: false,
                Dead: false,
                StartedAt: new Date().toISOString(),
              },
              Config: {
                Image: container.Image,
                Labels: container.Labels,
              },
              NetworkSettings: { Ports: {} },
              Mounts: [],
              Created: new Date().toISOString(),
            }]),
            stderr: '',
          });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const devContainers = await service.listDevContainers();
      expect(devContainers.length).toBe(1);
      expect(devContainers[0].name).toBe('vsc-project');
      expect(devContainers[0].isDevContainer).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      await service.initialize(mockVscode);
      service.dispose();

      expect(service.isInitialized()).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw if not initialized', async () => {
      await expect(service.listContainers()).rejects.toThrow(
        'ContainerService not initialized'
      );
    });
  });
});
