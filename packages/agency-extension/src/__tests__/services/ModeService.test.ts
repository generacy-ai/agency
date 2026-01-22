import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModeService } from '../../services/ModeService';
import { ConfigService } from '../../services/ConfigService';
import type { AgencyConfig, ModeConfig } from '../../config';

// Global mock config storage
const mockConfigStorage = {
  config: {
    version: '1.0.0',
    currentModeId: 'default',
    modes: [],
    plugins: [],
    containers: [],
  } as AgencyConfig,
};

// Mock ConfigService
vi.mock('../../services/ConfigService', () => {
  return {
    ConfigService: {
      getInstance: vi.fn(() => ({
        getConfig: vi.fn(() => mockConfigStorage.config),
        setCurrentModeId: vi.fn(async (modeId: string) => {
          mockConfigStorage.config.currentModeId = modeId;
        }),
      })),
    },
  };
});

// Helper to set mock config
function setMockConfig(config: Partial<AgencyConfig>): void {
  mockConfigStorage.config = {
    version: '1.0.0',
    currentModeId: config.currentModeId || 'default',
    modes: config.modes || [],
    plugins: [],
    containers: [],
  };
}

describe('ModeService', () => {
  // Test fixtures
  const rootMode: ModeConfig = {
    id: 'root',
    name: 'Root Mode',
    includedTools: ['Read', 'Write'],
    excludedTools: [],
  };

  const singleLevelChild: ModeConfig = {
    id: 'child',
    name: 'Child Mode',
    parentId: 'root',
    includedTools: ['Edit'],
    excludedTools: [],
  };

  const multiLevelGrandchild: ModeConfig = {
    id: 'grandchild',
    name: 'Grandchild Mode',
    parentId: 'child',
    includedTools: ['Bash'],
    excludedTools: ['Write'],
  };

  const circularA: ModeConfig = {
    id: 'circularA',
    name: 'Circular A',
    parentId: 'circularC',
    includedTools: ['Read'],
    excludedTools: [],
  };

  const circularB: ModeConfig = {
    id: 'circularB',
    name: 'Circular B',
    parentId: 'circularA',
    includedTools: ['Write'],
    excludedTools: [],
  };

  const circularC: ModeConfig = {
    id: 'circularC',
    name: 'Circular C',
    parentId: 'circularB',
    includedTools: ['Edit'],
    excludedTools: [],
  };

  const missingParentMode: ModeConfig = {
    id: 'orphan',
    name: 'Orphan Mode',
    parentId: 'nonexistent',
    includedTools: ['Read'],
    excludedTools: [],
  };

  const duplicateIdMode1: ModeConfig = {
    id: 'duplicate',
    name: 'Duplicate 1',
    includedTools: ['Read'],
    excludedTools: [],
  };

  const duplicateIdMode2: ModeConfig = {
    id: 'duplicate',
    name: 'Duplicate 2',
    includedTools: ['Write'],
    excludedTools: [],
  };

  beforeEach(() => {
    // Reset mock config before each test
    setMockConfig({
      currentModeId: 'root',
      modes: [rootMode],
    });
  });

  describe('Inheritance Resolution', () => {
    it('should return only includedTools for root mode', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode],
      });

      const modeService = ModeService.getInstance();
      const modes = modeService.getModes();
      const root = modes.find(m => m.config.id === 'root');

      expect(root).toBeDefined();
      expect(root!.effectiveTools).toEqual(['Read', 'Write']);
    });

    it('should handle single-level inheritance (child inherits parent tools + adds own)', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      const modes = modeService.getModes();
      const child = modes.find(m => m.config.id === 'child');

      expect(child).toBeDefined();
      expect(child!.effectiveTools).toContain('Read');
      expect(child!.effectiveTools).toContain('Write');
      expect(child!.effectiveTools).toContain('Edit');
      expect(child!.effectiveTools.length).toBe(3);
    });

    it('should handle multi-level inheritance (grandchild inherits all ancestor tools)', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild, multiLevelGrandchild],
      });

      const modeService = ModeService.getInstance();
      const modes = modeService.getModes();
      const grandchild = modes.find(m => m.config.id === 'grandchild');

      expect(grandchild).toBeDefined();
      // Should have Read (from root), Edit (from child), Bash (own)
      // Should NOT have Write (excluded)
      expect(grandchild!.effectiveTools).toContain('Read');
      expect(grandchild!.effectiveTools).toContain('Edit');
      expect(grandchild!.effectiveTools).toContain('Bash');
      expect(grandchild!.effectiveTools).not.toContain('Write');
      expect(grandchild!.effectiveTools.length).toBe(3);
    });

    it('should properly apply excludedTools to remove tools from parent', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild, multiLevelGrandchild],
      });

      const modeService = ModeService.getInstance();
      const modes = modeService.getModes();
      const grandchild = modes.find(m => m.config.id === 'grandchild');

      expect(grandchild).toBeDefined();
      expect(grandchild!.effectiveTools).not.toContain('Write');
    });

    it('should detect circular inheritance', () => {
      setMockConfig({
        currentModeId: 'circularA',
        modes: [circularA, circularB, circularC],
      });

      const modeService = ModeService.getInstance();
      const modes = modeService.getModes();

      // All circular modes should be skipped
      expect(modes.length).toBe(0);
    });

    it('should handle missing parent gracefully', () => {
      setMockConfig({
        currentModeId: 'orphan',
        modes: [missingParentMode],
      });

      const modeService = ModeService.getInstance();
      const modes = modeService.getModes();

      // Mode with missing parent should be skipped
      expect(modes.length).toBe(0);
    });
  });

  describe('Query Methods', () => {
    it('should return all modes with resolved effectiveTools via getModes()', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      const modes = modeService.getModes();

      expect(modes.length).toBe(2);
      expect(modes[0].effectiveTools).toBeDefined();
      expect(modes[1].effectiveTools).toBeDefined();
    });

    it('should correctly set isActive for current mode in getModes()', () => {
      setMockConfig({
        currentModeId: 'child',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      const modes = modeService.getModes();

      const root = modes.find(m => m.config.id === 'root');
      const child = modes.find(m => m.config.id === 'child');

      expect(root!.isActive).toBe(false);
      expect(child!.isActive).toBe(true);
    });

    it('should return correct mode via getMode(id)', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      const child = modeService.getMode('child');

      expect(child).toBeDefined();
      expect(child!.config.id).toBe('child');
    });

    it('should return undefined via getMode(id) for non-existent mode', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode],
      });

      const modeService = ModeService.getInstance();
      const nonexistent = modeService.getMode('nonexistent');

      expect(nonexistent).toBeUndefined();
    });

    it('should return the active mode via getCurrentMode()', () => {
      setMockConfig({
        currentModeId: 'child',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      const current = modeService.getCurrentMode();

      expect(current.config.id).toBe('child');
      expect(current.isActive).toBe(true);
    });

    it('should return default mode if no active mode set', () => {
      const defaultMode: ModeConfig = {
        id: 'default',
        name: 'Default Mode',
        includedTools: ['Read'],
        excludedTools: [],
        isDefault: true,
      };

      setMockConfig({
        currentModeId: 'nonexistent',
        modes: [rootMode, defaultMode],
      });

      const modeService = ModeService.getInstance();
      const current = modeService.getCurrentMode();

      expect(current.config.id).toBe('default');
    });
  });

  describe('setCurrentMode()', () => {
    it('should switch mode successfully', async () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      const result = await modeService.setCurrentMode('child');

      expect(result.success).toBe(true);
      expect(result.previousModeId).toBe('root');
      expect(result.newModeId).toBe('child');
    });

    it('should return correct tool diff (added/removed)', async () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild, multiLevelGrandchild],
      });

      const modeService = ModeService.getInstance();
      const result = await modeService.setCurrentMode('grandchild');

      expect(result.success).toBe(true);
      expect(result.addedTools).toContain('Edit');
      expect(result.addedTools).toContain('Bash');
      expect(result.removedTools).toContain('Write');
    });

    it('should save to ConfigService', async () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      await modeService.setCurrentMode('child');

      const configService = ConfigService.getInstance();
      const config = configService.getConfig();

      expect(config.currentModeId).toBe('child');
    });

    it('should emit ModeStateEvent', async () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      let eventFired = false;
      let eventModeId = '';

      modeService.onModeChange(event => {
        eventFired = true;
        eventModeId = event.modeId;
      });

      await modeService.setCurrentMode('child');

      expect(eventFired).toBe(true);
      expect(eventModeId).toBe('child');
    });

    it('should fail gracefully for non-existent mode', async () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode],
      });

      const modeService = ModeService.getInstance();
      const result = await modeService.setCurrentMode('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error in ModeSwitchResult on failure', async () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode],
      });

      const modeService = ModeService.getInstance();
      const result = await modeService.setCurrentMode('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toBeTruthy();
    });
  });

  describe('buildModeTree()', () => {
    it('should create correct hierarchy (roots with children)', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild, multiLevelGrandchild],
      });

      const modeService = ModeService.getInstance();
      const tree = modeService.buildModeTree();

      expect(tree.length).toBe(1); // One root
      expect(tree[0].id).toBe('root');
      expect(tree[0].children.length).toBe(1); // One child
      expect(tree[0].children[0].id).toBe('child');
      expect(tree[0].children[0].children.length).toBe(1); // One grandchild
      expect(tree[0].children[0].children[0].id).toBe('grandchild');
    });

    it('should compute correct toolCount', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      const tree = modeService.buildModeTree();

      expect(tree[0].toolCount).toBe(2); // Read, Write
      expect(tree[0].children[0].toolCount).toBe(3); // Read, Write, Edit
    });

    it('should compute correct inheritedToolCount', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      const tree = modeService.buildModeTree();

      expect(tree[0].inheritedToolCount).toBe(0); // Root has no parent
      expect(tree[0].children[0].inheritedToolCount).toBe(2); // Inherits from root
    });

    it('should compute correct addedToolCount', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      const tree = modeService.buildModeTree();

      expect(tree[0].addedToolCount).toBe(2); // Read, Write
      expect(tree[0].children[0].addedToolCount).toBe(1); // Edit
    });

    it('should compute correct excludedToolCount', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild, multiLevelGrandchild],
      });

      const modeService = ModeService.getInstance();
      const tree = modeService.buildModeTree();

      expect(tree[0].excludedToolCount).toBe(0); // Root excludes nothing
      expect(tree[0].children[0].excludedToolCount).toBe(0); // Child excludes nothing
      expect(tree[0].children[0].children[0].excludedToolCount).toBe(1); // Grandchild excludes Write
    });

    it('should set isActive correctly', () => {
      setMockConfig({
        currentModeId: 'child',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      const tree = modeService.buildModeTree();

      expect(tree[0].isActive).toBe(false); // Root not active
      expect(tree[0].children[0].isActive).toBe(true); // Child is active
    });
  });

  describe('validate()', () => {
    it('should detect duplicate IDs', () => {
      setMockConfig({
        currentModeId: 'duplicate',
        modes: [duplicateIdMode1, duplicateIdMode2],
      });

      const modeService = ModeService.getInstance();
      const validation = modeService.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0].code).toBe('duplicate_id');
    });

    it('should detect missing parent', () => {
      setMockConfig({
        currentModeId: 'orphan',
        modes: [missingParentMode],
      });

      const modeService = ModeService.getInstance();
      const validation = modeService.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.code === 'missing_parent')).toBe(true);
    });

    it('should detect circular inheritance', () => {
      setMockConfig({
        currentModeId: 'circularA',
        modes: [circularA, circularB, circularC],
      });

      const modeService = ModeService.getInstance();
      const validation = modeService.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.code === 'circular_inheritance')).toBe(true);
    });

    it('should return valid=true for valid configs', () => {
      setMockConfig({
        currentModeId: 'root',
        modes: [rootMode, singleLevelChild],
      });

      const modeService = ModeService.getInstance();
      const validation = modeService.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should collect multiple errors if present', () => {
      setMockConfig({
        currentModeId: 'duplicate',
        modes: [duplicateIdMode1, duplicateIdMode2, missingParentMode],
      });

      const modeService = ModeService.getInstance();
      const validation = modeService.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(1);
    });
  });
});
