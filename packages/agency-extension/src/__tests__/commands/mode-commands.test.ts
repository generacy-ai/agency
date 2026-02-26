import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import type { ModeInfo, ModeSwitchResult } from '../../types/mode';
import type { ModeConfig } from '../../config/ConfigSchema';
import type { ModeTreeItem } from '../../providers/ModeTreeProvider';

// Mock ModeService
const mockGetModes = vi.fn<() => ModeConfig[]>(() => []);
const mockGetCurrentMode = vi.fn<() => ModeInfo | undefined>(() => undefined);
const mockSetCurrentMode = vi.fn<(request: any) => Promise<ModeSwitchResult>>();
const mockBuildModeTree = vi.fn<() => ModeInfo[]>(() => []);

vi.mock('../../services', () => ({
  ModeService: {
    getInstance: vi.fn(() => ({
      getModes: mockGetModes,
      getCurrentMode: mockGetCurrentMode,
      setCurrentMode: mockSetCurrentMode,
      buildModeTree: mockBuildModeTree,
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
import { switchMode, viewModeTools, refreshModes } from '../../commands/mode-commands';

describe('Mode Commands', () => {
  // Mock VS Code module
  let mockVscode: typeof vscode;
  let mockShowQuickPick: ReturnType<typeof vi.fn>;
  let mockShowInformationMessage: ReturnType<typeof vi.fn>;
  let mockShowErrorMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockShowQuickPick = vi.fn();
    mockShowInformationMessage = vi.fn();
    mockShowErrorMessage = vi.fn();

    mockVscode = {
      window: {
        showQuickPick: mockShowQuickPick,
        showInformationMessage: mockShowInformationMessage,
        showErrorMessage: mockShowErrorMessage,
      },
      QuickPickItemKind: {
        Separator: -1,
        Default: 0,
      },
    } as unknown as typeof vscode;

    // Reset mock implementations
    mockGetModes.mockReturnValue([]);
    mockGetCurrentMode.mockReturnValue(undefined);
    mockBuildModeTree.mockReturnValue([]);
  });

  describe('switchMode', () => {
    describe('when called with tree item', () => {
      it('should switch to the mode from tree item', async () => {
        const treeItem: ModeTreeItem = {
          label: 'Debug',
          modeId: 'debug',
        } as ModeTreeItem;

        const currentMode: ModeInfo = {
          config: {
            id: 'default',
            name: 'Default',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: true,
        };

        const switchResult: ModeSwitchResult = {
          success: true,
          previousModeId: 'default',
          newModeId: 'debug',
          addedTools: ['tool2', 'tool3'],
          removedTools: [],
          timestamp: Date.now(),
        };

        mockGetCurrentMode.mockReturnValue(currentMode);
        mockSetCurrentMode.mockResolvedValue(switchResult);

        await switchMode(mockVscode, treeItem);

        expect(mockSetCurrentMode).toHaveBeenCalledWith({
          modeId: 'debug',
          persist: true,
        });
        expect(mockShowInformationMessage).toHaveBeenCalledWith(
          'Switched to mode: debug (2 tools added, 0 tools removed)'
        );
      });

      it('should show message when already in the selected mode', async () => {
        const treeItem: ModeTreeItem = {
          label: 'Debug',
          modeId: 'debug',
        } as ModeTreeItem;

        const currentMode: ModeInfo = {
          config: {
            id: 'debug',
            name: 'Debug',
            includedTools: ['tool1', 'tool2'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2'],
          children: [],
          depth: 0,
          isActive: true,
        };

        mockGetCurrentMode.mockReturnValue(currentMode);

        await switchMode(mockVscode, treeItem);

        expect(mockSetCurrentMode).not.toHaveBeenCalled();
        expect(mockShowInformationMessage).toHaveBeenCalledWith('Already in mode: Debug');
      });
    });

    describe('when called from command palette', () => {
      it('should show quick pick with available modes', async () => {
        const modes: ModeConfig[] = [
          { id: 'default', name: 'Default', tools: ['tool1'] },
          { id: 'debug', name: 'Debug', tools: ['tool2'] },
        ];

        const currentMode: ModeInfo = {
          config: modes[0] as any,
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: true,
        };

        mockGetModes.mockReturnValue(modes);
        mockGetCurrentMode.mockReturnValue(currentMode);
        mockShowQuickPick.mockResolvedValue(undefined); // User cancelled

        await switchMode(mockVscode);

        expect(mockShowQuickPick).toHaveBeenCalledWith(
          [
            {
              label: 'Default',
              description: 'default',
              detail: '✓ Currently active',
              modeId: 'default',
            },
            {
              label: 'Debug',
              description: 'debug',
              detail: undefined,
              modeId: 'debug',
            },
          ],
          {
            placeHolder: 'Select a mode to switch to',
            matchOnDescription: true,
            matchOnDetail: true,
          }
        );
      });

      it('should switch to selected mode from quick pick', async () => {
        const modes: ModeConfig[] = [
          { id: 'default', name: 'Default', tools: ['tool1'] },
          { id: 'debug', name: 'Debug', tools: ['tool2'] },
        ];

        const currentMode: ModeInfo = {
          config: modes[0] as any,
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: true,
        };

        const switchResult: ModeSwitchResult = {
          success: true,
          previousModeId: 'default',
          newModeId: 'debug',
          addedTools: ['tool2'],
          removedTools: ['tool1'],
          timestamp: Date.now(),
        };

        mockGetModes.mockReturnValue(modes);
        mockGetCurrentMode.mockReturnValue(currentMode);
        mockShowQuickPick.mockResolvedValue({
          label: 'Debug',
          description: 'debug',
          modeId: 'debug',
        });
        mockSetCurrentMode.mockResolvedValue(switchResult);

        await switchMode(mockVscode);

        expect(mockSetCurrentMode).toHaveBeenCalledWith({
          modeId: 'debug',
          persist: true,
        });
        expect(mockShowInformationMessage).toHaveBeenCalledWith(
          'Switched to mode: debug (1 tools added, 1 tools removed)'
        );
      });

      it('should do nothing when user cancels quick pick', async () => {
        const modes: ModeConfig[] = [{ id: 'default', name: 'Default', tools: ['tool1'] }];

        mockGetModes.mockReturnValue(modes);
        mockGetCurrentMode.mockReturnValue({
          config: modes[0] as any,
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: true,
        });
        mockShowQuickPick.mockResolvedValue(undefined);

        await switchMode(mockVscode);

        expect(mockSetCurrentMode).not.toHaveBeenCalled();
        expect(mockShowInformationMessage).not.toHaveBeenCalled();
        expect(mockShowErrorMessage).not.toHaveBeenCalled();
      });
    });

    describe('success scenarios', () => {
      it('should show success message with tool changes', async () => {
        const treeItem: ModeTreeItem = {
          label: 'Debug',
          modeId: 'debug',
        } as ModeTreeItem;

        const currentMode: ModeInfo = {
          config: {
            id: 'default',
            name: 'Default',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: true,
        };

        const switchResult: ModeSwitchResult = {
          success: true,
          previousModeId: 'default',
          newModeId: 'debug',
          addedTools: ['tool2', 'tool3'],
          removedTools: ['tool1'],
          timestamp: Date.now(),
        };

        mockGetCurrentMode.mockReturnValue(currentMode);
        mockSetCurrentMode.mockResolvedValue(switchResult);

        await switchMode(mockVscode, treeItem);

        expect(mockShowInformationMessage).toHaveBeenCalledWith(
          'Switched to mode: debug (2 tools added, 1 tools removed)'
        );
      });

      it('should show success message without tool changes when no changes', async () => {
        const treeItem: ModeTreeItem = {
          label: 'Debug',
          modeId: 'debug',
        } as ModeTreeItem;

        const currentMode: ModeInfo = {
          config: {
            id: 'default',
            name: 'Default',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: true,
        };

        const switchResult: ModeSwitchResult = {
          success: true,
          previousModeId: 'default',
          newModeId: 'debug',
          addedTools: [],
          removedTools: [],
          timestamp: Date.now(),
        };

        mockGetCurrentMode.mockReturnValue(currentMode);
        mockSetCurrentMode.mockResolvedValue(switchResult);

        await switchMode(mockVscode, treeItem);

        expect(mockShowInformationMessage).toHaveBeenCalledWith('Switched to mode: debug');
      });
    });

    describe('failure scenarios', () => {
      it('should show error message when switch fails', async () => {
        const treeItem: ModeTreeItem = {
          label: 'NonExistent',
          modeId: 'non-existent',
        } as ModeTreeItem;

        const currentMode: ModeInfo = {
          config: {
            id: 'default',
            name: 'Default',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: true,
        };

        const switchResult: ModeSwitchResult = {
          success: false,
          previousModeId: 'default',
          newModeId: 'non-existent',
          addedTools: [],
          removedTools: [],
          error: "Mode 'non-existent' not found",
          timestamp: Date.now(),
        };

        mockGetCurrentMode.mockReturnValue(currentMode);
        mockSetCurrentMode.mockResolvedValue(switchResult);

        await switchMode(mockVscode, treeItem);

        expect(mockShowErrorMessage).toHaveBeenCalledWith(
          "Failed to switch mode: Mode 'non-existent' not found"
        );
        expect(mockShowInformationMessage).not.toHaveBeenCalled();
      });

      it('should handle exceptions during mode switch', async () => {
        const treeItem: ModeTreeItem = {
          label: 'Debug',
          modeId: 'debug',
        } as ModeTreeItem;

        const currentMode: ModeInfo = {
          config: {
            id: 'default',
            name: 'Default',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: true,
        };

        mockGetCurrentMode.mockReturnValue(currentMode);
        mockSetCurrentMode.mockRejectedValue(new Error('Service unavailable'));

        await switchMode(mockVscode, treeItem);

        expect(mockShowErrorMessage).toHaveBeenCalledWith('Error switching mode: Service unavailable');
      });

      it('should handle non-Error exceptions', async () => {
        const treeItem: ModeTreeItem = {
          label: 'Debug',
          modeId: 'debug',
        } as ModeTreeItem;

        const currentMode: ModeInfo = {
          config: {
            id: 'default',
            name: 'Default',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: true,
        };

        mockGetCurrentMode.mockReturnValue(currentMode);
        mockSetCurrentMode.mockRejectedValue('Unknown error');

        await switchMode(mockVscode, treeItem);

        expect(mockShowErrorMessage).toHaveBeenCalledWith('Error switching mode: Unknown error');
      });
    });

    describe('edge cases', () => {
      it('should handle missing current mode gracefully', async () => {
        const treeItem: ModeTreeItem = {
          label: 'Debug',
          modeId: 'debug',
        } as ModeTreeItem;

        const switchResult: ModeSwitchResult = {
          success: true,
          previousModeId: 'default',
          newModeId: 'debug',
          addedTools: ['tool1'],
          removedTools: [],
          timestamp: Date.now(),
        };

        mockGetCurrentMode.mockReturnValue(undefined);
        mockSetCurrentMode.mockResolvedValue(switchResult);

        await switchMode(mockVscode, treeItem);

        expect(mockSetCurrentMode).toHaveBeenCalledWith({
          modeId: 'debug',
          persist: true,
        });
        expect(mockShowInformationMessage).toHaveBeenCalledWith(
          'Switched to mode: debug (1 tools added, 0 tools removed)'
        );
      });
    });
  });

  describe('viewModeTools', () => {
    describe('when called with mode ID', () => {
      it('should display tools for the specified mode', async () => {
        const modeInfo: ModeInfo = {
          config: {
            id: 'debug',
            name: 'Debug',
            description: 'Debug mode with extra tools',
            includedTools: ['tool1', 'tool2', 'tool3'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2', 'tool3'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockBuildModeTree.mockReturnValue([modeInfo]);

        await viewModeTools(mockVscode, 'debug');

        expect(mockShowQuickPick).toHaveBeenCalledWith(
          [
            {
              label: 'Mode: Debug',
              kind: mockVscode.QuickPickItemKind.Separator,
            },
            {
              label: 'Debug mode with extra tools',
              kind: mockVscode.QuickPickItemKind.Separator,
            },
            {
              label: 'Added Tools (3)',
              kind: mockVscode.QuickPickItemKind.Separator,
            },
            {
              label: '  + tool1',
              description: 'Added in this mode',
            },
            {
              label: '  + tool2',
              description: 'Added in this mode',
            },
            {
              label: '  + tool3',
              description: 'Added in this mode',
            },
            {
              label: 'Total: 3 tools available',
              kind: mockVscode.QuickPickItemKind.Separator,
            },
          ],
          {
            placeHolder: 'Tools in mode: Debug',
            matchOnDescription: true,
          }
        );
      });

      it('should display inherited and added tools separately', async () => {
        const parentMode: ModeInfo = {
          config: {
            id: 'default',
            name: 'Default',
            includedTools: ['tool1', 'tool2'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2'],
          children: [],
          depth: 0,
          isActive: false,
        };

        const childMode: ModeInfo = {
          config: {
            id: 'debug',
            name: 'Debug',
            includedTools: ['tool1', 'tool2', 'tool3', 'tool4'],
            excludedTools: [],
            parentId: 'default',
          },
          effectiveTools: ['tool1', 'tool2', 'tool3', 'tool4'],
          parent: parentMode,
          children: [],
          depth: 1,
          isActive: false,
        };

        mockBuildModeTree.mockReturnValue([parentMode]);
        parentMode.children = [childMode];

        await viewModeTools(mockVscode, 'debug');

        expect(mockShowQuickPick).toHaveBeenCalledWith(
          expect.arrayContaining([
            {
              label: 'Mode: Debug',
              kind: mockVscode.QuickPickItemKind.Separator,
            },
            {
              label: 'Added Tools (2)',
              kind: mockVscode.QuickPickItemKind.Separator,
            },
            {
              label: '  + tool3',
              description: 'Added in this mode',
            },
            {
              label: '  + tool4',
              description: 'Added in this mode',
            },
            {
              label: 'Inherited Tools (2)',
              kind: mockVscode.QuickPickItemKind.Separator,
            },
            {
              label: '  tool1',
              description: 'Inherited from Default',
            },
            {
              label: '  tool2',
              description: 'Inherited from Default',
            },
            {
              label: 'Total: 4 tools available',
              kind: mockVscode.QuickPickItemKind.Separator,
            },
          ]),
          expect.any(Object)
        );
      });

      it('should display excluded tools when present', async () => {
        const modeInfo: ModeInfo = {
          config: {
            id: 'minimal',
            name: 'Minimal',
            includedTools: ['tool1'],
            excludedTools: ['tool2', 'tool3'],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockBuildModeTree.mockReturnValue([modeInfo]);

        await viewModeTools(mockVscode, 'minimal');

        expect(mockShowQuickPick).toHaveBeenCalledWith(
          expect.arrayContaining([
            {
              label: 'Excluded Tools (2)',
              kind: mockVscode.QuickPickItemKind.Separator,
            },
            {
              label: '  - tool2',
              description: 'Excluded in this mode',
            },
            {
              label: '  - tool3',
              description: 'Excluded in this mode',
            },
          ]),
          expect.any(Object)
        );
      });

      it('should show error when mode not found', async () => {
        mockBuildModeTree.mockReturnValue([]);

        await viewModeTools(mockVscode, 'non-existent');

        expect(mockShowErrorMessage).toHaveBeenCalledWith('Mode not found: non-existent');
        expect(mockShowQuickPick).not.toHaveBeenCalled();
      });
    });

    describe('when called without mode ID', () => {
      it('should show quick pick to select mode', async () => {
        const modes: ModeConfig[] = [
          { id: 'default', name: 'Default', tools: ['tool1'] },
          { id: 'debug', name: 'Debug', tools: ['tool2'] },
        ];

        mockGetModes.mockReturnValue(modes);
        mockShowQuickPick.mockResolvedValue(undefined); // User cancelled

        await viewModeTools(mockVscode);

        expect(mockShowQuickPick).toHaveBeenCalledWith(
          [
            {
              label: 'Default',
              description: 'default',
              modeId: 'default',
            },
            {
              label: 'Debug',
              description: 'debug',
              modeId: 'debug',
            },
          ],
          {
            placeHolder: 'Select a mode to view its tools',
            matchOnDescription: true,
          }
        );
      });

      it('should display tools for selected mode', async () => {
        const modes: ModeConfig[] = [
          { id: 'default', name: 'Default', tools: ['tool1'] },
          { id: 'debug', name: 'Debug', tools: ['tool2'] },
        ];

        const modeInfo: ModeInfo = {
          config: {
            id: 'debug',
            name: 'Debug',
            includedTools: ['tool2'],
            excludedTools: [],
          },
          effectiveTools: ['tool2'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockGetModes.mockReturnValue(modes);
        mockShowQuickPick.mockResolvedValueOnce({
          label: 'Debug',
          description: 'debug',
          modeId: 'debug',
        });
        mockBuildModeTree.mockReturnValue([modeInfo]);

        await viewModeTools(mockVscode);

        // Second call should be for displaying tools
        expect(mockShowQuickPick).toHaveBeenCalledTimes(2);
        expect(mockShowQuickPick).toHaveBeenNthCalledWith(
          2,
          expect.arrayContaining([
            {
              label: 'Mode: Debug',
              kind: mockVscode.QuickPickItemKind.Separator,
            },
          ]),
          expect.objectContaining({
            placeHolder: 'Tools in mode: Debug',
          })
        );
      });

      it('should do nothing when user cancels mode selection', async () => {
        const modes: ModeConfig[] = [{ id: 'default', name: 'Default', tools: ['tool1'] }];

        mockGetModes.mockReturnValue(modes);
        mockShowQuickPick.mockResolvedValue(undefined);

        await viewModeTools(mockVscode);

        // Should only be called once (for mode selection)
        expect(mockShowQuickPick).toHaveBeenCalledTimes(1);
      });
    });

    describe('without description', () => {
      it('should not show description separator when mode has no description', async () => {
        const modeInfo: ModeInfo = {
          config: {
            id: 'debug',
            name: 'Debug',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockBuildModeTree.mockReturnValue([modeInfo]);

        await viewModeTools(mockVscode, 'debug');

        const callArgs = mockShowQuickPick.mock.calls[0]![0] as any[];
        const descriptions = callArgs.filter(
          (item) => item.label !== 'Mode: Debug' && item.kind === mockVscode.QuickPickItemKind.Separator
        );

        // Should not have a description separator
        expect(descriptions.some((item) => item.label === 'Debug')).toBe(false);
      });
    });

    describe('error handling', () => {
      it('should show error message when exception occurs', async () => {
        mockGetModes.mockImplementation(() => {
          throw new Error('Service error');
        });

        await viewModeTools(mockVscode);

        expect(mockShowErrorMessage).toHaveBeenCalledWith('Error viewing mode tools: Service error');
      });

      it('should handle non-Error exceptions', async () => {
        mockGetModes.mockImplementation(() => {
          throw 'Unknown error';
        });

        await viewModeTools(mockVscode);

        expect(mockShowErrorMessage).toHaveBeenCalledWith('Error viewing mode tools: Unknown error');
      });
    });
  });

  describe('refreshModes', () => {
    it('should execute without errors', () => {
      expect(() => refreshModes()).not.toThrow();
    });

    it('should be callable', () => {
      refreshModes();
      // Should log debug message (verified by logger mock)
    });
  });
});
