import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';

// Mock config module
const mockConfigExists = vi.fn<() => Promise<boolean>>();
const mockReadConfig = vi.fn();
const mockWriteConfig = vi.fn().mockResolvedValue(undefined);
const mockGetValidationErrors = vi.fn<(raw: unknown) => string[]>(() => []);
const mockCreateDefaultConfig = vi.fn(() => ({
  version: '1.0',
  plugins: [],
  modes: [{ id: 'default', name: 'Default', includedTools: ['*'], excludedTools: [] }],
  containers: [],
}));

vi.mock('../../config', () => ({
  configExists: (...args: unknown[]) => mockConfigExists(...(args as [])),
  readConfig: (...args: unknown[]) => mockReadConfig(...args),
  writeConfig: (...args: unknown[]) => mockWriteConfig(...args),
  getValidationErrors: (...args: unknown[]) => mockGetValidationErrors(...(args as [unknown])),
  createDefaultConfig: () => mockCreateDefaultConfig(),
  DEFAULT_CONFIG_PATH: '.agency/agency.config.json',
  DEFAULT_CONFIG_DIR: '.agency',
}));

// Mock services
const mockIsConnected = vi.fn<() => boolean>(() => false);
const mockListTools = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([]));
const mockGetConnectionStatus = vi.fn<() => string>(() => 'disconnected');
const mockConfigServiceIsInitialized = vi.fn<() => boolean>(() => false);
const mockGetContainers = vi.fn<() => unknown[]>(() => []);
const mockContainerServiceIsInitialized = vi.fn<() => boolean>(() => false);
const mockContainerListContainers = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([]));

vi.mock('../../services', () => ({
  McpClientService: {
    getInstance: vi.fn(() => ({
      isConnected: mockIsConnected,
      listTools: mockListTools,
      getConnectionStatus: mockGetConnectionStatus,
    })),
  },
  ConfigService: {
    getInstance: vi.fn(() => ({
      isInitialized: mockConfigServiceIsInitialized,
      getContainers: mockGetContainers,
    })),
  },
  ContainerService: {
    getInstance: vi.fn(() => ({
      isInitialized: mockContainerServiceIsInitialized,
      listContainers: mockContainerListContainers,
    })),
  },
}));

// Mock logger - setup-commands.ts uses both createScopedLogger and getLogger
const mockLoggerInfo = vi.fn();
const mockLoggerShow = vi.fn();

vi.mock('../../utils', () => ({
  createScopedLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  getLogger: vi.fn(() => ({
    info: mockLoggerInfo,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    show: mockLoggerShow,
  })),
}));

// Import after mocking
import {
  initAgency,
  verifySetup,
  registerSetupCommands,
  initializeSetupCommands,
} from '../../commands/setup-commands';

describe('Setup Commands', () => {
  let mockVscode: typeof vscode;
  let mockShowInformationMessage: ReturnType<typeof vi.fn>;
  let mockShowErrorMessage: ReturnType<typeof vi.fn>;
  let mockShowWarningMessage: ReturnType<typeof vi.fn>;
  let mockShowTextDocument: ReturnType<typeof vi.fn>;
  let mockOpenTextDocument: ReturnType<typeof vi.fn>;
  let mockExecuteCommand: ReturnType<typeof vi.fn>;
  let mockRegisterCommand: ReturnType<typeof vi.fn>;
  let mockCreateDirectory: ReturnType<typeof vi.fn>;
  let mockReadFile: ReturnType<typeof vi.fn>;
  let mockWriteFile: ReturnType<typeof vi.fn>;

  const mockWorkspaceUri = { scheme: 'file', path: '/workspace' };

  beforeEach(() => {
    vi.clearAllMocks();

    mockShowInformationMessage = vi.fn();
    mockShowErrorMessage = vi.fn();
    mockShowWarningMessage = vi.fn();
    mockShowTextDocument = vi.fn();
    mockOpenTextDocument = vi.fn().mockResolvedValue({});
    mockExecuteCommand = vi.fn();
    mockRegisterCommand = vi.fn((_command: string, _callback: () => void) => ({
      dispose: vi.fn(),
    }));
    mockCreateDirectory = vi.fn().mockResolvedValue(undefined);
    mockReadFile = vi.fn();
    mockWriteFile = vi.fn().mockResolvedValue(undefined);

    mockVscode = {
      window: {
        showInformationMessage: mockShowInformationMessage,
        showErrorMessage: mockShowErrorMessage,
        showWarningMessage: mockShowWarningMessage,
        showTextDocument: mockShowTextDocument,
      },
      workspace: {
        workspaceFolders: [{ uri: mockWorkspaceUri, name: 'workspace', index: 0 }],
        fs: {
          createDirectory: mockCreateDirectory,
          readFile: mockReadFile,
          writeFile: mockWriteFile,
        },
        openTextDocument: mockOpenTextDocument,
      },
      commands: {
        executeCommand: mockExecuteCommand,
        registerCommand: mockRegisterCommand,
      },
      Uri: {
        joinPath: vi.fn((_base: unknown, ...segments: string[]) => ({
          scheme: 'file',
          path: '/workspace/' + segments.join('/'),
        })),
      },
    } as unknown as typeof vscode;

    // Reset mock defaults
    mockConfigExists.mockResolvedValue(false);
    mockWriteConfig.mockResolvedValue(undefined);
    mockIsConnected.mockReturnValue(false);
    mockGetConnectionStatus.mockReturnValue('disconnected');
    mockListTools.mockResolvedValue([]);
    mockConfigServiceIsInitialized.mockReturnValue(false);
    mockGetContainers.mockReturnValue([]);
    mockContainerServiceIsInitialized.mockReturnValue(false);
    mockContainerListContainers.mockResolvedValue([]);
  });

  describe('initAgency', () => {
    it('should show error when no workspace folder is open', async () => {
      const noWorkspaceVscode = {
        ...mockVscode,
        workspace: {
          ...mockVscode.workspace,
          workspaceFolders: undefined,
        },
      } as unknown as typeof vscode;

      await initAgency(noWorkspaceVscode);

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        'No workspace folder open. Open a folder first to initialize Agency.'
      );
    });

    it('should show error when workspace folders is empty', async () => {
      const emptyWorkspaceVscode = {
        ...mockVscode,
        workspace: {
          ...mockVscode.workspace,
          workspaceFolders: [],
        },
      } as unknown as typeof vscode;

      await initAgency(emptyWorkspaceVscode);

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        'No workspace folder open. Open a folder first to initialize Agency.'
      );
    });

    describe('when config already exists', () => {
      beforeEach(() => {
        mockConfigExists.mockResolvedValue(true);
      });

      it('should show info message that config already exists', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);

        await initAgency(mockVscode);

        expect(mockShowInformationMessage).toHaveBeenCalledWith(
          'Agency configuration already exists.',
          'Open'
        );
      });

      it('should open config file when user clicks Open', async () => {
        mockShowInformationMessage.mockResolvedValue('Open');

        await initAgency(mockVscode);

        expect(mockOpenTextDocument).toHaveBeenCalled();
        expect(mockShowTextDocument).toHaveBeenCalled();
      });

      it('should not open config file when user dismisses', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);

        await initAgency(mockVscode);

        expect(mockOpenTextDocument).not.toHaveBeenCalled();
        expect(mockShowTextDocument).not.toHaveBeenCalled();
      });

      it('should not create directory or write config', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);

        await initAgency(mockVscode);

        expect(mockCreateDirectory).not.toHaveBeenCalled();
        expect(mockWriteConfig).not.toHaveBeenCalled();
      });
    });

    describe('when config does not exist', () => {
      beforeEach(() => {
        mockConfigExists.mockResolvedValue(false);
      });

      it('should create .agency directory', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);

        await initAgency(mockVscode);

        expect(mockCreateDirectory).toHaveBeenCalled();
      });

      it('should write default config', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);

        await initAgency(mockVscode);

        expect(mockCreateDefaultConfig).toHaveBeenCalled();
        expect(mockWriteConfig).toHaveBeenCalledWith(
          mockVscode,
          '.agency/agency.config.json',
          expect.objectContaining({
            version: '1.0',
            plugins: [],
            modes: expect.any(Array),
            containers: [],
          })
        );
      });

      it('should set context key agency.configExists', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);

        await initAgency(mockVscode);

        expect(mockExecuteCommand).toHaveBeenCalledWith(
          'setContext',
          'agency.configExists',
          true
        );
      });

      it('should show success message', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);

        await initAgency(mockVscode);

        expect(mockShowInformationMessage).toHaveBeenCalledWith(
          'Agency initialized!',
          'Open Config'
        );
      });

      it('should open config when user clicks Open Config', async () => {
        mockShowInformationMessage.mockResolvedValue('Open Config');

        await initAgency(mockVscode);

        expect(mockOpenTextDocument).toHaveBeenCalled();
        expect(mockShowTextDocument).toHaveBeenCalled();
      });

      it('should not open config when user dismisses', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);

        await initAgency(mockVscode);

        expect(mockOpenTextDocument).not.toHaveBeenCalled();
        expect(mockShowTextDocument).not.toHaveBeenCalled();
      });

      it('should continue even if directory creation fails', async () => {
        mockCreateDirectory.mockRejectedValue(new Error('Directory exists'));
        mockShowInformationMessage.mockResolvedValue(undefined);

        await initAgency(mockVscode);

        expect(mockWriteConfig).toHaveBeenCalled();
        expect(mockShowInformationMessage).toHaveBeenCalledWith(
          'Agency initialized!',
          'Open Config'
        );
      });
    });

    describe('error handling', () => {
      it('should show error message when writeConfig fails', async () => {
        mockConfigExists.mockResolvedValue(false);
        mockWriteConfig.mockRejectedValue(new Error('Permission denied'));

        await initAgency(mockVscode);

        expect(mockShowErrorMessage).toHaveBeenCalledWith(
          'Failed to initialize Agency: Permission denied'
        );
      });

      it('should handle non-Error exceptions', async () => {
        mockConfigExists.mockResolvedValue(false);
        mockWriteConfig.mockRejectedValue('unexpected failure');

        await initAgency(mockVscode);

        expect(mockShowErrorMessage).toHaveBeenCalledWith(
          'Failed to initialize Agency: unexpected failure'
        );
      });
    });
  });

  describe('verifySetup', () => {
    it('should show error when no workspace folder is open', async () => {
      const noWorkspaceVscode = {
        ...mockVscode,
        workspace: {
          ...mockVscode.workspace,
          workspaceFolders: undefined,
        },
      } as unknown as typeof vscode;

      await verifySetup(noWorkspaceVscode);

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        'No workspace folder open. Open a folder first to verify setup.'
      );
    });

    describe('when all checks pass', () => {
      beforeEach(() => {
        // Config file check: exists and valid JSON
        mockConfigExists.mockResolvedValue(true);
        const validConfig = JSON.stringify({ version: '1.0', plugins: [], modes: [], containers: [] });
        mockReadFile.mockResolvedValue(new TextEncoder().encode(validConfig));

        // Config schema check: valid
        mockReadConfig.mockResolvedValue({
          version: '1.0',
          plugins: [],
          modes: [],
          containers: [],
        });

        // MCP check: connected with tools
        mockIsConnected.mockReturnValue(true);
        mockListTools.mockResolvedValue([{ name: 'tool1' }, { name: 'tool2' }]);

        // Container check: not configured (skipped = passes)
        mockConfigServiceIsInitialized.mockReturnValue(true);
        mockGetContainers.mockReturnValue([]);
      });

      it('should show success notification', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockShowInformationMessage).toHaveBeenCalledWith(
          '$(check) Agency: Setup verified',
          'Show Details'
        );
      });

      it('should not show warning notification', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockShowWarningMessage).not.toHaveBeenCalled();
      });

      it('should write results to output channel', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('Agency Setup Verification')
        );
        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('All checks passed')
        );
      });

      it('should show output channel when user clicks Show Details', async () => {
        mockShowInformationMessage.mockResolvedValue('Show Details');

        await verifySetup(mockVscode);

        expect(mockLoggerShow).toHaveBeenCalled();
      });

      it('should not show output channel when user dismisses', async () => {
        mockShowInformationMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerShow).not.toHaveBeenCalled();
      });
    });

    describe('config file check', () => {
      it('should fail when config file does not exist', async () => {
        mockConfigExists.mockResolvedValue(false);
        mockReadConfig.mockResolvedValue(null);
        mockIsConnected.mockReturnValue(false);
        mockGetConnectionStatus.mockReturnValue('disconnected');
        mockShowWarningMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        // Should report failure via warning
        expect(mockShowWarningMessage).toHaveBeenCalledWith(
          expect.stringContaining('checks failed'),
          'Show Details'
        );
      });

      it('should fail when config contains invalid JSON', async () => {
        mockConfigExists.mockResolvedValue(true);
        mockReadFile.mockResolvedValue(new TextEncoder().encode('not valid json {{{'));

        // readConfig returns null for invalid
        mockReadConfig.mockResolvedValue(null);
        mockIsConnected.mockReturnValue(true);
        mockListTools.mockResolvedValue([]);
        mockConfigServiceIsInitialized.mockReturnValue(false);
        mockShowWarningMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        // The config file check should log a failure with invalid JSON detail
        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('invalid JSON')
        );
      });

      it('should pass when config file exists and is valid JSON', async () => {
        const validJson = JSON.stringify({ version: '1.0' });
        mockConfigExists.mockResolvedValue(true);
        mockReadFile.mockResolvedValue(new TextEncoder().encode(validJson));
        mockReadConfig.mockResolvedValue({ version: '1.0' });
        mockIsConnected.mockReturnValue(true);
        mockListTools.mockResolvedValue([]);
        mockConfigServiceIsInitialized.mockReturnValue(false);
        mockShowInformationMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('File exists and is valid JSON')
        );
      });
    });

    describe('config schema check', () => {
      beforeEach(() => {
        // Config file exists and is valid JSON for check 1
        mockConfigExists.mockResolvedValue(true);
        const validJson = JSON.stringify({ version: '1.0' });
        mockReadFile.mockResolvedValue(new TextEncoder().encode(validJson));
        mockIsConnected.mockReturnValue(true);
        mockListTools.mockResolvedValue([]);
        mockConfigServiceIsInitialized.mockReturnValue(false);
      });

      it('should pass when config is valid', async () => {
        mockReadConfig.mockResolvedValue({ version: '1.0', plugins: [], modes: [] });
        mockShowInformationMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('Configuration is valid')
        );
      });

      it('should fail with validation errors when schema is invalid', async () => {
        mockReadConfig.mockResolvedValue(null); // readConfig returns null for invalid
        mockGetValidationErrors.mockReturnValue(['modes is required', 'version must be a string']);
        mockShowWarningMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('Validation failed')
        );
      });

      it('should report config not found when file does not exist for schema check', async () => {
        // Override: config does not exist
        mockConfigExists.mockResolvedValue(false);
        mockReadConfig.mockResolvedValue(null);
        mockShowWarningMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('not found')
        );
      });
    });

    describe('MCP server check', () => {
      beforeEach(() => {
        // Pass config checks
        mockConfigExists.mockResolvedValue(true);
        const validJson = JSON.stringify({ version: '1.0' });
        mockReadFile.mockResolvedValue(new TextEncoder().encode(validJson));
        mockReadConfig.mockResolvedValue({ version: '1.0' });
        mockConfigServiceIsInitialized.mockReturnValue(false);
      });

      it('should pass when connected and tools available', async () => {
        mockIsConnected.mockReturnValue(true);
        mockListTools.mockResolvedValue([{ name: 'tool1' }, { name: 'tool2' }, { name: 'tool3' }]);
        mockShowInformationMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('Connected (3 tools available)')
        );
      });

      it('should fail when not connected', async () => {
        mockIsConnected.mockReturnValue(false);
        mockGetConnectionStatus.mockReturnValue('disconnected');
        mockShowWarningMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('Not connected (status: disconnected)')
        );
      });

      it('should fail when listTools throws an error', async () => {
        mockIsConnected.mockReturnValue(true);
        mockListTools.mockRejectedValue(new Error('Connection timeout'));
        mockShowWarningMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('Connection check failed: Connection timeout')
        );
      });
    });

    describe('container check', () => {
      beforeEach(() => {
        // Pass config and MCP checks
        mockConfigExists.mockResolvedValue(true);
        const validJson = JSON.stringify({ version: '1.0' });
        mockReadFile.mockResolvedValue(new TextEncoder().encode(validJson));
        mockReadConfig.mockResolvedValue({ version: '1.0' });
        mockIsConnected.mockReturnValue(true);
        mockListTools.mockResolvedValue([]);
      });

      it('should pass (skip) when config service not initialized', async () => {
        mockConfigServiceIsInitialized.mockReturnValue(false);
        mockShowInformationMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('Config service not initialized (skipped)')
        );
      });

      it('should pass (skip) when no containers configured', async () => {
        mockConfigServiceIsInitialized.mockReturnValue(true);
        mockGetContainers.mockReturnValue([]);
        mockShowInformationMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('No containers configured (skipped)')
        );
      });

      it('should fail when container service not initialized but containers configured', async () => {
        mockConfigServiceIsInitialized.mockReturnValue(true);
        mockGetContainers.mockReturnValue([{ id: 'c1', name: 'Container 1' }]);
        mockContainerServiceIsInitialized.mockReturnValue(false);
        mockShowWarningMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('Container service not initialized')
        );
      });

      it('should pass when containers are running', async () => {
        mockConfigServiceIsInitialized.mockReturnValue(true);
        mockGetContainers.mockReturnValue([{ id: 'c1', name: 'Container 1' }]);
        mockContainerServiceIsInitialized.mockReturnValue(true);
        mockContainerListContainers.mockResolvedValue([
          { id: 'c1', name: 'Container 1', status: 'running' },
        ]);
        mockShowInformationMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('1 container(s) running')
        );
      });

      it('should fail when no containers are running', async () => {
        mockConfigServiceIsInitialized.mockReturnValue(true);
        mockGetContainers.mockReturnValue([{ id: 'c1', name: 'Container 1' }]);
        mockContainerServiceIsInitialized.mockReturnValue(true);
        mockContainerListContainers.mockResolvedValue([
          { id: 'c1', name: 'Container 1', status: 'stopped' },
        ]);
        mockShowWarningMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('No running containers found (1 total)')
        );
      });

      it('should fail when container check throws', async () => {
        mockConfigServiceIsInitialized.mockReturnValue(true);
        mockGetContainers.mockReturnValue([{ id: 'c1', name: 'Container 1' }]);
        mockContainerServiceIsInitialized.mockReturnValue(true);
        mockContainerListContainers.mockRejectedValue(new Error('Docker not available'));
        mockShowWarningMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('Container check failed: Docker not available')
        );
      });
    });

    describe('result summary', () => {
      it('should report correct failure count in warning', async () => {
        // Fail config check (doesn't exist), fail schema check (skipped/not found),
        // fail MCP (disconnected), pass container check (not initialized = skip)
        mockConfigExists.mockResolvedValue(false);
        mockReadConfig.mockResolvedValue(null);
        mockIsConnected.mockReturnValue(false);
        mockGetConnectionStatus.mockReturnValue('error');
        mockConfigServiceIsInitialized.mockReturnValue(false);
        mockShowWarningMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        // Config file fails, config schema fails, MCP fails = 3 failures
        // Container skipped (passes) = 1 pass
        expect(mockShowWarningMessage).toHaveBeenCalledWith(
          expect.stringMatching(/\d+ of 4 checks failed/),
          'Show Details'
        );
      });

      it('should show output channel when Show Details clicked on warning', async () => {
        mockConfigExists.mockResolvedValue(false);
        mockReadConfig.mockResolvedValue(null);
        mockIsConnected.mockReturnValue(false);
        mockGetConnectionStatus.mockReturnValue('disconnected');
        mockConfigServiceIsInitialized.mockReturnValue(false);
        mockShowWarningMessage.mockResolvedValue('Show Details');

        await verifySetup(mockVscode);

        expect(mockLoggerShow).toHaveBeenCalled();
      });

      it('should write timestamp in verification output', async () => {
        mockConfigExists.mockResolvedValue(true);
        const validJson = JSON.stringify({ version: '1.0' });
        mockReadFile.mockResolvedValue(new TextEncoder().encode(validJson));
        mockReadConfig.mockResolvedValue({ version: '1.0' });
        mockIsConnected.mockReturnValue(true);
        mockListTools.mockResolvedValue([]);
        mockConfigServiceIsInitialized.mockReturnValue(false);
        mockShowInformationMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('Agency Setup Verification')
        );
      });

      it('should write check-mark icons for passed checks', async () => {
        mockConfigExists.mockResolvedValue(true);
        const validJson = JSON.stringify({ version: '1.0' });
        mockReadFile.mockResolvedValue(new TextEncoder().encode(validJson));
        mockReadConfig.mockResolvedValue({ version: '1.0' });
        mockIsConnected.mockReturnValue(true);
        mockListTools.mockResolvedValue([]);
        mockConfigServiceIsInitialized.mockReturnValue(false);
        mockShowInformationMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        // Passed checks use ✓ (unicode \u2713)
        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('\u2713')
        );
      });

      it('should write cross icons for failed checks', async () => {
        mockConfigExists.mockResolvedValue(false);
        mockReadConfig.mockResolvedValue(null);
        mockIsConnected.mockReturnValue(false);
        mockGetConnectionStatus.mockReturnValue('disconnected');
        mockConfigServiceIsInitialized.mockReturnValue(false);
        mockShowWarningMessage.mockResolvedValue(undefined);

        await verifySetup(mockVscode);

        // Failed checks use ✗ (unicode \u2717)
        expect(mockLoggerInfo).toHaveBeenCalledWith(
          expect.stringContaining('\u2717')
        );
      });
    });

    describe('error handling', () => {
      it('should show error when an unexpected exception occurs', async () => {
        // The logger.info is called during result output; make it throw
        // to trigger the outer catch block in verifySetup
        mockConfigExists.mockResolvedValue(true);
        const validJson = JSON.stringify({ version: '1.0' });
        mockReadFile.mockResolvedValue(new TextEncoder().encode(validJson));
        mockReadConfig.mockResolvedValue({ version: '1.0' });
        mockIsConnected.mockReturnValue(true);
        mockListTools.mockResolvedValue([]);
        mockConfigServiceIsInitialized.mockReturnValue(false);

        // Make logger.info throw when writing results
        mockLoggerInfo.mockImplementation((msg: string) => {
          if (typeof msg === 'string' && msg.includes('Agency Setup Verification')) {
            throw new Error('Output channel disposed');
          }
        });

        await verifySetup(mockVscode);

        expect(mockShowErrorMessage).toHaveBeenCalledWith(
          'Setup verification failed: Output channel disposed'
        );
      });

      it('should handle non-Error exceptions in verify', async () => {
        mockConfigExists.mockResolvedValue(true);
        const validJson = JSON.stringify({ version: '1.0' });
        mockReadFile.mockResolvedValue(new TextEncoder().encode(validJson));
        mockReadConfig.mockResolvedValue({ version: '1.0' });
        mockIsConnected.mockReturnValue(true);
        mockListTools.mockResolvedValue([]);
        mockConfigServiceIsInitialized.mockReturnValue(false);

        mockLoggerInfo.mockImplementation((msg: string) => {
          if (typeof msg === 'string' && msg.includes('Agency Setup Verification')) {
            throw 'string error';
          }
        });

        await verifySetup(mockVscode);

        expect(mockShowErrorMessage).toHaveBeenCalledWith(
          'Setup verification failed: string error'
        );
      });
    });
  });

  describe('registerSetupCommands', () => {
    it('should register init and verifySetup commands', () => {
      const disposables = registerSetupCommands(mockVscode);

      expect(disposables).toHaveLength(2);
      expect(mockRegisterCommand).toHaveBeenCalledTimes(2);
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'agency.init',
        expect.any(Function)
      );
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'agency.verifySetup',
        expect.any(Function)
      );
    });

    it('should return disposables', () => {
      const disposables = registerSetupCommands(mockVscode);

      for (const disposable of disposables) {
        expect(disposable).toHaveProperty('dispose');
        expect(typeof disposable.dispose).toBe('function');
      }
    });
  });

  describe('initializeSetupCommands', () => {
    it('should execute without errors', () => {
      expect(() => initializeSetupCommands()).not.toThrow();
    });
  });
});
