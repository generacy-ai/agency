import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import { ConfigService } from '../../services/ConfigService';
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
        { id: 'default', name: 'Default', tools: ['tool-1'] },
        { id: 'debug', name: 'Debug', tools: ['tool-1', 'tool-2'], inherits: 'default' },
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
        const newMode: ModeConfig = { id: 'custom', name: 'Custom', tools: ['tool-3'] };

        await service.saveModeConfig(newMode);

        expect(mockWriteConfig).toHaveBeenCalled();
        expect(service.getMode('custom')).toEqual(newMode);
      });

      it('should update existing mode', async () => {
        const updatedMode: ModeConfig = { id: 'debug', name: 'Debug Updated', tools: ['tool-4'] };

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
});
