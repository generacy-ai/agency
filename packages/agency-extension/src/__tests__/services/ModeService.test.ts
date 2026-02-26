import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModeService } from '../../services/ModeService';
import { ConfigService } from '../../services/ConfigService';
import type { AgencyConfig, ModeConfig } from '../../config';

// Global mock config storage
let mockModes: ModeConfig[] = [];

// Mock ConfigService
vi.mock('../../services/ConfigService', () => {
  return {
    ConfigService: {
      getInstance: vi.fn(() => ({
        getModes: vi.fn(() => mockModes),
        isInitialized: vi.fn(() => true),
        onConfigChange: vi.fn(() => ({ dispose: vi.fn() })),
      })),
    },
  };
});

// Mock logger
vi.mock('../../utils', () => ({
  createScopedLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  DisposableManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// Helper to set mock config
function setMockModes(modes: ModeConfig[]): void {
  mockModes = modes;
}

describe('ModeService', () => {
  // Test fixtures using ConfigSchema's ModeConfig (with tools/inherits)
  const rootMode: ModeConfig = {
    id: 'root',
    name: 'Root Mode',
    tools: ['Read', 'Write'],
  };

  const singleLevelChild: ModeConfig = {
    id: 'child',
    name: 'Child Mode',
    inherits: 'root',
    tools: ['Edit'],
  };

  const multiLevelGrandchild: ModeConfig = {
    id: 'grandchild',
    name: 'Grandchild Mode',
    inherits: 'child',
    tools: ['Bash'],
  };

  const circularA: ModeConfig = {
    id: 'circularA',
    name: 'Circular A',
    inherits: 'circularC',
    tools: ['Read'],
  };

  const circularB: ModeConfig = {
    id: 'circularB',
    name: 'Circular B',
    inherits: 'circularA',
    tools: ['Write'],
  };

  const circularC: ModeConfig = {
    id: 'circularC',
    name: 'Circular C',
    inherits: 'circularB',
    tools: ['Edit'],
  };

  const missingParentMode: ModeConfig = {
    id: 'orphan',
    name: 'Orphan Mode',
    inherits: 'nonexistent',
    tools: ['Read'],
  };

  const duplicateIdMode1: ModeConfig = {
    id: 'duplicate',
    name: 'Duplicate 1',
    tools: ['Read'],
  };

  const duplicateIdMode2: ModeConfig = {
    id: 'duplicate',
    name: 'Duplicate 2',
    tools: ['Write'],
  };

  beforeEach(() => {
    ModeService.reset();
    setMockModes([rootMode]);
  });

  describe('getModes()', () => {
    it('should return all mode configs', () => {
      setMockModes([rootMode, singleLevelChild]);

      const mockVscode = {
        workspace: {
          getConfiguration: vi.fn(() => ({
            get: vi.fn(() => undefined),
          })),
        },
        ConfigurationTarget: { Workspace: 2 },
      } as any;

      const modeService = ModeService.getInstance();
      modeService.initialize(mockVscode);
      const modes = modeService.getModes();

      expect(modes.length).toBe(2);
      expect(modes[0]!.id).toBe('root');
      expect(modes[1]!.id).toBe('child');
    });
  });

  describe('buildModeTree()', () => {
    let modeService: ModeService;

    beforeEach(async () => {
      ModeService.reset();
      const mockVscode = {
        workspace: {
          getConfiguration: vi.fn(() => ({
            get: vi.fn(() => undefined),
          })),
        },
        ConfigurationTarget: { Workspace: 2 },
      } as any;
      modeService = ModeService.getInstance();
      await modeService.initialize(mockVscode);
    });

    it('should create correct hierarchy (roots with children)', () => {
      setMockModes([rootMode, singleLevelChild, multiLevelGrandchild]);

      const tree = modeService.buildModeTree();

      expect(tree.length).toBe(1); // One root
      expect(tree[0]!.config.id).toBe('root');
      expect(tree[0]!.children.length).toBe(1); // One child
      expect(tree[0]!.children[0]!.config.id).toBe('child');
      expect(tree[0]!.children[0]!.children.length).toBe(1); // One grandchild
      expect(tree[0]!.children[0]!.children[0]!.config.id).toBe('grandchild');
    });

    it('should compute correct effectiveTools', () => {
      setMockModes([rootMode, singleLevelChild]);

      const tree = modeService.buildModeTree();

      // Root has Read, Write
      expect(tree[0]!.effectiveTools).toEqual(expect.arrayContaining(['Read', 'Write']));
      expect(tree[0]!.effectiveTools.length).toBe(2);
      // Child inherits Read, Write and adds Edit
      expect(tree[0]!.children[0]!.effectiveTools).toEqual(expect.arrayContaining(['Edit', 'Read', 'Write']));
      expect(tree[0]!.children[0]!.effectiveTools.length).toBe(3);
    });

    it('should set isActive correctly', () => {
      setMockModes([rootMode, singleLevelChild]);

      const tree = modeService.buildModeTree();

      // Default current mode is 'default' or first mode
      // Root should be the current mode since it's the first one
      expect(tree[0]!.isActive).toBe(true);
      expect(tree[0]!.children[0]!.isActive).toBe(false);
    });

    it('should handle multi-level inheritance correctly', () => {
      setMockModes([rootMode, singleLevelChild, multiLevelGrandchild]);

      const tree = modeService.buildModeTree();
      const grandchild = tree[0]!.children[0]!.children[0]!;

      // Grandchild inherits Read, Write from root, Edit from child, adds Bash
      expect(grandchild.effectiveTools).toEqual(expect.arrayContaining(['Bash', 'Edit', 'Read', 'Write']));
    });

    it('should compute correct depth', () => {
      setMockModes([rootMode, singleLevelChild, multiLevelGrandchild]);

      const tree = modeService.buildModeTree();

      expect(tree[0]!.depth).toBe(0);
      expect(tree[0]!.children[0]!.depth).toBe(1);
      expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2);
    });
  });

  describe('validateModes()', () => {
    let modeService: ModeService;

    beforeEach(async () => {
      ModeService.reset();
      const mockVscode = {
        workspace: {
          getConfiguration: vi.fn(() => ({
            get: vi.fn(() => undefined),
          })),
        },
        ConfigurationTarget: { Workspace: 2 },
      } as any;
      modeService = ModeService.getInstance();
      await modeService.initialize(mockVscode);
    });

    it('should detect duplicate IDs', () => {
      setMockModes([duplicateIdMode1, duplicateIdMode2]);

      const validation = modeService.validateModes();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0]!.code).toBe('duplicate_id');
    });

    it('should detect missing parent', () => {
      setMockModes([missingParentMode]);

      const validation = modeService.validateModes();

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e: { code: string }) => e.code === 'missing_parent')).toBe(true);
    });

    it('should detect circular inheritance', () => {
      setMockModes([circularA, circularB, circularC]);

      const validation = modeService.validateModes();

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e: { code: string }) => e.code === 'circular_inheritance')).toBe(true);
    });

    it('should return valid=true for valid configs', () => {
      setMockModes([rootMode, singleLevelChild]);

      const validation = modeService.validateModes();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should collect multiple errors if present', () => {
      setMockModes([duplicateIdMode1, duplicateIdMode2, missingParentMode]);

      const validation = modeService.validateModes();

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(1);
    });
  });
});
