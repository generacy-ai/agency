import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusBarManager } from '../../status/StatusBarManager';
import { ModeService } from '../../services/ModeService';

// Mock vscode
const mockStatusBarItem = {
  text: '',
  tooltip: '',
  command: undefined as string | undefined,
  color: undefined,
  name: '',
  show: vi.fn(),
  hide: vi.fn(),
  dispose: vi.fn(),
};

vi.mock('vscode', () => ({
  window: {
    createStatusBarItem: vi.fn(() => ({ ...mockStatusBarItem })),
  },
  StatusBarAlignment: {
    Right: 2,
  },
  ThemeColor: vi.fn((colorId: string) => ({ id: colorId })),
}));

// Mock ModeService
vi.mock('../../services/ModeService', () => ({
  ModeService: {
    getInstance: vi.fn(() => ({
      getCurrentMode: vi.fn(() => ({
        config: { id: 'test-mode', name: 'Test Mode' },
        effectiveTools: ['Read', 'Write', 'Edit'],
      })),
      onModeStateChange: vi.fn(() => ({
        dispose: vi.fn(),
      })),
    })),
  },
}));

describe('StatusBarManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton
    (StatusBarManager as unknown as { instance: null }).instance = null;
  });

  afterEach(() => {
    const instance = StatusBarManager.getInstance();
    if (instance) {
      instance.dispose();
    }
  });

  describe('initialize()', () => {
    it('should create mode status bar item', () => {
      const manager = StatusBarManager.initialize();
      expect(manager).toBeDefined();
    });

    it('should throw if already initialized', () => {
      StatusBarManager.initialize();
      expect(() => StatusBarManager.initialize()).toThrow('StatusBarManager already initialized');
    });
  });

  describe('updateModeStatus()', () => {
    it('should update mode status bar item text', () => {
      const manager = StatusBarManager.initialize();
      manager.updateModeStatus();
      // Mode status should be updated based on ModeService
    });
  });
});
