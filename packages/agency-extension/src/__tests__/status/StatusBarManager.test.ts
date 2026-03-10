import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusBarManager } from '../../status/StatusBarManager';
import { COMMANDS } from '../../constants';

// Track each created status bar item so tests can inspect them
const createdStatusBarItems: Array<{
  text: string;
  tooltip: string;
  command: string | undefined;
  color: unknown;
  name: string;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}> = [];

function createMockStatusBarItem() {
  const item = {
    text: '',
    tooltip: '',
    command: undefined as string | undefined,
    color: undefined as unknown,
    name: '',
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  };
  createdStatusBarItems.push(item);
  return item;
}

vi.mock('vscode', () => ({
  window: {
    createStatusBarItem: vi.fn(() => createMockStatusBarItem()),
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

/**
 * Helper to get the MCP status bar item (created first, index 0).
 */
function getMcpItem() {
  return createdStatusBarItems[0];
}

/**
 * Helper to get the container status bar item (created second, index 1).
 */
function getContainerItem() {
  return createdStatusBarItems[1];
}

describe('StatusBarManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdStatusBarItems.length = 0;
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
    it('should create three status bar items (MCP, Container, Mode)', () => {
      StatusBarManager.initialize();
      expect(createdStatusBarItems).toHaveLength(3);
    });

    it('should show all status bar items', () => {
      StatusBarManager.initialize();
      for (const item of createdStatusBarItems) {
        expect(item.show).toHaveBeenCalled();
      }
    });

    it('should throw if already initialized', () => {
      StatusBarManager.initialize();
      expect(() => StatusBarManager.initialize()).toThrow('StatusBarManager already initialized');
    });

    it('should return the manager instance', () => {
      const manager = StatusBarManager.initialize();
      expect(manager).toBeDefined();
      expect(StatusBarManager.getInstance()).toBe(manager);
    });
  });

  describe('MCP status bar click behavior', () => {
    let manager: StatusBarManager;

    beforeEach(() => {
      manager = StatusBarManager.initialize();
    });

    describe('connected state', () => {
      it('should set command to DISCONNECT_MCP when connected', () => {
        manager.updateMcpStatus({ state: 'connected', connectedAt: new Date() });

        const mcpItem = getMcpItem();
        expect(mcpItem.command).toBe(COMMANDS.DISCONNECT_MCP);
      });

      it('should show plug icon when connected', () => {
        manager.updateMcpStatus({ state: 'connected', connectedAt: new Date() });

        const mcpItem = getMcpItem();
        expect(mcpItem.text).toContain('$(plug)');
      });

      it('should have default color (no warning/error) when connected', () => {
        manager.updateMcpStatus({ state: 'connected', connectedAt: new Date() });

        const mcpItem = getMcpItem();
        expect(mcpItem.color).toBeUndefined();
      });

      it('should show appropriate tooltip when connected', () => {
        manager.updateMcpStatus({ state: 'connected', connectedAt: new Date() });

        const mcpItem = getMcpItem();
        expect(mcpItem.tooltip).toContain('Connected');
      });
    });

    describe('disconnected state', () => {
      it('should set command to CONNECT_MCP when disconnected', () => {
        manager.updateMcpStatus({ state: 'disconnected' });

        const mcpItem = getMcpItem();
        expect(mcpItem.command).toBe(COMMANDS.CONNECT_MCP);
      });

      it('should show debug-disconnect icon when disconnected', () => {
        manager.updateMcpStatus({ state: 'disconnected' });

        const mcpItem = getMcpItem();
        expect(mcpItem.text).toContain('$(debug-disconnect)');
      });

      it('should show warning color when disconnected', () => {
        manager.updateMcpStatus({ state: 'disconnected' });

        const mcpItem = getMcpItem();
        expect(mcpItem.color).toEqual({ id: 'statusBarItem.warningForeground' });
      });

      it('should include reason in tooltip when provided', () => {
        manager.updateMcpStatus({ state: 'disconnected', reason: 'User requested' });

        const mcpItem = getMcpItem();
        expect(mcpItem.tooltip).toContain('User requested');
      });
    });

    describe('error state', () => {
      it('should set command to CONNECT_MCP when in error state', () => {
        manager.updateMcpStatus({
          state: 'error',
          error: new Error('Connection refused'),
          occurredAt: new Date(),
        });

        const mcpItem = getMcpItem();
        expect(mcpItem.command).toBe(COMMANDS.CONNECT_MCP);
      });

      it('should show error icon when in error state', () => {
        manager.updateMcpStatus({
          state: 'error',
          error: new Error('Connection refused'),
          occurredAt: new Date(),
        });

        const mcpItem = getMcpItem();
        expect(mcpItem.text).toContain('$(error)');
      });

      it('should show error color when in error state', () => {
        manager.updateMcpStatus({
          state: 'error',
          error: new Error('Connection refused'),
          occurredAt: new Date(),
        });

        const mcpItem = getMcpItem();
        expect(mcpItem.color).toEqual({ id: 'statusBarItem.errorForeground' });
      });

      it('should include error message and reconnect hint in tooltip', () => {
        manager.updateMcpStatus({
          state: 'error',
          error: new Error('Connection refused'),
          occurredAt: new Date(),
        });

        const mcpItem = getMcpItem();
        expect(mcpItem.tooltip).toContain('Connection refused');
        expect(mcpItem.tooltip).toContain('Click to reconnect');
      });
    });

    describe('connecting state', () => {
      it('should have no command when connecting', () => {
        manager.updateMcpStatus({ state: 'connecting', startedAt: new Date() });

        const mcpItem = getMcpItem();
        expect(mcpItem.command).toBeUndefined();
      });

      it('should show loading spinner icon when connecting', () => {
        manager.updateMcpStatus({ state: 'connecting', startedAt: new Date() });

        const mcpItem = getMcpItem();
        expect(mcpItem.text).toContain('$(loading~spin)');
      });
    });

    describe('toggle behavior (state transitions)', () => {
      it('should toggle from DISCONNECT_MCP to CONNECT_MCP when going connected → disconnected', () => {
        manager.updateMcpStatus({ state: 'connected', connectedAt: new Date() });
        expect(getMcpItem().command).toBe(COMMANDS.DISCONNECT_MCP);

        manager.updateMcpStatus({ state: 'disconnected' });
        expect(getMcpItem().command).toBe(COMMANDS.CONNECT_MCP);
      });

      it('should toggle from CONNECT_MCP to DISCONNECT_MCP when going disconnected → connected', () => {
        manager.updateMcpStatus({ state: 'disconnected' });
        expect(getMcpItem().command).toBe(COMMANDS.CONNECT_MCP);

        manager.updateMcpStatus({ state: 'connected', connectedAt: new Date() });
        expect(getMcpItem().command).toBe(COMMANDS.DISCONNECT_MCP);
      });

      it('should transition from error to DISCONNECT_MCP after reconnection succeeds', () => {
        manager.updateMcpStatus({
          state: 'error',
          error: new Error('Connection lost'),
          occurredAt: new Date(),
        });
        expect(getMcpItem().command).toBe(COMMANDS.CONNECT_MCP);

        manager.updateMcpStatus({ state: 'connected', connectedAt: new Date() });
        expect(getMcpItem().command).toBe(COMMANDS.DISCONNECT_MCP);
      });

      it('should remove command during connecting phase then restore on connected', () => {
        manager.updateMcpStatus({ state: 'disconnected' });
        expect(getMcpItem().command).toBe(COMMANDS.CONNECT_MCP);

        manager.updateMcpStatus({ state: 'connecting', startedAt: new Date() });
        expect(getMcpItem().command).toBeUndefined();

        manager.updateMcpStatus({ state: 'connected', connectedAt: new Date() });
        expect(getMcpItem().command).toBe(COMMANDS.DISCONNECT_MCP);
      });

      it('should show CONNECT_MCP when connecting fails and enters error state', () => {
        manager.updateMcpStatus({ state: 'connecting', startedAt: new Date() });
        expect(getMcpItem().command).toBeUndefined();

        manager.updateMcpStatus({
          state: 'error',
          error: new Error('Timeout'),
          occurredAt: new Date(),
        });
        expect(getMcpItem().command).toBe(COMMANDS.CONNECT_MCP);
      });
    });
  });

  describe('reconnect exhaustion', () => {
    let manager: StatusBarManager;

    beforeEach(() => {
      manager = StatusBarManager.initialize();
    });

    it('should show CONNECT_MCP command after reconnect exhaustion (error state)', () => {
      // Simulate reconnect exhaustion: McpClientService sets status to 'error'
      // when maxAttempts is reached. The status bar should show the CONNECT_MCP
      // command so the user can manually reconnect.
      manager.updateMcpStatus({
        state: 'error',
        error: new Error('Max reconnect attempts reached'),
        occurredAt: new Date(),
      });

      const mcpItem = getMcpItem();
      expect(mcpItem.command).toBe(COMMANDS.CONNECT_MCP);
      expect(mcpItem.text).toContain('$(error)');
      expect(mcpItem.color).toEqual({ id: 'statusBarItem.errorForeground' });
      expect(mcpItem.tooltip).toContain('Max reconnect attempts reached');
      expect(mcpItem.tooltip).toContain('Click to reconnect');
    });

    it('should allow manual reconnection from error state (click triggers CONNECT_MCP)', () => {
      // After reconnect exhaustion, clicking the status bar should trigger CONNECT_MCP
      manager.updateMcpStatus({
        state: 'error',
        error: new Error('Connection failed after 10 attempts'),
        occurredAt: new Date(),
      });

      const mcpItem = getMcpItem();
      // The command is set to CONNECT_MCP, meaning clicking it triggers manual reconnection
      expect(mcpItem.command).toBe(COMMANDS.CONNECT_MCP);
    });

    it('should recover from error state to connected state after manual reconnect', () => {
      // Simulate exhausted reconnect
      manager.updateMcpStatus({
        state: 'error',
        error: new Error('Max attempts reached'),
        occurredAt: new Date(),
      });
      expect(getMcpItem().command).toBe(COMMANDS.CONNECT_MCP);

      // Simulate successful manual reconnection
      manager.updateMcpStatus({ state: 'connected', connectedAt: new Date() });
      expect(getMcpItem().command).toBe(COMMANDS.DISCONNECT_MCP);
      expect(getMcpItem().color).toBeUndefined();
    });
  });

  describe('Container status bar behavior', () => {
    let manager: StatusBarManager;

    beforeEach(() => {
      manager = StatusBarManager.initialize();
    });

    it('should show VIEW_CONTAINER_LOGS command when container is connected', () => {
      manager.updateContainerStatus({ state: 'connected', connectedAt: new Date() });

      const containerItem = getContainerItem();
      expect(containerItem.command).toBe(COMMANDS.VIEW_CONTAINER_LOGS);
    });

    it('should show START_CONTAINER command when container is disconnected', () => {
      manager.updateContainerStatus({ state: 'disconnected' });

      const containerItem = getContainerItem();
      expect(containerItem.command).toBe(COMMANDS.START_CONTAINER);
    });

    it('should have no command when container is connecting', () => {
      manager.updateContainerStatus({ state: 'connecting', startedAt: new Date() });

      const containerItem = getContainerItem();
      expect(containerItem.command).toBeUndefined();
    });
  });

  describe('updateModeStatus()', () => {
    it('should update mode status bar item text', () => {
      const manager = StatusBarManager.initialize();
      manager.updateModeStatus();
      // Mode status should be updated based on ModeService
    });
  });

  describe('dispose()', () => {
    it('should dispose all status bar items', () => {
      const manager = StatusBarManager.initialize();
      manager.dispose();

      for (const item of createdStatusBarItems) {
        expect(item.dispose).toHaveBeenCalled();
      }
    });

    it('should set instance to null after dispose', () => {
      StatusBarManager.initialize();
      const instance = StatusBarManager.getInstance();
      instance!.dispose();

      expect(StatusBarManager.getInstance()).toBeNull();
    });
  });
});
