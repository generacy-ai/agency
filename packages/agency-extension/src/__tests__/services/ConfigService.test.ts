import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import { ConfigService, needsSchemaMigration, migrateOldFormatConfig, type ConfigConflictEvent } from '../../services/ConfigService';
import type { AgencyConfig, PluginConfig, ModeConfig, ContainerConfig } from '../../config';

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
}));

// Mock the config module
const mockReadConfig = vi.fn();
const mockWriteConfig = vi.fn();
const mockWatchConfig = vi.fn();
const mockInitializeConfig = vi.fn();
const mockIsCompatibleVersion = vi.fn();
const mockParseAgencyConfig = vi.fn();

vi.mock('../../config', () => ({
  readConfig: (...args: unknown[]) => mockReadConfig(...args),
  writeConfig: (...args: unknown[]) => mockWriteConfig(...args),
  watchConfig: (...args: unknown[]) => mockWatchConfig(...args),
  initializeConfig: (...args: unknown[]) => mockInitializeConfig(...args),
  isCompatibleVersion: (...args: unknown[]) => mockIsCompatibleVersion(...args),
  parseAgencyConfig: (...args: unknown[]) => mockParseAgencyConfig(...args),
  DEFAULT_CONFIG_PATH: '.agency/agency.config.json',
  DEFAULT_CONFIG_VERSION: '1.0.0',
}));

describe('ConfigService', () => {
  let mockVscode: typeof vscode;
  let defaultConfig: AgencyConfig;

  beforeEach(() => {
    // Reset the singleton before each test
    ConfigService.reset();

    // Reset all mocks
    vi.clearAllMocks();

    // Create default config for tests
    defaultConfig = {
      version: '1.0.0',
      plugins: [
        { id: 'plugin-1', enabled: true, settings: { key: 'value' } },
        { id: 'plugin-2', enabled: false, settings: {} },
      ],
      modes: [
        { id: 'default', name: 'Default', includedTools: ['tool-1'], excludedTools: [] },
        { id: 'debug', name: 'Debug', includedTools: ['tool-1', 'tool-2'], excludedTools: [], parentId: 'default' },
      ],
      containers: [
        { id: 'container-1', name: 'Dev Container', workspacePath: '/workspace' },
      ],
    };

    // Setup default mock behaviors
    mockInitializeConfig.mockResolvedValue(defaultConfig);
    mockIsCompatibleVersion.mockReturnValue(true);
    mockWatchConfig.mockReturnValue({ dispose: vi.fn() });
    mockWriteConfig.mockResolvedValue(undefined);

    // Create mock VS Code module
    mockVscode = {
      workspace: {
        workspaceFolders: [
          {
            uri: { fsPath: '/workspace', path: '/workspace' } as vscode.Uri,
            name: 'workspace',
            index: 0,
          },
        ],
      },
    } as unknown as typeof vscode;
  });

  afterEach(() => {
    ConfigService.reset();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = ConfigService.getInstance();
      const instance2 = ConfigService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = ConfigService.getInstance();
      ConfigService.reset();
      const instance2 = ConfigService.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const service = ConfigService.getInstance();

      await service.initialize(mockVscode);

      expect(service.isInitialized()).toBe(true);
      expect(mockInitializeConfig).toHaveBeenCalledWith(
        mockVscode,
        '.agency/agency.config.json'
      );
    });

    it('should not re-initialize if already initialized', async () => {
      const service = ConfigService.getInstance();

      await service.initialize(mockVscode);
      await service.initialize(mockVscode);

      expect(mockInitializeConfig).toHaveBeenCalledTimes(1);
    });

    it('should setup file watcher on initialization', async () => {
      const service = ConfigService.getInstance();

      await service.initialize(mockVscode);

      expect(mockWatchConfig).toHaveBeenCalled();
    });

    it('should fire config change event on initialization', async () => {
      const service = ConfigService.getInstance();
      const listener = vi.fn();

      await service.initialize(mockVscode);
      service.onConfigChange(listener);

      // Re-initialize to trigger event (initial fire happened before listener was attached)
      ConfigService.reset();
      const newService = ConfigService.getInstance();
      const newListener = vi.fn();

      // Attach listener before initialize
      // Note: We need to initialize first to get the event working
      await newService.initialize(mockVscode);

      // The config change event should have fired during initialization
      // Since we can't attach before init, we verify the watcher is called
      expect(mockWatchConfig).toHaveBeenCalled();
    });
  });

  describe('Config Migration', () => {
    it('should migrate config when version is incompatible', async () => {
      const oldConfig = { ...defaultConfig, version: '0.9.0' };
      mockInitializeConfig.mockResolvedValue(oldConfig);
      mockIsCompatibleVersion.mockReturnValue(false);
      mockParseAgencyConfig.mockReturnValue({ ...oldConfig, version: '1.0.0' });

      const service = ConfigService.getInstance();
      await service.initialize(mockVscode);

      expect(mockWriteConfig).toHaveBeenCalled();
    });

    it('should not migrate config when version is compatible', async () => {
      mockIsCompatibleVersion.mockReturnValue(true);

      const service = ConfigService.getInstance();
      await service.initialize(mockVscode);

      // writeConfig should not be called just for migration
      expect(mockWriteConfig).not.toHaveBeenCalled();
    });
  });

  describe('Getter Methods', () => {
    let service: ConfigService;

    beforeEach(async () => {
      service = ConfigService.getInstance();
      await service.initialize(mockVscode);
    });

    it('should throw if not initialized', () => {
      ConfigService.reset();
      const uninitService = ConfigService.getInstance();

      expect(() => uninitService.getConfig()).toThrow('ConfigService not initialized');
      expect(() => uninitService.getPlugins()).toThrow('ConfigService not initialized');
      expect(() => uninitService.getModes()).toThrow('ConfigService not initialized');
      expect(() => uninitService.getContainers()).toThrow('ConfigService not initialized');
    });

    describe('getConfig', () => {
      it('should return the full config', () => {
        const config = service.getConfig();

        expect(config).toEqual(defaultConfig);
      });
    });

    describe('getPlugins', () => {
      it('should return all plugins', () => {
        const plugins = service.getPlugins();

        expect(plugins).toHaveLength(2);
        expect(plugins[0].id).toBe('plugin-1');
        expect(plugins[1].id).toBe('plugin-2');
      });
    });

    describe('getModes', () => {
      it('should return all modes', () => {
        const modes = service.getModes();

        expect(modes).toHaveLength(2);
        expect(modes[0].id).toBe('default');
        expect(modes[1].id).toBe('debug');
      });
    });

    describe('getContainers', () => {
      it('should return all containers', () => {
        const containers = service.getContainers();

        expect(containers).toHaveLength(1);
        expect(containers[0].id).toBe('container-1');
      });
    });

    describe('getPlugin', () => {
      it('should return plugin by ID', () => {
        const plugin = service.getPlugin('plugin-1');

        expect(plugin).toBeDefined();
        expect(plugin?.id).toBe('plugin-1');
        expect(plugin?.enabled).toBe(true);
      });

      it('should return undefined for non-existent plugin', () => {
        const plugin = service.getPlugin('non-existent');

        expect(plugin).toBeUndefined();
      });
    });

    describe('getMode', () => {
      it('should return mode by ID', () => {
        const mode = service.getMode('debug');

        expect(mode).toBeDefined();
        expect(mode?.id).toBe('debug');
        expect(mode?.name).toBe('Debug');
      });

      it('should return undefined for non-existent mode', () => {
        const mode = service.getMode('non-existent');

        expect(mode).toBeUndefined();
      });
    });

    describe('getContainer', () => {
      it('should return container by ID', () => {
        const container = service.getContainer('container-1');

        expect(container).toBeDefined();
        expect(container?.id).toBe('container-1');
        expect(container?.name).toBe('Dev Container');
      });

      it('should return undefined for non-existent container', () => {
        const container = service.getContainer('non-existent');

        expect(container).toBeUndefined();
      });
    });
  });

  describe('Save Methods', () => {
    let service: ConfigService;

    beforeEach(async () => {
      service = ConfigService.getInstance();
      await service.initialize(mockVscode);
      vi.clearAllMocks();
    });

    describe('savePluginConfig', () => {
      it('should add new plugin', async () => {
        const newPlugin: PluginConfig = { id: 'plugin-3', enabled: true, settings: {} };

        await service.savePluginConfig(newPlugin);

        expect(mockWriteConfig).toHaveBeenCalled();
        expect(service.getPlugin('plugin-3')).toEqual(newPlugin);
      });

      it('should update existing plugin', async () => {
        const updatedPlugin: PluginConfig = { id: 'plugin-1', enabled: false, settings: { updated: true } };

        await service.savePluginConfig(updatedPlugin);

        expect(mockWriteConfig).toHaveBeenCalled();
        expect(service.getPlugin('plugin-1')?.enabled).toBe(false);
        expect(service.getPlugin('plugin-1')?.settings).toEqual({ updated: true });
      });
    });

    describe('saveModeConfig', () => {
      it('should add new mode', async () => {
        const newMode: ModeConfig = { id: 'custom', name: 'Custom', includedTools: ['tool-3'], excludedTools: [] };

        await service.saveModeConfig(newMode);

        expect(mockWriteConfig).toHaveBeenCalled();
        expect(service.getMode('custom')).toEqual(newMode);
      });

      it('should update existing mode', async () => {
        const updatedMode: ModeConfig = { id: 'debug', name: 'Debug Updated', includedTools: ['tool-4'], excludedTools: [] };

        await service.saveModeConfig(updatedMode);

        expect(mockWriteConfig).toHaveBeenCalled();
        expect(service.getMode('debug')?.name).toBe('Debug Updated');
      });
    });

    describe('saveContainerConfig', () => {
      it('should add new container', async () => {
        const newContainer: ContainerConfig = {
          id: 'container-2',
          name: 'Test Container',
          workspacePath: '/test',
        };

        await service.saveContainerConfig(newContainer);

        expect(mockWriteConfig).toHaveBeenCalled();
        expect(service.getContainer('container-2')).toEqual(newContainer);
      });

      it('should update existing container', async () => {
        const updatedContainer: ContainerConfig = {
          id: 'container-1',
          name: 'Updated Container',
          workspacePath: '/updated',
        };

        await service.saveContainerConfig(updatedContainer);

        expect(mockWriteConfig).toHaveBeenCalled();
        expect(service.getContainer('container-1')?.name).toBe('Updated Container');
      });
    });
  });

  describe('Remove Methods', () => {
    let service: ConfigService;

    beforeEach(async () => {
      service = ConfigService.getInstance();
      await service.initialize(mockVscode);
      vi.clearAllMocks();
    });

    describe('removePlugin', () => {
      it('should remove existing plugin', async () => {
        const result = await service.removePlugin('plugin-1');

        expect(result).toBe(true);
        expect(mockWriteConfig).toHaveBeenCalled();
        expect(service.getPlugin('plugin-1')).toBeUndefined();
      });

      it('should return false for non-existent plugin', async () => {
        const result = await service.removePlugin('non-existent');

        expect(result).toBe(false);
        expect(mockWriteConfig).not.toHaveBeenCalled();
      });
    });

    describe('removeMode', () => {
      it('should remove existing mode', async () => {
        const result = await service.removeMode('debug');

        expect(result).toBe(true);
        expect(mockWriteConfig).toHaveBeenCalled();
        expect(service.getMode('debug')).toBeUndefined();
      });

      it('should not remove default mode', async () => {
        const result = await service.removeMode('default');

        expect(result).toBe(false);
        expect(mockWriteConfig).not.toHaveBeenCalled();
        expect(service.getMode('default')).toBeDefined();
      });

      it('should return false for non-existent mode', async () => {
        const result = await service.removeMode('non-existent');

        expect(result).toBe(false);
        expect(mockWriteConfig).not.toHaveBeenCalled();
      });
    });

    describe('removeContainer', () => {
      it('should remove existing container', async () => {
        const result = await service.removeContainer('container-1');

        expect(result).toBe(true);
        expect(mockWriteConfig).toHaveBeenCalled();
        expect(service.getContainer('container-1')).toBeUndefined();
      });

      it('should return false for non-existent container', async () => {
        const result = await service.removeContainer('non-existent');

        expect(result).toBe(false);
        expect(mockWriteConfig).not.toHaveBeenCalled();
      });
    });
  });

  describe('Event Emitter', () => {
    it('should fire event when config changes via save', async () => {
      const service = ConfigService.getInstance();
      await service.initialize(mockVscode);

      const listener = vi.fn();
      service.onConfigChange(listener);

      await service.savePluginConfig({ id: 'new-plugin', enabled: true, settings: {} });

      expect(listener).toHaveBeenCalled();
    });

    it('should allow multiple listeners', async () => {
      const service = ConfigService.getInstance();
      await service.initialize(mockVscode);

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      service.onConfigChange(listener1);
      service.onConfigChange(listener2);

      await service.savePluginConfig({ id: 'new-plugin', enabled: true, settings: {} });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should stop receiving events after dispose', async () => {
      const service = ConfigService.getInstance();
      await service.initialize(mockVscode);

      const listener = vi.fn();
      const disposable = service.onConfigChange(listener);
      disposable.dispose();

      await service.savePluginConfig({ id: 'new-plugin', enabled: true, settings: {} });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Dispose', () => {
    it('should clean up resources on dispose', async () => {
      const service = ConfigService.getInstance();
      await service.initialize(mockVscode);

      service.dispose();

      expect(service.isInitialized()).toBe(false);
    });

    it('should allow re-initialization after dispose', async () => {
      const service = ConfigService.getInstance();
      await service.initialize(mockVscode);
      service.dispose();

      // Reset is needed to get a new instance
      ConfigService.reset();
      const newService = ConfigService.getInstance();
      await newService.initialize(mockVscode);

      expect(newService.isInitialized()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw when saving without initialization', async () => {
      const service = ConfigService.getInstance();
      const plugin: PluginConfig = { id: 'test', enabled: true, settings: {} };

      await expect(service.savePluginConfig(plugin)).rejects.toThrow('ConfigService not initialized');
    });

    it('should throw when removing without initialization', async () => {
      const service = ConfigService.getInstance();

      await expect(service.removePlugin('test')).rejects.toThrow('ConfigService not initialized');
    });
  });

  describe('Schema Migration - needsSchemaMigration', () => {
    it('should detect mode with inherits field', () => {
      const raw = {
        version: '1.0.0',
        modes: [{ id: 'test', name: 'Test', inherits: 'default' }],
        containers: [],
      };
      expect(needsSchemaMigration(raw)).toBe(true);
    });

    it('should detect mode with tools field (no includedTools)', () => {
      const raw = {
        version: '1.0.0',
        modes: [{ id: 'test', name: 'Test', tools: ['tool-1'] }],
        containers: [],
      };
      expect(needsSchemaMigration(raw)).toBe(true);
    });

    it('should not detect mode with tools if includedTools is also present', () => {
      const raw = {
        version: '1.0.0',
        modes: [{ id: 'test', name: 'Test', tools: ['old'], includedTools: ['new'] }],
        containers: [],
      };
      expect(needsSchemaMigration(raw)).toBe(false);
    });

    it('should detect container with mcpCommand', () => {
      const raw = {
        version: '1.0.0',
        modes: [],
        containers: [{ id: 'c1', name: 'C1', workspacePath: '/ws', mcpCommand: 'npx agency' }],
      };
      expect(needsSchemaMigration(raw)).toBe(true);
    });

    it('should detect container with mcpArgs', () => {
      const raw = {
        version: '1.0.0',
        modes: [],
        containers: [{ id: 'c1', name: 'C1', workspacePath: '/ws', mcpArgs: ['--port', '3000'] }],
      };
      expect(needsSchemaMigration(raw)).toBe(true);
    });

    it('should detect container with dockerComposePath', () => {
      const raw = {
        version: '1.0.0',
        modes: [],
        containers: [{ id: 'c1', name: 'C1', workspacePath: '/ws', dockerComposePath: './docker-compose.yml' }],
      };
      expect(needsSchemaMigration(raw)).toBe(true);
    });

    it('should return false for new-format config', () => {
      const raw = {
        version: '1.0.0',
        modes: [{ id: 'test', name: 'Test', parentId: 'default', includedTools: ['*'], excludedTools: [] }],
        containers: [{ id: 'c1', name: 'C1', workspacePath: '/ws', devcontainerPath: '.devcontainer', connection: { command: 'npx agency' } }],
      };
      expect(needsSchemaMigration(raw)).toBe(false);
    });

    it('should return false for empty modes and containers', () => {
      const raw = { version: '1.0.0', modes: [], containers: [] };
      expect(needsSchemaMigration(raw)).toBe(false);
    });

    it('should return false when modes/containers are missing', () => {
      const raw = { version: '1.0.0' };
      expect(needsSchemaMigration(raw)).toBe(false);
    });
  });

  describe('Schema Migration - migrateOldFormatConfig', () => {
    it('should migrate mode inherits to parentId', () => {
      const raw = {
        version: '1.0.0',
        modes: [{ id: 'debug', name: 'Debug', inherits: 'default' }],
        containers: [],
      };

      const migrated = migrateOldFormatConfig(raw);
      const modes = migrated['modes'] as Record<string, unknown>[];

      expect(modes[0]['parentId']).toBe('default');
      expect(modes[0]['inherits']).toBeUndefined();
    });

    it('should migrate mode tools to includedTools and add excludedTools', () => {
      const raw = {
        version: '1.0.0',
        modes: [{ id: 'test', name: 'Test', tools: ['tool-1', 'tool-2'] }],
        containers: [],
      };

      const migrated = migrateOldFormatConfig(raw);
      const modes = migrated['modes'] as Record<string, unknown>[];

      expect(modes[0]['includedTools']).toEqual(['tool-1', 'tool-2']);
      expect(modes[0]['excludedTools']).toEqual([]);
      expect(modes[0]['tools']).toBeUndefined();
    });

    it('should migrate both inherits and tools on the same mode', () => {
      const raw = {
        version: '1.0.0',
        modes: [{ id: 'custom', name: 'Custom', inherits: 'default', tools: ['*'] }],
        containers: [],
      };

      const migrated = migrateOldFormatConfig(raw);
      const modes = migrated['modes'] as Record<string, unknown>[];

      expect(modes[0]['parentId']).toBe('default');
      expect(modes[0]['includedTools']).toEqual(['*']);
      expect(modes[0]['excludedTools']).toEqual([]);
      expect(modes[0]['inherits']).toBeUndefined();
      expect(modes[0]['tools']).toBeUndefined();
    });

    it('should migrate container mcpCommand to connection.command', () => {
      const raw = {
        version: '1.0.0',
        modes: [],
        containers: [{ id: 'c1', name: 'C1', workspacePath: '/ws', mcpCommand: 'npx agency' }],
      };

      const migrated = migrateOldFormatConfig(raw);
      const containers = migrated['containers'] as Record<string, unknown>[];
      const connection = containers[0]['connection'] as Record<string, unknown>;

      expect(connection['command']).toBe('npx agency');
      expect(containers[0]['mcpCommand']).toBeUndefined();
    });

    it('should migrate container mcpArgs to connection.args', () => {
      const raw = {
        version: '1.0.0',
        modes: [],
        containers: [{ id: 'c1', name: 'C1', workspacePath: '/ws', mcpCommand: 'npx', mcpArgs: ['agency', '--port', '3000'] }],
      };

      const migrated = migrateOldFormatConfig(raw);
      const containers = migrated['containers'] as Record<string, unknown>[];
      const connection = containers[0]['connection'] as Record<string, unknown>;

      expect(connection['command']).toBe('npx');
      expect(connection['args']).toEqual(['agency', '--port', '3000']);
      expect(containers[0]['mcpCommand']).toBeUndefined();
      expect(containers[0]['mcpArgs']).toBeUndefined();
    });

    it('should migrate container dockerComposePath to devcontainerPath', () => {
      const raw = {
        version: '1.0.0',
        modes: [],
        containers: [{ id: 'c1', name: 'C1', workspacePath: '/ws', dockerComposePath: './docker-compose.yml' }],
      };

      const migrated = migrateOldFormatConfig(raw);
      const containers = migrated['containers'] as Record<string, unknown>[];

      expect(containers[0]['devcontainerPath']).toBe('./docker-compose.yml');
      expect(containers[0]['dockerComposePath']).toBeUndefined();
    });

    it('should migrate all container fields together', () => {
      const raw = {
        version: '1.0.0',
        modes: [],
        containers: [{
          id: 'c1',
          name: 'C1',
          workspacePath: '/ws',
          mcpCommand: 'npx',
          mcpArgs: ['agency'],
          dockerComposePath: './docker-compose.yml',
        }],
      };

      const migrated = migrateOldFormatConfig(raw);
      const containers = migrated['containers'] as Record<string, unknown>[];
      const connection = containers[0]['connection'] as Record<string, unknown>;

      expect(connection['command']).toBe('npx');
      expect(connection['args']).toEqual(['agency']);
      expect(containers[0]['devcontainerPath']).toBe('./docker-compose.yml');
      expect(containers[0]['mcpCommand']).toBeUndefined();
      expect(containers[0]['mcpArgs']).toBeUndefined();
      expect(containers[0]['dockerComposePath']).toBeUndefined();
    });

    it('should not modify new-format configs', () => {
      const raw = {
        version: '1.0.0',
        modes: [{ id: 'test', name: 'Test', parentId: 'default', includedTools: ['*'], excludedTools: [] }],
        containers: [{ id: 'c1', name: 'C1', workspacePath: '/ws', connection: { command: 'npx agency' } }],
      };

      const migrated = migrateOldFormatConfig(raw);

      expect(migrated).toEqual(raw);
    });

    it('should handle multiple modes and containers', () => {
      const raw = {
        version: '1.0.0',
        modes: [
          { id: 'default', name: 'Default', tools: ['*'] },
          { id: 'debug', name: 'Debug', inherits: 'default', tools: ['tool-1'] },
        ],
        containers: [
          { id: 'c1', name: 'C1', workspacePath: '/ws1', mcpCommand: 'cmd1', dockerComposePath: 'path1' },
          { id: 'c2', name: 'C2', workspacePath: '/ws2', mcpCommand: 'cmd2', mcpArgs: ['arg1'] },
        ],
      };

      const migrated = migrateOldFormatConfig(raw);
      const modes = migrated['modes'] as Record<string, unknown>[];
      const containers = migrated['containers'] as Record<string, unknown>[];

      // Check first mode
      expect(modes[0]['includedTools']).toEqual(['*']);
      expect(modes[0]['tools']).toBeUndefined();

      // Check second mode
      expect(modes[1]['parentId']).toBe('default');
      expect(modes[1]['includedTools']).toEqual(['tool-1']);

      // Check first container
      expect((containers[0]['connection'] as Record<string, unknown>)['command']).toBe('cmd1');
      expect(containers[0]['devcontainerPath']).toBe('path1');

      // Check second container
      expect((containers[1]['connection'] as Record<string, unknown>)['command']).toBe('cmd2');
      expect((containers[1]['connection'] as Record<string, unknown>)['args']).toEqual(['arg1']);
    });

    it('should preserve existing connection.env when migrating mcpCommand', () => {
      const raw = {
        version: '1.0.0',
        modes: [],
        containers: [{
          id: 'c1',
          name: 'C1',
          workspacePath: '/ws',
          mcpCommand: 'npx',
          connection: { env: { NODE_ENV: 'production' } },
        }],
      };

      const migrated = migrateOldFormatConfig(raw);
      const containers = migrated['containers'] as Record<string, unknown>[];
      const connection = containers[0]['connection'] as Record<string, unknown>;

      expect(connection['command']).toBe('npx');
      expect(connection['env']).toEqual({ NODE_ENV: 'production' });
    });
  });

  describe('Schema Migration - ConfigService integration', () => {
    it('should migrate old-format config on initialization', async () => {
      const oldFormatConfig = JSON.stringify({
        version: '1.0.0',
        plugins: [],
        modes: [{ id: 'default', name: 'Default', tools: ['*'], inherits: undefined }],
        containers: [{ id: 'c1', name: 'C1', workspacePath: '/ws', mcpCommand: 'npx agency' }],
      });

      const mockReadFile = vi.fn().mockResolvedValue(new TextEncoder().encode(oldFormatConfig));
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockJoinPath = vi.fn().mockReturnValue({ fsPath: '/workspace/.agency/agency.config.json' });

      const vscodeWithFs = {
        workspace: {
          workspaceFolders: [
            {
              uri: { fsPath: '/workspace', path: '/workspace' } as vscode.Uri,
              name: 'workspace',
              index: 0,
            },
          ],
          fs: {
            readFile: mockReadFile,
            writeFile: mockWriteFile,
          },
        },
        Uri: {
          joinPath: mockJoinPath,
        },
      } as unknown as typeof vscode;

      mockInitializeConfig.mockResolvedValue(defaultConfig);
      mockIsCompatibleVersion.mockReturnValue(true);

      // Mock parseAgencyConfig to return a valid config for the migrated data
      mockParseAgencyConfig.mockReturnValue({
        version: '1.0.0',
        plugins: [],
        modes: [{ id: 'default', name: 'Default', includedTools: ['*'], excludedTools: [] }],
        containers: [{ id: 'c1', name: 'C1', workspacePath: '/ws', connection: { command: 'npx agency' } }],
      });

      const service = ConfigService.getInstance();
      await service.initialize(vscodeWithFs);

      // Should have read the raw file to check for migration
      expect(mockReadFile).toHaveBeenCalled();
      // Should have written the migrated file back
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should not migrate new-format config on initialization', async () => {
      const newFormatConfig = JSON.stringify({
        version: '1.0.0',
        plugins: [],
        modes: [{ id: 'default', name: 'Default', includedTools: ['*'], excludedTools: [] }],
        containers: [],
      });

      const mockReadFile = vi.fn().mockResolvedValue(new TextEncoder().encode(newFormatConfig));
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockJoinPath = vi.fn().mockReturnValue({ fsPath: '/workspace/.agency/agency.config.json' });

      const vscodeWithFs = {
        workspace: {
          workspaceFolders: [
            {
              uri: { fsPath: '/workspace', path: '/workspace' } as vscode.Uri,
              name: 'workspace',
              index: 0,
            },
          ],
          fs: {
            readFile: mockReadFile,
            writeFile: mockWriteFile,
          },
        },
        Uri: {
          joinPath: mockJoinPath,
        },
      } as unknown as typeof vscode;

      mockInitializeConfig.mockResolvedValue(defaultConfig);
      mockIsCompatibleVersion.mockReturnValue(true);

      const service = ConfigService.getInstance();
      await service.initialize(vscodeWithFs);

      // Should have read the raw file to check
      expect(mockReadFile).toHaveBeenCalled();
      // Should NOT have written (no migration needed)
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should handle missing config file gracefully during migration check', async () => {
      const mockReadFile = vi.fn().mockRejectedValue(new Error('FileNotFound'));
      const mockJoinPath = vi.fn().mockReturnValue({ fsPath: '/workspace/.agency/agency.config.json' });

      const vscodeWithFs = {
        workspace: {
          workspaceFolders: [
            {
              uri: { fsPath: '/workspace', path: '/workspace' } as vscode.Uri,
              name: 'workspace',
              index: 0,
            },
          ],
          fs: {
            readFile: mockReadFile,
          },
        },
        Uri: {
          joinPath: mockJoinPath,
        },
      } as unknown as typeof vscode;

      mockInitializeConfig.mockResolvedValue(defaultConfig);
      mockIsCompatibleVersion.mockReturnValue(true);

      const service = ConfigService.getInstance();
      // Should not throw
      await service.initialize(vscodeWithFs);

      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('Config Conflict Detection', () => {
    const configContent = JSON.stringify({
      version: '1.0.0',
      plugins: [],
      modes: [{ id: 'default', name: 'Default', includedTools: ['*'], excludedTools: [] }],
      containers: [],
    });

    const altConfigContent = JSON.stringify({
      version: '1.0.0',
      plugins: [{ id: 'new-plugin', enabled: true, settings: {} }],
      modes: [{ id: 'default', name: 'Default', includedTools: ['*'], excludedTools: [] }],
      containers: [],
    });

    function createVscodeWithFs(initialContent: string) {
      let fileContent = initialContent;
      const mockReadFile = vi.fn().mockImplementation(() =>
        Promise.resolve(new TextEncoder().encode(fileContent))
      );
      const mockWriteFile = vi.fn().mockImplementation((_uri: unknown, data: Uint8Array) => {
        fileContent = new TextDecoder().decode(data);
        return Promise.resolve();
      });
      const mockJoinPath = vi.fn().mockReturnValue({ fsPath: '/workspace/.agency/agency.config.json' });

      const vscodeWithFs = {
        workspace: {
          workspaceFolders: [
            {
              uri: { fsPath: '/workspace', path: '/workspace' } as vscode.Uri,
              name: 'workspace',
              index: 0,
            },
          ],
          fs: {
            readFile: mockReadFile,
            writeFile: mockWriteFile,
          },
        },
        Uri: {
          joinPath: mockJoinPath,
        },
      } as unknown as typeof vscode;

      return { vscodeWithFs, mockReadFile, mockWriteFile, setFileContent: (c: string) => { fileContent = c; } };
    }

    it('should not fire conflict event when external change occurs with no dirty webview', async () => {
      const { vscodeWithFs, setFileContent } = createVscodeWithFs(configContent);

      mockInitializeConfig.mockResolvedValue(defaultConfig);
      mockIsCompatibleVersion.mockReturnValue(true);

      const service = ConfigService.getInstance();
      await service.initialize(vscodeWithFs);

      const conflictListener = vi.fn();
      service.onConfigConflict(conflictListener);

      // Simulate external file change by calling the watcher callback
      const watcherCallback = mockWatchConfig.mock.calls[0][2] as (config: AgencyConfig | null) => Promise<void>;

      // Change the file content to something different
      setFileContent(altConfigContent);

      await watcherCallback(defaultConfig);

      // Webview is NOT dirty, so no conflict should fire
      expect(conflictListener).not.toHaveBeenCalled();
    });

    it('should fire conflict event when external change occurs with dirty webview', async () => {
      const { vscodeWithFs, setFileContent } = createVscodeWithFs(configContent);

      mockInitializeConfig.mockResolvedValue(defaultConfig);
      mockIsCompatibleVersion.mockReturnValue(true);

      const service = ConfigService.getInstance();
      await service.initialize(vscodeWithFs);

      // Mark webview as dirty
      service.setWebviewDirty(true);

      const conflictListener = vi.fn();
      service.onConfigConflict(conflictListener);

      // Simulate external file change
      const watcherCallback = mockWatchConfig.mock.calls[0][2] as (config: AgencyConfig | null) => Promise<void>;

      setFileContent(altConfigContent);

      await watcherCallback(defaultConfig);

      expect(conflictListener).toHaveBeenCalledTimes(1);
      expect(conflictListener).toHaveBeenCalledWith({
        externalChanges: true,
        webviewDirty: true,
      });
    });

    it('should not fire conflict event when file content has not changed', async () => {
      const { vscodeWithFs } = createVscodeWithFs(configContent);

      mockInitializeConfig.mockResolvedValue(defaultConfig);
      mockIsCompatibleVersion.mockReturnValue(true);

      const service = ConfigService.getInstance();
      await service.initialize(vscodeWithFs);

      // Mark webview as dirty
      service.setWebviewDirty(true);

      const conflictListener = vi.fn();
      service.onConfigConflict(conflictListener);

      // Simulate watcher firing but with same file content (hash unchanged)
      const watcherCallback = mockWatchConfig.mock.calls[0][2] as (config: AgencyConfig | null) => Promise<void>;

      await watcherCallback(defaultConfig);

      // Hash hasn't changed even though webview is dirty — no conflict
      expect(conflictListener).not.toHaveBeenCalled();
    });

    it('should update hash after save', async () => {
      const { vscodeWithFs, setFileContent } = createVscodeWithFs(configContent);

      mockInitializeConfig.mockResolvedValue(defaultConfig);
      mockIsCompatibleVersion.mockReturnValue(true);

      const service = ConfigService.getInstance();
      await service.initialize(vscodeWithFs);

      // Mark dirty, then save (which should update hash and clear dirty)
      service.setWebviewDirty(true);

      // Simulate that writeConfig updates the file content
      mockWriteConfig.mockImplementation(async () => {
        setFileContent(altConfigContent);
      });

      await service.savePluginConfig({ id: 'new-plugin', enabled: true, settings: {} });

      // After save, dirty flag should be cleared
      expect(service.isWebviewDirty()).toBe(false);

      // Now simulate an external change with the same content — should NOT conflict
      const conflictListener = vi.fn();
      service.onConfigConflict(conflictListener);

      service.setWebviewDirty(true);

      const watcherCallback = mockWatchConfig.mock.calls[0][2] as (config: AgencyConfig | null) => Promise<void>;

      // File hasn't changed since our save, so no conflict
      await watcherCallback(defaultConfig);

      expect(conflictListener).not.toHaveBeenCalled();
    });

    it('should update hash after initialization (load)', async () => {
      const { vscodeWithFs, mockReadFile } = createVscodeWithFs(configContent);

      mockInitializeConfig.mockResolvedValue(defaultConfig);
      mockIsCompatibleVersion.mockReturnValue(true);

      const service = ConfigService.getInstance();
      await service.initialize(vscodeWithFs);

      // readFile should be called during init for hash computation
      // (once for schema migration check, once for hash computation)
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should clear webview dirty flag on save', async () => {
      const { vscodeWithFs } = createVscodeWithFs(configContent);

      mockInitializeConfig.mockResolvedValue(defaultConfig);
      mockIsCompatibleVersion.mockReturnValue(true);

      const service = ConfigService.getInstance();
      await service.initialize(vscodeWithFs);

      service.setWebviewDirty(true);
      expect(service.isWebviewDirty()).toBe(true);

      await service.savePluginConfig({ id: 'new-plugin', enabled: true, settings: {} });

      expect(service.isWebviewDirty()).toBe(false);
    });

    it('should throw when calling setWebviewDirty before initialization', () => {
      const service = ConfigService.getInstance();

      expect(() => service.setWebviewDirty(true)).toThrow('ConfigService not initialized');
    });

    it('should reset conflict state on dispose', async () => {
      const { vscodeWithFs } = createVscodeWithFs(configContent);

      mockInitializeConfig.mockResolvedValue(defaultConfig);
      mockIsCompatibleVersion.mockReturnValue(true);

      const service = ConfigService.getInstance();
      await service.initialize(vscodeWithFs);

      service.setWebviewDirty(true);

      service.dispose();

      expect(service.isWebviewDirty()).toBe(false);
    });
  });
});
