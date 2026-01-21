import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import {
  readConfig,
  writeConfig,
  configExists,
  initializeConfig,
  watchConfig,
} from '../../config/ConfigFile';
import { createDefaultConfig, DEFAULT_CONFIG_PATH } from '../../config/defaults';
import type { AgencyConfig } from '../../config/ConfigSchema';

// Mock the logger to avoid output during tests
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

describe('ConfigFile', () => {
  let mockVscode: typeof vscode;
  let mockFileSystem: Map<string, Uint8Array>;
  let mockWatchers: Array<{
    onDidChange: vscode.Event<vscode.Uri>;
    onDidCreate: vscode.Event<vscode.Uri>;
    onDidDelete: vscode.Event<vscode.Uri>;
    dispose: () => void;
  }>;

  beforeEach(() => {
    mockFileSystem = new Map();
    mockWatchers = [];

    const changeListeners: Array<(uri: vscode.Uri) => void> = [];
    const createListeners: Array<(uri: vscode.Uri) => void> = [];
    const deleteListeners: Array<(uri: vscode.Uri) => void> = [];

    mockVscode = {
      workspace: {
        workspaceFolders: [
          {
            uri: { fsPath: '/workspace', path: '/workspace' } as vscode.Uri,
            name: 'workspace',
            index: 0,
          },
        ],
        fs: {
          readFile: vi.fn(async (uri: vscode.Uri) => {
            const path = uri.fsPath || uri.path;
            const data = mockFileSystem.get(path);
            if (!data) {
              const error = new Error('File not found') as Error & { code: string };
              error.code = 'FileNotFound';
              throw error;
            }
            return data;
          }),
          writeFile: vi.fn(async (uri: vscode.Uri, content: Uint8Array) => {
            const path = uri.fsPath || uri.path;
            mockFileSystem.set(path, content);
          }),
          stat: vi.fn(async (uri: vscode.Uri) => {
            const path = uri.fsPath || uri.path;
            if (!mockFileSystem.has(path)) {
              const error = new Error('File not found') as Error & { code: string };
              error.code = 'FileNotFound';
              throw error;
            }
            return { type: 1 }; // FileType.File
          }),
          createDirectory: vi.fn(async () => {}),
        },
        createFileSystemWatcher: vi.fn(() => {
          const watcher = {
            onDidChange: vi.fn((listener: (uri: vscode.Uri) => void) => {
              changeListeners.push(listener);
              return { dispose: vi.fn() };
            }),
            onDidCreate: vi.fn((listener: (uri: vscode.Uri) => void) => {
              createListeners.push(listener);
              return { dispose: vi.fn() };
            }),
            onDidDelete: vi.fn((listener: (uri: vscode.Uri) => void) => {
              deleteListeners.push(listener);
              return { dispose: vi.fn() };
            }),
            dispose: vi.fn(),
          };
          mockWatchers.push(watcher);
          return watcher;
        }),
      },
      Uri: {
        joinPath: vi.fn((base: vscode.Uri, ...paths: string[]) => {
          const basePath = base.fsPath || base.path;
          const fullPath = [basePath, ...paths].join('/');
          return { fsPath: fullPath, path: fullPath } as vscode.Uri;
        }),
      },
      RelativePattern: vi.fn((folder, pattern) => ({ folder, pattern })),
    } as unknown as typeof vscode;
  });

  const setFileContent = (path: string, content: string) => {
    mockFileSystem.set(path, new TextEncoder().encode(content));
  };

  const getFileContent = (path: string): string | undefined => {
    const data = mockFileSystem.get(path);
    return data ? new TextDecoder().decode(data) : undefined;
  };

  describe('readConfig', () => {
    it('should read and parse valid config file', async () => {
      const validConfig: AgencyConfig = {
        version: '1.0.0',
        plugins: [{ id: 'test-plugin', enabled: true, settings: {} }],
        modes: [{ id: 'default', name: 'Default', tools: [] }],
        containers: [],
      };
      setFileContent('/workspace/.agency/agency.config.json', JSON.stringify(validConfig));

      const result = await readConfig(mockVscode, DEFAULT_CONFIG_PATH);

      expect(result).not.toBeNull();
      expect(result?.version).toBe('1.0.0');
      expect(result?.plugins).toHaveLength(1);
    });

    it('should return null for missing file', async () => {
      const result = await readConfig(mockVscode, DEFAULT_CONFIG_PATH);
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
      setFileContent('/workspace/.agency/agency.config.json', '{ invalid json }');

      const result = await readConfig(mockVscode, DEFAULT_CONFIG_PATH);
      expect(result).toBeNull();
    });

    it('should return null for invalid schema', async () => {
      setFileContent(
        '/workspace/.agency/agency.config.json',
        JSON.stringify({ plugins: [{ id: '' }] }) // Invalid: empty id
      );

      const result = await readConfig(mockVscode, DEFAULT_CONFIG_PATH);
      expect(result).toBeNull();
    });

    it('should return null when no workspace is open', async () => {
      mockVscode.workspace.workspaceFolders = undefined;

      const result = await readConfig(mockVscode, DEFAULT_CONFIG_PATH);
      expect(result).toBeNull();
    });
  });

  describe('writeConfig', () => {
    it('should write valid config to file', async () => {
      const config = createDefaultConfig();

      await writeConfig(mockVscode, DEFAULT_CONFIG_PATH, config);

      const content = getFileContent('/workspace/.agency/agency.config.json');
      expect(content).toBeDefined();

      const parsed = JSON.parse(content!);
      expect(parsed.version).toBe(config.version);
    });

    it('should create directory if needed', async () => {
      const config = createDefaultConfig();

      await writeConfig(mockVscode, DEFAULT_CONFIG_PATH, config);

      expect(mockVscode.workspace.fs.createDirectory).toHaveBeenCalled();
    });

    it('should throw for invalid config', async () => {
      const invalidConfig = { plugins: [{ id: '' }] } as AgencyConfig;

      await expect(writeConfig(mockVscode, DEFAULT_CONFIG_PATH, invalidConfig)).rejects.toThrow(
        'Invalid configuration'
      );
    });

    it('should throw when no workspace is open', async () => {
      mockVscode.workspace.workspaceFolders = undefined;
      const config = createDefaultConfig();

      await expect(writeConfig(mockVscode, DEFAULT_CONFIG_PATH, config)).rejects.toThrow(
        'No workspace folder open'
      );
    });

    it('should format JSON with indentation', async () => {
      const config = createDefaultConfig();

      await writeConfig(mockVscode, DEFAULT_CONFIG_PATH, config);

      const content = getFileContent('/workspace/.agency/agency.config.json');
      expect(content).toContain('\n'); // Should have newlines
      expect(content).toContain('  '); // Should have indentation
    });
  });

  describe('configExists', () => {
    it('should return true when file exists', async () => {
      setFileContent('/workspace/.agency/agency.config.json', '{}');

      const result = await configExists(mockVscode, DEFAULT_CONFIG_PATH);
      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      const result = await configExists(mockVscode, DEFAULT_CONFIG_PATH);
      expect(result).toBe(false);
    });

    it('should return false when no workspace is open', async () => {
      mockVscode.workspace.workspaceFolders = undefined;

      const result = await configExists(mockVscode, DEFAULT_CONFIG_PATH);
      expect(result).toBe(false);
    });
  });

  describe('initializeConfig', () => {
    it('should return existing config if file exists', async () => {
      const existingConfig: AgencyConfig = {
        version: '1.0.0',
        plugins: [{ id: 'existing', enabled: true, settings: {} }],
        modes: [],
        containers: [],
      };
      setFileContent('/workspace/.agency/agency.config.json', JSON.stringify(existingConfig));

      const result = await initializeConfig(mockVscode, DEFAULT_CONFIG_PATH);

      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].id).toBe('existing');
    });

    it('should create and return default config if file does not exist', async () => {
      const result = await initializeConfig(mockVscode, DEFAULT_CONFIG_PATH);

      expect(result.version).toBeDefined();
      expect(result.modes).toHaveLength(1);

      // Verify file was written
      const content = getFileContent('/workspace/.agency/agency.config.json');
      expect(content).toBeDefined();
    });
  });

  describe('watchConfig', () => {
    it('should create a file system watcher', () => {
      watchConfig(mockVscode, DEFAULT_CONFIG_PATH, vi.fn());

      expect(mockVscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    });

    it('should return a disposable', () => {
      const disposable = watchConfig(mockVscode, DEFAULT_CONFIG_PATH, vi.fn());

      expect(disposable).toHaveProperty('dispose');
    });

    it('should return no-op disposable when no workspace is open', () => {
      mockVscode.workspace.workspaceFolders = undefined;

      const disposable = watchConfig(mockVscode, DEFAULT_CONFIG_PATH, vi.fn());

      expect(disposable).toHaveProperty('dispose');
      expect(mockVscode.workspace.createFileSystemWatcher).not.toHaveBeenCalled();
    });

    it('should register change, create, and delete handlers', () => {
      watchConfig(mockVscode, DEFAULT_CONFIG_PATH, vi.fn());

      expect(mockWatchers).toHaveLength(1);
      const watcher = mockWatchers[0];
      expect(watcher.onDidChange).toHaveBeenCalled();
      expect(watcher.onDidCreate).toHaveBeenCalled();
      expect(watcher.onDidDelete).toHaveBeenCalled();
    });
  });
});
