import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import type { PluginConfig } from '../../types';

// Mock ConfigService
const mockSavePluginConfig = vi.fn().mockResolvedValue(undefined);
const mockGetPlugins = vi.fn<() => PluginConfig[]>(() => []);

vi.mock('../../services', () => ({
  ConfigService: {
    getInstance: vi.fn(() => ({
      getPlugins: mockGetPlugins,
      savePluginConfig: mockSavePluginConfig,
    })),
  },
}));

// Mock logger
vi.mock('../../utils', () => ({
  createScopedLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Import after mocking
import {
  configurePlugin,
  enablePlugin,
  disablePlugin,
  refreshPlugins,
  registerPluginCommands,
} from '../../commands/plugin-commands';

describe('Plugin Commands', () => {
  // Mock VS Code module
  let mockVscode: typeof vscode;
  let mockShowQuickPick: ReturnType<typeof vi.fn>;
  let mockShowInputBox: ReturnType<typeof vi.fn>;
  let mockShowInformationMessage: ReturnType<typeof vi.fn>;
  let mockShowErrorMessage: ReturnType<typeof vi.fn>;
  let mockExecuteCommand: ReturnType<typeof vi.fn>;
  let mockRegisterCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockShowQuickPick = vi.fn();
    mockShowInputBox = vi.fn();
    mockShowInformationMessage = vi.fn();
    mockShowErrorMessage = vi.fn();
    mockExecuteCommand = vi.fn();
    mockRegisterCommand = vi.fn((command: string, callback: () => void) => ({
      dispose: vi.fn(),
    }));

    mockVscode = {
      window: {
        showQuickPick: mockShowQuickPick,
        showInputBox: mockShowInputBox,
        showInformationMessage: mockShowInformationMessage,
        showErrorMessage: mockShowErrorMessage,
      },
      commands: {
        executeCommand: mockExecuteCommand,
        registerCommand: mockRegisterCommand,
      },
    } as unknown as typeof vscode;

    // Reset mock implementations
    mockGetPlugins.mockReturnValue([]);
    mockSavePluginConfig.mockResolvedValue(undefined);
  });

  describe('configurePlugin', () => {
    it('should show message when no plugins configured', async () => {
      mockGetPlugins.mockReturnValue([]);

      await configurePlugin(mockVscode);

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'No plugins configured. Add plugins to agency.config.json.'
      );
    });

    it('should show quick pick when plugin not provided', async () => {
      const plugins: PluginConfig[] = [
        { id: 'plugin1', enabled: true, settings: {} },
        { id: 'plugin2', enabled: false, settings: { key: 'value' } },
      ];
      mockGetPlugins.mockReturnValue(plugins);
      mockShowQuickPick.mockResolvedValue({
        label: 'plugin1',
        description: 'enabled',
        plugin: plugins[0],
      });
      mockShowInputBox.mockResolvedValue('{}');

      await configurePlugin(mockVscode);

      expect(mockShowQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ label: 'plugin1', description: 'enabled' }),
          expect.objectContaining({ label: 'plugin2', description: 'disabled' }),
        ]),
        expect.objectContaining({
          placeHolder: 'Select a plugin to configure',
          title: 'Configure Plugin',
        })
      );
    });

    it('should do nothing when user cancels quick pick', async () => {
      mockGetPlugins.mockReturnValue([{ id: 'plugin1', enabled: true, settings: {} }]);
      mockShowQuickPick.mockResolvedValue(undefined);

      await configurePlugin(mockVscode);

      expect(mockShowInputBox).not.toHaveBeenCalled();
      expect(mockSavePluginConfig).not.toHaveBeenCalled();
    });

    it('should show input box with current settings when plugin selected', async () => {
      const plugin: PluginConfig = { id: 'plugin1', enabled: true, settings: { key: 'value' } };
      mockGetPlugins.mockReturnValue([plugin]);
      mockShowInputBox.mockResolvedValue(undefined);

      await configurePlugin(mockVscode, plugin);

      expect(mockShowInputBox).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Edit settings for plugin1 (JSON format)',
          value: JSON.stringify(plugin.settings, null, 2),
        })
      );
    });

    it('should save new settings when valid JSON provided', async () => {
      const plugin: PluginConfig = { id: 'plugin1', enabled: true, settings: {} };
      mockGetPlugins.mockReturnValue([plugin]);
      mockShowInputBox.mockResolvedValue('{"newKey": "newValue"}');

      await configurePlugin(mockVscode, plugin);

      expect(mockSavePluginConfig).toHaveBeenCalledWith({
        ...plugin,
        settings: { newKey: 'newValue' },
      });
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Plugin plugin1 settings updated.');
    });

    it('should not save when user cancels input box', async () => {
      const plugin: PluginConfig = { id: 'plugin1', enabled: true, settings: {} };
      mockGetPlugins.mockReturnValue([plugin]);
      mockShowInputBox.mockResolvedValue(undefined);

      await configurePlugin(mockVscode, plugin);

      expect(mockSavePluginConfig).not.toHaveBeenCalled();
    });

    it('should show error when save fails', async () => {
      const plugin: PluginConfig = { id: 'plugin1', enabled: true, settings: {} };
      mockGetPlugins.mockReturnValue([plugin]);
      mockShowInputBox.mockResolvedValue('{}');
      mockSavePluginConfig.mockRejectedValue(new Error('Save failed'));

      await configurePlugin(mockVscode, plugin);

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        'Failed to save plugin settings: Save failed'
      );
    });
  });

  describe('enablePlugin', () => {
    it('should show message when no plugins configured', async () => {
      mockGetPlugins.mockReturnValue([]);

      await enablePlugin(mockVscode);

      expect(mockShowInformationMessage).toHaveBeenCalledWith('No plugins configured.');
    });

    it('should show message when all plugins already enabled', async () => {
      mockGetPlugins.mockReturnValue([
        { id: 'plugin1', enabled: true, settings: {} },
        { id: 'plugin2', enabled: true, settings: {} },
      ]);

      await enablePlugin(mockVscode);

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'All plugins are already enabled.'
      );
    });

    it('should show quick pick with only disabled plugins', async () => {
      const plugins: PluginConfig[] = [
        { id: 'plugin1', enabled: true, settings: {} },
        { id: 'plugin2', enabled: false, settings: {} },
      ];
      mockGetPlugins.mockReturnValue(plugins);
      mockShowQuickPick.mockResolvedValue(undefined);

      await enablePlugin(mockVscode);

      expect(mockShowQuickPick).toHaveBeenCalledWith(
        [expect.objectContaining({ label: 'plugin2', description: 'disabled' })],
        expect.anything()
      );
    });

    it('should enable plugin when selected', async () => {
      const plugin: PluginConfig = { id: 'plugin1', enabled: false, settings: {} };
      mockGetPlugins.mockReturnValue([plugin]);

      await enablePlugin(mockVscode, plugin);

      expect(mockSavePluginConfig).toHaveBeenCalledWith({
        ...plugin,
        enabled: true,
      });
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Plugin plugin1 enabled.');
    });

    it('should show message when plugin already enabled', async () => {
      const plugin: PluginConfig = { id: 'plugin1', enabled: true, settings: {} };
      mockGetPlugins.mockReturnValue([plugin]);

      await enablePlugin(mockVscode, plugin);

      expect(mockSavePluginConfig).not.toHaveBeenCalled();
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Plugin plugin1 is already enabled.'
      );
    });

    it('should show error when save fails', async () => {
      const plugin: PluginConfig = { id: 'plugin1', enabled: false, settings: {} };
      mockGetPlugins.mockReturnValue([plugin]);
      mockSavePluginConfig.mockRejectedValue(new Error('Save failed'));

      await enablePlugin(mockVscode, plugin);

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        'Failed to enable plugin: Save failed'
      );
    });
  });

  describe('disablePlugin', () => {
    it('should show message when no plugins configured', async () => {
      mockGetPlugins.mockReturnValue([]);

      await disablePlugin(mockVscode);

      expect(mockShowInformationMessage).toHaveBeenCalledWith('No plugins configured.');
    });

    it('should show message when all plugins already disabled', async () => {
      mockGetPlugins.mockReturnValue([
        { id: 'plugin1', enabled: false, settings: {} },
        { id: 'plugin2', enabled: false, settings: {} },
      ]);

      await disablePlugin(mockVscode);

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'All plugins are already disabled.'
      );
    });

    it('should show quick pick with only enabled plugins', async () => {
      const plugins: PluginConfig[] = [
        { id: 'plugin1', enabled: true, settings: {} },
        { id: 'plugin2', enabled: false, settings: {} },
      ];
      mockGetPlugins.mockReturnValue(plugins);
      mockShowQuickPick.mockResolvedValue(undefined);

      await disablePlugin(mockVscode);

      expect(mockShowQuickPick).toHaveBeenCalledWith(
        [expect.objectContaining({ label: 'plugin1', description: 'enabled' })],
        expect.anything()
      );
    });

    it('should disable plugin when selected', async () => {
      const plugin: PluginConfig = { id: 'plugin1', enabled: true, settings: {} };
      mockGetPlugins.mockReturnValue([plugin]);

      await disablePlugin(mockVscode, plugin);

      expect(mockSavePluginConfig).toHaveBeenCalledWith({
        ...plugin,
        enabled: false,
      });
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Plugin plugin1 disabled.');
    });

    it('should show message when plugin already disabled', async () => {
      const plugin: PluginConfig = { id: 'plugin1', enabled: false, settings: {} };
      mockGetPlugins.mockReturnValue([plugin]);

      await disablePlugin(mockVscode, plugin);

      expect(mockSavePluginConfig).not.toHaveBeenCalled();
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Plugin plugin1 is already disabled.'
      );
    });

    it('should show error when save fails', async () => {
      const plugin: PluginConfig = { id: 'plugin1', enabled: true, settings: {} };
      mockGetPlugins.mockReturnValue([plugin]);
      mockSavePluginConfig.mockRejectedValue(new Error('Save failed'));

      await disablePlugin(mockVscode, plugin);

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        'Failed to disable plugin: Save failed'
      );
    });
  });

  describe('refreshPlugins', () => {
    it('should execute tree view refresh command', () => {
      refreshPlugins(mockVscode);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'workbench.actions.treeView.agency.plugins.refresh'
      );
    });

    it('should show information message', () => {
      refreshPlugins(mockVscode);

      expect(mockShowInformationMessage).toHaveBeenCalledWith('Plugins refreshed.');
    });
  });

  describe('registerPluginCommands', () => {
    it('should register all plugin commands', () => {
      const disposables = registerPluginCommands(mockVscode);

      expect(disposables).toHaveLength(4);
      expect(mockRegisterCommand).toHaveBeenCalledTimes(4);
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'agency.configurePlugin',
        expect.any(Function)
      );
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'agency.enablePlugin',
        expect.any(Function)
      );
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'agency.disablePlugin',
        expect.any(Function)
      );
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'agency.refreshPlugins',
        expect.any(Function)
      );
    });

    it('should return disposables', () => {
      const disposables = registerPluginCommands(mockVscode);

      for (const disposable of disposables) {
        expect(disposable).toHaveProperty('dispose');
        expect(typeof disposable.dispose).toBe('function');
      }
    });
  });
});
