import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import { ModeTreeProvider, ModeTreeItem, registerModeTreeView } from '../../providers/ModeTreeProvider';
import type { ModeInfo, ModeStateEvent } from '../../types/mode';

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

// Create a shared mock ModeService
const listeners: Set<(event: ModeStateEvent) => void> = new Set();
let mockModes: ModeInfo[] = [];

const mockModeService = {
  buildModeTree: vi.fn(() => mockModes),
  onModeStateChange: vi.fn((listener: (event: ModeStateEvent) => void) => {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  }),
  getCurrentMode: vi.fn(() => mockModes.find((m) => m.isActive)),
  _triggerModeStateChange: (event: ModeStateEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  },
  _setModes: (modes: ModeInfo[]) => {
    mockModes = modes;
  },
  _clearListeners: () => {
    listeners.clear();
  },
};

// Mock ModeService
vi.mock('../../services', () => ({
  ModeService: {
    getInstance: vi.fn(() => mockModeService),
    reset: vi.fn(),
  },
}));

describe('ModeTreeProvider', () => {
  let mockVscode: typeof vscode;
  let mockTreeView: {
    dispose: () => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockModes = [];
    listeners.clear();

    mockTreeView = {
      dispose: vi.fn(),
    };

    // Create mock VS Code module
    mockVscode = {
      TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
      },
      TreeItem: class MockTreeItem {
        label?: string;
        id?: string;
        description?: string;
        tooltip?: string;
        iconPath?: unknown;
        contextValue?: string;
        command?: unknown;
        collapsibleState?: number;

        constructor(labelOrResource: string | vscode.Uri, collapsibleState?: number) {
          if (typeof labelOrResource === 'string') {
            this.label = labelOrResource;
          }
          this.collapsibleState = collapsibleState;
        }
      },
      ThemeIcon: class MockThemeIcon {
        id: string;
        color?: { id: string };
        constructor(id: string, color?: { id: string }) {
          this.id = id;
          this.color = color;
        }
      },
      ThemeColor: class MockThemeColor {
        id: string;
        constructor(id: string) {
          this.id = id;
        }
      },
      EventEmitter: class MockEventEmitterClass {
        private _listeners = new Set<(data: unknown) => void>();
        get event() {
          return ((listener: (data: unknown) => void) => {
            this._listeners.add(listener);
            return { dispose: () => this._listeners.delete(listener) };
          }) as vscode.Event<unknown>;
        }
        fire(data?: unknown) {
          for (const listener of this._listeners) {
            listener(data);
          }
        }
        dispose() {
          this._listeners.clear();
        }
      },
      window: {
        createTreeView: vi.fn(() => mockTreeView),
      },
    } as unknown as typeof vscode;
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockModes = [];
    listeners.clear();
  });

  describe('ModeTreeItem', () => {
    it('should construct with all properties', () => {
      const item = new ModeTreeItem(
        'Test Mode',
        'test-mode',
        0,
        true,
        10,
        5,
        3,
        2,
        'Test description'
      );

      expect(item.label).toBe('Test Mode');
      expect(item.modeId).toBe('test-mode');
      expect(item.collapsibleState).toBe(0);
      expect(item.isActive).toBe(true);
      expect(item.toolCount).toBe(10);
      expect(item.addedToolCount).toBe(5);
      expect(item.inheritedToolCount).toBe(3);
      expect(item.excludedToolCount).toBe(2);
      expect(item.description).toBe('Test description');
    });
  });

  describe('ModeTreeProvider', () => {
    describe('tree structure with flat mode list (no inheritance)', () => {
      it('should return all modes at root level', () => {
        // Create flat mode list
        const flatModes: ModeInfo[] = [
          {
            config: {
              id: 'mode-1',
              name: 'Mode 1',
              includedTools: ['tool1', 'tool2'],
              excludedTools: [],
            },
            effectiveTools: ['tool1', 'tool2'],
            children: [],
            depth: 0,
            isActive: true,
          },
          {
            config: {
              id: 'mode-2',
              name: 'Mode 2',
              includedTools: ['tool3', 'tool4'],
              excludedTools: [],
            },
            effectiveTools: ['tool3', 'tool4'],
            children: [],
            depth: 0,
            isActive: false,
          },
        ];

        mockModeService._setModes(flatModes);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const children = provider.getChildren();

        expect(children).toHaveLength(2);
        expect(children[0].modeId).toBe('mode-1');
        expect(children[0].label).toBe('Mode 1');
        expect(children[0].toolCount).toBe(2);
        expect(children[1].modeId).toBe('mode-2');
        expect(children[1].label).toBe('Mode 2');
        expect(children[1].toolCount).toBe(2);
      });

      it('should return empty children for leaf modes', () => {
        const flatModes: ModeInfo[] = [
          {
            config: {
              id: 'mode-1',
              name: 'Mode 1',
              includedTools: ['tool1'],
              excludedTools: [],
            },
            effectiveTools: ['tool1'],
            children: [],
            depth: 0,
            isActive: true,
          },
        ];

        mockModeService._setModes(flatModes);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const rootChildren = provider.getChildren();
        const leafChildren = provider.getChildren(rootChildren[0]);

        expect(leafChildren).toEqual([]);
      });
    });

    describe('tree structure with simple inheritance (parent → child)', () => {
      it('should build two-level hierarchy', () => {
        const parentMode: ModeInfo = {
          config: {
            id: 'parent',
            name: 'Parent Mode',
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
            id: 'child',
            name: 'Child Mode',
            parentId: 'parent',
            includedTools: ['tool3'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2', 'tool3'],
          parent: parentMode,
          children: [],
          depth: 1,
          isActive: true,
        };

        parentMode.children = [childMode];

        mockModeService._setModes([parentMode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);

        // Get root modes
        const roots = provider.getChildren();
        expect(roots).toHaveLength(1);
        expect(roots[0].modeId).toBe('parent');
        expect(roots[0].toolCount).toBe(2);

        // Get children of parent
        const children = provider.getChildren(roots[0]);
        expect(children).toHaveLength(1);
        expect(children[0].modeId).toBe('child');
        expect(children[0].toolCount).toBe(3);
        expect(children[0].addedToolCount).toBe(1); // Only tool3 is added
        expect(children[0].inheritedToolCount).toBe(2); // tool1 and tool2
      });

      it('should set correct collapsible state for parent modes', () => {
        const parentMode: ModeInfo = {
          config: {
            id: 'parent',
            name: 'Parent Mode',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        const childMode: ModeInfo = {
          config: {
            id: 'child',
            name: 'Child Mode',
            parentId: 'parent',
            includedTools: [],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          parent: parentMode,
          children: [],
          depth: 1,
          isActive: false,
        };

        parentMode.children = [childMode];

        mockModeService._setModes([parentMode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();

        expect(roots[0].collapsibleState).toBe(mockVscode.TreeItemCollapsibleState.Collapsed);
      });
    });

    describe('tree structure with deep inheritance (3+ levels)', () => {
      it('should build three-level hierarchy', () => {
        const grandparentMode: ModeInfo = {
          config: {
            id: 'grandparent',
            name: 'Grandparent',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        const parentMode: ModeInfo = {
          config: {
            id: 'parent',
            name: 'Parent',
            parentId: 'grandparent',
            includedTools: ['tool2'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2'],
          parent: grandparentMode,
          children: [],
          depth: 1,
          isActive: false,
        };

        const childMode: ModeInfo = {
          config: {
            id: 'child',
            name: 'Child',
            parentId: 'parent',
            includedTools: ['tool3'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2', 'tool3'],
          parent: parentMode,
          children: [],
          depth: 2,
          isActive: true,
        };

        grandparentMode.children = [parentMode];
        parentMode.children = [childMode];

        mockModeService._setModes([grandparentMode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);

        // Get root
        const roots = provider.getChildren();
        expect(roots).toHaveLength(1);
        expect(roots[0].modeId).toBe('grandparent');

        // Get middle level
        const parents = provider.getChildren(roots[0]);
        expect(parents).toHaveLength(1);
        expect(parents[0].modeId).toBe('parent');

        // Get deepest level
        const children = provider.getChildren(parents[0]);
        expect(children).toHaveLength(1);
        expect(children[0].modeId).toBe('child');
        expect(children[0].toolCount).toBe(3);
      });

      it('should handle multiple children at each level', () => {
        const root: ModeInfo = {
          config: {
            id: 'root',
            name: 'Root',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        const child1: ModeInfo = {
          config: {
            id: 'child1',
            name: 'Child 1',
            parentId: 'root',
            includedTools: ['tool2'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2'],
          parent: root,
          children: [],
          depth: 1,
          isActive: false,
        };

        const child2: ModeInfo = {
          config: {
            id: 'child2',
            name: 'Child 2',
            parentId: 'root',
            includedTools: ['tool3'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool3'],
          parent: root,
          children: [],
          depth: 1,
          isActive: false,
        };

        root.children = [child1, child2];

        mockModeService._setModes([root]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const children = provider.getChildren(roots[0]);

        expect(children).toHaveLength(2);
        expect(children[0].modeId).toBe('child1');
        expect(children[1].modeId).toBe('child2');
      });
    });

    describe('active mode highlighting (icon, contextValue)', () => {
      it('should highlight active mode with green filled circle icon', () => {
        const activeMode: ModeInfo = {
          config: {
            id: 'active',
            name: 'Active Mode',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: true,
        };

        mockModeService._setModes([activeMode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const treeItem = provider.getTreeItem(roots[0]);

        expect(treeItem.iconPath).toBeDefined();
        const icon = treeItem.iconPath as { id: string; color?: { id: string } };
        expect(icon.id).toBe('circle-filled');
        expect(icon.color?.id).toBe('charts.green');
      });

      it('should show inactive mode with outline circle icon', () => {
        const inactiveMode: ModeInfo = {
          config: {
            id: 'inactive',
            name: 'Inactive Mode',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockModeService._setModes([inactiveMode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const treeItem = provider.getTreeItem(roots[0]);

        expect(treeItem.iconPath).toBeDefined();
        const icon = treeItem.iconPath as { id: string; color?: { id: string } };
        expect(icon.id).toBe('circle-outline');
        expect(icon.color).toBeUndefined();
      });

      it('should set contextValue to modeActive for active mode', () => {
        const activeMode: ModeInfo = {
          config: {
            id: 'active',
            name: 'Active Mode',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: true,
        };

        mockModeService._setModes([activeMode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const treeItem = provider.getTreeItem(roots[0]);

        expect(treeItem.contextValue).toBe('modeActive');
      });

      it('should set contextValue to modeInactive for inactive mode', () => {
        const inactiveMode: ModeInfo = {
          config: {
            id: 'inactive',
            name: 'Inactive Mode',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockModeService._setModes([inactiveMode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const treeItem = provider.getTreeItem(roots[0]);

        expect(treeItem.contextValue).toBe('modeInactive');
      });
    });

    describe('tool count accuracy (matches effectiveTools.length)', () => {
      it('should show correct tool count for mode without inheritance', () => {
        const mode: ModeInfo = {
          config: {
            id: 'test',
            name: 'Test Mode',
            includedTools: ['tool1', 'tool2', 'tool3'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2', 'tool3'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockModeService._setModes([mode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();

        expect(roots[0].toolCount).toBe(3);
        expect(roots[0].toolCount).toBe(mode.effectiveTools.length);
      });

      it('should show correct inherited tool count', () => {
        const parent: ModeInfo = {
          config: {
            id: 'parent',
            name: 'Parent',
            includedTools: ['tool1', 'tool2'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2'],
          children: [],
          depth: 0,
          isActive: false,
        };

        const child: ModeInfo = {
          config: {
            id: 'child',
            name: 'Child',
            parentId: 'parent',
            includedTools: ['tool3'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2', 'tool3'],
          parent: parent,
          children: [],
          depth: 1,
          isActive: false,
        };

        parent.children = [child];

        mockModeService._setModes([parent]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const children = provider.getChildren(roots[0]);

        expect(children[0].toolCount).toBe(3);
        expect(children[0].inheritedToolCount).toBe(2);
        expect(children[0].addedToolCount).toBe(1);
      });

      it('should calculate added tools correctly', () => {
        const parent: ModeInfo = {
          config: {
            id: 'parent',
            name: 'Parent',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        const child: ModeInfo = {
          config: {
            id: 'child',
            name: 'Child',
            parentId: 'parent',
            includedTools: ['tool2', 'tool3', 'tool4'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2', 'tool3', 'tool4'],
          parent: parent,
          children: [],
          depth: 1,
          isActive: false,
        };

        parent.children = [child];

        mockModeService._setModes([parent]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const children = provider.getChildren(roots[0]);

        expect(children[0].addedToolCount).toBe(3); // tool2, tool3, tool4
      });
    });

    describe('description shows tool counts with inheritance info', () => {
      it('should show simple tool count for modes without inheritance', () => {
        const mode: ModeInfo = {
          config: {
            id: 'test',
            name: 'Test',
            includedTools: ['tool1', 'tool2'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockModeService._setModes([mode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const treeItem = provider.getTreeItem(roots[0]);

        expect(treeItem.description).toContain('2 tools');
      });

      it('should show inheritance info for child modes', () => {
        const parent: ModeInfo = {
          config: {
            id: 'parent',
            name: 'Parent',
            includedTools: ['tool1', 'tool2'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2'],
          children: [],
          depth: 0,
          isActive: false,
        };

        const child: ModeInfo = {
          config: {
            id: 'child',
            name: 'Child',
            parentId: 'parent',
            includedTools: ['tool3'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2', 'tool3'],
          parent: parent,
          children: [],
          depth: 1,
          isActive: false,
        };

        parent.children = [child];

        mockModeService._setModes([parent]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const children = provider.getChildren(roots[0]);
        const treeItem = provider.getTreeItem(children[0]);

        expect(treeItem.description).toContain('3 tools');
        expect(treeItem.description).toContain('2 inherited');
        expect(treeItem.description).toContain('+1');
      });

      it('should format description correctly with all counts', () => {
        const parent: ModeInfo = {
          config: {
            id: 'parent',
            name: 'Parent',
            includedTools: ['tool1', 'tool2', 'tool3'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2', 'tool3'],
          children: [],
          depth: 0,
          isActive: false,
        };

        const child: ModeInfo = {
          config: {
            id: 'child',
            name: 'Child',
            parentId: 'parent',
            includedTools: ['tool4', 'tool5'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2', 'tool3', 'tool4', 'tool5'],
          parent: parent,
          children: [],
          depth: 1,
          isActive: false,
        };

        parent.children = [child];

        mockModeService._setModes([parent]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const children = provider.getChildren(roots[0]);
        const treeItem = provider.getTreeItem(children[0]);

        // Should be "5 tools (3 inherited +2)"
        expect(treeItem.description).toBe('5 tools (3 inherited +2 )');
      });
    });

    describe('tooltip shows detailed mode information', () => {
      it('should include mode name and description in tooltip', () => {
        const mode: ModeInfo = {
          config: {
            id: 'test',
            name: 'Test Mode',
            description: 'A test mode for testing',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockModeService._setModes([mode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const treeItem = provider.getTreeItem(roots[0]);

        expect(treeItem.tooltip).toContain('Mode: Test Mode');
        expect(treeItem.tooltip).toContain('Description: A test mode for testing');
      });

      it('should include tool counts in tooltip', () => {
        const parent: ModeInfo = {
          config: {
            id: 'parent',
            name: 'Parent',
            includedTools: ['tool1', 'tool2'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2'],
          children: [],
          depth: 0,
          isActive: false,
        };

        const child: ModeInfo = {
          config: {
            id: 'child',
            name: 'Child',
            parentId: 'parent',
            includedTools: ['tool3'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2', 'tool3'],
          parent: parent,
          children: [],
          depth: 1,
          isActive: false,
        };

        parent.children = [child];

        mockModeService._setModes([parent]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const children = provider.getChildren(roots[0]);
        const treeItem = provider.getTreeItem(children[0]);

        expect(treeItem.tooltip).toContain('Total tools: 3');
        expect(treeItem.tooltip).toContain('Inherited tools: 2');
        expect(treeItem.tooltip).toContain('Added tools: 1');
      });

      it('should indicate active mode in tooltip', () => {
        const mode: ModeInfo = {
          config: {
            id: 'active',
            name: 'Active Mode',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: true,
        };

        mockModeService._setModes([mode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const treeItem = provider.getTreeItem(roots[0]);

        expect(treeItem.tooltip).toContain('✓ Currently active mode');
      });

      it('should not show active indicator for inactive modes', () => {
        const mode: ModeInfo = {
          config: {
            id: 'inactive',
            name: 'Inactive Mode',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockModeService._setModes([mode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const treeItem = provider.getTreeItem(roots[0]);

        expect(treeItem.tooltip).not.toContain('✓ Currently active mode');
      });
    });

    describe('getTreeItem returns proper TreeItem with correct properties', () => {
      it('should set label and id from mode info', () => {
        const mode: ModeInfo = {
          config: {
            id: 'test-mode',
            name: 'Test Mode',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockModeService._setModes([mode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const treeItem = provider.getTreeItem(roots[0]);

        expect(treeItem.label).toBe('Test Mode');
        expect(treeItem.id).toBe('test-mode');
      });

      it('should set command to view mode tools', () => {
        const mode: ModeInfo = {
          config: {
            id: 'test',
            name: 'Test',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockModeService._setModes([mode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const treeItem = provider.getTreeItem(roots[0]);

        expect(treeItem.command).toEqual({
          command: 'agency.viewModeTools',
          title: 'View Mode Tools',
          arguments: ['test'],
        });
      });
    });

    describe('getParent returns parent tree item', () => {
      it('should return undefined for root modes', () => {
        const mode: ModeInfo = {
          config: {
            id: 'root',
            name: 'Root',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockModeService._setModes([mode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const parent = provider.getParent(roots[0]);

        expect(parent).toBeUndefined();
      });

      it('should return parent for child modes', () => {
        const parent: ModeInfo = {
          config: {
            id: 'parent',
            name: 'Parent',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        const child: ModeInfo = {
          config: {
            id: 'child',
            name: 'Child',
            parentId: 'parent',
            includedTools: ['tool2'],
            excludedTools: [],
          },
          effectiveTools: ['tool1', 'tool2'],
          parent: parent,
          children: [],
          depth: 1,
          isActive: false,
        };

        parent.children = [child];

        mockModeService._setModes([parent]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const roots = provider.getChildren();
        const children = provider.getChildren(roots[0]);
        const parentItem = provider.getParent(children[0]);

        expect(parentItem).toBeDefined();
        expect(parentItem?.modeId).toBe('parent');
      });
    });

    describe('refresh fires onDidChangeTreeData event', () => {
      it('should fire event when refresh is called', () => {
        const mode: ModeInfo = {
          config: {
            id: 'test',
            name: 'Test',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockModeService._setModes([mode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);

        let eventFired = false;
        provider.onDidChangeTreeData(() => {
          eventFired = true;
        });

        provider.refresh();

        expect(eventFired).toBe(true);
      });
    });

    describe('provider listens to ModeService.onModeStateChange and refreshes', () => {
      it('should subscribe to mode state changes on construction', () => {
        new ModeTreeProvider(mockVscode, mockModeService as any);

        expect(mockModeService.onModeStateChange).toHaveBeenCalled();
      });

      it('should refresh when mode state changes', () => {
        const mode: ModeInfo = {
          config: {
            id: 'test',
            name: 'Test',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockModeService._setModes([mode]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);

        let refreshCount = 0;
        provider.onDidChangeTreeData(() => {
          refreshCount++;
        });

        // Trigger mode state change
        const event: ModeStateEvent = {
          type: 'activated',
          modeId: 'test',
          modeInfo: mode,
          timestamp: Date.now(),
        };
        mockModeService._triggerModeStateChange(event);

        expect(refreshCount).toBeGreaterThan(0);
      });

      it('should handle multiple mode state change events', () => {
        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);

        let refreshCount = 0;
        provider.onDidChangeTreeData(() => {
          refreshCount++;
        });

        // Trigger multiple events
        mockModeService._triggerModeStateChange({
          type: 'activated',
          modeId: 'mode1',
          timestamp: Date.now(),
        });
        mockModeService._triggerModeStateChange({
          type: 'deactivated',
          modeId: 'mode2',
          timestamp: Date.now(),
        });
        mockModeService._triggerModeStateChange({
          type: 'updated',
          modeId: 'mode3',
          timestamp: Date.now(),
        });

        expect(refreshCount).toBe(3);
      });
    });

    describe('error handling', () => {
      it('should return empty array on error in getChildren', () => {
        mockModeService.buildModeTree.mockImplementation(() => {
          throw new Error('Test error');
        });

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);
        const children = provider.getChildren();

        expect(children).toEqual([]);
      });

      it('should handle missing mode info gracefully', () => {
        const parent: ModeInfo = {
          config: {
            id: 'parent',
            name: 'Parent',
            includedTools: ['tool1'],
            excludedTools: [],
          },
          effectiveTools: ['tool1'],
          children: [],
          depth: 0,
          isActive: false,
        };

        mockModeService._setModes([parent]);

        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);

        // Try to get children of a non-existent mode
        const fakeItem = new ModeTreeItem('Fake', 'non-existent', 0, false, 0, 0, 0, 0);
        const children = provider.getChildren(fakeItem);

        expect(children).toEqual([]);
      });
    });

    describe('dispose', () => {
      it('should clean up resources', () => {
        const provider = new ModeTreeProvider(mockVscode, mockModeService as any);

        provider.dispose();

        // Provider should still be safe to call after dispose
        expect(() => provider.refresh()).not.toThrow();
      });
    });
  });

  describe('registerModeTreeView', () => {
    it('should create tree view with correct ID', () => {
      const disposable = registerModeTreeView(mockVscode);

      expect(mockVscode.window.createTreeView).toHaveBeenCalledWith(
        'agency.modes',
        expect.objectContaining({
          treeDataProvider: expect.any(Object),
          showCollapseAll: true,
        })
      );

      disposable.dispose();
    });

    it('should return disposable', () => {
      const disposable = registerModeTreeView(mockVscode);

      expect(disposable).toHaveProperty('dispose');
      expect(typeof disposable.dispose).toBe('function');

      disposable.dispose();
    });

    it('should dispose both tree view and provider on dispose', () => {
      const disposable = registerModeTreeView(mockVscode);

      disposable.dispose();

      expect(mockTreeView.dispose).toHaveBeenCalled();
    });
  });
});
